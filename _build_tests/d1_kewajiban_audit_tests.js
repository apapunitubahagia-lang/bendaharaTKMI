/* Suite D-1 AUDIT KEWAJIBAN BEKU / TARIF (P1_21; sandbox Node, TIDAK menyentuh Google Sheets).
 * AUDIT, bukan implementasi: PASS = jaminan yang sudah berlaku; INFO = celah terhadap kebijakan D-1 yang disetujui
 * (bahan desain P1_21 §D-1). Melengkapi snapshot_tarif_tests (ST-01..05, kewajiban BELUM beku).
 * Fixture: SPP MI tarif trf_1 = 200.000; s1 punya alokasi imp_alk_1 SPP September 2026 = 200.000 (lunas).
 * "Beku" (definisi yang dipakai kode saat ini): baris 04_KEWAJIBAN dengan tagihanId terisi dan archivedAt kosong.
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const P = 'September 2026';
function frozen() { const s = makeServer(); s.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); const r = s.sb.opObligationSnapshot(P, {}); if (!r.ok) throw new Error('snapshot gagal ' + J(r)); return s; }
const ob = srv => { const r = srv.sb.opObligations({ siswaId: 's1', periode: P }); const x = r.ok && r.data.rows.filter(o => o.komponenId === 'kmp_spp'); return x && x.length ? x.map(o => ({ id: o.tagihanId, netto: o.netto, terbayar: o.terbayar, sisa: o.sisa, status: o.status })) : r; };
const setTarif = (srv, n) => srv.sb.opMasterBatch('tarif', [{ id: 'trf_1', nominal: n }]);
const hist = srv => J([srv.sheets['05_TRANSAKSI'], srv.sheets['06_ALOKASI']]);
const kwRows = srv => srv.sheets['04_KEWAJIBAN'].slice(1);
const kwCol = (srv, h) => srv.sheets['04_KEWAJIBAN'][0].indexOf(h);
const kwS1 = srv => kwRows(srv).find(r => r[1] === 's1' && r[2] === 'kmp_spp' && r[3] === P);
const audits = (srv, re) => srv.sheets['13_AUDIT_LOG'].slice(1).filter(r => re.test(String(r[2])));

(async () => {
  { // D1-01/02: tarif naik / turun setelah kewajiban beku & lunas
    const srv = frozen(); const h0 = hist(srv), a = ob(srv);
    const up = setTarif(srv, 250000), b = ob(srv); const dn = setTarif(srv, 150000), c = ob(srv);
    rec('D1-01', 'kewajiban BEKU & lunas; tarif naik 200.000 -> 250.000: netto tetap 200.000, status tetap LUNAS (tidak berubah diam-diam)', up.ok && a.length === 1 && J(a) === J(b) && b[0].status === 'LUNAS' && b[0].netto === 200000, J({ a, b }));
    rec('D1-02', 'kewajiban BEKU & lunas; tarif turun -> 150.000: netto tetap, bukan KELEBIHAN BAYAR; transaksi & alokasi tidak berubah', dn.ok && J(a) === J(c) && hist(srv) === h0, J({ c, histSama: hist(srv) === h0 })); }
  { // D1-03: snapshot ulang (retry) tidak menyentuh baris beku
    const srv = frozen(); const r0 = kwS1(srv).slice(); setTarif(srv, 250000);
    const r1 = srv.sb.opObligationSnapshot(P, {}), r2 = srv.sb.opObligationSnapshot(P, {});
    rec('D1-03', 'retry snapshot setelah tarif berubah: 0 dibuat / 0 diperbarui; baris beku identik (tarifSatuan tetap 200.000)', r1.ok && r2.ok && r1.data.dibuat === 0 && r1.data.diperbarui === 0 && r2.data.dibuat === 0 && J(kwS1(srv)) === J(r0) && kwS1(srv)[kwCol(srv, 'tarifSatuan')] === 200000,
      J({ r1: r1.data, r2: r2.data })); }
  { // D1-04: batch biasa menimpa baris beku
    const srv = frozen(); const id = kwS1(srv)[0]; const h0 = hist(srv);
    const w = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { netto: 100000, bruto: 100000 } }]); const after = ob(srv);
    const au = audits(srv, /^RECORD_UPDATE:kewajiban$/);
    rec('D1-04', 'CELAH (kebijakan D-1 #2): opRecordBatch("kewajiban") biasa DAPAT menimpa kewajiban beku yang sudah dibayar (tanpa alasan) -> LUNAS menjadi KELEBIHAN BAYAR; audit hanya RECORD_UPDATE (before/after, tanpa alasan); alokasi tidak berubah', null,
      J({ hasil: w.ok && w.data && w.data.results && w.data.results[0].code, status: after, audit: au.length, histSama: hist(srv) === h0 })); }
  { // D1-05: koreksi dengan / tanpa alasan
    const srv = frozen(); const id = kwS1(srv)[0];
    const fnKoreksi = Object.keys(srv.sb).filter(k => /^op.*(Koreksi|Correct).*/i.test(k) && /kewajiban|obligation/i.test(k));
    const tanpa = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { netto: 180000 } }]);
    const dengan = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { netto: 190000 }, alasan: 'Koreksi keringanan yatim', reason: 'Koreksi keringanan yatim' }]);
    const au = audits(srv, /^RECORD_UPDATE:kewajiban$/).map(r => String(r[4] || '') + String(r[5] || ''));
    rec('D1-05', 'CELAH (kebijakan D-1 #3): belum ada jalur koreksi khusus kewajiban beku; koreksi TANPA alasan diterima sama seperti DENGAN alasan; alasan pada payload tidak disimpan di audit', null,
      J({ fungsiKoreksi: fnKoreksi, tanpaAlasan: tanpa.data && tanpa.data.results[0].code, denganAlasan: dengan.data && dengan.data.results[0].code, alasanTercatat: au.some(x => /yatim/.test(x)) })); }
  { // D1-06: arsip baris beku lalu snapshot ulang = bekukan ulang dengan tarif baru
    const srv = frozen(); const id = kwS1(srv)[0]; setTarif(srv, 250000);
    const ar = srv.sb.opRecordBatch('kewajiban', [{ op: 'archive', id }]); const sn = srv.sb.opObligationSnapshot(P, {}); const after = ob(srv);
    rec('D1-06', 'CELAH: arsip kewajiban beku yang sudah dibayar (alasan opsional) -> kewajiban kembali TIDAK beku dan dihitung ulang dengan tarif BARU (250.000, sisa 50.000, CICILAN); snapshot ulang gagal karena id kw_ yang sama sudah diarsipkan (tidak dapat dibekukan lagi)', null,
      J({ arsip: ar.ok && ar.data.results[0].code, snapshot: sn.ok && sn.data, status: after })); }
  { // D1-07: tulis bersamaan (expect) dan retry
    /* [P1_23 D-1, ekspektasi diubah atas kebijakan D-1 yang disetujui] Sebelumnya uji ini menulis netto kewajiban beku (UPDATED/CONFLICT/
       UNCHANGED) dan D1-08 mencatat last-write-wins atas netto. Kini nilai kewajiban beku TERKUNCI dari batch biasa, sehingga semantik
       expect/retry diuji pada field yang tetap boleh diubah (jatuhTempo), dan perubahan netto diuji harus ditolak. */
    const srv = frozen(); const id = kwS1(srv)[0];
    const w1 = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { jatuhTempo: '2026-09-10' }, expect: { jatuhTempo: '' } }]);
    const w2 = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { jatuhTempo: '2026-09-15' }, expect: { jatuhTempo: '' } }]);
    const w3 = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { jatuhTempo: '2026-09-10' }, expect: { jatuhTempo: '' } }]);
    const w4 = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id, row: { netto: 230000 } }]);
    const r = x => x.ok && x.data.results[0].code;
    rec('D1-07', 'tulis bersamaan dengan expect (field jatuhTempo): penulis kedua -> CONFLICT; retry penulis pertama dengan nilai sama -> UNCHANGED (tidak ganda)', r(w1) === 'UPDATED' && r(w2) === 'CONFLICT' && r(w3) === 'UNCHANGED', [r(w1), r(w2), r(w3)].join(' '));
    rec('D1-08', '[P1_23] celah last-write-wins atas NILAI kewajiban beku tertutup: netto tanpa expect -> KEWAJIBAN_BEKU_TERKUNCI, netto tetap 200.000', null, 'tanpa expect -> ' + r(w4) + ', netto akhir ' + kwS1(srv)[kwCol(srv, 'netto')]); }
  { // D1-09: definisi beku tidak konsisten antara jalur klien & server
    const srv = frozen();
    const w = srv.sb.opRecordBatch('kewajiban', [{ op: 'upsert', id: 'tagihan_klien_1', row: { siswaId: 's1', komponenId: 'kmp_spp', periode: P, bruto: 175000, potongan: '[]', netto: 175000, tagihanId: 'tagihan_klien_1', computedAt: '2026-10-01T00:00:00.000Z' } }]);
    const n = kwRows(srv).filter(r => r[1] === 's1' && r[2] === 'kmp_spp' && r[3] === P && r[kwCol(srv, 'tagihanId')] !== '' && !r[kwCol(srv, 'archivedAt')]).length;
    rec('D1-09', 'TEMUAN: id kewajiban beku tidak tunggal per kunci siswa|komponen|periode - server memakai kw_<hash kunci>, klien (freezeObligationsFor_/tagihanSnapshotRow_) uid("tagihan") acak dan mencocokkan komponen lewat NAMA; batch menerima baris beku kedua untuk kunci yang sama', null,
      J({ batch: w.ok && w.data.results[0].code, barisBekuUntukKunci: n, terbaca: ob(srv) })); }

  const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
  R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
  console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
