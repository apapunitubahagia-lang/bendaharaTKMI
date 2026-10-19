/* [P1_21 D-3] Migrasi V1 pada mode pusat: TIDAK otomatis saat aplikasi dibuka.
   Alur eksplisit: pratinjau (baca-saja) -> BENDAHARA menjalankan dengan konfirmasi -> transaksi V1 ditahap ke lokal
   TANPA akun/kategori fallback -> pemetaan akun+unit (v1PetakanAkun) dan kategori (v1PetakanKategori) eksplisit ->
   pengiriman lewat centralLegacyMigrate. Data V1 (prefix V1_PREFIX) tidak pernah diubah atau dihapus. */
function v1KategoriPengecualian_(t){
  if(t.jenis !== 'PENGELUARAN') return '';
  const kat = String(t.kategori || '').trim();
  if(!kat) return 'PEMETAAN_KATEGORI_V1_DIPERLUKAN';
  // migrasi boot lama mengisi 'Lainnya' bila V1 kosong: tanpa penanda _kategoriV1, 'Lainnya' tidak dapat dibedakan dari fallback
  if(!t._kategoriPemetaan && !Object.prototype.hasOwnProperty.call(t, '_kategoriV1') && kat === 'Lainnya') return 'PEMETAAN_KATEGORI_V1_DIPERLUKAN';
  if(CentralMasterData.ready && !(CentralMasterData.expenseCategories || []).some(k=>String(k.kategori) === kat && String(k.status || 'Aktif') !== 'Nonaktif')) return 'KATEGORI_TIDAK_ADA_DI_SERVER';
  return '';
}
function v1AlokasiPengecualian_(t, alk){
  alk = alk || Store.loadAlokasi().filter(a=>a.transaksiId === t.id && !a._synced);
  if(!alk.length) return '';
  if(alk.some(a=>!a.siswaId || !a.komponenId || !a.periode || !(Number(a.nominal) > 0))) return 'ALOKASI_V1_TIDAK_LENGKAP';
  if(CentralMasterData.ready){ const sis = new Set((CentralMasterData.students || []).map(s=>String(s.id))); if(alk.some(a=>!sis.has(String(a.siswaId)))) return 'SISWA_V1_TIDAK_ADA_DI_SERVER'; }
  if(alk.reduce((s, a)=>s + Number(a.nominal || 0), 0) > Number(t.nominal || 0)) return 'ALOKASI_V1_MELEBIHI_NOMINAL';
  return '';
}
function v1PeranBoleh_(){ return !centralReady_() || CentralAuth.role === 'BENDAHARA'; }
/* Kandidat transaksi V1 (baca-saja). Id = v1Id_ (sama dengan migrasi boot lama) -> migrasi ulang tidak menggandakan. */
function v1KandidatPusat_(){
  const out = [], alk = [];
  const tglOk = v=>lpjValidDate_(v);
  (v1Get('pembayaran', []) || []).forEach((p, i)=>{
    const id = v1Id_('pembayaran', p, i), tanggal = String(p.tanggal || p.tglBayar || '');
    const a = (p.alokasi || []).map((al, j)=>({id:v1Id_('alokasi', al, id + '|' + j), transaksiId:id, siswaId:al.studentId || al.siswaId || null, tagihanId:al.tagihanId || null, komponenId:al.komponenId || null, periode:al.periode || '', nominal:Number(al.nominal || 0), createdAt:tanggal}));
    out.push({sumber:'pembayaran', idx:i, alokasi:a, t:{id:id, jenis:'PENERIMAAN', tanggal:tanggal, noTransaksi:p.noResi || p.id || '', sumber:'Pembayaran Siswa', akunId:'', unit:'', nominal:Number(p.nominal || 0), metode:p.metode || 'Tunai',
      status:a.length ? 'SELESAI' : 'TERIDENTIFIKASI', buktiId:p.buktiId ? [p.buktiId] : [], catatan:p.catatan || '', _migratedFromV1:'pembayaran', _akunSumber:'BELUM_DIPETAKAN', _v1Pusat:true}});
  });
  (v1Get('pemasukan', []) || []).forEach((p, i)=>{
    out.push({sumber:'pemasukan', idx:i, alokasi:[], t:{id:v1Id_('pemasukan', p, i), jenis:'PENERIMAAN', tanggal:String(p.tanggal || ''), noTransaksi:p.referensi || '', sumber:p.kategori || 'Penerimaan Lain', akunId:'', unit:'', nominal:Number(p.nominal || p.penerimaan || 0),
      metode:p.metode || 'Tunai', status:'TERCATAT', buktiId:p.bukti ? [p.bukti] : [], catatan:p.uraian || '', _migratedFromV1:'pemasukan', _akunSumber:'BELUM_DIPETAKAN', _v1Pusat:true}});
  });
  (v1Get('pengeluaran', []) || []).forEach((p, i)=>{
    out.push({sumber:'pengeluaran', idx:i, alokasi:[], t:{id:v1Id_('pengeluaran', p, i), jenis:'PENGELUARAN', tanggal:String(p.tanggal || ''), noTransaksi:p.noBukti || '', kategori:p.kategori || '', _kategoriV1:p.kategori || '', subkategori:p.subkategori || '', penerima:p.penerima || '',
      akunId:'', unit:'', nominal:Number(p.nominal || 0), metode:p.metodePembayaran || 'Tunai', status:(p.buktiId ? 'SELESAI' : 'TERCATAT'), buktiId:p.buktiId ? [p.buktiId] : [], catatan:p.keterangan || '', _migratedFromV1:'pengeluaran', _akunSumber:'BELUM_DIPETAKAN', _v1Pusat:true}});
  });
  out.forEach(k=>{
    const t = k.t, ex = [];
    if(!tglOk(t.tanggal)) ex.push('TANGGAL_V1_TIDAK_VALID');
    if(!(t.nominal > 0)) ex.push('NOMINAL_V1_TIDAK_VALID');
    const ea = v1AlokasiPengecualian_(t, k.alokasi); if(ea) ex.push(ea);
    k.pengecualian = ex;
    k.perluPemetaan = ['AKUN', 'UNIT'].concat(v1KategoriPengecualian_(t) ? ['KATEGORI'] : []);
  });
  return out;
}
function v1MigrasiPusatPratinjau(){
  if(!v1DataPresent()) return {ok:true, adaDataV1:false, baris:[], ringkasan:{}};
  const lokal = new Set(Store.loadTransaksi().map(t=>t.id)), map = centralSyncMapGet();
  const baris = v1KandidatPusat_().map(k=>{
    const t = k.t, st = map[t.id] ? 'SUDAH_DI_SERVER' : lokal.has(t.id) ? 'SUDAH_ADA_LOKAL' : k.pengecualian.length ? 'PENGECUALIAN' : 'SIAP_DITAHAP';
    return {id:t.id, sumber:'V1:' + k.sumber, urutan:k.idx, jenis:t.jenis, tanggal:t.tanggal, nominal:t.nominal, kategoriV1:t._kategoriV1 || '', alokasi:k.alokasi.length, status:st, pengecualian:k.pengecualian, perluPemetaan:k.perluPemetaan};
  });
  const ringkasan = {}; baris.forEach(b=>{ ringkasan[b.status] = (ringkasan[b.status] || 0) + 1; });
  return {ok:true, adaDataV1:true, baris:baris, ringkasan:ringkasan};
}
function v1MigrasiPusatJalankan(o){
  o = o || {};
  const tolak = (code, message)=>({ok:false, code:code, message:message, ditahap:0, hasil:[]});
  if(!centralReady_()) return tolak('SERVER_TIDAK_AKTIF', 'Migrasi V1 mode pusat butuh sesi server yang terotorisasi');
  if(CentralAuth.role !== 'BENDAHARA') return tolak('FORBIDDEN', 'Hanya BENDAHARA yang dapat menjalankan migrasi V1');
  if(!(CentralMasterData.ready && centralOpLoaded_('transaksi'))) return tolak('SUMBER_BELUM_LENGKAP', 'Master/transaksi server belum termuat');
  if(o.konfirmasi !== 'MIGRASI_V1_PUSAT') return tolak('KONFIRMASI_WAJIB', 'Ketik MIGRASI_V1_PUSAT untuk konfirmasi');
  const pr = v1MigrasiPusatPratinjau(); if(!pr.adaDataV1) return tolak('TIDAK_ADA_DATA_V1', 'Tidak ada data V1 di browser ini');
  const kand = new Map(v1KandidatPusat_().map(k=>[k.t.id, k])), siap = pr.baris.filter(b=>b.status === 'SIAP_DITAHAP');
  // alokasi lebih dulu: bila penyimpanan transaksi gagal, alokasi tanpa transaksi tidak pernah dikirim dan proses ulang tetap idempoten
  const al = Store.loadAlokasi(), alIds = new Set(al.map(a=>a.id));
  siap.forEach(b=>kand.get(b.id).alokasi.forEach(a=>{ if(!alIds.has(a.id)){ al.push(Object.assign({_migratedFromV1:'alokasi'}, a)); alIds.add(a.id); } }));
  Store.saveAlokasi(al);
  const arr = Store.loadTransaksi(), ids = new Set(arr.map(t=>t.id));
  siap.forEach(b=>{ if(!ids.has(b.id)){ arr.push(kand.get(b.id).t); ids.add(b.id); } });
  Store.saveTransaksi(arr);
  const hasil = pr.baris.map(b=>({id:b.id, sumber:b.sumber, hasil:b.status === 'SIAP_DITAHAP' ? 'DITAHAP_LOKAL' : b.status, pengecualian:b.pengecualian, perluPemetaan:b.status === 'SIAP_DITAHAP' ? b.perluPemetaan : []}));
  const ditahap = siap.length;
  auditTrailPush('MIGRASI_V1_PUSAT', null, {ditahap:ditahap, ringkasan:pr.ringkasan, hasil:hasil}, 'migrasi-v1-pusat');
  return {ok:true, ditahap:ditahap, hasil:hasil};
}
/* Pemetaan kategori pengeluaran V1: hanya tindakan pengguna, kategori AKTIF master server, alasan wajib, beraudit. */
function v1PetakanKategori(ids, kategori, alasan){
  if(!v1PeranBoleh_()) return {ok:false, code:'FORBIDDEN', message:'Hanya BENDAHARA'};
  kategori = String(kategori || '').trim();
  if(!(CentralMasterData.expenseCategories || []).some(k=>String(k.kategori) === kategori && String(k.status || 'Aktif') !== 'Nonaktif')) return {ok:false, code:'KATEGORI_TIDAK_VALID', message:'Kategori aktif master server wajib dipilih'};
  if(!String(alasan || '').trim()) return {ok:false, code:'ALASAN_WAJIB', message:'Alasan/dasar pemetaan wajib diisi'};
  const set = new Set(ids || []), arr = Store.loadTransaksi(), now = new Date().toISOString(); let n = 0;
  arr.forEach(t=>{
    if(!set.has(t.id) || !t._migratedFromV1 || t._synced || t.jenis !== 'PENGELUARAN') return;
    const before = {id:t.id, kategori:t.kategori || ''};
    t._kategoriPemetaan = {kategori:kategori, kategoriSebelumnya:t.kategori || '', alasan:String(alasan).trim().slice(0, 300), oleh:CentralAuth.email || '', at:now};
    t.kategori = kategori; delete t._syncBlocked; delete t._syncError; t._syncAttempts = 0; n++;
    auditTrailPush('PEMETAAN_KATEGORI_V1', before, {id:t.id, kategori:kategori, alasan:t._kategoriPemetaan.alasan}, 'pemetaan-kategori-v1');
  });
  Store.saveTransaksi(arr);
  return {ok:true, dipetakan:n};
}
function openV1MigrasiPusat(){
  const pr = v1MigrasiPusatPratinjau();
  if(!pr.adaDataV1){ toast('Tidak ada data V1 di browser ini'); return pr; }
  openModal('<h3>Migrasi Data V1 (mode pusat)</h3><p class="small-muted">Tidak berjalan otomatis. Transaksi V1 ditahap ke browser ini <b>tanpa akun/kategori bawaan</b>; setiap transaksi wajib dipetakan (akun, unit, kategori) sebelum dapat dikirim. Data V1 tidak diubah.</p>' +
    '<p>' + Object.keys(pr.ringkasan).map(k=>esc(k) + ': ' + pr.ringkasan[k]).join(' &middot; ') + '</p>' +
    '<div class="tablewrap" style="max-height:30vh"><table><thead><tr><th>Sumber</th><th>Tanggal</th><th>Jenis</th><th class="right">Nominal</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>' +
    pr.baris.slice(0, 300).map(b=>'<tr><td>' + esc(b.sumber + '#' + b.urutan) + '</td><td>' + esc(b.tanggal) + '</td><td>' + esc(b.jenis) + '</td><td class="right">' + fmtRp(b.nominal) + '</td><td>' + esc(b.status) + '</td><td>' + esc(b.pengecualian.concat(b.status === 'SIAP_DITAHAP' ? ['perlu pemetaan: ' + b.perluPemetaan.join('/')] : []).join(', ')) + '</td></tr>').join('') + '</tbody></table></div>' +
    fieldText('v1p_konfirmasi', 'Ketik MIGRASI_V1_PUSAT', '') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="v1MigrasiPusatDariModal()">Tahap ke lokal</button></div>', true);
  return pr;
}
function v1MigrasiPusatDariModal(){ const r = v1MigrasiPusatJalankan({konfirmasi:val('v1p_konfirmasi')}); toast(r.ok ? ('Ditahap: ' + r.ditahap + ' transaksi V1 (belum dikirim)') : r.message); if(r.ok){ closeModal(); pdLegacyScan(); } return r; }
function openV1PemetaanKategori(){
  const rep = centralLegacyScan(), ex = rep.transaksi.pengecualian.filter(x=>x.alasan === 'PEMETAAN_KATEGORI_V1_DIPERLUKAN' || x.alasan === 'KATEGORI_TIDAK_ADA_DI_SERVER');
  State.v1PemetaanKat = ex.map(x=>x.id);
  openModal('<h3>Pemetaan Kategori Pengeluaran V1</h3><p class="small-muted">' + ex.length + ' transaksi V1 tanpa kategori yang sah di master server. Tidak ada kategori bawaan.</p>' +
    fieldSelect('v1k_kat', 'Kategori (wajib)', [{value:'', label:'- Pilih Kategori -'}].concat((CentralMasterData.expenseCategories || []).filter(k=>String(k.status || 'Aktif') !== 'Nonaktif').map(k=>({value:String(k.kategori), label:String(k.kategori)}))), '') + fieldText('v1k_alasan', 'Dasar pemetaan (wajib)', '') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="v1PetakanKategoriDariModal()">Petakan</button></div>', true);
  return ex.length;
}
function v1PetakanKategoriDariModal(){ const r = v1PetakanKategori(State.v1PemetaanKat || [], val('v1k_kat'), val('v1k_alasan')); toast(r.ok ? ('Dipetakan: ' + r.dipetakan + ' transaksi') : r.message); if(r.ok){ closeModal(); pdLegacyScan(); } return r; }
