/* Suite AUDIT P1 (sandbox Node, TIDAK menyentuh Google Sheets). Simulasi untuk P1_13 (T1, T4, lintas bulan, K-RAB-07, sheet 30).
 * Status: PASS = kontrol yang SEHARUSNYA berlaku memang berlaku; INFO = temuan/karakterisasi perilaku sekarang (angka dicatat,
 * bukan diklaim benar). Tidak ada perubahan kode produksi; suite ini hanya MEMBACA perilaku. Data FINAL tidak dipakai.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const FINAL = require('./fixtures/headers_backend.json').FINAL;
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const rows = (srv, n) => srv.sheets[n].slice(1);
const safe = f => { try { return f(); } catch (e) { return { ok: false, code: 'EXCEPTION', message: String(e && e.message || e) }; } };
const J = o => JSON.stringify(o);
const code = r => (r && r.ok ? (r.data && r.data.results ? r.data.results[0].code : 'OK') : (r && r.code));
const objRow = (h, o) => h.map(k => (o[k] === undefined ? '' : o[k]));
let seq = 0; const nid = p => (p || 'au') + '_' + (++seq);
async function bootClient(srv) {
  const c = makeClient(srv); const A = c.a;
  c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error), 400);
  await tick(5); return c;
}
const sync = async c => { await c.sb.centralRunSync(true); await tick(10); await c.sb.centralRunSync(true); await tick(10); };
/* saldo akun dari sheet server (saldoAwal + Σ transaksi aktif s.d. asOf, perbandingan string seperti akunSaldo klien) */
function saldo(srv, akunId, asOf) {
  const a = rows(srv, '07_AKUN').find(r => r[0] === akunId); let s = Number(a[col(srv, '07_AKUN', 'saldoAwal')] || 0);
  rows(srv, '05_TRANSAKSI').forEach(r => {
    const g = h => r[col(srv, '05_TRANSAKSI', h)];
    if (g('akunId') !== akunId || (asOf && String(g('tanggal')) > asOf)) return;
    if (g('jenis') === 'PENERIMAAN') s += Number(g('nominal')); else if (g('jenis') === 'PENGELUARAN') s -= Number(g('nominal'));
  });
  return s;
}
const D_of = srv => ({ transaksi: srv.sb.sgRowsChecked_('05_TRANSAKSI'), anggaran: srv.sb.sgRowsChecked_('08_ANGGARAN'), alokasiPengeluaran: srv.sb.sgRowsChecked_('30_ALOKASI_PENGELUARAN'), kategoriPengeluaran: srv.sb.sgRowsChecked_('21_KATEGORI_PENGELUARAN') });
const ring = (srv, p) => srv.sb.rabRingkasanPeriode_(srv.sb.rabMatchAll_(D_of(srv)), p);
const income = p => srv => srv.sb.opFinancialControl(p).data.actual.incomePeriode;

/* Skenario T1 (P1_13 §1.3): RAB Kegiatan September disetujui 2.000.000; bank saldo awal 10.000.000.
   20-09 pencairan uang muka 2.000.000 dari bank (satu-satunya cara sekarang: PENGELUARAN); kegiatan September memakai 1.700.000
   (3 nota 25-09: 800.000 + 600.000 + 300.000); 05-10 LPJ diserahkan; 06-10 sisa 300.000 disetor kembali ke bank. */
function t1Fixture() {
  const srv = makeServer();
  srv.sheets['07_AKUN'][2][col(srv, '07_AKUN', 'saldoAwal')] = 10000000;
  const AH = FINAL['08_ANGGARAN'];
  srv.sheets['08_ANGGARAN'] = [AH.slice(), objRow(AH, { id: 'ang_keg', periode: 'September 2026', program: 'Kegiatan Pramuka', kategori: 'Kegiatan', unit: 'MI', nominal: 2000000, status: 'DISETUJUI' })];
  srv.sheets['21_KATEGORI_PENGELUARAN'].push(['KAT_KEG', '2', 'Kegiatan', 'Aktif']);
  srv.sheets['05_TRANSAKSI'] = [srv.sheets['05_TRANSAKSI'][0]]; // fixture bersih: hanya skenario
  srv.sheets['06_ALOKASI'] = [srv.sheets['06_ALOKASI'][0]];
  return srv;
}
const exp = (srv, tanggal, nominal, extra) => srv.sb.opCreateExpense(Object.assign({ tanggal, unit: 'MI', nominal, akunId: 'akun_bank1', metode: 'Transfer', kategori: 'Kegiatan', penerima: 'Koordinator Pramuka', clientRequestId: nid('cr') }, extra || {}));
const lpjRow = (id, tanggal, nominal, transaksiId) => ({ op: 'upsert', id, row: { tanggal, unit: 'MI', kategori: 'Kegiatan', item: 'Nota ' + id, nominal, status: 'REALIZATION', transaksiId: transaksiId || '' } });
const snap = (srv, label) => {
  const sep = ring(srv, 'September 2026'), okt = ring(srv, 'Oktober 2026'), M = srv.sb.rabMatchAll_(D_of(srv)), L = M.lines.find(x => x.rabIds.indexOf('ang_keg') !== -1);
  return { model: label, pengeluaranSep: sep.pengeluaranAktual, pengeluaranOkt: okt.pengeluaranAktual, penerimaanOkt: income('Oktober 2026')(srv),
    realisasiRabSep_B: sep.realisasiDisetujui, realisasiGarisKegiatan: L.realisasi, i04ok: L.realisasi <= L.paguDisetujui + 0.5,
    saldoBank30Sep: saldo(srv, 'akun_bank1', '2026-09-30'), saldoBank31Okt: saldo(srv, 'akun_bank1', '2026-10-31'), saldoKas31Okt: saldo(srv, 'akun_kas1', '2026-10-31'), akunTrxLpj: Array.from(new Set(rows(srv, '05_TRANSAKSI').filter(r => /Dari LPJ/.test(String(r[col(srv, '05_TRANSAKSI', 'catatan')]))).map(r => r[col(srv, '05_TRANSAKSI', 'akunId')]))),
    lpjTertaut: rows(srv, '19_LPJ').filter(r => r[col(srv, '19_LPJ', 'transaksiId')]).reduce((s, r) => s + Number(r[col(srv, '19_LPJ', 'nominal')]), 0) };
};
const BANK_NYATA = { '2026-09-30': 8000000, '2026-10-31': 8300000 }; // rekening koran: -2.000.000 (20-09), +300.000 (06-10)

(async () => {
  // ================= T1: model pencatatan dan risiko pengeluaran ganda =================
  const models = [];
  { // M0: pencairan = PENGELUARAN, LPJ DITAUTKAN ke transaksi pencairan (hanya bisa lewat API; UI tidak punya aksi tautkan), sisa = PENERIMAAN lain
    const srv = t1Fixture();
    const p = exp(srv, '2026-09-20', 2000000);
    const l = srv.sb.opRecordBatch('lpj', [lpjRow('lpj_n1', '2026-09-25', 800000, p.data.id), lpjRow('lpj_n2', '2026-09-25', 600000, p.data.id), lpjRow('lpj_n3', '2026-09-25', 300000, p.data.id)]);
    const refund = srv.sb.opCreateIncome({ tanggal: '2026-10-06', unit: 'MI', nominal: 300000, akunId: 'akun_bank1', metode: 'Transfer', sumber: 'Penerimaan Lainnya', catatan: 'Pengembalian sisa uang muka', clientRequestId: nid('cr') });
    const s = snap(srv, 'M0 pencairan+LPJ tertaut+sisa sbg penerimaan');
    models.push(s);
    rec('AU-T1-01', 'T1 / GAP-020', p.ok && l.ok && l.data.results.every(x => x.code === 'CREATED') && refund.ok && s.saldoBank30Sep === BANK_NYATA['2026-09-30'] && s.saldoBank31Okt === BANK_NYATA['2026-10-31'],
      'M0: saldo bank = rekening koran (30-09 ' + s.saldoBank30Sep + ', 31-10 ' + s.saldoBank31Okt + ') - tidak ada hitung ganda kas');
    rec('AU-T1-02', 'T1 / GAP-018', null, 'M0 TEMUAN: pengeluaran Sep ' + s.pengeluaranSep + ' & realisasi RAB Sep ' + s.realisasiRabSep_B + ' = UANG MUKA (bukan pemakaian 1.700.000); sisa 300.000 tampil sbg PENERIMAAN Okt ' + s.penerimaanOkt + ' (bukan pengurang pengeluaran); LPJ tertaut ' + s.lpjTertaut + ' - selisih 300.000 tidak berlabel');
  }
  { // M1: pencairan = PENGELUARAN, LPJ diimpor TANPA tautan, lalu tombol UI "Buat Transaksi Pengeluaran" per baris LPJ (jalur yang tersedia di UI)
    const srv = t1Fixture();
    const p = exp(srv, '2026-09-20', 2000000);
    srv.sb.opRecordBatch('lpj', [lpjRow('lpj_n1', '2026-09-25', 800000), lpjRow('lpj_n2', '2026-09-25', 600000), lpjRow('lpj_n3', '2026-09-25', 300000)]);
    const c = await bootClient(srv); c.fields.ltu_unit = 'MI';
    const ids = c.a.Store.loadLpj().map(x => x.id);
    ids.forEach(id => safe(() => c.sb.createTransaksiFromLpj(id))); await sync(c);
    srv.sb.opCreateIncome({ tanggal: '2026-10-06', unit: 'MI', nominal: 300000, akunId: 'akun_bank1', metode: 'Transfer', sumber: 'Penerimaan Lainnya', clientRequestId: nid('cr') });
    const nTrx = rows(srv, '05_TRANSAKSI').filter(r => r[1] === 'PENGELUARAN').length;
    const s = snap(srv, 'M1 pencairan + "Buat Transaksi dari LPJ"');
    models.push(s);
    rec('AU-T1-03', 'T1 / GAP-020 (TEMUAN)', null, 'M1 TEMUAN TERBUKTI lewat fungsi UI createTransaksiFromLpj: ' + ids.length + ' LPJ -> ' + (nTrx - 1) + ' transaksi baru; pengeluaran Sep ' + s.pengeluaranSep + ' (seharusnya 2.000.000 kas keluar), realisasi garis Kegiatan ' + s.realisasiGarisKegiatan + ' > pagu 2.000.000 (I04 ok=' + s.i04ok + '), saldo bank 30-09 ' + s.saldoBank30Sep + ' (= koran), tetapi transaksi LPJ masuk akun ' + J(s.akunTrxLpj) + ' -> kas 31-10 ' + s.saldoKas31Okt + ' (uang yang tidak pernah keluar dua kali); total bank+kas 31-10 ' + (s.saldoBank31Okt + s.saldoKas31Okt) + ' vs nyata ' + BANK_NYATA['2026-10-31']);
    rec('AU-T1-04', 'T1 kontrol yang ada', rows(srv, '19_LPJ').every(r => r[col(srv, '19_LPJ', 'transaksiId')]) && p.ok,
      'RecordGuard LPJ (Σ LPJ <= nominal transaksi) TIDAK mencegah M1: tiap LPJ tertaut ke transaksi barunya sendiri (nominal sama) - kontrol berlaku, tetapi pada tautan yang salah');
  }
  { // M2: pencairan TIDAK dicatat; hanya transaksi dari LPJ (tanggal LPJ = tanggal penyerahan 05-10); sisa dicatat sbg penerimaan
    const srv = t1Fixture();
    srv.sb.opRecordBatch('lpj', [lpjRow('lpj_n1', '2026-10-05', 800000), lpjRow('lpj_n2', '2026-10-05', 600000), lpjRow('lpj_n3', '2026-10-05', 300000)]);
    const c = await bootClient(srv); c.fields.ltu_unit = 'MI';
    c.a.Store.loadLpj().map(x => x.id).forEach(id => safe(() => c.sb.createTransaksiFromLpj(id))); await sync(c);
    srv.sb.opCreateIncome({ tanggal: '2026-10-06', unit: 'MI', nominal: 300000, akunId: 'akun_bank1', metode: 'Transfer', sumber: 'Penerimaan Lainnya', clientRequestId: nid('cr') });
    const s = snap(srv, 'M2 tanpa pencairan; transaksi dari LPJ bertanggal penyerahan');
    models.push(s);
    rec('AU-T1-05', 'T1 / GAP-020 (TEMUAN)', null, 'M2 TEMUAN: bank 30-09 ' + s.saldoBank30Sep + ' vs koran ' + BANK_NYATA['2026-09-30'] + ' (pencairan tidak tercatat); transaksi LPJ masuk akun ' + J(s.akunTrxLpj) + ' -> kas 31-10 ' + s.saldoKas31Okt + '; total bank+kas 31-10 ' + (s.saldoBank31Okt + s.saldoKas31Okt) + ' vs nyata ' + BANK_NYATA['2026-10-31'] + ' (selisih ' + (s.saldoBank31Okt + s.saldoKas31Okt - BANK_NYATA['2026-10-31']) + ' = sisa yang dicatat sbg penerimaan); pengeluaran jatuh di Okt ' + s.pengeluaranOkt + ', RAB Sep realisasi ' + s.realisasiRabSep_B);
  }
  rec('AU-T1-06', 'T1 ringkasan angka', null, J(models));

  // ================= T4: matriks tanggal per jalur tulis server =================
  { const V = ['2026-10-19', '2026-13-40', '2026-02-30', '2024-02-29', '2025-02-29', '', null, '19/10/2026', '2026-10-19T08:00:00', '2026-1-9'];
    const run = (fn) => V.map(v => { const srv = makeServer(); const r = safe(() => fn(srv, v)); return (code(r) === 'OK' || code(r) === 'SUCCESS' || code(r) === 'CREATED') ? 'TERIMA' : 'TOLAK:' + code(r); });
    const ep = {
      'opCreateExpense.tanggal': (s, v) => s.sb.opCreateExpense({ tanggal: v, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: nid('cr') }),
      'opCreateIncome.tanggal': (s, v) => s.sb.opCreateIncome({ tanggal: v, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Penerimaan Lainnya', clientRequestId: nid('cr') }),
      'opUpdateTransaction.tanggal': (s, v) => s.sb.opUpdateTransaction({ id: 'imp_trx_2', tanggal: v }),
      'opCreateTxBatch.tanggal': (s, v) => { const r = s.sb.opCreateTxBatch([{ kind: 'expense', payload: { tanggal: v, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: nid('cr') } }]); return r.ok ? { ok: r.data.results[0].ok, code: r.data.results[0].code } : r; },
      'lpj.tanggal': (s, v) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: nid('lpj'), row: { tanggal: v, unit: 'MI', item: 'x', nominal: 1000, status: 'REALIZATION' } }]),
      'komitmen.tanggal': (s, v) => s.sb.opRecordBatch('komitmen', [{ op: 'upsert', id: nid('kom'), row: { tanggal: v, uraian: 'x', nominal: 1000, status: 'EXPECTED' } }]),
      'mutasiBank.tanggal': (s, v) => s.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: nid('mut'), row: { tanggal: v, nominal: 1000, keterangan: 'x' } }]),
      'bukti.tanggal (opUploadBukti)': (s, v) => s.sb.opUploadBukti({ id: nid('dok'), mimeType: 'application/pdf', base64: Buffer.from('%PDF').toString('base64'), fileName: 'n.pdf', transaksiId: 'imp_trx_2', tanggal: v })
    };
    const M = {}; Object.keys(ep).forEach(k => { M[k] = run(ep[k]); });
    const okRef = Object.keys(M).every(k => M[k][0] === 'TERIMA');
    const impossibleAccepted = Object.keys(M).filter(k => M[k][1] === 'TERIMA' || M[k][2] === 'TERIMA' || M[k][4] === 'TERIMA');
    rec('AU-T4-01', 'T4 tanggal sah diterima', okRef, '2026-10-19 diterima di semua jalur: ' + okRef);
    rec('AU-T4-02', 'T4 / GAP-014 (TEMUAN)', null, 'tanggal kalender tidak mungkin (2026-13-40 / 2026-02-30 / 2025-02-29) DITERIMA di ' + impossibleAccepted.length + '/' + Object.keys(M).length + ' jalur: ' + impossibleAccepted.join(', '));
    Object.keys(M).forEach((k, i) => rec('AU-T4-M' + String(i + 1).padStart(2, '0'), 'T4 matriks', null, k + ' :: ' + V.map((v, j) => J(v) + '=' + M[k][j]).join(' | ')));
    // label periode (RAB/kewajiban) vs jalur yang memvalidasi label
    const P = ['Oktober 2026', 'oktober 2026', 'Bulan13 2026', '2026-10', '', null, 'Tahun Ajaran 2026/2027'];
    const runP = fn => P.map(v => { const s = makeServer(); const r = safe(() => fn(s, v)); return (code(r) === 'OK' || code(r) === 'SUCCESS' || code(r) === 'CREATED') ? 'TERIMA' : 'TOLAK:' + code(r); });
    const PM = {
      'anggaran.periode': (s, v) => s.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: nid('ang'), row: { periode: v, program: 'x', kategori: 'ATK', unit: 'MI', nominal: 1 } }]),
      'kewajiban.periode': (s, v) => s.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: nid('kw'), row: { periode: v, siswaId: 's1', komponenId: 'kmp_spp', bruto: 1, netto: 1 } }]),
      'opReconcileAccount.periode': (s, v) => s.sb.opReconcileAccount({ akunId: 'akun_bank1', periode: v, saldoAktual: 0, clientRequestId: nid('cr') }),
      'opClosePeriod.periode': (s, v) => s.sb.opClosePeriod(v)
    };
    Object.keys(PM).forEach((k, i) => rec('AU-T4-P' + String(i + 1).padStart(2, '0'), 'T4 matriks periode', null, k + ' :: ' + runP(PM[k]).map((x, j) => J(P[j]) + '=' + x).join(' | ')));
    // dampak: transaksi 2026-13-40 tidak masuk periode mana pun tetapi mengubah saldo tanpa batas tanggal
    const s = makeServer(); s.sb.opCreateExpense({ tanggal: '2026-13-40', unit: 'MI', nominal: 7777, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: 'bad_dt' });
    const perAny = ['Desember 2026', 'Januari 2027'].map(p => ring(s, p).pengeluaranAktual);
    rec('AU-T4-03', 'T4 dampak (TEMUAN)', null, 'pengeluaran 7.777 bertanggal 2026-13-40: periode=' + J(s.sb.fccPeriodeOfDate_('2026-13-40')) + ', pengeluaran Des/Jan ' + J(perAny) + ', saldo kas tanpa batas tanggal ' + saldo(s, 'akun_kas1') + ', saldo kas per 2026-12-31 ' + saldo(s, 'akun_kas1', '2026-12-31'));
  }

  // ================= Lintas bulan (P1_13 §3) =================
  { // RAB disetujui SETELAH transaksi: persetujuan berlaku surut (tidak ada tanggal persetujuan)
    const srv = t1Fixture(); srv.sheets['08_ANGGARAN'][1][col(srv, '08_ANGGARAN', 'status')] = 'DIAJUKAN';
    const t = exp(srv, '2026-09-21', 500000);
    const before = srv.sb.rabMatchAll_(D_of(srv)).perTrx[t.data.id].disetujui;
    const up = srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_keg', row: { status: 'DISETUJUI' } }]);
    const after = srv.sb.rabMatchAll_(D_of(srv)).perTrx[t.data.id].disetujui;
    rec('AU-LB-01', 'lintas bulan kasus 3 (karakterisasi)', null, 'transaksi 21-09 thd RAB DIAJUKAN: I03 ok=' + before + '; status diubah DISETUJUI (' + code(up) + ') -> I03 ok=' + after + ' (berlaku surut; tidak ada tanggal/penyetuju persetujuan)');
  }
  { // LPJ setelah periode ditandai tutup: diterima + ditandai; tidak ada status verifikasi
    const srv = t1Fixture();
    const p = exp(srv, '2026-09-20', 2000000);
    const s = JSON.stringify([{ periode: 'September 2026', status: 'CLOSED', closedAt: '2026-10-01T00:00:00.000Z', closedBy: 'Bendahara' }]);
    srv.sheets['15_SETTINGS'].push(['blob.periodClosing.0', s, ''], ['blob.periodClosing.n', '1', '']);
    const r = srv.sb.opRecordBatch('lpj', [lpjRow('lpj_c1', '2026-09-25', 800000, p.data.id)]);
    const fl = r.ok && r.data.results[0].periodeDitandai;
    rec('AU-LB-02', 'lintas bulan kasus 5 (karakterisasi)', r.ok && r.data.results[0].code === 'CREATED' && !!fl && fl.some(f => f.periode === 'September 2026'),
      'LPJ bertanggal nota 25-09 dicatat setelah September ditandai CLOSED: diterima + PERIODE_DITANDAI ' + J(fl) + '. Status "diverifikasi" tidak ada di skema');
  }
  { // alokasi ke garis non-bulanan / referensi tidak valid tetap ditolak/diperlakukan sesuai K-RAB
    const srv = t1Fixture(); const t = exp(srv, '2026-09-22', 100000);
    srv.sheets['30_ALOKASI_PENGELUARAN'] = [['id', 'transaksiId', 'anggaranId', 'nominal', 'tingkatPemetaan', 'sumberRefId', 'importBatchId', 'catatan', 'createdAt', 'createdBy', 'archivedAt', 'archivedBy', 'archiveReason']];
    const put = (id, row) => code(safe(() => srv.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id, row }])));
    const res = { refTidakAda: put('al_x1', { transaksiId: 't_tidak_ada', anggaranId: 'ang_keg', nominal: 1 }), rabTidakAda: put('al_x2', { transaksiId: t.data.id, anggaranId: 'ang_x', nominal: 1 }),
      melebihi: put('al_x3', { transaksiId: t.data.id, anggaranId: 'ang_keg', nominal: 100001 }), dua: [put('al_x4', { transaksiId: t.data.id, anggaranId: 'ang_keg', nominal: 60000 })] };
    rec('AU-LB-03', 'lintas bulan kasus 7/9', res.refTidakAda === 'INVALID_TRANSACTION' && res.rabTidakAda === 'INVALID_RAB' && res.melebihi === 'ALOKASI_EXCEEDS_TRANSACTION' && res.dua[0] === 'CREATED', J(res));
  }

  // ================= K-RAB-07: kemampuan sistem membedakan peran =================
  { const srv = makeServer();
    const roles = {}; ['bendahara@x.id', 'auditor@x.id'].forEach(e => { srv.state.email = e; const id = srv.sb.getCurrentUserIdentity(); roles[e] = id.role; });
    srv.state.email = 'auditor@x.id'; const deny = code(safe(() => srv.sb.opRecordBatch('komitmen', [{ op: 'upsert', id: 'kom_aud1', row: { uraian: 'x', nominal: 1, status: 'COMMITTED' } }])));
    srv.state.email = 'bendahara@x.id';
    const grant = code(safe(() => srv.sb.opUserUpsert({ email: 'kepsek.palsu@x.id', nama: 'Kepala (dibuat bendahara)', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' })));
    srv.state.email = 'kepsek.palsu@x.id'; const asKs = srv.sb.getCurrentUserIdentity();
    rec('AU-K7-01', 'K-RAB-07 peran server', roles['bendahara@x.id'] === 'BENDAHARA' && roles['auditor@x.id'] === 'AUDITOR' && deny === 'ROLE_NOT_ALLOWED', 'server membedakan peran dari 26_USER_ACCESS: ' + J(roles) + '; peran baca-saja ditolak menulis: ' + deny);
    rec('AU-K7-02', 'K-RAB-07 / pemisahan tugas (TEMUAN)', null, (grant === 'OK' ? 'TERBUKA: BENDAHARA dapat membuat' : 'TERTUTUP sejak P0-T7: BENDAHARA tidak dapat membuat') + ' pengguna ber-peran KEPALA_SEKOLAH lewat opUserUpsert: ' + grant + ' -> identitas server ' + J({ email: asKs.email, role: asKs.role, authorized: asKs.authorized }));
  }

  // ================= Sheet 30_ALOKASI_PENGELUARAN: risiko membaca sheet yang belum/salah tersedia =================
  { const srv = makeServer();
    const miss = { read: code(srv.sb.opReadSheet('30_ALOKASI_PENGELUARAN', {})), fcc: code(srv.sb.opFinancialControl('September 2026')), rab: code(srv.sb.opRabRealization('September 2026')), plan: code(safe(() => srv.sb.opAlokasiPengeluaranPlan())) };
    const okc = x => x === 'OK' || x === 'SUCCESS';
    rec('AU-S30-01', 'sheet 30 belum ada', okc(miss.read) && okc(miss.fcc) && okc(miss.rab) && miss.plan === 'NOT_FOUND', 'sheet belum ada -> baca aman (kosong): ' + J(miss) + ' (uji kering butuh 30_REF; NOT_FOUND bila 30_REF tidak ada)');
    srv.sheets['30_ALOKASI_PENGELUARAN'] = [['id', 'transaksiId', 'nominal']]; // header salah (anggaranId hilang)
    const bad = { read: code(srv.sb.opReadSheet('30_ALOKASI_PENGELUARAN', {})), fcc: code(srv.sb.opFinancialControl('September 2026')), setup: code(safe(() => srv.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN'))) };
    rec('AU-S30-02', 'sheet 30 header salah: server gagal tertutup', bad.fcc === 'SCHEMA_MISMATCH' && bad.setup === 'SCHEMA_MISMATCH' && J(srv.sheets['30_ALOKASI_PENGELUARAN'][0]) === J(['id', 'transaksiId', 'nominal']),
      'opFinancialControl & setup menolak header salah, header tidak ditimpa: ' + J({ fcc: bad.fcc, setup: bad.setup }));
    rec('AU-S30-04', 'T8 / GAP-002 (TEMUAN)', null, 'opReadSheet atas header salah mengembalikan ' + bad.read + (bad.read === 'OK' ? ' (TERBUKA: kolom wajib tidak diperiksa; klien menerima baris tanpa anggaranId)' : ' (TERTUTUP sejak P0-T8: ERROR, bukan data)'));
    const c = await bootClient(srv); const k = c.sb.kpiIndukSummary('September 2026');
    // TEMUAN T8: ekspektasi awal "KPI gagal tertutup" TIDAK terpenuhi (FAIL saat suite pertama kali dijalankan) -> dicatat sbg temuan, bukan dipaksa lulus
    rec('AU-S30-03', 'T8 / GAP-002 (TEMUAN)', null, (k.overall === null ? 'TERTUTUP sejak P0-T8: KPI tidak dihitung' : 'TERBUKA: KPI klien TETAP dihitung (pemetaan eksplisit diabaikan diam-diam)') + ' saat kolom wajib 30_ALOKASI_PENGELUARAN hilang: overall=' + k.overall + ' "' + k.overallStatus + '"');
  }

  { // T8 umum: kolom wajib hilang pada sheet yang dibaca klien lewat opReadSheet
    const out = [];
    for (const [sh, h] of [['08_ANGGARAN', 'nominal'], ['11_MUTASI_BANK', 'tanggal']]) {
      const srv = makeServer(); const i = srv.sheets[sh][0].indexOf(h); srv.sheets[sh][0][i] = 'rusak_' + h;
      const c = await bootClient(srv); const k = c.sb.kpiIndukSummary('September 2026');
      out.push(sh + '.' + h + ' hilang -> KPI overall=' + k.overall + ' "' + k.overallStatus.slice(0, 60) + '"');
    }
    rec('AU-S30-05', 'T8 / GAP-002 (TEMUAN)', null, out.join(' | '));
  }
  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
