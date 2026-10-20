/**
 * ObligationEngine.gs  -  *** DIHASILKAN OTOMATIS dari Bendahara_V2.html - JANGAN DIEDIT TANGAN ***
 * Logika kewajiban (04_KEWAJIBAN) dipindahkan ke server dengan MENYALIN fungsi aslinya apa adanya
 * (bukan implementasi ulang), sehingga hitungan server == hitungan klien untuk data yang sama.
 * Data dibaca dari Sheets lewat shim di bawah (bentuk objek sama dengan model klien).
 * Fungsi publik: opObligations(opts), opObligationSnapshot(periode).
 * STATUS: diverifikasi lewat tes diferensial sandbox (klien vs server). BELUM dijalankan di Apps Script sungguhan.
 */
function BULAN_ID_LIST(){ return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function tahunAjaranStartYear(ta){ return parseInt(String(ta||'').split('/')[0],10)||new Date().getFullYear(); }
function parsePeriodeLabel(label){ const parts=String(label||'').split(' '); return {monthIdx: BULAN_ID_LIST().indexOf(parts[0]), year: parseInt(parts[1],10)}; }
function periodeLabelFromYM(y, mi){ return BULAN_ID_LIST()[mi]+' '+y; }
function enumeratePeriodesBulanan(siswa){
  const ta = siswa.tahunAjaran || Store.loadSettings().tahunAjaranAktif;
  let startY = tahunAjaranStartYear(ta), startM = 6; // Juli
  if(siswa.tanggalMasuk){ const d=new Date(siswa.tanggalMasuk+'T00:00:00'); if(!isNaN(d) && (d.getFullYear()>startY || (d.getFullYear()===startY&&d.getMonth()>startM))){ startY=d.getFullYear(); startM=d.getMonth(); } }
  const aktif = parsePeriodeLabel(Store.loadSettings().periodeAktif);
  let endY = aktif.year, endM = aktif.monthIdx;
  if(isNaN(endM)){ const t=new Date(); endY=t.getFullYear(); endM=t.getMonth(); }
  if(siswa.tanggalKeluar){ const dk=new Date(siswa.tanggalKeluar+'T00:00:00'); if(!isNaN(dk) && (dk.getFullYear()<endY || (dk.getFullYear()===endY&&dk.getMonth()<endM))){ endY=dk.getFullYear(); endM=dk.getMonth(); } }
  const out=[]; let y=startY, m=startM, guard=0;
  while((y<endY || (y===endY && m<=endM)) && guard<240){ out.push(periodeLabelFromYM(y,m)); m++; if(m>11){m=0;y++;} guard++; }
  return out;
}
function komponenApplicableForUnit(unit){ return MasterAPI.components().filter(k=>!k.unit||k.unit===unit); }
function tingkatFromKelas(kelas){
  const m = String(kelas||'').trim().match(/^(\d+)/);
  return m ? m[1] : '';
}
function tarifFor(komponenId, unit, kelas, tahunAjaran){
  const t = tarifRowFor(komponenId, unit, kelas, tahunAjaran);
  return t ? Number(t.nominal||0) : 0;
}
function tarifRowFor(komponenId, unit, kelas, tahunAjaran){
  const rows = MasterAPI.tariffs().filter(t=>t.komponenId===komponenId && t.status!=='Nonaktif' && (!t.unit||t.unit===unit) && (!t.kelas||t.kelas===kelas) && (!t.tahunAjaran||t.tahunAjaran===tahunAjaran));
  if(!rows.length) return null;
  const scored = rows.map(t=>({t, score:(t.kelas?4:0)+(t.unit?2:0)+(t.tahunAjaran?1:0)}));
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].t;
}
function cateringHariFor(unit, periode){
  const m = Store.loadCateringHari() || {};
  const v = m[unit+'|'+periode];
  if(v===undefined || v===null || v==='') return null;
  const n = Number(v);
  return (isFinite(n) && n>=0) ? n : null;
}
function pendaftaranStatusFor(siswaId, tahunAjaran){
  const r = (Store.loadPendaftaranStatus()||[]).find(x=>x.siswaId===siswaId && x.tahunAjaran===tahunAjaran);
  return r ? String(r.jenis||'') : '';
}
function komponenSasaranOk(siswa, k){
  const s = k.sasaran||'';
  if(!s || s==='SEMUA') return true;
  return pendaftaranStatusFor(siswa.id, siswa.tahunAjaran||Store.loadSettings().tahunAjaranAktif)===s;
}
function komponenDigantikan(siswa, k, periode){
  const ids = String(k.menggantikan||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!ids.length) return false;
  const comps = MasterAPI.components();
  const ta = String(siswa.tahunAjaran||Store.loadSettings().tahunAjaranAktif);
  const monthly = k.frekuensi==='Bulanan';
  return Store.loadTagihan().some(t=>{
    if(t.siswaId!==siswa.id) return false;
    const kk = comps.find(c=>c.nama===t.komponen);
    if(!kk || ids.indexOf(kk.id)===-1) return false;
    return monthly ? t.periode===periode : String(t.tahunAjaran||'')===ta;
  });
}
function keringananPotonganFor(siswaId, komponenId, bruto){
  const now = todayISO();
  const assigns = Store.loadKeringananAssignment().filter(a=>a.siswaId===siswaId && (!a.komponenId||a.komponenId===komponenId) && (!a.berlakuMulai||a.berlakuMulai<=now) && (!a.berlakuSampai||a.berlakuSampai>=now));
  if(!assigns.length) return {potongan:[], perluReview:false};
  const policies = Store.loadSettings().keringananPolicyList||[];
  const resolved = assigns.map(a=>({assign:a, policy:policies.find(p=>p.id===a.policyId)})).filter(x=>x.policy);
  const nonStackable = resolved.filter(x=>!x.policy.stackable);
  if(nonStackable.length>1) return {potongan:[], perluReview:true};
  const list = nonStackable.length ? nonStackable : resolved;
  const potongan = list.map(x=>{
    const nominal = x.policy.tipe==='PERCENTAGE' ? Math.round(bruto*Number(x.policy.nilai||0)/100) : Number(x.policy.nilai||0);
    return {policyId:x.policy.id, label:x.policy.labelDokumen||x.policy.nama, nominal:Math.min(nominal,bruto)};
  });
  return {potongan, perluReview:false};
}
function kewajibanSatuBaris(siswa, komponen, periode){
  const tingkat = tingkatFromKelas(siswa.kelas);
  const tr = tarifRowFor(komponen.id, siswa.unit, tingkat, siswa.tahunAjaran);
  const satuan = tr ? Number(tr.nominal||0) : 0;
  const perHari = komponen.basisTarif==='PER_HARI_TERJADWAL';
  const hari = perHari ? cateringHariFor(siswa.unit, periode) : null;
  const bruto = perHari ? (hari===null ? 0 : satuan*hari) : satuan;
  const {potongan, perluReview} = keringananPotonganFor(siswa.id, komponen.id, bruto);
  const totalPotongan = potongan.reduce((s,p)=>s+p.nominal,0);
  const nettoComputed = Math.max(0, bruto-totalPotongan);
  // [P1_23 D-1] cocok lewat komponenId (nama hanya untuk baris lama tanpa komponenId); duplikat historis -> pilihan deterministik
  const snaps = Store.loadTagihan().filter(t=>t.siswaId===siswa.id && (t.komponenId ? t.komponenId===komponen.id : t.komponen===komponen.nama) && t.periode===periode);
  const snap = snaps.length > 1 ? snaps.slice().sort((a,b)=>((String(a.id||'').indexOf('kw_')===0 ? 0 : 1) - (String(b.id||'').indexOf('kw_')===0 ? 0 : 1)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))[0] : snaps[0];
  return {
    key: siswa.id+'|'+komponen.id+'|'+periode, siswaId:siswa.id, komponenId:komponen.id, komponenNama:komponen.nama, periode,
    bruto: snap? Number(snap.tagihanBruto!=null?snap.tagihanBruto:bruto) : bruto,
    potongan: snap? (snap.potongan&&snap.potongan.length?snap.potongan:potongan) : potongan,
    netto: snap? Number(snap.tagihanNetto!=null?snap.tagihanNetto:nettoComputed) : nettoComputed,
    tagihanId: snap? snap.id : null, jatuhTempo: snap? snap.jatuhTempo : '', perluReview: !!perluReview,
    _legacyPembayaran: snap? Number(snap._legacyPembayaran||0) : 0,
    /* tarif + jumlah hari yang DIPAKAI disimpan pada kewajiban beku; snapshot lama tanpa field ini -> null (tidak diketahui, tidak ditebak) */
    tarifId: snap? (snap.tarifId||'') : (tr? tr.id : ''),
    tarifSatuan: snap? ((snap.tarifSatuan!==undefined && snap.tarifSatuan!==null && snap.tarifSatuan!=='') ? Number(snap.tarifSatuan) : null) : satuan,
    jumlahHari: snap? ((snap.jumlahHari!==undefined && snap.jumlahHari!==null && snap.jumlahHari!=='') ? Number(snap.jumlahHari) : null) : hari,
    hariBelumDiisi: !snap && perHari && hari===null
  };
}
function kewajibanForSiswa(siswaId, periodeFilter){
  const siswa = MasterAPI.students().find(s=>s.id===siswaId);
  if(!siswa) return [];
  const out = [], seen = new Set();
  const push = ob=>{ if(seen.has(ob.key)) return; seen.add(ob.key); out.push(ob); };
  komponenApplicableForUnit(siswa.unit).forEach(k=>{
    if(!komponenSasaranOk(siswa, k)) return;
    if(k.frekuensi==='Bulanan'){
      enumeratePeriodesBulanan(siswa).forEach(p=>{
        if(komponenDigantikan(siswa, k, p)) return;
        const ob = kewajibanSatuBaris(siswa, k, p);
        if(ob.bruto>0 || ob.tagihanId) push(ob);
      });
    } else {
      if(komponenDigantikan(siswa, k, '')) return;
      const p = k.frekuensi==='Tahunan' ? ('Tahun Ajaran '+(siswa.tahunAjaran||Store.loadSettings().tahunAjaranAktif)) : 'SekaliBayar';
      const ob = kewajibanSatuBaris(siswa, k, p);
      if(ob.bruto>0 || ob.tagihanId) push(ob);
    }
  });
  /* Riwayat: kewajiban BEKU milik siswa ini yang tidak lagi tercakup enumerasi (naik kelas / pindah tahun ajaran / komponen nonaktif / klasifikasi berubah)
     tetap ditampilkan apa adanya, supaya pembayaran historis tidak menjadi yatim. */
  const komps = MasterAPI.components();
  Store.loadTagihan().filter(t=>t.siswaId===siswaId).forEach(t=>{
    const k = t.komponenId ? komps.find(c=>c.id===t.komponenId) : komps.find(c=>c.nama===t.komponen); // [P1_23 D-1]
    if(!k || seen.has(siswaId+'|'+k.id+'|'+t.periode)) return;
    push(kewajibanSatuBaris(siswa, k, t.periode));
  });
  return periodeFilter ? out.filter(o=>o.periode===periodeFilter) : out;
}
function allObligationsAllSiswa(periodeFilter){
  const out = [];
  MasterAPI.students().filter(s=>(s.status||'Aktif')==='Aktif').forEach(s=>{ out.push.apply(out, kewajibanForSiswa(s.id, periodeFilter)); });
  return out;
}
function resolveObligationMatch(alokasi, ob){
  if(alokasi.tagihanId && ob.tagihanId && alokasi.tagihanId===ob.tagihanId) return true;
  return alokasi.siswaId===ob.siswaId && alokasi.komponenId===ob.komponenId && alokasi.periode===ob.periode;
}
function alokasiTerbayar(ob){
  const lewatAlokasi = OperationalAPI.alokasi().filter(a=>resolveObligationMatch(a,ob)).reduce((s,a)=>s+Number(a.nominal||0),0);
  return lewatAlokasi + Number(ob._legacyPembayaran||0);
}
function sisaObligation(ob){ return Math.max(0, Number(ob.netto||0) - alokasiTerbayar(ob)); }
function statusObligation(ob){
  const bayar = alokasiTerbayar(ob), netto = Number(ob.netto||0);
  if(bayar > netto+0.5) return 'KELEBIHAN BAYAR';
  if(bayar>0 && bayar>=netto-0.5) return 'LUNAS';
  if(bayar>0) return 'CICILAN';
  return 'BELUM BAYAR';
}

// ---- SHIM data (server) ----
var OBL_CTX_ = null;
var Store = {
  loadSettings: function () { return OBL_CTX_.settings; },
  loadTagihan: function () { return OBL_CTX_.tagihan; },
  loadKeringananAssignment: function () { return OBL_CTX_.assign; },
  loadCateringHari: function () { return OBL_CTX_.cateringHari; },
  loadPendaftaranStatus: function () { return OBL_CTX_.pendaftaran; }
};
var MasterAPI = {
  students: function () { return OBL_CTX_.students; },
  components: function () { return OBL_CTX_.components; },
  tariffs: function () { return OBL_CTX_.tariffs; }
};
var OperationalAPI = { alokasi: function () { return OBL_CTX_.alokasi; } };

function oblS_(v) { return (v === null || v === undefined) ? '' : String(v); }
function oblN_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function oblJson_(s, fb) { try { var v = JSON.parse(s); return v === null || v === undefined ? fb : v; } catch (e) { return fb; } }
function oblBlob_(map, name, fb) {
  var n = oblN_(map['blob.' + name + '.n']), parts = [];
  if (fb === undefined) fb = [];
  for (var i = 0; i < n; i++) parts.push(oblS_(map['blob.' + name + '.' + i]));
  return n ? oblJson_(parts.join(''), fb) : fb;
}
function oblLoadContext_() {
  var mk = function (sheet) { return sgRowsChecked_(sheet).filter(function (o) { return !o.archivedAt; }); }; // [P0-A] kolom wajib divalidasi
  var map = {}; mk('15_SETTINGS').forEach(function (r) { map[oblS_(r.key)] = r.value; });
  var now = new Date();
  var settings = {
    periodeAktif: oblS_(map.periodeAktif) || (BULAN_ID_LIST()[now.getMonth()] + ' ' + now.getFullYear()),
    tahunAjaranAktif: oblS_(map.tahunAjaranAktif) || (now.getMonth() >= 6 ? now.getFullYear() + '/' + (now.getFullYear() + 1) : (now.getFullYear() - 1) + '/' + now.getFullYear()),
    kebijakanEnrollmentTengahPeriode: oblS_(map.kebijakanEnrollmentTengahPeriode) || 'FULL',
    keringananPolicyList: oblJson_(map.keringananPolicyList, [])
  };
  var archTrx = {}; (function () { var m5 = opSheetModel_('05_TRANSAKSI'); if (!m5) return; var ia = m5.live.indexOf('archivedAt'), ii = m5.live.indexOf('id'); if (ia === -1 || ii === -1) return; m5.rows.forEach(function (r) { if (r[ia] !== '' && r[ia] !== null && r[ia] !== undefined) archTrx[String(r[ii])] = true; }); })();
  var komponen = mk('02_KOMPONEN').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), nama: oblS_(r.nama), unit: oblS_(r.unit), frekuensi: oblS_(r.frekuensi), status: oblS_(r.status), aliasOf: oblS_(r.aliasOf) }); });
  var byKomp = {}; komponen.forEach(function (k) { byKomp[k.id] = k; });
  var tagihan = mk('04_KEWAJIBAN').filter(function (r) { return oblS_(r.tagihanId) !== ''; }).map(function (r) {
    var pot = oblS_(r.potongan); var potArr = pot.charAt(0) === '[' ? oblJson_(pot, []) : [];
    return { id: oblS_(r.id), siswaId: oblS_(r.siswaId), komponenId: oblS_(r.komponenId), komponen: (byKomp[oblS_(r.komponenId)] || {}).nama || oblS_(r.komponenId), periode: oblS_(r.periode), tagihanBruto: oblN_(r.bruto), potongan: potArr, tagihanNetto: oblN_(r.netto), jatuhTempo: oblS_(r.jatuhTempo), tahunAjaran: oblS_(r.tahunAjaran), kelas: oblS_(r.kelas), unit: oblS_(r.unit), tarifId: oblS_(r.tarifId), tarifSatuan: oblS_(r.tarifSatuan) === '' ? null : oblN_(r.tarifSatuan), jumlahHari: oblS_(r.jumlahHari) === '' ? null : oblN_(r.jumlahHari) };
  });
  return {
    settings: settings,
    students: mk('01_SISWA').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), nama: oblS_(r.nama), nis: oblS_(r.nis), nisn: oblS_(r.nisn), kelas: oblS_(r.kelas), unit: oblS_(r.unit), tahunAjaran: oblS_(r.tahunAjaran), tanggalMasuk: oblS_(r.tanggalMasuk), tanggalKeluar: oblS_(r.tanggalKeluar), status: oblS_(r.status) || 'Aktif' }); }),
    components: komponen,
    tariffs: mk('03_TARIF').map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), komponenId: oblS_(r.komponenId), unit: oblS_(r.unit), kelas: oblS_(r.kelas), tahunAjaran: oblS_(r.tahunAjaran), nominal: oblN_(r.nominal), status: oblS_(r.status) }); }),
    alokasi: mk('06_ALOKASI').filter(function (r) { return !archTrx[oblS_(r.transaksiId)]; }).map(function (r) { return Object.assign({}, r, { id: oblS_(r.id), transaksiId: oblS_(r.transaksiId), siswaId: oblS_(r.siswaId), komponenId: oblS_(r.komponenId), periode: oblS_(r.periode), nominal: oblN_(r.nominal), caraBayar: oblS_(r.caraBayar) || null, tagihanId: oblS_(r.tagihanId) || null }); }),
    tagihan: tagihan,
    assign: oblBlob_(map, 'keringananAssignment'),
    cateringHari: oblBlob_(map, 'cateringHari', {}),
    pendaftaran: oblBlob_(map, 'pendaftaranStatus')
  };
}
function oblPublicRow_(ob) {
  var potTotal = (ob.potongan || []).reduce(function (s, p) { return s + oblN_(p.nominal); }, 0);
  return { key: ob.key, siswaId: ob.siswaId, komponenId: ob.komponenId, komponenNama: ob.komponenNama, periode: ob.periode, bruto: oblN_(ob.bruto), potonganTotal: potTotal, netto: oblN_(ob.netto), terbayar: alokasiTerbayar(ob), sisa: sisaObligation(ob), status: statusObligation(ob), tagihanId: ob.tagihanId || null, tarifId: ob.tarifId || '', tarifSatuan: (ob.tarifSatuan === undefined ? null : ob.tarifSatuan), jumlahHari: (ob.jumlahHari === undefined ? null : ob.jumlahHari), hariBelumDiisi: !!ob.hariBelumDiisi };
}
function opObligations(opts) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  try {
    var ks = kgStatus_(); if (!ks.ok) return kgErr_(ks); // [P1-IMP C] bukan daftar kosong
    OBL_CTX_ = oblLoadContext_();
    var raw = opts.siswaId ? kewajibanForSiswa(String(opts.siswaId), opts.periode || undefined) : allObligationsAllSiswa(opts.periode || undefined);
    var rows = raw.map(oblPublicRow_);
    var tot = rows.reduce(function (t, r) { t.bruto += r.bruto; t.netto += r.netto; t.terbayar += r.terbayar; t.sisa += r.sisa; return t; }, { bruto: 0, netto: 0, terbayar: 0, sisa: 0 });
    return okResult_('OK', { rows: rows, count: rows.length, totals: tot, periodeAktif: OBL_CTX_.settings.periodeAktif, computedAt: new Date().toISOString(), statusData: 'LENGKAP' }); // [P1-IMP C] kosong di sini = kewajiban nol yang sah
  } catch (e) {
    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung kewajiban');
  } finally { OBL_CTX_ = null; }
}
function oblHash_(s) { var h = 2166136261, h2 = 5381; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0; } return h.toString(16) + h2.toString(16); }
function oblSnapshotRow_(ob, siswa, id, now) {
  return { siswaId: ob.siswaId, komponenId: ob.komponenId, periode: ob.periode, bruto: oblN_(ob.bruto), potongan: JSON.stringify(ob.potongan || []), netto: oblN_(ob.netto), tagihanId: id, computedAt: now,
    tahunAjaran: (siswa && siswa.tahunAjaran) || '', kelas: (siswa && siswa.kelas) || '', unit: (siswa && siswa.unit) || '',
    tarifId: oblS_(ob.tarifId), tarifSatuan: (ob.tarifSatuan === null || ob.tarifSatuan === undefined) ? '' : oblN_(ob.tarifSatuan), jumlahHari: (ob.jumlahHari === null || ob.jumlahHari === undefined) ? '' : oblN_(ob.jumlahHari) };
}
/* Inti pembekuan kewajiban. opts: { periode, semua, komponenIds[], siswaIds[], onlyWithAllocations }.
   Kewajiban yang SUDAH beku (punya tagihanId) tidak pernah disentuh -> tarif/hari yang dipakai tidak berubah walau tarif berubah. */
function oblSnapshotCore_(opts) {
  var ks0 = kgStatus_(); if (!ks0.ok) return kgErr_(ks0); // [P1-IMP C]
  try {
    OBL_CTX_ = oblLoadContext_();
    var byId = {}; OBL_CTX_.students.forEach(function (s) { byId[s.id] = s; });
    var kSet = null, sSet = null, i;
    if (opts.komponenIds && opts.komponenIds.length) { kSet = {}; opts.komponenIds.forEach(function (k) { kSet[k] = true; }); }
    if (opts.siswaIds && opts.siswaIds.length) { sSet = {}; opts.siswaIds.forEach(function (k) { sSet[k] = true; }); }
    var pool = OBL_CTX_.students.filter(function (s) { return (opts.onlyWithAllocations || (s.status || 'Aktif') === 'Aktif') && (!sSet || sSet[s.id]); });
    var obls = [];
    pool.forEach(function (s) {
      kewajibanForSiswa(s.id, opts.semua ? undefined : opts.periode).forEach(function (ob) {
        if (ob.tagihanId || !(oblN_(ob.bruto) > 0)) return;
        if (kSet && !kSet[ob.komponenId]) return;
        if (opts.onlyWithAllocations && !(alokasiTerbayar(ob) > 0)) return;
        obls.push(ob);
      });
    });
    OBL_CTX_ = null;
    var m = opSheetModel_('04_KEWAJIBAN');
    if (!m) return errResult_('SCHEMA_MISMATCH', 'Sheet 04_KEWAJIBAN tidak ditemukan', null);
    var live = m.live, existing = {};
    m.rows.forEach(function (r) { var o = opRowObj_(live, r); existing[String(o.id)] = o; });
    var now = new Date().toISOString(), ops = [], lost = [];
    obls.forEach(function (ob) {
      var id = 'kw_' + oblHash_(ob.key);
      var full = oblSnapshotRow_(ob, byId[ob.siswaId], id, now);
      var ex = existing[id];
      if (ex && oblS_(ex.tagihanId) !== '' && !ex.archivedAt) return;
      var out = {};
      Object.keys(full).forEach(function (k) { if (live.indexOf(k) !== -1) out[k] = full[k]; else if (full[k] !== '' && k !== 'computedAt') lost.push(k); });
      ops.push({ op: 'upsert', id: id, row: out });
    });
    if (lost.length) return errResult_('SCHEMA_ADDITIVE_REQUIRED', 'Kolom 04_KEWAJIBAN belum ada: ' + lost.filter(function (v, k, arr) { return arr.indexOf(v) === k; }).join(', ') + ' - jalankan Migrasi Skema Aditif', 'schema');
    var created = 0, updated = 0, failed = 0;
    for (i = 0; i < ops.length; i += 200) {
      var r = opRecordBatch('kewajiban', ops.slice(i, i + 200));
      if (!r.ok) return r;
      created += r.data.created; updated += r.data.updated; failed += r.data.failed;
    }
    return okResult_('Kewajiban dibekukan', { dihitung: obls.length, dibuat: created, diperbarui: updated, gagal: failed, tidakBerubah: obls.length - ops.length });
  } catch (e) {
    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal membuat snapshot kewajiban');
  } finally { OBL_CTX_ = null; }
}
function opObligationSnapshot(periode, opts) {
  var g = opGate_(OP_WRITE_ROLES_); if (!g.ok) return g;
  opts = opts && typeof opts === 'object' ? opts : {};
  periode = opStr_(periode);
  var semua = !!opts.semua || periode === '*';
  if (!semua && !periode) return errResult_('VALIDATION_ERROR', 'periode wajib diisi', 'periode');
  var res = oblSnapshotCore_({ periode: semua ? '' : periode, semua: semua, komponenIds: opts.komponenIds, siswaIds: opts.siswaIds, onlyWithAllocations: !!opts.onlyWithAllocations });
  if (res && res.ok) { res.data.periode = semua ? '*' : periode; res.message = 'Snapshot kewajiban ' + (semua ? '(semua periode)' : 'periode ' + periode) + ' disimpan'; }
  return res;
}
