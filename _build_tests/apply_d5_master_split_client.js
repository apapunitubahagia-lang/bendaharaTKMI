// Langkah build P1_21 D-5 (klien). Dijalankan SETELAH apply_v1_migrasi_client.js. Paket terpisah agar mudah di-revert.
// centralLegacyMigrate dipisah menjadi tiga hal yang berbeda:
//  1. migrasi transaksi/koleksi operasional lama  -> centralLegacyMigrate (TIDAK lagi mengantrekan master maupun seed);
//  2. sinkronisasi master lokal                    -> centralMasterSyncPratinjau (baca-saja) + centralMasterSyncJalankan
//     (BENDAHARA, koleksi dipilih eksplisit, konfirmasi 'SINKRON_MASTER', alasan wajib, hasil per baris, audit);
//  3. seed bawaan aplikasi                          -> tidak pernah dikirim lewat jalur ini (status SEED_TIDAK_DIKIRIM).
// Data lokal tidak dihapus; id master tidak diubah; tidak ada operasi yang berjalan otomatis.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
const blok = fs.readFileSync(OUT + '_d5_master_sync.js', 'utf8').replace(/\r\n/g, '\n').trim();

// --- 1. centralLegacyMigrate: master tidak lagi diantrekan; hanya BENDAHARA ---
L.rep(doc, "function centralLegacyMigrate(opts){\n  opts = opts || {};\n",
  "function centralLegacyMigrate(opts){\n  opts = opts || {};\n" +
  "  if(centralReady_() && CentralAuth.role !== 'BENDAHARA') return {ok:false, code:'FORBIDDEN', message:'Hanya BENDAHARA yang dapat memigrasikan data lokal lama', scan:centralLegacyScan(), done:{rows:0, transaksi:0, alokasi:0, masters:0, dupDilewati:0}}; // [P1_21 D-5]\n",
  'migrate: guard peran', log);
L.rep(doc,
  "  if(CentralMasterData.ready){\n    const rawSet = lsGet(lsKey('settings'), {});\n    const mm = [['siswa', 'students', Store.loadSiswa()], ['komponen', 'components', rawSet.komponenBiayaList || []], ['tarif', 'tariffs', Store.loadTarif()], ['akun', 'accounts', rawSet.akunKasBankList || []],\n      ['kategoriPenerimaan', 'incomeCategories', Store.loadKategoriPenerimaanMaster()], ['kategoriPengeluaran', 'expenseCategories', Store.loadKategoriPengeluaranMaster()],\n      ['subkategori', 'subcategories', Store.loadSubkategoriMaster()], ['tahunAjaran', 'academicYears', Store.loadTahunAjaranMaster()]];\n    mm.forEach(function(x){\n      const srvIds = new Set((CentralMasterData[x[1]] || []).map(r=>String(r.id)));\n      (x[2] || []).forEach(function(r){ if(r && r.id && !srvIds.has(String(r.id))){ centralMasterQueue_(x[0], String(r.id), r); done.masters++; } });\n    });\n  }\n  auditTrailPush('MIGRASI_DATA_LOKAL_KE_PUSAT'",
  "  // [P1_21 D-5] master & seed TIDAK diantrekan di sini. Sinkronisasi master = operasi terpisah (centralMasterSyncJalankan).\n" +
  "  done.masterTidakDikirim = true;\n  auditTrailPush('MIGRASI_DATA_LOKAL_KE_PUSAT'",
  'migrate: blok master dihapus', log);

// --- 2./3. sinkronisasi master eksplisit + penanda seed ---
L.rep(doc, "function centralLegacyClean(){\n", blok + "\nfunction centralLegacyClean(){\n", 'blok sinkron master', log);

// --- tampilan ---
L.rep(doc, "<p>Baris lokal yang belum ada di server akan dikirim (ID sama, idempoten). Transaksi yang mirip transaksi di server dilewati. Salinan lokal <b>tidak dihapus</b>.</p>",
  "<p>Baris lokal yang belum ada di server akan dikirim (ID sama, idempoten). Transaksi yang mirip transaksi di server dilewati. Salinan lokal <b>tidak dihapus</b>.</p><p class=\"small-muted\">Data master (siswa, akun, kategori, tarif, dst.) dan data bawaan aplikasi <b>tidak</b> ikut dikirim. Gunakan &quot;Sinkronisasi master&hellip;&quot; secara terpisah.</p>",
  'modal migrasi: catatan master', log);
L.rep(doc, "<button class=\"btn primary\" onclick=\"pdLegacyMigrate()\">Migrasikan ke server…</button>",
  "<button class=\"btn primary\" onclick=\"pdLegacyMigrate()\">Migrasikan ke server…</button><button class=\"btn\" onclick=\"pdMasterSync()\">Sinkronisasi master…</button>",
  'tombol sinkron master', log);
L.save(doc);
fs.writeFileSync(OUT + '_d5_master_split_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_d5_master_split_client OK: ' + log.length + ' perubahan');
