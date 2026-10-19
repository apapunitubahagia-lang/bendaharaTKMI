const fs = require('fs');
const G = require('./paths').G + 'ServerBridge.js';
const OUT = require('./paths').OUT;
let sb = fs.readFileSync(G, 'utf8');
const anchor = "getSettings: function () { return callServer('getSettings', []); }";
if (!sb.includes(anchor)) throw new Error('anchor ServerBridge');
const M = [
  ['opSchemaReport', ''], ['opReadSheet', 'sheetName, opts', 'sheetName, opts || {}'], ['opGetTransactions', 'filters', 'filters || {}'], ['opGetTransaction', 'id'], ['opGetStudentPosition', 'siswaId'],
  ['opCreateIncome', 'payload'], ['opCreateExpense', 'payload'], ['opCreateAllocation', 'payload'], ['opUpdateTransaction', 'payload'], ['opMasterUpsert', 'sheetKey, record, createId, expect'],
  ['opRecordBatch', 'key, ops'], ['opRecordUpsert', 'key, record'], ['opArchiveTransaction', 'id, reason'], ['opArchiveAllocation', 'id, reason'], ['opCreateTxBatch', 'items'],
  ['opMasterBatch', 'sheetKey, records'], ['opSettingsUpsert', 'items'], ['opAuditAppend', 'entries'], ['opUserList', ''], ['opUserUpsert', 'record'],
  ['opSchemaPlan', ''], ['opSchemaApply', 'confirm'], ['opUploadBukti', 'payload'], ['opObligations', 'opts', 'opts || {}'], ['opObligationSnapshot', 'periode, opts', 'periode, opts || {}'], ['opFinancialControl', 'periode'], ['opTarifPlan', ''], ['opTarifApply', 'confirm'],
  // [P1] penguncian periode, rekonsiliasi, pencocokan mutasi, pemetaan RAB
  ['opPeriodLockStatus', ''], ['opClosePeriod', 'periode'], ['opReopenPeriod', 'periode, reason'], ['opReconcileAccount', 'payload'], ['opMatchMutasi', 'payload'], ['opRabRealization', 'periode'],
  ['opAlokasiPengeluaranSetup', 'confirm'], ['opAlokasiPengeluaranPlan', ''], ['opAlokasiPengeluaranImport', 'payload'], // [P1-RAB]
  ['opPeriodeAktifPlan', ''], ['opPeriodeAktifApply', 'payload'], // [P1-IMP F8]
  ['opSiswaMasterAudit', ''], // [P1-IMP F7/D-IMP-8]
  ['opImportSetup', 'confirm'], ['opImportPlan', 'payload'], ['opImportCommit', 'payload'], ['opImportStatus', 'batchId'], ['opImportReviewList', 'opts', 'opts || {}'], ['opImportReviewResolve', 'payload'] // [P1-IMP]
];
const lines = M.map(m => '    ' + m[0] + ': function (' + m[1] + ') { return callServer(\'' + m[0] + '\', [' + (m[2] !== undefined ? m[2] : m[1]) + ']); }');
sb = sb.replace(anchor, anchor + ',\n    // --- OperationalAPI / RecordEngine / AdminAPI / BuktiDrive / ObligationEngine / FinanceEngine (semua authorized di server) ---\n' + lines.join(',\n'));
fs.writeFileSync(OUT + 'ServerBridge.js', sb);
fs.writeFileSync(OUT + 'ServerBridge.html', '<script>\n' + sb + '\n</script>\n');
console.log('ServerBridge: ' + M.length + ' method op* ditambahkan');
