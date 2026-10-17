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
