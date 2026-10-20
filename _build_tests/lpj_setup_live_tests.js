/* Suite KESIAPAN SETUP LPJ & HARNESS NONPRODUKSI (P1_24; sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * - Harness _live_tests/LiveReadiness.gs tambahan P1_24 dijalankan di sandbox: identitas (GAP-005), audit D-1 baca-saja,
 *   pratinjau/setup LPJ terjaga (konfirmasi ganda, snapshot isi, idempoten, data lama identik), cek rollback.
 *   Lulus di sini TIDAK berarti uji live lulus: harness belum dijalankan di Apps Script; salinan uji belum tersedia.
 * - Jalur LPJ sesudah setup: klik ganda, retry, kegagalan parsial setup, lepas tautan lalu buat ulang (perbaikan P1_24).
 */
const { makeServer, SERVER_FILES } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const safe = f => { try { return f(); } catch (e) { return { threw: String(e && e.message || e) }; } };
const PROD = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY', CONF = 'BUAT_SKEMA_UANG_MUKA_LPJ', COPY = 'copy123';
function harness(ssId, propId, o) {
  const srv = makeServer({ files: SERVER_FILES.concat(['_live_tests/LiveReadiness.gs']) });
  srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF');
  const props = {}; if (propId !== undefined) props.LIVE_TEST_SPREADSHEET_ID = propId;
  const orig = srv.sb.SpreadsheetApp.getActiveSpreadsheet, ss0 = orig();
  srv.failInsert = (o && o.failInsert) || null;
  const ss = Object.assign({}, ss0, { getId: () => ssId, getName: () => 'SALINAN UJI',
    insertSheet: n => { if (srv.failInsert === n) { srv.failInsert = null; throw new Error('simulasi gagal membuat sheet ' + n); } return ss0.insertSheet(n); } });
  srv.sb.SpreadsheetApp.getActiveSpreadsheet = () => ss;
  srv.sb.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) };
  srv.sb.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@sekolah.test' });
  srv.props = props; return srv;
}
/* data historis: 2 LPJ lama (satu bertaut transaksi), 2 mutasi TEREKONSILIASI */
function seedHistoris(srv) {
  const L = srv.sheets['19_LPJ'], h = L[0];
  L.push(h.map(k => ({ id: 'lpj_lama1', tanggal: '2026-09-05', unit: 'MI', kategori: 'ATK', item: 'Nota lama', nominal: 50000, status: 'REALIZATION', transaksiId: 'imp_trx_2' })[k] || ''));
  L.push(h.map(k => ({ id: 'lpj_lama2', tanggal: '2026-09-06', unit: 'MI', kategori: 'ATK', item: 'Nota lama 2', nominal: 30000, status: 'REALIZATION' })[k] || ''));
  const M = srv.sheets['11_MUTASI_BANK'];
  ['m1', 'm2'].forEach((id, i) => M.push(M[0].map(k => ({ id, tanggal: '2026-09-0' + (i + 1), nominal: 1000, status: 'TEREKONSILIASI' })[k] || '')));
}
const rows = (s, n) => (s.sheets[n] || [[]]).slice(1);
const obj = (s, n, id) => { const h = s.sheets[n][0], r = s.sheets[n].slice(1).find(x => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])) : null; };
const code = r => r && (r.ok ? (r.data && r.data.replay ? 'REPLAY' : r.data && r.data.unchanged ? 'UNCHANGED' : 'OK') : r.code);

// ---------- pengaman salinan pada fungsi baru ----------
{ const fns = ['ltIdentitasProbe', 'ltKewajibanBekuAudit', 'ltLpjSetupPreview', 'ltLpjRollbackCek'];
  const prod = fns.map(f => safe(() => harness(PROD, PROD).sb[f]()).threw || 'TIDAK_DITOLAK');
  const tanpa = fns.map(f => safe(() => harness(COPY, undefined).sb[f]()).threw || 'TIDAK_DITOLAK');
  const apply = safe(() => harness(PROD, PROD).sb.ltLpjSetupApply(CONF, PROD)).threw || 'TIDAK_DITOLAK';
  rec('LS-01', 'semua fungsi harness P1_24 menolak spreadsheet PRODUKSI dan salinan tanpa konfirmasi Script Property (gagal tertutup sebelum membaca/menulis)',
    prod.concat([apply]).every(x => /PRODUKSI/.test(x)) && tanpa.every(x => /belum diisi manual/.test(x)), J({ prod: prod.map(x => x.slice(0, 40)), apply: apply.slice(0, 40) })); }

// ---------- GAP-005 identitas ----------
{ const a = harness(COPY, COPY); const ok = a.sb.ltIdentitasProbe();
  const b = harness(COPY, COPY); b.state.email = ''; const kosong = b.sb.ltIdentitasProbe();
  const c = harness(COPY, COPY); c.sb.Session.getActiveUser = () => { throw new Error('izin ditolak'); }; const lempar = c.sb.ltIdentitasProbe();
  rec('LS-02', 'probe identitas: email aktif terbaca + terdaftar -> SUCCESS/BENDAHARA (aktif != efektif = konfigurasi USER_DEPLOYING); email kosong (Gmail konsumen) -> AUTH_REQUIRED + diagnosis; getActiveUser melempar -> dicatat, gagal tertutup; email tidak dicatat utuh',
    ok.identitasServer.code === 'SUCCESS' && !ok.aktifSamaDenganEfektif && /USER_DEPLOYING/.test(ok.diagnosis) && kosong.identitasServer.code === 'AUTH_REQUIRED' && /EMAIL_AKTIF_KOSONG/.test(kosong.diagnosis)
      && lempar.identitasServer.authorized === false && /izin ditolak/.test(lempar.galatGetActiveUser) && !/bendahara@/.test(J(ok)),
    J({ ok: [ok.identitasServer.code, ok.domainAktif], kosong: kosong.identitasServer.code, lempar: lempar.identitasServer.code })); }

// ---------- D-1 audit lewat harness ----------
{ const s = harness(COPY, COPY); s.sb.opObligationSnapshot('September 2026', {});
  const h = s.sheets['04_KEWAJIBAN'][0], k = s.sheets['04_KEWAJIBAN'].find(r => r[1] === 's2'), d = k.slice(); d[0] = 'tagihan_lama'; d[h.indexOf('tagihanId')] = 'tagihan_lama'; s.sheets['04_KEWAJIBAN'].push(d);
  const before = J(s.sheets), r = s.sb.ltKewajibanBekuAudit();
  rec('LS-03', 'ltKewajibanBekuAudit: hasil audit + klasifikasi (1 DUPLIKAT_PASTI) dan bukti baca-saja (isi seluruh sheet identik, sheetBerubah kosong)',
    r.ok && r.bacaSaja && r.ringkasan.duplikatPasti === 1 && J(s.sheets) === before, J({ ringkasan: r.ringkasan, konsistensi: r.konsistensiData })); }

// ---------- setup LPJ terjaga ----------
{ const s = harness(COPY, COPY); seedHistoris(s); const before = J(s.sheets);
  const pv = s.sb.ltLpjSetupPreview(); const sheetsTetap = !s.sheets['32_UANG_MUKA'] && J(s.sheets) === before;
  rec('LS-04', 'pratinjau baca-saja: plan 3 sheet AKAN_DIBUAT + 9 kolom 19_LPJ; tidak ada sheet/kolom dibuat; snapshot isi disimpan di Script Property (bukan sheet); TEREKONSILIASI tercatat',
    pv.ok && pv.plan.filter(p => p.status === 'AKAN_DIBUAT').length === 3 && pv.plan.find(p => p.sheet === '19_LPJ').tambah.length === 9 && sheetsTetap && !!s.props.LIVE_TEST_LPJ_SNAPSHOT && pv.terekonsiliasi === 2,
    J({ plan: pv.plan.map(p => p.sheet + ':' + p.status), terekonsiliasi: pv.terekonsiliasi })); }
{ const s = harness(COPY, COPY); seedHistoris(s);
  const tanpaPv = safe(() => s.sb.ltLpjSetupApply(CONF, COPY)).threw || 'TIDAK_DITOLAK';
  s.sb.ltLpjSetupPreview();
  const idSalah = safe(() => s.sb.ltLpjSetupApply(CONF, 'salinan_lain')).threw || 'TIDAK_DITOLAK';
  const konfSalah = s.sb.ltLpjSetupApply('ya', COPY);
  s.sheets['05_TRANSAKSI'].push(s.sheets['05_TRANSAKSI'][1].slice()); // ada penulisan sesudah pratinjau
  const berubah = safe(() => s.sb.ltLpjSetupApply(CONF, COPY)).threw || 'TIDAK_DITOLAK';
  rec('LS-05', 'setup ditolak: tanpa pratinjau; ID salinan tidak cocok; konfirmasi salah (CONFIRM_REQUIRED, tidak ada sheet); data berubah sejak pratinjau -> tidak menulis apa pun',
    /lebih dulu/.test(tanpaPv) && /ID salinan/.test(idSalah) && konfSalah.setup.code === 'CONFIRM_REQUIRED' && /berubah sejak pratinjau/.test(berubah) && !s.sheets['32_UANG_MUKA'],
    J({ tanpaPv: tanpaPv.slice(0, 50), idSalah: idSalah.slice(0, 50), konf: konfSalah.setup.code, berubah: berubah.slice(0, 60) })); }
{ const s = harness(COPY, COPY); seedHistoris(s); const L0 = J(s.sheets['19_LPJ'].map(r => r.slice(0, s.sheets['19_LPJ'][0].length)));
  s.sb.ltLpjSetupPreview(); const ap = s.sb.ltLpjSetupApply(CONF, COPY);
  const nCol = s.sheets['19_LPJ'][0].length, lama = obj(s, '19_LPJ', 'lpj_lama1');
  rec('LS-06', 'setup pada salinan berdata historis: 3 sheet + 9 kolom dibuat; panggilan ulang UNCHANGED (idempoten); data lama identik pada kolom lama (LPJ lama tetap bertaut imp_trx_2, statusLpj kosong); TEREKONSILIASI 2 -> 2; hanya 13_AUDIT_LOG bertambah',
    ap.lulus && ap.ulang.unchanged && ap.dataLamaBerubah.length === 0 && ap.auditLogBertambah && J(ap.terekonsiliasi) === J([2, 2]) && lama.transaksiId === 'imp_trx_2' && lama.statusLpj === '' && J(JSON.parse(L0).map((r, i) => s.sheets['19_LPJ'][i].slice(0, r.length))) === L0,
    J({ setup: ap.setup.data, kolom19: nCol, dataLamaBerubah: ap.dataLamaBerubah })); }
{ const s = harness(COPY, COPY, { failInsert: '33_UANG_MUKA_KEMBALI' }); seedHistoris(s);
  s.sb.ltLpjSetupPreview(); const a1 = s.sb.ltLpjSetupApply(CONF, COPY); const mid = ['32_UANG_MUKA', '33_UANG_MUKA_KEMBALI', '34_LPJ_TAUTAN'].map(n => !!s.sheets[n]);
  const plan = s.sb.opUangMukaLpjPlan().data.plan.map(p => p.sheet + ':' + p.status);
  s.sb.ltLpjSetupPreview(); const a2 = s.sb.ltLpjSetupApply(CONF, COPY);
  rec('LS-07', 'kegagalan parsial setup (sheet 33 gagal dibuat): hasil WRITE_FAILED, lulus=false; pratinjau berikut menunjukkan sisa; setup ulang melengkapi tanpa duplikat sheet/kolom; data lama tetap identik',
    a1.lulus === false && a1.setup.ok === false && J(mid) === J([true, false, false]) && a2.lulus && s.sheets['19_LPJ'][0].filter(h => h === 'statusLpj').length === 1 && a2.dataLamaBerubah.length === 0,
    J({ gagal: a1.setup.code, sesudahGagal: mid, plan, ulang: a2.setup.data })); }
{ const s = harness(COPY, COPY); seedHistoris(s); const c0 = s.sb.ltLpjRollbackCek();
  s.sb.ltLpjSetupPreview(); s.sb.ltLpjSetupApply(CONF, COPY); const before = J(s.sheets); const c1 = s.sb.ltLpjRollbackCek(); const ro = J(s.sheets) === before;
  s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_baru', row: { tanggal: '2026-09-25', unit: 'MI', kategori: 'ATK', item: 'n', nominal: 45000, status: 'REALIZATION' } }]);
  s.sb.opCreateExpenseFromLpj({ lpjId: 'lpj_baru', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' }); const c2 = s.sb.ltLpjRollbackCek();
  rec('LS-08', 'cek rollback baca-saja: sebelum setup kosong; sesudah setup kosong (aman dihapus manual); setelah dipakai (tautan 34) -> tidak kosong, jangan dihapus. Tidak ada fungsi penghapus',
    c0.kosong && c1.kosong && ro && c2.kosong === false && c2.sheet['34_LPJ_TAUTAN'] === 1 && typeof s.sb.ltLpjRollback === 'undefined', J({ sesudahSetup: c1.sheet, dipakai: c2.sheet })); }

// ---------- jalur LPJ sesudah setup (sandbox) ----------
function siap() { const s = harness(COPY, COPY); seedHistoris(s); s.sb.ltLpjSetupPreview(); s.sb.ltLpjSetupApply(CONF, COPY);
  s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_a', row: { tanggal: '2026-10-05', unit: 'MI', kategori: 'ATK', item: 'Nota A', nominal: 45000, status: 'REALIZATION' } }]); return s; }
const P = { lpjId: 'lpj_a', akunId: 'akun_kas1', unit: 'MI', kategori: 'ATK' };
const trxLpj = s => rows(s, '05_TRANSAKSI').filter(r => /Dari LPJ lpj_a/.test(r.join('|')));
const aktif = (s, id) => { const t = obj(s, '05_TRANSAKSI', id); return t && !t.archivedAt; };
{ const s = siap(); const a = s.sb.opCreateExpenseFromLpj(P), b = s.sb.opCreateExpenseFromLpj(P);
  const lama = s.sb.opRecordBatch('lpj', [{ op: 'upsert', id: 'lpj_lama2', row: { transaksiId: 'imp_trx_2' } }]);
  rec('LS-09', 'sesudah setup: buat dari LPJ + klik ganda -> 1 transaksi (REPLAY); jalur lama (opRecordBatch tautan LPJ historis) -> GUNAKAN_OPERASI_TAUTAN: tidak ada dua jalur yang mengeksekusi aksi sama',
    a.ok && code(b) === 'REPLAY' && trxLpj(s).length === 1 && lama.data.results[0].code === 'GUNAKAN_OPERASI_TAUTAN', J({ b: code(b), lama: lama.data.results[0].code })); }
{ const s = siap(); const a = s.sb.opCreateExpenseFromLpj(P);
  s.sb.opUnlinkLpj({ lpjId: 'lpj_a', alasan: 'transaksi salah nominal, diulang', expect: { transaksiId: a.data.transaksiId } });
  const b = s.sb.opCreateExpenseFromLpj(P);
  const rl = s.sb.opLinkLpj({ lpjId: 'lpj_a', transaksiId: a.data.transaksiId, expect: { transaksiId: '' } });
  rec('LS-10', '[P1_24 perbaikan] lepas tautan lalu "Buat Transaksi" sementara transaksi lama masih AKTIF -> TRANSAKSI_LPJ_SEBELUMNYA_AKTIF (tidak membuat transaksi kedua); tautkan ulang lewat opLinkLpj berhasil',
    b.code === 'TRANSAKSI_LPJ_SEBELUMNYA_AKTIF' && trxLpj(s).length === 1 && rl.ok && obj(s, '19_LPJ', 'lpj_a').transaksiId === a.data.transaksiId, J({ b: b.code, relink: code(rl) })); }
{ const s = siap(); const a = s.sb.opCreateExpenseFromLpj(P);
  s.sb.opUnlinkLpj({ lpjId: 'lpj_a', alasan: 'transaksi salah nominal, diulang', expect: { transaksiId: a.data.transaksiId } });
  s.sb.opArchiveTransaction(a.data.transaksiId, 'salah nominal');
  const b = s.sb.opCreateExpenseFromLpj(P), c = s.sb.opCreateExpenseFromLpj(P), L = obj(s, '19_LPJ', 'lpj_a');
  rec('LS-11', '[P1_24 perbaikan] lepas tautan + transaksi lama diarsip -> "Buat Transaksi" membuat transaksi BARU yang aktif (sebelum P1_24: menautkan ulang ke transaksi yang diarsip); klik ganda -> REPLAY; tepat 1 transaksi aktif dari LPJ',
    b.ok && b.data.transaksiId !== a.data.transaksiId && aktif(s, b.data.transaksiId) && !aktif(s, a.data.transaksiId) && code(c) === 'REPLAY' && L.transaksiId === b.data.transaksiId && trxLpj(s).filter(r => aktif(s, r[0])).length === 1,
    J({ lama: a.data.transaksiId.slice(0, 16), baru: b.ok && b.data.transaksiId.slice(0, 16), c: code(c) })); }
{ const s = siap(); const a = s.sb.opCreateExpenseFromLpj(P);
  s.sb.opUnlinkLpj({ lpjId: 'lpj_a', alasan: 'transaksi salah nominal, diulang', expect: { transaksiId: a.data.transaksiId } });
  s.sb.opArchiveTransaction(a.data.transaksiId, 'salah nominal'); s.state.failSetValuesOn = '34_LPJ_TAUTAN';
  const b = s.sb.opCreateExpenseFromLpj(P), mid = trxLpj(s).filter(r => aktif(s, r[0])).length, c = s.sb.opCreateExpenseFromLpj(P);
  rec('LS-12', 'generasi kedua + kegagalan parsial (tulis tautan gagal): transaksi baru di-rollback, 0 transaksi aktif; retry -> tepat 1 transaksi aktif bertaut',
    !b.ok && mid === 0 && c.ok && trxLpj(s).filter(r => aktif(s, r[0])).length === 1 && obj(s, '19_LPJ', 'lpj_a').transaksiId === c.data.transaksiId, J({ b: b.code, mid, c: code(c) })); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
