# Laporan: Tarif 2026/2027, Kewajiban, Alokasi, Anggaran per Komponen

Status: **KODE SUDAH DIIMPLEMENTASIKAN dan DIVALIDASI STATIS (sandbox)**. **Belum ada uji live.** Tidak ada klaim LIVE PASS.
Tidak ada data produksi yang ditulis. Google Sheets produksi hanya DIBACA (konektor read-only) untuk mencocokkan komponen/tarif/alokasi yang sudah ada.

## 1. Sumber data (dibaca langsung dari `D:\biaya TK MI\`)

| Berkas | Isi yang dipakai |
|---|---|
| `RINCIAN BIAYA TAHUNAN MI 2026-2027.xlsx` | Sheet KELAS 1, KELAS 2, KELAS 3 - 5, KELAS 6: rincian biaya tahunan + SPP per kelas |
| `Rincian Biaya Masuk MI TA 2026-2027.pdf` (gambar, dibaca visual) | Biaya Awal 4.350.000; Bulanan 600.000 (SPP 350.000 + Catering 250.000); Tahunan 2.200.000; Total 7.150.000; catatan diskon 50% historis |
| `BIAYA Masuk, Daftar Ulang, SPP TK 2026-2027.docx` | TK baru: Biaya Awal 3.000.000 (7 komponen) + SPP 200.000 = 3.200.000; Daftar ulang TK B: 1.450.000 (5 komponen) + SPP 200.000 = 1.650.000 |
| Aturan Bendahara (pesan) | SPP MI 350.000 / 300.000 / 250.000; katering MI per hari terjadwal 13.000 (kelas 1-4) / 11.000 (kelas 5-6) |

### Tarif yang dimodelkan (semua nominal dari sumber; tidak ada yang dikarang)

* **SPP**: MI K1 350.000, K2 300.000, K3-6 250.000, TK 200.000. Keempat tarif ini **sudah ada dan cocok** di sheet live, jadi hanya divalidasi.
* **Katering MI**: komponen baru `kmp_katering_harian` (dasar tarif `PER_HARI_TERJADWAL`): kelas 1-4 = 13.000, kelas 5-6 = 11.000 per hari terjadwal. Tagihan bulan = tarif x jumlah hari terjadwal bulan itu, **tidak bergantung kehadiran**.
* **Biaya tahunan MI per kelas**: 12 komponen `kmp_thn_*`.

| Komponen | K1 | K2 | K3-5 | K6 |
|---|---:|---:|---:|---:|
| Ekskul | 100.000 | 100.000 | 100.000 | 100.000 |
| Talents Camp | 100.000 | 100.000 | 50.000 | 50.000 |
| PHBI | 70.000 | 70.000 | 50.000 | 50.000 |
| Ikhtitam Qur'an | 200.000 | 200.000 | 70.000 | 70.000 |
| Tahfizh Camp | 120.000 | 120.000 | 120.000 | 120.000 |
| Field Trip | 200.000 | 200.000 | 100.000 | 100.000 |
| ATK, Portofolio, Ujian | 250.000 | 250.000 | 100.000 | 100.000 |
| Buku Paket | 563.000 | 563.000 | 744.500 | 744.500 |
| LKS | 50.000 | 50.000 | 50.000 | 50.000 |
| Magang | 100.000 | 100.000 | 100.000 | tidak ada |
| Komite | 120.000 (dari PDF) | 120.000 | 120.000 | 120.000 |
| Pemeliharaan Sarpras | 327.000 | 327.000 | 195.500 | 195.500 |
| **Jumlah** | **2.200.000** | **2.200.000** | **1.800.000** | **1.700.000** |

* **Biaya masuk MI baru** (6 komponen, K1): Formulir 200.000; Infaq Pembangunan 1.500.000; Seragam 1.100.000; Talents Mapping 500.000; Kursi dan Meja 750.000; Buku Kegiatan Harian 300.000 = **4.350.000**.
* **Biaya masuk TK baru** (7 komponen): Uang Pembangunan 1.200.000; Formulir 150.000; Peralatan 350.000; Field Trip 200.000; Seragam 3 stel 500.000; Pemeliharaan Sarpras 450.000; Komite 150.000 = **3.000.000**.
* **Daftar ulang TK** (5 komponen): Formulir 150.000; Peralatan 350.000; Field Trip 200.000; Sarpras 600.000; Komite 150.000 = **1.450.000**.
* **Diskon pembangunan 50% (50 pendaftar pertama s/d 31-12-2025)**: aturan historis, **tidak diterapkan otomatis**; tidak ada kebijakan keringanan yang dibuat.

### Pemeriksaan jumlah komponen vs total sumber (otomatis, 13 pemeriksaan)
Semua **cocok** (K1 2.080.000 XLSX; K2 2.200.000; K3-5 1.800.000; K6 1.700.000; K1 + Komite PDF 2.200.000; biaya awal MI 4.350.000; TK baru 3.000.000; daftar ulang 1.450.000; total PDF 7.150.000; total TK 3.200.000 dan 1.650.000). Bila ada selisih, kode menandainya dan **menolak menerapkan** (`TOTALS_MISMATCH`), tanpa koreksi otomatis (diuji dengan mengubah satu nominal).

## 2. Hasil audit alur kewajiban/alokasi (cacat nyata yang ditemukan)

| # | Temuan | Dampak | Tindakan |
|---|---|---|---|
| 1 | **Snapshot server tidak pernah "beku"**: `opObligationSnapshot` menulis `tagihanId` kosong, sedangkan pemuat server membuang baris tanpa `tagihanId` | Tarif berubah = tagihan lama ikut berubah, walau sudah "disnapshot" | Diperbaiki: `tagihanId` = id snapshot; kewajiban beku tidak pernah dihitung ulang |
| 2 | `resolveObligationMatch`: alokasi tanpa `tagihanId` tidak cocok dengan kewajiban yang kemudian dibekukan | Pembayaran historis "hilang" dari kewajiban begitu dibekukan | Diperbaiki: identitas = siswa + komponen + periode (`tagihanId` hanya mempercepat) |
| 3 | Sheet `04_KEWAJIBAN` live **kosong**: seluruh kewajiban dihitung ulang dari tarif saat ini | Tidak ada riwayat; perubahan tarif/kelas mengubah masa lalu | Pembekuan (snapshot) eksplisit + otomatis sebelum perubahan berisiko |
| 4 | Tarif live `kmp_pendidikan` 2.080.000 + `kmp_komite` 120.000 ditagih ke **semua kelas MI** | K3-5 ditagih 2.200.000 (sumber 1.800.000), K6 2.200.000 (sumber 1.700.000) | Dimodelkan per kelas; lihat laporan dampak |
| 5 | Biaya Awal / Daftar Ulang TK ditagih ke **semua** siswa unit (tarif tanpa kelas) | Siswa lama ikut ditagih biaya masuk | Komponen bersasaran (`sasaran`: BARU / DAFTAR_ULANG) + klasifikasi eksplisit per tahun ajaran |
| 6 | Alokasi tidak diperiksa terhadap kewajiban di server; di klien dua baris pada kewajiban yang sama diperiksa sendiri-sendiri | Total alokasi bisa melebihi sisa; alokasi ke kewajiban yang tidak ada | Pemeriksaan batch di klien + `AllocationGuard.gs` di server (lapis kedua) |
| 7 | `submitSiswaForm` mengisi `tahunAjaran` = tahun aktif pada **setiap** edit siswa | Edit biasa bisa memindahkan TA siswa dan melenyapkan kewajiban TA lama | Kewajiban dibekukan otomatis sebelum TA siswa berubah |
| 8 | Tab "Realisasi/Sisa" lama membandingkan `program` RAB dengan kategori transaksi | Realisasi sering 0 (mencampur istilah) | **Tidak diubah** (fungsi lama dipertahankan); tab baru "Anggaran vs Aktual" memakai kategori/subkategori/unit/periode yang benar |

## 3. Desain yang diimplementasikan

* **Tidak menimpa tarif atau komponen lama.** Komponen rincian baru ditambahkan; tarif lump 2026/2027 yang digantikan hanya **dinonaktifkan** (status), tidak dihapus.
* **Tidak ada tagihan ganda.** Komponen rincian punya `menggantikan` (komponen lump yang digantikan). Siswa yang **sudah punya pembayaran** pada lump lama: kewajiban lump-nya **dibekukan apa adanya** dan rincian **tidak ditagihkan lagi** kepadanya.
* **Tarif & hari tersimpan pada kewajiban saat dibuat**: `tarifId`, `tarifSatuan`, `jumlahHari`, `kelas`, `unit`, `tahunAjaran` di baris beku `04_KEWAJIBAN`.
* **Katering**: hari terjadwal per bulan diisi Bendahara (panel "Hari Katering Terjadwal"); kosong = belum ada kewajiban (tidak ada nilai bawaan). Mengubah hari tidak mengubah kewajiban yang sudah beku; kewajiban berpembayaran dibekukan otomatis sebelum hari diubah.
* **Alokasi**: identitas kewajiban = siswa + komponen + periode. Tidak ada alokasi otomatis berdasarkan kesamaan nominal. Alokasi tidak boleh melebihi sisa kewajiban; **kelebihan bayar tetap sebagai dana belum dialokasikan** di transaksi (tidak dilempar ke kewajiban lain).
* **Anggaran**: pemasukan wajib terhubung ke `komponenId` + unit + periode; pengeluaran wajib ke kategori (+ subkategori opsional) + unit + periode. Aktual pemasukan = **alokasi** ke komponen (bukan nominal transaksi); komitmen dan tagihan di kolom terpisah.

## 4. Perubahan skema (SEMUA aditif, di ujung header, butuh konfirmasi `TAMBAH_KOLOM_ADITIF`)

| Sheet | Kolom baru | Alasan |
|---|---|---|
| `02_KOMPONEN` | `sasaran`, `basisTarif`, `menggantikan` | Sasaran tagihan (BARU/DAFTAR_ULANG); dasar tarif per hari terjadwal; komponen lump yang digantikan rincian |
| `04_KEWAJIBAN` | `kelas`, `unit`, `tarifId`, `tarifSatuan`, `jumlahHari` (selain `jatuhTempo`, `tahunAjaran` yang sudah direncanakan) | Menyimpan tarif/hari/kelas yang dipakai saat kewajiban dibuat |
| `08_ANGGARAN` | `jenis`, `komponenId` (selain kolom aditif sebelumnya) | Anggaran pemasukan terhubung ke komponen penerimaan |

Tidak ada kolom dihapus/diurutkan ulang. `03_TARIF.status` sudah ada di sheet live. Klasifikasi pendaftaran dan hari katering disimpan sebagai **blob di `15_SETTINGS`** (tanpa sheet/kolom baru).

## 5. File yang berubah / dibuat (`MASTER_API_REFACTOR\`)

* **Diubah**: `Bendahara_V2.html` (dibangun ulang), `ObligationEngine.gs` (dihasilkan), `FinanceEngine.gs` (dihasilkan), `OperationalAPI.gs`, `RecordEngine.gs`, `AdminAPI.gs`, `ServerBridge.js` / `ServerBridge.html` (28 method `op*`, termasuk `opTarifPlan` dan `opTarifApply`).
* **Baru**: `TarifPlan.gs` (dihasilkan dari `_tarif_pure.js` + `_tarif_ops.gs.tpl`), `AllocationGuard.gs`.
* **Sumber blok (bukan untuk di-deploy)**: `_tarif_pure.js`, `_tarif_client.js`, `_fcc_budget.js`, `_obl_new.js`, `_central_block*.js`, `_fcc_pure.js`.
* **Build & tes**: `_build_tests\` (lihat `README.txt`).
* **Fungsi HTML yang diganti/ditambah**: `tarifFor`/`tarifRowFor`, `cateringHariFor`, `pendaftaranStatusFor`, `komponenSasaranOk`, `komponenDigantikan`, `kewajibanSatuBaris`, `kewajibanForSiswa`, `resolveObligationMatch`, `validateAllocationBatch`, `createAlokasi` (cek batch), `submitGenerateTagihan`, `openAnggaranForm`/`submitAnggaran`/`anggaranValidate_`, `studentFreezeBeforeChange_`, `freezeObligationsFor_`, `tpSpec_`/`tpCompute_`/`tpImpact_`, `pdTarifPlan`/`pdTarifApply`, `pdCateringSave`, `pdKlasifikasiSave`, `renderPengaturanTarifKewajiban`, `fccBudgetVsActual_`, `renderAnggaranBanding`, `centralVerifyObligations` (diperluas), Store: `loadCateringHari`/`savePendaftaranStatus` dst.
* **Fungsi server baru**: `opTarifPlan`, `opTarifApply`, `oblSnapshotCore_`, `opObligationSnapshot(periode, opts)`, `opAllocGuard_`.

## 6. Hal yang perlu konfirmasi manusia (dihasilkan juga di aplikasi, panel "Lihat rencana")

1. **Komite kelas 1**: tidak ada di sheet XLSX kelas 1, tetapi ada terpisah di PDF (Pendidikan 2.080.000 + Komite 120.000 = Biaya Tahunan 2.200.000). Ditambahkan dari PDF.
2. **Magang kelas 6**: tidak ada di sheet kelas 6 (kelas 1-5 = 100.000). Tidak ditagihkan.
3. **Isi Buku Paket** berbeda antar kelas (nominal berbeda); dicatat satu komponen.
4. **Katering**: PDF mencantumkan 250.000/bulan, aturan Bendahara per hari terjadwal. Aturan per hari dipakai; **hari terjadwal per bulan wajib diisi**.
5. **Nomor urut PDF** melompat (Biaya Awal 1,2,3,5,6,7; Tahunan 1,3). Jumlah tetap cocok total; pastikan tidak ada baris terlewat.
6. **Pendaftar baru MI kelas 2-6 (pindahan)**: sumber tidak memuat tarif; tidak ditagih.
7. **Diskon pembangunan** tidak diterapkan.
8. **Klasifikasi siswa** BARU / DAFTAR_ULANG wajib diisi per tahun ajaran sebelum biaya masuk/daftar ulang muncul.
9. **Tagihan lump yang sudah berpembayaran** (mis. kelas 3: dibayar 1.800.000 terhadap lump 2.080.000) dibekukan apa adanya, sehingga tampak **sisa 280.000** padahal sumber menyatakan total kelas 3 = 1.800.000. Kode **tidak** menghapusnya atau mengarang koreksi; perlu keputusan: nyatakan lunas, atau terbitkan koreksi manual.
10. Catatan sumber "belum termasuk SPP dan Catering Juli": SPP/katering Juli tetap kewajiban bulanan terpisah.

## 7. Rencana migrasi & laporan dampak (urutan, semuanya eksplisit)

1. Backup (Pengaturan > Export Backup) dan, di Google Sheets, buat salinan spreadsheet.
2. Deploy file `.gs` baru/diubah dan `ServerBridge.html` + `Bendahara_V2.html`; otorisasi ulang bila diminta.
3. Pengaturan > Pusat Data > **Skema Sheet > Lihat rencana** lalu **Terapkan migrasi aditif**.
4. Pengaturan > **Tarif & Kewajiban > Lihat rencana & dampak** (dry-run; tidak menulis). Baca tabel dampak per kelas, daftar tarif yang dinonaktifkan, alokasi yang menempel pada lump, dan butir konfirmasi.
5. Isi keputusan butir konfirmasi 1-9 di atas.
6. **Terapkan rencana tarif**: urutan di server = bekukan kewajiban berpembayaran, tambah komponen, tambah tarif, nonaktifkan lump. Tiap langkah idempoten; bila terhenti, jalankan ulang.
7. Isi **Hari Katering Terjadwal** untuk Juli s.d. bulan aktif; isi **Klasifikasi Pendaftaran**.
8. Jalankan **Verifikasi kewajiban (klien vs server)** dan **Verifikasi FCC**; harus COCOK.
9. Opsional: **Bekukan semua kewajiban saat ini** untuk mengunci riwayat bulan lalu.

Perkiraan dampak yang sudah bisa dipastikan dari data live yang dibaca:
* 6 tarif lump 2026/2027 dinonaktifkan: Biaya Awal TK 3.000.000; Daftar Ulang TK 1.450.000; Biaya Awal MI K1 4.350.000; Pendidikan MI 2.080.000 (semua kelas); Komite MI 120.000; Catering MI 250.000.
* Alokasi historis pada lump (contoh yang terlihat: `kmp_pendidikan` TA 2026/2027, `kmp_biayaawal` TK) akan dibekukan, bukan diubah.
* Jumlah siswa per kelas terdampak ditampilkan saat dry-run (bergantung data siswa live).

## 8. Hasil uji statis (sandbox; kode GAS dan skrip HTML asli, mock Sheets, seed mirip live)

| Rangkaian | Hasil |
|---|---|
| `server_pass2.js` (server, regresi + file baru) | 58 / 58 PASS |
| `e2e_central2.js` (regresi UI -> server) | 80 / 80 PASS |
| `tarif_server_tests.js` (tarif, kewajiban, alokasi, invarian acak) | 48 / 48 PASS |
| `tarif_client_tests.js` (UI -> server, anggaran, mode lokal) | 40 / 40 PASS |

Yang diuji antara lain: total sumber = jumlah komponen (dan deteksi selisih); dry-run tidak menulis; penerapan idempoten dan tidak menghapus/menimpa; kewajiban beku tidak berubah saat tarif/hari berubah; naik kelas/TA; pembayaran sebagian, gabungan, berlebih, replay, reversal; nominal sama pada komponen berbeda tidak otomatis cocok; **120 operasi acak** dengan invarian (alokasi aktif <= pembayaran; sisa dana >= 0; terbayar <= netto; tidak ada ID ganda/alokasi yatim); klien = server (kewajiban, FCC); mode lokal; anggaran terhubung komponen/kategori; guard server menolak alokasi tak valid.

Yang **tidak** bisa diuji di sandbox: perilaku Apps Script/Sheets sungguhan (kuota, waktu eksekusi, tipe sel nyata), tampilan visual HTML di browser, dan data siswa/pembayaran produksi.

## 9. Checklist uji live (NEEDS LIVE TEST)

Awali dengan salinan spreadsheet dan backup JSON. Pakai `clientRequestId` berawalan `TEST_` bila memungkinkan, dan akun BENDAHARA.

- [ ] Deploy dan buka aplikasi; badge menunjukkan 14/14 sheet termuat, tidak ada galat render.
- [ ] `pdSchemaPlan` menampilkan kolom baru (`02_KOMPONEN`: 3, `04_KEWAJIBAN`: 7, `08_ANGGARAN`: 11 termasuk `jenis`/`komponenId`); `pdSchemaApply` menambahkannya di ujung header, data lama utuh.
- [ ] **Lihat rencana & dampak**: angka sesuai harapan; tidak ada baris sheet berubah (cek riwayat versi sheet).
- [ ] Terapkan rencana: 31 komponen baru, tarif baru, 6 tarif lump `Nonaktif`; `04_KEWAJIBAN` berisi baris beku untuk siswa yang sudah membayar lump; `06_ALOKASI` dan `05_TRANSAKSI` tidak berubah.
- [ ] Jalankan terapkan **dua kali**: kedua kali tidak ada baris baru.
- [ ] Siswa kelas 3 yang sudah membayar lump: tagihan lump beku tampil; **tidak** ada tagihan rincian ganda.
- [ ] Siswa kelas 4/5 tanpa pembayaran lump: jumlah rincian tahunan = 1.800.000; kelas 6 = 1.700.000; kelas 1-2 = 2.200.000.
- [ ] SPP: K1 350.000, K2 300.000, K3-6 250.000, TK 200.000, per bulan.
- [ ] Isi hari katering satu bulan: K1 = hari x 13.000, K5 = hari x 11.000; kosongkan bulan lain: tidak ada tagihan katering bulan itu.
- [ ] Klasifikasikan satu siswa TK sebagai BARU: 7 komponen 3.000.000; sebagai DAFTAR_ULANG: 5 komponen 1.450.000; siswa tanpa klasifikasi: tidak ada.
- [ ] Pembayaran uji (TEST_): sebagian, gabungan 3 komponen, melebihi sisa (harus ditolak), replay request yang sama (tidak ganda), arsip alokasi lalu alokasi ulang.
- [ ] Ubah tarif SPP uji pada salinan: periode yang sudah beku tidak berubah; periode baru memakai tarif baru.
- [ ] Ubah hari katering setelah snapshot: kewajiban beku tetap.
- [ ] Edit data siswa (nomor telepon) pada siswa dengan TA lama: kewajiban TA lama dibekukan otomatis; tidak lenyap.
- [ ] Anggaran: buat satu pemasukan (komponen SPP, unit MI) dan satu pengeluaran (kategori+subkategori); validasi menolak input tidak lengkap; tab "Anggaran vs Aktual" dan Financial Control Center menampilkan angka; tombol verifikasi FCC = "Cocok".
- [ ] **Verifikasi kewajiban (klien vs server)**: COCOK, 0 perbedaan pada data nyata.
- [ ] Ukur waktu: pembayaran gabungan, `opTarifApply`, verifikasi kewajiban, dan sinkron massal (guard memuat konteks per permintaan beralokasi).
- [ ] Batas kuota: pastikan tidak ada batas waktu eksekusi Apps Script terlampaui pada `oblSnapshotCore_` dengan seluruh siswa.

## 10. Keterbatasan dan keputusan terbuka

* Guard server mencerminkan UI: **tidak ada pembayaran di muka melewati periode aktif** (periode berikutnya belum menjadi kewajiban). Kelebihan bayar disimpan sebagai dana belum dialokasikan, bukan kredit otomatis. Bila perlu pembayaran di muka, itu perlu keputusan terpisah.
* Guard memuat konteks sheet per permintaan beralokasi (kuota Apps Script belum diukur). Kill switch: `OP_ALLOC_GUARD_ENABLED_` di `AllocationGuard.gs` (jangan dimatikan tanpa alasan).
* `opTarifApply` memakai beberapa langkah yang masing-masing mengunci sendiri (Apps Script tidak re-entrant), jadi tidak satu transaksi atomik; aman diulang.
* Pembekuan memakai potongan/keringanan saat itu; keringanan yang ditetapkan sesudahnya tidak mengubah kewajiban beku (perilaku snapshot lama dipertahankan).
* Tarif belum punya "berlaku mulai": perubahan tarif hanya aman lewat pembekuan. Tarif tidak dipecah per bulan di dalam satu tahun ajaran.
* Perubahan kelas/TA siswa di luar UI (impor, edit sheet langsung) tidak membekukan otomatis; jalankan "Bekukan semua kewajiban" sebelum operasi seperti itu.
* Tab Realisasi/Sisa lama dibiarkan (mencampur istilah program/kategori); gunakan tab "Anggaran vs Aktual".
* Pendaftar baru MI kelas 2-6 dan daftar ulang MI belum punya tarif di sumber; tidak ditagih.
