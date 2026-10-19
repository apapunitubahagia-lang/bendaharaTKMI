// Langkah build P1_21 D-3 (klien). Dijalankan SETELAH apply_d5_master_split_client.js. Paket terpisah agar mudah di-revert.
// Migrasi V1 pada mode pusat:
//  - init(): migrateV1ToV2() TIDAK dijalankan saat aplikasi dibuka pada mode pusat (hanya penanda State.v1Tertunda, tanpa tulis);
//  - migrasi eksplisit: v1MigrasiPusatPratinjau (baca-saja) + v1MigrasiPusatJalankan (BENDAHARA, konfirmasi MIGRASI_V1_PUSAT,
//    hasil per baris, audit MIGRASI_V1_PUSAT). Transaksi ditahap ke lokal TANPA akun/kategori fallback, tidak ditandai antre;
//  - pemetaan eksplisit: akun+unit (v1PetakanAkun, P1_20) dan kategori pengeluaran (v1PetakanKategori), hanya BENDAHARA;
//  - pengecualian tambahan: kategori kosong / 'Lainnya' hasil fallback boot lama / tidak ada di master server; alokasi V1
//    tidak lengkap (siswa/komponen/periode), siswa tidak ada di server, alokasi melebihi nominal; tanggal/nominal tidak valid.
// Data V1 tidak diubah/dihapus; data lokal tidak ditimpa; tidak ada migrasi yang berjalan otomatis.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
const blok = fs.readFileSync(OUT + '_d3_v1_pusat.js', 'utf8').replace(/\r\n/g, '\n').trim();

// --- boot ---
L.rep(doc, "function init(){\n  const migReport = migrateV1ToV2();\n  if(migReport) console.log('Migrasi V1->V2 selesai:', migReport);\n",
  "function init(){\n  if(typeof ServerBridge !== 'undefined' && ServerBridge){ State.v1Tertunda = v1DataPresent() && !lsGet(lsKey('migratedFromV1'), false); } // [P1_21 D-3] mode pusat: tidak ada migrasi V1 otomatis saat dibuka\n" +
  "  else { const migReport = migrateV1ToV2(); if(migReport) console.log('Migrasi V1->V2 selesai:', migReport); }\n", 'init tanpa migrasi pusat', log);

// --- pengecualian kategori & alokasi ---
L.rep(doc, "  if(CentralMasterData.ready && !MasterAPI.accounts().some(a=>a.id===t.akunId && (a.jenis==='Kas' || a.jenis==='Bank'))) return 'AKUN_TIDAK_ADA_DI_SERVER';\n  return '';\n}",
  "  if(CentralMasterData.ready && !MasterAPI.accounts().some(a=>a.id===t.akunId && (a.jenis==='Kas' || a.jenis==='Bank'))) return 'AKUN_TIDAK_ADA_DI_SERVER';\n" +
  "  if(t._migratedFromV1){ const k = v1KategoriPengecualian_(t) || v1AlokasiPengecualian_(t); if(k) return k; } // [P1_21 D-3]\n  return '';\n}", 'v1Pengecualian_ kategori/alokasi', log);

// --- penjaga kirim: semua alasan pengecualian V1, bukan hanya akun ---
const lama = "if(t._migratedFromV1 && !t._akunPemetaan){ centralMarkError_('trx', t.id, {ok:false, code:'PEMETAAN_AKUN_V1_DIPERLUKAN', message:'Transaksi hasil migrasi V1 belum dipetakan ke akun secara eksplisit - tidak dikirim ke server'});";
const baru = "if(t._migratedFromV1 && v1Pengecualian_(t)){ centralMarkError_('trx', t.id, {ok:false, code:v1Pengecualian_(t), message:'Transaksi hasil migrasi V1 belum dipetakan/lengkap secara eksplisit - tidak dikirim ke server'}); /* [P1_21 D-3] */";
L.rep(doc, "  " + lama + " return Promise.resolve(false); } // [P1_20 B]", "  " + baru + " return Promise.resolve(false); } // [P1_20 B]", 'push guard umum', log);
L.rep(doc, "list = list.filter(t=>{ " + lama + " return false; } return true; });", "list = list.filter(t=>{ " + baru + " return false; } return true; });", 'batch guard umum', log);

// --- pemetaan akun hanya BENDAHARA ---
L.rep(doc, "function v1PetakanAkun(ids, akunId, alasan, unit){\n", "function v1PetakanAkun(ids, akunId, alasan, unit){\n  if(!v1PeranBoleh_()) return {ok:false, code:'FORBIDDEN', message:'Hanya BENDAHARA'}; // [P1_21 D-3]\n", 'v1PetakanAkun peran', log);

// --- fungsi baru + tampilan ---
L.rep(doc, "function pdLegacyScan(){", blok + "\nfunction pdLegacyScan(){", 'blok migrasi V1 pusat', log);
L.rep(doc, "<button class=\"btn\" onclick=\"pdMasterSync()\">Sinkronisasi master…</button>",
  "<button class=\"btn\" onclick=\"pdMasterSync()\">Sinkronisasi master…</button><button class=\"btn\" onclick=\"openV1MigrasiPusat()\">Migrasi data V1…</button>", 'tombol migrasi V1', log);
L.rep(doc, "<button class=\"btn sm\" onclick=\"openV1PemetaanAkun()\">Petakan akun transaksi V1&hellip;</button>';",
  "<button class=\"btn sm\" onclick=\"openV1PemetaanAkun()\">Petakan akun transaksi V1&hellip;</button> <button class=\"btn sm\" onclick=\"openV1PemetaanKategori()\">Petakan kategori V1&hellip;</button>';", 'tombol pemetaan kategori', log);
L.save(doc);
fs.writeFileSync(OUT + '_d3_v1_pusat_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d3_v1_pusat_client OK: ' + log.length + ' perubahan');
