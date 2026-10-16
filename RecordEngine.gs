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
  lpj: { sheet: '19_LPJ', num: ['volume', 'hargaSatuan', 'diskon', 'nominal', 'sourceRow'] }
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

/* Audit massal: format baris IDENTIK dengan auditPush_ (13_AUDIT_LOG, append-only). */
function opAuditBulk_(entries, email) {
  if (!entries.length) return;
  var sh = sheet_(SHT_AUDIT);
  var ts = new Date().toISOString();
  var out = entries.map(function (e) {
    return [ID_PREFIX_AUDIT + Utilities.getUuid(), ts, e[0], e[1] ? JSON.stringify(opJsonSafe_(e[1])) : '', e[2] ? JSON.stringify(opJsonSafe_(e[2])) : '', 'google:' + email, e[3] || ''];
  });
  sh.getRange(sh.getLastRow() + 1, 1, out.length, AUDIT_HEADERS.length).setValues(out);
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

function opRecordBatchLocked_(g, cfg, key, ops) {
  var m = opSheetModel_(cfg.sheet);
  if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', 'key');
  var live = m.live, idCol = live.indexOf('id');
  if (idCol === -1) return errResult_('SCHEMA_MISMATCH', 'Kolom id tidak ada di sheet', 'key');
  var rows = m.rows, origLen = rows.length, byId = {};
  rows.forEach(function (r, i) { byId[String(r[idCol])] = i; });
  var aIdx = OP_ARCHIVE_COLS_.map(function (c) { return live.indexOf(c); });
  var results = [], touched = {}, audits = [], cnt = { created: 0, updated: 0, archived: 0, unchanged: 0, failed: 0 };
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
        rows[idx] = next; if (idx < origLen) touched[idx] = true;
        audits.push(['RECORD_UPDATE:' + key, before, opRowObj_(live, next), id]);
        res.ok = true; res.code = 'UPDATED'; cnt.updated++;
      } else {
        var nr = live.map(function () { return ''; });
        nr[idCol] = id;
        keys.forEach(function (k) { nr[live.indexOf(k)] = opCoerce_(cfg, k, row[k]); });
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
  Object.keys(touched).forEach(function (i) { m.sh.getRange(Number(i) + 2, 1, 1, m.lastCol).setValues([rows[i]]); });
  if (rows.length > origLen) m.sh.getRange(m.lastRow + 1, 1, rows.length - origLen, m.lastCol).setValues(rows.slice(origLen));
  var out = okResult_('Batch diproses', { results: results, created: cnt.created, updated: cnt.updated, archived: cnt.archived, unchanged: cnt.unchanged, failed: cnt.failed });
  try { opAuditBulk_(audits, g.identity.email); } catch (e) { out.auditWarning = 'AUDIT_FAILED'; }
  return out;
}

/* ---- ARSIP / REVERSAL transaksi & alokasi (tanpa hard delete) ---- */
function opArchiveRowsLocked_(g, sheetName, matchFn, reason, actionName, refId) {
  var m = opSheetModel_(sheetName);
  if (!m) return { err: errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', null) };
  var a0 = m.live.indexOf('archivedAt'), a1 = m.live.indexOf('archivedBy'), a2 = m.live.indexOf('archiveReason');
  if (a0 === -1) return { err: errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Kolom archivedAt belum ada di ' + sheetName + ' - jalankan Migrasi Skema Aditif (Pusat Data)', null) };
  var ids = [], now = new Date().toISOString(), audits = [];
  m.rows.forEach(function (r, i) {
    var o = opRowObj_(m.live, r);
    if (!matchFn(o) || opStr_(r[a0]) !== '') return;
    var nx = r.slice(); nx[a0] = now;
    if (a1 !== -1) nx[a1] = g.identity.email;
    if (a2 !== -1) nx[a2] = opStr_(reason).slice(0, 500);
    m.sh.getRange(i + 2, 1, 1, m.lastCol).setValues([nx]);
    ids.push(String(o.id)); audits.push([actionName, o, opRowObj_(m.live, nx), String(o.id)]);
  });
  return { ids: ids, audits: audits };
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
      var r1 = opArchiveRowsLocked_(g, SHT_TRANSAKSI, function (o) { return String(o.id) === id; }, reason, 'ARCHIVE_TRANSACTION', id);
      if (r1.err) return r1.err;
      var r2 = opArchiveRowsLocked_(g, SHT_ALOKASI, function (o) { return String(o.transaksiId) === id; }, reason, 'ARCHIVE_ALLOCATION', id);
      if (r2.err) return r2.err;
      var out = okResult_(r1.ids.length ? 'Transaksi diarsipkan (reversal, data tidak dihapus)' : 'Transaksi sudah diarsipkan sebelumnya', { id: id, transaksiDiarsipkan: r1.ids.length, alokasiDiarsipkan: r2.ids.length });
      try { opAuditBulk_(r1.audits.concat(r2.audits), g.identity.email); } catch (e) { out.auditWarning = 'AUDIT_FAILED'; }
      return out;
    });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal mengarsipkan transaksi', null); }
}
function opArchiveAllocation(id, reason) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  id = opStr_(id);
  if (!id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
  try {
    return withLock_(function () {
      var r = opArchiveRowsLocked_(g, SHT_ALOKASI, function (o) { return String(o.id) === id; }, reason, 'ARCHIVE_ALLOCATION', id);
      if (r.err) return r.err;
      var out = okResult_(r.ids.length ? 'Alokasi diarsipkan (reversal, data tidak dihapus)' : 'Alokasi tidak ditemukan atau sudah diarsipkan', { id: id, diarsipkan: r.ids.length });
      try { opAuditBulk_(r.audits, g.identity.email); } catch (e) { out.auditWarning = 'AUDIT_FAILED'; }
      return out;
    });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal mengarsipkan alokasi', null); }
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
  }
  try {
    return withLock_(function () {
      var m = opSheetModel_(SHT_SETTINGS);
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 15_SETTINGS tidak ditemukan', null);
      var kc = m.live.indexOf('key'), vc = m.live.indexOf('value'), uc = m.live.indexOf('updatedAt');
      if (kc === -1 || vc === -1) return errResult_('SCHEMA_MISMATCH', 'Header key/value tidak ada', null);
      var byKey = {}; m.rows.forEach(function (r, i) { byKey[String(r[kc])] = i; });
      var now = new Date().toISOString(), audits = [], created = 0, updated = 0, unchanged = 0, appended = [];
      items.forEach(function (it) {
        var k = opStr_(it.key);
        if (Object.prototype.hasOwnProperty.call(byKey, k)) {
          var idx = byKey[k], cur = m.rows[idx];
          if (String(cur[vc]) === it.value) { unchanged++; return; }
          var before = { key: k, value: cur[vc] }, nx = cur.slice(); nx[vc] = it.value; if (uc !== -1) nx[uc] = now;
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
      var out = okResult_('Setting diproses', { created: created, updated: updated, unchanged: unchanged });
      try { opAuditBulk_(audits, g.identity.email); } catch (e) { out.auditWarning = 'AUDIT_FAILED'; }
      return out;
    });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal menulis setting', null); }
}

/* ---- AUDIT MIRROR dari aksi UI (append-only, prefix UI_) ---- */
function opAuditAppend(entries) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!Array.isArray(entries) || !entries.length) return errResult_('VALIDATION_ERROR', 'entries wajib array tidak kosong', 'entries');
  if (entries.length > 100) return errResult_('VALIDATION_ERROR', 'maksimal 100 entri per panggilan', 'entries');
  try {
    var rows = entries.map(function (e) {
      var short = function (v) { var s = v ? JSON.stringify(v) : ''; return s.length > 45000 ? JSON.stringify({ truncated: true, length: s.length }) : s; };
      return ['UI_' + opStr_(e && e.aksi).slice(0, 80), e && e.before ? JSON.parse(short(e.before) || 'null') : null, e && e.after ? JSON.parse(short(e.after) || 'null') : null, opStr_(e && e.refId).slice(0, 100)];
    });
    opAuditBulk_(rows, g.identity.email);
    return okResult_('Audit dicatat', { count: rows.length });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal mencatat audit', null); }
}
