/* Suite AUDIT P1_25 bagian D-1 (sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * D-1  : baris beku historis tanpa komponenId tidak lagi dikelompokkan sebagai duplikat (perbaikan audit); audit tidak bergantung nama;
 *        audit tidak menulis; tidak ada jalur koreksi.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026', CONF = 'BUAT_SKEMA_UANG_MUKA_LPJ';
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const code = r => r && (r.ok ? (r.data && r.data.results ? r.data.results[0].code : (r.data && r.data.replay ? 'REPLAY' : 'OK')) : r.code);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const kwInject = (s, id, o) => { const h = s.sheets['04_KEWAJIBAN'][0], v = Object.assign({ id, siswaId: 's2', komponenId: '', periode: P, bruto: 50000, potongan: '[]', netto: 50000, tagihanId: id, computedAt: '2026-08-01T00:00:00.000Z' }, o || {}); s.sheets['04_KEWAJIBAN'].push(h.map(k => v[k] === undefined ? '' : v[k])); };
const jenis = (a, j) => (a.data.pengecualian || []).filter(x => x.jenis === j);

// ======================= D-1 =======================
{ const s = fresh(); kwInject(s, 'tagihan_lama_x'); kwInject(s, 'tagihan_lama_y');
  const before = J(s.sheets), a = s.sb.opKewajibanBekuAudit(), ro = J(s.sheets) === before;
  const ob = s.sb.opObligations({ siswaId: 's2', periode: P }).data.rows.find(o => o.komponenId === 'kmp_spp');
  rec('PA-01', '[P1_25 perbaikan] dua baris beku historis TANPA komponenId (mungkin komponen berbeda) -> bukan DUPLIKAT_BEKU (sebelumnya DUPLIKAT_PASTI palsu pada kunci "s2||periode"); dilaporkan KOMPONEN_ID_KOSONG x2, TIDAK_KONSISTEN; baca-saja; baris tsb tidak dipakai perhitungan (SPP s2 tetap dari tarif 200.000)',
    ro && !jenis(a, 'DUPLIKAT_BEKU').length && jenis(a, 'KOMPONEN_ID_KOSONG').length === 2 && a.data.konsistensiData === 'TIDAK_KONSISTEN' && a.data.ringkasan.duplikatPasti === 0 && ob.netto === 200000 && !ob.tagihanId,
    J({ jenis: a.data.jumlahPerJenis, sppS2: [ob.netto, ob.tagihanId] })); }
{ const s = fresh(); kwInject(s, 'tagihan_lama_x');
  s.sheets['06_ALOKASI'].push(s.sheets['06_ALOKASI'][0].map(h => ({ id: 'alk_x', transaksiId: 'imp_trx_1', siswaId: 's2', komponenId: 'kmp_spp', periode: P, nominal: 50000, caraBayar: 'cicilan', tagihanId: 'tagihan_lama_x', createdAt: '2026-09-05T01:00:00.000Z' })[h] || ''));
  const k = jenis(s.sb.opKewajibanBekuAudit(), 'KOMPONEN_ID_KOSONG')[0];
  rec('PA-02', 'KOMPONEN_ID_KOSONG menampilkan hubungan alokasi (alokasi yang menunjuk baris lewat tagihanId)', k && J(k.alokasiTagihanId) === J(['alk_x']), J(k)); }
{ const s = fresh(); s.sheets['02_KOMPONEN'].push(['kmp_spp_tk', 'SPP', 'TK', 'Bulanan', '', '']);
  s.sb.opObligationSnapshot(P, {}); // kanonis per komponenId
  const k1 = s.sheets['04_KEWAJIBAN'].find(r => r[1] === 's2' && r[2] === 'kmp_spp'), h = s.sheets['04_KEWAJIBAN'][0];
  const r2 = k1.slice(); r2[2] = 'kmp_spp_tk'; r2[0] = 'kw_lain'; r2[h.indexOf('tagihanId')] = 'kw_lain'; s.sheets['04_KEWAJIBAN'].push(r2);
  const a = s.sb.opKewajibanBekuAudit();
  rec('PA-03', 'audit tidak bergantung nama: dua komponen bernama sama ("SPP") dengan komponenId berbeda, masing-masing satu baris beku untuk siswa/periode sama -> BUKAN duplikat; hanya KOMPONEN_NAMA_GANDA',
    !jenis(a, 'DUPLIKAT_BEKU').length && jenis(a, 'KOMPONEN_NAMA_GANDA').length === 1, J(a.data.jumlahPerJenis)); }
{ const src = fs.readFileSync(OUT + 'KewajibanBekuAudit.gs', 'utf8'); const s = fresh();
  const tulis = (src.match(/setValues|insertSheet|deleteRow|appendRow|sgAppend_|opAuditBulk_|withLock_/g) || []);
  rec('PA-04', 'audit D-1 tanpa jalur tulis: KewajibanBekuAudit.gs tidak memanggil setValues/insertSheet/deleteRow/append/audit/kunci; opKewajibanKoreksi TIDAK ada (ditahan)',
    tulis.length === 0 && typeof s.sb.opKewajibanKoreksi === 'undefined', J({ tulis, koreksi: typeof s.sb.opKewajibanKoreksi })); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
