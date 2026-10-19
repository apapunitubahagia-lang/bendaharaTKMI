// Langkah build P1_21 D-4 (klien). Dijalankan SETELAH apply_d3_v1_pusat_client.js. Paket terpisah agar mudah di-revert.
// Wizard impor lama untuk 4 modul Impor V2 (penerimaan, pengeluaran, rab, lpj) DINONAKTIFKAN pada fungsi, bukan hanya tombol:
//  - importWizardConfirm (tipe 4 modul), commitPenerimaanRow/commitPengeluaranRow/commitRabRow/commitLpjRow menolak dengan
//    JALUR_IMPOR_LAMA_DINONAKTIFKAN (tidak ada baris lokal, antrean, maupun kiriman);
//  - modul SISWA belum dinonaktifkan: importWizardConfirmSiswa/commitSiswaRow masih diuji sebagai fungsi aktif oleh
//    e2e_central2 M0/M1 dan t4b_tests T4B-15 (di luar uji yang diizinkan diubah: AK-08, IA-05, IA-07) -> butuh keputusan;
//  - bukti tidak dipakai alur aktif: openImportWizard mengalihkan 5 modul ke Impor V2 (LI-01); resolver antrean lama sudah
//    menolak 5 modul (LI-02). Satu-satunya pemanggil lain adalah konsol / uji.
// Dipertahankan: wizard lama mutasi bank & RKAT (importWizardConfirm untuk tipe itu), utilitas bersama (fieldGetterFor,
// extraColumnsFor, sourceMetaFor, validasi pratinjau), dan seluruh Impor V2. Server: RecordEngine menolak baris RAB/LPJ baru
// bertanda impor lewat opRecordBatch publik (lapis kedua).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
const MSG = "'Wizard impor lama untuk modul ini dinonaktifkan. Gunakan Impor V2 (validasi & simpan oleh server).'";

L.rep(doc, "function importWizardConfirm(){\n  const s = State.importSession;\n",
  "/* [P1_21 D-4] jalur impor lama 4 modul Impor V2 (penerimaan, pengeluaran, rab, lpj) dinonaktifkan pada fungsi (bukan hanya tombol). */\n" +
  "function impLamaNonaktif_(type){ return !!IMPORT_V2_MODUL_[type] && type !== 'siswa'; } // siswa: belum (lihat catatan di atas)\n" +
  "function impLamaTolak_(type){ auditTrailPush('IMPOR_LAMA_DITOLAK', null, {type:type}, 'import-wizard'); toast(" + MSG + "); return {ok:false, code:'JALUR_IMPOR_LAMA_DINONAKTIFKAN', message:" + MSG + "}; }\n" +
  "function importWizardConfirm(){\n  const s = State.importSession;\n  if(s && impLamaNonaktif_(s.type)) return impLamaTolak_(s.type); // [P1_21 D-4]\n", 'importWizardConfirm', log);
[['commitPenerimaanRow(get, extra, res, rawRow, headerMap)', 'penerimaan'], ['commitPengeluaranRow(get, extra, res)', 'pengeluaran'], ['commitRabRow(get, extra, res, rawRow)', 'rab'],
  ['commitLpjRow(get, extra, res, rawRow)', 'lpj']].forEach(([sig, t]) =>
  L.rep(doc, 'function ' + sig + '{\n', 'function ' + sig + '{\n  throw new Error(' + MSG + ' + \' [JALUR_IMPOR_LAMA_DINONAKTIFKAN]\'); // [P1_21 D-4] modul ' + t + '\n', sig.split('(')[0], log));
L.save(doc);
fs.writeFileSync(OUT + '_d4_impor_lama_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d4_impor_lama_client OK: ' + log.length + ' perubahan');
