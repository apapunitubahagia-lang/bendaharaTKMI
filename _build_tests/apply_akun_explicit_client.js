// Langkah build P1-IMP Prioritas B (klien). Dijalankan SETELAH apply_kewajiban_guard_client.js. Paket terpisah agar mudah di-revert.
// Akun Kas/Bank WAJIB dipilih eksplisit di jalur UI lama yang masih aktif: form Penerimaan (pf_akun), form Pengeluaran
// (gf_akun), wizard Pembayaran (pw_akun), "Buat Transaksi dari Mutasi Bank" (sebelumnya akun Bank pertama otomatis), dan wizard
// impor Mutasi Bank lama (sebelumnya akun Bank pertama otomatis per baris; kini satu akun Bank dipilih eksplisit per berkas).
// Perilaku akuntansi tidak berubah (akun tetap disimpan apa adanya); data historis tidak disentuh. Server ikut menolak
// transaksi tanpa akun (OperationalAPI.gs opEngineWrite_).
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
const PILIH = "[{value:'',label:'- Pilih Akun Kas/Bank (wajib) -'}].concat(";
// form Penerimaan
L.rep(doc, "  const akun = document.getElementById('pf_akun') ? val('pf_akun') : akunList()[0].id;", "  const akun = document.getElementById('pf_akun') ? val('pf_akun') : ''; // [P1-IMP B] tanpa akun bawaan", 'pf_akun awal', log);
L.rep(doc, "fieldSelect('pf_akun','Akun Kas/Bank', akunList().map(a=>({value:a.id,label:a.nama})), akun)", "fieldSelect('pf_akun','Akun Kas/Bank', " + PILIH + "akunList().map(a=>({value:a.id,label:a.nama}))), akun)", 'pf_akun opsi', log);
L.rep(doc, "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  const agg = siswa ?", "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  if(!akunList().some(a=>a.id===val('pf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n  const agg = siswa ?", 'submitPenerimaan akun', log);
// form Pengeluaran
L.rep(doc, "  const akun = document.getElementById('gf_akun') ? val('gf_akun') : akunList()[0].id;", "  const akun = document.getElementById('gf_akun') ? val('gf_akun') : ''; // [P1-IMP B] tanpa akun bawaan", 'gf_akun awal', log);
L.rep(doc, "fieldSelect('gf_akun','Akun Kas/Bank', akunList().map(a=>({value:a.id,label:a.nama})), akun)", "fieldSelect('gf_akun','Akun Kas/Bank', " + PILIH + "akunList().map(a=>({value:a.id,label:a.nama}))), akun)", 'gf_akun opsi', log);
L.rep(doc, "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  const tanggal = val('gf_tanggal')", "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  if(!akunList().some(a=>a.id===val('gf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n  const tanggal = val('gf_tanggal')", 'submitPengeluaran akun', log);
// wizard Pembayaran (validasi akun sudah ada; opsi kosong agar tidak tampil terpilih otomatis)
L.rep(doc, "fieldSelect('pw_akun','Akun Kas/Bank', akunList().map(a=>({value:a.id,label:a.nama+' ('+a.jenis+')'})), w.data.akunId||'')", "fieldSelect('pw_akun','Akun Kas/Bank', " + PILIH + "akunList().map(a=>({value:a.id,label:a.nama+' ('+a.jenis+')'}))), w.data.akunId||'')", 'pw_akun opsi', log);
// Buat Transaksi dari Mutasi Bank
L.rep(doc, "    unitFieldHtml('mtu_unit','')+\n    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"openMutasiReconcileReview(",
  "    unitFieldHtml('mtu_unit','')+\n    fieldSelect('mtu_akun','Akun Bank penerima (wajib)', [{value:'',label:'- Pilih Akun Bank -'}].concat(akunList().filter(a=>a.jenis==='Bank').map(a=>({value:a.id,label:a.nama}))), '')+ // [P1-IMP B]\n    '<div class=\"modal-actions\"><button class=\"btn\" onclick=\"openMutasiReconcileReview(", 'mtu_akun', log);
L.rep(doc, "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  const arr = Store.loadMutasiBank();",
  "  if(!unit){ toast('Unit (TK/MI) wajib dipilih'); return; }\n  const akunMut = akunList().find(a=>a.id===val('mtu_akun') && a.jenis==='Bank'); // [P1-IMP B] sebelumnya akun Bank pertama otomatis\n  if(!akunMut){ toast('Akun Bank penerima wajib dipilih (tidak ada akun bawaan)'); return; }\n  const arr = Store.loadMutasiBank();", 'createTransaksiFromMutasi cek', log);
L.rep(doc, "akunId:akunList().find(a=>a.jenis==='Bank')?.id||akunList()[0].id, unit, nominal:m.nominal", "akunId:akunMut.id, unit, nominal:m.nominal", 'createTransaksiFromMutasi akun', log);
// wizard impor Mutasi Bank lama
L.rep(doc, "      '<p class=\"small-muted\">Kolom yang tidak dipetakan tetap disimpan sebagai info tambahan (EXTRA_COLUMN), tidak dibuang.</p>'+",
  "      '<p class=\"small-muted\">Kolom yang tidak dipetakan tetap disimpan sebagai info tambahan (EXTRA_COLUMN), tidak dibuang.</p>'+\n" +
  "      (s.type==='mutasibank' ? '<div class=\"field\"><label>Akun Bank penerima untuk seluruh berkas (wajib)</label><select id=\"imp_mb_akun\" onchange=\"State.importSession.akunId=this.value\"><option value=\"\">- Pilih Akun Bank -</option>'+akunList().filter(a=>a.jenis==='Bank').map(a=>'<option value=\"'+esc(a.id)+'\"'+(s.akunId===a.id?' selected':'')+'>'+esc(a.nama)+'</option>').join('')+'</select></div>' : '')+ // [P1-IMP B]", 'mutasibank map akun', log);
L.rep(doc, "function importWizardProceedToPreview(){\n  const s = State.importSession;\n",
  "function importWizardProceedToPreview(){\n  const s = State.importSession;\n  if(s.type==='mutasibank' && !akunList().some(a=>a.id===s.akunId && a.jenis==='Bank')){ toast('Akun Bank penerima wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n", 'mutasibank preview cek', log);
L.rep(doc, "    akunId:(s.akunKasBankList.find(a=>a.jenis==='Bank')||s.akunKasBankList[0]).id, unit:res.unit, nominal:res.nominal, metode:'Transfer Bank',",
  "    akunId:impMbAkun_(res), unit:res.unit, nominal:res.nominal, metode:'Transfer Bank', // [P1-IMP B] akun Bank eksplisit", 'commitMutasiBankRow akun', log);
L.rep(doc, "function commitMutasiBankRow(get, extra, res, rawRow, headerMap){",
  "/* [P1-IMP B] Akun Bank untuk baris mutasi: dipilih eksplisit di wizard (State.importSession.akunId) atau tersimpan di item antrean. */\nfunction impMbAkun_(res){\n  const id = (res && res.akunId) || (State.importSession && State.importSession.type==='mutasibank' && State.importSession.akunId) || '';\n  const a = akunList().find(x=>x.id===id && x.jenis==='Bank');\n  if(!a) throw new Error('Akun Bank penerima wajib dipilih eksplisit (tidak ada akun bawaan)');\n  return a.id;\n}\nfunction commitMutasiBankRow(get, extra, res, rawRow, headerMap){", 'impMbAkun_', log);
L.rep(doc, "      queue.push({id:uid('impq'), type:res.status, importType:s.type, row, headerMap:s.headerMap,", "      queue.push({id:uid('impq'), type:res.status, importType:s.type, akunId:s.akunId||null, row, headerMap:s.headerMap,", 'antrean akunId', log);
L.rep(doc, "catch(e){ queue.push({id:uid('impq'), type:'HOLD', importType:s.type, row,", "catch(e){ queue.push({id:uid('impq'), type:'HOLD', importType:s.type, akunId:s.akunId||null, row,", 'antrean HOLD akunId', log);
L.rep(doc, "  const res = {siswaId, tanggal:normalizeDateValue(get('tanggal')),", "  if(q.importType==='mutasibank' && !q.akunId){ toast('Item mutasi bank lama tanpa akun Bank pilihan - impor ulang berkas dan pilih akun Bank secara eksplisit'); return; } // [P1-IMP B]\n  const res = {akunId:q.akunId, siswaId, tanggal:normalizeDateValue(get('tanggal')),", 'resolver ambigu akun', log);
L.rep(doc, "  const res = {siswaId:null, tanggal:normalizeDateValue(get('tanggal')), nominal};", "  if(q.importType==='mutasibank' && !q.akunId){ toast('Item mutasi bank lama tanpa akun Bank pilihan - impor ulang berkas dan pilih akun Bank secara eksplisit'); return; } // [P1-IMP B]\n  const res = {akunId:q.akunId, siswaId:null, tanggal:normalizeDateValue(get('tanggal')), nominal};", 'resolver baru akun', log);
L.save(doc);
fs.writeFileSync(OUT + '_akun_explicit_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_akun_explicit_client OK: ' + log.length + ' perubahan');
