/**
 * SiswaMasterAudit.gs - [P1-IMP D-IMP-8, F7] Audit READ-ONLY data master 01_SISWA sebelum format final jenis kelamin,
 * kelas, dan NISN ditetapkan. Tidak menormalisasi, tidak menulis, tidak mengaudit ulang data historis.
 *
 * opSiswaMasterAudit() -> distribusi nilai (bukan daftar nama siswa):
 *   - jenisKelamin: hitungan per nilai apa adanya (trim) + kosong;
 *   - kelas: hitungan per (unit, kelas);
 *   - nisn / nis: kosong, 10 digit, digit panjang lain, mengandung non-digit, NISN ganda di antara siswa Aktif (id saja);
 *   - tanggalMasuk / tanggalKeluar: kosong, sah YYYY-MM-DD, sel Date, tidak sah; tanggalKeluar < tanggalMasuk (id saja);
 *   - tahunAjaran: hitungan per nilai, tidak berpola YYYY/YYYY+1.
 * Contoh id dibatasi 20 per temuan. Keputusan enum/format tetap pada pengguna (D-IMP-8); hasil ini hanya bahan keputusan.
 * [P1_21 D-IMP-8] Blok `standar` = kesesuaian terhadap standar yang DITETAPKAN (masih read-only, tanpa normalisasi):
 *   - jenisKelamin kanonis 'L' / 'P' (nilai lain = variasi, dengan saran kanonis bila jelas; kosong dihitung terpisah);
 *   - kelas '{TINGKAT}-{ROMBEL}' (mis. 1-A): TINGKAT angka 1-2 digit atau huruf A/B (TK), ROMBEL huruf/angka besar;
 *   - NISN teks; bila terisi wajib tepat 10 digit numerik; sel angka (nol depan hilang) dihitung terpisah; NISN kosong tidak direka;
 *     duplikat di antara SEMUA baris (selain duplikat siswa Aktif yang sudah ada);
 *   - dampak kewajiban: siswa Aktif yang kelasnya tidak memberi tingkat (tingkatFromKelas kosong) -> tarif per kelas tidak
 *     berlaku (tarif unit dipakai); normalisasi kelas dapat MENGUBAH kewajiban, sehingga tidak boleh massal tanpa rencana;
 *     tanggalMasuk/Keluar tidak sah diabaikan oleh enumerasi periode (rentang kewajiban = tahun ajaran penuh).
 *
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_), SchemaGuard.gs (sgModel_, sgObj_, sgDateStr_, sgDateError_, sgErr_),
 *             TransactionEngine.gs (okResult_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function opSiswaMasterAudit() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var m = sgModel_('01_SISWA', ['id', 'nama', 'unit']);
    if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 01_SISWA tidak ditemukan', null);
    var MAX = 20, inc = function (o, k) { o[k] = (o[k] || 0) + 1; };
    var push = function (arr, id) { if (arr.length < MAX) arr.push(id); };
    var out = { totalBaris: m.values.length, kolomAda: {}, jenisKelamin: {}, kelasPerUnit: {}, tahunAjaran: {}, tahunAjaranTidakBerpola: 0,
      nisn: { kosong: 0, digit10: 0, digitLain: {}, nonDigit: 0, contohNonDigit: [], gandaAktif: 0, contohGanda: [] },
      nis: { kosong: 0, terisi: 0, nonDigit: 0 },
      tanggalMasuk: { kosong: 0, sah: 0, selDate: 0, tidakSah: 0, contohTidakSah: [] },
      tanggalKeluar: { kosong: 0, sah: 0, selDate: 0, tidakSah: 0, contohTidakSah: [] },
      keluarSebelumMasuk: 0, contohKeluarSebelumMasuk: [] };
    ['jenisKelamin', 'kelas', 'nis', 'nisn', 'tahunAjaran', 'tanggalMasuk', 'tanggalKeluar', 'status'].forEach(function (h) { out.kolomAda[h] = Object.prototype.hasOwnProperty.call(m.idx, h); });
    var nisnAktif = {};
    var KELAS_RE = /^(\d{1,2}|[AB])-[A-Z0-9]+$/, JK_SARAN = { 'l': 'L', 'lk': 'L', 'laki-laki': 'L', 'laki laki': 'L', 'laki': 'L', 'pria': 'L', 'p': 'P', 'pr': 'P', 'perempuan': 'P', 'wanita': 'P' };
    var std = { jenisKelamin: { kanonis: 0, kosong: 0, variasi: {}, saranKanonis: {} }, kelas: { sesuai: 0, kosong: 0, tidakSesuaiPerUnit: {}, contohTidakSesuai: [] },
      nisn: { valid: 0, kosong: 0, tidakValid: 0, selAngka: 0, contohTidakValid: [], gandaSemua: 0, contohGandaSemua: [] },
      dampakKewajiban: { aktifTanpaTingkat: 0, contohTanpaTingkat: [], unitBertarifKelas: [], aktifTanggalMasukTidakSah: 0, aktifTanggalKeluarTidakSah: 0 } };
    var nisnSemua = {}, tarifPerKelas = {}, tarifTerbaca = false;
    try { var mt = sgModel_('03_TARIF', ['id', 'unit']); if (mt) tarifTerbaca = true; if (mt && mt.idx.kelas !== undefined) mt.values.forEach(function (r) { var o = sgObj_(mt, r); if (opStr_(o.kelas) && opStr_(o.status || 'Aktif') !== 'Nonaktif') tarifPerKelas[opStr_(o.unit)] = true; }); } catch (e) { /* tarif tidak terbaca: dampak dihitung tanpa pembeda unit */ }
    m.values.forEach(function (r) {
      var o = sgObj_(m, r), id = opStr_(o.id), unit = opStr_(o.unit) || '(kosong)';
      inc(out.jenisKelamin, opStr_(o.jenisKelamin) || '(kosong)');
      out.kelasPerUnit[unit] = out.kelasPerUnit[unit] || {}; inc(out.kelasPerUnit[unit], opStr_(o.kelas) || '(kosong)');
      var ta = opStr_(o.tahunAjaran); inc(out.tahunAjaran, ta || '(kosong)');
      var tm = /^(\d{4})\/(\d{4})$/.exec(ta); if (ta && !(tm && Number(tm[2]) === Number(tm[1]) + 1)) out.tahunAjaranTidakBerpola++;
      var nisn = opStr_(o.nisn);
      if (!nisn) out.nisn.kosong++;
      else if (!/^\d+$/.test(nisn)) { out.nisn.nonDigit++; push(out.nisn.contohNonDigit, id); }
      else if (nisn.length === 10) out.nisn.digit10++;
      else inc(out.nisn.digitLain, String(nisn.length));
      if (nisn && (opStr_(o.status) || 'Aktif') === 'Aktif') { if (nisnAktif[nisn]) { out.nisn.gandaAktif++; push(out.nisn.contohGanda, id); } nisnAktif[nisn] = true; }
      var nis = opStr_(o.nis); if (!nis) out.nis.kosong++; else { out.nis.terisi++; if (!/^\d+$/.test(nis)) out.nis.nonDigit++; }
      var d = {};
      ['tanggalMasuk', 'tanggalKeluar'].forEach(function (f) {
        var raw = o[f], s = opStr_(sgDateStr_(raw)), b = out[f];
        if (raw instanceof Date) b.selDate++;
        if (!s) { b.kosong++; return; }
        if (sgDateError_(s)) { b.tidakSah++; push(b.contohTidakSah, id); return; }
        b.sah++; d[f] = s;
      });
      if (d.tanggalMasuk && d.tanggalKeluar && d.tanggalKeluar < d.tanggalMasuk) { out.keluarSebelumMasuk++; push(out.contohKeluarSebelumMasuk, id); }
      // [P1_21 D-IMP-8] kesesuaian standar (read-only)
      var jk = opStr_(o.jenisKelamin).trim();
      if (!jk) std.jenisKelamin.kosong++; else if (jk === 'L' || jk === 'P') std.jenisKelamin.kanonis++;
      else { inc(std.jenisKelamin.variasi, jk); var sj = JK_SARAN[jk.toLowerCase()]; if (sj) std.jenisKelamin.saranKanonis[jk] = sj; }
      var kls = opStr_(o.kelas).trim();
      if (!kls) std.kelas.kosong++; else if (KELAS_RE.test(kls)) std.kelas.sesuai++;
      else { std.kelas.tidakSesuaiPerUnit[unit] = (std.kelas.tidakSesuaiPerUnit[unit] || 0) + 1; push(std.kelas.contohTidakSesuai, id); }
      if (typeof o.nisn === 'number') std.nisn.selAngka++;
      if (!nisn) std.nisn.kosong++; else if (/^\d{10}$/.test(nisn)) std.nisn.valid++; else { std.nisn.tidakValid++; push(std.nisn.contohTidakValid, id); }
      if (nisn) { if (nisnSemua[nisn]) { std.nisn.gandaSemua++; push(std.nisn.contohGandaSemua, id); } nisnSemua[nisn] = true; }
      if ((opStr_(o.status) || 'Aktif') === 'Aktif') {
        if (!tingkatFromKelas(kls) && (!tarifTerbaca || tarifPerKelas[opStr_(o.unit)])) { std.dampakKewajiban.aktifTanpaTingkat++; push(std.dampakKewajiban.contohTanpaTingkat, id); }
        if (opStr_(sgDateStr_(o.tanggalMasuk)) && !d.tanggalMasuk) std.dampakKewajiban.aktifTanggalMasukTidakSah++;
        if (opStr_(sgDateStr_(o.tanggalKeluar)) && !d.tanggalKeluar) std.dampakKewajiban.aktifTanggalKeluarTidakSah++;
      }
    });
    std.dampakKewajiban.unitBertarifKelas = tarifTerbaca ? Object.keys(tarifPerKelas) : null;
    out.standar = std; // [P1_21 D-IMP-8]
    out.catatan = 'Read-only. Tidak ada data yang diubah atau dinormalisasi. Standar D-IMP-8 (P1_21): jenis kelamin L/P, kelas {TINGKAT}-{ROMBEL}, NISN teks 10 digit bila terisi. Normalisasi historis tidak dilakukan; perubahan kelas dapat mengubah kewajiban (lihat standar.dampakKewajiban).';
    return okResult_('Audit master siswa (read-only)', out);
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal mengaudit master siswa'); }
}
