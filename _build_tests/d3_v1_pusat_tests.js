/* Suite D-3 MIGRASI V1 MODE PUSAT (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * Tidak ada migrasi V1 otomatis saat aplikasi dibuka pada mode pusat. Migrasi eksplisit: pratinjau -> BENDAHARA + konfirmasi ->
 * ditahap lokal tanpa akun/kategori fallback -> pemetaan eksplisit akun+unit+kategori -> kirim. Data V1 tidak diubah.
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
  pembayaran: [{ id: 'v1p1', tanggal: '2026-08-01', nominal: 150000, metode: 'Tunai', alokasi: [{ siswaId: 's1', nominal: 150000 }] }, { id: 'v1p2', tanggal: '2026-08-06', nominal: 90000, metode: 'Tunai' }],
  pemasukan: [{ tanggal: '2026-08-02', nominal: 70000, kategori: 'Donasi', uraian: 'Donasi V1' }, { nominal: 5000, uraian: 'tanpa tanggal' }],
  pengeluaran: [{ tanggal: '2026-08-03', nominal: 30000, kategori: 'ATK', penerima: 'Toko V1' }, { tanggal: '2026-08-04', nominal: 31000, penerima: 'tanpa kategori' },
    { tanggal: '2026-08-05', nominal: 32000, kategori: 'Lainnya', penerima: 'kategori Lainnya asli V1' }, { tanggal: '2026-08-07', nominal: 0, kategori: 'ATK', penerima: 'nol' }]
};
function lsEnum(c) { const ls = c.sb.localStorage; Object.defineProperty(ls, 'length', { configurable: true, get: () => Object.keys(c.store).length }); ls.key = i => Object.keys(c.store)[i]; }
function v1Store() { const s = {}; Object.keys(V1).forEach(k => { s[P + k] = J(V1[k]); }); return s; }
const v1Snap = c => J(Object.keys(c.store).filter(k => k.indexOf(P) === 0).sort().map(k => [k, c.store[k]]));
async function boot(srv, store) { const c = makeClient(srv, { store: store || v1Store() }); lsEnum(c); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const v1Trx = c => c.a.Store.loadTransaksi().filter(t => t._migratedFromV1);
const writeCalls = c => c.calls.filter(n => /^op(Create|Update|Record|Master|Archive)/.test(n)).length;
const OK = { konfirmasi: 'MIGRASI_V1_PUSAT' };
const idOf = (c, sumber, urutan) => c.sb.v1MigrasiPusatPratinjau().baris.find(b => b.sumber === 'V1:' + sumber && b.urutan === urutan).id;

(async () => {
  { // D3-01: dibuka dengan data V1 -> tidak ada migrasi otomatis (mode pusat); mode lokal tetap seperti dulu
    const srv = makeServer(); const store = v1Store(); const c = makeClient(srv, { store }); lsEnum(c); const snap = v1Snap(c);
    let err = ''; try { c.sb.init(); } catch (e) { err = e.message; }
    await until(() => c.a.CentralMasterData.ready, 400); await tick(5);
    const tr = c.a.Store.loadTransaksi();
    const cl = makeClient(makeServer(), { store: v1Store(), noBridge: true }); lsEnum(cl); let errL = ''; try { cl.sb.init(); } catch (e) { errL = e.message; }
    rec('D3-01', 'mode pusat: init() dengan data V1 -> 0 transaksi V1 lokal, penanda migratedFromV1 tidak di-set, data V1 utuh, 0 panggilan tulis server, State.v1Tertunda; mode lokal (tanpa server) tetap memigrasi seperti sebelumnya',
      !err && tr.filter(t => t._migratedFromV1).length === 0 && c.store[c.sb.lsKey('migratedFromV1')] === undefined && v1Snap(c) === snap && writeCalls(c) === 0 && c.a.State.v1Tertunda === true && !errL && cl.a.Store.loadTransaksi().filter(t => t._migratedFromV1).length === 8,
      J({ err, errL, v1Lokal: tr.filter(t => t._migratedFromV1).length, tertunda: c.a.State.v1Tertunda, tulis: writeCalls(c), lokalMode: cl.a.Store.loadTransaksi().length })); }
  { // D3-02: pratinjau baca-saja dengan pengecualian
    const srv = makeServer(); const c = await boot(srv); const w0 = c.writes.length; const pr = c.sb.v1MigrasiPusatPratinjau();
    const st = pr.baris.map(b => b.sumber + '#' + b.urutan + ':' + b.status + (b.pengecualian.length ? '(' + b.pengecualian.join('+') + ')' : '')).join(' ');
    rec('D3-02', 'pratinjau V1: baca-saja; pembayaran beralokasi tanpa komponen/periode, tanggal kosong, nominal 0 -> PENGECUALIAN beralasan; sisanya SIAP_DITAHAP dengan perlu pemetaan AKUN/UNIT (+KATEGORI bila kosong)',
      c.writes.length === w0 && pr.ringkasan.SIAP_DITAHAP === 5 && pr.ringkasan.PENGECUALIAN === 3 &&
      /pembayaran#0:PENGECUALIAN\(ALOKASI_V1_TIDAK_LENGKAP\)/.test(st) && /pemasukan#1:PENGECUALIAN\(TANGGAL_V1_TIDAK_VALID\)/.test(st) && /pengeluaran#3:PENGECUALIAN\(NOMINAL_V1_TIDAK_VALID\)/.test(st) &&
      J(pr.baris.find(b => b.sumber === 'V1:pengeluaran' && b.urutan === 1).perluPemetaan) === J(['AKUN', 'UNIT', 'KATEGORI']), st); }
  { // D3-03: pengguna tidak berwenang
    const srv = makeServer(); srv.state.email = 'auditor@x.id'; const c = await boot(srv); const n0 = c.a.Store.loadTransaksi().length;
    const r = c.sb.v1MigrasiPusatJalankan(OK); const a = c.sb.v1PetakanAkun(['x'], 'akun_bank1', 'alasan cukup panjang', 'MI'); const k = c.sb.v1PetakanKategori(['x'], 'ATK', 'alasan cukup panjang');
    rec('D3-03', 'AUDITOR: jalankan migrasi V1 / pemetaan akun / pemetaan kategori -> FORBIDDEN; tidak ada perubahan lokal, 0 panggilan tulis',
      c.a.CentralAuth.role === 'AUDITOR' && r.code === 'FORBIDDEN' && a.code === 'FORBIDDEN' && k.code === 'FORBIDDEN' && c.a.Store.loadTransaksi().length === n0 && writeCalls(c) === 0, [r.code, a.code, k.code].join(' ')); }
  { // D3-04..08: alur lengkap
    const srv = makeServer(); const c = await boot(srv); const snap = v1Snap(c), n0 = rows(srv, '05_TRANSAKSI').length;
    const r0 = c.sb.v1MigrasiPusatJalankan({ konfirmasi: 'ya' });
    const r1 = c.sb.v1MigrasiPusatJalankan(OK); const t = v1Trx(c); const au = c.a.Store.loadAuditTrail().filter(a => a.aksi === 'MIGRASI_V1_PUSAT');
    rec('D3-04', 'jalankan tanpa konfirmasi -> KONFIRMASI_WAJIB; dengan konfirmasi: 5 ditahap, akunId kosong (tanpa akun pertama), kategori V1 kosong tetap kosong (tanpa "Lainnya"), tidak antre, pengecualian tidak ditahap, hasil per baris + audit, data V1 utuh, 0 tulis server',
      r0.code === 'KONFIRMASI_WAJIB' && r1.ok && r1.ditahap === 5 && t.length === 5 && t.every(x => x.akunId === '' && !x._pendingSync && x._akunSumber === 'BELUM_DIPETAKAN') &&
      t.find(x => x.penerima === 'tanpa kategori').kategori === '' && r1.hasil.length === 8 && r1.hasil.filter(h => h.hasil === 'PENGECUALIAN').length === 3 && au.length === 1 && v1Snap(c) === snap && rows(srv, '05_TRANSAKSI').length === n0,
      J({ r0: r0.code, ditahap: r1.ditahap, akun: t.map(x => x.akunId), kategori: t.filter(x => x.jenis === 'PENGELUARAN').map(x => x.kategori) }));
    // pemetaan belum lengkap
    const m0 = c.sb.centralLegacyMigrate(); await sync(c);
    const siap = t.map(x => x.id); const pa = c.sb.v1PetakanAkun(siap, 'akun_bank1', 'Sesuai rekening koran BNI Agustus 2026', 'MI');
    const ex1 = c.sb.centralLegacyScan().transaksi.pengecualian; const m1 = c.sb.centralLegacyMigrate(); await sync(c);
    const S1 = rows(srv, '05_TRANSAKSI').slice(n0);
    const kBad = c.sb.v1PetakanKategori([idOf(c, 'pengeluaran', 1)], 'Lainnya', 'tidak ada di master server'), kNo = c.sb.v1PetakanKategori([idOf(c, 'pengeluaran', 1)], 'ATK', '');
    rec('D3-05', 'pemetaan belum lengkap: sebelum pemetaan akun 0 terkirim; sesudah akun+unit, pengeluaran tanpa kategori -> PEMETAAN_KATEGORI_V1_DIPERLUKAN, "Lainnya" (tak ada di master server) -> KATEGORI_TIDAK_ADA_DI_SERVER, tidak dikirim; kategori tidak valid / tanpa alasan ditolak',
      m0.done.transaksi === 0 && pa.ok && pa.dipetakan === 5 && J(ex1.map(x => x.alasan).sort()) === J(['KATEGORI_TIDAK_ADA_DI_SERVER', 'PEMETAAN_KATEGORI_V1_DIPERLUKAN']) && m1.done.transaksi === 3 && S1.length === 3 && kBad.code === 'KATEGORI_TIDAK_VALID' && kNo.code === 'ALASAN_WAJIB',
      J({ m0: m0.done.transaksi, ex1: ex1.map(x => x.alasan), m1: m1.done, server: S1.length, kBad: kBad.code, kNo: kNo.code }));
    // pemetaan lengkap
    const pk = c.sb.v1PetakanKategori([idOf(c, 'pengeluaran', 1), idOf(c, 'pengeluaran', 2)], 'ATK', 'Nota toko alat tulis, diperiksa 10-10');
    const m2 = c.sb.centralLegacyMigrate(); await sync(c); const S2 = rows(srv, '05_TRANSAKSI').slice(n0);
    const auK = c.a.Store.loadAuditTrail().filter(a => a.aksi === 'PEMETAAN_KATEGORI_V1');
    rec('D3-06', 'pemetaan lengkap: 5 transaksi V1 di server, akun = hasil pemetaan, unit MI, kategori pengeluaran = master server; audit pemetaan kategori; 0 pengecualian tersisa selain yang tidak ditahap',
      pk.ok && pk.dipetakan === 2 && m2.done.transaksi === 2 && S2.length === 5 && S2.every(r => r[col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1' && r[col(srv, '05_TRANSAKSI', 'unit')] === 'MI') &&
      S2.filter(r => r[col(srv, '05_TRANSAKSI', 'jenis')] === 'PENGELUARAN').every(r => r[col(srv, '05_TRANSAKSI', 'kategori')] === 'ATK') && auK.length === 2 && c.sb.centralLegacyScan().transaksi.pengecualian.length === 0,
      J({ server: S2.map(r => [r[col(srv, '05_TRANSAKSI', 'jenis')], r[col(srv, '05_TRANSAKSI', 'nominal')], r[col(srv, '05_TRANSAKSI', 'kategori')]]) }));
    // proses diulang
    const r2 = c.sb.v1MigrasiPusatJalankan(OK); const m3 = c.sb.centralLegacyMigrate(); await sync(c);
    rec('D3-07', 'proses diulang: 0 ditahap (SUDAH_DI_SERVER/SUDAH_ADA_LOKAL), 0 transaksi lokal baru, 0 baris server baru',
      r2.ok && r2.ditahap === 0 && r2.hasil.every(h => /SUDAH_DI_SERVER|SUDAH_ADA_LOKAL|PENGECUALIAN/.test(h.hasil)) && v1Trx(c).length === 5 && m3.done.transaksi === 0 && rows(srv, '05_TRANSAKSI').length === n0 + 5,
      J({ ditahap: r2.ditahap, hasil: r2.hasil.map(h => h.hasil), server: rows(srv, '05_TRANSAKSI').length - n0 })); }
  { // D3-08: kegagalan parsial
    const srv = makeServer(); const c = await boot(srv);
    // (a) penyimpanan transaksi lokal gagal di tengah -> alokasi/transaksi tidak ganda saat diulang
    const set0 = c.sb.localStorage.setItem; let gagal = true; const kT = c.sb.lsKey('transaksi');
    c.sb.localStorage.setItem = (k, v) => { if (gagal && k === kT) { gagal = false; throw new Error('simulasi kuota penuh'); } return set0(k, v); };
    let e1 = ''; try { c.sb.v1MigrasiPusatJalankan(OK); } catch (e) { e1 = e.message; }
    const t1 = v1Trx(c).length; const r = c.sb.v1MigrasiPusatJalankan(OK); c.sb.localStorage.setItem = set0;
    const ids = v1Trx(c).map(x => x.id); const dupIds = ids.length !== new Set(ids).size;
    // (b) server gagal untuk sebagian kiriman -> retry tanpa ganda
    c.sb.v1PetakanAkun(ids, 'akun_kas1', 'Buku kas tunai V1 Agustus', 'TK'); c.sb.v1PetakanKategori(v1Trx(c).filter(x => x.jenis === 'PENGELUARAN' && x.kategori !== 'ATK').map(x => x.id), 'ATK', 'Nota toko alat tulis');
    const n0 = rows(srv, '05_TRANSAKSI').length; c.sb.centralLegacyMigrate();
    c.fault.mode = 'down'; c.fault.only = /^op(CreateExpense|CreateTxBatch)/; await sync(c); const nMid = rows(srv, '05_TRANSAKSI').length - n0;
    c.fault.mode = null; c.sb.centralUnblockExtra_ && c.sb.centralUnblockExtra_(); const arr = c.a.Store.loadTransaksi(); arr.forEach(x => { if (x._migratedFromV1) { delete x._syncBlocked; x._syncAttempts = 0; } }); c.a.Store.saveTransaksi(arr);
    await sync(c); await sync(c);
    const S = rows(srv, '05_TRANSAKSI').slice(n0);
    rec('D3-08', 'kegagalan parsial: (a) simpan transaksi lokal gagal -> 0 transaksi V1, proses ulang menahap 5 tanpa id ganda; (b) server menolak sebagian kiriman -> setelah pulih tepat 5 baris server, tanpa ganda, semua tersinkron',
      /kuota/.test(e1) && t1 === 0 && r.ok && r.ditahap === 5 && !dupIds && nMid < 5 && S.length === 5 && new Set(S.map(x => x[col(srv, '05_TRANSAKSI', 'nominal')] + '|' + x[col(srv, '05_TRANSAKSI', 'tanggal')])).size === 5 && v1Trx(c).every(x => x._synced),
      J({ e1, t1, ditahap: r.ditahap, tengah: nMid, akhir: S.length, synced: v1Trx(c).map(x => !!x._synced) })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
