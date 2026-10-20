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
  { // kolom status
    const srv = fresh(); const r = importAll(srv, [{ nama: 'ZAHRA', unit: 'MI', kelas: '3 Abdul', tahunAjaran: '2026/2027', status: 'Nonaktif' }], { modeSiswa: 'TAMBAH_PERBARUI' });
    const z = S(srv).find(x => x.id === 's2');
    rec('SW-04', 'DEPENDENSI BELUM TERGANTIKAN: Impor V2 siswa tidak memiliki kolom "status" - perubahan status massal (mis. Nonaktif/Lulus) lewat berkas hanya tersedia di wizard lama (commitSiswaRow/updateSiswaRow membaca kolom status)', null,
      J({ statusSetelahImporV2: z.status, hasil: r.plan.data && r.plan.data.rows.map(x => x.kelas + ':' + x.kode.join(',')) })); }
  { // wizard lama: perilaku saat ini (masih aktif)
    const srv = makeServer(); const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
    await until(() => c.a.CentralMasterData.ready, 400); await tick(5);
    const st = c.sb.impLamaNonaktif_('siswa');
    rec('SW-05', 'KEPUTUSAN: wizard lama siswa TETAP AKTIF (impLamaNonaktif_("siswa") = false) karena SW-04; e2e_central2 M0/M1 dan t4b_tests T4B-15 tidak diubah', st === false, 'impLamaNonaktif_(siswa)=' + st); }
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
