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
   MISSING     = RAB periode tanpa realisasi dan tanpa komitmen (biaya yang diharapkan tapi belum tercatat) + kategori data kosong.
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
  var missing = rabRows.filter(function (a) {
    var real = sum(exp.filter(function (t) { return t.kategori === a.program && inP(t); }), nominal);
    var kt = sum(kom.filter(function (o) { return o.rabId === a.id && (o.status === 'COMMITTED' || o.status === 'INCURRED'); }), nominal);
    return real + kt === 0;
  }).map(function (a) { return { id: a.id, program: a.program, nominal: fccNum_(a.nominal) }; });
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
    planned: { rabPeriode: sum(rabRows, nominal), rkatPaguTahun: rkatPagu },
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
   Pengeluaran: anggaran jenis kosong/PENGELUARAN -> kategori (+subkategori) + unit + periode. Aktual = transaksi PENGELUARAN non-arsip.
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
  // ---- PENGELUARAN ----
  var expLines = {}, specificSub = {};
  lines.filter(function (a) { return a.jenis !== 'PEMASUKAN'; }).forEach(function (a) {
    if (!a.kategori) { invalid.push({ id: a.id, periode: a.periode, alasan: 'Anggaran pengeluaran tanpa kategori' }); return; }
    if (a.unit !== 'TK' && a.unit !== 'MI') { invalid.push({ id: a.id, periode: a.periode, alasan: 'Unit anggaran pengeluaran tidak valid' }); return; }
    var k = [kn(a.kategori), fccNorm_(a.subkategori), a.unit, a.periode].join('|');
    expLines[k] = expLines[k] || { kategori: a.kategori, subkategori: a.subkategori || '', unit: a.unit, periode: a.periode, anggaran: 0, ids: {} };
    expLines[k].anggaran += fccNum_(a.nominal); expLines[k].ids[a.id] = 1;
    if (a.subkategori) {
      var sk = [kn(a.kategori), a.unit, a.periode].join('|');
      specificSub[sk] = specificSub[sk] || {}; specificSub[sk][fccNorm_(a.subkategori)] = 1;
    }
  });
  var expTrx = trx.filter(function (t) { return t.jenis === 'PENGELUARAN' && fccPeriodeOfDate_(t.tanggal) === periode; });
  var used = {};
  Object.keys(expLines).sort().forEach(function (k) {
    var L = expLines[k], aktual = 0, komitmen = 0, expected = 0;
    var sp = specificSub[[kn(L.kategori), L.unit, L.periode].join('|')] || {};
    expTrx.forEach(function (t) {
      if (t.unit !== L.unit || kn(t.kategori) !== kn(L.kategori)) return;
      var ts = fccNorm_(t.subkategori);
      var match = L.subkategori ? ts === fccNorm_(L.subkategori) : (!ts || !sp[ts]);
      if (match && fccIsMonthLabel_(L.periode)) { aktual += fccNum_(t.nominal); used[t.id] = 1; }
    });
    kom.forEach(function (o) { if (!L.ids[o.rabId]) return; if (o.status === 'COMMITTED' || o.status === 'INCURRED') komitmen += fccNum_(o.nominal); else if (o.status === 'EXPECTED') expected += fccNum_(o.nominal); });
    rows.push({ jenis: 'PENGELUARAN', periode: L.periode, unit: L.unit, kategori: L.kategori, subkategori: L.subkategori, nama: L.kategori + (L.subkategori ? ' / ' + L.subkategori : ''), anggaran: L.anggaran, komitmen: komitmen, diharapkan: expected, tagihan: null, aktual: aktual,
      selisih: L.anggaran - aktual - komitmen, status: (aktual + komitmen > L.anggaran) ? 'MELEBIHI ANGGARAN' : ((aktual + komitmen) === 0 ? 'BELUM ADA REALISASI' : 'DALAM ANGGARAN') });
  });
  var noBudget = {};
  expTrx.forEach(function (t) {
    if (used[t.id]) return;
    var k = [kn(t.kategori), fccNorm_(t.subkategori), t.unit].join('|');
    noBudget[k] = noBudget[k] || { kategori: t.kategori || '(tanpa kategori)', subkategori: t.subkategori || '', unit: t.unit, jumlah: 0, total: 0 };
    noBudget[k].jumlah++; noBudget[k].total += fccNum_(t.nominal);
  });
  // ---- penerimaan yang belum dialokasikan ke komponen (bukan anggaran, bukan tagihan) ----
  var allocBy = {}; alok.forEach(function (a) { allocBy[a.transaksiId] = (allocBy[a.transaksiId] || 0) + fccNum_(a.nominal); });
  var unalloc = { jumlahTransaksi: 0, total: 0 };
  incTrx.filter(function (t) { return fccPeriodeOfDate_(t.tanggal) === periode; }).forEach(function (t) {
    var sisa = fccNum_(t.nominal) - (allocBy[t.id] || 0);
    if (sisa > 0.5) { unalloc.jumlahTransaksi++; unalloc.total += sisa; }
  });
  return { periode: periode, tahunAjaran: ta, rows: rows, transaksiTanpaAnggaran: Object.keys(noBudget).sort().map(function (k) { return noBudget[k]; }), pemasukanBelumDialokasi: unalloc, anggaranTidakValid: invalid };
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
      alokasi: mk('06_ALOKASI'), komponen: mk('02_KOMPONEN'), kategoriPengeluaran: mk('21_KATEGORI_PENGELUARAN') };
    D.tagihan = fccTagihanFor_(D.anggaran, periode);
    var res = fccCompute_(periode, D);
    res.computedAt = new Date().toISOString();
    return okResult_('OK', res);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung kontrol keuangan'); }
}
