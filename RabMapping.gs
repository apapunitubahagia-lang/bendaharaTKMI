/**
 * RabMapping.gs - [P1-D] Pemetaan realisasi PENGELUARAN ke baris RAB (08_ANGGARAN), READ-ONLY.
 *
 * - Aturan pencocokan SAMA PERSIS dengan fccBudgetVsActual_ (FinanceEngine.gs): kategori ternormalisasi (id kategori
 *   21_KATEGORI_PENGELUARAN diterjemahkan ke nama), subkategori spesifik menang atas baris umum, unit sama, garis
 *   periode-bulan. Tujuannya MENJELASKAN angka FCC per transaksi, bukan menggantinya: total per baris di sini
 *   dibuktikan sama dengan kolom aktual FCC (uji diferensial P1D-05). Rumus FCC dan KPI TIDAK diubah.
 * - Output: baris RAB + daftar transaksi yang dipetakan, transaksi TANPA RAB (alasan eksplisit), dan masalah LPJ
 *   (19_LPJ -> transaksi hilang/terarsip/bukan pengeluaran, total LPJ != nominal transaksi).
 * - Tidak menulis apa pun ke sheet.
 *
 * DEPENDENSI: FinanceEngine.gs (fccNorm_, fccIsMonthLabel_, fccPeriodeOfDate_, fccTaOfPeriode_, fccNum_),
 *             SchemaGuard.gs (sgRowsChecked_), OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function rabMapCompute_(periode, D) {
  var alive = function (r) { return !r.archivedAt; };
  var trx = (D.transaksi || []).filter(alive), ang = (D.anggaran || []).filter(alive), lpj = (D.lpj || []).filter(alive);
  var katName = {}; (D.kategoriPengeluaran || []).forEach(function (k) { katName[fccNorm_(k.id)] = fccNorm_(k.kategori); });
  var kn = function (v) { var n = fccNorm_(v); return katName[n] !== undefined ? katName[n] : n; };
  var ta = fccTaOfPeriode_(periode);
  var inScope = function (a) { var p = String(a.periode || ''); return p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta)); };
  var lines = {}, order = [], specificSub = {};
  ang.filter(inScope).filter(function (a) { return a.jenis !== 'PEMASUKAN' && a.kategori && (a.unit === 'TK' || a.unit === 'MI'); }).forEach(function (a) {
    var k = [kn(a.kategori), fccNorm_(a.subkategori), a.unit, a.periode].join('|');
    if (!lines[k]) { lines[k] = { kategori: a.kategori, subkategori: a.subkategori || '', unit: a.unit, periode: a.periode, anggaran: 0, aktual: 0, rabIds: [], transaksiIds: [] }; order.push(k); }
    lines[k].anggaran += fccNum_(a.nominal); lines[k].rabIds.push(String(a.id));
    if (a.subkategori) { var sk = [kn(a.kategori), a.unit, a.periode].join('|'); specificSub[sk] = specificSub[sk] || {}; specificSub[sk][fccNorm_(a.subkategori)] = 1; }
  });
  var expTrx = trx.filter(function (t) { return t.jenis === 'PENGELUARAN' && fccPeriodeOfDate_(t.tanggal) === periode; });
  var unmapped = [];
  expTrx.forEach(function (t) {
    var ts = fccNorm_(t.subkategori), hit = null;
    order.forEach(function (k) {
      var L = lines[k];
      if (hit || !fccIsMonthLabel_(L.periode) || t.unit !== L.unit || kn(t.kategori) !== kn(L.kategori)) return;
      var sp = specificSub[[kn(L.kategori), L.unit, L.periode].join('|')] || {};
      if (L.subkategori ? ts === fccNorm_(L.subkategori) : (!ts || !sp[ts])) hit = L;
    });
    if (hit) { hit.aktual += fccNum_(t.nominal); hit.transaksiIds.push(String(t.id)); return; }
    var alasan = !opStr_(t.kategori) ? 'Pengeluaran tanpa kategori'
      : (t.unit !== 'TK' && t.unit !== 'MI') ? 'Unit transaksi tidak valid'
      : 'Tidak ada baris RAB periode ' + periode + ' untuk kategori/subkategori/unit ini';
    unmapped.push({ id: String(t.id), tanggal: t.tanggal, kategori: t.kategori || '', subkategori: t.subkategori || '', unit: t.unit, nominal: fccNum_(t.nominal), alasan: alasan });
  });
  // ---- integritas LPJ (anotasi realisasi per transaksi) ----
  var trxAll = {}; (D.transaksi || []).forEach(function (t) { trxAll[String(t.id)] = t; });
  var lpjBy = {}, lpjIssues = [];
  lpj.forEach(function (l) {
    var tid = opStr_(l.transaksiId); if (!tid) return;
    var t = trxAll[tid];
    if (!t) { lpjIssues.push({ lpjId: String(l.id), transaksiId: tid, masalah: 'LPJ_TRX_NOT_FOUND' }); return; }
    if (t.archivedAt) { lpjIssues.push({ lpjId: String(l.id), transaksiId: tid, masalah: 'LPJ_TRX_ARCHIVED' }); return; }
    if (t.jenis !== 'PENGELUARAN') { lpjIssues.push({ lpjId: String(l.id), transaksiId: tid, masalah: 'LPJ_NOT_PENGELUARAN' }); return; }
    lpjBy[tid] = (lpjBy[tid] || 0) + fccNum_(l.nominal);
  });
  var tanpaLpj = 0;
  expTrx.forEach(function (t) {
    var s = lpjBy[String(t.id)];
    if (s === undefined) { tanpaLpj++; return; }
    if (Math.abs(s - fccNum_(t.nominal)) >= 0.5) lpjIssues.push({ transaksiId: String(t.id), masalah: 'LPJ_SUM_MISMATCH', totalLpj: s, nominalTransaksi: fccNum_(t.nominal) });
  });
  var out = order.map(function (k) { return lines[k]; });
  return {
    periode: periode, lines: out, unmapped: unmapped, lpjIssues: lpjIssues,
    totals: { pengeluaranPeriode: expTrx.reduce(function (s, t) { return s + fccNum_(t.nominal); }, 0), terpetakan: out.reduce(function (s, L) { return s + L.aktual; }, 0),
      tanpaRab: unmapped.reduce(function (s, u) { return s + u.nominal; }, 0), transaksiTanpaLpj: tanpaLpj }
  };
}
function opRabRealization(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode);
  if (!fccIsMonthLabel_(periode)) return errResult_('VALIDATION_ERROR', 'periode harus berformat "<Bulan> <Tahun>"', 'periode');
  try {
    var D = { transaksi: sgRowsChecked_('05_TRANSAKSI'), anggaran: sgRowsChecked_('08_ANGGARAN'), lpj: sgRowsChecked_('19_LPJ'), kategoriPengeluaran: sgRowsChecked_('21_KATEGORI_PENGELUARAN') };
    var res = rabMapCompute_(periode, D);
    res.computedAt = new Date().toISOString();
    return okResult_('OK', res);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal memetakan realisasi ke RAB'); }
}
