/**
 * Code.gs
 * Fase 3B-3A - HTTP Bridge (Google Apps Script Web App) antara
 * Bendahara_V2.html (via BridgeClient.js) dan TransactionEngine.gs.
 *
 * PRINSIP UTAMA: file ini TIDAK berisi satu baris pun logika bisnis
 * transaksi. Setiap action HANYA meneruskan payload APA ADANYA ke fungsi
 * TransactionEngine.gs yang SUDAH ADA (createIncome/createExpense/dst) -
 * validasi, lock, idempotency, rollback, audit SEMUANYA tetap 100% di
 * TransactionEngine.gs, tidak diduplikasi maupun diubah di sini.
 *
 * TIDAK menyentuh: TransactionEngine.gs, CreateDatabaseStructure.gs,
 * MigrationOneTime.gs, struktur 23 sheet yang sudah ada, 13_AUDIT_LOG,
 * 24_IDEMPOTENCY_LOG, data produksi.
 *
 * Satu-satunya sheet BARU yang file ini kelola: 25_DEVICE_WHITELIST
 * (dibuat idempotent/additive, pola sama seperti ensureIdempotencyLogSheet_
 * di TransactionEngine.gs, TAPI ditulis ulang independen di sini dengan
 * nama fungsi berbeda supaya TIDAK menyentuh TransactionEngine.gs sama
 * sekali).
 *
 * AUTH: Device Pairing (bukan token statis). Setiap perangkat generate
 * deviceId+deviceSecret sendiri (client-side, lihat BridgeClient.js),
 * request pairing, lalu MENUNGGU approval manual (ubah kolom status di
 * sheet 25_DEVICE_WHITELIST dari PENDING ke APPROVED langsung oleh admin
 * lewat Google Sheets - TIDAK ADA endpoint approval otomatis di fase ini,
 * sesuai instruksi "approval manual"). Server TIDAK PERNAH menyimpan
 * deviceSecret mentah - hanya SHA-256 hash-nya (tokenHash).
 *
 * ACTION YANG SENGAJA TIDAK DIDAFTARKAN (lihat audit desain Fase 3B-3A -
 * jangan bridge dulu): createBankMutation (tidak ada jalur HTML live yang
 * memanggilnya saat ini), TRANSFER (jenis belum didukung
 * validateJenis_() di TransactionEngine.gs), link mutasi ke transaksi,
 * hapus alokasi, edit nominal dengan alasan, upload bukti (10_BUKTI),
 * period closing.
 *
 * BELUM DI-DEPLOY sebagai Web App. Verifikasi sejauh ini HANYA lewat
 * Node.js vm sandbox (lihat laporan test terpisah) - BUKAN eksekusi
 * Apps Script sungguhan. Jangan mengklaim ini teruji di runtime Apps
 * Script nyata sebelum benar-benar dijalankan di sana.
 */

// ============================================================
// [DEVICE WHITELIST] Sheet BARU, independen dari TransactionEngine.gs.
// ============================================================
var SHT_DEVICE_WHITELIST = '25_DEVICE_WHITELIST';
var DEVICE_HEADERS = ['deviceId', 'deviceLabel', 'tokenHash', 'status', 'requestedAt', 'approvedAt', 'approvedBy', 'lastSeenAt'];
var DEVICE_STATUS_PENDING = 'PENDING';
var DEVICE_STATUS_APPROVED = 'APPROVED';
var DEVICE_STATUS_REVOKED = 'REVOKED';

function ensureDeviceWhitelistSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHT_DEVICE_WHITELIST);
  if (!sh) {
    sh = ss.insertSheet(SHT_DEVICE_WHITELIST);
    sh.getRange(1, 1, 1, DEVICE_HEADERS.length).setValues([DEVICE_HEADERS]);
    sh.getRange(1, 1, 1, DEVICE_HEADERS.length).setFontWeight('bold')
      .setBackground('#1F3864').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* SHA-256 hex - dipakai HANYA untuk membandingkan deviceSecret yang dikirim
   klien terhadap tokenHash tersimpan. Server TIDAK PERNAH menyimpan
   deviceSecret mentah di sheet mana pun. */
function sha256Hex_(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/* Reuse readAllRows_/findRowIndexById_/ss_/sheet_ dari TransactionEngine.gs
   (fungsi generik, bukan logika bisnis transaksi - aman dipakai ulang,
   TIDAK mendefinisikan ulang apa pun yang sudah ada di sana). */
function findDeviceRow_(deviceId) {
  if (!deviceId) return null;
  ensureDeviceWhitelistSheet_();
  var rows = readAllRows_(SHT_DEVICE_WHITELIST, DEVICE_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].deviceId === deviceId) return rows[i];
  }
  return null;
}

function recordDeviceLastSeen_(deviceId) {
  var rowIdx = findRowIndexById_(SHT_DEVICE_WHITELIST, deviceId);
  if (rowIdx > 0) {
    var lastSeenCol = DEVICE_HEADERS.indexOf('lastSeenAt') + 1;
    sheet_(SHT_DEVICE_WHITELIST).getRange(rowIdx, lastSeenCol, 1, 1).setValues([[new Date().toISOString()]]);
  }
}

/* [AUTH] Satu-satunya titik verifikasi device di seluruh file ini.
   status harus APPROVED (bukan PENDING/REVOKED) DAN hash(deviceSecret)
   harus cocok tokenHash tersimpan. Kode error dibedakan supaya
   BridgeClient.js bisa membedakan "belum diapprove" vs "sudah dicabut"
   vs "belum pernah pairing sama sekali" - ketiganya perlakuan berbeda
   di sisi klien (retry vs berhenti total vs mulai pairing baru). */
function checkDeviceAuth_(deviceId, deviceSecret) {
  if (!deviceId || !deviceSecret) {
    return errResult_('VALIDATION_ERROR', 'deviceId dan deviceSecret wajib diisi', 'deviceId');
  }
  var device = findDeviceRow_(deviceId);
  if (!device) {
    return errResult_('DEVICE_NOT_APPROVED', 'Device belum terdaftar - lakukan pairing dulu (action requestPairing)', 'deviceId');
  }
  if (device.status === DEVICE_STATUS_REVOKED) {
    return errResult_('DEVICE_REVOKED', 'Akses device ini sudah dicabut - hubungi admin', 'deviceId');
  }
  if (device.status !== DEVICE_STATUS_APPROVED) {
    return errResult_('DEVICE_NOT_APPROVED', 'Device belum disetujui admin (status saat ini: ' + device.status + ')', 'deviceId');
  }
  var hash = sha256Hex_(deviceSecret);
  if (hash !== device.tokenHash) {
    return errResult_('DEVICE_NOT_APPROVED', 'deviceSecret tidak cocok', 'deviceSecret');
  }
  recordDeviceLastSeen_(deviceId);
  return okResult_('Device terverifikasi', { deviceId: deviceId });
}

// ============================================================
// [PAIRING] Dua action yang TIDAK butuh device auth (justru untuk
// MEMBUAT device dikenal). Tidak pernah menyentuh sheet lain selain
// 25_DEVICE_WHITELIST.
// ============================================================
function handleRequestPairing_(body) {
  var deviceId = body.deviceId;
  var deviceLabel = body.deviceLabel || '(tanpa label)';
  var tokenHash = body.tokenHash; // klien WAJIB sudah menghash deviceSecret
  // sebelum mengirim (lihat BridgeClient.js) - server di titik INI PUN
  // tidak pernah menerima secret mentah untuk registrasi awal.
  if (!deviceId || !tokenHash) {
    return errResult_('VALIDATION_ERROR', 'deviceId dan tokenHash wajib diisi', 'deviceId');
  }
  var existing = findDeviceRow_(deviceId);
  if (existing) {
    return okResult_('Device sudah pernah request pairing sebelumnya', { deviceId: deviceId, status: existing.status });
  }
  var sh = ensureDeviceWhitelistSheet_();
  var now = new Date().toISOString();
  sh.getRange(sh.getLastRow() + 1, 1, 1, DEVICE_HEADERS.length)
    .setValues([[deviceId, deviceLabel, tokenHash, DEVICE_STATUS_PENDING, now, '', '', '']]);
  return okResult_('Pairing diminta - menunggu approval manual admin langsung di sheet ' + SHT_DEVICE_WHITELIST, { deviceId: deviceId, status: DEVICE_STATUS_PENDING });
}

function handleCheckPairingStatus_(body) {
  var deviceId = body.deviceId;
  if (!deviceId) return errResult_('VALIDATION_ERROR', 'deviceId wajib diisi', 'deviceId');
  var device = findDeviceRow_(deviceId);
  if (!device) return errResult_('NOT_FOUND', 'Device belum pernah request pairing', 'deviceId');
  return okResult_('Status device', { deviceId: deviceId, status: device.status });
}

// ============================================================
// [ROUTER] Satu-satunya titik dispatch action -> fungsi
// TransactionEngine.gs. Tidak ada logika bisnis di sini, hanya routing +
// gerbang auth + penerusan payload apa adanya.
// ============================================================
var PAIRING_ACTIONS_ = { requestPairing: true, checkPairingStatus: true };
/* [P0-C] Jalur HTTP lama (doPost + device pairing) DINONAKTIFKAN. Jalur ini hanya memeriksa device token
   (tanpa role 26_USER_ACCESS, tanpa AllocationGuard, clientRequestId tidak wajib) dan requestPairing menulis
   25_DEVICE_WHITELIST tanpa autentikasi. Bendahara_V2.html tidak memakainya (include BridgeClient dikomentari);
   jalur resmi = google.script.run -> op* (opGate_). Mengaktifkan kembali memerlukan keputusan & audit keamanan. */
var LEGACY_DOPOST_ENABLED_ = false;

function routeAction_(body) {
  if (!LEGACY_DOPOST_ENABLED_) return errResult_('LEGACY_BRIDGE_DISABLED', 'Jalur HTTP lama dinonaktifkan. Gunakan aplikasi Bendahara (akun Google terotorisasi).', null);
  if (!body || !body.action) {
    return errResult_('VALIDATION_ERROR', 'action wajib diisi', 'action');
  }
  var action = body.action;

  if (action === 'requestPairing') return handleRequestPairing_(body);
  if (action === 'checkPairingStatus') return handleCheckPairingStatus_(body);

  // Semua action LAIN wajib device auth - dicek SEBELUM apa pun lain
  // dijalankan (termasuk sebelum payload dibaca).
  var auth = checkDeviceAuth_(body.deviceId, body.deviceSecret);
  if (!auth.ok) return auth;

  var payload = body.payload || {};
  if (body.clientRequestId) payload.clientRequestId = body.clientRequestId;

  switch (action) {
    case 'createIncome': return createIncome_(payload);
    case 'createExpense': return createExpense_(payload);
    case 'createTransaction': return createTransaction_(payload);
    case 'createAllocation': return createAllocation_(payload);
    case 'updateTransaction': return updateTransaction_(payload);
    case 'getTransaction': return getTransaction_(payload.id);
    case 'getTransactions': return getTransactions_(payload);
    case 'getStudentPosition': return getStudentPosition_(payload.siswaId);
    case 'healthCheck': return healthCheck_();
    default:
      return errResult_('UNKNOWN_ACTION', 'Action tidak dikenal atau sengaja belum didukung bridge (lihat audit Fase 3B-3A): ' + action, 'action');
  }
}

// ============================================================
// [HTTP ENTRY POINTS] Satu-satunya doGet/doPost di seluruh project.
// ============================================================
function doGet(e) {
  // GET ?ping=1 tetap menyediakan health check JSON
  if (e && e.parameter && e.parameter.ping === '1') {
    return ContentService.createTextOutput(JSON.stringify(
      okResult_(
        'Code.gs bridge aktif',
        { serverTime: new Date().toISOString() }
      )
    )).setMimeType(ContentService.MimeType.JSON);
  }

  // Default: buka aplikasi Bendahara
  return HtmlService
    .createTemplateFromFile('Bendahara_V2')
    .evaluate()
    .setTitle('Bendahara Darul Arifin')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT); // [P0-C] tidak lagi ALLOWALL (cegah embedding dari domain lain)
}
function include(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}
function doPost(e) {
  var response;
  try {
    if (!LEGACY_DOPOST_ENABLED_) {
      response = errResult_('LEGACY_BRIDGE_DISABLED', 'Jalur HTTP lama dinonaktifkan. Gunakan aplikasi Bendahara (akun Google terotorisasi).', null); // [P0-C]
    } else if (!e || !e.postData || !e.postData.contents) {
      response = errResult_('VALIDATION_ERROR', 'Body request kosong', null);
    } else {
      var body = JSON.parse(e.postData.contents);
      response = routeAction_(body);
    }
  } catch (err) {
    response = errResult_('BRIDGE_ERROR', 'Gagal memproses request: ' + err.message, null);
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
function testBendaharaEvaluate() {
  var t = HtmlService.createTemplateFromFile('Bendahara_V2');

  try {
    var out = t.evaluate();
    Logger.log('EVALUATE PASS');
    Logger.log('HTML LENGTH: ' + out.getContent().length);
  } catch (e) {
    Logger.log('EVALUATE FAIL');
    Logger.log('NAME: ' + (e.name || ''));
    Logger.log('MESSAGE: ' + (e.message || e));
    Logger.log('STACK: ' + (e.stack || ''));
    throw e;
  }
}
function TEST_BRIDGE_TEMPLATE() {
  var html = HtmlService
    .createTemplateFromFile('Bendahara_V2')
    .evaluate()
    .getContent();

  Logger.log('=== BASIC ===');
  Logger.log('TOTAL HTML = ' + html.length);

  Logger.log('=== TAG COUNT ===');
  Logger.log('<script = ' + (html.match(/<script/gi) || []).length);
  Logger.log('</script> = ' + (html.match(/<\/script>/gi) || []).length);
  Logger.log('&lt;script = ' + (html.match(/&lt;script/gi) || []).length);
  Logger.log('&lt;/script = ' + (html.match(/&lt;\/script/gi) || []).length);

  Logger.log('=== BRIDGE POSITION ===');
  var b = html.indexOf('global.BridgeClient');
  Logger.log('BridgeClient position = ' + b);

  if (b >= 0) {
    Logger.log(
      html.substring(
        Math.max(0, b - 500),
        Math.min(html.length, b + 700)
      )
    );
  }

  Logger.log('=== SERVER POSITION ===');
  var s = html.indexOf('global.ServerBridge');
  Logger.log('ServerBridge position = ' + s);

  if (s >= 0) {
    Logger.log(
      html.substring(
        Math.max(0, s - 500),
        Math.min(html.length, s + 700)
      )
    );
  }

  Logger.log('=== SCRIPT START POSITIONS ===');

  var pos = 0;
  var count = 0;

  while ((pos = html.indexOf('<script', pos)) >= 0) {
    Logger.log(
      'SCRIPT #' + count + ' position = ' + pos +
      ' | ' +
      html.substring(pos, Math.min(html.length, pos + 120))
    );

    pos += 7;
    count++;
  }

  Logger.log('=== SCRIPT END POSITIONS ===');

  pos = 0;
  count = 0;

  while ((pos = html.indexOf('</script>', pos)) >= 0) {
    Logger.log(
      'END #' + count + ' position = ' + pos
    );

    pos += 9;
    count++;
  }

  Logger.log('=== FIRST SUSPICIOUS < INSIDE JS ===');

  var firstScript = html.indexOf('<script');
  var firstEnd = html.indexOf('</script>', firstScript + 7);

  if (firstScript >= 0 && firstEnd >= 0) {
    var js = html.substring(
      html.indexOf('>', firstScript) + 1,
      firstEnd
    );

    var lines = js.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Cari < yang bukan bagian dari operator <=
      if (line.indexOf('<') >= 0) {
        Logger.log(
          'LINE ' + (i + 1) + ': ' + line.substring(0, 500)
        );
      }
    }
  }
}
function TEST_SERVERBRIDGE_SYNTAX() {
  var html = HtmlService
    .createHtmlOutputFromFile('ServerBridge')
    .getContent();

  var start = html.indexOf('<script>');
  var end = html.lastIndexOf('</script>');

  Logger.log('LENGTH HTML = ' + html.length);
  Logger.log('SCRIPT START = ' + start);
  Logger.log('SCRIPT END = ' + end);

  if (start < 0 || end < 0 || end <= start) {
    Logger.log('SCRIPT WRAPPER = INVALID');
    return;
  }

  var js = html.substring(start + '<script>'.length, end);

  Logger.log('JS LENGTH = ' + js.length);
  Logger.log('JS HAS &lt; = ' + js.includes('&lt;'));
  Logger.log('JS HAS &gt; = ' + js.includes('&gt;'));

  try {
    new Function(js);
    Logger.log('JAVASCRIPT SYNTAX = PASS');
  } catch (e) {
    Logger.log('JAVASCRIPT SYNTAX = FAIL');
    Logger.log('ERROR = ' + e.message);
  }
}