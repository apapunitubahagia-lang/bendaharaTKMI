/**
 * PeriodeAktifAdmin.gs - [P1-IMP/D-T4b, F8] Normalisasi 15_SETTINGS.periodeAktif HANYA lewat fungsi administratif eksplisit.
 *
 * Latar: nilai FINAL periodeAktif berformat tanggal ("2026-10-01", GAP-008). Klien kini menampilkan KPI sebagai
 * "DATA TIDAK TERSEDIA (periode aktif tidak valid)" untuk nilai seperti itu (bukan skor 0). Fungsi ini menyediakan
 * jalan pemulihan yang beraudit; TIDAK pernah dipanggil otomatis (boot, impor, sinkron, fungsi lain).
 *
 * - opPeriodeAktifPlan()     : PRATINJAU read-only. Nilai sekarang, sah/tidak, usulan label (hanya bila nilai berupa tanggal
 *                              kalender YYYY-MM-DD atau Date sel -> "<Bulan> <Tahun>" dari bulan tanggal itu), dan alasan bila
 *                              tidak ada usulan. Tidak menulis apa pun.
 * - opPeriodeAktifApply(p)   : p = {confirm:'NORMALISASI_PERIODE_AKTIF', nilaiSekarang, nilaiBaru}. Di dalam lock: nilai sekarang
 *                              dibaca ulang dan WAJIB sama dengan nilaiSekarang yang dilihat penyetuju (beda -> CONFLICT);
 *                              nilaiBaru WAJIB label bulan sah (sgPeriodLabelError_). Audit SETTING_UPDATE + PERIODE_AKTIF_DINORMALISASI
 *                              ditulis dalam satu append; audit gagal -> nilai dipulihkan (gagal tertutup).
 *   Penyetuju boleh memilih label lain dari usulan (keputusan manusia); usulan hanya bantuan.
 *
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, opJsonSafe_, OP_WRITE_ROLES_, OP_READ_ROLES_), RecordEngine.gs (opSheetModel_,
 *             opAuditBulk_, opRestoreRows_), SchemaGuard.gs (sgDateStr_, sgDateError_, sgPeriodLabelError_), PeriodLock.gs (plPeriodeOfDate_),
 *             TransactionEngine.gs (withLock_, errResult_, okResult_, SHT_SETTINGS).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var PA_CONFIRM_ = 'NORMALISASI_PERIODE_AKTIF';

function paRead_() {
  var m = opSheetModel_(SHT_SETTINGS);
  if (!m) { var e = new Error('Sheet 15_SETTINGS tidak ditemukan'); e.code = 'SCHEMA_MISMATCH'; throw e; }
  var kc = m.live.indexOf('key'), vc = m.live.indexOf('value');
  if (kc === -1 || vc === -1) { var e2 = new Error('Header key/value tidak ada di 15_SETTINGS'); e2.code = 'SCHEMA_MISMATCH'; throw e2; }
  var idx = -1;
  m.rows.forEach(function (r, i) { if (opStr_(r[kc]) === 'periodeAktif' && idx === -1) idx = i; });
  var raw = idx >= 0 ? m.rows[idx][vc] : null;
  var nilai = idx >= 0 ? opStr_(sgDateStr_(raw)) : '';
  return { m: m, kc: kc, vc: vc, idx: idx, raw: raw, nilai: nilai };
}
function paPlanOf_(st) {
  var sah = st.idx >= 0 && !sgPeriodLabelError_(st.nilai, false);
  var usulan = '', alasan = '';
  if (st.idx < 0) alasan = 'Key periodeAktif tidak ada di 15_SETTINGS; tetapkan lewat Pengaturan (label bulan)';
  else if (sah) alasan = 'Nilai sudah label bulan yang sah; tidak perlu normalisasi';
  else if (!sgDateError_(st.nilai)) usulan = plPeriodeOfDate_(st.nilai);
  else alasan = 'Nilai bukan tanggal kalender YYYY-MM-DD maupun label bulan; usulan tidak dapat diturunkan, pilih label secara manual';
  return { key: 'periodeAktif', nilaiSekarang: st.nilai, tipeSel: st.raw instanceof Date ? 'Date' : typeof st.raw, sah: sah,
    usulan: usulan, alasan: alasan, perluNormalisasi: st.idx >= 0 && !sah, konfirmasi: PA_CONFIRM_ };
}
function opPeriodeAktifPlan() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try { return okResult_('Pratinjau normalisasi periodeAktif (read-only; tidak ada data yang diubah)', paPlanOf_(paRead_())); }
  catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca periodeAktif'); }
}
function opPeriodeAktifApply(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  if (p.confirm !== PA_CONFIRM_) return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (' + PA_CONFIRM_ + ')', 'confirm');
  var baru = opStr_(p.nilaiBaru), lama = opStr_(p.nilaiSekarang);
  var le = sgPeriodLabelError_(baru, false);
  if (le) return errResult_('VALIDATION_ERROR', 'nilaiBaru: ' + le, 'nilaiBaru');
  try {
    return withLock_(function () {
      var st = paRead_();
      if (st.idx < 0) return errResult_('NOT_FOUND', 'Key periodeAktif tidak ada di 15_SETTINGS', 'key');
      if (st.nilai !== lama) return errResult_('CONFLICT', 'Nilai periodeAktif berubah sejak pratinjau ("' + st.nilai + '"); jalankan pratinjau ulang', 'nilaiSekarang');
      if (st.nilai === baru) { var same = okResult_('periodeAktif sudah bernilai ' + baru, { nilai: baru }); same.data.unchanged = true; return same; }
      var m = st.m, rowNum = st.idx + 2, orig = m.rows[st.idx].slice(), nx = orig.slice(), uc = m.live.indexOf('updatedAt');
      nx[st.vc] = baru; if (uc !== -1) nx[uc] = new Date().toISOString();
      m.sh.getRange(rowNum, 1, 1, m.lastCol).setValues([nx]);
      try {
        opAuditBulk_([['SETTING_UPDATE', { key: 'periodeAktif', value: st.nilai }, { key: 'periodeAktif', value: baru }, 'periodeAktif'],
          ['PERIODE_AKTIF_DINORMALISASI', { nilai: st.nilai, tipeSel: st.raw instanceof Date ? 'Date' : typeof st.raw }, { nilai: baru, usulanSistem: paPlanOf_(st).usulan, disetujuiOleh: g.identity.email }, 'periodeAktif']], g.identity.email);
      } catch (e) {
        try { opRestoreRows_(m.sh, m.lastCol, [{ rowNum: rowNum, orig: orig }], 0, 0); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan periodeAktif gagal: ' + re.message, null); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; periodeAktif tidak diubah', null);
      }
      return okResult_('periodeAktif dinormalisasi', { sebelum: st.nilai, sesudah: baru });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menormalisasi periodeAktif'); }
}
