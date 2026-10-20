# P1_23 — Canonical Obligation Identity, Student Import Completion, Advance/LPJ ServerBridge Integration

**Tanggal:** 20 Oktober 2026

**Status:**
- Kode: **READY_FOR_INTEGRATION_TEST**. Lolos seluruh uji sandbox dan siap diuji pada Apps Script nonproduksi.
- Uji integrasi live: **BLOCKED**. Belum ada salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji per peran, maupun folder bukti uji.
- Jalur koreksi kewajiban beku: **tetap ditahan** (§3.5).
- Verifikasi LPJ operasional: **nonaktif** (GAP-005).

Semua hasil adalah **uji sandbox Node** (klien `vm` + server sandbox), **bukan** uji Apps Script. Tidak ada deployment. Produksi tidak disentuh. Tidak ada migrasi dan tidak ada data historis yang diubah.

---

## 1. Branch & HEAD

| Hal | Nilai |
|---|---|
| Repo / branch | `apapunitubahagia-lang/bendaharaTKMI`, `claude/compassionate-dirac-drm760` (= `origin`) |
| HEAD awal | `4ef5574` (dokumen P1_22), working tree bersih |
| Commit P1_20–P1_22 | `6f3c6ba`, `e987aa8`, `c2e11ea`, `c026417`, `28c0fa5`, `2d44a37`, `4ef5574` — semua terverifikasi leluhur HEAD |
| Baseline (`build_all.js` deterministik) | 37 suite, **670 / 0 / 64**, sesuai laporan P1_22 |
| HEAD akhir | commit dokumen ini, di atas `7f9b22b` |

## 2. Hasil uji per suite (baseline → akhir; log `_test_logs/p1_23_*.log`)

| Suite | Baseline P/F/I | Akhir P/F/I | Catatan |
|---|---|---|---|
| 33 suite tanpa perubahan angka (server_pass2, tarif_*, schema_archive, p0, p1, rab, audit_p1, p0_hardening, readiness, import_audit, t4b, import_engine, import_client, concurrency, akun_explicit, tx_integrity, gap005, v1_migrasi, alloc_siswa, kategori, snapshot_tarif, legacy_import, d5, d3, d1_kewajiban_audit, u5_rab_persetujuan, d4_impor_lama, d2, dimp8, u1, d1_identitas, um_lpj) | identik | identik | |
| e2e_central2 | 83/0/0 | 84/0/0 | M0 kini dicatat sebagai PASS (lihat §11) |
| d4_siswa_audit_tests | 4/0/2 | 8/0/1 | SW-04 INFO → PASS; SW-07..09 baru |
| u5_simulasi_tests | 7/0/0 | 8/0/0 | US-08 baru |
| d1_kanon_tests | — | 13/0/0 | baru |
| um_batal_tests | — | 6/0/1 | baru |
| lpj_bridge_tests | — | 10/0/1 | baru |
| **Total (40 suite)** | **670/0/64** | **705/0/65** | |

## 3. D-1 — Identitas kanonis kewajiban

### 3.1 Audit jalur yang membuat, membekukan, mengubah, atau mengalokasikan kewajiban

| Jalur | Sebelum P1_23 | Sesudah |
|---|---|---|
| Server `oblSnapshotCore_` (`opObligationSnapshot`, `opTarifApply`) | id `kw_<oblHash_(kunci)>` | Sama (sudah kanonis) |
| Klien `tagihanSnapshotRow_` → `freezeObligationsFor_`, terbitkan tagihan, katering, klasifikasi pendaftaran, pindah TA | `uid('tagihan')` acak, tanpa `komponenId` | **`kwIdKanon_` (algoritme identik dengan `oblHash_`) + `komponenId`** |
| Pencocokan kewajiban beku (`kewajibanSatuBaris`, kode bersama klien/server) | Nama komponen; baris pertama menurut urutan sheet | **`komponenId`** (nama hanya untuk baris lama tanpa `komponenId`); duplikat historis dipilih **deterministik** (id kanonis dulu, lalu id terkecil) |
| Riwayat beku di luar enumerasi (`kewajibanForSiswa`) | Nama komponen | `komponenId` lebih dulu |
| Konversi baris 04 ↔ objek klien (`ccFromRow_`/`ccToRow_`), shim server | Tanpa `komponenId` | Membawa `komponenId` |
| `opRecordBatch('kewajiban')` (RecordGuard) | Hanya cek `periode` | **Pengaman baru** (§3.2) |
| Alokasi (`resolveObligationMatch`: `tagihanId` atau kunci) | — | Tidak diubah; konsisten dengan id kanonis (KN-10) |
| Migrasi V1 lokal (`migrateV1ToV2`, mode lokal saja) | id V1 | Tidak diubah (mode pusat tidak menjalankannya, P1_21) |

### 3.2 Pengaman server (RecordGuard `kewajiban`)

| Aturan | Kode galat |
|---|---|
| Baris beku baru / pembekuan baris lama: `id` dan `tagihanId` wajib `kw_<hash(siswaId\|komponenId\|periode)>` | `ID_KEWAJIBAN_TIDAK_KANONIS` |
| Satu baris beku aktif per kunci (baris historis ber-id acak dihitung) | `DUPLIKAT_KEWAJIBAN_BEKU` |
| Baris beku: siswa/komponen/periode/bruto/potongan/netto/tagihanId/tarif/hari tidak dapat diubah lewat batch biasa (`jatuhTempo` dll. tetap boleh) | `KEWAJIBAN_BEKU_TERKUNCI` |
| Arsip baris beku yang sudah dibayar (alokasi aktif cocok `tagihanId`/kunci). Beku yang belum dibayar tetap dapat diarsip | `KEWAJIBAN_BEKU_TERKUNCI` |

Tidak ada baris historis yang dihapus atau digabung. Duplikat lama dilaporkan oleh `opKewajibanBekuAudit` (P1_22) sebagai daftar pengecualian.

### 3.3 Bukti konsistensi (`d1_kanon_tests`, 13 PASS)

| Skenario | Uji |
|---|---|
| Id klien = id server untuk 3.000 kunci (termasuk non-ASCII) | KN-01 |
| Pembekuan klien memakai id kanonis + `komponenId` | KN-02 |
| **Snapshot basi** (server sudah membekukan, klien membekukan lagi) → id sama, UNCHANGED, tetap 1 baris (temuan ID-03 P1_22 tertutup) | KN-03 |
| Pembekuan ulang dengan nilai berbeda (tarif berubah) → ditolak, nilai asli tetap | KN-04 |
| Pembekuan berulang & **dua permintaan bersamaan** (id sama satu batch / dua snapshot) → 1 baris | KN-05 |
| Id acak / `tagihanId ≠ id` ditolak; baris kanonis untuk kunci yang sudah punya beku historis → DUPLIKAT | KN-06 |
| **Dua baris beku kunci sama** (historis): pilihan deterministik apa pun urutannya (temuan ID-07 tertutup) | KN-07 |
| **Dua komponen bernama sama**, id berbeda: tidak tercampur | KN-08 |
| **Sudah dibayar:** nilai/komponen terkunci, arsip ditolak; belum dibayar tetap dapat diarsip | KN-09 |
| **Sudah beralokasi** (tagihanId kanonis): audit KONSISTEN, status LUNAS | KN-10 |
| **Retry setelah kegagalan tulis:** tidak ada baris parsial, retry tepat 1 baris | KN-11 |
| **Perubahan tarif:** beku tetap, belum beku mengikuti tarif (perilaku lama) | KN-12 |
| Diferensial klien vs server setelah pembekuan kanonis: COCOK | KN-13 |

### 3.4 Keterbatasan

Klien yang membekukan dengan cache basi **dan** tarif yang sudah berubah akan ditolak `KEWAJIBAN_BEKU_TERKUNCI`, dan antreannya terblokir sampai data dimuat ulang. Ini aman (tidak ada penimpaan), tetapi pesan UX belum khusus.

### 3.5 Jalur koreksi — tetap DITAHAN

Identitas kanonis dan relasi alokasi kini terbukti konsisten **di kode dan di data sandbox**. Konsistensi **data nyata** belum dapat dibuktikan tanpa salinan sah: `opKewajibanBekuAudit` harus dijalankan pada salinan, dan duplikat historis ditinjau manual.

Karena itu `opKewajibanKoreksi` belum dibuat. Rancangannya tetap seperti P1_22 §2.5: alasan, before/after, identitas & waktu server, `expect`, idempoten, tidak menyentuh 06.

## 4. D-4 — Impor V2 status siswa & wizard lama

**Audit enum:** status yang dipakai server (`OP_MASTER_.siswa.enums.status`) dan seluruh UI hanyalah **`Aktif` / `Nonaktif`** (bawaan `Aktif`). `Nonaktif` menghentikan enumerasi kewajiban.

**Impor V2** (`_import_rules.js` → ImportRules.gs + klien):
- `status` ditambahkan ke kolom siswa (pratinjau, validasi, commit, `res.nilai`).
- Beda huruf/spasi/tanda hubung dinormalkan dan dicatat di normalisasi.
- Nilai lain (Lulus, Pindah) → `TOLAK STATUS_TIDAK_VALID` beralasan, tidak dipetakan diam-diam.
- Kosong → kolom tidak dikirim: siswa lama **tidak berubah**, siswa baru memakai bawaan server.
- Perubahan status siswa terdaftar = `UBAH_KEWAJIBAN` (butuh persetujuan eksplisit), sama seperti kelas/TA/tanggal.

**Dampak terhadap kewajiban** (`d4_siswa_audit_tests`):
- SW-04: status → Nonaktif (disetujui) mengeluarkan kewajiban siswa dari daftar aktif.
- SW-09: kelas berubah (disetujui) → kewajiban beku tetap; yang belum beku mengikuti tarif kelas baru.
- SW-08: kolom kosong tidak mengubah status.

**Kesetaraan dengan wizard lama:**

| Fungsi | Bukti |
|---|---|
| Impor massal | SW-01 / M1 |
| F7 (`tanggalMasuk`, `jenisKelamin`) | SW-02 / T4B-15 |
| Pembaruan hanya-field-terisi | SW-03 |
| Status | SW-04 |
| Wali dari kolom namaAyah/namaIbu | Dipetakan manual ke `namaWali` di layar pemetaan Impor V2 (bukan penghalang) |

**Keputusan:** pengganti lengkap. Wizard lama siswa **dinonaktifkan di sandbox** (`7b49af0`):
- `importWizardConfirmSiswa` menolak dengan `JALUR_IMPOR_LAMA_DINONAKTIFKAN`;
- `commitSiswaRow` dan `updateSiswaRow` melempar galat;
- form siswa manual tidak terpengaruh.

## 5. D-T1 — Uang muka & LPJ

### 5.1 Audit `UangMukaLpj.gs`

Fungsi P1_22 tetap; tambahan P1_23:
- **`opUangMukaBatal`**:
  - BENDAHARA, alasan ≥ 10, `expect`;
  - DIBATALKAN **tidak menghapus** transaksi pencairan maupun entitas;
  - ditolak bila masih ada LPJ diajukan/diterima/diverifikasi atau sudah SELESAI;
  - status DIBATALKAN tidak ditimpa penyegaran;
  - saldo tetap dilaporkan dan diselesaikan lewat pengembalian yang tertaut uang muka asal;
  - audit `UANG_MUKA_BATAL` memuat saldo.
- **Perbaikan status (ditemukan UB-07):** uang muka yang dikembalikan penuh tanpa LPJ terbuka sebelumnya tetap DICAIRKAN dengan saldo 0. Kini menjadi **SELESAI**.

### 5.2 Pemisahan empat angka (`opUangMukaLaporan`, UB-04)

| Angka | Definisi | Contoh |
|---|---|---|
| 1. Arus kas keluar | `nominalCair` (transaksi pencairan) | 2.000.000 |
| 2. Pengeluaran aktual dilaporkan | Σ nota LPJ DIAJUKAN/DITERIMA/DIVERIFIKASI | 1.700.000 |
| 3. Pengeluaran terverifikasi | Σ nota LPJ DIVERIFIKASI | 1.000.000 |
| 4. Saldo belum dipertanggungjawabkan | cair − terverifikasi − pengembalian | 1.000.000 |

Nota tidak menjadi transaksi kas (hanya 1 transaksi pencairan): tidak ada hitung ganda.

### 5.3 Dampak FCC/BDS03 — audit saja (`opUangMukaDampakFcc`, UB-05/06)

September (fixture + uang muka di atas):

| | Sekarang (formula aktif) | Simulasi basis beban (tidak diterapkan) |
|---|---|---|
| Pengeluaran aktual | 2.050.000 | 1.050.000 |
| Penerimaan | 200.000 | 200.000 (pengembalian di periode lain) |
| Posisi kas | −1.850.000 | −1.850.000 (sama) |
| Transaksi pencairan dalam populasi BDS03 | 1 | — |

Angka "sekarang" persis sama dengan `opFinancialControl`. FCC, BDS03, dan 31 KPI tidak diubah.

## 6. D-LPJ — Kontrak ServerBridge & integrasi

**Kontrak** (`build_bridge.js` → `ServerBridge.js/.html`):

| Method | Argumen | Server |
|---|---|---|
| `opUangMukaLpjPlan` | — | baca-saja, semua peran baca |
| `opUangMukaLpjSetup` | `confirm` (`BUAT_SKEMA_UANG_MUKA_LPJ`) | BENDAHARA, idempoten, audit dulu |
| `opLinkLpj` | `{lpjId, transaksiId, expect, alasanPerbedaan}` | BENDAHARA |
| `opCreateExpenseFromLpj` | `{lpjId, akunId, unit, kategori, subkategori?}` | BENDAHARA, atomik, crid `lpj:<lpjId>` |
| `opUnlinkLpj` | `{lpjId, alasan, expect}` | BENDAHARA |

Verifikasi LPJ dan operasi uang muka **tidak** diekspos.

**Klien** (`apply_lpj_bridge_client.js`):
- Tombol "Buat Transaksi dari LPJ" memanggil `opCreateExpenseFromLpj` **bila skema tautan sudah disiapkan**. Keputusan ini sinkron, dari header `19_LPJ` (`statusLpj`/`uangMukaId`).
- Sebelum setup: jalur lama P0-T1 apa adanya. Uji HD-T1 tidak berubah.
- Aksi baru: Tautkan, Lepas tautan (alasan wajib), dan Setup skema di Pusat Data.
- Klik ganda dijaga. Respons yang hilang → pesan "aman diulang".

**Satu jalur efektif:** setelah setup, server menolak tautan lewat `opRecordBatch('lpj')` publik (`GUNAKAN_OPERASI_TAUTAN`). Jalur lama klien hanya berjalan sebagai fallback (`JALUR_LAMA_HANYA_FALLBACK` bila dipanggil langsung).

**Heuristik 62 hari:** **dinonaktifkan untuk jalur baru**. Pencegah hitung ganda kini:
- crid `lpj:<id>`;
- Σ LPJ ≤ nominal;
- LPJ uang muka tidak dapat menjadi transaksi;
- tautan eksplisit.

**Perbandingan (BR-10):**

| Kasus | Jalur lama (heuristik 62 hari) | Jalur baru |
|---|---|---|
| Belanja sah lain ATK MI dalam 62 hari | Diblokir (positif palsu) | Dibuat |
| LPJ uang muka yang dicairkan 87 hari sebelumnya | Lolos (negatif palsu) | Ditolak `LPJ_UANG_MUKA` |

**Hasil uji integrasi sandbox (`lpj_bridge_tests`, 10 PASS):**

| Aspek | Uji |
|---|---|
| Kontrak | BR-01 |
| Jalur lama sebelum setup | BR-02 |
| Tombol lewat server, klik ganda, tanpa transaksi lokal | BR-03 |
| Dua perangkat | BR-04 |
| Respons hilang + retry | BR-05 |
| Validasi server akun/kategori/unit | BR-06 |
| Satu jalur efektif | BR-07 |
| Tautkan/lepas beralasan + audit | BR-08 |
| Konflik data basi | BR-09 |
| Perbandingan 62 hari | BR-10 |

Validasi tanggal/nominal/periode berasal dari engine & RecordGuard dan dicakup `um_lpj_tests` (UM-04, UM-13, LK-03).

## 7. U-5 — Audit dampak baca-saja

`opRabTidakSurutSimulasi` kini juga menyajikan:
- daftar RAB DISETUJUI berkategori **METADATA_SAH** (`disetujuiPada` ISO sah + `disetujuiOleh` terisi) vs **HISTORI_TIDAK_LENGKAP**;
- **alasan tertulis** per transaksi yang berubah, mis. "tanggal transaksi 2026-09-05 sebelum persetujuan RAB 2026-09-20".

Before/after BDS03-I03/I05 per periode tetap seperti P1_22 (US-01..06). Rentang min/maks dipakai untuk RAB tanpa metadata.

Pencocokan aktif, data, dan formula **tidak diubah** (US-03). Implementasi pencocokan baru menunggu persetujuan terpisah.

## 8. K-RAB-07 — Matriks kewenangan & threat model (desain saja)

Tidak ada perubahan sejak P1_22 §6. Ringkasannya:
- Bukti NOTA/KUITANSI/BUKTI_TRANSFER dalam format JPG/PNG/PDF.
- Unggah ≠ persetujuan.
- BENDAHARA mencatat; KEPALA_SEKOLAH dan YAYASAN menyetujui (lingkup **TBD**).
- Penyetuju ≠ pembuat. Identitas dari server.
- Pengecualian tanpa bukti butuh persetujuan eksplisit + audit.

**Tidak ada** ambang nominal, jenis pengecualian, atau batas kewenangan yang ditetapkan. **Tidak ada** enforcement baru.

**Keputusan yang dibutuhkan:**
- ambang A (dan B?);
- jenis pengecualian;
- batas Kepala Sekolah vs Yayasan;
- pencabut persetujuan;
- sumber BDS03-I05 (`31_PERSETUJUAN_PENGELUARAN` vs `09_KOMITMEN`);
- batas waktu persetujuan susulan.

## 9. File & fungsi yang berubah (`4ef5574..7f9b22b`: 30 berkas, +644 / −72)

| Commit | Ringkasan | File / fungsi |
|---|---|---|
| `b96c822` | D-1 identitas kanonis + pengaman | **baru** `apply_d1_kanon_client.js` (`kwHash_`, `kwIdKanon_`, `tagihanSnapshotRow_`, `kewajibanSatuBaris`, `kewajibanForSiswa`, `ccFromRow_`/`ccToRow_` tagihan, terbitkan tagihan, cek komponen dipakai); `build_server_engines.js` (shim `komponenId`); `RecordGuard.gs` (`rgKewajibanBeku_`, `rgKwKunci_`, `rgKwBeku_`, `rgKwTerbayar_`); dihasilkan `Bendahara_V2.html`, `ObligationEngine.gs`; uji `d1_kanon_tests.js`; penyesuaian `p1_tests.js` P1L-14, `d1_kewajiban_audit_tests.js` D1-07/08, `d1_identitas_tests.js` |
| `15ef05b` | Status siswa di Impor V2 | `_import_rules.js` (`IMP_FIELDS_.siswa`, `IMP_STATUS_SISWA_`, `impRowSiswa_`); dihasilkan `ImportRules.gs`, `Bendahara_V2.html`; uji `d4_siswa_audit_tests.js` |
| `7b49af0` | Nonaktifkan wizard lama siswa | **baru** `apply_d4_siswa_client.js` (`impLamaNonaktif_`, `importWizardConfirmSiswa`, `commitSiswaRow`, `updateSiswaRow`); uji `e2e_central2.js` M0/M1, `t4b_tests.js` T4B-15, `d4_siswa_audit_tests.js` SW-05 |
| `76f4c03` | Uang muka DIBATALKAN + 4 angka + dampak FCC | `UangMukaLpj.gs` (`opUangMukaBatal`, `opUangMukaDampakFcc`, `umStatusDari_`, `umSegarkanStatus_`, `opUangMukaLaporan`, `opLpjAjukan`); uji `um_batal_tests.js` |
| `708fe6c` | ServerBridge LPJ + tombol | `build_bridge.js`; dihasilkan `ServerBridge.js/.html`; `UangMukaLpj.gs` (`umLpjTautanLewatOperasi_`); `RecordEngine.gs` (2 baris pemanggil); **baru** `apply_lpj_bridge_client.js` (`createTransaksiFromLpj`, `createTransaksiFromLpjLama_`, `lpjSkemaTautanSiap_`, `lpjOpsTersedia_`, `lpjSesudahOp_`, `openLinkLpj`/`linkLpj`, `openUnlinkLpj`/`unlinkLpj`, `pdLpjSchema*`); uji `lpj_bridge_tests.js` |
| `7f9b22b` | U-5 klasifikasi RAB + alasan | `RabPersetujuan.gs` (`opRabTidakSurutSimulasi`); uji `u5_simulasi_tests.js` (US-05 fixture, US-08) |
| (commit ini) | Laporan + log | `P1_23_*.md`, `_test_logs/p1_23_*.log` |

**Tidak berubah:** `FinanceEngine.gs`, `RabMapping.gs`, `TarifPlan.gs`, `ReconEngine.gs`, `PeriodLock.gs`, `TransactionEngine.gs`; definisi 31 KPI (`indDef`, bobot, target, ambang).

## 10. Perbandingan KPI

- Diff `Bendahara_V2.html` `4ef5574..HEAD`: **0** baris memuat `indDef`, `BDS0x-I`, bobot, atau ambang.
- Mesin FCC/RAB/rekonsiliasi tidak berubah.
- Suite KPI/FCC (`p0_tests`, `rab_tests` diferensial BDS03, `audit_p1_tests`, `e2e_central2` F1/F2 + O1 COCOK) **identik** dengan baseline.
- Perubahan pencocokan kewajiban beku (nama → `komponenId`, pilihan deterministik) **tidak** mengubah angka pada fixture normal (KN-13 diferensial COCOK, semua suite tarif/kewajiban identik). Angka hanya berbeda pada kasus yang sebelumnya salah: nama komponen kembar, atau duplikat historis yang urutannya berbeda.

## 11. Perubahan ekspektasi / fixture uji lama (dilaporkan)

| Uji | Perubahan | Alasan |
|---|---|---|
| p1_tests **P1L-14** | Fixture id kewajiban → kanonis; **asersi tetap** | Pengaman D-1 menolak id non-kanonis; kontrol yang diuji (penanda periode) tidak terkait |
| d1_kewajiban_audit **D1-07** | Semantik `expect`/retry diuji pada `jatuhTempo`; D1-08 mencatat netto kini terkunci | Kebijakan D-1: nilai beku terkunci |
| d1_identitas **ID-02/05/06/07** | Duplikat/arsip historis disuntik langsung ke sheet; teks ID-03/07 diperbarui | API kini menolak pembuatan duplikat (yang dulu dipakai sebagai fixture) |
| e2e_central2 **M0/M1** | M0 = jalur lama ditolak; M1 = 60 siswa lewat Impor V2 (ServerBridge) + muat ulang master seperti UI; kontrol (60, ≤3 RPC, alamat) tetap | Keputusan D-4: wizard lama siswa dinonaktifkan |
| t4b_tests **T4B-15** | `tanggalMasuk` & `jenisKelamin` lewat Impor V2; asersi tetap | Sama |
| d4_siswa_audit **SW-04/05** | SW-04 INFO → PASS (status didukung); SW-05 = dinonaktifkan | Sama |
| u5_simulasi **US-05** | Fixture menambah `disetujuiOleh`; asersi tetap | Definisi metadata sah kini mewajibkan penyetuju |

**Teks INFO lama** D1-04/05/06/09 (P1_21) masih menggambarkan celah sebelum P1_23; data keluarannya kini menunjukkan `KEWAJIBAN_BEKU_TERKUNCI`. INFO tidak memengaruhi lulus/gagal.

Tidak ada asersi yang dilemahkan.

## 12. Status data historis & produksi

- Tidak ada deployment. Tidak ada `appsscript.json` / `.clasp.json`. ID produksi tidak muncul di diff (0). Konektor Drive/Sheets sesi tidak dipakai.
- Tidak ada migrasi. Tidak ada baris historis yang diubah, digabung, atau dihapus. Kewajiban beku historis ber-id acak tetap dibaca dan dilaporkan.
- **544 TEREKONSILIASI:** tidak ada kode yang menyentuh 16_REKONSILIASI / ReconEngine. **Tidak diverifikasi ulang** karena tidak ada salinan data sah.

## 13. Rollback (diverifikasi di worktree terpisah)

| Uji | Hasil |
|---|---|
| Revert semua commit P1_23, urutan terbalik (`7f9b22b` → `b96c822`) | Tree **identik** dengan `4ef5574`; build + uji **670/0/64** = baseline |
| Revert satu commit dari HEAD | `7f9b22b`: bersih (704/0/65). `708fe6c`: bersih (695/0/64). `76f4c03`, `7b49af0`, `15ef05b`, `b96c822`: **konflik** pada daftar build/suite (`build_all.js`, `run_all_tests.js`), bagian akhir `UangMukaLpj.gs` yang ditambah berurutan, atau `d4_siswa_audit_tests.js` |

**Instruksi:** revert berurutan dari commit terbaru:
```
git revert --no-edit <commit-terbaru> ... <commit-yang-diinginkan>
cd _build_tests && node build_all.js && node run_all_tests.js <prefix>
```
Atau revert satu commit lalu selesaikan konflik pada baris daftar secara manual.

Tidak ada rollback data. Bila setup skema uang muka/LPJ atau kolom aditif pernah dijalankan di salinan uji, kolom/sheet tambahan tidak dibaca kode lama.

## 14. Uji yang tidak dapat dilakukan

- Apps Script nyata: `LockService` (sandbox: kunci tanpa kontensi; konkurensi disimulasikan berurutan + `expect`), `Session.getActiveUser`, kuota, waktu eksekusi.
- Jaringan nyata (`google.script.run`). Sandbox memakai simulasi respons hilang/galat.
- Render UI di peramban (modal, tombol). Hanya fungsi klien yang diuji.
- Audit pada data nyata: `opKewajibanBekuAudit`, `opSiswaMasterAudit`, `opRabTidakSurutSimulasi`, `opAlokasiLintasPeriodeAudit`, verifikasi 544 TEREKONSILIASI.
- Verifikasi LPJ dengan akun Kepala Sekolah/Yayasan nyata (GAP-005).

## 15. Risiko & keputusan yang masih dibutuhkan

| ID | Risiko / keputusan |
|---|---|
| D-1 | Jalankan `opKewajibanBekuAudit` pada salinan sah; tinjau duplikat historis; setujui implementasi `opKewajibanKoreksi` |
| D-1 UX | Klien basi yang mencoba membekukan dengan nilai berbeda → antrean terblokir (aman); perlu pesan khusus + muat ulang otomatis |
| D-LPJ | Jalankan `opUangMukaLpjSetup` di salinan uji untuk mengaktifkan jalur baru; jadwal setup produksi butuh persetujuan (setelah itu jalur lama tertutup) |
| D-T1 | Perubahan definisi pengeluaran aktual FCC/BDS03 ke basis beban (lihat §5.3); UI uang muka belum ada (operasi uang muka belum di bridge) |
| U-5 | Setujui penerapan tidak-berlaku-surut (hanya RAB METADATA_SAH?) setelah simulasi pada salinan sah |
| K-RAB-07 | Isi semua TBD (§8) |
| GAP-005 / D-T7 | Prasyarat verifikator/penyetuju |
| GAP-028 | Tetap BLOCKED |
| Lingkungan | Salinan spreadsheet nonproduksi, proyek Apps Script uji, akun BENDAHARA/KEPALA_SEKOLAH/YAYASAN/AUDITOR uji, folder bukti uji |
