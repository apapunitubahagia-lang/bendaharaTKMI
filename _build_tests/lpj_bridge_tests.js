/* Suite INTEGRASI SERVERBRIDGE LPJ (P1_23; sandbox Node klien <-> server, TIDAK menyentuh Google Sheets / Apps Script).
 * Kontrak ServerBridge opLinkLpj / opCreateExpenseFromLpj / opUnlinkLpj (+ setup skema), tombol "Buat Transaksi dari LPJ" lewat server,
 * klik ganda, retry, respons hilang, konflik, validasi server, satu jalur efektif, perbandingan dengan heuristik 62 hari.
 * Fixture: imp_trx_2 PENGELUARAN ATK MI 2026-09-05 Rp50.000.
 */
const fs = require('fs');
const { makeServer, OUT } = require('./srv_env.js');
const { makeClient, bridgeNames } = require('./client_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(c, m) { for (let i = 0; i < m; i++) { if (c()) return true; await tick(2); } return false; }
const J = o => JSON.stringify(o);
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
function srvBaru(setup) { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); if (setup) s.sb.opUangMukaLpjSetup('BUAT_SKEMA_UANG_MUKA_LPJ');
  s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { tanggal: '2026-09-25', unit: 'MI', kategori: 'ATK', item: 'Kertas HVS', nominal: 45000, status: 'REALIZATION' } },
    { op: 'upsert', id: 'lpj_b', row: { tanggal: '2026-09-26', unit: 'MI', kategori: 'ATK', item: 'Tinta', nominal: 20000, status: 'REALIZATION' } }]); return s; }
async function boot(srv) { const c = makeClient(srv); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => c.a.CentralMasterData.ready && Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded || c.a.OperationalCache.states[k].error), 400); await tick(5); return c; }
const isi = (c, o) => { Object.assign(c.fields, { ltu_unit: 'MI', ltu_akun: 'akun_kas1', ltu_kategori: 'ATK' }, o || {}); };
const trxDariLpj = s => rows(s, '05_TRANSAKSI').filter(r => /Dari LPJ|LPJ/.test(String(r[s.sheets['05_TRANSAKSI'][0].indexOf('catatan')])));
const sync = async c => { for (let i = 0; i < 4; i++) { await c.sb.centralRunSync(true); await tick(10); } };

(async () => {
  { const html = fs.readFileSync(OUT + 'ServerBridge.js', 'utf8'); const srv = makeServer();
    const perlu = ['opLinkLpj', 'opCreateExpenseFromLpj', 'opUnlinkLpj', 'opUangMukaLpjPlan', 'opUangMukaLpjSetup'];
    rec('BR-01', 'kontrak ServerBridge: 5 operasi LPJ/skema ada di bridge & server dengan nama sama; opLpjVerifikasi / opUangMukaCair TIDAK diekspos (verifikasi nonaktif, GAP-005)', perlu.every(n => bridgeNames.includes(n) && typeof srv.sb[n] === 'function') && !bridgeNames.includes('opLpjVerifikasi') && !bridgeNames.includes('opUangMukaCair'),
      J({ ada: perlu.filter(n => bridgeNames.includes(n)), verifikasi: bridgeNames.includes('opLpjVerifikasi') })); }
  { // sebelum setup: jalur lama apa adanya (keputusan sinkron)
    const s = srvBaru(false); const c = await boot(s); isi(c); const k0 = c.calls.length; const r = c.sb.createTransaksiFromLpj('lpj_a');
    rec('BR-02', 'sebelum setup skema: tombol tetap memakai jalur lama P0-T1 secara sinkron (tanpa panggilan opCreateExpenseFromLpj); heuristik 62 hari jalur lama aktif (memblokir karena ada PENGELUARAN ATK MI 05-09)', !c.calls.slice(k0).includes('opCreateExpenseFromLpj') && /DIBLOKIR - kemungkinan tercatat ganda/.test(c.toast()) && !(r && r.then),
      c.toast().slice(0, 90)); }
  { const s = srvBaru(true); const c = await boot(s); isi(c); const n0 = rows(s, '05_TRANSAKSI').length;
    const p1 = c.sb.createTransaksiFromLpj('lpj_a'), p2 = c.sb.createTransaksiFromLpj('lpj_a'); const r1 = await p1, r2 = await p2;
    const L = obj(s, '19_LPJ', 'lpj_a'), lokal = c.a.Store.loadTransaksi().filter(t => /^trx_lpj_/.test(t.id));
    rec('BR-03', 'sesudah setup: tombol memanggil opCreateExpenseFromLpj; klik ganda -> panggilan kedua SEDANG_DIPROSES; tepat 1 transaksi server bertaut + riwayat 34; tidak ada transaksi lokal trx_lpj_; heuristik 62 hari TIDAK dipakai (pengeluaran 05-09 tidak memblokir); LPJ di klien terbaca bertaut setelah muat ulang',
      r1.ok && r2.code === 'SEDANG_DIPROSES' && rows(s, '05_TRANSAKSI').length === n0 + 1 && L.transaksiId === r1.data.transaksiId && rows(s, '34_LPJ_TAUTAN').length === 1 && lokal.length === 0 && c.a.Store.loadLpj().find(x => x.id === 'lpj_a').transaksiId === r1.data.transaksiId,
      J({ r1: r1.ok, r2: r2.code, trx: rows(s, '05_TRANSAKSI').length - n0 })); }
  { const s = srvBaru(true); const c1 = await boot(s), c2 = await boot(s); isi(c1); isi(c2); const n0 = rows(s, '05_TRANSAKSI').length;
    const a = await c1.sb.createTransaksiFromLpj('lpj_a'), b = await c2.sb.createTransaksiFromLpj('lpj_a');
    rec('BR-04', 'dua klien (klik di dua perangkat) untuk LPJ yang sama: klien kedua mendapat replay transaksi yang sama, tetap 1 transaksi', a.ok && b.ok && b.data.replay && b.data.transaksiId === a.data.transaksiId && rows(s, '05_TRANSAKSI').length === n0 + 1, J({ b: b.data })); }
  { const s = srvBaru(true); const c = await boot(s); isi(c); const n0 = rows(s, '05_TRANSAKSI').length;
    c.fault.mode = 'lostOnce'; c.fault.only = /^opCreateExpenseFromLpj$/; const a = await c.sb.createTransaksiFromLpj('lpj_a'); const t1 = c.toast();
    const b = await c.sb.createTransaksiFromLpj('lpj_a');
    rec('BR-05', 'gangguan jaringan (server memproses, respons hilang): klien melapor gagal + "aman diulang"; ulang -> replay transaksi yang sama; tepat 1 transaksi', !a.ok && /aman diulang/.test(t1) && b.ok && b.data.replay && rows(s, '05_TRANSAKSI').length === n0 + 1, J({ a: a.code, b: b.ok && b.data.replay })); }
  { const s = srvBaru(true); const c = await boot(s); const n0 = rows(s, '05_TRANSAKSI').length; const r = [];
    for (const o of [{ ltu_akun: 'akun_fiktif' }, { ltu_kategori: 'Kategori Fiktif' }, { ltu_unit: 'XX' }]) { isi(c, o); r.push((await c.sb.createTransaksiFromLpj('lpj_a')).code); }
    rec('BR-06', 'validasi server lewat bridge: akun tidak valid / kategori bukan master / unit tidak sah -> ditolak server, 0 transaksi, LPJ tetap belum bertaut', r.every(x => x && x !== 'OK') && rows(s, '05_TRANSAKSI').length === n0 && obj(s, '19_LPJ', 'lpj_a').transaksiId === '', J(r)); }
  { const s = srvBaru(true); const c = await boot(s); isi(c); const n0 = rows(s, '05_TRANSAKSI').length;
    const pub = s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_b', row: { transaksiId: 'imp_trx_2' } }]).data.results[0].code; const lama = c.sb.createTransaksiFromLpjLama_('lpj_b');
    rec('BR-07', 'satu jalur efektif: setelah setup, tautan lewat opRecordBatch("lpj") publik -> GUNAKAN_OPERASI_TAUTAN; jalur lama tidak dapat dipanggil langsung (JALUR_LAMA_HANYA_FALLBACK); 0 transaksi', pub === 'GUNAKAN_OPERASI_TAUTAN' && lama.code === 'JALUR_LAMA_HANYA_FALLBACK' && rows(s, '05_TRANSAKSI').length === n0, J({ pub, lama: lama.code })); }
  { const s = srvBaru(true); const c = await boot(s); c.fields.lpl_trx = 'imp_trx_2'; c.fields.lpl_alasan = '';
    const a = await c.sb.linkLpj('lpj_a'); c.fields.lpu_alasan = 'salah'; const u0 = await c.sb.unlinkLpj('lpj_a'); c.fields.lpu_alasan = 'Nota milik pembelian lain'; const u1 = await c.sb.unlinkLpj('lpj_a');
    const T = rows(s, '34_LPJ_TAUTAN').map(r => r[3]);
    rec('BR-08', 'tautkan & lepas lewat bridge: tautkan ke transaksi yang ada; lepas tanpa alasan cukup -> ALASAN_WAJIB; dengan alasan -> lepas, riwayat DIBATALKAN, transaksi tetap ada, audit LPJ_UNLINK',
      a.ok && u0.code === 'ALASAN_WAJIB' && u1.ok && obj(s, '19_LPJ', 'lpj_a').transaksiId === '' && T.includes('DIBATALKAN') && obj(s, '05_TRANSAKSI', 'imp_trx_2') && rows(s, '13_AUDIT_LOG').some(r => r[2] === 'LPJ_UNLINK'), J({ a: a.ok, u0: u0.code, u1: u1.ok, riwayat: T })); }
  { const s = srvBaru(true); const c1 = await boot(s), c2 = await boot(s); // c2 memuat data sebelum c1 menautkan (basi)
    c1.fields.lpl_trx = 'imp_trx_2'; const a = await c1.sb.linkLpj('lpj_b');
    const t2 = s.sb.opCreateExpense({ tanggal: '2026-09-26', unit: 'MI', nominal: 20000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko lain', clientRequestId: 'br9' });
    c2.fields.lpl_trx = t2.data.id; const b = await c2.sb.linkLpj('lpj_b');
    rec('BR-09', 'konflik: klien kedua (data basi) menautkan LPJ yang sudah ditautkan klien pertama ke transaksi lain -> CONFLICT, tautan pertama tetap', a.ok && b.code === 'CONFLICT' && obj(s, '19_LPJ', 'lpj_b').transaksiId === 'imp_trx_2', J({ a: a.ok, b: b.code })); }
  { // perbandingan heuristik 62 hari vs jalur baru
    const sL = srvBaru(false), cL = await boot(sL); isi(cL); cL.sb.createTransaksiFromLpj('lpj_a'); const lama = /DIBLOKIR/.test(cL.toast()) ? 'DIBLOKIR (positif palsu: belanja sah lain ATK MI dalam 62 hari)' : 'DIBUAT';
    const sB = srvBaru(true), cB = await boot(sB); isi(cB); const baru = await cB.sb.createTransaksiFromLpj('lpj_a');
    sB.sb.opUangMukaCair({ kegiatan: 'Lomba', pelaksana: 'Pak A', nominal: 100000, tanggal: '2026-07-01', unit: 'MI', akunId: 'akun_bank1', kategori: 'ATK', clientRequestId: 'br10' });
    const um = rows(sB, '32_UANG_MUKA')[0][0]; sB.sb.opLpjAjukan({ lpjId: 'lpj_b', tanggalNota: '2026-09-26', uangMukaId: um }); await cB.sb.loadOperationalData(); const baruUM = await cB.sb.createTransaksiFromLpj('lpj_b');
    rec('BR-10', 'perbandingan: (a) belanja sah lain dalam 62 hari - jalur lama memblokir (positif palsu), jalur baru membuat transaksi; (b) LPJ uang muka yang dicairkan 87 hari sebelumnya - heuristik lama tidak akan mendeteksi (negatif palsu), jalur baru menolak LPJ_UANG_MUKA berdasarkan tautan eksplisit',
      /DIBLOKIR/.test(lama) && baru.ok && baruUM.code === 'LPJ_UANG_MUKA', J({ lama, baru: baru.ok, lpjUangMuka: baruUM.code }));
    rec('BR-11', 'RINGKASAN PERBANDINGAN (info): heuristik 62 hari dinonaktifkan untuk jalur baru; pencegah hitung ganda kini = clientRequestId lpj:<id> + Σ LPJ <= nominal + LPJ uang muka tidak dapat menjadi transaksi + tautan eksplisit', null, J({ jalurLama: lama, jalurBaru: 'DIBUAT', lpjUangMuka: baruUM.code })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
