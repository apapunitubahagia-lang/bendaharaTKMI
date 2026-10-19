/* Suite D-T4b (sandbox Node, TIDAK menyentuh Google Sheets): F8 gerbang periodeAktif KPI + normalisasi eksplisit,
 * F7 kolom siswa (tanggalMasuk/tanggalKeluar/jenisKelamin) + audit master siswa (D-IMP-8).
 * KPI-DIFF: KPI dihitung dengan build dasar 25d258b (git) dan build sekarang pada data yang sama -> harus identik.
 */
const cp = require('child_process');
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
async function boot(srv, opts) { const c = makeClient(srv, opts); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const setPA = (srv, v) => { const i = srv.sheets['15_SETTINGS'].findIndex(r => r[0] === 'periodeAktif'); srv.sheets['15_SETTINGS'][i][1] = v; };
const auditAksi = srv => srv.sheets['13_AUDIT_LOG'].slice(1).map(r => r[2]);
const BASE = '25d258b';
let baseJs = null;
try { const h = cp.execSync('git show ' + BASE + ':Bendahara_V2.html', { cwd: __dirname + '/..', encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r/g, ''); baseJs = h.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1]; } catch (e) { baseJs = null; }
const kpiShape = k => ({ periode: k.periode, overall: k.overall, overallStatus: k.overallStatus, rows: k.rows.map(r => ({ kode: r.kode, skor: r.skor, status: r.status, bobot: r.bobot, ind: (r.indicators || []).map(i => [i.kode, i.bobot, i.capaian, i.activityStatus, i.target]) })) });

(async () => {
  // ---------- F8 ----------
  { const srv = makeServer(); setPA(srv, '2026-10-01'); const c = await boot(srv); const k = c.sb.kpiIndukSummary();
    rec('T4B-01', 'F8 periodeAktif tanggal -> KPI DATA TIDAK TERSEDIA', k.overall === null && k.dataUnavailable === true && /periode aktif tidak valid/.test(k.overallStatus) && k.rows.every(r => r.skor === null),
      'periode ' + J(k.periode) + ' -> overall ' + J(k.overall) + ', status ' + J(String(k.overallStatus).slice(0, 90)));
    const r1 = c.sb.kpiRow('BDS01');
    rec('T4B-02', 'F8 kpiRow juga gagal tertutup', r1.skor === null && r1.dataUnavailable === true, J({ skor: r1.skor, status: r1.status })); }
  { const srv = makeServer(); setPA(srv, ''); const c = await boot(srv); const k = c.sb.kpiIndukSummary('');
    rec('T4B-03', 'F8 periode kosong -> DATA TIDAK TERSEDIA', k.overall === null && k.dataUnavailable === true, J(k.overallStatus).slice(0, 80)); }
  { const srv = makeServer(); const c = await boot(srv); const k = c.sb.kpiIndukSummary();
    rec('T4B-04', 'F8 periode sah tetap dihitung', k.dataUnavailable !== true && k.periode === 'September 2026' && k.rows.some(r => r.skor !== null), 'overall ' + k.overall + ' (' + k.overallStatus + ')'); }
  { // KPI-DIFF: formula/bobot tidak berubah (build dasar vs build sekarang, data sama)
    if (!baseJs) rec('T4B-05', 'KPI-DIFF terhadap ' + BASE, null, 'git tidak tersedia; dilewati');
    else {
      const out = [];
      for (const per of ['September 2026', 'Oktober 2026', 'Agustus 2026']) {
        const s1 = makeServer(), s2 = makeServer(); const a = await boot(s1, { js: baseJs }), b = await boot(s2);
        const ka = kpiShape(a.sb.kpiIndukSummary(per)), kb = kpiShape(b.sb.kpiIndukSummary(per));
        out.push({ per, sama: J(ka) === J(kb), overall: kb.overall, nInd: kb.rows.reduce((s, r) => s + r.ind.length, 0) });
      }
      rec('T4B-05', 'KPI-DIFF build ' + BASE + ' vs sekarang (skor, bobot, target, capaian 31 indikator)', out.every(o => o.sama && o.nInd === 31), J(out));
    } }
  { const srv = makeServer(); setPA(srv, '2026-10-01');
    const p = srv.sb.opPeriodeAktifPlan();
    rec('T4B-06', 'F8 pratinjau normalisasi read-only', p.ok && p.data.perluNormalisasi && p.data.usulan === 'Oktober 2026' && srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] === '2026-10-01', J(p.data));
    const n0 = srv.sheets['13_AUDIT_LOG'].length;
    const r0 = srv.sb.opPeriodeAktifApply({ nilaiSekarang: '2026-10-01', nilaiBaru: 'Oktober 2026' });
    const r1 = srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: '2026-09-01', nilaiBaru: 'Oktober 2026' });
    const r2 = srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: '2026-10-01', nilaiBaru: '2026-10' });
    rec('T4B-07', 'F8 terapkan wajib konfirmasi, nilai yang dilihat sama, label sah', r0.code === 'CONFIRM_REQUIRED' && r1.code === 'CONFLICT' && r2.code === 'VALIDATION_ERROR' && srv.sheets['13_AUDIT_LOG'].length === n0, [r0.code, r1.code, r2.code].join(','));
    const r3 = srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: '2026-10-01', nilaiBaru: 'Oktober 2026' });
    const r4 = srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: 'Oktober 2026', nilaiBaru: 'Oktober 2026' });
    const ak = auditAksi(srv);
    rec('T4B-08', 'F8 terapkan beraudit, ulang = tidak berubah', r3.ok && srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] === 'Oktober 2026' && ak.includes('PERIODE_AKTIF_DINORMALISASI') && r4.ok && r4.data.unchanged === true, J(r3.data) + ' / ulang ' + J(r4.data));
    srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] = '2026-10-01'; srv.state.failSetValuesOn = '13_AUDIT_LOG';
    const r5 = srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: '2026-10-01', nilaiBaru: 'Oktober 2026' });
    rec('T4B-09', 'F8 audit gagal -> nilai dipulihkan', r5.code === 'AUDIT_FAILED' && srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] === '2026-10-01', r5.code);
    srv.state.email = 'auditor@x.id';
    rec('T4B-10', 'F8 AUDITOR tidak dapat menerapkan', srv.sb.opPeriodeAktifApply({ confirm: 'NORMALISASI_PERIODE_AKTIF', nilaiSekarang: '2026-10-01', nilaiBaru: 'Oktober 2026' }).code === 'ROLE_NOT_ALLOWED', 'ROLE_NOT_ALLOWED'); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = srv.sheets['13_AUDIT_LOG'].length; setPA(srv, '2026-10-01');
    rec('T4B-11', 'F8 tidak ada migrasi otomatis saat boot', (await boot(srv)) && srv.sheets['15_SETTINGS'].find(r => r[0] === 'periodeAktif')[1] === '2026-10-01' && !auditAksi(srv).includes('PERIODE_AKTIF_DINORMALISASI'), 'nilai tetap 2026-10-01 setelah boot ulang'); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
