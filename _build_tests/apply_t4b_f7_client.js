// Langkah build P1-IMP / D-T4b F7 (klien). Dijalankan SETELAH apply_t4b_f8_client.js. Paket terpisah agar mudah di-revert.
// tanggalMasuk, tanggalKeluar, jenisKelamin siswa TIDAK lagi dibuang diam-diam saat ditulis ke server (kolom sudah ada di
// header FINAL 01_SISWA). Validasi tanggal ditegakkan server (OP_MASTER_.siswa.dates, opMasterDateError_).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "  siswa:['nama','nis','nisn','kelas','unit','tahunAjaran','namaWali','kontakWali','status','alamat'],",
  "  siswa:['nama','nis','nisn','kelas','unit','tahunAjaran','namaWali','kontakWali','status','alamat','jenisKelamin','tanggalMasuk','tanggalKeluar'], // [P1-IMP F7]", 'MASTER_WRITE_FIELDS.siswa', log);
L.save(doc);
fs.writeFileSync(OUT + '_t4b_f7_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_t4b_f7_client OK: ' + log.length + ' perubahan');
