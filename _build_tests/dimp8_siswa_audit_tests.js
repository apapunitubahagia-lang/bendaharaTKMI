/* Suite D-IMP-8 AUDIT MASTER SISWA TERHADAP STANDAR (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * Standar: jenis kelamin L/P; kelas {TINGKAT}-{ROMBEL}; NISN teks, bila terisi 10 digit numerik; NISN kosong tidak direka.
 * opSiswaMasterAudit tetap baca-saja. Data uji = fixture sandbox (BUKAN salinan data sah; audit data nyata BLOCKED).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function srvWith(extra) {
  const s = makeServer(); const h = s.sheets['01_SISWA'][0];
  extra.forEach(o => s.sheets['01_SISWA'].push(h.map(k => o[k] !== undefined ? o[k] : (k === 'status' ? 'Aktif' : ''))));
  return s;
}
const SISWA = [
  { id: 'a1', nama: 'A1', unit: 'MI', kelas: '1-A', jenisKelamin: 'L', nisn: '0012345678', tanggalMasuk: '2026-07-15' },
  { id: 'a2', nama: 'A2', unit: 'MI', kelas: '2-B', jenisKelamin: 'P', nisn: '0012345678' },               // NISN ganda
  { id: 'a3', nama: 'A3', unit: 'MI', kelas: 'kelas 3', jenisKelamin: 'Laki-laki', nisn: 12345678 },       // kelas tidak sesuai, JK variasi, NISN sel angka 8 digit
  { id: 'a4', nama: 'A4', unit: 'TK', kelas: 'A-1', jenisKelamin: 'perempuan', nisn: '' },                  // TK, NISN kosong
  { id: 'a5', nama: 'A5', unit: 'MI', kelas: 'Madinah', jenisKelamin: 'X', nisn: '12AB', tanggalMasuk: '2026-02-30' }, // tanpa tingkat, JK tak dikenal, tanggal tidak sah
  { id: 'a6', nama: 'A6', unit: 'MI', kelas: '4-a', jenisKelamin: '', nisn: '1234567890', status: 'Nonaktif' } // rombel huruf kecil = tidak sesuai
];

(async () => {
  { const srv = srvWith(SISWA); srv.sheets['01_SISWA'].splice(1, 2); // hanya fixture uji
    const before = J(srv.sheets['01_SISWA']); const r = srv.sb.opSiswaMasterAudit(); const S = r.ok && r.data.standar;
    rec('IMP8-01', 'audit baca-saja: 01_SISWA identik sebelum/sesudah; tidak ada normalisasi', r.ok && J(srv.sheets['01_SISWA']) === before, r.ok ? 'OK' : J(r));
    rec('IMP8-02', 'jenis kelamin: kanonis L/P = 2; variasi apa adanya (Laki-laki, perempuan, X) + saran kanonis hanya bila jelas (X tanpa saran); kosong dihitung',
      S.jenisKelamin.kanonis === 2 && S.jenisKelamin.kosong === 1 && J(Object.keys(S.jenisKelamin.variasi).sort()) === J(['Laki-laki', 'X', 'perempuan']) && S.jenisKelamin.saranKanonis['Laki-laki'] === 'L' && S.jenisKelamin.saranKanonis.perempuan === 'P' && !S.jenisKelamin.saranKanonis.X, J(S.jenisKelamin));
    rec('IMP8-03', 'kelas {TINGKAT}-{ROMBEL}: 1-A, 2-B, A-1 sesuai; "kelas 3", "Madinah", "4-a" tidak sesuai (per unit, contoh id saja)', S.kelas.sesuai === 3 && S.kelas.tidakSesuaiPerUnit.MI === 3 && J(S.kelas.contohTidakSesuai.sort()) === J(['a3', 'a5', 'a6']), J(S.kelas));
    rec('IMP8-04', 'NISN: valid 10 digit = 3 (termasuk ganda); tidak valid (8 digit, 12AB) = 2; kosong = 1 (tidak direka); sel angka = 1; ganda di semua baris = 1',
      S.nisn.valid === 3 && S.nisn.tidakValid === 2 && S.nisn.kosong === 1 && S.nisn.selAngka === 1 && S.nisn.gandaSemua === 1 && S.nisn.contohGandaSemua[0] === 'a2', J(S.nisn));
    rec('IMP8-05', 'tanggal masuk tidak sah (2026-02-30) terdeteksi; dampak kewajiban: siswa Aktif tanpa tingkat dihitung bila unit punya tarif per kelas (fixture: tarif tanpa kelas -> 0, unitBertarifKelas kosong)',
      r.data.tanggalMasuk.tidakSah === 1 && S.dampakKewajiban.aktifTanggalMasukTidakSah === 1 && S.dampakKewajiban.aktifTanpaTingkat === 0 && J(S.dampakKewajiban.unitBertarifKelas) === '[]', J(S.dampakKewajiban)); }
  { const srv = srvWith(SISWA); srv.sheets['03_TARIF'].push(['trf_k1', 'kmp_spp', 'MI', '1', '', 350000]);
    const r = srv.sb.opSiswaMasterAudit(), D = r.data.standar.dampakKewajiban;
    // s1 (Madinah) & a5 (Madinah) Aktif tanpa tingkat; "kelas 3" -> tingkatFromKelas kosong juga (tidak diawali angka)
    rec('IMP8-06', 'dampak kewajiban dengan tarif per kelas MI: siswa Aktif MI tanpa tingkat (Madinah, "kelas 3") ditandai - tarif per kelas tidak berlaku bagi mereka; menormalkan kelas akan MENGUBAH kewajiban', D.unitBertarifKelas.includes('MI') && J(D.contohTanpaTingkat.sort()) === J(['a3', 'a5', 's1']),
      J(D)); }
  rec('IMP8-07', 'STATUS: opSiswaMasterAudit belum dijalankan pada salinan data sah (tidak tersedia); tidak dijalankan pada produksi', null, 'BLOCKED - butuh salinan spreadsheet nonproduksi');

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
