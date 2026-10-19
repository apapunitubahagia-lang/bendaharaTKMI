/* Suite WIZARD IMPOR V2 (UI -> server, sandbox Node, TIDAK menyentuh Google Sheets). P1-IMP Tahap A-E (klien).
 * Sumber isi tabel / tempel / CSV / XLSX (stored & deflate), pemetaan kolom, pratinjau server, keputusan eksplisit, konfirmasi,
 * potongan + lanjut setelah putus, CONFLICT, unduh baris bermasalah, templat, antrean tinjauan server, jalur lama diblokir.
 */
const zlib = require('zlib');
const { makeServer } = require('./srv_env.js');
const { makeClient } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opImportSetup('BUAT_SHEET_IMPOR'); return s; }
async function boot(srv, opts) { const c = makeClient(srv, opts); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5);
  const doc = c.sb.document, orig = doc.getElementById.bind(doc); c.checked = {}; doc.getElementById = id => (id in c.checked ? { checked: c.checked[id], value: '' } : orig(id));
  c.sb.DecompressionStream = globalThis.DecompressionStream; c.sb.TextDecoder = TextDecoder; c.sb.Uint8Array = Uint8Array;
  return c; }
const S = c => c.a.State.impV2;
const html = c => c.el('modalBody').innerHTML;
async function confirmAll(c) { c.checked.impv2_ok = true; await c.sb.impV2Confirm(); await until(() => S(c).step === 'selesai' || S(c).terputus, 300); }
/* ZIP (deflate) minimal untuk XLSX ber-sharedStrings ala Excel */
function zipDeflate(files) {
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(data), nb = Buffer.from(name), c = crc(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    loc.push(lh, nb, comp); cen.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const all = Buffer.concat(loc.concat([cd, end])); return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

(async () => {
  { const srv = fresh(); const c = await boot(srv); const out = {};
    for (const t of ['penerimaan', 'pengeluaran', 'rab', 'lpj', 'siswa', 'mutasibank', 'rkat']) { c.a.State.impV2 = null; c.a.State.importSession = null; c.sb.openImportWizard(t); out[t] = c.a.State.impV2 ? 'V2:' + c.a.State.impV2.modul : (c.a.State.importSession ? 'lama' : '?'); }
    rec('IC-01', 'routing: 5 modul -> Impor V2 (server); mutasi bank & RKAT tetap wizard lama', J(out) === J({ penerimaan: 'V2:pemasukan', pengeluaran: 'V2:pengeluaran', rab: 'V2:rab', lpj: 'V2:lpj', siswa: 'V2:siswa', mutasibank: 'lama', rkat: 'lama' }), J(out)); }
  { const srv = fresh(); const c = await boot(srv, { noBridge: true }); const r = c.sb.openImportV2('pengeluaran');
    rec('IC-02', 'tanpa server -> impor ditolak (tidak ada simpan lokal)', r === false && /SERVER TIDAK TERHUBUNG/.test(html(c)) && !c.a.State.impV2, 'openImportV2 -> ' + r); }
  { const srv = fresh(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    c.sb.openImportV2('pengeluaran');
    c.sb.impV2FromPaste('Tanggal\tNominal\tPenerima\tUnit\tAkun\tKeterangan\n02/10/2026\t75.000\tToko A\tMI\tKasir\tSpidol\n03/10/2026\t5000\tToko B\tMI\tAkun Fiktif\tAir');
    const peta = J(S(c).peta); await c.sb.impV2Plan(); const h1 = html(c), k1 = J(S(c).plan.ringkasan);
    const btnDisabled = /disabled onclick="impV2Confirm\(\)"/.test(h1);
    c.sb.impV2SetKeputusanSemua('metode', 'Tunai'); c.sb.impV2SetKeputusanSemua('kategori', 'ATK'); c.sb.impV2SetKeputusan(1, 'akunId', 'akun_bank1');
    const stale = S(c).stale; await c.sb.impV2Plan(); const k2 = J(S(c).plan.ringkasan);
    c.checked.impv2_ok = false; const noOk = await c.sb.impV2Confirm();
    await confirmAll(c); const t = rows(srv, '05_TRANSAKSI').slice(n0);
    rec('IC-03', 'tempel dari Excel: peta otomatis, pratinjau server, normalisasi tampil, keputusan eksplisit, konfirmasi wajib', peta === J({ Tanggal: 'tanggal', Nominal: 'nominal', Penerima: 'penerima', Unit: 'unit', Akun: 'akun', Keterangan: 'uraian' }) && /02\/10\/2026&quot; -&gt; &quot;2026-10-02/.test(h1) && btnDisabled && stale && noOk === false && S(c).step === 'selesai' && t.length === 2 && t[1][col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1' && t[0][col(srv, '05_TRANSAKSI', 'tanggal')] === '2026-10-02',
      'peta ' + peta + '; pratinjau1 ' + k1 + '; pratinjau2 ' + k2 + '; tersimpan ' + t.length); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('lpj'); c.sb.impV2StartGrid();
    Object.assign(S(c).grid[0], { tanggal: '2026-02-30', item: 'Nota salah', nominal: '1000', unit: 'MI' }); Object.assign(S(c).grid[1], { tanggal: '05/10/2026', item: 'Nota benar', nominal: '1.500', unit: 'MI', kategori: 'ATK' });
    c.sb.impV2Render(); const gh = html(c); const n = c.sb.impV2FromGrid(); await c.sb.impV2Plan(); const kel = S(c).plan.rows.map(r => r.kelas);
    await confirmAll(c); const L = rows(srv, '19_LPJ');
    const bad = c.sb.impV2MasalahRows_();
    rec('IC-04', 'isi tabel langsung: sel tanggal tidak sah ditandai klien, server menolak; baris sah tersimpan (tanpa transaksi)', /background:#fee2e2/.test(gh) && n === 2 && J(kel) === J(['TOLAK', 'PERINGATAN']) && L.length === 1 && L[0][col(srv, '19_LPJ', 'nominal')] === 1500 && bad.rows.length === 1 && bad.rows[0].slice(-3)[0] === 'TOLAK',
      'kelas ' + J(kel) + ', LPJ tersimpan ' + L.length + ', baris bermasalah ' + J(bad.rows.map(r => r.slice(-3)))); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('rab');
    c.sb.impV2FromCsvText('rab.csv', 'Judul RAB Sekolah\n\nperiode,unit,kategori,program,nominal,status,catatanTemplat\nOktober 2026,MI,ATK,Contoh,1,,CONTOH - baris ini dilewati\n2026/2027,MI,ATK,Kertas A4,500000,DISETUJUI,\n,MI,ATK,Tinta,250000,,');
    const nRows = S(c).rows.length; await c.sb.impV2Plan(); const p1 = S(c).plan.rows.map(r => r.kelas + ':' + r.kode.join(','));
    const saran = S(c).plan.rows[0].keputusanPerlu[0].saran;
    c.sb.impV2SetKeputusan(0, 'periode', saran); c.sb.impV2SetKeputusan(1, 'periode', 'November 2026'); await c.sb.impV2Plan(); await confirmAll(c);
    const A = rows(srv, '08_ANGGARAN').slice(1).map(r => [r[col(srv, '08_ANGGARAN', 'periode')], r[col(srv, '08_ANGGARAN', 'status')], r[col(srv, '08_ANGGARAN', 'source')]]);
    rec('IC-05', 'CSV: baris judul & baris CONTOH dilewati; RAB tahun ajaran mentah -> keputusan eksplisit (saran), status DIAJUKAN', nRows === 2 && /PERIODE_TA_MENTAH/.test(p1[0]) && /PERIODE_KOSONG/.test(p1[1]) && J(A) === J([['Tahun Ajaran 2026/2027', 'DIAJUKAN', 'RAB_IMPORT'], ['November 2026', 'DIAJUKAN', 'RAB_IMPORT']]),
      'baris ' + nRows + ', pratinjau ' + J(p1) + ', tersimpan ' + J(A)); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('siswa');
    const F = c.sb.impV2Template('xlsx'); // menulis templat (stored ZIP) lewat penulis XLSX yang ada
    const bytes = c.sb.buildXlsxWorkbook('Templat', [], ['nama', 'unit', 'kelas', 'nisn', 'tahunAjaran', 'tanggalMasuk', 'jenisKelamin', 'catatanTemplat'],
      [['(nama)', 'MI', '(kelas)', '', '2026/2027', '', '', 'CONTOH - baris ini dilewati'], ['Ahmad XLSX', 'MI', '2B', '4000000001', '2026/2027', 46270, 'L']], []);
    const ok1 = await c.sb.impV2FromXlsxBuffer('siswa.xlsx', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    const r1 = J(S(c).rows.map(r => r.nama)); await c.sb.impV2Plan(); const nz = S(c).plan.rows[0].normalisasi; await confirmAll(c);
    const H = srv.sheets['01_SISWA'][0], s1 = rows(srv, '01_SISWA').find(x => x[H.indexOf('nama')] === 'Ahmad XLSX');
    rec('IC-06', 'XLSX (penulis aplikasi, stored): baris header terdeteksi, CONTOH dilewati, tanggal serial Excel dinormalisasi terlihat & tersimpan', ok1 && F.includes('tanggalMasuk') && r1 === J(['Ahmad XLSX']) && nz.some(n => n.field === 'tanggalMasuk' && n.ke === '2026-09-05') && s1 && s1[H.indexOf('tanggalMasuk')] === '2026-09-05' && s1[H.indexOf('jenisKelamin')] === 'L',
      'baris ' + r1 + ', normalisasi ' + J(nz) + ', tersimpan ' + J(s1)); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pengeluaran');
    const sst = '<?xml version="1.0"?><sst xmlns="x"><si><t>tanggal</t></si><si><t>nominal</t></si><si><t>penerima</t></si><si><t>unit</t></si><si><t>akun</t></si><si><t>metode</t></si><si><t>kategori</t></si><si><t>Toko &amp; Co</t></si><si><t>MI</t></si><si><t>Kasir</t></si><si><t>Tunai</t></si><si><t>ATK</t></si></sst>';
    const sheet = '<?xml version="1.0"?><worksheet><sheetData><row r="1">' + ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((L, i) => '<c r="' + L + '1" t="s"><v>' + i + '</v></c>').join('') + '</row>' +
      '<row r="3"><c r="A3"><v>46297</v></c><c r="B3"><v>125000</v></c><c r="C3" t="s"><v>7</v></c><c r="D3" t="s"><v>8</v></c><c r="E3" t="s"><v>9</v></c><c r="F3" t="s"><v>10</v></c><c r="G3" t="s"><v>11</v></c></row></sheetData></worksheet>';
    const buf = zipDeflate([['[Content_Types].xml', '<Types/>'], ['xl/workbook.xml', '<workbook><sheets><sheet name="Okt" sheetId="1" r:id="rId1"/></sheets></workbook>'], ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>'], ['xl/sharedStrings.xml', sst], ['xl/worksheets/sheet1.xml', sheet]]);
    const ok = await c.sb.impV2FromXlsxBuffer('excel.xlsx', buf); const rr = J(S(c).rows); await c.sb.impV2Plan(); await confirmAll(c);
    const t = rows(srv, '05_TRANSAKSI').find(x => x[col(srv, '05_TRANSAKSI', 'nominal')] === 125000);
    rec('IC-07', 'XLSX Excel (deflate + sharedStrings, lewat DecompressionStream)', ok && /Toko & Co/.test(rr) && S(c).sumber.nama === 'excel.xlsx [Okt]' && t && t[col(srv, '05_TRANSAKSI', 'tanggal')] === '2026-10-02' && t[col(srv, '05_TRANSAKSI', 'penerima')] === 'Toko & Co', rr.slice(0, 160)); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pengeluaran');
    const lines = ['tanggal,nominal,penerima,unit,akun,metode,kategori'].concat(Array.from({ length: 30 }, (_, i) => '2026-09-' + String(1 + i % 28).padStart(2, '0') + ',' + (1000 + i) + ',Toko ' + i + ',MI,Kasir,Tunai,ATK'));
    c.sb.impV2FromCsvText('a.csv', lines.join('\n')); await c.sb.impV2Plan();
    c.fault.mode = 'lostOnce'; c.fault.only = /opImportCommit/; // potongan 1 tersimpan di server, respons hilang
    await confirmAll(c); const putus = J(S(c).terputus), n1 = rows(srv, '05_TRANSAKSI').length - 2;
    await c.sb.impV2RunChunks(S(c).terputus.mulai); await until(() => S(c).step === 'selesai', 300);
    const st = S(c).hasil.map(h => h.status), n2 = rows(srv, '05_TRANSAKSI').length - 2;
    rec('IC-08', 'respons hilang di tengah -> "Lanjutkan" mengirim ulang potongan yang sama: TIDAK_BERUBAH, sisa tersimpan, 0 ganda', putus === J({ mulai: 0 }) && n1 === 20 && n2 === 30 && st.filter(x => x === 'TIDAK_BERUBAH').length === 20 && st.filter(x => x === 'TERSIMPAN').length === 10 && S(c).job.status === 'SELESAI',
      'terputus ' + putus + ', di server setelah putus ' + n1 + ', akhir ' + n2 + ', status ' + J({ TIDAK_BERUBAH: st.filter(x => x === 'TIDAK_BERUBAH').length, TERSIMPAN: st.filter(x => x === 'TERSIMPAN').length })); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pengeluaran');
    c.sb.impV2FromCsvText('b.csv', 'tanggal,nominal,penerima,unit,akun,metode,kategori\n2026-09-03,7000,Toko Z,MI,Kasir,Tunai,ATK'); await c.sb.impV2Plan();
    srv.sb.opCreateExpense({ clientRequestId: 'luar_c1', tanggal: '2026-09-03', unit: 'MI', nominal: 7000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko Z' });
    await confirmAll(c); const n = rows(srv, '05_TRANSAKSI').length;
    rec('IC-09', 'data berubah sejak pratinjau -> CONFLICT ditampilkan, kembali ke pratinjau (stale), tidak ada yang tersimpan', S(c).step === 'pratinjau' && S(c).stale && /CONFLICT/.test(S(c).pesan) && n === 3, S(c).pesan.slice(0, 80)); }
  { const srv = fresh(); const c = await boot(srv); const n0 = rows(srv, '05_TRANSAKSI').length;
    const q = c.a.Store.loadImportQueue(); q.push({ id: 'impq_lama1', type: 'HOLD', importType: 'pengeluaran', row: { tanggal: '2026-09-01', nominal: '9000', uraian: 'X' }, headerMap: { tanggal: 'tanggal', nominal: 'nominal', uraian: 'uraian' }, reason: 'lama', createdAt: '', resolved: false }); c.a.Store.saveImportQueue(q);
    c.sb.resolveImportQueueAsNew('impq_lama1'); for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); }
    rec('IC-10', 'antrean impor LAMA (localStorage) untuk modul V2 tidak dapat diimpor (tanpa akun/kategori bawaan)', rows(srv, '05_TRANSAKSI').length === n0 && /tidak dapat diimpor dari sini/.test(c.toast()), c.toast().slice(0, 90)); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pengeluaran');
    c.sb.impV2FromCsvText('c.csv', 'tanggal,nominal,penerima,unit,akun,metode,kategori\n2026-09-10,42000,Toko KPI,MI,Kasir,Tunai,ATK'); await c.sb.impV2Plan(); await confirmAll(c);
    await until(() => (c.a.OperationalCache.states.transaksi.rows || []).some(r => Number(r.nominal) === 42000), 300);
    const k = c.sb.kpiIndukSummary('September 2026');
    rec('IC-11', 'setelah impor: cache transaksi dimuat ulang dari server; KPI dihitung dari data server (bukan DATA TIDAK TERSEDIA)', (c.a.OperationalCache.states.transaksi.rows || []).some(r => Number(r.nominal) === 42000) && !k.dataUnavailable, 'overall ' + k.overall); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pengeluaran');
    c.sb.impV2FromCsvText('d.csv', 'tanggal,nominal,penerima,unit,akun,metode,kategori\n2026-09-11,1000,Toko D,MI,Kasir,Tunai,ATK\n2026-09-11,1000,Toko D,MI,Kasir,Tunai,ATK'); await c.sb.impV2Plan(); await confirmAll(c);
    await c.sb.openImportReviewV2('pengeluaran'); const h = html(c); const it = srv.sb.opImportReviewList({}).data.items;
    await c.sb.impV2ResolveReview(it[0].id, 'DIABAIKAN', 'pengeluaran'); const it2 = srv.sb.opImportReviewList({}).data.items;
    rec('IC-12', 'antrean tinjauan dibaca dari server & diselesaikan beraudit dari UI', /DUPLIKAT/.test(h) && it.length === 1 && it2.length === 0, 'item ' + it.length + ' -> ' + it2.length); }
  { const srv = fresh(); const c = await boot(srv); c.sb.openImportV2('pemasukan');
    c.sb.impV2FromCsvText('e.csv', 'tanggal,nominal,unit,akun,metode,sumber,Nama Siswa,kelas,SPP\n2026-10-01,200000,MI,Kasir,Tunai,Pembayaran Siswa,ZAHRA,3 Abdul,200000');
    const peta = J(S(c).peta); await c.sb.impV2Plan(); await confirmAll(c);
    const A = rows(srv, '06_ALOKASI').filter(a => a[col(srv, '06_ALOKASI', 'siswaId')] === 's2');
    rec('IC-13', 'pemasukan kolom per-komponen (nama komponen = kolom) -> alokasi lewat AllocationGuard', /"SPP":"komponen:kmp_spp"/.test(peta) && A.length === 1 && A[0][col(srv, '06_ALOKASI', 'periode')] === 'Juli 2026', peta + ' -> alokasi ' + J(A.map(a => [a[4], a[5]]))); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
