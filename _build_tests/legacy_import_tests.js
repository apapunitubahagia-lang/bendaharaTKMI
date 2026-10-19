/* Suite JALUR IMPOR LAMA (P1_20 F; sandbox Node, TIDAK menyentuh Google Sheets).
 * Lima modul Impor V2 (pemasukan, pengeluaran, rab, lpj, siswa): UI membuka Impor V2; resolver antrean lama ditolak;
 * fungsi lama yang masih global tidak dapat melewati validasi server. Tidak ada jalur yang dihapus/dinonaktifkan di P1_20.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const V2 = ['penerimaan', 'pengeluaran', 'rab', 'lpj', 'siswa'];

(async () => {
  { const srv = makeServer(); const c = await boot(srv); const out = {};
    V2.forEach(t => { c.a.State.importSession = null; c.a.State.impV2 = null; c.sb.openImportWizard(t); out[t] = { v2: c.a.State.impV2 && c.a.State.impV2.modul, lama: !!c.a.State.importSession }; });
    c.a.State.importSession = null; c.sb.openImportWizard('mutasibank'); const mb = !!c.a.State.importSession;
    rec('LI-01', 'tombol impor 5 modul membuka Impor V2 (tidak membuat sesi wizard lama); mutasi bank & RKAT tetap wizard lama', V2.every(t => out[t].v2 && !out[t].lama) && mb, J(out) + ' mutasibank lama=' + mb); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const q = V2.map((t, i) => ({ id: 'q' + i, type: 'HOLD', importType: t, akunId: null, row: { tanggal: '2026-09-02', nominal: '1000', penerima: 'X', nama: 'Y', kelas: '1' }, headerMap: { tanggal: 'tanggal', nominal: 'nominal', penerima: 'penerima', nama: 'nama', kelas: 'kelas' }, reason: 'uji', candidates: [{ id: 's1', nama: 'HANA' }], createdAt: '', resolved: false }));
    c.a.Store.saveImportQueue(q); const ts = [];
    q.forEach(x => { c.sb.resolveImportQueueAsNew(x.id); ts.push(c.toast().slice(0, 120)); c.fields.impq_siswa = 's1'; c.sb.resolveImportQueueAmbiguous(x.id); });
    await sync(c);
    rec('LI-02', 'resolver antrean lama (Import Apa Adanya / pilih siswa) untuk 5 modul V2 ditolak; tidak ada data tersimpan; item tetap belum selesai', rows(srv, '05_TRANSAKSI').length === n0 && c.a.Store.loadImportQueue().every(x => !x.resolved) && ts.every(t => /tidak dapat diimpor dari sini/.test(t)), J(ts)); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const t = c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-14', unit: 'MI', nominal: 4400, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'Kategori Lama V1', penerima: 'X' });
    await sync(c); const L = c.a.Store.loadTransaksi().find(x => x.id === t.id);
    rec('LI-03', 'tulisan lokal jalur lama/global dengan kategori di luar master -> server menolak (INVALID_CATEGORY), tidak tersimpan, ditandai gagal sinkron', rows(srv, '05_TRANSAKSI').length === n0 && L && L._syncBlocked && /INVALID_CATEGORY/.test(L._syncError || ''), L && L._syncError); }
  { const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8');
    const fns = ['importWizardConfirm', 'importWizardConfirmSiswa', 'commitPenerimaanRow', 'commitPengeluaranRow', 'commitSiswaRow', 'commitRabRow', 'commitLpjRow', 'commitMutasiBankRow', 'commitRkatRow', 'resolveImportQueueAsNew', 'resolveImportQueueAmbiguous'];
    const ref = {}; fns.forEach(f => { ref[f] = (html.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length - 1; });
    rec('LI-04', 'INVENTARIS: fungsi wizard lama masih global (tidak dihapus); jumlah rujukan di berkas (di luar definisi; termasuk committerMap & onclick); tulisan akhirnya lewat opCreateTxBatch / opMasterBatch / opRecordBatch (validasi server + opGate_)', null, J(ref)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
