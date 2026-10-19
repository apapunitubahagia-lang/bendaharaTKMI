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
