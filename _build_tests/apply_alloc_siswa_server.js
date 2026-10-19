// Langkah build P1_20 C (server). Dijalankan SETELAH apply_akun_strict_server.js. Paket terpisah agar mudah di-revert.
// createAllocation_ (opCreateAllocation): di dalam kunci, sebelum alokasi ditulis:
//   - transaksi induk wajib PENERIMAAN (alokasi kewajiban tidak boleh menempel pada pengeluaran);
//   - bila transaksi induk memiliki siswaId, alokasi wajib untuk siswa yang SAMA (setara validateAllocationsForIncome_
//     pada jalur pembayaran beralokasi). Penerimaan tanpa siswaId tidak diubah perilakunya (keputusan kebijakan terbuka).
// Formula kewajiban, KPI, dan status historis tidak berubah; alokasi lama tidak disentuh.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, `      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');
`, `      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');
      if (!trx || trx.jenis !== 'PENERIMAAN') return errResult_('INVALID_ALLOCATION', 'Alokasi kewajiban hanya untuk transaksi PENERIMAAN (transaksi ' + payload.transaksiId + ' berjenis ' + (trx && trx.jenis) + ')', 'transaksiId'); // [P1_20 C]
      if (trx.siswaId && String(payload.siswaId) !== String(trx.siswaId)) return errResult_('INVALID_ALLOCATION', 'allocation.siswaId (' + payload.siswaId + ') berbeda dengan transaksi.siswaId (' + trx.siswaId + '): penerimaan siswa lain tidak dapat melunasi kewajiban siswa ini', 'siswaId'); // [P1_20 C]
`, 'createAllocation_ jenis & siswa transaksi induk', log);
L.save(te);
fs.writeFileSync(OUT + '_alloc_siswa_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_alloc_siswa_server OK: ' + log.length + ' perubahan');
