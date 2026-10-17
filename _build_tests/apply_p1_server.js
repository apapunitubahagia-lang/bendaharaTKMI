// Langkah build P1 (server). Dijalankan SETELAH apply_p0_server.js. Mengubah TransactionEngine.gs (berkas generate)
// dengan penggantian yang dipastikan unik (gagal keras bila jangkar tidak ditemukan tepat 1x).
// Urutan build lengkap: apply_central -> apply_tarif -> apply_p0_client -> apply_p1_client -> build_server_engines
//                       -> apply_p0_server -> apply_p1_server -> build_bridge
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const te = L.load(OUT + 'TransactionEngine.gs');

L.rep(te, " * status alokasi dihitung server, aktor di audit, fungsi engine/tes dijadikan privat (akhiran _).\n */",
  " * status alokasi dihitung server, aktor di audit, fungsi engine/tes dijadikan privat (akhiran _).\n *\n" +
  " * [P1 - 2026-10-17] Patch build apply_p1_server.js: audit engine satu kali append di langkah TERAKHIR (setelah\n" +
  " * catatan idempotensi) bersama jejak aktor/role (tanpa audit parsial), idempotensi + deteksi konflik pada\n" +
  " * updateTransaction_, penguncian periode (PeriodLock.gs) di dalam lock, status SELESAI wajib bukti berfile.\n */", 'header', log);

// ---------- P1-B: idempotensi update + audit batch ----------
L.rep(te, "var RESULT_TYPE_SHEET = { transaction: SHT_TRANSAKSI, allocation: SHT_ALOKASI, bankMutation: SHT_MUTASI };",
  "var RESULT_TYPE_SHEET = { transaction: SHT_TRANSAKSI, allocation: SHT_ALOKASI, bankMutation: SHT_MUTASI, transactionUpdate: SHT_TRANSAKSI }; // [P1-B] transactionUpdate", 'RESULT_TYPE_SHEET', log);

L.rep(te, "// ============================================================\n// VALIDASI (field-level + referential integrity)",
`/* [P1-B] Audit engine dalam SATU append (sgAppendMany_): seluruh baris audit wajib satu operasi + baris jejak
   aktor/role (API_*, bila dipanggil lewat opEngineWrite_) ditulis sekaligus atau tidak sama sekali. Dipanggil
   sebagai langkah TERAKHIR sebelum sukses, sehingga tidak ada audit yang menyatakan perubahan yang di-rollback.
   entries = [[aksi, before, after, sumber, refId], ...]. [TEST MODE] tetap ke Logger/collector, tidak ke sheet. */
function engineAuditBatch_(opts, entries, apiRefId) {
  if (opts && opts.testMode) { entries.forEach(function (e) { auditPushTest_(opts.auditCollector, e[0], e[1], e[2], e[3], e[4]); }); return; }
  var ts = new Date().toISOString();
  var actor = (typeof ENGINE_ACTOR_ !== 'undefined' && ENGINE_ACTOR_) ? 'google:' + ENGINE_ACTOR_ : null;
  var rows = entries.map(function (e) {
    return { id: ID_PREFIX_AUDIT + Utilities.getUuid(), timestamp: ts, aksi: e[0], before: e[1] ? JSON.stringify(e[1]) : '', after: e[2] ? JSON.stringify(e[2]) : '', sumber: actor || e[3] || 'write-door', refId: e[4] || '' };
  });
  var api = (typeof ENGINE_API_ !== 'undefined' && ENGINE_API_ && !ENGINE_API_.written) ? ENGINE_API_ : null;
  if (api) rows.push({ id: ID_PREFIX_AUDIT + Utilities.getUuid(), timestamp: ts, aksi: 'API_' + api.action, before: '', after: JSON.stringify({ actorEmail: api.email, actorRole: api.role, refId: apiRefId || '' }), sumber: 'google:' + api.email, refId: apiRefId || '' });
  sgAppendMany_(SHT_AUDIT, AUDIT_HEADERS, rows);
  if (api) api.written = true;
}

// ============================================================
// VALIDASI (field-level + referential integrity)`, 'engineAuditBatch_', log);

// ---------- createTransactionWithAllocations_ ----------
L.rep(te, "      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');\n",
  "      if (payload.siswaId && !siswaExists_(payload.siswaId)) return errResult_('INVALID_STUDENT', 'siswaId tidak valid (re-check)', 'siswaId');\n" +
  "      var plC = plGuard_([payload.tanggal], 'transaksi'); if (plC) return plC; // [P1-A] periode tertutup, diperiksa di dalam lock\n", 'create: period lock', log);
{
  const s = te.t, a = s.indexOf('      // --- 6. audit (CREATE_TRANSACTION + CREATE_ALLOCATION per baris) ---'), b = s.indexOf('      // --- 8. success ---');
  if (a < 0 || b < 0 || b < a || s.indexOf('      // --- 6. audit (CREATE_TRANSACTION', a + 1) !== -1) throw new Error('ASSERT create steps 6-7');
  te.t = s.slice(0, a) + `      // --- 6. [P1-B] idempotency record LEBIH DULU (belum ada audit yang ditulis bila langkah ini gagal) ---
      try {
        recordIdempotentResult_(payload.clientRequestId, trxId, 'transaction');
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: idempotency record gagal, rollback transaksi+allocation: ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, transaksi+allocation sudah di-rollback (belum ada audit yang tertulis): ' + e.message, null, trxId);
      }

      // --- 7. [P1-B] audit TERAKHIR, satu append: CREATE_TRANSACTION + CREATE_ALLOCATION + jejak aktor/role ---
      try {
        var auditRows = [['CREATE_TRANSACTION', null, trxRecord, payload.sumber || 'write-door', trxId]];
        allocations.forEach(function (a, i) {
          auditRows.push(['CREATE_ALLOCATION', null, { transaksiId: trxId, siswaId: a.siswaId, komponenId: a.komponenId, nominal: a.nominal }, payload.sumber || 'write-door', writtenAllocIds[i]]);
        });
        engineAuditBatch_(opts, auditRows, trxId);
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: audit gagal, rollback transaksi+allocation+idempotency (tidak ada audit parsial): ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e), 'Gagal menulis audit, transaksi+allocation+idempotency sudah di-rollback (tidak ada audit parsial): ' + e.message, null, trxId);
      }

` + s.slice(b);
  log.push('create: steps 6-7 (idempotency -> audit batch)');
}

// ---------- createAllocation_ ----------
L.rep(te, "      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');\n",
  "      if (trx && trx.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan; alokasi baru tidak diterima: ' + payload.transaksiId, 'transaksiId');\n" +
  "      var plA = plGuard_([trx && trx.tanggal], 'alokasi'); if (plA) return plA; // [P1-A] transaksi induk pada periode tertutup\n", 'alloc: period lock', log);
L.rep(te, `      try {
        auditPush_('CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId);
      } catch (e) {
        Logger.log('createAllocation_: audit gagal setelah write sukses, rollback allocation: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        return errResult_(engineErrCode_(e), 'Gagal menulis audit, allocation sudah di-rollback: ' + e.message, null, alokId);
      }
      try {
        recordIdempotentResult_(payload.clientRequestId, alokId, 'allocation');
      } catch (e) {
        Logger.log('createAllocation_: idempotency gagal setelah audit sukses, rollback allocation (audit TETAP ada): ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, allocation sudah di-rollback (audit tetap ada): ' + e.message, null, alokId);
      }`, `      // [P1-B] idempotency LEBIH DULU, audit TERAKHIR (satu append bersama jejak aktor/role)
      try {
        recordIdempotentResult_(payload.clientRequestId, alokId, 'allocation');
      } catch (e) {
        Logger.log('createAllocation_: idempotency gagal, rollback allocation: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, allocation sudah di-rollback (belum ada audit yang tertulis): ' + e.message, null, alokId);
      }
      try {
        engineAuditBatch_({}, [['CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId]], alokId);
      } catch (e) {
        Logger.log('createAllocation_: audit gagal, rollback allocation+idempotency: ' + e.message);
        deleteRowById_(SHT_ALOKASI, alokId);
        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e), 'Gagal menulis audit, allocation+idempotency sudah di-rollback (tidak ada audit parsial): ' + e.message, null, alokId);
      }`, 'alloc: idempotency -> audit batch', log);

// ---------- createBankMutation_ ----------
L.rep(te, "      var mutId = ID_PREFIX_MUT + Utilities.getUuid();\n",
  "      var plM = plGuard_([payload.tanggal], 'mutasi bank'); if (plM) return plM; // [P1-A]\n      var mutId = ID_PREFIX_MUT + Utilities.getUuid();\n", 'mutasi: period lock', log);
L.rep(te, `      try {
        auditPush_('CREATE_BANK_MUTATION', null, mutRecord, payload.sumber || 'write-door', mutId);
      } catch (e2) {
        Logger.log('createBankMutation_: audit gagal setelah write sukses, rollback mutasi: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis audit, mutasi sudah di-rollback: ' + e2.message, null, mutId);
      }
      try {
        recordIdempotentResult_(payload.clientRequestId, mutId, 'bankMutation');
      } catch (e2) {
        Logger.log('createBankMutation_: idempotency gagal setelah audit sukses, rollback mutasi (audit TETAP ada): ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis idempotency record, mutasi sudah di-rollback (audit tetap ada): ' + e2.message, null, mutId);
      }`, `      // [P1-B] idempotency LEBIH DULU, audit TERAKHIR
      try {
        recordIdempotentResult_(payload.clientRequestId, mutId, 'bankMutation');
      } catch (e2) {
        Logger.log('createBankMutation_: idempotency gagal, rollback mutasi: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis idempotency record, mutasi sudah di-rollback (belum ada audit yang tertulis): ' + e2.message, null, mutId);
      }
      try {
        engineAuditBatch_({}, [['CREATE_BANK_MUTATION', null, mutRecord, payload.sumber || 'write-door', mutId]], mutId);
      } catch (e2) {
        Logger.log('createBankMutation_: audit gagal, rollback mutasi+idempotency: ' + e2.message);
        deleteRowById_(SHT_MUTASI, mutId);
        if (payload.clientRequestId) deleteIdempotencyByClientRequestId_(payload.clientRequestId);
        return errResult_(engineErrCode_(e2), 'Gagal menulis audit, mutasi+idempotency sudah di-rollback (tidak ada audit parsial): ' + e2.message, null, mutId);
      }`, 'mutasi: idempotency -> audit batch', log);

// ---------- updateTransaction_ (P1-A/B/E/F) ----------
L.replFn(te, 'updateTransaction_', `
function updateTransaction_(payload) {
  /* [P0-B] Patch PARSIAL: hanya field yang benar-benar berubah yang divalidasi dan ditulis; kolom lain
     (termasuk kolom tambahan/arsip) dipertahankan apa adanya. Field di luar kontrak / immutable ditolak.
     Nominal tidak boleh < total alokasi aktif. Status keluarga alokasi dihitung server. Patch tanpa
     perubahan = no-op (tanpa tulis, tanpa audit) sehingga retry aman. Audit gagal -> nilai dipulihkan.
     [P1-B] clientRequestId (opsional) = idempotensi: replay TIDAK diterapkan ulang (tidak menimpa perubahan yang lebih baru).
     [P1-F] _expect (opsional) = {field: nilai yang dilihat klien sebelum mengubah}; nilai server berbeda -> CONFLICT.
     [P1-A] tanggal lama atau baru pada periode tertutup -> PERIOD_LOCKED (diperiksa di dalam lock).
     [P1-E] transisi ke SELESAI wajib minimal satu bukti berfile (EVIDENCE_REQUIRED).
     Urutan tulis: baris -> idempotensi -> audit (satu append, terakhir); kegagalan memulihkan langkah sebelumnya. */
  try {
    if (!payload || !payload.id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
    var crid = payload.clientRequestId ? String(payload.clientRequestId) : '';
    var expect = payload._expect;
    if (expect !== undefined && expect !== null && (typeof expect !== 'object' || Array.isArray(expect))) return errResult_('VALIDATION_ERROR', '_expect harus berupa objek {field: nilai}', '_expect', payload.id);
    var keys = Object.keys(payload).filter(function (k) { return k !== 'id' && k !== 'clientRequestId' && k !== '_expect'; });
    var bad = keys.filter(function (k) { return TRX_HEADERS.indexOf(k) === -1 || TRX_IMMUTABLE_.indexOf(k) !== -1; });
    if (bad.length) return errResult_('UNKNOWN_FIELD', 'Field tidak dikenal atau tidak boleh diubah: ' + bad.join(', '), bad[0], payload.id);
    var replayOf = function (idem) {
      if (idem.record.resultRefId !== payload.id) return errResult_('IDEMPOTENCY_MISMATCH', 'clientRequestId sudah dipakai untuk transaksi lain (' + idem.record.resultRefId + ')', 'clientRequestId', payload.id);
      var t = getTransactionRaw_(payload.id);
      return okResult_('Request sudah pernah diproses (idempotent replay) - perubahan tidak diterapkan ulang', t || { id: payload.id });
    };
    if (crid) { var idem1 = checkIdempotency_(crid); if (idem1.status !== 'none') return replayOf(idem1); }
    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);

    return withLock_(function () {
      if (crid) { var idem2 = checkIdempotency_(crid); if (idem2.status !== 'none') return replayOf(idem2); }
      var m = sgModel_(SHT_TRANSAKSI, TRX_HEADERS);
      var pos = -1;
      for (var i = 0; i < m.values.length; i++) { if (m.values[i][m.idx.id] === payload.id) { pos = i; break; } }
      if (pos === -1) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan (re-check): ' + payload.id, 'id', payload.id);
      var raw = m.values[pos];
      var arch = sgGet_(m, raw, 'archivedAt');
      if (arch !== undefined && arch !== '' && arch !== null) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (re-check) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);
      var cur = sgObj_(m, raw, TRX_HEADERS);
      cur.tanggal = sgDateStr_(cur.tanggal); cur.createdAt = sgIsoStr_(cur.createdAt);
      var norm = function (k, v) {
        if (k === 'nominal') return (v === '' || v === null || v === undefined) ? '' : Number(v);
        return (v === null || v === undefined) ? '' : String(v).trim();
      };
      if (expect) { // [P1-F] deteksi konflik: nilai server berubah sejak klien membacanya (dan bukan nilai tujuan yang sama)
        var conflict = Object.keys(expect).filter(function (k) {
          if (TRX_HEADERS.indexOf(k) === -1) return false;
          if (norm(k, expect[k]) === norm(k, cur[k])) return false;
          return !(Object.prototype.hasOwnProperty.call(payload, k) && norm(k, payload[k]) === norm(k, cur[k]));
        });
        if (conflict.length) {
          var ce = errResult_('CONFLICT', 'Transaksi diubah pengguna lain sejak dimuat (' + conflict.join(', ') + '); perubahan TIDAK diterapkan - muat ulang lalu ulangi', conflict[0], payload.id);
          ce.current = {}; conflict.forEach(function (k) { ce.current[k] = cur[k]; });
          return ce;
        }
      }
      var next = Object.assign({}, cur);
      keys.forEach(function (k) {
        if (norm(k, payload[k]) === norm(k, cur[k])) return;
        next[k] = k === 'nominal' ? Number(payload[k]) : (typeof payload[k] === 'string' ? payload[k].trim() : (payload[k] === null || payload[k] === undefined ? '' : payload[k]));
      });
      var changed = function () { return TRX_HEADERS.filter(function (k) { return norm(k, next[k]) !== norm(k, cur[k]); }); };
      var ch = changed(), e1 = null, field = null, code = 'VALIDATION_ERROR';
      var allocSum = sumAllocationsForTransaksi_(payload.id);
      ch.forEach(function (k) {
        if (e1) return;
        if (k === 'jenis') { e1 = validateJenis_(next.jenis); if (!e1 && allocSum > 0) e1 = 'jenis tidak dapat diubah: transaksi memiliki alokasi aktif'; }
        else if (k === 'tanggal') e1 = validateTanggal_(next.tanggal);
        else if (k === 'unit') e1 = validateUnit_(next.unit);
        else if (k === 'nominal') { e1 = validateNominal_(next.nominal); if (!e1 && Number(next.nominal) + 0.5 < allocSum) { e1 = 'nominal (' + next.nominal + ') lebih kecil dari total alokasi aktif (' + allocSum + ')'; code = 'ALLOCATION_EXCEEDS_TRANSACTION'; } }
        else if (k === 'metode') { if (!next.metode || typeof next.metode !== 'string') e1 = 'metode wajib diisi'; }
        else if (k === 'status') e1 = validateStatus_(next.status);
        else if (k === 'akunId') { if (next.akunId && !akunExists_(next.akunId)) { e1 = 'akunId tidak ditemukan di ' + SHT_AKUN + ': ' + next.akunId; code = 'INVALID_ACCOUNT'; } }
        else if (k === 'siswaId') { if (next.siswaId && !siswaExists_(next.siswaId)) { e1 = 'siswaId tidak ditemukan di ' + SHT_SISWA + ': ' + next.siswaId; code = 'INVALID_STUDENT'; } }
        else if (k === '_komponenHint') { if (next._komponenHint && !komponenExists_(next._komponenHint)) { e1 = 'komponen tidak ditemukan di ' + SHT_KOMPONEN + ': ' + next._komponenHint; code = 'INVALID_COMPONENT'; } }
        if (e1) field = k;
      });
      if (e1) return errResult_(code, e1, field, payload.id);
      if (next.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(next.status)) !== -1 && ch.some(function (k) { return ['status', 'nominal', 'siswaId', 'jenis'].indexOf(k) !== -1; })) {
        var st = engineAllocStatusFor_(next);
        if (st) next.status = st;
      }
      ch = changed();
      if (!ch.length) {
        if (crid) recordIdempotentResult_(crid, payload.id, 'transactionUpdate'); // [P1-B] replay berikutnya = no-op juga
        var same = okResult_('Tidak ada perubahan (data server sudah sama)', cur);
        same.data.unchanged = true;
        if (payload.status && payload.status !== cur.status) same.data.statusDihitungServer = true;
        return same;
      }
      var plU = plGuard_([cur.tanggal, next.tanggal], 'transaksi'); if (plU) return plU; // [P1-A]
      if (next.status === 'SELESAI' && cur.status !== 'SELESAI' && !rgTrxHasEvidence_(payload.id)) { // [P1-E]
        return errResult_('EVIDENCE_REQUIRED', 'Status SELESAI memerlukan minimal satu bukti berfile yang tertaut ke transaksi ini - lampirkan bukti lebih dulu', 'status', payload.id);
      }
      var newRaw = raw.slice();
      ch.forEach(function (k) { newRaw[m.idx[k]] = next[k]; });
      var rowNum = pos + 2;
      var restore = function () { m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([raw]); };
      try {
        m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([newRaw]);
      } catch (e) {
        Logger.log('updateTransaction_: write gagal: ' + e.message);
        return errResult_(engineErrCode_(e), 'Gagal update transaksi: ' + e.message, null, payload.id);
      }
      if (crid) {
        try { recordIdempotentResult_(crid, payload.id, 'transactionUpdate'); } catch (e) {
          try { restore(); } catch (restoreErr) { return errResult_('ROLLBACK_FAILED', 'Idempotency gagal DAN restore nilai before juga gagal: ' + restoreErr.message, null, payload.id); }
          return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, nilai transaksi sudah di-restore: ' + e.message, null, payload.id);
        }
      }
      try {
        engineAuditBatch_({}, [['UPDATE_TRANSACTION', cur, next, 'write-door', payload.id]], payload.id);
      } catch (e) {
        Logger.log('updateTransaction_: audit gagal setelah update sukses, RESTORE nilai before: ' + e.message);
        try { restore(); if (crid) deleteIdempotencyByClientRequestId_(crid); } catch (restoreErr) {
          return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN restore nilai before juga gagal: ' + restoreErr.message, null, payload.id);
        }
        return errResult_('WRITE_FAILED', 'Gagal menulis audit, nilai transaksi sudah di-restore ke sebelum update: ' + e.message, null, payload.id);
      }
      var out = okResult_('Transaksi berhasil diupdate', next);
      out.data.changedFields = ch;
      if (payload.status && next.status !== payload.status) out.data.statusDihitungServer = true;
      return out;
    });
  } catch (e) {
    Logger.log('updateTransaction_: error tak terduga: ' + e.message);
    return errResult_(engineErrCode_(e), 'updateTransaction_ error tak terduga: ' + e.message, null);
  }
}`, log);

L.save(te);
fs.writeFileSync(require('path').join(OUT, '_p1_server_patch_log.txt'), log.join('\n') + '\n');
console.log('apply_p1_server OK: ' + log.length + ' perubahan');
