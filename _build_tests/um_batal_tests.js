/* Suite UANG MUKA: PEMBATALAN, PEMISAHAN EMPAT ANGKA, DAMPAK FCC (P1_23; PROTOTIPE SANDBOX Node, TIDAK menyentuh Google Sheets).
 * DIBATALKAN tidak menghapus jejak pencairan; saldo tetap dilaporkan sampai dikembalikan; laporan memisahkan (1) arus kas keluar,
 * (2) pengeluaran aktual dilaporkan, (3) pengeluaran terverifikasi, (4) saldo belum dipertanggungjawabkan. FCC/KPI tidak diubah.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function fresh() {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  s.sheets['26_USER_ACCESS'].push(['U3', 'kepala@x.id', 'K', 'KEPALA_SEKOLAH', 'MI', 'ACTIVE', '', '']);
  s.sb.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ'); return s;
}
const rows = (s, n) => s.sheets[n].slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const as = (s, email, fn) => { const e0 = s.state.email; s.state.email = email; try { return fn(); } finally { s.state.email = e0; } };
const CAIR = { kegiatan: 'Studi Tour', pelaksana: 'Bu Siti', nominal: 2000000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'cairB' };
const lpj = (s, id, nominal, tgl) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id, row: { tanggal: tgl || '2026-09-25', unit: 'MI', kategori: 'ATK', item: 'Nota ' + id, nominal, status: 'REALIZATION' } }]);
const lap = (s, id) => s.sb.opUangMukaLaporan({}).data.uangMuka.find(x => x.id === id);

(async () => {
  { const s = fresh(); const c = s.sb.opUangMukaCair(CAIR), id = c.data.id, trx = c.data.transaksiCairId; lpj(s, 'lpj_b1', 300000);
    s.sb.opLpjAjukan({ lpjId: 'lpj_b1', tanggalNota: '2026-09-25', uangMukaId: id });
    const a = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'batal' }), b = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah' });
    rec('UB-01', 'pembatalan: alasan < 10 -> ALASAN_WAJIB; masih ada LPJ diajukan -> LPJ_MASIH_AKTIF (harus diselesaikan dulu)', a.code === 'ALASAN_WAJIB' && b.code === 'LPJ_MASIH_AKTIF', [a.code, b.code].join(' ')); }
  { const s = fresh(); const c = s.sb.opUangMukaCair(CAIR), id = c.data.id, trx = c.data.transaksiCairId; const n0 = rows(s, '05_TRANSAKSI').length;
    const x = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah', expect: { status: 'LPJ_DITERIMA' } });
    const b = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah', expect: { status: 'DICAIRKAN' } }), b2 = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah' });
    const u = obj(s, '32_UANG_MUKA', id), t = obj(s, '05_TRANSAKSI', trx), au = rows(s, '13_AUDIT_LOG').filter(r => r[2] === 'UANG_MUKA_BATAL');
    rec('UB-02', 'DIBATALKAN tidak menghapus jejak: expect usang -> CONFLICT; batal sah -> status DIBATALKAN + alasan; transaksi pencairan & entitas tetap ada; audit UANG_MUKA_BATAL memuat saldo 2.000.000; ulang -> UNCHANGED',
      x.code === 'CONFLICT' && b.ok && b2.data.unchanged && u.status === 'DIBATALKAN' && /dibatalkan/.test(u.alasanStatus) && t && !t.archivedAt && rows(s, '05_TRANSAKSI').length === n0 && au.length === 1 && /2000000/.test(J(au[0])),
      J({ x: x.code, status: u.status, trxAda: !!t, audit: au.length }));
    lpj(s, 'lpj_b2', 100000); const aj = s.sb.opLpjAjukan({ lpjId: 'lpj_b2', tanggalNota: '2026-09-25', uangMukaId: id });
    const L0 = lap(s, id); const k1 = s.sb.opUangMukaKembali({ uangMukaId: id, nominal: 500000, tanggal: '2026-10-01', clientRequestId: 'kbB1' }); const L1 = lap(s, id);
    const k2 = s.sb.opUangMukaKembali({ uangMukaId: id, nominal: 1500000, tanggal: '2026-10-03', clientRequestId: 'kbB2' }); const L2 = lap(s, id), k3 = s.sb.opUangMukaKembali({ uangMukaId: id, nominal: 1, tanggal: '2026-10-03', clientRequestId: 'kbB3' });
    rec('UB-03', 'setelah dibatalkan: LPJ baru ditolak (STATUS_TIDAK_VALID); saldo tetap dilaporkan 2.000.000 -> pengembalian parsial 500.000 -> saldo 1.500.000 -> pengembalian 1.500.000 -> saldo 0; status tetap DIBATALKAN (bukan SELESAI); pengembalian tertaut uang muka asal; lebih dari saldo -> MELEBIHI_SALDO',
      aj.code === 'STATUS_TIDAK_VALID' && L0.saldoBelumDipertanggungjawabkan === 2000000 && k1.ok && L1.saldoBelumDipertanggungjawabkan === 1500000 && k2.ok && L2.saldoBelumDipertanggungjawabkan === 0 && L2.status === 'DIBATALKAN' && L2.statusTurunan === 'DIBATALKAN' && k3.code === 'MELEBIHI_SALDO' && rows(s, '33_UANG_MUKA_KEMBALI').every(k => k[1] === id),
      J({ aj: aj.code, saldo: [L0.saldoBelumDipertanggungjawabkan, L1.saldoBelumDipertanggungjawabkan, L2.saldoBelumDipertanggungjawabkan], status: L2.status, k3: k3.code })); }
  { const s = fresh(); s.sb.UM_VERIFIKASI_AKTIF_ = true; const id = s.sb.opUangMukaCair(CAIR).data.id; lpj(s, 'lpj_v', 1000000); lpj(s, 'lpj_t', 700000, '2026-09-26');
    s.sb.opLpjAjukan({ lpjId: 'lpj_v', tanggalNota: '2026-09-25', uangMukaId: id }); s.sb.opLpjTerima({ lpjId: 'lpj_v' }); as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_v', hasil: 'DIVERIFIKASI' }));
    s.sb.opLpjAjukan({ lpjId: 'lpj_t', tanggalNota: '2026-09-26', uangMukaId: id }); s.sb.opLpjTerima({ lpjId: 'lpj_t' });
    const L = lap(s, id), n = rows(s, '05_TRANSAKSI').length;
    rec('UB-04', 'pemisahan empat angka: (1) arus kas keluar 2.000.000; (2) pengeluaran aktual dilaporkan 1.700.000 (nota diajukan/diterima/diverifikasi); (3) terverifikasi 1.000.000; (4) saldo belum dipertanggungjawabkan 1.000.000; nota tidak menjadi transaksi kas (hanya 1 transaksi pencairan)',
      L.arusKasKeluar === 2000000 && L.pengeluaranAktualDilaporkan === 1700000 && L.pengeluaranTerverifikasi === 1000000 && L.saldoBelumDipertanggungjawabkan === 1000000 && n === 3,
      J({ arus: L.arusKasKeluar, aktual: L.pengeluaranAktualDilaporkan, verif: L.pengeluaranTerverifikasi, saldo: L.saldoBelumDipertanggungjawabkan, trx: n }));
    const d = s.sb.opUangMukaDampakFcc({ periode: 'September 2026' }).data, f = s.sb.opFinancialControl('September 2026').data.actual;
    rec('UB-05', 'dampak FCC (audit): angka "sekarang" = opFinancialControl apa adanya (formula tidak diubah); posisi kas sama pada kedua basis', d.sekarang.pengeluaranAktual === f.expensePeriode && d.sekarang.penerimaan === f.incomePeriode && d.simulasiBasisBeban.posisiKas === d.sekarang.posisiKas, J({ sekarang: d.sekarang, simulasi: d.simulasiBasisBeban }));
    rec('UB-06', 'BEFORE/AFTER FCC September (audit saja): pengeluaran sekarang 2.050.000 (pencairan penuh) vs basis beban 1.050.000 (nota terverifikasi); 1 transaksi pencairan ikut populasi BDS03', null, J(d)); }
  { const s = fresh(); const id = s.sb.opUangMukaCair(CAIR).data.id; const r = as(s, 'auditor@x.id', () => s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah' }));
    const sel = s.sb.opUangMukaKembali({ uangMukaId: id, nominal: 2000000, tanggal: '2026-09-30', clientRequestId: 'kbS' }), b = s.sb.opUangMukaBatal({ uangMukaId: id, alasan: 'Kegiatan dibatalkan sekolah' });
    rec('UB-07', 'otorisasi: AUDITOR tidak dapat membatalkan (ROLE_NOT_ALLOWED); uang muka yang sudah SELESAI/dilunasi tidak dapat dibatalkan', r.code === 'ROLE_NOT_ALLOWED' && sel.ok && b.code === 'STATUS_TIDAK_VALID' && obj(s, '32_UANG_MUKA', id).status === 'SELESAI', J({ r: r.code, statusSetelahKembali: obj(s, '32_UANG_MUKA', id).status, batal: b.code || 'OK' })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
