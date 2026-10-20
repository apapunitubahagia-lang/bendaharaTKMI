/* Suite D-1 IDENTITAS KANONIS KEWAJIBAN BEKU (P1_23; sandbox Node, TIDAK menyentuh Google Sheets).
 * Kunci kanonis siswaId|komponenId|periode -> id 'kw_' + hash (klien kwIdKanon_ == server oblHash_); pencocokan lewat komponenId;
 * RecordGuard: id kanonis wajib, satu baris beku aktif per kunci, nilai baris beku terkunci, arsip baris beku yang dibayar ditolak.
 * Jalur koreksi beralasan BELUM diaktifkan. Fixture: SPP MI 200.000; s1 September 2026 lunas; s2 belum bayar.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const P = 'September 2026';
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const KH = s => s.sheets['04_KEWAJIBAN'][0];
const beku = (s, sid, kid, per) => s.sheets['04_KEWAJIBAN'].slice(1).filter(r => r[1] === sid && r[2] === (kid || 'kmp_spp') && r[3] === (per || P) && r[KH(s).indexOf('tagihanId')] !== '' && !r[KH(s).indexOf('archivedAt')]);
const kan = (s, sid, kid, per) => 'kw_' + s.sb.oblHash_([sid, kid || 'kmp_spp', per || P].join('|'));
const ob = (s, sid, kid, per) => { const r = s.sb.opObligations({ siswaId: sid, periode: per || P }); return r.ok ? r.data.rows.find(o => o.komponenId === (kid || 'kmp_spp')) : r; };
const batch = (s, ops) => { const r = s.sb.opRecordBatch('kewajiban', ops); return r.ok ? r.data.results.map(x => x.code) : [r.code]; };
const inject = (s, id, o, at) => { const h = KH(s), v = Object.assign({ id, siswaId: 's1', komponenId: 'kmp_spp', periode: P, bruto: 200000, potongan: '[]', netto: 200000, tagihanId: id, computedAt: '2026-10-01T00:00:00.000Z' }, o || {}); const row = h.map(k => v[k] === undefined ? '' : v[k]); if (at) s.sheets['04_KEWAJIBAN'].splice(at, 0, row); else s.sheets['04_KEWAJIBAN'].push(row); };
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };

(async () => {
  { const s = fresh(), c = makeClient(s, { noBridge: true }); let bad = 0;
    for (let i = 0; i < 3000; i++) { const k = ['s' + i + 'é'.repeat(i % 5), 'kmp_' + (i * 7919 % 97), ['Juli 2026', 'SekaliBayar', 'Tahun Ajaran 2026/2027'][i % 3]]; if (c.sb.kwIdKanon_(k[0], k[1], k[2]) !== 'kw_' + s.sb.oblHash_(k.join('|'))) bad++; }
    rec('KN-01', 'id kanonis klien (kwIdKanon_) identik dengan server (kw_ + oblHash_) untuk 3.000 kunci (termasuk karakter non-ASCII)', bad === 0, 'selisih ' + bad); }
  { const s = fresh(); const c = await boot(s); const n = c.sb.freezeObligationsFor_({ periods: [P] }); await sync(c);
    const r1 = beku(s, 's1'), r2 = beku(s, 's2');
    rec('KN-02', 'pembekuan klien kini memakai id kanonis + komponenId (bukan uid acak); server menerima', n === 2 && r1.length === 1 && r1[0][0] === kan(s, 's1') && r2[0][0] === kan(s, 's2') && r1[0][KH(s).indexOf('tagihanId')] === r1[0][0], J({ n, ids: [r1[0] && r1[0][0], r2[0] && r2[0][0]] })); }
  { const s = fresh(); const c = await boot(s); s.sb.opObligationSnapshot(P, {}); // cache klien basi
    c.sb.freezeObligationsFor_({ periods: [P] }); await sync(c);
    const blocked = Object.values(c.sb.ccPend_('tagihan')).filter(p => p.blocked).length;
    rec('KN-03', 'snapshot basi: server sudah membekukan, klien (cache lama) membekukan lagi -> id kanonis SAMA, nilai sama -> UNCHANGED; tetap 1 baris beku per kunci, tidak ada antrean gagal', beku(s, 's1').length === 1 && beku(s, 's2').length === 1 && blocked === 0, J({ s1: beku(s, 's1').length, s2: beku(s, 's2').length, blocked })); }
  { const s = fresh(); const c = await boot(s); s.sb.opObligationSnapshot(P, {}); s.sb.opMasterBatch('tarif', [{ id: 'trf_1', nominal: 260000 }]); await tick(1);
    // klien basi (tarif lama di cache 04 kosong & tarif server berubah setelah klien memuat master) mencoba membekukan dengan nilai berbeda
    const res = batch(s, [{ op: 'upsert', id: kan(s, 's2'), row: { siswaId: 's2', komponenId: 'kmp_spp', periode: P, bruto: 260000, potongan: '[]', netto: 260000, tagihanId: kan(s, 's2') } }]);
    rec('KN-04', 'pembekuan ulang dengan nilai berbeda (tarif berubah) -> KEWAJIBAN_BEKU_TERKUNCI; nilai beku asli (200.000) tidak ditimpa', res[0] === 'KEWAJIBAN_BEKU_TERKUNCI' && Number(beku(s, 's2')[0][KH(s).indexOf('netto')]) === 200000, J(res)); }
  { const s = fresh(); const a = s.sb.opObligationSnapshot(P, {}), b = s.sb.opObligationSnapshot(P, {});
    const row = { siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', bruto: 200000, potongan: '[]', netto: 200000 };
    const k = kan(s, 's2', 'kmp_spp', 'Agustus 2026'), dua = batch(s, [{ op: 'upsert', id: k, row: Object.assign({ tagihanId: k }, row) }, { op: 'upsert', id: k, row: Object.assign({ tagihanId: k }, row) }]);
    rec('KN-05', 'pembekuan berulang & dua permintaan bersamaan (id kanonis sama dalam satu batch / dua snapshot): CREATED lalu UNCHANGED; snapshot kedua 0 dibuat; tepat 1 baris per kunci', b.data.dibuat === 0 && J(dua) === J(['CREATED', 'UNCHANGED']) && beku(s, 's2', 'kmp_spp', 'Agustus 2026').length === 1 && beku(s, 's1').length === 1, J({ snap2: b.data, batch: dua })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {});
    const r = batch(s, [{ op: 'upsert', id: 'tagihan_acak_1', row: { siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', bruto: 1, potongan: '[]', netto: 1, tagihanId: 'tagihan_acak_1' } },
      { op: 'upsert', id: kan(s, 's2', 'kmp_spp', 'Juli 2026'), row: { siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', bruto: 1, potongan: '[]', netto: 1, tagihanId: 'lain' } }]);
    inject(s, 'tagihan_lama_s1', { netto: 175000 }); // historis (sebelum P1_23)
    const k2 = kan(s, 's1', 'kmp_spp', 'Agustus 2026'); inject(s, 'tagihan_lama_s1_ags', { periode: 'Agustus 2026' });
    const d = batch(s, [{ op: 'upsert', id: k2, row: { siswaId: 's1', komponenId: 'kmp_spp', periode: 'Agustus 2026', bruto: 200000, potongan: '[]', netto: 200000, tagihanId: k2 } }]);
    rec('KN-06', 'server: id acak / tagihanId != id -> ID_KEWAJIBAN_TIDAK_KANONIS; baris kanonis untuk kunci yang sudah punya baris beku historis (id acak) -> DUPLIKAT_KEWAJIBAN_BEKU; baris historis tidak diubah/dihapus', J(r) === J(['ID_KEWAJIBAN_TIDAK_KANONIS', 'ID_KEWAJIBAN_TIDAK_KANONIS']) && d[0] === 'DUPLIKAT_KEWAJIBAN_BEKU' && beku(s, 's1', 'kmp_spp', 'Agustus 2026').length === 1,
      J({ r, d })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); inject(s, 'tagihan_lama_a', { netto: 175000, bruto: 175000 }, 1); // duplikat historis DI DEPAN baris kanonis
    const x1 = ob(s, 's1'); const s2 = fresh(); s2.sb.opObligationSnapshot(P, {}); inject(s2, 'tagihan_lama_a', { netto: 175000, bruto: 175000 }); // di belakang
    const x2 = ob(s2, 's1');
    rec('KN-07', 'dua baris beku dengan kunci kanonis sama (historis): pilihan deterministik = baris kanonis kw_ apa pun urutan sheet; audit melaporkan DUPLIKAT_BEKU', x1.tagihanId === kan(s, 's1') && x2.tagihanId === kan(s, 's1') && x1.netto === 200000 && x2.netto === 200000 && (s.sb.opKewajibanBekuAudit().data.jumlahPerJenis.DUPLIKAT_BEKU || 0) === 1,
      J({ depan: [x1.tagihanId, x1.netto], belakang: [x2.tagihanId, x2.netto] })); }
  { const s = fresh(); s.sheets['02_KOMPONEN'].push(['kmp_spp_mi', 'SPP', 'MI', 'Bulanan', '', '']); s.sheets['03_TARIF'].push(['trf_x', 'kmp_spp_mi', 'MI', '', '', 90000]);
    s.sb.opObligationSnapshot(P, { komponenIds: ['kmp_spp'] });
    const a = ob(s, 's2', 'kmp_spp'), b = ob(s, 's2', 'kmp_spp_mi');
    rec('KN-08', 'dua komponen bernama sama ("SPP") dengan id berbeda: pembekuan kmp_spp TIDAK menempel pada kmp_spp_mi (cocok lewat komponenId); kmp_spp_mi tetap dihitung dari tarifnya sendiri', a && a.tagihanId === kan(s, 's2') && b && !b.tagihanId && b.netto === 90000,
      J({ kmp_spp: a && [a.tagihanId, a.netto], kmp_spp_mi: b && [b.tagihanId, b.netto] })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); const k = kan(s, 's1');
    const r = batch(s, [{ op: 'upsert', id: k, row: { netto: 100000 } }, { op: 'upsert', id: k, row: { komponenId: 'kmp_lain' } }, { op: 'upsert', id: k, row: { jatuhTempo: '2026-09-10' } }]);
    const ar = batch(s, [{ op: 'archive', id: k, reason: 'uji' }]), ar2 = batch(s, [{ op: 'archive', id: kan(s, 's2'), reason: 'tagihan salah terbit' }]);
    rec('KN-09', 'kewajiban beku & sudah dibayar (s1): ubah netto / komponen -> KEWAJIBAN_BEKU_TERKUNCI; ubah jatuhTempo boleh; arsip -> KEWAJIBAN_BEKU_TERKUNCI; kewajiban beku BELUM dibayar (s2) tetap dapat diarsip beralasan',
      J(r) === J(['KEWAJIBAN_BEKU_TERKUNCI', 'KEWAJIBAN_BEKU_TERKUNCI', 'UPDATED']) && ar[0] === 'KEWAJIBAN_BEKU_TERKUNCI' && ar2[0] === 'ARCHIVED' && ob(s, 's1').status === 'LUNAS', J({ r, ar, ar2 })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); const k = kan(s, 's2');
    const inc = s.sb.opCreateIncome({ tanggal: '2026-09-10', unit: 'MI', akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa', nominal: 200000, siswaId: 's2', clientRequestId: 'kn10', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: P, nominal: 200000, tagihanId: k }] });
    const a = s.sb.opKewajibanBekuAudit().data, o = ob(s, 's2'), r = batch(s, [{ op: 'upsert', id: k, row: { netto: 150000 } }]);
    rec('KN-10', 'kewajiban beku lalu dibayar dengan alokasi bertagihanId kanonis: relasi alokasi konsisten (audit KONSISTEN, tanpa ALOKASI_TAGIHAN_TIDAK_DIKENAL/MULTI_BEKU), status LUNAS, nilai kini terkunci', inc.ok && a.konsistensiData === 'KONSISTEN' && o.status === 'LUNAS' && r[0] === 'KEWAJIBAN_BEKU_TERKUNCI',
      J({ audit: a.konsistensiData, perJenis: a.jumlahPerJenis, status: o.status, ubah: r[0] })); }
  { const s = fresh(); s.state.failSetValuesOn = '04_KEWAJIBAN'; const a = s.sb.opObligationSnapshot(P, {}); const n1 = s.sheets['04_KEWAJIBAN'].length - 1;
    const b = s.sb.opObligationSnapshot(P, {});
    rec('KN-11', 'retry setelah kegagalan tulis: snapshot pertama gagal tanpa baris parsial; retry membuat tepat 1 baris kanonis per kunci', !a.ok && n1 === 0 && b.ok && b.data.dibuat === 2 && beku(s, 's1').length === 1 && beku(s, 's2').length === 1, J({ a: a.code, n1, b: b.data })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); s.sb.opMasterBatch('tarif', [{ id: 'trf_1', nominal: 250000 }]);
    const o1 = ob(s, 's1'), o2 = ob(s, 's2'), oA = ob(s, 's2', 'kmp_spp', 'Agustus 2026');
    rec('KN-12', 'perubahan tarif setelah pembekuan: kewajiban beku (s1 lunas, s2 belum) tetap 200.000; kewajiban belum beku (s2 Agustus) mengikuti tarif baru 250.000 (perilaku lama, tidak diubah)', o1.netto === 200000 && o1.status === 'LUNAS' && o2.netto === 200000 && oA.netto === 250000, J([o1.netto, o2.netto, oA.netto])); }
  { const s = fresh(); const c = await boot(s); c.sb.freezeObligationsFor_({ periods: [P] }); await sync(c); await c.sb.pdVerifyObl();
    rec('KN-13', 'diferensial klien vs server setelah pembekuan kanonis: verifikasi kewajiban COCOK (0 perbedaan)', /COCOK/.test(c.el('pdOblOut').innerHTML), c.el('pdOblOut').innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 120)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
