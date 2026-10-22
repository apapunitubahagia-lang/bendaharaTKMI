/* Suite AUDIT P1_25 bagian D-LPJ & D-T1 (sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * D-LPJ: jalur lama tertutup hanya bila skema LENGKAP (perbaikan); setup parsial; tautan ke transaksi diarsip; LPJ bertaut transaksi
 *        yang kemudian diarsip.
 * D-T1 : matriks karakterisasi uang muka (4 angka) vs FCC vs populasi BDS03 per peristiwa, termasuk arsip/koreksi pencairan
 *        & pengembalian. Angka FIXTURE, bukan data produksi.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026', CONF = 'BUAT_SKEMA_UANG_MUKA_LPJ';
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const code = r => r && (r.ok ? (r.data && r.data.results ? r.data.results[0].code : (r.data && r.data.replay ? 'REPLAY' : 'OK')) : r.code);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const kwInject = (s, id, o) => { const h = s.sheets['04_KEWAJIBAN'][0], v = Object.assign({ id, siswaId: 's2', komponenId: '', periode: P, bruto: 50000, potongan: '[]', netto: 50000, tagihanId: id, computedAt: '2026-08-01T00:00:00.000Z' }, o || {}); s.sheets['04_KEWAJIBAN'].push(h.map(k => v[k] === undefined ? '' : v[k])); };
const jenis = (a, j) => (a.data.pengecualian || []).filter(x => x.jenis === j);

// ======================= D-LPJ =======================
const lpjA = s => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', item: 'Nota A', nominal: 45000, status: 'REALIZATION' } }]);
const PX = { lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' };
{ const s = fresh(); lpjA(s); s.state.failSetValuesOn = '19_LPJ';
  const st = s.sb.opUangMukaLpjSetup(CONF), partial = { sheet34: !!s.sheets['34_LPJ_TAUTAN'], kolom: s.sheets['19_LPJ'][0].includes('statusLpj') };
  const baru1 = code(s.sb.opCreateExpenseFromLpj(PX)), lama1 = code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { item: 'Nota A (koreksi teks)' } }]));
  const ulang = s.sb.opUangMukaLpjSetup(CONF);
  const lama2 = code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { transaksiId: 'imp_trx_2' } }])), baru2 = code(s.sb.opCreateExpenseFromLpj(PX));
  rec('PA-05', '[P1_25 perbaikan] setup parsial (kolom 19_LPJ gagal ditambah setelah sheet 32-34 dibuat): jalur baru SCHEMA_ADDITIVE_REQUIRED dan jalur lama TETAP terbuka (sebelumnya keduanya buntu: lama GUNAKAN_OPERASI_TAUTAN); setup ulang melengkapi -> jalur lama tertutup, jalur baru berfungsi',
    st.code === 'WRITE_FAILED' && partial.sheet34 && !partial.kolom && baru1 === 'SCHEMA_ADDITIVE_REQUIRED' && lama1 === 'UPDATED' && ulang.ok && lama2 === 'GUNAKAN_OPERASI_TAUTAN' && baru2 === 'OK',
    J({ setup: st.code, partial, baru1, lama1, ulang: ulang.data, lama2, baru2 })); }
{ const s = fresh(); lpjA(s); s.sheets['34_LPJ_TAUTAN'] = [['id', 'lpjId', 'transaksiId', 'status']]; // sheet dibuat manual, bukan lewat setup
  const r = code(s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { transaksiId: 'imp_trx_2' } }]));
  rec('PA-06', '[P1_25] sheet 34_LPJ_TAUTAN yang dibuat manual (tanpa setup sah) tidak menutup jalur lama', r === 'UPDATED', r); }
{ const s = fresh(); s.sb.opUangMukaLpjSetup(CONF); lpjA(s); s.sb.opArchiveTransaction('imp_trx_2', 'salah input');
  const r = s.sb.opLinkLpj({ lpjId: 'lpj_a', transaksiId: 'imp_trx_2', expect: { transaksiId: '' } });
  rec('PA-07', 'tautan eksplisit ke transaksi yang SUDAH DIARSIP ditolak (INVALID_TRANSACTION); LPJ tetap belum bertaut', r.code === 'INVALID_TRANSACTION' && !obj(s, '19_LPJ', 'lpj_a').transaksiId, r.code); }
{ const s = fresh(); s.sb.opUangMukaLpjSetup(CONF); lpjA(s); const a = s.sb.opCreateExpenseFromLpj(PX);
  s.sb.opArchiveTransaction(a.data.transaksiId, 'salah nominal'); const L1 = obj(s, '19_LPJ', 'lpj_a').transaksiId;
  const b = s.sb.opCreateExpenseFromLpj(PX);
  const u = s.sb.opUnlinkLpj({ lpjId: 'lpj_a', alasan: 'transaksi diarsip, dibuat ulang', expect: { transaksiId: a.data.transaksiId } }), c = s.sb.opCreateExpenseFromLpj(PX);
  rec('PA-08', '[P1_25 perbaikan] transaksi dari LPJ diarsip: LPJ TETAP menunjuk transaksi arsip (tidak diubah otomatis); buat ulang langsung -> LPJ_BERTAUT_TRANSAKSI_ARSIP (sebelumnya "replay sukses" yang menunjuk transaksi arsip); lepas tautan beralasan (keputusan eksplisit) lalu buat ulang -> transaksi baru (generasi 2)',
    L1 === a.data.transaksiId && b.code === 'LPJ_BERTAUT_TRANSAKSI_ARSIP' && u.ok && c.ok && c.data.transaksiId !== a.data.transaksiId, J({ b: b.code, c: code(c) })); }

/* [P1_26] jalur umum kini MENOLAK arsip/koreksi transaksi uang muka (TRANSAKSI_UANG_MUKA_TERKUNCI); kondisi data yang diubah di luar server
   (data historis / suntingan langsung sheet) disimulasikan dengan mengubah sel langsung agar deteksi peringatan tetap diuji. */
const selLangsung = (s, id, kol, nilai) => { const h = s.sheets['05_TRANSAKSI'][0], r = s.sheets['05_TRANSAKSI'].find(x => x[0] === id); r[h.indexOf(kol)] = nilai; };
// ======================= D-T1 matriks =======================
{ const s = fresh(); s.sb.opUangMukaLpjSetup(CONF); s.sheets['26_USER_ACCESS'].push(['U3', 'kepala@x.id', 'K', 'KEPALA_SEKOLAH', 'MI', 'ACTIVE', '', '']);
  const as = (email, fn) => { const e0 = s.state.email; s.state.email = email; try { return fn(); } finally { s.state.email = e0; } };
  const snap = (label, umId) => {
    const L = s.sb.opUangMukaLaporan({}).data, u = umId ? L.uangMuka.find(x => x.id === umId) : null, f = s.sb.opFinancialControl(P).data.actual, b = s.sb.opRabTidakSurutSimulasi({ periode: P }).data.perPeriode[P] || {};
    return { peristiwa: label, um: u ? [u.arusKasKeluar, u.pengeluaranAktualDilaporkan, u.pengeluaranTerverifikasi, u.saldoBelumDipertanggungjawabkan, u.pengembalian, u.status] : null, peringatan: u ? u.peringatan : [], fcc: [f.expensePeriode, f.incomePeriode, f.cashPosition], bds03Populasi: b.populasi || 0 };
  };
  const T = [snap('awal (fixture)', null)];
  const um = s.sb.opUangMukaCair({ kegiatan: 'Lomba', pelaksana: 'Pak A', nominal: 2000000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'm1' }).data; T.push(snap('pencairan 2.000.000', um.id));
  const lpj = (id, n, t) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id, row: { tanggal: t, unit: 'MI', kategori: 'ATK', item: id, nominal: n, status: 'REALIZATION' } }]);
  lpj('lpj_n1', 1200000, '2026-09-22'); s.sb.opLpjAjukan({ lpjId: 'lpj_n1', tanggalNota: '2026-09-22', uangMukaId: um.id }); T.push(snap('nota 1.200.000 diajukan (belum verifikasi)', um.id));
  s.sb.opLpjTerima({ lpjId: 'lpj_n1' }); s.sb.UM_VERIFIKASI_AKTIF_ = true; as('kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_n1', hasil: 'DIVERIFIKASI' })); s.sb.UM_VERIFIKASI_AKTIF_ = false;
  T.push(snap('nota 1.200.000 diverifikasi (sandbox)', um.id));
  const k = s.sb.opUangMukaKembali({ uangMukaId: um.id, nominal: 300000, tanggal: '2026-09-28', clientRequestId: 'k1' }).data; T.push(snap('pengembalian 300.000', um.id));
  selLangsung(s, k.transaksiId, 'archivedAt', '2026-10-01T00:00:00.000Z'); T.push(snap('ARSIP transaksi pengembalian (di luar server; [P1_26] jalur umum menolak)', um.id));
  selLangsung(s, um.transaksiCairId, 'nominal', 1500000); T.push(snap('KOREKSI nominal pencairan -> 1.500.000 (di luar server; [P1_26] jalur umum menolak)', um.id));
  selLangsung(s, um.transaksiCairId, 'archivedAt', '2026-10-01T00:00:00.000Z'); T.push(snap('ARSIP transaksi pencairan (di luar server; [P1_26] jalur umum menolak)', um.id));
  const um2 = s.sb.opUangMukaCair({ kegiatan: 'Batal', pelaksana: 'Bu B', nominal: 400000, tanggal: '2026-09-21', unit: 'MI', akunId: 'akun_kas1', kategori: 'ATK', clientRequestId: 'm2' }).data;
  s.sb.opUangMukaBatal({ uangMukaId: um2.id, alasan: 'Kegiatan dibatalkan sekolah' }); T.push(snap('uang muka 2: cair 400.000 lalu DIBATALKAN', um2.id));
  const at = i => T[i];
  rec('PA-09', 'MATRIKS (INFO, fixture September 2026): [arus kas keluar, dilaporkan, terverifikasi, saldo, pengembalian, status] | FCC [pengeluaran, penerimaan, posisi kas] | populasi BDS03 (PENGELUARAN)', null, J(T));
  rec('PA-10', 'konsistensi: pencairan = +2.000.000 pengeluaran FCC & +1 populasi BDS03; nota (diajukan/diverifikasi) TIDAK mengubah FCC/BDS03; pengembalian = +300.000 penerimaan FCC (bukan pengurang pengeluaran); DIBATALKAN tidak menghapus pencairan (FCC tetap +400.000)',
    at(1).fcc[0] - at(0).fcc[0] === 2000000 && at(1).bds03Populasi - at(0).bds03Populasi === 1 && J(at(2).fcc) === J(at(1).fcc) && J(at(3).fcc) === J(at(1).fcc) && at(4).fcc[1] - at(3).fcc[1] === 300000 && at(4).fcc[0] === at(3).fcc[0]
      && at(8).fcc[0] - at(7).fcc[0] === 400000 && at(8).um[5] === 'DIBATALKAN', J(T.map(t => [t.peristiwa.slice(0, 22), t.fcc[0], t.fcc[1], t.bds03Populasi])));
  rec('PA-11', 'RISIKO (INFO) arsip/koreksi transaksi uang muka DI LUAR SERVER (data historis/sunting langsung sheet; sejak P1_26 jalur umum menolaknya): arsip pengembalian -> FCC penerimaan turun, saldo uang muka naik kembali (konsisten, + peringatan); KOREKSI nominal pencairan -> FCC & arus kas 1.500.000 tetapi saldo tetap dihitung dari nominalCair 2.000.000 (+ NOMINAL_PENCAIRAN_BERBEDA); ARSIP pencairan -> FCC pengeluaran turun 1.500.000 dan arus kas 0, tetapi saldo uang muka tetap 800.000 (TIDAK KONSISTEN, hanya peringatan). Guard server jalur umum: P1_26 (p1_26_um_guard_tests)', null,
    J({ arsipKembali: [at(5).um, at(5).peringatan], koreksiCair: [at(6).um, at(6).fcc[0], at(6).peringatan], arsipCair: [at(7).um, at(7).fcc[0], at(7).peringatan] }));
  rec('PA-12', 'peringatan muncul tepat: PENGEMBALIAN_DIARSIP setelah arsip pengembalian; NOMINAL_PENCAIRAN_BERBEDA setelah koreksi nominal; PENCAIRAN_DIARSIP_ATAU_HILANG setelah arsip pencairan; arus kas keluar mengikuti transaksi aktif (2.000.000 -> 1.500.000 -> 0)',
    at(5).peringatan.includes('PENGEMBALIAN_DIARSIP') && at(6).peringatan.includes('NOMINAL_PENCAIRAN_BERBEDA') && at(7).peringatan.includes('PENCAIRAN_DIARSIP_ATAU_HILANG') && at(4).um[0] === 2000000 && at(6).um[0] === 1500000 && at(7).um[0] === 0,
    J([at(5).peringatan, at(6).peringatan, at(7).peringatan])); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
