// Langkah build P1_21 D-2 (server). Dijalankan SETELAH apply_kategori_server.js. Paket terpisah agar mudah di-revert.
// Kebijakan D-2 (disetujui): satu PENERIMAAN boleh dialokasikan ke beberapa siswa (transaksi tanpa siswaId; tiap alokasi =
// siswa + komponen/kewajiban + periode + nominal). Kontrol yang sudah ada tidak diubah (validateAllocationsForIncome_,
// engineAllocObligationCheck_ di dalam kunci, clientRequestId, siswaId terkunci bila ada alokasi, createAllocation_ P1_20 C).
// Perubahan: alokasi pada transaksi PENGELUARAN kini DITOLAK eksplisit (INVALID_ALLOCATION), bukan dibuang diam-diam
// (createExpense_ & createTransactionWithAllocations_ jenis non-PENERIMAAN). Tidak ada perubahan skema, KPI, atau data historis.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
const tolak = "errResult_('INVALID_ALLOCATION', 'Transaksi PENGELUARAN tidak menerima alokasi kewajiban siswa (alokasi tidak dibuang diam-diam)', 'allocations')";
L.rep(te, "function createExpense_(payload) {\n",
  "function createExpense_(payload) {\n  if (payload && Array.isArray(payload.allocations) && payload.allocations.length) return " + tolak + "; // [P1_21 D-2]\n", 'createExpense_ tolak alokasi', log);
L.rep(te, "    var allocations = (payload.jenis === 'PENERIMAAN') ? (payload.allocations || []) : [];\n",
  "    if (payload.jenis !== 'PENERIMAAN' && Array.isArray(payload.allocations) && payload.allocations.length) return " + tolak + "; // [P1_21 D-2]\n" +
  "    var allocations = (payload.jenis === 'PENERIMAAN') ? (payload.allocations || []) : [];\n", 'createTransactionWithAllocations_ tolak alokasi non-penerimaan', log);
L.save(te);
fs.writeFileSync(OUT + '_d2_alloc_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d2_alloc_server OK: ' + log.length + ' perubahan');
