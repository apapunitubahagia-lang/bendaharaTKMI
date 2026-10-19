// Langkah build P0-T4 (server). Dijalankan SETELAH apply_p1_rab_server.js. Commit terpisah, mudah di-revert.
// validateTanggal_ (TransactionEngine.gs, generate) memakai validasi kalender bersama sgDateError_ (SchemaGuard.gs):
// berlaku untuk create/update/batch transaksi dan jalur doPost lama (memakai engine yang sama). Update hanya memeriksa
// tanggal bila field itu berubah (perilaku updateTransaction_ yang sudah ada). Tidak ada koreksi tanggal historis.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, "function validateTanggal_(tanggal) {\n  if (!tanggal || typeof tanggal !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}/.test(tanggal)) return 'tanggal wajib format YYYY-MM-DD';\n  return null;\n}",
  "function validateTanggal_(tanggal) { // [P0-T4] tanggal kalender nyata, tanpa jam (sgDateError_, SchemaGuard.gs)\n  if (tanggal === null || tanggal === undefined || tanggal === '') return 'tanggal wajib diisi (format YYYY-MM-DD)';\n  return sgDateError_(tanggal);\n}", 'validateTanggal_', log);
L.save(te);
fs.writeFileSync(OUT + '_p0_t4_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_p0_t4_server OK: ' + log.length + ' perubahan');
