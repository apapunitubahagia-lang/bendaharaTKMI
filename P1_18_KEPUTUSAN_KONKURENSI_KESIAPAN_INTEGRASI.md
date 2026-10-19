# P1_18 — Keputusan Kelebihan Pembayaran, Konkurensi Impor, Akun Eksplisit, Daftar Kewajiban, Kesiapan Integrasi

**Tanggal:** 19 Oktober 2026
**Acuan:** P1_17, HEAD `f9dba08`. Diverifikasi sebelum perubahan: branch `claude/trusting-keller-84usce`, HEAD = `origin/claude/trusting-keller-84usce` = `f9dba08`, working tree bersih.
**Status akhir: `BLOCKED`** untuk uji integrasi live (prasyarat lingkungan nonproduksi tidak tersedia di sesi ini, lihat §6). Kode tetap pada tingkat `READY_FOR_INTEGRATION_TEST`; **tidak ada uji live yang dijalankan**.

Tidak ada deploy, tidak ada akses ke spreadsheet/folder produksi, tidak ada migrasi otomatis, data historis dan 544 TEREKONSILIASI tidak disentuh, formula/bobot/target/ambang KPI tidak diubah (T4B-05 KPI-DIFF tetap identik), transfer antar-akun tetap diblokir, tidak ada status LPJ baru / fungsi tautan LPJ / model uang muka.

## 1. Commit dan file yang berubah

| Commit | Isi | File / fungsi |
|---|---|---|
| `49bcba5` | Keputusan 1 — kelebihan pembayaran | `_import_rules.js` (`impRowPemasukan_`: kode `KELEBIHAN_PEMBAYARAN`, `lebihBayar {nominalPembayaran, kewajibanTerpenuhi, kelebihanPembayaran}`), `ImportRules.gs` (dihasilkan), `_import_client.js` (ringkasan di pratinjau), `import_engine_tests.js` (IE-20 diubah, IE-20b baru) |
| `7d2f80a` | Prioritas A — konkurensi | `_build_tests/apply_imp_lock_server.js` → `TransactionEngine.gs` `withLock_` reentran (`LOCK_DEPTH_`); `ImportEngine.gs` `opImportCommit` satu kunci, `impConflict_`, `sidik` per baris; `_import_client.js` mengirim sidik & menampilkan alasan; `concurrency_tests.js` (baru); `_test_logs/audit_konkurensi_sebelum_f9dba08.log` |
| `e491259` | Prioritas C — daftar kewajiban | `KewajibanGuard.gs` (baru: `kgStatus_`, `kgErr_`, `kgThrowIfBad_`); `apply_kewajiban_guard_server.js` → `ObligationEngine.gs` (`opObligations`, `oblSnapshotCore_`), `TransactionEngine.gs` (`engineErrCode_`, `engineAllocStatusFor_`); `AllocationGuard.gs` (`opAllocGuard_`); `ImportEngine.gs` (`impContext_`); `apply_kewajiban_guard_client.js` (`kewajibanDataStatus_`, `centralSourcesStatus_`, Beranda, posisi/profil siswa, editor alokasi); `t4b_tests.js` (T4B-17 INFO→PASS, T4B-19..22) |
| `ffa52dd` | Prioritas B — akun eksplisit | `apply_akun_explicit_client.js` (form Penerimaan/Pengeluaran, wizard Pembayaran, Buat Transaksi dari Mutasi, wizard impor Mutasi Bank lama, antrean lama); `OperationalAPI.gs` `opEngineWrite_` (akunId wajib); `akun_explicit_tests.js` (baru) |
| (commit ini) | Dokumen P1_18, log `p1impB_*` | — |

## 2. Keputusan 1 — kelebihan pembayaran

**Pemeriksaan perilaku yang berlaku (sebelum perubahan):** tidak ditemukan nilai/alokasi yang salah, sehingga tidak ada bagian yang dihentikan.
- Nominal transaksi = nilai pembayaran (engine menulis `payload.nominal`).
- Alokasi hanya ke kewajiban yang ada; kewajiban dienumerasi sampai `periodeAktif` (tidak ada periode berikutnya). Σ alokasi ≤ sisa (AllocationGuard).
- Sisa dana tetap di transaksi; status dihitung server (`engineAllocStatusFor_`): `OVERPAYMENT_CREDIT` bila siswa tidak punya sisa kewajiban lain, `SEBAGIAN_TERALOKASI` bila masih ada komponen lain, `TERIDENTIFIKASI` bila tidak ada alokasi.
- Satu-satunya ketidaksesuaian dengan Keputusan 1: P1_17 **menolak** pembayaran yang seluruhnya lebih bayar (kewajiban sudah lunas). Ini diubah.

**Perilaku sekarang:** kewajiban ada tetapi sisa tidak cukup/lunas → `PERINGATAN KELEBIHAN_PEMBAYARAN` dengan pembayaran, kewajiban terpenuhi, dan kelebihan terpisah; status engine disebut dalam pesan. Kewajiban tidak ada sama sekali (tanpa tarif, periode eksplisit setelah periode aktif) tetap `TOLAK` (D-IMP-4). Kebijakan & formula kewajiban tidak diubah.

| Tes | Hasil |
|---|---|
| IE-20 (**ekspektasi diubah atas permintaan eksplisit**; sebelumnya lunas penuh = TOLAK) | 60.000 vs sisa 50.000 → terpenuhi 50.000 (September), kelebihan 10.000, status `OVERPAYMENT_CREDIT`; 10.000 saat lunas → disimpan tanpa alokasi, status `TERIDENTIFIKASI` |
| IE-20b (baru) | tanpa tarif → TOLAK; periode eksplisit Agustus 900.000 → hanya 200.000 ke Agustus, kelebihan 700.000 tidak berpindah periode; Desember (setelah periode aktif) → TOLAK |

## 3. Prioritas A — audit konkurensi

**Audit sebelum perubahan (HEAD `f9dba08`, log `_test_logs/audit_konkurensi_sebelum_f9dba08.log`):** 5 PASS, 3 FAIL.
- **CC-03 (celah nyata): transaksi GANDA.** `opImportCommit` memeriksa planHash di dalam kunci lalu **melepas kunci** sebelum menulis transaksi per baris (setiap baris mengambil kunci engine sendiri). Pengguna B yang commit di sela itu menyimpan transaksi yang sama → 2 transaksi.
- CC-04: 5 pelepasan kunci antara pemeriksaan dan tulisan.
- CC-01: CONFLICT sudah terjadi tetapi tanpa alasan per baris.
- Sudah benar sejak awal: berkas identik (kunci baris sama → `TIDAK_BERUBAH`), kirim ulang, RAB (cek & tulis dalam satu kunci), sisa kewajiban berubah → CONFLICT.

**Perbaikan:** `withLock_` dibuat reentran per eksekusi (panggilan tunggal tidak berubah; global Apps Script bersifat per eksekusi). `opImportCommit` menjalankan hitung ulang pratinjau (duplikat terhadap server & berkas lain, perubahan data, sisa kewajiban, header), perbandingan planHash, tulisan lewat jalur yang ada (termasuk AllocationGuard yang kini berjalan di dalam kunci yang sama), serta log/audit dalam **satu** kunci. CONFLICT menyebut baris, kelas sekarang, kode, dan alasan.

**Hasil sesudah (`concurrency_tests`, kunci eksklusif antar-eksekusi disimulasikan): 8/8 PASS.**

| Tes | Skenario | Hasil |
|---|---|---|
| CC-01 | A & B pratinjau transaksi sama (berkas berbeda); A simpan; B commit pratinjau lama | B `CONFLICT`: "1 baris berubah sejak pratinjau: baris 1 -> DUPLIKAT (DUPLIKAT_DATA_SERVER, PERNAH_DIIMPOR_BERKAS_LAIN)…"; transaksi = 1 |
| CC-02 | berkas identik | B `TIDAK_BERUBAH`; transaksi = 1 |
| CC-03 | B commit saat A sudah lolos cek & sedang menulis | B `LOCK_TIMEOUT`; A selesai; B ulang `CONFLICT`; transaksi = 1 |
| CC-04 | jejak kunci | `acq, CEK, TULIS×5, rel` (0 pelepasan) |
| CC-05 | sisa kewajiban berubah (pembayaran lain) | `CONFLICT` "alokasi sekarang: kmp_spp Agustus 2026 200000"; alokasi tidak ditulis |
| CC-06 | kirim ulang (pengguna sama/lain) | `TERSIMPAN`, `TIDAK_BERUBAH`, `TIDAK_BERUBAH` |
| CC-07 | RAB dua pengguna | `CONFLICT`, garis RAB tidak ganda |
| CC-08 | jalur tulis biasa | kunci diambil & dilepas sekali, kedalaman kembali 0 |

**Konsekuensi:** satu potongan (≤ 20 transaksi) memegang kunci skrip selama penulisannya; pengguna lain yang menulis bersamaan dapat menerima `LOCK_TIMEOUT` (batas tunggu 10 detik) dan harus mengulang. Durasi nyata belum diukur.

## 4. Prioritas B — audit wizard/jalur lama (akun)

| Jalur | Fungsi (klien → server) | Kolom akun | Sebelum | Sekarang |
|---|---|---|---|---|
| Form Penerimaan | `penerimaanFormHtml` / `submitPenerimaan` → `postTransaksi` → `opCreateTxBatch`/`opCreateIncome` | `05_TRANSAKSI.akunId` | akun pertama terpilih di daftar | opsi kosong wajib + validasi |
| Form Pengeluaran | `pengeluaranFormHtml` / `submitPengeluaran` → `opCreateExpense` | `05_TRANSAKSI.akunId` | akun pertama terpilih | opsi kosong wajib + validasi |
| Wizard Pembayaran | `pw_akun` / validasi `akunId` sudah ada | `05_TRANSAKSI.akunId` | daftar tampil terpilih akun pertama | opsi kosong wajib |
| **Buat Transaksi dari Mutasi Bank** | `createTransaksiFromMutasi` → `opCreateIncome` (+ `opMatchMutasi`) | `05_TRANSAKSI.akunId` (11_MUTASI_BANK tidak punya kolom akun) | **akun Bank pertama otomatis** | akun Bank dipilih eksplisit; akun Kas ditolak |
| **Wizard impor Mutasi Bank (lama)** | `validateMutasiBankRow` / `commitMutasiBankRow` → `postTransaksi` | `05_TRANSAKSI.akunId` | **akun Bank pertama otomatis per baris** | satu akun Bank dipilih eksplisit per berkas; tanpa pilihan → tidak ada pratinjau |
| Antrean impor lama (localStorage) mutasi bank | `resolveImportQueue*` → `commitMutasiBankRow` | — | akun Bank pertama | item tanpa akun pilihan diblokir |
| Wizard RKAT (lama) | `commitRkatRow` → `opRecordBatch('rkat')` → `18_RKAT` | tidak ada kolom akun; tidak membuat transaksi | — | tidak terdampak (AK-07) |
| Impor V2 (5 modul) | `opImportPlan/Commit` | `akunId` | tanpa default (P1_17) | tetap |
| Server | `opEngineWrite_` (CREATE_INCOME/EXPENSE) | `akunId` | boleh kosong | **wajib** (`VALIDATION_ERROR`) |
| Wizard impor Pemasukan/Pengeluaran **lama** | `commitPenerimaanRow`/`commitPengeluaranRow` | `akunId` | akun pertama | **tidak diubah**: tidak terjangkau dari UI (routing V2 + blokir antrean, IC-01/IC-10). Mengubahnya akan mengubah tes karakterisasi lama IA-03..06/10 — perlu persetujuan |
| Migrasi V1→V2 lokal (`migrateV1ToV2`, saat boot) | localStorage | `akunId` | akun pertama | **tidak diubah** (migrasi data historis); dilaporkan sebagai risiko R-5 |

Tes `akun_explicit_tests`: 6 PASS + 1 INFO.

## 5. Prioritas C — pengamanan daftar kewajiban

| Keadaan | Server (`opObligations`, snapshot, AllocationGuard, status alokasi, impor) | Klien (`kewajibanDataStatus_`) |
|---|---|---|
| Periode valid, kewajiban nol | `ok`, `rows: []`, `statusData: 'LENGKAP'` | angka ditampilkan (nol yang sah) |
| Periode tidak valid (mis. `2026-10-01`) | `PERIODE_AKTIF_TIDAK_VALID` | DATA TIDAK TERSEDIA |
| Sumber tidak tersedia (sheet hilang) | `SUMBER_TIDAK_TERSEDIA` | `SUMBER_TIDAK_TERSEDIA` (belum termuat / gagal baca) |
| Sumber tidak lengkap (kolom wajib hilang) | `SCHEMA_MISMATCH` + `statusData: 'SUMBER_TIDAK_LENGKAP'` | `SUMBER_TIDAK_LENGKAP` (SCHEMA_MISMATCH / PARTIAL_READ) |

Tampilan yang digerbang: Beranda (kartu Penerimaan Siswa), posisi siswa, profil siswa (ringkasan & kewajiban), editor alokasi, laporan/ekspor tagihan/tunggakan/siswa. Status alokasi sebagian (`engineAllocStatusFor_`) gagal tertutup, sehingga **arsip alokasi yang menyisakan alokasi sebagian ditolak** selama periode tidak valid (T4B-20) — operator harus menormalisasi periode lebih dulu. Tes: T4B-17, T4B-19..22 PASS.

## 6. Prioritas D — uji integrasi nonproduksi: BLOCKED

Pemeriksaan prasyarat di sesi ini:

| Prasyarat | Hasil |
|---|---|
| Akun uji tanpa akses ke spreadsheet produksi | **Tidak tersedia.** Satu-satunya identitas Google di sesi ini adalah konektor milik pengguna, yang kemungkinan besar memiliki akses produksi; tidak dipakai. |
| Spreadsheet uji dengan ID berbeda dari produksi | **Tidak diberikan.** ID salinan uji tidak ada di repo/permintaan. |
| Folder bukti uji terpisah | **Tidak dapat diverifikasi** (folder dicari berdasarkan nama — GAP-005). |
| Script Property menunjuk ke spreadsheet uji | **Tidak dapat diverifikasi**: tidak ada proyek Apps Script uji, `clasp`/kredensial Apps Script tidak tersedia. |
| Tidak ada setup/migrasi otomatis ke produksi | Dari sisi kode: terpenuhi (semua setup eksplisit: `opImportSetup`, `opSchemaApply`, `opPeriodeAktifApply`). Konfigurasi deploy (executeAs/access) tetap belum ada di repo (GAP-005). |

Karena prasyarat tidak terpenuhi, **tidak ada** uji 10/50/100/500 baris, XLSX/CSV, putus koneksi, dua pengguna, perubahan header, atau rekonsiliasi yang dijalankan di Apps Script. Laporan wajib 5–8:

| Butir | Hasil |
|---|---|
| 5. Hasil tes integrasi nonproduksi | **Tidak dijalankan** (BLOCKED). |
| 6. Waktu & kuota Apps Script | **Tidak terukur.** Hanya angka sandbox Node (P1_17 §6), bukan Apps Script. |
| 7. Jumlah baris sebelum/sesudah | Live: tidak ada. Sandbox: IE-31 (tersimpan = dipilih; impor ulang 0 baru; sheet lain identik). |
| 8. Perbandingan 544 TEREKONSILIASI | **Tidak dapat dibandingkan** tanpa salinan data. Sandbox: `16_REKONSILIASI` identik sebelum/sesudah impor (IE-31). |

**Yang dibutuhkan untuk membuka blokir:** (1) salinan spreadsheet nonproduksi + ID-nya; (2) proyek Apps Script terikat salinan itu dengan Script Property konfirmasi (P1_15 §2–3); (3) dua akun uji (BENDAHARA, AUDITOR) yang tidak punya akses ke spreadsheet & folder bukti produksi; (4) folder bukti uji dengan nama berbeda dari produksi; (5) cara menjalankan (pengguna menjalankan harness `_live_tests/LiveReadiness.gs` dan wizard, atau kredensial `clasp` khusus salinan). Daftar uji live tetap seperti P1_17 §13, ditambah: dua pengguna commit bersamaan → satu `LOCK_TIMEOUT`/`CONFLICT`, 0 ganda; durasi kunci per potongan 20 transaksi.

## 7. Hasil tes (sandbox, `run_all_tests.js p1impB`, log `_test_logs/p1impB_*.log`)

17 suite: **533 PASS, 0 FAIL, 42 INFO** (sebelumnya 15 suite, 513/0/42).
- Baru: `concurrency_tests` 8/0/0, `akun_explicit_tests` 6/0/1.
- Berubah: `t4b_tests` 22/0/0 (T4B-17 INFO → PASS: temuan "daftar kosong" kini dikontrol; +4 tes), `import_engine_tests` 36/0/0 (IE-20 ekspektasi diubah sesuai Keputusan 1; +IE-20b).
- Tes lama lainnya tidak diubah; seluruhnya tetap lulus.

## 8. Risiko yang belum terselesaikan

| ID | Risiko |
|---|---|
| R-1 | Waktu eksekusi, kuota, dan durasi kunci di Apps Script belum diukur (live BLOCKED). Kunci dipegang selama satu potongan; pengguna lain bisa `LOCK_TIMEOUT`. |
| R-2 | Reentransi kunci memakai variabel global per eksekusi; perilaku `LockService` nyata (bersarang) tidak lagi diandalkan, tetapi tetap harus diverifikasi live. |
| R-3 | Jalur tulis **non-impor** (form/wizard): `opAllocGuard_` dijalankan sebelum kunci engine (`opEngineWrite_`) — dua pembayaran bersamaan untuk kewajiban yang sama masih dapat melebihi sisa. Ini sudah ada sebelum tahap ini; perbaikannya (memindahkan guard ke dalam kunci) menyentuh semua penulisan transaksi dan perlu persetujuan. |
| R-4 | Selama periode aktif tidak valid, arsip alokasi yang menyisakan alokasi sebagian ditolak (gagal tertutup). |
| R-5 | `migrateV1ToV2` (boot, lokal) masih memberi akun pertama pada transaksi hasil migrasi V1; wizard impor pemasukan/pengeluaran lama masih memiliki default (tidak terjangkau dari UI). Perlu keputusan penghapusan + penyesuaian tes IA. |
| R-6 | GAP-005 (konfigurasi deploy & jenis akun) masih terbuka; menghalangi verifikasi isolasi akun uji. |
| R-7 | Klien: komponen lain yang menghitung kewajiban (mis. rencana alokasi di wizard pembayaran) belum seluruhnya digerbang; server sudah menolak alokasi saat periode tidak valid. |

## 9. Status akhir

**`BLOCKED`** — uji integrasi nonproduksi tidak dapat dijalankan karena prasyarat lingkungan (§6) tidak tersedia. Tidak ada klaim bahwa integrasi berhasil. Setelah prasyarat tersedia, kode ini siap diuji pada tingkat `READY_FOR_INTEGRATION_TEST`.
