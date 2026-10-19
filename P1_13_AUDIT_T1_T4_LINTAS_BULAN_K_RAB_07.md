# P1_13 — Audit Lanjutan: Pengeluaran Ganda (T1), Validasi Tanggal (T4), Kebijakan Lintas Bulan, K-RAB-07, Sheet 30

**Tanggal:** 19 Oktober 2026
**Status proyek: READY_FOR_INTEGRATION_TEST** (tidak berubah). **Tahap ini: audit + rekomendasi. Tidak ada perubahan kode produksi.**

**Verifikasi awal:** branch `p1/implementasi` = `claude/vigilant-bell-967cih` = remote `6142d8f`, working tree bersih. Riwayat: `6142d8f` ← `30eec8a` ← `b26de58` ← `f955416` ← `44e14f0`.

**Bukti:**
- Pembacaan kode `6142d8f`.
- Suite simulasi baru `_build_tests/audit_p1_tests.js`, berjalan di sandbox Node dengan mock SpreadsheetApp. Bukan Apps Script, bukan Google Sheets, bukan data FINAL. Log: `_test_logs/p1audit_audit_p1_tests.log`.
- Header FINAL dari `_build_tests/fixtures/headers_backend.json`. **Isi data FINAL tidak tersedia.**

Di suite audit, status PASS berarti kontrol yang seharusnya berlaku memang berlaku. INFO berarti temuan atau karakterisasi perilaku sekarang: angkanya dicatat, tidak diklaim benar.

---

## 1. Audit T1: risiko pengeluaran ganda

### 1.1 Jawaban dengan bukti

| # | Pertanyaan | Jawaban | Bukti |
|---|---|---|---|
| 1 | Apakah pencairan dicatat sebagai pengeluaran aktual? | **Tidak ada konsep pencairan.** Kata pencairan/uang muka/panjar/kasbon tidak ada di kode, `DB_SCHEMA`, maupun 41 sheet FINAL. Satu-satunya cara mencatat uang keluar dari rekening sekolah ke pelaksana kegiatan adalah transaksi **PENGELUARAN** biasa: mengurangi saldo, masuk pengeluaran aktual, dan dicocokkan ke RAB. Transfer kas↔bank ditolak (`postTransaksi`, `Bendahara_V2.html` ±1100; GAP-028) | `05_TRANSAKSI` tanpa kolom sifat/jenis uang muka; `TransactionEngine.gs` hanya PENERIMAAN/PENGELUARAN |
| 2 | Apakah LPJ membuat transaksi baru? | **Tidak otomatis.** Impor LPJ hanya menulis `19_LPJ` (`commitLpjRow`, status `REALIZATION`, `transaksiId: null`). Tetapi UI menyediakan aksi **"Buat Transaksi Pengeluaran"** per baris LPJ yang belum bertaut (`createTransaksiFromLpj`, ±7208): transaksi PENGELUARAN baru bertanggal `19_LPJ.tanggal` dan bernominal LPJ. UI **tidak** punya aksi "tautkan LPJ ke transaksi yang sudah ada"; tautan hanya mungkin lewat API `opRecordBatch('lpj')` | `renderPengaturanImportData` (badge "Belum" + satu tombol), AU-T1-03 |
| 3 | Kapan transaksi yang sama dihitung dua kali? | Bila pencairan sudah dicatat sebagai PENGELUARAN lalu rincian LPJ-nya dijadikan transaksi lewat tombol tadi (model M1). RecordGuard LPJ (Σ LPJ ≤ nominal transaksi) **tidak** mencegahnya, karena setiap LPJ tertaut ke transaksi barunya sendiri | AU-T1-03, AU-T1-04 |
| 4 | Dapatkah sistem membedakan uang muka, pembayaran aktual, dan pertanggungjawaban? | **Tidak.** Tidak ada penanda uang muka, tidak ada status LPJ selain `REALIZATION`, dan tidak ada tanggal terima/verifikasi LPJ. `36_REF_LPJ_DOKUMEN` (FINAL; `pemeriksa`, `tanggalPemeriksaan`) tidak dipakai Web V2 | `P1_12` §1 |
| 5 | Bagaimana mencatat sisa uang yang dikembalikan? | Tidak ada jalur khusus. Yang tersedia hanya PENERIMAAN (`sumber` = "Penerimaan Lainnya"). Hasilnya: pengeluaran tetap penuh, penerimaan bertambah, dan pemasukan periode pengembalian ikut membesar | AU-T1-02 |
| 6 | Bagaimana mencegah duplikasi tanpa menyembunyikan pengeluaran? | Butuh keputusan model (§1.4). Prinsipnya: **setiap rupiah yang keluar dari rekening dicatat tepat sekali sebagai transaksi kas**; LPJ hanya **rincian/bukti** atas transaksi itu (tautan, bukan transaksi baru); sisa yang kembali dicatat sebagai pengembalian atas uang muka, bukan penerimaan operasional | — |

### 1.2 Skenario angka

Data:
- RAB "Kegiatan" September **DISETUJUI** Rp2.000.000; saldo awal bank Rp10.000.000.
- 20-09: pencairan uang muka Rp2.000.000 ke koordinator.
- 25-09: tiga nota (800.000 + 600.000 + 300.000 = Rp1.700.000).
- 05-10: LPJ diserahkan.
- 06-10: sisa Rp300.000 disetor kembali.

Rekening koran: 30-09 = 8.000.000; 31-10 = 8.300.000.

| Ukuran | **M0** pencairan = PENGELUARAN; LPJ ditautkan (API); sisa = penerimaan | **M1** pencairan = PENGELUARAN; LPJ → "Buat Transaksi" (UI) | **M2** pencairan tidak dicatat; transaksi dari LPJ bertanggal penyerahan 05-10; sisa = penerimaan | Yang benar secara ekonomi* |
|---|---|---|---|---|
| **Saldo bank** 30-09 | 8.000.000 ✔ | 8.000.000 ✔ | **10.000.000** ✘ (pencairan tidak tercatat) | 8.000.000 |
| Saldo bank 31-10 | 8.300.000 ✔ | 8.300.000 ✔ | **10.300.000** ✘ | 8.300.000 |
| Saldo kas 31-10 (transaksi dari LPJ memakai akun default pertama `akunKasBankList[0]` = kas) | 0 ✔ | **−1.700.000** ✘ | **−1.700.000** ✘ | 0 |
| **Total saldo** (bank + kas) 31-10 | 8.300.000 ✔ | **6.600.000** ✘ (−1.700.000, ganda) | **8.600.000** ✘ (+300.000 = sisa dicatat sebagai penerimaan) | 8.300.000 |
| **Pengeluaran aktual** Sep | 2.000.000 (uang muka, bukan pemakaian) | **3.700.000** ✘ ganda | 0 | 1.700.000 (+ 300.000 uang muka belum dipertanggungjawabkan s.d. 06-10) |
| Pengeluaran aktual Okt | 0 | 0 | 1.700.000 (pindah bulan) | 0 |
| Penerimaan Okt | +300.000 (bukan penerimaan operasional) | +300.000 | +300.000 | 0 (pengembalian uang muka) |
| **Realisasi RAB** Sep (B) / garis | 2.000.000 / I04 ok | **3.700.000** / I04 **gagal** (> pagu) | 0 (transaksi Okt tidak cocok garis Sep → TANPA RAB) | 1.700.000 |
| **Status LPJ** | Σ LPJ 1.700.000 < 2.000.000, selisih tanpa label | "Sudah" (tertaut ke transaksi palsu) | "Sudah" | Diterima 05-10; diverifikasi pada tanggal verifikasi; sisa 300.000 dikembalikan 06-10 |

\* Kolom terakhir hanya ilustrasi kebutuhan informasi. **Model akuntansi tidak dipilih di sini** (§1.4).

Sumber angka: AU-T1-01..06. M1 dijalankan lewat fungsi UI `createTransaksiFromLpj` yang sebenarnya di klien sandbox.

Temuan tambahan dari simulasi: modal "Buat Transaksi dari LPJ" hanya menanyakan unit. Akun sumber diambil diam-diam dari `akunKasBankList[0]` (kas), sehingga uang muka yang keluar dari **bank** dipertanggungjawabkan sebagai pengeluaran **kas**. Saldo per akun menjadi salah walaupun totalnya bisa kebetulan mendekati.

### 1.3 Data minimum yang belum ada

1. Penanda bahwa sebuah transaksi keluar adalah **uang muka** (bukan pembayaran final), beserta pelaksananya.
2. Tautan LPJ → uang muka/transaksi, dengan **aksi UI** (bukan hanya API).
3. Status dan tanggal LPJ: diajukan/diterima, diverifikasi (oleh siapa, kapan), ditolak.
4. Arti tanggal `19_LPJ.tanggal` (nota atau penyerahan) atau dua kolom terpisah.
5. Jalur pengembalian sisa yang ditautkan ke uang muka.

### 1.4 Opsi desain (perlu keputusan; tidak dipilih)

| Opsi | Inti | Arus kas | Pengeluaran aktual | Realisasi RAB | Prasyarat |
|---|---|---|---|---|---|
| **D1. Uang muka = PENGELUARAN bertanda** | `05_TRANSAKSI.sifat = UANG_MUKA` (aditif); LPJ wajib ditautkan; sisa = transaksi `PENGEMBALIAN_UANG_MUKA` yang mengurangi pengeluaran uang muka itu | Tepat | Saat pencairan; dikoreksi saat pengembalian | Saat pencairan (konservatif) | Jenis/penanda baru; aturan server; UI tautkan |
| **D2. Uang muka = piutang/kas kegiatan** | Pencairan = pindah dana ke "akun kas kegiatan"; nota LPJ = PENGELUARAN dari akun itu; sisa = pindah kembali | Tepat per akun | Saat nota (sesuai LPJ) | Saat nota | **GAP-028 (transfer) wajib** lebih dulu |
| **D3. Entitas pencairan tersendiri** | Sheet `PENCAIRAN` (id, kegiatan, nominal, tanggal, status: DICAIRKAN / DIPERTANGGUNGJAWABKAN_SEBAGIAN / SELESAI / SISA_DIKEMBALIKAN) di samping transaksi | Tepat bila tetap 1 transaksi kas | Tergantung aturan | Tergantung aturan | Sheet baru + rekonsiliasi uang muka |

**Pengaman sementara** (usulan, butuh persetujuan karena mengubah UI):
- Tombol "Buat Transaksi dari LPJ" diberi peringatan wajib, atau dinonaktifkan bila ada PENGELUARAN kategori/unit/periode yang sama yang belum punya LPJ penuh.
- Ditambah aksi "Tautkan ke transaksi yang ada".

Pengaman ini **tidak menyembunyikan** pengeluaran apa pun.

## 2. Audit T4: validasi tanggal

### 2.1 Matriks hasil (sandbox; AU-T4-M01..M08, P01..P04)

| Jalur tulis server | `2026-10-19` | `2026-13-40` | `2026-02-30` | `2024-02-29` | `2025-02-29` | `""` | `null` | `19/10/2026` | `2026-10-19T08:00:00` | `2026-1-9` |
|---|---|---|---|---|---|---|---|---|---|---|
| `opCreateExpense` / `opCreateIncome` / `opUpdateTransaction` / `opCreateTxBatch` (`validateTanggal_`) | terima | **terima** ✘ | **terima** ✘ | terima ✔ | **terima** ✘ | tolak ✔ | tolak ✔ | tolak ✔ | **terima** ✘ (sufiks waktu ikut tersimpan) | tolak ✔ |
| `lpj.tanggal` (`opRecordBatch`) | terima | **terima** ✘ | **terima** ✘ | terima | **terima** ✘ | **terima** ✘ | **terima** ✘ | **terima** ✘ | **terima** ✘ | **terima** ✘ |
| `komitmen.tanggal` | sama seperti `lpj` (tanpa validasi tanggal) | | | | | | | | | |
| `mutasiBank.tanggal` | sama seperti `lpj` | | | | | | | | | |
| `opUploadBukti` (`tanggal`) | sama seperti `lpj` (kosong → hari ini) | | | | | | | | | |
| `30_ALOKASI_PENGELUARAN` | tidak punya kolom tanggal; periode diturunkan dari tanggal transaksi | | | | | | | | | |

**Label periode:**

| Jalur | `Oktober 2026` | `oktober 2026` | `Bulan13 2026` | `2026-10` | `""` | `null` | `Tahun Ajaran 2026/2027` |
|---|---|---|---|---|---|---|---|
| `anggaran.periode` (RAB) | terima | **terima** | **terima** | **terima** | **terima** | **terima** | terima (label sah non-bulan) |
| `kewajiban.periode` | sama, semua diterima | | | | | | |
| `opReconcileAccount` / `opClosePeriod` (`plIsPeriodLabel_`) | terima | tolak | tolak | tolak | tolak | tolak | tolak |

**Dampak** (AU-T4-03): transaksi bertanggal `2026-13-40`
- memiliki periode `""`, sehingga tidak masuk pengeluaran Desember maupun Januari, laporan periode, atau KPI;
- **tetap** mengurangi saldo tanpa batas tanggal;
- tidak masuk saldo "per 31-12-2026", karena pembandingan string `'2026-13-40' > '2026-12-31'`.

Pada `2026-02-30`, server memetakannya ke Februari, sedangkan `new Date()` di klien menggulirkannya ke Maret.

**Jalur yang tidak diuji pada tahap ini** (tidak diklaim):
- `17_LAPORAN.tanggalDibuat`, `14_KPI`, `15_SETTINGS.periodeAktif`, `18_RKAT.tahun`;
- validasi klien impor `normalizeDateValue`, yang juga menerima `31/02/2026` → `2026-02-31`;
- jalur `doPost` lama (dinonaktifkan `LEGACY_DOPOST_ENABLED_`; bila aktif memakai `validateTanggal_` yang sama).

### 2.2 Rekomendasi validasi server yang konsisten

1. Satu fungsi server `sgValidDate_(v)`:
   - string tepat `^\d{4}-\d{2}-\d{2}$`;
   - tanggal kalender nyata (uji bolak-balik `Date.UTC(y, m-1, d)` → y/m/d sama; tahun kabisat benar);
   - rentang tahun yang wajar, ditetapkan sebagai kebijakan (mis. 2020–2035).
   - Nilai `Date` dari Sheets dinormalisasi dulu (`sgDateStr_`).
2. Satu fungsi `sgValidPeriodLabel_(p)`: `plIsPeriodLabel_` atau label non-bulan yang terdaftar (`Tahun Ajaran YYYY/YYYY`, `SekaliBayar`).
3. Dipakai di **semua** jalur:
   - `validateTanggal_` (mencakup create/update/batch/`doPost` lama);
   - RecordGuard per key: `lpj.tanggal`, `komitmen.tanggal`/`jatuhTempo`, `mutasiBank.tanggal`, `bukti.tanggal`, `anggaran.periode`, `kewajiban.periode`, `laporan.periode`;
   - `opUploadBukti`.
4. **Data historis:** validasi hanya saat field tanggal **dibuat atau diubah**. Baris lama yang tidak valid **tidak** diubah dan **tidak** memblokir pengubahan field lain. Baris itu dilaporkan oleh audit read-only (uji kering) untuk ditindaklanjuti manual.
5. Sufiks waktu (`…T08:00:00`): tolak (usulan) atau normalisasi. Ini keputusan, karena normalisasi mengubah input.
6. Klien (`normalizeDateValue`, form) diselaraskan **hanya untuk UX**. Otoritas tetap di server.

## 3. Matriks kebijakan lintas bulan (diperbarui; menggantikan `P1_12` §4 untuk kasus 1–9)

| # | Kasus | Keputusan | Saldo | Periode transaksi | Realisasi RAB | KPI | LPJ | Bukti |
|---|---|---|---|---|---|---|---|---|
| 1 | RAB Sep, transaksi Sep, LPJ Okt | **ACCEPT** | Menurut tanggal transaksi (Sep) | Sep (tidak berubah karena LPJ) | Garis Sep | BDS03 Sep; LPJ tidak masuk KPI | Diterima Okt; "menunggu verifikasi" **belum dapat direpresentasikan** (keputusan D-LPJ) | RAB-36 |
| 2 | RAB Sep, transaksi aktual Okt | **NEEDS_POLICY_DECISION** (D-LB-2) | Okt | Okt (tanggal tidak diubah) | Sekarang: TANPA RAB (aturan kategori), atau "garis periode lain" (B2) bila dialokasikan eksplisit | I03/I05 Okt gagal; I04 garis Sep ikut menghitung alokasi eksplisit (T5) | — | RAB-33, RAB-34 |
| 3 | RAB disetujui setelah transaksi | **NEEDS_POLICY_DECISION** (D-LB-3) | Tidak terpengaruh | Tetap | Sekarang **berlaku surut**: begitu status menjadi DISETUJUI, transaksi lama lulus I03 | I03/I05 berubah surut tanpa jejak waktu persetujuan | — | AU-LB-01 |
| 4 | LPJ diterima, belum diverifikasi | **ACCEPT** (pencatatan) + skema dibutuhkan (D-LPJ) | Tidak terpengaruh | Tidak terpengaruh | Tidak terpengaruh | Tidak ada KPI LPJ | Status tidak tersedia; hanya `REALIZATION` | `P1_12` T3 |
| 5 | LPJ diverifikasi setelah tutup buku | **ACCEPT**, ditandai di audit (status periode = penanda, P1-POLICY) | Tidak terpengaruh | Transaksi tidak berubah | Tidak terpengaruh | Tidak terpengaruh | Diterima + `PERIODE_DITANDAI` menurut `19_LPJ.tanggal` | AU-LB-02 |
| 6 | Satu transaksi, beberapa alokasi | **ACCEPT** bila Σ ≤ nominal, setiap alokasi ITEM sah | Sekali | Tetap | Dibagi per garis; C bertambah sekali | I03 lulus bila semua bagian ke RAB DISETUJUI dan tanpa sisa | — | RAB-32, AU-LB-03 |
| 7 | Σ alokasi > nominal | **REJECT** (`ALOKASI_EXCEEDS_TRANSACTION`; data lama yang berlebih diabaikan + dilaporkan) | — | — | — | — | — | RAB-04/14/15, AU-LB-03 |
| 8 | Alokasi ke RAB belum disetujui | **ACCEPT** sebagai data; **tidak** dihitung sebagai anggaran disetujui | Tidak terpengaruh | Tetap | B1 "RAB belum disetujui", bukan B | I03/I05 gagal | — | RAB-06, RAB-29 |
| 9 | RAB/transaksi tanpa referensi valid | **REJECT** (`INVALID_TRANSACTION` / `INVALID_RAB`) | — | — | — | — | LPJ ke transaksi tidak valid juga REJECT | RAB-05/14, AU-LB-03 |

**Prinsip yang dipegang:**
- Tanggal LPJ ≠ tanggal transaksi.
- Tanggal transaksi tidak pernah diubah agar cocok dengan RAB.
- Tidak ada aturan lintas bulan yang dibuat dari asumsi; kasus 2 dan 3 menunggu keputusan.

## 4. K-RAB-07: analisis C+B dengan kemampuan sistem saat ini

### 4.1 Kemampuan membedakan peran (fakta)

| Hal | Temuan | Bukti |
|---|---|---|
| Peran di server | `getCurrentUserIdentity` memakai `Session.getActiveUser().getEmail()` + `26_USER_ACCESS` (`BENDAHARA`, `KEPALA_SEKOLAH`, `YAYASAN`, `AUDITOR`). Semua tulis lewat `opGate_` | AU-K7-01 (sandbox) |
| Peran tulis | Hanya `BENDAHARA` (`OP_WRITE_ROLES_`); Kepala Sekolah/Yayasan baca-saja | `OperationalAPI.gs:31,39` |
| **Pengelolaan peran (T7, temuan baru)** | `opUserUpsert` dijaga `OP_WRITE_ROLES_`, sehingga **BENDAHARA dapat membuat/mengubah pengguna berperan KEPALA_SEKOLAH/YAYASAN** | AU-K7-02 |
| Keandalan identitas live | **Belum terbukti.** `getActiveUser()` hanya andal pada konfigurasi deploy tertentu (`executeAs`/akses, GAP-005 **belum diputuskan**); belum diuji di Apps Script | `P1_07` §1.6 |
| Pembuat transaksi | `05_TRANSAKSI` tidak punya `createdBy`; aktor hanya ada di `13_AUDIT_LOG` (`sumber: google:<email>`) | `TRX_HEADERS`, `engineAuditBatch_` |

**Konsekuensi:** saat ini **tidak dapat diklaim** bahwa identitas pemberi persetujuan dapat dipercaya, karena:
- (a) identitas sesi belum diverifikasi live;
- (b) pemohon (BENDAHARA) dapat memberi dirinya atau akun lain peran penyetuju.

Validasi di klien tidak dihitung sebagai otorisasi.

### 4.2 Desain C+B yang dikaji (belum disetujui)

| Aspek | Usulan |
|---|---|
| Entitas | `31_PERSETUJUAN_PENGELUARAN` (aditif, dibuat lewat setup eksplisit): `id, transaksiId, nominalDisetujui, status, alasan, buktiId, komitmenId (rujukan opsional), disetujuiOleh, peranPenyetuju, disetujuiPada, dibatalkanOleh, dibatalkanPada, alasanPembatalan, createdAt, createdBy` |
| Kewenangan | Fungsi server `opApproveExpense` / `opRejectExpense` / `opRevokeApproval` khusus peran `KEPALA_SEKOLAH`/`YAYASAN`; batas kewenangan per nominal (mis. Yayasan di atas ambang) = keputusan |
| Identitas & waktu | `disetujuiOleh`/`peranPenyetuju`/`disetujuiPada` diisi **server** dari sesi, bukan dari payload klien |
| Pemisahan tugas | Penyetuju ≠ pembuat transaksi (dari audit log atau kolom `createdBy` baru). **Prasyarat: T7 ditutup**, yaitu pengelolaan `26_USER_ACCESS` dipindah ke peran admin terpisah atau butuh persetujuan pihak kedua |
| Alasan & bukti | `alasan` wajib; `buktiId` (10_BUKTI) wajib di atas ambang (keputusan) |
| Nominal | `nominalDisetujui ≥ nominal transaksi` agar lulus; kurang → tidak lulus, dilaporkan |
| Pemakaian berulang | Satu persetujuan aktif per `transaksiId` (unik); persetujuan tidak dapat dipindah ke transaksi lain (`transaksiId` immutable) |
| Pembatalan & audit | Status `DIBATALKAN` dengan alasan (tidak dihapus); audit pada append yang sama; idempotensi `clientRequestId`; deteksi konflik `expect` |
| Komitmen | Hanya rujukan dasar (COMMITTED/INCURRED/PAID); **bukan** pengganti persetujuan |
| BDS03-I05 | Lulus bila I03 lulus **atau** ada persetujuan sah (status DISETUJUI, peran berwenang, nominal cukup). Perlu uji diferensial; definisi/bobot tidak berubah |
| Financial Control | Angka tidak berubah; informasi tambahan "di luar RAB: disetujui / belum disetujui" |

Sampai diputuskan, BDS03-I05 tetap seperti terdokumentasi dan tidak dipaksa lulus (RAB-27).

## 5. Sheet `30_ALOKASI_PENGELUARAN`: rencana setup

**Mengapa `MISSING_SHEET` muncul:** sejak `44e14f0`, `opSchemaReport` memuat header yang diharapkan untuk sheet ini, sedangkan sheet itu **sengaja tidak dibuat** otomatis (K-RAB-08). Ia bukan bagian `DB_SCHEMA`, sehingga `setupDatabaseStructure_` tidak membuatnya. Header FINAL: sheet tidak ada; yang ada `30_REF_ALOKASI_PENGELUARAN`.

**Perilaku saat sheet belum ada** (AU-S30-01):
- `opReadSheet` → OK kosong (`sheetMissing`);
- FCC dan `opRabRealization` → OK tanpa pemetaan eksplisit;
- uji kering → `NOT_FOUND` bila `30_REF` tidak ada.

**Risiko saat sheet ada dengan header salah:**
- server (FCC, setup) **gagal tertutup** (`SCHEMA_MISMATCH`) dan header tidak ditimpa (AU-S30-02);
- **tetapi** `opReadSheet` tidak memeriksa kolom wajib, sehingga KPI di klien **tetap dihitung** dan pemetaan eksplisit diabaikan diam-diam (**T8**, AU-S30-03/04);
- hal yang sama berlaku untuk `08_ANGGARAN` dan `11_MUTASI_BANK` (AU-S30-05). Ini celah GAP-002 (P0) pada jalur baca generik.
- Catatan pemeriksaan:
  - `SG_REQUIRED_` untuk 08/09/30 terpenuhi oleh header FINAL, jadi pemeriksaan kolom wajib di `opReadSheet` **tidak** akan memblokir FINAL untuk sheet tersebut;
  - `10_BUKTI`, `11_MUTASI_BANK`, `17_LAPORAN`, dan `19_LPJ` belum punya daftar kolom wajib, jadi daftar itu harus diputuskan lebih dulu.

**Langkah setup** (hanya di **salinan** uji; tidak di produksi):

| # | Langkah | Kriteria lulus |
|---|---|---|
| 0 | Prasyarat: deploy commit uji ke proyek Apps Script uji; ID spreadsheet ≠ produksi `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`; salinan cadangan dibuat; **T8 diperbaiki atau diterima sebagai risiko tertulis** | Bukti ID + hash commit |
| 1 | `opSchemaReport` sebelum setup | `30_ALOKASI_PENGELUARAN = MISSING_SHEET` (diharapkan) |
| 2 | Uji kering `opAlokasiPengeluaranPlan()` (read-only; sheet operasional belum ada) | Laporan kelas/alasan/distribusi tingkat/resolusi FK; `30_REF` tidak berubah (bandingkan isi) |
| 3 | Pemeriksaan & persetujuan hasil uji kering oleh pengguna | Persetujuan tertulis |
| 4 | `opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN')` oleh BENDAHARA | Sheet + 13 header persis; audit `SCHEMA_CREATE_SHEET`; pemanggilan ulang `unchanged` |
| 5 | `opSchemaReport` | `30_ALOKASI_PENGELUARAN = MATCH` |
| 6 | Uji kering ulang (planHash baru) | Hasil sama dengan langkah 2 |
| 7 | `opAlokasiPengeluaranImport({planHash, confirm:'IMPOR_ALOKASI_PENGELUARAN'})` | `diimpor` = jumlah VALID; audit `RECORD_CREATE:alokasiPengeluaran` per baris + `IMPOR_ALOKASI_PENGELUARAN` pada append yang sama; impor ulang = 0 |
| 8 | Pemeriksaan integrasi | `opReadSheet` 30 = jumlah baris; KPI + FCC + Kartu Beranda sebelum/sesudah (diferensial BDS03-I03/I04/I05; indikator lain identik); FCC klien = server; waktu eksekusi dicatat |

Sheet tidak pernah dibuat saat startup (RAB-16). Membuat sheet dengan tangan **tidak** disarankan, karena salah ketik header langsung memicu T8.

## 6. Keputusan yang benar-benar masih dibutuhkan

> **Pembaruan 19-10-2026:** D-T4, D-T8, D-T1s, dan sebagian D-T7 (pemblokiran BENDAHARA atas peran penyetuju) diimplementasikan; lihat `P1_14`. Yang tersisa ada di `P1_14` §8.

| ID | Keputusan | Menghambat |
|---|---|---|
| **D-T1** | Model uang muka/pencairan: D1, D2 (butuh GAP-028), atau D3; cara mencatat pengembalian sisa | Perbaikan T1; TC-LB-06/10/13 |
| D-T1s | Pengaman sementara tombol "Buat Transaksi dari LPJ" (peringatan/nonaktif + aksi "Tautkan") | Menutup risiko M1 sebelum D-T1 |
| **D-T4** | Validasi tanggal kalender ketat di semua jalur; rentang tahun; perlakuan sufiks waktu; validasi hanya saat field diubah (usulan) | Perbaikan T4; TC-CRUD-08 |
| **D-T8** | `opReadSheet` memeriksa kolom wajib (gagal tertutup → "DATA TIDAK TERSEDIA"); daftar kolom wajib untuk 10/11/17/19 | Perbaikan GAP-002 jalur baca; prasyarat setup sheet 30 di live |
| D-LB-2 (U-1) | Alokasi lintas periode: ketat / jendela N hari / pengecualian tercatat | Kasus 2 |
| D-LB-3 (U-5) | Tanggal & penyetuju persetujuan RAB; berlaku surut atau tidak | Kasus 3 |
| D-LPJ (U-2) | Status LPJ (diajukan/diterima/diverifikasi/ditolak), arti `19_LPJ.tanggal`, pemeriksa | Kasus 1/4, TC-LB-08 |
| **K-RAB-07a–f** | Opsi C+B, peran & batas kewenangan, persetujuan susulan, bukti, nominal, status komitmen | BDS03-I05 bagian persetujuan |
| **D-T7** | Pemindahan pengelolaan `26_USER_ACCESS` dari BENDAHARA (atau persetujuan dua pihak) | Prasyarat K-RAB-07 dan setiap kontrol berbasis peran |
| GAP-005 | `executeAs`/akses web app | Keandalan identitas live (semua kontrol peran) |

## 7. Hasil tes dan status integrasi

**Lokal (sandbox Node)**, `run_all_tests.js p1audit`, log `_test_logs/p1audit_*.log`:

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
| audit_p1_tests (baru) | 8 | 0 | 23 |
| **Total** | **408** | **0** | **26** |

- Tidak ada tes lama yang dihapus atau diubah.
- `audit_p1_tests` saat pertama dijalankan menghasilkan 2 FAIL:
  - **AU-S30-01:** kesalahan helper tes (`OK` vs `SUCCESS`); diperbaiki.
  - **AU-S30-03:** ekspektasi "KPI gagal tertutup bila header sheet 30 salah" ternyata **tidak** terpenuhi. Kasus ini dicatat sebagai temuan T8 (INFO), tidak dipaksa lulus.

**Integrasi live (Apps Script + Google Sheets): TIDAK DIJALANKAN.** Tidak ada hasil live yang diklaim.

## 8. Pemetaan temuan → GAP → test case

| Temuan | GAP | Test case (07) | Tes sandbox |
|---|---|---|---|
| T1 pengeluaran ganda via LPJ | GAP-020, GAP-018 | TC-LB-06, TC-LB-13 (baru) | AU-T1-01..06 |
| T1 pengembalian sisa sebagai penerimaan | GAP-020, GAP-028 | TC-LB-10 | AU-T1-02/05 |
| T4 tanggal kalender | GAP-014 | TC-CRUD-08 (baru), TC-LB-07 | AU-T4-* , RAB-35 |
| T5 alokasi lintas periode di I04 | GAP-018 | TC-LB-04 | RAB-33 |
| T6 / kasus 3 persetujuan surut | GAP-018 | TC-LB-09, TC-LB-11 (baru) | AU-LB-01 |
| LPJ setelah tutup buku | GAP-015, GAP-020 | TC-LB-12 (baru) | AU-LB-02 |
| T7 bendahara mengelola peran | **usulan GAP-048** (tidak ada di daftar 05) | TC-AUTH-09 (baru) | AU-K7-02 |
| T8 `opReadSheet` tanpa kolom wajib | GAP-002 | TC-HDR-07 (baru) | AU-S30-03/04/05 |
| Setup sheet 30 | GAP-018, GAP-016 | TC-REL-07 (baru) | AU-S30-01/02, RAB-16..22 |

## 9. Urutan implementasi berikutnya (rekomendasi)

1. **T8 (GAP-002, P0):** pemeriksaan kolom wajib di `opReadSheet`, dengan daftar kolom wajib yang diputuskan. Risiko rendah; menutup jalur KPI yang dihitung dari data rusak. Prasyarat uji live sheet 30.
2. **T4:** `sgValidDate_` + `sgValidPeriodLabel_` di semua jalur tulis (validasi saat field diubah), plus audit read-only data lama.
3. **D-T1s:** pengaman tombol "Buat Transaksi dari LPJ" + aksi "Tautkan LPJ".
4. **Uji integrasi live** sesuai `P1_07`, termasuk setup sheet 30 (§5) di salinan.
5. **T7 + GAP-005**, lalu **K-RAB-07** (bila disetujui).
6. **D-T1 / D-LPJ / U-1 / U-5:** perubahan skema aditif per keputusan, masing-masing commit terpisah dengan uji diferensial.

Setiap langkah butuh persetujuan tertulis; tidak ada yang diimplementasikan di commit audit ini.
