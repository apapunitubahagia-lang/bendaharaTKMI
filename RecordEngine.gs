/**
 * RecordEngine.gs
 * Penyimpanan record operasional generik (04, 08, 09, 10, 11, 12, 14, 16, 17, 18, 19)
 * + arsip/reversal transaksi & alokasi + batch transaksi/master + settings + audit mirror.
 *
 * PRINSIP
 * - Authorize di server (opGate_) -> validasi -> LockService -> tulis -> audit.
 * - ID record divalidasi (regex), idempotent: upsert berdasarkan id. Mengirim ulang
 *   operasi yang sama tidak menggandakan baris (UNCHANGED).
 * - TIDAK ADA hard delete. "Hapus" = arsip (archivedAt/archivedBy/archiveReason) di sheet.
 *   Kolom arsip ditambah ADITIF lewat opSchemaApply (AdminAPI.gs), tidak pernah otomatis.
 * - Header dibaca dari sheet LIVE; field di luar header ditolak (UNKNOWN_FIELD), tidak dibuang diam-diam.
 * - Satu pembacaan sheet + satu penulisan massal per batch; audit massal (format sama dengan auditPush_).
 * - [P1-POLICY] Status periode TIDAK menolak operasi; operasi pada periode bertanda/terlapor menambah baris audit
 *   PERIODE_DITANDAI di append audit yang sama (atomik dengan perubahan) dan res.periodeDitandai.
 * - [P1] Setiap operasi diperiksa RecordGuard.gs (integritas bukti/LPJ/komitmen/mutasi,
 *   rekonsiliasi lewat API khusus) dan deteksi konflik: op.expect = nilai field yang dilihat klien sebelum
 *   mengubah; bila nilai server sudah berbeda -> CONFLICT, baris tidak diubah. Baris terarsip tidak dapat di-upsert.
 *
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, opNorm_, opJsonSafe_, OP_WRITE_ROLES_),
 *             TransactionEngine.gs (errResult_, okResult_, ss_, sheet_, withLock_, auditPush_,
 *             ID_PREFIX_AUDIT, AUDIT_HEADERS, SHT_AUDIT, SHT_TRANSAKSI, SHT_ALOKASI, SHT_SETTINGS).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */

var OP_ARCHIVE_COLS_ = ['archivedAt', 'archivedBy', 'archiveReason'];
var OP_ID_RE_ = /^[A-Za-z0-9_\-]{4,100}$/;
var OP_RECORDS_ = {
  kewajiban: { sheet: '04_KEWAJIBAN', num: ['bruto', 'netto', 'tarifSatuan', 'jumlahHari'] },
  anggaran: { sheet: '08_ANGGARAN', num: ['nominal', 'volume', 'hargaSatuan', 'sourceRow'] },
  komitmen: { sheet: '09_KOMITMEN', num: ['nominal'] },
  bukti: { sheet: '10_BUKTI', num: [] },
  mutasiBank: { sheet: '11_MUTASI_BANK', num: ['nominal'] },
  dupReview: { sheet: '12_DUP_REVIEW', num: [] },
  kpi: { sheet: '14_KPI', num: ['skor'] },
  rekonsiliasi: { sheet: '16_REKONSILIASI', num: ['saldoSistem', 'saldoAktual', 'selisih'] },
  laporan: { sheet: '17_LAPORAN', num: [] },
  rkat: { sheet: '18_RKAT', num: ['tahun', 'volume', 'hargaSatuan', 'pagu', 'sourceRow'] },
  lpj: { sheet: '19_LPJ', num: ['volume', 'hargaSatuan', 'diskon', 'nominal', 'sourceRow'] },
  alokasiPengeluaran: { sheet: '30_ALOKASI_PENGELUARAN', num: ['nominal'] } // [P1-RAB] pemetaan eksplisit pengeluaran -> RAB (RecordGuard)
};

/* Baca model sheet LIVE: header + seluruh baris (nilai mentah). */
function opSheetModel_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return null;
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  var live = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(opStr_) : [];
  var rows = (lastRow >= 2 && lastCol > 0) ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  return { sh: sh, live: live, lastCol: lastCol, lastRow: lastRow, rows: rows };
}
function opRowObj_(live, r) { var o = {}; live.forEach(function (h, c) { if (h) o[h] = r[c]; }); return o; }

/* Audit massal: format baris IDENTIK dengan auditPush_ (13_AUDIT_LOG, append-only).
   [P0-A] kolom dipetakan berdasarkan nama header. [P0-B] e[4] (opsional) = id audit deterministik (idempotensi).
   WAJIB dipanggil di dalam withLock_ (append aman dari tumpang-tindih baris). */
function opAuditBulk_(entries, email) {
  if (!entries.length) return;
  var ts = new Date().toISOString();
  sgAppendMany_(SHT_AUDIT, AUDIT_HEADERS, entries.map(function (e) {
    return { id: e[4] || (ID_PREFIX_AUDIT + Utilities.getUuid()), timestamp: ts, aksi: e[0], before: e[1] ? JSON.stringify(opJsonSafe_(e[1])) : '', after: e[2] ? JSON.stringify(opJsonSafe_(e[2])) : '', sumber: 'google:' + email, refId: e[3] || '' };
  }));
}
/* [P0-B] Pemulihan bila audit wajib gagal: baris yang diubah dikembalikan ke nilai asal, baris yang baru
   ditambahkan dihapus (dari bawah). touched = [{rowNum, orig}], appendedFrom = nomor baris pertama yang ditambah. */
function opRestoreRows_(sh, lastCol, touched, appendedFrom, appendedCount) {
  sgUndoAppend_(sh, appendedFrom, appendedCount || 0);
  (touched || []).forEach(function (t) { sh.getRange(t.rowNum, 1, 1, lastCol).setValues([t.orig]); });
}
function opCoerce_(cfg, key, v) {
  if (cfg.num.indexOf(key) !== -1 && opStr_(v) !== '' && isFinite(Number(v))) return Number(v);
  return v === null || v === undefined ? '' : v;
}

function opRecordBatch(key, ops) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var cfg = OP_RECORDS_[key];
  if (!cfg || !Object.prototype.hasOwnProperty.call(OP_RECORDS_, key)) return errResult_('VALIDATION_ERROR', 'key record tidak dikenal', 'key');
  if (!Array.isArray(ops) || !ops.length) return errResult_('VALIDATION_ERROR', 'ops wajib berupa array tidak kosong', 'ops');
  if (ops.length > 200) return errResult_('VALIDATION_ERROR', 'maksimal 200 operasi per panggilan', 'ops');
  try {
    return withLock_(function () { return opRecordBatchLocked_(g, cfg, key, ops); });
  } catch (e) {
    return errResult_('WRITE_FAILED', 'Gagal memproses batch record', null);
  }
}
function opRecordUpsert(key, record) {
  if (!record || typeof record !== 'object') return errResult_('VALIDATION_ERROR', 'record wajib berupa objek', 'record');
  return opRecordBatch(key, [{ op: 'upsert', id: record.id, row: record }]);
}

/* extraAudits (opsional) = baris audit tambahan yang ikut append audit yang SAMA dengan batch (dipakai impor P1-RAB). */
function opRecordBatchLocked_(g, cfg, key, ops, extraAudits) {
  var m = opSheetModel_(cfg.sheet);
  if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', 'key');
  var live = m.live, idCol = live.indexOf('id');
  if (idCol === -1) return errResult_('SCHEMA_MISMATCH', 'Kolom id tidak ada di sheet', 'key');
  var rows = m.rows, origLen = rows.length, byId = {}, origRows = m.rows.map(function (r) { return r.slice(); });
  rows.forEach(function (r, i) { byId[String(r[idCol])] = i; });
  var aIdx = OP_ARCHIVE_COLS_.map(function (c) { return live.indexOf(c); });
  var results = [], touched = {}, audits = [], cnt = { created: 0, updated: 0, archived: 0, unchanged: 0, failed: 0 };
  var rg = rgContext_(key, live, rows); // [P1] aturan integritas per-record (RecordGuard.gs)
  var guard = function (res, op, curObj, nextObj) {
    var f;
    try { f = rgCheckOp_(rg, op, curObj, nextObj); } catch (ge) { f = { code: ge.code || 'GUARD_FAILED', message: String(ge.message || ge) }; }
    if (!f) {
      // [P1-POLICY] lolos validasi -> operasi pasti diterapkan; penanda periode ikut audit batch yang sama
      var fl = rgPeriodFlags_(rg, curObj, nextObj);
      if (fl.length) { res.periodeDitandai = fl; audits.push(['PERIODE_DITANDAI', null, plMarkAfter_(fl, 'RECORD_' + op.toUpperCase() + ':' + key), res.id]); }
      return false;
    }
    res.code = f.code; res.message = f.message; cnt.failed++; return true;
  };
  var hasExpect = function (o) { return o.expect && typeof o.expect === 'object' && !Array.isArray(o.expect); };
  ops.forEach(function (o) {
    var res = { id: o && o.id, op: o && o.op, ok: false, code: '' };
    results.push(res);
    var id = o && typeof o === 'object' ? opStr_(o.id) : '';
    if (!OP_ID_RE_.test(id)) { res.code = 'VALIDATION_ERROR'; res.message = 'id tidak valid'; cnt.failed++; return; }
    var has = Object.prototype.hasOwnProperty.call(byId, id);
    if (o.op === 'upsert') {
      var row = o.row;
      if (!row || typeof row !== 'object' || Array.isArray(row)) { res.code = 'VALIDATION_ERROR'; res.message = 'row wajib objek'; cnt.failed++; return; }
      var keys = Object.keys(row).filter(function (k) { return k !== 'id'; });
      var unknown = keys.filter(function (k) { return live.indexOf(k) === -1; });
      if (unknown.length) { res.code = 'UNKNOWN_FIELD'; res.message = 'Kolom tidak ada di sheet: ' + unknown.join(','); res.fields = unknown; cnt.failed++; return; }
      var big = keys.filter(function (k) { return typeof row[k] === 'string' && row[k].length > 45000; });
      if (big.length) { res.code = 'VALUE_TOO_LARGE'; res.message = 'Nilai terlalu besar untuk satu sel: ' + big.join(','); cnt.failed++; return; }
      if (has) {
        var idx = byId[id], cur = rows[idx], next = cur.slice(), changed = false, before = opRowObj_(live, cur);
        keys.forEach(function (k) {
          var c = live.indexOf(k), nv = opCoerce_(cfg, k, row[k]);
          if (opStr_(next[c]) !== opStr_(nv)) changed = true;
          next[c] = nv;
        });
        if (!changed) { res.ok = true; res.code = 'UNCHANGED'; cnt.unchanged++; return; }
        if (aIdx[0] !== -1 && opStr_(cur[aIdx[0]]) !== '') { res.code = 'ARCHIVED'; res.message = 'Data sudah diarsipkan dan tidak dapat diubah'; cnt.failed++; return; } // [P1-F]
        if (hasExpect(o)) { // [P1-F] deteksi konflik: nilai server berubah sejak klien membacanya
          var conflict = Object.keys(o.expect).filter(function (k) {
            var c = live.indexOf(k); if (c === -1) return false;
            var sv = opStr_(opJsonSafe_(cur[c])), nv2 = opStr_(opJsonSafe_(next[c]));
            return sv !== opStr_(o.expect[k]) && sv !== nv2;
          });
          if (conflict.length) { res.code = 'CONFLICT'; res.message = 'Data diubah pengguna lain sejak dimuat (' + conflict.join(', ') + '); muat ulang lalu ulangi perubahan'; res.fields = conflict; res.current = opJsonSafe_(opRowObj_(live, cur)); cnt.failed++; return; }
        }
        if (guard(res, 'upsert', before, opRowObj_(live, next))) return;
        rows[idx] = next; if (idx < origLen) touched[idx] = true;
        audits.push(['RECORD_UPDATE:' + key, before, opRowObj_(live, next), id]);
        res.ok = true; res.code = 'UPDATED'; cnt.updated++;
      } else {
        if (hasExpect(o)) { res.code = 'CONFLICT'; res.message = 'Data yang akan diubah sudah tidak ada di server'; cnt.failed++; return; } // [P1-F]
        var nr = live.map(function () { return ''; });
        nr[idCol] = id;
        keys.forEach(function (k) { nr[live.indexOf(k)] = opCoerce_(cfg, k, row[k]); });
        if (guard(res, 'upsert', null, opRowObj_(live, nr))) return;
        rows.push(nr); byId[id] = rows.length - 1;
        audits.push(['RECORD_CREATE:' + key, null, opRowObj_(live, nr), id]);
        res.ok = true; res.code = 'CREATED'; cnt.created++;
      }
    } else if (o.op === 'archive') {
      if (aIdx[0] === -1) { res.code = 'SCHEMA_ADDITIVE_REQUIRED'; res.message = 'Kolom archivedAt belum ada - jalankan Migrasi Skema Aditif (Pusat Data)'; cnt.failed++; return; }
      if (!has) { res.code = 'NOT_FOUND'; cnt.failed++; return; }
      var ix = byId[id], rr = rows[ix];
      if (opStr_(rr[aIdx[0]]) !== '') { res.ok = true; res.code = 'UNCHANGED'; cnt.unchanged++; return; }
      var b2 = opRowObj_(live, rr), nx = rr.slice();
      if (guard(res, 'archive', b2, null)) return; // [P1-A] arsip pada periode tertutup ditolak
      nx[aIdx[0]] = new Date().toISOString();
      if (aIdx[1] !== -1) nx[aIdx[1]] = g.identity.email;
      if (aIdx[2] !== -1) nx[aIdx[2]] = opStr_(o.reason).slice(0, 500);
      rows[ix] = nx; if (ix < origLen) touched[ix] = true;
      audits.push(['RECORD_ARCHIVE:' + key, b2, opRowObj_(live, nx), id]);
      res.ok = true; res.code = 'ARCHIVED'; cnt.archived++;
    } else {
      res.code = 'VALIDATION_ERROR'; res.message = 'op tidak dikenal'; cnt.failed++;
    }
  });
  var touchedList = Object.keys(touched).map(function (i) { return { rowNum: Number(i) + 2, orig: origRows[Number(i)] }; });
  Object.keys(touched).forEach(function (i) { m.sh.getRange(Number(i) + 2, 1, 1, m.lastCol).setValues([rows[i]]); });
  var nAppend = rows.length - origLen;
  if (nAppend > 0) m.sh.getRange(m.lastRow + 1, 1, nAppend, m.lastCol).setValues(rows.slice(origLen));
  if (extraAudits && extraAudits.length) audits = audits.concat(extraAudits);
  try { opAuditBulk_(audits, g.identity.email); } catch (e) {
    // [P0-B] audit wajib gagal -> perubahan dibatalkan, bukan sukses + auditWarning
    try { opRestoreRows_(m.sh, m.lastCol, touchedList, m.lastRow + 1, Math.max(0, nAppend)); } catch (re) {
      return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan gagal: ' + re.message, null);
    }
    return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; seluruh perubahan batch dibatalkan', null);
  }
  return okResult_('Batch diproses', { results: results, created: cnt.created, updated: cnt.updated, archived: cnt.archived, unchanged: cnt.unchanged, failed: cnt.failed });
}

/* ---- ARSIP / REVERSAL transaksi & alokasi (tanpa hard delete) ---- */
function opArchiveRowsLocked_(g, sheetName, matchFn, reason, actionName, refId) {
  var m = opSheetModel_(sheetName);
  if (!m) return { err: errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', null) };
  var a0 = m.live.indexOf('archivedAt'), a1 = m.live.indexOf('archivedBy'), a2 = m.live.indexOf('archiveReason');
  if (a0 === -1) return { err: errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Kolom archivedAt belum ada di ' + sheetName + ' - jalankan Migrasi Skema Aditif (Pusat Data)', null) };
  var ids = [], now = new Date().toISOString(), audits = [], restore = [], objs = [];
  m.rows.forEach(function (r, i) {
    var o = opRowObj_(m.live, r);
    if (!matchFn(o) || opStr_(r[a0]) !== '') return;
    var nx = r.slice(); nx[a0] = now;
    if (a1 !== -1) nx[a1] = g.identity.email;
    if (a2 !== -1) nx[a2] = opStr_(reason).slice(0, 500);
    restore.push({ rowNum: i + 2, orig: r.slice() }); // [P0-B] untuk pemulihan bila langkah berikut gagal
    m.sh.getRange(i + 2, 1, 1, m.lastCol).setValues([nx]);
    ids.push(String(o.id)); objs.push(o); audits.push([actionName, o, opRowObj_(m.live, nx), String(o.id)]);
  });
  return { ids: ids, audits: audits, restore: restore, sh: m.sh, lastCol: m.lastCol, objs: objs };
}
/* [P0-B] Pulihkan seluruh baris yang sudah diubah oleh satu atau lebih langkah arsip. */
function opArchiveUndo_(parts) {
  parts.forEach(function (p) { if (p && p.restore && p.restore.length) opRestoreRows_(p.sh, p.lastCol, p.restore, 0, 0); });
}
/* [P0-B] Setelah alokasi diarsipkan, status alokasi transaksi induk dihitung ulang di server. */
function opRecomputeTrxStatus_(trxId) {
  if (!trxId || typeof engineAllocStatusFor_ !== 'function') return null;
  var t = getTransactionRaw_(trxId);
  if (!t || t.archivedAt || t.jenis !== 'PENERIMAAN' || TRX_ALLOC_STATUS_.indexOf(String(t.status || 'TERCATAT')) === -1) return null;
  var st = engineAllocStatusFor_(t);
  if (!st || st === t.status) return null;
  setTrxStatusCell_(trxId, st);
  return { id: trxId, sebelum: t.status, sesudah: st };
}
function opArchiveTransaction(id, reason) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  id = opStr_(id);
  if (!id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
  try {
    return withLock_(function () {
      var t = opSheetModel_(SHT_TRANSAKSI);
      if (!t) return errResult_('SCHEMA_MISMATCH', 'Sheet transaksi tidak ditemukan', null);
      var exists = t.rows.some(function (r) { return String(r[t.live.indexOf('id')]) === id; });
      if (!exists) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan', 'id', id);
      var tRaw = getTransactionRaw_(id); // [P1-POLICY] periode bertanda tidak menolak reversal; ditandai di audit
      var flT = plFlags_([tRaw && tRaw.tanggal]);
      var r1 = opArchiveRowsLocked_(g, SHT_TRANSAKSI, function (o) { return String(o.id) === id; }, reason, 'ARCHIVE_TRANSACTION', id);
      if (r1.err) return r1.err;
      var r2 = opArchiveRowsLocked_(g, SHT_ALOKASI, function (o) { return String(o.transaksiId) === id; }, reason, 'ARCHIVE_ALLOCATION', id);
      if (r2.err) { opArchiveUndo_([r1]); return r2.err; } // [P0-B] transaksi tidak boleh terarsip tanpa alokasinya
      var auT = r1.audits.concat(r2.audits);
      if (r1.ids.length && flT.length) auT.push(['PERIODE_DITANDAI', null, plMarkAfter_(flT, 'ARCHIVE_TRANSACTION'), id]);
      try { opAuditBulk_(auT, g.identity.email); } catch (e) {
        try { opArchiveUndo_([r1, r2]); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan arsip gagal: ' + re.message, null, id); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; arsip transaksi dibatalkan', null, id);
      }
      var outT = okResult_(r1.ids.length ? 'Transaksi diarsipkan (reversal, data tidak dihapus)' : 'Transaksi sudah diarsipkan sebelumnya', { id: id, transaksiDiarsipkan: r1.ids.length, alokasiDiarsipkan: r2.ids.length });
      if (r1.ids.length && flT.length) outT.data.periodeDitandai = flT;
      return outT;
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mengarsipkan transaksi'); }
}
function opArchiveAllocation(id, reason) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  id = opStr_(id);
  if (!id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
  try {
    return withLock_(function () {
      var al = activeAllocationRows_().filter(function (a) { return String(a.id) === id; })[0]; // [P1-POLICY] penanda, bukan penolakan
      var tA = al ? getTransactionRaw_(String(al.transaksiId)) : null, flA = plFlags_([tA && tA.tanggal]);
      var r = opArchiveRowsLocked_(g, SHT_ALOKASI, function (o) { return String(o.id) === id; }, reason, 'ARCHIVE_ALLOCATION', id);
      if (r.err) return r.err;
      // [P0-B] status alokasi transaksi induk dihitung ulang di server
      var st = null;
      try { st = r.objs.length ? opRecomputeTrxStatus_(String(r.objs[0].transaksiId)) : null; } catch (e) {
        opArchiveUndo_([r]); return sgErr_(e, 'WRITE_FAILED', 'Gagal menghitung status transaksi; arsip alokasi dibatalkan');
      }
      var audits = r.audits.slice();
      if (st) audits.push(['STATUS_ALOKASI_DIHITUNG', { id: st.id, status: st.sebelum }, { id: st.id, status: st.sesudah }, st.id]);
      if (r.ids.length && flA.length) audits.push(['PERIODE_DITANDAI', null, plMarkAfter_(flA, 'ARCHIVE_ALLOCATION'), id]);
      try { opAuditBulk_(audits, g.identity.email); } catch (e) {
        try { opArchiveUndo_([r]); if (st) setTrxStatusCell_(st.id, st.sebelum); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan arsip gagal: ' + re.message, null, id); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; arsip alokasi dibatalkan', null, id);
      }
      var outA = okResult_(r.ids.length ? 'Alokasi diarsipkan (reversal, data tidak dihapus)' : 'Alokasi tidak ditemukan atau sudah diarsipkan', { id: id, diarsipkan: r.ids.length, statusTransaksi: st ? st.sesudah : null });
      if (r.ids.length && flA.length) outA.data.periodeDitandai = flA;
      return outA;
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mengarsipkan alokasi'); }
}

/* ---- BATCH transaksi (lewat TransactionEngine) & master ---- */
function opCreateTxBatch(items) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!Array.isArray(items) || !items.length) return errResult_('VALIDATION_ERROR', 'items wajib array tidak kosong', 'items');
  if (items.length > 25) return errResult_('VALIDATION_ERROR', 'maksimal 25 transaksi per panggilan', 'items');
  var results = items.map(function (it) {
    var kind = it && it.kind, r;
    if (kind === 'income') r = opCreateIncome(it.payload);
    else if (kind === 'expense') r = opCreateExpense(it.payload);
    else r = errResult_('VALIDATION_ERROR', 'kind harus income|expense', 'kind');
    return { ok: !!(r && r.ok), code: r && r.code, message: r && r.message, id: r && r.data && r.data.id, auditWarning: r && r.auditWarning };
  });
  return okResult_('Batch transaksi diproses', { results: results });
}
function opMasterBatch(sheetKey, records) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!Array.isArray(records) || !records.length) return errResult_('VALIDATION_ERROR', 'records wajib array tidak kosong', 'records');
  if (records.length > 100) return errResult_('VALIDATION_ERROR', 'maksimal 100 record per panggilan', 'records');
  var results = records.map(function (rec) {
    var cid = rec && rec.id ? String(rec.id) : '';
    var body = Object.assign({}, rec); delete body.id;
    var r = opMasterUpsert(sheetKey, body, cid);
    return { id: cid, ok: !!(r && r.ok), code: r && r.code, message: r && r.message, serverId: r && r.data && r.data.id, existingId: r && r.refId };
  });
  return okResult_('Batch master diproses', { results: results });
}

/* ---- SETTINGS (15_SETTINGS key/value) ---- */
var OP_SETTING_KEY_RE_ = /^[A-Za-z0-9_.#\-]{1,80}$/;
function opSettingsUpsert(items) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!Array.isArray(items) || !items.length) return errResult_('VALIDATION_ERROR', 'items wajib array tidak kosong', 'items');
  if (items.length > 60) return errResult_('VALIDATION_ERROR', 'maksimal 60 key per panggilan', 'items');
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !OP_SETTING_KEY_RE_.test(opStr_(it.key))) return errResult_('VALIDATION_ERROR', 'key setting tidak valid', 'key');
    if (typeof it.value !== 'string') return errResult_('VALIDATION_ERROR', 'value harus string (objek di-JSON-kan klien)', 'value');
    if (it.value.length > 45000) return errResult_('VALUE_TOO_LARGE', 'value melebihi batas satu sel (45000)', 'value');
    if (opStr_(it.key) === 'periodeAktif') { var pe = sgPeriodLabelError_(it.value, false); if (pe) return errResult_('VALIDATION_ERROR', 'periodeAktif: ' + pe, 'value'); } // [P0-T4]
    if (opStr_(it.key).indexOf(PL_BLOB_PREFIX_) === 0 || opStr_(it.key).indexOf(PL_STATUS_PREFIX_) === 0) return errResult_('PERIOD_STATUS_API_REQUIRED', 'Status periode hanya dapat diubah lewat Tutup/Buka Kembali Periode (opClosePeriod/opReopenPeriod) agar beraudit', 'key'); // [P1-POLICY] perlindungan metadata, bukan penguncian
  }
  try {
    return withLock_(function () {
      var m = opSheetModel_(SHT_SETTINGS);
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 15_SETTINGS tidak ditemukan', null);
      var kc = m.live.indexOf('key'), vc = m.live.indexOf('value'), uc = m.live.indexOf('updatedAt');
      if (kc === -1 || vc === -1) return errResult_('SCHEMA_MISMATCH', 'Header key/value tidak ada', null);
      var byKey = {}; m.rows.forEach(function (r, i) { byKey[String(r[kc])] = i; });
      var now = new Date().toISOString(), audits = [], created = 0, updated = 0, unchanged = 0, appended = [], touchedList = [];
      items.forEach(function (it) {
        var k = opStr_(it.key);
        if (Object.prototype.hasOwnProperty.call(byKey, k)) {
          var idx = byKey[k], cur = m.rows[idx];
          if (String(cur[vc]) === it.value) { unchanged++; return; }
          var before = { key: k, value: cur[vc] }, nx = cur.slice(); nx[vc] = it.value; if (uc !== -1) nx[uc] = now;
          touchedList.push({ rowNum: idx + 2, orig: cur.slice() }); // [P0-B] untuk pemulihan
          m.rows[idx] = nx; m.sh.getRange(idx + 2, 1, 1, m.lastCol).setValues([nx]);
          audits.push(['SETTING_UPDATE', before.value.length > 300 ? { key: k, valueLength: String(before.value).length } : before, it.value.length > 300 ? { key: k, valueLength: it.value.length } : { key: k, value: it.value }, k]);
          updated++;
        } else {
          var nr = m.live.map(function () { return ''; }); nr[kc] = k; nr[vc] = it.value; if (uc !== -1) nr[uc] = now;
          appended.push(nr); byKey[k] = m.rows.length + appended.length - 1;
          audits.push(['SETTING_CREATE', null, it.value.length > 300 ? { key: k, valueLength: it.value.length } : { key: k, value: it.value }, k]);
          created++;
        }
      });
      if (appended.length) m.sh.getRange(m.lastRow + 1, 1, appended.length, m.lastCol).setValues(appended);
      try { opAuditBulk_(audits, g.identity.email); } catch (e) {
        // [P0-B] audit wajib gagal -> perubahan setting dibatalkan
        try { opRestoreRows_(m.sh, m.lastCol, touchedList, m.lastRow + 1, appended.length); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan setting gagal: ' + re.message, null); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; perubahan setting dibatalkan', null);
      }
      return okResult_('Setting diproses', { created: created, updated: updated, unchanged: unchanged });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menulis setting'); }
}

/* ---- AUDIT MIRROR dari aksi UI (append-only, prefix UI_) ---- */
function opAuditAppend(entries) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!Array.isArray(entries) || !entries.length) return errResult_('VALIDATION_ERROR', 'entries wajib array tidak kosong', 'entries');
  if (entries.length > 100) return errResult_('VALIDATION_ERROR', 'maksimal 100 entri per panggilan', 'entries');
  /* [P0-B] Ditulis di dalam LockService (append tidak tumpang-tindih) dan idempoten: entri yang membawa id
     klien dicatat dengan id audit deterministik; pengiriman ulang id yang sama dilewati, tidak digandakan. */
  try {
    return withLock_(function () {
      var short = function (v) { var s = v ? JSON.stringify(v) : ''; return s.length > 45000 ? JSON.stringify({ truncated: true, length: s.length }) : s; };
      var existing = {};
      if (entries.some(function (e) { return e && opStr_(e.id); })) {
        var am = sgModel_(SHT_AUDIT, ['id']);
        (am ? am.values : []).forEach(function (r) { existing[String(r[am.idx.id])] = true; });
      }
      var rows = [], skipped = 0;
      entries.forEach(function (e) {
        var cid = opStr_(e && e.id).replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80);
        var aid = cid ? ID_PREFIX_AUDIT + 'ui_' + cid : '';
        if (aid && existing[aid]) { skipped++; return; }
        if (aid) existing[aid] = true;
        rows.push(['UI_' + opStr_(e && e.aksi).slice(0, 80), e && e.before ? JSON.parse(short(e.before) || 'null') : null, e && e.after ? JSON.parse(short(e.after) || 'null') : null, opStr_(e && e.refId).slice(0, 100), aid]);
      });
      opAuditBulk_(rows, g.identity.email);
      return okResult_('Audit dicatat', { count: rows.length, duplikatDilewati: skipped });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mencatat audit'); }
}
