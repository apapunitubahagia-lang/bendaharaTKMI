/* Suite INTEGRITAS TRANSAKSI JALUR BIASA (P1_19 B; sandbox Node, TIDAK menyentuh Google Sheets).
 * Kunci skrip disimulasikan EKSKLUSIF per eksekusi (lihat concurrency_tests.js). Kewajiban uji: SPP Juli 2026 siswa s2 (ZAHRA)
 * dengan tarif diubah menjadi Rp1.000.000 (sisa awal Rp1.000.000).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
function fresh() {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  s.sheets['03_TARIF'][1][5] = 1000000; // SPP MI = 1.000.000 (hanya data sandbox)
  const L = { holder: null, cur: 'A', log: [] };
  s.sb.LockService = { getScriptLock: () => ({
    waitLock() { if (L.holder && L.holder !== L.cur) { L.log.push(L.cur + ':TIMEOUT'); throw new Error('simulasi: kunci dipegang ' + L.holder); } L.holder = L.cur; L.log.push(L.cur + ':acq'); },
    releaseLock() { if (L.holder === L.cur) { L.holder = null; L.log.push(L.cur + ':rel'); } } }) };
  s.L = L;
  /* GLOBALS_PER_EKSEKUSI: Apps Script memberi tiap eksekusi global sendiri; di sandbox global dipindah-simpan saat berganti eksekusi */
  const G_ = ['LOCK_DEPTH_', 'ENGINE_ACTOR_', 'ENGINE_API_', 'OBL_CTX_'];
  s.asExec = (id, fn) => { const pc = L.cur, saved = {}; G_.forEach(k => { saved[k] = s.sb[k]; }); L.cur = id; if (saved.LOCK_DEPTH_ !== undefined) s.sb.LOCK_DEPTH_ = 0; s.sb.ENGINE_ACTOR_ = null; s.sb.ENGINE_API_ = null; s.sb.OBL_CTX_ = null;
    try { return fn(); } finally { L.cur = pc; G_.forEach(k => { s.sb[k] = saved[k]; }); } };
  return s;
}
const alokJuli = srv => rows(srv, '06_ALOKASI').filter(a => a[col(srv, '06_ALOKASI', 'siswaId')] === 's2' && a[col(srv, '06_ALOKASI', 'periode')] === 'Juli 2026' && !a[col(srv, '06_ALOKASI', 'archivedAt')]).reduce((t, a) => t + Number(a[col(srv, '06_ALOKASI', 'nominal')]), 0);
const nTrx = srv => rows(srv, '05_TRANSAKSI').length;
const pay = (crid, nom, extra) => Object.assign({ clientRequestId: crid, tanggal: '2026-09-10', unit: 'MI', nominal: nom, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2', sumber: 'Pembayaran Siswa',
  allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: nom }] }, extra || {});
/* jalankan fnB (eksekusi lain) tepat ketika eksekusi A sudah lolos pemeriksaan awal tetapi belum menulis */
function interleave(srv, engineName, fnB) {
  const orig = srv.sb[engineName]; let out = null, fired = false;
  srv.sb[engineName] = function () { if (!fired) { fired = true; out = srv.asExec('B', fnB); } return orig.apply(this, arguments); };
  return { get b() { return out; }, restore() { srv.sb[engineName] = orig; } };
}

(async () => {
  { const srv = fresh(); const n0 = nTrx(srv);
    const h = interleave(srv, 'createIncome_', () => srv.sb.opCreateIncome(pay('B1', 800000)));
    const a = srv.sb.opCreateIncome(pay('A1', 800000)); h.restore();
    rec('TI-01', 'dua pembayaran Rp800.000 bersamaan untuk sisa Rp1.000.000 -> satu ditolak, total alokasi <= sisa', alokJuli(srv) <= 1000000 && [a.ok, h.b.ok].filter(Boolean).length === 1 && nTrx(srv) === n0 + 1,
      'A ' + (a.code) + ', B ' + (h.b && h.b.code) + ', alokasi Juli ' + alokJuli(srv) + ', transaksi baru ' + (nTrx(srv) - n0)); }
  { const srv = fresh();
    const h = interleave(srv, 'createIncome_', () => srv.sb.opCreateIncome(pay('B2', 500000)));
    const a = srv.sb.opCreateIncome(pay('A2', 500000)); h.restore();
    rec('TI-02', 'dua pembayaran yang totalnya tepat = sisa -> keduanya tersimpan, sisa 0', a.ok && h.b.ok && alokJuli(srv) === 1000000, 'A ' + a.code + ', B ' + h.b.code + ', alokasi ' + alokJuli(srv)); }
  { const srv = fresh(); // pratinjau/rencana klien dibuat saat sisa 1.000.000; pembayaran lain disimpan dulu
    const b = srv.asExec('B', () => srv.sb.opCreateIncome(pay('B3', 800000))); const a = srv.sb.opCreateIncome(pay('A3', 800000));
    rec('TI-03', 'pratinjau dibuat sebelum transaksi lain disimpan -> server menolak rencana basi', b.ok && !a.ok && a.code === 'ALLOCATION_EXCEEDS_OBLIGATION' && alokJuli(srv) === 800000, 'A ' + a.code + ' - ' + String(a.message).slice(0, 90)); }
  { const srv = fresh(); const n0 = nTrx(srv);
    const a1 = srv.sb.opCreateIncome(pay('R4', 800000)); // respons hilang -> kirim ulang
    const b = srv.asExec('B', () => srv.sb.opCreateIncome(pay('B4', 200000)));
    const a2 = srv.sb.opCreateIncome(pay('R4', 800000));
    rec('TI-04', 'retry setelah respons hilang (sisa sudah habis) -> replay idempoten, bukan transaksi/alokasi ganda dan bukan penolakan palsu', a1.ok && b.ok && a2.ok && /idempotent replay/.test(a2.message) && nTrx(srv) === n0 + 2 && alokJuli(srv) === 1000000, a2.message.slice(0, 70) + ', alokasi ' + alokJuli(srv)); }
  { const srv = fresh(); const n0 = nTrx(srv), a0 = rows(srv, '06_ALOKASI').length;
    srv.state.failSetValuesOn = '06_ALOKASI'; const f = srv.sb.opCreateIncome(pay('F5', 300000));
    const n1 = nTrx(srv), a1 = rows(srv, '06_ALOKASI').length, idem = rows(srv, '24_IDEMPOTENCY_LOG').some(r => r[0] === 'F5');
    const ok = srv.sb.opCreateIncome(pay('F5', 300000));
    rec('TI-05', 'kegagalan tulis di tengah (alokasi) -> transaksi di-rollback, tidak ada catatan idempotensi; ulang tersimpan sekali', !f.ok && n1 === n0 && a1 === a0 && !idem && ok.ok && nTrx(srv) === n0 + 1 && alokJuli(srv) === 300000, f.code + ' -> ' + ok.code); }
  { const srv = fresh();
    const t1 = srv.sb.opCreateIncome({ clientRequestId: 'T6a', tanggal: '2026-09-10', unit: 'MI', nominal: 800000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2' }).data.id;
    const t2 = srv.sb.opCreateIncome({ clientRequestId: 'T6b', tanggal: '2026-09-10', unit: 'MI', nominal: 800000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2' }).data.id;
    const al = (t, c) => ({ clientRequestId: c, transaksiId: t, siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 800000 });
    const h = interleave(srv, 'createAllocation_', () => srv.sb.opCreateAllocation(al(t2, 'AL6b')));
    const a = srv.sb.opCreateAllocation(al(t1, 'AL6a')); h.restore();
    rec('TI-06', 'perubahan alokasi bersamaan (dua alokasi Rp800.000 ke sisa Rp1.000.000) -> satu ditolak', [a.ok, h.b.ok].filter(Boolean).length === 1 && alokJuli(srv) === 800000, 'A ' + a.code + ', B ' + h.b.code + ', alokasi ' + alokJuli(srv)); }
  { const srv = fresh(); srv.sb.opImportSetup('BUAT_SHEET_IMPOR');
    const b = [{ tanggal: '2026-09-10', nominal: '800000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP', periodeKomponen: 'Juli 2026' }];
    const p = srv.sb.opImportPlan({ modul: 'pemasukan', baris: b, sumber: { nama: 'x', jenis: 'csv' } });
    const h = interleave(srv, 'createIncome_', () => srv.sb.opCreateIncome(pay('F7', 800000)));
    const c = srv.sb.opImportCommit({ modul: 'pemasukan', baris: b, sumber: { nama: 'x', jenis: 'csv' }, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' }); h.restore();
    const f2 = srv.asExec('B', () => srv.sb.opCreateIncome(pay('F7', 800000)));
    rec('TI-07', 'impor bersamaan dengan form biasa -> form tertahan (LOCK_TIMEOUT), lalu ditolak (sisa habis); total alokasi <= sisa', c.ok && h.b && h.b.code === 'LOCK_TIMEOUT' && !f2.ok && alokJuli(srv) === 800000,
      'impor ' + c.code + '/' + (c.data && c.data.hasil[0].status) + ', form saat impor ' + (h.b && h.b.code) + ', form ulang ' + f2.code + ', alokasi ' + alokJuli(srv)); }
  { const srv = fresh(); const t = srv.sb.opCreateIncome(pay('K8', 600000)).data.id;
    const u1 = srv.sb.opUpdateTransaction({ id: t, nominal: 500000 }), u2 = srv.sb.opUpdateTransaction({ id: t, siswaId: 's1' }), u3 = srv.sb.opUpdateTransaction({ id: t, jenis: 'PENGELUARAN' });
    const u4 = srv.sb.opUpdateTransaction({ id: t, nominal: 700000, clientRequestId: 'K8u' }), u5 = srv.sb.opUpdateTransaction({ id: t, nominal: 700000, clientRequestId: 'K8u' });
    const tr = rows(srv, '05_TRANSAKSI').find(r => r[0] === t);
    rec('TI-08', 'koreksi transaksi beralokasi: nominal < alokasi / ganti siswa / ganti jenis ditolak; naikkan nominal tersimpan & status dihitung ulang; retry idempoten', !u1.ok && !u2.ok && !u3.ok && u4.ok && u5.ok && tr[col(srv, '05_TRANSAKSI', 'nominal')] === 700000 && tr[col(srv, '05_TRANSAKSI', 'status')] === 'SEBAGIAN_TERALOKASI',
      [u1.code, u2.code, u3.code, u4.code, u5.message.slice(0, 40), tr[col(srv, '05_TRANSAKSI', 'status')]].join(' | ')); }
  { const srv = fresh(); const t = srv.sb.opCreateIncome({ clientRequestId: 'P9a', tanggal: '2026-09-10', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2' }).data.id;
    srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] = '2026-10-01';
    const a = srv.sb.opCreateIncome(pay('P9', 100000)), b = srv.sb.opCreateAllocation({ clientRequestId: 'P9b', transaksiId: t, siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 100000 });
    rec('TI-09', 'periode aktif tidak valid -> pembayaran beralokasi & alokasi baru ditolak PERIODE_AKTIF_TIDAK_VALID', a.code === 'PERIODE_AKTIF_TIDAK_VALID' && b.code === 'PERIODE_AKTIF_TIDAK_VALID' && alokJuli(srv) === 0, a.code + ' / ' + b.code); }
  { const s1 = fresh(); delete s1.sheets['03_TARIF']; const a = s1.sb.opCreateIncome(pay('S10', 100000));
    const s2 = fresh(); s2.sheets['06_ALOKASI'][0][4] = 'periodeX'; const b = s2.sb.opCreateIncome(pay('S10', 100000));
    rec('TI-10', 'sumber kewajiban tidak tersedia / tidak lengkap -> alokasi ditolak dengan kode eksplisit', a.code === 'SUMBER_TIDAK_TERSEDIA' && !b.ok && b.code === 'SCHEMA_MISMATCH' && alokJuli(s1) === 0, a.code + ' / ' + b.code); }
  { const srv = fresh(); srv.sb.opClosePeriod('September 2026');
    const a = srv.sb.opCreateIncome(pay('AU11', 100000)); const ak = rows(srv, '13_AUDIT_LOG').map(r => r[2]);
    rec('TI-11', 'audit trail & kebijakan periode dipertahankan (periode ditutup = penanda, bukan penolakan; CREATE_TRANSACTION + CREATE_ALLOCATION + PERIODE_DITANDAI)', a.ok && ak.includes('CREATE_TRANSACTION') && ak.includes('CREATE_ALLOCATION') && ak.includes('PERIODE_DITANDAI'), J(ak.filter(x => /CREATE|PERIODE/.test(x)))); }
  { const srv = fresh(); const a = srv.sb.opCreateIncome(pay('LK12', 100000)), L = srv.L.log.join(',');
    rec('TI-12', 'jejak kunci jalur biasa: satu acq/rel, pemeriksaan kewajiban di dalam kunci yang sama dengan tulisan', a.ok && L === 'A:acq,A:rel' && srv.sb.LOCK_DEPTH_ === 0, L); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
