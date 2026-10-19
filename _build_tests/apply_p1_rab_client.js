// Langkah build P1-RAB (klien). Dijalankan SETELAH apply_p1_client.js. Paket terpisah dari revisi kebijakan periode.
// Mengubah Bendahara_V2.html (generate) dengan penggantian yang dipastikan unik:
//  - menyuntikkan _rab_match.js (sumber tunggal, juga disuntikkan ke FinanceEngine.gs oleh apply_p1_rab_server.js);
//  - KPI BDS03-I03/I04/I05 + tampilan anggaran memakai pencocokan bersama (K-RAB-01..06, P1_06 §4.3);
//  - teks dokumentasi formula BDS03 (K-RAB-06). Bobot/target/ambang/definisi lain TIDAK disentuh.
// BDS03-I05 bagian persetujuan (pengeluaranPunyaPersetujuan) TIDAK diubah (K-RAB-07 belum disetujui).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');

// ---------- sumber tunggal pencocokan, disisipkan setelah fccBudgetVsActual_ (Financial Control core) ----------
{
  const rab = fs.readFileSync(OUT + '_rab_match.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const r = L.fnRange(doc, 'fccBudgetVsActual_');
  if (doc.t.indexOf('function rabMatchAll_(') !== -1) throw new Error('rabMatchAll_ sudah ada');
  doc.t = doc.t.slice(0, r.end) + '\n' + rab + doc.t.slice(r.end);
  log.push('inject _rab_match.js setelah fccBudgetVsActual_');
}

// ---------- sumber data: 30_ALOKASI_PENGELUARAN (sheet belum ada -> server mengembalikan baris kosong) ----------
L.rep(doc, "rkat:'18_RKAT', lpj:'19_LPJ', audit:'13_AUDIT_LOG' };",
  "rkat:'18_RKAT', lpj:'19_LPJ', audit:'13_AUDIT_LOG', alokasiPengeluaran:'30_ALOKASI_PENGELUARAN' }; // [P1-RAB] alokasiPengeluaran", 'OP_SHEETS', log);
L.rep(doc, "const KPI_SOURCE_KEYS_ = ['transaksi', 'alokasi', 'kewajiban', 'anggaran', 'komitmen', 'bukti', 'mutasiBank', 'rekonsiliasi', 'laporan'];",
  "const KPI_SOURCE_KEYS_ = ['transaksi', 'alokasi', 'kewajiban', 'anggaran', 'komitmen', 'bukti', 'mutasiBank', 'rekonsiliasi', 'laporan', 'alokasiPengeluaran']; // [P1-RAB] BDS03 membaca pemetaan eksplisit", 'KPI_SOURCE_KEYS_', log);
L.rep(doc, "    alokasi:OperationalAPI.alokasi(), komponen:MasterAPI.components(), kategoriPengeluaran:MasterAPI.expenseCategories(), tagihan:",
  "    alokasi:OperationalAPI.alokasi(), alokasiPengeluaran:rabDataClient_().alokasiPengeluaran, komponen:MasterAPI.components(), kategoriPengeluaran:MasterAPI.expenseCategories(), tagihan:", 'centralFccData_', log);
L.rep(doc, "function pengeluaranPunyaPersetujuan(t){ return Store.loadObligasi().some(o=>o.transaksiId===t.id); }",
  `function pengeluaranPunyaPersetujuan(t){ return Store.loadObligasi().some(o=>o.transaksiId===t.id); }
/* [P1-RAB] Data aturan pencocokan bersama (sumber sama dengan Financial Control). anggaranRabFor/realisasiForProgram
   (aturan lama program === kategori) dipertahankan sebagai fungsi tetapi TIDAK lagi dipakai KPI maupun tampilan anggaran. */
function rabDataClient_(){ const st = OperationalCache.states.alokasiPengeluaran; return {transaksi:allTransaksi(), anggaran:Store.loadAnggaran(), alokasiPengeluaran:(st && st.loaded && !st.error) ? st.rows : [], kategoriPengeluaran:MasterAPI.expenseCategories()}; }
function rabMatchClient_(){ return rabMatchAll_(rabDataClient_()); }
function rabCatatanGaris_(M, id){ const k = M.rowLine[String(id)], g = k && M.lineByKey[k]; return (g && g.rabIds.length > 1) ? ' <span class="small-muted">(realisasi garis '+fmtRp(g.realisasi)+', '+g.rabIds.length+' baris)</span>' : ''; }`, 'helper rabDataClient_/rabMatchClient_', log);

// ---------- KPI BDS03 (di financialAktivitasFeed) ----------
L.rep(doc, `    const tPeriode = periodeOfDate(t.tanggal);
    const rab = anggaranRabFor(t.kategori, tPeriode);
    const disetujui = pengeluaranPunyaPersetujuan(t);`,
`    // [P1-RAB] "ada RAB" = transaksi terpetakan PENUH (eksplisit 30_ALOKASI_PENGELUARAN atau aturan kategori) ke RAB DISETUJUI
    const rm = RAB_M_.perTrx[t.id];
    const rab = !!(rm && rm.disetujui);
    const disetujui = pengeluaranPunyaPersetujuan(t); // K-RAB-07 belum disetujui: tidak diubah`, 'BDS03-I03/I05 input', log);
L.rep(doc, `  // ===== BDS03 - Pengeluaran & Pengendalian RAB =====
  pengeluaran.forEach(t=>{`, `  // ===== BDS03 - Pengeluaran & Pengendalian RAB =====
  const RAB_M_ = rabMatchClient_(); // [P1-RAB] satu aturan pencocokan untuk I03/I04/I05 dan Financial Control
  pengeluaran.forEach(t=>{`, 'BDS03 RAB_M_', log);
L.rep(doc, `  anggaran.forEach(a=>{
    // Realisasi Tidak Melebihi Pagu (populasi PER-BARIS RAB, bukan per-transaksi - hindari inflasi populasi)
    const real = realisasiForProgram(a.program, a.periode);
    const ok = real <= Number(a.nominal||0)+0.5;
    const tglAnchor = anchorDateForPeriode(a.periode) || anchor;
    out.push(mkAkt('BDS03-I04', tglAnchor, ok, refAnggaran(a), {hasEvidence:true}));
  });`, `  RAB_M_.lines.filter(g=>g.paguDisetujui > 0).forEach(g=>{
    // [P1-RAB] Realisasi Tidak Melebihi Pagu: populasi PER GARIS anggaran ber-RAB DISETUJUI (K-RAB-04/05); realisasi garis =
    // bagian eksplisit + aturan kategori tanpa hitung ganda. Tanpa garis disetujui -> tanpa aktivitas -> aturan N/A yang berlaku.
    const a = anggaran.find(x=>String(x.id)===g.rabIdsDisetujui.slice().sort()[0]) || {id:g.rabIdsDisetujui[0], program:g.kategori, periode:g.periode};
    const ok = g.realisasi <= g.paguDisetujui+0.5;
    const tglAnchor = anchorDateForPeriode(g.periode) || anchor;
    out.push(mkAkt('BDS03-I04', tglAnchor, ok, refAnggaran(a), {hasEvidence:true}));
  });`, 'BDS03-I04 per garis', log);

// ---------- K-RAB-06: teks dokumentasi formula (bobot 25/20/15 tidak berubah) ----------
L.rep(doc, "    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan (beda dari I04: I03=kesesuaian kategori dgn RAB, I04=kepatuhan pagu agregat; beda dari I05: I03=STRICT harus ada RAB, persetujuan TIDAK menggantikan RAB di sini)',\n    formula:'ok HANYA jika kategori transaksi cocok dengan baris Anggaran/RAB periode tsb (RAB match murni) - persetujuan ObligasiSekolah TIDAK membuat ok=true di sini (itu tugas I05, supaya tidak overlap/double-count)',",
  "    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan (beda dari I04: I03=kesesuaian transaksi dgn RAB, I04=kepatuhan pagu per garis anggaran; beda dari I05: I03=STRICT harus ada RAB disetujui, persetujuan TIDAK menggantikan RAB di sini)',\n    formula:'ok HANYA jika transaksi terpetakan PENUH ke RAB berstatus DISETUJUI: lewat pemetaan eksplisit 30_ALOKASI_PENGELUARAN (tingkat ITEM), atau bila tanpa pemetaan eksplisit lewat garis anggaran kategori+subkategori+unit+periode (aturan Financial Control). Sisa nominal tanpa alokasi eksplisit = tidak terpetakan; RAB DIAJUKAN/tanpa status bukan RAB disetujui - persetujuan ObligasiSekolah TIDAK membuat ok=true di sini (itu tugas I05)',", 'formula I03', log);
L.rep(doc, "    population:'Semua baris Anggaran/RAB pada periode berjalan (populasi per-baris RAB, bukan per-transaksi)',\n    formula:'ok jika total realisasi pengeluaran kategori tsb pada periode <= nominal pagu RAB',",
  "    population:'Semua garis anggaran (kategori+subkategori+unit+periode) yang memiliki RAB berstatus DISETUJUI pada periode berjalan (populasi per-garis, bukan per-transaksi; tanpa garis disetujui -> N/A)',\n    formula:'ok jika realisasi garis (bagian eksplisit 30_ALOKASI_PENGELUARAN + bagian aturan kategori, tanpa hitung ganda) <= pagu RAB DISETUJUI garis tsb',", 'formula I04', log);
L.rep(doc, "    formula:'ok jika ADA baris RAB untuk kategori/periode tsb, ATAU (TIDAK ada RAB TAPI transaksi tertaut ke ObligasiSekolah sebagai bukti persetujuan) - pengeluaran darurat di luar RAB tidak otomatis jadi masalah jika sudah disetujui',",
  "    formula:'ok jika transaksi lulus I03 (terpetakan penuh ke RAB DISETUJUI), ATAU (tidak ada RAB disetujui TAPI transaksi tertaut ke ObligasiSekolah sebagai bukti persetujuan) - pengeluaran darurat di luar RAB tidak otomatis jadi masalah jika sudah disetujui',", 'formula I05', log);

// ---------- tampilan & antrean kerja ----------
L.replFn(doc, 'rabMendekatiPagu', `
function rabMendekatiPagu(periode){
  const ambang = Number(Store.loadSettings().budgetNearLimitPct||80);
  const RM = rabMatchClient_(), ang = Store.loadAnggaran(); // [P1-RAB] dinilai per garis berpagu DISETUJUI
  return RM.lines.filter(g=>g.periode===periode && g.paguDisetujui>0).filter(g=>{
    const pct = g.realisasi/g.paguDisetujui*100;
    return pct>=ambang && pct<100;
  }).map(g=>ang.find(a=>String(a.id)===g.rabIdsDisetujui.slice().sort()[0])).filter(Boolean);
}`, log);
L.replFn(doc, 'pengeluaranDiLuarRabBulanIni', `
function pengeluaranDiLuarRabBulanIni(periode){
  const RM = rabMatchClient_(); // [P1-RAB] "di luar RAB" = tidak terpetakan penuh ke RAB DISETUJUI
  return pengeluaranListReal().filter(t=>periodeOfDate(t.tanggal)===periode).filter(t=>!(RM.perTrx[t.id] && RM.perTrx[t.id].disetujui) && !pengeluaranPunyaPersetujuan(t));
}`, log);
L.rep(doc, `  const totalAnggaran = sum(anggaranPeriode.map(a=>Number(a.nominal||0)));
  const totalRealisasi = sum(anggaranPeriode.map(a=>realisasiForProgram(a.program,a.periode)));`,
`  // [P1-RAB] dijumlah per GARIS unik (tanpa hitung ganda); anggaran = pagu DISETUJUI, belum disetujui ditampilkan terpisah
  const RMb_ = rabMatchClient_(), garisPeriode_ = RMb_.lines.filter(g=>g.periode===periode);
  const totalAnggaran = sum(garisPeriode_.map(g=>g.paguDisetujui));
  const totalRealisasi = sum(RMb_.transaksi.filter(r=>r.periode===periode).map(r=>sum(r.bagian.filter(b=>RMb_.lineByKey[b.lineKey].periode===periode).map(b=>b.nominal))));
  const anggaranBelumDisetujui_ = sum(garisPeriode_.map(g=>g.paguDiajukan+g.paguTanpaStatus+g.paguStatusLain));`, 'Beranda total per garis', log);
L.rep(doc, `      progressStat('Total Anggaran', totalAnggaran, totalAnggaran, 'var(--primary)')+
      progressStat('Realisasi', totalRealisasi, totalAnggaran, 'var(--green)')+
      progressStat('Sisa Anggaran', sisaAnggaran, totalAnggaran, 'var(--amber)')+`,
`      progressStat('Total Anggaran Disetujui', totalAnggaran, totalAnggaran, 'var(--primary)')+
      progressStat('Realisasi', totalRealisasi, totalAnggaran, 'var(--green)')+
      progressStat('Sisa Anggaran', sisaAnggaran, totalAnggaran, 'var(--amber)')+
      '<div class="kv" style="margin-top:6px"><div>Anggaran belum disetujui (diajukan/tanpa status)</div><div>'+fmtRp(anggaranBelumDisetujui_)+'</div></div>'+`, 'Beranda kartu RAB', log);
L.rep(doc, "    anggaran.forEach(a=>{ const real = realisasiForProgram(a.program, a.periode); html += '<tr><td>'+esc(a.program)+'</td><td>'+fmtRp(a.nominal)+'</td><td>'+fmtRp(real)+'</td>",
  "    const RM_ = rabMatchClient_(); anggaran.forEach(a=>{ const real = rabRealisasiBaris_(RM_, a.id); html += '<tr><td>'+esc(a.program)+'</td><td>'+fmtRp(a.nominal)+'</td><td>'+fmtRp(real)+rabCatatanGaris_(RM_, a.id)+'</td>", 'tab realisasi', log);
L.rep(doc, "    anggaran.forEach(a=>{ const real=realisasiForProgram(a.program,a.periode); const kom=komitmenForRab(a.id);",
  "    const RM2_ = rabMatchClient_(); anggaran.forEach(a=>{ const real=rabRealisasiBaris_(RM2_, a.id); const kom=komitmenForRab(a.id);", 'tab sisa', log);
L.rep(doc, "    anggaranRealisasi: anggaranPeriode.map(a=>({program:a.program, periode:a.periode, anggaran:Number(a.nominal||0), realisasi:realisasiForProgram(a.program, a.periode)})),",
  "    anggaranRealisasi: (function(){ const RM_ = rabMatchClient_(); return anggaranPeriode.map(a=>({program:a.program, periode:a.periode, anggaran:Number(a.nominal||0), realisasi:rabRealisasiBaris_(RM_, a.id), statusRab:rabStatusOf_(a), realisasiGaris:((RM_.lineByKey[RM_.rowLine[a.id]]||{}).realisasi)||0})); })(), // [P1-RAB]", 'snapshot laporan', log);
L.rep(doc, "        (rows.length?rows.map(a=>{ const real=realisasiForProgram(a.program,a.periode); return '<tr><td>'+esc(a.program)+'</td><td>'+esc(a.periode)+'</td><td>'+fmtRp(a.nominal)+'</td><td>'+fmtRp(real)+'</td><td>'+fmtRp(a.nominal-real)+'</td></tr>'; }).join(''):",
  "        (rows.length?(function(){ const RM_ = rabMatchClient_(); return rows.map(a=>{ const real=rabRealisasiBaris_(RM_, a.id); return '<tr><td>'+esc(a.program)+'</td><td>'+esc(a.periode)+'</td><td>'+fmtRp(a.nominal)+'</td><td>'+fmtRp(real)+rabCatatanGaris_(RM_, a.id)+'</td><td>'+fmtRp(a.nominal-real)+'</td></tr>'; }).join(''); })():", 'laporan anggaran', log);

// ekspor laporan anggaran = tabel laporan anggaran di layar (aturan pencocokan bersama, per baris tanpa mengarang pembagian)
L.rep(doc, "['Program','Periode','Anggaran','Realisasi'],rows.map(a=>[a.program,a.periode,a.nominal,realisasiForProgram(a.program,a.periode)]),{currencyCols:[2,3]}); }",
  "['Program','Periode','Anggaran','Realisasi'],(function(){ const RM_ = rabMatchClient_(); return rows.map(a=>[a.program,a.periode,a.nominal,rabRealisasiBaris_(RM_, a.id)]); })(),{currencyCols:[2,3]}); } // [P1-RAB]", 'ekspor laporan anggaran', log);
L.save(doc);
fs.writeFileSync(require('path').join(OUT, '_p1_rab_client_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p1_rab_client OK: ' + log.length + ' perubahan');
