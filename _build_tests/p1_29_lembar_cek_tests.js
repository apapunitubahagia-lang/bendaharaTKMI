/* Suite harness P1_29 (sandbox Node; TIDAK menyentuh Google Sheets / Apps Script): ltBuatLembarCek (lembar cek sementara). */
const { makeServer, SERVER_FILES } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const PROD = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
function fakeBook(name) { // spreadsheet BARU tiruan: mencatat isi tiap tab + format
  const book = { name, tabs: {}, order: [], fmt: [], cb: [] };
  const mkSheet = n => { book.tabs[n] = []; book.order.push(n); const sh = { n,
    setName(x) { book.tabs[x] = book.tabs[sh.n]; delete book.tabs[sh.n]; book.order[book.order.indexOf(sh.n)] = x; sh.n = x; return sh; }, setFrozenRows() {},
    getRange(r, c, nr, nc) { const rg = { setNumberFormat(f) { book.fmt.push([sh.n, r, c, nr, nc, f]); return rg; }, setFontWeight() { return rg; }, setBackground() { return rg; }, insertCheckboxes() { book.cb.push([sh.n, r, c, nr]); return rg; },
      setValues(v) { const rows = book.tabs[sh.n]; v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return rg; } }; return rg; } }; return sh; };
  const first = mkSheet('Sheet1');
  return Object.assign(book, { getId: () => 'baru_' + name, getUrl: () => 'https://sheets.test/' + name, getSheets: () => [first], insertSheet: n => mkSheet(n) });
}
function harness(ssId) {
  const srv = makeServer({ files: SERVER_FILES.concat(['_live_tests/LiveReadiness.gs']) });
  const ss0 = srv.sb.SpreadsheetApp.getActiveSpreadsheet(), books = [];
  srv.sb.SpreadsheetApp.getActiveSpreadsheet = () => Object.assign({}, ss0, { getId: () => ssId, getName: () => 'UJI', getSpreadsheetTimeZone: () => 'UTC' });
  srv.sb.SpreadsheetApp.create = n => { const b = fakeBook(n); books.push(b); return b; };
  srv.sb.DriveApp.getFileById = () => { throw new Error('tidak ada'); };
  srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k === 'LIVE_TEST_SPREADSHEET_ID' ? 'copy1' : null), setProperty: () => {} }) };
  const logs = []; srv.sb.Logger = { log: s => logs.push(String(s)) };
  return { srv, logs, books };
}
const push = (s, n, o) => { const h = s.sheets[n][0]; s.sheets[n].push(h.map(k => o[k] === undefined ? '' : o[k])); };
{ const h = harness(PROD); const r = (() => { try { h.srv.sb.ltBuatLembarCek(); return 'TIDAK_DITOLAK'; } catch (e) { return e.message; } })();
  rec('LC-01', 'ltBuatLembarCek menolak spreadsheet produksi (ltGuard_) dan tidak membuat spreadsheet', /PRODUKSI/.test(r) && h.books.length === 0, r.slice(0, 60)); }
{ const { srv: s, logs, books } = harness('copy1');
  push(s, '01_SISWA', { id: 's9', nama: 'Aisyah Putri Rahma', unit: 'MI', kelas: '2A', status: 'Aktif' });
  const T = (id, st, nom, sid, extra) => push(s, '05_TRANSAKSI', Object.assign({ id, jenis: 'PENERIMAAN', tanggal: '2026-09-10', unit: 'MI', nominal: nom, akunId: 'akun_kas1', status: st, siswaId: sid || '', _komponenHint: 'SPP' }, extra || {}));
  const A = (id, tid, sid, per, nom) => push(s, '06_ALOKASI', { id, transaksiId: tid, siswaId: sid, komponenId: 'kmp_spp', periode: per, nominal: nom });
  T('t_tercatat', 'TERCATAT', 50000, '', { namaPengirim: 'IBU RAHMA', _siswaNamaSnapshot: 'Aisyah Putri' });
  T('t_ident', 'TERIDENTIFIKASI', 70000, 's2');
  T('t_sebagian', 'TERALOKASI', 300000, 's2'); A('a1', 't_sebagian', 's2', 'Juli 2026', 200000);
  T('t_tgl', 'TERALOKASI', 100000, 's2'); A('a2', 't_tgl', 's2', new Date(Date.UTC(2026, 8, 1)), 100000);
  push(s, '15_SETTINGS', { key: 'periodeAktif', value: new Date(Date.UTC(2026, 8, 1)) });
  const before = J(s.sheets), out = s.sb.ltBuatLembarCek(), b = books[0];
  rec('LC-02', 'data salinan tidak berubah (baca-saja) dan spreadsheet BARU dibuat dengan 5 tab', J(s.sheets) === before && books.length === 1 && out.dataAsliDiubah === false && J(b.order) === J(['0_PETUNJUK', '1_TANPA_SISWA', '2_SEBAGIAN', '3_BELUM_DIALOKASI', '4_PERIODE_TANGGAL']), J(b.order));
  const t1 = b.tabs['1_TANPA_SISWA'], t2 = b.tabs['2_SEBAGIAN'], t3 = b.tabs['3_BELUM_DIALOKASI'], t4 = b.tabs['4_PERIODE_TANGGAL'];
  const col = (t, k) => t[0].indexOf(k);
  rec('LC-03', 'tiap masalah masuk tab yang benar (tanpa siswa / sebagian / belum dialokasi)', t1.length === 2 && t1[1][0] === 't_tercatat' && t3.length === 2 && t3[1][0] === 't_ident' && t2.length === 2 && t2[1][0] === 't_sebagian', J([t1.length, t2.length, t3.length]));
  rec('LC-04', 'kandidat siswa disarankan dari nama snapshot/pengirim (saran, bukan diterapkan)', /^s9 \(Aisyah Putri Rahma/.test(t1[1][col(t1, 'Kandidat siswa (SARAN, wajib dicek)')]), t1[1][col(t1, 'Kandidat siswa (SARAN, wajib dicek)')]);
  rec('LC-05', 'periode bertipe tanggal di 06_ALOKASI & periodeAktif 15_SETTINGS terdaftar dengan usulan label "September 2026"',
    t4.length === 3 && t4[1][0] === '15_SETTINGS' && t4[1][9] === 'September 2026' && t4[2][2] === 'a2' && t4[2][9] === 'September 2026' && t4[2][1] === s.sheets['06_ALOKASI'].findIndex(r => r[0] === 'a2') + 1, J(t4.slice(1).map(r => r.slice(0, 10))));
  rec('LC-06', 'sel ditulis sebagai teks (format @) dan kolom "Sudah dicek" berupa kotak centang', b.fmt.some(f => f[0] === '4_PERIODE_TANGGAL' && f[5] === '@') && b.cb.some(c => c[0] === '1_TANPA_SISWA'), J(b.cb));
  rec('LC-07', 'nama siswa/pengirim tidak tercetak ke log', !/Aisyah|RAHMA/.test(logs.join('\n')) && logs.length === 1, logs[0].slice(0, 80)); }
const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
