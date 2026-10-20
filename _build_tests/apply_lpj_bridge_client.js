// Langkah build P1_23 D-LPJ (klien). Dijalankan SETELAH apply_d1_kanon_client.js. Paket terpisah agar mudah di-revert.
// Tombol "Buat Transaksi dari LPJ" dialihkan ke operasi server atomik opCreateExpenseFromLpj (ServerBridge):
//  - satu panggilan server membuat transaksi + tautan + riwayat 34 dalam satu kunci; clientRequestId transaksi = 'lpj:<lpjId>'
//    (klik ganda / retry / respons hilang = replay, tidak ada transaksi kedua); akun/kategori/tanggal/nominal/unit/periode divalidasi
//    server; TIDAK memakai heuristik 62 hari (penolakan LPJ uang muka & tautan ganda ditentukan server, bukan kemiripan);
//  - bila server menjawab SCHEMA_ADDITIVE_REQUIRED (skema tautan belum disiapkan), jalur lama P0-T1 dipakai (satu-satunya yang
//    berfungsi sebelum setup); setelah setup server menolak tautan lewat opRecordBatch('lpj') publik (GUNAKAN_OPERASI_TAUTAN),
//    sehingga hanya SATU jalur yang efektif;
//  - aksi baru: tautkan LPJ ke transaksi yang ada (opLinkLpj) & lepas tautan beralasan (opUnlinkLpj); setup skema di Pusat Data.
// Verifikasi LPJ TIDAK diekspos (GAP-005).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "function createTransaksiFromLpj(lpjId){\n  if(__lpjTrxBusy_[lpjId]){ toast('Permintaan untuk LPJ ini sedang diproses'); return; }\n",
  "/* [P1_23 D-LPJ] jalur server atomik; jalur lama (createTransaksiFromLpjLama_) hanya bila skema tautan belum disiapkan. */\n" +
  "function lpjOpsTersedia_(){ return typeof ServerBridge !== 'undefined' && ServerBridge && !!ServerBridge.opCreateExpenseFromLpj && centralReady_(); }\n" +
  "function lpjSesudahOp_(res, okMsg){\n  if(res && res.ok){ closeModal(); toast(okMsg + (res.data && res.data.replay ? ' (sudah diproses sebelumnya)' : '')); return loadOperationalData().then(function(){ renderContent(); return res; }); }\n" +
  "  toast('GAGAL: ' + centralErrText(res) + (res && /SERVER_ERROR|LOCK_TIMEOUT/.test(res.code || '') ? ' - aman diulang (idempoten)' : '')); return Promise.resolve(res);\n}\n" +
  "/* skema tautan siap = header 19_LPJ (sudah dimuat) memuat kolom hasil opUangMukaLpjSetup; keputusan jalur sinkron, tanpa panggilan server */\n" +
  "function lpjSkemaTautanSiap_(){ const st = ccState_('lpj'); const h = (st && st.headers) || []; return h.indexOf('statusLpj') !== -1 && h.indexOf('uangMukaId') !== -1; }\n" +
  "function createTransaksiFromLpj(lpjId){\n  if(!lpjOpsTersedia_() || !lpjSkemaTautanSiap_()) return createTransaksiFromLpjLama_(lpjId, true); // sebelum setup: jalur lama apa adanya\n" +
  "  if(__lpjTrxBusy_[lpjId]){ toast('Permintaan untuk LPJ ini sedang diproses'); return Promise.resolve({ok:false, code:'SEDANG_DIPROSES'}); }\n" +
  "  const unit = val('ltu_unit'), akunId = val('ltu_akun'), kategori = val('ltu_kategori');\n" +
  "  if(!unit || !akunId || !kategori){ toast('Unit, akun sumber, dan kategori wajib dipilih'); return Promise.resolve({ok:false, code:'VALIDATION_ERROR'}); } // UX saja; otoritas validasi di server\n" +
  "  __lpjTrxBusy_[lpjId] = true;\n" +
  "  return ServerBridge.opCreateExpenseFromLpj({lpjId:lpjId, akunId:akunId, unit:unit, kategori:kategori}).then(function(res){\n" +
  "    if(res && res.code === 'SCHEMA_ADDITIVE_REQUIRED'){ delete __lpjTrxBusy_[lpjId]; return createTransaksiFromLpjLama_(lpjId, true); }\n" +
  "    auditTrailPush('LPJ_JADI_TRANSAKSI', null, {lpjId:lpjId, hasil:res && (res.ok ? (res.data.replay ? 'REPLAY' : 'OK') : res.code), transaksiId:res && res.ok ? res.data.transaksiId : ''}, 'server-op');\n" +
  "    return lpjSesudahOp_(res, 'Transaksi Pengeluaran dibuat dari LPJ (server, atomik)');\n" +
  "  }, function(e){ toast('Gangguan jaringan: ' + (e && e.message || e) + ' - aman diulang (idempoten)'); return {ok:false, code:'NETWORK_ERROR'}; }).then(function(r){ delete __lpjTrxBusy_[lpjId]; return r; });\n}\n" +
  "function createTransaksiFromLpjLama_(lpjId, dariFallback){\n  if(!dariFallback){ toast('Jalur lama hanya dipakai otomatis bila skema tautan LPJ belum disiapkan'); return {ok:false, code:'JALUR_LAMA_HANYA_FALLBACK'}; } /* [P1_23 D-LPJ] tidak dapat dipanggil langsung */\n  if(__lpjTrxBusy_[lpjId]){ toast('Permintaan untuk LPJ ini sedang diproses'); return; }\n", 'createTransaksiFromLpj server', log);
L.rep(doc, "function lpjDuplicateCandidates_(l, unit){\n",
  "/* [P1_23 D-LPJ] tautkan ke transaksi yang ada / lepas tautan (alasan wajib) lewat operasi server. */\n" +
  "function openLinkLpj(lpjId){\n  const l = Store.loadLpj().find(x=>x.id===lpjId); if(!l){ toast('LPJ tidak ditemukan'); return; }\n" +
  "  const opts = [{value:'', label:'- Pilih Transaksi Pengeluaran -'}].concat(pengeluaranList().map(t=>({value:t.id, label:fmtDate(t.tanggal)+' '+fmtRp(t.nominal)+' '+(t.penerima||t.kategori||'')})));\n" +
  "  openModal('<h3>Tautkan LPJ ke Transaksi</h3>' + fieldSelect('lpl_trx','Transaksi (wajib)', opts, '') + fieldText('lpl_alasan','Alasan bila unit/periode berbeda','') +\n" +
  "    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Batal</button><button class=\"btn primary\" onclick=\"linkLpj(\\''+lpjId+'\\')\">Tautkan</button></div>', false);\n}\n" +
  "function linkLpj(lpjId){ if(!lpjOpsTersedia_()){ toast('Server belum siap'); return Promise.resolve({ok:false}); } return ServerBridge.opLinkLpj({lpjId:lpjId, transaksiId:val('lpl_trx'), alasanPerbedaan:val('lpl_alasan'), expect:{transaksiId:''}}).then(r=>lpjSesudahOp_(r, 'LPJ ditautkan')); }\n" +
  "function openUnlinkLpj(lpjId){\n  openModal('<h3>Lepas Tautan LPJ</h3><p class=\"small-muted\">Transaksi TIDAK dihapus; riwayat tautan disimpan.</p>' + fieldText('lpu_alasan','Alasan (wajib, min. 10 karakter)','') +\n" +
  "    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Batal</button><button class=\"btn danger\" onclick=\"unlinkLpj(\\''+lpjId+'\\')\">Lepas Tautan</button></div>', false);\n}\n" +
  "function unlinkLpj(lpjId){ const l = Store.loadLpj().find(x=>x.id===lpjId); if(!lpjOpsTersedia_()){ toast('Server belum siap'); return Promise.resolve({ok:false}); } return ServerBridge.opUnlinkLpj({lpjId:lpjId, alasan:val('lpu_alasan'), expect:{transaksiId:l ? (l.transaksiId || '') : ''}}).then(r=>lpjSesudahOp_(r, 'Tautan LPJ dilepas (transaksi tetap ada)')); }\n" +
  "function pdLpjSchema(){ if(!lpjOpsTersedia_()){ toast('Server belum siap'); return Promise.resolve(null); } return ServerBridge.opUangMukaLpjPlan().then(function(res){ if(!res || !res.ok){ toast(centralErrText(res)); return res; }\n" +
  "  openModal('<h3>Skema Uang Muka & LPJ</h3><pre class=\"small-muted\">' + esc(JSON.stringify(res.data.plan.map(x=>({sheet:x.sheet, status:x.status, tambah:x.tambah})), null, 1)) + '</pre>' + fieldText('pdum_konf','Ketik ' + res.data.konfirmasi,'') +\n" +
  "    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Batal</button><button class=\"btn primary\" onclick=\"pdLpjSchemaConfirmed()\">Buat skema</button></div>', false); return res; }); }\n" +
  "function pdLpjSchemaConfirmed(){ return ServerBridge.opUangMukaLpjSetup(val('pdum_konf')).then(function(res){ toast(res && res.ok ? res.message : centralErrText(res)); if(res && res.ok) closeModal(); return loadOperationalData().then(function(){ return res; }); }); }\n" +
  "function lpjDuplicateCandidates_(l, unit){\n", 'link/unlink/setup', log);
L.rep(doc, "(l.transaksiId?'':' <a class=\"link\" onclick=\"openCreateTransaksiFromLpjUnitModal(\\''+l.id+'\\')\">Buat ",
  "(l.transaksiId?' <a class=\"link\" onclick=\"openUnlinkLpj(\\''+l.id+'\\')\">Lepas tautan</a>':' <a class=\"link\" onclick=\"openLinkLpj(\\''+l.id+'\\')\">Tautkan</a> <a class=\"link\" onclick=\"openCreateTransaksiFromLpjUnitModal(\\''+l.id+'\\')\">Buat ", 'tombol tautkan/lepas', log);
L.rep(doc, "<button class=\"btn\" onclick=\"openV1MigrasiPusat()\">Migrasi data V1…</button>",
  "<button class=\"btn\" onclick=\"openV1MigrasiPusat()\">Migrasi data V1…</button><button class=\"btn\" onclick=\"pdLpjSchema()\">Skema uang muka &amp; LPJ…</button>", 'tombol skema Pusat Data', log);
L.save(doc);
fs.writeFileSync(OUT + '_lpj_bridge_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_lpj_bridge_client OK: ' + log.length + ' perubahan');
