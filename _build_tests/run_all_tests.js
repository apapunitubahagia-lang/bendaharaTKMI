// Menjalankan seluruh suite sandbox dan menulis log ke ../_test_logs/<prefix>_<suite>.log
const cp = require('child_process'), fs = require('fs'), path = require('path');
const prefix = process.argv[2] || 'run';
const suites = ['server_pass2', 'e2e_central2', 'tarif_server_tests', 'tarif_client_tests', 'schema_archive_tests', 'p0_tests', 'p1_tests', 'rab_tests', 'audit_p1_tests', 'p0_hardening_tests', 'readiness_tests', 'import_audit_tests', 't4b_tests', 'import_engine_tests', 'import_client_tests', 'concurrency_tests', 'akun_explicit_tests', 'tx_integrity_tests', 'gap005_tests', 'v1_migrasi_tests', 'alloc_siswa_tests', 'kategori_tests', 'snapshot_tarif_tests', 'legacy_import_tests', 'd5_master_split_tests', 'd3_v1_pusat_tests', 'd1_kewajiban_audit_tests', 'u5_rab_persetujuan_tests', 'd4_impor_lama_tests', 'd2_multi_siswa_tests', 'dimp8_siswa_audit_tests', 'u1_lintas_periode_tests', 'd1_identitas_tests', 'd4_siswa_audit_tests', 'u5_simulasi_tests', 'um_lpj_tests', 'd1_kanon_tests', 'um_batal_tests', 'lpj_bridge_tests', 'd1_audit_klasifikasi_tests', 'lpj_setup_live_tests', 'um_ui_tests', 'p1_25_d1_tests', 'p1_25_lpj_um_tests', 'p1_25h_lock_tests', 'p1_26_um_guard_tests', 'p1_26_deploy_tests', 'p1_26_kpi_server_tests', 'p1_26_peran_tests', 'p1_27_live_tests', 'p1_28_sisa_alokasi_tests'];
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
