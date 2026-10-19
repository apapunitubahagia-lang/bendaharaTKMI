# 07 — Rancangan Test Case

> Semua test **dijalankan pada SALINAN spreadsheet** (lingkungan uji/preview), **bukan produksi**.
>
> Setiap test case memuat kondisi awal, langkah, hasil yang diharapkan, prioritas, dan GAP terkait. Test case ini adalah rancangan dan belum dijalankan.
>
> **Data uji standar ("DU")**
> - Salinan backend FINAL setelah kolom aditif ditambahkan.
> - Siswa uji: `SIS-T01` (MI kelas 1, tanpa keringanan) dan `SIS-T02` (MI kelas 3, keringanan saudara).
> - Akun: `akun_bank_bsi_mi` dengan saldoAwal 10.000.000 (nilai uji) dan `akun_kas1` dengan saldoAwal 1.000.000.
> - Periode aktif: "Oktober 2026".
> - Periode Juli–September berstatus TERKUNCI (sejak revisi 17-10-2026: **penanda administratif**, bukan penguncian pencatatan; lihat "Riwayat revisi").

## A. Header dan kontrak

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-HDR-01 | DU | Jalankan `opSchemaReport()` | 26 sheet berstatus MATCH atau EXTRA_COLUMNS yang terdokumentasi. Tidak ada MISSING_SHEET atau MISMATCH_MISSING_COLUMNS | P0 | 001, 016 |
| TC-HDR-02 | DU. Sisipkan satu kolom kosong di tengah `05_TRANSAKSI` (salinan) | `opGetTransactions({})` | Galat `SCHEMA_MISMATCH`. Data tidak bergeser | P0 | 002 |
| TC-HDR-03 | DU. Tukar urutan kolom `email`/`nama` di `26_USER_ACCESS` | Buka aplikasi dengan akun bendahara | Akses tetap benar, atau galat skema. **Tidak boleh** salah role | P0 | 002 |
| TC-HDR-04 | Impor `01_SISWA` Fase 1C apa adanya ke salinan kosong | `getStudents()` | Ditolak dengan `SCHEMA_MISMATCH`. Tidak boleh mengembalikan `nama` berisi NISN | P0 | 001, 002 |
| TC-HDR-05 | DU | `opSchemaPlan()` | `pendingSheets = 0` | P1 | 016 |
| TC-HDR-06 | DU | Periksa tipe `15_SETTINGS.periodeAktif` | Teks "Oktober 2026". Hasil `getSettings` cocok dengan regex label bulan | P0 | 008 |

## B. Relasi dan integritas

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-REL-01 | DU | Skrip cek FK: 06→05/01/02, 04→01/02, 03→02, 05→07, 11→05, 19→05, 09→08, 22→21 | 0 yatim | P0 | – |
| TC-REL-02 | DU | Bandingkan total dengan kontrol | Penerimaan Rp478.521.100, alokasi bertransaksi Rp478.521.100, pengeluaran laporan Rp96.256.917, siswa 358 | P0 | 001 |
| TC-REL-03 | DU | `createAllocation` dengan `siswaId` tidak ada | `INVALID_STUDENT`. Tidak ada baris baru | P1 | – |
| TC-REL-04 | DU | Arsipkan transaksi yang memiliki 2 alokasi | Transaksi dan kedua alokasi mendapat `archivedAt`. Muncul 3 baris audit. Kewajiban kembali menjadi belum dibayar | P1 | 016 |
| TC-REL-05 | DU | Kewajiban siswa keringanan Juli (beku) dibandingkan dengan `opObligations` | Netto sama, potongan dapat dibaca rinciannya | P0 | 010, 021 |
| TC-REL-06 | DU. Juli sudah beku | Ubah tarif SPP kelas 1 menjadi 400.000 | Kewajiban Juli tidak berubah. Kewajiban Oktober memakai tarif baru (bila belum beku) | P1 | 043 |

## C. CRUD dan validasi server

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-CRUD-01 | DU | `opCreateExpense` dengan nominal 0, tanggal "17/10/2026", unit "SD" | Masing-masing ditolak `VALIDATION_ERROR` dengan field yang benar | P0 | – |
| TC-CRUD-02 | DU. Transaksi impor (tanggal bertipe Date) | `opUpdateTransaction({id, status:'TERCATAT'})` tanpa field tanggal | `ok:true`. Sel status berubah. Tanggal tetap | P0 | 003 |
| TC-CRUD-03 | DU. Alokasi 200.000 + 350.000 pada transaksi 550.000 | `opUpdateTransaction({id, nominal:500000})` | Ditolak `ALLOCATION_EXCEEDS_TRANSACTION` | P1 | 012 |
| TC-CRUD-04 | DU | `opRecordUpsert('rekonsiliasi', {akunId:'tidak_ada', ...})` | `VALIDATION_ERROR` | P1 | 014 |
| TC-CRUD-05 | DU. Juli TERKUNCI | (a) `opCreateIncome` sah bertanggal 2026-07-15. (b) Ulangi (a) dengan penulisan `13_AUDIT_LOG` dibuat gagal. (c) Ulangi (a) dengan akun AUDITOR, dan dengan payload tidak valid (nominal 0). (d) `opPeriodLockStatus()` dan riwayat closing | (a) **Diterima.** Tanggal tetap 2026-07-15. Satu baris audit `CREATE_TRANSACTION` + satu baris `PERIODE_DITANDAI` (periode Juli 2026, status TERKUNCI) dengan timestamp sama dan aktor sama; respons memuat `periodeDitandai`. (b) Ditolak; **tidak ada** transaksi, catatan idempotensi, maupun baris audit/penanda yang tertinggal. (c) `ROLE_NOT_ALLOWED` / `VALIDATION_ERROR`; tidak ada baris baru. (d) Juli tetap TERKUNCI; nilai `periodeStatus.2026-07` dan riwayat closing tidak berubah. *(Direvisi 17-10-2026; ekspektasi lama `PERIOD_LOCKED` dicabut. Lihat "Riwayat revisi")* | P1 | 015 |
| TC-CRUD-06 | DU | Hapus komponen yang punya riwayat (central) | Status menjadi Nonaktif. Tidak ada baris yang terhapus | P1 | – |
| TC-CRUD-07 | DU | `opCreateIncome` dengan unit "MI+TK" | Ditolak, atau diterima sesuai keputusan GAP-023 (konsisten untuk create dan update) | P1 | 023 |

## D. Transaksi multi-siswa

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-TRX-01 | DU. Kewajiban SPP Oktober T01 = 350.000, T02 = 250.000 | Catat penerimaan transfer 550.000: T01 200.000, T02 350.000 (SPP Okt 250.000 + katering 100.000) | 1 baris di 05 (nominal 550.000, `siswaId` kosong). 3 baris di 06 dengan jumlah 550.000. `statusAlokasi = PENUH` (dihitung server) | P0 | 042, 012 |
| TC-TRX-02 | Sama | Kirim payload yang sama dua kali (clientRequestId sama), mis. retry karena jaringan | Tetap 1 transaksi. Respons kedua: "idempotent replay" | P0 | – |
| TC-TRX-03 | Sama | Alokasi total 600.000 untuk nominal 550.000 | Ditolak `ALLOCATION_EXCEEDS_TRANSACTION`. Tidak ada baris parsial | P0 | – |
| TC-TRX-04 | Sama | Nominal transfer diketik 550.000, alokasi hanya 500.000 | Tersimpan dengan sisa 50.000 tampil eksplisit. `statusAlokasi = SEBAGIAN`. Kredit **tidak** jatuh otomatis ke T01 | P1 | 042 |
| TC-TRX-05 | Sama | Alokasi 300.000 ke SPP T01 yang sisa kewajibannya 350.000 dengan 100.000 sudah dibayar | Ditolak `ALLOCATION_EXCEEDS_OBLIGATION` | P1 | – |
| TC-TRX-06 | Lock dipegang proses lain lebih dari 10 detik | Buat transaksi | `LOCK_TIMEOUT`. UI menampilkan gagal, bukan sukses | P1 | 004 |
| TC-TRX-07 | `periodeAktif` Oktober | Alokasi bayar di muka SPP Desember | Diterima sesuai kebijakan `aturan.bayarDimuka`, atau dicatat sebagai kredit berlabel. **Tidak boleh** gagal diam-diam | P2 | 047 |

## E. Duplikasi

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-DUP-01 | DU | Impor ulang berkas mutasi Juli MI | 0 baris baru di 11 (`kunciDedup`) | P1 | 041 |
| TC-DUP-02 | DU | Periksa 12 pasangan FT MI/TK (D-010) | Tidak ditandai duplikat. Keputusan di 12_DUP_REVIEW dihormati | P2 | 036 |
| TC-DUP-03 | DU | Dua pengeluaran sah identik (tanggal, penerima, nominal sama) | Diberi peringatan, lalu bisa disimpan dengan keputusan tercatat. KPI tidak menghukum setelah diputuskan BUKAN_DUPLIKAT | P2 | 036 |

## F. Mutasi dan rekonsiliasi

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-REK-01 | DU | Impor mutasi Oktober (kredit dan debit) | Baris masuk ke 11 dengan akunId dan arah. **Tidak ada** transaksi yang dibuat otomatis | P1 | 041 |
| TC-REK-02 | TC-REK-01 | Identifikasi 1 mutasi ke siswa | 05 dan 06 terbentuk. 11.transaksiId terisi. Status **`DIPROSES`** (kontrak Web V2). Mutasi asli tidak berubah nominalnya. Status `TEREKONSILIASI` pada data FINAL **tidak diubah** dan tetap dikenali sebagai sudah dicocokkan (tidak dapat dicocokkan ulang). *(Direvisi 19-10-2026; semula `TERIDENTIFIKASI`. Lihat "Riwayat revisi")* | P1 | 019 |
| TC-REK-03 | Saldo rekening koran akhir Oktober tersedia | Rekonsiliasi `akun_bank_bsi_mi` | `saldoSistem` = saldo per 31-10 (bukan saldo hari ini). Selisih dihitung. SELESAI hanya bila selisih 0 atau ada penyesuaian yang disetujui | P1 | 009, 019 |
| TC-REK-04 | Saldo awal kosong | Buka FCC | Tampil "Saldo awal tidak tersedia". Tidak ada angka "Actual Cash Position" yang menyesatkan | P0 | 009 |

## G. KPI

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-KPI-01 | DU + data uji periode Oktober | Hitung KPI di klien (versi sekarang) dan di server (`opKpiCompute`) | Skor per indikator, induk, dan total identik (diferensial) | P0 | 007 |
| TC-KPI-02 | API `opReadSheet` dibuat gagal | Buka Laporan > KPI | Status "DATA TIDAK TERSEDIA". Tidak ada skor 0 berlabel "Perlu Perbaikan" | P0 | 007 |
| TC-KPI-03 | DU | Jalankan snapshot dua kali tanpa perubahan data | 2 snapshotRunId berbeda (append-only) dengan nilai sama. Tidak ada baris yang tertimpa. Setiap baris memuat versiRumus | P0 | 007 |
| TC-KPI-04 | DU | Hitung ulang periode Juli pada dua tanggal berbeda | Skor identik (tidak bergantung pada tanggal hari ini) | P1 | 025 |
| TC-KPI-05 | DU, periode tanpa pengeluaran | Lihat BDS03 | Indikator ditandai sesuai aturan yang disepakati (NOT_STARTED atau NOT_APPLICABLE), dengan perlakuan penyebut terdokumentasi | P1 | 033 |
| TC-KPI-06 | DU | Verifikasi ambang: skor 89,95 / 79,9 / 69,99 | Masing-masing Baik / Perlu Perhatian / Perlu Perbaikan | P1 | – |
| TC-KPI-07 | DU | Zero Activity Rule: BDS06-I02 sebelum tanggal 25 | Indikator NOT_DUE dan dikeluarkan dari penyebut BDS06 | P1 | – |
| TC-KPI-08 | DU | Klik skor induk, lalu indikator, lalu aktivitas, lalu transaksi | Setiap skor dapat ditelusuri ke record sumber | P1 | 007 |
| TC-KPI-09 | Mutasi status TERIDENTIFIKASI/TEREKONSILIASI | BDS02-I02 | Lulus sesuai keputusan enum | P1 | 019 |

## H. Otorisasi dan keamanan

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-AUTH-01 | Akun Google tidak terdaftar | Buka aplikasi lalu coba simpan penerimaan | UI tulis nonaktif. Server mengembalikan `USER_NOT_FOUND`. localStorage tidak bertambah | P0 | 004, 005 |
| TC-AUTH-02 | Akun AUDITOR | Panggil `opCreateIncome` langsung dari konsol | `ROLE_NOT_ALLOWED` | P0 | – |
| TC-AUTH-03 | Akun INACTIVE | Buka aplikasi | `USER_INACTIVE` | P0 | – |
| TC-AUTH-04 | Web app ter-deploy | POST `{action:'createIncome'}` ke URL web app dengan device secret | Ditolak (jalur tulis doPost dimatikan) | P0 | 006 |
| TC-AUTH-05 | – | Muat halaman dalam iframe dari domain lain | Ditolak (bukan ALLOWALL) | P1 | 006 |
| TC-AUTH-06 | BENDAHARA satu-satunya | Nonaktifkan diri sendiri | `SELF_LOCKOUT` | P1 | – |
| TC-AUTH-07 | Bila opsi hosting B dipilih | Panggil API dari domain Vercel tanpa ID token, atau dengan token palsu | `AUTH_REQUIRED`. Tidak ada mode lokal | P0 | 005 |
| TC-AUTH-08 | – | Akses `driveFileUrl` bukti dengan akun lain | Ditolak sesuai izin folder | P1 | 024 |

## I. Kegagalan API dan jaringan

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-FAIL-01 | Server tidak dapat dijangkau | Simpan pengeluaran | Pesan "Gagal menyimpan ke server". **Tidak ada** toast "tersimpan" dan tidak ada baris lokal | P0 | 004 |
| TC-FAIL-02 | Respons hilang setelah server menulis (simulasi) | Retry otomatis | Tetap satu transaksi (idempotensi). Audit tidak ganda | P0 | 013, 031 |
| TC-FAIL-03 | `13_AUDIT_LOG` diproteksi (tulis gagal) | `opMasterUpsert` | Perubahan dibatalkan, atau galat jelas. Bukan sukses dengan `auditWarning` diam-diam | P1 | 013 |
| TC-FAIL-04 | localStorage penuh | Simpan apa pun | Galat terlihat (lsSet tidak menelan galat) | P1 | 004 |
| TC-FAIL-05 | Upload bukti tertunda, lalu halaman dimuat ulang | – | Upload sinkron tidak memakai antrean memori. Bila gagal, pengguna diberi tahu sebelum menutup | P1 | 024 |
| TC-FAIL-06 | 2 klien paralel mengirim 50 entri audit | – | 100 baris unik. Tidak ada yang tertimpa | P1 | 013 |
| TC-FAIL-07 | 2 klien mengubah anggaran yang sama | – | Klien kedua menerima `CONFLICT` | P1 | 026 |

## J. Konsistensi dashboard

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-DSH-01 | DU | Saldo Beranda, FCC, dan Laporan Kas/Bank untuk akhir Oktober | Ketiganya sama, dan sama dengan Σ detail transaksi + saldo awal | P0 | 009 |
| TC-DSH-02 | DU | Penerimaan bulan Oktober di dashboard vs jumlah 05 PENERIMAAN Oktober non-arsip | Sama | P0 | – |
| TC-DSH-03 | DU | ACTUAL, COMMITTED, PLANNED, MISSING | Ditampilkan terpisah, tidak dijumlahkan. Label "bukan surplus" muncul bila kelengkapan < 100% | P1 | – |
| TC-DSH-04 | Siswa dengan klaim ledger tanpa alokasi | Lihat profil, tagihan, dan Beranda | Status "Klaim belum terverifikasi". **Tidak** dihitung sebagai tunggakan | P0 | 011 |
| TC-DSH-05 | DU | Pengeluaran yang ter-map ke RAB (ITEM) | Realisasi RAB muncul di FCC dan lulus BDS03-I03 | P1 | 018 |
| TC-DSH-06 | DU | Komitmen COMMITTED 1.000.000 pada RAB X | FCC COMMITTED = 1.000.000. Sisa pagu = RAB − realisasi − komitmen | P1 | 017 |
| TC-DSH-07 | Laporan September dikirim dua kali | – | Dua versi tersimpan. KPI BDS06-I02 memakai tanggal kirim pertama sesuai keputusan | P1 | 044 |
| TC-DSH-08 | DU + RAB disetujui, diajukan, tanpa status; pengeluaran terpetakan penuh, sebagian, tanpa RAB | Buka kartu Realisasi RAB di Beranda | Tampil terpisah: A Total Anggaran Disetujui, B Realisasi terhadap Anggaran Disetujui, Sisa (A − B), C Total Pengeluaran Aktual (= tile Pengeluaran Aktual), C − B dengan rincian (RAB belum disetujui, garis periode lain, sisa tidak terpetakan, tanpa RAB). B + rincian = C. Definisi `P1_10` | P1 | 018 |
| TC-DSH-09 | Seperti TC-DSH-08 | Bandingkan kartu Beranda, Laporan → Anggaran, dan ekspor "Laporan Anggaran & Realisasi" | Nilai A/B/C/C − B per periode sama di ketiganya | P1 | 018 |

## K. Lintas bulan: RAB, pencairan, transaksi, LPJ (ditambahkan 19-10-2026; audit `P1_12`)

Status kebijakan setiap kasus: `P1_12` §4. TC bertanda **(menunggu kebijakan)** baru dapat dinilai setelah keputusan U-1..U-5.

| ID | Kondisi awal | Langkah | Hasil diharapkan | Prio | GAP |
|---|---|---|---|---|---|
| TC-LB-01 | Pengeluaran September tertaut LPJ | Catat LPJ bertanggal Oktober (`transaksiId` valid, Σ ≤ nominal) | Diterima. Pengeluaran, saldo, KPI, dan ringkasan September tidak berubah | P1 | 020 |
| TC-LB-02 | Seperti TC-LB-01 | LPJ tambahan sehingga Σ LPJ > nominal | `LPJ_EXCEEDS_TRANSACTION` | P1 | 020 |
| TC-LB-03 | RAB September disetujui | Pengeluaran Oktober kategori sama, tanpa alokasi | Tidak dicocokkan ke RAB September (TANPA RAB); tidak otomatis diterima | P1 | 018 |
| TC-LB-04 | RAB September disetujui | Alokasi eksplisit pengeluaran Oktober ke RAB September | **(menunggu kebijakan U-1)**. Perilaku sekarang: diterima, tampil sebagai "garis periode lain", bukan realisasi disetujui Oktober | P1 | 018 |
| TC-LB-05 | RAB Oktober disetujui | Satu pengeluaran Oktober dengan dua alokasi eksplisit dalam periode sama | Diterima. Total pengeluaran aktual bertambah sekali, realisasi disetujui bertambah sebesar Σ alokasi | P1 | 018 |
| TC-LB-06 | Pencairan September dicatat sebagai PENGELUARAN | "Buat Transaksi dari LPJ" untuk rincian LPJ Oktober | **(menunggu kebijakan U-3)**. Harus tidak menghasilkan pengeluaran kedua | P1 | 020 |
| TC-LB-07 | – | Buat pengeluaran bertanggal `2026-13-40` / `2026-02-30` | **(menunggu kebijakan U-4)**: ditolak. Perilaku sekarang: diterima | P1 | 014 |
| TC-LB-08 | LPJ diterima, belum diverifikasi | Lihat status pertanggungjawaban | **(menunggu U-2)**: "menunggu verifikasi", bukan selesai | P1 | 020 |
| TC-LB-09 | RAB disetujui setelah tanggal transaksi | Lihat penilaian I03 | **(menunggu U-5)** | P2 | 018 |
| TC-LB-10 | Uang muka September, sisa dikembalikan Oktober | Catat pengembalian | **(menunggu U-3 + GAP-028)** | P2 | 028 |
| TC-LB-11 | Transaksi September atas RAB DIAJUKAN; RAB kemudian diubah DISETUJUI | Lihat I03 transaksi itu | **(menunggu D-LB-3)**. Perilaku sekarang: berlaku surut tanpa tanggal persetujuan (`P1_13` §3 kasus 3) | P1 | 018 |
| TC-LB-12 | September ditandai CLOSED | Catat LPJ bertanggal nota September atas transaksi September | Diterima; `PERIODE_DITANDAI`; transaksi dan saldo tidak berubah | P1 | 015, 020 |
| TC-LB-13 | Uang muka 2.000.000 (20-09) dari bank; nota 1.700.000; sisa 300.000 kembali 06-10 | Catat seluruh siklus | **(menunggu D-T1)**: saldo bank = rekening koran; pengeluaran aktual tidak ganda; realisasi RAB = pemakaian; sisa tidak tercatat sebagai penerimaan operasional; status LPJ sesuai tahap (`P1_13` §1.2) | P1 | 020, 028 |
| TC-CRUD-08 | – | Tulis tanggal `2026-13-40`, `2026-02-30`, `2025-02-29`, kosong, `null`, `19/10/2026` di semua jalur tulis bertanggal (transaksi, LPJ, komitmen, mutasi, bukti) dan label periode tidak sah di RAB/kewajiban | Semua ditolak `VALIDATION_ERROR` (field wajib); kosong diterima pada field opsional; `2024-02-29` dan `2026-10-19` diterima; baris historis tidak diubah. **Diimplementasikan P0-T4 (19-10-2026)** | P1 | 014 |
| TC-HDR-07 | Kolom wajib sheet yang dibaca lewat `opReadSheet` hilang (mis. `30_ALOKASI_PENGELUARAN.anggaranId`, `08_ANGGARAN.nominal`) | Buka KPI | "DATA TIDAK TERSEDIA", tidak dihitung dari data parsial; `opReadSheet` → `SCHEMA_MISMATCH`. **Diimplementasikan P0-T8 (19-10-2026)** | P0 | 002 |
| TC-AUTH-09 | Pengguna BENDAHARA | Buat/ubah pengguna menjadi KEPALA_SEKOLAH/YAYASAN | Ditolak `PRIVILEGED_ROLE_CHANGE_DENIED` (**diimplementasikan P0-T7, 19-10-2026**); peran admin pengelola menunggu D-T7 | P1 | 048 (usulan) |
| TC-REL-07 | Salinan uji, `30_REF_ALOKASI_PENGELUARAN` tersedia | Jalankan langkah setup sheet 30 (`P1_13` §5) | Semua kriteria langkah 0–8 terpenuhi; `30_REF` tidak berubah | P1 | 018, 016 |

## Riwayat revisi

| Tanggal | TC | Ekspektasi lama | Ekspektasi baru | Alasan dan dasar keputusan |
|---|---|---|---|---|
| 17-10-2026 | TC-CRUD-05 | `opCreateIncome` pada periode TERKUNCI → `PERIOD_LOCKED` | Diterima pada tanggal aktual, ditandai dan diaudit secara atomik. Kegagalan audit tidak meninggalkan keadaan parsial. Otorisasi dan validasi tetap berlaku. Status periode dan riwayat closing tetap tersedia | Keputusan kebijakan pengguna 17-10-2026: status CLOSED/TERKUNCI adalah **penanda administratif, bukan hard lock** pencatatan rutin, karena pembayaran orang tua sering terlambat. Implementasi: commit `79e2b66`. Audit: `P1_03_POLICY_CHANGE_AUDIT.md`. Laporan: `P1_03_IMPLEMENTATION_REPORT.md`. Uji sandbox: P1L-01, P1L-13, P1P-06, P1P-10 |
| 19-10-2026 | TC-REK-02 | Status mutasi teridentifikasi = `TERIDENTIFIKASI` | Status = `DIPROSES` | `TERIDENTIFIKASI` tidak ada di kontrak Web V2 (`DB_SCHEMA 11_MUTASI_BANK`: `BELUM_DIPROSES`, `DIPROSES`); KPI BDS02-I02/I03 memakai `DIPROSES`. Keputusan pengguna atas `P1_04`: **Opsi C**, yaitu tidak mengubah data maupun rumus KPI. 544 baris `TEREKONSILIASI` (angka dari dokumen 05, belum dihitung ulang terhadap data FINAL) tetap apa adanya; masalah pemetaan status **belum terselesaikan** |
| 19-10-2026 | TC-DSH-08/09, TC-LB-01..10 (baru) | – | Lihat tabel J dan K | Keputusan 2 (Kartu Beranda) dan audit lintas bulan `P1_12`. Tidak ada TC yang dihapus atau diubah |
| 19-10-2026 | TC-LB-11..13, TC-CRUD-08, TC-HDR-07, TC-AUTH-09, TC-REL-07 (baru) | – | Lihat tabel K | Audit `P1_13`. Tidak ada TC yang dihapus atau diubah |
| 19-10-2026 | TC-CRUD-08, TC-HDR-07, TC-AUTH-09 | "menunggu keputusan" | Hasil diharapkan ditetapkan (lihat tabel) | Master Task P0 hardening (`P1_14`); tidak ada TC yang dihapus |

Revisi tersebut **tidak menghapus** test case; langkah dan ekspektasinya diperluas agar tetap memeriksa kontrol keamanan dan integritas.

