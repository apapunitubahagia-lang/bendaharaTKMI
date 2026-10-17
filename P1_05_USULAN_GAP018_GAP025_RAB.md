# P1_05 — USULAN: Satu Aturan Pemetaan Pengeluaran → RAB (GAP-018 / GAP-025, BDS03)

**Status: USULAN. TIDAK diimplementasikan.**

Sesuai keputusan pengguna 17-10-2026 butir 7, skema dan rumus BDS03-I03 **tidak diubah**.

**Sumber:**
- Kode di commit `79e2b66`: `Bendahara_V2.html` dan `FinanceEngine.gs`.
- `05_DAFTAR_GAP_DAN_RISIKO.xlsx` (GAP-017, GAP-018, GAP-025).
- Data FINAL tidak tersedia di lingkungan ini. Angka FINAL di bawah dikutip dari dokumen 05, belum dihitung ulang.

## 1. Aturan pencocokan yang berlaku sekarang (FAKTA, dari kode)

| Pemakai | Fungsi | Aturan cocok pengeluaran ↔ baris `08_ANGGARAN` |
|---|---|---|
| KPI **BDS03-I03** (bobot 25) dan **BDS03-I05** (bobot 15) | `anggaranRabFor(t.kategori, periode)` (`Bendahara_V2.html:1761`) | `a.program === t.kategori` **persis** (peka huruf besar/kecil) dan `a.periode === periode`. Tanpa unit, tanpa subkategori, tanpa melihat status RAB |
| KPI **BDS03-I04** (bobot 20) | `realisasiForProgram(a.program, a.periode)` (`:4863`) | Realisasi = Σ pengeluaran dengan `t.kategori === a.program`; ok bila realisasi ≤ pagu |
| FCC `missing.rabTanpaRealisasi` | `fccCompute_` (`FinanceEngine.gs:44`) | `t.kategori === a.program` (sama dengan KPI) |
| FCC **Anggaran vs Aktual** | `fccBudgetVsActual_` (`FinanceEngine.gs:88`) | Kategori **ternormalisasi** (huruf kecil, spasi, id kategori 21 → nama) `kn(t.kategori) === kn(a.kategori)` (**kolom `kategori`, bukan `program`**). Ditambah subkategori (spesifik menang atas umum), **unit sama**, dan garis periode-bulan |
| `opRabRealization` (P1-D, read-only) | `rabMapCompute_` | Sama dengan FCC Anggaran vs Aktual (diuji diferensial, P1D-05). **Tidak dipakai KPI** |

Jadi ada **dua aturan yang berbeda**: KPI dan FCC-missing memakai `program`, sedangkan tabel FCC memakai `kategori` + subkategori + unit. Keduanya tidak memakai pemetaan eksplisit per transaksi.

## 2. Contoh divergensi (hipotetis, mengikuti kode)

Baris RAB `{program:'Honor Pengawas Ujian', kategori:'Honor', unit:'MI', periode:'Oktober 2026', nominal:1.000.000}`. Pengeluaran `{kategori:'Honor', unit:'MI', tanggal:2026-10-05, nominal:600.000}`.

| Penilai | Hasil |
|---|---|
| FCC Anggaran vs Aktual | Aktual 600.000, "DALAM ANGGARAN" |
| FCC missing | RAB "tanpa realisasi" (karena program ≠ kategori) |
| KPI BDS03-I03 | Pengeluaran **tidak sesuai RAB** |
| KPI BDS03-I04 | Realisasi program = 0 ≤ pagu → **ok** (lulus semu) |
| KPI BDS03-I05 | Butuh persetujuan; `pengeluaranPunyaPersetujuan` mencari `ObligasiSekolah.transaksiId`, field yang tidak ada di skema 09_KOMITMEN (GAP-017) → **gagal** |

## 3. Dampak pada data FINAL (dari dokumen 05; belum dihitung ulang)

- `08_ANGGARAN`: 50 program unik. Hanya "Transportasi" yang sama dengan nama kategori pengeluaran. Status RAB **DIAJUKAN 85/85** (belum ada yang DISETUJUI).
- Pemetaan nyata pengeluaran → anggaran/RKAT/LPJ ada di `30_REF_ALOKASI_PENGELUARAN` (275 baris, `statusBukti` "BELUM ADA" 275/275), tetapi tidak dipakai Web V2. Dokumen 05 menyebut 51 pengeluaran ter-map ITEM (kriteria GAP-018).
- **Akibatnya:**
  - BDS03-I03 dan I05 gagal untuk hampir semua pengeluaran.
  - **BDS03-I04 lulus semu**: realisasi per program ≈ 0.
  - FCC "MISSING" berlebihan.

**Pemisahan masalah:**

| Masalah | Jenis | Siapa yang memutuskan |
|---|---|---|
| Nilai `program` RAB berbeda dengan nama kategori pengeluaran | **Data/struktur** (RAB disusun per program, pengeluaran per kategori) | Pemilik data |
| Pemetaan per transaksi tersedia tetapi tidak dipakai | **Skema** (butuh sheet operasional) | Persetujuan perubahan skema |
| KPI dan FCC memakai aturan berbeda | **Definisi** (GAP-025) | Persetujuan perubahan rumus |
| RAB DIAJUKAN diperlakukan sama dengan DISETUJUI | **Definisi** | Persetujuan |

## 4. Usulan perubahan (paket terpisah "P1-KPI-01", menunggu persetujuan tertulis)

1. **Skema (aditif, butuh persetujuan):** sheet operasional `30_ALOKASI_PENGELUARAN` dengan header `id, transaksiId, anggaranId, nominal, sumber, archivedAt, archivedBy, archiveReason`.
   - Diisi dari `30_REF_ALOKASI_PENGELUARAN` lewat **impor beraudit yang dipicu eksplisit**, bukan migrasi otomatis saat boot.
   - Validasi: transaksi PENGELUARAN aktif, anggaran ada, Σ nominal per transaksi ≤ nominal transaksi (sama dengan aturan LPJ P1-D).
2. **Satu fungsi pencocokan bersama** `rabMatch_(transaksi, D)` dipakai KPI (I03, I04, I05) **dan** FCC, dengan urutan:
   1. pemetaan eksplisit `30_ALOKASI_PENGELUARAN` (bisa membagi satu transaksi ke beberapa anggaran);
   2. bila tidak ada: aturan `kategori`/subkategori/unit milik FCC sekarang;
   3. selain itu: "tanpa RAB".

   Aturan `program === kategori` dihapus dari KPI. **Ini mengubah hasil indikator.**
3. **Status RAB:** keputusan apakah hanya RAB `DISETUJUI` yang dihitung (I03/I04), sementara DIAJUKAN ditampilkan terpisah.
4. **Bukti sebelum diterapkan:**
   - Laporan diferensial per indikator BDS03-I03/I04/I05 dan per baris FCC, sebelum vs sesudah, pada **salinan** data FINAL.
   - Daftar transaksi yang berubah status beserta alasannya.
   - Bobot, target, dan ambang BDS03 **tidak** diubah; yang berubah hanya aturan pencocokan input.
5. **Tes yang direncanakan:**
   - Diferensial KPI dan FCC = sama untuk pencocokan.
   - Pemetaan eksplisit mengalahkan aturan kategori.
   - Σ alokasi pengeluaran ≤ nominal.
   - I04 tidak lagi lulus semu (realisasi 0 akibat beda nama).
   - Regresi KPI selain BDS03 identik.

## 5. Yang perlu diputuskan

1. Setuju menambah sheet `30_ALOKASI_PENGELUARAN` dan melakukan impor beraudit dari `30_REF_ALOKASI_PENGELUARAN`?
2. Setuju KPI BDS03-I03/I04/I05 memakai fungsi pencocokan bersama dengan FCC (perubahan rumus, GAP-025)?
3. Apakah RAB berstatus DIAJUKAN dihitung sebagai anggaran yang sah?
4. Untuk BDS03-I05: apakah persetujuan pengeluaran di luar RAB memakai `09_KOMITMEN.transaksiId` (kolom baru, GAP-017), atau mekanisme lain?
