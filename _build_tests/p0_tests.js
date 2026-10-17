/* Suite P0 (sandbox Node, TIDAK menyentuh Google Sheets).
 * Setiap tes menyatakan PERILAKU YANG DIHARAPKAN setelah perbaikan P0.
 * Dijalankan pada kode baseline (branch main) untuk membuktikan temuan mana yang terulang (FAIL = temuan terbukti),
 * lalu pada branch p0/implementasi untuk membuktikan perbaikan (PASS).
 * Status: PASS / FAIL / INFO (dicatat, bukan lulus/gagal; kriteria TC memerlukan lingkungan live).
 */
const fs = require('fs'), vm = require('vm'), cp = require('child_process'), path = require('path');
const { makeServer, OUT } = require('./srv_env.js');
const { makeClient, js } = require('./client_env.js');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'headers_backend.json'), 'utf8'));
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
async function until(cond, max) { for (let i = 0; i < (max || 200); i++) { if (cond()) return true; await tick(2); } return false; }
const rows = (srv, n) => srv.sheets[n].slice(1);
const col = (srv, n, h) => srv.sheets[n][0].map(x => String(x).trim()).indexOf(h);
const cnt = (srv, n) => srv.sheets[n].length - 1;
const audits = srv => rows(srv, '13_AUDIT_LOG');
const safe = (f) => { try { return f(); } catch (e) { return { ok: false, code: 'EXCEPTION', message: String(e && e.message || e) }; } };
const J = o => JSON.stringify(o);

/* sisipkan kolom bernama di indeks idx (header + data ikut bergeser, seperti "Insert column" di Sheets) */
function insertCol(srv, n, idx, name, val) { srv.sheets[n].forEach((r, i) => r.splice(idx, 0, i === 0 ? name : (val === undefined ? '' : val))); }
function swapCols(srv, n, a, b) { const A = col(srv, n, a), B = col(srv, n, b); srv.sheets[n].forEach(r => { const t = r[A]; r[A] = r[B]; r[B] = t; }); }
function incomePayload(extra) { return Object.assign({ jenis: 'PENERIMAAN', tanggal: '2026-09-10', unit: 'MI', nominal: 300000, akunId: 'akun_kas1', metode: 'Tunai', sumber: 'Pembayaran Siswa', clientRequestId: 'crid_' + Math.random().toString(36).slice(2) }, extra || {}); }

async function bootClient(srv, opts) {
  const c = makeClient(srv, opts); const A = c.a;
  c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth();
  await until(() => A.CentralAuth.checked && (!A.CentralAuth.authorized || Object.keys(A.OperationalCache.states).every(k => A.OperationalCache.states[k].loaded || A.OperationalCache.states[k].error)), 400);
  await tick(5);
  return c;
}

(async () => {
  // ================= P0-A: schema & pembacaan berbasis header =================
  { // TC-HDR-02a: kolom disisipkan di tengah 05_TRANSAKSI -> data tidak bergeser
    const srv = makeServer(); insertCol(srv, '05_TRANSAKSI', 3, 'kolomSisipan', 'X');
    const r = safe(() => srv.sb.opGetTransactions({}));
    const t = r.ok && r.data.find(x => x.id === 'imp_trx_1');
    rec('P0A-01', 'TC-HDR-02', !!t && t.nominal === 200000 && t.unit === 'MI' && t.akunId === 'akun_kas1', J(t || r).slice(0, 200));
  }
  { // TC-HDR-02b: penulisan transaksi baru tetap mengikuti nama kolom
    const srv = makeServer(); insertCol(srv, '05_TRANSAKSI', 3, 'kolomSisipan', '');
    const r = safe(() => srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 12345, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Toko', clientRequestId: 'hdr02b' }));
    const row = rows(srv, '05_TRANSAKSI').find(x => r.ok && x[col(srv, '05_TRANSAKSI', 'id')] === r.data.id);
    rec('P0A-02', 'TC-HDR-02', !!row && row[col(srv, '05_TRANSAKSI', 'nominal')] === 12345 && row[col(srv, '05_TRANSAKSI', 'unit')] === 'MI' && row[col(srv, '05_TRANSAKSI', 'kolomSisipan')] === '', J(r).slice(0, 160));
  }
  { // TC-HDR-02c: header wajib hilang -> SCHEMA_MISMATCH, bukan data bergeser
    const srv = makeServer(); srv.sheets['05_TRANSAKSI'][0][col(srv, '05_TRANSAKSI', 'nominal')] = 'nominalX';
    const r = safe(() => srv.sb.opGetTransactions({}));
    const w = safe(() => srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'hdr02c' }));
    rec('P0A-03', 'TC-HDR-02', r.ok === false && r.code === 'SCHEMA_MISMATCH' && w.ok === false && w.code === 'SCHEMA_MISMATCH' && cnt(srv, '05_TRANSAKSI') === 2, J({ r: [r.ok, r.code], w: [w.ok, w.code] }));
  }
  { // TC-HDR-03: urutan kolom 26_USER_ACCESS ditukar -> role tetap benar
    const srv = makeServer(); swapCols(srv, '26_USER_ACCESS', 'email', 'nama'); swapCols(srv, '26_USER_ACCESS', 'role', 'unit');
    const id = safe(() => srv.sb.getCurrentUserIdentity());
    const w = safe(() => srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'hdr03' }));
    rec('P0A-04', 'TC-HDR-03', id.authorized === true && id.role === 'BENDAHARA' && w.ok === true, J({ role: id.role, auth: id.authorized, w: w.code }));
  }
  { // TC-HDR-03b: kolom role hilang -> gagal tertutup
    const srv = makeServer(); srv.sheets['26_USER_ACCESS'][0][col(srv, '26_USER_ACCESS', 'role')] = 'peran';
    const id = safe(() => srv.sb.getCurrentUserIdentity());
    const w = safe(() => srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'hdr03b' }));
    rec('P0A-05', 'TC-HDR-03', id.authorized === false && id.code === 'SCHEMA_MISMATCH' && w.ok === false && cnt(srv, '05_TRANSAKSI') === 2, J({ id: [id.authorized, id.code], w: [w.ok, w.code] }));
  }
  { // TC-HDR-04: 01_SISWA berskema staging Fase 1C -> SCHEMA_MISMATCH (bukan nama = NISN)
    const srv = makeServer(); const h = FIX.BACKEND_FASE1C['01_SISWA'];
    srv.sheets['01_SISWA'] = [h.slice(), h.map(x => ({ siswaId: 'SIS-9001', nisn: '0012345678', nama: 'UJI STAGING', unit: 'MI', statusSiswa: 'AKTIF' })[x] || '')];
    const r = safe(() => srv.sb.getStudents());
    rec('P0A-06', 'TC-HDR-04', r.ok === false && r.code === 'SCHEMA_MISMATCH', J(r).slice(0, 200));
  }
  { // header backend FINAL (spasi di " role"/"status ", kolom tambahan) tetap terbaca benar
    const srv = makeServer(); const F = FIX.FINAL;
    ['01_SISWA', '26_USER_ACCESS', '05_TRANSAKSI', '06_ALOKASI'].forEach(n => {
      const old = srv.sheets[n], oh = old[0].map(x => String(x).trim());
      srv.sheets[n] = [F[n].slice()].concat(old.slice(1).map(r => F[n].map(h => { const i = oh.indexOf(String(h).trim()); return i >= 0 ? r[i] : ''; })));
    });
    const id = safe(() => srv.sb.getCurrentUserIdentity()); const s = safe(() => srv.sb.getStudents());
    rec('P0A-07', 'kompatibilitas FINAL', id.authorized === true && id.role === 'BENDAHARA' && s.ok === true && s.data.some(x => x.id === 's1' && x.nama === 'HANA'), J({ id: [id.authorized, id.role, id.code], s: s.ok }));
  }
  { // TC-HDR-01: laporan skema terhadap header FINAL (kriteria TC butuh migrasi aditif yang disetujui -> INFO)
    const srv = makeServer(); Object.keys(FIX.FINAL).forEach(n => { if (!/^\d\d_/.test(n)) return; const old = srv.sheets[n] || [[]], oh = old[0].map(x => String(x).trim()); srv.sheets[n] = [FIX.FINAL[n].slice()].concat(n === '26_USER_ACCESS' ? old.slice(1).map(r => FIX.FINAL[n].map(h => { const i = oh.indexOf(String(h).trim()); return i >= 0 ? r[i] : ''; })) : []); });
    const r = safe(() => srv.sb.opSchemaReport());
    const sum = r.ok ? r.data.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {}) : r;
    rec('P0A-08', 'TC-HDR-01', null, 'opSchemaReport atas header FINAL: ' + J(sum));
  }

  { // mesin hitung (kewajiban/FCC) juga gagal tertutup bila kolom wajib hilang
    const srv = makeServer(); srv.sheets['01_SISWA'][0][col(srv, '01_SISWA', 'kelas')] = 'kelasX';
    const o = safe(() => srv.sb.opObligations({}));
    const srv2 = makeServer(); srv2.sheets['07_AKUN'][0][col(srv2, '07_AKUN', 'saldoAwal')] = 'saldo';
    const f = safe(() => srv2.sb.opFinancialControl('September 2026'));
    rec('P0A-09', 'GAP-002', o.code === 'SCHEMA_MISMATCH' && f.code === 'SCHEMA_MISMATCH', J([o.code, f.code]));
  }

  // ================= P0-B: penulisan server & konsistensi =================
  { // TC-CRUD-01
    const srv = makeServer();
    const a = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 0, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'c1a' });
    const b = srv.sb.opCreateExpense({ tanggal: '17/10/2026', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'c1b' });
    const c = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'SD', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'c1c' });
    rec('P0B-01', 'TC-CRUD-01', a.code === 'VALIDATION_ERROR' && a.field === 'nominal' && b.field === 'tanggal' && c.field === 'unit' && cnt(srv, '05_TRANSAKSI') === 2, J([a.field, b.field, c.field]));
  }
  { // TC-CRUD-02: tanggal sel bertipe Date; patch status saja
    const srv = makeServer(); const ti = col(srv, '05_TRANSAKSI', 'tanggal');
    srv.sheets['05_TRANSAKSI'][2][ti] = new Date(Date.UTC(2026, 8, 5));
    const id = srv.sheets['05_TRANSAKSI'][2][0];
    const r = safe(() => srv.sb.opUpdateTransaction({ id, status: 'SELESAI' }));
    const row = srv.sheets['05_TRANSAKSI'][2];
    rec('P0B-02', 'TC-CRUD-02', r.ok === true && row[col(srv, '05_TRANSAKSI', 'status')] === 'SELESAI' && String(row[ti] instanceof Date ? row[ti].toISOString() : row[ti]).slice(0, 10) === '2026-09-05', J({ ok: r.ok, code: r.code, msg: r.message }).slice(0, 200));
  }
  { // patch dengan field tak dikenal ditolak (tidak dibuang diam-diam)
    const srv = makeServer();
    const r = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_2', status: 'SELESAI', kolomAsing: 'x' }));
    rec('P0B-03', 'GAP-003', r.ok === false && r.code === 'UNKNOWN_FIELD' && rows(srv, '05_TRANSAKSI')[1][col(srv, '05_TRANSAKSI', 'status')] === 'TERCATAT', J([r.ok, r.code]));
  }
  { // TC-CRUD-03 (GAP-012): nominal tidak boleh < total alokasi aktif
    const srv = makeServer();
    const r = safe(() => srv.sb.opUpdateTransaction({ id: 'imp_trx_1', nominal: 100000 }));
    rec('P0B-04', 'TC-CRUD-03', r.ok === false && r.code === 'ALLOCATION_EXCEEDS_TRANSACTION' && rows(srv, '05_TRANSAKSI')[0][col(srv, '05_TRANSAKSI', 'nominal')] === 200000, J([r.ok, r.code]));
  }
  { // GAP-012: status alokasi dihitung server, bukan dipercaya dari klien
    const srv = makeServer();
    const r = srv.sb.opCreateIncome(incomePayload({ status: 'TERALOKASI', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 200000 }] }));
    const row = r.ok && rows(srv, '05_TRANSAKSI').find(x => x[0] === r.data.id);
    const st1 = row && row[col(srv, '05_TRANSAKSI', 'status')];
    rec('P0B-05', 'GAP-012', r.ok && st1 === 'SEBAGIAN_TERALOKASI', 'status tersimpan=' + st1 + ' ' + (r.ok ? '' : r.code));
    const a2 = r.ok ? srv.sb.opCreateAllocation({ transaksiId: r.data.id, siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 100000, clientRequestId: 'p0b05b' }) : {};
    const st2 = r.ok && rows(srv, '05_TRANSAKSI').find(x => x[0] === r.data.id)[col(srv, '05_TRANSAKSI', 'status')];
    rec('P0B-06', 'GAP-012', a2.ok === true && st2 === 'TERALOKASI', 'setelah alokasi sisa: ' + st2 + ' ' + (a2.code || ''));
  }
  { // TC-TRX-02: retry clientRequestId sama -> satu transaksi
    const srv = makeServer(); const p = incomePayload({ clientRequestId: 'retry1', allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 200000 }] });
    const a = srv.sb.opCreateIncome(p), b = srv.sb.opCreateIncome(p);
    rec('P0B-07', 'TC-TRX-02', a.ok && b.ok && a.data.id === b.data.id && cnt(srv, '05_TRANSAKSI') === 3 && cnt(srv, '06_ALOKASI') === 2 && /replay/.test(b.message), J([a.ok, b.ok, b.message]));
  }
  { // TC-TRX-03: total alokasi > nominal -> tolak, tanpa baris parsial
    const srv = makeServer(); const n0 = cnt(srv, '05_TRANSAKSI'), a0 = cnt(srv, '06_ALOKASI'), au0 = cnt(srv, '13_AUDIT_LOG');
    const r = srv.sb.opCreateIncome(incomePayload({ nominal: 550000, allocations: [{ siswaId: 's2', komponenId: 'kmp_spp', periode: 'September 2026', nominal: 200000 }, { siswaId: 's2', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 400000 }] }));
    rec('P0B-08', 'TC-TRX-03', !r.ok && /EXCEEDS/.test(r.code) && cnt(srv, '05_TRANSAKSI') === n0 && cnt(srv, '06_ALOKASI') === a0 && cnt(srv, '13_AUDIT_LOG') === au0, r.code);
  }
  { // TC-TRX-06 (server): lock tidak didapat -> LOCK_TIMEOUT, tidak ada baris
    const srv = makeServer(); srv.state.lockFail = true;
    const r = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'lock1' });
    rec('P0B-09', 'TC-TRX-06', r.ok === false && r.code === 'LOCK_TIMEOUT' && cnt(srv, '05_TRANSAKSI') === 2, r.code);
  }
  { // TC-FAIL-02: respons hilang setelah server menulis -> retry tidak menggandakan transaksi maupun audit
    const srv = makeServer(); const c = await bootClient(srv);
    c.fault.mode = 'lostOnce'; c.fault.only = /^opCreateTxBatch$/;
    Object.assign(c.fields, { gf_nominal: '77000', gf_penerima: 'Toko Uji', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: 'uji lost' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran(); await c.sb.centralRunSync(true); await tick(5); await c.sb.centralRunSync(true); await tick(5);
    const created = rows(srv, '05_TRANSAKSI').filter(r => r[col(srv, '05_TRANSAKSI', 'nominal')] === 77000).length;
    const aud = audits(srv).filter(a => a[2] === 'CREATE_TRANSACTION' && String(a[4]).includes('77000')).length;
    rec('P0B-10', 'TC-FAIL-02', created === 1 && aud === 1, 'transaksi=' + created + ' audit=' + aud);
  }
  { // TC-FAIL-02 (audit mirror): entri audit UI yang dikirim ulang tidak ganda
    const srv = makeServer(); const e = [{ id: 'ui_aud_1', aksi: 'UJI', before: null, after: { a: 1 }, refId: 'x' }];
    srv.sb.opAuditAppend(e); srv.sb.opAuditAppend(e);
    const n = audits(srv).filter(a => a[2] === 'UI_UJI').length;
    rec('P0B-11', 'TC-FAIL-02', n === 1, 'baris UI_UJI=' + n);
  }
  { // GAP-013: opAuditAppend memakai LockService
    const srv = makeServer(); srv.state.lockFail = true;
    const r = safe(() => srv.sb.opAuditAppend([{ id: 'ui_aud_2', aksi: 'UJI2', after: { a: 1 } }]));
    rec('P0B-12', 'GAP-013', r.ok === false && r.code === 'LOCK_TIMEOUT' && !audits(srv).some(a => a[2] === 'UI_UJI2'), J([r.ok, r.code]));
  }
  { // GAP-013: baris audit engine memuat aktor terverifikasi
    const srv = makeServer();
    const r = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 4321, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'act1' });
    const a = audits(srv).find(x => x[2] === 'CREATE_TRANSACTION' && x[6] === (r.data && r.data.id));
    rec('P0B-13', 'GAP-013', !!a && a[5] === 'google:bendahara@x.id', 'sumber audit=' + (a && a[5]));
  }
  { // TC-FAIL-03: audit gagal -> perubahan master dibatalkan, bukan sukses+auditWarning
    const srv = makeServer(); const before = J(rows(srv, '02_KOMPONEN'));
    srv.state.failSetValuesOn = '13_AUDIT_LOG';
    const r = safe(() => srv.sb.opMasterUpsert('komponen', { id: 'kmp_spp', nama: 'SPP Bulanan', frekuensi: 'Bulanan' }));
    rec('P0B-14', 'TC-FAIL-03', r.ok === false && J(rows(srv, '02_KOMPONEN')) === before, J([r.ok, r.code, r.auditWarning]));
  }
  { // TC-FAIL-03 (transaksi): audit gagal saat arsip transaksi -> baris dipulihkan
    const srv = makeServer(); ['05_TRANSAKSI', '06_ALOKASI'].forEach(n => srv.sheets[n].forEach((r, i) => r.push(...(i === 0 ? ['archivedAt', 'archivedBy', 'archiveReason'] : ['', '', '']))));
    const before = J(srv.sheets['05_TRANSAKSI']) + J(srv.sheets['06_ALOKASI']);
    srv.state.failSetValuesOn = '13_AUDIT_LOG';
    const r = safe(() => srv.sb.opArchiveTransaction('imp_trx_1', 'uji'));
    rec('P0B-15', 'TC-FAIL-03', r.ok === false && J(srv.sheets['05_TRANSAKSI']) + J(srv.sheets['06_ALOKASI']) === before, J([r.ok, r.code, r.auditWarning]));
  }
  { // TC-FAIL-01 (a): tanpa ServerBridge -> simpan pengeluaran ditolak, tidak ada baris lokal
    const srv = makeServer(); const c = makeClient(srv, { noBridge: true }); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await tick(5);
    Object.assign(c.fields, { gf_nominal: '5000', gf_penerima: 'Toko', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: '' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran();
    rec('P0B-16', 'TC-FAIL-01', c.a.Store.loadTransaksi().length === 0 && /gagal/i.test(c.toast()) && !/tersimpan/i.test(c.toast().replace(/tidak tersimpan|TIDAK disimpan/gi, '')), 'toast="' + c.toast() + '" lokal=' + c.a.Store.loadTransaksi().length);
  }
  { // TC-FAIL-01 (b): server tak terjangkau setelah data termuat -> tidak ada pesan "tersimpan", hasil akhir GAGAL, tidak dihitung sebagai transaksi resmi
    const srv = makeServer(); const c = await bootClient(srv);
    c.fault.mode = 'down'; c.fault.only = /^op(Create|Update|Record|Archive|Audit|Master|Settings)/;
    Object.assign(c.fields, { gf_nominal: '6000', gf_penerima: 'Toko', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: 'down' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran();
    const t1 = c.toast();
    await c.sb.centralRunSync(true); await tick(10);
    const t2 = c.toast();
    const official = c.sb.pengeluaranList().some(t => Number(t.nominal) === 6000);
    rec('P0B-17', 'TC-FAIL-01', !/^Pengeluaran tersimpan$/.test(t1) && /menunggu konfirmasi/i.test(t1) && /gagal/i.test(t2) && !official && cnt(srv, '05_TRANSAKSI') === 2, 'toast1="' + t1 + '" toast2="' + t2 + '" resmi=' + official);
  }
  { // TC-TRX-06 (klien): LOCK_TIMEOUT -> UI menampilkan gagal, bukan sukses
    const srv = makeServer(); const c = await bootClient(srv); srv.state.lockFail = true;
    Object.assign(c.fields, { gf_nominal: '6100', gf_penerima: 'Toko', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: 'lock' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran(); await c.sb.centralRunSync(true); await tick(10);
    rec('P0B-18', 'TC-TRX-06', /gagal/i.test(c.toast()) && !c.sb.pengeluaranList().some(t => Number(t.nominal) === 6100), 'toast="' + c.toast() + '"');
  }
  { // sukses hanya setelah konfirmasi server
    const srv = makeServer(); const c = await bootClient(srv);
    Object.assign(c.fields, { gf_nominal: '6200', gf_penerima: 'Toko', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: 'ok' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran(); const t1 = c.toast();
    await c.sb.centralRunSync(true); await tick(10);
    rec('P0B-19', 'GAP-004', /menunggu konfirmasi/i.test(t1) && /tersimpan di server/i.test(c.toast()) && cnt(srv, '05_TRANSAKSI') === 3 && c.sb.pengeluaranList().some(t => Number(t.nominal) === 6200), 't1="' + t1 + '" t2="' + c.toast() + '"');
  }
  { // patch transaksi yang ditolak server tidak boleh tetap tampil sebagai nilai baru
    const srv = makeServer(); const c = await bootClient(srv);
    c.sb.centralPatchTransaksi('imp_trx_1', { nominal: 100000 }); await c.sb.centralRunSync(true); await tick(10);
    const shown = c.sb.transaksiById('imp_trx_1');
    rec('P0B-20', 'GAP-003', shown && Number(shown.nominal) === 200000, 'tampil=' + (shown && shown.nominal) + ' server=' + rows(srv, '05_TRANSAKSI')[0][col(srv, '05_TRANSAKSI', 'nominal')]);
  }

  // ================= P0-C: autentikasi, otorisasi, jalur tulis =================
  { // TC-AUTH-01 (server+klien): pengguna tidak terdaftar
    const srv = makeServer(); srv.state.email = 'asing@x.id';
    const r = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'a1' });
    const c = await bootClient(srv);
    Object.assign(c.fields, { gf_nominal: '7000', gf_penerima: 'Toko', gf_unit: 'MI', gf_tanggal: '2026-09-12', gf_kategori: 'ATK', gf_subkategori: '', gf_akun: 'akun_kas1', gf_metode: 'Tunai', gf_catatan: '' });
    c.a.State.pengeluaranForm = {}; c.sb.submitPengeluaran();
    rec('P0C-01', 'TC-AUTH-01', r.code === 'USER_NOT_FOUND' && c.a.Store.loadTransaksi().length === 0 && cnt(srv, '05_TRANSAKSI') === 2, 'server=' + r.code + ' lokal=' + c.a.Store.loadTransaksi().length + ' toast="' + c.toast() + '"');
  }
  { // TC-AUTH-02: AUDITOR tidak dapat menulis lewat jalur mana pun yang dapat dipanggil google.script.run
    const srv = makeServer(); srv.state.email = 'auditor@x.id';
    const r = srv.sb.opCreateIncome(incomePayload());
    const n0 = cnt(srv, '05_TRANSAKSI'), a0 = cnt(srv, '06_ALOKASI');
    const direct = {};
    [['createIncome', [incomePayload()]], ['createExpense', [{ tanggal: '2026-09-11', unit: 'MI', nominal: 1, akunId: 'akun_kas1', metode: 'Tunai' }]], ['createTransaction', [incomePayload()]],
     ['createAllocation', [{ transaksiId: 'imp_trx_2', siswaId: 's1', komponenId: 'kmp_spp', nominal: 1 }]], ['updateTransaction', [{ id: 'imp_trx_2', nominal: 1 }]],
     ['createBankMutation', [{ tanggal: '2026-09-11', nominal: 1 }]], ['testConcurrentWriteDoor', []]].forEach(([fn, args]) => {
      direct[fn] = typeof srv.sb[fn] !== 'function' ? 'TIDAK_PUBLIK' : (safe(() => srv.sb[fn](...args)) || {}).code;
    });
    const unchanged = cnt(srv, '05_TRANSAKSI') === n0 && cnt(srv, '06_ALOKASI') === a0 && cnt(srv, '11_MUTASI_BANK') === 0 && rows(srv, '05_TRANSAKSI').every(x => x[col(srv, '05_TRANSAKSI', 'nominal')] !== 1);
    rec('P0C-02', 'TC-AUTH-02', r.code === 'ROLE_NOT_ALLOWED' && unchanged, J(direct));
  }
  { // fungsi baca engine juga tidak boleh melewati otorisasi
    const srv = makeServer(); srv.state.email = 'asing@x.id';
    const res = ['getTransactions', 'getTransaction', 'getStudentPosition', 'healthCheck'].map(fn => typeof srv.sb[fn] !== 'function' ? 'TIDAK_PUBLIK' : ((safe(() => srv.sb[fn]('s1')) || {}).ok ? 'BOCOR' : 'DITOLAK'));
    rec('P0C-03', 'GAP-006', res.every(x => x !== 'BOCOR'), J(res));
  }
  { // TC-AUTH-03: INACTIVE
    const srv = makeServer(); srv.sheets['26_USER_ACCESS'][1][col(srv, '26_USER_ACCESS', 'status')] = 'INACTIVE';
    const r = srv.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', clientRequestId: 'a3' });
    rec('P0C-04', 'TC-AUTH-03', r.code === 'USER_INACTIVE' && cnt(srv, '05_TRANSAKSI') === 2, r.code);
  }
  { // TC-AUTH-04: doPost dengan device APPROVED tidak boleh menulis
    const srv = makeServer(); let out = null;
    srv.sb.ContentService = { createTextOutput: s => { out = s; return { setMimeType() { return this; } }; }, MimeType: { JSON: 'json' } };
    srv.sheets['25_DEVICE_WHITELIST'].push(['dev1', 'uji', '', 'APPROVED', '', '', '', '']);
    const n0 = cnt(srv, '05_TRANSAKSI');
    ['createIncome', 'createExpense', 'createAllocation', 'updateTransaction', 'requestPairing'].forEach(action => safe(() => srv.sb.doPost({ postData: { contents: J({ action, deviceId: action === 'requestPairing' ? 'devBaru' : 'dev1', deviceSecret: 'x', tokenHash: 'h', payload: action === 'updateTransaction' ? { id: 'imp_trx_2', nominal: 1 } : { jenis: 'PENGELUARAN', tanggal: '2026-09-11', unit: 'MI', nominal: 999, akunId: 'akun_kas1', metode: 'Tunai', transaksiId: 'imp_trx_1', siswaId: 's1', komponenId: 'kmp_spp' } }) } })));
    const resp = out ? JSON.parse(out) : {};
    rec('P0C-05', 'TC-AUTH-04', cnt(srv, '05_TRANSAKSI') === n0 && rows(srv, '05_TRANSAKSI').every(x => x[col(srv, '05_TRANSAKSI', 'nominal')] !== 1) && cnt(srv, '25_DEVICE_WHITELIST') === 1 && resp.ok === false, J(resp).slice(0, 160));
  }
  { // TC-AUTH-05: doGet tidak memakai XFrameOptionsMode.ALLOWALL
    const srv = makeServer(); let mode = 'TIDAK_DISET';
    const tpl = { evaluate() { return out; } }; const out = { setTitle() { return out; }, setXFrameOptionsMode(m) { mode = m; return out; }, addMetaTag() { return out; } };
    srv.sb.HtmlService = { createTemplateFromFile: () => tpl, createHtmlOutputFromFile: () => ({ getContent: () => '' }), XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' } };
    safe(() => srv.sb.doGet({ parameter: {} }));
    rec('P0C-06', 'TC-AUTH-05', mode !== 'ALLOWALL', 'mode=' + mode);
  }
  { // setupDatabaseStructure (membuat/mengubah sheet) tidak dapat dipanggil klien tanpa otorisasi
    const srv = makeServer(); srv.state.email = 'auditor@x.id';
    const pub = typeof srv.sb.setupDatabaseStructure === 'function';
    let r = 'TIDAK_PUBLIK'; if (pub) { r = (safe(() => srv.sb.setupDatabaseStructure()) || {}).code || 'TERJALAN'; }
    rec('P0C-07', 'GAP-006', !pub || r === 'ROLE_NOT_ALLOWED', 'setupDatabaseStructure=' + r);
  }

  // ================= P0-D: KPI saat data gagal dimuat =================
  { // TC-KPI-02: opReadSheet gagal -> DATA TIDAK TERSEDIA, bukan skor 0 "Perlu Perbaikan"
    const srv = makeServer(); const c = makeClient(srv); c.fault.mode = 'readFail';
    c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].error || c.a.OperationalCache.states[k].loaded), 400);
    const s = c.sb.kpiIndukSummary();
    c.a.State.page = 'laporan'; c.a.State.laporanTab = 'kpi'; let html = ''; try { html = c.sb.renderKpiReport(); } catch (e) { html = 'ERR ' + e.message; }
    rec('P0D-01', 'TC-KPI-02', s.overall === null && /DATA TIDAK TERSEDIA/.test(s.overallStatus) && s.rows.every(r => r.skor === null && !/Perlu Perbaikan/.test(r.status)) && /DATA TIDAK TERSEDIA/.test(html), J({ overall: s.overall, st: s.overallStatus, r0: s.rows[0] && [s.rows[0].skor, s.rows[0].status] }));
    const n0 = c.a.Store.loadKpiSnapshot().length; let snapErr = '';
    try { c.sb.centralSnapshotKpi(); } catch (e) { snapErr = e.message; }
    rec('P0D-02', 'TC-KPI-02', c.a.Store.loadKpiSnapshot().length === n0 && /DATA TIDAK TERSEDIA|tidak tersedia/i.test(snapErr), 'snapshot=' + c.a.Store.loadKpiSnapshot().length + ' err=' + snapErr);
  }
  { // tanpa ServerBridge (mode lokal) KPI tidak dihitung dari localStorage
    const srv = makeServer(); const c = makeClient(srv, { noBridge: true }); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await tick(5);
    const s = c.sb.kpiIndukSummary();
    rec('P0D-03', 'TC-KPI-02', s.overall === null && /DATA TIDAK TERSEDIA/.test(s.overallStatus), J([s.overall, s.overallStatus]));
  }
  { // regresi KPI: data lengkap -> hasil identik dengan baseline (branch main)
    let baseHtml = ''; // [P1] baseline = commit 802cbed (main lokal asli); di repo GitHub 'main' hanya berisi arsip RAR
    for (const ref of [process.env.P0_BASELINE_REF, 'main', '802cbed'].filter(Boolean)) { if (baseHtml) break; try { baseHtml = cp.execFileSync('git', ['show', ref + ':Bendahara_V2.html'], { cwd: OUT, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\r/g, ''); } catch (e) { } }
    const baseJs = baseHtml && baseHtml.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
    if (!baseJs) rec('P0D-04', 'regresi KPI', false, 'baseline main tidak terbaca');
    else {
      const run = async (code) => { const srv = makeServer(); const c = makeClient(srv, { js: code }); c.sb.initializeSeedData(); c.sb.bootstrapCentralAuth(); await until(() => Object.keys(c.a.OperationalCache.states).every(k => c.a.OperationalCache.states[k].loaded), 400); await tick(5); const s = c.sb.kpiIndukSummary('September 2026'); return J({ overall: s.overall, st: s.overallStatus, rows: s.rows.map(r => [r.kode, r.skor, r.status, r.jumlahMasalah, r.indicators.map(i => [i.kode, i.capaian, i.status, i.activityStatus, i.realisasi])]) }); };
      const a = await run(baseJs), b = await run(js);
      rec('P0D-04', 'regresi KPI', a === b, a === b ? 'identik: ' + a.slice(0, 120) : 'BEDA\nbase=' + a.slice(0, 300) + '\nbaru=' + b.slice(0, 300));
      const grab = (code, name) => { const m = new RegExp('^(?:function ' + name + '\\(|const ' + name + ' =)', 'm').exec(code); if (!m) return null; const e = code.indexOf('\n}', m.index); const e2 = code.indexOf('\n];', m.index); return code.slice(m.index, (name.endsWith('MASTER') ? e2 : e) + 2); };
      const names = ['KPI_MASTER', 'INDICATOR_MASTER', 'indDef', 'computeKpiRow', 'kpiIndukRow', 'computeIndicatorDimensions', 'computeIndicatorActivityStatus', 'computeIndicatorQuality', 'kpiStatusFromScore', 'mkAkt', 'financialAktivitasFeed', 'getIndicatorRealization', 'computeIndicatorQuantityScore'];
      const diff = names.filter(n => grab(baseJs, n) !== grab(js, n));
      rec('P0D-05', 'regresi KPI', diff.length === 0, diff.length ? 'berubah: ' + diff.join(',') : 'definisi & rumus KPI identik (' + names.length + ' simbol)');
      const sumBase = grab(baseJs, 'kpiIndukSummary'), sumNew = (grab(js, 'kpiIndukSummaryCompute_') || '').replace(/^function kpiIndukSummaryCompute_\(/, 'function kpiIndukSummary(');
      rec('P0D-06', 'regresi KPI', !!sumBase && sumBase === sumNew, 'isi kpiIndukSummary asli dipertahankan utuh sebagai kpiIndukSummaryCompute_');
      // regresi UI statis: markup/CSS di luar <script> identik; tidak ada fungsi/halaman yang hilang
      const strip = s => s.replace(/<script>[\s\S]*?<\/script>/g, '<script/>');
      rec('P0U-02', 'regresi UI', strip(baseHtml) === strip(fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8').replace(/\r/g, '')), 'markup & CSS di luar <script> identik dengan main');
      const fnames = code => new Set((code.match(/^(?:async )?function\s+([A-Za-z0-9_$]+)/gm) || []).map(l => l.replace(/^(?:async )?function\s+/, '')));
      const fb = fnames(baseJs), fn = fnames(js), lost = [...fb].filter(n => !fn.has(n));
      const navB = (baseJs.match(/const NAV_TREE = [\s\S]*?\n\];/) || [''])[0], navN = (js.match(/const NAV_TREE = [\s\S]*?\n\];/) || [''])[0];
      rec('P0U-03', 'regresi UI', lost.length === 0 && navB && navB === navN, lost.length ? 'hilang: ' + lost.join(',') : fb.size + ' fungsi baseline tetap ada; NAV_TREE identik');
    }
  }

  // ================= Regresi UI ringan =================
  { const srv = makeServer(); const c = await bootClient(srv); const bad = [];
    ['beranda', 'transaksi', 'siswa', 'laporan', 'anggaran', 'dokumen', 'tindakan', 'pengaturan'].forEach(p => { try { c.a.State.page = p; c.sb.renderContent(); if (/Terjadi kesalahan render/.test(c.el('content').innerHTML)) bad.push(p); } catch (e) { bad.push(p + ':' + e.message); } });
    rec('P0U-01', 'regresi UI', bad.length === 0, bad.join(';') || '8 halaman render'); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + (r.d || '')));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('CRASH', e); process.exitCode = 2; });
