/* apply_tarif.js - tahap KEDUA build: dijalankan SETELAH apply_central.js. Idempoten terhadap output apply_central (selalu mulai dari output segar). */
const fs = require('fs');
const OUT = 'C:/Users/HP/OneDrive/Desktop/Bendahara/MASTER_API_REFACTOR/';
const rd = f => fs.readFileSync(OUT + f, 'utf8').replace(/\r\n/g, '\n');
const P = OUT + 'Bendahara_V2.html';
let t = fs.readFileSync(P, 'utf8'); const crlf = t.includes('\r\n'); t = t.replace(/\r\n/g, '\n');
if (t.includes('15e. TARIF 2026/2027')) throw new Error('Output sudah berisi blok 15e - jalankan apply_central.js dulu (mulai dari output segar)');
const log = [];
const rep = (a, b, tag) => { const n = t.split(a).length - 1; if (n !== 1) throw new Error('anchor ' + n + 'x: ' + (tag || a.slice(0, 80))); t = t.replace(a, () => b); log.push(tag || a.slice(0, 50)); };

// ---- pencari fungsi top-level sadar string/komentar ----
function fnRange(name) {
  const re = new RegExp('^function ' + name + '\\(', 'm'); const m = re.exec(t);
  if (!m) throw new Error('fungsi tidak ada: ' + name);
  let i = t.indexOf('{', t.indexOf(')', m.index)), depth = 0, q = null;
  for (let j = i; j < t.length; j++) {
    const ch = t[j], nx = t[j + 1];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { j = t.indexOf('\n', j); continue; }
    if (ch === '/' && nx === '*') { j = t.indexOf('*/', j) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { let end = j + 1; if (t[end] === '\n') end++; return [m.index, end]; } }
  }
  throw new Error('kurung tidak seimbang: ' + name);
}
const removeFn = name => { const [a, b] = fnRange(name); t = t.slice(0, a) + t.slice(b); log.push('hapus fungsi ' + name); };
const insertAfterFn = (name, text) => { const [, b] = fnRange(name); t = t.slice(0, b) + text.replace(/\n?$/, '\n') + t.slice(b); log.push('sisip setelah ' + name); };

// ---- 1. fungsi kewajiban: ganti set lama dengan versi baru (tarifRowFor, cateringHariFor, sasaran, digantikan, snapshot, match) ----
const oblNew = rd('_obl_new.js');
const [ta0] = fnRange('tarifFor');
['tarifFor', 'kewajibanSatuBaris', 'kewajibanForSiswa', 'resolveObligationMatch'].forEach(removeFn);
t = t.slice(0, ta0) + oblNew.replace(/\n?$/, '\n') + t.slice(ta0); log.push('sisip _obl_new.js');

// ---- 2. inti FCC: tambahkan anggaran-vs-aktual + rencana tarif (kode identik dgn server) ----
insertAfterFn('fccCompute_', rd('_fcc_budget.js') + '\n' + rd('_tarif_pure.js'));

// ---- 3. Store: blob baru ----
rep("  saveKeringananAssignment(a){ lsSet(lsKey('keringananAssignment'), a); },",
    "  saveKeringananAssignment(a){ lsSet(lsKey('keringananAssignment'), a); },\n  loadCateringHari(){ return lsGet(lsKey('cateringHari'), {}); },\n  saveCateringHari(o){ lsSet(lsKey('cateringHari'), o); },\n  loadPendaftaranStatus(){ return lsGet(lsKey('pendaftaranStatus'), []); },\n  savePendaftaranStatus(a){ lsSet(lsKey('pendaftaranStatus'), a); },", 'Store blob');
rep("kpiSnapshot:this.loadKpiSnapshot(), tarif:this.loadTarif(), keringananAssignment:this.loadKeringananAssignment(),", "kpiSnapshot:this.loadKpiSnapshot(), tarif:this.loadTarif(), keringananAssignment:this.loadKeringananAssignment(), cateringHari:this.loadCateringHari(), pendaftaranStatus:this.loadPendaftaranStatus(),", 'export');
rep("    if(d.keringananAssignment) this.saveKeringananAssignment(d.keringananAssignment);", "    if(d.keringananAssignment) this.saveKeringananAssignment(d.keringananAssignment);\n    if(d.cateringHari) this.saveCateringHari(d.cateringHari);\n    if(d.pendaftaranStatus) this.savePendaftaranStatus(d.pendaftaranStatus);", 'import');

// ---- 4. fungsi UI yang diganti versi baru (didefinisikan di blok 15e) ----
['openAnggaranForm', 'submitAnggaran', 'submitGenerateTagihan'].forEach(removeFn);

// ---- 5. blok 15e klien: setelah blok 15d (akhir pdCutoverRollback) ----
insertAfterFn('pdCutoverRollback', rd('_tarif_client.js'));

// ---- 6. alokasi: validasi per-kewajiban untuk satu permintaan (jumlah beberapa baris pada kewajiban yang sama) ----
rep("    if(!chk.ok) throw new Error(chk.msg);\n  });\n  const arr = Store.loadAlokasi();",
    "    if(!chk.ok) throw new Error(chk.msg);\n  });\n  const chkBatch = validateAllocationBatch(list);\n  if(!chkBatch.ok) throw new Error(chkBatch.msg);\n  const arr = Store.loadAlokasi();", 'createAlokasi batch');

// ---- 7. komponen: field sasaran / basisTarif / menggantikan ----
rep("    fieldSelect('kmf_status','Status',['Aktif','Nonaktif'],k.status||'Aktif')+\n    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Batal</button><button class=\"btn primary\" onclick=\"submitKomponen('",
    "    fieldSelect('kmf_status','Status',['Aktif','Nonaktif'],k.status||'Aktif')+\n    fieldSelect('kmf_sasaran','Sasaran tagihan (kosong/SEMUA = semua siswa unit; BARU / DAFTAR_ULANG = hanya siswa terklasifikasi)',['','SEMUA','BARU','DAFTAR_ULANG'],k.sasaran||'')+\n    fieldSelect('kmf_basis','Dasar tarif (kosong = nominal tetap; PER_HARI_TERJADWAL = tarif x hari katering terjadwal)',['','PER_HARI_TERJADWAL'],k.basisTarif||'')+\n    fieldText('kmf_ganti','Menggantikan komponen lump lama (id, pisahkan koma)',k.menggantikan||'')+\n    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"closeModal()\">Batal</button><button class=\"btn primary\" onclick=\"submitKomponen('", 'form komponen');
rep("    const dk = {nama:val('kmf_nama'), unit:val('kmf_unit'), frekuensi:val('kmf_frek'), status:val('kmf_status')};", "    const dk = Object.assign({nama:val('kmf_nama'), unit:val('kmf_unit'), frekuensi:val('kmf_frek'), status:val('kmf_status')}, komponenExtraFields_(id));", 'komponen central');
rep("  const data = {nama:val('kmf_nama'), unit:val('kmf_unit'), frekuensi:val('kmf_frek'), status:val('kmf_status')};", "  const data = Object.assign({nama:val('kmf_nama'), unit:val('kmf_unit'), frekuensi:val('kmf_frek'), status:val('kmf_status')}, komponenExtraFields_(id));", 'komponen lokal');
rep("aliasOf:str(r.aliasOf)});", "aliasOf:str(r.aliasOf), sasaran:str(r.sasaran), basisTarif:str(r.basisTarif), menggantikan:str(r.menggantikan)});", 'normKomponen');

// ---- 8. siswa: beku kewajiban saat tahun ajaran berubah ----
rep("    centralMasterSave('siswa', id, d0, 'Data siswa tersimpan di Google Sheets'); return;", "    if(id) studentFreezeBeforeChange_(id, d0);\n    centralMasterSave('siswa', id, d0, 'Data siswa tersimpan di Google Sheets'); return;", 'siswa central');
rep("  if(!data.nama){ toast('Nama wajib diisi'); return; }\n  if(id){ const idx=arr.findIndex(s=>s.id===id);", "  if(!data.nama){ toast('Nama wajib diisi'); return; }\n  if(id) studentFreezeBeforeChange_(id, data);\n  if(id){ const idx=arr.findIndex(s=>s.id===id);", 'siswa lokal');

// ---- 9. halaman Anggaran: tab "Anggaran vs Aktual" ----
rep("['anggaran','rab','komitmen','realisasi','sisa'].map(t=>{\n      const labels={anggaran:'Anggaran', rab:'RAB', komitmen:'Komitmen', realisasi:'Realisasi', sisa:'Sisa'};",
    "['anggaran','rab','komitmen','realisasi','sisa','banding'].map(t=>{\n      const labels={anggaran:'Anggaran', rab:'RAB', komitmen:'Komitmen', realisasi:'Realisasi', sisa:'Sisa', banding:'Anggaran vs Aktual'};", 'tabs anggaran');
rep("    rows.forEach(a=>{ html += '<tr><td>'+esc(a.program)+'</td><td>'+esc(a.periode)+'</td>", "    rows.forEach(a=>{ html += '<tr><td>'+esc(a.program)+(a.jenis==='PEMASUKAN'?' <span class=\"badge green\">PEMASUKAN</span>':'')+'</td><td>'+esc(a.periode)+'</td>", 'badge pemasukan');
rep("  } else {\n    html += '<div class=\"tablewrap\"><table><thead><tr><th>Program</th><th>Anggaran</th><th>Realisasi</th><th>Komitmen</th><th>Sisa</th></tr></thead><tbody>';",
    "  } else if(State.anggaranTab==='banding'){\n    html += renderAnggaranBanding();\n  } else {\n    html += '<div class=\"tablewrap\"><table><thead><tr><th>Program</th><th>Anggaran</th><th>Realisasi</th><th>Komitmen</th><th>Sisa</th></tr></thead><tbody>';", 'branch banding');

// ---- 10. panel di Pengaturan > Backup ----
rep("  html += renderPengaturanPusatData();", "  html += renderPengaturanTarifKewajiban();\n  html += renderPengaturanPusatData();", 'panel tarif');

fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('apply_tarif OK: ' + log.length + ' perubahan');
