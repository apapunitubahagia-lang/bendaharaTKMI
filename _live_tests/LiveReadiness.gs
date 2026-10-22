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
/* [P1_19 E] Folder bukti uji: BUKTI_FOLDER_ID wajib diisi dan bukan folder bernama 'Bendahara_Bukti' (nama folder produksi). */
function ltBuktiFolderCek_() {
  var fid = PropertiesService.getScriptProperties().getProperty('BUKTI_FOLDER_ID');
  if (!fid) return { ok: false, alasan: 'Script Property BUKTI_FOLDER_ID belum diisi (unggah bukti di mode uji akan ditolak)' };
  try { var f = DriveApp.getFolderById(fid); return { ok: f.getName() !== 'Bendahara_Bukti', nama: f.getName(), alasan: f.getName() === 'Bendahara_Bukti' ? 'nama sama dengan folder produksi - gunakan folder khusus uji' : '' }; }
  catch (e) { return { ok: false, alasan: 'folder tidak dapat dibuka oleh akun ini' }; }
}
function ltLog_(name, obj) { var s = JSON.stringify(obj); Logger.log(name + ': ' + s); return obj; }

/* 1. Pra-uji: pengaman salinan + snapshot (jumlah baris, status mutasi, identitas yang dilihat server) */
function ltPreflight() {
  var ss = ltGuard_();
  var id = getCurrentUserIdentity();
  var snap = { at: new Date().toISOString(), spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), counts: ltCounts_(ss), mutasi: ltMutasiStatus_(ss),
    identity: { authorized: id.authorized, code: id.code || '', role: id.role || null, emailTerbaca: !!id.email }, effectiveUserTerbaca: !!Session.getEffectiveUser().getEmail(),
    buktiFolder: ltBuktiFolderCek_() }; // [P1_19 E] folder bukti khusus uji wajib (Script Property BUKTI_FOLDER_ID)
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

/* ======================= [P1_24] tambahan harness (HANYA salinan uji; semua lewat ltGuard_) =======================
 * Urutan yang disarankan (lihat P1_24 §3-§5):
 *   ltIdentitasProbe()                         - baca-saja: apa yang terbaca Session untuk akun ini (bahan keputusan GAP-005)
 *   ltKewajibanBekuAudit()                     - baca-saja: opKewajibanBekuAudit + bukti isi sheet tidak berubah (D-1)
 *   ltLpjSetupPreview()                        - baca-saja: pratinjau skema LPJ + snapshot isi sheet (Script Property)
 *   ltLpjSetupApply(konfirmasi, idSalinan)     - SATU-SATUNYA fungsi yang menulis: opUangMukaLpjSetup pada salinan, lalu
 *                                                verifikasi data lama identik + idempoten. Butuh pratinjau & konfirmasi ganda.
 *   ltLpjRollbackCek()                         - baca-saja: apakah sheet/kolom LPJ baru sudah berisi data (penentu cara rollback)
 * Tidak ada fungsi yang menghapus sheet/kolom; rollback skema = buang salinan sekali pakai (P1_15 P2). */
var LT_PROP_LPJ_SNAP_ = 'LIVE_TEST_LPJ_SNAPSHOT';
var LT_ISI_SHEETS_ = LT_SHEETS_.concat(['01_SISWA', '02_KOMPONEN', '03_TARIF', '07_AKUN', '21_KATEGORI_PENGELUARAN']);
/* isi tiap sheet: jumlah kolom & baris + hash nilai (deteksi perubahan, bukan pengaman kriptografis). cols dibatasi untuk
   membandingkan hanya kolom yang sudah ada sebelum setup (kolom aditif boleh bertambah di kanan). */
function ltIsi_(ss, colsMap) {
  var out = {};
  LT_ISI_SHEETS_.forEach(function (n) {
    var sh = ss.getSheetByName(n); if (!sh) { out[n] = null; return; }
    var lr = sh.getLastRow(), lc = sh.getLastColumn(), c = colsMap && colsMap[n] ? Math.min(colsMap[n], lc) : lc;
    var vals = lr > 0 && c > 0 ? sh.getRange(1, 1, lr, c).getValues() : [];
    out[n] = { cols: lc, rows: Math.max(0, lr - 1), hash: oblHash_(JSON.stringify(vals)) };
  });
  return out;
}
function ltIsiBanding_(a, b) {
  var beda = [];
  Object.keys(a).forEach(function (n) {
    var x = a[n], y = b[n];
    if (!x && !y) return;
    if (!x || !y || x.rows !== y.rows || x.hash !== y.hash) beda.push(n + ': ' + JSON.stringify(x && { rows: x.rows, hash: x.hash }) + ' -> ' + JSON.stringify(y && { rows: y.rows, hash: y.hash }));
  });
  return beda;
}
function ltColsDari_(isi) { var m = {}; Object.keys(isi).forEach(function (n) { if (isi[n]) m[n] = isi[n].cols; }); return m; }

/* GAP-005: identitas yang terlihat server untuk akun yang menjalankan fungsi ini. Jalankan dari editor (akun pemilik salinan) DAN
   lewat web app uji dengan tiap akun uji; catat hasil + konfigurasi executeAs/access. Email TIDAK dicatat utuh (hanya domain). */
function ltIdentitasProbe() {
  var ss = ltGuard_();
  var act = '', eff = '', errAct = '';
  try { act = String(Session.getActiveUser().getEmail() || ''); } catch (e) { errAct = String(e && e.message || e); }
  try { eff = String(Session.getEffectiveUser().getEmail() || ''); } catch (e2) { eff = ''; }
  var dom = function (e) { var i = e.indexOf('@'); return i === -1 ? '' : e.slice(i + 1).toLowerCase(); };
  var id = getCurrentUserIdentity();
  var diag = !act ? 'EMAIL_AKTIF_KOSONG: server gagal tertutup (AUTH_REQUIRED). Umum terjadi pada Gmail konsumen/luar domain dengan executeAs=USER_DEPLOYING; jangan dianggap bug - lihat P1_24 §2.2'
    : (act.toLowerCase() === eff.toLowerCase() ? 'EMAIL_AKTIF = EMAIL_EFEKTIF: dijalankan pemilik atau executeAs=USER_ACCESSING (pengguna butuh akses edit spreadsheet -> kontrol server dapat dilewati)'
      : 'EMAIL_AKTIF != EMAIL_EFEKTIF: executeAs=USER_DEPLOYING dengan identitas pengunjung terbaca (konfigurasi yang dituju)');
  return ltLog_('ltIdentitasProbe', { spreadsheetId: ss.getId(), emailAktifTerbaca: !!act, domainAktif: dom(act), emailEfektifTerbaca: !!eff, domainEfektif: dom(eff),
    aktifSamaDenganEfektif: !!act && act.toLowerCase() === eff.toLowerCase(), galatGetActiveUser: errAct, identitasServer: { authorized: id.authorized, code: id.code, role: id.role || null }, diagnosis: diag });
}

/* D-1: audit kewajiban beku pada salinan, dengan bukti baca-saja (isi seluruh sheet terpantau identik sebelum/sesudah). */
function ltKewajibanBekuAudit() {
  var ss = ltGuard_(), a = ltIsi_(ss), r = opKewajibanBekuAudit(), b = ltIsi_(ss, ltColsDari_(a)), beda = ltIsiBanding_(a, b);
  return ltLog_('ltKewajibanBekuAudit', { ok: !!(r && r.ok), code: r && r.code, ringkasan: r && r.data && r.data.ringkasan, jumlahPerJenis: r && r.data && r.data.jumlahPerJenis,
    konsistensiData: r && r.data && r.data.konsistensiData, pengecualian: r && r.data && r.data.pengecualian, sheetBerubah: beda, bacaSaja: beda.length === 0 });
}

/* D-LPJ langkah 1 (baca-saja): pratinjau + snapshot isi. */
function ltLpjSetupPreview() {
  var ss = ltGuard_(), plan = opUangMukaLpjPlan();
  if (!plan || !plan.ok) return ltLog_('ltLpjSetupPreview', { ok: false, code: plan && plan.code, message: plan && plan.message });
  var snap = { at: new Date().toISOString(), spreadsheetId: ss.getId(), isi: ltIsi_(ss), mutasi: ltMutasiStatus_(ss), plan: plan.data.plan };
  PropertiesService.getScriptProperties().setProperty(LT_PROP_LPJ_SNAP_, JSON.stringify(snap));
  return ltLog_('ltLpjSetupPreview', { ok: true, plan: plan.data.plan, konfirmasi: plan.data.konfirmasi, terekonsiliasi: snap.mutasi.terekonsiliasi,
    langkahBerikut: 'Periksa plan. Buat salinan cadangan (File > Make a copy). Lalu ltLpjSetupApply("' + plan.data.konfirmasi + '", "' + ss.getId() + '")' });
}

/* D-LPJ langkah 2 (MENULIS SKEMA, hanya salinan): konfirmasi ganda + isi tidak berubah sejak pratinjau; setelah setup:
   data lama identik (kolom lama), TEREKONSILIASI identik, panggilan kedua UNCHANGED. */
function ltLpjSetupApply(konfirmasi, idSalinan) {
  var ss = ltGuard_();
  if (String(idSalinan || '') !== ss.getId()) throw new Error('SETUP DIBATALKAN: argumen kedua harus ID salinan aktif (' + ss.getId() + ')');
  var snap = JSON.parse(PropertiesService.getScriptProperties().getProperty(LT_PROP_LPJ_SNAP_) || 'null');
  if (!snap || snap.spreadsheetId !== ss.getId()) throw new Error('SETUP DIBATALKAN: jalankan ltLpjSetupPreview() lebih dulu pada salinan ini');
  var cols = ltColsDari_(snap.isi), sebelum = ltIsiBanding_(snap.isi, ltIsi_(ss, cols));
  if (sebelum.length) throw new Error('SETUP DIBATALKAN: data berubah sejak pratinjau (' + sebelum.join('; ') + ') - ulangi ltLpjSetupPreview()');
  var r1 = opUangMukaLpjSetup(konfirmasi);
  var r2 = r1 && r1.ok ? opUangMukaLpjSetup(konfirmasi) : null;
  var sesudah = ltIsiBanding_(snap.isi, ltIsi_(ss, cols)), mut = ltMutasiStatus_(ss);
  /* 13_AUDIT_LOG diharapkan bertambah (audit SCHEMA_*); baris data lain tidak boleh berubah */
  var bedaData = sesudah.filter(function (x) { return x.indexOf('13_AUDIT_LOG') !== 0; });
  var res = { setup: r1 && { ok: r1.ok, code: r1.code, data: r1.data }, ulang: r2 && { ok: r2.ok, unchanged: !!(r2.data && r2.data.unchanged) },
    dataLamaBerubah: bedaData, auditLogBertambah: sesudah.some(function (x) { return x.indexOf('13_AUDIT_LOG') === 0; }),
    terekonsiliasi: [snap.mutasi.terekonsiliasi, mut.terekonsiliasi], mutasiIdentik: mut.hash === snap.mutasi.hash,
    rollback: 'Tidak ada hapus otomatis. Salinan uji: buang salinan. Bila perlu pada salinan yang dipertahankan: jalankan ltLpjRollbackCek(); sheet 32/33/34 & kolom 19_LPJ baru hanya boleh dihapus MANUAL bila kosong (kode lama tidak membacanya).' };
  res.lulus = !!(r1 && r1.ok) && !!(r2 && r2.ok && r2.data && r2.data.unchanged) && bedaData.length === 0 && res.mutasiIdentik;
  return ltLog_('ltLpjSetupApply', res);
}

/* D-LPJ rollback (baca-saja): isi sheet & kolom LPJ baru. */
function ltLpjRollbackCek() {
  var ss = ltGuard_(), out = { sheet: {}, kolom19: {} };
  Object.keys(UM_SHEETS_).forEach(function (s) { var sh = ss.getSheetByName(s); out.sheet[s] = sh ? Math.max(0, sh.getLastRow() - 1) : null; });
  var m = sgModel_('19_LPJ', ['id']);
  if (m) UM_LPJ_COLS_.forEach(function (c) { var i = m.live.indexOf(c); out.kolom19[c] = i === -1 ? null : m.values.filter(function (r) { return String(r[i]) !== ''; }).length; });
  out.kosong = Object.keys(out.sheet).every(function (s) { return !out.sheet[s]; }) && Object.keys(out.kolom19).every(function (c) { return !out.kolom19[c]; });
  out.catatan = out.kosong ? 'Skema LPJ belum dipakai: aman dihapus MANUAL (atau buang salinan).' : 'Skema LPJ SUDAH berisi data: jangan dihapus; rollback = buang salinan / revert kode (kolom tambahan tidak dibaca kode lama).';
  return ltLog_('ltLpjRollbackCek', out);
}

/* [P1_27] Baca-saja: sebaran nilai status (dan jenis) pada sheet keuangan - untuk memverifikasi asal angka "544 TEREKONSILIASI"
   tanpa menebak. Nilai dihitung apa adanya (tanpa normalisasi huruf); juga dicatat total nilai yang memuat kata REKONSIL (huruf apa pun).
   Ditambah diagnosis Script Property BUKTI_FOLDER_ID (format, tanpa mencetak isinya). Tidak menulis apa pun. */
function ltStatusRingkasan() {
  var ss = ltGuard_(), out = { sheet: {}, buktiFolderId: {} };
  [['05_TRANSAKSI', ['status', 'jenis']], ['11_MUTASI_BANK', ['status']], ['16_REKONSILIASI', ['status']], ['19_LPJ', ['status']], ['06_ALOKASI', []]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]); if (!sh) { out.sheet[x[0]] = null; return; }
    var lr = sh.getLastRow(), lc = sh.getLastColumn(); var res = { baris: Math.max(0, lr - 1) };
    if (lr >= 2 && lc > 0) {
      var h = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (v) { return String(v).trim(); }), vals = sh.getRange(2, 1, lr - 1, lc).getValues();
      var ia = h.indexOf('archivedAt');
      res.diarsip = ia === -1 ? null : vals.filter(function (r) { return String(r[ia]) !== ''; }).length;
      x[1].forEach(function (k) { var i = h.indexOf(k); if (i === -1) { res[k] = 'KOLOM_TIDAK_ADA'; return; } var m = {}; vals.forEach(function (r) { var v = String(r[i]); m[v === '' ? '(kosong)' : v] = (m[v === '' ? '(kosong)' : v] || 0) + 1; }); res[k] = m;
        res[k + '_memuatREKONSIL'] = vals.filter(function (r) { return /rekonsil/i.test(String(r[i])); }).length; });
    }
    out.sheet[x[0]] = res;
  });
  var fid = String(PropertiesService.getScriptProperties().getProperty('BUKTI_FOLDER_ID') || '');
  out.buktiFolderId = { terisi: fid !== '', panjang: fid.length, tampakUrl: /^https?:|\//.test(fid), adaSpasi: /\s/.test(fid), cek: ltBuktiFolderCek_() };
  return ltLog_('ltStatusRingkasan', out);
}

/* [P1_28] BACA-SAJA: rincian transaksi PENERIMAAN yang belum teralokasi penuh, beserta ALASAN (dihitung dengan aturan yang sama
   dengan engineAllocStatusFor_) dan tagihan terbuka siswa (dari ObligationEngine). Tidak menulis apa pun; tidak mengubah status.
   Nama siswa/pengirim TIDAK dicetak (hanya siswaId). Alasan:
   - TANPA_SISWA            : siswaId kosong dan belum ada alokasi (TERCATAT)
   - SISWA_TIDAK_DIKENAL    : siswaId tidak ada di 01_SISWA
   - BELUM_DIALOKASI        : siswa dikenal, alokasi 0
   - SISA_ADA_TAGIHAN       : masih ada sisa dan siswa masih punya tagihan terbuka (dapat dialokasikan)
   - SISA_TANPA_TAGIHAN     : masih ada sisa tetapi tagihan siswa sudah lunas/tidak ada (kelebihan bayar atau tagihan belum terbentuk)
   - ALOKASI_MELEBIHI       : jumlah alokasi > nominal transaksi
   Juga membandingkan status TERSIMPAN dengan status HITUNG untuk SELURUH penerimaan (selisih = data lama belum diperbarui). */
function ltSisaAlokasi() { return ltSisaAlokasiHitung_(true); }
function ltSisaAlokasiHitung_(cetakLog) {
  ltGuard_();
  var r2 = function (n) { return Math.round(Number(n || 0) * 100) / 100; };
  var trx = sgRowsChecked_('05_TRANSAKSI').filter(function (t) { return t.jenis === 'PENERIMAAN' && !t.archivedAt; });
  var alok = activeAllocationRows_(), perTrx = {};
  alok.forEach(function (a) { (perTrx[a.transaksiId] = perTrx[a.transaksiId] || []).push(a); });
  var prev = OBL_CTX_, ctxErr = '', tagihanSiswa = {}, siswaAda = {};
  try {
    try { if (typeof kgThrowIfBad_ === 'function') kgThrowIfBad_(); OBL_CTX_ = oblLoadContext_(); } catch (e) { ctxErr = String(e && e.message || e); OBL_CTX_ = null; }
    if (OBL_CTX_) MasterAPI.students().forEach(function (s) { siswaAda[s.id] = true; });
    var tagihanTerbuka = function (sid) {
      if (!OBL_CTX_) return null;
      if (tagihanSiswa[sid]) return tagihanSiswa[sid];
      var ob = kewajibanForSiswa(sid).map(function (o) { return { k: o.komponenNama || o.komponenId, p: o.periode, s: sisaObligation(o), hb: !!o.hariBelumDiisi }; }).filter(function (o) { return o.s > 0.5 || o.hb; });
      var per = {}; ob.forEach(function (o) { var x = per[o.k] = per[o.k] || { periode: 0, sisa: 0, hariBelumDiisi: 0 }; x.periode++; x.sisa = r2(x.sisa + o.s); if (o.hb) x.hariBelumDiisi++; });
      return (tagihanSiswa[sid] = { total: r2(ob.reduce(function (s, o) { return s + o.s; }, 0)), perKomponen: per });
    };
    var hitungStatus = function (t, sudah, sisa, ids) {
      if (!t.siswaId && !(perTrx[t.id] || []).length) return 'TERCATAT';
      if (sudah <= 0.5) return 'TERIDENTIFIKASI';
      if (sisa <= 0.5) return 'TERALOKASI';
      if (!OBL_CTX_) return 'TIDAK_DAPAT_DIHITUNG';
      return ids.some(function (sid) { var tb = tagihanTerbuka(sid); return tb && tb.total > 0.5; }) ? 'SEBAGIAN_TERALOKASI' : 'OVERPAYMENT_CREDIT';
    };
    var out = { bacaSaja: true, konteksKewajiban: ctxErr ? ('GAGAL: ' + ctxErr) : 'OK', penerimaan: trx.length, tersimpanVsHitung: {}, ringkasan: { perAlasan: {}, perBulan: {}, perUnit: {}, perKomponenHint: {} }, totalSisa: 0, baris: [] };
    trx.forEach(function (t) {
      var a = perTrx[t.id] || [], sudah = r2(a.reduce(function (s, x) { return s + Number(x.nominal || 0); }, 0)), nominal = r2(t.nominal), sisa = r2(nominal - sudah);
      var ids = []; a.map(function (x) { return x.siswaId; }).concat(t.siswaId ? [t.siswaId] : []).forEach(function (sid) { if (sid && ids.indexOf(sid) === -1) ids.push(sid); });
      var hit = hitungStatus(t, sudah, sisa, ids), simpan = String(t.status || '(kosong)'), key = simpan + ' -> ' + hit;
      out.tersimpanVsHitung[key] = (out.tersimpanVsHitung[key] || 0) + 1;
      if (sisa <= 0.5 && sisa >= -0.5) return;
      var alasan = sisa < -0.5 ? 'ALOKASI_MELEBIHI' : !t.siswaId && !a.length ? 'TANPA_SISWA' : (OBL_CTX_ && ids.some(function (sid) { return !siswaAda[sid]; })) ? 'SISWA_TIDAK_DIKENAL'
        : sudah <= 0.5 ? 'BELUM_DIALOKASI' : !OBL_CTX_ ? 'TIDAK_DAPAT_DIHITUNG' : hit === 'SEBAGIAN_TERALOKASI' ? 'SISA_ADA_TAGIHAN' : 'SISA_TANPA_TAGIHAN';
      var bulan = String(t.tanggal || '').slice(0, 7) || '(kosong)', hint = String(t._komponenHint || '') || '(kosong)', R = out.ringkasan;
      [[R.perAlasan, alasan], [R.perBulan, bulan], [R.perUnit, String(t.unit || '(kosong)')], [R.perKomponenHint, hint]].forEach(function (g) { var x = g[0][g[1]] = g[0][g[1]] || { n: 0, sisa: 0 }; x.n++; x.sisa = r2(x.sisa + sisa); });
      out.totalSisa = r2(out.totalSisa + sisa);
      out.baris.push({ id: t.id, tanggal: String(t.tanggal || '').slice(0, 10), unit: t.unit, nominal: nominal, teralokasi: r2(sudah), sisa: sisa, status: simpan, statusHitung: hit, alasan: alasan,
        siswaId: t.siswaId || '', komponenHint: hint, sumber: t.sumber || '', komponenAlokasi: a.map(function (x) { return x.komponenId + '@' + x.periode; }).slice(0, 6),
        tagihanTerbuka: ids.map(function (sid) { return { siswaId: sid, tagihan: siswaAda[sid] ? tagihanTerbuka(sid) : null }; }) });
    });
  } finally { OBL_CTX_ = prev; }
  if (!cetakLog) return out;
  Logger.log('ltSisaAlokasi RINGKASAN: ' + JSON.stringify({ bacaSaja: out.bacaSaja, konteksKewajiban: out.konteksKewajiban, penerimaan: out.penerimaan, belumPenuh: out.baris.length, totalSisa: out.totalSisa, tersimpanVsHitung: out.tersimpanVsHitung, ringkasan: out.ringkasan }));
  for (var i = 0; i < out.baris.length; i += 15) Logger.log('ltSisaAlokasi BARIS ' + (i + 1) + '-' + Math.min(i + 15, out.baris.length) + ': ' + JSON.stringify(out.baris.slice(i, i + 15)));
  return out;
}

/* [P1_29] LEMBAR CEK SEMENTARA: menyusun SPREADSHEET BARU (terpisah) berisi masalah sisa alokasi untuk dicek satu per satu.
   - Tidak menulis apa pun ke salinan data (05/06/15 dll. hanya dibaca). Spreadsheet baru = alat kerja, BUKAN sumber kebenaran;
     keputusan tetap dimasukkan lewat aplikasi (alokasi/tautan siswa) setelah dicek. Boleh dihapus setelah selesai.
   - Tab: 0_PETUNJUK, 1_TANPA_SISWA, 2_SEBAGIAN, 3_BELUM_DIALOKASI, 4_PERIODE_TANGGAL (baris 06_ALOKASI yang periodenya tersimpan
     sebagai tanggal + periodeAktif 15_SETTINGS).
   - Nama siswa/pengirim DITULIS ke spreadsheet baru (milik akun yang menjalankan, privat) agar dapat dicek, tetapi TIDAK dicetak ke log.
   - "Kandidat siswa" = saran pencocokan nama sederhana (token nama), WAJIB dicek manusia; tidak pernah diterapkan otomatis.
   - Semua sel ditulis sebagai teks biasa (format '@') supaya Sheets tidak mengubah "September 2026" menjadi tanggal. */
var LT_BULAN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function ltTok_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 3 && ['bin', 'binti', 'ananda', 'spp', 'bayar', 'pembayaran', 'siswa'].indexOf(w) === -1; }); }
function ltKandidat_(teks, unit, siswa) {
  var tk = ltTok_(teks); if (!tk.length) return '';
  return siswa.map(function (s) { var sk = ltTok_(s.nama), n = tk.filter(function (w) { return sk.indexOf(w) !== -1; }).length; return { s: s, skor: n / Math.max(tk.length, 1) + (unit && s.unit === unit ? 0.01 : 0), n: n }; })
    .filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.skor - a.skor; }).slice(0, 3)
    .map(function (x) { return x.s.id + ' (' + x.s.nama + ', ' + (x.s.unit || '-') + ' ' + (x.s.kelas || '') + ')'; }).join(' | ');
}
function ltTglTeks_(v, tz) { return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v == null ? '' : v); }
function ltBulanLabel_(d, tz) { var ym = Utilities.formatDate(d, tz, 'yyyy-MM'), m = Number(ym.slice(5, 7)); return m >= 1 && m <= 12 ? LT_BULAN_[m - 1] + ' ' + ym.slice(0, 4) : ''; }
function ltBuatLembarCek() {
  var ss = ltGuard_(), tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  var hasil = ltSisaAlokasiHitung_(false);
  var trxById = {}; sgRowsChecked_('05_TRANSAKSI').forEach(function (t) { trxById[t.id] = t; });
  var siswa = sgRowsChecked_('01_SISWA'), siswaById = {}; siswa.forEach(function (s) { siswaById[s.id] = s; });
  var namaSiswa = function (sid) { var s = siswaById[sid]; return s ? s.nama + ' (' + (s.unit || '-') + ' ' + (s.kelas || '') + ')' : (sid ? 'TIDAK ADA DI 01_SISWA' : ''); };
  var CEK = ['Sudah dicek', 'Siswa yang benar (siswaId)', 'Komponen & periode yang benar', 'Keputusan', 'Catatan pemeriksa'];
  var tab1 = [], tab2 = [], tab3 = [];
  hasil.baris.forEach(function (b) {
    var t = trxById[b.id] || {}, dasar = [b.id, b.tanggal, b.unit, b.nominal, b.teralokasi, b.sisa, b.status, b.komponenHint, String(t.namaPengirim || ''), String(t._siswaNamaSnapshot || ''),
      String(t.catatan || ''), String(t.resiNo || t.ftNumber || ''), String(t.metode || ''), b.sumber, String(t._sourceFile || '') + (t._sourceRow ? ' #' + t._sourceRow : '')];
    var tagihan = b.tagihanTerbuka.map(function (x) { return x.siswaId + ': ' + (x.tagihan ? 'Rp' + x.tagihan.total + ' ' + JSON.stringify(x.tagihan.perKomponen) : 'belum dapat dihitung'); }).join(' | ');
    if (b.alasan === 'TANPA_SISWA') tab1.push(dasar.concat([ltKandidat_(String(t._siswaNamaSnapshot || '') + ' ' + String(t.namaPengirim || '') + ' ' + String(t.catatan || ''), b.unit, siswa), false, '', '', '', '']));
    else if (b.alasan === 'BELUM_DIALOKASI' || b.alasan === 'SISWA_TIDAK_DIKENAL') tab3.push(dasar.concat([b.siswaId, namaSiswa(b.siswaId), b.alasan, tagihan, false, '', '', '', '']));
    else tab2.push(dasar.concat([b.siswaId, namaSiswa(b.siswaId), b.alasan, b.komponenAlokasi.join(', '), tagihan, false, '', '', '', '']));
  });
  /* 4: periode 06_ALOKASI yang tersimpan sebagai tanggal (dibaca mentah; sgRowsChecked_ dapat menyamarkan tipe) */
  var tab4 = [], sh6 = ss.getSheetByName('06_ALOKASI');
  if (sh6 && sh6.getLastRow() >= 2) {
    var h6 = sh6.getRange(1, 1, 1, sh6.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }), v6 = sh6.getRange(2, 1, sh6.getLastRow() - 1, sh6.getLastColumn()).getValues();
    var c = function (k) { return h6.indexOf(k); };
    v6.forEach(function (r, i) {
      var p = r[c('periode')]; if (Object.prototype.toString.call(p) !== '[object Date]') return;
      var t = trxById[String(r[c('transaksiId')])] || {};
      tab4.push(['06_ALOKASI', i + 2, String(r[c('id')]), String(r[c('transaksiId')]), String(t.tanggal || '').slice(0, 10), String(r[c('siswaId')]), namaSiswa(String(r[c('siswaId')])), String(r[c('komponenId')]),
        ltTglTeks_(p, tz), ltBulanLabel_(p, tz), Number(r[c('nominal')] || 0), c('archivedAt') === -1 ? '' : ltTglTeks_(r[c('archivedAt')], tz), false, '', '', '']);
    });
  }
  var sh15 = ss.getSheetByName('15_SETTINGS'), pa = null;
  if (sh15 && sh15.getLastRow() >= 2) { var h15 = sh15.getRange(1, 1, 1, sh15.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
    sh15.getRange(2, 1, sh15.getLastRow() - 1, sh15.getLastColumn()).getValues().forEach(function (r, i) { if (String(r[h15.indexOf('key')]).trim() === 'periodeAktif') pa = { baris: i + 2, nilai: r[h15.indexOf('value')] }; }); }
  if (pa && !/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/.test(String(pa.nilai)))
    tab4.unshift(['15_SETTINGS', pa.baris, 'periodeAktif', '', '', '', '', '', ltTglTeks_(pa.nilai, tz), Object.prototype.toString.call(pa.nilai) === '[object Date]' ? ltBulanLabel_(pa.nilai, tz) : '(tentukan)', '', '', false, '', 'Perbaiki lewat opPeriodeAktifPlan -> opPeriodeAktifApply (beraudit)', '']);
  var D = ['transaksiId', 'tanggal', 'unit', 'nominal', 'teralokasi', 'sisa', 'status tersimpan', 'komponen (hint impor)', 'nama pengirim', 'nama siswa (snapshot impor)', 'catatan', 'resi/FT', 'metode', 'sumber', 'berkas sumber'];
  var tabs = [
    ['1_TANPA_SISWA', D.concat(['Kandidat siswa (SARAN, wajib dicek)']).concat(CEK), tab1],
    ['2_SEBAGIAN', D.concat(['siswaId', 'siswa', 'alasan', 'alokasi sekarang (komponen@periode)', 'tagihan terbuka siswa']).concat(CEK), tab2],
    ['3_BELUM_DIALOKASI', D.concat(['siswaId', 'siswa', 'alasan', 'tagihan terbuka siswa']).concat(CEK), tab3],
    ['4_PERIODE_TANGGAL', ['sheet', 'baris', 'alokasiId', 'transaksiId', 'tanggal transaksi', 'siswaId', 'siswa', 'komponenId', 'periode tersimpan (tanggal)', 'usulan label', 'nominal', 'archivedAt', 'Sudah dicek', 'Label yang benar', 'Keputusan', 'Catatan pemeriksa'], tab4]
  ];
  var now = new Date(), nama = 'SEMENTARA_CEK_SISA_ALOKASI_' + Utilities.formatDate(now, tz, 'yyyyMMdd_HHmm');
  var baru = SpreadsheetApp.create(nama);
  if (baru.getId() === LT_PROD_ID_ || baru.getId() === ss.getId()) throw new Error('LEMBAR CEK DIBATALKAN: tujuan bukan spreadsheet baru');
  var petunjuk = [['LEMBAR CEK SEMENTARA - bukan sumber kebenaran. Dibuat ' + Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm') + ' dari salinan "' + ss.getName() + '" (' + ss.getId() + ').'],
    ['Data asli TIDAK diubah. Keputusan yang dicatat di sini diterapkan lewat aplikasi (tautkan siswa / alokasi) atau perbaikan beraudit, setelah disetujui.'],
    ['Konteks kewajiban: ' + hasil.konteksKewajiban], ['Total belum teralokasi penuh: ' + hasil.baris.length + ' transaksi, sisa Rp' + hasil.totalSisa],
    ['1_TANPA_SISWA (' + tab1.length + '): pembayaran tanpa siswa. Isi siswaId yang benar. Kolom kandidat hanya saran pencocokan nama.'],
    ['2_SEBAGIAN (' + tab2.length + '): sudah sebagian dialokasikan, masih ada sisa. Isi komponen/periode untuk sisa, atau tandai kelebihan bayar.'],
    ['3_BELUM_DIALOKASI (' + tab3.length + '): siswa diketahui, belum ada alokasi.'],
    ['4_PERIODE_TANGGAL (' + tab4.length + '): periode tersimpan sebagai tanggal (bukan "Bulan Tahun"); alokasi ini tidak cocok dengan tagihan sampai dinormalisasi.'],
    ['Kolom "tagihan terbuka" baru terisi setelah periodeAktif dinormalisasi; jalankan ulang ltBuatLembarCek() setelah itu (membuat lembar baru).'],
    ['Hapus spreadsheet ini setelah pengecekan selesai.']];
  var s0 = baru.getSheets()[0]; s0.setName('0_PETUNJUK'); s0.getRange(1, 1, petunjuk.length, 1).setValues(petunjuk);
  var ringkas = {};
  tabs.forEach(function (tb) {
    var sh = baru.insertSheet(tb[0]), data = [tb[1]].concat(tb[2]), nc = tb[1].length, ic = tb[1].indexOf('Sudah dicek');
    data = data.map(function (r) { return r.map(function (v, j) { return j === ic && typeof v === 'boolean' ? v : (v === null || v === undefined ? '' : (typeof v === 'number' ? v : String(v))); }); });
    sh.getRange(1, 1, Math.max(data.length, 2), nc).setNumberFormat('@');
    if (tb[2].length) { var numCols = ['nominal', 'teralokasi', 'sisa', 'baris']; numCols.forEach(function (k) { var j = tb[1].indexOf(k); if (j !== -1) sh.getRange(2, j + 1, tb[2].length, 1).setNumberFormat('#,##0'); }); }
    sh.getRange(1, 1, data.length, nc).setValues(data);
    sh.getRange(1, 1, 1, nc).setFontWeight('bold').setBackground('#e8eaed');
    if (tb[2].length) sh.getRange(2, ic + 1, tb[2].length, 1).insertCheckboxes();
    sh.setFrozenRows(1);
    ringkas[tb[0]] = tb[2].length;
  });
  try { var it = DriveApp.getFileById(ss.getId()).getParents(); if (it.hasNext()) DriveApp.getFileById(baru.getId()).moveTo(it.next()); } catch (e) { ringkas.catatanFolder = 'tetap di My Drive (folder salinan tidak dapat dibuka)'; }
  return ltLog_('ltBuatLembarCek', { dataAsliDiubah: false, url: baru.getUrl(), nama: nama, baris: ringkas, konteksKewajiban: hasil.konteksKewajiban });
}
