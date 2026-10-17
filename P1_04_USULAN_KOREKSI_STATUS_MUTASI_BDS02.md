# P1_04 — USULAN: Koreksi Beraudit Status Mutasi FINAL (BDS02-I02 / GAP-019)

**Status: USULAN. TIDAK diimplementasikan.**

Sesuai keputusan pengguna 17-10-2026 butir 6:
- 544 status mutasi FINAL **tidak dikoreksi**.
- Rumus KPI BDS02-I02 **tidak diubah**.
- Dokumen ini hanya analisis dan rencana, untuk diputuskan.

**Sumber fakta:**
- `05_DAFTAR_GAP_DAN_RISIKO.xlsx` (GAP-019, GAP-045).
- Kode `Bendahara_V2.html` dan `CreateDatabaseStructure.gs` di commit `79e2b66`.
- Data FINAL **tidak tersedia** di lingkungan ini. Angka "544" berasal dari dokumen 05, belum dihitung ulang.

## 1. Arti bisnis setiap status

| Status | Asal | Arti menurut kode/dokumen | Jenis bukti |
|---|---|---|---|
| `BELUM_DIPROSES` | Kontrak Web V2 (`DB_SCHEMA 11_MUTASI_BANK.statusValues`) | Mutasi rekening sudah tercatat tetapi belum dicocokkan ke transaksi | FAKTA (kode) |
| `DIPROSES` | Kontrak Web V2 | Mutasi sudah **diidentifikasi**: dicocokkan ke transaksi yang ada atau menjadi transaksi baru (`linkMutasiToTransaksi`, `createTransaksiFromMutasi`, `opMatchMutasi`). KPI BDS02-I02 memakai `status==='DIPROSES' && transaksiId` | FAKTA (kode) |
| `TEREKONSILIASI` | Backend FINAL hasil impor; 544/544 baris, semuanya kredit (05: GAP-019) | Kosakata paket impor. Bersamaan dengan `16_REKONSILIASI` FINAL berstatus `ARUS_MASUK_COCOK_SALDO_TIDAK_TERSEDIA` (saldo kosong), artinya paling mungkin "**arus masuk** mutasi sudah dicocokkan ke transaksi penerimaan", **bukan** "saldo rekening sudah direkonsiliasi" | **INFERENSI.** Perlu konfirmasi bendahara/penyusun data FINAL |
| `TERIDENTIFIKASI` | Disebut TC-REK-02 (dokumen 07) | Usulan dokumen untuk "mutasi teridentifikasi ke siswa". Belum ada di kontrak maupun data | FAKTA (dokumen) |

Workflow FINAL di `15_SETTINGS workflow.transaksi.status` (`DRAF > TERCATAT > TERVERIFIKASI > … > TEREKONSILIASI`, GAP-045) menempatkan TEREKONSILIASI sebagai tahap **akhir**, lebih jauh dari sekadar "teridentifikasi". Ada dua tafsiran yang bersaing:
- **T1:** TEREKONSILIASI ≈ DIPROSES. Mutasi sudah dicocokkan; label impor saja yang berbeda.
- **T2:** TEREKONSILIASI = tahap lebih tinggi. Mutasi dicocokkan dan arus masuknya diverifikasi. Ini mencakup DIPROSES, sehingga juga memenuhi makna BDS02-I02.

Kedua tafsiran sama-sama menyiratkan "sudah teridentifikasi". Bedanya ada pada apakah status asli perlu dipertahankan sebagai informasi.

## 2. Dampak saat ini (tanpa perubahan)

| Indikator | Bobot | Aturan (tidak diubah) | Akibat pada 544 mutasi FINAL |
|---|---|---|---|
| BDS02-I02 Mutasi Rekening Teridentifikasi | 25 | ok bila `status==='DIPROSES'` dan `transaksiId` terisi | Semua **gagal**, walau tertaut |
| BDS02-I03 Tidak Ada Mutasi Menggantung | 20 | ok bila teridentifikasi (aturan yang sama) **atau** umur ≤ 14 hari | Mutasi berumur > 14 hari **gagal** |
| BDS02-I05 (rekonsiliasi SELESAI) | — | Butuh rekonsiliasi berstatus SELESAI | Tidak terkait langsung. FINAL tidak punya saldo, jadi tetap gagal sampai ada rekonsiliasi saldo nyata (TC-REK-03) |

Skor BDS02 rendah ini berasal dari **kosakata status data**, bukan dari kinerja. Ini masalah kualitas data (GAP-019), bukan masalah definisi KPI.

Yang **sudah benar** di P1:
- `opMatchMutasi` dan RecordGuard memperlakukan TEREKONSILIASI/tertaut sebagai sudah dicocokkan, sehingga mencegah pencocokan ganda (P1R-09).
- Tidak ada perubahan yang diperlukan di jalur itu.

## 3. Opsi

| Opsi | Isi | Mengubah rumus KPI? | Mengubah data? | Rekomendasi |
|---|---|---|---|---|
| **A — Koreksi data beraudit** | Baris TEREKONSILIASI yang **memenuhi syarat** (§4) dikoreksi menjadi `DIPROSES`; status asal tetap tercatat di audit | Tidak | Ya: kolom `status` pada baris yang lolos syarat | **Disarankan bila tafsiran T1 dikonfirmasi** |
| B — Perluas definisi KPI | BDS02-I02/I03 menerima {DIPROSES, TEREKONSILIASI} | **Ya** (butuh persetujuan tertulis) | Tidak | Bila status asli wajib dipertahankan (T2) |
| C — Biarkan | Laporkan BDS02 rendah dengan catatan sebab data | Tidak | Tidak | Sementara, sampai ada keputusan |

## 4. Rancangan Opsi A (belum dibuat)

1. **Syarat per baris (semua wajib):**
   - status = `TEREKONSILIASI`;
   - `transaksiId` terisi, menunjuk transaksi **aktif** (tidak diarsipkan) berjenis PENERIMAAN;
   - |nominal mutasi − nominal transaksi| < 1;
   - transaksi itu tidak tertaut ke mutasi lain (`rcCheckLink_`);
   - mutasi tidak diarsipkan.

   Baris yang tidak lolos **tidak diubah** dan dilaporkan beserta alasannya.
2. **Tahap uji kering** `opMutasiStatusCorrectionPlan()` (read-only): jumlah lolos / tidak lolos per alasan, beserta daftar id.
3. **Tahap terapkan** `opMutasiStatusCorrectionApply({planHash, alasan, confirm:'KOREKSI_STATUS_MUTASI'})`:
   - BENDAHARA, di dalam lock, per batch ≤ 200.
   - `planHash` harus sama dengan hasil uji kering terakhir; data yang berubah sejak uji kering → `CONFLICT`.
   - Satu baris audit `KOREKSI_STATUS_MUTASI` per mutasi (before: TEREKONSILIASI, after: DIPROSES, alasan), ditulis dalam append yang sama dengan perubahan. Audit gagal → batch dipulihkan.
   - Idempoten: baris yang sudah DIPROSES dilewati.
4. **Pemulihan:** audit menyimpan status asal per baris, sehingga pembalikan dapat dilakukan dengan prosedur yang sama ke arah sebaliknya.
5. **Tes yang direncanakan:**
   - Hanya baris lolos syarat yang berubah.
   - Baris tanpa transaksi, nominal beda, atau tertaut ganda tidak berubah.
   - Audit gagal → tidak ada perubahan.
   - Replay = satu efek.
   - Hasil KPI sebelum/sesudah dibandingkan (diferensial) pada salinan uji.
6. **Prasyarat:**
   - Konfirmasi tafsiran T1/T2.
   - Persetujuan tertulis untuk mengubah data FINAL.
   - Dijalankan **hanya di salinan uji** lebih dulu.

## 5. Yang perlu diputuskan

1. Apakah TEREKONSILIASI pada data FINAL berarti "sudah dicocokkan" saja (T1), atau tahap verifikasi lanjutan (T2)?
2. Pilih Opsi A, B, atau C.
3. Bila A: apakah status asal cukup disimpan di audit, atau perlu kolom tambahan (perubahan skema)?
4. Apakah `TERIDENTIFIKASI` (TC-REK-02) perlu masuk kosakata, atau TC-REK-02 direvisi menjadi `DIPROSES`?
