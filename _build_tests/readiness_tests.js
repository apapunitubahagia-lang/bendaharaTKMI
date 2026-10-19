/* Suite KESIAPAN INTEGRASI LIVE (sandbox Node, TIDAK menyentuh Google Sheets / Apps Script). P1_15.
 * - Menguji harness _live_tests/LiveReadiness.gs di sandbox (pengaman produksi, deteksi perubahan baris & status mutasi).
 *   Lulus di sini TIDAK berarti uji live lulus: harness belum dijalankan di Apps Script.
 * - INFO: permukaan fungsi publik (GAP-005), karakterisasi aturan 62 hari (D-T1), jalur tanggal yang belum divalidasi (D-T4b).
 */
const fs = require('fs');
const { makeServer, SERVER_FILES, OUT } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const safe = f => { try { return f(); } catch (e) { return { threw: String(e && e.message || e) }; } };
const PROD = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
function harnessServer(ssId, propId) {
  const srv = makeServer({ files: SERVER_FILES.concat(['_live_tests/LiveReadiness.gs']) });
  const props = {}; if (propId !== undefined) props.LIVE_TEST_SPREADSHEET_ID = propId;
  const orig = srv.sb.SpreadsheetApp.getActiveSpreadsheet;
  srv.sb.SpreadsheetApp.getActiveSpreadsheet = () => Object.assign({}, orig(), { getId: () => ssId, getName: () => 'SALINAN UJI' });
  srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) };
  srv.sb.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@x.id' });
  return srv;
}
async function bootClient(srv) {
  const c = makeClient(srv); const A = c.a; c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error), 400);
  await tick(5); return c;
}

(async () => {
  // ================= Harness uji live (dijalankan di sandbox) =================
  { const a = safe(() => harnessServer(PROD, PROD).sb.ltPreflight()), b = safe(() => harnessServer('copy123', undefined).sb.ltPreflight()), c = safe(() => harnessServer('copy123', 'copyLain').sb.ltPreflight());
    rec('RD-01', 'pengaman salinan', /PRODUKSI/.test(a.threw || '') && /belum diisi manual/.test(b.threw || '') && /belum diisi manual/.test(c.threw || ''), J({ produksi: a.threw, tanpaKonfirmasi: b.threw && b.threw.slice(0, 60), konfirmasiBeda: !!c.threw })); }
  { const srv = harnessServer('copy123', 'copy123');
    const H = srv.sheets['11_MUTASI_BANK'][0]; ['m1', 'm2', 'm3'].forEach((id, i) => srv.sheets['11_MUTASI_BANK'].push(H.map(h => ({ id, tanggal: '2026-09-0' + (i + 1), nominal: 1000, status: i < 2 ? 'TEREKONSILIASI' : 'BELUM_DIPROSES' })[h] || '')));
    const pre = srv.sb.ltPreflight(), ro = srv.sb.ltReadOnlyChecks(), rj = srv.sb.ltRejectionChecks(), post = srv.sb.ltPostflight();
    rec('RD-02', 'harness alur penuh (sandbox)', pre.mutasi.terekonsiliasi === 2 && pre.identity.authorized && ro.kpiSourcesOk && rj.lulus && post.lulus,
      J({ identitas: pre.identity, baca: ro.kpiSourcesOk, ditolakSemua: rj.lulus, salahAlasan: rj.rejectedForOtherReason, diterima: rj.unexpectedAccepted, pasca: post })); }
  { const srv = harnessServer('copy123', 'copy123');
    srv.sheets['11_MUTASI_BANK'].push(srv.sheets['11_MUTASI_BANK'][0].map(h => ({ id: 'm1', tanggal: '2026-09-01', nominal: 1000, status: 'TEREKONSILIASI' })[h] || ''));
    srv.sb.ltPreflight();
    srv.sheets['05_TRANSAKSI'].push(srv.sheets['05_TRANSAKSI'][1].slice()); // penulisan tak terduga
    srv.sheets['11_MUTASI_BANK'][1][srv.sheets['11_MUTASI_BANK'][0].indexOf('status')] = 'DIPROSES'; // status TEREKONSILIASI berubah
    const post = srv.sb.ltPostflight();
    rec('RD-03', 'harness mendeteksi perubahan', post.lulus === false && post.barisBerubah.some(x => /05_TRANSAKSI/.test(x)) && post.mutasiIdentik === false && J(post.terekonsiliasi) === J([1, 0]), J(post)); }
  { const srv = harnessServer('copy123', 'copy123'); srv.sb.ltPreflight();
    srv.sheets['08_ANGGARAN'][0][srv.sheets['08_ANGGARAN'][0].indexOf('nominal')] = 'rusak';
    const ro = srv.sb.ltReadOnlyChecks();
    rec('RD-04', 'harness T8 pada header rusak', ro.kpiSourcesOk === false && /ERROR:SCHEMA_MISMATCH:nominal/.test(ro.reads['08_ANGGARAN']), ro.reads['08_ANGGARAN']); }

  // ================= GAP-005: permukaan fungsi publik (dapat dipanggil google.script.run) =================
  { const list = [];
    SERVER_FILES.forEach(f => { const s = fs.readFileSync(OUT + f, 'utf8'); const re = /^function ([A-Za-z0-9$]+)\s*\(/gm; let m;
      while ((m = re.exec(s))) { const n = m[1]; if (n.endsWith('_')) continue; let i = s.indexOf('{', m.index), d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } }
        const body = s.slice(i, j); const dlg = (/opEngineWrite_\(/.exec(body) || /\b(opRecordBatch)\(/.exec(body) || [])[1] || (/opEngineWrite_\(/.test(body) ? 'opEngineWrite_' : '');
        list.push({ f, n, body, gate: /opGate_\(|authorizeCurrentUser_\(/.test(body) ? 'gate' : (dlg ? 'delegasi:' + dlg : (/getCurrentUserIdentity\(/.test(body) ? 'identity' : 'none')) }); } });
    // delegasi diterima HANYA bila fungsi tujuan sendiri memanggil opGate_
    const srcAll = SERVER_FILES.map(f => fs.readFileSync(OUT + f, 'utf8')).join('\n');
    const gated = name => { const m = new RegExp('^function ' + name.replace('$', '\\$') + '\\s*\\(', 'm').exec(srcAll); if (!m) return false; const e = srcAll.indexOf('\n}', m.index); return /opGate_\(/.test(srcAll.slice(m.index, e)); };
    list.forEach(x => { if (/^delegasi:/.test(x.gate)) x.gate = gated(x.gate.slice(9)) ? 'gate' : 'none'; });
    const ops = list.filter(x => /^op[A-Z]/.test(x.n)), opsNoGate = ops.filter(x => x.gate !== 'gate'), none = list.filter(x => x.gate === 'none' && !/^op[A-Z]/.test(x.n));
    rec('RD-05', 'GAP-005 setiap op* bergerbang', opsNoGate.length === 0, ops.length + ' fungsi op* publik; tanpa opGate_: ' + J(opsNoGate.map(x => x.n)));
    rec('RD-06', 'GAP-005 permukaan publik (INFO)', null, 'fungsi publik tanpa gerbang (bukan op*): ' + none.map(x => x.f.replace('.gs', '') + '.' + x.n).join(', '));
    const srv = makeServer(); const direct = safe(() => srv.sb.allObligationsAllSiswa());
    rec('RD-07', 'GAP-005 mesin kewajiban dipanggil langsung', !!direct.threw, 'allObligationsAllSiswa() tanpa konteks gated -> ' + (direct.threw ? 'melempar (' + direct.threw.slice(0, 60) + '), tidak membocorkan data' : 'MENGEMBALIKAN DATA')); }

  // ================= D-T1: karakterisasi aturan 62 hari (pengaman sementara P0-T1) =================
  { const srv = makeServer(); const TH = srv.sheets['05_TRANSAKSI'][0];
    const trx = (id, tanggal, unit, nominal, kategori) => srv.sheets['05_TRANSAKSI'].push(TH.map(h => ({ id, jenis: 'PENGELUARAN', tanggal, unit, nominal, akunId: 'akun_bank1', metode: 'Transfer', status: 'TERCATAT', kategori, penerima: 'X' })[h] || ''));
    trx('p_70', '2026-07-27', 'MI', 2000000, 'ATK');      // uang muka 70 hari sebelum LPJ
    trx('p_tk', '2026-09-20', 'TK', 2000000, 'ATK');      // uang muka dicatat unit TK
    trx('p_kat', '2026-09-20', 'MI', 2000000, 'Konsumsi'); // uang muka kategori lain
    trx('legit', '2026-09-25', 'MI', 900000, 'ATK');      // belanja ATK lain yang sah, tidak terkait
    const c = await bootClient(srv);
    const L = (o) => Object.assign({ id: 'lpj_x', tanggal: '2026-10-05', kategori: 'ATK', item: 'nota', nominal: 500000 }, o);
    const cand = (l, unit) => c.sb.lpjDuplicateCandidates_(l, unit).map(t => t.id);
    const res = {
      FN_jendela70hari: cand(L({ kategori: 'ATK' }), 'MI').indexOf('p_70') === -1,
      FN_unitBerbeda: cand(L({}), 'MI').indexOf('p_tk') === -1,
      FN_kategoriBerbeda: cand(L({}), 'MI').indexOf('p_kat') === -1,
      FP_belanjaSahLain: cand(L({}), 'MI').indexOf('legit') !== -1,
      FP_lpjTanpaKategori: cand(L({ kategori: '' }), 'MI').length,
      kandidatLpjMI: cand(L({}), 'MI')
    };
    rec('RD-08', 'D-T1 aturan 62 hari (INFO)', null, J(res) + ' -> false negative: uang muka >62 hari, unit/kategori berbeda; false positive: belanja sah lain dengan kategori/unit sama, LPJ tanpa kategori memblokir lebih luas'); }

  // ================= D-T4b: jalur tanggal yang belum divalidasi =================
  { const s = makeServer(); const code = r => r && r.ok ? (r.data && r.data.results ? r.data.results[0].code : 'OK') : (r && r.code);
    const H = () => s.sheets['01_SISWA'][0];
    const res = {
      'siswa.tanggalMasuk=2026-13-40': code(s.sb.opMasterUpsert('siswa', { nama: 'Uji', unit: 'MI', kelas: '1', tanggalMasuk: '2026-13-40' })),
      'siswa.tanggalKeluar=31/02/2026': code(s.sb.opMasterUpsert('siswa', { nama: 'Uji2', unit: 'MI', kelas: '1', tanggalKeluar: '31/02/2026' })),
      'tahunAjaran.label=2026/2028': code(s.sb.opMasterUpsert('tahunAjaran', { label: '2026/2028' })),
      'dupReview.decidedAt=2026-13-40': code(s.sb.opRecordBatch('dupReview', [{ op: 'upsert', id: 'dup_x1', row: { pairKey: 'a|b', status: 'RESOLVED', decidedAt: '2026-13-40' } }])),
      'kpi.computedAt=kemarin': code(s.sb.opRecordBatch('kpi', [{ op: 'upsert', id: 'kpi_x1', row: { periode: 'Oktober 2026', kpiKode: 'BDS01', computedAt: 'kemarin' } }])),
      'lpj.importDate=abc': code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_x9', row: { tanggal: '2026-10-01', nominal: 1, status: 'REALIZATION', importDate: 'abc' } }]))
    };
    const stored = s.sheets['01_SISWA'].slice(-2).map(r => [r[H().indexOf('tanggalMasuk')], r[H().indexOf('tanggalKeluar')]]);
    rec('RD-09', 'D-T4b jalur tanggal belum divalidasi (INFO)', null, J(res) + ' tersimpan siswa: ' + J(stored));
    // dampak: tanggalMasuk tidak sah membuat pembatasan periode kewajiban diabaikan (enumeratePeriodesBulanan: !isNaN(new Date(...)))
    const c = await bootClient(makeServer());
    const base = { id: 'sx', unit: 'MI', kelas: '1', tahunAjaran: '2026/2027', status: 'Aktif' };
    const per = t => c.sb.enumeratePeriodesBulanan(Object.assign({}, base, { tanggalMasuk: t })).join(',') || '(kosong)';
    rec('RD-10', 'D-T4b dampak tanggalMasuk (INFO)', null, 'periode kewajiban bulanan s.d. periode aktif: tanpa tanggalMasuk [' + per('') + '] | masuk 2026-08-01 [' + per('2026-08-01') + '] | masuk "2026-13-40" [' + per('2026-13-40') + '] | masuk "2026-02-30" [' + per('2026-02-30') + '] -> tanggal tidak sah diperlakukan seperti tanpa tanggal masuk (pembatasan hilang; tagihan bisa bertambah)'); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
