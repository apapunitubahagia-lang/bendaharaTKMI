/* Suite MESIN IMPOR SERVER (sandbox Node, TIDAK menyentuh Google Sheets). P1-IMP Tahap A-F.
 * opImportSetup / opImportPlan / opImportCommit / opImportStatus / opImportReviewList / opImportReviewResolve.
 * Skala 10/50/100/500 untuk 5 modul, idempotensi, putus koneksi, penyimpanan parsial, konflik, header berubah,
 * otorisasi, pembacaan backend tidak lengkap, rekonsiliasi total sumber vs tersimpan.
 */
const { makeServer } = require('./srv_env.js');
const FINAL = require('./fixtures/headers_backend.json').FINAL;
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const sumCol = (srv, n, h, f) => rows(srv, n).filter(f || (() => true)).reduce((s, r) => s + (Number(r[col(srv, n, h)]) || 0), 0);
const SUMBER = { nama: 'uji.csv', jenis: 'csv' };
function fresh(o) { const s = makeServer(o); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); s.sb.opImportSetup('BUAT_SHEET_IMPOR'); return s; }
const plan = (srv, modul, baris, extra) => srv.sb.opImportPlan(Object.assign({ modul, baris, sumber: SUMBER }, extra || {}));
/* Menjalankan pratinjau lalu commit per potongan sampai selesai. Mengembalikan {plan, hasil[], calls}. */
function importAll(srv, modul, baris, extra, hooks) {
  extra = extra || {}; hooks = hooks || {};
  const p = plan(srv, modul, baris, extra); if (!p.ok) return { plan: p, hasil: [], calls: 0 };
  let mulai = 0, calls = 0; const hasil = [];
  while (mulai !== null && calls < 200) {
    if (hooks.before) hooks.before(calls);
    const c = srv.sb.opImportCommit(Object.assign({ modul, baris, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA', mulai }, extra)); calls++;
    if (!c.ok) return { plan: p, hasil, calls, err: c };
    hasil.push.apply(hasil, c.data.hasil); mulai = c.data.berikut; if (hooks.after) hooks.after(c, calls);
  }
  return { plan: p, hasil, calls };
}
const cnt = (arr, k) => arr.filter(x => x.status === k).length;
const kelasOf = p => p.data.rows.map(r => r.kelas);

/* ---------- generator data per modul (n baris valid, unik) ---------- */
const tgl = i => '2026-09-' + String(1 + (i % 28)).padStart(2, '0');
const GEN = {
  pengeluaran: n => Array.from({ length: n }, (_, i) => ({ tanggal: tgl(i), nominal: String(10000 + i), penerima: 'Toko ' + i, unit: 'MI', akun: 'Kasir', metode: 'Tunai', kategori: 'ATK', uraian: 'Barang ' + i })),
  pemasukan: n => Array.from({ length: n }, (_, i) => ({ tanggal: tgl(i), nominal: String(20000 + i), unit: 'MI', akun: 'BNI', metode: 'Transfer Bank', sumber: 'SPP', namaPengirim: 'Pengirim ' + i, ftNumber: 'FT' + i })),
  rab: n => Array.from({ length: n }, (_, i) => ({ periode: 'Oktober 2026', unit: 'MI', kategori: 'ATK', program: 'Program ' + i, nominal: String(100000 + i) })),
  lpj: n => Array.from({ length: n }, (_, i) => ({ tanggal: tgl(i), unit: 'MI', kategori: 'ATK', item: 'Nota ' + i, nominal: String(5000 + i) })),
  siswa: n => Array.from({ length: n }, (_, i) => ({ nama: 'Siswa Uji ' + i, unit: 'MI', kelas: '1A', nisn: String(3000000000 + i), tahunAjaran: '2026/2027', tanggalMasuk: '05/09/2026', jenisKelamin: i % 2 ? 'L' : 'P' }))
};
const TARGET = { pengeluaran: '05_TRANSAKSI', pemasukan: '05_TRANSAKSI', rab: '08_ANGGARAN', lpj: '19_LPJ', siswa: '01_SISWA' };
const NOMCOL = { pengeluaran: 'nominal', pemasukan: 'nominal', rab: 'nominal', lpj: 'nominal' };

(async () => {
  // ---------- setup, otorisasi ----------
  { const srv = makeServer(); const b = GEN.pengeluaran(2);
    const p0 = plan(srv, 'pengeluaran', b);
    const c0 = srv.sb.opImportCommit({ modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p0.data.planHash, konfirmasi: 'IMPOR_DATA' });
    const s0 = srv.sb.opImportSetup('ya'), s1 = srv.sb.opImportSetup('BUAT_SHEET_IMPOR'), s2 = srv.sb.opImportSetup('BUAT_SHEET_IMPOR');
    rec('IE-01', 'log impor: sheet hanya dibuat eksplisit; commit tanpa log ditolak (D-IMP-3)', p0.ok && !p0.data.logSiap && c0.code === 'SCHEMA_ADDITIVE_REQUIRED' && rows(srv, '05_TRANSAKSI').length === 2 && s0.code === 'CONFIRM_REQUIRED' && s1.ok && s2.data.unchanged === true && !!srv.sheets['31_IMPOR_JOB'] && !!srv.sheets['33_IMPOR_TINJAUAN'],
      [p0.code, c0.code, s0.code, s1.code, 'ulang unchanged=' + s2.data.unchanged].join(', ')); }
  { const srv = fresh(); const b = GEN.pengeluaran(2); const p = plan(srv, 'pengeluaran', b);
    srv.state.email = 'auditor@x.id'; const a1 = plan(srv, 'pengeluaran', b), a2 = srv.sb.opImportCommit({ modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' });
    srv.state.email = 'asing@x.id'; const a3 = plan(srv, 'pengeluaran', b);
    srv.state.email = 'bendahara@x.id'; const a4 = srv.sb.opImportCommit({ modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash });
    rec('IE-02', 'pengguna tanpa otorisasi / tanpa konfirmasi', a1.code === 'ROLE_NOT_ALLOWED' && a2.code === 'ROLE_NOT_ALLOWED' && !a3.ok && a4.code === 'CONFIRM_REQUIRED' && rows(srv, '05_TRANSAKSI').length === 2, [a1.code, a2.code, a3.code, a4.code].join(', ')); }
  { const srv = fresh(); const r = plan(srv, 'pengeluaran', [{ tanggal: '2026-10-01', nominal: '5', penerima: 'Toko', unit: 'MI', jenis: 'TRANSFER' }]);
    rec('IE-03', 'kolom tidak dikenal ditolak (mis. jenis TRANSFER; GAP-028 tetap diblokir)', r.code === 'VALIDATION_ERROR', r.message); }

  // ---------- Tahap B: tanpa default diam-diam ----------
  { const srv = fresh(); const b = [{ tanggal: '2026-10-02', nominal: '75000', uraian: 'Spidol', unit: 'MI', penerima: 'Toko A' }, { tanggal: '2026-10-02', nominal: '76000', penerima: 'Toko B', unit: 'MI', akun: 'Rekening Tidak Ada', metode: 'Tunai', kategori: 'Kategori Fiktif' }];
    const r = importAll(srv, 'pengeluaran', b); const r0 = r.plan.data.rows;
    rec('IE-04', 'F3 pengeluaran tanpa akun/kategori/metode -> PERLU_KEPUTUSAN, tidak tersimpan', kelasOf(r.plan).every(k => k === 'PERLU_KEPUTUSAN') && r0[0].kode.includes('AKUN_KOSONG') && r0[0].kode.includes('KATEGORI_KOSONG') && r0[0].kode.includes('METODE_KOSONG') && r0[1].kode.includes('AKUN_TIDAK_DIKENAL') && r0[1].kode.includes('KATEGORI_TIDAK_DIKENAL') && rows(srv, '05_TRANSAKSI').length === 2,
      J(r0.map(x => x.kode)) + ', tersimpan ' + (rows(srv, '05_TRANSAKSI').length - 2));
    const kep = { 0: { akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK' }, 1: { akunId: 'akun_bank1', kategori: 'ATK' } };
    const r2 = importAll(srv, 'pengeluaran', b, { keputusan: kep }); const t = rows(srv, '05_TRANSAKSI').slice(2);
    rec('IE-05', 'keputusan eksplisit per baris -> tersimpan dengan akun/kategori pilihan', cnt(r2.hasil, 'TERSIMPAN') === 2 && t[0][col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_kas1' && t[1][col(srv, '05_TRANSAKSI', 'akunId')] === 'akun_bank1' && t.every(x => x[col(srv, '05_TRANSAKSI', 'kategori')] === 'ATK'),
      J(t.map(x => [x[col(srv, '05_TRANSAKSI', 'akunId')], x[col(srv, '05_TRANSAKSI', 'kategori')], x[col(srv, '05_TRANSAKSI', 'metode')]]))); }
  { const srv = fresh(); const r = plan(srv, 'pemasukan', [{ tanggal: '2026-10-03', nominal: '120000', uraian: 'Donasi', unit: 'MI', akun: 'Rekening Tidak Ada', metode: 'Tunai', sumber: 'SPP' }]);
    rec('IE-06', 'F3 pemasukan akun tidak dikenal -> PERLU_KEPUTUSAN (tidak jatuh ke akun pertama)', r.data.rows[0].kelas === 'PERLU_KEPUTUSAN' && r.data.rows[0].kode.includes('AKUN_TIDAK_DIKENAL'), J(r.data.rows[0].kode)); }

  // ---------- duplikasi ----------
  { const srv = fresh(); const one = GEN.pengeluaran(1)[0]; const b = [one, Object.assign({}, one)];
    const r = importAll(srv, 'pengeluaran', b);
    rec('IE-07', 'baris identik dalam satu berkas -> kemunculan ke-2 DUPLIKAT (tidak tersimpan)', J(kelasOf(r.plan)) === J(['VALID', 'DUPLIKAT']) && cnt(r.hasil, 'TERSIMPAN') === 1 && rows(srv, '05_TRANSAKSI').length === 3, J(kelasOf(r.plan)));
    const srv2 = fresh(); const r2 = importAll(srv2, 'pengeluaran', b, { keputusan: { 1: { terimaDuplikat: true } } });
    rec('IE-08', 'dua pembelian sah identik: diterima eksplisit -> 2 transaksi berbeda', cnt(r2.hasil, 'TERSIMPAN') === 2 && rows(srv2, '05_TRANSAKSI').length === 4 && r2.hasil[0].kunci !== r2.hasil[1].kunci, J(r2.hasil.map(h => h.kunci.slice(-4)))); }
  { const srv = fresh(); const b = GEN.pengeluaran(5); importAll(srv, 'pengeluaran', b); const n1 = rows(srv, '05_TRANSAKSI').length;
    const again = importAll(srv, 'pengeluaran', b);
    rec('IE-09', 'berkas yang sama diimpor ulang -> TIDAK_BERUBAH, 0 tersimpan', again.plan.data.ringkasan.sudahTersimpan === 5 && cnt(again.hasil, 'TIDAK_BERUBAH') === 5 && rows(srv, '05_TRANSAKSI').length === n1, J(again.plan.data.ringkasan));
    const b2 = [b[2], { tanggal: '2026-09-20', nominal: '99999', penerima: 'Toko Baru', unit: 'MI', akun: 'Kasir', metode: 'Tunai', kategori: 'ATK' }];
    const other = importAll(srv, 'pengeluaran', b2);
    rec('IE-10', 'transaksi yang sama di berkas berbeda -> DUPLIKAT (tidak dilewati diam-diam / tidak tersimpan ganda)', other.plan.data.rows[0].kelas === 'DUPLIKAT' && other.plan.data.rows[0].kode.includes('DUPLIKAT_DATA_SERVER') && other.plan.data.rows[0].kode.includes('PERNAH_DIIMPOR_BERKAS_LAIN') && rows(srv, '05_TRANSAKSI').length === n1 + 1,
      J(other.plan.data.rows[0].kode));
    const b3 = [{ tanggal: b[3].tanggal, nominal: b[3].nominal, penerima: 'Penerima Lain', unit: 'MI', akun: 'Kasir', metode: 'Tunai', kategori: 'ATK' }];
    const p3 = plan(srv, 'pengeluaran', b3);
    rec('IE-11', 'tanggal + nominal sama tetapi teks berbeda -> PERINGATAN, bukan duplikat', p3.data.rows[0].kelas === 'PERINGATAN' && p3.data.rows[0].kode.includes('SERUPA_TANGGAL_NOMINAL'), J(p3.data.rows[0].kode)); }

  // ---------- tanggal / periode / referensi ----------
  { const srv = fresh(); const base = GEN.pengeluaran(1)[0];
    const b = ['2026-02-30', '31/04/2026', 'kemarin', '05/09/2026', '46270'].map((t, i) => Object.assign({}, base, { tanggal: t, penerima: 'Toko T' + i }));
    const p = plan(srv, 'pengeluaran', b), rr = p.data.rows;
    rec('IE-12', 'tanggal tidak valid -> TOLAK; DD/MM/YYYY & serial Excel dinormalisasi TERLIHAT', J(rr.map(r => r.kelas)) === J(['TOLAK', 'TOLAK', 'TOLAK', 'VALID', 'VALID']) && rr[3].normalisasi.some(n => n.field === 'tanggal' && n.ke === '2026-09-05') && rr[4].payload.tanggal === '2026-09-05',
      J(rr.map(r => r.kelas + (r.normalisasi.length ? ':' + r.normalisasi.map(n => n.dari + '->' + n.ke).join('|') : '')))); }
  { const srv = fresh(); const b = [{ unit: 'MI', kategori: 'ATK', program: 'A', nominal: '1000' }, { periode: '2026/2027', unit: 'MI', kategori: 'ATK', program: 'B', nominal: '1000' }, { periode: 'Okt 2026', unit: 'MI', kategori: 'ATK', program: 'C', nominal: '1000' }, { periode: 'Tahun Ajaran 2026/2027', unit: 'MI', kategori: 'ATK', program: 'D', nominal: '1000', status: 'DISETUJUI' }];
    const p = plan(srv, 'rab', b), rr = p.data.rows;
    rec('IE-13', 'D-IMP-6 periode RAB eksplisit: kosong/TA mentah -> PERLU_KEPUTUSAN (saran, tidak diterapkan), tidak valid -> TOLAK', J(rr.map(r => r.kelas)) === J(['PERLU_KEPUTUSAN', 'PERLU_KEPUTUSAN', 'TOLAK', 'PERINGATAN']) && rr[1].keputusanPerlu[0].saran === 'Tahun Ajaran 2026/2027' && rr[0].payload.periode === '',
      J(rr.map(r => r.kelas + ':' + r.kode.join(','))));
    const r = importAll(srv, 'rab', b, { keputusan: { 0: { periode: 'Oktober 2026' }, 1: { periode: 'Tahun Ajaran 2026/2027' } } });
    const A = rows(srv, '08_ANGGARAN').slice(1), sc = col(srv, '08_ANGGARAN', 'status'), pc = col(srv, '08_ANGGARAN', 'periode');
    rec('IE-14', 'D-IMP-5 RAB impor selalu DIAJUKAN (status DISETUJUI dari berkas diabaikan); periode tersimpan = keputusan', cnt(r.hasil, 'TERSIMPAN') === 3 && A.every(x => x[sc] === 'DIAJUKAN') && J(A.map(x => x[pc])) === J(['Oktober 2026', 'Tahun Ajaran 2026/2027', 'Tahun Ajaran 2026/2027']) && r.plan.data.rows[3].kode.includes('STATUS_SUMBER_DIABAIKAN'),
      J(A.map(x => [x[pc], x[sc]]))); }
  { const srv = makeServer(); srv.sheets['08_ANGGARAN'] = [FINAL['08_ANGGARAN'].slice()]; srv.sheets['19_LPJ'] = [FINAL['19_LPJ'].slice()]; srv.sb.opImportSetup('BUAT_SHEET_IMPOR');
    const r1 = importAll(srv, 'rab', [{ periode: 'Oktober 2026', unit: 'MI', kategori: 'ATK', program: 'Kertas', nominal: '500000', volume: '10', hargaSatuan: '50000', satuan: 'rim' }]);
    const r2 = importAll(srv, 'lpj', [{ tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', item: 'Nota', nominal: '1000', volume: '1', hargaSatuan: '1000' }]);
    const sr = rows(srv, '19_LPJ')[0][col(srv, '19_LPJ', 'sourceRow')];
    rec('IE-15', 'F1/F2 header FINAL: RAB & LPJ tersimpan tanpa UNKNOWN_FIELD; kolom yang belum ada dilaporkan & disimpan di sourceRow', cnt(r1.hasil, 'TERSIMPAN') === 1 && cnt(r2.hasil, 'TERSIMPAN') === 1 && r2.plan.data.kolomTidakTersedia.hargaSatuan === 1 && JSON.parse(sr).kolomTidakTersedia.hargaSatuan === 1000,
      'kolomTidakTersedia LPJ ' + J(r2.plan.data.kolomTidakTersedia) + ', RAB ' + J(r1.plan.data.kolomTidakTersedia)); }
  { const srv = fresh(); const n0 = rows(srv, '05_TRANSAKSI').length;
    const b = [{ tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', item: 'Nota tanpa tautan', nominal: '20000' }, { tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', item: 'Nota rujukan hilang', nominal: '1000', transaksiId: 'trx_tidak_ada' },
      { tanggal: '2026-09-06', unit: 'MI', kategori: 'ATK', item: 'Nota tertaut', nominal: '30000', transaksiId: 'imp_trx_2' }, { tanggal: '2026-09-06', unit: 'MI', kategori: 'ATK', item: 'Nota lebih', nominal: '30000', transaksiId: 'imp_trx_2' }];
    const r = importAll(srv, 'lpj', b); const rr = r.plan.data.rows, L = rows(srv, '19_LPJ'), tc = col(srv, '19_LPJ', 'transaksiId');
    rec('IE-16', 'LPJ: tidak membuat transaksi; rujukan transaksi tidak ada / melebihi -> TOLAK', rows(srv, '05_TRANSAKSI').length === n0 && J(rr.map(x => x.kelas)) === J(['PERINGATAN', 'TOLAK', 'VALID', 'TOLAK']) && rr[3].kode.includes('LPJ_EXCEEDS_TRANSACTION'), J(rr.map(x => x.kelas + ':' + x.kode.join(','))));
    const it = srv.sb.opImportReviewList({ modul: 'lpj' }).data.items;
    rec('IE-17', 'LPJ tanpa tautan: status jelas (PERLU TRANSAKSI / PERLU TAUTAN) di antrean tinjauan server; kandidat tidak ditautkan otomatis', L.length === 2 && L.filter(x => x[tc] === '').length === 1 && it.some(x => x.jenis === 'LPJ_TANPA_TAUTAN') && rr[0].kode.includes('LPJ_TANPA_TAUTAN'),
      'kandidat baris 1: ' + J(rr[0].kandidat) + '; item tinjauan ' + J(it.map(x => x.jenis))); }
  { const srv = fresh(); const b = [{ periode: 'Oktober 2026', unit: 'MI', kategori: 'Tidak Ada', program: 'X', nominal: '5' }, { periode: 'Oktober 2026', unit: 'MI', kategori: 'ATK', subkategori: 'Bukan Milik', program: 'Y', nominal: '5' }];
    const p = plan(srv, 'rab', b);
    rec('IE-18', 'referensi master tidak ditemukan (kategori/subkategori) -> PERLU_KEPUTUSAN / TOLAK', J(kelasOf(p)) === J(['PERLU_KEPUTUSAN', 'TOLAK']), J(p.data.rows.map(r => r.kode))); }

  // ---------- pemasukan: alokasi (D-IMP-4) ----------
  { const srv = fresh(); const n0 = rows(srv, '06_ALOKASI').length;
    const b = [{ tanggal: '2026-10-01', nominal: '400000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP' },
      { tanggal: '2026-10-01', nominal: '150000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP' },
      { tanggal: '2026-10-01', nominal: '50000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'Komponen Fiktif' },
      { tanggal: '2026-10-01', nominal: '70000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'SPP', namaPengirim: 'Umum' }];
    const r = importAll(srv, 'pemasukan', b), rr = r.plan.data.rows;
    const A = rows(srv, '06_ALOKASI').slice(n0).map(a => [a[col(srv, '06_ALOKASI', 'periode')], a[col(srv, '06_ALOKASI', 'nominal')]]);
    rec('IE-19', 'D-IMP-4 alokasi wajib valid: kewajiban tertua dulu lintas baris; komponen tidak dikenal -> TOLAK; tanpa komponen -> tanpa alokasi (kebijakan berlaku)',
      J(rr.map(x => x.kelas)) === J(['VALID', 'VALID', 'TOLAK', 'PERINGATAN']) && cnt(r.hasil, 'TERSIMPAN') === 3 && J(A) === J([['Juli 2026', 200000], ['Agustus 2026', 200000], ['September 2026', 150000]]) && rr[3].kode.includes('TANPA_ALOKASI'),
      'kelas ' + J(rr.map(x => x.kelas + ':' + x.kode.join(','))) + '; alokasi ' + J(A));
    const b2 = [{ tanggal: '2026-10-02', nominal: '60000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP' }];
    const r2 = importAll(srv, 'pemasukan', b2);
    const b3 = [{ tanggal: '2026-10-03', nominal: '10000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'ZAHRA', kelas: '3 Abdul', komponen: 'SPP' }];
    const n2 = rows(srv, '05_TRANSAKSI').length, p3 = plan(srv, 'pemasukan', b3), r3 = importAll(srv, 'pemasukan', b3);
    rec('IE-20', 'D-IMP-4 kelebihan atas sisa kewajiban = PERINGATAN (kredit, kebijakan berlaku); kewajiban sudah lunas -> alokasi tidak valid -> TOLAK (tidak disimpan)', r2.plan.data.rows[0].kode.includes('SISA_TIDAK_TERALOKASI') && cnt(r2.hasil, 'TERSIMPAN') === 1 && p3.data.rows[0].kelas === 'TOLAK' && p3.data.rows[0].kode.includes('KEWAJIBAN_TIDAK_ADA') && rows(srv, '05_TRANSAKSI').length === n2,
      J(r2.plan.data.rows[0].kode) + ' / ' + J(p3.data.rows[0].kode)); }
  { const srv = fresh(); const b = [{ tanggal: '2026-10-01', nominal: '100000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'Zahra', kelas: '3 Abdul', komponen: 'SPP' }, { tanggal: '2026-10-01', nominal: '100000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'Zahraa', kelas: '9', komponen: 'SPP' }];
    const p = plan(srv, 'pemasukan', b);
    rec('IE-21', 'siswa ambigu/mirip -> PERLU_KEPUTUSAN (tidak dicocokkan otomatis)', p.data.rows[1].kelas === 'PERLU_KEPUTUSAN' && p.data.rows[1].kode.includes('SISWA_AMBIGU'), J(kelasOf(p)) + ' ' + J(p.data.rows[1].keputusanPerlu.map(k => k.label))); }

  // ---------- konflik, header, backend tidak lengkap ----------
  { const srv = fresh(); const b = GEN.pengeluaran(3); const p = plan(srv, 'pengeluaran', b);
    srv.sb.opCreateExpense({ clientRequestId: 'luar_1', tanggal: b[1].tanggal, unit: 'MI', nominal: Number(b[1].nominal), akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: b[1].penerima });
    const n1 = rows(srv, '05_TRANSAKSI').length;
    const c = srv.sb.opImportCommit({ modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' });
    rec('IE-22', 'data server berubah sejak pratinjau -> CONFLICT, tidak ada yang tersimpan', c.code === 'CONFLICT' && rows(srv, '05_TRANSAKSI').length === n1, c.code); }
  { const srv = fresh(); const b = GEN.rab(2); const p = plan(srv, 'rab', b);
    srv.sheets['08_ANGGARAN'][0].push('kolomBaru');
    const c = srv.sb.opImportCommit({ modul: 'rab', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' });
    const s2 = fresh(); s2.sheets['07_AKUN'][0][2] = 'jenisAkun'; const p2 = plan(s2, 'pengeluaran', GEN.pengeluaran(2));
    const s3 = fresh(); s3.sheets['05_TRANSAKSI'][0][15] = 'kategoriX'; const p3 = plan(s3, 'pengeluaran', GEN.pengeluaran(2));
    rec('IE-23', 'header sheet berubah -> CONFLICT (sejak pratinjau) / SCHEMA_MISMATCH (kolom wajib hilang), tanpa data kosong pengganti', c.code === 'CONFLICT' && rows(srv, '08_ANGGARAN').length === 1 && p2.code === 'SCHEMA_MISMATCH' && p3.code === 'SCHEMA_MISMATCH', [c.code, p2.code, p3.code].join(', ')); }
  { const srv = fresh(); delete srv.sheets['21_KATEGORI_PENGELUARAN']; const p = plan(srv, 'pengeluaran', GEN.pengeluaran(2));
    rec('IE-24', 'pembacaan backend tidak lengkap (sheet master hilang) -> pratinjau gagal tertutup', !p.ok && p.code === 'SCHEMA_MISMATCH', p.code + ' ' + p.message); }

  // ---------- putus koneksi / parsial / kirim ulang ----------
  { const srv = fresh(); const b = GEN.pengeluaran(30); const p = plan(srv, 'pengeluaran', b);
    const base = { modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' };
    srv.sb.opImportCommit(Object.assign({ mulai: 0 }, base)); // respons hilang (klien tidak menerima hasil)
    const ulang = srv.sb.opImportCommit(Object.assign({ mulai: 0 }, base)); // pengiriman ulang potongan yang sama
    const lanjut = srv.sb.opImportCommit(Object.assign({ mulai: 20 }, base));
    const n = rows(srv, '05_TRANSAKSI').length - 2;
    rec('IE-25', 'respons terputus setelah penyimpanan + pengiriman ulang -> TIDAK_BERUBAH, lanjut potongan berikut, 0 ganda', ulang.ok && cnt(ulang.data.hasil, 'TIDAK_BERUBAH') === 20 && cnt(lanjut.data.hasil, 'TERSIMPAN') === 10 && n === 30 && lanjut.data.job.status === 'SELESAI',
      'ulang: ' + cnt(ulang.data.hasil, 'TIDAK_BERUBAH') + ' tidak berubah; lanjut: ' + cnt(lanjut.data.hasil, 'TERSIMPAN') + ' tersimpan; total transaksi baru ' + n); }
  { const srv = fresh(); const b = GEN.pengeluaran(5); const p = plan(srv, 'pengeluaran', b);
    const base = { modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' };
    srv.state.failSetValuesOn = '05_TRANSAKSI'; srv.state.failSetValuesSkip = 2; // baris ke-3 gagal ditulis (engine rollback)
    const c1 = srv.sb.opImportCommit(base);
    const st = c1.data.hasil.map(h => h.status), it = srv.sb.opImportReviewList({}).data.items;
    const c2 = srv.sb.opImportCommit(base);
    const it2 = srv.sb.opImportReviewList({}).data.items;
    rec('IE-26', 'penyimpanan parsial: baris gagal dilaporkan per baris + antrean GAGAL_SIMPAN; ulang -> hanya baris gagal tersimpan, tinjauan ditutup', J(st) === J(['TERSIMPAN', 'TERSIMPAN', 'GAGAL', 'TERSIMPAN', 'TERSIMPAN']) && it.some(x => x.jenis === 'GAGAL_SIMPAN') && J(c2.data.hasil.map(h => h.status)) === J(['TIDAK_BERUBAH', 'TIDAK_BERUBAH', 'TERSIMPAN', 'TIDAK_BERUBAH', 'TIDAK_BERUBAH']) && rows(srv, '05_TRANSAKSI').length === 7 && !it2.some(x => x.jenis === 'GAGAL_SIMPAN') && c2.data.job.status === 'SELESAI',
      'percobaan 1 ' + J(st) + ' / percobaan 2 ' + J(c2.data.hasil.map(h => h.status))); }
  { const srv = fresh(); const b = GEN.pengeluaran(4); const p = plan(srv, 'pengeluaran', b);
    const base = { modul: 'pengeluaran', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' };
    srv.state.failSetValuesOn = '13_AUDIT_LOG'; srv.state.failSetValuesSkip = 4; // 4 audit engine OK, audit log impor gagal
    const c1 = srv.sb.opImportCommit(base); const logN1 = rows(srv, '32_IMPOR_BARIS').length;
    const c2 = srv.sb.opImportCommit(base);
    rec('IE-27', 'server terputus antara simpan dan log impor -> data tersimpan, log GAGAL dipulihkan; ulang -> TIDAK_BERUBAH (idempotensi engine) + log lengkap', c1.data.logStatus.indexOf('GAGAL') === 0 && logN1 === 0 && cnt(c1.data.hasil, 'TERSIMPAN') === 4 && cnt(c2.data.hasil, 'TIDAK_BERUBAH') === 4 && c2.data.logStatus === 'OK' && rows(srv, '05_TRANSAKSI').length === 6 && rows(srv, '32_IMPOR_BARIS').length === 4,
      'log1 ' + c1.data.logStatus + ', baris log ' + logN1 + ' -> ' + rows(srv, '32_IMPOR_BARIS').length); }
  { const srv = fresh(); const b = GEN.rab(3); const p = plan(srv, 'rab', b);
    const base = { modul: 'rab', baris: b, sumber: SUMBER, planHash: p.data.planHash, konfirmasi: 'IMPOR_DATA' };
    srv.state.failSetValuesOn = '13_AUDIT_LOG'; const c1 = srv.sb.opImportCommit(base); const n1 = rows(srv, '08_ANGGARAN').length;
    const c2 = srv.sb.opImportCommit(base);
    rec('IE-28', 'RAB: audit gagal -> potongan dibatalkan seluruhnya (atomik); ulang -> tersimpan sekali', c1.code === 'AUDIT_FAILED' && n1 === 1 && cnt(c2.data.hasil, 'TERSIMPAN') === 3 && rows(srv, '08_ANGGARAN').length === 4, c1.code + ' -> ' + J(c2.data.hasil.map(h => h.status))); }

  // ---------- siswa ----------
  { const srv = fresh(); const b = [{ nama: 'Baru Satu', unit: 'MI', kelas: '1A', nisn: '1111111111', tahunAjaran: '2026/2027', tanggalMasuk: '05/09/2026', jenisKelamin: 'L' }, { nama: 'Baru Dua', unit: 'MI', kelas: '1A', nisn: '1111111111', tahunAjaran: '2026/2027' },
      { nama: 'HANA', unit: 'MI', kelas: 'Madinah', nisn: '', tahunAjaran: '2026/2027' }, { nama: 'Tanpa TA', unit: 'MI', kelas: '1A' }, { nama: 'Masuk Salah', unit: 'MI', kelas: '1A', tahunAjaran: '2026/2027', tanggalMasuk: '31/02/2026' }];
    const r = importAll(srv, 'siswa', b), rr = r.plan.data.rows, H = srv.sheets['01_SISWA'][0];
    const s = rows(srv, '01_SISWA').find(x => x[H.indexOf('nama')] === 'Baru Satu');
    rec('IE-29', 'siswa: tanggalMasuk dinormalisasi & tersimpan, jenisKelamin tersimpan; NISN ganda dalam berkas; sudah ada; TA wajib eksplisit; tanggal salah', J(rr.map(x => x.kelas)) === J(['VALID', 'DUPLIKAT', 'SUDAH_ADA', 'PERLU_KEPUTUSAN', 'TOLAK']) && s && s[H.indexOf('tanggalMasuk')] === '2026-09-05' && s[H.indexOf('jenisKelamin')] === 'L' && rr[3].keputusanPerlu[0].saran === '2026/2027',
      J(rr.map(x => x.kelas + ':' + x.kode.join(','))));
    const up = [{ nama: 'HANA', unit: 'MI', kelas: 'Madinah', tahunAjaran: '2026/2027', tanggalMasuk: '2026-08-01', kontakWali: '0812' }];
    const p1 = plan(srv, 'siswa', up, { modeSiswa: 'TAMBAH_PERBARUI' });
    const r2 = importAll(srv, 'siswa', up, { modeSiswa: 'TAMBAH_PERBARUI', keputusan: { 0: { terimaPerubahanKewajiban: true } } });
    const h = rows(srv, '01_SISWA').find(x => x[0] === 's1');
    rec('IE-30', 'siswa mode pembaruan eksplisit: perubahan yang memengaruhi kewajiban butuh persetujuan; id siswa tetap', p1.data.rows[0].kelas === 'PERLU_KEPUTUSAN' && p1.data.rows[0].kode.includes('UBAH_KEWAJIBAN') && cnt(r2.hasil, 'TERSIMPAN') === 1 && h[H.indexOf('tanggalMasuk')] === '2026-08-01' && h[H.indexOf('kontakWali')] === '0812',
      p1.data.rows[0].kode.join(',') + ' -> ' + J(r2.hasil.map(x => x.status + ' ' + x.refId))); }

  // ---------- skala 10/50/100/500 + rekonsiliasi ----------
  { const out = [], bad = [];
    for (const modul of ['pengeluaran', 'pemasukan', 'rab', 'lpj', 'siswa']) {
      for (const n of [10, 50, 100, 500]) {
        const srv = fresh(); const t = TARGET[modul], n0 = rows(srv, t).length, s0 = NOMCOL[modul] ? sumCol(srv, t, 'nominal') : 0;
        const keep = {}; Object.keys(srv.sheets).filter(k => ![t, '06_ALOKASI', '13_AUDIT_LOG', '24_IDEMPOTENCY_LOG', '31_IMPOR_JOB', '32_IMPOR_BARIS', '33_IMPOR_TINJAUAN'].includes(k)).forEach(k => { keep[k] = J(srv.sheets[k]); });
        const t0 = Date.now(); const r = importAll(srv, modul, GEN[modul](n)); const ms = Date.now() - t0;
        const saved = rows(srv, t).length - n0, dSum = NOMCOL[modul] ? sumCol(srv, t, 'nominal') - s0 : null;
        const job = rows(srv, '31_IMPOR_JOB')[0], jc = h => job[col(srv, '31_IMPOR_JOB', h)];
        const again = importAll(srv, modul, GEN[modul](n));
        const untouched = Object.keys(keep).every(k => keep[k] === J(srv.sheets[k]));
        const ok = !r.err && saved === n && cnt(r.hasil, 'TERSIMPAN') === n && (dSum === null || (dSum === r.plan.data.total.nominalSumber && dSum === jc('nominalTersimpan'))) && jc('status') === 'SELESAI' && rows(srv, t).length - n0 === n && cnt(again.hasil, 'TIDAK_BERUBAH') === n && untouched;
        if (!ok) bad.push(modul + n + J({ err: r.err && r.err.code, saved, dSum, src: r.plan.data && r.plan.data.total, job: jc('status'), again: cnt(again.hasil, 'TIDAK_BERUBAH'), untouched }));
        out.push(modul + ' ' + n + ': tersimpan ' + saved + ', RPC commit ' + r.calls + (dSum !== null ? ', Σsumber ' + r.plan.data.total.nominalSumber + ' = Σtersimpan ' + dSum : '') + ', ulang 0 baru, ' + ms + ' ms');
      }
    }
    rec('IE-31', 'skala 10/50/100/500 x 5 modul: tersimpan = dipilih, rekonsiliasi Σ sumber = Σ tersimpan = job.nominalTersimpan, impor ulang 0 baru, sheet lain tidak berubah', !bad.length, bad.length ? bad.join(' | ') : out.join(' | ')); }
  { const out = [];
    for (const n of [10, 50, 100, 500]) {
      const srv = fresh(); const b = GEN.pengeluaran(n); importAll(srv, 'pengeluaran', b.filter((_, i) => i % 20 === 0)); // 5% sudah ada di server (berkas lain)
      const mixed = b.map((r, i) => i % 10 === 3 ? Object.assign({}, r, { tanggal: '2026-02-30' }) : r);
      for (let i = 0; i < n; i += 20) mixed.push(Object.assign({}, b[(i + 7) % n])); // 5% duplikat dalam berkas
      const n0 = rows(srv, '05_TRANSAKSI').length, s0 = sumCol(srv, '05_TRANSAKSI', 'nominal');
      const r = importAll(srv, 'pengeluaran', mixed), k = r.plan.data.ringkasan;
      const dN = rows(srv, '05_TRANSAKSI').length - n0, dS = sumCol(srv, '05_TRANSAKSI', 'nominal') - s0;
      out.push({ n, baris: mixed.length, VALID: k.VALID || 0, TOLAK: k.TOLAK || 0, DUPLIKAT: k.DUPLIKAT || 0, tersimpan: dN, ok: dN === k.dipilih && dS === r.plan.data.total.nominalDipilih });
    }
    rec('IE-32', 'skala campuran (10% tanggal tidak valid, 5% duplikat dalam berkas, 5% sudah ada di server): tersimpan = VALID terpilih, Σ = Σ dipilih', out.every(o => o.ok && o.TOLAK > 0 && o.DUPLIKAT > 0), J(out)); }
  { const srv = fresh(); const b = []; for (let i = 0; i < 25; i++) b.push({ tanggal: '2026-10-0' + (1 + i % 9), nominal: '10000', unit: 'MI', akun: 'Kasir', metode: 'Tunai', sumber: 'Pembayaran Siswa', namaSiswa: 'HANA', kelas: 'Madinah', komponen: 'SPP', ftNumber: 'F' + i });
    const r = importAll(srv, 'pemasukan', b);
    const A = rows(srv, '06_ALOKASI').filter(a => a[col(srv, '06_ALOKASI', 'siswaId')] === 's1');
    rec('IE-33', 'planHash stabil antar potongan saat alokasi baris awal mengurangi sisa kewajiban (25 baris, 2 potongan)', !r.err && r.calls === 2 && cnt(r.hasil, 'TERSIMPAN') + r.plan.data.rows.filter(x => !x.dipilih).length === 25, (r.err ? 'ERR ' + r.err.code : 'potongan ' + r.calls) + ', tersimpan ' + cnt(r.hasil, 'TERSIMPAN') + ', kelas ' + J(r.plan.data.ringkasan) + ', alokasi s1 ' + A.length); }

  // ---------- status & tinjauan ----------
  { const srv = fresh(); const one = GEN.pengeluaran(1)[0]; const r = importAll(srv, 'pengeluaran', [one, Object.assign({}, one)]);
    const st = srv.sb.opImportStatus(r.plan.data.batchId); const it = srv.sb.opImportReviewList({}).data.items;
    const rs = srv.sb.opImportReviewResolve({ id: it[0].id, keputusan: 'DIABAIKAN', catatan: 'pembelian sama, sudah dicek' });
    const rs2 = srv.sb.opImportReviewResolve({ id: it[0].id, keputusan: 'DIABAIKAN' });
    srv.state.email = 'auditor@x.id'; const ra = srv.sb.opImportReviewResolve({ id: it[0].id, keputusan: 'DIABAIKAN' }); const sa = srv.sb.opImportStatus(r.plan.data.batchId);
    rec('IE-34', 'status impor + antrean tinjauan server (bukan localStorage); selesai beraudit; AUDITOR baca saja', st.ok && st.data.job.status === 'SELESAI' && st.data.baris.length === 1 && it.length === 1 && it[0].jenis === 'DUPLIKAT' && rs.ok && rs2.data.unchanged === true && ra.code === 'ROLE_NOT_ALLOWED' && sa.ok && srv.sheets['13_AUDIT_LOG'].some(x => x[2] === 'IMPORT_REVIEW_RESOLVE'),
      'job ' + st.data.job.status + ', tinjauan ' + J(it.map(x => x.jenis)) + ', resolve ' + rs.code); }
  { const srv = fresh(); const r = importAll(srv, 'pengeluaran', GEN.pengeluaran(3)); const ak = srv.sheets['13_AUDIT_LOG'].slice(1).map(x => x[2]);
    rec('IE-35', 'jejak audit: CREATE_TRANSACTION per baris (jalur engine) + IMPORT_COMMIT_CHUNK + IMPORT_DONE', ak.filter(a => a === 'CREATE_TRANSACTION').length === 3 && ak.includes('IMPORT_COMMIT_CHUNK') && ak.includes('IMPORT_DONE'), J(ak.filter(a => /IMPORT|CREATE_TRANSACTION/.test(a)))); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
