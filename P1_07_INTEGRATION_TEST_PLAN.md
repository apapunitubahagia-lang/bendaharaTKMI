# P1_07 — Rencana Uji Integrasi (Apps Script + Salinan Google Sheets)

**Tanggal:** 19 Oktober 2026
**Status: RENCANA. Belum ada pengujian live yang dilakukan.**

Lingkungan berikut **belum tersedia**:
- proyek Apps Script uji;
- salinan spreadsheet terverifikasi;
- `clasp` dengan kredensial pengguna.

Dari sesi ini juga **tidak ada** akses ke Google Sheets maupun Drive. Semua hasil sampai sekarang adalah **sandbox Node** (`_build_tests`).

**Prinsip:**
- Tidak ada akses atau perubahan ke spreadsheet produksi.
- Tidak ada deployment Web App produksi.
- Semua langkah dikerjakan pengguna, atau oleh agen bila diberi akses ke proyek uji saja.
- Kredensial tidak dibagikan ke percakapan.

**Legenda pelaksana:**
- **[M]** = manual oleh pengguna (butuh akses Google yang belum tersedia bagi agen).
- **[S]** = dapat dijalankan dari editor Apps Script uji.
- **[A]** = agen, hanya bila akses ke proyek uji diberikan.

---

## 1. Menyiapkan proyek Apps Script terpisah

| # | Langkah | Pelaksana | Bukti yang disimpan |
|---|---|---|---|
| 1.1 | Pastikan salinan spreadsheet (§2) sudah ada **lebih dulu**. Kode memakai `SpreadsheetApp.getActiveSpreadsheet()`, jadi proyek **harus terikat (container-bound) ke salinan**, bukan proyek mandiri | M | — |
| 1.2 | Di salinan: Extensions → Apps Script → buat proyek baru. Beri nama `BENDAHARA_V2_UJI_<tanggal>`. Jangan menyalin proyek produksi | M | Tangkapan layar nama proyek |
| 1.3 | `npm i -g @google/clasp`, lalu `clasp login` di **mesin pengguna** | M | — |
| 1.4 | `clasp clone <scriptId-uji>` ke folder kerja baru, lalu salin berkas deploy dari repo (commit yang diuji dicatat) | M/A | Hash commit; isi `.clasp.json` (scriptId) |
| 1.5 | Berkas `.gs`: `Code`, `SchemaGuard`, `TransactionEngine`, `AuthCentral`, `MasterDataRead`, `CreateDatabaseStructure`, `OperationalAPI`, `RecordEngine`, `RecordGuard`, `AdminAPI`, `BuktiDrive`, `AllocationGuard`, `ObligationEngine`, `FinanceEngine`, `TarifPlan`, `PeriodLock`, `ReconEngine`, `RabMapping`, `RabAllocation` (paket P1-RAB). Berkas `.html`: `Bendahara_V2`, `ServerBridge`. **Tanpa** `deps/`, `_build_tests/`, `AUTH_CENTRAL_TEST.gs`, `MigrationOneTime.gs` | M/A | Daftar berkas hasil `clasp status` |
| 1.6 | `appsscript.json`: `"runtimeVersion": "V8"`, `"timeZone": "Asia/Jakarta"`. Web app `executeAs` / `access` sesuai keputusan GAP-005 (**belum diputuskan**; untuk uji gunakan akses terbatas domain atau akun uji). Scope OAuth minimal: spreadsheet + Drive (untuk bukti) | M | Isi `appsscript.json` |
| 1.7 | `clasp push`, lalu Deploy → New deployment → Web app (**uji**). Catat URL deployment uji | M | URL + deploymentId |
| 1.8 | Daftarkan akun uji di `26_USER_ACCESS` **salinan**: 1 BENDAHARA, 1 BENDAHARA kedua (untuk uji dua pengguna), 1 AUDITOR, 1 INACTIVE. Siapkan juga 1 akun yang tidak terdaftar | M | Ekspor baris `26_USER_ACCESS` |

## 2. Menyiapkan salinan spreadsheet uji

| # | Langkah | Pelaksana |
|---|---|---|
| 2.1 | Dari spreadsheet FINAL: File → Make a copy → `BENDAHARA_V2_UJI_<tanggal>` di folder uji terpisah. Jangan berbagi ke pengguna produksi | M |
| 2.2 | Catat **ID salinan** dan **ID sumber** | M |
| 2.3 | Ambil titik pemulihan: File → Version history → Name current version → `BASELINE_SEBELUM_UJI` | M |
| 2.4 | Ekspor (CSV/XLSX) sheet `05`, `06`, `08`, `09`, `10`, `11`, `13`, `15`, `16`, `24`, `30_REF_ALOKASI_PENGELUARAN` sebagai **bukti kondisi awal** | M |

## 3. Memverifikasi ID proyek dan spreadsheet

**Wajib sebelum setiap sesi uji.**

| # | Pemeriksaan | Cara | Lulus bila |
|---|---|---|---|
| 3.1 | Spreadsheet aktif = salinan | Di editor uji jalankan `function cekLingkungan(){ var s=SpreadsheetApp.getActiveSpreadsheet(); Logger.log(s.getId()+' | '+s.getName()); }` **[S]** | ID = ID salinan (§2.2) |
| 3.2 | **Bukan produksi** | Bandingkan dengan ID target produksi yang tercatat di header `TransactionEngine.gs`: `1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY` | ID **berbeda**. Bila sama → **HENTIKAN** semua uji |
| 3.3 | Script = proyek uji | `ScriptApp.getScriptId()` **[S]** | = scriptId di `.clasp.json` uji |
| 3.4 | Deployment = uji | URL web app yang dibuka = URL §1.7 | Sama |
| 3.5 | Kode = commit yang diuji | Bandingkan isi berkas dengan `git show <commit>:<file>` (mis. cek baris `[P1-POLICY]` ada) | Sama |

Catatan `cekLingkungan` adalah fungsi bantu sementara di proyek uji saja. **Jangan** di-commit ke repo deploy.

## 4. Prapemeriksaan read-only

| # | Fungsi | Hasil yang dicatat |
|---|---|---|
| 4.1 | `opSchemaReport()` | Status per sheet (TC-HDR-01) |
| 4.2 | `opSchemaPlan()` | Kolom aditif yang belum ada (TC-HDR-05). **Belum** `opSchemaApply`; itu keputusan terpisah di salinan |
| 4.3 | `opPeriodLockStatus()` | Juli–September terbaca TERKUNCI sebagai **penanda** |
| 4.4 | Hitung ulang dari data salinan | Jumlah mutasi per status (**menghitung ulang angka 544**, P1_04), jumlah RAB per status (85 DIAJUKAN?), jumlah baris dan nilai `tingkatPemetaan` di `30_REF_ALOKASI_PENGELUARAN` |

## 5. Transaksi, audit, dan idempotensi

| TC | Langkah | Lulus bila |
|---|---|---|
| TC-CRUD-01..03 | Sesuai dokumen 07 | Ekspektasi dokumen 07 |
| TC-CRUD-05 (rev.) | Penerimaan sah 2026-07-15 (Juli TERKUNCI); ulangi dengan `13_AUDIT_LOG` diproteksi (Data → Protect range, kecualikan akun uji); ulangi dengan AUDITOR dan payload tidak valid | Lihat ekspektasi revisi di dokumen 07. Untuk percobaan audit gagal: **tidak ada** baris tertinggal di 05, 06, 24, 13 |
| TC-TRX-01..03 | Multi-siswa, replay, alokasi berlebih | Dokumen 07 |
| TC-FAIL-02 | Matikan jaringan setelah klik simpan, lalu nyalakan kembali (DevTools offline) | 1 transaksi, audit tidak ganda |
| TC-FAIL-03 | `13_AUDIT_LOG` diproteksi → `opMasterUpsert`, `opRecordBatch`, `opSchemaApply` | Perubahan dibatalkan, galat jelas |
| P1-POLICY | Penerimaan terlambat Oktober untuk kewajiban Juli; koreksi transaksi September | Tanggal aktual tetap; kewajiban Juli lunas hanya lewat alokasi; audit `UPDATE_TRANSACTION` + `PERIODE_DITANDAI` satu timestamp |
| **Atomisitas** (dasar klaim "tanpa parsial") | Periksa bahwa baris audit utama + penanda selalu muncul berpasangan dengan timestamp identik di 13 | Tidak ada penanda tanpa audit utama, dan sebaliknya |

## 6. Perubahan dua pengguna bersamaan

| TC | Langkah | Pelaksana | Lulus bila |
|---|---|---|---|
| TC-FAIL-07 | Dua browser/profil, dua akun BENDAHARA, data termuat. A mengubah nominal anggaran X lalu simpan; B (tanpa memuat ulang) mengubah anggaran X lalu simpan | M | B mendapat `CONFLICT`; nilai A tetap di sheet |
| Konflik transaksi | Sama untuk catatan/nominal transaksi | M | Idem |
| TC-FAIL-06 | Dua klien menembak 50 entri audit hampir bersamaan (skrip konsol di dua browser) | M | 100 baris unik; tidak ada yang tertimpa. **Satu-satunya cara menguji LockService lintas eksekusi nyata** |

## 7. Izin Drive dan unggah bukti

| TC | Langkah | Lulus bila |
|---|---|---|
| Otorisasi Drive | Saat pertama memanggil `opUploadBukti`, setujui scope Drive | Folder `Bendahara_Bukti` dibuat di Drive pemilik skrip **uji** |
| TC-FAIL-05 | Lampirkan Bukti PDF ke transaksi server; muat ulang halaman | Baris 10_BUKTI + file Drive ada setelah muat ulang; status transaksi **tidak** berubah otomatis |
| Gagal unggah | Unggah ke transaksi yang tidak ada (konsol) | `INVALID_TRANSACTION`; tidak ada file baru di Drive |
| TC-AUTH-08 | Buka `driveFileUrl` dengan akun lain yang tidak diberi akses | Ditolak. **Kebijakan folder per tahun ajaran belum diimplementasikan**; catat hasil apa adanya |
| SELESAI wajib bukti | Tandai Direkonsiliasi tanpa bukti, lalu dengan bukti | Tanpa bukti → `EVIDENCE_REQUIRED`; dengan bukti → SELESAI |

## 8. Saldo rekonsiliasi akhir bulan vs saldo terkini

| # | Langkah | Lulus bila |
|---|---|---|
| 8.1 | Siapkan saldo rekening koran per 30-09 untuk satu akun bank uji (angka dari bendahara) | — |
| 8.2 | Rekonsiliasi September | `saldoSistem` = saldo awal + Σ transaksi ≤ 2026-09-30 (cocokkan manual dengan ekspor 05); `tanggalBatas` = 2026-09-30 |
| 8.3 | Catat transaksi bertanggal Oktober, lalu rekonsiliasi September ulang (`clientRequestId` baru) | `saldoSistem` September **tidak berubah**; `saldoSistemTerkini − saldoSistem` = Σ bersih transaksi Oktober |
| 8.4 | Selisih ≠ 0 tanpa catatan / dengan catatan | Ditolak / `PERLU_PENJELASAN`; saldo awal akun tidak berubah (bandingkan 07_AKUN dengan ekspor awal) |
| 8.5 | Kolom `16_REKONSILIASI` | Tidak ada kolom baru |
| 8.6 | TC-REK-02 (rev.) dan pencocokan ganda | Mutasi baru → `DIPROSES`; mutasi FINAL `TEREKONSILIASI` tidak dapat dicocokkan ulang (`ALREADY_MATCHED`) |

## 9. Pemetaan RAB dan hasil KPI

Hanya setelah paket P1-RAB disetujui dan diimplementasikan (`P1_06`).

| # | Langkah | Lulus bila |
|---|---|---|
| 9.1 | **Sebelum** pemasangan P1-RAB: catat skor KPI seluruh indikator dan laporan FCC periode Juli–Oktober (ekspor/tangkapan layar) | Data pembanding tersimpan |
| 9.2 | `opAlokasiPengeluaranSetup` (dengan konfirmasi) | Sheet `30_ALOKASI_PENGELUARAN` dibuat; `30_REF_*` tidak berubah |
| 9.3 | `opAlokasiPengeluaranPlan()` | Jumlah VALID / DITOLAK / DUPLIKAT / PERLU_PEMERIKSAAN dan alasannya. **Pengguna memeriksa hasil ini sebelum impor** |
| 9.4 | `opAlokasiPengeluaranImport({planHash, confirm})` | Hanya baris VALID; impor ulang = 0 baris baru; audit impor ada |
| 9.5 | **Sesudah**: skor KPI dan FCC periode yang sama | BDS03-I03/I04/I05 berubah sesuai penjelasan diferensial; **semua indikator lain identik** dengan 9.1; FCC klien = server |
| 9.6 | Tinjau 20 transaksi sampel: apakah status I03 sesuai transaksi aktual dan dokumen RAB | Dicatat per transaksi |
| 9.7 | TC-DSH-05/06 | Dokumen 07, dengan catatan RAB DIAJUKAN ≠ disetujui |

## 10. Memulihkan kondisi uji

1. Untuk uji yang akan diulang: File → Version history → pulihkan `BASELINE_SEBELUM_UJI` (§2.3). Riwayat versi tetap menyimpan versi pasca-uji sebagai bukti.
2. Hapus file uji di folder Drive `Bendahara_Bukti` milik akun skrip **uji** (bukan Drive produksi).
3. Setelah semua selesai: arsipkan deployment uji (Deploy → Manage deployments → Archive) dan cabut akses akun uji dari salinan.
4. **Jangan** menjalankan fungsi pemulihan apa pun terhadap produksi.

## 11. Menyimpan bukti dan mencatat kegagalan

Simpan setiap sesi di folder `BUKTI_UJI_<tanggal>`:
- hasil §3;
- ekspor sheet sebelum/sesudah;
- `Logger`/Executions log;
- tangkapan layar UI dan toast;
- respons JSON fungsi.

Laporan hasil (`P1_08_INTEGRATION_TEST_REPORT.md`) memakai format:

| TC | Commit | Tanggal/akun | Langkah | Hasil aktual | Status (PASS/FAIL/BLOCKED) | Bukti (nama berkas) | Catatan/galat |
|---|---|---|---|---|---|---|---|

Aturan pencatatan kegagalan:
- **FAIL** dicatat apa adanya beserta galat persis dan langkah reproduksi. Tidak diulang sampai "lulus" tanpa perbaikan kode yang di-commit.
- **BLOCKED** = tidak dapat dijalankan, dengan alasan (mis. belum ada akun kedua).
- Status `P1_COMPLETE` hanya boleh dinyatakan bila semua TC P0 + P1 berstatus PASS live.

## 12. Ringkasan pengujian yang membutuhkan tindakan manual atau akses yang belum ada

| Kebutuhan | Dipakai di | Status |
|---|---|---|
| Salinan spreadsheet FINAL + ID-nya | Semua | **Belum ada** |
| Proyek Apps Script terikat salinan + `clasp` login pengguna | Semua | **Belum ada** |
| Keputusan GAP-005 (executeAs/akses web app) | §1.6, TC-AUTH-* | **Belum diputuskan** |
| 2 akun BENDAHARA + AUDITOR + INACTIVE + akun asing | §5, §6, TC-AUTH-* | Belum disiapkan |
| Dua browser/profil serentak | TC-FAIL-06/07 | Manual |
| Proteksi range `13_AUDIT_LOG` untuk simulasi gagal | TC-FAIL-03, TC-CRUD-05 (b) | Manual |
| Persetujuan scope Drive + akun pembanding | §7, TC-AUTH-08 | Manual |
| Saldo rekening koran per akhir bulan | §8 | Data dari bendahara |
| Paket P1-RAB (menunggu tinjauan `P1_06`) | §9 | Belum diimplementasikan |
