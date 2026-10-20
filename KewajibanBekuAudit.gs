/**
 * KewajibanBekuAudit.gs - [P1_22 D-1] Audit BACA-SAJA identitas & perlindungan kewajiban beku (04_KEWAJIBAN).
 *
 * Definisi yang dipakai kode saat ini (bukan definisi baru):
 *   kunci  = siswaId|komponenId|periode;  BEKU = baris 04 dengan tagihanId terisi dan archivedAt kosong;
 *   id kanonis server = 'kw_' + oblHash_(kunci) (oblSnapshotCore_); klien (tagihanSnapshotRow_) memakai uid('tagihan') acak.
 *   Pembayaran: alokasi aktif (06, transaksi tidak diarsip) cocok bila tagihanId = id baris ATAU kunci sama (resolveObligationMatch).
 *
 * opKewajibanBekuAudit() -> daftar pengecualian untuk pemeriksaan manual (tidak ada yang diubah/dihapus):
 *   DUPLIKAT_BEKU                 : >1 baris beku aktif untuk kunci yang sama (nilai netto sama / berbeda);
 *   ID_TIDAK_KANONIS              : id baris beku != kw_<hash kunci> (umumnya dibuat klien) - info;
 *   TAGIHAN_ID_BEDA               : tagihanId != id;
 *   KOMPONEN_TIDAK_ADA            : komponenId tidak ada di 02_KOMPONEN aktif;
 *   KOMPONEN_NAMA_GANDA           : >1 komponen aktif bernama sama (klien mencocokkan kewajiban beku lewat NAMA);
 *   ARSIP_BERPEMBAYARAN           : kunci yang punya pembayaran, baris bekunya diarsip dan tidak ada baris beku aktif
 *                                   (kewajiban kembali dihitung ulang dari tarif saat ini);
 *   ALOKASI_TAGIHAN_TIDAK_DIKENAL : alokasi aktif ber-tagihanId yang tidak menunjuk baris 04 aktif mana pun;
 *   ALOKASI_MULTI_BEKU            : alokasi aktif cocok dengan >1 baris beku aktif.
 * Ringkasan: jumlah beku, beku berpembayaran (yang dilindungi kebijakan D-1), dan putusan konsistensiData.
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_), SchemaGuard.gs (sgRowsChecked_, sgErr_),
 *             ObligationEngine.gs (oblHash_), TransactionEngine.gs (okResult_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function opKewajibanBekuAudit() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var MAX = 200, S = opStr_, out = { ringkasan: { barisBeku: 0, bekuBerpembayaran: 0, kunciBeku: 0, duplikatPasti: 0, duplikatPerluKeputusan: 0 }, pengecualian: [], jumlahPerJenis: {} };
    var add = function (jenis, o) { out.jumlahPerJenis[jenis] = (out.jumlahPerJenis[jenis] || 0) + 1; if (out.pengecualian.length < MAX) out.pengecualian.push(Object.assign({ jenis: jenis }, o)); };
    var kw = sgRowsChecked_('04_KEWAJIBAN'), komp = sgRowsChecked_('02_KOMPONEN').filter(function (k) { return !S(k.archivedAt) && S(k.status || 'Aktif') !== 'Nonaktif'; });
    var trxArch = {}; sgRowsChecked_('05_TRANSAKSI').forEach(function (t) { if (S(t.archivedAt)) trxArch[S(t.id)] = true; });
    var alok = sgRowsChecked_('06_ALOKASI').filter(function (a) { return !S(a.archivedAt) && !trxArch[S(a.transaksiId)]; });
    var key = function (r) { return [S(r.siswaId), S(r.komponenId), S(r.periode)].join('|'); };
    var kompIds = {}, kompNama = {};
    komp.forEach(function (k) { kompIds[S(k.id)] = true; var n = S(k.nama).toLowerCase(); (kompNama[n] = kompNama[n] || []).push(S(k.id)); });
    Object.keys(kompNama).forEach(function (n) { if (kompNama[n].length > 1) add('KOMPONEN_NAMA_GANDA', { nama: n, komponenIds: kompNama[n] }); });
    var aktif = kw.filter(function (r) { return S(r.tagihanId) !== '' && !S(r.archivedAt); }), arsip = kw.filter(function (r) { return S(r.tagihanId) !== '' && S(r.archivedAt); });
    var byKey = {}, ids = {}; kw.filter(function (r) { return !S(r.archivedAt); }).forEach(function (r) { ids[S(r.id)] = true; });
    aktif.forEach(function (r) { (byKey[key(r)] = byKey[key(r)] || []).push(r); });
    var bayarKunci = {}, cocok = {}, alokKunci = {};
    alok.forEach(function (a) {
      var k = key(a); bayarKunci[k] = (bayarKunci[k] || 0) + (Number(a.nominal) || 0);
      (alokKunci[k] = alokKunci[k] || []).push(a);
      var hit = (byKey[k] || []).map(function (r) { return S(r.id); });
      if (S(a.tagihanId) && hit.indexOf(S(a.tagihanId)) === -1) { var t = aktif.filter(function (r) { return S(r.id) === S(a.tagihanId); })[0]; if (t) hit.push(S(t.id)); }
      if (S(a.tagihanId) && !ids[S(a.tagihanId)]) add('ALOKASI_TAGIHAN_TIDAK_DIKENAL', { alokasiId: S(a.id), tagihanId: S(a.tagihanId), kunci: k });
      if (hit.length > 1) add('ALOKASI_MULTI_BEKU', { alokasiId: S(a.id), kunci: k, barisBeku: hit });
      cocok[S(a.id)] = hit;
    });
    out.ringkasan.barisBeku = aktif.length; out.ringkasan.kunciBeku = Object.keys(byKey).length;
    Object.keys(byKey).forEach(function (k) {
      var rs = byKey[k], bayar = bayarKunci[k] || 0;
      if (bayar > 0) out.ringkasan.bekuBerpembayaran += rs.length;
      if (rs.length > 1) {
        var netto = rs.map(function (r) { return Number(r.netto) || 0; });
        var kl = kwDupKlasifikasi_(k, rs, alokKunci[k] || [], bayar);
        out.ringkasan[kl.klasifikasi === 'DUPLIKAT_PASTI' ? 'duplikatPasti' : 'duplikatPerluKeputusan']++;
        add('DUPLIKAT_BEKU', Object.assign({ kunci: k, ids: rs.map(function (r) { return S(r.id); }), netto: netto, nettoBerbeda: netto.some(function (n) { return n !== netto[0]; }), terbayar: bayar }, kl));
      }
      rs.forEach(function (r) {
        var kan = 'kw_' + oblHash_(k);
        if (S(r.id) !== kan) add('ID_TIDAK_KANONIS', { id: S(r.id), kunci: k, idKanonis: kan });
        if (S(r.tagihanId) !== S(r.id)) add('TAGIHAN_ID_BEDA', { id: S(r.id), tagihanId: S(r.tagihanId) });
        if (!kompIds[S(r.komponenId)]) add('KOMPONEN_TIDAK_ADA', { id: S(r.id), komponenId: S(r.komponenId) });
      });
    });
    var arsipKunci = {}; arsip.forEach(function (r) { (arsipKunci[key(r)] = arsipKunci[key(r)] || []).push(S(r.id)); });
    Object.keys(arsipKunci).forEach(function (k) { if (!byKey[k] && (bayarKunci[k] || 0) > 0) add('ARSIP_BERPEMBAYARAN', { kunci: k, idsArsip: arsipKunci[k], terbayar: bayarKunci[k] }); });
    var struktural = ['DUPLIKAT_BEKU', 'TAGIHAN_ID_BEDA', 'KOMPONEN_TIDAK_ADA', 'KOMPONEN_NAMA_GANDA', 'ARSIP_BERPEMBAYARAN', 'ALOKASI_TAGIHAN_TIDAK_DIKENAL', 'ALOKASI_MULTI_BEKU'];
    out.konsistensiData = struktural.some(function (j) { return out.jumlahPerJenis[j]; }) ? 'TIDAK_KONSISTEN' : 'KONSISTEN';
    out.catatan = 'Baca-saja. Tidak ada baris yang diubah, diarsip, digabung, atau dihapus. ID_TIDAK_KANONIS bersifat info (id klien acak). Klasifikasi DUPLIKAT_BEKU (DUPLIKAT_PASTI / PERLU_KEPUTUSAN_MANUAL) hanya bahan tinjauan; tidak ada tindakan otomatis; jalur koreksi D-1 ditahan sampai hasil audit data ditinjau.';
    out.computedAt = new Date().toISOString();
    return okResult_('Audit kewajiban beku (read-only)', out);
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal mengaudit kewajiban beku'); }
}
/* [P1_24 D-1] Klasifikasi BACA-SAJA satu kunci dengan >1 baris beku aktif (bahan tinjauan manual, bukan tindakan):
     barisTerpilih  = baris yang dipakai perhitungan saat ini (aturan kewajibanSatuBaris: id berawalan kw_ dulu, lalu id terkecil);
     alokasi        = alokasi aktif kunci ini, dipisah: menunjuk baris lewat tagihanId vs hanya cocok lewat kunci;
     DUPLIKAT_PASTI = nilai beku identik (bruto/potongan/netto/tarifSatuan/jumlahHari) DAN tidak ada alokasi yang menunjuk baris
                      selain barisTerpilih DAN terbayar <= netto barisTerpilih;
     selain itu PERLU_KEPUTUSAN_MANUAL dengan alasan: NILAI_BERBEDA, ALOKASI_KE_BARIS_TIDAK_TERPILIH, ALOKASI_KE_BEBERAPA_BARIS,
                      TERBAYAR_MELEBIHI_NETTO_TERPILIH. */
function kwDupKlasifikasi_(kunci, rs, aloks, bayar) {
  var S = opStr_, kw = function (id) { return S(id).indexOf('kw_') === 0 ? 0 : 1; };
  var urut = rs.slice().sort(function (a, b) { return (kw(a.id) - kw(b.id)) || (S(a.id) < S(b.id) ? -1 : S(a.id) > S(b.id) ? 1 : 0); });
  var pilih = S(urut[0].id), idKan = 'kw_' + oblHash_(kunci), ids = rs.map(function (r) { return S(r.id); });
  var nilai = function (r) { return [Number(r.bruto) || 0, S(r.potongan) === '[]' ? '' : S(r.potongan), Number(r.netto) || 0, S(r.tarifSatuan), S(r.jumlahHari)].join('|'); };
  var nilaiSama = rs.every(function (r) { return nilai(r) === nilai(rs[0]); });
  var keBaris = {}, lewatKunci = [];
  aloks.forEach(function (a) { var t = S(a.tagihanId); if (t && ids.indexOf(t) !== -1) (keBaris[t] = keBaris[t] || []).push(S(a.id)); else lewatKunci.push(S(a.id)); });
  var barisBeralokasi = Object.keys(keBaris), nettoPilih = Number(urut[0].netto) || 0, alasan = [];
  if (!nilaiSama) alasan.push('NILAI_BERBEDA');
  if (barisBeralokasi.some(function (id) { return id !== pilih; })) alasan.push('ALOKASI_KE_BARIS_TIDAK_TERPILIH');
  if (barisBeralokasi.length > 1) alasan.push('ALOKASI_KE_BEBERAPA_BARIS');
  if (bayar > nettoPilih + 0.5) alasan.push('TERBAYAR_MELEBIHI_NETTO_TERPILIH');
  return { klasifikasi: alasan.length ? 'PERLU_KEPUTUSAN_MANUAL' : 'DUPLIKAT_PASTI', alasanKlasifikasi: alasan, barisTerpilih: pilih, idKanonis: idKan, idKanonisAda: ids.indexOf(idKan) !== -1,
    baris: urut.map(function (r) { return { id: S(r.id), kanonis: S(r.id) === idKan, bruto: Number(r.bruto) || 0, netto: Number(r.netto) || 0, tarifSatuan: S(r.tarifSatuan), jumlahHari: S(r.jumlahHari), alokasiTagihanId: keBaris[S(r.id)] || [] }; }),
    alokasiLewatKunciSaja: lewatKunci, nettoTerpilih: nettoPilih, selisihTerbayarTerhadapTerpilih: bayar - nettoPilih, tindakanOtomatis: 'TIDAK_ADA' };
}
