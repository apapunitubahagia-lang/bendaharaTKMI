/* Suite VALIDASI SISWA ALOKASI (P1_20 C; sandbox Node, TIDAK menyentuh Google Sheets).
 * Alokasi penerimaan siswa A tidak boleh melunasi kewajiban siswa B; alokasi hanya untuk transaksi PENERIMAAN;
 * dicek di server (panggilan langsung op* maupun fungsi engine), idempoten, arsip alokasi beraudit.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sheets['03_TARIF'][1][5] = 1000000; return s; }
const nAlk = srv => rows(srv, '06_ALOKASI').length;
const aktif = (srv, sid) => rows(srv, '06_ALOKASI').filter(a => a[col(srv, '06_ALOKASI', 'siswaId')] === sid && a[col(srv, '06_ALOKASI', 'periode')] === 'Juli 2026' && !a[col(srv, '06_ALOKASI', 'archivedAt')]).reduce((t, a) => t + Number(a[col(srv, '06_ALOKASI', 'nominal')]), 0);
const inc = (srv, crid, sid, nom) => srv.sb.opCreateIncome(Object.assign({ clientRequestId: crid, tanggal: '2026-09-10', unit: 'MI', nominal: nom || 300000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa' }, sid ? { siswaId: sid } : {}));
const al = (crid, t, sid, nom, per) => ({ clientRequestId: crid, transaksiId: t, siswaId: sid, komponenId: 'kmp_spp', periode: per || 'Juli 2026', nominal: nom || 100000 });

(async () => {
  { const srv = fresh(); const tA = inc(srv, 'A1', 's1').data.id; const n0 = nAlk(srv);
    const r = srv.sb.opCreateAllocation(al('A1x', tA, 's2'));
    rec('AS-01', 'panggilan langsung opCreateAllocation: transaksi siswa A (s1) -> kewajiban siswa B (s2) ditolak, tidak ada baris alokasi', !r.ok && r.code === 'INVALID_ALLOCATION' && nAlk(srv) === n0 && aktif(srv, 's2') === 0, r.code + ' ' + (r.message || '').slice(0, 90)); }
  { const srv = fresh(); const tA = inc(srv, 'A2', 's1').data.id; const n0 = nAlk(srv);
    let r; srv.sb.ENGINE_ACTOR_ = { email: 'bendahara@x.id', role: 'BENDAHARA' }; try { r = srv.sb.createAllocation_(al('A2x', tA, 's2')); } finally { srv.sb.ENGINE_ACTOR_ = null; }
    rec('AS-02', 'fungsi engine createAllocation_ dipanggil langsung (melewati op*): lintas siswa tetap ditolak', !r.ok && r.code === 'INVALID_ALLOCATION' && nAlk(srv) === n0, r.code); }
  { const srv = fresh(); const n0 = nAlk(srv);
    const r = srv.sb.opCreateIncome(Object.assign({ clientRequestId: 'A3', tanggal: '2026-09-10', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's1' }, { allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 100000 }] }));
    const b = srv.sb.opCreateTxBatch([{ kind: 'income', payload: { clientRequestId: 'A3b', tanggal: '2026-09-10', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's1', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 100000 }] } }]);
    const br = b.data && b.data.results && b.data.results[0];
    rec('AS-03', 'pembayaran siswa A beralokasi ke siswa B (opCreateIncome & opCreateTxBatch) ditolak', r.code === 'INVALID_ALLOCATION' && br && !br.ok && br.code === 'INVALID_ALLOCATION' && nAlk(srv) === n0, r.code + ' / ' + (br && br.code)); }
  { const srv = fresh(); const n0 = nAlk(srv); const r = srv.sb.opCreateAllocation(al('A4', 'imp_trx_2', 's2', 10000));
    rec('AS-04', 'alokasi kewajiban ke transaksi PENGELUARAN ditolak', !r.ok && r.code === 'INVALID_ALLOCATION' && nAlk(srv) === n0, r.code + ' ' + (r.message || '').slice(0, 80)); }
  { const srv = fresh(); const tB = inc(srv, 'A5', 's2').data.id; const n0 = nAlk(srv);
    const a = srv.sb.opCreateAllocation(al('A5x', tB, 's2')), b = srv.sb.opCreateAllocation(al('A5x', tB, 's2'));
    rec('AS-05', 'siswa sama -> alokasi tersimpan; retry clientRequestId sama (respons hilang) -> replay, tidak ganda', a.ok && b.ok && nAlk(srv) === n0 + 1 && aktif(srv, 's2') === 100000 && /idempotent/.test(b.message), [a.code, b.message.slice(0, 40)].join(' | ')); }
  { const srv = fresh(); const tB = inc(srv, 'A6', 's2', 1500000).data.id; const n0 = nAlk(srv);
    const a = srv.sb.opCreateAllocation(al('A6a', tB, 's2', 1100000)), b = srv.sb.opCreateAllocation(al('A6b', tB, 's2', 100000, 'Periode Fiktif')), c = srv.sb.opCreateAllocation(al('A6c', tB, 's2', 2000000));
    rec('AS-06', 'regresi: melebihi sisa kewajiban / periode tanpa kewajiban / melebihi nominal transaksi -> ditolak', !a.ok && !b.ok && !c.ok && nAlk(srv) === n0, [a.code, b.code, c.code].join(',')); }
  { const srv = fresh(); const t0 = inc(srv, 'A7', null).data.id; const r = srv.sb.opCreateAllocation(al('A7x', t0, 's2')), r2 = srv.sb.opCreateAllocation(al('A7y', t0, 's1'));
    rec('AS-07', 'AUDIT (kebijakan, tidak diubah): penerimaan TANPA siswaId boleh dialokasikan ke siswa mana pun (setara validateAllocationsForIncome_); dapat bercampur beberapa siswa', null, J({ keS2: r.code || 'OK', keS1: r2.code || 'OK' })); }
  { const srv = fresh(); const tB = inc(srv, 'A8', 's2').data.id; const a = srv.sb.opCreateAllocation(al('A8x', tB, 's2')).data.id;
    const x1 = srv.sb.opArchiveAllocation(a, 'salah komponen'), x2 = srv.sb.opArchiveAllocation(a, 'ulang'), x3 = srv.sb.opArchiveAllocation(a, '');
    const au = rows(srv, '13_AUDIT_LOG').filter(r => /ARCHIVE/.test(r[2]) && String(r[6]) === a);
    const row = rows(srv, '06_ALOKASI').find(r => r[0] === a);
    rec('AS-08', 'koreksi alokasi = arsip (tanpa hapus) + jejak audit; arsip ulang tidak menulis ganda; sisa kewajiban pulih', x1.ok && x2.ok && row && row[col(srv, '06_ALOKASI', 'archivedAt')] && au.length === 1 && aktif(srv, 's2') === 0,
      J({ x1: x1.code || 'OK', x2: x2.message, x3: x3.code || 'OK', audit: au.map(r => r[2]), alasan: row && row[col(srv, '06_ALOKASI', 'archiveReason')] })); }
  { const srv = fresh(); const tA = inc(srv, 'A9', 's1').data.id; srv.state.email = 'auditor@x.id'; const n0 = nAlk(srv);
    const r = srv.sb.opCreateAllocation(al('A9x', tA, 's1')), y = srv.sb.opArchiveAllocation('imp_alk_1', 'x');
    rec('AS-09', 'AUDITOR: buat & arsip alokasi ditolak ROLE_NOT_ALLOWED', r.code === 'ROLE_NOT_ALLOWED' && y.code === 'ROLE_NOT_ALLOWED' && nAlk(srv) === n0, r.code + ' / ' + y.code); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
