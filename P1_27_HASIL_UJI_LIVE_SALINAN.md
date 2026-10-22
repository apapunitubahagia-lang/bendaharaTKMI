# P1_27 — Hasil Uji Live Pertama pada Salinan Nonproduksi

**Tanggal:** 22 Oktober 2026

**Status:** uji live **sebagian berjalan**; GAP-005 **belum ditutup**; produksi **tidak disentuh**.

Ini adalah hasil pertama yang berasal dari **Apps Script sungguhan** (bukan sandbox Node). Hasil dicatat dari log *Executions* yang dikirim pemilik.

## 1. Lingkungan

| Hal | Nilai |
|---|---|
| Spreadsheet uji | `UJI_Bendahara`, ID `1bV8IBmh9DNCK4vO_cqO5gwLhJ36yfDmVxyhFcHeYOns` (bukan produksi `1QRibka0…`) |
| Proyek Apps Script uji | `1SYwG1_rUJkEK8mxrMJcaXsb4Rwvyi6e6rGDYhMy-v3JeOJ6dIeulVOAE` (terikat pada salinan; dikonfirmasi Apps Script API oleh `guard_target.js`) |
| Pengiriman kode | Workflow GitHub "Kirim ke Apps Script UJI" run #3, commit `4185e71`, 34 berkas (`clasp push`). Seluruh 49 suite sandbox lolos dan check_deploy D1–D6 PASS di runner |
| Run #1 | Gagal: checkout dangkal → 3 suite yang membandingkan dengan commit lama gagal. Diperbaiki dengan `fetch-depth: 0` |
| Run #2 | Berhenti di pengaman tujuan: `TEST_SPREADSHEET_ID` berisi URL. Diperbaiki pemilik menjadi ID |
| Pelaksana | Akun Gmail institusi (`gmail.com`), dijalankan dari editor |

## 2. Hasil (22 Okt 2026, 20.52–20.58 WIB)

| Fungsi | Durasi | Hasil |
|---|---|---|
| `ltPreflight` | 6,6 dtk | Pengaman salinan lolos. Identitas: SUCCESS, BENDAHARA. Jumlah baris: 05 = 843, 06 = 655, 08 = 85, 11 = 346, 13 = 2.992, 18 = 174, 19 = 200; 04/09/10/12/14/16/17 = 0. **`11_MUTASI_BANK`: 346 baris, TEREKONSILIASI = 0.** **`buktiFolder.ok = false`** ("folder tidak dapat dibuka oleh akun ini") |
| `ltIdentitasProbe` | 1,7 dtk | Email aktif & efektif terbaca (`gmail.com`), sama (dijalankan pemilik dari editor). Server: SUCCESS / BENDAHARA |
| `ltReadOnlyChecks` | 21,1 dtk | `kpiSourcesOk = true`. Skema: semua MATCH, kecuali `09_KOMITMEN` dan `10_BUKTI` (**kolom aditif belum ada**). `30`–`33` belum ada (dibuat hanya lewat setup eksplisit). `99` tidak diverifikasi |
| `ltRejectionChecks` | 12,0 dtk | **`lulus = true`.** 26 kasus tanggal/periode tidak sah ditolak `VALIDATION_ERROR`; pemberian KEPALA_SEKOLAH/YAYASAN ditolak `PRIVILEGED_ROLE_CHANGE_DENIED`. Tidak ada yang diterima atau ditolak dengan alasan lain |
| `ltKewajibanBekuAudit` | 31,0 dtk | `bacaSaja = true`; **0 baris kewajiban beku**; `KONSISTEN`; tanpa pengecualian |
| `ltPostflight` | 5,5 dtk | **`lulus = true`**: tidak ada baris berubah; status mutasi identik |

## 3. Kesimpulan yang **didukung bukti**

1. Kode commit `4185e71` termuat dan berjalan di Apps Script V8 nyata. Waktu eksekusi jauh di bawah batas 6 menit.
2. Validasi server (tanggal kalender, label periode, peran istimewa) **bekerja di Apps Script nyata**, tanpa menulis apa pun (Postflight).
3. Pengaman salinan (`ltGuard_`) dan pengaman tujuan workflow bekerja.
4. Salinan **tidak memiliki kewajiban beku** (04 kosong). Duplikat kewajiban beku tidak ada pada data ini; jalur koreksi D-1 tidak diperlukan untuk data saat ini.

## 4. Temuan yang **perlu tindak lanjut**

| ID | Temuan | Tindakan |
|---|---|---|
| L-1 | **TEREKONSILIASI = 0 dari 346 mutasi** pada salinan. Angka "544 TEREKONSILIASI" yang dipakai sejak brief awal **tidak cocok** dengan salinan ini (total mutasi pun hanya 346). Asal angka 544 belum diketahui. Kemungkinan: salinan dari berkas/versi lain, nilai status ditulis berbeda, atau 544 merujuk sheet lain (mis. status transaksi) | Jalankan `ltStatusRingkasan()` (baru, baca-saja). Pemilik memastikan salinan dibuat dari spreadsheet produksi yang benar. **Tidak ada kesimpulan sampai bukti lengkap** |
| L-2 | Folder bukti uji tidak dapat dibuka (`BUKTI_FOLDER_ID`) | Isi **ID** folder saja (bagian setelah `/folders/`), milik akun institusi. `ltStatusRingkasan()` mendiagnosis format nilai tanpa mencetak isinya |
| L-3 | `09_KOMITMEN` & `10_BUKTI` kekurangan kolom aditif | Migrasi Skema Aditif (Pusat Data) **di salinan** pada tahap berikutnya, setelah persetujuan |
| L-4 | Identitas baru dibuktikan dari **editor** (pemilik). Belum dari **web app** | Uji *Test deployment* (*Execute as: Me*, *Only myself*) dan buka aplikasi di peramban |

## 4a. Lanjutan: `ltStatusRingkasan` (22 Okt 2026, 21.19 WIB, commit `7d4066c`)

| Sheet | Baris | Sebaran status (apa adanya) | Kolom `archivedAt` |
|---|---|---|---|
| `05_TRANSAKSI` | 843 (PENERIMAAN 643, PENGELUARAN 200) | SELESAI 200 · TERALOKASI 549 · TERCATAT 64 · SEBAGIAN_TERALOKASI 27 · TERIDENTIFIKASI 3 | tidak ada |
| `11_MUTASI_BANK` | 346 | BELUM_DIPROSES 346 | tidak ada |
| `16_REKONSILIASI` | 0 | — | — |
| `19_LPJ` | 200 | REALIZATION 200 | tidak ada |
| `06_ALOKASI` | 655 | — | tidak ada |

Tidak ada nilai status yang memuat "REKONSIL" (huruf apa pun) di sheet mana pun.

- **L-1 (diperbarui):** salinan **tidak memuat** status TEREKONSILIASI. Angka 544 tidak dapat ditemukan di data ini. Angka terdekat (549 TERALOKASI) adalah status berbeda dan **tidak** disamakan. Perlu verifikasi pada spreadsheet produksi secara baca-saja (*Data → Column stats* pada kolom status `11_MUTASI_BANK`), atau konfirmasi sumber angka 544 dari pemilik.
- **L-2 selesai:** `BUKTI_FOLDER_ID` kini valid (folder `Bukti_UJI` dapat dibuka).
- **L-3 (diperluas):** kolom `archivedAt` belum ada di 05/06/11/19, sehingga arsip/reversal akan ditolak `SCHEMA_ADDITIVE_REQUIRED` sampai Migrasi Skema Aditif dijalankan (di salinan, setelah persetujuan).

## 5. Yang **belum** diuji live
Web app & UI peramban; operasi tulis (transaksi, alokasi, impor, uang muka, LPJ); kontensi LockService; unggah bukti ke Drive; setup skema LPJ; rencana tarif (katering harian); KPI server (`opKpiServer`) pada data salinan.

GAP-005 tetap **terbuka** (lihat L-4). GAP-028 tetap **BLOCKED**.
