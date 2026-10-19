# P1_19 — Finalisasi Integritas Transaksi

**Tanggal:** 19 Oktober 2026
**Commit awal:** `9a27b50` (P1_18), diverifikasi sebelum perubahan: branch `claude/trusting-keller-84usce`, HEAD = remote, working tree bersih, commit P1_18 tersedia. Baseline dijalankan ulang sendiri: 17 suite, 533/0/42, build deterministik.
**Status akhir: `BLOCKED`** untuk uji integrasi nonproduksi (prasyarat lingkungan belum tersedia, §5). Kode siap ditinjau dan diuji di lingkungan nonproduksi (`READY_FOR_INTEGRATION_TEST` begitu prasyarat §9 terpenuhi). **Tidak ada uji live yang dijalankan**, tidak ada deploy, tidak ada data produksi yang disentuh.

## 1. Ringkasan eksekutif

- **Celah konkurensi nyata di jalur transaksi biasa ditemukan dan ditutup.** Pada `9a27b50`, dua pembayaran Rp800.000 bersamaan untuk sisa kewajiban Rp1.000.000 sama-sama tersimpan (alokasi Rp1.600.000) lewat `opCreateIncome` maupun `opCreateAllocation`, karena pemeriksaan sisa kewajiban (`opAllocGuard_`) berjalan sebelum kunci engine. Kini sisa kewajiban dibaca ulang **di dalam kunci engine, di titik penulisan**; satu kunci per operasi; retry tetap idempoten.
- Koreksi transaksi beralokasi tidak lagi dapat mengganti siswa (alokasi akan menunjuk siswa lain) dan tidak dapat mengosongkan akun.
- Fallback akun/kategori pertama ditutup di semua jalur transaksi baru yang masih dapat dipanggil, termasuk fungsi global wizard lama. Migrasi V1→V2 tidak diubah (historis) — diaudit.
- Pengaman kewajiban klien dilengkapi: angka/badge kewajiban, ekspor, Kontrol Keuangan, wizard Pembayaran, Alokasi Cepat, laporan bulanan.
- GAP-005: konfigurasi deploy **tidak ada di repo**; harus diverifikasi di proyek Apps Script. Folder bukti uji kini dapat dikunci lewat Script Property; mode uji menolak unggah tanpa folder uji.
- 19 suite sandbox: **555 PASS, 0 FAIL, 44 INFO**.

## 2. Peta jalur penulisan transaksi dan alokasi

| Jalur | Fungsi klien | Fungsi server | Cek sisa kewajiban | Kunci | Tulis transaksi | Tulis alokasi | Risiko kedaluwarsa (sebelum → sesudah) | Rollback / pemulihan |
|---|---|---|---|---|---|---|---|---|
| Form Penerimaan | `submitPenerimaan` → `postTransaksi` → sinkron `centralPushTrx_`/`centralPushTrxBatch_` | `opCreateIncome` / `opCreateTxBatch` → `opEngineWrite_` → `createIncome_` → `createTransactionWithAllocations_` | `opAllocGuard_` (pra-kunci) **+ `engineAllocObligationCheck_` di dalam kunci** | `withLock_` engine (satu) | di dalam kunci | di dalam kunci, satu operasi dengan transaksi | **TINGGI → tertutup** (TI-01) | alokasi gagal → transaksi dihapus; idempotensi → audit terakhir; audit gagal → semua dihapus (TI-05) |
| Wizard Pembayaran | `pwSubmit` → `postTransaksi` + `createAlokasi` (dikirim bersama sebagai `allocations[]`) | sama | sama | sama | sama | sama | sama | sama; retry `clientRequestId = ui_<id>` |
| Alokasi ke transaksi yang ada | editor alokasi / Alokasi Cepat → `centralPushAlk_` | `opCreateAllocation` → `createAllocation_` | pra-kunci **+ di dalam kunci** | engine | — | di dalam kunci | **TINGGI → tertutup** (TI-06) | status gagal / idempotensi / audit gagal → alokasi dihapus |
| Form Pengeluaran | `submitPengeluaran` | `opCreateExpense` | tidak relevan (tidak mengalokasi kewajiban) | engine | di dalam kunci | — | — | sama |
| Koreksi transaksi | overlay `centralPushPatch_` | `opUpdateTransaction` → `updateTransaction_` | nominal ≥ Σ alokasi aktif, dibaca di dalam kunci | engine | di dalam kunci | — | rendah; **ganti siswa pada transaksi beralokasi kini ditolak** (TI-08), akun tidak boleh dikosongkan (AK-10) | nilai dipulihkan bila audit gagal; `_expect` → CONFLICT |
| Arsip transaksi / alokasi | arsip | `opArchiveTransaction` / `opArchiveAllocation` | status dihitung ulang (gagal tertutup bila kewajiban tidak tersedia) | satu kunci | arsip | arsip | rendah (mengurangi alokasi) | `opArchiveUndo_` |
| Impor V2 | wizard V2 | `opImportCommit` → jalur di atas | hitung ulang pratinjau + cek engine | **satu kunci untuk seluruh potongan** (P1_18) | via engine | via engine | tertutup (CC-03, TI-07) | per baris + log/audit |
| Mutasi bank → transaksi | `createTransaksiFromMutasi` | `opCreateIncome` + `opMatchMutasi` | tanpa alokasi | engine | ya | — | — | pencocokan setelah transaksi terkonfirmasi |
| Snapshot kewajiban | Pusat Data | `opObligationSnapshot`, `opRecordBatch('kewajiban')` | — | kunci | — | — (04_KEWAJIBAN) | snapshot dapat mengubah netto beku; di luar cakupan (risiko R-4) | audit/rollback RecordEngine |
| Tarif | Pengaturan | `opTarifApply` | — | kunci | — | — | mengubah kewajiban ke depan; di luar cakupan | — |

**Mekanisme tunggal:** setiap penulisan yang bergantung pada sisa kewajiban melewati engine yang, **di dalam kunci yang sama dengan penulisannya**, (1) memeriksa idempotensi (retry → replay, bukan penolakan palsu), (2) membaca ulang transaksi/akun/siswa, (3) membaca ulang sisa kewajiban dari Sheets (`engineAllocObligationCheck_` → `allocObligationCheck_`, termasuk pengaman periode/sumber), lalu (4) menulis–idempotensi–audit dengan rollback. `withLock_` reentran per eksekusi, sehingga fungsi internal tidak melepas kunci induk. Validasi klien hanya UX.

**Duplikasi:** jalur biasa mengandalkan idempotensi `clientRequestId` (retry/kirim ulang tidak ganda). Dua pengguna yang memasukkan pembayaran berbeda dengan tanggal & nominal sama **tidak** diblokir server (sesuai larangan menyimpulkan duplikat dari tanggal & nominal); peringatan duplikat klien tetap ada. Impor V2 memeriksa duplikat di dalam kunci.

## 3. Audit akun otomatis

| Klasifikasi | Jalur | Sebelum | Sesudah |
|---|---|---|---|
| 1. Jalur transaksi baru aktif | form Penerimaan/Pengeluaran, wizard Pembayaran, Buat Transaksi dari Mutasi, wizard Mutasi Bank lama, Impor V2, T1 LPJ | akun/kategori pertama terpilih atau otomatis (sebagian diperbaiki P1_18) | akun & kategori wajib eksplisit; server `opEngineWrite_` menolak akun kosong, `akunExists_` menolak akun tak dikenal (AK-01, AK-02, AK-04, AK-05, AK-09) |
| 2. Jalur lama yang masih dapat dipanggil | `commitPenerimaanRow`, `commitPengeluaranRow` (fungsi global; tombol dialihkan ke V2), penyelesai antrean impor lama | `akunKasBankList[0]`, `kategoriPengeluaranList[0]` | akun/kategori wajib disebut & cocok master; tanpa itu baris tertahan (HOLD) dengan alasan (AK-08); antrean lama diblokir (IC-10, AK-06) |
| 2. Koreksi | `opUpdateTransaction` | akun dapat dikosongkan | ditolak (AK-10) |
| 3. Migrasi historis | `migrateV1ToV2` (saat boot, lokal) → opsional `centralLegacyMigrate` (Pusat Data → "Migrasikan ke server") | akun pertama untuk semua transaksi V1 | **tidak diubah, tidak dijalankan** — audit di bawah |
| 4. Baca saja | laporan, KPI, FCC | — | — |
| 5. Kode mati terverifikasi | `doPost` (`LEGACY_DOPOST_ENABLED_ = false`) | — | tetap nonaktif |

**Audit migrasi V1→V2 (AK-11, INFO; tidak ada perubahan kode):**
- Semua transaksi V1 diberi `akunKasBankList[0]` (dalam uji: `akun_kas1`).
- Boot ulang tidak mengulang migrasi (penanda `migratedFromV1`).
- "Jalankan Migrasi Sekarang" (`runMigrationNow`) menghapus penanda dan menjalankan ulang: koleksi lokal **ditimpa** dengan id baru (bukan ditambah).
- Transaksi hasil migrasi tidak otomatis disinkronkan (`_pendingSync` kosong), tetapi **dapat dikirim ke server** lewat `centralLegacyMigrate` dengan akun hasil fallback; perlindungan satu-satunya adalah sidik `jenis|tanggal|nominal|akunId|siswaId` terhadap data server.
- **Rekomendasi (butuh persetujuan):** (a) nonaktifkan `runMigrationNow` & `centralLegacyMigrate` untuk transaksi V1 pada mode pusat, atau (b) wajibkan pemetaan akun eksplisit per transaksi V1 sebelum dikirim, dengan pratinjau. Jangan jalankan migrasi di produksi.

## 4. Audit pengaman kewajiban

Kontrak tetap: `kgStatus_` (server) dan `kewajibanDataStatus_` / `centralSourcesStatus_` (klien) — **tidak ada status baru**. Keadaan: LENGKAP (termasuk kewajiban nol yang sah), PERIODE_AKTIF_TIDAK_VALID, SUMBER_TIDAK_TERSEDIA, SUMBER_TIDAK_LENGKAP (`SCHEMA_MISMATCH`).

| Area | Status |
|---|---|
| Daftar kewajiban server, snapshot | kode eksplisit (P1_18; T4B-17, T4B-19) |
| Status alokasi (engine) | gagal tertutup (T4B-20) |
| Alokasi baru server (form/impor/alokasi) | ditolak dengan kode (TI-09, TI-10, T4B-21) |
| Rencana alokasi wizard Pembayaran | **baru:** banner + simpan diblokir bila ada siswa (T4B-23) |
| Form Penerimaan bersiswa, Alokasi Cepat | **baru:** diblokir |
| Dashboard (Beranda), posisi/profil siswa, editor alokasi | P1_18 |
| Detail penerimaan & resi, daftar & laporan siswa, badge tunggakan | **baru:** DATA TIDAK TERSEDIA (bukan Rp0) |
| Ekspor Kewajiban/Tunggakan/Siswa | **baru:** diblokir dari halaman mana pun |
| Kontrol Keuangan (FCC) | **baru:** ikut memeriksa periode aktif (T4B-24) |
| Laporan bulanan (snapshot 17_LAPORAN) | **baru:** tidak dibuat |
| Pratinjau/hasil impor | kode server ditampilkan (T4B-21) |
| Belum digerbang (dicatat) | `dataQualityChecks` (daftar Perlu Tindakan), `computeTransaksiAllocationStatus` (tampilan lokal; status resmi dihitung server) |

## 5. Status GAP-005

| Item | Temuan |
|---|---|
| `appsscript.json`, `.clasp.json`, konfigurasi deployment | **Tidak ada di repo.** Execute-as dan akses web app **harus diverifikasi di proyek Apps Script**. |
| Identitas sesi | `Session.getActiveUser().getEmail()` + `26_USER_ACCESS` (gagal tertutup bila kosong/tidak terdaftar/nonaktif). Dengan "Execute as: Me", email pengunjung hanya terbaca untuk akun satu domain Workspace; akun Gmail konsumen → `AUTH_REQUIRED`. Dengan "Execute as: user accessing", pengguna butuh akses edit spreadsheet → dapat mengedit sheet langsung dan melewati semua kontrol server. |
| Spreadsheet | container-bound (`getActiveSpreadsheet`): proyek yang terikat salinan hanya menulis ke salinan. |
| Matriks peran | 57 fungsi publik `op*`/`get*` diuji (GE-05): AUDITOR ditolak semua 30 fungsi tulis; pengguna tak terdaftar ditolak semua fungsi; tidak ada tulisan. `opRecordUpsert` kini memeriksa otorisasi sebelum validasi. Fungsi publik lain: `doGet`, `include`, `doPost` (nonaktif), `test*`/`TEST_*` (hanya `Logger`), `validateDatabaseStructure`, fungsi murni `ObligationEngine` (tanpa konteks → galat, tidak menulis). |
| Folder bukti | dicari berdasarkan nama `Bendahara_Bukti` di Drive pemilik eksekusi. **Baru:** Script Property `BUKTI_FOLDER_ID` mengunci folder; mode uji tanpa folder uji → `TEST_FOLDER_REQUIRED` (GE-01..04); `ltPreflight` melaporkannya. |
| Izin spreadsheet & folder | tidak dapat diverifikasi dari repo. |
| **Kesimpulan** | GAP-005 **tetap terbuka**; keputusan jenis akun & executeAs/access diperlukan. |

Prasyarat uji live tidak dapat diverifikasi di sesi ini (tidak ada ID salinan, proyek Apps Script uji, akun uji, atau folder uji; konektor Google sesi ini milik pengguna dan mungkin berakses produksi — tidak dipakai).

## 6. Daftar commit

| Commit | Isi |
|---|---|
| `8ea265a` | B: cek sisa kewajiban di dalam kunci engine; siswaId transaksi beralokasi terkunci; `tx_integrity_tests` (12); bukti audit `_test_logs/audit_integritas_tx_sebelum_9a27b50.log` |
| `6b67e2a` | C: tutup fallback akun/kategori di jalur lama yang dapat dipanggil; koreksi tidak dapat mengosongkan akun; audit migrasi V1 (INFO) |
| `48bddb7` | D: pengaman kewajiban klien (angka/badge, ekspor, FCC, alokasi baru, laporan bulanan) |
| `17ca277` | E: folder bukti uji (Script Property), otorisasi `opRecordUpsert`, `gap005_tests` |
| (commit ini) | Dokumen P1_19, log `p1_19_*` |

## 7. Hasil seluruh tes (sandbox, `run_all_tests.js p1_19`, log `_test_logs/p1_19_*.log`)

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
| readiness_tests | 6 | 0 | 4 |
| import_audit_tests | 2 | 0 | 10 |
| t4b_tests | 24 | 0 | 0 |
| import_engine_tests | 36 | 0 | 0 |
| import_client_tests | 13 | 0 | 0 |
| concurrency_tests | 8 | 0 | 0 |
| akun_explicit_tests | 9 | 0 | 2 |
| **tx_integrity_tests** (baru) | 12 | 0 | 0 |
| **gap005_tests** (baru) | 5 | 0 | 1 |
| **Total (19 suite)** | **555** | **0** | **44** |

**Tes baru:** TI-01..12, GE-01..06, AK-08..11, T4B-23..24.

**Hasil konkurensi** (kunci eksklusif antar-eksekusi disimulasikan; global per eksekusi dipisah):

| Tes | Sebelum (`9a27b50`) | Sesudah |
|---|---|---|
| TI-01 dua Rp800.000 / sisa Rp1.000.000 | **keduanya tersimpan, alokasi 1.600.000** | satu `ALLOCATION_EXCEEDS_OBLIGATION`, alokasi 800.000 |
| TI-02 total tepat = sisa | 1.000.000 | 1.000.000 (keduanya tersimpan) |
| TI-03 pratinjau sebelum transaksi lain | ditolak | ditolak |
| TI-04 retry setelah respons hilang | replay | replay (tidak ditolak walau sisa habis) |
| TI-05 gagal tulis di tengah | rollback | rollback |
| TI-06 dua alokasi bersamaan | **1.600.000** | 800.000 |
| TI-07 impor + form | form `LOCK_TIMEOUT` lalu ditolak | sama |
| TI-08 koreksi beralokasi | **ganti siswa diizinkan** | `ALLOCATION_LOCKED` |
| TI-09 / TI-10 periode / sumber | ditolak berkode | sama |
| TI-11 audit & penanda periode | ada | ada |
| TI-12 jejak kunci | 1 acq/rel | 1 acq/rel (cek kewajiban di dalamnya) |

**Invarian yang diverifikasi:** KPI-DIFF 31 indikator identik dengan build `25d258b` (T4B-05); diff `FinanceEngine.gs`, `ObligationEngine.gs`, `RabMapping.gs`, `PeriodLock.gs`, `ReconEngine.gs` terhadap `9a27b50` = 0 baris, definisi KPI di HTML tidak berubah; kebijakan periode = penanda (TI-11); jenis TRANSFER tetap ditolak (IE-03, `validateJenis_`); tidak ada migrasi startup baru; histori tidak diubah; sheet lain identik setelah impor (IE-31). 544 TEREKONSILIASI: tidak dapat dibandingkan tanpa salinan data (sandbox: mutasi/rekonsiliasi tidak disentuh).

**Perilaku lama yang berubah:**
1. Alokasi yang melampaui sisa kewajiban karena balapan kini ditolak (sebelumnya tersimpan).
2. `opUpdateTransaction`: ganti `siswaId` pada transaksi beralokasi → `ALLOCATION_LOCKED`; `akunId` kosong → ditolak.
3. Wizard impor lama: tanpa akun/kategori eksplisit → HOLD (dulu akun/kategori pertama). **Input tes lama IA-05/06/09/10 disesuaikan** (kolom akun & kategori ditambah; kontrol yang diuji tidak berubah) — diminta eksplisit oleh instruksi ini.
4. Form Pengeluaran: kategori tidak terpilih otomatis.
5. Saat periode/sumber kewajiban tidak valid: wizard Pembayaran/form Penerimaan bersiswa/Alokasi Cepat/laporan bulanan/ekspor kewajiban diblokir; angka kewajiban tampil DATA TIDAK TERSEDIA.
6. Mode uji tanpa folder bukti uji → unggah ditolak.

**Keterbatasan sandbox:** mock `LockService` (eksklusivitas & reentransi disimulasikan, bukan diuji pada LockService nyata), mock Sheets dalam memori (tanpa konversi tanggal otomatis, tanpa kuota/latensi), `Session` tiruan, Drive tiruan, tidak ada eksekusi paralel sungguhan.

**Tes integrasi yang masih harus dijalankan di Apps Script:** P1_17 §13 + P1_18 §6, ditambah: dua akun mengirim pembayaran bersamaan untuk kewajiban yang sama (satu ditolak, sisa tidak negatif); reentransi `withLock_` dengan LockService nyata; durasi kunci & `LOCK_TIMEOUT` di bawah beban; `Session.getActiveUser()` untuk akun uji sesuai executeAs/access; unggah bukti ke folder uji (`BUKTI_FOLDER_ID`); `ltPreflight` → `ltPostflight` (jumlah baris & 544 TEREKONSILIASI identik).

## 8. Risiko yang belum selesai

| ID | Risiko |
|---|---|
| R-1 | Belum ada bukti live: LockService, kuota, waktu, identitas sesi. |
| R-2 | GAP-005 terbuka (executeAs/access, jenis akun, izin spreadsheet/folder). |
| R-3 | Migrasi V1→V2 & `centralLegacyMigrate` masih dapat mengirim transaksi berakun fallback ke server (§3). |
| R-4 | Snapshot kewajiban (`04_KEWAJIBAN`) dan perubahan tarif dapat mengubah netto setelah alokasi; tidak divalidasi terhadap alokasi yang sudah ada. |
| R-5 | `createAllocation_` tidak memeriksa kecocokan siswa alokasi dengan `siswaId` transaksi (penerimaan baru memeriksanya). |
| R-6 | Kategori pengeluaran tidak divalidasi server terhadap master (hanya klien & Impor V2). |
| R-7 | `dataQualityChecks` belum digerbang pengaman kewajiban. |
| R-8 | Kunci dipegang selama satu potongan impor / satu operasi engine; pengguna lain dapat menerima `LOCK_TIMEOUT` (harus mengulang). |

## 9. Langkah manual menyiapkan lingkungan uji

1. Buat **salinan** spreadsheet (File → Buat salinan) dengan nama yang jelas bertanda UJI; catat ID-nya (harus ≠ `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`).
2. Dari salinan: Ekstensi → Apps Script (proyek **terikat salinan**). Tempel berkas `.gs` + `Bendahara_V2.html` + `ServerBridge.html` dari repo dan `_live_tests/LiveReadiness.gs` (hanya di proyek uji).
3. Script Properties: `LIVE_TEST_SPREADSHEET_ID` = ID salinan; `BUKTI_FOLDER_ID` = ID folder Drive **khusus uji** (nama bukan `Bendahara_Bukti`).
4. Siapkan dua akun uji (BENDAHARA, AUDITOR) yang **tidak** punya akses ke spreadsheet & folder bukti produksi; isi `26_USER_ACCESS` salinan dengan email itu. Pemilik proyek uji sebaiknya juga bukan pemilik produksi.
5. Deploy web app dari proyek uji (catat pilihan executeAs/access untuk keputusan GAP-005). Jangan deploy proyek produksi.
6. Jalankan `ltPreflight()` (harus lolos guard & `buktiFolder.ok`), `ltReadOnlyChecks()`, `ltRejectionChecks()`.
7. Jalankan uji manual/impor sesuai P1_17 §13 dan §7 di atas; catat waktu per potongan, jumlah RPC, kuota, kegagalan.
8. `ltPostflight()`; bandingkan jumlah baris & status mutasi (544 TEREKONSILIASI) dengan snapshot.
9. **Pembersihan:** salinan dibuang setelah uji (data uji tidak pernah dibersihkan dengan menghapus baris di salinan yang akan dipakai ulang); hapus Script Properties & folder uji; cabut akses akun uji.

## 10. Keputusan yang masih memerlukan persetujuan

1. GAP-005: jenis akun (Workspace sekolah vs Gmail) dan executeAs/access web app.
2. Migrasi V1→V2: nonaktifkan `runMigrationNow`/`centralLegacyMigrate` untuk transaksi V1 di mode pusat, atau wajibkan pemetaan akun eksplisit (§3).
3. Validasi server kategori pengeluaran terhadap master (R-6).
4. Validasi `createAllocation_` siswa alokasi = siswa transaksi (R-5).
5. Kontrol snapshot/tarif terhadap alokasi yang sudah ada (R-4).
6. Penghapusan kode wizard impor lama untuk lima modul V2 (kini tanpa fallback, tetapi masih ada).
7. Yang tetap terbuka dari sebelumnya: D-T1/D-T1-link, D-LPJ, D-IMP-8 (format final), U-1, U-5, K-RAB-07, GAP-028.
