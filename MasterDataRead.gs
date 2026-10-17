/**
 * MasterDataRead.gs
 * FASE 3B-4 PROMPT 1 - LOCAL BUILD (Central Master Data Read API).
 *
 * READ-ONLY. Tidak ada satu fungsi pun di file ini yang menulis ke Sheets
 * manapun (tidak ada setValues/appendRow/insertSheet di seluruh file).
 *
 * Setiap fungsi WAJIB lewat authorizeCurrentUser_() (AuthCentral.gs) lebih
 * dulu - kalau tidak authorized, mengembalikan hasil authorizeCurrentUser_()
 * apa adanya (sudah berisi code AUTH_REQUIRED/USER_NOT_FOUND/USER_INACTIVE/
 * ROLE_NOT_ALLOWED) dan TIDAK PERNAH lanjut membaca sheet apa pun - urutan
 * ini penting: authorization SELALU sebelum read, tanpa kecuali.
 *
 * Nama sheet + urutan kolom di bawah adalah FAKTA yang dikonfirmasi lewat
 * pembacaan langsung Google Sheets API pada spreadsheet produksi
 * (1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY) saat audit Prompt 1 ini -
 * BUKAN tebakan dari dokumentasi lama. Kesembilan sheet di bawah SUDAH ADA
 * dan SUDAH BERISI data produksi (bukan sheet kosong hasil scaffolding).
 *
 * TIDAK ADA sheet server-side terpisah untuk "wali" - field waliId/
 * namaWali/kontakWali sudah menyatu di kolom 01_SISWA (lihat
 * CreateDatabaseStructure.gs baris 44-45). getGuardians() di bawah karena
 * itu MENURUNKAN data wali dari baris 01_SISWA (dedup per waliId), bukan
 * membaca sheet wali independen yang memang tidak pernah ada.
 */

/* [PATCH ADITIF] Bila header LIVE memuat semua kolom yang diharapkan, baca berdasarkan NAMA kolom live
   (kolom tambahan hasil migrasi aditif, mis. status di 03_TARIF/07_AKUN, ikut terbaca; urutan kolom tidak lagi
   berpengaruh). Bila tidak, jatuh ke pembacaan posisional lama persis seperti sebelumnya. */
function readMasterRows_(sheetName, headers) {
  // [P0-A] Kolom wajib dicari berdasarkan NAMA header live. Bila ada yang hilang -> Error SCHEMA_MISMATCH.
  // Fallback posisional lama DIHAPUS: data dengan kolom bergeser tidak pernah dikembalikan.
  var m = sgModel_(sheetName, headers);
  if (!m) return [];
  return m.values.map(function (r) {
    var o = sgObj_(m, r);
    return typeof opJsonSafe_ === 'function' ? opJsonSafe_(o) : o;
  });
}

var SISWA_HEADERS_ = ['id', 'nama', 'nis', 'nisn', 'kelas', 'unit', 'tahunAjaran', 'jenisKelamin', 'waliId', 'namaWali', 'kontakWali', 'tanggalMasuk', 'tanggalKeluar', 'status'];

function getStudents(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('01_SISWA', SISWA_HEADERS_) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getGuardians(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    var siswaRows = readMasterRows_('01_SISWA', SISWA_HEADERS_);
    var seen = {};
    var out = [];
    siswaRows.forEach(function (s) {
      if (!s.waliId || seen[s.waliId]) return;
      seen[s.waliId] = true;
      out.push({ waliId: s.waliId, namaWali: s.namaWali, kontakWali: s.kontakWali });
    });
    return {
      ok: true, code: 'SUCCESS', data: out,
      note: 'Diturunkan dari 01_SISWA (tidak ada sheet wali independen) - satu baris per waliId unik.'
    };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getComponents(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('02_KOMPONEN', ['id', 'nama', 'unit', 'frekuensi', 'status', 'aliasOf']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getTariffs(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('03_TARIF', ['id', 'komponenId', 'unit', 'kelas', 'tahunAjaran', 'nominal']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getAccounts(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('07_AKUN', ['id', 'nama', 'jenis', 'saldoAwal']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getIncomeCategories(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('20_KATEGORI_PENERIMAAN', ['id', 'kode', 'kategori', 'status']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getExpenseCategories(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('21_KATEGORI_PENGELUARAN', ['id', 'kode', 'kategori', 'status']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getSubcategories(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('22_SUBKATEGORI', ['id', 'kategoriId', 'nama', 'status']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

function getAcademicYears(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    return { ok: true, code: 'SUCCESS', data: readMasterRows_('23_TAHUN_AJARAN', ['id', 'label', 'status']) };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}

/* 15_SETTINGS berbentuk KEY-VALUE PER BARIS di Sheets (header: key, value,
   updatedAt) - BEDA bentuk dengan objek tunggal Store.loadSettings() di
   localStorage Bendahara_V2.html. getSettings() di bawah mengembalikan
   hasil TRANSFORM ke objek {key:value}, bukan array baris mentah - supaya
   pemanggil tidak perlu tahu bentuk sheet aslinya. Ini keputusan desain,
   dicatat eksplisit supaya tidak disalahartikan sebagai bug bentuk data. */
function getSettings(deps) {
  var auth = authorizeCurrentUser_(null, deps);
  if (!auth.authorized) return auth;
  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur
    var rows = readMasterRows_('15_SETTINGS', ['key', 'value', 'updatedAt']);
    var out = {};
    rows.forEach(function (r) { out[r.key] = r.value; });
    return {
      ok: true, code: 'SUCCESS', data: out,
      note: '15_SETTINGS berbentuk key-value per baris di Sheets - ditransform ke objek {key:value} di sini.'
    };
  } catch (e) {
    return sgErr_(e, 'READ_FAILED', 'Gagal membaca data master');
  }
}
