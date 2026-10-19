# P1_11 — Analisis K-RAB-07 (lanjutan): Persetujuan Pengeluaran di Luar RAB

**Tanggal:** 19 Oktober 2026
**Status: ANALISIS + REKOMENDASI. TIDAK diimplementasikan.**

Dokumen ini memperluas `P1_08` mengikuti Keputusan 3 (19-10-2026), dan menggantikan rekomendasi `P1_08` §4 bila keduanya berbeda.

Sampai ada persetujuan tertulis, BDS03-I05 tetap berperilaku seperti yang terdokumentasi: lulus bila transaksi lulus I03 (terpetakan penuh ke RAB DISETUJUI), **atau** bila `pengeluaranPunyaPersetujuan(t)` benar. Fungsi `pengeluaranPunyaPersetujuan(t)` mencari `09_KOMITMEN.transaksiId`, yaitu kolom yang **tidak ada**. Akibatnya bagian persetujuan tidak pernah terpenuhi dari data server, dan indikator **tidak dipaksa lulus**.

**Sumber fakta** (diperiksa di kode `f955416`):
- `Bendahara_V2.html`: `submitObligasi`, `updateObligasiStatus`, `pengeluaranPunyaPersetujuan`.
- `CreateDatabaseStructure.gs` (`DB_SCHEMA` 09_KOMITMEN).
- `RecordEngine.gs` (`OP_RECORDS_.komitmen`), `RecordGuard.gs` (aturan komitmen), `OperationalAPI.gs` (peran).
- `_build_tests/fixtures/headers_backend.json` (FINAL).

Isi data FINAL `30_REF_ALOKASI_PENGELUARAN.komitmenId` **belum diperiksa**: datanya tidak tersedia.

---

## 1. Fakta yang membatasi pilihan

| # | Fakta | Sumber |
|---|---|---|
| F1 | `09_KOMITMEN` (aplikasi) = `id, uraian, nominal, status, rabId, tanggal`. FINAL = `id, tanggal, uraian, nominal, status, jatuhTempo` (tanpa `rabId`). Tidak ada kolom penyetuju, waktu persetujuan, alasan, atau bukti | DB_SCHEMA, FINAL |
| F2 | Arti bisnis: komitmen sekolah kepada pihak ketiga, siklus `EXPECTED → COMMITTED → INCURRED → PAID`. "Tidak pernah otomatis membuat baris di 05_TRANSAKSI" | `DB_SCHEMA.notes` |
| F3 | Komitmen dibuat oleh pengguna UI (`submitObligasi`). `tanggal` = hari ini; status dipilih bebas dari daftar; status dapat diubah kapan saja (`updateObligasiStatus`, audit `UBAH_STATUS_OBLIGASI`). Server hanya memvalidasi `rabId` | HTML, RecordGuard |
| F4 | **Hanya peran BENDAHARA yang dapat menulis** (`OP_WRITE_ROLES_ = ['BENDAHARA']`). KEPALA_SEKOLAH, YAYASAN, dan AUDITOR baca-saja | `OperationalAPI.gs:31,39` |
| F5 | `30_REF_ALOKASI_PENGELUARAN` FINAL memuat `komitmenId`, `alasanPengecualian`, `statusVerifikasi`, `lpjId`, `buktiId` per baris pengeluaran | FINAL |
| F6 | BDS03-I05 (bobot 15) dinilai per transaksi PENGELUARAN periode | `INDICATOR_MASTER` |

**Konsekuensi F3 + F4:** dengan model sekarang, "persetujuan" yang dicatat lewat komitmen adalah catatan yang dibuat dan diubah statusnya oleh **bendahara sendiri**, yaitu pihak yang juga mengeluarkan uang. Tidak ada pemisahan tugas. Status `COMMITTED` tidak membuktikan siapa yang menyetujui.

## 2. Alternatif

| | **A. `09_KOMITMEN.transaksiId`** | **B. `30_ALOKASI_PENGELUARAN.komitmenId`** | **C. Sheet persetujuan `31_PERSETUJUAN_PENGELUARAN`** | **C+B. C, dengan komitmen sebagai rujukan opsional** |
|---|---|---|---|---|
| Ringkas | Komitmen menunjuk satu transaksi | Baris alokasi pengeluaran menunjuk komitmen | Catatan persetujuan eksplisit per transaksi | C, ditambah kolom `komitmenId` opsional di persetujuan |

### 2.1 Perbandingan per butir yang diminta

| Butir | A | B | C / C+B |
|---|---|---|---|
| **Struktur & arti `09_KOMITMEN`** | Mencampur komitmen (rencana kewajiban) dengan pembayaran; 1 komitmen = 1 transaksi; bertahap tidak terwakili | Komitmen tetap murni; banyak transaksi dapat merujuk satu komitmen | Komitmen tidak berubah; persetujuan adalah entitas sendiri |
| **Relasi `30_REF.komitmenId`** | Tidak dipakai | Dipakai langsung (impor lewat uji kering yang sama dengan K-RAB-08) | C: tidak dipakai. C+B: dipakai sebagai rujukan pada baris persetujuan hasil impor (bila uji kering menunjukkan datanya layak) |
| **Hubungan dengan transaksi aktual** | `transaksiId` tunggal | Lewat baris alokasi (`transaksiId` + nominal) | `transaksiId` + `nominalDisetujui` per persetujuan |
| **Identitas penyetuju, waktu, alasan, bukti** | Tidak ada (F1) | Tidak ada; hanya status komitmen yang dapat diubah bendahara (F3/F4) | **Ada**: `disetujuiOleh` (email + peran dari sesi server, bukan input klien), `disetujuiPada` (waktu server), `alasan` (wajib), `buktiId` (10_BUKTI, opsional/wajib menurut keputusan) |
| **Validasi status persetujuan** | Status komitmen (EXPECTED dihitung atau tidak?) | Sama dengan A | Enum persetujuan sendiri: `DIAJUKAN → DISETUJUI / DITOLAK / DIBATALKAN`; hanya `DISETUJUI` yang dihitung; transisi divalidasi server; `DISETUJUI` hanya dapat dibuat oleh peran penyetuju |
| **Satu persetujuan untuk beberapa transaksi** | Tidak mungkin (justru kelemahan pembayaran bertahap) | Mungkin; harus dibatasi Σ alokasi ke komitmen ≤ nominal komitmen; risiko satu komitmen kecil "meluluskan" banyak transaksi bila nominal tidak dicek | Default 1 persetujuan : 1 transaksi; Σ `nominalDisetujui` per transaksi ≥ nominal agar lulus; pemakaian ulang dicegah oleh kunci unik `transaksiId` aktif |
| **Audit, idempotensi, konflik** | Lewat RecordEngine (`RECORD_*`) | Lewat RecordEngine + impor ber-`planHash` | Fungsi server khusus (`opApproveExpense`), audit pada append yang sama, `clientRequestId` untuk idempotensi, `expect` untuk deteksi konflik |
| **Pemisahan tugas (F4)** | Tidak ada | Tidak ada | **Ada**: penyetuju ≠ pembuat transaksi; peran KEPALA_SEKOLAH/YAYASAN diberi hak tulis **hanya** untuk fungsi ini |
| **Dampak BDS03-I05** | Lulus bila ada komitmen menunjuk transaksi | Lulus bila alokasi transaksi menunjuk komitmen berstatus tertentu | Lulus bila ada persetujuan `DISETUJUI` dengan nominal cukup, dari peran berwenang |
| **Dampak Financial Control** | Tidak ada | Peluang "komitmen terbayar"; harus menjaga COMMITTED tidak dihitung ganda dengan realisasi | Tidak ada pada angka; tampilan "di luar RAB, disetujui / belum disetujui" |
| **Perubahan skema** | +`transaksiId` di 09 (FINAL juga perlu `rabId`) | +`komitmenId` di 30_ALOKASI_PENGELUARAN | Sheet baru (aditif): `id, transaksiId, nominalDisetujui, status, alasan, disetujuiOleh, peranPenyetuju, disetujuiPada, buktiId, komitmenId (C+B), createdAt, createdBy, archivedAt, archivedBy, archiveReason` + izin tulis terbatas untuk peran penyetuju |
| **Data sumber tersedia** | Tidak | Ya (`30_REF.komitmenId`, isi belum diverifikasi) | Tidak (C); sebagian (C+B) |

### 2.2 Risiko utama

| Risiko | A | B | C / C+B |
|---|---|---|---|
| Persetujuan semu (bendahara menyetujui dirinya sendiri) | Tinggi | **Tinggi** | Rendah: peran diperiksa server |
| Persetujuan dipakai ulang | Rendah | Sedang (perlu batas Σ) | Rendah (unik per transaksi) |
| Relasi yatim | `transaksiId` arsip | `komitmenId` hilang/arsip | `transaksiId` arsip → persetujuan tidak dihitung, dilaporkan |
| Persetujuan sesudah pengeluaran ("disetujui belakangan") | Tidak terdeteksi | Tidak terdeteksi | Terlihat dari `disetujuiPada` vs tanggal transaksi; kebijakannya perlu diputuskan (lihat §4) |

## 3. Rekomendasi

**Rekomendasi: C+B.** Persetujuan pengeluaran di luar RAB dicatat sebagai entitas tersendiri (`31_PERSETUJUAN_PENGELUARAN`) oleh peran penyetuju yang terverifikasi di server. `komitmenId` hanya rujukan opsional ke dasar komitmen.

**Rekomendasi ini mengubah rekomendasi `P1_08` (B).** Alasannya adalah fakta F4 yang belum dipertimbangkan di `P1_08`: dengan B, setiap "persetujuan" dapat dibuat dan diubah oleh bendahara sendiri. Akibatnya BDS03-I05 dapat lulus tanpa persetujuan pihak lain, dan itu sama dengan memaksa indikator lulus.

**Urutan yang diusulkan** (setiap langkah butuh persetujuan):
1. Uji kering read-only atas `30_REF.komitmenId` di salinan FINAL: jumlah terisi, resolusi ke `09_KOMITMEN`, status, Σ per komitmen. Hasilnya menentukan apakah rujukan B layak diimpor.
2. Keputusan kebijakan (§4).
3. Sheet aditif `31_PERSETUJUAN_PENGELUARAN`, dibuat lewat fungsi admin eksplisit seperti K-RAB-08.
4. Fungsi server `opApproveExpense` / `opRejectExpense` (peran penyetuju saja, audit, idempotensi, konflik) dan antarmuka.
5. `pengeluaranPunyaPersetujuan` membaca persetujuan sah. Uji diferensial BDS03-I05.

**Dampak bila disetujui:** BDS03-I05 dapat naik untuk pengeluaran di luar RAB yang benar-benar disetujui. Sebelum ada data persetujuan, nilainya tetap sama dengan sekarang. Financial Control tidak berubah angka.

## 4. Keputusan yang dibutuhkan

| ID | Pertanyaan | Usulan |
|---|---|---|
| K-RAB-07a | Pilih A, B, C, atau C+B | C+B |
| K-RAB-07b | Peran yang boleh menyetujui | KEPALA_SEKOLAH dan/atau YAYASAN; bukan BENDAHARA |
| K-RAB-07c | Apakah persetujuan **sesudah** tanggal transaksi dihitung? | Dihitung tetapi ditandai "persetujuan susulan" (terlihat di laporan); atau tidak dihitung. Perlu keputusan |
| K-RAB-07d | Bukti wajib? | Wajib `alasan`; `buktiId` wajib untuk nominal di atas ambang tertentu (ambang diputuskan sekolah) |
| K-RAB-07e | Nominal: persetujuan harus ≥ nominal transaksi? | Ya; kurang → tidak lulus, dilaporkan |
| K-RAB-07f | Status komitmen yang diterima sebagai rujukan | COMMITTED, INCURRED, PAID (bukan EXPECTED); hanya informasi, bukan pengganti persetujuan |

## 5. Keterbatasan yang berlaku sekarang (dilaporkan, tidak diperbaiki)

- BDS03-I05 bagian persetujuan tidak dapat terpenuhi dari data server, sehingga pengeluaran di luar RAB disetujui selalu dinilai bermasalah di I05.
- Pada data FINAL saat ini (RAB 85/85 DIAJUKAN menurut dokumen 05), I03 dan I05 diperkirakan rendah. Ini mencerminkan status data, bukan kesalahan hitung.
