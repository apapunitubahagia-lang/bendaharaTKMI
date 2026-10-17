const fs = require('fs');
const OUTDIR = require('./paths').OUT;
const SC = __dirname + '/';
const SRC = OUTDIR + 'Bendahara_V2.html';
if (!fs.existsSync(SC + 'before_central.html')) fs.copyFileSync(SRC, SC + 'before_central.html'); // backup pass sebelumnya
let t = fs.readFileSync(SC + 'before_central.html', 'utf8').replace(/\r\n/g, '\n');
const log = [];
function rep(from, to, label) {
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error('ASSERT: "' + label + '" ditemukan ' + n + 'x untuk: ' + from.slice(0, 90));
  t = t.replace(from, () => to); log.push(label);
}
function fnRange(name) {
  const re = new RegExp('^function ' + name + '\\(', 'm'); const m = re.exec(t);
  if (!m) throw new Error('fungsi tidak ada: ' + name);
  const start = m.index; const endM = /\n}\n/.exec(t.slice(start)); // fungsi top-level berakhir '}' di kolom 0
  return { start, end: start + endM.index + 3 };
}
function replFn(name, code, label) { const r = fnRange(name); t = t.slice(0, r.start) + code.replace(/^\n/, '') + '\n' + t.slice(r.end); log.push(label || ('replace fn ' + name)); }
function insAfterFn(name, code, label) {
  const r = fnRange(name); const nl = t.indexOf('\n', r.start); t = t.slice(0, nl + 1) + code + '\n' + t.slice(nl + 1); log.push(label || ('guard/central ' + name));
}

// ---- 1. blok sentral ----
const block = fs.readFileSync(OUTDIR + '_central_block.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
const fccPure = fs.readFileSync(OUTDIR + '_fcc_pure.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
const block2 = fs.readFileSync(OUTDIR + '_central_block2.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
rep("function masterKomponenRead(){ return MasterAPI.components(); }", "function masterKomponenRead(){ return MasterAPI.components(); }\n/* ---- FCC core (identik dengan server) ---- */\n" + fccPure + "\n" + block + "\n" + block2, 'INSERT blok 15c + 15d + FCC core');

// ---- 2. status badge + loader ----
rep("' &middot; memuat Master Data&hellip;');", "' &middot; memuat Master Data&hellip;') + centralStatusSuffix();", 'badge: suffix status operasional/antrean');
replFn('loadCentralMasterData', `function loadCentralMasterData(opts){
  opts = opts || {};
  if(!CentralAuth.authorized || typeof ServerBridge === 'undefined') return Promise.resolve(false);
  const keys = ['students','guardians','components','tariffs','accounts','incomeCategories','expenseCategories','subcategories','academicYears','settings'];
  return Promise.all([
    ServerBridge.getStudents(), ServerBridge.getGuardians(), ServerBridge.getComponents(),
    ServerBridge.getTariffs(), ServerBridge.getAccounts(), ServerBridge.getIncomeCategories(),
    ServerBridge.getExpenseCategories(), ServerBridge.getSubcategories(), ServerBridge.getAcademicYears(),
    ServerBridge.getSettings()
  ]).then(function(results){
    let allOk = true;
    results.forEach(function(r){ if(!(r && r.ok && r.code==='SUCCESS')) allOk = false; });
    if(allOk){
      results.forEach(function(r, i){ CentralMasterData[keys[i]] = r.data; });
      CentralMasterData.ready = true;
      CentralMasterData.loadedAt = new Date().toISOString();
      try{ lsSet(lsKey('centralMasterDataCache'), CentralMasterData); }catch(e){ console.error('centralMasterDataCache gagal disimpan (non-fatal):', e); }
    }
    renderAuthStatusBadge();
    if(allOk && !opts.skipOperational){
      return loadOperationalData().then(function(){ centralRerenderIfIdle(); centralScheduleSync(); return true; });
    }
    return allOk;
  });
}`, 'REWRITE loadCentralMasterData (Promise, refresh aman, muat operasional)');

// ---- 3. READ transaksi/alokasi ----
rep("function allTransaksi(){ return Store.loadTransaksi().filter(t=>!t.archivedAt); }", "function allTransaksi(){ return OperationalAPI.transaksi().filter(t=>!t.archivedAt); }", 'allTransaksi');
rep("function transaksiById(id){ return Store.loadTransaksi().find(t=>t.id===id)||null; }", "function transaksiById(id){ const sid = centralResolveTrxId(id); return OperationalAPI.transaksi().find(t=>t.id===sid)||null; }", 'transaksiById');
rep("function alokasiForTransaksi(trxId){ return Store.loadAlokasi().filter(a=>a.transaksiId===trxId); }", "function alokasiForTransaksi(trxId){ const sid = centralResolveTrxId(trxId); return OperationalAPI.alokasi().filter(a=>a.transaksiId===sid); }", 'alokasiForTransaksi');
rep("function alokasiForTagihan(tagihanId){ return Store.loadAlokasi().filter(a=>a.tagihanId===tagihanId); }", "function alokasiForTagihan(tagihanId){ return OperationalAPI.alokasi().filter(a=>a.tagihanId===tagihanId); }", 'alokasiForTagihan');
rep("Store.loadAlokasi().filter(a=>resolveObligationMatch(a,ob))", "OperationalAPI.alokasi().filter(a=>resolveObligationMatch(a,ob))", 'alokasiTerbayar');
rep("const alokasiSiswa = Store.loadAlokasi().filter(a=>a.siswaId===id);", "const alokasiSiswa = OperationalAPI.alokasi().filter(a=>a.siswaId===id);", 'renderProfilSiswa alokasi');
rep("const riwayat = Store.loadTransaksi().filter(t=>t.siswaId===id && t.jenis==='PENERIMAAN');", "const riwayat = OperationalAPI.transaksi().filter(t=>t.siswaId===id && t.jenis==='PENERIMAAN');", 'renderProfilSiswa riwayat');
rep("return Store.loadAlokasi().some(a=>a.komponenId===t.komponenId) ||", "return OperationalAPI.alokasi().some(a=>a.komponenId===t.komponenId) ||", 'tarifUsedInHistory');
rep("return Store.loadAlokasi().some(a=>a.komponenId===k.id) ||", "return OperationalAPI.alokasi().some(a=>a.komponenId===k.id) ||", 'komponenUsedInHistory');

// ---- 4. WRITE door: postTransaksi / createAlokasi ----
rep("  t.buktiId = t.buktiId||[];\n  arr.push(t);", "  t.buktiId = t.buktiId||[];\n  if(centralTxWriteActive() && (t.jenis==='PENERIMAAN'||t.jenis==='PENGELUARAN')) t._pendingSync = true;\n  arr.push(t);", 'postTransaksi: tandai antre sinkron');
rep("if((t.jenis==='PENERIMAAN'||t.jenis==='PENGELUARAN') && typeof BridgeClient!=='undefined'){", "if((t.jenis==='PENERIMAAN'||t.jenis==='PENGELUARAN') && typeof BridgeClient!=='undefined' && !centralTxWriteActive()){", 'postTransaksi: BridgeClient lama off saat central aktif');
rep("(transaksi TETAP tersimpan lokal):', bridgeErr); }\n  }\n  return t;", "(transaksi TETAP tersimpan lokal):', bridgeErr); }\n  }\n  centralScheduleSync();\n  return t;", 'postTransaksi: jadwalkan sinkron');
insAfterFn('createAlokasi', "  transaksiId = centralResolveTrxId(transaksiId);", 'createAlokasi: resolve id terpetakan');
rep("caraBayar:l.caraBayar||null, createdAt:new Date().toISOString()};\n    arr.push(row);", "caraBayar:l.caraBayar||null, createdAt:new Date().toISOString()};\n    if(centralTxWriteActive()) row._pendingSync = true;\n    arr.push(row);", 'createAlokasi: tandai antre sinkron');
rep("  Store.saveAlokasi(arr);\n  /* Fase 3B-3A: enqueue createAllocation SATU per baris alokasi", "  Store.saveAlokasi(arr);\n  centralScheduleSync();\n  /* Fase 3B-3A: enqueue createAllocation SATU per baris alokasi", 'createAlokasi: jadwalkan sinkron');
rep("  if(typeof BridgeClient!=='undefined'){\n    savedNow.forEach", "  if(typeof BridgeClient!=='undefined' && !centralTxWriteActive()){\n    savedNow.forEach", 'createAlokasi: BridgeClient lama off saat central aktif');
rep("  if(!trx.siswaId && list.length){\n    const arr2", "  if(!trx.siswaId && list.length && !centralIsServerTrx(transaksiId)){\n    const arr2", 'createAlokasi: siswaId otomatis hanya utk baris lokal');

// ---- 5. edit transaksi lewat helper sentral ----
replFn('updateTransaksiStatus', `function updateTransaksiStatus(trxId, status){
  const cur = transaksiById(trxId);
  if(!cur) return;
  if(centralIsServerTrx(trxId) && cur.status===status) return;
  let r; try{ r = centralPatchTransaksi(trxId, {status:status}); }catch(e){ return; }
  auditTrailPush('UBAH_STATUS_TRANSAKSI', r.before, r.after, 'manual');
}`, 'REWRITE updateTransaksiStatus');
replFn('editNominalTransaksi', `function editNominalTransaksi(trxId, nominalBaru, alasan){
  const r = centralPatchTransaksi(trxId, {nominal:nominalBaru});
  auditTrailPush('EDIT_NOMINAL_TRANSAKSI', r.before, Object.assign(deepClone(r.after), {_alasanPerubahan: alasan}), 'manual');
  updateTransaksiStatus(trxId, computeTransaksiAllocationStatus(trxId));
}`, 'REWRITE editNominalTransaksi');
insAfterFn('archiveTransaksi', "  if(centralIsServerTrx(trxId)){ centralArchiveTrx(trxId, alasan); auditTrailPush('ARCHIVE_TRANSAKSI', {id:centralResolveTrxId(trxId)}, {_alasan:alasan}, 'manual'); return; }");
insAfterFn('hapusAlokasi', "  if(OperationalAPI.isServerAlokasi(alokasiId)){ centralArchiveAlokasi(alokasiId, 'dihapus dari editor alokasi'); auditTrailPush('HAPUS_ALOKASI', {id:alokasiId}, null, 'manual'); updateTransaksiStatus(transaksiId, computeTransaksiAllocationStatus(transaksiId)); toast('Alokasi diarsipkan (reversal, data tidak dihapus)'); openModal(alokasiEditorHtml(transaksiId), true); return; }");
rep("  let trx;\n  if(w.editTrxId){", "  if(w.editTrxId && centralIsServerTrx(w.editTrxId)){\n    const sid0 = centralResolveTrxId(w.editTrxId);\n    try{\n      centralPatchTransaksi(sid0, {tanggal:tanggal, metode:metode, akunId:akunId, unit:unit, nominal:totalNominal, siswaId:'', ftNumber:ftNumber||'', catatan:catatan||''});\n      alokasiForTransaksi(sid0).forEach(a0=>centralArchiveAlokasi(a0.id, 'diganti saat edit transaksi'));\n      auditTrailPush('EDIT_TRANSAKSI_PENERIMAAN', {id:sid0}, {id:sid0, nominal:totalNominal}, 'manual');\n      if(combinedPlan.length) createAlokasi(sid0, combinedPlan); else updateTransaksiStatus(sid0, computeTransaksiAllocationStatus(sid0));\n    }catch(e){ toast('Gagal memperbarui transaksi: '+e.message); return; }\n    State.penerimaanWizard=null; closeModal(); renderContent(); toast('Transaksi diperbarui (alokasi lama diarsipkan, tidak dihapus)'); return;\n  }\n  let trx;\n  if(w.editTrxId){", 'pwSubmit: edit transaksi server = patch + arsip alokasi lama + alokasi baru');
replFn('useSiswaCandidate', `function useSiswaCandidate(trxId, siswaId){
  const cur = transaksiById(trxId);
  if(!cur) throw new Error('Transaksi tidak ditemukan');
  const r = centralPatchTransaksi(trxId, {siswaId:siswaId, status: cur.status==='TERCATAT' ? 'TERIDENTIFIKASI' : cur.status});
  auditTrailPush('MATCH_STUDENT', r.before, r.after, 'smart-matching');
  closeModal(); toast('Siswa dari kandidat diterapkan: '+siswaName(siswaId)); openAlokasiEditor(trxId);
}`, 'REWRITE useSiswaCandidate');
replFn('submitIdentifikasi', `function submitIdentifikasi(id){
  const siswaId = val('idf_siswa');
  if(!siswaId){ toast('Pilih siswa terlebih dahulu'); return; }
  const r = centralPatchTransaksi(id, {siswaId:siswaId, status:'TERIDENTIFIKASI'});
  auditTrailPush('MATCH_STUDENT', r.before, r.after, 'manual');
  toast('Teridentifikasi'); openAlokasiEditor(id);
}`, 'REWRITE submitIdentifikasi');
rep("    const arr=Store.loadTransaksi(); const idx=arr.findIndex(x=>x.id===trxId); const before=deepClone(arr[idx]);\n    arr[idx].siswaId=ev.siswaId; arr[idx].status='TERIDENTIFIKASI'; Store.saveTransaksi(arr);\n    auditTrailPush('MATCH_STUDENT', before, arr[idx], 'one-click');",
  "    const r = centralPatchTransaksi(trxId, {siswaId:ev.siswaId, status:'TERIDENTIFIKASI'});\n    auditTrailPush('MATCH_STUDENT', r.before, r.after, 'one-click');", 'oneClickComplete: patch via helper sentral');

// ---- 6. MASTER CRUD -> server ----
insAfterFn('submitSiswaForm', `  if(centralMasterWriteActive()){
    const d0 = {nama:val('sif_nama'),nis:val('sif_nis'),nisn:val('sif_nisn'),kelas:val('sif_kelas'),unit:val('sif_unit'),namaWali:val('sif_wali'),kontakWali:val('sif_kontak'),status:val('sif_status'),tahunAjaran:Store.loadSettings().tahunAjaranAktif};
    if(!d0.nama){ toast('Nama wajib diisi'); return; }
    centralMasterSave('siswa', id, d0, 'Data siswa tersimpan di Google Sheets'); return;
  }`);
rep("const komp = Store.loadSettings().komponenBiayaList||[];\n  const t = id ? Store.loadTarif().find(x=>x.id===id)", "const komp = MasterAPI.components();\n  const t = id ? MasterAPI.tariffs().find(x=>x.id===id)", 'openTarifForm: baca MasterAPI');
rep("  const tarif = Store.loadTarif();\n  let html = '<div class=\"card\"><h3>Tarif (dasar", "  const tarif = MasterAPI.tariffs();\n  let html = '<div class=\"card\"><h3>Tarif (dasar", 'renderPengaturanTarif: baca MasterAPI');
insAfterFn('submitTarif', `  if(centralMasterWriteActive()){
    centralMasterSave('tarif', id, {komponenId:val('trf_komponen'), unit:val('trf_unit'), kelas:val('trf_kelas'), tahunAjaran:val('trf_ta'), nominal:numval('trf_nominal')}, 'Tarif tersimpan di Google Sheets'); return;
  }`);
insAfterFn('hapusAtauNonaktifkanTarif', "  if(centralMasterWriteActive()){ toast(CENTRAL_MSG.noStatus); return; }");
rep("  const master = Store.loadTahunAjaranMaster();\n  html += '<div class=\"card\"><h3>Master Tahun Ajaran", "  const master = MasterAPI.academicYears();\n  html += '<div class=\"card\"><h3>Master Tahun Ajaran", 'renderPengaturanTahunAjaran: baca MasterAPI');
insAfterFn('submitTahunAjaranForm', `  if(centralMasterWriteActive()){
    const lb = val('taf_label').trim();
    if(!/^\\d{4}\\/\\d{4}$/.test(lb)){ toast('Format harus YYYY/YYYY, mis. 2031/2032'); return; }
    centralMasterSave('tahunAjaran', null, {label:lb, status:'Aktif'}, 'Tahun ajaran ditambahkan di Google Sheets'); return;
  }`);
insAfterFn('toggleTahunAjaranStatus', "  if(centralMasterWriteActive()){ centralMasterToggle('tahunAjaran', id, MasterAPI.academicYears(), 'Status diperbarui', 'Status diperbarui'); return; }");
rep("const k = id ? s.komponenBiayaList.find(x=>x.id===id) : {nama:'', unit:'', frekuensi:'Bulanan', status:'Aktif'};", "const k = id ? MasterAPI.components().find(x=>x.id===id) : {nama:'', unit:'', frekuensi:'Bulanan', status:'Aktif'};", 'openKomponenForm: baca MasterAPI');
insAfterFn('submitKomponen', `  if(centralMasterWriteActive()){
    const dk = {nama:val('kmf_nama'), unit:val('kmf_unit'), frekuensi:val('kmf_frek'), status:val('kmf_status')};
    if(!dk.nama.trim()){ toast('Nama komponen wajib diisi'); return; }
    centralMasterSave('komponen', id, dk, 'Komponen tersimpan di Google Sheets'); return;
  }`);
insAfterFn('hapusAtauNonaktifkanKomponen', "  if(centralMasterWriteActive()){ centralMasterToggle('komponen', id, MasterAPI.components(), 'Komponen diaktifkan kembali', 'Komponen dinonaktifkan (tidak dihapus)'); return; }");
rep("    s.akunKasBankList.map(a=>'<tr><td>'+esc(a.nama)+'</td><td>'+esc(a.jenis)", "    akunList().map(a=>'<tr><td>'+esc(a.nama)+'</td><td>'+esc(a.jenis)", 'renderPengaturanAkun: baca MasterAPI');
rep("const a = id ? s.akunKasBankList.find(x=>x.id===id) : {nama:'', jenis:'Kas', saldoAwal:0, status:'Aktif'};", "const a = id ? akunList().find(x=>x.id===id) : {nama:'', jenis:'Kas', saldoAwal:0, status:'Aktif'};", 'openAkunForm: baca MasterAPI');
insAfterFn('submitAkun', `  if(centralMasterWriteActive()){
    const da = {nama:val('akf_nama'), jenis:val('akf_jenis'), saldoAwal:numval('akf_saldo')};
    if(!da.nama.trim()){ toast('Nama akun wajib diisi'); return; }
    centralMasterSave('akun', id, da, 'Akun tersimpan di Google Sheets'); return;
  }`);
insAfterFn('hapusAtauNonaktifkanAkun', "  if(centralMasterWriteActive()){ toast(CENTRAL_MSG.noStatus); return; }");
rep("  const penerimaan = Store.loadKategoriPenerimaanMaster();\n  const pengeluaran = Store.loadKategoriPengeluaranMaster();\n  const sub = Store.loadSubkategoriMaster();", "  const penerimaan = MasterAPI.incomeCategories();\n  const pengeluaran = MasterAPI.expenseCategories();\n  const sub = MasterAPI.subcategories();", 'renderPengaturanKategori: baca MasterAPI');
rep("  const loadFn = type==='pengeluaran' ? Store.loadKategoriPengeluaranMaster.bind(Store) : Store.loadKategoriPenerimaanMaster.bind(Store);\n  const k = id ? loadFn().find(x=>x.id===id)", "  const loadFn = type==='pengeluaran' ? MasterAPI.expenseCategories : MasterAPI.incomeCategories;\n  const k = id ? loadFn().find(x=>x.id===id)", 'openKategoriForm: baca MasterAPI');
insAfterFn('submitKategoriForm', `  if(centralMasterWriteActive()){
    const nm = val('ktf_nama').trim();
    if(!nm){ toast('Nama kategori wajib diisi'); return; }
    centralMasterSave(type==='pengeluaran' ? 'kategoriPengeluaran' : 'kategoriPenerimaan', id, {kode:val('ktf_kode').trim(), kategori:nm, status:val('ktf_status')}, 'Kategori tersimpan di Google Sheets'); return;
  }`);
insAfterFn('hapusAtauNonaktifkanKategori', "  if(centralMasterWriteActive()){ centralMasterToggle(type==='pengeluaran' ? 'kategoriPengeluaran' : 'kategoriPenerimaan', id, type==='pengeluaran' ? MasterAPI.expenseCategories() : MasterAPI.incomeCategories(), 'Kategori diaktifkan kembali', 'Kategori dinonaktifkan (tidak dihapus)'); return; }");
rep("  const kategoriOpts = Store.loadKategoriPengeluaranMaster().filter(k=>k.status!=='Nonaktif')", "  const kategoriOpts = MasterAPI.expenseCategories().filter(k=>k.status!=='Nonaktif')", 'openSubkategoriForm: kategori MasterAPI');
rep("const sk = id ? Store.loadSubkategoriMaster().find(x=>x.id===id)", "const sk = id ? MasterAPI.subcategories().find(x=>x.id===id)", 'openSubkategoriForm: sub MasterAPI');
insAfterFn('submitSubkategoriForm', `  if(centralMasterWriteActive()){
    const ns = val('skf_nama').trim();
    if(!ns || !val('skf_kategori')){ toast('Lengkapi kategori dan nama subkategori'); return; }
    centralMasterSave('subkategori', id, {kategoriId:val('skf_kategori'), nama:ns, status:val('skf_status')}, 'Subkategori tersimpan di Google Sheets'); return;
  }`);
insAfterFn('hapusAtauNonaktifkanSubkategori', "  if(centralMasterWriteActive()){ centralMasterToggle('subkategori', id, MasterAPI.subcategories(), 'Subkategori diaktifkan kembali', 'Subkategori dinonaktifkan (tidak dihapus)'); return; }");

// ---- 7. Financial label: jangan sebut "Surplus" bila data belum lengkap ----
rep("if(pct<100) return 'Surplus Kas Aktual Sementara (Data ' + pct + '% Lengkap)';", "if(pct<100) return 'Actual Cash Position - Data ' + pct + '% Lengkap (belum lengkap, bukan surplus)';", 'label: bukan Surplus saat data tidak lengkap');


// ======== TAHAP 2: fasad koleksi, Drive, audit, reversal, laporan, panel pusat data, cutover ========
[["fromServer('students', normSiswa)", "centralMasterOverlay_('siswa', fromServer('students', normSiswa))"],
 ["fromServer('components', normKomponen)", "centralMasterOverlay_('komponen', fromServer('components', normKomponen))"],
 ["fromServer('tariffs', normTarif)", "centralMasterOverlay_('tarif', fromServer('tariffs', normTarif))"],
 ["fromServer('accounts', normAkun)", "centralMasterOverlay_('akun', fromServer('accounts', normAkun))"],
 ["fromServer('incomeCategories', normKategori)", "centralMasterOverlay_('kategoriPenerimaan', fromServer('incomeCategories', normKategori))"],
 ["fromServer('expenseCategories', normKategori)", "centralMasterOverlay_('kategoriPengeluaran', fromServer('expenseCategories', normKategori))"],
 ["fromServer('subcategories', normSub)", "centralMasterOverlay_('subkategori', fromServer('subcategories', normSub))"],
 ["fromServer('academicYears', normTA)", "centralMasterOverlay_('tahunAjaran', fromServer('academicYears', normTA))"]
].forEach(function(p){ rep(p[0], p[1], 'MasterAPI overlay antrean: ' + p[0]); });
rep("  Store.saveAuditTrail(arr);\n}", "  Store.saveAuditTrail(arr);\n  ccAuditEnqueue_(aksi, dataSebelum, dataSesudah, sumber);\n}", 'auditTrailPush: mirror ke server');
insAfterFn('commitSiswaRow', `  if(centralMasterWriteActive()){
    const s0 = Store.loadSettings(), id0 = uid('siswa');
    const rec0 = {nama:get('namaSiswa'), nis:get('nis'), nisn:get('nisn'), unit:get('unit') || (res&&res.unit) || '', kelas:get('kelas'), tahunAjaran:get('tahunAjaran')||s0.tahunAjaranAktif,
      jenisKelamin:get('jenisKelamin'), tanggalMasuk:get('tanggalMasuk'), status:get('status')||'Aktif', namaWali:get('namaWali')||get('namaAyah')||get('namaIbu'), kontakWali:get('kontakWali')};
    if(get('alamat')) rec0.alamat = get('alamat');
    centralMasterQueue_('siswa', id0, rec0);
    auditTrailPush('MATCH_STUDENT', null, {siswaId:id0, nama:rec0.nama, hasil:'NEW'}, 'import-wizard');
    return id0;
  }`, 'commitSiswaRow: antre ke server');
insAfterFn('updateSiswaRow', `  if(centralMasterWriteActive()){
    const cur0 = MasterAPI.students().find(x=>x.id===siswaId); if(!cur0) return;
    const upd0 = {}, setIf0 = (f, v)=>{ if(v) upd0[f] = v; };
    setIf0('nama', get('namaSiswa')); setIf0('nis', get('nis')); setIf0('nisn', get('nisn')); setIf0('unit', get('unit')||(res&&res.unit)); setIf0('kelas', get('kelas'));
    setIf0('jenisKelamin', get('jenisKelamin')); setIf0('tanggalMasuk', get('tanggalMasuk')); setIf0('status', get('status'));
    setIf0('namaWali', get('namaWali')||get('namaAyah')||get('namaIbu')); setIf0('kontakWali', get('kontakWali')); setIf0('alamat', get('alamat'));
    if(Object.keys(upd0).length) centralMasterQueue_('siswa', siswaId, upd0);
    auditTrailPush('UPDATE_STUDENT', cur0, Object.assign({}, cur0, upd0), 'import-wizard');
    return;
  }`, 'updateSiswaRow: antre ke server');
rep("    const arr = Store.loadTransaksi(); const idx = arr.findIndex(t=>t.id===trxId);\n    arr[idx].buktiId = (arr[idx].buktiId||[]).concat([d.id]);\n    if(arr[idx].jenis==='PENGELUARAN' && arr[idx].status==='TERCATAT') arr[idx].status='SELESAI';\n    Store.saveTransaksi(arr);",
    "    if(centralIsServerTrx(trxId)){ const c0 = transaksiById(trxId); if(c0 && c0.jenis==='PENGELUARAN' && c0.status==='TERCATAT') updateTransaksiStatus(trxId, 'SELESAI'); }\n    else {\n      const arr = Store.loadTransaksi(); const idx = arr.findIndex(t=>t.id===trxId);\n      arr[idx].buktiId = (arr[idx].buktiId||[]).concat([d.id]);\n      if(arr[idx].jenis==='PENGELUARAN' && arr[idx].status==='TERCATAT') arr[idx].status='SELESAI';\n      Store.saveTransaksi(arr);\n    }", 'submitBukti: transaksi server lewat helper sentral');
rep("(d.fileRef?'<a class=\"link\" href=\"'+d.fileRef+'\" download=\"'+esc(d.judul)+'\">Unduh</a>':'-')", "(d.driveFileUrl?'<a class=\"link\" target=\"_blank\" rel=\"noopener\" href=\"'+esc(d.driveFileUrl)+'\">Buka di Drive</a>':(d.fileRef?'<a class=\"link\" href=\"'+d.fileRef+'\" download=\"'+esc(d.judul)+'\">Unduh</a>':'-'))", 'renderDokumen: tautan Drive');
rep("'aruskas','audit','kpi'];", "'aruskas','audit','kpi','kontrol'];", 'laporan: tab kontrol');
rep("kpi:'KPI Bendahara'};", "kpi:'KPI Bendahara',kontrol:'Kontrol Keuangan'};", 'laporan: label kontrol');
rep("  const fnMap = {", "  const fnMap = {\n    kontrol: ()=>renderFinancialControl(),", 'laporan: fnMap kontrol');
rep("  html += renderPengaturanSinkronisasi();\n  return html;", "  html += renderPengaturanPusatData();\n  html += renderPengaturanSinkronisasi();\n  return html;", 'pengaturan: panel Pusat Data');
insAfterFn('doBackupImport', "  if(centralReady_() && centralOpLoaded_('transaksi')){ toast('Restore dari file dinonaktifkan pada mode pusat (Google Sheets adalah sumber kebenaran) - gunakan riwayat versi Google Sheets.'); return; }");
insAfterFn('openResetMigrationDataConfirm', "  if(centralReady_() && centralOpLoaded_('transaksi')){ openModal('<h3>Reset dinonaktifkan</h3><p>Pada mode pusat, data bisnis ada di Google Sheets dan tidak dapat direset dari aplikasi.</p><div class=\"modal-actions\"><button class=\"btn primary\" onclick=\"closeModal()\">Tutup</button></div>'); return; }");
insAfterFn('resetMigrationData', "  if(centralReady_() && centralOpLoaded_('transaksi')) throw new Error('Reset dinonaktifkan pada mode pusat');");
rep("  toast('Backup diunduh');\n}", "  lsSet(lsKey('centralLastBackupAt'), new Date().toISOString());\n  toast('Backup diunduh');\n}", 'doBackupExport: catat waktu backup');
fs.writeFileSync(SRC, t.replace(/\n/g, '\r\n'), 'utf8');
fs.writeFileSync(OUTDIR + '_central_patch_log.txt', log.map((l, i) => (i + 1) + '. ' + l).join('\n'));
console.log('OK ' + log.length + ' perubahan -> ' + SRC);
