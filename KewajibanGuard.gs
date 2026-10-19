/**
 * KewajibanGuard.gs - [P1-IMP Prioritas C, T8] Status sumber perhitungan kewajiban sebelum daftar/angka kewajiban dihitung.
 *
 * Membedakan empat keadaan (tidak pernah mengembalikan daftar kosong / angka nol sebagai pengganti kesalahan):
 *   LENGKAP                    : sumber ada, kolom wajib lengkap, periodeAktif label bulan sah -> boleh dihitung
 *                                (hasil kosong = memang tidak ada kewajiban; "periode valid dengan kewajiban nol");
 *   PERIODE_AKTIF_TIDAK_VALID  : 15_SETTINGS.periodeAktif terisi tetapi bukan "<Bulan> <Tahun>" (mis. FINAL "2026-10-01", GAP-008);
 *   SUMBER_TIDAK_TERSEDIA      : sheet sumber wajib tidak ada;
 *   SUMBER_TIDAK_LENGKAP       : kolom wajib (SG_REQUIRED_) hilang/ganda -> kode SCHEMA_MISMATCH (konsisten dengan T8).
 * periodeAktif KOSONG/tidak ada tetap memakai cadangan bulan berjalan yang sudah ada (oblLoadContext_, sama dengan klien).
 * Dipakai: opObligations, opObligationSnapshot (ObligationEngine.gs), opAllocGuard_ (AllocationGuard.gs),
 *          engineAllocStatusFor_ (TransactionEngine.gs, cabang alokasi sebagian), kewajiban impor pemasukan (ImportEngine.gs).
 * Tidak mengubah formula/kebijakan kewajiban. Read-only.
 * DEPENDENSI: SchemaGuard.gs (sgHeaderModel_, sgModel_, sgDateStr_, sgPeriodLabelError_, SG_REQUIRED_), OperationalAPI.gs (opStr_),
 *             TransactionEngine.gs (ss_, errResult_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var KG_SHEETS_ = ['01_SISWA', '02_KOMPONEN', '03_TARIF', '04_KEWAJIBAN', '06_ALOKASI', '15_SETTINGS'];
function kgStatus_() {
  var ss = ss_(), missing = KG_SHEETS_.filter(function (s) { return !ss.getSheetByName(s); });
  if (missing.length) return { ok: false, code: 'SUMBER_TIDAK_TERSEDIA', statusData: 'SUMBER_TIDAK_TERSEDIA', message: 'Sumber kewajiban tidak tersedia: sheet ' + missing.join(', ') + ' tidak ditemukan', sheets: missing };
  for (var i = 0; i < KG_SHEETS_.length; i++) {
    try { sgHeaderModel_(KG_SHEETS_[i], SG_REQUIRED_[KG_SHEETS_[i]] || []); }
    catch (e) {
      if (e && e.code === 'SCHEMA_MISMATCH') return { ok: false, code: 'SCHEMA_MISMATCH', statusData: 'SUMBER_TIDAK_LENGKAP', message: 'Sumber kewajiban tidak lengkap: ' + String(e.message || e), sheets: [KG_SHEETS_[i]], missing: e.missing || [] };
      throw e;
    }
  }
  var m = sgModel_('15_SETTINGS', ['key', 'value']), raw = null;
  m.values.forEach(function (r) { if (raw === null && opStr_(r[m.idx.key]) === 'periodeAktif') raw = r[m.idx.value]; });
  var v = raw === null ? '' : opStr_(sgDateStr_(raw));
  if (v !== '' && sgPeriodLabelError_(v, false)) return { ok: false, code: 'PERIODE_AKTIF_TIDAK_VALID', statusData: 'PERIODE_AKTIF_TIDAK_VALID', message: 'Periode aktif tidak valid ("' + v + '"); daftar kewajiban tidak dihitung. Normalisasi lewat opPeriodeAktifPlan/opPeriodeAktifApply.', periodeAktif: v };
  return { ok: true, statusData: 'LENGKAP', periodeAktif: v };
}
function kgErr_(ks) {
  var r = errResult_(ks.code, ks.message, 'periodeAktif');
  r.statusData = ks.statusData; if (ks.sheets) r.sheets = ks.sheets; if (ks.missing) r.missing = ks.missing; if (ks.periodeAktif !== undefined) r.periodeAktif = ks.periodeAktif;
  return r;
}
function kgThrowIfBad_() { var ks = kgStatus_(); if (!ks.ok) { var e = new Error(ks.message); e.code = ks.code; throw e; } return ks; }
