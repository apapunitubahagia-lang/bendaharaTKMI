/**
 * ImportRules.gs - DIHASILKAN oleh _build_tests/build_import_rules.js dari _import_rules.js. JANGAN DIEDIT TANGAN.
 * Aturan validasi impor massal bersama (server = otoritas; klien memakai salinan identik untuk UX).
 */
/* IMPORT RULES CORE - [P1-IMP] kode IDENTIK dipakai server (ImportEngine.gs, OTORITAS) dan klien (Bendahara_V2.html, UX saja).
   Murni: tidak menyentuh DOM, Store, Sheets. ES5. Keputusan D-IMP-1..8 (19-10-2026), rancangan P1_16 §2-§5.
   - Normalisasi nilai SELALU dilaporkan (impNormalisasi): tanggal DD/MM/YYYY, serial Excel, angka berpemisah, metode alias.
   - TIDAK ADA default diam-diam untuk pilihan wajib (akun, kategori, metode, unit, sumber, periode RAB, tahun ajaran siswa):
     nilai kosong / tidak dikenal -> PERLU_KEPUTUSAN; keputusan pengguna dikirim eksplisit per baris (opts.keputusan[i]).
   - Kelas baris: VALID | PERINGATAN (boleh diimpor) | PERLU_KEPUTUSAN | DUPLIKAT | TOLAK | SUDAH_ADA (siswa); bendera
     sudahTersimpan (kunci baris sudah tersimpan dari berkas yang sama) dilaporkan terpisah dan TIDAK mengubah kelas (planHash stabil).
   - Kunci baris = H(modul|sourceHash|isi baris) + '_' + kemunculan ke-n isi yang sama dalam berkas -> idempotensi lintas percobaan.
   - Duplikat: (a) isi identik di dalam berkas (kemunculan ke-2 dst), (b) sidik jari terhadap data server (transaksi: tanggal +
     nominal + minimal satu teks pengenal sama; tanggal + nominal saja = PERINGATAN, bukan duplikat), (c) isi yang sama pernah
     tersimpan dari berkas LAIN (riwayat log impor). DUPLIKAT hanya diimpor bila keputusan terimaDuplikat = true.
   D (konteks) disiapkan pemanggil: akun, kategoriPengeluaran, subkategori, kategoriPenerimaan, siswa, komponen, transaksi,
   anggaran, lpj (TANPA data yang dibuat batch ini), kolom {modul: header sheet live}, tahunAjaranAktif, riwayatIsi {hashIsi:[sourceHash]},
   sudahTersimpan {kunci:true}, kewajiban(siswaId) -> [{key, komponenId, periode, sisa, tagihanId}] atau null (klien: diperiksa server). */
var IMP_MODUL_ = ['pemasukan', 'pengeluaran', 'rab', 'lpj', 'siswa'];
var IMP_KELAS_IMPOR_ = ['VALID', 'PERINGATAN'];
var IMP_METODE_ = { pemasukan: ['Tunai', 'Transfer Bank'], pengeluaran: ['Tunai', 'Transfer Bank', 'Lainnya'] };
var IMP_METODE_ALIAS_ = { 'tunai': 'Tunai', 'cash': 'Tunai', 'transfer bank': 'Transfer Bank', 'transfer': 'Transfer Bank', 'tf': 'Transfer Bank', 'lainnya': 'Lainnya' };
var IMP_BULAN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
/* Kolom kanonik per modul (templat & pemetaan). 'komponen:<id>' (pemasukan) = kolom nominal per komponen. */
var IMP_FIELDS_ = {
  pemasukan: ['tanggal', 'unit', 'nominal', 'cash', 'transfer', 'akun', 'metode', 'sumber', 'nis', 'nisn', 'namaSiswa', 'kelas', 'komponen', 'periodeKomponen', 'ftNumber', 'namaPengirim', 'uraian'],
  pengeluaran: ['tanggal', 'unit', 'nominal', 'akun', 'metode', 'kategori', 'subkategori', 'penerima', 'uraian', 'qty', 'hargaSatuan', 'diskon'],
  rab: ['periode', 'jenis', 'unit', 'kategori', 'subkategori', 'program', 'nominal', 'volume', 'satuan', 'hargaSatuan', 'status'],
  lpj: ['tanggal', 'unit', 'kategori', 'subkategori', 'item', 'volume', 'satuan', 'hargaSatuan', 'diskon', 'nominal', 'transaksiId', 'lpjDokId'],
  siswa: ['nama', 'unit', 'kelas', 'nis', 'nisn', 'tahunAjaran', 'tanggalMasuk', 'tanggalKeluar', 'jenisKelamin', 'namaWali', 'kontakWali', 'alamat', 'status'] // [P1_23 D-4] status
};
var IMP_WAJIB_ = { pemasukan: ['tanggal', 'nominal'], pengeluaran: ['tanggal', 'nominal', 'penerima'], rab: ['program', 'nominal'], lpj: ['tanggal', 'item', 'nominal'], siswa: ['nama', 'kelas'] };
var IMP_CHUNK_ = { pemasukan: 20, pengeluaran: 20, rab: 200, lpj: 200, siswa: 100 };
var IMP_MAX_ROWS_ = 1000;
/* [P1_23 D-4] Status siswa = enum master server (OP_MASTER_.siswa.enums.status). Hanya beda huruf/spasi/tanda hubung yang dinormalkan;
   nilai lain (mis. Lulus, Pindah) DITOLAK dengan alasan, tidak dipetakan diam-diam. Kosong = tidak diubah (siswa lama) / bawaan server (baru). */
var IMP_STATUS_SISWA_ = { 'aktif': 'Aktif', 'nonaktif': 'Nonaktif', 'non aktif': 'Nonaktif', 'non-aktif': 'Nonaktif' };

function impS_(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); }
function impN_(v) { return impS_(v).toLowerCase(); }
/* Hash 53-bit (cyrb53) dua benih -> 26 heksadesimal. Deterministik, identik klien/server. */
function impHash_(str) {
  str = String(str);
  var one = function (seed) {
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0; i < str.length; i++) { var ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var n = 4294967296 * (2097151 & h2) + (h1 >>> 0), s = n.toString(16);
    while (s.length < 13) s = '0' + s;
    return s;
  };
  return one(7) + one(1013);
}
/* JSON dengan kunci objek terurut (agar hash tidak bergantung urutan kunci). */
function impCanon_(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(impCanon_).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + impCanon_(v[k]); }).join(',') + '}';
  return JSON.stringify(v);
}
function impCalendarOk_(y, mo, d) { if (mo < 1 || mo > 12 || d < 1) return false; return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
/* Tanggal -> {value, dari (bila dinormalisasi), error}. Diterima: YYYY-MM-DD; DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY; serial Excel (angka 20000-80000). */
function impDate_(raw) {
  var s = impS_(raw), m, y, mo, d, out;
  if (s === '') return { value: '', error: null };
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; out = s; }
  else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s))) { y = +m[3]; mo = +m[2]; d = +m[1]; out = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  else if ((m = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; out = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2); }
  else if (/^\d{5}(\.0+)?$/.test(s) && +s >= 20000 && +s <= 80000) {
    var dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    out = y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  } else return { value: '', error: 'format tanggal tidak dikenal: "' + s + '" (gunakan YYYY-MM-DD)' };
  if (!impCalendarOk_(y, mo, d)) return { value: '', error: 'tanggal tidak ada di kalender: "' + s + '"' };
  return { value: out, dari: out !== s ? s : null, error: null };
}
/* Angka rupiah/volume -> {value, dari, error}. "1.000.000", "1,000,000", "Rp 1.000.000", "1.500,50", "1500.5". Kosong -> value null. */
function impNum_(raw) {
  if (typeof raw === 'number') return isFinite(raw) ? { value: raw, dari: null, error: null } : { value: null, error: 'angka tidak valid' };
  var s0 = impS_(raw), s = s0.replace(/^rp\.?\s*/i, '').replace(/\s/g, '');
  if (s === '') return { value: null, dari: null, error: null };
  var neg = /^-/.test(s); if (neg) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return { value: null, error: 'bukan angka: "' + s0 + '"' };
  var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(','), dec = '';
  if (lastDot !== -1 && lastCom !== -1) dec = lastDot > lastCom ? '.' : ',';
  else if (lastCom !== -1) dec = /^\d{1,3}(,\d{3})+$/.test(s) ? '' : ',';
  else if (lastDot !== -1) dec = /^\d{1,3}(\.\d{3})+$/.test(s) ? '' : '.';
  var th = dec === '.' ? ',' : dec === ',' ? '.' : (lastDot !== -1 ? '.' : ',');
  var body = s.split(th).join(''); if (dec) body = body.replace(dec, '.');
  if (!/^\d+(\.\d+)?$/.test(body)) return { value: null, error: 'format angka tidak dikenal: "' + s0 + '"' };
  var v = Number(body) * (neg ? -1 : 1);
  return { value: v, dari: String(v) !== s0 ? s0 : null, error: null };
}
function impPeriodLabelError_(p, allowNonMonth) { // identik sgPeriodLabelError_ (SchemaGuard.gs)
  if (typeof p !== 'string') return 'periode wajib teks';
  if (/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) (\d{4})$/.test(p)) return null;
  if (allowNonMonth) {
    if (p === 'SekaliBayar') return null;
    var t = /^Tahun Ajaran (\d{4})\/(\d{4})$/.exec(p);
    if (t && Number(t[2]) === Number(t[1]) + 1) return null;
  }
  return 'periode tidak valid: "' + p + '" (format "<Bulan> <Tahun>"' + (allowNonMonth ? ', "Tahun Ajaran 2026/2027" atau "SekaliBayar"' : '') + ')';
}
function impPeriodSortKey_(p) {
  var m = /^(\S+) (\d{4})$/.exec(String(p || '')), mi = m ? IMP_BULAN_.indexOf(m[1]) : -1;
  if (mi !== -1) return Number(m[2]) * 12 + mi;
  var t = /^Tahun Ajaran (\d{4})\//.exec(String(p || ''));
  return t ? Number(t[1]) * 12 + 6 : 0;
}
function impFindByName_(list, nameField, raw) {
  var n = impN_(raw); if (!n) return null;
  var hit = (list || []).filter(function (x) { return impN_(x.id) === n || impN_(x[nameField]) === n; });
  return hit.length === 1 ? hit[0] : (hit.length > 1 ? { ambigu: hit } : null);
}
function impAktif_(x) { var s = impS_(x && x.status); return s === '' || s === 'Aktif'; }
function impSim_(a, b) {
  a = impN_(a); b = impN_(b); if (!a || !b) return 0; if (a === b) return 1;
  var m = a.length, n = b.length, prev = [], cur, i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) { cur = [i]; for (j = 1; j <= n; j++) cur[j] = a.charAt(i - 1) === b.charAt(j - 1) ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]); prev = cur; }
  return 1 - prev[n] / Math.max(m, n);
}
/* Baris mentah (objek field kanonik) -> isi ternormalisasi teks (untuk hash; tidak bergantung keputusan). */
function impRawIsi_(modul, r) {
  var o = {};
  Object.keys(r || {}).forEach(function (k) { if (k.charAt(0) !== '_' && impS_(r[k]) !== '') o[k] = impS_(r[k]); });
  return o;
}
function impSourceHash_(modul, rows) { return impHash_(modul + '|' + impCanon_((rows || []).map(function (r) { return impRawIsi_(modul, r); }))); }

/* Kunci baris & hash isi (bergantung hanya pada isi berkas, bukan keputusan) - dipakai server untuk mengenali data milik batch ini. */
function impKeys_(modul, rows, src) {
  var occ = {};
  return (rows || []).map(function (r) {
    var h = impHash_(modul + '|' + impCanon_(impRawIsi_(modul, r)));
    occ[h] = (occ[h] || 0) + 1;
    return { kunci: impHash_(modul + '|' + src + '|' + h) + '_' + occ[h], hashIsi: h, n: occ[h] };
  });
}
/* Kerangka hasil per baris */
function impNewRes_(i, r) {
  return { i: i, baris: r && r._baris ? r._baris : i + 1, kelas: 'VALID', kode: [], pesan: [], peringatan: [], normalisasi: [], keputusanPerlu: [], kandidat: [], nilai: {}, payload: null, nominal: null };
}
function impTolak_(res, kode, pesan) { res.kode.push(kode); res.pesan.push(pesan); res._tolak = true; }
function impPutus_(res, field, label, opsi, saran, kode) { res.keputusanPerlu.push({ field: field, label: label, opsi: opsi || null, saran: saran === undefined ? null : saran }); res.kode.push(kode || 'PERLU_KEPUTUSAN'); res._putus = true; }
function impWarn_(res, kode, pesan) { res.kode.push(kode); res.peringatan.push(pesan); }
function impNorm_(res, field, dari, ke) { if (dari !== null && dari !== undefined && String(dari) !== String(ke)) res.normalisasi.push({ field: field, dari: String(dari), ke: String(ke) }); }
function impDateField_(res, r, f, wajib) {
  var d = impDate_(r[f]);
  if (d.error) { impTolak_(res, 'TANGGAL_TIDAK_VALID', f + ': ' + d.error); return ''; }
  if (!d.value && wajib) { impTolak_(res, 'WAJIB_KOSONG', f + ' wajib diisi'); return ''; }
  impNorm_(res, f, d.dari, d.value); return d.value;
}
function impNumField_(res, r, f) {
  var n = impNum_(r[f]);
  if (n.error) { impTolak_(res, 'ANGKA_TIDAK_VALID', f + ': ' + n.error); return null; }
  if (n.value !== null) impNorm_(res, f, n.dari, n.value);
  return n.value;
}
function impUnit_(res, r, k, saran) {
  var u = impS_(r.unit).toUpperCase();
  if (k.unit) { if (k.unit === 'TK' || k.unit === 'MI') return k.unit; impTolak_(res, 'UNIT_TIDAK_VALID', 'keputusan unit tidak valid'); return ''; }
  if (u === 'TK' || u === 'MI') { if (impS_(r.unit) !== u) impNorm_(res, 'unit', r.unit, u); return u; }
  if (u) { impTolak_(res, 'UNIT_TIDAK_VALID', 'unit harus TK atau MI: "' + impS_(r.unit) + '"'); return ''; }
  impPutus_(res, 'unit', 'Unit (TK/MI)', [{ value: 'TK', label: 'TK' }, { value: 'MI', label: 'MI' }], saran || null); return '';
}
function impAkun_(res, r, k, D, metode) {
  var opsi = (D.akun || []).filter(function (a) { return a.jenis === 'Kas' || a.jenis === 'Bank'; }).map(function (a) { return { value: a.id, label: a.nama + ' (' + a.jenis + ')' }; });
  var a = null;
  if (k.akunId) { a = (D.akun || []).filter(function (x) { return x.id === k.akunId && (x.jenis === 'Kas' || x.jenis === 'Bank'); })[0]; if (!a) { impTolak_(res, 'AKUN_TIDAK_VALID', 'keputusan akun tidak ditemukan'); return null; } }
  else {
    var f = impFindByName_(D.akun, 'nama', r.akun);
    if (f && !f.ambigu && (f.jenis === 'Kas' || f.jenis === 'Bank')) a = f;
    else { impPutus_(res, 'akunId', impS_(r.akun) ? 'Akun "' + impS_(r.akun) + '" tidak dikenal - pilih akun Kas/Bank' : 'Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)', opsi, null, impS_(r.akun) ? 'AKUN_TIDAK_DIKENAL' : 'AKUN_KOSONG'); return null; }
  }
  if (metode === 'Transfer Bank' && a.jenis === 'Kas') impWarn_(res, 'TRANSFER_KE_KAS', 'metode Transfer Bank dengan akun Kas');
  return a;
}
function impMetode_(res, r, k, modul) {
  var list = IMP_METODE_[modul], raw = k.metode || impS_(r.metode), m = IMP_METODE_ALIAS_[impN_(raw)];
  if (m && list.indexOf(m) !== -1) { if (!k.metode) impNorm_(res, 'metode', raw, m); return m; }
  impPutus_(res, 'metode', raw ? 'Metode "' + raw + '" tidak dikenal' : 'Metode wajib dipilih', list.map(function (x) { return { value: x, label: x }; }), null, raw ? 'METODE_TIDAK_DIKENAL' : 'METODE_KOSONG');
  return '';
}
function impKategoriPengeluaran_(res, r, k, D, wajib) {
  var aktif = (D.kategoriPengeluaran || []).filter(impAktif_), opsi = aktif.map(function (x) { return { value: x.kategori, label: x.kategori }; });
  var raw = k.kategori || impS_(r.kategori);
  var f = impFindByName_(aktif, 'kategori', raw);
  if (f && !f.ambigu) { if (impS_(raw) !== f.kategori) impNorm_(res, 'kategori', raw, f.kategori); return f; }
  if (!raw && !wajib) return null;
  if (wajib) impPutus_(res, 'kategori', raw ? 'Kategori "' + raw + '" tidak ada di master aktif' : 'Kategori wajib dipilih (tidak ada kategori bawaan)', opsi, null, raw ? 'KATEGORI_TIDAK_DIKENAL' : 'KATEGORI_KOSONG');
  else impWarn_(res, 'KATEGORI_TIDAK_DIKENAL', 'kategori "' + raw + '" tidak ada di master (disimpan sebagai teks)');
  return null;
}
function impSubkategori_(res, r, kat, D, tolak) {
  var raw = impS_(r.subkategori); if (!raw) return '';
  var sub = (D.subkategori || []).filter(function (s) { return impAktif_(s) && kat && impN_(s.kategoriId) === impN_(kat.id) && impN_(s.nama) === impN_(raw); })[0];
  if (sub) return sub.nama;
  if (tolak) impTolak_(res, 'SUBKATEGORI_TIDAK_VALID', 'subkategori "' + raw + '" bukan milik kategori ' + (kat ? kat.kategori : '(belum dipilih)'));
  else impWarn_(res, 'SUBKATEGORI_TIDAK_DIKENAL', 'subkategori "' + raw + '" tidak ada di master (disimpan sebagai teks)');
  return raw;
}
/* Pencocokan siswa: NISN/NIS persis -> nama+kelas+unit persis -> mirip (>= 0.82) = PERLU_KEPUTUSAN. Tidak pernah membuat siswa. */
function impMatchSiswa_(D, nis, nama, kelas, unit) {
  var all = (D.siswa || []), n = impS_(nis);
  var same = function (s) { return impN_(s.nama) === impN_(nama) && (!kelas || impN_(s.kelas) === impN_(kelas)) && (!unit || s.unit === unit); };
  if (n) {
    var byN = all.filter(function (s) { return impS_(s.nis) === n || impS_(s.nisn) === n; });
    if (byN.length === 1) return { status: 'MATCH', siswa: byN[0] };
    if (byN.length > 1) return { status: 'AMBIGU', kandidat: byN };
    var nm = nama ? all.filter(same) : [];
    return nm.length ? { status: 'AMBIGU', kandidat: nm, alasan: 'NIS/NISN tidak cocok tetapi nama cocok' } : { status: 'TIDAK_ADA' };
  }
  if (!nama) return { status: 'KOSONG' };
  var ex = all.filter(same);
  if (ex.length === 1) return { status: 'MATCH', siswa: ex[0] };
  if (ex.length > 1) return { status: 'AMBIGU', kandidat: ex };
  var sim = all.filter(function (s) { return impSim_(s.nama, nama) >= 0.82; });
  return sim.length ? { status: 'AMBIGU', kandidat: sim, alasan: 'nama mirip' } : { status: 'TIDAK_ADA' };
}
function impKandidatSiswa_(list) { return list.slice(0, 8).map(function (s) { return { value: s.id, label: s.nama + ' - ' + (s.kelas || '-') + ' ' + (s.unit || '') + (s.nisn ? ' (NISN ' + s.nisn + ')' : '') }; }); }
/* Sidik jari transaksi server (aktif, jenis sama). */
function impTrxIndex_(D, jenis) {
  if (D['_trxIdx_' + jenis]) return D['_trxIdx_' + jenis];
  var idx = {};
  (D.transaksi || []).forEach(function (t) {
    if (t.archivedAt || t.jenis !== jenis) return;
    var k = impS_(t.tanggal).slice(0, 10) + '|' + Number(t.nominal);
    (idx[k] = idx[k] || []).push(t);
  });
  D['_trxIdx_' + jenis] = idx; return idx;
}
function impCekDuplikatTrx_(res, D, jenis, tanggal, nominal, teks) {
  var hits = impTrxIndex_(D, jenis)[tanggal + '|' + Number(nominal)] || [];
  if (!hits.length) return;
  var tks = teks.map(impN_).filter(Boolean);
  var kuat = hits.filter(function (t) {
    var tt = [t.ftNumber, t.namaPengirim, t.penerima, t.catatan].map(impN_).filter(Boolean);
    return tks.some(function (x) { return tt.indexOf(x) !== -1; });
  });
  if (kuat.length) { res._dup = true; res.kode.push('DUPLIKAT_DATA_SERVER'); res.pesan.push('Sama dengan transaksi yang sudah ada: ' + kuat.slice(0, 3).map(function (t) { return t.id; }).join(', ')); res.kandidat = kuat.slice(0, 3).map(function (t) { return { id: t.id, tanggal: t.tanggal, nominal: Number(t.nominal), teks: impS_(t.penerima || t.namaPengirim || t.catatan) }; }); }
  else impWarn_(res, 'SERUPA_TANGGAL_NOMINAL', 'ada ' + hits.length + ' transaksi dengan tanggal & nominal sama tetapi teks berbeda/kosong (tidak dianggap duplikat; periksa)');
}

/* ---------- validator per modul: (res, r, k = keputusan baris, D, st = status lintas baris) ---------- */
function impRowPemasukan_(res, r, k, D, st) {
  var tanggal = impDateField_(res, r, 'tanggal', true);
  var cash = impNumField_(res, r, 'cash'), tf = impNumField_(res, r, 'transfer'), nominal = impNumField_(res, r, 'nominal');
  if (nominal === null && (cash !== null || tf !== null)) { nominal = (cash || 0) + (tf || 0); impNorm_(res, 'nominal', '(kosong; cash+transfer)', nominal); }
  else if (nominal !== null && (cash || tf) && Math.abs(nominal - ((cash || 0) + (tf || 0))) > 1 && !k.terimaSelisih) impPutus_(res, 'terimaSelisih', 'Nominal ' + nominal + ' berbeda dengan cash+transfer ' + ((cash || 0) + (tf || 0)) + ' - perbaiki berkas atau setujui nominal', [{ value: true, label: 'Pakai kolom nominal' }], null, 'SELISIH_NOMINAL');
  if (nominal === null) impTolak_(res, 'WAJIB_KOSONG', 'nominal wajib diisi'); else if (!(nominal > 0)) impTolak_(res, 'NOMINAL_TIDAK_VALID', 'nominal harus > 0');
  var metode = impMetode_(res, r, k, 'pemasukan');
  var akun = impAkun_(res, r, k, D, metode);
  // siswa
  var siswa = null, nama = impS_(r.namaSiswa), nis = impS_(r.nisn) || impS_(r.nis);
  if (k.siswaId === '-') siswa = null;
  else if (k.siswaId) { siswa = (D.siswa || []).filter(function (s) { return s.id === k.siswaId; })[0] || null; if (!siswa) impTolak_(res, 'SISWA_TIDAK_VALID', 'keputusan siswa tidak ditemukan'); }
  else if (nama || nis) {
    var mt = impMatchSiswa_(D, nis, nama, impS_(r.kelas), impS_(r.unit).toUpperCase());
    if (mt.status === 'MATCH') siswa = mt.siswa;
    else if (mt.status === 'AMBIGU') impPutus_(res, 'siswaId', 'Siswa "' + (nama || nis) + '" cocok dengan ' + mt.kandidat.length + ' siswa' + (mt.alasan ? ' (' + mt.alasan + ')' : '') + ' - pilih, atau "-" untuk tanpa siswa', impKandidatSiswa_(mt.kandidat).concat([{ value: '-', label: 'Tanpa siswa (belum teridentifikasi)' }]), null, 'SISWA_AMBIGU');
    else impWarn_(res, 'SISWA_TIDAK_TERIDENTIFIKASI', 'siswa "' + (nama || nis) + '" tidak ditemukan; disimpan sebagai belum teridentifikasi');
  }
  var unit = '';
  if (siswa && !k.unit) {
    var uf = impS_(r.unit).toUpperCase();
    if (uf && uf !== siswa.unit) impPutus_(res, 'unit', 'Unit berkas (' + uf + ') berbeda dengan unit siswa (' + siswa.unit + ')', [{ value: 'TK', label: 'TK' }, { value: 'MI', label: 'MI' }], siswa.unit, 'UNIT_BERBEDA');
    else { unit = siswa.unit; if (!uf) impNorm_(res, 'unit', '(kosong; dari data siswa)', unit); }
  } else unit = impUnit_(res, r, k, null);
  // sumber / kategori penerimaan
  var sumber = '', srcRaw = k.sumber || impS_(r.sumber);
  var katP = impFindByName_((D.kategoriPenerimaan || []).filter(impAktif_), 'kategori', srcRaw);
  if (impN_(srcRaw) === 'pembayaran siswa') sumber = 'Pembayaran Siswa';
  else if (katP && !katP.ambigu) sumber = katP.kategori;
  else impPutus_(res, 'sumber', srcRaw ? 'Sumber "' + srcRaw + '" tidak ada di master kategori penerimaan' : 'Sumber/kategori penerimaan wajib dipilih', [{ value: 'Pembayaran Siswa', label: 'Pembayaran Siswa' }].concat((D.kategoriPenerimaan || []).filter(impAktif_).map(function (x) { return { value: x.kategori, label: x.kategori }; })), siswa || nama ? 'Pembayaran Siswa' : null, srcRaw ? 'SUMBER_TIDAK_DIKENAL' : 'SUMBER_KOSONG');
  // alokasi komponen (D-IMP-4): diminta -> wajib valid; tidak diminta -> tanpa alokasi (kebijakan berlaku: Belum Diproses)
  var minta = [];
  Object.keys(r).forEach(function (f) { if (f.indexOf('komponen:') === 0) { var v = impNum_(r[f]); if (v.error) impTolak_(res, 'ANGKA_TIDAK_VALID', f + ': ' + v.error); else if (v.value > 0) minta.push({ komponenId: f.slice(9), nominal: v.value }); } });
  if (impS_(r.komponen)) {
    var kp = impFindByName_(D.komponen, 'nama', r.komponen);
    if (!kp || kp.ambigu) impTolak_(res, 'KOMPONEN_TIDAK_DIKENAL', 'komponen "' + impS_(r.komponen) + '" tidak ada di master');
    else minta.push({ komponenId: kp.id, nominal: nominal, periode: impS_(r.periodeKomponen) });
  }
  var allocations = [];
  if (minta.length) {
    var totMinta = minta.reduce(function (s, x) { return s + (x.nominal || 0); }, 0);
    if (nominal !== null && totMinta > nominal + 0.5) impTolak_(res, 'ALOKASI_MELEBIHI_NOMINAL', 'jumlah kolom komponen (' + totMinta + ') melebihi nominal (' + nominal + ')');
    minta.forEach(function (x) { if (!(D.komponen || []).some(function (c) { return c.id === x.komponenId; })) impTolak_(res, 'KOMPONEN_TIDAK_DIKENAL', 'komponen ' + x.komponenId + ' tidak ada di master'); });
    if (!siswa && !res._putus) impTolak_(res, 'ALOKASI_TANPA_SISWA', 'alokasi komponen membutuhkan siswa yang teridentifikasi');
    if (siswa && !res._tolak && !res._putus && typeof D.kewajiban === 'function') {
      var obs = D.kewajiban(siswa.id) || [], lebih = 0;
      minta.forEach(function (x) {
        var cand = obs.filter(function (o) { return o.komponenId === x.komponenId && (!x.periode || o.periode === x.periode); }).sort(function (a, b) { return impPeriodSortKey_(a.periode) - impPeriodSortKey_(b.periode); });
        var sisaKey = function (o) { return o.sisa - (st.pakai[o.key] || 0); };
        // tidak ada kewajiban sama sekali untuk komponen/periode itu = alokasi tidak valid (D-IMP-4)
        if (!cand.length) { impTolak_(res, 'KEWAJIBAN_TIDAK_ADA', 'kewajiban ' + x.komponenId + (x.periode ? ' ' + x.periode : '') + ' tidak ada untuk siswa ini (tarif/periode/klasifikasi tidak berlaku)'); return; }
        // [Keputusan 1] hanya kewajiban yang ada (s.d. periode aktif) yang diisi; kelebihan TIDAK dialokasikan ke periode berikutnya
        var left = x.nominal;
        cand.forEach(function (o) { var s = sisaKey(o); if (left <= 0.5 || s <= 0.5) return; var take = Math.min(s, left); allocations.push({ siswaId: siswa.id, komponenId: x.komponenId, periode: o.periode, nominal: take, tagihanId: o.tagihanId || '', _key: o.key }); left -= take; });
        if (left > 0.5) lebih += left;
      });
      if (lebih > 0.5 && !res._tolak) {
        var terpenuhi = allocations.reduce(function (t, a) { return t + a.nominal; }, 0);
        var lainSisa = obs.filter(function (o) { return !minta.some(function (x) { return x.komponenId === o.komponenId; }); }).reduce(function (t, o) { return t + Math.max(0, o.sisa - (st.pakai[o.key] || 0)); }, 0);
        impWarn_(res, 'KELEBIHAN_PEMBAYARAN', 'KELEBIHAN PEMBAYARAN: pembayaran ' + nominal + ', kewajiban terpenuhi ' + terpenuhi + ', kelebihan ' + lebih + ' (tidak dialokasikan ke periode berikutnya; tetap di transaksi). ' +
          (lainSisa > 0.5 ? 'Siswa masih punya sisa kewajiban komponen lain ' + lainSisa + ' -> status server SEBAGIAN_TERALOKASI (dapat dialokasikan manual).' : (terpenuhi > 0.5 ? 'Status server OVERPAYMENT_CREDIT (kelebihan bayar/kredit).' : 'Tanpa alokasi -> status server TERIDENTIFIKASI.')));
        res._lebih = { nominalPembayaran: nominal, kewajibanTerpenuhi: terpenuhi, kelebihanPembayaran: lebih };
      }
    } else if (siswa && typeof D.kewajiban !== 'function') impWarn_(res, 'ALOKASI_DIPERIKSA_SERVER', 'alokasi dihitung & diperiksa server saat pratinjau');
  } else if (!impS_(r.komponen)) impWarn_(res, 'TANPA_ALOKASI', 'tanpa alokasi komponen; transaksi masuk daftar Belum Diproses');
  if (!res._tolak && tanggal && nominal) impCekDuplikatTrx_(res, D, 'PENERIMAAN', tanggal, nominal, [r.ftNumber, r.namaPengirim, r.uraian]);
  res.nominal = nominal;
  res.nilai = { tanggal: tanggal, unit: unit, nominal: nominal, akun: akun ? akun.nama : '', metode: metode, sumber: sumber, siswa: siswa ? siswa.nama : '', alokasi: allocations.map(function (a) { return a.komponenId + ' ' + a.periode + ' ' + a.nominal; }).join('; ') };
  if (res._lebih) { res.nilai.nominalPembayaran = res._lebih.nominalPembayaran; res.nilai.kewajibanTerpenuhi = res._lebih.kewajibanTerpenuhi; res.nilai.kelebihanPembayaran = res._lebih.kelebihanPembayaran; res.lebihBayar = res._lebih; }
  res.payload = { tanggal: tanggal, unit: unit, nominal: nominal, akunId: akun ? akun.id : '', metode: metode, sumber: sumber, siswaId: siswa ? siswa.id : '',
    _siswaNamaSnapshot: siswa ? siswa.nama : '', status: siswa ? 'TERIDENTIFIKASI' : 'TERCATAT', catatan: impS_(r.uraian), namaPengirim: impS_(r.namaPengirim), ftNumber: impS_(r.ftNumber),
    allocations: allocations.map(function (a) { return { siswaId: a.siswaId, komponenId: a.komponenId, periode: a.periode, nominal: a.nominal, tagihanId: a.tagihanId, caraBayar: 'manual' }; }) };
  res._alokKeys = allocations;
}
function impRowPengeluaran_(res, r, k, D) {
  var tanggal = impDateField_(res, r, 'tanggal', true);
  var qty = impNumField_(res, r, 'qty'), harga = impNumField_(res, r, 'hargaSatuan'), disk = impNumField_(res, r, 'diskon'), nominal = impNumField_(res, r, 'nominal');
  if (nominal === null && qty !== null && harga !== null) { nominal = qty * harga - (disk || 0); impNorm_(res, 'nominal', '(kosong; qty x harga - diskon)', nominal); }
  else if (nominal !== null && qty !== null && harga !== null && Math.abs(nominal - (qty * harga - (disk || 0))) > 1 && !k.terimaSelisih) impPutus_(res, 'terimaSelisih', 'Qty x Harga - Diskon (' + (qty * harga - (disk || 0)) + ') berbeda dengan nominal ' + nominal, [{ value: true, label: 'Pakai kolom nominal' }], null, 'SELISIH_NOMINAL');
  if (nominal === null) impTolak_(res, 'WAJIB_KOSONG', 'nominal wajib diisi'); else if (!(nominal > 0)) impTolak_(res, 'NOMINAL_TIDAK_VALID', 'nominal harus > 0');
  var unit = impUnit_(res, r, k, null);
  var metode = impMetode_(res, r, k, 'pengeluaran');
  var akun = impAkun_(res, r, k, D, metode);
  var kat = impKategoriPengeluaran_(res, r, k, D, true);
  var sub = impSubkategori_(res, r, kat, D, true);
  var penerima = impS_(r.penerima);
  if (!penerima) impTolak_(res, 'WAJIB_KOSONG', 'penerima wajib diisi'); else if (penerima.length < 3) impWarn_(res, 'PENERIMA_PENDEK', 'penerima < 3 karakter (indikator BDS03-I02)');
  if (!res._tolak && tanggal && nominal) impCekDuplikatTrx_(res, D, 'PENGELUARAN', tanggal, nominal, [r.penerima, r.uraian]);
  res.nominal = nominal;
  res.nilai = { tanggal: tanggal, unit: unit, nominal: nominal, akun: akun ? akun.nama : '', metode: metode, kategori: kat ? kat.kategori : '', subkategori: sub, penerima: penerima };
  res.payload = { tanggal: tanggal, unit: unit, nominal: nominal, akunId: akun ? akun.id : '', metode: metode, kategori: kat ? kat.kategori : '', subkategori: sub, penerima: penerima, catatan: impS_(r.uraian), status: 'TERCATAT' };
}
function impRowRab_(res, r, k, D, st) {
  var cols = (D.kolom && D.kolom.rab) || [];
  var per = k.periode || impS_(r.periode);
  if (!per) impPutus_(res, 'periode', 'Periode RAB wajib ditentukan eksplisit (bukan periode aktif)', null, null, 'PERIODE_KOSONG');
  else if (impPeriodLabelError_(per, true)) {
    var ta = /^(\d{4})\/(\d{4})$/.exec(per);
    if (ta && Number(ta[2]) === Number(ta[1]) + 1) impPutus_(res, 'periode', 'Periode "' + per + '" adalah tahun ajaran mentah - konfirmasi label', null, 'Tahun Ajaran ' + per, 'PERIODE_TA_MENTAH');
    else impTolak_(res, 'PERIODE_TIDAK_VALID', impPeriodLabelError_(per, true));
    per = '';
  }
  var jenis = impS_(r.jenis).toUpperCase();
  if (jenis && jenis !== 'PENGELUARAN' && jenis !== 'PEMASUKAN') impTolak_(res, 'JENIS_TIDAK_VALID', 'jenis harus PENGELUARAN/PEMASUKAN');
  if (jenis === 'PEMASUKAN') impTolak_(res, 'JENIS_PEMASUKAN_TIDAK_DIDUKUNG', 'RAB jenis PEMASUKAN (butuh komponenId) belum didukung impor massal');
  if (jenis && cols.indexOf('jenis') === -1) { impWarn_(res, 'KOLOM_TIDAK_ADA', 'kolom jenis belum ada di 08_ANGGARAN; nilai disimpan di sourceRow'); jenis = ''; }
  var unit = impUnit_(res, r, k, null);
  var kat = impKategoriPengeluaran_(res, r, k, D, true);
  var sub = impSubkategori_(res, r, kat, D, true);
  var program = impS_(r.program); if (!program) impTolak_(res, 'WAJIB_KOSONG', 'program/uraian wajib diisi');
  var vol = impNumField_(res, r, 'volume'), harga = impNumField_(res, r, 'hargaSatuan'), nominal = impNumField_(res, r, 'nominal');
  if (nominal === null && vol !== null && harga !== null) { nominal = vol * harga; impNorm_(res, 'nominal', '(kosong; volume x harga)', nominal); }
  else if (nominal !== null && vol !== null && harga !== null && Math.abs(nominal - vol * harga) > 1 && !k.terimaSelisih) impPutus_(res, 'terimaSelisih', 'Volume x Harga (' + (vol * harga) + ') berbeda dengan nominal ' + nominal, [{ value: true, label: 'Pakai kolom nominal' }], null, 'SELISIH_NOMINAL');
  if (nominal === null) impTolak_(res, 'WAJIB_KOSONG', 'nominal wajib diisi'); else if (!(nominal > 0)) impTolak_(res, 'NOMINAL_TIDAK_VALID', 'nominal harus > 0');
  var stSrc = impS_(r.status);
  if (cols.indexOf('status') === -1) impTolak_(res, 'SCHEMA_ADDITIVE_REQUIRED', 'kolom status belum ada di 08_ANGGARAN; RAB impor wajib DIAJUKAN (D-IMP-5) - jalankan migrasi skema aditif di salinan');
  if (stSrc && stSrc.toUpperCase() !== 'DIAJUKAN') impWarn_(res, 'STATUS_SUMBER_DIABAIKAN', 'status sumber "' + stSrc + '" tidak dipakai; RAB impor selalu DIAJUKAN (D-IMP-5)');
  // duplikat: garis (kategori|subkategori|unit|periode) + program + nominal
  if (!res._tolak && !res._putus) {
    var fp = [impN_(kat.kategori), impN_(sub), unit, per, impN_(program), Number(nominal)].join('|');
    var ada = (D.anggaran || []).filter(function (a) { return !a.archivedAt && [impN_(a.kategori), impN_(a.subkategori), impS_(a.unit), impS_(a.periode), impN_(a.program), Number(a.nominal)].join('|') === fp; });
    if (ada.length) { res._dup = true; res.kode.push('DUPLIKAT_DATA_SERVER'); res.pesan.push('Sama dengan RAB yang sudah ada: ' + ada.slice(0, 3).map(function (a) { return a.id; }).join(', ')); }
  }
  res.nominal = nominal;
  res.nilai = { periode: per, unit: unit, kategori: kat ? kat.kategori : '', subkategori: sub, program: program, nominal: nominal, status: 'DIAJUKAN' };
  var row = { periode: per, program: program, kategori: kat ? kat.kategori : '', unit: unit, nominal: nominal, status: 'DIAJUKAN', source: 'RAB_IMPORT', subkategori: sub, volume: vol === null ? '' : vol, satuan: impS_(r.satuan), hargaSatuan: harga === null ? '' : harga, jenis: jenis };
  res.payload = row; res._meta = { statusSumber: stSrc || '' };
}
function impRowLpj_(res, r, k, D, st) {
  var tanggal = impDateField_(res, r, 'tanggal', true);
  var item = impS_(r.item); if (!item) impTolak_(res, 'WAJIB_KOSONG', 'item/uraian wajib diisi');
  var vol = impNumField_(res, r, 'volume'), harga = impNumField_(res, r, 'hargaSatuan'), disk = impNumField_(res, r, 'diskon'), nominal = impNumField_(res, r, 'nominal');
  if (nominal === null && vol !== null && harga !== null) { nominal = vol * harga - (disk || 0); impNorm_(res, 'nominal', '(kosong; volume x harga - diskon)', nominal); }
  else if (nominal !== null && vol !== null && harga !== null && Math.abs(nominal - (vol * harga - (disk || 0))) > 1 && !k.terimaSelisih) impPutus_(res, 'terimaSelisih', 'Volume x Harga - Diskon (' + (vol * harga - (disk || 0)) + ') berbeda dengan nominal ' + nominal, [{ value: true, label: 'Pakai kolom nominal' }], null, 'SELISIH_NOMINAL');
  if (nominal === null) impTolak_(res, 'WAJIB_KOSONG', 'nominal wajib diisi'); else if (!(nominal > 0)) impTolak_(res, 'NOMINAL_TIDAK_VALID', 'nominal harus > 0');
  if (impS_(r.satuan) && impNum_(r.satuan).value !== null && !impNum_(r.satuan).error) impWarn_(res, 'SATUAN_ANGKA', 'kolom satuan berisi angka (GAP-020: kemungkinan kolom tertukar)');
  var unit = impUnit_(res, r, k, null);
  var kat = impKategoriPengeluaran_(res, r, k, D, false);
  var katTeks = kat ? kat.kategori : impS_(r.kategori);
  var sub = impSubkategori_(res, r, kat, D, false);
  var tid = impS_(k.transaksiId || r.transaksiId), tautan = 'TANPA_TAUTAN';
  if (tid) {
    var t = (D.transaksi || []).filter(function (x) { return String(x.id) === tid; })[0];
    if (!t || t.archivedAt) impTolak_(res, 'TRANSAKSI_TIDAK_ADA', 'transaksiId tidak ditemukan / diarsipkan: ' + tid);
    else if (t.jenis !== 'PENGELUARAN') impTolak_(res, 'BUKAN_PENGELUARAN', 'LPJ hanya untuk transaksi PENGELUARAN: ' + tid);
    else {
      var terpakai = (D.lpj || []).filter(function (l) { return !l.archivedAt && String(l.transaksiId) === tid; }).reduce(function (s, l) { return s + (Number(l.nominal) || 0); }, 0) + (st.lpjPakai[tid] || 0);
      if (nominal && terpakai + nominal > Number(t.nominal) + 0.5) impTolak_(res, 'LPJ_EXCEEDS_TRANSACTION', 'total LPJ (' + (terpakai + nominal) + ') melebihi nominal transaksi ' + tid + ' (' + t.nominal + ')');
      else {
        if (!k.terimaBeda && ((unit && t.unit && unit !== t.unit) || (katTeks && t.kategori && impN_(katTeks) !== impN_(t.kategori)))) impPutus_(res, 'terimaBeda', 'Unit/kategori LPJ berbeda dengan transaksi ' + tid + ' (' + t.unit + '/' + t.kategori + ')', [{ value: true, label: 'Tetap tautkan' }], null, 'TAUTAN_BERBEDA');
        tautan = 'TERTAUT'; if (nominal) { st.lpjPakai[tid] = (st.lpjPakai[tid] || 0) + nominal; res._lpjAdd = nominal; }
      }
    }
  } else {
    impWarn_(res, 'LPJ_TANPA_TAUTAN', 'LPJ tanpa transaksi: status PERLU TRANSAKSI / PERLU TAUTAN (tidak ada transaksi dibuat; kandidat hanya saran)');
    if (tanggal && nominal && unit) res.kandidat = impKandidatLpj_(D, tanggal, nominal, unit, katTeks, item);
  }
  if (!res._tolak && !res._putus) {
    var fp = [tanggal, impN_(katTeks), impN_(item), Number(nominal)].join('|');
    var ada = (D.lpj || []).filter(function (l) { return !l.archivedAt && [impS_(l.tanggal).slice(0, 10), impN_(l.kategori), impN_(l.item), Number(l.nominal)].join('|') === fp; });
    if (ada.length) { res._dup = true; res.kode.push('DUPLIKAT_DATA_SERVER'); res.pesan.push('Sama dengan LPJ yang sudah ada: ' + ada.slice(0, 3).map(function (l) { return l.id; }).join(', ')); }
  }
  res.nominal = nominal;
  res.nilai = { tanggal: tanggal, unit: unit, kategori: katTeks, subkategori: sub, item: item, nominal: nominal, transaksiId: tautan === 'TERTAUT' ? tid : '', tautan: tautan };
  res.payload = { tanggal: tanggal, unit: unit, kategori: katTeks, subkategori: sub, item: item, volume: vol === null ? '' : vol, satuan: impS_(r.satuan), diskon: disk === null ? '' : disk, hargaSatuan: harga === null ? '' : harga,
    nominal: nominal, status: 'REALIZATION', transaksiId: tautan === 'TERTAUT' ? tid : '', lpjDokId: impS_(r.lpjDokId) };
  res._meta = { statusTautan: tautan };
}
/* Saran transaksi untuk LPJ tanpa tautan: skor gabungan, jendela tanggal hanya salah satu sinyal. TIDAK PERNAH menautkan. */
function impKandidatLpj_(D, tanggal, nominal, unit, kategori, item) {
  var linked = {}; (D.lpj || []).forEach(function (l) { if (!l.archivedAt && l.transaksiId) linked[l.transaksiId] = (linked[l.transaksiId] || 0) + (Number(l.nominal) || 0); });
  var d0 = Date.parse(tanggal + 'T00:00:00Z');
  return (D.transaksi || []).filter(function (t) { return !t.archivedAt && t.jenis === 'PENGELUARAN'; }).map(function (t) {
    var skor = 0, alasan = [];
    var sisa = Number(t.nominal) - (linked[t.id] || 0);
    if (sisa + 0.5 < nominal) return null;
    if (t.unit === unit) { skor += 2; alasan.push('unit sama'); }
    if (kategori && impN_(t.kategori) === impN_(kategori)) { skor += 2; alasan.push('kategori sama'); }
    var hari = (d0 - Date.parse(impS_(t.tanggal).slice(0, 10) + 'T00:00:00Z')) / 86400000;
    if (hari >= 0 && hari <= 62) { skor += hari <= 14 ? 2 : 1; alasan.push(hari + ' hari sebelum nota'); }
    if (Math.abs(sisa - nominal) <= 0.5) { skor += 2; alasan.push('sisa = nominal'); }
    if (impSim_(t.penerima || t.catatan, item) >= 0.6) { skor += 1; alasan.push('teks mirip'); }
    return skor >= 4 ? { id: t.id, tanggal: impS_(t.tanggal).slice(0, 10), nominal: Number(t.nominal), sisaBelumLpj: sisa, skor: skor, alasan: alasan.join(', ') } : null;
  }).filter(Boolean).sort(function (a, b) { return b.skor - a.skor; }).slice(0, 3);
}
function impRowSiswa_(res, r, k, D, st, opts) {
  var cols = (D.kolom && D.kolom.siswa) || [];
  var nama = impS_(r.nama); if (!nama) impTolak_(res, 'WAJIB_KOSONG', 'nama wajib diisi');
  var kelas = impS_(r.kelas); if (!kelas) impTolak_(res, 'WAJIB_KOSONG', 'kelas wajib diisi');
  var unit = impUnit_(res, r, k, null);
  var ta = k.tahunAjaran || impS_(r.tahunAjaran), tm = /^(\d{4})\/(\d{4})$/.exec(ta);
  if (!ta) impPutus_(res, 'tahunAjaran', 'Tahun ajaran wajib ditentukan (menentukan awal kewajiban)', null, D.tahunAjaranAktif || null, 'TAHUN_AJARAN_KOSONG');
  else if (!(tm && Number(tm[2]) === Number(tm[1]) + 1)) { impTolak_(res, 'TAHUN_AJARAN_TIDAK_VALID', 'tahun ajaran wajib YYYY/YYYY+1: "' + ta + '"'); ta = ''; }
  var masuk = impDateField_(res, r, 'tanggalMasuk', false), keluar = impDateField_(res, r, 'tanggalKeluar', false);
  if (masuk && keluar && keluar < masuk) impTolak_(res, 'URUTAN_TANGGAL', 'tanggalKeluar sebelum tanggalMasuk');
  var jk = impS_(r.jenisKelamin);
  if (jk) { var seen = {}; (D.siswa || []).forEach(function (s) { if (impS_(s.jenisKelamin)) seen[impS_(s.jenisKelamin)] = true; }); if (Object.keys(seen).length && !seen[jk]) impWarn_(res, 'JENIS_KELAMIN_BARU', 'nilai jenis kelamin "' + jk + '" belum pernah ada di master (format final menunggu D-IMP-8)'); }
  var nisn = impS_(r.nisn), nis = impS_(r.nis);
  if (nisn && !/^\d{10}$/.test(nisn)) impWarn_(res, 'NISN_FORMAT', 'NISN bukan 10 digit (penanda saja; D-IMP-8)');
  if (nisn) { if (st.nisn[nisn] !== undefined) { res._dup = true; res.kode.push('DUPLIKAT_DALAM_BERKAS'); res.pesan.push('NISN ' + nisn + ' sudah ada di baris ' + st.nisn[nisn]); } else st.nisn[nisn] = res.baris; }
  ['alamat'].forEach(function (f) { if (impS_(r[f]) && cols.length && cols.indexOf(f) === -1) impWarn_(res, 'KOLOM_TIDAK_ADA', 'kolom ' + f + ' belum ada di 01_SISWA; nilai TIDAK disimpan (perlu migrasi skema aditif)'); });
  var stRaw = impS_(r.status), status = stRaw ? IMP_STATUS_SISWA_[stRaw.toLowerCase()] || '' : ''; // [P1_23 D-4]
  if (stRaw && !status) impTolak_(res, 'STATUS_TIDAK_VALID', 'status siswa wajib Aktif atau Nonaktif (enum master): "' + stRaw + '"');
  else if (stRaw && status !== stRaw) impNorm_(res, 'status', stRaw, status);
  var rec = { nama: nama, unit: unit, kelas: kelas, nis: nis, nisn: nisn, tahunAjaran: ta, tanggalMasuk: masuk, tanggalKeluar: keluar, jenisKelamin: jk, namaWali: impS_(r.namaWali), kontakWali: impS_(r.kontakWali), alamat: impS_(r.alamat) };
  if (status) rec.status = status; // [P1_23 D-4] kosong: kolom tidak dikirim (siswa lama tidak berubah; siswa baru = bawaan server Aktif)
  Object.keys(rec).forEach(function (f) { if (cols.length && cols.indexOf(f) === -1) delete rec[f]; });
  // pencocokan dengan master
  var target = null;
  if (k.siswaBaru !== true) {
    if (k.siswaId) { target = (D.siswa || []).filter(function (s) { return s.id === k.siswaId; })[0]; if (!target) impTolak_(res, 'SISWA_TIDAK_VALID', 'keputusan siswa tidak ditemukan'); }
    else if (nama) {
      var mt = impMatchSiswa_(D, nisn, nama, kelas, unit);
      if (mt.status === 'MATCH') target = mt.siswa;
      else if (mt.status === 'AMBIGU') impPutus_(res, 'siswaId', 'Mirip/cocok dengan ' + mt.kandidat.length + ' siswa terdaftar' + (mt.alasan ? ' (' + mt.alasan + ')' : '') + ' - pilih siswa yang diperbarui atau "Siswa baru"', impKandidatSiswa_(mt.kandidat).concat([{ value: '__baru__', label: 'Siswa baru' }]), null, 'SISWA_AMBIGU');
    }
  }
  res.nilai = { nama: nama, unit: unit, kelas: kelas, nisn: nisn, tahunAjaran: ta, tanggalMasuk: masuk, tanggalKeluar: keluar, jenisKelamin: jk, status: status || '(tidak diubah)', aksi: target ? 'PERBARUI ' + target.id : 'BARU' };
  if (target) {
    res._sudahAda = true; res.targetId = target.id;
    var upd = {}, ubahKewajiban = [];
    Object.keys(rec).forEach(function (f) { if (rec[f] !== '' && impS_(target[f]) !== rec[f]) { upd[f] = rec[f]; if (['unit', 'kelas', 'tahunAjaran', 'tanggalMasuk', 'tanggalKeluar', 'status'].indexOf(f) !== -1) ubahKewajiban.push(f); /* [P1_23 D-4] status mengubah enumerasi kewajiban */ } });
    if (!Object.keys(upd).length) { res.kode.push('SISWA_SAMA'); res.pesan.push('Sama dengan siswa terdaftar ' + target.id + ' (tidak ada perubahan)'); }
    else if (opts.modeSiswa !== 'TAMBAH_PERBARUI') { res.kode.push('SISWA_SUDAH_ADA'); res.pesan.push('Siswa sudah terdaftar (' + target.id + '); pilih mode "Tambah + Perbarui" untuk memperbarui ' + Object.keys(upd).join(', ')); }
    else if (ubahKewajiban.length && !k.terimaPerubahanKewajiban) impPutus_(res, 'terimaPerubahanKewajiban', 'Perubahan ' + ubahKewajiban.join(', ') + ' mengubah kewajiban siswa ' + target.nama, [{ value: true, label: 'Setujui perubahan' }], null, 'UBAH_KEWAJIBAN');
    else res._update = true;
    res.payload = upd;
  } else res.payload = rec;
}

/* ---------- PLAN BERSAMA ---------- */
/* rows: [{_baris, field: nilai}] ; opts: {sourceHash?, keputusan:{i:{...}}, pilih:[i]|null, modeSiswa} ; D: konteks.
   Mengembalikan {modul, sourceHash, rows:[res], ringkasan, total}. */
function impPlan_(modul, rows, opts, D) {
  opts = opts || {}; D = D || {};
  if (IMP_MODUL_.indexOf(modul) === -1) throw new Error('modul tidak dikenal: ' + modul);
  var src = opts.sourceHash || impSourceHash_(modul, rows), kep = opts.keputusan || {};
  var pilihSet = null; if (Array.isArray(opts.pilih)) { pilihSet = {}; opts.pilih.forEach(function (i) { pilihSet[i] = true; }); }
  var keys = impKeys_(modul, rows, src), st = { pakai: {}, lpjPakai: {}, nisn: {} }, out = [];
  var fn = { pemasukan: impRowPemasukan_, pengeluaran: impRowPengeluaran_, rab: impRowRab_, lpj: impRowLpj_, siswa: impRowSiswa_ }[modul];
  rows.forEach(function (r, i) {
    var res = impNewRes_(i, r), k = kep[i] || kep[String(i)] || {};
    if (k.siswaId === '__baru__') { k = Object.assign({}, k, { siswaBaru: true }); delete k.siswaId; }
    var isi = impRawIsi_(modul, r), hIsi = keys[i].hashIsi;
    res.hashIsi = hIsi; res.kunci = keys[i].kunci;
    if (!Object.keys(isi).length) { impTolak_(res, 'BARIS_KOSONG', 'baris kosong'); }
    else {
      (IMP_WAJIB_[modul] || []).forEach(function (f) { if (impS_(r[f]) === '' && !(modul === 'pemasukan' && f === 'nominal' && (impS_(r.cash) || impS_(r.transfer))) && !(modul !== 'pemasukan' && f === 'nominal' && (impS_(r.qty || r.volume) && impS_(r.hargaSatuan)))) impTolak_(res, 'WAJIB_KOSONG', f + ' wajib diisi'); });
      if (!res._tolak) {
        fn(res, r, k, D, st, opts);
        if (keys[i].n > 1) { res._dup = true; res.kode.push('DUPLIKAT_DALAM_BERKAS'); res.pesan.push('Isi identik dengan baris sebelumnya di berkas ini (kemunculan ke-' + keys[i].n + ')'); }
        if ((D.riwayatIsi || {})[hIsi]) { res._dup = true; res.kode.push('PERNAH_DIIMPOR_BERKAS_LAIN'); res.pesan.push('Isi yang sama pernah tersimpan dari berkas lain (batch ' + D.riwayatIsi[hIsi].slice(0, 2).join(', ') + ')'); }
      }
    }
    res.kelas = res._tolak ? 'TOLAK' : res._putus ? 'PERLU_KEPUTUSAN' : (res._dup && !k.terimaDuplikat) ? 'DUPLIKAT'
      : (modul === 'siswa' && res._sudahAda && !res._update) ? 'SUDAH_ADA' : res.peringatan.length ? 'PERINGATAN' : 'VALID';
    if (res._dup && k.terimaDuplikat && res.kelas !== 'TOLAK' && res.kelas !== 'PERLU_KEPUTUSAN') res.peringatan.push('duplikat diterima eksplisit oleh pengguna');
    res.dipilih = IMP_KELAS_IMPOR_.indexOf(res.kelas) !== -1 && (!pilihSet || !!pilihSet[i]);
    res.sudahTersimpan = !!(D.sudahTersimpan || {})[res.kunci];
    // alokasi baris yang TIDAK dipilih dikembalikan agar baris berikut dialokasikan dari kewajiban tertua yang benar
    if (modul === 'pemasukan' && res._alokKeys) { if (res.dipilih) res._alokKeys.forEach(function (a) { st.pakai[a._key] = (st.pakai[a._key] || 0) + a.nominal; }); }
    if (modul === 'lpj' && !res.dipilih && res._lpjAdd) st.lpjPakai[res.payload.transaksiId] -= res._lpjAdd;
    ['_tolak', '_putus', '_dup', '_alokKeys', '_sudahAda', '_lpjAdd', '_lebih'].forEach(function (x) { delete res[x]; });
    out.push(res);
  });
  var ring = { total: out.length }, totalSumber = 0, totalDipilih = 0;
  out.forEach(function (x) { ring[x.kelas] = (ring[x.kelas] || 0) + 1; if (x.nominal > 0) totalSumber += x.nominal; if (x.dipilih && x.nominal > 0) totalDipilih += x.nominal; });
  ring.dipilih = out.filter(function (x) { return x.dipilih; }).length;
  ring.sudahTersimpan = out.filter(function (x) { return x.sudahTersimpan; }).length;
  return { modul: modul, sourceHash: src, rows: out, ringkasan: ring, total: { nominalSumber: totalSumber, nominalDipilih: totalDipilih } };
}
