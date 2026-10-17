# P1_03 — Audit Perubahan Kebijakan Periode & Rekonsiliasi (sebelum mengubah kode)

**Tanggal:** 17 Oktober 2026
**Branch:** `claude/vigilant-bell-967cih` (lokal `p1/implementasi`)
**Commit dasar:** `31bb919` (HEAD lokal = remote, working tree bersih)
**Dasar keputusan:** "Master Prompt — Revisi Kebijakan Periode & Rekonsiliasi" dari pengguna (17-10-2026).

**Status:** AUDIT SAJA. Belum ada kode yang diubah.

---

## 1. Dokumen dan kode yang diperiksa

| Sumber | Diperiksa | Catatan |
|---|---|---|
| `P1_00_BASELINE_AUDIT.md`, `P1_01_IMPLEMENTATION_REPORT.md`, `P1_02_PEMETAAN_GAP_TC.md` | Ya | — |
| `07_RANCANGAN_TEST_CASE.md` | Ya | Tersedia sebagai `.md` |
| `05_DAFTAR_GAP_DAN_RISIKO.xlsx` | Ya | Dibaca dengan openpyxl; sheet GAP_RISIKO (47 GAP), RINGKASAN, EXTRA_DATA |
| Kode server | Ya | `grep` semua pemakai `plGuard_`, `plClosedMap_`, `PL_*_PREFIX_`, `RG_LOCK_FIELD_`, `PERIOD_LOCKED` |
| Kode klien | Ya | `Bendahara_V2.html`: pemakai `periodClosing`, `PERIOD_LOCKED`, definisi BDS02-I02 dan BDS03-I03 |

---

## 2. Perilaku lama (di `31bb919`) dan perilaku baru yang diminta

| Aspek | Lama (P1 saat ini) | Baru (keputusan pengguna) |
|---|---|---|
| Status periode CLOSED / `periodeStatus.*=TERKUNCI` | **Hard lock**: semua tulis yang tanggal/periodenya jatuh di periode itu ditolak `PERIOD_LOCKED` | **Penandaan administratif**: tulis tetap diterima bila lolos otorisasi dan validasi. Perubahan pada periode bertanda dicatat jelas di audit, dan respons memuat peringatan |
| Pembayaran terlambat | Ditolak bila tanggal aktualnya di periode tertutup, atau bila transaksi induk alokasi di periode tertutup | Dicatat dengan **tanggal penerimaan aktual**. Tidak ada pemunduran tanggal otomatis |
| Koreksi historis | Harus reopen dulu | Diperbolehkan sesuai kewenangan (BENDAHARA, `opGate_`). Tercatat di audit dengan penanda periode |
| Blob status rusak | Gagal tertutup: semua tulis ditolak `PERIOD_STATE_INVALID` | Tidak memblokir tulis. Ditandai di audit/respons |
| Close/reopen | API server, reopen wajib alasan, diaudit | **Dipertahankan** sebagai status administratif (pelaporan/penandaan) |
| Saldo rekonsiliasi | Dihitung server s.d. akhir periode; ditolak bila periode tertutup | Tetap s.d. akhir periode (TC-REK-03). **Tidak** ditolak karena status periode. Saldo sistem terkini dilaporkan terpisah |

---

## 3. Titik penegakan hard lock (semua jalur server)

Total ada **12 titik penolakan** + 1 blokir key settings. Semua ditemukan lewat `grep`.

| # | Berkas : fungsi | Kode sekarang | Rencana |
|---|---|---|---|
| 1 | `TransactionEngine.gs` : `createTransactionWithAllocations_` (via `apply_p1_server.js`) | `plGuard_([payload.tanggal])` → tolak | Ganti dengan penanda: baris audit `PERIODE_DITANDAI` di append audit yang sama + `data.periodeDitandai` |
| 2 | `TransactionEngine.gs` : `createAllocation_` | Tanggal transaksi induk → tolak | Sama dengan #1 |
| 3 | `TransactionEngine.gs` : `createBankMutation_` (privat) | `payload.tanggal` → tolak | Sama |
| 4 | `TransactionEngine.gs` : `updateTransaction_` | Tanggal lama/baru → tolak | Sama. Koreksi historis tetap diaudit (UPDATE_TRANSACTION + penanda) |
| 5 | `RecordEngine.gs` : `opArchiveTransaction` | Tolak | Penanda di audit arsip |
| 6 | `RecordEngine.gs` : `opArchiveAllocation` | Tolak | Sama |
| 7–12 | `RecordGuard.gs` : `rgCheckOp_` untuk mutasiBank.tanggal, rekonsiliasi.periode, lpj.tanggal, anggaran.periode, komitmen.tanggal, kewajiban.periode | Tolak per-op | Hapus penolakan periode dari guard. Tambah penanda ke audit batch. **Aturan integritas lain tetap**: FK, LPJ ≤ nominal, bukti berfile/immutable, rekonsiliasi lewat API khusus, mutasi lewat `opMatchMutasi` |
| — | `ReconEngine.gs` : `opReconcileAccount`, `opMatchMutasi` | Tolak | Penanda saja. Validasi nominal/ganda/akun tetap |
| — | `RecordEngine.gs` : `opSettingsUpsert` | Menolak key `blob.periodClosing.*` dan `periodeStatus.*` (`PERIOD_LOCK_API_REQUIRED`) | **Dipertahankan.** Bukan hard lock transaksi, melainkan perlindungan metadata periode dari perubahan tanpa jejak. Kode galat akan diganti menjadi nama yang tidak menyiratkan kunci (lihat §6) |

**Temuan tambahan yang memperkuat keputusan:** `ObligationEngine.gs : oblSnapshotCore_` (pembekuan kewajiban, dipakai `opObligationSnapshot` dan langkah 1 `opTarifApply`) menulis lewat `opRecordBatch('kewajiban')`. Dengan kode sekarang, membekukan kewajiban Juli–September pada data FINAL (TERKUNCI) akan gagal `PERIOD_LOCKED` per baris. Artinya hard lock juga menghambat proses administrasi tagihan, bukan hanya penerimaan.

**Klien:** tidak ada logika klien yang menolak tulis berdasarkan periode. Yang ada:
- `PERIOD_LOCKED` di `CC_PERMANENT_` (pemetaan galat; tidak berbahaya bila server tidak lagi mengirimnya).
- `closePeriode`/`reopenPeriode` memanggil API status.
- Teks modal reopen: "Periode yang dibuka kembali dapat diubah lagi". Teks ini menjadi **tidak akurat** dan perlu diganti (perubahan teks UI, §6).

---

## 4. Dampak per area

| Area | Dampak perubahan | Yang dipertahankan |
|---|---|---|
| **Kewajiban** | Pembekuan dan perubahan `04_KEWAJIBAN` untuk periode bertanda tidak lagi ditolak. Status kewajiban tetap dihitung dari alokasi aktif (`alokasiTerbayar`/`sisaObligation`); tidak ada yang otomatis "lunas" karena waktu berlalu | ObligationEngine (rumus kewajiban = salinan verbatim klien) tidak disentuh. Alokasi tetap diperiksa `AllocationGuard` (tidak melebihi sisa kewajiban) |
| **Transaksi** | Penerimaan/pengeluaran pada tanggal di periode bertanda diterima | Validasi field, FK, idempotensi, nominal ≥ alokasi, status alokasi dihitung server, `SELESAI` wajib bukti, `_expect` (CONFLICT), arsip tanpa hard delete |
| **Tiga jenis tanggal** | Tidak ada perubahan model. Tanggal kewajiban = `06_ALOKASI.periode` / `04_KEWAJIBAN.periode`; tanggal aktual = `05_TRANSAKSI.tanggal`; periode laporan = parameter baca (`opFinancialControl`, `opRabRealization`, KPI) | Engine tidak pernah menyalin periode kewajiban ke tanggal transaksi (diverifikasi: `createTransactionWithAllocations_` menulis `payload.tanggal` apa adanya) |
| **Audit log** | Bertambah baris penanda `PERIODE_DITANDAI` (aksi baru, refId = id objek, after = {periode, status, dilaporkan, operasi}) **dalam append yang sama** dengan audit wajib | Atomisitas audit P1-B, aktor, append-only |
| **Rekonsiliasi** | Tidak ditolak karena status periode. Respons dan audit menambah `tanggalBatas` dan `saldoSistemTerkini` | Saldo sistem s.d. akhir periode (TC-REK-03); selisih tidak ditutup otomatis; saldo awal tidak disentuh; pencocokan nominal + anti-ganda |
| **KPI** | **Tidak ada.** KPI klien tidak membaca status closing (diverifikasi: `periodClosing` hanya dipakai `renderPengaturanClosing`, `closePeriode`/`reopenPeriode`, backup/reset) | Rumus/bobot/target/ambang tidak disentuh; regresi P0D-04/05/06 dan P0U-02/03 tetap jadi gerbang |

### Definisi saldo (akan dipakai konsisten di kode dan laporan)

| Istilah | Definisi | Sumber |
|---|---|---|
| **Saldo bank per tanggal rekonsiliasi** | Angka rekening koran pada tanggal batas, dimasukkan bendahara (`saldoAktual`) | Input pengguna, disimpan di `16_REKONSILIASI.saldoAktual` |
| **Saldo sistem per tanggal rekonsiliasi** | `saldoAwal` akun + Σ PENERIMAAN − Σ PENGELUARAN non-arsip pada akun itu dengan `tanggal ≤ tanggalBatas` | Dihitung server, disimpan di `saldoSistem` (nilai beku pada saat rekonsiliasi) |
| **Selisih rekonsiliasi** | saldo bank − saldo sistem per tanggal batas | `selisih`. ≠ 0 wajib catatan; `SELESAI` hanya bila 0 |
| **Saldo sistem terkini** | Rumus yang sama **tanpa** batas tanggal (semua transaksi sah yang tercatat) | Dihitung saat dibaca, **tidak disimpan** (tanpa kolom baru) |

`tanggalBatas` = hari terakhir periode yang direkonsiliasi (mis. "Oktober 2026" → `2026-10-31`). Rekonsiliasi dengan tanggal batas di tengah bulan **belum** didukung: `16_REKONSILIASI` tidak punya kolom tanggal batas. Menambahnya = perubahan skema (butuh persetujuan).

---

## 5. GAP dan test case yang terdampak

| ID | Isi dokumen | Dampak keputusan |
|---|---|---|
| **GAP-015** | Rekomendasi: server menolak tulis pada periode TERKUNCI (kecuali koreksi/reversal tercatat) | **Ditimpa keputusan pengguna.** Bagian yang tetap berlaku: "reopen hanya dengan alasan dan audit" dan "koreksi tercatat" → menjadi penanda audit. Status GAP-015 diusulkan menjadi "DIPUTUSKAN: penandaan, bukan penguncian" |
| **TC-CRUD-05** | `opCreateIncome` 2026-07-15 saat Juli TERKUNCI → `PERIOD_LOCKED` | **Ekspektasi dokumen bertentangan dengan keputusan baru.** Diusulkan direvisi: diterima, tanggal tetap 2026-07-15, audit memuat penanda periode TERKUNCI. Revisi dokumen 07 adalah wewenang pemilik dokumen; saya catat sebagai usulan |
| TC-REK-03 | `saldoSistem` per 31-10 | **Tetap** dan diperkuat (saldo terkini dipisah) |
| TC-REK-02, TC-FAIL-02/03/07, TC-AUTH-02 | — | Tidak berubah; harus tetap lulus |
| GAP-021 (kewajiban beku) | Kewajiban beku tidak berubah walau tarif berubah | Tidak berubah. Penghapusan lock justru membuka jalan pembekuan kewajiban periode TERKUNCI |
| GAP-019, GAP-018, GAP-025 | Lihat §7 | Tidak diimplementasikan; hanya usulan |
| K-P1-01, K-P1-02 | Cakupan kunci, reopen | K-P1-01 **gugur** (tidak ada kunci). K-P1-02: reopen tetap butuh alasan sebagai status administratif |

### Tes yang terdampak (`_build_tests`)

Tes **diubah ekspektasinya**, tidak dihapus:

| Tes | Ekspektasi lama | Ekspektasi baru |
|---|---|---|
| P1L-01, 03, 04, 05, 06, 10, 13, 14 | `PERIOD_LOCKED`, tidak ada baris | Diterima. Baris tertulis dengan tanggal aktual. Audit memuat `PERIODE_DITANDAI` beraktor. Respons memuat `periodeDitandai` |
| P1L-08 | Tulis setelah close → `PERIOD_LOCKED` | Close idempoten + diaudit; tulis setelahnya diterima + ditandai |
| P1L-02, 07, 09, 11, 12 | — | Tetap (status lewat API, reopen wajib alasan, antrean blob lama dibuang) |
| e2e_central2 **I3** | Reopen dibutuhkan agar skenario September jalan | Tetap ada (menguji reopen). Skenario berikutnya tidak lagi bergantung padanya; ditambah cek bahwa tulis berjalan tanpa reopen |

### Tes baru (mengikuti daftar Tahap 3 prompt)

| # Prompt | Tes baru / yang dipertahankan |
|---|---|
| 1 Penerimaan terlambat pada tanggal aktual | P1P-01: Juli TERKUNCI; penerimaan Oktober untuk kewajiban Juli → `tanggal` tetap 2026-10-xx; alokasi ke kewajiban Juli diterima |
| 2 Kewajiban belum dibayar tetap terlihat | P1P-02: `opObligations` → kewajiban Juli tanpa alokasi tetap `sisa > 0` setelah waktu lewat dan setelah ada transaksi lain |
| 3 Transaksi baru tidak otomatis mengubah kewajiban lama | P1P-03: penerimaan tanpa alokasi → hasil `opObligations` identik sebelum/sesudah |
| 4 Koreksi historis beraudit | P1P-04: ubah transaksi Juli → `UPDATE_TRANSACTION` + `PERIODE_DITANDAI` dalam satu append |
| 5 TERKUNCI tidak memblokir rutin | P1L-* direvisi + P1P-05 (pembekuan kewajiban periode TERKUNCI lewat `opObligationSnapshot`) |
| 6 Tidak berwenang tetap ditolak | P1P-06: AUDITOR/pengguna asing pada periode TERKUNCI → `ROLE_NOT_ALLOWED`/`USER_NOT_FOUND` + P1S-01 |
| 7–9 Batas saldo rekonsiliasi | P1P-07/08/09: saldo per batas hanya transaksi ≤ batas; transaksi sesudah batas tidak mengubah baris rekonsiliasi lama maupun saldo per batas yang dihitung ulang; `saldoSistemTerkini − saldoSistem = Σ transaksi sesudah batas` |
| 10 Mutasi tidak dicocokkan dua kali | P1R-05, P1R-09 (dipertahankan) |
| 11 Audit, idempotensi, konflik | P1A-*, P1C-* (dipertahankan) |
| 12 KPI dan UI tidak berubah | p0_tests P0D-04/05/06, P0U-02/03 (dipertahankan sebagai gerbang) |

---

## 6. Rencana perubahan (Tahap 2) — menunggu persetujuan

Satu commit terisolasi `P1-POLICY` di atas `31bb919`, sehingga dapat di-revert sendiri.

1. **`PeriodLock.gs`**
   - `plGuard_` (menolak) diganti `plFlags_` (mengembalikan penanda `{periode, status: CLOSED|TERKUNCI, dilaporkan}`, tidak pernah menolak).
   - `dilaporkan` = ada baris `17_LAPORAN` aktif untuk periode itu, sesuai butir "perubahan setelah laporan periode sebelumnya dibuat harus dapat ditelusuri".
   - Blob rusak → penanda `PERIOD_STATE_INVALID`, bukan penolakan.
   - `opClosePeriod`/`opReopenPeriod`/`opPeriodLockStatus` dipertahankan. Data `periodeStatus.*` dan riwayat blob **tidak dihapus atau diubah**.
2. **12 titik penegakan (§3)**
   - Penolakan diganti penanda. Penanda masuk ke **append audit yang sama**: `engineAuditBatch_` untuk engine, `opAuditBulk_` untuk record/arsip/rekonsiliasi.
   - Respons memuat `periodeDitandai`. Tidak ada perubahan pada validasi lain.
3. **`ReconEngine.gs`**
   - Respons dan audit `opReconcileAccount` ditambah `tanggalBatas` dan `saldoSistemTerkini`; isi baris `16_REKONSILIASI` tidak berubah (tanpa kolom baru).
   - Pemeriksaan status periode dihapus.
4. **`RecordEngine.gs : opSettingsUpsert`** tetap menolak key status periode, dengan kode galat diganti `PERIOD_STATUS_API_REQUIRED` (pesan: status periode hanya lewat API agar beraudit). Klien memetakan kode lama dan baru.
5. **Klien (`apply_p1_client.js`)**: hanya teks modal reopen dan komentar.
   - Usulan teks: "Status periode bersifat penandaan administratif untuk pelaporan; pencatatan tetap dapat dilakukan dan tercatat di audit."
   - Tidak ada perubahan markup/CSS di luar `<script>`. P0U-02 tetap menjadi gerbang.
6. **Tes**: §5. **Dokumen**: `P1_03_IMPLEMENTATION_REPORT.md`; `P1_02` diberi catatan GAP-015/TC-CRUD-05 "ditimpa keputusan 17-10-2026".

**Yang tidak dilakukan:**
- Tidak ada skema baru, migrasi, atau perubahan data `periodeStatus.*`, saldo awal, tanggal historis, maupun status pembayaran.
- Tidak ada perubahan KPI.
- Transfer tetap diblokir.

### Risiko regresi

| Risiko | Mitigasi |
|---|---|
| Menghapus lock ikut menghapus validasi lain di fungsi yang sama | Perubahan per titik hanya mengganti baris `plGuard_`; diff ditinjau baris per baris. Suite P1A/P1R/P1D/P1E/P1C tetap gerbang |
| Penanda audit menambah baris audit | Dihitung eksplisit di tes (jumlah baris audit per operasi) |
| `17_LAPORAN` dibaca per tulis (beban baca tambahan) | Dibaca sekali per operasi/batch; dampak live belum terukur (H3) |
| Perilaku di data FINAL (Jul–Sep TERKUNCI) berubah dari "ditolak" menjadi "diterima + ditandai" | Ini yang diminta. Dicatat di laporan sebagai perubahan perilaku yang disengaja |

---

## 7. Tahap 4 — KPI dan RAB (hanya analisis; tidak diimplementasikan)

| Indikator / GAP | Definisi KPI sekarang (tidak diubah) | Masalah **data/status** | Masalah **definisi** | Yang diperlukan | Usulan (butuh persetujuan tertulis) |
|---|---|---|---|---|---|
| **BDS02-I02** Mutasi Rekening Teridentifikasi (bobot 25) | ok jika `status === 'DIPROSES'` dan `transaksiId` terisi (`Bendahara_V2.html:1817`) | Data FINAL: 544/544 mutasi berstatus `TEREKONSILIASI` (kosakata impor), sehingga semua dihitung "tidak teridentifikasi" walau tertaut. Ini masalah **kosakata status data** (GAP-019) | Tidak ada; definisi konsisten dengan kosakata Web V2 | Keputusan enum GAP-019 | **Opsi A (data):** koreksi status 544 baris `TEREKONSILIASI` → `DIPROSES` lewat koreksi beraudit; KPI tidak berubah. **Opsi B (definisi):** KPI menerima {DIPROSES, TEREKONSILIASI}; hasil indikator berubah. Saya merekomendasikan A, karena tidak mengubah rumus. Keduanya butuh persetujuan |
| **BDS03-I03** Pengeluaran Sesuai RAB Bulanan (bobot 25) | ok hanya jika `anggaranRabFor(t.kategori, periode)` ada, yaitu `08_ANGGARAN.program === t.kategori` persis (`:1761`, `:1853`) | FINAL: 50 program RAB, hanya "Transportasi" yang sama dengan nama kategori pengeluaran. Pemetaan sebenarnya ada di `30_REF_ALOKASI_PENGELUARAN` (275 baris), yang tidak dipakai Web V2. RAB berstatus DIAJUKAN 85/85 | **Ya:** dua aturan pencocokan berbeda. KPI memakai `program === kategori`, sedangkan FCC memakai `kategori` ternormalisasi + subkategori + unit (`fccBudgetVsActual_`). GAP-018 | (1) `30_REF_ALOKASI_PENGELUARAN` dijadikan sheet operasional (pengeluaran → anggaranId), yaitu skema baru; (2) keputusan apakah RAB DIAJUKAN dihitung | Perubahan terpisah "P1-KPI-01" setelah persetujuan: KPI dan FCC memakai satu aturan berbasis `anggaranId`, dengan uji diferensial hasil sebelum/sesudah per indikator. **Mengubah hasil indikator → wajib persetujuan tertulis (GAP-025)** |
| GAP-025 | — | — | Perubahan rumus butuh persetujuan | — | Tidak ada perubahan di P1 |

`opRabRealization` (P1-D) tetap read-only dan **tidak** dipakai KPI. Fungsinya hanya menjelaskan angka FCC per transaksi.

---

## 8. Hambatan uji live (tidak berubah)

Hambatan H1–H6 di `P1_00` §2 masih berlaku: tidak ada proyek Apps Script uji, salinan spreadsheet, maupun `clasp`. Semua hasil tetap **sandbox**. Status akhir yang akan dilaporkan setelah implementasi paling tinggi `READY_FOR_INTEGRATION_TEST`, bukan `P1_COMPLETE`.
