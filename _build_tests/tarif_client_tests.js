/* Tes statis: UI Bendahara_V2.html (skrip HTML ASLI) -> ServerBridge (stub JSON round-trip) -> kode GAS ASLI di mock Sheets.
   Seed mirip live (komponen/tarif produksi dibaca read-only). TIDAK menyentuh Google Sheets produksi. */
const fs = require('fs'), vm = require('vm');
const { liveLike, clone, obl, setBlob } = require('./live_seed.js');
const { OUT } = require('./srv_env.js');
const SC = __dirname + '/';
const R = []; const rec = (n, ok, d) => R.push({ n, ok: !!ok, d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 150); i++) { if (cond()) return true; await tick(2); } return false; }
const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8').replace(/\r/g, '');
const js = html.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
const bridgeNames = [...fs.readFileSync(OUT + 'ServerBridge.js', 'utf8').matchAll(/^    ([A-Za-z]+): function/gm)].map(m => m[1]);
const rows = (s, n) => s.sheets[n].slice(1);
const col = (s, sh, h) => s.sheets[sh][0].indexOf(h);
const sum = a => a.reduce((x, y) => x + Number(y || 0), 0);

function makeClient(srv, opts) {
  opts = opts || {}; const store = opts.store || {}; const els = {}; const fields = {};
  const gen = id => ({ id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '', textContent: '', value: '', href: '', download: '', appendChild() {}, removeChild() {}, click() {} });
  const el = id => (els[id] = els[id] || gen(id));
  const dyn = new Set(['toast', 'modalOverlay', 'modalBody', 'content', 'pageSub', 'pageTitle', 'navlist', 'periodeBadge', 'authStatusBadge', 'pdSchemaOut', 'pdLegacyOut', 'pdOblOut', 'pdUsersOut', 'pdCutoverOut', 'fccVerifyOut', 'pdTarifOut']);
  const document = { getElementById(id) { if (id in fields) return { value: fields[id], files: [] }; if (dyn.has(id)) return el(id); return null; }, querySelector() { return null; }, addEventListener() {}, createElement: () => gen('x'), body: gen('body') };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const calls = [];
  const rpc = (name, args) => Promise.resolve().then(() => { calls.push(name); const a = JSON.parse(JSON.stringify(args || [])); const out = srv.sb[name](...a); return out === undefined ? out : JSON.parse(JSON.stringify(out)); });
  const bridge = {}; bridgeNames.forEach(n => { bridge[n] = (...args) => rpc(n, args); });
  const sbx = { console: { log() {}, error() {}, warn() {} }, localStorage, document, Date, Math, JSON, Object, Array, Number, String, Boolean, Error, RegExp, Promise, Set, Map, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, addEventListener() {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} }, Blob: function () {}, TextEncoder };
  if (!opts.noBridge) sbx.ServerBridge = bridge;
  sbx.window = sbx; sbx.globalThis = sbx; vm.createContext(sbx);
  const probe = ['Store', 'MasterAPI', 'OperationalAPI', 'OperationalCache', 'CentralAuth', 'CentralMasterData', 'CentralSync', 'CENTRAL_CONFIG', 'State', 'CC_MEM'].map(n => `try{__a.${n}=${n};}catch(e){}`).join('\n');
  vm.runInContext(js + '\n;globalThis.__a={};\n' + probe, sbx);
  return { sb: sbx, a: sbx.__a, store, fields, el, toast: () => el('toast').textContent, calls };
}
const sync = async c => { await c.sb.centralRunSync(true); await tick(5); };
const boot = async (srv, opts) => { const c = makeClient(srv, opts); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded)); return c; };
const cObl = (c, sid, per) => c.sb.kewajibanForSiswa(sid, per);
const annualSum = rs => sum(rs.filter(r => r.komponenId.indexOf('kmp_thn_') === 0).map(r => r.netto));

(async () => {
  try {
    // ================= bootstrap + skema + rencana =================
    const srv = liveLike(); const c = await boot(srv), A = c.a;
    rec('U0 bootstrap dari data mirip live: 14 sheet operasional + master termuat, siswa & komponen dibaca dari server', A.CentralMasterData.ready && A.MasterAPI.students().length === 15 && A.MasterAPI.components().length === 10);
    ['beranda', 'transaksi', 'siswa', 'laporan', 'anggaran', 'pengaturan'].forEach(p => { try { A.State.page = p; c.sb.renderContent(); } catch (e) { rec('U0 render ' + p, false, e.message); } });
    let hb = c.sb.renderPengaturanBackup();
    rec('U1 panel "Tarif & Kewajiban" + "Hari Katering" + "Klasifikasi" tampil di Pengaturan > Backup; render tanpa galat', /Tarif &amp; Kewajiban 2026\/2027/.test(hb) && /Hari Katering Terjadwal MI/.test(hb) && /Klasifikasi Pendaftaran Siswa/.test(hb) && /Lihat rencana/.test(hb), hb.slice(0, 120));
    const before = JSON.stringify(srv.sheets);
    await c.sb.pdTarifPlan();
    const out = c.el('pdTarifOut').innerHTML;
    rec('U2 "Lihat rencana" (dry-run) menampilkan ringkasan, pemeriksaan total (COCOK), 6 tarif lump dinonaktifkan, laporan dampak, 10 butir konfirmasi, peringatan skema; TIDAK menulis ke sheet', /dry-run/.test(out) && /COCOK/.test(out) && /KATERING_FLAT/.test(out) && /Skema belum siap/.test(out) && /Laporan dampak/.test(out) && JSON.stringify(srv.sheets) === before, out.slice(0, 300));
    await c.sb.pdTarifApplyConfirmed(); await tick(5);
    rec('U3 menerapkan sebelum migrasi skema ditolak oleh server (pesan jelas), tidak ada perubahan', /SCHEMA_ADDITIVE_REQUIRED|Kolom belum ada|migrasi/i.test(c.toast() + c.el('pdTarifOut').innerHTML) && rows(srv, '02_KOMPONEN').length === 10 && JSON.stringify(srv.sheets['03_TARIF']) === JSON.stringify(JSON.parse(before)['03_TARIF']), c.toast());
    await c.sb.pdSchemaApplyConfirmed();
    await c.sb.pdTarifApplyConfirmed(); await tick(5);
    rec('U4 setelah migrasi aditif, penerapan rencana: server menulis 31 komponen + 95 tarif, 6 tarif lump Nonaktif; UI memuat ulang master (41 komponen)', rows(srv, '02_KOMPONEN').length === 41 && rows(srv, '03_TARIF').length === 113 && A.MasterAPI.components().length === 41 && A.MasterAPI.tariffs().filter(t => t.status === 'Nonaktif').length === 6, [rows(srv, '02_KOMPONEN').length, A.MasterAPI.components().length, c.toast()]);
    rec('U5 komponen baru membawa sasaran/basisTarif/menggantikan sampai ke klien (normalizer)', A.MasterAPI.components().find(k => k.id === 'kmp_katering_harian').basisTarif === 'PER_HARI_TERJADWAL' && A.MasterAPI.components().find(k => k.id === 'kmp_masuk_tk_komite').sasaran === 'BARU' && A.MasterAPI.components().find(k => k.id === 'kmp_thn_buku').menggantikan === 'kmp_pendidikan');
    // ================= katering =================
    A.State.page = 'pengaturan'; hb = c.sb.renderPengaturanBackup();
    Object.assign(c.fields, { cth_0: '20', cth_1: '18', cth_2: '21' });
    for (let i = 3; i < 12; i++) c.fields['cth_' + i] = '';
    c.fields.cth_1 = '18.5'; c.sb.pdCateringSave();
    rec('U6 hari katering non-bulat ditolak (pesan), tidak ada antrean', /bilangan bulat/.test(c.toast()) && c.sb.centralPendingCount() === 0, c.toast());
    c.fields.cth_1 = '45'; c.sb.pdCateringSave(); rec('U6b hari katering > 31 ditolak', /0-31/.test(c.toast()));
    c.fields.cth_1 = '18'; c.sb.pdCateringSave(); await sync(c);
    const sMap = {}; rows(srv, '15_SETTINGS').forEach(r => sMap[r[0]] = r[1]);
    rec('U7 hari katering tersimpan ke 15_SETTINGS (blob.cateringHari.*) dan terbaca server', /"MI\|Juli 2026":20/.test(sMap['blob.cateringHari.0'] || '') && srv.sb.opObligations({ siswaId: 'mi1a', periode: 'Juli 2026' }).data.rows.some(r => r.komponenId === 'kmp_katering_harian' && r.netto === 260000), sMap['blob.cateringHari.0']);
    const k1 = cObl(c, 'mi1a', 'Juli 2026').find(o => o.komponenId === 'kmp_katering_harian');
    rec('U8 klien menghitung katering sama: K1 Juli 20 hari x 13.000 = 260.000; jumlah hari & tarif satuan tercatat; K5 Agustus 18 x 11.000 = 198.000', k1 && k1.netto === 260000 && k1.jumlahHari === 20 && k1.tarifSatuan === 13000 && cObl(c, 'mi5a', 'Agustus 2026').find(o => o.komponenId === 'kmp_katering_harian').netto === 198000);
    // ================= klasifikasi =================
    hb = c.sb.renderPengaturanBackup();
    const studs = A.MasterAPI.students().filter(s => (s.status || 'Aktif') === 'Aktif' && (s.tahunAjaran || '2026/2027') === '2026/2027');
    studs.forEach((s, i) => { c.fields['kls_' + i] = s.id === 'tkb' ? 'BARU' : s.id === 'tkc' ? 'DAFTAR_ULANG' : s.id === 'mi1b' ? 'BARU' : ''; });
    c.sb.pdKlasifikasiSave(); await sync(c);
    rec('U9 klasifikasi disimpan (blob.pendaftaranStatus) dan dibaca server; biaya masuk TK baru 3.000.000 muncul hanya untuk tkb', srv.sb.opObligations({ siswaId: 'tkb' }).data.rows.filter(r => /^kmp_masuk_tk/.test(r.komponenId)).length === 7 && sum(srv.sb.opObligations({ siswaId: 'tkb' }).data.rows.filter(r => /^kmp_masuk_tk/.test(r.komponenId)).map(r => r.netto)) === 3000000 && !srv.sb.opObligations({ siswaId: 'tka' }).data.rows.some(r => /^kmp_masuk_tk/.test(r.komponenId)));
    // ================= klien vs server (diferensial) =================
    await c.sb.pdVerifyObl();
    const vr = c.el('pdOblOut').innerHTML;
    rec('U10 verifikasi kewajiban klien vs server (periode aktif + SEMUA non-bulanan: tahunan, biaya masuk, daftar ulang, lump beku, katering per hari): COCOK, 0 perbedaan', /COCOK/.test(vr) && !/perbedaan/.test(vr), vr.slice(0, 400));
    const vr2 = await c.sb.centralVerifyObligations();
    rec('U10b jumlah baris dibandingkan > 150 (cakupan nyata, bukan kosong)', vr2.ok && vr2.jumlahKlien > 150 && vr2.jumlahKlien === vr2.jumlahServer && vr2.diffs.length === 0, [vr2.jumlahKlien, vr2.jumlahServer, vr2.diffs.slice(0, 3)]);
    // ================= alokasi dari UI =================
    const t1 = c.sb.postTransaksi({ jenis: 'PENERIMAAN', tanggal: '2026-09-12', unit: 'MI', nominal: 700000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa' });
    await sync(c); const gid = c.sb.centralResolveTrxId(t1.id);
    const pick = (sid, komp, per) => cObl(c, sid).find(o => o.komponenId === komp && o.periode === per);
    const spp = pick('mi5a', 'kmp_spp', 'Juli 2026'), kat = pick('mi5a', 'kmp_katering_harian', 'Juli 2026'), ek = pick('mi5a', 'kmp_thn_ekskul', 'Tahun Ajaran 2026/2027');
    let err = ''; try { c.sb.createAlokasi(gid, [{ ob: spp, nominal: 200000, caraBayar: 'cicilan' }, { ob: spp, nominal: 100000, caraBayar: 'cicilan' }]); } catch (e) { err = e.message; }
    rec('U11 UI: dua baris pada kewajiban yang sama melebihi sisa (200.000+100.000 > 250.000) ditolak dengan pesan; tidak ada alokasi tersimpan', /Total alokasi/.test(err) && c.a.OperationalAPI.alokasi().filter(a => a.transaksiId === gid).length === 0, err);
    err = ''; try { c.sb.createAlokasi(gid, [{ ob: Object.assign({}, spp, { key: 'mi5a|kmp_spp|Desember 2030', periode: 'Desember 2030' }), nominal: 1000, caraBayar: 'cicilan' }]); } catch (e) { err = e.message; }
    rec('U12 UI: alokasi ke kewajiban yang tidak ada ditolak dengan pesan', /tidak ditemukan/.test(err), err);
    c.sb.createAlokasi(gid, [{ ob: spp, nominal: 250000, caraBayar: 'lunas' }, { ob: kat, nominal: 220000, caraBayar: 'lunas' }, { ob: ek, nominal: 100000, caraBayar: 'cicilan' }]); await sync(c);
    const alkSrv = rows(srv, '06_ALOKASI').filter(r => r[1] === gid);
    rec('U13 pembayaran gabungan dari UI: 3 alokasi (SPP, katering, ekskul tahunan) tertulis ke server dengan komponen+periode yang benar; total 570.000 <= 700.000; sisa dana 130.000 belum dialokasikan', alkSrv.length === 3 && sum(alkSrv.map(r => r[5])) === 570000 && alkSrv.some(r => r[3] === 'kmp_katering_harian' && r[4] === 'Juli 2026' && r[5] === 220000) && c.sb.computeTransaksiAllocationStatus(gid) !== 'TERALOKASI', alkSrv);
    const sisaKlien = c.sb.sisaObligation(pick('mi5a', 'kmp_spp', 'Juli 2026')), sisaSrv = srv.sb.opObligations({ siswaId: 'mi5a', periode: 'Juli 2026' }).data.rows.find(r => r.komponenId === 'kmp_spp').sisa;
    rec('U14 sisa kewajiban klien = server setelah sinkron (SPP Juli sisa 0)', sisaKlien === 0 && sisaSrv === 0);
    // alokasi buruk yang lolos klien tetapi ditolak guard server -> ditahan (blocked), tidak diulang tanpa henti, tidak menulis
    const arrA = c.a.Store.loadAlokasi(); arrA.push({ id: 'alk_bad', transaksiId: gid, siswaId: 'mi5a', komponenId: 'kmp_spp', periode: 'Desember 2030', nominal: 1000, _pendingSync: true }); c.a.Store.saveAlokasi(arrA);
    const n06 = rows(srv, '06_ALOKASI').length; await sync(c); await sync(c);
    const bad = c.a.Store.loadAlokasi().find(a => a.id === 'alk_bad');
    rec('U15 alokasi tak valid yang lolos ke antrean ditolak guard server: ditandai gagal (_syncBlocked, pesan OBLIGATION_NOT_FOUND), tidak ada baris tertulis, tidak diulang', bad && bad._syncBlocked === true && /OBLIGATION_NOT_FOUND|Kewajiban tidak ditemukan/.test(bad._syncError || '') && rows(srv, '06_ALOKASI').length === n06 && bad._syncAttempts === 1, bad);
    c.a.Store.saveAlokasi(c.a.Store.loadAlokasi().filter(a => a.id !== 'alk_bad'));
    // ================= snapshot tagihan UI =================
    Object.assign(c.fields, { gt_periode: 'Agustus 2026', gt_komponen: 'Katering MI (per hari terjadwal)', gt_jatuhtempo: '2026-08-10' });
    c.sb.submitGenerateTagihan(); await sync(c);
    const kw = rows(srv, '04_KEWAJIBAN').filter(r => r[col(srv, '04_KEWAJIBAN', 'komponenId')] === 'kmp_katering_harian' && r[col(srv, '04_KEWAJIBAN', 'periode')] === 'Agustus 2026');
    rec('U16 terbitkan snapshot katering Agustus: 12 siswa MI beku dengan tarifSatuan (13.000/11.000) dan jumlahHari 18 tersimpan; TK tidak ikut', kw.length === 12 && kw.every(r => r[col(srv, '04_KEWAJIBAN', 'jumlahHari')] === 18 && [13000, 11000].includes(r[col(srv, '04_KEWAJIBAN', 'tarifSatuan')]) && r[col(srv, '04_KEWAJIBAN', 'unit')] === 'MI'), kw.length);
    c.sb.submitGenerateTagihan();
    rec('U17 terbit ulang: tidak ada duplikat', rows(srv, '04_KEWAJIBAN').filter(r => r[col(srv, '04_KEWAJIBAN', 'komponenId')] === 'kmp_katering_harian' && r[col(srv, '04_KEWAJIBAN', 'periode')] === 'Agustus 2026').length === 12);
    Object.assign(c.fields, { cth_0: '20', cth_1: '17', cth_2: '21' }); c.sb.pdCateringSave(); await sync(c);
    rec('U18 mengubah hari Agustus 18 -> 17 SETELAH snapshot: kewajiban beku tetap 18 hari (tidak berubah diam-diam), sisa data menunjukkan nilai beku di klien dan server', cObl(c, 'mi4a', 'Agustus 2026').find(o => o.komponenId === 'kmp_katering_harian').jumlahHari === 18 && srv.sb.opObligations({ siswaId: 'mi4a', periode: 'Agustus 2026' }).data.rows.find(r => r.komponenId === 'kmp_katering_harian').jumlahHari === 18);
    Object.assign(c.fields, { cth_1: '18' }); c.sb.pdCateringSave(); await sync(c);
    // ================= naik tahun ajaran =================
    const o6old = cObl(c, 'mi6b').length;
    c.a.Store.saveSettings(Object.assign({}, c.a.Store.loadSettings(), { tahunAjaranAktif: '2027/2028' })); await sync(c);
    const sis = A.MasterAPI.students().find(s => s.id === 'mi6b');
    Object.assign(c.fields, { sif_nama: sis.nama, sif_nis: '', sif_nisn: sis.nisn, sif_kelas: '6 Syeikh Kelas 6', sif_unit: 'MI', sif_wali: '', sif_kontak: '', sif_status: 'Aktif' });
    c.sb.submitSiswaForm('mi6b'); await sync(c); await tick(10);
    const frozen6 = rows(srv, '04_KEWAJIBAN').filter(r => r[col(srv, '04_KEWAJIBAN', 'siswaId')] === 'mi6b');
    rec('U19 mengubah tahun ajaran siswa lewat UI membekukan kewajiban TA lama lebih dulu (otomatis): baris beku tertulis ke 04_KEWAJIBAN sebelum perubahan master; audit tercatat', frozen6.length >= 4 && srv.sheets['01_SISWA'].find(r => r[0] === 'mi6b')[col(srv, '01_SISWA', 'tahunAjaran')] === '2027/2028' && cObl(c, 'mi6b').some(o => o.periode === 'Juli 2026' && o.komponenId === 'kmp_spp'), [frozen6.length, cObl(c, 'mi6b').length, o6old]);
    rec('U20 sesudah naik TA, klien = server untuk siswa tsb (verifikasi menyeluruh siswa itu COCOK)', (() => { const cl = cObl(c, 'mi6b').map(o => o.key + '|' + o.netto).sort().join(), sv = srv.sb.opObligations({ siswaId: 'mi6b' }).data.rows.map(o => o.key + '|' + o.netto).sort().join(); return cl === sv; })());
    c.a.Store.saveSettings(Object.assign({}, c.a.Store.loadSettings(), { tahunAjaranAktif: '2026/2027' })); await sync(c);
    // ================= anggaran terhubung =================
    const fa = (o) => Object.assign(c.fields, { agf_jenis: 'PENGELUARAN', agf_unit: 'MI', agf_program: 'Uji', agf_periode: 'September 2026', agf_nominal: '1000', agf_komponen: '', agf_kategori: '', agf_subkategori: '', agf_status: 'Diajukan' }, o);
    const nAng = () => Object.keys(JSON.parse(c.store['draBendaharaV2_central_pending_anggaran'] || '{}')).length;
    const cases = [
      [{ agf_unit: '' }, /Unit/], [{ agf_jenis: 'PEMASUKAN', agf_komponen: '' }, /komponen penerimaan/], [{ agf_kategori: '' }, /kategori pengeluaran/],
      [{ agf_jenis: 'PEMASUKAN', agf_komponen: 'kmp_spp', agf_kategori: 'ATK' }, /tidak memakai kategori/], [{ agf_kategori: 'ATK', agf_subkategori: 'TidakAda' }, /Subkategori bukan milik/], [{ agf_jenis: 'PEMASUKAN', agf_unit: 'TK', agf_komponen: 'kmp_ekskul' }, /hanya berlaku untuk unit MI/], [{ agf_kategori: 'ATK', agf_komponen: 'kmp_spp' }, /tidak memakai komponen/]
    ];
    let allRejected = true, why = [];
    const clr = () => Object.keys(c.fields).forEach(k => { delete c.fields[k]; });
    cases.forEach(([o, re]) => { clr(); fa(o); c.sb.submitAnggaran(); if (!re.test(c.toast())) { allRejected = false; why.push([o, c.toast()]); } });
    clr();
    rec('U21 validasi anggaran: tanpa unit / pemasukan tanpa komponen / pengeluaran tanpa kategori / campur pemasukan-pengeluaran / subkategori salah / komponen beda unit -> semua ditolak dengan pesan', allRejected && nAng() === 0, why);
    const mkAng = o => { fa(o); c.sb.submitAnggaran(); };
    mkAng({ agf_jenis: 'PEMASUKAN', agf_program: 'Penerimaan SPP MI', agf_komponen: 'kmp_spp', agf_nominal: '5000000' });
    mkAng({ agf_program: 'ATK Kertas', agf_kategori: 'ATK', agf_subkategori: 'Kertas', agf_nominal: '400000' });
    mkAng({ agf_jenis: 'PEMASUKAN', agf_program: 'Penerimaan tahunan K5', agf_periode: 'Tahun Ajaran 2026/2027', agf_komponen: 'kmp_thn_ekskul', agf_nominal: '1200000' });
    await sync(c);
    const angRows = rows(srv, '08_ANGGARAN');
    rec('U22 anggaran valid tersimpan ke 08_ANGGARAN dengan jenis + komponenId (pemasukan) / kategori + subkategori (pengeluaran) + unit; baris lama tidak berubah', angRows.length === 4 && angRows.some(r => r[col(srv, '08_ANGGARAN', 'jenis')] === 'PEMASUKAN' && r[col(srv, '08_ANGGARAN', 'komponenId')] === 'kmp_spp') && angRows.some(r => r[col(srv, '08_ANGGARAN', 'subkategori')] === 'Kertas' && r[col(srv, '08_ANGGARAN', 'kategori')] === 'ATK') && angRows[0][0] === 'ang_1' && angRows[0][5] === 1000000, angRows.length);
    // transaksi aktual
    c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-14', unit: 'MI', nominal: 300000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', subkategori: 'Kertas', penerima: 'Toko' });
    c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-15', unit: 'MI', nominal: 120000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Toko B' });
    c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-16', unit: 'MI', nominal: 77000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'Lainnya', penerima: 'X' });
    c.sb.postTransaksi({ jenis: 'PENGELUARAN', tanggal: '2026-09-17', unit: 'TK', nominal: 50000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'Y' });
    const t2 = c.sb.postTransaksi({ jenis: 'PENERIMAAN', tanggal: '2026-09-18', unit: 'MI', nominal: 500000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa' });
    await sync(c); const gid2 = c.sb.centralResolveTrxId(t2.id);
    c.sb.createAlokasi(gid2, [{ ob: pick('mi4a', 'kmp_spp', 'September 2026'), nominal: 250000, caraBayar: 'lunas' }]);
    const t3 = c.sb.postTransaksi({ jenis: 'PENERIMAAN', tanggal: '2026-09-19', unit: 'MI', nominal: 400000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa' }); await sync(c);
    c.sb.createAlokasi(c.sb.centralResolveTrxId(t3.id), [{ ob: pick('mi4b', 'kmp_thn_ekskul', 'Tahun Ajaran 2026/2027'), nominal: 100000, caraBayar: 'cicilan' }, { ob: pick('mi4b', 'kmp_spp', 'September 2026'), nominal: 250000, caraBayar: 'lunas' }]);
    // komitmen terhubung ke RAB pengeluaran
    const ragId = A.Store.loadAnggaran().find(a => a.program === 'ATK Kertas').id;
    Object.assign(c.fields, { obf_uraian: 'Pesan kertas', obf_nominal: '90000', obf_status: 'COMMITTED', obf_rab: ragId }); c.sb.submitObligasi(); await sync(c);
    const fr = c.sb.fccCompute_('September 2026', c.sb.centralFccData_('September 2026')), ab = fr.anggaranVsAktual;
    const rowOf = (j, nama) => ab.rows.find(r => r.jenis === j && r.nama.indexOf(nama) === 0);
    const lSpp = rowOf('PEMASUKAN', 'SPP'), lEk = rowOf('PEMASUKAN', 'Ekskul'), lKer = rowOf('PENGELUARAN', 'ATK / Kertas'), lAtk = ab.rows.find(r => r.jenis === 'PENGELUARAN' && r.nama === 'ATK');
    rec('U23 pemasukan SPP MI Sep: anggaran 5.000.000; aktual = ALOKASI SPP yang DIBAYAR pada September (250.000 + 250.000 + 250.000 pembayaran SPP Juli yang dibayar Sep = 750.000, basis kas), BUKAN nominal transaksi (1.600.000); tagihan SPP MI terpisah', lSpp && lSpp.anggaran === 5000000 && lSpp.aktual === 750000 && lSpp.tagihan > 0 && lSpp.komitmen === null, lSpp);
    rec('U24 anggaran tahunan (periode "Tahun Ajaran 2026/2027") dibandingkan dengan alokasi atas kewajiban periode itu (ekskul: 100.000 + 100.000 dari mi5a lama?), tidak ikut garis bulanan', lEk && lEk.periode === 'Tahun Ajaran 2026/2027' && lEk.aktual === 200000 && !ab.rows.some(r => r.jenis === 'PEMASUKAN' && /Ekskul/.test(r.nama) && r.periode === 'September 2026'), lEk);
    rec('U25 pengeluaran: "ATK / Kertas" aktual 300.000 (hanya subkategori Kertas), komitmen 90.000 di kolom TERPISAH, tidak dijumlahkan ke aktual; "ATK" (tanpa sub) aktual 120.000, unit TK tidak ikut', lKer && lKer.aktual === 300000 && lKer.komitmen === 90000 && lKer.selisih === 400000 - 300000 - 90000 && lAtk && lAtk.aktual === 120000 && lAtk.unit === 'MI', [lKer, lAtk]);
    rec('U26 pengeluaran tanpa anggaran dilaporkan terpisah (Lainnya MI 77.000; ATK TK 50.000), penerimaan belum dialokasikan dipisah (900.000 - 500.000 - sisa dana transaksi lain)', ab.transaksiTanpaAnggaran.some(x => x.kategori === 'Lainnya' && x.total === 77000) && ab.transaksiTanpaAnggaran.some(x => x.kategori === 'ATK' && x.unit === 'TK' && x.total === 50000) && ab.pemasukanBelumDialokasi.total > 0, ab.pemasukanBelumDialokasi);
    rec('U27 tidak ada pencampuran: anggaran, komitmen, tagihan, aktual berada di kolom berbeda; aktual pengeluaran tidak berubah oleh komitmen/anggaran', lKer.aktual === 300000 && lSpp.anggaran !== lSpp.aktual);
    A.State.page = 'laporan'; A.State.laporanTab = 'kontrol'; c.sb.renderContent();
    const fcc = c.el('content').innerHTML;
    rec('U28 Financial Control Center menampilkan "Anggaran vs Aktual per Komponen / Kategori" + peringatan tanpa-anggaran; render tanpa galat', /Anggaran vs Aktual per Komponen/.test(fcc) && /TANPA anggaran/.test(fcc) && /Penerimaan belum dialokasikan/.test(fcc) && !/Terjadi kesalahan render/.test(fcc));
    const vm2 = await c.sb.centralFccVerify();
    rec('U29 FCC klien = FCC server (termasuk baris anggaran vs aktual)', /Cocok/.test(vm2 || ''), vm2);
    A.State.page = 'anggaran'; A.State.anggaranTab = 'banding'; c.sb.renderContent();
    rec('U30 tab "Anggaran vs Aktual" di halaman Anggaran render', /Anggaran vs Aktual per Komponen/.test(c.el('content').innerHTML) && !/Terjadi kesalahan render/.test(c.el('content').innerHTML));
    // ================= verifikasi akhir klien vs server =================
    const vr3 = await c.sb.centralVerifyObligations();
    rec('U31 verifikasi akhir klien vs server setelah semua operasi: COCOK, 0 perbedaan (' + vr3.jumlahKlien + ' baris)', vr3.ok && vr3.diffs.length === 0 && vr3.jumlahKlien > 150, vr3.diffs && vr3.diffs.slice(0, 3));

    // ================= mode lokal (tanpa server) =================
    const srvL = liveLike({ noHistory: true }); const cl = makeClient(srvL, { noBridge: true }); cl.sb.initializeSeedData(); cl.sb.bootstrapCentralAuth(); await tick(10);
    const pl = cl.sb.tpLocalPlan_();
    rec('L1 mode lokal: rencana tarif dry-run bekerja (31 komponen baru) dan TIDAK mengubah Store', pl.plan.ringkasan.komponenAdd === 31 && cl.a.Store.loadTarif().length === 9 && pl.plan.ringkasan.totalsSemuaCocok);
    const ar = cl.sb.tarifApplyLocal_();
    rec('L2 mode lokal: penerapan rencana menambah tepat sebanyak rencana (tarif baru), menonaktifkan lump (tidak ada yang dihapus)', ar.ok && cl.a.Store.loadTarif().length === 9 + pl.plan.ringkasan.tarifAdd && cl.a.Store.loadTarif().filter(t => t.status === 'Nonaktif').length === pl.plan.ringkasan.tarifDeactivate && pl.plan.ringkasan.tarifDeactivate >= 2, [ar, cl.a.Store.loadTarif().length, pl.plan.ringkasan]);
    const ar2 = cl.sb.tarifApplyLocal_(); const nT2 = cl.a.Store.loadTarif().length;
    rec('L3 penerapan lokal ulang idempoten', ar2.ok && cl.a.Store.loadTarif().length === nT2 && ar2.ringkasan.tarifAdd === 0 && ar2.ringkasan.komponenAdd === 0, ar2);
    cl.a.Store.saveSiswa([{ id: 'l1', nama: 'LOKAL K5', nis: '', nisn: '1', kelas: '5 A', unit: 'MI', tahunAjaran: '2026/2027', status: 'Aktif' }, { id: 'l2', nama: 'LOKAL K1', nis: '', nisn: '2', kelas: '1 A', unit: 'MI', tahunAjaran: '2026/2027', status: 'Aktif' }]);
    cl.a.Store.saveCateringHari({ 'MI|Juli 2026': 20 });
    const lo = id => cl.sb.kewajibanForSiswa(id);
    rec('L4 mode lokal: tagihan tahunan K5 = 1.800.000, K1 = 2.200.000, katering K5 Juli = 20 x 11.000 = 220.000, SPP K1 = 350.000 (sumber sama dengan server)', annualSum(lo('l1')) === 1800000 && annualSum(lo('l2')) === 2200000 && lo('l1').find(o => o.komponenId === 'kmp_katering_harian' && o.periode === 'Juli 2026').netto === 220000 && lo('l2').find(o => o.komponenId === 'kmp_spp' && o.periode === 'Juli 2026').netto === 350000, [annualSum(lo('l1')), annualSum(lo('l2'))]);
    const tl = cl.sb.postTransaksi({ jenis: 'PENERIMAAN', tanggal: '2026-09-10', unit: 'MI', nominal: 300000, akunId: cl.sb.akunList()[0].id, metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa' });
    let e2 = ''; try { cl.sb.createAlokasi(tl.id, [{ ob: lo('l1').find(o => o.komponenId === 'kmp_spp' && o.periode === 'Juli 2026'), nominal: 200000, caraBayar: 'cicilan' }, { ob: lo('l1').find(o => o.komponenId === 'kmp_spp' && o.periode === 'Juli 2026'), nominal: 100000, caraBayar: 'cicilan' }]); } catch (e) { e2 = e.message; }
    rec('L5 mode lokal: validasi alokasi batch aktif (jumlah > sisa ditolak)', /Total alokasi/.test(e2), e2);
    cl.sb.createAlokasi(tl.id, [{ ob: lo('l1').find(o => o.komponenId === 'kmp_spp' && o.periode === 'Juli 2026'), nominal: 250000, caraBayar: 'lunas' }]);
    const nl = lo('l1').find(o => o.komponenId === 'kmp_spp' && o.periode === 'Juli 2026');
    rec('L6 mode lokal: alokasi tersimpan, kewajiban lunas, sisa dana transaksi 50.000 tidak masuk kewajiban lain', cl.sb.sisaObligation(nl) === 0 && cl.sb.alokasiForTransaksi(tl.id).reduce((s, a) => s + a.nominal, 0) === 250000 && cl.calls.length === 0, cl.calls.length);
  } catch (e) { rec('HARNESS ERROR', false, e.stack.slice(0, 1200)); }
  R.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : '  <= ' + String(JSON.stringify(x.d)).slice(0, 700))));
  console.log('\nPASS=' + R.filter(x => x.ok).length + ' FAIL=' + R.filter(x => !x.ok).length);
  process.exit(0);
})();
