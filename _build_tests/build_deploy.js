// [P1_26] Artefak DEPLOY terpisah dari kode sumber/uji. TIDAK men-deploy apa pun (tanpa clasp, tanpa jaringan).
// Masukan  : berkas server teruji (SERVER_FILES dari srv_env.js) + Bendahara_V2.html + ServerBridge.html (hasil build_all.js).
// Keluaran : <dir>/ (bawaan ../_deploy_out/, di-.gitignore) berisi berkas siap clasp push + MANIFEST.json (sha256, fungsi dibuang).
// Fungsi uji/diagnostik dibuang dari SALINAN artefak (sumber tidak diubah, sandbox Node tetap menguji sumber lengkap).
// Tidak pernah ikut: _live_tests/ (harness salinan uji), deps/, _build_tests/, dokumen, log.
// Verifikasi: node check_deploy.js [dir]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { SERVER_FILES, OUT } = require('./srv_env.js');
const L = require('./p0_lib');
const DIR = path.resolve(process.argv[2] || path.join(OUT, '_deploy_out'));
const HTML_FILES = ['Bendahara_V2.html', 'ServerBridge.html'];
/* Dibuang dari artefak. Alasan per fungsi dicatat di MANIFEST. Penambahan wajib lewat berkas ini (diperiksa check_deploy.js). */
const STRIP = {
  'Code.gs': {
    testBendaharaEvaluate: 'uji evaluasi template (Logger); publik, tidak dibutuhkan runtime',
    TEST_BRIDGE_TEMPLATE: 'uji posisi skrip di HTML (Logger); publik, tidak dibutuhkan runtime',
    TEST_SERVERBRIDGE_SYNTAX: 'uji sintaks ServerBridge (Logger); publik, tidak dibutuhkan runtime'
  },
  'TransactionEngine.gs': {
    testConcurrentWriteDoor_: 'MENULIS lalu MENGHAPUS transaksi uji di spreadsheet aktif tanpa audit; hanya untuk editor',
    createTransactionWithAllocations_ForTest_: 'satu-satunya penyala testMode (audit dialihkan dari 13_AUDIT_LOG); hanya dipakai testConcurrentWriteDoor_',
    runFinancialSafetyTests_: 'uji jalur tolak (editor); tidak dibutuhkan runtime',
    validateTransactionPayloadPublicWrapper_: 'pembungkus uji; hanya dipakai runFinancialSafetyTests_',
    regressionCheck_: 'pembanding jumlah baris terhadap baseline literal (diagnostik editor); tidak dibutuhkan runtime'
  }
};
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
const manifest = { dibuatPada: new Date().toISOString(), sumber: 'build_all.js + build_deploy.js', berkas: {}, dibuang: [] };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
SERVER_FILES.concat(HTML_FILES).forEach(f => {
  const doc = { t: fs.readFileSync(OUT + f, 'utf8').replace(/\r\n/g, '\n') };
  Object.keys(STRIP[f] || {}).forEach(name => {
    const r = L.fnRange(doc, name);
    let start = r.start, end = r.end;
    doc.t = doc.t.slice(0, start) + '/* [DEPLOY] ' + name + ' dibuang dari artefak deploy (build_deploy.js): ' + STRIP[f][name] + ' */' + doc.t.slice(end);
    manifest.dibuang.push({ berkas: f, fungsi: name, alasan: STRIP[f][name] });
  });
  fs.writeFileSync(path.join(DIR, f), doc.t);
  manifest.berkas[f] = { sha256: sha(doc.t), bytes: Buffer.byteLength(doc.t) };
});
fs.writeFileSync(path.join(DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 1));
process.exitCode = 0;
console.log('build_deploy: ' + Object.keys(manifest.berkas).length + ' berkas -> ' + DIR + '; ' + manifest.dibuang.length + ' fungsi uji dibuang');
