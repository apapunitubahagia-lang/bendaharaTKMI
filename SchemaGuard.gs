/**
 * SchemaGuard.gs - [P0-A] Pembacaan/penulisan sheet berbasis NAMA header + gagal tertutup.
 *
 * - Header baris 1 dibaca dari sheet LIVE (di-trim). Kolom wajib dicari berdasarkan nama, bukan posisi.
 * - Bila kolom wajib hilang atau ganda -> Error dengan code 'SCHEMA_MISMATCH' (tidak pernah mengembalikan
 *   data yang bergeser). Pemanggil publik memetakan Error itu ke {ok:false, code:'SCHEMA_MISMATCH'} lewat sgErr_.
 * - Kolom tambahan yang sah (mis. archivedAt, kolom aditif) dipertahankan apa adanya.
 * - TIDAK membuat atau mengubah sheet/header apa pun.
 *
 * DEPENDENSI: TransactionEngine.gs (ss_, errResult_).
 */
var SG_PK_ = { '24_IDEMPOTENCY_LOG': 'clientRequestId', '25_DEVICE_WHITELIST': 'deviceId', '15_SETTINGS': 'key' };

function sgSchemaError_(sheetName, missing, detail) {
  var e = new Error('SCHEMA_MISMATCH pada ' + sheetName + ': ' + (detail || ('kolom wajib tidak ditemukan: ' + missing.join(', '))));
  e.code = 'SCHEMA_MISMATCH'; e.sheet = sheetName; e.missing = missing || [];
  return e;
}
function sgLiveHeaders_(sh) {
  var lc = sh.getLastColumn();
  if (lc < 1) return [];
  return sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
}
/* Peta nama -> indeks kolom (0-based). Melempar SCHEMA_MISMATCH bila kolom wajib hilang/ganda. */
function sgIndex_(sheetName, live, required) {
  var idx = {}, dup = [];
  live.forEach(function (h, i) {
    if (!h) return;
    if (Object.prototype.hasOwnProperty.call(idx, h)) dup.push(h); else idx[h] = i;
  });
  var req = required || [];
  var missing = req.filter(function (h) { return !Object.prototype.hasOwnProperty.call(idx, h); });
  if (missing.length) throw sgSchemaError_(sheetName, missing);
  var dupReq = dup.filter(function (h) { return req.indexOf(h) !== -1; });
  if (dupReq.length) throw sgSchemaError_(sheetName, [], 'kolom wajib ganda: ' + dupReq.join(', '));
  return idx;
}
/* Header saja (untuk append). null bila sheet tidak ada. */
function sgHeaderModel_(sheetName, required) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return null;
  var live = sgLiveHeaders_(sh);
  if (!live.length) throw sgSchemaError_(sheetName, required || [], 'baris header kosong');
  return { sh: sh, live: live, idx: sgIndex_(sheetName, live, required) };
}
/* Header + seluruh baris data (nilai mentah, lebar = jumlah kolom live). null bila sheet tidak ada. */
function sgModel_(sheetName, required) {
  var hm = sgHeaderModel_(sheetName, required);
  if (!hm) return null;
  var lastRow = hm.sh.getLastRow();
  hm.lastRow = lastRow;
  hm.values = lastRow >= 2 ? hm.sh.getRange(2, 1, lastRow - 1, hm.live.length).getValues() : [];
  return hm;
}
function sgGet_(m, row, h) { return Object.prototype.hasOwnProperty.call(m.idx, h) ? row[m.idx[h]] : undefined; }
/* Objek dari satu baris; fields = daftar header yang diambil (default semua header live bernama). */
function sgObj_(m, row, fields) {
  var o = {};
  (fields || m.live).forEach(function (h) { if (h && Object.prototype.hasOwnProperty.call(m.idx, h)) o[h] = row[m.idx[h]]; });
  return o;
}
/* Array baris selebar header live dari objek; base = baris lama (kolom lain dipertahankan). */
function sgRowArray_(m, obj, base) {
  var row = base ? base.slice() : m.live.map(function () { return ''; });
  while (row.length < m.live.length) row.push('');
  Object.keys(obj).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(m.idx, k)) row[m.idx[k]] = obj[k]; });
  return row;
}
/* Append satu baris berdasarkan nama kolom. Mengembalikan nomor baris sheet (1-based). */
function sgAppend_(sheetName, required, obj) {
  var hm = sgHeaderModel_(sheetName, required);
  if (!hm) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  var rowNum = hm.sh.getLastRow() + 1;
  hm.sh.getRange(rowNum, 1, 1, hm.live.length).setValues([sgRowArray_(hm, obj)]);
  return rowNum;
}
/* Append banyak baris sekaligus. */
function sgAppendMany_(sheetName, required, objs) {
  if (!objs.length) return 0;
  var hm = sgHeaderModel_(sheetName, required);
  if (!hm) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  var rowNum = hm.sh.getLastRow() + 1;
  hm.sh.getRange(rowNum, 1, objs.length, hm.live.length).setValues(objs.map(function (o) { return sgRowArray_(hm, o); }));
  return rowNum;
}
/* Tanggal sel Sheets (Date) -> 'yyyy-MM-dd' zona waktu spreadsheet; nilai lain apa adanya. */
function sgDateStr_(v) {
  if (v instanceof Date) {
    var tz = 'UTC';
    try { tz = ss_().getSpreadsheetTimeZone() || 'UTC'; } catch (e) { /* default UTC */ }
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}
function sgIsoStr_(v) { return v instanceof Date ? v.toISOString() : v; }
/* Exception -> hasil terstruktur. SCHEMA_MISMATCH dan kode lain yang dibawa Error dipertahankan. */
function sgErr_(e, fallbackCode, message) {
  if (e && e.code) return errResult_(e.code, String(e.message || message || e.code), null);
  return errResult_(fallbackCode || 'WRITE_FAILED', (message || 'Operasi gagal') + (e && e.message ? ': ' + e.message : ''), null);
}

/* [P0-A] Kolom wajib untuk pembacaan oleh mesin hitung (kewajiban, Financial Control, rencana tarif).
   Hanya kolom KONTRAK DASAR (DB_SCHEMA) yang memang dibaca mesin; kolom aditif opsional tidak diwajibkan. */
var SG_REQUIRED_ = {
  '01_SISWA': ['id', 'nama', 'kelas', 'unit', 'tahunAjaran', 'tanggalMasuk', 'tanggalKeluar', 'status'],
  '02_KOMPONEN': ['id', 'nama', 'unit', 'frekuensi', 'status', 'aliasOf'],
  '03_TARIF': ['id', 'komponenId', 'unit', 'kelas', 'tahunAjaran', 'nominal'],
  '04_KEWAJIBAN': ['id', 'siswaId', 'komponenId', 'periode', 'bruto', 'potongan', 'netto', 'tagihanId'],
  '05_TRANSAKSI': ['id', 'jenis', 'tanggal', 'unit', 'nominal', 'akunId', 'status', 'kategori', 'subkategori'],
  '06_ALOKASI': ['id', 'transaksiId', 'siswaId', 'komponenId', 'periode', 'nominal', 'tagihanId'],
  '07_AKUN': ['id', 'nama', 'jenis', 'saldoAwal'],
  '08_ANGGARAN': ['id', 'periode', 'program', 'kategori', 'unit', 'nominal'],
  '09_KOMITMEN': ['id', 'nominal', 'status'],
  '15_SETTINGS': ['key', 'value'],
  '16_REKONSILIASI': ['id', 'akunId', 'periode', 'status'],
  '18_RKAT': ['id', 'tahun', 'pagu'],
  '21_KATEGORI_PENGELUARAN': ['id', 'kategori']
};
/* Baris sheet sebagai objek (semua kolom live, aman-JSON) setelah validasi kolom wajib. [] bila sheet tidak ada. */
function sgRowsChecked_(sheetName) {
  var m = sgModel_(sheetName, SG_REQUIRED_[sheetName] || []);
  if (!m) return [];
  return m.values.map(function (r) { var o = sgObj_(m, r); return typeof opJsonSafe_ === 'function' ? opJsonSafe_(o) : o; });
}
