/**
 * RabPersetujuan.gs - [P1_21 U-5] Metadata persetujuan RAB: 08_ANGGARAN.disetujuiPada / disetujuiOleh (kolom aditif).
 *
 * Nilai DITENTUKAN SERVER di opRecordBatchLocked_ (satu-satunya jalur tulis 08_ANGGARAN: form, impor RAB, uji live):
 *   - nilai kedua kolom yang dikirim klien selalu dibuang (tidak pernah dipercaya);
 *   - status berubah menjadi DISETUJUI (atau baris baru berstatus DISETUJUI): disetujuiPada = waktu server (ISO),
 *     disetujuiOleh = email sesi dari opGate_;
 *   - status DISETUJUI berubah ke status lain: kedua kolom dikosongkan (riwayat tetap di 13_AUDIT_LOG);
 *   - setiap transisi dicatat audit RAB_PERSETUJUAN pada append yang sama dengan batch;
 *   - kolom belum ada (Migrasi Skema Aditif belum dijalankan): perubahan diproses seperti sebelumnya, hasil diberi
 *     peringatan METADATA_PERSETUJUAN_TIDAK_TERSIMPAN; audit tetap mencatat aktor & waktu.
 * RAB lama berstatus DISETUJUI tanpa metadata TIDAK diisi/dikarang: dilaporkan HISTORI_TIDAK_LENGKAP oleh opRabPersetujuanAudit.
 *
 * TIDAK mengubah pencocokan RAB maupun KPI (BDS03-I03/I04/I05): status persetujuan masih dinilai menurut status SAAT INI
 * (berlaku surut, perilaku lama). Kebijakan "tidak berlaku surut" baru diukur dampaknya (opRabPersetujuanAudit, baca-saja);
 * penerapannya pada perhitungan butuh persetujuan perubahan KPI terpisah. Persetujuan retroaktif TIDAK diaktifkan (GAP-005).
 * DEPENDENSI: OperationalAPI.gs (opGate_, opStr_, OP_READ_ROLES_), SchemaGuard.gs (sgRowsChecked_, sgErr_),
 *             FinanceEngine.gs (rabMatchAll_, fccPeriodeOfDate_), TransactionEngine.gs (okResult_, errResult_).
 * STATUS: sandbox lokal saja. BELUM dijalankan di Apps Script sungguhan.
 */
var RAB_APPROVAL_COLS_ = ['disetujuiPada', 'disetujuiOleh'];
function rabApprovalStatus_(v) { return opStr_(v).trim().toUpperCase(); }
function rabApprovalStrip_(row) {
  var out = {};
  Object.keys(row).forEach(function (k) { if (RAB_APPROVAL_COLS_.indexOf(k) === -1) out[k] = row[k]; });
  return out;
}
/* cur = baris lama (array) atau null untuk baris baru; next = baris berikut (array, dimutasi). Mengembalikan info transisi atau null. */
function rabApprovalStamp_(live, cur, next, email, nowIso) {
  var sc = live.indexOf('status'); if (sc === -1) return null;
  var before = cur ? rabApprovalStatus_(cur[sc]) : '', after = rabApprovalStatus_(next[sc]);
  var pc = live.indexOf('disetujuiPada'), oc = live.indexOf('disetujuiOleh'), cols = pc !== -1 && oc !== -1;
  if (after === 'DISETUJUI' && before !== 'DISETUJUI') {
    if (cols) { next[pc] = nowIso; next[oc] = email; }
    return { transisi: 'DISETUJUI', statusSebelum: before, statusSesudah: after, disetujuiPada: nowIso, disetujuiOleh: email, metadataTersimpan: cols };
  }
  if (before === 'DISETUJUI' && after !== 'DISETUJUI') {
    if (cols) { next[pc] = ''; next[oc] = ''; }
    return { transisi: 'PERSETUJUAN_DICABUT', statusSebelum: before, statusSesudah: after, oleh: email, pada: nowIso, metadataTersimpan: cols };
  }
  return null;
}
/* Baca-saja: kelengkapan metadata persetujuan RAB + dampak kebijakan "tidak berlaku surut" pada transaksi yang dipetakan
   ke RAB DISETUJUI (bahan keputusan; tidak mengubah KPI). */
function opRabPersetujuanAudit() {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  try {
    var ang = sgRowsChecked_('08_ANGGARAN'), alive = function (r) { return !opStr_(r.archivedAt); };
    var kolomAda = ang.length ? Object.prototype.hasOwnProperty.call(ang[0], 'disetujuiPada') && Object.prototype.hasOwnProperty.call(ang[0], 'disetujuiOleh') : null;
    var disetujui = ang.filter(alive).filter(function (a) { return rabApprovalStatus_(a.status) === 'DISETUJUI'; });
    var tidakLengkap = disetujui.filter(function (a) { return !opStr_(a.disetujuiPada) || !opStr_(a.disetujuiOleh); }).map(function (a) { return { anggaranId: opStr_(a.id), periode: opStr_(a.periode), kategori: opStr_(a.kategori), unit: opStr_(a.unit), status: 'HISTORI_TIDAK_LENGKAP' }; });
    var pada = {}; disetujui.forEach(function (a) { if (opStr_(a.disetujuiPada)) pada[opStr_(a.id)] = opStr_(a.disetujuiPada).slice(0, 10); });
    var D = { transaksi: sgRowsChecked_('05_TRANSAKSI'), anggaran: ang, lpj: [], kategoriPengeluaran: sgRowsChecked_('21_KATEGORI_PENGELUARAN'), alokasiPengeluaran: sgRowsChecked_('30_ALOKASI_PENGELUARAN') };
    var M = rabMatchAll_(D), sebelum = [], tanpaMeta = 0;
    M.transaksi.forEach(function (r) {
      if (!r.disetujui) return;
      var t = D.transaksi.filter(function (x) { return opStr_(x.id) === r.transaksiId; })[0], tgl = t ? opStr_(t.tanggal).slice(0, 10) : '';
      var ids = [];
      r.bagian.forEach(function (b) {
        if (b.anggaranId) ids.push(opStr_(b.anggaranId));
        else { var L = M.lineByKey[b.lineKey]; (L && L.rabIdsDisetujui || []).forEach(function (x) { ids.push(opStr_(x)); }); }
      });
      var tgls = ids.map(function (x) { return pada[x] || ''; });
      if (!ids.length || tgls.some(function (x) { return !x; })) { tanpaMeta++; return; }
      var paling = tgls.sort().pop(); // persetujuan terakhir yang menjadi dasar transaksi ini
      if (tgl && tgl < paling) sebelum.push({ transaksiId: r.transaksiId, periode: r.periode, tanggal: tgl, nominal: r.nominal, disetujuiPada: paling, anggaranIds: ids });
    });
    return okResult_('OK', {
      kolomMetadataAda: kolomAda, rabDisetujui: disetujui.length, historiTidakLengkap: tidakLengkap,
      dampakTidakBerlakuSurut: { transaksiSebelumPersetujuan: sebelum, transaksiDisetujuiTanpaMetadata: tanpaMeta, catatan: 'Hanya pengukuran: BDS03-I03/I05 TIDAK diubah. Transaksi di daftar ini saat ini dihitung sesuai RAB karena status DISETUJUI berlaku surut.' },
      computedAt: new Date().toISOString()
    });
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal mengaudit persetujuan RAB'); }
}
/* [P1_22 U-5] SIMULASI BACA-SAJA aturan "persetujuan RAB tidak berlaku surut" terhadap masukan BDS03-I03 / BDS03-I05.
   Pencocokan aktif (rabMatchAll_), formula KPI, dan data TIDAK diubah. Per transaksi PENGELUARAN aktif:
     sekarang : I03 = terpetakan penuh ke RAB DISETUJUI (r.disetujui); I05 = I03 ATAU tertaut komitmen (09_KOMITMEN.transaksiId bila
                kolom ada - setara pengeluaranPunyaPersetujuan klien);
     simulasi : I03 tetap lulus hanya bila tanggal transaksi >= disetujuiPada SEMUA RAB dasarnya; RAB tanpa metadata =
                HISTORI_TIDAK_LENGKAP -> TIDAK_DAPAT_DINILAI, dilaporkan sebagai rentang (batas bawah: dianggap gagal;
                batas atas: dianggap lulus). Waktu persetujuan historis tidak dikarang.
   opts.periode (opsional) = "<Bulan> <Tahun>". */
function opRabTidakSurutSimulasi(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    var per = opStr_(opts.periode), ang = sgRowsChecked_('08_ANGGARAN');
    var pada = {}; ang.forEach(function (a) { if (rabApprovalStatus_(a.status) === 'DISETUJUI' && !opStr_(a.archivedAt)) pada[opStr_(a.id)] = opStr_(a.disetujuiPada).slice(0, 10); });
    var D = { transaksi: sgRowsChecked_('05_TRANSAKSI'), anggaran: ang, lpj: [], kategoriPengeluaran: sgRowsChecked_('21_KATEGORI_PENGELUARAN'), alokasiPengeluaran: sgRowsChecked_('30_ALOKASI_PENGELUARAN') };
    var kom = {}; sgRowsChecked_('09_KOMITMEN').forEach(function (k) { if (opStr_(k.transaksiId) && !opStr_(k.archivedAt)) kom[opStr_(k.transaksiId)] = true; });
    var tgl = {}; D.transaksi.forEach(function (t) { tgl[opStr_(t.id)] = opStr_(t.tanggal).slice(0, 10); });
    var M = rabMatchAll_(D), perPeriode = {}, baris = [];
    var P = function (p) { return perPeriode[p] = perPeriode[p] || { populasi: 0, i03Sekarang: 0, i03SimulasiMin: 0, i03SimulasiMaks: 0, i05Sekarang: 0, i05SimulasiMin: 0, i05SimulasiMaks: 0, berubahGagal: 0, tidakDapatDinilai: 0 }; };
    M.transaksi.forEach(function (r) {
      if (per && r.periode !== per) return;
      var a = P(r.periode), komit = !!kom[r.transaksiId], i03 = !!r.disetujui, status = 'TIDAK_TERDAMPAK', simMin = i03, simMaks = i03, dasar = [];
      if (i03) {
        r.bagian.forEach(function (b) {
          if (b.anggaranId) dasar.push(opStr_(b.anggaranId));
          else { var L = M.lineByKey[b.lineKey]; (L && L.rabIdsDisetujui || []).forEach(function (x) { dasar.push(opStr_(x)); }); }
        });
        var tg = dasar.map(function (x) { return pada[x] || ''; });
        if (!dasar.length || tg.some(function (x) { return !x; })) { status = 'TIDAK_DAPAT_DINILAI'; simMin = false; simMaks = true; a.tidakDapatDinilai++; }
        else if (tgl[r.transaksiId] < tg.sort().pop()) { status = 'BERUBAH_GAGAL'; simMin = simMaks = false; a.berubahGagal++; }
      }
      a.populasi++; if (i03) a.i03Sekarang++; if (simMin) a.i03SimulasiMin++; if (simMaks) a.i03SimulasiMaks++;
      if (i03 || komit) a.i05Sekarang++; if (simMin || komit) a.i05SimulasiMin++; if (simMaks || komit) a.i05SimulasiMaks++;
      if (status !== 'TIDAK_TERDAMPAK' && baris.length < 300) baris.push({ transaksiId: r.transaksiId, periode: r.periode, tanggal: tgl[r.transaksiId], nominal: r.nominal, status: status, anggaranIds: dasar, disetujuiPada: dasar.map(function (x) { return pada[x] || null; }), punyaKomitmen: komit });
    });
    return okResult_('Simulasi U-5 (read-only)', { periode: per || '*', perPeriode: perPeriode, transaksiTerdampak: baris,
      dampak: { data: 'tidak ada baris yang ditulis', pencocokan: 'garis RAB tiap transaksi tidak berubah; hanya status "disetujui" yang disimulasikan', kpi: 'formula/bobot/ambang tidak diubah; angka = masukan populasi/lulus, bukan skor' },
      computedAt: new Date().toISOString() });
  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal mensimulasikan U-5'); }
}
