// Langkah build P1-RAB (server). Dijalankan SETELAH apply_p1_server.js. Paket terpisah dari revisi kebijakan periode.
// Mengubah FinanceEngine.gs (generate): menyuntikkan _rab_match.js (sumber tunggal yang sama dengan klien) setelah
// fccBudgetVsActual_, dan opFinancialControl ikut membaca 30_ALOKASI_PENGELUARAN (opsional; sheet belum ada = kosong).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const fe = L.load(OUT + 'FinanceEngine.gs');
{
  const rab = fs.readFileSync(OUT + '_rab_match.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
  if (fe.t.indexOf('function rabMatchAll_(') !== -1) throw new Error('rabMatchAll_ sudah ada');
  const r = L.fnRange(fe, 'fccBudgetVsActual_');
  fe.t = fe.t.slice(0, r.end) + '\n' + rab + fe.t.slice(r.end);
  log.push('inject _rab_match.js setelah fccBudgetVsActual_');
}
L.rep(fe, "      alokasi: mk('06_ALOKASI'), komponen: mk('02_KOMPONEN'), kategoriPengeluaran: mk('21_KATEGORI_PENGELUARAN') };",
  "      alokasi: mk('06_ALOKASI'), komponen: mk('02_KOMPONEN'), kategoriPengeluaran: mk('21_KATEGORI_PENGELUARAN'),\n" +
  "      alokasiPengeluaran: mk('30_ALOKASI_PENGELUARAN') }; // [P1-RAB] pemetaan eksplisit (sheet belum ada -> [])", 'opFinancialControl D', log);
L.save(fe);
fs.writeFileSync(OUT + '_p1_rab_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_p1_rab_server: ' + log.length + ' perubahan');
