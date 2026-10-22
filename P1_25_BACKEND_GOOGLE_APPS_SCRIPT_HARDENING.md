# P1_25 — Penguatan Backend Google Apps Script (Bendahara V2)

**Tanggal:** 22 Oktober 2026

**STATUS AKHIR: `BLOCKED`**

Integrasi Apps Script nyata belum dapat dijalankan karena belum tersedia:
- salinan spreadsheet nonproduksi;
- proyek Apps Script uji;
- akun uji;
- folder bukti uji.

GAP-005 tetap terbuka. Perubahan kode dalam laporan ini berstatus READY_FOR_INTEGRATION_TEST; audit dan rencana berstatus READY_FOR_REVIEW.

**Arah proyek** (dikonfirmasi pemilik di sesi ini): tetap Google Apps Script + Google Sheets + Google Drive + frontend Web V2. **Tidak** ada migrasi ke PostgreSQL/Node.js/VPS. Brief alternatif (backend PostgreSQL) **tidak** dikerjakan.

Semua pengujian adalah **sandbox Node** (kode `.gs` asli dijalankan di `vm` di atas sheet tiruan). Tidak ada deployment, setup skema, migrasi, penulisan spreadsheet, maupun perubahan KPI/data historis.

---

## 1. Kondisi repository

| Hal | Nilai |
|---|---|
| Branch | `claude/hopeful-galileo-mnifgq` (= `origin`), working tree bersih sebelum bekerja |
| HEAD awal | `f89cb5a` (dokumen P1_25 kesiapan integrasi) |
| Riwayat | `3675321` (P1_23) → `4d85507`, `bb5dd5d`, `903b091`, `acf3f96` (P1_24) → `6eef855`, `8710b24`, `aab0d48`, `f89cb5a` (P1_25) — linear |
| Hasil P1_24 | 42 suite 734/0/65, status BLOCKED (terverifikasi di log `_test_logs/p1_24_*.log`) |
| Baseline sesi ini | `node build_all.js` deterministik; `run_all_tests.js p1_25h_baseline` → **44 suite, 744 / 0 / 67** |
| Branch lain | `claude/compassionate-dirac-drm760` tidak diubah |

---

## 2. Arsitektur backend saat ini (dipetakan dari kode)

### 2.1 Alur

```
Bendahara_V2.html (HtmlService, klien)
   └─ ServerBridge.callServer → google.script.run.<op*>
        └─ op* publik (OperationalAPI / RecordEngine / AdminAPI / modul domain)
             ├─ opGate_(roles) → getCurrentUserIdentity → Session.getActiveUser + 26_USER_ACCESS
             ├─ validasi (SchemaGuard, RecordGuard, ImportRules, engine)
             ├─ withLock_ (LockService script lock, reentran, waitLock 10 dtk)
             ├─ akses sheet berbasis NAMA header (SchemaGuard sgModel_/sgAppend_/readAllRows_, opSheetModel_)
             └─ audit 13_AUDIT_LOG (auditPush_ / opAuditBulk_) dalam operasi yang sama
```

Inventaris otomatis (skrip analisis atas 29 berkas server di `SERVER_FILES`):
- **104 fungsi publik**, termasuk **65 `op*`**.
- **39 `op*` menulis** (langsung atau lewat fungsi yang dipanggil); semuanya bergerbang `opGate_` (RD-05).
- Fungsi publik tanpa gerbang: `getCurrentUserIdentity`, `doGet`, `doPost` (dimatikan), `include`, `TEST_BRIDGE_TEMPLATE`, `TEST_SERVERBRIDGE_SYNTAX`, `testBendaharaEvaluate`, dan 21 fungsi murni `ObligationEngine` (gagal tanpa konteks bergerbang, RD-07).

### 2.2 Pemetaan "service" yang diminta ke kode yang **sudah ada**

| Service | Implementasi nyata | Catatan |
|---|---|---|
| AuthService | `AuthCentral.gs`: `getCurrentUserIdentity`, `lookupUserAccess_`, `normalizeEmail_` | Identitas = `Session.getActiveUser()`; gagal tertutup |
| AuthorizationService | `OperationalAPI.gs`: `opGate_`, `OP_WRITE_ROLES_` (BENDAHARA), `OP_READ_ROLES_`; `AdminAPI.gs`: `OP_ROLE_ASSIGNABLE_BY_`, `OP_PRIVILEGED_ROLES_`; `MasterDataRead.gs`: `authorizeCurrentUser_` | Dicek **per panggilan** |
| API Router | `google.script.run` → fungsi `op*` (tanpa router string); `ServerBridge.js` (dihasilkan `build_bridge.js`, 53 method); `Code.gs doGet` (HTML); `doPost` lama **dimatikan** (`LEGACY_DOPOST_ENABLED_ = false`) | Allowlist = himpunan fungsi publik yang dideploy |
| ValidationService | `SchemaGuard.gs` (`sgDateError_`, header wajib `SG_REQUIRED_`), `RecordGuard.gs` (per koleksi: kewajiban beku, alokasi pengeluaran, LPJ, tanggal), `ImportRules.gs`, `opValidateMaster_`/`opMasterDateError_`, validasi engine (`createIncome_`/`createExpense_`/`createAllocation_`/`updateTransaction_`), `AllocationGuard.gs`, `KewajibanGuard.gs` | Tersebar per domain, tetapi semuanya di server |
| DataAccessService | `SchemaGuard.gs` (`sgHeaderModel_`, `sgModel_`, `sgObj_`, `sgRowArray_`, `sgAppend_`, `sgAppendMany_`, `sgUndoAppend_`), `TransactionEngine.gs` (`ss_`, `readAllRows_`, `findRowIndexById_`, `deleteRowById_`), `RecordEngine.gs` (`opSheetModel_`, `opRestoreRows_`) | Tidak ada akses kolom posisional (grep pola `r[n]` = 0 di luar mesin murni) |
| PaymentService | `TransactionEngine.gs` (`createIncome_`, `createAllocation_`, idempotensi `24_IDEMPOTENCY_LOG`), `AllocationGuard.gs`, `OperationalAPI.gs` (`opCreateIncome`, `opCreateAllocation`, `opCreateTxBatch`) | Validasi alokasi di kunci yang sama (P1_19) |
| ObligationService | `ObligationEngine.gs` (`kewajibanSatuBaris`, `kewajibanForSiswa`, `oblSnapshotCore_`, `opObligations`, `opObligationSnapshot`), `TarifPlan.gs`, `RecordGuard` (`rgKewajibanBeku_`), `KewajibanBekuAudit.gs` | Kewajiban beku kanonis (P1_23) |
| ExpenseService | `createExpense_`, `opCreateExpense`, validasi kategori master (P1_20 D), `KategoriPengeluaranAudit.gs` | — |
| AdvanceService / LpjService | `UangMukaLpj.gs` (prototipe sandbox; skema aditif belum dipasang) | Verifikasi nonaktif (`UM_VERIFIKASI_AKTIF_=false`) |
| RabService | `RabMapping.gs`, `RabAllocation.gs`, `RabPersetujuan.gs`, `FinanceEngine.gs` (`rabMatchAll_`) | — |
| KpiService | **Klien**: 31 KPI (`indDef`, bobot/target/ambang) di `Bendahara_V2.html`. **Server**: `FinanceEngine.gs` `opFinancialControl` (FCC), `opRabRealization` | Skor KPI tidak dihitung ulang server (lihat §3) |
| AuditService | `TransactionEngine.gs` `auditPush_`; `RecordEngine.gs` `opAuditBulk_`, `opAuditAppend`; 13_AUDIT_LOG | Aktor dari sesi (`ENGINE_ACTOR_`/`g.identity`) |
| Bukti (Drive) | `BuktiDrive.gs` `opUploadBukti`, `opBuktiFolder_` | Folder `BUKTI_FOLDER_ID` atau nama `Bendahara_Bukti` |
| Periode | `PeriodLock.gs`, `PeriodeAktifAdmin.gs` | — |
| Rekonsiliasi | `ReconEngine.gs` | Tidak disentuh (544 TEREKONSILIASI) |

**Kesimpulan desain lapisan:** seluruh fungsi service yang diminta **sudah ada** sebagai modul `.gs` per domain dengan gerbang, validasi, dan akses data terpusat. Membuat kelas/lapisan baru (`XxxService`) akan menduplikasi fungsi yang sudah teruji (44 suite) dan mengubah banyak berkas hasil build. **Rekomendasi: tidak membuat lapisan baru.** Pertahankan pemetaan di atas sebagai kontrak, dan perkuat titik lemah secara lokal (§5).

---

## 3. Kesenjangan arsitektur

| ID | Kesenjangan | Dampak | Tindakan |
|---|---|---|---|
| A-1 | `opTarifApply` menghitung rencana di luar kunci, tiap langkah memakai kunci sendiri, dan audit `TARIF_PLAN_APPLIED` ditulis **tanpa kunci** | Penulisan lain dapat menyela di antara langkah; append audit tanpa kunci dapat menimpa baris audit lain (`sgAppend_` = `getLastRow()+1` lalu `setValues`) | **Diperbaiki** (§6) |
| A-2 | Transaksi pencairan/pengembalian uang muka dapat diarsip/dikoreksi lewat `opArchiveTransaction`/`opUpdateTransaction` tanpa memperhatikan 32/33 | Saldo uang muka ≠ FCC (dibuktikan P1_25 PA-11) | Usulan guard (P1_25 §6.4); **butuh keputusan** |
| A-3 | Skor 31 KPI dihitung di klien | Server tidak dapat memverifikasi skor; laporan KPI bergantung kode klien | Dicatat; perubahan butuh analisis & persetujuan terpisah (KPI tidak diubah) |
| A-4 | `oblSnapshotCore_` menulis per potongan 200 baris (tiap potongan satu kunci); perhitungan sebelum kunci | Bukan atomik antar potongan; aman karena id kanonis + RecordGuard menolak duplikat/perubahan nilai beku, dan retry idempoten (KN-05/11) | Diterima; dicatat |
| A-5 | Banyak berkas server dihasilkan build (`TransactionEngine.gs`, `TarifPlan.gs`, `ObligationEngine.gs`, …) | Perubahan wajib lewat sumber/`apply_*`; risiko salah edit | Diikuti (perubahan sesi ini lewat `_tarif_ops.gs.tpl`) |
| A-6 | `appsscript.json` tidak ada di repo | Konfigurasi `executeAs`/`access` tidak dapat diaudit | Butuh keputusan GAP-005 |
| A-7 | Tidak ada uji Apps Script otomatis selain harness `_live_tests/LiveReadiness.gs` | LockService, Session, kuota belum teruji | BLOCKED (lingkungan) |
| A-8 | Fungsi uji publik (`TEST_*`, `testBendaharaEvaluate`) dan `include` tanpa allowlist ikut berkas deploy | Permukaan publik lebih luas dari perlu (tidak membuka data sheet) | Usulan; audit dependensi `include` dulu |

---

## 4. Temuan keamanan

### 4.1 GAP-005 — autentikasi Gmail biasa (pengguna rutin: hanya bendahara)

| Pertanyaan | Jawaban (dokumentasi Apps Script; **belum diverifikasi live**) |
|---|---|
| Sumber identitas tepercaya | Hanya sesi Google yang dibaca server (`Session.getActiveUser()`), atau ID token Google yang diverifikasi server. Data dari klien (payload, `CentralAuth` di HTML) **tidak** tepercaya; kode tidak memakainya untuk otorisasi (HD-T7-06) |
| Batasan Session API | Dengan *Execute as: Me*, email pengunjung Gmail lain umumnya **kosong**; email terbaca bila yang mengakses adalah **pemilik deployment sendiri** atau satu domain Workspace. Dengan *Execute as: user accessing*, email terbaca tetapi pengguna wajib editor spreadsheet |
| Risiko pemalsuan identitas | Rendah selama identitas hanya dari sesi. Tinggi bila (a) *Execute as: user* (pengguna dapat mengedit `26_USER_ACCESS`), (b) akun pemilik diretas, (c) desain token yang salah |
| Konfigurasi realistis untuk **satu operator (bendahara) + Gmail** | **D1:** spreadsheet, folder bukti, dan proyek Apps Script dimiliki **satu akun Gmail institusi** (bukan akun pribadi). Web app *Execute as: Me*, akses **Only myself**. Bendahara masuk dengan akun institusi itu, sehingga identitas = pemilik dan `getActiveUser()` diharapkan terisi. `26_USER_ACCESS` memuat akun institusi sebagai BENDAHARA. Tidak ada pengguna lain yang dapat membuka web app |
| Konsekuensi D1 | KEPALA_SEKOLAH/YAYASAN/AUDITOR **tidak** dapat memakai aplikasi. Verifikasi LPJ & persetujuan (D-T7) tetap tidak mungkin. Audit tidak dapat membedakan orang bila akun dipakai bergantian. Pemeriksa dapat diberi akses **lihat** spreadsheet (bukan edit) bila disetujui pemilik |
| Kebutuhan akses | Akun institusi: pemilik spreadsheet, proyek, dan folder bukti. Pengguna lain: **tidak ada** hak edit (paling banyak lihat, atas keputusan pemilik) |
| Opsi lain | A: Workspace/Cloud Identity satu domain + *Execute as: Me* + akses domain (mendukung banyak peran). C: Gmail + ID token terverifikasi (proyek desain keamanan terpisah; **bukan** otomatis aman). B (*Execute as: user*): **tidak disarankan**. Rincian: `P1_25_AUDIT_AUTENTIKASI_GAP005.md`, `P1_25_KESIAPAN_INTEGRASI_NONPRODUKSI.md` §3 |
| Mencabut akses bendahara (D1) | Ganti sandi + reset 2SV akun institusi; "keluar dari semua sesi" di setelan akun Google; cabut sesi perangkat. Pergantian bendahara = serah terima kredensial akun institusi oleh Yayasan (bukan menambah akun baru). Bila model banyak akun (A/C): ubah status `26_USER_ACCESS` ke INACTIVE, berlaku pada panggilan berikutnya (identitas dihitung ulang per panggilan) |
| Status | **Tidak ada autentikasi baru yang diaktifkan.** GAP-005 **terbuka** sampai ada bukti `ltIdentitasProbe()` pada deployment uji dengan konfigurasi yang dipilih |

### 4.2 Temuan lain

| ID | Temuan | Status |
|---|---|---|
| S-1 | BENDAHARA dapat memberi peran BENDAHARA ke email lain (`OP_ROLE_ASSIGNABLE_BY_`) | Butuh keputusan (G-1) |
| S-2 | Fungsi publik tanpa gerbang (`include`, `TEST_*`, `testBendaharaEvaluate`, `doGet ?ping=1`) | Tidak membuka data sheet; usulan dikeluarkan dari deploy (A-8) |
| S-3 | `doPost` + device token (`25_DEVICE_WHITELIST`) | Dimatikan; jangan diaktifkan kembali |
| S-4 | Embedding | `XFrameOptionsMode.DEFAULT` (P0-C) |
| S-5 | Aktor audit | Dari sesi server (`ENGINE_ACTOR_`, `g.identity.email`), bukan klien |
| S-6 | Folder bukti | `BUKTI_FOLDER_ID` (Script Property); mode uji menolak tanpa folder uji; tanpa properti dicari berdasarkan nama di Drive akun yang menjalankan |
| S-7 | Rahasia/kredensial di repo | Tidak ditemukan; ID produksi hanya muncul di komentar dan konstanta penolak di harness/uji |

---

## 5. Rencana penguatan (perubahan minimal)

| # | Area | Kondisi saat ini (bukti) | Rencana | Status |
|---|---|---|---|---|
| H-1 | Penguncian operasi yang saling bergantung | Instrumentasi kunci atas **44 suite**: satu-satunya penulisan di luar `withLock_` adalah audit `opTarifApply` | Bungkus `opTarifApply` dalam satu kunci | **Dikerjakan** (`e1330dc`) |
| H-2 | Idempotensi operasi tulis | `clientRequestId` wajib untuk create (`opEngineWrite_`); `24_IDEMPOTENCY_LOG`; impor per batch; crid deterministik uang muka/LPJ; `expect` (optimistic concurrency) di koreksi/tautan | Tidak ada perubahan | Terpenuhi (tx_integrity, concurrency, um_lpj, lpj_bridge) |
| H-3 | Validasi alokasi dalam kunci yang sama | `apply_alloc_lock_server.js` (P1_19) | — | Terpenuhi (tx_integrity, alloc_siswa) |
| H-4 | Validasi identitas siswa | Alokasi lintas siswa & ke pengeluaran ditolak (P1_20 C, P1_21 D-2) | — | Terpenuhi (alloc_siswa, d2) |
| H-5 | Perlindungan kewajiban beku | RecordGuard id kanonis/duplikat/nilai terkunci/arsip berpembayaran (P1_23) | Jalur koreksi tetap ditahan | Terpenuhi (d1_kanon) |
| H-6 | Pencegahan transaksi ganda | Idempotensi + crid; LPJ crid per generasi (P1_24/P1_25) | — | Terpenuhi |
| H-7 | Konsistensi uang muka & pengembalian | Pengembalian tertaut sumber; arsip terdeteksi lewat peringatan | Guard arsip/koreksi pencairan (P1_25 §6.4) | **Menunggu keputusan** |
| H-8 | Penautan LPJ | Satu jalur efektif setelah skema lengkap; tolak tautan ke transaksi arsip | — | Terpenuhi (P1_25 aab0d48) |
| H-9 | Penolakan input tidak lengkap | Validasi engine, RecordGuard, SchemaGuard (tanggal kalender, periode, akun eksplisit, kategori master) | — | Terpenuhi (p0_hardening, audit_p1, kategori, akun_explicit) |
| H-10 | Kegagalan baca/tulis | `sgErr_` membedakan SCHEMA_MISMATCH/READ_FAILED/WRITE_FAILED; pemulihan `opRestoreRows_`/`sgUndoAppend_`/`umRollbackTrx_`; audit gagal → perubahan dibatalkan (P0-B) | — | Terpenuhi (p0_tests, schema_archive) |
| H-11 | Permukaan publik (A-8/S-2) | Lihat §4.2 | Allowlist `include`, keluarkan `TEST_*` dari berkas deploy | Usulan (audit dependensi `include` dulu) |
| H-12 | Manifest | Tidak ada | Simpan `appsscript.json` setelah keputusan GAP-005 | Menunggu keputusan |

### 5.1 Lapisan data (Tahap 5)

| Syarat | Bukti |
|---|---|
| Pemetaan kolom berdasarkan nama header | `sgHeaderModel_`/`sgModel_`/`sgRowArray_`; `readAllRows_` & `findRowIndexById_` berbasis nama (P0-A) |
| Validasi skema | Header wajib per sheet (`SG_REQUIRED_`/`opReadRequired_`); hilang/ganda → `SCHEMA_MISMATCH` (gagal tertutup, RD-04/T8) |
| Baca lengkap vs parsial | `opReadSheet` → `readStatus` `COMPLETE`/`PAGE`, `total`, `returned`; jumlah baris tidak cocok → `READ_FAILED`; klien wajib merangkai halaman |
| Tulis tervalidasi | RecordGuard + validasi engine sebelum `setValues`; satu `setValues` per baris/blok |
| Kunci pada operasi kritis | `withLock_` reentran; LH-03: 18 operasi tulis utama tanpa penulisan di luar kunci |
| Kegagalan yang jelas | Kode galat terstruktur (`errResult_`), `LOCK_TIMEOUT`, `ROLLBACK_PARTIAL`/`ROLLBACK_FAILED` bila pemulihan gagal |

**Google Sheets tidak punya transaksi database.** Strategi yang dipakai kode untuk mengurangi risiko:
1. Satu kunci skrip untuk seluruh operasi yang saling bergantung (validasi + tulis + audit).
2. Validasi lengkap **sebelum** penulisan pertama.
3. Urutan tulis tetap: baris → idempotensi → audit (terakhir). Kegagalan memulihkan langkah sebelumnya (nilai asal dikembalikan, baris baru dihapus).
4. Idempotensi, sehingga retry setelah respons hilang aman.
5. `expect` untuk konflik antar-klien.
6. Gagal tertutup pada skema rusak.

Yang **tidak** dapat dijamin: eksekusi yang dihentikan platform di tengah (batas waktu eksekusi, gangguan) tidak menjalankan pemulihan. Mitigasinya retry idempoten + rekonsiliasi audit manual. Kontensi `LockService` nyata (waitLock 10 dtk) **belum** diuji.

---

## 6. Perubahan kode yang benar-benar dilakukan

| Commit | Berkas | Fungsi | Isi |
|---|---|---|---|
| `e1330dc` | `_tarif_ops.gs.tpl` (sumber) → `TarifPlan.gs` (dihasilkan `build_all.js`) | `opTarifApply` (+ baru `tpApplyLocked_`) | Setelah gerbang & konfirmasi: `return withLock_(function () { return tpApplyLocked_(g); })`. Isi langkah tidak berubah; rencana, semua langkah tulis, dan audit kini di satu kunci. Kunci tidak didapat → `LOCK_TIMEOUT` tanpa menulis |
| `e1330dc` | `_build_tests/p1_25h_lock_tests.js` (baru), `run_all_tests.js` | — | Uji cakupan kunci (§7) |

Tidak ada perubahan pada data, skema sheet, KPI, autentikasi, `RecordGuard`, `ReconEngine`, atau berkas klien.

## 7. Hasil pengujian

### 7.1 Tes Node yang benar-benar dijalankan

| | Baseline | Akhir |
|---|---|---|
| Suite | 44 | **45** |
| PASS / FAIL / INFO | 744 / 0 / 67 | **747 / 0 / 67** |
| 44 suite lama | — | **Identik per suite** (perbandingan log otomatis: 0 berubah; `tarif_server_tests` 52/0 tetap) |
| Suite baru `p1_25h_lock_tests` | — | 3/0/0 |

Rincian `p1_25h_lock_tests`:
- **LH-01:** `opTarifApply` pada data mirip live → 0 penulisan tanpa kunci, 1 audit. **Terbukti FAIL pada kode sebelum perbaikan** (audit `13_AUDIT_LOG` via `sgAppend_ ← auditPush_ ← opTarifApply` tanpa kunci).
- **LH-02:** kunci sibuk → `LOCK_TIMEOUT`, seluruh sheet identik; penerapan berikut berhasil; penerapan ulang "Tidak ada perubahan".
- **LH-03:** 18 operasi tulis utama → 0 penulisan tanpa kunci.

Probe instrumentasi kunci atas seluruh 44 suite (alat sekali jalan, tidak di-commit): satu-satunya temuan adalah LH-01. `gap005_tests` GE-02 gagal **hanya di bawah probe**, karena probe menggantikan `getActiveSpreadsheet` yang juga dimodifikasi uji itu. Suite itu tetap PASS tanpa probe.

**Tidak ada asersi lama yang diubah.**

### 7.2 Tes Apps Script yang direncanakan (belum dijalankan)

`ltPreflight` → `ltIdentitasProbe` (per akun & konfigurasi) → `ltReadOnlyChecks` → `ltRejectionChecks` → `ltKewajibanBekuAudit` → `ltLpjSetupPreview`/`ltLpjSetupApply` (salinan) → uji LPJ I-1..I-12 (P1_25 §5.3) → `ltPostflight`.

Tambahan khusus hardening:
- dua eksekusi bersamaan `opTarifApply` + transaksi biasa: tidak ada baris audit/transaksi yang tertimpa; satu pihak mendapat `LOCK_TIMEOUT` atau menunggu;
- durasi kunci `opTarifApply` pada data penuh (< batas waktu eksekusi).

### 7.3 Tes integrasi yang masih BLOCKED

Semua tes §7.2: LockService nyata, `Session.getActiveUser` untuk Gmail/konfigurasi D1, kuota & waktu eksekusi, Drive folder bukti, render UI di peramban, dan audit pada data salinan (D-1, U-5, 544 TEREKONSILIASI).

## 8. Risiko yang belum selesai

| ID | Risiko |
|---|---|
| R-1 | GAP-005 terbuka (Gmail). D1 realistis untuk satu operator tetapi meniadakan peran verifikator |
| R-2 | Arsip/koreksi transaksi pencairan/pengembalian uang muka membuat saldo ≠ FCC (A-2/H-7) |
| R-3 | BENDAHARA dapat menambah BENDAHARA (S-1) |
| R-4 | Skor KPI dihitung klien (A-3) |
| R-5 | Kegagalan eksekusi di tengah (dihentikan platform) tidak terkompensasi otomatis |
| R-6 | `opTarifApply` kini memegang kunci lebih lama; pengguna lain dapat menerima `LOCK_TIMEOUT` (10 dtk) selama penerapan tarif. Operasi tarif jarang dan dilakukan BENDAHARA sendiri |
| R-7 | Permukaan publik tambahan (S-2/A-8) |
| R-8 | 544 TEREKONSILIASI tidak diverifikasi tanpa salinan sah; GAP-028 tetap **BLOCKED** |

## 9. Prosedur rollback

Diuji di worktree terpisah:
- `git revert --no-edit e1330dc` → tree **identik** dengan `f89cb5a` (diff 0 baris);
- `node build_all.js && node run_all_tests.js <prefix>` → **44 suite, 744/0/67** = baseline.

```
git revert --no-edit e1330dc
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```

Revert ini bersih karena commit tunggal yang menambah suite di akhir daftar runner. Tidak ada rollback data (tidak ada data yang diubah).

## 10. Keputusan yang masih diperlukan

1. **GAP-005 / model akun:** D1 (satu akun Gmail institusi, *Execute as: Me*, *Only myself*), A (domain Workspace/Cloud Identity), atau C (token, proyek terpisah). Juga: siapa pemilik akun institusi dan prosedur serah terima/pencabutan bendahara.
2. **Akses pemeriksa** (Kepala Sekolah/Yayasan/Auditor) pada model D1: tanpa akses, atau hanya lihat spreadsheet.
3. **S-1:** siapa yang boleh menambah peran BENDAHARA.
4. **H-7:** izin implementasi guard arsip/koreksi transaksi pencairan/pengembalian, dan jalur koreksi resmi.
5. **H-11:** izin mengeluarkan `TEST_*`/`testBendaharaEvaluate` dari berkas deploy dan membatasi `include`.
6. **A-3:** apakah skor KPI perlu dihitung/diverifikasi di server (analisis dampak terpisah; KPI tidak diubah).
7. **Lingkungan uji** (salinan, proyek uji, akun, folder bukti) agar status dapat naik dari BLOCKED.
