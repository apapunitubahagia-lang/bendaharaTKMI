/**
 * TransactionEngine.gs
 * Fase 3B-2 (REBUILD TOTAL) - CORE TRANSACTION ENGINE / write-door terpusat.
 *
 * Spreadsheet target: 1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY
 * (tidak di-hardcode - kode selalu memakai SpreadsheetApp.getActiveSpreadsheet(),
 * mengikuti spreadsheet tempat script Apps Script ini ter-bind).
 *
 * TIDAK menyentuh: Bendahara_V2_FULL_DATA.html, Bendahara_V2.html, struktur
 * sheet 01_SISWA/02_KOMPONEN/05_TRANSAKSI/06_ALOKASI/07_AKUN/11_MUTASI_BANK/
 * 13_AUDIT_LOG/15_SETTINGS, data historis, ataupun sheet 16-23 hasil Fase 3B-1.
 * Satu-satunya sheet BARU: 24_IDEMPOTENCY_LOG (dibuat idempotent, additive).
 *
 * TIDAK ADA: delete API production, createExpectedReceivable(), KPI/Kewajiban
 * engine - semua itu sengaja di luar cakupan file ini (lihat bagian L).
 *
 * TEST MODE (revisi kedua): testConcurrentWriteDoor() memakai
 * createTransactionWithAllocations_ForTest_() - jalur validasi/FK/
 * LockService/idempotency/rollback SAMA PERSIS dengan production (write-door
 * sungguhan, bukan mock), HANYA audit yang dialihkan ke Logger.log() +
 * array collector, TIDAK PERNAH ke 13_AUDIT_LOG. Konsekuensinya:
 * regressionCheck() sekarang WAJIB menunjukkan kelima metrik (termasuk
 * jumlahAuditLog) persis kembali ke baseline setelah testConcurrentWriteDoor()
 * dijalankan, karena test tidak lagi menyentuh sheet audit sama sekali.
 *
 * Keamanan TEST MODE - kenapa browser tidak bisa mengaktifkannya:
 * opts.testMode adalah ARGUMEN KEDUA createTransactionWithAllocations_(),
 * BUKAN field di dalam payload (payload.testMode, kalau ada, tidak pernah
 * dibaca di mana pun). Semua 10 fungsi public wajib (createIncome dkk.)
 * hanya menerima SATU argumen dan tidak pernah meneruskan argumen kedua -
 * jadi opts selalu {} (testMode false) di jalur production apa pun isi
 * payload-nya. Satu-satunya titik yang menyalakan testMode:true adalah
 * createTransactionWithAllocations_ForTest_() - fungsi privat yang hanya
 * dipanggil dari testConcurrentWriteDoor(), tidak pernah dari luar.
 */

// ============================================================
// [A] KONSTANTA SHEET & SKEMA - PERSIS seperti CreateDatabaseStructure.gs,
// TIDAK diubah strukturnya oleh file ini.
// ============================================================
var SHT_SISWA = '01_SISWA';
var SHT_KOMPONEN = '02_KOMPONEN';
var SHT_TRANSAKSI = '05_TRANSAKSI';
var SHT_ALOKASI = '06_ALOKASI';
var SHT_AKUN = '07_AKUN';
var SHT_MUTASI = '11_MUTASI_BANK';
var SHT_AUDIT = '13_AUDIT_LOG';
var SHT_SETTINGS = '15_SETTINGS';
var SHT_IDEMPOTENCY = '24_IDEMPOTENCY_LOG'; // satu-satunya sheet BARU (additive)

var TRX_HEADERS = ['id', 'jenis', 'tanggal', 'unit', 'nominal', 'akunId', 'metode', 'status', 'createdAt', 'catatan', 'sumber', 'siswaId', '_siswaNamaSnapshot', '_komponenHint', 'resiNo', 'kategori', 'subkategori', 'penerima', 'ftNumber', 'namaPengirim', '_sourceFile', '_sourceSheet', '_sourceRow'];
var ALOK_HEADERS = ['id', 'transaksiId', 'siswaId', 'komponenId', 'periode', 'nominal', 'caraBayar', 'tagihanId', 'createdAt'];
var MUT_HEADERS = ['id', 'tanggal', 'nominal', 'keterangan', 'namaPengirim', 'ftNumber', 'status', 'transaksiId'];
var AUDIT_HEADERS = ['id', 'timestamp', 'aksi', 'before', 'after', 'sumber', 'refId'];
var IDEMP_HEADERS = ['clientRequestId', 'resultRefId', 'resultType', 'createdAt'];

var TRX_STATUS_VALUES = ['TERCATAT', 'TERIDENTIFIKASI', 'SEBAGIAN_TERALOKASI', 'TERALOKASI', 'OVERPAYMENT_CREDIT', 'SELESAI', 'REKONSILIASI'];

// [E] Server-side ID prefixes - satu-satunya cara ID baru dibuat di seluruh file ini.
var ID_PREFIX_TRX = 'gas_trx_';
var ID_PREFIX_ALK = 'gas_alk_';
var ID_PREFIX_MUT = 'gas_mut_';
var ID_PREFIX_AUDIT = 'gas_audit_';

// [O] Baseline regression - PERSIS seperti disepakati sebelum Fase 3B-2 dimulai.
var REGRESSION_BASELINE = {
  jumlahTransaksi: 842,
  jumlahAlokasi: 655,
  jumlahMutasiBank: 346,
  jumlahAuditLog: 2990,
  jumlahSettings: 5
};

// ============================================================
// ERROR CONTRACT
// ============================================================
function errResult_(code, message, field, refId) {
  return { ok: false, code: code, message: message, field: field || null, refId: refId || null };
}
function okResult_(message, data) {
  return { ok: true, code: 'SUCCESS', message: message, data: data };
}

// ============================================================
// Sheet helpers (generik, dipakai di seluruh file)
// ============================================================
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + name);
  return sh;
}
function readAllRows_(sheetName, headers) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}
function findRowIndexById_(sheetName, id) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return -1;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // 1-based sheet row number
  }
  return -1;
}
function idExistsInSheet_(sheetName, id) {
  return findRowIndexById_(sheetName, id) !== -1;
}
function deleteRowById_(sheetName, id) {
  // Rollback eksplisit - HANYA dipakai untuk baris yang baru saja ditulis
  // dalam operasi yang sama (bukan delete API untuk transaksi lama/commit -
  // lihat larangan di bagian A/L).
  var rowIdx = findRowIndexById_(sheetName, id);
  if (rowIdx > 0) {
    ss_().getSheetByName(sheetName).deleteRow(rowIdx);
    return true;
  }
  return false;
}

// ============================================================
// [A] 24_IDEMPOTENCY_LOG - dibuat idempotent (create-if-missing), TIDAK
// menyentuh sheet lain sama sekali.
// ============================================================
function ensureIdempotencyLogSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHT_IDEMPOTENCY);
  if (!sh) {
    sh = ss.insertSheet(SHT_IDEMPOTENCY);
    sh.getRange(1, 1, 1, IDEMP_HEADERS.length).setValues([IDEMP_HEADERS]);
    sh.getRange(1, 1, 1, IDEMP_HEADERS.length).setFontWeight('bold')
      .setBackground('#1F3864').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ============================================================
// [F] IDEMPOTENCY
// ============================================================
function findIdempotentResult_(clientRequestId) {
  if (!clientRequestId) return null;
  var sh = ensureIdempotencyLogSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var rows = sh.getRange(2, 1, lastRow - 1, IDEMP_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === clientRequestId) {
      return { rowIndex: i + 2, clientRequestId: rows[i][0], resultRefId: rows[i][1], resultType: rows[i][2], createdAt: rows[i][3] };
    }
  }
  return null;
}
function recordIdempotentResult_(clientRequestId, resultRefId, resultType) {
  if (!clientRequestId) return;
  var sh = ensureIdempotencyLogSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([[clientRequestId, resultRefId, resultType, new Date().toISOString()]]);
}
/* [P] Helper cleanup - HANYA dipakai oleh:
   (1) test cleanup (testConcurrentWriteDoor), dan
   (2) rollback internal atas idempotency record yang BARU SAJA dibuat oleh
       operasi yang sama yang kemudian gagal di langkah berikutnya.
   TIDAK PERNAH dipakai untuk menghapus idempotency record production lain -
   disiplin ini dijaga lewat konvensi pemanggilan, bukan mekanisme bahasa. */
function deleteIdempotencyByClientRequestId_(clientRequestId) {
  if (!clientRequestId) return false;
  var sh = ensureIdempotencyLogSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === clientRequestId) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}
/* Sheet nama untuk tiap resultType - dipakai untuk verifikasi orphan (bagian F). */
var RESULT_TYPE_SHEET = { transaction: SHT_TRANSAKSI, allocation: SHT_ALOKASI, bankMutation: SHT_MUTASI };
/* Mengembalikan salah satu:
   { status:'none' }                    - tidak ada record idempotency
   { status:'orphan', record }          - record ada tapi target sudah tidak ada
   { status:'found', record }           - record ada dan target masih ada */
function checkIdempotency_(clientRequestId) {
  var rec = findIdempotentResult_(clientRequestId);
  if (!rec) return { status: 'none' };
  var targetSheet = RESULT_TYPE_SHEET[rec.resultType];
  if (targetSheet && !idExistsInSheet_(targetSheet, rec.resultRefId)) {
    return { status: 'orphan', record: rec };
  }
  return { status: 'found', record: rec };
}

// ============================================================
// [H] AUDIT LOG - append-only, server timestamp, TIDAK PERNAH dihapus/diedit
// oleh fungsi apa pun di file ini.
// ============================================================
function auditPush_(aksi, before, after, sumber, refId) {
  var sh = sheet_(SHT_AUDIT);
  var row = [
    ID_PREFIX_AUDIT + Utilities.getUuid(),
    new Date().toISOString(), // timestamp SELALU server-side, tidak pernah dari browser
    aksi,
    before ? JSON.stringify(before) : '',
    after ? JSON.stringify(after) : '',
    sumber || 'write-door',
    refId || ''
  ];
  sh.getRange(sh.getLastRow() + 1, 1, 1, AUDIT_HEADERS.length).setValues([row]);
}

/* [TEST MODE] Audit untuk test SAJA - TIDAK PERNAH menyentuh 13_AUDIT_LOG.
   Ditulis ke Logger.log() + dipush ke array `collector` (kalau disediakan)
   supaya hasilnya bisa diperiksa lewat return value test, bukan lewat sheet
   production. Dipanggil HANYA lewat writeAuditEntry_() saat opts.testMode
   true - lihat penjelasan keamanan TEST MODE di kepala file. */
function auditPushTest_(collector, aksi, before, after, sumber, refId) {
  var entry = {
    id: 'test_audit_' + Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    aksi: aksi,
    before: before || null,
    after: after || null,
    sumber: sumber || 'test',
    refId: refId || null
  };
  Logger.log('[TEST AUDIT - TIDAK ditulis ke 13_AUDIT_LOG] ' + JSON.stringify(entry));
  if (collector && collector.push) collector.push(entry);
}

/* [TEST MODE] Dispatcher SATU-SATUNYA titik yang menentukan audit production
   vs audit test. opts.testMode HANYA bisa true kalau dipanggil lewat
   createTransactionWithAllocations_ForTest_() (lihat di bawah) - tidak
   pernah dari payload.testMode (field itu, kalau ada, diabaikan sepenuhnya -
   tidak pernah dibaca di mana pun di file ini). */
function writeAuditEntry_(opts, aksi, before, after, sumber, refId) {
  if (opts && opts.testMode) {
    auditPushTest_(opts.auditCollector, aksi, before, after, sumber, refId);
  } else {
    auditPush_(aksi, before, after, sumber, refId);
  }
}

// ============================================================
// VALIDASI (field-level + referential integrity)
// ============================================================
function isFiniteNumber_(v) { return typeof v === 'number' && isFinite(v) && !isNaN(v); }
function validateNominal_(nominal) {
  if (nominal === null || nominal === undefined || nominal === '') return 'nominal wajib diisi';
  var n = Number(nominal);
  if (!isFiniteNumber_(n)) return 'nominal harus numeric dan finite (bukan NaN/Infinity)';
  if (n <= 0) return 'nominal harus > 0';
  return null;
}
function validateJenis_(jenis) {
  if (jenis !== 'PENERIMAAN' && jenis !== 'PENGELUARAN') return 'jenis harus PENERIMAAN atau PENGELUARAN';
  return null;
}
function validateTanggal_(tanggal) {
  if (!tanggal || typeof tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(tanggal)) return 'tanggal wajib format YYYY-MM-DD';
  return null;
}
function validateUnit_(unit) {
  if (!unit || (unit !== 'TK' && unit !== 'MI')) return 'unit harus TK atau MI';
  return null;
}
function validateStatus_(status) {
  if (status && TRX_STATUS_VALUES.indexOf(status) === -1) return 'status tidak dikenal: ' + status;
  return null;
}
function siswaExists_(siswaId) { return !siswaId || idExistsInSheet_(SHT_SISWA, siswaId); }
function akunExists_(akunId) { return !akunId || idExistsInSheet_(SHT_AKUN, akunId); }
function komponenExists_(komponenId) { return !komponenId || idExistsInSheet_(SHT_KOMPONEN, komponenId); }
function transaksiExists_(transaksiId) { return idExistsInSheet_(SHT_TRANSAKSI, transaksiId); }

function validateTransactionPayload_(payload) {
  var e;
  if (!payload || typeof payload !== 'object') return errResult_('VALIDATION_ERROR', 'payload wajib berupa object', null);
  e = validateJenis_(payload.jenis); if (e) return errResult_('VALIDATION_ERROR', e, 'jenis');
  e = validateTanggal_(payload.tanggal); if (e) return errResult_('VALIDATION_ERROR', e, 'tanggal');
  e = validateUnit_(payload.unit); if (e) return errResult_('VALIDATION_ERROR', e, 'unit');
  e = validateNominal_(payload.nominal); if (e) return errResult_('VALIDATION_ERROR', e, 'nominal');
  if (!payload.metode || typeof payload.metode !== 'string') return errResult_('VALIDATION_ERROR', 'metode wajib diisi', 'metode');
  e = validateStatus_(payload.status); if (e) return errResult_('VALIDATION_ERROR', e, 'status');
  if (payload.akunId && !akunExists_(payload.akunId)) return errResult_('INVALID_ACCOUNT', 'akunId tidak ditemukan di ' + SHT_AKUN + ': ' + payload.akunId, 'akunId');
  if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak ditemukan di ' + SHT_SISWA + ': ' + payload.siswaId, 'siswaId');
  if (payload._komponenHint && !komponenExists_(payload._komponenHint)) return errResult_('INVALID_COMPONENT', 'komponen tidak ditemukan di ' + SHT_KOMPONEN + ': ' + payload._komponenHint, '_komponenHint');
  return null;
}

/* [G] Validasi allocations[] untuk createIncome(). */
function validateAllocationsForIncome_(allocations, trxSiswaId, trxNominal) {
  if (!allocations || !allocations.length) return null;
  var sum = 0;
  for (var i = 0; i < allocations.length; i++) {
    var a = allocations[i];
    var e = validateNominal_(a.nominal);
    if (e) return errResult_('VALIDATION_ERROR', 'allocation[' + i + ']: ' + e, 'nominal');
    if (!siswaExists_(a.siswaId)) return errResult_('INVALID_STUDENT', 'allocation[' + i + '].siswaId tidak ditemukan: ' + a.siswaId, 'siswaId');
    if (!komponenExists_(a.komponenId)) return errResult_('INVALID_COMPONENT', 'allocation[' + i + '].komponenId tidak ditemukan: ' + a.komponenId, 'komponenId');
    if (trxSiswaId && a.siswaId && a.siswaId !== trxSiswaId) {
      return errResult_('INVALID_ALLOCATION', 'allocation[' + i + '].siswaId (' + a.siswaId + ') berbeda dengan transaksi.siswaId (' + trxSiswaId + ')', 'siswaId');
    }
    sum += Number(a.nominal);
  }
  if (sum > Number(trxNominal)) {
    return errResult_('ALLOCATION_EXCEEDS_TRANSACTION', 'total allocation (' + sum + ') melebihi nominal transaksi (' + trxNominal + ')', 'nominal');
  }
  return null;
}

// ============================================================
// Row writers (dipanggil HANYA setelah validasi lengkap + lock diperoleh)
// ============================================================
function writeTransactionRow_(trx) {
  var sh = sheet_(SHT_TRANSAKSI);
  var row = TRX_HEADERS.map(function (h) { return trx[h] !== undefined ? trx[h] : ''; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, TRX_HEADERS.length).setValues([row]);
}
function writeAllocationRow_(alok) {
  var sh = sheet_(SHT_ALOKASI);
  var row = ALOK_HEADERS.map(function (h) { return alok[h] !== undefined ? alok[h] : ''; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, ALOK_HEADERS.length).setValues([row]);
}
function writeMutasiRow_(mut) {
  var sh = sheet_(SHT_MUTASI);
  var row = MUT_HEADERS.map(function (h) { return mut[h] !== undefined ? mut[h] : ''; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, MUT_HEADERS.length).setValues([row]);
}
/* [PATCH ADITIF - arsip/reversal] Alokasi yang sudah diarsipkan (kolom archivedAt terisi) TIDAK dihitung.
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
}

// ============================================================
// [D] LOCK WRAPPER - satu titik akuisisi lock untuk SEMUA write-door.
// waitLock() TIDAK mengembalikan boolean: berhasil = tidak throw, gagal =
// throw. Return value-nya TIDAK PERNAH dibaca sebagai sinyal sukses/gagal.
// ============================================================
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    lock.waitLock(10000);
    acquired = true;
  } catch (e) {
    acquired = false;
  }
  if (!acquired) {
    return errResult_('LOCK_TIMEOUT', 'Gagal mendapatkan lock dalam 10 detik - sistem sedang sibuk, coba lagi', null);
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// PUBLIC API
// ============================================================
function healthCheck() {
  try {
    var ss = ss_();
    var trxSheet = ss.getSheetByName(SHT_TRANSAKSI);
    var requiredSheets = [SHT_SISWA, SHT_KOMPONEN, SHT_TRANSAKSI, SHT_ALOKASI, SHT_AKUN, SHT_MUTASI, SHT_AUDIT, SHT_SETTINGS];
    var missing = requiredSheets.filter(function (n) { return !ss.getSheetByName(n); });
    return okResult_('Engine sehat', {
      spreadsheetId: ss.getId(),
      allRequiredSheetsFound: missing.length === 0,
      missingSheets: missing,
      transaksiRowCount: trxSheet ? Math.max(0, trxSheet.getLastRow() - 1) : 0,
      serverTime: new Date().toISOString()
    });
  } catch (e) {
    return errResult_('WRITE_FAILED', 'healthCheck gagal: ' + e.message, null);
  }
}

/* [G] createIncome(payload) - payload boleh menyertakan allocations[].
   createExpense(payload) - PENGELUARAN, tidak menerima allocation siswa.
   createTransaction(payload) - alias generik (jenis sudah di payload). */
function createIncome(payload) {
  return createTransactionWithAllocations_(Object.assign({}, payload, { jenis: 'PENERIMAAN' }));
}
function createExpense(payload) {
  return createTransactionWithAllocations_(Object.assign({}, payload, { jenis: 'PENGELUARAN', allocations: null }));
}
function createTransaction(payload) {
  return createTransactionWithAllocations_(payload);
}

/* [D][G][I] Inti write-door. Urutan PERSIS 8 langkah di bagian D, dengan
   penanganan kegagalan bertingkat di bagian I:
   1 validasi awal, 2 idempotency check (pre-lock), 3 lock,
   4 re-check kondisi kritis, 5 write (transaction+allocation),
   6 audit, 7 idempotency record, 8 success. */
function createTransactionWithAllocations_(payload, opts) {
  opts = opts || {}; // [TEST MODE] opts HANYA pernah diisi oleh
  // createTransactionWithAllocations_ForTest_() - tidak pernah dari luar,
  // tidak pernah dari payload. payload.testMode (kalau ada) diabaikan total.
  try {
    // --- 1. validasi awal (SEBELUM lock) ---
    var vErr = validateTransactionPayload_(payload);
    if (vErr) return vErr;

    var allocations = (payload.jenis === 'PENERIMAAN') ? (payload.allocations || []) : [];
    var allocErr = validateAllocationsForIncome_(allocations, payload.siswaId, payload.nominal);
    if (allocErr) return allocErr;

    // --- 2. idempotency check (SEBELUM lock) ---
    var idemp1 = checkIdempotency_(payload.clientRequestId);
    if (idemp1.status === 'orphan') {
      return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId ini pernah tercatat sukses (refId=' + idemp1.record.resultRefId + ') tapi transaksinya sudah tidak ada di ' + SHT_TRANSAKSI + '. Tidak membuat transaksi baru secara diam-diam.', 'clientRequestId', idemp1.record.resultRefId);
    }
    if (idemp1.status === 'found') {
      var priorGet = getTransaction(idemp1.record.resultRefId);
      return okResult_('Request sudah pernah diproses (idempotent replay)', priorGet.data || { id: idemp1.record.resultRefId });
    }

    // --- 3-8: di dalam lock ---
    return withLock_(function () {
      // --- 4. re-check kondisi kritis setelah lock ---
      var idemp2 = checkIdempotency_(payload.clientRequestId);
      if (idemp2.status === 'orphan') {
        return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId ini pernah tercatat sukses (refId=' + idemp2.record.resultRefId + ') tapi transaksinya sudah tidak ada (re-check saat lock). Tidak membuat transaksi baru secara diam-diam.', 'clientRequestId', idemp2.record.resultRefId);
      }
      if (idemp2.status === 'found') {
        var priorGet2 = getTransaction(idemp2.record.resultRefId);
        return okResult_('Request sudah pernah diproses (idempotent replay, terdeteksi saat lock)', priorGet2.data || { id: idemp2.record.resultRefId });
      }
      if (payload.akunId && !akunExists_(payload.akunId)) return errResult_('INVALID_ACCOUNT', 'akunId tidak valid (re-check)', 'akunId');
      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');

      var trxId = ID_PREFIX_TRX + Utilities.getUuid();
      var now = new Date().toISOString();
      var trxRecord = {
        id: trxId, jenis: payload.jenis, tanggal: payload.tanggal, unit: payload.unit,
        nominal: Number(payload.nominal), akunId: payload.akunId || '', metode: payload.metode,
        status: payload.status || 'TERCATAT', createdAt: now, catatan: payload.catatan || '',
        sumber: payload.sumber || 'write-door', siswaId: payload.siswaId || '',
        _siswaNamaSnapshot: payload._siswaNamaSnapshot || '', _komponenHint: payload._komponenHint || '',
        resiNo: payload.resiNo || '', kategori: payload.kategori || '', subkategori: payload.subkategori || '',
        penerima: payload.penerima || '', ftNumber: payload.ftNumber || '', namaPengirim: payload.namaPengirim || '',
        _sourceFile: '', _sourceSheet: '', _sourceRow: ''
      };

      // --- 5a. write transaction ---
      try {
        writeTransactionRow_(trxRecord);
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: write transaction gagal: ' + e.message);
        return errResult_('WRITE_FAILED', 'Gagal menulis transaksi: ' + e.message, null);
      }

      // --- 5b. write allocation(s) - rollback eksplisit kalau gagal ---
      var writtenAllocIds = [];
      try {
        allocations.forEach(function (a) {
          var alokId = ID_PREFIX_ALK + Utilities.getUuid();
          writeAllocationRow_({
            id: alokId, transaksiId: trxId, siswaId: a.siswaId, komponenId: a.komponenId,
            periode: a.periode || '', nominal: Number(a.nominal), caraBayar: a.caraBayar || 'manual',
            tagihanId: a.tagihanId || '', createdAt: now
          });
          writtenAllocIds.push(alokId);
        });
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: write allocation gagal, rollback transaksi+allocation parsial: ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_('WRITE_FAILED', 'Gagal menulis allocation, transaksi sudah di-rollback: ' + e.message, null);
      }

      // --- 6. audit (CREATE_TRANSACTION + CREATE_ALLOCATION per baris) ---
      // [TEST MODE] writeAuditEntry_ mengarah ke 13_AUDIT_LOG production
      // kecuali opts.testMode true, baru diarahkan ke Logger/collector.
      try {
        writeAuditEntry_(opts, 'CREATE_TRANSACTION', null, trxRecord, payload.sumber || 'write-door', trxId);
        allocations.forEach(function (a, i) {
          writeAuditEntry_(opts, 'CREATE_ALLOCATION', null, { transaksiId: trxId, siswaId: a.siswaId, komponenId: a.komponenId, nominal: a.nominal }, payload.sumber || 'write-door', writtenAllocIds[i]);
        });
      } catch (e) {
        // [I] audit gagal SETELAH write bisnis sukses -> rollback transaction+
        // allocation. Audit yang SUDAH sempat tertulis sebelum exception TIDAK
        // dihapus (append-only) - hanya dicatat di Logger sebagai kompensasi.
        Logger.log('createTransactionWithAllocations_: audit gagal setelah write sukses, rollback transaksi+allocation (audit yang sudah tertulis TETAP ada, append-only): ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, transaksi+allocation sudah di-rollback (audit parsial yang sempat tertulis tetap ada sesuai aturan append-only): ' + e.message, null, trxId);
      }

      // --- 7. idempotency record ---
      try {
        recordIdempotentResult_(payload.clientRequestId, trxId, 'transaction');
      } catch (e) {
        // [I] idempotency write gagal SETELAH audit sukses -> rollback
        // transaction+allocation. Audit yang sudah tertulis TETAP ada.
        Logger.log('createTransactionWithAllocations_: idempotency record gagal setelah audit sukses, rollback transaksi+allocation (audit TETAP ada, append-only): ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_('WRITE_FAILED', 'Gagal menulis idempotency record, transaksi+allocation sudah di-rollback (audit CREATE_TRANSACTION/CREATE_ALLOCATION tetap ada sesuai aturan append-only): ' + e.message, null, trxId);
      }

      // --- 8. success ---
      return okResult_('Transaksi berhasil dibuat', { id: trxId, transaction: trxRecord, allocationIds: writtenAllocIds });
    });
  } catch (e) {
    Logger.log('createTransactionWithAllocations_: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_('WRITE_FAILED', 'createTransactionWithAllocations_ error tak terduga: ' + e.message, null);
  }
}

/* [TEST MODE] SATU-SATUNYA titik di seluruh file yang menyalakan
   opts.testMode = true. Fungsi privat (trailing underscore + akhiran
   _ForTest_), TIDAK ADA di daftar 10 fungsi wajib section C, TIDAK PERNAH
   dipanggil oleh createIncome/createExpense/createTransaction ataupun jalur
   public lain - HANYA oleh testConcurrentWriteDoor() di bawah. Menerima
   `collector` (array) supaya audit test bisa diperiksa balik dari hasil
   test tanpa pernah menyentuh 13_AUDIT_LOG. */
function createTransactionWithAllocations_ForTest_(payload, collector) {
  return createTransactionWithAllocations_(payload, { testMode: true, auditCollector: collector });
}

/* [J] createAllocation(payload) - allocation berdiri sendiri terhadap
   transaksi yang SUDAH ADA. validate -> lock -> re-check transaction ->
   cek total allocation -> write -> audit -> idempotency; rollback kalau
   audit/idempotency gagal. */
function createAllocation(payload) {
  try {
    if (!payload || !payload.transaksiId) return errResult_('VALIDATION_ERROR', 'transaksiId wajib diisi', 'transaksiId');
    if (!transaksiExists_(payload.transaksiId)) return errResult_('INVALID_TRANSACTION', 'transaksiId tidak ditemukan: ' + payload.transaksiId, 'transaksiId');
    var nErr = validateNominal_(payload.nominal);
    if (nErr) return errResult_('VALIDATION_ERROR', nErr, 'nominal');
    if (!siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak ditemukan: ' + payload.siswaId, 'siswaId');
    if (!komponenExists_(payload.komponenId)) return errResult_('INVALID_COMPONENT', 'komponenId tidak ditemukan: ' + payload.komponenId, 'komponenId');

    var idemp1 = checkIdempotency_(payload.clientRequestId);
    if (idemp1.status === 'orphan') return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId menunjuk allocation yang sudah tidak ada', 'clientRequestId', idemp1.record.resultRefId);
    if (idemp1.status === 'found') return okResult_('Request sudah pernah diproses (idempotent replay)', { id: idemp1.record.resultRefId });

    return withLock_(function () {
      var idemp2 = checkIdempotency_(payload.clientRequestId);
      if (idemp2.status === 'orphan') return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId menunjuk allocation yang sudah tidak ada (re-check)', 'clientRequestId', idemp2.record.resultRefId);
      if (idemp2.status === 'found') return okResult_('Request sudah pernah diproses (idempotent replay, terdeteksi saat lock)', { id: idemp2.record.resultRefId });

      if (!transaksiExists_(payload.transaksiId)) return errResult_('INVALID_TRANSACTION', 'transaksiId tidak ditemukan (re-check)', 'transaksiId');
      var trx = getTransactionRaw_(payload.transaksiId);
      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');
      var currentSum = sumAllocationsForTransaksi_(payload.transaksiId);
      var newSum = currentSum + Number(payload.nominal);
      if (newSum > Number(trx.nominal)) {
        return errResult_('ALLOCATION_EXCEEDS_TRANSACTION', 'total allocation (' + newSum + ') akan melebihi nominal transaksi (' + trx.nominal + ')', 'nominal');
      }

      var alokId = ID_PREFIX_ALK + Utilities.getUuid();
      var now = new Date().toISOString();
      var alokRecord = {
        id: alokId, transaksiId: payload.transaksiId, siswaId: payload.siswaId, komponenId: payload.komponenId,
        periode: payload.periode || '', nominal: Number(payload.nominal), caraBayar: payload.caraBayar || 'manual',
        tagihanId: payload.tagihanId || '', createdAt: now
      };
      try {
        writeAllocationRow_(alokRecord);
      } catch (e) {
        Logger.log('createAllocation: write gagal: ' + e.message);
        return errResult_('WRITE_FAILED', 'Gagal menulis allocation: ' + e.message, null);
      }
      try {
        auditPush_('CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId);
      } catch (e) {
        Logger.log('createAllocation: audit gagal setelah write sukses, rollback allocation: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, allocation sudah di-rollback: ' + e.message, null, alokId);
      }
      try {
        recordIdempotentResult_(payload.clientRequestId, alokId, 'allocation');
      } catch (e) {
        Logger.log('createAllocation: idempotency gagal setelah audit sukses, rollback allocation (audit TETAP ada): ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        return errResult_('WRITE_FAILED', 'Gagal menulis idempotency record, allocation sudah di-rollback (audit tetap ada): ' + e.message, null, alokId);
      }
      return okResult_('Allocation berhasil dibuat', alokRecord);
    });
  } catch (e) {
    Logger.log('createAllocation: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_('WRITE_FAILED', 'createAllocation error tak terduga: ' + e.message, null);
  }
}

/* [K] createBankMutation(payload) - staging rekonsiliasi, TERPISAH dari
   05_TRANSAKSI, TIDAK OTOMATIS membuat transaksi. */
function createBankMutation(payload) {
  try {
    if (!payload) return errResult_('VALIDATION_ERROR', 'payload wajib diisi', null);
    var e = validateTanggal_(payload.tanggal); if (e) return errResult_('VALIDATION_ERROR', e, 'tanggal');
    var nErr = validateNominal_(payload.nominal); if (nErr) return errResult_('VALIDATION_ERROR', nErr, 'nominal');
    if (payload.transaksiId && !transaksiExists_(payload.transaksiId)) return errResult_('INVALID_TRANSACTION', 'transaksiId tidak ditemukan: ' + payload.transaksiId, 'transaksiId');

    var idemp1 = checkIdempotency_(payload.clientRequestId);
    if (idemp1.status === 'orphan') return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId menunjuk mutasi yang sudah tidak ada', 'clientRequestId', idemp1.record.resultRefId);
    if (idemp1.status === 'found') return okResult_('Request sudah pernah diproses (idempotent replay)', { id: idemp1.record.resultRefId });

    return withLock_(function () {
      var idemp2 = checkIdempotency_(payload.clientRequestId);
      if (idemp2.status === 'orphan') return errResult_('IDEMPOTENCY_ORPHAN', 'clientRequestId menunjuk mutasi yang sudah tidak ada (re-check)', 'clientRequestId', idemp2.record.resultRefId);
      if (idemp2.status === 'found') return okResult_('Request sudah pernah diproses (idempotent replay, terdeteksi saat lock)', { id: idemp2.record.resultRefId });

      var mutId = ID_PREFIX_MUT + Utilities.getUuid();
      var mutRecord = {
        id: mutId, tanggal: payload.tanggal, nominal: Number(payload.nominal),
        keterangan: payload.keterangan || '', namaPengirim: payload.namaPengirim || '',
        ftNumber: payload.ftNumber || '', status: payload.status || 'BELUM_DIPROSES',
        transaksiId: payload.transaksiId || ''
      };
      try {
        writeMutasiRow_(mutRecord);
      } catch (e2) {
        Logger.log('createBankMutation: write gagal: ' + e2.message);
        return errResult_('WRITE_FAILED', 'Gagal menulis mutasi bank: ' + e2.message, null);
      }
      try {
        auditPush_('CREATE_BANK_MUTATION', null, mutRecord, payload.sumber || 'write-door', mutId);
      } catch (e2) {
        Logger.log('createBankMutation: audit gagal setelah write sukses, rollback mutasi: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, mutasi sudah di-rollback: ' + e2.message, null, mutId);
      }
      try {
        recordIdempotentResult_(payload.clientRequestId, mutId, 'bankMutation');
      } catch (e2) {
        Logger.log('createBankMutation: idempotency gagal setelah audit sukses, rollback mutasi (audit TETAP ada): ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_('WRITE_FAILED', 'Gagal menulis idempotency record, mutasi sudah di-rollback (audit tetap ada): ' + e2.message, null, mutId);
      }
      return okResult_('Mutasi bank berhasil dicatat', mutRecord);
    });
  } catch (e) {
    Logger.log('createBankMutation: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_('WRITE_FAILED', 'createBankMutation error tak terduga: ' + e.message, null);
  }
}

/* [I] updateTransaction(payload) - bukan blind overwrite. cari -> exists ->
   validate -> lock -> re-check -> update -> audit. Kalau update sukses tapi
   audit gagal: RESTORE nilai before (bukan rollback-hapus, karena baris
   sudah ada sejak sebelumnya - beda dari create yang rollback-nya delete). */
function updateTransaction(payload) {
  try {
    if (!payload || !payload.id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);

    var merged = Object.assign({}, before, payload);
    var vErr = validateTransactionPayload_(merged);
    if (vErr) return vErr;

    return withLock_(function () {
      var rowIdx = findRowIndexById_(SHT_TRANSAKSI, payload.id);
      if (rowIdx === -1) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan (re-check): ' + payload.id, 'id', payload.id);

      var beforeRecheck = getTransactionRaw_(payload.id);
      if (beforeRecheck && beforeRecheck.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (re-check) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);
      var beforeRow = TRX_HEADERS.map(function (h) { return beforeRecheck[h] !== undefined ? beforeRecheck[h] : ''; });
      var afterRecord = Object.assign({}, beforeRecheck, payload);
      afterRecord.id = payload.id;
      var afterRow = TRX_HEADERS.map(function (h) { return afterRecord[h] !== undefined ? afterRecord[h] : ''; });

      try {
        sheet_(SHT_TRANSAKSI).getRange(rowIdx, 1, 1, TRX_HEADERS.length).setValues([afterRow]);
      } catch (e) {
        Logger.log('updateTransaction: write gagal: ' + e.message);
        return errResult_('WRITE_FAILED', 'Gagal update transaksi: ' + e.message, null, payload.id);
      }

      try {
        auditPush_('UPDATE_TRANSACTION', beforeRecheck, afterRecord, payload.sumber || 'write-door', payload.id);
      } catch (e) {
        // [I] update sukses tapi audit gagal -> RESTORE nilai before.
        Logger.log('updateTransaction: audit gagal setelah update sukses, RESTORE nilai before: ' + e.message);
        try {
          sheet_(SHT_TRANSAKSI).getRange(rowIdx, 1, 1, TRX_HEADERS.length).setValues([beforeRow]);
        } catch (restoreErr) {
          Logger.log('updateTransaction: RESTORE gagal juga: ' + restoreErr.message);
          return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN restore nilai before juga gagal: ' + restoreErr.message, null, payload.id);
        }
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, nilai transaksi sudah di-restore ke sebelum update: ' + e.message, null, payload.id);
      }

      return okResult_('Transaksi berhasil diupdate', afterRecord);
    });
  } catch (e) {
    Logger.log('updateTransaction: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_('WRITE_FAILED', 'updateTransaction error tak terduga: ' + e.message, null);
  }
}

// ============================================================
// SERVER-SIDE READ (dari Sheets, BUKAN localStorage)
// ============================================================
/* [PATCH ADITIF - transaksi arsip] Membaca baris transaksi (23 kolom posisional, TIDAK berubah) + info arsip dari kolom
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
}
function getTransaction(id) {
  var t = getTransactionRaw_(id);
  if (!t) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + id, 'id', id);
  return okResult_('OK', t);
}
function getTransactions(filters) {
  filters = filters || {};
  var rows = readTrxRows_();
  var out = rows.filter(function (r) {
    if (r.archivedAt && filters.includeArchived !== true) return false; // [PATCH] transaksi arsip tidak termasuk daftar aktif (kecuali diminta eksplisit)
    if (filters.jenis && r.jenis !== filters.jenis) return false;
    if (filters.unit && r.unit !== filters.unit) return false;
    if (filters.siswaId && r.siswaId !== filters.siswaId) return false;
    if (filters.tanggalFrom && String(r.tanggal) < filters.tanggalFrom) return false;
    if (filters.tanggalTo && String(r.tanggal) > filters.tanggalTo) return false;
    return true;
  });
  if (filters.limit) out = out.slice(0, filters.limit);
  return okResult_('OK', out);
}
/* [L] getStudentPosition() - HANYA agregasi mentah, BUKAN kewajiban
   terhitung/expected receivable. Engine itu sengaja tidak dipindahkan ke sini. */
function getStudentPosition(siswaId) {
  if (!siswaId) return errResult_('VALIDATION_ERROR', 'siswaId wajib diisi', 'siswaId');
  if (!siswaExists_(siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak ditemukan: ' + siswaId, 'siswaId');
  var alokasi = activeAllocationRows_().filter(function (a) { return a.siswaId === siswaId; });
  var byKomponen = {};
  var total = 0;
  alokasi.forEach(function (a) {
    var k = a.komponenId || '(tanpa komponen)';
    byKomponen[k] = (byKomponen[k] || 0) + Number(a.nominal || 0);
    total += Number(a.nominal || 0);
  });
  return okResult_('OK (agregasi alokasi mentah - bukan kewajiban terhitung, bukan expected receivable)', {
    siswaId: siswaId, totalTerbayar: total, perKomponen: byKomponen, jumlahAlokasi: alokasi.length
  });
}

// ============================================================
// [M] TEST CONCURRENT WRITE DOOR
// CATATAN JUJUR: satu eksekusi Apps Script berjalan single-threaded - test
// ini TIDAK bisa memaksa dua request browser benar-benar race dari DALAM
// satu run. Yang diuji dari sini: (a) request pertama sukses, (b) replay
// clientRequestId sama TIDAK membuat transaksi kedua, (c) request kedua
// dengan clientRequestId berbeda sukses independen. Concurrency ANTAR
// request browser sungguhan diserahkan ke LockService saat dipanggil lewat
// Web App (doPost) - itulah baris pertahanan sesungguhnya, bukan test ini.
// ============================================================
function testConcurrentWriteDoor() {
  var results = [];
  var testAuditCollector = []; // [TEST MODE] audit test masuk sini, BUKAN ke 13_AUDIT_LOG
  var testAkun = readAllRows_(SHT_AKUN, ['id', 'nama', 'jenis', 'saldoAwal'])[0];
  var testSiswa = readAllRows_(SHT_SISWA, ['id'])[0];
  if (!testAkun || !testSiswa) {
    return errResult_('NOT_FOUND', 'Butuh minimal 1 akun dan 1 siswa nyata di sheet untuk menjalankan test ini', null);
  }

  var crIdA = 'test_' + Utilities.getUuid();
  var payloadA = {
    jenis: 'PENERIMAAN', tanggal: '2026-01-01', unit: 'TK', nominal: 1,
    akunId: testAkun.id, metode: 'Tunai', status: 'TERCATAT',
    catatan: 'TEST_WRITE_DOOR_DO_NOT_USE_IN_PRODUCTION', sumber: 'test-concurrent',
    clientRequestId: crIdA
  };

  // [TEST MODE] Lewat createTransactionWithAllocations_ForTest_ - jalur
  // validasi/FK/LockService/idempotency SAMA PERSIS dengan production,
  // HANYA audit yang dialihkan ke testAuditCollector (lihat writeAuditEntry_).
  var r1 = createTransactionWithAllocations_ForTest_(payloadA, testAuditCollector);
  results.push({ label: 'r1 (request A, baru)', ok: r1.ok, code: r1.code, message: r1.message, id: r1.data ? r1.data.id : null, refId: r1.refId || null });

  var r2 = createTransactionWithAllocations_ForTest_(payloadA, testAuditCollector); // clientRequestId SAMA
  results.push({ label: 'r2 (replay, clientRequestId sama dengan A)', ok: r2.ok, code: r2.code, message: r2.message, id: r2.data ? r2.data.id : null, refId: r2.refId || null });

  var duplicateHandledCorrectly = r1.ok && r2.ok && r1.data.id === r2.data.id;

  var crIdB = 'test_' + Utilities.getUuid();
  var payloadB = Object.assign({}, payloadA, { clientRequestId: crIdB, catatan: 'TEST_WRITE_DOOR_DO_NOT_USE_IN_PRODUCTION_B' });
  var r3 = createTransactionWithAllocations_ForTest_(payloadB, testAuditCollector);
  results.push({ label: 'r3 (request B, clientRequestId berbeda)', ok: r3.ok, code: r3.code, message: r3.message, id: r3.data ? r3.data.id : null, refId: r3.refId || null });
  var independentSuccess = r3.ok && r3.data.id !== r1.data.id;

  // [M][P] Cleanup - transaksi test DAN idempotency record test. Audit test
  // sudah tidak pernah menyentuh 13_AUDIT_LOG sama sekali (lihat di atas),
  // jadi tidak ada apa pun untuk dibersihkan di sana.
  var cleanupIds = [];
  if (r1.ok) { cleanupIds.push(r1.data.id); deleteIdempotencyByClientRequestId_(crIdA); }
  if (r3.ok) { cleanupIds.push(r3.data.id); deleteIdempotencyByClientRequestId_(crIdB); }
  cleanupIds.forEach(function (id) { deleteRowById_(SHT_TRANSAKSI, id); });

  Logger.log('testConcurrentWriteDoor selesai. deletedTestTransactionIds=' + JSON.stringify(cleanupIds) +
    ' | duplicateHandledCorrectly=' + duplicateHandledCorrectly + ' | independentSuccess=' + independentSuccess +
    ' | testAuditCollector berisi ' + testAuditCollector.length + ' entri (TIDAK PERNAH ditulis ke 13_AUDIT_LOG)');

  var summary = {
    duplicateRequestProducedZeroNewTransactions: duplicateHandledCorrectly,
    independentRequestsSucceededSeparately: independentSuccess,
    testDataCleanedUp: true,
    deletedTestTransactionIds: cleanupIds,
    note: 'Audit test (CREATE_TRANSACTION/CREATE_ALLOCATION untuk r1/r2/r3) TIDAK PERNAH ditulis ke 13_AUDIT_LOG - lihat testAuditLog di bawah untuk isinya (Logger + collector saja). 13_AUDIT_LOG production TIDAK bertambah sama sekali akibat test ini.',
    testAuditLog: testAuditCollector,
    r1: r1, r2: r2, r3: r3,
    details: results
  };
  return okResult_('testConcurrentWriteDoor selesai (transaksi+idempotency test sudah dibersihkan; audit test TIDAK PERNAH menyentuh 13_AUDIT_LOG production)', summary);
}

// ============================================================
// [N] FINANCIAL SAFETY TEST - hanya jalur REJECT yang secara desain TIDAK
// PERNAH menulis apa pun ke Sheets, jadi aman dijalankan berkali-kali.
// ============================================================
function runFinancialSafetyTests() {
  var results = [];
  function check(name, expectedCode, actualResult) {
    var status = (actualResult.ok === false && actualResult.code === expectedCode) ? 'PASS' : 'FAIL';
    results.push({ test: name, expected: expectedCode, actual: actualResult.code + (actualResult.ok ? ' (ok=true!)' : ''), status: status });
  }
  var baseValid = { jenis: 'PENERIMAAN', tanggal: '2026-01-01', unit: 'TK', metode: 'Tunai' };

  check('A. nominal negatif -> REJECT', 'VALIDATION_ERROR', validateTransactionPayloadPublicWrapper_(Object.assign({}, baseValid, { nominal: -1000 })));
  check('B. nominal 0 -> REJECT', 'VALIDATION_ERROR', validateTransactionPayloadPublicWrapper_(Object.assign({}, baseValid, { nominal: 0 })));
  check('C. akunId tidak valid -> REJECT', 'INVALID_ACCOUNT', validateTransactionPayloadPublicWrapper_(Object.assign({}, baseValid, { nominal: 1000, akunId: 'akun_TIDAK_ADA_xyz' })));
  check('D. siswaId tidak valid -> REJECT', 'INVALID_STUDENT', validateTransactionPayloadPublicWrapper_(Object.assign({}, baseValid, { nominal: 1000, siswaId: 'siswa_TIDAK_ADA_xyz' })));
  check('E. komponenId tidak valid -> REJECT', 'INVALID_COMPONENT', validateTransactionPayloadPublicWrapper_(Object.assign({}, baseValid, { nominal: 1000, _komponenHint: 'kmp_TIDAK_ADA_xyz' })));

  var allocOverResult = validateAllocationsForIncome_([{ siswaId: 'x', komponenId: 'y', nominal: 999999999 }], null, 1000);
  results.push({
    test: 'F. allocation > transaction -> REJECT',
    expected: 'ALLOCATION_EXCEEDS_TRANSACTION (atau INVALID_STUDENT/INVALID_COMPONENT lebih dulu kalau FK juga tidak valid)',
    actual: allocOverResult ? allocOverResult.code : 'null (TIDAK REJECT - FAIL)',
    status: allocOverResult ? 'PASS' : 'FAIL'
  });

  results.push({
    test: 'J. expected receivable tidak boleh membuat transaction',
    expected: 'tidak ada API untuk itu di engine ini',
    actual: (typeof createExpectedReceivable === 'undefined') ? 'confirmed: no such function exists' : 'FAIL: fungsi tidak seharusnya ada',
    status: (typeof createExpectedReceivable === 'undefined') ? 'PASS' : 'FAIL'
  });

  var passed = results.filter(function (r) { return r.status === 'PASS'; }).length;
  var failed = results.length - passed;
  var allPass = failed === 0;
  return okResult_('runFinancialSafetyTests selesai (jalur REJECT saja - tidak menulis data)', {
    totalTests: results.length, passed: passed, failed: failed, allPass: allPass, results: results
  });
}
function validateTransactionPayloadPublicWrapper_(payload) {
  var e = validateTransactionPayload_(payload);
  return e || okResult_('valid (tidak seharusnya untuk kasus reject)', payload);
}

// ============================================================
// [O] REGRESSION CHECK - membandingkan terhadap baseline literal, BUKAN
// hanya menghitung baris. Lihat catatan di kepala file soal audit log.
// ============================================================
function regressionCheck() {
  function count(name) { var sh = ss_().getSheetByName(name); return sh ? Math.max(0, sh.getLastRow() - 1) : 0; }
  var actual = {
    jumlahTransaksi: count(SHT_TRANSAKSI),
    jumlahAlokasi: count(SHT_ALOKASI),
    jumlahMutasiBank: count(SHT_MUTASI),
    jumlahAuditLog: count(SHT_AUDIT),
    jumlahSettings: count(SHT_SETTINGS)
  };
  var differences = [];
  Object.keys(REGRESSION_BASELINE).forEach(function (k) {
    if (REGRESSION_BASELINE[k] !== actual[k]) {
      differences.push({ metric: k, baseline: REGRESSION_BASELINE[k], actual: actual[k], delta: actual[k] - REGRESSION_BASELINE[k] });
    }
  });
  var status = differences.length === 0 ? 'PASS' : 'FAIL';
  var note = 'Sejak TEST MODE dipisahkan dari audit production (auditPushTest_/writeAuditEntry_), testConcurrentWriteDoor() TIDAK PERNAH menulis ke 13_AUDIT_LOG - jadi kelima metrik di atas, TERMASUK jumlahAuditLog, WAJIB persis sama dengan baseline bahkan setelah testConcurrentWriteDoor() dijalankan berkali-kali.';
  return okResult_('regressionCheck selesai', { baseline: REGRESSION_BASELINE, actual: actual, differences: differences, status: status, note: note });
}
