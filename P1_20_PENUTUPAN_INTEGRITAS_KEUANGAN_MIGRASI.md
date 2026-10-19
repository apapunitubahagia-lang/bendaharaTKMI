# P1_20 — Penutupan Integritas Keuangan & Keamanan Migrasi

**Tanggal:** 19 Oktober 2026
**Commit awal:** `fef06cc` (dokumen P1_19). Diverifikasi sebelum perubahan: branch `claude/trusting-keller-84usce`, HEAD = remote, working tree bersih, commit P1_19 tersedia. Baseline dijalankan ulang sendiri (prefix `p20base`, log tidak disimpan): 19 suite, 555/0/44, build deterministik.
**Status akhir: `BLOCKED`** untuk uji integrasi nonproduksi (prasyarat lingkungan belum tersedia, §8/§12). Kode siap ditinjau (`READY_FOR_REVIEW` untuk perubahan B–D) dan menjadi `READY_FOR_INTEGRATION_TEST` begitu prasyarat §12 terpenuhi. **Tidak ada uji live**, tidak ada deploy, tidak ada data produksi yang disentuh, migrasi tidak dijalankan.

## 1. Ringkasan eksekutif

- **Migrasi V1 (B):** transaksi hasil migrasi V1 (akun = akun pertama, fallback historis) **tidak lagi dapat dikirim ke server** tanpa pemetaan akun eksplisit. Daftar pengecualian beralasan di Pusat Data; pemetaan hanya oleh pengguna (akun Kas/Bank master server + alasan wajib + unit bila data V1 tidak memuatnya), beraudit. Id migrasi kini **deterministik** (migrasi ulang = id sama = `clientRequestId` sama → tidak ganda). "Jalankan Migrasi Sekarang" dinonaktifkan pada mode pusat. Data V1 dan transaksi lama tidak diubah otomatis.
- **Alokasi lintas siswa (C):** celah nyata ditemukan dan ditutup. Pada `c0a8438`, `opCreateAllocation` menerima alokasi dari transaksi siswa A ke kewajiban siswa B, dan alokasi kewajiban pada transaksi **PENGELUARAN** (bukti: `_test_logs/audit_alokasi_siswa_sebelum_c0a8438.log`). Kini ditolak di server, di dalam kunci engine.
- **Kategori pengeluaran (D):** server sebelumnya menerima kategori apa pun, termasuk kosong (bukti: `_test_logs/audit_kategori_sebelum_cbca39f.log`). Kini kategori wajib, divalidasi terhadap master aktif, tanpa fallback, disimpan dengan nama kanonik, gagal tertutup bila master tidak tersedia; koreksi divalidasi hanya bila kategori/jenis diubah (kategori historis tidak diubah). Audit baca-saja kategori historis tersedia.
- **Snapshot & tarif (E):** hanya analisis + uji karakterisasi. Perubahan tarif **mengubah mundur** kewajiban yang sudah dibayar tetapi belum dibekukan (contoh: lunas Rp200.000 → kurang bayar Rp50.000); kewajiban beku dapat ditimpa lewat `opRecordBatch('kewajiban')`. Opsi & rekomendasi di §5 — **menunggu persetujuan**, tidak diimplementasikan.
- **Impor lama (F):** lima modul V2 tidak dapat dijangkau lewat UI jalur lama; resolver antrean lama ditolak; semua tulisan jalur lama tetap melewati validasi server. **Tidak ada jalur yang dinonaktifkan** di P1_20 (lihat §6 alasannya).
- 24 suite sandbox: **587 PASS, 0 FAIL, 50 INFO** (+5 suite baru: 32 PASS, 6 INFO).

## 2. Peta migrasi V1 (B)

| Tahap | Fungsi | Perilaku sebelum P1_20 | Sesudah P1_20 |
|---|---|---|---|
| Deteksi & jalan | `init()` → `migrateV1ToV2()` saat boot bila ada kunci `draKinerja_bendaharaSekolah_*` dan penanda `migratedFromV1` belum di-set | menimpa koleksi lokal (siswa, tagihan, transaksi, alokasi, mutasi, obligasi, dokumen, settings) | **tidak diubah** (bukan migrasi startup baru); hasil kini hanya lokal + pengecualian (VM-09 INFO) |
| Penetapan akun | `akunDefault = akunKasBankList[0].id` untuk semua pembayaran/pemasukan/pengeluaran V1 | akun pertama tanpa penanda | tetap (historis tidak diubah), **diberi penanda** `_akunSumber: 'FALLBACK_AKUN_PERTAMA_V1'` |
| Kategori | pengeluaran V1 tanpa kategori → `'Lainnya'` | fallback | tetap lokal; server kini menolak kategori di luar master (R-3) |
| Id | `uid('trx')` / `uid('alk')` acak | migrasi ulang = id baru = berpotensi ganda | **deterministik** `v1Id_(jenis, record, urutan)` (VM-01) |
| Penyimpanan | localStorage perangkat | — | — |
| Kirim ke server | `centralLegacyMigrate()` (Pusat Data → Migrasikan ke server) menandai `_pendingSync`; dedupe hanya sidik jenis|tanggal|nominal|akun|siswa | transaksi berakun fallback ikut terkirim | **pengecualian** (tidak ditandai, tidak dikirim): `PEMETAAN_AKUN_V1_DIPERLUKAN`, `AKUN_KOSONG`, `AKUN_TIDAK_ADA_DI_SERVER` (VM-02, VM-08) |
| Penjaga kirim | `centralPushTrx_` / `centralPushTrxBatch_` | — | transaksi V1 tanpa pemetaan → `_syncBlocked`, galat `PEMETAAN_AKUN_V1_DIPERLUKAN`, **0 panggilan server** (VM-03) |
| Pemetaan | — | — | `v1PetakanAkun(ids, akunId, alasan, unit)` / modal "Petakan akun transaksi V1…": akun Kas/Bank master server, alasan wajib, unit TK/MI wajib bila kosong; `_akunPemetaan {akunId, akunSebelumnya, unit, unitSebelumnya, alasan, oleh, at}`; audit `PEMETAAN_AKUN_V1` per transaksi (VM-04, VM-05) |
| Migrasi ulang | `runMigrationNow()` | reset penanda + timpa seluruh koleksi lokal (termasuk antrean) | **ditolak pada mode pusat** (VM-06); mode lokal tetap, id identik |
| Idempotensi | `clientRequestId = 'ui_' + id` | id acak → tidak melindungi migrasi ulang | id deterministik → kirim ulang = replay (VM-06, VM-07) |

Temuan sampingan (tidak diubah): data V1 tidak memuat `unit`, sehingga transaksi V1 selalu ditolak server (`unit harus TK atau MI`) — karena itu unit ditambahkan ke pemetaan eksplisit. `centralLegacyMigrate` juga mengantrekan baris master lokal yang tidak ada di server (di sandbox: 81 baris benih master) — lihat R-9.

## 3. Jalur transaksi yang masih memakai fallback

| Jalur | Fallback | Status |
|---|---|---|
| Form/wizard/Impor V2/mutasi (transaksi baru) | — | tidak ada (P1_18–P1_19; server menolak akun kosong) |
| `migrateV1ToV2` (lokal) | akun pertama; kategori `'Lainnya'`; tanggal hari ini bila V1 kosong | **masih ada di data lokal** (historis), tetapi tidak dapat terkirim tanpa pemetaan akun; kategori ditolak server bila bukan master |
| `postTransaksi` lokal lain (data lama di perangkat) | — | akun kosong / tidak ada di master server → pengecualian |
| Server | — | akun & kategori wajib (opEngineWrite_, `expenseKategoriCheck_`) |

## 4. Validasi siswa & kategori (C, D)

**Fungsi server yang membuat/mengubah alokasi** (hanya dua penulis `06_ALOKASI`): `createTransactionWithAllocations_` (opCreateIncome, opCreateTxBatch, Impor V2) dan `createAllocation_` (opCreateAllocation); arsip lewat `opArchiveAllocation` / `opArchiveTransaction`. `opRecordBatch` tidak dapat menulis `06_ALOKASI`.

| Pemeriksaan | `createTransactionWithAllocations_` | `createAllocation_` |
|---|---|---|
| identitas transaksi penerimaan | jenis dari payload (alokasi hanya untuk PENERIMAAN) | **baru:** transaksi induk wajib PENERIMAAN (AS-04) |
| siswa transaksi = siswa alokasi | `validateAllocationsForIncome_` (AS-03) | **baru:** bila transaksi ber-`siswaId` (AS-01, AS-02) |
| siswa kewajiban = siswa alokasi | kunci kewajiban `siswaId|komponenId|periode` (P1_19) | sama |
| tautan alokasi–transaksi | ditulis bersama | `transaksiExists_` + tidak terarsip, dibaca ulang di kunci |
| batas nominal | Σ ≤ nominal transaksi; ≤ sisa kewajiban (di kunci) | sama (AS-06) |
| duplikat / retry | `clientRequestId` | sama (AS-05) |
| periode valid | `OBLIGATION_NOT_FOUND`, `PERIODE_AKTIF_TIDAK_VALID` | sama |
| sumber lengkap | `kgStatus_` | sama |
| otorisasi | `opGate_` BENDAHARA | sama (AS-09) |
| koreksi/batal | `opArchiveAllocation`: arsip (tanpa hapus), alasan, audit `ARCHIVE_ALLOCATION`, sisa pulih; arsip ulang tidak menulis ganda (AS-08) | |

Kebijakan yang **tidak diubah** (perlu keputusan, AS-07): penerimaan **tanpa** `siswaId` boleh dialokasikan ke siswa mana pun dan dapat bercampur beberapa siswa (setara jalur pembayaran beralokasi; mis. pembayaran gabungan kakak-adik).

**Kategori pengeluaran** — semua jalur create melewati `createTransactionWithAllocations_` (opCreateExpense, opCreateTxBatch, Impor V2 via opCreateExpense); koreksi lewat `updateTransaction_`.

| Kasus | Perilaku server | Uji |
|---|---|---|
| kosong | `VALIDATION_ERROR` (tidak ada kategori bawaan) | KP-01 |
| tidak ada di master / Nonaktif | `INVALID_CATEGORY` | KP-01, KP-03 |
| beda huruf/spasi, atau id | diterima, disimpan nama kanonik master | KP-02 |
| master tidak ada / tanpa kategori aktif / subkategori tidak tersedia | `KATEGORI_MASTER_TIDAK_TERSEDIA` (gagal tertutup) | KP-04 |
| subkategori bukan milik kategori | `INVALID_SUBCATEGORY` | KP-05, KP-07 |
| batch | ditolak per item | KP-06 |
| koreksi kategori/subkategori; ganti jenis ke PENGELUARAN | divalidasi | KP-07, KP-09 |
| koreksi field lain pada transaksi berkategori lama | boleh; kategori tidak diubah | KP-08 |
| transaksi historis | `opKategoriPengeluaranAudit()` (baca-saja, BENDAHARA/AUDITOR/…): `KATEGORI_KOSONG`, `KATEGORI_TIDAK_ADA_DI_MASTER`, `SUBKATEGORI_TIDAK_VALID`, `BEDA_PENULISAN` + saran kanonik | KP-10 |

Penyesuaian uji lama (input/fixture saja, asersi tidak diubah): P0A-03, P0A-04, P0B-09, P0B-13 kini menyebut `kategori: 'ATK'`; P1D-05 (`Konsumsi`), RAB-34 (`Honor`), U26 (`Lainnya`) menambah kategori itu ke master **sandbox** agar kasus "pengeluaran tanpa RAB/anggaran" tetap diuji.

## 5. Snapshot kewajiban & perubahan tarif (E) — analisis, belum diimplementasikan

**Sumber & waktu.** Kewajiban dihitung `kewajibanForSiswa` (klien & server, kode identik) dari `01_SISWA`, `02_KOMPONEN`, `03_TARIF`, settings (keringanan, hari katering, pendaftaran). Bila baris `04_KEWAJIBAN` ber-`tagihanId` ada (kewajiban **beku**), bruto/netto/potongan diambil dari baris itu; bila tidak, dihitung langsung dari tarif **saat dibaca**.

| Fungsi yang mengubah | Efek |
|---|---|
| `opMasterUpsert/opMasterBatch('tarif')` (form Tarif klien → `centralMasterSave`) | mengubah netto **semua kewajiban belum beku**, termasuk yang sudah dibayar; tanpa pembekuan |
| `opTarifApply` | membekukan dulu kewajiban berpembayaran pada komponen lump yang dinonaktifkan; lalu tambah tarif |
| `opObligationSnapshot` / `oblSnapshotCore_` | membekukan dengan tarif **saat snapshot**; baris beku tidak disentuh lagi |
| `opRecordBatch('kewajiban')` (juga `freezeObligationsFor_` / terbitkan tagihan di klien) | dapat membuat **dan menimpa** baris beku (netto/bruto) tanpa memeriksa alokasi |
| klien: katering, klasifikasi pendaftaran, pindah TA | membekukan kewajiban berpembayaran sebelum mengubah |

Hubungan dengan transaksi/alokasi: alokasi menunjuk kunci `siswaId|komponenId|periode` (atau `tagihanId`), bukan nominal; status (LUNAS/CICILAN/KELEBIHAN BAYAR) dan sisa dihitung ulang setiap dibaca. Baris transaksi & alokasi tidak pernah berubah (ST-02).

**Contoh dampak (sandbox, ST-01/ST-04/ST-05):**

| Skenario | Sebelum | Sesudah |
|---|---|---|
| SPP Sep dibayar Rp200.000 (lunas), belum beku; tarif → Rp250.000 | netto 200.000, LUNAS | netto 250.000, sisa 50.000, **CICILAN** (tunggakan mundur) |
| sama; tarif → Rp150.000 | LUNAS | **KELEBIHAN BAYAR** 50.000 |
| jumlah kewajiban SPP sandbox yang berubah | — | 6/6 |
| sudah dibekukan lalu tarif berubah (ST-03) | 200.000 LUNAS | 200.000 LUNAS (aman) |
| bayar Juli Rp200.000, tarif → 250.000, **lalu** snapshot | LUNAS (belum beku) | beku 250.000, sisa 50.000 |
| baris beku ditimpa `opRecordBatch('kewajiban')` netto 100.000 | LUNAS | KELEBIHAN BAYAR; audit `RECORD_UPDATE:kewajiban` ada |

Dampak laporan/KPI: indikator yang membaca kewajiban/tunggakan/sisa (termasuk laporan periode yang sudah CLOSED/TERKUNCI) berubah mundur karena kewajiban tidak beku tidak menyimpan nilai historis. Formula/bobot/target KPI tidak disentuh.

**Opsi desain:**

| Opsi | Isi | Risiko |
|---|---|---|
| E1 | Bekukan kewajiban **di dalam kunci saat alokasi pertama dibuat** (tarif saat pembayaran mengikat) | menambah tulisan `04_KEWAJIBAN` per pembayaran; butuh kolom aditif (sudah ada di skema aditif); kewajiban dibayar sebelum P1_20 tetap belum beku → perlu O-E4 |
| E2 | Bekukan kewajiban berpembayaran **sebelum** perubahan tarif (`opMasterUpsert('tarif')` nominal/status), seperti `opTarifApply` | tidak melindungi snapshot setelah pembayaran (ST-04) bila tarif sudah berubah sebelumnya |
| E3 | Tolak perubahan nominal tarif yang sudah dipakai alokasi; perubahan = tarif baru untuk TA/periode baru | kaku; kenaikan tengah tahun butuh kebijakan |
| E4 | Pembekuan satu kali (backfill) kewajiban berpembayaran yang ada, dengan laporan dampak, sebelum E1/E2 aktif | menulis data produksi → hanya di salinan dulu, keputusan eksplisit |
| E5 | `RecordGuard`: baris `04_KEWAJIBAN` beku yang beralokasi aktif tidak dapat diubah netto/bruto/potongan kecuali lewat koreksi beralasan (audit before/after) | jalur koreksi resmi perlu dirancang |

**Rekomendasi:** E2 + E5 lebih dulu (kecil, tidak mengubah skema, menutup ST-01 & ST-05), lalu E1 setelah kebijakan "tarif mengikat saat pembayaran" disetujui; E4 hanya di salinan dengan laporan dampak. **Kebijakan yang perlu diputuskan:** apakah perubahan tarif tengah tahun berlaku mundur untuk bulan yang belum dibayar; apakah snapshot memakai tarif saat pembayaran atau saat snapshot; siapa yang boleh mengoreksi kewajiban beku. **Skema:** tidak perlu kolom baru untuk E2/E5; E1/E4 memakai kolom aditif `04_KEWAJIBAN` yang sudah ada.

## 6. Audit jalur impor lama (F)

| Modul V2 | Jalur lama | UI | Panggilan langsung (konsol) | Validasi server | Keputusan |
|---|---|---|---|---|---|
| pemasukan | `importWizardConfirm` → `commitPenerimaanRow` | dialihkan ke Impor V2 (LI-01) | masih bisa; akun/kategori wajib eksplisit (AK-08) | `opCreateTxBatch` → engine (akun, siswa, alokasi, kewajiban) | dipertahankan |
| pengeluaran | `commitPengeluaranRow` | dialihkan | sama | engine + **kategori master** (LI-03) | dipertahankan |
| rab | `commitRabRow` | dialihkan | masih bisa | `opRecordBatch('anggaran')` + RecordGuard | dipertahankan |
| lpj | `commitLpjRow` | dialihkan | masih bisa | `opRecordBatch('lpj')` + RecordGuard | dipertahankan |
| siswa | `importWizardConfirmSiswa` → `commitSiswaRow` | dialihkan | masih bisa | `opMasterBatch('siswa')` (validasi master) | dipertahankan |
| semua | resolver antrean lama (`resolveImportQueueAsNew/Ambiguous`) | — | ditolak untuk 5 modul (LI-02) | — | sudah tertutup |

Fungsi bersama yang masih dipakai: `importWizardConfirm` (RKAT & mutasi bank), `fieldGetterFor`, `extraColumnsFor`, `commitMutasiBankRow`, `commitRkatRow`. Migrasi historis (§2) terpisah dari impor.

**Mengapa tidak dinonaktifkan:** jalur ini tidak menulis server tanpa `opGate_` + validasi server (tidak ada bypass), dan tidak dapat dijangkau dari UI. Menonaktifkannya mengubah ekspektasi uji lama AK-08 serta IA-05/IA-07 dan karakterisasi `import_audit_tests` — perubahan ekspektasi butuh persetujuan eksplisit. Diusulkan sebagai keputusan D-4 (§11), commit terpisah bila disetujui.

## 7. Status GAP-005 — matriks uji

| Item | Di repo / sandbox | Harus diverifikasi live (salinan) | Status |
|---|---|---|---|
| Akun Google Workspace | identitas `Session.getActiveUser().getEmail()` + `26_USER_ACCESS` (gagal tertutup) | email terbaca untuk akun domain dengan executeAs yang dipilih | belum diuji |
| Gmail (bila dipakai) | — | dengan "Execute as: Me", email Gmail konsumen umumnya kosong → `AUTH_REQUIRED` | belum diuji; keputusan jenis akun |
| Execute as | tidak ada `appsscript.json`/`.clasp.json` di repo (GE-06) | catat pilihan di proyek uji | tidak diketahui |
| Akses web app | tidak ada di repo | "Anyone within domain" vs "Anyone with Google account" | tidak diketahui |
| Pembacaan identitas server | GE-05: pengguna tak terdaftar ditolak semua 58 fungsi | ulangi dengan akun nyata | sandbox lulus |
| Peran BENDAHARA/AUDITOR | GE-05: AUDITOR ditolak 30 fungsi tulis; AS-09, ST-06, KP-10 (baca boleh) | ulangi dengan dua akun uji | sandbox lulus |
| Akses langsung spreadsheet | — | akun uji **tidak** boleh punya akses edit (melewati semua kontrol server) | belum diuji |
| Folder bukti | `BUKTI_FOLDER_ID`, `TEST_FOLDER_REQUIRED` (GE-01..04) | `ltPreflight().buktiFolder.ok` | sandbox lulus |
| Fungsi server publik | 58 `op*/get*` (+`opKategoriPengeluaranAudit` baca-saja) + `doGet`, `include`, `doPost` nonaktif, `test*` | daftar fungsi di proyek = repo | sandbox lulus |

**Kesimpulan:** GAP-005 **tetap terbuka**; uji sandbox bukan bukti penutupan.

## 8. Daftar commit (dari `fef06cc`)

| Commit | Isi |
|---|---|
| `c0a8438` | B: migrasi V1 — pengecualian, penjaga kirim, pemetaan akun+unit beraudit, id deterministik, migrasi ulang dinonaktifkan di mode pusat; `v1_migrasi_tests` |
| `cbca39f` | C: `createAllocation_` menolak non-PENERIMAAN & siswa berbeda; `alloc_siswa_tests`; bukti sebelum |
| `60bddec` | D: validasi kategori/subkategori server, `KategoriPengeluaranAudit.gs`; `kategori_tests`; bukti sebelum; input uji lama disesuaikan |
| `301c322` | E: `snapshot_tarif_tests` (karakterisasi) |
| `0164908` | F: `legacy_import_tests` |
| (commit ini) | dokumen P1_20, README, log `p1_20_*` |

Setiap paket build adalah `apply_*.js` terpisah di `build_all.js` sehingga dapat di-revert per commit.

## 9. Hasil seluruh tes (sandbox, `run_all_tests.js p1_20`, log `_test_logs/p1_20_*.log`)

| Suite | PASS | FAIL | INFO |
|---|---|---|---|
| 19 suite lama | 555 | 0 | 44 |
| v1_migrasi_tests | 8 | 0 | 1 |
| alloc_siswa_tests | 8 | 0 | 1 |
| kategori_tests | 10 | 0 | 0 |
| snapshot_tarif_tests | 3 | 0 | 3 |
| legacy_import_tests | 3 | 0 | 1 |
| **Total (24 suite)** | **587** | **0** | **50** |

Pemetaan uji wajib (I): 1 migrasi akun tak terpetakan → VM-02/VM-08; 2 kirim tanpa akun valid → VM-03; 3 migrasi berulang/idempotensi → VM-01/VM-06; 4 lintas siswa → AS-01..03; 5 kategori tidak valid → KP-01..07; 6 tarif berubah setelah alokasi → ST-01/ST-03; 7 snapshot setelah transaksi → ST-04; 8 panggilan server langsung → AS-01/AS-02/KP-*/ST-05; 9 retry respons hilang → VM-07, AS-05; 10 regresi → 19 suite lama lulus.
**Uji integrasi Apps Script: tidak dijalankan (BLOCKED).** Semua angka di atas berasal dari sandbox Node dengan mock SpreadsheetApp/LockService/DriveApp.

Invarian (H): KPI BDS01–BDS06 dan 31 indikator, formula/bobot/target/ambang tidak disentuh (diff Bendahara_V2.html tanpa baris KPI); kebijakan CLOSED/TERKUNCI tidak berubah; 544 TEREKONSILIASI tidak disentuh (tidak ada data nyata); riwayat transaksi/alokasi tidak diubah; T1/T4/T7/T8 tetap; transfer antar akun tetap diblokir (GAP-028); tidak ada migrasi startup baru; tidak ada deploy; tidak ada saldo awal atau status historis yang dikarang.

## 10. Risiko terbuka

| ID | Risiko |
|---|---|
| R-1 | Belum ada bukti live (LockService, kuota, waktu, identitas sesi). |
| R-2 | GAP-005 terbuka. |
| R-3 | Transaksi V1 berkategori fallback (`Lainnya`) akan ditolak server setelah dipetakan akunnya; pemetaan kategori belum ada (perlu keputusan, bukan fallback). |
| R-4 | Snapshot/tarif dapat mengubah kewajiban berpembayaran (§5) — belum dikendalikan. |
| R-5 | Penerimaan tanpa `siswaId` dapat dialokasikan ke siswa mana pun (AS-07). |
| R-6 | `migrateV1ToV2` masih berjalan saat boot bila data V1 ada (perilaku lama) dan menimpa koleksi lokal. |
| R-7 | Fungsi wizard impor lama masih global (tanpa bypass server). |
| R-8 | Validasi kategori dilakukan sebelum kunci (master dapat berubah di antara cek dan tulis — jendela kecil). |
| R-9 | `centralLegacyMigrate` mengantrekan baris master lokal yang tidak ada di server (termasuk benih), dapat menambah master tak diinginkan bila dijalankan. |
| R-10 | `opKategoriPengeluaranAudit` belum ada di ServerBridge/UI (dapat dijalankan dari editor Apps Script). |

## 11. Keputusan yang memerlukan persetujuan

1. **D-1 (E):** kebijakan tarif & snapshot — pilih E1/E2/E3/E5 (+E4 backfill di salinan); rekomendasi E2+E5 dulu.
2. **D-2 (C):** apakah penerimaan tanpa siswa boleh dialokasikan ke banyak siswa (pembayaran gabungan) atau wajib ber-siswa.
3. **D-3 (B):** pemetaan kategori transaksi V1 (eksplisit oleh pengguna, seperti akun) atau transaksi V1 pengeluaran tetap pengecualian; apakah migrasi boot V1 dinonaktifkan pada mode pusat.
4. **D-4 (F):** nonaktifkan `importWizardConfirm`/`importWizardConfirmSiswa` untuk lima modul V2 (mengubah ekspektasi AK-08, IA-05, IA-07 — perlu izin eksplisit).
5. **D-5:** `centralLegacyMigrate` hanya untuk transaksi (tanpa master) atau master dengan konfirmasi per koleksi (R-9).
6. **D-6:** GAP-005 jenis akun & executeAs/access.
7. Tetap terbuka: D-T1/D-T1-link, D-LPJ, D-IMP-8, U-1, U-5, K-RAB-07, GAP-028.

## 12. Langkah menyiapkan uji nonproduksi

Sama dengan P1_19 §9, ditambah: tempel juga `KategoriPengeluaranAudit.gs`; pastikan `21_KATEGORI_PENGELUARAN` & `22_SUBKATEGORI` salinan berisi master aktif (tanpa itu pengeluaran gagal tertutup `KATEGORI_MASTER_TIDAK_TERSEDIA`); jalankan `opKategoriPengeluaranAudit()` di salinan dan catat jumlah transaksi historis yang perlu ditinjau (tanpa mengubahnya); untuk migrasi V1, uji hanya di peramban/profil terpisah yang memuat data V1 contoh, bukan data produksi. Ringkas:

1. Salinan spreadsheet bertanda UJI (ID ≠ `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`).
2. Proyek Apps Script terikat salinan; tempel `.gs` + `Bendahara_V2.html` + `ServerBridge.html` + `_live_tests/LiveReadiness.gs`.
3. Script Properties `LIVE_TEST_SPREADSHEET_ID`, `BUKTI_FOLDER_ID` (folder khusus uji).
4. Dua akun uji (BENDAHARA, AUDITOR) tanpa akses ke spreadsheet/folder produksi; isi `26_USER_ACCESS` salinan.
5. Deploy web app dari proyek uji; catat executeAs/access.
6. `ltPreflight()`, `ltReadOnlyChecks()`, `ltRejectionChecks()`; lalu skenario §9 dengan akun nyata.
7. `ltPostflight()`; bandingkan jumlah baris & 544 TEREKONSILIASI dengan snapshot.
8. Buang salinan, Script Properties, folder uji; cabut akses akun uji.
