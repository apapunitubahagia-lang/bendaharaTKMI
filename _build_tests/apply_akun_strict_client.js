// Langkah build P1_19 C (klien). Dijalankan SETELAH apply_akun_explicit_client.js. Paket terpisah agar mudah di-revert.
// Menutup fallback diam-diam yang masih dapat dipanggil (fungsi global, walau tombolnya sudah dialihkan ke Impor V2):
//   - commitPenerimaanRow / commitPengeluaranRow (wizard impor lama): akun WAJIB cocok persis dengan akun Kas/Bank master;
//     kategori pengeluaran WAJIB terisi & dikenal (dulu akunKasBankList[0] / kategoriPengeluaranList[0]);
//   - form Pengeluaran: kategori tidak lagi terpilih otomatis (opsi kosong wajib).
// Migrasi V1->V2 (migrateV1ToV2) TIDAK diubah (migrasi historis; lihat P1_19 §3).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, "    akunId:(s.akunKasBankList.find(a=>a.nama===get('akun'))||s.akunKasBankList[0]).id, unit:res.unit, nominal:res.nominal, metode:get('metode')||(numFromStr(get('transfer'))>0?'Transfer Bank':'Tunai'),",
  "    akunId:impLamaAkun_(get), unit:res.unit, nominal:res.nominal, metode:get('metode')||(numFromStr(get('transfer'))>0?'Transfer Bank':'Tunai'), // [P1_19 C] tanpa akun pertama",
  'commitPenerimaanRow akun', log);
L.rep(doc, "  const t = postTransaksi({jenis:'PENGELUARAN', tanggal:res.tanggal, kategori:get('kategori')||s.kategoriPengeluaranList[0], penerima:get('penerima')||get('uraian')||'-',\n    akunId:(s.akunKasBankList.find(a=>a.nama===get('akun'))||s.akunKasBankList[0]).id,",
  "  const t = postTransaksi({jenis:'PENGELUARAN', tanggal:res.tanggal, kategori:impLamaKategori_(get), penerima:get('penerima')||get('uraian')||'-', // [P1_19 C] tanpa kategori/akun pertama\n    akunId:impLamaAkun_(get),",
  'commitPengeluaranRow akun & kategori', log);
L.rep(doc, "function commitPengeluaranRow(get, extra, res){",
  "/* [P1_19 C] Wizard impor lama: akun & kategori harus disebut eksplisit di berkas dan cocok dengan master; tidak ada pengganti. */\n" +
  "function impLamaAkun_(get){ const n = String(get('akun')||'').trim().toLowerCase(); const a = n ? akunList().filter(x=>(x.jenis==='Kas'||x.jenis==='Bank') && (String(x.nama).toLowerCase()===n || String(x.id).toLowerCase()===n)) : []; if(a.length!==1) throw new Error('Akun Kas/Bank wajib disebut eksplisit dan cocok dengan master (tidak ada akun bawaan): \"' + (get('akun')||'') + '\"'); return a[0].id; }\n" +
  "function impLamaKategori_(get){ const n = String(get('kategori')||'').trim(); const k = kategoriPengeluaranNames().find(x=>x.toLowerCase()===n.toLowerCase()); if(!k) throw new Error('Kategori pengeluaran wajib disebut eksplisit dan dikenal (tidak ada kategori bawaan): \"' + n + '\"'); return k; }\n" +
  "function commitPengeluaranRow(get, extra, res){", 'helper impLama*', log);
L.rep(doc, "  const kategori = document.getElementById('gf_kategori') ? val('gf_kategori') : kategoriPengeluaranNames()[0];",
  "  const kategori = document.getElementById('gf_kategori') ? val('gf_kategori') : ''; // [P1_19 C] tanpa kategori bawaan", 'gf_kategori awal', log);
L.rep(doc, "fieldSelect('gf_kategori','Kategori', kategoriPengeluaranNames(), kategori)",
  "fieldSelect('gf_kategori','Kategori', [{value:'',label:'- Pilih Kategori (wajib) -'}].concat(kategoriPengeluaranNames().map(k=>({value:k,label:k}))), kategori)", 'gf_kategori opsi', log);
L.rep(doc, "  if(!akunList().some(a=>a.id===val('gf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]",
  "  if(!akunList().some(a=>a.id===val('gf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n  if(kategoriPengeluaranNames().indexOf(val('gf_kategori')) === -1){ toast('Kategori pengeluaran wajib dipilih (tidak ada kategori bawaan)'); return; } // [P1_19 C]", 'submitPengeluaran kategori', log);
L.save(doc);
fs.writeFileSync(OUT + '_akun_strict_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_akun_strict_client OK: ' + log.length + ' perubahan');
