# P1_12 — Audit Kebijakan Lintas Bulan: RAB, Pencairan, Transaksi, LPJ

**Tanggal:** 19 Oktober 2026
**Dasar kode:** `f955416` (HEAD = remote, working tree bersih saat diperiksa).
**Status: AUDIT + USULAN. Tidak ada perubahan kode lintas periode.**

Hasil di sini berasal dari pembacaan kode dan simulasi sandbox Node. Belum ada yang dijalankan di Apps Script atau pada salinan Google Sheets, dan data FINAL tidak tersedia; header FINAL dibaca dari `_build_tests/fixtures/headers_backend.json`.

---

## 0. Hubungan dengan Keputusan 1 (`PERIOD_MISMATCH`)

Dua instruksi tertanggal 19-10-2026 saling bertentangan:

- **Keputusan 1** meminta server **menolak** alokasi lintas periode dengan `PERIOD_MISMATCH`.
- **Perubahan kebijakan lintas bulan** (instruksi yang lebih baru) meminta:
  - `PERIOD_MISMATCH` tidak diterapkan "secara membabi buta";
  - kasus "RAB September, transaksi aktual Oktober" ditandai `NEEDS_POLICY_DECISION`;
  - tahap ini dibatasi pada audit dan usulan.

**Tindakan:** Keputusan 1 **ditangguhkan, tidak diimplementasikan**. Aturan yang diminta Keputusan 1 dirumuskan sebagai usulan U-1 (§6), menunggu keputusan final. Perilaku sekarang dicatat apa adanya dan diuji sebagai karakterisasi (RAB-30), tanpa diubah.

## 1. Audit: apa yang benar-benar tersimpan

| Konsep | Ada di skema? | Field yang ditemukan | Catatan |
|---|---|---|---|
| A. Periode RAB | Ya | `08_ANGGARAN.periode` (label bulan, mis. "September 2026"; juga "Tahun Ajaran …"/"SekaliBayar") | — |
| A. Persetujuan RAB | **Sebagian** | `08_ANGGARAN.status` (FINAL; DB_SCHEMA aplikasi tidak punya kolom ini) | **Tidak ada** tanggal persetujuan maupun penyetuju. Status diisi lewat UI/impor oleh BENDAHARA (satu-satunya peran tulis) |
| B. Tanggal/periode pencairan | **Tidak** | — | Kata "pencairan/uang muka/panjar/kasbon" tidak muncul di kode, DB_SCHEMA, maupun FINAL (41 sheet). Pencairan hanya dapat tercatat sebagai transaksi PENGELUARAN biasa (tanpa penanda) atau sebagai transfer kas↔bank (diblokir, GAP-028) |
| C. Tanggal transaksi aktual | Ya | `05_TRANSAKSI.tanggal` (+ `createdAt`) | Server hanya memeriksa **format** `YYYY-MM-DD` (`validateTanggal_`); `2026-13-40` dan `2026-02-30` **diterima** (§3 temuan T4) |
| D. Tanggal penerimaan LPJ | **Tidak jelas** | `19_LPJ.tanggal` (satu tanggal per baris) | Tidak ada definisi apakah ini tanggal nota/kegiatan atau tanggal LPJ diserahkan. `36_REF_LPJ_DOKUMEN` (FINAL) punya `periodeId`, `status`, `pemeriksa`, `tanggalPemeriksaan`, tetapi **tidak dipakai** Web V2 |
| E. Tanggal verifikasi LPJ | **Tidak** (operasional) | `36_REF_LPJ_DOKUMEN.tanggalPemeriksaan` (referensi saja); `30_REF_ALOKASI_PENGELUARAN.statusLPJ/statusVerifikasi` (referensi saja) | Status `19_LPJ` FINAL = `REALIZATION` untuk 200/200 baris (GAP-020); aplikasi selalu menulis `REALIZATION`. Tidak ada status "diterima"/"diverifikasi" |
| Alokasi pengeluaran → item RAB | Ya (P1-RAB) | `30_ALOKASI_PENGELUARAN` (transaksiId, anggaranId, nominal) | Server tidak memeriksa periode. Uji kering menandai `PERIODE_BERBEDA` |
| LPJ → transaksi | Ya | `19_LPJ.transaksiId` | RecordGuard: transaksi PENGELUARAN aktif; Σ LPJ ≤ nominal transaksi. **Tidak** ada aturan periode (LPJ bulan berikutnya diterima) |
| LPJ → dokumen LPJ | Hanya FINAL | `19_LPJ.lpjDokId` → `36_REF_LPJ_DOKUMEN` | Tidak dipakai aplikasi |
| Pencairan → transaksi → RAB → LPJ | **Tidak dapat ditelusuri utuh** | Transaksi → RAB (alokasi/kategori) dan LPJ → transaksi ada; pencairan tidak ada sebagai entitas | — |

## 2. Alur data yang ditelusuri

| Komponen | Tanggal yang menentukan periode | Sumber |
|---|---|---|
| KPI BDS03-I01..I06 | Tanggal transaksi (`mkAkt(..., t.tanggal, ...)`); I04 = tanggal jangkar periode garis | `financialAktivitasFeed` |
| Pencocokan RAB (aturan kategori) | Bulan transaksi **harus sama** dengan periode garis | `rabMatchAll_` |
| Pencocokan RAB (alokasi eksplisit) | Tidak ada syarat periode | `rabMatchAll_`, RecordGuard |
| Financial Control aktual | Tanggal transaksi | `fccBudgetVsActual_` |
| Saldo kas/bank | Tanggal transaksi | `totalSaldoKas/Bank` |
| LPJ | Tidak masuk KPI, saldo, maupun FCC | — (dicari: tidak ada referensi LPJ di `financialAktivitasFeed`) |
| Kartu Beranda | Tanggal transaksi (setelah Keputusan 2: A/B/C, `P1_10`) | `renderBeranda` |

**Jawaban pertanyaan B:**
- Tanggal pencairan **tidak** disimpan.
- Tanggal transaksi aktual **disimpan**.
- Tanggal penerimaan LPJ **tidak dapat dipastikan** (`19_LPJ.tanggal` ambigu).
- Tanggal verifikasi LPJ **tidak** disimpan di data operasional.
- Pencairan → transaksi → item RAB → LPJ **tidak dapat ditelusuri utuh**, karena pencairan bukan entitas.
- LPJ bulan berikutnya **tidak** membuat KPI atau saldo keliru, karena LPJ tidak dihitung di keduanya. **Kecuali** pada jalur T1 (§3).

## 3. Temuan

| ID | Temuan | Dampak |
|---|---|---|
| **T1** | "Buat Transaksi Pengeluaran dari LPJ" (`createTransaksiFromLpj`) membuat transaksi baru bertanggal `19_LPJ.tanggal` untuk baris LPJ yang belum punya `transaksiId` | (a) Bila pencairan sudah dicatat sebagai PENGELUARAN, rincian LPJ menjadi pengeluaran **kedua**, sehingga pengeluaran dan saldo terhitung ganda; RecordGuard tidak dapat mencegahnya karena LPJ itu belum tertaut. (b) Bila `tanggal` LPJ = tanggal penyerahan (Oktober), transaksi jatuh di Oktober: RAB September tidak cocok lewat aturan kategori, I03 gagal, dan arus kas bergeser |
| **T2** | Pencairan uang muka tidak dapat dibedakan dari pengeluaran final | Realisasi dicatat saat pencairan. Sisa uang muka yang dikembalikan tidak punya jalur (bukan PENERIMAAN biasa; transfer diblokir). Sistem tidak dapat menyatakan "dicairkan tetapi belum dipertanggungjawabkan" |
| **T3** | Status LPJ hanya `REALIZATION` | "Diterima", "diverifikasi", dan "selesai" tidak dapat dibedakan. Sistem **tidak** menyatakan dana dipertanggungjawabkan, tetapi juga tidak dapat menunjukkan LPJ yang belum diterima |
| **T4** | `validateTanggal_` hanya memeriksa format | `2026-13-40` diterima; periodenya kosong, sehingga transaksi tidak masuk periode mana pun (KPI, FCC, total periode) tetapi tetap tersimpan. `2026-02-30` diterima dan dipetakan ke Februari |
| **T5** | Alokasi eksplisit lintas periode diterima server. Bagiannya masuk realisasi garis (I04) tetapi tidak masuk kolom aktual FCC periode transaksi | Invarian FCC per periode tidak tertutup untuk kasus ini. Sejak Keputusan 2, bagian ini tampil terpisah sebagai B2 "terpetakan ke garis periode lain" (`ringkasanPeriode`) |
| **T6** | Persetujuan RAB tanpa tanggal | "RAB disetujui sebelum dana dicairkan" tidak dapat diperiksa |

## 4. Matriks kasus lintas bulan

Keputusan usulan: ACCEPT / REJECT / NEEDS_POLICY_DECISION. Kolom "Sekarang" adalah perilaku kode `f955416` + Keputusan 2.

| # | Kasus | Usulan | Sekarang | Catatan |
|---|---|---|---|---|
| 1 | RAB Sep disetujui, pencairan Sep (PENGELUARAN Sep), LPJ diserahkan Okt | **ACCEPT**; status LPJ tetap "menunggu verifikasi" sampai diverifikasi | Diterima. Realisasi tercatat Sep. LPJ tertaut transaksi Sep diterima (tanpa cek periode) | Status "menunggu verifikasi" belum ada (T3) |
| 2 | Transaksi aktual Sep, LPJ Okt, `transaksiId` valid, Σ LPJ ≤ nominal | **ACCEPT** | Diterima (RecordGuard `lpj`) | — |
| 3 | RAB Sep, transaksi aktual Okt | **NEEDS_POLICY_DECISION** | Aturan kategori: tidak cocok (bulan berbeda), jadi TANPA RAB, I03 gagal. Alokasi eksplisit ke garis Sep: diterima server, tetapi tidak masuk B Okt (tampil sebagai B2); uji kering impor: `PERIODE_BERBEDA` (`PERLU_PEMERIKSAAN`, tidak diimpor) | Opsi kebijakan di §6 U-1 |
| 4 | Alokasi ke RAB DIAJUKAN / tanpa status | **ACCEPT sebagai catatan alokasi**, **tidak** dihitung sebagai anggaran disetujui | Diterima. `statusRab` asli dipertahankan, I03 gagal, B1 di Beranda | Sesuai K-RAB-02/05 |
| 5a | Σ alokasi > nominal transaksi | **REJECT** | `ALOKASI_EXCEEDS_TRANSACTION`; data lama yang berlebih diabaikan dan dilaporkan | K-RAB-03 |
| 5b | Alokasi duplikat (pasangan aktif sama) | **REJECT** | `DUPLICATE` | — |
| 5c | Transaksi/anggaran tidak ada, diarsipkan, atau bukan pengeluaran | **REJECT** | `INVALID_TRANSACTION` / `INVALID_RAB` | — |
| 5d | Tingkat pemetaan bukan ITEM (impor) | **REJECT** (tidak diimpor) | `PERLU_PEMERIKSAAN` | K-RAB-01 |
| 6 | Pencairan Sep dicatat PENGELUARAN; LPJ Okt diubah menjadi transaksi baru ("Buat Transaksi dari LPJ") | **REJECT** (hitung ganda); LPJ seharusnya ditautkan ke transaksi pencairan | **Diterima** (T1) | Butuh keputusan cara menandai uang muka (U-3) sebelum tombol dibatasi |
| 7 | LPJ tanpa transaksi, dibuat transaksi dari LPJ, tanggal LPJ = tanggal penyerahan (bulan berikutnya) | **NEEDS_POLICY_DECISION** | Transaksi bertanggal penyerahan LPJ | Perlu definisi `19_LPJ.tanggal` (U-2) |
| 8 | Sisa uang muka dikembalikan pada bulan berikutnya | **NEEDS_POLICY_DECISION** | Tidak ada jalur khusus | Terkait GAP-028 (transfer) |
| 9 | LPJ bertanggal **sebelum** transaksi/pencairan | **NEEDS_POLICY_DECISION** (tandai untuk pemeriksaan) | Diterima tanpa tanda | — |
| 10 | Total LPJ > nominal transaksi | **REJECT** | `LPJ_EXCEEDS_TRANSACTION` | — |
| 11 | Tanggal transaksi kosong / format salah | **REJECT** | `VALIDATION_ERROR` | — |
| 12 | Tanggal transaksi tidak mungkin (`2026-13-40`, `2026-02-30`) | **REJECT** (usulan U-4) | **Diterima** (T4) | Mengubah validasi tulis; butuh persetujuan karena dapat menolak impor lama |
| 13 | Alokasi ke garis non-bulanan ("Tahun Ajaran …", "SekaliBayar") | **NEEDS_POLICY_DECISION** | Diterima. Selalu B2 di Beranda | — |
| 14 | RAB disetujui **setelah** transaksi | **NEEDS_POLICY_DECISION** | Tidak dapat dideteksi (T6) | Butuh tanggal persetujuan |
| 15 | Pencairan dianggap LPJ selesai | **REJECT** | Sistem tidak pernah menyatakannya (tidak ada status) | Pertahankan |

## 5. Dampak terhadap KPI dan Financial Control

| Ukuran yang harus dibedakan | Dapat dihitung sekarang? | Sumber / usulan |
|---|---|---|
| Anggaran disetujui | Ya | `paguDisetujui` (A) |
| Dana dicairkan | **Tidak** | U-3 |
| Pengeluaran aktual | Ya | C (`totalPengeluaran`) |
| Pengeluaran teralokasi ke RAB | Ya | B, B1, B2 |
| Pengeluaran belum teralokasi | Ya | B3, B4 |
| LPJ belum diterima | **Tidak** | U-2 (status + tanggal terima) |
| LPJ diterima, belum diverifikasi | **Tidak** | U-2 |
| LPJ selesai diverifikasi | **Tidak** | U-2 |

- **Hitung ganda pencairan:** pencairan yang dicatat sebagai PENGELUARAN **adalah** pengeluaran aktual. Rincian LPJ hanya boleh menjadi rincian (tautan `transaksiId`, Σ ≤ nominal), bukan transaksi baru. Jalur T1 adalah satu-satunya celah hitung ganda yang ditemukan.
- **KPI:** BDS03 menilai per transaksi dan per garis, tanpa LPJ. LPJ bulan berikutnya tidak mengubah KPI. Bila kebijakan kasus 3 diputuskan "diterima", I03/I05 transaksi Okt yang dialokasikan ke RAB Sep akan berubah. Itu perubahan input BDS03 dan butuh persetujuan serta uji diferensial.
- **Financial Control:** tidak ada konsep pencairan atau LPJ. Usulan kolom tambahan bersifat informasi; rumus FCC yang ada tidak diubah.

## 6. Usulan (butuh keputusan; tidak diimplementasikan)

| ID | Usulan | Skema |
|---|---|---|
| **U-1** | Kebijakan periode alokasi. Opsi: (a) **ketat** = periode bulan transaksi harus sama dengan periode garis, server menolak `PERIOD_MISMATCH` (Keputusan 1); (b) **jendela** = transaksi boleh jatuh ≤ N hari setelah akhir periode garis (mis. kegiatan setelah pencairan tanggal 20), di luar itu ditolak; (c) **pengecualian tercatat** = lintas periode hanya dengan alasan + persetujuan peran penyetuju (tidak otomatis). Rekomendasi: **(a) sebagai default + (c) untuk pengecualian**. Pengecualian otomatis tidak dibuat | (a) tidak ada; (c) kolom `alasanLintasPeriode`, `disetujuiOleh`, `disetujuiPada` di `30_ALOKASI_PENGELUARAN` |
| **U-2** | LPJ sebagai dokumen berstatus: `DIAJUKAN → DITERIMA → DIVERIFIKASI` (atau `DITOLAK`). Tanggal terima dan tanggal verifikasi terpisah dari tanggal nota. Pemeriksa = peran selain BENDAHARA | `19_LPJ`: `tanggalNota` (atau definisikan `tanggal` = tanggal nota), `lpjDokId`; sheet operasional dokumen LPJ (dari `36_REF_LPJ_DOKUMEN`): `status`, `tanggalDiterima`, `tanggalVerifikasi`, `diverifikasiOleh` |
| **U-3** | Pencairan sebagai penanda pada transaksi PENGELUARAN (`sifat = UANG_MUKA`) + Σ LPJ tertaut. Hasilnya: "dicairkan", "dipertanggungjawabkan sebagian/penuh", "sisa dikembalikan". Tombol "Buat Transaksi dari LPJ" ditolak bila ada uang muka terbuka pada kegiatan yang sama, dan LPJ ditautkan ke uang muka | `05_TRANSAKSI.sifat` (aditif), opsional `pencairanId` |
| **U-4** | `validateTanggal_` memeriksa tanggal kalender nyata | Tidak ada; perubahan validasi tulis |
| **U-5** | Tanggal persetujuan RAB | `08_ANGGARAN.disetujuiPada`, `disetujuiOleh` (aditif) |

Semua usulan bersifat aditif. **Tidak ada** pengisian data historis otomatis. Baris lama tetap kosong pada kolom baru dan diperlakukan "tidak diketahui", bukan "valid".

## 7. Test case yang diusulkan

| ID | Kasus | Hasil yang diharapkan | Status |
|---|---|---|---|
| TC-LB-01 | Transaksi Sep + LPJ Okt tertaut, Σ ≤ nominal | LPJ diterima; KPI/saldo Sep tidak berubah | **Diuji sandbox (RAB-31)** |
| TC-LB-02 | LPJ Okt > nominal transaksi Sep | `LPJ_EXCEEDS_TRANSACTION` | Diuji (P1D-02 + RAB-31) |
| TC-LB-03 | RAB Sep, transaksi Okt, tanpa alokasi | TANPA RAB, I03 gagal (perilaku sekarang) | **Diuji sandbox (RAB-30)** |
| TC-LB-04 | RAB Sep, transaksi Okt, alokasi eksplisit | Sekarang: diterima, B2 (bukan B). Setelah U-1: sesuai keputusan | Karakterisasi (RAB-30) |
| TC-LB-05 | Alokasi dalam periode sama | Diterima, masuk B | Diuji (RAB-29) |
| TC-LB-06 | Pencairan Sep + LPJ diubah jadi transaksi | Sekarang: transaksi kedua (hitung ganda). Setelah U-3: ditolak | Belum (butuh U-3) |
| TC-LB-07 | Tanggal transaksi `2026-13-40` | Sekarang: diterima (T4). Setelah U-4: ditolak | Karakterisasi (RAB-32) |
| TC-LB-08 | LPJ diterima, belum diverifikasi → laporan "menunggu verifikasi" | — | Belum (butuh U-2) |
| TC-LB-09 | RAB disetujui setelah transaksi | — | Belum (butuh U-5) |
| TC-LB-10 | Sisa uang muka dikembalikan bulan berikutnya | — | Belum (butuh U-3 + GAP-028) |

## 8. Rencana implementasi (setelah kebijakan final)

1. Keputusan U-1..U-5 dan kasus matriks bertanda NEEDS_POLICY_DECISION.
2. Uji kering read-only di salinan FINAL:
   - distribusi selisih bulan transaksi vs garis untuk `30_REF` (`periodeId` vs tanggal transaksi);
   - arti `19_LPJ.tanggal` (bandingkan dengan `36_REF_LPJ_DOKUMEN.periodeId`);
   - jumlah LPJ tanpa `transaksiId`.
3. Perubahan skema aditif, masing-masing lewat fungsi admin berkonfirmasi (pola K-RAB-08); tanpa backfill.
4. Validasi server (U-1/U-4) pada **semua** jalur tulis yang sama: `opRecordBatch('alokasiPengeluaran')`, `opAlokasiPengeluaranImport` (lewat `opRecordBatchLocked_` → RecordGuard), `opCreateExpense`/`opUpdateTransaction` (untuk U-4, termasuk perubahan tanggal transaksi yang sudah punya alokasi).
5. Uji diferensial KPI/FCC sebelum/sesudah. Commit terpisah per keputusan.
