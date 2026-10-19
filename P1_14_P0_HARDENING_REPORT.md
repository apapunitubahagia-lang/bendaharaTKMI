# P1_14 — Laporan P0 Data Integrity & Security Hardening (T8, T4, T7, T1)

**Tanggal:** 19 Oktober 2026
**Status proyek: READY_FOR_INTEGRATION_TEST.** Semua hasil berasal dari **simulasi lokal (sandbox Node)**. Integrasi live Apps Script + Google Sheets **belum dijalankan**.

## 0. Verifikasi awal dan commit

Kondisi awal: branch `p1/implementasi` = `claude/vigilant-bell-967cih` = remote `184b7f9`, working tree bersih.

| Commit | Isi |
|---|---|
| `2bda4b4` | **P0-T8**: skema & data parsial |
| `c76db65` | **P0-T4**: validasi tanggal/periode |
| `be84d9c` | **P0-T7**: otorisasi peran |
| `ea2e9bc` | **P0-T1**: pengaman tombol LPJ + tes regresi |
| (commit dokumen) | P1_14, P1_02, 07, P1_13 |

**Uji revert** (worktree sementara):
- Revert berurutan T1 → T7 → T4 → T8 + build ulang menghasilkan tree **identik** dengan `184b7f9`.
- `ea2e9bc` dapat di-revert sendiri (build OK; suite lama PASS).
- Commit lebih tua yang di-revert sendiri **berkonflik** pada berkas tes bersama (`p0_hardening_tests.js`, `audit_p1_tests.js`), sehingga harus di-revert berurutan.
- **T1 bergantung pada T8** (`centralSourcesStatus_`).

**Tidak disentuh:**
- `PERIOD_MISMATCH`, kebijakan lintas bulan, persetujuan RAB susulan, K-RAB-07, model uang muka;
- bobot/target/ambang/formula KPI, 544 status TEREKONSILIASI, transfer antar-akun;
- data historis, deployment.

---

## 1. T8: skema & data parsial

### 1.1 Audit

| Jalur baca | Sebelum | Sesudah |
|---|---|---|
| `opReadSheet` (dipakai cache klien untuk 15 sheet: 04, 05, 06, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 30) | Header tidak diperiksa; header salah = OK; `lastCol < 1` = OK kosong | Kolom wajib diperiksa tiap halaman → `SCHEMA_MISMATCH` + `missing`/`requiredHeaders`; kegagalan baca → `READ_FAILED`; header kosong → `SCHEMA_MISMATCH` |
| `sgRowsChecked_` / `sgModel_` (mesin server: FCC, kewajiban, RAB, impor) | Sudah gagal tertutup (P0-A) | Tidak berubah |
| Master (`MasterDataRead`) | P0-A | Tidak berubah |
| Klien `centralReadAllPages_` | Halaman kosong sebelum total tercapai → data parsial dianggap lengkap | `PARTIAL_READ` bila total berubah antar-halaman atau baris ≠ total |

**Kolom wajib** (`opReadRequired_` = `SG_REQUIRED_` ∪ `OP_READ_REQUIRED_EXTRA_`). Semuanya ada di header FINAL (HD-T8-10):

| Sheet | Kolom wajib |
|---|---|
| 10_BUKTI | id, transaksiId, tanggal |
| 11_MUTASI_BANK | id, tanggal, nominal, status, transaksiId |
| 12_DUP_REVIEW | id, pairKey, status |
| 13_AUDIT_LOG | id, timestamp, aksi |
| 14_KPI | id, periode, kpiKode |
| 17_LAPORAN | id, periode, tanggalDibuat, snapshot |
| 19_LPJ | id, tanggal, nominal, transaksiId |
| lainnya | `SG_REQUIRED_` yang sudah ada (04, 05, 06, 08, 09, 16, 18, 30) |

### 1.2 Format respons `opReadSheet` (aditif; field lama tetap)

- `ok:true, data.readStatus = 'COMPLETE'`: offset 0 dan seluruh baris terbaca.
- `ok:true, data.readStatus = 'PAGE'`: satu halaman; klien wajib merangkai sampai `total`.
- `ok:false` (`SCHEMA_MISMATCH` / `READ_FAILED` / `VALIDATION_ERROR`): ERROR, tidak pernah dikembalikan sebagai data kosong.
- `30_ALOKASI_PENGELUARAN` yang belum ada = `COMPLETE` + `sheetMissing` (kosong yang sah, K-RAB-08).

**PARTIAL/DEGRADED tidak dibuat** sebagai status sukses. Data yang tidak lengkap selalu ERROR di klien (`PARTIAL_READ`).

### 1.3 Peta dependensi

| Pemakai | Sheet sumber | Gerbang |
|---|---|---|
| KPI BDS01 | 04, 05, 06 + master (siswa, komponen, tarif) | `kpiDataStatus_` (P0-D, semua-atau-tidak, **tidak diubah**): 04, 05, 06, 08, 09, 10, 11, 16, 17, 30 + master |
| KPI BDS02 | 11, 05, 16, master akun | idem |
| KPI BDS03 | 05, 08, 30, 09 (I05), master kategori | idem |
| KPI BDS04 | 07 (master), 05, 16 | idem |
| KPI BDS05 | 10, 05, 17 | idem |
| KPI BDS06 | 17, 08, 05, 07 | idem |
| Tile Beranda (saldo/penerimaan/pengeluaran) | 05 + master | **baru**: `centralSourcesStatus_(['transaksi'])` |
| Kartu RAB Beranda, Laporan Anggaran, ekspor anggaran | 05, 08, 30 | **baru**: `RAB_SOURCE_KEYS_` |
| Kontrol Keuangan, Anggaran vs Aktual, verifikasi FCC | 05, 06, 08, 09, 16, 18, 30 + master | **baru**: `FCC_SOURCE_KEYS_` |
| "Perlu Tindakan" (7 baris) | per baris (`src`) | **baru**: N/A, bukan 0 |
| Tab Laporan | `REPORT_SOURCE_KEYS_` per tab | **baru**: banner DATA TIDAK LENGKAP (tabel tetap tampil, tidak disembunyikan); ekspor diblokir |

### 1.4 Berkas dan fungsi

- `OperationalAPI.gs`: `OP_READ_REQUIRED_EXTRA_`, `opReadRequired_`, `opReadSheet`.
- `_build_tests/apply_p0_t8_client.js` (baru): `centralSourcesStatus_`, `centralUnavailableInline_`/`Card_`, `centralReadAllPages_`, `renderBeranda` (tile, kartu RAB, Perlu Tindakan), `renderLaporan`, `exportReport`, `renderFinancialControl`, `renderAnggaranBanding`, `centralFccVerify`.

## 2. T4: validasi tanggal & periode

**Fungsi bersama** (`SchemaGuard.gs`):
- `sgDateError_`: `YYYY-MM-DD` persis, tanpa jam, kalender nyata termasuk kabisat;
- `sgDateTimeError_`: ISO `…Z`;
- `sgPeriodLabelError_(p, allowNonMonth)`: label bulan; opsional `Tahun Ajaran YYYY/YYYY+1` dan `SekaliBayar`.

Fungsi ini tidak menormalisasi dan tidak mengoreksi nilai.

**Aturan umum:**
- Validasi hanya saat nilai **dibuat** atau **diubah**.
- Baris historis tidak diperiksa ulang dan tidak dikoreksi (HD-T4-04).
- Field opsional boleh kosong.

| Jalur | Field | Wajib? | Aturan | Status |
|---|---|---|---|---|
| `opCreateExpense` / `opCreateIncome` / `opCreateTxBatch` | tanggal | Wajib | date | Diverifikasi sandbox (HD-T4-01) |
| `opUpdateTransaction` | tanggal | Wajib bila diubah | date | Diverifikasi sandbox |
| `doPost` lama (`routeAction_`) | tanggal | Wajib | date (engine yang sama) | **BELUM DIVERIFIKASI** (jalur dinonaktifkan) |
| `lpj` (`opRecordBatch`) | tanggal | Wajib | date | Diverifikasi |
| `komitmen` | tanggal / jatuhTempo | Wajib / opsional | date | Diverifikasi |
| `mutasiBank` | tanggal | Wajib | date | Diverifikasi |
| `bukti` (record) / `opUploadBukti` | tanggal | Opsional (upload: kosong = hari ini) | date | Diverifikasi |
| `anggaran` (RAB) | periode | Wajib | bulan / Tahun Ajaran / SekaliBayar | Diverifikasi (HD-T4-02) |
| `kewajiban` | periode | Wajib | idem | Diverifikasi |
| `laporan` | periode / tanggalDibuat | Wajib / opsional | bulan / date atau ISO | Diverifikasi |
| `kpi` | periode | Wajib | bulan | Diverifikasi |
| `rkat` | tahun | Opsional | 4 digit | Diverifikasi (HD-T4-03) |
| `opSettingsUpsert` | periodeAktif | — | bulan | Diverifikasi |
| `opReconcileAccount`, `opClosePeriod` | periode | Wajib | bulan (sudah ada) | Diverifikasi |
| Rekonsiliasi lewat record generik | — | — | ditolak `USE_DEDICATED_API` | Sudah ada |
| `30_ALOKASI_PENGELUARAN` | — (tidak punya tanggal; periode dari transaksi) | — | — | — |
| `06_ALOKASI.periode` | — | — | tidak langsung: harus cocok dengan kewajiban yang ada (`OBLIGATION_NOT_FOUND`) | Sudah ada |
| Master siswa (`tanggalMasuk`/`tanggalKeluar`), 23_TAHUN_AJARAN, 12_DUP_REVIEW (`decidedAt`) | — | — | tidak divalidasi | **BELUM DIVERIFIKASI / belum dicakup** |
| Klien `normalizeDateValue` (impor) | — | — | masih tanpa cek kalender; server menolak (HD-T4-05) | Otoritas di server |

**Hasil matriks** (HD-T4-01): `2026-10-19` dan `2024-02-29` diterima. Ditolak: `2026-13-40`, `2026-02-30`, `2025-02-29`, `19/10/2026`, `2026-1-9`, dan `2026-10-19T08:00:00` (sufiks jam **tidak diizinkan** pada field tanggal). `""`/`null` ditolak pada field wajib dan diterima pada field opsional.

**Berkas:** `SchemaGuard.gs`, `RecordGuard.gs` (`RG_DATE_FIELDS_`, `rgDateFieldError_`), `BuktiDrive.gs`, `RecordEngine.gs` (`opSettingsUpsert`), `_build_tests/apply_p0_t4_server.js` (baru; `validateTanggal_` di `TransactionEngine.gs`).

## 3. T7: otorisasi pengelolaan peran

**Audit:**
- Satu-satunya jalur tulis `26_USER_ACCESS` adalah `opUserUpsert`. Tidak ada di `OP_RECORDS_`, `OP_MASTER_`, maupun `OP_READ_SHEETS_`.
- `deps/AUTH_CENTRAL_TEST.gs` hanya membaca dan tidak di-deploy.
- Aktor selalu dari sesi (`opGate_` → `getCurrentUserIdentity`).
- `opAuditAppend` memaksa aktor sesi dan awalan `UI_`.

**Aturan baru** (`AdminAPI.gs`):

| Kasus | Hasil |
|---|---|
| BENDAHARA memberi KEPALA_SEKOLAH/YAYASAN (baru atau ubah) | `PRIVILEGED_ROLE_CHANGE_DENIED` |
| BENDAHARA mengubah, menonaktifkan, atau memindah email pengguna KEPALA_SEKOLAH/YAYASAN | `PRIVILEGED_ROLE_CHANGE_DENIED` |
| BENDAHARA menaikkan peran sendiri | `PRIVILEGED_ROLE_CHANGE_DENIED` |
| BENDAHARA menurunkan atau menonaktifkan diri sendiri | `SELF_LOCKOUT` (aturan lama) |
| BENDAHARA memindah akun sendiri ke email lain | `SELF_ROLE_CHANGE_DENIED` |
| BENDAHARA menambah/mengubah BENDAHARA atau AUDITOR lain | Diizinkan (lihat D-T7) |
| Field peran/identitas palsu di payload (`actorRole`, `identity`, `createdBy`) | Diabaikan; keputusan berdasarkan sesi |
| `getCurrentUserIdentity` dengan objek klien | `authorized:false` |

**Pemberian peran istimewa saat ini hanya di luar aplikasi** (pemilik spreadsheet) sampai peran admin terpisah diputuskan.

**GAP-005:** keandalan `Session.getActiveUser()` di Apps Script live **belum diverifikasi**, karena `executeAs`/akses belum diputuskan. **Autentikasi live tidak diklaim aman** (HD-T7-09, INFO).

## 4. T1: pengaman sementara tombol LPJ

| Pengaman | Detail | Tes |
|---|---|---|
| Akun sumber wajib dipilih | Modal menampilkan daftar Kas/Bank tanpa pilihan awal; `akunKasBankList[0]` tidak lagi dipakai | HD-T1-01 |
| Kategori wajib dipilih | Default `kategoriPengeluaranList[0]` dihapus; kategori LPJ diisi awal hanya bila ada di master | HD-T1-02 |
| Potensi ganda → diblokir | Ada PENGELUARAN unit sama, ≤ 62 hari sebelum tanggal LPJ, kategori sama (atau kategori LPJ kosong/tidak dikenal), dengan sisa belum ber-LPJ ≥ nominal LPJ. Pesan menyebut transaksi yang mungkin sama. Batas 62 hari adalah **pemblokiran kehati-hatian, bukan kebijakan akuntansi** | HD-T1-03, AU-T1-04 |
| Sumber tidak lengkap / LPJ server tidak aktif → diblokir | `centralSourcesStatus_(['transaksi','lpj'])`, `ccActive_('lpj')` | HD-T1-08 |
| Validasi LPJ | Nominal > 0; tanggal kalender (`lpjValidDate_`) | HD-T1-06 |
| Satu LPJ = satu transaksi | Id lokal `trx_lpj_<lpjId>` menghasilkan `clientRequestId` tetap; klik ganda atau coba ulang setelah gagal simpan tidak membuat transaksi kedua | HD-T1-05 |
| Kegagalan penulisan server | Tidak ada transaksi/tautan di server; badge "Gagal sinkron"; coba ulang diblokir | HD-T1-07 |
| Status tautan dari server | "Sudah" hanya bila baris `19_LPJ` di server memuat transaksiId; selain itu "Menunggu server" / "Gagal sinkron" | HD-T1-04 |

**Berkas:** `_build_tests/apply_p0_t1_client.js` (baru), berisi `openCreateTransaksiFromLpjUnitModal`, `createTransaksiFromLpj`, `lpjDuplicateCandidates_`, `lpjTrxIdFor_`, `lpjValidDate_`, `lpjLinkBadge_`.

**Tidak ada:** tautan ke transaksi yang sudah ada, konsep uang muka baru, penghapusan transaksi, perubahan saldo historis.

## 5. Ekspektasi tes lama yang diubah (dengan alasan)

| Tes | Perubahan | Alasan |
|---|---|---|
| `server_pass2` R23 | Peran pengguna baru KEPALA_SEKOLAH → AUDITOR | Bertentangan langsung dengan T7. Tujuan tes (normalisasi email, id server, audit) tetap |
| `e2e_central2` U2/U3 | Pengguna baru via UI: `staf@x.id` AUDITOR (semula `kepsek@x.id` KEPALA_SEKOLAH) | Sama dengan R23 |
| `e2e_central2` U5 | Pengguna KEPALA_SEKOLAH disiapkan langsung di sheet sebelum uji pembatasan peran | Jalur pemilik spreadsheet; U5 tetap menguji KEPALA_SEKOLAH tidak dapat menulis |
| `rab_tests` RAB-35 | Tanggal mustahil kini harus **ditolak** | Semula karakterisasi temuan T4 ("menunggu U-4"); perbaikan diminta eksplisit (Bagian B) |
| `audit_p1_tests` AU-T1-04 | M1 kini harus **diblokir** (0 transaksi baru, 0 tautan) | Semula membuktikan temuan T1 terjadi; pengaman diminta (Bagian D). M1/M2 memilih akun/kategori eksplisit |
| `audit_p1_tests` AU-T1-03, AU-S30-03/04, AU-K7-02 (INFO) | Teks mengikuti hasil terukur (TERBUKA/TERTUTUP) | Teks lama menyatakan temuan masih terbuka, padahal sudah tertutup |

Tidak ada tes yang dihapus.

## 6. Hasil tes (lokal, `run_all_tests.js p0hard`, log `_test_logs/p0hard_*.log`)

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
| p0_hardening_tests (baru) | 32 | 0 | 1 |
| **Total** | **440** | **0** | **27** |

**Regresi:**
- P0D-04/05/06 (KPI vs baseline) PASS.
- RAB-23/37 (KPI identik) PASS.
- HD-T8-09: kondisi normal tanpa banner/N/A, ekspor berjalan.
- **HD-REG-01:** KPI, Financial Control, ringkasan RAB, saldo kas/bank, dan total periode **identik** dengan `184b7f9` pada data lengkap.

**Integrasi live: TIDAK DIJALANKAN.**

## 7. Risiko tersisa

1. **GAP-005:** identitas sesi live belum terbukti; semua kontrol peran bergantung padanya.
2. Pemberian peran KEPALA_SEKOLAH/YAYASAN kini hanya lewat sheet oleh pemilik. Perlu prosedur tertulis dan peran admin (D-T7).
3. Pengaman T1 bersifat heuristik:
   - pengeluaran ganda di luar jendela 62 hari atau beda unit tidak terdeteksi;
   - sebaliknya, pengeluaran sah dapat ikut terblokir.

   Model uang muka (D-T1) tetap dibutuhkan.
4. Jalur tanggal yang belum dicakup: master siswa, tahun ajaran, `decidedAt` dup-review; `doPost` lama belum diuji (dinonaktifkan).
5. Gerbang tampilan bersifat semua-atau-tidak per kelompok sumber. Satu sheet yang gagal (mis. 30) membuat seluruh kelompok "DATA TIDAK TERSEDIA". Ini disengaja (gagal tertutup), tetapi perlu diketahui operator.
6. Baris historis bertanggal tidak sah tetap ada (tidak dikoreksi). Audit read-only untuk menemukannya belum dibuat.
7. Semua hasil sandbox; perilaku `getValues`/lock/kuota Apps Script nyata belum diuji.

## 8. Keputusan yang masih dibutuhkan

| ID | Keputusan |
|---|---|
| D-T7 | Peran admin pengelola pengguna (mis. YAYASAN atau admin terpisah); apakah BENDAHARA boleh menambah BENDAHARA lain |
| D-T1 | Model uang muka/pencairan dan cara menautkan LPJ ke transaksi yang sudah ada |
| D-T4b | Rentang tahun yang wajar; cakupan tanggal master siswa/tahun ajaran |
| GAP-005 | `executeAs`/akses web app |
| (tetap) | U-1 lintas periode, U-5 persetujuan RAB susulan, D-LPJ status LPJ, K-RAB-07 |

## 9. Pemetaan temuan → GAP → test case

| Temuan | GAP | TC (07) | Status |
|---|---|---|---|
| T8 | GAP-002 | TC-HDR-07 | **Sandbox PASS** (HD-T8-01..10) |
| T4 | GAP-014 | TC-CRUD-08, TC-LB-07 | **Sandbox PASS** (HD-T4-01..05, RAB-35) |
| T7 | GAP-048 (usulan), GAP-005 | TC-AUTH-09 | **Sandbox PASS** (HD-T7-01..08); identitas live BELUM |
| T1 (pengaman) | GAP-020 | TC-LB-06 (sebagian), TC-LB-13 | Pengaman **sandbox PASS** (HD-T1-01..08); model akuntansi menunggu D-T1 |
