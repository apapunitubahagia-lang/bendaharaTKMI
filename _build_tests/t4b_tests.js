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

  // ---------- F7 ----------
  { const srv = makeServer(); const up = (rec, id) => srv.sb.opMasterUpsert('siswa', rec, id);
    const a = up({ nama: 'Uji A', unit: 'MI', kelas: '1', tanggalMasuk: '05/09/2026' }, 'siswa_ujiA1');
    const b = up({ nama: 'Uji B', unit: 'MI', kelas: '1', tanggalMasuk: '2026-02-30' }, 'siswa_ujiB1');
    const c = up({ nama: 'Uji C', unit: 'MI', kelas: '1', tanggalMasuk: '2026-09-05', tanggalKeluar: '2026-08-01' }, 'siswa_ujiC1');
    const d = up({ nama: 'Uji D', unit: 'MI', kelas: '1', tanggalMasuk: '2026-09-05', jenisKelamin: 'L' }, 'siswa_ujiD1');
    const row = srv.sheets['01_SISWA'].find(r => r[0] === 'siswa_ujiD1'), H = srv.sheets['01_SISWA'][0];
    rec('T4B-12', 'F7 server: tanggal siswa divalidasi (format, kalender, urutan)', a.code === 'VALIDATION_ERROR' && b.code === 'VALIDATION_ERROR' && c.code === 'VALIDATION_ERROR' && d.ok, [a.code, b.code, c.code, d.code].join(','));
    rec('T4B-13', 'F7 server: tanggalMasuk & jenisKelamin tersimpan', row && row[H.indexOf('tanggalMasuk')] === '2026-09-05' && row[H.indexOf('jenisKelamin')] === 'L', J(row));
    srv.sheets['01_SISWA'][1][H.indexOf('tanggalMasuk')] = '01/07/2020'; // data historis tidak sah
    const e = up({ id: 's1', kontakWali: '0812' });
    rec('T4B-14', 'F7 data historis tidak sah tidak memblokir perubahan field lain (tidak diperiksa ulang/dikoreksi)', e.ok && srv.sheets['01_SISWA'][1][H.indexOf('tanggalMasuk')] === '01/07/2020', e.code); }
  { const srv = makeServer(); const c = await boot(srv);
    c.a.State.importSession = { type: 'siswa', step: 'map', headers: ['namaSiswa', 'unit', 'kelas', 'tanggalMasuk', 'jenisKelamin'], rows: [{ namaSiswa: 'Siswa F7', unit: 'MI', kelas: '1', tanggalMasuk: '2026-09-05', jenisKelamin: 'P' }], headerMap: { namaSiswa: 'namaSiswa', unit: 'unit', kelas: 'kelas', tanggalMasuk: 'tanggalMasuk', jenisKelamin: 'jenisKelamin' }, results: null, batchId: 'b_s', rawFiles: [{ name: 's.csv' }] };
    c.sb.importWizardProceedToPreview(); c.sb.importWizardConfirmSiswa(false); for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); }
    const H = srv.sheets['01_SISWA'][0], r = srv.sheets['01_SISWA'].find(x => x[H.indexOf('nama')] === 'Siswa F7');
    rec('T4B-15', 'F7 klien: antrean master membawa tanggalMasuk & jenisKelamin', r && r[H.indexOf('tanggalMasuk')] === '2026-09-05' && r[H.indexOf('jenisKelamin')] === 'P', J(r)); }
  { // dampak kewajiban: tanggalMasuk menentukan bulan pertama kewajiban Bulanan
    const srv = makeServer(); srv.sb.opMasterUpsert('siswa', { nama: 'Masuk Sept', unit: 'MI', kelas: 'Madinah', tahunAjaran: '2026/2027', tanggalMasuk: '2026-09-05' }, 'siswa_sept1');
    srv.sb.opMasterUpsert('siswa', { nama: 'Tanpa Tgl', unit: 'MI', kelas: 'Madinah', tahunAjaran: '2026/2027' }, 'siswa_tanpa1');
    const per = id => (srv.sb.opObligations({ siswaId: id }).data.rows || []).filter(r => r.komponenId === 'kmp_spp').map(r => r.periode);
    const a = per('siswa_sept1'), b = per('siswa_tanpa1');
    rec('T4B-16', 'F7 dampak kewajiban: tanggalMasuk 2026-09-05 -> SPP mulai September 2026', a.length && a[0] === 'September 2026' && b[0] === 'Juli 2026' && b.length === a.length + 2, 'dengan tanggal ' + J(a) + ' | tanpa tanggal ' + J(b));
    setPA(srv, '2026-10-01');
    rec('T4B-17', 'F8 dampak kewajiban server saat periodeAktif tidak valid (TEMUAN)', null, 'periodeAktif "2026-10-01" -> SPP siswa tanpa tanggal: ' + J(per('siswa_tanpa1')) + ' (enumerasi berhenti karena label tidak dikenal; KPI kini gagal tertutup, tampilan kewajiban belum)'); }
  { const srv = makeServer(); const H = srv.sheets['01_SISWA'][0];
    srv.sheets['01_SISWA'][1][H.indexOf('jenisKelamin')] = 'L'; srv.sheets['01_SISWA'][2][H.indexOf('jenisKelamin')] = 'Perempuan';
    srv.sheets['01_SISWA'][1][H.indexOf('nisn')] = '0012345678'; srv.sheets['01_SISWA'][2][H.indexOf('tanggalMasuk')] = '31/02/2026';
    const before = J(srv.sheets['01_SISWA']); const r = srv.sb.opSiswaMasterAudit();
    rec('T4B-18', 'D-IMP-8 audit master siswa read-only (distribusi, tanpa normalisasi)', r.ok && J(srv.sheets['01_SISWA']) === before && r.data.jenisKelamin.L === 1 && r.data.jenisKelamin.Perempuan === 1 && r.data.nisn.digit10 === 1 && r.data.tanggalMasuk.tidakSah === 1,
      J({ jk: r.data.jenisKelamin, nisn: r.data.nisn.digit10 + '/10digit', tm: r.data.tanggalMasuk, kelas: r.data.kelasPerUnit })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
