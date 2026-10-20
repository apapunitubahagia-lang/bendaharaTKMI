/* Suite D-1 KLASIFIKASI DUPLIKAT BEKU (P1_24; sandbox Node, TIDAK menyentuh Google Sheets).
 * opKewajibanBekuAudit (baca-saja) kini membedakan DUPLIKAT_PASTI dari PERLU_KEPUTUSAN_MANUAL dan memetakan hubungan alokasi
 * per baris. Data historis disimulasikan dengan menyuntik baris langsung ke sheet (API menolak duplikat sejak P1_23).
 * Tidak ada tindakan otomatis: setiap uji memastikan seluruh sheet identik sebelum/sesudah audit. Jalur koreksi D-1 tetap DITAHAN.
 * Fixture: SPP MI 200.000; s1 September 2026 lunas lewat imp_alk_1 (tanpa tagihanId = cocok lewat kunci); s2 belum bayar.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026';
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opObligationSnapshot(P, {}); return s; }
const H = s => s.sheets['04_KEWAJIBAN'][0];
const kanon = (s, sid) => s.sheets['04_KEWAJIBAN'].find(r => r[1] === sid && r[2] === 'kmp_spp' && r[3] === P && String(r[0]).indexOf('kw_') === 0);
/* salin baris beku kanonis dengan id lain (nilai identik) + override opsional */
const dupe = (s, sid, id, o) => { const h = H(s), r = kanon(s, sid).slice(); r[0] = id; r[h.indexOf('tagihanId')] = id; Object.keys(o || {}).forEach(k => { r[h.indexOf(k)] = o[k]; }); s.sheets['04_KEWAJIBAN'].push(r); return r; };
const alok = (s, id, sid, nominal, tagihanId) => s.sheets['06_ALOKASI'].push(s.sheets['06_ALOKASI'][0].map(h => ({ id, transaksiId: 'imp_trx_1', siswaId: sid, komponenId: 'kmp_spp', periode: P, nominal, caraBayar: 'cicilan', tagihanId: tagihanId || '', createdAt: '2026-09-05T01:00:00.000Z' })[h] || ''));
const run = s => { const before = J(s.sheets); const a = s.sb.opKewajibanBekuAudit(); return { a, ro: J(s.sheets) === before, dup: (a.data.pengecualian || []).filter(x => x.jenis === 'DUPLIKAT_BEKU') }; };
const forKey = (dup, sid) => dup.find(d => d.kunci === sid + '|kmp_spp|' + P);

{ const s = fresh(); const kid = kanon(s, 's2')[0]; dupe(s, 's2', 'tagihan_lama_s2');
  const { a, ro, dup } = run(s), d = forKey(dup, 's2');
  rec('KK-01', 'duplikat nilai identik, belum dibayar -> DUPLIKAT_PASTI; baris terpilih = id kanonis; tidak ada tindakan otomatis; baca-saja',
    ro && d && d.klasifikasi === 'DUPLIKAT_PASTI' && d.barisTerpilih === kid && d.idKanonisAda && d.tindakanOtomatis === 'TIDAK_ADA' && a.data.ringkasan.duplikatPasti === 1 && a.data.ringkasan.duplikatPerluKeputusan === 0,
    J({ klasifikasi: d && d.klasifikasi, terpilih: d && d.barisTerpilih, ringkasan: a.data.ringkasan })); }
{ const s = fresh(); dupe(s, 's1', 'tagihan_lama_s1');
  const { ro, dup } = run(s), d = forKey(dup, 's1');
  rec('KK-02', 'duplikat identik, sudah dibayar lewat kunci saja (alokasi tanpa tagihanId) -> DUPLIKAT_PASTI; alokasi dicatat sebagai alokasiLewatKunciSaja; selisih terbayar 0',
    ro && d && d.klasifikasi === 'DUPLIKAT_PASTI' && J(d.alokasiLewatKunciSaja) === J(['imp_alk_1']) && d.selisihTerbayarTerhadapTerpilih === 0 && d.baris.every(b => !b.alokasiTagihanId.length), J(d)); }
{ const s = fresh(); dupe(s, 's1', 'tagihan_lama_s1', { bruto: 175000, netto: 175000 });
  const { ro, dup } = run(s), d = forKey(dup, 's1');
  rec('KK-03', 'nilai beku berbeda (175.000 vs 200.000) -> PERLU_KEPUTUSAN_MANUAL [NILAI_BERBEDA]; baris & alokasi tidak diubah',
    ro && d && d.klasifikasi === 'PERLU_KEPUTUSAN_MANUAL' && J(d.alasanKlasifikasi) === J(['NILAI_BERBEDA']), J({ alasan: d && d.alasanKlasifikasi, baris: d && d.baris.map(b => [b.id.slice(0, 14), b.netto]) })); }
{ const s = fresh(); dupe(s, 's2', 'tagihan_lama_s2'); alok(s, 'alk_ke_lama', 's2', 200000, 'tagihan_lama_s2');
  const { ro, dup } = run(s), d = forKey(dup, 's2');
  rec('KK-04', 'alokasi menunjuk (tagihanId) baris yang TIDAK dipilih perhitungan -> PERLU_KEPUTUSAN_MANUAL [ALOKASI_KE_BARIS_TIDAK_TERPILIH]',
    ro && d && d.klasifikasi === 'PERLU_KEPUTUSAN_MANUAL' && J(d.alasanKlasifikasi) === J(['ALOKASI_KE_BARIS_TIDAK_TERPILIH']) && J(d.baris.find(b => b.id === 'tagihan_lama_s2').alokasiTagihanId) === J(['alk_ke_lama']), J(d && d.baris)); }
{ const s = fresh(); const kid = kanon(s, 's2')[0]; dupe(s, 's2', 'tagihan_lama_s2'); alok(s, 'alk_a', 's2', 200000, kid); alok(s, 'alk_b', 's2', 200000, 'tagihan_lama_s2');
  const { ro, dup } = run(s), d = forKey(dup, 's2');
  rec('KK-05', 'pembayaran tersebar ke dua baris beku (terbayar 400.000 > netto 200.000) -> PERLU_KEPUTUSAN_MANUAL dengan 3 alasan; selisih +200.000 dilaporkan',
    ro && d && d.klasifikasi === 'PERLU_KEPUTUSAN_MANUAL' && ['ALOKASI_KE_BARIS_TIDAK_TERPILIH', 'ALOKASI_KE_BEBERAPA_BARIS', 'TERBAYAR_MELEBIHI_NETTO_TERPILIH'].every(x => d.alasanKlasifikasi.indexOf(x) !== -1) && d.selisihTerbayarTerhadapTerpilih === 200000,
    J({ alasan: d && d.alasanKlasifikasi, selisih: d && d.selisihTerbayarTerhadapTerpilih })); }
{ // dua baris historis non-kanonis (tanpa kw_): pilihan deterministik = id terkecil, apa pun urutan sheet; sama dengan baris yang dipakai server
  const res = ['urut_a', 'urut_b'].map(mode => {
    const s = fresh(); const h = H(s); const k = kanon(s, 's2'); s.sheets['04_KEWAJIBAN'].splice(s.sheets['04_KEWAJIBAN'].indexOf(k), 1);
    const ids = mode === 'urut_a' ? ['tagihan_b', 'tagihan_a'] : ['tagihan_a', 'tagihan_b'];
    ids.forEach(id => { const r = k.slice(); r[0] = id; r[h.indexOf('tagihanId')] = id; s.sheets['04_KEWAJIBAN'].push(r); });
    const d = forKey(run(s).dup, 's2'), ob = s.sb.opObligations({ siswaId: 's2', periode: P }).data.rows.find(o => o.komponenId === 'kmp_spp');
    return { terpilih: d && d.barisTerpilih, server: ob && ob.tagihanId, idKanonisAda: d && d.idKanonisAda };
  });
  rec('KK-06', 'dua baris historis non-kanonis: barisTerpilih deterministik (id terkecil) apa pun urutan sheet, dan sama dengan baris yang dipakai perhitungan server; idKanonisAda=false',
    res.every(r => r.terpilih === 'tagihan_a' && r.server === 'tagihan_a' && r.idKanonisAda === false), J(res)); }
{ const s = fresh(); const { a, dup } = run(s);
  rec('KK-07', 'data bersih: tidak ada DUPLIKAT_BEKU, ringkasan 0/0, KONSISTEN', dup.length === 0 && a.data.ringkasan.duplikatPasti === 0 && a.data.ringkasan.duplikatPerluKeputusan === 0 && a.data.konsistensiData === 'KONSISTEN', J(a.data.ringkasan)); }
{ const s = fresh(); dupe(s, 's2', 'tagihan_lama_s2'); s.state.email = 'auditor@x.id'; const { a, ro } = run(s);
  rec('KK-08', 'AUDITOR menjalankan audit + klasifikasi (baca-saja)', a.ok && ro && a.data.ringkasan.duplikatPasti === 1, a.code); }
{ const s = fresh(); dupe(s, 's2', 'tagihan_lama_s2'); const { a } = run(s);
  rec('KK-09', 'DUPLIKAT_PASTI tetap membuat konsistensiData = TIDAK_KONSISTEN (koreksi tetap butuh tinjauan; tidak ada penggabungan otomatis)', a.data.konsistensiData === 'TIDAK_KONSISTEN' && /tidak ada tindakan otomatis/.test(a.data.catatan), a.data.konsistensiData); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
