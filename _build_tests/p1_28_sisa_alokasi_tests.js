/* Suite harness P1_28 (sandbox Node; TIDAK menyentuh Google Sheets / Apps Script): ltSisaAlokasi (baca-saja). */
const { makeServer, SERVER_FILES } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const PROD = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
function harness(ssId) {
  const srv = makeServer({ files: SERVER_FILES.concat(['_live_tests/LiveReadiness.gs']) });
  const ss0 = srv.sb.SpreadsheetApp.getActiveSpreadsheet();
  srv.sb.SpreadsheetApp.getActiveSpreadsheet = () => Object.assign({}, ss0, { getId: () => ssId, getName: () => 'UJI' });
  srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k === 'LIVE_TEST_SPREADSHEET_ID' ? 'copy1' : null), setProperty: () => {} }) };
  const logs = []; srv.sb.Logger = { log: s => logs.push(String(s)) };
  return { srv, logs };
}
const push = (s, n, o) => { const h = s.sheets[n][0]; s.sheets[n].push(h.map(k => o[k] === undefined ? '' : o[k])); };
{ const r = (() => { try { harness(PROD).srv.sb.ltSisaAlokasi(); return 'TIDAK_DITOLAK'; } catch (e) { return e.message; } })();
  rec('SA-01', 'ltSisaAlokasi menolak spreadsheet produksi (ltGuard_)', /PRODUKSI/.test(r), r.slice(0, 60)); }
{ const { srv: s, logs } = harness('copy1');
  const T = (id, st, nom, sid) => push(s, '05_TRANSAKSI', { id, jenis: 'PENERIMAAN', tanggal: '2026-09-10', unit: 'MI', nominal: nom, akunId: 'akun_kas1', status: st, siswaId: sid || '', _komponenHint: 'SPP', _siswaNamaSnapshot: 'NAMA_RAHASIA' });
  const A = (id, tid, sid, per, nom) => push(s, '06_ALOKASI', { id, transaksiId: tid, siswaId: sid, komponenId: 'kmp_spp', periode: per, nominal: nom });
  T('t_tercatat', 'TERCATAT', 50000);                       // tanpa siswa
  T('t_ident', 'TERIDENTIFIKASI', 70000, 's2');             // siswa dikenal, belum dialokasi
  T('t_hantu', 'TERIDENTIFIKASI', 10000, 's_hilang');       // siswa tidak dikenal
  T('t_sebagian', 'TERALOKASI', 300000, 's2'); A('a1', 't_sebagian', 's2', 'Juli 2026', 200000); // tersimpan TERALOKASI padahal sisa 100rb & s2 masih punya tagihan
  T('t_lebih', 'TERALOKASI', 100000, 's2'); A('a2', 't_lebih', 's2', 'Agustus 2026', 150000);
  const before = J(s.sheets), out = s.sb.ltSisaAlokasi(), by = Object.fromEntries(out.baris.map(b => [b.id, b]));
  rec('SA-02', 'alasan per transaksi: TANPA_SISWA / BELUM_DIALOKASI / SISWA_TIDAK_DIKENAL / SISA_ADA_TAGIHAN / ALOKASI_MELEBIHI',
    by.t_tercatat.alasan === 'TANPA_SISWA' && by.t_ident.alasan === 'BELUM_DIALOKASI' && by.t_hantu.alasan === 'SISWA_TIDAK_DIKENAL' && by.t_sebagian.alasan === 'SISA_ADA_TAGIHAN' && by.t_lebih.alasan === 'ALOKASI_MELEBIHI',
    J(out.baris.map(b => b.id + ':' + b.alasan)));
  rec('SA-03', 'status tersimpan vs hitung dilaporkan (TERALOKASI -> SEBAGIAN_TERALOKASI terdeteksi), tagihan terbuka s2 dirinci per komponen',
    out.tersimpanVsHitung['TERALOKASI -> SEBAGIAN_TERALOKASI'] === 1 && by.t_sebagian.tagihanTerbuka[0].tagihan.total > 0 && out.konteksKewajiban === 'OK', J({ v: out.tersimpanVsHitung, tb: by.t_sebagian.tagihanTerbuka }));
  rec('SA-04', 'baca-saja (sheet identik) dan nama siswa/pengirim tidak tercetak di log', J(s.sheets) === before && !logs.join('\n').includes('NAMA_RAHASIA') && logs[0].startsWith('ltSisaAlokasi RINGKASAN'), logs.length + ' baris log'); }
const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
