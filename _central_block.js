/* ============================================================
   15c. CENTRAL OPERATIONAL LAYER (Google Sheets = source of truth)
   Runtime cache (loaded/loading/error/loadedAt) + akses BACA gabungan +
   sinkronisasi TULIS bertahap. Cache BUKAN sumber kebenaran: Google Sheets
   tetap sumber kebenaran, cache dimuat ulang dari server (opReadSheet).

   Semantik transisi (tidak ada data yang hilang dari layar):
   - TAMPILAN = snapshot server + baris lokal yang BELUM ada di server
     (transaksi/alokasi baru yang masih antre, atau data lokal lama).
   - Store lokal TIDAK PERNAH ditimpa oleh data server.
   - Baris lokal yang sudah terkirim TIDAK dihapus; hanya disembunyikan
     lewat peta sinkron (centralSyncMap) supaya tidak tampil ganda.
   - Server membuat ID sendiri (gas_trx_...), jadi transaksi baru dikirim
     BERSAMA alokasinya dalam satu panggilan atomik, lalu dipetakan.
   - Edit atribut transaksi server (status/nominal/siswa) memakai
     overlay tertunda -> opUpdateTransaction.
   - Operasi yang BELUM punya padanan server aman (ganti alokasi saat edit,
     hapus alokasi, arsip) DIBLOKIR dengan pesan jelas, bukan gagal diam-diam.
   Matikan per bagian lewat CENTRAL_CONFIG (false = perilaku lokal lama).
   ============================================================ */
const CENTRAL_CONFIG = { readOperational:true, writeTransactions:true, writeMaster:true, writeCollections:true, writeSettings:true, writeAudit:true };
const OP_SHEETS = { transaksi:'05_TRANSAKSI', alokasi:'06_ALOKASI', kewajiban:'04_KEWAJIBAN', anggaran:'08_ANGGARAN', komitmen:'09_KOMITMEN',
  bukti:'10_BUKTI', mutasiBank:'11_MUTASI_BANK', dupReview:'12_DUP_REVIEW', kpi:'14_KPI', rekonsiliasi:'16_REKONSILIASI', laporan:'17_LAPORAN', rkat:'18_RKAT', lpj:'19_LPJ', audit:'13_AUDIT_LOG' };
const OperationalCache = { states:{} };
Object.keys(OP_SHEETS).forEach(k=>{ OperationalCache.states[k] = {loaded:false, loading:false, error:null, loadedAt:null, rows:[], total:0, headers:[]}; });
const CentralSync = { running:false, again:false, timer:null, lastError:null, lastRunAt:null, refresh:new Set(), after:[], afterMaster:[], masterDirty:false };
const CENTRAL_MSG = {
  editServerTrx:'Transaksi ini tersimpan di Google Sheets. Mengganti alokasi saat edit belum didukung (butuh desain reversal) - gunakan Edit Nominal / Atur Alokasi.',
  hapusAlokasiServer:'Alokasi ini tersimpan di Google Sheets. Hapus alokasi belum didukung (butuh desain reversal/void) - data TIDAK diubah.',
  arsipServer:'Transaksi ini tersimpan di Google Sheets. Arsip belum didukung di server (butuh keputusan kolom/status void) - data TIDAK diubah.',
  buktiServer:'Bukti untuk transaksi di Google Sheets belum didukung (menunggu fase 10_BUKTI) - data TIDAK diubah.',
  noStatus:'Sheet ini belum punya kolom status (SCHEMA mismatch, lihat opSchemaReport) - nonaktifkan belum bisa dilakukan, data TIDAK diubah.',
  importMaster:'Import ke Google Sheets belum didukung (fase Import) - data TIDAK disimpan.'
};
const MASTER_WRITE_FIELDS = {
  siswa:['nama','nis','nisn','kelas','unit','tahunAjaran','namaWali','kontakWali','status','alamat'],
  komponen:['nama','unit','frekuensi','status','sasaran','basisTarif','menggantikan'],
  tarif:['komponenId','unit','kelas','tahunAjaran','nominal','status'],
  akun:['nama','jenis','saldoAwal'],
  kategoriPenerimaan:['kode','kategori','status'],
  kategoriPengeluaran:['kode','kategori','status'],
  subkategori:['kategoriId','nama','status'],
  tahunAjaran:['label','status']
};
function centralReady_(){ return typeof ServerBridge!=='undefined' && CentralAuth.authorized === true; }
function centralOpLoaded_(k){ const st = OperationalCache.states[k]; return !!(st && st.loaded && !st.error); }
function centralTxWriteActive(){
  return CENTRAL_CONFIG.writeTransactions && CENTRAL_CONFIG.readOperational && centralReady_() && centralOpLoaded_('transaksi') && centralOpLoaded_('alokasi')
    && !!ServerBridge.opCreateIncome && !!ServerBridge.opCreateExpense && !!ServerBridge.opCreateAllocation && !!ServerBridge.opUpdateTransaction;
}
function centralMasterWriteActive(){ return CENTRAL_CONFIG.writeMaster && centralReady_() && CentralMasterData.ready === true && !!ServerBridge.opMasterUpsert; }
function centralErrText(res){ return res ? ((res.message || res.code || 'error') + (res.code ? ' [' + res.code + ']' : '')) : 'tidak ada respons server'; }
function centralSyncMapGet(){ return lsGet(lsKey('centralSyncMap'), {}); }
function centralOverlayGet(){ return lsGet(lsKey('centralTrxOverlay'), {}); }
function centralResolveTrxId(id){ const m = centralSyncMapGet(); return m[id] || id; }

/* ---- READ: runtime cache dari server ---- */
function centralReadAllPages_(sheet){
  const rows = [];
  function page(offset){
    return ServerBridge.opReadSheet(sheet, {offset:offset, limit:5000}).then(function(r){
      if(!r || !r.ok || !r.data) return {ok:false, code:(r && r.code) || 'READ_FAILED'};
      Array.prototype.push.apply(rows, r.data.rows);
      if(rows.length < r.data.total && r.data.returned > 0) return page(offset + r.data.returned);
      return {ok:true, rows:rows, total:r.data.total, headers:r.data.headers || []};
    });
  }
  return page(0);
}
function loadOperationalData(keys){
  if(!centralReady_() || !ServerBridge.opReadSheet || !CENTRAL_CONFIG.readOperational) return Promise.resolve(false);
  keys = keys || Object.keys(OP_SHEETS);
  keys.forEach(k=>{ OperationalCache.states[k].loading = true; });
  return Promise.all(keys.map(function(k){
    return centralReadAllPages_(OP_SHEETS[k]).then(function(res){
      const st = OperationalCache.states[k];
      st.loading = false;
      if(res.ok){ st.rows = res.rows; st.total = res.total; st.headers = res.headers; st.loaded = true; st.error = null; st.loadedAt = new Date().toISOString(); }
      else { st.error = res.code || 'ERROR'; }
    }, function(e){ const st = OperationalCache.states[k]; st.loading = false; st.error = 'ERROR'; });
  })).then(function(){ renderAuthStatusBadge(); return true; });
}
function centralRerenderIfIdle(){
  try{ const ov = document.getElementById('modalOverlay'); if(ov && ov.classList && ov.classList.contains('open')) return; renderContent(); }catch(e){ console.error('re-render gagal (non-fatal):', e); }
}

/* ---- READ: akses gabungan (server + lokal yang belum ada di server) ---- */
const OperationalAPI = (function(){
  const memo = {};
  const str = v => (v===null || v===undefined) ? '' : String(v);
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const dstr = v => { const s = str(v); return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0,10) : s; };
  const normTrx = r => Object.assign({}, r, {id:str(r.id), jenis:str(r.jenis), tanggal:dstr(r.tanggal), unit:str(r.unit), nominal:num(r.nominal), akunId:str(r.akunId),
    metode:str(r.metode), status:str(r.status), siswaId:str(r.siswaId), createdAt:str(r.createdAt), catatan:str(r.catatan), sumber:str(r.sumber), kategori:str(r.kategori),
    subkategori:str(r.subkategori), penerima:str(r.penerima), resiNo:str(r.resiNo), ftNumber:str(r.ftNumber), namaPengirim:str(r.namaPengirim), buktiId:[]});
  const normAlk = r => Object.assign({}, r, {id:str(r.id), transaksiId:str(r.transaksiId), siswaId:str(r.siswaId), komponenId:str(r.komponenId), periode:str(r.periode),
    nominal:num(r.nominal), caraBayar:str(r.caraBayar)||null, tagihanId:str(r.tagihanId)||null, createdAt:str(r.createdAt)});
  function serverActive(k){ return CENTRAL_CONFIG.readOperational && centralReady_() && centralOpLoaded_(k); }
  function serverTrx(){
    if(!serverActive('transaksi')) return null;
    const st = OperationalCache.states.transaksi, bs = OperationalCache.states.bukti;
    const bsrc = (bs.loaded && !bs.error) ? bs.rows : null;
    if(!memo.trx || memo.trx.src !== st.rows || memo.trx.bsrc !== bsrc){
      const idx = {};
      if(bsrc) bsrc.forEach(b=>{ const t = str(b.transaksiId); if(t) (idx[t] = idx[t] || []).push(str(b.id)); });
      memo.trx = {src:st.rows, bsrc:bsrc, rows:st.rows.map(r=>{ const o = normTrx(r); if(idx[o.id]) o.buktiId = idx[o.id].slice(); return o; })};
      memo.trxIds = new Set(memo.trx.rows.map(t=>t.id));
    }
    return memo.trx.rows;
  }
  function serverAlk(){
    if(!serverActive('alokasi')) return null;
    const st = OperationalCache.states.alokasi;
    if(!memo.alk || memo.alk.src !== st.rows){ memo.alk = {src:st.rows, rows:st.rows.map(normAlk)}; memo.alkIds = new Set(memo.alk.rows.map(a=>a.id)); }
    return memo.alk.rows;
  }
  return {
    /* Server + lokal-yang-belum-ada-di-server. Fallback ke Store HANYA bila server belum termuat. */
    transaksi(){
      const srv = serverTrx();
      if(!srv) return Store.loadTransaksi(); // TEMPORARY FALLBACK — REMOVE AFTER MASTER READ MIGRATION
      const map = centralSyncMapGet(), ov = centralOverlayGet(), arch = centralArchiveMapGet();
      const out = srv.filter(t=>!arch[t.id]).map(t=> ov[t.id] ? Object.assign({}, t, ov[t.id]) : t);
      const cut = centralCutoverDone_();
      Store.loadTransaksi().forEach(l=>{ if(memo.trxIds.has(l.id) || map[l.id]) return; if(cut && !l._pendingSync) return; out.push(l); });
      return out;
    },
    alokasi(){
      const srv = serverAlk();
      if(!srv) return Store.loadAlokasi(); // TEMPORARY FALLBACK — REMOVE AFTER MASTER READ MIGRATION
      const arch = centralArchiveMapGet();
      const out = srv.filter(a=>!a.archivedAt && !arch[a.id] && !(arch[a.transaksiId] && arch[a.transaksiId].kind==='trx'));
      const cut2 = centralCutoverDone_();
      Store.loadAlokasi().forEach(l=>{ if(l._synced || memo.alkIds.has(l.id) || arch[l.id]) return; if(cut2 && !l._pendingSync) return; out.push(l); });
      return out;
    },
    /* Sheet lain: baris mentah dari server (belum dipakai UI) atau null bila belum termuat. */
    rows(key){ const st = OperationalCache.states[key]; return (st && st.loaded && !st.error) ? st.rows : null; },
    isServerTrx(id){
      if(!serverTrx()) return false;
      const map = centralSyncMapGet(), sid = map[id] || id;
      return memo.trxIds.has(sid) || Object.keys(map).some(k=>map[k] === sid);
    },
    isServerAlokasi(id){ return !!(serverAlk() && memo.alkIds.has(id)); }
  };
})();
function centralIsServerTrx(id){ return OperationalAPI.isServerTrx(id); }

/* ---- WRITE (transaksi): antrean tertunda -> server ---- */
function centralPendingTrx_(){ const m = centralSyncMapGet(); return Store.loadTransaksi().filter(t=>t._pendingSync && !t._synced && !m[t.id] && (t.jenis==='PENERIMAAN' || t.jenis==='PENGELUARAN')); }
function centralPendingAlk_(){ return Store.loadAlokasi().filter(a=>a._pendingSync && !a._synced); }
function centralPendingCount(){ return centralPendingTrx_().length + centralPendingAlk_().length + Object.keys(centralOverlayGet()).length + Object.keys(centralArchiveMapGet()).length + centralExtraPending_(); }
function centralBlockedCount(){ return centralPendingTrx_().filter(t=>t._syncBlocked).length + centralPendingAlk_().filter(a=>a._syncBlocked).length + centralExtraBlocked_(); }
function centralStatusSuffix(){
  const st = OperationalCache.states, keys = Object.keys(st);
  const loaded = keys.filter(k=>st[k].loaded).length, errs = keys.filter(k=>st[k].error).length, loading = keys.some(k=>st[k].loading);
  let s = loading ? ' &middot; memuat data operasional&hellip;' : (' &middot; Operasional server ' + loaded + '/' + keys.length + (errs ? (' (<span style="color:#c62828">' + errs + ' gagal</span>)') : ''));
  const p = centralPendingCount();
  if(p) s += ' &middot; <a class="link" onclick="centralRunSync(true)" title="' + esc(CentralSync.lastError || 'Klik untuk sinkronkan sekarang') + '">' + p + ' tertunda &#8635;</a>';
  const b = centralBlockedCount();
  if(b) s += ' &middot; <span style="color:#c62828">' + b + ' gagal sinkron</span>';
  return s;
}
function centralScheduleSync(){
  if(!centralSyncActive_()) return;
  clearTimeout(CentralSync.timer);
  CentralSync.timer = setTimeout(function(){ centralRunSync(false); }, 1500);
}
const CENTRAL_RETRYABLE_ = {LOCK_TIMEOUT:1, WRITE_FAILED:1, NETWORK_ERROR:1, SERVER_ERROR:1, HTTP_ERROR:1};
function centralMarkError_(kind, id, res){
  const permanent = !(res && CENTRAL_RETRYABLE_[res.code]);
  const upd = r=>{ r._syncError = centralErrText(res); r._syncAttempts = (r._syncAttempts || 0) + 1; if(permanent || r._syncAttempts >= 3) r._syncBlocked = true; };
  if(kind === 'trx'){ const arr = Store.loadTransaksi(); const i = arr.findIndex(x=>x.id===id); if(i>=0){ upd(arr[i]); Store.saveTransaksi(arr); } }
  else { const arr = Store.loadAlokasi(); const i = arr.findIndex(x=>x.id===id); if(i>=0){ upd(arr[i]); Store.saveAlokasi(arr); } }
  CentralSync.lastError = centralErrText(res);
}
function centralMarkTrxSynced_(t, serverId, sentAlk){
  const map = centralSyncMapGet(); map[t.id] = serverId; lsSet(lsKey('centralSyncMap'), map);
  const arr = Store.loadTransaksi(); const i = arr.findIndex(x=>x.id===t.id);
  if(i>=0){ arr[i]._synced = true; delete arr[i]._pendingSync; delete arr[i]._syncError; Store.saveTransaksi(arr); }
  const sentIds = new Set(sentAlk.map(a=>a.id));
  const al = Store.loadAlokasi(); let ch = false;
  al.forEach(a=>{ if(sentIds.has(a.id)){ a._synced = true; delete a._pendingSync; delete a._syncError; ch = true; } });
  if(ch) Store.saveAlokasi(al);
  [['dokumen', Store.loadDokumen, Store.saveDokumen], ['mutasiBank', Store.loadMutasiBank, Store.saveMutasiBank], ['lpj', Store.loadLpj, Store.saveLpj]].forEach(function(p){
    const rows = p[1].call(Store); let c = false;
    rows.forEach(r=>{ if(r.transaksiId === t.id){ r.transaksiId = serverId; c = true; } });
    if(c) p[2].call(Store, rows);
  });
  auditTrailPush('SYNC_TRANSAKSI_KE_SERVER', null, {localId:t.id, serverId:serverId}, 'central-sync');
}
function centralPushTrx_(t){
  if(t._syncBlocked) return Promise.resolve(false);
  const alk = Store.loadAlokasi().filter(a=>a.transaksiId===t.id && !a._synced);
  const payload = buildBridgePayloadFromTransaksi_(t);
  payload.clientRequestId = 'ui_' + t.id;
  if(t.jenis === 'PENERIMAAN' && alk.length){
    payload.allocations = alk.map(a=>({siswaId:a.siswaId, komponenId:a.komponenId, periode:a.periode||undefined, nominal:a.nominal, caraBayar:a.caraBayar||undefined, tagihanId:a.tagihanId||undefined}));
    const sis = new Set(alk.map(a=>a.siswaId));
    if(sis.size > 1) payload.siswaId = undefined; else if(!payload.siswaId) payload.siswaId = alk[0].siswaId;
  }
  const call = t.jenis === 'PENERIMAAN' ? ServerBridge.opCreateIncome : ServerBridge.opCreateExpense;
  return call(JSON.parse(JSON.stringify(payload))).then(function(res){
    if(res && res.ok && res.data && res.data.id){ centralMarkTrxSynced_(t, res.data.id, alk); return true; }
    centralMarkError_('trx', t.id, res); return false;
  });
}
function centralPushAlk_(a){
  if(a._syncBlocked) return Promise.resolve(false);
  const sid = centralResolveTrxId(a.transaksiId);
  if(!centralIsServerTrx(sid)) return Promise.resolve(false);
  const p = {transaksiId:sid, siswaId:a.siswaId, komponenId:a.komponenId, periode:a.periode||undefined, nominal:a.nominal, caraBayar:a.caraBayar||undefined, tagihanId:a.tagihanId||undefined, clientRequestId:'ui_' + a.id};
  return ServerBridge.opCreateAllocation(JSON.parse(JSON.stringify(p))).then(function(res){
    if(res && res.ok){
      const al = Store.loadAlokasi(); const i = al.findIndex(x=>x.id===a.id);
      if(i>=0){ al[i]._synced = true; delete al[i]._pendingSync; delete al[i]._syncError; Store.saveAlokasi(al); }
      return true;
    }
    centralMarkError_('alk', a.id, res); return false;
  });
}
function centralPushPatch_(id){
  const ov = centralOverlayGet(); const patch = ov[id];
  if(!patch || patch._pushed || patch._blocked) return Promise.resolve(false);
  const body = Object.assign({}, patch); delete body._pushed; delete body._blocked; delete body._error;
  return ServerBridge.opUpdateTransaction(JSON.parse(JSON.stringify(Object.assign({id:id}, body)))).then(function(res){
    if(res && res.ok){ const o2 = centralOverlayGet(); if(o2[id]){ o2[id]._pushed = true; lsSet(lsKey('centralTrxOverlay'), o2); } return true; }
    CentralSync.lastError = centralErrText(res);
    // galat permanen (mis. TRANSACTION_ARCHIVED, validasi): tahan perubahan ini (tidak diulang tanpa henti) dan tampilkan di hitungan "gagal sinkron"
    if(!(res && CENTRAL_RETRYABLE_[res.code])){ const o3 = centralOverlayGet(); if(o3[id]){ o3[id]._blocked = true; o3[id]._error = centralErrText(res); lsSet(lsKey('centralTrxOverlay'), o3); } }
    return false;
  });
}
function centralCleanOverlay_(){
  if(!centralOpLoaded_('transaksi')) return;
  const ov = centralOverlayGet(); let ch = false;
  Object.keys(ov).forEach(k=>{ if(ov[k]._pushed){ delete ov[k]; ch = true; } });
  if(ch) lsSet(lsKey('centralTrxOverlay'), ov);
}
function centralPushTrxBatch_(list){
  if(!ServerBridge.opCreateTxBatch) return list.reduce((p,t)=>p.then(()=>centralPushTrx_(t)), Promise.resolve(false));
  const items = list.map(t=>{
    const alk = Store.loadAlokasi().filter(a=>a.transaksiId===t.id && !a._synced);
    const payload = buildBridgePayloadFromTransaksi_(t);
    payload.clientRequestId = 'ui_' + t.id;
    if(t.jenis === 'PENERIMAAN' && alk.length){
      payload.allocations = alk.map(a=>({siswaId:a.siswaId, komponenId:a.komponenId, periode:a.periode||undefined, nominal:a.nominal, caraBayar:a.caraBayar||undefined, tagihanId:a.tagihanId||undefined}));
      const sis = new Set(alk.map(a=>a.siswaId));
      if(sis.size > 1) payload.siswaId = undefined; else if(!payload.siswaId) payload.siswaId = alk[0].siswaId;
    }
    return {t:t, alk:alk, item:{kind:t.jenis === 'PENERIMAAN' ? 'income' : 'expense', payload:payload}};
  });
  return ServerBridge.opCreateTxBatch(JSON.parse(JSON.stringify(items.map(x=>x.item)))).then(function(res){
    if(!res || !res.ok || !res.data){ items.forEach(x=>centralMarkError_('trx', x.t.id, res)); return false; }
    let any = false;
    res.data.results.forEach(function(r, i){
      const x = items[i]; if(!x) return;
      if(r && r.ok && r.id){ centralMarkTrxSynced_(x.t, r.id, x.alk); any = true; }
      else centralMarkError_('trx', x.t.id, r || {code:'SERVER_ERROR', message:'tidak ada hasil'});
    });
    return any;
  });
}
function centralSyncActive_(){ return centralTxWriteActive() || ccWriteActive_(); }
function centralAfterRefresh(fn){ CentralSync.after.push(fn); }
function centralRunSync(manual){
  if(!centralSyncActive_()) return Promise.resolve(false);
  if(CentralSync.running){ CentralSync.again = true; return Promise.resolve(false); }
  if(manual){
    const t = Store.loadTransaksi(); let c = false; t.forEach(x=>{ if(x._pendingSync && x._syncBlocked){ delete x._syncBlocked; x._syncAttempts = 0; c = true; } });
    if(c) Store.saveTransaksi(t);
    const a = Store.loadAlokasi(); c = false; a.forEach(x=>{ if(x._pendingSync && x._syncBlocked){ delete x._syncBlocked; x._syncAttempts = 0; c = true; } });
    if(c) Store.saveAlokasi(a);
    centralUnblockExtra_();
  }
  CentralSync.running = true; CentralSync.lastError = null; CentralSync.refresh = new Set(); CentralSync.after = []; CentralSync.afterMaster = [];
  const jobs = [];
  centralMasterJobs_().forEach(j=>jobs.push(j));
  if(centralTxWriteActive()){
    const pt = centralPendingTrx_().filter(t=>!t._syncBlocked);
    for(let i = 0; i < pt.length; i += 20){ const chunk = pt.slice(i, i + 20); jobs.push(()=>centralPushTrxBatch_(chunk)); }
    Object.keys(centralOverlayGet()).forEach(id=>jobs.push(()=>centralPushPatch_(id)));
    centralArchiveJobs_().forEach(j=>jobs.push(j));
    centralPendingAlk_().forEach(a=>jobs.push(()=>centralPushAlk_(a)));
  }
  centralCollectionJobs_().forEach(j=>jobs.push(j));
  centralSettingsJobs_().forEach(j=>jobs.push(j));
  centralAuditJobs_().forEach(j=>jobs.push(j));
  let changed = false, chain = Promise.resolve();
  jobs.forEach(job=>{ chain = chain.then(job).then(function(r){ if(r) changed = true; }, function(e){ CentralSync.lastError = String((e && e.message) || e); }); });
  return chain.then(function(){
    CentralSync.lastRunAt = new Date().toISOString();
    if(changed){ CentralSync.refresh.add('transaksi'); CentralSync.refresh.add('alokasi'); }
    const keys = Array.from(CentralSync.refresh);
    return keys.length ? loadOperationalData(keys) : Promise.resolve();
  }).then(function(){
    CentralSync.after.forEach(fn=>{ try{ fn(); }catch(e){ console.error('after-refresh gagal:', e); } });
    centralCleanOverlay_(); centralCleanArchive_();
    return CentralSync.masterDirty ? loadCentralMasterData({skipOperational:true}) : null;
  }).then(function(){
    CentralSync.afterMaster.forEach(fn=>{ try{ fn(); }catch(e){ console.error('after-master gagal:', e); } });
    CentralSync.afterMaster = [];
    CentralSync.masterDirty = false; CentralSync.running = false;
    renderAuthStatusBadge();
    if(changed) centralRerenderIfIdle();
    if(CentralSync.again){ CentralSync.again = false; centralScheduleSync(); }
    return changed;
  });
}
/* Ubah atribut transaksi. Baris lokal murni -> ubah lokal (perilaku lama).
   Baris yang ada di server -> overlay tertunda lalu opUpdateTransaction. */
function centralPatchTransaksi(trxId, patch){
  const id = centralResolveTrxId(trxId);
  const arr = Store.loadTransaksi(); const li = arr.findIndex(t=>t.id===trxId);
  const serverSide = centralIsServerTrx(id);
  if(li >= 0 && !serverSide){
    const before = deepClone(arr[li]); Object.assign(arr[li], patch); Store.saveTransaksi(arr);
    return {before:before, after:arr[li]};
  }
  if(!serverSide || !centralTxWriteActive()) throw new Error('Transaksi tidak ditemukan');
  const cur = transaksiById(id); const before = deepClone(cur);
  const ov = centralOverlayGet(); ov[id] = Object.assign({}, ov[id] || {}, patch); delete ov[id]._pushed;
  lsSet(lsKey('centralTrxOverlay'), ov);
  centralScheduleSync();
  return {before:before, after:Object.assign({}, cur, patch)};
}

/* ---- WRITE (master): lewat server (validasi + lock + audit di server) ---- */
function centralMasterSave(key, id, data, okMsg){
  const rec = {};
  (MASTER_WRITE_FIELDS[key] || []).forEach(f=>{ if(data[f] !== undefined) rec[f] = data[f]; });
  if(id) rec.id = id;
  toast('Menyimpan ke Google Sheets...');
  return ServerBridge.opMasterUpsert(key, JSON.parse(JSON.stringify(rec))).then(function(res){
    if(!res || !res.ok){ toast('Gagal menyimpan: ' + centralErrText(res)); return false; }
    closeModal(); toast(okMsg + (res.auditWarning ? ' (peringatan: audit aktor gagal)' : ''));
    return loadCentralMasterData({skipOperational:true}).then(function(){ renderContent(); return true; });
  });
}
function centralMasterToggle(key, id, list, onMsg, offMsg){
  const cur = list.find(x=>x.id===id); if(!cur) return;
  const next = cur.status === 'Nonaktif' ? 'Aktif' : 'Nonaktif';
  return centralMasterSave(key, id, {status:next}, next === 'Aktif' ? onMsg : offMsg);
}
