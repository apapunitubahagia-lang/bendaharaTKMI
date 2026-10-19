/* Suite AKUN EKSPLISIT (Prioritas B; sandbox Node, TIDAK menyentuh Google Sheets).
 * Jalur lama yang masih aktif tidak lagi memakai akun Kas/Bank pertama secara otomatis; server menolak transaksi tanpa akun.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const html = c => c.el('modalBody').innerHTML;

(async () => {
  { const srv = makeServer();
    const a = srv.sb.opCreateExpense({ clientRequestId: 'ak_1', tanggal: '2026-09-01', unit: 'MI', nominal: 1000, metode: 'Tunai', kategori: 'ATK', penerima: 'X' });
    const b = srv.sb.opCreateIncome({ clientRequestId: 'ak_2', tanggal: '2026-09-01', unit: 'MI', nominal: 1000, metode: 'Tunai' });
    const t = srv.sb.opCreateTxBatch([{ kind: 'expense', payload: { clientRequestId: 'ak_3', tanggal: '2026-09-01', unit: 'MI', nominal: 1000, metode: 'Tunai', penerima: 'X' } }]);
    const d = srv.sb.opCreateExpense({ clientRequestId: 'ak_4', tanggal: '2026-09-01', unit: 'MI', nominal: 1000, akunId: 'akun_bank1', metode: 'Tunai', kategori: 'ATK', penerima: 'X' });
    rec('AK-01', 'server: transaksi baru tanpa akunId ditolak (create & batch); dengan akun eksplisit tersimpan', a.code === 'VALIDATION_ERROR' && b.code === 'VALIDATION_ERROR' && !t.data.results[0].ok && d.ok && rows(srv, '05_TRANSAKSI').length === 3, [a.code, b.code, t.data.results[0].code, d.code].join(',')); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    c.sb.openPengeluaranForm(); const h = html(c);
    Object.assign(c.fields, { gf_nominal: '4100', gf_penerima: 'Toko Akun', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: '', gf_metode: 'Tunai', gf_catatan: '' });
    c.sb.submitPengeluaran(); const t1 = c.toast(); await sync(c); const n1 = rows(srv, '05_TRANSAKSI').length;
    c.fields.gf_akun = 'akun_bank1'; c.sb.submitPengeluaran(); await sync(c);
    const t = rows(srv, '05_TRANSAKSI').find(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === 4100);
    rec('AK-02', 'form Pengeluaran: opsi "Pilih Akun" (tidak terpilih otomatis), tanpa akun ditolak, akun pilihan tersimpan', /- Pilih Akun Kas\/Bank \(wajib\) -/.test(h) && /wajib dipilih/.test(t1) && n1 === n0 && t && t[col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1', t1.slice(0, 60) + ' / akun ' + (t && t[col(srv, '05_TRANSAKSI', 'akunId')])); }
  { const srv = makeServer(); const c = await boot(srv); c.a.State.penerimaanForm = { siswaId: null, rows: [] }; let h = ''; try { h = c.sb.penerimaanFormHtml(); } catch (e) { h = 'ERR ' + e.message; }
    rec('AK-03', 'form Penerimaan & wizard Pembayaran: daftar akun diawali opsi kosong wajib', /- Pilih Akun Kas\/Bank \(wajib\) -/.test(h) && /pf_akun/.test(h), (h.match(/<select id="pf_akun"[\s\S]{0,120}/) || [''])[0]); }
  { const srv = makeServer(); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const c = await boot(srv);
    const m = { id: 'mut_ak1', tanggal: '2026-09-07', nominal: 123000, keterangan: 'TRF', namaPengirim: 'Wali', ftNumber: 'FTA', status: 'BELUM_DIPROSES', transaksiId: '' };
    c.a.Store.saveMutasiBank = c.a.Store.saveMutasiBank; const arr = c.a.Store.loadMutasiBank(); arr.push(m); try { c.a.Store.saveMutasiBank(arr); } catch (e) { /* mode pusat: simpan lokal ditolak */ }
    c.a.Store.loadMutasiBank = (o => () => o().concat(o().some(x => x.id === m.id) ? [] : [m]))(c.a.Store.loadMutasiBank);
    c.sb.openCreateTransaksiFromMutasiUnitModal('mut_ak1'); const h = html(c);
    Object.assign(c.fields, { mtu_unit: 'MI', mtu_akun: '' }); c.sb.createTransaksiFromMutasi('mut_ak1'); const t1 = c.toast();
    Object.assign(c.fields, { mtu_akun: 'akun_kas1' }); c.sb.createTransaksiFromMutasi('mut_ak1'); const t2 = c.toast();
    const n0 = rows(srv, '05_TRANSAKSI').length; await sync(c);
    Object.assign(c.fields, { mtu_akun: 'akun_bank1' }); let err = null; try { c.sb.createTransaksiFromMutasi('mut_ak1'); } catch (e) { err = e.message; } await sync(c);
    const t = rows(srv, '05_TRANSAKSI').find(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === 123000);
    rec('AK-04', 'Buat Transaksi dari Mutasi Bank: akun Bank wajib dipilih (sebelumnya akun Bank pertama otomatis); akun Kas ditolak', /mtu_akun/.test(h) && /wajib dipilih/.test(t1) && /wajib dipilih/.test(t2) && rows(srv, '05_TRANSAKSI').length === n0 + (t ? 1 : 0) && (!t || t[col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1'),
      [t1.slice(0, 40), t2.slice(0, 40), 'akun ' + (t && t[col(srv, '05_TRANSAKSI', 'akunId')]), err || ''].join(' | ')); }
  { const srv = makeServer(); srv.sheets['07_AKUN'].push(['akun_bank2', 'BRI', 'Bank', 0]); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    c.a.State.importSession = { type: 'mutasibank', step: 'map', headers: ['tanggal', 'nominal', 'deskripsi', 'unit'], rows: [{ tanggal: '2026-09-08', nominal: '88000', deskripsi: 'TRF X', unit: 'MI' }], headerMap: { tanggal: 'tanggal', nominal: 'nominal', deskripsi: 'deskripsi', unit: 'unit' }, results: null, batchId: 'b_mb', rawFiles: [{ name: 'mb.csv' }], structurallyValid: true };
    c.sb.importWizardProceedToPreview(); const t1 = c.toast(), blocked = c.a.State.importSession.step === 'map';
    const h = c.sb.importWizardHtml();
    c.a.State.importSession.akunId = 'akun_bank2'; c.sb.importWizardProceedToPreview(); c.sb.importWizardConfirm(); await sync(c);
    const t = rows(srv, '05_TRANSAKSI').find(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === 88000);
    rec('AK-05', 'wizard impor Mutasi Bank lama: akun Bank dipilih eksplisit per berkas (sebelumnya akun Bank pertama), tanpa pilihan -> tidak ada pratinjau', blocked && /wajib dipilih/.test(t1) && /imp_mb_akun/.test(h) && t && t[col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank2' && rows(srv, '05_TRANSAKSI').length === n0 + 1,
      'akun tersimpan ' + (t && t[col(srv, '05_TRANSAKSI', 'akunId')])); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const q = c.a.Store.loadImportQueue(); q.push({ id: 'impq_mb1', type: 'HOLD', importType: 'mutasibank', row: { tanggal: '2026-09-09', nominal: '5000' }, headerMap: { tanggal: 'tanggal', nominal: 'nominal' }, reason: 'lama', createdAt: '', resolved: false }); c.a.Store.saveImportQueue(q);
    c.sb.resolveImportQueueAsNew('impq_mb1'); await sync(c);
    rec('AK-06', 'antrean impor mutasi bank lama tanpa akun pilihan tidak dapat diimpor (tidak jatuh ke akun Bank pertama)', rows(srv, '05_TRANSAKSI').length === n0 && /tanpa akun Bank pilihan/.test(c.toast()), c.toast().slice(0, 80)); }
  { const srv = makeServer(); const rk = srv.sheets['18_RKAT'][0], mb = srv.sheets['11_MUTASI_BANK'][0];
    rec('AK-07', 'inventaris: RKAT & 11_MUTASI_BANK tidak punya kolom akun (RKAT tidak membuat transaksi; akun mutasi ditentukan saat dibuat transaksi)', null, '18_RKAT ' + J(rk.filter(h => /akun/i.test(h))) + ', 11_MUTASI_BANK ' + J(mb.filter(h => /akun/i.test(h)))); }

  // ---------- P1_19 C ----------
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const run = async (hdr, data) => { c.a.State.importSession = { type: 'pengeluaran', step: 'map', headers: hdr, rows: data.map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i]]))), headerMap: Object.fromEntries(hdr.map(h => [h, h])), results: null, batchId: 'b_' + Math.random(), rawFiles: [{ name: 'x.csv' }] };
      c.sb.importWizardProceedToPreview(); c.sb.importWizardConfirm(); await sync(c); };
    await run(['tanggal', 'nominal', 'penerima', 'unit'], [['2026-09-02', '6100', 'Toko L1', 'MI']]);
    await run(['tanggal', 'nominal', 'penerima', 'unit', 'akun', 'kategori'], [['2026-09-02', '6200', 'Toko L2', 'MI', 'Kasir', 'Kategori Fiktif']]);
    await run(['tanggal', 'nominal', 'penerima', 'unit', 'akun', 'kategori'], [['2026-09-02', '6300', 'Toko L3', 'MI', 'BNI', 'ATK']]);
    const T = rows(srv, '05_TRANSAKSI').slice(n0), q = c.a.Store.loadImportQueue().filter(x => /wajib disebut eksplisit/.test(x.reason || ''));
    rec('AK-08', 'wizard impor lama (fungsi global, masih dapat dipanggil): tanpa akun / kategori tak dikenal -> tidak tersimpan (HOLD beralasan); akun & kategori eksplisit -> tersimpan', T.length === 1 && T[0][col(srv, '05_TRANSAKSI', 'nominal')] === 6300 && T[0][col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1' && q.length === 2,
      'tersimpan ' + J(T.map(t => [t[col(srv, '05_TRANSAKSI', 'nominal')], t[col(srv, '05_TRANSAKSI', 'akunId')]])) + ', HOLD ' + q.length); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length; c.sb.openPengeluaranForm(); const h = html(c);
    Object.assign(c.fields, { gf_nominal: '4200', gf_penerima: 'Toko K', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: '', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: '' });
    c.sb.submitPengeluaran(); const t1 = c.toast(); await sync(c);
    rec('AK-09', 'form Pengeluaran: kategori tidak terpilih otomatis; tanpa kategori ditolak', /- Pilih Kategori \(wajib\) -/.test(h) && /Kategori pengeluaran wajib dipilih/.test(t1) && rows(srv, '05_TRANSAKSI').length === n0, t1.slice(0, 60)); }
  { const srv = makeServer(); const u1 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', akunId: '' }), u2 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', akunId: 'akun_tidak_ada' }), u3 = srv.sb.opUpdateTransaction({ id: 'imp_trx_2', akunId: 'akun_bank1' });
    rec('AK-10', 'server: koreksi tidak dapat mengosongkan akun / memakai akun tidak dikenal; ganti ke akun valid boleh', !u1.ok && u2.code === 'INVALID_ACCOUNT' && u3.ok, [u1.code, u2.code, u3.code].join(',')); }
  { // audit migrasi V1->V2 (TIDAK mengubah kode migrasi; hanya mengamati di sandbox lokal tanpa server)
    const srv = makeServer(); const c = makeClient(srv, { noBridge: true }); c.sb.initializeSeedData();
    const ls = c.sb.localStorage; Object.defineProperty(ls, 'length', { get: () => Object.keys(c.store).length }); ls.key = i => Object.keys(c.store)[i];
    ls.setItem('draKinerja_bendaharaSekolah_pembayaran', J([{ id: 'v1p1', tanggal: '2026-08-01', nominal: 150000, metode: 'Tunai' }]));
    const r1 = c.sb.migrateV1ToV2(); const t1 = c.a.Store.loadTransaksi().filter(t => t._migratedFromV1); const r2 = c.sb.migrateV1ToV2();
    c.sb.runMigrationNow(); const t2 = c.a.Store.loadTransaksi().filter(t => t._migratedFromV1);
    const akun0 = c.a.Store.loadSettings().akunKasBankList[0].id;
    rec('AK-11', 'AUDIT migrasi V1->V2 (tidak diubah): akun = akun pertama; boot ulang idempoten (penanda); "Jalankan Migrasi Sekarang" mengulang dengan id baru', null,
      J({ jalan1: !!r1, akunTransaksiV1: t1.map(t => t.akunId), akunPertama: akun0, bootUlang: r2 === null ? 'dilewati (penanda migratedFromV1)' : 'jalan lagi', idSebelum: t1.map(t => t.id), idSesudahUlang: t2.map(t => t.id), jumlahSesudahUlang: t2.length, pendingSync: t2.some(t => t._pendingSync) })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
