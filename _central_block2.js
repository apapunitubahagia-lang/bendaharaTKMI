/* ============================================================
   15d. COLLECTION FACADE + SETTINGS/BLOB/AUDIT SYNC + REVERSAL + LEGACY MIGRATION + PUSAT DATA
   Store.loadX()/saveX() untuk koleksi operasional dipertahankan sebagai ANTARMUKA, tetapi saat mode pusat
   aktif sumber kebenarannya Google Sheets:
   - load  = baris server (cache) + operasi tertunda + baris lokal lama yang belum dimigrasi
   - save  = DIFF terhadap tampilan saat ini -> operasi upsert/archive tertunda -> dikirim ke server (idempoten, ID sama)
   - tidak ada hard delete: "hapus" = arsip (archivedAt) di sheet
   Seluruh pemakai lama (read-modify-write) tetap berfungsi tanpa diubah.
   ============================================================ */
const CC_ = {
  anggaran:{store:'Anggaran', key:'anggaran', num:['nominal','volume','hargaSatuan','sourceRow']},
  rkat:{store:'Rkat', key:'rkat', num:['tahun','volume','hargaSatuan','pagu','sourceRow']},
  lpj:{store:'Lpj', key:'lpj', num:['volume','hargaSatuan','diskon','nominal','sourceRow'], nul:['transaksiId']},
  mutasiBank:{store:'MutasiBank', key:'mutasiBank', num:['nominal'], nul:['transaksiId']},
  rekonsiliasi:{store:'Rekonsiliasi', key:'rekonsiliasi', num:['saldoSistem','saldoAktual','selisih']},
  dokumen:{store:'Dokumen', key:'bukti', nul:['transaksiId']},
  laporan:{store:'Laporan', key:'laporan', json:['snapshot']},
  kpiSnapshot:{store:'KpiSnapshot', key:'kpi', num:['skor']},
  obligasi:{store:'Obligasi', key:'komitmen', num:['nominal'], nul:['rabId']},
  tagihan:{store:'Tagihan', key:'kewajiban', custom:'tagihan'},
  importQueue:{store:'ImportQueue', key:'dupReview', custom:'importQueue'}
};
const CC_BLOBS = { keringananAssignment:{store:'KeringananAssignment', def:[]}, periodClosing:{store:'PeriodClosing', def:[]}, kpiTarget:{store:'KpiTarget', def:{}},
  checklistTpl:{store:'ChecklistTemplates', def:[]}, checklistInst:{store:'ChecklistInstances', def:[]}, kendala:{store:'Kendala', def:[]},
  cateringHari:{store:'CateringHari', def:{}}, pendaftaranStatus:{store:'PendaftaranStatus', def:[]} };
const SETTINGS_SYNC_KEYS = ['sekolah','yayasan','alamat','namaBendahara','jabatanBendahara','namaKepalaSekolah','nipKepalaSekolah','periodeAktif','tahunAjaranAktif','unitList','keringananPolicyList','budgetNearLimitPct','kebijakanEnrollmentTengahPeriode','docSeqCounters'];
const CC_ORIG_ = {};
const CC_MEM = { blobs:{}, memo:{}, dropped:{}, schemaChecked:null, legacy:null };
const CC_PERMANENT_ = {VALIDATION_ERROR:1, UNKNOWN_FIELD:1, VALUE_TOO_LARGE:1, SCHEMA_ADDITIVE_REQUIRED:1, SCHEMA_MISMATCH:1, NOT_FOUND:1, DUPLICATE:1, ROLE_NOT_ALLOWED:1, USER_NOT_FOUND:1, USER_INACTIVE:1, AUTH_REQUIRED:1, OBLIGATION_NOT_FOUND:1, ALLOCATION_EXCEEDS_OBLIGATION:1, ALLOCATION_EXCEEDS_TRANSACTION:1, CONFIRM_REQUIRED:1, TOTALS_MISMATCH:1, PLAN_CONFLICT:1};

function ccStr_(v){ return (v===null || v===undefined) ? '' : String(v); }
function ccPendKey_(name){ return lsKey('central_pending_' + name); }
function ccPend_(name){ return lsGet(ccPendKey_(name), {}); }
function ccPendSet_(name, p){ lsSet(ccPendKey_(name), p); }
function centralCutoverDone_(){ return !!lsGet(lsKey('centralCutover'), null); }
function ccState_(name){ return OperationalCache.states[CC_[name].key]; }
function ccWriteActive_(){ return CENTRAL_CONFIG.writeCollections && centralReady_() && !!ServerBridge.opRecordBatch; }
function ccActive_(name){ const st = ccState_(name); return ccWriteActive_() && CENTRAL_CONFIG.readOperational && !!st && st.loaded && !st.error; }
function ccSettingsActive_(){ return CENTRAL_CONFIG.writeSettings && centralReady_() && CentralMasterData.ready === true && !!ServerBridge.opSettingsUpsert; }

/* ---- konversi baris sheet <-> objek lokal ---- */
function ccFromRow_(name, r){
  const c = CC_[name];
  if(c.custom === 'tagihan'){
    if(!ccStr_(r.tagihanId)) return null;
    let pot = []; const ps = ccStr_(r.potongan);
    if(ps.charAt(0) === '['){ try{ pot = JSON.parse(ps); }catch(e){} }
    const k = komponenById(ccStr_(r.komponenId));
    return {id:ccStr_(r.id), siswaId:ccStr_(r.siswaId), komponen:k ? k.nama : ccStr_(r.komponenId), periode:ccStr_(r.periode), tagihanBruto:Number(r.bruto)||0, potongan:pot,
      tagihanNetto:Number(r.netto)||0, jatuhTempo:ccStr_(r.jatuhTempo), tahunAjaran:ccStr_(r.tahunAjaran), _computedAt:ccStr_(r.computedAt),
      kelas:ccStr_(r.kelas), unit:ccStr_(r.unit), tarifId:ccStr_(r.tarifId), tarifSatuan:(r.tarifSatuan === '' || r.tarifSatuan === undefined || r.tarifSatuan === null) ? null : Number(r.tarifSatuan), jumlahHari:(r.jumlahHari === '' || r.jumlahHari === undefined || r.jumlahHari === null) ? null : Number(r.jumlahHari)};
  }
  if(c.custom === 'importQueue'){
    try{ const p = JSON.parse(ccStr_(r.payload)); if(p && typeof p === 'object'){ p.id = ccStr_(r.id); return p; } }catch(e){}
    return {id:ccStr_(r.id), type:ccStr_(r.type), resolved:ccStr_(r.status) === 'RESOLVED'};
  }
  const o = Object.assign({}, r);
  delete o.archivedAt; delete o.archivedBy; delete o.archiveReason;
  (c.num || []).forEach(f=>{ if(o[f] !== undefined && o[f] !== '' && isFinite(Number(o[f]))) o[f] = Number(o[f]); });
  (c.nul || []).forEach(f=>{ if(o[f] === '') o[f] = null; });
  (c.json || []).forEach(f=>{ if(typeof o[f] === 'string' && o[f]){ try{ o[f] = JSON.parse(o[f]); }catch(e){} } });
  return o;
}
function ccToRow_(name, o, live){
  const c = CC_[name], dropped = [];
  live = live || [];
  if(c.custom === 'tagihan'){
    const k = komponenByNama(o.komponen);
    const row = {id:o.id, siswaId:o.siswaId, komponenId:k ? k.id : ccStr_(o.komponenId), periode:o.periode, bruto:Number(o.tagihanBruto)||0, potongan:JSON.stringify(o.potongan || []),
      netto:Number(o.tagihanNetto)||0, tagihanId:o.id, computedAt:o._computedAt || new Date().toISOString(), jatuhTempo:ccStr_(o.jatuhTempo), tahunAjaran:ccStr_(o.tahunAjaran)};
    // field tarif/hari yang dipakai: ikut ditulis bila kolomnya ada; bila ada nilai tapi kolom belum ada -> dropped (operasi diblokir sampai migrasi aditif, tidak hilang diam-diam)
    [['kelas', ccStr_(o.kelas)], ['unit', ccStr_(o.unit)], ['tarifId', ccStr_(o.tarifId)], ['tarifSatuan', o.tarifSatuan === null || o.tarifSatuan === undefined ? '' : Number(o.tarifSatuan)], ['jumlahHari', o.jumlahHari === null || o.jumlahHari === undefined ? '' : Number(o.jumlahHari)]].forEach(function(kv){
      if(live.length && live.indexOf(kv[0]) === -1){ if(kv[1] !== '') dropped.push(kv[0]); } else row[kv[0]] = kv[1];
    });
    return {row:row, dropped:dropped};
  }
  if(c.custom === 'importQueue'){
    return {row:{id:o.id, pairKey:ccStr_(o.pairKey), trxId1:ccStr_(o.trxId1), trxId2:ccStr_(o.trxId2), status:o.resolved ? 'RESOLVED' : 'PENDING', decidedAt:ccStr_(o.resolvedAt), decidedBy:'', type:ccStr_(o.type), payload:JSON.stringify(o)}, dropped:[]};
  }
  const row = {};
  Object.keys(o).forEach(function(k){
    if(k.charAt(0) === '_') return;
    if(live.length && live.indexOf(k) === -1){ dropped.push(k); return; }
    let v = o[k];
    if(v === null || v === undefined) v = '';
    else if((c.num || []).indexOf(k) !== -1 && v !== '' && isFinite(Number(v))) v = Number(v);
    else if(typeof v === 'object') v = JSON.stringify(v);
    row[k] = v;
  });
  return {row:row, dropped:dropped};
}

/* ---- tampilan = server + tertunda + legacy lokal ---- */
function ccSrv_(name){
  const st = ccState_(name), m = CC_MEM.memo[name];
  if(m && m.src === st.rows) return m;
  const objs = [], ids = new Set(), arch = new Set(), byId = new Map();
  st.rows.forEach(function(r){
    const id = ccStr_(r.id); if(!id) return;
    ids.add(id);
    if(ccStr_(r.archivedAt)){ arch.add(id); return; }
    const o = ccFromRow_(name, r); if(!o) return;
    o.id = id; objs.push(o); byId.set(id, o);
  });
  CC_MEM.memo[name] = {src:st.rows, objs:objs, ids:ids, arch:arch, byId:byId};
  return CC_MEM.memo[name];
}
function ccView_(name){
  const m = ccSrv_(name), map = new Map();
  m.objs.forEach(o=>map.set(o.id, o));
  const pend = ccPend_(name);
  Object.keys(pend).forEach(function(id){ const p = pend[id]; if(p.op === 'archive') map.delete(id); else if(p.local) map.set(id, p.local); });
  if(!centralCutoverDone_()){
    CC_ORIG_[name].load().forEach(function(o){ if(!o || !o.id) return; if(map.has(o.id) || m.ids.has(o.id) || pend[o.id]) return; map.set(o.id, o); });
  }
  return JSON.parse(JSON.stringify(Array.from(map.values())));
}
function ccSave_(name, arr, promoteLegacy){
  const view = ccView_(name), viewMap = new Map(view.map(o=>[o.id, o]));
  const m = ccSrv_(name), live = ccState_(name).headers || [];
  const pend = ccPend_(name), legacy = CC_ORIG_[name].load(), legacyIds = new Set(legacy.map(o=>o && o.id));
  let legacyOut = legacy.slice(), legacyChanged = false;
  const keep = new Set();
  arr.forEach(function(o0){
    if(!o0) return;
    const o = JSON.parse(JSON.stringify(o0));
    if(!o.id){ o.id = uid(name.slice(0, 4)); o0.id = o.id; }
    keep.add(o.id);
    const prev = viewMap.get(o.id);
    let need = false;
    if(!prev) need = true;
    else if(promoteLegacy && legacyIds.has(o.id) && !m.ids.has(o.id) && !pend[o.id]) need = true; // migrasi eksplisit: baris lokal lama -> antrean
    else need = JSON.stringify(ccToRow_(name, prev, live).row) !== JSON.stringify(ccToRow_(name, o, live).row);
    if(!need) return;
    const conv = ccToRow_(name, o, live);
    if(conv.dropped.length) CC_MEM.dropped[name] = Array.from(new Set((CC_MEM.dropped[name] || []).concat(conv.dropped)));
    const p = {op:'upsert', local:o, attempts:0};
    const lost = ccLostFields_(conv, o);
    if(lost.length){ p.blocked = true; p.needsSchema = true; p.error = 'Kolom belum ada di sheet: ' + lost.join(', ') + ' - jalankan Migrasi Skema Aditif (Pusat Data)'; }
    if(name === 'dokumen' && typeof o.fileRef === 'string' && o.fileRef.indexOf('data:') === 0){ CC_MEM.blobs[o.id] = o.fileRef; o.fileRef = ''; p.blobKey = o.id; p.local = o; }
    pend[o.id] = p;
    if(legacyIds.has(o.id)){ legacyOut = legacyOut.filter(x=>x && x.id !== o.id); legacyChanged = true; }
  });
  view.forEach(function(prev){
    if(keep.has(prev.id)) return;
    if(m.ids.has(prev.id) && !m.arch.has(prev.id)) pend[prev.id] = {op:'archive', reason:'dihapus dari aplikasi', local:null, attempts:0};
    else { delete pend[prev.id]; if(legacyIds.has(prev.id)){ legacyOut = legacyOut.filter(x=>x && x.id !== prev.id); legacyChanged = true; } }
  });
  ccPendSet_(name, pend);
  if(legacyChanged) CC_ORIG_[name].save(legacyOut);
  centralScheduleSync();
}
function ccLostFields_(conv, o){ return conv.dropped.filter(function(k){ const v = o[k]; return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length); }); }
function ccIsLocalPendingTrx_(id){ const map = centralSyncMapGet(); if(map[id]) return false; return Store.loadTransaksi().some(t=>t.id === id && t._pendingSync && !t._synced); }
function ccMarkErr_(name, id, res){
  const pend = ccPend_(name), p = pend[id]; if(!p) return;
  p.error = centralErrText(res); p.attempts = (p.attempts || 0) + 1;
  if(!(res && CENTRAL_RETRYABLE_[res.code]) || p.attempts >= 3) p.blocked = true;
  if(res && res.code && CC_PERMANENT_[res.code]) p.blocked = true;
  ccPendSet_(name, pend); CentralSync.lastError = p.error;
}
function ccDataUrlParts_(d){ const m = /^data:([^;,]+);base64,(.*)$/.exec(d || ''); return m ? {mime:m[1], b64:m[2]} : null; }
function ccPushBukti_(id, p){
  const blob = CC_MEM.blobs[id], parts = ccDataUrlParts_(blob);
  if(!parts){ const pend = ccPend_('dokumen'); if(pend[id]){ pend[id].blocked = true; pend[id].error = 'File bukti tidak tersedia lagi (halaman dimuat ulang) - lampirkan ulang'; ccPendSet_('dokumen', pend); } return Promise.resolve(false); }
  const o = p.local, ext = {'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'}[parts.mime] || '';
  if(!ServerBridge.opUploadBukti){ ccMarkErr_('dokumen', id, {code:'SERVER_ERROR', message:'opUploadBukti belum tersedia'}); return Promise.resolve(false); }
  const trxId = o.transaksiId ? centralResolveTrxId(o.transaksiId) : '';
  return ServerBridge.opUploadBukti(JSON.parse(JSON.stringify({id:id, mimeType:parts.mime, base64:parts.b64, fileName:(ccStr_(o.judul) || id) + ext, transaksiId:trxId, kategori:o.kategori, judul:o.judul, tanggal:o.tanggal}))).then(function(res){
    if(res && res.ok){
      CentralSync.refresh.add('bukti');
      centralAfterRefresh(function(){ const pp = ccPend_('dokumen'); delete pp[id]; ccPendSet_('dokumen', pp); delete CC_MEM.blobs[id]; });
      return true;
    }
    ccMarkErr_('dokumen', id, res); return false;
  });
}
function ccPush_(name){
  const key = CC_[name].key, pend = ccPend_(name), live = ccState_(name).headers || [];
  const ids = Object.keys(pend).filter(id=>!pend[id].blocked);
  const ops = [], meta = [], jobs = [];
  ids.forEach(function(id){
    const p = pend[id];
    if(p.op === 'archive'){ ops.push({op:'archive', id:id, reason:p.reason}); meta.push(id); return; }
    const o = p.local; if(!o) return;
    if(name === 'dokumen' && p.blobKey){ if(!(o.transaksiId && ccIsLocalPendingTrx_(o.transaksiId))) jobs.push(()=>ccPushBukti_(id, p)); return; }
    const conv = ccToRow_(name, o, live), lost = ccLostFields_(conv, o);
    if(lost.length){ p.blocked = true; p.needsSchema = true; p.error = 'Kolom belum ada di sheet: ' + lost.join(', ') + ' - jalankan Migrasi Skema Aditif (Pusat Data)'; return; }
    const row = conv.row;
    if(row.transaksiId){ if(ccIsLocalPendingTrx_(row.transaksiId)) return; row.transaksiId = centralResolveTrxId(row.transaksiId); }
    ops.push({op:'upsert', id:id, row:row}); meta.push(id);
  });
  ccPendSet_(name, pend);
  for(let i = 0; i < ops.length; i += 100){
    const so = ops.slice(i, i + 100), sm = meta.slice(i, i + 100);
    jobs.push(function(){
      return ServerBridge.opRecordBatch(key, JSON.parse(JSON.stringify(so))).then(function(res){
        if(!res || !res.ok || !res.data){ sm.forEach(id=>ccMarkErr_(name, id, res)); return false; }
        const okIds = []; let any = false;
        res.data.results.forEach(function(r, k){ const id = sm[k]; if(r && r.ok){ okIds.push(id); any = true; } else ccMarkErr_(name, id, r || {code:'SERVER_ERROR'}); });
        if(okIds.length){ CentralSync.refresh.add(key); centralAfterRefresh(function(){ const pp = ccPend_(name); okIds.forEach(id=>{ delete pp[id]; }); ccPendSet_(name, pp); }); }
        return any;
      });
    });
  }
  return jobs.reduce((pr, j)=>pr.then(function(acc){ return j().then(r=>acc || r); }), Promise.resolve(false));
}
function centralCollectionJobs_(){
  if(!ccWriteActive_()) return [];
  const jobs = [];
  Object.keys(CC_).forEach(function(name){
    if(!ccActive_(name)) return;
    const pend = ccPend_(name);
    if(Object.keys(pend).some(id=>!pend[id].blocked)) jobs.push(()=>ccPush_(name));
  });
  return jobs;
}

/* ---- blob (koleksi kecil tanpa sheet sendiri) + settings (15_SETTINGS) ---- */
function ccSetPend_(){ return lsGet(lsKey('central_pending_settings'), {}); }
function ccSettingsMap_(){
  const m = Object.assign({}, (CentralMasterData.ready && CentralMasterData.settings) || {});
  const p = ccSetPend_(); Object.keys(p).forEach(k=>{ m[k] = p[k].value; });
  return m;
}
function ccBlobGet_(name){
  const m = ccSettingsMap_(), n = Number(m['blob.' + name + '.n']);
  if(!(n > 0)) return null;
  let s = ''; for(let i = 0; i < n; i++) s += ccStr_(m['blob.' + name + '.' + i]);
  try{ return JSON.parse(s); }catch(e){ return null; }
}
function ccBlobPut_(name, value){
  const cur = ccBlobGet_(name), s = JSON.stringify(value);
  if(cur !== null && JSON.stringify(cur) === s) return;
  const cs = 40000, chunks = Math.max(1, Math.ceil(s.length / cs)), p = ccSetPend_();
  for(let i = 0; i < chunks; i++) p['blob.' + name + '.' + i] = {value:s.slice(i * cs, (i + 1) * cs)};
  p['blob.' + name + '.n'] = {value:String(chunks)};
  lsSet(lsKey('central_pending_settings'), p); centralScheduleSync();
}
function ccParseSetting_(k, v, def){
  if(typeof def === 'number') return Number(v);
  if(def !== null && typeof def === 'object'){ try{ const r = JSON.parse(v); return r === null ? def : r; }catch(e){ return def; } }
  return v;
}
function ccSettingsLoad_(orig){
  const base = orig();
  if(!ccSettingsActive_()) return base;
  const m = ccSettingsMap_();
  SETTINGS_SYNC_KEYS.forEach(function(k){
    if(!(k in m)) return;
    const val = ccParseSetting_(k, m[k], DEFAULT_SETTINGS[k]);
    if(k === 'docSeqCounters' && val && typeof val === 'object'){ const loc = base.docSeqCounters || {}; const out = Object.assign({}, val); Object.keys(loc).forEach(c=>{ out[c] = Math.max(Number(out[c]) || 0, Number(loc[c]) || 0); }); base[k] = out; }
    else base[k] = val;
  });
  return base;
}
function ccSettingsSave_(orig, before, o){
  orig(o);
  if(!ccSettingsActive_()) return;
  const p = ccSetPend_(); let ch = false;
  SETTINGS_SYNC_KEYS.forEach(function(k){
    if(!(k in o)) return;
    const v = (o[k] !== null && typeof o[k] === 'object') ? JSON.stringify(o[k]) : String(o[k]);
    const b = (before[k] !== null && typeof before[k] === 'object') ? JSON.stringify(before[k]) : String(before[k]);
    if(v === b) return;
    p[k] = {value:v}; ch = true;
  });
  if(ch){ lsSet(lsKey('central_pending_settings'), p); centralScheduleSync(); }
}
function centralSettingsJobs_(){
  if(!ccSettingsActive_()) return [];
  const p = ccSetPend_(), keys = Object.keys(p).filter(k=>!p[k].blocked);
  const jobs = [];
  for(let i = 0; i < keys.length; i += 50){
    const chunk = keys.slice(i, i + 50);
    jobs.push(function(){
      return ServerBridge.opSettingsUpsert(JSON.parse(JSON.stringify(chunk.map(k=>({key:k, value:p[k].value}))))).then(function(res){
        if(res && res.ok){
          CentralSync.masterDirty = true;
          CentralSync.afterMaster.push(function(){ const pp = ccSetPend_(); chunk.forEach(k=>{ delete pp[k]; }); lsSet(lsKey('central_pending_settings'), pp); });
          return true;
        }
        const pp = ccSetPend_(); chunk.forEach(function(k){ if(pp[k]){ pp[k].error = centralErrText(res); pp[k].attempts = (pp[k].attempts || 0) + 1; if(!(res && CENTRAL_RETRYABLE_[res.code]) || pp[k].attempts >= 3) pp[k].blocked = true; } });
        lsSet(lsKey('central_pending_settings'), pp); CentralSync.lastError = centralErrText(res); return false;
      });
    });
  }
  return jobs;
}

/* ---- audit mirror (aksi UI -> 13_AUDIT_LOG, append-only) ---- */
function ccAuditEnqueue_(aksi, before, after, sumber){
  if(!(CENTRAL_CONFIG.writeAudit && centralReady_() && ServerBridge.opAuditAppend && CentralMasterData.ready)) return;
  const small = v=>{ if(v === null || v === undefined) return null; const s = JSON.stringify(v); return s.length > 4000 ? {truncated:true, length:s.length} : v; };
  const q = lsGet(lsKey('central_audit_queue'), []);
  q.push({aksi:String(aksi) + (sumber ? '@' + sumber : ''), before:small(before), after:small(after), refId:(after && after.id) || (before && before.id) || ''});
  while(q.length > 2000) q.shift();
  lsSet(lsKey('central_audit_queue'), q); centralScheduleSync();
}
function centralAuditJobs_(){
  if(!(CENTRAL_CONFIG.writeAudit && centralReady_() && ServerBridge.opAuditAppend)) return [];
  const q = lsGet(lsKey('central_audit_queue'), []); if(!q.length) return [];
  const jobs = [];
  for(let i = 0; i < q.length; i += 100){
    const n = Math.min(100, q.length - i);
    jobs.push(function(){
      const cur = lsGet(lsKey('central_audit_queue'), []), batch = cur.slice(0, n);
      if(!batch.length) return Promise.resolve(false);
      return ServerBridge.opAuditAppend(JSON.parse(JSON.stringify(batch))).then(function(res){
        if(res && res.ok){ const c2 = lsGet(lsKey('central_audit_queue'), []); lsSet(lsKey('central_audit_queue'), c2.slice(batch.length)); return false; }
        CentralSync.lastError = centralErrText(res); return false;
      });
    });
  }
  return jobs;
}

/* ---- master: antrean tertunda (import siswa, migrasi data lama) ---- */
const CC_MASTER_ORDER_ = ['siswa','komponen','tarif','akun','kategoriPenerimaan','kategoriPengeluaran','subkategori','tahunAjaran'];
function ccMasterPend_(key){ return lsGet(lsKey('central_pending_master_' + key), {}); }
function centralMasterQueue_(key, id, rec){
  const out = {};
  (MASTER_WRITE_FIELDS[key] || []).forEach(f=>{ if(rec[f] !== undefined) out[f] = rec[f]; });
  const p = ccMasterPend_(key);
  p[id] = {rec:Object.assign({}, p[id] ? p[id].rec : {}, out), attempts:0};
  lsSet(lsKey('central_pending_master_' + key), p); centralScheduleSync();
}
function centralMasterOverlay_(key, rows){
  if(!rows) return rows;
  const p = ccMasterPend_(key), ids = Object.keys(p);
  if(!ids.length) return rows;
  const map = new Map(rows.map(r=>[r.id, r]));
  ids.forEach(id=>{ map.set(id, Object.assign({}, map.get(id) || {id:id}, p[id].rec)); });
  return Array.from(map.values());
}
function centralMasterJobs_(){
  if(!(centralMasterWriteActive() && ServerBridge.opMasterBatch)) return [];
  const jobs = [];
  CC_MASTER_ORDER_.forEach(function(key){
    const p = ccMasterPend_(key), ids = Object.keys(p).filter(id=>!p[id].blocked);
    for(let i = 0; i < ids.length; i += 50){
      const chunk = ids.slice(i, i + 50);
      jobs.push(function(){
        return ServerBridge.opMasterBatch(key, JSON.parse(JSON.stringify(chunk.map(id=>Object.assign({id:id}, p[id].rec))))).then(function(res){
          const pp = ccMasterPend_(key);
          if(!res || !res.ok || !res.data){ chunk.forEach(id=>{ if(pp[id]){ pp[id].error = centralErrText(res); pp[id].attempts = (pp[id].attempts || 0) + 1; if(!(res && CENTRAL_RETRYABLE_[res.code]) || pp[id].attempts >= 3) pp[id].blocked = true; } }); lsSet(lsKey('central_pending_master_' + key), pp); return false; }
          const okIds = []; let any = false;
          res.data.results.forEach(function(r, k){
            const id = chunk[k];
            if(r.ok || r.code === 'DUPLICATE'){ okIds.push(id); any = any || r.ok; }
            else if(pp[id]){ pp[id].error = centralErrText(r); pp[id].attempts = (pp[id].attempts || 0) + 1; pp[id].blocked = !(CENTRAL_RETRYABLE_[r.code]) || pp[id].attempts >= 3; }
          });
          lsSet(lsKey('central_pending_master_' + key), pp);
          if(okIds.length){ CentralSync.masterDirty = true; CentralSync.afterMaster.push(function(){ const p3 = ccMasterPend_(key); okIds.forEach(id=>{ delete p3[id]; }); lsSet(lsKey('central_pending_master_' + key), p3); }); }
          return any;
        });
      });
    }
  });
  return jobs;
}

/* ---- arsip/reversal transaksi & alokasi ---- */
function centralArchiveMapGet(){ return lsGet(lsKey('central_archive'), {}); }
function centralArchiveTrx(id, reason){ const sid = centralResolveTrxId(id), m = centralArchiveMapGet(); m[sid] = {kind:'trx', reason:ccStr_(reason) || 'diarsipkan dari aplikasi'}; lsSet(lsKey('central_archive'), m); centralScheduleSync(); }
function centralArchiveAlokasi(id, reason){ const m = centralArchiveMapGet(); m[id] = {kind:'alk', reason:ccStr_(reason) || 'diarsipkan dari aplikasi'}; lsSet(lsKey('central_archive'), m); centralScheduleSync(); }
function centralArchiveJobs_(){
  const m = centralArchiveMapGet(), ids = Object.keys(m).filter(id=>!m[id].done && !m[id].blocked);
  return ids.map(function(id){
    return function(){
      const e = m[id], fn = e.kind === 'trx' ? ServerBridge.opArchiveTransaction : ServerBridge.opArchiveAllocation;
      if(!fn){ return Promise.resolve(false); }
      return fn(id, e.reason).then(function(res){
        const cur = centralArchiveMapGet();
        if(res && res.ok){ if(cur[id]){ cur[id].done = true; lsSet(lsKey('central_archive'), cur); } CentralSync.refresh.add('transaksi'); CentralSync.refresh.add('alokasi'); return true; }
        if(cur[id]){ cur[id].error = centralErrText(res); cur[id].attempts = (cur[id].attempts || 0) + 1; if(!(res && CENTRAL_RETRYABLE_[res.code]) || cur[id].attempts >= 3) cur[id].blocked = true; lsSet(lsKey('central_archive'), cur); }
        CentralSync.lastError = centralErrText(res); return false;
      });
    };
  });
}
function centralCleanArchive_(){
  if(!centralOpLoaded_('transaksi')) return;
  const m = centralArchiveMapGet(); let ch = false;
  Object.keys(m).forEach(k=>{ if(m[k].done){ delete m[k]; ch = true; } });
  if(ch) lsSet(lsKey('central_archive'), m);
}

/* ---- hitungan antrean ---- */
function centralExtraPending_(){
  let n = 0;
  Object.keys(CC_).forEach(name=>{ n += Object.keys(ccPend_(name)).length; });
  n += Object.keys(ccSetPend_()).length;
  CC_MASTER_ORDER_.forEach(k=>{ n += Object.keys(ccMasterPend_(k)).length; });
  return n;
}
function centralExtraBlocked_(){
  let n = 0;
  Object.keys(CC_).forEach(name=>{ const p = ccPend_(name); n += Object.keys(p).filter(id=>p[id].blocked).length; });
  const s = ccSetPend_(); n += Object.keys(s).filter(k=>s[k].blocked).length;
  CC_MASTER_ORDER_.forEach(k=>{ const p = ccMasterPend_(k); n += Object.keys(p).filter(id=>p[id].blocked).length; });
  const a = centralArchiveMapGet(); n += Object.keys(a).filter(id=>a[id].blocked).length;
  const ov = centralOverlayGet(); n += Object.keys(ov).filter(id=>ov[id]._blocked).length;
  return n;
}
function centralUnblockExtra_(){
  Object.keys(CC_).forEach(name=>{ const p = ccPend_(name); let c = false; Object.keys(p).forEach(id=>{ if(p[id].blocked){ delete p[id].blocked; p[id].attempts = 0; c = true; } }); if(c) ccPendSet_(name, p); });
  const s = ccSetPend_(); let c2 = false; Object.keys(s).forEach(k=>{ if(s[k].blocked){ delete s[k].blocked; s[k].attempts = 0; c2 = true; } }); if(c2) lsSet(lsKey('central_pending_settings'), s);
  CC_MASTER_ORDER_.forEach(k=>{ const p = ccMasterPend_(k); let c = false; Object.keys(p).forEach(id=>{ if(p[id].blocked){ delete p[id].blocked; p[id].attempts = 0; c = true; } }); if(c) lsSet(lsKey('central_pending_master_' + k), p); });
  const a = centralArchiveMapGet(); let c3 = false; Object.keys(a).forEach(id=>{ if(a[id].blocked){ delete a[id].blocked; a[id].attempts = 0; c3 = true; } }); if(c3) lsSet(lsKey('central_archive'), a);
  const ov = centralOverlayGet(); let c4 = false; Object.keys(ov).forEach(id=>{ if(ov[id]._blocked){ delete ov[id]._blocked; delete ov[id]._error; c4 = true; } }); if(c4) lsSet(lsKey('centralTrxOverlay'), ov);
}

/* ---- pasang fasad pada Store (antarmuka lama tetap, sumber kebenaran = pusat) ---- */
Object.keys(CC_).forEach(function(name){
  const S = CC_[name].store;
  CC_ORIG_[name] = {load:Store['load' + S].bind(Store), save:Store['save' + S].bind(Store)};
  Store['load' + S] = function(){ return ccActive_(name) ? ccView_(name) : CC_ORIG_[name].load(); };
  Store['save' + S] = function(arr){ if(ccActive_(name)) return ccSave_(name, arr); return CC_ORIG_[name].save(arr); };
});
Object.keys(CC_BLOBS).forEach(function(name){
  const S = CC_BLOBS[name].store, def = CC_BLOBS[name].def;
  CC_ORIG_['blob:' + name] = {load:Store['load' + S].bind(Store), save:Store['save' + S].bind(Store)};
  Store['load' + S] = function(){
    if(!ccSettingsActive_() || centralCutoverDone_() && ccBlobGet_(name) === null) return ccSettingsActive_() ? JSON.parse(JSON.stringify(def)) : CC_ORIG_['blob:' + name].load();
    const v = ccBlobGet_(name);
    return v === null ? CC_ORIG_['blob:' + name].load() : v;
  };
  Store['save' + S] = function(v){ if(ccSettingsActive_()) return ccBlobPut_(name, v); return CC_ORIG_['blob:' + name].save(v); };
});
(function(){
  const oLoad = Store.loadSettings.bind(Store), oSave = Store.saveSettings.bind(Store), oExport = Store.exportAllJSON.bind(Store);
  Store.loadSettings = function(){ return ccSettingsLoad_(oLoad); };
  Store.saveSettings = function(o){ const before = ccSettingsActive_() ? ccSettingsLoad_(oLoad) : null; return ccSettingsSave_(oSave, before, o); };
  Store.exportAllJSON = function(){
    if(!centralReady_() || !centralOpLoaded_('transaksi')) return oExport();
    const d = JSON.parse(oExport());
    d.transaksi = OperationalAPI.transaksi(); d.alokasi = OperationalAPI.alokasi(); d.siswa = MasterAPI.students(); d.wali = MasterAPI.guardians(); d.tarif = MasterAPI.tariffs();
    d.kategoriPenerimaanMaster = MasterAPI.incomeCategories(); d.kategoriPengeluaranMaster = MasterAPI.expenseCategories(); d.subkategoriMaster = MasterAPI.subcategories(); d.tahunAjaranMaster = MasterAPI.academicYears();
    d.settings = Store.loadSettings(); d.akunKasBank = MasterAPI.accounts(); d.komponenBiaya = MasterAPI.components();
    d.app = 'Bendahara V2 (backup dari Google Sheets)'; d.centralBackup = true;
    return JSON.stringify(d, null, 2);
  };
})();

/* ---- data lokal lama: scan / migrasi / bersihkan (eksplisit, tidak otomatis) ---- */
function centralLegacyScan(){
  const rep = {rows:{}, transaksi:{pending:0, legacy:0, onServer:0, baru:0, dupKandidat:0}, alokasi:{legacy:0, baru:0}, masters:{}};
  Object.keys(CC_).forEach(function(name){
    if(!ccActive_(name)) return;
    const local = CC_ORIG_[name].load().filter(o=>o && o.id), m = ccSrv_(name), live = ccState_(name).headers || [];
    let same = 0, diff = 0, only = 0;
    local.forEach(function(o){
      if(m.ids.has(o.id)){ const so = m.byId.get(o.id); if(!so || JSON.stringify(ccToRow_(name, so, live).row) === JSON.stringify(ccToRow_(name, o, live).row)) same++; else diff++; }
      else only++;
    });
    rep.rows[name] = {local:local.length, same:same, diff:diff, baru:only};
  });
  if(centralOpLoaded_('transaksi')){
    const srv = OperationalAPI.transaksi().filter(t=>OperationalAPI.isServerTrx(t.id)), ids = new Set(srv.map(t=>t.id));
    const sig = t=>[t.jenis, t.tanggal, Number(t.nominal), t.akunId, t.siswaId || ''].join('|'), sigs = new Set(srv.map(sig));
    const map = centralSyncMapGet();
    Store.loadTransaksi().forEach(function(t){
      if(t._synced || map[t.id]) return;
      if(t.jenis !== 'PENERIMAAN' && t.jenis !== 'PENGELUARAN') return;
      if(t._pendingSync){ rep.transaksi.pending++; return; }
      if(ids.has(t.id)){ rep.transaksi.onServer++; return; }
      rep.transaksi.legacy++; rep.transaksi.baru++;
      if(sigs.has(sig(t))) rep.transaksi.dupKandidat++;
    });
    const aIds = new Set(OperationalAPI.alokasi().map(a=>a.id));
    Store.loadAlokasi().forEach(a=>{ if(a._synced || a._pendingSync) return; rep.alokasi.legacy++; if(!aIds.has(a.id)) rep.alokasi.baru++; });
  }
  const rawSet = lsGet(lsKey('settings'), {});
  const mm = [['siswa', 'students', Store.loadSiswa()], ['komponen', 'components', rawSet.komponenBiayaList || []], ['tarif', 'tariffs', Store.loadTarif()], ['akun', 'accounts', rawSet.akunKasBankList || []],
    ['kategoriPenerimaan', 'incomeCategories', Store.loadKategoriPenerimaanMaster()], ['kategoriPengeluaran', 'expenseCategories', Store.loadKategoriPengeluaranMaster()],
    ['subkategori', 'subcategories', Store.loadSubkategoriMaster()], ['tahunAjaran', 'academicYears', Store.loadTahunAjaranMaster()]];
  mm.forEach(function(x){
    if(!CentralMasterData.ready) return;
    const srvIds = new Set((CentralMasterData[x[1]] || []).map(r=>String(r.id !== undefined ? r.id : r.waliId)));
    const loc = (x[2] || []).filter(r=>r && r.id);
    rep.masters[x[0]] = {local:loc.length, onServer:loc.filter(r=>srvIds.has(String(r.id))).length, baru:loc.filter(r=>!srvIds.has(String(r.id))).length};
  });
  CC_MEM.legacy = rep; return rep;
}
function centralLegacyMigrate(opts){
  opts = opts || {};
  const rep = centralLegacyScan(), done = {rows:0, transaksi:0, alokasi:0, masters:0, dupDilewati:0};
  Object.keys(CC_).forEach(function(name){
    if(!ccActive_(name)) return;
    const local = CC_ORIG_[name].load().filter(o=>o && o.id), m = ccSrv_(name);
    const only = local.filter(o=>!m.ids.has(o.id));
    if(only.length){ ccSave_(name, ccView_(name), true); done.rows += only.length; } // ccSave_ mempromosikan baris lokal baru menjadi operasi tertunda
  });
  if(centralOpLoaded_('transaksi')){
    const srv = OperationalAPI.transaksi().filter(t=>OperationalAPI.isServerTrx(t.id)), ids = new Set(srv.map(t=>t.id));
    const sig = t=>[t.jenis, t.tanggal, Number(t.nominal), t.akunId, t.siswaId || ''].join('|'), sigs = new Set(srv.map(sig));
    const map = centralSyncMapGet(), arr = Store.loadTransaksi(), flagged = new Set();
    arr.forEach(function(t){
      if(t._synced || map[t.id] || t._pendingSync || ids.has(t.id)) return;
      if(t.jenis !== 'PENERIMAAN' && t.jenis !== 'PENGELUARAN') return;
      if(sigs.has(sig(t)) && !opts.includeDup){ done.dupDilewati++; return; }
      t._pendingSync = true; flagged.add(t.id); done.transaksi++;
    });
    Store.saveTransaksi(arr);
    const al = Store.loadAlokasi(); al.forEach(a=>{ if(flagged.has(a.transaksiId) && !a._synced){ a._pendingSync = true; done.alokasi++; } }); Store.saveAlokasi(al);
  }
  if(CentralMasterData.ready){
    const rawSet = lsGet(lsKey('settings'), {});
    const mm = [['siswa', 'students', Store.loadSiswa()], ['komponen', 'components', rawSet.komponenBiayaList || []], ['tarif', 'tariffs', Store.loadTarif()], ['akun', 'accounts', rawSet.akunKasBankList || []],
      ['kategoriPenerimaan', 'incomeCategories', Store.loadKategoriPenerimaanMaster()], ['kategoriPengeluaran', 'expenseCategories', Store.loadKategoriPengeluaranMaster()],
      ['subkategori', 'subcategories', Store.loadSubkategoriMaster()], ['tahunAjaran', 'academicYears', Store.loadTahunAjaranMaster()]];
    mm.forEach(function(x){
      const srvIds = new Set((CentralMasterData[x[1]] || []).map(r=>String(r.id)));
      (x[2] || []).forEach(function(r){ if(r && r.id && !srvIds.has(String(r.id))){ centralMasterQueue_(x[0], String(r.id), r); done.masters++; } });
    });
  }
  auditTrailPush('MIGRASI_DATA_LOKAL_KE_PUSAT', null, {scan:rep, hasil:done}, 'central-migrate');
  centralScheduleSync();
  return {scan:rep, done:done};
}
function centralLegacyClean(){
  const removed = {rows:0, transaksi:0, alokasi:0, masters:0};
  Object.keys(CC_).forEach(function(name){
    if(!ccActive_(name)) return;
    const local = CC_ORIG_[name].load(), m = ccSrv_(name), pend = ccPend_(name);
    const keepRows = local.filter(o=>!(o && o.id && m.ids.has(o.id) && !pend[o.id]));
    removed.rows += local.length - keepRows.length;
    if(keepRows.length !== local.length) CC_ORIG_[name].save(keepRows);
  });
  if(centralOpLoaded_('transaksi')){
    const map = centralSyncMapGet(), ids = new Set(OperationalAPI.transaksi().filter(t=>OperationalAPI.isServerTrx(t.id)).map(t=>t.id));
    const t0 = Store.loadTransaksi(), t1 = t0.filter(t=>!((t._synced && map[t.id]) || (ids.has(t.id) && !t._pendingSync)));
    removed.transaksi = t0.length - t1.length; if(t1.length !== t0.length) Store.saveTransaksi(t1);
    const a0 = Store.loadAlokasi(), aIds = new Set(OperationalAPI.alokasi().filter(a=>OperationalAPI.isServerAlokasi(a.id)).map(a=>a.id));
    const a1 = a0.filter(a=>!(a._synced || (aIds.has(a.id) && !a._pendingSync)));
    removed.alokasi = a0.length - a1.length; if(a1.length !== a0.length) Store.saveAlokasi(a1);
  }
  if(CentralMasterData.ready){
    const sets = [['siswa', 'students', Store.loadSiswa, Store.saveSiswa], ['tarif', 'tariffs', Store.loadTarif, Store.saveTarif], ['kategoriPenerimaan', 'incomeCategories', Store.loadKategoriPenerimaanMaster, Store.saveKategoriPenerimaanMaster],
      ['kategoriPengeluaran', 'expenseCategories', Store.loadKategoriPengeluaranMaster, Store.saveKategoriPengeluaranMaster], ['subkategori', 'subcategories', Store.loadSubkategoriMaster, Store.saveSubkategoriMaster], ['tahunAjaran', 'academicYears', Store.loadTahunAjaranMaster, Store.saveTahunAjaranMaster]];
    sets.forEach(function(x){
      const srvIds = new Set((CentralMasterData[x[1]] || []).map(r=>String(r.id))), pend = ccMasterPend_(x[0]);
      const l0 = x[2].call(Store), l1 = l0.filter(r=>!(r && srvIds.has(String(r.id)) && !pend[r.id]));
      removed.masters += l0.length - l1.length; if(l1.length !== l0.length) x[3].call(Store, l1);
    });
  }
  auditTrailPush('BERSIHKAN_SALINAN_LOKAL', null, removed, 'central-migrate');
  return removed;
}

/* ---- kewajiban: verifikasi server vs klien, snapshot ---- */
function centralVerifyObligations(periode){
  /* Tanpa argumen: bandingkan periode aktif + SEMUA kewajiban non-bulanan (Tahun Ajaran / SekaliBayar) supaya tarif tahunan, biaya masuk,
     katering per hari, klasifikasi, dan riwayat beku ikut diverifikasi klien vs server. Dengan argumen: satu periode saja. */
  const aktif = Store.loadSettings().periodeAktif, scope = periode ? (p=>p === periode) : (p=>p === aktif || !fccIsMonthLabel_(p));
  if(!ServerBridge || !ServerBridge.opObligations) return Promise.resolve({ok:false, message:'opObligations belum tersedia'});
  return ServerBridge.opObligations(periode ? {periode:periode} : {}).then(function(res){
    if(!res || !res.ok) return {ok:false, message:centralErrText(res)};
    const cli = {};
    allObligationsAllSiswa(periode || undefined).filter(ob=>scope(ob.periode)).forEach(ob=>{ cli[ob.key] = {bruto:Number(ob.bruto) || 0, netto:Number(ob.netto) || 0, terbayar:alokasiTerbayar(ob), sisa:sisaObligation(ob), hari:ob.jumlahHari === undefined ? null : ob.jumlahHari}; });
    const diffs = [], srvKeys = new Set(); let nSrv = 0;
    res.data.rows.filter(r=>scope(r.periode)).forEach(function(r){
      nSrv++; srvKeys.add(r.key); const c = cli[r.key];
      if(!c) diffs.push({key:r.key, jenis:'HANYA_DI_SERVER'});
      else {
        ['bruto', 'netto', 'terbayar', 'sisa'].forEach(f=>{ if(Math.abs(c[f] - r[f]) > 0.5) diffs.push({key:r.key, jenis:'BEDA_' + f, klien:c[f], server:r[f]}); });
        if((c.hari === null ? null : Number(c.hari)) !== (r.jumlahHari === null || r.jumlahHari === undefined ? null : Number(r.jumlahHari))) diffs.push({key:r.key, jenis:'BEDA_jumlahHari', klien:c.hari, server:r.jumlahHari});
      }
    });
    Object.keys(cli).forEach(k=>{ if(!srvKeys.has(k)) diffs.push({key:k, jenis:'HANYA_DI_KLIEN'}); });
    return {ok:true, periode:periode || (aktif + ' + semua non-bulanan'), jumlahServer:nSrv, jumlahKlien:Object.keys(cli).length, diffs:diffs, totalsServer:res.data.totals};
  });
}
function centralSnapshotKpi(periode){
  periode = periode || Store.loadSettings().periodeAktif;
  const summary = kpiIndukSummary(periode), now = new Date().toISOString(), safe = periode.replace(/[^A-Za-z0-9]+/g, '_');
  const arr = Store.loadKpiSnapshot();
  summary.rows.forEach(function(r){
    const row = {id:'kpi_' + safe + '_' + r.kode, periode:periode, kpiKode:r.kode, indikatorKode:'', skor:r.skor == null ? '' : r.skor, status:r.status, computedAt:now};
    const i = arr.findIndex(x=>x.id === row.id);
    if(i >= 0){ if(arr[i].skor === row.skor && arr[i].status === row.status) return; arr[i] = row; } else arr.push(row);
  });
  Store.saveKpiSnapshot(arr);
  auditTrailPush('SNAPSHOT_KPI', null, {periode:periode, jumlah:summary.rows.length}, 'manual');
  return summary.rows.length;
}

/* ---- Financial Control Center ---- */
function centralFccTagihan_(anggaran, periode){
  const ta = fccTaOfPeriode_(periode), pers = new Set(), out = [];
  anggaran.forEach(function(a){ if(a.jenis !== 'PEMASUKAN' || a.archivedAt) return; const p = String(a.periode || ''); if(p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta))) pers.add(p); });
  const unitOf = {}; MasterAPI.students().forEach(s=>{ unitOf[s.id] = s.unit; });
  pers.forEach(function(p){ allObligationsAllSiswa(p).forEach(function(o){ out.push({komponenId:o.komponenId, unit:unitOf[o.siswaId] || '', periode:o.periode, netto:o.netto}); }); });
  return out;
}
function centralFccData_(periode){
  const anggaran = Store.loadAnggaran();
  return {transaksi:allTransaksi(), akun:akunList(), anggaran:anggaran, komitmen:Store.loadObligasi(), rkat:Store.loadRkat(), rekonsiliasi:Store.loadRekonsiliasi(),
    alokasi:OperationalAPI.alokasi(), komponen:MasterAPI.components(), kategoriPengeluaran:MasterAPI.expenseCategories(), tagihan:centralFccTagihan_(anggaran, periode || Store.loadSettings().periodeAktif)};
}
function renderFinancialControl(){
  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));
  let html = '<div class="card"><h3>Kontrol Keuangan - ' + esc(periode) + '</h3>' +
    '<p class="small-muted">Dihitung dari data Google Sheets (cache sesi ini). Bukan "surplus": posisi AKTUAL dipisahkan dari KOMITMEN, RENCANA, dan biaya yang BELUM TERCATAT.</p>' +
    '<div class="tiles">' + tile('Actual Cash Position', fmtRp(r.actual.cashPosition), r.completeness.pct < 100 ? 'warn' : 'good') +
    tile('Penerimaan Aktual (periode)', fmtRp(r.actual.incomePeriode), '') + tile('Pengeluaran Aktual (periode)', fmtRp(r.actual.expensePeriode), '') +
    tile('Komitmen (COMMITTED + INCURRED)', fmtRp(r.committed.total), r.committed.total ? 'warn' : '') + tile('Biaya Diharapkan (EXPECTED)', fmtRp(r.expected.expectedCost), '') +
    tile('Posisi setelah Komitmen', fmtRp(r.afterCommitments), r.afterCommitments < 0 ? 'bad' : '') +
    tile('RAB Periode (PLANNED)', fmtRp(r.planned.rabPeriode), '') + tile('Pagu RKAT Tahun', fmtRp(r.planned.rkatPaguTahun), '') +
    tile('Biaya Diharapkan Belum Tercatat', fmtRp(r.missing.unrecordedExpectedCost), r.missing.unrecordedExpectedCost ? 'bad' : 'good') +
    tile('Kelengkapan Data', r.completeness.pct + '%', r.completeness.pct < 100 ? 'warn' : 'good') + '</div>' +
    '<p><b>' + esc(r.label) + '</b></p>';
  if(r.warnings.length) html += '<ul>' + r.warnings.map(w=>'<li>' + esc(w) + '</li>').join('') + '</ul>';
  html += '<div class="section-title">Checklist Kelengkapan</div><div class="tablewrap"><table><thead><tr><th>Kategori</th><th>Status</th></tr></thead><tbody>' +
    r.completeness.checklist.map(c=>'<tr><td>' + esc(c.kategori) + '</td><td>' + (c.status === 'LENGKAP' ? '<span class="badge green">LENGKAP</span>' : '<span class="badge amber">' + esc(c.status) + '</span>') + '</td></tr>').join('') + '</tbody></table></div>';
  html += '<div class="section-title">Saldo per Akun</div><div class="tablewrap"><table><thead><tr><th>Akun</th><th>Jenis</th><th class="right">Saldo</th></tr></thead><tbody>' +
    r.actual.cashByAccount.map(a=>'<tr><td>' + esc(a.nama) + '</td><td>' + esc(a.jenis) + '</td><td class="right">' + fmtRp(a.saldo) + '</td></tr>').join('') + '</tbody></table></div>';
  if(r.missing.rabTanpaRealisasi.length) html += '<div class="section-title">RAB tanpa realisasi/komitmen (MISSING)</div><div class="tablewrap"><table><thead><tr><th>Program</th><th class="right">Nominal</th></tr></thead><tbody>' +
    r.missing.rabTanpaRealisasi.map(m=>'<tr><td>' + esc(m.program) + '</td><td class="right">' + fmtRp(m.nominal) + '</td></tr>').join('') + '</tbody></table></div>';
  html += '<div class="section-title">Anggaran vs Aktual per Komponen / Kategori</div>' + renderAnggaranBandingHtml_(r.anggaranVsAktual);
  html += '<div style="margin-top:10px"><button class="btn" onclick="centralFccVerify()">Verifikasi dengan hitungan server</button> <span id="fccVerifyOut" class="small-muted"></span></div></div>';
  return html;
}
function centralFccVerify(){
  const out = document.getElementById('fccVerifyOut'); if(out) out.textContent = 'Memeriksa…';
  const periode = Store.loadSettings().periodeAktif;
  if(!ServerBridge || !ServerBridge.opFinancialControl) return Promise.resolve(null);
  return ServerBridge.opFinancialControl(periode).then(function(res){
    let msg;
    if(!res || !res.ok) msg = 'Server gagal: ' + centralErrText(res);
    else {
      const c = fccCompute_(periode, centralFccData_(periode)), s = res.data;
      const same = ['cashPosition'].every(k=>Math.abs(c.actual[k] - s.actual[k]) < 0.5) && Math.abs(c.committed.total - s.committed.total) < 0.5 && Math.abs(c.actual.incomePeriode - s.actual.incomePeriode) < 0.5 && Math.abs(c.actual.expensePeriode - s.actual.expensePeriode) < 0.5 && c.completeness.pct === s.completeness.pct && JSON.stringify(((c.anggaranVsAktual || {}).rows || []).map(r=>[r.jenis, r.nama, r.unit, r.periode, r.anggaran, r.aktual, r.komitmen])) === JSON.stringify((((s.anggaranVsAktual) || {}).rows || []).map(r=>[r.jenis, r.nama, r.unit, r.periode, r.anggaran, r.aktual, r.komitmen]));
      msg = same ? 'Cocok dengan server (kas, komitmen, penerimaan, pengeluaran, kelengkapan).' : 'BERBEDA dari server - ada perubahan lokal yang belum tersinkron atau cache usang; klik Sinkronkan lalu muat ulang.';
    }
    if(out) out.textContent = msg; return msg;
  });
}

/* ---- Pusat Data: status, skema, data lama, kewajiban, KPI, audit, akses pengguna, cutover ---- */
function pdOut_(id, html){ const el = document.getElementById(id); if(el) el.innerHTML = html; }
function renderPengaturanPusatData(){
  if(!centralReady_()) return '<div class="card"><h3>Pusat Data (Google Sheets)</h3><p class="small-muted">Tidak aktif: aplikasi tidak berjalan sebagai Apps Script atau akun belum terotorisasi.</p></div>';
  const st = OperationalCache.states;
  let html = '<div class="card"><h3>Pusat Data (Google Sheets)</h3><p class="small-muted">Akun: <b>' + esc(CentralAuth.email) + '</b> &middot; ' + esc(CentralAuth.role || '-') + '. Sumber kebenaran: Google Sheets. Browser ini hanya menyimpan antrean tertunda.</p>' +
    '<div class="tablewrap"><table><thead><tr><th>Sheet</th><th>Status</th><th class="right">Baris</th><th>Dimuat</th></tr></thead><tbody>' +
    Object.keys(OP_SHEETS).map(k=>'<tr><td>' + esc(OP_SHEETS[k]) + '</td><td>' + (st[k].loaded ? '<span class="badge green">OK</span>' : (st[k].error ? '<span class="badge red">' + esc(st[k].error) + '</span>' : '<span class="badge gray">belum</span>')) + '</td><td class="right">' + st[k].total + '</td><td>' + esc((st[k].loadedAt || '').slice(11, 19)) + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p>Antrean tertunda: <b>' + centralPendingCount() + '</b> &middot; Gagal sinkron: <b>' + centralBlockedCount() + '</b>' + (CentralSync.lastError ? ' &middot; <span class="small-muted">' + esc(CentralSync.lastError) + '</span>' : '') + '</p>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn primary" onclick="centralRunSync(true)">Sinkronkan sekarang</button><button class="btn" onclick="pdReloadAll()">Muat ulang semua data dari server</button></div></div>';
  html += '<div class="card"><h3>Skema Sheet (aditif)</h3><p class="small-muted">Hanya MENAMBAH kolom di ujung header (status tarif/akun, kolom arsip/reversal, kolom field aplikasi yang belum punya kolom). Data dan kolom lama tidak diubah.</p>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdSchemaPlan()">Lihat rencana</button><button class="btn danger" onclick="pdSchemaApply()">Terapkan migrasi aditif…</button></div><div id="pdSchemaOut"></div></div>';
  html += '<div class="card"><h3>Data Lokal Lama (localStorage)</h3><p class="small-muted">Pindahkan data bisnis yang masih tersimpan di browser ini ke Google Sheets (aman &amp; idempoten; kandidat duplikat transaksi dilewati). Bersihkan salinan lokal hanya setelah backup dan verifikasi.</p>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdLegacyScan()">Pindai</button><button class="btn primary" onclick="pdLegacyMigrate()">Migrasikan ke server…</button><button class="btn danger" onclick="pdLegacyClean()">Bersihkan salinan lokal yang sudah ada di server…</button></div><div id="pdLegacyOut"></div></div>';
  html += '<div class="card"><h3>Kewajiban, KPI, Audit</h3><div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdVerifyObl()">Verifikasi kewajiban (klien vs server)</button><button class="btn" onclick="pdSnapObl()">Simpan snapshot kewajiban ke 04_KEWAJIBAN</button><button class="btn" onclick="pdSnapKpi()">Simpan snapshot KPI ke 14_KPI</button><button class="btn" onclick="pdAuditView()">Lihat audit server</button></div><div id="pdOblOut"></div></div>';
  html += '<div class="card"><h3>Akses Pengguna (26_USER_ACCESS)</h3><div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdUsersLoad()">Muat daftar</button><button class="btn primary" onclick="pdUserForm()">+ Tambah pengguna</button></div><div id="pdUsersOut"></div></div>';
  html += '<div class="card"><h3>Cutover (Store → pusat)</h3><p class="small-muted">Setelah cutover, baris lokal lama tidak lagi ditampilkan; Google Sheets menjadi satu-satunya sumber. Dapat dibatalkan (rollback).</p>' +
    (centralCutoverDone_() ? '<p><span class="badge green">CUTOVER AKTIF</span></p><button class="btn" onclick="pdCutoverRollback()">Batalkan cutover</button>' :
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdCutoverCheck()">Periksa kesiapan</button><button class="btn danger" onclick="pdCutoverApply()">Aktifkan cutover…</button></div>') + '<div id="pdCutoverOut"></div></div>';
  return html;
}
function pdReloadAll(){ toast('Memuat ulang…'); return loadCentralMasterData().then(function(){ toast('Data dimuat ulang'); renderContent(); }); }
function pdSchemaPlan(){
  pdOut_('pdSchemaOut', 'Memeriksa…');
  return ServerBridge.opSchemaPlan().then(function(res){
    if(!res || !res.ok){ pdOut_('pdSchemaOut', '<span class="badge red">' + esc(centralErrText(res)) + '</span>'); return res; }
    CC_MEM.schemaChecked = {pending:res.data.pendingSheets, at:new Date().toISOString()};
    pdOut_('pdSchemaOut', '<div class="tablewrap"><table><thead><tr><th>Sheet</th><th>Status</th><th>Kolom yang akan ditambah</th><th>Alasan</th></tr></thead><tbody>' +
      res.data.plan.map(p=>'<tr><td>' + esc(p.sheet) + '</td><td>' + esc(p.status) + '</td><td>' + esc((p.add || []).join(', ') || '-') + '</td><td class="small-muted">' + esc(p.why || '') + '</td></tr>').join('') + '</tbody></table></div><p class="small-muted">' + esc(res.data.note) + '</p>');
    return res;
  });
}
function pdSchemaApply(){
  openModal('<h3>Terapkan Migrasi Skema Aditif</h3><p>Aksi ini <b>menambah kolom</b> di ujung header beberapa sheet (lihat "Lihat rencana"). Data, urutan, dan kolom lama <b>tidak diubah atau dihapus</b>. Tercatat di audit.</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn danger" onclick="pdSchemaApplyConfirmed()">Ya, tambah kolom</button></div>');
}
function pdSchemaApplyConfirmed(){
  closeModal();
  return ServerBridge.opSchemaApply('TAMBAH_KOLOM_ADITIF').then(function(res){
    toast(res && res.ok ? ('Skema: ' + res.message) : ('Gagal: ' + centralErrText(res)));
    return loadOperationalData().then(function(){ return loadCentralMasterData({skipOperational:true}); }).then(function(){ renderContent(); return res; });
  });
}
function pdLegacyReportHtml_(rep, done){
  let h = '<div class="tablewrap"><table><thead><tr><th>Koleksi</th><th class="right">Lokal</th><th class="right">Sama di server</th><th class="right">Beda</th><th class="right">Hanya lokal</th></tr></thead><tbody>' +
    Object.keys(rep.rows).map(k=>'<tr><td>' + esc(k) + '</td><td class="right">' + rep.rows[k].local + '</td><td class="right">' + rep.rows[k].same + '</td><td class="right">' + rep.rows[k].diff + '</td><td class="right">' + rep.rows[k].baru + '</td></tr>').join('') +
    '<tr><td>transaksi (antre / lama tak terkirim / kandidat duplikat)</td><td colspan="4">' + rep.transaksi.pending + ' / ' + rep.transaksi.legacy + ' / ' + rep.transaksi.dupKandidat + '</td></tr>' +
    '<tr><td>alokasi lama tak terkirim</td><td colspan="4">' + rep.alokasi.legacy + ' (baru: ' + rep.alokasi.baru + ')</td></tr>' +
    Object.keys(rep.masters).map(k=>'<tr><td>master ' + esc(k) + '</td><td class="right">' + rep.masters[k].local + '</td><td class="right">' + rep.masters[k].onServer + '</td><td></td><td class="right">' + rep.masters[k].baru + '</td></tr>').join('') + '</tbody></table></div>';
  if(done) h += '<p><b>Dijadwalkan:</b> ' + done.rows + ' baris koleksi, ' + done.transaksi + ' transaksi, ' + done.alokasi + ' alokasi, ' + done.masters + ' master. Duplikat dilewati: ' + done.dupDilewati + '.</p>';
  return h;
}
function pdLegacyScan(){ const rep = centralLegacyScan(); pdOut_('pdLegacyOut', pdLegacyReportHtml_(rep)); return rep; }
function pdLegacyMigrate(){
  openModal('<h3>Migrasikan data lokal ke Google Sheets</h3><p>Baris lokal yang belum ada di server akan dikirim (ID sama, idempoten). Transaksi yang mirip transaksi di server dilewati. Salinan lokal <b>tidak dihapus</b>.</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="pdLegacyMigrateConfirmed()">Migrasikan</button></div>');
}
function pdLegacyMigrateConfirmed(){ closeModal(); const r = centralLegacyMigrate(); pdOut_('pdLegacyOut', pdLegacyReportHtml_(r.scan, r.done)); return centralRunSync(true); }
function pdLegacyClean(){
  openModal('<h3>Bersihkan salinan lokal</h3><p>Hanya baris yang SUDAH ada di Google Sheets yang dihapus dari browser ini. Backup JSON akan diunduh lebih dulu.</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn danger" onclick="pdLegacyCleanConfirmed()">Backup lalu bersihkan</button></div>');
}
function pdLegacyCleanConfirmed(){ closeModal(); doBackupExport(); const r = centralLegacyClean(); pdOut_('pdLegacyOut', '<p>Dibersihkan: ' + r.rows + ' baris koleksi, ' + r.transaksi + ' transaksi, ' + r.alokasi + ' alokasi, ' + r.masters + ' master.</p>'); return r; }
function pdVerifyObl(){
  pdOut_('pdOblOut', 'Menghitung…');
  return centralVerifyObligations().then(function(r){
    if(!r.ok){ pdOut_('pdOblOut', '<span class="badge red">' + esc(r.message) + '</span>'); return r; }
    pdOut_('pdOblOut', '<p>Periode <b>' + esc(r.periode) + '</b>: server ' + r.jumlahServer + ' baris, klien ' + r.jumlahKlien + ' baris. ' + (r.diffs.length ? '<span class="badge red">' + r.diffs.length + ' perbedaan</span>' : '<span class="badge green">COCOK</span>') + '</p>' +
      (r.diffs.length ? '<div class="tablewrap"><table><thead><tr><th>Kunci</th><th>Jenis</th><th>Klien</th><th>Server</th></tr></thead><tbody>' + r.diffs.slice(0, 20).map(d=>'<tr><td>' + esc(d.key) + '</td><td>' + esc(d.jenis) + '</td><td>' + esc(d.klien) + '</td><td>' + esc(d.server) + '</td></tr>').join('') + '</tbody></table></div>' : ''));
    return r;
  });
}
function pdSnapObl(){
  const periode = Store.loadSettings().periodeAktif;
  return ServerBridge.opObligationSnapshot(periode).then(function(res){ toast(res && res.ok ? ('Snapshot kewajiban: ' + res.data.dibuat + ' baru, ' + res.data.diperbarui + ' diperbarui') : ('Gagal: ' + centralErrText(res))); CentralSync.refresh.add('kewajiban'); return loadOperationalData(['kewajiban']).then(()=>res); });
}
function pdSnapKpi(){ const n = centralSnapshotKpi(); toast('Snapshot KPI disimpan (' + n + ' baris) - menunggu sinkron'); return n; }
function pdAuditView(){
  const st = OperationalCache.states.audit;
  if(!st.loaded){ pdOut_('pdOblOut', 'Audit server belum dimuat'); return; }
  const rows = st.rows.slice(-50).reverse();
  pdOut_('pdOblOut', '<div class="tablewrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Sumber</th><th>Ref</th></tr></thead><tbody>' + rows.map(r=>'<tr><td>' + esc(ccStr_(r.timestamp).replace('T', ' ').slice(0, 19)) + '</td><td>' + esc(r.aksi) + '</td><td>' + esc(r.sumber) + '</td><td>' + esc(r.refId) + '</td></tr>').join('') + '</tbody></table></div><p class="small-muted">50 entri terakhir dari ' + st.total + ' (append-only).</p>');
}
function pdUsersLoad(){
  pdOut_('pdUsersOut', 'Memuat…');
  return ServerBridge.opUserList().then(function(res){
    if(!res || !res.ok){ pdOut_('pdUsersOut', '<span class="badge red">' + esc(centralErrText(res)) + '</span>'); return res; }
    CC_MEM.users = res.data.users;
    pdOut_('pdUsersOut', '<div class="tablewrap"><table><thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Unit</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + res.data.users.map(u=>'<tr><td>' + esc(u.email) + '</td><td>' + esc(u.nama) + '</td><td>' + esc(u.role) + '</td><td>' + esc(u.unit || '-') + '</td><td>' + (u.status === 'ACTIVE' ? '<span class="badge green">ACTIVE</span>' : '<span class="badge gray">INACTIVE</span>') + '</td><td><a class="link" onclick="pdUserForm(\'' + esc(u.id) + '\')">Edit</a></td></tr>').join('') + '</tbody></table></div>');
    return res;
  });
}
function pdUserForm(id){
  const u = id ? (CC_MEM.users || []).find(x=>x.id === id) : {email:'', nama:'', role:'BENDAHARA', unit:'', status:'ACTIVE'};
  if(!u){ toast('Pengguna tidak ditemukan'); return; }
  openModal('<h3>' + (id ? 'Ubah' : 'Tambah') + ' Pengguna</h3>' + fieldText('usr_email', 'Email Google', u.email) + fieldText('usr_nama', 'Nama', u.nama) +
    fieldSelect('usr_role', 'Role', ['BENDAHARA', 'KEPALA_SEKOLAH', 'YAYASAN', 'AUDITOR'], u.role) + fieldSelect('usr_unit', 'Unit', ['', 'TK', 'MI'], u.unit || '') + fieldSelect('usr_status', 'Status', ['ACTIVE', 'INACTIVE'], u.status) +
    '<p class="small-muted">Hanya BENDAHARA yang dapat menulis data; role lain hanya baca. Tidak ada akun/role yang dibuat otomatis.</p><div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="pdUserSave(' + (id ? "'" + id + "'" : 'null') + ')">Simpan</button></div>');
}
function pdUserSave(id){
  const rec = {email:val('usr_email'), nama:val('usr_nama'), role:val('usr_role'), unit:val('usr_unit'), status:val('usr_status')};
  if(id) rec.id = id;
  return ServerBridge.opUserUpsert(rec).then(function(res){
    if(!res || !res.ok){ toast('Gagal: ' + centralErrText(res)); return res; }
    closeModal(); toast(res.message); return pdUsersLoad();
  });
}
function centralCutoverChecks_(){
  const st = OperationalCache.states, allLoaded = Object.keys(st).every(k=>st[k].loaded && !st[k].error);
  const scan = centralLegacyScan(), lastBackup = lsGet(lsKey('centralLastBackupAt'), '');
  const legacyLeft = Object.keys(scan.rows).reduce((n, k)=>n + scan.rows[k].baru + scan.rows[k].diff, 0) + scan.transaksi.legacy + scan.transaksi.pending + Object.keys(scan.masters).reduce((n, k)=>n + scan.masters[k].baru, 0);
  return [
    {label:'Akun terotorisasi & master data termuat', ok:centralReady_() && CentralMasterData.ready === true},
    {label:'Seluruh sheet operasional termuat tanpa error', ok:allLoaded},
    {label:'Skema aditif sudah diperiksa dan tidak ada yang tertunda', ok:!!CC_MEM.schemaChecked && CC_MEM.schemaChecked.pending === 0},
    {label:'Tidak ada antrean tertunda / gagal sinkron', ok:centralPendingCount() === 0 && centralBlockedCount() === 0},
    {label:'Tidak ada data lokal yang belum ada di server', ok:legacyLeft === 0, detail:legacyLeft + ' item'},
    {label:'Backup diunduh sesi ini', ok:!!lastBackup}
  ];
}
function pdCutoverCheck(){
  const run = ()=>{ const checks = centralCutoverChecks_(); pdOut_('pdCutoverOut', '<ul>' + checks.map(c=>'<li>' + (c.ok ? '&#9989;' : '&#10060;') + ' ' + esc(c.label) + (c.detail ? ' <span class="small-muted">(' + esc(c.detail) + ')</span>' : '') + '</li>').join('') + '</ul>'); return checks; };
  return ServerBridge.opSchemaPlan().then(function(res){ if(res && res.ok) CC_MEM.schemaChecked = {pending:res.data.pendingSheets, at:new Date().toISOString()}; return run(); });
}
function pdCutoverApply(){
  return pdCutoverCheck().then(function(checks){
    if(checks.some(c=>!c.ok)){ toast('Cutover ditolak: masih ada pemeriksaan yang belum lolos'); return false; }
    openModal('<h3>Aktifkan Cutover</h3><p>Setelah ini data lokal lama tidak ditampilkan lagi. Google Sheets menjadi satu-satunya sumber kebenaran. Dapat dibatalkan.</p><div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn danger" onclick="pdCutoverConfirm()">Aktifkan</button></div>');
    return true;
  });
}
function pdCutoverConfirm(){ closeModal(); lsSet(lsKey('centralCutover'), {at:new Date().toISOString(), by:CentralAuth.email}); auditTrailPush('CUTOVER_AKTIF', null, {by:CentralAuth.email}, 'central'); toast('Cutover aktif'); renderContent(); }
function pdCutoverRollback(){ lsSet(lsKey('centralCutover'), null); auditTrailPush('CUTOVER_DIBATALKAN', null, {by:CentralAuth.email}, 'central'); toast('Cutover dibatalkan'); renderContent(); }
