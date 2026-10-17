/* Tes regresi: skema aditif, rabId, transaksi arsip, riwayat pembayaran, idempotensi penerapan.
   Sandbox lokal saja (kode GAS + skrip HTML asli, mock Sheets, seed berheader LIVE). TIDAK menyentuh Google Sheets. */
const fs = require('fs'), vm = require('vm');
const { liveLike, clone, obl, setBlob } = require('./live_seed.js');
const { OUT } = require('./srv_env.js');
const R = []; const rec = (n, ok, d) => R.push({ n, ok: !!ok, d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 150); i++) { if (cond()) return true; await tick(2); } return false; }
const rows = (s, n) => s.sheets[n].slice(1);
const col = (s, sh, h) => s.sheets[sh][0].indexOf(h);
const audits = s => s.sheets['13_AUDIT_LOG'].slice(1).map(r => r[2]);
const TRX_KEYS = 23;

// ---- klien (skrip HTML asli) ----
const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8').replace(/\r/g, '');
const js = html.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
const bridgeNames = [...fs.readFileSync(OUT + 'ServerBridge.js', 'utf8').matchAll(/^    ([A-Za-z]+): function/gm)].map(m => m[1]);
function makeClient(srv) {
  const store = {}, els = {}, fields = {};
  const gen = id => ({ id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '', textContent: '', value: '', href: '', appendChild() {}, removeChild() {}, click() {} });
  const el = id => (els[id] = els[id] || gen(id));
  const dyn = new Set(['toast', 'modalOverlay', 'modalBody', 'content', 'pageSub', 'pageTitle', 'navlist', 'periodeBadge', 'authStatusBadge', 'pdSchemaOut', 'fccVerifyOut']);
  const document = { getElementById(id) { if (id in fields) return { value: fields[id], files: [] }; if (dyn.has(id)) return el(id); return null; }, querySelector() { return null; }, addEventListener() {}, createElement: () => gen('x'), body: gen('body') };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const bridge = {}; bridgeNames.forEach(n => { bridge[n] = (...a) => Promise.resolve().then(() => { const out = srv.sb[n](...JSON.parse(JSON.stringify(a))); return out === undefined ? out : JSON.parse(JSON.stringify(out)); }); });
  const sbx = { console: { log() {}, error() {}, warn() {} }, localStorage, document, Date, Math, JSON, Object, Array, Number, String, Boolean, Error, RegExp, Promise, Set, Map, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, addEventListener() {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} }, Blob: function () {}, TextEncoder, ServerBridge: bridge };
  sbx.window = sbx; sbx.globalThis = sbx; vm.createContext(sbx);
  vm.runInContext(js + '\n;globalThis.__a={};\n' + ['Store', 'MasterAPI', 'OperationalAPI', 'OperationalCache', 'CentralAuth', 'CentralMasterData', 'State'].map(n => `try{__a.${n}=${n};}catch(e){}`).join('\n'), sbx);
  return { sb: sbx, a: sbx.__a, fields, el, toast: () => el('toast').textContent };
}
const sync = async c => { await c.sb.centralRunSync(true); await tick(5); };

(async () => {
  try {
    // ============ 1. SKEMA LAMA UTUH SETELAH KOLOM BARU + PENERAPAN ULANG ============
    const S = liveLike(); const B = S.sb;
    // beri riwayat tambahan: transaksi berjalan lewat engine (pembayaran + alokasi) SEBELUM migrasi
    const pre = B.opCreateIncome({ tanggal: '2026-09-03', unit: 'MI', nominal: 150000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: 'mi4a', clientRequestId: 'pre_1', allocations: [{ siswaId: 'mi4a', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 150000, caraBayar: 'cicilan' }] });
    const snap = () => { const o = {}; Object.keys(S.sheets).forEach(k => { o[k] = { head: S.sheets[k][0].slice(), data: S.sheets[k].slice(1).map(r => r.slice()) }; }); return o; };
    const A = snap();
    const posPre = B.opGetStudentPosition('mi4a').data, oblPre = B.opObligations({}).data.rows.map(r => [r.key, r.netto, r.terbayar, r.sisa].join('|')).sort();
    const fccPre = B.opFinancialControl('September 2026').data;
    const trxListPre = B.opGetTransactions({}).data, trxShapePre = Object.keys(trxListPre[0]).join();
    rec('S0 pra-migrasi: pembayaran historis + 1 pembayaran engine tercatat (pre-kondisi)', pre.ok && rows(S, '06_ALOKASI').length === 5 && trxListPre.length === 5, pre.code);
    let r = B.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    const Bf = snap();
    let intact = true, why = [];
    Object.keys(A).forEach(k => {
      const n = A[k].head.length;
      if (JSON.stringify(Bf[k].head.slice(0, n)) !== JSON.stringify(A[k].head)) { intact = false; why.push(k + ': header lama berubah'); }
      if (k === '13_AUDIT_LOG') { if (Bf[k].data.length < A[k].data.length) { intact = false; why.push(k + ': baris audit berkurang'); } }
      else if (Bf[k].data.length !== A[k].data.length) { intact = false; why.push(k + ': jumlah baris berubah'); }
      A[k].data.forEach((row, i) => { if (JSON.stringify(Bf[k].data[i].slice(0, n)) !== JSON.stringify(row.slice(0, n))) { intact = false; why.push(k + ' baris ' + i + ': data lama berubah'); } });
    });
    rec('S1 migrasi aditif: untuk SEMUA 27 sheet header lama utuh (urutan sama), tidak ada baris dihapus/ditimpa (13_AUDIT_LOG hanya bertambah: catatan SCHEMA_ADD_COLUMNS), isi sel lama identik; kolom baru hanya di ujung', r.ok && intact && Object.keys(A).length >= 26, why.slice(0, 4));
    const added = r.data.added.reduce((m, x) => { m[x.sheet] = x.add; return m; }, {});
    rec('S2 kolom yang ditambahkan = rencana: 09_KOMITMEN +rabId; 02/04/08 memuat kolom tarif; 07_AKUN & 10_BUKTI.fileRef TIDAK ditambah; 13_AUDIT_LOG/15_SETTINGS tidak disentuh', added['09_KOMITMEN'].indexOf('rabId') === 0 && ['sasaran', 'basisTarif', 'menggantikan'].every(c => added['02_KOMPONEN'].includes(c)) && ['jatuhTempo', 'tahunAjaran', 'kelas', 'unit', 'tarifId', 'tarifSatuan', 'jumlahHari'].every(c => added['04_KEWAJIBAN'].includes(c)) && ['jenis', 'komponenId'].every(c => added['08_ANGGARAN'].includes(c)) && !added['07_AKUN'] && !(added['10_BUKTI'] || []).includes('fileRef') && !added['13_AUDIT_LOG'] && !added['15_SETTINGS'], Object.keys(added));
    const posPost = B.opGetStudentPosition('mi4a').data, oblPost = B.opObligations({}).data.rows.map(r => [r.key, r.netto, r.terbayar, r.sisa].join('|')).sort(), fccPost = B.opFinancialControl('September 2026').data;
    rec('S3 pembayaran/alokasi/saldo historis TIDAK berubah akibat kolom baru: posisi siswa, seluruh kewajiban (netto/terbayar/sisa), saldo kas FCC identik; bentuk daftar transaksi aktif identik', JSON.stringify(posPre) === JSON.stringify(posPost) && JSON.stringify(oblPre) === JSON.stringify(oblPost) && fccPre.actual.cashPosition === fccPost.actual.cashPosition && fccPre.actual.incomePeriode === fccPost.actual.incomePeriode && Object.keys(B.opGetTransactions({}).data[0]).join() === trxShapePre && B.opGetTransactions({}).data.length === trxListPre.length, [posPre, posPost]);
    r = B.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const afterTwice = JSON.stringify(snap());
    rec('S4 penerapan skema ULANG idempoten: tidak ada kolom/baris baru, hasil "tidak ada yang perlu ditambah"', r.ok && r.data.added.length === 0 && afterTwice === JSON.stringify(Bf), r.message);
    const p1 = B.opTarifApply('TERAPKAN_RENCANA_TARIF'); const s1 = JSON.stringify(snap());
    const p2 = B.opTarifApply('TERAPKAN_RENCANA_TARIF'); const s2 = JSON.stringify(snap());
    rec('S5 rencana tarif: penerapan pertama sukses; penerapan ULANG tidak mengubah apa pun (seluruh isi sheet identik)', p1.ok && p2.ok && s1 === s2 && p2.data.ringkasan.komponenAdd === 0 && p2.data.ringkasan.tarifAdd === 0 && p2.data.ringkasan.tarifDeactivate === 0, p2.ok ? p2.data.ringkasan : p2.code);
    rec('S6 setelah rencana tarif: transaksi & alokasi historis identik byte-per-byte pada kolom lama (tidak ada baris hilang/berubah)', JSON.stringify(snap()['05_TRANSAKSI'].data.map(x => x.slice(0, TRX_KEYS))) === JSON.stringify(A['05_TRANSAKSI'].data.map(x => x.slice(0, TRX_KEYS))) && JSON.stringify(snap()['06_ALOKASI'].data.map(x => x.slice(0, 9))) === JSON.stringify(A['06_ALOKASI'].data.map(x => x.slice(0, 9))));
    rec('S6b pembayaran historis tetap terhitung pada kewajiban yang dibekukan (mi3a: lump terbayar 1.800.000)', (obl(S, 'mi3a').find(o => o.komponenId === 'kmp_pendidikan') || {}).terbayar === 1800000);

    // ============ 2. rabId: simpan, baca, dipakai dalam perhitungan komitmen ============
    const ang = B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_rab1', row: { periode: 'September 2026', program: 'ATK Kertas', kategori: 'ATK', unit: 'MI', nominal: 400000, jenis: 'PENGELUARAN' } }]);
    const kom = B.opRecordBatch('komitmen', [{ op: 'upsert', id: 'kom_rab1', row: { uraian: 'Pesan kertas', nominal: 90000, status: 'COMMITTED', rabId: 'ang_rab1', tanggal: '2026-09-05' } }, { op: 'upsert', id: 'kom_rab2', row: { uraian: 'Belum dibayar', nominal: 30000, status: 'EXPECTED', rabId: 'ang_rab1', tanggal: '2026-09-06' } }]);
    const kr = rows(S, '09_KOMITMEN'), h9 = S.sheets['09_KOMITMEN'][0];
    rec('K1 rabId tersimpan di kolom rabId (ujung header); kolom live lama (tanggal, uraian, nominal, status, jatuhTempo) terisi benar; nominal numerik', ang.ok && kom.ok && kr.length === 2 && kr[0][h9.indexOf('rabId')] === 'ang_rab1' && kr[0][h9.indexOf('uraian')] === 'Pesan kertas' && kr[0][h9.indexOf('nominal')] === 90000 && h9.indexOf('rabId') === 6, h9);
    const rd = B.opReadSheet('09_KOMITMEN', {});
    rec('K2 rabId terbaca kembali lewat opReadSheet (nama header live, bukan posisi)', rd.ok && JSON.stringify(rd.data).indexOf('ang_rab1') !== -1, rd.ok && Object.keys(rd.data.rows ? rd.data.rows[0] : {}));
    const fcc = B.opFinancialControl('September 2026').data, line = fcc.anggaranVsAktual.rows.find(x => x.nama === 'ATK');
    rec('K3 perhitungan komitmen (server FCC): RAB "ATK Kertas" punya komitmen COMMITTED 90.000 dan EXPECTED 30.000 terpisah; committed.total memuat 90.000; RAB tidak lagi dianggap "tanpa realisasi/komitmen"', fcc.committed.committed === 90000 && fcc.expected.expectedCost === 30000 && line && line.komitmen === 90000 && line.diharapkan === 30000 && !fcc.missing.rabTanpaRealisasi.some(x => x.id === 'ang_rab1'), [fcc.committed, line]);
    const c = makeClient(S); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded));
    rec('K4 klien membaca komitmen dari server dengan rabId; komitmenForRab = 90.000 (COMMITTED+INCURRED saja)', c.sb.komitmenForRab('ang_rab1') === 90000 && c.a.Store.loadObligasi().find(o => o.id === 'kom_rab1').rabId === 'ang_rab1');
    Object.assign(c.fields, { obf_uraian: 'Tinta', obf_nominal: '25000', obf_status: 'INCURRED', obf_rab: 'ang_rab1' }); c.sb.submitObligasi(); await sync(c);
    const kn = rows(S, '09_KOMITMEN').find(x => x[h9.indexOf('uraian')] === 'Tinta');
    rec('K5 submitObligasi (UI) dengan RAB terpilih: tersimpan ke server dengan rabId (tidak tertahan), komitmenForRab = 115.000, FCC klien = FCC server', !!kn && kn[h9.indexOf('rabId')] === 'ang_rab1' && c.sb.komitmenForRab('ang_rab1') === 115000 && c.sb.centralBlockedCount() === 0 && /Cocok/.test(await c.sb.centralFccVerify()), kn);
    Object.assign(c.fields, { obf_uraian: 'Tanpa RAB', obf_nominal: '1000', obf_status: 'EXPECTED', obf_rab: '' }); c.sb.submitObligasi(); await sync(c);
    rec('K6 komitmen tanpa RAB (rabId null) tetap tersimpan dan terbaca (kolom kosong -> null)', rows(S, '09_KOMITMEN').length === 4 && c.a.Store.loadObligasi().find(o => o.uraian === 'Tanpa RAB').rabId === null);
    // sebelum migrasi: komitmen berkait RAB tidak boleh hilang diam-diam
    const S0 = liveLike(); const c0 = makeClient(S0); c0.sb.initializeSeedData(); c0.sb.bootstrapCentralAuth(); await until(() => Object.keys(c0.a.OperationalCache.states).every(k => c0.a.OperationalCache.states[k].loaded));
    Object.assign(c0.fields, { obf_uraian: 'Uji pra-migrasi', obf_nominal: '5000', obf_status: 'COMMITTED', obf_rab: 'rab_x' }); c0.sb.submitObligasi(); await sync(c0);
    rec('K7 sebelum migrasi: komitmen berkait RAB ditahan (blocked, pesan migrasi), tidak ditulis diam-diam, tetap tampil lokal; setelah migrasi + sinkron tertulis', c0.sb.centralBlockedCount() >= 1 && rows(S0, '09_KOMITMEN').length === 0 && c0.a.Store.loadObligasi().some(o => o.uraian === 'Uji pra-migrasi'));
    await c0.sb.pdSchemaApplyConfirmed(); await sync(c0);
    rec('K7b setelah migrasi aditif + sinkron: komitmen tertulis dengan rabId, antrean kosong', rows(S0, '09_KOMITMEN').length === 1 && rows(S0, '09_KOMITMEN')[0][S0.sheets['09_KOMITMEN'][0].indexOf('rabId')] === 'rab_x' && c0.sb.centralBlockedCount() === 0, c0.sb.centralBlockedCount());

    // ============ 3 & 4. TRANSAKSI ARSIP ============
    const S2 = liveLike(); const B2 = S2.sb; B2.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    // sebelum migrasi: bentuk getTransactions identik (kolom arsip belum ada) - dicek pada S3 di bawah
    const mk = (cid, nom, sid, per, ak) => B2.opCreateIncome({ tanggal: '2026-09-10', unit: 'MI', nominal: nom, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: sid, clientRequestId: cid, allocations: [{ siswaId: sid, komponenId: 'kmp_spp', periode: per, nominal: ak, caraBayar: 'cicilan' }] });
    const t1 = mk('arc1', 250000, 'mi5a', 'Juli 2026', 250000), t2 = mk('arc2', 250000, 'mi5b', 'Juli 2026', 100000);
    const id1 = t1.data.id, id2 = t2.data.id;
    const cashBefore = B2.opFinancialControl('September 2026').data.actual.cashPosition, incBefore = B2.opFinancialControl('September 2026').data.actual.incomePeriode;
    const listBefore = B2.opGetTransactions({}).data.length;
    const ar = B2.opArchiveTransaction(id1, 'salah catat');
    const act = B2.opGetTransactions({}).data, all = B2.opGetTransactions({ includeArchived: true }).data;
    rec('A1 transaksi arsip tidak ada di daftar aktif (getTransactions/opGetTransactions); baris tetap ada; includeArchived:true menampilkannya dengan archivedAt+alasan', ar.ok && act.length === listBefore - 1 && !act.some(t => t.id === id1) && all.length === listBefore && all.find(t => t.id === id1).archivedAt && all.find(t => t.id === id1).archiveReason === 'salah catat' && rows(S2, '05_TRANSAKSI').some(x => x[0] === id1), [act.length, listBefore]);
    rec('A2 bentuk baris transaksi AKTIF tidak berubah (tanpa field arsip); getTransaction(id arsip) mengembalikan baris dengan archivedAt (baca riwayat tetap bisa)', !('archivedAt' in act.find(t => t.id === id2)) && Object.keys(act.find(t => t.id === id2)).length === TRX_KEYS && B2.opGetTransaction(id1).ok && B2.opGetTransaction(id1).data.archivedAt);
    const fccA = B2.opFinancialControl('September 2026').data;
    rec('A3 laporan: penerimaan arsip tidak ikut FCC (income -250.000, kas -250.000); alokasinya ikut diarsipkan dan tidak dihitung pada kewajiban (mi5a Juli terbayar 0)', fccA.actual.incomePeriode === incBefore - 250000 && fccA.actual.cashPosition === cashBefore - 250000 && (obl(S2, 'mi5a', 'Juli 2026').find(o => o.komponenId === 'kmp_spp') || {}).terbayar === 0 && B2.opGetStudentPosition('mi5a').data.totalTerbayar === 0, [fccA.actual, cashBefore]);
    const nRows = JSON.stringify(rows(S2, '05_TRANSAKSI')), nAud = audits(S2).length;
    const u = B2.opUpdateTransaction({ id: id1, nominal: 999999 });
    rec('A4 transaksi arsip TIDAK bisa diubah lewat opUpdateTransaction (TRANSACTION_ARCHIVED); sheet dan audit tidak berubah', !u.ok && u.code === 'TRANSACTION_ARCHIVED' && JSON.stringify(rows(S2, '05_TRANSAKSI')) === nRows && audits(S2).filter(a => a === 'UPDATE_TRANSACTION').length === 0, u.code);
    const nA = rows(S2, '06_ALOKASI').length;
    const ca = B2.opCreateAllocation({ transaksiId: id1, siswaId: 'mi5a', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 1000, clientRequestId: 'arc_a1' });
    rec('A5 alokasi BARU ke transaksi arsip ditolak (TRANSACTION_ARCHIVED); tidak ada alokasi tertulis', !ca.ok && ca.code === 'TRANSACTION_ARCHIVED' && rows(S2, '06_ALOKASI').length === nA, ca.code);
    const ar2 = B2.opArchiveTransaction(id1, 'ulang');
    rec('A6 arsip ulang idempoten (0 diarsipkan lagi), tidak ada baris baru; transaksi aktif lain tetap bisa diubah (regresi jalur aktif)', ar2.ok && ar2.data.transaksiDiarsipkan === 0 && B2.opUpdateTransaction({ id: id2, catatan: 'koreksi' }).ok && rows(S2, '05_TRANSAKSI').find(x => x[0] === id2)[9] === 'koreksi');
    const ca2 = B2.opCreateAllocation({ transaksiId: id2, siswaId: 'mi5b', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 50000, clientRequestId: 'arc_a2' });
    rec('A7 transaksi aktif tetap menerima alokasi (regresi jalur aktif): terbayar 150.000', ca2.ok && (obl(S2, 'mi5b', 'Juli 2026').find(o => o.komponenId === 'kmp_spp') || {}).terbayar === 150000, ca2.code);
    // pertahanan: arsip dilakukan di luar opArchiveTransaction (mis. edit sheet manual) - alokasi aktifnya tidak boleh terhitung
    const trxRow = S2.sheets['05_TRANSAKSI'].find(x => x[0] === id2); trxRow[col(S2, '05_TRANSAKSI', 'archivedAt')] = '2026-10-14T00:00:00.000Z';
    rec('A8 pertahanan: transaksi ditandai arsip tanpa mengarsipkan alokasinya (edit manual) - alokasi tidak terhitung pada kewajiban dan transaksi hilang dari daftar aktif', (obl(S2, 'mi5b', 'Juli 2026').find(o => o.komponenId === 'kmp_spp') || {}).terbayar === 0 && !B2.opGetTransactions({}).data.some(t => t.id === id2));
    // klien: transaksi arsip tidak tampil, patch antrean ke transaksi arsip ditahan
    const c2 = makeClient(S2); c2.sb.initializeSeedData(); c2.sb.bootstrapCentralAuth(); await until(() => Object.keys(c2.a.OperationalCache.states).every(k => c2.a.OperationalCache.states[k].loaded));
    rec('A9 klien: transaksi arsip tidak muncul di allTransaksi/penerimaanList; transaksi server aktif tetap tampil', !c2.sb.allTransaksi().some(t => t.id === id1 || t.id === id2) && c2.sb.allTransaksi().some(t => t.id === 'hist_t1'));
    // jalur patch klien untuk transaksi yang diarsipkan di sesi lain
    const S3 = liveLike(); const B3 = S3.sb; B3.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    const c3 = makeClient(S3); c3.sb.initializeSeedData(); c3.sb.bootstrapCentralAuth(); await until(() => Object.keys(c3.a.OperationalCache.states).every(k => c3.a.OperationalCache.states[k].loaded));
    c3.sb.updateTransaksiStatus('hist_t4', 'SELESAI');                       // antrean patch lokal
    B3.opArchiveTransaction('hist_t4', 'diarsipkan di sesi lain');           // sesi lain mengarsipkan sebelum sinkron
    await sync(c3);
    rec('A10 patch antrean klien ke transaksi yang sudah diarsipkan ditolak server (TRANSACTION_ARCHIVED), ditandai gagal (tidak diulang), status di sheet tidak berubah', S3.sheets['05_TRANSAKSI'].find(x => x[0] === 'hist_t4')[col(S3, '05_TRANSAKSI', 'status')] === 'TERALOKASI' && c3.sb.centralBlockedCount() >= 1, c3.sb.centralBlockedCount());
    // tanpa kolom arsip (sebelum migrasi) perilaku engine sama seperti sebelumnya
    const S4 = liveLike(); const L4 = S4.sb.getTransactions_({}).data;
    rec('A11 sebelum migrasi (tanpa kolom arsip): getTransactions mengembalikan semua baris dengan 23 field persis seperti sebelumnya; updateTransaction transaksi biasa tetap berfungsi', L4.length === 4 && Object.keys(L4[0]).length === TRX_KEYS && S4.sb.opUpdateTransaction({ id: 'hist_t1', catatan: 'x' }).ok);
  } catch (e) { rec('HARNESS ERROR', false, e.stack.slice(0, 1200)); }
  R.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : '  <= ' + String(JSON.stringify(x.d)).slice(0, 700))));
  console.log('\nPASS=' + R.filter(x => x.ok).length + ' FAIL=' + R.filter(x => !x.ok).length);
  process.exit(0);
})();
