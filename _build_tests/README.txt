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
