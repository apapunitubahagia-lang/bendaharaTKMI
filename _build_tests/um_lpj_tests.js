/* Suite UANG MUKA OPSI C + STATUS & TAUTAN LPJ (P1_22; PROTOTIPE SANDBOX Node, TIDAK menyentuh Google Sheets).
 * Skenario dasar: pencairan Rp2.000.000 (20-09) -> nota Rp1.700.000 diverifikasi -> pengembalian Rp300.000 -> saldo 0 -> SELESAI.
 * Verifikasi operasional NONAKTIF (UM_VERIFIKASI_AKTIF_ = false); uji yang membutuhkannya menyalakan bendera di sandbox secara eksplisit.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const CONF = 'BUAT_SKEMA_UANG_MUKA_LPJ';
function fresh(noSetup) {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  s.sheets['26_USER_ACCESS'].push(['U3', 'kepala@x.id', 'K', 'KEPALA_SEKOLAH', 'MI', 'ACTIVE', '', ''], ['U4', 'yayasan@x.id', 'Y', 'YAYASAN', '', 'ACTIVE', '', '']);
  if (!noSetup) s.sb.opUangMukaLpjSetup(CONF);
  return s;
}
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const trxN = s => rows(s, '05_TRANSAKSI').length;
const audits = (s, a) => rows(s, '13_AUDIT_LOG').filter(r => r[2] === a);
const as = (s, email, fn) => { const e0 = s.state.email; s.state.email = email; try { return fn(); } finally { s.state.email = e0; } };
const code = r => r && (r.ok ? (r.data && r.data.replay ? 'REPLAY' : r.data && r.data.unchanged ? 'UNCHANGED' : 'OK') : r.code);
const CAIR = { kegiatan: 'Lomba 17an', pelaksana: 'Pak Ahmad', nominal: 2000000, tanggal: '2026-09-20', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'cair1' };
const lpjBaru = (s, id, o) => s.sb.opRecordBatch('lpj', [{ op: 'upsert', id, row: Object.assign({ tanggal: '2026-09-25', unit: 'MI', kategori: 'ATK', item: 'Nota ' + id, nominal: 1700000, status: 'REALIZATION' }, o || {}) }]);
function siapUM(s) { const c = s.sb.opUangMukaCair(CAIR); lpjBaru(s, 'lpj_um1'); return c.data.id; }

(async () => {
  // ---------- setup ----------
  { const s = fresh(true); const before = Object.keys(s.sheets).sort().join();
    const op = s.sb.opUangMukaCair(CAIR), pl = s.sb.opUangMukaLpjPlan(), mid = Object.keys(s.sheets).sort().join();
    const tolak = s.sb.opUangMukaLpjSetup('ya'), aud = as(s, 'auditor@x.id', () => s.sb.opUangMukaLpjSetup(CONF));
    const a = s.sb.opUangMukaLpjSetup(CONF), b = s.sb.opUangMukaLpjSetup(CONF);
    rec('UM-01', 'skema tidak dibuat otomatis: operasi sebelum setup -> SCHEMA_ADDITIVE_REQUIRED; pratinjau baca-saja; setup wajib konfirmasi & BENDAHARA; setup idempoten (ulang = tidak berubah); audit SCHEMA_CREATE_SHEET',
      op.code === 'SCHEMA_ADDITIVE_REQUIRED' && pl.ok && before === mid && tolak.code === 'CONFIRM_REQUIRED' && aud.code === 'ROLE_NOT_ALLOWED' && a.ok && a.data.dibuat.length === 3 && b.data.unchanged === true && audits(s, 'SCHEMA_CREATE_SHEET').length === 3 && s.sheets['19_LPJ'][0].includes('statusLpj'),
      J({ op: op.code, tolak: tolak.code, aud: aud.code, a: a.data, b: b.data.unchanged })); }
  // ---------- pencairan ----------
  { const s = fresh(); const n0 = trxN(s); const r1 = s.sb.opUangMukaCair(CAIR), r2 = s.sb.opUangMukaCair(CAIR); const u = obj(s, '32_UANG_MUKA', r1.data.id);
    rec('UM-02', 'pencairan: 1 transaksi PENGELUARAN kas + 1 entitas DICAIRKAN bertaut transaksiCairId; audit UANG_MUKA_CAIR; retry clientRequestId sama -> replay, tanpa transaksi kedua',
      r1.ok && code(r2) === 'REPLAY' && trxN(s) === n0 + 1 && u.status === 'DICAIRKAN' && u.transaksiCairId === r1.data.transaksiCairId && audits(s, 'UANG_MUKA_CAIR').length === 1, J({ u: [u.status, u.nominalCair], trx: trxN(s) - n0 })); }
  { const s = fresh(); const n0 = trxN(s); s.state.failSetValuesOn = '32_UANG_MUKA';
    const r1 = s.sb.opUangMukaCair(CAIR); const mid = trxN(s), idem = rows(s, '24_IDEMPOTENCY_LOG').filter(r => /um_cair_cair1/.test(r[0])).length;
    const r2 = s.sb.opUangMukaCair(CAIR);
    rec('UM-03', 'kegagalan di tengah (tulis 32_UANG_MUKA gagal setelah transaksi kas dibuat): transaksi & idempotensinya di-rollback, audit ROLLBACK_TRANSAKSI, tidak ada transaksi yatim; retry -> tepat 1 transaksi + 1 entitas',
      !r1.ok && r1.code === 'WRITE_FAILED' && mid === n0 && idem === 0 && audits(s, 'ROLLBACK_TRANSAKSI').length === 1 && r2.ok && trxN(s) === n0 + 1 && rows(s, '32_UANG_MUKA').length === 1, J({ r1: r1.code, setelahGagal: mid - n0, r2: code(r2) })); }
  { const s = fresh(); const v = [s.sb.opUangMukaCair(Object.assign({}, CAIR, { pelaksana: '' })), s.sb.opUangMukaCair(Object.assign({}, CAIR, { nominal: 0 })), s.sb.opUangMukaCair(Object.assign({}, CAIR, { tanggal: '2026-02-30' })),
      s.sb.opUangMukaCair(Object.assign({}, CAIR, { akunId: '' })), s.sb.opUangMukaCair(Object.assign({}, CAIR, { kategori: 'Fiktif' })), s.sb.opUangMukaCair(Object.assign({}, CAIR, { rabId: 'rab_tidak_ada' })), s.sb.opUangMukaCair(Object.assign({}, CAIR, { clientRequestId: '' }))].map(code);
    const aud = as(s, 'auditor@x.id', () => s.sb.opUangMukaCair(CAIR));
    rec('UM-04', 'validasi server pencairan: pelaksana / nominal / tanggal kalender / akun eksplisit / kategori master / rabId / clientRequestId; AUDITOR ditolak; 0 entitas',
      v.every(x => x !== 'OK') && aud.code === 'ROLE_NOT_ALLOWED' && rows(s, '32_UANG_MUKA').length === 0, J(v)); }
  // ---------- siklus lengkap ----------
  { const s = fresh(); const umId = siapUM(s); const n0 = trxN(s);
    const fake = s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_um1', row: { statusLpj: 'DIVERIFIKASI', diverifikasiOleh: 'palsu@x.id' } }]);
    const aj = s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-09-25', uangMukaId: umId }), st1 = obj(s, '32_UANG_MUKA', umId).status;
    const te = s.sb.opLpjTerima({ lpjId: 'lpj_um1' }), st2 = obj(s, '32_UANG_MUKA', umId).status, L = obj(s, '19_LPJ', 'lpj_um1');
    rec('UM-05', 'LPJ: kolom status dari jalur publik dibuang (bukan DIVERIFIKASI); DIAJUKAN (tanggalNota, pengaju = sesi) -> DITERIMA (tanggalDiterima = server); uang muka DICAIRKAN -> LPJ_DITERIMA; 0 transaksi baru (nota bukan transaksi kas)',
      fake.ok && fake.data.results[0].code === 'UNCHANGED' && aj.ok && st1 === 'DICAIRKAN' && te.ok && st2 === 'LPJ_DITERIMA' && L.statusLpj === 'DITERIMA' && L.diajukanOleh === 'bendahara@x.id' && L.tanggalNota === '2026-09-25' && /^\d{4}-\d{2}-\d{2}$/.test(L.tanggalDiterima) && trxN(s) === n0,
      J({ status: L.statusLpj, um: [st1, st2], diterima: L.tanggalDiterima }));
    const v0 = as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DIVERIFIKASI' })), vb = s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DIVERIFIKASI' });
    rec('UM-06', 'verifikasi NONAKTIF secara bawaan (GAP-005/D-T7): KEPALA_SEKOLAH -> VERIFIKASI_BELUM_AKTIF; BENDAHARA tidak dapat memverifikasi (ROLE_NOT_ALLOWED); bukti terunggah tidak mengubah status', v0.code === 'VERIFIKASI_BELUM_AKTIF' && vb.code === 'ROLE_NOT_ALLOWED' && obj(s, '19_LPJ', 'lpj_um1').statusLpj === 'DITERIMA', [v0.code, vb.code].join(' '));
    s.sb.UM_VERIFIKASI_AKTIF_ = true; // sandbox saja
    const t0 = as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DITOLAK', alasan: 'x' }));
    const t1 = as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DITOLAK', alasan: 'Nota konsumsi tanpa stempel toko' }));
    const st3 = obj(s, '32_UANG_MUKA', umId).status;
    const aj2 = s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-09-25', uangMukaId: umId }), te2 = s.sb.opLpjTerima({ lpjId: 'lpj_um1' });
    const ok1 = as(s, 'yayasan@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DIVERIFIKASI' })), L2 = obj(s, '19_LPJ', 'lpj_um1'), st4 = obj(s, '32_UANG_MUKA', umId).status;
    rec('UM-07', '[sandbox, bendera dinyalakan] DITOLAK tanpa alasan -> ALASAN_WAJIB; DITOLAK beralasan -> uang muka PERLU_PERBAIKAN; diajukan & diterima ulang; YAYASAN memverifikasi -> LPJ DIVERIFIKASI (verifikator & tanggal dari server), uang muka DIVERIFIKASI (saldo 300.000 belum kembali)',
      t0.code === 'ALASAN_WAJIB' && t1.ok && st3 === 'PERLU_PERBAIKAN' && aj2.ok && te2.ok && ok1.ok && L2.statusLpj === 'DIVERIFIKASI' && L2.diverifikasiOleh === 'yayasan@x.id' && L2.alasanTolak === '' && st4 === 'DIVERIFIKASI',
      J({ t0: t0.code, st3, st4, verifikator: L2.diverifikasiOleh }));
    const lebih = s.sb.opUangMukaKembali({ uangMukaId: umId, nominal: 300001, tanggal: '2026-10-06', clientRequestId: 'kb0' });
    const kb = s.sb.opUangMukaKembali({ uangMukaId: umId, nominal: 300000, tanggal: '2026-10-06', clientRequestId: 'kb1' }), kb2 = s.sb.opUangMukaKembali({ uangMukaId: umId, nominal: 300000, tanggal: '2026-10-06', clientRequestId: 'kb1' });
    const st5 = obj(s, '32_UANG_MUKA', umId).status, lap = s.sb.opUangMukaLaporan({}).data, kt = obj(s, '05_TRANSAKSI', kb.data.transaksiId);
    rec('UM-08', 'pengembalian: > saldo -> MELEBIHI_SALDO; 300.000 -> PENERIMAAN bertanda 33 (sumber "Pengembalian Uang Muka", bukan penerimaan operasional), retry replay; saldo 0 & semua LPJ terverifikasi -> SELESAI',
      lebih.code === 'MELEBIHI_SALDO' && kb.ok && code(kb2) === 'REPLAY' && st5 === 'SELESAI' && kt.jenis === 'PENERIMAAN' && kt.sumber === 'Pengembalian Uang Muka' && rows(s, '33_UANG_MUKA_KEMBALI').length === 1, J({ lebih: lebih.code, st5, sumber: kt.sumber }));
    rec('UM-09', 'laporan opsi C: kas keluar 2.000.000; beban terverifikasi 1.700.000; pengembalian 300.000; saldo 0; total transaksi kas = 2 (pencairan + pengembalian) - nota tidak menjadi transaksi kedua',
      lap.total.kasKeluar === 2000000 && lap.total.notaTerverifikasi === 1700000 && lap.total.pengembalian === 300000 && lap.total.saldoBelumDipertanggungjawabkan === 0 && trxN(s) === n0 + 1 && lap.uangMuka[0].statusTurunan === 'SELESAI',
      J(lap.total));
    rec('UM-10', 'DAMPAK FCC/BDS03 (formula tidak diubah): pencairan tercatat penuh sebagai pengeluaran aktual, pengembalian sebagai penerimaan; selisih bila basis beban dipakai', null, J(lap.dampakFccBds03));
    const tolak = [s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_um1', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }), s.sb.opLinkLpj({ lpjId: 'lpj_um1', transaksiId: 'imp_trx_2' }),
      s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_um1', row: { transaksiId: 'imp_trx_2' } }]).data.results[0], s.sb.opRecordBatch('lpj', [{ op: 'archive', id: 'lpj_um1', reason: 'x' }]).data.results[0]].map(x => x.code);
    rec('UM-11', 'tidak ada hitung ganda / jalan pintas: LPJ uang muka -> opCreateExpenseFromLpj & opLinkLpj ditolak (LPJ_UANG_MUKA); jalur publik ubah transaksiId / arsip -> LPJ_TERKUNCI; jumlah transaksi tetap',
      J(tolak) === J(['LPJ_UANG_MUKA', 'LPJ_UANG_MUKA', 'LPJ_TERKUNCI', 'LPJ_TERKUNCI']) && trxN(s) === n0 + 1, J(tolak)); }
  { const s = fresh(); s.sb.UM_VERIFIKASI_AKTIF_ = true; const umId = siapUM(s);
    s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-09-25', uangMukaId: umId }); s.sb.opLpjTerima({ lpjId: 'lpj_um1' });
    const h = s.sheets['19_LPJ'][0], r = s.sheets['19_LPJ'].find(x => x[0] === 'lpj_um1'); r[h.indexOf('diajukanOleh')] = 'kepala@x.id';
    const pt = as(s, 'kepala@x.id', () => s.sb.opLpjVerifikasi({ lpjId: 'lpj_um1', hasil: 'DIVERIFIKASI' }));
    rec('UM-12', 'pemisahan tugas: pemeriksa = pengaju LPJ -> PEMISAHAN_TUGAS', pt.code === 'PEMISAHAN_TUGAS', pt.code); }
  { const s = fresh(); const umId = siapUM(s); lpjBaru(s, 'lpj_um2', { nominal: 400000 });
    const t = [s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-02-30', uangMukaId: umId }), s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2099-01-01', uangMukaId: umId }),
      s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-09-10', uangMukaId: umId }), s.sb.opLpjAjukan({ lpjId: 'lpj_um1', tanggalNota: '2026-09-25', uangMukaId: umId }),
      s.sb.opLpjAjukan({ lpjId: 'lpj_um2', tanggalNota: '2026-09-26', uangMukaId: umId }), s.sb.opLpjTerima({ lpjId: 'lpj_um2' })].map(code);
    rec('UM-13', 'validasi tanggal & batas: tanggal tidak sah / masa depan / sebelum pencairan -> VALIDATION_ERROR; Σ LPJ (1,7jt + 0,4jt) > uang muka 2jt -> MELEBIHI_UANG_MUKA; terima LPJ yang belum diajukan -> STATUS_TIDAK_VALID',
      J(t) === J(['VALIDATION_ERROR', 'VALIDATION_ERROR', 'VALIDATION_ERROR', 'OK', 'MELEBIHI_UANG_MUKA', 'STATUS_TIDAK_VALID']), J(t)); }
  // ---------- tautan LPJ biasa ----------
  { const s = fresh(); lpjBaru(s, 'lpj_a', { nominal: 45000, tanggal: '2026-10-05' }); const n0 = trxN(s);
    const c1 = s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }), c2 = s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' });
    const L = obj(s, '19_LPJ', 'lpj_a'), T = rows(s, '34_LPJ_TAUTAN');
    rec('LK-01', 'opCreateExpenseFromLpj: 1 transaksi + tautan + riwayat 34 AKTIF + audit LPJ_CREATE_EXPENSE dalam satu kunci; panggilan ulang (klik ganda) -> replay, tetap 1 transaksi',
      c1.ok && code(c2) === 'REPLAY' && c2.data.transaksiId === c1.data.transaksiId && trxN(s) === n0 + 1 && L.transaksiId === c1.data.transaksiId && T.length === 1 && audits(s, 'LPJ_CREATE_EXPENSE').length === 1, J({ c2: code(c2), trx: trxN(s) - n0, tautan: T.length })); }
  { const s = fresh(); lpjBaru(s, 'lpj_a', { nominal: 45000, tanggal: '2026-10-05' }); const n0 = trxN(s); s.state.failSetValuesOn = '34_LPJ_TAUTAN';
    const c1 = s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }); const mid = trxN(s), L1 = obj(s, '19_LPJ', 'lpj_a');
    const c2 = s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' });
    rec('LK-02', 'kegagalan di tengah (tulis riwayat tautan gagal): transaksi di-rollback, LPJ tetap belum bertaut, audit ROLLBACK_TRANSAKSI; retry -> tepat 1 transaksi bertaut',
      c1.code === 'WRITE_FAILED' && mid === n0 && L1.transaksiId === '' && audits(s, 'ROLLBACK_TRANSAKSI').length === 1 && c2.ok && trxN(s) === n0 + 1 && obj(s, '19_LPJ', 'lpj_a').transaksiId === c2.data.transaksiId, J({ c1: c1.code, mid: mid - n0, c2: code(c2) })); }
  { const s = fresh(); lpjBaru(s, 'lpj_b', { nominal: 30000, tanggal: '2026-09-06' }); lpjBaru(s, 'lpj_c', { nominal: 30000, tanggal: '2026-09-06' }); lpjBaru(s, 'lpj_d', { nominal: 10000, tanggal: '2026-10-06', unit: 'TK' });
    const a = s.sb.opLinkLpj({ lpjId: 'lpj_b', transaksiId: 'imp_trx_2' }), b = s.sb.opLinkLpj({ lpjId: 'lpj_b', transaksiId: 'imp_trx_2' }), c = s.sb.opLinkLpj({ lpjId: 'lpj_c', transaksiId: 'imp_trx_2' });
    const d0 = s.sb.opLinkLpj({ lpjId: 'lpj_d', transaksiId: 'imp_trx_2' }), d1 = s.sb.opLinkLpj({ lpjId: 'lpj_d', transaksiId: 'imp_trx_2', alasanPerbedaan: 'Nota TK dibayar dari kas MI (koreksi)' });
    const e = s.sb.opLinkLpj({ lpjId: 'lpj_c', transaksiId: 'imp_trx_1' }), f = s.sb.opLinkLpj({ lpjId: 'lpj_d', transaksiId: 'imp_trx_2', expect: { transaksiId: '' } });
    rec('LK-03', 'opLinkLpj: tautan + ulang = UNCHANGED; LPJ kedua melebihi nominal transaksi (30+30 > 50 rb) -> LPJ_EXCEEDS_TRANSACTION; beda unit/periode -> PERLU_PEMERIKSAAN, dengan alasan -> bertaut (perbedaan dicatat); ke PENERIMAAN -> INVALID_TRANSACTION; expect usang -> UNCHANGED karena sama / CONFLICT bila beda',
      a.ok && code(b) === 'UNCHANGED' && c.code === 'LPJ_EXCEEDS_TRANSACTION' && d0.code === 'PERLU_PEMERIKSAAN' && d1.ok && J(d1.data.perbedaan) === J(['unit', 'periode']) && e.code === 'INVALID_TRANSACTION' && code(f) === 'UNCHANGED',
      [code(a), code(b), c.code, d0.code, code(d1), e.code, code(f)].join(' '));
    const n0 = trxN(s), u0 = s.sb.opUnlinkLpj({ lpjId: 'lpj_b', alasan: 'salah' }), u1 = s.sb.opUnlinkLpj({ lpjId: 'lpj_b', alasan: 'Nota milik transaksi lain', expect: { transaksiId: 'trx_lain' } }), u2 = s.sb.opUnlinkLpj({ lpjId: 'lpj_b', alasan: 'Nota milik transaksi lain', expect: { transaksiId: 'imp_trx_2' } });
    const T = rows(s, '34_LPJ_TAUTAN').map(r => r[3]);
    rec('LK-04', 'opUnlinkLpj: alasan < 10 -> ALASAN_WAJIB; expect usang -> CONFLICT; sah -> LPJ belum bertaut, riwayat 34 DIBATALKAN (tidak dihapus), transaksi TIDAK dihapus, audit LPJ_UNLINK',
      u0.code === 'ALASAN_WAJIB' && u1.code === 'CONFLICT' && u2.ok && obj(s, '19_LPJ', 'lpj_b').transaksiId === '' && T.includes('DIBATALKAN') && trxN(s) === n0 && obj(s, '05_TRANSAKSI', 'imp_trx_2') && audits(s, 'LPJ_UNLINK').length === 1,
      J({ u0: u0.code, u1: u1.code, riwayat: T })); }
  { const s = fresh(); const umId = siapUM(s); lpjBaru(s, 'lpj_x', { nominal: 5000, tanggal: '2026-09-21' }); const c = obj(s, '32_UANG_MUKA', umId).transaksiCairId;
    const a = s.sb.opLinkLpj({ lpjId: 'lpj_x', transaksiId: c }); s.sb.opLinkLpj({ lpjId: 'lpj_x', transaksiId: 'imp_trx_2' }); const b = s.sb.opLpjAjukan({ lpjId: 'lpj_x', tanggalNota: '2026-09-21', uangMukaId: umId });
    rec('LK-05', 'LPJ biasa ke transaksi pencairan -> TRANSAKSI_PENCAIRAN; LPJ yang sudah bertaut transaksi tidak dapat sekaligus mempertanggungjawabkan uang muka -> LPJ_SUDAH_BERTAUT', a.code === 'TRANSAKSI_PENCAIRAN' && b.code === 'LPJ_SUDAH_BERTAUT', [a.code, b.code].join(' ')); }
  { const s = fresh(); lpjBaru(s, 'lpj_a', { nominal: 45000, tanggal: '2026-10-05' });
    const r = as(s, 'auditor@x.id', () => [s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }), s.sb.opLinkLpj({ lpjId: 'lpj_a', transaksiId: 'imp_trx_2' }), s.sb.opLpjAjukan({ lpjId: 'lpj_a', tanggalNota: '2026-10-05' }), s.sb.opUangMukaLaporan({})].map(code));
    rec('LK-06', 'otorisasi server: AUDITOR tidak dapat membuat/menautkan/mengajukan (ROLE_NOT_ALLOWED), dapat membaca laporan', J(r) === J(['ROLE_NOT_ALLOWED', 'ROLE_NOT_ALLOWED', 'ROLE_NOT_ALLOWED', 'OK']), J(r)); }
  { const s = fresh(); lpjBaru(s, 'lpj_a', { nominal: 45000, tanggal: '2026-10-05' }); s.sb.opLpjAjukan({ lpjId: 'lpj_a', tanggalNota: '2026-10-05' });
    const lap0 = J(s.sb.opFinancialControl('Oktober 2026').data && s.sb.opFinancialControl('Oktober 2026').data.ringkasan || null);
    rec('LK-07', 'LPJ tanpa uang muka tetap dapat diajukan (status) tanpa membuat transaksi; FCC berjalan seperti biasa (LPJ tidak masuk KPI)', obj(s, '19_LPJ', 'lpj_a').statusLpj === 'DIAJUKAN' && rows(s, '05_TRANSAKSI').length === 2, lap0.slice(0, 120)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
