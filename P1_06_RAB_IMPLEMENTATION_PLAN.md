# P1_06 — Rencana Implementasi Pemetaan Pengeluaran → RAB (GAP-018 / GAP-025, BDS03)

**Tanggal:** 19 Oktober 2026
**Branch:** `claude/vigilant-bell-967cih` (lokal `p1/implementasi`)
**Commit dasar:** `8dd626b`. HEAD = remote, working tree bersih (diperiksa).

**Status: DISETUJUI SEBAGIAN (keputusan pengguna, 19-10-2026).** K-RAB-01..06 dan K-RAB-08 disahkan; K-RAB-07 **belum** (analisis terpisah: `P1_08_ANALISIS_K_RAB_07.md`). Implementasi dilakukan dalam commit terpisah `P1-RAB`.

### Keputusan yang disahkan (19-10-2026)

| ID | Keputusan |
|---|---|
| K-RAB-01 | Hanya `tingkatPemetaan = ITEM` yang sah sebagai pemetaan eksplisit. Tingkat lain dilaporkan (`PERLU_PEMERIKSAAN`) dan **tidak** diperlakukan setara ITEM |
| K-RAB-02 | Status RAB kosong = belum disetujui (sama dengan DIAJUKAN untuk kelayakan). Ditampilkan terpisah (`TANPA_STATUS`). Status historis **tidak** diisi otomatis |
| K-RAB-03 | Sisa nominal tanpa alokasi eksplisit tetap **tidak terpetakan**, tidak dicocokkan ulang lewat aturan kategori. Contoh: Rp1.000.000 dengan eksplisit Rp700.000 → terpetakan Rp700.000, tidak terpetakan Rp300.000. Σ alokasi ≤ nominal |
| K-RAB-04 | I04 dinilai di **tingkat garis anggaran**; agregasi konsisten tanpa hitung ganda. Identitas garis dan aturan agregasi: §4.3 |
| K-RAB-05 | Populasi I04 hanya garis yang memiliki RAB **DISETUJUI**. DIAJUKAN/tanpa status bukan anggaran disetujui. Tanpa garis yang memenuhi syarat → aturan N/A yang berlaku (tidak diubah) |
| K-RAB-06 | Teks dokumentasi `formula` BDS03 diperbarui sesuai aturan pencocokan baru. Bobot/target/ambang/definisi lain tidak berubah |
| K-RAB-07 | **Belum disetujui.** Bagian persetujuan BDS03-I05 tidak diubah |
| K-RAB-08 | Skema aditif `30_ALOKASI_PENGELUARAN` disetujui untuk lingkungan uji. Dibuat hanya lewat fungsi admin eksplisit berkonfirmasi; uji kering + validasi mendahului impor; impor hanya di salinan uji setelah hasil diperiksa dan disetujui |

**Paket:** perubahan terpisah dari revisi kebijakan periode (`79e2b66`).

**Status implementasi (19-10-2026): DIIMPLEMENTASIKAN DI SANDBOX** dalam satu commit `44e14f0` (`P1-RAB`), dapat di-revert utuh (diuji: revert + build ulang = tree `6ef9926`, 7 suite lama PASS). Penyimpangan dari rencana ini dan hasil uji: §11 dan `P1_09_RAB_IMPLEMENTATION_REPORT.md`. Belum diuji di Apps Script maupun pada data FINAL; status tetap `READY_FOR_INTEGRATION_TEST`.

---

## 1. Fakta yang diverifikasi (dan yang tidak)

| Objek | Sumber yang benar-benar diperiksa | Isi | Batasan |
|---|---|---|---|
| `30_REF_ALOKASI_PENGELUARAN` | Header di `_build_tests/fixtures/headers_backend.json` (FINAL) | 22 kolom: `alokasiPengId, transaksiId, anggaranId, programId, rkatId, komitmenId, lpjId, lpjDokId, buktiId, unit, periodeId, kategoriId, subId, sumberDanaId, nominal, tingkatPemetaan, kelompokAnggaran, alasanPengecualian, statusLPJ, statusBukti, statusVerifikasi, catatan` | **Hanya nama header.** Isi baris, nilai `tingkatPemetaan`, dan kebenaran relasi **belum diverifikasi**. Jumlah 275 baris, 51 ITEM-mapped, dan `statusBukti` "BELUM ADA" 275/275 dikutip dari dokumen 05 |
| `08_ANGGARAN` | Header FINAL (fixture) + `DB_SCHEMA` + `OP_SCHEMA_ADD_` | FINAL: `id, periode, program, kategori, unit, nominal, source, sourceFile, sourceRow, importBatchId, subkategori, kategoriLaporan, programId, sumberDanaId, status, volume, satuan, hargaSatuan` | 50 program dan status DIAJUKAN 85/85 = kutipan dokumen 05 |
| `09_KOMITMEN` | Header FINAL (fixture) + `DB_SCHEMA` | FINAL: `id, tanggal, uraian, nominal, status, jatuhTempo` (**tanpa** `rabId`, **tanpa** `transaksiId`). `DB_SCHEMA`: `id, uraian, nominal, status, rabId, tanggal` | — |
| Transaksi pengeluaran | `05_TRANSAKSI` (header FINAL = kontrak) | `kategori`, `subkategori`, `unit`, `tanggal`, `nominal`; arsip lewat `archivedAt` | — |
| Kosakata status RAB di aplikasi | `Bendahara_V2.html:9155` (form anggaran: `Diajukan`/`Disetujui`), `:7121` (impor RAB: `'Diajukan'`) | Huruf campuran. FINAL memakai huruf besar `DIAJUKAN` | Nilai lain di FINAL belum diketahui |
| Aturan pencocokan sekarang | `P1_05` §1 (diverifikasi ulang terhadap kode di `8dd626b`) | KPI I03/I05 dan FCC-missing: `program === kategori`. KPI I04: realisasi per `program`. FCC tabel: `kategori` ternormalisasi + subkategori + unit | — |

**Data FINAL tidak tersedia di lingkungan ini.** Semua uji di bawah memakai fixture rekaan di sandbox; uji pada salinan FINAL masuk rencana uji integrasi (`P1_07`).

### Relasi `30_REF_ALOKASI_PENGELUARAN` (inferensi dari nama kolom)

**INFERENSI**, wajib dikonfirmasi lewat uji kering pada salinan FINAL, yang melaporkan tingkat resolusi setiap kolom:

| Kolom | Dugaan tujuan | Dipakai di paket ini? |
|---|---|---|
| `transaksiId` | `05_TRANSAKSI.id` | **Ya** (wajib) |
| `anggaranId` | `08_ANGGARAN.id` | **Ya** (wajib untuk baris yang diimpor) |
| `nominal` | Bagian nominal transaksi untuk anggaran itu | **Ya** |
| `tingkatPemetaan` | Tingkat pemetaan (dokumen 05 menyebut "ITEM") | **Ya** (klasifikasi uji kering) |
| `alasanPengecualian` | Alasan pengeluaran sengaja tidak dipetakan ke RAB | Hanya dilaporkan |
| `komitmenId` | `09_KOMITMEN.id` | **Tidak** (keputusan §7) |
| `programId`, `rkatId`, `lpjId`, `lpjDokId`, `buktiId`, `periodeId`, `kategoriId`, `subId`, `sumberDanaId` | 35_REF_PROGRAM, 18_RKAT, 19_LPJ, 36_REF_LPJ_DOKUMEN, 10_BUKTI, 32_REF_PERIODE, 21, 22, 33_REF_SUMBER_DANA | **Tidak.** Disalin hanya sebagai jejak sumber (`sumberRefId`); tidak dipakai untuk menghitung |

---

## 2. Skema yang diusulkan

Sheet operasional **baru dan aditif** `30_ALOKASI_PENGELUARAN`. `30_REF_ALOKASI_PENGELUARAN` **tidak diubah, tidak dihapus, hanya dibaca**.

| Kolom | Isi | Aturan |
|---|---|---|
| `id` | `ap_<alokasiPengId>` untuk baris impor (deterministik → idempoten); `ap_<uuid>` untuk entri manual | PK |
| `transaksiId` | FK → `05_TRANSAKSI.id` | Wajib; PENGELUARAN aktif |
| `anggaranId` | FK → `08_ANGGARAN.id` | Wajib; anggaran aktif, bukan `jenis = PEMASUKAN` |
| `nominal` | Bagian nominal | > 0; Σ aktif per transaksi ≤ nominal transaksi |
| `tingkatPemetaan` | Salinan dari sumber | Teks; tidak ditafsirkan selain aturan §4 |
| `sumberRefId` | `alokasiPengId` sumber (kosong untuk manual) | Jejak asal |
| `importBatchId` | Id batch impor | — |
| `catatan` | Teks bebas | Satu-satunya field yang boleh diubah setelah dibuat |
| `createdAt`, `createdBy` | Diisi server | — |
| `archivedAt`, `archivedBy`, `archiveReason` | Arsip (koreksi = arsip + baris baru) | Tidak ada hard delete |

**Pembuatan sheet:**
- Hanya lewat fungsi admin eksplisit `opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN')` (BENDAHARA, dengan konfirmasi), beraudit `SCHEMA_CREATE_SHEET`.
- **Tidak** dipanggil otomatis saat boot, saat impor, atau oleh fungsi lain.
- Bila sheet sudah ada dengan header berbeda → `SCHEMA_MISMATCH`, tidak ditimpa.
- `DB_SCHEMA` diperbarui agar `opSchemaReport` mengenal sheet ini.

---

## 3. File dan fungsi terdampak

| File | Fungsi | Perubahan |
|---|---|---|
| **`_rab_match.js` (baru, sumber tunggal)** | `rabMatchCompute_(periode, D)` | Fungsi pencocokan bersama. Disuntikkan ke **klien** (HTML, lewat build) **dan server** (`FinanceEngine.gs`, lewat `build_server_engines.js`), sama seperti `_fcc_pure.js`/`_fcc_budget.js`. Murni: tanpa DOM/Store/Sheets |
| `_fcc_pure.js` | `fccCompute_` | `missing.rabTanpaRealisasi` memakai hasil `rabMatchCompute_`, bukan `t.kategori === a.program` |
| `_fcc_budget.js` | `fccBudgetVsActual_` | Kolom aktual pengeluaran memakai `rabMatchCompute_`. Kolom anggaran dipecah `anggaranDisetujui` / `anggaranDiajukan` / `anggaranTanpaStatus`. Status baris FCC dihitung dari anggaran **disetujui** |
| `FinanceEngine.gs` (generate) | `opFinancialControl` | `D.alokasiPengeluaran = sgRowsChecked_('30_ALOKASI_PENGELUARAN')` (sheet tidak ada → `[]`, perilaku sama dengan tanpa pemetaan eksplisit) |
| `RabMapping.gs` | `opRabRealization`, `rabMapCompute_` | Memakai `rabMatchCompute_` (rabMapCompute_ dihapus agar tidak ada aturan kedua) |
| **`RabAllocation.gs` (baru)** | `opAlokasiPengeluaranSetup`, `opAlokasiPengeluaranPlan`, `opAlokasiPengeluaranImport` | Pembuatan sheet eksplisit, uji kering, impor beraudit (§5) |
| `RecordEngine.gs` / `RecordGuard.gs` | `OP_RECORDS_`, `rgCheckOp_` | Key `alokasiPengeluaran` + aturan validasi §4 (dipakai juga oleh impor dan koreksi) |
| `CreateDatabaseStructure.gs` | `DB_SCHEMA` | + definisi `30_ALOKASI_PENGELUARAN` (tidak dijalankan otomatis) |
| `Bendahara_V2.html` (generate, langkah build baru `apply_p1_rab_client.js`) | `anggaranRabFor`, `realisasiForProgram`, blok KPI BDS03 di `financialAktivitasFeed`, `pengeluaranDiLuarRabBulanIni`, `rabMendekatiPagu`, ringkasan anggaran (`:2262`, `:4906`, `:4913`, `:5232`, `:5341`), `centralFccData_`, `OP_SHEETS`/`CC_` (baca `30_ALOKASI_PENGELUARAN`) | Semua memakai `rabMatchCompute_`. **Definisi indikator (`indDef`), bobot, target, ambang, `computeKpiRow` tidak disentuh.** Teks `formula` BDS03-I03/I04 di `indDef` adalah dokumentasi rumus; pembaruannya dibahas di §9 K-RAB-06 |
| `ServerBridge` (`build_bridge.js`) | — | + 3 method impor/setup |
| `_build_tests` | `rab_tests.js` (baru), `p0_tests.js` | Tes §8; ekspektasi regresi KPI BDS03 dipisahkan (§6) |

**Tidak disentuh:**
- BDS01, BDS02, BDS04, BDS05, BDS06.
- Rumus induk, bobot, target, ambang.
- `09_KOMITMEN` (§7).
- Data `08_ANGGARAN` dan `30_REF_ALOKASI_PENGELUARAN`.

---

## 4. Aturan pencocokan bersama dan validasi

### 4.1 `rabMatchCompute_(periode, D)`

Satu hasil dipakai KPI dan FCC. Untuk setiap PENGELUARAN aktif bertanggal di `periode`:

1. **Pemetaan eksplisit.** Baris `30_ALOKASI_PENGELUARAN` aktif dan valid untuk transaksi itu → realisasi masuk ke `anggaranId` masing-masing sebesar `nominal` alokasi.
   - Bila Σ alokasi < nominal transaksi, **sisanya ditandai "sisa tidak terpetakan"**. Sisa itu **tidak** dicocokkan ulang dengan aturan kategori (keputusan K-RAB-03).
2. **Aturan kategori** (hanya bila tidak ada pemetaan eksplisit): aturan `fccBudgetVsActual_` yang sudah diaudit, yaitu kategori ternormalisasi (id → nama), subkategori spesifik menang atas umum, unit sama, garis periode-bulan.
3. Selain itu: **tanpa RAB** (dengan alasan).

**Keluaran per transaksi:**
- `{transaksiId, sumber: 'EKSPLISIT'|'KATEGORI'|'TANPA_RAB', bagian: [{anggaranId atau lineKey, nominal, statusRab}], sisaTidakTerpetakan}`.
- Per baris/garis RAB: realisasi, dipisah menurut status RAB.

**Status RAB** (dinormalisasi huruf besar):
- `DISETUJUI` → disetujui.
- `DIAJUKAN` → diajukan.
- Kosong atau nilai lain → `TANPA_STATUS`; perlakuannya menunggu K-RAB-02.

**Pemakaian di KPI** (definisi dan bobot tetap; hanya input pencocokan yang berganti):

| Indikator | Sebelum | Sesudah |
|---|---|---|
| BDS03-I03 Sesuai RAB | ok bila ada RAB dengan `program === kategori` di periode yang sama (status apa pun) | ok bila transaksi **terpetakan penuh** (eksplisit atau kategori) ke RAB **disetujui** |
| BDS03-I04 Tidak melebihi pagu | Per baris RAB: realisasi = Σ pengeluaran dengan `kategori === program` | **Per garis anggaran** (§4.3) dengan `paguDisetujui > 0`: realisasi garis ≤ pagu disetujui. Satu aktivitas per garis. Garis tanpa RAB disetujui keluar populasi (K-RAB-05) |
| BDS03-I05 Di luar RAB punya persetujuan | ok bila ada RAB (aturan lama) atau ada komitmen dengan `transaksiId` | ok bila I03-baru ok atau ada persetujuan. **Bagian persetujuan tidak diubah** (§7) |
| FCC Anggaran vs Aktual | Aktual menurut aturan kategori | Aktual menurut `rabMatchCompute_`; kolom anggaran dipecah per status |
| FCC `missing` | RAB tanpa transaksi `kategori === program` | RAB **disetujui** tanpa realisasi menurut `rabMatchCompute_` dan tanpa komitmen |

### 4.2 Validasi `30_ALOKASI_PENGELUARAN` (RecordGuard; dipakai impor, koreksi, entri manual)

| Aturan | Kode galat |
|---|---|
| Transaksi ada, aktif, PENGELUARAN | `INVALID_TRANSACTION` |
| Anggaran ada, aktif, bukan PEMASUKAN | `INVALID_RAB` |
| `nominal` angka > 0 | `VALIDATION_ERROR` |
| Σ alokasi aktif per transaksi ≤ nominal transaksi | `ALOKASI_EXCEEDS_TRANSACTION` |
| Pasangan (transaksiId, anggaranId) aktif ganda | `DUPLICATE` |
| `transaksiId`/`anggaranId`/`nominal` tidak dapat diubah; koreksi = arsip + baris baru | `ALOKASI_IMMUTABLE` |

Semua aturan otorisasi (BENDAHARA), idempotensi (id), CONFLICT (`expect`), audit atomik, dan penanda periode (P1-POLICY) berlaku otomatis lewat jalur `opRecordBatch`.

---

### 4.3 Identitas garis anggaran dan aturan agregasi (K-RAB-04, ditetapkan sebelum implementasi)

**Garis anggaran** = kelompok baris `08_ANGGARAN` pengeluaran (`jenis ≠ PEMASUKAN`, tidak diarsipkan) yang dinilai bersama.

1. **Kunci garis** (`lineKey`):
   - Bila `kategori` terisi dan `unit ∈ {TK, MI}`: `kn(kategori) | norm(subkategori) | unit | periode`. Ini **identik** dengan kunci garis `fccBudgetVsActual_` sekarang. `kn` menerjemahkan id `21_KATEGORI_PENGELUARAN` ke nama, lalu menormalisasi huruf kecil dan spasi.
   - Selain itu: `BARIS|<id>`, yaitu garis tunggal untuk satu baris. Garis ini tidak dapat dicocokkan lewat aturan kategori, hanya lewat pemetaan eksplisit. Baris itu tetap dilaporkan di `anggaranTidakValid` seperti sekarang.
2. **Pagu garis per status:**
   - `paguDisetujui` = Σ nominal baris `DISETUJUI`.
   - `paguDiajukan` = Σ nominal baris `DIAJUKAN`.
   - `paguTanpaStatus` = Σ nominal baris berstatus kosong.
   - `paguStatusLain` = Σ nominal baris berstatus lain.
   - Normalisasi: huruf besar, tanpa spasi tepi (`Disetujui` = `DISETUJUI`).
3. **Realisasi garis** = Σ **bagian** transaksi yang dipetakan ke garis:
   - (a) bagian eksplisit: alokasi `30_ALOKASI_PENGELUARAN` ke baris mana pun di garis itu;
   - (b) bagian aturan kategori: transaksi tanpa pemetaan eksplisit yang cocok dengan garis (hanya garis periode-bulan, transaksi pada bulan yang sama).
4. **Tanpa hitung ganda.** Setiap rupiah transaksi masuk ke **paling banyak satu** garis:
   - eksplisit: per alokasi, ke garis baris tujuannya;
   - aturan: kunci garis unik, sehingga satu transaksi mencocokkan paling banyak satu garis;
   - sisa (K-RAB-03) dan tanpa RAB tidak masuk garis mana pun.
   - **Invarian yang diuji:** Σ realisasi semua garis + Σ sisa tidak terpetakan + Σ tanpa RAB = Σ nominal pengeluaran aktif.
5. **Transaksi dengan Σ alokasi eksplisit > nominal** (seharusnya tidak terjadi karena divalidasi saat tulis): seluruh alokasi eksplisitnya **diabaikan**. Transaksi itu menjadi tanpa RAB dan dilaporkan `ALOKASI_MELEBIHI_NOMINAL` (tanpa perbaikan otomatis).
6. **I04 (K-RAB-04/05):**
   - Populasi = garis dengan `paguDisetujui > 0`.
   - ok ⇔ realisasi garis ≤ `paguDisetujui` + 0,5. Realisasi garis mencakup semua bagian yang dipetakan ke garis, termasuk alokasi eksplisit ke baris DIAJUKAN di garis yang sama: belanja dicatat terhadap garis itu dan dibandingkan dengan pagu yang disetujui.
   - **Satu aktivitas per garis** (sebelumnya satu per baris RAB). Referensi = baris DISETUJUI pertama (urut id); tanggal jangkar = `anchorDateForPeriode(periode garis)`.
   - Perubahan populasi ini dilaporkan sebagai perubahan input yang disengaja.
7. **I03:** per transaksi pengeluaran. ok ⇔ sisa ≤ 0,5 **dan** setiap bagian disetujui:
   - eksplisit: status baris tujuan = DISETUJUI;
   - aturan: garis punya `paguDisetujui > 0`.
8. **I05:** ok ⇔ I03-baru ok **atau** `pengeluaranPunyaPersetujuan(t)` (tidak diubah; K-RAB-07).
9. **Tampilan per baris RAB** (tabel anggaran, laporan, snapshot laporan):
   - Realisasi baris = bagian eksplisit ke baris itu + bagian aturan garis **hanya bila garis berisi satu baris**.
   - Garis berisi >1 baris menampilkan keterangan realisasi garis (aturan kategori tidak dapat dibagi per baris tanpa mengarang).
   - **Total** (ringkasan Beranda, total laporan) dijumlahkan **per garis unik**, bukan per baris, agar tidak ganda.

## 5. Rencana uji kering dan impor

**`opAlokasiPengeluaranPlan()`** (read-only; BENDAHARA atau baca-saja). Baris `30_REF_ALOKASI_PENGELUARAN` diklasifikasikan **tanpa memperbaiki apa pun**:

| Kelas | Kriteria |
|---|---|
| `VALID` | Lolos semua aturan §4.2 dan `tingkatPemetaan` termasuk tingkat yang disetujui (default `ITEM`, K-RAB-01) |
| `DITOLAK` | Transaksi kosong/tidak ada/arsip/bukan PENGELUARAN; anggaran kosong/tidak ada/arsip/PEMASUKAN; nominal bukan angka > 0 |
| `DUPLIKAT` | `alokasiPengId` berulang di sumber; pasangan (transaksiId, anggaranId) berulang; atau id `ap_<alokasiPengId>` sudah ada di sheet operasional (dilaporkan sebagai `SUDAH_ADA`) |
| `PERLU_PEMERIKSAAN` | `tingkatPemetaan` di luar tingkat yang disetujui; Σ nominal valid per transaksi > nominal transaksi (semua baris transaksi itu); periode atau unit anggaran ≠ transaksi (ditandai, tidak dikoreksi); `alasanPengecualian` terisi |

**Keluaran:**
- Jumlah per kelas dan per alasan.
- Distribusi nilai `tingkatPemetaan`.
- Tingkat resolusi FK per kolom (§1).
- Daftar baris beserta alasan.
- `planHash` (hash isi sumber + klasifikasi, dengan `oblHash_`).

**`opAlokasiPengeluaranImport({planHash, confirm:'IMPOR_ALOKASI_PENGELUARAN'})`** (BENDAHARA):
- Menolak bila `planHash` ≠ hasil uji kering ulang (data berubah → `CONFLICT`).
- Hanya baris `VALID` yang ditulis, lewat `opRecordBatchLocked_`, sehingga validasi, audit per baris `RECORD_CREATE:alokasiPengeluaran`, dan penanda periode ikut berlaku. Batch ≤ 200, di dalam lock.
- Audit ringkasan `IMPOR_ALOKASI_PENGELUARAN` (batch id, jumlah per kelas, planHash) ditulis dalam append yang sama dengan batch.
- Idempoten: id deterministik → impor ulang = `UNCHANGED`.
- **Tidak** berjalan otomatis.
- Prosedur: hanya pada **salinan** spreadsheet terverifikasi, **setelah** pengguna memeriksa hasil uji kering (`P1_07`). Tidak ada impor ke produksi.

---

## 6. Perubahan hasil KPI yang diperkirakan

Perubahan berikut **disengaja** (input pencocokan), bukan regresi. Akan dilaporkan dengan uji diferensial.

| Indikator | Arah perubahan pada data FINAL (perkiraan dari dokumen 05; belum dihitung) | Pada fixture sandbox |
|---|---|---|
| BDS03-I03 | Sekarang hampir semua gagal (nama program ≠ kategori). Sesudah pemetaan: **tetap gagal untuk RAB DIAJUKAN** (85/85 DIAJUKAN), sekarang karena alasan yang benar, yaitu RAB belum disetujui. Lulus hanya untuk pengeluaran yang terpetakan ke RAB DISETUJUI | Dihitung di uji diferensial (§8) |
| BDS03-I04 | Sekarang **lulus semu** (realisasi per program ≈ 0). Sesudahnya: baris DIAJUKAN keluar dari populasi. Bila semua DIAJUKAN, populasi kosong → perilaku N/A yang sudah ada (Zero Activity Rule), bukan "lulus" | Idem |
| BDS03-I05 | Mengikuti I03-baru; bagian persetujuan tidak berubah | Idem |
| FCC | Aktual per RAB naik untuk pengeluaran terpetakan; `MISSING` turun; kolom DIAJUKAN/DISETUJUI terpisah | Idem |
| BDS01, BDS02, BDS04–06, BDS03-I01/I02/I06 | **Tidak berubah** (gerbang regresi) | Diuji identik |

Mekanisme regresi:
- Uji P0D-04 (skor identik vs baseline) dipecah menjadi (a) semua indikator **selain** BDS03-I03/I04/I05 **identik**, dan (b) BDS03-I03/I04/I05 dibandingkan dengan **ekspektasi diferensial** yang dihitung manual dari fixture.
- **P0D-05 (teks 13 simbol definisi KPI) pasti terdampak.** Salah satu dari 13 simbol itu adalah `financialAktivitasFeed`, fungsi yang memuat blok BDS03. Uji ini akan dipecah:
  - 12 simbol lain (termasuk `INDICATOR_MASTER`/`indDef`, `computeKpiRow`, `kpiIndukRow`, `kpiStatusFromScore`) **identik**.
  - `financialAktivitasFeed` identik **kecuali** blok `// ===== BDS03 ...` (diverifikasi dengan membandingkan teks fungsi setelah blok itu dikeluarkan).
  - Bila K-RAB-06 disetujui, teks `formula` BDS03-I03/I04 di `INDICATOR_MASTER` juga berubah. Dalam hal itu pengecualiannya terbatas pada dua string `formula` tersebut; bobot (angka argumen `indDef`) diverifikasi tetap.
- `anggaranRabFor`/`realisasiForProgram` bukan bagian dari 13 simbol, tetapi juga dipakai tampilan anggaran (§3).

---

## 7. Persetujuan pengeluaran di luar RAB (BDS03-I05): BAGIAN INI DIHENTIKAN

**Temuan audit:**
- KPI mencari `ObligasiSekolah.transaksiId` (`pengeluaranPunyaPersetujuan`, `:1766`), tetapi **kolom itu tidak ada** di `09_KOMITMEN`, baik di `DB_SCHEMA` maupun di FINAL. Bagian persetujuan BDS03-I05 saat ini **tidak pernah** dapat terpenuhi dari data server.
- Komitmen bersifat 1 komitmen → banyak pembayaran (status EXPECTED/COMMITTED/INCURRED/PAID). `transaksiId` tunggal di `09_KOMITMEN` tidak dapat mewakili komitmen yang dibayar bertahap.
- `30_REF_ALOKASI_PENGELUARAN` **sudah** memuat `komitmenId` per baris pengeluaran. Artinya data sumber memodelkan relasi di tabel pemetaan pengeluaran, bukan di komitmen.

| Alternatif | Isi | Kelebihan | Kekurangan |
|---|---|---|---|
| A. `09_KOMITMEN.transaksiId` | Kolom opsional di komitmen | Sesuai kode KPI sekarang | Hanya 1 transaksi per komitmen; mencampur peran komitmen dan pembayaran |
| B. `30_ALOKASI_PENGELUARAN.komitmenId` | Kolom opsional di tabel pemetaan; satu transaksi dapat merujuk komitmen yang menyetujuinya | Sesuai data sumber (`30_REF.komitmenId`); mendukung N pembayaran per komitmen; komitmen tidak menjadi ledger | Mengubah sumber data input I05 (persetujuan dibaca dari tabel pemetaan) |
| C. Tabel persetujuan tersendiri | `id, transaksiId, disetujuiOleh, tanggal, dokumen` | Paling eksplisit | Sheet baru lagi; tidak ada data sumbernya |

**Sesuai instruksi:** tidak ada asumsi yang diambil. Bagian persetujuan I05 **tidak diimplementasikan** dan `pengeluaranPunyaPersetujuan` tidak diubah. `komitmenId` **tidak** dimasukkan ke skema §2 sampai ada keputusan (K-RAB-07).

---

## 8. Rencana uji (`_build_tests/rab_tests.js`, sandbox)

| ID | Uji |
|---|---|
| RAB-01 | `opAlokasiPengeluaranSetup` tanpa konfirmasi → ditolak. Dengan konfirmasi → sheet dibuat sekali, beraudit. Pemanggilan ulang → UNCHANGED. Tidak ada fungsi lain yang membuat sheet |
| RAB-02 | Uji kering atas fixture `30_REF` rekaan berisi semua kasus (valid, transaksi tidak ada/arsip/PENERIMAAN, anggaran tidak ada/PEMASUKAN, nominal 0, duplikat id, duplikat pasangan, Σ melebihi transaksi, tingkat non-ITEM, periode/unit beda, alasanPengecualian) → jumlah per kelas tepat; `30_REF` tidak berubah (diff sel) |
| RAB-03 | Impor dengan planHash lama setelah sumber berubah → `CONFLICT`. Impor sah → hanya baris VALID; audit per baris + ringkasan dalam satu append; impor ulang → UNCHANGED |
| RAB-04 | Validasi §4.2 lewat `opRecordBatch('alokasiPengeluaran')`: setiap kode galat; koreksi = arsip + baru; ubah `nominal` → `ALOKASI_IMMUTABLE` |
| RAB-05 | Pencocokan: eksplisit mengalahkan kategori; pengeluaran dengan program ≠ kategori tetapi terpetakan eksplisit → realisasi masuk ke baris RAB itu (**bukan nol**); sisa parsial ditandai; tanpa pemetaan → aturan kategori; tidak cocok → TANPA_RAB |
| RAB-06 | Status: DIAJUKAN, DISETUJUI, dan kosong dipisah; I03 hanya lulus untuk DISETUJUI; I04 populasi hanya DISETUJUI |
| RAB-07 | Tidak ada realisasi ganda: Σ realisasi semua baris/garis + Σ tanpa RAB + Σ sisa = Σ pengeluaran periode |
| RAB-08 | **Diferensial KPI**: fixture yang sama dengan aturan lama vs baru. BDS03-I03/I04/I05 berubah sesuai ekspektasi manual; semua indikator lain **identik** |
| RAB-09 | **Diferensial FCC**: klien = server (fungsi sama); `missing` dan kolom status sesuai ekspektasi |
| RAB-10 | Otorisasi: AUDITOR tidak dapat setup/impor/menulis alokasi; baca boleh |
| RAB-11 | Tidak ada migrasi saat boot: boot klien dan server tidak membuat sheet, tidak mengimpor |

Semua suite yang ada (`run_all_tests.js`) tetap dijalankan. Uji pada salinan FINAL masuk `P1_07`.

---

## 9. Keputusan yang dibutuhkan sebelum kode

| ID | Pertanyaan | Usulan default |
|---|---|---|
| **K-RAB-01** | Tingkat `tingkatPemetaan` mana yang dianggap pemetaan eksplisit sah? | **DISAHKAN 19-10-2026:** hanya `ITEM` |
| **K-RAB-02** | Perlakuan RAB **tanpa status** (kolom kosong; baris lama/manual sebelum kolom status ada) | Diperlakukan **seperti DIAJUKAN** (tidak dianggap disetujui) tetapi ditampilkan terpisah sebagai `TANPA_STATUS`. Konsekuensi: RAB lama tanpa status tidak lagi meluluskan I03  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |
| **K-RAB-03** | Sisa nominal transaksi yang hanya sebagian dipetakan eksplisit | Ditandai "sisa tidak terpetakan" (tidak dicocokkan ulang dengan aturan kategori). Transaksi tidak lulus I03 sampai terpetakan penuh  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |
| **K-RAB-04** | I04 untuk garis aturan-kategori yang memuat >1 baris RAB disetujui | Dinilai di tingkat garis: Σ realisasi garis ≤ Σ pagu garis, hasilnya diterapkan ke setiap baris garis  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |
| **K-RAB-05** | Populasi I04: hanya RAB DISETUJUI? | Ya. Baris DIAJUKAN/TANPA_STATUS keluar populasi dan ditampilkan terpisah. Bila populasi kosong → N/A (aturan yang ada)  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |
| **K-RAB-06** | Teks `formula` BDS03-I03/I04 di `indDef` menyebut "kategori cocok dengan baris Anggaran". Perbarui teks dokumentasinya agar menyebut aturan baru? | Ya, **hanya teks dokumentasi**; bobot/target/ambang tidak berubah. Bila tidak disetujui, teks dibiarkan dan ketidaksesuaian dicatat  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |
| **K-RAB-07** | Relasi persetujuan I05: alternatif A, B, atau C (§7) | Tidak ada default; bagian ini dihentikan  **BELUM DISETUJUI**: analisis di `P1_08_ANALISIS_K_RAB_07.md`. |
| **K-RAB-08** | Persetujuan menambah sheet `30_ALOKASI_PENGELUARAN` (skema aditif, dibuat eksplisit) | Sudah diminta di tugas ini; dikonfirmasi ulang dengan skema §2  **DISAHKAN 19-10-2026** (lihat tabel keputusan di atas). |

## 10. Risiko dan kriteria penerimaan

| Risiko | Mitigasi |
|---|---|
| Relasi `30_REF` tidak seperti dugaan nama kolom | Uji kering melaporkan resolusi FK per kolom; impor hanya baris VALID; tidak ada perbaikan otomatis |
| Status RAB di FINAL memakai nilai lain | Normalisasi huruf besar + kelas `TANPA_STATUS` + distribusi status di uji kering |
| Perubahan KPI BDS03 disalahartikan sebagai regresi | Uji diferensial terpisah; laporan nilai sebelum/sesudah dan penyebab per transaksi |
| Divergensi klien vs server | Satu sumber `_rab_match.js` disuntikkan ke keduanya; RAB-09 |
| Beban baca tambahan (sheet baru dibaca setiap hitung KPI/FCC) | Dibaca sekali per hitung; dampak live diukur di `P1_07` |
| Impor tidak sengaja ke produksi | Impor butuh konfirmasi + planHash; prosedur `P1_07` mewajibkan verifikasi ID spreadsheet salinan |

**Kriteria penerimaan paket P1-RAB (sandbox):**
- RAB-01..11 PASS.
- Semua suite lama PASS.
- Indikator selain BDS03-I03/I04/I05 identik.
- `30_REF_ALOKASI_PENGELUARAN` tidak berubah.
- Tidak ada pembuatan sheet atau impor otomatis.
- Perubahan BDS03 dilaporkan dengan nilai sebelum/sesudah.

**Status maksimum tetap `READY_FOR_INTEGRATION_TEST`.**

---

## 11. Status implementasi dan penyimpangan dari rencana (19-10-2026)

| Rencana | Implementasi | Alasan |
|---|---|---|
| `rabMatchCompute_(periode, D)` | `rabMatchAll_(D)` atas **semua** periode; penyaringan periode dilakukan pemakai (FCC, KPI, `opRabRealization`) | I04 menilai garis setiap periode dan tampilan anggaran memuat beberapa periode; satu perhitungan menghindari dua hasil yang berbeda |
| `rabMapCompute_` dihapus | Dipertahankan sebagai pembungkus tipis di atas `rabMatchAll_` (tanpa aturan sendiri) | Bentuk keluaran `opRabRealization` dipertahankan (P1D-05); tidak ada aturan kedua |
| `DB_SCHEMA` + definisi `30_ALOKASI_PENGELUARAN` | **Tidak** ditambahkan ke `DB_SCHEMA`; header didefinisikan di `RabAllocation.gs` (`RAB_ALOKASI_HEADERS_`) dan `SG_REQUIRED_` | `setupDatabaseStructure_` membuat sheet dari `DB_SCHEMA`; menambahkannya ke sana akan membuka jalur pembuatan otomatis yang dilarang K-RAB-08 |
| Status `STATUS_LAIN` digabung ke `TANPA_STATUS` (§4.1) | Dipisah: `DISETUJUI` / `DIAJUKAN` / `TANPA_STATUS` (kosong) / `STATUS_LAIN` (nilai lain, mis. "Ditolak") | Nilai tak dikenal tidak disamakan dengan kosong; keduanya tetap **bukan** disetujui (K-RAB-02) |
| Validasi `alokasiPengeluaran` | Sesuai §4.2 + Σ dihitung juga di dalam satu batch | Batch berisi dua alokasi yang masing-masing sah tetapi bersama melebihi nominal ditolak pada baris kedua (RAB-15) |
| FCC `missing` | Per **garis** berpagu DISETUJUI pada periode; `id` = id baris disetujui pertama (urut), `rabIds` semua baris garis | Aturan lama (`t.kategori === a.program`) praktis selalu gagal sehingga setiap baris RAB tercatat "missing" (lihat diferensial di `P1_09`) |
| Ekspor "Laporan Anggaran & Realisasi" | Ikut memakai aturan bersama (sama dengan tabel di layar) | Tanpa itu ekspor dan tampilan memberi angka berbeda |
| Tes RAB-01..11 (§8) | `rab_tests.js` RAB-01..28 (26 PASS + 2 INFO nilai diferensial); pemetaan ID ke kasus wajib ada di `P1_09` §4 | Penomoran ulang mengikuti urutan suite |

Fungsi lama `anggaranRabFor` / `realisasiForProgram` tetap ada sebagai fungsi tetapi tidak lagi dipanggil KPI, tampilan, maupun ekspor.

