# P1_26 — Pengaman Uang Muka, Keamanan Deployment, dan KPI Server

**Tanggal:** 22 Oktober 2026

**STATUS AKHIR: `BLOCKED`**

Integrasi Apps Script nyata belum dapat dijalankan karena belum tersedia:
- salinan spreadsheet uji;
- proyek Apps Script uji;
- akun institusi uji;
- folder bukti uji.

| Bagian | Status |
|---|---|
| Kode P1_26 (pengaman uang muka, artefak deploy + pemeriksa, prototipe KPI server, pembatasan peran) | **READY_FOR_INTEGRATION_TEST** |
| Audit dan checklist | **READY_FOR_REVIEW** |
| GAP-005 | Tetap terbuka |
| GAP-028 | Tetap **BLOCKED** |

Semua pengujian adalah **sandbox Node**: kode `.gs` asli dijalankan di `vm` di atas sheet tiruan, dan klien HTML dijalankan di `vm`. Tidak ada deployment, setup skema, migrasi, atau penulisan ke spreadsheet mana pun. Data historis, 544 status TEREKONSILIASI, dan definisi 31 KPI tidak diubah.

Keputusan pemilik yang diterapkan:
1. satu bendahara, satu akun institusi, satu tautan, online-only;
2. tanpa akses edit langsung;
3. pemeriksa belum aktif;
4. perubahan peran butuh otorisasi independen;
5. pengaman uang muka di sandbox;
6. pemisahan fungsi uji;
7. rancangan KPI server.

---

## 1. Kondisi repository

| Hal | Nilai |
|---|---|
| Branch | `claude/hopeful-galileo-mnifgq` (= `origin`), working tree bersih sebelum bekerja |
| HEAD awal | `c7e71c1` (dokumen P1_25 hardening); perbaikan P1_25 `e1330dc` adalah leluhur |
| Baseline | `build_all.js` deterministik; `run_all_tests.js p1_26_baseline` → **45 suite, 747 / 0 / 67** |
| Commit P1_26 | `c6afde8` (T1), `943d3d6` (T2), `9c48552` (T3), `e7b80e3` (T4), commit dokumen ini |
| HEAD akhir | commit dokumen ini; di-push hanya ke `claude/hopeful-galileo-mnifgq` |

---

## 2. Tahap 1 — Transaksi uang muka

### 2.1 Audit jalur

Transaksi kas uang muka ditandai oleh:
- `32_UANG_MUKA.transaksiCairId` (pencairan, PENGELUARAN);
- `33_UANG_MUKA_KEMBALI.transaksiId` (pengembalian, PENERIMAAN).

| Jalur | Fungsi | Temuan sebelum P1_26 |
|---|---|---|
| Arsip transaksi | `opArchiveTransaction` (RecordEngine; satu-satunya jalur yang mengisi `archivedAt` pada 05) | Pencairan/pengembalian dapat diarsip; saldo uang muka ≠ FCC (P1_25 PA-11) |
| Koreksi transaksi | `opUpdateTransaction` → `updateTransaction_` (nominal, jenis, tanggal, akunId, unit, siswaId, sumber dapat diubah; `TRX_IMMUTABLE_` hanya id/createdAt/sumber berkas) | Nominal/jenis pencairan dapat diubah; saldo tetap dari `nominalCair` |
| Alokasi | `opCreateAllocation` → `createAllocation_` | **Temuan baru (dibuktikan):** pengembalian 200.000 dapat dialokasikan ke SPP siswa. Saldo uang muka turun **dan** kewajiban siswa menjadi LUNAS, sehingga uang yang sama dihitung dua kali. Pencairan (PENGELUARAN) sudah ditolak sejak P1_20 |
| Pembatalan | `opUangMukaBatal` | Benar: tidak menghapus pencairan; saldo tetap |
| Pengembalian | `opUangMukaKembali` | Benar: tertaut sumber; rollback bila tulis 33 gagal |
| Penautan LPJ | `opLinkLpj`/`opCreateExpenseFromLpj`/`opUnlinkLpj` | Benar (P1_24/P1_25): LPJ uang muka tidak dapat ditautkan; pencairan tidak dapat menjadi tujuan tautan LPJ biasa |
| Kompensasi internal | `umRollbackTrx_` → `deleteRowById_` | Bukan jalur umum; tidak terdampak pengaman |

### 2.2 Matriks

Saldo = `nominalCair − nota terverifikasi − pengembalian aktif`. FCC = `opFinancialControl`.

| Jenis transaksi / peristiwa | Kondisi uang muka | Dampak saldo | Dampak FCC | Dampak LPJ | Ditolak (jalur umum) | Koreksi yang diizinkan |
|---|---|---|---|---|---|---|
| Pencairan (`opUangMukaCair`) | baru → DICAIRKAN | + nominal | pengeluaran + nominal; populasi BDS03 +1 | — | — | — |
| Nota LPJ diajukan/diterima | DICAIRKAN/LPJ_DITERIMA | tetap | tetap (nota bukan transaksi kas) | (2) dilaporkan bertambah | Tautan LPJ uang muka ke transaksi (`LPJ_UANG_MUKA`) | `opLpjAjukan`/`opLpjTerima` |
| Nota diverifikasi | DIVERIFIKASI (verifikasi **nonaktif**, GAP-005) | − nota | tetap | (3) terverifikasi | — | — |
| Pengembalian (`opUangMukaKembali`) | status apa pun ≠ SELESAI | − nominal | penerimaan + nominal | — | Pengembalian > sisa (`MELEBIHI_SALDO`) | — |
| Pembatalan (`opUangMukaBatal`) | → DIBATALKAN | tetap (sisa tetap harus dikembalikan) | tetap (pencairan tetap dihitung) | LPJ baru ditolak | Bila ada LPJ diajukan/diterima/diverifikasi (`LPJ_MASIH_AKTIF`) | Pengembalian setelah DIBATALKAN |
| **Arsip pencairan** | aktif / DIBATALKAN / SELESAI | (sebelumnya: tetap → tidak konsisten) | (sebelumnya: pengeluaran turun) | — | **Ya:** `TRANSAKSI_UANG_MUKA_TERKUNCI` | Pembatalan + pengembalian; jalur koreksi khusus **belum ada** |
| **Arsip pengembalian** | sama | (sebelumnya: saldo naik kembali) | (sebelumnya: penerimaan turun) | — | **Ya:** `TRANSAKSI_UANG_MUKA_TERKUNCI` | Belum ada jalur khusus |
| **Koreksi nominal/jenis/tanggal/akunId/unit/siswaId/sumber** pencairan atau pengembalian | sama | (sebelumnya: tidak konsisten) | (sebelumnya: berubah) | — | **Ya:** `TRANSAKSI_UANG_MUKA_TERKUNCI` | Field deskriptif (catatan, penerima, kategori, status) tetap boleh |
| **Alokasi pengembalian ke kewajiban siswa** | sama | (sebelumnya: dihitung ganda) | — | — | **Ya:** `TRANSAKSI_UANG_MUKA_TERKUNCI` | — |
| Transaksi uang muka yang **sudah diarsip** (di luar server/historis) | — | laporan memberi peringatan (P1_24) | — | — | Arsip ulang = no-op ("sudah diarsipkan"); koreksi = `TRANSACTION_ARCHIVED` | — |

### 2.3 Pengaman (`c6afde8`)

- `umTrxGuard_` dan `umTrxPeran_` di `UangMukaLpj.gs`.
- Dipanggil oleh `opArchiveTransaction` (**di dalam kunci**, setelah cek keberadaan) dan oleh `opEngineWrite_` (`UPDATE_TRANSACTION`, `CREATE_ALLOCATION`, sebelum `opAllocGuard_`).
- **Tidak aktif tanpa sheet `32_UANG_MUKA`.** Produksi saat ini belum memiliki skema uang muka, sehingga perilaku produksi/historis tidak berubah (UG-08).
- Pengecekan pada `opEngineWrite_` dilakukan sebelum kunci. Ini aman karena keterkaitan transaksi dengan 32/33 hanya dibuat untuk transaksi **baru** (`opUangMukaCair`/`opUangMukaKembali`), tidak pernah ditempelkan ke transaksi lama.
- Penolakan terjadi sebelum penulisan apa pun: tidak ada baris, audit, maupun idempotensi yang tercatat (UG-01/11/12).

### 2.4 Uji (`p1_26_um_guard_tests`, 12 PASS)

| Uji | Isi |
|---|---|
| UG-01 | Pencairan aktif: arsip ditolak; sheet identik; saldo & FCC tetap |
| UG-02 | Pengembalian aktif: arsip ditolak; saldo tetap |
| UG-03 | Pencairan uang muka DIBATALKAN tetap terkunci |
| UG-04 | Pengarsipan berulang/retry: ditolak sama, tanpa efek kumulatif |
| UG-05 | Transaksi yang sudah diarsip: no-op / `TRANSACTION_ARCHIVED` + peringatan |
| UG-06 | 7 field penentu ditolak; catatan/penerima/nilai sama boleh |
| UG-07 | Alokasi pengembalian ke SPP ditolak; SPP tetap BELUM BAYAR (temuan baru) |
| UG-08 | Pra-setup & transaksi biasa: perilaku tidak berubah |
| UG-09 | Kegagalan parsial pengembalian: rollback, retry tepat 1, replay |
| UG-10 | Konsistensi saldo vs FCC setelah penolakan + koreksi resmi |
| UG-11 | Retry koreksi yang ditolak tetap ditolak, tidak ada idempotensi tercatat |
| UG-12 | Tidak ada audit ARCHIVE baru |

---

## 3. Tahap 2 — Fungsi uji dan permukaan deployment

### 3.1 Inventaris

| Kelompok | Isi (setelah P1_26) |
|---|---|
| Berkas deploy | 30 `.gs` (`SERVER_FILES` teruji, termasuk `KpiEngine.gs` baru) + `Bendahara_V2.html` + `ServerBridge.html`. **Tidak pernah:** `_live_tests/`, `deps/`, `_build_tests/` |
| Fungsi publik (dapat dipanggil `google.script.run`) di artefak | 102: 76 bergerbang (`opGate_`/`authorizeCurrentUser_`/delegasi); 4 allowlist beralasan (`doGet`, `doPost` dimatikan, `include` dibatasi, `getCurrentUserIdentity`); 22 fungsi murni `ObligationEngine` (melempar galat tanpa konteks bergerbang, RD-07) |
| Dipanggil klien | 64 nama `callServer` di `ServerBridge` + `include('ServerBridge')` |
| Fungsi uji di sumber | `Code.gs`: `testBendaharaEvaluate`, `TEST_BRIDGE_TEMPLATE`, `TEST_SERVERBRIDGE_SYNTAX` (publik, Logger). `TransactionEngine.gs`: `testConcurrentWriteDoor_` (**menulis lalu menghapus transaksi di spreadsheet aktif tanpa audit**, dapat dijalankan dari editor), `createTransactionWithAllocations_ForTest_` (satu-satunya penyala `testMode`), `runFinancialSafetyTests_`, `validateTransactionPayloadPublicWrapper_`, `regressionCheck_` |
| `include` | Sebelumnya: mengembalikan isi berkas HTML proyek mana pun yang diminta. Kini: allowlist `['ServerBridge']` (satu-satunya pemakaian template) |
| Template HTML | Satu scriptlet saja: `include('ServerBridge')`; tidak mencetak data server |
| Drive | Hanya `BuktiDrive.gs` (`opUploadBukti` bergerbang; `opBuktiFolder_`). Harness `_live_tests` dikecualikan |
| Spreadsheet | Hanya `SpreadsheetApp.getActiveSpreadsheet()` (skrip terikat). `openById`/`openByUrl` = 0 (grep; ID produksi hanya di komentar dan konstanta penolak harness/uji) |

### 3.2 Pemisahan (`943d3d6`)

- `_build_tests/build_deploy.js` membuat **salinan artefak** `_deploy_out/` (di-`.gitignore`), berisi berkas siap `clasp push` dan `MANIFEST.json` (sha256 per berkas + daftar fungsi yang dibuang beserta alasan).
- **8 fungsi uji/diagnostik dibuang dari artefak**; sumber tidak dipangkas, sehingga sandbox tetap menguji sumber lengkap.
- **Tidak ada deployment** (tanpa `clasp`, tanpa jaringan).
- `_build_tests/check_deploy.js` (gagal = exit 1):

| Cek | Isi |
|---|---|
| D1 | Berkas tepat sesuai daftar & sha256 = MANIFEST |
| D2 | Tidak ada fungsi `test*`/`TEST_*`/`*ForTest*`/`lt*` (harness), dan tidak ada penanda `TEST_WRITE_DOOR`, `testMode: true`, `LT_PROD_ID_`, snapshot harness di **kode** |
| D3 | **Setiap** fungsi publik terklasifikasi (bergerbang/allowlist/murni). Nama tanpa "test" **tidak** dianggap aman otomatis |
| D4 | Semua nama yang dipanggil klien & target `include` ada di artefak |
| D5 | `include` memakai allowlist |
| D6 | Smoke runtime artefak: identitas, transaksi, arsip, kewajiban, FCC, setup uang muka; AUDITOR tulis → `ROLE_NOT_ALLOWED`; tanpa sesi → `AUTH_REQUIRED`; `include` lain ditolak; fungsi uji tidak ada; KPI hanya lewat `opKpiServer` bergerbang |

Uji (`p1_26_deploy_tests`, 7 PASS), termasuk 5 uji **negatif**: menyuntik `TEST_BACKDOOR`, fungsi publik tanpa gerbang bernama netral, penyala `testMode` di fungsi privat, berkas harness, dan menghapus fungsi yang dipanggil klien. Setiap suntikan membuat pemeriksa GAGAL pada cek yang tepat.

---

## 4. Tahap 3 — KPI server

### 4.1 Audit 31 indikator

Semua definisi ada di klien (`Bendahara_V2.html`):
- `KPI_MASTER`, `INDICATOR_MASTER`/`indDef` (metadata);
- `financialAktivitasFeed` (aktivitas & populasi);
- mesin skor `kpiIndukSummaryCompute_`/`kpiIndukRow`/`computeKpiRow`/`computeIndicator*` (realisasi, dimensi kuantitas/kualitas/ketepatan/tindak lanjut/perbaikan).

Status KPI induk ditentukan `kpiStatusFromScore`:

| Skor | Status |
|---|---|
| ≥ 90 | Sangat Baik |
| ≥ 80 | Baik |
| ≥ 70 | Perlu Perhatian |
| di bawahnya | Perlu Perbaikan |

Sebelum P1_26 seluruh perhitungan dilakukan **hanya di klien**. Server hanya punya FCC dan `opRabRealization`.

| KPI (bobot) | Indikator: bobot (target = 1 untuk semua; tipe) | Dependensi data |
|---|---|---|
| BDS01 Penerimaan Siswa (20) | I01 Kewajiban akurat 20 · I02 Ekspektasi terhitung 15 (RATIO) · I03 Pembayaran tercatat lengkap 15 · I04 Teridentifikasi & teralokasi valid 20 · I05 Tunggakan terukur 15 · I06 Tidak ada double allocation 15 | Kewajiban terhitung (01/02/03/04/06, settings/keringanan/katering), 05 PENERIMAAN, 06 |
| BDS02 Mutasi & Rekonsiliasi (20) | I01 Mutasi tercatat 20 · I02 Teridentifikasi 25 · I03 Tidak menggantung > 14 hari 20 · I04 Selisih dijelaskan 15 · I05 Rekonsiliasi selesai 20 (RECONCILIATION) | 11, 16, 07 |
| BDS03 Pengeluaran & RAB (25) | I01 Tercatat lengkap 15 · I02 Kategori & penerima 10 · I03 Sesuai RAB 25 · I04 Tidak melebihi pagu 20 · I05 Di luar RAB disetujui 15 · I06 Tidak duplikat 15 | 05 PENGELUARAN, 08, 30, 09, 21 (`rabMatchAll_`) |
| BDS04 Kas, Bank & Saldo (15) | I01 Saldo wajar 20 · I02 Sesuai catatan 30 (RECONCILIATION) · I03 Selisih dijelaskan 25 · I04 Saldo akhir tertelusur 25 | 07, 05, 16 |
| BDS05 Bukti (10) | I01 Bukti penerimaan 20 · I02 Bukti pengeluaran 25 · I03 Bukti terhubung 20 (DOCUMENT_COMPLETENESS) · I04 Tanpa bukti > 30 hari 20 · I05 Laporan tertelusur 15 (DOCUMENT_COMPLETENESS) | 05, 10, 17 |
| BDS06 Pelaporan (10) | I01 Laporan tersedia 20 (COMPLETION) · I02 Tepat waktu 25 (DEADLINE) · I03 Saldo laporan = ledger 20 · I04 RAB vs realisasi 20 · I05 Angka tertelusur 15 | 17, 05, 08 |

Seluruh 31 indikator memakai tipe PERCENTAGE, kecuali yang disebut lain di tabel. Ambang/batas khusus: `MUTASI_MENGGANTUNG_BATAS_HARI = 14`, `BUKTI_TOLERANSI_HARI = 30`.

Penanganan data parsial (klien, P0-D): bila sumber `KPI_SOURCE_KEYS_` (05, 06, 04, 08, 09, 10, 11, 16, 17, 30) atau master belum termuat/galat, atau periode bukan label bulan, hasilnya **"DATA TIDAK TERSEDIA"** dengan skor `null`, bukan 0.

### 4.2 Rancangan & prototipe (`9c48552`)

- `KpiEngine.gs` **dihasilkan** oleh `build_kpi_engine.js` dari penutupan dependensi `kpiIndukSummary`:
  - **104 deklarasi disalin verbatim**;
  - fungsi bersama yang sudah ada di server (`ObligationEngine`, `FinanceEngine`: kewajiban, `rabMatchAll_`, FCC) **tidak** disalin ulang;
  - build **gagal keras** bila ada ketergantungan klien yang tidak disalin, tidak ada di server, dan tidak di-shim.
- Definisi, formula, bobot, target, dan ambang **tidak didefinisikan ulang**.
- **Privatisasi:** 80 fungsi salinan/stub diganti nama mekanis menjadi `<nama>_`. Penggantian hanya pada deklarasi, panggilan, dan argumen fungsi; build gagal bila tersisa rujukan polos. Akibatnya satu-satunya fungsi publik `KpiEngine.gs` adalah **`opKpiServer(periode)`**: peran baca, baca-saja.
- **Shim data** (`_kpi_server.gs.tpl`, tulisan tangan):
  - membaca **persis** masukan klien mode pusat: `opReadSheet` berhalaman sampai lengkap, `getSettings`/`getAccounts`/`getExpenseCategories`, dan konteks kewajiban `oblLoadContext_`;
  - tanpa antrean lokal peramban;
  - shim dipasang hanya selama perhitungan lalu **dipulihkan** di `finally` (KS-09).
- Gagal baca → `READ_FAILED`/`SCHEMA_MISMATCH`; pembacaan parsial → `INCOMPLETE_READ`. Keduanya membuat `kpiDataStatus_` (kode klien yang sama) menghasilkan **DATA TIDAK TERSEDIA**.
- **Belum menggantikan hasil resmi.** Aplikasi tetap menampilkan KPI klien; `opKpiServer` tidak diekspos ke `ServerBridge`/UI.

### 4.3 Uji (`p1_26_kpi_server_tests`, 10 PASS + 1 INFO)

| Uji | Hasil |
|---|---|
| KS-01 | Definisi server = klien: 31 indikator + 6 KPI induk (kode, induk, bobot, target, tipe, formula) |
| KS-02 | Fixture dasar × Agustus/September/Oktober 2026: **JSON hasil 6 KPI + 31 indikator identik penuh** (overall 11.1 / 47 / 0) |
| KS-03 | Fixture sintetis kaya × 3 periode: **identik penuh** (overall 13.1 / 77.6 / 24.7). September: 29 dari 31 indikator terukur; BDS06-I01/I02 tidak berlaku (laporan September tidak ada) |
| KS-04 (INFO) | Rincian per indikator fixture sintetis. **Angka fixture, bukan produksi** |
| KS-05 | Skema tidak cocok → DATA TIDAK TERSEDIA, skor `null` (bukan 0), sama dengan klien |
| KS-06 | Sheet hilang → DATA TIDAK TERSEDIA |
| KS-07 | Pembacaan parsial (1 dari 99 baris) → `INCOMPLETE_READ` → DATA TIDAK TERSEDIA |
| KS-08 | Periode bukan label bulan → DATA TIDAK TERSEDIA (server & klien) |
| KS-09 | Baca-saja; sheet identik; `opObligations` sesudah = sebelum |
| KS-10 | AUDITOR boleh; tanpa sesi `AUTH_REQUIRED`; tak terdaftar `USER_NOT_FOUND` |
| KS-11 | Fungsi publik `KpiEngine.gs` = hanya `opKpiServer`; tanpa jalur tulis |

**544 TEREKONSILIASI tidak diverifikasi ulang** (tidak ada salinan data sah).

---

## 5. Tahap 4 — Pengelolaan peran

### 5.1 Audit jalur

| Jalur | Dapat mengubah | Temuan |
|---|---|---|
| `opUserUpsert` (AdminAPI) | peran, status, email, nama, unit di `26_USER_ACCESS` | Satu-satunya jalur aplikasi; hanya BENDAHARA. Peran istimewa (KEPALA_SEKOLAH/YAYASAN) tidak dapat diberikan/diubah (P0-T7); proteksi lockout. **Celah:** BENDAHARA dapat membuat BENDAHARA baru, mengubah AUDITOR → BENDAHARA, mengaktifkan ulang BENDAHARA, dan memindahkan baris BENDAHARA lain ke email baru, sehingga menambah hak BENDAHARA tanpa otorisasi independen |
| `opRecordBatch`, `opMasterUpsert`, impor, setup skema | — | Tidak menjangkau `26_USER_ACCESS` |
| Identitas pelaku audit | `auditPush_`/`opAuditBulk_` memakai `ENGINE_ACTOR_`/`g.identity.email` (sesi). `opAuditAppend` dari klien: aksi diberi awalan `UI_`, sumber = sesi (PR-08) | Tidak dapat dipalsukan dari klien |
| Payload klien (`actorRole`, `identity`, `otorisasiIndependen`) | — | Diabaikan (PR-07, HD-T7-06) |
| Edit langsung sheet oleh pemilik (di luar aplikasi) | semuanya | Satu-satunya jalur "otorisasi independen" saat ini; berlaku pada panggilan berikutnya (PR-10) |

### 5.2 Perubahan (`e7b80e3`)

`opUserUpsert` menolak `ROLE_GRANT_REQUIRES_INDEPENDENT_AUTH` untuk:
- akun BENDAHARA baru yang aktif;
- perubahan peran menjadi BENDAHARA;
- aktivasi ulang baris BENDAHARA;
- pemindahan baris BENDAHARA aktif ke email lain.

Tetap boleh: ubah nama/unit (email sama), menonaktifkan BENDAHARA lain, mengelola AUDITOR. Pengguna non-BENDAHARA tidak dapat memanggil `opUserUpsert` sama sekali (PR-06: menaikkan peran sendiri → `ROLE_NOT_ALLOWED`).

### 5.3 Keterbatasan model satu akun institusi

- Audit hanya membuktikan **akun** (`google:<akun institusi>`), bukan individu. Dua orang yang memakai akun yang sama tercatat identik (PR-09).
- **Tidak ada identitas individu yang dikarang** dari nama akun bersama.
- Pertanggungjawaban individu bergantung pada prosedur di luar sistem: serah terima kredensial, log pemegang akun, 2SV.
- Dalam model ini pemilik spreadsheet adalah akun yang sama, sehingga "otorisasi independen" untuk perubahan peran **harus** ditetapkan secara organisasi (keputusan §10).

---

## 6. Tahap 5 — Checklist kesiapan integrasi

Melengkapi P1_24 §3 dan P1_25 §5.

| # | Butir | Bukti yang dicatat |
|---|---|---|
| **Spreadsheet uji** | | |
| S-1 | Salinan dari produksi oleh pemilik produksi; ID ≠ `1QRibka0…`; nama berawalan `UJI_` | ID, tanggal |
| S-2 | Salinan cadangan kedua (tidak disentuh) | ID |
| S-3 | Dibagikan **hanya** ke akun institusi uji (pemilik); tanpa editor lain | Tangkapan berbagi |
| **Proyek Apps Script uji** | | |
| P-1 | Terikat pada salinan (Extensions → Apps Script dari salinan) | scriptId |
| P-2 | Isi = artefak `node build_all.js && node build_deploy.js` dari commit uji; `node check_deploy.js` **PASS D1–D6**; plus `_live_tests/LiveReadiness.gs` **khusus uji** | Hash commit, `MANIFEST.json`, keluaran check_deploy |
| P-3 | `appsscript.json`: V8, `Asia/Jakarta`, *Execute as: Me*, akses *Only myself* (model keputusan 1) | Berkas manifest |
| P-4 | Tanpa pemicu (trigger) | Tangkapan |
| **Akun uji** | | |
| A-1 | Satu akun Google institusi **khusus uji** (bukan akun produksi), 2SV aktif | Email (domain), status 2SV |
| A-2 | `26_USER_ACCESS` salinan: akun itu BENDAHARA ACTIVE (diisi pemilik di sheet) | Baris |
| A-3 | Akun pembanding: satu akun tak terdaftar (harus ditolak) | Hasil probe |
| **Folder bukti uji** | | |
| F-1 | Folder baru milik akun uji, bukan `Bendahara_Bukti` | ID folder |
| **Script Properties** | | |
| SP-1 | `LIVE_TEST_SPREADSHEET_ID` = ID salinan (manual) | Tangkapan |
| SP-2 | `BUKTI_FOLDER_ID` = ID folder uji | Tangkapan |
| SP-3 | `LIVE_TEST_SNAPSHOT`, `LIVE_TEST_LPJ_SNAPSHOT` ditulis harness (bukan manual) | — |
| **Identitas pelaksana** | | |
| I-1 | `ltIdentitasProbe()` dari editor & web app: `emailAktifTerbaca=true`, code SUCCESS, peran BENDAHARA | JSON |
| I-2 | Akun tak terdaftar membuka web app → *Only myself* menolak di tingkat Google, atau server `USER_NOT_FOUND`/`AUTH_REQUIRED` | Tangkapan |
| **Izin akses** | | |
| Z-1 | Tidak ada pengguna lain yang dapat mengedit/melihat salinan & folder | Tangkapan berbagi |
| Z-2 | Pemeriksa **tidak** diberi akses (keputusan 3) | — |
| **Tidak ada jalur tulis ke produksi** | | |
| N-1 | Kode hanya `getActiveSpreadsheet()`; `openById`/`openByUrl` = 0 (grep repo & artefak) | Keluaran grep |
| N-2 | `ltGuard_` menolak ID produksi (LS-01) dan tanpa konfirmasi Script Property | `ltPreflight()` |
| N-3 | Folder bukti dikunci `BUKTI_FOLDER_ID`; mode uji menolak tanpa folder uji (GE-02) | — |
| N-4 | Pemilik produksi memeriksa riwayat versi produksi sebelum & sesudah uji: tanpa suntingan akun uji | Tangkapan |
| **Rollback** | | |
| R-1 | Uji hanya pada salinan; rollback = buang salinan | — |
| R-2 | Kode: revert berurutan (§9) + build + uji | Log |
| R-3 | Skema uang muka/LPJ (bila dipasang di salinan): `ltLpjRollbackCek()`; tidak dihapus otomatis | JSON |

**Tidak ada uji yang memerlukan lingkungan yang dijalankan.** Semua butir di atas BLOCKED sampai lingkungan tersedia.

---

## 7. Tahap 6 — Regresi

`node run_all_tests.js p1_26`; log di `_test_logs/p1_26_*.log`.

| | Baseline | Akhir |
|---|---|---|
| Suite | 45 | **49** |
| PASS / FAIL / INFO | 747 / 0 / 67 | **785 / 0 / 69** |
| 45 suite lama | — | Jumlah PASS/FAIL/INFO **identik per suite** (perbandingan log otomatis) |

### 7.1 Suite baru

| Suite | P/F/I | Tujuan |
|---|---|---|
| `p1_26_um_guard_tests` | 12/0/0 | Pengaman arsip/koreksi/alokasi transaksi uang muka (§2.4) |
| `p1_26_deploy_tests` | 7/0/0 | Artefak deploy + pemeriksa (termasuk 5 uji negatif) (§3.2) |
| `p1_26_kpi_server_tests` | 10/0/1 | KPI server vs klien, data tidak tersedia, otorisasi, permukaan publik (§4.3) |
| `p1_26_peran_tests` | 9/0/1 | Hak BENDAHARA, kenaikan peran sendiri, aktor audit, keterbatasan akun bersama (§5) |

### 7.2 Perubahan fixture/ekspektasi uji lama (dilaporkan; asersi tidak dilemahkan)

| Uji | Perubahan | Alasan |
|---|---|---|
| `um_ui_tests` UI-05 | Kondisi "pengembalian/pencairan diarsip" kini dibuat dengan **menyunting sel langsung** (data historis/di luar server); asersi sama | Jalur umum kini menolak arsip transaksi uang muka (keputusan 5); deteksi peringatan tetap diuji |
| `p1_25_lpj_um_tests` PA-09..12 | Sama; teks INFO PA-11 diperbarui (pengaman kini ada); asersi PA-10/PA-12 sama | Sama |
| `p0_hardening_tests` HD-T7-05 | `bendaharaBaru`: `OK` → `ROLE_GRANT_REQUIRES_INDEPENDENT_AUTH`; `auditorBaru`/`nonaktifAuditor` tetap `OK` | Uji ini sendiri mencatat "menunggu keputusan D-T7"; kini diputuskan pemilik (keputusan 4) |

### 7.3 Perubahan file

| Commit | File | Fungsi |
|---|---|---|
| `c6afde8` | `UangMukaLpj.gs`, `OperationalAPI.gs`, `RecordEngine.gs`; uji | `umTrxPeran_`, `umTrxGuard_` (baru); `opEngineWrite_`, `opArchiveTransaction` (hook) |
| `943d3d6` | `Code.gs`, `.gitignore`; baru `build_deploy.js`, `check_deploy.js`; uji | `include` (+ `INCLUDE_ALLOWLIST_`) |
| `9c48552` | Baru `KpiEngine.gs` (dihasilkan), `_kpi_server.gs.tpl`, `build_kpi_engine.js`; `build_all.js`, `srv_env.js` (+ `KpiEngine.gs`), `check_deploy.js`; uji | `opKpiServer` + shim + 104 salinan privat |
| `e7b80e3` | `AdminAPI.gs`; uji | `opUserUpsert` |

### 7.4 Dampak

| Hal | Hasil |
|---|---|
| KPI | Formula/bobot/target/ambang **tidak berubah** (definisi tidak disentuh; KS-01). Hasil resmi tetap klien. `Bendahara_V2.html` **tidak berubah** di P1_26 |
| Data | Tidak ada spreadsheet yang ditulis; tidak ada perubahan data historis |
| Status transaksi | Tidak ada kode yang mengubah status; 16_REKONSILIASI/ReconEngine tidak disentuh |

**Bukan uji Apps Script.**

---

## 8. Risiko tersisa

| ID | Risiko |
|---|---|
| R-1 | GAP-005: model satu akun institusi belum dibuktikan live (`ltIdentitasProbe`); atribusi individu tidak mungkin |
| R-2 | Transaksi uang muka yang **sudah** diarsip/dikoreksi di luar server tetap hanya terdeteksi lewat peringatan; jalur koreksi khusus (`opUangMukaKoreksi`) belum ada |
| R-3 | `opKpiServer` membaca semua sumber per panggilan; waktu eksekusi & kuota Apps Script pada data penuh belum diukur |
| R-4 | KPI server memakai zona waktu server untuk `todayISO`; klien memakai zona peramban. Selisih mungkin terjadi di sekitar tengah malam. Disarankan `Asia/Jakarta` di manifest; belum diuji live |
| R-5 | KPI server mengabaikan antrean lokal klien (operasi tertunda). Bila ada antrean, hasil server ≠ tampilan klien (server = data tersimpan) |
| R-6 | Privatisasi nama di `KpiEngine.gs` bersifat mekanis; dijaga pemeriksa build + uji diferensial, tetapi perubahan besar pada kode KPI klien wajib membangun ulang & menjalankan ulang KS-02/03 |
| R-7 | `include` allowlist & pembuangan fungsi uji hanya efektif bila deploy memakai artefak `build_deploy.js` + `check_deploy.js` PASS |
| R-8 | `ROLE_GRANT_REQUIRES_INDEPENDENT_AUTH`: penambahan BENDAHARA kini hanya lewat sunting sheet oleh pemilik. Pada model satu akun, pemilik = akun yang sama, sehingga kontrol organisasi diperlukan |
| R-9 | 544 TEREKONSILIASI belum diverifikasi; GAP-028 BLOCKED |

## 9. Commit dan rollback

Rollback diuji di worktree terpisah:

| Uji | Hasil |
|---|---|
| Revert `e7b80e3 9c48552 943d3d6 c6afde8` berurutan | Tree **identik** `c7e71c1` (diff 0 baris); build + uji **45 suite, 747/0/67** = baseline |
| Revert `e7b80e3` saja | Bersih; 48 suite, 776/0/68 |
| Revert `9c48552` saja | Konflik `run_all_tests.js` |
| Revert `943d3d6` saja | Konflik `check_deploy.js`, `run_all_tests.js` |
| Revert `c6afde8` saja | Konflik `run_all_tests.js` |

```
git revert --no-edit e7b80e3 9c48552 943d3d6 c6afde8
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```

Revert sebagian: urut dari yang terbaru, atau selesaikan konflik pada baris daftar suite/pemeriksa secara manual. Tidak ada rollback data.

## 10. Keputusan lanjutan yang diperlukan

1. **Otorisasi independen perubahan peran** (model satu akun): siapa (Yayasan?) dan bagaimana (sunting sheet dengan saksi, berita acara) menambah/mengganti BENDAHARA.
2. **Jalur koreksi uang muka** (`opUangMukaKoreksi`): diperlukan? Siapa yang menyetujui? Bagaimana menangani transaksi uang muka yang terlanjur diarsip di luar server?
3. **KPI server sebagai hasil resmi:** kapan, dan dengan bukti apa (diferensial pada salinan data nyata, waktu eksekusi live). Apakah disimpan ke `14_KPI` (perlu desain tulis + audit)?
4. **Deploy hanya dari artefak** `build_deploy.js` + `check_deploy.js` PASS sebagai syarat prosedur.
5. **Lingkungan uji** (checklist §6) agar status naik dari BLOCKED.
6. **GAP-005 / GAP-028:** tetap terbuka/BLOCKED sampai bukti/keputusan terpisah.
