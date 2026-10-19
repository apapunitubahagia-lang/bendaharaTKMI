# P1_15 — Kesiapan Integrasi Live, Audit GAP-005, dan Desain Uang Muka / Tautan LPJ

**Tanggal:** 19 Oktober 2026
**Status proyek: READY_FOR_INTEGRATION_TEST.** Integrasi live **belum dijalankan**: tidak ada akses ke proyek Apps Script, `clasp`, maupun salinan spreadsheet dari lingkungan ini. Semua hasil di dokumen ini lokal (sandbox Node) atau analisis kode.

---

## 1. Verifikasi repository

| Pemeriksaan | Hasil |
|---|---|
| Branch aktif | `p1/implementasi` (lokal); branch tujuan `claude/vigilant-bell-967cih` |
| HEAD lokal | `9e9c581` |
| HEAD remote `origin/claude/vigilant-bell-967cih` | `9e9c581` (sama) |
| Working tree | Bersih |
| `2bda4b4` (T8), `c76db65` (T4), `be84d9c` (T7), `ea2e9bc` (T1), `9e9c581` (dokumen) | Kelimanya ada dan merupakan leluhur HEAD remote (`git merge-base --is-ancestor`) |
| Riwayat `184b7f9..remote` | Tepat 5 commit di atas, berurutan |

Tentang "pemeriksaan awal 184b7f9": itu kondisi **sebelum** tahap hardening. Kelima commit dibuat di atasnya lalu di-push. Tidak ada reset, rebase, revert, atau force push.

## 2. Audit GAP-005 (keamanan deployment Apps Script)

### 2.1 Fakta dari kode

| Hal | Fakta | Bukti |
|---|---|---|
| Manifest deploy | **Tidak ada** `appsscript.json` / `.clasp.json` di repo. `executeAs` dan `access` deployment produksi **tidak dapat diketahui dari kode** | `ls`, `find` |
| Pengikatan spreadsheet | `ss_() = SpreadsheetApp.getActiveSpreadsheet()`. Skrip harus **terikat** (container-bound) pada spreadsheet; tidak ada `openById` maupun ID produksi yang tertanam | `TransactionEngine.gs:99`; grep `openById` = 0 |
| Identitas | `getCurrentUserIdentity`: `Session.getActiveUser().getEmail()` → normalisasi → `26_USER_ACCESS` (status ACTIVE, peran). Email kosong → `AUTH_REQUIRED`; tidak terdaftar → `USER_NOT_FOUND` | `AuthCentral.gs` |
| Sesi | Tidak ada sesi aplikasi/token. Identitas dan peran dihitung ulang **pada setiap panggilan** `google.script.run`; perubahan peran berlaku pada panggilan berikutnya. `CentralAuth` di klien hanya untuk tampilan | `opGate_` |
| Pemeriksaan peran | **37/37** fungsi `op*` publik memakai `opGate_` (langsung atau lewat `opEngineWrite_`/`opRecordBatch`). Tulis hanya `BENDAHARA`; baca `BENDAHARA`/`KEPALA_SEKOLAH`/`YAYASAN`/`AUDITOR` | RD-05 |
| Master read | `getStudents`, `getSettings`, dll. memakai `authorizeCurrentUser_` | `MasterDataRead.gs` |
| Fungsi publik tanpa gerbang | `getCurrentUserIdentity` (identitas pemanggil sendiri); `doGet` (HTML); `include` (isi berkas HTML proyek); `doPost` (jalur lama, dimatikan `LEGACY_DOPOST_ENABLED_ = false`); `testBendaharaEvaluate` (hanya Logger); 21 fungsi murni `ObligationEngine` | RD-06. Dipanggil langsung, mesin kewajiban melempar galat karena konteks null, sehingga **data tidak bocor** (RD-07) |
| Manipulasi parameter klien | Parameter `deps` dari klien berupa objek JSON (bukan fungsi), sehingga identitas gagal tertutup. Field peran/aktor di payload diabaikan. Aktor audit selalu dari sesi | HD-T7-06 |
| Jalur lama | `doPost` + `25_DEVICE_WHITELIST` dimatikan; bila diaktifkan, hanya device token tanpa peran (GAP-006) | `Code.gs:168` |
| Bukti (Drive) | Folder dicari **berdasarkan nama** `Bendahara_Bukti` di Drive akun yang menjalankan skrip, dan dibuat bila belum ada | `BuktiDrive.gs:15-21` |

### 2.2 `executeAs` × `access` (perilaku menurut dokumentasi Apps Script; **belum diverifikasi live**)

| Konfigurasi | `Session.getActiveUser().getEmail()` | Akses spreadsheet | Konsekuensi bagi sistem ini |
|---|---|---|---|
| **Execute as: Me (pemilik)**, akses: hanya domain Workspace | Email pengunjung **terbaca** bila pengunjung satu domain Workspace dengan pemilik | Skrip memakai hak pemilik; pengguna **tidak perlu** akses langsung ke spreadsheet | Paling aman bila sekolah memakai satu domain Workspace: pengguna tidak dapat mengedit sheet langsung, dan peran `26_USER_ACCESS` tidak dapat dilewati |
| Execute as: Me, akses: siapa pun dengan akun Google | Untuk akun **di luar domain** pemilik (mis. Gmail pribadi), email umumnya **kosong** | Hak pemilik | Server gagal tertutup (`AUTH_REQUIRED`): pengguna luar domain tidak bisa dikenali sehingga aplikasi tidak bisa dipakai. Aman, tetapi tidak berfungsi |
| Execute as: Me, akses: siapa pun (anonim) | Kosong | Hak pemilik | Semua `op*` ditolak; fungsi publik tanpa gerbang (`include`, `getCurrentUserIdentity`) tetap dapat dipanggil siapa pun di internet. **Tidak disarankan** |
| **Execute as: pengguna yang mengakses** | Email pengunjung terbaca (pengguna memberi izin OAuth) | Skrip memakai hak **pengguna**, sehingga **setiap pengguna harus punya akses edit ke spreadsheet dan folder Drive** | Pengguna dapat **mengedit sheet langsung** di Google Sheets, termasuk `26_USER_ACCESS`, `05_TRANSAKSI`, dan audit log. Akibatnya **seluruh kontrol server (peran T7, validasi T4, audit) dapat dilewati**. Bukti juga tersimpan di Drive masing-masing pengguna |

**Kesimpulan:**
- Kontrol P0 hanya bermakna bila pengguna **tidak** punya hak edit langsung ke spreadsheet. Artinya praktis "Execute as: Me" + akses domain Workspace yang sama.
- Bila pengguna memakai akun Gmail pribadi, identitas tidak dapat diverifikasi dengan konfigurasi itu. Perlu keputusan arsitektur: domain Workspace sekolah, atau mekanisme identitas lain yang diverifikasi server (GAP-005 asli: frontend terpisah + token Google yang diverifikasi).
- **Identitas live TIDAK diklaim aman.**

### 2.3 Rekomendasi (belum diimplementasikan; tidak menambah kewenangan)

1. Putuskan jenis akun pengguna (Workspace sekolah vs Gmail). Lalu tetapkan `executeAs: USER_DEPLOYING`, `access: DOMAIN`, dan simpan `appsscript.json` di repo agar dapat diaudit.
2. Spreadsheet produksi dan folder bukti hanya dapat diedit pemilik/admin, tidak dibagikan ke pengguna aplikasi.
3. Kurangi permukaan publik: jadikan fungsi murni `ObligationEngine` privat saat build, batasi `include` ke daftar putih, dan jangan deploy `testBendaharaEvaluate`.
4. Jadikan folder bukti dapat dikonfigurasi (Script Property berisi ID folder) agar salinan uji tidak menulis ke folder produksi. Sampai ada, uji live **wajib** memakai akun tanpa akses ke Drive produksi (§3.1).

## 3. Rencana uji integrasi live

### 3.1 Prasyarat (semua wajib; dicatat dengan bukti)

| # | Prasyarat | Bukti |
|---|---|---|
| P1 | **Akun uji terpisah** (bukan pemilik produksi), tanpa akses ke spreadsheet dan Drive produksi. Alasannya: `ss_()` mengikuti spreadsheet induk, tetapi folder bukti dicari berdasarkan nama di Drive akun yang menjalankan | Email akun uji, tangkapan layar berbagi |
| P2 | Salinan spreadsheet produksi dibuat lewat *File → Make a copy* oleh akun uji. ID salinan dicatat; **ID ≠ `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`**. Salinan sekali pakai: dibuang setelah uji | ID salinan |
| P3 | Proyek Apps Script **terikat pada salinan** (Extensions → Apps Script dari salinan). Skrip terikat yang ikut tersalin berisi kode produksi lama: **ganti seluruhnya** dengan kode commit uji via `clasp push` ke scriptId salinan | Hash commit, `clasp status` |
| P4 | Berkas deploy sesuai `P1_07` §1.5 **ditambah** `_live_tests/LiveReadiness.gs` (khusus salinan). **Tanpa** `deps/`, `_build_tests/` | Daftar berkas |
| P5 | Script Property `LIVE_TEST_SPREADSHEET_ID` diisi manual = ID salinan. Pemeriksaan ini adalah pengaman harness | Tangkapan layar |
| P6 | Konfigurasi deployment uji dicatat (`executeAs`, `access`). Uji identitas dijalankan untuk konfigurasi yang akan dipakai produksi | Manifest |
| P7 | Pemicu (trigger) tidak dibuat. Startup tidak membuat sheet (sudah dijamin kode; diverifikasi di langkah L2) | — |

### 3.2 Uji otomatis lewat harness (editor Apps Script salinan, akun BENDAHARA uji)

| Langkah | Fungsi | Lulus bila |
|---|---|---|
| L1 | `ltPreflight()` | Tidak melempar (bukan produksi, konfirmasi cocok); snapshot jumlah baris 18 sheet + status `11_MUTASI_BANK` (catat jumlah TEREKONSILIASI, diharapkan 544); identitas terbaca |
| L2 | `ltReadOnlyChecks()` | `opSchemaReport` dicatat; semua `opReadSheet` = `COMPLETE`/`PAGE` (atau `sheetMissing` untuk 30). Setiap `ERROR:SCHEMA_MISMATCH` adalah temuan data FINAL nyata (T8 bekerja), bukan kegagalan uji |
| L3 | `ltRejectionChecks()` | `lulus = true`: semua tanggal/periode tidak sah dan pemberian KEPALA_SEKOLAH/YAYASAN ditolak **dengan alasan yang benar** |
| L4 | `ltPostflight()` | `lulus = true`: tidak ada baris bertambah di 18 sheet; status mutasi identik; jumlah TEREKONSILIASI sama |

Harness diuji di sandbox (RD-01..04): menolak ID produksi dan konfirmasi yang tidak cocok, menjalankan alur penuh, serta **mendeteksi** baris yang bertambah dan status TEREKONSILIASI yang berubah. Ini membuktikan logika harness, **bukan** hasil live.

### 3.3 Uji manual lewat web app uji (setelah L1–L4 lulus)

| ID | Kasus | Akun | Hasil diharapkan |
|---|---|---|---|
| LV-T8-1 | Ganti nama satu kolom wajib di `12_DUP_REVIEW` salinan (lalu kembalikan) | BENDAHARA | KPI "DATA TIDAK TERSEDIA"; laporan banner; ekspor diblokir |
| LV-T8-2 | Sheet `30_ALOKASI_PENGELUARAN` tidak ada | BENDAHARA | KPI dan FCC tetap tampil; tidak ada sheet yang dibuat |
| LV-T4-1 | Form transaksi: tanggal 30 Februari (via impor/alat dev) | BENDAHARA | Ditolak server; transaksi lokal "gagal sinkron" |
| LV-T7-1..4 | Tambah pengguna AUDITOR (berhasil); tambah KEPALA_SEKOLAH (ditolak); nonaktifkan pengguna KEPALA_SEKOLAH yang disiapkan pemilik (ditolak); ubah email akun sendiri (ditolak) | BENDAHARA | Sesuai `P1_14` §3 |
| LV-T1-1..4 | LPJ uji: tanpa akun (ditolak); ada pengeluaran mirip (diblokir); tanpa kandidat (dibuat 1 transaksi dari akun pilihan, tautan "Sudah" setelah sinkron); klik dua kali (tetap 1) | BENDAHARA | Sesuai `P1_14` §4 |
| LV-ID-1 | Buka web app dengan akun yang tidak terdaftar | Akun lain | "Pengguna tidak memiliki akses"; tidak ada data tampil |
| LV-ID-2 | Akun AUDITOR/KEPALA_SEKOLAH: baca berhasil, tulis ditolak | Masing-masing | `ROLE_NOT_ALLOWED` |
| LV-ID-3 | Akun luar domain (bila konfigurasi Execute as Me) | Gmail pribadi | Catat apakah email terbaca. Bila kosong, akun tidak dapat masuk (sesuai §2.2) |
| LV-ID-4 | Panggilan `google.script.run.opUserUpsert({... role:'KEPALA_SEKOLAH'})` dari konsol peramban | BENDAHARA | Ditolak |
| LV-REG-1 | Saldo, KPI, laporan, dan ekspor salinan dibandingkan dengan produksi pada titik salinan dibuat (sebelum uji tulis) | Pemilik | Angka sama, karena data sama; selisih = temuan |

**Pembersihan:** salinan sekali pakai dibuang (Drive → hapus berkas salinan), beserta file di folder `Bendahara_Bukti` akun uji. **Tidak ada** penghapusan baris di dalam sheet. Data produksi dan historis tidak disentuh.

### 3.4 Status

| Bagian | Lokal (sandbox) | Live |
|---|---|---|
| T8, T4, T7, T1 | PASS (`p0_hardening_tests`, 32 PASS) | **BELUM DIJALANKAN** |
| Harness (pengaman, deteksi perubahan) | PASS (RD-01..04) | **BELUM DIJALANKAN** |
| Identitas & deployment | Tidak dapat diuji lokal | **BELUM DIJALANKAN** |

## 4. D-T1: desain komparatif model uang muka (tidak dipilih; tanpa perubahan skema)

**Skenario:**
- RAB Kegiatan September **DISETUJUI** Rp2.000.000; saldo awal bank Rp10.000.000.
- 20-09: uang muka Rp2.000.000 dari bank.
- 25-09: nota Rp1.700.000.
- 05-10: LPJ diserahkan.
- 06-10: sisa Rp300.000 dikembalikan ke bank.

Rekening koran: 30-09 Rp8.000.000; 31-10 Rp8.300.000.

| Dampak | **A. Pencairan = pengeluaran** (perilaku sekarang, sisa sebagai PENERIMAAN) | **A'. Pencairan = pengeluaran + pengembalian bertaut** (koreksi atas transaksi uang muka) | **B. Uang muka sebagai saldo pertanggungjawaban** (akun "Uang Muka", imprest) | **C. Transaksi kas & entitas uang muka terpisah, bertaut eksplisit** |
|---|---|---|---|---|
| Saldo bank 30-09 / 31-10 | 8.000.000 / 8.300.000 ✔ | 8.000.000 / 8.300.000 ✔ | 8.000.000 / 8.300.000 ✔ | 8.000.000 / 8.300.000 ✔ |
| Saldo kas / akun uang muka | — | — | Uang muka 30-09: 2.000.000 (LPJ belum dicatat); setelah nota dicatat bertanggal 25-09: 300.000; 31-10: 0 | — (posisi uang muka di entitas: 2.000.000 → 300.000 → 0) |
| Pengeluaran aktual September | 2.000.000 (melebihi pemakaian 300.000) | 2.000.000 sampai pengembalian; setelah itu 1.700.000 **bila** koreksi dibebankan ke September (keputusan lintas bulan) atau −300.000 di Oktober | 1.700.000 (nota bertanggal 25-09, dicatat 05-10, sehingga angka September **berubah setelah** LPJ datang) | Kas keluar 2.000.000 (basis kas, terpisah) dan beban terealisasi 1.700.000 (dari LPJ terverifikasi); keduanya ditampilkan berbeda |
| Realisasi RAB September | 2.000.000 (100%) | 2.000.000 → 1.700.000 (kebijakan) | 1.700.000 | 1.700.000 setelah LPJ; sebelumnya "dicairkan, belum dipertanggungjawabkan 2.000.000" |
| Status LPJ | Tidak terlacak; Σ LPJ 1.700.000 vs 2.000.000 tanpa label | Uang muka 2.000.000 = LPJ 1.700.000 + kembali 300.000 (terhitung) | Saldo akun uang muka ≠ 0 berarti belum dipertanggungjawabkan | Eksplisit: DICAIRKAN → LPJ_DITERIMA (05-10) → DIVERIFIKASI → SELESAI (sisa 0) |
| Pengembalian sisa | Penerimaan operasional +300.000 (salah klasifikasi) | Transaksi pengembalian tertaut, bukan penerimaan operasional | Transfer akun uang muka → bank | Penerimaan bertanda "pengembalian uang muka", mengurangi saldo uang muka, bukan penerimaan operasional |
| Laporan Oktober | Penerimaan +300.000 (membesar) | Pengembalian 300.000 di baris tersendiri | Transfer internal 300.000 (bukan penerimaan) | Pengembalian 300.000 di baris tersendiri; LPJ diterima 05-10 |
| Risiko hitung ganda | **Tinggi** bila nota LPJ juga dijadikan transaksi (M1; kini diblokir heuristik P0-T1) | Sedang: nota tetap tidak boleh menjadi transaksi | **Rendah**: transfer bukan pengeluaran; nota satu-satunya pengeluaran | **Rendah**: LPJ bertaut ke uang muka tidak dapat membuat transaksi; Σ LPJ + kembali = uang muka |
| Perubahan skema (aditif) | Tidak ada | `05_TRANSAKSI.sifat` (UANG_MUKA / PENGEMBALIAN_UANG_MUKA), `refTransaksiId` | Jenis akun "Uang Muka" di `07_AKUN`; **transfer antar-akun (GAP-028) wajib** | Sheet `UANG_MUKA` (id, kegiatan, rabId, akunId, nominal, tanggalCair, pelaksana, status, tanggalLpjDiterima, tanggalVerifikasi, diverifikasiOleh, sisaDikembalikan, tanggalKembali); `05_TRANSAKSI.uangMukaId` + `sifat`; `19_LPJ.uangMukaId` |
| Prasyarat lain | — | Kebijakan periode koreksi | GAP-028; kebijakan pencatatan mundur ke periode tertutup (P1-POLICY: penanda) | Status LPJ (D-LPJ); peran verifikator ≠ BENDAHARA (D-T7, GAP-005) |
| Dampak KPI/FCC | Sekarang | Realisasi turun saat koreksi | Pengeluaran per nota; saldo akun uang muka masuk posisi kas (keputusan) | Butuh definisi "pengeluaran aktual" mana yang dipakai BDS03/FCC (kas vs beban) — keputusan |

**Data minimum di semua opsi selain A:**
- penanda uang muka;
- pelaksana;
- tautan LPJ → uang muka/transaksi;
- tanggal terima dan verifikasi LPJ beserta verifikatornya;
- tautan pengembalian → uang muka.

**Catatan:**
- Model sekarang (A) **tidak dianggap benar**: pengeluaran dan realisasi RAB melebihi pemakaian, dan sisa tercatat sebagai penerimaan operasional.
- Model tidak dipilih di sini. Opsi B memerlukan GAP-028, sedangkan opsi C memerlukan keputusan status LPJ dan peran verifikator.

## 5. D-T1: desain tautan LPJ ↔ transaksi (belum diimplementasikan)

| Kebutuhan | Rancangan |
|---|---|
| Menautkan LPJ ke transaksi yang sudah ada | Fungsi server `opLinkLpj({lpjId, transaksiId, expect:{transaksiId:''}, clientRequestId})`, khusus BENDAHARA. Syarat: LPJ aktif belum bertaut; transaksi PENGELUARAN aktif; Σ LPJ aktif ≤ nominal (aturan RecordGuard yang ada); bila model C dipilih, transaksi harus ber-`sifat` UANG_MUKA. Perbedaan unit/periode → `PERLU_PEMERIKSAAN` (menunggu kebijakan lintas bulan), **bukan** otomatis diterima |
| Mencegah satu transaksi mempertanggungjawabkan beberapa LPJ secara tidak sah | Σ nominal LPJ aktif per transaksi ≤ nominal (sudah ada); ditambah kunci unik (lpjId) dan konflik `expect`, sehingga dua tautan bersamaan pada LPJ yang sama ditolak (`CONFLICT`) |
| Mencegah satu LPJ membuat beberapa transaksi | Ganti alur dua langkah klien (buat transaksi, lalu simpan tautan) dengan satu fungsi server **atomik** `opCreateExpenseFromLpj({lpjId, akunId, unit, kategori})`: membuat transaksi dan menautkan LPJ di dalam satu lock; idempotensi dengan kunci `lpj:<lpjId>`. P0-T1 sekarang memakai id lokal deterministik sebagai pengaman sementara |
| Pembatalan/koreksi tautan | `opUnlinkLpj({lpjId, alasan, expect})`: alasan wajib; LPJ kembali "belum bertaut"; transaksi **tidak** dihapus. Koreksi = batal + tautan baru |
| Audit trail | Audit `LPJ_LINK` / `LPJ_UNLINK` (before/after, aktor sesi) pada append yang sama dengan perubahan. Bila riwayat penuh dibutuhkan: sheet aditif `LPJ_TAUTAN` (id, lpjId, transaksiId, status AKTIF/DIBATALKAN, alasan, oleh, waktu), karena `19_LPJ.transaksiId` hanya menyimpan tautan terakhir |
| Verifikasi | Tautan oleh BENDAHARA; verifikasi LPJ oleh peran lain. Ini butuh D-T7 + GAP-005 dan belum ditambahkan |

**Evaluasi aturan 62 hari (pengaman sementara P0-T1; RD-08):**

| Jenis | Contoh (sandbox) | Akibat |
|---|---|---|
| False negative | Uang muka dicatat **70 hari** sebelum LPJ | Tidak terdeteksi; transaksi kedua dapat dibuat |
| False negative | Uang muka dicatat pada **unit lain** (TK vs MI) | Tidak terdeteksi |
| False negative | Uang muka dicatat dengan **kategori lain** (mis. "Konsumsi" untuk LPJ "ATK") | Tidak terdeteksi |
| False negative | Sisa uang muka belum ber-LPJ lebih kecil dari nominal LPJ ini (LPJ dipecah/dilebihkan) | Tidak terdeteksi |
| False positive | Belanja sah lain, unit + kategori sama, dalam 62 hari | Pembuatan transaksi sah terblokir |
| False positive | LPJ tanpa kategori atau kategori tak dikenal | Setiap pengeluaran unit sama dalam 62 hari memblokir |

Aturan ini adalah pengaman, **bukan kebijakan**. Ia tidak boleh menjadi permanen. Penggantinya adalah tautan eksplisit (`opLinkLpj` / `opCreateExpenseFromLpj`) dan model uang muka yang dipilih.

## 6. D-T7: pengelolaan peran

Pembatasan P0-T7 dipertahankan. Tidak ada kewenangan baru yang ditambahkan, dan K-RAB-07 tidak diimplementasikan.

Penambahan peran admin terpisah **tidak disarankan** sebelum GAP-005 diverifikasi live. Alasannya: dengan "Execute as user accessing", setiap peran dapat melewati kontrol lewat edit sheet langsung (§2.2).

## 7. D-T4b: audit tanggal yang belum terverifikasi (RD-09, RD-10)

| Field | Jalur tulis | Sekarang | Dampak | Usulan |
|---|---|---|---|---|
| `01_SISWA.tanggalMasuk` / `tanggalKeluar` | `opMasterUpsert('siswa')`, impor siswa | **Tidak divalidasi**; `2026-13-40` dan `31/02/2026` tersimpan | `enumeratePeriodesBulanan` mengabaikan tanggal tidak sah (`isNaN`). Siswa diperlakukan seperti tanpa tanggal masuk/keluar, sehingga **tagihan dapat bertambah** (RD-10) | Validasi kalender (opsional, kosong boleh) + `tanggalKeluar ≥ tanggalMasuk` |
| `23_TAHUN_AJARAN.label` | `opMasterUpsert('tahunAjaran')` | Pola `\d{4}/\d{4}` saja; `2026/2028` diterima | Label tahun ajaran mustahil | Tahun kedua = tahun pertama + 1 |
| `12_DUP_REVIEW.decidedAt` | `opRecordBatch('dupReview')` | Tidak divalidasi | Cap waktu keputusan tidak dapat dipercaya | Cap waktu diisi **server** (bukan klien) saat status berubah |
| `14_KPI.computedAt`, `19_LPJ.importDate`, `18_RKAT.importDate`, `04_KEWAJIBAN.computedAt` | Record generik | Tidak divalidasi (diisi klien) | Jejak waktu tidak andal | Diisi server, atau validasi ISO |
| `17_LAPORAN.tanggalDibuat` | Record | Divalidasi P0-T4 (tanggal atau ISO) | — | Sudah |
| `15_SETTINGS.periodeAktif` | `opSettingsUpsert` | Divalidasi P0-T4 (label bulan). **Data FINAL berisi `2026-10-01`** (GAP-008): tidak diubah, tetapi menyimpan ulang format itu kini ditolak | Perlu normalisasi terkendali (keputusan GAP-008) | — |
| `doPost` lama | `routeAction_` | Engine yang sama (`validateTanggal_`) | — | **BELUM DIVERIFIKASI** (jalur dimatikan) |

**Rentang tahun yang wajar** (usulan; **tidak diterapkan**):
- **Satu-satunya bukti rentang di data:** `23_TAHUN_AJARAN` FINAL berisi 7 label 2024/2025–2030/2031 (GAP-035). Transaksi operasional, mutasi, LPJ, komitmen, dan bukti seharusnya jatuh dalam rentang tahun ajaran terdaftar (≥ 2024-07-01).
- Tanggal masuk siswa dapat **lebih awal** (siswa MI kelas 6 masuk ±5 tahun sebelumnya). Batas bawahnya tidak dapat ditentukan tanpa data FINAL.
- **Usulan:** (1) uji kering read-only di salinan FINAL untuk min/maks tiap field tanggal; (2) di luar rentang tahun ajaran terdaftar cukup **ditandai** (peringatan/audit), tidak ditolak, sampai rentang disahkan; (3) yang ditolak tetap hanya format dan kalender.

Data lama tidak dikoreksi otomatis.

## 8. Keputusan yang masih memerlukan persetujuan

| ID | Keputusan | Menghambat |
|---|---|---|
| **GAP-005** | Jenis akun pengguna (Workspace sekolah vs Gmail); `executeAs`/`access`; spreadsheet & folder bukti tidak dibagikan ke pengguna | Klaim keamanan identitas; uji LV-ID; D-T7 |
| D-T1 | Model uang muka A' / B / C (A tidak disarankan); definisi "pengeluaran aktual" untuk FCC/BDS03 (kas vs beban) | Desain §4–5 |
| D-T1-link | Implementasi `opLinkLpj` / `opUnlinkLpj` / `opCreateExpenseFromLpj`; sheet riwayat `LPJ_TAUTAN` | Pengganti aturan 62 hari |
| D-LPJ | Status LPJ & peran verifikator | Opsi C, TC-LB-08 |
| D-T7 | Peran admin pengelola pengguna (setelah GAP-005) | — |
| D-T4b | Validasi `tanggalMasuk`/`tanggalKeluar`, label tahun ajaran, cap waktu server; rentang tahun (setelah uji kering FINAL); normalisasi `periodeAktif` FINAL (GAP-008) | — |
| R-GAP005-3/4 | Pengurangan permukaan publik; folder bukti dapat dikonfigurasi | Keamanan uji live |
| (tetap) | U-1 lintas periode, U-5 persetujuan RAB susulan, K-RAB-07 | — |

## 9. Status dan hasil tes yang dapat dibuktikan

Lokal: `node _build_tests/run_all_tests.js p1live`, log `_test_logs/p1live_*.log`.

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
| p0_hardening_tests | 32 | 0 | 1 |
| readiness_tests (baru) | 6 | 0 | 4 |
| **Total** | **446** | **0** | **31** |

- Tahap ini **tidak mengubah kode produksi**: tidak ada perubahan `.gs`/HTML/generate. Berkas baru hanya harness uji (`_live_tests/`), suite tes, dan dokumen. Tidak ada tes lama yang diubah.
- Catatan jujur: `readiness_tests` RD-05 sempat FAIL saat pertama dijalankan. Penyebabnya pemindai saya tidak mengenali delegasi `opEngineWrite_`/`opRecordBatch`, bukan celah. Pemindai diperbaiki dan kini memverifikasi bahwa fungsi tujuan delegasi sendiri memanggil `opGate_`.

- `readiness_tests` (baru): harness RD-01..04, permukaan publik RD-05..07, aturan 62 hari RD-08, tanggal RD-09..10.
- **Live: tidak ada yang dijalankan.** Status tetap `READY_FOR_INTEGRATION_TEST`.
