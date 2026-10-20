/* Suite U-5 SIMULASI "TIDAK BERLAKU SURUT" (P1_22; sandbox Node, TIDAK menyentuh Google Sheets).
 * opRabTidakSurutSimulasi: before/after masukan BDS03-I03/I05 tanpa menulis data, tanpa mengubah pencocokan aktif atau formula KPI.
 * Fixture: ang_1 (September 2026, ATK, MI); imp_trx_2 PENGELUARAN ATK MI 2026-09-05 Rp50.000.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026';
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const setAng = (s, id, f, v) => { const h = s.sheets['08_ANGGARAN'][0], r = s.sheets['08_ANGGARAN'].find(x => x[0] === id); while (r.length < h.length) r.push(''); r[h.indexOf(f)] = v; };
const sim = (s, o) => s.sb.opRabTidakSurutSimulasi(o || {});
const realisasi = s => { const o = s.sb.opRabRealization(P); delete o.data.computedAt; return J(o.data); };

(async () => {
  { const s = fresh(); setAng(s, 'ang_1', 'status', 'DISETUJUI'); setAng(s, 'ang_1', 'disetujuiPada', '2026-08-30T03:00:00.000Z'); setAng(s, 'ang_1', 'disetujuiOleh', 'kepala@x.id');
    const r = sim(s).data.perPeriode[P];
    rec('US-01', 'RAB disetujui SEBELUM transaksi -> TIDAK_TERDAMPAK; I03/I05 sekarang = simulasi (1/1)', r.i03Sekarang === 1 && r.i03SimulasiMin === 1 && r.i03SimulasiMaks === 1 && r.berubahGagal === 0, J(r)); }
  { const s = fresh(); setAng(s, 'ang_1', 'status', 'DISETUJUI'); setAng(s, 'ang_1', 'disetujuiPada', '2026-09-20T03:00:00.000Z'); setAng(s, 'ang_1', 'disetujuiOleh', 'kepala@x.id');
    const before = J(s.sheets), rz0 = realisasi(s), o = sim(s).data, r = o.perPeriode[P];
    rec('US-02', 'RAB disetujui SESUDAH transaksi (20-09 > 05-09) -> BERUBAH_GAGAL; I03 1 -> 0, I05 1 -> 0 (tanpa komitmen); daftar transaksi terdampak', r.i03Sekarang === 1 && r.i03SimulasiMaks === 0 && r.i05Sekarang === 1 && r.i05SimulasiMaks === 0 && o.transaksiTerdampak[0].status === 'BERUBAH_GAGAL',
      J({ r, terdampak: o.transaksiTerdampak }));
    rec('US-03', 'baca-saja: seluruh sheet identik; pencocokan aktif (opRabRealization) identik sebelum/sesudah simulasi', J(s.sheets) === before && realisasi(s) === rz0, 'sheet & realisasi identik'); }
  { const s = fresh(); setAng(s, 'ang_1', 'status', 'DISETUJUI'); // RAB lama tanpa metadata
    const r = sim(s).data.perPeriode[P];
    rec('US-04', 'RAB lama tanpa metadata (HISTORI_TIDAK_LENGKAP) -> TIDAK_DAPAT_DINILAI: rentang I03 min 0 / maks 1, tidak ada tanggal dikarang', r.tidakDapatDinilai === 1 && r.i03SimulasiMin === 0 && r.i03SimulasiMaks === 1, J(r)); }
  { const s = fresh(); setAng(s, 'ang_1', 'status', 'DISETUJUI'); setAng(s, 'ang_1', 'disetujuiPada', '2026-09-20T03:00:00.000Z');
    const hk = s.sheets['09_KOMITMEN'][0]; hk.push('transaksiId'); const kv = { id: 'kom_1', uraian: 'Pembelian ATK darurat', nominal: 50000, status: 'COMMITTED', tanggal: '2026-09-04', transaksiId: 'imp_trx_2' }; s.sheets['09_KOMITMEN'].push(hk.map(h => kv[h] === undefined ? '' : kv[h]));
    const r = sim(s).data.perPeriode[P];
    rec('US-05', 'transaksi tertaut komitmen: I03 tetap gagal di simulasi, I05 tetap lulus (persetujuan di luar RAB, sama dengan aturan klien)', r.i03SimulasiMaks === 0 && r.i05SimulasiMin === 1 && r.i05Sekarang === 1, J(r)); }
  { const s = fresh(); setAng(s, 'ang_1', 'status', 'DIAJUKAN');
    const r = sim(s).data.perPeriode[P];
    rec('US-06', 'RAB belum disetujui: I03 sekarang 0 = simulasi 0 (tidak terdampak)', r.i03Sekarang === 0 && r.i03SimulasiMaks === 0 && r.berubahGagal === 0, J(r)); }
  { const s = fresh(); const o = sim(s, { periode: 'Oktober 2026' });
    rec('US-07', 'filter periode tanpa transaksi -> perPeriode kosong', o.ok && Object.keys(o.data.perPeriode).length === 0, J(o.data.perPeriode)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
