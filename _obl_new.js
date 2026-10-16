function tarifRowFor(komponenId, unit, kelas, tahunAjaran){
  const rows = MasterAPI.tariffs().filter(t=>t.komponenId===komponenId && t.status!=='Nonaktif' && (!t.unit||t.unit===unit) && (!t.kelas||t.kelas===kelas) && (!t.tahunAjaran||t.tahunAjaran===tahunAjaran));
  if(!rows.length) return null;
  const scored = rows.map(t=>({t, score:(t.kelas?4:0)+(t.unit?2:0)+(t.tahunAjaran?1:0)}));
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].t;
}
function tarifFor(komponenId, unit, kelas, tahunAjaran){
  const t = tarifRowFor(komponenId, unit, kelas, tahunAjaran);
  return t ? Number(t.nominal||0) : 0;
}
/* Jumlah hari katering TERJADWAL per unit+periode (diisi manual oleh Bendahara; tagihan TIDAK bergantung kehadiran siswa).
   null = belum diisi -> kewajiban katering periode itu belum bisa dihitung (tidak ada nilai bawaan). */
function cateringHariFor(unit, periode){
  const m = Store.loadCateringHari() || {};
  const v = m[unit+'|'+periode];
  if(v===undefined || v===null || v==='') return null;
  const n = Number(v);
  return (isFinite(n) && n>=0) ? n : null;
}
/* Klasifikasi pendaftaran siswa per tahun ajaran: 'BARU' | 'DAFTAR_ULANG' | '' (belum/tidak diklasifikasi). Selalu eksplisit, tidak pernah ditebak. */
function pendaftaranStatusFor(siswaId, tahunAjaran){
  const r = (Store.loadPendaftaranStatus()||[]).find(x=>x.siswaId===siswaId && x.tahunAjaran===tahunAjaran);
  return r ? String(r.jenis||'') : '';
}
function komponenSasaranOk(siswa, k){
  const s = k.sasaran||'';
  if(!s || s==='SEMUA') return true;
  return pendaftaranStatusFor(siswa.id, siswa.tahunAjaran||Store.loadSettings().tahunAjaranAktif)===s;
}
/* Komponen rincian "menggantikan" komponen lump lama. Jika siswa sudah punya kewajiban BEKU (snapshot) atas komponen lump itu
   (artinya pembayaran historis menempel ke sana), rincian TIDAK ditagihkan lagi supaya tidak terjadi tagihan ganda. */
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
  const snap = Store.loadTagihan().find(t=>t.siswaId===siswa.id && t.komponen===komponen.nama && t.periode===periode);
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
    const k = komps.find(c=>c.nama===t.komponen);
    if(!k || seen.has(siswaId+'|'+k.id+'|'+t.periode)) return;
    push(kewajibanSatuBaris(siswa, k, t.periode));
  });
  return periodeFilter ? out.filter(o=>o.periode===periodeFilter) : out;
}
/* Identitas kewajiban = siswa + komponen + periode (kunci yang sama untuk satu kewajiban). tagihanId hanya mempercepat bila keduanya ada.
   Alokasi yang dibuat SEBELUM kewajiban dibekukan (tanpa tagihanId) tetap terhitung setelah pembekuan; nominal yang sama pada komponen lain TIDAK pernah cocok. */
function resolveObligationMatch(alokasi, ob){
  if(alokasi.tagihanId && ob.tagihanId && alokasi.tagihanId===ob.tagihanId) return true;
  return alokasi.siswaId===ob.siswaId && alokasi.komponenId===ob.komponenId && alokasi.periode===ob.periode;
}
