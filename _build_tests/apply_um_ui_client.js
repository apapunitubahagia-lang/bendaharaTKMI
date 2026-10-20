// Langkah build P1_24 D-T1 (klien). Dijalankan SETELAH apply_lpj_bridge_client.js. Paket terpisah agar mudah di-revert.
// PROTOTIPE UI BACA-SAJA uang muka di Pusat Data: empat angka dipisah per uang muka + total, dari opUangMukaLaporan (server):
//   (1) arus kas keluar (transaksi pencairan aktif), (2) pengeluaran dilaporkan (nota LPJ diajukan/diterima/diverifikasi),
//   (3) pengeluaran terverifikasi, (4) saldo belum dipertanggungjawabkan; pengembalian ditampilkan terpisah (tertaut uang muka asal).
// DIBATALKAN ditampilkan bersama transaksi pencairannya (jejak tidak dihapus). Peringatan server (pencairan/pengembalian diarsip,
// nominal berbeda) ditampilkan apa adanya. Dampak FCC/BDS03 (opUangMukaDampakFcc) = audit before/after; simulasi TIDAK diterapkan.
// TIDAK ada tombol tulis: pencairan/pengembalian/pembatalan/verifikasi uang muka tidak diekspos (keputusan D-T1, GAP-005).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "function pdLpjSchema(){",
  "/* [P1_24 D-T1] prototipe UI uang muka BACA-SAJA (empat angka terpisah; tanpa aksi tulis) */\n" +
  "function umLaporanHtml_(d){\n" +
  "  const list = (d && d.uangMuka) || [], t = (d && d.total) || {};\n" +
  "  const sel = n => '<td style=\"text-align:right\">' + fmtRp(n) + '</td>';\n" +
  "  const head = '<tr><th>Kegiatan</th><th>Status</th><th>(1) Arus kas keluar</th><th>(2) Pengeluaran dilaporkan</th><th>(3) Pengeluaran terverifikasi</th><th>(4) Saldo belum dipertanggungjawabkan</th><th>Pengembalian</th><th>Catatan</th></tr>';\n" +
  "  const body = list.map(x => '<tr data-um=\"' + esc(x.id) + '\"><td>' + esc(x.kegiatan) + '<div class=\"small-muted\">' + esc(x.id) + ' &middot; pencairan ' + esc(x.transaksiCairId || '-') + '</div></td><td>' + esc(x.status) +\n" +
  "    (x.status === 'DIBATALKAN' ? '<div class=\"small-muted\">pencairan tetap tercatat; saldo diselesaikan lewat pengembalian</div>' : '') + '</td>' +\n" +
  "    sel(x.arusKasKeluar) + sel(x.pengeluaranAktualDilaporkan) + sel(x.pengeluaranTerverifikasi) + sel(x.saldoBelumDipertanggungjawabkan) + sel(x.pengembalian) +\n" +
  "    '<td>' + ((x.peringatan || []).length ? '<b>Periksa:</b> ' + esc(x.peringatan.join(', ')) : '') + '</td></tr>').join('');\n" +
  "  const foot = '<tr><th colspan=\"2\">Total</th>' + sel(t.arusKasKeluar) + sel(t.pengeluaranAktualDilaporkan) + sel(t.pengeluaranTerverifikasi) + sel(t.saldoBelumDipertanggungjawabkan) + sel(t.pengembalian) + '<td></td></tr>';\n" +
  "  return '<h3>Uang Muka (baca-saja)</h3><p class=\"small-muted\">Empat angka dipisah: arus kas keluar &ne; pengeluaran. Nota LPJ tidak menjadi transaksi kas kedua; pengembalian adalah penerimaan bertanda uang muka asal (bukan penerimaan operasional). Verifikasi LPJ belum aktif.</p>' +\n" +
  "    (list.length ? '<table class=\"table\">' + head + body + foot + '</table>' : '<p>Belum ada uang muka.</p>');\n}\n" +
  "function umDampakHtml_(d){\n" +
  "  const s = d.sekarang || {}, m = d.simulasiBasisBeban || {}, k = d.komponen || {};\n" +
  "  const r = (lbl, a, b) => '<tr><td>' + lbl + '</td><td style=\"text-align:right\">' + fmtRp(a) + '</td><td style=\"text-align:right\">' + fmtRp(b) + '</td></tr>';\n" +
  "  return '<h4>Dampak FCC/BDS03 ' + esc(d.periode) + ' (audit)</h4><table class=\"table\"><tr><th></th><th>Sekarang (formula aktif)</th><th>Simulasi basis beban (TIDAK diterapkan)</th></tr>' +\n" +
  "    r('Pengeluaran aktual', s.pengeluaranAktual, m.pengeluaranAktual) + r('Penerimaan', s.penerimaan, m.penerimaan) + r('Posisi kas', s.posisiKas, m.posisiKas) + '</table>' +\n" +
  "    '<p class=\"small-muted\">Pencairan periode ' + fmtRp(k.pencairanPeriode) + ' &middot; pengembalian ' + fmtRp(k.pengembalianPeriode) + ' &middot; nota terverifikasi ' + fmtRp(k.notaTerverifikasiPeriode) + ' &middot; transaksi pencairan dalam populasi BDS03: ' + esc(k.transaksiPencairanDalamPopulasiBds03) + '. FCC, BDS03, dan 31 KPI tidak diubah.</p>';\n}\n" +
  "function umOpsTersedia_(){ return typeof ServerBridge !== 'undefined' && ServerBridge && !!ServerBridge.opUangMukaLaporan && centralReady_(); }\n" +
  "function umGagal_(res){ toast(res && res.code === 'SCHEMA_ADDITIVE_REQUIRED' ? 'Skema uang muka belum disiapkan (Pusat Data > Skema uang muka & LPJ)' : centralErrText(res)); return res; }\n" +
  "function pdUangMuka(){ if(!umOpsTersedia_()){ toast('Server belum siap'); return Promise.resolve(null); }\n" +
  "  return ServerBridge.opUangMukaLaporan({}).then(function(res){ if(!res || !res.ok) return umGagal_(res);\n" +
  "    openModal(umLaporanHtml_(res.data) + '<div id=\"umDampakOut\"></div>' + fieldText('pdum_per','Periode untuk audit dampak FCC (mis. September 2026)','') +\n" +
  "      '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Tutup</button><button class=\"btn\" onclick=\"pdUangMukaDampak()\">Audit dampak FCC/BDS03</button></div>', true); return res; }); }\n" +
  "function pdUangMukaDampak(){ if(!umOpsTersedia_()){ toast('Server belum siap'); return Promise.resolve(null); }\n" +
  "  return ServerBridge.opUangMukaDampakFcc({periode: val('pdum_per')}).then(function(res){ if(!res || !res.ok) return umGagal_(res);\n" +
  "    const el = document.getElementById('umDampakOut'); if(el) el.innerHTML = umDampakHtml_(res.data); return res; }); }\n" +
  "function pdLpjSchema(){", 'UI uang muka baca-saja', log);
L.rep(doc, "<button class=\"btn\" onclick=\"pdLpjSchema()\">Skema uang muka &amp; LPJ…</button>",
  "<button class=\"btn\" onclick=\"pdLpjSchema()\">Skema uang muka &amp; LPJ…</button><button class=\"btn\" onclick=\"pdUangMuka()\">Uang muka (baca-saja)…</button>", 'tombol uang muka Pusat Data', log);
L.save(doc);
fs.writeFileSync(OUT + '_um_ui_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_um_ui_client OK: ' + log.length + ' perubahan');
