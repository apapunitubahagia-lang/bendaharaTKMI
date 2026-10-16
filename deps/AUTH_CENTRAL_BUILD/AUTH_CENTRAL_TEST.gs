/**
 * AUTH_CENTRAL_TEST.gs
 * FASE 3B-4 PROMPT 1 - TEST HARNESS UNTUK USER MENJALANKAN LIVE.
 *
 * WAJIB disalin bersama AuthCentral.gs + MasterDataRead.gs (dan
 * TransactionEngine.gs, untuk ss_/sheet_/readAllRows_) ke PROJECT Apps
 * Script yang SAMA - fungsi-fungsi di file ini memanggil fungsi dari kedua
 * file itu langsung (tanpa prefix), jadi harus ada di scope global yang
 * sama.
 *
 * SEMUA fungsi di file ini HANYA MEMBACA (identitas Session + Sheets
 * read-only). TIDAK ADA yang menulis Sheets, membuat 26_USER_ACCESS, atau
 * membuat transaksi. previewUserAccessSheet() HANYA melaporkan status
 * sheet tsb, TIDAK PERNAH membuatnya.
 *
 * CARA PAKAI (ringkas):
 * 1. Di project Apps Script (project yang SAMA dengan TransactionEngine.gs
 *    production, atau salinan test terpisah - pilih yang Anda maksud),
 *    jalankan salah satu fungsi di bawah lewat dropdown "Select function"
 *    di toolbar editor, lalu klik Run.
 * 2. Buka View > Logs (atau Ctrl+Enter) untuk melihat hasilnya.
 * 3. Salin hasil Logger.log apa adanya (termasuk kalau error) dan
 *    laporkan balik - JANGAN diringkas/ditafsirkan dulu.
 *
 * HASIL YANG DIHARAPKAN SEBELUM 26_USER_ACCESS DIBUAT (ini NORMAL, bukan
 * kegagalan): testCurrentUserIdentity/testAuthorizedUser/
 * testMasterDataReadOnly semuanya akan authorized:false, code:
 * USER_NOT_FOUND - itu justru bukti gatekeeper default-DENIED bekerja
 * benar sebelum data otorisasi ada.
 */

function testCurrentUserIdentity() {
  var result = getCurrentUserIdentity();
  Logger.log('testCurrentUserIdentity: ' + JSON.stringify(result));
  return result;
}

function testAuthorizedUser() {
  var result = authorizeCurrentUser_();
  Logger.log('testAuthorizedUser: ' + JSON.stringify(result));
  return result;
}

/* Simulasi email yang pasti tidak pernah ada di 26_USER_ACCESS, lewat
   dependency injection (bukan email Google Anda) - harus selalu
   USER_NOT_FOUND, di kondisi apa pun. */
function testUnknownUser() {
  var result = getCurrentUserIdentity({ getEmail: function () { return 'tidak-pernah-ada-di-mana-pun@example.invalid'; } });
  Logger.log('testUnknownUser: ' + JSON.stringify(result));
  return result;
}

/* Baru benar-benar teruji signifikan SETELAH 26_USER_ACCESS dibuat + ada
   1 baris berstatus INACTIVE untuk email di bawah (ganti placeholder-nya).
   Selama sheet/baris itu belum ada, hasilnya akan USER_NOT_FOUND (bukan
   USER_INACTIVE) - itu FAKTA yang harus dilaporkan apa adanya, bukan
   dianggap gagal. */
function testInactiveUser() {
  var result = getCurrentUserIdentity({ getEmail: function () { return 'GANTI_DENGAN_EMAIL_INACTIVE_UNTUK_TEST@example.com'; } });
  Logger.log('testInactiveUser: ' + JSON.stringify(result));
  return result;
}

function testWrongRole() {
  var result = authorizeCurrentUser_('ROLE_YANG_TIDAK_DIMILIKI_SIAPA_PUN');
  Logger.log('testWrongRole: ' + JSON.stringify(result));
  return result;
}

/* PREVIEW-ONLY - hanya melaporkan apakah 26_USER_ACCESS sudah ada dan
   berapa baris isinya. TIDAK PERNAH membuatnya kalau belum ada. */
function previewUserAccessSheet() {
  var ss = ss_();
  var sh = ss.getSheetByName('26_USER_ACCESS');
  var result;
  if (!sh) {
    result = { exists: false, note: '26_USER_ACCESS BELUM ada - NORMAL untuk fase ini, TIDAK dibuat otomatis oleh test ini.' };
  } else {
    result = { exists: true, rowCount: Math.max(0, sh.getLastRow() - 1), headerRow: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] };
  }
  Logger.log('previewUserAccessSheet: ' + JSON.stringify(result));
  return result;
}

/* Memanggil identity + SEMUA read API master data sekaligus - berguna
   untuk sekali lihat semua status authorization + bentuk data asli tiap
   collection (termasuk getSettings() yang sudah ditransform ke objek). */
function testMasterDataReadOnly() {
  var out = {
    identity: getCurrentUserIdentity(),
    students: getStudents(),
    guardians: getGuardians(),
    components: getComponents(),
    tariffs: getTariffs(),
    accounts: getAccounts(),
    incomeCategories: getIncomeCategories(),
    expenseCategories: getExpenseCategories(),
    subcategories: getSubcategories(),
    academicYears: getAcademicYears(),
    settings: getSettings()
  };
  Logger.log('testMasterDataReadOnly: ' + JSON.stringify(out));
  return out;
}
