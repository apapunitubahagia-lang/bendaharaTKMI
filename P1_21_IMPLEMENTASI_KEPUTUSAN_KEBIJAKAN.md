# P1_21 — Implementasi Keputusan Kebijakan Bendahara V2 (TK/MI Darul Arifin)

**Tanggal:** 19–20 Oktober 2026
**Status:**
- Perubahan kode (sandbox): **READY_FOR_REVIEW**
- Uji integrasi live: **BLOCKED**. Belum ada salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji, maupun folder bukti uji.

Semua hasil di bawah adalah **uji sandbox Node**, bukan uji integrasi Apps Script. Produksi (`1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`) tidak disentuh. Tidak ada deployment, migrasi, atau perubahan data FINAL. Konektor Google Drive/Sheets sesi tidak dipakai.

---

## 1. Repositori, branch, dan baseline

| Hal | Nilai |
|---|---|
| Repo / remote | `apapunitubahagia-lang/bendaharaTKMI` (`origin`) |
| Branch kerja | `claude/compassionate-dirac-drm760` |
| HEAD awal branch | `f4f9fd4` ("Add files via upload"), working tree bersih |
| Kondisi `claude/trusting-keller-84usce` | HEAD `6f3c6ba` (dokumen P1_20). `fef06cc` = dokumen P1_19, **6 commit di belakang** `6f3c6ba`, jadi bukan commit terakhir P1_20 |
| Apakah branch kerja memuat P1_20? | **Tidak**. Branch kerja adalah leluhur langsung trusting-keller: 0 commit unik, tertinggal 56 commit |
| Integrasi (disetujui pengguna) | `git merge --ff-only origin/claude/trusting-keller-84usce`. Fast-forward ke `6f3c6ba`, tidak ada commit yang hilang, trusting-keller tidak diubah |
| Baseline uji di `6f3c6ba` | 24 suite, **587 PASS / 0 FAIL / 50 INFO**, cocok dengan P1_20. `build_all.js` deterministik (build ulang tidak mengubah berkas terlacak) |
| HEAD akhir | commit dokumen ini, di atas `e816bac` |

## 2. Commit per pekerjaan (urutan prioritas)

| # | Commit | Pekerjaan | Jenis |
|---|---|---|---|
| 1 | `fe28b80` | **D-5**: migrasi transaksi dipisah dari sinkronisasi master & seed | implementasi klien |
| 2 | `4dbb774` | **D-3**: migrasi V1 tidak otomatis di mode pusat; pemetaan akun/unit/kategori eksplisit | implementasi klien |
| 3 | `9515720` | **D-1**: audit kewajiban beku vs tarif/batch/arsip/koreksi/konkurensi | uji karakterisasi saja |
| 4 | `ec53a8c` | **U-5**: `disetujuiPada`/`disetujuiOleh` diisi server; audit histori & dampak | implementasi server + kolom aditif |
| 5 | `a9529f8` | **D-4**: wizard impor lama penerimaan/pengeluaran/RAB/LPJ dinonaktifkan (fungsi + server) | implementasi + 2 ekspektasi uji diubah |
| 6 | `3fe85c5` | **D-2**: penerimaan multi-siswa; alokasi pada pengeluaran ditolak eksplisit | implementasi server kecil + uji |
| 7 | `4385a98` | **D-IMP-8**: audit master siswa terhadap standar | audit baca-saja |
| 8 | `e816bac` | **U-1**: audit alokasi lintas periode | audit baca-saja |
| 9 | (commit ini) | Dokumen P1_21 + log uji `p1_21` | dokumen |

### Berkas yang berubah

| Kategori | Berkas |
|---|---|
| Server (ditulis tangan) | `RecordEngine.gs` (U-5, D-4), `AdminAPI.gs` (kolom aditif U-5), `SiswaMasterAudit.gs` (D-IMP-8) |
| Server baru | `RabPersetujuan.gs` (U-5), `LintasPeriodeAudit.gs` (U-1) |
| Server hasil build | `TransactionEngine.gs` (D-2, lewat `apply_d2_alloc_server.js`) |
| Klien hasil build | `Bendahara_V2.html` (D-5, D-3, D-4, lewat `apply_d5_*`, `apply_d3_*`, `apply_d4_*`) |
| Sumber blok klien | `_d5_master_sync.js`, `_d3_v1_pusat.js` |
| Build | `build_all.js`, `run_all_tests.js`, `srv_env.js` (berkas server baru) |
| Uji baru | `d5_master_split_tests`, `d3_v1_pusat_tests`, `d1_kewajiban_audit_tests`, `u5_rab_persetujuan_tests`, `d4_impor_lama_tests`, `d2_multi_siswa_tests`, `dimp8_siswa_audit_tests`, `u1_lintas_periode_tests` |
| Uji lama diubah | `akun_explicit_tests.js` (AK-08), `import_audit_tests.js` (IA-05; IA-07 hanya diberi komentar). Lihat §11 |
| Log patch | `_d5_*`, `_d3_*`, `_d4_*`, `_d2_*_patch_log.txt` |

Tidak ada berkas hasil build yang diedit tangan. Semua perubahan HTML dan `TransactionEngine.gs` dilakukan lewat skrip `apply_*` di `build_all.js`.

---

## 3. D-5 — `centralLegacyMigrate` (P0) — **diimplementasikan**

**Audit pemanggil.** Satu-satunya pemanggil UI adalah `pdLegacyMigrateConfirmed` (Pusat Data → "Migrasikan ke server…"); selain itu hanya uji. Sebelum perbaikan, fungsi ini mengerjakan tiga hal sekaligus:

1. Mempromosikan baris lokal koleksi operasional (`CC_`: anggaran, lpj, kewajiban, dst.) menjadi antrean.
2. Menandai transaksi/alokasi lokal lama `_pendingSync`.
3. Mengantrekan **semua** baris master lokal yang belum ada di server (siswa, komponen, tarif, akun, kategori, subkategori, tahun ajaran), **termasuk seed bawaan** `MASTER_*_SEED` dan kategori `*_LEGACY_*`. Ini risiko R-9.

**Sesudah perbaikan:**

| Operasi | Fungsi | Kontrol |
|---|---|---|
| Migrasi transaksi & koleksi operasional | `centralLegacyMigrate` | Hanya BENDAHARA (`FORBIDDEN` untuk peran lain). **Tidak mengantrekan master atau seed** (`done.masterTidakDikirim`). Idempotensi (id sama), dedupe, dan pengecualian V1 tetap |
| Sinkronisasi master — pratinjau | `centralMasterSyncPratinjau` | Baca-saja (0 tulis localStorage). Status per baris: `KANDIDAT`, `SEED_TIDAK_DIKIRIM`, `TIDAK_VALID`. Jumlah per koleksi |
| Sinkronisasi master — eksekusi | `centralMasterSyncJalankan` / modal "Sinkronisasi master…" | BENDAHARA; koleksi dipilih eksplisit (satu per proses di UI); konfirmasi `SINKRON_MASTER`; alasan ≥ 10 karakter; hasil per baris (`ANTRE` / `DILEWATI` / `TIDAK_DIPILIH`); audit `SINKRON_MASTER_LOKAL`; id master tidak diubah |
| Seed | — | Tidak pernah dikirim lewat jalur ini (`SEED_TIDAK_DIKIRIM`) |

Data lokal tidak dihapus.

**Uji D5-01..05 (5 PASS):**
- Migrasi transaksi: 0 master diantrekan, 0 panggilan `opMaster*`, sheet master server tidak bertambah.
- Pratinjau: seed ditandai, tanpa tulis.
- Eksekusi tanpa konfirmasi / alasan / koleksi valid → ditolak.
- Eksekusi valid: tepat 1 baris non-seed terkirim; ulang → 0, tidak ganda.
- AUDITOR → `FORBIDDEN`.

## 4. D-3 — Migrasi V1 — **diimplementasikan**

**Boot.** Pada mode pusat (`ServerBridge` ada), `init()` **tidak** menjalankan `migrateV1ToV2()`. Yang dilakukan hanya mengisi penanda `State.v1Tertunda`, tanpa menulis apa pun. Mode lokal (tanpa server) tetap memigrasi seperti dulu.

**Alur eksplisit (Pusat Data → "Migrasi data V1…"):**
1. `v1MigrasiPusatPratinjau()` — baca-saja. Status per baris: `SIAP_DITAHAP`, `PENGECUALIAN` (+alasan), `SUDAH_ADA_LOKAL`, `SUDAH_DI_SERVER`. Juga mencantumkan pemetaan yang diperlukan (AKUN/UNIT/KATEGORI).
2. `v1MigrasiPusatJalankan({konfirmasi:'MIGRASI_V1_PUSAT'})`:
   - hanya BENDAHARA, dengan server & master termuat;
   - menahap transaksi V1 ke lokal dengan **akunId kosong** (bukan akun pertama), **kategori V1 apa adanya** (bukan "Lainnya"), dan unit kosong;
   - **tidak** ditandai antre;
   - id deterministik `v1Id_` (sama dengan migrasi boot lama);
   - tidak menimpa data lokal yang ada; alokasi disimpan lebih dulu agar kegagalan parsial tidak menghasilkan transaksi beralokasi setengah jadi;
   - audit `MIGRASI_V1_PUSAT` dengan hasil per baris.
3. Pemetaan eksplisit:
   - `v1PetakanAkun` (P1_20): akun Kas/Bank master + unit + alasan;
   - `v1PetakanKategori` (baru): kategori **aktif** master server + alasan, audit `PEMETAAN_KATEGORI_V1`;
   - keduanya hanya untuk BENDAHARA.
4. Pengiriman lewat `centralLegacyMigrate`. Penjaga kirim (`centralPushTrx_` / `centralPushTrxBatch_`) kini memakai **semua** alasan pengecualian V1, bukan hanya akun.

**Pengecualian baru** (tidak dikirim / tidak ditahap):

| Kondisi | Kode |
|---|---|
| Kategori pengeluaran kosong | `PEMETAAN_KATEGORI_V1_DIPERLUKAN` |
| Kategori "Lainnya" hasil fallback boot lama (tanpa penanda `_kategoriV1`) | `PEMETAAN_KATEGORI_V1_DIPERLUKAN` |
| Kategori tidak ada / Nonaktif di master server | `KATEGORI_TIDAK_ADA_DI_SERVER` |
| Alokasi V1 tanpa siswa/komponen/periode | `ALOKASI_V1_TIDAK_LENGKAP` |
| Siswa alokasi tidak ada di server | `SISWA_V1_TIDAK_ADA_DI_SERVER` |
| Σ alokasi melebihi nominal | `ALOKASI_V1_MELEBIHI_NOMINAL` |
| Tanggal tidak valid | `TANGGAL_V1_TIDAK_VALID` (boot lama memakai tanggal hari ini; jalur baru tidak) |
| Nominal tidak valid | `NOMINAL_V1_TIDAK_VALID` |

Data V1 (`draKinerja_bendaharaSekolah_*`) tidak diubah dan tidak dihapus.

**Uji D3-01..08 (8 PASS):**
- Dibuka dengan data V1 → tidak ada migrasi otomatis.
- Pratinjau beralasan.
- Pengguna tidak berwenang ditolak.
- Konfirmasi wajib; ditahap tanpa fallback.
- Pemetaan belum lengkap → tidak terkirim.
- Pemetaan lengkap → terkirim dengan akun, unit, dan kategori hasil pemetaan.
- Proses diulang → 0 ditahap, 0 baris server baru.
- Kegagalan parsial: (a) simpan lokal gagal, lalu ulang tanpa id ganda; (b) server menolak kiriman, lalu setelah pulih tepat 5 baris server.

**Catatan uji lama:** teks INFO **VM-09** (`v1_migrasi_tests`) masih menyebut "init() memanggil migrateV1ToV2() saat boot". Teks itu kini hanya benar untuk mode lokal. Uji tersebut INFO dan tidak diubah; perilaku baru diuji D3-01.

## 5. D-1 — Tarif & snapshot kewajiban — **audit + desain; implementasi DITAHAN**

### 5.1 Hasil audit (uji `d1_kewajiban_audit_tests`: 4 PASS, 5 INFO)

| Uji | Hasil |
|---|---|
| D1-01/02 PASS | Kewajiban **beku** & lunas tetap 200.000 LUNAS saat tarif naik ke 250.000 maupun turun ke 150.000; transaksi & alokasi tidak berubah |
| D1-03 PASS | Snapshot ulang (retry) setelah tarif berubah: 0 dibuat, 0 diperbarui, baris beku identik |
| D1-07 PASS | Tulis bersamaan memakai `expect` → `CONFLICT`; retry nilai sama → `UNCHANGED` |
| D1-04 INFO | **Celah #2**: `opRecordBatch('kewajiban')` biasa menimpa kewajiban beku berpembayaran tanpa alasan (LUNAS → KELEBIHAN BAYAR) |
| D1-05 INFO | **Celah #3**: belum ada jalur koreksi khusus; alasan pada payload tidak tersimpan |
| D1-06 INFO | Arsip kewajiban beku berpembayaran → kewajiban kembali **tidak beku**, dihitung ulang dengan tarif baru (CICILAN); snapshot ulang gagal karena id `kw_` sudah diarsip |
| D1-08 INFO | Tanpa `expect`: last-write-wins |
| D1-09 INFO | **Istilah "beku" belum konsisten** (lihat 5.2) |

Kewajiban **belum beku** tetap dihitung ulang mundur saat tarif berubah. Ini sudah dikarakterisasi di P1_20 (ST-01/ST-04).

### 5.2 Mengapa belum diimplementasikan

Definisi "beku" tidak tunggal:
- **Server** (`oblSnapshotCore_`) menganggap beku = baris `04_KEWAJIBAN` ber-`tagihanId` dan tidak diarsip, dengan id kanonik `kw_<hash(siswaId|komponenId|periode)>`.
- **Klien** (`freezeObligationsFor_`/`tagihanSnapshotRow_`) memakai id acak `uid('tagihan')` dan mencocokkan kewajiban lewat **nama** komponen (`kewajibanSatuBaris`). Pembacaan klien (`ccFromRow_` tagihan) tidak memeriksa `archivedAt`.
- Akibatnya `opRecordBatch` menerima **dua** baris beku untuk kunci yang sama (D1-09).
- "Sudah dibayar" tidak tersimpan; nilainya dihitung dari alokasi saat dibaca.

Sesuai instruksi, implementasi ditahan sampai definisi disepakati.

### 5.3 Desain aditif yang diusulkan (butuh persetujuan)

**Definisi:**
- **Kunci kewajiban** = `siswaId|komponenId|periode`, berbasis id, bukan nama.
- **BEKU** = satu baris aktif `04_KEWAJIBAN` per kunci dengan `tagihanId` terisi dan `archivedAt` kosong; id kanonik `kw_<hash(kunci)>`, sama di klien dan server.
- **BERPEMBAYARAN** = Σ alokasi aktif kunci > 0, dihitung di dalam kunci saat tulis.

**Langkah:**
1. **E2.** Sebelum `opMasterUpsert/opMasterBatch('tarif')` mengubah `nominal`/`status`, server membekukan kewajiban berpembayaran untuk komponen tarif itu di dalam kunci yang sama. Mekanismenya sama dengan `opTarifApply`.
2. **E5.** RecordGuard `kewajiban`:
   - pada baris BEKU+BERPEMBAYARAN, upsert yang mengubah `bruto/netto/potongan/tagihanId/siswaId/komponenId/periode` → `KEWAJIBAN_BEKU_TERKUNCI`;
   - arsip baris tersebut juga ditolak;
   - pembuatan baris beku kedua untuk kunci yang sama → `DUPLICATE`.
3. **Jalur koreksi** `opKewajibanKoreksi({id, perubahan:{bruto?,netto?,potongan?}, alasan (≥10), expect, clientRequestId})`:
   - hanya BENDAHARA (persetujuan kedua setelah D-T7);
   - audit `KOREKSI_KEWAJIBAN` berisi before/after, alasan, email sesi, dan waktu server dalam append yang sama;
   - tidak pernah menyentuh `06_ALOKASI`;
   - retry idempoten; `expect` wajib.
4. **Klien:** `tagihanSnapshotRow_` memakai id `kw_<hash>` dan pencocokan `komponenId`; `ccFromRow_` mengabaikan baris terarsip.
5. Sebelum aktivasi: audit baca-saja baris beku ganda per kunci di salinan data sah. Penyelesaian manual, tanpa normalisasi massal.

**Dampak:**
- Nilai kewajiban beku tidak berubah, jadi KPI tidak berubah.
- D1-04/05/06/08 akan berubah dari INFO menjadi PASS.
- Alur klien yang menerbitkan ulang tagihan untuk kewajiban beku berpembayaran akan mendapat penolakan beralasan.
- Tidak ada kolom baru yang wajib. Kolom aditif opsional bila riwayat koreksi ingin ada di sheet, bukan hanya audit: `alasanKoreksi`, `dikoreksiOleh`, `dikoreksiPada`.

## 6. U-5 — Persetujuan RAB — **diimplementasikan (metadata); kebijakan KPI tidak diubah**

- **Kolom aditif** `08_ANGGARAN.disetujuiPada`, `disetujuiOleh` lewat Migrasi Skema Aditif (`TAMBAH_KOLOM_ADITIF`), ditambahkan di ujung header.
- **Ditentukan server** di `opRecordBatchLocked_` (satu-satunya jalur tulis 08: form, impor RAB V2, uji live):
  - nilai klien untuk kedua kolom selalu **dibuang**;
  - transisi ke `DISETUJUI` (termasuk baris baru) → waktu server ISO + email sesi;
  - `DISETUJUI` → status lain → kedua kolom dikosongkan;
  - setiap transisi diaudit `RAB_PERSETUJUAN` pada append yang sama;
  - bila kolom belum ada, perubahan tetap diproses + peringatan `METADATA_PERSETUJUAN_TIDAK_TERSIMPAN`.
- **Histori:** RAB lama berstatus DISETUJUI tanpa metadata dilaporkan `HISTORI_TIDAK_LENGKAP` oleh `opRabPersetujuanAudit()` (baca-saja). Waktu dan identitas **tidak dikarang**.
- **Tidak berlaku surut — hanya diukur.** `opRabPersetujuanAudit` mendaftar transaksi bertanggal **sebelum** `disetujuiPada` yang saat ini dihitung sesuai RAB. Pencocokan RAB dan BDS03-I03/I04/I05 **tidak diubah** (U5-07: hasil `opRabRealization` identik dengan RAB berstatus sama tanpa metadata).
  - Menerapkan "transaksi sebelum persetujuan tidak otomatis sesuai RAB" ke perhitungan berarti **mengubah input KPI**, sehingga butuh persetujuan perubahan KPI terpisah.
  - Persetujuan retroaktif **tidak** diaktifkan (GAP-005).
- `opRabPersetujuanAudit` dan `opAlokasiLintasPeriodeAudit` belum ditambahkan ke `ServerBridge` (sama seperti `opKategoriPengeluaranAudit` P1_20). Keduanya dijalankan dari editor Apps Script atau uji.
- **Uji U5-01..08: 8 PASS.**

## 7. D-4 — Wizard impor lama — **diimplementasikan untuk 4 modul**

**Bukti tidak dipakai alur aktif:**
- `openImportWizard` mengalihkan 5 modul ke Impor V2 (LI-01).
- Resolver antrean lama menolak 5 modul (LI-02).
- `State.importSession` hanya dibuat oleh `openImportWizard` untuk tipe non-V2.
- Selain itu, fungsi lama hanya dapat dijangkau lewat konsol atau uji.

**Dinonaktifkan pada fungsi** (bukan hanya tombol) untuk penerimaan, pengeluaran, RAB, LPJ:
- `importWizardConfirm` → `JALUR_IMPOR_LAMA_DINONAKTIFKAN` + audit `IMPOR_LAMA_DITOLAK`;
- `commitPenerimaanRow`, `commitPengeluaranRow`, `commitRabRow`, `commitLpjRow` → error sebelum menulis.

**Server (lapis kedua):** `opRecordBatch` publik menolak baris **baru** RAB/LPJ bertanda impor (`importBatchId` terisi atau `source = RAB_IMPORT`).
- ImportEngine (Impor V2) dan RabAllocation tidak terpengaruh karena memanggil `opRecordBatchLocked_` langsung.
- Baris impor yang sudah ada tetap dapat diubah.
- Transaksi penerimaan/pengeluaran jalur lama **tidak dapat** dibedakan di server: payload-nya identik dengan input manual (`opCreateIncome/Expense/TxBatch`). Untuk modul ini, penonaktifan ada di klien, dan server tetap memvalidasi akun/kategori/siswa/kewajiban.

**Dipertahankan:** wizard RKAT & mutasi bank, utilitas bersama (`fieldGetterFor`, `extraColumnsFor`, `sourceMetaFor`, validasi pratinjau), dan seluruh Impor V2.

**Belum: modul siswa.** `importWizardConfirmSiswa`/`commitSiswaRow` masih diuji sebagai fungsi aktif oleh `e2e_central2` M0/M1 dan `t4b_tests` T4B-15. Menonaktifkannya mengubah ekspektasi tiga uji itu, yang di luar izin (AK-08, IA-05, IA-07), sehingga butuh keputusan.

**Uji D4-01..05: 4 PASS, 1 INFO.** Perubahan ekspektasi uji lama dibahas di §11.

## 8. D-2 — Penerimaan untuk beberapa siswa — **diimplementasikan (tanpa perubahan skema)**

**Audit skema:** `05_TRANSAKSI.siswaId` bernilai tunggal; `06_ALOKASI.siswaId` per baris. Multi-siswa = transaksi tanpa `siswaId` + alokasi per siswa. **Tidak perlu perubahan skema.**

| Kontrol yang diminta | Mekanisme | Uji |
|---|---|---|
| Siswa, kewajiban, periode, nominal per alokasi | `validateAllocationsForIncome_` + `engineAllocObligationCheck_` (kunci siswa\|komponen\|periode) | D2-01, D2-02 |
| Siswa & kewajiban valid | `OBLIGATION_NOT_FOUND` / `VALIDATION_ERROR` | D2-02, D2-06 |
| Σ alokasi ≤ transaksi | `ALLOCATION_EXCEEDS_TRANSACTION` | D2-03, D2-04 |
| Alokasi ≤ sisa kewajiban, dihitung di kunci | `ALLOCATION_EXCEEDS_OBLIGATION` (sisa dibaca ulang) | D2-03, D2-04 |
| Tidak ada alokasi ke pengeluaran | **Baru:** `opCreateExpense` dengan `allocations` → `INVALID_ALLOCATION` (sebelumnya dibuang diam-diam); `opCreateAllocation` ke pengeluaran → `INVALID_ALLOCATION` (P1_20 C) | D2-07 |
| Retry tidak menggandakan | `clientRequestId` | D2-05 |
| Siswa tidak dipindah diam-diam | `siswaId` transaksi terkunci bila ada alokasi (`ALLOCATION_LOCKED`); alokasi immutable (hanya arsip) | D2-06 |
| Sisa tidak dialokasikan otomatis | Server hanya menulis alokasi eksplisit; status `SEBAGIAN_TERALOKASI` | D2-08 |
| Tidak membuat siswa fiktif | Tidak ada jalur pembuatan siswa | — |

**Ketergantungan `siswaId` di tampilan klien** (D2-09 INFO, tidak diubah). Bagian berikut hanya membaca `transaksi.siswaId`, sehingga penerimaan multi-siswa tidak tampil per siswa:
- riwayat penerimaan di profil siswa;
- sumber kelebihan bayar per siswa;
- cek over-alokasi;
- tombol "Edit Alokasi" cepat.

Tampilan berbasis alokasi (`alokasiForTransaksi`, `alokasiSiswa`) sudah benar. Perbaikan tampilan diusulkan sebagai pekerjaan terpisah; KPI tidak terpengaruh.

**Uji D2-01..09: 8 PASS, 1 INFO.**

## 9. D-IMP-8 — Audit master siswa — **audit baca-saja diperbarui; data nyata BLOCKED**

`opSiswaMasterAudit` kini memuat blok `standar`:

| Aspek | Isi blok `standar` |
|---|---|
| Jenis kelamin | Kanonis `L`/`P`; variasi apa adanya dengan saran kanonis hanya bila jelas (mis. `Laki-laki`→L, `perempuan`→P, `X` tanpa saran); kosong |
| Kelas | Pola `{TINGKAT}-{ROMBEL}` (TINGKAT angka 1–2 digit atau A/B untuk TK; ROMBEL huruf/angka besar); sesuai/tidak sesuai per unit + contoh id |
| NISN | Valid 10 digit numerik; tidak valid; kosong (tidak direka); sel angka (nol depan hilang); ganda di semua baris; ganda di antara siswa Aktif |
| Tanggal | Tanggal masuk/keluar tidak valid; keluar sebelum masuk |
| Dampak kewajiban | Siswa Aktif yang kelasnya tidak memberi tingkat pada unit bertarif per kelas: tarif per kelas tidak berlaku bagi mereka, dan **menormalkan kelas akan mengubah kewajiban** (IMP8-06). Tanggal tidak sah diabaikan enumerasi periode |

- Tidak ada normalisasi.
- Audit **belum dijalankan pada salinan data sah** (tidak tersedia) dan tidak dijalankan pada produksi. Variasi nyata FINAL belum dapat dilaporkan.
- **Uji IMP8-01..07: 6 PASS, 1 INFO.**

## 10. Desain (belum diimplementasikan; butuh persetujuan terpisah)

### 10.1 D-T1 — Model uang muka, opsi C (entitas `UANG_MUKA` terpisah)

**Audit skema & pemanggil:**
- Tidak ada konsep uang muka di kode, `DB_SCHEMA`, maupun FINAL.
- Satu-satunya jalur uang keluar adalah PENGELUARAN biasa (`createTransactionWithAllocations_`).
- LPJ (`19_LPJ`) hanya bertaut ke transaksi lewat `transaksiId`, dengan pengaman P0-T1 (aturan 62 hari, `trx_lpj_<lpjId>`).
- FCC (`FinanceEngine.gs`) dan BDS03 menghitung PENGELUARAN sebagai pengeluaran aktual.

**Skema aditif usulan (sheet baru lewat setup eksplisit, seperti sheet 30):**

| Objek | Kolom |
|---|---|
| `32_UANG_MUKA` (baru) | `id, kegiatan, rabId, unit, akunId, pelaksana, nominalCair, tanggalCair, transaksiCairId, status, tanggalLpjDiterima, tanggalVerifikasi, diverifikasiOleh, alasanPerbaikan, totalNotaTerverifikasi, totalPengembalian, createdAt, createdBy, archivedAt, archivedBy, archiveReason` |
| `05_TRANSAKSI` (+kolom) | `sifat` (`''` / `UANG_MUKA_CAIR` / `UANG_MUKA_KEMBALI`), `uangMukaId` |
| `19_LPJ` (+kolom) | `uangMukaId` (lihat juga 10.2) |

**Pemisahan:**
- Pencairan = PENGELUARAN kas ber-`sifat=UANG_MUKA_CAIR`: arus kas, **bukan** beban.
- Nota terverifikasi = beban aktual (LPJ `DIVERIFIKASI` bertaut `uangMukaId`); tidak membuat transaksi kas kedua.
- Pengembalian = PENERIMAAN ber-`sifat=UANG_MUKA_KEMBALI`, **bukan** penerimaan operasional.
- Saldo uang muka = `nominalCair − Σ nota terverifikasi − Σ pengembalian`. Ini adalah kewajiban pertanggungjawaban yang belum selesai.
- Contoh: 2.000.000 − 1.700.000 − 300.000 = 0 → SELESAI.
- **Transfer antar akun tidak dibutuhkan** (GAP-028 tetap diblokir).

**Matriks status / otorisasi:**

| Dari → ke | Pemicu | Peran | Syarat |
|---|---|---|---|
| — → DICAIRKAN | `opUangMukaCair` (membuat transaksi `UANG_MUKA_CAIR` + entitas secara atomik) | BENDAHARA | Akun Kas/Bank eksplisit, `rabId` sah, idempoten |
| DICAIRKAN → LPJ_DITERIMA | `opUangMukaTerimaLpj` | BENDAHARA | ≥1 LPJ bertaut, `tanggalDiterima` dari server |
| LPJ_DITERIMA → DIVERIFIKASI | `opUangMukaVerifikasi` | KEPALA_SEKOLAH / YAYASAN, **≠ pembuat** | Butuh GAP-005 + D-T7; **tidak diaktifkan** |
| LPJ_DITERIMA → PERLU_PERBAIKAN (status tambahan usulan) | `opUangMukaTolak` | Verifikator | Alasan wajib; LPJ dapat diperbaiki lalu diajukan ulang → LPJ_DITERIMA |
| DIVERIFIKASI → SELESAI | Dihitung server | — | Saldo = 0 (sisa sudah dikembalikan lewat `opUangMukaKembali`, BENDAHARA) |
| DICAIRKAN → DIBATALKAN (usulan) | `opUangMukaBatal` | BENDAHARA | Belum ada LPJ; pengembalian penuh tercatat; alasan wajib |

**Laporan & KPI:**
- Basis desain BDS03/FCC = beban aktual terverifikasi, dengan pelaporan terpisah untuk: kas keluar (pencairan), uang muka belum selesai (saldo), dan pengembalian.
- Ini **mengubah definisi pengeluaran aktual** di FCC/BDS03 → butuh persetujuan perubahan KPI terpisah.
- Sampai disetujui, formula tidak disentuh. Pencairan yang dicatat sebelum aktivasi tetap dihitung sebagai PENGELUARAN biasa (perilaku sekarang).

**Rencana migrasi:**
- Tidak otomatis.
- Laporan kandidat baca-saja: PENGELUARAN yang bertaut LPJ dengan Σ LPJ < nominal, atau berkategori kegiatan.
- Penandaan per transaksi lewat operasi eksplisit beralasan (`opTandaiUangMuka`), beraudit; tanggal dan nominal tidak diubah.
- Dijalankan di salinan dahulu.

**Kebutuhan verifikator & GAP-005:**
- Identitas sesi harus terbukti di deployment live: akun Workspace, `executeAs` dan akses web app dicatat, akun uji tanpa akses edit spreadsheet.
- Pengelolaan peran penyetuju di luar BENDAHARA (P0-T7 sudah memblokir BENDAHARA memberi peran penyetuju; prosedur admin D-T7 belum ada).

### 10.2 D-T1-link & D-LPJ

| Operasi | Rancangan |
|---|---|
| `opLinkLpj({lpjId, transaksiId, expect:{transaksiId:''}, clientRequestId})` | BENDAHARA. LPJ aktif belum bertaut; transaksi PENGELUARAN aktif; Σ LPJ aktif ≤ nominal; beda unit/periode → `PERLU_PEMERIKSAAN` (tidak otomatis diterima); konflik → `CONFLICT` |
| `opCreateExpenseFromLpj({lpjId, akunId, unit, kategori, clientRequestId})` | **Atomik** dalam satu `withLock_`: validasi LPJ belum bertaut → buat transaksi (fungsi internal engine) → tulis tautan → satu append audit. Kegagalan setelah baris transaksi ditulis → baris dihapus kembali (pola rollback `deleteRowById_` engine), sehingga tidak ada transaksi yatim. Idempotensi kunci `lpj:<lpjId>`. Akun dan kategori wajib eksplisit |
| `opUnlinkLpj({lpjId, alasan, expect})` | Alasan wajib; LPJ kembali "belum bertaut"; transaksi **tidak** dihapus; koreksi = batal + tautan baru |
| Riwayat | Audit `LPJ_LINK` / `LPJ_UNLINK` (before/after, aktor sesi); sheet aditif opsional `LPJ_TAUTAN` |
| Heuristik 62 hari | Turun menjadi **peringatan kandidat** saja, bukan penentu. Tidak ada penautan otomatis berdasarkan kemiripan |

**Status LPJ** (kolom aditif `19_LPJ`):
- `statusLpj` (`DIAJUKAN` → `DITERIMA` → `DIVERIFIKASI`; `DITOLAK` = hasil pemeriksaan yang dapat diperbaiki → `DIAJUKAN`);
- `tanggalNota`, `tanggalDiterima` (server), `tanggalVerifikasi` (server);
- `diajukanOleh`, `diverifikasiOleh` (server), `alasanTolak`, `uangMukaId`.

**Data lama:**
- Kolom lama `tanggal` dan `status` (`REALIZATION`) **tidak diubah maknanya**.
- Baris lama tanpa `tanggalNota` dilaporkan histori tidak lengkap.
- Pemetaan `tanggal` lama → `tanggalNota` hanya setelah audit di salinan.

**Aturan verifikasi:**
- BENDAHARA tidak boleh memverifikasi LPJ yang dibuat/diajukannya sendiri.
- KEPALA_SEKOLAH/YAYASAN menjadi verifikator **setelah GAP-005 dan D-T7 teruji**. Verifikasi produksi **tidak diaktifkan**.

### 10.3 U-1 — Alokasi lintas periode

- **Audit baca-saja (diimplementasikan):** `opAlokasiLintasPeriodeAudit()` mengklasifikasikan setiap alokasi eksplisit aktif sebagai `SAMA_PERIODE`, `PERIODE_BERBEDA` (calon `PERIOD_MISMATCH`), `PERIODE_RAB_BUKAN_BULAN`, atau `REFERENSI_TIDAK_VALID`, beserta ringkasan per pasangan periode. Uji U1-01..04: 3 PASS, 1 INFO. U1-02 mengkarakterisasi bahwa alokasi Sep→Okt masih diterima.
- **Desain:**
  - Default: periode bulan transaksi = periode garis RAB; selain itu RecordGuard `alokasiPengeluaran` dan uji kering impor menolak `PERIOD_MISMATCH`, hanya untuk tulis **baru**. Data lama tidak ditolak dan tidak diubah, hanya dilaporkan audit.
  - Pengecualian: kolom aditif `30_ALOKASI_PENGELUARAN.alasanLintasPeriode, disetujuiOleh, disetujuiPada, peranPenyetuju` diisi oleh operasi terpisah `opSetujuiLintasPeriode` (KEPALA_SEKOLAH/YAYASAN, identitas & waktu server, alasan wajib, audit periode transaksi + periode RAB).
  - **Tidak diaktifkan** karena GAP-005/D-T7.
  - Tidak ada `PERIOD_MISMATCH` global dan tidak ada perubahan massal.

### 10.4 K-RAB-07 — Persetujuan pengeluaran di luar RAB (desain disetujui, aktivasi ditunda)

**Sheet aditif `31_PERSETUJUAN_PENGELUARAN`:**
`id, transaksiId (unik aktif, immutable), nominalDisetujui, status (DISETUJUI/DITOLAK/DIBATALKAN), alasan, buktiId, komitmenId (rujukan opsional), disetujuiOleh, peranPenyetuju, disetujuiPada, dibatalkanOleh, dibatalkanPada, alasanPembatalan, createdAt, createdBy`

**Operasi:**
- `opApproveExpense` / `opRejectExpense` / `opRevokeApproval`, khusus KEPALA_SEKOLAH/YAYASAN;
- identitas dan waktu dari sesi server; alasan wajib;
- penyetuju ≠ pembuat transaksi. `05_TRANSAKSI` belum punya `createdBy`; pembuat diambil dari audit log atau kolom aditif `createdBy`;
- idempoten, dengan `expect`;
- `buktiId` wajib di atas ambang.

**Keputusan yang masih diperlukan:**
- **ambang nominal** (tidak ditetapkan di sini);
- batas kewenangan Kepala Sekolah vs Yayasan;
- BDS03-I05 lulus bila I03 lulus **atau** persetujuan sah — ini butuh uji diferensial; bobot/definisi tetap.

Tidak diaktifkan sampai GAP-005 dan D-T7 selesai.

### 10.5 GAP-028

Tetap diblokir (`postTransaksi` menolak TRANSFER; tidak ada jalur server). Opsi C tidak memerlukan transfer.

---

## 11. Perubahan ekspektasi uji lama (dilaporkan)

| Uji | Sebelum | Sesudah | Alasan perilaku |
|---|---|---|---|
| **AK-08** (`akun_explicit_tests`) | Wizard lama pengeluaran: tanpa akun / kategori fiktif → HOLD; akun & kategori eksplisit → 1 tersimpan | Ketiga berkas ditolak `JALUR_IMPOR_LAMA_DINONAKTIFKAN`: 0 tersimpan, 0 antrean, 3 audit `IMPOR_LAMA_DITOLAK` | Keputusan D-4 |
| **IA-05** (`import_audit_tests`) | Impor pertama tersimpan, impor kedua duplikat (n = 1) | Pratinjau tetap valid; kedua konfirmasi ditolak; 0 transaksi | Keputusan D-4 |
| **IA-07** | LPJ tidak membuat transaksi | **Tetap** (hanya komentar). Kini LPJ juga tidak tersimpan (lihat IA-08 INFO) | Ditinjau |

Uji lama lain **tidak diubah**. Beberapa teks INFO kini menggambarkan perilaku lama:
- IA-01..04/06/08: wizard lama kini ditolak sebelum simpan;
- VM-09: boot mode pusat tidak lagi bermigrasi;
- LI-04: inventaris.

Tidak ada assertion yang dilemahkan agar lulus. Dua FAIL awal pada uji baru D-2 adalah ekspektasi **kode galat** saya yang keliru: server menolak dengan `VALIDATION_ERROR`/`OBLIGATION_NOT_FOUND`, bukan `INVALID_COMPONENT`/`INVALID_STUDENT`. Penolakannya sendiri benar. Uji baru disesuaikan ke kode yang sebenarnya.

## 12. Hasil uji (sandbox; `node run_all_tests.js p1_21`, log `_test_logs/p1_21_*.log`)

| Suite | PASS | FAIL | INFO |
|---|---|---|---|
| 24 suite lama (server_pass2 … legacy_import_tests) | 587 | 0 | 50 |
| d5_master_split_tests | 5 | 0 | 0 |
| d3_v1_pusat_tests | 8 | 0 | 0 |
| d1_kewajiban_audit_tests | 4 | 0 | 5 |
| u5_rab_persetujuan_tests | 8 | 0 | 0 |
| d4_impor_lama_tests | 4 | 0 | 1 |
| d2_multi_siswa_tests | 8 | 0 | 1 |
| dimp8_siswa_audit_tests | 6 | 0 | 1 |
| u1_lintas_periode_tests | 3 | 0 | 1 |
| **Total (32 suite)** | **633** | **0** | **59** |

Rincian 24 suite lama identik dengan baseline: AK-08 dan IA-05 tetap terhitung PASS dengan ekspektasi baru.

## 13. Bukti regresi KPI

- `git diff 6f3c6ba HEAD -- Bendahara_V2.html` tidak memuat baris BDS0x, `INDICATOR_MASTER`, bobot, target, atau ambang (0 baris).
- `FinanceEngine.gs`, `RabMapping.gs`, `ObligationEngine.gs`, `TarifPlan.gs`, `ReconEngine.gs`, `PeriodLock.gs` **tidak berubah**.
- Suite KPI/FCC tetap lulus: `p0_tests`, `rab_tests` (diferensial BDS03), `audit_p1_tests`, `e2e_central2` F1/F2 (FCC klien = server).
- U5-07: realisasi RAB identik dengan dan tanpa metadata persetujuan.
- D1-01/02: kewajiban beku tidak berubah.
- Status data: 544 TEREKONSILIASI tidak disentuh (tidak ada data nyata di sandbox; tidak diverifikasi ulang karena tidak ada salinan sah). 31 indikator dan definisinya tidak diubah.

## 14. Status data historis

Tidak ada data historis yang diubah, dinormalisasi, atau dimigrasikan. Rinciannya:
- Data V1 lokal tidak dihapus.
- Migrasi V1 hanya menahap ke lokal atas tindakan eksplisit.
- RAB lama tanpa metadata ditandai, bukan diisi.
- Kewajiban beku tidak disentuh.
- Alokasi lama tidak diubah.
- Kolom aditif U-5 baru ada di sandbox. Di sheet nyata, kolom itu baru muncul bila Migrasi Skema Aditif dijalankan, dan itu belum dilakukan di mana pun.

## 15. Masalah tersisa & keputusan yang dibutuhkan

| ID | Hal |
|---|---|
| D-1 | Setujui definisi kunci/BEKU/BERPEMBAYARAN (§5.3) lalu implementasi E2 + E5 + `opKewajibanKoreksi`; audit baris beku ganda di salinan |
| D-4-siswa | Nonaktifkan wizard lama siswa? Mengubah ekspektasi `e2e_central2` M0/M1 dan `t4b_tests` T4B-15 |
| U-5-KPI | Terapkan "tidak berlaku surut" pada pencocokan RAB (mengubah input BDS03-I03/I05) — persetujuan KPI terpisah |
| D-T1 | Setujui skema opsi C (`32_UANG_MUKA`, `sifat`, `uangMukaId`), status tambahan PERLU_PERBAIKAN/DIBATALKAN, dan perubahan definisi pengeluaran aktual FCC/BDS03 |
| D-T1-link / D-LPJ | Setujui kolom aditif `19_LPJ` dan tiga operasi tautan |
| U-1 | Setujui aktivasi PERIOD_MISMATCH untuk tulis baru + mekanisme pengecualian (setelah GAP-005/D-T7) |
| K-RAB-07 | Tetapkan ambang nominal bukti dan batas kewenangan Kepala Sekolah/Yayasan |
| GAP-005 / D-T7 | Jenis akun, `executeAs`, akses web app, prosedur admin peran — prasyarat semua verifikator |
| Tampilan multi-siswa | Profil siswa / kelebihan bayar / tombol alokasi membaca `transaksi.siswaId` saja (D2-09) — perbaikan tampilan terpisah |
| Bridge | `opRabPersetujuanAudit`, `opAlokasiLintasPeriodeAudit`, `opKategoriPengeluaranAudit` belum ada di ServerBridge/UI |
| Tetap terbuka | GAP-028 (tetap diblokir), D-IMP-8 data nyata (BLOCKED), 544 TEREKONSILIASI (verifikasi ulang butuh salinan sah) |

## 16. Status integrasi live

**BLOCKED.**
- Tidak ada salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji (BENDAHARA + AUDITOR/KEPALA_SEKOLAH), maupun folder bukti uji.
- Tidak ada fungsi P1_21 yang dijalankan di Apps Script.
- GAP-005 tetap terbuka.
- Langkah uji salinan mengikuti P1_20 §12 dan `_live_tests/LiveReadiness.gs`, ditambah untuk P1_21:
  1. Migrasi Skema Aditif di salinan → `08_ANGGARAN` memuat `disetujuiPada`/`disetujuiOleh`.
  2. Setujui satu RAB uji → metadata diisi email akun uji.
  3. `opRabPersetujuanAudit`, `opAlokasiLintasPeriodeAudit`, `opSiswaMasterAudit` pada salinan FINAL (baca-saja).
  4. Pusat Data: migrasi data lokal tidak mengirim master; "Sinkronisasi master…" butuh konfirmasi.
  5. Buka aplikasi dengan data V1 di browser uji → tidak ada migrasi otomatis.

## 17. Rollback

Setiap pekerjaan adalah satu commit. Revert dilakukan dalam urutan terbalik bila lebih dari satu, lalu bangun ulang dan uji:

```
git revert <commit>            # mis. e816bac, 4385a98, 3fe85c5, a9529f8, ec53a8c, 9515720, 4dbb774, fe28b80
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```

| Commit | Catatan revert |
|---|---|
| `fe28b80` D-5 | Revert juga menghapus `apply_d5_*` dari `build_all.js`. **Revert `4dbb774` (D-3) dulu**, karena `apply_d3_*` berjangkar pada tombol D-5 |
| `4dbb774` D-3 | Mengembalikan migrasi boot pada mode pusat; dapat di-revert sendiri (tidak ada patch lain yang berjangkar padanya) |
| `9515720` D-1 | Hanya uji |
| `ec53a8c` U-5 | Aman. Bila kolom aditif sudah ditambahkan di sheet (belum di mana pun), kolom kosong boleh tetap ada; tidak dibaca kode lama |
| `a9529f8` D-4 | Mengembalikan wizard lama dan ekspektasi AK-08/IA-05 lama |
| `3fe85c5` D-2 | Mengembalikan pembuangan diam-diam `allocations` pada pengeluaran |
| `4385a98`, `e816bac` | Audit baca-saja; aman |

Produksi tidak pernah diubah, sehingga tidak ada rollback data.
