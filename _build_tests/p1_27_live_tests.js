/* Suite harness P1_27 (sandbox Node; TIDAK menyentuh Google Sheets / Apps Script): ltStatusRingkasan (baca-saja). */
const { makeServer, SERVER_FILES } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const PROD = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
function harness(ssId, props) {
  const srv = makeServer({ files: SERVER_FILES.concat(['_live_tests/LiveReadiness.gs']) }); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  const orig = srv.sb.SpreadsheetApp.getActiveSpreadsheet, ss0 = orig();
  srv.sb.SpreadsheetApp.getActiveSpreadsheet = () => Object.assign({}, ss0, { getId: () => ssId, getName: () => 'UJI' });
  srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) };
  srv.sb.DriveApp.getFolderById = id => { if (id !== 'FOLDER_UJI_OK_123') throw new Error('not found'); return { getName: () => 'Bukti_UJI' }; };
  return srv;
}
const push = (s, n, o) => { const h = s.sheets[n][0]; s.sheets[n].push(h.map(k => o[k] === undefined ? '' : o[k])); };
{ const r = (() => { try { harness(PROD, { LIVE_TEST_SPREADSHEET_ID: PROD }).sb.ltStatusRingkasan(); return 'TIDAK_DITOLAK'; } catch (e) { return e.message; } })();
  rec('LV-01', 'ltStatusRingkasan menolak spreadsheet produksi (ltGuard_)', /PRODUKSI/.test(r), r.slice(0, 60)); }
{ const s = harness('copy1', { LIVE_TEST_SPREADSHEET_ID: 'copy1', BUKTI_FOLDER_ID: 'https://drive.google.com/drive/folders/FOLDER_UJI_OK_123' });
  push(s, '11_MUTASI_BANK', { id: 'm1', tanggal: '2026-09-01', nominal: 1, status: 'TEREKONSILIASI' }); push(s, '11_MUTASI_BANK', { id: 'm2', tanggal: '2026-09-02', nominal: 1, status: 'Terekonsiliasi' }); push(s, '11_MUTASI_BANK', { id: 'm3', tanggal: '2026-09-03', nominal: 1, status: 'BELUM_DIPROSES' });
  const before = J(s.sheets), r = s.sb.ltStatusRingkasan();
  rec('LV-02', 'sebaran status apa adanya (TEREKONSILIASI 1, Terekonsiliasi 1, BELUM_DIPROSES 1; memuat REKONSIL = 2) + status/jenis 05; BUKTI_FOLDER_ID berupa URL terdeteksi (tampakUrl) dan cek folder gagal; baca-saja',
    r.sheet['11_MUTASI_BANK'].status.TEREKONSILIASI === 1 && r.sheet['11_MUTASI_BANK'].status.Terekonsiliasi === 1 && r.sheet['11_MUTASI_BANK'].status_memuatREKONSIL === 2 && r.sheet['05_TRANSAKSI'].jenis.PENERIMAAN === 1
      && r.buktiFolderId.tampakUrl === true && r.buktiFolderId.cek.ok === false && J(s.sheets) === before, J({ mutasi: r.sheet['11_MUTASI_BANK'], folder: r.buktiFolderId })); }
{ const s = harness('copy1', { LIVE_TEST_SPREADSHEET_ID: 'copy1', BUKTI_FOLDER_ID: 'FOLDER_UJI_OK_123' }); const r = s.sb.ltStatusRingkasan();
  rec('LV-03', 'BUKTI_FOLDER_ID berupa ID yang benar -> cek folder ok (nama bukan Bendahara_Bukti)', r.buktiFolderId.tampakUrl === false && r.buktiFolderId.cek.ok === true, J(r.buktiFolderId)); }
const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
