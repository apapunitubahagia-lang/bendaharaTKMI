# Addendum skema dan transaksi arsip (2026-10-14)

Melengkapi `LAPORAN_TARIF_KEWAJIBAN_2026-2027.md` (bagian 4 "Perubahan skema" dan bagian 9 "Checklist uji live").
Dasar: header live dibaca read-only dari spreadsheet produksi; seluruh tes berjalan di sandbox (kode GAS dan skrip HTML asli, mock Sheets berheader live). Tidak ada tulisan ke Google Sheets, tidak ada migrasi di produksi, `Bendahara_V2_FULL_DATA.html` tidak disentuh (md5 4fabae72..., mtime 2026-09-28), salinan repo `GAS_Migration` dan `AUTH_CENTRAL_BUILD` tidak diubah.

## Keputusan skema berdasarkan bukti kode

| Sheet.kolom | Keputusan | Bukti |
|---|---|---|
| `09_KOMITMEN.rabId` | **Ditambahkan** ke `OP_SCHEMA_ADD_` (aditif di ujung header) | Dipakai `submitObligasi` (`rabId:val('obf_rab')`), `komitmenForRab` (filter `o.rabId===rabId`), `renderAnggaranKomitmen`, dan FCC (`fccCompute_`/`fccBudgetVsActual_`). Tidak ada di header live (`id,tanggal,uraian,nominal,status,jatuhTempo`). |
| `10_BUKTI.fileRef` | **Tidak ditambahkan** (dihapus dari rencana yang saya usulkan sebelumnya) | Nilai `fileRef` di klien hanya `reader.result` (data-URL) atau `''`. Jalur pusat memindahkan data-URL ke Drive (`ccPushBukti_`/`opUploadBukti`) dan menulis baris tanpa `fileRef`; `opUploadBukti` menulis berdasarkan header live. Sheet live punya 0 baris data. Tidak ada jalur tulis/baca pusat yang membutuhkan kolom itu. |
| `07_AKUN.status` | **Tidak ditambahkan** (dihapus dari rencana) | Bukan bagian `DB_SCHEMA`. Jalur pusat `submitAkun` tidak mengirim `status` dan `MASTER_WRITE_FIELDS.akun` tidak memuatnya. Menonaktifkan akun (`hapusAtauNonaktifkanAkun`) hanya berjalan pada mode lokal. FCC memperlakukan akun tanpa `status` sebagai aktif. |
| `03_TARIF.status` | Tetap di rencana, status OK | Kolom sudah ada di sheet live dan di `DB_SCHEMA`. |
| `02_KOMPONEN`: `sasaran`, `basisTarif`, `menggantikan` | Dalam rencana | Dipakai `komponenSasaranOk`, `kewajibanSatuBaris` (basis tarif), `komponenDigantikan`. |
| `04_KEWAJIBAN`: `jatuhTempo`, `tahunAjaran`, `kelas`, `unit`, `tarifId`, `tarifSatuan`, `jumlahHari` | Dalam rencana | Snapshot kewajiban beku (`oblSnapshotCore_`, mapping `tagihan` di klien). |
| `08_ANGGARAN`: `jenis`, `komponenId` + `status`, `subkategori`, `volume`, `satuan`, `hargaSatuan`, `keterangan`, `sourceSheet`, `importDate`, `importUser` | Dalam rencana | Anggaran terhubung komponen/kategori dan field model RAB/impor yang dipakai aplikasi. |

Hasil `opSchemaPlan` pada header live: 15 sheet butuh tambahan kolom (semua di ujung header; `07_AKUN` dan `10_BUKTI.fileRef` tidak lagi diusulkan; `10_BUKTI` hanya mendapat 3 kolom arsip).

## Audit jalur transaksi (baca, edit, arsip, reversal) dan perbaikan minimal

Pemanggil yang diperiksa: `Code.gs` (dispatcher lama), `OperationalAPI.gs` (`opGetTransactions`, `opGetTransaction`, `opUpdateTransaction`), `RecordEngine.gs` (`opArchiveTransaction`), klien (`ServerBridge`, `centralPushPatch_`, `OperationalAPI.transaksi()`), dan engine itu sendiri. Klien tidak memanggil `opGetTransactions`/`opGetTransaction`; ia membaca lewat `opReadSheet` dan menyaring baris `archivedAt` sendiri.

Temuan sebelum perbaikan:
1. `getTransactions`/`getTransactionRaw_` membaca 23 kolom posisional, sehingga `archivedAt` tidak terlihat: transaksi arsip tetap muncul pada daftar engine.
2. `updateTransaction` dan `createAllocation` tidak memeriksa arsip: transaksi arsip masih bisa diubah dan menerima alokasi baru.
3. Perhitungan kewajiban menghitung alokasi aktif milik transaksi yang diarsipkan di luar `opArchiveTransaction` (mis. edit sheet manual).
4. Patch antrean klien ke transaksi yang sudah diarsipkan di sesi lain diulang tanpa henti dan tidak masuk hitungan "gagal sinkron".

Perbaikan (aditif; bentuk baris transaksi aktif tidak berubah):
* `TransactionEngine.gs` (dihasilkan oleh `build_server_engines.js` + `edit_gen_archive.js`): `readTrxRows_` menempelkan `archivedAt/By/Reason` hanya bila terisi; `getTransactions` mengecualikan arsip kecuali `includeArchived:true`; `getTransaction(id)` tetap bisa membaca (riwayat) dan menyertakan `archivedAt`; `updateTransaction` dan `createAllocation` menolak dengan kode `TRANSACTION_ARCHIVED` (juga pada pemeriksaan ulang di dalam lock). Sheet tanpa kolom arsip berperilaku persis seperti sebelumnya.
* `ObligationEngine.gs` (dihasilkan): alokasi milik transaksi berarsip tidak dihitung walau alokasinya sendiri belum diarsipkan.
* Klien (`_central_block.js`, `_central_block2.js`): kegagalan permanen pada patch transaksi (mis. `TRANSACTION_ARCHIVED`) menahan patch itu (`_blocked`), tidak diulang, dan masuk hitungan "gagal sinkron"; tombol sinkron manual melepas tahanan.
* `TarifPlan.gs`: penerapan ulang rencana tarif tanpa perubahan tidak lagi menambah baris audit (benar-benar idempoten).

Kontrak API: parameter baru opsional (`includeArchived`); kode galat baru `TRANSACTION_ARCHIVED`; `getTransactions` kini mengecualikan arsip secara bawaan (satu-satunya pemanggil, dispatcher `Code.gs` lama dan `opGetTransactions`, tidak dipakai klien aktif).

## File yang berubah (dalam `MASTER_API_REFACTOR\`)
`AdminAPI.gs`, `TransactionEngine.gs` (dihasilkan), `ObligationEngine.gs` (dihasilkan), `TarifPlan.gs` (dihasilkan dari `_tarif_ops.gs.tpl`), `Bendahara_V2.html` (dihasilkan), `_central_block.js`, `_central_block2.js`, `_tarif_ops.gs.tpl`, `_build_tests\build_server_engines.js` + `edit_gen_archive.js` (patch generator), `_build_tests\live_seed.js` (header live 09/10), tes: `server_pass2.js`, `e2e_central2.js`, `tarif_server_tests.js` (diperbarui), `schema_archive_tests.js` (baru).

## Hasil tes aktual (sandbox)
| Rangkaian | Hasil |
|---|---|
| `server_pass2.js` | 58 / 58 PASS |
| `e2e_central2.js` | 80 / 80 PASS |
| `tarif_server_tests.js` | 52 / 52 PASS |
| `tarif_client_tests.js` | 40 / 40 PASS |
| `schema_archive_tests.js` (baru) | 27 / 27 PASS |

Cakupan `schema_archive_tests.js`: skema lama utuh setelah kolom baru (27 sheet, header/urutan/isi sel); kolom hanya di ujung; `07_AKUN` dan `10_BUKTI.fileRef` tidak ditambah; posisi siswa, seluruh kewajiban, dan kas FCC identik sebelum/sesudah; penerapan skema dan rencana tarif diulang tanpa perubahan; `rabId` tersimpan/terbaca/dipakai (`komitmenForRab`, FCC server, `submitObligasi` UI, komitmen tanpa RAB, penahanan sebelum migrasi); transaksi arsip tidak di daftar aktif/FCC/kewajiban, tidak bisa diubah, tidak menerima alokasi, arsip ulang idempoten, jalur aktif tetap jalan, patch klien ke transaksi berarsip ditahan, perilaku sebelum migrasi tidak berubah.

## Keterbatasan
* Semua hasil dari sandbox: bukan Apps Script/Sheets sungguhan (kuota, waktu eksekusi, tipe sel, `getLastColumn()`, penguncian), tanpa data produksi, tanpa tampilan browser.
* Versi `DB_SCHEMA` yang ter-deploy belum bisa dipastikan sama dengan salinan repo; rencana skema diverifikasi terhadap header live yang dibaca, bukan terhadap kode yang ter-deploy.
* Gap bawaan yang tidak diubah: pada mode pusat, form akun menampilkan pilihan Status tetapi jalur simpan pusat tidak mengirimnya (menonaktifkan akun hanya efektif pada mode lokal). Itu alasan `07_AKUN.status` tidak ditambahkan; fitur nonaktif akun pusat memerlukan keputusan terpisah.
* Dokumen lokal lama dengan `fileRef` bukan data-URL (kasus yang tidak terlihat pada kode saat ini) akan ditahan dengan pesan migrasi yang menyesatkan karena kolom tidak ditambahkan; belum ada kasus nyata di kode.
* `LAPORAN_TARIF_KEWAJIBAN_2026-2027.md` terkunci oleh proses lain saat saya mencoba menyuntingnya; sebagai gantinya addendum ini adalah rujukan terbaru untuk bagian skema (butir `10_BUKTI.fileRef`/`07_AKUN.status` di laporan utama, bila ada, digantikan oleh tabel di atas).

## Langkah uji live pada SALINAN spreadsheet (belum dilakukan)
1. Buat salinan spreadsheet; deploy salinan skrip yang terikat ke salinan itu; backup JSON dari aplikasi.
2. `pdSchemaPlan`: pastikan 15 sheet butuh tambahan, `09_KOMITMEN` -> `rabId`, tidak ada `07_AKUN`/`10_BUKTI.fileRef`; bandingkan `liveColumns` dengan jumlah header (cek tidak ada data di luar lebar header).
3. `pdSchemaApply`: periksa header baru hanya di ujung; bandingkan seluruh sel lama (salin sebelum/sesudah); jalankan lagi -> "tidak ada yang perlu ditambah".
4. `pdTarifPlan` (dry-run) lalu terapkan; jalankan terapkan lagi -> tidak ada baris baru, tidak ada audit baru.
5. Buat anggaran pengeluaran (kategori+subkategori) dan komitmen terkait RAB lewat UI; cek `09_KOMITMEN.rabId`, `komitmenForRab`, dan baris Anggaran vs Aktual; tombol verifikasi FCC = "Cocok".
6. Buat pembayaran uji dengan alokasi, arsipkan transaksinya: tidak muncul di daftar aktif/Laporan/FCC, alokasi tidak terhitung; coba ubah status/alokasi baru pada transaksi arsip lewat sesi kedua: ditolak.
7. Verifikasi kewajiban klien vs server: 0 perbedaan; bandingkan posisi siswa dan saldo kas sebelum/sesudah migrasi skema.
8. Ukur waktu (guard alokasi, `opTarifApply`, snapshot) dan perhatikan batas eksekusi Apps Script.
