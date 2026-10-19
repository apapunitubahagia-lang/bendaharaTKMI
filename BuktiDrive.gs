/**
 * BuktiDrive.gs
 * Upload bukti ke Google Drive + pencatatan di 10_BUKTI (driveFileId, driveFileUrl).
 * fileRef (Base64 legacy) TIDAK dipakai lagi untuk bukti baru; baris lama tidak diubah.
 *
 * Keamanan: authorize di server, batas ukuran, whitelist tipe file, nama file disanitasi,
 * file dibuat di folder khusus (privat, mengikuti izin Drive pemilik script). Bila penulisan
 * baris 10_BUKTI gagal, file yang BARU dibuat dipindah ke trash (tidak ada orphan); tidak
 * pernah menyentuh file/baris lain. Idempotent berdasarkan id bukti.
 * [P1-E] transaksiId (bila diisi) wajib transaksi aktif; baris bukti generik (opRecordBatch) diatur RecordGuard.gs.
 *
 * MEMBUTUHKAN IZIN DRIVE (scope drive) - muncul prompt otorisasi saat deploy ulang.
 * STATUS: sandbox lokal dengan DriveApp tiruan. BELUM dijalankan di Apps Script sungguhan.
 */
var OP_BUKTI_FOLDER_ = 'Bendahara_Bukti';
var OP_BUKTI_MAX_B64_ = 12 * 1024 * 1024; // ~9 MB file
var OP_BUKTI_MIME_ = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/* [P1_19 E / GAP-005] Folder bukti dapat dikunci ke ID tertentu lewat Script Property BUKTI_FOLDER_ID (proyek uji WAJIB mengisinya
   dengan folder khusus pengujian). Bila proyek dalam mode uji (Script Property LIVE_TEST_SPREADSHEET_ID = spreadsheet aktif) dan
   BUKTI_FOLDER_ID kosong -> unggah DITOLAK (tidak pernah mencari folder produksi berdasarkan nama). Tanpa kedua properti, perilaku
   lama (cari/buat folder berdasarkan nama) tidak berubah. ID tidak ditemukan -> gagal tertutup. */
var OP_BUKTI_PROP_FOLDER_ = 'BUKTI_FOLDER_ID';
function opBuktiFolder_() {
  var props = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
  var fid = props ? opStr_(props.getProperty(OP_BUKTI_PROP_FOLDER_)) : '';
  if (fid) {
    var f = null; try { f = DriveApp.getFolderById(fid); } catch (e) { f = null; }
    if (!f) { var e1 = new Error('Folder bukti (Script Property ' + OP_BUKTI_PROP_FOLDER_ + ') tidak ditemukan / tidak dapat diakses'); e1.code = 'BUKTI_FOLDER_UNAVAILABLE'; throw e1; }
    return f;
  }
  var testId = props ? opStr_(props.getProperty('LIVE_TEST_SPREADSHEET_ID')) : '';
  if (testId && testId === String(ss_().getId())) { var e2 = new Error('Mode uji: Script Property ' + OP_BUKTI_PROP_FOLDER_ + ' wajib diisi folder bukti khusus pengujian'); e2.code = 'TEST_FOLDER_REQUIRED'; throw e2; }
  var it = DriveApp.getFoldersByName(OP_BUKTI_FOLDER_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(OP_BUKTI_FOLDER_);
}
function opUploadBukti(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object') return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  var id = opStr_(p.id);
  if (!OP_ID_RE_.test(id)) return errResult_('VALIDATION_ERROR', 'id bukti tidak valid', 'id');
  var mime = opStr_(p.mimeType).toLowerCase();
  if (OP_BUKTI_MIME_.indexOf(mime) === -1) return errResult_('VALIDATION_ERROR', 'Tipe file tidak diizinkan (PDF/PNG/JPEG/WEBP/GIF)', 'mimeType');
  var b64 = opStr_(p.base64);
  if (!b64) return errResult_('VALIDATION_ERROR', 'isi file kosong', 'base64');
  if (b64.length > OP_BUKTI_MAX_B64_) return errResult_('VALUE_TOO_LARGE', 'File terlalu besar (maks ~9 MB)', 'base64');
  var name = opStr_(p.fileName).replace(/[^A-Za-z0-9._\- ]/g, '_').slice(0, 120) || ('bukti_' + id);
  var trxId = opStr_(p.transaksiId);
  if (opStr_(p.tanggal) !== '') { var te = sgDateError_(typeof p.tanggal === 'string' ? p.tanggal : opStr_(p.tanggal)); if (te) return errResult_('VALIDATION_ERROR', 'tanggal: ' + te, 'tanggal'); } // [P0-T4] opsional (kosong = hari ini)
  try {
    return withLock_(function () {
      if (trxId) { // [P1-E] bukti hanya untuk transaksi aktif yang ada; file tidak dibuat bila referensi salah
        var tb = getTransactionRaw_(trxId);
        if (!tb || tb.archivedAt) return errResult_('INVALID_TRANSACTION', 'Transaksi untuk bukti tidak ditemukan atau sudah diarsipkan: ' + trxId, 'transaksiId', id);
      }
      var m = opSheetModel_('10_BUKTI');
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 10_BUKTI tidak ditemukan', null);
      var c = function (h) { return m.live.indexOf(h); };
      if (['id', 'driveFileId', 'driveFileUrl'].some(function (h) { return c(h) === -1; })) return errResult_('SCHEMA_MISMATCH', 'Kolom id/driveFileId/driveFileUrl tidak ada di 10_BUKTI', null);
      for (var i = 0; i < m.rows.length; i++) {
        if (String(m.rows[i][c('id')]) === id) {
          var ex = opRowObj_(m.live, m.rows[i]);
          if (opStr_(ex.driveFileId) !== '') return okResult_('Bukti sudah ada (idempotent)', opJsonSafe_(ex));
        }
      }
      var file = null;
      try {
        var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
        file = opBuktiFolder_().createFile(blob);
        var row = m.live.map(function () { return ''; });
        var set = function (h, v) { if (c(h) !== -1) row[c(h)] = v; };
        set('id', id); set('kategori', opStr_(p.kategori) || 'Bukti'); set('transaksiId', trxId); set('judul', opStr_(p.judul).slice(0, 200) || name);
        set('tanggal', opStr_(p.tanggal) || new Date().toISOString().slice(0, 10)); set('driveFileId', file.getId()); set('driveFileUrl', file.getUrl());
        var existingIdx = -1;
        for (var k = 0; k < m.rows.length; k++) { if (String(m.rows[k][c('id')]) === id) { existingIdx = k; break; } }
        if (existingIdx >= 0) { var merged = m.rows[existingIdx].slice(); ['driveFileId', 'driveFileUrl', 'kategori', 'judul', 'tanggal'].forEach(function (h) { if (c(h) !== -1 && row[c(h)] !== '') merged[c(h)] = row[c(h)]; }); if (trxId && c('transaksiId') !== -1) merged[c('transaksiId')] = trxId; m.sh.getRange(existingIdx + 2, 1, 1, m.lastCol).setValues([merged]); row = merged; }
        else m.sh.getRange(m.lastRow + 1, 1, 1, m.lastCol).setValues([row]);
        var saved = opRowObj_(m.live, row), out = okResult_('Bukti diunggah ke Drive', opJsonSafe_(saved));
        try { opAuditBulk_([['BUKTI_UPLOAD', null, { id: id, transaksiId: trxId, driveFileId: file.getId(), mime: mime, bytes: b64.length }, id]], g.identity.email); } catch (e) {
          // [P0-B] audit wajib gagal -> baris 10_BUKTI dipulihkan dan file yang baru dibuat dibuang ke trash
          var rbErr = null;
          try { if (existingIdx >= 0) m.sh.getRange(existingIdx + 2, 1, 1, m.lastCol).setValues([m.rows[existingIdx]]); else sgUndoAppend_(m.sh, m.lastRow + 1, 1); } catch (re) { rbErr = re; }
          try { file.setTrashed(true); } catch (e3) { /* dicatat di Logger */ Logger.log('trash bukti gagal: ' + e3.message); }
          if (rbErr) return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan baris bukti gagal: ' + rbErr.message, null, id);
          return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; unggahan bukti dibatalkan', null, id);
        }
        return out;
      } catch (e) {
        if (file) { try { file.setTrashed(true); } catch (e2) { /* biarkan */ } }
        if (e && (e.code === 'BUKTI_FOLDER_UNAVAILABLE' || e.code === 'TEST_FOLDER_REQUIRED')) return errResult_(e.code, String(e.message), 'folder', id); // [P1_19 E]
        return errResult_('WRITE_FAILED', 'Gagal mengunggah bukti', null);
      }
    });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal mengunggah bukti', null); }
}
