/* Suite PENGAMAN TRANSAKSI UANG MUKA DI JALUR UMUM (P1_26; sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * umTrxGuard_ (UangMukaLpj.gs) dipanggil opArchiveTransaction (di dalam kunci) dan opEngineWrite_ (UPDATE_TRANSACTION, CREATE_ALLOCATION).
 * Fixture SINTETIS: uang muka A cair 2.000.000 (20-09) + pengembalian 300.000; uang muka B cair 400.000 lalu DIBATALKAN.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026', T = 'TRANSAKSI_UANG_MUKA_TERKUNCI';
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const code = r => r && (r.ok ? 'OK' : r.code);
const audits = (s, a) => s.sheets['13_AUDIT_LOG'].slice(1).filter(r => r[2] === a).length;
function siap(noSetup) {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); if (noSetup) return { s };
  s.sb.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ');
  const A = s.sb.opUangMukaCair({ kegiatan: 'Lomba', pelaksana: 'Pak A', nominal: 2000000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'gA' }).data;
  const K = s.sb.opUangMukaKembali({ uangMukaId: A.id, nominal: 300000, tanggal: '2026-09-25', clientRequestId: 'gK' }).data;
  const B = s.sb.opUangMukaCair({ kegiatan: 'Batal', pelaksana: 'Bu B', nominal: 400000, tanggal: '2026-09-21', unit: 'MI', akunId: 'akun_kas1', kategori: 'ATK', clientRequestId: 'gB' }).data;
  s.sb.opUangMukaBatal({ uangMukaId: B.id, alasan: 'Kegiatan dibatalkan sekolah' });
  return { s, A, K, B };
}
const posisi = (s, id) => { const u = s.sb.opUangMukaLaporan({}).data.uangMuka.find(x => x.id === id); return [u.arusKasKeluar, u.pengembalian, u.saldoBelumDipertanggungjawabkan, u.peringatan.length]; };
const fcc = s => { const a = s.sb.opFinancialControl(P).data.actual; return [a.expensePeriode, a.incomePeriode, a.cashPosition]; };

{ const { s, A } = siap(); const before = J(s.sheets), f0 = fcc(s), p0 = posisi(s, A.id);
  const r = s.sb.opArchiveTransaction(A.transaksiCairId, 'salah catat');
  rec('UG-01', 'arsip transaksi PENCAIRAN uang muka aktif lewat jalur umum -> ' + T + '; tidak ada penulisan (sheet identik, termasuk 13_AUDIT_LOG); saldo & FCC tidak berubah',
    r.code === T && J(s.sheets) === before && J(fcc(s)) === J(f0) && J(posisi(s, A.id)) === J(p0), J({ code: r.code, msg: r.message })); }
{ const { s, A, K } = siap(); const before = J(s.sheets);
  const r = s.sb.opArchiveTransaction(K.transaksiId, 'salah akun');
  rec('UG-02', 'arsip transaksi PENGEMBALIAN aktif -> ' + T + '; tidak ada penulisan; pengembalian tetap dihitung (saldo A 1.700.000)', r.code === T && J(s.sheets) === before && posisi(s, A.id)[2] === 1700000, r.code); }
{ const { s, B } = siap(); const r = s.sb.opArchiveTransaction(B.transaksiCairId, 'kegiatan batal');
  const u = s.sb.opUangMukaLaporan({}).data.uangMuka.find(x => x.id === B.id);
  rec('UG-03', 'uang muka DIBATALKAN: pencairannya TETAP tidak dapat diarsip lewat jalur umum (saldo 400.000 masih harus dikembalikan); jejak pencairan tetap', r.code === T && u.status === 'DIBATALKAN' && u.arusKasKeluar === 400000, J([r.code, u.status, u.saldoBelumDipertanggungjawabkan])); }
{ const { s, A } = siap(); const before = J(s.sheets);
  const r = [1, 2, 3].map(() => code(s.sb.opArchiveTransaction(A.transaksiCairId, 'ulang')));
  rec('UG-04', 'pengarsipan berulang / retry: setiap percobaan ditolak sama, tidak ada efek samping kumulatif', r.every(x => x === T) && J(s.sheets) === before, J(r)); }
{ const { s, A } = siap(); const h = s.sheets['05_TRANSAKSI'][0], row = s.sheets['05_TRANSAKSI'].find(x => x[0] === A.transaksiCairId); row[h.indexOf('archivedAt')] = '2026-10-01T00:00:00.000Z'; // diarsip di luar server (historis)
  const r = s.sb.opArchiveTransaction(A.transaksiCairId, 'ulang'), u = s.sb.opUpdateTransaction({ id: A.transaksiCairId, catatan: 'x' });
  rec('UG-05', 'transaksi uang muka yang SUDAH diarsip (di luar server): arsip ulang = no-op jalur umum ("sudah diarsipkan"), koreksi = TRANSACTION_ARCHIVED; laporan memberi peringatan',
    r.ok && /sudah diarsipkan sebelumnya/.test(r.message) && u.code === 'TRANSACTION_ARCHIVED' && posisi(s, A.id)[3] > 0, J([r.message, u.code])); }
{ const { s, A } = siap(); const id = A.transaksiCairId, cur = obj(s, '05_TRANSAKSI', id);
  const tolak = { nominal: 1500000, jenis: 'PENERIMAAN', tanggal: '2026-09-21', akunId: 'akun_kas1', unit: 'TK', siswaId: 's1', sumber: 'lain' };
  const hasil = Object.keys(tolak).map(f => [f, code(s.sb.opUpdateTransaction({ id, [f]: tolak[f] }))]);
  const boleh = [code(s.sb.opUpdateTransaction({ id, catatan: 'koreksi catatan' })), code(s.sb.opUpdateTransaction({ id, penerima: 'Pak A (koordinator)' })), code(s.sb.opUpdateTransaction({ id, nominal: cur.nominal }))];
  const after = obj(s, '05_TRANSAKSI', id);
  rec('UG-06', 'koreksi umum pencairan: nominal/jenis/tanggal/akunId/unit/siswaId/sumber -> ' + T + '; catatan/penerima boleh; nominal SAMA (tanpa perubahan) boleh; nilai uang tidak berubah',
    hasil.every(x => x[1] === T) && boleh.every(x => x === 'OK') && after.nominal === cur.nominal && after.jenis === 'PENGELUARAN' && after.catatan === 'koreksi catatan', J({ hasil, boleh })); }
{ const { s, A, K } = siap(); const p0 = posisi(s, A.id);
  const a = s.sb.opCreateAllocation({ transaksiId: K.transaksiId, siswaId: 's2', komponenId: 'kmp_spp', periode: P, nominal: 200000, clientRequestId: 'al1' });
  const ob = s.sb.opObligations({ siswaId: 's2', periode: P }).data.rows.find(o => o.komponenId === 'kmp_spp');
  rec('UG-07', '[P1_26 temuan] alokasi transaksi PENGEMBALIAN ke kewajiban siswa -> ' + T + ' (sebelumnya SUCCESS: pengembalian dihitung dua kali, mengurangi saldo uang muka DAN melunasi SPP); kewajiban tetap belum lunas',
    a.code === T && ob.status !== 'LUNAS' && J(posisi(s, A.id)) === J(p0), J({ alokasi: a.code, spp: ob.status })); }
{ const { s } = siap(true); const a = s.sb.opArchiveTransaction('imp_trx_2', 'salah input'), u = s.sb.opUpdateTransaction({ id: 'imp_trx_1', catatan: 'x' });
  const { s: s2 } = siap(); const b = s2.sb.opArchiveTransaction('imp_trx_2', 'salah input');
  rec('UG-08', 'tanpa skema uang muka (pra-setup, kondisi produksi saat ini): perilaku jalur umum TIDAK berubah; sesudah setup, transaksi biasa tetap dapat diarsip', a.ok && u.ok && b.ok, J([code(a), code(u), code(b)])); }
{ const { s, A } = siap(); s.state.failSetValuesOn = '33_UANG_MUKA_KEMBALI'; const n0 = s.sheets['05_TRANSAKSI'].length;
  const r1 = s.sb.opUangMukaKembali({ uangMukaId: A.id, nominal: 100000, tanggal: '2026-09-26', clientRequestId: 'gK2' }), mid = s.sheets['05_TRANSAKSI'].length;
  const r2 = s.sb.opUangMukaKembali({ uangMukaId: A.id, nominal: 100000, tanggal: '2026-09-26', clientRequestId: 'gK2' }), r3 = s.sb.opUangMukaKembali({ uangMukaId: A.id, nominal: 100000, tanggal: '2026-09-26', clientRequestId: 'gK2' });
  rec('UG-09', 'kegagalan parsial pengembalian (tulis 33 gagal): transaksi kas di-rollback (tidak ada pengembalian yatim); retry -> tepat 1 transaksi; retry kedua -> replay; saldo 1.600.000',
    !r1.ok && mid === n0 && r2.ok && r3.ok && r3.data.replay && s.sheets['05_TRANSAKSI'].length === n0 + 1 && posisi(s, A.id)[2] === 1600000, J([r1.code, code(r2), r3.data && r3.data.replay])); }
{ const { s, A, B } = siap(); const f0 = fcc(s);
  ['opArchiveTransaction'].forEach(() => { s.sb.opArchiveTransaction(A.transaksiCairId, 'x'); s.sb.opUpdateTransaction({ id: B.transaksiCairId, nominal: 1 }); });
  const k = s.sb.opUangMukaKembali({ uangMukaId: B.id, nominal: 400000, tanggal: '2026-09-27', clientRequestId: 'gKB' });
  const pa = posisi(s, A.id), pb = posisi(s, B.id), f1 = fcc(s);
  rec('UG-10', 'konsistensi saldo vs FCC setelah percobaan arsip/koreksi ditolak + koreksi resmi (pengembalian penuh uang muka DIBATALKAN): FCC pengeluaran tetap = Σ pencairan aktif; penerimaan +400.000; saldo B 0; tanpa peringatan',
    k.ok && f1[0] === f0[0] && f1[1] - f0[1] === 400000 && pb[2] === 0 && pa[3] === 0 && pb[3] === 0, J({ f0, f1, A: pa, B: pb })); }
{ const { s, A } = siap(); const u = s.sb.opUpdateTransaction({ id: A.transaksiCairId, nominal: 1500000, clientRequestId: 'upd1' }), u2 = s.sb.opUpdateTransaction({ id: A.transaksiCairId, nominal: 1500000, clientRequestId: 'upd1' });
  rec('UG-11', 'retry koreksi yang ditolak (clientRequestId sama) tetap ditolak; tidak ada catatan idempotensi "berhasil" yang dapat di-replay', u.code === T && u2.code === T && !s.sheets['24_IDEMPOTENCY_LOG'].slice(1).some(r => r[0] === 'upd1'), J([u.code, u2.code])); }
{ const { s, A, K } = siap(); const n0 = audits(s, 'ARCHIVE_TRANSACTION');
  s.sb.opArchiveTransaction(A.transaksiCairId, 'x'); s.sb.opArchiveTransaction(K.transaksiId, 'x');
  rec('UG-12', 'penolakan terjadi sebelum penulisan: tidak ada baris ARCHIVE_TRANSACTION/ARCHIVE_ALLOCATION baru; alokasi tidak tersentuh', audits(s, 'ARCHIVE_TRANSACTION') === n0 && audits(s, 'ARCHIVE_ALLOCATION') === 0, n0); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
