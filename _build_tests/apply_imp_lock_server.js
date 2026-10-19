// Langkah build P1-IMP Prioritas A (server). Dijalankan SETELAH apply_p0_t4_server.js. Paket terpisah agar mudah di-revert.
// withLock_ (TransactionEngine.gs, dihasilkan) dibuat REENTRAN dalam satu eksekusi: panggilan bersarang tidak mengambil/melepas
// kunci lagi (LOCK_DEPTH_). Perilaku panggilan tunggal (tanpa sarang) identik dengan sebelumnya: waitLock(10000), LOCK_TIMEOUT,
// releaseLock di finally. Dipakai opImportCommit agar pemeriksaan ulang + seluruh tulisan potongan berada di bawah SATU kunci.
// Global Apps Script bersifat per eksekusi, sehingga LOCK_DEPTH_ tidak dibagi antar-pengguna.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.replFn(te, 'withLock_', `var LOCK_DEPTH_ = 0; // [P1-IMP Prioritas A] kedalaman kunci dalam eksekusi ini (reentran)
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
}`, log);
L.save(te);
fs.writeFileSync(OUT + '_imp_lock_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_imp_lock_server OK: ' + log.length + ' perubahan');
