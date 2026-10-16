/* RENCANA TARIF 2026/2027 - kode IDENTIK dipakai di klien (Bendahara_V2.html) dan server (TarifPlan.gs).
   Murni: tidak menyentuh DOM, Store, Sheets. Sumber nominal (tidak ada angka yang dikarang):
   [XLSX] D:\biaya TK MI\RINCIAN BIAYA TAHUNAN MI 2026-2027.xlsx (sheet KELAS 1, KELAS 2, KELAS 3 - 5, KELAS 6)
   [PDF]  D:\biaya TK MI\Rincian Biaya Masuk MI TA 2026-2027.pdf
   [DOCX] D:\biaya TK MI\BIAYA Masuk, Daftar Ulang, SPP TK 2026-2027.docx
   [ATURAN] aturan bisnis dari Bendahara (SPP MI per kelas, katering MI per hari terjadwal).
   Rencana ini HANYA data + perbandingan (dry-run). Penulisan ke Sheets dilakukan terpisah, eksplisit, dengan konfirmasi. */
var TP_TA_ = '2026/2027';
function tpKelasList_() { return ['1', '2', '3', '4', '5', '6']; }
function tpKey_(komponenId, unit, kelas, ta) { return [komponenId, unit || '', kelas || '', ta || ''].join('|'); }
function tpSumValues_(arr) { return arr.reduce(function (s, n) { return s + Number(n || 0); }, 0); }

/* Biaya tahunan MI per kelas [XLSX]. null = komponen tidak ada pada kelas tsb di sumber. */
function tpMiAnnualDef_() {
  var all = function (n) { return { '1': n, '2': n, '3': n, '4': n, '5': n, '6': n }; };
  return [
    ['ekskul', 'Ekskul (Tahunan)', all(100000), 'XLSX'],
    ['talents', 'Talents Camp (Tahunan)', { '1': 100000, '2': 100000, '3': 50000, '4': 50000, '5': 50000, '6': 50000 }, 'XLSX'],
    ['phbi', 'PHBI (Tahunan)', { '1': 70000, '2': 70000, '3': 50000, '4': 50000, '5': 50000, '6': 50000 }, 'XLSX'],
    ['ikhtitam', "Ikhtitam Qur'an (Tahunan)", { '1': 200000, '2': 200000, '3': 70000, '4': 70000, '5': 70000, '6': 70000 }, 'XLSX'],
    ['tahfizh', 'Tahfizh Camp (Tahunan)', all(120000), 'XLSX'],
    ['fieldtrip', 'Field Trip (Tahunan)', { '1': 200000, '2': 200000, '3': 100000, '4': 100000, '5': 100000, '6': 100000 }, 'XLSX'],
    ['atk', 'ATK, Portofolio dan Ujian (Tahunan)', { '1': 250000, '2': 250000, '3': 100000, '4': 100000, '5': 100000, '6': 100000 }, 'XLSX'],
    ['buku', 'Buku Paket (Tahunan)', { '1': 563000, '2': 563000, '3': 744500, '4': 744500, '5': 744500, '6': 744500 }, 'XLSX'],
    ['lks', 'LKS Pjok dan Seni Budaya (Tahunan)', all(50000), 'XLSX'],
    ['magang', 'Magang (Tahunan)', { '1': 100000, '2': 100000, '3': 100000, '4': 100000, '5': 100000 }, 'XLSX'],
    // Komite kelas 1: TIDAK ada di sheet KELAS 1 (XLSX) tetapi tercantum terpisah di PDF biaya masuk (Biaya Tahunan = Pendidikan 2.080.000 + Komite 120.000).
    ['komite', 'Komite (Tahunan)', { '1': 120000, '2': 120000, '3': 120000, '4': 120000, '5': 120000, '6': 120000 }, 'XLSX', { '1': 'PDF' }],
    ['sarpras', 'Pemeliharaan Sarpras (Tahunan)', { '1': 327000, '2': 327000, '3': 195500, '4': 195500, '5': 195500, '6': 195500 }, 'XLSX']
  ];
}
/* Total per kelas yang TERTULIS di sumber (rumus SUM pada sheet XLSX) - dipakai untuk mendeteksi selisih, bukan untuk koreksi. */
function tpMiAnnualDeclaredTotals_() { return { '1': 2080000, '2': 2200000, '3': 1800000, '4': 1800000, '5': 1800000, '6': 1700000 }; }

/* Biaya masuk / daftar ulang [PDF][DOCX]: [kunci, nama, nominal]. */
function tpEntryDef_() {
  return {
    miBaru: { unit: 'MI', sasaran: 'BARU', frekuensi: 'SekaliBayar', kelas: '1', sumber: 'PDF', suffix: ' (MI Baru)', declared: 4350000, items: [
      ['formulir', 'Formulir Pendaftaran', 200000], ['infaq', 'Infaq Pembangunan Madrasah', 1500000], ['seragam', 'Seragam 6 Stel, 2 Peci, 6 Jilbab', 1100000],
      ['talentsmapping', 'Talents Mapping', 500000], ['kursimeja', 'Kursi dan Meja', 750000], ['bukuharian', 'Buku Kegiatan Harian 6 Buku dan 1 Al-Quran', 300000]] },
    tkBaru: { unit: 'TK', sasaran: 'BARU', frekuensi: 'SekaliBayar', kelas: '', sumber: 'DOCX', suffix: ' (TK Baru)', declared: 3000000, items: [
      ['pembangunan', 'Uang Pembangunan', 1200000], ['formulir', 'Formulir Pendaftaran', 150000], ['peralatan', 'Peralatan', 350000], ['fieldtrip', 'Field Trip', 200000],
      ['seragam', 'Seragam 3 Stel', 500000], ['sarpras', 'Pemeliharaan Sarpras', 450000], ['komite', 'Komite', 150000]] },
    tkDu: { unit: 'TK', sasaran: 'DAFTAR_ULANG', frekuensi: 'Tahunan', kelas: '', sumber: 'DOCX', suffix: ' (TK Daftar Ulang)', declared: 1450000, items: [
      ['formulir', 'Formulir Pendaftaran', 150000], ['peralatan', 'Peralatan', 350000], ['fieldtrip', 'Field Trip', 200000], ['sarpras', 'Pemeliharaan Sarpras', 600000], ['komite', 'Komite', 150000]] }
  };
}

function tpTarifId_(komponenId, unit, kelas) { return 'tarif_' + komponenId.replace(/^kmp_/, '') + '_' + (unit || 'X') + '_' + (kelas || 'X') + '_2026_2027'; }

function tpSpec_() {
  var komponen = [], tarif = [], totals = [], ta = TP_TA_;
  var addK = function (id, nama, unit, frek, sasaran, basis, menggantikan) { komponen.push({ id: id, nama: nama, unit: unit, frekuensi: frek, status: 'Aktif', sasaran: sasaran || '', basisTarif: basis || '', menggantikan: menggantikan || '' }); };
  var addT = function (komponenId, unit, kelas, nominal, sumber) { tarif.push({ id: tpTarifId_(komponenId, unit, kelas), komponenId: komponenId, unit: unit, kelas: kelas, tahunAjaran: ta, nominal: nominal, status: 'Aktif', sumber: sumber }); };

  // 1. SPP (validasi terhadap data live; ditambah hanya bila belum ada) [ATURAN]
  addT('kmp_spp', 'MI', '1', 350000, 'ATURAN'); addT('kmp_spp', 'MI', '2', 300000, 'ATURAN'); addT('kmp_spp', 'MI', '', 250000, 'ATURAN'); addT('kmp_spp', 'TK', '', 200000, 'DOCX');

  // 2. Katering MI per hari terjadwal [ATURAN]
  addK('kmp_katering_harian', 'Katering MI (per hari terjadwal)', 'MI', 'Bulanan', '', 'PER_HARI_TERJADWAL', 'kmp_catering');
  ['1', '2', '3', '4'].forEach(function (k) { addT('kmp_katering_harian', 'MI', k, 13000, 'ATURAN'); });
  ['5', '6'].forEach(function (k) { addT('kmp_katering_harian', 'MI', k, 11000, 'ATURAN'); });

  // 3. Biaya tahunan MI per kelas [XLSX] (+ Komite kelas 1 dari PDF)
  var perKelas = {}; tpKelasList_().forEach(function (k) { perKelas[k] = { xlsx: 0, semua: 0 }; });
  tpMiAnnualDef_().forEach(function (d) {
    var id = 'kmp_thn_' + d[0]; addK(id, d[1], 'MI', 'Tahunan', '', '', d[0] === 'komite' ? 'kmp_pendidikan,kmp_komite' : 'kmp_pendidikan');
    tpKelasList_().forEach(function (k) {
      if (d[2][k] === undefined || d[2][k] === null) return;
      var src = (d[4] && d[4][k]) || d[3];
      addT(id, 'MI', k, d[2][k], src);
      perKelas[k].semua += d[2][k]; if (src === 'XLSX') perKelas[k].xlsx += d[2][k];
    });
  });
  var decl = tpMiAnnualDeclaredTotals_();
  tpKelasList_().forEach(function (k) {
    totals.push({ label: 'Biaya tahunan MI kelas ' + k + ' (jumlah komponen XLSX vs total di sheet)', expected: decl[k], actual: perKelas[k].xlsx });
  });
  totals.push({ label: 'Biaya tahunan MI kelas 1 termasuk Komite (jumlah komponen vs "Biaya Tahunan" di PDF 2.200.000)', expected: 2200000, actual: perKelas['1'].semua });

  // 4. Biaya masuk MI / TK dan daftar ulang TK
  var E = tpEntryDef_();
  var entrySum = {};
  Object.keys(E).forEach(function (g) {
    var e = E[g], sum = 0;
    e.items.forEach(function (it) {
      var id = 'kmp_' + (g === 'miBaru' ? 'masuk_mi_' : g === 'tkBaru' ? 'masuk_tk_' : 'du_tk_') + it[0];
      addK(id, it[1] + e.suffix, e.unit, e.frekuensi, e.sasaran, '', g === 'tkDu' ? 'kmp_daftarulang' : 'kmp_biayaawal');
      addT(id, e.unit, e.kelas, it[2], e.sumber); sum += it[2];
    });
    entrySum[g] = sum;
    totals.push({ label: 'Biaya ' + (g === 'miBaru' ? 'awal MI baru' : g === 'tkBaru' ? 'awal TK baru' : 'daftar ulang TK') + ' (jumlah komponen vs jumlah di sumber)', expected: e.declared, actual: sum });
  });
  // total keseluruhan di dokumen sumber = awal + bulanan (SPP + katering flat 250.000 yang tertulis di PDF) + tahunan
  totals.push({ label: 'Biaya masuk MI: awal + bulanan (SPP 350.000 + katering 250.000 di PDF) + tahunan kelas 1 = total di PDF', expected: 7150000, actual: entrySum.miBaru + 350000 + 250000 + perKelas['1'].semua });
  totals.push({ label: 'Biaya masuk TK baru: awal + SPP 200.000 = total di DOCX', expected: 3200000, actual: entrySum.tkBaru + 200000 });
  totals.push({ label: 'Daftar ulang TK B: awal + SPP 200.000 = total di DOCX', expected: 1650000, actual: entrySum.tkDu + 200000 });

  // 5. Tarif lump-sum 2026/2027 yang digantikan rincian di atas (hanya dinonaktifkan, tidak dihapus)
  var supersede = [
    { komponenId: 'kmp_biayaawal', unit: 'TK', kelas: '', alasan: 'Digantikan 7 komponen "Biaya Awal TK Baru" (jumlah sama 3.000.000)' },
    { komponenId: 'kmp_daftarulang', unit: 'TK', kelas: '', alasan: 'Digantikan 5 komponen "TK Daftar Ulang" (jumlah sama 1.450.000)' },
    { komponenId: 'kmp_biayaawal', unit: 'MI', kelas: '1', alasan: 'Digantikan 6 komponen "Biaya Awal MI Baru" (jumlah sama 4.350.000)' },
    { komponenId: 'kmp_pendidikan', unit: 'MI', kelas: '', alasan: 'Tarif tunggal 2.080.000 untuk SEMUA kelas MI tidak sesuai sumber; digantikan rincian tahunan per kelas' },
    { komponenId: 'kmp_komite', unit: 'MI', kelas: '', alasan: 'Komite MI kini bagian rincian tahunan per kelas (hindari tagihan ganda)' },
    { komponenId: 'kmp_catering', unit: 'MI', kelas: '', alasan: 'Katering flat 250.000/bulan digantikan tarif per hari terjadwal (13.000 / 11.000)' }
  ];

  var confirm = [
    { kode: 'K1_KOMITE', teks: 'Kelas 1: sheet XLSX tidak memuat Komite, tetapi PDF biaya masuk mencantumkan Komite 120.000 terpisah (Pendidikan 2.080.000 + Komite 120.000 = Biaya Tahunan 2.200.000). Komite kelas 1 DITAMBAHKAN dari PDF - mohon konfirmasi.' },
    { kode: 'K6_MAGANG', teks: 'Kelas 6: sheet XLSX tidak memuat komponen Magang (kelas 1-5 memuat 100.000). Tidak ditagihkan; mohon konfirmasi bahwa ini memang benar.' },
    { kode: 'BUKU_ISI', teks: 'Isi Buku Paket berbeda antar kelas (kelas 1-2: ... PAI, B. Inggris; kelas 3-6: ... Ipas, B. Inggris) dengan nominal berbeda; dicatat sebagai satu komponen "Buku Paket (Tahunan)".' },
    { kode: 'KATERING_FLAT', teks: 'PDF biaya masuk mencantumkan Catering 250.000/bulan, sedangkan aturan Bendahara = per hari terjadwal (13.000 kelas 1-4; 11.000 kelas 5-6). Aturan per hari dipakai; jumlah hari terjadwal tiap bulan WAJIB diisi (tidak ada nilai bawaan).' },
    { kode: 'NOMOR_PDF', teks: 'PDF biaya masuk MI: nomor urut melompat (Biaya Awal 1,2,3,5,6,7; Biaya Tahunan 1,3). Jumlah per bagian tetap cocok dengan total; mohon pastikan tidak ada baris yang terlewat.' },
    { kode: 'MI_PINDAHAN', teks: 'Biaya masuk MI di sumber tidak menyebut kelas. Mengikuti data live, tarif hanya untuk kelas 1; pendaftar baru kelas 2-6 (pindahan) TIDAK ditagih sampai tarifnya ditentukan.' },
    { kode: 'DISKON_PEMBANGUNAN', teks: 'Diskon pembangunan 50% untuk 50 pendaftar pertama s/d 31 Desember 2025 adalah aturan HISTORIS: tidak diterapkan otomatis pada TA 2026/2027 (tidak ada kebijakan keringanan yang dibuat).' },
    { kode: 'KLASIFIKASI', teks: 'Biaya masuk (BARU) dan daftar ulang TK hanya ditagih untuk siswa yang sudah DIKLASIFIKASI per tahun ajaran (BARU / DAFTAR_ULANG). Tidak ada klasifikasi dugaan dari tanggal masuk.' },
    { kode: 'LUMP_K3_K6', teks: 'Data live saat ini menagih tarif "Pendidikan" tunggal 2.080.000 + Komite 120.000 ke SEMUA kelas MI; sumber: kelas 3-5 = 1.800.000, kelas 6 = 1.700.000. Lihat laporan dampak sebelum diterapkan.' },
    { kode: 'CATATAN_JULI', teks: 'Catatan sumber XLSX: "Biaya pendidikan belum termasuk biaya SPP dan Catering Juli" - SPP/katering Juli tetap kewajiban bulanan terpisah.' }
  ];
  return { ta: ta, komponen: komponen, tarif: tarif, totals: totals, supersede: supersede, confirm: confirm };
}

function tpTotalsCheck_(spec) {
  return spec.totals.map(function (t) { return { label: t.label, expected: t.expected, actual: t.actual, selisih: t.actual - t.expected, ok: t.actual === t.expected }; });
}

/* Pilih tarif aktif paling spesifik - ATURAN SAMA dengan tarifFor() di aplikasi (kelas > unit > tahunAjaran). */
function tpPickTarif_(tarifList, komponenId, unit, kelas, ta) {
  var rows = tarifList.filter(function (t) { return t.komponenId === komponenId && t.status !== 'Nonaktif' && (!t.unit || t.unit === unit) && (!t.kelas || t.kelas === kelas) && (!t.tahunAjaran || t.tahunAjaran === ta); });
  if (!rows.length) return null;
  rows.sort(function (a, b) { return ((b.kelas ? 4 : 0) + (b.unit ? 2 : 0) + (b.tahunAjaran ? 1 : 0)) - ((a.kelas ? 4 : 0) + (a.unit ? 2 : 0) + (a.tahunAjaran ? 1 : 0)); });
  return rows[0];
}

/* DRY-RUN: bandingkan spesifikasi dengan komponen/tarif yang SUDAH ADA. Tidak menulis apa pun. */
function tpCompute_(komponenExisting, tarifExisting, spec) {
  spec = spec || tpSpec_();
  var byId = {}, byName = {};
  komponenExisting.forEach(function (k) { byId[String(k.id)] = k; byName[String(k.nama || '').toLowerCase().trim() + '|' + String(k.unit || '').toLowerCase().trim()] = k; });
  var plan = { komponenAdd: [], komponenOk: [], komponenKonflik: [], tarifAdd: [], tarifOk: [], tarifKonflik: [], tarifPerluAktivasi: [], tarifDeactivate: [], totals: tpTotalsCheck_(spec), confirm: spec.confirm.slice() };
  var blocked = {};
  spec.komponen.forEach(function (k) {
    var ex = byId[k.id];
    if (ex) {
      var same = String(ex.nama) === k.nama && String(ex.unit || '') === k.unit && String(ex.frekuensi) === k.frekuensi && String(ex.sasaran || '') === k.sasaran && String(ex.basisTarif || '') === k.basisTarif && String(ex.menggantikan || '') === k.menggantikan;
      if (same) plan.komponenOk.push(k.id); else { plan.komponenKonflik.push({ id: k.id, alasan: 'ID sudah ada dengan isi berbeda', ada: { nama: ex.nama, unit: ex.unit, frekuensi: ex.frekuensi, sasaran: ex.sasaran || '', basisTarif: ex.basisTarif || '', menggantikan: ex.menggantikan || '' }, rencana: k }); blocked[k.id] = true; }
      return;
    }
    var nm = byName[k.nama.toLowerCase().trim() + '|' + k.unit.toLowerCase().trim()];
    if (nm) { plan.komponenKonflik.push({ id: k.id, alasan: 'Nama+unit sudah dipakai komponen ' + nm.id, ada: { id: nm.id, nama: nm.nama }, rencana: k }); blocked[k.id] = true; return; }
    plan.komponenAdd.push(k);
  });
  var tarifKomponenOk = function (t) { return !blocked[t.komponenId]; };
  spec.tarif.forEach(function (t) {
    if (!tarifKomponenOk(t)) { plan.tarifKonflik.push({ id: t.id, alasan: 'Komponen konflik - tarif tidak ditambahkan', rencana: t }); return; }
    var same = tarifExisting.filter(function (e) { return tpKey_(e.komponenId, e.unit, e.kelas, e.tahunAjaran) === tpKey_(t.komponenId, t.unit, t.kelas, t.tahunAjaran); });
    if (!same.length) { plan.tarifAdd.push(t); return; }
    var aktif = same.filter(function (e) { return e.status !== 'Nonaktif'; });
    if (!aktif.length) { plan.tarifPerluAktivasi.push({ id: same[0].id, alasan: 'Tarif ada tetapi Nonaktif; tidak diaktifkan otomatis', ada: same[0].nominal, rencana: t }); return; }
    if (Number(aktif[0].nominal) === Number(t.nominal)) plan.tarifOk.push(t.id);
    else plan.tarifKonflik.push({ id: aktif[0].id, alasan: 'Nominal berbeda dari sumber (TIDAK ditimpa)', ada: Number(aktif[0].nominal), rencana: t });
  });
  spec.supersede.forEach(function (s) {
    tarifExisting.forEach(function (e) {
      if (e.komponenId === s.komponenId && String(e.unit || '') === s.unit && String(e.kelas || '') === s.kelas && String(e.tahunAjaran || '') === spec.ta && e.status !== 'Nonaktif') {
        plan.tarifDeactivate.push({ id: e.id, komponenId: e.komponenId, unit: e.unit, kelas: e.kelas, nominal: Number(e.nominal), alasan: s.alasan });
      }
    });
  });
  plan.ringkasan = { komponenAdd: plan.komponenAdd.length, komponenOk: plan.komponenOk.length, komponenKonflik: plan.komponenKonflik.length, tarifAdd: plan.tarifAdd.length, tarifOk: plan.tarifOk.length,
    tarifKonflik: plan.tarifKonflik.length, tarifPerluAktivasi: plan.tarifPerluAktivasi.length, tarifDeactivate: plan.tarifDeactivate.length, totalsSemuaCocok: plan.totals.every(function (t) { return t.ok; }) };
  return plan;
}

/* Laporan dampak sebelum penerapan: siapa/berapa yang terpengaruh. Murni dan hanya-baca. */
function tpImpact_(ctx, plan, spec) {
  spec = spec || tpSpec_();
  var students = (ctx.students || []).filter(function (s) { return (s.status || 'Aktif') === 'Aktif'; });
  var tarif = ctx.tarif || [], alokasi = (ctx.alokasi || []).filter(function (a) { return !a.archivedAt; });
  var tingkat = function (kelas) { var m = String(kelas || '').trim().match(/^(\d+)/); return m ? m[1] : ''; };
  var out = { alokasiTerdampak: [], tahunanMi: [], lumpDitagihKe: [] };
  // 1) alokasi yang menunjuk komponen lump yang akan dinonaktifkan (periode TA ini)
  var byStudent = {}; students.forEach(function (s) { byStudent[s.id] = s; });
  var allStud = {}; (ctx.students || []).forEach(function (s) { allStud[s.id] = s; });
  var supIds = {}; spec.supersede.forEach(function (s) { supIds[s.komponenId + '|' + s.unit] = s; });
  var agg = {};
  alokasi.forEach(function (a) {
    var s = allStud[a.siswaId]; if (!s) return;
    var sup = supIds[a.komponenId + '|' + s.unit]; if (!sup) return;
    var key = a.komponenId + '|' + s.unit;
    agg[key] = agg[key] || { komponenId: a.komponenId, unit: s.unit, jumlahAlokasi: 0, nominal: 0, siswa: {} };
    agg[key].jumlahAlokasi++; agg[key].nominal += Number(a.nominal || 0); agg[key].siswa[a.siswaId] = 1;
  });
  Object.keys(agg).forEach(function (k) { var r = agg[k]; out.alokasiTerdampak.push({ komponenId: r.komponenId, unit: r.unit, jumlahAlokasi: r.jumlahAlokasi, nominal: r.nominal, jumlahSiswa: Object.keys(r.siswa).length }); });
  // 2) selisih tagihan tahunan MI: tarif lump aktif sekarang vs rincian sumber, per kelas
  var annual = {}; tpKelasList_().forEach(function (k) { annual[k] = 0; });
  spec.tarif.forEach(function (t) { if (t.komponenId.indexOf('kmp_thn_') === 0 && annual[t.kelas] !== undefined) annual[t.kelas] += t.nominal; });
  tpKelasList_().forEach(function (k) {
    var n = students.filter(function (s) { return s.unit === 'MI' && tingkat(s.kelas) === k; }).length;
    var pend = tpPickTarif_(tarif, 'kmp_pendidikan', 'MI', k, spec.ta), kom = tpPickTarif_(tarif, 'kmp_komite', 'MI', k, spec.ta);
    var lama = (pend ? Number(pend.nominal) : 0) + (kom ? Number(kom.nominal) : 0);
    out.tahunanMi.push({ kelas: k, siswa: n, lamaPerSiswa: lama, baruPerSiswa: annual[k], selisihPerSiswa: annual[k] - lama, selisihTotal: (annual[k] - lama) * n });
  });
  // 3) lump masuk/daftar ulang yang sekarang ditagih ke SEMUA siswa unit (akan dibatasi ke siswa terklasifikasi)
  [['kmp_biayaawal', 'TK', ''], ['kmp_daftarulang', 'TK', ''], ['kmp_biayaawal', 'MI', '1']].forEach(function (x) {
    var n = students.filter(function (s) { return s.unit === x[1] && (!x[2] || tingkat(s.kelas) === x[2]); }).length;
    out.lumpDitagihKe.push({ komponenId: x[0], unit: x[1], kelas: x[2], jumlahSiswaYangKiniDitagih: n });
  });
  return out;
}
