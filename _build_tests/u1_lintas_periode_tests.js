/* Suite U-1 AUDIT ALOKASI LINTAS PERIODE (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * Kebijakan U-1 (default PERIOD_MISMATCH + pengecualian berotorisasi) BELUM diaktifkan (GAP-005/D-T7). Suite ini menguji audit
 * baca-saja alokasi historis + karakterisasi bahwa perilaku tulis belum berubah.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function fresh() {
  const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opAlokasiPengeluaranSetup('BUAT_SHEET_ALOKASI_PENGELUARAN');
  const h = s.sheets['08_ANGGARAN'][0];
  s.sheets['08_ANGGARAN'].push(h.map(k => k === 'id' ? 'ang_okt' : k === 'periode' ? 'Oktober 2026' : k === 'kategori' ? 'ATK' : k === 'unit' ? 'MI' : k === 'nominal' ? 100000 : k === 'jenis' ? 'PENGELUARAN' : ''),
    h.map(k => k === 'id' ? 'ang_ta' : k === 'periode' ? 'Tahun Ajaran 2026/2027' : k === 'kategori' ? 'ATK' : k === 'unit' ? 'MI' : k === 'nominal' ? 100000 : k === 'jenis' ? 'PENGELUARAN' : ''));
  return s;
}
const code = r => r.ok ? r.data.results.map(x => x.code) : [r.code];

(async () => {
  { const s = fresh(); const e = s.sb.opAlokasiLintasPeriodeAudit();
    rec('U1-01', 'audit tanpa alokasi eksplisit -> total 0 (sheet 30 kosong / belum ada tidak dianggap galat)', e.ok && e.data.total === 0, J(e.data && e.data.ringkasan)); }
  { const s = fresh();
    const w = s.sb.opRecordBatch('alokasiPengeluaran', [{ op: 'upsert', id: 'alg_1', row: { transaksiId: 'imp_trx_2', anggaranId: 'ang_1', nominal: 20000 } }, { op: 'upsert', id: 'alg_2', row: { transaksiId: 'imp_trx_2', anggaranId: 'ang_okt', nominal: 10000 } }]);
    const before = J(s.sheets['30_ALOKASI_PENGELUARAN']); const r = s.sb.opAlokasiLintasPeriodeAudit();
    rec('U1-02', 'KARAKTERISASI: alokasi transaksi September ke RAB Oktober MASIH diterima (U-1 belum diaktifkan; tidak ada perubahan perilaku tulis)', null, J(code(w)));
    rec('U1-03', 'audit baca-saja: September->September = SAMA_PERIODE; September->Oktober = PERIODE_BERBEDA (calon PERIOD_MISMATCH) per pasangan periode; 30_ALOKASI_PENGELUARAN tidak berubah',
      r.ok && r.data.ringkasan.SAMA_PERIODE === 1 && r.data.ringkasan.PERIODE_BERBEDA === 1 && r.data.perPasangan['September 2026 -> Oktober 2026'] === 1 && r.data.baris.length === 1 && r.data.baris[0].alokasiId === 'alg_2' && J(s.sheets['30_ALOKASI_PENGELUARAN']) === before,
      J({ tulis: code(w), ringkasan: r.data.ringkasan, pasangan: r.data.perPasangan })); }
  { const s = fresh(); s.state.email = 'auditor@x.id'; const r = s.sb.opAlokasiLintasPeriodeAudit();
    rec('U1-04', 'AUDITOR dapat menjalankan audit (baca-saja)', r.ok, r.code); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
