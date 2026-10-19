// Langkah build P1-IMP / D-T4b F8 (klien). Dijalankan SETELAH apply_p0_t1_client.js. Paket terpisah agar mudah di-revert.
// periodeAktif yang bukan label bulan ("2026-10-01", GAP-008) -> KPI "DATA TIDAK TERSEDIA (periode aktif tidak valid)",
// bukan skor 0. Formula, bobot, target, ambang BDS01-06 & 31 indikator TIDAK disentuh (hanya gerbang sebelum perhitungan).
// Normalisasi nilai hanya lewat opPeriodeAktifPlan/opPeriodeAktifApply (PeriodeAktifAdmin.gs) dari tombol eksplisit.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

L.rep(doc, `function kpiUnavailableRow_(k, ds){`,
`/* [P1-IMP F8] Periode yang dievaluasi KPI wajib label bulan "<Bulan> <Tahun>" (sama dengan sgPeriodLabelError_ server). */
function kpiPeriodeStatus_(periode){
  const p = String(periode == null ? '' : periode);
  if(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \\d{4}$/.test(p)) return {ok:true, alasan:[]};
  return {ok:false, alasan:['periode aktif tidak valid ("' + p + '"; wajib label bulan, mis. "Oktober 2026") - normalisasi lewat Pusat Data > Normalisasi Periode Aktif']};
}
function kpiUnavailableRow_(k, ds){`, 'kpiPeriodeStatus_', log);
L.rep(doc, `  const ds = kpiDataStatus_();
  if(!ds.ok) return {periode: periode,`,
`  const ds0 = kpiDataStatus_(), dp = kpiPeriodeStatus_(periode); // [P1-IMP F8]
  const ds = {ok: ds0.ok && dp.ok, alasan: dp.alasan.concat(ds0.alasan)};
  if(!ds.ok) return {periode: periode,`, 'kpiIndukSummary gate', log);
L.rep(doc, `function kpiRow(kode, periode){ const ds = kpiDataStatus_(); if(!ds.ok)`,
  `function kpiRow(kode, periode){ const ds0 = kpiDataStatus_(), dp = kpiPeriodeStatus_(periode || Store.loadSettings().periodeAktif), ds = {ok: ds0.ok && dp.ok, alasan: dp.alasan.concat(ds0.alasan)}; if(!ds.ok)`, 'kpiRow gate', log);
L.rep(doc, `  document.getElementById('periodeBadge').textContent = 'Periode Aktif: ' + Store.loadSettings().periodeAktif;`,
  `  document.getElementById('periodeBadge').textContent = 'Periode Aktif: ' + Store.loadSettings().periodeAktif + (kpiPeriodeStatus_(Store.loadSettings().periodeAktif).ok ? '' : ' (TIDAK VALID)'); // [P1-IMP F8]`, 'periodeBadge', log);
L.rep(doc, `  html += renderQuickActions();

  // ---- 4 kartu ringkasan utama ----`,
`  html += renderQuickActions();
  if(!kpiPeriodeStatus_(periode).ok) html += '<div class="card"><span class="badge red">PERIODE AKTIF TIDAK VALID</span><p class="small-muted">Nilai periode aktif "'+esc(periode)+'" bukan label bulan. KPI dan angka per periode tidak dihitung (DATA TIDAK TERSEDIA). Nilai tidak diubah otomatis.</p><button class="btn sm" onclick="openPeriodeAktifNormalisasi()">Normalisasi Periode Aktif (pratinjau)</button></div>'; // [P1-IMP F8]

  // ---- 4 kartu ringkasan utama ----`, 'Beranda banner', log);
L.rep(doc, `function centralUnavailableInline_(ds){`,
`/* [P1-IMP F8] Normalisasi periodeAktif: pratinjau server -> penyetuju memilih/memeriksa label -> konfirmasi eksplisit. */
function openPeriodeAktifNormalisasi(){
  if(typeof ServerBridge === 'undefined' || !ServerBridge.opPeriodeAktifPlan){ toast('Server tidak terhubung'); return Promise.resolve(false); }
  return ServerBridge.opPeriodeAktifPlan().then(function(res){
    if(!res || !res.ok){ toast('Pratinjau gagal: ' + ((res && res.message) || 'galat')); return false; }
    const p = res.data; State.paPlan = p;
    openModal('<h3>Normalisasi Periode Aktif</h3><div class="kv"><div>Nilai sekarang</div><div>'+esc(p.nilaiSekarang||'(kosong)')+'</div><div>Status</div><div>'+(p.sah?'Sah':'TIDAK SAH')+'</div><div>Usulan sistem</div><div>'+esc(p.usulan||'-')+'</div></div>'+
      (p.alasan?'<p class="small-muted">'+esc(p.alasan)+'</p>':'')+
      (p.perluNormalisasi ? fieldText('pa_baru','Label baru (wajib "<Bulan> <Tahun>")', p.usulan||'')+'<p class="small-muted">Perubahan dicatat di audit (PERIODE_AKTIF_DINORMALISASI). Tidak ada data lain yang diubah.</p>' : '')+
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Tutup</button>'+(p.perluNormalisasi?'<button class="btn primary" onclick="applyPeriodeAktifNormalisasi()">Setujui &amp; Terapkan</button>':'')+'</div>');
    return true;
  });
}
function applyPeriodeAktifNormalisasi(){
  const p = State.paPlan; if(!p) return Promise.resolve(false);
  return ServerBridge.opPeriodeAktifApply({confirm:p.konfirmasi, nilaiSekarang:p.nilaiSekarang, nilaiBaru:val('pa_baru')}).then(function(res){
    if(!res || !res.ok){ toast('Gagal: ' + ((res && res.message) || 'galat')); return false; }
    closeModal(); toast('Periode aktif: ' + (res.data.sesudah || res.data.nilai));
    return loadCentralMasterData({skipOperational:true}).then(function(){ renderContent(); return true; });
  });
}
function centralUnavailableInline_(ds){`, 'openPeriodeAktifNormalisasi', log);
L.save(doc);
fs.writeFileSync(OUT + '_t4b_f8_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_t4b_f8_client OK: ' + log.length + ' perubahan');
