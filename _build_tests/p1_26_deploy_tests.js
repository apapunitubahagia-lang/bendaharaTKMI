/* Suite ARTEFAK DEPLOY (P1_26; sandbox Node). TIDAK men-deploy apa pun.
 * build_deploy.js membuat artefak tanpa fungsi uji; check_deploy.js memverifikasi D1..D6. Uji negatif memastikan pemeriksa GAGAL bila
 * fungsi uji / fungsi publik tak bergerbang / berkas harness / kontrak klien rusak ikut masuk.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const { OUT, makeServer } = require('./srv_env.js');
const { checkDeploy } = require('./check_deploy.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const DIR = path.join(OUT, '_deploy_out_uji');
const b = cp.spawnSync('node', ['build_deploy.js', DIR], { cwd: __dirname, encoding: 'utf8' });
const ok = res => res.every(r => r.ok), gagal = res => res.filter(r => !r.ok).map(r => r.id);
{ const res = checkDeploy(DIR); const man = JSON.parse(fs.readFileSync(path.join(DIR, 'MANIFEST.json'), 'utf8'));
  rec('DP-01', 'artefak dibangun: 29 .gs + 2 .html + MANIFEST; 8 fungsi uji/diagnostik dibuang; D1..D6 PASS (termasuk smoke runtime: identitas, transaksi, arsip, kewajiban, FCC, setup uang muka; AUDITOR ditolak; tanpa sesi AUTH_REQUIRED)',
    b.status === 0 && ok(res) && man.dibuang.length === 8, J({ gagal: gagal(res), dibuang: man.dibuang.map(x => x.fungsi) })); }
function salin(nama, mut) {
  const d = path.join(OUT, '_deploy_out_' + nama); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d);
  fs.readdirSync(DIR).forEach(f => fs.copyFileSync(path.join(DIR, f), path.join(d, f)));
  mut(d);
  const man = JSON.parse(fs.readFileSync(path.join(d, 'MANIFEST.json'), 'utf8'));
  Object.keys(man.berkas).forEach(f => { if (fs.existsSync(path.join(d, f))) man.berkas[f].sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f), 'utf8')).digest('hex'); });
  fs.writeFileSync(path.join(d, 'MANIFEST.json'), JSON.stringify(man)); const res = checkDeploy(d); fs.rmSync(d, { recursive: true, force: true }); return res;
}
const tambah = (d, f, kode) => fs.appendFileSync(path.join(d, f), '\n' + kode + '\n');
{ const r = salin('n1', d => tambah(d, 'Code.gs', "function TEST_BACKDOOR() { return 'x'; }"));
  rec('DP-02', 'negatif: fungsi uji publik (TEST_*) ditambahkan ke artefak -> D2 & D3 GAGAL', gagal(r).includes('D2') && gagal(r).includes('D3'), J(gagal(r))); }
{ const r = salin('n2', d => tambah(d, 'OperationalAPI.gs', "function bacaSemuaTransaksi() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('05_TRANSAKSI').getDataRange().getValues(); }"));
  rec('DP-03', 'negatif: fungsi publik TANPA gerbang (nama tidak mengandung "test") membaca sheet -> D3 GAGAL (nama tidak dianggap aman otomatis)', gagal(r).includes('D3') && !gagal(r).includes('D2'), J(r.find(x => x.id === 'D3').d.takTerklasifikasi)); }
{ const r = salin('n3', d => tambah(d, 'TransactionEngine.gs', "function apaSaja_() { return createTransactionWithAllocations_(null, { testMode: true }); }"));
  rec('DP-04', 'negatif: penyala testMode (audit dialihkan dari 13_AUDIT_LOG) di fungsi privat bernama netral -> D2 GAGAL', gagal(r).includes('D2'), J(r.find(x => x.id === 'D2').d.penanda)); }
{ const r = salin('n4', d => fs.copyFileSync(path.join(OUT, '_live_tests', 'LiveReadiness.gs'), path.join(d, 'LiveReadiness.gs')));
  rec('DP-05', 'negatif: berkas harness salinan uji (LiveReadiness.gs) ikut -> D1 GAGAL', gagal(r).includes('D1'), J(r.find(x => x.id === 'D1').d)); }
{ const r = salin('n5', d => { const p = path.join(d, 'AdminAPI.gs'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^function opUserList\(/m, 'function opUserListLama(')); });
  rec('DP-06', 'negatif: fungsi yang dipanggil klien (ServerBridge) hilang dari artefak -> D4 GAGAL (dependensi runtime terdeteksi)', gagal(r).includes('D4'), J(r.find(x => x.id === 'D4').d.tidakAda)); }
{ const src = fs.readFileSync(OUT + 'TransactionEngine.gs', 'utf8');
  const s = makeServer(); s.sb.HtmlService = { createHtmlOutputFromFile: n => ({ getContent: () => '<script>' + n + '</script>' }) };
  let lain; try { s.sb.include('Bendahara_V2'); lain = 'TIDAK_DITOLAK'; } catch (e) { lain = 'DITOLAK'; }
  rec('DP-07', 'sumber tidak dipangkas (pemangkasan hanya di artefak; sandbox tetap menguji sumber lengkap); include("ServerBridge") berfungsi, nama lain ditolak',
    /function testConcurrentWriteDoor_\(/.test(src) && s.sb.include('ServerBridge') === '<script>ServerBridge</script>' && lain === 'DITOLAK', lain); }
fs.rmSync(DIR, { recursive: true, force: true });
const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
