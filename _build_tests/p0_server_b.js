// P0-B (server): konsistensi transaksi/alokasi pada TransactionEngine.gs hasil generate.
module.exports = function applyP0B(te, L, log) {
  L.rep(te, "function sumAllocationsForTransaksi_(transaksiId) {", `/* [P0-B] Status alokasi transaksi PENERIMAAN DIHITUNG SERVER dengan aturan yang SAMA dengan klien
   (computeTransaksiAllocationStatus di Bendahara_V2.html): TERCATAT / TERIDENTIFIKASI / TERALOKASI /
   SEBAGIAN_TERALOKASI (siswa masih punya kewajiban) / OVERPAYMENT_CREDIT (sisa = kelebihan bayar nyata).
   Status di luar keluarga ini (SELESAI, REKONSILIASI) tidak disentuh. */
var TRX_ALLOC_STATUS_ = ['TERCATAT', 'TERIDENTIFIKASI', 'SEBAGIAN_TERALOKASI', 'TERALOKASI', 'OVERPAYMENT_CREDIT'];
var TRX_IMMUTABLE_ = ['id', 'createdAt', '_sourceFile', '_sourceSheet', '_sourceRow'];
function engineAllocStatusFor_(trx) {
  if (!trx || trx.jenis !== 'PENERIMAAN') return null;
  var alok = activeAllocationRows_().filter(function (a) { return a.transaksiId === trx.id; });
  var sudah = alok.reduce(function (s, a) { return s + Number(a.nominal || 0); }, 0);
  var sisa = Number(trx.nominal || 0) - sudah;
  if (!trx.siswaId && !alok.length) return 'TERCATAT';
  if (sudah <= 0.5) return 'TERIDENTIFIKASI';
  if (sisa <= 0.5) return 'TERALOKASI';
  var ids = [];
  alok.map(function (a) { return a.siswaId; }).concat(trx.siswaId ? [trx.siswaId] : []).forEach(function (sid) { if (sid && ids.indexOf(sid) === -1) ids.push(sid); });
  if (typeof oblLoadContext_ !== 'function') throw new Error('ObligationEngine tidak tersedia untuk menghitung status alokasi');
  var prev = OBL_CTX_, masih;
  try {
    OBL_CTX_ = oblLoadContext_();
    masih = ids.some(function (sid) { return kewajibanForSiswa(sid).some(function (o) { return sisaObligation(o) > 0; }); });
  } finally { OBL_CTX_ = prev; }
  return masih ? 'SEBAGIAN_TERALOKASI' : 'OVERPAYMENT_CREDIT';
}
function setTrxStatusCell_(trxId, status) {
  var hm = sgHeaderModel_(SHT_TRANSAKSI, ['id', 'status']);
  var rowIdx = findRowIndexById_(SHT_TRANSAKSI, trxId);
  if (rowIdx < 2) throw new Error('Transaksi tidak ditemukan untuk pembaruan status: ' + trxId);
  hm.sh.getRange(rowIdx, hm.idx.status + 1, 1, 1).setValues([[status]]);
}
function sumAllocationsForTransaksi_(transaksiId) {`, 'engineAllocStatusFor_/setTrxStatusCell_', log);

  L.rep(te, "      // --- 6. audit (CREATE_TRANSACTION + CREATE_ALLOCATION per baris) ---", `      // --- 5c. [P0-B] status alokasi dihitung server (status kiriman klien tidak dipercaya) ---
      try {
        if (trxRecord.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(trxRecord.status)) !== -1) {
          var stHitung = engineAllocStatusFor_(trxRecord);
          if (stHitung && stHitung !== trxRecord.status) { setTrxStatusCell_(trxId, stHitung); trxRecord.status = stHitung; }
        }
      } catch (e) {
        Logger.log('createTransactionWithAllocations_: hitung status gagal, rollback: ' + e.message);
        writtenAllocIds.forEach(function (id) { deleteRowById_(SHT_ALOKASI, id); });
        deleteRowById_(SHT_TRANSAKSI, trxId);
        return errResult_(engineErrCode_(e), 'Gagal menghitung status alokasi, transaksi sudah di-rollback: ' + e.message, null);
      }

      // --- 6. audit (CREATE_TRANSACTION + CREATE_ALLOCATION per baris) ---`, 'status dihitung saat create', log);

  L.rep(te, "      try {\n        auditPush_('CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId);", `      // [P0-B] status alokasi transaksi induk dihitung server
      var statusSebelum = trx.status, statusBaru = null;
      try {
        if (trx.jenis === 'PENERIMAAN' && TRX_ALLOC_STATUS_.indexOf(String(trx.status || 'TERCATAT')) !== -1) {
          statusBaru = engineAllocStatusFor_(trx);
          if (statusBaru && statusBaru !== trx.status) setTrxStatusCell_(trx.id, statusBaru); else statusBaru = null;
        }
      } catch (e) {
        deleteRowById_(SHT_ALOKASI, alokId);
        return errResult_(engineErrCode_(e), 'Gagal menghitung status alokasi, allocation sudah di-rollback: ' + e.message, null, alokId);
      }
      if (statusBaru) alokRecord.statusTransaksi = statusBaru;
      try {
        auditPush_('CREATE_ALLOCATION', null, alokRecord, payload.sumber || 'write-door', alokId);`, 'status dihitung saat createAllocation', log);
  L.rep(te, "        deleteRowById_(SHT_ALOKASI, alokId);\n        return errResult_(engineErrCode_(e), 'Gagal menulis audit, allocation sudah di-rollback",
    "        deleteRowById_(SHT_ALOKASI, alokId);\n        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);\n        return errResult_(engineErrCode_(e), 'Gagal menulis audit, allocation sudah di-rollback", 'rollback status (audit)', log);
  L.rep(te, "        deleteRowById_(SHT_ALOKASI, alokId);\n        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, allocation",
    "        deleteRowById_(SHT_ALOKASI, alokId);\n        if (statusBaru) setTrxStatusCell_(trx.id, statusSebelum);\n        return errResult_(engineErrCode_(e), 'Gagal menulis idempotency record, allocation", 'rollback status (idempotensi)', log);

  L.replFn(te, 'updateTransaction', `
function updateTransaction(payload) {
  /* [P0-B] Patch PARSIAL: hanya field yang benar-benar berubah yang divalidasi dan ditulis; kolom lain
     (termasuk kolom tambahan/arsip) dipertahankan apa adanya. Field di luar kontrak / immutable ditolak.
     Nominal tidak boleh < total alokasi aktif. Status keluarga alokasi dihitung server. Patch tanpa
     perubahan = no-op (tanpa tulis, tanpa audit) sehingga retry aman. Audit gagal -> nilai dipulihkan. */
  try {
    if (!payload || !payload.id) return errResult_('VALIDATION_ERROR', 'id wajib diisi', 'id');
    var keys = Object.keys(payload).filter(function (k) { return k !== 'id' && k !== 'clientRequestId'; });
    var bad = keys.filter(function (k) { return TRX_HEADERS.indexOf(k) === -1 || TRX_IMMUTABLE_.indexOf(k) !== -1; });
    if (bad.length) return errResult_('UNKNOWN_FIELD', 'Field tidak dikenal atau tidak boleh diubah: ' + bad.join(', '), bad[0], payload.id);
    var before = getTransactionRaw_(payload.id);
    if (!before) return errResult_('NOT_FOUND', 'Transaksi tidak ditemukan: ' + payload.id, 'id', payload.id);
    if (before.archivedAt) return errResult_('TRANSACTION_ARCHIVED', 'Transaksi sudah diarsipkan (reversal) dan tidak dapat diubah: ' + payload.id, 'id', payload.id);

    return withLock_(function () {
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
        var same = okResult_('Tidak ada perubahan (data server sudah sama)', cur);
        same.data.unchanged = true;
        if (payload.status && payload.status !== cur.status) same.data.statusDihitungServer = true;
        return same;
      }
      var newRaw = raw.slice();
      ch.forEach(function (k) { newRaw[m.idx[k]] = next[k]; });
      var rowNum = pos + 2;
      try {
        m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([newRaw]);
      } catch (e) {
        Logger.log('updateTransaction: write gagal: ' + e.message);
        return errResult_(engineErrCode_(e), 'Gagal update transaksi: ' + e.message, null, payload.id);
      }
      try {
        auditPush_('UPDATE_TRANSACTION', cur, next, 'write-door', payload.id);
      } catch (e) {
        Logger.log('updateTransaction: audit gagal setelah update sukses, RESTORE nilai before: ' + e.message);
        try { m.sh.getRange(rowNum, 1, 1, m.live.length).setValues([raw]); } catch (restoreErr) {
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
    Logger.log('updateTransaction: error tak terduga: ' + e.message);
    return errResult_(engineErrCode_(e), 'updateTransaction error tak terduga: ' + e.message, null);
  }
}`, log);
};
