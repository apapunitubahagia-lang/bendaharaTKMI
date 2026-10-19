// Langkah build P1-RAB Keputusan 2 (klien). Dijalankan SETELAH apply_p1_rab_client.js. Commit terpisah, mudah di-revert.
// Kartu "Realisasi RAB" di Beranda, laporan Anggaran (layar) dan ekspor "Laporan Anggaran & Realisasi" memakai SATU
// definisi rabRingkasanPeriode_ (_rab_match.js; P1_10): A anggaran disetujui, B realisasi thd anggaran disetujui,
// C total pengeluaran aktual, rincian C-B. KPI (financialAktivitasFeed), bobot/target/ambang TIDAK disentuh.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

// ---------- helper bersama (laporan layar + ekspor) ----------
L.rep(doc, "function rabMatchClient_(){ return rabMatchAll_(rabDataClient_()); }",
`function rabMatchClient_(){ return rabMatchAll_(rabDataClient_()); }
/* [P1-RAB Keputusan 2] ringkasan A/B/C per periode bulan (urut) dari satu hasil pencocokan; dipakai Beranda, laporan, ekspor */
function rabRingkasanClient_(periodes){ const M = rabMatchClient_(); return Array.from(new Set(periodes)).filter(p=>fccIsMonthLabel_(p)).sort((x,y)=>{ const k=p=>{ const m=String(p).split(' '); return Number(m[1])*12+FCC_BULAN_.indexOf(m[0]); }; return k(x)-k(y); }).map(p=>rabRingkasanPeriode_(M, p)); }
function rabRingkasanHtml_(list){
  if(!list.length) return '';
  return '<div class="tablewrap"><table><thead><tr><th>Periode</th><th>A. Anggaran Disetujui</th><th>B. Realisasi thd Anggaran Disetujui</th><th>Sisa (A-B)</th><th>C. Total Pengeluaran Aktual</th><th>Belum terpetakan ke RAB disetujui (C-B)</th></tr></thead><tbody>'+
    list.map(r=>'<tr><td>'+esc(r.periode)+'</td><td>'+fmtRp(r.anggaranDisetujui)+'</td><td>'+fmtRp(r.realisasiDisetujui)+'</td><td>'+fmtRp(r.sisaAnggaranDisetujui)+'</td><td>'+fmtRp(r.pengeluaranAktual)+'</td><td>'+fmtRp(r.belumKeRabDisetujui)+
      ' <span class="small-muted">(RAB belum disetujui '+fmtRp(r.terpetakanBelumDisetujui)+'; garis periode lain '+fmtRp(r.terpetakanPeriodeLain)+'; sisa tidak terpetakan '+fmtRp(r.sisaTidakTerpetakan)+'; tanpa RAB '+fmtRp(r.tanpaRab)+')</span></td></tr>').join('')+
    '</tbody></table></div>';
}
function rabRingkasanEksporBaris_(list){
  const out = [];
  list.forEach(r=>{
    out.push(['[RINGKASAN] A. Total Anggaran Disetujui', r.periode, r.anggaranDisetujui, '']);
    out.push(['[RINGKASAN] B. Realisasi terhadap Anggaran Disetujui', r.periode, '', r.realisasiDisetujui]);
    out.push(['[RINGKASAN] C. Total Pengeluaran Aktual', r.periode, '', r.pengeluaranAktual]);
    out.push(['[RINGKASAN] C-B. Belum terpetakan ke RAB disetujui', r.periode, '', r.belumKeRabDisetujui]);
  });
  return out;
}`, 'helper ringkasan', log);

// ---------- Beranda: tiga ukuran terpisah ----------
L.rep(doc, `  // [P1-RAB] dijumlah per GARIS unik (tanpa hitung ganda); anggaran = pagu DISETUJUI, belum disetujui ditampilkan terpisah
  const RMb_ = rabMatchClient_(), garisPeriode_ = RMb_.lines.filter(g=>g.periode===periode);
  const totalAnggaran = sum(garisPeriode_.map(g=>g.paguDisetujui));
  const totalRealisasi = sum(RMb_.transaksi.filter(r=>r.periode===periode).map(r=>sum(r.bagian.filter(b=>RMb_.lineByKey[b.lineKey].periode===periode).map(b=>b.nominal))));
  const anggaranBelumDisetujui_ = sum(garisPeriode_.map(g=>g.paguDiajukan+g.paguTanpaStatus+g.paguStatusLain));
  const sisaAnggaran = totalAnggaran-totalRealisasi;`,
`  // [P1-RAB Keputusan 2, P1_10] tiga ukuran terpisah dari satu definisi (rabRingkasanPeriode_), tanpa hitung ganda:
  // A anggaran disetujui, B realisasi thd anggaran disetujui, C seluruh pengeluaran aktual (termasuk yang belum terpetakan)
  const RS_ = rabRingkasanPeriode_(rabMatchClient_(), periode);
  const totalAnggaran = RS_.anggaranDisetujui;
  const totalRealisasi = RS_.realisasiDisetujui;
  const anggaranBelumDisetujui_ = RS_.anggaranBelumDisetujui;
  const sisaAnggaran = RS_.sisaAnggaranDisetujui;`, 'Beranda ukuran', log);
L.rep(doc, `      progressStat('Total Anggaran Disetujui', totalAnggaran, totalAnggaran, 'var(--primary)')+
      progressStat('Realisasi', totalRealisasi, totalAnggaran, 'var(--green)')+
      progressStat('Sisa Anggaran', sisaAnggaran, totalAnggaran, 'var(--amber)')+
      '<div class="kv" style="margin-top:6px"><div>Anggaran belum disetujui (diajukan/tanpa status)</div><div>'+fmtRp(anggaranBelumDisetujui_)+'</div></div>'+`,
`      progressStat('Total Anggaran Disetujui', totalAnggaran, totalAnggaran, 'var(--primary)')+
      progressStat('Realisasi terhadap Anggaran Disetujui', totalRealisasi, totalAnggaran, 'var(--green)')+
      progressStat('Sisa Anggaran Disetujui', sisaAnggaran, totalAnggaran, 'var(--amber)')+
      '<div class="kv" style="margin-top:6px"><div>Total Pengeluaran Aktual</div><div>'+fmtRp(RS_.pengeluaranAktual)+'</div>'+
      '<div>Belum terpetakan ke RAB disetujui</div><div>'+fmtRp(RS_.belumKeRabDisetujui)+'</div></div>'+
      '<div class="small-muted">RAB belum disetujui '+fmtRp(RS_.terpetakanBelumDisetujui)+' &middot; garis periode lain '+fmtRp(RS_.terpetakanPeriodeLain)+' &middot; sisa tidak terpetakan '+fmtRp(RS_.sisaTidakTerpetakan)+' &middot; tanpa RAB '+fmtRp(RS_.tanpaRab)+'</div>'+
      '<div class="kv" style="margin-top:6px"><div>Anggaran belum disetujui (diajukan/tanpa status)</div><div>'+fmtRp(anggaranBelumDisetujui_)+'</div></div>'+`, 'Beranda kartu RAB', log);

// ---------- Laporan Anggaran (layar) + ekspor: ringkasan yang sama ----------
L.rep(doc, "      let h = tblFilterBar('lapAnggaran', cfg, all.length, rows.length)+exportBarHtml('exportAnggaranReport');",
  "      let h = tblFilterBar('lapAnggaran', cfg, all.length, rows.length)+exportBarHtml('exportAnggaranReport');\n      h += rabRingkasanHtml_(rabRingkasanClient_(rows.map(a=>a.periode))); // [P1-RAB Keputusan 2] definisi sama dengan Beranda & ekspor", 'laporan ringkasan', log);
L.rep(doc, "(function(){ const RM_ = rabMatchClient_(); return rows.map(a=>[a.program,a.periode,a.nominal,rabRealisasiBaris_(RM_, a.id)]); })(),{currencyCols:[2,3]}); } // [P1-RAB]",
  "(function(){ const RM_ = rabMatchClient_(); return rows.map(a=>[a.program,a.periode,a.nominal,rabRealisasiBaris_(RM_, a.id)]).concat(rabRingkasanEksporBaris_(rabRingkasanClient_(rows.map(a=>a.periode)))); })(),{currencyCols:[2,3]}); } // [P1-RAB] + ringkasan A/B/C (Keputusan 2)", 'ekspor ringkasan', log);

L.save(doc);
fs.writeFileSync(require('path').join(OUT, '_p1_rab_beranda_client_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p1_rab_beranda_client OK: ' + log.length + ' perubahan');
