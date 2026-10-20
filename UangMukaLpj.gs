/**
 * UangMukaLpj.gs - [P1_22 D-T1 opsi C + D-LPJ + D-T1-link] PROTOTIPE SANDBOX. Belum ada di ServerBridge/UI; tidak dipanggil
 * otomatis; tidak ada migrasi. Semua tulis: opGate_ BENDAHARA (verifikasi: KEPALA_SEKOLAH/YAYASAN, NONAKTIF sampai GAP-005/D-T7).
 *
 * SKEMA ADITIF (hanya lewat opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ'); pratinjau opUangMukaLpjPlan):
 *   32_UANG_MUKA          : entitas uang muka (pencairan = transaksi PENGELUARAN kas yang DITANDAI lewat transaksiCairId).
 *   33_UANG_MUKA_KEMBALI  : pengembalian sisa (transaksi PENERIMAAN kas yang ditandai; BUKAN penerimaan operasional).
 *   34_LPJ_TAUTAN         : riwayat tautan LPJ -> transaksi (AKTIF / DIBATALKAN beralasan).
 *   19_LPJ (+kolom)       : statusLpj, tanggalNota, tanggalDiterima, tanggalVerifikasi, diajukanOleh, diterimaOleh,
 *                           diverifikasiOleh, alasanTolak, uangMukaId. Kolom lama `tanggal`/`status` TIDAK diubah maknanya.
 *   05_TRANSAKSI tidak diubah skemanya.
 *
 * PEMISAHAN (opsi C): kas keluar pencairan != beban; beban aktual = Σ nota LPJ DIVERIFIKASI yang bertaut uang muka (tidak membuat
 * transaksi kedua); pengembalian = PENERIMAAN bertanda 33; saldo = nominalCair - Σ nota DIVERIFIKASI - Σ pengembalian.
 * Status uang muka: DICAIRKAN -> LPJ_DITERIMA -> DIVERIFIKASI -> SELESAI; PERLU_PERBAIKAN bila ada LPJ DITOLAK.
 * Status LPJ: '' (lama) -> DIAJUKAN -> DITERIMA -> DIVERIFIKASI; DITOLAK -> (diperbaiki) DIAJUKAN.
 * KPI/FCC: formula TIDAK diubah; opUangMukaLaporan hanya mengukur dampak (baca-saja).
 * ATOMISITAS: tiap operasi berjalan di satu withLock_ (re-entrant); kegagalan setelah transaksi kas tercipta -> baris transaksi &
 * idempotensinya dihapus kembali (pola rollback engine) + audit kompensasi ROLLBACK_TRANSAKSI; idempotensi lewat id/
 * clientRequestId deterministik sehingga retry tidak menggandakan.
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, opCreateExpense, opCreateIncome), TransactionEngine.gs (withLock_, okResult_,
 *   errResult_, deleteRowById_, deleteIdempotencyByClientRequestId_, getTransactionRaw_, ss_), SchemaGuard.gs (sgModel_, sgObj_,
 *   sgRowArray_, sgAppend_, sgDateError_, sgErr_), RecordEngine.gs (opAuditBulk_), PeriodLock.gs (plPeriodeOfDate_),
 *   ObligationEngine.gs (oblHash_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var UM_SHEETS_ = {
  '32_UANG_MUKA': ['id', 'kegiatan', 'rabId', 'unit', 'akunId', 'pelaksana', 'nominalCair', 'tanggalCair', 'transaksiCairId', 'status', 'alasanStatus', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  '33_UANG_MUKA_KEMBALI': ['id', 'uangMukaId', 'transaksiId', 'nominal', 'tanggal', 'createdAt', 'createdBy'],
  '34_LPJ_TAUTAN': ['id', 'lpjId', 'transaksiId', 'status', 'alasan', 'dibuatOleh', 'dibuatPada', 'dibatalkanOleh', 'dibatalkanPada', 'alasanBatal']
};
var UM_LPJ_COLS_ = ['statusLpj', 'tanggalNota', 'tanggalDiterima', 'tanggalVerifikasi', 'diajukanOleh', 'diterimaOleh', 'diverifikasiOleh', 'alasanTolak', 'uangMukaId'];
var UM_CONFIRM_ = 'BUAT_SKEMA_UANG_MUKA_LPJ';
var UM_VERIFIKASI_AKTIF_ = false; // [GAP-005/D-T7] verifikasi operasional NONAKTIF; uji sandbox menyalakannya secara eksplisit
var UM_VERIFIKATOR_ROLES_ = ['KEPALA_SEKOLAH', 'YAYASAN'];
var UM_STATUS_AKHIR_ = { SELESAI: true }; // tidak menerima pengembalian lagi
var UM_STATUS_TUTUP_LPJ_ = { SELESAI: true, DIBATALKAN: true }; // [P1_23] tidak menerima LPJ baru

/* ---------- utilitas ---------- */
function umS_(v) { return opStr_(v); }
function umN_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function umErr_(code, msg, field) { return errResult_(code, msg, field || null); }
function umToday_() { return Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
function umDate_(v) { var s = umS_(sgDateStr_(v)).slice(0, 10); return sgDateError_(s) ? '' : s; }
function umRows_(sheet) { var m = sgModel_(sheet, ['id']); return m ? m.values.map(function (r) { return sgObj_(m, r); }) : []; }
function umFind_(sheet, id) { var m = sgModel_(sheet, ['id']); if (!m) return null; for (var i = 0; i < m.values.length; i++) if (umS_(m.values[i][m.idx.id]) === umS_(id)) return { m: m, i: i, o: sgObj_(m, m.values[i]) }; return null; }
/* ubah sel berdasarkan nama kolom pada baris yang ditemukan umFind_ (kolom lain dipertahankan) */
function umUpdate_(hit, patch) { var row = sgRowArray_(hit.m, patch, hit.m.values[hit.i]); hit.m.sh.getRange(hit.i + 2, 1, 1, hit.m.live.length).setValues([row]); hit.m.values[hit.i] = row; hit.o = sgObj_(hit.m, row); }
function umSchemaMissing_() {
  var miss = [];
  Object.keys(UM_SHEETS_).forEach(function (s) { if (!ss_().getSheetByName(s)) miss.push(s); });
  var m = sgModel_('19_LPJ', ['id']); if (!m) miss.push('19_LPJ'); else UM_LPJ_COLS_.forEach(function (c) { if (m.live.indexOf(c) === -1) miss.push('19_LPJ.' + c); });
  return miss;
}
function umReady_() { var miss = umSchemaMissing_(); return miss.length ? umErr_('SCHEMA_ADDITIVE_REQUIRED', 'Skema uang muka/LPJ belum dibuat: ' + miss.join(', ') + ' - jalankan opUangMukaLpjSetup secara eksplisit', 'schema') : null; }
function umAudit_(g, rows) { opAuditBulk_(rows, g.identity.email); }
/* kompensasi: transaksi kas yang baru dibuat operasi ini dihapus kembali + idempotensinya; audit ROLLBACK_TRANSAKSI */
function umRollbackTrx_(g, trxId, crid, sebab) {
  var ok = true;
  try { deleteRowById_(SHT_TRANSAKSI, trxId); } catch (e) { ok = false; }
  try { if (crid) deleteIdempotencyByClientRequestId_(crid); } catch (e2) { ok = false; }
  try { umAudit_(g, [['ROLLBACK_TRANSAKSI', null, { transaksiId: trxId, sebab: String(sebab || '') }, trxId]]); } catch (e3) { ok = false; }
  return ok;
}
function umLpjAktif_(id) { var h = umFind_('19_LPJ', id); return h && !umS_(h.o.archivedAt) ? h : null; }
function umTrxPengeluaranAktif_(id) { var t = getTransactionRaw_(id); return t && !t.archivedAt && t.jenis === 'PENGELUARAN' ? t : null; }
function umCairTrxIds_() { var s = {}; umRows_('32_UANG_MUKA').forEach(function (u) { if (umS_(u.transaksiCairId)) s[umS_(u.transaksiCairId)] = umS_(u.id); }); return s; }
function umKembaliTrxIds_() { var s = {}; umRows_('33_UANG_MUKA_KEMBALI').forEach(function (k) { if (umS_(k.transaksiId)) s[umS_(k.transaksiId)] = umS_(k.uangMukaId); }); return s; }
/* posisi uang muka: dari baris 19 & 33 (bukan nilai tersimpan) */
function umPosisi_(u) {
  var lpj = umRows_('19_LPJ').filter(function (l) { return !umS_(l.archivedAt) && umS_(l.uangMukaId) === umS_(u.id); });
  var ver = lpj.filter(function (l) { return umS_(l.statusLpj) === 'DIVERIFIKASI'; }).reduce(function (s, l) { return s + umN_(l.nominal); }, 0);
  var belum = lpj.filter(function (l) { return umS_(l.statusLpj) !== 'DIVERIFIKASI'; }).reduce(function (s, l) { return s + umN_(l.nominal); }, 0);
  /* [P1_24] pengembalian yang transaksi kasnya sudah diarsip (reversal) tidak dihitung; dilaporkan sebagai peringatan */
  var kRows = umRows_('33_UANG_MUKA_KEMBALI').filter(function (k) { return umS_(k.uangMukaId) === umS_(u.id); }), kArsip = [];
  var kembali = kRows.reduce(function (s, k) { var t = getTransactionRaw_(umS_(k.transaksiId)); if (!t || t.archivedAt) { kArsip.push(umS_(k.id)); return s; } return s + umN_(k.nominal); }, 0);
  var tc = umS_(u.transaksiCairId) ? getTransactionRaw_(umS_(u.transaksiCairId)) : null, peringatan = [];
  if (!tc || tc.archivedAt) peringatan.push('PENCAIRAN_DIARSIP_ATAU_HILANG');
  else if (Math.abs(umN_(tc.nominal) - umN_(u.nominalCair)) > 0.5) peringatan.push('NOMINAL_PENCAIRAN_BERBEDA');
  if (kArsip.length) peringatan.push('PENGEMBALIAN_DIARSIP');
  return { lpj: lpj, notaTerverifikasi: ver, notaBelumTerverifikasi: belum, pengembalian: kembali, saldo: umN_(u.nominalCair) - ver - kembali,
    arusKasKeluar: tc && !tc.archivedAt ? umN_(tc.nominal) : 0, pengembalianDiarsip: kArsip, peringatan: peringatan,
    adaDitolak: lpj.some(function (l) { return umS_(l.statusLpj) === 'DITOLAK'; }), semuaTerverifikasi: lpj.length > 0 && lpj.every(function (l) { return umS_(l.statusLpj) === 'DIVERIFIKASI'; }),
    adaDiterima: lpj.some(function (l) { return ['DITERIMA', 'DIVERIFIKASI'].indexOf(umS_(l.statusLpj)) !== -1; }) };
}
/* status uang muka diturunkan dari posisi (aturan tunggal) */
function umStatusDari_(u, p) {
  if (p.adaDitolak) return 'PERLU_PERBAIKAN';
  var tanpaLpjTerbuka = p.lpj.every(function (l) { return umS_(l.statusLpj) === 'DIVERIFIKASI'; }); // [P1_23] termasuk: tanpa LPJ sama sekali (dikembalikan penuh)
  if (tanpaLpjTerbuka && Math.abs(p.saldo) <= 0.5) return 'SELESAI';
  if (p.semuaTerverifikasi) return 'DIVERIFIKASI';
  if (p.adaDiterima) return 'LPJ_DITERIMA';
  return 'DICAIRKAN';
}
function umSegarkanStatus_(g, umId, sebab) {
  var h = umFind_('32_UANG_MUKA', umId); if (!h) return null;
  if (umS_(h.o.status) === 'DIBATALKAN') return null; // [P1_23] DIBATALKAN tetap (saldo tetap dilaporkan sampai dikembalikan)
  var p = umPosisi_(h.o), st = umStatusDari_(h.o, p);
  if (st === umS_(h.o.status)) return null;
  var before = { status: umS_(h.o.status) };
  umUpdate_(h, { status: st, alasanStatus: sebab || '', updatedAt: new Date().toISOString(), updatedBy: g.identity.email });
  return ['UANG_MUKA_STATUS', before, { status: st, saldo: p.saldo, notaTerverifikasi: p.notaTerverifikasi, pengembalian: p.pengembalian, sebab: sebab || '' }, umId];
}

/* ---------- setup eksplisit ---------- */
function opUangMukaLpjPlan() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var plan = Object.keys(UM_SHEETS_).map(function (s) { return { sheet: s, status: ss_().getSheetByName(s) ? 'ADA' : 'AKAN_DIBUAT', headers: UM_SHEETS_[s] }; });
    var m = sgModel_('19_LPJ', ['id']);
    plan.push({ sheet: '19_LPJ', status: !m ? 'SHEET_TIDAK_ADA' : 'KOLOM', tambah: m ? UM_LPJ_COLS_.filter(function (c) { return m.live.indexOf(c) === -1; }) : [] });
    return okResult_('Pratinjau skema uang muka/LPJ (belum ada yang ditulis)', { plan: plan, konfirmasi: UM_CONFIRM_ });
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal menyusun pratinjau'); }
}
function opUangMukaLpjSetup(confirm) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (confirm !== UM_CONFIRM_) return umErr_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (' + UM_CONFIRM_ + ')', 'confirm');
  try {
    return withLock_(function () {
      var ss = ss_(), buat = Object.keys(UM_SHEETS_).filter(function (s) { return !ss.getSheetByName(s); });
      var m = sgModel_('19_LPJ', ['id']); if (!m) return umErr_('SCHEMA_MISMATCH', 'Sheet 19_LPJ tidak ditemukan', null);
      var tambah = UM_LPJ_COLS_.filter(function (c) { return m.live.indexOf(c) === -1; });
      if (!buat.length && !tambah.length) return okResult_('Tidak ada perubahan (skema sudah ada)', { dibuat: [], kolomDitambah: [], unchanged: true });
      try { umAudit_(g, buat.map(function (s) { return ['SCHEMA_CREATE_SHEET', null, { sheet: s, headers: UM_SHEETS_[s] }, s]; }).concat(tambah.length ? [['SCHEMA_ADD_COLUMNS', { sheet: '19_LPJ', columnsBefore: m.live }, { sheet: '19_LPJ', added: tambah }, '19_LPJ']] : [])); }
      catch (e) { return umErr_('AUDIT_FAILED', 'Audit gagal ditulis; skema tidak diubah', null); }
      buat.forEach(function (s) { var sh = ss.insertSheet(s); sh.getRange(1, 1, 1, UM_SHEETS_[s].length).setValues([UM_SHEETS_[s]]); sh.setFrozenRows(1); });
      if (tambah.length) m.sh.getRange(1, m.live.length + 1, 1, tambah.length).setValues([tambah]);
      return okResult_('Skema uang muka/LPJ dibuat', { dibuat: buat, kolomDitambah: tambah });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal membuat skema uang muka/LPJ'); }
}

/* ---------- uang muka ---------- */
function opUangMukaCair(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var crid = umS_(p.clientRequestId); if (!crid) return umErr_('VALIDATION_ERROR', 'clientRequestId wajib diisi (idempotensi)', 'clientRequestId');
  if (!umS_(p.kegiatan)) return umErr_('VALIDATION_ERROR', 'kegiatan wajib diisi', 'kegiatan');
  if (!umS_(p.pelaksana)) return umErr_('VALIDATION_ERROR', 'pelaksana wajib diisi', 'pelaksana');
  if (!(umN_(p.nominal) > 0)) return umErr_('VALIDATION_ERROR', 'nominal wajib > 0', 'nominal');
  if (!umDate_(p.tanggal)) return umErr_('VALIDATION_ERROR', 'tanggal pencairan tidak valid', 'tanggal');
  var umId = 'um_' + oblHash_('cair|' + crid), trxCrid = 'um_cair_' + crid;
  try {
    return withLock_(function () {
      var ada = umFind_('32_UANG_MUKA', umId);
      if (ada) return okResult_('Request sudah pernah diproses (idempotent replay)', { id: umId, uangMuka: ada.o, replay: true });
      if (umS_(p.rabId)) { var a = umFind_('08_ANGGARAN', p.rabId); if (!a || umS_(a.o.archivedAt)) return umErr_('INVALID_RAB', 'rabId tidak ditemukan / diarsipkan: ' + p.rabId, 'rabId'); }
      var t = opCreateExpense({ tanggal: umDate_(p.tanggal), unit: umS_(p.unit), nominal: umN_(p.nominal), akunId: umS_(p.akunId), metode: umS_(p.metode) || 'Tunai', kategori: umS_(p.kategori), subkategori: umS_(p.subkategori),
        penerima: umS_(p.pelaksana), catatan: 'Pencairan uang muka ' + umId + ': ' + umS_(p.kegiatan), sumber: 'uang-muka', clientRequestId: trxCrid });
      if (!t || !t.ok) return t;
      var trxId = t.data.id, now = new Date().toISOString();
      try {
        sgAppend_('32_UANG_MUKA', ['id'], { id: umId, kegiatan: umS_(p.kegiatan), rabId: umS_(p.rabId), unit: umS_(p.unit), akunId: umS_(p.akunId), pelaksana: umS_(p.pelaksana), nominalCair: umN_(p.nominal),
          tanggalCair: umDate_(p.tanggal), transaksiCairId: trxId, status: 'DICAIRKAN', alasanStatus: '', createdAt: now, createdBy: g.identity.email, updatedAt: now, updatedBy: g.identity.email });
        umAudit_(g, [['UANG_MUKA_CAIR', null, { id: umId, transaksiCairId: trxId, nominal: umN_(p.nominal), kegiatan: umS_(p.kegiatan), pelaksana: umS_(p.pelaksana) }, umId]]);
      } catch (e) {
        try { deleteRowById_('32_UANG_MUKA', umId); } catch (e2) { /* tidak ada baris */ }
        var rb = umRollbackTrx_(g, trxId, trxCrid, e && e.message);
        return umErr_(rb ? 'WRITE_FAILED' : 'ROLLBACK_PARTIAL', 'Gagal mencatat uang muka; transaksi pencairan ' + (rb ? 'dibatalkan (rollback)' : 'GAGAL dibatalkan penuh - periksa ' + trxId), null);
      }
      return okResult_('Uang muka dicairkan', { id: umId, transaksiCairId: trxId, status: 'DICAIRKAN' });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mencairkan uang muka'); }
}
function opUangMukaKembali(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var crid = umS_(p.clientRequestId); if (!crid) return umErr_('VALIDATION_ERROR', 'clientRequestId wajib diisi (idempotensi)', 'clientRequestId');
  if (!(umN_(p.nominal) > 0)) return umErr_('VALIDATION_ERROR', 'nominal wajib > 0', 'nominal');
  if (!umDate_(p.tanggal)) return umErr_('VALIDATION_ERROR', 'tanggal pengembalian tidak valid', 'tanggal');
  var kId = 'umk_' + oblHash_('kembali|' + crid), trxCrid = 'um_kembali_' + crid;
  try {
    return withLock_(function () {
      var ada = umFind_('33_UANG_MUKA_KEMBALI', kId); if (ada) return okResult_('Request sudah pernah diproses (idempotent replay)', { id: kId, replay: true });
      var h = umFind_('32_UANG_MUKA', p.uangMukaId); if (!h) return umErr_('NOT_FOUND', 'uang muka tidak ditemukan: ' + p.uangMukaId, 'uangMukaId');
      if (UM_STATUS_AKHIR_[umS_(h.o.status)]) return umErr_('STATUS_TIDAK_VALID', 'uang muka sudah ' + h.o.status, 'uangMukaId');
      if (umDate_(p.tanggal) < umS_(h.o.tanggalCair)) return umErr_('VALIDATION_ERROR', 'tanggal pengembalian sebelum tanggal pencairan', 'tanggal');
      var pos = umPosisi_(h.o), batas = umN_(h.o.nominalCair) - pos.notaTerverifikasi - pos.notaBelumTerverifikasi - pos.pengembalian;
      if (umN_(p.nominal) > batas + 0.5) return umErr_('MELEBIHI_SALDO', 'pengembalian (' + umN_(p.nominal) + ') melebihi sisa yang belum dipertanggungjawabkan (' + batas + ')', 'nominal');
      var t = opCreateIncome({ tanggal: umDate_(p.tanggal), unit: umS_(h.o.unit), nominal: umN_(p.nominal), akunId: umS_(p.akunId) || umS_(h.o.akunId), metode: umS_(p.metode) || 'Tunai',
        sumber: 'Pengembalian Uang Muka', catatan: 'Pengembalian sisa uang muka ' + umS_(h.o.id) + ' (bukan penerimaan operasional)', clientRequestId: trxCrid });
      if (!t || !t.ok) return t;
      var trxId = t.data.id, now = new Date().toISOString(), extra = null;
      try {
        sgAppend_('33_UANG_MUKA_KEMBALI', ['id'], { id: kId, uangMukaId: umS_(h.o.id), transaksiId: trxId, nominal: umN_(p.nominal), tanggal: umDate_(p.tanggal), createdAt: now, createdBy: g.identity.email });
        extra = umSegarkanStatus_(g, umS_(h.o.id), 'pengembalian');
        umAudit_(g, [['UANG_MUKA_KEMBALI', null, { id: kId, uangMukaId: umS_(h.o.id), transaksiId: trxId, nominal: umN_(p.nominal) }, kId]].concat(extra ? [extra] : []));
      } catch (e) {
        try { deleteRowById_('33_UANG_MUKA_KEMBALI', kId); } catch (e2) { /* tidak ada */ }
        if (extra) { try { umUpdate_(umFind_('32_UANG_MUKA', h.o.id), { status: extra[1].status }); } catch (e4) { /* dilaporkan lewat kode */ } }
        var rb = umRollbackTrx_(g, trxId, trxCrid, e && e.message);
        return umErr_(rb ? 'WRITE_FAILED' : 'ROLLBACK_PARTIAL', 'Gagal mencatat pengembalian; transaksi ' + (rb ? 'dibatalkan (rollback)' : 'GAGAL dibatalkan penuh - periksa ' + trxId), null);
      }
      return okResult_('Pengembalian sisa uang muka dicatat', { id: kId, transaksiId: trxId, status: extra ? extra[2].status : umS_(h.o.status) });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mencatat pengembalian'); }
}

/* ---------- status LPJ ---------- */
function opLpjAjukan(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var tn = umDate_(p.tanggalNota); if (!tn) return umErr_('VALIDATION_ERROR', 'tanggalNota wajib tanggal kalender YYYY-MM-DD', 'tanggalNota');
  if (tn > umToday_()) return umErr_('VALIDATION_ERROR', 'tanggalNota tidak boleh di masa depan', 'tanggalNota');
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      var st = umS_(h.o.statusLpj), umId = umS_(p.uangMukaId);
      if (st === 'DIAJUKAN' && umS_(h.o.tanggalNota) === tn && umS_(h.o.uangMukaId) === umId) return okResult_('Tidak berubah (sudah DIAJUKAN)', { lpjId: umS_(h.o.id), statusLpj: st, unchanged: true });
      if (st !== '' && st !== 'DITOLAK') return umErr_('STATUS_TIDAK_VALID', 'LPJ berstatus ' + st + ' tidak dapat diajukan ulang', 'lpjId');
      if (umId) {
        if (umS_(h.o.transaksiId)) return umErr_('LPJ_SUDAH_BERTAUT', 'LPJ sudah bertaut transaksi ' + h.o.transaksiId + '; tidak dapat sekaligus mempertanggungjawabkan uang muka (hitung ganda)', 'uangMukaId');
        var u = umFind_('32_UANG_MUKA', umId); if (!u) return umErr_('NOT_FOUND', 'uang muka tidak ditemukan: ' + umId, 'uangMukaId');
        if (UM_STATUS_TUTUP_LPJ_[umS_(u.o.status)]) return umErr_('STATUS_TIDAK_VALID', 'uang muka sudah ' + u.o.status, 'uangMukaId');
        if (tn < umS_(u.o.tanggalCair)) return umErr_('VALIDATION_ERROR', 'tanggalNota sebelum tanggal pencairan uang muka', 'tanggalNota');
        var pos = umPosisi_(u.o), lain = pos.lpj.filter(function (l) { return umS_(l.id) !== umS_(h.o.id); }).reduce(function (s, l) { return s + umN_(l.nominal); }, 0);
        if (lain + umN_(h.o.nominal) + pos.pengembalian > umN_(u.o.nominalCair) + 0.5) return umErr_('MELEBIHI_UANG_MUKA', 'Σ LPJ + pengembalian melebihi nominal uang muka', 'nominal');
      }
      var before = { statusLpj: st, tanggalNota: umS_(h.o.tanggalNota), uangMukaId: umS_(h.o.uangMukaId) };
      umUpdate_(h, { statusLpj: 'DIAJUKAN', tanggalNota: tn, uangMukaId: umId, diajukanOleh: g.identity.email, alasanTolak: '', tanggalDiterima: '', diterimaOleh: '', tanggalVerifikasi: '', diverifikasiOleh: '' });
      var rows = [['LPJ_AJUKAN', before, { statusLpj: 'DIAJUKAN', tanggalNota: tn, uangMukaId: umId, diajukanOleh: g.identity.email }, umS_(h.o.id)]];
      var ex = umId ? umSegarkanStatus_(g, umId, 'LPJ diajukan') : null; if (ex) rows.push(ex);
      try { umAudit_(g, rows); } catch (e) { umUpdate_(h, before); if (umId || before.uangMukaId) umSegarkanStatus_(g, umId || before.uangMukaId, 'pemulihan'); return umErr_('AUDIT_FAILED', 'Audit gagal; status LPJ dipulihkan', null); }
      return okResult_('LPJ diajukan', { lpjId: umS_(h.o.id), statusLpj: 'DIAJUKAN' });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mengajukan LPJ'); }
}
function opLpjTerima(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      if (umS_(h.o.statusLpj) === 'DITERIMA') return okResult_('Tidak berubah (sudah DITERIMA)', { lpjId: umS_(h.o.id), statusLpj: 'DITERIMA', unchanged: true });
      if (umS_(h.o.statusLpj) !== 'DIAJUKAN') return umErr_('STATUS_TIDAK_VALID', 'hanya LPJ DIAJUKAN yang dapat diterima (status: ' + (umS_(h.o.statusLpj) || 'kosong') + ')', 'lpjId');
      var before = { statusLpj: 'DIAJUKAN' }, tgl = umToday_();
      umUpdate_(h, { statusLpj: 'DITERIMA', tanggalDiterima: tgl, diterimaOleh: g.identity.email });
      var rows = [['LPJ_TERIMA', before, { statusLpj: 'DITERIMA', tanggalDiterima: tgl, diterimaOleh: g.identity.email }, umS_(h.o.id)]];
      var ex = umS_(h.o.uangMukaId) ? umSegarkanStatus_(g, umS_(h.o.uangMukaId), 'LPJ diterima') : null; if (ex) rows.push(ex);
      try { umAudit_(g, rows); } catch (e) { umUpdate_(h, { statusLpj: 'DIAJUKAN', tanggalDiterima: '', diterimaOleh: '' }); if (umS_(h.o.uangMukaId)) umSegarkanStatus_(g, umS_(h.o.uangMukaId), 'pemulihan'); return umErr_('AUDIT_FAILED', 'Audit gagal; status LPJ dipulihkan', null); }
      return okResult_('LPJ diterima', { lpjId: umS_(h.o.id), statusLpj: 'DITERIMA', tanggalDiterima: tgl });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menerima LPJ'); }
}
/* Verifikasi: hanya KEPALA_SEKOLAH/YAYASAN, bukan pengaju/penerima; NONAKTIF (UM_VERIFIKASI_AKTIF_) sampai GAP-005 & D-T7.
   Bukti terunggah (10_BUKTI) TIDAK dianggap verifikasi. */
function opLpjVerifikasi(p) {
  var g = opGate_(UM_VERIFIKATOR_ROLES_); if (!g.ok) return g;
  if (!UM_VERIFIKASI_AKTIF_) return umErr_('VERIFIKASI_BELUM_AKTIF', 'Verifikasi LPJ belum diaktifkan (menunggu GAP-005 & D-T7)', null);
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var hasil = umS_(p.hasil); if (hasil !== 'DIVERIFIKASI' && hasil !== 'DITOLAK') return umErr_('VALIDATION_ERROR', 'hasil wajib DIVERIFIKASI atau DITOLAK', 'hasil');
  var alasan = umS_(p.alasan); if (hasil === 'DITOLAK' && alasan.length < 10) return umErr_('ALASAN_WAJIB', 'alasan penolakan wajib (min. 10 karakter)', 'alasan');
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      if (umS_(h.o.statusLpj) === hasil && umS_(h.o.diverifikasiOleh) === g.identity.email) return okResult_('Tidak berubah', { lpjId: umS_(h.o.id), statusLpj: hasil, unchanged: true });
      if (umS_(h.o.statusLpj) !== 'DITERIMA') return umErr_('STATUS_TIDAK_VALID', 'hanya LPJ DITERIMA yang dapat diperiksa (status: ' + (umS_(h.o.statusLpj) || 'kosong') + ')', 'lpjId');
      var e1 = g.identity.email;
      if (e1 === umS_(h.o.diajukanOleh) || e1 === umS_(h.o.diterimaOleh)) return umErr_('PEMISAHAN_TUGAS', 'Pemeriksa tidak boleh pengaju/penerima LPJ ini', null);
      var tgl = umToday_(), before = { statusLpj: 'DITERIMA' };
      umUpdate_(h, { statusLpj: hasil, tanggalVerifikasi: tgl, diverifikasiOleh: e1, alasanTolak: hasil === 'DITOLAK' ? alasan : '' });
      var rows = [['LPJ_' + (hasil === 'DITOLAK' ? 'TOLAK' : 'VERIFIKASI'), before, { statusLpj: hasil, tanggalVerifikasi: tgl, diverifikasiOleh: e1, peran: g.identity.role, alasan: alasan }, umS_(h.o.id)]];
      var ex = umS_(h.o.uangMukaId) ? umSegarkanStatus_(g, umS_(h.o.uangMukaId), 'LPJ ' + hasil) : null; if (ex) rows.push(ex);
      try { umAudit_(g, rows); } catch (e) { umUpdate_(h, { statusLpj: 'DITERIMA', tanggalVerifikasi: '', diverifikasiOleh: '', alasanTolak: '' }); if (umS_(h.o.uangMukaId)) umSegarkanStatus_(g, umS_(h.o.uangMukaId), 'pemulihan'); return umErr_('AUDIT_FAILED', 'Audit gagal; status LPJ dipulihkan', null); }
      return okResult_('LPJ ' + hasil, { lpjId: umS_(h.o.id), statusLpj: hasil });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal memeriksa LPJ'); }
}

/* ---------- tautan LPJ -> transaksi ---------- */
function umLinkCheck_(h, t) {
  if (umS_(h.o.uangMukaId)) return umErr_('LPJ_UANG_MUKA', 'LPJ mempertanggungjawabkan uang muka ' + h.o.uangMukaId + '; tidak ditautkan ke transaksi lain (hitung ganda)', 'lpjId');
  if (umS_(h.o.statusLpj) === 'DITOLAK') return umErr_('STATUS_TIDAK_VALID', 'LPJ DITOLAK harus diperbaiki dulu', 'lpjId');
  if (!t) return null;
  if (umCairTrxIds_()[t.id]) return umErr_('TRANSAKSI_PENCAIRAN', 'transaksi ' + t.id + ' adalah pencairan uang muka; LPJ dipertanggungjawabkan lewat uangMukaId', 'transaksiId');
  var dipakai = umRows_('19_LPJ').filter(function (l) { return !umS_(l.archivedAt) && umS_(l.transaksiId) === t.id && umS_(l.id) !== umS_(h.o.id); }).reduce(function (s, l) { return s + umN_(l.nominal); }, 0);
  if (dipakai + umN_(h.o.nominal) > umN_(t.nominal) + 0.5) return umErr_('LPJ_EXCEEDS_TRANSACTION', 'Σ LPJ (' + (dipakai + umN_(h.o.nominal)) + ') melebihi nominal transaksi (' + t.nominal + ')', 'transaksiId');
  return null;
}
function umTulisTautan_(g, h, trxId, alasan) {
  var tid = 'lpjt_' + oblHash_(umS_(h.o.id) + '|' + trxId + '|' + new Date().toISOString());
  umUpdate_(h, { transaksiId: trxId });
  sgAppend_('34_LPJ_TAUTAN', ['id'], { id: tid, lpjId: umS_(h.o.id), transaksiId: trxId, status: 'AKTIF', alasan: alasan || '', dibuatOleh: g.identity.email, dibuatPada: new Date().toISOString() });
  return tid;
}
function opLinkLpj(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      var cur = umS_(h.o.transaksiId), tid = umS_(p.transaksiId);
      if (cur === tid && tid) return okResult_('Tidak berubah (sudah bertaut)', { lpjId: umS_(h.o.id), transaksiId: tid, unchanged: true });
      var ex = p.expect && typeof p.expect === 'object' ? p.expect : { transaksiId: '' };
      if (Object.prototype.hasOwnProperty.call(ex, 'transaksiId') && umS_(ex.transaksiId) !== cur) return umErr_('CONFLICT', 'Tautan LPJ diubah pengguna lain (sekarang: ' + (cur || 'kosong') + ')', 'transaksiId');
      if (cur) return umErr_('LPJ_SUDAH_BERTAUT', 'LPJ sudah bertaut transaksi ' + cur + '; batalkan dulu (opUnlinkLpj)', 'lpjId');
      var t = umTrxPengeluaranAktif_(tid); if (!t) return umErr_('INVALID_TRANSACTION', 'transaksi PENGELUARAN aktif tidak ditemukan: ' + tid, 'transaksiId');
      var e0 = umLinkCheck_(h, t); if (e0) return e0;
      var tn = umS_(h.o.tanggalNota) || umDate_(h.o.tanggal), beda = [];
      if (umS_(h.o.unit) && umS_(h.o.unit) !== umS_(t.unit)) beda.push('unit');
      if (tn && plPeriodeOfDate_(tn) !== plPeriodeOfDate_(umS_(t.tanggal).slice(0, 10))) beda.push('periode');
      if (beda.length && umS_(p.alasanPerbedaan).length < 10) return umErr_('PERLU_PEMERIKSAAN', 'LPJ dan transaksi berbeda ' + beda.join(' & ') + '; sertakan alasanPerbedaan (min. 10 karakter) untuk menautkan', 'transaksiId');
      var linkId = umTulisTautan_(g, h, tid, beda.length ? umS_(p.alasanPerbedaan) : '');
      try { umAudit_(g, [['LPJ_LINK', { transaksiId: '' }, { transaksiId: tid, tautanId: linkId, perbedaan: beda }, umS_(h.o.id)]]); }
      catch (e) { umUpdate_(h, { transaksiId: '' }); deleteRowById_('34_LPJ_TAUTAN', linkId); return umErr_('AUDIT_FAILED', 'Audit gagal; tautan dibatalkan', null); }
      return okResult_('LPJ ditautkan', { lpjId: umS_(h.o.id), transaksiId: tid, tautanId: linkId, perbedaan: beda });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menautkan LPJ'); }
}
/* Satu LPJ = paling banyak satu transaksi AKTIF: clientRequestId transaksi deterministik (bukan dari klien) 'lpj:<lpjId>', dan
   [P1_24] 'lpj:<lpjId>:<n>' setelah n kali tautan dibatalkan (opUnlinkLpj). Generasi baru hanya boleh membuat transaksi bila semua
   transaksi generasi sebelumnya sudah diarsip; transaksi lama yang masih aktif -> TRANSAKSI_LPJ_SEBELUMNYA_AKTIF (tautkan ulang lewat
   opLinkLpj atau arsipkan dulu). Sebelumnya: replay 'lpj:<lpjId>' menautkan ulang LPJ ke transaksi lama walaupun sudah diarsip. */
function umLpjCrid_(lpjId) {
  var n = umRows_('34_LPJ_TAUTAN').filter(function (x) { return umS_(x.lpjId) === umS_(lpjId) && umS_(x.status) === 'DIBATALKAN'; }).length;
  var prev = []; for (var i = 0; i < n; i++) prev.push(i ? 'lpj:' + lpjId + ':' + i : 'lpj:' + lpjId);
  return { crid: n ? 'lpj:' + lpjId + ':' + n : 'lpj:' + lpjId, sebelumnya: prev };
}
function opCreateExpenseFromLpj(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      var gen = umLpjCrid_(umS_(h.o.id)), crid = gen.crid, cur = umS_(h.o.transaksiId);
      if (cur) {
        var idem = checkIdempotency_(crid);
        if (idem.status === 'found' && idem.record.resultRefId === cur) return okResult_('Request sudah pernah diproses (idempotent replay)', { lpjId: umS_(h.o.id), transaksiId: cur, replay: true });
        return umErr_('LPJ_SUDAH_BERTAUT', 'LPJ sudah bertaut transaksi ' + cur, 'lpjId');
      }
      var e0 = umLinkCheck_(h, null); if (e0) return e0;
      for (var gi = 0; gi < gen.sebelumnya.length; gi++) {
        var ip = checkIdempotency_(gen.sebelumnya[gi]), tp = ip.status === 'found' ? getTransactionRaw_(ip.record.resultRefId) : null;
        if (tp && !tp.archivedAt) return umErr_('TRANSAKSI_LPJ_SEBELUMNYA_AKTIF', 'Transaksi ' + tp.id + ' yang dahulu dibuat dari LPJ ini masih aktif; tautkan ulang (Tautkan) atau arsipkan dulu sebelum membuat transaksi baru', 'lpjId');
      }
      var tgl = umS_(h.o.tanggalNota) || umDate_(h.o.tanggal); if (!tgl) return umErr_('VALIDATION_ERROR', 'tanggal nota LPJ tidak valid', 'tanggalNota');
      var t = opCreateExpense({ tanggal: tgl, unit: umS_(p.unit), nominal: umN_(h.o.nominal), akunId: umS_(p.akunId), metode: umS_(p.metode) || 'Tunai', kategori: umS_(p.kategori), subkategori: umS_(p.subkategori),
        penerima: umS_(h.o.item) || 'LPJ ' + umS_(h.o.id), catatan: 'Dari LPJ ' + umS_(h.o.id), sumber: 'lpj', clientRequestId: crid });
      if (!t || !t.ok) return t;
      var trxId = t.data.id, linkId = '';
      try {
        linkId = umTulisTautan_(g, h, trxId, '');
        umAudit_(g, [['LPJ_CREATE_EXPENSE', { transaksiId: '' }, { transaksiId: trxId, tautanId: linkId }, umS_(h.o.id)]]);
      } catch (e) {
        try { umUpdate_(umFind_('19_LPJ', h.o.id), { transaksiId: '' }); } catch (e2) { /* dilaporkan */ }
        if (linkId) { try { deleteRowById_('34_LPJ_TAUTAN', linkId); } catch (e3) { /* dilaporkan */ } }
        var rb = umRollbackTrx_(g, trxId, crid, e && e.message);
        return umErr_(rb ? 'WRITE_FAILED' : 'ROLLBACK_PARTIAL', 'Gagal menautkan LPJ; transaksi ' + (rb ? 'dibatalkan (rollback), tidak ada transaksi yatim' : 'GAGAL dibatalkan penuh - periksa ' + trxId), null);
      }
      return okResult_('Transaksi pengeluaran dibuat dari LPJ', { lpjId: umS_(h.o.id), transaksiId: trxId, tautanId: linkId });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal membuat pengeluaran dari LPJ'); }
}
function opUnlinkLpj(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var alasan = umS_(p.alasan); if (alasan.length < 10) return umErr_('ALASAN_WAJIB', 'alasan pembatalan tautan wajib (min. 10 karakter)', 'alasan');
  try {
    return withLock_(function () {
      var h = umLpjAktif_(p.lpjId); if (!h) return umErr_('NOT_FOUND', 'LPJ tidak ditemukan / diarsipkan: ' + p.lpjId, 'lpjId');
      var cur = umS_(h.o.transaksiId); if (!cur) return okResult_('Tidak berubah (LPJ belum bertaut)', { lpjId: umS_(h.o.id), unchanged: true });
      if (p.expect && Object.prototype.hasOwnProperty.call(p.expect, 'transaksiId') && umS_(p.expect.transaksiId) !== cur) return umErr_('CONFLICT', 'Tautan LPJ diubah pengguna lain (sekarang: ' + cur + ')', 'transaksiId');
      if (umS_(h.o.statusLpj) === 'DIVERIFIKASI') return umErr_('LPJ_TERVERIFIKASI', 'LPJ sudah diverifikasi; perubahan tautan butuh jalur koreksi', 'lpjId');
      var aktif = umRows_('34_LPJ_TAUTAN').filter(function (x) { return umS_(x.lpjId) === umS_(h.o.id) && umS_(x.status) === 'AKTIF'; });
      var now = new Date().toISOString();
      umUpdate_(h, { transaksiId: '' });
      aktif.forEach(function (x) { umUpdate_(umFind_('34_LPJ_TAUTAN', x.id), { status: 'DIBATALKAN', dibatalkanOleh: g.identity.email, dibatalkanPada: now, alasanBatal: alasan }); });
      try { umAudit_(g, [['LPJ_UNLINK', { transaksiId: cur }, { transaksiId: '', alasan: alasan, tautanDibatalkan: aktif.map(function (x) { return umS_(x.id); }) }, umS_(h.o.id)]]); }
      catch (e) { umUpdate_(h, { transaksiId: cur }); aktif.forEach(function (x) { umUpdate_(umFind_('34_LPJ_TAUTAN', x.id), { status: 'AKTIF', dibatalkanOleh: '', dibatalkanPada: '', alasanBatal: '' }); }); return umErr_('AUDIT_FAILED', 'Audit gagal; tautan dipulihkan', null); }
      return okResult_('Tautan LPJ dibatalkan (transaksi tidak dihapus)', { lpjId: umS_(h.o.id), transaksiSebelumnya: cur });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal membatalkan tautan LPJ'); }
}

/* ---------- laporan & dampak FCC/BDS03 (baca-saja) ---------- */
function opUangMukaLaporan(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    var per = umS_(opts.periode), list = umRows_('32_UANG_MUKA').map(function (u) {
      var p = umPosisi_(u);
      var dilaporkan = p.lpj.filter(function (l) { return ['DIAJUKAN', 'DITERIMA', 'DIVERIFIKASI'].indexOf(umS_(l.statusLpj)) !== -1; }).reduce(function (s, l) { return s + umN_(l.nominal); }, 0);
      return { id: umS_(u.id), kegiatan: umS_(u.kegiatan), status: umS_(u.status), statusTurunan: umS_(u.status) === 'DIBATALKAN' ? 'DIBATALKAN' : umStatusDari_(u, p), periodeCair: plPeriodeOfDate_(umS_(u.tanggalCair)), kasKeluar: umN_(u.nominalCair),
        /* [P1_23] pemisahan: (1) arus kas keluar, (2) pengeluaran aktual dilaporkan (nota LPJ diajukan/diterima/diverifikasi), (3) pengeluaran terverifikasi, (4) saldo belum dipertanggungjawabkan */
        /* [P1_24] arus kas keluar = nominal transaksi pencairan AKTIF (0 bila diarsip; sama dengan basis FCC); peringatan bila tidak konsisten */
        arusKasKeluar: p.arusKasKeluar, pengeluaranAktualDilaporkan: dilaporkan, pengeluaranTerverifikasi: p.notaTerverifikasi,
        notaTerverifikasi: p.notaTerverifikasi, notaBelumTerverifikasi: p.notaBelumTerverifikasi, pengembalian: p.pengembalian, saldoBelumDipertanggungjawabkan: p.saldo,
        transaksiCairId: umS_(u.transaksiCairId), pengembalianDiarsip: p.pengembalianDiarsip, peringatan: p.peringatan };
    }).filter(function (x) { return !per || x.periodeCair === per; });
    var tot = list.reduce(function (s, x) { ['kasKeluar', 'arusKasKeluar', 'pengeluaranAktualDilaporkan', 'pengeluaranTerverifikasi', 'notaTerverifikasi', 'notaBelumTerverifikasi', 'pengembalian', 'saldoBelumDipertanggungjawabkan'].forEach(function (k) { s[k] = (s[k] || 0) + x[k]; }); return s; }, {});
    return okResult_('Laporan uang muka (read-only)', { periode: per || '*', uangMuka: list, total: tot,
      dampakFccBds03: { pencairanTercatatSebagaiPengeluaranAktual: tot.kasKeluar || 0, bebanTerverifikasiMenurutOpsiC: tot.notaTerverifikasi || 0, pengembalianTercatatSebagaiPenerimaan: tot.pengembalian || 0,
        selisihPengeluaranBilaBasisBeban: (tot.kasKeluar || 0) - (tot.notaTerverifikasi || 0),
        catatan: 'Formula FCC/BDS03 TIDAK diubah: saat ini pencairan dihitung sebagai PENGELUARAN aktual penuh dan pengembalian sebagai PENERIMAAN. Angka beban terverifikasi hanya untuk keputusan perubahan definisi KPI.' },
      computedAt: new Date().toISOString() });
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menyusun laporan uang muka'); }
}

/* ---------- lapis pelindung jalur lama: opRecordBatch('lpj') publik (dipanggil RecordEngine) ---------- */
/* Kolom status/verifikasi/uang muka LPJ hanya diisi operasi di atas; nilai dari jalur publik dibuang. */
function umLpjStripPublik_(row) { var out = {}; Object.keys(row).forEach(function (k) { if (UM_LPJ_COLS_.indexOf(k) === -1) out[k] = row[k]; }); return out; }
/* LPJ yang mempertanggungjawabkan uang muka atau sudah DIVERIFIKASI: tautan transaksi tidak dapat diubah dan baris tidak dapat
   diarsip lewat jalur publik (null = boleh). */
function umLpjPublikTolak_(live, cur, next, op) {
  var c = function (h) { var i = live.indexOf(h); return i === -1 || !cur ? '' : opStr_(cur[i]); };
  var terkunci = c('uangMukaId') !== '' || c('statusLpj') === 'DIVERIFIKASI';
  if (!terkunci) return null;
  if (op === 'archive') return { code: 'LPJ_TERKUNCI', message: 'LPJ uang muka / terverifikasi tidak dapat diarsip lewat jalur ini' };
  var ti = live.indexOf('transaksiId');
  if (ti !== -1 && next && opStr_(next[ti]) !== c('transaksiId')) return { code: 'LPJ_TERKUNCI', message: 'Tautan transaksi LPJ uang muka / terverifikasi hanya lewat opLinkLpj/opUnlinkLpj' };
  return null;
}
/* [P1_23 D-LPJ] Satu jalur efektif: setelah skema tautan disiapkan (34_LPJ_TAUTAN ada), tautan LPJ -> transaksi TIDAK lagi dapat diubah
   lewat opRecordBatch('lpj') publik (jalur P0-T1 lama + heuristik 62 hari); hanya opLinkLpj / opCreateExpenseFromLpj / opUnlinkLpj.
   Sebelum skema disiapkan, jalur lama tetap satu-satunya yang berfungsi (operasi baru menjawab SCHEMA_ADDITIVE_REQUIRED). */
function umLpjTautanLewatOperasi_(live, cur, next) {
  if (!ss_().getSheetByName('34_LPJ_TAUTAN')) return null;
  var ti = live.indexOf('transaksiId'); if (ti === -1 || !next) return null;
  var lama = cur ? opStr_(cur[ti]) : '';
  return opStr_(next[ti]) !== lama ? { code: 'GUNAKAN_OPERASI_TAUTAN', message: 'Tautan LPJ ke transaksi hanya lewat opLinkLpj / opCreateExpenseFromLpj / opUnlinkLpj (skema tautan aktif)' } : null;
}

/* ---------- [P1_23] pembatalan uang muka ---------- */
/* DIBATALKAN = uang muka tidak akan dipertanggungjawabkan lewat LPJ (mis. kegiatan batal). Jejak pencairan TIDAK dihapus: transaksi
   kas pencairan tetap, saldo tetap dilaporkan dan diselesaikan lewat opUangMukaKembali (pengembalian tetap diterima). Ditolak bila
   sudah ada LPJ diajukan/diterima/diverifikasi untuk uang muka ini (harus diselesaikan/ditolak dulu). */
function opUangMukaBatal(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  p = p && typeof p === 'object' ? p : {};
  var alasan = umS_(p.alasan); if (alasan.length < 10) return umErr_('ALASAN_WAJIB', 'alasan pembatalan wajib (min. 10 karakter)', 'alasan');
  try {
    return withLock_(function () {
      var h = umFind_('32_UANG_MUKA', p.uangMukaId); if (!h) return umErr_('NOT_FOUND', 'uang muka tidak ditemukan: ' + p.uangMukaId, 'uangMukaId');
      var st = umS_(h.o.status);
      if (st === 'DIBATALKAN') return okResult_('Tidak berubah (sudah DIBATALKAN)', { id: umS_(h.o.id), status: st, unchanged: true });
      if (p.expect && Object.prototype.hasOwnProperty.call(p.expect, 'status') && umS_(p.expect.status) !== st) return umErr_('CONFLICT', 'Status uang muka berubah (sekarang: ' + st + ')', 'status');
      if (st === 'SELESAI') return umErr_('STATUS_TIDAK_VALID', 'uang muka SELESAI tidak dapat dibatalkan', 'uangMukaId');
      var pos = umPosisi_(h.o), aktif = pos.lpj.filter(function (l) { return ['DIAJUKAN', 'DITERIMA', 'DIVERIFIKASI'].indexOf(umS_(l.statusLpj)) !== -1; });
      if (aktif.length) return umErr_('LPJ_MASIH_AKTIF', 'Ada LPJ ' + aktif.map(function (l) { return umS_(l.id) + ' (' + umS_(l.statusLpj) + ')'; }).join(', ') + ' untuk uang muka ini; selesaikan/tolak dulu', 'uangMukaId');
      var before = { status: st, alasanStatus: umS_(h.o.alasanStatus) }, now = new Date().toISOString();
      umUpdate_(h, { status: 'DIBATALKAN', alasanStatus: alasan.slice(0, 300), updatedAt: now, updatedBy: g.identity.email });
      try { umAudit_(g, [['UANG_MUKA_BATAL', before, { status: 'DIBATALKAN', alasan: alasan, saldoBelumDipertanggungjawabkan: pos.saldo, transaksiCairId: umS_(h.o.transaksiCairId) }, umS_(h.o.id)]]); }
      catch (e) { umUpdate_(h, before); return umErr_('AUDIT_FAILED', 'Audit gagal; status dipulihkan', null); }
      return okResult_('Uang muka dibatalkan (pencairan & saldo tetap tercatat)', { id: umS_(h.o.id), status: 'DIBATALKAN', saldoBelumDipertanggungjawabkan: pos.saldo });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal membatalkan uang muka'); }
}

/* ---------- [P1_23] dampak FCC / BDS03: before/after (AUDIT SAJA, formula tidak diubah) ---------- */
/* sekarang = opFinancialControl (pencairan = PENGELUARAN aktual penuh; pengembalian = PENERIMAAN).
   simulasi basis beban opsi C (tidak diterapkan): pengeluaran = sekarang - pencairan periode + nota LPJ DIVERIFIKASI ber-tanggalNota
   di periode; penerimaan = sekarang - pengembalian periode. BDS03: jumlah transaksi pencairan yang ikut populasi PENGELUARAN. */
function opUangMukaDampakFcc(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  var r0 = umReady_(); if (r0) return r0;
  opts = opts && typeof opts === 'object' ? opts : {};
  var per = umS_(opts.periode); if (!plIsPeriodLabel_(per)) return umErr_('VALIDATION_ERROR', 'periode wajib "<Bulan> <Tahun>"', 'periode');
  try {
    var f = opFinancialControl(per); if (!f || !f.ok) return f;
    var trxArsip = {}; readTrxRows_().forEach(function (t) { if (t.archivedAt) trxArsip[String(t.id)] = true; });
    var cair = umRows_('32_UANG_MUKA').filter(function (u) { return umS_(u.transaksiCairId) && !trxArsip[umS_(u.transaksiCairId)] && plPeriodeOfDate_(umS_(u.tanggalCair)) === per; });
    var kembali = umRows_('33_UANG_MUKA_KEMBALI').filter(function (k) { return !trxArsip[umS_(k.transaksiId)] && plPeriodeOfDate_(umS_(k.tanggal)) === per; });
    var nota = umRows_('19_LPJ').filter(function (l) { return !umS_(l.archivedAt) && umS_(l.uangMukaId) && umS_(l.statusLpj) === 'DIVERIFIKASI' && plPeriodeOfDate_(umS_(l.tanggalNota)) === per; });
    var sum = function (a, k) { return a.reduce(function (s, x) { return s + umN_(x[k]); }, 0); };
    var cP = sum(cair, 'nominalCair'), kP = sum(kembali, 'nominal'), nP = sum(nota, 'nominal'), A = f.data.actual;
    return okResult_('Dampak FCC/BDS03 (audit, read-only)', { periode: per,
      sekarang: { pengeluaranAktual: A.expensePeriode, penerimaan: A.incomePeriode, posisiKas: A.cashPosition },
      simulasiBasisBeban: { pengeluaranAktual: A.expensePeriode - cP + nP, penerimaan: A.incomePeriode - kP, posisiKas: A.cashPosition },
      komponen: { pencairanPeriode: cP, pengembalianPeriode: kP, notaTerverifikasiPeriode: nP, transaksiPencairanDalamPopulasiBds03: cair.length },
      catatan: 'Audit saja. FCC/BDS03 & 31 KPI tidak diubah; posisi kas tidak berubah pada kedua basis (arus kas tetap sama).', computedAt: new Date().toISOString() });
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung dampak FCC'); }
}
