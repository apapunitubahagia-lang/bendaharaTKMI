// Rantai build lengkap (P0 + P1 + P1-RAB; langkah *_rab_* terpisah agar mudah di-revert). Semua langkah deterministik; HTML dan .gs hasil generate tidak diedit tangan.
const cp = require('child_process'), fs = require('fs');
const steps = ['apply_central.js', 'apply_tarif.js', 'apply_p0_client.js', 'apply_p1_client.js', 'apply_p1_rab_client.js', 'apply_p1_rab_beranda_client.js', 'apply_p0_t8_client.js', 'build_server_engines.js', 'apply_p0_server.js', 'apply_p1_server.js', 'apply_p1_rab_server.js', 'build_bridge.js'];
// [P1] akhir baris (CRLF/LF) berkas generate dipertahankan seperti di repo, agar diff hanya memuat perubahan isi
const OUT = require('./paths').OUT, GEN = ['Bendahara_V2.html', 'TransactionEngine.gs', 'MasterDataRead.gs', 'ObligationEngine.gs', 'FinanceEngine.gs', 'TarifPlan.gs', 'ServerBridge.js', 'ServerBridge.html'];
const eol = {}; GEN.forEach(f => { try { eol[f] = fs.readFileSync(OUT + f, 'utf8').includes('\r\n'); } catch (e) { /* belum ada */ } });
for (const s of steps) {
  if (!fs.existsSync(__dirname + '/' + s)) { console.log('(lewati, belum ada) ' + s); continue; }
  const r = cp.spawnSync('node', [s], { cwd: __dirname, encoding: 'utf8' });
  if (r.status !== 0) { console.error('GAGAL ' + s + '\n' + (r.stderr || '').split('\n').slice(0, 10).join('\n')); process.exit(1); }
  console.log(s + ': ' + (r.stdout || '').trim().split('\n').pop());
}
GEN.forEach(f => { if (eol[f] === undefined) return; const t = fs.readFileSync(OUT + f, 'utf8').replace(/\r\n/g, '\n'); fs.writeFileSync(OUT + f, eol[f] ? t.replace(/\n/g, '\r\n') : t); });
