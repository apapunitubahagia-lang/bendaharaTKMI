// Langkah build P1_20 D (server). Dijalankan SETELAH apply_alloc_siswa_server.js. Paket terpisah agar mudah di-revert.
// Kategori pengeluaran divalidasi SERVER terhadap master aktif 21_KATEGORI_PENGELUARAN (subkategori opsional terhadap
// 22_SUBKATEGORI milik kategori tsb): wajib eksplisit, tanpa fallback, nama disimpan kanonik, master tidak tersedia = gagal tertutup.
//   - createTransactionWithAllocations_ (opCreateExpense, opCreateTxBatch, impor V2 lewat opCreateExpense);
//   - updateTransaction_ hanya bila kategori/subkategori diubah atau jenis diganti menjadi PENGELUARAN.
// Kategori historis tidak diubah otomatis (koreksi field lain tetap boleh); audit baca-saja: opKategoriPengeluaranAudit.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, `function validateTransactionPayload_(payload) {
`, `/* [P1_20 D] Kategori pengeluaran wajib eksplisit & valid terhadap master AKTIF (status kosong/'Aktif'). Cocok nama atau id
   tanpa beda huruf/spasi; trx.kategori/subkategori diganti nama kanonik master. ctx (opsional) = master yang sudah dimuat. */
var SHT_KATEGORI_PENGELUARAN_ = '21_KATEGORI_PENGELUARAN', SHT_SUBKATEGORI_ = '22_SUBKATEGORI';
function katNorm_(v) { return String(v === null || v === undefined ? '' : v).replace(/\\s+/g, ' ').trim().toLowerCase(); }
function katAktif_(m, r) { if (m.idx.status === undefined) return true; var s = String(r[m.idx.status] === null || r[m.idx.status] === undefined ? '' : r[m.idx.status]).trim(); return s === '' || s === 'Aktif'; }
function katCtx_() {
  var k = null, s = null;
  try { k = sgModel_(SHT_KATEGORI_PENGELUARAN_, ['id', 'kategori']); } catch (e) { k = null; }
  try { s = sgModel_(SHT_SUBKATEGORI_, ['id', 'kategoriId', 'nama']); } catch (e) { s = null; }
  return { kat: k, sub: s };
}
function expenseKategoriCheck_(trx, ctx) {
  var kat = katNorm_(trx.kategori);
  if (!kat) return errResult_('VALIDATION_ERROR', 'kategori pengeluaran wajib dipilih eksplisit (tidak ada kategori bawaan)', 'kategori');
  ctx = ctx || katCtx_();
  var m = ctx.kat, aktif = m ? m.values.filter(function (r) { return katAktif_(m, r); }) : [];
  if (!aktif.length) return errResult_('KATEGORI_MASTER_TIDAK_TERSEDIA', 'Master kategori pengeluaran (' + SHT_KATEGORI_PENGELUARAN_ + ') tidak tersedia atau tidak memiliki kategori aktif - transaksi pengeluaran tidak disimpan', 'kategori');
  var hit = aktif.filter(function (r) { return katNorm_(r[m.idx.kategori]) === kat || katNorm_(r[m.idx.id]) === kat; });
  if (hit.length !== 1) return errResult_('INVALID_CATEGORY', hit.length ? 'kategori "' + trx.kategori + '" ambigu di master kategori pengeluaran' : 'kategori "' + trx.kategori + '" tidak ada di master kategori pengeluaran aktif', 'kategori');
  var katId = String(hit[0][m.idx.id]).trim();
  trx.kategori = String(hit[0][m.idx.kategori]).trim();
  var sub = katNorm_(trx.subkategori);
  if (!sub) { trx.subkategori = ''; return null; }
  var s = ctx.sub;
  if (!s) return errResult_('KATEGORI_MASTER_TIDAK_TERSEDIA', 'Master subkategori (' + SHT_SUBKATEGORI_ + ') tidak tersedia - subkategori tidak dapat divalidasi', 'subkategori');
  var sh = s.values.filter(function (r) { return String(r[s.idx.kategoriId]).trim() === katId && katAktif_(s, r) && (katNorm_(r[s.idx.nama]) === sub || katNorm_(r[s.idx.id]) === sub); });
  if (sh.length !== 1) return errResult_('INVALID_SUBCATEGORY', 'subkategori "' + trx.subkategori + '" bukan subkategori aktif milik kategori ' + trx.kategori, 'subkategori');
  trx.subkategori = String(sh[0][s.idx.nama]).trim();
  return null;
}

function validateTransactionPayload_(payload) {
`, 'expenseKategoriCheck_', log);
L.rep(te, `    // --- 1. validasi awal (SEBELUM lock) ---
    var vErr = validateTransactionPayload_(payload);
    if (vErr) return vErr;
`, `    // --- 1. validasi awal (SEBELUM lock) ---
    var vErr = validateTransactionPayload_(payload);
    if (vErr) return vErr;
    if (payload.jenis === 'PENGELUARAN') { payload = Object.assign({}, payload); var kErr = expenseKategoriCheck_(payload); if (kErr) return kErr; } // [P1_20 D]
`, 'createTransactionWithAllocations_ kategori', log);
L.rep(te, `        if (k === 'jenis') { e1 = validateJenis_(next.jenis); if (!e1 && allocSum > 0) e1 = 'jenis tidak dapat diubah: transaksi memiliki alokasi aktif'; }`,
  `        if (k === 'jenis') { e1 = validateJenis_(next.jenis); if (!e1 && allocSum > 0) e1 = 'jenis tidak dapat diubah: transaksi memiliki alokasi aktif'; if (!e1 && next.jenis === 'PENGELUARAN') { var kJ = expenseKategoriCheck_(next); if (kJ) { e1 = kJ.message; code = kJ.code; } } } // [P1_20 D]
        else if ((k === 'kategori' || k === 'subkategori') && next.jenis === 'PENGELUARAN') { var kK = expenseKategoriCheck_(next); if (kK) { e1 = kK.message; code = kK.code; } } // [P1_20 D]`,
  'updateTransaction_ kategori', log);
L.save(te);
fs.writeFileSync(OUT + '_kategori_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_kategori_server OK: ' + log.length + ' perubahan');
