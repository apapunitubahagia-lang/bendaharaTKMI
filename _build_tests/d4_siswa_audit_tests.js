/* Suite D-4 SISWA: AUDIT KESETARAAN WIZARD LAMA SISWA vs IMPOR V2 (P1_22; sandbox Node, TIDAK menyentuh Google Sheets).
 * Penonaktifan wizard lama siswa disetujui BERSYARAT: hanya bila Impor V2 menggantikan seluruh fungsi. Suite ini mengukur
 * kesetaraan; wizard lama TIDAK dinonaktifkan bila ada fungsi yang hanya tersedia di jalur lama.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const SUMBER = { nama: 'siswa.csv', jenis: 'csv' };
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opImportSetup('BUAT_SHEET_IMPOR'); return s; }
function importAll(srv, baris, extra) {
  extra = extra || {}; const p = srv.sb.opImportPlan(Object.assign({ modul: 'siswa', baris, sumber: SUMBER }, extra)); if (!p.ok) return { plan: p, hasil: [], calls: 0 };
  let mulai = 0, calls = 0; const hasil = [];
  while (mulai !== null && calls < 50) { const c = srv.sb.opImportCommit(Object.assign({ modul: 'siswa', baris, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA', mulai }, extra)); calls++; if (!c.ok) return { plan: p, hasil, calls, err: c }; hasil.push.apply(hasil, c.data.hasil); mulai = c.data.berikut; }
  return { plan: p, hasil, calls };
}
const S = srv => { const H = srv.sheets['01_SISWA'][0]; return srv.sheets['01_SISWA'].slice(1).map(r => Object.fromEntries(H.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))); };

(async () => {
  { // setara M0/M1 (e2e_central2): 60 siswa, alamat
    const srv = fresh(); const n0 = S(srv).length;
    const b = Array.from({ length: 60 }, (_, i) => ({ nama: 'SISWA IMPOR ' + i, nis: 'N' + i, nisn: '99' + i, kelas: '2', unit: 'MI', tahunAjaran: '2026/2027', namaWali: 'W' + i, kontakWali: '08' + i, alamat: 'Jl ' + i }));
    const r = importAll(srv, b), added = S(srv).length - n0;
    rec('SW-01', 'kesetaraan M0/M1: Impor V2 siswa menambah 60 siswa (nama, NIS, NISN, kelas, unit, TA, wali, kontak, alamat) dalam <= 2 panggilan commit', added === 60 && r.calls <= 2 && S(srv).some(s => s.alamat === 'Jl 7' && s.namaWali === 'W7'), J({ added, calls: r.calls })); }
  { // setara T4B-15: tanggalMasuk & jenisKelamin
    const srv = fresh(); importAll(srv, [{ nama: 'Siswa F7', unit: 'MI', kelas: '1', tahunAjaran: '2026/2027', tanggalMasuk: '2026-09-05', jenisKelamin: 'P' }]);
    const s = S(srv).find(x => x.nama === 'Siswa F7');
    rec('SW-02', 'kesetaraan T4B-15: Impor V2 menyimpan tanggalMasuk & jenisKelamin (plus validasi tanggal server)', s && s.tanggalMasuk === '2026-09-05' && s.jenisKelamin === 'P', J(s)); }
  { // mode perbarui setara updateSiswaRow (hanya field terisi)
    const srv = fresh(); const r = importAll(srv, [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', kontakWali: '0899' }], { modeSiswa: 'TAMBAH_PERBARUI' });
    const z = S(srv).find(x => x.id === 's2');
    rec('SW-03', 'kesetaraan updateSiswaRow: mode "Tambah + Perbarui" memperbarui hanya field terisi, id siswa tetap, field kosong tidak menimpa', z.kontakWali === '0899' && z.namaWali === 'Wali B' && S(srv).length === 2, J({ kontak: z.kontakWali, wali: z.namaWali, status: r.hasil.map(h => h.status) })); }
  { // [P1_23 D-4] kolom status di Impor V2 (sebelumnya SW-04 INFO: belum ada)
    const srv = fresh(); const o0 = srv.sb.opObligations({}).data.rows.filter(o => o.siswaId === 's2').length;
    const p1 = srv.sb.opImportPlan({ modul: 'siswa', baris: [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', status: 'nonaktif' }], sumber: SUMBER, modeSiswa: 'TAMBAH_PERBARUI' });
    const r = importAll(srv, [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', status: 'nonaktif' }], { modeSiswa: 'TAMBAH_PERBARUI', keputusan: { 0: { terimaPerubahanKewajiban: true } } });
    const z = S(srv).find(x => x.id === 's2'), o1 = srv.sb.opObligations({}).data.rows.filter(o => o.siswaId === 's2').length;
    rec('SW-04', 'status di Impor V2: "nonaktif" dinormalkan ke enum master "Nonaktif" (normalisasi tercatat); perubahan status = UBAH_KEWAJIBAN (butuh persetujuan); setelah disetujui status tersimpan dan kewajiban s2 keluar dari daftar kewajiban aktif',
      p1.data.rows[0].kelas === 'PERLU_KEPUTUSAN' && p1.data.rows[0].kode.includes('UBAH_KEWAJIBAN') && p1.data.rows[0].normalisasi.some(n => n.field === 'status' && n.ke === 'Nonaktif') && z.status === 'Nonaktif' && o0 > 0 && o1 === 0,
      J({ rencana: p1.data.rows[0].kelas, status: z.status, kewajibanS2: [o0, o1], hasil: r.hasil.map(h => h.status) })); }
  { const srv = fresh(); const before = J(S(srv));
    const p = srv.sb.opImportPlan({ modul: 'siswa', baris: [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', status: 'Lulus' }, { nama: 'Baru Pindahan', unit: 'MI', kelas: '1-A', tahunAjaran: '2026/2027', status: 'Pindah' }], sumber: SUMBER, modeSiswa: 'TAMBAH_PERBARUI' });
    rec('SW-07', 'status di luar enum (Lulus, Pindah) -> TOLAK STATUS_TIDAK_VALID dengan alasan, tidak dipetakan diam-diam; master tidak berubah', p.data.rows.every(x => x.kelas === 'TOLAK' && x.kode.includes('STATUS_TIDAK_VALID')) && J(S(srv)) === before, J(p.data.rows.map(x => x.kelas + ':' + x.kode.join(',')))); }
  { const srv = fresh(); importAll(srv, [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', kontakWali: '0811' }], { modeSiswa: 'TAMBAH_PERBARUI' });
    importAll(srv, [{ nama: 'Siswa Nonaktif Baru', unit: 'MI', kelas: '1-A', tahunAjaran: '2026/2027', status: 'Nonaktif' }]);
    const z = S(srv).find(x => x.id === 's2'), b = S(srv).find(x => x.nama === 'Siswa Nonaktif Baru');
    rec('SW-08', 'kolom status kosong: status siswa lama TIDAK berubah (tetap Aktif) dan field lain tetap diperbarui; siswa baru dengan status Nonaktif tersimpan Nonaktif', z.status === 'Aktif' && z.kontakWali === '0811' && b && b.status === 'Nonaktif', J({ z: [z.status, z.kontakWali], baru: b && b.status })); }
  { const srv = fresh(); srv.sheets['03_TARIF'].push(['trf_k1', 'kmp_spp', 'MI', '1', '', 350000]); srv.sb.opObligationSnapshot('September 2026', { siswaIds: ['s2'] });
    const r = importAll(srv, [{ nama: 'ZAHRA', unit: 'MI', kelas: '1-A', tahunAjaran: '2026/2027' }], { modeSiswa: 'TAMBAH_PERBARUI', keputusan: { 0: { siswaId: 's2', terimaPerubahanKewajiban: true } } });
    const ob = per => srv.sb.opObligations({ siswaId: 's2', periode: per }).data.rows.find(o => o.komponenId === 'kmp_spp');
    rec('SW-09', 'dampak perubahan kelas terhadap kewajiban (disetujui eksplisit): kewajiban beku September tetap 200.000; kewajiban belum beku (Agustus) mengikuti tarif kelas 1 = 350.000', ob('September 2026').netto === 200000 && ob('Agustus 2026').netto === 350000,
      J({ sep: ob('September 2026').netto, ags: ob('Agustus 2026').netto, hasil: r.hasil.map(h => h.status) })); }
  { // wizard lama: perilaku saat ini (masih aktif)
    const srv = makeServer(); const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
    await until(() => c.a.CentralMasterData.ready, 400); await tick(5);
    const st = c.sb.impLamaNonaktif_('siswa');
    rec('SW-05', 'wizard lama siswa masih aktif sampai penonaktifan (commit terpisah)', st === false, 'impLamaNonaktif_(siswa)=' + st); }
  { // perbedaan lain (bukan penghalang): TA default diam-diam di jalur lama
    const srv = fresh(); const r = importAll(srv, [{ nama: 'Tanpa TA', unit: 'MI', kelas: '1-A' }]);
    rec('SW-06', 'perbedaan perilaku (bukan penghalang): wizard lama mengisi tahun ajaran aktif diam-diam; Impor V2 meminta keputusan eksplisit (PERLU_KEPUTUSAN TAHUN_AJARAN_KOSONG); namaAyah/namaIbu dipetakan manual ke namaWali di Impor V2', null,
      J(r.plan.data.rows.map(x => x.kelas + ':' + x.kode.join(',')))); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
