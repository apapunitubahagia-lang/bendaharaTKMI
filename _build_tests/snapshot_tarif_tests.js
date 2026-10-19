/* Suite SNAPSHOT KEWAJIBAN & PERUBAHAN TARIF (P1_20 E; sandbox Node, TIDAK menyentuh Google Sheets).
 * KARAKTERISASI perilaku saat ini (INFO) + invarian yang wajib tetap (PASS). TIDAK ada perubahan kebijakan/skema di P1_20.
 * Fixture: SPP MI tarif trf_1 = 200.000; s1 (HANA) punya alokasi imp_alk_1 SPP September 2026 = 200.000 (lunas).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const ob = (srv, sid, per) => { const r = srv.sb.opObligations({ siswaId: sid, periode: per }); const x = r.ok && r.data.rows.find(o => o.komponenId === 'kmp_spp'); return x ? { netto: x.netto, terbayar: x.terbayar, sisa: x.sisa, status: x.status, beku: !!x.tagihanId } : r.code; };
const setTarif = (srv, n) => srv.sb.opMasterBatch('tarif', [{ id: 'trf_1', nominal: n }]);
const hist = srv => J([srv.sheets['05_TRANSAKSI'], srv.sheets['06_ALOKASI']]);
const allObl = srv => { const r = srv.sb.opObligations({}); return r.ok ? r.data.rows.filter(o => o.komponenId === 'kmp_spp') : []; };

(async () => {
  { const srv = fresh(); const h0 = hist(srv); const a = ob(srv, 's1', 'September 2026'); const n0 = allObl(srv);
    const u = setTarif(srv, 250000); const b = ob(srv, 's1', 'September 2026'); const n1 = allObl(srv);
    const u2 = setTarif(srv, 150000); const c = ob(srv, 's1', 'September 2026');
    const berubah = n1.filter(x => { const p = n0.find(y => y.key === x.key); return p && p.netto !== x.netto; }).length;
    const auMaster = srv.sheets['13_AUDIT_LOG'].slice(1).filter(r => /TARIF|MASTER/.test(String(r[2]))).map(r => r[2]);
    rec('ST-01', 'KARAKTERISASI: tarif diubah (opMasterBatch tarif) SETELAH kewajiban dibayar & belum dibekukan -> kewajiban dihitung ulang mundur (lunas menjadi kurang bayar / kelebihan bayar)', null,
      J({ sebelum: a, tarif250rb: b, tarif150rb: c, kewajibanSppBerubahNilai: berubah + '/' + n1.length, tarifDitulis: [u.ok, u2.ok], auditMaster: auMaster.slice(0, 4) }));
    rec('ST-02', 'INVARIAN: perubahan tarif tidak mengubah baris transaksi & alokasi historis', hist(srv) === h0, 'tidak berubah: ' + (hist(srv) === h0)); }
  { const srv = fresh(); const s = srv.sb.opObligationSnapshot('September 2026'); const a = ob(srv, 's1', 'September 2026');
    setTarif(srv, 250000); const b = ob(srv, 's1', 'September 2026');
    rec('ST-03', 'kewajiban yang SUDAH dibekukan (opObligationSnapshot) tidak berubah saat tarif berubah', s.ok && a.beku && b.beku && a.netto === 200000 && b.netto === 200000 && b.status === 'LUNAS', J({ snapshot: s.data, sebelum: a, sesudah: b })); }
  { const srv = fresh(); const t = srv.sb.opCreateIncome({ clientRequestId: 'ST4', tanggal: '2026-09-10', unit: 'MI', nominal: 200000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 200000 }] });
    const a = ob(srv, 's2', 'Juli 2026'); setTarif(srv, 250000); const s = srv.sb.opObligationSnapshot('Juli 2026'); const b = ob(srv, 's2', 'Juli 2026');
    rec('ST-04', 'KARAKTERISASI: snapshot diambil SETELAH transaksi tersimpan & tarif berubah -> snapshot memakai tarif saat snapshot, bukan saat pembayaran', null, J({ bayar: t.code, sebelumSnapshot: a, sesudahSnapshotTarifBaru: b, snapshot: s.data })); }
  { const srv = fresh(); srv.sb.opObligationSnapshot('September 2026'); const id = srv.sheets['04_KEWAJIBAN'].slice(1).find(r => r[1] === 's1' && r[3] === 'September 2026');
    const kwId = id && id[0]; const a = ob(srv, 's1', 'September 2026');
    const w = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: kwId, row: { netto: 100000, bruto: 100000 } }]); const b = ob(srv, 's1', 'September 2026');
    const au = srv.sheets['13_AUDIT_LOG'].slice(1).filter(r => String(r[6]) === kwId || String(r[4]).indexOf(kwId) !== -1).map(r => r[2]);
    rec('ST-05', 'KARAKTERISASI: baris kewajiban BEKU yang sudah beralokasi dapat ditimpa lewat opRecordBatch("kewajiban") (BENDAHARA)', null, J({ hasil: w.code, rinci: w.data && w.data.results && w.data.results[0], sebelum: a, sesudah: b, audit: au })); }
  { const srv = fresh(); srv.state.email = 'auditor@x.id'; const a = setTarif(srv, 999999), b = srv.sb.opObligationSnapshot('September 2026'), c = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: 'kw_x', row: { netto: 1 } }]);
    rec('ST-06', 'AUDITOR tidak dapat mengubah tarif, membekukan, atau menimpa kewajiban', [a.code, b.code, c.code].every(x => x === 'ROLE_NOT_ALLOWED'), [a.code, b.code, c.code].join(',')); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
