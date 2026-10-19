/* Suite D-2 PENERIMAAN UNTUK BEBERAPA SISWA (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * Kebijakan disetujui dengan kontrol ketat: satu PENERIMAAN (tanpa siswaId) boleh dialokasikan ke beberapa siswa; setiap alokasi
 * = siswa + kewajiban (komponen) + periode + nominal; batas transaksi & sisa kewajiban di dalam kunci; retry idempoten.
 * Fixture: SPP MI 200.000/bulan; s1 Juli & Agustus 2026 belum bayar (September lunas); s2 Juli, Agustus, September belum bayar.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function fresh() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const alk = srv => srv.sheets['06_ALOKASI'].slice(1);
const trxN = srv => srv.sheets['05_TRANSAKSI'].length - 1;
const ob = (srv, sid, per) => { const r = srv.sb.opObligations({ siswaId: sid, periode: per }); const x = r.ok && r.data.rows.find(o => o.komponenId === 'kmp_spp' && o.periode === per); return x ? { terbayar: x.terbayar, sisa: x.sisa, status: x.status } : null; };
const base = { tanggal: '2026-09-10', unit: 'MI', akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa' };
const A = (siswaId, periode, nominal, komponenId) => ({ siswaId, komponenId: komponenId === undefined ? 'kmp_spp' : komponenId, periode, nominal });
const inc = (srv, crid, nominal, allocations, extra) => srv.sb.opCreateIncome(Object.assign({}, base, { nominal, clientRequestId: crid, allocations }, extra || {}));
const code = r => r && (r.ok ? 'OK' : r.code);

(async () => {
  { const srv = fresh(); const a0 = alk(srv).length;
    const r = inc(srv, 'd2_1', 400000, [A('s1', 'Agustus 2026', 200000), A('s2', 'September 2026', 200000)]);
    const t = r.ok && r.data.transaction, rows = alk(srv).slice(a0);
    rec('D2-01', 'satu penerimaan tanpa siswaId dialokasikan ke 2 siswa: 2 baris 06_ALOKASI (siswa, komponen, periode, nominal masing-masing); kedua kewajiban LUNAS; transaksi.siswaId kosong',
      r.ok && t.siswaId === '' && rows.length === 2 && J(rows.map(x => [x[2], x[3], x[4], x[5]])) === J([['s1', 'kmp_spp', 'Agustus 2026', 200000], ['s2', 'kmp_spp', 'September 2026', 200000]]) && ob(srv, 's1', 'Agustus 2026').status === 'LUNAS' && ob(srv, 's2', 'September 2026').status === 'LUNAS',
      J({ alokasi: rows.map(x => [x[2], x[4], x[5]]), s1: ob(srv, 's1', 'Agustus 2026'), s2: ob(srv, 's2', 'September 2026') })); }
  { const srv = fresh(); const a0 = alk(srv).length, t0 = trxN(srv);
    const c = [inc(srv, 'd2_2a', 200000, [A('s1', 'Agustus 2026', 100000), A('s2', '', 100000)]), inc(srv, 'd2_2b', 200000, [A('s1', 'Agustus 2026', 100000), A('s2', 'Juli 2026', 100000, '')]),
      inc(srv, 'd2_2c', 200000, [A('', 'Agustus 2026', 100000)]), inc(srv, 'd2_2d', 200000, [A('s1', 'Agustus 2026', 0)])].map(code);
    rec('D2-02', 'setiap alokasi wajib siswa + kewajiban (komponen) + periode + nominal > 0: periode kosong / komponen kosong / siswa kosong / nominal 0 -> ditolak seluruhnya, 0 transaksi & 0 alokasi',
      J(c) === J(['VALIDATION_ERROR', 'VALIDATION_ERROR', 'VALIDATION_ERROR', 'VALIDATION_ERROR']) && alk(srv).length === a0 && trxN(srv) === t0, J(c)); }
  { const srv = fresh(); const a0 = alk(srv).length, t0 = trxN(srv);
    const x1 = inc(srv, 'd2_3a', 300000, [A('s1', 'Agustus 2026', 200000), A('s2', 'Juli 2026', 200000)]);
    const x2 = inc(srv, 'd2_3b', 500000, [A('s1', 'Agustus 2026', 200000), A('s2', 'Juli 2026', 250000)]);
    const x3 = inc(srv, 'd2_3c', 500000, [A('s1', 'September 2026', 50000)]);
    rec('D2-03', 'alokasi berlebih: Σ alokasi > nominal -> ALLOCATION_EXCEEDS_TRANSACTION; alokasi > sisa kewajiban (salah satu siswa) atau ke kewajiban yang sudah lunas -> ditolak; tidak ada tulisan parsial',
      code(x1) === 'ALLOCATION_EXCEEDS_TRANSACTION' && !x2.ok && !x3.ok && alk(srv).length === a0 && trxN(srv) === t0, [code(x1), code(x2), code(x3)].join(' ')); }
  { const srv = fresh(); const a0 = alk(srv).length;
    const p1 = inc(srv, 'd2_4a', 150000, [A('s2', 'Juli 2026', 150000)]), p2 = inc(srv, 'd2_4b', 150000, [A('s2', 'Juli 2026', 150000)]);
    const multi = inc(srv, 'd2_4c', 300000, [A('s1', 'Juli 2026', 100000)]);
    const tid = multi.ok && multi.data.id;
    const q1 = srv.sb.opCreateAllocation({ transaksiId: tid, siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 150000, clientRequestId: 'd2_4d' });
    const q2 = srv.sb.opCreateAllocation({ transaksiId: tid, siswaId: 's1', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 100000, clientRequestId: 'd2_4e' });
    const ss = ob(srv, 's2', 'Juli 2026');
    rec('D2-04', 'pembayaran bersamaan ke kewajiban yang sama (sisa 200.000; 150.000 + 150.000): yang kedua ditolak (sisa dibaca ulang di kunci); alokasi tambahan ke transaksi multi-siswa ditolak bila Σ melebihi nominal transaksi',
      p1.ok && !p2.ok && ss.terbayar === 150000 && ss.sisa === 50000 && q1.ok && !q2.ok && alk(srv).length === a0 + 3, J({ p2: code(p2), s2Juli: ss, q1: code(q1), q2: code(q2) })); }
  { const srv = fresh(); const a0 = alk(srv).length, t0 = trxN(srv);
    const al = [A('s1', 'Juli 2026', 200000), A('s2', 'Juli 2026', 200000)];
    const r1 = inc(srv, 'd2_5', 400000, al), r2 = inc(srv, 'd2_5', 400000, al), r3 = inc(srv, 'd2_5', 400000, al);
    rec('D2-05', 'retry dengan clientRequestId sama (3x) -> satu transaksi, 2 alokasi, id sama (tidak menggandakan alokasi)', r1.ok && r2.ok && r3.ok && r1.data.id === r2.data.id && r2.data.id === r3.data.id && trxN(srv) === t0 + 1 && alk(srv).length === a0 + 2,
      J({ ids: [r1.data.id, r2.data.id, r3.data.id].map(x => x.slice(-6)), trx: trxN(srv) - t0, alk: alk(srv).length - a0 })); }
  { const srv = fresh();
    const w1 = inc(srv, 'd2_6a', 200000, [A('s2', 'Juli 2026', 200000)], { siswaId: 's1' });
    const w2 = inc(srv, 'd2_6b', 200000, [A('s_fiktif', 'Juli 2026', 200000)]);
    const okm = inc(srv, 'd2_6c', 400000, [A('s1', 'Juli 2026', 200000), A('s2', 'Juli 2026', 200000)]);
    const mv = srv.sb.opUpdateTransaction({ id: okm.data.id, siswaId: 's1' });
    const single = inc(srv, 'd2_6d', 200000, [A('s1', 'Agustus 2026', 100000)], { siswaId: 's1' });
    const w3 = srv.sb.opCreateAllocation({ transaksiId: single.data.id, siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 50000, clientRequestId: 'd2_6e' });
    rec('D2-06', 'salah siswa: transaksi ber-siswaId s1 dengan alokasi s2 -> INVALID_ALLOCATION; siswa tidak ada -> OBLIGATION_NOT_FOUND (pengaman alokasi di kunci); siswa transaksi multi-siswa tidak dapat dipindah diam-diam (ALLOCATION_LOCKED); alokasi susulan siswa lain ke transaksi ber-siswaId -> INVALID_ALLOCATION',
      code(w1) === 'INVALID_ALLOCATION' && code(w2) === 'OBLIGATION_NOT_FOUND' && okm.ok && code(mv) === 'ALLOCATION_LOCKED' && single.ok && code(w3) === 'INVALID_ALLOCATION', [code(w1), code(w2), code(mv), code(w3)].join(' ')); }
  { const srv = fresh(); const a0 = alk(srv).length, t0 = trxN(srv);
    const e1 = srv.sb.opCreateExpense(Object.assign({}, base, { kategori: 'ATK', penerima: 'Toko', nominal: 100000, clientRequestId: 'd2_7a', allocations: [A('s2', 'Juli 2026', 100000)] }));
    const e2 = srv.sb.opCreateAllocation({ transaksiId: 'imp_trx_2', siswaId: 's2', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 10000, clientRequestId: 'd2_7b' });
    const e3 = srv.sb.opCreateExpense(Object.assign({}, base, { kategori: 'ATK', penerima: 'Toko', nominal: 100000, clientRequestId: 'd2_7c' }));
    rec('D2-07', 'transaksi PENGELUARAN: opCreateExpense dengan allocations -> INVALID_ALLOCATION (tidak lagi dibuang diam-diam, 0 transaksi); alokasi susulan ke pengeluaran -> INVALID_ALLOCATION; pengeluaran tanpa alokasi tetap dibuat',
      code(e1) === 'INVALID_ALLOCATION' && code(e2) === 'INVALID_ALLOCATION' && e3.ok && trxN(srv) === t0 + 1 && alk(srv).length === a0, [code(e1), code(e2), code(e3)].join(' ')); }
  { const srv = fresh(); const a0 = alk(srv).length;
    const r = inc(srv, 'd2_8', 500000, [A('s1', 'Juli 2026', 200000)]);
    const rows = alk(srv).slice(a0), s2 = ['Juli 2026', 'Agustus 2026', 'September 2026'].map(p => ob(srv, 's2', p).status), s1a = ob(srv, 's1', 'Agustus 2026').status;
    rec('D2-08', 'sisa penerimaan TIDAK dialokasikan otomatis: penerimaan 500.000 dengan alokasi 200.000 -> tepat 1 alokasi; kewajiban lain (s1 Agustus, s2 semua) tetap BELUM BAYAR',
      r.ok && rows.length === 1 && s1a === 'BELUM BAYAR' && s2.every(x => x === 'BELUM BAYAR'), J({ alokasi: rows.length, status: r.data && r.data.transaction.status, s1Agustus: s1a, s2 })); }
  { const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8');
    const pola = { 'profil siswa riwayat (t.siswaId===id)': /OperationalAPI\.transaksi\(\)\.filter\(t=>t\.siswaId===id && t\.jenis==='PENERIMAAN'\)/, 'kelebihan bayar per siswa (t.siswaId===siswaId)': /penerimaanListReal\(\)\.filter\(t=>t\.siswaId===siswaId && hasilPembayaranTransaksi/, 'cek over-alokasi hanya transaksi ber-siswaId': /penerimaan\.filter\(t=>t\.siswaId\)\.forEach/, 'Edit Alokasi cepat hanya transaksi ber-siswaId': /const quickBtn = t\.siswaId \?/ };
    const ada = Object.fromEntries(Object.entries(pola).map(([k, re]) => [k, re.test(html)]));
    rec('D2-09', 'AUDIT ketergantungan siswaId (klien, tidak diubah): tampilan yang hanya membaca transaksi.siswaId tidak menampilkan penerimaan multi-siswa per siswa; skema cukup (06_ALOKASI.siswaId per baris, tanpa perubahan skema); KPI tidak berubah', null, J(ada)); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
