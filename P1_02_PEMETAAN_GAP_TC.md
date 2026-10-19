# P1_02 — Pemetaan P1 ke Daftar GAP (05) dan Rancangan Test Case (07)

**Tanggal:** 17 Oktober 2026
**Sumber:**
- `05_DAFTAR_GAP_DAN_RISIKO.xlsx`: 47 temuan (11 P0, 26 P1, 10 P2), commit `f4f9fd4`.
- `07_RANCANGAN_TEST_CASE.md`: diunggah sebagai `.md`, bukan `.xlsx`.

> **Pembaruan 17-10-2026 (keputusan kebijakan):** status periode CLOSED/TERKUNCI kini **penanda administratif, bukan hard lock** (commit `79e2b66`). Ekspektasi `PERIOD_LOCKED` untuk GAP-015 / TC-CRUD-05 / P1L-13 / P1L-14 di dokumen ini **ditimpa**: penulisan diterima dan ditandai di audit. Lihat `P1_03_POLICY_CHANGE_AUDIT.md` dan `P1_03_IMPLEMENTATION_REPORT.md`. Status saat ini: `READY_FOR_INTEGRATION_TEST`.

> **Pembaruan 19-10-2026 (paket P1-RAB, commit `44e14f0`):** keputusan K-RAB-01..06 dan 08 diimplementasikan di sandbox (pencocokan pengeluaran → RAB disetujui, sheet aditif `30_ALOKASI_PENGELUARAN` dengan setup/uji kering/impor eksplisit, BDS03-I03/I04/I05 dan Financial Control memakai satu aturan). K-RAB-07 **tidak** diimplementasikan. Rincian: `P1_09_RAB_IMPLEMENTATION_REPORT.md`. Status tetap `READY_FOR_INTEGRATION_TEST`.

> **Pembaruan 19-10-2026 (lanjutan):**
> - Keputusan 2 (Kartu Beranda A/B/C) diimplementasikan di commit `30eec8a`; TC-DSH-08/09 PASS di sandbox (RAB-29..31).
> - Keputusan 1 (`PERIOD_MISMATCH`) **ditangguhkan** karena bertentangan dengan instruksi kebijakan lintas bulan yang lebih baru; diaudit di `P1_12` (TC-LB-01..10, usulan U-1..U-5).
> - K-RAB-07 dianalisis ulang di `P1_11` (rekomendasi C+B; tidak diimplementasikan).
> - GAP-020 (LPJ): temuan baru T1 (risiko hitung ganda lewat "Buat Transaksi dari LPJ") dan T3 (tidak ada status diterima/diverifikasi).
> - GAP-014: temuan T4 (`validateTanggal_` menerima tanggal kalender yang tidak mungkin).

**Status P1: tetap BELUM SELESAI.** Uji live (Apps Script + salinan Sheets) masih BLOCKED.

Hambatan H7 di `P1_00` (dokumen tidak tersedia) **teratasi**. ID TC sementara `TC-P1-*` diganti dengan ID dokumen di `p1_tests.js`.

---

## 1. Hasil pencocokan: implementasi pertama belum memenuhi semua kriteria dokumen

Setelah dokumen diterima, kode `3f9548a` diuji ulang terhadap kriteria lulus dan langkah TC dokumen. **Enam ketidaksesuaian terbukti** (gagal di `3f9548a`, bukti `_test_logs/p1v1_suitefinal_p1_tests.log`), lalu diperbaiki:

| # | Kriteria dokumen | Kondisi di `3f9548a` | Perbaikan | Tes |
|---|---|---|---|---|
| 1 | GAP-015, TC-CRUD-05: FINAL `15_SETTINGS periodeStatus.2026-07..09 = TERKUNCI`; `createIncome` 2026-07-15 → `PERIOD_LOCKED` | Kode hanya membaca blob closing klien. **Periode TERKUNCI di data FINAL tidak ditegakkan** | `PeriodLock.gs` membaca `periodeStatus.YYYY-MM` (TERKUNCI/CLOSED/LOCKED) **apa adanya**, tanpa mengubah data. Reopen beralasan menambah entri OPEN di blob; key asli tetap TERKUNCI. `opSettingsUpsert` menolak key `periodeStatus.*` | P1L-13 |
| 2 | GAP-015: kunci berlaku untuk transaksi, alokasi, **dan kewajiban** | Kewajiban dikecualikan (default K-P1-01) | `04_KEWAJIBAN.periode` ikut dikunci | P1L-14 |
| 3 | TC-CRUD-04 / GAP-014: `opRecordUpsert('rekonsiliasi', {akunId:'tidak_ada'})` → `VALIDATION_ERROR` | `USE_DEDICATED_API` (generik) dan `INVALID_ACCOUNT` (API khusus) | `akunId` divalidasi lebih dulu → `VALIDATION_ERROR` di kedua jalur | P1R-08 |
| 4 | GAP-019: FINAL 11_MUTASI_BANK 544/544 berstatus `TEREKONSILIASI` dan sudah tertaut | **Bug:** mutasi FINAL dapat dicocokkan ulang ke transaksi lain, karena hanya status `DIPROSES` yang dianggap tertaut | Mutasi dianggap tertaut bila `transaksiId` terisi atau status ∈ {DIPROSES, TEREKONSILIASI, TERIDENTIFIKASI} → `ALREADY_MATCHED` / `MUTASI_LOCKED`. Status yang ada **tidak diubah** | P1R-09 |
| 5 | GAP-031: resultType impor FINAL `mutasiBank` (544 baris); "replay setiap jenis operasi 2x → satu efek" | Cek orphan tidak berjalan untuk `mutasiBank`. Replay `opMasterUpsert`/`opUserUpsert` menulis dan mengaudit ulang | Alias `mutasiBank` di `RESULT_TYPE_SHEET` (hanya baca). Replay tanpa perubahan = no-op, tanpa audit | P1R-09, P1A-07 |
| 6 | TC-FAIL-05 / GAP-024: "Upload sinkron tidak memakai antrean memori"; GAP-045: "melampirkan bukti tidak mengubah status" | Unggahan "Lampirkan Bukti"/Dokumen masih antre di memori (`CC_MEM.blobs`, hilang saat muat ulang) | `buktiUploadNow_`: unggah langsung `opUploadBukti`, hasil selalu ditampilkan, peringatan `beforeunload` selama unggahan. Status tidak berubah | P1E-06 |

Sudah sesuai sejak `3f9548a` dan kini diuji dengan langkah dokumen: **TC-FAIL-07** (dua klien mengubah anggaran yang sama → klien kedua `CONFLICT`, P1C-06).

**Ringkasan uji `p1_tests.js` (49 tes, sandbox):**

| Kode | Hasil | Log |
|---|---|---|
| Baseline P0 (`20d9e55`) | PASS=3 FAIL=46 | `_test_logs/p1base_suitefinal_p1_tests.log` |
| P1 versi 1 (`3f9548a`) | PASS=43 FAIL=6 | `_test_logs/p1v1_suitefinal_p1_tests.log` |
| P1 sekarang | **PASS=49 FAIL=0** | `_test_logs/p1final_p1_tests.log` |

Suite lama tetap PASS (server_pass2 58, e2e_central2 82, tarif_server 52, tarif_client 40, schema_archive 27, p0_tests 44/0/1). Regresi KPI/UI identik baseline.

---

## 2. Status test case dokumen 07 yang terkait P1

**Live = BLOCKED untuk semua baris.** Data uji standar (DU) dokumen 07 adalah salinan FINAL, sedangkan sandbox memakai fixture rekaan `srv_env.js` yang meniru struktur FINAL yang relevan.

| TC | Langkah dokumen (ringkas) | Tes sandbox | Sandbox | Catatan |
|---|---|---|---|---|
| TC-CRUD-03 | Nominal 550.000 → 500.000 dengan alokasi 550.000 → `ALLOCATION_EXCEEDS_TRANSACTION` | P0B-04 (P0) | PASS | Ditangani P0 (GAP-012) |
| TC-CRUD-04 | Rekonsiliasi `akunId` tak dikenal → `VALIDATION_ERROR` | P1R-08 | PASS | — |
| TC-CRUD-05 | Juli TERKUNCI; `opCreateIncome` 2026-07-15 → `PERIOD_LOCKED` | P1L-01, P1L-13 | PASS | Membaca `periodeStatus.*` FINAL |
| TC-TRX-02 | Payload sama 2x → 1 transaksi, "idempotent replay" | P1A-06 | PASS | — |
| TC-REK-01 | Impor mutasi kredit/debit ke 11 dengan akunId + arah; tanpa transaksi otomatis | — | **BELUM** | GAP-041: butuh kolom `akunId`/arah/kunci dedup di 11_MUTASI_BANK (perubahan skema) dan keputusan GAP-019 |
| TC-REK-02 | Identifikasi mutasi → 05/06 terbentuk, 11.transaksiId terisi, status **TERIDENTIFIKASI** | P1R-05, P1R-06 | **SEBAGIAN** | Pencocokan tervalidasi server, tetapi status yang ditulis `DIPROSES` (kosakata KPI BDS02-I02 saat ini). Pilihan TERIDENTIFIKASI vs DIPROSES = **keputusan GAP-019** |
| TC-REK-03 | `saldoSistem` per 31-10 (bukan hari ini); SELESAI hanya bila selisih 0 | P1R-01, P1R-03, P1R-04 | PASS | Menjawab K-P1-03: akhir periode |
| TC-FAIL-02 | Respons hilang lalu retry → 1 transaksi, audit tidak ganda | P1A-01..04, P1A-07 | PASS | — |
| TC-FAIL-03 | `13_AUDIT_LOG` gagal tulis → perubahan dibatalkan, bukan sukses + warning | P0B-14/15 (P0), P1A-03, P1A-05 | PASS | P1: jalur transaksi dan `opSchemaApply` |
| TC-FAIL-05 | Unggahan bukti sinkron; gagal → pengguna diberi tahu | P1E-06 | **SEBAGIAN** | Sinkron untuk "Lampirkan Bukti" dan halaman Dokumen. Bukti yang dilampirkan **di form input** penerimaan/pengeluaran masih antre sampai transaksinya dikonfirmasi server (§4 no. 3) |
| TC-FAIL-06 | 2 klien paralel × 50 entri audit → 100 baris unik | — | **BLOCKED** | Butuh eksekusi Apps Script paralel nyata (H4). Sandbox hanya membuktikan lock dan idempotensi (P0B-11/12) |
| TC-FAIL-07 | 2 klien mengubah anggaran yang sama → klien kedua `CONFLICT` | P1C-06 (+ P1C-01..05) | PASS | — |
| TC-DSH-05 | Pengeluaran ter-map RAB (ITEM) lulus BDS03-I03 | P1D-05; RAB-01..13, RAB-18..24 | **SANDBOX PASS** (19-10-2026) | Pemetaan eksplisit ITEM (`30_ALOKASI_PENGELUARAN`) atau aturan kategori ke RAB **DISETUJUI** → I03 lulus; DIAJUKAN/tanpa status, pemetaan sebagian, dan Σ alokasi > nominal → tidak lulus. Belum diuji pada salinan FINAL (data `30_REF` belum diperiksa) → uji live `P1_07` |
| TC-DSH-06 | Komitmen COMMITTED 1 jt pada RAB X → FCC COMMITTED = 1 jt | P1D-04; schema_archive K3; RAB-13 | **SEBAGIAN** | `rabId` divalidasi; perhitungan komitmen per garis tidak diubah P1-RAB (tetap atas semua baris garis), RAB-13 memastikan klien = server. FINAL 09_KOMITMEN belum punya kolom `rabId` (perlu `opSchemaApply`, aditif, butuh persetujuan). Relasi komitmen ↔ transaksi = K-RAB-07, belum disetujui |
| TC-DSH-08 | Kartu Beranda: A/B/C terpisah, C = pengeluaran aktual, B + rincian = C | RAB-29, RAB-30, RAB-32 | **SANDBOX PASS** (19-10-2026) | Definisi `P1_10`; belum diuji live |
| TC-DSH-09 | Beranda = laporan Anggaran = ekspor | RAB-31 | **SANDBOX PASS** (19-10-2026) | Fungsi bersama `rabRingkasanPeriode_` |
| TC-LB-01..10 | Lintas bulan RAB/pencairan/transaksi/LPJ | RAB-32..36 (karakterisasi + LPJ) | **SEBAGIAN**; TC-LB-04/06..10 menunggu kebijakan U-1..U-5 | `P1_12` |
| TC-AUTH-02 | AUDITOR memanggil API tulis → `ROLE_NOT_ALLOWED` | P1S-01 (API P1) | PASS | — |
| TC-AUTH-08 | `driveFileUrl` bukti diakses akun lain → ditolak | — | **BLOCKED** | Izin Drive nyata. Folder per tahun ajaran belum diterapkan |
| TC-DUP-01 | Impor ulang mutasi → 0 baris baru | — | **BELUM** | GAP-041 (lihat TC-REK-01) |

---

## 3. Status GAP P1 (26 butir P1 dari dokumen 05)

**Keterangan status:**
- **Sandbox** = ditangani dan lulus sandbox, live BLOCKED.
- **Sebagian** = sebagian kriteria terpenuhi.
- **Belum** = tidak dikerjakan (alasan tertulis).

Butir yang langsung menjadi enam prioritas P1 ditebalkan.

| GAP | Area | Status | Yang dilakukan / alasan |
|---|---|---|---|
| GAP-012 | Integritas alokasi | Sandbox (P0) | Nominal < alokasi ditolak; status dihitung server |
| **GAP-013** | Audit trail | Sandbox | P0: lock + idempoten. P1: audit engine satu append di langkah terakhir; aktor (email) di setiap baris; baris role dalam append yang sama. TC-FAIL-06 BLOCKED |
| **GAP-014** | Validasi server | **Sebagian** | FK/integritas: rekonsiliasi.akunId, mutasi, LPJ, komitmen.rabId, bukti, periode. **Belum:** enum status per sheet, nominal ≥ 0 di semua record, 14_KPI hanya oleh server (bergantung GAP-007 KPI server) **Temuan T4 (19-10-2026):** tanggal transaksi hanya dicek format (`2026-13-40` diterima, RAB-35) → usulan U-4 |
| **GAP-015** | Penutupan periode | Sandbox | Ditegakkan di semua write-door, termasuk kewajiban; reopen hanya dengan alasan + audit. **Menyimpang dari rekomendasi:** tidak membuat sheet `30_PERIODE` (larangan migrasi). Status dibaca dari `periodeStatus.*` FINAL + blob closing. Alokasi dikunci berdasarkan tanggal transaksi induk, bukan periode kewajiban (agar tunggakan lama tetap dapat dibayar) |
| GAP-016 | Skema aditif | Belum (di luar prioritas) | `opSchemaApply` kini gagal tertutup bila audit gagal. Penerapan kolom aditif butuh persetujuan |
| **GAP-017** | Komitmen-RAB | **Sebagian** | `rabId` wajib valid. Header dan enum CANCELLED = perubahan skema → keputusan. Relasi persetujuan ↔ transaksi dianalisis di `P1_08` (rekomendasi B); **belum disetujui, tidak diimplementasikan** |
| **GAP-018** | RAB & pengendalian biaya | **Sandbox selesai (P1-RAB)** | Satu aturan `rabMatchAll_` (klien = server) berbasis `anggaranId` eksplisit lalu aturan kategori; FCC/`opRabRealization`/KPI memakai hasil yang sama; sheet `30_ALOKASI_PENGELUARAN` + uji kering/impor dari `30_REF_ALOKASI_PENGELUARAN`. Sisa: uji kering + impor pada salinan FINAL (`P1_07`) |
| **GAP-019** | Mutasi & rekonsiliasi | **Sebagian** (KEPUTUSAN_DIPERLUKAN) | Saldo sistem dari server per akhir periode; SELESAI hanya bila selisih 0; pencocokan tervalidasi dan memahami status FINAL. **Belum:** penyeragaman enum (keputusan), mutasi debit + saldo rekening, write-door `createBankMutation` |
| **GAP-020** | LPJ | **Sebagian** | `transaksiId` wajib PENGELUARAN aktif; total LPJ ≤ nominal. **Belum:** perbaikan isi `satuan`/`hargaSatuan` 200 baris = perubahan data (dilarang tanpa persetujuan); enum LPJ **Audit 19-10-2026 (`P1_12`):** LPJ bulan berikutnya diterima dan tidak mengubah pengeluaran/saldo (RAB-36); temuan T1 hitung ganda lewat "Buat Transaksi dari LPJ", T3 tanpa status diterima/diverifikasi → usulan U-2/U-3 |
| GAP-021 | Kewajiban beku | Sebagian | Hanya kunci periode. Selebihnya di luar prioritas |
| GAP-022 | Master komponen & tarif | Belum | Di luar prioritas P1 ini |
| GAP-023 | Unit | Belum | KEPUTUSAN_DIPERLUKAN |
| **GAP-024** | Bukti | **Sebagian** | Wajib berfile, tak dapat diubah, referensi valid; unggah sinkron untuk Lampirkan Bukti dan Dokumen. **Belum:** bukti di form input transaksi baru (§4 no. 3); folder Drive per tahun ajaran dengan izin pemilik + auditor |
| GAP-025 | KPI (logika) | **Sebagian (P1-RAB)** | Input BDS03-I03/I04/I05 diubah sesuai K-RAB-01..06 (disetujui 19-10-2026); bobot/target/ambang tetap; indikator lain identik (P0D-04/05, RAB-23). Bagian persetujuan I05 (K-RAB-07) dan butir GAP-025 lain belum |
| **GAP-026** | Sinkronisasi & konflik | Sandbox | CONFLICT terdeteksi untuk transaksi, koleksi, dan master (server). **Menyimpang dari rekomendasi:** ekspektasi nilai field, bukan kolom `version`/`updatedAt` (larangan migrasi). **Belum:** klien master belum mengirim ekspektasi; antrean masih di localStorage |
| GAP-027 | Migrasi saat boot | Belum | Di luar prioritas |
| **GAP-028** | Transfer antar-akun | **Tetap diblokir** | Sesuai instruksi; tidak ada jalur server (P1T-01) |
| GAP-029 | Inventaris berkas | Sebagian (P0) | Berkas deploy P1 dicatat di `P1_01` §9 |
| GAP-030 | Status verifikasi | Dokumen ini | Status per TC: §2 |
| **GAP-031** | Idempotensi | **Sebagian** | Update transaksi, rekonsiliasi, pencocokan, close/reopen, master, dan akses pengguna idempoten; alias resultType `mutasiBank`. **Belum:** pemisahan entri TEST_* (perubahan data), indeks log (GAP-034) |
| GAP-032 | Data uji di produksi | Belum | Perubahan data produksi, dilarang |
| GAP-041 | Mutasi bank (impor) | **Belum** | Butuh kolom baru 11_MUTASI_BANK + keputusan GAP-019 |
| GAP-042 | Pembayaran multi-siswa | P0/eksisting | Di luar prioritas |
| GAP-043 | Tarif historis | Belum | Di luar prioritas |
| GAP-044 | Laporan & histori | Belum | Di luar prioritas |
| **GAP-045** | Semantik status | **Sebagian** | Bukti tidak lagi mengubah status; SELESAI wajib bukti. **Belum:** kolom status terpisah (statusAlokasi/Bukti/Verifikasi/Rekonsiliasi) = perubahan skema |

---

## 4. Risiko baru yang muncul dari pencocokan dengan data FINAL

1. **Juli–September 2026 langsung terkunci** saat kode dipasang ke spreadsheet berisi `periodeStatus.2026-07..09 = TERKUNCI` (DU dokumen 07). Semua koreksi bulan itu butuh reopen beralasan. Ini sesuai GAP-015, tetapi berdampak operasional.
2. **Nilai `periodeStatus` lain** (mis. TERBUKA) dianggap terbuka. Nilai yang tidak dikenal juga dianggap **terbuka**; perlu konfirmasi kosakata lengkap di salinan FINAL.
3. **Bukti di form input transaksi** (wizard penerimaan, form pengeluaran) masih memakai antrean memori sampai transaksinya dikonfirmasi server. Bila halaman dimuat ulang sebelum itu, bukti ditandai gagal dengan pesan "lampirkan ulang"; tidak hilang diam-diam (perilaku P0). Agar sepenuhnya sinkron, bukti harus diunggah setelah transaksi terkonfirmasi. Ini perubahan alur form.
4. **544 mutasi FINAL berstatus `TEREKONSILIASI`** tetap gagal BDS02-I02 (KPI mensyaratkan DIPROSES). P1 tidak mengubah KPI maupun data → menunggu keputusan GAP-019.

## 5. Keputusan yang masih dibutuhkan (diperbarui)

| ID | Status setelah dokumen |
|---|---|
| K-P1-01 (cakupan kunci periode) | **Diselaraskan GAP-015:** transaksi, alokasi, kewajiban (+ staging mutasi/rekonsiliasi/LPJ/anggaran/komitmen). Bukti, laporan, dan snapshot KPI tetap tidak dikunci. Mohon konfirmasi |
| K-P1-02 (reopen) | **Sesuai GAP-015** ("hanya dengan alasan dan audit"). Persetujuan ganda tidak diminta dokumen |
| K-P1-03 (saldo sistem rekonsiliasi) | **Terjawab TC-REK-03:** per akhir periode |
| K-P1-04 (pencocokan wajib akun Bank) | Masih terbuka (bagian GAP-019) |
| K-P1-05 (SELESAI wajib bukti untuk kedua jenis) | Sejalan GAP-045; mohon konfirmasi |
| K-P1-06 (bukti historis tanpa file tetap dihitung KPI) | Masih terbuka (GAP-024/025) |
| **GAP-019** | Enum mutasi/rekonsiliasi: DIPROSES vs TERIDENTIFIKASI vs TEREKONSILIASI. Menentukan TC-REK-02 dan BDS02-I02 |
| ~~GAP-018/025~~ | **Diputuskan 19-10-2026** (K-RAB-01..06, 08) dan diimplementasikan di sandbox. Tersisa **K-RAB-07** (persetujuan pengeluaran di luar RAB, `P1_08`) |
| GAP-017/020/041/045 | Persetujuan perubahan skema aditif (kolom baru) dan/atau koreksi data |
