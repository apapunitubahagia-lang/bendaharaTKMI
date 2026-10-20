const fs = require('fs');
const OUT = require('./paths').OUT;
const G = require('./paths').G;
const AB = require('./paths').AB;
const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8').replace(/\r/g, '');
const js = html.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];

// ---- ekstraktor fungsi top-level dengan pencocokan kurung yang sadar string/komentar ----
function extractFn(name) {
  const re = new RegExp('^function ' + name + '\\(', 'm'); const m = re.exec(js);
  if (!m) throw new Error('fungsi tidak ada di HTML: ' + name);
  let i = js.indexOf('{', js.indexOf(')', m.index)), depth = 0, q = null;
  for (let j = i; j < js.length; j++) {
    const ch = js[j], nx = js[j + 1];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { j = js.indexOf('\n', j); continue; }
    if (ch === '/' && nx === '*') { j = js.indexOf('*/', j) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return js.slice(m.index, j + 1); }
  }
  throw new Error('kurung tidak seimbang: ' + name);
}
const OBL_FNS = ['BULAN_ID_LIST', 'todayISO', 'tahunAjaranStartYear', 'parsePeriodeLabel', 'periodeLabelFromYM', 'enumeratePeriodesBulanan', 'komponenApplicableForUnit', 'tingkatFromKelas', 'tarifFor', 'tarifRowFor', 'cateringHariFor', 'pendaftaranStatusFor', 'komponenSasaranOk', 'komponenDigantikan',
  'keringananPotonganFor', 'kewajibanSatuBaris', 'kewajibanForSiswa', 'allObligationsAllSiswa', 'resolveObligationMatch', 'alokasiTerbayar', 'sisaObligation', 'statusObligation'];
const extracted = OBL_FNS.map(extractFn);
// pastikan tidak ada ketergantungan tersembunyi pada fungsi HTML lain
const allTop = new Set((js.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(l => l.replace(/^function\s+/, '')));
const have = new Set(OBL_FNS);
const hidden = new Set();
extracted.forEach((src, i) => { const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); (body.match(/\b[A-Za-z_$][\w$]*(?=\s*\()/g) || []).forEach(id => { if (allTop.has(id) && !have.has(id)) hidden.add(OBL_FNS[i] + ' -> ' + id); }); });
if (hidden.size) throw new Error('ketergantungan tersembunyi: ' + [...hidden].join(', '));

const oblGs = `/**
 * ObligationEngine.gs  -  *** DIHASILKAN OTOMATIS dari Bendahara_V2.html - JANGAN DIEDIT TANGAN ***
 * Logika kewajiban (04_KEWAJIBAN) dipindahkan ke server dengan MENYALIN fungsi aslinya apa adanya
 * (bukan implementasi ulang), sehingga hitungan server == hitungan klien untuk data yang sama.
 * Data dibaca dari Sheets lewat shim di bawah (bentuk objek sama dengan model klien).
 * Fungsi publik: opObligations(opts), opObligationSnapshot(periode).
 * STATUS: diverifikasi lewat tes diferensial sandbox (klien vs server). BELUM dijalankan di Apps Script sungguhan.
 */
${extracted.join('\n')}

// ---- SHIM data (server) ----
var OBL_CTX_ = null;
var Store = {
  loadSettings: function () { return OBL_CTX_.settings; },
  loadTagihan: function () { return OBL_CTX_.tagihan; },
  loadKeringananAssignment: function () { return OBL_CTX_.assign; },
  loadCateringHari: function () { return OBL_CTX_.cateringHari; },
  loadPendaftaranStatus: function () { return OBL_CTX_.pendaftaran; }
};
var MasterAPI = {
  students: function () { return OBL_CTX_.students; },
  components: function () { return OBL_CTX_.components; },
  tariffs: function () { return OBL_CTX_.tariffs; }
};
var OperationalAPI = { alokasi: function () { return OBL_CTX_.alokasi; } };

function oblS_(v) { return (v === null || v === undefined) ? '' : String(v); }
function oblN_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function oblJson_(s, fb) { try { var v = JSON.parse(s); return v === null || v === undefined ? fb : v; } catch (e) { return fb; } }
function oblBlob_(map, name, fb) {
  var n = oblN_(map['blob.' + name + '.n']), parts = [];
  if (fb === undefined) fb = [];
  for (var i = 0; i < n; i++) parts.push(oblS_(map['blob.' + name + '.' + i]));
  return n ? oblJson_(parts.join(''), fb) : fb;
}
function oblLoadContext_() {
  var mk = function (sheet) { var m = opSheetModel_(sheet); return m ? m.rows.map(function (r) { return opJsonSafe_(opRowObj_(m.live, r)); }).filter(function (o) { return !o.archivedAt; }) : []; };
  var map = {}; mk('15_SETTINGS').forEach(function (r) { map[oblS_(r.key)] = r.value; });
  var now = new Date();
  var settings = {
    periodeAktif: oblS_(map.periodeAktif) || (BULAN_ID_LIST()[now.getMonth()] + ' ' + now.getFullYear()),
    tahunAjaranAktif: oblS_(map.tahunAjaranAktif) || (now.getMonth() >= 6 ? now.getFullYear() + '/' + (now.getFullYear() + 1) : (now.getFullYear() - 1) + '/' + now.getFullYear()),
    kebijakanEnrollmentTengahPeriode: oblS_(map.kebijakanEnrollmentTengahPeriode) || 'FULL',
    keringananPolicyList: oblJson_(map.keringananPolicyList, [])
  };
  var archTrx = {}; (function () { var m5 = opSheetModel_('05_TRANSAKSI'); if (!m5) return; var ia = m5.live.indexOf('archivedAt'), ii = m5.live.indexOf('id'); if (ia === -1 || ii === -1) return; m5.rows.forEach(function (r) { if (r[ia] !== '' && r[ia] !== null && r[ia] !== undefined) archTrx[String(r[ii])] = true; }); })();
  var komponen = mk('02_KOMPONEN').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), nama: oblS_(r.nama), unit: oblS_(r.unit), frekuensi: oblS_(r.frekuensi), status: oblS_(r.status), aliasOf: oblS_(r.aliasOf) }); });
  var byKomp = {}; komponen.forEach(function (k) { byKomp[k.id] = k; });
  var tagihan = mk('04_KEWAJIBAN').filter(function (r) { return oblS_(r.tagihanId) !== ''; }).map(function (r) {
    var pot = oblS_(r.potongan); var potArr = pot.charAt(0) === '[' ? oblJson_(pot, []) : [];
    return { id: oblS_(r.id), siswaId: oblS_(r.siswaId), komponenId: oblS_(r.komponenId), komponen: (byKomp[oblS_(r.komponenId)] || {}).nama || oblS_(r.komponenId), periode: oblS_(r.periode), tagihanBruto: oblN_(r.bruto), potongan: potArr, tagihanNetto: oblN_(r.netto), jatuhTempo: oblS_(r.jatuhTempo), tahunAjaran: oblS_(r.tahunAjaran), kelas: oblS_(r.kelas), unit: oblS_(r.unit), tarifId: oblS_(r.tarifId), tarifSatuan: oblS_(r.tarifSatuan) === '' ? null : oblN_(r.tarifSatuan), jumlahHari: oblS_(r.jumlahHari) === '' ? null : oblN_(r.jumlahHari) };
  });
  return {
    settings: settings,
    students: mk('01_SISWA').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), nama: oblS_(r.nama), nis: oblS_(r.nis), nisn: oblS_(r.nisn), kelas: oblS_(r.kelas), unit: oblS_(r.unit), tahunAjaran: oblS_(r.tahunAjaran), tanggalMasuk: oblS_(r.tanggalMasuk), tanggalKeluar: oblS_(r.tanggalKeluar), status: oblS_(r.status) || 'Aktif' }); }),
    components: komponen,
    tariffs: mk('03_TARIF').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), komponenId: oblS_(r.komponenId), unit: oblS_(r.unit), kelas: oblS_(r.kelas), tahunAjaran: oblS_(r.tahunAjaran), nominal: oblN_(r.nominal), status: oblS_(r.status) }); }),
    alokasi: mk('06_ALOKASI').filter(function (r) { return !archTrx[oblS_(r.transaksiId)]; }).map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), transaksiId: oblS_(r.transaksiId), siswaId: oblS_(r.siswaId), komponenId: oblS_(r.komponenId), periode: oblS_(r.periode), nominal: oblN_(r.nominal), caraBayar: oblS_(r.caraBayar) || null, tagihanId: oblS_(r.tagihanId) || null }); }),
    tagihan: tagihan,
    assign: oblBlob_(map, 'keringananAssignment'),
    cateringHari: oblBlob_(map, 'cateringHari', {}),
    pendaftaran: oblBlob_(map, 'pendaftaranStatus')
  };
}
function oblPublicRow_(ob) {
  var potTotal = (ob.potongan || []).reduce(function (s, p) { return s + oblN_(p.nominal); }, 0);
  return { key: ob.key, siswaId: ob.siswaId, komponenId: ob.komponenId, komponenNama: ob.komponenNama, periode: ob.periode, bruto: oblN_(ob.bruto), potonganTotal: potTotal, netto: oblN_(ob.netto), terbayar: alokasiTerbayar(ob), sisa: sisaObligation(ob), status: statusObligation(ob), tagihanId: ob.tagihanId || null, tarifId: ob.tarifId || '', tarifSatuan: (ob.tarifSatuan === undefined ? null : ob.tarifSatuan), jumlahHari: (ob.jumlahHari === undefined ? null : ob.jumlahHari), hariBelumDiisi: !!ob.hariBelumDiisi };
}
function opObligations(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    OBL_CTX_ = oblLoadContext_();
    var raw = opts.siswaId ? kewajibanForSiswa(String(opts.siswaId), opts.periode || undefined) : allObligationsAllSiswa(opts.periode || undefined);
    var rows = raw.map(oblPublicRow_);
    var tot = rows.reduce(function (t, r) { t.bruto += r.bruto; t.netto += r.netto; t.terbayar += r.terbayar; t.sisa += r.sisa; return t; }, { bruto: 0, netto: 0, terbayar: 0, sisa: 0 });
    return okResult_('OK', { rows: rows, count: rows.length, totals: tot, periodeAktif: OBL_CTX_.settings.periodeAktif, computedAt: new Date().toISOString() });
  } catch (e) {
    return errResult_('COMPUTE_FAILED', 'Gagal menghitung kewajiban', null);
  } finally { OBL_CTX_ = null; }
}
function oblHash_(s) { var h = 2166136261, h2 = 5381; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0; } return h.toString(16) + h2.toString(16); }
function oblSnapshotRow_(ob, siswa, id, now) {
  return { siswaId: ob.siswaId, komponenId: ob.komponenId, periode: ob.periode, bruto: oblN_(ob.bruto), potongan: JSON.stringify(ob.potongan || []), netto: oblN_(ob.netto), tagihanId: id, computedAt: now,
    tahunAjaran: (siswa && siswa.tahunAjaran) || '', kelas: (siswa && siswa.kelas) || '', unit: (siswa && siswa.unit) || '',
    tarifId: oblS_(ob.tarifId), tarifSatuan: (ob.tarifSatuan === null || ob.tarifSatuan === undefined) ? '' : oblN_(ob.tarifSatuan), jumlahHari: (ob.jumlahHari === null || ob.jumlahHari === undefined) ? '' : oblN_(ob.jumlahHari) };
}
/* Inti pembekuan kewajiban. opts: { periode, semua, komponenIds[], siswaIds[], onlyWithAllocations }.
   Kewajiban yang SUDAH beku (punya tagihanId) tidak pernah disentuh -> tarif/hari yang dipakai tidak berubah walau tarif berubah. */
function oblSnapshotCore_(opts) {
  try {
    OBL_CTX_ = oblLoadContext_();
    var byId = {}; OBL_CTX_.students.forEach(function (s) { byId[s.id] = s; });
    var kSet = null, sSet = null, i;
    if (opts.komponenIds && opts.komponenIds.length) { kSet = {}; opts.komponenIds.forEach(function (k) { kSet[k] = true; }); }
    if (opts.siswaIds && opts.siswaIds.length) { sSet = {}; opts.siswaIds.forEach(function (k) { sSet[k] = true; }); }
    var pool = OBL_CTX_.students.filter(function (s) { return (opts.onlyWithAllocations || (s.status || 'Aktif') === 'Aktif') && (!sSet || sSet[s.id]); });
    var obls = [];
    pool.forEach(function (s) {
      kewajibanForSiswa(s.id, opts.semua ? undefined : opts.periode).forEach(function (ob) {
        if (ob.tagihanId || !(oblN_(ob.bruto) > 0)) return;
        if (kSet && !kSet[ob.komponenId]) return;
        if (opts.onlyWithAllocations && !(alokasiTerbayar(ob) > 0)) return;
        obls.push(ob);
      });
    });
    OBL_CTX_ = null;
    var m = opSheetModel_('04_KEWAJIBAN');
    if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 04_KEWAJIBAN tidak ditemukan', null);
    var live = m.live, existing = {};
    m.rows.forEach(function (r) { var o = opRowObj_(live, r); existing[String(o.id)] = o; });
    var now = new Date().toISOString(), ops = [], lost = [];
    obls.forEach(function (ob) {
      var id = 'kw_' + oblHash_(ob.key);
      var full = oblSnapshotRow_(ob, byId[ob.siswaId], id, now);
      var ex = existing[id];
      if (ex && oblS_(ex.tagihanId) !== '' && !ex.archivedAt) return;
      var out = {};
      Object.keys(full).forEach(function (k) { if (live.indexOf(k) !== -1) out[k] = full[k]; else if (full[k] !== '' && k !== 'computedAt') lost.push(k); });
      ops.push({ op: 'upsert', id: id, row: out });
    });
    if (lost.length) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Kolom 04_KEWAJIBAN belum ada: ' + lost.filter(function (v, k, arr) { return arr.indexOf(v) === k; }).join(', ') + ' - jalankan Migrasi Skema Aditif', 'schema');
    var created = 0, updated = 0, failed = 0;
    for (i = 0; i < ops.length; i += 200) {
      var r = opRecordBatch('kewajiban', ops.slice(i, i + 200));
      if (!r.ok) return r;
      created += r.data.created; updated += r.data.updated; failed += r.data.failed;
    }
    return okResult_('Kewajiban dibekukan', { dihitung: obls.length, dibuat: created, diperbarui: updated, gagal: failed, tidakBerubah: obls.length - ops.length });
  } catch (e) {
    return errResult_('COMPUTE_FAILED', 'Gagal membuat snapshot kewajiban', null);
  } finally { OBL_CTX_ = null; }
}
function opObligationSnapshot(periode, opts) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  periode = opStr_(periode);
  var semua = !!opts.semua || periode === '*';
  if (!semua && !periode) return errResult_('VALIDATION_ERROR', 'periode wajib diisi', 'periode');
  var res = oblSnapshotCore_({ periode: semua ? '' : periode, semua: semua, komponenIds: opts.komponenIds, siswaIds: opts.siswaIds, onlyWithAllocations: !!opts.onlyWithAllocations });
  if (res && res.ok) { res.data.periode = semua ? '*' : periode; res.message = 'Snapshot kewajiban ' + (semua ? '(semua periode)' : 'periode ' + periode) + ' disimpan'; }
  return res;
}
`;
fs.writeFileSync(OUT + 'ObligationEngine.gs', oblGs);

const fcc = fs.readFileSync(OUT + '_fcc_pure.js', 'utf8') + '\n' + fs.readFileSync(OUT + '_fcc_budget.js', 'utf8');
const finGs = `/**
 * FinanceEngine.gs - Financial Control Center (server).
 * Inti hitungan (fccCompute_) adalah SALINAN IDENTIK dari kode yang dipakai klien (_fcc_pure.js).
 * Fungsi publik: opFinancialControl(periode).
 * STATUS: diverifikasi lewat tes diferensial sandbox. BELUM dijalankan di Apps Script sungguhan.
 */
${fcc}
/* tagihan (04) per periode anggaran PEMASUKAN yang masuk lingkup - memakai ObligationEngine (fungsi kewajiban yang sama dengan klien) */
function fccTagihanFor_(anggaran, periode) {
  var ta = fccTaOfPeriode_(periode), pers = {}, out = [];
  anggaran.forEach(function (a) { if (a.jenis !== 'PEMASUKAN' || a.archivedAt) return; var p = String(a.periode || ''); if (p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta))) pers[p] = true; });
  var keys = Object.keys(pers); if (!keys.length) return out;
  try {
    OBL_CTX_ = oblLoadContext_();
    var unitOf = {}; OBL_CTX_.students.forEach(function (s) { unitOf[s.id] = s.unit; });
    keys.forEach(function (p) { allObligationsAllSiswa(p).forEach(function (o) { out.push({ komponenId: o.komponenId, unit: unitOf[o.siswaId] || '', periode: o.periode, netto: o.netto }); }); });
  } finally { OBL_CTX_ = null; }
  return out;
}
function opFinancialControl(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode);
  if (!periode) return errResult_('VALIDATION_ERROR', 'periode wajib diisi', 'periode');
  try {
    var mk = function (sheet) { var m = opSheetModel_(sheet); return m ? m.rows.map(function (r) { return opJsonSafe_(opRowObj_(m.live, r)); }) : []; };
    var D = { transaksi: mk('05_TRANSAKSI'), akun: mk('07_AKUN'), anggaran: mk('08_ANGGARAN'), komitmen: mk('09_KOMITMEN'), rkat: mk('18_RKAT'), rekonsiliasi: mk('16_REKONSILIASI'),
      alokasi: mk('06_ALOKASI'), komponen: mk('02_KOMPONEN'), kategoriPengeluaran: mk('21_KATEGORI_PENGELUARAN') };
    D.tagihan = fccTagihanFor_(D.anggaran, periode);
    var res = fccCompute_(periode, D);
    res.computedAt = new Date().toISOString();
    return okResult_('OK', res);
  } catch (e) { return errResult_('COMPUTE_FAILED', 'Gagal menghitung kontrol keuangan', null); }
}
`;
fs.writeFileSync(OUT + 'FinanceEngine.gs', finGs);

// ---- patch aditif TransactionEngine.gs (arsip-aware) ----
let eng = fs.readFileSync(G + 'TransactionEngine.gs', 'utf8');
const sumOld = `function sumAllocationsForTransaksi_(transaksiId) {
  var rows = readAllRows_(SHT_ALOKASI, ALOK_HEADERS);
  var sum = 0;
  rows.forEach(function (r) { if (r.transaksiId === transaksiId) sum += Number(r.nominal || 0); });
  return sum;
}`;
if (!eng.includes(sumOld)) throw new Error('anchor sumAllocationsForTransaksi_ tidak cocok');
eng = eng.replace(sumOld, `/* [PATCH ADITIF - arsip/reversal] Alokasi yang sudah diarsipkan (kolom archivedAt terisi) TIDAK dihitung.
   Sheet tanpa kolom archivedAt berperilaku persis seperti sebelumnya. Hanya fungsi ini + getStudentPosition yang berubah. */
function activeAllocationRows_() {
  var sh = ss_().getSheetByName(SHT_ALOKASI);
  if (!sh) return [];
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var ai = hdr.indexOf('archivedAt');
  var values = sh.getRange(2, 1, lastRow - 1, Math.max(lastCol, ALOK_HEADERS.length)).getValues();
  var out = [];
  values.forEach(function (r) {
    if (ai >= 0 && r[ai] !== '' && r[ai] !== null && r[ai] !== undefined) return;
    var o = {};
    ALOK_HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    out.push(o);
  });
  return out;
}
function sumAllocationsForTransaksi_(transaksiId) {
  var rows = activeAllocationRows_();
  var sum = 0;
  rows.forEach(function (r) { if (r.transaksiId === transaksiId) sum += Number(r.nominal || 0); });
  return sum;
}`);
const spOld = "var alokasi = readAllRows_(SHT_ALOKASI, ALOK_HEADERS).filter(function (a) { return a.siswaId === siswaId; });";
if (!eng.includes(spOld)) throw new Error('anchor getStudentPosition tidak cocok');
eng = eng.replace(spOld, "var alokasi = activeAllocationRows_().filter(function (a) { return a.siswaId === siswaId; });");
// ---- patch aditif: transaksi arsip tidak ikut daftar/aktif, tidak bisa diubah, tidak bisa menerima alokasi baru ----
const rawOld = `function getTransactionRaw_(id) {
  var rows = readAllRows_(SHT_TRANSAKSI, TRX_HEADERS);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}`;
if (!eng.includes(rawOld)) throw new Error('anchor getTransactionRaw_ tidak cocok');
eng = eng.replace(rawOld, `/* [PATCH ADITIF - transaksi arsip] Membaca baris transaksi (23 kolom posisional, TIDAK berubah) + info arsip dari kolom
   archivedAt/archivedBy/archiveReason (bila ada di header live). Field arsip hanya ditempel bila archivedAt terisi, jadi bentuk
   baris transaksi aktif IDENTIK dengan sebelumnya. Sheet tanpa kolom arsip berperilaku persis seperti sebelumnya. */
function readTrxRows_() {
  var rows = readAllRows_(SHT_TRANSAKSI, TRX_HEADERS);
  var sh = ss_().getSheetByName(SHT_TRANSAKSI);
  var lastRow = sh ? sh.getLastRow() : 0, lastCol = sh ? sh.getLastColumn() : 0;
  if (!rows.length || lastRow < 2 || lastCol < 1) return rows;
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var ai = hdr.indexOf('archivedAt'), bi = hdr.indexOf('archivedBy'), ri = hdr.indexOf('archiveReason');
  if (ai === -1) return rows;
  var vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < rows.length && i < vals.length; i++) {
    var a = vals[i][ai];
    if (a !== '' && a !== null && a !== undefined) {
      rows[i].archivedAt = a;
      rows[i].archivedBy = bi === -1 ? '' : vals[i][bi];
      rows[i].archiveReason = ri === -1 ? '' : vals[i][ri];
    }
  }
  return rows;
}
function getTransactionRaw_(id) {
  var rows = readTrxRows_();
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}`);
const gtOld = `function getTransactions(filters) {
  filters = filters || {};
  var rows = readAllRows_(SHT_TRANSAKSI, TRX_HEADERS);
  var out = rows.filter(function (r) {`;
if (!eng.includes(gtOld)) throw new Error('anchor getTransactions tidak cocok');
eng = eng.replace(gtOld, `function getTransactions(filters) {
  filters = filters || {};
  var rows = readTrxRows_();
  var out = rows.filter(function (r) {
    if (r.archivedAt && filters.includeArchived !== true) return false; // [PATCH] transaksi arsip tidak termasuk daftar aktif (kecuali diminta eksplisit)`);
const upOld = `    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);`;
if (!eng.includes(upOld)) throw new Error('anchor updateTransaction/before tidak cocok');
eng = eng.replace(upOld, upOld + `
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);`);
const reOld = `      var beforeRecheck = getTransactionRaw_(payload.id);`;
if (!eng.includes(reOld)) throw new Error('anchor beforeRecheck tidak cocok');
eng = eng.replace(reOld, reOld + `
      if (beforeRecheck && beforeRecheck.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (re-check) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);`);
const alOld = `      var trx = getTransactionRaw_(payload.transaksiId);
      var currentSum = sumAllocationsForTransaksi_(payload.transaksiId);`;
if (!eng.includes(alOld)) throw new Error('anchor createAllocation/trx tidak cocok');
eng = eng.replace(alOld, `      var trx = getTransactionRaw_(payload.transaksiId);
      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');
      var currentSum = sumAllocationsForTransaksi_(payload.transaksiId);`);
fs.writeFileSync(OUT + 'TransactionEngine.gs', eng);

// ---- patch MasterDataRead.gs: baca berdasarkan header LIVE (kolom aditif ikut terbaca) ----
let mdr = fs.readFileSync(AB + 'MasterDataRead.gs', 'utf8');
const rmOld = `function readMasterRows_(sheetName, headers) {
  return readAllRows_(sheetName, headers); // reuse TransactionEngine.gs, tidak diduplikasi
}`;
if (!mdr.includes(rmOld)) throw new Error('anchor readMasterRows_ tidak cocok');
mdr = mdr.replace(rmOld, `/* [PATCH ADITIF] Bila header LIVE memuat semua kolom yang diharapkan, baca berdasarkan NAMA kolom live
   (kolom tambahan hasil migrasi aditif, mis. status di 03_TARIF/07_AKUN, ikut terbaca; urutan kolom tidak lagi
   berpengaruh). Bila tidak, jatuh ke pembacaan posisional lama persis seperti sebelumnya. */
function readMasterRows_(sheetName, headers) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return [];
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var live = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var complete = headers.every(function (h) { return live.indexOf(h) !== -1; });
  if (!complete) return readAllRows_(sheetName, headers);
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function (r) {
    var o = {};
    live.forEach(function (h, i) { if (h) o[h] = r[i]; });
    return typeof opJsonSafe_ === 'function' ? opJsonSafe_(o) : o;
  });
}`);
fs.writeFileSync(OUT + 'MasterDataRead.gs', mdr);
// ---- TarifPlan.gs (kode rencana tarif = SALINAN IDENTIK _tarif_pure.js) ----
const tp = fs.readFileSync(OUT + '_tarif_pure.js', 'utf8');
fs.writeFileSync(OUT + 'TarifPlan.gs', fs.readFileSync(OUT + '_tarif_ops.gs.tpl', 'utf8').replace('/*__TARIF_PURE__*/', () => tp));
console.log('OK: ObligationEngine.gs (' + OBL_FNS.length + ' fungsi diekstrak verbatim), FinanceEngine.gs, TransactionEngine.gs (patch aditif), MasterDataRead.gs');
