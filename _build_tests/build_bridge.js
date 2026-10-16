const fs = require('fs');
const G = 'C:/Users/HP/OneDrive/Desktop/Bendahara/SISTEM_KINERJA_SEKOLAH/03_BENDAHARA_SEKOLAH/GAS_Migration/ServerBridge.js';
const OUT = 'C:/Users/HP/OneDrive/Desktop/Bendahara/MASTER_API_REFACTOR/';
let sb = fs.readFileSync(G, 'utf8');
const anchor = "getSettings: function () { return callServer('getSettings', []); }";
if (!sb.includes(anchor)) throw new Error('anchor ServerBridge');
const M = [
  ['opSchemaReport', ''], ['opReadSheet', 'sheetName, opts', 'sheetName, opts || {}'], ['opGetTransactions', 'filters', 'filters || {}'], ['opGetTransaction', 'id'], ['opGetStudentPosition', 'siswaId'],
  ['opCreateIncome', 'payload'], ['opCreateExpense', 'payload'], ['opCreateAllocation', 'payload'], ['opUpdateTransaction', 'payload'], ['opMasterUpsert', 'sheetKey, record, createId'],
  ['opRecordBatch', 'key, ops'], ['opRecordUpsert', 'key, record'], ['opArchiveTransaction', 'id, reason'], ['opArchiveAllocation', 'id, reason'], ['opCreateTxBatch', 'items'],
  ['opMasterBatch', 'sheetKey, records'], ['opSettingsUpsert', 'items'], ['opAuditAppend', 'entries'], ['opUserList', ''], ['opUserUpsert', 'record'],
  ['opSchemaPlan', ''], ['opSchemaApply', 'confirm'], ['opUploadBukti', 'payload'], ['opObligations', 'opts', 'opts || {}'], ['opObligationSnapshot', 'periode, opts', 'periode, opts || {}'], ['opFinancialControl', 'periode'], ['opTarifPlan', ''], ['opTarifApply', 'confirm']
];
const lines = M.map(m => '    ' + m[0] + ': function (' + m[1] + ') { return callServer(\'' + m[0] + '\', [' + (m[2] !== undefined ? m[2] : m[1]) + ']); }');
sb = sb.replace(anchor, anchor + ',\n    // --- OperationalAPI / RecordEngine / AdminAPI / BuktiDrive / ObligationEngine / FinanceEngine (semua authorized di server) ---\n' + lines.join(',\n'));
fs.writeFileSync(OUT + 'ServerBridge.js', sb);
fs.writeFileSync(OUT + 'ServerBridge.html', '<script>\n' + sb + '\n</script>\n');
console.log('ServerBridge: ' + M.length + ' method op* ditambahkan');
