/* Suite P1-RAB (sandbox Node, TIDAK menyentuh Google Sheets). Keputusan K-RAB-01..06 dan 08 (19-10-2026), P1_06 §4.3.
 * Fixture rekaan memakai header FINAL 08_ANGGARAN dan 30_REF_ALOKASI_PENGELUARAN (fixtures/headers_backend.json);
 * isi data FINAL TIDAK tersedia dan TIDAK diuji di sini. Status: PASS / FAIL / INFO.
 * Uji diferensial: klien baseline (commit 6ef9926, sebelum P1-RAB) vs klien baru pada fixture yang SAMA.
 */
const cp = require('child_process');
const { makeServer, OUT } = require('./srv_env.js');
const { makeClient, js } = require('./client_env.js');
const FINAL = require('./fixtures/headers_backend.json').FINAL;
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const cnt = (srv, n) => (srv.sheets[n] ? srv.sheets[n].length - 1 : -1);
const audits = srv => rows(srv, '13_AUDIT_LOG').map(r => ({ aksi: r[col(srv, '13_AUDIT_LOG', 'aksi')], refId: r[col(srv, '13_AUDIT_LOG', 'refId')], after: r[col(srv, '13_AUDIT_LOG', 'after')], ts: r[col(srv, '13_AUDIT_LOG', 'timestamp')] }));
const safe = f => { try { return f(); } catch (e) { return { ok: false, code: 'EXCEPTION', message: String(e && e.message || e) }; } };
const J = o => JSON.stringify(o);
const short = r => J(r && { ok: r.ok, code: r.code, message: r.message && String(r.message).slice(0, 140) }).slice(0, 240);
const near = (a, b) => Math.abs(a - b) < 0.5;
const AP_H = ['id', 'transaksiId', 'anggaranId', 'nominal', 'tingkatPemetaan', 'sumberRefId', 'importBatchId', 'catatan', 'createdAt', 'createdBy', 'archivedAt', 'archivedBy', 'archiveReason'];
const objRow = (h, o) => h.map(k => (o[k] === undefined ? '' : o[k]));

/* Fixture RAB Oktober 2026 (unit MI):
   garis ATK      : ang_A1 600.000 DISETUJUI + ang_A2 400.000 'Disetujui' + ang_A3 300.000 DIAJUKAN  (3 baris, 1 garis)
   garis Konsumsi : ang_B 200.000 status KOSONG;  garis Listrik : ang_C 500.000 DIAJUKAN
   garis Honor    : ang_D 150.000 DISETUJUI;      garis Kebersihan : ang_E 90.000 DISETUJUI (tanpa realisasi)
   transaksi: t1 1.000.000 ATK (eksplisit 700.000 -> ang_D; sisa 300.000), t2 250.000 ATK (aturan kategori),
              t3 80.000 Konsumsi, t4 120.000 Listrik, t5 50.000 ATK (eksplisit 30.000+30.000 > nominal), t6 150.000 Honor (eksplisit penuh ang_D) */
function fixture(srv, o) {
  o = o || {};
  const AH = FINAL['08_ANGGARAN'].concat(o.angArchive ? ['archivedAt'] : []);
  const ang = (id, kategori, nominal, status, extra) => objRow(AH, Object.assign({ id, periode: 'Oktober 2026', program: kategori + ' ' + id, kategori, unit: 'MI', nominal, status, subkategori: '' }, extra || {}));
  srv.sheets['08_ANGGARAN'] = [AH.slice(),
    objRow(AH, { id: 'ang_1', periode: 'September 2026', program: 'ATK', kategori: 'ATK', unit: 'MI', nominal: 1000000 }),
    ang('ang_A1', 'ATK', 600000, 'DISETUJUI'), ang('ang_A2', 'ATK', 400000, 'Disetujui'), ang('ang_A3', 'ATK', 300000, 'DIAJUKAN'),
    ang('ang_B', 'Konsumsi', 200000, ''), ang('ang_C', 'Listrik', 500000, 'DIAJUKAN'), ang('ang_D', 'Honor', 150000, 'DISETUJUI'), ang('ang_E', 'Kebersihan', 90000, 'DISETUJUI')];
  const TH = srv.sheets['05_TRANSAKSI'][0];
  const trx = (id, tanggal, nominal, kategori) => objRow(TH, { id, jenis: 'PENGELUARAN', tanggal, unit: 'MI', nominal, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', createdAt: tanggal + 'T01:00:00.000Z', kategori, penerima: 'Toko ' + id });
  srv.sheets['05_TRANSAKSI'].push(trx('t1', '2026-10-05', 1000000, 'ATK'), trx('t2', '2026-10-06', 250000, 'ATK'), trx('t3', '2026-10-07', 80000, 'Konsumsi'),
    trx('t4', '2026-10-08', 120000, 'Listrik'), trx('t5', '2026-10-09', 50000, 'ATK'), trx('t6', '2026-10-10', 150000, 'Honor'));
  if (o.alokasi !== false) {
    srv.sheets['30_ALOKASI_PENGELUARAN'] = [AP_H.slice(),
      objRow(AP_H, { id: 'al1', transaksiId: 't1', anggaranId: 'ang_D', nominal: 700000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al2', transaksiId: 't5', anggaranId: 'ang_A1', nominal: 30000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al3', transaksiId: 't5', anggaranId: 'ang_D', nominal: 30000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al4', transaksiId: 't6', anggaranId: 'ang_D', nominal: 150000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al5', transaksiId: 't_tidak_ada', anggaranId: 'ang_D', nominal: 1000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al6', transaksiId: 't2', anggaranId: 'ang_tidak_ada', nominal: 1000, tingkatPemetaan: 'ITEM' }),
      objRow(AP_H, { id: 'al7', transaksiId: 't2', anggaranId: 'ang_A1', nominal: 250000, tingkatPemetaan: 'ITEM', archivedAt: '2026-10-12T00:00:00.000Z', archivedBy: 'x', archiveReason: 'salah' })];
  }
  return srv;
}
const D_of = srv => ({ transaksi: srv.sb.sgRowsChecked_('05_TRANSAKSI'), anggaran: srv.sb.sgRowsChecked_('08_ANGGARAN'), alokasiPengeluaran: srv.sb.sgRowsChecked_('30_ALOKASI_PENGELUARAN'), kategoriPengeluaran: srv.sb.sgRowsChecked_('21_KATEGORI_PENGELUARAN') });
const lineOf = (M, kat) => M.lines.find(L => L.kategori === kat && L.periode === 'Oktober 2026');
/* 30_REF_ALOKASI_PENGELUARAN (header FINAL) untuk uji kering/impor */
function refSheet(srv, list) {
  const H = FINAL['30_REF_ALOKASI_PENGELUARAN'];
  srv.sheets['30_REF_ALOKASI_PENGELUARAN'] = [H.slice()].concat(list.map(o => objRow(H, o)));
}
const REF_LIST = () => [
  { alokasiPengId: 'R1', transaksiId: 't2', anggaranId: 'ang_A1', nominal: 250000, tingkatPemetaan: 'ITEM' },           // VALID
  { alokasiPengId: 'R2', transaksiId: 't3', anggaranId: 'ang_B', nominal: 80000, tingkatPemetaan: 'KATEGORI' },          // tingkat bukan ITEM
  { alokasiPengId: 'R3', transaksiId: 't4', anggaranId: 'ang_C', nominal: 120000, tingkatPemetaan: '' },                 // tingkat kosong
  { alokasiPengId: 'R4', transaksiId: 't_hilang', anggaranId: 'ang_A1', nominal: 1000, tingkatPemetaan: 'ITEM' },        // transaksi tidak ada
  { alokasiPengId: 'R5', transaksiId: 't4', anggaranId: 'ang_hilang', nominal: 1000, tingkatPemetaan: 'ITEM' },          // anggaran tidak ada
  { alokasiPengId: 'R1', transaksiId: 't3', anggaranId: 'ang_B', nominal: 1000, tingkatPemetaan: 'ITEM' },               // id sumber ganda
  { alokasiPengId: 'R7', transaksiId: 't2', anggaranId: 'ang_A1', nominal: 1000, tingkatPemetaan: 'ITEM' },              // pasangan ganda (dgn R1)
  { alokasiPengId: 'R8', transaksiId: 't4', anggaranId: 'ang_D', nominal: 200000, tingkatPemetaan: 'ITEM' },             // > nominal t4 (120.000)
  { alokasiPengId: 'R9', transaksiId: 'imp_trx_1', anggaranId: 'ang_A1', nominal: 1000, tingkatPemetaan: 'ITEM' },       // bukan pengeluaran
  { alokasiPengId: 'R10', transaksiId: 't3', anggaranId: '', nominal: 80000, tingkatPemetaan: 'ITEM', alasanPengecualian: 'darurat' } // dikecualikan
];
const kelasOf = (plan, src, i) => plan.rows.filter(x => x.alokasiPengId === src)[i || 0];

async function bootClient(srv, code) {
  const c = makeClient(srv, code ? { js: code } : undefined); const A = c.a;
  c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error), 400);
  await tick(5);
  return c;
}
const kpiPack = s => ({ overall: s.overall, st: s.overallStatus, rows: s.rows.map(r => [r.kode, r.skor, r.status, r.jumlahMasalah, r.indicators.map(i => [i.kode, i.capaian, i.status, i.activityStatus, i.realisasi])]) });

(async () => {
  // ================= Pencocokan inti (rabMatchAll_, sumber tunggal klien+server) =================
  { const srv = fixture(makeServer()); const M = srv.sb.rabMatchAll_(D_of(srv));
    const A = lineOf(M, 'ATK'), Dl = lineOf(M, 'Honor'), B = lineOf(M, 'Konsumsi'), C = lineOf(M, 'Listrik');
    rec('RAB-01', 'K-RAB-04 garis', !!A && A.rabIds.length === 3 && A.paguDisetujui === 1000000 && A.paguDiajukan === 300000 && J(A.rabIdsDisetujui) === J(['ang_A1', 'ang_A2']),
      'garis ATK: ' + J(A && { rabIds: A.rabIds, disetujui: A.paguDisetujui, diajukan: A.paguDiajukan }));
    rec('RAB-02', 'K-RAB-02 status', !!B && B.paguDisetujui === 0 && B.paguTanpaStatus === 200000 && srv.sb.rabLineStatus_(B) === 'TANPA_STATUS' && !!C && C.paguDiajukan === 500000 && srv.sb.rabLineStatus_(C) === 'DIAJUKAN'
      && srv.sb.rabStatusOf_({ status: ' disetujui ' }) === 'DISETUJUI' && srv.sb.rabStatusOf_({ status: 'Ditolak' }) === 'STATUS_LAIN',
      J({ B: B && [B.paguTanpaStatus, srv.sb.rabLineStatus_(B)], C: C && [C.paguDiajukan, srv.sb.rabLineStatus_(C)] }));
    const p = id => M.perTrx[id];
    rec('RAB-03', 'K-RAB-03 sebagian', p('t1').sumber === 'EKSPLISIT' && p('t1').terpetakan === 700000 && p('t1').sisaTidakTerpetakan === 300000 && !p('t1').disetujui
      && p('t1').bagian.length === 1 && p('t1').bagian[0].anggaranId === 'ang_D' && A.transaksiIds.indexOf('t1') === -1,
      'Rp1.000.000 dgn alokasi eksplisit Rp700.000 -> sisa Rp300.000 tidak terpetakan, tidak jatuh ke aturan kategori ATK: ' + J(p('t1')));
    rec('RAB-04', 'K-RAB-03 Σ>nominal', p('t5').sumber === 'TANPA_RAB' && p('t5').tanpaRab === 50000 && !p('t5').disetujui && M.issues.some(x => x.transaksiId === 't5' && x.masalah === 'ALOKASI_MELEBIHI_NOMINAL' && x.totalAlokasi === 60000)
      && A.transaksiIds.indexOf('t5') === -1, 'alokasi 30.000+30.000 atas 50.000 diabaikan seluruhnya + dilaporkan: ' + J(p('t5')));
    rec('RAB-05', 'referensi hilang', M.issues.some(x => x.alokasiId === 'al5' && x.masalah === 'TRANSAKSI_TIDAK_VALID') && M.issues.some(x => x.alokasiId === 'al6' && x.masalah === 'ANGGARAN_TIDAK_VALID')
      && !M.issues.some(x => x.alokasiId === 'al7') && p('t2').sumber === 'KATEGORI', 'masalah: ' + J(M.issues));
    rec('RAB-06', 'I03 per status', p('t2').disetujui === true && p('t6').disetujui === true && p('t3').disetujui === false && p('t4').disetujui === false && p('t3').sumber === 'KATEGORI' && p('t4').bagian[0].statusRab === 'DIAJUKAN',
      J(['t1', 't2', 't3', 't4', 't5', 't6'].map(i => [i, p(i).sumber, p(i).disetujui])));
    // garis berisi banyak baris: satu realisasi garis, tampilan per baris tidak mengarang pembagian
    rec('RAB-07', 'K-RAB-04 banyak baris', A.realisasi === 250000 && A.realisasiKategori === 250000 && srv.sb.rabRealisasiBaris_(M, 'ang_A1') === 0 && srv.sb.rabRealisasiBaris_(M, 'ang_A2') === 0
      && Dl.realisasi === 850000 && srv.sb.rabRealisasiBaris_(M, 'ang_D') === 850000,
      J({ ATK: [A.realisasi, srv.sb.rabRealisasiBaris_(M, 'ang_A1')], Honor: [Dl.realisasi, srv.sb.rabRealisasiBaris_(M, 'ang_D')] }));
    const totTrx = M.transaksi.reduce((s, r) => s + r.nominal, 0), totL = M.lines.reduce((s, L) => s + L.realisasi, 0), totS = M.transaksi.reduce((s, r) => s + r.sisaTidakTerpetakan, 0), totT = M.transaksi.reduce((s, r) => s + r.tanpaRab, 0);
    const perTrxOk = M.transaksi.every(r => near(r.bagian.reduce((s, b) => s + b.nominal, 0) + r.sisaTidakTerpetakan + r.tanpaRab, r.nominal));
    rec('RAB-08', 'tanpa hitung ganda', near(totL + totS + totT, totTrx) && perTrxOk, 'Σ realisasi garis ' + totL + ' + Σ sisa ' + totS + ' + Σ tanpa RAB ' + totT + ' = Σ pengeluaran aktif ' + totTrx);
  }
  // ================= Financial Control + opRabRealization (server) =================
  { const srv = fixture(makeServer());
    const fc = safe(() => srv.sb.opFinancialControl('Oktober 2026')), rr = safe(() => srv.sb.opRabRealization('Oktober 2026'));
    const ab = fc.ok && fc.data.anggaranVsAktual, row = k => ab && ab.rows.find(r => r.jenis === 'PENGELUARAN' && r.kategori === k && r.periode === 'Oktober 2026');
    const eqRR = rr.ok && ab && rr.data.lines.filter(l => l.periode === 'Oktober 2026').every(l => { const r = row(l.kategori); return r && r.aktual === l.aktual && r.anggaran === l.anggaran; });
    const sumRows = ab ? ab.rows.filter(r => r.jenis === 'PENGELUARAN').reduce((s, r) => s + r.aktual, 0) : -1, sumNo = ab ? ab.transaksiTanpaAnggaran.reduce((s, x) => s + x.total, 0) : -1;
    rec('RAB-09', 'FCC per status', fc.ok && row('ATK').anggaran === 1000000 && row('ATK').anggaranDiajukan === 300000 && row('ATK').aktual === 250000 && row('ATK').status === 'DALAM ANGGARAN'
      && row('Konsumsi').status === 'ANGGARAN BELUM DISETUJUI' && row('Konsumsi').anggaranTanpaStatus === 200000 && row('Listrik').status === 'ANGGARAN BELUM DISETUJUI'
      && row('Honor').aktual === 850000 && row('Honor').aktualEksplisit === 850000 && row('Honor').status === 'MELEBIHI ANGGARAN', short(fc) + ' ' + J(ab && ab.rows.filter(r => r.jenis === 'PENGELUARAN').map(r => [r.kategori, r.anggaran, r.aktual, r.status])));
    rec('RAB-10', 'FCC invarian', fc.ok && ab.sisaTidakTerpetakan.total === 300000 && ab.sisaTidakTerpetakan.jumlahTransaksi === 1 && near(sumRows + ab.sisaTidakTerpetakan.total + sumNo, fc.data.actual.expensePeriode)
      && ab.pencocokanBermasalah.length === 3, 'Σ aktual garis ' + sumRows + ' + sisa ' + (ab && ab.sisaTidakTerpetakan.total) + ' + tanpa anggaran ' + sumNo + ' = pengeluaran periode ' + (fc.ok && fc.data.actual.expensePeriode));
    rec('RAB-11', 'TC-DSH-05 / GAP-018', eqRR && rr.data.totals.sisaTidakTerpetakan === 300000 && rr.data.unmapped.some(u => u.id === 't5' && /melebihi/.test(u.alasan)) && rr.data.sisaTidakTerpetakan.some(s => s.id === 't1'),
      'opRabRealization = kolom FCC per garis: ' + J(rr.ok && rr.data.totals));
    const miss = fc.ok ? fc.data.missing.rabTanpaRealisasi : [];
    rec('RAB-12', 'FCC MISSING', fc.ok && miss.length === 1 && miss[0].id === 'ang_E' && miss[0].nominal === 90000 && J(fc.data.planned.rabPengeluaranPerStatus) === J({ disetujui: 1240000, diajukan: 800000, tanpaStatus: 200000, statusLain: 0 }),
      'missing=' + J(miss) + ' perStatus=' + J(fc.ok && fc.data.planned.rabPengeluaranPerStatus));
    // klien vs server: kode inti identik -> hasil identik
    const c = await bootClient(srv);
    const fcc = c.sb.fccCompute_('Oktober 2026', c.sb.centralFccData_('Oktober 2026'));
    const strip = o => { const x = JSON.parse(J(o)); delete x.computedAt; return J(x); };
    rec('RAB-13', 'satu sumber', fc.ok && strip(fcc.anggaranVsAktual) === strip(fc.data.anggaranVsAktual) && J(fcc.missing) === J(fc.data.missing), 'klien == server (anggaranVsAktual + missing)');
  }
  // ================= RecordGuard 30_ALOKASI_PENGELUARAN =================
  { const srv = fixture(makeServer());
    const put = (id, row) => { const r = safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id, row }])); return r.ok ? r.data.results[0].code : r.code; };
    const n0 = cnt(srv, '30_ALOKASI_PENGELUARAN');
    const res = [put('alg_1', { transaksiId: 't_x', anggaranId: 'ang_A1', nominal: 1 }), put('alg_2', { transaksiId: 'imp_trx_1', anggaranId: 'ang_A1', nominal: 1 }), put('alg_3', { transaksiId: 't3', anggaranId: 'ang_x', nominal: 1 }),
      put('alg_4', { transaksiId: 't3', anggaranId: 'ang_B', nominal: 0 }), put('alg_5', { transaksiId: 't6', anggaranId: 'ang_D', nominal: 1 }), put('alg_6', { transaksiId: 't4', anggaranId: 'ang_C', nominal: 120001 })];
    rec('RAB-14', 'validasi alokasi', J(res) === J(['INVALID_TRANSACTION', 'INVALID_TRANSACTION', 'INVALID_RAB', 'VALIDATION_ERROR', 'DUPLICATE', 'ALOKASI_EXCEEDS_TRANSACTION']) && cnt(srv, '30_ALOKASI_PENGELUARAN') === n0, J(res));
    const ok1 = put('alg_7', { transaksiId: 't4', anggaranId: 'ang_C', nominal: 60000, tingkatPemetaan: 'ITEM' });
    const r2 = safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id: 'alg_8', row: { transaksiId: 't4', anggaranId: 'ang_A1', nominal: 40000 } }, { op: 'upsert', id: 'alg_9', row: { transaksiId: 't4', anggaranId: 'ang_D', nominal: 40000 } }]));
    const imm = put('alg_7', { nominal: 1 });
    const arc = safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'archive', id: 'alg_7', reason: 'koreksi' }]));
    const ok3 = put('alg_10', { transaksiId: 't4', anggaranId: 'ang_C', nominal: 80000, tingkatPemetaan: 'ITEM' });
    rec('RAB-15', 'Σ dalam batch + immutable', ok1 === 'CREATED' && r2.ok && r2.data.results[0].code === 'CREATED' && r2.data.results[1].code === 'ALOKASI_EXCEEDS_TRANSACTION' && imm === 'ALOKASI_IMMUTABLE' && arc.ok && arc.data.results[0].code === 'ARCHIVED' && ok3 === 'CREATED'
      && audits(srv).some(a => a.aksi === 'RECORD_CREATE:alokasiPengeluaran' && a.refId === 'alg_7') && audits(srv).some(a => a.aksi === 'RECORD_ARCHIVE:alokasiPengeluaran' && a.refId === 'alg_7'),
      J({ ok1, batch: r2.ok && r2.data.results.map(x => x.code), imm, arc: arc.ok && arc.data.results[0].code, ok3 }));
  }
  // ================= Sheet opsional & pembuatan eksplisit (K-RAB-08) =================
  { const srv = makeServer();
    const boot = await bootClient(srv);
    srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    const absent = srv.sheets['30_ALOKASI_PENGELUARAN'] === undefined;
    const rd = safe(() => srv.sb.opReadSheet('30_ALOKASI_PENGELUARAN', {}));
    const s = boot.sb.kpiIndukSummary('September 2026');
    rec('RAB-16', 'K-RAB-08 tanpa auto-create', absent && rd.ok && rd.data.rows.length === 0 && rd.data.sheetMissing === true && s.overall !== null && !/TIDAK TERSEDIA/.test(s.overallStatus) && safe(() => srv.sb.opFinancialControl('September 2026')).ok,
      'boot+migrasi aditif tidak membuat sheet; opReadSheet=' + short(rd) + ' KPI overall=' + s.overall);
    srv.state.email = 'auditor@x.id';
    const den = safe(() => srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN'));
    srv.state.email = 'bendahara@x.id';
    const noC = safe(() => srv.sb.opAlokasiPengeluaranSetup('ya'));
    const n0 = cnt(srv, '13_AUDIT_LOG');
    srv.state.failSetValuesOn = '13_AUDIT_LOG';
    const af = safe(() => srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN'));
    const afNo = srv.sheets['30_ALOKASI_PENGELUARAN'] === undefined; srv.state.failSetValuesOn = null;
    const mk = safe(() => srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN'));
    const again = safe(() => srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN'));
    rec('RAB-17', 'K-RAB-08 setup eksplisit', den.code === 'ROLE_NOT_ALLOWED' && noC.code === 'CONFIRM_REQUIRED' && af.code === 'AUDIT_FAILED' && afNo && mk.ok && J(srv.sheets['30_ALOKASI_PENGELUARAN'][0]) === J(AP_H)
      && audits(srv).filter(a => a.aksi === 'SCHEMA_CREATE_SHEET').length === 1 && again.ok && again.data.unchanged === true,
      J({ auditor: den.code, tanpaKonfirmasi: noC.code, auditGagal: af.code, buat: mk.code || mk.ok, ulang: again.data && again.data.unchanged, auditBaru: cnt(srv, '13_AUDIT_LOG') - n0 }));
  }
  // ================= Uji kering + impor (hanya pada salinan uji; di sini sandbox) =================
  { const srv = fixture(makeServer(), { alokasi: false }); refSheet(srv, REF_LIST());
    const refBefore = J(srv.sheets['30_REF_ALOKASI_PENGELUARAN']);
    const pl = safe(() => srv.sb.opAlokasiPengeluaranPlan()), P = pl.ok && pl.data;
    const k = (src, i) => { const x = kelasOf(P, src, i); return x ? x.kelas + ':' + x.alasan.join('+') : '-'; };
    const exp = { R1: 'VALID:', R2: 'PERLU_PEMERIKSAAN:TINGKAT_BUKAN_ITEM', R3: 'PERLU_PEMERIKSAAN:TINGKAT_BUKAN_ITEM', R4: 'DITOLAK:TRANSAKSI_TIDAK_ADA', R5: 'DITOLAK:ANGGARAN_TIDAK_ADA',
      R7: 'DUPLIKAT:PASANGAN_GANDA', R8: 'PERLU_PEMERIKSAAN:MELEBIHI_NOMINAL_TRANSAKSI', R9: 'DITOLAK:BUKAN_PENGELUARAN', R10: 'PERLU_PEMERIKSAAN:DIKECUALIKAN_TANPA_ANGGARAN' };
    const bad = Object.keys(exp).filter(s => k(s) !== exp[s]);
    rec('RAB-18', 'K-RAB-01/08 uji kering', pl.ok && bad.length === 0 && k('R1', 1) === 'DUPLIKAT:ID_SUMBER_GANDA' && P.distribusiTingkat.ITEM === 8 && P.distribusiTingkat.KATEGORI === 1 && P.distribusiTingkat['(kosong)'] === 1
      && P.kelas.VALID === 1 && J(srv.sheets['30_REF_ALOKASI_PENGELUARAN']) === refBefore && srv.sheets['30_ALOKASI_PENGELUARAN'] === undefined,
      bad.length ? 'beda: ' + bad.map(s => s + '=' + k(s)).join(', ') : J({ kelas: P.kelas, tingkat: P.distribusiTingkat, fk: P.resolusiFK }));
    const noSheet = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: P.planHash, confirm: 'IMPOR_ALOKASI_PENGELUARAN' }));
    srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN');
    const pl2 = srv.sb.opAlokasiPengeluaranPlan().data;
    const noConf = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: pl2.planHash }));
    srv.state.email = 'auditor@x.id'; const den = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: pl2.planHash, confirm: 'IMPOR_ALOKASI_PENGELUARAN' })); const plA = safe(() => srv.sb.opAlokasiPengeluaranPlan()); srv.state.email = 'bendahara@x.id';
    srv.sheets['30_REF_ALOKASI_PENGELUARAN'][1][col(srv, '30_REF_ALOKASI_PENGELUARAN', 'nominal')] = 240000; // data berubah setelah uji kering
    const conf = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: pl2.planHash, confirm: 'IMPOR_ALOKASI_PENGELUARAN' }));
    rec('RAB-19', 'K-RAB-08 gerbang impor', noSheet.code === 'SCHEMA_ADDITIVE_REQUIRED' && noConf.code === 'CONFIRM_REQUIRED' && den.code === 'ROLE_NOT_ALLOWED' && plA.ok && conf.code === 'CONFLICT' && cnt(srv, '30_ALOKASI_PENGELUARAN') === 0,
      J({ tanpaSheet: noSheet.code, tanpaKonfirmasi: noConf.code, auditorImpor: den.code, auditorUjiKering: plA.ok, hashBeda: conf.code }));
    const pl3 = srv.sb.opAlokasiPengeluaranPlan().data;
    const imp = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: pl3.planHash, confirm: 'IMPOR_ALOKASI_PENGELUARAN' }));
    const ar = rows(srv, '30_ALOKASI_PENGELUARAN'), ia = audits(srv).filter(a => a.aksi === 'IMPOR_ALOKASI_PENGELUARAN'), ca = audits(srv).filter(a => a.aksi === 'RECORD_CREATE:alokasiPengeluaran');
    rec('RAB-20', 'K-RAB-08 impor VALID saja + audit', imp.ok && imp.data.diimpor === 1 && ar.length === 1 && ar[0][0] === 'ap_R1' && ar[0][col(srv, '30_ALOKASI_PENGELUARAN', 'nominal')] === 240000 && ar[0][col(srv, '30_ALOKASI_PENGELUARAN', 'sumberRefId')] === 'R1'
      && ar[0][col(srv, '30_ALOKASI_PENGELUARAN', 'importBatchId')] === imp.data.importBatchId && ia.length === 1 && ca.length === 1 && ia[0].ts === ca[0].ts,
      J({ hasil: imp.data, baris: ar.map(r => r.slice(0, 6)) }));
    const pl4 = srv.sb.opAlokasiPengeluaranPlan().data;
    const imp2 = safe(() => srv.sb.opAlokasiPengeluaranImport({ planHash: pl4.planHash, confirm: 'IMPOR_ALOKASI_PENGELUARAN' }));
    rec('RAB-21', 'idempoten', kelasOf(pl4, 'R1').kelas === 'DUPLIKAT' && kelasOf(pl4, 'R1').alasan[0] === 'SUDAH_ADA' && imp2.ok && imp2.data.diimpor === 0 && cnt(srv, '30_ALOKASI_PENGELUARAN') === 1,
      'impor ulang: ' + J(imp2.data));
    const M = srv.sb.rabMatchAll_(D_of(srv));
    rec('RAB-22', 'hasil impor dipakai pencocokan', M.perTrx.t2.sumber === 'EKSPLISIT' && M.perTrx.t2.sisaTidakTerpetakan === 10000 && M.perTrx.t2.disetujui === false,
      't2 250.000 dgn alokasi impor 240.000 -> sisa 10.000 tidak terpetakan: ' + J(M.perTrx.t2));
  }
  // ================= Diferensial KPI BDS03 + Financial Control: baseline (6ef9926) vs baru, fixture sama =================
  { let baseJs = '';
    try { baseJs = cp.execFileSync('git', ['show', (process.env.RAB_BASELINE_REF || '6ef9926') + ':Bendahara_V2.html'], { cwd: OUT, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\r/g, '').match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1]; } catch (e) { }
    if (!baseJs) rec('RAB-23', 'diferensial', false, 'baseline 6ef9926 tidak terbaca');
    else {
      const run = async (code) => { const srv = fixture(makeServer()); const c = await bootClient(srv, code); const s = c.sb.kpiIndukSummary('Oktober 2026'); const f = c.sb.fccCompute_('Oktober 2026', c.sb.centralFccData_('Oktober 2026')); return { k: kpiPack(s), f, c }; };
      const a = await run(baseJs), b = await run(js);
      const ind = (p, kode) => { for (const r of p.rows) for (const i of r[4]) if (i[0] === kode) return i; return null; };
      const RAB_IND = ['BDS03-I03', 'BDS03-I04', 'BDS03-I05'];
      const mask = p => { const o = JSON.parse(J(p)); o.overall = o.st = 'X'; o.rows.forEach(r => { if (r[0] === 'BDS03') { r[1] = r[2] = r[3] = 'X'; r[4] = r[4].filter(i => RAB_IND.indexOf(i[0]) === -1); } }); return J(o); };
      rec('RAB-23', 'regresi KPI di luar BDS03', mask(a.k) === mask(b.k), mask(a.k) === mask(b.k) ? 'semua indikator selain BDS03-I03/I04/I05 identik pada fixture RAB' : 'BEDA\nbase=' + mask(a.k).slice(0, 400) + '\nbaru=' + mask(b.k).slice(0, 400));
      // ekspektasi manual (Oktober): pengeluaran t1..t6; I03 ok = t2, t6 (2/6); I05 = I03 (tanpa tautan ObligasiSekolah); I04 garis disetujui Oktober = ATK (250.000 <= 1.000.000 ok),
      // Honor (850.000 > 150.000 gagal), Kebersihan (0 <= 90.000 ok) -> 2/3
      const feed = b.c.sb.financialAktivitasFeed().filter(x => x.tanggal >= '2026-10-01' && x.tanggal <= '2026-10-31');
      const cntK = kode => { const xs = feed.filter(x => x.kodeKpi === kode); return [xs.filter(x => !x._problem).length, xs.length]; };
      const i03 = cntK('BDS03-I03'), i04 = cntK('BDS03-I04'), i05 = cntK('BDS03-I05');
      rec('RAB-24', 'diferensial BDS03 (ekspektasi manual)', J(i03) === J([2, 6]) && J(i04) === J([2, 3]) && J(i05) === J([2, 6]),
        'aktivitas baru I03=' + J(i03) + ' I04=' + J(i04) + ' I05=' + J(i05));
      rec('RAB-25', 'diferensial BDS03 (nilai)', null, RAB_IND.map(kd => kd + ' ' + J(ind(a.k, kd)) + ' -> ' + J(ind(b.k, kd))).join(' | ') + ' | BDS03 ' + J(a.k.rows.find(r => r[0] === 'BDS03').slice(1, 4)) + ' -> ' + J(b.k.rows.find(r => r[0] === 'BDS03').slice(1, 4)) + ' | overall ' + a.k.overall + ' -> ' + b.k.overall);
      const fr = f => f.anggaranVsAktual.rows.filter(r => r.jenis === 'PENGELUARAN').map(r => [r.kategori, r.anggaran, r.aktual, r.status]);
      rec('RAB-26', 'diferensial Financial Control', null, 'garis ' + J(fr(a.f)) + ' -> ' + J(fr(b.f)) + ' | tanpaAnggaran ' + J(a.f.anggaranVsAktual.transaksiTanpaAnggaran.map(x => [x.kategori, x.total])) + ' -> ' + J(b.f.anggaranVsAktual.transaksiTanpaAnggaran.map(x => [x.kategori, x.total]))
        + ' | missing ' + J(a.f.missing.rabTanpaRealisasi.map(m => [m.id, m.nominal])) + ' -> ' + J(b.f.missing.rabTanpaRealisasi.map(m => [m.id, m.nominal])) + ' | sisaTidakTerpetakan ' + J(b.f.anggaranVsAktual.sisaTidakTerpetakan));
      const pk = code => (code.match(/function pengeluaranPunyaPersetujuan\(t\)\{[^\n]*\}/) || [''])[0];
      rec('RAB-27', 'K-RAB-07 tidak diimplementasikan', !!pk(baseJs) && pk(baseJs) === pk(js), 'pengeluaranPunyaPersetujuan identik dgn baseline: ' + pk(js));
    }
  }
  // ================= Tampilan yang disentuh P1-RAB: render tanpa error, total per garis unik =================
  { const srv = fixture(makeServer()); const c = await bootClient(srv); const A = c.a;
    const st = A.Store.loadSettings(); st.periodeAktif = 'Oktober 2026'; A.Store.saveSettings(st);
    const out = {}, err = [];
    const tryR = (k, f) => { try { out[k] = String(f() || ''); } catch (e) { err.push(k + ': ' + e.message); } };
    tryR('beranda', () => c.sb.renderBeranda());
    ['realisasi', 'sisa', 'rab', 'banding'].forEach(t => { A.State.anggaranTab = t; tryR('anggaran.' + t, () => c.sb.renderAnggaranKomitmen()); });
    ['anggaran', 'kontrol'].forEach(t => { A.State.laporanTab = t; tryR('laporan.' + t, () => c.sb.renderLaporan()); });
    tryR('ekspor.anggaran', () => { c.sb.exportAnggaranReport('csv'); return 'ok'; });
    const b = out.beranda || '';
    rec('RAB-28', 'tampilan', err.length === 0 && /Total Anggaran Disetujui/.test(b) && /1\.240\.000/.test(b),
      err.length ? 'error: ' + err.join(' | ') : 'beranda/anggaran/laporan dirender, ekspor anggaran jalan; Total Anggaran Disetujui = Σ pagu DISETUJUI per garis unik (1.240.000)' + (/1\.240\.000/.test(b) ? '' : ' [nilai tidak ditemukan]'));
  }
  // ================= Keputusan 2 (P1_10): Kartu Beranda A/B/C, laporan, ekspor; tanpa hitung ganda =================
  const setPeriode = (c, p) => { const st = c.a.Store.loadSettings(); st.periodeAktif = p; c.a.Store.saveSettings(st); };
  const rp = n => 'Rp ' + Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  const RS_KEYS = ['anggaranDisetujui', 'realisasiDisetujui', 'pengeluaranAktual', 'terpetakanBelumDisetujui', 'terpetakanPeriodeLain', 'sisaTidakTerpetakan', 'tanpaRab', 'belumKeRabDisetujui', 'sisaAnggaranDisetujui', 'anggaranBelumDisetujui'];
  const pickRS = r => RS_KEYS.map(k => r[k]);
  const invRS = r => near(r.realisasiDisetujui + r.terpetakanBelumDisetujui + r.terpetakanPeriodeLain + r.sisaTidakTerpetakan + r.tanpaRab, r.pengeluaranAktual);
  { const srv = fixture(makeServer());
    const fc = safe(() => srv.sb.opFinancialControl('Oktober 2026')), S = fc.ok && fc.data.anggaranVsAktual.ringkasanPeriode;
    const exp = { anggaranDisetujui: 1240000, realisasiDisetujui: 1100000, pengeluaranAktual: 1650000, terpetakanBelumDisetujui: 200000, terpetakanPeriodeLain: 0, sisaTidakTerpetakan: 300000, tanpaRab: 50000, belumKeRabDisetujui: 550000, sisaAnggaranDisetujui: 140000, anggaranBelumDisetujui: 1000000 };
    const c = await bootClient(srv); setPeriode(c, 'Oktober 2026');
    const CS = c.sb.rabRingkasanPeriode_(c.sb.rabMatchClient_(), 'Oktober 2026'), tile = c.sb.totalPengeluaran('Oktober 2026');
    rec('RAB-29', 'Keputusan 2 ukuran A/B/C', !!S && J(pickRS(S)) === J(RS_KEYS.map(k => exp[k])) && J(pickRS(CS)) === J(pickRS(S)) && invRS(S) && S.pengeluaranAktual === tile && S.jumlahTransaksi === 6,
      'A=' + (S && S.anggaranDisetujui) + ' B=' + (S && S.realisasiDisetujui) + ' C=' + (S && S.pengeluaranAktual) + ' (tile Pengeluaran Aktual ' + tile + ') rincian C-B: RAB belum disetujui ' + (S && S.terpetakanBelumDisetujui) + ', periode lain ' + (S && S.terpetakanPeriodeLain) + ', sisa ' + (S && S.sisaTidakTerpetakan) + ', tanpa RAB ' + (S && S.tanpaRab) + '; klien == server');
    const b = String(c.sb.renderBeranda() || '');
    const shown = [['Total Anggaran Disetujui', 1240000], ['Realisasi terhadap Anggaran Disetujui', 1100000], ['Sisa Anggaran Disetujui', 140000], ['Total Pengeluaran Aktual', 1650000], ['Belum terpetakan ke RAB disetujui', 550000]];
    const miss = shown.filter(([lbl, n]) => b.indexOf(lbl) === -1 || b.indexOf(rp(n)) === -1);
    rec('RAB-30', 'Keputusan 2 kartu Beranda', miss.length === 0 && b.indexOf('tanpa RAB ' + rp(50000)) !== -1, miss.length ? 'tidak tampil: ' + J(miss) : 'A, B, Sisa, C, C-B + rincian tampil terpisah; pengeluaran tanpa RAB disetujui tetap terlihat di C');
    // laporan anggaran (layar) + ekspor memakai definisi yang sama
    let cap = null; c.sb.exportReport = (format, base, title, headers, rows) => { cap = rows; };
    c.sb.exportAnggaranReport('xlsx');
    const ex = (lbl, p) => { const r = (cap || []).find(x => String(x[0]).indexOf(lbl) !== -1 && x[1] === p); return r ? (r[2] !== '' ? r[2] : r[3]) : null; };
    c.a.State.laporanTab = 'anggaran'; const lap = String(c.sb.renderLaporan() || '');
    const okEx = ex('A. Total Anggaran Disetujui', 'Oktober 2026') === S.anggaranDisetujui && ex('B. Realisasi', 'Oktober 2026') === S.realisasiDisetujui && ex('C. Total Pengeluaran Aktual', 'Oktober 2026') === S.pengeluaranAktual && ex('C-B.', 'Oktober 2026') === S.belumKeRabDisetujui
      && ex('C. Total Pengeluaran Aktual', 'September 2026') === c.sb.totalPengeluaran('September 2026');
    const okLap = [S.anggaranDisetujui, S.realisasiDisetujui, S.pengeluaranAktual, S.belumKeRabDisetujui].every(n => lap.indexOf(rp(n)) !== -1) && /C\. Total Pengeluaran Aktual/.test(lap);
    rec('RAB-31', 'Keputusan 2 Beranda = laporan = ekspor', !!cap && okEx && okLap, 'ekspor ringkasan: ' + J((cap || []).filter(x => /RINGKASAN/.test(x[0]))));
  }
  { // transaksi dengan beberapa alokasi dalam periode sama: C bertambah tepat sekali, B bertambah sebesar alokasinya
    const srv = fixture(makeServer());
    const before = srv.sb.rabRingkasanPeriode_(srv.sb.rabMatchAll_(D_of(srv)), 'Oktober 2026');
    const TH = srv.sheets['05_TRANSAKSI'][0];
    srv.sheets['05_TRANSAKSI'].push(objRow(TH, { id: 't7', jenis: 'PENGELUARAN', tanggal: '2026-10-11', unit: 'MI', nominal: 400000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', createdAt: '2026-10-11T01:00:00.000Z', kategori: 'ATK', penerima: 'Toko t7' }));
    const r = safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id: 'alg_t7a', row: { transaksiId: 't7', anggaranId: 'ang_A1', nominal: 300000, tingkatPemetaan: 'ITEM' } }, { op: 'upsert', id: 'alg_t7b', row: { transaksiId: 't7', anggaranId: 'ang_E', nominal: 100000, tingkatPemetaan: 'ITEM' } }]));
    const after = srv.sb.rabRingkasanPeriode_(srv.sb.rabMatchAll_(D_of(srv)), 'Oktober 2026');
    rec('RAB-32', 'beberapa alokasi tanpa hitung ganda', r.ok && r.data.results.every(x => x.code === 'CREATED') && after.pengeluaranAktual - before.pengeluaranAktual === 400000 && after.jumlahTransaksi - before.jumlahTransaksi === 1
      && after.realisasiDisetujui - before.realisasiDisetujui === 400000 && invRS(after), 'C ' + before.pengeluaranAktual + ' -> ' + after.pengeluaranAktual + ', B ' + before.realisasiDisetujui + ' -> ' + after.realisasiDisetujui + ' (2 alokasi 300.000 + 100.000)');
  }
  // ================= Lintas periode: KARAKTERISASI perilaku sekarang (Keputusan 1 ditangguhkan, P1_12 §0; NEEDS_POLICY_DECISION) =================
  { const srv = fixture(makeServer());
    const AH = srv.sheets['08_ANGGARAN'][0];
    srv.sheets['08_ANGGARAN'].push(objRow(AH, { id: 'ang_S', periode: 'September 2026', program: 'Honor Sep', kategori: 'Honor', unit: 'MI', nominal: 100000, status: 'DISETUJUI', subkategori: '' }));
    const TH = srv.sheets['05_TRANSAKSI'][0];
    srv.sheets['05_TRANSAKSI'].push(objRow(TH, { id: 't8', jenis: 'PENGELUARAN', tanggal: '2026-10-12', unit: 'MI', nominal: 60000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', createdAt: '2026-10-12T01:00:00.000Z', kategori: 'Kertas', penerima: 'Toko t8' }));
    const same = safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id: 'alg_t8x', row: { transaksiId: 't8', anggaranId: 'ang_S', nominal: 60000, tingkatPemetaan: 'ITEM' } }]));
    const M = srv.sb.rabMatchAll_(D_of(srv)), O = srv.sb.rabRingkasanPeriode_(M, 'Oktober 2026'), Sp = srv.sb.rabRingkasanPeriode_(M, 'September 2026');
    const lineS = M.lines.find(L => L.rabIds.indexOf('ang_S') !== -1);
    rec('RAB-33', 'lintas periode (karakterisasi, NEEDS_POLICY_DECISION)', same.ok && same.data.results[0].code === 'CREATED' && O.terpetakanPeriodeLain === 60000 && O.realisasiDisetujui === 1100000 && Sp.realisasiDisetujui === 0 && lineS.realisasi === 60000 && invRS(O),
      'alokasi transaksi Okt -> RAB Sep DITERIMA server (belum ada aturan periode); Beranda Okt: garis periode lain ' + O.terpetakanPeriodeLain + ', bukan B; realisasi garis Sep (I04) ' + lineS.realisasi + ' (temuan T5)');
    // RAB Sep, transaksi Okt tanpa alokasi: aturan kategori tidak mencocokkan lintas bulan
    if (!srv.sheets['21_KATEGORI_PENGELUARAN'].some(r => r[2] === 'Honor')) srv.sheets['21_KATEGORI_PENGELUARAN'].push(['KAT_HONOR', '9', 'Honor', 'Aktif']); // [P1_20 D] kategori wajib ada di master (validasi server)
    const t9 = safe(() => srv.sb.opCreateExpense({ tanggal: '2026-10-13', unit: 'MI', nominal: 5000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'Honor', penerima: 'Guru A', clientRequestId: 'lb_t9' }));
    srv.sheets['08_ANGGARAN'] = srv.sheets['08_ANGGARAN'].filter(r => r[0] !== 'ang_D'); // hanya garis Honor September yang tersisa
    const M2 = srv.sb.rabMatchAll_(D_of(srv)), p9 = t9.ok && M2.perTrx[t9.data.id];
    rec('RAB-34', 'RAB Sep + transaksi Okt (karakterisasi)', !!p9 && p9.sumber === 'TANPA_RAB' && !p9.disetujui, 'transaksi Okt kategori Honor, hanya RAB Honor Sep -> ' + (p9 && p9.sumber) + ' (tidak otomatis diterima maupun ditolak sebagai data)');
    // tanggal transaksi: kosong/format salah ditolak; tanggal tidak mungkin DITERIMA (temuan T4, usulan U-4)
    const dt = d => { const r = safe(() => srv.sb.opCreateExpense({ tanggal: d, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: 'dt_' + d })); return r.ok ? 'OK:' + srv.sb.fccPeriodeOfDate_(d) : r.code; };
    const res = { kosong: dt(''), format: dt('12/10/2026'), bulan13: dt('2026-13-40'), feb30: dt('2026-02-30') };
    // [P0-T4, 19-10-2026] ekspektasi diperbarui: semula karakterisasi temuan T4 (tanggal mustahil DITERIMA, "menunggu U-4");
    // perbaikan validasi kalender kini diminta eksplisit (Master Task P0 Bagian B) -> tanggal mustahil DITOLAK.
    rec('RAB-35', 'tanggal tidak valid (T4 diperbaiki P0-T4)', res.kosong === 'VALIDATION_ERROR' && res.format === 'VALIDATION_ERROR' && res.bulan13 === 'VALIDATION_ERROR' && res.feb30 === 'VALIDATION_ERROR',
      J(res) + ' -> tanggal kalender mustahil kini ditolak server (sebelumnya diterima: temuan T4)');
  }
  // ================= LPJ bulan berikutnya (P1_12 kasus 1/2/10) =================
  { const srv = makeServer();
    const D0 = J(srv.sb.rabRingkasanPeriode_(srv.sb.rabMatchAll_(D_of(srv)), 'September 2026')), fc0 = srv.sb.opFinancialControl('September 2026').data;
    const lp = (id, nominal) => { const r = safe(() => srv.sb.opRecordBatch('lpj', [{ op: 'upsert', id, row: { tanggal: '2026-10-03', unit: 'MI', kategori: 'ATK', item: 'Kertas', nominal, status: 'REALIZATION', transaksiId: 'imp_trx_2' } }])); return r.ok ? r.data.results[0].code : r.code; };
    const a = lp('lpj_okt1', 30000), b = lp('lpj_okt2', 30000);
    const fc1 = srv.sb.opFinancialControl('September 2026').data;
    rec('RAB-36', 'LPJ bulan berikutnya', a === 'CREATED' && b === 'LPJ_EXCEEDS_TRANSACTION' && J(srv.sb.rabRingkasanPeriode_(srv.sb.rabMatchAll_(D_of(srv)), 'September 2026')) === D0
      && fc1.actual.expensePeriode === fc0.actual.expensePeriode && fc1.actual.cashPosition === fc0.actual.cashPosition,
      'transaksi Sep 50.000 + LPJ Okt 30.000 diterima; LPJ tambahan 30.000 ditolak (' + b + '); pengeluaran/saldo/ringkasan Sep tidak berubah (LPJ bukan pengeluaran kedua)');
  }
  // ================= Regresi: Keputusan 2 tidak mengubah KPI mana pun (baseline = HEAD sebelum Keputusan 2) =================
  { let preJs = '';
    try { preJs = cp.execFileSync('git', ['show', (process.env.RAB2_BASELINE_REF || 'b26de58') + ':Bendahara_V2.html'], { cwd: OUT, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\r/g, '').match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1]; } catch (e) { }
    if (!preJs) rec('RAB-37', 'regresi KPI Keputusan 2', false, 'baseline b26de58 tidak terbaca');
    else {
      const k = async (code, fx, p) => { const srv = fx ? fixture(makeServer()) : makeServer(); const c = await bootClient(srv, code); return J(kpiPack(c.sb.kpiIndukSummary(p))); };
      const r = [await k(preJs, true, 'Oktober 2026') === await k(js, true, 'Oktober 2026'), await k(preJs, false, 'September 2026') === await k(js, false, 'September 2026')];
      const fn = (code, n) => { const m = new RegExp('^function ' + n + '\\(', 'm').exec(code); return m ? code.slice(m.index, code.indexOf('\n}', m.index)) : null; };
      const same = ['financialAktivitasFeed', 'rabMendekatiPagu', 'pengeluaranDiLuarRabBulanIni', 'totalPengeluaran'].filter(n => fn(preJs, n) !== fn(js, n));
      rec('RAB-37', 'regresi KPI Keputusan 2', r.every(Boolean) && same.length === 0, 'seluruh KPI (termasuk BDS03) identik vs b26de58 pada fixture RAB & default: ' + J(r) + (same.length ? ' berubah: ' + same.join(',') : '; financialAktivitasFeed/rabMendekatiPagu/pengeluaranDiLuarRabBulanIni/totalPengeluaran identik'));
    }
  }
  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
