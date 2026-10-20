# P1_24 — Kesiapan Nonproduksi, Audit Kewajiban Beku, UI Uang Muka, dan Dampak Kebijakan Keuangan

**Tanggal:** 20 Oktober 2026

**Status:**

| Bagian | Status |
|---|---|
| **Keseluruhan** | **BLOCKED** untuk uji live. Belum tersedia salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji per peran, maupun folder bukti uji |
| Kode baru (harness, perbaikan LPJ, UI uang muka baca-saja) | **READY_FOR_INTEGRATION_TEST**. Lolos seluruh uji sandbox; siap dijalankan di Apps Script nonproduksi setelah prasyarat tersedia |
| Audit D-1, audit FCC/BDS03, U-5, K-RAB-07 | **READY_FOR_REVIEW** (desain/fixture; belum ada data sah) |
| GAP-005 | **Terbuka**. Tidak diklaim selesai |
| Jalur koreksi kewajiban beku (`opKewajibanKoreksi`) | **Tetap ditahan** |
| Verifikasi LPJ operasional | **Nonaktif** (`UM_VERIFIKASI_AKTIF_ = false`) |
| GAP-028 (transfer antar akun) | **BLOCKED** |

Semua hasil uji di bawah adalah **uji sandbox Node** (klien `vm` + server sandbox), **bukan** Apps Script. Tidak ada deployment. Produksi tidak disentuh. Tidak ada setup, migrasi, atau perubahan data historis. Konektor Google Drive/Sheets sesi tidak dipakai.

---

## 1. Branch, HEAD, baseline

| Hal | Nilai |
|---|---|
| Repo | `apapunitubahagia-lang/bendaharaTKMI` |
| Sumber kebenaran | `origin/claude/compassionate-dirac-drm760` @ `3675321` (dokumen P1_23), working tree bersih |
| Branch kerja sesi ini | `claude/hopeful-galileo-mnifgq`. Branch ini leluhur `3675321`, lalu di-*fast-forward* ke `3675321` sebelum bekerja. Tidak ada commit lain di atasnya. `claude/compassionate-dirac-drm760` **tidak diubah** |
| Commit P1_20–P1_23 | `6f3c6ba` (P1_20), `e987aa8` (P1_21), `c2e11ea`/`c026417`/`28c0fa5`/`2d44a37`/`4ef5574` (P1_22), `b96c822`/`15ef05b`/`7b49af0`/`76f4c03`/`708fe6c`/`7f9b22b`/`3675321` (P1_23) — semua leluhur HEAD |
| Build | `node build_all.js` deterministik: setelah build, working tree tetap bersih (berkas hasil build = repo) |
| Baseline | `node run_all_tests.js p1_24_baseline`: **39 suite, 705 / 0 / 65** = angka P1_23 |
| Catatan | Laporan P1_23 menulis "Total (40 suite)", padahal `run_all_tests.js` di `3675321` berisi **39** suite. Angka PASS/FAIL/INFO-nya benar; yang salah hanya jumlah suite |
| HEAD akhir | commit dokumen ini, di atas `903b091` |

### 1.1 Perubahan P1_23 yang berdampak pada server, klien, bridge, skema, dan jalur transaksi (hasil inspeksi kode)

| Lapisan | Perubahan P1_23 | Diperiksa ulang di P1_24 |
|---|---|---|
| Server | `RecordGuard` pengaman kewajiban beku kanonis; `UangMukaLpj.gs` (`opUangMukaBatal`, laporan 4 angka, `opUangMukaDampakFcc`, `umLpjTautanLewatOperasi_`); `RabPersetujuan.gs` klasifikasi | Ya. Ditemukan dua cacat di `UangMukaLpj.gs` (§5.3, §6.2) |
| Klien | id kanonis `kwIdKanon_`; Impor V2 `status` siswa; wizard lama siswa nonaktif; tombol LPJ lewat server | Tidak diubah, kecuali tambahan panel baca-saja (§6) |
| ServerBridge | 5 operasi LPJ/skema | +2 operasi **baca-saja** (§6) |
| Skema | `32_UANG_MUKA`, `33_UANG_MUKA_KEMBALI`, `34_LPJ_TAUTAN`, +9 kolom `19_LPJ`, hanya lewat `opUangMukaLpjSetup` | Tidak diubah. Setup **tidak dijalankan** di spreadsheet mana pun |
| Jalur transaksi | `opCreateExpenseFromLpj` atomik (crid `lpj:<id>`) | Diperbaiki untuk kasus lepas-tautan lalu buat ulang (§5.3) |

### 1.2 Fungsi yang tersedia tetapi belum pernah dijalankan di Apps Script nyata

`opKewajibanBekuAudit`, `opSiswaMasterAudit`, `opRabTidakSurutSimulasi`, `opRabPersetujuanAudit`, `opAlokasiLintasPeriodeAudit`, `opUangMukaLpjPlan`/`opUangMukaLpjSetup`, `opLinkLpj`/`opCreateExpenseFromLpj`/`opUnlinkLpj`, seluruh operasi uang muka (`opUangMukaCair`/`Kembali`/`Batal`/`Laporan`/`DampakFcc`), `opLpjAjukan`/`Terima`/`Verifikasi`, seluruh harness `_live_tests/LiveReadiness.gs` (termasuk tambahan P1_24), `withLock_` dengan `LockService` nyata, `getCurrentUserIdentity` dengan `Session.getActiveUser()` nyata, dan unggah bukti ke folder Drive uji.

---

## 2. GAP-005 — status dan prasyarat

**Status: TERBUKA. Uji live: BLOCKED.**

### 2.1 Prasyarat yang belum tersedia (tidak ada yang diasumsikan ada)

| # | Prasyarat | Tersedia? |
|---|---|---|
| P1 | Salinan spreadsheet nonproduksi (ID ≠ produksi), dibuat oleh akun uji | **Tidak** |
| P2 | Proyek Apps Script **terikat pada salinan**, berisi kode commit uji | **Tidak** |
| P3 | Akun uji BENDAHARA / KEPALA_SEKOLAH / YAYASAN / AUDITOR (bukan pemilik produksi) | **Tidak** |
| P4 | Folder Drive bukti khusus uji (`BUKTI_FOLDER_ID`) | **Tidak** |
| P5 | Keputusan jenis akun (Workspace sekolah vs Gmail biasa) dan `executeAs`/`access` | **Belum diputuskan** |
| P6 | Persetujuan tertulis pemilik untuk menjalankan uji & setup LPJ di salinan | **Belum** |

### 2.2 Audit identitas Apps Script untuk Gmail biasa

Fakta dari kode (`AuthCentral.gs`):
- Identitas hanya berasal dari `Session.getActiveUser().getEmail()`, lalu dicocokkan dengan `26_USER_ACCESS` (status ACTIVE).
- Email kosong menghasilkan `AUTH_REQUIRED`. Galat saat membaca email juga ditangkap dan menghasilkan `AUTH_REQUIRED`. Artinya **gagal tertutup**, tidak pernah menebak.
- Tidak ada token aplikasi. Setiap `google.script.run` menghitung ulang identitas.

Perilaku menurut dokumentasi Apps Script (**belum diverifikasi live**; harus dibuktikan dengan `ltIdentitasProbe`):

| Konfigurasi | Pengguna Gmail biasa (bukan pemilik) | Konsekuensi |
|---|---|---|
| `executeAs: USER_DEPLOYING`, akses: siapa pun dengan akun Google | `getActiveUser().getEmail()` **umumnya kosong** | Server menolak semua (`AUTH_REQUIRED`). Aman, tetapi aplikasi **tidak dapat dipakai** |
| `executeAs: USER_ACCESSING` | Email terbaca | Setiap pengguna **wajib** punya hak edit spreadsheet (dan folder bukti). Akibatnya ia dapat mengedit `26_USER_ACCESS`, `05_TRANSAKSI`, dan `13_AUDIT_LOG` langsung. **Seluruh kontrol server dapat dilewati** |
| Pemilik menjalankan dari editor | Email pemilik terbaca | Tidak membuktikan apa pun untuk pengguna lain |

**Kesimpulan:**
- Dengan Gmail biasa, **tidak ada konfigurasi Apps Script bawaan** yang sekaligus (a) mengenali pengguna dan (b) mencegah pengguna mengedit sheet langsung. Ini temuan arsitektur, bukan bug kode.
- Pilihan yang perlu diputuskan pemilik:
  1. akun dalam satu domain Google Workspace sekolah + `USER_DEPLOYING` + akses domain;
  2. mekanisme identitas lain yang diverifikasi server (GAP-005 asli: token Google diverifikasi di server).
- Keputusan ini **tidak** saya ambil.

### 2.3 Harness baru (khusus salinan; tidak termasuk berkas deploy)

Tambahan pada `_live_tests/LiveReadiness.gs`. Semua fungsi memanggil `ltGuard_()` lebih dulu: menolak bila spreadsheet aktif = produksi, atau bila Script Property `LIVE_TEST_SPREADSHEET_ID` ≠ ID salinan.

| Fungsi | Sifat | Isi |
|---|---|---|
| `ltIdentitasProbe()` | baca-saja | Email aktif/efektif terbaca? (hanya **domain** yang dicatat, bukan email utuh); kode identitas server; diagnosis konfigurasi (`EMAIL_AKTIF_KOSONG` / aktif = efektif / aktif ≠ efektif) |
| `ltKewajibanBekuAudit()` | baca-saja | `opKewajibanBekuAudit` + bukti isi 23 sheet identik sebelum/sesudah (hash nilai) |
| `ltLpjSetupPreview()` | baca-saja | `opUangMukaLpjPlan` + snapshot isi & status mutasi di Script Property |
| `ltLpjSetupApply(konfirmasi, idSalinan)` | **menulis skema** (salinan saja) | Lihat §5 |
| `ltLpjRollbackCek()` | baca-saja | Apakah sheet/kolom LPJ baru sudah berisi data |

Tidak ada fungsi penghapus. Hash adalah FNV/djb2 (`oblHash_`), untuk mendeteksi perubahan, **bukan** pengaman kriptografis.

---

## 3. Checklist lingkungan uji nonproduksi

Dikerjakan oleh pemilik/admin. Setiap butir butuh bukti. **Jangan memakai kredensial produksi; jangan deploy proyek produksi.**

### A. Salinan spreadsheet
- [ ] A1. Masuk dengan **akun uji pemilik salinan** (bukan pemilik produksi; tanpa akses edit ke produksi). *Bukti:* email akun, tangkapan layar berbagi produksi yang tidak memuat akun ini.
- [ ] A2. Dapatkan salinan produksi lewat *File → Make a copy* oleh pemilik produksi, lalu bagikan ke akun uji; **atau** ekspor/impor oleh pemilik. Catat ID salinan; **ID ≠ `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY`**. *Bukti:* ID, tanggal salinan.
- [ ] A3. Beri nama salinan berawalan `UJI_` dan catat jumlah baris 18 sheet inti. Ini sekaligus pembanding untuk `ltPreflight`.
- [ ] A4. Buat **salinan cadangan kedua** (tidak disentuh) sebagai titik pulih.
- [ ] A5. Salinan diperlakukan **sekali pakai**: dibuang setelah uji; tidak pernah diimpor balik ke produksi.

### B. Proyek Apps Script uji
- [ ] B1. *Extensions → Apps Script* **dari salinan**, sehingga proyeknya terikat pada salinan.
- [ ] B2. Ganti seluruh kode lama yang ikut tersalin dengan berkas deploy commit uji (P1_07 §1.5) **ditambah** `_live_tests/LiveReadiness.gs`. **Tanpa** `deps/` dan `_build_tests/`. *Bukti:* hash commit, daftar berkas.
- [ ] B3. Simpan `appsscript.json` uji (`runtimeVersion: V8`, `timeZone: Asia/Jakarta`, `executeAs` dan `access` sesuai keputusan GAP-005) ke folder bukti.
- [ ] B4. Pastikan tidak ada `openById` dan tidak ada pemicu (*trigger*). Kode memakai `getActiveSpreadsheet()`, sehingga hanya salinan yang terjangkau.
- [ ] B5. Script Property `LIVE_TEST_SPREADSHEET_ID` = ID salinan (diisi manual).

### C. Akun uji
- [ ] C1. Empat akun: BENDAHARA, KEPALA_SEKOLAH, YAYASAN, AUDITOR. Jenis akun sesuai keputusan GAP-005.
- [ ] C2. Isi `26_USER_ACCESS` **salinan** secara manual oleh pemilik salinan: satu baris per akun, status ACTIVE. Produksi tidak diubah.
- [ ] C3. Akun uji **tidak** diberi hak edit spreadsheet salinan, kecuali konfigurasi `USER_ACCESSING` sedang diuji. Bila sedang diuji, catat bahwa kontrol server dapat dilewati.

### D. Folder bukti
- [ ] D1. Folder Drive baru milik akun uji, **bukan** bernama `Bendahara_Bukti`.
- [ ] D2. Script Property `BUKTI_FOLDER_ID` = ID folder tersebut. Mode uji menolak unggah tanpa folder ini (P1_19 E).

### E. Konfigurasi akses & identitas
- [ ] E1. Deploy web app **dari proyek uji** (*Test deployment* atau versi khusus uji).
- [ ] E2. Jalankan `ltIdentitasProbe()` dari editor (pemilik salinan), lalu buka web app uji dengan setiap akun uji. Di sisi klien, catat `authorized`/`code`/`role` yang ditampilkan.
- [ ] E3. Bukti GAP-005 = tabel akun × konfigurasi → `emailAktifTerbaca`, `code`, dan apakah akun dapat membuka spreadsheet langsung.

### F. Memastikan tidak ada koneksi ke produksi
- [ ] F1. `ltPreflight()` tidak melempar (bukan produksi, konfirmasi cocok).
- [ ] F2. Pemilik produksi memeriksa riwayat versi spreadsheet produksi sebelum dan sesudah uji: tidak ada suntingan dari akun uji.
- [ ] F3. Folder `Bendahara_Bukti` produksi tidak bertambah berkas.
- [ ] F4. `ltPostflight()`: jumlah baris dan status `11_MUTASI_BANK` identik untuk langkah baca-saja/penolakan.

---

## 4. D-1 — Audit kewajiban beku

### 4.1 Hasil

**Tidak ada salinan data sah.** Data produksi **tidak dibaca**. Audit diperiksa dengan fixture sandbox.

Tambahan baca-saja pada `opKewajibanBekuAudit` (`kwDupKlasifikasi_`):
- Setiap `DUPLIKAT_BEKU` kini memuat:
  - `barisTerpilih`: baris yang dipakai perhitungan saat ini, menurut aturan `kewajibanSatuBaris`: id `kw_` lebih dulu, lalu id terkecil;
  - `idKanonis` dan `idKanonisAda`;
  - per baris: nilai beku dan `alokasiTagihanId`;
  - `alokasiLewatKunciSaja`, `nettoTerpilih`, `selisihTerbayarTerhadapTerpilih`;
  - `tindakanOtomatis: 'TIDAK_ADA'`.
- Klasifikasi:

| Klasifikasi | Syarat |
|---|---|
| `DUPLIKAT_PASTI` | Nilai beku identik (bruto/potongan/netto/tarifSatuan/jumlahHari), **dan** tidak ada alokasi yang menunjuk baris selain `barisTerpilih`, **dan** terbayar ≤ netto terpilih |
| `PERLU_KEPUTUSAN_MANUAL` | Salah satu alasan: `NILAI_BERBEDA`, `ALOKASI_KE_BARIS_TIDAK_TERPILIH`, `ALOKASI_KE_BEBERAPA_BARIS`, `TERBAYAR_MELEBIHI_NETTO_TERPILIH` |

- `ringkasan.duplikatPasti` / `duplikatPerluKeputusan` ditambahkan.
- `konsistensiData` tetap `TIDAK_KONSISTEN` selama ada duplikat apa pun: `DUPLIKAT_PASTI` pun tetap butuh tinjauan.

Bukti (`d1_audit_klasifikasi_tests`, 9 PASS; `lpj_setup_live_tests` LS-03):

| Uji | Skenario | Hasil |
|---|---|---|
| KK-01 | Identik, belum dibayar | `DUPLIKAT_PASTI`, terpilih = id kanonis |
| KK-02 | Identik, dibayar lewat kunci saja | `DUPLIKAT_PASTI`, alokasi dicatat `alokasiLewatKunciSaja` |
| KK-03 | Netto 175.000 vs 200.000 | `PERLU_KEPUTUSAN_MANUAL [NILAI_BERBEDA]` |
| KK-04 | Alokasi menunjuk baris tidak terpilih | `[ALOKASI_KE_BARIS_TIDAK_TERPILIH]` |
| KK-05 | Bayar ke dua baris (400.000 > 200.000) | 3 alasan, selisih +200.000 |
| KK-06 | Dua baris historis non-kanonis, urutan sheet dibalik | Terpilih = id terkecil, **sama dengan baris yang dipakai server** |
| KK-07..09 | Data bersih / AUDITOR / tetap TIDAK_KONSISTEN | — |

Semua uji memastikan **seluruh sheet identik** sebelum dan sesudah audit.

### 4.2 Prosedur setelah salinan sah tersedia

1. Selesaikan §3 A–F.
2. `ltPreflight()`, lalu `ltKewajibanBekuAudit()`. Simpan JSON lengkap ke folder bukti. Syarat lulus: `bacaSaja = true`.
3. Bila `jumlahPerJenis.DUPLIKAT_BEKU > 200`, daftar `pengecualian` terpotong (`MAX = 200`). Catat jumlahnya dan ulangi per subset setelah ada keputusan. Kode tidak diubah untuk ini.
4. Tinjau manual per kunci, minimal oleh Bendahara + satu penyetuju:
   - `DUPLIKAT_PASTI`: kandidat koreksi otomatis-beralasan;
   - `PERLU_KEPUTUSAN_MANUAL`: tentukan baris sah dan nasib alokasinya;
   - `ARSIP_BERPEMBAYARAN`, `ALOKASI_TAGIHAN_TIDAK_DIKENAL`, `ALOKASI_MULTI_BEKU`: periksa transaksi sumbernya.
5. `ltPostflight()`: tidak ada baris berubah.
6. Implementasi `opKewajibanKoreksi` (rancangan P1_22 §2.5) **hanya** setelah hasil tinjauan disetujui tertulis **dan** hubungan kewajiban/alokasi pada data salinan terbukti konsisten.

**Keputusan:** jalur koreksi **tidak diimplementasikan** di P1_24.

---

## 5. Kesiapan setup skema LPJ

**Status:** prosedur dan harness **siap** (READY_FOR_INTEGRATION_TEST). Setup **tidak dijalankan** di spreadsheet mana pun karena salinan belum tersedia.

### 5.1 Prosedur (salinan nonproduksi saja)

| Langkah | Tindakan | Lulus bila |
|---|---|---|
| L-1 | §3 selesai; `ltPreflight()` | Bukan produksi; snapshot tersimpan |
| L-2 | Salinan cadangan (§3 A4) | Ada ID cadangan |
| L-3 | `ltLpjSetupPreview()` | `plan`: 32/33/34 `AKAN_DIBUAT` + 9 kolom `19_LPJ`; tidak ada yang ditulis |
| L-4 | Tinjau plan (sheet & kolom) | Persetujuan pemilik dicatat |
| L-5 | `ltLpjSetupApply('BUAT_SKEMA_UANG_MUKA_LPJ', '<ID salinan>')` | `lulus = true`: setup OK; panggilan ulang `unchanged` (idempoten); `dataLamaBerubah` kosong (kolom lama semua sheet terpantau identik); TEREKONSILIASI identik; hanya `13_AUDIT_LOG` bertambah |
| L-6 | Uji manual lewat web app (akun BENDAHARA uji): buat transaksi dari LPJ; klik ganda; putuskan jaringan lalu ulangi; dua perangkat; tautkan/lepas; lepas lalu buat ulang | Tepat 1 transaksi aktif per LPJ; jalur lama → `GUNAKAN_OPERASI_TAUTAN` |
| L-7 | `ltLpjRollbackCek()` | Mencatat apakah skema sudah dipakai |
| L-8 | `ltPostflight()` lalu buang salinan | — |

`ltLpjSetupApply` menolak:
- tanpa pratinjau;
- ID salinan tidak cocok;
- konfirmasi salah (`CONFIRM_REQUIRED`);
- data berubah sejak pratinjau.

### 5.2 Uji sandbox (`lpj_setup_live_tests`, 12 PASS)

| Uji | Isi |
|---|---|
| LS-01 | Semua fungsi harness baru menolak produksi dan salinan tanpa konfirmasi |
| LS-02 | Probe identitas: terbaca → SUCCESS; email kosong (Gmail konsumen) → AUTH_REQUIRED + diagnosis; `getActiveUser` melempar → gagal tertutup; email tidak dicatat utuh |
| LS-03 | Audit D-1 lewat harness, baca-saja |
| LS-04 | Pratinjau baca-saja |
| LS-05 | Empat penolakan setup |
| LS-06 | Setup pada data historis (2 LPJ lama, salah satunya bertaut; 2 TEREKONSILIASI): data lama identik, idempoten, TEREKONSILIASI 2 → 2 |
| LS-07 | **Kegagalan parsial setup** (sheet 33 gagal dibuat): `WRITE_FAILED`; pratinjau menunjukkan sisa; setup ulang melengkapi tanpa duplikat |
| LS-08 | Cek rollback: kosong → aman dihapus manual; sudah dipakai → jangan dihapus |
| LS-09 | Klik ganda → REPLAY; jalur lama → `GUNAKAN_OPERASI_TAUTAN` (satu jalur efektif) |
| LS-10..12 | Perbaikan §5.3 + kegagalan parsial pada generasi kedua |

Ditambah BR-01..10 dan LK-01..07 (P1_23) yang tetap lulus.

### 5.3 Cacat ditemukan & diperbaiki: buat ulang setelah lepas tautan

Sebelum P1_24, alur berikut menautkan ulang LPJ ke **transaksi yang sudah diarsip**, dan hasilnya dilaporkan sukses:
1. `opCreateExpenseFromLpj`;
2. `opUnlinkLpj`;
3. arsip transaksi lama;
4. "Buat Transaksi dari LPJ" lagi.

Penyebabnya: replay idempotensi `lpj:<id>`. Pengeluaran ganda tidak terjadi, tetapi LPJ bertaut ke transaksi yang sudah batal.

**Perbaikan (`UangMukaLpj.gs`):**
- crid per generasi tautan: `lpj:<id>`, lalu `lpj:<id>:<n>` setelah n pembatalan tautan (deterministik dari `34_LPJ_TAUTAN`).
- Generasi baru hanya membuat transaksi bila semua transaksi generasi sebelumnya sudah diarsip.
- Bila transaksi lama masih aktif → `TRANSAKSI_LPJ_SEBELUMNYA_AKTIF` (tautkan ulang lewat Tautkan, atau arsipkan dulu).
- Perilaku generasi pertama tidak berubah (BR/LK identik).

### 5.4 Rollback setup

Tidak ada hapus otomatis.
- Salinan uji: buang salinan.
- Bila salinan dipertahankan dan `ltLpjRollbackCek().kosong = true`, sheet 32/33/34 dan kolom baru `19_LPJ` boleh dihapus **manual**.
- Bila sudah berisi data: jangan dihapus. Revert kode saja, karena kode lama tidak membaca kolom/sheet tambahan.
- Catatan: pada kegagalan parsial, audit `SCHEMA_CREATE_SHEET` mencatat semua sheet yang **direncanakan**, termasuk yang gagal dibuat. Setup ulang menulis audit untuk sisanya.

---

## 6. D-T1 — Prototipe UI uang muka & hasil uji

### 6.1 Audit `UangMukaLpj.gs`

| Syarat | Temuan |
|---|---|
| DIBATALKAN tidak menghapus jejak pencairan | Terpenuhi (P1_23 UB). UI menampilkan DIBATALKAN beserta id transaksi pencairan |
| Pengembalian terhubung ke sumbernya | Terpenuhi: `33.uangMukaId` wajib dan diperiksa; transaksi PENERIMAAN bersumber "Pengembalian Uang Muka" (UI-04) |
| Pencairan, nota, dan pengembalian tidak dihitung ganda | Nota tidak menjadi transaksi kas; LPJ uang muka tidak dapat ditautkan/dijadikan transaksi. **Cacat:** lihat §6.2 |

### 6.2 Cacat ditemukan & diperbaiki: posisi uang muka vs transaksi kas

Transaksi pencairan/pengembalian masih dapat diarsip lewat `opArchiveTransaction` umum. Sebelum P1_24, `umPosisi_` tetap menghitung pengembalian yang transaksinya sudah diarsip. Akibatnya saldo terlalu kecil dan status dapat menjadi SELESAI, sementara FCC sudah tidak menghitung transaksi itu.

**Perbaikan:**
- pengembalian dengan transaksi diarsip tidak dihitung;
- `arusKasKeluar` = nominal transaksi pencairan **aktif** (0 bila diarsip), sehingga sama dengan basis FCC;
- `opUangMukaLaporan` memberi `peringatan`: `PENCAIRAN_DIARSIP_ATAU_HILANG`, `NOMINAL_PENCAIRAN_BERBEDA`, `PENGEMBALIAN_DIARSIP`;
- field lama `kasKeluar` (= `nominalCair`) dipertahankan.

**Tidak ditambahkan** larangan baru mengarsip transaksi pencairan. Itu keputusan kebijakan (§13).

### 6.3 UI (baca-saja)

Lokasi: *Pusat Data → "Uang muka (baca-saja)…"* (`apply_um_ui_client.js`).

Per uang muka + total:

| (1) Arus kas keluar | (2) Pengeluaran dilaporkan | (3) Pengeluaran terverifikasi | (4) Saldo belum dipertanggungjawabkan | Pengembalian | Catatan/peringatan |
|---|---|---|---|---|---|

- Tombol "Audit dampak FCC/BDS03" untuk satu periode.
- **Tidak ada tombol tulis.**
- Bridge hanya menambah `opUangMukaLaporan` dan `opUangMukaDampakFcc` (peran baca).
- Pencairan, pengembalian, pembatalan, ajukan/terima/verifikasi tetap **tidak diekspos** (keputusan D-T1 / GAP-005).
- Sebelum setup skema: pesan "Skema uang muka belum disiapkan".

### 6.4 Hasil uji (`um_ui_tests`, 8 PASS)

| Uji | Hasil |
|---|---|
| UI-01 | Hanya 2 operasi baca ditambahkan ke bridge; 6 operasi tulis tidak diekspos |
| UI-02 | Sebelum setup: pesan skema, tidak ada penulisan |
| UI-03 | A: 2.000.000 / 1.700.000 / 1.000.000 / 1.000.000 / kembali 0. B (DIBATALKAN): 500.000 / 0 / 0 / 300.000 / kembali 200.000; jejak pencairan tampil; baca-saja |
| UI-04 | Transaksi kas = 2 pencairan + 1 pengembalian; 0 transaksi dari nota; Σ arus kas = Σ transaksi pencairan; pengembalian tertaut B |
| UI-05 | Arsip pengembalian → tidak dihitung, saldo kembali 500.000 + peringatan; arsip pencairan → arus kas 0 + peringatan; peringatan tampil di UI |
| UI-06 | Dampak FCC lewat UI (§7) |
| UI-07 | AUDITOR baca OK; cair → `ROLE_NOT_ALLOWED` |
| UI-08 | Blok UI tidak memanggil operasi tulis |

Render peramban yang sebenarnya (modal, tata letak) **belum diuji**. Sandbox hanya memeriksa HTML yang dihasilkan.

---

## 7. Audit dampak FCC / BDS03 (before/after)

Hanya **fixture sandbox** (UI-06). Tidak ada angka untuk data nyata dan tidak ada angka hasil asumsi.

Fixture September 2026 (fixture dasar + uang muka A & B + pengembalian 200.000 di September):

| | Sekarang (formula aktif = `opFinancialControl`) | Simulasi basis beban (**tidak diterapkan**) |
|---|---|---|
| Pengeluaran aktual | 2.550.000 | 1.050.000 (= − 2.500.000 pencairan + 1.000.000 nota terverifikasi) |
| Penerimaan | 400.000 | 200.000 (= − 200.000 pengembalian) |
| Posisi kas | −2.150.000 | −2.150.000 (sama) |
| Transaksi pencairan dalam populasi BDS03 | 2 | — |

Indikator terkait: semua indikator BDS03 yang berbasis populasi/nilai PENGELUARAN (pencairan ikut sebagai pengeluaran aktual penuh), serta rasio FCC berbasis pengeluaran aktual.

**Tidak ada** formula, bobot, target, atau ambang yang diubah. Pemeriksaan: diff `Bendahara_V2.html` `3675321..HEAD` = 31 baris tambahan, **0** baris memuat `indDef`/`BDS0x-I`/bobot/ambang/target. `FinanceEngine.gs`, `RabMapping.gs`, `ReconEngine.gs`, `PeriodLock.gs`, `TransactionEngine.gs`, dan `TarifPlan.gs`: diff **0**.

---

## 8. U-5 — RAB tidak berlaku surut (audit baca-saja)

Tidak ada kode baru. `opRabTidakSurutSimulasi` (P1_22/P1_23) **tidak mengubah** pencocokan aktif, data, maupun formula (US-03: seluruh sheet & `opRabRealization` identik).

Before/after (fixture sandbox; masukan I03/I05 per transaksi, **bukan** skor KPI):

| Kasus | RAB | Sekarang I03/I05 | Simulasi I03/I05 (min–maks) | Status |
|---|---|---|---|---|
| US-01 | METADATA_SAH, disetujui sebelum transaksi | 1/1 | 1/1 | TIDAK_TERDAMPAK |
| US-02 | METADATA_SAH, disetujui 20-09, transaksi 05-09 | 1/1 | 0/0 | BERUBAH_GAGAL (alasan tertulis) |
| US-04 | HISTORI_TIDAK_LENGKAP | 1/1 | 0–1 / 0–1 | TIDAK_DAPAT_DINILAI (tanggal tidak dikarang) |
| US-05 | METADATA_SAH sesudah transaksi, tertaut komitmen | 1/1 | 0/1 | I03 gagal, I05 tetap lulus |
| US-06 | Belum disetujui | 0/0 | 0/0 | Tidak terdampak |

**Pemetaan ke keputusan U-5:** opsi "terapkan tidak-berlaku-surut **hanya** untuk RAB METADATA_SAH" = kolom **maks**, karena RAB HISTORI_TIDAK_LENGKAP dianggap lulus. Opsi "terapkan ke semua" = kolom **min**. Data nyata belum diukur.

**Kasus yang memerlukan keputusan:**
1. Transaksi `BERUBAH_GAGAL`: apakah I03 boleh turun pada periode yang sudah ditutup? Opsi: hanya periode setelah tanggal keputusan.
2. RAB `HISTORI_TIDAK_LENGKAP`: tetap dianggap sah (maks), atau dinilai ulang lewat persetujuan susulan (butuh GAP-005)?
3. Komitmen yang meluluskan I05 tanpa RAB yang disetujui tepat waktu: apakah tetap cukup?
4. Persetujuan dicabut lalu disetujui ulang: tanggal mana yang berlaku? Saat ini metadata ditimpa dengan waktu persetujuan terakhir; riwayat ada di audit.

---

## 9. K-RAB-07 — Matriks kewenangan & threat model (desain saja)

Tidak ada enforcement baru. Tidak ada ambang, jenis pengecualian, batas kewenangan, atau aturan pencabutan yang ditetapkan.

### 9.1 Matriks kewenangan

| Tindakan | BENDAHARA | KEPALA_SEKOLAH | YAYASAN | AUDITOR |
|---|---|---|---|---|
| Mencatat pengeluaran & unggah bukti | Ya | Tidak | Tidak | Tidak |
| Menyetujui pengeluaran di luar RAB ≤ ambang A | Tidak | **TBD** | **TBD** | Tidak |
| Menyetujui pengeluaran di luar RAB > ambang A (ambang B?) | Tidak | **TBD** | **TBD** | Tidak |
| Menyetujui pengecualian tanpa bukti (jenis **TBD**) | Tidak | **TBD** | **TBD** | Tidak |
| Mencabut persetujuan | Tidak | **TBD** | **TBD** | Tidak |
| Persetujuan susulan (batas waktu **TBD**) | Tidak | **TBD** | **TBD** | Tidak |
| Mengarsip transaksi pencairan/pengembalian uang muka (temuan §6.2) | Ya (saat ini, tanpa pembatasan) | **TBD** | **TBD** | Tidak |
| Membaca persetujuan, laporan uang muka & audit | Ya | Ya | Ya | Ya |

### 9.2 Threat model

Semua baris P1_22 §6 tetap berlaku. Tambahan P1_24:

| Ancaman | Kontrol | Status |
|---|---|---|
| Identitas penyetuju tidak dapat dipastikan (Gmail biasa, §2.2) | Persetujuan hanya bermakna bila identitas sesi terbukti | **Prasyarat**: GAP-005 |
| Pencairan diarsip agar saldo uang muka "hilang" | Laporan memberi peringatan (§6.2); larangan/persetujuan arsip **TBD** | Deteksi saja |
| LPJ dilepas lalu dibuat ulang untuk menggandakan pengeluaran | `TRANSAKSI_LPJ_SEBELUMNYA_AKTIF` (§5.3) | Diuji sandbox |

---

## 10. File, fungsi, dan commit yang berubah (`3675321..HEAD`: 14 berkas, +526 / −15, ditambah dokumen & log)

| Commit | Ringkasan | File / fungsi |
|---|---|---|
| `4d85507` | D-1 klasifikasi duplikat beku | `KewajibanBekuAudit.gs` (`opKewajibanBekuAudit` + **baru** `kwDupKlasifikasi_`); **baru** `d1_audit_klasifikasi_tests.js`; `run_all_tests.js` |
| `bb5dd5d` | Harness salinan + perbaikan LPJ | `_live_tests/LiveReadiness.gs` (**baru** `ltIsi_`, `ltIsiBanding_`, `ltColsDari_`, `ltIdentitasProbe`, `ltKewajibanBekuAudit`, `ltLpjSetupPreview`, `ltLpjSetupApply`, `ltLpjRollbackCek`); `UangMukaLpj.gs` (**baru** `umLpjCrid_`, `opCreateExpenseFromLpj`); **baru** `lpj_setup_live_tests.js`; `run_all_tests.js` |
| `903b091` | UI uang muka baca-saja + konsistensi posisi | `UangMukaLpj.gs` (`umPosisi_`, `opUangMukaLaporan`); `build_bridge.js` (+`opUangMukaLaporan`, `opUangMukaDampakFcc`); **baru** `apply_um_ui_client.js` (`umLaporanHtml_`, `umDampakHtml_`, `umOpsTersedia_`, `umGagal_`, `pdUangMuka`, `pdUangMukaDampak`, tombol Pusat Data); `build_all.js`; dihasilkan `Bendahara_V2.html`, `ServerBridge.js/.html`, `_um_ui_client_patch_log.txt`; **baru** `um_ui_tests.js`; `run_all_tests.js` |
| (commit ini) | Laporan + log | `P1_24_*.md`, `_test_logs/p1_24_*.log`, `_test_logs/p1_24_baseline_*.log` |

**Tidak berubah:** `FinanceEngine.gs`, `RabMapping.gs`, `RabPersetujuan.gs`, `TarifPlan.gs`, `ReconEngine.gs`, `PeriodLock.gs`, `TransactionEngine.gs`, `RecordGuard.gs`, `AuthCentral.gs`, `ObligationEngine.gs`; definisi 31 KPI.

Berkas hasil build tidak diedit tangan.

## 11. Hasil uji per suite (`node run_all_tests.js p1_24`; log `_test_logs/p1_24_*.log`)

| Suite | Baseline P/F/I | Akhir P/F/I | Catatan |
|---|---|---|---|
| 39 suite lama (server_pass2 58, e2e_central2 84, tarif_server 52, tarif_client 40, schema_archive 27, p0 45/0/1, p1 60, rab 35/0/2, audit_p1 8/0/23, p0_hardening 32/0/1, readiness 6/0/4, import_audit 2/0/10, t4b 24, import_engine 36, import_client 13, concurrency 8, akun_explicit 9/0/2, tx_integrity 12, gap005 5/0/1, v1_migrasi 8/0/1, alloc_siswa 8/0/1, kategori 10, snapshot_tarif 3/0/3, legacy_import 3/0/1, d5 5, d3 8, d1_kewajiban_audit 4/0/5, u5_rab_persetujuan 8, d4_impor_lama 4/0/1, d2 8/0/1, dimp8 6/0/1, u1 3/0/1, d1_identitas 7/0/2, d4_siswa_audit 8/0/1, u5_simulasi 8, um_lpj 19/0/1, d1_kanon 13, um_batal 6/0/1, lpj_bridge 10/0/1) | 705/0/65 | **identik** | Tidak ada asersi atau fixture lama yang diubah |
| d1_audit_klasifikasi_tests | — | 9/0/0 | baru |
| lpj_setup_live_tests | — | 12/0/0 | baru |
| um_ui_tests | — | 8/0/0 | baru |
| **Total (42 suite)** | **705/0/65** | **734/0/65** | |

**Perubahan fixture/ekspektasi uji lama: tidak ada.** `client_env.js` dan `srv_env.js` tidak diubah. INFO lama D1-04/05/06/09 masih menggambarkan perilaku sebelum P1_23 (tidak diubah; INFO tidak memengaruhi lulus/gagal).

## 12. Rollback (diverifikasi di worktree terpisah)

| Uji | Hasil |
|---|---|
| Revert semua commit P1_24 kode, urutan terbalik (`903b091` → `bb5dd5d` → `4d85507`) | Tree **identik** dengan `3675321` (`git diff` 0 baris); build + uji **39 suite, 705/0/65** = baseline |
| Revert `903b091` saja (dari HEAD) | Bersih; build + uji **41 suite, 726/0/65** |
| Revert `bb5dd5d` saja | **Konflik** pada `_build_tests/run_all_tests.js` (daftar suite) |
| Revert `4d85507` saja | **Konflik** pada `_build_tests/run_all_tests.js` |

**Instruksi:**
```
git revert --no-edit <commit-terbaru> ... <commit-yang-diinginkan>
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```
Atau revert satu commit lalu hapus nama suite terkait dari baris daftar `run_all_tests.js` secara manual.

Tidak ada rollback data: tidak ada data, skema, atau setup yang dijalankan.

## 13. Risiko & keputusan yang masih dibutuhkan

### Risiko terbuka

| ID | Risiko |
|---|---|
| R-1 | GAP-005: dengan Gmail biasa, tidak ada konfigurasi bawaan yang aman sekaligus berfungsi (§2.2). Semua kontrol peran bergantung padanya |
| R-2 | Transaksi pencairan/pengembalian uang muka dapat diarsip/diubah lewat jalur transaksi umum. Kini terdeteksi di laporan, **tidak dicegah** |
| R-3 | `umPosisi_` memanggil `getTransactionRaw_` per baris. Performa di Apps Script untuk banyak uang muka belum diukur |
| R-4 | Audit setup parsial mencatat sheet yang direncanakan, bukan hanya yang berhasil dibuat (§5.4) |
| R-5 | Daftar pengecualian audit D-1 terpotong pada 200 butir; jumlah per jenis tetap lengkap |
| R-6 | Klien basi yang membekukan dengan nilai berbeda: antrean terblokir, pesan UX belum khusus (P1_23) |
| R-7 | Teks INFO D1-04/05/06/09 usang |
| R-8 | Belum pernah dijalankan di Apps Script nyata: LockService, `Session.getActiveUser`, jaringan, render UI, semua audit pada data nyata, harness P1_24 |
| R-9 | 544 TEREKONSILIASI: tidak ada kode yang menyentuh 16_REKONSILIASI / ReconEngine; **tidak diverifikasi ulang** karena tidak ada salinan sah |

### Keputusan yang dibutuhkan dari pemilik sistem

1. **GAP-005 / D-T7:** jenis akun (Workspace sekolah vs Gmail + verifikasi token), `executeAs`/`access`, prosedur admin peran.
2. **Lingkungan uji:** sediakan prasyarat §2.1 (P1–P6) dan setujui checklist §3.
3. **D-1:** jalankan §4.2 pada salinan; tinjau `DUPLIKAT_PASTI` / `PERLU_KEPUTUSAN_MANUAL`; setelah itu putuskan apakah `opKewajibanKoreksi` boleh diimplementasikan.
4. **D-LPJ:** setujui uji §5.1 di salinan. Jadwal setup produksi terpisah; setelah setup, jalur lama tertutup.
5. **D-T1:**
   - basis beban untuk FCC/BDS03 (perubahan definisi KPI, §7);
   - perlu tidaknya UI **tulis** uang muka (cair/kembali/batal);
   - apakah pengarsipan transaksi pencairan/pengembalian harus dicegah atau butuh persetujuan (R-2).
6. **U-5:** terapkan hanya untuk RAB METADATA_SAH (kolom maks), atau semua; plus 4 kasus di §8.
7. **K-RAB-07:** semua TBD di §9.1 (ambang A/B, jenis pengecualian, batas kewenangan, pencabutan, sumber BDS03-I05, batas waktu persetujuan susulan).
8. **GAP-028:** tetap BLOCKED.

## 14. Bukti tidak ada deployment / perubahan produksi

- Tidak ada `appsscript.json` / `.clasp.json` di diff.
- ID produksi muncul di diff **satu kali**: konstanta `PROD` dalam `lpj_setup_live_tests.js`, untuk menguji bahwa harness **menolak** produksi (pola sama dengan `readiness_tests.js`).
- Konektor Google Drive/Sheets sesi tidak dipakai.
- Tidak ada setup, migrasi, atau penulisan ke spreadsheet mana pun.
