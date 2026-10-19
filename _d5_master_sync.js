/* [P1_21 D-5] Sinkronisasi master lokal -> server: operasi TERPISAH dari migrasi transaksi.
   Tidak otomatis: pratinjau baca-saja, lalu BENDAHARA memilih koleksi, mengetik konfirmasi, dan memberi alasan.
   Seed bawaan aplikasi (MASTER_*_SEED, kategori *_LEGACY) tidak pernah dikirim lewat jalur ini. */
function masterSeedIds_(){
  const s = new Set();
  [MASTER_AKUN_SEED, MASTER_KOMPONEN_SEED, MASTER_TARIF_SEED, MASTER_TAHUN_AJARAN_SEED, MASTER_KATEGORI_PENERIMAAN_SEED,
    MASTER_KATEGORI_PENGELUARAN_SEED, MASTER_SUBKATEGORI_SEED, MASTER_SISWA_SEED].forEach(l=>(l || []).forEach(r=>{ if(r && r.id) s.add(String(r.id)); }));
  return s;
}
function masterIsSeed_(id, seeds){ id = String(id || ''); return (seeds || masterSeedIds_()).has(id) || /^KATP?_LEGACY_/.test(id); }
function centralMasterLocalSets_(){
  const rawSet = lsGet(lsKey('settings'), {});
  return [['siswa', 'students', Store.loadSiswa()], ['komponen', 'components', rawSet.komponenBiayaList || []], ['tarif', 'tariffs', Store.loadTarif()], ['akun', 'accounts', rawSet.akunKasBankList || []],
    ['kategoriPenerimaan', 'incomeCategories', Store.loadKategoriPenerimaanMaster()], ['kategoriPengeluaran', 'expenseCategories', Store.loadKategoriPengeluaranMaster()],
    ['subkategori', 'subcategories', Store.loadSubkategoriMaster()], ['tahunAjaran', 'academicYears', Store.loadTahunAjaranMaster()]];
}
function centralMasterSyncPratinjau(){
  const out = {ok:true, koleksi:{}, baris:[]};
  if(!CentralMasterData.ready) return {ok:false, code:'MASTER_SERVER_BELUM_TERMUAT', message:'Master server belum termuat', koleksi:{}, baris:[]};
  const seeds = masterSeedIds_();
  centralMasterLocalSets_().forEach(function(x){
    const srvIds = new Set((CentralMasterData[x[1]] || []).map(r=>String(r.id !== undefined ? r.id : r.waliId)));
    const k = out.koleksi[x[0]] = {lokal:0, diServer:0, kandidat:0, seed:0, tidakValid:0};
    (x[2] || []).forEach(function(r){
      if(!r || !r.id){ k.tidakValid++; out.baris.push({koleksi:x[0], id:'', status:'TIDAK_VALID', alasan:'ID_KOSONG'}); return; }
      const id = String(r.id); k.lokal++;
      if(srvIds.has(id)){ k.diServer++; return; }
      if(masterIsSeed_(id, seeds)){ k.seed++; out.baris.push({koleksi:x[0], id:id, status:'SEED_TIDAK_DIKIRIM', alasan:'Data bawaan aplikasi, tidak dikirim ke server'}); return; }
      k.kandidat++; out.baris.push({koleksi:x[0], id:id, status:'KANDIDAT', label:String(r.nama || r.kategori || r.label || r.subkategori || id)});
    });
  });
  return out;
}
function centralMasterSyncJalankan(o){
  o = o || {};
  const tolak = (code, message)=>({ok:false, code:code, message:message, antre:0, hasil:[]});
  if(!centralMasterWriteActive()) return tolak('SERVER_TIDAK_AKTIF', 'Server/master belum siap');
  if(CentralAuth.role !== 'BENDAHARA') return tolak('FORBIDDEN', 'Hanya BENDAHARA yang dapat menyinkronkan master');
  if(o.konfirmasi !== 'SINKRON_MASTER') return tolak('KONFIRMASI_WAJIB', 'Ketik SINKRON_MASTER untuk konfirmasi');
  const alasan = String(o.alasan || '').trim();
  if(alasan.length < 10) return tolak('ALASAN_WAJIB', 'Alasan sinkronisasi wajib (min. 10 karakter)');
  const keys = Array.isArray(o.koleksi) ? o.koleksi.map(String) : [];
  if(!keys.length || keys.some(k=>CC_MASTER_ORDER_.indexOf(k) < 0)) return tolak('KOLEKSI_WAJIB', 'Pilih koleksi master yang valid secara eksplisit');
  const pr = centralMasterSyncPratinjau(); if(!pr.ok) return tolak(pr.code, pr.message);
  const pilih = Array.isArray(o.ids) ? new Set(o.ids.map(String)) : null, src = new Map(centralMasterLocalSets_().map(x=>[x[0], x[2] || []])), hasil = [];
  pr.baris.forEach(function(b){
    if(keys.indexOf(b.koleksi) < 0) return;
    if(b.status !== 'KANDIDAT'){ hasil.push({koleksi:b.koleksi, id:b.id, hasil:'DILEWATI', alasan:b.status}); return; }
    if(pilih && !pilih.has(b.id)){ hasil.push({koleksi:b.koleksi, id:b.id, hasil:'TIDAK_DIPILIH'}); return; }
    const r = src.get(b.koleksi).find(x=>x && String(x.id) === b.id);
    centralMasterQueue_(b.koleksi, b.id, r); hasil.push({koleksi:b.koleksi, id:b.id, hasil:'ANTRE'});
  });
  const antre = hasil.filter(h=>h.hasil === 'ANTRE').length;
  auditTrailPush('SINKRON_MASTER_LOKAL', null, {koleksi:keys, alasan:alasan.slice(0, 300), antre:antre, hasil:hasil}, 'central-master-sync');
  return {ok:true, antre:antre, hasil:hasil};
}
function pdMasterSync(){
  const pr = centralMasterSyncPratinjau();
  if(!pr.ok){ toast(pr.message); return pr; }
  const ks = Object.keys(pr.koleksi);
  openModal('<h3>Sinkronisasi master lokal</h3><p class="small-muted">Terpisah dari migrasi transaksi. Hanya baris master lokal yang belum ada di server dan bukan data bawaan aplikasi yang dapat dikirim.</p>' +
    '<div class="tablewrap"><table><thead><tr><th>Koleksi</th><th class="right">Lokal</th><th class="right">Di server</th><th class="right">Kandidat</th><th class="right">Seed (tidak dikirim)</th><th class="right">Tidak valid</th></tr></thead><tbody>' +
    ks.map(k=>{ const v = pr.koleksi[k]; return '<tr><td>' + esc(k) + '</td><td class="right">' + v.lokal + '</td><td class="right">' + v.diServer + '</td><td class="right">' + v.kandidat + '</td><td class="right">' + v.seed + '</td><td class="right">' + v.tidakValid + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="tablewrap" style="max-height:25vh"><table><thead><tr><th>Koleksi</th><th>ID</th><th>Status</th></tr></thead><tbody>' +
    pr.baris.slice(0, 200).map(b=>'<tr><td>' + esc(b.koleksi) + '</td><td>' + esc(b.id) + (b.label ? ' (' + esc(b.label) + ')' : '') + '</td><td>' + esc(b.status) + '</td></tr>').join('') + '</tbody></table></div>' +
    fieldSelect('pdms_koleksi', 'Koleksi (wajib, satu per proses)', [{value:'', label:'- Pilih Koleksi -'}].concat(ks.filter(k=>pr.koleksi[k].kandidat > 0).map(k=>({value:k, label:k + ' (' + pr.koleksi[k].kandidat + ')'}))), '') +
    fieldText('pdms_alasan', 'Alasan (wajib)', '') + fieldText('pdms_konfirmasi', 'Ketik SINKRON_MASTER', '') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="pdMasterSyncConfirmed()">Kirim koleksi terpilih</button></div>', true);
  return pr;
}
function pdMasterSyncConfirmed(){
  const r = centralMasterSyncJalankan({koleksi:[val('pdms_koleksi')].filter(Boolean), alasan:val('pdms_alasan'), konfirmasi:val('pdms_konfirmasi')});
  if(!r.ok){ toast(r.message); return r; }
  closeModal();
  pdOut_('pdLegacyOut', '<p><b>Master diantrekan:</b> ' + r.antre + '</p><div class="tablewrap"><table><thead><tr><th>Koleksi</th><th>ID</th><th>Hasil</th></tr></thead><tbody>' +
    r.hasil.map(h=>'<tr><td>' + esc(h.koleksi) + '</td><td>' + esc(h.id) + '</td><td>' + esc(h.hasil + (h.alasan ? ' (' + h.alasan + ')' : '')) + '</td></tr>').join('') + '</tbody></table></div>');
  centralRunSync(true);
  return r;
}
