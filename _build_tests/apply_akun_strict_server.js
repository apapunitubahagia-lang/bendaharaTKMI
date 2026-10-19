// Langkah build P1_19 C (server). Dijalankan SETELAH apply_alloc_lock_server.js. Paket terpisah agar mudah di-revert.
// updateTransaction_: akunId transaksi tidak dapat DIKOSONGKAN lewat koreksi (opUpdateTransaction); ganti ke akun lain tetap
// harus ada di 07_AKUN (aturan lama). Nilai historis yang tidak berubah tidak diperiksa ulang.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, "        else if (k === 'akunId') { if (next.akunId && !akunExists_(next.akunId)) {",
  "        else if (k === 'akunId') { if (!next.akunId) { e1 = 'akunId tidak boleh dikosongkan (akun Kas/Bank wajib eksplisit)'; } else if (!akunExists_(next.akunId)) { /* [P1_19 C] */", 'updateTransaction_ akunId wajib', log);
L.save(te);
fs.writeFileSync(OUT + '_akun_strict_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_akun_strict_server OK: ' + log.length + ' perubahan');
