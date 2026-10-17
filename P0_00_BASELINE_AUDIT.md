# P0_00 — Baseline Audit Sebelum Perbaikan P0

**Tanggal:** 17 Oktober 2026

**Ringkasan status lingkungan:**
- Sifat pekerjaan: pemeriksaan dan pengujian sandbox lokal.
- Tidak ada akses ke Google Sheets, termasuk produksi maupun uji.
- Tidak ada deployment.

## 1. Repositori, branch, dan commit awal

**Kondisi awal (FAKTA):**
- Tidak ada repositori Git untuk Bendahara V2 di mesin ini.
- `clasp` dan `gh` tidak terpasang.
- Tidak ada `appsscript.json`, `.clasp.json`, maupun konfigurasi GitHub Actions.

**Tindakan:** dibuat repositori Git **lokal** di `D:\biaya TK MI\BENDAHARA_V2_REPO`.
- Isinya salinan byte-identik dari:
  - `C:\Users\HP\OneDrive\Desktop\BendaharaTKMI\MASTER_API_REFACTOR`
  - `...\SISTEM_KINERJA_SEKOLAH\03_BENDAHARA_SEKOLAH\GAS_Migration` → disalin ke `deps/GAS_Migration`
  - `...\AUTH_CENTRAL_BUILD` → disalin ke `deps/AUTH_CENTRAL_BUILD`
- Folder sumber asli **tidak diubah**.
- `MigrationOneTime.gs` (3,4 MB, berisi data tertanam) **sengaja tidak disalin**.

| Commit | Branch | Isi |
|---|---|---|
| `f894dc6` | `main` | Impor baseline verbatim |
| `802cbed` | `main` | Path relatif untuk build/tes (`_build_tests/paths.js`), log baseline |
| `f61831d` | `p0/implementasi` | Suite reproduksi P0 (`p0_tests.js`), fixture header tanpa data, mock `deleteRow`/`lockFail` |

**Belum tersedia** (detail di laporan akhir):
- Remote GitHub.
- Proyek Apps Script uji.
- Spreadsheet uji.

**Pemisahan uji dan produksi.** Belum ada proyek Apps Script uji maupun spreadsheet uji yang dapat diverifikasi. Akibatnya:
- Semua uji dijalankan di **sandbox Node** (`_build_tests/srv_env.js`, mock SpreadsheetApp/LockService/Session).
- Semua TC yang memerlukan Apps Script sungguhan berstatus **BLOCKED**.

**Rantai build dapat direproduksi (FAKTA).** Urutan `apply_central → apply_tarif → build_server_engines → build_bridge` menghasilkan ulang secara **byte-identik** berkas berikut: `Bendahara_V2.html`, `ObligationEngine.gs`, `FinanceEngine.gs`, `TransactionEngine.gs`, `MasterDataRead.gs`, `TarifPlan.gs`, `ServerBridge.js/.html`. Dicek dengan MD5 terhadap folder asli.

## 2. Baseline tes sebelum perubahan (dijalankan)

| Suite | Hasil | Log |
|---|---|---|
| server_pass2 | PASS=58 FAIL=0 | `_test_logs/baseline_server_pass2.log` |
| e2e_central2 | PASS=80 FAIL=0 | `_test_logs/baseline_e2e_central2.log` |
| tarif_server_tests | PASS=52 FAIL=0 | `_test_logs/baseline_tarif_server_tests.log` |
| tarif_client_tests | PASS=40 FAIL=0 | `_test_logs/baseline_tarif_client_tests.log` |
| schema_archive_tests | PASS=27 FAIL=0 | `_test_logs/baseline_schema_archive_tests.log` |
| **p0_tests (baru)** | **PASS=11 FAIL=29 INFO=1** | `_test_logs/baseline_p0_tests.log` |

`p0_tests` menuliskan perilaku yang **diharapkan setelah perbaikan**. Karena itu, FAIL pada baseline berarti temuan audit **terbukti terulang** di kode aktual.

## 3. Temuan P0 yang berhasil direproduksi (sandbox)

| Temuan | Bukti eksekusi (baseline) | Lokasi kode |
|---|---|---|
| GAP-002: pembacaan posisional | P0A-01: kolom disisipkan → `unit` terbaca "X" dan `nominal` terbaca "MI". P0A-02: penulisan bergeser. P0A-03: header `nominal` hilang → tetap `ok:true` | `TransactionEngine.gs:93-104, 105-115, 151-163, 326-340, 343-358, 703` |
| GAP-002: akses pengguna posisional | P0A-04: kolom email/nama ditukar → bendahara ditolak. P0A-05: header `role` dihapus → **tetap terautentikasi** | `AuthCentral.gs:38-46` |
| GAP-001/002: skema staging terbaca diam-diam | P0A-06: `01_SISWA` Fase 1C → `getStudents` ok dengan `nama`="0012345678" (NISN) | `MasterDataRead.gs:30-46` (fallback `readAllRows_`) |
| GAP-003: update gagal karena tanggal Date | P0B-02: `VALIDATION_ERROR` "tanggal wajib format YYYY-MM-DD" untuk patch status saja | `TransactionEngine.gs:680-729` |
| GAP-003: field asing dibuang diam-diam | P0B-03: patch `kolomAsing` → `ok:true` | idem |
| GAP-003: overlay tetap tampil | P0B-20: lihat GAP-012 (server menerima nilai invalid) | `Bendahara_V2.html:7855-7866, 7752-7760` |
| GAP-012: nominal < total alokasi | P0B-04: diterima. P0B-20: nominal 100.000 diterima walau alokasi 200.000 | `TransactionEngine.gs:680-729` |
| GAP-012: status dari klien dipercaya | P0B-05: alokasi 200.000 dari 300.000 tersimpan sebagai `TERALOKASI` | `TransactionEngine.gs:472` |
| GAP-013: audit di luar lock / gagal tidak membatalkan | P0B-12: `opAuditAppend` tanpa lock. P0B-14 dan P0B-15: audit gagal → `ok:true` + `auditWarning` (master dan arsip transaksi) | `RecordEngine.gs:49-57, 146-196, 270-282`; `OperationalAPI.gs:333-338` |
| GAP-013: aktor tidak ada di baris audit engine | P0B-13: `sumber` = "write-door" | `TransactionEngine.gs:209-221, 511-513` |
| GAP-031: audit UI ganda saat retry | P0B-11: entri yang sama tercatat 2 kali | `RecordEngine.gs:270-282` |
| GAP-004: fallback lokal | P0B-16: tanpa ServerBridge → "Pengeluaran tersimpan" + 1 baris lokal. P0C-01: pengguna tak terdaftar → baris lokal. P0B-17/18/19: toast "tersimpan" sebelum konfirmasi, dan tetap tampil saat server gagal atau LOCK_TIMEOUT | `Bendahara_V2.html:171, 1084-1108, 3589-3591` |
| GAP-006: jalur doPost | P0C-05: `requestPairing` anonim menulis 25_DEVICE_WHITELIST; respons `ok:true` | `Code.gs:130-195, 223-235` |
| GAP-006: iframe | P0C-06: `XFrameOptionsMode.ALLOWALL` | `Code.gs:212-216` |
| **Baru — GAP-006 diperluas: fungsi engine publik** | P0C-02: akun **AUDITOR** berhasil memanggil langsung `createIncome`, `createExpense`, `createTransaction`, `createAllocation`, `updateTransaction`, `createBankMutation`, `testConcurrentWriteDoor` (semua SUCCESS). P0C-03: `getTransactions` dan `healthCheck` bocor ke pengguna tak terdaftar. Fungsi tanpa akhiran `_` dapat dipanggil lewat `google.script.run` | `TransactionEngine.gs:394-935`; `CreateDatabaseStructure.gs:271` (`setupDatabaseStructure`) |
| GAP-007: KPI saat data gagal | P0D-01: `opReadSheet` gagal → skor total 24,3 "Perlu Perbaikan". P0D-02: snapshot tetap ditulis. P0D-03: tanpa server → KPI dihitung dari localStorage (13,2) | `Bendahara_V2.html:1447-1454, 8552-8564` |

**Perilaku yang sudah benar di baseline** (PASS, dipertahankan):
- Validasi field create (TC-CRUD-01).
- Idempotensi create transaksi (TC-TRX-02).
- Penolakan alokasi berlebih tanpa baris parsial (TC-TRX-03).
- LOCK_TIMEOUT di server (TC-TRX-06 sisi server).
- Retry create tidak menggandakan transaksi (TC-FAIL-02).
- Status INACTIVE (TC-AUTH-03).
- Header FINAL dengan spasi tetap terbaca (P0A-07).
- Regresi KPI dan UI.

## 4. Temuan audit yang belum dapat diverifikasi

| Temuan | Alasan |
|---|---|
| GAP-005: `Session.getActiveUser()` pada deployment aktual | Butuh deployment Apps Script sungguhan, dan setelan "Execute as" tidak diketahui |
| GAP-003: tipe sel tanggal di Sheets | Sandbox menyimulasikan Date; perlu konfirmasi live |
| GAP-013: race append audit antar-permintaan nyata | Eksekusi Apps Script tidak dapat dipaksa paralel di sandbox. Yang diuji: pemakaian lock |
| Keselarasan kode deploy aktual vs repo | Proyek Apps Script live tidak dapat dibaca (`clasp` tidak tersedia). Kode live mungkin berbeda |
| GAP-008/009/010/011 (data FINAL) | Termasuk masalah data dan keputusan bisnis; **di luar cakupan P0 kode ini** dan dilarang ditebak |

## 5. Jalur baca/tulis yang ditelusuri

**Baca:**
- `readAllRows_` dipakai oleh `readTrxRows_`, `findDeviceRow_`, `lookupUserAccess_`, dan tes engine.
- `readMasterRows_` (get*).
- `opSheetModel_` (berbasis nama) dipakai oleh RecordEngine, AdminAPI, BuktiDrive, Obligation, Finance, dan TarifPlan.
- `opReadSheet` (berbasis nama).
- `findRowIndexById_`, `findIdempotentResult_`, `activeAllocationRows_` (posisional).

**Tulis:**
- `writeTransactionRow_`, `writeAllocationRow_`, `writeMutasiRow_`, `updateTransaction`, `auditPush_`, `opAuditBulk_`, `recordIdempotentResult_` (posisional).
- `opRecordBatchLocked_`, `opMasterUpsert`, `opSettingsUpsert`, `opArchive*`, `opUserUpsert`, `opUploadBukti` (berbasis nama).
- Jalur `doPost`/`routeAction_`.
- Fungsi engine publik.

**Klien:**
- `postTransaksi`, `createAlokasi`, `centralPatchTransaksi`, `centralPushPatch_`, `centralRunSync`, dan `lsSet`.
- Jalur fallback `Store.*` (lihat audit 03 §0).

**KPI:**
- `INDICATOR_MASTER` (L1479), `computeKpiRow` (L1428), `kpiIndukRow` (L1439), `kpiIndukSummary` (L1447), `financialAktivitasFeed` (L1724), dan `centralSnapshotKpi` (L8552).

## 6. Rencana file yang diubah dan urutan

Prinsip: berkas hasil generate (`Bendahara_V2.html`, `TransactionEngine.gs`, `MasterDataRead.gs`) **tidak diedit tangan**.
- Perubahan dibuat lewat langkah build baru `apply_p0_client.js` dan `apply_p0_server.js`, dengan penggantian yang dicek harus unik.
- Berkas tulisan tangan diedit langsung.

| Subfase | Berkas | Perubahan |
|---|---|---|
| P0-A | `SchemaGuard.gs` (baru) | Helper baca/tulis berbasis header + `SCHEMA_MISMATCH` |
| P0-A | `TransactionEngine.gs` (via `apply_p0_server.js`) | `readAllRows_`, `findRowIndexById_`, idempotensi, penulis baris, `activeAllocationRows_`, `readTrxRows_`, `auditPush_` berbasis nama |
| P0-A | `MasterDataRead.gs` (via `apply_p0_server.js`) | Hapus fallback posisional, ganti `SCHEMA_MISMATCH` |
| P0-A | `AuthCentral.gs`, `CreateDatabaseStructure.gs` (disalin ke root sebagai berkas deploy) | Gagal tertutup bila header akses rusak |
| P0-B | `TransactionEngine.gs` | Normalisasi tanggal, validasi patch per-field, invarian nominal ≥ alokasi, status alokasi dihitung server, aktor di audit |
| P0-B | `RecordEngine.gs`, `OperationalAPI.gs`, `AdminAPI.gs`, `BuktiDrive.gs` | Audit wajib: gagal → pulihkan dan galat. `opAuditAppend` dalam lock dan idempoten. Status dihitung ulang setelah arsip |
| P0-B | `Bendahara_V2.html` (via `apply_p0_client.js`) | Tanpa simpan lokal untuk transaksi/alokasi. Toast "menunggu konfirmasi" lalu hasil akhir dari server. Overlay yang ditolak tidak ditampilkan. Transaksi belum terkonfirmasi tidak dihitung resmi. `lsSet` tidak menelan galat |
| P0-C | `TransactionEngine.gs`, `OperationalAPI.gs`, `Code.gs`, `CreateDatabaseStructure.gs` | Fungsi engine dan tes dijadikan privat. `doPost` lama dinonaktifkan. XFrame DEFAULT. `setupDatabaseStructure` privat |
| P0-D | `Bendahara_V2.html` (via `apply_p0_client.js`) | `kpiIndukSummary` membungkus fungsi asli dengan status "DATA TIDAK TERSEDIA" bila data server tidak lengkap. Snapshot ditolak. Rumus KPI tidak disentuh |

**Risiko:**
- Tes lama yang menguji "mode lokal" akan berubah ekspektasinya, karena perilaku itu yang dilarang P0. Setiap perubahan tes dicatat di laporan akhir.
- Pemanggilan `oblLoadContext_` untuk status alokasi menambah beban baca saat penerimaan dicatat sebagian.
