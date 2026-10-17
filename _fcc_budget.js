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
