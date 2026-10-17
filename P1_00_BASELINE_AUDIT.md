# P1_00 — Baseline Audit Sebelum Implementasi P1

**Tanggal:** 17 Oktober 2026
**Branch kerja:** `p1/implementasi` (didorong ke GitHub sebagai `claude/vigilant-bell-967cih`)
**Basis:** `p0/implementasi` @ `ac206e7`

**Ringkasan status lingkungan:**
- Pekerjaan berupa pemeriksaan kode dan pengujian **sandbox Node** saja.
- Tidak ada akses ke Google Sheets (produksi maupun uji) dan tidak ada proyek Apps Script uji.
- Tidak ada deployment, migrasi data, atau perubahan produksi.

---

## 1. Verifikasi hasil P0 (dilakukan sebelum P1)

### 1.1 Struktur arsip

| Hal | Fakta |
|---|---|
| Berkas yang diterima | `BENDAHARA_V2_REPO.rar` (**RAR v5, bukan ZIP**), 1,7 MB, di root repo GitHub `main` (commit `a11dc08`) |
| Isi | Folder `BENDAHARA_V2_REPO/` dengan direktori `.git` lengkap, 249 entri |
| Ekstraksi | `bsdtar` (libarchive) ke direktori scratch terpisah, bukan ke repo |
| Berkas deploy di root | 15 `.gs` + `Bendahara_V2.html` + `ServerBridge.html/.js` |
| Lainnya | `deps/` (basis build, **bukan** berkas deploy), `_build_tests/` (build + tes sandbox), `_test_logs/`, laporan `P0_00`, `P0_01`, `LAPORAN_TARIF_*` |

### 1.2 Branch, commit, dan integritas

| Pemeriksaan | Hasil |
|---|---|
| Branch `p0/implementasi` ada | **Ya** (HEAD arsip) |
| Commit `ac206e7` ada | **Ya**: `ac206e74832afb1215a204a0e391494c1dd62b73` "Laporan P0_01: catat persetujuan pengguna atas blokir Transfer (GAP-028)" |
| Riwayat | `f894dc6`, `802cbed` (main) → `f61831d`, `33f90b3`, `d4ada79` (P0-A), `02e32fe` (P0-B), `a63e31e` (P0-C), `f0cdd0a` (P0-D), `fa6908c`, `ac206e7`. Sama persis dengan tabel §2 `P0_01` |
| `git fsck --full` | Bersih (tanpa galat) |
| Working tree arsip | Bersih (tidak ada perubahan belum di-commit) |
| Impor ke GitHub | Riwayat digabung ke branch kerja dengan merge `--allow-unrelated-histories`. **SHA tidak berubah**, jadi `ac206e7` kini dapat diverifikasi di GitHub. RAR tetap di root |

### 1.3 Kesesuaian kode dengan laporan P0

| Pemeriksaan | Hasil |
|---|---|
| Rebuild (`node _build_tests/build_all.js`) | 6 langkah OK: apply_central 73, apply_tarif 24, apply_p0_client 29, build_server_engines, apply_p0_server 51, ServerBridge 28 method |
| Berkas hasil rebuild vs commit | **Identik isinya.** Satu-satunya beda: `Bendahara_V2.html` ditulis dengan LF, sedangkan yang di-commit CRLF (MD5 setelah normalisasi `\r` sama: `c7dc6599…`). Penyebabnya `core.autocrlf` di mesin Windows asal |
| Suite sandbox | server_pass2 58/58, e2e_central2 81/81, tarif_server_tests 52/52, tarif_client_tests 40/40, schema_archive_tests 27/27, p0_tests **44 PASS / 0 FAIL / 1 INFO**. Sama dengan `final_*` di `P0_01` §6 |
| Catatan reproduksi | P0D-04/05/06 dan P0U-02/03 membaca baseline lewat `git show main:Bendahara_V2.html`. Di clone baru tanpa branch lokal `main`, tes itu FAIL ("baseline main tidak terbaca"). Di repo GitHub, `main` hanya berisi RAR. **Diperbaiki di P1**: tes mencoba `main`, lalu `802cbed` (commit main asli) |

**Kesimpulan verifikasi:** Kode di `ac206e7` sesuai dengan yang dilaporkan `P0_01`. Klaim di laporan itu yang dapat diuji di sandbox **terbukti ulang**.

**Status P0 tetap BELUM SELESAI.** Semua TC P0 berstatus BLOCKED untuk uji live (Apps Script + Sheets uji), sesuai `P0_01` §12. P1 dibangun di atas P0 yang **belum terbukti di lingkungan nyata**. Setiap risiko residual P0 (`P0_01` §9) diwarisi P1.

---

## 2. Hambatan pengujian Apps Script (eksplisit)

| # | Hambatan | Akibat |
|---|---|---|
| H1 | Tidak ada proyek Apps Script uji, `.clasp.json`, `appsscript.json`, maupun kredensial `clasp` (`~/.clasprc.json` tidak ada; `clasp` tidak terpasang) | Kode tidak dapat di-push atau dijalankan di Apps Script |
| H2 | Tidak ada salinan spreadsheet uji. Konektor Google Sheets/Drive di sesi ini **tidak dipakai** untuk menulis: tidak ada spreadsheet uji yang teridentifikasi dan memisahkannya dari produksi tidak dapat dibuktikan | Uji live = **BLOCKED** |
| H3 | Sandbox Node (`srv_env.js`) memalsukan SpreadsheetApp, LockService, Session, DriveApp, dan Utilities | Tidak menguji tipe sel nyata, kuota, batas waktu eksekusi 6 menit, LockService lintas eksekusi paralel, atau perilaku `setValues` parsial |
| H4 | Satu eksekusi Apps Script berjalan single-threaded | Race antar-permintaan nyata (konflik bersamaan, P1-F) hanya dapat disimulasikan berurutan |
| H5 | `Session.getActiveUser()` pada deployment nyata (GAP-005) belum diverifikasi | Identitas aktor di audit P1 bergantung pada temuan yang belum diuji ini |
| H6 | Isi proyek Apps Script produksi tidak diketahui (bisa memuat `MigrationOneTime.gs`, fungsi publik lama, dll.) | Repo ≠ live sampai `clasp pull` read-only dilakukan pengguna |
| H7 | Dokumen sumber **daftar GAP** dan **rancangan test case audit** (mis. `08_RENCANA_IMPLEMENTASI_BERTAHAP.md`, audit 03) **tidak ada** di arsip maupun di Google Drive yang dapat dicari | Nomor GAP untuk butir P1 (kecuali GAP-028) dan ID TC asli **tidak dapat diverifikasi**. ID `TC-P1-*` di bawah bersifat **sementara** dan harus dipetakan ke dokumen asli |

**Konsekuensi:** Kriteria lulus P1 dibagi dua: **(S)** lulus sandbox dan **(L)** lulus live. Selama H1/H2 belum teratasi, semua kriteria **(L)** berstatus BLOCKED. P1 **tidak boleh** dinyatakan selesai hanya karena (S) lulus.

---

## 3. Batasan yang mengikat P1

- UI dipertahankan, begitu juga 6 KPI induk, 31 indikator, rumus, bobot, target, dan data historis.
  - Uji regresi P0D-04/05/06 dan P0U-02/03 wajib tetap PASS.
- Tanpa migrasi data, tanpa perubahan saldo awal.
  - Tidak ada sheet atau kolom baru yang **dibuat otomatis**.
  - Status penguncian periode memakai format penyimpanan yang **sudah ada** (`blob.periodClosing.*` di `15_SETTINGS`).
- Tidak ada perubahan status pembayaran tanpa bukti dan persetujuan.
- **Transfer antar-akun tetap diblokir** (GAP-028). P1 tidak menambah jalur server transfer apa pun.
- Hanya lingkungan uji. Tidak ada deployment atau perubahan produksi tanpa persetujuan eksplisit.

---

## 4. Temuan baseline per area P1 (dibuktikan dengan eksekusi sandbox)

Bukti: `_test_logs/p1base_p1_tests.log`. Suite `p1_tests.js` menuliskan perilaku **yang diharapkan setelah P1**; FAIL di baseline = celah terbukti.

**Hasil baseline: PASS=3, FAIL=37.** Tiga yang PASS:
- P1L-02: periode terbuka tetap dapat ditulis.
- P1A-06: replay create idempoten.
- P1T-01: Transfer diblokir.

Ketiganya adalah regresi yang wajib dipertahankan.

### 4.1 P1-A — Penguncian periode

**Fakta kode:**
- `closePeriode` / `reopenPeriode` (`Bendahara_V2.html:5757-5771`) hanya mengubah blob klien `periodClosing`. Blob itu dikirim lewat `opSettingsUpsert` sebagai setting biasa.
- **Server tidak pernah membaca status closing.**
- Reopen tidak butuh alasan, tidak ada kontrol role selain BENDAHARA, dan dapat dilakukan lewat setting generik.

| Bukti | Hasil baseline |
|---|---|
| P1L-01 | Pengeluaran bertanggal di periode CLOSED → `SUCCESS` |
| P1L-03 | Ubah transaksi periode CLOSED dan memindahkan tanggal ke periode CLOSED → `SUCCESS` |
| P1L-04 | Alokasi atas transaksi periode CLOSED → `SUCCESS` |
| P1L-05 | Arsip (reversal) transaksi periode CLOSED → `SUCCESS` |
| P1L-06, P1L-10 | Mutasi bank, rekonsiliasi, dan LPJ periode CLOSED → `CREATED` |
| P1L-07 | Blob closing ditimpa lewat `opSettingsUpsert` → `SUCCESS` (reopen tanpa jejak) |
| P1L-08/09/11 | Tidak ada API server untuk close/reopen; klien hanya memanggil `opSettingsUpsert` |

**Berkas/fungsi terdampak:**
- `PeriodLock.gs` (baru).
- `TransactionEngine.gs` (generate; lewat langkah build `apply_p1_server.js`): `createTransactionWithAllocations_`, `createAllocation_`, `createBankMutation_`, `updateTransaction_`.
- `RecordEngine.gs`: `opRecordBatchLocked_`, `opArchiveTransaction`, `opArchiveAllocation`, `opSettingsUpsert`.
- `Bendahara_V2.html` (generate; lewat `apply_p1_client.js`): `closePeriode`, `reopenPeriode`.
- `_build_tests/build_bridge.js`: method baru.

**Dependensi P0:**
- `withLock_`, `opGate_`, `opAuditBulk_` dan pemulihan audit (P0-B).
- Pembacaan settings berbasis nama (`sgModel_`, P0-A).
- Fungsi engine privat (P0-C), sehingga satu-satunya jalan masuk adalah `op*`.

**TC:** TC-P1-LOCK-01 (tulis di periode tertutup ditolak), TC-P1-LOCK-02 (ubah/arsip/alokasi/staging ditolak), TC-P1-LOCK-03 (close/reopen hanya lewat server, berotorisasi, beraudit, reopen wajib alasan).

**Kriteria lulus:**
- (S) P1L-01..11 PASS.
- (S) Kode galat `PERIOD_LOCKED` diperiksa **di dalam lock** yang sama dengan penulisan.
- (L) Diulang di Apps Script uji.

### 4.2 P1-B — Audit log atomik dan idempotensi

**Fakta kode:**
- Engine menulis audit `CREATE_TRANSACTION` lalu `CREATE_ALLOCATION` dengan `auditPush_` terpisah, **sebelum** catatan idempotensi.
- Bila langkah berikutnya gagal, baris bisnis di-rollback, tetapi audit yang sudah tertulis **tetap ada**. Akibatnya log audit menyatakan transaksi dibuat padahal tidak (`TransactionEngine.gs:535-563`).
- Baris `API_*` (aktor + role) ditulis di lock terpisah. Bila gagal, hasilnya "sukses + `auditWarning`" (`OperationalAPI.gs:83-123`).
- `opSchemaApply` menambah kolom walau audit gagal (`AdminAPI.gs:97-119`).
- `updateTransaction_` tidak punya idempotensi `clientRequestId`. Replay patch lama menimpa perubahan yang lebih baru.

| Bukti | Hasil baseline |
|---|---|
| P1A-01 | Audit kedua gagal → transaksi di-rollback, audit `CREATE_TRANSACTION` **tertinggal** |
| P1A-02 | Catatan idempotensi gagal → rollback, audit `CREATE_TRANSACTION` tertinggal |
| P1A-03 | Baris `API_CREATE_EXPENSE` gagal → `ok:true` + `ACTOR_ROLE_AUDIT_FAILED` |
| P1A-04 | Replay `clientRequestId` lama → catatan kembali ke "A" (menimpa "B") |
| P1A-05 | Audit gagal → 3 kolom tetap ditambahkan + `auditWarning` |

**Berkas/fungsi terdampak:**
- `TransactionEngine.gs` (via build): urutan langkah 6–7 create transaksi/alokasi/mutasi, audit satu kali tulis (`sgAppendMany_`), baris API dalam batch yang sama, idempotensi update, `RESULT_TYPE_SHEET`.
- `OperationalAPI.gs`: `opEngineWrite_`.
- `AdminAPI.gs`: `opSchemaApply`.

**Dependensi P0:**
- `ENGINE_ACTOR_` (P0-B).
- `sgAppendMany_` dan `sgUndoAppend_` (P0-A/B).
- `deleteIdempotencyByClientRequestId_` (rollback).

**TC:** TC-P1-AUD-01 (tidak ada audit tanpa perubahan, tidak ada perubahan tanpa audit), TC-P1-AUD-02 (idempotensi update), TC-TRX-02 (regresi).

**Kriteria lulus:**
- (S) P1A-01..06 PASS.
- (S) Tidak ada lagi `auditWarning` di jalur transaksi.
- (L) Diulang di Apps Script uji, termasuk percobaan kegagalan kuota.

### 4.3 P1-C — Rekonsiliasi bank

**Fakta kode:**
- `submitRekonsiliasi` (`Bendahara_V2.html:5339`) menghitung `saldoSistem` di **klien**. Server menerima `saldoSistem`, `selisih`, dan `status` apa adanya lewat `opRecordBatch('rekonsiliasi')`.
- `linkMutasiToTransaksi` / `createTransaksiFromMutasi` (`:4645-4672`) mengubah `11_MUTASI_BANK.status/transaksiId` lewat jalur generik. Tidak ada pemeriksaan nominal, keberadaan transaksi, atau pencocokan ganda.

| Bukti | Hasil baseline |
|---|---|
| P1R-01/03/04 | Tidak ada API rekonsiliasi server |
| P1R-02 | Rekonsiliasi rekaan (`saldoSistem`=1, `SELESAI`) → `CREATED` |
| P1R-05 | Tidak ada API pencocokan tervalidasi |
| P1R-06 | Mutasi 99.999 dicocokkan ke transaksi 200.000 lewat jalur generik → `UPDATED` |
| P1R-07 | Mutasi `DIPROSES` ke transaksi yang tidak ada → `CREATED` |

**Berkas/fungsi terdampak:**
- `ReconEngine.gs` (baru): `opReconcileAccount`, `opMatchMutasi`.
- `RecordGuard.gs` (baru): validasi per-record yang dipanggil `opRecordBatchLocked_`.
- `Bendahara_V2.html` (via build): `submitRekonsiliasi`, `linkMutasiToTransaksi`, `createTransaksiFromMutasi`.

**Dependensi P0:**
- `readTrxRows_` berbasis nama + tanggal ternormalisasi (P0-A/B).
- Transaksi arsip dikecualikan.
- Audit wajib dengan pemulihan (P0-B).

**TC:** TC-P1-REK-01 (saldo sistem dihitung server), TC-P1-REK-02 (idempoten), TC-P1-REK-03 (pencocokan mutasi tervalidasi).

**Kriteria lulus:**
- (S) P1R-01..07 PASS.
- (S) Rumus saldo sistem server = rumus `akunSaldo` klien (saldo awal + penerimaan − pengeluaran, tanpa arsip), dengan batas **akhir periode**. Lihat keputusan K-P1-03.
- (L) Diulang di Apps Script uji dengan salinan data.

### 4.4 P1-D — Pemetaan realisasi pengeluaran ke RAB

**Fakta kode:**
- Realisasi RAB dipetakan lewat kecocokan **teks** kategori:
  - Klien `realisasiForProgram` dan `anggaranRabFor`: `program === kategori`.
  - Server/klien `fccBudgetVsActual_`: kategori dinormalisasi + subkategori + unit + periode.
- `19_LPJ` (anotasi realisasi per transaksi) dan `09_KOMITMEN.rabId` ditulis tanpa validasi referensi atau nominal.

| Bukti | Hasil baseline |
|---|---|
| P1D-01 | LPJ ke transaksi yang tidak ada → `CREATED` |
| P1D-02 | LPJ 30.000 + 30.000 atas pengeluaran 50.000 → keduanya `CREATED` (realisasi ganda) |
| P1D-03 | LPJ atas PENERIMAAN → `CREATED` |
| P1D-04 | Komitmen ke `rabId` yang tidak ada → `CREATED` |
| P1D-05 | Tidak ada laporan pemetaan per transaksi ↔ baris RAB; pengeluaran tanpa RAB tidak teridentifikasi per transaksi |

**Berkas/fungsi terdampak:**
- `RabMapping.gs` (baru): `opRabRealization`, read-only.
- `RecordGuard.gs`: aturan `lpj` dan `komitmen`.
- **`FinanceEngine.gs` / `fccBudgetVsActual_` dan rumus KPI BDS03 TIDAK diubah.** Pemetaan baru diuji diferensial terhadap `fccBudgetVsActual_`.

**Dependensi P0:** `sgRowsChecked_` (kolom wajib, P0-A).

**TC:** TC-P1-RAB-01 (integritas LPJ), TC-P1-RAB-02 (integritas `rabId` komitmen), TC-P1-RAB-03 (pemetaan per transaksi = angka FCC).

**Kriteria lulus:**
- (S) P1D-01..05 PASS.
- (S) Angka FCC dan KPI tidak berubah (P0D-04/05/06 tetap PASS).
- (L) Pada salinan data FINAL: jumlah transaksi tanpa RAB dan LPJ bermasalah dilaporkan, **tanpa** memperbaiki data.

### 4.5 P1-E — Pengelolaan bukti transaksi

**Fakta kode:**
- `submitBukti` (`Bendahara_V2.html:4505`) membuat baris `10_BUKTI` **walau tanpa file** (`fileRef:''`).
- Untuk transaksi server, fungsi itu langsung mengubah status PENGELUARAN `TERCATAT` → **`SELESAI`**, yaitu status berubah tanpa bukti nyata dan tanpa persetujuan.
- Server menerima baris bukti tanpa file, mengizinkan `driveFileId` dikosongkan, dan menerima unggahan ke transaksi yang tidak ada.
- `updateTransaction_` mengizinkan status `SELESAI` tanpa bukti.
- Indikator BDS05 menghitung `buktiId` dari baris `10_BUKTI` yang tertaut (`Bendahara_V2.html:7795-7798`), sehingga bukti kosong ikut menaikkan skor.

| Bukti | Hasil baseline |
|---|---|
| P1E-01 | Bukti tanpa file → `CREATED` |
| P1E-02 | `driveFileId` bukti terunggah dikosongkan → `UPDATED` |
| P1E-03 | Unggah bukti ke transaksi yang tidak ada → `SUCCESS` |
| P1E-04 | `status: SELESAI` tanpa bukti → `SUCCESS` |
| P1E-05 (klien) | "Lampirkan Bukti" tanpa file → transaksi server menjadi `SELESAI`, 1 baris bukti kosong |

**Berkas/fungsi terdampak:**
- `RecordGuard.gs`: aturan `bukti`.
- `BuktiDrive.gs`: `opUploadBukti`.
- `TransactionEngine.gs` (via build): `updateTransaction_`, syarat bukti untuk `SELESAI`.
- `Bendahara_V2.html` (via build): `submitBukti`, `submitDokumen` (bukti wajib berfile; tidak ada perubahan status otomatis).

**Dependensi P0:**
- `opUploadBukti` + rollback trash (P0-B).
- Fasad koleksi `dokumen` → `10_BUKTI` (P0).

**TC:** TC-P1-BKT-01 (bukti wajib berfile, tak dapat diubah, referensi valid), TC-P1-BKT-02 (status SELESAI hanya dengan bukti dan aksi eksplisit).

**Kriteria lulus:**
- (S) P1E-01..05 PASS.
- (S) Baris bukti historis tidak diubah atau dihapus. Hitungan KPI atas data historis identik (P0D-04).
- (L) Unggah Drive nyata di proyek uji (scope Drive, ukuran, trash saat rollback).

### 4.6 P1-F — Deteksi konflik perubahan bersamaan

**Fakta kode:**
- `centralPatchTransaksi` / `centralPushPatch_` (`Bendahara_V2.html:8025, 7918`) hanya mengirim field yang berubah. `ccSave_` / `ccPush_` (`:8176, 8236`) mengirim baris penuh. `opMasterUpsert` tanpa versi.
- Akibatnya: **penulisan terakhir menang**. Perubahan pengguna lain tertimpa diam-diam.
- `opRecordBatch` juga mengizinkan upsert atas baris yang **sudah diarsipkan**.

| Bukti | Hasil baseline |
|---|---|
| P1C-01 | Tidak ada mekanisme ekspektasi (`_expect` ditolak sebagai `UNKNOWN_FIELD`) |
| P1C-02 | Upsert anggaran atas nilai yang sudah berubah → `UPDATED` |
| P1C-03 | Upsert baris terarsip → `UPDATED` |
| P1C-04 | Master tertimpa → `SUCCESS` |
| P1C-05 (klien) | Catatan dari pengguna lain tertimpa diam-diam: "Tersimpan di server" |

**Berkas/fungsi terdampak:**
- Server:
  - `TransactionEngine.gs` (via build): `updateTransaction_` + `_expect`.
  - `RecordEngine.gs`: `opRecordBatchLocked_` + `expect` + penolakan baris arsip.
  - `OperationalAPI.gs`: `opMasterUpsert` + argumen `expect`.
- Klien (via build): `centralPatchTransaksi`, `centralPushPatch_`, `ccSave_`, `ccPush_`, `centralMasterSave`, `CC_PERMANENT_`.

**Desain:**
- Optimistic concurrency **tanpa kolom versi baru** (tanpa migrasi).
- Klien mengirim nilai field yang ia lihat sebelum mengubah. Server membandingkan nilai itu di dalam lock; bila berbeda → `CONFLICT` dan data tidak diubah.
- Panggilan tanpa ekspektasi tetap berperilaku lama (kompatibel).

**Dependensi P0:** pemetaan galat permanen klien (`CC_PERMANENT_`, `CENTRAL_RETRYABLE_`), overlay `_blocked` (P0-B).

**TC:** TC-P1-KON-01 (konflik terdeteksi, data tidak ditimpa), TC-P1-KON-02 (baris arsip tidak dapat di-upsert).

**Kriteria lulus:**
- (S) P1C-01..05 PASS.
- (L) Dua sesi browser nyata di deployment uji.

### 4.7 GAP-028 — Transfer antar-akun

**Fakta:** `postTransaksi` menolak `TRANSFER` (P0). Tidak ada fungsi publik server bertema transfer.

**Bukti:** P1T-01 **PASS di baseline**, dan wajib tetap PASS.

**P1 tidak membuka jalur ini.** Pembukaannya butuh desain write-door server yang tervalidasi (dua kaki debit/kredit atomik, akun Kas/Bank, periode terkunci, audit) beserta persetujuan terpisah.

---

## 5. Keputusan yang dibutuhkan dari pengguna (tidak ditebak)

Default yang dipakai di implementasi adalah opsi **paling konservatif**. Semua dapat diubah tanpa migrasi.

| ID | Pertanyaan | Default P1 |
|---|---|---|
| K-P1-01 | Data apa yang terkunci saat periode CLOSED? | Transaksi (buat/ubah/arsip/alokasi), mutasi bank (`tanggal`), rekonsiliasi (`periode`), LPJ (`tanggal`), anggaran (`periode`), komitmen (`tanggal`). **Tidak dikunci:** bukti (lampiran susulan), laporan, snapshot KPI, kewajiban (periode tagihan ≠ periode akuntansi), RKAT tahunan |
| K-P1-02 | Siapa yang boleh reopen, dan apakah perlu persetujuan kedua (Kepala Sekolah/Yayasan)? | BENDAHARA saja, **alasan wajib (≥10 karakter)**, dicatat di audit. Persetujuan ganda **belum** diterapkan |
| K-P1-03 | `saldoSistem` rekonsiliasi dihitung s.d. akhir periode, atau s.d. hari ini? | Klien lama memakai s.d. hari ini (`akunSaldo(akunId)` tanpa `asOf`). P1 memakai **s.d. akhir periode** (benar secara akuntansi). Hasilnya sama bila tidak ada transaksi setelah periode |
| K-P1-04 | Apakah pencocokan mutasi wajib ke transaksi akun jenis Bank? | **Tidak diblokir.** Nominal wajib sama (selisih < 1) dan tanpa pencocokan ganda |
| K-P1-05 | Apakah status `SELESAI` pada PENERIMAAN juga wajib bukti? | Ya. Transisi **ke** `SELESAI` (kedua jenis) wajib minimal satu bukti berfile. Data historis yang sudah `SELESAI` tidak diubah |
| K-P1-06 | Apakah baris bukti historis tanpa file tetap dihitung di KPI BDS05? | Ya, **tidak diubah** (melindungi data historis dan KPI). Hanya baris **baru** yang wajib berfile |

---

## 6. Rencana subfase dan urutan

| Urutan | Subfase | Berkas |
|---|---|---|
| 1 | P1-B Audit atomik & idempotensi | `apply_p1_server.js` (→ TransactionEngine), `OperationalAPI.gs`, `AdminAPI.gs` |
| 2 | P1-A Penguncian periode | `PeriodLock.gs`, `RecordEngine.gs`, `apply_p1_server.js`, `apply_p1_client.js` |
| 3 | P1-F Konflik | `RecordEngine.gs`, `OperationalAPI.gs`, `apply_p1_server.js`, `apply_p1_client.js` |
| 4 | P1-E Bukti | `RecordGuard.gs`, `BuktiDrive.gs`, `apply_p1_server.js`, `apply_p1_client.js` |
| 5 | P1-C Rekonsiliasi | `ReconEngine.gs`, `RecordGuard.gs`, `apply_p1_client.js` |
| 6 | P1-D RAB | `RabMapping.gs`, `RecordGuard.gs` |

**Aturan build tetap:** berkas generate (`Bendahara_V2.html`, `TransactionEngine.gs`, `ServerBridge.*`) tidak diedit tangan. Urutan build baru:

```
apply_central → apply_tarif → apply_p0_client → apply_p1_client → build_server_engines → apply_p0_server → apply_p1_server → build_bridge
```

**Perubahan infrastruktur tes yang dilakukan sebelum kode P1** (tidak melonggarkan tes):
- `srv_env.js`: `state.failSetValuesSkip`, yaitu kegagalan tulis pada tulis ke-N untuk menguji audit parsial.
- `p0_tests.js`: referensi baseline `main` → fallback `802cbed`.
- `run_all_tests.js`: menambah `p1_tests`.

## 7. Baseline tes (dijalankan, sebelum kode P1)

| Suite | Hasil | Log |
|---|---|---|
| server_pass2 | PASS=58 FAIL=0 | `_test_logs/p1base_server_pass2.log` |
| e2e_central2 | PASS=81 FAIL=0 | `_test_logs/p1base_e2e_central2.log` |
| tarif_server_tests | PASS=52 FAIL=0 | `_test_logs/p1base_tarif_server_tests.log` |
| tarif_client_tests | PASS=40 FAIL=0 | `_test_logs/p1base_tarif_client_tests.log` |
| schema_archive_tests | PASS=27 FAIL=0 | `_test_logs/p1base_schema_archive_tests.log` |
| p0_tests | PASS=44 FAIL=0 INFO=1 | `_test_logs/p1base_p0_tests.log` |
| **p1_tests (baru)** | **PASS=3 FAIL=37** | `_test_logs/p1base_p1_tests.log` |
