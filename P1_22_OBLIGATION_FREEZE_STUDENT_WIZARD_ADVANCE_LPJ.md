# P1_22 — Obligation Freeze, Student Wizard, Advance & LPJ (TK/MI Darul Arifin)

**Tanggal:** 20 Oktober 2026

**Status:**
- Audit + prototipe (sandbox): **READY_FOR_REVIEW**.
- Implementasi D-1 (jalur koreksi / penguncian): **ditahan**, karena identitas kewajiban belum konsisten (§2).
- Uji integrasi live: **BLOCKED**. Belum ada salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji, maupun folder bukti uji.

Semua hasil adalah **uji sandbox Node**, bukan uji integrasi Apps Script. Tidak ada deployment. Produksi tidak disentuh. Tidak ada migrasi dan tidak ada data historis yang diubah.

---

## 1. Branch, HEAD, baseline

| Hal | Nilai |
|---|---|
| Repo / branch | `apapunitubahagia-lang/bendaharaTKMI`, `claude/compassionate-dirac-drm760` (sama dengan `origin`) |
| HEAD awal | `e987aa8` (dokumen P1_21) — sesuai laporan; working tree bersih |
| Ketersediaan commit | Semua commit P1_20 (`c0a8438`, `cbca39f`, `60bddec`, `301c322`, `0164908`, `6f3c6ba`, termasuk `fef06cc` P1_19) dan P1_21 (`fe28b80` … `e987aa8`) terverifikasi sebagai leluhur HEAD (`git merge-base --is-ancestor`) |
| Baseline (`build_all.js` deterministik, tanpa perubahan berkas terlacak) | 32 suite, **633 PASS / 0 FAIL / 59 INFO**, sama dengan P1_21 |
| HEAD akhir | commit dokumen ini, di atas `2d44a37` |

## 2. D-1 — Kewajiban beku: audit identitas (implementasi DITAHAN)

### 2.1 Identitas kanonis: server vs klien

| Aspek | Server | Klien | Konsisten? |
|---|---|---|---|
| Kunci | `siswaId\|komponenId\|periode` | `siswaId` + **nama** komponen + periode (`kewajibanSatuBaris`: `t.komponen===komponen.nama`; baris server dikonversi `komponenId→nama`) | **Tidak**: dua komponen bernama sama tercampur (ID-04) |
| Id baris beku | `kw_<oblHash_(kunci)>` (`oblSnapshotCore_`) | `uid('tagihan')` acak (`tagihanSnapshotRow_`: `freezeObligationsFor_`, terbitkan tagihan, katering, klasifikasi pendaftaran, pindah TA) | **Tidak** |
| Definisi "beku" | `tagihanId` terisi & `archivedAt` kosong | Sama: `ccFromRow_` butuh `tagihanId`; baris terarsip disaring di `ccSrv_` | Ya. **Koreksi P1_21 §5.2:** klien *memang* menyaring arsip, di `ccSrv_` |
| Keunikan per kunci | Tidak ada pengaman (RecordGuard `kewajiban` hanya memeriksa `periode`) | Cek berbasis cache lokal | **Tidak** |
| Hubungan alokasi | `resolveObligationMatch`: `tagihanId` sama **atau** kunci sama | Sama (kode bersama) | Ya, tetapi ambigu bila ada duplikat |
| Status "dibayar" | Tidak tersimpan; dihitung dari alokasi saat dibaca | Sama | Ya |

### 2.2 Jalur yang menghasilkan duplikat

**ID-03 (terbukti di sandbox):** server membekukan (`opObligationSnapshot`) sementara cache 04 di klien basi. Klien kemudian menjalankan `freezeObligationsFor_`, dan terbentuk **baris beku kedua** dengan id acak untuk kunci yang sama. Server menerimanya.

Jalur lain:
- `opRecordBatch('kewajiban')` langsung;
- terbitkan tagihan dengan cache basi (pengecekan memakai nama komponen).

Bila duplikat ada, `kewajibanForSiswa` memakai baris yang **pertama ditemukan** dan menyembunyikan sisanya (ID-07). Nilai yang tampil bergantung pada urutan baris, bukan pada aturan.

### 2.3 API/batch yang dapat menimpa kewajiban beku

| Jalur | Akibat |
|---|---|
| `opRecordBatch('kewajiban')` upsert (publik, BENDAHARA) | Menimpa netto/bruto/potongan tanpa alasan (P1_21 D1-04/05) |
| `opRecordBatch('kewajiban')` archive (alasan opsional) | Kewajiban berpembayaran kembali tidak beku dan dihitung ulang dari tarif baru (D1-06, ID-05) |
| Klien `ccSave_` koleksi tagihan | Mengirim upsert **tanpa `expect`** untuk koleksi custom, dan mengarsipkan baris yang "hilang" dari array yang disimpan. Restore/reset diblokir di UI mode pusat, tetapi `confirmDoRestore` belum dijaga bila dipanggil dari konsol |
| `oblSnapshotCore_` / `opTarifApply` | Tidak menimpa baris beku (aman; D1-03, ID-08) |
| `opMasterBatch('tarif')` | Hanya memengaruhi kewajiban **belum** beku (ST-01) |

### 2.4 Alat audit (baru, baca-saja): `opKewajibanBekuAudit()` — `KewajibanBekuAudit.gs`

- **Daftar pengecualian:** `DUPLIKAT_BEKU` (beserta netto berbeda/sama dan jumlah terbayar), `ID_TIDAK_KANONIS`, `TAGIHAN_ID_BEDA`, `KOMPONEN_TIDAK_ADA`, `KOMPONEN_NAMA_GANDA`, `ARSIP_BERPEMBAYARAN`, `ALOKASI_TAGIHAN_TIDAK_DIKENAL`, `ALOKASI_MULTI_BEKU`.
- **Ringkasan:** jumlah beku, jumlah beku berpembayaran (yang dilindungi D-1), dan putusan `konsistensiData`.
- Tidak mengubah, mengarsip, atau menghapus apa pun.
- Uji `d1_identitas_tests`: 7 PASS, 2 INFO (ID-03, ID-07 adalah temuan).

### 2.5 Keputusan teknis

Identitas belum konsisten di kode (id acak klien, cocok-nama, tanpa keunikan kunci). Konsistensi data nyata juga belum dapat diperiksa karena tidak ada salinan sah. **Sesuai instruksi, jalur koreksi dan penguncian D-1 tidak diimplementasikan.**

**Rancangan urutan aktivasi** (masing-masing commit terpisah, butuh persetujuan):
1. Klien membekukan dengan id kanonis `kw_<hash(kunci)>` dan mencocokkan lewat `komponenId`. `ccSave_` untuk tagihan berhenti mengarsipkan baris yang hilang dari array.
2. Keunikan kunci di server: membuat baris beku kedua untuk kunci yang sama → `DUPLIKAT`. Baris lama dilaporkan, tidak dihapus.
3. Jalankan `opKewajibanBekuAudit` pada salinan sah. Tinjau setiap `DUPLIKAT_BEKU` / `ARSIP_BERPEMBAYARAN` secara manual.
4. Baru setelah itu:
   - **E5 (penguncian):** upsert/arsip baris beku berpembayaran → `KEWAJIBAN_BEKU_TERKUNCI`;
   - **E2:** bekukan dulu kewajiban berpembayaran sebelum `opMasterBatch('tarif')` mengubah nominal;
   - **`opKewajibanKoreksi`:** alasan wajib; before/after; identitas dan waktu dari server; `expect`; idempoten; tidak menyentuh 06.

## 3. D-4 — Wizard lama siswa: audit (TIDAK dinonaktifkan)

**Jalur penyimpanan lama:**
- `importWizardConfirmSiswa` → `commitSiswaRow` / `updateSiswaRow` → `centralMasterQueue_('siswa')` → `opMasterBatch` (validasi master server + tanggal F7).
- Hanya dapat dijangkau lewat konsol/uji. UI mengalihkan modul siswa ke Impor V2 (LI-01).

**Kesetaraan dengan Impor V2** (`d4_siswa_audit_tests`):

| Fungsi | Impor V2 | Bukti |
|---|---|---|
| Impor massal (setara M0/M1: 60 siswa, alamat, wali) | Ya, 1 panggilan commit | SW-01 |
| `tanggalMasuk` & `jenisKelamin` (setara T4B-15) + validasi tanggal | Ya | SW-02 |
| Pembaruan hanya-field-terisi, id tetap (setara `updateSiswaRow`) | Ya (mode "Tambah + Perbarui", perubahan yang memengaruhi kewajiban butuh persetujuan) | SW-03 |
| Kolom **`status`** (perubahan status massal: Nonaktif/Lulus) | **Tidak ada** | SW-04 (INFO) |
| Tahun ajaran | Lama: diisi TA aktif diam-diam. V2: keputusan eksplisit | SW-06 (INFO, bukan penghalang) |

**Keputusan:** pengganti belum lengkap karena kolom `status`. Wizard lama siswa **tetap aktif**; `e2e_central2` M0/M1 dan `t4b_tests` T4B-15 **tidak diubah** (SW-05 PASS memastikan `impLamaNonaktif_('siswa') = false`).

**Agar dapat dinonaktifkan:**
- tambahkan `status` ke `IMP_FIELDS_.siswa` beserta aturan validasi;
- perubahan status ke non-Aktif diperlakukan sebagai `UBAH_KEWAJIBAN` (menghentikan enumerasi kewajiban → butuh persetujuan);
- setelah itu M0/M1/T4B-15 diganti dengan uji setara Impor V2 (SW-01/02).

## 4. U-5 — RAB tidak berlaku surut: simulasi baca-saja

**`opRabTidakSurutSimulasi({periode?})`** di `RabPersetujuan.gs`, per periode:
- populasi transaksi PENGELUARAN;
- jumlah lulus BDS03-I03 dan BDS03-I05, **sekarang vs simulasi**;
- `BERUBAH_GAGAL`: transaksi bertanggal sebelum `disetujuiPada` RAB dasarnya;
- `TIDAK_DAPAT_DINILAI`: RAB tanpa metadata (`HISTORI_TIDAK_LENGKAP`), disajikan sebagai rentang (batas bawah = dianggap gagal, batas atas = dianggap lulus). Tanggal tidak dikarang.

**Contoh before/after (sandbox, ang_1 ATK MI September 2026; transaksi 05-09 Rp50.000):**

| Kasus | I03 sekarang → simulasi | I05 sekarang → simulasi | Uji |
|---|---|---|---|
| RAB disetujui 30-08 (sebelum transaksi) | 1/1 → 1/1 | 1/1 → 1/1 | US-01 |
| RAB disetujui 20-09 (sesudah transaksi) | 1/1 → **0/1** (BERUBAH_GAGAL) | 1/1 → **0/1** | US-02 |
| RAB lama tanpa metadata | 1/1 → **0–1/1** (TIDAK_DAPAT_DINILAI) | 1/1 → 0–1/1 | US-04 |
| Sesudah persetujuan, tetapi tertaut komitmen (09.transaksiId) | 1/1 → 0/1 | 1/1 → **1/1** (persetujuan di luar RAB) | US-05 |
| RAB belum disetujui | 0/1 → 0/1 | 0/1 → 0/1 | US-06 |

**Pemisahan dampak:**
- **Data:** tidak ada baris yang ditulis (US-03: seluruh sheet identik).
- **Pencocokan:** garis RAB tiap transaksi tidak berubah; hanya bendera "disetujui" yang disimulasikan. `opRabRealization` identik sebelum dan sesudah simulasi.
- **KPI:** formula, bobot, dan ambang tidak disentuh. Angka di atas adalah **masukan** (populasi/lulus), bukan skor.

**Rekomendasi untuk keputusan berikutnya:**
- Jalankan simulasi pada salinan sah.
- Bila banyak RAB berstatus `HISTORI_TIDAK_LENGKAP`, kebijakan tidak-berlaku-surut sebaiknya hanya diterapkan pada RAB yang disetujui **setelah** U-5 aktif (metadata ada). RAB lama tetap dinilai seperti sekarang dan diberi label.

## 5. D-T1 (opsi C) & D-LPJ — prototipe sandbox

**Berkas:** `UangMukaLpj.gs`. Belum di ServerBridge/UI; tidak dipanggil otomatis.

**Skema aditif** — hanya lewat `opUangMukaLpjPlan()` (baca-saja) lalu `opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ')` (BENDAHARA, audit lebih dulu, idempoten):

| Objek | Isi |
|---|---|
| `32_UANG_MUKA` | `id, kegiatan, rabId, unit, akunId, pelaksana, nominalCair, tanggalCair, transaksiCairId, status, alasanStatus, createdAt, createdBy, updatedAt, updatedBy` |
| `33_UANG_MUKA_KEMBALI` | `id, uangMukaId, transaksiId, nominal, tanggal, createdAt, createdBy` |
| `34_LPJ_TAUTAN` | `id, lpjId, transaksiId, status (AKTIF/DIBATALKAN), alasan, dibuatOleh, dibuatPada, dibatalkanOleh, dibatalkanPada, alasanBatal` |
| `19_LPJ` (+kolom di ujung) | `statusLpj, tanggalNota, tanggalDiterima, tanggalVerifikasi, diajukanOleh, diterimaOleh, diverifikasiOleh, alasanTolak, uangMukaId`. Makna `tanggal`/`status` lama **tidak diubah** |
| `05_TRANSAKSI` | **tidak diubah**. Sifat pencairan/pengembalian diketahui dari tautan 32/33 |

**Operasi** (satu `withLock_` per operasi, re-entrant; idempotensi deterministik):

| Operasi | Peran | Inti |
|---|---|---|
| `opUangMukaCair` | BENDAHARA | Transaksi PENGELUARAN kas (validasi engine: akun, kategori master, tanggal) + entitas `DICAIRKAN`. Id `um_<hash(crid)>`; retry = replay. Gagal tulis entitas → transaksi + idempotensinya di-rollback + audit `ROLLBACK_TRANSAKSI` |
| `opUangMukaKembali` | BENDAHARA | PENERIMAAN bertanda 33 (`sumber` "Pengembalian Uang Muka"). Ditolak bila melebihi sisa yang belum dipertanggungjawabkan (`MELEBIHI_SALDO`); rollback sama |
| `opLpjAjukan` | BENDAHARA | `''`/DITOLAK → DIAJUKAN. `tanggalNota` divalidasi server (kalender, bukan masa depan, ≥ tanggal cair). Σ LPJ + kembali ≤ uang muka. LPJ yang sudah bertaut transaksi tidak boleh mempertanggungjawabkan uang muka |
| `opLpjTerima` | BENDAHARA | DIAJUKAN → DITERIMA; `tanggalDiterima`/`diterimaOleh` dari server |
| `opLpjVerifikasi` | KEPALA_SEKOLAH / YAYASAN | DITERIMA → DIVERIFIKASI / DITOLAK (alasan ≥ 10). Pemeriksa ≠ pengaju/penerima. **NONAKTIF** (`UM_VERIFIKASI_AKTIF_ = false`) sampai GAP-005 & D-T7. Unggah bukti tidak mengubah status |
| `opLinkLpj` | BENDAHARA | Validasi: transaksi PENGELUARAN aktif, bukan transaksi pencairan, Σ LPJ ≤ nominal, `expect`. Beda unit/periode → `PERLU_PEMERIKSAAN` kecuali disertai alasan. Riwayat 34 + audit `LPJ_LINK` |
| `opCreateExpenseFromLpj` | BENDAHARA | Transaksi + tautan atomik. `clientRequestId` transaksi = `lpj:<lpjId>` (satu LPJ = satu transaksi, klik ganda = replay). Gagal tautan → rollback transaksi |
| `opUnlinkLpj` | BENDAHARA | Alasan ≥ 10, `expect`; riwayat 34 → DIBATALKAN (tidak dihapus); transaksi **tidak dihapus**. LPJ DIVERIFIKASI → `LPJ_TERVERIFIKASI` (butuh jalur koreksi) |
| `opUangMukaLaporan` | baca (semua peran) | Per uang muka: kas keluar, nota terverifikasi, nota belum terverifikasi, pengembalian, saldo, status turunan, dampak FCC/BDS03 |

**Status uang muka** (diturunkan dari posisi, satu aturan): DICAIRKAN → LPJ_DITERIMA → DIVERIFIKASI → SELESAI (saldo 0 & semua LPJ terverifikasi). Status tambahan **PERLU_PERBAIKAN** bila ada LPJ DITOLAK. Status `DIBATALKAN` belum dibuat (butuh keputusan).

**Lapis pelindung jalur lama** (`RecordEngine.gs`, 3 baris): `opRecordBatch('lpj')` publik:
- membuang kolom status/verifikasi/`uangMukaId` (UM-05);
- menolak perubahan tautan/arsip LPJ uang muka atau LPJ terverifikasi (`LPJ_TERKUNCI`, UM-11).

LPJ lama lainnya tetap berperilaku seperti sebelumnya.

**Hasil uji `um_lpj_tests`: 19 PASS, 1 INFO.**

| Aspek | Bukti |
|---|---|
| Skenario 2.000.000 / 1.700.000 / 300.000 → saldo 0, SELESAI | UM-05..09 |
| Kegagalan di tengah | UM-03, LK-02 |
| Retry / klik ganda | UM-02, UM-08, LK-01 |
| Duplikasi & batas | UM-13, LK-03 |
| Konkurensi (`expect`/CONFLICT, re-check di kunci) | LK-03, LK-04 |
| Satu LPJ tidak membuat dua pengeluaran | LK-01, LK-02 |
| Pencairan tidak dihitung dua kali sebagai biaya; nota uang muka tidak dapat menjadi transaksi | UM-09, UM-11, LK-05 |
| Pemisahan tugas | UM-06, UM-12 |
| Otorisasi server | UM-04, LK-06 |

**Dampak FCC/BDS03** (UM-10 INFO; formula tidak diubah):
- Saat ini pencairan Rp2.000.000 tercatat penuh sebagai pengeluaran aktual, dan pengembalian Rp300.000 sebagai penerimaan.
- Bila basis beban opsi C dipakai: pengeluaran 1.700.000 (selisih 300.000), dan pengembalian keluar dari penerimaan operasional. Ini **perubahan definisi KPI** yang butuh persetujuan terpisah.

**Belum:**
- Tombol klien "Buat Transaksi dari LPJ" masih memakai jalur P0-T1 (`opRecordBatch` + heuristik 62 hari) dan belum dialihkan ke `opCreateExpenseFromLpj`.
- Tidak ada UI uang muka.
- Verifikasi tetap nonaktif.

## 6. K-RAB-07 — Bukti & kewenangan (desain saja; tidak ada enforcement)

### Threat model

| Ancaman | Kontrol yang dirancang | Status |
|---|---|---|
| Pengeluaran tanpa bukti | Wajib ≥1 bukti jenis NOTA / KUITANSI / BUKTI_TRANSFER, format JPG/PNG/PDF (cek MIME + ekstensi di server) sebelum status SELESAI | **Desain**; P1-E sudah mewajibkan bukti berfile untuk SELESAI, tetapi jenis dan format belum dibedakan |
| Bukti dianggap persetujuan | Bukti (10_BUKTI) dan persetujuan (`31_PERSETUJUAN_PENGELUARAN`) adalah entitas terpisah; unggah tidak mengubah status persetujuan | Desain (prinsip sama sudah diuji untuk LPJ, UM-06) |
| Bendahara menyetujui dirinya | Penyetuju ≠ pembuat transaksi; peran penyetuju hanya KEPALA_SEKOLAH/YAYASAN; BENDAHARA tidak dapat memberi peran penyetuju (P0-T7) | Butuh GAP-005 + D-T7 |
| Identitas palsu dari klien | `disetujuiOleh`/`disetujuiPada` diisi dari sesi server (pola U-5) | Desain |
| Pengecualian tanpa bukti disalahgunakan | Pengecualian = persetujuan eksplisit beralasan + audit; jenis pengecualian **belum ditetapkan** | Butuh keputusan |
| Persetujuan dipakai ulang / dipindah | `transaksiId` unik aktif & immutable; batal = status DIBATALKAN beralasan | Desain |
| Pemecahan transaksi agar di bawah ambang | Deteksi agregat per penerima/periode (laporan baca-saja) | Desain; butuh ambang |

### Matriks kewenangan

Semua sel TBD harus ditetapkan pemilik sistem. Saya **tidak mengarang angka** apa pun.

| Tindakan | BENDAHARA | KEPALA_SEKOLAH | YAYASAN | AUDITOR |
|---|---|---|---|---|
| Mencatat pengeluaran & unggah bukti | Ya | Tidak | Tidak | Tidak |
| Menyetujui pengeluaran di luar RAB ≤ ambang A | Tidak | **TBD** | **TBD** | Tidak |
| Menyetujui pengeluaran di luar RAB > ambang A | Tidak | **TBD** | **TBD** | Tidak |
| Menyetujui pengecualian tanpa bukti | Tidak | **TBD** | **TBD** | Tidak |
| Mencabut persetujuan | Tidak | **TBD** (penyetuju asal?) | **TBD** | Tidak |
| Membaca persetujuan & audit | Ya | Ya | Ya | Ya |

### Keputusan yang masih dibutuhkan

- Nilai ambang A, dan apakah ada ambang B untuk Yayasan.
- Jenis pengecualian tanpa bukti yang diizinkan.
- Batas kewenangan Kepala Sekolah vs Yayasan per kategori/nominal.
- Siapa yang boleh mencabut persetujuan.
- Apakah BDS03-I05 dihitung dari `31_PERSETUJUAN_PENGELUARAN` menggantikan tautan `09_KOMITMEN` (perubahan masukan KPI).
- Batas waktu persetujuan susulan.

## 7. D-IMP-8 & U-1

Tidak ada perubahan. Audit tetap baca-saja: `opSiswaMasterAudit` (P1_21) dan `opAlokasiLintasPeriodeAudit` (P1_21). Belum dijalankan pada data uji yang disetujui karena tidak ada salinan sah. Tidak ada normalisasi. `PERIOD_MISMATCH` tidak diaktifkan.

## 8. Commit, file, dan fungsi yang berubah

| Commit | Ringkasan | File / fungsi |
|---|---|---|
| `c2e11ea` | D-1 audit identitas | **baru** `KewajibanBekuAudit.gs` (`opKewajibanBekuAudit`); uji `d1_identitas_tests.js`; `srv_env.js`, `run_all_tests.js` |
| `c026417` | D-4 siswa audit kesetaraan; wizard tetap aktif | uji `d4_siswa_audit_tests.js`; `run_all_tests.js` |
| `28c0fa5` | U-5 simulasi baca-saja | `RabPersetujuan.gs` (+`opRabTidakSurutSimulasi`); uji `u5_simulasi_tests.js` |
| `2d44a37` | D-T1 opsi C + D-LPJ prototipe | **baru** `UangMukaLpj.gs` (11 fungsi `op*` + helper `um*`); `RecordEngine.gs` (3 baris pelindung `lpj` publik); uji `um_lpj_tests.js` |
| (commit ini) | Laporan + log `p1_22` | `P1_22_*.md`, `_test_logs/p1_22_*.log` |

**Tidak berubah:**
- `Bendahara_V2.html`, `TransactionEngine.gs`, `FinanceEngine.gs`, `RabMapping.gs`, `ObligationEngine.gs`, `TarifPlan.gs`, `ReconEngine.gs`, `PeriodLock.gs`, `ServerBridge.*`;
- semua skrip `apply_*` dan uji lama.

Diff `e987aa8..2d44a37`: 10 berkas, +794 / −2. Dua baris yang dihapus adalah daftar suite/berkas server yang diperluas.

## 9. Hasil uji (sandbox; `node run_all_tests.js p1_22`, log `_test_logs/p1_22_*.log`)

| Suite | PASS | FAIL | INFO |
|---|---|---|---|
| 32 suite P1_21 (identik per suite dengan baseline) | 633 | 0 | 59 |
| d1_identitas_tests | 7 | 0 | 2 |
| d4_siswa_audit_tests | 4 | 0 | 2 |
| u5_simulasi_tests | 7 | 0 | 0 |
| um_lpj_tests | 19 | 0 | 1 |
| **Total (36 suite)** | **670** | **0** | **64** |

**Tidak ada uji lama yang diubah.**

Tiga FAIL sementara saat pengembangan semuanya kesalahan pada **uji baru**, bukan pada server:
- US-05: fixture menaruh kolom komitmen di posisi yang salah;
- UM-05: helper uji salah membaca hitungan `unchanged` batch.

Uji diperbaiki agar mengukur perilaku yang benar, bukan dilonggarkan.

## 10. Bukti tidak ada deployment / perubahan produksi; KPI & data historis

- Tidak ada `appsscript.json` / `.clasp.json` di repo. Tidak ada perintah clasp atau deploy yang dijalankan. Konektor Google Drive/Sheets sesi tidak dipakai. ID produksi tidak muncul di diff (0 kemunculan).
- **KPI:** `Bendahara_V2.html` (seluruh definisi 31 indikator, `indDef`, bobot, ambang) dan mesin FCC/RAB **tidak berubah**. Suite KPI/FCC (`p0_tests`, `rab_tests` diferensial BDS03, `audit_p1_tests`, `e2e_central2` F1/F2) lulus identik. Simulasi U-5 terbukti baca-saja (US-03).
- **544 TEREKONSILIASI:** tidak ada kode P1_22 yang menyentuh `16_REKONSILIASI` atau ReconEngine. Verifikasi ulang terhadap data nyata tidak mungkin tanpa salinan sah.
- **Data historis:**
  - semua audit baca-saja (ID-01, US-03, IMP8-01);
  - skema baru hanya lewat setup eksplisit di sandbox;
  - tidak ada baris yang dinormalisasi atau dihapus;
  - duplikat kewajiban hanya dilaporkan.

## 11. Rollback (diverifikasi di worktree terpisah)

| Uji rollback | Hasil |
|---|---|
| Revert semua commit P1_22 (urutan terbalik: `2d44a37`, `28c0fa5`, `c026417`, `c2e11ea`) | Tree **identik** dengan `e987aa8` (`git diff` kosong); build + uji **633/0/59** = baseline P1_21 |
| Lanjut rollback P1_21 sesuai laporan P1_21 §17 (`e987aa8`, `e816bac`, `4385a98`, `3fe85c5`, `a9529f8`, `ec53a8c`, `9515720`, `4dbb774`, `fe28b80`) | Tanpa konflik; tree **identik** dengan `6f3c6ba`; uji **587/0/50** = baseline P1_20 |
| Revert satu commit P1_22 secara terpisah dari HEAD | `2d44a37` (teratas): bersih, uji 651/0/63. `28c0fa5`, `c026417`, `c2e11ea`: **konflik hanya pada baris daftar suite** di `_build_tests/run_all_tests.js` (dan `srv_env.js` untuk `c2e11ea`). Selesaikan dengan menghapus nama suite/berkas commit tersebut dari daftar, atau revert berurutan dari atas |

**Perintah:**
```
git revert --no-edit <commit> [<commit> ...]   # urutan terbalik (terbaru lebih dulu)
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```

Tidak ada rollback data karena tidak ada data produksi yang diubah. Bila `opUangMukaLpjSetup` pernah dijalankan di salinan uji, sheet 32/33/34 dan kolom tambahan 19_LPJ tidak dibaca oleh kode lama dan boleh dibiarkan; hapus manual hanya di salinan.

## 12. Risiko yang belum selesai

| ID | Risiko |
|---|---|
| R-D1-a | Duplikat kewajiban beku dapat terbentuk lewat jalur klien basi (ID-03); nilai tampil bergantung urutan (ID-07) |
| R-D1-b | Kewajiban beku berpembayaran masih dapat ditimpa/diarsip lewat `opRecordBatch('kewajiban')` tanpa alasan |
| R-D1-c | `ccSave_` tagihan: tanpa `expect`, mengarsipkan baris yang hilang dari array; `confirmDoRestore` belum dijaga bila dipanggil dari konsol |
| R-D4 | Wizard lama siswa aktif (dependensi kolom `status`) |
| R-LPJ | Tombol klien "Buat Transaksi dari LPJ" masih jalur P0-T1 (heuristik 62 hari, tanpa riwayat 34) |
| R-UM | Prototipe belum terhubung UI/bridge; pencairan yang dicatat sebelum aktivasi tetap PENGELUARAN biasa (perilaku lama) |
| R-KPI | FCC/BDS03 masih menghitung pencairan sebagai beban dan pengembalian sebagai penerimaan |
| GAP-005 / D-T7 | Prasyarat semua verifikator/penyetuju; verifikasi LPJ & persetujuan tetap nonaktif |
| GAP-028 | Tetap BLOCKED (tidak dibutuhkan opsi C) |
| Live | Belum ada uji Apps Script nonproduksi |

## 13. Keputusan yang masih dibutuhkan dari pemilik sistem

1. **D-1:** setujui urutan §2.5. Langkah 1–2 mengubah perilaku klien/server pembekuan dan butuh persetujuan perilaku. Sediakan salinan sah untuk langkah 3.
2. **D-4 siswa:** tambahkan kolom `status` ke Impor V2 siswa (dengan persetujuan perubahan kewajiban), lalu nonaktifkan wizard lama?
3. **U-5:** setelah simulasi pada salinan sah, terapkan tidak-berlaku-surut hanya untuk RAB bermetadata? Ini perubahan masukan BDS03-I03/I05.
4. **D-T1:**
   - perubahan definisi pengeluaran aktual FCC/BDS03 ke basis beban terverifikasi;
   - status DIBATALKAN untuk uang muka;
   - jadwal integrasi UI/bridge.
5. **D-LPJ:** alihkan tombol "Buat Transaksi dari LPJ" ke `opCreateExpenseFromLpj` (pengganti heuristik 62 hari)?
6. **K-RAB-07:** isi semua TBD di §6 (ambang, pengecualian, kewenangan, pencabutan).
7. **Lingkungan uji:** salinan spreadsheet nonproduksi, proyek Apps Script uji, akun BENDAHARA / KEPALA_SEKOLAH / YAYASAN / AUDITOR uji, folder bukti uji.
