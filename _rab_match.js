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
