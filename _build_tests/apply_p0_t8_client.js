// Langkah build P0-T8 (klien). Dijalankan SETELAH apply_p1_rab_beranda_client.js. Commit terpisah, mudah di-revert.
// Data yang gagal dimuat atau header salah TIDAK boleh tampil sebagai data lengkap:
//  - centralReadAllPages_: rangkaian halaman wajib tepat = total; halaman kosong/total berubah -> PARTIAL_READ (error);
//  - angka ringkasan (tile Beranda, kartu RAB, Kontrol Keuangan, Anggaran vs Aktual, "Perlu Tindakan") -> "DATA TIDAK
//    TERSEDIA"/N/A bila sumbernya tidak lengkap; tabel rincian Laporan tetap tampil dengan banner TIDAK LENGKAP;
//    ekspor laporan diblokir (berkas ekspor kehilangan banner). KPI tetap memakai gerbang P0-D (kpiDataStatus_, tidak diubah).
// Tidak mengubah rumus, bobot, target, ambang KPI, maupun fungsi KPI/RAB yang diuji identik (financialAktivitasFeed dkk.).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

// ---------- helper status sumber (semantik sama dengan kpiDataStatus_) ----------
L.rep(doc, "function centralOpLoaded_(k){ const st = OperationalCache.states[k]; return !!(st && st.loaded && !st.error); }",
`function centralOpLoaded_(k){ const st = OperationalCache.states[k]; return !!(st && st.loaded && !st.error); }
/* [P0-T8] Kelengkapan sumber untuk tampilan NON-KPI (KPI tetap memakai kpiDataStatus_). ok=false bila server tidak
   terhubung/belum terotorisasi, master belum termuat, atau salah satu sheet sumber belum termuat / gagal (mis. SCHEMA_MISMATCH,
   PARTIAL_READ). Angka ringkasan TIDAK dihitung dari cadangan lokal maupun data kosong pengganti error. */
const RAB_SOURCE_KEYS_ = ['transaksi', 'anggaran', 'alokasiPengeluaran'];
const FCC_SOURCE_KEYS_ = ['transaksi', 'alokasi', 'anggaran', 'komitmen', 'rekonsiliasi', 'rkat', 'alokasiPengeluaran'];
const REPORT_SOURCE_KEYS_ = { pemasukan:['transaksi','alokasi'], pengeluaran:['transaksi','bukti'], kas:['transaksi'], bank:['transaksi'],
  tagihan:['kewajiban','alokasi','transaksi'], tunggakan:['kewajiban','alokasi','transaksi'], siswa:['kewajiban','alokasi','transaksi'],
  anggaran:RAB_SOURCE_KEYS_, aruskas:['transaksi'], audit:['audit'], kpi:KPI_SOURCE_KEYS_, kontrol:FCC_SOURCE_KEYS_ };
function centralSourcesStatus_(keys){
  const alasan = [];
  try{
    if(typeof ServerBridge === 'undefined' || !ServerBridge) alasan.push('server tidak terhubung');
    else if(!centralReady_()) alasan.push('pengguna belum terotorisasi');
    else {
      if(!CentralMasterData.ready) alasan.push('data master belum termuat');
      const st = OperationalCache.states;
      (keys || []).forEach(function(k){ const s = st[k]; if(!s || !s.loaded || s.error) alasan.push(OP_SHEETS[k] + (s && s.error ? ' gagal dimuat (' + s.error + ')' : ' belum termuat')); });
    }
  }catch(e){ alasan.push('status sumber data tidak dapat diperiksa'); }
  return {ok: !alasan.length, alasan: alasan};
}
function centralUnavailableInline_(ds){ return '<div><span class="badge red">DATA TIDAK TERSEDIA</span></div><p class="small-muted">' + esc(ds.alasan.join('; ')) + '. Angka tidak ditampilkan agar tidak disalahartikan sebagai data lengkap.</p>'; }
function centralUnavailableCard_(judul, ds){ return '<div class="card"><h3>' + esc(judul) + '</h3>' + centralUnavailableInline_(ds) + '</div>'; }`, 'helper status sumber', log);

// ---------- pembacaan berhalaman: tidak ada data parsial yang dianggap lengkap ----------
L.rep(doc, `      if(!r || !r.ok || !r.data) return {ok:false, code:(r && r.code) || 'READ_FAILED'};
      Array.prototype.push.apply(rows, r.data.rows);
      if(rows.length < r.data.total && r.data.returned > 0) return page(offset + r.data.returned);
      return {ok:true, rows:rows, total:r.data.total, headers:r.data.headers || []};`,
`      if(!r || !r.ok || !r.data) return {ok:false, code:(r && r.code) || 'READ_FAILED'};
      if(!Array.isArray(r.data.rows)) return {ok:false, code:'READ_FAILED'};
      if(total0 === null) total0 = r.data.total;
      else if(r.data.total !== total0) return {ok:false, code:'PARTIAL_READ'}; // [P0-T8] sheet berubah di tengah pembacaan
      Array.prototype.push.apply(rows, r.data.rows);
      if(rows.length < r.data.total && r.data.returned > 0) return page(offset + r.data.returned);
      if(rows.length !== r.data.total) return {ok:false, code:'PARTIAL_READ'}; // [P0-T8] halaman kosong sebelum total tercapai / kelebihan baris
      return {ok:true, rows:rows, total:r.data.total, headers:r.data.headers || []};`, 'centralReadAllPages_ ketat', log);
L.rep(doc, "function centralReadAllPages_(sheet){\n  const rows = [];", "function centralReadAllPages_(sheet){\n  const rows = []; let total0 = null;", 'centralReadAllPages_ total0', log);

// ---------- Beranda: tile ringkasan, kartu RAB, Perlu Tindakan ----------
L.rep(doc, "  // ---- 4 kartu ringkasan utama ----\n  html += '<div class=\"tiles\">'+",
  "  // ---- 4 kartu ringkasan utama ---- [P0-T8] sumber transaksi tidak lengkap -> DATA TIDAK TERSEDIA\n  const trxDs_ = centralSourcesStatus_(['transaksi']);\n  if(!trxDs_.ok) html += centralUnavailableCard_('Saldo, Penerimaan, dan Pengeluaran', trxDs_);\n  else html += '<div class=\"tiles\">'+", 'Beranda tile', log);
L.rep(doc, "  const RS_ = rabRingkasanPeriode_(rabMatchClient_(), periode);", "  const RS_DS_ = centralSourcesStatus_(RAB_SOURCE_KEYS_); // [P0-T8]\n  const RS_ = rabRingkasanPeriode_(rabMatchClient_(), periode);", 'Beranda RAB status', log);
L.rep(doc, "      progressStat('Total Anggaran Disetujui', totalAnggaran, totalAnggaran, 'var(--primary)')+",
  "      (!RS_DS_.ok ? centralUnavailableInline_(RS_DS_) : progressStat('Total Anggaran Disetujui', totalAnggaran, totalAnggaran, 'var(--primary)')+", 'Beranda RAB awal', log);
L.rep(doc, "      '<div class=\"kv\" style=\"margin-top:6px\"><div>Anggaran belum disetujui (diajukan/tanpa status)</div><div>'+fmtRp(anggaranBelumDisetujui_)+'</div></div>'+",
  "      '<div class=\"kv\" style=\"margin-top:6px\"><div>Anggaran belum disetujui (diajukan/tanpa status)</div><div>'+fmtRp(anggaranBelumDisetujui_)+'</div></div>')+", 'Beranda RAB akhir', log);
L.rep(doc, "    {masalah:'Penerimaan belum teridentifikasi', jumlah:penerimaanBelumTeridentifikasi().length,",
  "    {src:['transaksi','alokasi'], masalah:'Penerimaan belum teridentifikasi', jumlah:penerimaanBelumTeridentifikasi().length,", 'tindakan src 1', log);
L.rep(doc, "    {masalah:'Pembayaran belum dialokasi',", "    {src:['transaksi','alokasi'], masalah:'Pembayaran belum dialokasi',", 'tindakan src 2', log);
L.rep(doc, "    {masalah:'Mutasi rekening belum dicocokkan',", "    {src:['mutasiBank','transaksi'], masalah:'Mutasi rekening belum dicocokkan',", 'tindakan src 3', log);
L.rep(doc, "    {masalah:'Pengeluaran tanpa bukti',", "    {src:['transaksi','bukti'], masalah:'Pengeluaran tanpa bukti',", 'tindakan src 4', log);
L.rep(doc, "    {masalah:'Pengeluaran di luar RAB',", "    {src:RAB_SOURCE_KEYS_, masalah:'Pengeluaran di luar RAB',", 'tindakan src 5', log);
L.rep(doc, "    {masalah:'RAB mendekati pagu (<20%)',", "    {src:RAB_SOURCE_KEYS_, masalah:'RAB mendekati pagu (<20%)',", 'tindakan src 6', log);
L.rep(doc, "    {masalah:'Laporan bulan belum dikirim',", "    {src:['laporan'], masalah:'Laporan bulan belum dikirim',", 'tindakan src 7', log);
L.rep(doc, "  ];\n  html += '<div class=\"grid cols-2\">'+\n    '<div class=\"card\"><h3>Perlu Tindakan ('",
  "  ];\n  perluTindakanRows.forEach(r=>{ const ds = centralSourcesStatus_(r.src); if(!ds.ok){ r.jumlah = null; r.na = ds.alasan.join('; '); } }); // [P0-T8] bukan 0\n  html += '<div class=\"grid cols-2\">'+\n    '<div class=\"card\"><h3>Perlu Tindakan ('", 'tindakan gating', log);
L.rep(doc, "'</td><td>'+(r.jumlah? '<span class=\"badge red\">'+r.jumlah+'</span>' : '<span class=\"badge green\">0</span>')+",
  "'</td><td>'+(r.na ? '<span class=\"badge gray\" title=\"'+esc(r.na)+'\">N/A</span>' : r.jumlah? '<span class=\"badge red\">'+r.jumlah+'</span>' : '<span class=\"badge green\">0</span>')+", 'tindakan render', log);

// ---------- Laporan: banner tidak lengkap + ekspor diblokir ----------
L.rep(doc, "  html += (fnMap[State.laporanTab]||fnMap.pemasukan)();",
  "  { const ds_ = centralSourcesStatus_(REPORT_SOURCE_KEYS_[State.laporanTab] || REPORT_SOURCE_KEYS_.pemasukan); // [P0-T8]\n    if(!ds_.ok) html += '<div class=\"card\" style=\"border-left:4px solid #c62828\"><span class=\"badge red\">DATA TIDAK LENGKAP</span> <span class=\"small-muted\">' + esc(ds_.alasan.join('; ')) + '. Angka di bawah TIDAK lengkap dan tidak boleh dipakai sebagai laporan resmi; ekspor dinonaktifkan.</span></div>'; }\n  html += (fnMap[State.laporanTab]||fnMap.pemasukan)();", 'laporan banner', log);
L.rep(doc, "function exportReport(format, baseFilename, title, headers, rows, opts){\n",
  "function exportReport(format, baseFilename, title, headers, rows, opts){\n  // [P0-T8] ekspor dari data tidak lengkap diblokir (berkas tidak membawa banner peringatan)\n  const ds_ = centralSourcesStatus_((State.page === 'laporan' && REPORT_SOURCE_KEYS_[State.laporanTab]) || (baseFilename === 'Anggaran' ? RAB_SOURCE_KEYS_ : []));\n  if(!ds_.ok){ toast('Ekspor dibatalkan - DATA TIDAK TERSEDIA: ' + ds_.alasan.join('; ')); return false; }\n", 'ekspor gating', log);

// ---------- Kontrol Keuangan & Anggaran vs Aktual ----------
L.rep(doc, "function renderFinancialControl(){\n  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));",
  "function renderFinancialControl(){\n  { const ds_ = centralSourcesStatus_(FCC_SOURCE_KEYS_); if(!ds_.ok) return centralUnavailableCard_('Kontrol Keuangan - ' + Store.loadSettings().periodeAktif, ds_); } // [P0-T8]\n  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));", 'FCC gating', log);
L.rep(doc, "function renderAnggaranBanding(){\n  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));",
  "function renderAnggaranBanding(){\n  { const ds_ = centralSourcesStatus_(FCC_SOURCE_KEYS_); if(!ds_.ok) return centralUnavailableCard_('Anggaran vs Aktual - ' + Store.loadSettings().periodeAktif, ds_); } // [P0-T8]\n  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));", 'banding gating', log);
L.rep(doc, "      const c = fccCompute_(periode, centralFccData_(periode)), s = res.data;",
  "      const ds_ = centralSourcesStatus_(FCC_SOURCE_KEYS_); if(!ds_.ok){ msg = 'Tidak dapat dibandingkan - data lokal TIDAK lengkap: ' + ds_.alasan.join('; '); if(out) out.textContent = msg; return msg; } // [P0-T8]\n      const c = fccCompute_(periode, centralFccData_(periode)), s = res.data;", 'FCC verify gating', log);

L.save(doc);
fs.writeFileSync(require('path').join(OUT, '_p0_t8_client_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p0_t8_client OK: ' + log.length + ' perubahan');
