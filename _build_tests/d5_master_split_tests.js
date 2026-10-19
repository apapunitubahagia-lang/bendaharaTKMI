/* Suite D-5 PEMISAHAN MIGRASI TRANSAKSI / SINKRON MASTER / SEED (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * centralLegacyMigrate hanya untuk transaksi & koleksi operasional lama: tidak mengantrekan master maupun seed.
 * Sinkronisasi master: pratinjau baca-saja + eksekusi BENDAHARA (koleksi eksplisit, konfirmasi, alasan, hasil per baris, audit).
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const MASTER_KEYS = ['siswa', 'komponen', 'tarif', 'akun', 'kategoriPenerimaan', 'kategoriPengeluaran', 'subkategori', 'tahunAjaran'];
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const pendMaster = c => MASTER_KEYS.reduce((n, k) => n + Object.keys(c.sb.ccMasterPend_(k)).length, 0);
const masterCalls = c => c.calls.filter(n => /^opMaster(Batch|Upsert)/.test(n)).length;
function addLocal(c) {
  const kp = c.a.Store.loadKategoriPengeluaranMaster(); kp.push({ id: 'KAT_LOKAL_BARU', kode: '99', kategori: 'Lokal Baru', status: 'Aktif' }); c.a.Store.saveKategoriPengeluaranMaster(kp);
  const s = c.a.Store.loadSiswa(); s.push({ id: 's_lokal_1', nama: 'LOKAL', unit: 'MI', kelas: '1-A', status: 'Aktif' }); c.a.Store.saveSiswa(s);
  const t = c.a.Store.loadTransaksi(); t.push({ id: 'trx_lama_d5', jenis: 'PENGELUARAN', tanggal: '2026-09-03', unit: 'MI', nominal: 7000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'D5', createdAt: '2026-09-03T01:00:00.000Z', buktiId: [] }); c.a.Store.saveTransaksi(t);
}

(async () => {
  { // D5-01: migrasi transaksi tidak mengirim master / seed
    const srv = makeServer(); const c = await boot(srv); addLocal(c);
    const m0 = { kat: rows(srv, '21_KATEGORI_PENGELUARAN').length, sis: rows(srv, '01_SISWA').length, akun: rows(srv, '07_AKUN').length, tarif: rows(srv, '03_TARIF').length };
    const k0 = masterCalls(c), n0 = rows(srv, '05_TRANSAKSI').length;
    const r = c.sb.centralLegacyMigrate(); await sync(c);
    const m1 = { kat: rows(srv, '21_KATEGORI_PENGELUARAN').length, sis: rows(srv, '01_SISWA').length, akun: rows(srv, '07_AKUN').length, tarif: rows(srv, '03_TARIF').length };
    rec('D5-01', 'centralLegacyMigrate: transaksi lama terkirim; 0 master diantrekan, 0 panggilan opMaster*, sheet master server tidak bertambah (termasuk seed lokal)',
      r.done.transaksi === 1 && r.done.masters === 0 && r.done.masterTidakDikirim === true && pendMaster(c) === 0 && masterCalls(c) === k0 && J(m0) === J(m1) && rows(srv, '05_TRANSAKSI').length === n0 + 1,
      J({ done: r.done, pendMaster: pendMaster(c), panggilanMaster: masterCalls(c) - k0, m0, m1 })); }
  { // D5-02: pratinjau baca-saja, seed ditandai
    const srv = makeServer(); const c = await boot(srv); addLocal(c);
    const w0 = c.writes.length; const pr = c.sb.centralMasterSyncPratinjau();
    const seedKat = pr.baris.filter(b => b.koleksi === 'kategoriPengeluaran' && b.status === 'SEED_TIDAK_DIKIRIM'), kand = pr.baris.filter(b => b.status === 'KANDIDAT');
    rec('D5-02', 'pratinjau master: seed bawaan (MASTER_*_SEED, *_LEGACY_) = SEED_TIDAK_DIKIRIM; hanya baris lokal non-seed = KANDIDAT; tidak menulis localStorage, tidak mengantrekan',
      pr.ok && seedKat.length > 0 && seedKat.some(b => b.id === 'KAT_LAINNYA') && J(kand.map(b => b.id).sort()) === J(['KAT_LOKAL_BARU', 's_lokal_1']) && c.writes.length === w0 && pendMaster(c) === 0,
      J({ koleksi: pr.koleksi, kandidat: kand.map(b => b.koleksi + ':' + b.id), seedKat: seedKat.length })); }
  { // D5-03: eksekusi ditolak tanpa syarat
    const srv = makeServer(); const c = await boot(srv); addLocal(c);
    const base = { koleksi: ['kategoriPengeluaran'], alasan: 'Kategori lokal disetujui rapat 01-10', konfirmasi: 'SINKRON_MASTER' };
    const a = c.sb.centralMasterSyncJalankan(Object.assign({}, base, { konfirmasi: '' })), b = c.sb.centralMasterSyncJalankan(Object.assign({}, base, { alasan: 'ok' })),
      d = c.sb.centralMasterSyncJalankan(Object.assign({}, base, { koleksi: [] })), e = c.sb.centralMasterSyncJalankan(Object.assign({}, base, { koleksi: ['transaksi'] }));
    rec('D5-03', 'sinkron master tanpa konfirmasi / alasan < 10 / koleksi kosong / koleksi bukan master -> ditolak, tidak ada antrean',
      a.code === 'KONFIRMASI_WAJIB' && b.code === 'ALASAN_WAJIB' && d.code === 'KOLEKSI_WAJIB' && e.code === 'KOLEKSI_WAJIB' && pendMaster(c) === 0, [a.code, b.code, d.code, e.code].join(' ')); }
  { // D5-04: eksekusi valid: hanya koleksi terpilih, seed dilewati, audit, ulang tidak ganda
    const srv = makeServer(); const c = await boot(srv); addLocal(c);
    const n0 = rows(srv, '21_KATEGORI_PENGELUARAN').length;
    const r = c.sb.centralMasterSyncJalankan({ koleksi: ['kategoriPengeluaran'], alasan: 'Kategori lokal disetujui rapat 01-10', konfirmasi: 'SINKRON_MASTER' }); await sync(c);
    const ids = rows(srv, '21_KATEGORI_PENGELUARAN').map(x => x[0]); const au = c.a.Store.loadAuditTrail().filter(x => x.aksi === 'SINKRON_MASTER_LOKAL');
    const r2 = c.sb.centralMasterSyncJalankan({ koleksi: ['kategoriPengeluaran'], alasan: 'Kategori lokal disetujui rapat 01-10', konfirmasi: 'SINKRON_MASTER' }); await sync(c);
    rec('D5-04', 'sinkron master kategoriPengeluaran: tepat 1 baris non-seed terkirim (id sama); seed DILEWATI per baris; siswa lokal tidak ikut; audit SINKRON_MASTER_LOKAL; ulang -> 0 antre, tidak ganda',
      r.ok && r.antre === 1 && r.hasil.some(h => h.id === 'KAT_LAINNYA' && h.hasil === 'DILEWATI' && h.alasan === 'SEED_TIDAK_DIKIRIM') && !r.hasil.some(h => h.koleksi === 'siswa') &&
      ids.length === n0 + 1 && ids.includes('KAT_LOKAL_BARU') && !ids.includes('KAT_LAINNYA') && !rows(srv, '01_SISWA').some(x => x[0] === 's_lokal_1') && au.length === 1 && r2.ok && r2.antre === 0 && rows(srv, '21_KATEGORI_PENGELUARAN').length === n0 + 1,
      J({ antre: r.antre, antre2: r2.antre, server: ids, audit: au.length })); }
  { // D5-05: peran tidak berwenang
    const srv = makeServer(); srv.state.email = 'auditor@x.id'; const c = await boot(srv); addLocal(c);
    const k0 = c.calls.length; const m = c.sb.centralLegacyMigrate(); const s = c.sb.centralMasterSyncJalankan({ koleksi: ['kategoriPengeluaran'], alasan: 'Kategori lokal disetujui rapat 01-10', konfirmasi: 'SINKRON_MASTER' });
    const t = c.a.Store.loadTransaksi().find(x => x.id === 'trx_lama_d5');
    rec('D5-05', 'AUDITOR: centralLegacyMigrate & sinkron master -> FORBIDDEN; tidak ada penandaan antre / antrean master',
      c.a.CentralAuth.role === 'AUDITOR' && m.code === 'FORBIDDEN' && s.code === 'FORBIDDEN' && !t._pendingSync && pendMaster(c) === 0,
      J({ role: c.a.CentralAuth.role, m: m.code, s: s.code, panggilan: c.calls.slice(k0) })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
