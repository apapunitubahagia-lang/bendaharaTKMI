# P1_09 — Laporan Implementasi P1-RAB (Pengeluaran → RAB Disetujui)

**Tanggal:** 19 Oktober 2026
**Branch:** `claude/vigilant-bell-967cih` (lokal `p1/implementasi`)
**Status: READY_FOR_INTEGRATION_TEST** (bukan P1_COMPLETE). Semua hasil di bawah adalah hasil **sandbox Node**, bukan hasil Apps Script atau data FINAL.

---

## 1. Verifikasi awal dan commit

| Langkah | Hasil |
|---|---|
| HEAD sebelum tugas | `d49367c` = `origin/claude/vigilant-bell-967cih`, working tree bersih (diperiksa dengan `git status` / `git log`) |
| Commit keputusan + analisis | `6ef9926`: tabel keputusan K-RAB di `P1_06`, §4.3 identitas garis anggaran, `P1_08_ANALISIS_K_RAB_07.md` |
| Commit implementasi | `44e14f0` **P1-RAB**: satu commit kode + tes, terpisah dari P1-POLICY (`79e2b66`) |
| Uji revert | Di worktree sementara: `git revert --no-commit 44e14f0` + `build_all.js` → isi tree **identik** dengan `6ef9926`; 7 suite lama PASS (p0_tests 44 PASS: P0D-04b ikut hilang bersama revert) |
| Commit dokumen | Commit terpisah setelah `44e14f0` (dokumen ini, `P1_06` §11, `P1_02`) |

## 2. Keputusan

| ID | Status | Penerapan |
|---|---|---|
| K-RAB-01 | Diterapkan | Uji kering: `tingkatPemetaan` ≠ `ITEM` (termasuk kosong) → `PERLU_PEMERIKSAAN` / `TINGKAT_BUKAN_ITEM`, tidak diimpor. Distribusi tingkat dilaporkan |
| K-RAB-02 | Diterapkan | Status dinormalisasi: `DISETUJUI` / `DIAJUKAN` / `TANPA_STATUS` / `STATUS_LAIN`. Hanya `DISETUJUI` yang disetujui. Pagu per status ditampilkan terpisah. Data status historis **tidak** diisi |
| K-RAB-03 | Diterapkan | Sisa tanpa alokasi eksplisit = `sisaTidakTerpetakan`, tidak jatuh ke aturan kategori. Σ alokasi > nominal → seluruh alokasi transaksi itu diabaikan dan dilaporkan (`ALOKASI_MELEBIHI_NOMINAL`); penulisan baru ditolak (`ALOKASI_EXCEEDS_TRANSACTION`) |
| K-RAB-04 | Diterapkan | Garis = `kategori|subkategori|unit|periode` (baris tanpa kategori/unit sah = garis tunggal). Realisasi garis = bagian eksplisit + bagian aturan kategori; tiap rupiah paling banyak di satu garis. Total tampilan per garis unik |
| K-RAB-05 | Diterapkan | Populasi I04 = garis dengan pagu DISETUJUI > 0. Tanpa garis → tanpa aktivitas → aturan N/A yang ada (P0D-04b: `BELUM ADA AKTIVITAS`) |
| K-RAB-06 | Diterapkan | Hanya teks `population`/`formula` BDS03-I03/I04/I05 di `INDICATOR_MASTER`. P0D-05 membuktikan bobot/target/ambang/definisi lain identik |
| K-RAB-07 | **Tidak diimplementasikan** | `pengeluaranPunyaPersetujuan` identik dengan baseline (RAB-27). Analisis + rekomendasi B di `P1_08` |
| K-RAB-08 | Diterapkan (sandbox) | Sheet hanya dibuat lewat `opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN')`; tidak ada pembuatan/impor saat boot; uji kering read-only; impor hanya baris VALID dengan `planHash`. **Belum** dijalankan pada salinan FINAL |

## 3. File dan fungsi yang diubah (commit `44e14f0`)

| File | Perubahan |
|---|---|
| `_rab_match.js` (baru) | `rabStatusOf_`, `rabLineStatus_`, `rabMatchAll_`, `rabRealisasiBaris_`: sumber tunggal, disuntikkan ke HTML dan `FinanceEngine.gs` |
| `_fcc_budget.js` | `fccBudgetVsActual_` bagian PENGELUARAN: aktual dari `rabMatchAll_`; `anggaran` = pagu disetujui; kolom per status; status `ANGGARAN BELUM DISETUJUI`; `sisaTidakTerpetakan`, `pencocokanBermasalah` |
| `_fcc_pure.js` | `fccCompute_`: `missing` per garis berpagu DISETUJUI; `planned.rabPengeluaranPerStatus` (`rabPeriode` tetap) |
| `_build_tests/apply_p1_rab_client.js` (baru) | Patch HTML: injeksi, `OP_SHEETS`/`KPI_SOURCE_KEYS_`/`centralFccData_`, blok BDS03 di `financialAktivitasFeed`, teks formula BDS03, `rabMendekatiPagu`, `pengeluaranDiLuarRabBulanIni`, Beranda, tab Realisasi/Sisa, snapshot laporan, tabel + ekspor laporan anggaran |
| `_build_tests/apply_p1_rab_server.js` (baru) | Patch `FinanceEngine.gs`: injeksi `_rab_match.js`; `opFinancialControl` membaca `30_ALOKASI_PENGELUARAN` (tidak ada → `[]`) |
| `RabAllocation.gs` (baru) | `opAlokasiPengeluaranSetup`, `rabAlokasiPlanCore_`, `opAlokasiPengeluaranPlan`, `opAlokasiPengeluaranImport` |
| `RabMapping.gs` | `rabMapCompute_` di atas `rabMatchAll_`; keluaran + `sisaTidakTerpetakan`, `pencocokanBermasalah`, pagu per status |
| `RecordGuard.gs` | `ctx.angById`; aturan `alokasiPengeluaran` (transaksi PENGELUARAN aktif, anggaran aktif non-PEMASUKAN, nominal > 0, pasangan aktif unik, Σ ≤ nominal, field kunci immutable) |
| `RecordEngine.gs` | `OP_RECORDS_.alokasiPengeluaran`; `opRecordBatchLocked_(…, extraAudits)` = audit tambahan pada append yang sama |
| `OperationalAPI.gs` | `opReadSheet` boleh membaca `30_ALOKASI_PENGELUARAN`; sheet belum ada → `ok`, baris kosong, `sheetMissing: true`; `opSchemaReport` mengenal header |
| `SchemaGuard.gs` | `SG_REQUIRED_['30_ALOKASI_PENGELUARAN']` |
| Generate: `Bendahara_V2.html`, `FinanceEngine.gs`, `ServerBridge.*` | Hasil build (`build_all.js`; deterministik, diverifikasi md5 dua kali build) |
| `_build_tests/*` | `rab_tests.js` (baru), `build_all.js`, `build_bridge.js` (+3 method), `srv_env.js` (+`RabAllocation.gs`), `run_all_tests.js`, `p0_tests.js`, `tarif_client_tests.js`, `server_pass2.js` (lihat §6) |

**Tidak disentuh:** `PeriodLock.gs` dan seluruh kode P1-POLICY, `CreateDatabaseStructure.gs`/`DB_SCHEMA`, `09_KOMITMEN`, data `08_ANGGARAN`/`30_REF_ALOKASI_PENGELUARAN`, transfer antar-akun (tetap diblokir, GAP-028), saldo awal, status mutasi (544 baris), rumus BDS02.

## 4. Kasus uji yang diminta → tes

| Kasus | Tes | Hasil |
|---|---|---|
| Pemetaan ITEM valid | RAB-18 (R1 VALID), RAB-20 (diimpor), RAB-06 (t6 eksplisit penuh → I03 lulus) | PASS |
| Tingkat selain ITEM | RAB-18 (R2 `KATEGORI`, R3 kosong → `PERLU_PEMERIKSAAN`) | PASS |
| Referensi transaksi/anggaran hilang | RAB-05 (matcher), RAB-14 (RecordGuard), RAB-18 (R4/R5/R9 `DITOLAK`) | PASS |
| Pemetaan duplikat | RAB-14 (`DUPLICATE`), RAB-18 (`ID_SUMBER_GANDA`, `PASANGAN_GANDA`), RAB-21 (`SUDAH_ADA`) | PASS |
| Pemetaan sebagian | RAB-03 (Rp1.000.000 / Rp700.000 → sisa Rp300.000), RAB-10/11 (FCC + `opRabRealization`), RAB-22 (hasil impor 240.000 atas 250.000) | PASS |
| Σ alokasi > nominal | RAB-04 (diabaikan + dilaporkan), RAB-14/15 (ditolak, termasuk dalam satu batch), RAB-18 (R8 `MELEBIHI_NOMINAL_TRANSAKSI`) | PASS |
| Status DIAJUKAN / DISETUJUI / kosong | RAB-01, RAB-02, RAB-06, RAB-09, P0D-04b | PASS |
| Banyak baris RAB dalam satu garis | RAB-01, RAB-07, RAB-24 (satu aktivitas I04 per garis), RAB-28 (total Beranda per garis unik) | PASS |
| Realisasi tanpa hitung ganda | RAB-08 (Σ garis + Σ sisa + Σ tanpa RAB = Σ pengeluaran), RAB-10 (invarian FCC) | PASS |
| Diferensial BDS03-I03/I04/I05 dan Financial Control | RAB-24 (ekspektasi manual), RAB-25/26 (nilai), P0D-04b | PASS / INFO |
| Regresi KPI di luar BDS03 | P0D-04, P0D-05 (fixture default vs baseline `802cbed`), RAB-23 (fixture RAB vs `6ef9926`) | PASS |
| Tambahan | RAB-13 klien = server; RAB-16/17 tanpa auto-create + setup eksplisit/audit/otorisasi; RAB-19 gerbang impor (konfirmasi, peran, `CONFLICT`); RAB-27 K-RAB-07 tidak berubah | PASS |

## 5. Hasil suite (`node _build_tests/run_all_tests.js p1rab`, log `_test_logs/p1rab_*.log`)

| Suite | Sebelum P1-RAB (`6ef9926`) | Sesudah (`44e14f0`) |
|---|---|---|
| server_pass2 | 58 PASS | 58 PASS |
| e2e_central2 | 83 PASS | 83 PASS |
| tarif_server_tests | 52 PASS | 52 PASS |
| tarif_client_tests | 40 PASS | 40 PASS |
| schema_archive_tests | 27 PASS | 27 PASS |
| p0_tests | 44 PASS + 1 INFO | 45 PASS + 1 INFO (P0D-04b baru) |
| p1_tests | 60 PASS | 60 PASS |
| rab_tests (baru) | — | 26 PASS + 2 INFO |
| **Total** | 364 PASS | **391 PASS, 0 FAIL** |

Tidak ada tes yang dihapus.

## 6. Ekspektasi tes lama yang diubah (dengan alasan)

| Tes | Perubahan | Alasan |
|---|---|---|
| P0D-04 | Dari "seluruh KPI identik" menjadi "identik kecuali BDS03-I03/I04/I05 dan turunannya (skor BDS03, overall)" + P0D-04b (nilai baru = ekspektasi manual) | Perubahan input BDS03 disetujui (K-RAB-01..06). Pengecualian dibatasi tiga indikator; indikator lain tetap diuji identik |
| P0D-05 | `INDICATOR_MASTER` dibandingkan setelah teks `population`/`formula` BDS03-I03/I04/I05 disamarkan; `financialAktivitasFeed` setelah blok `// ===== BDS03` disamarkan; 11 simbol lain tetap dibandingkan utuh | K-RAB-06 (teks formula) dan blok BDS03. Bobot/target/ambang tetap diverifikasi identik |
| tarif_client U25 | RAB uji "ATK Kertas" dibuat berstatus `Disetujui` | U25 menguji pencocokan subkategori dan komitmen terpisah. Dengan status default `Diajukan`, pagu kini 0 (K-RAB-02/05) sehingga `selisih` tidak lagi menguji hal itu. Perilaku `Diajukan` diuji di RAB-02/09 |
| server_pass2 (pemeriksa referensi) | `inScope` ditambahkan ke daftar fungsi lokal | `inScope` adalah variabel fungsi lokal di `fccBudgetVsActual_` yang kini dipanggil langsung; bukan fungsi global yang hilang |

## 7. Diferensial nilai (sebelum → sesudah) dan penyebabnya

### 7.1 Fixture default (`srv_env.js`), periode September 2026 (P0D-04b)

Satu pengeluaran `imp_trx_2` (ATK, MI, Rp50.000); satu RAB `ang_1` (ATK, Rp1.000.000) **tanpa kolom status**.

| Ukuran | Sebelum | Sesudah | Penyebab |
|---|---|---|---|
| BDS03-I03 | 100 (Sangat Baik), realisasi 100 | 50 (Perlu Perbaikan), realisasi 0 | `ang_1` status kosong = belum disetujui (K-RAB-02) → `imp_trx_2` tidak terpetakan ke RAB disetujui |
| BDS03-I04 | 100 (Sangat Baik) | `BELUM ADA AKTIVITAS` / `NOT_STARTED` | Tidak ada garis berpagu DISETUJUI → populasi kosong → aturan N/A yang ada (K-RAB-05) |
| BDS03-I05 | 100, realisasi 100 | 50, realisasi 0 | Mengikuti I03; bagian persetujuan tidak terpenuhi dari data server (K-RAB-07 belum) |
| Skor BDS03 | 94,1 (Sangat Baik) | 54,1 (Perlu Perbaikan) | Turunan tiga indikator di atas |
| Overall | 57 (Perlu Perbaikan) | 47 (Perlu Perbaikan) | Turunan BDS03 |
| FCC garis ATK MI | anggaran 1.000.000, aktual 50.000, `DALAM ANGGARAN` | anggaran 0, aktual 50.000, `ANGGARAN BELUM DISETUJUI` (`anggaranTanpaStatus` 1.000.000) | Hanya pagu disetujui yang menjadi anggaran |
| Indikator lain (BDS01/02/04/05/06, BDS03-I01/I02/I06) | — | identik | P0D-04 |

Catatan: angka sesudah dihitung oleh kode baru dan dicocokkan dengan ekspektasi manual. Penurunan tersebut berasal dari aturan yang disetujui, bukan dari regresi.

### 7.2 Fixture RAB (`rab_tests.js`), periode Oktober 2026 (RAB-24/25/26)

Pengeluaran t1..t6 (Rp1.650.000). Garis ATK = 600.000 DISETUJUI + 400.000 Disetujui + 300.000 DIAJUKAN; Konsumsi 200.000 kosong; Listrik 500.000 DIAJUKAN; Honor 150.000 DISETUJUI; Kebersihan 90.000 DISETUJUI. Alokasi eksplisit: t1 700.000 → Honor, t5 30.000+30.000 (> 50.000), t6 150.000 → Honor.

| Ukuran | Sebelum | Sesudah | Penyebab |
|---|---|---|---|
| BDS03-I03 | 50, realisasi 0 (0/6 lulus) | 66,66, realisasi 33,3 (2/6: t2, t6) | Aturan lama `program === kategori` tidak pernah cocok (nama program ≠ kategori). Aturan baru: t2 (kategori → ATK disetujui) dan t6 (eksplisit penuh → Honor) lulus; t1 sebagian, t3 tanpa status, t4 diajukan, t5 alokasi berlebih → gagal |
| BDS03-I04 | 100, realisasi 100 (per baris RAB, realisasi ≈ 0) | 88,25 (Baik), realisasi 66,7 (2/3 garis) | Populasi = 3 garis disetujui. ATK 250.000 ≤ 1.000.000 ok; Kebersihan 0 ≤ 90.000 ok; Honor 850.000 > 150.000 gagal. "Lulus semu" lama hilang |
| BDS03-I05 | 50, realisasi 0 | 66,66, realisasi 33,3 | Mengikuti I03 |
| Skor BDS03 / masalah | 74,1 (Perlu Perhatian), 12 masalah | 78,4 (Perlu Perhatian), 9 masalah | Turunan |
| Overall | 21,5 | 22,6 | Turunan |
| FCC ATK | anggaran 1.300.000, aktual 1.300.000 | anggaran 1.000.000 (+300.000 diajukan), aktual 250.000 | Anggaran = pagu disetujui; t1 dihitung ke Honor (eksplisit) dan sisanya tidak terpetakan; t5 tanpa RAB |
| FCC Honor | aktual 150.000, `DALAM ANGGARAN` | aktual 850.000, `MELEBIHI ANGGARAN` | Alokasi eksplisit t1 + t6 |
| FCC Konsumsi / Listrik | anggaran 200.000 / 500.000, `DALAM ANGGARAN` | anggaran 0, `ANGGARAN BELUM DISETUJUI` | Status kosong / DIAJUKAN |
| FCC transaksi tanpa anggaran | — | ATK 50.000 (t5) | Alokasi berlebih diabaikan, tidak dicocokkan ulang |
| FCC sisa tidak terpetakan | (tidak ada) | 1 transaksi, 300.000 (t1) | K-RAB-03 |
| FCC `missing` | 7 baris (semua RAB) | 1 garis (Kebersihan 90.000) | Aturan lama selalu gagal; aturan baru per garis disetujui tanpa realisasi/komitmen |
| Indikator lain | — | identik | RAB-23 |

## 8. Yang tidak diuji / keterbatasan

1. **Data FINAL tidak tersedia.** Isi `30_REF_ALOKASI_PENGELUARAN`, distribusi `tingkatPemetaan`, resolusi FK, dan status RAB nyata belum diperiksa. Dampak pada KPI produksi **belum diketahui**; perkiraan di `P1_06` §6 tetap perkiraan.
2. **Apps Script sungguhan belum dijalankan.** Belum ada bukti tentang lock, kuota, waktu eksekusi impor (batch 200), `insertSheet` nyata, atau perilaku `getValues` pada sheet besar.
3. **Alokasi eksplisit lintas periode.** Bila alokasi menunjuk garis bulan lain dari tanggal transaksi, realisasi garis (dipakai I04) memuatnya, tetapi kolom aktual FCC per periode hanya memuat transaksi bertanggal periode itu. Uji kering menandai kasus ini `PERIODE_BERBEDA` (tidak diimpor), tetapi entri manual lewat `opRecordBatch` tidak menolaknya. Perlu keputusan bila ingin ditolak.
4. **Kartu Beranda "Realisasi RAB Bulanan":** "Realisasi" menjumlah realisasi semua garis periode (termasuk garis belum disetujui), sedangkan "Total Anggaran Disetujui" hanya pagu disetujui; "Anggaran belum disetujui" tampil terpisah. Mohon ditinjau apakah realisasi juga perlu dipisah per status.
5. **K-RAB-07:** bagian persetujuan I05 tetap tidak dapat terpenuhi dari data server (kolom `09_KOMITMEN.transaksiId` tidak ada).
6. **UI entri alokasi manual** belum ada; alokasi hanya lewat impor atau `opRecordBatch('alokasiPengeluaran')`.

## 9. Kebutuhan uji live (tambahan untuk `P1_07`)

Di **salinan** spreadsheet (ID ≠ produksi `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`), setelah deploy commit yang diuji:

1. `opAlokasiPengeluaranPlan()` sebelum sheet dibuat: catat kelas, alasan, distribusi tingkat, resolusi FK, `planHash`. Pastikan `30_REF_ALOKASI_PENGELUARAN` tidak berubah (bandingkan isi sebelum/sesudah).
2. Hasil uji kering diperiksa dan disetujui pengguna.
3. `opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN')`: sheet + header + audit `SCHEMA_CREATE_SHEET`.
4. `opAlokasiPengeluaranImport({planHash, confirm})`: jumlah diimpor = jumlah VALID; audit per baris + ringkasan; impor ulang = 0.
5. KPI dan FCC sebelum/sesudah impor (ekspor snapshot): diferensial BDS03-I03/I04/I05 + FCC; indikator lain identik.
6. Waktu eksekusi plan/impor/KPI dan beban baca sheet tambahan.

## 10. Kepatuhan batasan

| Batasan | Status |
|---|---|
| Tidak mengakses/mengubah produksi, tanpa deploy | Dipatuhi (sandbox saja) |
| Tidak mengubah data historis, saldo awal, status mutasi | Dipatuhi |
| Tidak ada migrasi/pembuatan sheet/impor otomatis | Dipatuhi (RAB-16) |
| Rumus/bobot/target/ambang KPI tidak diubah sepihak | Dipatuhi; hanya input BDS03-I03/I04/I05 + teks formula yang disetujui (P0D-05) |
| Transfer antar-akun tetap diblokir (GAP-028) | Tidak disentuh |
| Satu sumber data, audit, idempotensi, deteksi konflik | Satu sumber `_rab_match.js`; audit di append yang sama; id impor deterministik; `planHash` → `CONFLICT` |
| Tidak menghapus tes | Dipatuhi |
| K-RAB-07 tanpa persetujuan tertulis | Tidak diimplementasikan |
| Status maksimum | `READY_FOR_INTEGRATION_TEST` |

---

## 11. Lanjutan 19-10-2026: Keputusan 1–3 dan kebijakan lintas bulan

**Verifikasi awal:** branch lokal `p1/implementasi` = `claude/vigilant-bell-967cih` = remote `f955416`, working tree bersih.

| Commit | Isi |
|---|---|
| `b26de58` | Dokumen saja: definisi Kartu Beranda (`P1_10`), analisis K-RAB-07 lanjutan (`P1_11`), audit lintas bulan (`P1_12`) |
| `30eec8a` | **Kode Keputusan 2** (satu commit, dapat di-revert: revert + build ulang = tree `b26de58`, diperiksa) |
| (commit dokumen berikutnya) | `P1_09` §11, `P1_02`, `07_RANCANGAN_TEST_CASE.md`, rujukan tes di `P1_10`/`P1_12` |

### 11.1 Status keputusan

| Keputusan | Status | Alasan |
|---|---|---|
| **1. Alokasi lintas periode (`PERIOD_MISMATCH`)** | **DITANGGUHKAN, tidak diimplementasikan** | Instruksi kebijakan lintas bulan yang datang sesudahnya meminta `PERIOD_MISMATCH` tidak diterapkan "secara membabi buta", kasus "RAB Sep, transaksi Okt" ditandai `NEEDS_POLICY_DECISION`, dan tahap ini dibatasi pada audit/usulan. Aturan Keputusan 1 dirumuskan sebagai opsi U-1(a) di `P1_12` §6. Perilaku sekarang diuji sebagai karakterisasi (RAB-33/34/35), tanpa diubah |
| **2. Kartu Beranda A/B/C** | **Diimplementasikan (sandbox)** | Definisi `P1_10`; fungsi tunggal `rabRingkasanPeriode_` dipakai Beranda, laporan Anggaran, ekspor, dan FCC (`ringkasanPeriode`) |
| **3. K-RAB-07** | **Analisis saja** (`P1_11`) | Rekomendasi berubah dari B (`P1_08`) menjadi **C+B**. Alasannya: hanya BENDAHARA yang dapat menulis, sehingga persetujuan lewat komitmen adalah persetujuan oleh pihak yang sama. BDS03-I05 tidak diubah dan tidak dipaksa lulus |

### 11.2 Hasil suite (`run_all_tests.js p1rab2`, log `_test_logs/p1rab2_*.log`)

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
| **Total** | **400** | **0** | **3** |

Tes baru:

| Tes | Isi |
|---|---|
| RAB-29 | Ukuran A/B/C + rincian; klien = server; C = tile "Pengeluaran (Aktual)" |
| RAB-30 | Kartu Beranda menampilkan ukuran terpisah |
| RAB-31 | Beranda = laporan = ekspor |
| RAB-32 | Satu transaksi dengan dua alokasi periode sama: C bertambah sekali |
| RAB-33 | Karakterisasi alokasi lintas periode: diterima, tampil sebagai "garis periode lain" |
| RAB-34 | RAB Sep + transaksi Okt → TANPA RAB |
| RAB-35 | Karakterisasi tanggal tidak valid (T4) |
| RAB-36 | LPJ bulan berikutnya |
| RAB-37 | Seluruh KPI identik vs `b26de58` (fixture RAB dan default) |

Tidak ada tes yang dihapus atau diubah ekspektasinya.

**Catatan INFO P0A-08** (belum dilaporkan di §5): sejak `44e14f0`, `opSchemaReport` atas header FINAL mencatat `MISSING_SHEET: 1`, yaitu `30_ALOKASI_PENGELUARAN`. Ini diharapkan, karena sheet itu sengaja tidak dibuat otomatis (K-RAB-08). Pada uji live, baris ini akan muncul sampai `opAlokasiPengeluaranSetup` dijalankan di salinan.

### 11.3 Nilai Kartu Beranda pada fixture RAB (Oktober 2026)

| Ukuran | Nilai |
|---|---|
| A Total Anggaran Disetujui | 1.240.000 |
| B Realisasi terhadap Anggaran Disetujui | 1.100.000 |
| Sisa (A − B) | 140.000 |
| C Total Pengeluaran Aktual | 1.650.000 (= tile) |
| C − B | 550.000 = RAB belum disetujui 200.000 + garis periode lain 0 + sisa tidak terpetakan 300.000 + tanpa RAB 50.000 |

Sebelum (`44e14f0`), kartu menampilkan "Realisasi" 1.300.000, yaitu realisasi ke garis periode **berstatus apa pun** (termasuk Konsumsi tanpa status 80.000 dan Listrik diajukan 120.000), dan "Sisa Anggaran" −60.000. Pengeluaran aktual tidak tampil di kartu.

### 11.4 Keterbatasan yang tetap berlaku

- Data FINAL tidak tersedia; Apps Script dan salinan Sheets belum dijalankan.
- Temuan `P1_12` T1–T6, terutama:
  - T1: "Buat Transaksi dari LPJ" dapat menggandakan pengeluaran bila pencairan sudah dicatat;
  - T4: tanggal kalender yang tidak mungkin diterima server.

  Keduanya tidak diperbaiki karena menunggu keputusan U-3/U-4.
- Pada tanggal tidak mungkin seperti `2026-02-30`, periode server (Februari) dapat berbeda dari parser tanggal klien. Kasus ini hanya terjadi pada data T4.

Status: **READY_FOR_INTEGRATION_TEST**.
