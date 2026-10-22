// [P1_26] Pemeriksa artefak deploy (hasil build_deploy.js). Gagal (exit 1) bila:
//  D1 berkas di luar daftar / sha256 tidak cocok MANIFEST;  D2 fungsi uji/diagnostik/harness atau penanda uji ikut terbawa;
//  D3 fungsi publik (dapat dipanggil google.script.run) yang TIDAK terklasifikasi (bergerbang / allowlist beralasan / murni);
//  D4 kontrak klien: nama callServer di ServerBridge & target include() tidak ada di artefak;
//  D5 include() tanpa allowlist;  D6 runtime: artefak dimuat di sandbox dan operasi inti berjalan (tanpa ReferenceError).
// Nama fungsi yang mengandung "test" TIDAK dianggap aman otomatis: semua fungsi publik wajib terklasifikasi.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { SERVER_FILES, OUT, makeServer } = require('./srv_env.js');
const HTML_FILES = ['Bendahara_V2.html', 'ServerBridge.html'];
/* fungsi publik tanpa gerbang yang diizinkan, beserta alasannya */
const PUBLIC_ALLOWLIST = {
  doGet: 'entri web app: menyajikan HTML (data hanya lewat op* bergerbang); ?ping=1 hanya waktu server',
  doPost: 'jalur HTTP lama, DIMATIKAN (LEGACY_DOPOST_ENABLED_ = false) -> LEGACY_BRIDGE_DISABLED',
  include: 'dibatasi INCLUDE_ALLOWLIST_ (ServerBridge)',
  getCurrentUserIdentity: 'identitas pemanggil sendiri (email/peran sesi) - dibutuhkan klien; gagal tertutup'
};
/* fungsi murni ObligationEngine (kode bersama klien/server): publik, tanpa akses sheet langsung; tanpa konteks bergerbang melempar (RD-07) */
const PURE_OBLIGATION = ['allObligationsAllSiswa', 'alokasiTerbayar', 'BULAN_ID_LIST', 'cateringHariFor', 'enumeratePeriodesBulanan', 'keringananPotonganFor', 'kewajibanForSiswa', 'kewajibanSatuBaris',
  'komponenApplicableForUnit', 'komponenDigantikan', 'komponenSasaranOk', 'parsePeriodeLabel', 'pendaftaranStatusFor', 'periodeLabelFromYM', 'resolveObligationMatch', 'sisaObligation', 'statusObligation',
  'tahunAjaranStartYear', 'tarifFor', 'tarifRowFor', 'tingkatFromKelas', 'todayISO'];
const FORBIDDEN_FN = /^(test|TEST_)|ForTest|runFinancialSafetyTests_|regressionCheck_|validateTransactionPayloadPublicWrapper_|^lt[A-Z]/;
const FORBIDDEN_TXT = [/TEST_WRITE_DOOR/, /testMode\s*:\s*true/, /LT_PROD_ID_/, /LIVE_TEST_SNAPSHOT/, /LIVE_TEST_LPJ_SNAPSHOT/];

function fnBodies(src) {
  const out = {}; const re = /^function ([A-Za-z0-9$_]+)\s*\(/gm; let m;
  while ((m = re.exec(src))) { let i = src.indexOf('{', m.index), d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } out[m[1]] = src.slice(i, j); }
  return out;
}
function checkDeploy(dir, opts) {
  opts = opts || {};
  const R = []; const rec = (id, ok, d) => R.push({ id, ok: !!ok, d });
  const expect = SERVER_FILES.concat(HTML_FILES, ['MANIFEST.json']).sort();
  const have = fs.readdirSync(dir).sort();
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8'));
  const shaBad = SERVER_FILES.concat(HTML_FILES).filter(f => !man.berkas[f] || crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f), 'utf8')).digest('hex') !== man.berkas[f].sha256);
  rec('D1', JSON.stringify(have) === JSON.stringify(expect) && !shaBad.length, { lebih: have.filter(f => expect.indexOf(f) === -1), kurang: expect.filter(f => have.indexOf(f) === -1), shaBerbeda: shaBad });
  const src = {}; SERVER_FILES.forEach(f => { src[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
  const html = {}; HTML_FILES.forEach(f => { html[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
  const bodies = {}; SERVER_FILES.forEach(f => { const b = fnBodies(src[f]); Object.keys(b).forEach(n => { bodies[n] = { f, body: b[n] }; }); });
  const forbiddenFn = Object.keys(bodies).filter(n => FORBIDDEN_FN.test(n)).map(n => bodies[n].f + ':' + n);
  const kode = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // penanda dicari di KODE (komentar dokumentasi diabaikan)
  const forbiddenTxt = []; SERVER_FILES.concat(HTML_FILES).forEach(f => { const t = kode(src[f] || html[f]); FORBIDDEN_TXT.forEach(re => { if (re.test(t)) forbiddenTxt.push(f + ':' + re); }); });
  rec('D2', !forbiddenFn.length && !forbiddenTxt.length, { fungsi: forbiddenFn, penanda: forbiddenTxt, dibuangMenurutManifest: man.dibuang.map(x => x.fungsi) });
  const gated = n => { const b = bodies[n] && bodies[n].body; if (!b) return false; if (/opGate_\(|authorizeCurrentUser_\(/.test(b)) return true; const d = /\b(opEngineWrite_|opRecordBatch|opMasterUpsert|opCreateIncome|opCreateExpense)\(/.exec(b); return !!d && d[1] !== n && gated(d[1]); };
  const pub = Object.keys(bodies).filter(n => !n.endsWith('_'));
  const cls = {}, tak = [];
  pub.forEach(n => {
    if (gated(n)) cls[n] = 'GATED';
    else if (PUBLIC_ALLOWLIST[n]) cls[n] = 'ALLOWLIST';
    else if (PURE_OBLIGATION.indexOf(n) !== -1 && bodies[n].f === 'ObligationEngine.gs' && !/SpreadsheetApp|DriveApp|sgModel_|opSheetModel_|readAllRows_|setValues|PropertiesService/.test(bodies[n].body)) cls[n] = 'PURE';
    else tak.push(bodies[n].f + ':' + n);
  });
  rec('D3', !tak.length, { publik: pub.length, gated: pub.filter(n => cls[n] === 'GATED').length, allowlist: pub.filter(n => cls[n] === 'ALLOWLIST'), murni: pub.filter(n => cls[n] === 'PURE').length, takTerklasifikasi: tak });
  const calls = Array.from(new Set((html['ServerBridge.html'].match(/callServer\('([A-Za-z0-9_]+)'/g) || []).map(x => x.slice(12, -1))));
  const missing = calls.filter(n => pub.indexOf(n) === -1);
  const inc = Array.from(new Set((html['Bendahara_V2.html'].replace(/<!--[\s\S]*?-->/g, '').match(/include\('([A-Za-z0-9_]+)'\)/g) || []).map(x => x.slice(9, -2))));
  const incMissing = inc.filter(n => HTML_FILES.indexOf(n + '.html') === -1);
  rec('D4', calls.length > 0 && !missing.length && !incMissing.length, { dipanggilKlien: calls.length, tidakAda: missing, include: inc, includeTidakAda: incMissing });
  const allow = /var INCLUDE_ALLOWLIST_ = (\[[^\]]*\]);/.exec(src['Code.gs']);
  const allowList = allow ? JSON.parse(allow[1].replace(/'/g, '"')) : null;
  rec('D5', !!allowList && /INCLUDE_ALLOWLIST_\.indexOf/.test(bodies.include ? bodies.include.body : '') && inc.every(n => allowList.indexOf(n) !== -1), { allowlist: allowList, dipakaiTemplate: inc });
  let smoke = {};
  try {
    const rel = path.relative(OUT, dir).split(path.sep).join('/');
    const s = makeServer({ files: SERVER_FILES.map(f => rel + '/' + f) }); const B = s.sb;
    smoke = { identitas: B.getCurrentUserIdentity().code, skema: B.opSchemaApply('TAMBAH_KOLOM_ADITIF').ok, pengeluaran: B.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'T', clientRequestId: 'dp1' }).code,
      arsip: B.opArchiveTransaction('imp_trx_2', 'uji artefak').code, kewajiban: B.opObligations({ siswaId: 's1', periode: 'September 2026' }).code, fcc: B.opFinancialControl('September 2026').code,
      umSetup: B.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ').code, auditor: (s.state.email = 'auditor@x.id', B.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'T', clientRequestId: 'dp2' }).code),
      tanpaSesi: (s.state.email = '', B.opReadSheet('05_TRANSAKSI', {}).code), includeLain: (() => { try { B.include('Bendahara_V2'); return 'TIDAK_DITOLAK'; } catch (e) { return 'DITOLAK'; } })(),
      fungsiUjiTidakAda: ['testConcurrentWriteDoor_', 'TEST_BRIDGE_TEMPLATE', 'testBendaharaEvaluate', 'runFinancialSafetyTests_'].every(n => typeof B[n] === 'undefined') };
  } catch (e) { smoke = { galat: String(e && e.message || e) }; }
  rec('D6', smoke.identitas === 'SUCCESS' && smoke.skema && smoke.pengeluaran === 'SUCCESS' && smoke.arsip === 'SUCCESS' && smoke.kewajiban === 'SUCCESS' && smoke.fcc === 'SUCCESS' && smoke.umSetup === 'SUCCESS'
    && smoke.auditor === 'ROLE_NOT_ALLOWED' && smoke.tanpaSesi === 'AUTH_REQUIRED' && smoke.includeLain === 'DITOLAK' && smoke.fungsiUjiTidakAda, smoke);
  return R;
}
module.exports = { checkDeploy, PUBLIC_ALLOWLIST, PURE_OBLIGATION };
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(OUT, '_deploy_out'));
  const R = checkDeploy(dir);
  R.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + ' ' + JSON.stringify(r.d)));
  process.exitCode = R.every(r => r.ok) ? 0 : 1;
}
