/* Suite MIGRASI V1 & PEMETAAN AKUN (P1_20 B; sandbox Node, TIDAK menyentuh Google Sheets).
 * Transaksi hasil migrasi V1 (akun = akun pertama, fallback historis) tidak dikirim ke server tanpa pemetaan eksplisit;
 * pengecualian beralasan; pemetaan beraudit; migrasi ulang deterministik (id sama -> clientRequestId sama -> tidak ganda).
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const P = 'draKinerja_bendaharaSekolah_';
const V1 = {
  pembayaran: [{ id: 'v1p1', tanggal: '2026-08-01', nominal: 150000, metode: 'Tunai', alokasi: [{ siswaId: 's1', nominal: 150000 }] }],
  pemasukan: [{ tanggal: '2026-08-02', nominal: 70000, kategori: 'Donasi', uraian: 'Donasi V1' }],
  pengeluaran: [{ tanggal: '2026-08-03', nominal: 30000, kategori: 'ATK', penerima: 'Toko V1' }, { tanggal: '2026-08-04', nominal: 31000, kategori: 'ATK', penerima: 'Toko V1b' }]
};
function lsEnum(c) { const ls = c.sb.localStorage; Object.defineProperty(ls, 'length', { configurable: true, get: () => Object.keys(c.store).length }); ls.key = i => Object.keys(c.store)[i]; }
function putV1(c) { Object.keys(V1).forEach(k => c.sb.localStorage.setItem(P + k, J(V1[k]))); }
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); lsEnum(c); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const v1Trx = c => c.a.Store.loadTransaksi().filter(t => t._migratedFromV1);
const trxCalls = c => c.calls.filter(n => /^op(Create|CreateTxBatch|CreateIncome|CreateExpense)/.test(n)).length;

(async () => {
  { // VM-01: id deterministik (lokal, tanpa server)
    const srv = makeServer(); const c = makeClient(srv, { noBridge: true }); c.sb.initializeSeedData(); lsEnum(c); putV1(c);
    c.sb.migrateV1ToV2(); const t1 = v1Trx(c), a1 = c.a.Store.loadAlokasi().filter(a => t1.some(t => t.id === a.transaksiId));
    c.sb.runMigrationNow(); const t2 = v1Trx(c), a2 = c.a.Store.loadAlokasi().filter(a => t2.some(t => t.id === a.transaksiId));
    rec('VM-01', 'migrasi V1 ulang (mode lokal) -> id transaksi & alokasi identik; penanda sumber akun FALLBACK_AKUN_PERTAMA_V1', t1.length === 4 && J(t1.map(t => t.id)) === J(t2.map(t => t.id)) && a1.length === 1 && J(a1.map(a => a.id)) === J(a2.map(a => a.id)) && t2.every(t => t._akunSumber === 'FALLBACK_AKUN_PERTAMA_V1'),
      J({ id1: t1.map(t => t.id), id2: t2.map(t => t.id), alk: [a1.map(a => a.id), a2.map(a => a.id)], akun: t2.map(t => t.akunId) })); }
  { // VM-02: pengecualian di pindai & migrasi ke pusat
    const srv = makeServer(); const c = await boot(srv); putV1(c); c.sb.migrateV1ToV2(); const n0 = rows(srv, '05_TRANSAKSI').length;
    const scan = c.sb.centralLegacyScan(); const m = c.sb.centralLegacyMigrate(); await sync(c);
    const ex = scan.transaksi.pengecualian;
    rec('VM-02', 'Pusat Data: transaksi V1 tanpa pemetaan -> daftar pengecualian beralasan; tidak ditandai antre; tidak ada baris server', ex.length === 4 && ex.every(x => x.alasan === 'PEMETAAN_AKUN_V1_DIPERLUKAN' && /^V1:/.test(x.sumber)) && m.done.pengecualian === 4 && m.done.transaksi === 0 && !v1Trx(c).some(t => t._pendingSync) && rows(srv, '05_TRANSAKSI').length === n0,
      J({ pengecualian: ex.map(x => [x.jenis, x.nominal, x.akunId, x.alasan]), done: m.done })); }
  { // VM-03: transaksi V1 sudah antre (versi lama) -> diblokir di klien tanpa panggilan server
    const srv = makeServer(); const c = await boot(srv); putV1(c); c.sb.migrateV1ToV2();
    const arr = c.a.Store.loadTransaksi(); arr.forEach(t => { if (t._migratedFromV1) t._pendingSync = true; }); c.a.Store.saveTransaksi(arr);
    const n0 = rows(srv, '05_TRANSAKSI').length, k0 = trxCalls(c); await sync(c);
    const t = v1Trx(c);
    rec('VM-03', 'transaksi V1 antre tanpa akun valid -> tidak dikirim (0 panggilan tulis), _syncBlocked, alasan PEMETAAN_AKUN_V1_DIPERLUKAN', rows(srv, '05_TRANSAKSI').length === n0 && trxCalls(c) === k0 && t.every(x => x._syncBlocked && /PEMETAAN_AKUN_V1_DIPERLUKAN|belum dipetakan/.test(x._syncError || '')),
      J({ panggilanTulis: trxCalls(c) - k0, err: t.map(x => x._syncError) })); }
  { // VM-04..06: pemetaan eksplisit, audit, kirim, ulang
    const srv = makeServer(); const c = await boot(srv); putV1(c); c.sb.migrateV1ToV2();
    const ids = v1Trx(c).filter(t => t._migratedFromV1 !== 'pembayaran').map(t => t.id);
    const r1 = c.sb.v1PetakanAkun(ids, 'akun_bank1', '', 'MI'), r2 = c.sb.v1PetakanAkun(ids, 'akun_fiktif', 'mutasi BNI', 'MI'), r0 = c.sb.v1PetakanAkun(ids, 'akun_bank1', 'mutasi BNI', ''), r3 = c.sb.v1PetakanAkun(ids, 'akun_bank1', 'Sesuai rekening koran BNI Agustus 2026', 'MI');
    const au = c.a.Store.loadAuditTrail().filter(a => a.aksi === 'PEMETAAN_AKUN_V1');
    const t = v1Trx(c).filter(x => ids.includes(x.id));
    rec('VM-04', 'pemetaan: tanpa alasan / akun bukan master / unit tidak dipilih (data V1 tanpa unit) -> ditolak; valid -> akun & unit eksplisit, _akunPemetaan (akun sebelumnya, alasan), jejak audit per transaksi', r1.code === 'ALASAN_WAJIB' && r2.code === 'AKUN_TIDAK_VALID' && r0.code === 'UNIT_WAJIB' && r3.ok && r3.dipetakan === 3 && au.length === 3 && t.every(x => x.akunId === 'akun_bank1' && x._akunSumber === 'PEMETAAN_EKSPLISIT' && x._akunPemetaan.akunSebelumnya === 'akun_kas1' && x.unit === 'MI' && x._akunPemetaan.unitSebelumnya === '' && /rekening koran/.test(x._akunPemetaan.alasan)),
      [r1.code, r2.code, r0.code, J(r3), 'audit ' + au.length].join(' '));
    const n0 = rows(srv, '05_TRANSAKSI').length; const m = c.sb.centralLegacyMigrate(); await sync(c);
    const S = rows(srv, '05_TRANSAKSI').slice(n0), sAkun = S.map(r => r[col(srv, '05_TRANSAKSI', 'akunId')]);
    const sisa = c.sb.centralLegacyScan().transaksi.pengecualian;
    rec('VM-05', 'sesudah pemetaan: hanya transaksi terpetakan yang dikirim (akun hasil pemetaan); pembayaran V1 tak terpetakan tetap pengecualian', m.done.transaksi === 3 && m.done.pengecualian === 1 && S.length === 3 && sAkun.every(a => a === 'akun_bank1') && sisa.length === 1 && sisa[0].sumber === 'V1:pembayaran',
      J({ done: m.done, server: S.map(r => [r[col(srv, '05_TRANSAKSI', 'nominal')], r[col(srv, '05_TRANSAKSI', 'akunId')]]), sisa: sisa.map(x => x.sumber) }));
    // migrasi ulang setara (id deterministik sama): penanda sinkron hilang, transaksi dikirim lagi -> idempoten di server
    const n1 = rows(srv, '05_TRANSAKSI').length; c.sb.localStorage.setItem(c.sb.lsKey('centralSyncMap'), '{}');
    const arr = c.a.Store.loadTransaksi(); arr.forEach(x => { if (ids.includes(x.id)) { delete x._synced; x._pendingSync = true; } }); c.a.Store.saveTransaksi(arr); await sync(c);
    const rm = c.sb.runMigrationNow(); const after = v1Trx(c);
    rec('VM-06', 'kirim ulang transaksi V1 dengan id deterministik sama (clientRequestId sama) -> tidak ada baris ganda; "Jalankan Migrasi Sekarang" ditolak pada mode pusat dan data lokal tidak ditimpa', rows(srv, '05_TRANSAKSI').length === n1 && rm === null && /dinonaktifkan pada mode pusat/.test(c.toast()) && after.filter(x => ids.includes(x.id)).every(x => x._akunPemetaan),
      'server ' + n1 + '->' + rows(srv, '05_TRANSAKSI').length + ', toast: ' + c.toast().slice(0, 50)); }
  { // VM-07: respons hilang saat kirim -> retry tidak menggandakan
    const srv = makeServer(); const c = await boot(srv); putV1(c); c.sb.migrateV1ToV2();
    const ids = v1Trx(c).filter(t => t._migratedFromV1 === 'pengeluaran').map(t => t.id); c.sb.v1PetakanAkun(ids, 'akun_kas1', 'Kas tunai sesuai buku kas V1', 'TK');
    const n0 = rows(srv, '05_TRANSAKSI').length; c.sb.centralLegacyMigrate(); c.fault.mode = 'lostOnce'; c.fault.only = /^op(Create|CreateTxBatch)/; await sync(c); await sync(c);
    const S = rows(srv, '05_TRANSAKSI').slice(n0);
    rec('VM-07', 'transaksi V1 terpetakan; respons pertama hilang -> retry memakai clientRequestId sama -> tepat 2 baris server, tersinkron', S.length === 2 && v1Trx(c).filter(t => ids.includes(t.id)).every(t => t._synced), 'baris ' + S.length + ' synced ' + J(v1Trx(c).filter(t => ids.includes(t.id)).map(t => !!t._synced))); }
  { // VM-08: transaksi lokal (bukan V1) dengan akun yang tidak ada di server
    const srv = makeServer(); const c = await boot(srv);
    const arr = c.a.Store.loadTransaksi(); arr.push({ id: 'trx_lokal_x', jenis: 'PENGELUARAN', tanggal: '2026-08-05', nominal: 12000, akunId: 'akun_lama_hilang', kategori: 'ATK', penerima: 'X', metode: 'Tunai' }, { id: 'trx_lokal_y', jenis: 'PENERIMAAN', tanggal: '2026-08-05', nominal: 13000, akunId: '', metode: 'Tunai' }); c.a.Store.saveTransaksi(arr);
    const ex = c.sb.centralLegacyScan().transaksi.pengecualian; const n0 = rows(srv, '05_TRANSAKSI').length; c.sb.centralLegacyMigrate(); await sync(c);
    rec('VM-08', 'transaksi lokal lama: akun tidak ada di master server / kosong -> pengecualian AKUN_TIDAK_ADA_DI_SERVER / AKUN_KOSONG, tidak dikirim', J(ex.map(x => x.alasan).sort()) === J(['AKUN_KOSONG', 'AKUN_TIDAK_ADA_DI_SERVER']) && rows(srv, '05_TRANSAKSI').length === n0, J(ex.map(x => [x.id, x.alasan]))); }
  { // VM-09 (INFO): migrasi boot pada mode pusat menulis koleksi lokal; tidak dijalankan otomatis oleh uji ini selain panggilan eksplisit
    const srv = makeServer(); const c = await boot(srv); putV1(c); const before = c.a.Store.loadTransaksi().length; const r = c.sb.migrateV1ToV2();
    rec('VM-09', 'AUDIT: init() memanggil migrateV1ToV2() saat boot bila data V1 ada & penanda belum di-set (perilaku lama, tidak diubah); hasilnya kini hanya lokal + pengecualian, tidak terkirim tanpa pemetaan', null,
      J({ laporan: r && { penerimaan: r.penerimaan, pengeluaran: r.pengeluaran }, transaksiLokalSebelum: before, sesudah: c.a.Store.loadTransaksi().length, menimpaKoleksiLokal: true })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
