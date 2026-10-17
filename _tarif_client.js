
/* ============================================================
   15e. TARIF 2026/2027, KEWAJIBAN, ALOKASI, ANGGARAN PER KOMPONEN
   Tidak menulis apa pun ke Sheets/localStorage kecuali lewat tombol eksplisit + konfirmasi.
   Hitungan tarif (tpSpec_/tpCompute_/tpImpact_) memakai kode IDENTIK dengan server (TarifPlan.gs).
   ============================================================ */
const TP_CONFIRM_TOKEN = 'TERAPKAN_RENCANA_TARIF';
const TP_MEM = {last:null};

function tpCtx_(){ return {students:MasterAPI.students(), tarif:MasterAPI.tariffs(), alokasi:OperationalAPI.alokasi(), komponen:MasterAPI.components()}; }
function tpLocalPlan_(){
  const c = tpCtx_(), spec = tpSpec_(), plan = tpCompute_(c.komponen, c.tarif, spec);
  return {plan:plan, impact:tpImpact_(c, plan, spec), schema:{ok:true, missing:[]}, bentrok:[], sumber:'klien'};
}
function tagihanSnapshotRow_(ob, siswa){
  return {id:uid('tagihan'), siswaId:ob.siswaId, komponen:ob.komponenNama, periode:ob.periode, tagihanBruto:ob.bruto, potongan:ob.potongan || [], tagihanNetto:ob.netto, jatuhTempo:ob.jatuhTempo || '',
    tahunAjaran:siswa.tahunAjaran || '', kelas:siswa.kelas || '', unit:siswa.unit || '', tarifId:ob.tarifId || '', tarifSatuan:ob.tarifSatuan, jumlahHari:ob.jumlahHari};
}
/* Membekukan kewajiban (snapshot ke Tagihan -> 04_KEWAJIBAN). Tidak pernah menimpa snapshot yang sudah ada. */
function freezeObligationsFor_(opts){
  opts = opts || {};
  const komSet = opts.komponenIds ? new Set(opts.komponenIds) : null, idSet = opts.siswaIds ? new Set(opts.siswaIds) : null, perSet = opts.periods ? new Set(opts.periods) : null;
  const arr = Store.loadTagihan(); let n = 0;
  MasterAPI.students().forEach(function(s){
    if(idSet && !idSet.has(s.id)) return;
    if(!opts.onlyWithAllocations && (s.status || 'Aktif') !== 'Aktif') return;
    kewajibanForSiswa(s.id).forEach(function(ob){
      if(ob.tagihanId || !(ob.bruto > 0)) return;
      if(komSet && !komSet.has(ob.komponenId)) return;
      if(perSet && !perSet.has(ob.periode)) return;
      if(opts.onlyWithAllocations && !(alokasiTerbayar(ob) > 0)) return;
      arr.push(tagihanSnapshotRow_(ob, s)); n++;
    });
  });
  if(n) Store.saveTagihan(arr);
  return n;
}
function tpCateringIds_(){ return MasterAPI.components().filter(k=>k.basisTarif === 'PER_HARI_TERJADWAL').map(k=>k.id); }

/* ---- rencana tarif: dry-run, penerapan, rendering ---- */
function tpRenderPlan_(d){
  const p = d.plan, im = d.impact || {}, rs = p.ringkasan;
  const kn = id=>{ const k = MasterAPI.components().find(x=>x.id === id); return k ? k.nama : id; };
  let h = '<p><b>Ringkasan (dry-run, belum ada yang ditulis):</b> komponen baru ' + rs.komponenAdd + ' &middot; komponen sudah ada ' + rs.komponenOk + ' &middot; tarif baru ' + rs.tarifAdd + ' &middot; tarif sudah sesuai ' + rs.tarifOk +
    ' &middot; <b>tarif akan dinonaktifkan ' + rs.tarifDeactivate + '</b> &middot; konflik ' + (rs.komponenKonflik + rs.tarifKonflik) + ' &middot; perlu aktivasi manual ' + rs.tarifPerluAktivasi + '. Sumber hitung: ' + esc(d.sumber || 'server') + '.</p>';
  if(d.schema && !d.schema.ok) h += '<p><span class="badge red">Skema belum siap</span> kolom belum ada: ' + esc((d.schema.missing || []).join(', ')) + ' - jalankan "Terapkan migrasi aditif" lebih dulu.</p>';
  h += '<div class="section-title">Pemeriksaan jumlah komponen vs total sumber</div><div class="tablewrap"><table><thead><tr><th>Pemeriksaan</th><th class="right">Di sumber</th><th class="right">Jumlah komponen</th><th>Hasil</th></tr></thead><tbody>' +
    p.totals.map(t=>'<tr><td>' + esc(t.label) + '</td><td class="right">' + fmtRp(t.expected) + '</td><td class="right">' + fmtRp(t.actual) + '</td><td>' + (t.ok ? '<span class="badge green">COCOK</span>' : '<span class="badge red">SELISIH ' + fmtRp(t.selisih) + ' - PERLU KONFIRMASI</span>') + '</td></tr>').join('') + '</tbody></table></div>';
  h += '<div class="section-title">Tarif lump 2026/2027 yang akan DINONAKTIFKAN (tidak dihapus)</div><div class="tablewrap"><table><thead><tr><th>Komponen</th><th>Unit</th><th>Kelas</th><th class="right">Nominal</th><th>Alasan</th></tr></thead><tbody>' +
    (p.tarifDeactivate.length ? p.tarifDeactivate.map(t=>'<tr><td>' + esc(kn(t.komponenId)) + '</td><td>' + esc(t.unit || 'Semua') + '</td><td>' + esc(t.kelas || 'Semua') + '</td><td class="right">' + fmtRp(t.nominal) + '</td><td class="small-muted">' + esc(t.alasan) + '</td></tr>').join('') : '<tr><td colspan="5" class="empty">Tidak ada.</td></tr>') + '</tbody></table></div>';
  if(p.tarifKonflik.length || p.komponenKonflik.length || p.tarifPerluAktivasi.length) h += '<div class="section-title">Konflik / perlu keputusan manusia (TIDAK ditimpa otomatis)</div><ul>' +
    p.komponenKonflik.map(c=>'<li>Komponen ' + esc(c.id) + ': ' + esc(c.alasan) + '</li>').join('') + p.tarifKonflik.map(c=>'<li>Tarif ' + esc(c.id) + ': ' + esc(c.alasan) + ' (ada ' + esc(c.ada) + ', sumber ' + esc(c.rencana.nominal) + ')</li>').join('') +
    p.tarifPerluAktivasi.map(c=>'<li>Tarif ' + esc(c.id) + ': ' + esc(c.alasan) + '</li>').join('') + '</ul>';
  h += '<div class="section-title">Laporan dampak</div><div class="tablewrap"><table><thead><tr><th>Kelas MI</th><th class="right">Siswa aktif</th><th class="right">Tagihan tahunan sekarang (lump)</th><th class="right">Menurut sumber</th><th class="right">Selisih / siswa</th><th class="right">Selisih total</th></tr></thead><tbody>' +
    (im.tahunanMi || []).map(r=>'<tr><td>' + r.kelas + '</td><td class="right">' + r.siswa + '</td><td class="right">' + fmtRp(r.lamaPerSiswa) + '</td><td class="right">' + fmtRp(r.baruPerSiswa) + '</td><td class="right">' + fmtRp(r.selisihPerSiswa) + '</td><td class="right">' + fmtRp(r.selisihTotal) + '</td></tr>').join('') + '</tbody></table></div>';
  h += '<p><b>Alokasi pembayaran yang menempel pada komponen lump (akan DIBEKUKAN agar riwayat tidak berubah):</b> ' + ((im.alokasiTerdampak || []).length ? (im.alokasiTerdampak.map(a=>esc(kn(a.komponenId)) + ' ' + esc(a.unit) + ': ' + a.jumlahAlokasi + ' alokasi / ' + fmtRp(a.nominal) + ' / ' + a.jumlahSiswa + ' siswa').join('; ')) : 'tidak ada') + '.</p>';
  h += '<p><b>Siswa yang saat ini ditagih lump masuk/daftar ulang:</b> ' + (im.lumpDitagihKe || []).map(x=>esc(kn(x.komponenId)) + ' ' + esc(x.unit) + (x.kelas ? ' K' + esc(x.kelas) : '') + ': ' + x.jumlahSiswaYangKiniDitagih + ' siswa').join('; ') + '. Setelah diterapkan, biaya masuk/daftar ulang hanya ditagih ke siswa yang SUDAH diklasifikasi (BARU/DAFTAR_ULANG).</p>';
  if((d.bentrok || []).length) h += '<p><span class="badge amber">' + d.bentrok.length + ' siswa</span> sudah punya pembayaran pada tagihan lump lama; tagihan lump mereka DIBEKUKAN apa adanya dan rincian baru TIDAK ditagihkan (hindari tagihan ganda). Koreksi nilai lump yang berbeda dari sumber perlu keputusan manusia.</p>';
  h += '<div class="section-title">Perlu konfirmasi manusia (' + p.confirm.length + ')</div><ol>' + p.confirm.map(c=>'<li><b>' + esc(c.kode) + '</b>: ' + esc(c.teks) + '</li>').join('') + '</ol>';
  h += '<p class="small-muted">Komponen baru: ' + p.komponenAdd.map(k=>esc(k.nama)).join('; ') + '</p>';
  return h;
}
function pdTarifPlan(){
  pdOut_('pdTarifOut', 'Memeriksa…');
  const run = ()=>{
    if(centralReady_() && ServerBridge.opTarifPlan) return ServerBridge.opTarifPlan().then(function(res){ if(!res || !res.ok) throw new Error(centralErrText(res)); const d = res.data; d.sumber = 'server (Google Sheets)'; return d; });
    return Promise.resolve(tpLocalPlan_());
  };
  return run().then(function(d){ TP_MEM.last = d; pdOut_('pdTarifOut', tpRenderPlan_(d)); return d; }).catch(function(e){ pdOut_('pdTarifOut', '<span class="badge red">' + esc(e.message) + '</span>'); return null; });
}
function pdTarifApply(){
  openModal('<h3>Terapkan Rencana Tarif 2026/2027</h3><p>Aksi ini: (1) <b>membekukan</b> kewajiban yang sudah punya pembayaran pada komponen lump lama, (2) <b>menambah</b> komponen &amp; tarif rincian, (3) <b>menonaktifkan</b> (bukan menghapus) tarif lump 2026/2027 yang digantikan. Tidak menghapus data, tidak mengubah transaksi/alokasi. Tercatat di audit. Sebaiknya jalankan "Lihat rencana" dan baca laporan dampak lebih dulu.</p>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn danger" onclick="pdTarifApplyConfirmed()">Ya, terapkan</button></div>');
}
function tarifApplyLocal_(){
  const d = tpLocalPlan_(), p = d.plan;
  if(!p.ringkasan.totalsSemuaCocok) return {ok:false, message:'Jumlah komponen tidak cocok dengan total sumber - ditolak'};
  if(p.komponenKonflik.length) return {ok:false, message:'Ada komponen konflik - ditolak, selesaikan manual'};
  const komDeact = Array.from(new Set(p.tarifDeactivate.map(t=>t.komponenId)));
  const frozen = freezeObligationsFor_({komponenIds:komDeact, onlyWithAllocations:true});
  const rawSet = Store.loadSettings(), list = (rawSet.komponenBiayaList || []).slice();
  p.komponenAdd.forEach(k=>{ list.push(Object.assign({}, k)); });
  if(p.komponenAdd.length){ rawSet.komponenBiayaList = list; Store.saveSettings(rawSet); }
  const tarif = Store.loadTarif().slice();
  p.tarifAdd.forEach(t=>{ tarif.push({id:t.id, komponenId:t.komponenId, unit:t.unit, kelas:t.kelas, tahunAjaran:t.tahunAjaran, nominal:t.nominal, status:'Aktif'}); });
  const deact = new Set(p.tarifDeactivate.map(t=>t.id));
  tarif.forEach(t=>{ if(deact.has(t.id)) t.status = 'Nonaktif'; });
  Store.saveTarif(tarif);
  auditTrailPush('TARIF_RENCANA_DITERAPKAN', null, {ringkasan:p.ringkasan, dibekukan:frozen}, 'manual');
  return {ok:true, message:'Rencana tarif diterapkan (lokal)', dibekukan:frozen, ringkasan:p.ringkasan};
}
function pdTarifApplyConfirmed(){
  closeModal();
  if(centralReady_() && ServerBridge.opTarifApply){
    return ServerBridge.opTarifApply(TP_CONFIRM_TOKEN).then(function(res){
      toast(res && res.ok ? ('Rencana tarif diterapkan: ' + res.message) : ('Gagal: ' + centralErrText(res)));
      return loadOperationalData().then(function(){ return loadCentralMasterData({skipOperational:true}); }).then(function(){ pdOut_('pdTarifOut', res && res.ok ? ('<p><b>Selesai.</b> ' + esc(JSON.stringify(res.data.ringkasan || res.data)) + '</p>') : ('<span class="badge red">' + esc(centralErrText(res)) + '</span>')); renderContent(); return res; });
    });
  }
  const r = tarifApplyLocal_(); toast(r.message); pdOut_('pdTarifOut', '<p>' + esc(r.message) + (r.ok ? ' - dibekukan: ' + r.dibekukan : '') + '</p>'); renderContent(); return Promise.resolve(r);
}

/* ---- jumlah hari katering terjadwal ---- */
function tpMonthsOfTa_(ta){
  const y0 = tahunAjaranStartYear(ta), out = [];
  for(let i = 0; i < 12; i++){ const m = (6 + i) % 12, y = y0 + (6 + i >= 12 ? 1 : 0); out.push(periodeLabelFromYM(y, m)); }
  return out;
}
function renderCateringHariPanel_(){
  const ta = Store.loadSettings().tahunAjaranAktif, months = tpMonthsOfTa_(ta), cur = Store.loadCateringHari() || {};
  return '<div class="card"><h3>Hari Katering Terjadwal MI (' + esc(ta) + ')</h3><p class="small-muted">Tagihan katering = tarif per hari x jumlah hari katering TERJADWAL bulan itu (siswa tidak hadir tetap ditagih). Kosong = kewajiban bulan itu belum bisa dihitung (tidak ada nilai bawaan). Mengubah hari TIDAK mengubah kewajiban yang sudah dibekukan.</p>' +
    '<div class="tablewrap"><table><thead><tr>' + months.map(m=>'<th>' + esc(m) + '</th>').join('') + '</tr></thead><tbody><tr>' +
    months.map((m, i)=>'<td><input id="cth_' + i + '" type="number" min="0" max="31" step="1" style="width:64px" value="' + esc(cur['MI|' + m] === undefined ? '' : cur['MI|' + m]) + '"></td>').join('') + '</tr></tbody></table></div>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn primary" onclick="pdCateringSave()">Simpan hari katering</button></div></div>';
}
function pdCateringSave(){
  const ta = Store.loadSettings().tahunAjaranAktif, months = tpMonthsOfTa_(ta), before = Store.loadCateringHari() || {}, next = Object.assign({}, before), changed = [];
  for(let i = 0; i < months.length; i++){
    const raw = String(val('cth_' + i) === undefined ? '' : val('cth_' + i)).trim(), key = 'MI|' + months[i];
    if(raw === ''){ if(key in next){ delete next[key]; changed.push(months[i]); } continue; }
    const n = Number(raw);
    if(!isFinite(n) || n < 0 || n > 31 || Math.floor(n) !== n){ toast('Hari ' + months[i] + ' harus bilangan bulat 0-31'); return; }
    if(next[key] !== n){ next[key] = n; changed.push(months[i]); }
  }
  if(!changed.length){ toast('Tidak ada perubahan'); return; }
  const frozen = freezeObligationsFor_({komponenIds:tpCateringIds_(), onlyWithAllocations:true, periods:changed});
  Store.saveCateringHari(next);
  auditTrailPush('KATERING_HARI_TERJADWAL', before, next, 'manual');
  toast('Hari katering disimpan' + (frozen ? (' (' + frozen + ' kewajiban berpembayaran dibekukan lebih dulu)') : '')); renderContent();
}

/* ---- klasifikasi pendaftaran siswa (BARU / DAFTAR_ULANG) per tahun ajaran ---- */
function renderKlasifikasiPanel_(){
  const ta = Store.loadSettings().tahunAjaranAktif, cur = Store.loadPendaftaranStatus() || [];
  const students = MasterAPI.students().filter(s=>(s.status || 'Aktif') === 'Aktif' && (s.tahunAjaran || ta) === ta);
  return '<div class="card"><h3>Klasifikasi Pendaftaran Siswa (' + esc(ta) + ')</h3><p class="small-muted">Biaya masuk hanya ditagih ke siswa BARU; daftar ulang TK hanya ke siswa DAFTAR_ULANG. Tidak ada klasifikasi dugaan - kosong = tidak ditagih biaya masuk/daftar ulang.</p>' +
    '<div class="tablewrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Nama</th><th>Unit</th><th>Kelas</th><th>Klasifikasi</th></tr></thead><tbody>' +
    students.map((s, i)=>{ const r = cur.find(x=>x.siswaId === s.id && x.tahunAjaran === ta); return '<tr><td>' + esc(s.nama) + '</td><td>' + esc(s.unit) + '</td><td>' + esc(s.kelas) + '</td><td><select id="kls_' + i + '">' +
      ['', 'BARU', 'DAFTAR_ULANG'].map(o=>'<option value="' + o + '"' + (((r && r.jenis) || '') === o ? ' selected' : '') + '>' + (o || '- belum -') + '</option>').join('') + '</select></td></tr>'; }).join('') +
    '</tbody></table></div><div class="modal-actions" style="justify-content:flex-start"><button class="btn primary" onclick="pdKlasifikasiSave()">Simpan klasifikasi</button></div></div>';
}
function pdKlasifikasiSave(){
  const ta = Store.loadSettings().tahunAjaranAktif, before = Store.loadPendaftaranStatus() || [], next = before.filter(x=>x.tahunAjaran !== ta);
  const students = MasterAPI.students().filter(s=>(s.status || 'Aktif') === 'Aktif' && (s.tahunAjaran || ta) === ta);
  const changedIds = [];
  students.forEach(function(s, i){
    const j = String(val('kls_' + i) || ''), prev = (before.find(x=>x.siswaId === s.id && x.tahunAjaran === ta) || {}).jenis || '';
    if(j) next.push({id:'pds_' + s.id.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60) + '_' + ta.replace('/', '_'), siswaId:s.id, tahunAjaran:ta, jenis:j, updatedAt:new Date().toISOString()});
    if(j !== prev) changedIds.push(s.id);
  });
  before.filter(x=>x.tahunAjaran === ta && !students.some(s=>s.id === x.siswaId)).forEach(x=>next.push(x)); // siswa nonaktif: klasifikasi lama dipertahankan
  if(!changedIds.length){ toast('Tidak ada perubahan'); return; }
  const sasaranIds = MasterAPI.components().filter(k=>k.sasaran && k.sasaran !== 'SEMUA').map(k=>k.id);
  const frozen = freezeObligationsFor_({siswaIds:changedIds, komponenIds:sasaranIds, onlyWithAllocations:true});
  Store.savePendaftaranStatus(next);
  auditTrailPush('KLASIFIKASI_PENDAFTARAN', {jumlah:before.length}, {jumlah:next.length, diubah:changedIds.length}, 'manual');
  toast('Klasifikasi disimpan (' + changedIds.length + ' siswa)' + (frozen ? (', ' + frozen + ' kewajiban berpembayaran dibekukan') : '')); renderContent();
}

/* ---- pemeriksaan kelengkapan data tarif/kewajiban (hanya baca) ---- */
function tarifAudit_(){
  const out = {hariKosong:[], belumDiklasifikasi:0, tanpaTarifSpp:[], jumlahSiswa:0};
  const ta = Store.loadSettings().tahunAjaranAktif, aktif = parsePeriodeLabel(Store.loadSettings().periodeAktif), months = tpMonthsOfTa_(ta);
  const hari = Store.loadCateringHari() || {};
  const hasKat = MasterAPI.components().some(k=>k.basisTarif === 'PER_HARI_TERJADWAL' && k.status !== 'Nonaktif');
  if(hasKat){
    months.forEach(function(m){ const pm = parsePeriodeLabel(m); if(pm.year > aktif.year || (pm.year === aktif.year && pm.monthIdx > aktif.monthIdx)) return; if(hari['MI|' + m] === undefined) out.hariKosong.push(m); });
  }
  const sasaran = MasterAPI.components().filter(k=>k.sasaran && k.sasaran !== 'SEMUA' && k.status !== 'Nonaktif');
  const cls = Store.loadPendaftaranStatus() || [];
  MasterAPI.students().filter(s=>(s.status || 'Aktif') === 'Aktif').forEach(function(s){
    out.jumlahSiswa++;
    const punya = sasaran.some(k=>!k.unit || k.unit === s.unit);
    if(punya && !cls.some(x=>x.siswaId === s.id && x.tahunAjaran === (s.tahunAjaran || ta))) out.belumDiklasifikasi++;
    const spp = MasterAPI.components().find(k=>k.id === 'kmp_spp');
    if(spp && tarifFor('kmp_spp', s.unit, tingkatFromKelas(s.kelas), s.tahunAjaran || ta) <= 0) out.tanpaTarifSpp.push(s.nama + ' (' + s.unit + ' ' + s.kelas + ')');
  });
  return out;
}
function renderTarifAuditHtml_(){
  const a = tarifAudit_();
  return '<ul><li>Hari katering belum diisi sampai periode aktif: ' + (a.hariKosong.length ? '<span class="badge red">' + esc(a.hariKosong.join(', ')) + '</span>' : '<span class="badge green">lengkap / tidak berlaku</span>') + '</li>' +
    '<li>Siswa aktif belum diklasifikasi (ada biaya masuk/daftar ulang berlaku di unitnya): <b>' + a.belumDiklasifikasi + '</b> dari ' + a.jumlahSiswa + '</li>' +
    '<li>Siswa aktif tanpa tarif SPP yang cocok: ' + (a.tanpaTarifSpp.length ? '<span class="badge red">' + a.tanpaTarifSpp.length + '</span> ' + esc(a.tanpaTarifSpp.slice(0, 8).join('; ')) + (a.tanpaTarifSpp.length > 8 ? ' …' : '') : '<span class="badge green">0</span>') + '</li></ul>';
}
function pdFreezeAll(){
  if(centralReady_() && ServerBridge.opObligationSnapshot){
    return ServerBridge.opObligationSnapshot('*', {semua:true}).then(function(res){ toast(res && res.ok ? ('Dibekukan: ' + res.data.dibuat + ' baru, ' + res.data.tidakBerubah + ' sudah beku') : ('Gagal: ' + centralErrText(res))); CentralSync.refresh.add('kewajiban'); return loadOperationalData(['kewajiban']).then(function(){ renderContent(); return res; }); });
  }
  const n = freezeObligationsFor_({}); toast('Dibekukan: ' + n + ' kewajiban'); renderContent(); return Promise.resolve(n);
}
function renderPengaturanTarifKewajiban(){
  return '<div class="card"><h3>Tarif &amp; Kewajiban 2026/2027</h3><p class="small-muted">Sumber: RINCIAN BIAYA TAHUNAN MI 2026-2027.xlsx, Rincian Biaya Masuk MI TA 2026-2027.pdf, BIAYA Masuk Daftar Ulang SPP TK 2026-2027.docx, dan aturan SPP/katering Bendahara. "Lihat rencana" hanya membandingkan (dry-run) dan menampilkan laporan dampak; penerapan butuh konfirmasi eksplisit.</p>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="pdTarifPlan()">Lihat rencana &amp; dampak</button><button class="btn danger" onclick="pdTarifApply()">Terapkan rencana tarif…</button><button class="btn" onclick="pdFreezeAll()">Bekukan semua kewajiban saat ini</button></div>' +
    '<div class="section-title">Kelengkapan data</div>' + renderTarifAuditHtml_() + '<div id="pdTarifOut"></div></div>' + renderCateringHariPanel_() + renderKlasifikasiPanel_();
}

/* ---- anggaran terhubung ke komponen (pemasukan) / kategori+subkategori (pengeluaran) ---- */
function openAnggaranForm(){
  const unitOpts = ['', 'TK', 'MI'], kom = MasterAPI.components().filter(k=>k.status !== 'Nonaktif').map(k=>({value:k.id, label:k.nama + (k.unit ? ' (' + k.unit + ')' : '')}));
  const kat = MasterAPI.expenseCategories().filter(k=>k.status !== 'Nonaktif').map(k=>k.kategori);
  const subs = MasterAPI.subcategories().filter(s=>s.status !== 'Nonaktif').map(s=>{ const p = MasterAPI.expenseCategories().find(k=>k.id === s.kategoriId); return {value:s.nama, label:(p ? p.kategori + ' / ' : '') + s.nama}; });
  openModal('<h3>Tambah Anggaran/RAB</h3>' +
    fieldSelect('agf_jenis', 'Jenis', ['PENGELUARAN', 'PEMASUKAN'], 'PENGELUARAN') +
    fieldSelect('agf_unit', 'Unit (wajib)', unitOpts, '') +
    fieldText('agf_program', 'Program/Uraian', '') +
    fieldText('agf_periode', 'Periode (mis. September 2026 atau Tahun Ajaran 2026/2027)', Store.loadSettings().periodeAktif) +
    fieldText('agf_nominal', 'Nominal', '', 'number') +
    fieldSelect('agf_komponen', 'Komponen penerimaan (wajib untuk PEMASUKAN)', [{value:'', label:'- pilih -'}].concat(kom), '') +
    fieldSelect('agf_kategori', 'Kategori pengeluaran (wajib untuk PENGELUARAN)', [{value:'', label:'- pilih -'}].concat(kat.map(k=>({value:k, label:k}))), '') +
    fieldSelect('agf_subkategori', 'Subkategori (opsional)', [{value:'', label:'- tidak ada -'}].concat(subs), '') +
    fieldSelect('agf_status', 'Status', ['Diajukan', 'Disetujui'], 'Diajukan') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button><button class="btn primary" onclick="submitAnggaran()">Simpan</button></div>');
}
function anggaranValidate_(d){
  if(!d.program) return 'Program/Uraian wajib diisi';
  if(!d.periode) return 'Periode wajib diisi';
  if(!(Number(d.nominal) > 0)) return 'Nominal harus lebih dari 0';
  if(d.unit !== 'TK' && d.unit !== 'MI') return 'Unit (TK/MI) wajib dipilih';
  if(d.jenis === 'PEMASUKAN'){
    const k = MasterAPI.components().find(x=>x.id === d.komponenId);
    if(!k) return 'Anggaran PEMASUKAN wajib terhubung ke komponen penerimaan';
    if(k.unit && k.unit !== d.unit) return 'Komponen ' + k.nama + ' hanya berlaku untuk unit ' + k.unit;
    if(d.kategori || d.subkategori) return 'Anggaran PEMASUKAN tidak memakai kategori/subkategori pengeluaran';
  } else {
    const kt = MasterAPI.expenseCategories().find(x=>x.kategori === d.kategori);
    if(!kt) return 'Anggaran PENGELUARAN wajib terhubung ke kategori pengeluaran';
    if(d.subkategori){ const sk = MasterAPI.subcategories().find(x=>x.nama === d.subkategori && x.kategoriId === kt.id); if(!sk) return 'Subkategori bukan milik kategori ' + d.kategori; }
    if(d.komponenId) return 'Anggaran PENGELUARAN tidak memakai komponen penerimaan';
  }
  return '';
}
function submitAnggaran(){
  const d = {jenis:val('agf_jenis') || 'PENGELUARAN', unit:val('agf_unit'), program:String(val('agf_program') || '').trim(), periode:String(val('agf_periode') || '').trim(), nominal:numval('agf_nominal'),
    komponenId:val('agf_komponen') || '', kategori:val('agf_kategori') || '', subkategori:val('agf_subkategori') || '', status:val('agf_status')};
  const err = anggaranValidate_(d);
  if(err){ toast(err); return; }
  const rec = {id:uid('rab'), program:d.program, periode:d.periode, nominal:d.nominal, status:d.status, jenis:d.jenis, unit:d.unit};
  if(d.jenis === 'PEMASUKAN') rec.komponenId = d.komponenId; else { rec.kategori = d.kategori; if(d.subkategori) rec.subkategori = d.subkategori; }
  const arr = Store.loadAnggaran();
  arr.push(rec);
  Store.saveAnggaran(arr);
  auditTrailPush('TAMBAH_ANGGARAN', null, rec, 'manual');
  closeModal(); toast('Anggaran tersimpan'); renderContent();
}
function renderAnggaranBandingHtml_(ab){
  let h = '<div class="small-muted">Pemasukan: aktual = ALOKASI pembayaran ke komponen (bukan nominal transaksi). Pengeluaran: aktual = transaksi pengeluaran pada kategori/subkategori, unit, dan periode yang sama. Komitmen dan tagihan ditampilkan terpisah dan tidak dijumlahkan ke aktual.</div>';
  const rows = (ab && ab.rows) || [];
  h += '<div class="tablewrap"><table><thead><tr><th>Jenis</th><th>Komponen / Kategori</th><th>Unit</th><th>Periode</th><th class="right">Anggaran</th><th class="right">Tagihan</th><th class="right">Komitmen</th><th class="right">Aktual</th><th class="right">Selisih</th><th>Status</th></tr></thead><tbody>' +
    (rows.length ? rows.map(r=>'<tr><td>' + esc(r.jenis) + '</td><td>' + esc(r.nama) + '</td><td>' + esc(r.unit) + '</td><td>' + esc(r.periode) + '</td><td class="right">' + fmtRp(r.anggaran) + '</td><td class="right">' + (r.tagihan === null || r.tagihan === undefined ? '-' : fmtRp(r.tagihan)) + '</td><td class="right">' + (r.komitmen === null || r.komitmen === undefined ? '-' : fmtRp(r.komitmen)) + '</td><td class="right">' + fmtRp(r.aktual) + '</td><td class="right">' + fmtRp(r.selisih) + '</td><td><span class="badge ' + (/MELEBIHI/.test(r.status) ? 'red' : (/BELUM|DI BAWAH/.test(r.status) ? 'amber' : 'green')) + '">' + esc(r.status) + '</span></td></tr>').join('') : '<tr><td colspan="10" class="empty">Belum ada anggaran yang terhubung ke komponen/kategori pada periode ini.</td></tr>') + '</tbody></table></div>';
  const nb = (ab && ab.transaksiTanpaAnggaran) || [];
  if(nb.length) h += '<div class="section-title">Pengeluaran aktual TANPA anggaran pada kategori/unit/periode yang sama</div><ul>' + nb.map(x=>'<li>' + esc(x.kategori) + (x.subkategori ? ' / ' + esc(x.subkategori) : '') + ' (' + esc(x.unit) + '): ' + x.jumlah + ' transaksi, ' + fmtRp(x.total) + '</li>').join('') + '</ul>';
  const un = ab && ab.pemasukanBelumDialokasi;
  if(un && un.jumlahTransaksi) h += '<p><span class="badge amber">Penerimaan belum dialokasikan ke komponen</span> ' + un.jumlahTransaksi + ' transaksi, ' + fmtRp(un.total) + ' - tidak dihitung sebagai realisasi komponen mana pun.</p>';
  const iv = (ab && ab.anggaranTidakValid) || [];
  if(iv.length) h += '<div class="section-title">Anggaran tidak valid (tidak dihitung)</div><ul>' + iv.map(x=>'<li>' + esc(x.id) + ' (' + esc(x.periode) + '): ' + esc(x.alasan) + '</li>').join('') + '</ul>';
  return h;
}
function renderAnggaranBanding(){
  const periode = Store.loadSettings().periodeAktif, r = fccCompute_(periode, centralFccData_(periode));
  return '<div class="card"><h3>Anggaran vs Aktual per Komponen/Kategori - ' + esc(periode) + '</h3>' + renderAnggaranBandingHtml_(r.anggaranVsAktual) + '</div>';
}

/* ---- validasi alokasi: total per kewajiban dalam satu permintaan tidak boleh melebihi sisa; kewajiban harus ada ---- */
function validateAllocationBatch(list){
  const grup = new Map(), cache = {};
  for(let i = 0; i < list.length; i++){
    const l = list[i];
    if(!l.nominal || l.nominal <= 0) continue;
    const sid = l.ob.siswaId;
    if(!cache[sid]) cache[sid] = kewajibanForSiswa(sid);
    const cur = cache[sid].find(o=>o.key === l.ob.key);
    if(!cur) return {ok:false, msg:'Kewajiban ' + esc(l.ob.komponenNama) + ' ' + esc(l.ob.periode) + ' tidak ditemukan (tarif/periode/klasifikasi tidak berlaku)'};
    const g = grup.get(cur.key) || {ob:cur, total:0};
    g.total += Number(l.nominal); grup.set(cur.key, g);
  }
  for(const g of grup.values()){
    const sisa = sisaObligation(g.ob);
    if(g.total > sisa + 0.5) return {ok:false, msg:'Total alokasi (' + fmtRp(g.total) + ') melebihi sisa kewajiban ' + esc(g.ob.komponenNama) + ' ' + esc(g.ob.periode) + ' (' + fmtRp(sisa) + ')'};
  }
  return {ok:true};
}

/* ---- penerbitan snapshot tagihan: tarif + jumlah hari yang dipakai ikut tersimpan ---- */
function submitGenerateTagihan(){
  const periode = val('gt_periode'), komponenNama = val('gt_komponen'), jt = val('gt_jatuhtempo');
  const komponen = komponenByNama(komponenNama);
  if(!periode || !komponen){ toast('Lengkapi periode dan komponen'); return; }
  const siswaAktif = MasterAPI.students().filter(s=>(s.status||'Aktif')==='Aktif' && (!komponen.unit||s.unit===komponen.unit) && komponenSasaranOk(s, komponen));
  const existing = Store.loadTagihan();
  let dibuat=0, sudahAda=0, tanpaTarif=0, hariKosong=0, digantikan=0;
  siswaAktif.forEach(s=>{
    if(existing.some(t=>t.siswaId===s.id && t.periode===periode && t.komponen===komponenNama)){ sudahAda++; return; }
    if(komponenDigantikan(s, komponen, periode)){ digantikan++; return; }
    const ob = kewajibanSatuBaris(s, komponen, periode); // snapshot dari nilai computed saat ini
    if(ob.hariBelumDiisi){ hariKosong++; return; }
    if(!(ob.bruto>0)){ tanpaTarif++; return; }
    const row = tagihanSnapshotRow_(ob, s); row.jatuhTempo = jt;
    existing.push(row);
    dibuat++;
  });
  Store.saveTagihan(existing);
  auditTrailPush('TERBITKAN_TAGIHAN_SNAPSHOT', null, {periode,komponen:komponenNama,dibuat,sudahAda,tanpaTarif,hariKosong,digantikan}, 'manual');
  toast('Snapshot diterbitkan: '+dibuat+' baru, '+sudahAda+' sudah ada'+(tanpaTarif?(', '+tanpaTarif+' tanpa tarif dilewati'):'')+(hariKosong?(', '+hariKosong+' menunggu hari katering diisi'):'')+(digantikan?(', '+digantikan+' diganti kewajiban lump beku'):'')); renderContent();
}
/* Naik tahun ajaran / pindah tahun ajaran: kewajiban siswa tahun ajaran lama DIBEKUKAN dulu agar tidak dihitung ulang dengan kelas/tarif baru. */
function studentFreezeBeforeChange_(siswaId, nv){
  const cur = MasterAPI.students().find(s=>s.id===siswaId);
  if(!cur || !nv || !nv.tahunAjaran || String(nv.tahunAjaran) === String(cur.tahunAjaran || '')) return 0;
  const n = freezeObligationsFor_({siswaIds:[siswaId], onlyWithAllocations:true});
  const n2 = freezeObligationsFor_({siswaIds:[siswaId]}); // sisanya (belum dibayar) juga dibekukan: utang tahun lama tetap dengan tarif tahun lama
  if(n + n2) auditTrailPush('BEKU_KEWAJIBAN_SEBELUM_PINDAH_TA', {siswaId:siswaId, tahunAjaran:cur.tahunAjaran, kelas:cur.kelas}, {tahunAjaran:nv.tahunAjaran, dibekukan:n + n2}, 'otomatis');
  return n + n2;
}
function komponenExtraFields_(id){
  const cur = id ? (MasterAPI.components().find(x=>x.id === id) || {}) : {}, out = {};
  [['sasaran', 'kmf_sasaran'], ['basisTarif', 'kmf_basis'], ['menggantikan', 'kmf_ganti']].forEach(function(p){
    const v = String(val(p[1]) || '').trim();
    if(v !== '' || String(cur[p[0]] || '') !== '') out[p[0]] = v; // kolom hanya dikirim bila perlu (hindari galat sebelum migrasi aditif)
  });
  return out;
}
