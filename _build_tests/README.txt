BUILD DAN TES - Bendahara_V2 (sentralisasi + tarif 2026/2027)

Bendahara_V2.html, ObligationEngine.gs, FinanceEngine.gs, TarifPlan.gs, TransactionEngine.gs (patch aditif),
MasterDataRead.gs (patch aditif) dan ServerBridge.* DIHASILKAN. Jangan diedit tangan; ubah file sumber lalu bangun ulang.

Sumber blok (folder induk): _central_block.js, _central_block2.js, _fcc_pure.js, _fcc_budget.js, _tarif_pure.js,
_tarif_client.js, _obl_new.js, _tarif_ops.gs.tpl

Urutan bangun (dari folder ini, Node.js):
  node apply_central.js          # before_central.html -> Bendahara_V2.html (73 edit)
  node apply_tarif.js            # tahap 2: tarif/kewajiban/anggaran (24 edit); WAJIB setelah apply_central.js
  node build_server_engines.js   # ObligationEngine.gs, FinanceEngine.gs, TarifPlan.gs, patch TransactionEngine/MasterDataRead
  node build_bridge.js           # ServerBridge.js / ServerBridge.html

Tes (sandbox lokal; TIDAK menyentuh Google Sheets):
  node server_pass2.js           # server, 58 tes
  node e2e_central2.js           # UI -> server, regresi sentralisasi, 80 tes
  node tarif_server_tests.js     # tarif, kewajiban, alokasi, invarian acak, 48 tes
  node tarif_client_tests.js     # UI tarif/katering/klasifikasi/anggaran/mode lokal, 40 tes

Catatan: jalur sumber repo (GAS_Migration, AUTH_CENTRAL_BUILD) di srv_env.js bersifat absolut (mesin ini).
live_seed.js berisi komponen/tarif yang dibaca READ-ONLY dari spreadsheet produksi pada 2026-10-14.

Tambahan (2026-10-14):
  node edit_gen_archive.js       # SUDAH diterapkan ke build_server_engines.js (idempoten; jangan perlu dijalankan lagi)
  node schema_archive_tests.js   # skema aditif, rabId, transaksi arsip, penerapan ulang, 27 tes
Hasil terakhir: server_pass2 58, e2e_central2 80, tarif_server_tests 52, tarif_client_tests 40, schema_archive_tests 27 (semua PASS, sandbox).

Tambahan P1-RAB (2026-10-19; keputusan K-RAB-01..06, 08; paket terpisah dari P1-POLICY):
  Sumber tunggal pencocokan RAB: ../_rab_match.js (disuntikkan ke Bendahara_V2.html oleh apply_p1_rab_client.js dan
  ke FinanceEngine.gs oleh apply_p1_rab_server.js). Berkas server tulisan tangan baru: ../RabAllocation.gs.
  Urutan lengkap ada di build_all.js (node build_all.js).
  node rab_tests.js              # pencocokan, FCC, RecordGuard, setup/uji kering/impor, diferensial BDS03, 35 tes + 2 INFO (RAB-29..37: Keputusan 2, karakterisasi lintas periode, LPJ bulan berikutnya)
  node audit_p1_tests.js        # simulasi audit P1_13 (T1, T4, lintas bulan, K-RAB-07, sheet 30); PASS = kontrol berlaku, INFO = temuan
  node p0_hardening_tests.js    # P0 hardening T8/T4/T7/T1 + regresi (P1_14)
  node readiness_tests.js       # kesiapan live: harness _live_tests/LiveReadiness.gs di sandbox, GAP-005, aturan 62 hari, tanggal (P1_15)
  node import_audit_tests.js    # karakterisasi wizard impor yang ada (P1_16 §1.3); INFO = temuan
  node run_all_tests.js <prefix> # seluruh suite -> ../_test_logs/<prefix>_*.log (jangan pakai prefix 'final')

Tambahan P1-IMP (2026-10-19; D-IMP-1..8, D-T4b F7/F8; laporan P1_17):
  Sumber tunggal aturan impor: ../_import_rules.js (-> ImportRules.gs oleh build_import_rules.js; disuntikkan ke HTML oleh
  apply_import_client.js bersama ../_import_client.js). Berkas server tulisan tangan baru: ../ImportEngine.gs,
  ../PeriodeAktifAdmin.gs, ../SiswaMasterAudit.gs. ImportRules.gs DIHASILKAN - jangan diedit tangan.
  node t4b_tests.js             # F8 gerbang periodeAktif + normalisasi eksplisit, F7 kolom siswa, KPI-DIFF terhadap 25d258b (git)
  node import_engine_tests.js   # mesin impor server: skala 10/50/100/500 x 5 modul, idempotensi, putus koneksi, konflik, rekonsiliasi
  node import_client_tests.js   # wizard Impor V2: isi tabel, tempel, CSV, XLSX (stored & deflate), lanjut setelah putus
  Hasil terakhir: node run_all_tests.js p1impA -> 15 suite, 513 PASS, 0 FAIL, 42 INFO (sandbox; BELUM uji live).

Tambahan P1_18 (2026-10-19; Keputusan 1, Prioritas A-C): apply_imp_lock_server.js (withLock_ reentran), apply_kewajiban_guard_server.js,
  apply_kewajiban_guard_client.js, apply_akun_explicit_client.js; berkas baru ../KewajibanGuard.gs.
  node concurrency_tests.js     # dua pengguna / balapan commit impor (kunci eksklusif antar-eksekusi disimulasikan)
  node akun_explicit_tests.js   # akun Kas/Bank wajib eksplisit di jalur lama yang masih aktif + server
  Hasil terakhir: node run_all_tests.js p1impB -> 17 suite, 533 PASS, 0 FAIL, 42 INFO (sandbox; uji live BLOCKED).

Tambahan P1_19 (2026-10-19): apply_alloc_lock_server.js, apply_akun_strict_server.js, apply_akun_strict_client.js,
  apply_kewajiban_guard2_client.js.
  node tx_integrity_tests.js    # konkurensi & integritas jalur transaksi biasa (10 skenario wajib + audit/periode + jejak kunci)
  node gap005_tests.js          # matriks peran semua fungsi publik, folder bukti uji (Script Property), inventaris deploy
  Hasil terakhir: node run_all_tests.js p1_19 -> 19 suite, 555 PASS, 0 FAIL, 44 INFO (sandbox; uji live BLOCKED).

Tambahan P1_20 (2026-10-19): apply_v1_migrasi_client.js, apply_alloc_siswa_server.js, apply_kategori_server.js;
  berkas baru ../KategoriPengeluaranAudit.gs (audit baca-saja kategori historis).
  node v1_migrasi_tests.js      # migrasi V1: pengecualian akun, penjaga kirim, pemetaan beraudit, id deterministik, retry
  node alloc_siswa_tests.js     # alokasi lintas siswa / ke pengeluaran ditolak server; arsip alokasi beraudit
  node kategori_tests.js        # kategori pengeluaran wajib & valid terhadap master aktif (create, batch, koreksi, audit)
  node snapshot_tarif_tests.js  # karakterisasi perubahan tarif & snapshot kewajiban (INFO; tanpa perubahan kebijakan)
  node legacy_import_tests.js   # jalur impor lama 5 modul V2: UI dialihkan, resolver ditolak, server tetap memvalidasi
  Hasil terakhir: node run_all_tests.js p1_20 -> 24 suite, 587 PASS, 0 FAIL, 50 INFO (sandbox; uji live BLOCKED).

Tambahan P1_24 (2026-10-20): apply_um_ui_client.js (UI uang muka BACA-SAJA; setelah apply_lpj_bridge_client.js);
  _live_tests/LiveReadiness.gs + ltIdentitasProbe/ltKewajibanBekuAudit/ltLpjSetupPreview/ltLpjSetupApply/ltLpjRollbackCek (khusus salinan uji).
  node d1_audit_klasifikasi_tests.js # D-1: DUPLIKAT_PASTI vs PERLU_KEPUTUSAN_MANUAL + hubungan alokasi (baca-saja)
  node lpj_setup_live_tests.js       # harness salinan + setup LPJ terjaga + lepas tautan lalu buat ulang
  node um_ui_tests.js                # UI uang muka baca-saja: empat angka, peringatan arsip, dampak FCC (audit)
  Hasil terakhir: node run_all_tests.js p1_24 -> 42 suite, 734 PASS, 0 FAIL, 65 INFO (sandbox; uji live BLOCKED).
