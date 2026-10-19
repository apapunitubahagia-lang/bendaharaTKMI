// Langkah build P0-T1 (klien). Dijalankan SETELAH apply_p0_t8_client.js. Commit terpisah, mudah di-revert.
// Pengaman SEMENTARA tombol "Buat Transaksi Pengeluaran" dari LPJ. Model uang muka/pencairan BELUM diputuskan (D-T1):
// tidak ada konsep uang muka baru, tidak ada tautan ke transaksi yang sudah ada, tidak ada penghapusan/koreksi data.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

L.replFn(doc, 'openCreateTransaksiFromLpjUnitModal', `
/* [P0-T1] Pengaman sementara "Buat Transaksi Pengeluaran dari LPJ" (model uang muka BELUM diputuskan, D-T1):
   - akun sumber dan kategori WAJIB dipilih eksplisit (tidak ada akun/kategori default diam-diam);
   - DIBLOKIR bila data transaksi/LPJ server tidak lengkap, LPJ tidak valid, atau ada PENGELUARAN unit sama yang mungkin
     sudah mencatat uang yang sama (lpjDuplicateCandidates_), karena tautannya belum dapat dipastikan;
   - satu LPJ = paling banyak satu transaksi: id lokal deterministik trx_lpj_<lpjId> -> clientRequestId server tetap,
     sehingga klik/coba ulang tidak membuat transaksi kedua;
   - tautan LPJ->transaksi lewat jalur server biasa (RecordGuard: PENGELUARAN aktif, total LPJ <= nominal); status
     "Sudah" di daftar LPJ hanya bila tautan sudah tercatat di server. */
function openCreateTransaksiFromLpjUnitModal(lpjId){
  const l = Store.loadLpj().find(x=>x.id===lpjId);
  if(!l){ toast('LPJ tidak ditemukan'); return; }
  if(l.transaksiId){ toast('LPJ ini sudah punya Transaksi Pengeluaran'); return; }
  const akunOpts = [{value:'', label:'- Pilih Akun Sumber -'}].concat(akunList().filter(a=>a.jenis==='Kas'||a.jenis==='Bank').map(a=>({value:a.id, label:a.nama+' ('+a.jenis+')'})));
  const kats = kategoriPengeluaranNames(), katAwal = kats.indexOf(l.kategori)!==-1 ? l.kategori : '';
  let body = '<h3>Buat Transaksi Pengeluaran dari LPJ</h3>'+
    '<div class="kv"><div>Tanggal</div><div>'+fmtDate(l.tanggal)+'</div><div>Item</div><div>'+esc(l.item||'-')+'</div><div>Nominal</div><div>'+fmtRp(l.nominal)+'</div></div>'+
    '<p class="small-muted">Gunakan HANYA bila pengeluaran ini belum pernah dicatat (mis. bukan rincian dari uang muka/pencairan yang sudah tercatat). Bila ada pengeluaran yang mungkin sama, tindakan ini diblokir agar tidak tercatat ganda.</p>'+
    unitFieldHtml('ltu_unit','')+
    fieldSelect('ltu_akun','Akun Sumber (wajib)', akunOpts, '')+
    fieldSelect('ltu_kategori','Kategori (wajib)', [{value:'',label:'- Pilih Kategori -'}].concat(kats.map(k=>({value:k,label:k}))), katAwal)+
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button>'+
    '<button class="btn primary" onclick="createTransaksiFromLpj(\\''+lpjId+'\\')">Buat Transaksi</button></div>';
  openModal(body, false);
}
`, log);

L.replFn(doc, 'createTransaksiFromLpj', `
const LPJ_DUP_WINDOW_DAYS_ = 62; // kehati-hatian: pengeluaran sampai 62 hari sebelum tanggal LPJ dianggap mungkin sama (pemblokiran, bukan kebijakan akuntansi)
const __lpjTrxBusy_ = {};
function lpjValidDate_(v){ const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(v||'')); if(!m) return false; const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3]; } // sama dengan sgDateError_ server
function lpjTrxIdFor_(lpjId){ return 'trx_lpj_' + String(lpjId).replace(/[^A-Za-z0-9_\\-]/g, '_').slice(0, 80); }
function lpjDuplicateCandidates_(l, unit){
  const linked = {};
  Store.loadLpj().forEach(x=>{ if(x.transaksiId){ const k = centralResolveTrxId(x.transaksiId); linked[k] = (linked[k]||0) + Number(x.nominal||0); } });
  const own = centralResolveTrxId(lpjTrxIdFor_(l.id)), d0 = new Date(String(l.tanggal)+'T00:00:00');
  const katDikenal = !!l.kategori && kategoriPengeluaranNames().indexOf(l.kategori) !== -1;
  return pengeluaranList().filter(t=>{
    if(t.id === own || t.id === lpjTrxIdFor_(l.id)) return false;
    if(t.unit !== unit) return false;
    if(katDikenal && t.kategori !== l.kategori) return false; // kategori LPJ tidak dikenal/kosong -> semua kategori dianggap mungkin
    const days = (d0 - new Date(String(t.tanggal)+'T00:00:00')) / 86400000;
    if(!(days >= 0 && days <= LPJ_DUP_WINDOW_DAYS_)) return false;
    return Number(t.nominal||0) - (linked[t.id]||0) + 0.5 >= Number(l.nominal||0);
  });
}
function createTransaksiFromLpj(lpjId){
  if(__lpjTrxBusy_[lpjId]){ toast('Permintaan untuk LPJ ini sedang diproses'); return; }
  const unit = val('ltu_unit'), akunId = val('ltu_akun'), kategori = val('ltu_kategori');
  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }
  const akun = akunList().find(a=>a.id===akunId && (a.jenis==='Kas'||a.jenis==='Bank'));
  if(!akun){ toast('Akun sumber (Kas/Bank) wajib dipilih - tidak ada akun default'); return; }
  if(!kategori || kategoriPengeluaranNames().indexOf(kategori) === -1){ toast('Kategori pengeluaran wajib dipilih'); return; }
  const ds = centralSourcesStatus_(['transaksi', 'lpj']);
  if(!ds.ok){ toast('DIBLOKIR - tidak dapat memastikan pengeluaran belum tercatat: ' + ds.alasan.join('; ')); return; }
  if(!ccActive_('lpj')){ toast('DIBLOKIR - data LPJ server tidak aktif; tautan LPJ tidak dapat disimpan'); return; }
  const arr = Store.loadLpj();
  const idx = arr.findIndex(x=>x.id===lpjId);
  if(idx<0){ toast('LPJ tidak ditemukan'); return; }
  const l = arr[idx];
  if(l.transaksiId){ toast('LPJ ini sudah punya Transaksi Pengeluaran'); return; }
  if(!(Number(l.nominal) > 0)){ toast('DIBLOKIR - nominal LPJ tidak valid'); return; }
  if(!lpjValidDate_(l.tanggal)){ toast('DIBLOKIR - tanggal LPJ tidak valid (bukan tanggal kalender YYYY-MM-DD): ' + String(l.tanggal||'')); return; }
  const tid = lpjTrxIdFor_(lpjId);
  const prior = Store.loadTransaksi().find(t=>t.id===tid);
  if(prior && prior._syncBlocked){ toast('DIBLOKIR - transaksi dari LPJ ini sebelumnya DITOLAK server (' + (prior._syncError||'galat') + '). Periksa daftar "gagal sinkron"; transaksi baru TIDAK dibuat.'); return; }
  const already = prior || (centralSyncMapGet()[tid] ? {id: tid} : null);
  if(!already){
    const dup = lpjDuplicateCandidates_(l, unit);
    if(dup.length){ toast('DIBLOKIR - kemungkinan tercatat ganda dengan ' + dup.length + ' pengeluaran yang sudah ada (mis. ' + dup.slice(0,3).map(t=>fmtDate(t.tanggal)+' '+fmtRp(t.nominal)).join(', ') + '). Transaksi baru TIDAK dibuat; tautan LPJ ke transaksi yang ada menunggu keputusan kebijakan (D-T1).'); return; }
  }
  __lpjTrxBusy_[lpjId] = true;
  try{
    const t = already || postTransaksi({id:tid, jenis:'PENGELUARAN', tanggal:l.tanggal, kategori:kategori, subkategori:l.subkategori||'',
      penerima:l.item, akunId:akun.id, unit, nominal:Number(l.nominal), metode:'Tunai', status:'TERCATAT', catatan:'Dari LPJ: '+l.item});
    arr[idx].transaksiId = t.id; Store.saveLpj(arr);
    auditTrailPush('LPJ_JADI_TRANSAKSI', null, {lpjId, transaksiId:t.id, akunId:akun.id}, 'manual');
    closeModal(); toast('Transaksi Pengeluaran dibuat dari LPJ - tautan menunggu konfirmasi server'); renderContent();
  }catch(e){ toast('Gagal membuat transaksi: '+e.message+' - tidak ada tautan LPJ yang dibuat'); }
  finally{ delete __lpjTrxBusy_[lpjId]; }
}
`, log);

// status tautan di daftar LPJ: "Sudah" hanya bila server mencatat transaksiId pada baris LPJ itu
L.rep(doc, "'</td><td>'+(l.transaksiId?'<span class=\"badge green\">Sudah</span>':'<span class=\"badge amber\">Belum</span>')+'</td>'+",
  "'</td><td>'+lpjLinkBadge_(l)+'</td>'+", 'badge LPJ', log);
L.rep(doc, "function renderPengaturanImportData(){",
`/* [P0-T1] status tautan LPJ dari kebenaran server (cache 19_LPJ), bukan dari isian lokal */
function lpjLinkBadge_(l){
  if(!l.transaksiId) return '<span class="badge amber">Belum</span>';
  const st = OperationalCache.states.lpj, srv = (st && st.loaded && !st.error) ? (st.rows || []).find(r=>String(r.id)===String(l.id)) : null;
  if(srv && String(srv.transaksiId||'') !== '' && String(srv.transaksiId) === String(centralResolveTrxId(l.transaksiId))) return '<span class="badge green">Sudah</span>';
  const p = ccPend_('lpj')[l.id], t = Store.loadTransaksi().find(x=>x.id===l.transaksiId);
  if((p && p.blocked) || (t && t._syncBlocked)) return '<span class="badge red" title="'+esc((t && t._syncError) || (p && p.error) || 'ditolak server')+'">Gagal sinkron</span>';
  return '<span class="badge gray">Menunggu server</span>';
}
function renderPengaturanImportData(){`, 'lpjLinkBadge_', log);

L.save(doc);
fs.writeFileSync(require('path').join(OUT, '_p0_t1_client_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p0_t1_client OK: ' + log.length + ' perubahan');
