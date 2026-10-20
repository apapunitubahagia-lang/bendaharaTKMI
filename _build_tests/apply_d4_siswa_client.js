// Langkah build P1_23 D-4 siswa (klien). Dijalankan SETELAH apply_d4_impor_lama_client.js. Paket terpisah agar mudah di-revert.
// Wizard impor lama SISWA dinonaktifkan pada fungsi (bukan hanya tombol): importWizardConfirmSiswa menolak
// (JALUR_IMPOR_LAMA_DINONAKTIFKAN + audit IMPOR_LAMA_DITOLAK); commitSiswaRow / updateSiswaRow melempar galat sebelum menulis.
// Syarat persetujuan terpenuhi: Impor V2 siswa kini memuat seluruh fungsi wizard lama - impor massal, tanggalMasuk/jenisKelamin,
// pembaruan hanya-field-terisi, dan kolom status (P1_23, _import_rules.js) - dibuktikan d4_siswa_audit_tests SW-01..09.
// Form siswa manual dan Impor V2 tidak terpengaruh.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "function impLamaNonaktif_(type){ return !!IMPORT_V2_MODUL_[type] && type !== 'siswa'; } // siswa: belum (lihat catatan di atas)",
  "function impLamaNonaktif_(type){ return !!IMPORT_V2_MODUL_[type]; } // [P1_23 D-4] siswa ikut dinonaktifkan (Impor V2 siswa kini lengkap, termasuk status)", 'impLamaNonaktif_ siswa', log);
L.rep(doc, "function importWizardConfirmSiswa(updateMode){\n  const s = State.importSession;\n",
  "function importWizardConfirmSiswa(updateMode){\n  const s = State.importSession;\n  if(impLamaNonaktif_('siswa')) return impLamaTolak_('siswa'); // [P1_23 D-4]\n", 'importWizardConfirmSiswa', log);
const MSG = "'Wizard impor lama untuk modul ini dinonaktifkan. Gunakan Impor V2 (validasi & simpan oleh server).'";
[['commitSiswaRow(get, extra, res)', 'siswa'], ['updateSiswaRow(siswaId, get, extra, res)', 'siswa (perbarui)']].forEach(([sig, t]) =>
  L.rep(doc, 'function ' + sig + '{\n', 'function ' + sig + '{\n  throw new Error(' + MSG + ' + \' [JALUR_IMPOR_LAMA_DINONAKTIFKAN]\'); // [P1_23 D-4] modul ' + t + '\n', sig.split('(')[0], log));
L.save(doc);
fs.writeFileSync(OUT + '_d4_siswa_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d4_siswa_client OK: ' + log.length + ' perubahan');
