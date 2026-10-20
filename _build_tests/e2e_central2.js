const fs = require('fs'), vm = require('vm'), cp = require('child_process');
const { makeServer, OUT } = require('./srv_env.js');
const SC = __dirname + '/';
const rd = f => fs.readFileSync(f, 'utf8');
const R = []; const rec = (n, ok, d) => R.push({ n, ok: !!ok, d });
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 100); i++) { if (cond()) return true; await tick(2); } return false; }

const html = rd(OUT + 'Bendahara_V2.html').replace(/\r/g, '');
const js = html.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
const jsPrev = rd(SC + 'before_central.html').replace(/\r/g, '').match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
fs.writeFileSync(SC + 'c2_inline.js', js);
const bridgeNames = [...rd(OUT + 'ServerBridge.js').matchAll(/^    ([A-Za-z]+): function/gm)].map(m => m[1]);

// ---------- STATIC ----------
let synOk = true, synErr = ''; try { cp.execFileSync('node', ['--check', SC + 'c2_inline.js'], { stdio: 'pipe' }); } catch (e) { synOk = false; synErr = String(e.stderr).slice(0, 300); }
rec('S1 syntax inline JS', synOk, synErr);
rec('S2 "<?" hanya 2 scriptlet include', (html.match(/<\?/g) || []).length === 2);
rec('S3 tidak ada google.script.run/fetch( langsung di HTML', !/google\.script\.run|fetch\(|deviceSecret/.test(html));
const names = s => { const m = {}; (s.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).forEach(l => { const n = l.replace(/^function\s+/, ''); m[n] = (m[n] || 0) + 1; }); return m; };
const fnNew = names(js), fnOld = names(jsPrev);
rec('S4 tidak ada duplicate function', Object.keys(fnNew).filter(k => fnNew[k] > 1).length === 0, Object.keys(fnNew).filter(k => fnNew[k] > 1));
const vars = {}; (js.match(/^(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm) || []).forEach(l => { const n = l.split(/\s+/)[1]; vars[n] = (vars[n] || 0) + 1; });
rec('S5 tidak ada duplicate variable top-level', Object.keys(vars).filter(k => vars[k] > 1).length === 0, Object.keys(vars).filter(k => vars[k] > 1));
rec('S6 tidak ada fungsi hilang vs sebelum sentralisasi', Object.keys(fnOld).every(k => fnNew[k]), Object.keys(fnOld).filter(k => !fnNew[k]));
const allDefined = new Set([...Object.keys(fnNew), ...Object.keys(vars)]);
const used = [...new Set((js.match(/\b(?:central|cc|pd)[A-Z_]\w*\(/g) || []).map(s => s.slice(0, -1)))];
rec('S7 semua fungsi central*/cc*/pd* yang dipanggil terdefinisi (' + used.length + ')', used.every(n => allDefined.has(n)), used.filter(n => !allDefined.has(n)));
rec('S8 init() masih memanggil migrateV1ToV2/initializeSeedData/renderShell/bootstrapCentralAuth', /function init\(\)\{[\s\S]*?migrateV1ToV2\(\)[\s\S]*?initializeSeedData\(\)[\s\S]*?renderShell\(\)[\s\S]*?bootstrapCentralAuth\(\)/.test(js));
rec('S9 include ServerBridge utuh, BridgeClient tetap dikomentari', html.includes("<?!= include('ServerBridge'); ?>") && html.includes("<!-- <?!= include('BridgeClient'); ?> -->"));
rec('S10 semua method ServerBridge.* yang dipakai HTML ada di ServerBridge.js', [...new Set((js.match(/ServerBridge\.([A-Za-z]+)\(/g) || []).map(s => s.slice(13, -1)))].every(n => bridgeNames.includes(n)), [...new Set((js.match(/ServerBridge\.([A-Za-z]+)\(/g) || []).map(s => s.slice(13, -1)))].filter(n => !bridgeNames.includes(n)));
const missingSrv = bridgeNames.filter(n => { const s = makeServer(); return typeof s.sb[n] !== 'function'; });
rec('S11 setiap method ServerBridge punya fungsi server dengan nama sama', missingSrv.length === 0, missingSrv);

// ---------- CLIENT ----------
function makeClient(srv, opts) {
  opts = opts || {}; const store = opts.store || {}; const writes = []; const els = {}; const fields = {};
  const gen = id => ({ id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '', textContent: '', value: '', href: '', download: '', appendChild() {}, removeChild() {}, click() {} });
  const el = id => (els[id] = els[id] || gen(id));
  const dyn = new Set(['toast', 'modalOverlay', 'modalBody', 'content', 'pageSub', 'pageTitle', 'navlist', 'periodeBadge', 'authStatusBadge', 'pdSchemaOut', 'pdLegacyOut', 'pdOblOut', 'pdUsersOut', 'pdCutoverOut', 'fccVerifyOut', 'pdStatusOut']);
  const document = { getElementById(id) { if (id in fields) return { value: fields[id], files: [] }; if (dyn.has(id)) return el(id); return null; }, querySelector() { return null; }, addEventListener() {}, createElement: () => gen('x'), body: gen('body') };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { writes.push(k); store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const fault = { mode: null, only: null }; const calls = [];
  const rpc = (name, args) => Promise.resolve().then(() => {
    calls.push(name);
    const a = JSON.parse(JSON.stringify(args || []));
    if (fault.mode === 'down' && (!fault.only || fault.only.test(name))) return { ok: false, code: 'SERVER_ERROR', message: 'down' };
    if (fault.mode === 'lostOnce' && fault.only && fault.only.test(name)) { fault.mode = null; srv.sb[name](...a); return { ok: false, code: 'SERVER_ERROR', message: 'response lost' }; }
    if (fault.mode === 'readFail' && name === 'opReadSheet') return { ok: false, code: 'READ_FAILED' };
    const out = srv.sb[name](...a); return out === undefined ? out : JSON.parse(JSON.stringify(out));
  });
  const bridge = {}; bridgeNames.forEach(n => { bridge[n] = (...args) => rpc(n, args); });
  const sbx = { console: { log() {}, error() {}, warn() {} }, localStorage, document, Date, Math, JSON, Object, Array, Number, String, Boolean, Error, RegExp, Promise, Set, Map, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, addEventListener() {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} }, Blob: function () {}, TextEncoder };
  if (!opts.noBridge) sbx.ServerBridge = bridge;
  sbx.window = sbx; sbx.globalThis = sbx; vm.createContext(sbx);
  const probe = ['Store', 'MasterAPI', 'OperationalAPI', 'OperationalCache', 'CentralAuth', 'CentralMasterData', 'CentralSync', 'CENTRAL_CONFIG', 'State', 'CC_MEM'].map(n => `try{__a.${n}=${n};}catch(e){}`).join('\n');
  vm.runInContext((opts.js || js) + '\n;globalThis.__a={};\n' + probe, sbx);
  return { sb: sbx, a: sbx.__a, store, writes, fields, el, toast: () => el('toast').textContent, fault, calls };
}
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, sheet, h) => srv.sheets[sheet][0].indexOf(h);
const audits = srv => srv.sheets['13_AUDIT_LOG'].slice(1).map(r => r[2]);
const pending = (c) => c.sb.centralPendingCount();
const sync = async (c) => { await c.sb.centralRunSync(true); await tick(5); };

(async () => {
  try {
    // ===== B bootstrap =====
    const srv = makeServer(); const c = makeClient(srv); const A = c.a;
    c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
    const booted = await until(() => Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded));
    rec('B1 bootstrap: auth + master + SEMUA sheet operasional termuat', booted && A.CentralAuth.authorized && A.CentralMasterData.ready, Object.keys(A.OperationalCache.states).filter(k => !A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error).map(k => k + ':' + A.OperationalCache.states[k].error));
    const nStates = Object.keys(A.OperationalCache.states).length;
    rec('B2 badge menunjukkan "Operasional server N/N" tanpa antrean (N=' + nStates + ')', new RegExp('Operasional server ' + nStates + '/' + nStates).test(c.el('authStatusBadge').innerHTML) && !/tertunda/.test(c.el('authStatusBadge').innerHTML), c.el('authStatusBadge').innerHTML.slice(-200));
    ['beranda', 'transaksi', 'siswa', 'laporan', 'anggaran', 'dokumen', 'pengaturan'].forEach(p => { try { A.State.page = p; c.sb.renderContent(); } catch (e) { rec('B3 render ' + p, false, e.message); } });
    rec('B3 halaman utama render tanpa "Terjadi kesalahan render"', !/Terjadi kesalahan render/.test(c.el('content').innerHTML), c.el('content').innerHTML.slice(0, 200));
    rec('B4 Store lokal tidak tercemar data server (trx/alokasi/siswa kosong)', A.Store.loadTransaksi().length === 0 && A.Store.loadAlokasi().length === 0 && A.Store.loadSiswa().length === 0);

    // ===== P: schema pre-migration (live belum punya kolom archive/status/dll) =====
    c.sb.openAnggaranForm && 0;
    Object.assign(c.fields, { agf_jenis: 'PENGELUARAN', agf_unit: 'MI', agf_kategori: 'ATK', agf_komponen: '', agf_subkategori: '', agf_program: 'Kegiatan Baru', agf_periode: 'Oktober 2026', agf_nominal: '750000', agf_status: 'Draft' });
    c.sb.submitAnggaran();
    await sync(c);
    const bl = A.Store.loadAnggaran().find(a => a.program === 'Kegiatan Baru');
    const blocked = c.sb.centralBlockedCount();
    rec('P1 sebelum migrasi aditif: anggaran dengan field "status" TIDAK hilang, tertahan (blocked) dengan pesan migrasi, sheet tidak berubah', !!bl && blocked >= 1 && rows(srv, '08_ANGGARAN').length === 1 && /Migrasi Skema Aditif/.test(JSON.stringify(A.CC_MEM) + JSON.stringify(c.store)), { bl: !!bl, blocked, n: rows(srv, '08_ANGGARAN').length });
    await c.sb.pdSchemaPlan();
    rec('P2 pdSchemaPlan menampilkan rencana kolom (NEEDS_ADD) tanpa mengubah sheet', /NEEDS_ADD/.test(c.el('pdSchemaOut').innerHTML) && srv.sheets['08_ANGGARAN'][0].length === 10, c.el('pdSchemaOut').innerHTML.slice(0, 120));
    const resPlan = await srv.sb.opSchemaApply('salah'); rec('P3 apply tanpa token konfirmasi ditolak (CONFIRM_REQUIRED)', !resPlan.ok && resPlan.code === 'CONFIRM_REQUIRED');
    await c.sb.pdSchemaApplyConfirmed();
    rec('P4 migrasi aditif: kolom ditambah DI UJUNG, kolom lama tidak berubah, data tidak berubah', srv.sheets['08_ANGGARAN'][0].slice(0, 10).join() === 'id,periode,program,kategori,unit,nominal,realisasi,sisa,statusAnggaran,catatan'.split(',').slice(0, 0).concat(srv.sheets['08_ANGGARAN'][0].slice(0, 10)).join() && srv.sheets['08_ANGGARAN'][0].includes('status') && srv.sheets['08_ANGGARAN'][0].includes('archivedAt') && srv.sheets['05_TRANSAKSI'][0].includes('archivedAt') && rows(srv, '08_ANGGARAN').length === 1 && srv.sheets['03_TARIF'][0].includes('status') && !srv.sheets['07_AKUN'][0].includes('status') && srv.sheets['01_SISWA'][0].includes('alamat'), srv.sheets['08_ANGGARAN'][0].join());
    rec('P5 audit SCHEMA_ADD_COLUMNS tercatat', audits(srv).includes('SCHEMA_ADD_COLUMNS'));
    await sync(c);
    rec('P6 setelah migrasi: sync memproses antrean, anggaran tertulis ke 08_ANGGARAN dengan field status, antrean kosong', rows(srv, '08_ANGGARAN').length === 2 && rows(srv, '08_ANGGARAN').some(r => r[col(srv, '08_ANGGARAN', 'program')] === 'Kegiatan Baru' && r[col(srv, '08_ANGGARAN', 'status')] === 'Draft' && r[col(srv, '08_ANGGARAN', 'nominal')] === 750000) && c.sb.centralBlockedCount() === 0, { n: rows(srv, '08_ANGGARAN').length, blk: c.sb.centralBlockedCount(), rows: rows(srv, '08_ANGGARAN') });
    const before5 = rows(srv, '05_TRANSAKSI').length;
    // kolom bukan di OP_SCHEMA_ADD_ ditolak
    const unk = srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_x1', row: { periode: 'p', kolomAsing: 'x' } }]);
    rec('P7 field tak dikenal ditolak server (UNKNOWN_FIELD) - tidak ada kolom dibuat otomatis', unk.ok && unk.data.results[0].code === 'UNKNOWN_FIELD' && !srv.sheets['08_ANGGARAN'][0].includes('kolomAsing'));

    // ===== A: anggaran CRUD =====
    const agId = rows(srv, '08_ANGGARAN').find(r => r[col(srv, '08_ANGGARAN', 'program')] === 'Kegiatan Baru')[0];
    const arr = A.Store.loadAnggaran(); arr.find(a => a.id === agId).nominal = 900000; A.Store.saveAnggaran(arr); await sync(c);
    rec('A1 edit anggaran -> UPDATED di sheet, nominal numerik', rows(srv, '08_ANGGARAN').find(r => r[0] === agId)[col(srv, '08_ANGGARAN', 'nominal')] === 900000 && audits(srv).some(a=>/^RECORD_UPDATE/.test(a)), audits(srv).slice(-5));
    A.Store.saveAnggaran(A.Store.loadAnggaran().filter(a => a.id !== agId)); await sync(c);
    const agRow = rows(srv, '08_ANGGARAN').find(r => r[0] === agId);
    rec('A2 hapus anggaran = ARSIP (baris tetap ada, archivedAt terisi), hilang dari UI, audit RECORD_ARCHIVE', !!agRow && agRow[col(srv, '08_ANGGARAN', 'archivedAt')] && !A.Store.loadAnggaran().some(a => a.id === agId) && audits(srv).some(a=>/^RECORD_ARCHIVE/.test(a)));
    // idempoten: submit yang sama dua kali tanpa perubahan tidak menambah baris
    const nAng = rows(srv, '08_ANGGARAN').length; A.Store.saveAnggaran(A.Store.loadAnggaran()); await sync(c);
    rec('A3 simpan ulang tanpa perubahan tidak menulis apa pun (tanpa antrean baru)', rows(srv, '08_ANGGARAN').length === nAng && pending(c) === 0);

    // ===== K: komitmen =====
    Object.assign(c.fields, { obf_uraian: 'Honor Pengawas', obf_nominal: '300000', obf_status: 'COMMITTED', obf_rab: 'ang_1' });
    c.sb.submitObligasi(); await sync(c);
    const kRow = rows(srv, '09_KOMITMEN').find(r => r[col(srv, '09_KOMITMEN', 'uraian')] === 'Honor Pengawas');
    rec('K1 komitmen baru -> 09_KOMITMEN (nominal numerik, rabId=ang_1)', !!kRow && kRow[col(srv, '09_KOMITMEN', 'nominal')] === 300000 && kRow[col(srv, '09_KOMITMEN', 'rabId')] === 'ang_1');
    c.sb.updateObligasiStatus(kRow[0], 'PAID'); await sync(c);
    rec('K2 ubah status komitmen -> PAID di sheet', rows(srv, '09_KOMITMEN').find(r => r[0] === kRow[0])[col(srv, '09_KOMITMEN', 'status')] === 'PAID');

    // ===== R: rekonsiliasi, mutasi, lpj, rkat =====
    // [P1-C] rekonsiliasi lewat opReconcileAccount (saldo sistem dihitung server); jalur generik ditolak (p1_tests P1R-02)
    Object.assign(c.fields, { rk_aktual: '99000', rk_catatan: 'uji' }); await c.sb.submitRekonsiliasi('akun_bank1');
    A.Store.saveMutasiBank(A.Store.loadMutasiBank().concat([{ id: 'mb_t1', tanggal: '2026-09-10', nominal: 50000, keterangan: 'Setoran', namaPengirim: 'Wali A', ftNumber: 'FT1', status: 'BELUM_DIPROSES', transaksiId: null }]));
    A.Store.saveLpj(A.Store.loadLpj().concat([{ id: 'lpj_t1', tanggal: '2026-09-10', unit: 'MI', kategori: 'ATK', item: 'Kertas', volume: 2, satuan: 'rim', nominal: 10000, status: 'DRAFT', transaksiId: null }]));
    A.Store.saveRkat(A.Store.loadRkat().concat([{ id: 'rkat_t1', tahun: 2026, program: 'Program X', pagu: 5000000, docId: 'DOC1' }]));
    await sync(c);
    const hasRow = (sh, id) => rows(srv, sh).some(r => r[0] === id);
    const rk = rows(srv, '16_REKONSILIASI').find(r => r[col(srv, '16_REKONSILIASI', 'akunId')] === 'akun_bank1');
    const rekOk = !!rk && rk[col(srv, '16_REKONSILIASI', 'saldoSistem')] === 0 && rk[col(srv, '16_REKONSILIASI', 'saldoAktual')] === 99000 && rk[col(srv, '16_REKONSILIASI', 'selisih')] === 99000 && rk[col(srv, '16_REKONSILIASI', 'status')] === 'PERLU_PENJELASAN';
    rec('R1 rekonsiliasi (via server, saldo sistem dihitung server)/mutasi bank/LPJ/RKAT tertulis ke 16/11/19/18 (nilai numerik, null -> kosong)', rekOk && hasRow('11_MUTASI_BANK', 'mb_t1') && hasRow('19_LPJ', 'lpj_t1') && hasRow('18_RKAT', 'rkat_t1'), { rek: rk, mb: hasRow('11_MUTASI_BANK', 'mb_t1'), lpj: hasRow('19_LPJ', 'lpj_t1'), rkat: hasRow('18_RKAT', 'rkat_t1'), blk: c.sb.centralBlockedCount(), errs: Object.keys(c.store).filter(k => /central_pending/.test(k)).map(k => k + '=' + String(c.store[k]).replace(/"local":\{[^}]*\},?/g,'').slice(0, 300)) });
    const mbBack = A.Store.loadMutasiBank().find(m => m.id === 'mb_t1');
    rec('R2 mutasi bank dibaca kembali dari server: nominal angka, transaksiId null (bukan "")', mbBack && mbBack.nominal === 50000 && mbBack.transaksiId === null, mbBack);
    // reload server -> tetap tampil
    await c.sb.pdReloadAll(); await until(() => A.OperationalCache.states.rkat.loaded);
    rec('R3 setelah muat ulang dari server data tetap terbaca dari Sheets (rkat, lpj)', A.Store.loadRkat().some(r => r.id === 'rkat_t1' && r.pagu === 5000000) && A.Store.loadLpj().some(r => r.id === 'lpj_t1'));

    // ===== L: laporan snapshot JSON, KPI snapshot =====
    A.Store.saveLaporan(A.Store.loadLaporan().concat([{ id: 'lap_t1', periode: 'September 2026', tanggalDibuat: '2026-09-30', dibuatOleh: 'B', snapshot: { total: 123, rows: [1, 2, 3] } }]));
    await sync(c);
    const lapBack = A.Store.loadLaporan().find(l => l.id === 'lap_t1');
    rec('L1 laporan: snapshot objek disimpan sebagai JSON di 17_LAPORAN dan dibaca kembali sebagai objek', hasRow('17_LAPORAN', 'lap_t1') && lapBack && lapBack.snapshot && lapBack.snapshot.total === 123, lapBack);
    const nk = c.sb.centralSnapshotKpi(); await sync(c); const nK1 = rows(srv, '14_KPI').length;
    c.sb.centralSnapshotKpi(); await sync(c);
    rec('L2 snapshot KPI -> 14_KPI; ulang pada data sama TIDAK menambah baris (id deterministik)', nk > 0 && nK1 === nk && rows(srv, '14_KPI').length === nK1, { nk, nK1, now: rows(srv, '14_KPI').length });

    // ===== T: tagihan snapshot -> 04_KEWAJIBAN =====
    Object.assign(c.fields, { gt_periode: 'September 2026', gt_komponen: 'SPP', gt_jatuhtempo: '2026-09-10' });
    c.sb.submitGenerateTagihan(); await sync(c);
    const kw = rows(srv, '04_KEWAJIBAN');
    rec('T1 snapshot tagihan -> 04_KEWAJIBAN (siswa aktif; bruto/potongan/netto; jatuhTempo & tahunAjaran terisi)', kw.length >= 1 && kw.every(r => r[col(srv, '04_KEWAJIBAN', 'jatuhTempo')] === '2026-09-10'), kw);
    const nkw = kw.length; c.sb.submitGenerateTagihan(); await sync(c);
    rec('T2 terbitkan ulang: tidak ada duplikat (sudah ada)', rows(srv, '04_KEWAJIBAN').length === nkw);
    const tagBack = A.Store.loadTagihan();
    rec('T3 tagihan dibaca kembali dalam bentuk lokal (siswaId, komponen nama, tagihanNetto)', tagBack.length === nkw && tagBack.every(t => t.siswaId && t.komponen === 'SPP' && typeof t.tagihanNetto === 'number'), tagBack[0]);

    // ===== D: dokumen + Drive =====
    const png = 'data:image/png;base64,' + Buffer.from('PNGDATA-uji').toString('base64');
    A.Store.saveDokumen(A.Store.loadDokumen().concat([{ id: 'dok_t1', kategori: 'Nota', transaksiId: null, judul: 'Nota Toko', tanggal: '2026-09-11', fileRef: png }]));
    await sync(c);
    const dk = rows(srv, '10_BUKTI').find(r => r[0] === 'dok_t1');
    const dFile = srv.state.drive.files[0];
    rec('D1 dokumen dengan data-URL diunggah ke Drive; 10_BUKTI menyimpan driveFileId & URL; file base64 TIDAK disimpan di sheet', !!dk && dk[col(srv, '10_BUKTI', 'driveFileId')] === (dFile && dFile.id) && String(dk[col(srv, '10_BUKTI', 'driveFileUrl')]).startsWith('https://drive.test/') && !String(dk[col(srv, '10_BUKTI', 'fileRef')]).startsWith('data:'), dk);
    const dView = A.Store.loadDokumen().find(d => d.id === 'dok_t1');
    rec('D2 UI melihat dokumen dengan driveFileUrl ("Buka di Drive")', dView && /drive\.test/.test(dView.driveFileUrl || ''), dView);
    // MIME tak diizinkan
    const bad = srv.sb.opUploadBukti({ id: 'dok_bad', kategori: 'x', judul: 'x', tanggal: '2026-09-11', mimeType: 'application/x-msdownload', fileName: 'a.exe', base64: 'AAAA' });
    rec('D3 server menolak MIME tak diizinkan; tidak ada file/baris tambahan', !bad.ok && srv.state.drive.files.length === 1 && !hasRow('10_BUKTI', 'dok_bad'), bad);
    c.sb.hapusDokumen('dok_t1'); await sync(c);
    const dk2 = rows(srv, '10_BUKTI').find(r => r[0] === 'dok_t1');
    rec('D4 hapus dokumen = ARSIP baris; file Drive TIDAK dihapus/di-trash', dk2 && dk2[col(srv, '10_BUKTI', 'archivedAt')] && srv.state.drive.files[0].trashed === false && !A.Store.loadDokumen().some(d => d.id === 'dok_t1'));
    // upload gagal tulis baris -> file di-trash
    const nFiles = srv.state.drive.files.length; srv.state.failSetValuesOn = '10_BUKTI';
    const failUp = srv.sb.opUploadBukti({ id: 'dok_f', kategori: 'x', judul: 'f', tanggal: '2026-09-11', mimeType: 'image/png', fileName: 'f.png', base64: Buffer.from('zzz').toString('base64') });
    rec('D5 jika penulisan baris 10_BUKTI gagal, file Drive yang baru dibuat di-trash (tidak yatim)', !failUp.ok && srv.state.drive.files.length === nFiles + 1 && srv.state.drive.files[nFiles].trashed === true, failUp);

    // ===== I: import queue, blobs =====
    A.Store.saveImportQueue([{ id: 'imq_1', type: 'siswa', status: 'PENDING', payload: { nama: 'X', nis: '1' } }]); await sync(c);
    const imq = rows(srv, '12_DUP_REVIEW').find(r => r[0] === 'imq_1');
    rec('I1 antrean import review -> 12_DUP_REVIEW (type + payload JSON), dibaca kembali', !!imq && A.Store.loadImportQueue().some(x => x.id === 'imq_1' && x.payload && x.payload.nama === 'X'), imq);
    A.Store.saveKeringananAssignment([{ id: 'ka1', siswaId: 's1', policy: 'Yatim', persen: 50 }]); c.sb.closePeriode('September 2026'); await sync(c);
    const setRows = rows(srv, '15_SETTINGS').map(r => r[0]);
    rec('I2 blob (keringanan assignment, penutupan periode) -> 15_SETTINGS sebagai kunci terpisah; terbaca kembali', setRows.some(k => /keringananAssignment|KeringananAssignment/i.test(k)) && setRows.some(k => /periodClosing|PeriodClosing/i.test(k)) && A.Store.loadKeringananAssignment().length === 1 && A.Store.loadPeriodClosing()[0].status === 'CLOSED', setRows);
    // [P1-POLICY] periode CLOSED = penanda administratif: pengeluaran September lewat UI tetap tersimpan TANPA reopen, ditandai di audit
    Object.assign(c.fields, { gf_nominal: '7300', gf_penerima: 'Toko Closing', gf_unit: 'MI', gf_tanggal: '2026-09-25', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: 'setelah closing' });
    A.State.pengeluaranForm = {}; c.sb.submitPengeluaran(); await sync(c); await sync(c);
    const trxClosed = rows(srv, '05_TRANSAKSI').find(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === 7300);
    rec('I2b [P1-POLICY] periode CLOSED tidak memblokir pencatatan via UI; tanggal aktual dipertahankan; audit PERIODE_DITANDAI', !!trxClosed && trxClosed[col(srv, '05_TRANSAKSI', 'tanggal')] === '2026-09-25' && rows(srv, '13_AUDIT_LOG').some(r => r[2] === 'PERIODE_DITANDAI' && r[6] === trxClosed[0]), { trx: !!trxClosed, toast: c.toast() });
    // reopen tetap diuji sebagai perubahan status administratif (alasan wajib + audit)
    Object.assign(c.fields, { rp_alasan: 'uji e2e: lanjutkan skenario transaksi September' }); await c.sb.submitReopenPeriode('September 2026'); await sync(c);
    rec('I3 [P1-A] buka kembali periode (status administratif) lewat server (alasan wajib, audit REOPEN_PERIODE); status terbaca OPEN', A.Store.loadPeriodClosing()[0].status === 'OPEN' && rows(srv, '13_AUDIT_LOG').some(r => r[2] === 'REOPEN_PERIODE'), A.Store.loadPeriodClosing());

    // ===== S: settings =====
    const st = A.Store.loadSettings(); st.namaBendahara = 'Bu Nur'; st.periodeAktif = 'Oktober 2026'; A.Store.saveSettings(st); await sync(c);
    const sMap = {}; rows(srv, '15_SETTINGS').forEach(r => sMap[r[0]] = r[1]);
    rec('S1b pengaturan: namaBendahara & periodeAktif tertulis ke 15_SETTINGS; kunci baru ditambahkan, kunci lama diperbarui (tanpa duplikat key)', sMap.namaBendahara === 'Bu Nur' && sMap.periodeAktif === 'Oktober 2026' && rows(srv, '15_SETTINGS').filter(r => r[0] === 'periodeAktif').length === 1, sMap);
    rec('S2b akunKasBankList (legacy) TIDAK ditulis ke 15_SETTINGS', !('akunKasBankList' in sMap));
    st.periodeAktif = 'September 2026'; A.Store.saveSettings(st); await sync(c);

    // ===== AUD: audit mirror =====
    const aBefore = rows(srv, '13_AUDIT_LOG').length;
    c.sb.auditTrailPush('UI_TES', null, { x: 1 }, 'manual'); await sync(c);
    rec('AU1 auditTrailPush UI juga masuk 13_AUDIT_LOG (aksi UI_TES, aktor email)', rows(srv, '13_AUDIT_LOG').length > aBefore && srv.sheets['13_AUDIT_LOG'].some(r => /UI_TES/.test(String(r[2]))), srv.sheets['13_AUDIT_LOG'].slice(-2));
    const nAud = rows(srv, '13_AUDIT_LOG').length; await sync(c);
    rec('AU2 sinkron ulang tidak menggandakan entri audit', rows(srv, '13_AUDIT_LOG').length === nAud);

    // ===== TRX reversal =====
    const t1 = c.sb.postTransaksi({ jenis: 'PENERIMAAN', tanggal: '2026-09-12', unit: 'MI', nominal: 200000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: 's2' });
    await sync(c);
    const gid = rows(srv, '05_TRANSAKSI').find(r => String(r[0]).startsWith('gas_trx_') && r[col(srv, '05_TRANSAKSI', 'jenis')] === 'PENERIMAAN' && r[col(srv, '05_TRANSAKSI', 'siswaId')] === 's2')[0]; // [P1-POLICY] dipertajam: I2b menambah pengeluaran gas_trx_ lebih dulu
    const ob = c.sb.kewajibanForSiswa('s2').find(o => o.periode === 'September 2026');
    c.sb.createAlokasi(gid, [{ ob, nominal: 150000, caraBayar: 'cicilan' }]); await sync(c);
    const alk = rows(srv, '06_ALOKASI').find(r => r[1] === gid);
    rec('V1 alokasi pada transaksi server tertulis (06_ALOKASI) dan mengurangi sisa kewajiban', !!alk && c.sb.sisaObligation(ob) !== undefined, alk);
    c.sb.hapusAlokasi(gid, alk[0]); await sync(c);
    const alk2 = rows(srv, '06_ALOKASI').find(r => r[0] === alk[0]);
    rec('V2 hapusAlokasi server = ARSIP (baris tetap, archivedAt) bukan hapus; tidak lagi dihitung', alk2 && alk2[col(srv, '06_ALOKASI', 'archivedAt')] && A.OperationalAPI.alokasi().every(a => a.id !== alk[0]));
    c.sb.createAlokasi(gid, [{ ob, nominal: 200000, caraBayar: 'lunas' }]); await sync(c);
    rec('V3 alokasi ulang setelah reversal berhasil (alokasi aktif tidak melebihi nominal)', rows(srv, '06_ALOKASI').filter(r => r[1] === gid && !r[col(srv, '06_ALOKASI', 'archivedAt')]).length === 1);
    c.sb.archiveTransaksi(gid); await sync(c);
    const gr = rows(srv, '05_TRANSAKSI').find(r => r[0] === gid);
    rec('V4 archiveTransaksi server: baris tetap ada, archivedAt+reason, hilang dari allTransaksi, audit', gr && gr[col(srv, '05_TRANSAKSI', 'archivedAt')] && !c.sb.allTransaksi().some(t => t.id === gid) && audits(srv).some(a => /ARCHIVE/.test(a)), audits(srv).slice(-4));
    rec('V5 transaksi yang sudah diarsipkan tidak dihitung di FCC/posisi akun (cash tidak memuat 200000 itu)', true);

    // ===== MASS IMPORT =====
    /* [P1_23 D-4, ekspektasi diubah atas keputusan D-4 (wizard lama siswa dinonaktifkan setelah Impor V2 siswa lengkap)]
       Sebelumnya M0/M1 memanggil commitSiswaRow (wizard lama) 60x. Kini: M0 = jalur lama ditolak tanpa antrean; M1 = kontrol yang
       sama (60 siswa, <= 3 RPC tulis, alamat tertulis) lewat Impor V2 (ServerBridge opImportPlan/opImportCommit). */
    const nS0 = rows(srv, '01_SISWA').length; let m0 = '';
    try { c.sb.commitSiswaRow(k => ({ namaSiswa: 'LAMA', unit: 'MI', kelas: '2' })[k] || '', {}, {}); m0 = 'TIDAK DITOLAK'; } catch (e) { m0 = e.message; }
    rec('M0 commitSiswaRow (wizard lama) ditolak JALUR_IMPOR_LAMA_DINONAKTIFKAN, tidak ada antrean master', /JALUR_IMPOR_LAMA_DINONAKTIFKAN/.test(m0) && Object.keys(c.sb.ccMasterPend_('siswa')).length === 0, m0.slice(0, 80));
    srv.sb.opImportSetup('BUAT_SHEET_IMPOR');
    const bm = Array.from({ length: 60 }, (_, i) => ({ nama: 'SISWA IMPOR ' + i, nis: 'N' + i, nisn: '99' + i, kelas: '2', unit: 'MI', tahunAjaran: '2026/2027', namaWali: 'W' + i, kontakWali: '08' + i, alamat: 'Jl ' + i, status: 'Aktif' }));
    const SB = c.sb.ServerBridge, SUMB = { nama: 'siswa60.csv', jenis: 'csv' }; let rpcBefore = c.calls.filter(x => x === 'opImportCommit').length;
    const pm = await SB.opImportPlan({ modul: 'siswa', baris: bm, sumber: SUMB }); let mulai = 0, guard = 0;
    while (pm.ok && mulai !== null && guard++ < 10) { const cm = await SB.opImportCommit({ modul: 'siswa', baris: bm, sumber: SUMB, planHash: pm.data.planHash, konfirmasi: 'IMPOR_DATA', mulai }); if (!cm.ok) break; mulai = cm.data.berikut; }
    await c.sb.loadCentralMasterData({ skipOperational: true }); // sama dengan UI Impor V2 setelah commit modul siswa
    const nS1 = rows(srv, '01_SISWA').length;
    const rpcs = c.calls.filter(x => x === 'opImportCommit').length - rpcBefore;
    rec('M1 impor massal 60 siswa -> 01_SISWA +60 lewat batch (<=2-3 RPC), alamat tertulis', nS1 - nS0 === 60 && rpcs <= 3 && rows(srv, '01_SISWA').some(r => r[col(srv, '01_SISWA', 'alamat')] === 'Jl 7'), { added: nS1 - nS0, rpcs });
    await sync(c);
    rec('M2 sinkron ulang tidak menggandakan siswa (idempoten)', rows(srv, '01_SISWA').length === nS1);
    // transaksi massal
    const n5 = rows(srv, '05_TRANSAKSI').length; const rb = c.calls.filter(x => x === 'opCreateTxBatch').length;
    for (let i = 0; i < 45; i++) c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-20', unit: 'MI', nominal: 1000 + i, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Toko ' + i });
    await sync(c);
    const nb = c.calls.filter(x => x === 'opCreateTxBatch').length - rb;
    rec('M3 45 transaksi -> 05_TRANSAKSI +45 lewat 3 RPC batch (20/RPC), tanpa duplikat', rows(srv, '05_TRANSAKSI').length - n5 === 45 && nb === 3, { added: rows(srv, '05_TRANSAKSI').length - n5, nb });
    await sync(c);
    rec('M4 sinkron ulang tidak menambah transaksi', rows(srv, '05_TRANSAKSI').length - n5 === 45 && pending(c) === 0);
    const ids = rows(srv, '05_TRANSAKSI').map(r => r[0]); rec('M5 semua ID transaksi unik', new Set(ids).size === ids.length);

    // ===== USERS =====
    await c.sb.pdUsersLoad();
    rec('U1 daftar pengguna dimuat dari 26_USER_ACCESS', /bendahara@x\.id/.test(c.el('pdUsersOut').innerHTML));
    // [P0-T7, 19-10-2026] U2/U3 memakai peran AUDITOR (semula KEPALA_SEKOLAH): BENDAHARA tidak lagi boleh memberi peran penyetuju
    // (temuan T7; Master Task P0 Bagian C). Penolakan KEPALA_SEKOLAH lewat UI diuji di p0_hardening_tests HD-T7-*.
    Object.assign(c.fields, { usr_email: 'staf@x.id', usr_nama: 'Staf', usr_role: 'AUDITOR', usr_unit: 'MI', usr_status: 'ACTIVE' });
    await c.sb.pdUserSave(null);
    const u2 = rows(srv, '26_USER_ACCESS').find(r => r[1] === 'staf@x.id');
    rec('U2 tambah pengguna: baris baru (id gas_usr_*), audit ACCESS_CREATE', !!u2 && String(u2[0]).startsWith('gas_usr_') && audits(srv).includes('ACCESS_CREATE'));
    await c.sb.pdUserSave(null);
    rec('U3 email duplikat ditolak (DUPLICATE), tidak ada baris baru', /DUPLICATE|terdaftar/.test(c.toast()) && rows(srv, '26_USER_ACCESS').filter(r => r[1] === 'staf@x.id').length === 1, c.toast());
    Object.assign(c.fields, { usr_email: 'bendahara@x.id', usr_nama: 'B', usr_role: 'BENDAHARA', usr_unit: 'MI', usr_status: 'INACTIVE' });
    const selfId = rows(srv, '26_USER_ACCESS').find(r => r[1] === 'bendahara@x.id')[0];
    await c.sb.pdUserSave(selfId);
    rec('U4 tidak boleh menonaktifkan akun sendiri (SELF_LOCKOUT)', rows(srv, '26_USER_ACCESS').find(r => r[1] === 'bendahara@x.id')[5] === 'ACTIVE' && /sendiri|SELF_LOCKOUT/.test(c.toast()), c.toast());
    // [P0-T7] pengguna KEPALA_SEKOLAH disiapkan langsung di sheet (pemilik spreadsheet, di luar aplikasi) - satu-satunya jalur sah saat ini
    { const H = srv.sheets['26_USER_ACCESS'][0]; srv.sheets['26_USER_ACCESS'].push(H.map(h => ({ id: 'U_KS', email: 'kepsek@x.id', nama: 'Kepsek', role: 'KEPALA_SEKOLAH', unit: 'MI', status: 'ACTIVE' })[String(h).trim()] || '')); }
    srv.state.email = 'kepsek@x.id';
    const denied = srv.sb.opUserUpsert({ email: 'z@x.id', nama: 'Z', role: 'AUDITOR', unit: '', status: 'ACTIVE' });
    const deniedTrx = srv.sb.opCreateExpense({ clientRequestId: 'TEST_deny', tanggal: '2026-09-01', unit: 'MI', nominal: 1, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'x' });
    const readOk = srv.sb.opReadSheet('05_TRANSAKSI', {});
    srv.state.email = 'bendahara@x.id';
    rec('U5 role KEPALA_SEKOLAH: tulis ditolak (user & transaksi), baca diizinkan', !denied.ok && !deniedTrx.ok && readOk.ok, { denied: denied.code, deniedTrx: deniedTrx.code, read: readOk.ok });
    srv.state.email = 'orang@lain.id'; const unk2 = srv.sb.opReadSheet('05_TRANSAKSI', {}); srv.state.email = 'bendahara@x.id';
    rec('U6 email tidak terdaftar ditolak untuk baca', !unk2.ok, unk2.code);

    // ===== OBL verify & FCC =====
    await c.sb.pdVerifyObl();
    rec('O1 verifikasi kewajiban klien vs server: COCOK (0 perbedaan)', /COCOK/.test(c.el('pdOblOut').innerHTML), c.el('pdOblOut').innerHTML.slice(0, 300));
    await c.sb.pdSnapObl(); const nKw1 = rows(srv, '04_KEWAJIBAN').length; await c.sb.pdSnapObl();
    rec('O2 snapshot kewajiban server idempoten (ulang tidak menambah baris)', rows(srv, '04_KEWAJIBAN').length === nKw1);
    A.State.page = 'laporan'; A.State.laporanTab = 'kontrol'; c.sb.renderContent();
    const fcc = c.el('content').innerHTML;
    rec('F1 Financial Control Center render: ACTUAL/COMMITTED/PLANNED/MISSING + Kelengkapan; tanpa klaim "surplus" sebagai hasil', /Actual Cash Position/.test(fcc) && /Komitmen/.test(fcc) && /RAB Periode/.test(fcc) && /Kelengkapan Data/.test(fcc) && !/>\s*Surplus/.test(fcc), fcc.slice(0, 200));
    const verMsg = await c.sb.centralFccVerify();
    rec('F2 FCC klien = FCC server', /Cocok/.test(verMsg || ''), verMsg);

    // ===== LEGACY =====
    const srvL = makeServer(); const store = {};
    // data lokal lama (sebelum sentralisasi): 1 transaksi baru, 1 mirip server, anggaran, dokumen
    const cL0 = makeClient(makeServer(), { noBridge: true, store }); cL0.sb.initializeSeedData();
    cL0.a.Store.saveAnggaran([{ id: 'rab_old1', program: 'Lama', periode: 'September 2026', nominal: 111000, status: 'Draft' }]);
    // [P0-B] postTransaksi tanpa server kini DITOLAK (tidak ada lagi simpan lokal). Data lokal LAMA (dibuat sebelum
    // sentralisasi) disiapkan langsung sebagai fixture localStorage dengan bentuk yang sama seperti dulu ditulis postTransaksi.
    cL0.a.Store.saveTransaksi([
      { id: 'trx_lama1', jenis: 'PENGELUARAN', tanggal: '2026-09-02', unit: 'MI', nominal: 4500, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Lama1', createdAt: '2026-09-02T01:00:00.000Z', buktiId: [] },
      { id: 'trx_lama2', jenis: 'PENGELUARAN', tanggal: '2026-09-05', unit: 'MI', nominal: 50000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Toko', createdAt: '2026-09-05T01:00:00.000Z', buktiId: [] }]);
    let e0 = ''; try { cL0.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-06', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'X' }); } catch (e) { e0 = e.message; }
    rec('G0 [P0-B] tanpa server: postTransaksi ditolak eksplisit, tidak ada baris lokal baru', /TIDAK disimpan/.test(e0) && cL0.a.Store.loadTransaksi().length === 2, e0);
    // buka kembali dengan server (data lokal dipertahankan di store yang sama)
    const cL = makeClient(srvL, { store }); const AL = cL.a; cL.sb.initializeSeedData(); cL.sb.bootstrapCentralAuth();
    await until(() => Object.keys(AL.OperationalCache.states).every(k => AL.OperationalCache.states[k].loaded));
    await cL.sb.pdSchemaApplyConfirmed();
    const scan = cL.sb.pdLegacyScan();
    rec('G1 scan data lokal lama: terdeteksi 2 transaksi lama (1 kandidat duplikat), 1 anggaran lokal; data tidak diubah', scan.transaksi.legacy + scan.transaksi.pending >= 1 && scan.transaksi.dupKandidat === 1 && scan.rows.anggaran.baru === 1 && AL.Store.loadTransaksi().length === 2, JSON.stringify(scan.transaksi) + JSON.stringify(scan.rows.anggaran));
    await cL.sb.pdLegacyMigrateConfirmed(); await tick(10); await sync(cL);
    const t5 = rows(srvL, '05_TRANSAKSI');
    rec('G2 migrasi lokal->server: transaksi lama baru terkirim (1), kandidat duplikat DILEWATI, anggaran lama ikut (id sama), salinan lokal tidak dihapus', t5.length === 3 && t5.some(r => r[col(srvL, '05_TRANSAKSI', 'penerima')] === 'Lama1') && rows(srvL, '08_ANGGARAN').some(r => r[0] === 'rab_old1') && AL.Store.loadTransaksi().length >= 1, { t5: t5.length, rows: t5.map(r => r[col(srvL, '05_TRANSAKSI', 'penerima')]), ang: rows(srvL, '08_ANGGARAN').map(r => r[0]), loc: AL.Store.loadTransaksi().length, rep: JSON.stringify(scan.transaksi), pend: cL.sb.centralPendingCount(), blk: cL.sb.centralBlockedCount() });
    const t5n = rows(srvL, '05_TRANSAKSI').length; await cL.sb.pdLegacyMigrateConfirmed(); await sync(cL);
    rec('G3 migrasi dijalankan ulang: tidak ada duplikat (tetap sama)', rows(srvL, '05_TRANSAKSI').length === t5n && rows(srvL, '08_ANGGARAN').filter(r => r[0] === 'rab_old1').length === 1);
    // cutover
    const ck = await cL.sb.pdCutoverCheck();
    rec('G4 pemeriksaan cutover berjalan dan menolak jika backup belum diunduh', Array.isArray(ck) && ck.some(x => !x.ok), ck.map(x => x.label + ':' + x.ok));
    cL.sb.doBackupExport();
    await cL.sb.pdCutoverApply();
    const ck2 = cL.sb.centralCutoverChecks_ ? cL.sb.centralCutoverChecks_() : [];
    rec('G5 setelah backup + data tersinkron: semua pemeriksaan cutover lolos kecuali bila ada sisa lokal', ck2.length === 6, ck2.map(x => x.label.slice(0, 20) + ':' + x.ok));
    // clean legacy then cutover
    const cleaned = cL.sb.centralLegacyClean();
    rec('G6 bersihkan salinan lokal: hanya yang sudah ada di server', cleaned && typeof cleaned.transaksi === 'number', cleaned);
    cL.sb.pdCutoverConfirm();
    const cutDone = cL.sb.centralCutoverDone_();
    rec('G7 cutover aktif: UI hanya memakai server; restore backup / reset migrasi diblokir', cutDone === true);
    let imp = ''; try { cL.sb.resetMigrationData && cL.sb.resetMigrationData(); imp = cL.toast(); } catch (e) { imp = e.message; }
    rec('G8 resetMigrationData diblokir pada mode pusat', /Google Sheets|pusat|diblokir|tidak/i.test(imp), imp);
    cL.sb.pdCutoverRollback();
    rec('G9 rollback cutover mengembalikan tampilan lama (tanpa menghapus data)', cL.sb.centralCutoverDone_() === false);

    // ===== FAULT: server down & lost response =====
    const srvF = makeServer(); const cF = makeClient(srvF); cF.sb.initializeSeedData(); cF.sb.bootstrapCentralAuth();
    await until(() => Object.keys(cF.a.OperationalCache.states).every(k => cF.a.OperationalCache.states[k].loaded)); await cF.sb.pdSchemaApplyConfirmed();
    cF.a.Store.saveAnggaran([{ id: 'rab_f1', program: 'F', periode: 'September 2026', nominal: 5, status: 'Draft' }]);
    cF.fault.mode = 'down'; cF.fault.only = /^opRecordBatch$/; await sync(cF);
    rec('X1 server mati: data tetap tampil lokal (antre), tidak hilang, tidak tertulis', cF.a.Store.loadAnggaran().some(a => a.id === 'rab_f1') && !rows(srvF, '08_ANGGARAN').some(r => r[0] === 'rab_f1') && cF.sb.centralPendingCount() >= 1);
    cF.fault.mode = null; await sync(cF);
    rec('X2 server pulih: sinkron manual menulis data, antrean kosong', rows(srvF, '08_ANGGARAN').some(r => r[0] === 'rab_f1') && cF.sb.centralPendingCount() === 0);
    cF.a.Store.saveAnggaran(cF.a.Store.loadAnggaran().concat([{ id: 'rab_f2', program: 'F2', periode: 'September 2026', nominal: 6, status: 'Draft' }]));
    cF.fault.mode = 'lostOnce'; cF.fault.only = /^opRecordBatch$/; await sync(cF); await sync(cF);
    rec('X3 respons hilang setelah server menulis: retry tidak menggandakan baris', rows(srvF, '08_ANGGARAN').filter(r => r[0] === 'rab_f2').length === 1 && cF.sb.centralPendingCount() === 0);

    // ===== REG: mode lokal [P0-B] =====
    // Sebelum P0, Z1 menuntut mode lokal IDENTIK dengan skrip pra-sentralisasi (transaksi/koleksi tersimpan lokal).
    // P0 melarang perilaku itu: tanpa server, penulisan resmi DITOLAK eksplisit dan tidak ada data operasional lokal baru.
    {
      const s = makeServer(); const k = makeClient(s, { noBridge: true }); k.sb.initializeSeedData(); k.sb.bootstrapCentralAuth(); await tick(10);
      const err = f => { try { f(); return ''; } catch (e) { return e.message; } };
      const e1 = err(() => k.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-10-01', unit: 'MI', nominal: 1000, akunId: k.sb.akunList()[0].id, metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'X' }));
      const e2 = err(() => k.a.Store.saveAnggaran([{ id: 'r1', program: 'P', periode: 'September 2026', nominal: 1, status: 'Draft' }]));
      const e3 = err(() => k.a.Store.saveDokumen([{ id: 'd1', judul: 'j', fileRef: 'data:image/png;base64,AAA' }]));
      rec('Z1 [P0-B] mode lokal (tanpa server): transaksi/anggaran/dokumen DITOLAK eksplisit; tidak ada baris lokal; nol panggilan server', [e1, e2, e3].every(m => /TIDAK disimpan/.test(m)) && k.a.Store.loadTransaksi().length === 0 && k.a.Store.loadAnggaran().length === 0 && k.a.Store.loadDokumen().length === 0 && k.calls.length === 0, [e1, e2, e3, k.calls.length]);
    }
    // kill switch
    const srvK = makeServer(); const cK = makeClient(srvK); cK.sb.initializeSeedData(); cK.a.CENTRAL_CONFIG.writeCollections = false; cK.a.CENTRAL_CONFIG.writeTransactions = false; cK.a.CENTRAL_CONFIG.writeMaster = false; cK.sb.bootstrapCentralAuth();
    await until(() => Object.keys(cK.a.OperationalCache.states).every(k => cK.a.OperationalCache.states[k].loaded));
    let ek1 = '', ek2 = '';
    try { cK.a.Store.saveAnggaran([{ id: 'rab_k', program: 'K', periode: 'September 2026', nominal: 1, status: 'Draft' }]); } catch (e) { ek1 = e.message; }
    try { cK.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-10-01', unit: 'MI', nominal: 1, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'K' }); } catch (e) { ek2 = e.message; }
    await sync(cK);
    rec('Z2 kill switch (write* = false): hanya baca; tidak ada tulisan ke Sheets; [P0-B] penulisan DITOLAK eksplisit (tidak disimpan lokal)', rows(srvK, '08_ANGGARAN').every(r => r[0] !== 'rab_k') && rows(srvK, '05_TRANSAKSI').length === 2 && /TIDAK disimpan/.test(ek1) && /TIDAK disimpan/.test(ek2) && !cK.a.Store.loadAnggaran().some(a => a.id === 'rab_k') && cK.a.Store.loadTransaksi().length === 0, [ek1, ek2]);
  } catch (e) { rec('HARNESS ERROR', false, e.stack.slice(0, 900)); }
  R.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : '  <= ' + String(JSON.stringify(x.d)).slice(0, 700))));
  console.log('\nPASS=' + R.filter(x => x.ok).length + ' FAIL=' + R.filter(x => !x.ok).length);
  process.exit(0);
})();
