/* Suite KONKURENSI IMPOR (sandbox Node, TIDAK menyentuh Google Sheets). Prioritas A lanjutan P1_17.
 * Kunci skrip disimulasikan EKSKLUSIF per eksekusi (holder = id eksekusi); eksekusi lain yang meminta kunci saat dipegang
 * -> waitLock melempar (LOCK_TIMEOUT), seperti LockService nyata setelah batas tunggu. Variabel global per eksekusi
 * (kedalaman kunci) dipisah dengan menyimpan/memulihkan nilainya saat "berpindah eksekusi" (Apps Script: global per eksekusi).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const SUMBER = { nama: 'uji.csv', jenis: 'csv' };
function fresh() {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opImportSetup('BUAT_SHEET_IMPOR');
  const L = { holder: null, cur: 'A', log: [] };
  s.sb.LockService = { getScriptLock: () => ({
    waitLock() { if (L.holder && L.holder !== L.cur) { L.log.push(L.cur + ':TIMEOUT'); throw new Error('simulasi: kunci dipegang eksekusi ' + L.holder); } L.holder = L.cur; L.log.push(L.cur + ':acq'); },
    releaseLock() { if (L.holder === L.cur) { L.holder = null; L.log.push(L.cur + ':rel'); } } }) };
  s.L = L;
  /* menjalankan fn sebagai eksekusi lain (global per eksekusi dipisah) */
  /* GLOBALS_PER_EKSEKUSI: Apps Script memberi tiap eksekusi global sendiri; di sandbox global dipindah-simpan saat berganti eksekusi */
  const G_ = ['LOCK_DEPTH_', 'ENGINE_ACTOR_', 'ENGINE_API_', 'OBL_CTX_'];
  s.asExec = (id, fn) => { const pc = L.cur, saved = {}; G_.forEach(k => { saved[k] = s.sb[k]; }); L.cur = id; if (saved.LOCK_DEPTH_ !== undefined) s.sb.LOCK_DEPTH_ = 0; s.sb.ENGINE_ACTOR_ = null; s.sb.ENGINE_API_ = null; s.sb.OBL_CTX_ = null;
    try { return fn(); } finally { L.cur = pc; G_.forEach(k => { s.sb[k] = saved[k]; }); } };
  return s;
}
const trx = (t, n, p) => ({ tanggal: t, nominal: String(n), penerima: p, unit: 'MI', akun: 'Kasir', metode: 'Tunai', kategori: 'ATK' });
const commit = (srv, modul, baris, planHash, extra) => srv.sb.opImportCommit(Object.assign({ modul, baris, sumber: SUMBER, planHash, konfirmasi: 'IMPOR_DATA', mulai: 0 }, extra || {}));
const countN = (srv, n) => rows(srv, '05_TRANSAKSI').filter(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === n).length;

(async () => {
  // 1-4: dua pengguna, pratinjau transaksi yang sama, A menyimpan, B commit pratinjau lama
  { const srv = fresh(); const X = trx('2026-09-15', 88800, 'Toko Sama');
    const fA = [X, trx('2026-09-16', 1001, 'Lain A')], fB = [X, trx('2026-09-17', 1002, 'Lain B')]; // berkas berbeda -> kunci berbeda
    const pA = srv.sb.opImportPlan({ modul: 'pengeluaran', baris: fA, sumber: SUMBER }), pB = srv.asExec('B', () => srv.sb.opImportPlan({ modul: 'pengeluaran', baris: fB, sumber: SUMBER }));
    const cA = commit(srv, 'pengeluaran', fA, pA.data.planHash);
    const cB = srv.asExec('B', () => commit(srv, 'pengeluaran', fB, pB.data.planHash, { pratinjau: Object.fromEntries(pB.data.rows.map(r => [r.kunci, r.sidik])) }));
    rec('CC-01', 'dua pengguna, berkas berbeda, transaksi sama: A simpan, B commit pratinjau lama -> CONFLICT beralasan, 0 ganda',
      cA.ok && cB.code === 'CONFLICT' && countN(srv, 88800) === 1 && /DUPLIKAT_DATA_SERVER/.test(J(cB)), 'B: ' + cB.code + ' - ' + cB.message + ' ' + J(cB.perubahan || null)); }
  { const srv = fresh(); const f = [trx('2026-09-15', 77700, 'Toko Satu'), trx('2026-09-16', 1001, 'Lain')];
    const pA = srv.sb.opImportPlan({ modul: 'pengeluaran', baris: f, sumber: SUMBER }), pB = srv.asExec('B', () => srv.sb.opImportPlan({ modul: 'pengeluaran', baris: f, sumber: SUMBER }));
    const cA = commit(srv, 'pengeluaran', f, pA.data.planHash), cB = srv.asExec('B', () => commit(srv, 'pengeluaran', f, pB.data.planHash));
    rec('CC-02', 'dua pengguna, berkas IDENTIK: B -> TIDAK_BERUBAH (kunci baris sama, idempoten), 0 ganda', cA.ok && cB.ok && cB.data.hasil.every(h => h.status === 'TIDAK_BERUBAH') && countN(srv, 77700) === 1, J(cB.data && cB.data.hasil.map(h => h.status))); }
  // balapan sesungguhnya: B commit DI ANTARA pemeriksaan pratinjau A dan tulisan A
  { const srv = fresh(); const X = trx('2026-09-15', 66600, 'Toko Balap');
    const fA = [X, trx('2026-09-16', 2001, 'A1')], fB = [X, trx('2026-09-17', 2002, 'B1')];
    const pA = srv.sb.opImportPlan({ modul: 'pengeluaran', baris: fA, sumber: SUMBER }), pB = srv.asExec('B', () => srv.sb.opImportPlan({ modul: 'pengeluaran', baris: fB, sumber: SUMBER }));
    const orig = srv.sb.opCreateExpense; let cB = null, fired = false;
    srv.sb.opCreateExpense = function (pl) { if (!fired) { fired = true; cB = srv.asExec('B', () => commit(srv, 'pengeluaran', fB, pB.data.planHash)); } return orig.apply(this, arguments); };
    const cA = commit(srv, 'pengeluaran', fA, pA.data.planHash); srv.sb.opCreateExpense = orig;
    const cB2 = srv.asExec('B', () => commit(srv, 'pengeluaran', fB, pB.data.planHash));
    rec('CC-03', 'balapan: B commit saat A sudah lolos pemeriksaan & sedang menulis -> B tertahan kunci (LOCK_TIMEOUT), A selesai, B ulang -> CONFLICT; 0 ganda',
      cA.ok && cB && !cB.ok && countN(srv, 66600) === 1 && cB2.code === 'CONFLICT',
      'B saat A menulis: ' + (cB && cB.code) + '; B ulang: ' + cB2.code + '; transaksi 66600 = ' + countN(srv, 66600) + '; kunci ' + J(srv.L.log.slice(0, 12))); }
  // kunci dipegang terus dari pemeriksaan planHash sampai tulisan terakhir potongan (transaksi)
  { const srv = fresh(); const f = Array.from({ length: 5 }, (_, i) => trx('2026-09-1' + i, 3000 + i, 'T' + i));
    const p = srv.sb.opImportPlan({ modul: 'pengeluaran', baris: f, sumber: SUMBER }); srv.L.log = [];
    const origPlan = srv.sb.impPlanCore_, origW = srv.sb.opCreateExpense;
    srv.sb.impPlanCore_ = function () { srv.L.log.push('CEK'); return origPlan.apply(this, arguments); };
    srv.sb.opCreateExpense = function () { srv.L.log.push('TULIS'); return origW.apply(this, arguments); };
    commit(srv, 'pengeluaran', f, p.data.planHash); srv.sb.impPlanCore_ = origPlan; srv.sb.opCreateExpense = origW;
    const s = srv.L.log, i0 = s.indexOf('CEK'), i1 = s.lastIndexOf('TULIS'), gap = s.slice(i0, i1).filter(x => /:rel$/.test(x)).length;
    rec('CC-04', 'kunci tidak dilepas antara pemeriksaan ulang (planHash, duplikat, sisa kewajiban) dan tulisan potongan transaksi', i0 >= 0 && i1 > i0 && gap === 0, 'pelepasan kunci di antara cek & tulis: ' + gap + ' ; urutan ' + J(s.slice(0, 14))); }
  // sisa kewajiban berubah sejak pratinjau (pengguna lain membayar SPP yang sama)
  { const srv = fresh(); const b = [{ tanggal: '2026-10-01', nominal: '200000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP' }];
    const p = srv.sb.opImportPlan({ modul: 'pemasukan', baris: b, sumber: SUMBER });
    srv.asExec('B', () => srv.sb.opCreateIncome({ clientRequestId: 'luar_spp', tanggal: '2026-10-01', unit: 'MI', nominal: 200000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2', sumber: 'Pembayaran Siswa', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 200000 }] }));
    const n0 = rows(srv, '06_ALOKASI').length; const c = commit(srv, 'pemasukan', b, p.data.planHash, { pratinjau: Object.fromEntries(p.data.rows.map(r => [r.kunci, r.sidik])) });
    rec('CC-05', 'sisa kewajiban berubah sejak pratinjau -> CONFLICT (alokasi tidak ditulis dari rencana basi)', c.code === 'CONFLICT' && c.jumlahBerubah === 1 && rows(srv, '06_ALOKASI').length === n0, c.code + ' - ' + c.message); }
  // kirim ulang permintaan yang sama
  { const srv = fresh(); const f = [trx('2026-09-20', 5550, 'Ulang')]; const p = srv.sb.opImportPlan({ modul: 'pengeluaran', baris: f, sumber: SUMBER });
    const a = commit(srv, 'pengeluaran', f, p.data.planHash), b = commit(srv, 'pengeluaran', f, p.data.planHash), c = srv.asExec('B', () => commit(srv, 'pengeluaran', f, p.data.planHash));
    rec('CC-06', 'permintaan dikirim ulang (pengguna sama / lain) -> TIDAK_BERUBAH', a.data.hasil[0].status === 'TERSIMPAN' && b.data.hasil[0].status === 'TIDAK_BERUBAH' && c.data.hasil[0].status === 'TIDAK_BERUBAH' && countN(srv, 5550) === 1, [a, b, c].map(x => x.data.hasil[0].status).join(',')); }
  // RAB: dua pengguna, berkas berbeda, garis RAB sama
  { const srv = fresh(); const L1 = { periode: 'Oktober 2026', unit: 'MI', kategori: 'ATK', program: 'Kertas Sama', nominal: '500000' };
    const fA = [L1, Object.assign({}, L1, { program: 'A lain' })], fB = [L1, Object.assign({}, L1, { program: 'B lain' })];
    const pA = srv.sb.opImportPlan({ modul: 'rab', baris: fA, sumber: SUMBER }), pB = srv.asExec('B', () => srv.sb.opImportPlan({ modul: 'rab', baris: fB, sumber: SUMBER }));
    commit(srv, 'rab', fA, pA.data.planHash); const cB = srv.asExec('B', () => commit(srv, 'rab', fB, pB.data.planHash));
    const n = rows(srv, '08_ANGGARAN').filter(r => r[col(srv, '08_ANGGARAN', 'program')] === 'Kertas Sama').length;
    rec('CC-07', 'RAB: B commit pratinjau lama -> CONFLICT, garis RAB tidak ganda', cB.code === 'CONFLICT' && n === 1, cB.code); }
  // kunci luar tidak memutus perilaku jalur tulis biasa (kedalaman kembali 0, kunci dilepas)
  { const srv = fresh(); const r = srv.sb.opCreateExpense({ clientRequestId: 'biasa_1', tanggal: '2026-09-01', unit: 'MI', nominal: 1234, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Biasa' });
    rec('CC-08', 'jalur tulis biasa: kunci diambil & dilepas tepat sekali, kedalaman kembali 0', r.ok && srv.L.holder === null && (srv.sb.LOCK_DEPTH_ === undefined || srv.sb.LOCK_DEPTH_ === 0), J(srv.L.log.slice(-4))); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
