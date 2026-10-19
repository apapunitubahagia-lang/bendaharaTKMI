/* Suite U-5 METADATA PERSETUJUAN RAB (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * disetujuiPada/disetujuiOleh ditentukan server; nilai klien dibuang; RAB lama tanpa metadata = HISTORI_TIDAK_LENGKAP (tidak dikarang);
 * pencocokan RAB & KPI tidak berubah (dampak kebijakan "tidak berlaku surut" hanya diukur).
 * Fixture: ang_1 (September 2026, ATK, MI, 1.000.000); imp_trx_2 PENGELUARAN ATK MI 2026-09-05 Rp50.000.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
function fresh(noSchema) { const s = makeServer(); if (!noSchema) s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); return s; }
const ang = (srv, id) => { const h = srv.sheets['08_ANGGARAN'][0], r = srv.sheets['08_ANGGARAN'].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const up = (srv, id, row) => { const r = srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id, row }]); return r.ok ? r.data.results[0] : r; };
const audit = (srv, a) => srv.sheets['13_AUDIT_LOG'].slice(1).filter(r => r[2] === a);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

(async () => {
  { const srv = fresh(); const h = srv.sheets['08_ANGGARAN'][0];
    rec('U5-01', 'Migrasi Skema Aditif menambah kolom disetujuiPada & disetujuiOleh di ujung header 08_ANGGARAN (kolom lama tidak bergeser)', h.includes('disetujuiPada') && h.includes('disetujuiOleh') && h.slice(0, 10).join() === 'id,periode,program,kategori,unit,nominal,source,sourceFile,sourceRow,importBatchId', J(h)); }
  { const srv = fresh(); const r = up(srv, 'ang_1', { status: 'DISETUJUI' }); const a = ang(srv, 'ang_1'); const au = audit(srv, 'RAB_PERSETUJUAN');
    rec('U5-02', 'status -> DISETUJUI: server mengisi disetujuiPada (ISO, waktu server) & disetujuiOleh (email sesi); audit RAB_PERSETUJUAN pada append yang sama', r.ok && r.persetujuan === 'DISETUJUI' && ISO.test(a.disetujuiPada) && a.disetujuiOleh === 'bendahara@x.id' && au.length === 1,
      J({ r: r.code, pada: a.disetujuiPada, oleh: a.disetujuiOleh, audit: au.length })); }
  { const srv = fresh();
    const c = up(srv, 'ang_baru', { periode: 'September 2026', program: 'P', kategori: 'ATK', unit: 'MI', nominal: 10, status: 'DISETUJUI', disetujuiPada: '2020-01-01T00:00:00.000Z', disetujuiOleh: 'kepala@x.id' });
    const a1 = ang(srv, 'ang_baru');
    const u = up(srv, 'ang_baru', { nominal: 20, disetujuiPada: '2019-01-01T00:00:00.000Z', disetujuiOleh: 'yayasan@x.id' }); const a2 = ang(srv, 'ang_baru');
    const only = up(srv, 'ang_baru', { disetujuiOleh: 'palsu@x.id' });
    rec('U5-03', 'nilai disetujuiPada/disetujuiOleh dari klien DIBUANG: baris baru berstatus DISETUJUI dicap server; ubah nominal tanpa transisi status -> cap tetap; kiriman yang hanya berisi metadata -> UNCHANGED',
      c.ok && a1.disetujuiOleh === 'bendahara@x.id' && a1.disetujuiPada !== '2020-01-01T00:00:00.000Z' && u.ok && u.code === 'UPDATED' && a2.nominal === 20 && a2.disetujuiPada === a1.disetujuiPada && a2.disetujuiOleh === 'bendahara@x.id' && only.code === 'UNCHANGED',
      J({ a1: [a1.disetujuiPada, a1.disetujuiOleh], a2: [a2.disetujuiPada, a2.disetujuiOleh], only: only.code })); }
  { const srv = fresh(); up(srv, 'ang_1', { status: 'DISETUJUI' }); const p1 = ang(srv, 'ang_1').disetujuiPada;
    const r = up(srv, 'ang_1', { status: 'DIAJUKAN' }); const a = ang(srv, 'ang_1'); const au = audit(srv, 'RAB_PERSETUJUAN');
    rec('U5-04', 'DISETUJUI -> DIAJUKAN: metadata dikosongkan (riwayat di audit: 2 baris RAB_PERSETUJUAN, transisi DISETUJUI lalu PERSETUJUAN_DICABUT)', r.persetujuan === 'PERSETUJUAN_DICABUT' && a.disetujuiPada === '' && a.disetujuiOleh === '' && ISO.test(p1) && au.length === 2 && /PERSETUJUAN_DICABUT/.test(String(au[1][4] || '') + String(au[1][3] || '') + J(au[1])),
      J({ r: r.persetujuan, a: [a.disetujuiPada, a.disetujuiOleh], audit: au.length })); }
  { const srv = fresh(true); srv.sheets['08_ANGGARAN'][0].push('status'); srv.sheets['08_ANGGARAN'][1].push('');
    const r = up(srv, 'ang_1', { status: 'DISETUJUI' }); const au = audit(srv, 'RAB_PERSETUJUAN');
    rec('U5-05', 'sheet tanpa kolom metadata (migrasi aditif belum): persetujuan tetap diproses seperti sebelumnya + peringatan METADATA_PERSETUJUAN_TIDAK_TERSIMPAN; audit tetap mencatat aktor & waktu', r.ok && r.code === 'UPDATED' && r.peringatan === 'METADATA_PERSETUJUAN_TIDAK_TERSIMPAN' && au.length === 1 && /bendahara@x\.id/.test(J(au[0])),
      J({ r: [r.code, r.peringatan], audit: au.length })); }
  { const srv = fresh(); const h = srv.sheets['08_ANGGARAN'][0], sc = h.indexOf('status'); srv.sheets['08_ANGGARAN'][1][sc] = 'DISETUJUI'; // RAB lama: disetujui sebelum U-5
    const before = J(srv.sheets['08_ANGGARAN']); const r = srv.sb.opRabPersetujuanAudit();
    rec('U5-06', 'RAB lama DISETUJUI tanpa metadata -> HISTORI_TIDAK_LENGKAP; audit baca-saja (08_ANGGARAN identik; waktu/identitas tidak dikarang)', r.ok && r.data.historiTidakLengkap.length === 1 && r.data.historiTidakLengkap[0].anggaranId === 'ang_1' && J(srv.sheets['08_ANGGARAN']) === before && ang(srv, 'ang_1').disetujuiPada === '',
      J(r.data && { tl: r.data.historiTidakLengkap, tanpaMeta: r.data.dampakTidakBerlakuSurut.transaksiDisetujuiTanpaMetadata })); }
  { const srv = fresh(); up(srv, 'ang_1', { status: 'DISETUJUI' }); const r = srv.sb.opRabPersetujuanAudit();
    const lama = fresh(); lama.sheets['08_ANGGARAN'][1][lama.sheets['08_ANGGARAN'][0].indexOf('status')] = 'DISETUJUI'; // status yang sama tanpa metadata (perilaku lama)
    const rz = x => { const o = x.sb.opRabRealization('September 2026'); if (o.ok) delete o.data.computedAt; return o; };
    const a = rz(srv), b = rz(lama), d = r.data && r.data.dampakTidakBerlakuSurut.transaksiSebelumPersetujuan;
    rec('U5-07', 'dampak: transaksi 2026-09-05 dipetakan ke RAB yang baru disetujui hari ini -> tercatat "sebelum persetujuan"; pencocokan/realisasi RAB IDENTIK dengan RAB berstatus sama tanpa metadata (KPI tidak berubah, persetujuan masih berlaku surut)',
      r.ok && d.length === 1 && d[0].transaksiId === 'imp_trx_2' && d[0].tanggal === '2026-09-05' && a.ok && J(a.data) === J(b.data) && a.data.lines[0].statusRab === 'DISETUJUI' && a.data.lines[0].transaksiIds.includes('imp_trx_2'),
      J({ dampak: d, identik: J(a.data) === J(b.data) })); }
  { const srv = fresh(); srv.state.email = 'auditor@x.id'; const w = srv.sb.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_1', row: { status: 'DISETUJUI' } }]); const r = srv.sb.opRabPersetujuanAudit();
    rec('U5-08', 'AUDITOR: tidak dapat menyetujui RAB (opGate_ tulis), dapat menjalankan audit baca-saja', !w.ok && r.ok && ang(srv, 'ang_1').disetujuiPada === '', J({ tulis: w.code, audit: r.ok })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
