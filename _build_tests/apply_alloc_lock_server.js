// Langkah build P1_19 B (server). Dijalankan SETELAH apply_kewajiban_guard_server.js. Paket terpisah agar mudah di-revert.
// Pemeriksaan sisa kewajiban (AllocationGuard) diulang DI DALAM kunci engine, di titik penulisan:
//   - createTransactionWithAllocations_: setelah re-check idempotensi/akun/siswa, sebelum transaksi ditulis;
//   - createAllocation_: setelah cek Σ alokasi <= nominal transaksi, sebelum alokasi ditulis.
// updateTransaction_: siswaId transaksi beralokasi aktif tidak dapat diganti (setara aturan jenis & validateAllocationsForIncome_).
// Kebijakan keuangan, formula kewajiban, dan KPI tidak berubah.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, `      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');
`, `      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');
      if (allocations.length && typeof engineAllocObligationCheck_ === 'function') { var obErr = engineAllocObligationCheck_(allocations); if (obErr) return obErr; } // [P1_19 B] sisa kewajiban di bawah kunci
`, 'createTransactionWithAllocations_ cek kewajiban dalam kunci', log);
L.rep(te, `        return errResult_('ALLOCATION_EXCEEDS_TRANSACTION', 'total allocation (' + newSum + ') akan melebihi nominal transaksi (' + trx.nominal + ')', 'nominal');
      }
`, `        return errResult_('ALLOCATION_EXCEEDS_TRANSACTION', 'total allocation (' + newSum + ') akan melebihi nominal transaksi (' + trx.nominal + ')', 'nominal');
      }
      if (typeof engineAllocObligationCheck_ === 'function') { var obErrA = engineAllocObligationCheck_([payload]); if (obErrA) return obErrA; } // [P1_19 B] sisa kewajiban di bawah kunci
`, 'createAllocation_ cek kewajiban dalam kunci', log);
L.rep(te, `        else if (k === 'siswaId') { if (next.siswaId && !siswaExists_(next.siswaId)) { e1 = 'siswaId tidak ditemukan di ' + SHT_SISWA + ': ' + next.siswaId; code = 'INVALID_STUDENT'; } }`,
  `        else if (k === 'siswaId') { if (allocSum > 0) { e1 = 'siswaId tidak dapat diubah: transaksi memiliki alokasi aktif (arsipkan alokasi lebih dulu)'; code = 'ALLOCATION_LOCKED'; } else if (next.siswaId && !siswaExists_(next.siswaId)) { e1 = 'siswaId tidak ditemukan di ' + SHT_SISWA + ': ' + next.siswaId; code = 'INVALID_STUDENT'; } } // [P1_19 B]`,
  'updateTransaction_ siswaId terkunci bila beralokasi', log);
L.save(te);
fs.writeFileSync(OUT + '_alloc_lock_server_patch_log.txt', log.join('\n') + '\n');
console.log('apply_alloc_lock_server OK: ' + log.length + ' perubahan');
