# P1_01 — Laporan Implementasi P1 Bendahara V2

**Tanggal:** 17 Oktober 2026
**Repositori:** `apapunitubahagia-lang/bendaharaTKMI`
**Branch:**
- Kerja lokal: `p1/implementasi`.
- Didorong ke GitHub sebagai `claude/vigilant-bell-967cih`.
- Basis: `p0/implementasi` @ `ac206e7`.

## 1. Ringkasan eksekutif

**Status P1: BELUM SELESAI.**

- Kode untuk keenam prioritas P1 sudah diterapkan dan **lulus di sandbox Node** (42/42).
- Sebelum perbaikan, di kode baseline hasilnya 3/42. Ketiga yang lulus adalah regresi yang wajib dipertahankan.
- **Belum ada satu pun yang diuji di Apps Script dan Google Sheets sungguhan.** Uji live = BLOCKED, sama dengan P0 (hambatan H1–H7 di `P1_00` §2).
- **P0 juga masih BELUM SELESAI** (uji live BLOCKED). P1 dibangun di atas P0 yang belum terbukti di lingkungan nyata.
- **Produksi tidak disentuh.** Tidak ada deployment, migrasi data, perubahan saldo awal, atau perubahan status pembayaran pada data.

| Subfase | Inti perubahan |
|---|---|
| **P1-A** Penguncian periode | Closing **ditegakkan server**. Periode CLOSED menolak buat/ubah/arsip transaksi, alokasi, mutasi, rekonsiliasi, LPJ, anggaran, dan komitmen (`PERIOD_LOCKED`, diperiksa di dalam lock). Close/reopen hanya lewat `opClosePeriod`/`opReopenPeriod`; reopen **wajib alasan**; keduanya diaudit. Status disimpan di blob `periodClosing` yang sudah ada, jadi **tanpa migrasi** dan riwayat closing lama langsung berlaku |
| **P1-B** Audit atomik & idempotensi | Audit engine ditulis **satu kali append di langkah terakhir** (setelah catatan idempotensi) bersama jejak aktor/role. Tidak ada lagi audit parsial maupun "sukses + `auditWarning`" di jalur transaksi. `updateTransaction_` kini idempoten lewat `clientRequestId`. `opSchemaApply` gagal tertutup bila audit gagal |
| **P1-C** Rekonsiliasi bank | `opReconcileAccount`: saldo sistem, selisih, dan status **dihitung server**. `opMatchMutasi`: nominal harus sama, transaksi aktif, tanpa pencocokan ganda. Jalur generik untuk rekonsiliasi dan status mutasi ditolak |
| **P1-D** Realisasi → RAB | `opRabRealization` (read-only) memetakan tiap pengeluaran ke baris RAB dengan aturan **identik** `fccBudgetVsActual_` (diuji diferensial) dan mendaftar pengeluaran tanpa RAB serta masalah LPJ. LPJ wajib menunjuk PENGELUARAN aktif, total LPJ ≤ nominal transaksi. `rabId` komitmen wajib valid. **Rumus FCC/KPI tidak diubah** |
| **P1-E** Bukti transaksi | Bukti baru **wajib berfile**. File/tautan yang sudah tercatat tidak dapat diubah atau dikosongkan. Unggahan ke transaksi tak dikenal ditolak. Status `SELESAI` **wajib bukti berfile**. Klien **tidak lagi mengubah status otomatis** saat melampirkan bukti |
| **P1-F** Konflik bersamaan | Optimistic concurrency **tanpa kolom versi baru**: klien mengirim nilai yang ia lihat (`_expect`/`expect`). Bila nilai server sudah berbeda → `CONFLICT`, data tidak ditimpa. Berlaku di patch transaksi, `opRecordBatch`, dan `opMasterUpsert`. Baris terarsip tidak dapat di-upsert |
| GAP-028 | **Transfer antar-akun tetap diblokir.** Tidak ada fungsi server bertema transfer (P1T-01) |

## 2. Commit

| Commit | Isi |
|---|---|
| `a11dc08` | (GitHub `main`) unggahan `BENDAHARA_V2_REPO.rar` oleh pengguna |
| `4d6957a` | Impor riwayat Git dari arsip. SHA P0 tidak berubah (`ac206e7` dkk.), RAR tetap di root |
| `20d9e55` | `P1_00_BASELINE_AUDIT.md` + `p1_tests.js` (baseline 3 PASS / 37 FAIL) + infrastruktur tes |
| `3f9548a` | Implementasi P1-A..F |
| (commit laporan ini) | `P1_01_IMPLEMENTATION_REPORT.md` + log baseline suite final |

Diff dapat ditinjau langsung. Build kini mempertahankan akhir baris berkas generate, sehingga `Bendahara_V2.html` hanya menunjukkan ±150 baris perubahan nyata:

```bash
git diff 20d9e55 3f9548a --stat
```

## 3. Berkas yang diubah

**Aturan build dipertahankan:** berkas generate tidak diedit tangan.

```
apply_central → apply_tarif → apply_p0_client → apply_p1_client → build_server_engines → apply_p0_server → apply_p1_server → build_bridge
```

Build deterministik (dua kali build → MD5 identik).

| Berkas | Jenis | Perubahan |
|---|---|---|
| `PeriodLock.gs` (baru) | Tulisan tangan | `plGuard_`, `opPeriodLockStatus`, `opClosePeriod`, `opReopenPeriod`. Blob rusak → gagal tertutup (`PERIOD_STATE_INVALID`) |
| `RecordGuard.gs` (baru) | Tulisan tangan | Aturan per-record untuk `opRecordBatch`: kunci periode, rekonsiliasi lewat API khusus, mutasi, LPJ, komitmen, bukti. `rgTrxHasEvidence_` |
| `ReconEngine.gs` (baru) | Tulisan tangan | `opReconcileAccount`, `opMatchMutasi`, `rcCheckLink_` |
| `RabMapping.gs` (baru) | Tulisan tangan | `opRabRealization` (read-only) |
| `RecordEngine.gs` | Tulisan tangan | Guard + konflik + tolak upsert baris arsip di `opRecordBatchLocked_`. Kunci periode di `opArchiveTransaction`/`opArchiveAllocation`. `opSettingsUpsert` menolak key `blob.periodClosing.*` |
| `OperationalAPI.gs` | Tulisan tangan | `ENGINE_API_`: baris API_* ditulis engine dalam append audit yang sama. `opMasterUpsert(..., expect)` |
| `AdminAPI.gs` | Tulisan tangan | `opSchemaApply`: audit dulu, lalu kolom; gagal → header dikosongkan kembali |
| `BuktiDrive.gs` | Tulisan tangan | `opUploadBukti`: transaksi wajib ada dan aktif, sebelum file dibuat |
| `TransactionEngine.gs` | Generate (`apply_p1_server.js`) | `engineAuditBatch_`. Urutan idempotensi → audit di create transaksi/alokasi/mutasi. Kunci periode di dalam lock. `updateTransaction_` ditulis ulang (idempotensi, `_expect`, kunci periode, syarat bukti). `RESULT_TYPE_SHEET.transactionUpdate` |
| `Bendahara_V2.html` | Generate (`apply_p1_client.js`) | Lihat §5 |
| `ServerBridge.js/.html` | Generate (`build_bridge.js`) | +6 method (`opPeriodLockStatus`, `opClosePeriod`, `opReopenPeriod`, `opReconcileAccount`, `opMatchMutasi`, `opRabRealization`). `opMasterUpsert` +`expect` |
| `_build_tests/*` | Tes/build | Lihat §6.3 |

**Fungsi publik baru:** enam fungsi `op*` di atas, semuanya lewat `opGate_`.
- Tulis: BENDAHARA saja.
- Baca: 4 role baca.

Tidak ada fungsi publik baru tanpa gerbang (diperiksa otomatis; P1S-01).

## 4. Fungsi dan dampaknya (server)

| Fungsi | Perilaku baru | Kode galat baru |
|---|---|---|
| `createTransactionWithAllocations_`, `createAllocation_`, `createBankMutation_` | Periode tertutup ditolak di dalam lock. Idempotensi dicatat **sebelum** audit; audit satu append di akhir. Audit gagal → baris bisnis **dan** catatan idempotensi di-rollback | `PERIOD_LOCKED` |
| `updateTransaction_` | `clientRequestId` → replay tidak diterapkan ulang. `_expect` → `CONFLICT`. Tanggal lama/baru di periode tertutup → ditolak. `SELESAI` butuh bukti berfile | `CONFLICT`, `PERIOD_LOCKED`, `EVIDENCE_REQUIRED`, `IDEMPOTENCY_MISMATCH` |
| `opEngineWrite_` | Baris `API_*` ikut append audit engine. Jalur cadangan hanya untuk engine baru di masa depan | — |
| `opRecordBatch` | Per-op: `ARCHIVED`, `CONFLICT`, ditambah aturan RecordGuard. Op lain di batch tetap diproses (perilaku batch tidak berubah) | `ARCHIVED`, `CONFLICT`, `USE_DEDICATED_API`, `MATCH_VIA_API_REQUIRED`, `MUTASI_LOCKED`, `INVALID_TRANSACTION`, `LPJ_EXCEEDS_TRANSACTION`, `INVALID_RAB`, `BUKTI_FILE_REQUIRED`, `BUKTI_IMMUTABLE` |
| `opArchiveTransaction`, `opArchiveAllocation` | Reversal di periode tertutup ditolak | `PERIOD_LOCKED` |
| `opSettingsUpsert` | Key closing ditolak | `PERIOD_LOCK_API_REQUIRED` |
| `opMasterUpsert` | Argumen ke-4 `expect` (opsional) | `CONFLICT` |
| `opSchemaApply` | Audit gagal → tidak ada kolom yang ditambah | `AUDIT_FAILED` |
| `opUploadBukti` | Transaksi wajib ada dan aktif | `INVALID_TRANSACTION` |
| `opReconcileAccount` | Saldo awal + PENERIMAAN − PENGELUARAN non-arsip s.d. akhir periode. Selisih ≠ 0 wajib catatan. Idempoten | `PERIOD_LOCKED`, `INVALID_ACCOUNT` |
| `opMatchMutasi` | Lihat §1 | `MATCH_NOMINAL_MISMATCH`, `DOUBLE_MATCH`, `ALREADY_MATCHED`, `ARCHIVED` |

## 5. Perubahan klien dan dampak pada pengguna (disengaja)

Markup/CSS di luar `<script>` **identik** dengan baseline (P0U-02). 754 fungsi baseline tetap ada (P0U-03). Definisi dan rumus KPI identik (P0D-04/05/06).

| Fungsi | Perubahan | Dampak pengguna |
|---|---|---|
| `closePeriode` | Memanggil `opClosePeriod` | "Periode ditutup (dikonfirmasi server)". Tanpa server → galat, tidak disimpan |
| `reopenPeriode` + `submitReopenPeriode` (baru) | Modal alasan (wajib ≥10 karakter) → `opReopenPeriod` | **Langkah baru:** isi alasan sebelum membuka kembali |
| `ccBlobPut_`, `centralSettingsJobs_` | Blob closing tidak lagi diantrekan. Antrean lama dibuang agar tidak menggagalkan setting lain (P1L-12) | Reset data / restore backup **tidak** mengubah status closing |
| `submitRekonsiliasi` | `opReconcileAccount`; toast memuat selisih dan saldo sistem dari server | Pesan menyebut saldo sistem server (K-P1-03) |
| `linkMutasiToTransaksi`, `createTransaksiFromMutasi` | `opMatchMutasi`. Mutasi dicocokkan setelah transaksi baru dikonfirmasi server (antrean `central_pending_mutmatch`) | Pencocokan yang tidak valid ditolak dengan pesan jelas |
| `submitBukti`, `openLampirkanBukti` | File **wajib**. **Tidak ada** perubahan status otomatis | Label "File bukti (wajib…)". Status diubah lewat "Tandai Direkonsiliasi" (server menuntut bukti) |
| `submitDokumen` | File wajib | Dokumen tanpa file tidak dapat disimpan |
| `centralPatchTransaksi`, `centralPushPatch_` | `_expect` (nilai server yang dilihat) + `clientRequestId` per perubahan | Bila diubah pengguna lain: "GAGAL menyimpan … [CONFLICT]", data server tidak ditimpa |
| `ccSave_`, `ccPush_` | `expect` untuk field yang diubah (kecuali koleksi JSON/kustom) | Sama, untuk anggaran/komitmen/mutasi/LPJ/dll. |
| `CC_PERMANENT_` | Kode galat P1 tidak diulang tanpa henti | Tampil di hitungan "gagal sinkron" |

## 6. Test case: status, hasil aktual, bukti

- **Sandbox** = dijalankan sungguhan di Node (`srv_env.js`/`client_env.js`).
- **Live** = Apps Script + Sheets uji. **Seluruh kolom live BLOCKED.**
- ID TC `TC-P1-*` bersifat **sementara** (H7): dokumen rancangan TC audit asli tidak tersedia.
- Bukti:
  - Baseline: `_test_logs/p1base_suitefinal_p1_tests.log` (suite final dijalankan pada kode `20d9e55`) dan `_test_logs/p1base_p1_tests.log` (saat `P1_00`, 40 tes).
  - Akhir: `_test_logs/p1final_*.log`.

### 6.1 Suite P1 (42 tes)

| TC | Cek | Baseline | Sandbox | Live | Hasil aktual (sandbox) |
|---|---|---|---|---|---|
| TC-P1-LOCK-01 | P1L-01, 02 | FAIL, PASS | PASS | BLOCKED | Pengeluaran Oktober saat Oktober CLOSED → `PERIOD_LOCKED`. Periode terbuka tetap ditulis |
| TC-P1-LOCK-02 | P1L-03..06, 10 | FAIL | PASS | BLOCKED | Ubah, pindah tanggal, alokasi, arsip, mutasi, rekonsiliasi, dan LPJ pada September CLOSED → `PERIOD_LOCKED`; baris tidak berubah |
| TC-P1-LOCK-03 | P1L-07..09, 11, 12 | FAIL | PASS | BLOCKED | Setting generik → `PERIOD_LOCK_API_REQUIRED`. Close idempoten; AUDITOR `ROLE_NOT_ALLOWED`; 1 audit `CLOSING_PERIODE` beraktor. Reopen tanpa alasan → `VALIDATION_ERROR`; dengan alasan → OPEN + audit memuat alasan. Klien memanggil `opClosePeriod`. Antrean blob lama tidak membuka periode dan tidak menggagalkan setting lain |
| TC-P1-AUD-01 | P1A-01..03, 05 | FAIL | PASS | BLOCKED | Audit ke-2 gagal → semua tertulis dalam 1 append (`CREATE_TRANSACTION`, `CREATE_ALLOCATION`, `API_CREATE_INCOME`), tanpa warning. Idempotensi gagal → 0 transaksi, **0 audit**. Migrasi skema: audit gagal → `AUDIT_FAILED`, 0 kolom ditambah |
| TC-P1-AUD-02 | P1A-04 | FAIL | PASS | BLOCKED | Replay `clientRequestId` lama → "idempotent replay"; catatan tetap "B" |
| TC-TRX-02 | P1A-06 | PASS | PASS | BLOCKED | Replay create → id sama, 1 audit |
| TC-P1-REK-01 | P1R-01..03 | FAIL | PASS | BLOCKED | `saldoSistem` kiriman 999 diabaikan; server 150.000; `SELESAI`. Jalur generik → `USE_DEDICATED_API`. Selisih tanpa catatan → `VALIDATION_ERROR`; dengan catatan → `PERLU_PENJELASAN`, selisih −10.000 |
| TC-P1-REK-02 | P1R-04 | FAIL | PASS | BLOCKED | Kirim ulang → 1 baris, 1 audit |
| TC-P1-REK-03 | P1R-05..07 | FAIL | PASS | BLOCKED | Nominal beda → `MATCH_NOMINAL_MISMATCH`. Cocok → DIPROSES + audit. Mutasi kedua ke transaksi sama → `DOUBLE_MATCH`. Ulang → unchanged. Jalur generik → `MATCH_VIA_API_REQUIRED`. Transaksi fiktif → `INVALID_TRANSACTION` |
| TC-P1-RAB-01 | P1D-01..03 | FAIL | PASS | BLOCKED | LPJ ke transaksi fiktif atau ke PENERIMAAN → `INVALID_TRANSACTION`. 30.000 + 30.000 atas 50.000 → LPJ pertama `CREATED`, LPJ kedua `LPJ_EXCEEDS_TRANSACTION` |
| TC-P1-RAB-02 | P1D-04 | FAIL | PASS | BLOCKED | `rabId` fiktif → `INVALID_RAB` |
| TC-P1-RAB-03 | P1D-05 | FAIL | PASS | BLOCKED | Baris RAB ATK/MI Oktober: aktual 40.000 = kolom aktual FCC (diferensial); pengeluaran "Konsumsi" tercatat tanpa RAB |
| TC-P1-BKT-01 | P1E-01..03 | FAIL | PASS | BLOCKED | Bukti tanpa file → `BUKTI_FILE_REQUIRED`. Kosongkan `driveFileId` → `BUKTI_IMMUTABLE`. Unggah ke transaksi fiktif → `INVALID_TRANSACTION`, tidak ada file Drive |
| TC-P1-BKT-02 | P1E-04, 05 | FAIL | PASS | BLOCKED | `SELESAI` tanpa bukti → `EVIDENCE_REQUIRED`; setelah unggah → `SELESAI`. Klien tanpa file → ditolak, status tetap `TERCATAT`, 0 baris bukti |
| TC-P1-KON-01 | P1C-01, 02, 04, 05 | FAIL | PASS | BLOCKED | `_expect` usang → `CONFLICT`; `_expect` cocok → ok. Anggaran dan master → `CONFLICT`. Klien A tidak menimpa perubahan pengguna lain; toast "[CONFLICT]" |
| TC-P1-KON-02 | P1C-03 | FAIL | PASS | BLOCKED | Upsert baris terarsip → `ARCHIVED` |
| TC-AUTH-02 | P1S-01 | FAIL (API belum ada) | PASS | BLOCKED | AUDITOR → `ROLE_NOT_ALLOWED` untuk reopen, rekonsiliasi, dan pencocokan (baca RAB boleh). Pengguna tak terdaftar ditolak semua |
| GAP-028 | P1T-01 | PASS | PASS | BLOCKED | `TRANSFER` ditolak klien. 0 fungsi server bertema transfer |

**Baseline (kode `20d9e55`, suite final): PASS=3 FAIL=39. Akhir: PASS=42 FAIL=0.**

### 6.2 Suite lama (regresi)

| Suite | Baseline P1 | Akhir P1 | Perubahan ekspektasi |
|---|---|---|---|
| server_pass2 | 58/58 | 58/58 | — |
| e2e_central2 | 81/81 | **82/82** | **R1**: rekonsiliasi kini lewat `submitRekonsiliasi` → server (saldo sistem server 0, selisih 99.000, `PERLU_PENJELASAN`); penulisan rekonsiliasi lewat koleksi generik kini ditolak (dibuktikan P1R-02). **I3 (baru)**: I2 menutup September 2026, yang kini benar-benar mengunci. Tes membuka kembali lewat jalur resmi (alasan + audit `REOPEN_PERIODE`) sebelum skenario transaksi September berikutnya |
| tarif_server_tests | 52/52 | 52/52 | — |
| tarif_client_tests | 40/40 | 40/40 | — |
| schema_archive_tests | 27/27 | 27/27 | **K7/K7b**: `rabId` fiktif `'rab_x'` → `'ang_1'` (RAB yang ada). Maksud tes (komitmen ber-RAB tertahan sebelum migrasi aditif, tertulis sesudahnya) tetap |
| p0_tests | 44/0/1 | 44/0/1 | **P0B-02**: fixture menambah 1 bukti berfile karena `SELESAI` kini wajib bukti. Maksud tes (patch status atas tanggal bertipe Date) tetap. P0D-04/05/06 (KPI) dan P0U-02/03 (UI) **identik** dengan baseline `802cbed` |

Setiap perubahan ekspektasi menyangkut perilaku yang **sengaja ditutup P1**. Tidak ada tes yang dilonggarkan untuk perilaku lain.

### 6.3 Perubahan infrastruktur tes

| Berkas | Perubahan |
|---|---|
| `srv_env.js` | `state.failSetValuesSkip` (gagal pada tulis ke-N); 4 berkas server baru |
| `p0_tests.js` | Baseline `main` → fallback `802cbed` (di GitHub `main` berisi RAR) |
| `run_all_tests.js` | + `p1_tests` |
| `build_all.js` | + 2 langkah P1; EOL berkas generate dipertahankan |
| `build_bridge.js` | + 6 method, `expect` |

## 7. Temuan yang belum terselesaikan

| # | Hal | Alasan / tindakan |
|---|---|---|
| 1 | **Semua uji live** P0 dan P1 | Tidak ada proyek Apps Script uji, salinan spreadsheet, maupun `clasp` (H1–H2) |
| 2 | Dokumen daftar GAP dan rancangan TC audit asli tidak tersedia (H7) | Nomor GAP P1 (kecuali GAP-028) dan ID TC asli belum dipetakan. **Mohon kirim dokumennya**; pemetaan dilakukan tanpa mengubah kode |
| 3 | Keputusan K-P1-01..06 (`P1_00` §5) | Diterapkan default konservatif. Semua dapat diubah tanpa migrasi |
| 4 | Reopen dengan persetujuan ganda (Kepala Sekolah/Yayasan) | Belum diterapkan (K-P1-02). Saat ini BENDAHARA + alasan wajib + audit |
| 5 | Klien belum mengirim `expect` untuk master (`centralMasterSave`) dan koleksi JSON/kustom (laporan, kewajiban, antrean import) | Server sudah mendukung master (P1C-04). Klien master perlu peta field per jenis master |
| 6 | Resolusi konflik di UI | Perubahan yang konflik diblokir dan tampil di "gagal sinkron". Pengguna memuat ulang lalu mengulang. Belum ada layar "bandingkan dan pilih" |
| 7 | Baris lokal **lama** (pra-cutover) untuk rekonsiliasi, dan dokumen tanpa file, tidak dapat dimigrasikan lewat jalur generik | Ditolak dengan sengaja (`USE_DEDICATED_API`, `BUKTI_FILE_REQUIRED`). Butuh keputusan migrasi legacy, yang **tidak dilakukan** di P1 |
| 8 | `saldoSistem` di form klien (pratinjau, s.d. hari ini) bisa berbeda dari saldo server (s.d. akhir periode) | K-P1-03. Server adalah sumber kebenaran; pesan menampilkan angka server |
| 9 | Penggunaan ulang `clientRequestId` dengan isi berbeda tidak terdeteksi untuk create | Butuh kolom hash di `24_IDEMPOTENCY_LOG` (migrasi skema, tidak dilakukan). Untuk update, beda transaksi → `IDEMPOTENCY_MISMATCH` |
| 10 | Antrean pencocokan mutasi (`central_pending_mutmatch`) belum dihitung di `centralBlockedCount` | Galat tetap tampil lewat toast/`lastError` |
| 11 | `opSchemaApply` yang gagal setelah audit | Meninggalkan audit rencana + audit `SCHEMA_ADD_COLUMNS_FAILED`. Kedua jejak itu benar, bukan audit palsu |
| 12 | Transfer antar-akun | Tetap diblokir (GAP-028). Butuh desain write-door tervalidasi dan persetujuan tersendiri |
| 13 | GAP-008..011 (data FINAL) | Di luar cakupan. Tidak disentuh |

## 8. Risiko residual

1. **Perilaku Apps Script nyata belum terbukti**, termasuk:
   - Atomisitas satu `setValues` multi-baris (dasar P1-B).
   - LockService lintas eksekusi paralel (dasar P1-A dan P1-F).
   - Beban baca tambahan: `15_SETTINGS` setiap penulisan, dan `10_BUKTI` saat `SELESAI`.
   - Kuota Drive.
2. **Gagal tertutup:**
   - Header `15_SETTINGS` yang rusak atau blob closing yang tidak terbaca → **semua penulisan transaksi ditolak** (`SCHEMA_MISMATCH`/`PERIOD_STATE_INVALID`). Disengaja, tetapi berdampak operasional.
   - Wajib dicek dengan `opSchemaReport` dan `opPeriodLockStatus` pada salinan produksi sebelum deploy.
3. **Riwayat closing lama langsung berlaku.** Bila blob produksi berisi periode CLOSED, setelah deploy periode itu **terkunci di server**. Koreksi butuh reopen beralasan. Periksa `opPeriodLockStatus` di salinan lebih dulu.
4. **"Tandai Direkonsiliasi"** pada transaksi tanpa bukti berfile kini gagal (`EVIDENCE_REQUIRED`) dan berpengaruh pada alur kerja harian. Data historis yang sudah `SELESAI` tidak diubah.
5. **Halaman Dokumen** kini mewajibkan file untuk semua kategori, termasuk surat dan laporan.
6. **Proyek Apps Script live** mungkin memuat versi atau berkas lain (H6).

## 9. Langkah berikutnya yang disarankan

1. **Siapkan lingkungan uji** (dilakukan pengguna, kredensial tidak dibagikan ke percakapan):
   - Proyek Apps Script uji terikat ke **salinan** spreadsheet.
   - `clasp login` di mesin pengguna.
   - Akun uji di `26_USER_ACCESS` salinan.
2. **Deploy berkas root ke proyek uji**, tanpa `deps/`:
   - `.gs`: berkas P0 + `PeriodLock`, `RecordGuard`, `ReconEngine`, `RabMapping`.
   - `.html`: `Bendahara_V2`, `ServerBridge`.
3. **Jalankan ulang TC P0 dan P1 secara live**, dengan status PASS/FAIL/BLOCKED per TC.
   - Untuk P1-F: gunakan dua sesi browser nyata.
   - Untuk P1-B: picu kegagalan tulis audit, mis. proteksi sheet `13_AUDIT_LOG` di salinan.
4. **Putuskan K-P1-01..06** dan kirim dokumen GAP/TC asli untuk pemetaan ID.
5. Setelah P0 + P1 lulus live: rancang jalur server Transfer (GAP-028) sebagai pekerjaan terpisah.

## 10. Pernyataan: apakah produksi disentuh

**Tidak.**
- Tidak ada akses tulis ke Google Sheets maupun Drive (produksi atau uji).
- Pencarian Drive read-only dilakukan sekali untuk mencari dokumen GAP/TC; tidak ditemukan.
- Tidak ada deployment, migrasi, perubahan saldo awal, atau perubahan status pembayaran pada data.
- Tidak ada kredensial di repo.
- Fixture tes hanya berisi nama header dan data rekaan.

## 11. Status kesiapan

| Lingkungan | Status | Prasyarat yang belum ada |
|---|---|---|
| **Deployment uji** | **BELUM SIAP** (kode siap diuji) | Sama dengan `P0_01` §12, ditambah daftar berkas P1 (§9.2) |
| **Produksi** | **TIDAK SIAP** | Semua TC P0 dan P1 lulus **live**. Keputusan K-P1. Pemeriksaan blob closing dan header di salinan produksi. Keputusan data GAP-008..011. Persetujuan eksplisit terpisah untuk deploy produksi |

Tidak ada klaim "P0 selesai", "P1 selesai", atau "aman untuk produksi". Kode lulus sandbox, bukan lingkungan nyata.
