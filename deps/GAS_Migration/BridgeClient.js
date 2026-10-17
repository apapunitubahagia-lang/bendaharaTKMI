/**
 * BridgeClient.js
 * Fase 3B-3A - klien sinkronisasi Bendahara_V2.html -> Code.gs (Apps Script
 * Web App) -> TransactionEngine.gs -> Google Sheets.
 *
 * PRINSIP: localStorage tetap PRIMARY/sumber kebenaran harian (postTransaksi/
 * createAlokasi di Bendahara_V2.html TIDAK berubah alurnya sama sekali -
 * file ini hanya DITAMBAHKAN sebagai lapisan pengiriman di belakang layar,
 * TIDAK PERNAH memblokir UI). Sheets adalah TARGET source of truth jangka
 * panjang - lihat reconcilePeriode() di bawah untuk perbandingan manual,
 * BUKAN auto-correct dua arah.
 *
 * BELUM di-deploy/di-hubungkan ke Web App sungguhan pada tahap ini
 * (webAppUrl kosong sampai diisi manual setelah Code.gs benar-benar
 * di-deploy - itu langkah TERPISAH yang belum dilakukan). Verifikasi
 * sejauh ini HANYA lewat Node.js sandbox dengan localStorage/fetch/crypto
 * tiruan - BUKAN browser sungguhan, BUKAN Apps Script Web App sungguhan.
 */
(function (global) {
  'use strict';

  var LS_PREFIX = 'draBendaharaV2_';
  var QUEUE_KEY = LS_PREFIX + 'syncQueue';
  var DEVICE_KEY = LS_PREFIX + 'device';
  var DECISION_QUEUE_KEY = LS_PREFIX + 'syncDecisionQueue';
  var CONFIG_KEY = LS_PREFIX + 'bridgeConfig';

  /* [C] Klasifikasi retryable vs permanen - PERSIS mengikuti kode error
     kontrak TransactionEngine.gs (errResult_.code). Kode yang TIDAK ada di
     daftar retryable dianggap PERMANEN (mis. semua VALIDATION_ERROR, kode
     INVALID_ACCOUNT/INVALID_STUDENT/INVALID_COMPONENT/INVALID_TRANSACTION/
     INVALID_ALLOCATION, ALLOCATION_EXCEEDS_TRANSACTION, IDEMPOTENCY_ORPHAN,
     DEVICE_NOT_APPROVED, DEVICE_REVOKED) - retry tidak akan pernah mengubah
     hasilnya, jadi TIDAK diulang otomatis. */
  var RETRYABLE_CODES = { LOCK_TIMEOUT: true, WRITE_FAILED: true, NETWORK_ERROR: true, HTTP_ERROR: true, BRIDGE_ERROR: true };
  var MAX_ATTEMPTS = 10;
  var BASE_DELAY_MS = 30000; // 30 detik
  var MAX_DELAY_MS = 30 * 60 * 1000; // 30 menit

  function lsGet(key, fallback) {
    try { var v = global.localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { if (global.console) console.error('BridgeClient: lsSet gagal', key, e); }
  }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function getCrypto() { return global.crypto || (typeof window !== 'undefined' ? window.crypto : null); }

  function randomHex(byteLen) {
    var arr = new Uint8Array(byteLen);
    getCrypto().getRandomValues(arr);
    var out = '';
    for (var i = 0; i < arr.length; i++) { var h = arr[i].toString(16); out += h.length === 1 ? '0' + h : h; }
    return out;
  }

  function sha256Hex(str) {
    var enc = new TextEncoder().encode(str);
    return getCrypto().subtle.digest('SHA-256', enc).then(function (digest) {
      var bytes = new Uint8Array(digest);
      var out = '';
      for (var i = 0; i < bytes.length; i++) { var h = bytes[i].toString(16); out += h.length === 1 ? '0' + h : h; }
      return out;
    });
  }

  // ============================================================
  // [B] DEVICE IDENTITY - dibuat sekali per browser/perangkat, disimpan
  // HANYA di localStorage perangkat itu. deviceSecret TIDAK PERNAH dikirim
  // dalam bentuk apa pun selain untuk registrasi awal (sebagai hash) dan
  // untuk verifikasi tiap request (dihash ULANG di server, lihat Code.gs).
  // ============================================================
  function getDevice() {
    var d = lsGet(DEVICE_KEY, null);
    if (!d) {
      d = { deviceId: uid('dev'), deviceSecret: randomHex(32), status: 'UNPAIRED', label: '' };
      lsSet(DEVICE_KEY, d);
    }
    return d;
  }
  function setDeviceStatus(status) { var d = getDevice(); d.status = status; lsSet(DEVICE_KEY, d); return d; }
  function setDeviceLabel(label) { var d = getDevice(); d.label = label; lsSet(DEVICE_KEY, d); return d; }

  function getConfig() { return lsGet(CONFIG_KEY, { webAppUrl: '' }); }
  function setWebAppUrl(url) { var c = getConfig(); c.webAppUrl = url; lsSet(CONFIG_KEY, c); }

  function callBridge(action, extra) {
    var cfg = getConfig();
    if (!cfg.webAppUrl) {
      var e = new Error('Bridge belum dikonfigurasi (webAppUrl kosong - Web App belum di-deploy/di-hubungkan)');
      e.code = 'NOT_CONFIGURED';
      return Promise.reject(e);
    }
    var body = Object.assign({ action: action }, extra || {});
    return global.fetch(cfg.webAppUrl, {
      method: 'POST',
      // text/plain sengaja dipakai (bukan application/json) supaya browser
      // TIDAK mengirim preflight OPTIONS - Apps Script Web App doPost tidak
      // pernah menangani OPTIONS, jadi preflight akan selalu gagal kalau
      // pakai application/json. Code.gs tetap JSON.parse(e.postData.contents)
      // seperti biasa - Content-Type ini hanya soal header HTTP, bukan isi.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).catch(function (networkErr) {
      var e2 = new Error('Network error: ' + networkErr.message);
      e2.code = 'NETWORK_ERROR';
      throw e2;
    }).then(function (res) {
      if (!res.ok) { var e3 = new Error('HTTP ' + res.status); e3.code = 'HTTP_ERROR'; throw e3; }
      return res.json();
    });
  }

  // ============================================================
  // [B] PAIRING
  // ============================================================
  function requestPairing(label) {
    var d = getDevice();
    if (label) d = setDeviceLabel(label);
    return sha256Hex(d.deviceSecret).then(function (tokenHash) {
      return callBridge('requestPairing', { deviceId: d.deviceId, deviceLabel: d.label || '(tanpa label)', tokenHash: tokenHash });
    }).then(function (result) {
      if (result.ok && result.data && result.data.status) setDeviceStatus(result.data.status);
      return result;
    });
  }
  function checkPairingStatus() {
    var d = getDevice();
    return callBridge('checkPairingStatus', { deviceId: d.deviceId }).then(function (result) {
      if (result.ok && result.data && result.data.status) setDeviceStatus(result.data.status);
      return result;
    });
  }

  // ============================================================
  // [C] SYNC QUEUE - persistent (localStorage), FIFO PER transaksiId,
  // retry exponential backoff, clientRequestId SAMA dipakai ulang di
  // setiap percobaan retry (idempotency di TransactionEngine.gs
  // bergantung pada ini).
  // ============================================================
  function loadQueue() { return lsGet(QUEUE_KEY, []); }
  function saveQueue(q) { lsSet(QUEUE_KEY, q); }

  /* Dipanggil HTML SETELAH localStorage-write (postTransaksi/createAlokasi)
     SUKSES - localStorage sudah jadi sumber kebenaran duluan, enqueue()
     hanya menambah pengiriman ke cloud di belakang layar. TIDAK PERNAH
     memblokir/menunda penyimpanan lokal. */
  function enqueue(action, transaksiId, payload, clientRequestId) {
    var q = loadQueue();
    var entry = {
      opId: uid('op'),
      transaksiId: transaksiId || null,
      action: action,
      clientRequestId: clientRequestId || uid('cr'),
      payload: payload,
      status: 'PENDING',
      attempt: 0,
      nextAttemptAt: Date.now(),
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date().toISOString()
    };
    q.push(entry);
    saveQueue(q);
    return entry.opId;
  }

  function classifyError(code) { return RETRYABLE_CODES[code] ? 'RETRYABLE' : 'PERMANENT'; }

  function backoffMs(attempt) {
    var delay = BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
    delay = Math.min(delay, MAX_DELAY_MS);
    var jitter = delay * 0.2 * Math.random();
    return Math.round(delay + jitter);
  }

  /* FIFO PER transaksiId (bukan FIFO global): entri untuk transaksiId X
     TIDAK PERNAH dikirim selama entri LEBIH LAMA untuk transaksiId X yang
     sama masih PENDING/SENDING - mencegah mis. UPDATE menyalip CREATE untuk
     transaksi yang sama. Antar transaksiId BERBEDA bebas jalan sendiri-
     sendiri tanpa saling menunggu. Urutan array = urutan enqueue (FIFO). */
  function nextSendable(queue) {
    var blocked = {};
    for (var i = 0; i < queue.length; i++) {
      var e = queue[i];
      if (e.status === 'PENDING' && e.transaksiId && blocked[e.transaksiId]) continue;
      if (e.status === 'PENDING' && e.nextAttemptAt <= Date.now()) return e;
      if (e.transaksiId && (e.status === 'PENDING' || e.status === 'SENDING')) blocked[e.transaksiId] = true;
    }
    return null;
  }

  var processing = false;
  function processQueueOnce() {
    if (processing) return Promise.resolve({ skipped: 'ALREADY_PROCESSING' });
    var device = getDevice();
    if (device.status !== 'APPROVED') return Promise.resolve({ skipped: 'DEVICE_NOT_APPROVED' });
    var queue = loadQueue();
    var entry = nextSendable(queue);
    if (!entry) return Promise.resolve({ skipped: 'QUEUE_EMPTY_OR_ALL_BLOCKED' });
    processing = true;
    entry.status = 'SENDING';
    saveQueue(queue);
    return callBridge(entry.action, {
      deviceId: device.deviceId, deviceSecret: device.deviceSecret,
      clientRequestId: entry.clientRequestId, payload: entry.payload
    }).then(function (result) {
      var q2 = loadQueue();
      var idx = q2.findIndex(function (x) { return x.opId === entry.opId; });
      if (idx < 0) { processing = false; return { entry: entry, result: result }; }
      if (result.ok) {
        q2[idx].status = 'CONFIRMED';
        q2[idx].confirmedAt = new Date().toISOString();
        q2[idx].serverRefId = (result.data && result.data.id) || null;
      } else {
        q2[idx].attempt++;
        q2[idx].lastErrorCode = result.code;
        q2[idx].lastErrorMessage = result.message;
        if (classifyError(result.code) === 'PERMANENT' || q2[idx].attempt >= MAX_ATTEMPTS) {
          q2[idx].status = 'FAILED_PERMANENT';
        } else {
          q2[idx].status = 'PENDING';
          q2[idx].nextAttemptAt = Date.now() + backoffMs(q2[idx].attempt);
        }
      }
      saveQueue(q2);
      processing = false;
      return { entry: q2[idx] || entry, result: result };
    }).catch(function (networkErr) {
      var q3 = loadQueue();
      var idx3 = q3.findIndex(function (x) { return x.opId === entry.opId; });
      if (idx3 >= 0) {
        q3[idx3].attempt++;
        q3[idx3].lastErrorCode = networkErr.code || 'NETWORK_ERROR';
        q3[idx3].lastErrorMessage = networkErr.message;
        if (q3[idx3].attempt >= MAX_ATTEMPTS) {
          q3[idx3].status = 'FAILED_PERMANENT';
        } else {
          q3[idx3].status = 'PENDING';
          q3[idx3].nextAttemptAt = Date.now() + backoffMs(q3[idx3].attempt);
        }
        saveQueue(q3);
      }
      processing = false;
      return { entry: q3[idx3], error: networkErr };
    });
  }

  var loopHandle = null;
  function startQueueLoop(intervalMs) {
    if (loopHandle) return;
    loopHandle = global.setInterval(function () { processQueueOnce(); }, intervalMs || 15000);
  }
  function stopQueueLoop() { if (loopHandle) { global.clearInterval(loopHandle); loopHandle = null; } }

  function queueSummary() {
    var q = loadQueue();
    var out = { PENDING: 0, SENDING: 0, CONFIRMED: 0, FAILED_PERMANENT: 0 };
    q.forEach(function (e) { out[e.status] = (out[e.status] || 0) + 1; });
    return out;
  }

  // ============================================================
  // [D] RECONCILIATION - dipicu MANUAL, TIDAK PERNAH otomatis/background,
  // TIDAK PERNAH auto-correct. Selisih HANYA dicatat ke Sync Decision
  // Queue untuk ditinjau manusia.
  // ============================================================
  function loadDecisionQueue() { return lsGet(DECISION_QUEUE_KEY, []); }
  function saveDecisionQueue(a) { lsSet(DECISION_QUEUE_KEY, a); }

  function localTotalsForPeriode(tanggalFrom, tanggalTo) {
    var trx = lsGet(LS_PREFIX + 'transaksi', []);
    var out = { jumlahPenerimaan: 0, totalPenerimaan: 0, jumlahPengeluaran: 0, totalPengeluaran: 0 };
    trx.forEach(function (t) {
      if (!t.tanggal || t.tanggal < tanggalFrom || t.tanggal > tanggalTo) return;
      if (t.jenis === 'PENERIMAAN') { out.jumlahPenerimaan++; out.totalPenerimaan += Number(t.nominal || 0); }
      else if (t.jenis === 'PENGELUARAN') { out.jumlahPengeluaran++; out.totalPengeluaran += Number(t.nominal || 0); }
    });
    return out;
  }

  function reconcilePeriode(tanggalFrom, tanggalTo) {
    var device = getDevice();
    if (device.status !== 'APPROVED') {
      var e = new Error('Device belum di-approve admin'); e.code = 'DEVICE_NOT_APPROVED';
      return Promise.reject(e);
    }
    var local = localTotalsForPeriode(tanggalFrom, tanggalTo);
    var auth = { deviceId: device.deviceId, deviceSecret: device.deviceSecret };
    return Promise.all([
      callBridge('getTransactions', Object.assign({ payload: { jenis: 'PENERIMAAN', tanggalFrom: tanggalFrom, tanggalTo: tanggalTo } }, auth)),
      callBridge('getTransactions', Object.assign({ payload: { jenis: 'PENGELUARAN', tanggalFrom: tanggalFrom, tanggalTo: tanggalTo } }, auth))
    ]).then(function (results) {
      var resP = results[0], resG = results[1];
      var server = { jumlahPenerimaan: 0, totalPenerimaan: 0, jumlahPengeluaran: 0, totalPengeluaran: 0 };
      if (resP.ok) { server.jumlahPenerimaan = resP.data.length; server.totalPenerimaan = resP.data.reduce(function (s, t) { return s + Number(t.nominal || 0); }, 0); }
      if (resG.ok) { server.jumlahPengeluaran = resG.data.length; server.totalPengeluaran = resG.data.reduce(function (s, t) { return s + Number(t.nominal || 0); }, 0); }
      var diffs = [];
      ['jumlahPenerimaan', 'totalPenerimaan', 'jumlahPengeluaran', 'totalPengeluaran'].forEach(function (k) {
        if (local[k] !== server[k]) diffs.push({ metric: k, local: local[k], server: server[k], delta: local[k] - server[k] });
      });
      var result = {
        id: uid('recon'), tanggalFrom: tanggalFrom, tanggalTo: tanggalTo,
        local: local, server: server, diffs: diffs,
        status: diffs.length ? 'DIVERGENT' : 'MATCH', checkedAt: new Date().toISOString()
      };
      if (diffs.length) { var dq = loadDecisionQueue(); dq.push(result); saveDecisionQueue(dq); }
      return result;
    });
  }

  global.BridgeClient = {
    getDevice: getDevice, setDeviceLabel: setDeviceLabel,
    getConfig: getConfig, setWebAppUrl: setWebAppUrl,
    requestPairing: requestPairing, checkPairingStatus: checkPairingStatus,
    enqueue: enqueue, processQueueOnce: processQueueOnce,
    startQueueLoop: startQueueLoop, stopQueueLoop: stopQueueLoop,
    queueSummary: queueSummary, loadQueue: loadQueue,
    reconcilePeriode: reconcilePeriode, loadDecisionQueue: loadDecisionQueue
  };
})(typeof window !== 'undefined' ? window : globalThis);
