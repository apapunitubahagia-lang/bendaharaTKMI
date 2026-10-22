/* Suite KPI SERVER vs KLIEN (P1_26; sandbox Node klien <-> server, TIDAK menyentuh Google Sheets / Apps Script).
 * opKpiServer (KpiEngine.gs, salinan VERBATIM fungsi KPI klien) dibandingkan dengan kpiIndukSummary klien pada sheet tiruan yang SAMA.
 * Perbandingan = JSON utuh hasil (6 KPI induk + 31 indikator: realisasi, capaian, status, dimensi, skor, bobot, target, definisi).
 * Data FIXTURE SINTETIS (bukan data sekolah); angka tidak mewakili produksi. Hasil resmi aplikasi TETAP dari klien.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const PER = ['Agustus 2026', 'September 2026', 'Oktober 2026'];
async function boot(s) { const c = makeClient(s); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const push = (s, sheet, o) => { const h = s.sheets[sheet][0]; s.sheets[sheet].push(h.map(k => o[k] === undefined ? '' : o[k])); };
/* fixture SINTETIS kaya: kewajiban beku, penerimaan beralokasi, pengeluaran (lengkap, tanpa penerima, duplikat), RAB disetujui,
   komitmen, bukti, mutasi bank (teridentifikasi, menggantung lama, TEREKONSILIASI), rekonsiliasi (selisih & cocok), laporan */
function kaya() {
  const s = makeServer(); const B = s.sb; B.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  B.opObligationSnapshot('September 2026', {});
  B.opCreateIncome({ tanggal: '2026-09-12', unit: 'MI', nominal: 200000, akunId: 'akun_bank1', metode: 'Transfer', siswaId: 's2', sumber: 'Pembayaran Siswa', clientRequestId: 'fx_in1',
    allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 150000 }] });
  B.opCreateIncome({ tanggal: '2026-08-20', unit: 'MI', nominal: 50000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Lain-lain', clientRequestId: 'fx_in2' });
  const e = p => B.opCreateExpense(Object.assign({ unit: 'MI', akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK' }, p));
  e({ tanggal: '2026-09-15', nominal: 75000, penerima: 'Toko Sinar', clientRequestId: 'fx_ex1' });
  e({ tanggal: '2026-09-15', nominal: 75000, penerima: 'Toko Sinar', clientRequestId: 'fx_ex2' }); // kandidat duplikat
  e({ tanggal: '2026-09-18', nominal: 30000, penerima: 'AB', clientRequestId: 'fx_ex3' }); // penerima < 3 karakter
  e({ tanggal: '2026-10-03', nominal: 40000, penerima: 'Toko Baru', clientRequestId: 'fx_ex4' });
  s.sheets['08_ANGGARAN'][1][s.sheets['08_ANGGARAN'][0].indexOf('status')] = 'DISETUJUI';
  push(s, '08_ANGGARAN', { id: 'ang_okt', periode: 'Oktober 2026', program: 'ATK', kategori: 'ATK', unit: 'MI', nominal: 20000, status: 'DISETUJUI' });
  push(s, '09_KOMITMEN', { id: 'kom_1', uraian: 'Servis printer', nominal: 100000, status: 'COMMITTED', tanggal: '2026-09-10' });
  const tx = s.sheets['05_TRANSAKSI'].slice(1).map(r => r[0]);
  push(s, '10_BUKTI', { id: 'bkt_1', kategori: 'NOTA', transaksiId: tx[tx.length - 4], judul: 'Nota ATK', tanggal: '2026-09-15', driveFileId: 'drv_x', driveFileUrl: 'https://drive.test/x' });
  push(s, '10_BUKTI', { id: 'bkt_2', kategori: 'BUKTI_TRANSFER', transaksiId: 'imp_trx_1', judul: 'Transfer SPP', tanggal: '2026-09-05', driveFileId: 'drv_y', driveFileUrl: 'https://drive.test/y' });
  push(s, '11_MUTASI_BANK', { id: 'mut_1', tanggal: '2026-09-12', nominal: 200000, keterangan: 'SPP', status: 'TEREKONSILIASI', transaksiId: tx[tx.length - 6] });
  push(s, '11_MUTASI_BANK', { id: 'mut_2', tanggal: '2026-09-01', nominal: 90000, keterangan: 'tak dikenal', status: 'BELUM_DIPROSES' });
  push(s, '11_MUTASI_BANK', { id: 'mut_3', tanggal: '2026-09-25', nominal: 15000, keterangan: 'biaya admin', status: 'DIPROSES' });
  push(s, '16_REKONSILIASI', { id: 'rek_1', akunId: 'akun_bank1', periode: 'September 2026', saldoSistem: 200000, saldoAktual: 185000, selisih: -15000, catatan: 'biaya admin bank', status: 'SELESAI', createdAt: '2026-09-30T10:00:00.000Z' });
  push(s, '16_REKONSILIASI', { id: 'rek_2', akunId: 'akun_kas1', periode: 'September 2026', saldoSistem: 0, saldoAktual: 0, selisih: 0, catatan: '', status: 'SELESAI', createdAt: '2026-09-30T11:00:00.000Z' });
  push(s, '17_LAPORAN', { id: 'lap_1', periode: 'Agustus 2026', tanggalDibuat: '2026-09-05', dibuatOleh: 'bendahara@x.id', snapshot: J({ pemasukan: 50000, pengeluaran: 0 }) });
  return s;
}
const bandingkan = (cl, sv) => { const out = []; cl.rows.forEach((r, i) => { const x = sv.rows[i] || {}; (r.indicators || []).forEach((ind, j) => { const y = (x.indicators || [])[j] || {}; Object.keys(Object.assign({}, ind, y)).forEach(k => { if (J(ind[k]) !== J(y[k])) out.push(ind.kode + '.' + k + ': ' + J(ind[k]) + ' vs ' + J(y[k])); }); });
  ['kode', 'skor', 'status', 'jumlahMasalah', 'bobot', 'dataUnavailable'].forEach(k => { if (J(r[k]) !== J(x[k])) out.push(r.kode + '.' + k + ': ' + J(r[k]) + ' vs ' + J(x[k])); }); });
  ['overall', 'overallStatus', 'dataUnavailable'].forEach(k => { if (J(cl[k]) !== J(sv[k])) out.push(k + ': ' + J(cl[k]) + ' vs ' + J(sv[k])); }); return out; };

(async () => {
  { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const c = await boot(s);
    const vmc = require('vm');
    const cliDef = J(vmc.runInContext('INDICATOR_MASTER.map(function(x){return [x.kode,x.parentKpi,x.bobot,x.target,x.measurementType,x.formula]}).concat(KPI_MASTER.map(function(k){return [k.kode,k.bobot,k.active]}))', c.sb));
    const srvDef = J(vmc.runInContext('INDICATOR_MASTER.map(function(x){return [x.kode,x.parentKpi,x.bobot,x.target,x.measurementType,x.formula]}).concat(KPI_MASTER.map(function(k){return [k.kode,k.bobot,k.active]}))', s.sb));
    const n = vmc.runInContext('INDICATOR_MASTER.length', s.sb), nk = vmc.runInContext('KPI_MASTER.length', s.sb);
    rec('KS-01', 'definisi KPI server = klien: 31 indikator + 6 KPI induk (kode, induk, bobot, target, tipe ukur, formula) identik (salinan verbatim; tidak ada definisi baru)', cliDef === srvDef && n === 31 && nk === 6, J({ indikator: n, induk: nk })); }
  for (const [label, mk] of [['fixture dasar', () => { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }], ['fixture sintetis kaya', kaya]]) {
    const s = mk(); const c = await boot(s); const hasil = {};
    PER.forEach(p => { const cl = JSON.parse(J(c.sb.kpiIndukSummary(p))), sv = s.sb.opKpiServer(p); hasil[p] = { ok: sv.ok, beda: sv.ok ? bandingkan(cl, sv.data.summary) : [sv.code], identikPenuh: sv.ok && J(cl) === J(sv.data.summary), overall: [cl.overall, sv.ok && sv.data.summary.overall], indikatorTerukur: cl.rows.reduce((a, r) => a + (r.indicators || []).filter(i => i.activityStatus === 'MEASURED').length, 0) }; });
    rec(label === 'fixture dasar' ? 'KS-02' : 'KS-03', 'diferensial klien vs server (' + label + ', ' + PER.join(' / ') + '): JSON hasil 6 KPI + 31 indikator IDENTIK penuh pada setiap periode',
      PER.every(p => hasil[p].ok && hasil[p].identikPenuh), J(Object.fromEntries(PER.map(p => [p, { identik: hasil[p].identikPenuh, overall: hasil[p].overall, terukur: hasil[p].indikatorTerukur, beda: hasil[p].beda.slice(0, 4) }])))); }
  { const s = kaya(); const c = await boot(s); const sv = s.sb.opKpiServer('September 2026').data.summary;
    const per = sv.rows.map(r => r.kode + ' ' + r.skor + ' ' + r.status + ' [' + r.indicators.map(i => i.kode.slice(-3) + '=' + (i.capaian === null ? '-' : i.capaian) + '/' + i.activityStatus.slice(0, 4)).join(' ') + ']');
    rec('KS-04', 'RINGKASAN (INFO) KPI server fixture sintetis September 2026 per indikator (capaian/activityStatus) - angka fixture, BUKAN produksi', null, J(per)); }
  { const s = kaya(); const h = s.sheets['08_ANGGARAN'][0]; h[h.indexOf('nominal')] = 'nominal_rusak'; const c = await boot(s);
    const cl = c.sb.kpiIndukSummary('September 2026'), sv = s.sb.opKpiServer('September 2026').data;
    rec('KS-05', 'skema tidak cocok (08_ANGGARAN tanpa kolom nominal): server -> DATA TIDAK TERSEDIA, skor null untuk semua KPI (BUKAN 0); sama dengan klien; sumber yang gagal dilaporkan',
      sv.summary.dataUnavailable === true && sv.summary.overall === null && sv.summary.rows.every(r => r.skor === null && r.status === 'DATA TIDAK TERSEDIA') && cl.dataUnavailable === true && sv.sumber.some(x => x.sheet === '08_ANGGARAN' && x.error === 'SCHEMA_MISMATCH'),
      J({ server: sv.summary.overallStatus, klien: cl.overallStatus })); }
  { const s = kaya(); delete s.sheets['11_MUTASI_BANK']; const sv = s.sb.opKpiServer('September 2026').data;
    rec('KS-06', 'sumber gagal dibaca (sheet 11_MUTASI_BANK hilang): DATA TIDAK TERSEDIA, skor null', sv.summary.dataUnavailable && sv.summary.rows.every(r => r.skor === null), sv.summary.overallStatus); }
  { const s = kaya(); const orig = s.sb.opReadSheet; s.sb.opReadSheet = (n, o) => { const r = orig(n, o); if (n === '05_TRANSAKSI' && r.ok) { r.data.rows = r.data.rows.slice(0, 1); r.data.returned = 1; r.data.total = 99; r.data.readStatus = 'PAGE'; } return r; };
    const sv = s.sb.opKpiServer('September 2026').data; s.sb.opReadSheet = orig;
    rec('KS-07', 'pembacaan tidak lengkap (05_TRANSAKSI terbaca 1 dari 99 baris): INCOMPLETE_READ -> DATA TIDAK TERSEDIA, tidak dihitung dari data parsial', sv.summary.dataUnavailable && sv.sumber.some(x => x.key === 'transaksi' && x.error === 'INCOMPLETE_READ'), J(sv.sumber.find(x => x.key === 'transaksi'))); }
  { const s = kaya(); const sv = s.sb.opKpiServer('2026-09').data; const c = await boot(s); const cl = c.sb.kpiIndukSummary('2026-09');
    rec('KS-08', 'periode bukan label bulan ("2026-09"): DATA TIDAK TERSEDIA di server dan klien (aturan kpiPeriodeStatus_ yang sama)', sv.summary.dataUnavailable && cl.dataUnavailable && sv.summary.overall === null, sv.summary.overallStatus); }
  { const s = kaya(); const before = J(s.sheets), o0 = J(s.sb.opObligations({ periode: 'September 2026' }).data.rows);
    const r = s.sb.opKpiServer('September 2026'); const o1 = J(s.sb.opObligations({ periode: 'September 2026' }).data.rows);
    rec('KS-09', 'baca-saja & tanpa efek samping: seluruh sheet identik; shim data dipulihkan (opObligations sesudah = sebelum)', r.ok && J(s.sheets) === before && o0 === o1, r.code); }
  { const s = kaya(); s.state.email = 'auditor@x.id'; const a = s.sb.opKpiServer('September 2026'); s.state.email = ''; const b = s.sb.opKpiServer('September 2026'); s.state.email = 'orang@luar.id'; const c = s.sb.opKpiServer('September 2026');
    rec('KS-10', 'otorisasi: AUDITOR boleh (baca); tanpa sesi -> AUTH_REQUIRED; tidak terdaftar -> USER_NOT_FOUND', a.ok && b.code === 'AUTH_REQUIRED' && c.code === 'USER_NOT_FOUND', J([a.code, b.code, c.code])); }

  { const src = require('fs').readFileSync(require('./srv_env.js').OUT + 'KpiEngine.gs', 'utf8'); const pub = (src.match(/^function ([A-Za-z0-9$]*[A-Za-z0-9$])\s*\(/gm) || []).map(x => x.replace(/^function\s+/, '').replace(/\s*\($/, ''));
    rec('KS-11', 'permukaan publik KpiEngine.gs = hanya opKpiServer (bergerbang); ' + (src.match(/Diprivatkan[^\n]*/) || [''])[0] + '; tidak ada akses tulis (setValues/append/insertSheet)', J(pub) === J(['opKpiServer']) && !/setValues|sgAppend|insertSheet|deleteRow|appendRow/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), J(pub)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
