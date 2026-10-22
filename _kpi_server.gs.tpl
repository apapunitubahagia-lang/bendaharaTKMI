// ---- [P1_26] SHIM DATA SERVER untuk KPI (bagian tulisan tangan; disisipkan build_kpi_engine.js) ----
/* Tujuan: menjalankan fungsi KPI klien yang SAMA (disalin verbatim di atas) di server, dengan masukan yang SAMA dengan yang diterima
   klien pada mode pusat: baris dari opReadSheet (dibaca berhalaman sampai lengkap), data master dari getSettings/getAccounts/
   getExpenseCategories (MasterDataRead.gs), kewajiban dari konteks ObligationEngine (oblLoadContext_).
   Perbedaan yang DISENGAJA terhadap klien: tidak ada antrean lokal/peramban (operasi tertunda, overlay, data lokal lama) - server
   hanya menghitung data yang sudah tersimpan di Sheets.
   Sumber gagal dibaca / skema tidak cocok / pembacaan tidak lengkap -> OperationalCache.states[k].error -> kpiDataStatus_ (kode klien
   yang sama) -> 'DATA TIDAK TERSEDIA' dengan skor null, BUKAN 0.
   Formula, bobot, target, ambang 31 KPI TIDAK didefinisikan di sini: semuanya berasal dari salinan verbatim INDICATOR_MASTER/KPI_MASTER
   dan mesin skor klien. */
var KPI_CTX_ = null;
var CentralAuth = { authorized: true, checked: true };
var CentralMasterData = { ready: false, settings: null, accounts: null, expenseCategories: null };
var OperationalCache = { states: {} };
var CENTRAL_CONFIG = { readOperational: true, writeTransactions: false, writeMaster: false, writeCollections: false, writeSettings: false, writeAudit: false };
var ServerBridge = { __shimServerKpi: true }; // kpiDataStatus_ klien memeriksa keberadaan ServerBridge; di server = penanda saja
function lsGet(k, def) { return def; }
function lsSet(k, v) { /* server: tidak ada penyimpanan lokal */ }
function lsKey(k) { return 'srv_' + k; }
function centralReady_() { return true; }
function centralSyncMapGet() { return {}; }
function centralOverlayGet() { return {}; }
function centralArchiveMapGet() { return {}; }
function centralCutoverDone_() { return true; }
function ccMasterPend_(k) { return {}; }
function ccSetPend_() { return {}; }
function ccSettingsActive_() { return true; }
function centralMasterOverlay_(key, rows) { return rows; }

/* baris lengkap satu sheet persis seperti yang diterima klien (opReadSheet berhalaman); galat -> state.error */
function kpiReadAll_(sheetName) {
  var rows = [], offset = 0, headers = [], total = null, guard = 0;
  while (guard++ < 1000) {
    var r = opReadSheet(sheetName, { offset: offset, limit: 5000 });
    if (!r || !r.ok) return { loaded: false, error: (r && r.code) || 'READ_FAILED', rows: [], headers: [] };
    headers = r.data.headers; total = r.data.total;
    rows = rows.concat(r.data.rows); offset += r.data.returned;
    if (r.data.sheetMissing || rows.length >= total || !r.data.returned) break;
  }
  if (total !== null && rows.length !== total) return { loaded: false, error: 'INCOMPLETE_READ', rows: [], headers: headers };
  return { loaded: true, error: null, rows: rows, headers: headers };
}
function kpiNormTrx_(r, idx) {
  var str = function (v) { return (v === null || v === undefined) ? '' : String(v); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var dstr = function (v) { var s = str(v); return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s; };
  /* salinan normTrx (OperationalAPI klien) */
  var o = Object.assign({}, r, { id: str(r.id), jenis: str(r.jenis), tanggal: dstr(r.tanggal), unit: str(r.unit), nominal: num(r.nominal), akunId: str(r.akunId),
    metode: str(r.metode), status: str(r.status), siswaId: str(r.siswaId), createdAt: str(r.createdAt), catatan: str(r.catatan), sumber: str(r.sumber), kategori: str(r.kategori),
    subkategori: str(r.subkategori), penerima: str(r.penerima), resiNo: str(r.resiNo), ftNumber: str(r.ftNumber), namaPengirim: str(r.namaPengirim), buktiId: [] });
  if (idx[o.id]) o.buktiId = idx[o.id].slice();
  return o;
}
function kpiNormAkun_(r) { var s = function (v) { return (v === null || v === undefined) ? '' : String(v); }; var n = Number(r.saldoAwal); return Object.assign({}, r, { id: s(r.id), nama: s(r.nama), jenis: s(r.jenis), saldoAwal: isFinite(n) ? n : 0, status: s(r.status) }); }
function kpiNormKategori_(r) { var s = function (v) { return (v === null || v === undefined) ? '' : String(v); }; return Object.assign({}, r, { id: s(r.id), kode: s(r.kode), kategori: s(r.kategori), status: s(r.status) }); }
function kpiCcView_(name) {
  var st = OperationalCache.states[CC_[name].key];
  if (!st || !st.loaded || st.error) return [];
  var out = [];
  st.rows.forEach(function (r) { var id = ccStr_(r.id); if (!id || ccStr_(r.archivedAt)) return; var o = ccFromRow_(name, r); if (!o) return; o.id = id; out.push(o); });
  return JSON.parse(JSON.stringify(out));
}
function kpiBlob_(name) { var v = ccBlobGet_(name); return v === null ? JSON.parse(JSON.stringify(CC_BLOBS[name].def)) : v; }
/* pasang fungsi data pada shim Store/MasterAPI/OperationalAPI milik ObligationEngine SELAMA perhitungan KPI saja; mengembalikan fungsi
   pemulih (dipanggil di finally) supaya perilaku opObligations/oblSnapshotCore_ di eksekusi yang sama tidak berubah. */
function kpiInstallShim_() {
  var saved = [], set = function (obj, k, fn) { saved.push([obj, k, Object.prototype.hasOwnProperty.call(obj, k), obj[k]]); obj[k] = fn; };
  set(Store, 'loadSettings', function () { return ccSettingsLoad_(function () { return deepClone(DEFAULT_SETTINGS); }); });
  ['anggaran', 'mutasiBank', 'rekonsiliasi', 'dokumen', 'laporan', 'obligasi', 'rkat', 'lpj'].forEach(function (n) { set(Store, 'load' + CC_[n].store, function () { return kpiCcView_(n); }); });
  ['kpiTarget', 'checklistTpl', 'checklistInst', 'kendala', 'periodClosing'].forEach(function (n) { set(Store, 'load' + CC_BLOBS[n].store, function () { return kpiBlob_(n); }); });
  set(Store, 'loadTransaksi', function () { return []; }); set(Store, 'loadAlokasi', function () { return []; }); // tidak ada data lokal di server
  set(MasterAPI, 'accounts', function () { return (CentralMasterData.accounts || []).map(kpiNormAkun_); });
  set(MasterAPI, 'expenseCategories', function () { return (CentralMasterData.expenseCategories || []).map(kpiNormKategori_); });
  set(OperationalAPI, 'transaksi', function () { return KPI_CTX_.transaksi; });
  return function () { saved.reverse().forEach(function (x) { if (x[2]) x[0][x[1]] = x[3]; else delete x[0][x[1]]; }); };
}
function kpiLoadContext_() {
  OperationalCache.states = {};
  var keys = KPI_SOURCE_KEYS_.slice(); ['rkat', 'lpj'].forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
  keys.forEach(function (k) { OperationalCache.states[k] = kpiReadAll_(OP_SHEETS[k]); });
  var ms = [['settings', getSettings], ['accounts', getAccounts], ['expenseCategories', getExpenseCategories]], mOk = true;
  ms.forEach(function (x) { var r = x[1](); if (r && r.ok && r.code === 'SUCCESS') CentralMasterData[x[0]] = r.data; else mOk = false; });
  CentralMasterData.ready = mOk;
  var bs = OperationalCache.states.bukti, idx = {};
  if (bs.loaded && !bs.error) bs.rows.forEach(function (b) { var t = ccStr_(b.transaksiId); if (t) (idx[t] = idx[t] || []).push(ccStr_(b.id)); });
  var ts = OperationalCache.states.transaksi;
  KPI_CTX_ = { transaksi: ts.loaded && !ts.error ? ts.rows.map(function (r) { return kpiNormTrx_(r, idx); }) : [] };
  OBL_CTX_ = oblLoadContext_(); // kewajiban: konteks yang sama dengan opObligations (diuji diferensial klien vs server sejak P1)
}
/* [P1_26] PROTOTIPE SANDBOX - KPI dihitung di server dengan definisi klien yang sama. BELUM menggantikan hasil resmi aplikasi
   (aplikasi tetap menampilkan hasil klien). Baca-saja; peran baca. periode wajib "<Bulan> <Tahun>". */
function opKpiServer(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  var obl0 = OBL_CTX_, pulihkan = kpiInstallShim_();
  try {
    kpiLoadContext_();
    var settingsSrv = Store.loadSettings();
    __aktFeedCache = null;
    var p = opStr_(periode) || settingsSrv.periodeAktif;
    var sum0 = kpiIndukSummary(p);
    return okResult_('KPI server (prototipe, baca-saja)', opJsonSafe_({ periode: p, summary: sum0, sumber: Object.keys(OperationalCache.states).map(function (k) { var s = OperationalCache.states[k]; return { key: k, sheet: OP_SHEETS[k], loaded: s.loaded, error: s.error, baris: s.rows.length }; }), masterTermuat: CentralMasterData.ready, computedAt: new Date().toISOString() }));
  } catch (e) {
    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung KPI server');
  } finally { pulihkan(); OBL_CTX_ = obl0; KPI_CTX_ = null; __aktFeedCache = null; OperationalCache.states = {}; CentralMasterData.ready = false; }
}
