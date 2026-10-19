# P1_17 — Implementasi Impor Massal (Tahap A–F), F7, F8

**Tanggal:** 19 Oktober 2026
**Dasar:** `25d258b` (P1_16). Branch kerja: `claude/trusting-keller-84usce` (fast-forward dari `claude/vigilant-bell-967cih`).
**Keputusan yang dipakai:** D-IMP-1 s.d. D-IMP-8 (disetujui untuk tahap ini), D-T4b bagian F7/F8.
**Status proyek:** tetap `READY_FOR_INTEGRATION_TEST`. **Tidak ada uji live yang dijalankan.** Semua hasil di bawah berasal dari sandbox Node lokal (mock SpreadsheetApp/LockService), bukan Apps Script sungguhan.

Tidak ada deploy, tidak ada akses ke spreadsheet produksi, tidak ada migrasi otomatis, tidak ada perubahan data historis, formula/bobot/target/ambang KPI tidak disentuh, transfer antar-akun tetap diblokir, K-RAB-07 tidak diimplementasikan.

---

## 1. Commit (masing-masing dapat di-revert terpisah)

| Commit | Isi |
|---|---|
| `abbfc09` | **F8** gerbang `periodeAktif` KPI + fungsi admin normalisasi eksplisit |
| `149e8bf` | **F7** kolom siswa tidak dibuang + validasi tanggal server + audit master siswa (D-IMP-8) |
| `0f657d8` | **Mesin impor server** (`_import_rules.js` → `ImportRules.gs`, `ImportEngine.gs`) + 35 tes |
| `d535672` | **Wizard Impor V2 klien** (isi tabel, tempel, CSV, XLSX) + 13 tes |
| `c12cff6` | `opSchemaReport` memverifikasi header sheet log impor 31/32/33 |
| (commit ini) | Dokumen P1_17, README build, log tes `p1impA_*` |

## 2. File dan fungsi yang berubah

| File | Jenis | Fungsi / perubahan |
|---|---|---|
| `_import_rules.js` | **baru**, sumber tunggal | `impPlan_`, `impKeys_`, `impSourceHash_`, `impHash_` (cyrb53 ×2), `impDate_`, `impNum_`, `impPeriodLabelError_`, validator `impRowPemasukan_/Pengeluaran_/Rab_/Lpj_/Siswa_`, `impMatchSiswa_`, `impKandidatLpj_`, `IMP_FIELDS_`, `IMP_CHUNK_` |
| `ImportRules.gs` | **dihasilkan** (`build_import_rules.js`) | salinan identik `_import_rules.js` untuk server |
| `ImportEngine.gs` | **baru** | `opImportSetup`, `opImportPlan`, `opImportCommit`, `opImportStatus`, `opImportReviewList`, `opImportReviewResolve`; internal `impContext_`, `impPlanCore_`, `impWriteRecords_`, `impWriteOne_`, `impWriteLogs_` |
| `PeriodeAktifAdmin.gs` | **baru** | `opPeriodeAktifPlan`, `opPeriodeAktifApply` |
| `SiswaMasterAudit.gs` | **baru** | `opSiswaMasterAudit` (read-only) |
| `OperationalAPI.gs` | ubah | `OP_MASTER_.siswa.dates/dateOrder`, `opMasterDateError_` dipanggil di `opMasterUpsert`; `opSchemaReport` + sheet 31/32/33 |
| `_import_client.js` | **baru** (disuntikkan ke HTML) | `openImportV2`, `impV2XlsxRead_` (unzip stored/deflate-raw), `impV2Matrix_`, `impV2TableFromMatrix_`, `impV2GuessField_`, `impV2Plan`, `impV2SetKeputusan(Semua)`, `impV2Confirm`, `impV2RunChunks`, `impV2MasalahRows_/DownloadMasalah`, `impV2Template`, `openImportReviewV2`, `impV2ResolveReview` |
| `Bendahara_V2.html` | **dihasilkan** | lewat `apply_t4b_f8_client.js` (gerbang KPI + modal normalisasi), `apply_t4b_f7_client.js` (`MASTER_WRITE_FIELDS.siswa`), `apply_import_client.js` (suntik aturan + wizard, `openImportWizard` → V2 untuk 5 modul, blokir penyelesai antrean lama untuk 5 modul) |
| `ServerBridge.js/.html` | **dihasilkan** | +9 metode (`opPeriodeAktif*`, `opSiswaMasterAudit`, `opImport*`) |
| `_build_tests/*` | build/tes | `build_all.js`, `build_bridge.js`, `srv_env.js`, `run_all_tests.js` (registrasi); baru: `apply_t4b_f8_client.js`, `apply_t4b_f7_client.js`, `apply_import_client.js`, `build_import_rules.js`, `t4b_tests.js`, `import_engine_tests.js`, `import_client_tests.js` |

Tidak berubah sama sekali (diff 0 baris terhadap `25d258b`): `FinanceEngine.gs`, `ObligationEngine.gs`, `TransactionEngine.gs`, `TarifPlan.gs`, `MasterDataRead.gs`, `RecordGuard.gs`, `RecordEngine.gs`, `PeriodLock.gs`, `AllocationGuard.gs`. Di HTML, satu-satunya baris KPI yang berubah adalah gerbang `kpiRow`/`kpiIndukSummary` (sebelum perhitungan).

## 3. Arsitektur yang diimplementasikan

```
Isi tabel / Tempel TSV / CSV / XLSX ─> matriks ─> deteksi baris header (+ lewati baris CONTOH) ─> peta kolom
   ─> opImportPlan (server; READ-ONLY): konteks dari Sheets, aturan bersama, planHash
   ─> pratinjau per baris: kelas, normalisasi (dari → ke), keputusan yang diperlukan, kandidat (saran)
   ─> keputusan eksplisit per baris / "terapkan ke semua" (tindakan pengguna) ─> pratinjau ulang
   ─> centang konfirmasi ─> opImportCommit(planHash, 'IMPOR_DATA', mulai) per potongan
        ├ pemasukan/pengeluaran: opCreateIncome/opCreateExpense (AllocationGuard, T4, idempotensi 24_, audit+aktor)
        ├ RAB/LPJ: opRecordBatchLocked_ (RecordGuard, UNKNOWN_FIELD, audit per baris) — dalam lock yang sama dengan cek planHash
        └ siswa: opMasterUpsert (OP_MASTER_, tanggal F7, dupKey, audit)
   ─> log per baris 32_, ringkasan job 31_, antrean tinjauan 33_ + audit IMPORT_COMMIT_CHUNK / IMPORT_DONE (satu lock; gagal → log dipulihkan)
   ─> laporan, rekonsiliasi nominal, unduh baris bermasalah, muat ulang cache (KPI tetap dari server)
```

**Kelas baris:** `VALID`, `PERINGATAN` (diimpor), `PERLU_KEPUTUSAN`, `DUPLIKAT` (hanya bila `terimaDuplikat` eksplisit), `TOLAK`, `SUDAH_ADA` (siswa). Bendera `sudahTersimpan` terpisah dari kelas agar planHash stabil antarpotongan.

**Idempotensi:** kunci baris = `H(modul|sourceHash|isi)_n` (n = kemunculan isi yang sama dalam berkas). `clientRequestId` transaksi = `imp_<pem|pgl>_<kunci>`, id RAB/LPJ = `imp_<rab|lpj>_<kunci>`, id siswa baru = `imp_sis_<kunci>`. Data yang dibuat batch ini (dikenali dari `24_IDEMPOTENCY_LOG`, id deterministik, log impor untuk pembaruan siswa) **dikeluarkan dari konteks** pemeriksaan duplikat/alokasi, sehingga potongan ke-2 dst. menghasilkan planHash yang sama.

### Penerapan keputusan

| Keputusan | Implementasi |
|---|---|
| D-IMP-1 | Pembaca XLSX di klien (ZIP stored + `DecompressionStream('deflate-raw')`, `sharedStrings`, `inlineStr`, lembar pertama via `workbook.xml.rels`). Server tidak percaya hasil parsing: hanya menerima objek field kanonik, kolom tidak dikenal ditolak, semua aturan dijalankan ulang di server. |
| D-IMP-2 | `opImportPlan`/`opImportCommit` di branch terpisah, di atas jalur tulis yang ada. |
| D-IMP-3 | Sheet aditif `31_IMPOR_JOB` (ringkasan pekerjaan), `32_IMPOR_BARIS` (hasil per baris), `33_IMPOR_TINJAUAN` (antrean tinjauan) — terpisah satu sama lain dan dari data transaksi. Dibuat **hanya** lewat `opImportSetup('BUAT_SHEET_IMPOR')`; tanpa sheet ini commit ditolak `SCHEMA_ADDITIVE_REQUIRED`. localStorage hanya menyimpan profil pemetaan kolom. |
| D-IMP-4 | Alokasi diminta (kolom `komponen` / kolom per komponen) → wajib valid: komponen tidak dikenal, tanpa siswa, kewajiban tidak ada/lunas, Σ kolom > nominal → `TOLAK`, tidak disimpan. Tanpa komponen → disimpan tanpa alokasi (mekanisme yang sudah berlaku: "Belum Diproses"), ditandai `PERINGATAN TANPA_ALOKASI`. Kelebihan di atas sisa kewajiban → sisa tetap di transaksi (kebijakan kelebihan bayar yang sudah ada di AllocationGuard), ditandai `PERINGATAN SISA_TIDAK_TERALOKASI` (lihat §10 R-3). |
| D-IMP-5 | RAB impor selalu `status = DIAJUKAN`; status sumber lain → `PERINGATAN STATUS_SUMBER_DIABAIKAN`, nilai asli disimpan di `sourceRow.meta.statusSumber`. Tanpa kolom `status` di sheet → `TOLAK SCHEMA_ADDITIVE_REQUIRED`. |
| D-IMP-6 | Periode RAB kosong → `PERLU_KEPUTUSAN`; `2026/2027` → `PERLU_KEPUTUSAN` dengan **saran** "Tahun Ajaran 2026/2027" yang hanya diterapkan bila pengguna memilihnya; label tidak sah → `TOLAK`. `periodeAktif` tidak pernah dipakai. |
| D-IMP-7 | Lihat §4. Tidak ada migrasi; impor menulis hanya kolom yang ada. |
| D-IMP-8 | `opSiswaMasterAudit` (distribusi jenis kelamin, kelas per unit, NISN, tanggal; read-only). Impor hanya **menandai**: NISN bukan 10 digit, nilai jenis kelamin yang belum pernah ada di master. Tidak ada normalisasi data historis. |

## 4. Perubahan skema

| Perubahan | Sifat | Cara diterapkan |
|---|---|---|
| `31_IMPOR_JOB`, `32_IMPOR_BARIS`, `33_IMPOR_TINJAUAN` (sheet baru) | aditif, opsional | `opImportSetup('BUAT_SHEET_IMPOR')` eksplisit; audit niat ditulis lebih dulu; sheet yang sudah ada tidak ditimpa (header beda → `SCHEMA_MISMATCH`). Diverifikasi `opSchemaReport`. |
| Kolom RAB/LPJ (GAP-016) | **tidak diubah** | Impor menulis hanya kolom yang ada di header live. Field yang belum punya kolom (mis. `19_LPJ.hargaSatuan`) dilaporkan di pratinjau (`kolomTidakTersedia`) dan nilainya disimpan di `sourceRow` (JSON), bukan dibuang diam-diam. Header FINAL cukup untuk impor RAB & LPJ (IE-15). |
| Siswa `tanggalMasuk/tanggalKeluar/jenisKelamin` | tidak ada kolom baru | Kolom sudah ada di `01_SISWA` FINAL; hanya klien yang sebelumnya membuangnya (F7). `alamat` belum ada di FINAL → ditandai, tidak disimpan. |

**Rancangan migrasi aditif RAB/LPJ (D-IMP-7) — hanya untuk salinan nonproduksi, belum dijalankan:**
1. Salin spreadsheet; jalankan `opSchemaReport` dan `opSchemaPlan` (read-only). Rencana yang ada (`OP_SCHEMA_ADD_`): `08_ANGGARAN` + `status, subkategori, volume, satuan, hargaSatuan, keterangan, sourceSheet, importDate, importUser, jenis, komponenId`, `19_LPJ` + `hargaSatuan, keterangan`, semua sheet record + `archivedAt/archivedBy/archiveReason`.
2. Pemeriksaan dependensi: semua pembaca/penulis memakai **nama** header (P0-A); kolom ditambah di **ujung** header; `rabMatchAll_`/FCC membaca `status/jenis` secara opsional; tes `schema_archive_tests` & `IE-15` membuktikan baris lama tetap terbaca.
3. Terapkan `opSchemaApply('TAMBAH_KOLOM_ADITIF')` (audit lebih dulu, gagal tertutup).
4. Pemulihan: kolom tambahan kosong di ujung dapat dihapus manual atau salinan dipulihkan dari Riwayat Versi; data lama tidak berubah sehingga tidak ada pemulihan data.
5. Tidak ada migrasi saat startup.

## 5. Hasil tes (sandbox, `node run_all_tests.js p1impA`, log `_test_logs/p1impA_*.log`)

| Suite | PASS | FAIL | INFO |
|---|---|---|---|
| server_pass2 | 58 | 0 | 0 |
| e2e_central2 | 83 | 0 | 0 |
| tarif_server_tests | 52 | 0 | 0 |
| tarif_client_tests | 40 | 0 | 0 |
| schema_archive_tests | 27 | 0 | 0 |
| p0_tests | 45 | 0 | 1 |
| p1_tests | 60 | 0 | 0 |
| rab_tests | 35 | 0 | 2 |
| audit_p1_tests | 8 | 0 | 23 |
| p0_hardening_tests | 32 | 0 | 1 |
| readiness_tests | 6 | 0 | 4 |
| import_audit_tests | 2 | 0 | 10 |
| **t4b_tests** (baru) | 17 | 0 | 1 |
| **import_engine_tests** (baru) | 35 | 0 | 0 |
| **import_client_tests** (baru) | 13 | 0 | 0 |
| **Total (15 suite)** | **513** | **0** | **42** |

Sebelumnya 448 / 0 / 41 (12 suite). Tambahan: +65 PASS, +1 INFO (T4B-17, temuan baru).

**Tes lama:** tidak ada kode tes lama yang diubah atau dihapus; `run_all_tests.js` hanya ditambah 3 suite. Dua tes karakterisasi INFO lama berubah **teks hasilnya** karena temuan yang dicirikannya sudah ditangani (bukan karena ekspektasi diubah):
- **IA-11** (wizard siswa LAMA): sebelumnya "tersimpan, tanggalMasuk & jenisKelamin dibuang"; kini "siswa TIDAK tersimpan" karena kolom tidak lagi dibuang dan server menolak `05/09/2026` (bukan YYYY-MM-DD). Wizard lama tidak lagi dipakai UI untuk siswa; Impor V2 menormalisasi tanggal secara terlihat (IC-06, IE-29).
- **IA-12**: KPI kini `overall null` (DATA TIDAK TERSEDIA), bukan 0. Teks tes lama masih berbunyi "(bukan DATA TIDAK TERSEDIA ...)" karena kalimat itu statis di kode tes lama; nilai yang dicetak menunjukkan perilaku baru. T4B-01..03 menguji gerbang baru secara eksplisit.
- IA-01..10 kini mencirikan **wizard lama**, yang tidak lagi terjangkau dari UI untuk pemasukan/pengeluaran/RAB/LPJ/siswa (IC-01). Fungsinya dipertahankan agar mudah di-revert.

## 6. Uji 10 / 50 / 100 / 500 baris (sandbox, IE-31, IE-32)

Semua baris valid; commit per potongan; lalu berkas yang sama diimpor ulang.

| Modul | 10 | 50 | 100 | 500 | RPC commit (10/50/100/500) | Impor ulang |
|---|---|---|---|---|---|---|
| Pengeluaran | 10 | 50 | 100 | 500 | 1 / 3 / 5 / 25 | 0 baru |
| Pemasukan | 10 | 50 | 100 | 500 | 1 / 3 / 5 / 25 | 0 baru |
| RAB | 10 | 50 | 100 | 500 | 1 / 1 / 1 / 3 | 0 baru |
| LPJ | 10 | 50 | 100 | 500 | 1 / 1 / 1 / 3 | 0 baru |
| Siswa | 10 | 50 | 100 | 500 | 1 / 1 / 1 / 5 | 0 baru |

Waktu sandbox 500 baris: pengeluaran ±6,7 s, pemasukan ±7,5 s, RAB ±1,0 s, LPJ ±0,9 s, siswa ±1,8 s (seluruh potongan, mock dalam memori). **Waktu Apps Script sungguhan belum diukur** (setiap potongan menghitung ulang pratinjau penuh dan setiap transaksi membaca ulang sheet; lihat R-1).

Campuran (IE-32, pengeluaran): 10% tanggal mustahil, 5% duplikat dalam berkas, 5% sudah ada di server dari berkas lain → 10: 8 tersimpan dari 11 baris; 50: 42/53; 100: 85/105; 500: 425/525. Tersimpan = VALID terpilih, 0 ganda.

## 7. Bukti idempotensi dan pemulihan

| Kasus | Tes | Hasil |
|---|---|---|
| Baris identik dalam satu berkas | IE-07, IE-08 | ke-2 `DUPLIKAT` (tidak tersimpan); bila diterima eksplisit → 2 transaksi dengan kunci `_1`/`_2` |
| Berkas yang sama diimpor ulang | IE-09, IE-31 | semua `sudahTersimpan`, commit → `TIDAK_BERUBAH`, 0 baris baru |
| Transaksi sama di berkas berbeda | IE-10 | `DUPLIKAT_DATA_SERVER` + `PERNAH_DIIMPOR_BERKAS_LAIN`, tidak tersimpan |
| Tanggal & nominal sama, teks beda | IE-11 | `PERINGATAN`, **bukan** duplikat |
| Respons hilang setelah simpan + kirim ulang | IE-25, IC-08 | potongan sama dikirim ulang → 20 `TIDAK_BERUBAH`, lanjut → 10 tersimpan, total 30 (0 ganda); UI menampilkan "Lanjutkan" |
| Penyimpanan parsial (baris ke-3 gagal tulis) | IE-26 | hasil per baris `GAGAL` + item `GAGAL_SIMPAN`; ulang → hanya baris itu tersimpan, item tinjauan ditutup |
| Putus antara simpan data dan log impor | IE-27 | data tersimpan (beraudit engine), log dipulihkan (`logStatus GAGAL`); ulang → `TIDAK_BERUBAH` via `24_IDEMPOTENCY_LOG`, log lengkap |
| Audit gagal pada potongan RAB | IE-28 | seluruh potongan dibatalkan (atomik); ulang → tersimpan sekali |
| Data/ header berubah sejak pratinjau | IE-22, IE-23, IC-09 | `CONFLICT`, tidak ada yang tersimpan; UI kembali ke pratinjau |
| planHash stabil antarpotongan dengan alokasi | IE-33 | 25 pembayaran SPP satu siswa, 2 potongan, tanpa CONFLICT |

## 8. Rekonsiliasi total sumber vs tersimpan

IE-31 memeriksa, untuk setiap modul bernominal dan setiap ukuran: **Σ nominal sumber (pratinjau) = Σ selisih kolom `nominal` sheet tujuan = `31_IMPOR_JOB.nominalTersimpan`**, mis. pengeluaran 500: 5.124.750 = 5.124.750; pemasukan 500: 10.124.750 = 10.124.750; RAB 500: 50.124.750; LPJ 500: 2.624.750. IE-32: Σ tersimpan = Σ nominal baris terpilih pada data campuran. Laporan UI menampilkan nominal sumber, dipilih, tersimpan baru, dan sudah ada sebelumnya.

## 9. Bukti KPI tidak berubah akibat perubahan formula

- **T4B-05 KPI-DIFF:** KPI dihitung dengan build `25d258b` (diambil dari git) dan build sekarang pada data sandbox yang sama untuk September, Oktober, Agustus 2026: skor induk, status, bobot, dan `[kode, bobot, capaian, activityStatus, target]` **31 indikator identik**.
- Diff `25d258b..HEAD`: berkas mesin KPI/FCC server 0 baris; di HTML hanya gerbang `kpiRow`/`kpiIndukSummary` (periode tidak sah → DATA TIDAK TERSEDIA sebelum perhitungan).
- IE-31: sheet selain sheet tujuan, `06_ALOKASI`, `13_AUDIT_LOG`, `24_IDEMPOTENCY_LOG`, dan 31–33 **identik** sebelum/sesudah impor (termasuk `16_REKONSILIASI`; status TEREKONSILIASI tidak disentuh).
- IC-11: setelah impor, cache transaksi dimuat ulang dari server dan KPI dihitung dari data server.

## 10. F7 dan F8

- **F8:** `kpiPeriodeStatus_` — periode bukan label bulan → seluruh KPI `DATA TIDAK TERSEDIA (periode aktif tidak valid ...)`, badge periode "(TIDAK VALID)", kartu peringatan di Beranda (T4B-01..04). Normalisasi hanya lewat `opPeriodeAktifPlan` (pratinjau; usulan dari tanggal kalender) → `opPeriodeAktifApply` (konfirmasi `NORMALISASI_PERIODE_AKTIF`, nilai yang dilihat wajib sama → `CONFLICT`, label wajib sah, audit `PERIODE_AKTIF_DINORMALISASI`, audit gagal → dipulihkan, AUDITOR ditolak). Boot ulang tidak mengubah nilai (T4B-06..11).
- **F7:** kolom tidak lagi dibuang (klien); server memvalidasi tanggal siswa saat dibuat/diubah (YYYY-MM-DD kalender, keluar ≥ masuk); nilai historis yang tidak sah tidak diperiksa ulang (T4B-12..15).
- **Dampak kewajiban (T4B-16):** `tanggalMasuk 2026-09-05` membuat SPP dimulai September 2026 (tanpa tanggal: Juli–September). Artinya pengisian `tanggalMasuk` pada siswa yang sudah ada **mengubah kewajiban**; impor V2 mode pembaruan meminta persetujuan eksplisit `terimaPerubahanKewajiban` (IE-30). Siswa lama tidak disentuh.

## 11. Risiko yang masih terbuka

| ID | Risiko |
|---|---|
| R-1 | Waktu eksekusi Apps Script belum diukur. Setiap potongan menghitung ulang pratinjau penuh (baca semua sheet konteks) dan tiap transaksi memakai `opEngineWrite_` (gate + baca idempotensi + baca transaksi). 25 potongan × 20 transaksi untuk 500 baris; batas 6 menit per eksekusi berlaku **per potongan**, tetapi kuota harian dan kontensi lock belum diketahui. |
| R-2 | Untuk transaksi, pemeriksaan planHash dan penulisan per baris tidak berada dalam satu lock (engine mengambil lock sendiri). Celah kecil antara cek dan tulis; tetap dilindungi validasi engine (AllocationGuard, T4, idempotensi). RAB/LPJ: cek dan tulis dalam lock yang sama. |
| R-3 | Kelebihan pembayaran di atas sisa kewajiban diperlakukan sesuai kebijakan yang sudah ada (sisa di transaksi), ditandai PERINGATAN. Bila kebijakan menghendaki penolakan, cukup mengubah aturan menjadi TOLAK — **perlu konfirmasi**. |
| R-4 | Pembaruan siswa yang sukses tetapi lognya gagal ditulis: percobaan ulang dapat menghasilkan `CONFLICT` (nilai sebelum tidak tercatat). Aman (tidak menulis ganda), tetapi butuh pratinjau ulang. |
| R-5 | Wizard lama tetap ada di kode untuk 5 modul (tidak terjangkau dari UI). Mutasi bank & RKAT **masih** memakai wizard lama, termasuk default akun Bank pertama pada mutasi bank (di luar cakupan tahap ini). |
| R-6 | `T4B-17`: bila `periodeAktif` tidak sah, kewajiban server kosong (enumerasi berhenti). KPI kini gagal tertutup, tetapi tampilan/ekspor kewajiban & tunggakan belum diberi gerbang yang sama. |
| R-7 | GAP-005 tetap: bila web app berjalan sebagai "pengguna yang mengakses", pengguna dapat mengedit sheet langsung dan melewati mesin impor. |
| R-8 | Pembaca XLSX hanya lembar pertama, tanpa evaluasi rumus (nilai cache `<v>` dipakai) dan tanpa gaya tanggal; tanggal Excel dikenali dari angka serial 20000–80000 (ditampilkan sebagai normalisasi). `DecompressionStream` di iframe HtmlService belum diuji live. |
| R-9 | Sandbox: `LockService` mock tidak mensimulasikan dua eksekusi paralel; uji dua pengguna hanya bisa live. |

## 12. Bagian yang dihentikan karena butuh keputusan kebijakan

| Keputusan | Yang tidak dilakukan |
|---|---|
| D-T1 / D-T1-link | `opLinkLpj` dan `opCreateExpenseFromLpj` **tidak** diimplementasikan. Impor LPJ hanya menautkan bila `transaksiId` diberikan eksplisit di berkas (RecordGuard: PENGELUARAN aktif, Σ LPJ ≤ nominal). Kandidat hanya saran di pratinjau dan antrean tinjauan. Model uang muka tidak dibuat. |
| D-LPJ | Kosakata status LPJ tidak ditambah. Kolom `status` tetap `REALIZATION` (nilai yang sudah dipakai). Status tautan yang jelas diturunkan: `TANPA_TAUTAN` (PERLU TRANSAKSI / PERLU TAUTAN) di pratinjau, `sourceRow.meta.statusTautan`, dan item `LPJ_TANPA_TAUTAN` di `33_IMPOR_TINJAUAN`. |
| U-1 / K-RAB | Impor pengeluaran **tidak** menulis pemetaan RAB (`30_ALOKASI_PENGELUARAN`); jalur `opAlokasiPengeluaranImport` tetap terpisah. RAB jenis PEMASUKAN (butuh `komponenId`) ditolak impor. |
| D-IMP-8 | Enum jenis kelamin, format kelas, aturan NISN belum ditetapkan — hanya penanda. |
| D-T4b sisanya | Cap waktu server untuk `importDate`/`decidedAt`, rentang tahun, label tahun ajaran, uji kering data historis: belum. |

## 13. Tes live yang masih harus dijalankan (salinan nonproduksi, akun uji tanpa akses produksi & folder bukti produksi)

1. Prasyarat P1_15 §2–3 (proyek Apps Script terpisah, skrip terikat salinan, Script Property konfirmasi, akun uji).
2. `opSchemaReport` → 31/32/33 `MISSING_SHEET`; `opImportSetup('BUAT_SHEET_IMPOR')` → `MATCH`; ulang → `unchanged`.
3. Pratinjau & commit 10 / 50 / 100 / 500 baris per modul (pemasukan, pengeluaran, RAB, LPJ, siswa): catat **waktu per potongan dan total**, tidak ada `Exceeded maximum execution time`, kuota.
4. Pembaca XLSX di iframe HtmlService: berkas Excel asli (deflate, sharedStrings, tanggal berformat), Google Sheets → XLSX, berkas templat dari aplikasi.
5. Tempel dari Excel/Google Sheets (TSV clipboard) di peramban yang dipakai sekolah.
6. Putus koneksi nyata (tutup tab / matikan jaringan di tengah potongan) lalu "Lanjutkan"; verifikasi 0 ganda di `05_TRANSAKSI` dan `24_IDEMPOTENCY_LOG`.
7. Dua pengguna mengimpor/mengubah data bersamaan → `CONFLICT`/`LOCK_TIMEOUT` tertangani.
8. Pengguna AUDITOR dan pengguna tidak terdaftar → ditolak.
9. Header sheet diubah manual di salinan → `SCHEMA_MISMATCH`/`CONFLICT`.
10. Rekonsiliasi: Σ sumber = Σ tersimpan = `31_IMPOR_JOB.nominalTersimpan`; `ltPostflight` hanya berbeda pada baris uji; 544 TEREKONSILIASI identik.
11. KPI sebelum/sesudah impor uji: hanya berubah karena data uji baru; dengan `periodeAktif` FINAL `2026-10-01` → DATA TIDAK TERSEDIA; normalisasi lewat modal → KPI terhitung.
12. `opSiswaMasterAudit` pada salinan FINAL → bahan keputusan D-IMP-8.
13. Bila migrasi aditif RAB/LPJ disetujui: §4 langkah 1–4 di salinan, lalu ulangi butir 3 untuk RAB/LPJ.

**Status maksimum tetap `READY_FOR_INTEGRATION_TEST`.**
