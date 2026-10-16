/**
 * TarifPlan.gs  -  *** DIHASILKAN OTOMATIS dari _tarif_pure.js + _tarif_ops.gs.tpl ***
 * Rencana tarif TA 2026/2027 (komponen, tarif, jumlah komponen vs total sumber, laporan dampak).
 * Bagian murni (tpSpec_, tpCompute_, tpImpact_ ...) = SALINAN IDENTIK kode klien (Bendahara_V2.html).
 * Fungsi publik:
 *   opTarifPlan()          - hanya baca (dry-run + laporan dampak). TIDAK menulis apa pun.
 *   opTarifApply(confirm)  - menulis; wajib token 'TERAPKAN_RENCANA_TARIF'. Langkah: bekukan kewajiban berpembayaran ->
 *                            tambah komponen -> tambah tarif -> NONAKTIFKAN (bukan hapus) tarif lump yang digantikan.
 *                            Setiap langkah idempoten dan memakai lock sendiri; dapat dijalankan ulang bila terhenti.
 * STATUS: diverifikasi di sandbox lokal. BELUM dijalankan di Apps Script / Sheets sungguhan.
 */
/*__TARIF_PURE__*/

var TP_CONFIRM_ = 'TERAPKAN_RENCANA_TARIF';
function tpS_(v) { return (v === null || v === undefined) ? '' : String(v); }
function tpReadSheet_(name) {
  var m = opSheetModel_(name);
  return m ? m.rows.map(function (r) { return opJsonSafe_(opRowObj_(m.live, r)); }).filter(function (o) { return !o.archivedAt; }) : [];
}
function tpContext_() {
  return {
    komponen: tpReadSheet_('02_KOMPONEN').map(function (r) { return Object.assign({}, r, { id: tpS_(r.id), nama: tpS_(r.nama), unit: tpS_(r.unit), frekuensi: tpS_(r.frekuensi), status: tpS_(r.status), sasaran: tpS_(r.sasaran), basisTarif: tpS_(r.basisTarif), menggantikan: tpS_(r.menggantikan) }); }),
    tarif: tpReadSheet_('03_TARIF').map(function (r) { return Object.assign({}, r, { id: tpS_(r.id), komponenId: tpS_(r.komponenId), unit: tpS_(r.unit), kelas: tpS_(r.kelas), tahunAjaran: tpS_(r.tahunAjaran), nominal: Number(r.nominal) || 0, status: tpS_(r.status) }); }),
    students: tpReadSheet_('01_SISWA').map(function (r) { return Object.assign({}, r, { id: tpS_(r.id), nama: tpS_(r.nama), unit: tpS_(r.unit), kelas: tpS_(r.kelas), status: tpS_(r.status) }); }),
    alokasi: tpReadSheet_('06_ALOKASI').map(function (r) { return Object.assign({}, r, { siswaId: tpS_(r.siswaId), komponenId: tpS_(r.komponenId), periode: tpS_(r.periode), nominal: Number(r.nominal) || 0 }); })
  };
}
function tpSchemaStatus_() {
  var need = { '02_KOMPONEN': ['sasaran', 'basisTarif', 'menggantikan'], '03_TARIF': ['status'], '04_KEWAJIBAN': ['jatuhTempo', 'tahunAjaran', 'kelas', 'unit', 'tarifId', 'tarifSatuan', 'jumlahHari', 'archivedAt'], '08_ANGGARAN': ['jenis', 'komponenId'], '09_KOMITMEN': ['rabId'] };
  var missing = [];
  Object.keys(need).forEach(function (s) {
    var m = opSheetModel_(s);
    if (!m) { missing.push(s + ' (sheet tidak ada)'); return; }
    need[s].forEach(function (c) { if (m.live.indexOf(c) === -1) missing.push(s + '.' + c); });
  });
  return { ok: missing.length === 0, missing: missing };
}
/* siswa yang sudah punya pembayaran pada komponen lump yang akan digantikan */
function tpBentrok_(ctx, spec) {
  var sup = {}; spec.supersede.forEach(function (s) { sup[s.komponenId + '|' + s.unit] = true; });
  var byId = {}; ctx.students.forEach(function (s) { byId[s.id] = s; });
  var agg = {};
  ctx.alokasi.forEach(function (a) {
    var s = byId[a.siswaId]; if (!s || !sup[a.komponenId + '|' + s.unit]) return;
    var k = a.siswaId + '|' + a.komponenId;
    agg[k] = agg[k] || { siswaId: a.siswaId, nama: s.nama, unit: s.unit, kelas: s.kelas, komponenId: a.komponenId, nominalDibayar: 0 };
    agg[k].nominalDibayar += a.nominal;
  });
  return Object.keys(agg).sort().map(function (k) { return agg[k]; });
}
function opTarifPlan() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var ctx = tpContext_(), spec = tpSpec_(), plan = tpCompute_(ctx.komponen, ctx.tarif, spec);
    return okResult_('OK', { plan: plan, impact: tpImpact_(ctx, plan, spec), bentrok: tpBentrok_(ctx, spec), schema: tpSchemaStatus_(), computedAt: new Date().toISOString() });
  } catch (e) { return errResult_('COMPUTE_FAILED', 'Gagal menyusun rencana tarif', null); }
}
function tpBatch_(key, records) {
  var summary = { ok: 0, sudahAda: 0, gagal: [] }, i, j;
  for (i = 0; i < records.length; i += 100) {
    var r = opMasterBatch(key, records.slice(i, i + 100));
    if (!r.ok) { summary.gagal.push({ id: '*', code: r.code, message: r.message }); return summary; }
    for (j = 0; j < r.data.results.length; j++) {
      var x = r.data.results[j];
      if (x.ok) summary.ok++;
      else if (x.code === 'DUPLICATE') summary.sudahAda++;
      else summary.gagal.push({ id: x.id, code: x.code, message: x.message });
    }
  }
  return summary;
}
function opTarifApply(confirm) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  if (confirm !== TP_CONFIRM_) return errResult_('CONFIRM_REQUIRED', 'Konfirmasi eksplisit diperlukan (' + TP_CONFIRM_ + ')', 'confirm');
  try {
    var sch = tpSchemaStatus_();
    if (!sch.ok) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Kolom belum ada: ' + sch.missing.join(', ') + ' - jalankan Migrasi Skema Aditif lebih dulu', 'schema');
    var ctx = tpContext_(), spec = tpSpec_(), plan = tpCompute_(ctx.komponen, ctx.tarif, spec);
    if (!plan.ringkasan.totalsSemuaCocok) return errResult_('TOTALS_MISMATCH', 'Jumlah komponen tidak cocok dengan total sumber - tidak diterapkan (perlu konfirmasi manusia)', 'plan');
    if (plan.komponenKonflik.length) return errResult_('PLAN_CONFLICT', plan.komponenKonflik.length + ' komponen konflik (id/nama sudah dipakai dengan isi berbeda) - selesaikan manual dulu', 'plan');
    // 1) bekukan kewajiban yang sudah punya pembayaran pada komponen lump yang akan dinonaktifkan (riwayat tidak berubah)
    var seen = {}, komDeact = [];
    plan.tarifDeactivate.forEach(function (t) { if (!seen[t.komponenId]) { seen[t.komponenId] = true; komDeact.push(t.komponenId); } });
    var frozen = 0;
    if (komDeact.length) {
      var fr = oblSnapshotCore_({ semua: true, komponenIds: komDeact, onlyWithAllocations: true });
      if (!fr.ok) return fr;
      frozen = fr.data.dibuat;
    }
    // 2) komponen baru
    var kRes = tpBatch_('komponen', plan.komponenAdd.map(function (k) {
      var r = { id: k.id, nama: k.nama, unit: k.unit, frekuensi: k.frekuensi, status: 'Aktif' };
      if (k.sasaran) r.sasaran = k.sasaran; if (k.basisTarif) r.basisTarif = k.basisTarif; if (k.menggantikan) r.menggantikan = k.menggantikan;
      return r;
    }));
    if (kRes.gagal.length) return errResult_('WRITE_FAILED', 'Sebagian komponen gagal ditulis (' + JSON.stringify(kRes.gagal.slice(0, 3)) + ') - langkah berikutnya TIDAK dijalankan; aman dijalankan ulang', 'komponen');
    // 3) tarif baru
    var tRes = tpBatch_('tarif', plan.tarifAdd.map(function (t) { return { id: t.id, komponenId: t.komponenId, unit: t.unit, kelas: t.kelas, tahunAjaran: t.tahunAjaran, nominal: t.nominal, status: 'Aktif' }; }));
    if (tRes.gagal.length) return errResult_('WRITE_FAILED', 'Sebagian tarif gagal ditulis (' + JSON.stringify(tRes.gagal.slice(0, 3)) + ') - tarif lump TIDAK dinonaktifkan; aman dijalankan ulang', 'tarif');
    // 4) nonaktifkan (bukan hapus) tarif lump yang digantikan - hanya setelah rincian pengganti tertulis
    var dRes = tpBatch_('tarif', plan.tarifDeactivate.map(function (t) { return { id: t.id, status: 'Nonaktif' }; }));
    if (dRes.gagal.length) return errResult_('WRITE_FAILED', 'Sebagian tarif lump gagal dinonaktifkan (' + JSON.stringify(dRes.gagal.slice(0, 3)) + ') - aman dijalankan ulang', 'tarif');
    var noChange = !frozen && !kRes.ok && !tRes.ok && !dRes.ok;
    var out = okResult_(noChange ? 'Tidak ada perubahan (rencana sudah terpasang)' : 'Rencana tarif diterapkan', { ringkasan: plan.ringkasan, dibekukan: frozen, komponenDitulis: kRes.ok, tarifDitulis: tRes.ok, tarifDinonaktifkan: dRes.ok, perluKonfirmasi: plan.confirm.length });
    if (noChange) return out; // idempoten: penerapan ulang tanpa perubahan tidak menambah baris apa pun (termasuk audit)
    try { auditPush_('TARIF_PLAN_APPLIED', null, { ringkasan: plan.ringkasan, dibekukan: frozen }, 'google:' + g.identity.email, 'tarif-' + spec.ta); } catch (e2) { out.auditWarning = 'AUDIT_FAILED'; }
    return out;
  } catch (e) { return errResult_('WRITE_FAILED', 'Gagal menerapkan rencana tarif', null); }
}
