// Langkah build P0 (klien). Dijalankan SETELAH apply_tarif.js dan SEBELUM build_server_engines.js.
// Hanya mengubah Bendahara_V2.html hasil generate dengan penggantian yang dipastikan unik.
// Fungsi kewajiban (yang diekstrak ke ObligationEngine.gs) dan rumus KPI TIDAK disentuh.
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const h = L.load(OUT + 'Bendahara_V2.html');

// ======================= P0-B: tidak ada sukses palsu dari localStorage =======================
L.rep(h, "function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.error('lsSet failed', key, e); } }",
  "function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.error('lsSet failed', key, e); throw new Error('Penyimpanan browser gagal (' + key + '): ' + ((e && e.message) || e)); } } /* [P0-B] galat tidak ditelan */", 'lsSet melempar galat', log);

L.rep(h, "function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg;",
  `/* [P0-B] Selama ada penulisan yang belum dikonfirmasi server, pesan sukses tidak boleh menyatakan "tersimpan". */
function centralToastText_(msg){
  try{
    const s = String(msg == null ? '' : msg);
    if(!globalThis.__centralAwaitConfirm) return s;
    if(/gagal|tidak |menunggu konfirmasi|server/i.test(s)) return s;
    return s.replace(/\\btersimpan\\b/gi, 'dikirim').replace(/berhasil dicatat/gi, 'dikirim') + ' \\u2014 menunggu konfirmasi server\\u2026';
  }catch(e){ return msg; }
}
function toast(msg){ msg = centralToastText_(msg); const t=document.getElementById('toast'); t.textContent=msg;`, 'toast: menunggu konfirmasi', log);

L.rep(h, "  if(t.siswaId && !MasterAPI.students().some(s=>s.id===t.siswaId)) throw new Error('Siswa tidak ditemukan (data siswa tidak valid)');\n  const arr = Store.loadTransaksi();",
  `  if(t.siswaId && !MasterAPI.students().some(s=>s.id===t.siswaId)) throw new Error('Siswa tidak ditemukan (data siswa tidak valid)');
  /* [P0-B] Transaksi resmi HANYA lewat server (Google Sheets). Tidak ada lagi penyimpanan lokal yang tampak berhasil
     saat server tidak siap/tidak terotorisasi. TRANSFER belum punya jalur server -> ditolak dengan pesan jelas. */
  if(t.jenis==='TRANSFER') throw new Error('Transfer antar-akun belum didukung server - TIDAK disimpan.');
  if((t.jenis==='PENERIMAAN'||t.jenis==='PENGELUARAN') && !centralTxWriteActive()) throw new Error(centralNotReadyText_());
  const arr = Store.loadTransaksi();`, 'postTransaksi: wajib server', log);
L.rep(h, "  auditTrailPush('TAMBAH_TRANSAKSI_'+t.jenis, null, t, 'input-manual');",
  "  auditTrailPush('TAMBAH_TRANSAKSI_'+t.jenis, null, t, 'input-manual');\n  if(t._pendingSync) globalThis.__centralAwaitConfirm = true; // [P0-B] sukses baru setelah server mengonfirmasi", 'postTransaksi: tunggu konfirmasi', log);

L.rep(h, "  const trx = transaksiById(transaksiId);\n  if(!trx) throw new Error('Transaksi tidak ditemukan');\n  const sudahAda",
  "  const trx = transaksiById(transaksiId);\n  if(!trx) throw new Error('Transaksi tidak ditemukan');\n  if(!centralTxWriteActive()) throw new Error(centralNotReadyText_()); // [P0-B] alokasi resmi hanya lewat server\n  const sudahAda", 'createAlokasi: wajib server', log);
L.rep(h, "  Store.saveAlokasi(arr);\n  centralScheduleSync();\n  /* Fase 3B-3A: enqueue createAllocation",
  "  Store.saveAlokasi(arr);\n  if(savedNow.some(r=>r._pendingSync)) globalThis.__centralAwaitConfirm = true; // [P0-B]\n  centralScheduleSync();\n  /* Fase 3B-3A: enqueue createAllocation", 'createAlokasi: tunggu konfirmasi', log);

L.rep(h, "  lsSet(lsKey('centralTrxOverlay'), ov);\n  centralScheduleSync();\n  return {before:before, after:Object.assign({}, cur, patch)};",
  "  lsSet(lsKey('centralTrxOverlay'), ov);\n  globalThis.__centralAwaitConfirm = true; // [P0-B]\n  centralScheduleSync();\n  return {before:before, after:Object.assign({}, cur, patch)};", 'centralPatchTransaksi: tunggu konfirmasi', log);
{
  const from = "lsSet(lsKey('central_archive'), m); centralScheduleSync(); }";
  const n = h.t.split(from).length - 1; if (n !== 2) throw new Error('ASSERT arsip: ' + n);
  h.t = h.t.split(from).join("lsSet(lsKey('central_archive'), m); globalThis.__centralAwaitConfirm = true; centralScheduleSync(); }"); log.push('arsip: tunggu konfirmasi (2x)');
}

// tampilan: overlay yang DITOLAK server tidak ditampilkan sebagai nilai baru
L.rep(h, "      const out = srv.filter(t=>!arch[t.id]).map(t=> ov[t.id] ? Object.assign({}, t, ov[t.id]) : t);",
  "      const out = srv.filter(t=>!arch[t.id]).map(t=> (ov[t.id] && !ov[t.id]._blocked) ? Object.assign({}, t, ov[t.id]) : t); // [P0-B] overlay ditolak server tidak ditampilkan", 'overlay ditolak disembunyikan', log);
// alokasi lokal yang gagal/ditolak server (atau induknya gagal) tidak dihitung sebagai pembayaran
L.rep(h, "      const cut2 = centralCutoverDone_();\n      Store.loadAlokasi().forEach(l=>{ if(l._synced || memo.alkIds.has(l.id) || arch[l.id]) return; if(cut2 && !l._pendingSync) return; out.push(l); });",
  "      const cut2 = centralCutoverDone_();\n      const failTrx = new Set(Store.loadTransaksi().filter(x=>x._syncError || x._syncBlocked).map(x=>x.id)); // [P0-B]\n      Store.loadAlokasi().forEach(l=>{ if(l._synced || memo.alkIds.has(l.id) || arch[l.id]) return; if(cut2 && !l._pendingSync) return; if(l._syncError || l._syncBlocked || failTrx.has(l.transaksiId)) return; out.push(l); });", 'alokasi gagal tidak dihitung', log);
// transaksi lokal yang belum dikonfirmasi server bukan transaksi resmi (total, saldo, laporan, KPI)
L.rep(h, "function allTransaksi(){ return OperationalAPI.transaksi().filter(t=>!t.archivedAt); }",
  "/* [P0-B] Baris lokal yang belum dikonfirmasi server (antre/gagal) BUKAN transaksi resmi: tidak masuk total, saldo, laporan, KPI.\n   transaksiById() tetap menemukannya agar alur alokasi berjalan sampai server mengonfirmasi. */\nfunction centralIsUnconfirmedTrx_(t){ return !!(t && t._pendingSync && !t._synced); }\nfunction allTransaksi(){ return OperationalAPI.transaksi().filter(t=>!t.archivedAt && !centralIsUnconfirmedTrx_(t)); }", 'allTransaksi tanpa baris belum terkonfirmasi', log);

// hasil sinkron dilaporkan eksplisit (sukses HANYA setelah konfirmasi server, gagal ditampilkan jelas)
L.rep(h, "  CentralSync.running = true; CentralSync.lastError = null;", "  CentralSync.running = true; CentralSync.lastError = null; CentralSync.result = {ok:0, fail:0, err:''}; // [P0-B]", 'sync: penghitung hasil', log);
L.rep(h, "  if(i>=0){ arr[i]._synced = true; delete arr[i]._pendingSync; delete arr[i]._syncError; Store.saveTransaksi(arr); }\n  const sentIds",
  "  if(i>=0){ arr[i]._synced = true; delete arr[i]._pendingSync; delete arr[i]._syncError; Store.saveTransaksi(arr); }\n  centralResultNote_(true);\n  const sentIds", 'sync: catat sukses transaksi', log);
L.rep(h, "  CentralSync.lastError = centralErrText(res);\n}\nfunction centralMarkTrxSynced_",
  "  CentralSync.lastError = centralErrText(res);\n  centralResultNote_(false, centralErrText(res));\n}\nfunction centralMarkTrxSynced_", 'sync: catat gagal', log);
L.rep(h, "      if(i>=0){ al[i]._synced = true; delete al[i]._pendingSync; delete al[i]._syncError; Store.saveAlokasi(al); }\n      return true;",
  "      if(i>=0){ al[i]._synced = true; delete al[i]._pendingSync; delete al[i]._syncError; Store.saveAlokasi(al); }\n      centralResultNote_(true);\n      return true;", 'sync: catat sukses alokasi', log);
L.rep(h, "    if(res && res.ok){ const o2 = centralOverlayGet(); if(o2[id]){ o2[id]._pushed = true; lsSet(lsKey('centralTrxOverlay'), o2); } return true; }\n    CentralSync.lastError = centralErrText(res);",
  "    if(res && res.ok){ const o2 = centralOverlayGet(); if(o2[id]){ o2[id]._pushed = true; lsSet(lsKey('centralTrxOverlay'), o2); } centralResultNote_(true); return true; }\n    CentralSync.lastError = centralErrText(res);\n    centralResultNote_(false, centralErrText(res));", 'sync: catat hasil patch', log);
L.rep(h, "        if(res && res.ok){ if(cur[id]){ cur[id].done = true; lsSet(lsKey('central_archive'), cur); } CentralSync.refresh.add('transaksi'); CentralSync.refresh.add('alokasi'); return true; }",
  "        if(res && res.ok){ if(cur[id]){ cur[id].done = true; lsSet(lsKey('central_archive'), cur); } CentralSync.refresh.add('transaksi'); CentralSync.refresh.add('alokasi'); centralResultNote_(true); return true; }\n        centralResultNote_(false, centralErrText(res));", 'sync: catat hasil arsip', log);
L.rep(h, "    CentralSync.masterDirty = false; CentralSync.running = false;\n    renderAuthStatusBadge();",
  "    CentralSync.masterDirty = false; CentralSync.running = false;\n    centralReportResult_(); // [P0-B]\n    renderAuthStatusBadge();", 'sync: laporkan hasil', log);
L.rep(h, "function centralSyncActive_(){", `/* [P0-B] Pencatatan & pelaporan hasil sinkron transaksi/alokasi/patch/arsip. */
function centralResultNote_(ok, err){ const r = CentralSync.result || (CentralSync.result = {ok:0, fail:0, err:''}); if(ok) r.ok++; else { r.fail++; if(err && !r.err) r.err = String(err); } }
function centralReportResult_(){
  const r = CentralSync.result || {ok:0, fail:0, err:''};
  if(!r.ok && !r.fail) return;
  globalThis.__centralAwaitConfirm = false;
  if(r.fail) toast('GAGAL menyimpan ' + r.fail + ' perubahan ke server: ' + (r.err || 'galat tidak diketahui') + '. Perubahan itu TIDAK dihitung sebagai transaksi resmi; periksa lalu coba lagi lewat tautan "tertunda".');
  else toast('Tersimpan di server (' + r.ok + ' perubahan dikonfirmasi).');
}
/* [P0-B] Alasan penulisan ditolak di klien bila server belum siap. */
function centralNotReadyText_(){
  if(typeof ServerBridge === 'undefined') return 'Server tidak terhubung (aplikasi tidak dibuka dari Apps Script) - data TIDAK disimpan.';
  if(!CentralAuth.authorized) return 'Akun belum terotorisasi (' + (CentralAuth.code || 'AUTH_REQUIRED') + ') - data TIDAK disimpan.';
  return 'Data server belum termuat atau gagal dimuat - data TIDAK disimpan. Coba lagi setelah data termuat.';
}
function centralSyncActive_(){`, 'helper hasil sinkron & alasan', log);

L.rep(h, "<h3 style=\"margin:6px 0\">Penerimaan berhasil dicatat</h3>",
  "<h3 style=\"margin:6px 0\">'+(globalThis.__centralAwaitConfirm?'Penerimaan dikirim ke server - menunggu konfirmasi':'Penerimaan berhasil dicatat')+'</h3>", 'panel sukses penerimaan', log);

// audit UI membawa id agar pengiriman ulang tidak menggandakan baris audit di server
L.rep(h, "  q.push({aksi:String(aksi) + (sumber ? '@' + sumber : ''),", "  q.push({id:uid('aud'), aksi:String(aksi) + (sumber ? '@' + sumber : ''),", 'audit UI ber-id', log);

// master: tidak ada lagi penyimpanan lokal saat server tidak siap
{
  const from = "\n  if(centralMasterWriteActive()){";
  const n = h.t.split(from).length - 1; if (n < 10) throw new Error('ASSERT master: ' + n);
  h.t = h.t.split(from).join("\n  if(!centralMasterWriteActive()){ toast('GAGAL: ' + centralNotReadyText_()); return; } // [P0-B] tanpa simpan lokal" + from);
  log.push('master: wajib server (' + n + ' titik)');
}
// koleksi & blob: setelah boot, tidak ada fallback simpan lokal diam-diam
L.rep(h, "  Store['save' + S] = function(arr){ if(ccActive_(name)) return ccSave_(name, arr); return CC_ORIG_[name].save(arr); };",
  "  Store['save' + S] = function(arr){ if(ccActive_(name)) return ccSave_(name, arr); if(globalThis.__appBooted){ const m = centralNotReadyText_(); toast('GAGAL: ' + m); throw new Error(m); } return CC_ORIG_[name].save(arr); }; // [P0-B]", 'koleksi: wajib server setelah boot', log);
L.rep(h, "  Store['save' + S] = function(v){ if(ccSettingsActive_()) return ccBlobPut_(name, v); return CC_ORIG_['blob:' + name].save(v); };",
  "  Store['save' + S] = function(v){ if(ccSettingsActive_()) return ccBlobPut_(name, v); if(globalThis.__appBooted){ const m = centralNotReadyText_(); toast('GAGAL: ' + m); throw new Error(m); } return CC_ORIG_['blob:' + name].save(v); }; // [P0-B]", 'blob: wajib server setelah boot', log);
{
  const r = L.fnRange(h, 'bootstrapCentralAuth'); const open = h.t.indexOf('{', r.start) + 1;
  h.t = h.t.slice(0, open) + "\n  globalThis.__appBooted = true; // [P0-B] setelah titik ini, tulis koleksi tanpa server ditolak" + h.t.slice(open); log.push('bootstrapCentralAuth: tanda boot');
}

// ======================= P0-D (diisi pada subfase P0-D) =======================
try { require('./p0_client_d.js')(h, L, log); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

L.save(h);
console.log('apply_p0_client OK: ' + log.length + ' perubahan');
require('fs').writeFileSync(OUT + '_p0_client_patch_log.txt', log.map((l, i) => (i + 1) + '. ' + l).join('\n'));
