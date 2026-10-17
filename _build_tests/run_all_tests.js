// Menjalankan seluruh suite sandbox dan menulis log ke ../_test_logs/<prefix>_<suite>.log
const cp = require('child_process'), fs = require('fs'), path = require('path');
const prefix = process.argv[2] || 'run';
const suites = ['server_pass2', 'e2e_central2', 'tarif_server_tests', 'tarif_client_tests', 'schema_archive_tests', 'p0_tests'];
const dir = path.join(__dirname, '..', '_test_logs'); fs.mkdirSync(dir, { recursive: true });
let bad = 0;
suites.forEach(s => {
  const r = cp.spawnSync('node', [s + '.js'], { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(dir, prefix + '_' + s + '.log'), out);
  const last = (out.trim().split('\n').reverse().find(l => /PASS=|CRASH|Error/.test(l)) || '(tanpa ringkasan)');
  const m = /FAIL=(\d+)/.exec(last); const okRun = r.status === 0 && m && Number(m[1]) === 0;
  console.log((okRun ? 'OK   ' : 'GAGAL') + ' ' + s.padEnd(22) + last);
  if (!okRun) bad++;
});
process.exitCode = bad ? 1 : 0;
