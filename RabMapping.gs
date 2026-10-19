/**
 * RabMapping.gs - [P1-D] Pemetaan realisasi PENGELUARAN ke baris RAB (08_ANGGARAN), READ-ONLY.
 *
 * - [P1-RAB] Pencocokan memakai sumber tunggal rabMatchAll_ (FinanceEngine.gs, disuntikkan dari _rab_match.js) yang juga
 *   dipakai fccBudgetVsActual_ dan KPI BDS03 di klien: pemetaan EKSPLISIT 30_ALOKASI_PENGELUARAN lebih dulu, lalu aturan
 *   KATEGORI (kategori ternormalisasi, subkategori spesifik menang, unit sama, garis periode-bulan), selain itu TANPA RAB.
 *   Sisa transaksi yang hanya sebagian dipetakan eksplisit = TIDAK TERPETAKAN (K-RAB-03). Total per garis di sini
 *   dibuktikan sama dengan kolom aktual FCC (uji diferensial P1D-05 / RAB-*).
 * - Output: garis RAB (anggaran = pagu DISETUJUI, rincian per status) + transaksi yang dipetakan, transaksi TANPA RAB
 *   (alasan eksplisit), sisa tidak terpetakan, masalah pemetaan eksplisit, dan masalah LPJ
 *   (19_LPJ -> transaksi hilang/terarsip/bukan pengeluaran, total LPJ != nominal transaksi).
 * - Tidak menulis apa pun ke sheet.
 *
 * DEPENDENSI: FinanceEngine.gs (rabMatchAll_, fccIsMonthLabel_, fccPeriodeOfDate_, fccTaOfPeriode_, fccNum_),
 *             SchemaGuard.gs (sgRowsChecked_), OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function rabMapCompute_(periode, D) {
  var alive = function (r) { return !r.archivedAt; };
  var lpj = (D.lpj || []).filter(alive);
  var ta = fccTaOfPeriode_(periode);
  var inScope = function (p) { p = String(p || ''); return p === periode || (!fccIsMonthLabel_(p) && (p === 'SekaliBayar' || p === 'Tahun Ajaran ' + ta)); };
  var M = rabMatchAll_(D), act = {}, tids = {}, unmapped = [], sisaList = [];
  var expTrx = M.transaksi.filter(function (r) { return r.periode === periode; });
  expTrx.forEach(function (r) {
    r.bagian.forEach(function (b) {
      act[b.lineKey] = (act[b.lineKey] || 0) + b.nominal;
      tids[b.lineKey] = tids[b.lineKey] || []; if (tids[b.lineKey].indexOf(r.transaksiId) === -1) tids[b.lineKey].push(r.transaksiId);
    });
    if (r.sisaTidakTerpetakan > 0.5) sisaList.push({ id: r.transaksiId, nominal: r.nominal, terpetakan: r.terpetakan, sisaTidakTerpetakan: r.sisaTidakTerpetakan });
    if (r.sumber !== 'TANPA_RAB') return;
    var alasan = r.alasan.indexOf('Alokasi eksplisit') === 0 ? r.alasan
      : !opStr_(r.kategori) ? 'Pengeluaran tanpa kategori'
      : (r.unit !== 'TK' && r.unit !== 'MI') ? 'Unit transaksi tidak valid'
      : 'Tidak ada baris RAB periode ' + periode + ' untuk kategori/subkategori/unit ini';
    var t = (D.transaksi || []).filter(function (x) { return String(x.id) === r.transaksiId; })[0] || {};
    unmapped.push({ id: r.transaksiId, tanggal: t.tanggal, kategori: r.kategori, subkategori: r.subkategori, unit: r.unit, nominal: r.nominal, alasan: alasan });
  });
  var out = M.lines.filter(function (L) { return inScope(L.periode) && (L.byKategori || act[L.key]); }).map(function (L) {
    return { kategori: L.kategori, subkategori: L.subkategori, unit: L.unit, periode: L.periode, lineKey: L.key, statusRab: rabLineStatus_(L),
      anggaran: L.paguDisetujui, anggaranDiajukan: L.paguDiajukan, anggaranTanpaStatus: L.paguTanpaStatus, anggaranStatusLain: L.paguStatusLain,
      aktual: act[L.key] || 0, rabIds: L.rabIds.slice(), transaksiIds: tids[L.key] || [] };
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
    var s = lpjBy[t.transaksiId];
    if (s === undefined) { tanpaLpj++; return; }
    if (Math.abs(s - t.nominal) >= 0.5) lpjIssues.push({ transaksiId: t.transaksiId, masalah: 'LPJ_SUM_MISMATCH', totalLpj: s, nominalTransaksi: t.nominal });
  });
  return {
    periode: periode, lines: out, unmapped: unmapped, sisaTidakTerpetakan: sisaList, pencocokanBermasalah: M.issues, lpjIssues: lpjIssues,
    totals: { pengeluaranPeriode: expTrx.reduce(function (s, t) { return s + t.nominal; }, 0), terpetakan: expTrx.reduce(function (s, t) { return s + t.terpetakan; }, 0),
      sisaTidakTerpetakan: sisaList.reduce(function (s, u) { return s + u.sisaTidakTerpetakan; }, 0),
      tanpaRab: unmapped.reduce(function (s, u) { return s + u.nominal; }, 0), transaksiTanpaLpj: tanpaLpj }
  };
}
function opRabRealization(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode);
  if (!fccIsMonthLabel_(periode)) return errResult_('VALIDATION_ERROR', 'periode harus berformat "<Bulan> <Tahun>"', 'periode');
  try {
    var D = { transaksi: sgRowsChecked_('05_TRANSAKSI'), anggaran: sgRowsChecked_('08_ANGGARAN'), lpj: sgRowsChecked_('19_LPJ'), kategoriPengeluaran: sgRowsChecked_('21_KATEGORI_PENGELUARAN'),
      alokasiPengeluaran: sgRowsChecked_('30_ALOKASI_PENGELUARAN') }; // [P1-RAB] sheet belum ada -> []
    var res = rabMapCompute_(periode, D);
    res.computedAt = new Date().toISOString();
    return okResult_('OK', res);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal memetakan realisasi ke RAB'); }
}
