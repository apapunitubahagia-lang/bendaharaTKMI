/**
 * LiveReadiness.gs - HARNESS UJI INTEGRASI LIVE (P1_15). HANYA untuk proyek Apps Script yang TERIKAT (container-bound) pada
 * SALINAN spreadsheet uji. JANGAN pernah disalin ke proyek produksi; tidak termasuk daftar berkas deploy (P1_07 §1.5).
 *
 * Prinsip:
 * - Gagal tertutup bila spreadsheet aktif = produksi, atau bila Script Property LIVE_TEST_SPREADSHEET_ID tidak diisi manual
 *   dengan ID salinan yang sama persis (konfirmasi manusia bahwa ini salinan).
 * - Hanya pemeriksaan READ-ONLY dan pemeriksaan PENOLAKAN (input tidak sah yang harus ditolak server). Tidak ada penulisan
 *   yang diharapkan berhasil; jumlah baris setiap sheet dibandingkan sebelum/sesudah (harus sama).
 * - Snapshot status 11_MUTASI_BANK (termasuk jumlah TEREKONSILIASI) disimpan di Script Properties, bukan di sheet.
 * - Tidak membuat sheet, tidak menghapus apa pun. Uji jalur sukses (pembuatan transaksi, tautan LPJ, pengguna AUDITOR) dilakukan
 *   MANUAL lewat web app sesuai checklist P1_15 §3.4, pada salinan sekali pakai (dibuang setelah uji).
 * Jalankan dari editor Apps Script salinan, berurutan: ltPreflight() -> ltReadOnlyChecks() -> ltRejectionChecks() -> ltPostflight().
 * Setiap fungsi mengembalikan JSON dan menulis ke Logger; salin hasilnya ke laporan uji.
 */
var LT_PROD_ID_ = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
var LT_PROP_ID_ = 'LIVE_TEST_SPREADSHEET_ID';
var LT_PROP_SNAP_ = 'LIVE_TEST_SNAPSHOT';
var LT_SHEETS_ = ['04_KEWAJIBAN', '05_TRANSAKSI', '06_ALOKASI', '08_ANGGARAN', '09_KOMITMEN', '10_BUKTI', '11_MUTASI_BANK', '12_DUP_REVIEW', '13_AUDIT_LOG',
  '14_KPI', '15_SETTINGS', '16_REKONSILIASI', '17_LAPORAN', '18_RKAT', '19_LPJ', '23_TAHUN_AJARAN', '26_USER_ACCESS', '30_ALOKASI_PENGELUARAN'];

function ltGuard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('LIVE TEST DIBATALKAN: skrip tidak terikat pada spreadsheet (getActiveSpreadsheet null)');
  var id = ss.getId();
  if (id === LT_PROD_ID_) throw new Error('LIVE TEST DIBATALKAN: spreadsheet aktif adalah PRODUKSI');
  var ok = PropertiesService.getScriptProperties().getProperty(LT_PROP_ID_);
  if (ok !== id) throw new Error('LIVE TEST DIBATALKAN: Script Property ' + LT_PROP_ID_ + ' belum diisi manual dengan ID salinan ini (' + id + ')');
  return ss;
}
function ltCounts_(ss) {
  var out = {};
  LT_SHEETS_.forEach(function (n) { var sh = ss.getSheetByName(n); out[n] = sh ? Math.max(0, sh.getLastRow() - 1) : null; });
  return out;
}
function ltMutasiStatus_(ss) {
  var sh = ss.getSheetByName('11_MUTASI_BANK'); if (!sh || sh.getLastRow() < 2) return { total: 0, terekonsiliasi: 0, hash: '' };
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  var ci = h.indexOf('id'), cs = h.indexOf('status');
  if (ci === -1 || cs === -1) return { error: 'kolom id/status tidak ditemukan' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var pairs = vals.map(function (r) { return String(r[ci]) + '=' + String(r[cs]); });
  return { total: vals.length, terekonsiliasi: vals.filter(function (r) { return String(r[cs]) === 'TEREKONSILIASI'; }).length, hash: oblHash_(pairs.join('|')) };
}
function ltLog_(name, obj) { var s = JSON.stringify(obj); Logger.log(name + ': ' + s); return obj; }

/* 1. Pra-uji: pengaman salinan + snapshot (jumlah baris, status mutasi, identitas yang dilihat server) */
function ltPreflight() {
  var ss = ltGuard_();
  var id = getCurrentUserIdentity();
  var snap = { at: new Date().toISOString(), spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), counts: ltCounts_(ss), mutasi: ltMutasiStatus_(ss),
    identity: { authorized: id.authorized, code: id.code || '', role: id.role || null, emailTerbaca: !!id.email }, effectiveUserTerbaca: !!Session.getEffectiveUser().getEmail() };
  PropertiesService.getScriptProperties().setProperty(LT_PROP_SNAP_, JSON.stringify(snap));
  return ltLog_('ltPreflight', snap);
}

/* 2. Pemeriksaan read-only: T8 pada data salinan nyata (header FINAL sungguhan) + skema */
function ltReadOnlyChecks() {
  ltGuard_();
  var res = { schema: null, reads: {}, kpiSourcesOk: true };
  var sr = opSchemaReport(); res.schema = sr.ok ? sr.data.map(function (x) { return x.sheet + ':' + x.status; }) : sr.code;
  OP_READ_SHEETS_.forEach(function (n) {
    var r = opReadSheet(n, { offset: 0, limit: 1 });
    res.reads[n] = r.ok ? (r.data.readStatus + (r.data.sheetMissing ? ':sheetMissing' : '') + ':total=' + r.data.total) : ('ERROR:' + r.code + (r.missing ? ':' + r.missing.join(',') : ''));
    if (!r.ok) res.kpiSourcesOk = false;
  });
  return ltLog_('ltReadOnlyChecks', res);
}

/* 3. Pemeriksaan penolakan: T4 (tanggal/periode tidak sah) dan T7 (peran istimewa). Setiap kasus HARUS ditolak. */
function ltRejectionChecks() {
  ltGuard_();
  var bad = ['2026-13-40', '2026-02-30', '2025-02-29', '19/10/2026', '2026-1-9', '2026-10-19T08:00:00'];
  var out = { t4: [], t7: [], unexpectedAccepted: [], rejectedForOtherReason: [] };
  var akun = (getAccounts().data || [])[0];
  /* kasus lulus HANYA bila ditolak DENGAN alasan yang diuji (field tanggal/periode atau kode peran), bukan karena validasi lain */
  var push = function (bucket, label, r, reason) {
    var res = r && r.data && r.data.results ? r.data.results[0] : r;
    var accepted = !!(res && res.ok);
    var why = String((res && res.field) || '') + ' ' + String((res && res.code) || '') + ' ' + String((res && res.message) || '');
    bucket.push(label + '=' + (res && res.code));
    if (accepted) out.unexpectedAccepted.push(label);
    else if (!reason.test(why)) out.rejectedForOtherReason.push(label + ' (' + why.slice(0, 120) + ')');
  };
  var T = /tanggal/, P = /periode/, R = /PRIVILEGED_ROLE_CHANGE_DENIED/;
  bad.forEach(function (d) {
    push(out.t4, 'expense:' + d, opCreateExpense({ tanggal: d, unit: 'MI', nominal: 1, akunId: akun ? akun.id : 'x', metode: 'Tunai', kategori: 'LIVETEST', penerima: 'LIVETEST', clientRequestId: 'LIVETEST_bad_' + d.replace(/[^0-9]/g, '') }), T);
    push(out.t4, 'lpj:' + d, opRecordBatch('lpj', [{ op: 'upsert', id: 'LIVETEST_lpj_' + d.replace(/[^0-9]/g, ''), row: { tanggal: d, nominal: 1, status: 'REALIZATION', item: 'LIVETEST' } }]), T);
    push(out.t4, 'mutasi:' + d, opRecordBatch('mutasiBank', [{ op: 'upsert', id: 'LIVETEST_mut_' + d.replace(/[^0-9]/g, ''), row: { tanggal: d, nominal: 1, keterangan: 'LIVETEST' } }]), T);
  });
  ['oktober 2026', 'Bulan13 2026', '2026-10', ''].forEach(function (p) {
    push(out.t4, 'anggaran.periode:' + p, opRecordBatch('anggaran', [{ op: 'upsert', id: 'LIVETEST_ang_' + p.replace(/[^A-Za-z0-9]/g, ''), row: { periode: p, program: 'LIVETEST', kategori: 'LIVETEST', unit: 'MI', nominal: 1 } }]), P);
    push(out.t4, 'periodeAktif:' + p, opSettingsUpsert([{ key: 'periodeAktif', value: p }]), P);
  });
  ['KEPALA_SEKOLAH', 'YAYASAN'].forEach(function (role) {
    push(out.t7, 'grant:' + role, opUserUpsert({ email: 'livetest.' + role.toLowerCase() + '@invalid.test', nama: 'LIVETEST', role: role, unit: '', status: 'ACTIVE' }), R);
  });
  out.lulus = out.unexpectedAccepted.length === 0 && out.rejectedForOtherReason.length === 0;
  return ltLog_('ltRejectionChecks', out);
}

/* 4. Pasca-uji: tidak ada baris yang bertambah/berubah; status mutasi (termasuk TEREKONSILIASI) identik */
function ltPostflight() {
  var ss = ltGuard_();
  var snap = JSON.parse(PropertiesService.getScriptProperties().getProperty(LT_PROP_SNAP_) || 'null');
  if (!snap) throw new Error('Snapshot pra-uji tidak ada - jalankan ltPreflight() lebih dulu');
  var now = ltCounts_(ss), mut = ltMutasiStatus_(ss), diff = [];
  Object.keys(now).forEach(function (n) { if (now[n] !== snap.counts[n]) diff.push(n + ': ' + snap.counts[n] + ' -> ' + now[n]); });
  var res = { barisBerubah: diff, mutasiIdentik: mut.hash === snap.mutasi.hash && mut.terekonsiliasi === snap.mutasi.terekonsiliasi, terekonsiliasi: [snap.mutasi.terekonsiliasi, mut.terekonsiliasi],
    catatan: 'barisBerubah pada 13_AUDIT_LOG TIDAK diharapkan: semua kasus di ltRejectionChecks ditolak sebelum menulis' };
  res.lulus = diff.length === 0 && res.mutasiIdentik;
  return ltLog_('ltPostflight', res);
}
