# P1_10 — Definisi Ukuran Kartu "Realisasi RAB" di Beranda (Keputusan 2)

**Tanggal:** 19 Oktober 2026
**Dasar:** `f955416` (HEAD = remote, working tree bersih saat diperiksa).
**Status:** definisi ditetapkan **sebelum** UI diubah. Implementasi berada di commit terpisah (lihat `P1_09` §11).

## 1. Masalah pada versi `44e14f0`

Kartu "Realisasi RAB Bulanan" (`renderBeranda`, `Bendahara_V2.html` ±baris 2268–2290) menghitung:

- `totalAnggaran` = Σ pagu **DISETUJUI** garis periode;
- `totalRealisasi` = Σ bagian transaksi yang terpetakan ke garis periode **dengan status apa pun**;
- `sisaAnggaran` = `totalAnggaran − totalRealisasi`.

Akibatnya realisasi atas RAB yang belum disetujui mengurangi "sisa anggaran disetujui". Pengeluaran yang tidak terpetakan juga tidak tampil di kartu ini. Jumlahnya hanya muncul di tile "Pengeluaran (Aktual)" tanpa penjelasan selisihnya.

## 2. Definisi (satu fungsi murni: `rabRingkasanPeriode_(M, periode)` di `_rab_match.js`)

`M = rabMatchAll_(D)` adalah hasil pencocokan bersama yang juga dipakai KPI BDS03 dan Financial Control. "Transaksi periode P" berarti transaksi PENGELUARAN aktif (tidak diarsipkan, sudah dikonfirmasi server) dengan `periodeOf(tanggal) = P`. Tanggal transaksi aktual tidak pernah diubah.

| Kode | Ukuran | Rumus |
|---|---|---|
| **A** | Total Anggaran Disetujui | Σ `paguDisetujui` atas garis anggaran dengan `periode = P`. Pagu disetujui hanya berasal dari baris 08_ANGGARAN berstatus `DISETUJUI` (K-RAB-02) |
| **B** | Realisasi terhadap Anggaran Disetujui | Σ `bagian.nominal` atas transaksi periode P, dengan syarat garis tujuan ber-`periode = P` **dan** `bagian.statusRab = DISETUJUI` |
| **C** | Total Pengeluaran Aktual | Σ `nominal` seluruh transaksi periode P, terpetakan atau tidak. Harus sama dengan tile `totalPengeluaran(P)` |

**Rincian C − B** ("belum terpetakan ke RAB disetujui"). Ditampilkan sebagai informasi tersendiri, bukan ukuran keempat:

| Komponen | Rumus |
|---|---|
| B1 Terpetakan ke RAB belum disetujui | bagian periode P ke garis periode P dengan `statusRab ≠ DISETUJUI` (DIAJUKAN / tanpa status / status lain) |
| B2 Terpetakan ke garis periode lain | bagian periode P ke garis dengan `periode ≠ P` (hanya mungkin lewat alokasi eksplisit; lihat `P1_12`, kebijakannya belum ditetapkan) |
| B3 Sisa tidak terpetakan | Σ `sisaTidakTerpetakan` (alokasi eksplisit sebagian, K-RAB-03) |
| B4 Tanpa RAB | Σ `tanpaRab` (tidak ada alokasi eksplisit yang sah maupun garis kategori yang cocok; termasuk alokasi berlebih yang diabaikan) |

Ukuran tambahan:
- **Sisa Anggaran Disetujui** = A − B. Boleh negatif; artinya realisasi melebihi pagu disetujui.
- **Anggaran belum disetujui** = Σ pagu DIAJUKAN + tanpa status + status lain atas garis periode P. Ditampilkan, tidak dijumlahkan ke A.

**Invarian** (diuji):
- B + B1 + B2 + B3 + B4 = C.
- Setiap transaksi dihitung tepat satu kali di C, berapa pun jumlah alokasinya. Alokasi hanya membagi nominal transaksi aslinya (Σ alokasi ≤ nominal, K-RAB-03), sehingga tidak pernah menambah C.

## 3. Pemakaian yang harus konsisten

| Tempat | Fungsi / lokasi | Perubahan |
|---|---|---|
| Kartu Beranda | `renderBeranda` | A, B, Sisa (A − B), C, rincian C − B, anggaran belum disetujui; semua dari `rabRingkasanPeriode_` |
| Laporan → Anggaran (layar) | `reportsTabs.anggaran` | Blok ringkasan yang sama untuk periode yang difilter (atau periode aktif) di atas tabel per baris |
| Ekspor "Laporan Anggaran & Realisasi" | `exportAnggaranReport` | Baris ringkasan `[RINGKASAN]` A/B/C/C − B per periode yang ada di baris ekspor, dari fungsi yang sama |
| Financial Control (klien + server) | `fccBudgetVsActual_` | Field tambahan `ringkasanPeriode` (fungsi yang sama), agar server dapat diperiksa terhadap klien |
| Tabel per baris RAB | `rabRealisasiBaris_` | Tidak berubah (realisasi per baris; per garis bila >1 baris) |

**Tidak berubah:**
- KPI BDS03 (`financialAktivitasFeed`), bobot, target, ambang;
- `rabMendekatiPagu`, `pengeluaranDiLuarRabBulanIni`;
- tile "Pengeluaran (Aktual)" (`totalPengeluaran`);
- snapshot laporan bulanan dan BDS06-I04.

## 4. File terdampak

- `_rab_match.js`: menambah `rabRingkasanPeriode_`.
- `_fcc_budget.js`: menambah `ringkasanPeriode` pada hasil.
- `_build_tests/apply_p1_rab_client.js`: patch Beranda, laporan, dan ekspor.
- `_build_tests/rab_tests.js`: tes baru.
- File hasil generate: `Bendahara_V2.html`, `FinanceEngine.gs`.
