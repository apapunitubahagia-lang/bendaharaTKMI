/**
 * RabAllocation.gs - [P1-RAB] Pemetaan eksplisit pengeluaran -> RAB (30_ALOKASI_PENGELUARAN). Keputusan K-RAB-01..06, 08.
 *
 * - opAlokasiPengeluaranSetup(confirm)  : MEMBUAT sheet operasional aditif 30_ALOKASI_PENGELUARAN, hanya bila dipanggil
 *   eksplisit dengan konfirmasi 'BUAT_SHEET_ALOKASI_PENGELUARAN'. Tidak pernah dipanggil otomatis (boot, impor, fungsi lain).
 *   Audit niat ditulis LEBIH DULU (gagal tertutup); sheet yang sudah ada tidak ditimpa.
 * - opAlokasiPengeluaranPlan()          : UJI KERING read-only atas 30_REF_ALOKASI_PENGELUARAN (sumber TIDAK diubah).
 *   Kelas: VALID / DITOLAK / DUPLIKAT / PERLU_PEMERIKSAAN + alasan, distribusi tingkatPemetaan, resolusi FK, planHash.
 *   Tidak ada perbaikan otomatis; relasi yang tidak didukung data dilaporkan, tidak dikarang.
 * - opAlokasiPengeluaranImport(p)       : impor HANYA baris VALID lewat opRecordBatchLocked_ (RecordGuard, audit per baris,
 *   penanda periode, idempotensi id 'ap_<alokasiPengId>'), dengan konfirmasi 'IMPOR_ALOKASI_PENGELUARAN' dan planHash yang
 *   harus sama dengan uji kering ulang di dalam lock (data berubah -> CONFLICT). Audit ringkasan ikut append yang sama.
 *   Prosedur: hanya pada SALINAN spreadsheet uji, setelah hasil uji kering diperiksa dan disetujui (P1_07 §9).
 * - komitmenId TIDAK dipakai (K-RAB-07 belum disetujui).
 *
 * DEPENDENSI: TransactionEngine.gs (ss_, withLock_, errResult_, okResult_, readTrxRows_), SchemaGuard.gs, OperationalAPI.gs
 *             (opGate_, opStr_, opJsonSafe_, OP_WRITE_ROLES_, OP_READ_ROLES_), RecordEngine.gs (OP_RECORDS_, opAuditBulk_,
 *             opRecordBatchLocked_), ObligationEngine.gs (oblHash_), PeriodLock.gs (plIsPeriodLabel_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var RAB_ALOKASI_SHEET_ = '30_ALOKASI_PENGELUARAN';
var RAB_ALOKASI_HEADERS_ = ['id', 'transaksiId', 'anggaranId', 'nominal', 'tingkatPemetaan', 'sumberRefId', 'importBatchId', 'catatan', 'createdAt', 'createdBy', 'archivedAt', 'archivedBy', 'archiveReason'];
var RAB_REF_SHEET_ = '30_REF_ALOKASI_PENGELUARAN';
var RAB_REF_REQ_ = ['alokasiPengId', 'transaksiId', 'anggaranId', 'nominal', 'tingkatPemetaan'];
var RAB_TINGKAT_SAH_ = ['ITEM']; // K-RAB-01

function opAlokasiPengeluaranSetup(confirm) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (confirm !== 'BUAT_SHEET_ALOKASI_PENGELUARAN') return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (BUAT_SHEET_ALOKASI_PENGELUARAN)', 'confirm');
  try {
    return withLock_(function () {
      var ss = ss_(), sh = ss.getSheetByName(RAB_ALOKASI_SHEET_);
      if (sh) {
        sgHeaderModel_(RAB_ALOKASI_SHEET_, RAB_ALOKASI_HEADERS_); // header berbeda -> SCHEMA_MISMATCH (tidak ditimpa)
        var same = okResult_('Sheet sudah ada', { sheet: RAB_ALOKASI_SHEET_ }); same.data.unchanged = true; return same;
      }
      try { opAuditBulk_([['SCHEMA_CREATE_SHEET', null, { sheet: RAB_ALOKASI_SHEET_, headers: RAB_ALOKASI_HEADERS_ }, RAB_ALOKASI_SHEET_]], g.identity.email); } catch (e) {
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; sheet tidak dibuat', null);
      }
      try {
        sh = ss.insertSheet(RAB_ALOKASI_SHEET_);
        sh.getRange(1, 1, 1, RAB_ALOKASI_HEADERS_.length).setValues([RAB_ALOKASI_HEADERS_]);
      } catch (e) {
        try { opAuditBulk_([['SCHEMA_CREATE_SHEET_FAILED', null, { sheet: RAB_ALOKASI_SHEET_, error: String(e && e.message || e) }, RAB_ALOKASI_SHEET_]], g.identity.email); } catch (e2) { /* dilaporkan lewat hasil */ }
        return errResult_('WRITE_FAILED', 'Gagal membuat sheet ' + RAB_ALOKASI_SHEET_, null);
      }
      return okResult_('Sheet dibuat', { sheet: RAB_ALOKASI_SHEET_, headers: RAB_ALOKASI_HEADERS_ });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menyiapkan sheet alokasi pengeluaran'); }
}

/* Inti uji kering (dipakai Plan dan Import). Tidak menulis apa pun. */
function rabAlokasiPlanCore_() {
  var ref = sgModel_(RAB_REF_SHEET_, RAB_REF_REQ_);
  if (!ref) { var e0 = new Error('Sheet ' + RAB_REF_SHEET_ + ' tidak ditemukan'); e0.code = 'NOT_FOUND'; throw e0; }
  var trx = {}; readTrxRows_().forEach(function (t) { trx[String(t.id)] = t; });
  var ang = {}, am = sgModel_('08_ANGGARAN', ['id', 'periode']);
  (am ? am.values : []).forEach(function (r) { ang[String(r[am.idx.id])] = { periode: String(sgDateStr_(r[am.idx.periode]) || ''), unit: opStr_(sgGet_(am, r, 'unit')), jenis: opStr_(sgGet_(am, r, 'jenis')), archived: opStr_(sgGet_(am, r, 'archivedAt')) !== '' }; });
  var kom = {}, km = sgModel_('09_KOMITMEN', ['id']);
  (km ? km.values : []).forEach(function (r) { kom[String(r[km.idx.id])] = true; });
  var ex = { ids: {}, pairs: {}, sumByTrx: {} }, xm = sgModel_(RAB_ALOKASI_SHEET_, ['id', 'transaksiId', 'anggaranId', 'nominal']);
  (xm ? xm.values : []).forEach(function (r) {
    ex.ids[String(r[xm.idx.id])] = true;
    if (opStr_(sgGet_(xm, r, 'archivedAt')) !== '') return;
    ex.pairs[String(r[xm.idx.transaksiId]) + '|' + String(r[xm.idx.anggaranId])] = true;
    ex.sumByTrx[String(r[xm.idx.transaksiId])] = (ex.sumByTrx[String(r[xm.idx.transaksiId])] || 0) + (Number(r[xm.idx.nominal]) || 0);
  });
  var seenSrc = {}, seenPair = {}, rows = [], tingkat = {}, fk = { transaksiId: { terisi: 0, ditemukan: 0 }, anggaranId: { terisi: 0, ditemukan: 0 }, komitmenId: { terisi: 0, ditemukan: 0 } };
  ref.values.forEach(function (r, i) {
    var o = sgObj_(ref, r), src = opStr_(o.alokasiPengId), tid = opStr_(o.transaksiId), aid = opStr_(o.anggaranId), kid = opStr_(o.komitmenId);
    var tk = opStr_(o.tingkatPemetaan).toUpperCase(), nom = Number(o.nominal), why = [], kelas = '';
    tingkat[tk || '(kosong)'] = (tingkat[tk || '(kosong)'] || 0) + 1;
    if (tid) { fk.transaksiId.terisi++; if (trx[tid]) fk.transaksiId.ditemukan++; }
    if (aid) { fk.anggaranId.terisi++; if (ang[aid]) fk.anggaranId.ditemukan++; }
    if (kid) { fk.komitmenId.terisi++; if (kom[kid]) fk.komitmenId.ditemukan++; }
    var id = src ? 'ap_' + src.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 90) : '';
    var t = tid ? trx[tid] : null, a = aid ? ang[aid] : null;
    if (!src) { kelas = 'DITOLAK'; why.push('ID_SUMBER_KOSONG'); }
    else if (seenSrc[src]) { kelas = 'DUPLIKAT'; why.push('ID_SUMBER_GANDA'); }
    else if (ex.ids[id]) { kelas = 'DUPLIKAT'; why.push('SUDAH_ADA'); }
    if (src) seenSrc[src] = true;
    if (!kelas) {
      if (!tid) why.push('TRANSAKSI_KOSONG'); else if (!t) why.push('TRANSAKSI_TIDAK_ADA'); else if (t.archivedAt) why.push('TRANSAKSI_DIARSIPKAN'); else if (t.jenis !== 'PENGELUARAN') why.push('BUKAN_PENGELUARAN');
      if (!aid) { if (opStr_(o.alasanPengecualian)) { kelas = 'PERLU_PEMERIKSAAN'; why.push('DIKECUALIKAN_TANPA_ANGGARAN'); } else why.push('ANGGARAN_KOSONG'); }
      else if (!a) why.push('ANGGARAN_TIDAK_ADA'); else if (a.archived) why.push('ANGGARAN_DIARSIPKAN'); else if (a.jenis === 'PEMASUKAN') why.push('ANGGARAN_PEMASUKAN');
      if (!(isFinite(nom) && nom > 0)) why.push('NOMINAL_TIDAK_VALID');
      if (why.length && kelas !== 'PERLU_PEMERIKSAAN') kelas = 'DITOLAK';
      else if (why.length) kelas = kelas || 'DITOLAK';
    }
    if (!kelas) {
      var pk = tid + '|' + aid;
      if (seenPair[pk]) { kelas = 'DUPLIKAT'; why.push('PASANGAN_GANDA'); }
      else if (ex.pairs[pk]) { kelas = 'DUPLIKAT'; why.push('PASANGAN_SUDAH_ADA'); }
      seenPair[pk] = true;
    }
    if (!kelas) {
      if (RAB_TINGKAT_SAH_.indexOf(tk) === -1) why.push('TINGKAT_BUKAN_ITEM');
      if (plIsPeriodLabel_(a.periode) && plPeriodeOfDate_(t.tanggal) !== a.periode) why.push('PERIODE_BERBEDA');
      if (a.unit && t.unit && a.unit !== t.unit) why.push('UNIT_BERBEDA');
      if (opStr_(o.alasanPengecualian)) why.push('ADA_ALASAN_PENGECUALIAN');
      kelas = why.length ? 'PERLU_PEMERIKSAAN' : 'VALID';
    }
    rows.push({ baris: i + 2, alokasiPengId: src, id: id, kelas: kelas, alasan: why, transaksiId: tid, anggaranId: aid, nominal: isFinite(nom) ? nom : null, tingkatPemetaan: tk });
  });
  // Σ per transaksi (alokasi aktif yang sudah ada + kandidat VALID) tidak boleh melebihi nominal -> seluruh kandidat transaksi itu diperiksa
  var sumC = {};
  rows.forEach(function (x) { if (x.kelas === 'VALID') sumC[x.transaksiId] = (sumC[x.transaksiId] || 0) + x.nominal; });
  rows.forEach(function (x) {
    if (x.kelas !== 'VALID') return;
    if ((ex.sumByTrx[x.transaksiId] || 0) + sumC[x.transaksiId] > Number(trx[x.transaksiId].nominal) + 0.5) { x.kelas = 'PERLU_PEMERIKSAAN'; x.alasan.push('MELEBIHI_NOMINAL_TRANSAKSI'); }
  });
  var kelas = { VALID: 0, DITOLAK: 0, DUPLIKAT: 0, PERLU_PEMERIKSAAN: 0 }, alasan = {};
  rows.forEach(function (x) { kelas[x.kelas]++; x.alasan.forEach(function (w) { alasan[w] = (alasan[w] || 0) + 1; }); });
  var src2 = JSON.stringify(ref.values.map(function (r) { return opJsonSafe_(r); })) + '#' + JSON.stringify(rows.map(function (x) { return [x.id, x.kelas]; }));
  return { sumber: RAB_REF_SHEET_, totalBaris: rows.length, kelas: kelas, alasan: alasan, distribusiTingkat: tingkat, resolusiFK: fk,
    sheetOperasionalAda: !!xm, rows: rows, planHash: oblHash_(src2) };
}
function opAlokasiPengeluaranPlan() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try { return okResult_('Uji kering (read-only; tidak ada data yang diubah)', rabAlokasiPlanCore_()); }
  catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal menjalankan uji kering alokasi pengeluaran'); }
}
function opAlokasiPengeluaranImport(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object') return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  if (p.confirm !== 'IMPOR_ALOKASI_PENGELUARAN') return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (IMPOR_ALOKASI_PENGELUARAN)', 'confirm');
  if (!opStr_(p.planHash)) return errResult_('VALIDATION_ERROR', 'planHash dari uji kering wajib diisi', 'planHash');
  try {
    return withLock_(function () {
      if (!ss_().getSheetByName(RAB_ALOKASI_SHEET_)) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Sheet ' + RAB_ALOKASI_SHEET_ + ' belum ada - jalankan opAlokasiPengeluaranSetup (eksplisit) lebih dulu', null);
      var plan = rabAlokasiPlanCore_();
      if (plan.planHash !== opStr_(p.planHash)) return errResult_('CONFLICT', 'Data sumber atau sheet alokasi berubah sejak uji kering; jalankan uji kering ulang dan periksa kembali', 'planHash');
      var now = new Date().toISOString(), batchId = 'impap_' + Utilities.getUuid();
      var valid = plan.rows.filter(function (x) { return x.kelas === 'VALID'; });
      var ops = valid.map(function (x) {
        return { op: 'upsert', id: x.id, row: { transaksiId: x.transaksiId, anggaranId: x.anggaranId, nominal: x.nominal, tingkatPemetaan: x.tingkatPemetaan, sumberRefId: x.alokasiPengId,
          importBatchId: batchId, createdAt: now, createdBy: g.identity.email } };
      });
      var hasil = { importBatchId: batchId, diimpor: 0, tidakBerubah: 0, gagal: [], kelasUjiKering: plan.kelas };
      for (var i = 0; i < ops.length || i === 0; i += 200) {
        var chunk = ops.slice(i, i + 200);
        var summary = [['IMPOR_ALOKASI_PENGELUARAN', null, { importBatchId: batchId, planHash: plan.planHash, kelas: plan.kelas, bagian: Math.floor(i / 200) + 1, jumlahDalamBagian: chunk.length }, batchId]];
        var r = opRecordBatchLocked_(g, OP_RECORDS_.alokasiPengeluaran, 'alokasiPengeluaran', chunk, summary);
        if (!r.ok) return r; // audit gagal -> bagian ini dibatalkan seluruhnya (bagian sebelumnya sudah tercatat beraudit)
        r.data.results.forEach(function (x) { if (x.code === 'CREATED') hasil.diimpor++; else if (x.code === 'UNCHANGED') hasil.tidakBerubah++; else hasil.gagal.push({ id: x.id, code: x.code, message: x.message }); });
        if (!ops.length) break;
      }
      return okResult_('Impor alokasi pengeluaran selesai (hanya baris VALID)', hasil);
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mengimpor alokasi pengeluaran'); }
}
