# P1_08 — Analisis K-RAB-07: Menghubungkan Persetujuan Pengeluaran di Luar RAB dengan Transaksi Aktual

**Tanggal:** 19 Oktober 2026
**Status: ANALISIS + REKOMENDASI. TIDAK diimplementasikan.**

Keputusan pengguna 19-10-2026: K-RAB-07 belum disetujui. Tidak ada perubahan skema, kode, atau data untuk bagian ini sampai ada persetujuan tertulis.

**Sumber yang diperiksa:**
- Kode di commit `d49367c` (`Bendahara_V2.html`, `CreateDatabaseStructure.gs`, `_fcc_pure.js`, `_fcc_budget.js`, `RecordGuard.gs`).
- Header FINAL di `_build_tests/fixtures/headers_backend.json`.
- Dokumen `05_DAFTAR_GAP_DAN_RISIKO.xlsx` (GAP-017, GAP-018).
- **Data FINAL tidak tersedia**: isi `komitmenId` di `30_REF_ALOKASI_PENGELUARAN` belum diperiksa.

---

## 1. Kondisi sekarang (FAKTA)

| Hal | Fakta |
|---|---|
| Indikator | BDS03-I05 "Pengeluaran di Luar RAB Memiliki Persetujuan" (bobot 15): ok bila ada RAB **atau** `pengeluaranPunyaPersetujuan(t)` |
| Fungsi persetujuan | `pengeluaranPunyaPersetujuan(t) = Store.loadObligasi().some(o => o.transaksiId === t.id)` (`Bendahara_V2.html:1766`) |
| Kolom yang dicari | `09_KOMITMEN.transaksiId`: **tidak ada** di `DB_SCHEMA` (`id, uraian, nominal, status, rabId, tanggal`) maupun di FINAL (`id, tanggal, uraian, nominal, status, jatuhTempo`) |
| Akibat | Bagian "persetujuan" BDS03-I05 **tidak pernah dapat terpenuhi** dari data server. I05 hanya lulus lewat bagian "ada RAB" |
| Peran `09_KOMITMEN` | `DB_SCHEMA.notes`: "ObligasiSekolah – komitmen sekolah ke pihak lain… Tidak pernah otomatis membuat baris di 05_TRANSAKSI". Status `EXPECTED / COMMITTED / INCURRED / PAID`. FCC: COMMITTED = COMMITTED + INCURRED; EXPECTED terpisah; `rabId` (opsional) mengaitkan komitmen ke RAB |
| Relasi di data sumber | `30_REF_ALOKASI_PENGELUARAN` FINAL punya kolom `komitmenId` **per baris pengeluaran** (bersama `transaksiId`, `anggaranId`, `alasanPengecualian`, `statusVerifikasi`) |
| Rencana P1-RAB | Sheet operasional `30_ALOKASI_PENGELUARAN` **tanpa** `komitmenId` (dikeluarkan sampai K-RAB-07 diputuskan) |

## 2. Arti bisnis dan kebutuhan

- **Komitmen** (`09_KOMITMEN`) adalah janji atau kewajiban sekolah kepada pihak ketiga, dengan siklus EXPECTED → COMMITTED → INCURRED → PAID.
  - Satu komitmen dapat dibayar sekali atau **bertahap** (beberapa transaksi).
  - Satu transaksi dapat melunasi sebagian satu komitmen.
  - Komitmen **bukan** transaksi kas dan tidak boleh menjadi ledger kedua.
- **Persetujuan pengeluaran di luar RAB** menjawab pertanyaan: "pengeluaran yang tidak ada di RAB ini, siapa yang menyetujui, kapan, dan atas dasar apa?"
  - Persetujuan bisa berbentuk komitmen yang sudah disetujui (COMMITTED), tetapi juga bisa berupa persetujuan Kepala Sekolah/Yayasan untuk belanja mendadak tanpa komitmen sebelumnya.
- **Kebutuhan relasi:** persetujuan harus terhubung ke **transaksi aktual** (`05_TRANSAKSI.id`), karena indikator dinilai per transaksi pengeluaran.
- **Bukti persetujuan yang minimal diperlukan agar sah:**
  1. siapa yang menyetujui (peran berwenang);
  2. kapan;
  3. dokumen/dasar (nomor surat, notulen, atau bukti di `10_BUKTI`);
  4. nominal yang disetujui (agar persetujuan Rp1 tidak "meluluskan" pengeluaran Rp10 juta).

## 3. Perbandingan alternatif (dari `P1_06` §7)

| Aspek | **A. `09_KOMITMEN.transaksiId`** | **B. `30_ALOKASI_PENGELUARAN.komitmenId`** | **C. Tabel persetujuan tersendiri** |
|---|---|---|---|
| Kardinalitas | 1 komitmen → **1** transaksi. Pembayaran bertahap **tidak** terwakili | 1 transaksi (per baris alokasi) → 1 komitmen; 1 komitmen → **banyak** transaksi. Mendukung bertahap | Bebas: 1 transaksi → 1 persetujuan; dapat merujuk komitmen opsional |
| Kesesuaian data sumber | Tidak ada data sumbernya (kolom tidak ada di FINAL) | **Sesuai** `30_REF_ALOKASI_PENGELUARAN.komitmenId` (kolom sudah ada; isi belum diverifikasi) | Tidak ada data sumbernya |
| Peran `09_KOMITMEN` | Tercampur: komitmen ikut menyimpan pembayaran | Tetap murni komitmen; relasi pembayaran ada di tabel pemetaan pengeluaran | Tetap murni |
| Menangani persetujuan tanpa komitmen | **Tidak** | **Tidak** (hanya persetujuan lewat komitmen) | **Ya** |
| Bukti persetujuan (siapa/kapan/dokumen/nominal) | Implisit dari status komitmen; tidak ada siapa/kapan | Implisit dari komitmen; nominal per alokasi tersedia | **Eksplisit** (kolom khusus) |
| Dampak BDS03-I05 | Lulus bila ada komitmen yang menunjuk transaksi | Lulus bila transaksi punya baris alokasi dengan `komitmenId` ke komitmen berstatus COMMITTED/INCURRED/PAID (aturan status perlu diputuskan) | Lulus bila ada persetujuan sah (dan nominal cukup) |
| Dampak Financial Control | Tidak ada perubahan langsung | Memungkinkan "komitmen terbayar" per komitmen (Σ alokasi ke komitmen). Harus dijaga agar COMMITTED tidak dihitung ganda dengan realisasi | Tidak ada perubahan langsung, kecuali tampilan "di luar RAB tetapi disetujui" |
| Risiko duplikasi | Dua komitmen menunjuk transaksi yang sama | Σ alokasi ke satu komitmen > nominal komitmen; transaksi sama dengan beberapa komitmen | Persetujuan ganda untuk transaksi yang sama |
| Risiko relasi yatim | `transaksiId` menunjuk transaksi terarsip/tidak ada | `komitmenId` menunjuk komitmen tidak ada/terarsip | `transaksiId` yatim |
| Risiko persetujuan tidak sah | Komitmen EXPECTED (belum disetujui) dihitung sebagai persetujuan | Sama, bila status tidak diperiksa | Penyetuju tanpa peran berwenang |
| Perubahan skema | +`transaksiId` di `09_KOMITMEN` (aditif) | +`komitmenId` di `30_ALOKASI_PENGELUARAN` (aditif; sheet baru, belum dibuat di data mana pun) | Sheet baru `31_PERSETUJUAN_PENGELUARAN` (aditif) |
| Perubahan kode KPI | `pengeluaranPunyaPersetujuan` tetap bentuknya | `pengeluaranPunyaPersetujuan` membaca tabel pemetaan; **input I05 berubah** | `pengeluaranPunyaPersetujuan` membaca tabel persetujuan; **input I05 berubah** |

## 4. Rekomendasi

**Rekomendasi: B sebagai tahap pertama, dengan aturan validasi ketat.** C dipertimbangkan sebagai tahap kedua bila ternyata sering ada persetujuan tanpa komitmen. A **tidak disarankan**.

**Alasan:**
1. **A salah model.** Komitmen yang dibayar bertahap tidak dapat diwakili, dan peran komitmen tercampur dengan pembayaran. Ini mendekati "ledger kedua" yang dilarang.
2. **B mengikuti data sumber.** `30_REF_ALOKASI_PENGELUARAN.komitmenId` sudah ada di FINAL, satu tabel dengan pemetaan RAB yang disetujui (K-RAB-08). Relasi pengeluaran → RAB → komitmen berada di satu tempat, sehingga validasi anti-ganda (Σ ≤ nominal) bisa dipakai ulang.
3. **C paling lengkap untuk bukti**, tetapi tidak ada data sumbernya dan menambah sheet lagi. Lebih tepat setelah kebutuhan nyata terlihat dari uji kering B.

**Syarat agar B sah** (perlu disetujui bersama rekomendasi ini):
- `komitmenId` menunjuk `09_KOMITMEN` yang ada, tidak terarsip.
- Status komitmen yang dihitung sebagai persetujuan: **COMMITTED, INCURRED, PAID** (EXPECTED tidak dihitung). Mohon dikonfirmasi.
- Σ nominal alokasi pengeluaran ke satu komitmen ≤ nominal komitmen. Kelebihan → `PERLU_PEMERIKSAAN`, bukan dikoreksi.
- Bukti persetujuan (siapa/kapan) diambil dari komitmen itu sendiri. Bila dianggap tidak cukup, itu alasan untuk C.
- Uji kering melaporkan: jumlah baris `30_REF` dengan `komitmenId` terisi, resolusi ke `09_KOMITMEN`, status komitmennya, dan pelanggaran Σ.
- Transaksi yang punya RAB disetujui tetap lulus I05 lewat I03-baru. Persetujuan hanya relevan untuk pengeluaran **tanpa** RAB disetujui.

**Dampak bila B disetujui:**
- I05 dapat lulus untuk pengeluaran di luar RAB yang tertaut ke komitmen sah. Saat ini bagian itu tidak pernah lulus, sehingga I05 diperkirakan **naik**.
- Perubahan ini akan dilaporkan dengan uji diferensial seperti BDS03-I03/I04.

## 5. Yang perlu diputuskan

1. Pilih A, B, atau C (rekomendasi: B).
2. Status komitmen yang dianggap persetujuan (usulan: COMMITTED, INCURRED, PAID).
3. Apakah bukti dari komitmen (tanpa kolom penyetuju/tanggal persetujuan) sudah cukup?
4. Bila B: izin menambah kolom `komitmenId` di `30_ALOKASI_PENGELUARAN` dan mengimpornya dari `30_REF` lewat uji kering + impor yang sama.

Sampai diputuskan: `pengeluaranPunyaPersetujuan` tetap seperti sekarang, dan bagian persetujuan I05 tetap tidak terpenuhi dari data server. Hal ini dicatat sebagai keterbatasan di laporan.
