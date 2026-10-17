/* Seed "mirip live": komponen & tarif PERSIS seperti yang dibaca dari spreadsheet produksi (read-only) pada 2026-10-14,
   siswa MI kelas 1-6 + TK, dan pembayaran historis yang menempel pada komponen lump (seperti impor 2026-09-28).
   Hanya dipakai di sandbox lokal - TIDAK menyentuh Google Sheets. */
const { makeServer } = require('./srv_env.js');
const LIVE_KOMPONEN = [['kmp_spp', 'SPP', '', 'Bulanan'], ['kmp_daftarulang', 'Daftar Ulang', '', 'Tahunan'], ['kmp_seragam', 'Seragam', '', 'SekaliBayar'], ['kmp_ekskul', 'Ekskul', 'MI', 'Bulanan'],
  ['kmp_catering', 'Catering', '', 'Bulanan'], ['kmp_pendaftaran', 'Pendaftaran', '', 'SekaliBayar'], ['kmp_biayaawal', 'Biaya Awal', '', 'SekaliBayar'], ['kmp_ketering', 'Ketering', 'MI', 'Bulanan', 'Nonaktif', 'kmp_catering'],
  ['kmp_pendidikan', 'Pendidikan', 'MI', 'Tahunan'], ['kmp_komite', 'Komite', '', 'SekaliBayar']];
const LIVE_TARIF = [['imp_tarif_kmp_spp_TK_X_2025_2026', 'kmp_spp', 'TK', '', '2025/2026', 200000, 'Aktif'], ['imp_tarif_kmp_biayaawal_TK_X_2025_2026', 'kmp_biayaawal', 'TK', '', '2025/2026', 2700000, 'Aktif'],
  ['imp_tarif_kmp_daftarulang_TK_X_2025_2026', 'kmp_daftarulang', 'TK', '', '2025/2026', 1400000, 'Aktif'], ['imp_tarif_kmp_spp_TK_X_2026_2027', 'kmp_spp', 'TK', '', '2026/2027', 200000, 'Aktif'],
  ['imp_tarif_kmp_biayaawal_TK_X_2026_2027', 'kmp_biayaawal', 'TK', '', '2026/2027', 3000000, 'Aktif'], ['imp_tarif_kmp_daftarulang_TK_X_2026_2027', 'kmp_daftarulang', 'TK', '', '2026/2027', 1450000, 'Aktif'],
  ['imp_tarif_kmp_biayaawal_MI_1_2025_2026', 'kmp_biayaawal', 'MI', '1', '2025/2026', 4150000, 'Aktif'], ['imp_tarif_kmp_spp_MI_1_2025_2026', 'kmp_spp', 'MI', '1', '2025/2026', 300000, 'Aktif'],
  ['imp_tarif_kmp_catering_MI_X_2025_2026', 'kmp_catering', 'MI', '', '2025/2026', 250000, 'Aktif'], ['imp_tarif_kmp_pendidikan_MI_X_2025_2026', 'kmp_pendidikan', 'MI', '', '2025/2026', 2080000, 'Aktif'],
  ['imp_tarif_kmp_komite_MI_X_2025_2026', 'kmp_komite', 'MI', '', '2025/2026', 120000, 'Aktif'], ['imp_tarif_kmp_biayaawal_MI_1_2026_2027', 'kmp_biayaawal', 'MI', '1', '2026/2027', 4350000, 'Aktif'],
  ['imp_tarif_kmp_spp_MI_1_2026_2027', 'kmp_spp', 'MI', '1', '2026/2027', 350000, 'Aktif'], ['imp_tarif_kmp_spp_MI_2_2026_2027', 'kmp_spp', 'MI', '2', '2026/2027', 300000, 'Aktif'],
  ['imp_tarif_kmp_spp_MI_X_2026_2027', 'kmp_spp', 'MI', '', '2026/2027', 250000, 'Aktif'], ['imp_tarif_kmp_catering_MI_X_2026_2027', 'kmp_catering', 'MI', '', '2026/2027', 250000, 'Aktif'],
  ['imp_tarif_kmp_pendidikan_MI_X_2026_2027', 'kmp_pendidikan', 'MI', '', '2026/2027', 2080000, 'Aktif'], ['imp_tarif_kmp_komite_MI_X_2026_2027', 'kmp_komite', 'MI', '', '2026/2027', 120000, 'Aktif']];

function liveLike(opts) {
  opts = opts || {};
  const srv = makeServer(); const s = srv.sheets, TRXH = srv.sb.__TRXH;
  s['02_KOMPONEN'] = [['id', 'nama', 'unit', 'frekuensi', 'status', 'aliasOf']].concat(LIVE_KOMPONEN.map(r => [r[0], r[1], r[2], r[3], r[4] || '', r[5] || '']));
  s['03_TARIF'] = [['id', 'komponenId', 'unit', 'kelas', 'tahunAjaran', 'nominal', 'status']].concat(LIVE_TARIF.map(r => r.slice()));
  // header LIVE (dibaca read-only 2026-10-14) untuk sheet yang berbeda dari DB_SCHEMA: 09_KOMITMEN (tanpa rabId, urutan lain) dan 10_BUKTI (tanpa fileRef)
  s['09_KOMITMEN'] = [['id', 'tanggal', 'uraian', 'nominal', 'status', 'jatuhTempo']]; s['10_BUKTI'] = [['id', 'kategori', 'transaksiId', 'judul', 'tanggal', 'driveFileId', 'driveFileUrl']];
  const hdr = s['01_SISWA'][0]; s['01_SISWA'] = [hdr];
  const stu = (id, nama, kelas, unit, extra) => { const o = Object.assign({ id, nama, nis: '', nisn: id, kelas, unit, tahunAjaran: '2026/2027', jenisKelamin: 'L', waliId: '', namaWali: '', kontakWali: '', tanggalMasuk: '', tanggalKeluar: '', status: 'Aktif' }, extra || {}); return hdr.map(h => o[h] !== undefined ? o[h] : ''); };
  const names = {}; ['1', '2', '3', '4', '5', '6'].forEach(k => { ['a', 'b'].forEach(x => { const id = 'mi' + k + x; names[id] = 1; s['01_SISWA'].push(stu(id, 'SISWA MI ' + k + x, k + ' Syeikh Kelas ' + k, 'MI')); }); });
  ['a', 'b', 'c'].forEach(x => s['01_SISWA'].push(stu('tk' + x, 'SISWA TK ' + x, 'Madinah', 'TK')));
  s['15_SETTINGS'] = [['key', 'value', 'updatedAt'], ['periodeAktif', 'September 2026', ''], ['tahunAjaranAktif', '2026/2027', '']];
  s['05_TRANSAKSI'] = [TRXH.slice()]; s['06_ALOKASI'] = [s['06_ALOKASI'][0]];
  const trx = (id, nom, siswaId, tgl) => TRXH.map(h => h === 'id' ? id : h === 'jenis' ? 'PENERIMAAN' : h === 'tanggal' ? tgl : h === 'unit' ? (siswaId.startsWith('tk') ? 'TK' : 'MI') : h === 'nominal' ? nom : h === 'akunId' ? 'akun_kas1' : h === 'metode' ? 'Tunai' : h === 'status' ? 'TERALOKASI' : h === 'createdAt' ? '2026-09-28T12:00:00.000Z' : h === 'siswaId' ? siswaId : '');
  const alk = (id, trxId, siswa, komp, per, nom) => [id, trxId, siswa, komp, per, nom, 'historis', '', '2026-09-28T12:42:40.335Z'];
  if (!opts.noHistory) {
    s['05_TRANSAKSI'].push(trx('hist_t1', 250000, 'mi3a', '2026-07-05'), trx('hist_t2', 1800000, 'mi3a', '2026-07-20'), trx('hist_t3', 1500000, 'mi3b', '2026-07-21'), trx('hist_t4', 1600000, 'tka', '2026-07-10'));
    s['06_ALOKASI'].push(alk('hist_a1', 'hist_t1', 'mi3a', 'kmp_spp', 'Juli 2026', 250000), alk('hist_a2', 'hist_t2', 'mi3a', 'kmp_pendidikan', 'Tahun Ajaran 2026/2027', 1800000),
      alk('hist_a3', 'hist_t3', 'mi3b', 'kmp_pendidikan', 'Tahun Ajaran 2026/2027', 1500000), alk('hist_a4', 'hist_t4', 'tka', 'kmp_biayaawal', 'SekaliBayar', 1600000));
  }
  return srv;
}
const clone = o => JSON.parse(JSON.stringify(o));
function obl(srv, siswaId, periode) { const r = srv.sb.opObligations({ siswaId, periode }); if (!r.ok) throw new Error('opObligations: ' + r.code); return r.data.rows; }
function setBlob(srv, name, value) { return srv.sb.opSettingsUpsert([{ key: 'blob.' + name + '.n', value: '1' }, { key: 'blob.' + name + '.0', value: JSON.stringify(value) }]); }
module.exports = { liveLike, clone, obl, setBlob, LIVE_KOMPONEN, LIVE_TARIF };
