/**
 * KategoriPengeluaranAudit.gs  [P1_20 D]
 * Audit BACA-SAJA kategori pengeluaran historis terhadap master aktif 21_KATEGORI_PENGELUARAN / 22_SUBKATEGORI.
 * Tidak menulis apa pun dan tidak mengubah kategori lama: hasilnya daftar transaksi yang perlu ditinjau manusia.
 * DEPENDENSI: TransactionEngine.gs (expenseKategoriCheck_, katCtx_, SHT_TRANSAKSI, TRX_HEADERS, okResult_),
 *             SchemaGuard.gs (sgModel_, sgObj_, sgErr_), OperationalAPI.gs (opGate_, OP_READ_ROLES_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
function opKategoriPengeluaranAudit() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var ctx = katCtx_(), m = sgModel_(SHT_TRANSAKSI, ['id', 'jenis', 'kategori']);
    if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet ' + SHT_TRANSAKSI + ' tidak ditemukan', null);
    var out = [], diperiksa = 0, perAlasan = {};
    m.values.forEach(function (r) {
      var t = sgObj_(m, r);
      if (String(t.jenis) !== 'PENGELUARAN' || (t.archivedAt !== undefined && t.archivedAt !== '' && t.archivedAt !== null)) return;
      diperiksa++;
      var c = { kategori: t.kategori, subkategori: t.subkategori }, e = expenseKategoriCheck_(c, ctx), alasan = '';
      if (e) alasan = e.code === 'VALIDATION_ERROR' ? 'KATEGORI_KOSONG' : e.code === 'INVALID_CATEGORY' ? 'KATEGORI_TIDAK_ADA_DI_MASTER' : e.code === 'INVALID_SUBCATEGORY' ? 'SUBKATEGORI_TIDAK_VALID' : e.code;
      else if (String(c.kategori) !== String(t.kategori === null || t.kategori === undefined ? '' : t.kategori) || String(c.subkategori) !== String(t.subkategori === null || t.subkategori === undefined ? '' : t.subkategori)) alasan = 'BEDA_PENULISAN';
      if (!alasan) return;
      perAlasan[alasan] = (perAlasan[alasan] || 0) + 1;
      out.push({ id: String(t.id), tanggal: sgDateStr_(t.tanggal), nominal: Number(t.nominal) || 0, kategori: String(t.kategori || ''), subkategori: String(t.subkategori || ''), alasan: alasan, saranKanonik: alasan === 'BEDA_PENULISAN' ? c.kategori + (c.subkategori ? ' / ' + c.subkategori : '') : '' });
    });
    return okResult_('Audit kategori pengeluaran (baca-saja; tidak ada data yang diubah)', { ringkasan: { diperiksa: diperiksa, perluTinjauan: out.length, perAlasan: perAlasan }, perluTinjauan: out });
  } catch (e) { return sgErr_(e, 'READ_FAILED', 'Gagal membaca data untuk audit kategori'); }
}
