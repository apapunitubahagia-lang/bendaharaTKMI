# P1_16 — Audit & Desain Input Massal, Model Uang Muka B vs C, Rencana Validasi Tanggal

**Tanggal:** 19 Oktober 2026
**Dasar:** `4872a6e`. HEAD lokal = remote, working tree bersih saat diperiksa.
**Tahap: AUDIT DAN DESAIN.** Kode aplikasi tidak diubah. Yang ditambahkan hanya suite karakterisasi `_build_tests/import_audit_tests.js` (12 kasus, mengamati perilaku sekarang) dan dokumen ini.
**Status proyek:** `READY_FOR_INTEGRATION_TEST`. Integrasi live belum dijalankan.

---

## 1. Audit fungsi dan struktur yang sudah ada

### 1.1 Peta fungsi impor (klien `Bendahara_V2.html`)

| Komponen | Fungsi | Perilaku sekarang |
|---|---|---|
| Wizard bersama | `openImportWizard`, `importWizardHtml`, `IMPORT_PROFILES` | Langkah unggah → peta header → pratinjau → konfirmasi. Profil: `siswa`, `penerimaan`, `mutasibank`, `pengeluaran`, `rkat`, `rab`, `lpj` |
| Pembacaan berkas | `importWizardReadFile`, `buildImportSessionFromRawFiles`, `reparseWithDelimiter` | **CSV/TSV saja** (`FileReader.readAsText`). XLSX tidak dibaca; pengguna diminta *Save As CSV*. Deteksi delimiter `, ; tab \|` dan berkas tanpa header |
| Pemetaan kolom | Mesin alias header (`IMPORT_FIELD_LABELS`, alias ±baris 6533), `fieldGetterFor`, `extraColumnsFor` | Header dikenali otomatis, dapat diubah manual. Kolom tak dipetakan disimpan sebagai `_extra` |
| Validasi per modul | `validatePenerimaanRow`, `validatePengeluaranRow`, `validateRabRow`, `validateLpjRow`, `classifySiswaBatch` (+ `validateRkatRow`, `validateMutasiBankRow`) | Klien saja. Status `VALID / INVALID / DUPLICATE / AMBIGUOUS / HOLD` (siswa: `BARU / SUDAH_ADA / DUPLIKAT / PERLU_KONFIRMASI / ERROR`) |
| Duplikasi | `findDuplicateTransaksi` (sidik jari tanggal + nominal + ftNumber/pengirim/uraian), `findDuplicateRab`, `findDuplicateLpj`, `matchSiswaByFields` | Dibandingkan dengan data yang **sudah ada**, bukan antar-baris dalam berkas yang sama (IA-06) |
| Penyimpanan | `importWizardConfirm` → `commit*Row` per baris | Transaksi lewat `postTransaksi` (antrean lokal → `opCreateTxBatch`, 20/RPC). RAB/LPJ/RKAT lewat `Store.save*` (antrean koleksi → `opRecordBatch`). Siswa lewat `centralMasterQueue_` → `opMasterBatch` |
| Antrean DUPLIKAT/HOLD | `Store.loadImportQueue` | **Hanya localStorage** perangkat ini (IA-09) |
| Laporan hasil | `buildReconciliationSummary`, `renderReconciliationSummaryHtml` | Ringkasan klien saat konfirmasi; penolakan server muncul **belakangan** sebagai "gagal sinkron" |
| Templat | — | Tidak ada templat unduhan (kecuali `useStandardSiswaTemplate`, pemetaan siswa standar) |
| Ekspor | `downloadXLSX` / `buildXlsxWorkbook` (penulis XLSX sendiri, tanpa pustaka luar) | Ada penulis XLSX; **belum ada pembaca XLSX** |

### 1.2 Jalur server, otorisasi, audit, KPI

| Modul | Sheet | Jalur tulis server | Otorisasi | Validasi server | Audit | Idempotensi |
|---|---|---|---|---|---|---|
| Pemasukan | `05_TRANSAKSI`, `06_ALOKASI` | `opCreateIncome` / `opCreateTxBatch` (≤ 25) → `createIncome_` | `opGate_` BENDAHARA | `validateTransactionPayload_` (T4 kalender), akun/siswa ada, AllocationGuard (kewajiban ada, Σ ≤ sisa) | `engineAuditBatch_` (satu append) + aktor | `clientRequestId` → `24_IDEMPOTENCY_LOG` |
| Pengeluaran | `05_TRANSAKSI` | `opCreateExpense` / `opCreateTxBatch` | idem | idem (kategori **tidak** divalidasi terhadap master) | idem | idem |
| RAB | `08_ANGGARAN` | `opRecordBatch('anggaran')` (≤ 200) | idem | RecordGuard: periode (T4), kolom harus ada (`UNKNOWN_FIELD`) | `RECORD_*` per baris | id record (upsert) |
| LPJ | `19_LPJ` | `opRecordBatch('lpj')` | idem | RecordGuard: tanggal (T4); `transaksiId` → PENGELUARAN aktif, Σ LPJ ≤ nominal | idem | id record |
| Siswa | `01_SISWA` | `opMasterBatch('siswa')` (≤ 100) / `opMasterUpsert` | idem | `OP_MASTER_.siswa`: wajib nama/unit, enum unit/status, `dupKey` (NISN atau nama\|kelas\|unit) | `MASTER_*` | dupKey |

- **KPI** dihitung ulang di klien dari cache (`invalidateAktFeedCache` setelah impor).
- Gerbang P0-D/T8 membuat KPI "DATA TIDAK TERSEDIA" bila sumber belum termuat atau gagal. Tidak ada jalur "pembaruan KPI" di server; snapshot `14_KPI` dibuat terpisah.

### 1.3 Temuan (dibuktikan di sandbox, `import_audit_tests.js`)

| ID | Temuan | Tes |
|---|---|---|
| **F1** | **Impor RAB gagal di server sejak P0-T4 (`c76db65`)**. Wizard mengisi `periode` dengan tahun ajaran mentah (`2026/2027`), yang ditolak RecordGuard. Sebelum T4, nilai itu tersimpan tetapi tidak pernah dihitung FCC/KPI (label tidak dikenali). Kegagalannya kini terlihat, tetapi pratinjau tetap menyatakan "valid" | IA-01 |
| F2 | Impor RAB/LPJ menulis kolom yang tidak ada di header FINAL (`keterangan`, `sourceSheet`, `importDate`, `importUser`, `hargaSatuan`), sehingga ditolak `UNKNOWN_FIELD` sampai migrasi aditif (GAP-016) | IA-02 |
| F3 | Default diam-diam: pengeluaran tanpa akun/kategori tersimpan dengan akun pertama dan kategori pertama ("Gaji/Honor"); pemasukan dengan nama akun tak dikenal jatuh ke akun pertama | IA-03, IA-04 |
| F4 | Dua baris identik dalam satu berkas sama-sama tersimpan (sidik jari hanya terhadap data lama) | IA-06 |
| F5 | Validasi klien ≠ server: pratinjau LPJ menyatakan `2026-02-30` valid, server menolak **setelah** konfirmasi | IA-08 |
| F6 | Antrean DUPLIKAT/HOLD hanya di localStorage | IA-09 |
| F7 | Siswa: `tanggalMasuk` dan `jenisKelamin` dari berkas **dibuang diam-diam** (`MASTER_WRITE_FIELDS.siswa` klien tidak memuatnya), padahal `tanggalMasuk` menentukan periode kewajiban | IA-11, RD-10 |
| F8 | `periodeAktif` FINAL berformat tanggal `2026-10-01` (GAP-008). KPI dihitung untuk "periode" yang tidak cocok dengan label apa pun, sehingga overall **0** (bukan "DATA TIDAK TERSEDIA") | IA-12 |
| F9 | Satu berkas besar = banyak RPC berurutan (500 baris → 25 `opCreateTxBatch`); waktu nyata Apps Script belum diukur | IA-10 |
| F10 | Penolakan server tidak masuk laporan impor; muncul terpisah sebagai "gagal sinkron" | IA-01, IA-08 |
| F11 | Impor ulang berkas yang sama ditandai DUPLIKAT oleh klien (kontrol berlaku), tetapi `clientRequestId` acak per percobaan (`ui_<uid>`), sehingga idempotensi server tidak berlaku lintas percobaan impor | IA-05 |
| F12 | LPJ impor tidak membuat transaksi (kontrol berlaku); tetapi tanpa unit dan tanpa tautan/kandidat transaksi | IA-07 |

## 2. Rancangan arsitektur input massal (bersama untuk 5 modul)

```
[Sumber]                     [Klien: normalisasi]          [Server: otoritas]                       [Hasil]
 Isi tabel langsung ─┐
 Tempel dari Excel  ─┼─> tabel {header, baris} ─> peta kolom ─> opImportPlan(modul, baris, peta) ──> pratinjau per baris
 Unggah CSV         ─┤    (parser bersama)        (profil        (validasi PENUH server, duplikat,       VALID / PERINGATAN /
 Unggah XLSX        ─┘                             tersimpan)     kandidat; tidak menulis; planHash)      TOLAK / DUPLIKAT / PERLU_KEPUTUSAN
                                                                          │ konfirmasi pengguna
                                                    opImportCommit({modul, batchId, planHash, baris terpilih, konfirmasi})
                                                     → per potongan (transaksi 20 / record 200 / siswa 100) → jalur tulis YANG ADA
                                                     → hasil per baris + ringkasan audit → laporan + unduh baris gagal
```

| Lapisan | Rancangan | Catatan |
|---|---|---|
| **Sumber** | (1) **Isi tabel langsung**: grid kolom templat di modal wizard (gaya Web V2 yang ada); (2) **tempel dari Excel**: area tempel; clipboard Excel berupa TSV sehingga dapat memakai parser TSV yang ada; (3) **CSV**: parser yang ada; (4) **XLSX**: lihat baris di bawah | UI tetap Web V2; hanya langkah baru di wizard yang sama |
| **Pembaca XLSX** | Opsi (a) klien: unzip dengan `DecompressionStream('deflate-raw')` + parse `sharedStrings.xml`/`sheet1.xml` (tanpa pustaka luar, sejalan dengan penulis XLSX yang ada); (b) server: `Utilities.unzip` + `XmlService`; (c) konversi Drive (butuh layanan lanjutan). **Usulan: (a), dengan fallback (b)**. Perlu uji di iframe HtmlService | Keputusan D-IMP-1 |
| **Pemetaan kolom** | Mesin alias yang ada + **profil pemetaan tersimpan** per modul (di `15_SETTINGS` lewat jalur settings yang ada) | Kolom tak dipetakan tetap `_extra` |
| **Validasi** | Satu sumber aturan `_import_rules.js`, disuntikkan ke klien dan server (pola `_rab_match.js`). Klien = UX; **server = otoritas** (`opImportPlan` menjalankan aturan yang sama + pemeriksaan data server) | Menutup F5 |
| **Pratinjau** | Hasil `opImportPlan` per baris: kelas, alasan, nilai yang dinormalisasi (mis. tanggal `05/09/2026` → `2026-09-05` **ditampilkan**, bukan diam-diam), kandidat (siswa, transaksi LPJ) | — |
| **Duplikasi** | (i) terhadap data server (sidik jari per modul, §3); (ii) **di dalam berkas** (F4); (iii) terhadap impor sebelumnya lewat kunci baris (§5) | — |
| **Konfirmasi** | Pengguna memilih baris yang diimpor (default: VALID saja), mengisi **pilihan wajib eksplisit** untuk baris yang butuh keputusan (akun, kategori, siswa ambigu), lalu mengetik/klik konfirmasi | Menutup F3 |
| **Penyimpanan** | `opImportCommit` memanggil **jalur tulis yang sudah ada** (`createIncome_`/`createExpense_` lewat pola `opEngineWrite_`, `opRecordBatchLocked_`, master batch). Tidak ada jalur tulis baru yang melewati RecordGuard/T4/AllocationGuard/audit | — |
| **Laporan** | Ringkasan per kelas + daftar per baris (tersimpan / gagal + kode + pesan server); **unduh baris gagal** sebagai XLSX/CSV (templat yang sama + kolom `alasan`) memakai `buildXlsxWorkbook` | Menutup F10 |
| **Antrean tinjauan** | Baris DUPLIKAT / PERLU_KEPUTUSAN disimpan di **server** (lihat D-IMP-3), bukan localStorage | Menutup F6 |
| **KPI** | Setelah commit: muat ulang sheet terdampak (`loadOperationalData`) + `invalidateAktFeedCache`. Selama memuat, gerbang T8 menampilkan "DATA TIDAK TERSEDIA" | Formula/bobot/target tidak berubah |
| **Otorisasi** | `opImportPlan` dan `opImportCommit`: BENDAHARA saja (rencana memuat data). Aktor dari sesi | — |

## 3. Matriks validasi per modul

**Legenda:**
- **W** = wajib, **O** = opsional.
- **S** = ditegakkan server (otoritas); K = klien (UX).
- Kode = kode hasil server.
- Aturan bertanda *(keputusan)* belum ditetapkan.

### 3.1 Pemasukan (`05_TRANSAKSI` PENERIMAAN + `06_ALOKASI`)

| Kolom | W/O | Aturan | Lapisan | Gagal → |
|---|---|---|---|---|
| tanggal | W | `sgDateError_` (YYYY-MM-DD kalender; DD/MM/YYYY dinormalisasi **terlihat** di pratinjau) | S | TOLAK `VALIDATION_ERROR` |
| unit | W | TK/MI. Dugaan dari nama sheet hanya sebagai **usulan** di pratinjau | S | TOLAK |
| nominal | W | > 0; bila ada kolom tunai + transfer: jumlahnya = nominal (selisih > 1 → PERLU_KEPUTUSAN) | S | TOLAK / PERLU_KEPUTUSAN |
| akun | W | Harus cocok dengan akun Kas/Bank master; **tanpa default** | S | PERLU_KEPUTUSAN (pilih akun) |
| metode | W | Daftar metode yang ada | S | TOLAK |
| sumber/kategori penerimaan | W | Master `20_KATEGORI_PENERIMAAN` atau "Pembayaran Siswa" | S | PERLU_KEPUTUSAN |
| siswa (NIS/NISN/nama + kelas + unit) | O | NISN/NIS persis; selain itu nama + kelas + unit; >1 kandidat → PERLU_KEPUTUSAN (pilih siswa); tidak cocok → "belum teridentifikasi" (diizinkan) | S | PERLU_KEPUTUSAN |
| kolom komponen / komponen | O | Alokasi lewat AllocationGuard (kewajiban harus ada; Σ ≤ sisa kewajiban; Σ ≤ nominal) | S | Baris tersimpan tanpa alokasi + PERINGATAN, **atau** ditolak *(keputusan D-IMP-4)* |
| ftNumber, namaPengirim, uraian | O | Teks ≤ batas sel | S | — |
| Duplikat | — | Sidik jari tanggal + nominal + (ftNumber \| namaPengirim \| uraian) terhadap server **dan** dalam berkas; MI/TK bernomor FT sama → tinjau (GAP-036, 12_DUP_REVIEW) | S | DUPLIKAT |
| Jenis TRANSFER | — | Ditolak (GAP-028) | S | TOLAK |

### 3.2 Pengeluaran (`05_TRANSAKSI` PENGELUARAN)

| Kolom | W/O | Aturan | Lapisan | Gagal → |
|---|---|---|---|---|
| tanggal | W | `sgDateError_` | S | TOLAK |
| unit | W | TK/MI | S | TOLAK |
| nominal | W | > 0; bila qty × harga − diskon ada, harus = total (selisih > 1 → PERLU_KEPUTUSAN) | S | TOLAK / PERLU_KEPUTUSAN |
| akun | W | Akun Kas/Bank master, **tanpa default** | S | PERLU_KEPUTUSAN |
| kategori | W | Master `21_KATEGORI_PENGELUARAN` aktif, **tanpa default** (F3) | S | PERLU_KEPUTUSAN |
| subkategori | O | Harus milik kategori (`22_SUBKATEGORI`) | S | TOLAK |
| penerima | W | Tidak kosong. (Aturan KPI BDS03-I02 ≥ 3 karakter hanya **PERINGATAN**, bukan penolakan) | S | TOLAK / PERINGATAN |
| metode | W | Daftar metode | S | TOLAK |
| RAB (anggaranId, nominal alokasi) | O | Hanya bila sheet `30_ALOKASI_PENGELUARAN` ada; aturan K-RAB-01..03 (ITEM, Σ ≤ nominal, RAB aktif). Periode lintas bulan → PERLU_KEPUTUSAN (U-1 belum diputuskan) | S | PERLU_KEPUTUSAN |
| Uang muka / panjar | — | **Tidak ada kolom**; model belum diputuskan (D-T1) | — | — |
| Duplikat | — | Sidik jari tanggal + nominal + (penerima \| uraian) server + dalam berkas | S | DUPLIKAT |

### 3.3 RAB (`08_ANGGARAN`)

| Kolom | W/O | Aturan | Lapisan | Gagal → |
|---|---|---|---|---|
| periode | W | `sgPeriodLabelError_(·, true)`: "Oktober 2026", "Tahun Ajaran 2026/2027", "SekaliBayar". Tahun ajaran mentah **tidak** diubah diam-diam (F1); pratinjau menawarkan "Tahun Ajaran 2026/2027" untuk dikonfirmasi | S | TOLAK / PERLU_KEPUTUSAN |
| jenis | O (default PENGELUARAN) | PENGELUARAN / PEMASUKAN; PEMASUKAN wajib `komponenId` valid | S | TOLAK |
| unit | W | TK/MI | S | TOLAK |
| kategori / subkategori | W / O | Master kategori pengeluaran; subkategori milik kategori | S | TOLAK |
| program/uraian | W | Tidak kosong | S | TOLAK |
| nominal; volume, satuan, hargaSatuan | W; O | > 0; volume × harga = total (selisih > 1 → PERLU_KEPUTUSAN) | S | TOLAK / PERLU_KEPUTUSAN |
| status | O | Impor menulis **DIAJUKAN**. Status DISETUJUI dari berkas = klaim persetujuan tanpa penyetuju, sehingga *(keputusan D-IMP-5)*; usulan: diimpor sebagai DIAJUKAN + catatan "status sumber: DISETUJUI" | S | — |
| Kolom metadata (sumber, batch) | — | Hanya ditulis bila kolom ada di sheet; tidak menyebabkan `UNKNOWN_FIELD` (F2) | S | — |
| Duplikat | — | Kunci garis (kategori \| subkategori \| unit \| periode) + uraian + nominal, server + dalam berkas | S | DUPLIKAT |

### 3.4 LPJ (`19_LPJ`)

| Kolom | W/O | Aturan | Lapisan | Gagal → |
|---|---|---|---|---|
| tanggal (nota) | W | `sgDateError_`. Arti kolom ini = **tanggal nota** *(keputusan D-LPJ; P1_12 U-2)*; tanggal penyerahan/verifikasi **tidak** diisi dari kolom ini | S | TOLAK |
| item/uraian | W | Tidak kosong | S | TOLAK |
| nominal; volume, satuan, hargaSatuan, diskon | W; O | > 0; konsistensi qty × harga − diskon; `satuan` = teks (GAP-020: kolom tertukar di FINAL ditandai PERINGATAN) | S | TOLAK / PERINGATAN |
| unit | W *(usulan)* | TK/MI (kolom ada di FINAL; wizard lama tidak menangkapnya) | S | PERLU_KEPUTUSAN |
| kategori / subkategori | O | Master | S | PERINGATAN |
| transaksiId | O | **(A) Merujuk transaksi yang ada:** PENGELUARAN aktif; Σ LPJ aktif ≤ nominal transaksi (RecordGuard); unit/kategori berbeda → PERLU_KEPUTUSAN. **(B) Kosong:** status "PERLU TRANSAKSI / PERLU TAUTAN". **Tidak ada transaksi dibuat saat impor** | S | TOLAK / PERLU_KEPUTUSAN |
| lpjDokId | O | Merujuk dokumen LPJ bila sheet operasionalnya ada (D-LPJ) | S | PERINGATAN |
| Duplikat | — | Sidik jari tanggal + kategori + item + nominal (yang ada) + dalam berkas | S | DUPLIKAT |

**Kandidat transaksi untuk LPJ tanpa transaksiId** (hanya **saran** di pratinjau; tidak pernah ditautkan otomatis):
- skor gabungan dari beberapa sinyal: unit sama, kategori sama, kapasitas sisa belum ber-LPJ ≥ nominal, kedekatan tanggal, penerima/uraian mirip, `lpjDokId`/nomor bukti;
- jendela tanggal hanya **salah satu** sinyal; aturan 62 hari P0-T1 bukan dasar tunggal;
- pengguna memilih tautan atau "butuh transaksi baru";
- tautan disimpan lewat `opLinkLpj` (P1_15 §5);
- pembuatan transaksi baru lewat `opCreateExpenseFromLpj` (atomik, idempoten per lpjId), **di luar** impor dan dengan konfirmasi per baris.

### 3.5 Nama Siswa (`01_SISWA`)

| Kolom | W/O | Aturan | Lapisan | Gagal → |
|---|---|---|---|---|
| nama | W | Tidak kosong | S | TOLAK |
| unit | W | TK/MI | S | TOLAK |
| kelas | W | Tidak kosong. Format per unit *(keputusan; tidak dikarang)* | S | TOLAK |
| nis / nisn | O | Teks. Format 10 digit NISN hanya **PERINGATAN** bila tidak cocok *(keputusan)* | S | PERINGATAN |
| tahunAjaran | O (default aktif) | `YYYY/YYYY+1` | S | TOLAK |
| tanggalMasuk / tanggalKeluar | O | `sgDateError_`; `tanggalKeluar ≥ tanggalMasuk`; **harus benar-benar tersimpan** (F7) | S | TOLAK |
| jenisKelamin | O | Nilai yang ada di data *(keputusan enum)*; **harus tersimpan** (F7) | S | PERINGATAN |
| wali, kontak, alamat | O | Teks | S | — |
| Duplikat / pencocokan | — | NISN dalam berkas (DUPLIKAT); NISN persis = SUDAH_ADA; nama + kelas + unit mirip = PERLU_KEPUTUSAN; mode pembaruan eksplisit (field kosong tidak menimpa) | S | — |

## 4. Rancangan templat XLSX/CSV

| Hal | Rancangan |
|---|---|
| Format | XLSX (dibuat `buildXlsxWorkbook`) dan CSV UTF-8 (delimiter koma, header baris 1) |
| Isi | Baris 1: **kunci kanonik** (mis. `tanggal`, `unit`, `nominal`, `akun`, `kategori`), sehingga pemetaan otomatis 100%. Baris 2: contoh terisi bertanda `CONTOH` (dilewati saat impor). Lembar/berkas "Petunjuk": W/O, format, daftar nilai sah (unit, metode, kategori, akun **dari master server saat diunduh**) |
| Tanggal | `YYYY-MM-DD`. DD/MM/YYYY diterima tetapi ditampilkan hasil normalisasinya |
| Angka | Tanpa pemisah ribuan disarankan; `1.000.000` / `1,000,000` dikenali `numFromStr`; hasil normalisasi ditampilkan |
| Kolom per modul | **Pemasukan:** tanggal, unit, nominal, akun, metode, sumber, nis, nisn, namaSiswa, kelas, komponen, ftNumber, namaPengirim, uraian. **Pengeluaran:** tanggal, unit, nominal, akun, metode, kategori, subkategori, penerima, uraian, qty, hargaSatuan, diskon. **RAB:** periode, jenis, unit, kategori, subkategori, program, nominal, volume, satuan, hargaSatuan, komponenId. **LPJ:** tanggal, unit, kategori, subkategori, item, volume, satuan, hargaSatuan, diskon, nominal, transaksiId, lpjDokId. **Siswa:** nama, unit, kelas, nis, nisn, tahunAjaran, tanggalMasuk, tanggalKeluar, jenisKelamin, namaWali, kontakWali, alamat |
| Unduh baris gagal | Templat yang sama + kolom `alasan` dan `kode` dari server; dapat diperbaiki lalu diimpor ulang |

## 5. Strategi idempotensi dan impor parsial

| Mekanisme | Rancangan |
|---|---|
| **Kunci baris** | `kunci = hash(modul + nilai bisnis ternormalisasi) + '#' + kemunculan-ke-n dalam berkas`. Dipakai sebagai `clientRequestId` transaksi (`imp_<modul>_<kunci>` → `24_IDEMPOTENCY_LOG`) dan id record (`imp_<kunci>`) |
| **Impor ulang berkas yang sama** | Baris yang sudah tersimpan → `UNCHANGED`/hasil idempoten, tidak tersimpan ganda (menggantikan sidik jari klien saja, F11) |
| **Baris identik sah** (dua pembelian sama di hari yang sama) | Dalam satu berkas dibedakan oleh `#n`. Dari berkas lain dengan isi sama → DUPLIKAT untuk ditinjau, **bukan** diloncati diam-diam |
| **planHash** | `opImportPlan` menghitung hash (baris ternormalisasi + peta + versi data relevan). `opImportCommit` menghitung ulang di dalam lock; berbeda → `CONFLICT` (data berubah sejak pratinjau; pola `opAlokasiPengeluaranImport`) |
| **Potongan** | Transaksi 20 per RPC (`opCreateTxBatch` ≤ 25), record 200, siswa 100. Setiap baris atomik sendiri (transaksi + alokasinya dalam satu operasi engine); potongan tidak "semua-atau-tidak" |
| **Kegagalan parsial** | Hasil per baris (`TERSIMPAN / TIDAK_BERUBAH / GAGAL + kode`). Bila koneksi putus di tengah, `opImportCommit` dengan `batchId` yang sama melanjutkan: baris tersimpan = `UNCHANGED` (kunci baris), sisanya diproses |
| **Jejak** | Audit `IMPORT_PLAN` / `IMPORT_COMMIT_CHUNK` / `IMPORT_DONE` (modul, batchId, jumlah per kelas, planHash, aktor) pada append yang sama dengan potongannya. Per baris tetap audit jalur tulis yang ada. Opsional: sheet aditif `31_IMPOR_LOG` untuk status per baris dan antrean tinjauan server *(keputusan D-IMP-3)* |
| **Batas Apps Script** | 6 menit per eksekusi, sehingga tiap RPC dibatasi potongan. Klien mengirim potongan berurutan dengan progres; dapat dilanjutkan |

## 6. Rancangan uji 10 / 50 / 100 / 500 baris

| Lapisan | Kasus (per ukuran 10/50/100/500) | Ukuran lulus |
|---|---|---|
| **Sandbox** (pada implementasi) | Semua valid; 10% tidak valid campur; 5% duplikat dalam berkas; 5% duplikat terhadap server; impor ulang berkas sama; putus koneksi di potongan ke-2 lalu lanjut; server menolak 1 baris per potongan; header rusak (T8); tanggal mustahil (T4); siswa ambigu; LPJ dengan/ tanpa transaksiId; RAB tahun ajaran mentah | Jumlah tersimpan = VALID terpilih; 0 ganda; laporan per baris = hasil server; baris gagal dapat diunduh; KPI/saldo setelah impor = penjumlahan manual; KPI di luar modul tidak berubah (regresi) |
| **Sandbox — dasar sekarang** (wizard lama, IA-10) | 10/50/100/500 pengeluaran valid | Tersimpan 10/50/100/500; RPC `opCreateTxBatch` 1/3/5/25 |
| **Live** (salinan uji, P1_15 §3) | Ukuran yang sama untuk tiap modul | **Waktu per potongan dan total**, kuota, kontensi lock (dua pengguna), tidak ada `Exceeded maximum execution time`; `ltPostflight` hanya berbeda pada baris uji; 544 TEREKONSILIASI identik |

Live **belum dijalankan**.

## 7. Analisis model uang muka B vs C (tidak dipilih)

**Skenario:**
- RAB Kegiatan September **DISETUJUI** Rp2.000.000; bank awal Rp10.000.000.
- 20-09: uang muka Rp2.000.000.
- 25-09: pemakaian (nota) Rp1.700.000.
- 05-10: LPJ diterima.
- 06-10: pengembalian Rp300.000.

| Dampak | **B. Akun uang muka (imprest)** | **C. Entitas uang muka + transaksi kas bertaut** |
|---|---|---|
| Saldo bank 30-09 / 31-10 | 8.000.000 / 8.300.000 | 8.000.000 / 8.300.000 |
| Saldo uang muka | Akun "Uang Muka": 2.000.000 (s.d. LPJ dicatat) → 300.000 (nota bertanggal 25-09 dicatat 05-10) → 0 (06-10) | Entitas: dicairkan 2.000.000; dipertanggungjawabkan 1.700.000 (05-10, setelah verifikasi); kembali 300.000 (06-10); sisa 0 |
| Pengeluaran aktual September | **Berubah setelah LPJ:** 0 saat laporan September dibuat (bila sebelum 05-10), lalu 1.700.000 setelah nota dicatat mundur | Dua ukuran terpisah: **kas keluar** 2.000.000 (20-09, tetap) dan **beban terealisasi** 1.700.000 (setelah LPJ) |
| Realisasi RAB September | 1.700.000 (setelah LPJ; sebelumnya 0) | 1.700.000 (setelah verifikasi); sebelumnya tampil "dicairkan, belum dipertanggungjawabkan 2.000.000" (bukan realisasi) |
| Uang muka belum dipertanggungjawabkan | = saldo akun uang muka (2.000.000 → 300.000 → 0) | = dicairkan − LPJ terverifikasi − kembali (2.000.000 → 300.000 → 0) dengan status per entitas (DICAIRKAN / LPJ_DITERIMA / DIVERIFIKASI / SELESAI) |
| Pengembalian | Transfer akun uang muka → bank (bukan penerimaan) | Penerimaan bertanda pengembalian uang muka, tertaut entitas; dikecualikan dari penerimaan operasional |
| Laporan lintas bulan | Laporan September yang sudah dikirim **berbeda** dengan ledger setelah nota dicatat mundur. BDS06-I03 (saldo laporan vs ledger) dan snapshot laporan mendeteksinya sebagai koreksi. Bila nota dicatat bertanggal Oktober, realisasi jatuh di Oktober (lintas bulan, U-1) | Kas September tidak berubah. Beban September berubah saat LPJ diverifikasi, terlihat sebagai baris "dipertanggungjawabkan Oktober atas uang muka September" |
| Dampak KPI | BDS03 memakai pengeluaran per nota (realisasi garis September naik saat LPJ dicatat); BDS04/saldo memasukkan akun uang muka (keputusan apakah termasuk kas sekolah); BDS06-I03 berpotensi turun bila laporan sudah dikirim; BDS05 bukti per nota | Perlu keputusan apakah BDS03-I03/I04 memakai beban terealisasi (LPJ) atau kas keluar. Definisi berubah = **perubahan KPI yang butuh persetujuan**. BDS06-I03 tidak terdampak koreksi mundur |
| Risiko pencatatan ganda | Rendah, asalkan nota hanya dicatat sebagai pengeluaran dari akun uang muka; transfer bukan pengeluaran | Rendah: LPJ bertaut entitas tidak dapat menjadi transaksi baru; Σ LPJ + kembali = dicairkan (invarian) |
| Perubahan skema | `07_AKUN.jenis = UANG_MUKA` (aditif); **transfer antar-akun (GAP-028) wajib** dahulu; aturan pencatatan mundur ke periode bertanda | Sheet `UANG_MUKA` (id, kegiatan, rabId, akunId, pelaksana, nominal, tanggalCair, status, tanggalLpjDiterima, tanggalVerifikasi, diverifikasiOleh, sisaDikembalikan, tanggalKembali); `05_TRANSAKSI.sifat`, `uangMukaId`; `19_LPJ.uangMukaId`; status LPJ (D-LPJ) |
| Prasyarat | GAP-028 tervalidasi; kebijakan akun uang muka dalam posisi kas | D-LPJ, peran verifikator ≠ BENDAHARA (D-T7, GAP-005), definisi ukuran FCC/BDS03 |
| Kompleksitas UI | Rendah–sedang (akun baru + transfer) | Sedang (layar uang muka + status) |

**Ringkasan pertimbangan** (bukan pilihan):
- B paling dekat dengan praktik kas kecil, tetapi bergantung pada GAP-028 dan menyebabkan angka September berubah mundur.
- C memisahkan kas dan beban secara eksplisit dan tidak mengubah kas mundur, tetapi butuh entitas baru, status LPJ, dan keputusan definisi KPI.

## 8. Rencana perbaikan validasi tanggal

**Tiga kelas yang dibedakan:**
- **Format/kalender** dapat ditegakkan sekarang.
- **Rentang yang dapat dibuktikan** hanya dari data yang ada.
- **Kebijakan** belum ditetapkan, sehingga cukup ditandai.

| Field | Format/kalender (dapat ditegakkan) | Rentang yang dapat dibuktikan | Kebijakan (belum; hanya penandaan) |
|---|---|---|---|
| `01_SISWA.tanggalMasuk` / `tanggalKeluar` | `sgDateError_`; opsional; `tanggalKeluar ≥ tanggalMasuk`; **perbaiki kolom yang dibuang (F7)** | Tidak ada bukti batas bawah (siswa lama dapat masuk bertahun-tahun lalu) | Rentang tahun masuk; ditandai bila > hari ini atau < batas yang disahkan |
| `23_TAHUN_AJARAN.label` | `YYYY/YYYY+1` | Label FINAL 2024/2025–2030/2031 (GAP-035) | Tahun ajaran baru di luar daftar → tandai |
| `12_DUP_REVIEW.decidedAt`, `14_KPI.computedAt`, `19_LPJ.importDate`, `18_RKAT.importDate`, `04_KEWAJIBAN.computedAt` | Cap waktu **diisi server** (bukan klien) saat dibuat/berubah; nilai klien diabaikan | — | — |
| Impor massal (semua modul) | `opImportPlan` memakai `sgDateError_`/`sgPeriodLabelError_` yang sama dengan server tulis; normalisasi DD/MM/YYYY **ditampilkan** | Tanggal transaksi/LPJ di luar tahun ajaran terdaftar → **PERINGATAN** (bukan tolak) | Penolakan di luar rentang menunggu persetujuan |
| `15_SETTINGS.periodeAktif` | Hanya label bulan (P0-T4 saat simpan) | — | Normalisasi nilai FINAL `2026-10-01` → `Oktober 2026` **sekali, eksplisit, beraudit, dengan persetujuan** (bukan otomatis saat start). Sampai itu: baca `periodeAktif` yang bukan label = **"DATA TIDAK TERSEDIA (periode aktif tidak valid)"** untuk KPI dan laporan, bukan skor 0 (F8) |
| Data historis tidak sah | — | Uji kering read-only di salinan: hitung per field (format salah, kalender mustahil, di luar rentang terbukti) | Koreksi manual per baris oleh pengguna, tidak otomatis |

**Urutan usulan:**
1. F8, gerbang `periodeAktif` (gagal tertutup).
2. F7, kolom siswa yang dibuang, + validasi tanggal siswa.
3. Cap waktu server.
4. Label tahun ajaran.
5. Uji kering data historis.
6. Rentang setelah data dilihat.

## 9. Risiko dan keputusan yang masih membutuhkan persetujuan

| ID | Keputusan | Catatan |
|---|---|---|
| **D-IMP-1** | Pembaca XLSX: klien (`DecompressionStream`) vs server (`Utilities.unzip`) | Perlu uji di iframe HtmlService |
| D-IMP-2 | Persetujuan implementasi `opImportPlan`/`opImportCommit` + `_import_rules.js` bersama | Mengganti commit per baris di klien |
| D-IMP-3 | Antrean tinjauan & log impor di server: sheet aditif `31_IMPOR_LOG` vs audit saja | Menutup F6 |
| D-IMP-4 | Pemasukan dengan alokasi komponen gagal: simpan tanpa alokasi + peringatan, atau tolak baris | — |
| D-IMP-5 | Status RAB dari berkas (DISETUJUI) saat impor | Usulan: selalu DIAJUKAN + catatan |
| **D-IMP-6 (F1)** | Perbaikan impor RAB: periode wajib eksplisit (bulan atau "Tahun Ajaran …") | Sekarang **impor RAB tidak berfungsi** di server |
| D-IMP-7 (F2) | Migrasi aditif kolom RAB/LPJ di salinan uji, atau impor hanya menulis kolom yang ada | GAP-016 |
| D-IMP-8 | Enum jenis kelamin, format kelas & NISN (hanya penandaan sampai diputuskan) | Tidak dikarang |
| D-LPJ | Arti `19_LPJ.tanggal`, status LPJ, verifikator | Prasyarat LPJ massal lengkap |
| D-T1 | Model uang muka B vs C (atau A') | §7 |
| D-T4b | `periodeAktif` FINAL, rentang tahun, cap waktu server, validasi tanggal siswa | §8 |
| GAP-005 | Konfigurasi deploy & jenis akun | Prasyarat uji live identitas |
| (tetap) | U-1, U-5, K-RAB-07, GAP-028 | — |

**Risiko utama:**
1. F1: RAB tidak dapat diimpor sampai D-IMP-6.
2. F8: KPI 0 pada data FINAL (`periodeAktif` tanggal).
3. F7: kewajiban siswa salah karena tanggal masuk hilang.
4. Waktu eksekusi 500 baris di Apps Script belum diketahui.
5. Dua jalur impor (lama dan baru) bila migrasi bertahap: lama harus dinonaktifkan per modul saat yang baru aktif, agar tidak tercatat ganda.

## 10. Kesiapan pengujian (GAP-005 & harness)

Tidak ada perubahan sejak `P1_15` §2–3. Prasyarat P1–P7 tetap; utamanya:
- akun uji tanpa akses ke spreadsheet dan folder bukti produksi (folder dicari berdasarkan nama);
- skrip terikat pada salinan;
- Script Property konfirmasi.

Harness hanya melakukan pemeriksaan baca dan penolakan. **Tidak ada pengujian live yang dijalankan.**

## 11. Berkas yang direncanakan berubah (bila disetujui)

| Berkas | Perubahan |
|---|---|
| `_import_rules.js` (baru) | Aturan validasi per modul (sumber tunggal klien + server) |
| `ImportEngine.gs` (baru) | `opImportPlan`, `opImportCommit`, adapter per modul ke jalur tulis yang ada, planHash, kunci baris |
| `_build_tests/apply_import_client.js` (baru) | Wizard: sumber grid/tempel/XLSX, profil pemetaan, pratinjau dari server, konfirmasi pilihan wajib, laporan + unduh baris gagal, templat |
| `_build_tests/apply_import_server.js` (baru) | Menyuntikkan `_import_rules.js` ke server |
| `_build_tests/build_bridge.js`, `srv_env.js`, `build_all.js` | Registrasi fungsi dan langkah build |
| `RecordGuard.gs` | (D-T4b) validasi tanggal siswa, label tahun ajaran; cap waktu server |
| `OperationalAPI.gs` (`OP_MASTER_`) | Label tahun ajaran YYYY/YYYY+1; tanggal siswa |
| `apply_*` klien | `MASTER_WRITE_FIELDS.siswa` + tanggalMasuk/tanggalKeluar/jenisKelamin (F7); gerbang `periodeAktif` tidak valid (F8) |
| `CreateDatabaseStructure.gs` / skema aditif | Hanya bila D-IMP-3/D-IMP-7 disetujui (dibuat eksplisit, bukan saat startup) |
| `_build_tests/import_tests.js` (baru) | Uji §6 |
| Dokumen | P1_02, 07 (TC impor), P1_07 (uji live impor) |

## 12. Hasil tes (lokal, `run_all_tests.js p1imp`, log `_test_logs/p1imp_*.log`)

**Total 12 suite: 448 PASS, 0 FAIL, 41 INFO.** Sebelumnya 446/0/31; tambahannya `import_audit_tests` dengan 2 PASS dan 10 INFO.

- Tidak ada perubahan kode aplikasi.
- Tidak ada tes lama yang diubah.
- Tidak ada uji live yang dijalankan.
