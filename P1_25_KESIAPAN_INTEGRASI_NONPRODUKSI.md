# P1_25 — Kesiapan Integrasi Nonproduksi dan Validasi Keuangan

**Tanggal:** 22 Oktober 2026

**STATUS AKHIR: `BLOCKED`**

Integrasi nyata tidak dapat dijalankan. Belum tersedia salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji per peran, maupun folder Drive bukti uji. GAP-005 belum diputuskan.

Status per bagian (bukan status akhir):

| Bagian | Status |
|---|---|
| Kode P1_25 (3 perbaikan kecil) | READY_FOR_INTEGRATION_TEST |
| Audit GAP-005, D-1, LPJ, uang muka, U-5, K-RAB-07 | READY_FOR_REVIEW |

Semua pengujian adalah **sandbox Node** (klien `vm` + server tiruan). **Tidak ada** pengujian Apps Script, deployment, setup LPJ, migrasi, atau penulisan ke spreadsheet mana pun. Angka keuangan di laporan ini berasal dari **fixture**, bukan data produksi.

---

## 1. Ringkasan eksekutif

- **GAP-005 tetap terbuka.**
  - Pilihan yang aman tanpa mengubah kode identitas hanya satu: akun dalam **satu domain terkelola** (Google Workspace, atau Cloud Identity bila terbukti) dengan *Execute as: Me*.
  - Gmail biasa butuh autentikasi token yang diverifikasi server. Itu proyek desain keamanan sendiri, **bukan** solusi otomatis aman.
  - Keputusan ada pada pemilik aplikasi (§3, §13).
- **Tiga cacat ditemukan dan diperbaiki** (minimal, diuji, dapat di-rollback):
  1. **D-1 (audit):** baris kewajiban beku historis tanpa `komponenId` dikelompokkan dengan kunci `siswa||periode`. Akibatnya komponen berbeda bisa dilaporkan sebagai `DUPLIKAT_PASTI` palsu. Kini baris itu dilaporkan sebagai `KOMPONEN_ID_KOSONG`.
  2. **D-LPJ:** jalur lama sudah tertutup begitu sheet `34_LPJ_TAUTAN` ada, walaupun setup belum lengkap. Pada setup parsial, kedua jalur jadi buntu. Kini jalur lama tertutup hanya bila skema **lengkap**.
  3. **D-LPJ:** "Buat Transaksi dari LPJ" untuk LPJ yang masih bertaut transaksi yang **sudah diarsip** menjawab "replay sukses". Kini ditolak `LPJ_BERTAUT_TRANSAKSI_ARSIP`; pengguna harus melepas tautan secara eksplisit (beralasan).
- **Uang muka:** matriks lengkap per peristiwa (§6).
  - Risiko terkonfirmasi: **pengarsipan atau koreksi nominal transaksi pencairan** lewat jalur transaksi umum membuat saldo uang muka tidak konsisten dengan FCC. Saat ini hanya terdeteksi lewat peringatan.
  - Usulan guard server terkecil disajikan, **tidak** diimplementasikan.
- **U-5 dan K-RAB-07:** hanya analisis; semua nilai tanpa dasar kebijakan tetap **TBD**; tidak ada enforcement.
- **Regresi:** 44 suite, **744 / 0 / 67**. Ke-42 suite lama identik dengan baseline (734/0/65).
- **Tidak berubah:** KPI, status transaksi, dan data historis.

---

## 2. Branch, HEAD, dan baseline

| Hal | Nilai |
|---|---|
| Branch | `claude/hopeful-galileo-mnifgq` (= `origin`), working tree bersih sebelum bekerja |
| HEAD awal | `acf3f96` (dokumen P1_24). Commit P1_23 `3675321` dan P1_24 `4d85507`/`bb5dd5d`/`903b091`/`acf3f96` semua leluhur; riwayat linear |
| `claude/compassionate-dirac-drm760` | Tetap `3675321`, tidak diubah |
| Baseline | 42 suite, **734 / 0 / 65** (`_test_logs/p1_25_baseline_*.log`); build deterministik |
| Commit P1_25 | `6eef855` (dokumen bagian 1: verifikasi + audit autentikasi), `8710b24` (D-1), `aab0d48` (D-LPJ + matriks), commit dokumen ini |
| Berkas kode yang disentuh | `KewajibanBekuAudit.gs` (`opKewajibanBekuAudit`), `UangMukaLpj.gs` (`umLpjTautanLewatOperasi_`, `opCreateExpenseFromLpj`), `_build_tests/run_all_tests.js`; uji baru `p1_25_d1_tests.js`, `p1_25_lpj_um_tests.js` |
| Tidak disentuh | Semua berkas hasil build (`Bendahara_V2.html`, `ServerBridge.*`, `TransactionEngine.gs`, `ObligationEngine.gs`, dll.), `FinanceEngine.gs`, `RabMapping.gs`, `RabPersetujuan.gs`, `RecordGuard.gs`, `RecordEngine.gs`, `AuthCentral.gs`, `ReconEngine.gs`, `PeriodLock.gs`, `_live_tests/` |

---

## 3. Status GAP-005 dan pilihan autentikasi

**Status: TERBUKA.** Rincian per pilihan ada di `P1_25_AUDIT_AUTENTIKASI_GAP005.md` (commit `6eef855`). Bagian ini menambahkan aspek yang diminta.

Seluruh perilaku platform diambil dari dokumentasi Google dan **belum diverifikasi live**.

### 3.1 Ringkasan pilihan

| | A. Workspace + Execute as Me (akses domain) | B. Workspace + Execute as user | C. Gmail + token terverifikasi | D. Alternatif (D1 satu operator; D2 Cloud Identity; D3/D4/D5 ditolak) |
|---|---|---|---|---|
| Verifikasi identitas | Sesi Google; `getActiveUser()` terisi untuk pengguna satu domain | Sesi Google pengguna | ID token OIDC diverifikasi server (`iss`, `aud`, `exp`, `email_verified`) di **setiap** permintaan | D1: pemilik saja; D2: seperti A, **belum terbukti** |
| Peran dari sumber tepercaya | `26_USER_ACCESS` di spreadsheet yang hanya dapat diakses pemilik | **Tidak**: pengguna editor dapat mengubah `26_USER_ACCESS` | Seperti A (+ usulan kolom `sub`) | Seperti A |
| Cegah edit langsung | Ya: skrip berjalan sebagai pemilik, data tidak dibagikan | **Tidak**: pengguna wajib editor spreadsheet | Ya (seperti A) | Ya |
| Izin spreadsheet/Drive | Pemilik (akun institusi) + admin cadangan saja | Semua pengguna: editor spreadsheet & folder | Pemilik saja; *front* C2 tanpa akses sheet | Pemilik saja |
| Perubahan kode identitas | Tidak ada | Tidak ada | **Besar** | Tidak ada |

### 3.2 Risiko pemalsuan identitas, pencurian token, dan penyalahgunaan sesi

| Risiko | A | B | C |
|---|---|---|---|
| Pemalsuan identitas lewat payload klien | Tidak mungkin: identitas dari sesi server; `deps` dari klien tidak dapat berisi fungsi (HD-T7-06) | Sama | **Mungkin bila implementasi salah**: email/peran wajib **hanya** dari token terverifikasi, tidak pernah dari body |
| Akun pengguna diretas | Ada; mitigasi 2SV wajib lewat konsol admin domain | Ada | Ada; akun Gmail pribadi **tidak dapat** diwajibkan 2SV oleh sekolah |
| Pencurian token | Tidak ada token aplikasi; yang ada cookie sesi Google di peramban | Sama | ID token = *bearer* berumur ±1 jam yang **tidak dapat dicabut satu per satu**. Mitigasi: wajib cek `aud`/`exp`, HTTPS, jangan menyimpan/mencatat token, nonce/anti-replay, dan cek status `26_USER_ACCESS` di setiap permintaan |
| Token dari aplikasi lain dipakai | n/a | n/a | Ditolak hanya bila `aud` diperiksa **persis** = client ID yang diizinkan |
| Penyalahgunaan sesi (perangkat bersama, peramban tidak logout) | Siapa pun di peramban yang masih login bertindak sebagai pengguna itu. Kode tidak memiliki *timeout* sesi aplikasi | Sama | Sama selama token masih berlaku |
| Embedding/klikjacking | `setXFrameOptionsMode(DEFAULT)` (P0-C) | Sama | Frontend terpisah wajib mengatur kebijakan frame & CSP sendiri |
| Super admin / pemilik deployment diretas | Kendali penuh (pemilik = data) | — | Sama + kendali klien OAuth |
| BENDAHARA menambah akun BENDAHARA kedua (G-1) | Mungkin (`OP_ROLE_ASSIGNABLE_BY_`) | Mungkin + edit langsung | Mungkin |

### 3.3 Kemampuan pencabutan akses

| Mekanisme | A | B | C |
|---|---|---|---|
| Ubah status `26_USER_ACCESS` menjadi INACTIVE | **Berlaku pada panggilan berikutnya** (identitas & peran dihitung ulang per panggilan, K2) | Pengguna dapat mengembalikannya sendiri (editor) | Berlaku per permintaan bila server mengecek status setiap kali |
| Nonaktifkan akun Google | Admin domain: suspend akun / keluarkan sesi | Sama | **Tidak tersedia** bagi sekolah untuk Gmail pribadi |
| Cabut hak spreadsheet | Tidak relevan (pengguna tidak punya hak) | Wajib, tetapi salinan yang sudah diunduh tidak dapat ditarik | Tidak relevan |
| Token yang sudah terbit | — | — | Tetap sah sampai `exp` kecuali server menolak berdasarkan status `26_USER_ACCESS` |

### 3.4 Batasan teknis Apps Script

Angka kuota diambil dari dokumentasi kuota Apps Script. Angka ini dapat berubah; **periksa ulang** sebelum keputusan.

- `Session.getActiveUser().getEmail()` dapat kosong bila pengguna dan pemilik tidak satu domain, atau pada konteks tanpa otorisasi pengguna. Kode menangani ini dengan **gagal tertutup**.
- Batas waktu satu eksekusi (±6 menit) dan batas eksekusi bersamaan. Pada *Execute as Me*, semua eksekusi berjalan atas nama pemilik dan memakai kuota pemilik.
- `LockService` men-serialisasi penulisan. Di bawah beban, `LOCK_TIMEOUT` dapat terjadi (belum diukur live).
- Tidak ada fungsi bawaan untuk memverifikasi tanda tangan RS256 JWT. Verifikasi token praktis lewat `UrlFetchApp` ke endpoint `tokeninfo` Google, yang menambah latensi per permintaan dan memakai kuota `UrlFetchApp` harian.
- Halaman HtmlService berjalan di iframe `*.googleusercontent.com` dengan subdomain yang tidak tetap, sehingga tidak cocok untuk *Authorized JavaScript origins* Google Identity Services. Varian C1 membutuhkan frontend di origin tetap.
- `doPost` web app akses *Anyone* dapat dipanggil siapa pun di internet, sehingga setiap jalur tanpa verifikasi menjadi celah.
- `appsscript.json` tidak ada di repo, sehingga konfigurasi nyata tidak dapat diaudit dari kode (G-4).

### 3.5 Pengujian yang diperlukan

| Uji | A / D2 | C |
|---|---|---|
| `ltIdentitasProbe()` per akun uji (editor + web app) | `emailAktifTerbaca=true`, `aktifSamaDenganEfektif=false`, kode/peran benar | n/a (identitas dari token) |
| Akun uji membuka spreadsheet/folder langsung | **Harus ditolak** | **Harus ditolak** |
| Akun tidak terdaftar / INACTIVE | `USER_NOT_FOUND` / `USER_INACTIVE` | Sama |
| Pencabutan: ACTIVE → INACTIVE saat sesi terbuka | Panggilan berikutnya ditolak | Permintaan berikutnya ditolak meski token masih berlaku |
| Akun luar domain | `AUTH_REQUIRED` | n/a |
| Token: `aud` salah, kedaluwarsa, tanda tangan rusak, `email_verified=false`, tanpa token, token diputar ulang, email di body berbeda dari token | n/a | **Semua ditolak** |
| Peran istimewa (`ltRejectionChecks` T7) | Ditolak | Ditolak |
| Fungsi publik tanpa gerbang (`include`, `TEST_*`, `?ping=1`) | Tidak membuka data | Tidak membuka data |

### 3.6 Bukti yang harus dikumpulkan untuk menutup GAP-005

1. Keputusan tertulis pemilik: jenis akun + `executeAs`/`access` + akun pemilik deployment (akun institusi).
2. `appsscript.json` uji dan produksi tersimpan di repo.
3. Tangkapan setelan berbagi spreadsheet & folder bukti: hanya pemilik/admin.
4. Hasil `ltIdentitasProbe()` JSON untuk setiap akun uji (BENDAHARA, KEPALA_SEKOLAH, YAYASAN, AUDITOR, akun tak terdaftar, akun luar domain).
5. Bukti akun uji **tidak** dapat membuka spreadsheet/folder langsung.
6. Bukti pencabutan (INACTIVE → ditolak pada panggilan berikutnya).
7. `ltRejectionChecks()` dan `ltPostflight()` lulus pada salinan.
8. Untuk C saja: dokumen desain keamanan, kode verifikasi token dengan uji negatif lengkap, dan konfigurasi klien OAuth.
9. Keputusan G-1 (siapa yang boleh menambah BENDAHARA).

Tanpa butir 1–7, GAP-005 **tidak** ditutup.

### 3.7 Rekomendasi teknis (bukan keputusan)

- Prioritas: A, atau D2 bila `ltIdentitasProbe` membuktikan email terbaca.
- C hanya bila domain terkelola tidak mungkin dipakai, dan sebagai proyek terpisah dengan tinjauan keamanan.
- B dan D3–D5 tidak disarankan.

---

## 4. Hasil audit D-1 (kewajiban beku)

### 4.1 Audit kode

| Syarat | Bukti | Status |
|---|---|---|
| ID kanonis klien = server | Klien `kwIdKanon_` dan server `oblHash_` memakai algoritme sama; KN-01 (3.000 kunci, termasuk non-ASCII), KN-02/03/13 | Terpenuhi (sandbox) |
| Duplikat pasti ≠ kasus manual | `kwDupKlasifikasi_` (P1_24): `DUPLIKAT_PASTI` vs `PERLU_KEPUTUSAN_MANUAL` dengan 4 alasan; KK-01..09 | Terpenuhi |
| Hubungan alokasi ditampilkan | Per baris `alokasiTagihanId`, `alokasiLewatKunciSaja`, `selisihTerbayarTerhadapTerpilih`; `ALOKASI_MULTI_BEKU`, `ALOKASI_TAGIHAN_TIDAK_DIKENAL`, `ARSIP_BERPEMBAYARAN`; kini juga alokasi untuk `KOMPONEN_ID_KOSONG` (PA-02) | Terpenuhi |
| Audit tidak mengubah spreadsheet | `KewajibanBekuAudit.gs` tidak memanggil fungsi tulis/kunci/audit (PA-04, analisis statis); seluruh sheet identik sebelum/sesudah (KK-*, LS-03, PA-01) | Terpenuhi |
| Tidak ada hapus/gabung/bekukan ulang/koreksi otomatis | Tidak ada jalur tulis; `opKewajibanKoreksi` **tidak ada** (PA-04); `tindakanOtomatis: 'TIDAK_ADA'` | Terpenuhi |
| Tidak bergantung nama komponen saja | Kunci = `siswaId|komponenId|periode`; nama hanya untuk `KOMPONEN_NAMA_GANDA` (PA-03). **Cacat ditemukan:** baris tanpa `komponenId` → kunci `siswa||periode` → komponen berbeda dicampur → `DUPLIKAT_PASTI` palsu. **Diperbaiki** (`8710b24`): dilaporkan `KOMPONEN_ID_KOSONG`, tidak dikelompokkan (PA-01) | Terpenuhi setelah perbaikan |

**Temuan data yang perlu diperiksa pada salinan:**
- Klien sebelum P1_23 mengisi `komponenId` lewat `komponenByNama`. Bila nama komponen tidak ditemukan saat itu, `komponenId` tersimpan **kosong**. Baris seperti itu **tidak dipakai perhitungan**: kewajiban dihitung ulang dari tarif saat ini (PA-01).
- Bila saat itu ada dua komponen bernama sama, `komponenId` dapat menunjuk komponen yang salah. Audit hanya dapat menandai `KOMPONEN_NAMA_GANDA`; ketepatan per baris butuh pemeriksaan manual.

### 4.2 Prosedur audit pada salinan nonproduksi (belum dijalankan)

1. Prasyarat §9 terpenuhi. Jalankan `ltPreflight()`.
2. Jalankan `ltKewajibanBekuAudit()`, simpan JSON. Syarat: `bacaSaja = true`.
3. Bila suatu jenis > 200 butir, daftar terpotong (`MAX = 200`). Catat `jumlahPerJenis`.
4. Isi lembar tinjauan manual dengan kolom berikut (satu baris per pengecualian):

| Kolom | Sumber |
|---|---|
| `jenis` | `pengecualian[].jenis` |
| `kunci` / `siswaId` / `periode` / `komponenId` | dari pengecualian |
| `ids` (semua baris beku) | `ids` / `baris[].id` |
| `barisTerpilih` (dipakai perhitungan saat ini) | `barisTerpilih` |
| `idKanonis`, `idKanonisAda` | idem |
| nilai per baris (`bruto`, `netto`, `tarifSatuan`, `jumlahHari`) | `baris[]` |
| `klasifikasi`, `alasanKlasifikasi` | idem |
| alokasi per baris (`alokasiTagihanId`) & `alokasiLewatKunciSaja` | idem |
| `terbayar`, `nettoTerpilih`, `selisihTerbayarTerhadapTerpilih` | idem |
| Keputusan manual (baris sah, nasib alokasi, alasan) | **diisi peninjau** |
| Peninjau 1 (Bendahara) & peninjau 2 (penyetuju), tanggal | **diisi peninjau** |

5. Jalankan `ltPostflight()`: tidak ada baris berubah.
6. `opKewajibanKoreksi` **tetap ditahan** sampai lembar tinjauan disetujui dan kebijakan koreksi (siapa, alasan, before/after, tanpa menyentuh 06) disetujui tertulis.

**Tidak ada klaim hasil audit data historis.**

---

## 5. Kesiapan pengujian LPJ

### 5.1 Audit jalur

| Jalur | Perilaku (sandbox) | Bukti |
|---|---|---|
| Pratinjau setup | Baca-saja; plan 3 sheet + 9 kolom | UM-01, LS-04 |
| Setup | BENDAHARA + konfirmasi `BUAT_SKEMA_UANG_MUKA_LPJ`; audit dulu; idempoten; data lama identik; TEREKONSILIASI tidak berubah; **tidak menghapus/menulis ulang histori** (hanya menambah sheet & kolom header di kanan) | UM-01, LS-06 |
| Setup parsial | Sheet gagal → setup ulang melengkapi (LS-07). **Cacat:** kolom gagal setelah sheet 32–34 dibuat → jalur lama tertutup (`34_LPJ_TAUTAN` ada) padahal jalur baru `SCHEMA_ADDITIVE_REQUIRED`, sehingga kedua jalur buntu. **Diperbaiki** (`aab0d48`): jalur lama tertutup hanya bila 3 sheet + 9 kolom lengkap (PA-05); sheet 34 buatan manual tidak menutup jalur lama (PA-06) | LS-07, PA-05/06 |
| Buat transaksi dari LPJ | Atomik dalam satu kunci; crid server `lpj:<id>[:<n>]` | LK-01, BR-03 |
| Permintaan berulang / klik ganda | REPLAY, tetap 1 transaksi | LK-01, BR-03/04, LS-09 |
| Retry setelah respons hilang | REPLAY transaksi yang sama | BR-05 |
| Kegagalan parsial (tautan gagal ditulis) | Transaksi di-rollback; retry → tepat 1 | LK-02, LS-12 |
| Tautkan | Hanya ke PENGELUARAN **aktif**; ke transaksi diarsip → `INVALID_TRANSACTION` | LK-03, PA-07 |
| Lepas tautan | Alasan ≥ 10, `expect`; riwayat 34 DIBATALKAN, transaksi tidak dihapus | LK-04, BR-08 |
| Lepas lalu buat ulang | Transaksi lama aktif → `TRANSAKSI_LPJ_SEBELUMNYA_AKTIF`; lama diarsip → transaksi baru generasi 2 | LS-10/11 |
| Transaksi tertaut kemudian diarsip | LPJ tetap menunjuk transaksi arsip (tidak diubah otomatis). **Cacat:** "Buat Transaksi" menjawab replay sukses. **Diperbaiki:** `LPJ_BERTAUT_TRANSAKSI_ARSIP`; harus lepas tautan beralasan dulu | PA-08 |
| Jalur lama sesudah setup lengkap | `GUNAKAN_OPERASI_TAUTAN`; tidak ada dua jalur aktif sekaligus | BR-07, LS-09, PA-05 |
| Rollback | Tidak ada hapus otomatis; `ltLpjRollbackCek` baca-saja | LS-08 |

**Kesimpulan:** dalam sandbox, tidak ada transaksi ganda, tidak ada tautan ulang implisit ke transaksi arsip, dan penolakan sudah tepat. **Belum diuji di Apps Script.**

### 5.2 Checklist prasyarat (semua wajib)

- [ ] Prasyarat lingkungan §9 lengkap; `ltPreflight()` lulus.
- [ ] Salinan cadangan kedua dibuat.
- [ ] Persetujuan tertulis pemilik untuk setup di **salinan** (bukan produksi).
- [ ] Konfigurasi GAP-005 uji dicatat.
- [ ] Commit kode uji dicatat (≥ `aab0d48`).

### 5.3 Langkah uji integrasi (setelah lingkungan tersedia)

| # | Langkah | Lulus bila |
|---|---|---|
| I-1 | `ltLpjSetupPreview()` | Plan sesuai; tidak ada penulisan |
| I-2 | `ltLpjSetupApply('BUAT_SKEMA_UANG_MUKA_LPJ', '<ID salinan>')` | `lulus=true`, ulang `unchanged`, `dataLamaBerubah` kosong, TEREKONSILIASI identik |
| I-3 | Web app (BENDAHARA uji): Buat Transaksi dari LPJ | 1 transaksi + tautan + riwayat 34 |
| I-4 | Klik ganda cepat; dua peramban bersamaan | Tetap 1 transaksi (uji `LockService` nyata) |
| I-5 | Putus jaringan setelah klik, lalu ulangi | REPLAY, tetap 1 |
| I-6 | Tautkan ke transaksi yang ada; lepas tautan beralasan | Riwayat lengkap, transaksi tetap |
| I-7 | Lepas → Buat ulang (transaksi lama aktif) | `TRANSAKSI_LPJ_SEBELUMNYA_AKTIF` |
| I-8 | Arsip transaksi lama → Buat ulang tanpa lepas | `LPJ_BERTAUT_TRANSAKSI_ARSIP`; setelah lepas → transaksi baru |
| I-9 | Tautkan ke transaksi diarsip | `INVALID_TRANSACTION` |
| I-10 | Jalur lama (opRecordBatch tautan) | `GUNAKAN_OPERASI_TAUTAN` |
| I-11 | AUDITOR mencoba operasi tulis | `ROLE_NOT_ALLOWED` |
| I-12 | `ltLpjRollbackCek()`, `ltPostflight()` | Dicatat; mutasi identik |

---

## 6. Matriks uang muka dan dampak FCC/BDS03

### 6.1 Audit UI, bridge, server

| Lapisan | Temuan |
|---|---|
| UI | Pusat Data → "Uang muka (baca-saja)"; empat angka + pengembalian + peringatan; **tanpa tombol tulis** (UI-08) |
| Bridge | Hanya `opUangMukaLaporan` & `opUangMukaDampakFcc` (baca); operasi tulis uang muka & verifikasi **tidak diekspos** (UI-01) |
| Server | `umPosisi_` mengabaikan pengembalian yang transaksinya diarsip; arus kas = transaksi pencairan **aktif**; peringatan bila tidak konsisten |
| Jalur arsip/koreksi | `opArchiveTransaction` (RecordEngine) dan `opUpdateTransaction` → `updateTransaction_` (nominal, tanggal, akun, **jenis**, dll. dapat diubah) **tidak mengenali** uang muka. Inilah sumber risiko §6.3 |

### 6.2 Matriks (fixture September 2026; `p1_25_lpj_um_tests` PA-09/10/11/12)

Empat kategori uang muka: (1) arus kas keluar, (2) pengeluaran dilaporkan, (3) pengeluaran terverifikasi, (4) saldo uang muka.

| Peristiwa | (1) | (2) | (3) | (4) | Pengembalian | FCC pengeluaran | FCC penerimaan | Populasi BDS03 (PENGELUARAN) | Peringatan |
|---|---|---|---|---|---|---|---|---|---|
| Awal (fixture) | — | — | — | — | — | 50.000 | 200.000 | 1 | — |
| Pencairan 2.000.000 | 2.000.000 | 0 | 0 | 2.000.000 | 0 | **+2.000.000** | — | **+1** | — |
| Nota 1.200.000 diajukan (belum diverifikasi) | = | **1.200.000** | 0 | = | 0 | tetap | tetap | tetap | — |
| Nota diverifikasi (bendera dinyalakan **di sandbox saja**) | = | 1.200.000 | **1.200.000** | **800.000** | 0 | tetap | tetap | tetap | — |
| Pengembalian 300.000 | = | = | = | **500.000** | 300.000 | tetap | **+300.000** | tetap | — |
| Arsip transaksi pengembalian | = | = | = | **800.000** | 0 | tetap | **−300.000** | tetap | `PENGEMBALIAN_DIARSIP` |
| Koreksi nominal pencairan → 1.500.000 | **1.500.000** | = | = | **800.000 (tetap dari nominalCair 2.000.000)** | 0 | **−500.000** | tetap | tetap | `NOMINAL_PENCAIRAN_BERBEDA` |
| Arsip transaksi pencairan | **0** | = | = | **800.000 (tetap)** | 0 | **−1.500.000** | tetap | **−1** | `PENCAIRAN_DIARSIP_ATAU_HILANG` |
| Uang muka 2: cair 400.000 lalu DIBATALKAN | 400.000 | 0 | 0 | 400.000 | 0 | +400.000 (pencairan **tetap** dihitung) | tetap | +1 | — |

Penjelasan per baris:
- "Pengeluaran dengan bukti": unggah bukti **tidak** mengubah status maupun angka (UM-06). Yang menggerakkan (2)/(3) adalah status LPJ.
- Nota (diajukan/diverifikasi) **tidak** menjadi transaksi kas, jadi FCC dan BDS03 tidak berubah. Tidak ada hitung ganda.
- Pengembalian adalah **penerimaan** FCC, bukan pengurang pengeluaran (formula aktif tidak diubah).
- Pembatalan tidak menghapus pencairan.

FCC dan BDS03 dibandingkan **terpisah** di tabel. BDS03 di sini hanya populasi masukan BDS03-I03 (jumlah PENGELUARAN dari `rabMatchAll_`), bukan skor KPI. Angka fixture **tidak mewakili** produksi.

### 6.3 Risiko: arsip/koreksi transaksi pencairan

Terkonfirmasi (PA-11). Lewat jalur transaksi umum:
- **Arsip pencairan:** FCC pengeluaran turun dan arus kas = 0, tetapi saldo uang muka tetap 800.000 dan status tetap DIVERIFIKASI. Saldo dan FCC **tidak konsisten**; hanya ada peringatan.
- **Koreksi nominal pencairan:** FCC mengikuti nominal baru, tetapi saldo tetap dari `nominalCair` lama.
- **Koreksi `jenis`** (PENGELUARAN → PENERIMAAN) juga diizinkan `updateTransaction_` dan akan membalik dampak FCC. Dicek di sandbox pada transaksi biasa: `opUpdateTransaction({id:'imp_trx_2', jenis:'PENERIMAAN'})` → `SUCCESS`; `TRX_IMMUTABLE_` hanya `id`/`createdAt`/kolom sumber. Belum diuji khusus pada transaksi pencairan.
- Arsip pengembalian konsisten (saldo naik kembali) + peringatan.

### 6.4 Usulan guard server terkecil (TIDAK diimplementasikan)

- **Rumusan:** di `opArchiveTransaction` dan pada hook pra-tulis `opEngineWrite_` untuk `UPDATE_TRANSACTION` (sejenis `opAllocGuard_`, sehingga `TransactionEngine.gs` hasil build tidak disentuh), tolak dengan `TRANSAKSI_UANG_MUKA_TERKUNCI` bila:
  - id transaksi ∈ `32_UANG_MUKA.transaksiCairId`, atau ∈ `33_UANG_MUKA_KEMBALI.transaksiId`;
  - dan (untuk update) field yang diubah termasuk `nominal`, `jenis`, `tanggal`, `akunId`, atau `unit`.
- Guard **hanya aktif bila sheet 32/33 ada**. Koreksi dilakukan lewat operasi khusus beralasan (usulan `opUangMukaKoreksi`), yang belum dirancang.
- **Audit dependensi yang harus selesai sebelum implementasi:**
  - semua pemanggil `opArchiveTransaction`/`opUpdateTransaction` di klien (koreksi transaksi, arsip massal, impor);
  - kompensasi internal `umRollbackTrx_` memakai `deleteRowById_`, sehingga tidak terdampak;
  - `ReconEngine`/pencocokan mutasi yang mungkin menyentuh status (bukan nominal);
  - dampak pada 544 TEREKONSILIASI (transaksi uang muka baru belum ada; historis tidak terdampak karena 32/33 belum ada di produksi);
  - pesan UX.
- **Dampak historis:** nol sebelum setup (tidak ada baris 32/33). Sesudah setup, hanya transaksi yang dibuat `opUangMukaCair`/`opUangMukaKembali`.
- **Keputusan dibutuhkan:** apakah koreksi pencairan diizinkan, oleh siapa, dan lewat jalur apa (§13).

---

## 7. Hasil U-5 (baca-saja)

`opRabTidakSurutSimulasi` **tidak mengubah** pencocokan aktif, data, metadata historis, atau KPI (US-03: seluruh sheet & `opRabRealization` identik). Belum ada data sah. Tabel berikut berasal dari fixture.

| RAB | Kasus | Kondisi saat ini I03/I05 | Simulasi I03/I05 (min–maks) |
|---|---|---|---|
| **METADATA_SAH** (`disetujuiPada` ISO sah + `disetujuiOleh`) | Disetujui sebelum transaksi (US-01) | 1/1 | 1/1 |
| METADATA_SAH | Disetujui 20-09, transaksi 05-09 (US-02) | 1/1 | 0/0 — `BERUBAH_GAGAL`, alasan tertulis |
| METADATA_SAH | Sama, tertaut komitmen (US-05) | 1/1 | 0/1 |
| **HISTORI_TIDAK_LENGKAP** | Tanpa metadata sah (US-04, US-08 "kemarin") | 1/1 | **0–1 / 0–1** — `TIDAK_DAPAT_DINILAI`, tanggal tidak dikarang |
| — | RAB belum disetujui (US-06) | 0/0 | 0/0 |

Pemetaan opsi kebijakan:
- "Terapkan hanya untuk RAB METADATA_SAH" = kolom **maks** (HISTORI_TIDAK_LENGKAP dianggap tetap lulus).
- "Terapkan untuk semua" = kolom **min**.

**Empat kasus kebijakan (P1_24 §8):**
1. **Transaksi `BERUBAH_GAGAL` pada periode tertutup.** Bila aturan berlaku surut ke periode yang sudah dilaporkan, I03 periode itu turun. Pilihan: berlaku hanya untuk periode setelah tanggal keputusan, atau ditampilkan sebagai catatan tanpa mengubah laporan lama.
2. **RAB `HISTORI_TIDAK_LENGKAP`.** Tanggal persetujuan tidak diketahui. Pilihan: dianggap sah (maks), atau wajib persetujuan susulan oleh penyetuju (butuh GAP-005/D-T7). Metadata **tidak boleh** dikarang.
3. **Komitmen yang meluluskan I05.** Transaksi gagal I03 tetapi tertaut `09_KOMITMEN` tetap lulus I05. Apakah komitmen tanpa persetujuan tepat waktu cukup? Ini terkait sumber BDS03-I05 (K-RAB-07).
4. **Persetujuan dicabut lalu disetujui ulang.** Metadata saat ini menyimpan persetujuan **terakhir** (riwayat ada di `13_AUDIT_LOG`). Transaksi di antara keduanya bisa gagal. Pilihan: pakai persetujuan pertama yang sah, atau terakhir.

---

## 8. Matriks K-RAB-07 (desain; tanpa enforcement)

Semua nilai tanpa dasar kebijakan = **TBD**.

### 8.1 Bukti yang dibutuhkan

| Hal | Rancangan | Status |
|---|---|---|
| Jenis bukti | NOTA / KUITANSI / BUKTI_TRANSFER | Desain |
| Format | JPG/PNG/PDF (server saat ini menerima PDF/PNG/JPEG/WEBP/GIF) | Selisih WEBP/GIF **TBD** |
| Wajib untuk SELESAI | ≥1 bukti berfile (P1-E sudah berlaku) | Berlaku |
| Unggah ≠ persetujuan | Entitas terpisah | Prinsip (UM-06) |

### 8.2 Jenis pengecualian tanpa bukti

**TBD.** Contoh kategori yang perlu diputuskan, bukan ditetapkan: belanja tunai kecil tanpa nota, nota hilang dengan pernyataan, pembayaran ke perorangan tanpa kuitansi resmi. Setiap pengecualian wajib persetujuan eksplisit beralasan + audit.

### 8.3 Pihak berwenang & batas kewenangan

| Tindakan | BENDAHARA | KEPALA_SEKOLAH | YAYASAN | AUDITOR |
|---|---|---|---|---|
| Mencatat pengeluaran & unggah bukti | Ya | Tidak | Tidak | Tidak |
| Setuju pengeluaran di luar RAB ≤ ambang A | Tidak | TBD | TBD | Tidak |
| Setuju pengeluaran di luar RAB > ambang A (ambang B?) | Tidak | TBD | TBD | Tidak |
| Setuju pengecualian tanpa bukti | Tidak | TBD | TBD | Tidak |
| Persetujuan susulan (batas waktu TBD) | Tidak | TBD | TBD | Tidak |
| Mengarsip/mengoreksi transaksi pencairan/pengembalian uang muka (§6.3) | Ya (saat ini, tanpa pembatasan) | TBD | TBD | Tidak |
| Menambah akun BENDAHARA (G-1) | Ya (saat ini) | TBD | TBD | Tidak |
| Membaca persetujuan, laporan & audit | Ya | Ya | Ya | Ya |

Ambang A/B: **TBD**, tidak ditetapkan.

### 8.4 Pencabutan persetujuan

**TBD:** siapa yang boleh (penyetuju asal? Yayasan?), batas waktu, dan dampak pada transaksi yang sudah dicocokkan. Pola teknis yang sudah ada (U-5): pencabutan mengosongkan metadata dan dicatat `RAB_PERSETUJUAN` di audit.

### 8.5 Audit trail (rancangan)

Setiap persetujuan/pencabutan/pengecualian mencatat:
- aktor & peran dari **sesi server** (bukan klien);
- waktu server;
- before/after;
- alasan;
- id transaksi/RAB.

Audit dicatat atomik dengan perubahan; gagal audit berarti perubahan dibatalkan (pola P0-B). Penyetuju ≠ pembuat. Semua ini bergantung pada GAP-005.

**Enforcement: tidak ada yang diaktifkan.**

---

## 9. Kebutuhan lingkungan uji

Checklist lengkap ada di P1_24 §3 (A–F) dan berlaku tanpa perubahan. Ringkasan prasyarat yang **belum tersedia**:

| # | Prasyarat | Penanggung jawab | Status |
|---|---|---|---|
| E-1 | Keputusan GAP-005 (jenis akun, `executeAs`/`access`) | Pemilik | Belum |
| E-2 | Salinan spreadsheet (ID ≠ produksi) + salinan cadangan | Pemilik produksi | Belum |
| E-3 | Proyek Apps Script terikat salinan, kode commit uji + `LiveReadiness.gs` | Admin teknis | Belum |
| E-4 | Akun uji BENDAHARA/KEPALA_SEKOLAH/YAYASAN/AUDITOR (jenis sesuai E-1) + akun tak terdaftar + akun luar domain | Pemilik/admin domain | Belum |
| E-5 | Folder Drive bukti uji (`BUKTI_FOLDER_ID`) | Admin teknis | Belum |
| E-6 | Script Property `LIVE_TEST_SPREADSHEET_ID` = ID salinan | Admin teknis | Belum |
| E-7 | Persetujuan tertulis untuk uji, termasuk setup LPJ di salinan | Pemilik | Belum |

---

## 10. Pengujian dan regresi

`node run_all_tests.js p1_25`; log di `_test_logs/p1_25_*.log`.

| Hal | Sebelum (baseline) | Sesudah |
|---|---|---|
| Jumlah suite | 42 | **44** |
| PASS / FAIL / INFO | 734 / 0 / 65 | **744 / 0 / 67** |
| 42 suite lama | — | **Identik** per suite (dibandingkan otomatis log baseline vs akhir: 0 berubah) |
| Suite baru | — | `p1_25_d1_tests` 4/0/0; `p1_25_lpj_um_tests` 6/0/2 (INFO = matriks PA-09 dan risiko PA-11) |
| Perubahan fixture/asersi uji lama | — | **Tidak ada** |
| Perubahan KPI | — | **Tidak ada**: `Bendahara_V2.html`, `FinanceEngine.gs`, `RabMapping.gs` tidak disentuh; formula/bobot/target/ambang 31 KPI tetap |
| Perubahan status transaksi | — | **Tidak ada** (tidak ada kode yang menulis status; 16_REKONSILIASI/ReconEngine tidak disentuh; 544 TEREKONSILIASI **tidak diverifikasi ulang**, tidak ada data sah) |
| Perubahan data | — | **Tidak ada** spreadsheet yang ditulis; uji memakai sheet tiruan dalam memori |

Perubahan perilaku kode (semuanya hanya pada kondisi yang sebelumnya salah):
- `opKewajibanBekuAudit`: baris tanpa `komponenId` → `KOMPONEN_ID_KOSONG`, bukan `DUPLIKAT_*`.
- `umLpjTautanLewatOperasi_`: jalur lama tetap terbuka sampai skema lengkap.
- `opCreateExpenseFromLpj`: LPJ bertaut transaksi arsip → `LPJ_BERTAUT_TRANSAKSI_ARSIP`, bukan replay sukses.

**Bukan uji Apps Script.** LockService nyata, `Session.getActiveUser`, jaringan, render peramban, kuota, dan data nyata belum diuji.

---

## 11. Risiko tersisa

| ID | Risiko |
|---|---|
| R-1 | GAP-005 terbuka; seluruh kontrol peran bergantung padanya |
| R-2 | Arsip/koreksi transaksi pencairan/pengembalian lewat jalur umum membuat saldo uang muka ≠ FCC (§6.3); hanya peringatan |
| R-3 | BENDAHARA dapat menambah BENDAHARA lain (G-1) |
| R-4 | Baris beku historis tanpa `komponenId` atau dengan `komponenId` salah (nama ganda) diabaikan perhitungan / tidak terdeteksi otomatis |
| R-5 | Audit setup parsial mencatat sheet yang direncanakan, bukan hanya yang berhasil |
| R-6 | `umPosisi_` memanggil `getTransactionRaw_` per baris; performa live belum diukur |
| R-7 | Klien dengan cache basi yang membekukan nilai berbeda: antrean terblokir (UX belum khusus) |
| R-8 | Teks INFO lama D1-04/05/06/09 usang |
| R-9 | 544 TEREKONSILIASI tidak diverifikasi tanpa salinan sah |
| R-10 | GAP-028 tetap **BLOCKED** (transfer antar akun tidak diaktifkan) |
| R-11 | Revert `8710b24` sendirian membuat runner mencari suite yang terhapus (§12) |

---

## 12. Commit dan rollback

| Commit | Isi |
|---|---|
| `6eef855` | Dokumen bagian 1: verifikasi repository + audit pilihan autentikasi |
| `8710b24` | D-1: `KOMPONEN_ID_KOSONG` (`KewajibanBekuAudit.gs`) + `p1_25_d1_tests.js` |
| `aab0d48` | D-LPJ: `umLpjTautanLewatOperasi_` & `opCreateExpenseFromLpj` (`UangMukaLpj.gs`) + `p1_25_lpj_um_tests.js` + daftar runner (kedua suite) |
| (commit ini) | Laporan + log |

**Rollback yang benar-benar diuji** (worktree terpisah, build + seluruh suite):

| Uji | Hasil |
|---|---|
| Revert `aab0d48` lalu `8710b24` | Tree **identik** dengan `6eef855` (diff 0 baris); **42 suite, 734/0/65** = baseline |
| Revert `aab0d48` saja | Bersih; 42 suite, 734/0/65 |
| Revert `8710b24` saja | Revert bersih secara git, tetapi `run_all_tests.js` masih mendaftarkan `p1_25_d1_tests` yang berkasnya terhapus → runner gagal (43 suite, 740/0/67 + 1 gagal). **Harus** revert berurutan dari yang terbaru, atau hapus nama suite itu dari runner secara manual |

Instruksi:
```
git revert --no-edit aab0d48 8710b24
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```
Tidak ada rollback data (tidak ada data yang diubah).

---

## 13. Keputusan yang masih diperlukan (pemilik aplikasi)

Rekomendasi teknis ada di §3.7 dan §6.4. Daftar berikut adalah **keputusan**, bukan rekomendasi.

1. **GAP-005:** jenis akun (Workspace/Cloud Identity domain sekolah, atau Gmail + proyek autentikasi token); `executeAs`/`access`; akun pemilik deployment (institusi) dan admin cadangan; apakah Yayasan memakai akun domain yang sama.
2. **Lingkungan uji:** penyediaan E-1..E-7 dan persetujuan uji (termasuk setup LPJ di salinan).
3. **G-1:** siapa yang boleh menambah peran BENDAHARA.
4. **D-1:** tinjau hasil audit salinan (lembar §4.2); kebijakan koreksi; baru kemudian izin implementasi `opKewajibanKoreksi`. Termasuk penanganan baris `KOMPONEN_ID_KOSONG`.
5. **D-LPJ:** jadwal setup produksi (terpisah, setelah uji salinan).
6. **D-T1:**
   - apakah transaksi pencairan/pengembalian boleh diarsip/dikoreksi, oleh siapa, lewat jalur apa (izin implementasi guard §6.4);
   - basis beban FCC/BDS03 (perubahan definisi KPI, butuh analisis & persetujuan terpisah);
   - perlu tidaknya UI tulis uang muka.
7. **U-5:** opsi maks (hanya METADATA_SAH) atau min (semua), dan empat kasus §7.
8. **K-RAB-07:** semua TBD §8 (ambang A/B, jenis pengecualian, batas Kepala Sekolah vs Yayasan, pencabutan, sumber BDS03-I05, batas waktu persetujuan susulan, format WEBP/GIF).
9. **GAP-028:** tetap BLOCKED sampai ada keputusan dan desain terpisah.

### Langkah konkret berikutnya

1. Pemilik memutuskan butir 1 dan menyediakan E-1..E-7.
2. Jalankan P1_24 §3 → `ltIdentitasProbe` → bukti §3.6.
3. `ltKewajibanBekuAudit` → lembar tinjauan §4.2.
4. Uji LPJ I-1..I-12.
5. Setelah keputusan butir 6, rancang guard §6.4 (audit dependensi lebih dulu).
