/* Suite GAP-005 / KESIAPAN UJI (P1_19 E; sandbox Node, TIDAK menyentuh Google Sheets/Drive).
 * Matriks peran semua fungsi publik server, folder bukti uji (Script Property), inventaris konfigurasi deploy di repo.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function props(srv, init) { const p = Object.assign({}, init || {}); srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in p ? p[k] : null), setProperty: (k, v) => { p[k] = v; } }) }; return p; }
function withDrive(srv) {
  const ss = srv.sb.SpreadsheetApp.getActiveSpreadsheet(); ss.getId = () => 'SALINAN_UJI_123';
  const folders = { F_UJI: { id: 'F_UJI', files: [] } }, made = [];
  const mkFolder = f => ({ getName: () => 'Folder Uji', createFile(blob) { const file = { id: 'file_' + made.length, getId() { return this.id; }, getUrl() { return 'u'; }, setTrashed() {} }; f.files.push(file); made.push(['F_UJI', blob.name]); return file; } });
  srv.sb.DriveApp.getFolderById = id => { if (!folders[id]) throw new Error('not found'); return mkFolder(folders[id]); };
  return { folders, made };
}
const up = (srv, id) => srv.sb.opUploadBukti({ id, mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64'), fileName: 'nota.pdf' });
const nBukti = srv => srv.sheets['10_BUKTI'].length;

(async () => {
  { const srv = makeServer(); props(srv, {}); const r = up(srv, 'bukti_ge1');
    rec('GE-01', 'tanpa Script Property: perilaku lama (folder dicari/dibuat berdasarkan nama) tidak berubah', r.ok && srv.state.drive.folders.includes('Bendahara_Bukti'), r.code + ' folder ' + J(srv.state.drive.folders)); }
  { const srv = makeServer(); withDrive(srv); props(srv, { LIVE_TEST_SPREADSHEET_ID: 'SALINAN_UJI_123' }); const n0 = nBukti(srv); const r = up(srv, 'bukti_ge2');
    rec('GE-02', 'mode uji tanpa BUKTI_FOLDER_ID -> unggah ditolak TEST_FOLDER_REQUIRED (tidak pernah mencari folder produksi berdasarkan nama)', r.code === 'TEST_FOLDER_REQUIRED' && nBukti(srv) === n0 && !srv.state.drive.folders.length && !srv.state.drive.files.length, r.code); }
  { const srv = makeServer(); withDrive(srv); props(srv, { BUKTI_FOLDER_ID: 'F_TIDAK_ADA' }); const r = up(srv, 'bukti_ge3');
    rec('GE-03', 'BUKTI_FOLDER_ID tidak dapat dibuka -> gagal tertutup BUKTI_FOLDER_UNAVAILABLE', r.code === 'BUKTI_FOLDER_UNAVAILABLE' && !srv.state.drive.folders.length, r.code); }
  { const srv = makeServer(); const d = withDrive(srv); props(srv, { LIVE_TEST_SPREADSHEET_ID: 'SALINAN_UJI_123', BUKTI_FOLDER_ID: 'F_UJI' }); const r = up(srv, 'bukti_ge4');
    rec('GE-04', 'BUKTI_FOLDER_ID valid -> file masuk folder uji, bukan folder bernama produksi', r.ok && d.made.length === 1 && !srv.state.drive.folders.length, r.code + ' ' + J(d.made)); }
  { // matriks peran: semua fungsi publik (tanpa garis bawah di akhir) yang dapat dipanggil google.script.run
    const srv = makeServer(); const names = [];
    const files = fs.readdirSync(OUT).filter(f => f.endsWith('.gs'));
    files.forEach(f => { const s = fs.readFileSync(OUT + f, 'utf8'); for (const m of s.matchAll(/^function ([A-Za-z0-9_]*[A-Za-z0-9])\(/gm)) if (/^(op|get)/.test(m[1])) names.push(m[1]); });
    const WRITE = ['opUserList', 'opUserUpsert', 'opSchemaApply', 'opUploadBukti', 'opImportSetup', 'opImportPlan', 'opImportCommit', 'opImportReviewResolve', 'opObligationSnapshot', 'opMasterUpsert', 'opClosePeriod', 'opReopenPeriod', 'opPeriodeAktifApply',
      'opAlokasiPengeluaranSetup', 'opAlokasiPengeluaranImport', 'opReconcileAccount', 'opMatchMutasi', 'opRecordBatch', 'opRecordUpsert', 'opArchiveTransaction', 'opArchiveAllocation', 'opCreateTxBatch', 'opMasterBatch', 'opSettingsUpsert', 'opAuditAppend', 'opTarifApply',
      'opCreateIncome', 'opCreateExpense', 'opCreateAllocation', 'opUpdateTransaction'];
    const res = { auditorTulis: {}, asingSemua: {}, tanpaGerbang: [] };
    const n05 = srv.sheets['05_TRANSAKSI'].length, n06 = srv.sheets['06_ALOKASI'].length, n13 = srv.sheets['13_AUDIT_LOG'].length;
    names.forEach(n => {
      if (n === 'getCurrentUserIdentity') return;
      srv.state.email = 'auditor@x.id'; let a; try { a = srv.sb[n]({ id: 'x', modul: 'pengeluaran', baris: [{}] }, 'x', 'x'); } catch (e) { a = { code: 'THROW ' + e.message }; }
      if (WRITE.includes(n)) res.auditorTulis[n] = a && a.code;
      srv.state.email = 'asing@x.id'; let b; try { b = srv.sb[n]({ id: 'x' }, 'x', 'x'); } catch (e) { b = { code: 'THROW ' + e.message }; }
      res.asingSemua[n] = b && (b.authorized === false || b.ok === false) ? b.code : 'LOLOS';
      if (res.asingSemua[n] === 'LOLOS') res.tanpaGerbang.push(n);
    });
    const auditorBad = Object.keys(res.auditorTulis).filter(k => res.auditorTulis[k] !== 'ROLE_NOT_ALLOWED');
    const asingBad = Object.keys(res.asingSemua).filter(k => !/USER_NOT_FOUND/.test(res.asingSemua[k]));
    rec('GE-05', 'matriks peran: ' + names.length + ' fungsi publik op*/get*; AUDITOR ditolak semua fungsi tulis; pengguna tak terdaftar ditolak semua fungsi; tidak ada tulisan', !auditorBad.length && !asingBad.length && srv.sheets['05_TRANSAKSI'].length === n05 && srv.sheets['06_ALOKASI'].length === n06 && srv.sheets['13_AUDIT_LOG'].length === n13,
      'tulis diuji ' + Object.keys(res.auditorTulis).length + ', AUDITOR tidak ditolak: ' + J(auditorBad) + ', asing tidak ditolak: ' + J(asingBad.map(k => k + ':' + res.asingSemua[k]))); }
  { const files = fs.readdirSync(OUT); const s = f => fs.readFileSync(OUT + f, 'utf8');
    const pub = []; files.filter(f => f.endsWith('.gs')).forEach(f => { for (const m of s(f).matchAll(/^function ([A-Za-z0-9_]*[A-Za-z0-9])\(/gm)) if (!/^(op|get)/.test(m[1])) pub.push(f + ':' + m[1]); });
    rec('GE-06', 'INVENTARIS GAP-005 (repo): manifest & konfigurasi deploy, identitas sesi, fungsi publik non-API', null, J({
      appsscriptJson: files.includes('appsscript.json'), claspJson: files.includes('.clasp.json'),
      identitas: /Session\.getActiveUser\(\)\.getEmail\(\)/.test(s('AuthCentral.gs')) ? 'Session.getActiveUser().getEmail() + 26_USER_ACCESS' : '?',
      spreadsheet: /getActiveSpreadsheet\(\)/.test(s('TransactionEngine.gs')) ? 'container-bound (getActiveSpreadsheet)' : '?',
      doPost: /LEGACY_DOPOST_ENABLED_ = false/.test(s('Code.gs')) ? 'dinonaktifkan (LEGACY_DOPOST_ENABLED_=false)' : 'AKTIF',
      fungsiPublikLain: pub })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
