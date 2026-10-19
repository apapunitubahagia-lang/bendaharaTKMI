/* Suite P0 HARDENING (sandbox Node, TIDAK menyentuh Google Sheets): T8 (skema/data parsial), T4 (tanggal), T7 (peran),
 * T1 (pengaman tombol LPJ). Status: PASS / FAIL / INFO. Integrasi live Apps Script + Google Sheets BELUM dijalankan.
 * Label kedua = temuan (P1_13) / GAP / test case dokumen 07.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const FINAL = require('./fixtures/headers_backend.json').FINAL;
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const rows = (srv, n) => srv.sheets[n].slice(1);
const cnt = (srv, n) => srv.sheets[n].length - 1;
const safe = f => { try { return f(); } catch (e) { return { ok: false, code: 'EXCEPTION', message: String(e && e.message || e) }; } };
const J = o => JSON.stringify(o);
const code = r => (r && r.ok ? (r.data && r.data.results ? r.data.results[0].code : 'OK') : (r && r.code));
let seq = 0; const nid = p => (p || 'hd') + '_' + (++seq);
async function bootClient(srv, opts) {
  const c = makeClient(srv, opts); const A = c.a;
  c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && (!A.CentralAuth.authorized || Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error)), 400);
  await tick(5); return c;
}
const sync = async c => { await c.sb.centralRunSync(true); await tick(10); await c.sb.centralRunSync(true); await tick(10); };
const renameCol = (srv, n, h) => { srv.sheets[n][0][col(srv, n, h)] = 'rusak_' + h; };

(async () => {
  // ======================= T8: skema & data parsial =======================
  const READ_SHEETS = ['04_KEWAJIBAN', '05_TRANSAKSI', '06_ALOKASI', '08_ANGGARAN', '09_KOMITMEN', '10_BUKTI', '11_MUTASI_BANK', '12_DUP_REVIEW', '13_AUDIT_LOG', '14_KPI', '16_REKONSILIASI', '17_LAPORAN', '18_RKAT', '19_LPJ', '30_ALOKASI_PENGELUARAN'];
  { const out = {}, bad = [];
    READ_SHEETS.forEach(n => {
      const srv = makeServer();
      if (n === '30_ALOKASI_PENGELUARAN') srv.sheets[n] = [['id', 'transaksiId', 'anggaranId', 'nominal']];
      const req = srv.sb.opReadRequired_(n);
      if (!req.length) { bad.push(n + ':tanpa kolom wajib'); return; }
      renameCol(srv, n, req[req.length - 1]);
      const r = srv.sb.opReadSheet(n, {});
      out[n] = r.code + (r.missing ? ':' + r.missing.join(',') : '');
      if (r.ok || r.code !== 'SCHEMA_MISMATCH' || J(r.missing) !== J([req[req.length - 1]])) bad.push(n);
    });
    rec('HD-T8-01', 'T8 / GAP-002 / TC-HDR-07', bad.length === 0, bad.length ? 'gagal: ' + bad.join(', ') : 'kolom wajib hilang -> ERROR SCHEMA_MISMATCH + daftar kolom di ' + READ_SHEETS.length + ' sheet baca: ' + J(out)); }
  { const srv = makeServer(); srv.sheets['08_ANGGARAN'][0].push('nominal'); // kolom wajib ganda
    const r = srv.sb.opReadSheet('08_ANGGARAN', {});
    rec('HD-T8-02', 'T8 / TC-HDR-03', !r.ok && r.code === 'SCHEMA_MISMATCH' && /ganda/.test(r.message), r.code + ' ' + r.message); }
  { const srv = makeServer(); const r30 = srv.sb.opReadSheet('30_ALOKASI_PENGELUARAN', {});
    delete srv.sheets['19_LPJ']; const r19 = srv.sb.opReadSheet('19_LPJ', {});
    srv.sheets['17_LAPORAN'] = [[]]; const rEmptyHdr = srv.sb.opReadSheet('17_LAPORAN', {});
    rec('HD-T8-03', 'T8 sheet tidak tersedia', r30.ok && r30.data.readStatus === 'COMPLETE' && r30.data.sheetMissing === true && !r19.ok && r19.code === 'SCHEMA_MISMATCH' && !rEmptyHdr.ok && rEmptyHdr.code === 'SCHEMA_MISMATCH',
      J({ opsional30: [r30.code, r30.data && r30.data.readStatus], lpjHilang: r19.code, headerKosong: rEmptyHdr.code })); }
  { const srv = makeServer(); // data kosong yang sah: header lengkap, nol baris
    const r = srv.sb.opReadSheet('09_KOMITMEN', {}), rp = srv.sb.opReadSheet('05_TRANSAKSI', { offset: 0, limit: 1 });
    const c = await bootClient(srv); const k = c.sb.kpiIndukSummary('September 2026');
    rec('HD-T8-04', 'T8 data kosong sah', r.ok && r.data.readStatus === 'COMPLETE' && r.data.total === 0 && rp.ok && rp.data.readStatus === 'PAGE' && k.overall !== null,
      'komitmen 0 baris = COMPLETE; halaman parsial = PAGE; KPI tetap dihitung (overall ' + k.overall + ')'); }
  { const srv = makeServer(); const orig = srv.sb.ss_;
    srv.sb.ss_ = () => { const ss = orig(); return { getSheetByName: n => { const sh = ss.getSheetByName(n); if (!sh || n !== '11_MUTASI_BANK') return sh; return Object.assign({}, sh, { getLastRow: sh.getLastRow, getLastColumn: sh.getLastColumn, getRange: (r, c1, nr, nc) => { if (r >= 2) throw new Error('simulasi gagal baca'); return sh.getRange(r, c1, nr, nc); } }); } }; };
    srv.sheets['11_MUTASI_BANK'].push(['m1', '2026-09-05', 1000, 'x', '', '', 'BELUM_DIPROSES', '']);
    const r = srv.sb.opReadSheet('11_MUTASI_BANK', {});
    rec('HD-T8-05', 'T8 kegagalan baca', !r.ok && r.code === 'READ_FAILED', 'getValues baris data melempar -> ' + r.code + ' (bukan OK kosong, bukan SCHEMA_MISMATCH)'); }
  { // klien: halaman kosong sebelum total tercapai / total berubah antar-halaman -> PARTIAL_READ, KPI tidak dihitung
    const mk = mode => { const srv = makeServer(); const orig = srv.sb.opReadSheet;
      srv.sb.opReadSheet = (n, o) => { const r = orig(n, o); if (n !== '05_TRANSAKSI' || !r.ok) return r;
        const d = JSON.parse(JSON.stringify(r));
        if (mode === 'empty') { d.data.total = d.data.total + 5; }
        if (mode === 'shift') { d.data.total = d.data.total + (o && o.offset ? 1 : 0); d.data.rows = d.data.rows.slice(0, 1); d.data.returned = 1; }
        return d; };
      return srv; };
    const res = {};
    for (const m of ['empty', 'shift']) { const c = await bootClient(mk(m)); const st = c.a.OperationalCache.states.transaksi; res[m] = { error: st.error, kpi: c.sb.kpiIndukSummary('September 2026').overall }; }
    rec('HD-T8-06', 'T8 data parsial klien', res.empty.error === 'PARTIAL_READ' && res.shift.error === 'PARTIAL_READ' && res.empty.kpi === null && res.shift.kpi === null, J(res)); }
  { // dampak KPI: kolom wajib hilang pada 30/08/11 -> DATA TIDAK TERSEDIA (sebelum P0-T8: KPI tetap dihitung, AU-S30-03/05)
    const out = {};
    for (const [n, h] of [['30_ALOKASI_PENGELUARAN', 'anggaranId'], ['08_ANGGARAN', 'nominal'], ['11_MUTASI_BANK', 'tanggal']]) {
      const srv = makeServer(); if (n === '30_ALOKASI_PENGELUARAN') srv.sheets[n] = [['id', 'transaksiId', 'nominal']]; else renameCol(srv, n, h);
      const c = await bootClient(srv); const k = c.sb.kpiIndukSummary('September 2026');
      out[n] = { overall: k.overall, alasan: k.overallStatus.indexOf(n) !== -1 };
    }
    rec('HD-T8-07', 'T8 dampak KPI / TC-HDR-07', Object.keys(out).every(n => out[n].overall === null && out[n].alasan), J(out)); }
  { // tampilan non-KPI saat 08_ANGGARAN rusak: ringkasan N/A, laporan diberi banner, ekspor diblokir; data transaksi tetap tampil
    const srv = makeServer(); renameCol(srv, '08_ANGGARAN', 'nominal');
    const c = await bootClient(srv); const A = c.a;
    const b = String(c.sb.renderBeranda() || '');
    A.State.page = 'laporan'; A.State.laporanTab = 'anggaran'; const lap = String(c.sb.renderLaporan() || '');
    let exported = 0; const oX = c.sb.downloadXLSX; c.sb.downloadXLSX = () => { exported++; };
    const ex = c.sb.exportAnggaranReport('xlsx');
    A.State.laporanTab = 'kontrol'; const fcc = String(c.sb.renderLaporan() || '');
    A.State.laporanTab = 'kas'; const kas = String(c.sb.renderLaporan() || '');
    rec('HD-T8-08', 'T8 tampilan & ekspor', /Realisasi RAB Bulanan[\s\S]*DATA TIDAK TERSEDIA/.test(b) && /Saldo Sekolah/.test(b) && /N\/A/.test(b) && /DATA TIDAK LENGKAP/.test(lap) && exported === 0 && /Kontrol Keuangan[\s\S]*DATA TIDAK TERSEDIA/.test(fcc) && !/DATA TIDAK LENGKAP/.test(kas),
      J({ kartuRAB: /DATA TIDAK TERSEDIA/.test(b), tileSaldoTetap: /Saldo Sekolah/.test(b), tindakanNA: /N\/A/.test(b), laporanBanner: /DATA TIDAK LENGKAP/.test(lap), eksporTerunduh: exported, fcc: /DATA TIDAK TERSEDIA/.test(fcc), laporanKasNormal: !/DATA TIDAK LENGKAP/.test(kas) }));
    c.sb.downloadXLSX = oX; }
  { // kondisi normal: tidak ada banner/N/A, ekspor berjalan
    const srv = makeServer(); const c = await bootClient(srv); const A = c.a;
    const b = String(c.sb.renderBeranda() || '');
    let exported = 0; c.sb.downloadXLSX = () => { exported++; };
    A.State.page = 'laporan'; A.State.laporanTab = 'anggaran'; const lap = String(c.sb.renderLaporan() || ''); c.sb.exportAnggaranReport('xlsx');
    rec('HD-T8-09', 'T8 regresi kondisi normal', !/DATA TIDAK TERSEDIA|DATA TIDAK LENGKAP|>N\/A</.test(b + lap) && exported === 1, J({ banner: /DATA TIDAK/.test(b + lap), exported })); }
  { // header FINAL: tidak ada sheet baca yang terblokir oleh daftar kolom wajib baru
    const srv = makeServer(); const blocked = [];
    READ_SHEETS.forEach(n => { if (!FINAL[n]) return; srv.sheets[n] = [FINAL[n].slice()]; const r = srv.sb.opReadSheet(n, {}); if (!r.ok) blocked.push(n + ':' + r.code + ':' + (r.missing || []).join(',')); });
    rec('HD-T8-10', 'T8 kompatibilitas header FINAL', blocked.length === 0, blocked.length ? 'terblokir: ' + blocked.join(' | ') : 'semua sheet baca dengan header FINAL tetap terbaca (30 tidak ada di FINAL = opsional)'); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
