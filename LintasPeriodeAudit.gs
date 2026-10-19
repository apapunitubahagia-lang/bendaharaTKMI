/**
 * LintasPeriodeAudit.gs - [P1_21 U-1] Audit BACA-SAJA alokasi pengeluaran lintas periode sebelum kebijakan PERIOD_MISMATCH diterapkan.
 *
 * opAlokasiLintasPeriodeAudit() -> untuk setiap baris aktif 30_ALOKASI_PENGELUARAN: periode bulan transaksi vs periode garis RAB.
 *   SAMA_PERIODE            : akan tetap diterima oleh kebijakan default U-1;
 *   PERIODE_BERBEDA         : akan menjadi PERIOD_MISMATCH bila kebijakan diterapkan (data lama TIDAK diubah; hanya dilaporkan);
 *   PERIODE_RAB_BUKAN_BULAN : garis RAB berlabel non-bulan (mis. "Tahun Ajaran ...") -> perlu keputusan;
 *   REFERENSI_TIDAK_VALID   : transaksi/anggaran tidak ditemukan atau diarsipkan.
 * Pencocokan aturan kategori (tanpa alokasi eksplisit) selalu sepériode, sehingga tidak termasuk.
 * Tidak mengubah validasi tulis, KPI, atau data. Kebijakan U-1 (default PERIOD_MISMATCH + pengecualian berotorisasi) BELUM
 * diaktifkan karena pengecualian butuh persetujuan pihak berwenang dengan identitas server (GAP-005, D-T7).
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_), SchemaGuard.gs (sgRowsChecked_, sgErr_),
 *             PeriodLock.gs (plIsPeriodLabel_, plPeriodeOfDate_), TransactionEngine.gs (okResult_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function opAlokasiLintasPeriodeAudit() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var alive = function (r) { return !opStr_(r.archivedAt); };
    var trx = {}, ang = {};
    sgRowsChecked_('05_TRANSAKSI').forEach(function (t) { trx[opStr_(t.id)] = t; });
    sgRowsChecked_('08_ANGGARAN').forEach(function (a) { ang[opStr_(a.id)] = a; });
    var rows = sgRowsChecked_('30_ALOKASI_PENGELUARAN').filter(alive), out = { total: rows.length, ringkasan: {}, perPasangan: {}, baris: [] };
    rows.forEach(function (x) {
      var t = trx[opStr_(x.transaksiId)], a = ang[opStr_(x.anggaranId)], st, pt = '', pa = '';
      if (!t || !alive(t) || !a || !alive(a)) st = 'REFERENSI_TIDAK_VALID';
      else {
        pt = plPeriodeOfDate_(opStr_(t.tanggal).slice(0, 10)); pa = opStr_(a.periode);
        st = !plIsPeriodLabel_(pa) ? 'PERIODE_RAB_BUKAN_BULAN' : (pt === pa ? 'SAMA_PERIODE' : 'PERIODE_BERBEDA');
      }
      out.ringkasan[st] = (out.ringkasan[st] || 0) + 1;
      if (st === 'PERIODE_BERBEDA') { var k = pt + ' -> ' + pa; out.perPasangan[k] = (out.perPasangan[k] || 0) + 1; }
      if (st !== 'SAMA_PERIODE' && out.baris.length < 200) out.baris.push({ alokasiId: opStr_(x.id), transaksiId: opStr_(x.transaksiId), anggaranId: opStr_(x.anggaranId), periodeTransaksi: pt, periodeRab: pa, nominal: Number(x.nominal) || 0, status: st });
    });
    out.catatan = 'Baca-saja. Tidak ada alokasi yang diubah. PERIODE_BERBEDA = calon PERIOD_MISMATCH bila U-1 diaktifkan; data historis tetap, ditinjau manual.';
    out.computedAt = new Date().toISOString();
    return okResult_('Audit alokasi lintas periode (read-only)', out);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal mengaudit alokasi lintas periode'); }
}
