# P1_03 — Laporan Implementasi Revisi Kebijakan Periode & Rekonsiliasi

**Tanggal:** 17 Oktober 2026
**Branch:** `claude/vigilant-bell-967cih` (lokal `p1/implementasi`)
**Status: `READY_FOR_INTEGRATION_TEST`** (bukan `P1_COMPLETE`): uji live Apps Script + salinan Google Sheets **belum dilakukan**.

## 1. Commit

| Commit | Isi |
|---|---|
| `31bb919` | P1 sebelum revisi kebijakan (hard lock periode aktif) |
| `21284a8` | **Commit dasar**: `P1_03_POLICY_CHANGE_AUDIT.md` (audit sebelum kode) |
| `79e2b66` | **Commit perubahan (tunggal, terisolasi)**: `P1-POLICY`, berisi kode + tes + log |
| (commit dokumen ini) | Laporan ini, usulan `P1_04`/`P1_05`, catatan di `P1_02` |

**Dapat di-revert:** `git revert 79e2b66` diuji di worktree terpisah. Hasilnya bersih tanpa konflik, dan pohon kerja **identik** dengan `21284a8`.

## 2. Kebijakan yang diterapkan (keputusan pengguna 17-10-2026)

1. **Status CLOSED/TERKUNCI = penanda administratif, bukan hard lock.**
   - Pencatatan rutin dan koreksi pada periode bertanda diterima bila lolos otorisasi dan validasi.
   - Setiap operasi pada periode bertanda atau terlapor menulis baris audit `PERIODE_DITANDAI` di **append audit yang sama** dengan audit wajib. Respons memuat `periodeDitandai`.
   - "Terlapor" = ada baris `17_LAPORAN` aktif untuk periode itu.
2. **Status periode dan riwayat closing dipertahankan.**
   - Close/reopen tetap lewat server; reopen wajib alasan; keduanya diaudit.
   - Key `blob.periodClosing.*` dan `periodeStatus.*` hanya dapat diubah lewat API. Kode galat diganti dari `PERIOD_LOCK_API_REQUIRED` menjadi `PERIOD_STATUS_API_REQUIRED`.
   - Data `periodeStatus.*` tidak pernah ditulis.
3. **Tiga jenis tanggal tetap terpisah.**
   - Tanggal transaksi = tanggal aktual kiriman.
   - Periode kewajiban = `06_ALOKASI.periode` / `04_KEWAJIBAN.periode`.
   - Periode laporan = parameter baca.
   - Tidak ada pelunasan otomatis.
4. **Rekonsiliasi: batas akhir bulan.**

   | Istilah | Sumber | Disimpan? |
   |---|---|---|
   | Saldo bank per tanggal batas | `saldoAktual` | Ya, `16_REKONSILIASI` |
   | Saldo sistem per tanggal batas | `saldoSistem` = saldo awal + transaksi sah dengan tanggal ≤ `tanggalBatas` | Ya, nilai beku |
   | Selisih | `saldoAktual − saldoSistem` | Ya |
   | **Saldo sistem terkini** | `saldoSistemTerkini` = rumus sama **tanpa** batas | **Tidak**; hanya di respons dan audit |

   - **Tidak ada kolom baru** dan tidak ada migrasi.
   - Status periode tidak menolak rekonsiliasi.
   - Selisih tidak ditutup otomatis.
5. **Teks modal reopen** persis: "Status periode bersifat penandaan administratif untuk pelaporan; pencatatan tetap dapat dilakukan dan tercatat di audit."

## 3. File dan fungsi yang berubah (`git diff 21284a8 79e2b66`)

| File | Fungsi | Perubahan |
|---|---|---|
| `PeriodLock.gs` | `plGuard_` (**dihapus**); `plMarkContext_`, `plFlags_`, `plMarkAfter_` (**baru**); `plClosedFrom_` | Penanda yang tidak pernah menolak; status blob rusak menjadi penanda `statusTidakTerbaca`. Peta status kini membedakan CLOSED/TERKUNCI |
| `TransactionEngine.gs` (generate, via `apply_p1_server.js`) | `createTransactionWithAllocations_`, `createAllocation_`, `createBankMutation_`, `updateTransaction_` | Baris `plGuard_` diganti `plFlags_`. Penanda masuk `engineAuditBatch_` (satu append bersama audit wajib dan jejak aktor/role); `periodeDitandai` di respons |
| `RecordEngine.gs` | `opRecordBatchLocked_` (closure `guard`), `opArchiveTransaction`, `opArchiveAllocation`, `opSettingsUpsert` | Penanda masuk audit batch yang sama; arsip tidak ditolak; kode galat status API |
| `RecordGuard.gs` | `rgCheckOp_`, `rgContext_`; `rgPeriodFlags_` (**baru**); `RG_LOCK_FIELD_` → `RG_PERIOD_FIELD_` | Penolakan periode dihapus. **Aturan integritas lain tidak berubah** |
| `ReconEngine.gs` | `opReconcileAccount`, `opMatchMutasi` | Tidak ditolak karena status. `tanggalBatas` + `saldoSistemTerkini` di respons/audit (juga saat replay). Penanda periode di audit |
| `Bendahara_V2.html` (generate, via `apply_p1_client.js`) | `reopenPeriode`, komentar `closePeriode`, `CC_PERMANENT_` | Hanya teks modal reopen + komentar + pemetaan kode galat baru (lihat §6) |
| `_build_tests/e2e_central2.js` | I2b (**baru**), I3, pencarian `gid` | I2b: pengeluaran via UI pada September CLOSED tersimpan tanpa reopen. Pencarian `gid` dipertajam karena I2b menambah transaksi `gas_trx_` lebih dulu |
| `_build_tests/p1_tests.js` | Helper `marks`/`markedWith`/`flagOf`; P1L-01,03..08,10,13,14 direvisi; P1P-01..11 baru | §5 |

**Yang tidak berubah** (diperiksa lewat diff):
- `opGate_` dan peran.
- Validasi field/FK.
- `AllocationGuard`, batas LPJ, aturan bukti.
- `_expect`/`expect` (CONFLICT).
- Idempotensi.
- ObligationEngine (verbatim klien) dan FinanceEngine.

## 4. Pemetaan GAP – test case

| GAP / TC | Dampak kebijakan | Tes |
|---|---|---|
| **GAP-015** | Rekomendasi hard lock **ditimpa keputusan**. Yang tetap: reopen beralasan + koreksi tercatat (penanda audit) | P1L-01..14, P1P-04, e2e I2b/I3 |
| **TC-CRUD-05** | Ekspektasi dokumen (`PERIOD_LOCKED`) **bertentangan dengan keputusan**. Tes direvisi: diterima, tanggal 2026-07-15 tetap, penanda TERKUNCI. Revisi dokumen 07 menunggu pemilik dokumen | P1L-01, P1L-13 |
| TC-REK-03 | Dipertahankan (batas akhir bulan) + saldo terkini terpisah | P1P-07/08/09, P1R-01..04 |
| TC-REK-02 / GAP-019 | Tidak berubah; enum menunggu keputusan (`P1_04`) | P1R-05/06/09 |
| GAP-021 (kewajiban beku) | Pembekuan periode TERKUNCI kini berhasil. **Temuan:** sebelum revisi, `opObligationSnapshot('Juli 2026')` melapor `SUCCESS` padahal setiap baris ditolak `PERIOD_LOCKED` (kegagalan diam-diam) | P1P-05 |
| TC-FAIL-03 / GAP-013 | Tanpa keadaan parsial: audit gagal → transaksi, idempotensi, dan penanda semuanya batal | P1P-10 (engine), P1P-11 (record) |
| TC-AUTH-01/02 | Otorisasi tetap | P1P-06, P1S-01 |
| TC-FAIL-02/07, GAP-026/031 | Tetap | P1A-*, P1C-* |
| GAP-018/025 (BDS03) | Tidak diimplementasikan; usulan `P1_05` | — |

## 5. Hasil seluruh suite (sandbox Node, dijalankan di `79e2b66`)

| Suite | Lulus | Gagal | Log |
|---|---|---|---|
| server_pass2 | 58 | 0 | `_test_logs/p1policy_server_pass2.log` |
| e2e_central2 | 83 | 0 | `_test_logs/p1policy_e2e_central2.log` (+1: I2b) |
| tarif_server_tests | 52 | 0 | `_test_logs/p1policy_tarif_server_tests.log` |
| tarif_client_tests | 40 | 0 | `_test_logs/p1policy_tarif_client_tests.log` |
| schema_archive_tests | 27 | 0 | `_test_logs/p1policy_schema_archive_tests.log` |
| p0_tests | 44 | 0 | `_test_logs/p1policy_p0_tests.log`, plus **1 INFO** (TC-HDR-01 butuh header live) |
| p1_tests | **60** | 0 | `_test_logs/p1policy_p1_tests.log` |
| **Total** | **364** | **0** | |

**Suite P1 yang sama dijalankan pada kode sebelum revisi (`21284a8`): 43 lulus / 17 gagal** (`_test_logs/p1prepolicy_p1_tests.log`).
- 17 kegagalan itu tepat terdiri dari tes kebijakan baru: 10 tes hard lock yang direvisi dan 7 P1P baru.
- P1P-01/02/03/06 sudah lulus di kode lama karena tidak menyentuh periode bertanda.

Daftar tes per butir Tahap 3:

| # | Tes | Hasil |
|---|---|---|
| 1 Penerimaan terlambat pada tanggal aktual | P1P-01 | PASS |
| 2 Kewajiban belum dibayar tetap terlihat | P1P-02 | PASS |
| 3 Tanpa pelunasan otomatis | P1P-03 | PASS |
| 4 Koreksi historis beraudit | P1P-04, P1L-03 | PASS |
| 5 TERKUNCI tidak memblokir rutin | P1L-01..14, P1P-05, e2e I2b | PASS |
| 6 Tidak berwenang tetap ditolak | P1P-06, P1S-01 | PASS |
| 7 Saldo rekonsiliasi s.d. tanggal batas | P1P-07 | PASS |
| 8 Transaksi sesudah batas tidak mengubah saldo periode lalu | P1P-08 | PASS |
| 9 Saldo terkini berbeda tepat (= Σ bersih transaksi sesudah batas) | P1P-09 | PASS |
| 10 Mutasi tidak dicocokkan dua kali | P1R-05, P1R-09 | PASS |
| 11 Audit, idempotensi, konflik | P1A-01..07, P1C-01..06, P1P-10/11 | PASS |
| 12 KPI & UI tidak berubah | P0D-04/05/06, P0U-01/02/03 | PASS |

**Belum dapat diuji (BLOCKED):**
- Seluruh pengujian live.
- TC-FAIL-06 (paralel nyata).
- TC-AUTH-08 (izin Drive).
- TC-HDR-01 (INFO).

## 6. Bukti bahwa rumus, bobot, target, saldo awal, dan data historis tidak berubah

| Hal | Bukti |
|---|---|
| Rumus, bobot, target, ambang KPI | P0D-05: 13 simbol definisi/rumus KPI **identik** dengan baseline `802cbed`. P0D-04: skor 6 induk + 31 indikator identik pada data yang sama. P0D-06: isi `kpiIndukSummary` utuh |
| UI | P0U-02: markup/CSS di luar `<script>` identik. P0U-03: 754 fungsi baseline ada |
| Perubahan `Bendahara_V2.html` vs `21284a8` | Hanya 4 baris: 2 komentar, 1 teks modal reopen, dan 1 entri peta galat `PERIOD_STATUS_API_REQUIRED` |
| Saldo awal | `git diff 21284a8 79e2b66` pada `*.gs` + `apply_p1_server.js`: **0** baris yang menyentuh `saldoAwal`. Rekonsiliasi hanya **membaca** `07_AKUN.saldoAwal` |
| Data historis / status pembayaran | Tidak ada kode baru yang menulis data selain operasi yang diminta pengguna. `periodeStatus.*` tidak ditulis (P1L-13: nilai tetap TERKUNCI setelah reopen). Tidak ada migrasi dan tidak ada akses Sheets/Drive |
| Skema | 16_REKONSILIASI tidak bertambah kolom (P1P-09 memeriksa header). Tidak ada sheet baru |
| Build | Deterministik: rebuild ulang → MD5 identik |

## 7. Sisa GAP dan keputusan yang masih dibutuhkan

| # | Hal | Dokumen |
|---|---|---|
| 1 | Arti TEREKONSILIASI (T1/T2) dan opsi koreksi 544 status mutasi; status TERIDENTIFIKASI (TC-REK-02) | `P1_04` |
| 2 | Sheet `30_ALOKASI_PENGELUARAN`, satu aturan pencocokan KPI = FCC, status RAB DIAJUKAN, persetujuan di luar RAB | `P1_05` |
| 3 | Revisi teks TC-CRUD-05 di `07_RANCANGAN_TEST_CASE.md` agar sesuai kebijakan | Pemilik dokumen 07 |
| 4 | Rekonsiliasi dengan batas tengah bulan (butuh kolom tanggal batas) | Ditunda sesuai keputusan butir 4 |
| 5 | Sisa butir `P1_02` §3 (GAP-014 enum, GAP-017/020/041/045 skema, GAP-024 bukti di form input) | `P1_02` |
| 6 | Transfer antar-akun (GAP-028) | Tetap diblokir |

## 8. Hambatan pengujian live

Hambatan H1–H6 (`P1_00` §2) masih berlaku:
- Tidak ada proyek Apps Script uji, salinan spreadsheet terverifikasi, maupun `clasp`/kredensial.
- Sandbox tidak menguji tipe sel nyata, kuota, LockService lintas eksekusi paralel, atau atomisitas `setValues` multi-baris di Sheets.

Atomisitas `setValues` multi-baris adalah dasar klaim "tanpa keadaan parsial" untuk penanda dan audit. **Wajib diverifikasi live.**

## 9. Langkah uji pada proyek Apps Script dan salinan Google Sheets

Langkah 1–3 dilakukan pengguna; kredensial tidak dibagikan ke percakapan.

1. **Buat salinan** spreadsheet FINAL (File → Make a copy) dan catat ID-nya. **Jangan** gunakan produksi.
2. **Buat proyek Apps Script terpisah** yang terikat ke salinan itu. `clasp login` dan `clasp push` di mesin pengguna.
   - `.gs`: berkas P0 + `PeriodLock`, `RecordGuard`, `ReconEngine`, `RabMapping`.
   - `.html`: `Bendahara_V2`, `ServerBridge`.
   - **Tanpa** `deps/`.
3. **Deploy** sebagai Web App uji (Execute as / Who has access sesuai GAP-005). Daftarkan akun uji di `26_USER_ACCESS` salinan.
4. **Prapemeriksaan read-only:**
   - `opSchemaReport()`.
   - `opPeriodLockStatus()`: pastikan Juli–September terbaca TERKUNCI sebagai **penanda**.
   - `opSchemaPlan()`.
5. **Jalankan TC live**, dengan status PASS/FAIL/BLOCKED dicatat per TC:
   - TC-CRUD-05 versi direvisi: penerimaan 2026-07-15 diterima + audit `PERIODE_DITANDAI`.
   - Penerimaan terlambat Oktober untuk kewajiban Juli.
   - TC-REK-03: rekonsiliasi September dengan rekening koran, lalu tambah transaksi Oktober, lalu cek saldo per batas tetap dan saldo terkini berbeda tepat.
   - TC-FAIL-03 dengan memproteksi `13_AUDIT_LOG` di salinan: tidak ada transaksi atau penanda yang tertinggal.
   - TC-FAIL-07 dengan dua sesi browser.
   - TC-AUTH-01/02 dengan akun AUDITOR dan akun tidak terdaftar.
   - Regresi KPI (skor sebelum/sesudah pada salinan).
6. **Catat hasil** di laporan baru. Status `P1_COMPLETE` hanya boleh dinyatakan setelah semua TC P0 dan P1 lulus live.

**Produksi tidak disentuh.** Tidak ada deployment, akses spreadsheet, migrasi, perubahan saldo awal, atau perubahan data historis.
