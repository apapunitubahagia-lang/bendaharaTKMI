// P0-D (klien): KPI tidak dihitung dari data yang gagal/tidak dimuat dari server.
// Rumus, bobot, target, ambang, Zero Activity Rule TIDAK diubah: fungsi asli kpiIndukSummary disalin UTUH
// (hanya ganti nama menjadi kpiIndukSummaryCompute_) lalu dibungkus pemeriksaan ketersediaan sumber data.
module.exports = function applyP0D(h, L, log) {
  const orig = L.fnSrc(h, 'kpiIndukSummary');
  const renamed = orig.replace(/^function kpiIndukSummary\(/, 'function kpiIndukSummaryCompute_(');
  if (renamed === orig) throw new Error('ASSERT rename kpiIndukSummary');
  L.replFn(h, 'kpiIndukSummary', renamed + `
/* [P0-D] Sumber data KPI wajib berasal dari server dan termuat lengkap. Bila tidak, KPI berstatus
   "DATA TIDAK TERSEDIA" (skor null), BUKAN skor 0 "Perlu Perbaikan". Alasan dicatat tanpa data sensitif. */
const KPI_DATA_UNAVAILABLE_ = 'DATA TIDAK TERSEDIA';
const KPI_SOURCE_KEYS_ = ['transaksi', 'alokasi', 'kewajiban', 'anggaran', 'komitmen', 'bukti', 'mutasiBank', 'rekonsiliasi', 'laporan'];
function kpiDataStatus_(){
  const alasan = [];
  try{
    if(typeof ServerBridge === 'undefined' || !ServerBridge) alasan.push('server tidak terhubung');
    else if(!centralReady_()) alasan.push('pengguna belum terotorisasi');
    else {
      if(!CentralMasterData.ready) alasan.push('data master belum termuat');
      const st = OperationalCache.states;
      KPI_SOURCE_KEYS_.forEach(function(k){ const s = st[k]; if(!s || !s.loaded || s.error) alasan.push(OP_SHEETS[k] + (s && s.error ? ' gagal dimuat' : ' belum termuat')); });
    }
  }catch(e){ alasan.push('status sumber data tidak dapat diperiksa'); }
  if(alasan.length) console.warn('[KPI] ' + KPI_DATA_UNAVAILABLE_ + ': ' + alasan.join('; '));
  return {ok: !alasan.length, alasan: alasan};
}
function kpiUnavailableRow_(k, ds){ return Object.assign({}, k, {indicators: [], skor: null, status: KPI_DATA_UNAVAILABLE_, jumlahMasalah: 0, dataUnavailable: true, alasan: ds.alasan}); }
function kpiIndukSummary(periode){
  periode = periode || Store.loadSettings().periodeAktif;
  const ds = kpiDataStatus_();
  if(!ds.ok) return {periode: periode, rows: KPI_MASTER.map(function(k){ return kpiUnavailableRow_(k, ds); }), overall: null, overallStatus: KPI_DATA_UNAVAILABLE_ + ' (' + ds.alasan.join('; ') + ')', dataUnavailable: true, alasan: ds.alasan};
  return kpiIndukSummaryCompute_(periode);
}`, log);
  L.rep(h, "function kpiRow(kode, periode){ return kpiIndukRow(KPI_MASTER.find(k=>k.kode===kode), periode); }",
    "function kpiRow(kode, periode){ const ds = kpiDataStatus_(); if(!ds.ok) return kpiUnavailableRow_(KPI_MASTER.find(k=>k.kode===kode), ds); return kpiIndukRow(KPI_MASTER.find(k=>k.kode===kode), periode); } // [P0-D]", 'kpiRow: data tidak tersedia', log);
  L.rep(h, "  const summary = kpiIndukSummary(periode), now = new Date().toISOString(), safe = periode.replace(/[^A-Za-z0-9]+/g, '_');",
    "  const summary = kpiIndukSummary(periode), now = new Date().toISOString(), safe = periode.replace(/[^A-Za-z0-9]+/g, '_');\n  if(summary.dataUnavailable) throw new Error('KPI ' + KPI_DATA_UNAVAILABLE_ + ' (' + summary.alasan.join('; ') + ') - snapshot TIDAK disimpan.'); // [P0-D] tidak menyimpan skor palsu", 'snapshot KPI ditolak bila data tidak tersedia', log);
  L.rep(h, "function pdSnapKpi(){ const n = centralSnapshotKpi(); toast('Snapshot KPI disimpan (' + n + ' baris) - menunggu sinkron'); return n; }",
    "function pdSnapKpi(){ let n = 0; try{ n = centralSnapshotKpi(); }catch(e){ toast('GAGAL: ' + e.message); return 0; } toast('Snapshot KPI disimpan (' + n + ' baris) - menunggu sinkron'); return n; } // [P0-D]", 'pdSnapKpi: galat ditampilkan', log);
};
