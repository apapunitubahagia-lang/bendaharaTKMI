// Langkah build P1 (klien). Dijalankan SETELAH apply_p0_client.js. Mengubah Bendahara_V2.html (berkas generate)
// dengan penggantian yang dipastikan unik. TIDAK menyentuh rumus/definisi KPI, markup/CSS di luar <script>,
// maupun fungsi kewajiban yang diekstrak ke ObligationEngine.gs.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

// ---------- galat permanen baru (tidak diulang tanpa henti; tampil di hitungan gagal sinkron) ----------
L.rep(doc, "CONFIRM_REQUIRED:1, TOTALS_MISMATCH:1, PLAN_CONFLICT:1};",
  "CONFIRM_REQUIRED:1, TOTALS_MISMATCH:1, PLAN_CONFLICT:1,\n  /* [P1] */ PERIOD_LOCKED:1, PERIOD_STATE_INVALID:1, PERIOD_LOCK_API_REQUIRED:1, CONFLICT:1, ARCHIVED:1, USE_DEDICATED_API:1, MATCH_VIA_API_REQUIRED:1, MUTASI_LOCKED:1, MATCH_NOMINAL_MISMATCH:1, DOUBLE_MATCH:1, ALREADY_MATCHED:1, INVALID_TRANSACTION:1, INVALID_RAB:1, LPJ_EXCEEDS_TRANSACTION:1, BUKTI_FILE_REQUIRED:1, BUKTI_IMMUTABLE:1, EVIDENCE_REQUIRED:1, IDEMPOTENCY_MISMATCH:1};", 'CC_PERMANENT_', log);

// ---------- P1-A: closing / reopen lewat server ----------
L.replFn(doc, 'closePeriode', `
function closePeriode(periode){
  /* [P1-A] Status closing ditegakkan SERVER (opClosePeriod): penulisan pada periode tertutup ditolak di server.
     Tidak ada lagi penulisan blob lokal; tanpa server -> galat eksplisit. */
  if(!(centralReady_() && ServerBridge.opClosePeriod)){ toast('Gagal menutup periode: ' + centralNotReadyText_()); return; }
  toast('Menutup periode ' + periode + ' di server - menunggu konfirmasi...');
  return ServerBridge.opClosePeriod(periode).then(function(res){
    if(!res || !res.ok){ toast('GAGAL menutup periode: ' + centralErrText(res)); return false; }
    if(!(res.data && res.data.unchanged)) auditTrailPush('CLOSING_PERIODE', null, res.data && res.data.entry, 'manual');
    toast(res.data && res.data.unchanged ? 'Periode sudah ditutup sebelumnya' : 'Periode ditutup (dikonfirmasi server)');
    return loadCentralMasterData({skipOperational:true}).then(function(){ renderContent(); return true; });
  });
}`, log);
L.replFn(doc, 'reopenPeriode', `
function reopenPeriode(periode){
  /* [P1-A] Buka kembali periode WAJIB alasan (dicatat di audit server). */
  openModal('<h3>Buka Kembali Periode '+esc(periode)+'</h3>'+
    '<p class="small-muted">Periode yang dibuka kembali dapat diubah lagi. Alasan dicatat di Audit Log server.</p>'+
    fieldTextarea('rp_alasan','Alasan membuka kembali (wajib, minimal 10 karakter)','')+
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="submitReopenPeriode(\\''+periode+'\\')">Buka Kembali</button></div>');
}
function submitReopenPeriode(periode){
  const alasan = String(val('rp_alasan')||'').trim();
  if(alasan.length < 10){ toast('Alasan membuka kembali periode wajib diisi (minimal 10 karakter)'); return; }
  if(!(centralReady_() && ServerBridge.opReopenPeriod)){ toast('Gagal membuka kembali periode: ' + centralNotReadyText_()); return; }
  toast('Membuka kembali periode ' + periode + ' di server - menunggu konfirmasi...');
  return ServerBridge.opReopenPeriod(periode, alasan).then(function(res){
    if(!res || !res.ok){ toast('GAGAL membuka kembali periode: ' + centralErrText(res)); return false; }
    if(!(res.data && res.data.unchanged)) auditTrailPush('REOPEN_PERIODE', null, res.data && res.data.entry, 'manual');
    closeModal(); toast(res.data && res.data.unchanged ? 'Periode tidak dalam status CLOSED' : 'Periode dibuka kembali (dikonfirmasi server)');
    return loadCentralMasterData({skipOperational:true}).then(function(){ renderContent(); return true; });
  });
}`, log);

// Blob closing kini milik server (opSettingsUpsert menolak key-nya). Klien tidak lagi mengantrekannya, dan antrean
// lama yang masih membawa key itu dibuang, supaya tidak menggagalkan setting lain dalam batch yang sama.
L.rep(doc, "function ccBlobPut_(name, value){\n",
  "function ccBlobPut_(name, value){\n  if(name === 'periodClosing'){ console.warn('[P1-A] status closing periode hanya diubah lewat server (opClosePeriod/opReopenPeriod) - penulisan blob lokal diabaikan'); return; }\n", 'ccBlobPut_: periodClosing milik server', log);
L.rep(doc, "  const p = ccSetPend_(), keys = Object.keys(p).filter(k=>!p[k].blocked);\n",
  "  const p = ccSetPend_();\n" +
  "  const own = Object.keys(p).filter(k=>k.indexOf('blob.periodClosing.') === 0); // [P1-A] antrean lama: buang, bukan kirim\n" +
  "  if(own.length){ own.forEach(k=>{ delete p[k]; }); lsSet(lsKey('central_pending_settings'), p); CentralSync.lastError = 'Perubahan status closing lokal lama dibuang - closing hanya lewat server'; }\n" +
  "  const keys = Object.keys(p).filter(k=>!p[k].blocked);\n", 'centralSettingsJobs_: buang antrean blob closing', log);

// ---------- P1-C: rekonsiliasi & pencocokan mutasi lewat server ----------
L.replFn(doc, 'submitRekonsiliasi', `
function submitRekonsiliasi(akunId){
  const saldoSistem = akunSaldo(akunId);
  const saldoAktual = numval('rk_aktual');
  const selisih = saldoAktual - saldoSistem;
  const catatan = val('rk_catatan');
  if(selisih!==0 && !catatan){ toast('Selisih ditemukan ('+fmtRp(selisih)+') - catatan penjelasan WAJIB diisi'); return; }
  /* [P1-C] Saldo sistem, selisih, dan status DIHITUNG SERVER (opReconcileAccount); nilai klien hanya pratinjau. */
  if(!(centralReady_() && ServerBridge.opReconcileAccount)){ toast('Gagal mencatat rekonsiliasi: ' + centralNotReadyText_()); return; }
  toast('Mencatat rekonsiliasi di server - menunggu konfirmasi...');
  return ServerBridge.opReconcileAccount({akunId:akunId, periode:Store.loadSettings().periodeAktif, saldoAktual:saldoAktual, catatan:catatan, clientRequestId:uid('rk')}).then(function(res){
    if(!res || !res.ok){ toast('GAGAL mencatat rekonsiliasi: ' + centralErrText(res)); return false; }
    const r = res.data || {};
    auditTrailPush('REKONSILIASI', null, r, 'manual');
    closeModal(); toast(Math.abs(Number(r.selisih||0))<0.5 ? 'Rekonsiliasi selesai, saldo sesuai (dihitung server)' : 'Rekonsiliasi dicatat dengan selisih '+fmtRp(r.selisih)+' terhadap saldo sistem server '+fmtRp(r.saldoSistem)+' (perlu penjelasan/tindak lanjut)');
    return loadOperationalData(['rekonsiliasi']).then(function(){ renderContent(); return true; });
  });
}`, log);
L.replFn(doc, 'linkMutasiToTransaksi', `
function linkMutasiToTransaksi(mutId, trxId){
  /* [P1-C] Mutasi yang tersimpan di server dicocokkan lewat opMatchMutasi (nominal sama, transaksi aktif, tanpa
     pencocokan ganda - divalidasi server). Baris lokal lama (belum dimigrasi) memakai jalur lama. */
  if(ccMutasiOnServer_(mutId)){
    if(!ServerBridge.opMatchMutasi){ toast('Server belum mendukung pencocokan mutasi - data TIDAK diubah.'); return; }
    const tid = centralResolveTrxId(trxId);
    if(tid === trxId && ccIsLocalPendingTrx_(trxId)){ toast('Transaksi belum dikonfirmasi server - cocokkan setelah transaksi tersimpan.'); return; }
    const before = deepClone(Store.loadMutasiBank().find(x=>x.id===mutId) || {id:mutId});
    toast('Mencocokkan mutasi di server - menunggu konfirmasi...');
    return ServerBridge.opMatchMutasi({mutasiId:mutId, transaksiId:tid}).then(function(res){
      if(!res || !res.ok){ toast('GAGAL mencocokkan mutasi: ' + centralErrText(res)); return false; }
      if(!(res.data && res.data.unchanged)) auditTrailPush('COCOKKAN_MUTASI_TRANSAKSI', before, res.data, 'reconciliation-assistant');
      closeModal(); toast('Mutasi dicocokkan ke transaksi yang sudah ada - TIDAK ada transaksi baru dibuat (dikonfirmasi server)');
      return loadOperationalData(['mutasiBank']).then(function(){ renderContent(); return true; });
    });
  }
  const arr = Store.loadMutasiBank();
  const idx = arr.findIndex(m=>m.id===mutId);
  const before = deepClone(arr[idx]);
  arr[idx].status='DIPROSES'; arr[idx].transaksiId=trxId;
  Store.saveMutasiBank(arr);
  auditTrailPush('COCOKKAN_MUTASI_TRANSAKSI', before, arr[idx], 'reconciliation-assistant');
  closeModal(); toast('Mutasi dicocokkan ke transaksi yang sudah ada - TIDAK ada transaksi baru dibuat'); renderContent();
}
/* [P1-C] Mutasi ini sudah ada di 11_MUTASI_BANK server (bukan baris lokal lama). */
function ccMutasiOnServer_(mutId){ return ccWriteActive_() && ccActive_('mutasiBank') && ccSrv_('mutasiBank').byId.has(mutId); }`, log);
L.replFn(doc, 'createTransaksiFromMutasi', `
function createTransaksiFromMutasi(mutId){
  const unit = val('mtu_unit');
  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }
  const arr = Store.loadMutasiBank();
  const idx = arr.findIndex(m=>m.id===mutId);
  const m = arr[idx];
  const onServer = ccMutasiOnServer_(mutId); // [P1-C]
  if(onServer && !ServerBridge.opMatchMutasi){ toast('Gagal memproses mutasi: server belum mendukung pencocokan mutasi - TIDAK disimpan.'); return; }
  let trx;
  try{
    trx = postTransaksi({jenis:'PENERIMAAN', tanggal:m.tanggal, sumber:'Mutasi Bank', akunId:akunList().find(a=>a.jenis==='Bank')?.id||akunList()[0].id, unit, nominal:m.nominal, metode:'Transfer Bank', status:'TERCATAT', catatan:m.keterangan, namaPengirim:m.namaPengirim||undefined, ftNumber:m.ftNumber||undefined});
  }catch(e){ toast('Gagal memproses mutasi: '+e.message); return; }
  if(onServer){
    /* [P1-C] Mutasi dicocokkan (opMatchMutasi) SETELAH transaksi barunya dikonfirmasi server - lihat ccMutMatchJobs_. */
    const pp = ccMutMatchPend_(); pp[mutId] = {trxId:trx.id, attempts:0}; lsSet(lsKey('central_pending_mutmatch'), pp);
    auditTrailPush('PROSES_MUTASI_BANK', null, Object.assign({}, m, {transaksiId:trx.id}), 'manual');
    closeModal(); toast('Transaksi penerimaan dikirim ke server - mutasi dicocokkan setelah transaksi dikonfirmasi'); centralScheduleSync(); renderContent();
    return;
  }
  arr[idx].status='DIPROSES'; arr[idx].transaksiId=trx.id;
  Store.saveMutasiBank(arr);
  auditTrailPush('PROSES_MUTASI_BANK', null, arr[idx], 'manual');
  closeModal(); toast('Mutasi diproses menjadi transaksi penerimaan baru'); renderContent();
}`, log);
L.replFn(doc, 'centralCollectionJobs_', `
function centralCollectionJobs_(){
  if(!ccWriteActive_()) return [];
  const jobs = [];
  Object.keys(CC_).forEach(function(name){
    if(!ccActive_(name)) return;
    const pend = ccPend_(name);
    if(Object.keys(pend).some(id=>!pend[id].blocked)) jobs.push(()=>ccPush_(name));
  });
  if(ServerBridge.opMatchMutasi) ccMutMatchJobs_().forEach(j=>jobs.push(j)); // [P1-C]
  return jobs;
}
/* [P1-C] Pencocokan mutasi yang menunggu transaksi barunya dikonfirmasi server (createTransaksiFromMutasi).
   Dijalankan SETELAH job transaksi di centralRunSync, jadi id lokal sudah terpetakan ke id server. */
function ccMutMatchPend_(){ return lsGet(lsKey('central_pending_mutmatch'), {}); }
function ccMutMatchJobs_(){
  const pend = ccMutMatchPend_(), jobs = [];
  Object.keys(pend).forEach(function(mutId){
    const e = pend[mutId]; if(!e || e.blocked) return;
    jobs.push(function(){
      const tid = centralResolveTrxId(e.trxId);
      if(tid === e.trxId && ccIsLocalPendingTrx_(e.trxId)) return Promise.resolve(false);
      return ServerBridge.opMatchMutasi({mutasiId:mutId, transaksiId:tid}).then(function(res){
        const pp = ccMutMatchPend_();
        if(res && res.ok){ delete pp[mutId]; lsSet(lsKey('central_pending_mutmatch'), pp); CentralSync.refresh.add('mutasiBank'); centralResultNote_(true); return true; }
        if(pp[mutId]){ pp[mutId].error = centralErrText(res); pp[mutId].attempts = (pp[mutId].attempts||0) + 1; if(!(res && CENTRAL_RETRYABLE_[res.code]) || pp[mutId].attempts >= 3) pp[mutId].blocked = true; lsSet(lsKey('central_pending_mutmatch'), pp); }
        centralResultNote_(false, centralErrText(res)); CentralSync.lastError = centralErrText(res);
        return false;
      });
    });
  });
  return jobs;
}`, log);

// ---------- P1-E: bukti wajib berfile, tanpa perubahan status otomatis ----------
L.rep(doc, "<label>File (opsional, disimpan lokal)</label>", "<label>File bukti (wajib: PDF/PNG/JPEG/WEBP/GIF)</label>", 'label file bukti', log);
L.replFn(doc, 'submitBukti', `
function submitBukti(trxId){
  /* [P1-E] Bukti WAJIB berfile (diunggah ke Drive lewat server). Status transaksi TIDAK lagi diubah otomatis saat
     bukti dilampirkan: perubahan status pembayaran butuh bukti DAN tindakan eksplisit (Tandai Direkonsiliasi). */
  const fileInput = document.getElementById('bk_file');
  if(!(fileInput && fileInput.files && fileInput.files[0])){ toast('File bukti wajib dilampirkan - bukti TIDAK disimpan.'); return; }
  const finish = (fileRef)=>{
    const dok = Store.loadDokumen();
    const d = {id:uid('dok'), kategori:val('bk_kategori'), transaksiId:trxId, fileRef:fileRef||'', judul:val('bk_judul')||('Bukti '+trxId), tanggal:todayISO()};
    dok.push(d); Store.saveDokumen(dok);
    if(!centralIsServerTrx(trxId)){
      const arr = Store.loadTransaksi(); const idx = arr.findIndex(t=>t.id===trxId);
      if(idx>=0){ arr[idx].buktiId = (arr[idx].buktiId||[]).concat([d.id]); Store.saveTransaksi(arr); }
    }
    auditTrailPush('LAMPIRKAN_BUKTI', null, d, 'manual');
    closeModal(); toast('Bukti dikirim ke server - menunggu konfirmasi. Status transaksi TIDAK diubah otomatis.'); renderContent();
  };
  const reader = new FileReader();
  reader.onload = ()=>finish(reader.result);
  reader.readAsDataURL(fileInput.files[0]);
}`, log);
L.rep(doc, "function submitDokumen(){\n  const fileInput = document.getElementById('dkf_file');\n",
  "function submitDokumen(){\n  const fileInput = document.getElementById('dkf_file');\n  if(!(fileInput && fileInput.files && fileInput.files[0])){ toast('File dokumen wajib dilampirkan - dokumen TIDAK disimpan.'); return; } // [P1-E] 10_BUKTI wajib berfile\n", 'submitDokumen: file wajib', log);

// ---------- P1-F: deteksi konflik (nilai yang dilihat klien dikirim sebagai ekspektasi) ----------
L.replFn(doc, 'centralPatchTransaksi', `
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
  const ov = centralOverlayGet(); const prev = ov[id] || {};
  /* [P1-F] _expect = nilai server yang DILIHAT sebelum field diubah (hanya diambil saat field pertama kali diubah);
     _crid = id permintaan (idempotensi) yang baru setiap kali isi patch berubah. */
  const expect = prev._pushed ? {} : Object.assign({}, prev._expect || {});
  Object.keys(patch).forEach(function(k){ if(!Object.prototype.hasOwnProperty.call(expect, k)) expect[k] = (cur[k] === undefined || cur[k] === null) ? '' : cur[k]; });
  ov[id] = Object.assign({}, prev, patch, {_expect:expect, _crid:uid('pt')}); delete ov[id]._pushed;
  lsSet(lsKey('centralTrxOverlay'), ov);
  globalThis.__centralAwaitConfirm = true; // [P0-B]
  centralScheduleSync();
  return {before:before, after:Object.assign({}, cur, patch)};
}`, log);
L.rep(doc, "  const body = Object.assign({}, patch); delete body._pushed; delete body._blocked; delete body._error;\n  return ServerBridge.opUpdateTransaction(JSON.parse(JSON.stringify(Object.assign({id:id}, body)))).then(function(res){",
  "  const body = Object.assign({}, patch); delete body._pushed; delete body._blocked; delete body._error; delete body._expect; delete body._crid;\n" +
  "  const req = Object.assign({id:id}, body); // [P1-B/F] idempotensi + ekspektasi nilai (konflik terdeteksi server)\n" +
  "  if(patch._crid) req.clientRequestId = 'ui_' + patch._crid;\n" +
  "  if(patch._expect){ const ex = {}; Object.keys(body).forEach(k=>{ if(Object.prototype.hasOwnProperty.call(patch._expect, k)) ex[k] = patch._expect[k]; }); if(Object.keys(ex).length) req._expect = ex; }\n" +
  "  return ServerBridge.opUpdateTransaction(JSON.parse(JSON.stringify(req))).then(function(res){", 'centralPushPatch_: crid + _expect', log);
L.rep(doc, "    const p = {op:'upsert', local:o, attempts:0};\n",
  "    const p = {op:'upsert', local:o, attempts:0};\n" +
  "    const so = CC_[name].custom ? null : m.byId.get(o.id); // [P1-F] ekspektasi = nilai server untuk field yang diubah\n" +
  "    if(so){ const sr = ccToRow_(name, so, live).row, ex = {}; Object.keys(conv.row).forEach(function(k){ if((CC_[name].json || []).indexOf(k) !== -1) return; const sv = sr[k] === undefined ? '' : sr[k]; if(JSON.stringify(conv.row[k]) !== JSON.stringify(sv)) ex[k] = sv; }); if(Object.keys(ex).length) p.expect = ex; }\n", 'ccSave_: expect', log);
L.rep(doc, "    ops.push({op:'upsert', id:id, row:row}); meta.push(id);",
  "    ops.push(p.expect ? {op:'upsert', id:id, row:row, expect:p.expect} : {op:'upsert', id:id, row:row}); meta.push(id); // [P1-F]", 'ccPush_: expect', log);

L.save(doc);
fs.writeFileSync(require('path').join(OUT, '_p1_client_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p1_client OK: ' + log.length + ' perubahan');
