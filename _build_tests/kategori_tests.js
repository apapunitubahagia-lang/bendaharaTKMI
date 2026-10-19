/* Suite KATEGORI PENGELUARAN (P1_20 D; sandbox Node, TIDAK menyentuh Google Sheets).
 * Kategori pengeluaran wajib eksplisit & valid terhadap master aktif 21_KATEGORI_PENGELUARAN; tidak ada fallback;
 * divalidasi server pada create (tunggal/batch) dan koreksi; master tidak tersedia -> gagal tertutup;
 * kategori historis tidak diubah otomatis (audit baca-saja terpisah).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const nT = srv => rows(srv, '05_TRANSAKSI').length;
const exp = (crid, kat, extra) => Object.assign({ clientRequestId: crid, tanggal: '2026-09-10', unit: 'MI', nominal: 25000, akunId: 'akun_kas1', metode: 'Tunai', penerima: 'Toko', kategori: kat }, extra || {});
const katOf = (srv, id) => { const r = rows(srv, '05_TRANSAKSI').find(x => x[0] === id); return r && [r[col(srv, '05_TRANSAKSI', 'kategori')], r[col(srv, '05_TRANSAKSI', 'subkategori')]]; };

(async () => {
  { const srv = makeServer(); const n0 = nT(srv); const a = srv.sb.opCreateExpense(exp('K1', 'Kategori Fiktif')), b = srv.sb.opCreateExpense(exp('K1b', ''));
    rec('KP-01', 'kategori tidak ada di master / kosong -> ditolak server (INVALID_CATEGORY / VALIDATION_ERROR), tidak ada baris', a.code === 'INVALID_CATEGORY' && b.code === 'VALIDATION_ERROR' && /kategori/i.test(b.message) && nT(srv) === n0, [a.code, b.code, (b.message || '').slice(0, 60)].join(' | ')); }
  { const srv = makeServer(); const a = srv.sb.opCreateExpense(exp('K2', '  atk '));
    rec('KP-02', 'beda huruf/spasi -> diterima dan disimpan sebagai nama kanonik master ("ATK")', a.ok && J(katOf(srv, a.data.id)) === J(['ATK', '']), a.code + ' ' + J(a.ok && katOf(srv, a.data.id))); }
  { const srv = makeServer(); srv.sheets['21_KATEGORI_PENGELUARAN'].push(['KAT_OLD', '2', 'Kategori Lama', 'Nonaktif']); const n0 = nT(srv); const a = srv.sb.opCreateExpense(exp('K3', 'Kategori Lama'));
    rec('KP-03', 'kategori Nonaktif -> ditolak INVALID_CATEGORY', a.code === 'INVALID_CATEGORY' && nT(srv) === n0, a.code); }
  { const s1 = makeServer(); delete s1.sheets['21_KATEGORI_PENGELUARAN']; const a = s1.sb.opCreateExpense(exp('K4', 'ATK'));
    const s2 = makeServer(); s2.sheets['21_KATEGORI_PENGELUARAN'][1][3] = 'Nonaktif'; const b = s2.sb.opCreateExpense(exp('K4b', 'ATK'));
    rec('KP-04', 'master kategori tidak tersedia / tanpa kategori aktif -> gagal tertutup KATEGORI_MASTER_TIDAK_TERSEDIA, tidak ada baris', a.code === 'KATEGORI_MASTER_TIDAK_TERSEDIA' && b.code === 'KATEGORI_MASTER_TIDAK_TERSEDIA' && nT(s1) === 2 && nT(s2) === 2, a.code + ' / ' + b.code); }
  { const srv = makeServer(); const a = srv.sb.opCreateExpense(exp('K5', 'ATK', { subkategori: 'Tinta' })), b = srv.sb.opCreateExpense(exp('K5b', 'ATK', { subkategori: 'kertas' }));
    rec('KP-05', 'subkategori bukan milik kategori -> INVALID_SUBCATEGORY; subkategori valid -> nama kanonik', a.code === 'INVALID_SUBCATEGORY' && b.ok && J(katOf(srv, b.data.id)) === J(['ATK', 'Kertas']), a.code + ' / ' + b.code + ' ' + J(b.ok && katOf(srv, b.data.id))); }
  { const srv = makeServer(); const n0 = nT(srv); const b = srv.sb.opCreateTxBatch([{ kind: 'expense', payload: exp('K6a', 'Fiktif') }, { kind: 'expense', payload: exp('K6b', 'ATK') }]);
    rec('KP-06', 'batch (opCreateTxBatch): kategori tidak valid ditolak per item, yang valid tersimpan', !b.data.results[0].ok && b.data.results[0].code === 'INVALID_CATEGORY' && b.data.results[1].ok && nT(srv) === n0 + 1, J(b.data.results.map(r => r.code))); }
  { const srv = makeServer();
    const u1 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', kategori: 'Fiktif' }), u2 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', kategori: '' }), u3 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', subkategori: 'Tinta' });
    const k0 = J(katOf(srv, 'imp_trx_2')); const u4 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', subkategori: 'KERTAS' });
    rec('KP-07', 'koreksi: kategori tidak valid / dikosongkan / subkategori asing ditolak; subkategori valid tersimpan kanonik', u1.code === 'INVALID_CATEGORY' && u2.code === 'VALIDATION_ERROR' && u3.code === 'INVALID_SUBCATEGORY' && k0 === J(['ATK', '']) && u4.ok && J(katOf(srv, 'imp_trx_2')) === J(['ATK', 'Kertas']), [u1.code, u2.code, u3.code, u4.code, J(katOf(srv, 'imp_trx_2'))].join(' | ')); }
  { const srv = makeServer(); srv.sheets['05_TRANSAKSI'][2][col(srv, '05_TRANSAKSI', 'kategori')] = 'Lainnya';
    const u = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', catatan: 'koreksi catatan' });
    rec('KP-08', 'transaksi historis berkategori di luar master ("Lainnya"): koreksi field lain tetap boleh, kategori TIDAK diubah otomatis', u.ok && J(katOf(srv, 'imp_trx_2')) === J(['Lainnya', '']), u.code + ' ' + J(katOf(srv, 'imp_trx_2'))); }
  { const srv = makeServer(); const t = srv.sb.opCreateIncome({ clientRequestId: 'K9', tanggal: '2026-09-10', unit: 'MI', nominal: 10000, akunId: 'akun_kas1', metode: 'Tunai' }).data.id;
    const u = srv.sb.opUpdateTransaction({ id: t, jenis: 'PENGELUARAN' }), u2 = srv.sb.opUpdateTransaction({ id: t, jenis: 'PENGELUARAN', kategori: 'ATK' });
    rec('KP-09', 'penerimaan tanpa kategori tidak terpengaruh; ganti jenis ke PENGELUARAN tanpa kategori valid ditolak, dengan kategori valid boleh', t && u.code === 'VALIDATION_ERROR' && u2.ok, [u.code, u2.code].join(' | ')); }
  { const srv = makeServer(); srv.sheets['05_TRANSAKSI'][2][col(srv, '05_TRANSAKSI', 'kategori')] = 'Lainnya';
    const w0 = J(srv.sheets['05_TRANSAKSI']); srv.state.email = 'auditor@x.id'; const a = typeof srv.sb.opKategoriPengeluaranAudit === 'function' ? srv.sb.opKategoriPengeluaranAudit() : { code: 'TIDAK_ADA' };
    srv.state.email = 'asing@x.id'; const b = typeof srv.sb.opKategoriPengeluaranAudit === 'function' ? srv.sb.opKategoriPengeluaranAudit() : { code: 'TIDAK_ADA' };
    const d = a.data || {};
    rec('KP-10', 'audit baca-saja kategori historis: daftar transaksi perlu tinjauan (kategori di luar master aktif), tanpa menulis; AUDITOR boleh, pengguna asing ditolak', a.ok && d.perluTinjauan && d.perluTinjauan.length === 1 && d.perluTinjauan[0].id === 'imp_trx_2' && d.perluTinjauan[0].alasan === 'KATEGORI_TIDAK_ADA_DI_MASTER' && J(srv.sheets['05_TRANSAKSI']) === w0 && b.code === 'USER_NOT_FOUND',
      J({ a: a.code, ringkas: d.ringkasan, b: b.code })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
