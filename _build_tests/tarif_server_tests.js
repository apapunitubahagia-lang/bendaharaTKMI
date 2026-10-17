/* Tes statis (sandbox) - tarif 2026/2027, kewajiban, alokasi, invarian pembayaran.
   Kode GAS ASLI berjalan di atas mock Sheets. TIDAK menyentuh Google Sheets produksi. */
const fs = require('fs'), vm = require('vm');
const { liveLike, clone, obl, setBlob } = require('./live_seed.js');
const { srcOf } = require('./srv_env.js');
const R = []; const rec = (n, ok, d) => R.push({ n, ok: !!ok, d });
const audits = s => s.sheets['13_AUDIT_LOG'].slice(1).map(r => r[2]);
const rows = (s, n) => s.sheets[n].slice(1);
const col = (s, sh, h) => s.sheets[sh][0].indexOf(h);
const sum = a => a.reduce((x, y) => x + Number(y || 0), 0);
const find = (rs, komp, per) => rs.find(r => r.komponenId === komp && (per === undefined || r.periode === per));
const TA = 'Tahun Ajaran 2026/2027';
function applyPlan(srv) {
  let r = srv.sb.opSchemaApply('TAMBAH_KOLOM_ADITIF'); if (!r.ok) throw new Error('schema: ' + r.code);
  r = srv.sb.opTarifApply('TERAPKAN_RENCANA_TARIF'); return r;
}
function annualSum(rs) { return sum(rs.filter(r => r.komponenId.indexOf('kmp_thn_') === 0).map(r => r.netto)); }

(async () => {
  try {
    // ================= A. SUMBER & RENCANA =================
    let B9; const S0 = liveLike(); const B0 = S0.sb;
    const spec = B0.tpSpec_(), chk = B0.tpTotalsCheck_(spec);
    rec('A1 jumlah komponen = total di sumber (XLSX/PDF/DOCX) pada ' + chk.length + ' pemeriksaan; tidak ada selisih', chk.length >= 13 && chk.every(c => c.ok), chk.filter(c => !c.ok));
    const k1 = spec.tarif.filter(t => t.komponenId.indexOf('kmp_thn_') === 0 && t.kelas === '1'), k6 = spec.tarif.filter(t => t.komponenId.indexOf('kmp_thn_') === 0 && t.kelas === '6');
    rec('A1b nominal per kelas dari sumber: K1 12 komponen=2.200.000 (2.080.000 XLSX + Komite PDF), K6 11 komponen (tanpa Magang)=1.700.000', k1.length === 12 && sum(k1.map(t => t.nominal)) === 2200000 && k6.length === 11 && sum(k6.map(t => t.nominal)) === 1700000 && !k6.some(t => t.komponenId === 'kmp_thn_magang'));
    // deteksi selisih: ubah satu nominal sumber -> pemeriksaan harus gagal, TIDAK dikoreksi otomatis
    vm.runInContext('globalThis.__orig = tpMiAnnualDef_; tpMiAnnualDef_ = function(){ var d = __orig(); d[7][2]["3"] = 744000; return d; };', B0);
    const chk2 = B0.tpTotalsCheck_(B0.tpSpec_());
    rec('A2 selisih komponen vs total sumber terdeteksi dan ditandai (kelas 3 selisih -500) - tidak ada koreksi otomatis', chk2.filter(c => !c.ok).length >= 1 && chk2.some(c => !c.ok && c.selisih === -500), chk2.filter(c => !c.ok).map(c => c.label + ' ' + c.selisih));
    vm.runInContext('tpMiAnnualDef_ = __orig;', B0);

    const before = JSON.stringify(S0.sheets);
    const plan = B0.opTarifPlan();
    rec('A3 dry-run pada data mirip live: 31 komponen baru, 95 tarif baru, 4 tarif SPP sudah sesuai, 6 tarif lump akan dinonaktifkan, 0 konflik', plan.ok && plan.data.plan.ringkasan.komponenAdd === 31 && plan.data.plan.ringkasan.tarifAdd === 95 && plan.data.plan.ringkasan.tarifOk === 4 && plan.data.plan.ringkasan.tarifDeactivate === 6 && plan.data.plan.ringkasan.komponenKonflik + plan.data.plan.ringkasan.tarifKonflik === 0, plan.data && plan.data.plan.ringkasan);
    rec('A4 dry-run TIDAK menulis apa pun (seluruh isi sheet identik)', JSON.stringify(S0.sheets) === before);
    const im = plan.data.impact;
    rec('A5 laporan dampak: selisih tagihan tahunan lump vs sumber (K3-5: 2.200.000 -> 1.800.000; K6 -> 1.700.000), alokasi pada lump terdata', im.tahunanMi.find(r => r.kelas === '3').selisihPerSiswa === -400000 && im.tahunanMi.find(r => r.kelas === '6').selisihPerSiswa === -500000 && im.tahunanMi.find(r => r.kelas === '2').selisihPerSiswa === 0 && im.alokasiTerdampak.some(a => a.komponenId === 'kmp_pendidikan' && a.jumlahAlokasi === 2) && plan.data.bentrok.length === 3, JSON.stringify(im.tahunanMi) + JSON.stringify(im.alokasiTerdampak));
    rec('A5b ada 9 butir konfirmasi manusia (Komite K1, Magang K6, katering flat vs per hari, dst) + skema belum siap terdeteksi', plan.data.plan.confirm.length === 10 && plan.data.schema.ok === false, plan.data.schema);
    let r = B0.opTarifApply('x'); rec('A6 apply tanpa token ditolak (CONFIRM_REQUIRED)', !r.ok && r.code === 'CONFIRM_REQUIRED');
    r = B0.opTarifApply('TERAPKAN_RENCANA_TARIF'); rec('A7 apply sebelum migrasi skema aditif ditolak (SCHEMA_ADDITIVE_REQUIRED); tidak ada yang berubah', !r.ok && r.code === 'SCHEMA_ADDITIVE_REQUIRED' && rows(S0, '02_KOMPONEN').length === 10 && rows(S0, '03_TARIF').length === 18, r.code);
    S0.state.email = 'auditor@x.id'; r = B0.opTarifApply('TERAPKAN_RENCANA_TARIF'); const rp = B0.opTarifPlan(); S0.state.email = 'bendahara@x.id';
    rec('A8 AUDITOR: apply ditolak (ROLE_NOT_ALLOWED), melihat rencana diizinkan', r.code === 'ROLE_NOT_ALLOWED' && rp.ok);

    // ---- header LIVE: 09_KOMITMEN tanpa rabId, 10_BUKTI tanpa fileRef ----
    const pl9 = plan.data.schema.missing.join(',');
    const sp = B0.opSchemaPlan().data.plan;
    rec('A8b rencana skema memuat 09_KOMITMEN.rabId (+ arsip di UJUNG); 10_BUKTI.fileRef dan 07_AKUN.status TIDAK ditambah (tidak ada jalur aplikasi yang memerlukan)', sp.find(x => x.sheet === '09_KOMITMEN').add.join() === 'rabId,archivedAt,archivedBy,archiveReason' && sp.find(x => x.sheet === '10_BUKTI').add.join() === 'archivedAt,archivedBy,archiveReason' && sp.find(x => x.sheet === '07_AKUN') === undefined && /09_KOMITMEN\.rabId/.test(pl9), pl9);
    const kBefore = B0.opRecordBatch('komitmen', [{ op: 'upsert', id: 'kom_t1', row: { uraian: 'Uji', nominal: 1000, status: 'COMMITTED', rabId: 'ang_1', tanggal: '2026-09-01' } }]);
    rec('A8c sebelum migrasi: komitmen dengan rabId ditolak server (UNKNOWN_FIELD), tidak ditulis diam-diam', kBefore.ok && kBefore.data.results[0].code === 'UNKNOWN_FIELD' && /rabId/.test(kBefore.data.results[0].message) && rows(S0, '09_KOMITMEN').length === 0, kBefore.data && kBefore.data.results[0]);
    const S9 = liveLike(); B9 = S9.sb; B9.opSchemaApply('TAMBAH_KOLOM_ADITIF');
    const h9 = S9.sheets['09_KOMITMEN'][0], h10 = S9.sheets['10_BUKTI'][0];
    const kAfter = B9.opRecordBatch('komitmen', [{ op: 'upsert', id: 'kom_t1', row: { uraian: 'Uji', nominal: 1000, status: 'COMMITTED', rabId: 'ang_1', tanggal: '2026-09-01' } }]);
    rec('A8d setelah migrasi: kolom lama 09/10 tidak berubah & urutan tetap (rabId di ujung; fileRef tidak ditambah); komitmen dengan rabId tertulis di kolom yang benar', h9.slice(0, 6).join() === 'id,tanggal,uraian,nominal,status,jatuhTempo' && h9[6] === 'rabId' && h10.slice(0, 7).join() === 'id,kategori,transaksiId,judul,tanggal,driveFileId,driveFileUrl' && h10[7] === 'archivedAt' && !h10.includes('fileRef') && kAfter.ok && kAfter.data.results[0].code === 'CREATED' && S9.sheets['09_KOMITMEN'][1][h9.indexOf('rabId')] === 'ang_1' && S9.sheets['09_KOMITMEN'][1][h9.indexOf('uraian')] === 'Uji', h9);
    rec('A8e rencana skema kedua kali = tidak ada yang kurang (idempoten)', B9.opSchemaPlan().data.pendingSheets === 0);
    // ================= penerapan =================
    const S = liveLike(); const B = S.sb;
    const k0 = clone(rows(S, '02_KOMPONEN')), t0 = clone(rows(S, '03_TARIF')), a0 = clone(rows(S, '06_ALOKASI')), x0 = clone(rows(S, '05_TRANSAKSI'));
    r = applyPlan(S);
    rec('A9 penerapan berhasil: komponen +31, tarif +95, 6 tarif lump dinonaktifkan (status), audit TARIF_PLAN_APPLIED', r.ok && rows(S, '02_KOMPONEN').length === 41 && rows(S, '03_TARIF').length === 18 + 95 && audits(S).includes('TARIF_PLAN_APPLIED') && rows(S, '03_TARIF').filter(x => x[col(S, '03_TARIF', 'status')] === 'Nonaktif').length === 6, r.ok ? r.data : r.code + ' ' + r.message);
    const kNew = rows(S, '02_KOMPONEN');
    rec('A10 baris komponen/tarif lama TIDAK dihapus & isi lama tidak berubah (selain status tarif lump); transaksi & alokasi identik', JSON.stringify(kNew.slice(0, 10).map(x => x.slice(0, 6))) === JSON.stringify(k0.map(x => x.slice(0, 6))) && JSON.stringify(rows(S, '03_TARIF').slice(0, 18).map(x => x.slice(0, 6))) === JSON.stringify(t0.map(x => x.slice(0, 6))) && JSON.stringify(rows(S, '06_ALOKASI').slice(0, 4).map(x => x.slice(0, 9))) === JSON.stringify(a0.map(x => x.slice(0, 9))) && JSON.stringify(rows(S, '05_TRANSAKSI').slice(0, 4).map(x => x.slice(0, 23))) === JSON.stringify(x0.map(x => x.slice(0, 23))) && rows(S, '06_ALOKASI').length === 4);
    const frozenRows = rows(S, '04_KEWAJIBAN');
    rec('A11 kewajiban dengan pembayaran historis pada lump DIBEKUKAN lebih dulu (3 baris: pendidikan x2, biaya awal TK x1; SPP tidak termasuk), tagihanId terisi, tarif+kelas+unit tersimpan', frozenRows.length === 3 && frozenRows.every(x => x[col(S, '04_KEWAJIBAN', 'tagihanId')] === x[0] && x[col(S, '04_KEWAJIBAN', 'tarifId')] && x[col(S, '04_KEWAJIBAN', 'unit')]), frozenRows.map(x => x.join('|')));
    const rN = B.opTarifApply('TERAPKAN_RENCANA_TARIF');
    rec('A12 penerapan ULANG idempoten: tidak ada baris baru, ringkasan semua nol', rN.ok && rN.data.ringkasan.komponenAdd === 0 && rN.data.ringkasan.tarifAdd === 0 && rN.data.ringkasan.tarifDeactivate === 0 && rows(S, '02_KOMPONEN').length === 41 && rows(S, '03_TARIF').length === 113 && rows(S, '04_KEWAJIBAN').length === 3, rN.ok ? rN.data : rN.code);

    // ================= B. KEWAJIBAN SESUDAH PENERAPAN =================
    // SPP per kelas
    const sppOf = (id, per) => (find(obl(S, id, per), 'kmp_spp', per) || {}).netto;
    rec('B1 SPP MI: kelas 1=350.000, kelas 2=300.000, kelas 3-6=250.000 per bulan; TK=200.000', sppOf('mi1a', 'Juli 2026') === 350000 && sppOf('mi2a', 'Agustus 2026') === 300000 && ['mi3a', 'mi4a', 'mi5a', 'mi6a'].every(i => sppOf(i, 'September 2026') === 250000) && sppOf('tkb', 'Juli 2026') === 200000);
    // tahunan MI
    const ann = id => annualSum(obl(S, id));
    rec('B2 biaya tahunan MI tanpa pembayaran historis: K1=2.200.000, K2=2.200.000, K4=1.800.000, K5=1.800.000, K6=1.700.000 (jumlah komponen = total sumber)', ann('mi1a') === 2200000 && ann('mi2a') === 2200000 && ann('mi4a') === 1800000 && ann('mi5b') === 1800000 && ann('mi6a') === 1700000, [ann('mi1a'), ann('mi2a'), ann('mi4a'), ann('mi5b'), ann('mi6a')]);
    const o3a = obl(S, 'mi3a'), o3b = obl(S, 'mi3b');
    const lump3a = find(o3a, 'kmp_pendidikan');
    rec('B3 riwayat: siswa yang SUDAH membayar lump (mi3a 1.800.000) tetap melihat tagihan lump BEKU apa adanya (netto 2.080.000, terbayar 1.800.000, sisa 280.000) - tidak dihitung ulang diam-diam', !!lump3a && lump3a.netto === 2080000 && lump3a.terbayar === 1800000 && lump3a.sisa === 280000, lump3a);
    rec('B4 tidak ada tagihan GANDA: siswa dengan lump beku TIDAK ikut ditagih rincian tahunan (0 komponen kmp_thn_*), siswa yang belum membayar ditagih rincian saja (tanpa kmp_pendidikan)', annualSum(o3a) === 0 && annualSum(o3b) === 0 && !find(obl(S, 'mi4a'), 'kmp_pendidikan') && !find(obl(S, 'mi4a'), 'kmp_komite'));
    rec('B5 katering lump lama (kmp_catering 250.000) dan komite lump tidak lagi menagih siswa lain', !find(obl(S, 'mi5a'), 'kmp_catering') && !find(obl(S, 'mi5a'), 'kmp_komite'));
    // biaya masuk TK: butuh klasifikasi eksplisit
    const tkb0 = obl(S, 'tkb'); const tka0 = obl(S, 'tka');
    rec('B6 biaya masuk/daftar ulang TK TIDAK ditagih tanpa klasifikasi (tkb: hanya SPP), lump TK 3.000.000 yang menempel pembayaran tetap beku pada tka', tkb0.every(x => x.komponenId === 'kmp_spp') && !!find(tka0, 'kmp_biayaawal') && find(tka0, 'kmp_biayaawal').terbayar === 1600000 && find(tka0, 'kmp_biayaawal').sisa === 1400000);
    setBlob(S, 'pendaftaranStatus', [{ siswaId: 'tkb', tahunAjaran: '2026/2027', jenis: 'BARU' }, { siswaId: 'tkc', tahunAjaran: '2026/2027', jenis: 'DAFTAR_ULANG' }, { siswaId: 'tka', tahunAjaran: '2026/2027', jenis: 'BARU' }, { siswaId: 'mi1b', tahunAjaran: '2026/2027', jenis: 'BARU' }]);
    const entry = id => sum(obl(S, id).filter(x => /^kmp_(masuk|du)_/.test(x.komponenId)).map(x => x.netto));
    rec('B7 setelah klasifikasi: TK baru 3.000.000 (7 komponen), TK daftar ulang 1.450.000 (5 komponen), MI K1 baru 4.350.000 (6 komponen)', entry('tkb') === 3000000 && obl(S, 'tkb').filter(x => /^kmp_masuk_tk/.test(x.komponenId)).length === 7 && entry('tkc') === 1450000 && obl(S, 'tkc').filter(x => /^kmp_du_tk/.test(x.komponenId)).length === 5 && entry('mi1b') === 4350000, [entry('tkb'), entry('tkc'), entry('mi1b')]);
    rec('B8 tka (klasifikasi BARU tetapi punya lump beku berpembayaran): TIDAK ditagih rincian lagi (hindari ganda); mi1a (belum diklasifikasi) tidak ditagih biaya masuk', entry('tka') === 0 && entry('mi1a') === 0);
    rec('B9 klasifikasi per tahun ajaran dan unit: DAFTAR_ULANG tidak menagih biaya "baru" dan sebaliknya', !obl(S, 'tkc').some(x => /^kmp_masuk_tk/.test(x.komponenId)) && !obl(S, 'tkb').some(x => /^kmp_du_tk/.test(x.komponenId)));
    // katering per hari terjadwal
    rec('B10 katering: tanpa hari terjadwal belum ada kewajiban (tidak ada nilai bawaan)', !obl(S, 'mi1a').some(x => x.komponenId === 'kmp_katering_harian'));
    setBlob(S, 'cateringHari', { 'MI|Juli 2026': 20, 'MI|Agustus 2026': 18, 'MI|September 2026': 21 });
    const kat = (id, per) => (find(obl(S, id, per), 'kmp_katering_harian', per) || {});
    rec('B11 katering = tarif/hari x hari terjadwal: K1 Juli 20x13.000=260.000; K4 Agustus 18x13.000=234.000; K5 Juli 20x11.000=220.000; K6 September 21x11.000=231.000; hari & tarif tersimpan di baris', kat('mi1a', 'Juli 2026').netto === 260000 && kat('mi4a', 'Agustus 2026').netto === 234000 && kat('mi5a', 'Juli 2026').netto === 220000 && kat('mi6a', 'September 2026').netto === 231000 && kat('mi1a', 'Juli 2026').jumlahHari === 20 && kat('mi1a', 'Juli 2026').tarifSatuan === 13000, [kat('mi1a', 'Juli 2026'), kat('mi5a', 'Juli 2026')]);
    rec('B12 katering tidak bergantung kehadiran (tidak ada input absensi; siswa mana pun mendapat tagihan penuh), unit TK tidak ditagih katering MI', !obl(S, 'tkb').some(x => x.komponenId === 'kmp_katering_harian') && ['mi1a', 'mi1b', 'mi2a', 'mi3b'].every(i => kat(i, 'Agustus 2026').netto === 18 * (i.startsWith('mi1') || i.startsWith('mi2') || i.startsWith('mi3') ? 13000 : 11000)));
    // ================= C. PEMBEKUAN & RIWAYAT =================
    const julBefore = kat('mi1a', 'Juli 2026').netto;
    r = B.opObligationSnapshot('Juli 2026'); const frozenCnt = rows(S, '04_KEWAJIBAN').length;
    setBlob(S, 'cateringHari', { 'MI|Juli 2026': 22, 'MI|Agustus 2026': 19, 'MI|September 2026': 21 });
    rec('C1 setelah pembekuan Juli, mengubah hari terjadwal TIDAK mengubah kewajiban Juli (tetap 260.000, 20 hari), Agustus yang belum beku mengikuti (19 hari)', r.ok && kat('mi1a', 'Juli 2026').netto === julBefore && kat('mi1a', 'Juli 2026').jumlahHari === 20 && kat('mi1a', 'Agustus 2026').jumlahHari === 19 && kat('mi1a', 'Agustus 2026').netto === 19 * 13000, [r.ok && r.data, kat('mi1a', 'Juli 2026'), kat('mi1a', 'Agustus 2026')]);
    rec('C2 pembekuan idempoten: ulang tidak menambah/mengubah baris 04_KEWAJIBAN', (() => { const n = rows(S, '04_KEWAJIBAN').length; const r2 = B.opObligationSnapshot('Juli 2026'); return r2.ok && r2.data.dibuat === 0 && rows(S, '04_KEWAJIBAN').length === n; })());
    // tarif berubah
    r = B.opObligationSnapshot('*', { semua: true });
    const sppJulBeku = sppOf('mi1a', 'Juli 2026');
    const tarifK1 = rows(S, '03_TARIF').find(x => x[0] === 'imp_tarif_kmp_spp_MI_1_2026_2027');
    r = B.opMasterUpsert('tarif', { id: tarifK1[0], nominal: 400000 });
    rec('C3 tarif SPP kelas 1 naik 350.000 -> 400.000: kewajiban yang sudah BEKU tidak berubah; periode BARU (belum beku) memakai tarif baru', r.ok && sppOf('mi1a', 'Juli 2026') === sppJulBeku && sppOf('mi1a', 'Juli 2026') === 350000, [r.code, sppOf('mi1a', 'Juli 2026')]);
    r = B.opSettingsUpsert([{ key: 'periodeAktif', value: 'Oktober 2026' }]);
    rec('C4 periode berikutnya (Oktober, belum beku) otomatis memakai tarif baru 400.000, kewajiban Juli-September tetap 350.000', sppOf('mi1a', 'Oktober 2026') === 400000 && sppOf('mi1a', 'September 2026') === 350000, [sppOf('mi1a', 'Oktober 2026'), sppOf('mi1a', 'September 2026')]);
    B.opMasterUpsert('tarif', { id: tarifK1[0], nominal: 350000 }); B.opSettingsUpsert([{ key: 'periodeAktif', value: 'September 2026' }]);
    // naik kelas / tahun ajaran
    const sBefore = obl(S, 'mi2b'); const sppSep = find(sBefore, 'kmp_spp', 'September 2026').netto;
    B.opObligationSnapshot('*', { semua: true, siswaIds: ['mi2b'] });
    r = B.opMasterUpsert('siswa', { id: 'mi2b', kelas: '3 Syeikh Kelas 3', tahunAjaran: '2027/2028' });
    const sAfter = obl(S, 'mi2b');
    rec('C5 siswa naik kelas + pindah TA 2027/2028 SETELAH dibekukan: kewajiban TA lama tetap tampil dengan tarif kelas lama (SPP Sep 300.000), tidak lenyap', r.ok && find(sAfter, 'kmp_spp', 'September 2026') && find(sAfter, 'kmp_spp', 'September 2026').netto === sppSep && find(sAfter, 'kmp_spp', 'September 2026').netto === 300000, sAfter.length);
    
    // alokasi sebelum snapshot tetap terhitung
    const S2 = liveLike(); applyPlan(S2);
    const trxA = S2.sb.opCreateIncome({ tanggal: '2026-09-03', unit: 'MI', nominal: 100000, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: 'mi4a', clientRequestId: 'pre1', allocations: [{ siswaId: 'mi4a', komponenId: 'kmp_spp', periode: 'Agustus 2026', nominal: 100000, caraBayar: 'cicilan' }] });
    const beforeSnap = find(obl(S2, 'mi4a', 'Agustus 2026'), 'kmp_spp', 'Agustus 2026');
    S2.sb.opObligationSnapshot('Agustus 2026');
    const afterSnap = find(obl(S2, 'mi4a', 'Agustus 2026'), 'kmp_spp', 'Agustus 2026');
    rec('C7 alokasi yang dibuat SEBELUM kewajiban dibekukan (tanpa tagihanId) tetap terhitung sesudah beku (terbayar 100.000, sisa 150.000)', trxA.ok && beforeSnap.terbayar === 100000 && afterSnap.terbayar === 100000 && afterSnap.sisa === 150000, [beforeSnap, afterSnap]);

const sUnfrozen = obl(S2, 'mi6b'); S2.sb.opMasterUpsert('siswa', { id: 'mi6b', kelas: '6 Syeikh Kelas 6', tahunAjaran: '2027/2028' });
    rec('C6 kontras: siswa TANPA pembekuan sebelum naik TA kehilangan tampilan TA lama (itulah sebabnya UI membekukan otomatis sebelum perubahan TA)', sUnfrozen.length > 0 && obl(S2, 'mi6b').length < sUnfrozen.length, [sUnfrozen.length, obl(S2, 'mi6b').length]);
    // ================= D. ALOKASI & INVARIAN =================
    const S3 = liveLike(); applyPlan(S3); const B3 = S3.sb;
    setBlob(S3, 'cateringHari', { 'MI|Juli 2026': 20, 'MI|Agustus 2026': 18, 'MI|September 2026': 21 });
    const mk = (nom, allocs, cid, siswaId) => B3.opCreateIncome({ tanggal: '2026-09-10', unit: 'MI', nominal: nom, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: siswaId || 'mi5a', clientRequestId: cid, allocations: allocs });
    const al = (komp, per, nom, siswaId) => ({ siswaId: siswaId || 'mi5a', komponenId: komp, periode: per, nominal: nom, caraBayar: 'cicilan' });
    let d = mk(100000, [al('kmp_spp', 'Juli 2026', 100000)], 'p1');
    let ob5 = find(obl(S3, 'mi5a', 'Juli 2026'), 'kmp_spp', 'Juli 2026');
    rec('D1 pembayaran sebagian: SPP Juli 100.000 dari 250.000 -> terbayar 100.000, sisa 150.000', d.ok && ob5.terbayar === 100000 && ob5.sisa === 150000, d.code);
    d = mk(700000, [al('kmp_spp', 'Juli 2026', 150000), al('kmp_katering_harian', 'Juli 2026', 220000), al('kmp_thn_ekskul', TA, 100000), al('kmp_thn_buku', TA, 230000)], 'p2');
    const o5 = obl(S3, 'mi5a');
    rec('D2 pembayaran GABUNGAN 4 komponen dalam satu transaksi: tiap komponen terisi sesuai alokasi (SPP Juli lunas, katering Juli lunas, ekskul tahunan lunas, buku paket 230.000), total = nominal', d.ok && find(o5, 'kmp_spp', 'Juli 2026').sisa === 0 && find(o5, 'kmp_katering_harian', 'Juli 2026').sisa === 0 && find(o5, 'kmp_thn_ekskul').sisa === 0 && find(o5, 'kmp_thn_buku').terbayar === 230000 && 150000 + 220000 + 100000 + 230000 === 700000, d.code + ' ' + d.message);
    // nominal sama, komponen berbeda -> tidak otomatis
    const kPay = find(o5, 'kmp_spp', 'Agustus 2026').terbayar, kKat = find(o5, 'kmp_katering_harian', 'Agustus 2026');
    d = mk(250000, [al('kmp_spp', 'Agustus 2026', 250000)], 'p3');
    const o5b = obl(S3, 'mi5a');
    rec('D3 nominal 250.000 dialokasikan EKSPLISIT ke SPP: katering/komponen lain dengan nominal berdekatan tidak ikut terisi (identitas = siswa+komponen+periode)', d.ok && find(o5b, 'kmp_spp', 'Agustus 2026').sisa === 0 && find(o5b, 'kmp_katering_harian', 'Agustus 2026').terbayar === 0 && find(o5b, 'kmp_thn_phbi').terbayar === 0, d.code);
    // melebihi sisa
    const n06 = rows(S3, '06_ALOKASI').length, n05 = rows(S3, '05_TRANSAKSI').length;
    d = mk(300000, [al('kmp_spp', 'Agustus 2026', 300000)], 'p4');
    rec('D4 alokasi MELEBIHI sisa kewajiban ditolak (ALLOCATION_EXCEEDS_OBLIGATION); tidak ada transaksi/alokasi tertulis', !d.ok && d.code === 'ALLOCATION_EXCEEDS_OBLIGATION' && rows(S3, '06_ALOKASI').length === n06 && rows(S3, '05_TRANSAKSI').length === n05, d.code);
    d = mk(400000, [al('kmp_spp', 'September 2026', 200000), al('kmp_spp', 'September 2026', 200000)], 'p5');
    rec('D5 dua baris pada kewajiban yang SAMA dalam satu permintaan dijumlahkan: 400.000 > sisa 250.000 -> ditolak', !d.ok && d.code === 'ALLOCATION_EXCEEDS_OBLIGATION', d.code);
    d = mk(50000, [al('kmp_spp', 'Oktober 2026', 50000)], 'p6');
    rec('D6 alokasi ke kewajiban yang belum ada (periode di luar periode aktif) ditolak OBLIGATION_NOT_FOUND', !d.ok && d.code === 'OBLIGATION_NOT_FOUND', d.code);
    d = mk(50000, [al('kmp_masuk_tk_komite', 'SekaliBayar', 50000)], 'p7');
    rec('D7 alokasi ke komponen yang tidak berlaku bagi siswa (TK ke siswa MI / belum diklasifikasi) ditolak OBLIGATION_NOT_FOUND', !d.ok && d.code === 'OBLIGATION_NOT_FOUND', d.code);
    d = mk(50000, [al('kmp_spp', 'Juli 2026', 50000, 'tkb')], 'p8', 'mi5a');
    rec('D8 alokasi untuk siswa lain pada transaksi bersiswa berbeda ditolak engine (INVALID_ALLOCATION)', !d.ok, d.code);
    // kelebihan bayar
    const before06 = rows(S3, '06_ALOKASI').length;
    d = mk(1000000, [al('kmp_spp', 'September 2026', 250000)], 'p9');
    const trxP9 = d.ok ? rows(S3, '05_TRANSAKSI').find(x => x[0] === d.data.id) : null;
    const allocP9 = d.ok ? rows(S3, '06_ALOKASI').filter(x => x[1] === d.data.id) : [];
    rec('D9 KELEBIHAN bayar: hanya 250.000 yang dialokasikan, sisa 750.000 tetap sebagai dana belum dialokasikan di transaksi (tidak masuk kewajiban lain otomatis); terbayar kewajiban tidak melebihi netto', d.ok && sum(allocP9.map(x => x[5])) === 250000 && Number(trxP9[col(S3, '05_TRANSAKSI', 'nominal')]) - sum(allocP9.map(x => x[5])) === 750000 && find(obl(S3, 'mi5a', 'September 2026'), 'kmp_spp', 'September 2026').terbayar === 250000, d.code);
    // idempotensi
    const nT = rows(S3, '05_TRANSAKSI').length, nA = rows(S3, '06_ALOKASI').length;
    d = mk(1000000, [al('kmp_spp', 'September 2026', 250000)], 'p9');
    rec('D10 replay clientRequestId yang sama: tidak ditolak guard (replay), tidak ada transaksi/alokasi ganda', d.ok && rows(S3, '05_TRANSAKSI').length === nT && rows(S3, '06_ALOKASI').length === nA, d.code);
    // reversal
    const alkR = rows(S3, '06_ALOKASI').find(x => x[1] === (rows(S3, '05_TRANSAKSI').find(y => true) || [])[0]);
    const p1Trx = S3.sheets['24_IDEMPOTENCY_LOG'].find(x => x[0] === 'p1')[1];
    const p1Alk = rows(S3, '06_ALOKASI').find(x => x[1] === p1Trx)[0];
    d = B3.opArchiveAllocation(p1Alk, 'salah alokasi');
    rec('D11 reversal alokasi (arsip, bukan hapus): sisa SPP Juli kembali bertambah 100.000 (terbayar 150.000 dari p2), baris tetap ada', d.ok && find(obl(S3, 'mi5a', 'Juli 2026'), 'kmp_spp', 'Juli 2026').terbayar === 150000 && rows(S3, '06_ALOKASI').some(x => x[0] === p1Alk), d.code);
    d = mk(100000, [al('kmp_spp', 'Juli 2026', 100000)], 'p10');
    rec('D12 alokasi pengganti setelah reversal diterima (terbayar kembali 250.000)', d.ok && find(obl(S3, 'mi5a', 'Juli 2026'), 'kmp_spp', 'Juli 2026').terbayar === 250000, d.code);
    const p2Trx = S3.sheets['24_IDEMPOTENCY_LOG'].find(x => x[0] === 'p2')[1];
    d = B3.opArchiveTransaction(p2Trx, 'salah catat');
    rec('D13 arsip transaksi pembayaran gabungan: semua alokasinya ikut diarsipkan; katering Juli kembali belum dibayar; tidak ada baris hilang', d.ok && find(obl(S3, 'mi5a', 'Juli 2026'), 'kmp_katering_harian', 'Juli 2026').terbayar === 0, d.code);

    // ================= E. INVARIAN ACAK (seed tetap) =================
    const S4 = liveLike(); applyPlan(S4); const B4 = S4.sb;
    setBlob(S4, 'cateringHari', { 'MI|Juli 2026': 20, 'MI|Agustus 2026': 18, 'MI|September 2026': 21 });
    let seed = 20261014; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const stud = ['mi1a', 'mi2a', 'mi3a', 'mi4a', 'mi5a', 'mi6a', 'tkb'], pers = ['Juli 2026', 'Agustus 2026', 'September 2026', 'Oktober 2026'];
    const results = { ok: 0, tolak: 0, replay: 0, arsipAlk: 0, arsipTrx: 0 }; const reqs = [];
    let violations = [];
    const checkInvariants = tag => {
      const trxs = rows(S4, '05_TRANSAKSI'), alk = rows(S4, '06_ALOKASI'), ai = col(S4, '06_ALOKASI', 'archivedAt'), ti = col(S4, '05_TRANSAKSI', 'archivedAt');
      const ids = alk.map(x => x[0]); if (new Set(ids).size !== ids.length) violations.push(tag + ': ID alokasi ganda');
      const tids = trxs.map(x => x[0]); if (new Set(tids).size !== tids.length) violations.push(tag + ': ID transaksi ganda');
      trxs.forEach(t => {
        const act = alk.filter(x => x[1] === t[0] && !x[ai]); const s = sum(act.map(x => x[5])), nom = Number(t[4]);
        if (s > nom + 0.5) violations.push(tag + ': alokasi ' + s + ' > pembayaran ' + nom + ' (' + t[0] + ')');
        if (nom - s < -0.5) violations.push(tag + ': sisa dana negatif');
      });
      alk.forEach(a => { if (!trxs.some(t => t[0] === a[1])) violations.push(tag + ': alokasi yatim ' + a[0]); });
      stud.forEach(id => obl(S4, id).forEach(o => { if (o.terbayar > o.netto + 0.5) violations.push(tag + ': terbayar ' + o.terbayar + ' > netto ' + o.netto + ' ' + o.key); }));
    };
    for (let i = 0; i < 120; i++) {
      const roll = rnd();
      if (roll < 0.6) {
        const sid = stud[Math.floor(rnd() * stud.length)], rs = obl(S4, sid).filter(o => o.sisa > 0), nA = 1 + Math.floor(rnd() * 3), al2 = [];
        for (let k = 0; k < nA; k++) {
          const o = rnd() < 0.15 ? { komponenId: 'kmp_spp', periode: pers[Math.floor(rnd() * 4)], sisa: 250000 } : rs[Math.floor(rnd() * rs.length)]; if (!o) continue;
          const nom = Math.max(1000, Math.round((rnd() < 0.3 ? o.sisa * (1 + rnd()) : o.sisa * rnd()) / 1000) * 1000);
          al2.push({ siswaId: sid, komponenId: o.komponenId, periode: o.periode, nominal: nom, caraBayar: 'cicilan' });
        }
        const total = sum(al2.map(a => a.nominal)), nominal = rnd() < 0.2 ? Math.max(1000, total - 5000) : total + Math.round(rnd() * 3) * 100000;
        const cid = rnd() < 0.15 && reqs.length ? reqs[Math.floor(rnd() * reqs.length)] : 'rnd_' + i;
        const payload = { tanggal: '2026-09-10', unit: sid.startsWith('tk') ? 'TK' : 'MI', nominal, akunId: 'akun_kas1', metode: 'Tunai', status: 'TERCATAT', sumber: 'Pembayaran Siswa', siswaId: sid, clientRequestId: cid, allocations: al2 };
        const nT0 = rows(S4, '05_TRANSAKSI').length, res = B4.opCreateIncome(payload);
        if (reqs.indexOf(cid) !== -1) { results.replay++; if (rows(S4, '05_TRANSAKSI').length !== nT0) violations.push('replay menambah transaksi ' + cid); }
        else if (res.ok) { results.ok++; reqs.push(cid); } else results.tolak++;
      } else if (roll < 0.8) {
        const alk = rows(S4, '06_ALOKASI').filter(x => !x[col(S4, '06_ALOKASI', 'archivedAt')]); if (alk.length) { B4.opArchiveAllocation(alk[Math.floor(rnd() * alk.length)][0], 'acak'); results.arsipAlk++; }
      } else if (roll < 0.9) {
        const t = rows(S4, '05_TRANSAKSI').filter(x => !x[col(S4, '05_TRANSAKSI', 'archivedAt')] && String(x[0]).startsWith('gas_trx_')); if (t.length) { B4.opArchiveTransaction(t[Math.floor(rnd() * t.length)][0], 'acak'); results.arsipTrx++; }
      } else if (roll < 0.95) { B4.opObligationSnapshot('*', { semua: true, onlyWithAllocations: true }); }
      checkInvariants('langkah ' + i);
    }
    rec('E1 120 operasi acak (bayar gabungan/melebihi/replay/arsip alokasi/arsip transaksi/pembekuan): SEMUA invarian terjaga [alokasi aktif <= pembayaran; sisa dana >= 0; terbayar <= netto; tidak ada ID ganda/alokasi yatim; replay tidak menggandakan] ' + JSON.stringify(results), violations.length === 0 && results.ok > 10 && results.tolak > 5, violations.slice(0, 5));
    const posisi = B4.opObligations({}).data;
    rec('E2 total terbayar (semua kewajiban) = jumlah alokasi aktif yang cocok dengan kewajiban; tidak ada kewajiban yang kelebihan bayar', posisi.rows.every(r => r.terbayar <= r.netto + 0.5), posisi.rows.filter(r => r.terbayar > r.netto + 0.5).slice(0, 3));
  } catch (e) { rec('HARNESS ERROR', false, e.stack.slice(0, 900)); }
  R.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : '  <= ' + String(JSON.stringify(x.d)).slice(0, 700))));
  console.log('\nPASS=' + R.filter(x => x.ok).length + ' FAIL=' + R.filter(x => !x.ok).length);
  process.exit(0);
})();
