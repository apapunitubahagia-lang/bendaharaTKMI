/* Suite D-1 IDENTITAS KEWAJIBAN BEKU (P1_22; sandbox Node, TIDAK menyentuh Google Sheets).
 * Audit identitas server vs klien + opKewajibanBekuAudit (baca-saja, daftar pengecualian). Jalur koreksi D-1 DITAHAN.
 * Fixture: SPP MI 200.000; s1 September 2026 lunas (imp_alk_1); s2 belum bayar.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const P = 'September 2026';
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const kw = srv => srv.sheets['04_KEWAJIBAN'].slice(1), kc = (srv, h) => srv.sheets['04_KEWAJIBAN'][0].indexOf(h);
const bekuKunci = (srv, sid, per) => kw(srv).filter(r => r[1] === sid && r[2] === 'kmp_spp' && r[3] === per && r[kc(srv, 'tagihanId')] !== '' && !r[kc(srv, 'archivedAt')]);
const audit = srv => srv.sb.opKewajibanBekuAudit();
const jenis = (a, j) => (a.data.pengecualian || []).filter(x => x.jenis === j);
/* [P1_23] API kini menolak baris beku non-kanonis/duplikat; data historis disimulasikan dengan menyuntik baris langsung ke sheet */
const inject = (srv, id, o) => { const h = srv.sheets['04_KEWAJIBAN'][0], v = Object.assign({ id, siswaId: 's1', komponenId: 'kmp_spp', periode: P, bruto: 200000, potongan: '[]', netto: 200000, tagihanId: id, computedAt: '2026-10-01T00:00:00.000Z' }, o || {}); srv.sheets['04_KEWAJIBAN'].push(h.map(k => v[k] === undefined ? '' : v[k])); };
const row = (id, o) => ({ op: 'upsert', id, row: Object.assign({ siswaId: 's1', komponenId: 'kmp_spp', periode: P, bruto: 200000, potongan: '[]', netto: 200000, tagihanId: id, computedAt: '2026-10-01T00:00:00.000Z' }, o || {}) });
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };

(async () => {
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); const before = J(s.sheets); const a = audit(s);
    rec('ID-01', 'data bersih (snapshot server saja): KONSISTEN; id kanonis kw_<hash>; beku berpembayaran = 1 (s1 September); audit baca-saja (seluruh sheet identik)',
      a.ok && a.data.konsistensiData === 'KONSISTEN' && a.data.ringkasan.barisBeku === 2 && a.data.ringkasan.bekuBerpembayaran === 1 && !a.data.jumlahPerJenis.ID_TIDAK_KANONIS && J(s.sheets) === before, J(a.data.ringkasan)); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); inject(s, 'tagihan_klien_1', { netto: 175000, bruto: 175000 });
    const a = audit(s), d = jenis(a, 'DUPLIKAT_BEKU')[0];
    rec('ID-02', 'baris beku kedua (id klien) untuk kunci yang sama -> DUPLIKAT_BEKU (netto berbeda, terbayar 200.000) + ID_TIDAK_KANONIS; TIDAK_KONSISTEN; tidak ada yang dihapus',
      d && d.ids.length === 2 && d.nettoBerbeda && d.terbayar === 200000 && jenis(a, 'ID_TIDAK_KANONIS').length === 1 && a.data.konsistensiData === 'TIDAK_KONSISTEN' && bekuKunci(s, 's1', P).length === 2, J(d)); }
  { // jalur klien menghasilkan duplikat: cache klien basi + snapshot server
    const s = fresh(); const c = await boot(s); s.sb.opObligationSnapshot(P, {}); // klien belum memuat ulang 04
    const n = c.sb.freezeObligationsFor_({ periods: [P] }); await sync(c);
    const dup = bekuKunci(s, 's2', P), a = audit(s);
    rec('ID-03', '[P1_23] klien dengan data 04 basi membekukan lagi kewajiban yang sudah dibekukan server -> kini memakai id kanonis yang SAMA, tidak ada baris kedua (lihat d1_kanon_tests)', null,
      J({ dibekukanKlien: n, barisBekuS2Sep: dup.map(r => r[0].slice(0, 14)), duplikat: (a.data.jumlahPerJenis || {}).DUPLIKAT_BEKU || 0 })); }
  { const s = fresh(); s.sheets['02_KOMPONEN'].push(['kmp_spp_b', 'SPP', 'TK', 'Bulanan', '', '']); const a = audit(s);
    rec('ID-04', 'dua komponen aktif bernama sama -> KOMPONEN_NAMA_GANDA (risiko: klien mencocokkan kewajiban beku lewat nama komponen)', jenis(a, 'KOMPONEN_NAMA_GANDA').length === 1 && J(jenis(a, 'KOMPONEN_NAMA_GANDA')[0].komponenIds.sort()) === J(['kmp_spp', 'kmp_spp_b']), J(jenis(a, 'KOMPONEN_NAMA_GANDA'))); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); const id = bekuKunci(s, 's1', P)[0][0];
    const ix = s.sheets['04_KEWAJIBAN'][0].indexOf('archivedAt'); s.sheets['04_KEWAJIBAN'].find(r => r[0] === id)[ix] = '2026-10-02T00:00:00.000Z'; const a = audit(s), ob = s.sb.opObligations({ siswaId: 's1', periode: P }).data.rows.find(o => o.komponenId === 'kmp_spp');
    rec('ID-05', 'baris beku berpembayaran diarsip -> ARSIP_BERPEMBAYARAN (kewajiban kembali dihitung dari tarif saat ini); baris arsip tetap ada', jenis(a, 'ARSIP_BERPEMBAYARAN').length === 1 && jenis(a, 'ARSIP_BERPEMBAYARAN')[0].terbayar === 200000 && kw(s).some(r => r[0] === id),
      J({ temuan: jenis(a, 'ARSIP_BERPEMBAYARAN'), tagihanIdTerbaca: ob.tagihanId })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); s.sheets['06_ALOKASI'].push(['alk_x', 'imp_trx_1', 's2', 'kmp_spp', 'Agustus 2026', 1, 'cicilan', 'tagihan_hilang', '2026-09-05T01:00:00.000Z']);
    inject(s, 'tagihan_klien_2'); const a = audit(s);
    rec('ID-06', 'hubungan alokasi: alokasi ber-tagihanId tanpa baris 04 -> ALOKASI_TAGIHAN_TIDAK_DIKENAL; alokasi s1 September cocok >1 baris beku -> ALOKASI_MULTI_BEKU', jenis(a, 'ALOKASI_TAGIHAN_TIDAK_DIKENAL').length === 1 && jenis(a, 'ALOKASI_MULTI_BEKU').some(x => x.alokasiId === 'imp_alk_1'),
      J({ tidakDikenal: jenis(a, 'ALOKASI_TAGIHAN_TIDAK_DIKENAL').length, multi: jenis(a, 'ALOKASI_MULTI_BEKU').map(x => x.alokasiId) })); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); inject(s, 'tagihan_klien_1', { netto: 175000, bruto: 175000 });
    const ob = s.sb.opObligations({ siswaId: 's1', periode: P }).data.rows.filter(o => o.komponenId === 'kmp_spp');
    rec('ID-07', '[P1_23] dengan duplikat beku historis, kewajibanForSiswa memilih secara DETERMINISTIK (id kanonis kw_ lebih dulu), bukan urutan sheet; duplikat tetap dilaporkan audit', null, J(ob.map(o => ({ tagihanId: o.tagihanId, netto: o.netto, status: o.status })))); }
  { const s = fresh(); s.sb.opObligationSnapshot(P, {}); const h0 = J([s.sheets['05_TRANSAKSI'], s.sheets['06_ALOKASI']]);
    s.sb.opMasterBatch('tarif', [{ id: 'trf_1', nominal: 260000 }]); const a = audit(s); const ob = s.sb.opObligations({ siswaId: 's1', periode: P }).data.rows.find(o => o.komponenId === 'kmp_spp');
    rec('ID-08', 'regresi: tarif naik setelah snapshot -> kewajiban beku berpembayaran tetap 200.000 LUNAS, alokasi & transaksi tidak berubah, audit tetap KONSISTEN', ob.netto === 200000 && ob.status === 'LUNAS' && a.data.konsistensiData === 'KONSISTEN' && J([s.sheets['05_TRANSAKSI'], s.sheets['06_ALOKASI']]) === h0, J({ netto: ob.netto, status: ob.status })); }
  { const s = fresh(); s.state.email = 'auditor@x.id'; const a = audit(s); rec('ID-09', 'AUDITOR dapat menjalankan audit baca-saja', a.ok, a.code); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
