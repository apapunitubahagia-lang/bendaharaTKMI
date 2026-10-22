/* Suite CAKUPAN KUNCI PENULISAN (P1_25 hardening; sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * Instrumentasi: setiap setValues / insertSheet / deleteRow pada sheet tiruan dicatat bersama LOCK_DEPTH_ saat itu.
 * Penulisan dengan LOCK_DEPTH_ = 0 = penulisan di luar withLock_ (append getLastRow()+1 dapat bertabrakan antar-eksekusi).
 * Catatan: sandbox tidak memodelkan kontensi LockService nyata; yang diuji adalah CAKUPAN kunci, bukan perilaku LockService.
 */
const vm = require('vm');
const { makeServer } = require('./srv_env.js');
const { liveLike } = require('./live_seed.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function instrument(srv) {
  const sb = srv.sb, getSS = sb.SpreadsheetApp.getActiveSpreadsheet, log = [];
  const note = (kind, sheet) => { const d = vm.runInContext('LOCK_DEPTH_', sb); if (d === 0) log.push(kind + ':' + sheet + ' @ ' + ((new Error().stack || '').split('\n').filter(l => /\.gs:/.test(l)).slice(0, 3).map(l => l.trim().replace(/^at /, '').replace(/ \(.*\//, ' (')).join(' <- '))); };
  sb.SpreadsheetApp.getActiveSpreadsheet = function () {
    const ss = getSS();
    const wrap = (n, sh) => sh && Object.assign({}, sh, {
      getRange() { const r = sh.getRange.apply(sh, arguments); return Object.assign({}, r, { setValues(v) { note('setValues', n); r.setValues(v); return this; } }); },
      deleteRow(i) { note('deleteRow', n); return sh.deleteRow(i); }
    });
    return Object.assign({}, ss, { getSheetByName: n => wrap(n, ss.getSheetByName(n)), insertSheet: n => { note('insertSheet', n); return wrap(n, ss.insertSheet(n)); } });
  };
  return log;
}

{ const S = liveLike(); S.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const log = instrument(S);
  const r = S.sb.opTarifApply('TERAPKAN_RENCANA_TARIF');
  const aud = S.sheets['13_AUDIT_LOG'].slice(1).filter(x => x[2] === 'TARIF_PLAN_APPLIED').length;
  rec('LH-01', '[P1_25 hardening] opTarifApply: rencana + bekukan + komponen + tarif + nonaktifkan + audit TARIF_PLAN_APPLIED semuanya di dalam satu kunci (0 penulisan tanpa kunci; sebelumnya audit ditulis tanpa kunci)',
    r.ok && log.length === 0 && aud === 1, J({ code: r.code, tanpaKunci: log.slice(0, 3), audit: aud })); }
{ const S = liveLike(); S.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const before = J(S.sheets); S.state.lockFail = true;
  const r = S.sb.opTarifApply('TERAPKAN_RENCANA_TARIF'); S.state.lockFail = false;
  rec('LH-02', 'kunci tidak didapat -> LOCK_TIMEOUT tanpa menulis apa pun (seluruh sheet identik); setelah kunci tersedia penerapan berhasil dan penerapan ulang tidak berubah',
    r.code === 'LOCK_TIMEOUT' && J(S.sheets) === before && S.sb.opTarifApply('TERAPKAN_RENCANA_TARIF').ok && /Tidak ada perubahan/.test(S.sb.opTarifApply('TERAPKAN_RENCANA_TARIF').message), r.code); }
{ // rangkaian operasi tulis utama: tidak ada penulisan di luar kunci
  const s = makeServer(); const log = instrument(s); const B = s.sb, res = {};
  const run = (k, f) => { try { const r = f(); res[k] = r && (r.ok ? 'OK' : r.code); } catch (e) { res[k] = 'THROW:' + e.message.slice(0, 40); } };
  run('schemaApply', () => B.opSchemaApply('TAMBAH_KOLOM_ADITIF'));
  run('income', () => B.opCreateIncome({ tanggal: '2026-09-10', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's2', sumber: 'Pembayaran Siswa', clientRequestId: 'lh_inc' }));
  run('expense', () => B.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 20000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: 'lh_exp' }));
  run('update', () => B.opUpdateTransaction({ id: 'imp_trx_2', penerima: 'Toko B' }));
  run('snapshot', () => B.opObligationSnapshot('September 2026', {}));
  run('settings', () => B.opSettingsUpsert([{ key: 'lh.test', value: '1' }]));
  run('master', () => B.opMasterUpsert('siswa', { nama: 'Uji Kunci', unit: 'MI', kelas: '1-A', tahunAjaran: '2026/2027' }));
  run('recordBatch', () => B.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_lh1', row: { tanggal: '2026-09-25', unit: 'MI', kategori: 'ATK', item: 'Nota', nominal: 10000, status: 'REALIZATION' } }]));
  run('auditAppend', () => B.opAuditAppend([{ aksi: 'UI_NOTE', after: { x: 1 } }]));
  run('uploadBukti', () => B.opUploadBukti({ id: 'dok_lh1', mimeType: 'application/pdf', base64: Buffer.from('%PDF').toString('base64'), fileName: 'n.pdf', transaksiId: 'imp_trx_2' }));
  run('umSetup', () => B.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ'));
  let um = null; run('umCair', () => { const r = B.opUangMukaCair({ kegiatan: 'K', pelaksana: 'P', nominal: 500000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_kas1', kategori: 'ATK', clientRequestId: 'lh_um' }); um = r.data; return r; });
  run('umKembali', () => B.opUangMukaKembali({ uangMukaId: um && um.id, nominal: 100000, tanggal: '2026-09-22', clientRequestId: 'lh_k' }));
  run('umBatal', () => B.opUangMukaBatal({ uangMukaId: um && um.id, alasan: 'uji cakupan kunci penulisan' }));
  run('lpjCreate', () => B.opCreateExpenseFromLpj({ lpjId: 'lpj_lh1', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }));
  run('lpjUnlink', () => B.opUnlinkLpj({ lpjId: 'lpj_lh1', alasan: 'uji cakupan kunci penulisan' }));
  run('archiveTrx', () => B.opArchiveTransaction('imp_trx_2', 'uji cakupan kunci'));
  run('archiveAlloc', () => B.opArchiveAllocation('imp_alk_1', 'uji cakupan kunci'));
  const okCount = Object.values(res).filter(v => v === 'OK').length;
  rec('LH-03', 'rangkaian ' + Object.keys(res).length + ' operasi tulis utama (transaksi, koreksi, kewajiban, settings, master, record batch, audit, bukti, uang muka, LPJ, arsip): 0 penulisan sheet di luar kunci',
    log.length === 0 && okCount >= Object.keys(res).length - 1, J({ hasil: res, tanpaKunci: log.slice(0, 5) })); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
