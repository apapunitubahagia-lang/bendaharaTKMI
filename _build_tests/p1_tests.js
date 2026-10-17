/* Suite P1 (sandbox Node, TIDAK menyentuh Google Sheets).
 * Setiap tes menyatakan PERILAKU YANG DIHARAPKAN setelah perbaikan P1.
 * Dijalankan pada kode baseline P1 (= hasil P0, commit ac206e7) untuk membuktikan GAP mana yang terulang
 * (FAIL = GAP terbukti), lalu pada branch p1/implementasi untuk membuktikan perbaikan (PASS).
 * Status: PASS / FAIL / INFO (dicatat; kriteria memerlukan lingkungan live).
 * Label kedua tiap tes = ID test case 07_RANCANGAN_TEST_CASE.md dan/atau ID temuan 05_DAFTAR_GAP_DAN_RISIKO.xlsx.
 * Varian sandbox: data uji standar (DU) dokumen 07 memakai salinan FINAL; di sini dipakai fixture rekaan srv_env.js.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const cnt = (srv, n) => srv.sheets[n].length - 1;
const cell = (srv, n, id, h) => { const r = rows(srv, n).find(x => x[col(srv, n, 'id')] === id); return r ? r[col(srv, n, h)] : undefined; };
const audits = srv => rows(srv, '13_AUDIT_LOG').map(r => ({ aksi: r[col(srv, '13_AUDIT_LOG', 'aksi')], refId: r[col(srv, '13_AUDIT_LOG', 'refId')], after: r[col(srv, '13_AUDIT_LOG', 'after')], sumber: r[col(srv, '13_AUDIT_LOG', 'sumber')] }));
const safe = f => { try { return f(); } catch (e) { return { ok: false, code: 'EXCEPTION', message: String(e && e.message || e) }; } };
const J = o => JSON.stringify(o);
const short = r => J(r && { ok: r.ok, code: r.code, message: r.message && String(r.message).slice(0, 120), w: r.auditWarning }).slice(0, 220);
const exp = extra => Object.assign({ tanggal: '2026-10-11', unit: 'MI', nominal: 12345, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: 'crid_' + Math.random().toString(36).slice(2) }, extra || {});
/* status closing periode disimpan klien sebagai blob di 15_SETTINGS (format ccBlobPut_) */
function setClosed(srv, list) {
  const s = JSON.stringify(list.map(p => ({ periode: p, status: 'CLOSED', closedAt: '2026-10-01T00:00:00.000Z', closedBy: 'Bendahara' })));
  srv.sheets['15_SETTINGS'] = srv.sheets['15_SETTINGS'].filter(r => !String(r[0]).startsWith('blob.periodClosing.'));
  srv.sheets['15_SETTINGS'].push(['blob.periodClosing.0', s, ''], ['blob.periodClosing.n', '1', '']);
}
const applyArchiveCols = srv => safe(() => srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'));
async function bootClient(srv, opts) {
  const c = makeClient(srv, opts); const A = c.a;
  c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && (!A.CentralAuth.authorized || Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error)), 400);
  await tick(5);
  return c;
}
const sync = async c => { await c.sb.centralRunSync(true); await tick(10); await c.sb.centralRunSync(true); await tick(10); };

(async () => {
  // ================= P1-A: PENGUNCIAN PERIODE (server) =================
  { const srv = makeServer(); setClosed(srv, ['Oktober 2026']);
    const r = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-11' })));
    rec('P1L-01', 'TC-CRUD-05 / GAP-015', r.ok === false && r.code === 'PERIOD_LOCKED' && cnt(srv, '05_TRANSAKSI') === 2, short(r)); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const r = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-11' })));
    rec('P1L-02', 'TC-CRUD-05 / GAP-015', r.ok === true && cnt(srv, '05_TRANSAKSI') === 3, 'periode terbuka tetap dapat ditulis: ' + short(r)); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const a = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'ubah di periode tertutup' }));
    const ok2 = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-11', clientRequestId: 'mv1' })));
    const b = ok2.ok ? safe(() => srv.sb.opUpdateTransaction({ id: ok2.data.id, tanggal: '2026-09-30' })) : { ok: false, code: 'SETUP' };
    rec('P1L-03', 'TC-CRUD-05 / GAP-015', a.code === 'PERIOD_LOCKED' && b.code === 'PERIOD_LOCKED' && cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan') === '', J({ a: a.code, b: b.code })); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    srv.sheets['06_ALOKASI'] = [srv.sheets['06_ALOKASI'][0]]; // imp_trx_1 belum teralokasi
    const r = safe(() => srv.sb.opCreateAllocation({ transaksiId: 'imp_trx_1', siswaId: 's1', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 1000, clientRequestId: 'al1' }));
    rec('P1L-04', 'TC-CRUD-05 / GAP-015', r.ok === false && r.code === 'PERIOD_LOCKED' && cnt(srv, '06_ALOKASI') === 0, short(r)); }
  { const srv = makeServer(); applyArchiveCols(srv); setClosed(srv, ['September 2026']);
    const r = safe(() => srv.sb.opArchiveTransaction('imp_trx_2', 'uji'));
    rec('P1L-05', 'TC-CRUD-05 / GAP-015', r.ok === false && r.code === 'PERIOD_LOCKED' && (cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'archivedAt') || '') === '', short(r)); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const m = safe(() => srv.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: 'mut_uji_1', row: { tanggal: '2026-09-15', nominal: 5000, keterangan: 'x', status: 'BELUM_DIPROSES' } }]));
    const mr = m.ok ? m.data.results[0] : m;
    const k = safe(() => srv.sb.opRecordBatch('rekonsiliasi', [{ op: 'upsert', id: 'rk_uji_1', row: { akunId: 'akun_kas1', periode: 'September 2026', saldoSistem: 1, saldoAktual: 1, selisih: 0, status: 'SELESAI' } }]));
    const kr = k.ok ? k.data.results[0] : k;
    rec('P1L-06', 'TC-CRUD-05 / GAP-015', mr.code === 'PERIOD_LOCKED' && kr.code !== 'CREATED' && cnt(srv, '11_MUTASI_BANK') === 0 && cnt(srv, '16_REKONSILIASI') === 0, J({ mutasi: mr.code, rekon: kr.code })); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const r = safe(() => srv.sb.opSettingsUpsert([{ key: 'blob.periodClosing.0', value: '[]' }]));
    rec('P1L-07', 'GAP-015 (reopen beralasan)', r.ok === false && r.code === 'PERIOD_LOCK_API_REQUIRED' && rows(srv, '15_SETTINGS').some(x => x[0] === 'blob.periodClosing.0' && /CLOSED/.test(x[1])), 'reopen lewat setting generik: ' + short(r)); }
  { const srv = makeServer();
    const a = safe(() => srv.sb.opClosePeriod('September 2026'));
    const again = safe(() => srv.sb.opClosePeriod('September 2026'));
    srv.state.email = 'auditor@x.id'; const den = safe(() => srv.sb.opClosePeriod('Agustus 2026')); srv.state.email = 'bendahara@x.id';
    const st = safe(() => srv.sb.opPeriodLockStatus());
    const w = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-09-20' })));
    const au = audits(srv).filter(x => x.aksi === 'CLOSING_PERIODE');
    rec('P1L-08', 'GAP-015 (reopen beralasan)', a.ok === true && again.ok === true && again.data && again.data.unchanged === true && den.code === 'ROLE_NOT_ALLOWED' && st.ok && st.data.closed.indexOf('September 2026') !== -1 && w.code === 'PERIOD_LOCKED' && au.length === 1 && /google:bendahara@x.id/.test(au[0].sumber),
      J({ a: a.code, again: again.data && again.data.unchanged, den: den.code, w: w.code, audit: au.length })); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const noReason = safe(() => srv.sb.opReopenPeriod('September 2026', ''));
    const ok = safe(() => srv.sb.opReopenPeriod('September 2026', 'Koreksi nota ATK yang terlambat diterima'));
    const w = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-09-20' })));
    const au = audits(srv).filter(x => x.aksi === 'REOPEN_PERIODE');
    rec('P1L-09', 'GAP-015 (reopen beralasan)', noReason.code === 'VALIDATION_ERROR' && ok.ok === true && w.ok === true && au.length === 1 && /terlambat/.test(au[0].after), J({ noReason: noReason.code, ok: ok.code, w: w.code, audit: au.length })); }
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    const r = safe(() => srv.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_uji_lock', row: { tanggal: '2026-09-05', unit: 'MI', kategori: 'ATK', nominal: 1000, transaksiId: 'imp_trx_2', status: 'REALIZATION' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1L-10', 'TC-CRUD-05 / GAP-015', rr.code === 'PERIOD_LOCKED' && cnt(srv, '19_LPJ') === 0, 'LPJ periode tertutup: ' + J(rr.code)); }
  { // klien: Tutup Periode lewat server (bukan blob lokal / setting generik)
    const srv = makeServer(); const c = await bootClient(srv);
    safe(() => c.sb.closePeriode('September 2026')); await sync(c);
    const au = audits(srv).filter(x => x.aksi === 'CLOSING_PERIODE');
    rec('P1L-11', 'GAP-015 (reopen beralasan)', c.calls.indexOf('opClosePeriod') !== -1 && au.length === 1, J({ calls: c.calls.filter(x => /Period|Settings/.test(x)), audit: au.length })); }

  { // klien: antrean setting lama yang membawa blob closing tidak boleh menggagalkan setting lain / membuka periode
    const srv = makeServer(); setClosed(srv, ['September 2026']);
    const store = { draBendaharaV2_central_pending_settings: JSON.stringify({ 'blob.periodClosing.0': { value: '[]' }, 'blob.periodClosing.n': { value: '1' }, namaBendahara: { value: 'Bendahara Uji P1' } }) };
    const c = await bootClient(srv, { store }); await sync(c);
    const nb = rows(srv, '15_SETTINGS').find(x => x[0] === 'namaBendahara');
    rec('P1L-12', 'GAP-015 (reopen beralasan)', !!nb && nb[1] === 'Bendahara Uji P1' && rows(srv, '15_SETTINGS').some(x => x[0] === 'blob.periodClosing.0' && /CLOSED/.test(x[1])), J({ nama: nb && nb[1], calls: c.calls.filter(x => /Settings/.test(x)) })); }

  // ================= P1-B: AUDIT ATOMIK & IDEMPOTENSI =================
  { // audit transaksi berhasil, audit alokasi gagal -> tidak boleh tersisa audit parsial
    const srv = makeServer(); srv.state.failSetValuesOn = '13_AUDIT_LOG'; srv.state.failSetValuesSkip = 1;
    srv.sheets['06_ALOKASI'] = [srv.sheets['06_ALOKASI'][0]];
    const r = safe(() => srv.sb.opCreateIncome({ tanggal: '2026-10-10', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', siswaId: 's1', sumber: 'Pembayaran Siswa', clientRequestId: 'aud1',
      allocations: [{ siswaId: 's1', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 100000 }] }));
    const a = audits(srv);
    const consistent = r.ok ? (cnt(srv, '05_TRANSAKSI') === 3 && a.some(x => x.aksi === 'CREATE_TRANSACTION') && a.some(x => x.aksi === 'CREATE_ALLOCATION'))
      : (cnt(srv, '05_TRANSAKSI') === 2 && cnt(srv, '06_ALOKASI') === 0 && a.length === 0);
    rec('P1A-01', 'TC-FAIL-02, TC-FAIL-03 / GAP-013', consistent && !r.auditWarning, J({ r: [r.ok, r.code, r.auditWarning], trx: cnt(srv, '05_TRANSAKSI'), audit: a.map(x => x.aksi) })); }
  { // idempotency record gagal -> transaksi di-rollback; audit tidak boleh menyatakan transaksi dibuat
    const srv = makeServer(); srv.state.failSetValuesOn = '24_IDEMPOTENCY_LOG';
    const r = safe(() => srv.sb.opCreateExpense(exp({ clientRequestId: 'aud2' })));
    const a = audits(srv);
    rec('P1A-02', 'TC-FAIL-02, TC-FAIL-03 / GAP-013', r.ok === false && cnt(srv, '05_TRANSAKSI') === 2 && !a.some(x => x.aksi === 'CREATE_TRANSACTION'), J({ r: r.code, trx: cnt(srv, '05_TRANSAKSI'), audit: a.map(x => x.aksi) })); }
  { // baris audit aktor+role (API_*) satu kesatuan dengan audit wajib; tidak ada "sukses + auditWarning"
    const srv = makeServer(); srv.state.failSetValuesOn = '13_AUDIT_LOG'; srv.state.failSetValuesSkip = 1;
    const r = safe(() => srv.sb.opCreateExpense(exp({ clientRequestId: 'aud3' })));
    const a = audits(srv);
    const consistent = r.ok ? (!r.auditWarning && a.some(x => x.aksi === 'API_CREATE_EXPENSE') && a.some(x => x.aksi === 'CREATE_TRANSACTION'))
      : (cnt(srv, '05_TRANSAKSI') === 2 && a.length === 0);
    rec('P1A-03', 'TC-FAIL-02, TC-FAIL-03 / GAP-013', consistent, J({ r: [r.ok, r.code, r.auditWarning], audit: a.map(x => x.aksi) })); }
  { // updateTransaction: replay clientRequestId lama tidak menimpa perubahan yang lebih baru
    const srv = makeServer();
    const p1 = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'A', clientRequestId: 'upd_c1' }));
    const p2 = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'B', clientRequestId: 'upd_c2' }));
    const rp = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'A', clientRequestId: 'upd_c1' }));
    rec('P1A-04', 'TC-FAIL-02 / GAP-031', p1.ok && p2.ok && rp.ok && cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan') === 'B' && /replay/i.test(rp.message || ''), J({ rp: short(rp), catatan: cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan') })); }
  { // migrasi skema aditif: audit gagal -> tidak ada kolom yang ditambahkan (gagal tertutup)
    const srv = makeServer(); const before = srv.sheets['05_TRANSAKSI'][0].length; srv.state.failSetValuesOn = '13_AUDIT_LOG';
    const r = safe(() => srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'));
    rec('P1A-05', 'TC-FAIL-02, TC-FAIL-03 / GAP-013', r.ok === false && r.code === 'AUDIT_FAILED' && srv.sheets['05_TRANSAKSI'][0].length === before, J({ r: [r.ok, r.code, r.auditWarning], cols: [before, srv.sheets['05_TRANSAKSI'][0].length] })); }
  { // replay create tetap idempoten (regresi P0)
    const srv = makeServer(); const p = exp({ clientRequestId: 'aud6' });
    const a = safe(() => srv.sb.opCreateExpense(p)), b = safe(() => srv.sb.opCreateExpense(p));
    rec('P1A-06', 'TC-TRX-02', a.ok && b.ok && a.data.id === b.data.id && cnt(srv, '05_TRANSAKSI') === 3 && audits(srv).filter(x => x.aksi === 'CREATE_TRANSACTION').length === 1, J({ a: a.data && a.data.id, b: b.data && b.data.id })); }

  // ================= P1-C: REKONSILIASI BANK =================
  { const srv = makeServer();
    // saldo sistem akun_kas1 s.d. akhir September 2026 = 0 + 200000 - 50000 = 150000 (dihitung SERVER)
    const r = safe(() => srv.sb.opReconcileAccount({ akunId: 'akun_kas1', periode: 'September 2026', saldoAktual: 150000, saldoSistem: 999, clientRequestId: 'rk1' }));
    const row = rows(srv, '16_REKONSILIASI')[0];
    rec('P1R-01', 'TC-REK-03 / GAP-019', r.ok === true && !!row && Number(row[col(srv, '16_REKONSILIASI', 'saldoSistem')]) === 150000 && Number(row[col(srv, '16_REKONSILIASI', 'selisih')]) === 0 && row[col(srv, '16_REKONSILIASI', 'status')] === 'SELESAI', short(r)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('rekonsiliasi', [{ op: 'upsert', id: 'rk_forged', row: { akunId: 'akun_kas1', periode: 'September 2026', saldoSistem: 1, saldoAktual: 1, selisih: 0, status: 'SELESAI' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1R-02', 'TC-REK-03 / GAP-019', rr.ok === false && cnt(srv, '16_REKONSILIASI') === 0, 'rekonsiliasi rekaan klien lewat jalur generik: ' + J(rr.code)); }
  { const srv = makeServer();
    const a = safe(() => srv.sb.opReconcileAccount({ akunId: 'akun_kas1', periode: 'September 2026', saldoAktual: 140000, clientRequestId: 'rk3' }));
    const b = safe(() => srv.sb.opReconcileAccount({ akunId: 'akun_kas1', periode: 'September 2026', saldoAktual: 140000, catatan: 'Selisih kas kecil, ditelusuri', clientRequestId: 'rk3b' }));
    const st = b.ok && b.data ? b.data.status : null;
    rec('P1R-03', 'TC-REK-03 / GAP-019', a.code === 'VALIDATION_ERROR' && b.ok && st === 'PERLU_PENJELASAN' && Number(b.data.selisih) === -10000, J({ a: a.code, b: [b.code, st, b.data && b.data.selisih] })); }
  { const srv = makeServer(); const p = { akunId: 'akun_kas1', periode: 'September 2026', saldoAktual: 150000, clientRequestId: 'rk4' };
    const a = safe(() => srv.sb.opReconcileAccount(p)), b = safe(() => srv.sb.opReconcileAccount(p));
    rec('P1R-04', 'TC-REK-03 / GAP-031', a.ok && b.ok && cnt(srv, '16_REKONSILIASI') === 1 && audits(srv).filter(x => x.aksi === 'REKONSILIASI').length === 1, J({ rows: cnt(srv, '16_REKONSILIASI') })); }
  { const srv = makeServer();
    srv.sheets['11_MUTASI_BANK'].push(['mut_1', '2026-09-05', 200000, 'SPP', 'Wali A', 'FT1', 'BELUM_DIPROSES', ''], ['mut_2', '2026-09-05', 200000, 'SPP dobel', '', '', 'BELUM_DIPROSES', ''], ['mut_3', '2026-09-06', 99999, 'lain', '', '', 'BELUM_DIPROSES', '']);
    const bad = safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_3', transaksiId: 'imp_trx_1' }));
    const ok = safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_1', transaksiId: 'imp_trx_1' }));
    const dbl = safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_2', transaksiId: 'imp_trx_1' }));
    const re = safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_1', transaksiId: 'imp_trx_1' }));
    rec('P1R-05', 'TC-REK-02 / GAP-019', bad.code === 'MATCH_NOMINAL_MISMATCH' && ok.ok && cell(srv, '11_MUTASI_BANK', 'mut_1', 'status') === 'DIPROSES' && cell(srv, '11_MUTASI_BANK', 'mut_1', 'transaksiId') === 'imp_trx_1'
      && dbl.code === 'DOUBLE_MATCH' && re.ok && re.data && re.data.unchanged === true && audits(srv).filter(x => x.aksi === 'COCOKKAN_MUTASI_TRANSAKSI').length === 1, J({ bad: bad.code, ok: ok.code, dbl: dbl.code, re: re.data && re.data.unchanged })); }
  { const srv = makeServer();
    srv.sheets['11_MUTASI_BANK'].push(['mut_1', '2026-09-05', 99999, 'SPP', '', '', 'BELUM_DIPROSES', '']);
    const r = safe(() => srv.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: 'mut_1', row: { status: 'DIPROSES', transaksiId: 'imp_trx_1' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1R-06', 'TC-REK-02 / GAP-019', rr.ok === false && cell(srv, '11_MUTASI_BANK', 'mut_1', 'status') === 'BELUM_DIPROSES', 'pencocokan tanpa validasi lewat jalur generik: ' + J(rr.code)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: 'mut_9', row: { tanggal: '2026-10-05', nominal: 5000, status: 'DIPROSES', transaksiId: 'trx_tidak_ada' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1R-07', 'TC-REK-02 / GAP-019', rr.ok === false && cnt(srv, '11_MUTASI_BANK') === 0, J(rr.code)); }

  // ================= P1-D: PEMETAAN REALISASI PENGELUARAN KE RAB =================
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_x1', row: { tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', nominal: 1000, transaksiId: 'trx_tidak_ada', status: 'REALIZATION' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1D-01', 'GAP-020 / GAP-014', rr.code === 'INVALID_TRANSACTION' && cnt(srv, '19_LPJ') === 0, J(rr.code)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { tanggal: '2026-09-05', unit: 'MI', kategori: 'ATK', nominal: 30000, transaksiId: 'imp_trx_2', status: 'REALIZATION' } },
      { op: 'upsert', id: 'lpj_b', row: { tanggal: '2026-09-05', unit: 'MI', kategori: 'ATK', nominal: 30000, transaksiId: 'imp_trx_2', status: 'REALIZATION' } }]));
    const res = r.ok ? r.data.results.map(x => x.code) : [r.code];
    rec('P1D-02', 'GAP-020 / GAP-014', res[0] === 'CREATED' && res[1] === 'LPJ_EXCEEDS_TRANSACTION' && cnt(srv, '19_LPJ') === 1, 'LPJ 30.000+30.000 atas pengeluaran 50.000: ' + J(res)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_c', row: { tanggal: '2026-09-05', unit: 'MI', kategori: 'ATK', nominal: 1000, transaksiId: 'imp_trx_1', status: 'REALIZATION' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1D-03', 'GAP-020 / GAP-014', rr.code === 'INVALID_TRANSACTION' && cnt(srv, '19_LPJ') === 0, 'LPJ atas PENERIMAAN: ' + J(rr.code)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('komitmen', [{ op: 'upsert', id: 'kom_x1', row: { uraian: 'Servis AC', nominal: 1000, status: 'COMMITTED', rabId: 'rab_tidak_ada', tanggal: '2026-10-01' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1D-04', 'TC-DSH-06 / GAP-017', rr.code === 'INVALID_RAB' && cnt(srv, '09_KOMITMEN') === 0, J(rr.code)); }
  { const srv = makeServer();
    srv.sheets['08_ANGGARAN'].push(['ang_2', 'Oktober 2026', 'ATK', 'ATK', 'MI', 500000, '', '', '', '']);
    const e1 = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-03', nominal: 40000, kategori: 'ATK', clientRequestId: 'rab1' })));
    const e2 = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-04', nominal: 7000, kategori: 'Konsumsi', clientRequestId: 'rab2' })));
    const r = safe(() => srv.sb.opRabRealization('Oktober 2026'));
    const fc = safe(() => srv.sb.opFinancialControl('Oktober 2026'));
    const line = r.ok && r.data.lines.find(l => l.kategori === 'ATK' && l.unit === 'MI');
    const fcl = fc.ok && fc.data.anggaranVsAktual.rows.find(x => x.jenis === 'PENGELUARAN' && x.kategori === 'ATK');
    const um = r.ok && r.data.unmapped.find(u => u.id === (e2.data && e2.data.id));
    rec('P1D-05', 'TC-DSH-05 / GAP-018', !!line && line.aktual === 40000 && line.transaksiIds.indexOf(e1.data.id) !== -1 && !!fcl && fcl.aktual === line.aktual && !!um,
      J({ line: line && [line.aktual, line.transaksiIds.length], fcc: fcl && fcl.aktual, unmapped: r.ok && r.data.unmapped.length, code: r.code })); }

  // ================= P1-E: PENGELOLAAN BUKTI TRANSAKSI =================
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('bukti', [{ op: 'upsert', id: 'dok_nofile', row: { kategori: 'Kuitansi', transaksiId: 'imp_trx_2', judul: 'tanpa file', tanggal: '2026-10-01', fileRef: '' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1E-01', 'GAP-024 / GAP-014', rr.code === 'BUKTI_FILE_REQUIRED' && cnt(srv, '10_BUKTI') === 0, 'bukti tanpa file: ' + J(rr.code)); }
  { const srv = makeServer();
    const up = safe(() => srv.sb.opUploadBukti({ id: 'dok_up1', mimeType: 'application/pdf', base64: Buffer.from('%PDF uji').toString('base64'), fileName: 'nota.pdf', transaksiId: 'imp_trx_2', kategori: 'Kuitansi', judul: 'Nota' }));
    const r = safe(() => srv.sb.opRecordBatch('bukti', [{ op: 'upsert', id: 'dok_up1', row: { driveFileId: '', driveFileUrl: '' } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1E-02', 'GAP-024 / GAP-014', up.ok && rr.code === 'BUKTI_IMMUTABLE' && cell(srv, '10_BUKTI', 'dok_up1', 'driveFileId') !== '', J({ up: up.code, rr: rr.code })); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opUploadBukti({ id: 'dok_up2', mimeType: 'application/pdf', base64: Buffer.from('%PDF uji').toString('base64'), fileName: 'nota.pdf', transaksiId: 'trx_tidak_ada' }));
    rec('P1E-03', 'GAP-024 / GAP-014', r.ok === false && r.code === 'INVALID_TRANSACTION' && cnt(srv, '10_BUKTI') === 0 && srv.state.drive.files.every(f => f.trashed), short(r)); }
  { const srv = makeServer();
    const a = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', status: 'SELESAI' }));
    const st1 = cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status');
    safe(() => srv.sb.opUploadBukti({ id: 'dok_up3', mimeType: 'application/pdf', base64: Buffer.from('%PDF uji').toString('base64'), fileName: 'nota.pdf', transaksiId: 'imp_trx_2' }));
    const b = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', status: 'SELESAI' }));
    rec('P1E-04', 'GAP-045 / GAP-024', a.code === 'EVIDENCE_REQUIRED' && st1 === 'TERCATAT' && b.ok && cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status') === 'SELESAI', J({ a: a.code, b: b.code })); }
  { // klien: "Lampirkan Bukti" tanpa file tidak boleh menandai pengeluaran SELESAI
    const srv = makeServer(); const c = await bootClient(srv);
    Object.assign(c.fields, { bk_kategori: 'Kuitansi', bk_judul: 'tanpa file' });
    safe(() => c.sb.submitBukti('imp_trx_2')); await sync(c);
    rec('P1E-05', 'GAP-045 / GAP-024', cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status') === 'TERCATAT' && cnt(srv, '10_BUKTI') === 0, J({ status: cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status'), bukti: cnt(srv, '10_BUKTI'), toast: c.toast() })); }

  // ================= P1-F: DETEKSI KONFLIK PERUBAHAN BERSAMAAN =================
  { const srv = makeServer();
    const a = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'versi saya', _expect: { catatan: 'versi lama yang sudah berubah' } }));
    const b = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'versi saya', _expect: { catatan: '' } }));
    rec('P1C-01', 'TC-FAIL-07 / GAP-026', a.code === 'CONFLICT' && b.ok === true && cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan') === 'versi saya', J({ a: a.code, b: b.code })); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_1', row: { nominal: 900000 }, expect: { nominal: 750000 } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1C-02', 'TC-FAIL-07 / GAP-026', rr.code === 'CONFLICT' && Number(cell(srv, '08_ANGGARAN', 'ang_1', 'nominal')) === 1000000, J(rr.code)); }
  { const srv = makeServer(); applyArchiveCols(srv);
    safe(() => srv.sb.opRecordBatch('anggaran', [{ op: 'archive', id: 'ang_1', reason: 'uji' }]));
    const r = safe(() => srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_1', row: { nominal: 1 } }]));
    const rr = r.ok ? r.data.results[0] : r;
    rec('P1C-03', 'GAP-026', rr.ok === false && Number(cell(srv, '08_ANGGARAN', 'ang_1', 'nominal')) === 1000000, 'upsert atas baris terarsip: ' + J(rr.code)); }
  { const srv = makeServer();
    const r = safe(() => srv.sb.opMasterUpsert('akun', { id: 'akun_bank1', nama: 'BNI Baru' }, '', { nama: 'Nama lama berbeda' }));
    rec('P1C-04', 'TC-FAIL-07 / GAP-026', r.code === 'CONFLICT' && cell(srv, '07_AKUN', 'akun_bank1', 'nama') === 'BNI', short(r)); }
  { // klien A memuat data, pengguna lain mengubah catatan di server, A lalu mengubah catatan -> konflik terdeteksi (bukan menimpa)
    const srv = makeServer(); const c = await bootClient(srv);
    srv.sheets['05_TRANSAKSI'].find(r => r[0] === 'imp_trx_2')[col(srv, '05_TRANSAKSI', 'catatan')] = 'diubah pengguna lain';
    safe(() => c.sb.centralPatchTransaksi('imp_trx_2', { catatan: 'diubah klien A' })); await sync(c);
    rec('P1C-05', 'TC-FAIL-07 / GAP-026', cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan') === 'diubah pengguna lain' && /CONFLICT|konflik/i.test(c.toast()), J({ catatan: cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'catatan'), toast: c.toast() })); }

  // ================= KRITERIA DOKUMEN 05/07 (ditambahkan setelah dokumen GAP & TC diterima) =================
  { // TC-CRUD-05 / GAP-015: backend FINAL menandai periode lewat 15_SETTINGS periodeStatus.YYYY-MM = TERKUNCI
    const srv = makeServer();
    srv.sheets['15_SETTINGS'].push(['periodeStatus.2026-07', 'TERKUNCI', ''], ['periodeStatus.2026-10', 'TERBUKA', '']);
    const a = safe(() => srv.sb.opCreateIncome({ tanggal: '2026-07-15', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa', clientRequestId: 'fin1' }));
    const b = safe(() => srv.sb.opCreateExpense(exp({ tanggal: '2026-10-15' })));
    const g = safe(() => srv.sb.opSettingsUpsert([{ key: 'periodeStatus.2026-07', value: 'TERBUKA' }]));
    const st = safe(() => srv.sb.opPeriodLockStatus());
    const ro = safe(() => srv.sb.opReopenPeriod('Juli 2026', 'Koreksi transaksi Juli yang salah input'));
    const c = safe(() => srv.sb.opCreateIncome({ tanggal: '2026-07-15', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa', clientRequestId: 'fin2' }));
    const raw = rows(srv, '15_SETTINGS').find(x => x[0] === 'periodeStatus.2026-07');
    rec('P1L-13', 'TC-CRUD-05 / GAP-015', a.code === 'PERIOD_LOCKED' && b.ok && g.code === 'PERIOD_LOCK_API_REQUIRED' && st.ok && st.data.closed.indexOf('Juli 2026') !== -1 && ro.ok && c.ok && raw && raw[1] === 'TERKUNCI',
      J({ juli: a.code, okt: b.code, generik: g.code, status: st.data && st.data.closed, reopen: ro.code, setelahReopen: c.code, dataAsli: raw && raw[1] })); }
  { // GAP-015: kewajiban (tagihan beku) pada periode TERKUNCI tidak dapat ditulis lewat jalur generik
    const srv = makeServer(); setClosed(srv, ['September 2026']);
    const r = safe(() => srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: 'kw_uji_1', row: { siswaId: 's1', komponenId: 'kmp_spp', periode: 'September 2026', bruto: 200000, potongan: '[]', netto: 200000, tagihanId: 'kw_uji_1' } },
      { op: 'upsert', id: 'kw_uji_2', row: { siswaId: 's1', komponenId: 'kmp_spp', periode: 'Oktober 2026', bruto: 200000, potongan: '[]', netto: 200000, tagihanId: 'kw_uji_2' } }]));
    const res = r.ok ? r.data.results.map(x => x.code) : [r.code];
    rec('P1L-14', 'GAP-015', res[0] === 'PERIOD_LOCKED' && res[1] === 'CREATED' && cnt(srv, '04_KEWAJIBAN') === 1, J(res)); }
  { // TC-CRUD-04 / GAP-014: rekonsiliasi dengan akunId tak dikenal -> VALIDATION_ERROR (generik maupun API khusus)
    const srv = makeServer();
    const r = safe(() => srv.sb.opRecordUpsert('rekonsiliasi', { id: 'rk_x', akunId: 'tidak_ada', periode: 'Oktober 2026', saldoAktual: 1 }));
    const rr = r.ok ? r.data.results[0] : r;
    const d = safe(() => srv.sb.opReconcileAccount({ akunId: 'tidak_ada', periode: 'Oktober 2026', saldoAktual: 1, clientRequestId: 'rkx' }));
    rec('P1R-08', 'TC-CRUD-04 / GAP-014', rr.code === 'VALIDATION_ERROR' && d.code === 'VALIDATION_ERROR' && cnt(srv, '16_REKONSILIASI') === 0, J({ generik: rr.code, api: d.code })); }
  { // GAP-019/031: data FINAL - mutasi berstatus TEREKONSILIASI (sudah tertaut) dan resultType impor 'mutasiBank'
    const srv = makeServer();
    srv.sheets['11_MUTASI_BANK'].push(['mut_fin', '2026-10-05', 200000, 'SPP', '', '', 'TEREKONSILIASI', 'imp_trx_1']);
    srv.sheets['05_TRANSAKSI'].push(srv.sb.__TRXH.map(h => ({ id: 'imp_trx_3', jenis: 'PENERIMAAN', tanggal: '2026-10-05', unit: 'MI', nominal: 200000, akunId: 'akun_bank1', metode: 'Transfer', status: 'TERCATAT' })[h] || ''));
    const m = safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_fin', transaksiId: 'imp_trx_3' }));
    const u = safe(() => srv.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: 'mut_fin', row: { nominal: 1 } }]));
    srv.sheets['24_IDEMPOTENCY_LOG'].push(['imp_crid_mut', 'mut_hilang', 'mutasiBank', '']);
    const o = safe(() => srv.sb.checkIdempotency_('imp_crid_mut'));
    rec('P1R-09', 'GAP-019 / GAP-031', m.code === 'ALREADY_MATCHED' && (u.ok ? u.data.results[0].code : u.code) === 'MUTASI_LOCKED' && o.status === 'orphan' && cell(srv, '11_MUTASI_BANK', 'mut_fin', 'transaksiId') === 'imp_trx_1',
      J({ match: m.code, ubahNominal: u.ok ? u.data.results[0].code : u.code, orphan: o.status })); }
  { // GAP-031: "Replay setiap jenis operasi 2x -> satu efek" (master & akses pengguna tidak menulis/mengaudit ulang)
    const srv = makeServer();
    const m1 = safe(() => srv.sb.opMasterUpsert('akun', { id: 'akun_bank1', nama: 'BNI Utama' })), m2 = safe(() => srv.sb.opMasterUpsert('akun', { id: 'akun_bank1', nama: 'BNI Utama' }));
    const u1 = safe(() => srv.sb.opUserUpsert({ id: 'U2', email: 'auditor@x.id', nama: 'Auditor Baru', role: 'AUDITOR', unit: '', status: 'ACTIVE' })), u2 = safe(() => srv.sb.opUserUpsert({ id: 'U2', email: 'auditor@x.id', nama: 'Auditor Baru', role: 'AUDITOR', unit: '', status: 'ACTIVE' }));
    const a = audits(srv);
    rec('P1A-07', 'TC-FAIL-02 / GAP-031', m1.ok && m2.ok && u1.ok && u2.ok && a.filter(x => x.aksi === 'MASTER_UPDATE').length === 1 && a.filter(x => x.aksi === 'ACCESS_UPDATE').length === 1,
      J({ master: a.filter(x => x.aksi === 'MASTER_UPDATE').length, akses: a.filter(x => x.aksi === 'ACCESS_UPDATE').length, m2: m2.message, u2: u2.message })); }
  { // TC-FAIL-05 / GAP-024 / GAP-045: unggah bukti SINKRON ke server (tanpa antrean memori), status transaksi tidak berubah
    const srv = makeServer(); const c = await bootClient(srv);
    const r = await Promise.resolve(safe(() => c.sb.buktiUploadNow_('imp_trx_2', { kategori: 'Kuitansi', judul: 'Nota ATK' }, 'data:application/pdf;base64,' + Buffer.from('%PDF uji').toString('base64'))));
    await tick(10);
    const b = rows(srv, '10_BUKTI')[0];
    rec('P1E-06', 'TC-FAIL-05 / GAP-024 / GAP-045', !!b && b[col(srv, '10_BUKTI', 'driveFileId')] !== '' && b[col(srv, '10_BUKTI', 'transaksiId')] === 'imp_trx_2' && srv.state.drive.files.length === 1
      && cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status') === 'TERCATAT' && Object.keys(c.a.CC_MEM.blobs).length === 0 && c.calls.indexOf('opUploadBukti') !== -1,
      J({ bukti: !!b, file: srv.state.drive.files.length, status: cell(srv, '05_TRANSAKSI', 'imp_trx_2', 'status'), blobMemori: Object.keys(c.a.CC_MEM.blobs || {}).length, toast: c.toast(), r: r && r.code })); }
  { // TC-FAIL-07 / GAP-026: dua klien mengubah anggaran yang sama -> klien kedua CONFLICT, perubahan pertama tidak tertimpa
    const srv = makeServer(); const c1 = await bootClient(srv), c2 = await bootClient(srv);
    const edit = (c, v) => { const arr = c.a.Store.loadAnggaran(); arr.find(x => x.id === 'ang_1').nominal = v; c.a.Store.saveAnggaran(arr); };
    edit(c1, 1100000); await sync(c1);
    edit(c2, 1200000); await sync(c2);
    const pend = JSON.parse(c2.store.draBendaharaV2_central_pending_anggaran || '{}');
    rec('P1C-06', 'TC-FAIL-07 / GAP-026', Number(cell(srv, '08_ANGGARAN', 'ang_1', 'nominal')) === 1100000 && pend.ang_1 && pend.ang_1.blocked === true && /CONFLICT/.test(pend.ang_1.error || ''),
      J({ server: cell(srv, '08_ANGGARAN', 'ang_1', 'nominal'), klien2: pend.ang_1 && [pend.ang_1.blocked, pend.ang_1.error] })); }

  // ================= OTORISASI API P1 (pelajaran P0-C: tidak ada jalur tulis tanpa gerbang) =================
  { const srv = makeServer(); setClosed(srv, ['September 2026']);
    srv.sheets['11_MUTASI_BANK'].push(['mut_1', '2026-10-05', 200000, 'SPP', '', '', 'BELUM_DIPROSES', '']);
    srv.state.email = 'auditor@x.id';
    const w = [safe(() => srv.sb.opReopenPeriod('September 2026', 'alasan cukup panjang')), safe(() => srv.sb.opReconcileAccount({ akunId: 'akun_kas1', periode: 'Oktober 2026', saldoAktual: 0, clientRequestId: 'x1' })), safe(() => srv.sb.opMatchMutasi({ mutasiId: 'mut_1', transaksiId: 'imp_trx_1' }))].map(r => r.code);
    const rd = safe(() => srv.sb.opRabRealization('Oktober 2026')).code;
    srv.state.email = 'orang.asing@x.id';
    const anon = [safe(() => srv.sb.opPeriodLockStatus()), safe(() => srv.sb.opRabRealization('Oktober 2026')), safe(() => srv.sb.opClosePeriod('Oktober 2026'))].map(r => r.ok);
    rec('P1S-01', 'TC-AUTH-02', w.every(c => c === 'ROLE_NOT_ALLOWED') && rd === 'SUCCESS' && anon.every(x => x === false) && cell(srv, '11_MUTASI_BANK', 'mut_1', 'status') === 'BELUM_DIPROSES' && cnt(srv, '16_REKONSILIASI') === 0,
      J({ auditorTulis: w, auditorBaca: rd, tanpaAkses: anon })); }

  // ================= GAP-028: TRANSFER TETAP DIBLOKIR =================
  { const srv = makeServer(); const c = await bootClient(srv);
    let err = ''; try { c.sb.postTransaksi({ jenis: 'TRANSFER', tanggal: '2026-10-05', nominal: 1000, akunId: 'akun_kas1', akunTujuanId: 'akun_bank1' }); } catch (e) { err = e.message; }
    const pub = Object.keys(srv.sb).filter(k => /transfer/i.test(k) && typeof srv.sb[k] === 'function');
    rec('P1T-01', 'GAP-028', /Transfer antar-akun belum didukung/.test(err) && !pub.length && cnt(srv, '05_TRANSAKSI') === 2, J({ err, pub })); }

  // ================= RINGKASAN =================
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  const p = R.filter(r => r.st === 'PASS').length, f = R.filter(r => r.st === 'FAIL').length, i = R.filter(r => r.st === 'INFO').length;
  console.log('\nPASS=' + p + ' FAIL=' + f + ' INFO=' + i);
  process.exitCode = f ? 1 : 0;
})().catch(e => { console.error('CRASH ' + (e && e.stack || e)); process.exitCode = 2; });
