/**
 * FinanceEngine.gs - Financial Control Center (server).
 * Inti hitungan (fccCompute_) adalah SALINAN IDENTIK dari kode yang dipakai klien (_fcc_pure.js).
 * Fungsi publik: opFinancialControl(periode).
 * STATUS: diverifikasi lewat tes diferensial sandbox. BELUM dijalankan di Apps Script sungguhan.
 */
/* FINANCIAL CONTROL CORE - kode IDENTIK dipakai di klien (Bendahara_V2.html) dan server (FinanceEngine.gs).
   Murni: tidak menyentuh DOM, Store, Sheets. Input = data mentah (baris sheet/objek lokal); output = struktur hasil.
   Definisi (ditulis eksplisit supaya tidak ada interpretasi diam-diam):
   ACTUAL      = transaksi aktual non-arsip (PENERIMAAN/PENGELUARAN) + saldo awal akun -> Actual Cash Position.
   COMMITTED   = komitmen berstatus COMMITTED (disetujui) dan INCURRED (terjadi, belum dibayar).
   PLANNED     = RAB/anggaran periode (08) dan pagu RKAT tahun periode (18).
   EXPECTED    = komitmen berstatus EXPECTED.
   MISSING     = garis RAB pengeluaran periode berpagu DISETUJUI tanpa realisasi (pencocokan bersama rabMatchAll_) dan tanpa komitmen
                 (biaya yang diharapkan tapi belum tercatat) + kategori data kosong. [P1-RAB]
   Completeness = persentase kategori data yang LENGKAP pada periode. Bila < 100 hasil BUKAN "surplus". */
var FCC_BULAN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function fccPeriodeOfDate_(tanggal) {
  var m = /^(\d{4})-(\d{2})/.exec(String(tanggal || ''));
  if (!m) return '';
  var mi = Number(m[2]) - 1;
  return (mi >= 0 && mi < 12) ? (FCC_BULAN_[mi] + ' ' + m[1]) : '';
}
function fccNum_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function fccCompute_(periode, D) {
  D = D || {};
  var alive = function (r) { return !r.archivedAt; };
  var trx = (D.transaksi || []).filter(alive), akun = (D.akun || []).filter(function (a) { return a.status !== 'Nonaktif'; });
  var ang = (D.anggaran || []).filter(alive), kom = (D.komitmen || []).filter(alive), rkat = (D.rkat || []).filter(alive), rekon = (D.rekonsiliasi || []).filter(alive);
  var inc = trx.filter(function (t) { return t.jenis === 'PENERIMAAN'; }), exp = trx.filter(function (t) { return t.jenis === 'PENGELUARAN'; });
  var inP = function (t) { return fccPeriodeOfDate_(t.tanggal) === periode; };
  var sum = function (arr, f) { return arr.reduce(function (s, x) { return s + fccNum_(f(x)); }, 0); };
  var nominal = function (x) { return x.nominal; };
  var cashByAccount = akun.map(function (a) {
    var masuk = sum(inc.filter(function (t) { return t.akunId === a.id; }), nominal), keluar = sum(exp.filter(function (t) { return t.akunId === a.id; }), nominal);
    return { akunId: a.id, nama: a.nama, jenis: a.jenis, saldo: fccNum_(a.saldoAwal) + masuk - keluar };
  });
  var cashPosition = sum(cashByAccount, function (c) { return c.saldo; });
  var byStatus = function (s) { return sum(kom.filter(function (o) { return o.status === s; }), nominal); };
  var committed = byStatus('COMMITTED'), incurred = byStatus('INCURRED'), expectedCost = byStatus('EXPECTED');
  var rabRows = ang.filter(function (a) { return a.periode === periode; });
  var year = (/\d{4}/.exec(String(periode || '')) || [''])[0];
  var rkatPagu = sum(rkat.filter(function (r) { return String(r.tahun) === year; }), function (r) { return r.pagu; });
  /* [P1-RAB] MISSING = garis anggaran pengeluaran periode ini dengan pagu DISETUJUI yang belum punya realisasi (aturan pencocokan
     bersama rabMatchAll_, bukan lagi kategori === program) dan belum punya komitmen COMMITTED/INCURRED. */
  var RM = rabMatchAll_(D), actL = {};
  RM.transaksi.forEach(function (r) { if (r.periode === periode) r.bagian.forEach(function (b) { actL[b.lineKey] = (actL[b.lineKey] || 0) + b.nominal; }); });
  var missing = RM.lines.filter(function (L) {
    if (L.periode !== periode || !(L.paguDisetujui > 0)) return false;
    var ids = {}; L.rabIds.forEach(function (id) { ids[id] = 1; });
    var kt = sum(kom.filter(function (o) { return ids[o.rabId] && (o.status === 'COMMITTED' || o.status === 'INCURRED'); }), nominal);
    return (actL[L.key] || 0) + kt === 0;
  }).map(function (L) {
    var first = ang.filter(function (a) { return String(a.id) === L.rabIdsDisetujui.slice().sort()[0]; })[0] || {};
    return { id: first.id, program: first.program || (L.kategori + (L.subkategori ? ' / ' + L.subkategori : '')), nominal: L.paguDisetujui, lineKey: L.key, rabIds: L.rabIds.slice() };
  });
  var perStatus = { disetujui: 0, diajukan: 0, tanpaStatus: 0, statusLain: 0 };
  RM.lines.forEach(function (L) { if (L.periode !== periode) return; perStatus.disetujui += L.paguDisetujui; perStatus.diajukan += L.paguDiajukan; perStatus.tanpaStatus += L.paguTanpaStatus; perStatus.statusLain += L.paguStatusLain; });
  var cats = [
    ['Penerimaan', inc.length > 0, inc.some(inP)], ['Pengeluaran', exp.length > 0, exp.some(inP)],
    ['Anggaran/RAB', ang.length > 0, rabRows.length > 0], ['Rekonsiliasi', rekon.length > 0, rekon.some(function (r) { return r.periode === periode; })],
    ['Obligasi', kom.length > 0, kom.some(function (o) { return fccPeriodeOfDate_(o.tanggal) === periode; })]
  ];
  var checklist = cats.map(function (c) { return { kategori: c[0], status: c[2] ? 'LENGKAP' : (c[1] ? 'BELUM TERCATAT' : 'DATA BELUM TERSEDIA') }; });
  var pct = Math.round(checklist.filter(function (c) { return c.status === 'LENGKAP'; }).length / checklist.length * 100);
  var warnings = [];
  if (pct < 100) warnings.push('Data keuangan baru ' + pct + '% lengkap pada periode ini - angka di bawah adalah posisi AKTUAL, bukan surplus.');
  if (missing.length) warnings.push(missing.length + ' item RAB belum punya realisasi/komitmen (biaya yang diharapkan belum tercatat).');
  var inP2 = inc.filter(inP), exP2 = exp.filter(inP);
  return {
    periode: periode,
    actual: { incomePeriode: sum(inP2, nominal), expensePeriode: sum(exP2, nominal), netPeriode: sum(inP2, nominal) - sum(exP2, nominal), cashPosition: cashPosition, cashByAccount: cashByAccount },
    committed: { committed: committed, incurredUnpaid: incurred, total: committed + incurred },
    planned: { rabPeriode: sum(rabRows, nominal), rabPengeluaranPerStatus: perStatus, rkatPaguTahun: rkatPagu }, // [P1-RAB] rabPeriode tetap (semua status); rincian status terpisah
    expected: { expectedCost: expectedCost },
    missing: { rabTanpaRealisasi: missing, unrecordedExpectedCost: sum(missing, function (m) { return m.nominal; }) },
    afterCommitments: cashPosition - committed - incurred - expectedCost,
    completeness: { pct: pct, checklist: checklist },
    label: pct < 100 ? 'Actual Cash Position - Data ' + pct + '% Lengkap (belum lengkap, bukan surplus)' : 'Actual Cash Position (Lengkap)',
    warnings: warnings,
    anggaranVsAktual: fccBudgetVsActual_(periode, D)
  };
}

/* ANGGARAN vs AKTUAL per KOMPONEN / KATEGORI (pemasukan dan pengeluaran dipisah, tidak dicampur).
   Pemasukan : anggaran jenis PEMASUKAN -> komponenId + unit + periode. Aktual = ALOKASI pembayaran (bukan nominal transaksi) ke komponen itu.
               Garis periode-bulan  : alokasi atas kewajiban bulanan, dibayar pada bulan tsb (basis kas).
               Garis non-bulan (mis. "Tahun Ajaran 2026/2027", "SekaliBayar"): alokasi dengan periode kewajiban yang SAMA.
               Setiap alokasi masuk TEPAT SATU jenis garis (tidak terhitung ganda).
   Pengeluaran: anggaran jenis kosong/PENGELUARAN -> garis kategori (+subkategori) + unit + periode. Aktual = bagian transaksi PENGELUARAN
               non-arsip menurut rabMatchAll_ ([P1-RAB]: eksplisit 30_ALOKASI_PENGELUARAN -> aturan kategori). Anggaran = pagu DISETUJUI;
               DIAJUKAN / tanpa status / status lain ditampilkan terpisah.
   Komitmen (09) dan tagihan (04) ditampilkan di kolom TERPISAH, tidak pernah dijumlahkan ke aktual. */
function fccIsMonthLabel_(p) { return /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/.test(String(p || '')); }
function fccTaOfPeriode_(p) {
  var m = /^(\S+) (\d{4})$/.exec(String(p || '')); if (!m) return '';
  var mi = FCC_BULAN_.indexOf(m[1]); if (mi < 0) return '';
  var y = Number(m[2]); return mi >= 6 ? (y + '/' + (y + 1)) : ((y - 1) + '/' + y);
}
function fccNorm_(s) { return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function fccBudgetVsActual_(periode, D) {
  D = D || {};
  var alive = function (r) { return !r.archivedAt; };
  var trx = (D.transaksi || []).filter(alive), alok = (D.alokasi || []).filter(alive), ang = (D.anggaran || []).filter(alive), kom = (D.komitmen || []).filter(alive);
  var trxById = {}; trx.forEach(function (t) { trxById[t.id] = t; });
  var komById = {}; (D.komponen || []).forEach(function (k) { komById[k.id] = k; });
  var katName = {}; (D.kategoriPengeluaran || []).forEach(function (k) { katName[fccNorm_(k.id)] = fccNorm_(k.kategori); });
  var kn = function (v) { var n = fccNorm_(v); return katName[n] !== undefined ? katName[n] : n; };
  var ta = fccTaOfPeriode_(periode);
  var inScope = function (a) { var p = String(a.periode || ''); return p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta)); };
  var lines = ang.filter(inScope);
  var rows = [], invalid = [];
  // ---- PEMASUKAN ----
  var incLines = {};
  lines.filter(function (a) { return a.jenis === 'PEMASUKAN'; }).forEach(function (a) {
    if (!a.komponenId || (D.komponen && !komById[a.komponenId])) { invalid.push({ id: a.id, periode: a.periode, alasan: 'Anggaran pemasukan tanpa komponen yang valid' }); return; }
    if (a.unit !== 'TK' && a.unit !== 'MI') { invalid.push({ id: a.id, periode: a.periode, alasan: 'Unit anggaran pemasukan tidak valid' }); return; }
    var k = [a.komponenId, a.unit, a.periode].join('|');
    incLines[k] = incLines[k] || { komponenId: a.komponenId, unit: a.unit, periode: a.periode, anggaran: 0 };
    incLines[k].anggaran += fccNum_(a.nominal);
  });
  var incTrx = trx.filter(function (t) { return t.jenis === 'PENERIMAAN'; });
  Object.keys(incLines).sort().forEach(function (k) {
    var L = incLines[k], isMonth = fccIsMonthLabel_(L.periode), aktual = 0;
    alok.forEach(function (a) {
      var t = trxById[a.transaksiId]; if (!t || t.jenis !== 'PENERIMAAN' || a.komponenId !== L.komponenId || t.unit !== L.unit) return;
      var ob = String(a.periode || '');
      if (isMonth) { if (fccIsMonthLabel_(ob) && fccPeriodeOfDate_(t.tanggal) === L.periode) aktual += fccNum_(a.nominal); }
      else if (ob === L.periode) aktual += fccNum_(a.nominal);
    });
    var tagihan = null;
    if (D.tagihan) { tagihan = 0; D.tagihan.forEach(function (o) { if (o.komponenId === L.komponenId && o.unit === L.unit && o.periode === L.periode) tagihan += fccNum_(o.netto); }); }
    var kmp = komById[L.komponenId];
    rows.push({ jenis: 'PEMASUKAN', periode: L.periode, unit: L.unit, komponenId: L.komponenId, nama: kmp ? kmp.nama : L.komponenId, anggaran: L.anggaran, komitmen: null, tagihan: tagihan, aktual: aktual,
      selisih: L.anggaran - aktual, status: aktual === 0 ? 'BELUM ADA PENERIMAAN' : (aktual >= L.anggaran ? 'TERCAPAI' : 'DI BAWAH ANGGARAN') });
  });
  // ---- PENGELUARAN ---- [P1-RAB] aktual dari aturan pencocokan bersama rabMatchAll_ (eksplisit -> kategori -> tanpa RAB);
  // anggaran dipisah per status RAB; status baris dinilai terhadap anggaran DISETUJUI saja (K-RAB-02/05).
  lines.filter(function (a) { return a.jenis !== 'PEMASUKAN'; }).forEach(function (a) {
    if (!a.kategori) { invalid.push({ id: a.id, periode: a.periode, alasan: 'Anggaran pengeluaran tanpa kategori' }); return; }
    if (a.unit !== 'TK' && a.unit !== 'MI') invalid.push({ id: a.id, periode: a.periode, alasan: 'Unit anggaran pengeluaran tidak valid' });
  });
  var M = rabMatchAll_(D);
  var act = {}, actE = {}, actK = {}, noBudget = {}, sisa = { jumlahTransaksi: 0, total: 0 };
  M.transaksi.forEach(function (r) {
    if (r.periode !== periode) return;
    r.bagian.forEach(function (b) {
      act[b.lineKey] = (act[b.lineKey] || 0) + b.nominal;
      if (b.sumber === 'EKSPLISIT') actE[b.lineKey] = (actE[b.lineKey] || 0) + b.nominal; else actK[b.lineKey] = (actK[b.lineKey] || 0) + b.nominal;
    });
    if (r.sisaTidakTerpetakan > 0.5) { sisa.jumlahTransaksi++; sisa.total += r.sisaTidakTerpetakan; }
    if (r.tanpaRab > 0) {
      var k = [fccNorm_(r.kategori), fccNorm_(r.subkategori), r.unit].join('|');
      noBudget[k] = noBudget[k] || { kategori: r.kategori || '(tanpa kategori)', subkategori: r.subkategori || '', unit: r.unit, jumlah: 0, total: 0 };
      noBudget[k].jumlah++; noBudget[k].total += r.tanpaRab;
    }
  });
  M.lines.filter(function (L) { return L.byKategori && inScope(L); }).sort(function (x, y) { return x.key < y.key ? -1 : (x.key > y.key ? 1 : 0); }).forEach(function (L) {
    var aktual = act[L.key] || 0, komitmen = 0, expected = 0, ids = {};
    L.rabIds.forEach(function (id) { ids[id] = 1; });
    kom.forEach(function (o) { if (!ids[o.rabId]) return; if (o.status === 'COMMITTED' || o.status === 'INCURRED') komitmen += fccNum_(o.nominal); else if (o.status === 'EXPECTED') expected += fccNum_(o.nominal); });
    var ang = L.paguDisetujui;
    rows.push({ jenis: 'PENGELUARAN', periode: L.periode, unit: L.unit, kategori: L.kategori, subkategori: L.subkategori, nama: L.kategori + (L.subkategori ? ' / ' + L.subkategori : ''), anggaran: ang, komitmen: komitmen, diharapkan: expected, tagihan: null, aktual: aktual,
      selisih: ang - aktual - komitmen, status: ang <= 0 ? 'ANGGARAN BELUM DISETUJUI' : ((aktual + komitmen > ang) ? 'MELEBIHI ANGGARAN' : ((aktual + komitmen) === 0 ? 'BELUM ADA REALISASI' : 'DALAM ANGGARAN')),
      anggaranDisetujui: L.paguDisetujui, anggaranDiajukan: L.paguDiajukan, anggaranTanpaStatus: L.paguTanpaStatus, anggaranStatusLain: L.paguStatusLain,
      aktualEksplisit: actE[L.key] || 0, aktualKategori: actK[L.key] || 0, lineKey: L.key, rabIds: L.rabIds.slice() });
  });
  // garis tunggal tanpa kategori/unit valid: hanya dapat menerima pemetaan eksplisit; realisasinya dilaporkan di sini (bukan dihilangkan)
  invalid.forEach(function (v) { var key = M.rowLine[String(v.id)]; if (key && act[key]) v.realisasiEksplisit = act[key]; });
  // ---- penerimaan yang belum dialokasikan ke komponen (bukan anggaran, bukan tagihan) ----
  var allocBy = {}; alok.forEach(function (a) { allocBy[a.transaksiId] = (allocBy[a.transaksiId] || 0) + fccNum_(a.nominal); });
  var unalloc = { jumlahTransaksi: 0, total: 0 };
  incTrx.filter(function (t) { return fccPeriodeOfDate_(t.tanggal) === periode; }).forEach(function (t) {
    var sisa = fccNum_(t.nominal) - (allocBy[t.id] || 0);
    if (sisa > 0.5) { unalloc.jumlahTransaksi++; unalloc.total += sisa; }
  });
  return { periode: periode, tahunAjaran: ta, rows: rows, transaksiTanpaAnggaran: Object.keys(noBudget).sort().map(function (k) { return noBudget[k]; }), sisaTidakTerpetakan: sisa, pencocokanBermasalah: M.issues, ringkasanPeriode: rabRingkasanPeriode_(M, periode), pemasukanBelumDialokasi: unalloc, anggaranTidakValid: invalid };
}
/* RAB MATCH CORE - [P1-RAB] kode IDENTIK dipakai klien (Bendahara_V2.html) dan server (FinanceEngine.gs).
   Satu-satunya aturan pencocokan PENGELUARAN -> garis anggaran (08_ANGGARAN) untuk KPI BDS03-I03/I04/I05 dan
   Financial Control. Murni: tidak menyentuh DOM, Store, Sheets. Keputusan K-RAB-01..06 (19-10-2026), P1_06 §4.3.
   Urutan per transaksi PENGELUARAN aktif:
     1. pemetaan EKSPLISIT 30_ALOKASI_PENGELUARAN (alokasi aktif & valid); sisa tanpa alokasi = TIDAK TERPETAKAN
        (tidak dicocokkan ulang - K-RAB-03); Σ alokasi > nominal -> seluruh alokasi diabaikan + dilaporkan;
     2. bila tidak ada pemetaan eksplisit: aturan KATEGORI (identik fccBudgetVsActual_: kategori ternormalisasi,
        subkategori spesifik menang, unit sama, garis periode-bulan, transaksi bulan yang sama);
     3. selain itu TANPA RAB.
   Garis anggaran: kunci kn(kategori)|norm(subkategori)|unit|periode; baris tanpa kategori/unit valid = garis
   tunggal 'BARIS|<id>' (hanya lewat pemetaan eksplisit). Setiap rupiah masuk ke paling banyak SATU garis.
   Status RAB (huruf besar): DISETUJUI | DIAJUKAN | TANPA_STATUS (kosong) | STATUS_LAIN; hanya DISETUJUI = disetujui.
   Bergantung pada: fccNorm_, fccNum_, fccPeriodeOfDate_, fccIsMonthLabel_ (Financial Control core). */
function rabStatusOf_(a) {
  var s = String(a && a.status !== null && a.status !== undefined ? a.status : '').trim().toUpperCase();
  if (s === 'DISETUJUI' || s === 'DIAJUKAN') return s;
  return s === '' ? 'TANPA_STATUS' : 'STATUS_LAIN';
}
function rabLineStatus_(L) {
  return L.paguDisetujui > 0 ? 'DISETUJUI' : (L.paguDiajukan > 0 ? 'DIAJUKAN' : (L.paguTanpaStatus > 0 ? 'TANPA_STATUS' : 'STATUS_LAIN'));
}
function rabMatchAll_(D) {
  D = D || {};
  var alive = function (r) { return r && !r.archivedAt; };
  var katName = {}; (D.kategoriPengeluaran || []).forEach(function (k) { katName[fccNorm_(k.id)] = fccNorm_(k.kategori); });
  var kn = function (v) { var n = fccNorm_(v); return katName[n] !== undefined ? katName[n] : n; };
  var lines = {}, order = [], rowLine = {}, rowById = {}, specificSub = {}, rowEksplisit = {};
  (D.anggaran || []).filter(alive).filter(function (a) { return a.jenis !== 'PEMASUKAN'; }).forEach(function (a) {
    var id = String(a.id), per = String(a.periode || ''), valid = !!a.kategori && (a.unit === 'TK' || a.unit === 'MI');
    var key = valid ? [kn(a.kategori), fccNorm_(a.subkategori), a.unit, per].join('|') : 'BARIS|' + id;
    if (!lines[key]) {
      lines[key] = { key: key, kategori: a.kategori || '', subkategori: a.subkategori || '', unit: a.unit || '', periode: per, byKategori: valid,
        rabIds: [], rabIdsDisetujui: [], paguDisetujui: 0, paguDiajukan: 0, paguTanpaStatus: 0, paguStatusLain: 0,
        realisasi: 0, realisasiEksplisit: 0, realisasiKategori: 0, transaksiIds: [] };
      order.push(key);
    }
    var L = lines[key], st = rabStatusOf_(a), n = fccNum_(a.nominal);
    L.rabIds.push(id); rowLine[id] = key; rowById[id] = a; rowEksplisit[id] = 0;
    if (st === 'DISETUJUI') { L.paguDisetujui += n; L.rabIdsDisetujui.push(id); }
    else if (st === 'DIAJUKAN') L.paguDiajukan += n;
    else if (st === 'TANPA_STATUS') L.paguTanpaStatus += n;
    else L.paguStatusLain += n;
    if (valid && a.subkategori) { var sk = [kn(a.kategori), a.unit, per].join('|'); specificSub[sk] = specificSub[sk] || {}; specificSub[sk][fccNorm_(a.subkategori)] = 1; }
  });
  var trxAll = {}; (D.transaksi || []).forEach(function (t) { trxAll[String(t.id)] = t; });
  var eks = {}, issues = [];
  (D.alokasiPengeluaran || []).filter(alive).forEach(function (x) {
    var tid = String(x.transaksiId || ''), aid = String(x.anggaranId || ''), n = fccNum_(x.nominal), t = trxAll[tid];
    if (!t || t.archivedAt || t.jenis !== 'PENGELUARAN') { issues.push({ alokasiId: String(x.id), transaksiId: tid, masalah: 'TRANSAKSI_TIDAK_VALID' }); return; }
    if (!rowById[aid]) { issues.push({ alokasiId: String(x.id), anggaranId: aid, masalah: 'ANGGARAN_TIDAK_VALID' }); return; }
    if (!(n > 0)) { issues.push({ alokasiId: String(x.id), masalah: 'NOMINAL_TIDAK_VALID' }); return; }
    (eks[tid] = eks[tid] || []).push({ alokasiId: String(x.id), anggaranId: aid, nominal: n });
  });
  var perTrx = {}, list = [];
  (D.transaksi || []).filter(alive).filter(function (t) { return t.jenis === 'PENGELUARAN'; }).forEach(function (t) {
    var id = String(t.id), nom = fccNum_(t.nominal), per = fccPeriodeOfDate_(t.tanggal);
    var r = { transaksiId: id, periode: per, kategori: t.kategori || '', subkategori: t.subkategori || '', unit: t.unit || '', nominal: nom,
      sumber: 'TANPA_RAB', bagian: [], terpetakan: 0, sisaTidakTerpetakan: 0, tanpaRab: 0, disetujui: false, alasan: '' };
    var ex = eks[id];
    if (ex && ex.length) {
      var tot = ex.reduce(function (s, e) { return s + e.nominal; }, 0);
      if (tot > nom + 0.5) {
        issues.push({ transaksiId: id, masalah: 'ALOKASI_MELEBIHI_NOMINAL', totalAlokasi: tot, nominal: nom });
        r.alasan = 'Alokasi eksplisit melebihi nominal transaksi (diabaikan; perlu pemeriksaan)';
      } else {
        r.sumber = 'EKSPLISIT';
        ex.forEach(function (e) { r.bagian.push({ lineKey: rowLine[e.anggaranId], anggaranId: e.anggaranId, nominal: e.nominal, statusRab: rabStatusOf_(rowById[e.anggaranId]), sumber: 'EKSPLISIT' }); rowEksplisit[e.anggaranId] += e.nominal; });
        r.terpetakan = tot; r.sisaTidakTerpetakan = Math.max(0, nom - tot);
      }
    } else {
      var ts = fccNorm_(t.subkategori), hit = null;
      if (fccIsMonthLabel_(per)) order.forEach(function (key) {
        var L = lines[key];
        if (hit || !L.byKategori || L.periode !== per || t.unit !== L.unit || kn(t.kategori) !== kn(L.kategori)) return;
        var sp = specificSub[[kn(L.kategori), L.unit, L.periode].join('|')] || {};
        if (L.subkategori ? ts === fccNorm_(L.subkategori) : (!ts || !sp[ts])) hit = L;
      });
      if (hit) { r.sumber = 'KATEGORI'; r.bagian.push({ lineKey: hit.key, anggaranId: null, nominal: nom, statusRab: rabLineStatus_(hit), sumber: 'KATEGORI' }); r.terpetakan = nom; }
      else r.alasan = !t.kategori ? 'Pengeluaran tanpa kategori' : 'Tidak ada pemetaan eksplisit maupun garis RAB periode ' + per + ' untuk kategori/subkategori/unit ini';
    }
    if (r.sumber === 'TANPA_RAB') r.tanpaRab = nom;
    r.disetujui = r.sumber !== 'TANPA_RAB' && r.sisaTidakTerpetakan <= 0.5 && r.bagian.every(function (b) { return b.statusRab === 'DISETUJUI'; });
    r.bagian.forEach(function (b) {
      var L = lines[b.lineKey]; L.realisasi += b.nominal;
      if (b.sumber === 'EKSPLISIT') L.realisasiEksplisit += b.nominal; else L.realisasiKategori += b.nominal;
      if (L.transaksiIds.indexOf(id) === -1) L.transaksiIds.push(id);
    });
    perTrx[id] = r; list.push(r);
  });
  return { perTrx: perTrx, transaksi: list, lines: order.map(function (k) { return lines[k]; }), lineByKey: lines, rowLine: rowLine, rowEksplisit: rowEksplisit, issues: issues };
}
/* Realisasi yang dapat ditampilkan per BARIS RAB tanpa mengarang pembagian: bagian eksplisit ke baris itu + bagian
   aturan kategori garisnya HANYA bila garis berisi satu baris (P1_06 §4.3 butir 9). */
function rabRealisasiBaris_(M, anggaranId) {
  var key = M.rowLine[String(anggaranId)];
  if (!key) return 0;
  var L = M.lineByKey[key];
  return (M.rowEksplisit[String(anggaranId)] || 0) + (L.rabIds.length === 1 ? L.realisasiKategori : 0);
}
/* [P1-RAB Keputusan 2, P1_10] Ringkasan satu periode untuk Kartu Beranda, laporan, ekspor, dan Financial Control.
   A anggaranDisetujui  = Σ pagu DISETUJUI garis periode P;
   B realisasiDisetujui = Σ bagian transaksi periode P ke garis periode P dengan statusRab DISETUJUI;
   C pengeluaranAktual  = Σ nominal SELURUH transaksi PENGELUARAN aktif periode P (tiap transaksi sekali, berapa pun alokasinya).
   C - B dirinci: terpetakanBelumDisetujui + terpetakanPeriodeLain + sisaTidakTerpetakan + tanpaRab (invarian). */
function rabRingkasanPeriode_(M, periode) {
  var r = { periode: periode, anggaranDisetujui: 0, anggaranBelumDisetujui: 0, realisasiDisetujui: 0, pengeluaranAktual: 0, jumlahTransaksi: 0,
    terpetakanBelumDisetujui: 0, terpetakanPeriodeLain: 0, sisaTidakTerpetakan: 0, tanpaRab: 0, belumKeRabDisetujui: 0, sisaAnggaranDisetujui: 0 };
  M.lines.forEach(function (L) {
    if (L.periode !== periode) return;
    r.anggaranDisetujui += L.paguDisetujui; r.anggaranBelumDisetujui += L.paguDiajukan + L.paguTanpaStatus + L.paguStatusLain;
  });
  M.transaksi.forEach(function (t) {
    if (t.periode !== periode) return;
    r.pengeluaranAktual += t.nominal; r.jumlahTransaksi++; r.sisaTidakTerpetakan += t.sisaTidakTerpetakan; r.tanpaRab += t.tanpaRab;
    t.bagian.forEach(function (b) {
      if (M.lineByKey[b.lineKey].periode !== periode) r.terpetakanPeriodeLain += b.nominal;
      else if (b.statusRab === 'DISETUJUI') r.realisasiDisetujui += b.nominal;
      else r.terpetakanBelumDisetujui += b.nominal;
    });
  });
  r.belumKeRabDisetujui = r.pengeluaranAktual - r.realisasiDisetujui;
  r.sisaAnggaranDisetujui = r.anggaranDisetujui - r.realisasiDisetujui;
  return r;
}

/* tagihan (04) per periode anggaran PEMASUKAN yang masuk lingkup - memakai ObligationEngine (fungsi kewajiban yang sama dengan klien) */
function fccTagihanFor_(anggaran, periode) {
  var ta = fccTaOfPeriode_(periode), pers = {}, out = [];
  anggaran.forEach(function (a) { if (a.jenis !== 'PEMASUKAN' || a.archivedAt) return; var p = String(a.periode || ''); if (p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta))) pers[p] = true; });
  var keys = Object.keys(pers); if (!keys.length) return out;
  try {
    OBL_CTX_ = oblLoadContext_();
    var unitOf = {}; OBL_CTX_.students.forEach(function (s) { unitOf[s.id] = s.unit; });
    keys.forEach(function (p) { allObligationsAllSiswa(p).forEach(function (o) { out.push({ komponenId: o.komponenId, unit: unitOf[o.siswaId] || '', periode: o.periode, netto: o.netto }); }); });
  } finally { OBL_CTX_ = null; }
  return out;
}
function opFinancialControl(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode);
  if (!periode) return errResult_('VALIDATION_ERROR', 'periode wajib diisi', 'periode');
  try {
    var mk = function (sheet) { return sgRowsChecked_(sheet); }; // [P0-A] kolom wajib divalidasi
    var D = { transaksi: mk('05_TRANSAKSI'), akun: mk('07_AKUN'), anggaran: mk('08_ANGGARAN'), komitmen: mk('09_KOMITMEN'), rkat: mk('18_RKAT'), rekonsiliasi: mk('16_REKONSILIASI'),
      alokasi: mk('06_ALOKASI'), komponen: mk('02_KOMPONEN'), kategoriPengeluaran: mk('21_KATEGORI_PENGELUARAN'),
      alokasiPengeluaran: mk('30_ALOKASI_PENGELUARAN') }; // [P1-RAB] pemetaan eksplisit (sheet belum ada -> [])
    D.tagihan = fccTagihanFor_(D.anggaran, periode);
    var res = fccCompute_(periode, D);
    res.computedAt = new Date().toISOString();
    return okResult_('OK', res);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung kontrol keuangan'); }
}
