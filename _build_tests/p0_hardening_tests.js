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
const exp_ = t => ({ tanggal: t, unit: 'MI', nominal: 1234, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko' });
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

  // ======================= T4: validasi tanggal & label periode =======================
  { const V = ['2026-10-19', '2026-13-40', '2026-02-30', '2024-02-29', '2025-02-29', '', null, '19/10/2026', '2026-1-9', '2026-10-19T08:00:00'];
    const VALID = { '2026-10-19': 1, '2024-02-29': 1 };
    const acc = r => { const c = code(r); return c === 'OK' || c === 'SUCCESS' || c === 'CREATED' || c === 'UPDATED'; };
    const exp = { tanggal: undefined, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko' };
    const P = {
      'opCreateExpense.tanggal (wajib)': [true, (s, v) => s.sb.opCreateExpense(Object.assign({}, exp, { tanggal: v, clientRequestId: nid('cr') }))],
      'opCreateIncome.tanggal (wajib)': [true, (s, v) => s.sb.opCreateIncome({ tanggal: v, unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Penerimaan Lainnya', clientRequestId: nid('cr') })],
      'opCreateTxBatch.tanggal (wajib)': [true, (s, v) => { const r = s.sb.opCreateTxBatch([{ kind: 'expense', payload: Object.assign({}, exp, { tanggal: v, clientRequestId: nid('cr') }) }]); return r.ok ? { ok: r.data.results[0].ok, code: r.data.results[0].code } : r; }],
      'opUpdateTransaction.tanggal (wajib bila diubah)': [true, (s, v) => s.sb.opUpdateTransaction({ id: 'imp_trx_2', tanggal: v })],
      'lpj.tanggal (wajib)': [true, (s, v) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: nid('lpj'), row: { tanggal: v, unit: 'MI', item: 'x', nominal: 1000, status: 'REALIZATION' } }])],
      'komitmen.tanggal (wajib)': [true, (s, v) => s.sb.opRecordBatch('komitmen', [{ op: 'upsert', id: nid('kom'), row: { tanggal: v, uraian: 'x', nominal: 1000, status: 'EXPECTED' } }])],
      'komitmen.jatuhTempo (opsional)': [false, (s, v) => { s.sheets['09_KOMITMEN'][0].push('jatuhTempo'); return s.sb.opRecordBatch('komitmen', [{ op: 'upsert', id: nid('kom'), row: { tanggal: '2026-10-01', jatuhTempo: v, uraian: 'x', nominal: 1000, status: 'EXPECTED' } }]); }],
      'mutasiBank.tanggal (wajib)': [true, (s, v) => s.sb.opRecordBatch('mutasiBank', [{ op: 'upsert', id: nid('mut'), row: { tanggal: v, nominal: 1000, keterangan: 'x' } }])],
      'bukti.tanggal record (opsional)': [false, (s, v) => s.sb.opRecordBatch('bukti', [{ op: 'upsert', id: nid('dok'), row: { tanggal: v, fileRef: 'ref://uji', transaksiId: 'imp_trx_2', kategori: 'Kuitansi', judul: 'x' } }])],
      'opUploadBukti.tanggal (opsional; kosong = hari ini)': [false, (s, v) => s.sb.opUploadBukti({ id: nid('dok'), mimeType: 'application/pdf', base64: Buffer.from('%PDF').toString('base64'), fileName: 'n.pdf', transaksiId: 'imp_trx_2', tanggal: v })]
    };
    const bad = [], mat = {};
    Object.keys(P).forEach(k => { const [req, fn] = P[k]; mat[k] = V.map(v => { const s = makeServer(); const r = safe(() => fn(s, v)); const a = acc(r);
      const want = VALID[v] ? true : ((v === '' || v === null) ? !req : false);
      if (a !== want) bad.push(k + ' ' + J(v) + ' -> ' + code(r)); return a ? 'T' : 'X'; }).join(''); });
    rec('HD-T4-01', 'T4 / GAP-014 / TC-CRUD-08', bad.length === 0, bad.length ? 'tidak sesuai: ' + bad.join(' | ') : 'semua jalur tanggal sesuai matriks (T=terima, X=tolak; urutan ' + J(V) + '): ' + J(mat)); }
  { const L = ['Oktober 2026', 'oktober 2026', 'Bulan13 2026', '2026-10', '', null, 'Tahun Ajaran 2026/2027', 'Tahun Ajaran 2026/2028', 'SekaliBayar'];
    const acc = r => { const c = code(r); return c === 'OK' || c === 'SUCCESS' || c === 'CREATED'; };
    const P = {
      'anggaran.periode (bulan/non-bulan, wajib)': ['period', (s, v) => s.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: nid('ang'), row: { periode: v, program: 'x', kategori: 'ATK', unit: 'MI', nominal: 1 } }])],
      'kewajiban.periode (bulan/non-bulan, wajib)': ['period', (s, v) => s.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: nid('kw'), row: { periode: v, siswaId: 's1', komponenId: 'kmp_spp', bruto: 1, netto: 1 } }])],
      'laporan.periode (bulan, wajib)': ['month', (s, v) => s.sb.opRecordBatch('laporan', [{ op: 'upsert', id: nid('lap'), row: { periode: v, tanggalDibuat: '2026-10-19T08:00:00.000Z', dibuatOleh: 'B', snapshot: '{}' } }])],
      'kpi.periode (bulan, wajib)': ['month', (s, v) => s.sb.opRecordBatch('kpi', [{ op: 'upsert', id: nid('kpi'), row: { periode: v, kpiKode: 'BDS01', skor: 1 } }])],
      'settings.periodeAktif (bulan)': ['month', (s, v) => s.sb.opSettingsUpsert([{ key: 'periodeAktif', value: v }])],
      'opReconcileAccount.periode (bulan)': ['month', (s, v) => s.sb.opReconcileAccount({ akunId: 'akun_bank1', periode: v, saldoAktual: 0, clientRequestId: nid('cr') })],
      'opClosePeriod.periode (bulan)': ['month', (s, v) => s.sb.opClosePeriod(v)]
    };
    const ok = { period: { 'Oktober 2026': 1, 'Tahun Ajaran 2026/2027': 1, SekaliBayar: 1 }, month: { 'Oktober 2026': 1 } };
    const bad = [], mat = {};
    Object.keys(P).forEach(k => { const [kind, fn] = P[k]; mat[k] = L.map(v => { const s = makeServer(); const r = safe(() => fn(s, v)); const a = acc(r);
      if (a !== !!ok[kind][v]) bad.push(k + ' ' + J(v) + ' -> ' + code(r)); return a ? 'T' : 'X'; }).join(''); });
    rec('HD-T4-02', 'T4 label periode / TC-CRUD-08', bad.length === 0, bad.length ? 'tidak sesuai: ' + bad.join(' | ') : 'semua jalur periode sesuai (urutan ' + J(L) + '): ' + J(mat)); }
  { const s = makeServer(); const r = (v) => code(safe(() => s.sb.opRecordBatch('rkat', [{ op: 'upsert', id: nid('rk'), row: { tahun: v, pagu: 1, program: 'x' } }])));
    const res = { '2026': r('2026'), '26': r('26'), 'kosong': r(''), 'abc': r('abc') };
    rec('HD-T4-03', 'T4 RKAT tahun (opsional)', res['2026'] === 'CREATED' && res['26'] === 'VALIDATION_ERROR' && res.kosong === 'CREATED' && res.abc === 'VALIDATION_ERROR', J(res)); }
  { // historis: baris lama bertanggal mustahil TIDAK dikoreksi dan TIDAK memblokir perubahan field lain; mengubah tanggalnya ke nilai mustahil ditolak
    const s = makeServer(); const TH = s.sheets['05_TRANSAKSI'][0];
    const row = TH.map(h => ({ id: 'old_trx', jenis: 'PENGELUARAN', tanggal: '2026-02-30', unit: 'MI', nominal: 5000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Lama' })[h] || '');
    s.sheets['05_TRANSAKSI'].push(row);
    s.sheets['19_LPJ'].push(s.sheets['19_LPJ'][0].map(h => ({ id: 'old_lpj', tanggal: '2026-13-40', nominal: 100, status: 'REALIZATION' })[h] || ''));
    const a = s.sb.opUpdateTransaction({ id: 'old_trx', catatan: 'koreksi catatan' });
    const b = s.sb.opUpdateTransaction({ id: 'old_trx', tanggal: '2026-02-31' });
    const c = code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'old_lpj', row: { item: 'diberi nama' } }]));
    const d = code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'old_lpj', row: { tanggal: '2026-11-31' } }]));
    const trxT = rows(s, '05_TRANSAKSI').find(r => r[0] === 'old_trx')[col(s, '05_TRANSAKSI', 'tanggal')], lpjT = rows(s, '19_LPJ').find(r => r[0] === 'old_lpj')[col(s, '19_LPJ', 'tanggal')];
    rec('HD-T4-04', 'T4 data historis', a.ok && !b.ok && b.code === 'VALIDATION_ERROR' && c === 'UPDATED' && d === 'VALIDATION_ERROR' && trxT === '2026-02-30' && lpjT === '2026-13-40',
      J({ ubahCatatan: a.code, ubahTanggalMustahil: b.code, lpjUbahItem: c, lpjUbahTanggalMustahil: d, tanggalLamaTetap: [trxT, lpjT] })); }
  { // klien: jalur impor masih menormalisasi tanggal tanpa cek kalender, tetapi server menolak (otoritas di server)
    const srv = makeServer(); const c = await bootClient(srv);
    const norm = c.sb.normalizeDateValue('31/02/2026');
    let msg = ''; try { c.sb.postTransaksi(Object.assign({ jenis: 'PENGELUARAN', status: 'TERCATAT' }, exp_(norm))); await sync(c); } catch (e) { msg = e.message; }
    const n = rows(srv, '05_TRANSAKSI').filter(r => r[col(srv, '05_TRANSAKSI', 'tanggal')] === norm).length;
    const blocked = c.a.Store.loadTransaksi().filter(t => t.tanggal === norm && t._syncBlocked).length;
    rec('HD-T4-05', 'T4 otoritas server', norm === '2026-02-31' && n === 0 && (blocked === 1 || /tanggal/.test(msg)), 'normalizeDateValue klien "31/02/2026" -> ' + norm + '; tersimpan di server: ' + n + '; status klien: ' + (blocked ? 'gagal sinkron (diblokir)' : msg)); }
  // ======================= T7: otorisasi pengelolaan peran =======================
  const userRows = s => rows(s, '26_USER_ACCESS');
  const accessAudits = s => rows(s, '13_AUDIT_LOG').filter(r => /^ACCESS_/.test(String(r[col(s, '13_AUDIT_LOG', 'aksi')]))).length;
  const seedUser = (s, o) => { const H = s.sheets['26_USER_ACCESS'][0]; s.sheets['26_USER_ACCESS'].push(H.map(h => o[String(h).trim()] || '')); };
  { const s = makeServer(); const n0 = userRows(s).length, a0 = accessAudits(s);
    const r = ['KEPALA_SEKOLAH', 'YAYASAN'].map(role => code(s.sb.opUserUpsert({ email: role.toLowerCase() + '.baru@x.id', nama: 'X', role, unit: '', status: 'ACTIVE' })));
    rec('HD-T7-01', 'T7 / GAP-048 / TC-AUTH-09', r.every(x => x === 'PRIVILEGED_ROLE_CHANGE_DENIED') && userRows(s).length === n0 && accessAudits(s) === a0, 'BENDAHARA membuat KEPALA_SEKOLAH/YAYASAN: ' + J(r) + '; baris & audit akses tidak bertambah'); }
  { const s = makeServer();
    const r = code(s.sb.opUserUpsert({ id: 'U2', email: 'auditor@x.id', nama: 'Auditor', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' }));
    const role = userRows(s).find(x => x[0] === 'U2')[col(s, '26_USER_ACCESS', 'role')];
    rec('HD-T7-02', 'T7 / TC-AUTH-09', r === 'PRIVILEGED_ROLE_CHANGE_DENIED' && role === 'AUDITOR', 'ubah AUDITOR -> KEPALA_SEKOLAH: ' + r + ', peran tetap ' + role); }
  { const s = makeServer();
    const up = role => code(s.sb.opUserUpsert({ id: 'U1', email: 'bendahara@x.id', nama: 'B', role, unit: 'MI', status: 'ACTIVE' }));
    const res = { keKepsek: up('KEPALA_SEKOLAH'), keYayasan: up('YAYASAN'), turunAuditor: up('AUDITOR'),
      pindahEmail: code(s.sb.opUserUpsert({ id: 'U1', email: 'bendahara.lain@x.id', nama: 'B', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' })), ubahNama: code(s.sb.opUserUpsert({ id: 'U1', email: 'bendahara@x.id', nama: 'Bendahara Baru', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' })) };
    rec('HD-T7-03', 'T7 akun sendiri', res.keKepsek === 'PRIVILEGED_ROLE_CHANGE_DENIED' && res.keYayasan === 'PRIVILEGED_ROLE_CHANGE_DENIED' && res.turunAuditor === 'SELF_LOCKOUT' && res.pindahEmail === 'SELF_ROLE_CHANGE_DENIED' && res.ubahNama === 'OK', J(res)); }
  { const s = makeServer(); seedUser(s, { id: 'U_KS', email: 'kepsek@x.id', nama: 'Kepsek', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' });
    const up = o => code(s.sb.opUserUpsert(Object.assign({ id: 'U_KS', email: 'kepsek@x.id', nama: 'Kepsek', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' }, o)));
    const res = { nonaktif: up({ status: 'INACTIVE' }), turunkan: up({ role: 'AUDITOR' }), pindahEmail: up({ email: 'kepsek.lain@x.id' }), ubahNama: up({ nama: 'Nama Lain' }) };
    const ks = userRows(s).find(x => x[0] === 'U_KS');
    rec('HD-T7-04', 'T7 pengguna istimewa yang ada', Object.values(res).every(x => x === 'PRIVILEGED_ROLE_CHANGE_DENIED') && ks[col(s, '26_USER_ACCESS', 'status')] === 'ACTIVE' && ks[col(s, '26_USER_ACCESS', 'email')] === 'kepsek@x.id', J(res)); }
  { const s = makeServer();
    const res = { auditorBaru: code(s.sb.opUserUpsert({ email: 'aud2@x.id', nama: 'A2', role: 'AUDITOR', unit: '', status: 'ACTIVE' })), bendaharaBaru: code(s.sb.opUserUpsert({ email: 'ben2@x.id', nama: 'B2', role: 'BENDAHARA', unit: 'TK', status: 'ACTIVE' })),
      nonaktifAuditor: code(s.sb.opUserUpsert({ id: 'U2', email: 'auditor@x.id', nama: 'Auditor', role: 'AUDITOR', unit: '', status: 'INACTIVE' })) };
    rec('HD-T7-05', 'T7 operasi yang tetap diizinkan', Object.values(res).every(x => x === 'OK'), J(res) + ' (BENDAHARA -> BENDAHARA/AUDITOR; keputusan D-T7 apakah BENDAHARA boleh menambah BENDAHARA lain)'); }
  { const s = makeServer();
    const spoof = code(s.sb.opUserUpsert({ email: 'ks3@x.id', nama: 'X', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE', actorRole: 'YAYASAN', identity: { role: 'YAYASAN' }, createdBy: 'yayasan@x.id' }));
    const idDeps = s.sb.getCurrentUserIdentity({ getEmail: 'yayasan@x.id', lookupUserAccess: 'x' }); // objek JSON dari klien: bukan fungsi
    s.state.email = 'auditor@x.id'; const aud = code(s.sb.opUserUpsert({ email: 'z@x.id', nama: 'Z', role: 'AUDITOR', unit: '', status: 'ACTIVE' }));
    s.state.email = 'bendahara@x.id';
    rec('HD-T7-06', 'T7 parameter klien', spoof === 'PRIVILEGED_ROLE_CHANGE_DENIED' && idDeps.authorized === false && aud === 'ROLE_NOT_ALLOWED',
      'field identitas/peran palsu di payload diabaikan: ' + spoof + '; getCurrentUserIdentity dgn objek klien -> authorized=' + idDeps.authorized + ' (' + idDeps.code + '); AUDITOR menulis akses -> ' + aud); }
  { const srv = makeServer(); const c = await bootClient(srv);
    await c.sb.pdUsersLoad();
    Object.assign(c.fields, { usr_email: 'kepsek.ui@x.id', usr_nama: 'Kepsek UI', usr_role: 'KEPALA_SEKOLAH', usr_unit: 'MI', usr_status: 'ACTIVE' });
    await c.sb.pdUserSave(null);
    rec('HD-T7-07', 'T7 UI', /PRIVILEGED_ROLE_CHANGE_DENIED|tidak dapat memberikan/.test(c.toast()) && !userRows(srv).some(r => r[1] === 'kepsek.ui@x.id'), 'toast: ' + c.toast()); }
  { const s = makeServer(); s.sb.opUserUpsert({ email: 'kepsek.palsu@x.id', nama: 'Palsu', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' });
    s.state.email = 'kepsek.palsu@x.id'; const id = s.sb.getCurrentUserIdentity();
    rec('HD-T7-08', 'T7 skenario AU-K7-02 tertutup', id.authorized === false && id.code === 'USER_NOT_FOUND', 'akun penyetuju "palsu" tidak terbentuk: ' + J({ authorized: id.authorized, code: id.code })); }
  rec('HD-T7-09', 'GAP-005 (INFO)', null, 'Identitas aktor = Session.getActiveUser() + 26_USER_ACCESS. Keandalannya di Apps Script live BELUM diverifikasi (executeAs/akses web app belum diputuskan) - autentikasi live TIDAK diklaim aman.');
  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
