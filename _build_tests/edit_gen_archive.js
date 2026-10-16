/* Menambah patch aditif "transaksi arsip" ke build_server_engines.js (jalankan SEKALI; idempoten terhadap marker). */
const fs = require('fs');
const P = __dirname + '/build_server_engines.js';
let t = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n');
if (t.includes('PATCH ADITIF - transaksi arsip')) { console.log('sudah dipatch'); process.exit(0); }
const rep = (a, b) => { if (t.split(a).length !== 2) throw new Error('anchor: ' + a.slice(0, 80)); t = t.replace(a, () => b); };

// 1) disisipkan tepat sebelum penulisan TransactionEngine.gs
rep("fs.writeFileSync(OUT + 'TransactionEngine.gs', eng);", `// ---- patch aditif: transaksi arsip tidak ikut daftar/aktif, tidak bisa diubah, tidak bisa menerima alokasi baru ----
const rawOld = \`function getTransactionRaw_(id) {
  var rows = readAllRows_(SHT_TRANSAKSI, TRX_HEADERS);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}\`;
if (!eng.includes(rawOld)) throw new Error('anchor getTransactionRaw_ tidak cocok');
eng = eng.replace(rawOld, \`/* [PATCH ADITIF - transaksi arsip] Membaca baris transaksi (23 kolom posisional, TIDAK berubah) + info arsip dari kolom
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
}\`);
const gtOld = \`function getTransactions(filters) {
  filters = filters || {};
  var rows = readAllRows_(SHT_TRANSAKSI, TRX_HEADERS);
  var out = rows.filter(function (r) {\`;
if (!eng.includes(gtOld)) throw new Error('anchor getTransactions tidak cocok');
eng = eng.replace(gtOld, \`function getTransactions(filters) {
  filters = filters || {};
  var rows = readTrxRows_();
  var out = rows.filter(function (r) {
    if (r.archivedAt && filters.includeArchived !== true) return false; // [PATCH] transaksi arsip tidak termasuk daftar aktif (kecuali diminta eksplisit)\`);
const upOld = \`    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);\`;
if (!eng.includes(upOld)) throw new Error('anchor updateTransaction/before tidak cocok');
eng = eng.replace(upOld, upOld + \`
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);\`);
const reOld = \`      var beforeRecheck = getTransactionRaw_(payload.id);\`;
if (!eng.includes(reOld)) throw new Error('anchor beforeRecheck tidak cocok');
eng = eng.replace(reOld, reOld + \`
      if (beforeRecheck && beforeRecheck.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (re-check) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);\`);
const alOld = \`      var trx = getTransactionRaw_(payload.transaksiId);
      var currentSum = sumAllocationsForTransaksi_(payload.transaksiId);\`;
if (!eng.includes(alOld)) throw new Error('anchor createAllocation/trx tidak cocok');
eng = eng.replace(alOld, \`      var trx = getTransactionRaw_(payload.transaksiId);
      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');
      var currentSum = sumAllocationsForTransaksi_(payload.transaksiId);\`);
fs.writeFileSync(OUT + 'TransactionEngine.gs', eng);`);
// 2) kewajiban: alokasi milik transaksi yang diarsipkan tidak dihitung (pertahanan bila arsip dilakukan di luar opArchiveTransaction)
rep("    alokasi: mk('06_ALOKASI').map(function (r) {", "    alokasi: mk('06_ALOKASI').filter(function (r) { return !archTrx[oblS_(r.transaksiId)]; }).map(function (r) {");
rep("  var komponen = mk('02_KOMPONEN').map(", "  var archTrx = {}; (function () { var m5 = opSheetModel_('05_TRANSAKSI'); if (!m5) return; var ia = m5.live.indexOf('archivedAt'), ii = m5.live.indexOf('id'); if (ia === -1 || ii === -1) return; m5.rows.forEach(function (r) { if (r[ia] !== '' && r[ia] !== null && r[ia] !== undefined) archTrx[String(r[ii])] = true; }); })();\n  var komponen = mk('02_KOMPONEN').map(");
fs.writeFileSync(P, t);
console.log('generator dipatch: transaksi arsip');
