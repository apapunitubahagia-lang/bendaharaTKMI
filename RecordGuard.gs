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
function rgCheckOp_(ctx, op, cur, next) {
  var key = ctx.key;
  if (op === 'archive') return null;
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
