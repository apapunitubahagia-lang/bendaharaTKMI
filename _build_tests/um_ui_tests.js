/* Suite PROTOTIPE UI UANG MUKA BACA-SAJA (P1_24 D-T1; sandbox Node klien <-> server, TIDAK menyentuh Google Sheets / Apps Script).
 * Skenario: um A cair 2.000.000 (20-09), LPJ 1.000.000 DIVERIFIKASI (bendera verifikasi dinyalakan di sandbox saja) + LPJ 700.000 DITERIMA;
 *           um B cair 500.000 (21-09) -> DIBATALKAN -> pengembalian 200.000 (tertaut um B).
 * Operasi tulis uang muka TIDAK diekspos di bridge; data disiapkan langsung lewat fungsi server (seperti uji server).
 * FCC/BDS03/31 KPI tidak diubah: "sekarang" = opFinancialControl; simulasi basis beban hanya ditampilkan.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const { makeClient, bridgeNames } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const as = (s, email, fn) => { const e0 = s.state.email; s.state.email = email; try { return fn(); } finally { s.state.email = e0; } };
function srvBaru(setup) {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  s.sheets['26_USER_ACCESS'].push(['U3', 'kepala@x.id', 'K', 'KEPALA_SEKOLAH', 'MI', 'ACTIVE', '', '']);
  if (setup) s.sb.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ');
  return s;
}
function skenario(s) {
  s.sb.UM_VERIFIKASI_AKTIF_ = true; // sandbox saja (verifikasi operasional tetap NONAKTIF di kode)
  const a = s.sb.opUangMukaCair({ kegiatan: 'Lomba 17an', pelaksana: 'Pak Ahmad', nominal: 2000000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'cA' }).data.id;
  const b = s.sb.opUangMukaCair({ kegiatan: 'Studi banding', pelaksana: 'Bu Siti', nominal: 500000, tanggal: '2026-09-21', unit: 'MI', akunId: 'akun_kas1', kategori: 'ATK', clientRequestId: 'cB' }).data.id;
  const lpj = (id, nominal, tgl) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id, row: { tanggal: tgl, unit: 'MI', kategori: 'ATK', item: 'Nota ' + id, nominal, status: 'REALIZATION' } }]);
  lpj('lpj_v', 1000000, '2026-09-25'); lpj('lpj_t', 700000, '2026-09-26');
  s.sb.opLpjAjukan({ lpjId: 'lpj_v', tanggalNota: '2026-09-25', uangMukaId: a }); s.sb.opLpjTerima({ lpjId: 'lpj_v' });
  as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_v', hasil: 'DIVERIFIKASI' }));
  s.sb.opLpjAjukan({ lpjId: 'lpj_t', tanggalNota: '2026-09-26', uangMukaId: a }); s.sb.opLpjTerima({ lpjId: 'lpj_t' });
  s.sb.opUangMukaBatal({ uangMukaId: b, alasan: 'Kegiatan dibatalkan oleh sekolah' });
  const k = s.sb.opUangMukaKembali({ uangMukaId: b, nominal: 200000, tanggal: '2026-09-28', clientRequestId: 'kB' });
  s.sb.UM_VERIFIKASI_AKTIF_ = false;
  return { a, b, kembaliTrx: k.data.transaksiId };
}
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const modal = c => String(c.el('modalBody').innerHTML || '');
const baris = (html, id) => { const i = html.indexOf('data-um="' + id + '"'); return i === -1 ? '' : html.slice(i, html.indexOf('</tr>', i)); };
const rp = n => 'Rp ' + Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });

(async () => {
  { const srv = makeServer(); const baca = ['opUangMukaLaporan', 'opUangMukaDampakFcc'], tulis = ['opUangMukaCair', 'opUangMukaKembali', 'opUangMukaBatal', 'opLpjAjukan', 'opLpjTerima', 'opLpjVerifikasi'];
    rec('UI-01', 'kontrak bridge: hanya opUangMukaLaporan & opUangMukaDampakFcc (baca) yang ditambahkan; operasi tulis uang muka & verifikasi TIDAK diekspos',
      baca.every(n => bridgeNames.includes(n) && typeof srv.sb[n] === 'function') && tulis.every(n => !bridgeNames.includes(n)), J({ diekspos: tulis.filter(n => bridgeNames.includes(n)) })); }
  { const s = srvBaru(false); const c = await boot(s); const n0 = J(s.sheets); const r = await c.sb.pdUangMuka();
    rec('UI-02', 'sebelum setup skema: panel menampilkan pesan "skema belum disiapkan", tidak membuat sheet/baris apa pun', r && r.code === 'SCHEMA_ADDITIVE_REQUIRED' && /Skema uang muka belum disiapkan/.test(c.toast()) && J(s.sheets) === n0, c.toast()); }
  { const s = srvBaru(true); const ids = skenario(s); const c = await boot(s); const n0 = J(s.sheets);
    const r = await c.sb.pdUangMuka(), h = modal(c), A = baris(h, ids.a), B = baris(h, ids.b);
    const sel = x => (x.match(/text-align:right">([^<]*)</g) || []).map(t => t.replace(/.*">/, '').replace('<', ''));
    rec('UI-03', 'empat angka per uang muka: A = kas keluar 2.000.000 | dilaporkan 1.700.000 | terverifikasi 1.000.000 | saldo 1.000.000 | kembali 0; B (DIBATALKAN) = 500.000 | 0 | 0 | 300.000 | kembali 200.000, transaksi pencairan tetap tampil',
      r.ok && J(sel(A)) === J([rp(2000000), rp(1700000), rp(1000000), rp(1000000), rp(0)]) && J(sel(B)) === J([rp(500000), rp(0), rp(0), rp(300000), rp(200000)])
        && /DIBATALKAN/.test(B) && /pencairan tetap tercatat/.test(B) && B.indexOf(r.data.uangMuka.find(x => x.id === ids.b).transaksiCairId) !== -1 && J(s.sheets) === n0,
      J({ A: sel(A), B: sel(B) })); }
  { const s = srvBaru(true); const ids = skenario(s); const L = s.sb.opUangMukaLaporan({}).data;
    const trx = rows(s, '05_TRANSAKSI'), H = s.sheets['05_TRANSAKSI'][0], col = k => H.indexOf(k);
    const cair = trx.filter(t => /Pencairan uang muka/.test(t[col('catatan')])), kembali = trx.filter(t => t[col('sumber')] === 'Pengembalian Uang Muka');
    const viaNota = trx.filter(t => /lpj_v|lpj_t/.test(t.join('|')));
    rec('UI-04', 'tidak ada hitung ganda: transaksi kas = 2 pencairan + 1 pengembalian; nota LPJ tidak menjadi transaksi; Σ arus kas keluar = Σ transaksi pencairan; pengembalian tertaut uang muka asal (33.uangMukaId = B)',
      cair.length === 2 && kembali.length === 1 && viaNota.length === 0 && L.total.arusKasKeluar === cair.reduce((x, t) => x + Number(t[col('nominal')]), 0)
        && rows(s, '33_UANG_MUKA_KEMBALI')[0][1] === ids.b && rows(s, '33_UANG_MUKA_KEMBALI')[0][2] === ids.kembaliTrx,
      J({ cair: cair.length, kembali: kembali.length, nota: viaNota.length, total: L.total })); }
  { const s = srvBaru(true); const ids = skenario(s);
    s.sb.opArchiveTransaction(ids.kembaliTrx, 'salah akun, dicatat ulang');
    const tcA = s.sb.opUangMukaLaporan({}).data.uangMuka.find(x => x.id === ids.a).transaksiCairId; s.sb.opArchiveTransaction(tcA, 'uji arsip pencairan');
    const L = s.sb.opUangMukaLaporan({}).data, A = L.uangMuka.find(x => x.id === ids.a), B = L.uangMuka.find(x => x.id === ids.b);
    const c = await boot(s); await c.sb.pdUangMuka(); const h = modal(c);
    rec('UI-05', '[P1_24] konsistensi dengan transaksi kas: pengembalian yang transaksinya diarsip tidak dihitung (B saldo kembali 500.000, PENGEMBALIAN_DIARSIP); pencairan diarsip -> arus kas keluar 0 + PENCAIRAN_DIARSIP_ATAU_HILANG; peringatan tampil di UI',
      B.pengembalian === 0 && B.saldoBelumDipertanggungjawabkan === 500000 && B.peringatan.indexOf('PENGEMBALIAN_DIARSIP') !== -1 && A.arusKasKeluar === 0 && A.peringatan.indexOf('PENCAIRAN_DIARSIP_ATAU_HILANG') !== -1
        && /Periksa:<\/b> PENCAIRAN_DIARSIP_ATAU_HILANG/.test(baris(h, ids.a)) && /PENGEMBALIAN_DIARSIP/.test(baris(h, ids.b)),
      J({ A: [A.arusKasKeluar, A.peringatan], B: [B.pengembalian, B.saldoBelumDipertanggungjawabkan, B.peringatan] })); }
  { const s = srvBaru(true); skenario(s); const c = await boot(s); await c.sb.pdUangMuka(); c.fields.pdum_per = 'September 2026';
    const r = await c.sb.pdUangMukaDampak(), f = s.sb.opFinancialControl('September 2026').data.actual, h = c.sb.umDampakHtml_(r.data);
    rec('UI-06', 'audit dampak FCC/BDS03 lewat UI: "sekarang" = opFinancialControl (pengeluaran/penerimaan/posisi kas); simulasi basis beban hanya ditampilkan (pengeluaran - 2.500.000 + 1.000.000; penerimaan - 200.000; posisi kas sama); label TIDAK diterapkan',
      r.ok && r.data.sekarang.pengeluaranAktual === f.expensePeriode && r.data.sekarang.penerimaan === f.incomePeriode && r.data.simulasiBasisBeban.pengeluaranAktual === f.expensePeriode - 2500000 + 1000000
        && r.data.simulasiBasisBeban.penerimaan === f.incomePeriode - 200000 && r.data.simulasiBasisBeban.posisiKas === f.cashPosition && /TIDAK diterapkan/.test(h) && /31 KPI tidak diubah/.test(h),
      J({ sekarang: r.data.sekarang, simulasi: r.data.simulasiBasisBeban, komponen: r.data.komponen })); }
  { const s = srvBaru(true); skenario(s); const a = as(s, 'auditor@x.id', () => s.sb.opUangMukaLaporan({})), b = as(s, 'auditor@x.id', () => s.sb.opUangMukaCair({ kegiatan: 'x', pelaksana: 'y', nominal: 1, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_kas1', kategori: 'ATK', clientRequestId: 'z' }));
    rec('UI-07', 'AUDITOR dapat membaca laporan uang muka; tidak dapat mencairkan (ROLE_NOT_ALLOWED)', a.ok && b.code === 'ROLE_NOT_ALLOWED', J([a.code, b.code])); }
  { const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8'); const i = html.indexOf('function umLaporanHtml_('), j = html.indexOf('function pdLpjSchema(){');
    const blok = html.slice(i, j);
    rec('UI-08', 'blok UI uang muka tidak memanggil operasi tulis apa pun (hanya opUangMukaLaporan / opUangMukaDampakFcc)', i !== -1 && !/ServerBridge\.op(?!UangMukaLaporan|UangMukaDampakFcc)/.test(blok), (blok.match(/ServerBridge\.op\w+/g) || []).join(',')); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
