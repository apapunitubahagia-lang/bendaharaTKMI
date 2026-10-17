// Rantai build lengkap (P0). Semua langkah deterministik; HTML dan .gs hasil generate tidak diedit tangan.
const cp = require('child_process'), fs = require('fs');
const steps = ['apply_central.js', 'apply_tarif.js', 'apply_p0_client.js', 'build_server_engines.js', 'apply_p0_server.js', 'build_bridge.js'];
for (const s of steps) {
  if (!fs.existsSync(__dirname + '/' + s)) { console.log('(lewati, belum ada) ' + s); continue; }
  const r = cp.spawnSync('node', [s], { cwd: __dirname, encoding: 'utf8' });
  if (r.status !== 0) { console.error('GAGAL ' + s + '\n' + (r.stderr || '').split('\n').slice(0, 10).join('\n')); process.exit(1); }
  console.log(s + ': ' + (r.stdout || '').trim().split('\n').pop());
}
