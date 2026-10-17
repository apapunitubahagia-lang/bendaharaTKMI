/**
 * PeriodLock.gs - [P1-A] Penguncian periode (closing) yang DITEGAKKAN SERVER.
 *
 * - Sumber status closing: blob klien yang SUDAH ADA di 15_SETTINGS (key 'blob.periodClosing.n' dan
 *   'blob.periodClosing.0..n-1', isi JSON [{periode, status, closedAt, closedBy, ...}]). Tidak ada sheet/kolom
 *   baru dan tidak ada migrasi: riwayat closing yang sudah tercatat langsung berlaku.
 * - [GAP-015] Status bawaan backend FINAL juga dibaca apa adanya: key 15_SETTINGS 'periodeStatus.YYYY-MM' bernilai
 *   TERKUNCI (atau CLOSED/LOCKED) = periode terkunci. Key itu TIDAK pernah ditulis kode ini (data asli dipertahankan).
 *   Entri blob closing (keputusan close/reopen lewat server, berjejak waktu) mengalahkan periodeStatus untuk periode
 *   yang sama, sehingga reopen beralasan atas periode TERKUNCI tetap mungkin tanpa mengubah data asli.
 * - Blob dan key periodeStatus.* HANYA diubah lewat opClosePeriod / opReopenPeriod (opSettingsUpsert menolak keduanya).
 * - plGuard_ dipanggil di DALAM lock yang sama dengan penulisan (engine, record, arsip, rekonsiliasi).
 * - Status blob rusak (JSON tidak terbaca) -> gagal tertutup (PERIOD_STATE_INVALID), bukan dianggap terbuka.
 * - Label periode = format klien/FinanceEngine: "<Bulan> <Tahun>" (mis. "September 2026").
 *
 * DEPENDENSI: TransactionEngine.gs (errResult_, okResult_, withLock_, SHT_SETTINGS), SchemaGuard.gs (sgModel_,
 *             sgDateStr_), OperationalAPI.gs (opGate_, opStr_, OP_WRITE_ROLES_, OP_READ_ROLES_),
 *             RecordEngine.gs (opAuditBulk_, opRestoreRows_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var PL_BLOB_PREFIX_ = 'blob.periodClosing.';
var PL_STATUS_PREFIX_ = 'periodeStatus.'; // [GAP-015] key backend FINAL, mis. periodeStatus.2026-07 = TERKUNCI (hanya dibaca)
var PL_STATUS_LOCKED_ = ['TERKUNCI', 'CLOSED', 'LOCKED'];
var PL_CHUNK_ = 40000; // sama dengan ccBlobPut_ di klien
var PL_BULAN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var PL_LABEL_RE_ = /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/;

function plIsPeriodLabel_(p) { return PL_LABEL_RE_.test(String(p || '')); }
function plPeriodeOfDate_(v) {
  var s = String(sgDateStr_(v) || '');
  var m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return '';
  var mi = Number(m[2]) - 1;
  return (mi >= 0 && mi < 12) ? PL_BULAN_[mi] + ' ' + m[1] : '';
}
/* Tanggal terakhir periode ("September 2026" -> "2026-09-30"); '' bila label tidak valid. */
function plPeriodEnd_(periode) {
  if (!plIsPeriodLabel_(periode)) return '';
  var parts = String(periode).split(' '), mi = PL_BULAN_.indexOf(parts[0]), y = Number(parts[1]);
  var last = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  return y + '-' + ('0' + (mi + 1)).slice(-2) + '-' + ('0' + last).slice(-2);
}
/* "2026-07" -> "Juli 2026"; '' bila tidak valid. */
function plLabelOfYm_(ym) {
  var mm = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!mm) return '';
  var mi = Number(mm[2]) - 1;
  return (mi >= 0 && mi < 12) ? PL_BULAN_[mi] + ' ' + mm[1] : '';
}
/* Membaca blob closing + periodeStatus.* dari 15_SETTINGS. Melempar Error ber-code bila blob rusak. */
function plRead_() {
  var m = sgModel_(SHT_SETTINGS, ['key', 'value']);
  if (!m) return { m: null, list: [], rowOf: {}, statusLocked: {} };
  var rowOf = {}, val = {};
  m.values.forEach(function (r, i) { var k = String(r[m.idx.key]); rowOf[k] = i; val[k] = r[m.idx.value]; });
  var statusLocked = {};
  Object.keys(val).forEach(function (k) {
    if (k.indexOf(PL_STATUS_PREFIX_) !== 0) return;
    var lb = plLabelOfYm_(k.slice(PL_STATUS_PREFIX_.length));
    if (lb && PL_STATUS_LOCKED_.indexOf(String(val[k] === null || val[k] === undefined ? '' : val[k]).trim().toUpperCase()) !== -1) statusLocked[lb] = k;
  });
  var n = Number(val[PL_BLOB_PREFIX_ + 'n']), list = [];
  if (n > 0) {
    var s = '';
    for (var i = 0; i < n; i++) s += String(val[PL_BLOB_PREFIX_ + i] === undefined || val[PL_BLOB_PREFIX_ + i] === null ? '' : val[PL_BLOB_PREFIX_ + i]);
    try { list = JSON.parse(s); } catch (e) { list = null; }
    if (!Array.isArray(list)) {
      var err = new Error('Status closing periode di 15_SETTINGS tidak terbaca - penulisan ditolak sampai diperiksa');
      err.code = 'PERIOD_STATE_INVALID'; throw err;
    }
  }
  return { m: m, list: list, rowOf: rowOf, statusLocked: statusLocked };
}
/* Peta periode terkunci: periodeStatus TERKUNCI, lalu ditimpa entri blob (CLOSED menambah, OPEN membuka). */
function plClosedFrom_(st) {
  var map = {};
  Object.keys(st.statusLocked).forEach(function (p) { map[p] = true; });
  st.list.forEach(function (c) {
    if (!c || !c.periode) return;
    if (c.status === 'CLOSED') map[String(c.periode)] = true; else delete map[String(c.periode)];
  });
  return map;
}
function plClosedMap_() { return plClosedFrom_(plRead_()); }
/* values = tanggal (yyyy-MM-dd / Date) atau label periode. Mengembalikan errResult_ PERIOD_LOCKED atau null.
   closedMap opsional (dipakai ulang dalam satu batch). */
function plGuard_(values, what, closedMap) {
  var closed;
  try { closed = closedMap || plClosedMap_(); } catch (e) { return errResult_(e.code || 'PERIOD_STATE_INVALID', e.message, 'periode'); }
  for (var i = 0; i < (values || []).length; i++) {
    var v = values[i];
    if (v === null || v === undefined || v === '') continue;
    var p = plIsPeriodLabel_(v) ? String(v) : plPeriodeOfDate_(v);
    if (p && closed[p]) {
      return errResult_('PERIOD_LOCKED', 'Periode ' + p + ' sudah ditutup (closing); ' + (what || 'data') + ' pada periode itu tidak dapat dibuat/diubah. Buka kembali periode lewat Pengaturan > Closing (wajib alasan).', 'periode');
    }
  }
  return null;
}

function opPeriodLockStatus() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var st = plRead_(), closed = plClosedFrom_(st);
    return okResult_('OK', { closed: Object.keys(closed), entries: st.list, periodeStatusTerkunci: st.statusLocked });
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca status closing'); }
}
/* Tulis blob closing (format sama dengan ccBlobPut_) + audit dalam lock. Audit gagal -> baris dipulihkan. */
function plWrite_(g, st, list, aksi, before, after, periode) {
  var m = st.m;
  if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 15_SETTINGS tidak ditemukan', null);
  var s = JSON.stringify(list), chunks = Math.max(1, Math.ceil(s.length / PL_CHUNK_)), now = new Date().toISOString();
  var kv = [];
  for (var i = 0; i < chunks; i++) kv.push([PL_BLOB_PREFIX_ + i, s.slice(i * PL_CHUNK_, (i + 1) * PL_CHUNK_)]);
  kv.push([PL_BLOB_PREFIX_ + 'n', String(chunks)]);
  var touched = [], appended = [], width = m.live.length;
  kv.forEach(function (p) {
    if (Object.prototype.hasOwnProperty.call(st.rowOf, p[0])) {
      var idx = st.rowOf[p[0]], cur = m.values[idx], nx = cur.slice();
      nx[m.idx.value] = p[1]; if (m.idx.updatedAt !== undefined) nx[m.idx.updatedAt] = now;
      touched.push({ rowNum: idx + 2, orig: cur.slice() });
      m.sh.getRange(idx + 2, 1, 1, width).setValues([nx]);
    } else {
      var nr = m.live.map(function () { return ''; });
      nr[m.idx.key] = p[0]; nr[m.idx.value] = p[1]; if (m.idx.updatedAt !== undefined) nr[m.idx.updatedAt] = now;
      appended.push(nr);
    }
  });
  var firstNew = m.lastRow + 1;
  if (appended.length) m.sh.getRange(firstNew, 1, appended.length, width).setValues(appended);
  try { opAuditBulk_([[aksi, before, after, periode]], g.identity.email); } catch (e) {
    try { opRestoreRows_(m.sh, width, touched, firstNew, appended.length); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan status closing gagal: ' + re.message, null, periode); }
    return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; perubahan status closing dibatalkan', null, periode);
  }
  return null;
}
function opClosePeriod(periode) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode);
  if (!plIsPeriodLabel_(periode)) return errResult_('VALIDATION_ERROR', 'periode harus berformat "<Bulan> <Tahun>", mis. "September 2026"', 'periode');
  try {
    return withLock_(function () {
      var st = plRead_(), list = st.list.slice(), idx = -1;
      for (var i = 0; i < list.length; i++) { if (list[i] && list[i].periode === periode) { idx = i; break; } }
      if (plClosedFrom_(st)[periode]) { var same = okResult_('Periode sudah ditutup sebelumnya', { entry: idx >= 0 ? list[idx] : { periode: periode, status: 'TERKUNCI', sumber: st.statusLocked[periode] } }); same.data.unchanged = true; return same; }
      var before = idx >= 0 ? JSON.parse(JSON.stringify(list[idx])) : null;
      var entry = Object.assign({}, idx >= 0 ? list[idx] : {}, { periode: periode, status: 'CLOSED', closedAt: new Date().toISOString(), closedBy: g.identity.email });
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      var err = plWrite_(g, st, list, 'CLOSING_PERIODE', before, entry, periode);
      if (err) return err;
      return okResult_('Periode ditutup', { entry: entry });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menutup periode'); }
}
function opReopenPeriod(periode, reason) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  periode = opStr_(periode); reason = opStr_(reason);
  if (!plIsPeriodLabel_(periode)) return errResult_('VALIDATION_ERROR', 'periode harus berformat "<Bulan> <Tahun>"', 'periode');
  if (reason.length < 10) return errResult_('VALIDATION_ERROR', 'Alasan membuka kembali periode wajib diisi (minimal 10 karakter)', 'reason');
  try {
    return withLock_(function () {
      var st = plRead_(), list = st.list.slice(), idx = -1;
      for (var i = 0; i < list.length; i++) { if (list[i] && list[i].periode === periode) { idx = i; break; } }
      if (!plClosedFrom_(st)[periode]) { var same = okResult_('Periode tidak dalam status CLOSED', { entry: idx >= 0 ? list[idx] : null }); same.data.unchanged = true; return same; }
      // [GAP-015] periode TERKUNCI dari periodeStatus.* tanpa entri blob: entri OPEN baru di blob (key asli tidak diubah)
      var before = idx >= 0 ? JSON.parse(JSON.stringify(list[idx])) : { periode: periode, status: 'TERKUNCI', sumber: st.statusLocked[periode] };
      var entry = Object.assign({}, idx >= 0 ? list[idx] : { periode: periode }, { status: 'OPEN', reopenedAt: new Date().toISOString(), reopenedBy: g.identity.email, reopenReason: reason.slice(0, 500) });
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      var err = plWrite_(g, st, list, 'REOPEN_PERIODE', before, entry, periode);
      if (err) return err;
      return okResult_('Periode dibuka kembali', { entry: entry });
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal membuka kembali periode'); }
}
