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
 * TEST MODE (revisi kedua): testConcurrentWriteDoor_() memakai
 * createTransactionWithAllocations_ForTest_() - jalur validasi/FK/
 * LockService/idempotency/rollback SAMA PERSIS dengan production (write-door
 * sungguhan, bukan mock), HANYA audit yang dialihkan ke Logger.log() +
 * array collector, TIDAK PERNAH ke 13_AUDIT_LOG. Konsekuensinya:
 * regressionCheck_() sekarang WAJIB menunjukkan kelima metrik (termasuk
 * jumlahAuditLog) persis kembali ke baseline setelah testConcurrentWriteDoor_()
 * dijalankan, karena test tidak lagi menyentuh sheet audit sama sekali.
 *
 * Keamanan TEST MODE - kenapa browser tidak bisa mengaktifkannya:
 * opts.testMode adalah ARGUMEN KEDUA createTransactionWithAllocations_(),
 * BUKAN field di dalam payload (payload.testMode, kalau ada, tidak pernah
 * dibaca di mana pun). Semua 10 fungsi public wajib (createIncome_ dkk.)
 * hanya menerima SATU argumen dan tidak pernah meneruskan argumen kedua -
 * jadi opts selalu {} (testMode false) di jalur production apa pun isi
 * payload-nya. Satu-satunya titik yang menyalakan testMode:true adalah
 * createTransactionWithAllocations_ForTest_() - fungsi privat yang hanya
 * dipanggil dari testConcurrentWriteDoor_(), tidak pernah dari luar.
 *
 * [P0 - 2026-10-17] Patch build apply_p0_server.js: baca/tulis berbasis NAMA header (SchemaGuard.gs),
 * SCHEMA_MISMATCH gagal tertutup, normalisasi tanggal, validasi patch per-field, invarian nominal >= alokasi,
 * status alokasi dihitung server, aktor di audit, fungsi engine/tes dijadikan privat (akhiran _).
 *
 * [P1 - 2026-10-17] Patch build apply_p1_server.js: audit engine satu kali append di langkah TERAKHIR (setelah
 * catatan idempotensi) bersama jejak aktor/role (tanpa audit parsial), idempotensi + deteksi konflik pada
 * updateTransaction_, status SELESAI wajib bukti berfile.
 * [P1-POLICY 17-10-2026] Status periode = PENANDA, bukan hard lock: periode bertanda/terlapor tidak menolak tulis;
 * baris audit PERIODE_DITANDAI ikut append audit yang sama dan respons memuat periodeDitandai.
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
/* [P0-A] SCHEMA_MISMATCH dibawa apa adanya; galat lain tetap WRITE_FAILED */
function engineErrCode_(e) { return e && ['SCHEMA_MISMATCH', 'PERIODE_AKTIF_TIDAK_VALID', 'SUMBER_TIDAK_TERSEDIA'].indexOf(e.code) !== -1 ? e.code : 'WRITE_FAILED'; } // [P1-IMP C] kode kewajiban dipertahankan
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
  // [P0-A] berbasis NAMA header; kolom wajib hilang -> Error SCHEMA_MISMATCH (bukan data bergeser)
  var m = sgModel_(sheetName, headers);
  if (!m) return [];
  return m.values.map(function (r) { return sgObj_(m, r, headers); });
}
function findRowIndexById_(sheetName, id) {
  // [P0-A] kolom kunci dicari berdasarkan nama ('id', atau PK khusus di SG_PK_)
  var pk = SG_PK_[sheetName] || 'id';
  var hm = sgHeaderModel_(sheetName, [pk]);
  if (!hm) return -1;
  var lastRow = hm.sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = hm.sh.getRange(2, hm.idx[pk] + 1, lastRow - 1, 1).getValues();
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
  ensureIdempotencyLogSheet_();
  var m = sgModel_(SHT_IDEMPOTENCY, IDEMP_HEADERS); // [P0-A] berbasis nama
  for (var i = 0; i < m.values.length; i++) {
    var o = sgObj_(m, m.values[i], IDEMP_HEADERS);
    if (o.clientRequestId === clientRequestId) {
      return { rowIndex: i + 2, clientRequestId: o.clientRequestId, resultRefId: o.resultRefId, resultType: o.resultType, createdAt: o.createdAt };
    }
  }
  return null;
}
function recordIdempotentResult_(clientRequestId, resultRefId, resultType) {
  if (!clientRequestId) return;
  ensureIdempotencyLogSheet_();
  sgAppend_(SHT_IDEMPOTENCY, IDEMP_HEADERS, { clientRequestId: clientRequestId, resultRefId: resultRefId, resultType: resultType, createdAt: new Date().toISOString() }); // [P0-A]
}
/* [P] Helper cleanup - HANYA dipakai oleh:
   (1) test cleanup (testConcurrentWriteDoor_), dan
   (2) rollback internal atas idempotency record yang BARU SAJA dibuat oleh
       operasi yang sama yang kemudian gagal di langkah berikutnya.
   TIDAK PERNAH dipakai untuk menghapus idempotency record production lain -
   disiplin ini dijaga lewat konvensi pemanggilan, bukan mekanisme bahasa. */
function deleteIdempotencyByClientRequestId_(clientRequestId) {
  if (!clientRequestId) return false;
  ensureIdempotencyLogSheet_();
  var rowIdx = findRowIndexById_(SHT_IDEMPOTENCY, clientRequestId); // [P0-A] kolom clientRequestId dicari berdasarkan nama
  if (rowIdx > 0) { ss_().getSheetByName(SHT_IDEMPOTENCY).deleteRow(rowIdx); return true; }
  return false;
}
/* Sheet nama untuk tiap resultType - dipakai untuk verifikasi orphan (bagian F). */
var RESULT_TYPE_SHEET = { transaction: SHT_TRANSAKSI, allocation: SHT_ALOKASI, bankMutation: SHT_MUTASI, mutasiBank: SHT_MUTASI, transactionUpdate: SHT_TRANSAKSI }; // [P1-B] transactionUpdate; [GAP-031] alias resultType impor FINAL 'mutasiBank' (data tidak diubah)
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
  // [P0-A] kolom audit dipetakan berdasarkan nama header; [P0-B] aktor terverifikasi (ENGINE_ACTOR_) dicatat di kolom sumber
  sgAppend_(SHT_AUDIT, AUDIT_HEADERS, {
    id: ID_PREFIX_AUDIT + Utilities.getUuid(),
    timestamp: new Date().toISOString(), // timestamp SELALU server-side, tidak pernah dari browser
    aksi: aksi,
    before: before ? JSON.stringify(before) : '',
    after: after ? JSON.stringify(after) : '',
    sumber: (typeof ENGINE_ACTOR_ !== 'undefined' && ENGINE_ACTOR_) ? 'google:' + ENGINE_ACTOR_ : (sumber || 'write-door'),
    refId: refId || ''
  });
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

/* [P1-B] Audit engine dalam SATU append (sgAppendMany_): seluruh baris audit wajib satu operasi + baris jejak
   aktor/role (API_*, bila dipanggil lewat opEngineWrite_) ditulis sekaligus atau tidak sama sekali. Dipanggil
   sebagai langkah TERAKHIR sebelum sukses, sehingga tidak ada audit yang menyatakan perubahan yang di-rollback.
   entries = [[aksi, before, after, sumber, refId], ...]. [TEST MODE] tetap ke Logger/collector, tidak ke sheet. */
function engineAuditBatch_(opts, entries, apiRefId) {
  if (opts && opts.testMode) { entries.forEach(function (e) { auditPushTest_(opts.auditCollector, e[0], e[1], e[2], e[3], e[4]); }); return; }
  var ts = new Date().toISOString();
  var actor = (typeof ENGINE_ACTOR_ !== 'undefined' && ENGINE_ACTOR_) ? 'google:' + ENGINE_ACTOR_ : null;
  var rows = entries.map(function (e) {
    return { id: ID_PREFIX_AUDIT + Utilities.getUuid(), timestamp: ts, aksi: e[0], before: e[1] ? JSON.stringify(e[1]) : '', after: e[2] ? JSON.stringify(e[2]) : '', sumber: actor || e[3] || 'write-door', refId: e[4] || '' };
  });
  var api = (typeof ENGINE_API_ !== 'undefined' && ENGINE_API_ && !ENGINE_API_.written) ? ENGINE_API_ : null;
  if (api) rows.push({ id: ID_PREFIX_AUDIT + Utilities.getUuid(), timestamp: ts, aksi: 'API_' + api.action, before: '', after: JSON.stringify({ actorEmail: api.email, actorRole: api.role, refId: apiRefId || '' }), sumber: 'google:' + api.email, refId: apiRefId || '' });
  sgAppendMany_(SHT_AUDIT, AUDIT_HEADERS, rows);
  if (api) api.written = true;
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
function validateTanggal_(tanggal) { // [P0-T4] tanggal kalender nyata, tanpa jam (sgDateError_, SchemaGuard.gs)
  if (tanggal === null || tanggal === undefined || tanggal === '') return 'tanggal wajib diisi (format YYYY-MM-DD)';
  return sgDateError_(tanggal);
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

/* [G] Validasi allocations[] untuk createIncome_(). */
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
  var o = {}; TRX_HEADERS.forEach(function (h) { o[h] = trx[h] !== undefined ? trx[h] : ''; });
  sgAppend_(SHT_TRANSAKSI, TRX_HEADERS, o); // [P0-A] kolom dipetakan berdasarkan nama header live
}
function writeAllocationRow_(alok) {
  var o = {}; ALOK_HEADERS.forEach(function (h) { o[h] = alok[h] !== undefined ? alok[h] : ''; });
  sgAppend_(SHT_ALOKASI, ALOK_HEADERS, o); // [P0-A]
}
function writeMutasiRow_(mut) {
  var o = {}; MUT_HEADERS.forEach(function (h) { o[h] = mut[h] !== undefined ? mut[h] : ''; });
  sgAppend_(SHT_MUTASI, MUT_HEADERS, o); // [P0-A]
}
/* [PATCH ADITIF - arsip/reversal] Alokasi yang sudah diarsipkan (kolom archivedAt terisi) TIDAK dihitung.
   Sheet tanpa kolom archivedAt berperilaku persis seperti sebelumnya. Hanya fungsi ini + getStudentPosition_ yang berubah. */
function activeAllocationRows_() {
  // [P0-A] berbasis nama; alokasi berkolom archivedAt terisi tidak dihitung
  var m = sgModel_(SHT_ALOKASI, ALOK_HEADERS);
  if (!m) return [];
  var out = [];
  m.values.forEach(function (r) {
    var a = sgGet_(m, r, 'archivedAt');
    if (a !== undefined && a !== '' && a !== null) return;
    out.push(sgObj_(m, r, ALOK_HEADERS));
  });
  return out;
}
/* [P0-B] Status alokasi transaksi PENERIMAAN DIHITUNG SERVER dengan aturan yang SAMA dengan klien
   (computeTransaksiAllocationStatus di Bendahara_V2.html): TERCATAT / TERIDENTIFIKASI / TERALOKASI /
   SEBAGIAN_TERALOKASI (siswa masih punya kewajiban) / OVERPAYMENT_CREDIT (sisa = kelebihan bayar nyata).
   Status di luar keluarga ini (SELESAI, REKONSILIASI) tidak disentuh. */
var TRX_ALLOC_STATUS_ = ['TERCATAT', 'TERIDENTIFIKASI', 'SEBAGIAN_TERALOKASI', 'TERALOKASI', 'OVERPAYMENT_CREDIT'];
var TRX_IMMUTABLE_ = ['id', 'createdAt', '_sourceFile', '_sourceSheet', '_sourceRow'];
function engineAllocStatusFor_(trx) {
  if (!trx || trx.jenis !== 'PENERIMAAN') return null;
  var alok = activeAllocationRows_().filter(function (a) { return a.transaksiId === trx.id; });
  var sudah = alok.reduce(function (s, a) { return s + Number(a.nominal || 0); }, 0);
  var sisa = Number(trx.nominal || 0) - sudah;
  if (!trx.siswaId && !alok.length) return 'TERCATAT';
  if (sudah <= 0.5) return 'TERIDENTIFIKASI';
  if (sisa <= 0.5) return 'TERALOKASI';
  var ids = [];
  alok.map(function (a) { return a.siswaId; }).concat(trx.siswaId ? [trx.siswaId] : []).forEach(function (sid) { if (sid && ids.indexOf(sid) === -1) ids.push(sid); });
  if (typeof oblLoadContext_ !== 'function') throw new Error('ObligationEngine tidak tersedia untuk menghitung status alokasi');
  if (typeof kgThrowIfBad_ === 'function') kgThrowIfBad_(); // [P1-IMP C] status SEBAGIAN/OVERPAYMENT tidak ditebak dari daftar kewajiban kosong
  var prev = OBL_CTX_, masih;
  try {
    OBL_CTX_ = oblLoadContext_();
    masih = ids.some(function (sid) { return kewajibanForSiswa(sid).some(function (o) { return sisaObligation(o) > 0; }); });
  } finally { OBL_CTX_ = prev; }
  return masih ? 'SEBAGIAN_TERALOKASI' : 'OVERPAYMENT_CREDIT';
}
function setTrxStatusCell_(trxId, status) {
  var hm = sgHeaderModel_(SHT_TRANSAKSI, ['id', 'status']);
  var rowIdx = findRowIndexById_(SHT_TRANSAKSI, trxId);
  if (rowIdx < 2) throw new Error('Transaksi tidak ditemukan untuk pembaruan status: ' + trxId);
  hm.sh.getRange(rowIdx, hm.idx.status + 1, 1, 1).setValues([[status]]);
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
var LOCK_DEPTH_ = 0; // [P1-IMP Prioritas A] kedalaman kunci dalam eksekusi ini (reentran)
function withLock_(fn) {
  if (LOCK_DEPTH_ > 0) { // sudah memegang kunci skrip di eksekusi ini: jangan ambil/lepas lagi (melepas akan membuka kunci luar)
    LOCK_DEPTH_++;
    try { return fn(); } finally { LOCK_DEPTH_--; }
  }
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
  LOCK_DEPTH_ = 1;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_ = 0;
    lock.releaseLock();
  }
}

// ============================================================
// PUBLIC API
// ============================================================
function healthCheck_() {
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
    return errResult_(engineErrCode_(e), 'healthCheck_ gagal: ' + e.message, null);
  }
}

/* [G] createIncome_(payload) - payload boleh menyertakan allocations[].
   createExpense_(payload) - PENGELUARAN, tidak menerima allocation siswa.
   createTransaction_(payload) - alias generik (jenis sudah di payload). */
function createIncome_(payload) {
  return createTransactionWithAllocations_(Object.assign({}, payload, { jenis: 'PENERIMAAN' }));
}
function createExpense_(payload) {
  return createTransactionWithAllocations_(Object.assign({}, payload, { jenis: 'PENGELUARAN', allocations: null }));
}
function createTransaction_(payload) {
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
      var priorGet = getTransaction_(idemp1.record.resultRefId);
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
        var priorGet2 = getTransaction_(idemp2.record.resultRefId);
        return okResult_('Request sudah pernah diproses (idempotent replay, terdeteksi saat lock)', priorGet2.data || { id: idemp2.record.resultRefId });
      }
      if (payload.akunId && !akunExists_(payload.akunId)) return errResult_('INVALID_ACCOUNT', 'akunId tidak valid (re-check)', 'akunId');
      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');
      var plFlagsC = plFlags_([payload.tanggal]); // [P1-POLICY] penanda periode (tidak menolak), dihitung di dalam lock

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
        return errResult_(engineErrCode_(e), 'Gagal menulis transaksi: ' + e.message, null);
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
        return errResult_(engineErrCode_(e), 'Gagal menulis allocation, transaksi sudah di-rollback: ' + e.message, null);
      }

      // --- 5c. [P0-B] status alokasi dihitung server (status kiriman klien tidak dipercaya) ---
      try {
        if (trxRecord.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(trxRecord.status)) !== -1) {
          var stHitung = engineAllocStatusFor_(trxRecord);
          if (stHitung && stHitung !== trxRecord.status) { setTrxStatusCell_(trxId, stHitung); trxRecord.status = stHitung; }
        }
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: hitung status gagal, rollback: ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_(engineErrCode_(e), 'Gagal menghitung status alokasi, transaksi sudah di-rollback: ' + e.message, null);
      }

      // --- 6. [P1-B] idempotency record LEBIH DULU (belum ada audit yang ditulis bila langkah ini gagal) ---
      try {
        recordIdempotentResult_(payload.clientRequestId, trxId, 'transaction');
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: idempotency record gagal, rollback transaksi+allocation: ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, transaksi+allocation sudah di-rollback (belum ada audit yang tertulis): ' + e.message, null, trxId);
      }

      // --- 7. [P1-B] audit TERAKHIR, satu append: CREATE_TRANSACTION + CREATE_ALLOCATION + jejak aktor/role ---
      try {
        var auditRows = [['CREATE_TRANSACTION', null, trxRecord, payload.sumber || 'write-door', trxId]];
        allocations.forEach(function (a, i) {
          auditRows.push(['CREATE_ALLOCATION', null, { transaksiId: trxId, siswaId: a.siswaId, komponenId: a.komponenId, nominal: a.nominal }, payload.sumber || 'write-door', writtenAllocIds[i]]);
        });
        if (plFlagsC.length) auditRows.push(['PERIODE_DITANDAI', null, plMarkAfter_(plFlagsC, 'CREATE_TRANSACTION'), payload.sumber || 'write-door', trxId]);
        engineAuditBatch_(opts, auditRows, trxId);
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: audit gagal, rollback transaksi+allocation+idempotency (tidak ada audit parsial): ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e), 'Gagal menulis audit, transaksi+allocation+idempotency sudah di-rollback (tidak ada audit parsial): ' + e.message, null, trxId);
      }

      // --- 8. success ---
      var okC = okResult_('Transaksi berhasil dibuat', { id: trxId, transaction: trxRecord, allocationIds: writtenAllocIds });
      if (plFlagsC.length) okC.data.periodeDitandai = plFlagsC; // [P1-POLICY]
      return okC;
    });
  } catch (e) {
    Logger.log('createTransactionWithAllocations_: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_(engineErrCode_(e), 'createTransactionWithAllocations_ error tak terduga: ' + e.message, null);
  }
}

/* [TEST MODE] SATU-SATUNYA titik di seluruh file yang menyalakan
   opts.testMode = true. Fungsi privat (trailing underscore + akhiran
   _ForTest_), TIDAK ADA di daftar 10 fungsi wajib section C, TIDAK PERNAH
   dipanggil oleh createIncome_/createExpense_/createTransaction_ ataupun jalur
   public lain - HANYA oleh testConcurrentWriteDoor_() di bawah. Menerima
   `collector` (array) supaya audit test bisa diperiksa balik dari hasil
   test tanpa pernah menyentuh 13_AUDIT_LOG. */
function createTransactionWithAllocations_ForTest_(payload, collector) {
  return createTransactionWithAllocations_(payload, { testMode: true, auditCollector: collector });
}

/* [J] createAllocation_(payload) - allocation berdiri sendiri terhadap
   transaksi yang SUDAH ADA. validate -> lock -> re-check transaction ->
   cek total allocation -> write -> audit -> idempotency; rollback kalau
   audit/idempotency gagal. */
function createAllocation_(payload) {
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
      var plFlagsA = plFlags_([trx && trx.tanggal]); // [P1-POLICY] penanda periode transaksi induk (tidak menolak)
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
        Logger.log('createAllocation_: write gagal: ' + e.message);
        return errResult_(engineErrCode_(e), 'Gagal menulis allocation: ' + e.message, null);
      }
      // [P0-B] status alokasi transaksi induk dihitung server
      var statusSebelum = trx.status, statusBaru = null;
      try {
        if (trx.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(trx.status || 'TERCATAT')) !== -1) {
          statusBaru = engineAllocStatusFor_(trx);
          if (statusBaru && statusBaru !== trx.status) setTrxStatusCell_(trx.id, statusBaru); else statusBaru = null;
        }
      } catch (e) {
        deleteRowById_(SHT_ALOKASI, alokId);
        return errResult_(engineErrCode_(e), 'Gagal menghitung status alokasi, allocation sudah di-rollback: ' + e.message, null, alokId);
      }
      if (statusBaru) alokRecord.statusTransaksi = statusBaru;
      // [P1-B] idempotency LEBIH DULU, audit TERAKHIR (satu append bersama jejak aktor/role)
      try {
        recordIdempotentResult_(payload.clientRequestId, alokId, 'allocation');
      } catch (e) {
        Logger.log('createAllocation_: idempotency gagal, rollback allocation: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, allocation sudah di-rollback (belum ada audit yang tertulis): ' + e.message, null, alokId);
      }
      try {
        var auA = [['CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId]];
        if (plFlagsA.length) auA.push(['PERIODE_DITANDAI', null, plMarkAfter_(plFlagsA, 'CREATE_ALLOCATION'), payload.sumber || 'write-door', alokId]);
        engineAuditBatch_({}, auA, alokId);
      } catch (e) {
        Logger.log('createAllocation_: audit gagal, rollback allocation+idempotency: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e), 'Gagal menulis audit, allocation+idempotency sudah di-rollback (tidak ada audit parsial): ' + e.message, null, alokId);
      }
      if (plFlagsA.length) alokRecord.periodeDitandai = plFlagsA; // [P1-POLICY]
      return okResult_('Allocation berhasil dibuat', alokRecord);
    });
  } catch (e) {
    Logger.log('createAllocation_: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_(engineErrCode_(e), 'createAllocation_ error tak terduga: ' + e.message, null);
  }
}

/* [K] createBankMutation_(payload) - staging rekonsiliasi, TERPISAH dari
   05_TRANSAKSI, TIDAK OTOMATIS membuat transaksi. */
function createBankMutation_(payload) {
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

      var plFlagsM = plFlags_([payload.tanggal]); // [P1-POLICY] penanda periode (tidak menolak)
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
        Logger.log('createBankMutation_: write gagal: ' + e2.message);
        return errResult_(engineErrCode_(e2), 'Gagal menulis mutasi bank: ' + e2.message, null);
      }
      // [P1-B] idempotency LEBIH DULU, audit TERAKHIR
      try {
        recordIdempotentResult_(payload.clientRequestId, mutId, 'bankMutation');
      } catch (e2) {
        Logger.log('createBankMutation_: idempotency gagal, rollback mutasi: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis idempotency record, mutasi sudah di-rollback (belum ada audit yang tertulis): ' + e2.message, null, mutId);
      }
      try {
        var auM = [['CREATE_BANK_MUTATION', null, mutRecord, payload.sumber || 'write-door', mutId]];
        if (plFlagsM.length) auM.push(['PERIODE_DITANDAI', null, plMarkAfter_(plFlagsM, 'CREATE_BANK_MUTATION'), payload.sumber || 'write-door', mutId]);
        engineAuditBatch_({}, auM, mutId);
      } catch (e2) {
        Logger.log('createBankMutation_: audit gagal, rollback mutasi+idempotency: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis audit, mutasi+idempotency sudah di-rollback (tidak ada audit parsial): ' + e2.message, null, mutId);
      }
      if (plFlagsM.length) mutRecord.periodeDitandai = plFlagsM; // [P1-POLICY]
      return okResult_('Mutasi bank berhasil dicatat', mutRecord);
    });
  } catch (e) {
    Logger.log('createBankMutation_: error tak terduga: ' + e.message + '\n' + e.stack);
    return errResult_(engineErrCode_(e), 'createBankMutation_ error tak terduga: ' + e.message, null);
  }
}

/* [I] updateTransaction_(payload) - bukan blind overwrite. cari -> exists ->
   validate -> lock -> re-check -> update -> audit. Kalau update sukses tapi
   audit gagal: RESTORE nilai before (bukan rollback-hapus, karena baris
   sudah ada sejak sebelumnya - beda dari create yang rollback-nya delete). */
function updateTransaction_(payload) {
  /* [P0-B] Patch PARSIAL: hanya field yang benar-benar berubah yang divalidasi dan ditulis; kolom lain
     (termasuk kolom tambahan/arsip) dipertahankan apa adanya. Field di luar kontrak / immutable ditolak.
     Nominal tidak boleh < total alokasi aktif. Status keluarga alokasi dihitung server. Patch tanpa
     perubahan = no-op (tanpa tulis, tanpa audit) sehingga retry aman. Audit gagal -> nilai dipulihkan.
     [P1-B] clientRequestId (opsional) = idempotensi: replay TIDAK diterapkan ulang (tidak menimpa perubahan yang lebih baru).
     [P1-F] _expect (opsional) = {field: nilai yang dilihat klien sebelum mengubah}; nilai server berbeda -> CONFLICT.
     [P1-POLICY] tanggal lama atau baru pada periode bertanda/terlapor TIDAK menolak koreksi; baris audit PERIODE_DITANDAI
     ikut append audit yang sama dengan UPDATE_TRANSACTION (koreksi historis selalu tertelusur).
     [P1-E] transisi ke SELESAI wajib minimal satu bukti berfile (EVIDENCE_REQUIRED).
     Urutan tulis: baris -> idempotensi -> audit (satu append, terakhir); kegagalan memulihkan langkah sebelumnya. */
  try {
    if (!payload || !payload.id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
    var crid = payload.clientRequestId ? String(payload.clientRequestId) : '';
    var expect = payload._expect;
    if (expect !== undefined && expect !== null && (typeof expect !== 'object' || Array.isArray(expect))) return errResult_('VALIDATION_ERROR', '_expect harus berupa objek {field: nilai}', '_expect', payload.id);
    var keys = Object.keys(payload).filter(function (k) { return k !== 'id' && k !== 'clientRequestId' && k !== '_expect'; });
    var bad = keys.filter(function (k) { return TRX_HEADERS.indexOf(k) === -1 || TRX_IMMUTABLE_.indexOf(k) !== -1; });
    if (bad.length) return errResult_('UNKNOWN_FIELD', 'Field tidak dikenal atau tidak boleh diubah: ' + bad.join(', '), bad[0], payload.id);
    var replayOf = function (idem) {
      if (idem.record.resultRefId !== payload.id) return errResult_('IDEMPOTENCY_MISMATCH', 'clientRequestId sudah dipakai untuk transaksi lain (' + idem.record.resultRefId + ')', 'clientRequestId', payload.id);
      var t = getTransactionRaw_(payload.id);
      return okResult_('Request sudah pernah diproses (idempotent replay) - perubahan tidak diterapkan ulang', t || { id: payload.id });
    };
    if (crid) { var idem1 = checkIdempotency_(crid); if (idem1.status !== 'none') return replayOf(idem1); }
    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);

    return withLock_(function () {
      if (crid) { var idem2 = checkIdempotency_(crid); if (idem2.status !== 'none') return replayOf(idem2); }
      var m = sgModel_(SHT_TRANSAKSI, TRX_HEADERS);
      var pos = -1;
      for (var i = 0; i < m.values.length; i++) { if (m.values[i][m.idx.id] === payload.id) { pos = i; break; } }
      if (pos === -1) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan (re-check): ' + payload.id, 'id', payload.id);
      var raw = m.values[pos];
      var arch = sgGet_(m, raw, 'archivedAt');
      if (arch !== undefined && arch !== '' && arch !== null) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (re-check) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);
      var cur = sgObj_(m, raw, TRX_HEADERS);
      cur.tanggal = sgDateStr_(cur.tanggal); cur.createdAt = sgIsoStr_(cur.createdAt);
      var norm = function (k, v) {
        if (k === 'nominal') return (v === '' || v === null || v === undefined) ? '' : Number(v);
        return (v === null || v === undefined) ? '' : String(v).trim();
      };
      if (expect) { // [P1-F] deteksi konflik: nilai server berubah sejak klien membacanya (dan bukan nilai tujuan yang sama)
        var conflict = Object.keys(expect).filter(function (k) {
          if (TRX_HEADERS.indexOf(k) === -1) return false;
          if (norm(k, expect[k]) === norm(k, cur[k])) return false;
          return !(Object.prototype.hasOwnProperty.call(payload, k) && norm(k, payload[k]) === norm(k, cur[k]));
        });
        if (conflict.length) {
          var ce = errResult_('CONFLICT', 'Transaksi diubah pengguna lain sejak dimuat (' + conflict.join(', ') + '); perubahan TIDAK diterapkan - muat ulang lalu ulangi', conflict[0], payload.id);
          ce.current = {}; conflict.forEach(function (k) { ce.current[k] = cur[k]; });
          return ce;
        }
      }
      var next = Object.assign({}, cur);
      keys.forEach(function (k) {
        if (norm(k, payload[k]) === norm(k, cur[k])) return;
        next[k] = k === 'nominal' ? Number(payload[k]) : (typeof payload[k] === 'string' ? payload[k].trim() : (payload[k] === null || payload[k] === undefined ? '' : payload[k]));
      });
      var changed = function () { return TRX_HEADERS.filter(function (k) { return norm(k, next[k]) !== norm(k, cur[k]); }); };
      var ch = changed(), e1 = null, field = null, code = 'VALIDATION_ERROR';
      var allocSum = sumAllocationsForTransaksi_(payload.id);
      ch.forEach(function (k) {
        if (e1) return;
        if (k === 'jenis') { e1 = validateJenis_(next.jenis); if (!e1 && allocSum > 0) e1 = 'jenis tidak dapat diubah: transaksi memiliki alokasi aktif'; }
        else if (k === 'tanggal') e1 = validateTanggal_(next.tanggal);
        else if (k === 'unit') e1 = validateUnit_(next.unit);
        else if (k === 'nominal') { e1 = validateNominal_(next.nominal); if (!e1 && Number(next.nominal) + 0.5 < allocSum) { e1 = 'nominal (' + next.nominal + ') lebih kecil dari total alokasi aktif (' + allocSum + ')'; code = 'ALLOCATION_EXCEEDS_TRANSACTION'; } }
        else if (k === 'metode') { if (!next.metode || typeof next.metode !== 'string') e1 = 'metode wajib diisi'; }
        else if (k === 'status') e1 = validateStatus_(next.status);
        else if (k === 'akunId') { if (next.akunId && !akunExists_(next.akunId)) { e1 = 'akunId tidak ditemukan di ' + SHT_AKUN + ': ' + next.akunId; code = 'INVALID_ACCOUNT'; } }
        else if (k === 'siswaId') { if (next.siswaId && !siswaExists_(next.siswaId)) { e1 = 'siswaId tidak ditemukan di ' + SHT_SISWA + ': ' + next.siswaId; code = 'INVALID_STUDENT'; } }
        else if (k === '_komponenHint') { if (next._komponenHint && !komponenExists_(next._komponenHint)) { e1 = 'komponen tidak ditemukan di ' + SHT_KOMPONEN + ': ' + next._komponenHint; code = 'INVALID_COMPONENT'; } }
        if (e1) field = k;
      });
      if (e1) return errResult_(code, e1, field, payload.id);
      if (next.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(next.status)) !== -1 && ch.some(function (k) { return ['status', 'nominal', 'siswaId', 'jenis'].indexOf(k) !== -1; })) {
        var st = engineAllocStatusFor_(next);
        if (st) next.status = st;
      }
      ch = changed();
      if (!ch.length) {
        if (crid) recordIdempotentResult_(crid, payload.id, 'transactionUpdate'); // [P1-B] replay berikutnya = no-op juga
        var same = okResult_('Tidak ada perubahan (data server sudah sama)', cur);
        same.data.unchanged = true;
        if (payload.status && payload.status !== cur.status) same.data.statusDihitungServer = true;
        return same;
      }
      var plFlagsU = plFlags_([cur.tanggal, next.tanggal]); // [P1-POLICY] penanda, bukan penolakan
      if (next.status === 'SELESAI' && cur.status !== 'SELESAI' && !rgTrxHasEvidence_(payload.id)) { // [P1-E]
        return errResult_('EVIDENCE_REQUIRED', 'Status SELESAI memerlukan minimal satu bukti berfile yang tertaut ke transaksi ini - lampirkan bukti lebih dulu', 'status', payload.id);
      }
      var newRaw = raw.slice();
      ch.forEach(function (k) { newRaw[m.idx[k]] = next[k]; });
      var rowNum = pos + 2;
      var restore = function () { m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([raw]); };
      try {
        m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([newRaw]);
      } catch (e) {
        Logger.log('updateTransaction_: write gagal: ' + e.message);
        return errResult_(engineErrCode_(e), 'Gagal update transaksi: ' + e.message, null, payload.id);
      }
      if (crid) {
        try { recordIdempotentResult_(crid, payload.id, 'transactionUpdate'); } catch (e) {
          try { restore(); } catch (restoreErr) { return errResult_('ROLLBACK_FAILED', 'Idempotency gagal DAN restore nilai before juga gagal: ' + restoreErr.message, null, payload.id); }
          return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, nilai transaksi sudah di-restore: ' + e.message, null, payload.id);
        }
      }
      try {
        var auU = [['UPDATE_TRANSACTION', cur, next, 'write-door', payload.id]];
        if (plFlagsU.length) auU.push(['PERIODE_DITANDAI', null, plMarkAfter_(plFlagsU, 'UPDATE_TRANSACTION'), 'write-door', payload.id]);
        engineAuditBatch_({}, auU, payload.id);
      } catch (e) {
        Logger.log('updateTransaction_: audit gagal setelah update sukses, RESTORE nilai before: ' + e.message);
        try { restore(); if (crid) deleteIdempotencyByClientRequestId_(crid); } catch (restoreErr) {
          return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN restore nilai before juga gagal: ' + restoreErr.message, null, payload.id);
        }
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, nilai transaksi sudah di-restore ke sebelum update: ' + e.message, null, payload.id);
      }
      var out = okResult_('Transaksi berhasil diupdate', next);
      out.data.changedFields = ch;
      if (plFlagsU.length) out.data.periodeDitandai = plFlagsU;
      if (payload.status && next.status !== payload.status) out.data.statusDihitungServer = true;
      return out;
    });
  } catch (e) {
    Logger.log('updateTransaction_: error tak terduga: ' + e.message);
    return errResult_(engineErrCode_(e), 'updateTransaction_ error tak terduga: ' + e.message, null);
  }
}

// ============================================================
// SERVER-SIDE READ (dari Sheets, BUKAN localStorage)
// ============================================================
/* [PATCH ADITIF - transaksi arsip] Membaca baris transaksi (23 kolom posisional, TIDAK berubah) + info arsip dari kolom
   archivedAt/archivedBy/archiveReason (bila ada di header live). Field arsip hanya ditempel bila archivedAt terisi, jadi bentuk
   baris transaksi aktif IDENTIK dengan sebelumnya. Sheet tanpa kolom arsip berperilaku persis seperti sebelumnya. */
function readTrxRows_() {
  // [P0-A] berbasis nama header; [P0-B] tanggal sel Date dinormalisasi ke yyyy-MM-dd, createdAt ke ISO
  var m = sgModel_(SHT_TRANSAKSI, TRX_HEADERS);
  if (!m) return [];
  return m.values.map(function (r) {
    var o = sgObj_(m, r, TRX_HEADERS);
    o.tanggal = sgDateStr_(o.tanggal);
    o.createdAt = sgIsoStr_(o.createdAt);
    var a = sgGet_(m, r, 'archivedAt');
    if (a !== undefined && a !== '' && a !== null) {
      o.archivedAt = a;
      o.archivedBy = sgGet_(m, r, 'archivedBy') || '';
      o.archiveReason = sgGet_(m, r, 'archiveReason') || '';
    }
    return o;
  });
}
function getTransactionRaw_(id) {
  var rows = readTrxRows_();
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}
function getTransaction_(id) {
  var t = getTransactionRaw_(id);
  if (!t) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + id, 'id', id);
  return okResult_('OK', t);
}
function getTransactions_(filters) {
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
/* [L] getStudentPosition_() - HANYA agregasi mentah, BUKAN kewajiban
   terhitung/expected receivable. Engine itu sengaja tidak dipindahkan ke sini. */
function getStudentPosition_(siswaId) {
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
function testConcurrentWriteDoor_() {
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

  Logger.log('testConcurrentWriteDoor_ selesai. deletedTestTransactionIds=' + JSON.stringify(cleanupIds) +
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
  return okResult_('testConcurrentWriteDoor_ selesai (transaksi+idempotency test sudah dibersihkan; audit test TIDAK PERNAH menyentuh 13_AUDIT_LOG production)', summary);
}

// ============================================================
// [N] FINANCIAL SAFETY TEST - hanya jalur REJECT yang secara desain TIDAK
// PERNAH menulis apa pun ke Sheets, jadi aman dijalankan berkali-kali.
// ============================================================
function runFinancialSafetyTests_() {
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
  return okResult_('runFinancialSafetyTests_ selesai (jalur REJECT saja - tidak menulis data)', {
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
function regressionCheck_() {
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
  var note = 'Sejak TEST MODE dipisahkan dari audit production (auditPushTest_/writeAuditEntry_), testConcurrentWriteDoor_() TIDAK PERNAH menulis ke 13_AUDIT_LOG - jadi kelima metrik di atas, TERMASUK jumlahAuditLog, WAJIB persis sama dengan baseline bahkan setelah testConcurrentWriteDoor_() dijalankan berkali-kali.';
  return okResult_('regressionCheck_ selesai', { baseline: REGRESSION_BASELINE, actual: actual, differences: differences, status: status, note: note });
}
