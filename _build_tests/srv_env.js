const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const G = require('./paths').G;
const AB = require('./paths').AB;
const OUT = require('./paths').OUT;
const rd = f => fs.readFileSync(f, 'utf8');
const SERVER_FILES = ['TransactionEngine.gs', 'SchemaGuard.gs', 'AuthCentral.gs', 'MasterDataRead.gs', 'CreateDatabaseStructure.gs', 'Code.gs', 'OperationalAPI.gs', 'RecordEngine.gs', 'AdminAPI.gs', 'BuktiDrive.gs', 'ObligationEngine.gs', 'FinanceEngine.gs', 'TarifPlan.gs', 'AllocationGuard.gs', 'PeriodLock.gs', 'RecordGuard.gs', 'ReconEngine.gs', 'RabMapping.gs', 'RabAllocation.gs', 'PeriodeAktifAdmin.gs', 'SiswaMasterAudit.gs', 'ImportRules.gs', 'ImportEngine.gs', 'KewajibanGuard.gs', 'KategoriPengeluaranAudit.gs', 'RabPersetujuan.gs', 'LintasPeriodeAudit.gs', 'KewajibanBekuAudit.gs', 'UangMukaLpj.gs']; // [P1_21 U-5] RabPersetujuan.gs; // [P1] berkas baru; [P1-RAB] RabAllocation.gs
// [P0] AuthCentral.gs & CreateDatabaseStructure.gs kini berkas deploy di root repo (GAP-029); deps/ hanya basis build.
function srcOf(f) { return rd(OUT + f); }

function makeServer(o) {
  o = o || {};
  const state = { email: 'bendahara@x.id', failSetValuesOn: null, drive: { files: [], folders: [] } }; const sheets = {};
  const so = n => {
    const rows = sheets[n]; let maxCols = o.maxCols || 60;
    return {
      deleteRow(i) { rows.splice(i - 1, 1); }, // [P0] dipakai rollback engine (deleteRowById_)
      getLastRow: () => rows.length, getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0), setFrozenRows() {}, getMaxColumns: () => maxCols, insertColumnsAfter(a, b) { maxCols += b; },
      getRange(r, c, nr, nc) {
        return {
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
          setValues(v) { if (state.failSetValuesOn === n) { if (state.failSetValuesSkip > 0) state.failSetValuesSkip--; else { state.failSetValuesOn = null; throw new Error('simulasi gagal tulis'); } } // [P1] failSetValuesSkip: gagal pada tulis ke-(skip+1)
 for (let i = 0; i < v.length; i++) { while (rows.length < r + i) rows.push([]); for (let j = 0; j < v[i].length; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return this; },
          setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, copyTo() { return this; }
        };
      }
    };
  };
  const ssObj = { getSheetByName: n => (sheets[n] ? so(n) : null), insertSheet: n => { sheets[n] = []; return so(n); }, getSpreadsheetTimeZone: () => 'UTC' };
  const mkFile = (name, bytes, mime) => { const f = { id: 'drv_' + crypto.randomUUID().slice(0, 8), name, mime, bytes: bytes.length, trashed: false, getId() { return this.id; }, getUrl() { return 'https://drive.test/' + this.id; }, setTrashed(v) { this.trashed = v; return this; } }; state.drive.files.push(f); return f; };
  const folder = { createFile(blob) { return mkFile(blob.name, blob.bytes, blob.mime); } };
  const sb = {
    console, Date, Math, JSON, Object, Array, Number, String, Boolean, Error, RegExp, isFinite, isNaN, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ssObj, flush() {} }, Session: { getActiveUser: () => ({ getEmail: () => state.email }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (state.lockFail) throw new Error('simulasi lock timeout'); }, releaseLock() {} }) }, // [P0] state.lockFail -> LOCK_TIMEOUT
    DriveApp: { getFoldersByName: () => ({ hasNext: () => state.drive.folders.length > 0, next: () => folder }), createFolder: n => { state.drive.folders.push(n); return folder; } },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep() {}, computeDigest() { return []; }, DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, base64Decode: s => Buffer.from(s, 'base64'), newBlob: (bytes, mime, name) => ({ bytes, mime, name }), formatDate: (d, tz, f) => (f === 'HH:mm:ss' ? d.toISOString().slice(11, 19) : d.toISOString().slice(0, 10)) }
  };
  vm.createContext(sb);
  (o.files || SERVER_FILES).forEach(f => vm.runInContext(srcOf(f), sb, { filename: f }));
  vm.runInContext('globalThis.__DB = DB_SCHEMA; globalThis.__TRXH = TRX_HEADERS;', sb);
  sb.__DB.forEach(d => { sheets[d.name] = [d.headers.slice()]; });
  sheets['24_IDEMPOTENCY_LOG'] = [['clientRequestId', 'resultRefId', 'resultType', 'createdAt']];
  sheets['25_DEVICE_WHITELIST'] = [['deviceId', 'deviceLabel', 'tokenHash', 'status', 'requestedAt', 'approvedAt', 'approvedBy', 'lastSeenAt']];
  sheets['26_USER_ACCESS'] = [['id', 'email', 'nama', 'role', 'unit', 'status', 'createdAt', 'updatedAt'], ['U1', 'bendahara@x.id', 'B', 'BENDAHARA', 'MI', 'ACTIVE', '', ''], ['U2', 'auditor@x.id', 'A', 'AUDITOR', '', 'ACTIVE', '', '']];
  sheets['99_MIGRATION_LOG'] = [['batchId', 'startedAt', 'finishedAt', 'collection', 'sourceCount', 'written', 'status']];
  // schema LIVE (lebih sempit dari kode): 03_TARIF & 07_AKUN tanpa status
  sheets['03_TARIF'] = [['id', 'komponenId', 'unit', 'kelas', 'tahunAjaran', 'nominal'], ['trf_1', 'kmp_spp', 'MI', '', '', 200000]];
  sheets['01_SISWA'].push(['s1', 'HANA', '', '111', 'Madinah', 'MI', '2026/2027', '', '', 'Wali A', '', '', '', 'Aktif'], ['s2', 'ZAHRA', '', '222', '3 Abdul', 'MI', '2026/2027', '', '', 'Wali B', '', '', '', 'Aktif']);
  sheets['02_KOMPONEN'].push(['kmp_spp', 'SPP', '', 'Bulanan', '', '']);
  sheets['07_AKUN'].push(['akun_kas1', 'Kasir', 'Kas', 0], ['akun_bank1', 'BNI', 'Bank', 0]);
  sheets['20_KATEGORI_PENERIMAAN'].push(['KATP_SPP', '1', 'SPP', 'Aktif']);
  sheets['21_KATEGORI_PENGELUARAN'].push(['KAT_ATK', '1', 'ATK', 'Aktif']);
  sheets['22_SUBKATEGORI'].push(['SUB_1', 'KAT_ATK', 'Kertas', 'Aktif']);
  sheets['23_TAHUN_AJARAN'].push(['TA_1', '2025/2026', 'Aktif']);
  sheets['15_SETTINGS'].push(['periodeAktif', 'September 2026', ''], ['tahunAjaranAktif', '2026/2027', '']);
  const trx = (id, jenis, nom, extra) => sb.__TRXH.map(h => h === 'id' ? id : h === 'jenis' ? jenis : h === 'tanggal' ? '2026-09-05' : h === 'unit' ? 'MI' : h === 'nominal' ? nom : h === 'akunId' ? 'akun_kas1' : h === 'metode' ? 'Tunai' : h === 'status' ? 'TERCATAT' : h === 'createdAt' ? '2026-09-05T01:00:00.000Z' : (extra && extra[h]) || '');
  sheets['05_TRANSAKSI'].push(trx('imp_trx_1', 'PENERIMAAN', 200000, { siswaId: 's1', sumber: 'Pembayaran Siswa', status: 'TERALOKASI' }), trx('imp_trx_2', 'PENGELUARAN', 50000, { kategori: 'ATK', penerima: 'Toko' }));
  sheets['06_ALOKASI'].push(['imp_alk_1', 'imp_trx_1', 's1', 'kmp_spp', 'September 2026', 200000, 'cicilan', '', '2026-09-05T01:00:00.000Z']);
  sheets['08_ANGGARAN'].push(['ang_1', 'September 2026', 'ATK', 'ATK', 'MI', 1000000, '', '', '', '']);
  return { sb, sheets, state };
}
module.exports = { makeServer, SERVER_FILES, srcOf, OUT, G, AB };
