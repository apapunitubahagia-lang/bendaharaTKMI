/**
 * ReconEngine.gs - [P1-C] Rekonsiliasi bank/kas dan pencocokan mutasi bank yang DIVALIDASI SERVER.
 *
 * opReconcileAccount : saldo sistem DIHITUNG SERVER (saldo awal akun + PENERIMAAN - PENGELUARAN non-arsip pada
 *                      akun itu s.d. akhir periode - keputusan K-P1-03), selisih = saldoAktual - saldoSistem.
 *                      Selisih != 0 wajib catatan (aturan klien dipertahankan). Status: SELESAI bila selisih 0,
 *                      selain itu PERLU_PENJELASAN. Idempoten lewat clientRequestId (id baris deterministik).
 *                      saldoSistem/selisih/status kiriman klien DIABAIKAN. Saldo awal TIDAK diubah.
 * opMatchMutasi      : mencocokkan baris 11_MUTASI_BANK ke transaksi yang sudah ada. Syarat: mutasi aktif dan
 *                      BELUM_DIPROSES, transaksi aktif, nominal sama (selisih < 1), transaksi belum dicocokkan ke
 *                      mutasi lain, periode mutasi terbuka. Tidak pernah membuat transaksi baru.
 *
 * DEPENDENSI: TransactionEngine.gs (readTrxRows_, withLock_, errResult_, okResult_), SchemaGuard.gs,
 *             PeriodLock.gs (plGuard_, plIsPeriodLabel_, plPeriodEnd_), RecordEngine.gs (opAuditBulk_, opRestoreRows_),
 *             OperationalAPI.gs (opGate_, opStr_, opJsonSafe_, OP_WRITE_ROLES_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var RC_REQ_REKON_ = ['id', 'akunId', 'periode', 'saldoSistem', 'saldoAktual', 'selisih', 'catatan', 'status', 'verifiedBy', 'verifiedAt', 'createdAt'];
var RC_REQ_MUT_ = ['id', 'tanggal', 'nominal', 'status', 'transaksiId'];

/* Saldo sistem akun s.d. tanggal akhir (inklusif). Rumus sama dengan akunSaldo() klien untuk PENERIMAAN/PENGELUARAN. */
function rcSaldoSistem_(akunId, asOf) {
  var am = sgModel_('07_AKUN', ['id', 'saldoAwal']);
  var akun = null;
  (am ? am.values : []).forEach(function (r) { if (String(r[am.idx.id]) === akunId) akun = r; });
  if (!akun) return null;
  var saldo = Number(akun[am.idx.saldoAwal]) || 0;
  readTrxRows_().forEach(function (t) {
    if (t.archivedAt || t.akunId !== akunId) return;
    if (asOf && String(t.tanggal) > asOf) return;
    if (t.jenis === 'PENERIMAAN') saldo += Number(t.nominal) || 0;
    else if (t.jenis === 'PENGELUARAN') saldo -= Number(t.nominal) || 0;
  });
  return saldo;
}
function opReconcileAccount(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  var akunId = opStr_(p.akunId), periode = opStr_(p.periode), catatan = opStr_(p.catatan).slice(0, 2000);
  var crid = opStr_(p.clientRequestId).replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80);
  if (!crid) return errResult_('VALIDATION_ERROR', 'clientRequestId wajib diisi (idempotency)', 'clientRequestId');
  if (!akunId) return errResult_('VALIDATION_ERROR', 'akunId wajib diisi', 'akunId');
  if (!plIsPeriodLabel_(periode)) return errResult_('VALIDATION_ERROR', 'periode harus berformat "<Bulan> <Tahun>"', 'periode');
  if (opStr_(p.saldoAktual) === '' || !isFinite(Number(p.saldoAktual))) return errResult_('VALIDATION_ERROR', 'saldoAktual harus angka', 'saldoAktual');
  var saldoAktual = Number(p.saldoAktual), id = 'gas_rekon_' + crid;
  try {
    return withLock_(function () {
      var m = sgModel_('16_REKONSILIASI', RC_REQ_REKON_);
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 16_REKONSILIASI tidak ditemukan', null);
      for (var i = 0; i < m.values.length; i++) {
        if (String(m.values[i][m.idx.id]) === id) return okResult_('Rekonsiliasi sudah pernah dicatat (idempotent replay)', opJsonSafe_(sgObj_(m, m.values[i])));
      }
      var pl = plGuard_([periode], 'rekonsiliasi'); if (pl) return pl;
      var saldoSistem = rcSaldoSistem_(akunId, plPeriodEnd_(periode));
      if (saldoSistem === null) return errResult_('INVALID_ACCOUNT', 'akunId tidak ditemukan di 07_AKUN: ' + akunId, 'akunId');
      var selisih = saldoAktual - saldoSistem, nol = Math.abs(selisih) < 0.5;
      if (!nol && !catatan) return errResult_('VALIDATION_ERROR', 'Selisih ditemukan (' + selisih + ') - catatan penjelasan WAJIB diisi', 'catatan');
      var now = new Date().toISOString();
      var row = { id: id, akunId: akunId, periode: periode, saldoSistem: saldoSistem, saldoAktual: saldoAktual, selisih: nol ? 0 : selisih, catatan: catatan,
        status: nol ? 'SELESAI' : 'PERLU_PENJELASAN', verifiedBy: g.identity.email, verifiedAt: now, createdAt: now };
      var rowNum = sgAppend_('16_REKONSILIASI', RC_REQ_REKON_, row);
      try { opAuditBulk_([['REKONSILIASI', null, row, id]], g.identity.email); } catch (e) {
        try { sgUndoAppend_(m.sh, rowNum, 1); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan rekonsiliasi gagal: ' + re.message, null, id); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; rekonsiliasi dibatalkan', null, id);
      }
      return okResult_(nol ? 'Rekonsiliasi selesai, saldo sesuai' : 'Rekonsiliasi dicatat dengan selisih (perlu penjelasan/tindak lanjut)', row);
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mencatat rekonsiliasi'); }
}

/* Aturan pencocokan mutasi -> transaksi (dipakai opMatchMutasi dan RecordGuard untuk baris baru DIPROSES).
   mutRows = [{id, status, transaksiId, archivedAt}], activeTrx(id) -> transaksi aktif atau null. */
function rcCheckLink_(mut, trxId, mutRows, activeTrx) {
  if (!trxId) return { code: 'VALIDATION_ERROR', message: 'transaksiId wajib diisi untuk mutasi DIPROSES' };
  var t = activeTrx(trxId);
  if (!t) return { code: 'INVALID_TRANSACTION', message: 'Transaksi tidak ditemukan atau sudah diarsipkan: ' + trxId };
  if (Math.abs((Number(t.nominal) || 0) - (Number(mut.nominal) || 0)) >= 1) {
    return { code: 'MATCH_NOMINAL_MISMATCH', message: 'Nominal mutasi (' + mut.nominal + ') berbeda dengan nominal transaksi (' + t.nominal + ')' };
  }
  var dbl = mutRows.filter(function (r) { return String(r.id) !== String(mut.id) && opStr_(r.archivedAt) === '' && String(r.transaksiId) === trxId; });
  if (dbl.length) return { code: 'DOUBLE_MATCH', message: 'Transaksi ' + trxId + ' sudah dicocokkan ke mutasi lain (' + dbl[0].id + '); satu transaksi hanya untuk satu mutasi' };
  return null;
}
function opMatchMutasi(p) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return errResult_('VALIDATION_ERROR', 'payload wajib objek', 'payload');
  var mutId = opStr_(p.mutasiId), trxId = opStr_(p.transaksiId);
  if (!mutId || !trxId) return errResult_('VALIDATION_ERROR', 'mutasiId dan transaksiId wajib diisi', 'mutasiId');
  try {
    return withLock_(function () {
      var m = sgModel_('11_MUTASI_BANK', RC_REQ_MUT_);
      if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 11_MUTASI_BANK tidak ditemukan', null);
      var list = m.values.map(function (r) { var o = sgObj_(m, r); o.archivedAt = sgGet_(m, r, 'archivedAt') || ''; return o; });
      var pos = -1;
      for (var i = 0; i < list.length; i++) { if (String(list[i].id) === mutId) { pos = i; break; } }
      if (pos === -1) return errResult_('NOT_FOUND', 'Mutasi bank tidak ditemukan: ' + mutId, 'mutasiId');
      var mut = list[pos];
      if (opStr_(mut.archivedAt) !== '') return errResult_('ARCHIVED', 'Mutasi bank sudah diarsipkan', 'mutasiId', mutId);
      if (opStr_(mut.status) === 'DIPROSES') {
        if (opStr_(mut.transaksiId) === trxId) { var same = okResult_('Mutasi sudah dicocokkan ke transaksi ini', opJsonSafe_(mut)); same.data.unchanged = true; return same; }
        return errResult_('ALREADY_MATCHED', 'Mutasi sudah dicocokkan ke transaksi lain (' + mut.transaksiId + ')', 'mutasiId', mutId);
      }
      var pl = plGuard_([mut.tanggal], 'mutasi bank'); if (pl) return pl;
      var trxMap = {}; readTrxRows_().forEach(function (t) { trxMap[String(t.id)] = t; });
      var lk = rcCheckLink_(mut, trxId, list, function (id) { var t = trxMap[id]; return t && !t.archivedAt ? t : null; });
      if (lk) return errResult_(lk.code, lk.message, 'transaksiId', mutId);
      var raw = m.values[pos], nx = raw.slice();
      nx[m.idx.status] = 'DIPROSES'; nx[m.idx.transaksiId] = trxId;
      m.sh.getRange(pos + 2, 1, 1, m.live.length).setValues([nx]);
      var before = opJsonSafe_(sgObj_(m, raw)), after = opJsonSafe_(sgObj_(m, nx));
      try { opAuditBulk_([['COCOKKAN_MUTASI_TRANSAKSI', before, after, mutId]], g.identity.email); } catch (e) {
        try { opRestoreRows_(m.sh, m.live.length, [{ rowNum: pos + 2, orig: raw }], 0, 0); } catch (re) { return errResult_('ROLLBACK_FAILED', 'Audit gagal DAN pemulihan mutasi gagal: ' + re.message, null, mutId); }
        return errResult_('AUDIT_FAILED', 'Audit gagal ditulis; pencocokan mutasi dibatalkan', null, mutId);
      }
      return okResult_('Mutasi dicocokkan ke transaksi yang sudah ada - TIDAK ada transaksi baru dibuat', after);
    });
  } catch (e) { return sgErr_(e, 'WRITE_FAILED', 'Gagal mencocokkan mutasi'); }
}
