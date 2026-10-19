const fs = require('fs'), cp = require('child_process');
const { makeServer, SERVER_FILES, srcOf, OUT } = require('./srv_env.js');
const SC = __dirname + '/';
const R = []; const rec = (n, ok, d) => R.push({ n, ok: !!ok, d });
const audits = s => s.sheets['13_AUDIT_LOG'].slice(1).map(r => r[2]);

// ---------- STATIC ----------
['RecordEngine', 'AdminAPI', 'BuktiDrive', 'ObligationEngine', 'FinanceEngine', 'TarifPlan', 'AllocationGuard', 'OperationalAPI', 'TransactionEngine', 'MasterDataRead'].forEach(f => {
  fs.writeFileSync(SC + 'chk_' + f + '.js', srcOf(f + '.gs'));
  let ok = true, err = ''; try { cp.execFileSync('node', ['--check', SC + 'chk_' + f + '.js'], { stdio: 'pipe' }); } catch (e) { ok = false; err = String(e.stderr).slice(0, 200); }
  rec('S syntax ' + f + '.gs', ok, err);
});
const names = s => new Set([...(s.match(/^function\s+([A-Za-z0-9_$]+)/gm) || []).map(l => l.replace(/^function\s+/, '')), ...(s.match(/^var\s+([A-Za-z0-9_$]+)/gm) || []).map(l => l.replace(/^var\s+/, ''))]);
const seen = {}; let dup = [];
SERVER_FILES.forEach(f => names(srcOf(f)).forEach(n => { if (seen[n] && seen[n] !== f) dup.push(n + ' (' + seen[n] + ' vs ' + f + ')'); seen[n] = seen[n] || f; }));
rec('S tidak ada naming collision lintas SELURUH file server (' + Object.keys(seen).length + ' nama)', dup.length === 0, dup);
const all = SERVER_FILES.map(f => srcOf(f)).join('\n');
const BUILTIN = new Set(['Object', 'Array', 'String', 'Number', 'Math', 'isFinite', 'isNaN', 'Boolean', 'JSON', 'Date', 'Error', 'RegExp', 'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'parseInt', 'parseFloat', 'Set', 'Map']);
const defined = new Set(Object.keys(seen));
['RecordEngine', 'AdminAPI', 'BuktiDrive', 'ObligationEngine', 'FinanceEngine', 'TarifPlan', 'AllocationGuard'].forEach(f => {
  const body = srcOf(f + '.gs').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/\/(?:[^\/\\\n]|\\.)+\/[gimy]*(?=[.\s;,)])/g, '/r/');
  const calls = new Set(); let mm; const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g; while ((mm = re.exec(body))) calls.add(mm[2]);
  const locals = new Set(['mk', 'm', 'c', 'set', 'toObj', 'short', 'finish', 'matchFn', 'f', 'fn', 'cb', 'sum', 'byStatus', 'inP', 'alive', 'nominal', 'push', 'kn', 'all', 'addT', 'addK', 'tarifKomponenOk', 'tingkat', 'inScope']); // variabel fungsi lokal ([P1-RAB] inScope di fccBudgetVsActual_)
  const bad = [...calls].filter(c => !defined.has(c) && !BUILTIN.has(c) && !locals.has(c));
  rec('S referensi fungsi terdefinisi di ' + f + '.gs', bad.length === 0, bad);
});
rec('S tidak ada API hapus/clear permanen di file baru', !/deleteRow|deleteSheet|\.clear\(|clearContent|deleteRowById_|removeItem/.test(['RecordEngine', 'AdminAPI', 'BuktiDrive', 'ObligationEngine', 'FinanceEngine', 'TarifPlan', 'AllocationGuard'].map(f => srcOf(f + '.gs')).join('\n')));
rec('S tidak ada &lt;/&gt; atau "<?" di file server baru', !/&lt;|&gt;|&amp;|<\?/.test(['RecordEngine', 'AdminAPI', 'BuktiDrive', 'ObligationEngine', 'FinanceEngine', 'TarifPlan', 'AllocationGuard'].map(f => srcOf(f + '.gs')).join('\n')));
rec('S ObligationEngine: fungsi bisnis = salinan verbatim dari HTML (dihasilkan, bukan ditulis ulang)', /DIHASILKAN OTOMATIS/.test(srcOf('ObligationEngine.gs')) && /function kewajibanSatuBaris\(/.test(srcOf('ObligationEngine.gs')));

// ---------- FUNCTIONAL ----------
(async () => {
  try {
    let s = makeServer(); const B = s.sb;
    // R1 sebelum migrasi aditif
    let r = B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_t1', row: { periode: 'Oktober 2026', program: 'ATK', nominal: '500000', unit: 'MI' } }]);
    rec('R1 create record anggaran (kolom sesuai header live): CREATED, nominal numerik', r.ok && r.data.results[0].code === 'CREATED' && s.sheets['08_ANGGARAN'][2][5] === 500000, JSON.stringify(r.data && r.data.results));
    r = B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_t2', row: { periode: 'Oktober 2026', status: 'Diajukan' } }]);
    rec('R2 field di luar header live ditolak eksplisit (UNKNOWN_FIELD), tidak dibuang diam-diam', r.ok && r.data.results[0].code === 'UNKNOWN_FIELD' && s.sheets['08_ANGGARAN'].length === 3, JSON.stringify(r.data.results[0]));
    r = B.opRecordBatch('anggaran', [{ op: 'archive', id: 'ang_t1', reason: 'x' }]);
    rec('R3 arsip tanpa kolom aditif -> SCHEMA_ADDITIVE_REQUIRED (tidak menebak/menambah kolom sendiri)', r.data.results[0].code === 'SCHEMA_ADDITIVE_REQUIRED');
    // R4 skema aditif
    const plan = B.opSchemaPlan();
    rec('R4 opSchemaPlan: 03_TARIF butuh status (seed sempit), 07_AKUN dan 10_BUKTI TIDAK ditambah (tidak ada jalur aplikasi yang memerlukan), 09_KOMITMEN butuh rabId, sheet record butuh kolom arsip; read-only', plan.ok && plan.data.plan.find(p => p.sheet === '03_TARIF').add.join() === 'status' && plan.data.plan.find(p => p.sheet === '07_AKUN') === undefined && plan.data.plan.find(p => p.sheet === '10_BUKTI').add.join() === 'archivedAt,archivedBy,archiveReason' && plan.data.plan.find(p => p.sheet === '05_TRANSAKSI').add.join() === 'archivedAt,archivedBy,archiveReason' && plan.data.pendingSheets >= 10);
    rec('R5 opSchemaApply tanpa token konfirmasi ditolak (CONFIRM_REQUIRED)', B.opSchemaApply('ya').code === 'CONFIRM_REQUIRED' && s.sheets['03_TARIF'][0].length === 6);
    const beforeData = JSON.stringify(s.sheets['05_TRANSAKSI'].slice(1)) + JSON.stringify(s.sheets['01_SISWA'].slice(1)) + JSON.stringify(s.sheets['01_SISWA'][0].slice(0, 14));
    r = B.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    rec('R6 migrasi aditif: kolom ditambah di UJUNG header, data & kolom lama tidak berubah', r.ok && s.sheets['03_TARIF'][0].slice(0, 6).join() === 'id,komponenId,unit,kelas,tahunAjaran,nominal' && s.sheets['03_TARIF'][0][6] === 'status' && JSON.stringify(s.sheets['05_TRANSAKSI'].slice(1)) + JSON.stringify(s.sheets['01_SISWA'].slice(1)) + JSON.stringify(s.sheets['01_SISWA'][0].slice(0, 14)) === beforeData && s.sheets['05_TRANSAKSI'][0].slice(-3).join() === 'archivedAt,archivedBy,archiveReason', JSON.stringify(s.sheets['05_TRANSAKSI'][0].slice(-4)));
    rec('R7 migrasi aditif idempotent (kedua kali: tidak ada kolom baru) + audit SCHEMA_ADD_COLUMNS', B.opSchemaApply('TAMBAH_KOLOM_ADITIF').data.added.length === 0 && audits(s).includes('SCHEMA_ADD_COLUMNS'));
    // R8 record engine setelah migrasi
    r = B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_t2', row: { periode: 'Oktober 2026', program: 'Listrik', nominal: 100, status: 'Diajukan', keterangan: 'uji' } }, { op: 'upsert', id: 'ang_t1', row: { nominal: 500000 } }]);
    rec('R8 setelah migrasi: kolom baru diterima; kirim ulang data sama -> UNCHANGED (idempotent)', r.ok && r.data.results[0].code === 'CREATED' && r.data.results[1].code === 'UNCHANGED', JSON.stringify(r.data.results));
    r = B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'ang_t2', row: { nominal: 150 } }, { op: 'archive', id: 'ang_t1', reason: 'salah input' }, { op: 'archive', id: 'ang_t1', reason: 'ulang' }, { op: 'archive', id: 'tidak_ada', reason: 'x' }, { op: 'upsert', id: 'a b', row: {} }]);
    const c = r.data.results.map(x => x.code).join();
    rec('R9 update/arsip/arsip-ulang/NOT_FOUND/id tidak valid dalam satu batch: UPDATED,ARCHIVED,UNCHANGED,NOT_FOUND,VALIDATION_ERROR', c === 'UPDATED,ARCHIVED,UNCHANGED,NOT_FOUND,VALIDATION_ERROR', c);
    rec('R10 arsip = isi kolom archivedAt/By/Reason, baris TIDAK dihapus; audit RECORD_ARCHIVE/UPDATE/CREATE', s.sheets['08_ANGGARAN'].length === 4 && s.sheets['08_ANGGARAN'][2][s.sheets['08_ANGGARAN'][0].indexOf('archivedBy')] === 'bendahara@x.id' && ['RECORD_ARCHIVE:anggaran', 'RECORD_UPDATE:anggaran', 'RECORD_CREATE:anggaran'].every(a => audits(s).includes(a)));
    // R11 role
    s.state.email = 'auditor@x.id';
    rec('R11 AUDITOR: tulis ditolak (ROLE_NOT_ALLOWED), BACA diizinkan', B.opRecordBatch('anggaran', [{ op: 'upsert', id: 'zzz_1', row: {} }]).code === 'ROLE_NOT_ALLOWED' && B.opReadSheet('08_ANGGARAN').ok && B.opSchemaPlan().ok && B.opUserList().code === 'ROLE_NOT_ALLOWED' && B.opSchemaApply('TAMBAH_KOLOM_ADITIF').code === 'ROLE_NOT_ALLOWED');
    s.state.email = 'bendahara@x.id';
    // R12 arsip transaksi + engine patch
    B.opCreateIncome({ tanggal: '2026-10-01', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Donasi', clientRequestId: 'c1' });
    const trxId = s.sheets['05_TRANSAKSI'][3][0];
    let a1 = B.opCreateAllocation({ transaksiId: trxId, siswaId: 's1', komponenId: 'kmp_spp', periode: 'Juli 2026', nominal: 700, clientRequestId: 'a1' });
    let a2 = B.opCreateAllocation({ transaksiId: trxId, siswaId: 's1', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 400, clientRequestId: 'a2' });
    rec('R12 engine: alokasi yang melebihi nominal ditolak (sebelum arsip)', a1.ok && !a2.ok && a2.code === 'ALLOCATION_EXCEEDS_TRANSACTION', a2.code);
    const alkId = a1.data.id;
    r = B.opArchiveAllocation(alkId, 'koreksi');
    a2 = B.opCreateAllocation({ transaksiId: trxId, siswaId: 's1', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 400, clientRequestId: 'a2b' });
    rec('R13 reversal alokasi: diarsipkan (bukan dihapus) lalu alokasi pengganti DITERIMA (engine arsip-aware)', r.ok && r.data.diarsipkan === 1 && a2.ok && s.sheets['06_ALOKASI'].some(x => x[0] === alkId), a2.code + ' ' + a2.message);
    r = B.opArchiveTransaction(trxId, 'salah catat');
    const archivedAlk = s.sheets['06_ALOKASI'].filter(x => x[1] === trxId && x[s.sheets['06_ALOKASI'][0].indexOf('archivedAt')]).length;
    rec('R14 reversal transaksi: transaksi + SEMUA alokasinya diarsipkan, tidak ada baris hilang; ulangi -> idempotent', r.ok && r.data.transaksiDiarsipkan === 1 && archivedAlk === 2 && B.opArchiveTransaction(trxId, 'ulang').data.transaksiDiarsipkan === 0 && s.sheets['05_TRANSAKSI'].length === 4, JSON.stringify(r.data));
    rec('R15 opArchiveTransaction untuk id tak ada -> NOT_FOUND', B.opArchiveTransaction('tidak-ada', 'x').code === 'NOT_FOUND');
    rec('R16 getStudentPosition mengabaikan alokasi arsip', B.opGetStudentPosition('s1').data.totalTerbayar === 200000, JSON.stringify(B.opGetStudentPosition('s1').data));
    // R17 batch tx
    r = B.opCreateTxBatch([{ kind: 'expense', payload: { tanggal: '2026-10-02', unit: 'MI', nominal: 10, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'X', clientRequestId: 'b1' } }, { kind: 'income', payload: { tanggal: '2026-10-02', unit: 'MI', nominal: 20, akunId: 'tidak_ada', metode: 'Tunai', status: 'TERCATAT', clientRequestId: 'b2' } }, { kind: 'expense', payload: { tanggal: '2026-10-02', unit: 'MI', nominal: 10, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', kategori: 'ATK', penerima: 'X', clientRequestId: 'b1' } }, { kind: 'zzz' }]);
    const rr = r.data.results;
    rec('R17 batch transaksi: ok / INVALID_ACCOUNT / replay idempotent (ID sama, tanpa baris ganda) / kind salah', rr[0].ok && rr[1].code === 'INVALID_ACCOUNT' && rr[2].ok && rr[2].id === rr[0].id && rr[3].code === 'VALIDATION_ERROR' && s.sheets['05_TRANSAKSI'].filter(x => x[0] !== 'id' && String(x[0]).startsWith('gas_trx_')).length === 2, JSON.stringify(rr.map(x => x.code)));
    // R18 master batch client id
    r = B.opMasterBatch('siswa', [{ id: 'ui_siswa_001', nama: 'ANI', unit: 'MI', kelas: '1' }, { id: 'ui_siswa_002', nama: 'BUDI', unit: 'TK', kelas: 'A' }, { id: 'ui_siswa_001', nama: 'ANI', unit: 'MI', kelas: '1' }, { id: 'ui_siswa_003', nama: 'X', unit: 'ZZ' }]);
    const mr = r.data.results;
    rec('R18 batch master dengan ID klien: dibuat (ID = ID klien), kirim ulang tidak menggandakan, validasi tetap berlaku', mr[0].ok && mr[1].ok && mr[2].ok && !mr[3].ok && s.sheets['01_SISWA'].filter(x => String(x[0]).startsWith('ui_siswa_')).length === 2 && s.sheets['01_SISWA'].some(x => x[0] === 'ui_siswa_001'), JSON.stringify(mr.map(x => x.code)));
    // R19 settings
    r = B.opSettingsUpsert([{ key: 'namaBendahara', value: 'Ibu X' }, { key: 'periodeAktif', value: 'Oktober 2026' }, { key: 'blob.kendala.n', value: '1' }]);
    rec('R19 settings: key baru ditambah, key lama diperbarui; audit SETTING_CREATE/UPDATE', r.ok && r.data.created === 2 && r.data.updated === 1 && s.sheets['15_SETTINGS'].find(x => x[0] === 'periodeAktif')[1] === 'Oktober 2026' && audits(s).includes('SETTING_CREATE') && audits(s).includes('SETTING_UPDATE'), JSON.stringify(r.data));
    rec('R20 settings: kirim ulang sama -> unchanged; key/value tidak valid & terlalu besar ditolak', B.opSettingsUpsert([{ key: 'namaBendahara', value: 'Ibu X' }]).data.unchanged === 1 && B.opSettingsUpsert([{ key: 'a b', value: 'x' }]).code === 'VALIDATION_ERROR' && B.opSettingsUpsert([{ key: 'k', value: 'x'.repeat(46000) }]).code === 'VALUE_TOO_LARGE' && B.opSettingsUpsert([{ key: 'k', value: 5 }]).code === 'VALIDATION_ERROR');
    // R21 audit mirror
    r = B.opAuditAppend([{ aksi: 'TAMBAH_ANGGARAN', after: { id: 'x' }, refId: 'x' }]);
    rec('R21 audit mirror UI_ tercatat append-only', r.ok && audits(s).includes('UI_TAMBAH_ANGGARAN') && B.opAuditAppend([]).code === 'VALIDATION_ERROR');
    // R22 users
    r = B.opUserList(); rec('R22 daftar pengguna', r.ok && r.data.users.length === 2 && r.data.me === 'bendahara@x.id');
    r = B.opUserUpsert({ email: ' Kepsek@X.id ', nama: 'Kepsek', role: 'KEPALA_SEKOLAH', unit: '', status: 'ACTIVE' });
    rec('R23 tambah pengguna: email dinormalisasi lowercase, id server, audit ACCESS_CREATE', r.ok && s.sheets['26_USER_ACCESS'][3][1] === 'kepsek@x.id' && String(s.sheets['26_USER_ACCESS'][3][0]).startsWith('gas_usr_') && audits(s).includes('ACCESS_CREATE'));
    rec('R24 email duplikat / role tak dikenal / email tak valid ditolak', B.opUserUpsert({ email: 'kepsek@x.id', nama: 'K', role: 'AUDITOR' }).code === 'DUPLICATE' && B.opUserUpsert({ email: 'a@b.id', nama: 'K', role: 'ADMIN' }).code === 'VALIDATION_ERROR' && B.opUserUpsert({ email: 'bukan-email', nama: 'K', role: 'AUDITOR' }).code === 'VALIDATION_ERROR');
    rec('R25 proteksi lockout: tidak bisa nonaktifkan/turunkan akun sendiri', B.opUserUpsert({ id: 'U1', email: 'bendahara@x.id', nama: 'B', role: 'BENDAHARA', unit: 'MI', status: 'INACTIVE' }).code === 'SELF_LOCKOUT' && B.opUserUpsert({ id: 'U1', email: 'bendahara@x.id', nama: 'B', role: 'AUDITOR', unit: 'MI', status: 'ACTIVE' }).code === 'SELF_LOCKOUT');
    r = B.opUserUpsert({ id: 'U2', email: 'auditor@x.id', nama: 'Auditor', role: 'AUDITOR', unit: '', status: 'INACTIVE' });
    rec('R26 nonaktifkan pengguna lain berhasil + audit ACCESS_UPDATE; pengguna nonaktif otomatis ditolak sistem (USER_INACTIVE)', r.ok && audits(s).includes('ACCESS_UPDATE') && (s.state.email = 'auditor@x.id', B.opReadSheet('08_ANGGARAN').code === 'USER_INACTIVE'));
    s.state.email = 'bendahara@x.id';
    // R27 Drive
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    r = B.opUploadBukti({ id: 'ui_bkt_0001', mimeType: 'image/png', base64: png, fileName: '../bukti transfer?.png', transaksiId: 'imp_trx_2', kategori: 'Bukti Transfer', judul: 'Uji' });
    const bs = s.sheets['10_BUKTI'];
    rec('R27 upload bukti: file di Drive (nama disanitasi), baris 10_BUKTI berisi driveFileId/driveFileUrl, fileRef kosong, audit BUKTI_UPLOAD', r.ok && bs.length === 2 && String(bs[1][bs[0].indexOf('driveFileId')]).startsWith('drv_') && bs[1][bs[0].indexOf('fileRef')] === '' && s.state.drive.files.length === 1 && !/[?\/]/.test(s.state.drive.files[0].name) && audits(s).includes('BUKTI_UPLOAD'), JSON.stringify(r));
    r = B.opUploadBukti({ id: 'ui_bkt_0001', mimeType: 'image/png', base64: png, fileName: 'x.png' });
    rec('R28 upload ulang id sama: idempotent (tidak membuat file/baris kedua)', r.ok && /idempotent/.test(r.message) && s.state.drive.files.length === 1 && s.sheets['10_BUKTI'].length === 2);
    rec('R29 tipe file berbahaya / terlalu besar / kosong ditolak', B.opUploadBukti({ id: 'ui_bkt_0002', mimeType: 'application/x-msdownload', base64: png }).code === 'VALIDATION_ERROR' && B.opUploadBukti({ id: 'ui_bkt_0003', mimeType: 'application/pdf', base64: 'A'.repeat(12 * 1024 * 1024 + 1) }).code === 'VALUE_TOO_LARGE' && B.opUploadBukti({ id: 'ui_bkt_0004', mimeType: 'application/pdf', base64: '' }).code === 'VALIDATION_ERROR');
    s.state.failSetValuesOn = '10_BUKTI';
    r = B.opUploadBukti({ id: 'ui_bkt_0005', mimeType: 'application/pdf', base64: png, fileName: 'y.pdf' });
    rec('R30 gagal tulis baris: file yang BARU dibuat dipindah ke trash (tanpa orphan), baris lain tidak tersentuh', !r.ok && s.state.drive.files.length === 2 && s.state.drive.files[1].trashed === true && s.state.drive.files[0].trashed === false && s.sheets['10_BUKTI'].length === 2);
    // R31 Obligation engine
    r = B.opObligations({ periode: 'September 2026' });
    rec('R31 server menghitung kewajiban (3 siswa MI aktif: s1 lunas via alokasi, s2 & ANI belum)', r.ok && r.data.count === 3 && r.data.totals.bruto === 600000 && r.data.totals.terbayar === 200000 && r.data.totals.sisa === 400000, JSON.stringify(r.data && r.data.totals));
    r = B.opObligationSnapshot('September 2026');
    const kw = s.sheets['04_KEWAJIBAN'];
    rec('R32 snapshot kewajiban ke 04_KEWAJIBAN: ID deterministik kw_*, tagihanId = id (BEKU, terbaca sebagai snapshot), tarif/kelas/unit tersimpan', r.ok && r.data.dibuat === 3 && kw.length === 4 && String(kw[1][0]).startsWith('kw_') && kw[1][kw[0].indexOf('tagihanId')] === kw[1][0] && kw[1][kw[0].indexOf('unit')] === 'MI' && kw[1][kw[0].indexOf('tarifSatuan')] === 200000, JSON.stringify(r.data) + JSON.stringify(kw[1]));
    r = B.opObligationSnapshot('September 2026');
    rec('R33 snapshot ulang idempotent: kewajiban yang sudah beku TIDAK dihitung ulang/ditimpa (tidak ada baris baru/berubah)', r.ok && r.data.dibuat === 0 && r.data.diperbarui === 0 && r.data.dihitung === 0 && s.sheets['04_KEWAJIBAN'].length === 4, JSON.stringify(r.data));
    // R34 FCC
    r = B.opFinancialControl('September 2026');
    rec('R34 Financial Control (server): struktur ACTUAL/COMMITTED/PLANNED/EXPECTED/MISSING + completeness; label bukan "Surplus"', r.ok && r.data.actual && r.data.committed && r.data.planned && r.data.expected && r.data.missing && r.data.completeness && !/^Surplus/i.test(r.data.label) && /bukan surplus/.test(r.data.label) && r.data.completeness.pct < 100 && r.data.warnings.length >= 1, r.data && r.data.label);
    rec('R35 FCC: angka benar (income 200000, expense 50000 pada September; RAB ATK 1.000.000 tanpa realisasi sesuai kategori? -> realisasi ATK 50000 ada)', r.data.actual.incomePeriode === 200000 && r.data.actual.expensePeriode === 50000 && r.data.planned.rabPeriode === 1000000 && r.data.missing.rabTanpaRealisasi.length === 0, JSON.stringify(r.data.actual));
    // R36 MasterDataRead membaca kolom aditif (status di tarif/akun)
    const akRej = B.opMasterUpsert('akun', { nama: 'Kas Baru', jenis: 'Kas', saldoAwal: 0, status: 'Nonaktif' }, 'ui_akun_001');
    B.opMasterUpsert('akun', { nama: 'Kas Baru', jenis: 'Kas', saldoAwal: 0 }, 'ui_akun_001');
    const ak = B.getAccounts().data.find(a => a.id === 'ui_akun_001');
    rec('R36 07_AKUN tidak diberi kolom status (tidak ada jalur central yang memerlukan): menulis status ditolak jelas (tidak dibuang diam-diam), akun tanpa status tetap tertulis; 03_TARIF status terbaca dari kolom live', !akRej.ok && /status/.test(akRej.message) && !!ak && ak.status === undefined && B.getTariffs().data[0].status === '', JSON.stringify(akRej) + JSON.stringify(ak));
    // R37 regresi: master read tetap sama untuk sheet tanpa kolom aditif
    rec('R37 regresi: getStudents/getComponents tetap mengembalikan data seperti sebelumnya', B.getStudents().data.length >= 2 && B.getComponents().data[0].id === 'kmp_spp' && Object.keys(B.getComponents().data[0]).join().startsWith('id,nama,unit,frekuensi,status,aliasOf'));
  } catch (e) { rec('HARNESS ERROR', false, e.stack.slice(0, 800)); }
  R.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : '  <= ' + JSON.stringify(x.d))));
  console.log('\nPASS=' + R.filter(x => x.ok).length + ' FAIL=' + R.filter(x => !x.ok).length);
})();
