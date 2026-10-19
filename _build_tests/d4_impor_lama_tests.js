/* Suite D-4 PENONAKTIFAN WIZARD IMPOR LAMA (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * Uji negatif: jalur lama penerimaan/pengeluaran/RAB/LPJ tidak dapat menulis data (klien menolak pada fungsi; server menolak
 * baris RAB/LPJ baru bertanda impor lewat opRecordBatch publik). Jalur yang dipertahankan tetap berfungsi.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
const writeCalls = c => c.calls.filter(n => /^op(Create|Update|Record|Master|Archive)/.test(n)).length;
function session(c, type, headers, data) {
  c.a.State.importSession = { type, step: 'map', headers, rows: data.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))), headerMap: Object.fromEntries(headers.map(h => [h, h])), results: null, batchId: 'b_' + type, rawFiles: [{ name: type + '.csv' }] };
  c.sb.importWizardProceedToPreview(); return c.a.State.importSession.results;
}
const FILES = {
  penerimaan: [['tanggal', 'nominal', 'uraian', 'unit', 'akun'], [['2026-09-03', '120000', 'Donasi', 'MI', 'Kasir']]],
  pengeluaran: [['tanggal', 'nominal', 'uraian', 'unit', 'akun', 'kategori'], [['2026-09-02', '75000', 'Spidol', 'MI', 'Kasir', 'ATK']]],
  rab: [['uraian', 'nominal', 'unit', 'kategori', 'tahunAjaran'], [['Kertas', '1000', 'MI', 'ATK', 'September 2026']]],
  lpj: [['tanggal', 'uraian', 'nominal'], [['2026-09-05', 'Nota', '1000']]]
};

(async () => {
  { const srv = makeServer(); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const c = await boot(srv);
    const n0 = { t: rows(srv, '05_TRANSAKSI').length, a: rows(srv, '08_ANGGARAN').length, l: rows(srv, '19_LPJ').length }, loc0 = { t: c.a.Store.loadTransaksi().length, a: c.a.Store.loadAnggaran().length, l: c.a.Store.loadLpj().length };
    const k0 = writeCalls(c), out = {};
    for (const t of Object.keys(FILES)) { const pv = session(c, t, FILES[t][0], FILES[t][1]); const r = c.sb.importWizardConfirm(); out[t] = { pratinjauValid: pv.valid.length, kode: r && r.code }; }
    await sync(c);
    const n1 = { t: rows(srv, '05_TRANSAKSI').length, a: rows(srv, '08_ANGGARAN').length, l: rows(srv, '19_LPJ').length }, loc1 = { t: c.a.Store.loadTransaksi().length, a: c.a.Store.loadAnggaran().length, l: c.a.Store.loadLpj().length };
    rec('D4-01', 'importWizardConfirm untuk penerimaan / pengeluaran / RAB / LPJ -> JALUR_IMPOR_LAMA_DINONAKTIFKAN; 0 baris lokal, 0 antrean impor, 0 panggilan tulis server, sheet server tidak berubah',
      Object.values(out).every(x => x.kode === 'JALUR_IMPOR_LAMA_DINONAKTIFKAN' && x.pratinjauValid === 1) && J(n0) === J(n1) && J(loc0) === J(loc1) && c.a.Store.loadImportQueue().filter(q => FILES[q.importType]).length === 0 && writeCalls(c) === k0,
      J({ out, n0, n1, tulis: writeCalls(c) - k0 })); }
  { const srv = makeServer(); const c = await boot(srv); const err = {};
    const get = () => ''; ['commitPenerimaanRow', 'commitPengeluaranRow', 'commitRabRow', 'commitLpjRow'].forEach(f => { try { c.sb[f](get, {}, { tanggal: '2026-09-01', nominal: 1, uraian: 'x', item: 'x', periode: 'September 2026', unit: 'MI' }, {}, {}); err[f] = 'TIDAK DITOLAK'; } catch (e) { err[f] = /JALUR_IMPOR_LAMA_DINONAKTIFKAN/.test(e.message) ? 'DITOLAK' : e.message; } });
    rec('D4-02', 'pemanggilan langsung commit*Row lama (konsol) -> error JALUR_IMPOR_LAMA_DINONAKTIFKAN sebelum menulis apa pun', Object.values(err).every(v => v === 'DITOLAK') && c.a.Store.loadTransaksi().length === 0, J(err)); }
  { const srv = makeServer(); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    const b = (key, id, row) => { const r = srv.sb.opRecordBatch(key, [{ op: 'upsert', id, row }]); return r.ok ? r.data.results[0].code : r.code; };
    const base = { periode: 'September 2026', program: 'P', kategori: 'ATK', unit: 'MI', nominal: 1000 };
    const r1 = b('anggaran', 'rab_lama1', Object.assign({ importBatchId: 'b_lama', sourceFile: 'x.csv' }, base)), r2 = b('anggaran', 'rab_lama2', Object.assign({ source: 'RAB_IMPORT' }, base)),
      r3 = b('lpj', 'lpj_lama1', { tanggal: '2026-09-05', item: 'Nota', nominal: 1000, status: 'REALIZATION', importBatchId: 'b_lama' }),
      r4 = b('anggaran', 'rab_manual', Object.assign({ source: 'MANUAL' }, base)), r5 = b('lpj', 'lpj_manual', { tanggal: '2026-09-05', item: 'Nota', nominal: 1000, status: 'REALIZATION' });
    // baris yang SUDAH ada (mis. hasil Impor V2) tetap dapat diubah
    srv.sheets['08_ANGGARAN'].push(srv.sheets['08_ANGGARAN'][0].map(h => h === 'id' ? 'rab_v2' : h === 'periode' ? 'September 2026' : h === 'kategori' ? 'ATK' : h === 'unit' ? 'MI' : h === 'nominal' ? 500 : h === 'importBatchId' ? 'imp_v2_1' : h === 'source' ? 'RAB_IMPORT' : ''));
    const r6 = b('anggaran', 'rab_v2', { nominal: 600 });
    rec('D4-03', 'server: opRecordBatch publik menolak baris BARU RAB/LPJ bertanda impor lama (importBatchId / source RAB_IMPORT) -> JALUR_IMPOR_LAMA_DINONAKTIFKAN; baris manual tetap dibuat; baris impor yang sudah ada tetap dapat diubah',
      r1 === 'JALUR_IMPOR_LAMA_DINONAKTIFKAN' && r2 === 'JALUR_IMPOR_LAMA_DINONAKTIFKAN' && r3 === 'JALUR_IMPOR_LAMA_DINONAKTIFKAN' && r4 === 'CREATED' && r5 === 'CREATED' && r6 === 'UPDATED' && !rows(srv, '08_ANGGARAN').some(r => /rab_lama/.test(r[0])) && !rows(srv, '19_LPJ').some(r => r[0] === 'lpj_lama1'),
      [r1, r2, r3, r4, r5, r6].join(' ')); }
  { const srv = makeServer(); const c = await boot(srv); const n0 = c.a.Store.loadRkat().length;
    session(c, 'rkat', ['tahun', 'unit', 'program', 'uraian', 'pagu'], [['2026', 'MI', 'Prog', 'Uraian RKAT', '100000']]); const r = c.sb.importWizardConfirm();
    rec('D4-04', 'jalur yang dipertahankan: wizard lama RKAT tetap berjalan (tidak terkena penonaktifan)', !(r && r.code === 'JALUR_IMPOR_LAMA_DINONAKTIFKAN') && c.a.Store.loadRkat().length >= n0, 'rkat ' + n0 + '->' + c.a.Store.loadRkat().length + ', toast ' + c.toast().slice(0, 60)); }
  { const srv = makeServer(); const c = await boot(srv);
    rec('D4-05', 'TERTUNDA: wizard lama SISWA (importWizardConfirmSiswa / commitSiswaRow) BELUM dinonaktifkan - masih diuji sebagai fungsi aktif oleh e2e_central2 M0/M1 & t4b_tests T4B-15; penonaktifan mengubah ekspektasi uji tersebut (butuh persetujuan). Tulisan akhirnya tetap lewat opMasterBatch + validasi master server', null,
      'impLamaNonaktif_(siswa)=' + c.sb.impLamaNonaktif_('siswa')); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
