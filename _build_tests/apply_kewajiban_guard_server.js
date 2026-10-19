// Langkah build P1-IMP Prioritas C (server). Dijalankan SETELAH apply_imp_lock_server.js. Paket terpisah agar mudah di-revert.
// Daftar/angka kewajiban TIDAK dihitung bila periodeAktif tidak valid atau sumber tidak tersedia/tidak lengkap (kgStatus_,
// KewajibanGuard.gs): opObligations & snapshot mengembalikan kode eksplisit; status alokasi sebagian (engineAllocStatusFor_)
// gagal tertutup dengan kode yang dipertahankan engineErrCode_. Formula/kebijakan kewajiban tidak diubah.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const ob = L.load(OUT + 'ObligationEngine.gs');
L.rep(ob, `function opObligations(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
`, `function opObligations(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    var ks = kgStatus_(); if (!ks.ok) return kgErr_(ks); // [P1-IMP C] bukan daftar kosong
`, 'opObligations kgStatus_', log);
L.rep(ob, `return okResult_('OK', { rows: rows, count: rows.length, totals: tot, periodeAktif: OBL_CTX_.settings.periodeAktif, computedAt: new Date().toISOString() });`,
  `return okResult_('OK', { rows: rows, count: rows.length, totals: tot, periodeAktif: OBL_CTX_.settings.periodeAktif, computedAt: new Date().toISOString(), statusData: 'LENGKAP' }); // [P1-IMP C] kosong di sini = kewajiban nol yang sah`, 'opObligations statusData', log);
L.rep(ob, `function oblSnapshotCore_(opts) {
  try {
`, `function oblSnapshotCore_(opts) {
  var ks0 = kgStatus_(); if (!ks0.ok) return kgErr_(ks0); // [P1-IMP C]
  try {
`, 'oblSnapshotCore_ kgStatus_', log);
L.save(ob);
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, `function engineErrCode_(e) { return e && e.code === 'SCHEMA_MISMATCH' ? 'SCHEMA_MISMATCH' : 'WRITE_FAILED'; }`,
  `function engineErrCode_(e) { return e && ['SCHEMA_MISMATCH', 'PERIODE_AKTIF_TIDAK_VALID', 'SUMBER_TIDAK_TERSEDIA'].indexOf(e.code) !== -1 ? e.code : 'WRITE_FAILED'; } // [P1-IMP C] kode kewajiban dipertahankan`, 'engineErrCode_', log);
L.rep(te, `  if (typeof oblLoadContext_ !== 'function') throw new Error('ObligationEngine tidak tersedia untuk menghitung status alokasi');`,
  `  if (typeof oblLoadContext_ !== 'function') throw new Error('ObligationEngine tidak tersedia untuk menghitung status alokasi');
  if (typeof kgThrowIfBad_ === 'function') kgThrowIfBad_(); // [P1-IMP C] status SEBAGIAN/OVERPAYMENT tidak ditebak dari daftar kewajiban kosong`, 'engineAllocStatusFor_ kg', log);
L.save(te);
fs.writeFileSync(OUT + '_kewajiban_guard_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_kewajiban_guard_server OK: ' + log.length + ' perubahan');
