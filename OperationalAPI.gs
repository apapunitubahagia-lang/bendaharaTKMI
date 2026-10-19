/**
 * OperationalAPI.gs
 * Centralization pass - gateway Google-Account-authorized ke Google Sheets.
 *
 * PRINSIP
 * - TIDAK ada engine paralel: semua transaksi/alokasi tetap lewat
 *   createIncome/createExpense/createAllocation/updateTransaction milik
 *   TransactionEngine.gs (LockService, idempotency, rollback, audit engine
 *   tetap di sana, tidak disentuh).
 * - Setiap fungsi publik: AUTHORIZE (getCurrentUserIdentity + role dari
 *   26_USER_ACCESS) -> validasi -> engine/lock -> audit aktor -> hasil
 *   terstruktur {ok, code, message, data}. Authorization SELALU di server.
 * - Tidak ada DELETE. Master hanya CREATE/UPDATE (nonaktifkan lewat status).
 * - Nama kolom TIDAK diasumsikan untuk sheet master: header dibaca dari baris 1
 *   sheet LIVE; field di luar header ditolak (bukan dibuang diam-diam).
 *
 * DEPENDENSI (harus ada di project Apps Script yang sama):
 *   TransactionEngine.gs : errResult_, okResult_, ss_, withLock_, auditPush_,
 *                          idExistsInSheet_, validateUnit_, createIncome,
 *                          createExpense, createAllocation, updateTransaction,
 *                          getTransactions, getTransaction, getStudentPosition,
 *                          IDEMP_HEADERS
 *   AuthCentral.gs       : getCurrentUserIdentity, USER_ACCESS_HEADERS
 *   CreateDatabaseStructure.gs : DB_SCHEMA (hanya untuk opSchemaReport)
 *   Code.gs              : DEVICE_HEADERS (hanya untuk opSchemaReport)
 *
 * STATUS: ditulis dan dicek statis/sandbox lokal. BELUM dijalankan di Apps
 * Script sungguhan.
 */

var OP_WRITE_ROLES_ = ['BENDAHARA'];
/* [P0-B] Email aktor terverifikasi selama satu panggilan engine; dibaca auditPush_ (TransactionEngine.gs) agar baris
   audit CREATE_x dan UPDATE_x memuat aktor. Selalu di-reset di finally. */
var ENGINE_ACTOR_ = null;
/* [P1-B] Jejak aktor+role (baris API_*) untuk panggilan engine yang sedang berjalan. Ditulis engine di dalam
   SATU append audit bersama audit wajib (engineAuditBatch_, TransactionEngine.gs), sehingga keduanya ada atau
   tidak ada sama sekali. written=true menandakan baris sudah ikut tertulis. Selalu di-reset di finally. */
var ENGINE_API_ = null;
var OP_READ_ROLES_ = ['BENDAHARA', 'KEPALA_SEKOLAH', 'YAYASAN', 'AUDITOR']; // baca-saja; tulis tetap hanya OP_WRITE_ROLES_

// Sheet yang boleh dibaca generik. Sengaja TIDAK termasuk: 24_IDEMPOTENCY_LOG
// (engine-internal), 25_DEVICE_WHITELIST (berisi tokenHash), 26_USER_ACCESS
// (administratif), 99_MIGRATION_LOG (schema belum terverifikasi), dan sheet
// master (sudah dilayani MasterDataRead.gs).
var OP_READ_SHEETS_ = ['04_KEWAJIBAN', '05_TRANSAKSI', '06_ALOKASI', '08_ANGGARAN', '09_KOMITMEN', '10_BUKTI',
  '11_MUTASI_BANK', '12_DUP_REVIEW', '13_AUDIT_LOG', '14_KPI', '16_REKONSILIASI', '17_LAPORAN', '18_RKAT', '19_LPJ', '30_ALOKASI_PENGELUARAN']; // [P1-RAB]

function opStr_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function opNorm_(v) { return opStr_(v).toLowerCase(); }

/* Date tidak bisa dikirim lewat google.script.run. Sel tanggal-saja (tengah
   malam pada zona waktu spreadsheet) dikirim 'yyyy-MM-dd' supaya tidak
   bergeser sehari akibat konversi UTC; selain itu ISO string. */
function opJsonSafe_(v) {
  if (v instanceof Date) {
    try {
      var tz = ss_().getSpreadsheetTimeZone();
      if (Utilities.formatDate(v, tz, 'HH:mm:ss') === '00:00:00') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    } catch (e) { /* jatuh ke ISO */ }
    return v.toISOString();
  }
  if (Array.isArray(v)) return v.map(opJsonSafe_);
  if (v && typeof v === 'object') {
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = opJsonSafe_(v[k]); });
    return o;
  }
  return v;
}

/* [AUTH] Gerbang tunggal. Pesan penolakan generik (tidak membocorkan apakah
   email terdaftar). */
function opGate_(roles) {
  var id = getCurrentUserIdentity();
  if (!id || !id.authorized) {
    return errResult_((id && id.code) || 'AUTH_REQUIRED', (id && id.message) || 'Pengguna tidak memiliki akses ke sistem.', null);
  }
  if (roles && roles.indexOf(id.role) === -1) {
    return errResult_('ROLE_NOT_ALLOWED', 'Pengguna tidak memiliki akses ke sistem.', null);
  }
  return { ok: true, identity: id };
}

// ============================================================
// TRANSAKSI / ALOKASI - wrapper authorized ke TransactionEngine.gs
// ============================================================
function opEngineWrite_(action, payload, engineFn, requireClientRequestId, keepId) {
  var g = opGate_(OP_WRITE_ROLES_);
  if (!g.ok) return g;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return errResult_('VALIDATION_ERROR', 'payload wajib berupa objek', 'payload');
  }
  var p = Object.assign({}, payload);
  delete p.testMode;   // mode test tidak boleh bisa dipicu dari klien
  delete p.createdAt;  // timestamp selalu dari server
  if (!keepId) delete p.id; // ID dibuat server (create); update memang butuh id target
  if (requireClientRequestId && !opStr_(p.clientRequestId)) {
    return errResult_('VALIDATION_ERROR', 'clientRequestId wajib diisi (idempotency)', 'clientRequestId');
  }
  var guard = (typeof opAllocGuard_ === 'function') ? opAllocGuard_(action, p) : null;
  if (guard) return guard;
  var res, apiWritten = false;
  ENGINE_ACTOR_ = g.identity.email; // [P0-B] aktor masuk ke baris audit wajib engine (atomik dengan perubahan bisnis)
  ENGINE_API_ = { action: action, email: g.identity.email, role: g.identity.role, written: false }; // [P1-B]
  try {
    res = engineFn(p);
    apiWritten = ENGINE_API_.written === true;
  } catch (e) {
    return sgErr_(e, 'WRITE_FAILED', 'Gagal memproses permintaan'); // [P0-A] SCHEMA_MISMATCH tidak disamarkan
  } finally {
    ENGINE_ACTOR_ = null; ENGINE_API_ = null;
  }
  var isReplay = res && res.message && String(res.message).indexOf('idempotent replay') !== -1;
  var unchanged = res && res.data && res.data.unchanged === true;
  if (res && res.ok && !isReplay && !unchanged && !apiWritten) {
    // [P1-B] Cadangan saja: semua engine yang dipanggil di sini (create/alokasi/update) sudah menulis baris API_*
    // dalam append audit yang sama dengan audit wajib. Jalur ini hanya aktif bila engine lain ditambahkan kelak.
    var refId = res.data && res.data.id ? res.data.id : '';
    var ar = withLock_(function () {
      try {
        auditPush_('API_' + action, null, { actorEmail: g.identity.email, actorRole: g.identity.role, refId: refId }, 'google:' + g.identity.email, refId);
        return { ok: true };
      } catch (e2) { return { ok: false }; }
    });
    if (!ar || !ar.ok) res.auditWarning = 'ACTOR_ROLE_AUDIT_FAILED';
  }
  return opJsonSafe_(res);
}
function opCreateIncome(payload) { return opEngineWrite_('CREATE_INCOME', payload, createIncome_, true, false); }
function opCreateExpense(payload) { return opEngineWrite_('CREATE_EXPENSE', payload, createExpense_, true, false); }
function opCreateAllocation(payload) { return opEngineWrite_('CREATE_ALLOCATION', payload, createAllocation_, true, false); }
// Kontrak idempotency updateTransaction: UNKNOWN - NEED LIVE VERIFICATION (tidak diwajibkan di sini).
function opUpdateTransaction(payload) { return opEngineWrite_('UPDATE_TRANSACTION', payload, updateTransaction_, false, true); }

function opGetTransactions(filters) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try { return opJsonSafe_(getTransactions_(filters && typeof filters === 'object' ? filters : {})); } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca transaksi'); } // [P0-A]
}
function opGetTransaction(id) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try { return opJsonSafe_(getTransaction_(id)); } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca transaksi'); } // [P0-A]
}
function opGetStudentPosition(siswaId) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try { return opJsonSafe_(getStudentPosition_(siswaId)); } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca posisi siswa'); } // [P0-A]
}

// ============================================================
// READ generik sheet operasional (header diambil dari sheet LIVE)
// ============================================================
function opReadSheet(sheetName, opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  if (OP_READ_SHEETS_.indexOf(sheetName) === -1) {
    return errResult_('VALIDATION_ERROR', 'Sheet tidak diizinkan untuk dibaca lewat API ini', 'sheetName');
  }
  opts = opts && typeof opts === 'object' ? opts : {};
  var offset = Math.max(0, Number(opts.offset) || 0);
  var limit = Math.min(20000, Math.max(1, Number(opts.limit) || 5000));
  try {
    var sh = ss_().getSheetByName(sheetName);
    // [P1-RAB] 30_ALOKASI_PENGELUARAN opsional (dibuat hanya lewat opAlokasiPengeluaranSetup): belum ada = tanpa pemetaan eksplisit
    if (!sh && sheetName === RAB_ALOKASI_SHEET_) return okResult_('OK', { sheet: sheetName, headers: [], rows: [], total: 0, offset: offset, returned: 0, sheetMissing: true });
    if (!sh) return errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', 'sheetName');
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastCol < 1) return okResult_('OK', { sheet: sheetName, headers: [], rows: [], total: 0, offset: offset, returned: 0 });
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(opStr_);
    var total = Math.max(0, lastRow - 1);
    var n = Math.max(0, Math.min(limit, total - offset));
    var raw = n > 0 ? sh.getRange(2 + offset, 1, n, lastCol).getValues() : [];
    var rows = raw.map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { if (h) o[h] = r[i]; });
      return o;
    });
    return opJsonSafe_(okResult_('OK', { sheet: sheetName, headers: headers, rows: rows, total: total, offset: offset, returned: rows.length }));
  } catch (e) {
    return errResult_('READ_FAILED', 'Gagal membaca sheet', 'sheetName');
  }
}

// ============================================================
// SCHEMA REPORT (read-only) - verifikasi LIVE header vs header di kode.
// Menggantikan tebakan: hasilnya yang menentukan status "SCHEMA NOT VERIFIED".
// ============================================================
function opSchemaReport() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  if (typeof DB_SCHEMA === 'undefined') {
    return errResult_('DEPENDENCY_MISSING', 'DB_SCHEMA (CreateDatabaseStructure.gs) tidak ada di project ini', null);
  }
  var expected = {};
  DB_SCHEMA.forEach(function (d) { expected[d.name] = d.headers; });
  expected['24_IDEMPOTENCY_LOG'] = typeof IDEMP_HEADERS !== 'undefined' ? IDEMP_HEADERS : null;
  expected['25_DEVICE_WHITELIST'] = typeof DEVICE_HEADERS !== 'undefined' ? DEVICE_HEADERS : null;
  expected['26_USER_ACCESS'] = typeof USER_ACCESS_HEADERS !== 'undefined' ? USER_ACCESS_HEADERS : null;
  if (typeof RAB_ALOKASI_HEADERS_ !== 'undefined') expected[RAB_ALOKASI_SHEET_] = RAB_ALOKASI_HEADERS_; // [P1-RAB] opsional (MISSING_SHEET wajar sebelum setup)
  expected['99_MIGRATION_LOG'] = null; // header tidak didefinisikan di kode (hanya penulisan posisional 7 kolom)
  var report = Object.keys(expected).sort().map(function (name) {
    var sh = ss_().getSheetByName(name);
    if (!sh) return { sheet: name, status: 'MISSING_SHEET' };
    var lastCol = sh.getLastColumn();
    var live = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(opStr_) : [];
    var exp = expected[name];
    var rowCount = Math.max(0, sh.getLastRow() - 1);
    if (!exp) return { sheet: name, status: 'SCHEMA_NOT_VERIFIED', rowCount: rowCount, liveHeaders: live, expectedHeaders: null };
    var missing = exp.filter(function (h) { return live.indexOf(h) === -1; });
    var extra = live.filter(function (h) { return h && exp.indexOf(h) === -1; });
    var orderOk = exp.every(function (h, i) { return live[i] === h; });
    var status = (!missing.length && !extra.length && orderOk) ? 'MATCH'
      : (missing.length ? 'MISMATCH_MISSING_COLUMNS' : (extra.length ? 'EXTRA_COLUMNS' : 'ORDER_DIFFERS'));
    return { sheet: name, status: status, rowCount: rowCount, liveHeaders: live, expectedHeaders: exp, missing: missing, extra: extra };
  });
  return okResult_('OK', report);
}

// ============================================================
// MASTER WRITE (create/update, TANPA delete) - 8 sheet master.
// 15_SETTINGS sengaja tidak ditulis di sini: menambah baris mengubah
// REGRESSION_BASELINE.jumlahSettings (5).
// ============================================================
var OP_MASTER_ = {
  siswa: {
    sheet: '01_SISWA', prefix: 'gas_siswa_', required: ['nama', 'unit'],
    enums: { unit: ['TK', 'MI'], status: ['Aktif', 'Nonaktif'] }, defaults: { status: 'Aktif' },
    dupKey: function (r) { return opStr_(r.nisn) ? 'nisn:' + opNorm_(r.nisn) : 'n:' + opNorm_(r.nama) + '|' + opNorm_(r.kelas) + '|' + opNorm_(r.unit); }
  },
  komponen: {
    sheet: '02_KOMPONEN', prefix: 'gas_kmp_', required: ['nama', 'frekuensi'],
    enums: { unit: ['', 'TK', 'MI'], frekuensi: ['Bulanan', 'Tahunan', 'SekaliBayar'], status: ['', 'Aktif', 'Nonaktif'], sasaran: ['', 'SEMUA', 'BARU', 'DAFTAR_ULANG'], basisTarif: ['', 'PER_HARI_TERJADWAL'] }, defaults: { status: 'Aktif' },
    dupKey: function (r) { return opNorm_(r.nama) + '|' + opNorm_(r.unit); }
  },
  tarif: {
    sheet: '03_TARIF', prefix: 'gas_trf_', required: ['komponenId', 'nominal'],
    enums: { unit: ['', 'TK', 'MI'], status: ['', 'Aktif', 'Nonaktif'] }, numeric: { nominal: { min: 0 } },
    refs: [{ field: 'komponenId', sheet: '02_KOMPONEN' }],
    dupKey: function (r) { return [r.komponenId, r.unit, r.kelas, r.tahunAjaran].map(opNorm_).join('|'); }
  },
  akun: {
    sheet: '07_AKUN', prefix: 'gas_akun_', required: ['nama', 'jenis'],
    enums: { jenis: ['Kas', 'Bank'] }, numeric: { saldoAwal: {} }, defaults: { saldoAwal: 0 },
    dupKey: function (r) { return opNorm_(r.nama); }
  },
  kategoriPenerimaan: {
    sheet: '20_KATEGORI_PENERIMAAN', prefix: 'gas_katp_', required: ['kategori'],
    enums: { status: ['', 'Aktif', 'Nonaktif'] }, defaults: { status: 'Aktif' },
    dupKey: function (r) { return opNorm_(r.kategori); }
  },
  kategoriPengeluaran: {
    sheet: '21_KATEGORI_PENGELUARAN', prefix: 'gas_kat_', required: ['kategori'],
    enums: { status: ['', 'Aktif', 'Nonaktif'] }, defaults: { status: 'Aktif' },
    dupKey: function (r) { return opNorm_(r.kategori); }
  },
  subkategori: {
    sheet: '22_SUBKATEGORI', prefix: 'gas_sub_', required: ['kategoriId', 'nama'],
    enums: { status: ['', 'Aktif', 'Nonaktif'] }, defaults: { status: 'Aktif' },
    refs: [{ field: 'kategoriId', sheet: '21_KATEGORI_PENGELUARAN' }],
    dupKey: function (r) { return opNorm_(r.kategoriId) + '|' + opNorm_(r.nama); }
  },
  tahunAjaran: {
    sheet: '23_TAHUN_AJARAN', prefix: 'gas_ta_', required: ['label'],
    enums: { status: ['', 'Aktif', 'Nonaktif'] }, defaults: { status: 'Aktif' },
    patterns: { label: /^\d{4}\/\d{4}$/ },
    dupKey: function (r) { return opNorm_(r.label); }
  }
};

function opValidateMaster_(cfg, m) {
  var i, f;
  for (i = 0; i < cfg.required.length; i++) {
    f = cfg.required[i];
    if (opStr_(m[f]) === '') return errResult_('VALIDATION_ERROR', f + ' wajib diisi', f);
  }
  var enumKeys = Object.keys(cfg.enums || {});
  for (i = 0; i < enumKeys.length; i++) {
    f = enumKeys[i];
    if (m[f] === undefined) continue;
    if (cfg.enums[f].indexOf(opStr_(m[f])) === -1) return errResult_('VALIDATION_ERROR', f + ' tidak valid', f);
    m[f] = opStr_(m[f]);
  }
  var numKeys = Object.keys(cfg.numeric || {});
  for (i = 0; i < numKeys.length; i++) {
    f = numKeys[i];
    if (m[f] === undefined) continue;
    var n = Number(m[f]);
    if (opStr_(m[f]) === '' || !isFinite(n)) return errResult_('VALIDATION_ERROR', f + ' harus angka', f);
    if (cfg.numeric[f].min !== undefined && n < cfg.numeric[f].min) return errResult_('VALIDATION_ERROR', f + ' tidak boleh kurang dari ' + cfg.numeric[f].min, f);
    m[f] = n;
  }
  var patKeys = Object.keys(cfg.patterns || {});
  for (i = 0; i < patKeys.length; i++) {
    f = patKeys[i];
    if (!cfg.patterns[f].test(opStr_(m[f]))) return errResult_('VALIDATION_ERROR', f + ' format tidak valid', f);
  }
  var refs = cfg.refs || [];
  for (i = 0; i < refs.length; i++) {
    if (!idExistsInSheet_(refs[i].sheet, opStr_(m[refs[i].field]))) return errResult_('VALIDATION_ERROR', refs[i].field + ' tidak ditemukan', refs[i].field);
  }
  return null;
}

/* [P1-F] expect (opsional) = {field: nilai yang dilihat klien sebelum mengubah}. Bila nilai server sudah berbeda
   (dan bukan nilai baru yang sama) -> CONFLICT, data tidak diubah. Tanpa expect perilaku lama dipertahankan. */
function opMasterUpsert(sheetKey, record, createId, expect) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var cfg = OP_MASTER_[sheetKey];
  if (!cfg || !Object.prototype.hasOwnProperty.call(OP_MASTER_, sheetKey)) return errResult_('VALIDATION_ERROR', 'sheetKey master tidak dikenal', 'sheetKey');
  if (!record || typeof record !== 'object' || Array.isArray(record)) return errResult_('VALIDATION_ERROR', 'record wajib berupa objek', 'record');
  try {
    return withLock_(function () {
      var sh = ss_().getSheetByName(cfg.sheet);
      if (!sh) return errResult_('SCHEMA_MISMATCH', 'Sheet tidak ditemukan', 'sheetKey');
      var lastCol = sh.getLastColumn();
      var live = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(opStr_);
      var idCol = live.indexOf('id');
      if (idCol === -1) return errResult_('SCHEMA_MISMATCH', 'Kolom id tidak ada di sheet', 'sheetKey');
      var i, k;
      for (i = 0; i < cfg.required.length; i++) {
        if (live.indexOf(cfg.required[i]) === -1) return errResult_('SCHEMA_MISMATCH', 'Kolom ' + cfg.required[i] + ' tidak ada di sheet', cfg.required[i]);
      }
      var keys = Object.keys(record);
      for (i = 0; i < keys.length; i++) {
        if (keys[i] !== 'id' && live.indexOf(keys[i]) === -1) return errResult_('VALIDATION_ERROR', 'Kolom tidak ada di sheet: ' + keys[i], keys[i]);
      }
      var lastRow = sh.getLastRow();
      var rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
      var toObj = function (r) { var o = {}; live.forEach(function (h, c) { if (h) o[h] = r[c]; }); return o; };
      var rid = opStr_(record.id), cid = opStr_(createId);
      if (cid && !OP_ID_RE_.test(cid)) return errResult_('VALIDATION_ERROR', 'id tidak valid', 'id');
      var targetId = rid || cid, isUpdate = false, idx = -1;
      if (targetId) {
        for (i = 0; i < rows.length; i++) { if (String(rows[i][idCol]) === targetId) { idx = i; break; } }
        if (idx >= 0) isUpdate = true;
        else if (rid && !cid) return errResult_('NOT_FOUND', 'Data master tidak ditemukan', 'id');
      }
      var base = {};
      live.forEach(function (h, c) { if (h) base[h] = isUpdate ? rows[idx][c] : ''; });
      var merged = Object.assign({}, base);
      keys.forEach(function (key) { if (key !== 'id') merged[key] = typeof record[key] === 'string' ? record[key].trim() : record[key]; });
      if (!isUpdate) {
        var dk = Object.keys(cfg.defaults || {});
        for (i = 0; i < dk.length; i++) { if (live.indexOf(dk[i]) !== -1 && opStr_(merged[dk[i]]) === '') merged[dk[i]] = cfg.defaults[dk[i]]; }
      }
      if (isUpdate && expect && typeof expect === 'object' && !Array.isArray(expect)) { // [P1-F]
        var conflict = Object.keys(expect).filter(function (f) {
          if (live.indexOf(f) === -1) return false;
          var sv = opStr_(opJsonSafe_(base[f]));
          return sv !== opStr_(expect[f]) && sv !== opStr_(opJsonSafe_(merged[f]));
        });
        if (conflict.length) return errResult_('CONFLICT', 'Data master diubah pengguna lain sejak dimuat (' + conflict.join(', ') + '); muat ulang lalu ulangi perubahan', conflict[0], base.id);
      }
      var vErr = opValidateMaster_(cfg, merged);
      if (vErr) return vErr;
      if (isUpdate && live.every(function (h) { return !h || opStr_(opJsonSafe_(base[h])) === opStr_(opJsonSafe_(merged[h])); })) {
        // [GAP-031] replay/kirim ulang tanpa perubahan = satu efek: tidak menulis dan tidak mengaudit ulang
        var same = okResult_('Data master tidak berubah (sudah sama)', opJsonSafe_(merged)); same.data.unchanged = true; return same;
      }
      var key1 = cfg.dupKey(merged);
      for (i = 0; i < rows.length; i++) {
        if (i === idx) continue;
        if (cfg.dupKey(toObj(rows[i])) === key1) return errResult_('DUPLICATE', 'Data master yang sama sudah ada', null, String(rows[i][idCol]));
      }
      if (!isUpdate) merged.id = cid || (cfg.prefix + Utilities.getUuid()); else merged.id = base.id;
      var outRow = live.map(function (h) { return h && merged[h] !== undefined ? merged[h] : ''; });
      if (isUpdate) sh.getRange(idx + 2, 1, 1, lastCol).setValues([outRow]);
      else sh.getRange(lastRow + 1, 1, 1, lastCol).setValues([outRow]);
      try {
        auditPush_(isUpdate ? 'MASTER_UPDATE' : 'MASTER_CREATE', isUpdate ? opJsonSafe_(base) : null, opJsonSafe_(merged),
          'google:' + g.identity.email, merged.id);
      } catch (e2) {
        // [P0-B] audit wajib gagal -> perubahan master dibatalkan (bukan sukses + auditWarning)
        try {
          if (isUpdate) sh.getRange(idx + 2, 1, 1, lastCol).setValues([rows[idx]]); else sgUndoAppend_(sh, lastRow + 1, 1);
        } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan data master gagal: ' + re.message, null, merged.id); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; perubahan data master dibatalkan', null, merged.id);
      }
      return okResult_(isUpdate ? 'Data master diperbarui' : 'Data master dibuat', opJsonSafe_(merged));
    });
  } catch (e) {
    return sgErr_(e, 'WRITE_FAILED', 'Gagal menulis data master');
  }
}
