/**
 * AdminAPI.gs
 * - Manajemen akses (26_USER_ACCESS): daftar, tambah, ubah, aktif/nonaktif - dengan authorization,
 *   perlindungan lockout, audit.
 * - Migrasi skema ADITIF: hanya MENAMBAH kolom di ujung baris header. Tidak mengubah data,
 *   tidak menghapus/mengurutkan ulang kolom. Harus dipicu eksplisit (confirm token), tidak otomatis.
 * DEPENDENSI: OperationalAPI.gs, RecordEngine.gs, TransactionEngine.gs, AuthCentral.gs.
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */

var OP_USER_ROLES_ = ['BENDAHARA', 'KEPALA_SEKOLAH', 'YAYASAN', 'AUDITOR'];
var OP_EMAIL_RE_ = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function opUserList() {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  var m = opSheetModel_('26_USER_ACCESS');
  if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 26_USER_ACCESS tidak ditemukan', null);
  return okResult_('OK', { me: g.identity.email, users: opJsonSafe_(m.rows.map(function (r) { return opRowObj_(m.live, r); })) });
}

function opUserUpsert(record) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return errResult_('VALIDATION_ERROR', 'record wajib berupa objek', 'record');
  var email = opNorm_(record.email);
  if (!OP_EMAIL_RE_.test(email)) return errResult_('VALIDATION_ERROR', 'email tidak valid', 'email');
  var role = opStr_(record.role), unit = opStr_(record.unit), status = opStr_(record.status) || 'ACTIVE', nama = opStr_(record.nama);
  if (OP_USER_ROLES_.indexOf(role) === -1) return errResult_('VALIDATION_ERROR', 'role tidak valid', 'role');
  if (['', 'TK', 'MI'].indexOf(unit) === -1) return errResult_('VALIDATION_ERROR', 'unit harus kosong/TK/MI', 'unit');
  if (['ACTIVE', 'INACTIVE'].indexOf(status) === -1) return errResult_('VALIDATION_ERROR', 'status harus ACTIVE/INACTIVE', 'status');
  if (!nama) return errResult_('VALIDATION_ERROR', 'nama wajib diisi', 'nama');
  try {
    return withLock_(function () {
      var m = opSheetModel_('26_USER_ACCESS');
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 26_USER_ACCESS tidak ditemukan', null);
      var c = function (h) { return m.live.indexOf(h); };
      if (['id', 'email', 'nama', 'role', 'unit', 'status', 'createdAt', 'updatedAt'].some(function (h) { return c(h) === -1; })) return errResult_('SCHEMA_MISMATCH', 'Header 26_USER_ACCESS tidak lengkap', null);
      var idx = -1, i;
      var rid = opStr_(record.id);
      for (i = 0; i < m.rows.length; i++) { if (rid ? String(m.rows[i][c('id')]) === rid : false) { idx = i; break; } }
      if (rid && idx === -1) return errResult_('NOT_FOUND', 'Pengguna tidak ditemukan', 'id');
      for (i = 0; i < m.rows.length; i++) { if (i !== idx && opNorm_(m.rows[i][c('email')]) === email) return errResult_('DUPLICATE', 'Email sudah terdaftar', 'email'); }
      // proteksi lockout: tidak boleh menonaktifkan/menurunkan diri sendiri, dan harus tersisa >=1 BENDAHARA ACTIVE
      var after = m.rows.map(function (r, k) { return k === idx ? { email: email, role: role, status: status } : { email: opNorm_(r[c('email')]), role: String(r[c('role')]), status: String(r[c('status')]) }; });
      if (idx === -1) after.push({ email: email, role: role, status: status });
      if (opNorm_(g.identity.email) === email && (status !== 'ACTIVE' || role !== 'BENDAHARA')) return errResult_('SELF_LOCKOUT', 'Tidak boleh menonaktifkan atau menurunkan akun sendiri', 'status');
      if (!after.some(function (u) { return u.role === 'BENDAHARA' && u.status === 'ACTIVE'; })) return errResult_('SELF_LOCKOUT', 'Harus tersisa minimal satu BENDAHARA aktif', 'role');
      if (idx >= 0 && opNorm_(m.rows[idx][c('email')]) === email && opStr_(m.rows[idx][c('nama')]) === nama && opStr_(m.rows[idx][c('role')]) === role && opStr_(m.rows[idx][c('unit')]) === unit && opStr_(m.rows[idx][c('status')]) === status) {
        // [GAP-031] replay tanpa perubahan = satu efek: tidak menulis updatedAt dan tidak mengaudit ulang
        var same = okResult_('Akses pengguna tidak berubah (sudah sama)', opJsonSafe_(opRowObj_(m.live, m.rows[idx]))); same.data.unchanged = true; return same;
      }
      var now = new Date().toISOString(), before = null, row;
      if (idx >= 0) { before = opRowObj_(m.live, m.rows[idx]); row = m.rows[idx].slice(); }
      else { row = m.live.map(function () { return ''; }); row[c('id')] = 'gas_usr_' + Utilities.getUuid(); row[c('createdAt')] = now; }
      row[c('email')] = email; row[c('nama')] = nama; row[c('role')] = role; row[c('unit')] = unit; row[c('status')] = status; row[c('updatedAt')] = now;
      if (idx >= 0) m.sh.getRange(idx + 2, 1, 1, m.lastCol).setValues([row]); else m.sh.getRange(m.lastRow + 1, 1, 1, m.lastCol).setValues([row]);
      var saved = opRowObj_(m.live, row), out = okResult_(idx >= 0 ? 'Akses pengguna diperbarui' : 'Pengguna ditambahkan', opJsonSafe_(saved));
      try { opAuditBulk_([[idx >= 0 ? 'ACCESS_UPDATE' : 'ACCESS_CREATE', before, saved, String(saved.id)]], g.identity.email); } catch (e) {
        // [P0-B] audit wajib gagal -> perubahan akses dibatalkan
        try { if (idx >= 0) m.sh.getRange(idx + 2, 1, 1, m.lastCol).setValues([m.rows[idx]]); else sgUndoAppend_(m.sh, m.lastRow + 1, 1); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan akses gagal: ' + re.message, null); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; perubahan akses pengguna dibatalkan', null);
      }
      return out;
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal menyimpan akses pengguna'); }
}

/* ---- MIGRASI SKEMA ADITIF ---- */
var OP_RECORD_SHEETS_ = ['04_KEWAJIBAN', '05_TRANSAKSI', '06_ALOKASI', '08_ANGGARAN', '09_KOMITMEN', '10_BUKTI', '11_MUTASI_BANK', '12_DUP_REVIEW', '14_KPI', '16_REKONSILIASI', '17_LAPORAN', '18_RKAT', '19_LPJ'];
var OP_SCHEMA_ADD_ = {
  '01_SISWA': { cols: ['alamat'], why: 'Alamat siswa dari import (field sudah dipakai aplikasi)' },
  '02_KOMPONEN': { cols: ['sasaran', 'basisTarif', 'menggantikan'], why: 'Sasaran tagihan (BARU/DAFTAR_ULANG), dasar tarif (per hari katering terjadwal), dan komponen lump yang digantikan rincian' },
  '03_TARIF': { cols: ['status'], why: 'Menonaktifkan tarif tanpa menghapus (kolom ada di skema kode, belum ada di sheet live)' },
  '09_KOMITMEN': { cols: ['rabId'], why: 'Penghubung komitmen ke RAB: dipakai submitObligasi, komitmenForRab, dan perhitungan komitmen di Financial Control Center; tidak ada di sheet live' },
  '08_ANGGARAN': { cols: ['status', 'subkategori', 'volume', 'satuan', 'hargaSatuan', 'keterangan', 'sourceSheet', 'importDate', 'importUser', 'jenis', 'komponenId'], why: 'Field model RAB/anggaran yang belum punya kolom + jenis (PEMASUKAN/PENGELUARAN) dan komponenId (anggaran pemasukan terhubung ke komponen penerimaan)' },
  '18_RKAT': { cols: ['docId'], why: 'ID dokumen RKAT yang dipakai import' },
  '19_LPJ': { cols: ['hargaSatuan', 'keterangan'], why: 'Field LPJ yang sudah dipakai aplikasi' },
  '04_KEWAJIBAN': { cols: ['jatuhTempo', 'tahunAjaran', 'kelas', 'unit', 'tarifId', 'tarifSatuan', 'jumlahHari'], why: 'Snapshot tagihan resmi: jatuh tempo, tahun ajaran, serta kelas/unit/tarif/jumlah hari yang DIPAKAI saat kewajiban dibuat (agar tarif berubah tidak mengubah tagihan lama)' },
  '12_DUP_REVIEW': { cols: ['type', 'payload'], why: 'Antrean review import (tipe + payload JSON)' }
};
function opSchemaWanted_() {
  var want = {};
  Object.keys(OP_SCHEMA_ADD_).forEach(function (s) { want[s] = { cols: OP_SCHEMA_ADD_[s].cols.slice(), why: [OP_SCHEMA_ADD_[s].why] }; });
  OP_RECORD_SHEETS_.forEach(function (s) {
    want[s] = want[s] || { cols: [], why: [] };
    OP_ARCHIVE_COLS_.forEach(function (c) { if (want[s].cols.indexOf(c) === -1) want[s].cols.push(c); });
    want[s].why.push('Arsip/reversal tanpa hapus permanen (archivedAt, archivedBy, archiveReason)');
  });
  return want;
}
function opSchemaPlan() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  var want = opSchemaWanted_(), plan = [];
  Object.keys(want).sort().forEach(function (s) {
    var m = opSheetModel_(s);
    if (!m) { plan.push({ sheet: s, status: 'MISSING_SHEET', add: [] }); return; }
    var add = want[s].cols.filter(function (c) { return m.live.indexOf(c) === -1; });
    plan.push({ sheet: s, status: add.length ? 'NEEDS_ADD' : 'OK', liveColumns: m.live.length, add: add, why: want[s].why.join('; ') });
  });
  return okResult_('OK', { plan: plan, pendingSheets: plan.filter(function (p) { return p.add && p.add.length; }).length, note: 'Hanya MENAMBAH kolom di ujung header. Data, urutan, dan kolom lama tidak diubah.' });
}
function opSchemaApply(confirm) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (confirm !== 'TAMBAH_KOLOM_ADITIF') return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (TAMBAH_KOLOM_ADITIF)', 'confirm');
  /* [P1-B] Gagal tertutup: rencana penambahan kolom DIAUDIT LEBIH DULU. Audit gagal -> tidak ada kolom yang
     ditambahkan (bukan lagi "kolom ditambah + auditWarning"). Bila penambahan gagal di tengah jalan, sel header
     yang baru ditulis dikosongkan kembali dan kegagalan dicatat. */
  try {
    return withLock_(function () {
      var want = opSchemaWanted_(), plan = [], audits = [];
      Object.keys(want).sort().forEach(function (s) {
        var m = opSheetModel_(s); if (!m || m.lastCol < 1) return;
        var add = want[s].cols.filter(function (c) { return m.live.indexOf(c) === -1; });
        if (!add.length) return;
        plan.push({ m: m, sheet: s, add: add });
        audits.push(['SCHEMA_ADD_COLUMNS', { sheet: s, columnsBefore: m.live }, { sheet: s, added: add }, s]);
      });
      if (!plan.length) return okResult_('Tidak ada kolom yang perlu ditambah', { added: [] });
      try { opAuditBulk_(audits, g.identity.email); } catch (e) {
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; tidak ada kolom yang ditambahkan', null);
      }
      var added = [];
      try {
        plan.forEach(function (p) {
          var m = p.m, add = p.add;
          if (typeof m.sh.getMaxColumns === 'function' && m.sh.getMaxColumns() < m.lastCol + add.length && typeof m.sh.insertColumnsAfter === 'function') m.sh.insertColumnsAfter(m.sh.getMaxColumns(), m.lastCol + add.length - m.sh.getMaxColumns());
          var rg = m.sh.getRange(1, m.lastCol + 1, 1, add.length);
          rg.setValues([add]);
          added.push(p);
          try { m.sh.getRange(1, m.lastCol, 1, 1).copyTo(rg, { formatOnly: true }); } catch (e) { /* format opsional */ }
        });
      } catch (e) {
        var undoErr = null;
        added.forEach(function (p) { try { p.m.sh.getRange(1, p.m.lastCol + 1, 1, p.add.length).setValues([p.add.map(function () { return ''; })]); } catch (ue) { undoErr = ue; } });
        try { opAuditBulk_([['SCHEMA_ADD_COLUMNS_FAILED', null, { error: String(e && e.message || e), dibatalkan: added.map(function (p) { return p.sheet; }) }, 'schema']], g.identity.email); } catch (e2) { /* sudah gagal; dilaporkan lewat hasil */ }
        if (undoErr) return errResult_('ROLLBACK_FAILED', 'Penambahan kolom gagal DAN pembatalan header gagal: ' + undoErr.message, null);
        return errResult_('WRITE_FAILED', 'Penambahan kolom gagal; header yang sempat ditulis dikosongkan kembali', null);
      }
      return okResult_('Kolom aditif ditambahkan', { added: added.map(function (p) { return { sheet: p.sheet, add: p.add }; }) });
    });
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal menambah kolom', null); }
}
