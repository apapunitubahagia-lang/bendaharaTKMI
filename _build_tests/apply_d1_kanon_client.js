// Langkah build P1_23 D-1 (klien; ikut terbawa ke ObligationEngine.gs lewat build_server_engines.js). Dijalankan SETELAH
// apply_d4_impor_lama_client.js dan SEBELUM build_server_engines.js. Paket terpisah agar mudah di-revert.
// Identitas kanonis kewajiban beku = kunci siswaId|komponenId|periode, id 'kw_' + hash(kunci) (algoritme sama dengan oblHash_ server):
//  - tagihanSnapshotRow_ (semua jalur pembekuan klien: freezeObligationsFor_, terbitkan tagihan, katering, klasifikasi, pindah TA)
//    tidak lagi memakai uid('tagihan') acak dan membawa komponenId;
//  - pencocokan kewajiban beku lewat komponenId (nama hanya untuk baris lama tanpa komponenId); bila ada >1 baris untuk kunci yang
//    sama (data historis), pilihan DETERMINISTIK (id kanonis dulu, lalu id terkecil), bukan urutan sheet;
//  - konversi baris 04 <-> objek klien membawa komponenId; komponen dicari dengan id lebih dulu.
// Tidak ada data historis yang diubah/digabung; baris lama ber-id acak tetap dibaca apa adanya (dilaporkan opKewajibanBekuAudit).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "function tagihanSnapshotRow_(ob, siswa){\n  return {id:uid('tagihan'), siswaId:ob.siswaId, komponen:ob.komponenNama,",
  "/* [P1_23 D-1] id kanonis kewajiban beku: 'kw_' + hash(siswaId|komponenId|periode); algoritme identik dengan oblHash_ (ObligationEngine.gs). */\n" +
  "function kwHash_(s){ let h = 2166136261, h2 = 5381; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0; } return h.toString(16) + h2.toString(16); }\n" +
  "function kwIdKanon_(siswaId, komponenId, periode){ return 'kw_' + kwHash_([siswaId, komponenId, periode].join('|')); }\n" +
  "function tagihanSnapshotRow_(ob, siswa){\n  return {id:kwIdKanon_(ob.siswaId, ob.komponenId, ob.periode), siswaId:ob.siswaId, komponenId:ob.komponenId, komponen:ob.komponenNama,", 'tagihanSnapshotRow_ kanonis', log);
L.rep(doc, "  const snap = Store.loadTagihan().find(t=>t.siswaId===siswa.id && t.komponen===komponen.nama && t.periode===periode);\n",
  "  // [P1_23 D-1] cocok lewat komponenId (nama hanya untuk baris lama tanpa komponenId); duplikat historis -> pilihan deterministik\n" +
  "  const snaps = Store.loadTagihan().filter(t=>t.siswaId===siswa.id && (t.komponenId ? t.komponenId===komponen.id : t.komponen===komponen.nama) && t.periode===periode);\n" +
  "  const snap = snaps.length > 1 ? snaps.slice().sort((a,b)=>((String(a.id||'').indexOf('kw_')===0 ? 0 : 1) - (String(b.id||'').indexOf('kw_')===0 ? 0 : 1)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))[0] : snaps[0];\n", 'kewajibanSatuBaris cocok komponenId', log);
L.rep(doc, "    const k = komps.find(c=>c.nama===t.komponen);\n    if(!k || seen.has(siswaId+'|'+k.id+'|'+t.periode)) return;",
  "    const k = t.komponenId ? komps.find(c=>c.id===t.komponenId) : komps.find(c=>c.nama===t.komponen); // [P1_23 D-1]\n    if(!k || seen.has(siswaId+'|'+k.id+'|'+t.periode)) return;", 'riwayat beku cocok komponenId', log);
L.rep(doc, "    return {id:ccStr_(r.id), siswaId:ccStr_(r.siswaId), komponen:k ? k.nama", "    return {id:ccStr_(r.id), siswaId:ccStr_(r.siswaId), komponenId:ccStr_(r.komponenId), komponen:k ? k.nama", 'ccFromRow_ komponenId', log);
L.rep(doc, "    const k = komponenByNama(o.komponen);\n", "    const k = o.komponenId ? komponenById(o.komponenId) : komponenByNama(o.komponen); // [P1_23 D-1]\n", 'ccToRow_ komponenId', log);
L.rep(doc, "if(existing.some(t=>t.siswaId===s.id && t.periode===periode && t.komponen===komponenNama)){ sudahAda++; return; }",
  "if(existing.some(t=>t.siswaId===s.id && t.periode===periode && (t.komponenId ? t.komponenId===komponen.id : t.komponen===komponenNama))){ sudahAda++; return; } // [P1_23 D-1]", 'terbitkan tagihan cek komponenId', log);
L.rep(doc, "Store.loadTagihan().some(t=>t.komponen===k.nama)", "Store.loadTagihan().some(t=>t.komponenId===k.id || (!t.komponenId && t.komponen===k.nama))", 'komponen dipakai', log);
L.save(doc);
fs.writeFileSync(OUT + '_d1_kanon_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d1_kanon_client OK: ' + log.length + ' perubahan');
