# P0_01 — Laporan Implementasi P0 Bendahara V2

**Tanggal:** 17 Oktober 2026
**Repositori:** `D:\biaya TK MI\BENDAHARA_V2_REPO` (Git lokal)
**Branch kerja:** `p0/implementasi`

## 1. Ringkasan eksekutif

**Status P0: BELUM SELESAI.**
- Seluruh perbaikan kode P0 (subfase A–D) sudah diterapkan.
- Semua perbaikan **lulus di sandbox Node**.
- Belum ada satu pun yang diuji di Apps Script dan Google Sheets sungguhan. Tidak ada proyek Apps Script uji, spreadsheet uji, `clasp`, maupun remote GitHub di lingkungan ini.
- Berdasarkan kriteria §9 prompt, kriteria 7 (bukti uji yang jelas untuk lingkungan nyata) belum dapat dipenuhi. Kriteria lain terpenuhi di tingkat kode dan sandbox.

**Yang berubah (ringkas):**

| Subfase | Perubahan |
|---|---|
| **P0-A** | Baca/tulis sheet berbasis **nama header**, gagal tertutup dengan `SCHEMA_MISMATCH`. Skema staging `_BACKEND` ditolak, tidak terbaca bergeser |
| **P0-B** | Klien **tidak lagi menyimpan transaksi lokal** saat server tidak siap. Pesan "menunggu konfirmasi server" lalu hasil akhir dari server. Server memvalidasi patch per-field, menormalkan tanggal, menolak nominal di bawah total alokasi, dan **menghitung status alokasi sendiri**. Audit wajib gagal → perubahan dibatalkan. Audit UI masuk lock dan idempoten |
| **P0-C** | **Temuan baru dan kritis diperbaiki:** fungsi engine (`createIncome`, `updateTransaction`, `testConcurrentWriteDoor`, dll.) bisa dipanggil langsung lewat `google.script.run` oleh AUDITOR atau pengguna tak terdaftar, melewati `opGate_`. Sekarang privat. Jalur `doPost` lama dinonaktifkan. Iframe `DEFAULT` |
| **P0-D** | KPI menampilkan **"DATA TIDAK TERSEDIA"** (skor null) bila data server gagal atau tidak dimuat, dan snapshot ditolak. Rumus, bobot, target, ambang, dan Zero Activity Rule **identik** (dibuktikan uji diferensial) |

**Produksi tidak disentuh.**

## 2. Commit awal dan branch kerja

| Commit | Branch | Keterangan |
|---|---|---|
| `f894dc6` | main | Impor verbatim `MASTER_API_REFACTOR` + dependensi (commit awal) |
| `802cbed` | main | Path relatif build/tes, log baseline (build byte-identik dengan sumber asli) |
| `f61831d` | p0/implementasi | Suite reproduksi `p0_tests.js` (baseline 11 PASS / 29 FAIL) |
| `33f90b3` | p0/implementasi | `P0_00_BASELINE_AUDIT.md` |
| `d4ada79` | p0/implementasi | P0-A |
| `02e32fe` | p0/implementasi | P0-B |
| `a63e31e` | p0/implementasi | P0-C |
| `f0cdd0a` | p0/implementasi | P0-D |

**Cara meninjau diff:**

```bash
git -C "D:/biaya TK MI/BENDAHARA_V2_REPO" diff main p0/implementasi --ignore-cr-at-eol --stat
```

`Code.gs` tampak berubah seluruhnya karena akhir baris; perubahan nyatanya 30 baris. Gunakan `--ignore-cr-at-eol`.

## 3. Temuan P0 yang diverifikasi

Semua diverifikasi terhadap kode aktual dengan eksekusi sandbox (bukti di `_test_logs/baseline_p0_tests.log`):

| Temuan | Status di kode aktual | Hasil setelah perbaikan |
|---|---|---|
| GAP-001 | Terbukti (P0A-06) | Diperbaiki |
| GAP-002 | Terbukti (P0A-01..05) | Diperbaiki |
| GAP-003 | Terbukti (P0B-02/03/20) | Diperbaiki |
| GAP-004 | Terbukti (P0B-16..19, P0C-01) | Diperbaiki untuk transaksi, alokasi, master, koleksi, dan blob. Lihat §8 untuk yang tersisa |
| GAP-005 | **Tidak dapat diverifikasi** (butuh deployment) | Lihat §8 |
| GAP-006 | Terbukti dan **lebih luas dari audit** (P0C-02/03/05/06/07) | Diperbaiki |
| GAP-007 | Terbukti (P0D-01..03) | Diperbaiki |
| GAP-012 | Terbukti (P0B-04/05/20) | Diperbaiki |
| GAP-013 | Terbukti: tanpa lock (P0B-12), aktor (P0B-13), audit gagal → sukses (P0B-14/15) | Diperbaiki |
| GAP-031 | Terbukti untuk audit UI ganda (P0B-11) | Diperbaiki. `resultType` data FINAL tidak diubah (dilarang mengubah data) |
| GAP-008/009/010/011 | Masalah **data** FINAL dan keputusan bisnis | **Di luar cakupan dan tidak disentuh** (larangan menebak data) |

**Perbedaan audit vs kode aktual:**
1. GAP-006 ternyata lebih luas. Selain `doPost`, **semua fungsi engine publik** dapat dipanggil langsung.
2. `AuthCentral.gs` dan `CreateDatabaseStructure.gs` berada di folder lain. Sekarang disalin ke root repo sebagai berkas deploy (GAP-029 sebagian).

## 4. Berkas yang diubah beserta alasan

**Aturan perubahan:** berkas hasil generate tidak diedit tangan. Perubahannya dibuat lewat langkah build baru.

**Urutan build** (`_build_tests/build_all.js`):
`apply_central → apply_tarif → apply_p0_client (+p0_client_d) → build_server_engines → apply_p0_server (+p0_server_b) → build_bridge`

Build diuji deterministik (dibangun ulang → MD5 identik).

| Berkas | Jenis | Alasan |
|---|---|---|
| `SchemaGuard.gs` (baru) | Tulisan tangan | Model header live, validasi kolom wajib, append berbasis nama, `sgErr_`, `SG_REQUIRED_` untuk mesin hitung, `sgUndoAppend_` (rollback baris yang baru ditambah dalam operasi yang sama) |
| `TransactionEngine.gs` | Generate (via `apply_p0_server.js` + `p0_server_b.js`) | Baca/tulis berbasis nama, normalisasi tanggal, `updateTransaction` per-field, status alokasi server, aktor audit, engine diprivatkan |
| `MasterDataRead.gs` | Generate | Hapus fallback posisional; get* mengembalikan `SCHEMA_MISMATCH` |
| `ObligationEngine.gs`, `FinanceEngine.gs`, `TarifPlan.gs` | Generate | Kolom wajib divalidasi; kode galat tidak disamarkan. **Fungsi bisnis kewajiban tetap salinan verbatim HTML** |
| `AuthCentral.gs` (salinan ke root) | Tulisan tangan | Gagal tertutup bila header akses rusak |
| `CreateDatabaseStructure.gs` (salinan ke root) | Tulisan tangan | `setupDatabaseStructure` → privat; `validateDatabaseStructure` butuh role |
| `OperationalAPI.gs` | Tulisan tangan | `ENGINE_ACTOR_`, baris `API_*` dalam lock, master: audit gagal → pulihkan, pemetaan galat, referensi engine privat |
| `RecordEngine.gs` | Tulisan tangan | Audit berbasis nama, `opAuditAppend` lock + idempoten, pemulihan bila audit gagal (batch, setting, arsip), arsip transaksi dibatalkan bila arsip alokasi gagal, status alokasi dihitung ulang saat arsip alokasi |
| `AdminAPI.gs`, `BuktiDrive.gs` | Tulisan tangan | Audit gagal → pulihkan (bukti: file dibuang ke trash) |
| `AllocationGuard.gs` | Tulisan tangan | Pemetaan galat |
| `Code.gs` | Tulisan tangan | `doPost`/`routeAction_` nonaktif (`LEGACY_DOPOST_ENABLED_=false`), `XFrameOptionsMode.DEFAULT`, referensi engine privat |
| `Bendahara_V2.html` | Generate (via `apply_p0_client.js` + `p0_client_d.js`) | Lihat §5 |
| `_build_tests/*` | Tes/build | `paths.js`, `build_all.js`, `run_all_tests.js`, `p0_tests.js`, `client_env.js`, fixture header (tanpa data pribadi), mock `deleteRow`/`lockFail`. Ekspektasi tes "mode lokal" disesuaikan (§6.3) |

## 5. Perubahan fungsi dan dampaknya

### Server

| Fungsi | Perubahan | Dampak |
|---|---|---|
| `readAllRows_`, `findRowIndexById_`, `findIdempotentResult_`, `recordIdempotentResult_`, `write*Row_`, `activeAllocationRows_`, `readTrxRows_`, `auditPush_`, `opAuditBulk_` | Berbasis nama header + kolom wajib | Kolom disisipkan atau ditukar → data tetap benar. Kolom wajib hilang → `SCHEMA_MISMATCH` |
| `readMasterRows_` + get* | Tanpa fallback posisional | Skema `_BACKEND` → `SCHEMA_MISMATCH`, bukan `nama` = NISN |
| `getCurrentUserIdentity` | Lookup gagal → `authorized:false` | Header `role` rusak → akses ditolak. Sebelumnya: **tetap terautentikasi** |
| `updateTransaction_` | Patch per-field, `UNKNOWN_FIELD`, nominal ≥ alokasi, status keluarga alokasi dihitung server, no-op bila tidak berubah | Patch status untuk transaksi impor (tanggal Date) berhasil. Tidak ada lagi nominal di bawah alokasi |
| `engineAllocStatusFor_` (baru) | Aturan **sama persis** dengan `computeTransaksiAllocationStatus` klien. Memakai ObligationEngine untuk membedakan SEBAGIAN dan OVERPAYMENT | Status TERALOKASI tidak bisa diklaim klien |
| `createTransactionWithAllocations_`, `createAllocation_`, `opArchiveAllocation` | Status induk dihitung server, dengan rollback | — |
| `opEngineWrite_` | Aktor masuk baris audit wajib engine; baris `API_*` dalam lock | — |
| `opRecordBatch`, `opMasterUpsert`, `opSettingsUpsert`, `opArchive*`, `opUserUpsert`, `opUploadBukti` | Audit wajib gagal → pulihkan + `AUDIT_FAILED` | Tidak ada lagi "sukses + auditWarning" |
| `opAuditAppend` | Dalam `withLock_`; id entri → id audit deterministik, duplikat dilewati | Retry tidak menggandakan audit |
| 13 fungsi engine/tes, `setupDatabaseStructure` | Diprivatkan (akhiran `_`) | Hanya `op*`/`get*` (berotorisasi) yang dapat dipanggil klien. Inventaris: `_test_logs/p0c_public_functions.txt` |
| `doPost`, `routeAction_` | `LEGACY_BRIDGE_DISABLED` | Tidak ada jalur tulis tanpa akun Google. Pairing anonim tertutup |
| `doGet` | `XFrameOptionsMode.DEFAULT` | Tidak dapat di-iframe dari domain lain |

### Klien (`Bendahara_V2.html`)

| Fungsi | Perubahan | Dampak pada pengguna |
|---|---|---|
| `postTransaksi`, `createAlokasi` | Wajib `centralTxWriteActive()`, kalau tidak galat eksplisit. `TRANSFER` ditolak | "Server tidak terhubung / akun belum terotorisasi / data belum termuat — TIDAK disimpan". **Transfer antar-akun tidak lagi dapat disimpan** (sebelumnya hanya lokal, tak pernah ke server) |
| Form master (14 titik), fasad koleksi/blob setelah boot | Tanpa server → galat, tanpa simpan lokal | Sama |
| `lsSet` | Galat dilempar | Penyimpanan browser penuh terlihat |
| `toast` + `centralReportResult_` | Selama belum dikonfirmasi: "… dikirim — menunggu konfirmasi server…". Setelah sinkron: "Tersimpan di server (n)" atau "GAGAL menyimpan n perubahan …" | Sukses hanya setelah server mengonfirmasi |
| `pwShowSuccessPanel` | Judul "Penerimaan dikirim ke server – menunggu konfirmasi" selama menunggu | Teks |
| `allTransaksi` | Baris lokal belum terkonfirmasi tidak dihitung (total, saldo, laporan, KPI) | Transaksi muncul di daftar setelah server mengonfirmasi (±1,5 detik) |
| `OperationalAPI.transaksi/alokasi` | Overlay yang ditolak server tidak ditampilkan. Alokasi gagal tidak dihitung bayar | — |
| `ccAuditEnqueue_` | Entri audit ber-id | — |
| `kpiIndukSummary`, `kpiRow`, `centralSnapshotKpi`, `pdSnapKpi` | Pembungkus "DATA TIDAK TERSEDIA". Fungsi asli = `kpiIndukSummaryCompute_` (isi identik) | Tidak ada skor palsu saat data gagal |

## 6. Test case: status, hasil aktual, bukti

- **PASS (sandbox)** berarti dijalankan sungguhan di sandbox Node (`srv_env.js`: mock SpreadsheetApp, LockService, Session) dan lulus.
- **Live** berarti di Apps Script + Google Sheets uji. Seluruh kolom live **BLOCKED**, karena lingkungan tidak tersedia.
- Bukti: `_test_logs/final_p0_tests.log` dan `_test_logs/baseline_p0_tests.log`.

### 6.1 Test case wajib

| TC | Cek | Baseline (main) | Sandbox (p0) | Live | Hasil aktual (sandbox) |
|---|---|---|---|---|---|
| TC-HDR-01 | P0A-08 | INFO | **INFO** | BLOCKED | `opSchemaReport` atas header FINAL: MATCH 21, EXTRA 3, MISSING_COLUMNS 2 (09_KOMITMEN `rabId`, 10_BUKTI `fileRef`), NOT_VERIFIED 1. Kriteria TC butuh migrasi aditif yang **belum disetujui** |
| TC-HDR-02 | P0A-01/02/03 | FAIL | PASS | BLOCKED | Kolom disisipkan → nominal 200000 dan unit MI benar. Header hilang → `SCHEMA_MISMATCH` (baca dan tulis) |
| TC-HDR-03 | P0A-04/05 | FAIL | PASS | BLOCKED | Kolom ditukar → role BENDAHARA. Header `role` hilang → `SCHEMA_MISMATCH`, tulis ditolak |
| TC-HDR-04 | P0A-06 | FAIL | PASS | BLOCKED | `01_SISWA` Fase 1C → `SCHEMA_MISMATCH` |
| TC-CRUD-01 | P0B-01 | PASS | PASS | BLOCKED | field nominal / tanggal / unit |
| TC-CRUD-02 | P0B-02 | FAIL | PASS | BLOCKED | Patch status atas tanggal Date → `ok`, tanggal tetap |
| TC-TRX-02 | P0B-07 | PASS | PASS | BLOCKED | Replay → id sama, 1 transaksi |
| TC-TRX-03 | P0B-08 | PASS | PASS | BLOCKED | Ditolak, tanpa baris parsial |
| TC-TRX-06 | P0B-09, P0B-18 | server PASS / klien FAIL | PASS | BLOCKED | `LOCK_TIMEOUT`. UI: "GAGAL menyimpan 1 perubahan… LOCK_TIMEOUT" |
| TC-FAIL-01 | P0B-16/17 | FAIL | PASS | BLOCKED | Tanpa server: ditolak, 0 baris lokal. Server mati: "menunggu konfirmasi" → "GAGAL…", tidak dihitung resmi |
| TC-FAIL-02 | P0B-10/11 | PASS / FAIL | PASS | BLOCKED | 1 transaksi, 1 audit. Audit UI ulang tidak ganda |
| TC-FAIL-03 | P0B-14/15 | FAIL | PASS | BLOCKED | `AUDIT_FAILED`, master dan arsip dipulihkan |
| TC-AUTH-01 | P0C-01 | FAIL | PASS | BLOCKED | Server `USER_NOT_FOUND`. Klien: 0 baris lokal, pesan "Akun belum terotorisasi" |
| TC-AUTH-02 | P0C-02/03 | FAIL | PASS | BLOCKED | `ROLE_NOT_ALLOWED`. Fungsi engine TIDAK_PUBLIK. Pembacaan engine tidak bocor |
| TC-AUTH-03 | P0C-04 | PASS | PASS | BLOCKED | `USER_INACTIVE` |
| TC-AUTH-04 | P0C-05 | FAIL | PASS | BLOCKED | `LEGACY_BRIDGE_DISABLED`, 0 baris transaksi/perangkat |
| TC-AUTH-05 | P0C-06 | FAIL | PASS | BLOCKED | `XFrameOptionsMode=DEFAULT` (doGet dijalankan dengan HtmlService tiruan) |
| TC-KPI-02 | P0D-01/02/03 | FAIL | PASS | BLOCKED | `overall=null`, "DATA TIDAK TERSEDIA (05_TRANSAKSI gagal dimuat; …)". Snapshot ditolak |

### 6.2 Cek tambahan

Semua PASS di sandbox:
- **P0A-07:** header FINAL bersepasi tetap terbaca.
- **P0A-09:** mesin kewajiban/FCC → `SCHEMA_MISMATCH`.
- **P0B-03:** `UNKNOWN_FIELD`.
- **P0B-04/05/06:** nominal < alokasi ditolak; status dihitung server SEBAGIAN → TERALOKASI.
- **P0B-12/13:** lock audit; aktor.
- **P0B-19/20:** sukses setelah konfirmasi; overlay ditolak tidak tampil.
- **P0C-07:** `setupDatabaseStructure` privat.

### 6.3 Suite lama

| Suite | Baseline | Akhir | Perubahan ekspektasi |
|---|---|---|---|
| server_pass2 | 58/58 | 58/58 | R16 memakai `opGetStudentPosition` (engine kini privat) |
| e2e_central2 | 80/80 | **81/81** | Fixture data lokal lama ditulis langsung (bukan lewat `postTransaksi`). **Z1** semula menuntut mode lokal identik pra-sentralisasi → kini menuntut **penolakan eksplisit**. **Z2** kill switch → penulisan ditolak, tidak disimpan lokal. **G0** baru |
| tarif_server_tests | 52/52 | 52/52 | — |
| tarif_client_tests | 40/40 | 40/40 | L4 fixture katering lokal ditulis langsung. **L5** memakai `validateAllocationBatch`. **L6** semula "mode lokal: alokasi tersimpan" → kini "transaksi & alokasi DITOLAK eksplisit" |
| schema_archive_tests | 27/27 | 27/27 | Pembacaan lewat `opGetTransactions` / `opGetStudentPosition` / `getTransactions_` |

Setiap perubahan ekspektasi menyangkut perilaku **"mode lokal"** yang secara eksplisit dilarang prompt P0 (§6 P0-B butir 2–3). Tidak ada tes yang dilonggarkan untuk perilaku lain.

## 7. Hasil regresi UI dan KPI (dijalankan)

| Cek | Hasil |
|---|---|
| P0D-04: skor KPI (6 induk, 31 indikator: capaian, status, activityStatus, realisasi) pada data sama, HTML main vs p0 | **Identik** |
| P0D-05: teks 13 simbol KPI (`KPI_MASTER`, `INDICATOR_MASTER`, `indDef`, `computeKpiRow`, `kpiIndukRow`, `computeIndicatorDimensions`, `computeIndicatorActivityStatus`, `computeIndicatorQuality`, `kpiStatusFromScore`, `mkAkt`, `financialAktivitasFeed`, `getIndicatorRealization`, `computeIndicatorQuantityScore`) | **Identik** |
| P0D-06: isi `kpiIndukSummary` asli = `kpiIndukSummaryCompute_` | **Identik** |
| P0U-02: markup dan CSS di luar `<script>` | **Identik** dengan main |
| P0U-03: 754 fungsi baseline masih ada; `NAV_TREE` | **Identik** |
| P0U-01: 8 halaman render tanpa galat | PASS |
| ObligationEngine: fungsi kewajiban = salinan verbatim HTML (server_pass2) | PASS |

**Perubahan UI yang disengaja (P0):** teks toast dan panel sukses, pesan penolakan saat server tidak siap, label "DATA TIDAK TERSEDIA" di KPI, dan penolakan simpan Transfer.

## 8. Temuan yang belum terselesaikan

| # | Hal | Alasan / tindakan |
|---|---|---|
| 1 | **Semua uji live** (Apps Script + Sheets uji) | Lingkungan tidak tersedia. Lihat §12 |
| 2 | GAP-005: `Session.getActiveUser()` pada deployment nyata | Butuh deployment. Wajib diuji: setelan *Execute as* dan *Who has access*; akun gmail di luar domain |
| 3 | GAP-008/009/010/011 (data FINAL: `periodeAktif` tanggal, saldo awal kosong, keringanan/katering tidak terbaca, klaim ledger) | Dilarang menebak data atau keputusan bisnis. Menunggu keputusan K3–K6 (`08_RENCANA`). **Bila FINAL dipakai apa adanya, angka kewajiban/KPI tetap salah walau kode benar** |
| 4 | Data lokal **lama** (sebelum cutover) masih tampil dan dihitung bila browser memilikinya. Edit, hapus alokasi, dan arsip untuk baris lokal lama masih lokal | Bagian alur migrasi legacy (Pusat Data). Disarankan: cutover wajib sebelum go-live dan pembersihan lokal |
| 5 | `Store.saveSettings` masih menyimpan lokal bila server belum siap | Pengaturan memuat preferensi UI lokal. Pemisahan kunci operasional (`periodeAktif` dan lainnya) vs preferensi diperlukan |
| 6 | Antrean tulis masih di localStorage (desain asinkron). Alokasi *in-flight* (±1,5 detik) dihitung di klien sebelum konfirmasi | Baris gagal dikecualikan. Menulis sinkron penuh = refaktor alur, di luar P0 minimal |
| 7 | `opSchemaApply`: audit gagal masih `auditWarning` | Pemulihan header berisiko. Operasi admin, bukan transaksi |
| 8 | Baris audit tambahan `API_*` (role) gagal → `auditWarning` | Audit **wajib** dengan aktor sudah atomik di engine. Baris ini pelengkap |
| 9 | Transfer antar-akun kini ditolak | **DISETUJUI pengguna (17-10-2026):** "Saya setuju Transfer antar-akun diblokir sampai ada jalur server (GAP-028)." Blokir tetap berlaku sampai write-door server untuk transfer (GAP-028, P1) dibuat dan diuji |
| 10 | `AUTH_CENTRAL_TEST.gs` (fungsi publik yang membaca `26_USER_ACCESS`) dan `MigrationOneTime.gs` | **Jangan di-deploy.** Berkas ini ada di `deps/` saja. Isi proyek Apps Script live tidak diketahui |

## 9. Risiko residual

1. **Perilaku Apps Script nyata belum terbukti:** tipe sel, kuota, LockService lintas eksekusi, Drive scope, waktu eksekusi `engineAllocStatusFor_` (membaca konteks kewajiban saat alokasi sebagian).
2. **Ketatnya `SCHEMA_MISMATCH`:**
   - Spreadsheet produksi yang headernya menyimpang dari kontrak dasar akan **menolak** operasi. Ini memang disengaja.
   - Harus didahului `opSchemaReport` di salinan produksi sebelum deploy.
   - FINAL lolos untuk kolom dasar 05/06/01/26 (P0A-07).
3. **Proyek Apps Script live** mungkin berisi berkas atau versi lain, misalnya `MigrationOneTime.gs` atau fungsi publik lama. Perlu `clasp pull` dan dibandingkan.
4. **Patch `UNKNOWN_FIELD`:** klien yang mengirim field di luar 23 kolom transaksi akan ditolak. Patch klien yang ada sudah diperiksa dan sesuai.
5. **Pemulihan audit gagal** memakai penulisan ulang baris asal. Kegagalan ganda → `ROLLBACK_FAILED`, dilaporkan dan tidak ditelan.

## 10. Langkah berikutnya yang disarankan

1. **Siapkan lingkungan uji**, yang dilakukan oleh pengguna:
   - Proyek Apps Script uji terpisah, terikat ke **salinan** spreadsheet, bukan produksi.
   - `clasp login` di mesin pengguna; kredensial tidak dibagikan ke percakapan.
   - Remote GitHub privat.
2. **`clasp pull` proyek produksi (read-only)** untuk membandingkan isi live dengan repo.
3. **Deploy berkas root ke proyek uji:**
   - `.gs`: `Code`, `SchemaGuard`, `TransactionEngine`, `AuthCentral`, `MasterDataRead`, `CreateDatabaseStructure`, `OperationalAPI`, `RecordEngine`, `AdminAPI`, `BuktiDrive`, `AllocationGuard`, `ObligationEngine`, `FinanceEngine`, `TarifPlan`.
   - `.html`: `Bendahara_V2`, `ServerBridge`.
   - **Tanpa** `deps/`.
4. **Jalankan ulang TC P0** secara live. Rekam hasil dengan status PASS/FAIL/BLOCKED.
5. **Ambil keputusan K1–K9** (`08_RENCANA_IMPLEMENTASI_BERTAHAP.md`), lalu P1 (data FINAL, transfer, periode terkunci).

## 11. Pernyataan: apakah produksi disentuh

**Tidak.**
- Tidak ada akses ke Google Sheets produksi maupun uji.
- Tidak ada deployment.
- Tidak ada migrasi.
- Tidak ada perubahan data.
- Folder sumber asli `C:\Users\HP\OneDrive\Desktop\BendaharaTKMI\MASTER_API_REFACTOR` dan `SISTEM_KINERJA_SEKOLAH\...` **tidak diubah**; semua pekerjaan di repo salinan.
- Tidak ada kredensial di repo. `.gitignore` mengecualikan `.clasprc.json`, `.env`, dan kunci.
- Fixture tes hanya berisi **nama header**, tanpa data siswa.

## 12. Status kesiapan

| Lingkungan | Status | Prasyarat yang belum ada |
|---|---|---|
| **Deployment uji** | **BELUM SIAP** (kode siap diuji) | Proyek Apps Script uji, salinan spreadsheet, `clasp` + `appsscript.json`, remote GitHub, daftar berkas deploy (§10.3), akun uji di `26_USER_ACCESS` salinan |
| **Produksi** | **TIDAK SIAP** | Semua TC P0 lulus **live**. Keputusan dan perbaikan data GAP-008..011. Cutover data lokal lama. Persetujuan eksplisit terpisah untuk deploy produksi |

Tidak ada klaim "aman untuk produksi". Kode lulus sandbox, bukan lingkungan nyata.
