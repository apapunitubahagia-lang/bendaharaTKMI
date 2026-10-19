/* Suite AUDIT IMPOR (sandbox Node, TIDAK menyentuh Google Sheets). Karakterisasi wizard impor yang ADA (P1_16 §1).
 * Tidak mengubah kode aplikasi. PASS = kontrol yang seharusnya berlaku memang berlaku; INFO = temuan/perilaku sekarang.
 */
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const FINAL = require('./fixtures/headers_backend.json').FINAL;
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };
/* menjalankan wizard yang ADA tanpa UI berkas: sesi impor diisi seperti hasil parsing CSV, header dipetakan 1:1 */
async function runImport(c, type, headers, data) {
  const A = c.a;
  A.State.importSession = { type, step: 'map', headers, rows: data.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))), headerMap: {}, results: null, batchId: 'b_' + type + '_' + Math.random().toString(36).slice(2, 7), rawFiles: [{ name: type + '.csv' }] };
  headers.forEach(h => { A.State.importSession.headerMap[h] = h; });
  c.sb.importWizardProceedToPreview(); const res = A.State.importSession.results;
  c.sb.importWizardConfirm(); await sync(c); return res;
}
const pendErrors = (c, name) => Object.values(c.sb.ccPend_(name)).filter(p => p.blocked).map(p => String(p.error || '').slice(0, 110));

(async () => {
  { const srv = makeServer(); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const c = await boot(srv); const n0 = rows(srv, '08_ANGGARAN').length;
    const r = await runImport(c, 'rab', ['uraian', 'nominal', 'unit', 'kategori', 'tahunAjaran'], [['Kertas A4', '500000', 'MI', 'ATK', '2026/2027']]);
    rec('IA-01', 'RAB / T4 (TEMUAN)', null, 'pratinjau valid ' + r.valid.length + ', baris server +' + (rows(srv, '08_ANGGARAN').length - n0) + ', gagal sinkron: ' + J(pendErrors(c, 'anggaran')) + ' -> wizard mengisi periode = tahun ajaran mentah; ditolak server sejak P0-T4 (sebelumnya tersimpan tetapi tidak pernah dihitung FCC/KPI)'); }
  { const res = {};
    for (const [type, sheet, hdr, data] of [['rab', '08_ANGGARAN', ['uraian', 'nominal', 'unit', 'kategori', 'tahunAjaran'], [['Kertas', '1000', 'MI', 'ATK', 'Tahun Ajaran 2026/2027']]], ['lpj', '19_LPJ', ['tanggal', 'uraian', 'nominal'], [['2026-10-05', 'Nota', '1000']]]]) {
      const srv = makeServer(); srv.sheets[sheet] = [FINAL[sheet].slice()]; const c = await boot(srv);
      await runImport(c, type, hdr, data); res[sheet] = { tersimpan: rows(srv, sheet).length, galat: pendErrors(c, type === 'rab' ? 'anggaran' : 'lpj') };
    }
    rec('IA-02', 'RAB/LPJ header FINAL / GAP-016 (TEMUAN)', null, J(res) + ' -> impor RAB/LPJ menulis kolom yang tidak ada di header FINAL (perlu migrasi aditif)'); }
  { const srv = makeServer(); const c = await boot(srv);
    await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-02', '75000', 'Spidol', 'MI']]);
    const t = rows(srv, '05_TRANSAKSI').find(x => x[col(srv, '05_TRANSAKSI', 'nominal')] === 75000);
    rec('IA-03', 'Pengeluaran default diam-diam (TEMUAN)', null, 'tanpa kolom akun/kategori -> tersimpan akun=' + (t && t[col(srv, '05_TRANSAKSI', 'akunId')]) + ', kategori=' + (t && t[col(srv, '05_TRANSAKSI', 'kategori')]) + ' (akunKasBankList[0] / kategoriPengeluaranList[0])'); }
  { const srv = makeServer(); const c = await boot(srv);
    await runImport(c, 'penerimaan', ['tanggal', 'nominal', 'uraian', 'unit', 'akun'], [['2026-10-03', '120000', 'Donasi', 'MI', 'Rekening Tidak Ada']]);
    const t = rows(srv, '05_TRANSAKSI').find(x => x[col(srv, '05_TRANSAKSI', 'nominal')] === 120000);
    rec('IA-04', 'Pemasukan akun tidak dikenal (TEMUAN)', null, 'akun "Rekening Tidak Ada" -> tersimpan akun=' + (t && t[col(srv, '05_TRANSAKSI', 'akunId')]) + ' (jatuh ke akun pertama tanpa peringatan)'); }
  { const srv = makeServer(); const c = await boot(srv);
    const a = await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-02', '75000', 'Spidol', 'MI']]);
    const b = await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-02', '75000', 'Spidol', 'MI']]);
    const n = rows(srv, '05_TRANSAKSI').filter(x => x[col(srv, '05_TRANSAKSI', 'nominal')] === 75000).length;
    rec('IA-05', 'impor ulang berkas sama', a.valid.length === 1 && b.duplicate.length === 1 && n === 1, 'impor kedua: duplikat ' + b.duplicate.length + ', transaksi di server ' + n + ' (deteksi sidik jari klien, bukan idempotensi server)'); }
  { const srv = makeServer(); const c = await boot(srv);
    const r = await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-04', '33000', 'Air galon', 'MI'], ['2026-10-04', '33000', 'Air galon', 'MI']]);
    const n = rows(srv, '05_TRANSAKSI').filter(x => x[col(srv, '05_TRANSAKSI', 'nominal')] === 33000).length;
    rec('IA-06', 'duplikat di dalam satu berkas (TEMUAN)', null, 'dua baris identik dalam satu berkas: valid ' + r.valid.length + ', duplikat ' + r.duplicate.length + ', tersimpan ' + n + ' (sidik jari hanya dibandingkan dengan data yang SUDAH ada)'); }
  { const srv = makeServer(); srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const r = await runImport(c, 'lpj', ['tanggal', 'uraian', 'nominal'], [['2026-10-05', 'Nota A', '10000'], ['2026-02-30', 'Nota B', '5000']]);
    rec('IA-07', 'LPJ tidak membuat transaksi', rows(srv, '05_TRANSAKSI').length === n0, 'impor LPJ: transaksi baru ' + (rows(srv, '05_TRANSAKSI').length - n0));
    rec('IA-08', 'LPJ validasi klien vs server (TEMUAN)', null, 'pratinjau valid ' + r.valid.length + ' (termasuk 2026-02-30), tersimpan ' + rows(srv, '19_LPJ').length + ', gagal sinkron ' + J(pendErrors(c, 'lpj')) + ' -> pratinjau menyatakan valid, server menolak SETELAH konfirmasi'); }
  { const srv = makeServer(); const c = await boot(srv);
    await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-02', '75000', 'Spidol', 'MI']]);
    await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], [['2026-10-02', '75000', 'Spidol', 'MI']]);
    const q = c.a.Store.loadImportQueue();
    rec('IA-09', 'antrean DUPLIKAT/HOLD (TEMUAN)', null, 'antrean impor ' + q.length + ' baris (' + q.map(x => x.type).join(',') + ') hanya di localStorage perangkat ini (Store.loadImportQueue), tidak di server'); }
  { const out = [];
    for (const n of [10, 50, 100, 500]) {
      const srv = makeServer(); const c = await boot(srv); let calls = 0; const o = srv.sb.opCreateTxBatch; srv.sb.opCreateTxBatch = x => { calls++; return o(x); };
      const data = Array.from({ length: n }, (_, i) => ['2026-10-' + String(1 + (i % 28)).padStart(2, '0'), String(10000 + i), 'Barang ' + i, 'MI']);
      const r = await runImport(c, 'pengeluaran', ['tanggal', 'nominal', 'uraian', 'unit'], data);
      out.push(n + ' baris: valid ' + r.valid.length + ', tersimpan ' + (rows(srv, '05_TRANSAKSI').length - 2) + ', RPC opCreateTxBatch ' + calls);
    }
    rec('IA-10', 'skala 10/50/100/500 (sandbox)', null, out.join(' | ') + ' (jumlah RPC = ceil(n/20); waktu Apps Script nyata BELUM diukur)'); }
  { const srv = makeServer(); const c = await boot(srv);
    c.a.State.importSession = { type: 'siswa', step: 'map', headers: ['namaSiswa', 'unit', 'kelas', 'tanggalMasuk', 'jenisKelamin'], rows: [{ namaSiswa: 'Siswa Uji', unit: 'MI', kelas: '1', tanggalMasuk: '05/09/2026', jenisKelamin: 'L' }], headerMap: { namaSiswa: 'namaSiswa', unit: 'unit', kelas: 'kelas', tanggalMasuk: 'tanggalMasuk', jenisKelamin: 'jenisKelamin' }, results: null, batchId: 'b_s', rawFiles: [{ name: 's.csv' }] };
    c.sb.importWizardProceedToPreview(); c.sb.importWizardConfirmSiswa('skip'); await sync(c);
    const r = rows(srv, '01_SISWA').find(x => x[col(srv, '01_SISWA', 'nama')] === 'Siswa Uji');
    const tm = r && r[col(srv, '01_SISWA', 'tanggalMasuk')], jk = r && r[col(srv, '01_SISWA', 'jenisKelamin')];
    rec('IA-11', 'Siswa tanggalMasuk/jenisKelamin (TEMUAN)', null, 'siswa ' + (r ? 'tersimpan' : 'TIDAK tersimpan') + '; tanggalMasuk "05/09/2026" -> ' + J(tm) + ', jenisKelamin "L" -> ' + J(jk) + (tm === '' ? ' -> kolom DIBUANG diam-diam (MASTER_WRITE_FIELDS.siswa klien tidak memuatnya), padahal tanggalMasuk menentukan periode kewajiban (RD-10)' : '')); }

  { // GAP-008: periodeAktif FINAL berformat tanggal
    const srv = makeServer(); const i = srv.sheets['15_SETTINGS'].findIndex(r => r[0] === 'periodeAktif');
    if (i > 0) srv.sheets['15_SETTINGS'][i][1] = '2026-10-01'; else srv.sheets['15_SETTINGS'].push(['periodeAktif', '2026-10-01', '']);
    const c = await boot(srv); const p = c.a.Store.loadSettings().periodeAktif, k = c.sb.kpiIndukSummary();
    rec('IA-12', 'periodeAktif format tanggal / GAP-008 (TEMUAN)', null, 'periodeAktif=' + J(p) + ', parsePeriodeLabel=' + J(c.sb.parsePeriodeLabel(p)) + ', KPI dihitung untuk periode ' + J(k.periode) + ' -> overall ' + k.overall + ' (bukan DATA TIDAK TERSEDIA; label tidak cocok dengan periode bulan mana pun)'); }
  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
