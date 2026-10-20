/**
 * RecordGuard.gs - [P1] Aturan integritas per-record untuk jalur generik opRecordBatch (RecordEngine.gs).
 *
 * Dipanggil di DALAM lock opRecordBatch, sebelum perubahan diterapkan ke baris. Satu operasi yang melanggar
 * aturan ditolak dengan kode jelas; operasi lain di batch yang sama tetap diproses (perilaku batch tidak berubah).
 *
 *  [P1-POLICY] Periode      : field periode per sheet (RG_PERIOD_FIELD_, nilai lama DAN baru) TIDAK lagi menolak
 *                             operasi. rgPeriodFlags_ menghasilkan penanda; RecordEngine menulis baris audit
 *                             PERIODE_DITANDAI di append audit yang sama (keputusan 17-10-2026).
 *  [P1-C] Rekonsiliasi      : upsert lewat jalur generik ditolak (USE_DEDICATED_API) -> opReconcileAccount.
 *         Mutasi bank       : status/transaksiId hanya lewat opMatchMutasi (MATCH_VIA_API_REQUIRED); baris baru
 *                             berstatus DIPROSES divalidasi dengan aturan pencocokan yang sama (rcCheckLink_).
 *  [P1-D] LPJ               : transaksiId wajib PENGELUARAN aktif; total LPJ per transaksi <= nominal transaksi.
 *         Komitmen          : rabId wajib menunjuk 08_ANGGARAN aktif.
 *  [P1-E] Bukti (10_BUKTI)  : baris baru wajib berfile (driveFileId/fileRef); file & tautan transaksi yang sudah
 *                             terisi tidak dapat diubah/dikosongkan; transaksiId wajib transaksi aktif.
 *  [P1-RAB] Alokasi pengeluaran (30_ALOKASI_PENGELUARAN): transaksi PENGELUARAN aktif; anggaran 08 aktif bukan
 *                             PEMASUKAN; nominal > 0; Σ alokasi aktif per transaksi <= nominal transaksi; pasangan
 *                             (transaksiId, anggaranId) aktif tidak ganda; transaksiId/anggaranId/nominal tidak dapat diubah
 *                             (koreksi = arsip + baris baru).
 *
 * DEPENDENSI: PeriodLock.gs (plFlags_, plMarkContext_), ReconEngine.gs (rcCheckLink_), TransactionEngine.gs
 *             (readTrxRows_), SchemaGuard.gs (sgModel_), OperationalAPI.gs (opStr_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var RG_PERIOD_FIELD_ = { mutasiBank: 'tanggal', rekonsiliasi: 'periode', lpj: 'tanggal', anggaran: 'periode', komitmen: 'tanggal', kewajiban: 'periode' }; // [P1-POLICY] hanya untuk penanda

/* Konteks per batch (dibaca sekali, malas). */
function rgContext_(key, live, rows) {
  var ctx = { key: key, live: live, rows: rows, mark: null, trx: null, ang: null };
  ctx.col = function (h) { return live.indexOf(h); };
  ctx.markCtx = function () { if (!ctx.mark) ctx.mark = plMarkContext_(); return ctx.mark; };
  ctx.trxById = function () {
    if (!ctx.trx) { ctx.trx = {}; readTrxRows_().forEach(function (t) { ctx.trx[String(t.id)] = t; }); }
    return ctx.trx;
  };
  ctx.activeTrx = function (id) { var t = ctx.trxById()[String(id)]; return t && !t.archivedAt ? t : null; };
  ctx.akunIds = function () {
    if (!ctx.akun) { ctx.akun = {}; var m = sgModel_('07_AKUN', ['id']); (m ? m.values : []).forEach(function (r) { ctx.akun[String(r[m.idx.id])] = true; }); }
    return ctx.akun;
  };
  ctx.angById = function () { // [P1-RAB] baris 08_ANGGARAN aktif beserta jenis
    if (!ctx.angRows) {
      ctx.angRows = {};
      var m = sgModel_('08_ANGGARAN', ['id']);
      (m ? m.values : []).forEach(function (r) { var a = sgGet_(m, r, 'archivedAt'); if (a === undefined || a === '' || a === null) ctx.angRows[String(r[m.idx.id])] = { jenis: opStr_(sgGet_(m, r, 'jenis')) }; });
    }
    return ctx.angRows;
  };
  ctx.rabIds = function () {
    if (!ctx.ang) {
      ctx.ang = {};
      var m = sgModel_('08_ANGGARAN', ['id']);
      (m ? m.values : []).forEach(function (r) { var a = sgGet_(m, r, 'archivedAt'); if (a === undefined || a === '' || a === null) ctx.ang[String(r[m.idx.id])] = true; });
    }
    return ctx.ang;
  };
  return ctx;
}
function rgFail_(code, message) { return { code: code, message: message }; }
function rgFilled_(v) { return opStr_(v) !== ''; }

/* cur = objek baris lama (null bila baru), next = objek baris sesudah upsert (null bila archive). */
/* [P0-T4] Field tanggal/periode per key: [field, jenis, wajibSaatDibuat]. Diperiksa HANYA saat baris dibuat atau saat
   nilai field itu berubah; baris historis tidak diperiksa ulang/dikoreksi. Field opsional boleh kosong.
   jenis: date (YYYY-MM-DD), dateOrDatetime (YYYY-MM-DD atau ISO Z), month (label bulan), period (bulan / Tahun Ajaran / SekaliBayar), year (YYYY). */
var RG_DATE_FIELDS_ = {
  lpj: [['tanggal', 'date', true]],
  komitmen: [['tanggal', 'date', true], ['jatuhTempo', 'date', false]],
  mutasiBank: [['tanggal', 'date', true]],
  bukti: [['tanggal', 'date', false]],
  anggaran: [['periode', 'period', true]],
  kewajiban: [['periode', 'period', true]],
  laporan: [['periode', 'month', true], ['tanggalDibuat', 'dateOrDatetime', false]],
  kpi: [['periode', 'month', true]],
  rkat: [['tahun', 'year', false]]
};
function rgDateFieldError_(key, cur, next) {
  var spec = RG_DATE_FIELDS_[key]; if (!spec) return null;
  for (var i = 0; i < spec.length; i++) {
    var f = spec[i][0], kind = spec[i][1], req = spec[i][2];
    if (!Object.prototype.hasOwnProperty.call(next, f)) continue; // kolom tidak ada di sheet live
    var nv = next[f], sv = opStr_(nv);
    if (cur && opStr_(sgDateStr_(cur[f])) === opStr_(sgDateStr_(nv))) continue; // tidak berubah -> tidak diperiksa
    if (sv === '') { if (!cur && req) return rgFail_('VALIDATION_ERROR', f + ' wajib diisi'); if (cur && req && opStr_(cur[f]) !== '') return rgFail_('VALIDATION_ERROR', f + ' wajib diisi (tidak boleh dikosongkan)'); continue; }
    var e = kind === 'date' ? sgDateError_(typeof nv === 'string' ? nv : sv)
      : kind === 'dateOrDatetime' ? (sv.length > 10 ? sgDateTimeError_(sv) : sgDateError_(sv))
      : kind === 'month' ? sgPeriodLabelError_(sv, false)
      : kind === 'period' ? sgPeriodLabelError_(sv, true)
      : (/^\d{4}$/.test(sv) ? null : 'tahun wajib 4 digit: "' + sv + '"');
    if (e) return rgFail_('VALIDATION_ERROR', f + ': ' + e);
  }
  return null;
}
/* [P1_23 D-1] Identitas kanonis & perlindungan kewajiban beku (04_KEWAJIBAN). Kunci = siswaId|komponenId|periode;
   BEKU = tagihanId terisi & tidak diarsip; id kanonis = 'kw_' + oblHash_(kunci) (sama dengan oblSnapshotCore_ & kwIdKanon_ klien).
   - baris beku BARU / pembekuan baris lama: id wajib kanonis, tagihanId = id, dan tidak boleh ada baris beku aktif lain untuk kunci
     yang sama (baris historis ber-id acak tidak diubah; dilaporkan opKewajibanBekuAudit);
   - baris yang SUDAH beku: identitas & nilai (siswa, komponen, periode, bruto, potongan, netto, tagihanId, tarif, hari) tidak dapat
     diubah lewat batch biasa; arsip baris beku yang sudah dibayar (alokasi aktif cocok tagihanId/kunci) ditolak.
   Jalur koreksi beralasan BELUM ada (sengaja); field lain (mis. jatuhTempo) tetap dapat diubah. */
var RG_KW_TERKUNCI_ = ['siswaId', 'komponenId', 'periode', 'bruto', 'potongan', 'netto', 'tagihanId', 'tarifId', 'tarifSatuan', 'jumlahHari'];
function rgKwKunci_(o) { return [opStr_(o.siswaId), opStr_(o.komponenId), opStr_(o.periode)].join('|'); }
function rgKwBeku_(o) { return !!o && opStr_(o.tagihanId) !== '' && opStr_(o.archivedAt) === ''; }
function rgKwTerbayar_(o) {
  var k = rgKwKunci_(o), id = opStr_(o.id), arsipTrx = {};
  sgRowsChecked_('05_TRANSAKSI').forEach(function (t) { if (opStr_(t.archivedAt)) arsipTrx[opStr_(t.id)] = true; });
  return sgRowsChecked_('06_ALOKASI').some(function (a) {
    if (opStr_(a.archivedAt) || arsipTrx[opStr_(a.transaksiId)] || !(Number(a.nominal) > 0)) return false;
    return (opStr_(a.tagihanId) !== '' && opStr_(a.tagihanId) === id) || rgKwKunci_(a) === k;
  });
}
function rgKewajibanBeku_(ctx, op, cur, next) {
  if (op === 'archive') return rgKwBeku_(cur) && rgKwTerbayar_(cur) ? rgFail_('KEWAJIBAN_BEKU_TERKUNCI', 'Kewajiban beku yang sudah dibayar tidak dapat diarsip lewat batch biasa (' + rgKwKunci_(cur) + ')') : null;
  if (rgKwBeku_(cur)) {
    var ubah = RG_KW_TERKUNCI_.filter(function (f) { return Object.prototype.hasOwnProperty.call(next, f) && opStr_(next[f]) !== opStr_(cur[f]); });
    return ubah.length ? rgFail_('KEWAJIBAN_BEKU_TERKUNCI', 'Kewajiban beku tidak dapat diubah lewat batch biasa (' + ubah.join(', ') + '); koreksi butuh jalur khusus beralasan') : null;
  }
  if (!rgKwBeku_(next)) return null;
  var kan = 'kw_' + oblHash_(rgKwKunci_(next));
  if (opStr_(next.id) !== kan || opStr_(next.tagihanId) !== kan) return rgFail_('ID_KEWAJIBAN_TIDAK_KANONIS', 'Kewajiban beku wajib ber-id kanonis ' + kan + ' (id dan tagihanId) untuk kunci ' + rgKwKunci_(next));
  var ic = ctx.col('id'), tc = ctx.col('tagihanId'), ac = ctx.col('archivedAt'), sc = ctx.col('siswaId'), kc = ctx.col('komponenId'), pc = ctx.col('periode');
  var lain = ctx.rows.filter(function (r) {
    if (String(r[ic]) === String(next.id) || opStr_(r[tc]) === '' || (ac !== -1 && opStr_(r[ac]) !== '')) return false;
    return [opStr_(r[sc]), opStr_(r[kc]), opStr_(r[pc])].join('|') === rgKwKunci_(next);
  });
  return lain.length ? rgFail_('DUPLIKAT_KEWAJIBAN_BEKU', 'Sudah ada kewajiban beku aktif untuk kunci ' + rgKwKunci_(next) + ' (' + lain.map(function (r) { return String(r[ic]); }).join(', ') + '); periksa lewat opKewajibanBekuAudit') : null;
}
function rgCheckOp_(ctx, op, cur, next) {
  var key = ctx.key;
  if (key === 'kewajiban') { var kwf = rgKewajibanBeku_(ctx, op, cur, next); if (kwf) return kwf; } // [P1_23 D-1]
  if (op === 'archive') return null;
  var de = rgDateFieldError_(key, cur, next); if (de) return de; // [P0-T4]
  if (key === 'rekonsiliasi') {
    var ak = opStr_(next.akunId); // [TC-CRUD-04 / GAP-014] referensi akun divalidasi lebih dulu
    if (!ak || !ctx.akunIds()[ak]) return rgFail_('VALIDATION_ERROR', 'akunId rekonsiliasi tidak ditemukan di 07_AKUN: ' + (ak || '(kosong)'));
    return rgFail_('USE_DEDICATED_API', 'Rekonsiliasi dicatat lewat opReconcileAccount (saldo sistem dihitung server), bukan jalur record generik');
  }
  if (key === 'mutasiBank') {
    if (cur) {
      if (opStr_(next.status) !== opStr_(cur.status) || opStr_(next.transaksiId) !== opStr_(cur.transaksiId)) {
        return rgFail_('MATCH_VIA_API_REQUIRED', 'Status/pencocokan mutasi bank hanya lewat opMatchMutasi (tervalidasi server)');
      }
      if (rcIsMatched_(cur) && (opStr_(next.nominal) !== opStr_(cur.nominal) || opStr_(sgDateStr_(next.tanggal)) !== opStr_(sgDateStr_(cur.tanggal)))) {
        return rgFail_('MUTASI_LOCKED', 'Mutasi yang sudah dicocokkan tidak dapat diubah nominal/tanggalnya');
      }
      return null;
    }
    var st = opStr_(next.status) || 'BELUM_DIPROSES';
    if (['BELUM_DIPROSES', 'DIPROSES'].indexOf(st) === -1) return rgFail_('VALIDATION_ERROR', 'status mutasi tidak dikenal: ' + st);
    if (st === 'BELUM_DIPROSES' && rgFilled_(next.transaksiId)) return rgFail_('VALIDATION_ERROR', 'Mutasi BELUM_DIPROSES tidak boleh membawa transaksiId');
    if (st === 'DIPROSES') {
      var others = ctx.rows.map(function (r) { return { id: String(r[ctx.col('id')]), status: r[ctx.col('status')], transaksiId: r[ctx.col('transaksiId')], archivedAt: ctx.col('archivedAt') === -1 ? '' : r[ctx.col('archivedAt')] }; });
      var lk = rcCheckLink_(next, opStr_(next.transaksiId), others, ctx.activeTrx);
      if (lk) return rgFail_(lk.code, lk.message);
    }
    return null;
  }
  if (key === 'lpj') {
    var tid = opStr_(next.transaksiId);
    if (!tid) return null;
    var t = ctx.activeTrx(tid);
    if (!t) return rgFail_('INVALID_TRANSACTION', 'transaksiId LPJ tidak ditemukan atau sudah diarsipkan: ' + tid);
    if (t.jenis !== 'PENGELUARAN') return rgFail_('INVALID_TRANSACTION', 'LPJ hanya untuk transaksi PENGELUARAN: ' + tid);
    var ic = ctx.col('id'), tc = ctx.col('transaksiId'), nc = ctx.col('nominal'), ac = ctx.col('archivedAt');
    var sum = 0;
    ctx.rows.forEach(function (r) {
      if (String(r[ic]) === String(next.id) || String(r[tc]) !== tid) return;
      if (ac !== -1 && opStr_(r[ac]) !== '') return;
      sum += Number(r[nc]) || 0;
    });
    sum += Number(next.nominal) || 0;
    if (sum > Number(t.nominal) + 0.5) return rgFail_('LPJ_EXCEEDS_TRANSACTION', 'Total LPJ (' + sum + ') melebihi nominal pengeluaran ' + tid + ' (' + t.nominal + '); realisasi tidak boleh dihitung ganda');
    return null;
  }
  if (key === 'komitmen') {
    var rab = opStr_(next.rabId);
    if (rab && !ctx.rabIds()[rab]) return rgFail_('INVALID_RAB', 'rabId tidak ditemukan di 08_ANGGARAN (atau sudah diarsipkan): ' + rab);
    return null;
  }
  if (key === 'alokasiPengeluaran') { // [P1-RAB]
    if (cur) {
      var fx = ['transaksiId', 'anggaranId', 'nominal'].filter(function (h) { return opStr_(next[h]) !== opStr_(cur[h]); });
      if (fx.length) return rgFail_('ALOKASI_IMMUTABLE', 'Field alokasi tidak dapat diubah (' + fx.join(', ') + '); koreksi = arsipkan lalu buat alokasi baru');
      return null;
    }
    var at = opStr_(next.transaksiId), aa = opStr_(next.anggaranId), an = Number(next.nominal);
    var tr = at ? ctx.activeTrx(at) : null;
    if (!tr || tr.jenis !== 'PENGELUARAN') return rgFail_('INVALID_TRANSACTION', 'Alokasi hanya untuk transaksi PENGELUARAN aktif: ' + (at || '(kosong)'));
    var ag = aa ? ctx.angById()[aa] : null;
    if (!ag || ag.jenis === 'PEMASUKAN') return rgFail_('INVALID_RAB', 'anggaranId tidak ditemukan, diarsipkan, atau anggaran pemasukan: ' + (aa || '(kosong)'));
    if (!(isFinite(an) && an > 0)) return rgFail_('VALIDATION_ERROR', 'nominal alokasi harus angka > 0');
    var ic2 = ctx.col('id'), tc2 = ctx.col('transaksiId'), gc2 = ctx.col('anggaranId'), nc2 = ctx.col('nominal'), ac2 = ctx.col('archivedAt'), tot2 = 0, dup = false;
    ctx.rows.forEach(function (r) {
      if (String(r[ic2]) === String(next.id) || String(r[tc2]) !== at) return;
      if (ac2 !== -1 && opStr_(r[ac2]) !== '') return;
      tot2 += Number(r[nc2]) || 0;
      if (String(r[gc2]) === aa) dup = true;
    });
    if (dup) return rgFail_('DUPLICATE', 'Transaksi ' + at + ' sudah punya alokasi aktif ke anggaran ' + aa);
    if (tot2 + an > Number(tr.nominal) + 0.5) return rgFail_('ALOKASI_EXCEEDS_TRANSACTION', 'Total alokasi (' + (tot2 + an) + ') melebihi nominal transaksi ' + at + ' (' + tr.nominal + ')');
    return null;
  }
  if (key === 'bukti') {
    if (!cur) {
      if (!rgFilled_(next.driveFileId) && !rgFilled_(next.fileRef)) return rgFail_('BUKTI_FILE_REQUIRED', 'Bukti wajib memiliki file (unggah lewat opUploadBukti); baris bukti tanpa file ditolak');
    } else {
      var fixed = ['driveFileId', 'driveFileUrl', 'fileRef', 'transaksiId'].filter(function (h) { return rgFilled_(cur[h]) && opStr_(next[h]) !== opStr_(cur[h]); });
      if (fixed.length) return rgFail_('BUKTI_IMMUTABLE', 'File/tautan bukti yang sudah tercatat tidak dapat diubah atau dikosongkan: ' + fixed.join(', '));
    }
    var bt = opStr_(next.transaksiId);
    if (bt && (!cur || opStr_(cur.transaksiId) !== bt) && !ctx.activeTrx(bt)) return rgFail_('INVALID_TRANSACTION', 'transaksiId bukti tidak ditemukan atau sudah diarsipkan: ' + bt);
    return null;
  }
  return null;
}

/* [P1-POLICY] Penanda periode untuk satu operasi record (nilai periode lama dan baru). Tidak pernah menolak. */
function rgPeriodFlags_(ctx, cur, next) {
  var f = RG_PERIOD_FIELD_[ctx.key];
  if (!f) return [];
  return plFlags_([cur ? cur[f] : null, next ? next[f] : null], ctx.markCtx());
}

/* [P1-E] Transaksi punya minimal satu bukti aktif yang berfile (driveFileId atau fileRef terisi). */
function rgTrxHasEvidence_(trxId) {
  var m = sgModel_('10_BUKTI', ['id', 'transaksiId']);
  if (!m) return false;
  return m.values.some(function (r) {
    if (String(r[m.idx.transaksiId]) !== String(trxId)) return false;
    var a = sgGet_(m, r, 'archivedAt');
    if (a !== undefined && a !== '' && a !== null) return false;
    return rgFilled_(sgGet_(m, r, 'driveFileId')) || rgFilled_(sgGet_(m, r, 'fileRef'));
  });
}
