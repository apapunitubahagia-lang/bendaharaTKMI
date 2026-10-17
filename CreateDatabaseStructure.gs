/**
 * CreateDatabaseStructure.gs
 * Migrasi Bendahara_V2_FULL_DATA.html -> Google Sheets (Fase 2 - STRUKTUR SAJA)
 *
 * TIDAK mengubah Bendahara_V2_FULL_DATA.html.
 * TIDAK mengimpor data HTML (itu Fase 3a - MigrationOneTime.gs, belum dibuat).
 * TIDAK membuat data dummy.
 * TIDAK membuat business logic transaksi (postTransaksi/createAlokasi dll - itu Fase 3b/3c).
 * TIDAK membuat frontend.
 *
 * Cara pakai:
 * 1. Buka Google Sheets (boleh spreadsheet baru kosong, boleh spreadsheet existing).
 * 2. Extensions > Apps Script.
 * 3. Hapus isi Code.gs default, tempel SELURUH isi file ini.
 * 4. Jalankan fungsi setupDatabaseStructure() (pilih dari dropdown fungsi, klik Run).
 * 5. Izinkan permission saat diminta (akses ke spreadsheet ini saja).
 * 6. Jalankan validateDatabaseStructure() untuk melihat laporan status.
 *
 * Aman dijalankan berkali-kali (idempotent) - lihat catatan di setiap fungsi.
 */

/* ============================================================
   SCHEMA DEFINISI SHEET (15 CORE SHEET asli Fase 2 + 8 sheet
   tambahan Fase 3B-1: 16_REKONSILIASI..23_TAHUN_AJARAN, ditemukan
   lewat audit data model penuh terhadap Store di HTML MASTER)
   Setiap header field dipetakan LANGSUNG dari nama field yang sudah
   dipakai Bendahara_V2_FULL_DATA.html (Store.loadX()) - lihat laporan
   mapping Fase 0. Kolom TIDAK disederhanakan/dibuang supaya reconciliation
   Fase 3a/5 nanti bisa membandingkan field-per-field tanpa kehilangan data.

   Setiap entri sheet berisi:
   - headers: urutan kolom persis seperti akan ditulis di baris 1
   - primaryKey: nama kolom PK (selalu stable ID string, BUKAN nomor baris)
   - foreignKeys: {kolom: "SHEET_TUJUAN.kolom"} - didokumentasikan di sini,
     divalidasi di validateDatabaseStructure(), TIDAK dipaksakan oleh Sheets
     sendiri (Sheets tidak punya FK constraint native - penegakan referensial
     baru terjadi di Apps Script service layer, Fase 3b/3c)
   - statusField: nama kolom status/enum, kalau ada
   - statusValues: nilai enum yang valid (dipakai untuk data validation dropdown)
   - notes: catatan arsitektur penting per sheet
   ============================================================ */
var DB_SCHEMA = [
  {
    name: '01_SISWA',
    headers: ['id','nama','nis','nisn','kelas','unit','tahunAjaran','jenisKelamin','waliId','namaWali','kontakWali','tanggalMasuk','tanggalKeluar','status'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'unit harus TK atau MI. nis/nisn idealnya unik untuk siswa Aktif (dicek di validateDatabaseStructure, TIDAK di-enforce keras karena data historis pernah punya kasus NIS kosong).'
  },
  {
    name: '02_KOMPONEN',
    headers: ['id','nama','unit','frekuensi','status','aliasOf'],
    primaryKey: 'id',
    foreignKeys: { aliasOf: '02_KOMPONEN.id' },
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'frekuensi: Bulanan/Tahunan/SekaliBayar. aliasOf dipakai untuk kasus seperti kmp_ketering -> kmp_catering (komponen non-aktif yang dialihkan, BUKAN dihapus).'
  },
  {
    name: '03_TARIF',
    headers: ['id','komponenId','unit','kelas','tahunAjaran','nominal','status'],
    primaryKey: 'id',
    foreignKeys: { komponenId: '02_KOMPONEN.id' },
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'kelas/tahunAjaran boleh kosong (wildcard) - baris paling spesifik yang menang saat lookup (logika tarifFor() tetap di Apps Script, bukan di sini).'
  },
  {
    name: '04_KEWAJIBAN',
    headers: ['id','siswaId','komponenId','periode','bruto','potongan','netto','tagihanId','computedAt'],
    primaryKey: 'id',
    foreignKeys: { siswaId: '01_SISWA.id', komponenId: '02_KOMPONEN.id' },
    statusField: null,
    statusValues: [],
    notes: 'COMPUTED VIEW / CACHE - BUKAN sumber kebenaran (constraint #3). Dibuat KOSONG (header saja) di Fase 2. Baris hanya diisi Apps Script sebagai cache opsional kalau benchmark Fase 3 membuktikan perlu; kewajiban tetap dihitung on-the-fly dari 01_SISWA+02_KOMPONEN+03_TARIF+periode+keringanan-alokasi.'
  },
  {
    name: '05_TRANSAKSI',
    headers: ['id','jenis','tanggal','unit','nominal','akunId','metode','status','createdAt','catatan','sumber','siswaId','_siswaNamaSnapshot','_komponenHint','resiNo','kategori','subkategori','penerima','ftNumber','namaPengirim','_sourceFile','_sourceSheet','_sourceRow'],
    primaryKey: 'id',
    foreignKeys: { akunId: '07_AKUN.id', siswaId: '01_SISWA.id', _komponenHint: '02_KOMPONEN.id' },
    statusField: 'status',
    statusValues: ['TERCATAT','TERIDENTIFIKASI','SEBAGIAN_TERALOKASI','TERALOKASI','OVERPAYMENT_CREDIT','SELESAI','REKONSILIASI'],
    notes: 'satu-satunya pintu tulis nanti tetap postTransaksi() di Apps Script (Fase 3b) - sheet ini TIDAK ditulis langsung dari frontend. siswaId/_komponenHint boleh kosong (belum teridentifikasi) - itu bukan error data.'
  },
  {
    name: '06_ALOKASI',
    headers: ['id','transaksiId','siswaId','komponenId','periode','nominal','caraBayar','tagihanId','createdAt'],
    primaryKey: 'id',
    foreignKeys: { transaksiId: '05_TRANSAKSI.id', siswaId: '01_SISWA.id', komponenId: '02_KOMPONEN.id' },
    statusField: null,
    statusValues: [],
    notes: 'nominal harus > 0 (divalidasi Apps Script saat tulis, Fase 3b). caraBayar termasuk nilai "historis" untuk data yang direkonstruksi dari migrasi (tidak menebak cara bayar asli).'
  },
  {
    name: '07_AKUN',
    headers: ['id','nama','jenis','saldoAwal'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'jenis',
    statusValues: ['Kas','Bank'],
    notes: 'jenis menentukan resolver Kas vs Bank (dipakai validasi Transfer Bank tidak masuk akun Kas).'
  },
  {
    name: '08_ANGGARAN',
    headers: ['id','periode','program','kategori','unit','nominal','source','sourceFile','sourceRow','importBatchId'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'source',
    statusValues: ['MANUAL','RAB_IMPORT'],
    notes: 'RAB hasil import tetap masuk sheet ini (bukan sheet RKAT terpisah) - sesuai prinsip HTML asal "jangan buat tabel baru kalau yang lama bisa dipakai".'
  },
  {
    name: '09_KOMITMEN',
    headers: ['id','uraian','nominal','status','rabId','tanggal'],
    primaryKey: 'id',
    foreignKeys: { rabId: '08_ANGGARAN.id' },
    statusField: 'status',
    statusValues: ['EXPECTED','COMMITTED','INCURRED','PAID'],
    notes: 'DIPERBAIKI Fase 3B-1 (audit menemukan skema asli salah): sumber sebenarnya adalah Store.loadObligasi() di HTML, BUKAN Store.loadKomitmen() (fungsi itu tidak pernah ada). Field asli: id,uraian,nominal,status,rabId,tanggal - TIDAK ADA field jatuhTempo (dikarang di desain awal, sudah dibuang). rabId = FK opsional ke 08_ANGGARAN (RAB terkait, boleh kosong). ObligasiSekolah - komitmen sekolah ke pihak lain, BEDA dari kewajiban siswa (04_KEWAJIBAN). Tidak pernah otomatis membuat baris di 05_TRANSAKSI.'
  },
  {
    name: '10_BUKTI',
    headers: ['id','kategori','transaksiId','judul','tanggal','driveFileId','driveFileUrl','fileRef'],
    primaryKey: 'id',
    foreignKeys: { transaksiId: '05_TRANSAKSI.id' },
    statusField: null,
    statusValues: [],
    notes: 'DIPERBAIKI Fase 3B-1: kolom fileRef ditambahkan sebagai STAGING untuk isi Base64 asli dari Store.loadDokumen() (field fileRef di HTML) - supaya migrasi Dokumen tidak diam-diam kehilangan isi file sebelum integrasi Drive dibangun. driveFileId/driveFileUrl TETAP ada (dipertahankan) untuk diisi Apps Script setelah upload ke Drive terjadi (tahap migrasi terpisah, belum di Fase 3B-1). fileRef TIDAK PERNAH dihapus/diubah isinya oleh proses upload Drive nanti - hanya dibaca.'
  },
  {
    name: '11_MUTASI_BANK',
    headers: ['id','tanggal','nominal','keterangan','namaPengirim','ftNumber','status','transaksiId'],
    primaryKey: 'id',
    foreignKeys: { transaksiId: '05_TRANSAKSI.id' },
    statusField: 'status',
    statusValues: ['BELUM_DIPROSES','DIPROSES'],
    notes: 'Staging rekonsiliasi - TERPISAH dari 05_TRANSAKSI supaya tidak double count (prinsip yang sama dengan HTML asal).'
  },
  {
    name: '12_DUP_REVIEW',
    headers: ['id','pairKey','trxId1','trxId2','status','decidedAt','decidedBy'],
    primaryKey: 'id',
    foreignKeys: { trxId1: '05_TRANSAKSI.id', trxId2: '05_TRANSAKSI.id' },
    statusField: 'status',
    statusValues: ['VALID','DUPLIKAT','PERLU_VERIFIKASI'],
    notes: 'Keputusan manual bendahara atas kandidat duplikat - TIDAK PERNAH menghapus/mengubah baris di 05_TRANSAKSI. pairKey harus unik (dicek validateDatabaseStructure sebagai catatan, bukan constraint Sheets).'
  },
  {
    name: '13_AUDIT_LOG',
    headers: ['id','timestamp','aksi','before','after','sumber','refId'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: null,
    statusValues: [],
    notes: 'Append-only. before/after disimpan sebagai JSON string (stringify sebelum tulis, parse saat baca) - sama seperti auditTrailPush() di HTML asal.'
  },
  {
    name: '14_KPI',
    headers: ['id','periode','kpiKode','indikatorKode','skor','status','computedAt'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: null,
    statusValues: [],
    notes: 'COMPUTED VIEW / CACHE - BUKAN sumber kebenaran (constraint #4). Dibuat KOSONG di Fase 2. Kalau nanti dipakai sbg cache, WAJIB invalidation jelas di titik tulis 05_TRANSAKSI/06_ALOKASI (Fase 3c) - tidak boleh ada baris basi tanpa mekanisme refresh.'
  },
  {
    name: '15_SETTINGS',
    headers: ['key','value','updatedAt'],
    primaryKey: 'key',
    foreignKeys: {},
    statusField: null,
    statusValues: [],
    notes: 'Key-value, satu baris per setting (periodeAktif, tahunAjaranAktif, dataRepairVersion, docSeqCounters, namaBendahara, dll - pengganti objek settings tunggal di HTML). value disimpan sebagai JSON string kalau bukan primitif.'
  },
  /* ============================================================
     Sheet 16-23 DITAMBAHKAN Fase 3B-1 (audit gap model data menemukan
     8 koleksi Store nyata yang tidak pernah punya sheet sama sekali:
     Rekonsiliasi, Laporan, Rkat, Lpj, dan 4 master kategori/subkategori/
     tahun ajaran). Tidak mengubah/menghapus definisi 01-15 di atas.
     ============================================================ */
  {
    name: '16_REKONSILIASI',
    headers: ['id','akunId','periode','saldoSistem','saldoAktual','selisih','catatan','status','verifiedBy','verifiedAt','createdAt'],
    primaryKey: 'id',
    foreignKeys: { akunId: '07_AKUN.id' },
    statusField: 'status',
    statusValues: ['OPEN','PERLU_PENJELASAN','SELESAI'],
    notes: 'Sumber: Store.loadRekonsiliasi(). Rekonsiliasi saldo sistem vs saldo aktual per akun per periode. selisih!=0 WAJIB catatan terisi (divalidasi di frontend saat ini, sama aturannya harus dipertahankan kalau nanti ada write-door Apps Script).'
  },
  {
    name: '17_LAPORAN',
    headers: ['id','periode','tanggalDibuat','dibuatOleh','snapshot'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: null,
    statusValues: [],
    notes: 'Sumber: Store.loadLaporan(). Laporan bulanan resmi - snapshot DIBEKUKAN dari ledger saat dikirim (buildLaporanSnapshot()), disimpan sebagai JSON string (objek besar, sama pola dengan before/after di 13_AUDIT_LOG). Satu baris per periode (idx by periode di kode asal).'
  },
  {
    name: '18_RKAT',
    headers: ['id','tahun','tahunAjaran','unit','bidang','program','kegiatan','kategori','subkategori','uraian','sumberDana','volume','satuan','hargaSatuan','pagu','keterangan','status','sourceFile','sourceSheet','sourceRow','importBatchId','importDate','importUser'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'status',
    statusValues: ['PLANNED'],
    notes: 'Sumber: Store.loadRkat(). Rencana Kegiatan Anggaran Tahunan (sisi PERENCANAAN) - KOLEKSI TERPISAH dari 08_ANGGARAN (85 record, id prefix imp_rab_) meskipun catatan desain Fase 2 sebelumnya mengasumsikan RAB import sudah tercakup di situ. Audit Fase 3B-1 membuktikan itu SALAH: Rkat (174 record, id prefix imp_rkat_) adalah data historis nyata yang independen, field/ID tidak overlap dengan 08_ANGGARAN. kategori/subkategori di sini adalah TEKS BEBAS dari file sumber Excel, BUKAN FK ke 20_KATEGORI_PENGELUARAN/22_SUBKATEGORI (tidak dipaksakan sama).'
  },
  {
    name: '19_LPJ',
    headers: ['id','tanggal','unit','kategori','subkategori','item','volume','satuan','diskon','nominal','status','transaksiId','sourceFile','sourceSheet','sourceRow','importBatchId','importDate','importUser'],
    primaryKey: 'id',
    foreignKeys: { transaksiId: '05_TRANSAKSI.id' },
    statusField: 'status',
    statusValues: ['REALIZATION'],
    notes: 'Sumber: Store.loadLpj(). Laporan Pertanggungjawaban (sisi REALISASI dari Rkat) - lapisan detail/kategorisasi RAB di ATAS transaksi PENGELUARAN yang SAMA persis (total nominal Lpj == total pengeluaran 05_TRANSAKSI: Rp61.553.117, 200 baris == 200 PENGELUARAN). BUKAN uang baru/terpisah - migrasi sheet ini TIDAK menambah nominal pengeluaran, hanya menambah anotasi kategori RAB per transaksi lewat transaksiId. FK transaksiId->05_TRANSAKSI WAJIB valid (0 broken FK ditemukan saat audit).'
  },
  {
    name: '20_KATEGORI_PENERIMAAN',
    headers: ['id','kode','kategori','status'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'Sumber: Store.loadKategoriPenerimaanMaster(). Master kategori transaksi PENERIMAAN - dipakai sebagai sumber dropdown (settings.kategoriPenerimaanList adalah CACHE turunan dari sini, disinkron via kode terpisah, bukan sumber independen).'
  },
  {
    name: '21_KATEGORI_PENGELUARAN',
    headers: ['id','kode','kategori','status'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'Sumber: Store.loadKategoriPengeluaranMaster(). Master kategori transaksi PENGELUARAN - sama pola dengan 20_KATEGORI_PENERIMAAN (settings.kategoriPengeluaranList adalah cache turunan).'
  },
  {
    name: '22_SUBKATEGORI',
    headers: ['id','kategoriId','nama','status'],
    primaryKey: 'id',
    foreignKeys: { kategoriId: '20_KATEGORI_PENERIMAAN.id atau 21_KATEGORI_PENGELUARAN.id (union - lihat catatan)' },
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'Sumber: Store.loadSubkategoriMaster(). FK kategoriId TIDAK exclusive ke satu sheet - divalidasi terhadap GABUNGAN id 20_KATEGORI_PENERIMAAN + 21_KATEGORI_PENGELUARAN (0 broken FK ditemukan saat audit dengan aturan union ini). Apps Script Fase 3B berikutnya WAJIB pakai aturan union yang sama saat validasi, jangan asumsikan FK ke satu sheet saja.'
  },
  {
    name: '23_TAHUN_AJARAN',
    headers: ['id','label','status'],
    primaryKey: 'id',
    foreignKeys: {},
    statusField: 'status',
    statusValues: ['Aktif','Nonaktif'],
    notes: 'Sumber: Store.loadTahunAjaranMaster(). label contoh: "2026/2027".'
  }
];

var HEADER_ROW = 1;
var HEADER_BG_COLOR = '#1F3864';
var HEADER_FONT_COLOR = '#FFFFFF';

/* ============================================================
   setupDatabaseStructure()
   WAJIB idempotent:
   - sheet yang sudah ada TIDAK dihapus/dibuat ulang
   - header yang sudah ada TIDAK ditimpa/dihapus - hanya kolom header yang
     BELUM ada yang ditambahkan di ujung kanan header existing
   - data di bawah baris header TIDAK pernah disentuh
   - dipanggil berkali-kali menghasilkan struktur akhir yang SAMA
   ============================================================ */
/* [P0-C] Diprivatkan (akhiran _): fungsi ini MEMBUAT/MENGUBAH sheet dan sebelumnya dapat dipanggil siapa pun lewat
   google.script.run. Jalankan hanya dari editor Apps Script pada spreadsheet UJI, lewat fungsi pembungkus sementara. */
function setupDatabaseStructure_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];

  DB_SCHEMA.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    var created = false;
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      created = true;
    }

    var headersAdded = ensureHeaders_(sheet, def.headers);
    formatHeaderRow_(sheet, def.headers.length);
    applyHeaderFilter_(sheet, def.headers.length);
    applyStatusValidation_(sheet, def);
    autoResizeReasonable_(sheet, def.headers.length);
    sheet.setFrozenRows(HEADER_ROW);

    log.push({
      sheet: def.name,
      created: created,
      headersAdded: headersAdded
    });
  });

  reorderSheets_(ss);

  Logger.log(JSON.stringify(log, null, 2));
  SpreadsheetApp.getUi().alert(
    'setupDatabaseStructure() selesai.\n\n' +
    DB_SCHEMA.length + ' sheet diproses.\n' +
    'Lihat View > Logs untuk detail per-sheet (dibuat baru / header ditambahkan).'
  );
  return log;
}

/* Menambahkan HANYA header yang belum ada, tanpa menyentuh kolom yang
   sudah ada (baik urutan maupun isi). Kalau baris header masih kosong
   sama sekali, tulis seluruh headers[] apa adanya. Kalau sudah ada
   sebagian, kolom baru ditambahkan di ujung kanan - urutan existing
   TIDAK diubah supaya referensi kolom yang sudah dipakai (mis. formula
   atau script lama) tidak rusak. */
function ensureHeaders_(sheet, headers) {
  var lastCol = sheet.getLastColumn();
  var existing = lastCol > 0 ? sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0] : [];
  var existingTrimmed = existing.map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v !== ''; });

  if (existingTrimmed.length === 0) {
    sheet.getRange(HEADER_ROW, 1, 1, headers.length).setValues([headers]);
    return headers.slice();
  }

  var existingSet = {};
  existingTrimmed.forEach(function (h) { existingSet[h] = true; });

  var missing = headers.filter(function (h) { return !existingSet[h]; });
  if (missing.length > 0) {
    var startCol = existingTrimmed.length + 1;
    sheet.getRange(HEADER_ROW, startCol, 1, missing.length).setValues([missing]);
  }
  return missing;
}

function formatHeaderRow_(sheet, colCount) {
  var currentLastCol = Math.max(colCount, sheet.getLastColumn());
  var range = sheet.getRange(HEADER_ROW, 1, 1, currentLastCol);
  range.setFontWeight('bold');
  range.setBackground(HEADER_BG_COLOR);
  range.setFontColor(HEADER_FONT_COLOR);
  range.setVerticalAlignment('middle');
}

/* Filter pada header - aman dipanggil berkali-kali: kalau filter sudah
   ada di sheet ini, biarkan (removeFilter+create ulang HANYA kalau
   rentangnya perlu diperluas karena kolom baru ditambahkan). */
function applyHeaderFilter_(sheet, colCount) {
  var currentLastCol = Math.max(colCount, sheet.getLastColumn());
  var lastRow = Math.max(HEADER_ROW, sheet.getLastRow());
  var existingFilter = sheet.getFilter();
  if (existingFilter) {
    var range = existingFilter.getRange();
    if (range.getLastColumn() >= currentLastCol) return; // sudah cukup luas
    existingFilter.remove();
  }
  sheet.getRange(HEADER_ROW, 1, lastRow - HEADER_ROW + 1, currentLastCol).createFilter();
}

/* Data validation dropdown dasar untuk kolom status/enum - hanya
   diterapkan ke kolom di BAWAH header (baris 2 s/d batas wajar 1000),
   tidak pernah menimpa isi kolom yang sudah ada. */
function applyStatusValidation_(sheet, def) {
  if (!def.statusField || !def.statusValues || def.statusValues.length === 0) return;
  var colIndex = def.headers.indexOf(def.statusField) + 1;
  if (colIndex <= 0) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(def.statusValues, true)
    .setAllowInvalid(true) // jangan blokir data historis/migrasi yang mungkin di luar daftar - hanya beri peringatan visual
    .build();
  sheet.getRange(HEADER_ROW + 1, colIndex, 999, 1).setDataValidation(rule);
}

function autoResizeReasonable_(sheet, colCount) {
  var currentLastCol = Math.max(colCount, sheet.getLastColumn());
  try {
    sheet.autoResizeColumns(1, currentLastCol);
    for (var c = 1; c <= currentLastCol; c++) {
      var w = sheet.getColumnWidth(c);
      if (w > 260) sheet.setColumnWidth(c, 260); // batas wajar, kolom JSON (before/after/potongan) jangan melebar berlebihan
      if (w < 70) sheet.setColumnWidth(c, 70);
    }
  } catch (e) {
    Logger.log('autoResize gagal untuk ' + sheet.getName() + ': ' + e.message);
  }
}

/* Urutan tab 01-15 sesuai DB_SCHEMA - dipanggil ulang tiap run supaya
   tetap konsisten walau ada sheet lain (di luar 15 ini) yang disisipkan
   manual oleh user; sheet non-schema TIDAK dipindah/disentuh. */
function reorderSheets_(ss) {
  DB_SCHEMA.forEach(function (def, idx) {
    var sheet = ss.getSheetByName(def.name);
    if (sheet) ss.setActiveSheet(sheet);
    if (sheet) ss.moveActiveSheet(idx + 1);
  });
}

/* ============================================================
   validateDatabaseStructure()
   READ-ONLY. Tidak mengubah apapun. Melaporkan:
   - sheet ada/tidak
   - header lengkap/tidak (dan kolom mana yang hilang/kolom asing tambahan)
   - duplicate header dalam satu sheet
   - primary key terdefinisi (ada di header) atau tidak
   ============================================================ */
function validateDatabaseStructure() {
  // [P0-C] hanya pengguna terotorisasi (baca)
  if (typeof opGate_ === 'function') { var g0 = opGate_(OP_READ_ROLES_); if (!g0.ok) return g0; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  var allOk = true;

  DB_SCHEMA.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    var entry = {
      sheet: def.name,
      exists: !!sheet,
      headerComplete: false,
      missingHeaders: [],
      unexpectedExtraHeaders: [],
      duplicateHeaders: [],
      primaryKeyDefined: false
    };

    if (!sheet) {
      allOk = false;
      report.push(entry);
      return;
    }

    var lastCol = sheet.getLastColumn();
    var existing = lastCol > 0 ? sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0] : [];
    var existingTrimmed = existing.map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v !== ''; });

    entry.missingHeaders = def.headers.filter(function (h) { return existingTrimmed.indexOf(h) === -1; });
    entry.unexpectedExtraHeaders = existingTrimmed.filter(function (h) { return def.headers.indexOf(h) === -1; });
    entry.headerComplete = entry.missingHeaders.length === 0;

    var seen = {};
    existingTrimmed.forEach(function (h) {
      seen[h] = (seen[h] || 0) + 1;
    });
    entry.duplicateHeaders = Object.keys(seen).filter(function (h) { return seen[h] > 1; });

    entry.primaryKeyDefined = existingTrimmed.indexOf(def.primaryKey) !== -1;

    if (!entry.headerComplete || entry.duplicateHeaders.length > 0 || !entry.primaryKeyDefined) {
      allOk = false;
    }

    report.push(entry);
  });

  var summaryLines = report.map(function (e) {
    var status = !e.exists ? 'TIDAK ADA'
      : (e.headerComplete && e.duplicateHeaders.length === 0 && e.primaryKeyDefined ? 'OK' : 'PERLU DICEK');
    var detail = [];
    if (e.exists && e.missingHeaders.length) detail.push('header hilang: ' + e.missingHeaders.join(', '));
    if (e.exists && e.duplicateHeaders.length) detail.push('header duplikat: ' + e.duplicateHeaders.join(', '));
    if (e.exists && !e.primaryKeyDefined) detail.push('primary key TIDAK terdefinisi');
    if (e.exists && e.unexpectedExtraHeaders.length) detail.push('kolom tambahan di luar skema: ' + e.unexpectedExtraHeaders.join(', '));
    return e.sheet + ' : ' + status + (detail.length ? ' (' + detail.join(' | ') + ')' : '');
  });

  Logger.log(JSON.stringify(report, null, 2));
  SpreadsheetApp.getUi().alert(
    'validateDatabaseStructure()\n\n' +
    (allOk ? 'SEMUA 15 SHEET OK.\n\n' : 'ADA YANG PERLU DICEK:\n\n') +
    summaryLines.join('\n')
  );
  return { allOk: allOk, report: report };
}
