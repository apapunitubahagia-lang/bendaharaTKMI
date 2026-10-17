/**
 * AuthCentral.gs
 * FASE 3B-4 PROMPT 1 - LOCAL BUILD (Google Account Authorization).
 *
 * TERPISAH dari Code.gs/TransactionEngine.gs/BridgeClient.js/Bendahara_V2.html
 * produksi - file ini BARU, belum ditempel ke project Apps Script mana pun,
 * belum dipanggil dari endpoint production apa pun.
 *
 * ASUMSI (belum diverifikasi live): saat file ini nanti digabungkan ke
 * project Apps Script yang sama dengan TransactionEngine.gs, fungsi generik
 * ss_()/sheet_()/readAllRows_() dari TransactionEngine.gs SUDAH tersedia di
 * scope global yang sama (satu Apps Script project = satu scope untuk semua
 * file .gs) - karena itu TIDAK diduplikasi di sini, sama seperti Code.gs
 * juga tidak mendefinisikan ulang.
 *
 * TIDAK membuat sheet apa pun. TIDAK menulis Sheets.
 * 26_USER_ACCESS BELUM ada di production (dikonfirmasi lewat pembacaan
 * langsung Sheets API pada audit Fase 3B-4 Step 3 & Prompt 1 - bukan
 * tebakan). readAllRows_() terhadap sheet yang belum ada mengembalikan []
 * (BUKAN error, lihat TransactionEngine.gs:93-104), sehingga
 * lookupUserAccess_() akan SELALU mengembalikan null untuk email apa pun
 * sampai sheet itu benar-benar dibuat + diisi lewat ACC terpisah - ini
 * SENGAJA (default DENIED, bukan default ALLOW), bukan bug.
 */

var SHT_USER_ACCESS = '26_USER_ACCESS';
var USER_ACCESS_HEADERS = ['id', 'email', 'nama', 'role', 'unit', 'status', 'createdAt', 'updatedAt'];
var USER_STATUS_ACTIVE = 'ACTIVE';
var USER_STATUS_INACTIVE = 'INACTIVE';

function normalizeEmail_(email) {
  return (email || '').toString().trim().toLowerCase();
}

/* [A3] HANYA membaca 26_USER_ACCESS lewat readAllRows_ (generik, dari
   TransactionEngine.gs) - tidak pernah sheet_()/ensureXxxSheet_() di sini,
   supaya TIDAK PERNAH ada jalur yang membuat sheet ini secara tidak sengaja. */
function lookupUserAccess_(email) {
  var norm = normalizeEmail_(email);
  if (!norm) return null;
  var rows = readAllRows_(SHT_USER_ACCESS, USER_ACCESS_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeEmail_(rows[i].email) === norm) return rows[i];
  }
  return null;
}

/* [A1] Identitas Google Account.
 * deps (opsional) HANYA untuk dependency injection saat test lokal
 * (Node sandbox / AUTH_CENTRAL_TEST.gs skenario simulasi) - TIDAK BISA
 * dikirim dari client lewat google.script.run (fungsi tidak bisa
 * di-serialize lintas client->server di Apps Script), jadi ini BUKAN
 * celah untuk klien memalsukan identitas. Dipanggil tanpa argumen di
 * pemakaian nyata -> default ke Session.getActiveUser() + lookupUserAccess_
 * yang REAL.
 *
 * JANGAN menganggap hasil fungsi ini sebagai bukti Session.getActiveUser()
 * bekerja LIVE - itu HANYA terbukti kalau dijalankan sungguhan di Apps
 * Script (lihat AUTH_CENTRAL_TEST.gs untuk live test oleh user).
 */
function getCurrentUserIdentity(deps) {
  deps = deps || {};
  var getEmail = deps.getEmail || function () { return Session.getActiveUser().getEmail(); };
  var lookup = deps.lookupUserAccess || lookupUserAccess_;

  var rawEmail = '';
  var errorMessage = null;
  try { rawEmail = getEmail(); } catch (e) { errorMessage = e.message; }
  var email = normalizeEmail_(rawEmail);

  if (!email) {
    return {
      ok: true, authorized: false, code: 'AUTH_REQUIRED',
      email: '', role: null, unit: null,
      message: 'Sesi Google tidak terdeteksi.',
      errorMessage: errorMessage
    };
  }

  // [P0-A] Header 26_USER_ACCESS dibaca berdasarkan NAMA (readAllRows_ -> SchemaGuard). Bila kolom wajib
  // hilang/ganda, akses DITOLAK (gagal tertutup) - tidak pernah menebak role dari kolom yang bergeser.
  var access;
  try { access = lookup(email); } catch (lookupErr) {
    return {
      ok: true, authorized: false, code: (lookupErr && lookupErr.code) || 'AUTH_LOOKUP_FAILED',
      email: email, role: null, unit: null,
      message: 'Data akses pengguna tidak dapat dibaca dengan aman. Hubungi admin.'
    };
  }
  if (!access) {
    return {
      ok: true, authorized: false, code: 'USER_NOT_FOUND',
      email: email, role: null, unit: null,
      message: 'Pengguna tidak memiliki akses ke sistem.'
    };
  }
  if (access.status !== USER_STATUS_ACTIVE) {
    return {
      ok: true, authorized: false, code: 'USER_INACTIVE',
      email: email, role: access.role || null, unit: access.unit || null,
      message: 'Pengguna tidak memiliki akses ke sistem.'
    };
  }
  return {
    ok: true, authorized: true, code: 'SUCCESS',
    email: email, role: access.role, unit: access.unit || null,
    message: 'Terautentikasi.'
  };
}

/* [A4] Gatekeeper terpusat. requiredRole opsional (null/undefined = cukup
   authorized, tanpa syarat role tertentu). BELUM dipasang ke satu pun
   endpoint production - hanya helper siap pakai (dipakai oleh
   MasterDataRead.gs di file ini, TIDAK menyentuh Code.gs production). */
function authorizeCurrentUser_(requiredRole, deps) {
  var identity = getCurrentUserIdentity(deps);
  if (!identity.authorized) return identity;
  if (requiredRole && identity.role !== requiredRole) {
    return {
      ok: true, authorized: false, code: 'ROLE_NOT_ALLOWED',
      email: identity.email, role: identity.role, unit: identity.unit,
      message: 'Pengguna tidak memiliki akses ke sistem.'
    };
  }
  return identity;
}
