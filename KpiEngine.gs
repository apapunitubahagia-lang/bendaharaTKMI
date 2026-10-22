/**
 * KpiEngine.gs  -  *** DIHASILKAN OTOMATIS (build_kpi_engine.js) dari Bendahara_V2.html + _kpi_server.gs.tpl - JANGAN DIEDIT TANGAN ***
 * [P1_26] PROTOTIPE SANDBOX: 31 KPI dihitung di server memakai fungsi klien yang DISALIN APA ADANYA (104 deklarasi), sehingga
 * definisi, formula, bobot, target, dan ambang identik dengan klien. Fungsi bersama yang sudah ada di server (ObligationEngine,
 * FinanceEngine) dipakai bersama, tidak disalin ulang. Publik: opKpiServer(periode) (baca-saja, peran baca).
 * BELUM menggantikan hasil resmi aplikasi. BELUM dijalankan di Apps Script sungguhan.
 * Deklarasi yang disalin: uid, deepClone, fmtRp, fmtDate, currentPeriodeLabel, tahunAjaranForDate, MASTER_UNIT_SEED, MASTER_AKUN_SEED, MASTER_KOMPONEN_SEED, MASTER_KATEGORI_PENERIMAAN_SEED, DEFAULT_SETTINGS, centralIsUnconfirmedTrx_, allTransaksi, transaksiById, penerimaanList, pengeluaranList, alokasiForTransaksi, akunList, akunSaldo, totalSaldoKas, totalSaldoBank, isMigrationArtifact, penerimaanListReal, pengeluaranListReal, totalPemasukan, totalPengeluaran, periodeOfDate, komponenById, overAllocated, sisaBelumDialokasikan, round1, round2, sum, avg, BULAN_ID, periodeToYearMonth, dateToISO, semesterStartDateForMonth, semesterEndDateForMonth, schoolYearStartDateForMonth, schoolYearEndDateForMonth, getMeasurementWindow, isPercentageIndicator, isCompletionIndicator, getIndicatorRealization, kpiTargetKey, getKpiTarget, computeIndicatorQuantityScore, checklistItemSkor, computeChecklistInstanceScore, computeIndicatorQuality, classifyDeadlineSpec, resolveDeadlineDateForPeriode, computeIndicatorTimeliness, kendalaPeriodeInWindow, computeIndicatorFollowUp, computeIndicatorImprovement, computeIndicatorActivityStatus, computeIndicatorDimensions, kpiStatusFromScore, computeKpiRow, kpiIndukRow, kpiIndukSummaryCompute_, KPI_DATA_UNAVAILABLE_, KPI_SOURCE_KEYS_, kpiDataStatus_, kpiPeriodeStatus_, kpiUnavailableRow_, kpiIndukSummary, KPI_MASTER, indDef, INDICATOR_MASTER, indicatorByCode, __aktFeedCache, mkAkt, anchorDateForPeriode, refTransaksi, refObligation, refDokumen, refAkun, refMutasi, refPeriode, refAnggaran, refLaporan, transaksiRequiresEvidence, MUTASI_MENGGANTUNG_BATAS_HARI, BUKTI_TOLERANSI_HARI, pengeluaranPunyaPersetujuan, rabDataClient_, rabMatchClient_, financialAktivitasFeed, indicatorProblemRows, siswaName, OP_SHEETS, centralResolveTrxId, CC_, CC_BLOBS, SETTINGS_SYNC_KEYS, ccStr_, ccFromRow_, ccSettingsMap_, ccBlobGet_, ccParseSetting_, ccSettingsLoad_
 * Diprivatkan (+ '_', tidak dapat dipanggil google.script.run): 80 fungsi
 */
function uid_(prefix){ return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function deepClone_(o){ return JSON.parse(JSON.stringify(o)); }
function fmtRp_(n){ n = Number(n)||0; return 'Rp ' + n.toLocaleString('id-ID',{maximumFractionDigits:0}); }
function fmtDate_(iso){ if(!iso) return '-'; const d=new Date(iso+'T00:00:00'); if(isNaN(d)) return iso; return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }
function currentPeriodeLabel_(){ const d=new Date(); return BULAN_ID_LIST()[d.getMonth()]+' '+d.getFullYear(); }
function tahunAjaranForDate_(d){ d=d||new Date(); const y=d.getFullYear(), m=d.getMonth(); return (m>=6? y : y-1)+'/'+(m>=6? y+1 : y); }
var MASTER_UNIT_SEED = ['TK','MI'];
var MASTER_AKUN_SEED = [
  {id:'akun_kas1', nama:'Kasir Sekolah', jenis:'Kas', saldoAwal:0},
  {id:'akun_bank1', nama:'Rekening BNI Sekolah', jenis:'Bank', saldoAwal:0}
];
var MASTER_KOMPONEN_SEED = [
  {id:'kmp_spp', nama:'SPP', unit:'', frekuensi:'Bulanan'},
  {id:'kmp_daftarulang', nama:'Daftar Ulang', unit:'', frekuensi:'Tahunan'},
  {id:'kmp_seragam', nama:'Seragam', unit:'', frekuensi:'SekaliBayar'},
  {id:'kmp_ekskul', nama:'Ekskul', unit:'MI', frekuensi:'Bulanan'},
  {id:'kmp_catering', nama:'Catering', unit:'', frekuensi:'Bulanan'},
  {id:'kmp_pendaftaran', nama:'Pendaftaran', unit:'', frekuensi:'SekaliBayar'},
  {id:'kmp_biayaawal', nama:'Biaya Awal', unit:'', frekuensi:'SekaliBayar'},
  {id:'kmp_ketering', nama:'Ketering', unit:'MI', frekuensi:'Bulanan'},
  {id:'kmp_pendidikan', nama:'Pendidikan', unit:'MI', frekuensi:'Tahunan'},
  {id:'kmp_komite', nama:'Komite', unit:'', frekuensi:'SekaliBayar'}
];
var MASTER_KATEGORI_PENERIMAAN_SEED = [
  {id:'KATP_SPP', kode:'01', kategori:'SPP', status:'Aktif'},
  {id:'KATP_BIAYA_PENDIDIKAN', kode:'02', kategori:'Biaya Pendidikan', status:'Aktif'},
  {id:'KATP_PENDAFTARAN', kode:'03', kategori:'Pendaftaran', status:'Aktif'},
  {id:'KATP_DAFTAR_ULANG', kode:'04', kategori:'Daftar Ulang', status:'Aktif'},
  {id:'KATP_CATERING', kode:'05', kategori:'Catering', status:'Aktif'},
  {id:'KATP_DANA_BOS', kode:'06', kategori:'Dana BOS', status:'Aktif'},
  {id:'KATP_DONASI', kode:'07', kategori:'Donasi', status:'Aktif'},
  {id:'KATP_KOMITE', kode:'08', kategori:'Komite', status:'Aktif'},
  {id:'KATP_LAINNYA', kode:'09', kategori:'Penerimaan Lainnya', status:'Aktif'}
];
var DEFAULT_SETTINGS = {
  sekolah:'MI DARUL ARIFIN JAMBI', yayasan:'YAYASAN DARUL ARIFIN', alamat:'',
  namaBendahara:'', jabatanBendahara:'Bendahara', namaKepalaSekolah:'', nipKepalaSekolah:'',
  periodeAktif: currentPeriodeLabel_(),
  tahunAjaranAktif: tahunAjaranForDate_(),
  schemaVersion: 1,
  akunKasBankList: deepClone_(MASTER_AKUN_SEED),
  kategoriPenerimaanList: MASTER_KATEGORI_PENERIMAAN_SEED.map(k=>k.kategori),
  kategoriPengeluaranList: ['Gaji/Honor','ATK','Konsumsi','Transportasi','Pemeliharaan','Sarpras','Kegiatan','Utilitas','Komite','Aset/Investasi','Lainnya'],
  unitList: MASTER_UNIT_SEED.slice(),
  komponenBiayaList: deepClone_(MASTER_KOMPONEN_SEED),
  keringananPolicyList: [],
  budgetNearLimitPct: 80,
  kebijakanEnrollmentTengahPeriode: 'FULL',
  docSeqCounters: {RESI:0, TAGIHAN:0, REKAP:0}
};
function centralIsUnconfirmedTrx_(t){ return !!(t && t._pendingSync && !t._synced); }
function allTransaksi_(){ return OperationalAPI.transaksi().filter(t=>!t.archivedAt && !centralIsUnconfirmedTrx_(t)); }
function transaksiById_(id){ const sid = centralResolveTrxId_(id); return OperationalAPI.transaksi().find(t=>t.id===sid)||null; }
function penerimaanList_(){ return allTransaksi_().filter(t=>t.jenis==='PENERIMAAN'); }
function pengeluaranList_(){ return allTransaksi_().filter(t=>t.jenis==='PENGELUARAN'); }
function alokasiForTransaksi_(trxId){ const sid = centralResolveTrxId_(trxId); return OperationalAPI.alokasi().filter(a=>a.transaksiId===sid); }
function akunList_(){ return MasterAPI.accounts(); }
function akunSaldo_(akunId, asOf){
  const akun = akunList_().find(a=>a.id===akunId);
  if(!akun) return 0;
  let saldo = Number(akun.saldoAwal||0);
  allTransaksi_().forEach(t=>{
    if(asOf && t.tanggal>asOf) return;
    if(t.jenis==='PENERIMAAN' && t.akunId===akunId) saldo += Number(t.nominal||0);
    else if(t.jenis==='PENGELUARAN' && t.akunId===akunId) saldo -= Number(t.nominal||0);
    else if(t.jenis==='TRANSFER'){
      if(t.akunId===akunId) saldo -= Number(t.nominal||0);
      if(t.akunTujuanId===akunId) saldo += Number(t.nominal||0);
    }
  });
  return saldo;
}
function totalSaldoKas_(asOf){ return akunList_().filter(a=>a.jenis==='Kas').reduce((s,a)=>s+akunSaldo_(a.id,asOf),0); }
function totalSaldoBank_(asOf){ return akunList_().filter(a=>a.jenis==='Bank').reduce((s,a)=>s+akunSaldo_(a.id,asOf),0); }
function isMigrationArtifact_(t){ return Number(t.nominal||0)===0; }
function penerimaanListReal_(){ return penerimaanList_().filter(t=>!isMigrationArtifact_(t)); }
function pengeluaranListReal_(){ return pengeluaranList_().filter(t=>!isMigrationArtifact_(t)); }
function totalPemasukan_(periodeFilter){ return penerimaanListReal_().filter(t=>!periodeFilter||periodeOfDate_(t.tanggal)===periodeFilter).reduce((s,t)=>s+Number(t.nominal||0),0); }
function totalPengeluaran_(periodeFilter){ return pengeluaranListReal_().filter(t=>!periodeFilter||periodeOfDate_(t.tanggal)===periodeFilter).reduce((s,t)=>s+Number(t.nominal||0),0); }
function periodeOfDate_(iso){ if(!iso) return ''; const d=new Date(iso+'T00:00:00'); if(isNaN(d)) return ''; return BULAN_ID_LIST()[d.getMonth()]+' '+d.getFullYear(); }
function komponenById_(id){ return MasterAPI.components().find(k=>k.id===id); }
function overAllocated_(ob){ return alokasiTerbayar(ob) > Number(ob.netto||0) + 0.5; }
function sisaBelumDialokasikan_(trxId){
  const trx = transaksiById_(trxId);
  if(!trx) return 0;
  const sudah = alokasiForTransaksi_(trxId).reduce((s,a)=>s+Number(a.nominal||0),0);
  return Math.max(0, Number(trx.nominal||0)-sudah);
}
function round1_(n){ return Math.round(n*10)/10; }
function round2_(n){ return Math.round(n*100)/100; }
function sum_(arr){ return arr.reduce((a,b)=>a+Number(b||0),0); }
function avg_(arr){ return arr.length ? sum_(arr)/arr.length : 0; }
var BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]; // [build] = BULAN_ID_LIST() klien (literal: tanpa panggilan fungsi saat berkas dimuat)
function periodeToYearMonth_(periode){
  const parts=(periode||'').split(' '); const mIdx=BULAN_ID.indexOf(parts[0]); const year=Number(parts[1]);
  if(mIdx<0||!year) return null;
  return {y:year,m:mIdx};
}
function dateToISO_(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function semesterStartDateForMonth_(y,mIdx){ return mIdx>=6 ? new Date(y,6,1) : new Date(y,0,1); }
function semesterEndDateForMonth_(y,mIdx){ return mIdx>=6 ? new Date(y,11,31) : new Date(y,5,30); }
function schoolYearStartDateForMonth_(y,mIdx){ return mIdx>=6 ? new Date(y,6,1) : new Date(y-1,6,1); }
function schoolYearEndDateForMonth_(y,mIdx){ return mIdx>=6 ? new Date(y+1,5,30) : new Date(y,5,30); }
function getMeasurementWindow_(kpiDef, periode){
  const ym = periodeToYearMonth_(periode);
  if(!ym) return null;
  const freq = String((kpiDef&&(kpiDef.frekuensi||kpiDef.frequency))||'').toLowerCase();
  if(freq==='semester') return {type:'Semester', start:semesterStartDateForMonth_(ym.y,ym.m), end:semesterEndDateForMonth_(ym.y,ym.m)};
  if(freq==='tahunan') return {type:'Tahunan', start:schoolYearStartDateForMonth_(ym.y,ym.m), end:schoolYearEndDateForMonth_(ym.y,ym.m)};
  return {type:'Bulanan', start:new Date(ym.y,ym.m,1), end:new Date(ym.y,ym.m+1,0)};
}
function isPercentageIndicator_(kpiDef){
  const t = String((kpiDef&&kpiDef.measurementType)||'').toUpperCase();
  return t==='PERCENTAGE'||t==='RATIO'||t==='SCORE'||t==='RECONCILIATION'||t==='DOCUMENT_COMPLETENESS';
}
function isCompletionIndicator_(kpiDef){
  const t = String((kpiDef&&kpiDef.measurementType)||'').toUpperCase();
  return t==='COMPLETION'||t==='DEADLINE';
}
function getIndicatorRealization_(kpiDef, periode){
  if(!kpiDef) return '';
  const win = getMeasurementWindow_(kpiDef, periode);
  if(!win) return '';
  const startISO=dateToISO_(win.start), endISO=dateToISO_(win.end);
  const akt = financialAktivitasFeed_().filter(a=>a.kodeKpi===kpiDef.kode && a.tanggal && a.tanggal>=startISO && a.tanggal<=endISO);
  if(isPercentageIndicator_(kpiDef)){
    const withNilai = akt.filter(a=>a.nilaiLangsung!==null && a.nilaiLangsung!=='' && a.nilaiLangsung!==undefined && !isNaN(a.nilaiLangsung));
    return withNilai.length ? round1_(avg_(withNilai.map(a=>Number(a.nilaiLangsung)))) : '';
  }
  if(isCompletionIndicator_(kpiDef)){
    const done = akt.filter(a=>!!a.completionDate);
    return done.length ? done.length : '';
  }
  return akt.length ? akt.length : '';
}
function kpiTargetKey_(kode, periode){ return kode+'|'+periode; }
function getKpiTarget_(kode, periode){
  const targets = Store.loadKpiTarget();
  const key = kpiTargetKey_(kode, periode);
  const kpiDef = INDICATOR_MASTER.find(k=>k.kode===kode);
  return targets[key]!==undefined ? targets[key] : (kpiDef?kpiDef.target:'');
}
function computeIndicatorQuantityScore_(kpiDef, periode, realisasi){
  if(realisasi==='') return null;
  if(isPercentageIndicator_(kpiDef)) return Math.min(100, Math.max(0, Number(realisasi)));
  const targetP = getKpiTarget_(kpiDef.kode, periode);
  if(targetP!==''&&targetP!==null&&Number(targetP)>0) return Math.min(100, round2_(Number(realisasi)/Number(targetP)*100));
  return 0;
}
function checklistItemSkor_(item, value){
  if(value===undefined||value===null||value==='') return null;
  const t = item.answerType||'yatidak';
  if(t==='yatidak') return value==='Ya' ? 100 : 0;
  if(t==='adatidak') return value==='Ada' ? 100 : 0;
  if(t==='status3'){ const map={'Selesai':100,'Dalam Proses':50,'Belum':0}; return map[value]!==undefined?map[value]:null; }
  if(t==='angka'){ const n=Number(value); if(isNaN(n)||!item.targetAngka) return null; return Math.min(100, round1_(n/Number(item.targetAngka)*100)); }
  return null;
}
function computeChecklistInstanceScore_(tpl, inst){
  const checked = inst.checkedItems||{};
  const scored = tpl.items.map(it=>checklistItemSkor_(it, checked[it.id])).filter(s=>s!==null);
  const capaian = scored.length ? round1_(avg_(scored)) : '';
  return {totalItem:tpl.items.length, terisi:scored.length, capaian};
}
function computeIndicatorQuality_(kpiDef, periode, akt){
  if(!akt.length) return null;
  const scores = akt.map(a=>{
    if(a.checklistInstId){
      const inst = Store.loadChecklistInstances().find(i=>i.id===a.checklistInstId);
      const tpl = inst ? Store.loadChecklistTemplates().find(t=>t.id===inst.templateId) : null;
      if(inst && tpl){ const cs=computeChecklistInstanceScore_(tpl, inst); if(cs.capaian!=='') return cs.capaian; }
    }
    const checks = [!!(a.deskripsi && a.deskripsi.trim())];
    checks.push(!!(a.bukti && a.bukti.length));
    if(a.berdasarkanSurat) checks.push(!!a.nomorSurat);
    const passed = checks.filter(Boolean).length;
    return checks.length ? round1_(passed/checks.length*100) : 100;
  });
  return round1_(avg_(scores));
}
function classifyDeadlineSpec_(deadlineText){
  const t=(deadlineText||'').trim();
  if(!t) return {type:'none'};
  let m;
  if((m=t.match(/tanggal\s+(\d{1,2})/i))) return {type:'dayOfMonth', day:Number(m[1])};
  if(/akhir\s+bulan\s+berjalan/i.test(t)) return {type:'endOfMonth'};
  if(/akhir\s+semester\s+berjalan/i.test(t)) return {type:'endOfSemester'};
  if(/akhir\s+tahun\s+ajaran/i.test(t)) return {type:'endOfSchoolYear'};
  return {type:'periodBased', text:t};
}
function resolveDeadlineDateForPeriode_(deadlineText, periode){
  const ym=periodeToYearMonth_(periode);
  if(!ym) return null;
  const spec=classifyDeadlineSpec_(deadlineText);
  const daysInMonth=new Date(ym.y,ym.m+1,0).getDate();
  if(spec.type==='dayOfMonth') return new Date(ym.y,ym.m,Math.min(spec.day,daysInMonth));
  if(spec.type==='endOfMonth') return new Date(ym.y,ym.m,daysInMonth);
  if(spec.type==='endOfSemester') return semesterEndDateForMonth_(ym.y,ym.m);
  if(spec.type==='endOfSchoolYear') return schoolYearEndDateForMonth_(ym.y,ym.m);
  return null;
}
function computeIndicatorTimeliness_(kpiDef, periode, akt){
  const deadlineDate = resolveDeadlineDateForPeriode_(kpiDef.deadline, periode);
  if(!deadlineDate) return null;
  const deadlineISO = dateToISO_(deadlineDate);
  const withCompletion = akt.filter(a=>a.completionDate);
  if(!withCompletion.length) return null;
  return round1_(avg_(withCompletion.map(a=> a.completionDate<=deadlineISO ? 100 : 0)));
}
function kendalaPeriodeInWindow_(periodeStr, win){
  if(!win) return false;
  const ym=periodeToYearMonth_(periodeStr);
  if(!ym) return false;
  const monthStart=new Date(ym.y,ym.m,1), monthEnd=new Date(ym.y,ym.m+1,0);
  return monthStart<=win.end && monthEnd>=win.start;
}
function computeIndicatorFollowUp_(kpiDef, periode){
  const win = getMeasurementWindow_(kpiDef, periode);
  const kendala = Store.loadKendala().filter(k=>k.indicatorId===kpiDef.kode && kendalaPeriodeInWindow_(k.periode, win));
  if(!kendala.length) return 100;
  const map = {'Belum Ditindaklanjuti':0,'Dalam Proses':50,'Selesai':100,'Diverifikasi':100};
  return round1_(avg_(kendala.map(k=>map[k.status]!==undefined?map[k.status]:50)));
}
function computeIndicatorImprovement_(kpiDef, periode, akt){
  if(!akt.length) return null;
  return computeIndicatorFollowUp_(kpiDef, periode);
}
function computeIndicatorActivityStatus_(kpiDef, periode, dims){
  if(kpiDef.active===false) return 'NOT_APPLICABLE';
  if(dims.realisasi!=='') return (dims.dimsUsed && dims.dimsUsed.length>=3) ? 'MEASURED' : 'IN_PROGRESS';
  const deadlineDate = resolveDeadlineDateForPeriode_(kpiDef.deadline, periode);
  if(deadlineDate){ const today=new Date(); today.setHours(0,0,0,0); if(today<deadlineDate) return 'NOT_DUE'; }
  return 'NOT_STARTED';
}
function computeIndicatorDimensions_(kpiDef, periode){
  const win = getMeasurementWindow_(kpiDef, periode);
  const akt = win ? financialAktivitasFeed_().filter(a=>a.kodeKpi===kpiDef.kode && a.tanggal && a.tanggal>=dateToISO_(win.start) && a.tanggal<=dateToISO_(win.end)) : [];
  const realisasi = getIndicatorRealization_(kpiDef, periode);
  const quantity = computeIndicatorQuantityScore_(kpiDef, periode, realisasi);
  const quality = computeIndicatorQuality_(kpiDef, periode, akt);
  const timeliness = computeIndicatorTimeliness_(kpiDef, periode, akt);
  const followUp = kpiDef.requiresFollowUp ? computeIndicatorFollowUp_(kpiDef, periode) : null;
  const improvement = computeIndicatorImprovement_(kpiDef, periode, akt);
  const dims = [
    {key:'quantity', value:quantity, weight:30}, {key:'quality', value:quality, weight:25},
    {key:'timeliness', value:timeliness, weight:15}, {key:'followUp', value:followUp, weight:20},
    {key:'improvement', value:improvement, weight:10}
  ];
  const usable = dims.filter(d=>d.value!==null && d.value!==undefined);
  let finalScore = '';
  if(realisasi!=='' && usable.length){
    const totalW = usable.reduce((a,d)=>a+d.weight,0)||1;
    finalScore = Math.min(100, Math.max(0, round2_(usable.reduce((a,d)=>a+d.value*d.weight,0)/totalW)));
  }
  return {realisasi, quantity, quality, timeliness, followUp, improvement, dimsUsed: usable.map(d=>d.key), finalScore, akt};
}
function kpiStatusFromScore_(score){
  if(score==null||score==='') return 'N/A';
  if(score>=90) return 'Sangat Baik';
  if(score>=80) return 'Baik';
  if(score>=70) return 'Perlu Perhatian';
  return 'Perlu Perbaikan';
}
function computeKpiRow_(kpiDef, periode){
  const dims = computeIndicatorDimensions_(kpiDef, periode);
  const capaian = dims.finalScore;
  const activityStatus = computeIndicatorActivityStatus_(kpiDef, periode, dims);
  const status = dims.realisasi==='' ? (activityStatus==='NOT_DUE'?'BELUM JATUH TEMPO':(activityStatus==='NOT_APPLICABLE'?'TIDAK BERLAKU':'BELUM ADA AKTIVITAS')) : kpiStatusFromScore_(capaian);
  return Object.assign({}, kpiDef, {realisasi:dims.realisasi, capaian, status, activityStatus,
    dimQuantity:dims.quantity, dimQuality:dims.quality, dimTimeliness:dims.timeliness, dimFollowUp:dims.followUp, dimImprovement:dims.improvement, dimsUsed:dims.dimsUsed});
}
function kpiIndukRow_(kpiMaster, periode){
  const indicators = INDICATOR_MASTER.filter(k=>k.parentKpi===kpiMaster.kode).map(k=>computeKpiRow_(k, periode));
  const counted = indicators.filter(r=>r.activityStatus!=='NOT_DUE' && r.activityStatus!=='NOT_APPLICABLE');
  const filledWeight = round2_(sum_(counted.map(r=>r.bobot)));
  const skor = filledWeight ? round1_(sum_(counted.map(r=>(r.capaian===''?0:r.capaian)*r.bobot))/filledWeight) : null;
  const jumlahMasalah = indicators.reduce((s,r)=>s+indicatorProblemRows_(r, periode).length, 0);
  return Object.assign({}, kpiMaster, {indicators, skor, status:kpiStatusFromScore_(skor), jumlahMasalah});
}
function kpiIndukSummaryCompute_(periode){
  periode = periode || Store.loadSettings().periodeAktif;
  const rows = KPI_MASTER.map(k=>kpiIndukRow_(k, periode));
  const filled = rows.filter(r=>r.skor!=null);
  const bobotDiisi = round2_(sum_(filled.map(r=>r.bobot)));
  const overall = bobotDiisi ? round1_(sum_(filled.map(r=>r.skor*r.bobot))/bobotDiisi) : null;
  return {periode, rows, overall, overallStatus:kpiStatusFromScore_(overall)};
}
var KPI_DATA_UNAVAILABLE_ = 'DATA TIDAK TERSEDIA';
var KPI_SOURCE_KEYS_ = ['transaksi', 'alokasi', 'kewajiban', 'anggaran', 'komitmen', 'bukti', 'mutasiBank', 'rekonsiliasi', 'laporan', 'alokasiPengeluaran'];
function kpiDataStatus_(){
  const alasan = [];
  try{
    if(typeof ServerBridge === 'undefined' || !ServerBridge) alasan.push('server tidak terhubung');
    else if(!centralReady_()) alasan.push('pengguna belum terotorisasi');
    else {
      if(!CentralMasterData.ready) alasan.push('data master belum termuat');
      const st = OperationalCache.states;
      KPI_SOURCE_KEYS_.forEach(function(k){ const s = st[k]; if(!s || !s.loaded || s.error) alasan.push(OP_SHEETS[k] + (s && s.error ? ' gagal dimuat' : ' belum termuat')); });
    }
  }catch(e){ alasan.push('status sumber data tidak dapat diperiksa'); }
  if(alasan.length) console.warn('[KPI] ' + KPI_DATA_UNAVAILABLE_ + ': ' + alasan.join('; '));
  return {ok: !alasan.length, alasan: alasan};
}
function kpiPeriodeStatus_(periode){
  const p = String(periode == null ? '' : periode);
  if(/^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/.test(p)) return {ok:true, alasan:[]};
  return {ok:false, alasan:['periode aktif tidak valid ("' + p + '"; wajib label bulan, mis. "Oktober 2026") - normalisasi lewat Pusat Data > Normalisasi Periode Aktif']};
}
function kpiUnavailableRow_(k, ds){ return Object.assign({}, k, {indicators: [], skor: null, status: KPI_DATA_UNAVAILABLE_, jumlahMasalah: 0, dataUnavailable: true, alasan: ds.alasan}); }
function kpiIndukSummary_(periode){
  periode = periode || Store.loadSettings().periodeAktif;
  const ds0 = kpiDataStatus_(), dp = kpiPeriodeStatus_(periode); // [P1-IMP F8]
  const ds = {ok: ds0.ok && dp.ok, alasan: dp.alasan.concat(ds0.alasan)};
  if(!ds.ok) return {periode: periode, rows: KPI_MASTER.map(function(k){ return kpiUnavailableRow_(k, ds); }), overall: null, overallStatus: KPI_DATA_UNAVAILABLE_ + ' (' + ds.alasan.join('; ') + ')', dataUnavailable: true, alasan: ds.alasan};
  return kpiIndukSummaryCompute_(periode);
}
var KPI_MASTER = [
  {kode:'BDS01', nama:'Penerimaan Siswa (Kewajiban & Pembayaran)', bobot:20, active:true},
  {kode:'BDS02', nama:'Mutasi Rekening & Rekonsiliasi', bobot:20, active:true},
  {kode:'BDS03', nama:'Pengeluaran & Pengendalian RAB', bobot:25, active:true},
  {kode:'BDS04', nama:'Pengendalian Kas, Bank & Saldo', bobot:15, active:true},
  {kode:'BDS05', nama:'Bukti & Pertanggungjawaban', bobot:10, active:true},
  {kode:'BDS06', nama:'Pelaporan Unit', bobot:10, active:true}
];
function indDef_(kode, parentKpi, nama, bobot, opts){
  return Object.assign({kode, parentKpi, nama, bobot, measurementType:'PERCENTAGE', frekuensi:'Bulanan', deadline:'', target:1, allowsInnovation:false, requiresFollowUp:true, active:true, population:'', formula:'', evidence:''}, opts||{});
}
var INDICATOR_MASTER = [
  // ===== BDS01 - Penerimaan Siswa: Kewajiban & Pembayaran (20%) =====
  indDef_('BDS01-I01','BDS01','Kewajiban Siswa Akurat',20,{
    population:'Semua Computed Obligation (Siswa Aktif x Komponen x Tarif x Periode) pada periode berjalan',
    formula:'ok jika TIDAK ada konflik keringanan non-stackable (perluReview=false) pada baris kewajiban',
    evidence:'Referensi Computed Obligation (siswa, komponen, periode)'
  }),
  indDef_('BDS01-I02','BDS01','Ekspektasi Penerimaan Siswa Terhitung & Terukur',15,{
    measurementType:'RATIO',
    population:'Semua Computed Obligation Siswa Aktif pada periode berjalan (Tagihan Formal TIDAK disyaratkan)',
    formula:'Expected Receivable = Siswa Aktif + Tarif + Periode - Keringanan. ok jika bruto tarif berhasil di-resolve (>0) dari master Tarif, terlepas dari ada/tidaknya Tagihan Formal',
    evidence:'Referensi Computed Obligation; TIDAK pernah membuat transaksi/tagihan fiktif'
  }),
  indDef_('BDS01-I03','BDS01','Pembayaran Siswa Tercatat Lengkap',15,{
    population:'Transaksi PENERIMAAN aktual dengan siswaId (ACTUAL RECEIVED saja, bukan Expected)',
    formula:'ok jika akunId, nominal>0, dan tanggal terisi lengkap pada transaksi',
    evidence:'Referensi Transaksi Penerimaan'
  }),
  indDef_('BDS01-I04','BDS01','Pembayaran Siswa Teridentifikasi & Teralokasi Valid',20,{
    population:'Transaksi PENERIMAAN aktual dengan siswaId',
    formula:'ok jika siswa+komponen+periode teralokasi penuh (sisa belum dialokasikan <= 0) DAN tidak ada alokasi yang melebihi sisa kewajiban terkait',
    evidence:'Referensi Transaksi Penerimaan + baris Alokasi terkait'
  }),
  indDef_('BDS01-I05','BDS01','Tunggakan Terukur & Tertelusur',15,{
    population:'Computed Obligation dengan Outstanding (sisa kewajiban) > 0 - tunggakan siswa TIDAK dihukum karena nilainya, hanya keterlusurannya',
    formula:'ok jika siswa dapat ditelusuri (siswaId valid), nilai netto/outstanding numerik valid, dan periode terisi - BUKAN berdasarkan lunas/tidaknya',
    evidence:'Referensi Computed Obligation (siswa, komponen, periode, outstanding)'
  }),
  indDef_('BDS01-I06','BDS01','Tidak Ada Double Allocation',15,{
    population:'Semua Computed Obligation pada periode berjalan',
    formula:'ok jika total Alokasi ke kewajiban tsb TIDAK melebihi netto kewajiban (bukan overAllocated)',
    evidence:'Referensi Computed Obligation + baris Alokasi terkait'
  }),

  // ===== BDS02 - Mutasi Rekening & Rekonsiliasi (20%) =====
  indDef_('BDS02-I01','BDS02','Seluruh Mutasi Rekening Tercatat',20,{
    population:'Semua baris MutasiBank pada periode berjalan',
    formula:'ok jika tanggal dan nominal>0 terisi lengkap pada baris mutasi (data mutasi sudah masuk sistem)',
    evidence:'Referensi MutasiBank'
  }),
  indDef_('BDS02-I02','BDS02','Mutasi Rekening Teridentifikasi',25,{
    population:'Semua baris MutasiBank pada periode berjalan',
    formula:'ok jika status=DIPROSES dan tertaut ke Transaksi (sudah dicocokkan/diklasifikasikan)',
    evidence:'Referensi MutasiBank + Transaksi tertaut'
  }),
  indDef_('BDS02-I03','BDS02','Tidak Ada Mutasi Menggantung Melewati Batas Waktu',20,{
    population:'Semua baris MutasiBank pada periode berjalan (beda populasi ukur dari I02: I02=sudah dicocokkan, I03=apakah masih menggantung kelamaan)',
    formula:'ok jika status=DIPROSES ATAU umur sejak tanggal mutasi <= 14 hari (batas waktu wajar tindak lanjut)',
    evidence:'Referensi MutasiBank'
  }),
  indDef_('BDS02-I04','BDS02','Selisih Rekening Teridentifikasi & Dijelaskan',15,{
    population:'Baris MutasiBank berstatus DIPROSES yang nominalnya berselisih dengan Transaksi tertaut (statement/mutasi bank vs ledger)',
    formula:'ok jika selisih=0 (cocok persis), atau jika ada selisih maka sudah dijelaskan (catatan/keterangan terisi)',
    evidence:'Referensi MutasiBank + Transaksi tertaut + catatan'
  }),
  indDef_('BDS02-I05','BDS02','Rekonsiliasi Bank Selesai',20,{
    measurementType:'RECONCILIATION',
    population:'Akun berjenis Bank pada periode berjalan',
    formula:'ok jika ada baris Rekonsiliasi untuk akun Bank tsb pada periode berjalan berstatus SELESAI',
    evidence:'Referensi Rekonsiliasi (akun Bank, periode)'
  }),

  // ===== BDS03 - Pengeluaran & Pengendalian RAB (25%) =====
  indDef_('BDS03-I01','BDS03','Pengeluaran Tercatat Lengkap',15,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan',
    formula:'ok jika akunId, nominal>0, dan tanggal terisi lengkap',
    evidence:'Referensi Transaksi Pengeluaran'
  }),
  indDef_('BDS03-I02','BDS03','Pengeluaran Memiliki Kategori & Penerima',10,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan',
    formula:'ok jika kategori terisi DAN nama penerima terisi jelas (>=3 karakter)',
    evidence:'Referensi Transaksi Pengeluaran'
  }),
  indDef_('BDS03-I03','BDS03','Pengeluaran Sesuai RAB Bulanan',25,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan (beda dari I04: I03=kesesuaian transaksi dgn RAB, I04=kepatuhan pagu per garis anggaran; beda dari I05: I03=STRICT harus ada RAB disetujui, persetujuan TIDAK menggantikan RAB di sini)',
    formula:'ok HANYA jika transaksi terpetakan PENUH ke RAB berstatus DISETUJUI: lewat pemetaan eksplisit 30_ALOKASI_PENGELUARAN (tingkat ITEM), atau bila tanpa pemetaan eksplisit lewat garis anggaran kategori+subkategori+unit+periode (aturan Financial Control). Sisa nominal tanpa alokasi eksplisit = tidak terpetakan; RAB DIAJUKAN/tanpa status bukan RAB disetujui - persetujuan ObligasiSekolah TIDAK membuat ok=true di sini (itu tugas I05)',
    evidence:'Referensi Transaksi Pengeluaran + baris Anggaran/RAB terkait'
  }),
  indDef_('BDS03-I04','BDS03','Realisasi Tidak Melebihi Pagu',20,{
    population:'Semua garis anggaran (kategori+subkategori+unit+periode) yang memiliki RAB berstatus DISETUJUI pada periode berjalan (populasi per-garis, bukan per-transaksi; tanpa garis disetujui -> N/A)',
    formula:'ok jika realisasi garis (bagian eksplisit 30_ALOKASI_PENGELUARAN + bagian aturan kategori, tanpa hitung ganda) <= pagu RAB DISETUJUI garis tsb',
    evidence:'Referensi Anggaran/RAB + realisasi terkait'
  }),
  indDef_('BDS03-I05','BDS03','Pengeluaran di Luar RAB Memiliki Persetujuan',15,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan (transaksi yang kategorinya ADA di RAB otomatis tidak bermasalah di sini)',
    formula:'ok jika transaksi lulus I03 (terpetakan penuh ke RAB DISETUJUI), ATAU (tidak ada RAB disetujui TAPI transaksi tertaut ke ObligasiSekolah sebagai bukti persetujuan) - pengeluaran darurat di luar RAB tidak otomatis jadi masalah jika sudah disetujui',
    evidence:'Referensi Transaksi Pengeluaran + ObligasiSekolah tertaut (persetujuan)'
  }),
  indDef_('BDS03-I06','BDS03','Tidak Ada Pengeluaran Duplikat',15,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan',
    formula:'ok jika kombinasi (tanggal, penerima, nominal) tidak berulang pada transaksi lain',
    evidence:'Referensi Transaksi Pengeluaran'
  }),

  // ===== BDS04 - Pengendalian Kas, Bank & Saldo (15%) =====
  indDef_('BDS04-I01','BDS04','Tidak Ada Saldo Kas/Bank Tidak Wajar Tanpa Penjelasan',20,{
    population:'Semua Akun Kas/Bank pada periode berjalan',
    formula:'ok jika saldo akun >= 0, ATAU jika saldo negatif sudah ada Rekonsiliasi periode tsb dengan catatan penjelasan (saldo negatif akibat data belum direkonsiliasi TIDAK otomatis kesalahan Bendahara)',
    evidence:'Referensi Akun Kas/Bank + Rekonsiliasi terkait (jika ada)'
  }),
  indDef_('BDS04-I02','BDS04','Saldo Rekening Sesuai Catatan',30,{
    measurementType:'RECONCILIATION',
    population:'Rekonsiliasi terbaru per Akun Kas/Bank pada periode berjalan',
    formula:'ok jika selisih (saldo aktual rekening - saldo ledger/sistem) = 0',
    evidence:'Referensi Rekonsiliasi (akun, periode, selisih)'
  }),
  indDef_('BDS04-I03','BDS04','Selisih Kas/Bank Teridentifikasi & Dijelaskan',25,{
    population:'Semua Akun Kas/Bank pada periode berjalan (populasi stabil - fokus posisi saldo akhir, bukan matching mutasi bank/BDS02)',
    formula:'ok jika belum direkonsiliasi ATAU selisih=0 (tidak ada yang perlu dijelaskan), ATAU jika ada selisih maka sudah dijelaskan (catatan terisi)',
    evidence:'Referensi Akun Kas/Bank + Rekonsiliasi terbaru + catatan penjelasan'
  }),
  indDef_('BDS04-I04','BDS04','Saldo Akhir Bulanan Dapat Ditelusuri',25,{
    population:'Semua Akun Kas/Bank pada periode berjalan',
    formula:'Saldo Awal + Penerimaan - Pengeluaran (+/-) Transfer = Saldo Akhir. ok jika seluruh Transaksi yang menyentuh akun tsb memiliki tanggal valid (mendukung rekonstruksi saldo berjalan titik-waktu)',
    evidence:'Referensi Akun Kas/Bank + Transaksi terkait'
  }),

  // ===== BDS05 - Bukti & Pertanggungjawaban (10%) =====
  indDef_('BDS05-I01','BDS05','Bukti Penerimaan Lengkap',20,{
    population:'Semua Transaksi PENERIMAAN aktual pada periode berjalan',
    formula:'ok jika buktiId terisi (ada lampiran bukti)',
    evidence:'Referensi Transaksi Penerimaan + lampiran bukti'
  }),
  indDef_('BDS05-I02','BDS05','Bukti Pengeluaran Lengkap',25,{
    population:'Semua Transaksi PENGELUARAN aktual pada periode berjalan',
    formula:'ok jika buktiId terisi (ada lampiran bukti)',
    evidence:'Referensi Transaksi Pengeluaran + lampiran bukti'
  }),
  indDef_('BDS05-I03','BDS05','Bukti Terhubung ke Transaksi',20,{
    measurementType:'DOCUMENT_COMPLETENESS',
    population:'Semua record Dokumen pada periode berjalan',
    formula:'ok jika Dokumen tidak menaut ke transaksiId (dokumen umum), atau jika menaut maka Transaksi tsb benar-benar ada (tidak orphan)',
    evidence:'Referensi Dokumen + Transaksi tertaut'
  }),
  indDef_('BDS05-I04','BDS05','Tidak Ada Transaksi Wajib-Bukti Tanpa Bukti > 30 Hari',20,{
    population:'Transaksi dengan requiresEvidence=true (PENERIMAAN/PENGELUARAN aktual, bukan TRANSFER/migration artifact) pada periode berjalan',
    formula:'ok jika buktiId terisi, ATAU umur transaksi sejak tanggal <= 30 hari (masih dalam masa toleransi lampiran)',
    evidence:'Referensi Transaksi + lampiran bukti'
  }),
  indDef_('BDS05-I05','BDS05','Dokumen Laporan Dapat Ditelusuri ke Transaksi',15,{
    measurementType:'DOCUMENT_COMPLETENESS',
    population:'Semua record Laporan Bulanan (beda dari I03: I03=Dokumen bukti umum, I05=Laporan sebagai dokumen)',
    formula:'ok jika Laporan menyimpan daftar transaksiId sumber (traceability list) dan seluruh id tsb masih valid/resolvable ke Transaksi ledger',
    evidence:'Referensi Laporan + daftar Transaksi sumber'
  }),

  // ===== BDS06 - Pelaporan Unit (10%) =====
  indDef_('BDS06-I01','BDS06','Laporan Bulanan Tersedia',20,{
    measurementType:'COMPLETION', target:1,
    population:'Periode berjalan (1 laporan wajib per periode)',
    formula:'ok jika record Laporan untuk periode berjalan sudah dikirim',
    evidence:'Referensi Laporan (periode, tanggal dibuat)'
  }),
  indDef_('BDS06-I02','BDS06','Laporan Dikirim Tepat Waktu',25,{
    measurementType:'DEADLINE', deadline:'Tanggal 25', target:1,
    population:'Periode berjalan',
    formula:'Deadline: tanggal 25 ke Kepala Sekolah (verifikasi Kepala Sekolah tanggal 25-27, maksimal tanggal 27 ke Bendahara Pusat). ok jika tanggalDibuat Laporan <= tanggal 25 periode tsb',
    evidence:'Referensi Laporan (tanggal dibuat vs deadline)'
  }),
  indDef_('BDS06-I03','BDS06','Saldo Laporan Sesuai Ledger',20,{
    population:'Semua record Laporan Bulanan',
    formula:'ok jika saldo yang tersimpan pada snapshot Laporan (saat dikirim) sesuai dengan saldo ledger aktual pada akhir periode tsb (selisih=0) - mendeteksi koreksi ledger yang terjadi setelah laporan dikirim',
    evidence:'Referensi Laporan (snapshot saldo) + saldo ledger akhir periode'
  }),
  indDef_('BDS06-I04','BDS06','RAB vs Realisasi Terlaporkan',20,{
    population:'Semua record Laporan Bulanan',
    formula:'ok jika snapshot Laporan menyertakan ringkasan RAB vs Realisasi untuk seluruh baris Anggaran periode tsb',
    evidence:'Referensi Laporan (snapshot RAB vs Realisasi)'
  }),
  indDef_('BDS06-I05','BDS06','Angka Laporan Dapat Ditelusuri ke Ledger',15,{
    population:'Semua record Laporan Bulanan (beda dari BDS05-I05: I05/BDS05=keberadaan tautan; ini=kebenaran nilai angka)',
    formula:'ok jika total Pemasukan/Pengeluaran pada snapshot Laporan sama dengan jumlah nominal Transaksi sumber yang tertaut (selisih=0)',
    evidence:'Referensi Laporan (snapshot angka) + Transaksi sumber'
  })
];
function indicatorByCode_(kode){ return INDICATOR_MASTER.find(k=>k.kode===kode); }
var __aktFeedCache = null;
function mkAkt_(kodeKpi, tanggal, ok, ref, opts){
  opts = opts||{};
  return Object.assign({
    id: 'fin_'+kodeKpi+'_'+(ref&&ref.id||uid_('akt')), kodeKpi, tanggal, periode: periodeOfDate_(tanggal),
    completionDate: ok ? tanggal : null, nilaiLangsung: ok?100:0,
    deskripsi: opts.deskripsi || (ref&&ref.label) || 'Aktivitas keuangan otomatis',
    bukti: opts.hasEvidence ? [{evidenceType: (ref&&ref.type||'DATA').toUpperCase(), referenceId: ref&&ref.id}] : [],
    checklistInstId: null, berdasarkanSurat:false,
    verificationStatus: opts.manual ? 'PENDING' : 'AUTO_VERIFIED',
    _problem: !ok, _ref: ref
  }, opts.extra||{});
}
function anchorDateForPeriode_(periode){
  const ym = periodeToYearMonth_(periode);
  if(!ym) return todayISO();
  return dateToISO_(new Date(ym.y, ym.m+1, 0));
}
function refTransaksi_(t, label){ return {type:'transaksi', id:t.id, label: label||(fmtDate_(t.tanggal)+' - '+t.jenis+' - '+fmtRp_(t.nominal))}; }
function refObligation_(o){ return {type:'obligation', id:o.key, label: siswaName_(o.siswaId)+' - '+o.komponenNama+' '+o.periode}; }
function refDokumen_(d){ return {type:'dokumen', id:d.id, label: d.judul}; }
function refAkun_(a){ return {type:'akun', id:a.id, label: a.nama}; }
function refMutasi_(m){ return {type:'mutasi', id:m.id, label: fmtDate_(m.tanggal)+' - '+fmtRp_(m.nominal)}; }
function refPeriode_(p){ return {type:'periode', id:p, label:'Periode '+p}; }
function refAnggaran_(a){ return {type:'anggaran', id:a.id, label: a.program+' - '+a.periode}; }
function refLaporan_(l){ return {type:'laporan', id:l.id, label: 'Laporan '+l.periode}; }
function transaksiRequiresEvidence_(t){ return t.jenis!=='TRANSFER' && !isMigrationArtifact_(t); }
var MUTASI_MENGGANTUNG_BATAS_HARI = 14;
var BUKTI_TOLERANSI_HARI = 30;
function pengeluaranPunyaPersetujuan_(t){ return Store.loadObligasi().some(o=>o.transaksiId===t.id); }
function rabDataClient_(){ const st = OperationalCache.states.alokasiPengeluaran; return {transaksi:allTransaksi_(), anggaran:Store.loadAnggaran(), alokasiPengeluaran:(st && st.loaded && !st.error) ? st.rows : [], kategoriPengeluaran:MasterAPI.expenseCategories()}; }
function rabMatchClient_(){ return rabMatchAll_(rabDataClient_()); }
function financialAktivitasFeed_(){
  if(__aktFeedCache) return __aktFeedCache;
  const out = [];
  const periode = Store.loadSettings().periodeAktif;
  const obligations = allObligationsAllSiswa();
  const penerimaan = penerimaanListReal_(); // Patch: Rp0/migration artifact TIDAK masuk KPI
  const pengeluaran = pengeluaranListReal_();
  const mutasi = Store.loadMutasiBank();
  const rekon = Store.loadRekonsiliasi();
  const dokumen = Store.loadDokumen();
  const akuns = akunList_();
  const anggaran = Store.loadAnggaran();
  const laporanAll = Store.loadLaporan();
  const today = todayISO();
  const anchor = anchorDateForPeriode_(periode);

  // ===== BDS01 - Penerimaan Siswa: Kewajiban & Pembayaran =====
  obligations.forEach(o=>{
    const tgl = (periodeToYearMonth_(o.periode)? dateToISO_(new Date(periodeToYearMonth_(o.periode).y, periodeToYearMonth_(o.periode).m,1)) : today);
    out.push(mkAkt_('BDS01-I01', tgl, !o.perluReview, refObligation_(o))); // Kewajiban Siswa Akurat: cek konflik keringanan nyata
    // Ekspektasi Penerimaan Siswa Terhitung & Terukur (WAJIB): Expected = Tarif
    // resolve (bruto>0) TERLEPAS dari ada/tidaknya Tagihan Formal snapshot -
    // TIDAK PERNAH NOT_APPLICABLE/0 hanya karena Tagihan Formal belum terbit.
    out.push(mkAkt_('BDS01-I02', tgl, Number(o.bruto||0)>0, refObligation_(o)));
    // Tunggakan Terukur & Tertelusur: populasi STABIL (semua kewajiban, bukan
    // hanya yang menunggak) supaya bulan dengan tunggakan Rp0 (hasil bagus)
    // tidak jatuh ke "Belum Ada Aktivitas" (kontribusi 0 di Zero Activity Rule).
    // Yang diukur tetap keterlusuran data tunggakan, BUKAN lunas/tidaknya -
    // kewajiban yang sudah lunas otomatis ok (tidak ada yang perlu ditelusuri).
    { const outstanding = sisaObligation(o)>0;
      const traceable = !outstanding || (!!siswaName_(o.siswaId) && siswaName_(o.siswaId)!=='-' && Number.isFinite(Number(o.netto)) && !!o.periode);
      out.push(mkAkt_('BDS01-I05', tgl, traceable, refObligation_(o)));
    }
    out.push(mkAkt_('BDS01-I06', tgl, !overAllocated_(o), refObligation_(o))); // Tidak Ada Double Allocation
  });
  penerimaan.filter(t=>t.siswaId).forEach(t=>{
    // Pembayaran Siswa Tercatat Lengkap (ACTUAL RECEIVED saja - kelengkapan record)
    out.push(mkAkt_('BDS01-I03', t.tanggal, !!(t.akunId&&t.nominal>0&&t.tanggal), refTransaksi_(t)));
    // Pembayaran Siswa Teridentifikasi & Teralokasi Valid (siswa+alokasi penuh+tidak overallocated)
    const alok = alokasiForTransaksi_(t.id);
    const touchedKeys = new Set(alok.map(a=>a.komponenId+'|'+a.periode));
    const anyOverAllocated = kewajibanForSiswa(t.siswaId).filter(ob=>touchedKeys.has(ob.komponenId+'|'+ob.periode)).some(overAllocated_);
    const validAlokasi = sisaBelumDialokasikan_(t.id)<=0.5 && !anyOverAllocated;
    out.push(mkAkt_('BDS01-I04', t.tanggal, validAlokasi, refTransaksi_(t)));
  });

  // ===== BDS02 - Mutasi Rekening & Rekonsiliasi =====
  mutasi.forEach(m=>{
    out.push(mkAkt_('BDS02-I01', m.tanggal, !!(m.tanggal&&Number(m.nominal||0)>0), refMutasi_(m))); // Seluruh Mutasi Rekening Tercatat
    const identified = m.status==='DIPROSES' && !!m.transaksiId;
    out.push(mkAkt_('BDS02-I02', m.tanggal, identified, refMutasi_(m))); // Mutasi Rekening Teridentifikasi
    const ageDays = m.tanggal ? (new Date()-new Date(m.tanggal))/86400000 : 0;
    out.push(mkAkt_('BDS02-I03', m.tanggal, identified || ageDays<=MUTASI_MENGGANTUNG_BATAS_HARI, refMutasi_(m))); // Tidak Menggantung Lewat Batas Waktu
    // Selisih Rekening Teridentifikasi & Dijelaskan: populasi STABIL (semua
    // mutasi, bukan hanya yang sudah dicocokkan) supaya periode tanpa selisih
    // (hasil bagus) tidak jatuh ke "Belum Ada Aktivitas". Belum dicocokkan
    // (identified=false) sudah jadi tanggung jawab I02/I03 - di sini ok=true
    // trivially supaya tidak dihukum dua kali untuk masalah yang sama.
    { let dijelaskanOk = true, hasEv = false;
      if(identified){
        const trx = transaksiById_(m.transaksiId);
        const selisih = trx ? Math.abs(Number(trx.nominal||0)-Number(m.nominal||0)) : 0;
        if(selisih>=1){
          dijelaskanOk = !!(m.keterangan && m.keterangan.trim()) || !!(trx && trx.catatan && trx.catatan.trim());
          hasEv = dijelaskanOk;
        }
      }
      out.push(mkAkt_('BDS02-I04', m.tanggal, dijelaskanOk, refMutasi_(m), {hasEvidence:hasEv}));
    }
  });
  akuns.filter(a=>a.jenis==='Bank').forEach(a=>{
    const ok = rekon.some(r=>r.akunId===a.id && r.periode===periode && r.status==='SELESAI');
    out.push(mkAkt_('BDS02-I05', anchor, ok, refAkun_(a), {hasEvidence:ok})); // Rekonsiliasi Bank Selesai
  });

  // ===== BDS03 - Pengeluaran & Pengendalian RAB =====
  const RAB_M_ = rabMatchClient_(); // [P1-RAB] satu aturan pencocokan untuk I03/I04/I05 dan Financial Control
  pengeluaran.forEach(t=>{
    out.push(mkAkt_('BDS03-I01', t.tanggal, !!(t.akunId&&t.nominal>0&&t.tanggal), refTransaksi_(t))); // Pengeluaran Tercatat Lengkap
    out.push(mkAkt_('BDS03-I02', t.tanggal, !!t.kategori && !!(t.penerima&&t.penerima.trim().length>=3), refTransaksi_(t))); // Kategori & Penerima
    // [P1-RAB] "ada RAB" = transaksi terpetakan PENUH (eksplisit 30_ALOKASI_PENGELUARAN atau aturan kategori) ke RAB DISETUJUI
    const rm = RAB_M_.perTrx[t.id];
    const rab = !!(rm && rm.disetujui);
    const disetujui = pengeluaranPunyaPersetujuan_(t); // K-RAB-07 belum disetujui: tidak diubah
    // Sesuai RAB Bulanan: STRICT - ok HANYA jika ada RAB yang cocok. Persetujuan
    // TIDAK menggantikan RAB di sini (itu tugas I05) - supaya I03 dan I05 TIDAK
    // menghitung hal yang sama (bug overlap sebelumnya: keduanya pakai !!rab||disetujui).
    out.push(mkAkt_('BDS03-I03', t.tanggal, !!rab, refTransaksi_(t), {hasEvidence: !!rab}));
    // Di Luar RAB Memiliki Persetujuan: ada RAB -> otomatis ok (bukan masalah
    // indikator ini). Tidak ada RAB -> WAJIB ada persetujuan/komitmen ObligasiSekolah.
    out.push(mkAkt_('BDS03-I05', t.tanggal, !!rab || disetujui, refTransaksi_(t), {hasEvidence: !!rab||disetujui}));
  });
  { const seen={}; pengeluaran.forEach(t=>{ const k=t.tanggal+'|'+t.penerima+'|'+t.nominal; const dup=!!seen[k]; seen[k]=true; out.push(mkAkt_('BDS03-I06', t.tanggal, !dup, refTransaksi_(t))); }); } // Tidak Ada Duplikat
  RAB_M_.lines.filter(g=>g.paguDisetujui > 0).forEach(g=>{
    // [P1-RAB] Realisasi Tidak Melebihi Pagu: populasi PER GARIS anggaran ber-RAB DISETUJUI (K-RAB-04/05); realisasi garis =
    // bagian eksplisit + aturan kategori tanpa hitung ganda. Tanpa garis disetujui -> tanpa aktivitas -> aturan N/A yang berlaku.
    const a = anggaran.find(x=>String(x.id)===g.rabIdsDisetujui.slice().sort()[0]) || {id:g.rabIdsDisetujui[0], program:g.kategori, periode:g.periode};
    const ok = g.realisasi <= g.paguDisetujui+0.5;
    const tglAnchor = anchorDateForPeriode_(g.periode) || anchor;
    out.push(mkAkt_('BDS03-I04', tglAnchor, ok, refAnggaran_(a), {hasEvidence:true}));
  });

  // ===== BDS04 - Pengendalian Kas, Bank & Saldo (anchor: tanggal dalam Periode Aktif) =====
  akuns.forEach(a=>{
    const saldo = akunSaldo_(a.id);
    const rekonAkunPeriode = rekon.filter(r=>r.akunId===a.id && r.periode===periode).sort((x,y)=>(y.createdAt||'').localeCompare(x.createdAt||''));
    const rekonTerbaru = rekonAkunPeriode[0];
    // Tidak Ada Saldo Tidak Wajar Tanpa Penjelasan: saldo negatif tidak otomatis
    // kesalahan Bendahara SELAMA sudah ada rekonsiliasi periode ini yang mencatatnya.
    const wajar = saldo>=0 || (rekonTerbaru && !!rekonTerbaru.catatan);
    out.push(mkAkt_('BDS04-I01', anchor, wajar, refAkun_(a), {hasEvidence: !!(rekonTerbaru&&rekonTerbaru.catatan)}));
    // Saldo Rekening Sesuai Catatan: populasi STABIL (semua akun setiap
    // periode, bukan hanya akun yang kebetulan sudah direkonsiliasi) -
    // ok jika sudah direkonsiliasi DAN selisih=0.
    out.push(mkAkt_('BDS04-I02', anchor, !!rekonTerbaru && Number(rekonTerbaru.selisih||0)===0, refAkun_(a), {hasEvidence:!!rekonTerbaru}));
    // Selisih Kas/Bank Teridentifikasi & Dijelaskan: populasi STABIL (semua
    // akun) - fokus posisi saldo akhir (beda dari BDS02-I04 yang fokus
    // matching mutasi bank). Belum direkonsiliasi/selisih=0 = tidak ada yang
    // perlu dijelaskan di sini (ok=true, sudah jadi tanggung jawab I02).
    const selisihOk = !rekonTerbaru || Number(rekonTerbaru.selisih||0)===0 || !!rekonTerbaru.catatan;
    out.push(mkAkt_('BDS04-I03', anchor, selisihOk, refAkun_(a), {hasEvidence: !!(rekonTerbaru&&rekonTerbaru.catatan)}));
    // Saldo Akhir Bulanan Dapat Ditelusuri: seluruh transaksi yang menyentuh akun
    // ini (s/d akhir periode) punya tanggal valid - mendukung rekonstruksi
    // Saldo Awal + Penerimaan - Pengeluaran +/- Transfer = Saldo Akhir.
    const trxAkun = allTransaksi_().filter(t=>!isMigrationArtifact_(t) && (t.akunId===a.id||t.akunTujuanId===a.id) && t.tanggal && t.tanggal<=anchor);
    const semuaBertanggal = trxAkun.every(t=>!!t.tanggal);
    out.push(mkAkt_('BDS04-I04', anchor, semuaBertanggal, refAkun_(a)));
  });

  // ===== BDS05 - Bukti & Pertanggungjawaban =====
  penerimaan.forEach(t=>{ const has=!!(t.buktiId&&t.buktiId.length); out.push(mkAkt_('BDS05-I01', t.tanggal, has, refTransaksi_(t), {hasEvidence:has})); });
  pengeluaran.forEach(t=>{ const has=!!(t.buktiId&&t.buktiId.length); out.push(mkAkt_('BDS05-I02', t.tanggal, has, refTransaksi_(t), {hasEvidence:has})); });
  dokumen.forEach(d=>out.push(mkAkt_('BDS05-I03', d.tanggal||anchor, !d.transaksiId || !!transaksiById_(d.transaksiId), refDokumen_(d), {hasEvidence:true})));
  allTransaksi_().filter(transaksiRequiresEvidence_).forEach(t=>{
    const has=!!(t.buktiId&&t.buktiId.length);
    const aging = t.tanggal && (new Date()-new Date(t.tanggal))/86400000>BUKTI_TOLERANSI_HARI;
    out.push(mkAkt_('BDS05-I04', t.tanggal, has||!aging, refTransaksi_(t), {hasEvidence:has}));
  });
  laporanAll.forEach(l=>{
    const ids = (l.snapshot&&Array.isArray(l.snapshot.transaksiIds)) ? l.snapshot.transaksiIds : [];
    const ok = ids.length>0 && ids.every(id=>!!transaksiById_(id));
    out.push(mkAkt_('BDS05-I05', (l.tanggalDibuat||anchor).slice(0,10), ok, refLaporan_(l), {hasEvidence:ok}));
  });

  // ===== BDS06 - Pelaporan Unit =====
  const laporanMeta = laporanAll.find(l=>l.periode===periode);
  out.push(Object.assign(mkAkt_('BDS06-I01', anchor, !!laporanMeta, refPeriode_(periode)), {completionDate: laporanMeta? (laporanMeta.tanggalDibuat||anchor).slice(0,10) : null}));
  out.push(Object.assign(mkAkt_('BDS06-I02', anchor, !!laporanMeta, refPeriode_(periode)), {completionDate: laporanMeta? (laporanMeta.tanggalDibuat||'').slice(0,10) : null}));
  laporanAll.forEach(l=>{
    const asOfL = anchorDateForPeriode_(l.periode);
    const snap = l.snapshot||{};
    // Saldo Laporan Sesuai Ledger: deteksi koreksi ledger SETELAH laporan dikirim
    const saldoLedgerSekarang = totalSaldoKas_(asOfL)+totalSaldoBank_(asOfL);
    const saldoOk = Math.abs(Number(snap.saldoTotal||0)-saldoLedgerSekarang)<0.5;
    out.push(mkAkt_('BDS06-I03', (l.tanggalDibuat||asOfL).slice(0,10), saldoOk, refLaporan_(l)));
    // RAB vs Realisasi Terlaporkan
    const anggaranPeriodeL = anggaran.filter(a=>a.periode===l.periode);
    const rabOk = anggaranPeriodeL.length===0 || (Array.isArray(snap.anggaranRealisasi) && snap.anggaranRealisasi.length===anggaranPeriodeL.length);
    out.push(mkAkt_('BDS06-I04', (l.tanggalDibuat||asOfL).slice(0,10), rabOk, refLaporan_(l), {hasEvidence: Array.isArray(snap.anggaranRealisasi)&&snap.anggaranRealisasi.length>0}));
    // Angka Laporan Dapat Ditelusuri ke Ledger (nilai, bukan sekadar keberadaan tautan - beda dari BDS05-I05)
    const idsL = Array.isArray(snap.transaksiIds) ? snap.transaksiIds : [];
    const resolved = idsL.map(transaksiById_).filter(Boolean);
    const sumPemasukan = resolved.filter(t=>t.jenis==='PENERIMAAN').reduce((s,t)=>s+Number(t.nominal||0),0);
    const sumPengeluaran = resolved.filter(t=>t.jenis==='PENGELUARAN').reduce((s,t)=>s+Number(t.nominal||0),0);
    const angkaOk = Math.abs(Number(snap.totalPemasukan||0)-sumPemasukan)<0.5 && Math.abs(Number(snap.totalPengeluaran||0)-sumPengeluaran)<0.5;
    out.push(mkAkt_('BDS06-I05', (l.tanggalDibuat||asOfL).slice(0,10), angkaOk, refLaporan_(l)));
  });

  __aktFeedCache = out;
  return out;
}
function indicatorProblemRows_(indicatorRow, periode){
  const def = indicatorByCode_(indicatorRow.kode) || indicatorRow;
  const win = getMeasurementWindow_(def, periode);
  if(!win) return [];
  const startISO=dateToISO_(win.start), endISO=dateToISO_(win.end);
  return financialAktivitasFeed_().filter(a=>a.kodeKpi===def.kode && a._problem && a.tanggal>=startISO && a.tanggal<=endISO).map(a=>a._ref);
}
function siswaName_(id){ const s=MasterAPI.students().find(x=>x.id===id); return s?s.nama:'-'; }
var OP_SHEETS = { transaksi:'05_TRANSAKSI', alokasi:'06_ALOKASI', kewajiban:'04_KEWAJIBAN', anggaran:'08_ANGGARAN', komitmen:'09_KOMITMEN',
  bukti:'10_BUKTI', mutasiBank:'11_MUTASI_BANK', dupReview:'12_DUP_REVIEW', kpi:'14_KPI', rekonsiliasi:'16_REKONSILIASI', laporan:'17_LAPORAN', rkat:'18_RKAT', lpj:'19_LPJ', audit:'13_AUDIT_LOG', alokasiPengeluaran:'30_ALOKASI_PENGELUARAN' };
function centralResolveTrxId_(id){ const m = centralSyncMapGet_(); return m[id] || id; }
var CC_ = {
  anggaran:{store:'Anggaran', key:'anggaran', num:['nominal','volume','hargaSatuan','sourceRow']},
  rkat:{store:'Rkat', key:'rkat', num:['tahun','volume','hargaSatuan','pagu','sourceRow']},
  lpj:{store:'Lpj', key:'lpj', num:['volume','hargaSatuan','diskon','nominal','sourceRow'], nul:['transaksiId']},
  mutasiBank:{store:'MutasiBank', key:'mutasiBank', num:['nominal'], nul:['transaksiId']},
  rekonsiliasi:{store:'Rekonsiliasi', key:'rekonsiliasi', num:['saldoSistem','saldoAktual','selisih']},
  dokumen:{store:'Dokumen', key:'bukti', nul:['transaksiId']},
  laporan:{store:'Laporan', key:'laporan', json:['snapshot']},
  kpiSnapshot:{store:'KpiSnapshot', key:'kpi', num:['skor']},
  obligasi:{store:'Obligasi', key:'komitmen', num:['nominal'], nul:['rabId']},
  tagihan:{store:'Tagihan', key:'kewajiban', custom:'tagihan'},
  importQueue:{store:'ImportQueue', key:'dupReview', custom:'importQueue'}
};
var CC_BLOBS = { keringananAssignment:{store:'KeringananAssignment', def:[]}, periodClosing:{store:'PeriodClosing', def:[]}, kpiTarget:{store:'KpiTarget', def:{}},
  checklistTpl:{store:'ChecklistTemplates', def:[]}, checklistInst:{store:'ChecklistInstances', def:[]}, kendala:{store:'Kendala', def:[]},
  cateringHari:{store:'CateringHari', def:{}}, pendaftaranStatus:{store:'PendaftaranStatus', def:[]} };
var SETTINGS_SYNC_KEYS = ['sekolah','yayasan','alamat','namaBendahara','jabatanBendahara','namaKepalaSekolah','nipKepalaSekolah','periodeAktif','tahunAjaranAktif','unitList','keringananPolicyList','budgetNearLimitPct','kebijakanEnrollmentTengahPeriode','docSeqCounters'];
function ccStr_(v){ return (v===null || v===undefined) ? '' : String(v); }
function ccFromRow_(name, r){
  const c = CC_[name];
  if(c.custom === 'tagihan'){
    if(!ccStr_(r.tagihanId)) return null;
    let pot = []; const ps = ccStr_(r.potongan);
    if(ps.charAt(0) === '['){ try{ pot = JSON.parse(ps); }catch(e){} }
    const k = komponenById_(ccStr_(r.komponenId));
    return {id:ccStr_(r.id), siswaId:ccStr_(r.siswaId), komponenId:ccStr_(r.komponenId), komponen:k ? k.nama : ccStr_(r.komponenId), periode:ccStr_(r.periode), tagihanBruto:Number(r.bruto)||0, potongan:pot,
      tagihanNetto:Number(r.netto)||0, jatuhTempo:ccStr_(r.jatuhTempo), tahunAjaran:ccStr_(r.tahunAjaran), _computedAt:ccStr_(r.computedAt),
      kelas:ccStr_(r.kelas), unit:ccStr_(r.unit), tarifId:ccStr_(r.tarifId), tarifSatuan:(r.tarifSatuan === '' || r.tarifSatuan === undefined || r.tarifSatuan === null) ? null : Number(r.tarifSatuan), jumlahHari:(r.jumlahHari === '' || r.jumlahHari === undefined || r.jumlahHari === null) ? null : Number(r.jumlahHari)};
  }
  if(c.custom === 'importQueue'){
    try{ const p = JSON.parse(ccStr_(r.payload)); if(p && typeof p === 'object'){ p.id = ccStr_(r.id); return p; } }catch(e){}
    return {id:ccStr_(r.id), type:ccStr_(r.type), resolved:ccStr_(r.status) === 'RESOLVED'};
  }
  const o = Object.assign({}, r);
  delete o.archivedAt; delete o.archivedBy; delete o.archiveReason;
  (c.num || []).forEach(f=>{ if(o[f] !== undefined && o[f] !== '' && isFinite(Number(o[f]))) o[f] = Number(o[f]); });
  (c.nul || []).forEach(f=>{ if(o[f] === '') o[f] = null; });
  (c.json || []).forEach(f=>{ if(typeof o[f] === 'string' && o[f]){ try{ o[f] = JSON.parse(o[f]); }catch(e){} } });
  return o;
}
function ccSettingsMap_(){
  const m = Object.assign({}, (CentralMasterData.ready && CentralMasterData.settings) || {});
  const p = ccSetPend_(); Object.keys(p).forEach(k=>{ m[k] = p[k].value; });
  return m;
}
function ccBlobGet_(name){
  const m = ccSettingsMap_(), n = Number(m['blob.' + name + '.n']);
  if(!(n > 0)) return null;
  let s = ''; for(let i = 0; i < n; i++) s += ccStr_(m['blob.' + name + '.' + i]);
  try{ return JSON.parse(s); }catch(e){ return null; }
}
function ccParseSetting_(k, v, def){
  if(typeof def === 'number') return Number(v);
  if(def !== null && typeof def === 'object'){ try{ const r = JSON.parse(v); return r === null ? def : r; }catch(e){ return def; } }
  return v;
}
function ccSettingsLoad_(orig){
  const base = orig();
  if(!ccSettingsActive_()) return base;
  const m = ccSettingsMap_();
  SETTINGS_SYNC_KEYS.forEach(function(k){
    if(!(k in m)) return;
    const val = ccParseSetting_(k, m[k], DEFAULT_SETTINGS[k]);
    if(k === 'docSeqCounters' && val && typeof val === 'object'){ const loc = base.docSeqCounters || {}; const out = Object.assign({}, val); Object.keys(loc).forEach(c=>{ out[c] = Math.max(Number(out[c]) || 0, Number(loc[c]) || 0); }); base[k] = out; }
    else base[k] = val;
  });
  return base;
}

// ---- [P1_26] SHIM DATA SERVER untuk KPI (bagian tulisan tangan; disisipkan build_kpi_engine.js) ----
/* Tujuan: menjalankan fungsi KPI klien yang SAMA (disalin verbatim di atas) di server, dengan masukan yang SAMA dengan yang diterima
   klien pada mode pusat: baris dari opReadSheet (dibaca berhalaman sampai lengkap), data master dari getSettings/getAccounts/
   getExpenseCategories (MasterDataRead.gs), kewajiban dari konteks ObligationEngine (oblLoadContext_).
   Perbedaan yang DISENGAJA terhadap klien: tidak ada antrean lokal/peramban (operasi tertunda, overlay, data lokal lama) - server
   hanya menghitung data yang sudah tersimpan di Sheets.
   Sumber gagal dibaca / skema tidak cocok / pembacaan tidak lengkap -> OperationalCache.states[k].error -> kpiDataStatus_ (kode klien
   yang sama) -> 'DATA TIDAK TERSEDIA' dengan skor null, BUKAN 0.
   Formula, bobot, target, ambang 31 KPI TIDAK didefinisikan di sini: semuanya berasal dari salinan verbatim INDICATOR_MASTER/KPI_MASTER
   dan mesin skor klien. */
var KPI_CTX_ = null;
var CentralAuth = { authorized: true, checked: true };
var CentralMasterData = { ready: false, settings: null, accounts: null, expenseCategories: null };
var OperationalCache = { states: {} };
var CENTRAL_CONFIG = { readOperational: true, writeTransactions: false, writeMaster: false, writeCollections: false, writeSettings: false, writeAudit: false };
var ServerBridge = { __shimServerKpi: true }; // kpiDataStatus_ klien memeriksa keberadaan ServerBridge; di server = penanda saja
function lsGet_(k, def) { return def; }
function lsSet_(k, v) { /* server: tidak ada penyimpanan lokal */ }
function lsKey_(k) { return 'srv_' + k; }
function centralReady_() { return true; }
function centralSyncMapGet_() { return {}; }
function centralOverlayGet_() { return {}; }
function centralArchiveMapGet_() { return {}; }
function centralCutoverDone_() { return true; }
function ccMasterPend_(k) { return {}; }
function ccSetPend_() { return {}; }
function ccSettingsActive_() { return true; }
function centralMasterOverlay_(key, rows) { return rows; }

/* baris lengkap satu sheet persis seperti yang diterima klien (opReadSheet berhalaman); galat -> state.error */
function kpiReadAll_(sheetName) {
  var rows = [], offset = 0, headers = [], total = null, guard = 0;
  while (guard++ < 1000) {
    var r = opReadSheet(sheetName, { offset: offset, limit: 5000 });
    if (!r || !r.ok) return { loaded: false, error: (r && r.code) || 'READ_FAILED', rows: [], headers: [] };
    headers = r.data.headers; total = r.data.total;
    rows = rows.concat(r.data.rows); offset += r.data.returned;
    if (r.data.sheetMissing || rows.length >= total || !r.data.returned) break;
  }
  if (total !== null && rows.length !== total) return { loaded: false, error: 'INCOMPLETE_READ', rows: [], headers: headers };
  return { loaded: true, error: null, rows: rows, headers: headers };
}
function kpiNormTrx_(r, idx) {
  var str = function (v) { return (v === null || v === undefined) ? '' : String(v); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var dstr = function (v) { var s = str(v); return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s; };
  /* salinan normTrx (OperationalAPI klien) */
  var o = Object.assign({}, r, { id: str(r.id), jenis: str(r.jenis), tanggal: dstr(r.tanggal), unit: str(r.unit), nominal: num(r.nominal), akunId: str(r.akunId),
    metode: str(r.metode), status: str(r.status), siswaId: str(r.siswaId), createdAt: str(r.createdAt), catatan: str(r.catatan), sumber: str(r.sumber), kategori: str(r.kategori),
    subkategori: str(r.subkategori), penerima: str(r.penerima), resiNo: str(r.resiNo), ftNumber: str(r.ftNumber), namaPengirim: str(r.namaPengirim), buktiId: [] });
  if (idx[o.id]) o.buktiId = idx[o.id].slice();
  return o;
}
function kpiNormAkun_(r) { var s = function (v) { return (v === null || v === undefined) ? '' : String(v); }; var n = Number(r.saldoAwal); return Object.assign({}, r, { id: s(r.id), nama: s(r.nama), jenis: s(r.jenis), saldoAwal: isFinite(n) ? n : 0, status: s(r.status) }); }
function kpiNormKategori_(r) { var s = function (v) { return (v === null || v === undefined) ? '' : String(v); }; return Object.assign({}, r, { id: s(r.id), kode: s(r.kode), kategori: s(r.kategori), status: s(r.status) }); }
function kpiCcView_(name) {
  var st = OperationalCache.states[CC_[name].key];
  if (!st || !st.loaded || st.error) return [];
  var out = [];
  st.rows.forEach(function (r) { var id = ccStr_(r.id); if (!id || ccStr_(r.archivedAt)) return; var o = ccFromRow_(name, r); if (!o) return; o.id = id; out.push(o); });
  return JSON.parse(JSON.stringify(out));
}
function kpiBlob_(name) { var v = ccBlobGet_(name); return v === null ? JSON.parse(JSON.stringify(CC_BLOBS[name].def)) : v; }
/* pasang fungsi data pada shim Store/MasterAPI/OperationalAPI milik ObligationEngine SELAMA perhitungan KPI saja; mengembalikan fungsi
   pemulih (dipanggil di finally) supaya perilaku opObligations/oblSnapshotCore_ di eksekusi yang sama tidak berubah. */
function kpiInstallShim_() {
  var saved = [], set = function (obj, k, fn) { saved.push([obj, k, Object.prototype.hasOwnProperty.call(obj, k), obj[k]]); obj[k] = fn; };
  set(Store, 'loadSettings', function () { return ccSettingsLoad_(function () { return deepClone_(DEFAULT_SETTINGS); }); });
  ['anggaran', 'mutasiBank', 'rekonsiliasi', 'dokumen', 'laporan', 'obligasi', 'rkat', 'lpj'].forEach(function (n) { set(Store, 'load' + CC_[n].store, function () { return kpiCcView_(n); }); });
  ['kpiTarget', 'checklistTpl', 'checklistInst', 'kendala', 'periodClosing'].forEach(function (n) { set(Store, 'load' + CC_BLOBS[n].store, function () { return kpiBlob_(n); }); });
  set(Store, 'loadTransaksi', function () { return []; }); set(Store, 'loadAlokasi', function () { return []; }); // tidak ada data lokal di server
  set(MasterAPI, 'accounts', function () { return (CentralMasterData.accounts || []).map(kpiNormAkun_); });
  set(MasterAPI, 'expenseCategories', function () { return (CentralMasterData.expenseCategories || []).map(kpiNormKategori_); });
  set(OperationalAPI, 'transaksi', function () { return KPI_CTX_.transaksi; });
  return function () { saved.reverse().forEach(function (x) { if (x[2]) x[0][x[1]] = x[3]; else delete x[0][x[1]]; }); };
}
function kpiLoadContext_() {
  OperationalCache.states = {};
  var keys = KPI_SOURCE_KEYS_.slice(); ['rkat', 'lpj'].forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
  keys.forEach(function (k) { OperationalCache.states[k] = kpiReadAll_(OP_SHEETS[k]); });
  var ms = [['settings', getSettings], ['accounts', getAccounts], ['expenseCategories', getExpenseCategories]], mOk = true;
  ms.forEach(function (x) { var r = x[1](); if (r && r.ok && r.code === 'SUCCESS') CentralMasterData[x[0]] = r.data; else mOk = false; });
  CentralMasterData.ready = mOk;
  var bs = OperationalCache.states.bukti, idx = {};
  if (bs.loaded && !bs.error) bs.rows.forEach(function (b) { var t = ccStr_(b.transaksiId); if (t) (idx[t] = idx[t] || []).push(ccStr_(b.id)); });
  var ts = OperationalCache.states.transaksi;
  KPI_CTX_ = { transaksi: ts.loaded && !ts.error ? ts.rows.map(function (r) { return kpiNormTrx_(r, idx); }) : [] };
  OBL_CTX_ = oblLoadContext_(); // kewajiban: konteks yang sama dengan opObligations (diuji diferensial klien vs server sejak P1)
}
/* [P1_26] PROTOTIPE SANDBOX - KPI dihitung di server dengan definisi klien yang sama. BELUM menggantikan hasil resmi aplikasi
   (aplikasi tetap menampilkan hasil klien). Baca-saja; peran baca. periode wajib "<Bulan> <Tahun>". */
function opKpiServer(periode) {
  var g = opGate_(OP_READ_ROLES_); if (!g.ok) return g;
  var obl0 = OBL_CTX_, pulihkan = kpiInstallShim_();
  try {
    kpiLoadContext_();
    var settingsSrv = Store.loadSettings();
    __aktFeedCache = null;
    var p = opStr_(periode) || settingsSrv.periodeAktif;
    var sum0 = kpiIndukSummary_(p);
    return okResult_('KPI server (prototipe, baca-saja)', opJsonSafe_({ periode: p, summary: sum0, sumber: Object.keys(OperationalCache.states).map(function (k) { var s = OperationalCache.states[k]; return { key: k, sheet: OP_SHEETS[k], loaded: s.loaded, error: s.error, baris: s.rows.length }; }), masterTermuat: CentralMasterData.ready, computedAt: new Date().toISOString() }));
  } catch (e) {
    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung KPI server');
  } finally { pulihkan(); OBL_CTX_ = obl0; KPI_CTX_ = null; __aktFeedCache = null; OperationalCache.states = {}; CentralMasterData.ready = false; }
}
