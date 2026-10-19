/**
 * ImportEngine.gs - [P1-IMP] Mesin impor massal server (D-IMP-1..8). OTORITAS validasi; hasil parsing klien tidak dipercaya.
 *
 * Modul: pemasukan, pengeluaran, rab, lpj, siswa. Aturan baris = ImportRules.gs (dihasilkan dari _import_rules.js, kode sama
 * dengan klien). Mesin ini hanya: membangun konteks dari data server, menjalankan aturan, dan menulis lewat JALUR TULIS YANG ADA:
 *   pemasukan/pengeluaran -> opCreateIncome / opCreateExpense (opEngineWrite_: opGate_, AllocationGuard, T4, idempotensi
 *                            24_IDEMPOTENCY_LOG, audit engine + aktor);
 *   rab/lpj               -> opRecordBatchLocked_ (RecordGuard T4/LPJ, UNKNOWN_FIELD, audit per baris, penanda periode);
 *   siswa                 -> opMasterUpsert (OP_MASTER_ validasi + tanggal F7, dupKey, audit).
 * Tidak ada jalur tulis alternatif. Transfer antar-akun tidak dibuat. LPJ tidak membuat transaksi; tautan LPJ hanya bila
 * transaksiId diberikan eksplisit di berkas (kandidat = saran saja). RAB impor selalu DIAJUKAN (D-IMP-5); periode eksplisit (D-IMP-6).
 *
 * API publik:
 *   opImportSetup(confirm)    : membuat sheet log aditif 31_IMPOR_JOB, 32_IMPOR_BARIS, 33_IMPOR_TINJAUAN (D-IMP-3) HANYA bila
 *                               dipanggil eksplisit dengan 'BUAT_SHEET_IMPOR'. Tidak pernah otomatis. Audit niat lebih dulu.
 *   opImportPlan(p)           : pratinjau read-only (tidak menulis): kelas per baris, normalisasi, keputusan yang diperlukan,
 *                               kandidat, total sumber, planHash. BENDAHARA saja.
 *   opImportCommit(p)         : konfirmasi 'IMPOR_DATA' + planHash; dihitung ulang di dalam lock (beda -> CONFLICT). Memproses SATU
 *                               potongan (p.mulai, maks IMP_CHUNK_) dari baris terpilih. Baris yang kuncinya sudah tersimpan =
 *                               TIDAK_BERUBAH (idempotensi lintas percobaan & setelah koneksi putus). Log per baris + ringkasan job
 *                               + antrean tinjauan ditulis dalam satu lock bersama audit IMPORT_COMMIT_CHUNK.
 *   opImportStatus(batchId)   : job + hasil per baris (baca).
 *   opImportReviewList(opts)  : antrean tinjauan server (baca).
 *   opImportReviewResolve(p)  : menandai item tinjauan selesai (tidak mengimpor apa pun), beraudit.
 *
 * Idempotensi: kunci baris = H(modul|sourceHash|isi)_n (ImportRules.gs). clientRequestId transaksi = 'imp_<kode>_<kunci>',
 * id record = 'imp_<kode>_<kunci>', id siswa baru = 'imp_sis_<kunci>'. Data yang dibuat batch ini dikeluarkan dari konteks
 * pemeriksaan duplikat/alokasi sehingga planHash stabil di antara potongan.
 *
 * DEPENDENSI: ImportRules.gs, OperationalAPI.gs, RecordEngine.gs, TransactionEngine.gs, SchemaGuard.gs, ObligationEngine.gs.
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var IMP_SHEET_ = { job: '31_IMPOR_JOB', baris: '32_IMPOR_BARIS', tinjau: '33_IMPOR_TINJAUAN' };
var IMP_HEADERS_ = {
  job: ['id', 'modul', 'sourceHash', 'sumberNama', 'sumberJenis', 'planHash', 'status', 'totalBaris', 'dipilih', 'tersimpan', 'tidakBerubah', 'gagal', 'ditinjau',
    'nominalSumber', 'nominalDipilih', 'nominalTersimpan', 'dibuatOleh', 'dibuatAt', 'diperbaruiAt', 'ringkasan'],
  baris: ['id', 'batchId', 'modul', 'kunci', 'hashIsi', 'barisSumber', 'status', 'kode', 'pesan', 'refId', 'nominal', 'sebelum', 'createdAt', 'createdBy'],
  tinjau: ['id', 'batchId', 'modul', 'kunci', 'barisSumber', 'jenis', 'alasan', 'payload', 'status', 'createdAt', 'createdBy', 'resolvedAt', 'resolvedBy', 'keputusan']
};
var IMP_KODE_ = { pemasukan: 'pem', pengeluaran: 'pgl', rab: 'rab', lpj: 'lpj', siswa: 'sis' };
var IMP_TARGET_ = { pemasukan: '05_TRANSAKSI', pengeluaran: '05_TRANSAKSI', rab: '08_ANGGARAN', lpj: '19_LPJ', siswa: '01_SISWA' };
var IMP_RECORD_KEY_ = { rab: 'anggaran', lpj: 'lpj' };
/* [P0-T8] kolom wajib pembacaan konteks; sheet hilang / kolom hilang -> SCHEMA_MISMATCH (pratinjau gagal, tidak ada data kosong pengganti) */
var IMP_READ_REQ_ = { '07_AKUN': ['id', 'nama', 'jenis'], '21_KATEGORI_PENGELUARAN': ['id', 'kategori'], '22_SUBKATEGORI': ['id', 'kategoriId', 'nama'], '20_KATEGORI_PENERIMAAN': ['id', 'kategori'],
  '02_KOMPONEN': ['id', 'nama'], '01_SISWA': ['id', 'nama', 'nis', 'nisn', 'kelas', 'unit', 'tahunAjaran', 'status'], '08_ANGGARAN': ['id', 'periode', 'program', 'kategori', 'unit', 'nominal'], '19_LPJ': ['id', 'tanggal', 'nominal', 'transaksiId'] };
var IMP_META_COLS_ = ['source', 'sourceFile', 'sourceSheet', 'sourceRow', 'importBatchId', 'importDate', 'importUser'];

function impBatchId_(modul, src) { return 'impb_' + IMP_KODE_[modul] + '_' + impHash_(modul + '|' + src).slice(0, 20); }
function impRefId_(modul, kunci) { return 'imp_' + IMP_KODE_[modul] + '_' + kunci; }
function impLogsReady_() { return !!(ss_().getSheetByName(IMP_SHEET_.job) && ss_().getSheetByName(IMP_SHEET_.baris) && ss_().getSheetByName(IMP_SHEET_.tinjau)); }
function impErr_(code, msg) { var e = new Error(msg); e.code = code; return e; }

function opImportSetup(confirm) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (confirm !== 'BUAT_SHEET_IMPOR') return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (BUAT_SHEET_IMPOR)', 'confirm');
  try {
    return withLock_(function () {
      var ss = ss_(), buat = [];
      Object.keys(IMP_SHEET_).forEach(function (k) {
        if (ss.getSheetByName(IMP_SHEET_[k])) sgHeaderModel_(IMP_SHEET_[k], IMP_HEADERS_[k]); // header berbeda -> SCHEMA_MISMATCH (tidak ditimpa)
        else buat.push(k);
      });
      if (!buat.length) { var same = okResult_('Sheet impor sudah ada', { dibuat: [] }); same.data.unchanged = true; return same; }
      try { opAuditBulk_(buat.map(function (k) { return ['SCHEMA_CREATE_SHEET', null, { sheet: IMP_SHEET_[k], headers: IMP_HEADERS_[k] }, IMP_SHEET_[k]]; }), g.identity.email); }
      catch (e) { return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; sheet impor tidak dibuat', null); }
      var dibuat = [];
      try {
        buat.forEach(function (k) { var sh = ss.insertSheet(IMP_SHEET_[k]); sh.getRange(1, 1, 1, IMP_HEADERS_[k].length).setValues([IMP_HEADERS_[k]]); dibuat.push(IMP_SHEET_[k]); });
      } catch (e) {
        try { opAuditBulk_([['SCHEMA_CREATE_SHEET_FAILED', null, { dibuat: dibuat, error: String(e && e.message || e) }, 'impor']], g.identity.email); } catch (e2) { /* dilaporkan lewat hasil */ }
        return errResult_('WRITE_FAILED', 'Gagal membuat sheet impor (sudah dibuat: ' + dibuat.join(', ') + ')', null);
      }
      return okResult_('Sheet impor dibuat', { dibuat: dibuat });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menyiapkan sheet impor'); }
}

/* ---------- validasi masukan ---------- */
function impInputError_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  if (IMP_MODUL_.indexOf(p.modul) === -1) return errResult_('VALIDATION_ERROR', 'modul tidak dikenal (pemasukan|pengeluaran|rab|lpj|siswa)', 'modul');
  if (!Array.isArray(p.baris) || !p.baris.length) return errResult_('VALIDATION_ERROR', 'baris wajib array tidak kosong', 'baris');
  if (p.baris.length > IMP_MAX_ROWS_) return errResult_('VALIDATION_ERROR', 'maksimal ' + IMP_MAX_ROWS_ + ' baris per impor', 'baris');
  var allowed = IMP_FIELDS_[p.modul];
  for (var i = 0; i < p.baris.length; i++) {
    var r = p.baris[i];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return errResult_('VALIDATION_ERROR', 'baris[' + i + '] wajib objek', 'baris');
    var bad = Object.keys(r).filter(function (k) { return k !== '_baris' && allowed.indexOf(k) === -1 && !(p.modul === 'pemasukan' && /^komponen:[A-Za-z0-9_\-]{1,100}$/.test(k)); });
    if (bad.length) return errResult_('VALIDATION_ERROR', 'baris[' + i + ']: kolom tidak dikenal untuk ' + p.modul + ': ' + bad.join(', '), 'baris');
    var big = Object.keys(r).filter(function (k) { return String(r[k] === null || r[k] === undefined ? '' : r[k]).length > 5000; });
    if (big.length) return errResult_('VALUE_TOO_LARGE', 'baris[' + i + ']: nilai terlalu panjang: ' + big.join(', '), 'baris');
  }
  if (p.keputusan !== undefined && (typeof p.keputusan !== 'object' || Array.isArray(p.keputusan) || p.keputusan === null)) return errResult_('VALIDATION_ERROR', 'keputusan wajib objek {indeks: {...}}', 'keputusan');
  if (p.pilih !== undefined && p.pilih !== null && !Array.isArray(p.pilih)) return errResult_('VALIDATION_ERROR', 'pilih wajib array indeks', 'pilih');
  return null;
}
function impRowsOf_(sheet, req) { var m = sgModel_(sheet, req || ['id']); return m ? m.values.map(function (r) { var o = sgObj_(m, r); return opJsonSafe_(o); }) : null; }

/* ---------- konteks server (data milik batch ini dikeluarkan) ---------- */
function impContext_(modul, rows, src, batchId) {
  var keys = impKeys_(modul, rows, src), own = {}, kunciSet = {};
  keys.forEach(function (k) { kunciSet[k.kunci] = true; own[impRefId_(modul, k.kunci)] = k.kunci; });
  var D = { kolom: {}, sudahTersimpan: {}, riwayatIsi: {} }, act = function (x) { return !opStr_(x.archivedAt); };
  var mstr = function (s) { var rr = impRowsOf_(s, IMP_READ_REQ_[s]); if (!rr) throw impErr_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan: ' + s); return rr.filter(act); }; // gagal tertutup (T8)
  D.akun = mstr('07_AKUN').map(function (a) { return { id: opStr_(a.id), nama: opStr_(a.nama), jenis: opStr_(a.jenis) }; });
  D.kategoriPengeluaran = mstr('21_KATEGORI_PENGELUARAN').map(function (k) { return { id: opStr_(k.id), kategori: opStr_(k.kategori), status: opStr_(k.status) }; });
  D.subkategori = mstr('22_SUBKATEGORI').map(function (k) { return { id: opStr_(k.id), kategoriId: opStr_(k.kategoriId), nama: opStr_(k.nama), status: opStr_(k.status) }; });
  D.kategoriPenerimaan = mstr('20_KATEGORI_PENERIMAAN').map(function (k) { return { id: opStr_(k.id), kategori: opStr_(k.kategori), status: opStr_(k.status) }; });
  D.komponen = mstr('02_KOMPONEN').map(function (k) { return { id: opStr_(k.id), nama: opStr_(k.nama), unit: opStr_(k.unit), status: opStr_(k.status) }; });
  var set = {}; (impRowsOf_('15_SETTINGS', ['key', 'value']) || []).forEach(function (r) { set[opStr_(r.key)] = opStr_(r.value); });
  D.tahunAjaranAktif = set.tahunAjaranAktif || '';
  var tgt = sgHeaderModel_(IMP_TARGET_[modul], ['id']);
  if (!tgt) throw impErr_('SCHEMA_MISMATCH', 'Sheet tujuan tidak ditemukan: ' + IMP_TARGET_[modul]);
  D.kolom[modul] = tgt.live.slice();
  // log impor: riwayat isi dari berkas LAIN + baris batch ini yang sudah tersimpan (siswa diperbarui: nilai sebelum)
  var sebelum = {};
  var lg = sgModel_(IMP_SHEET_.baris, IMP_HEADERS_.baris);
  (lg ? lg.values : []).forEach(function (r) {
    var o = sgObj_(lg, r);
    if (opStr_(o.modul) !== modul || opStr_(o.status) !== 'TERSIMPAN') return;
    if (opStr_(o.batchId) === batchId) { if (kunciSet[opStr_(o.kunci)]) { D.sudahTersimpan[opStr_(o.kunci)] = true; if (opStr_(o.sebelum)) sebelum[opStr_(o.refId)] = JSON.parse(opStr_(o.sebelum)); } }
    else { var h = opStr_(o.hashIsi); D.riwayatIsi[h] = D.riwayatIsi[h] || []; if (D.riwayatIsi[h].indexOf(opStr_(o.batchId)) === -1) D.riwayatIsi[h].push(opStr_(o.batchId)); }
  });
  // siswa
  var ownSiswa = {};
  D.siswa = mstr('01_SISWA').filter(function (s) {
    if (own[opStr_(s.id)]) { ownSiswa[opStr_(s.id)] = true; D.sudahTersimpan[own[opStr_(s.id)]] = true; return false; }
    return true;
  }).map(function (s) {
    var b = sebelum[opStr_(s.id)], o = Object.assign({}, s, b || {});
    return { id: opStr_(o.id), nama: opStr_(o.nama), nis: opStr_(o.nis), nisn: opStr_(o.nisn), kelas: opStr_(o.kelas), unit: opStr_(o.unit), tahunAjaran: opStr_(o.tahunAjaran),
      tanggalMasuk: opStr_(o.tanggalMasuk), tanggalKeluar: opStr_(o.tanggalKeluar), jenisKelamin: opStr_(o.jenisKelamin), namaWali: opStr_(o.namaWali), kontakWali: opStr_(o.kontakWali), alamat: opStr_(o.alamat), status: opStr_(o.status) };
  });
  // transaksi: milik batch ini dikenali lewat 24_IDEMPOTENCY_LOG (tahan putus koneksi sebelum log impor ditulis)
  var ownTrx = {};
  if (modul === 'pemasukan' || modul === 'pengeluaran') {
    var im = sgModel_(SHT_IDEMPOTENCY, ['clientRequestId', 'resultRefId']);
    (im ? im.values : []).forEach(function (r) { var c = opStr_(r[im.idx.clientRequestId]); if (own[c]) { ownTrx[opStr_(r[im.idx.resultRefId])] = true; D.sudahTersimpan[own[c]] = true; } });
  }
  D.transaksi = readTrxRows_().filter(function (t) { return !ownTrx[String(t.id)]; }).map(function (t) { return opJsonSafe_(t); });
  if (modul === 'rab') D.anggaran = mstr('08_ANGGARAN').filter(function (a) { if (own[opStr_(a.id)]) { D.sudahTersimpan[own[opStr_(a.id)]] = true; return false; } return true; }).map(function (a) { a.periode = opStr_(a.periode); return a; });
  if (modul === 'lpj' || modul === 'pengeluaran') D.lpj = mstr('19_LPJ').filter(function (l) { if (modul === 'lpj' && own[opStr_(l.id)]) { D.sudahTersimpan[own[opStr_(l.id)]] = true; return false; } return true; });
  if (modul === 'pemasukan') {
    OBL_CTX_ = oblLoadContext_();
    OBL_CTX_.alokasi = OBL_CTX_.alokasi.filter(function (a) { return !ownTrx[a.transaksiId]; });
    var memo = {};
    D.kewajiban = function (sid) {
      if (!memo[sid]) memo[sid] = kewajibanForSiswa(sid).map(function (o) { return { key: o.key, komponenId: o.komponenId, periode: o.periode, sisa: sisaObligation(o), tagihanId: o.tagihanId || '' }; });
      return memo[sid];
    };
  }
  return D;
}
function impPlanCore_(p) {
  var rows = p.baris.map(function (r, i) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = k === '_baris' ? Number(r[k]) || i + 1 : (r[k] === null || r[k] === undefined ? '' : (typeof r[k] === 'number' ? r[k] : String(r[k]))); }); if (!o._baris) o._baris = i + 1; return o; });
  var src = impSourceHash_(p.modul, rows), batchId = impBatchId_(p.modul, src);
  try {
    var D = impContext_(p.modul, rows, src, batchId);
    var plan = impPlan_(p.modul, rows, { sourceHash: src, keputusan: p.keputusan || {}, pilih: Array.isArray(p.pilih) ? p.pilih : null, modeSiswa: p.modeSiswa === 'TAMBAH_PERBARUI' ? 'TAMBAH_PERBARUI' : 'TAMBAH' }, D);
  } finally { OBL_CTX_ = null; }
  var cols = D.kolom[p.modul], tidakAda = {};
  if (p.modul !== 'pemasukan' && p.modul !== 'pengeluaran') plan.rows.forEach(function (x) { Object.keys(x.payload || {}).forEach(function (f) { if (opStr_(x.payload[f]) !== '' && cols.indexOf(f) === -1) tidakAda[f] = (tidakAda[f] || 0) + 1; }); });
  plan.kolomTidakTersedia = tidakAda;
  plan.batchId = batchId;
  plan.planHash = impHash_([p.modul, src, p.modeSiswa || '', impCanon_(p.keputusan || {}), impCanon_(Array.isArray(p.pilih) ? p.pilih : null), impCanon_(cols),
    impCanon_(plan.rows.map(function (x) { return [x.kunci, x.kelas, x.dipilih, x.payload, x.targetId || '']; }))].join('#'));
  plan.ukuranPotongan = IMP_CHUNK_[p.modul];
  plan.logSiap = impLogsReady_();
  plan.rowsInput = rows;
  return plan;
}
function opImportPlan(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var ie = impInputError_(p); if (ie) return ie;
  try {
    var plan = impPlanCore_(p); delete plan.rowsInput;
    return opJsonSafe_(okResult_('Pratinjau impor (read-only; tidak ada data yang diubah)', plan));
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal menyusun pratinjau impor'); }
}

/* ---------- penulisan baris (jalur yang ada) ---------- */
function impMetaRow_(modul, x, raw, p, g, batchId, cols, now) {
  var row = {}, keep = {};
  Object.keys(x.payload).forEach(function (f) { if (cols.indexOf(f) !== -1) { if (opStr_(x.payload[f]) !== '' || f === 'transaksiId') row[f] = x.payload[f]; } else if (opStr_(x.payload[f]) !== '') keep[f] = x.payload[f]; });
  var sr = JSON.stringify({ baris: x.baris, isi: impRawIsi_(modul, raw), kolomTidakTersedia: keep, meta: x._meta || null, normalisasi: x.normalisasi });
  var meta = { source: modul === 'rab' ? 'RAB_IMPORT' : undefined, sourceFile: opStr_(p.sumber && p.sumber.nama).slice(0, 200), sourceSheet: opStr_(p.sumber && p.sumber.jenis).slice(0, 40),
    sourceRow: sr.length > 45000 ? sr.slice(0, 45000) : sr, importBatchId: batchId, importDate: now, importUser: g.identity.email };
  IMP_META_COLS_.forEach(function (c) { if (meta[c] !== undefined && cols.indexOf(c) !== -1) row[c] = meta[c]; });
  return row;
}
function impWriteRecords_(g, p, plan, sel, batchId) {
  var key = IMP_RECORD_KEY_[p.modul], cfg = OP_RECORDS_[key], cols = plan.kolomLive, now = new Date().toISOString(), hasil = [], ops = [];
  sel.forEach(function (x) {
    if (x.sudahTersimpan) { hasil.push({ x: x, status: 'TIDAK_BERUBAH', kode: 'UNCHANGED', refId: impRefId_(p.modul, x.kunci) }); return; }
    ops.push({ op: 'upsert', id: impRefId_(p.modul, x.kunci), row: impMetaRow_(p.modul, x, plan.rowsInput[x.i], p, g, batchId, cols, now), _x: x });
  });
  if (!ops.length) return { hasil: hasil };
  var r = opRecordBatchLocked_(g, cfg, key, ops.map(function (o) { return { op: o.op, id: o.id, row: o.row }; }),
    [['IMPORT_COMMIT_CHUNK', null, { batchId: batchId, modul: p.modul, planHash: plan.planHash, jumlah: ops.length }, batchId]]);
  if (!r.ok) return { err: r };
  r.data.results.forEach(function (res, k) {
    var x = ops[k]._x, ok = res.code === 'CREATED' || res.code === 'UPDATED';
    hasil.push({ x: x, status: ok ? 'TERSIMPAN' : res.code === 'UNCHANGED' ? 'TIDAK_BERUBAH' : 'GAGAL', kode: res.code, pesan: res.message || '', refId: res.id });
  });
  return { hasil: hasil, auditDitulis: true };
}
function impWriteOne_(p, x, sebelumMap) {
  if (p.modul === 'pemasukan' || p.modul === 'pengeluaran') {
    var pl = Object.assign({}, x.payload, { clientRequestId: impRefId_(p.modul, x.kunci) });
    var r = p.modul === 'pemasukan' ? opCreateIncome(pl) : opCreateExpense(pl);
    var replay = r && r.ok && /idempotent replay/.test(String(r.message || ''));
    return { status: r && r.ok ? (replay ? 'TIDAK_BERUBAH' : 'TERSIMPAN') : 'GAGAL', kode: r ? r.code : 'ERROR', pesan: r ? r.message || '' : '', refId: r && r.data ? r.data.id || '' : '' };
  }
  // siswa
  var rr;
  if (x.targetId) {
    var cur = null; (impRowsOf_('01_SISWA') || []).forEach(function (s) { if (opStr_(s.id) === x.targetId) cur = s; });
    if (cur) { var b = {}; Object.keys(x.payload).forEach(function (f) { b[f] = opStr_(cur[f]); }); sebelumMap[x.kunci] = b; }
    rr = opMasterUpsert('siswa', Object.assign({ id: x.targetId }, x.payload));
  } else rr = opMasterUpsert('siswa', x.payload, 'imp_sis_' + x.kunci);
  var same = rr && rr.ok && rr.data && rr.data.unchanged === true;
  return { status: rr && rr.ok ? (same ? 'TIDAK_BERUBAH' : 'TERSIMPAN') : 'GAGAL', kode: rr ? rr.code : 'ERROR', pesan: rr ? rr.message || '' : '', refId: rr && rr.data ? rr.data.id || '' : (x.targetId || '') };
}
/* Upsert baris log/job/tinjauan + audit dalam SATU lock (dipanggil di dalam withLock_). Audit gagal -> log dipulihkan. */
function impWriteLogs_(g, p, plan, hasil, batchId, sebelumMap, auditSudah) {
  var now = new Date().toISOString(), audits = [], touched = [];
  var upsert = function (sheet, headers, objs) {
    var m = sgModel_(sheet, headers), byId = {}, app = [], start = m.lastRow + 1;
    m.values.forEach(function (r, i) { byId[String(r[m.idx.id])] = i; });
    objs.forEach(function (o) {
      if (Object.prototype.hasOwnProperty.call(byId, o.id)) {
        var i = byId[o.id], cur = sgObj_(m, m.values[i]);
        if (o._keep && o._keep(cur)) return;
        var nr = sgRowArray_(m, o.data, m.values[i]); touched.push({ sh: m.sh, rowNum: i + 2, orig: m.values[i].slice(), n: m.live.length });
        m.sh.getRange(i + 2, 1, 1, m.live.length).setValues([nr]); m.values[i] = nr;
      } else if (!o._onlyExisting) { var row = sgRowArray_(m, Object.assign({ id: o.id }, o.data)); app.push(row); byId[o.id] = m.values.length + app.length - 1; }
    });
    if (app.length) { m.sh.getRange(start, 1, app.length, m.live.length).setValues(app); touched.push({ sh: m.sh, appendFrom: start, count: app.length }); }
    return m;
  };
  upsert(IMP_SHEET_.baris, IMP_HEADERS_.baris, hasil.map(function (h) {
    return { id: batchId + '_' + h.x.kunci, _keep: function (cur) { return opStr_(cur.status) === 'TERSIMPAN'; },
      data: { batchId: batchId, modul: p.modul, kunci: h.x.kunci, hashIsi: h.x.hashIsi, barisSumber: h.x.baris, status: h.status, kode: opStr_(h.kode), pesan: opStr_(h.pesan).slice(0, 2000),
        refId: opStr_(h.refId), nominal: h.x.nominal === null ? '' : h.x.nominal, sebelum: sebelumMap[h.x.kunci] ? JSON.stringify(sebelumMap[h.x.kunci]) : '', createdAt: now, createdBy: g.identity.email } };
  }));
  // antrean tinjauan (terpisah dari log): DUPLIKAT / PERLU_KEPUTUSAN, LPJ tersimpan tanpa tautan, baris gagal disimpan
  var items = [];
  plan.rows.forEach(function (x) {
    if (x.kelas === 'DUPLIKAT' || x.kelas === 'PERLU_KEPUTUSAN') items.push({ x: x, jenis: x.kelas, alasan: x.pesan.concat(x.keputusanPerlu.map(function (k) { return k.label; })).join('; ') });
  });
  hasil.forEach(function (h) {
    if (h.status === 'GAGAL') items.push({ x: h.x, jenis: 'GAGAL_SIMPAN', alasan: opStr_(h.kode) + ': ' + opStr_(h.pesan) });
    if (p.modul === 'lpj' && h.status === 'TERSIMPAN' && h.x._meta && h.x._meta.statusTautan === 'TANPA_TAUTAN') items.push({ x: h.x, jenis: 'LPJ_TANPA_TAUTAN', alasan: 'PERLU TRANSAKSI / PERLU TAUTAN (lpjId ' + h.refId + ')', refId: h.refId });
  });
  var tutup = [];
  hasil.forEach(function (h) {
    if (h.status !== 'TERSIMPAN' && h.status !== 'TIDAK_BERUBAH') return;
    ['DUPLIKAT', 'PERLU_KEPUTUSAN', 'GAGAL_SIMPAN'].forEach(function (j) {
      tutup.push({ id: 'it_' + batchId + '_' + h.x.kunci + '_' + j, _onlyExisting: true, _keep: function (cur) { return opStr_(cur.status) !== 'TERBUKA'; },
        data: { status: 'SELESAI', resolvedAt: now, resolvedBy: g.identity.email, keputusan: 'DIIMPOR (baris tersimpan pada potongan berikutnya)' } });
    });
  });
  upsert(IMP_SHEET_.tinjau, IMP_HEADERS_.tinjau, tutup.concat(items.filter(function (it) { return !hasil.some(function (h) { return h.x.kunci === it.x.kunci && (h.status === 'TERSIMPAN' || h.status === 'TIDAK_BERUBAH') && it.jenis !== 'LPJ_TANPA_TAUTAN'; }); }).map(function (it) {
    return { id: 'it_' + batchId + '_' + it.x.kunci + '_' + it.jenis, _keep: function (cur) { return opStr_(cur.status) !== 'TERBUKA'; },
      data: { batchId: batchId, modul: p.modul, kunci: it.x.kunci, barisSumber: it.x.baris, jenis: it.jenis, alasan: it.alasan.slice(0, 2000),
        payload: JSON.stringify({ nilai: it.x.nilai, kandidat: it.x.kandidat, refId: it.refId || '' }).slice(0, 45000), status: 'TERBUKA', createdAt: now, createdBy: g.identity.email } };
  })));
  // ringkasan job dihitung ulang dari log batch
  var lg = sgModel_(IMP_SHEET_.baris, IMP_HEADERS_.baris), cnt = { TERSIMPAN: 0, TIDAK_BERUBAH: 0, GAGAL: 0 }, nomT = 0, kunciLog = {};
  lg.values.forEach(function (r) { var o = sgObj_(lg, r); if (opStr_(o.batchId) !== batchId) return; cnt[opStr_(o.status)] = (cnt[opStr_(o.status)] || 0) + 1; kunciLog[opStr_(o.kunci)] = opStr_(o.status); if (opStr_(o.status) === 'TERSIMPAN') nomT += Number(o.nominal) || 0; });
  var dipilih = plan.rows.filter(function (x) { return x.dipilih; });
  var selesai = dipilih.every(function (x) { return kunciLog[x.kunci] === 'TERSIMPAN' || kunciLog[x.kunci] === 'TIDAK_BERUBAH'; });
  var jm = sgModel_(IMP_SHEET_.job, IMP_HEADERS_.job), jobPrev = null;
  jm.values.forEach(function (r) { if (String(r[jm.idx.id]) === batchId) jobPrev = sgObj_(jm, r); });
  var status = selesai ? 'SELESAI' : (cnt.GAGAL ? 'SEBAGIAN_GAGAL' : 'BERJALAN');
  var job = { modul: p.modul, sourceHash: plan.sourceHash, sumberNama: opStr_(p.sumber && p.sumber.nama).slice(0, 200), sumberJenis: opStr_(p.sumber && p.sumber.jenis).slice(0, 40), planHash: plan.planHash,
    status: status, totalBaris: plan.rows.length, dipilih: dipilih.length, tersimpan: cnt.TERSIMPAN, tidakBerubah: cnt.TIDAK_BERUBAH, gagal: cnt.GAGAL, ditinjau: items.length,
    nominalSumber: plan.total.nominalSumber, nominalDipilih: plan.total.nominalDipilih, nominalTersimpan: nomT, dibuatOleh: jobPrev ? jobPrev.dibuatOleh : g.identity.email,
    dibuatAt: jobPrev ? jobPrev.dibuatAt : now, diperbaruiAt: now, ringkasan: JSON.stringify(plan.ringkasan) };
  upsert(IMP_SHEET_.job, IMP_HEADERS_.job, [{ id: batchId, data: job }]);
  if (!auditSudah) audits.push(['IMPORT_COMMIT_CHUNK', null, { batchId: batchId, modul: p.modul, planHash: plan.planHash, hasil: hasil.map(function (h) { return [h.x.kunci, h.status, opStr_(h.refId)]; }) }, batchId]);
  if (selesai && (!jobPrev || opStr_(jobPrev.status) !== 'SELESAI')) audits.push(['IMPORT_DONE', null, { batchId: batchId, modul: p.modul, tersimpan: cnt.TERSIMPAN, tidakBerubah: cnt.TIDAK_BERUBAH, gagal: cnt.GAGAL, nominalSumber: plan.total.nominalSumber, nominalTersimpan: nomT }, batchId]);
  try { opAuditBulk_(audits, g.identity.email); } catch (e) {
    try { touched.slice().reverse().forEach(function (t) { if (t.appendFrom) sgUndoAppend_(t.sh, t.appendFrom, t.count); else t.sh.getRange(t.rowNum, 1, 1, t.n).setValues([t.orig]); }); } catch (re) { return { ok: false, code: 'ROLLBACK_FAILED' }; }
    return { ok: false, code: 'AUDIT_FAILED' };
  }
  return { ok: true, job: job };
}
function opImportCommit(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var ie = impInputError_(p); if (ie) return ie;
  if (p.konfirmasi !== 'IMPOR_DATA') return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (IMPOR_DATA)', 'konfirmasi');
  if (!opStr_(p.planHash)) return errResult_('VALIDATION_ERROR', 'planHash dari pratinjau wajib diisi', 'planHash');
  var mulai = Math.max(0, Number(p.mulai) || 0), uk = Math.min(IMP_CHUNK_[p.modul], Math.max(1, Number(p.ukuran) || IMP_CHUNK_[p.modul]));
  try {
    if (!impLogsReady_()) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Sheet log impor belum ada - jalankan opImportSetup (eksplisit) di salinan uji lebih dulu', null);
    var plan, sel, batchId, written = null;
    var r0 = withLock_(function () {
      plan = impPlanCore_(p);
      if (plan.planHash !== opStr_(p.planHash)) return errResult_('CONFLICT', 'Data server, header sheet, atau isi impor berubah sejak pratinjau; jalankan pratinjau ulang', 'planHash');
      batchId = plan.batchId;
      plan.kolomLive = sgHeaderModel_(IMP_TARGET_[p.modul], ['id']).live;
      sel = plan.rows.filter(function (x) { return x.dipilih; }).slice(mulai, mulai + uk);
      if (IMP_RECORD_KEY_[p.modul]) { // rab/lpj: tulis + audit di dalam lock yang sama dengan pemeriksaan planHash
        written = impWriteRecords_(g, p, plan, sel, batchId);
        if (written.err) return written.err;
      }
      return null;
    });
    if (r0) return r0;
    var sebelumMap = {};
    if (!written) {
      written = { hasil: sel.map(function (x) {
        if (x.sudahTersimpan) return { x: x, status: 'TIDAK_BERUBAH', kode: 'UNCHANGED', refId: '' };
        var w = impWriteOne_(p, x, sebelumMap); return { x: x, status: w.status, kode: w.kode, pesan: w.pesan, refId: w.refId };
      }) };
    }
    var lr = withLock_(function () { return impWriteLogs_(g, p, plan, written.hasil, batchId, sebelumMap, !!written.auditDitulis); });
    var totalDipilih = plan.rows.filter(function (x) { return x.dipilih; }).length, next = mulai + uk < totalDipilih ? mulai + uk : null;
    return opJsonSafe_(okResult_('Potongan impor diproses', {
      batchId: batchId, planHash: plan.planHash, mulai: mulai, ukuran: uk, berikut: next, totalDipilih: totalDipilih,
      hasil: written.hasil.map(function (h) { return { i: h.x.i, baris: h.x.baris, kunci: h.x.kunci, status: h.status, kode: opStr_(h.kode), pesan: opStr_(h.pesan), refId: opStr_(h.refId), nominal: h.x.nominal }; }),
      logStatus: lr && lr.ok ? 'OK' : 'GAGAL' + (lr && lr.code ? ' (' + lr.code + ')' : ''), job: lr && lr.ok ? lr.job : null }));
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal memproses impor'); }
}

/* ---------- baca & tinjauan ---------- */
function opImportStatus(batchId) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  batchId = opStr_(batchId); if (!batchId) return errResult_('VALIDATION_ERROR', 'batchId wajib', 'batchId');
  try {
    if (!impLogsReady_()) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Sheet log impor belum ada', null);
    var job = (impRowsOf_(IMP_SHEET_.job) || []).filter(function (j) { return opStr_(j.id) === batchId; })[0] || null;
    var rows = (impRowsOf_(IMP_SHEET_.baris) || []).filter(function (r) { return opStr_(r.batchId) === batchId; });
    return okResult_('OK', { job: job, baris: rows });
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca status impor'); }
}
function opImportReviewList(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    if (!impLogsReady_()) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Sheet log impor belum ada', null);
    var items = (impRowsOf_(IMP_SHEET_.tinjau) || []).filter(function (t) { return (opts.semua || opStr_(t.status) === 'TERBUKA') && (!opts.modul || opStr_(t.modul) === opts.modul); });
    return okResult_('OK', { items: items, total: items.length });
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca antrean tinjauan impor'); }
}
function opImportReviewResolve(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object') return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  var id = opStr_(p.id), kep = opStr_(p.keputusan);
  if (['DIABAIKAN', 'DISELESAIKAN_MANUAL', 'DIIMPOR_ULANG'].indexOf(kep) === -1) return errResult_('VALIDATION_ERROR', 'keputusan: DIABAIKAN | DISELESAIKAN_MANUAL | DIIMPOR_ULANG', 'keputusan');
  try {
    return withLock_(function () {
      var m = sgModel_(IMP_SHEET_.tinjau, IMP_HEADERS_.tinjau);
      if (!m) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Sheet tinjauan impor belum ada', null);
      var i = -1; m.values.forEach(function (r, k) { if (String(r[m.idx.id]) === id) i = k; });
      if (i < 0) return errResult_('NOT_FOUND', 'Item tinjauan tidak ditemukan', 'id');
      var cur = sgObj_(m, m.values[i]);
      if (opStr_(cur.status) !== 'TERBUKA') { var same = okResult_('Item sudah diselesaikan', opJsonSafe_(cur)); same.data.unchanged = true; return same; }
      var now = new Date().toISOString(), orig = m.values[i].slice();
      var nr = sgRowArray_(m, { status: 'SELESAI', resolvedAt: now, resolvedBy: g.identity.email, keputusan: kep + (opStr_(p.catatan) ? ': ' + opStr_(p.catatan).slice(0, 500) : '') }, orig);
      m.sh.getRange(i + 2, 1, 1, m.live.length).setValues([nr]);
      try { opAuditBulk_([['IMPORT_REVIEW_RESOLVE', { id: id, status: 'TERBUKA' }, { id: id, status: 'SELESAI', keputusan: kep }, id]], g.identity.email); } catch (e) {
        m.sh.getRange(i + 2, 1, 1, m.live.length).setValues([orig]);
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; item tinjauan tidak diubah', null);
      }
      return okResult_('Item tinjauan diselesaikan (tidak ada data yang diimpor)', { id: id, keputusan: kep });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menyelesaikan item tinjauan'); }
}
