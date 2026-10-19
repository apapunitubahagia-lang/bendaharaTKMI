/* ============================================================
   [P1-IMP] IMPOR MASSAL V2 (klien) - pemasukan, pengeluaran, RAB, LPJ, siswa.
   Sumber: isi tabel langsung, tempel dari Excel (TSV), unggah CSV/TSV, unggah XLSX (pembaca di klien, D-IMP-1).
   Klien hanya menormalisasi bentuk tabel & memetakan kolom; SELURUH validasi, klasifikasi, duplikat, dan penyimpanan
   dilakukan server (opImportPlan / opImportCommit, ImportEngine.gs). Aturan bersama _import_rules.js dipakai klien
   hanya untuk tanda cepat di tabel isian (tanggal/angka), bukan sebagai keputusan.
   Tidak ada simpan lokal: tanpa server -> impor ditolak. Status impor & antrean tinjauan ada di server (D-IMP-3);
   localStorage hanya menyimpan profil pemetaan kolom (kenyamanan per perangkat).
   ============================================================ */
const IMPORT_V2_MODUL_ = {penerimaan:'pemasukan', pengeluaran:'pengeluaran', rab:'rab', lpj:'lpj', siswa:'siswa'};
const IMPV2_LABEL_ = {pemasukan:'Pemasukan', pengeluaran:'Pengeluaran', rab:'RAB', lpj:'LPJ', siswa:'Data Siswa'};
const IMPV2_FIELD_LABEL_ = {tanggal:'Tanggal', unit:'Unit', nominal:'Nominal', cash:'Cash/Tunai', transfer:'Transfer', akun:'Akun', metode:'Metode', sumber:'Sumber/Kategori Penerimaan',
  nis:'NIS', nisn:'NISN', namaSiswa:'Nama Siswa', nama:'Nama', kelas:'Kelas', komponen:'Komponen', periodeKomponen:'Periode Komponen', ftNumber:'FT Number', namaPengirim:'Nama Pengirim',
  uraian:'Uraian', kategori:'Kategori', subkategori:'Subkategori', penerima:'Penerima', qty:'Qty', hargaSatuan:'Harga Satuan', diskon:'Diskon', periode:'Periode', jenis:'Jenis',
  program:'Program/Uraian', volume:'Volume', satuan:'Satuan', status:'Status (sumber)', item:'Item', transaksiId:'ID Transaksi', lpjDokId:'ID Dokumen LPJ', tahunAjaran:'Tahun Ajaran',
  tanggalMasuk:'Tanggal Masuk', tanggalKeluar:'Tanggal Keluar', jenisKelamin:'Jenis Kelamin', namaWali:'Nama Wali', kontakWali:'Kontak Wali', alamat:'Alamat'};
const IMPV2_KELAS_CLS_ = {VALID:'green', PERINGATAN:'amber', PERLU_KEPUTUSAN:'amber', DUPLIKAT:'amber', TOLAK:'red', SUDAH_ADA:'blue'};
const IMPV2_CONTOH_ = 'CONTOH - baris ini dilewati';
const IMPV2_ALIAS_ = {
  pemasukan:{nominal:'nominal', jumlah:'nominal', total:'nominal', kredit:'nominal', tunai:'cash', tf:'transfer', 'transfer bank':'transfer', 'nama siswa':'namaSiswa', siswa:'namaSiswa', 'sumber destinasi':'akun', 'metode pembayaran':'metode', 'ft number':'ftNumber', 'no ft':'ftNumber', 'nama pengirim':'namaPengirim', pengirim:'namaPengirim', keterangan:'uraian', deskripsi:'uraian', kategori:'sumber'},
  pengeluaran:{jumlah:'nominal', total:'nominal', keterangan:'uraian', deskripsi:'uraian', item:'uraian', banyak:'qty', volume:'qty', 'harga satuan':'hargaSatuan', harga:'hargaSatuan', discount:'diskon', 'sub kategori':'subkategori', 'metode pembayaran':'metode'},
  rab:{uraian:'program', 'nama barang':'program', kegiatan:'program', item:'program', jumlah:'nominal', total:'nominal', anggaran:'nominal', banyak:'volume', qty:'volume', 'harga satuan':'hargaSatuan', harga:'hargaSatuan', 'sub kategori':'subkategori', 'tahun ajaran':'periode', bulan:'periode'},
  lpj:{uraian:'item', keterangan:'item', 'nama barang':'item', jumlah:'nominal', total:'nominal', banyak:'volume', qty:'volume', 'harga satuan':'hargaSatuan', harga:'hargaSatuan', discount:'diskon', 'sub kategori':'subkategori', 'id transaksi':'transaksiId', 'tanggal nota':'tanggal'},
  siswa:{'nama siswa':'nama', 'nama santri':'nama', 'tahun ajaran':'tahunAjaran', ta:'tahunAjaran', 'jenis kelamin':'jenisKelamin', jk:'jenisKelamin', gender:'jenisKelamin', 'tanggal masuk':'tanggalMasuk', 'tgl masuk':'tanggalMasuk', 'tanggal keluar':'tanggalKeluar', 'nama wali':'namaWali', wali:'namaWali', 'kontak wali':'kontakWali', 'no hp wali':'kontakWali', 'hp wali':'kontakWali', 'nis/nisn':'nisn'}
};
function impV2ServerReady_(){ return typeof ServerBridge !== 'undefined' && !!ServerBridge.opImportPlan && centralReady_(); }
/* Kolom berkas -> field kanonik modul ('' = tidak dipetakan). Kunci templat dikenali persis; nama komponen = kolom komponen (pemasukan). */
function impV2GuessField_(modul, header){
  const n = normalizeHeader(header), fields = IMP_FIELDS_[modul];
  const exact = fields.find(f=>f.toLowerCase() === n); if(exact) return exact;
  const lbl = fields.find(f=>normalizeHeader(IMPV2_FIELD_LABEL_[f]||'') === n); if(lbl) return lbl;
  const al = (IMPV2_ALIAS_[modul]||{})[n]; if(al) return al;
  if(modul === 'pemasukan'){ const k = (MasterAPI.components()||[]).find(c=>normalizeHeader(c.nama) === n); if(k) return 'komponen:' + k.id; }
  const legacy = guessFieldForHeader(header);
  return legacy && fields.indexOf(legacy) !== -1 ? legacy : '';
}
function impV2FieldOptions_(modul){
  const out = IMP_FIELDS_[modul].map(f=>({value:f, label:(IMPV2_FIELD_LABEL_[f]||f) + ' [' + f + ']'}));
  if(modul === 'pemasukan') (MasterAPI.components()||[]).forEach(k=>out.push({value:'komponen:' + k.id, label:'Nominal komponen: ' + k.nama}));
  return out;
}

/* ---- pembaca XLSX (D-IMP-1): unzip (stored / deflate-raw lewat DecompressionStream) + XML lembar pertama ---- */
function impV2U16_(b, o){ return b[o] | (b[o+1] << 8); }
function impV2U32_(b, o){ return (b[o] | (b[o+1] << 8) | (b[o+2] << 16) | (b[o+3] << 24)) >>> 0; }
function impV2Inflate_(bytes){
  if(typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Peramban tidak mendukung pembacaan XLSX (DecompressionStream). Simpan sebagai CSV.'));
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(bytes); w.close();
  const rd = ds.readable.getReader(), parts = [];
  const pump = ()=>rd.read().then(r=>{ if(r.done){ let n = 0; parts.forEach(p=>{ n += p.length; }); const out = new Uint8Array(n); let o = 0; parts.forEach(p=>{ out.set(p, o); o += p.length; }); return out; } parts.push(r.value); return pump(); });
  return pump();
}
function impV2Unzip_(buf){
  const b = new Uint8Array(buf); let eo = -1;
  for(let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--){ if(impV2U32_(b, i) === 0x06054b50){ eo = i; break; } }
  if(eo < 0) return Promise.reject(new Error('Berkas bukan XLSX/ZIP yang valid'));
  const n = impV2U16_(b, eo + 10); let p = impV2U32_(b, eo + 16); const jobs = {}, dec = new TextDecoder('utf-8');
  for(let k = 0; k < n; k++){
    if(impV2U32_(b, p) !== 0x02014b50) return Promise.reject(new Error('Direktori ZIP rusak'));
    const method = impV2U16_(b, p + 10), csize = impV2U32_(b, p + 20), nl = impV2U16_(b, p + 28), el = impV2U16_(b, p + 30), cl = impV2U16_(b, p + 32), lo = impV2U32_(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + impV2U16_(b, lo + 26) + impV2U16_(b, lo + 28), data = b.subarray(ds, ds + csize);
    if(/\.xml$|\.rels$/.test(name)) jobs[name] = method === 0 ? Promise.resolve(data) : method === 8 ? impV2Inflate_(data) : Promise.reject(new Error('Metode kompresi ZIP tidak didukung: ' + method));
    p += 46 + nl + el + cl;
  }
  const names = Object.keys(jobs);
  return Promise.all(names.map(x=>jobs[x])).then(arr=>{ const out = {}; names.forEach((x, i)=>{ out[x] = dec.decode(arr[i]); }); return out; });
}
function impV2XmlText_(s){ return String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d)=>String.fromCharCode(+d)).replace(/&amp;/g, '&'); }
function impV2ColIdx_(ref){ const m = /^([A-Z]+)/.exec(ref || ''); if(!m) return -1; let n = 0; for(const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
/* -> Promise<{sheetName, matrix:[[teks]]}>; nilai tanggal Excel tetap angka serial (dinormalisasi & DITAMPILKAN server). */
function impV2XlsxRead_(buf){
  return impV2Unzip_(buf).then(files=>{
    const wb = files['xl/workbook.xml'] || ''; const sh = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/.exec(wb);
    let target = 'xl/worksheets/sheet1.xml', sheetName = sh ? impV2XmlText_(sh[1]) : 'Sheet1';
    if(sh){ const rel = new RegExp('<Relationship\\b[^>]*Id="' + sh[2] + '"[^>]*Target="([^"]+)"').exec(files['xl/_rels/workbook.xml.rels'] || '') || new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + sh[2] + '"').exec(files['xl/_rels/workbook.xml.rels'] || ''); if(rel) target = 'xl/' + rel[1].replace(/^\/?xl\//, '').replace(/^\//, ''); }
    const xml = files[target]; if(!xml) throw new Error('Lembar kerja tidak ditemukan di XLSX');
    const ss = []; (files['xl/sharedStrings.xml'] || '').replace(/<si>([\s\S]*?)<\/si>/g, (m, inner)=>{ const ts = []; inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m2, t)=>{ ts.push(impV2XmlText_(t)); return m2; }); ss.push(ts.join('')); return m; });
    const matrix = [];
    xml.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g, (m, ra, inner)=>{
      const rn = /\br="(\d+)"/.exec(ra || ''); const ri = rn ? +rn[1] - 1 : matrix.length; const row = [];
      String(inner || '').replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m2, ca, body)=>{
        const ref = /\br="([A-Z]+\d+)"/.exec(ca), t = (/\bt="([^"]+)"/.exec(ca) || [])[1] || '', ci = ref ? impV2ColIdx_(ref[1]) : row.length;
        let v = ''; body = body || '';
        if(t === 's'){ const vv = /<v>([\s\S]*?)<\/v>/.exec(body); v = vv ? (ss[+vv[1]] || '') : ''; }
        else if(t === 'inlineStr'){ const ts = []; body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m3, x)=>{ ts.push(impV2XmlText_(x)); return m3; }); v = ts.join(''); }
        else { const vv = /<v>([\s\S]*?)<\/v>/.exec(body); v = vv ? impV2XmlText_(vv[1]) : ''; if(t === 'b') v = v === '1' ? 'TRUE' : 'FALSE'; }
        row[ci] = v; return m2;
      });
      for(let i = 0; i < row.length; i++) if(row[i] === undefined) row[i] = '';
      matrix[ri] = row; return m;
    });
    for(let i = 0; i < matrix.length; i++) if(!matrix[i]) matrix[i] = [];
    return {sheetName, matrix};
  });
}
/* Matriks -> {headers, rows}. Baris header = baris pertama (dari 10 teratas) yang memuat >= 2 kolom dikenali; baris contoh templat dilewati. */
function impV2TableFromMatrix_(modul, matrix){
  let hi = 0;
  for(let i = 0; i < Math.min(10, matrix.length); i++){ if((matrix[i] || []).filter(c=>String(c||'').trim() && impV2GuessField_(modul, c)).length >= 2){ hi = i; break; } }
  const raw = (matrix[hi] || []).map(c=>String(c == null ? '' : c).trim()); const headers = [];
  raw.forEach((h, i)=>{ let x = h || ('Kolom ' + (i + 1)); while(headers.indexOf(x) !== -1) x += '_'; headers.push(x); });
  const rows = [];
  matrix.slice(hi + 1).forEach((r, k)=>{
    r = r || []; if(!r.some(c=>String(c == null ? '' : c).trim() !== '')) return;
    if(r.some(c=>String(c) === IMPV2_CONTOH_)) return;
    const o = {_baris: hi + k + 2}; headers.forEach((h, i)=>{ o[h] = r[i] == null ? '' : String(r[i]); }); rows.push(o);
  });
  return {headers, rows};
}

/* ---- sesi & alur ---- */
function openImportV2(modul){
  if(!impV2ServerReady_()){ openModal('<h3>Impor ' + esc(IMPV2_LABEL_[modul]) + '</h3><div><span class="badge red">SERVER TIDAK TERHUBUNG</span></div><p class="small-muted">Impor massal divalidasi dan disimpan oleh server. Tanpa koneksi server tidak ada data yang diimpor (tidak ada simpan lokal).</p><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Tutup</button></div>'); return false; }
  State.impV2 = {modul, step:'sumber', sumber:null, headers:[], rows:[], peta:{}, keputusan:{}, kecuali:[], modeSiswa:'TAMBAH', plan:null, stale:false, hasil:[], pesan:''};
  impV2Render(); return true;
}
function impV2Render(){ openModal(impV2Html(), true); }
function impV2Html(){
  const s = State.impV2, lbl = IMPV2_LABEL_[s.modul];
  let h = '<h3>Impor ' + esc(lbl) + ' (validasi server)</h3>';
  if(s.pesan) h += '<div class="tile bad" style="margin:6px 0">' + esc(s.pesan) + '</div>';
  if(s.step === 'sumber') h += '<p class="small-muted">Pilih sumber data. Semua baris diperiksa server sebelum disimpan; Anda melihat pratinjau dan wajib mengonfirmasi. Tidak ada akun, kategori, metode, unit, atau periode bawaan yang diisi diam-diam.</p>'+
      '<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap">'+
      '<button class="btn" onclick="impV2StartGrid()">Isi Tabel Langsung</button>'+
      '<button class="btn" onclick="State.impV2.step=\'tempel\';impV2Render()">Tempel dari Excel</button>'+
      '<button class="btn" onclick="State.impV2.step=\'berkas\';impV2Render()">Unggah CSV / XLSX</button>'+
      '<button class="btn" onclick="impV2Template(\'xlsx\')">Unduh Templat XLSX</button><button class="btn" onclick="impV2Template(\'csv\')">Templat CSV</button>'+
      '<button class="btn" onclick="openImportReviewV2(\'' + s.modul + '\')">Antrean Tinjauan</button></div>'+
      '<div class="small-muted">Kolom templat: ' + IMP_FIELDS_[s.modul].map(f=>esc(f) + ((IMP_WAJIB_[s.modul]||[]).indexOf(f) !== -1 ? '*' : '')).join(', ') + ' (* wajib). Tanggal YYYY-MM-DD (DD/MM/YYYY diterima, hasil normalisasi ditampilkan).</div>'+
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Batal</button></div>';
  else if(s.step === 'grid') h += impV2GridHtml();
  else if(s.step === 'tempel') h += '<div class="field"><label>Tempel sel dari Excel/Google Sheets (baris pertama = judul kolom)</label><textarea id="impv2_paste" rows="10" style="width:100%;font-family:monospace"></textarea></div>'+
      '<div class="modal-actions"><button class="btn" onclick="State.impV2.step=\'sumber\';impV2Render()">Kembali</button><button class="btn primary" onclick="impV2FromPaste(val(\'impv2_paste\'))">Baca Tempelan</button></div>';
  else if(s.step === 'berkas') h += '<div class="field"><label>Berkas .csv / .tsv / .txt / .xlsx (lembar pertama)</label><input type="file" id="impv2_file" accept=".csv,.tsv,.txt,.xlsx"></div>'+
      '<div class="modal-actions"><button class="btn" onclick="State.impV2.step=\'sumber\';impV2Render()">Kembali</button><button class="btn primary" onclick="impV2ReadFile()">Baca Berkas</button></div>';
  else if(s.step === 'peta') h += impV2PetaHtml();
  else if(s.step === 'pratinjau') h += impV2PratinjauHtml();
  else if(s.step === 'proses') h += '<div class="section-title">Menyimpan</div><p>' + esc(s.progres || '') + '</p>' + (s.terputus ? '<p class="small-muted">Koneksi/respons server terputus. Melanjutkan aman: baris yang sudah tersimpan tidak disimpan ulang (kunci baris idempoten).</p><div class="modal-actions"><button class="btn primary" onclick="impV2RunChunks(' + s.terputus.mulai + ')">Lanjutkan</button><button class="btn" onclick="State.impV2.step=\'selesai\';impV2Render()">Lihat Laporan Sementara</button></div>' : '');
  else if(s.step === 'selesai') h += impV2LaporanHtml();
  return h;
}
function impV2SetTable_(headers, rows, sumber){
  const s = State.impV2; s.headers = headers; s.rows = rows; s.sumber = sumber; s.peta = {}; s.keputusan = {}; s.kecuali = []; s.plan = null; s.pesan = '';
  let prof = {}; try{ prof = JSON.parse(localStorage.getItem('impv2_peta_' + s.modul) || '{}') || {}; }catch(e){ prof = {}; }
  headers.forEach(h=>{ s.peta[h] = prof[h] !== undefined ? prof[h] : impV2GuessField_(s.modul, h); });
  if(!rows.length){ s.pesan = 'Tidak ada baris data yang terbaca'; s.step = 'sumber'; return false; }
  s.step = 'peta'; return true;
}
/* Teks CSV/TSV -> matriks. Delimiter dipilih dari baris yang paling banyak memuatnya (judul laporan di atas tabel tidak mengecoh). */
function impV2Matrix_(text){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const sample = lines.filter(l=>l.trim()).slice(0, 15); let best = ',', bestN = -1;
  [',', ';', '\t', '|'].forEach(d=>{ const n = Math.max.apply(null, sample.map(l=>l.split(d).length - 1).concat([0])); if(n > bestN){ bestN = n; best = d; } });
  while(lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map(l=>splitDelimitedLine(l, best));
}
function impV2FromPaste(text){
  const s = State.impV2; if(!String(text||'').trim()){ s.pesan = 'Tempelan kosong'; impV2Render(); return false; }
  const t = impV2TableFromMatrix_(s.modul, impV2Matrix_(text));
  impV2SetTable_(t.headers, t.rows, {nama:'tempel-' + new Date().toISOString().slice(0, 10), jenis:'paste'}); impV2Render(); return true;
}
function impV2FromCsvText(name, text){
  const s = State.impV2, t = impV2TableFromMatrix_(s.modul, impV2Matrix_(text));
  impV2SetTable_(t.headers, t.rows, {nama:name, jenis:'csv'}); impV2Render(); return true;
}
function impV2FromXlsxBuffer(name, buf){
  const s = State.impV2;
  return impV2XlsxRead_(buf).then(x=>{ const t = impV2TableFromMatrix_(s.modul, x.matrix); impV2SetTable_(t.headers, t.rows, {nama:name + ' [' + x.sheetName + ']', jenis:'xlsx'}); impV2Render(); return true; },
    e=>{ s.pesan = 'XLSX tidak dapat dibaca: ' + e.message + ' (alternatif: simpan sebagai CSV)'; impV2Render(); return false; });
}
function impV2ReadFile(){
  const inp = document.getElementById('impv2_file'), f = inp && inp.files && inp.files[0];
  if(!f){ toast('Pilih berkas terlebih dahulu'); return; }
  const rd = new FileReader();
  if(/\.xlsx$/i.test(f.name)){ rd.onload = ()=>impV2FromXlsxBuffer(f.name, rd.result); rd.readAsArrayBuffer(f); }
  else { rd.onload = ()=>impV2FromCsvText(f.name, rd.result); rd.readAsText(f); }
}
/* ---- isi tabel langsung ---- */
function impV2StartGrid(){ const s = State.impV2; s.step = 'grid'; s.grid = s.grid || Array.from({length:10}, ()=>({})); impV2Render(); }
function impV2GridHtml(){
  const s = State.impV2, F = IMP_FIELDS_[s.modul];
  const cell = (r, f, i)=>{ const v = s.grid[i][f] || ''; let bad = '';
    if(v && /^tanggal/.test(f) && impDate_(v).error) bad = ' style="background:#fee2e2" title="' + esc(impDate_(v).error) + '"';
    if(v && ['nominal','cash','transfer','qty','hargaSatuan','diskon','volume'].indexOf(f) !== -1 && impNum_(v).error) bad = ' style="background:#fee2e2" title="' + esc(impNum_(v).error) + '"';
    return '<td><input value="' + esc(v) + '"' + bad + ' onchange="State.impV2.grid[' + i + '][\'' + f + '\']=this.value"></td>'; };
  return '<div class="section-title">Isi Tabel (' + s.grid.length + ' baris; baris kosong diabaikan)</div><div class="tablewrap" style="max-height:45vh"><table><thead><tr><th>#</th>' + F.map(f=>'<th>' + esc(IMPV2_FIELD_LABEL_[f]||f) + ((IMP_WAJIB_[s.modul]||[]).indexOf(f) !== -1 ? '*' : '') + '</th>').join('') + '</tr></thead><tbody>'+
    s.grid.map((r, i)=>'<tr><td>' + (i + 1) + '</td>' + F.map(f=>cell(r, f, i)).join('') + '</tr>').join('') + '</tbody></table></div>'+
    '<p class="small-muted">Sel merah = format tanggal/angka tidak dikenali (pemeriksaan cepat klien; keputusan tetap di server).</p>'+
    '<div class="modal-actions"><button class="btn" onclick="State.impV2.step=\'sumber\';impV2Render()">Kembali</button><button class="btn" onclick="State.impV2.grid=State.impV2.grid.concat(Array.from({length:10},()=>({})));impV2Render()">+10 Baris</button><button class="btn primary" onclick="impV2FromGrid()">Lanjut</button></div>';
}
function impV2FromGrid(){
  const s = State.impV2, F = IMP_FIELDS_[s.modul];
  const rows = s.grid.map((r, i)=>{ const o = {_baris:i + 1}; F.forEach(f=>{ o[f] = r[f] || ''; }); return o; }).filter(o=>F.some(f=>String(o[f]).trim() !== ''));
  impV2SetTable_(F.slice(), rows, {nama:'isian-tabel-' + new Date().toISOString().slice(0, 10), jenis:'grid'}); impV2Render(); return rows.length;
}
/* ---- pemetaan kolom ---- */
function impV2PetaHtml(){
  const s = State.impV2, opts = impV2FieldOptions_(s.modul), dipakai = Object.values(s.peta).filter(Boolean);
  const dobel = dipakai.filter((f, i)=>dipakai.indexOf(f) !== i);
  const kurang = (IMP_WAJIB_[s.modul]||[]).filter(f=>dipakai.indexOf(f) === -1 && !(f === 'nominal' && (dipakai.indexOf('cash') !== -1 || dipakai.indexOf('transfer') !== -1 || (dipakai.indexOf('hargaSatuan') !== -1 && (dipakai.indexOf('qty') !== -1 || dipakai.indexOf('volume') !== -1)))));
  return '<div class="section-title">Pemetaan Kolom (' + s.rows.length + ' baris dari ' + esc(s.sumber.nama) + ')</div>'+
    '<div class="tablewrap" style="max-height:40vh"><table><thead><tr><th>Kolom Berkas</th><th>Contoh</th><th>Dipetakan ke</th></tr></thead><tbody>'+
    s.headers.map((h, i)=>'<tr><td>' + esc(h) + '</td><td>' + esc(String((s.rows[0]||{})[h]||'').slice(0, 30)) + '</td><td><select id="impv2_map_' + i + '" onchange="State.impV2.peta[State.impV2.headers[' + i + ']]=this.value;impV2Render()"><option value="">- tidak diimpor -</option>'+
      opts.map(o=>'<option value="' + esc(o.value) + '"' + (s.peta[h] === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select></td></tr>').join('') + '</tbody></table></div>'+
    (dobel.length ? '<div class="tile bad">Satu field dipetakan dari lebih dari satu kolom: ' + esc(dobel.join(', ')) + '</div>' : '')+
    (kurang.length ? '<div class="tile bad">Kolom wajib belum dipetakan: ' + esc(kurang.join(', ')) + '</div>' : '')+
    '<p class="small-muted">Kolom yang tidak dipetakan tidak dikirim ke server. Pemetaan diingat per modul di perangkat ini.</p>'+
    (s.modul === 'siswa' ? fieldSelect('impv2_mode', 'Mode siswa yang sudah terdaftar', [{value:'TAMBAH', label:'Tambah saja (yang sudah ada dilewati)'}, {value:'TAMBAH_PERBARUI', label:'Tambah + perbarui (field kosong tidak menimpa)'}], s.modeSiswa) : '')+
    '<div class="modal-actions"><button class="btn" onclick="State.impV2.step=\'sumber\';impV2Render()">Kembali</button><button class="btn primary" ' + (dobel.length || kurang.length ? 'disabled' : '') + ' onclick="impV2Plan()">Pratinjau (server)</button></div>';
}
function impV2Baris_(){
  const s = State.impV2;
  return s.rows.map((r, i)=>{ const o = {_baris:r._baris || i + 1}; s.headers.forEach(h=>{ const f = s.peta[h]; if(f) o[f] = r[h] == null ? '' : String(r[h]); }); return o; });
}
/* pilih = semua baris kecuali yang dikeluarkan pengguna (server tetap hanya mengimpor kelas VALID/PERINGATAN). */
function impV2Payload_(){ const s = State.impV2, b = impV2Baris_(); return {modul:s.modul, baris:b, sumber:s.sumber, keputusan:s.keputusan, pilih:s.kecuali.length ? b.map((x, i)=>i).filter(i=>s.kecuali.indexOf(i) === -1) : null, modeSiswa:s.modeSiswa}; }
function impV2Plan(){
  const s = State.impV2; const m = document.getElementById('impv2_mode'); if(m && m.value) s.modeSiswa = m.value;
  try{ const prof = {}; s.headers.forEach(h=>{ prof[h] = s.peta[h] || ''; }); localStorage.setItem('impv2_peta_' + s.modul, JSON.stringify(prof)); }catch(e){ /* profil opsional */ }
  s.progres = 'Memeriksa di server...';
  return ServerBridge.opImportPlan(impV2Payload_()).then(res=>{
    if(!res || !res.ok){ s.pesan = 'Pratinjau gagal: ' + ((res && (res.code + ' - ' + res.message)) || 'tidak ada respons'); s.step = s.step === 'pratinjau' ? 'pratinjau' : 'peta'; impV2Render(); return false; }
    s.plan = res.data; s.stale = false; s.pesan = ''; s.step = 'pratinjau';
    impV2Render(); return true;
  });
}
function impV2SetKeputusan(i, field, value){
  const s = State.impV2; s.keputusan[i] = s.keputusan[i] || {};
  if(value === '' || value === null){ delete s.keputusan[i][field]; } else s.keputusan[i][field] = value === 'true' ? true : value;
  s.stale = true; impV2Render();
}
/* Menerapkan pilihan yang SAMA ke semua baris yang memerlukan keputusan field itu - tindakan eksplisit pengguna. */
function impV2SetKeputusanSemua(field, value){
  const s = State.impV2; if(!s.plan) return 0; let n = 0;
  s.plan.rows.forEach(r=>{ if(r.keputusanPerlu.some(k=>k.field === field)){ s.keputusan[r.i] = s.keputusan[r.i] || {}; s.keputusan[r.i][field] = value === 'true' ? true : value; n++; } });
  s.stale = true; impV2Render(); return n;
}
function impV2TogglePilih(i, on){ const s = State.impV2; s.kecuali = s.kecuali.filter(x=>x !== i); if(!on) s.kecuali.push(i); s.stale = true; impV2Render(); }
function impV2KeputusanInput_(r, k){
  const cur = ((State.impV2.keputusan[r.i] || {})[k.field]); const id = 'impk_' + r.i + '_' + k.field;
  const on = 'impV2SetKeputusan(' + r.i + ',\'' + k.field + '\',this.value)';
  if(k.opsi) return '<div class="small-muted">' + esc(k.label) + '</div><select id="' + id + '" onchange="' + on + '"><option value="">- pilih -</option>' + k.opsi.map(o=>'<option value="' + esc(String(o.value)) + '"' + (String(cur) === String(o.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
  return '<div class="small-muted">' + esc(k.label) + '</div><input id="' + id + '" value="' + esc(cur === undefined ? '' : cur) + '" placeholder="' + esc(k.saran || '') + '" onchange="' + on + '">' + (k.saran ? ' <a class="link" onclick="impV2SetKeputusan(' + r.i + ',\'' + k.field + '\',\'' + esc(k.saran).replace(/'/g, "\\'") + '\')">pakai saran: ' + esc(k.saran) + '</a>' : '');
}
function impV2PratinjauHtml(){
  const s = State.impV2, p = s.plan, rg = p.ringkasan;
  const butuh = {}; p.rows.forEach(r=>r.keputusanPerlu.forEach(k=>{ butuh[k.field] = butuh[k.field] || {n:0, k}; butuh[k.field].n++; }));
  const nPilih = p.rows.filter(r=>r.dipilih).length;
  let h = '<div class="section-title">Pratinjau Server</div><div class="tiles">' + tile('Total', rg.total, '') + ['VALID','PERINGATAN','PERLU_KEPUTUSAN','DUPLIKAT','TOLAK','SUDAH_ADA'].filter(k=>rg[k]).map(k=>tile(k.replace('_', ' '), rg[k], {VALID:'good', TOLAK:'bad'}[k] || 'warn')).join('')+
    tile('Akan diimpor', nPilih, 'good') + tile('Sudah tersimpan (batch ini)', rg.sudahTersimpan || 0, '') + '</div>'+
    '<div class="kv"><div>Total nominal sumber</div><div>' + fmtRp(p.total.nominalSumber) + '</div><div>Total nominal dipilih</div><div>' + fmtRp(p.total.nominalDipilih) + '</div><div>Batch</div><div>' + esc(p.batchId) + '</div></div>';
  const lb = p.rows.filter(r=>r.lebihBayar);
  if(lb.length) h += '<div class="tile warn"><b>KELEBIHAN PEMBAYARAN</b> pada ' + lb.length + ' baris: pembayaran ' + fmtRp(lb.reduce((t, r)=>t + r.lebihBayar.nominalPembayaran, 0)) + ', kewajiban terpenuhi ' + fmtRp(lb.reduce((t, r)=>t + r.lebihBayar.kewajibanTerpenuhi, 0)) + ', kelebihan ' + fmtRp(lb.reduce((t, r)=>t + r.lebihBayar.kelebihanPembayaran, 0)) + '. Nominal transaksi tetap = pembayaran; kelebihan tidak dialokasikan ke periode berikutnya.</div>'; // [Keputusan 1]
  if(Object.keys(p.kolomTidakTersedia || {}).length) h += '<div class="tile warn">Kolom belum ada di sheet (nilai disimpan di sourceRow, bukan kolom): ' + esc(Object.keys(p.kolomTidakTersedia).join(', ')) + '</div>';
  if(!p.logSiap) h += '<div class="tile bad">Sheet log impor (31/32/33) belum dibuat di server. Penyimpanan ditolak sampai administrator menjalankan opImportSetup di salinan uji.</div>';
  const fb = Object.keys(butuh).filter(f=>butuh[f].k.opsi);
  if(fb.length) h += '<div class="section-title">Terapkan pilihan ke semua baris yang memerlukannya (eksplisit)</div>' + fb.map(f=>'<div class="field"><label>' + esc(IMPV2_FIELD_LABEL_[f] || f) + ' (' + butuh[f].n + ' baris)</label><select id="impall_' + f + '" onchange="if(this.value)impV2SetKeputusanSemua(\'' + f + '\',this.value)"><option value="">- pilih untuk semua -</option>' + butuh[f].k.opsi.filter(o=>o.value !== '-' && o.value !== '__baru__').map(o=>'<option value="' + esc(String(o.value)) + '">' + esc(o.label) + '</option>').join('') + '</select></div>').join('');
  h += '<div class="tablewrap" style="max-height:38vh"><table><thead><tr><th>Impor</th><th>Baris</th><th>Kelas</th><th>Nilai (ternormalisasi)</th><th>Catatan</th><th>Keputusan</th></tr></thead><tbody>'+
    p.rows.map(r=>{
      const bisa = r.kelas === 'VALID' || r.kelas === 'PERINGATAN';
      const cek = bisa ? '<input type="checkbox" id="impp_' + r.i + '"' + (r.dipilih ? ' checked' : '') + ' onchange="impV2TogglePilih(' + r.i + ',this.checked)">' : '-';
      const nilai = Object.keys(r.nilai || {}).filter(k=>r.nilai[k] !== '' && r.nilai[k] !== null).map(k=>esc(k) + ': ' + esc(r.nilai[k])).join('<br>');
      const cat = r.pesan.concat(r.peringatan).map(esc).join('<br>') + (r.normalisasi.length ? '<br><span class="small-muted">normalisasi: ' + r.normalisasi.map(n=>esc(n.field + ' "' + n.dari + '" -> "' + n.ke + '"')).join('; ') + '</span>' : '') + (r.kandidat && r.kandidat.length ? '<br><span class="small-muted">kandidat (saran, tidak ditautkan): ' + r.kandidat.map(c=>esc(c.id + ' ' + (c.tanggal||'') + ' ' + fmtRp(c.nominal) + (c.alasan ? ' [' + c.alasan + ']' : ''))).join('; ') + '</span>' : '') + (r.sudahTersimpan ? '<br><b>sudah tersimpan</b>' : '');
      const kep = r.keputusanPerlu.map(k=>impV2KeputusanInput_(r, k)).join('') + (r.kelas === 'DUPLIKAT' ? '<label class="small-muted"><input type="checkbox" id="impk_' + r.i + '_terimaDuplikat"' + ((s.keputusan[r.i]||{}).terimaDuplikat ? ' checked' : '') + ' onchange="impV2SetKeputusan(' + r.i + ',\'terimaDuplikat\',this.checked?\'true\':\'\')"> Bukan duplikat - impor juga</label>' : '');
      return '<tr><td>' + cek + '</td><td>' + r.baris + '</td><td><span class="badge ' + (IMPV2_KELAS_CLS_[r.kelas]||'gray') + '">' + esc(r.kelas) + '</span></td><td>' + nilai + '</td><td>' + (cat || '-') + '</td><td>' + (kep || '-') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  h += (s.stale ? '<div class="tile warn">Keputusan/pilihan berubah - klik "Perbarui Pratinjau" sebelum konfirmasi.</div>' : '')+
    '<label><input type="checkbox" id="impv2_ok"> Saya sudah memeriksa pratinjau; impor ' + nPilih + ' baris (' + fmtRp(p.total.nominalDipilih) + ') ke server.</label>'+
    '<div class="modal-actions"><button class="btn" onclick="State.impV2.step=\'peta\';impV2Render()">Kembali</button><button class="btn" onclick="impV2DownloadMasalah()">Unduh Baris Bermasalah</button><button class="btn" onclick="impV2Plan()">Perbarui Pratinjau</button>'+
    '<button class="btn primary" ' + (s.stale || !nPilih || !p.logSiap ? 'disabled' : '') + ' onclick="impV2Confirm()">Konfirmasi &amp; Impor</button></div>';
  return h;
}
function impV2Confirm(){
  const s = State.impV2, ok = document.getElementById('impv2_ok');
  if(!ok || !ok.checked){ toast('Centang konfirmasi setelah memeriksa pratinjau'); return Promise.resolve(false); }
  if(s.stale){ toast('Perbarui pratinjau dulu'); return Promise.resolve(false); }
  if(!s.plan.rows.some(r=>r.dipilih)){ toast('Tidak ada baris yang dipilih untuk diimpor'); return Promise.resolve(false); }
  s.hasil = []; s.step = 'proses'; s.terputus = null;
  return impV2RunChunks(0);
}
/* Potongan berurutan; respons hilang/galat jaringan -> berhenti, "Lanjutkan" mengirim ulang potongan yang sama (idempoten). */
function impV2RunChunks(mulai){
  const s = State.impV2, total = s.plan.rows.filter(r=>r.dipilih).length;
  s.progres = 'Menyimpan baris ' + (mulai + 1) + ' dari ' + total + '...'; s.terputus = null; impV2Render();
  return ServerBridge.opImportCommit(Object.assign(impV2Payload_(), {planHash:s.plan.planHash, konfirmasi:'IMPOR_DATA', mulai})).then(res=>{
    if(!res || !res.ok){
      if(res && res.code === 'CONFLICT'){ s.pesan = 'Data server berubah sejak pratinjau (CONFLICT). Baris yang sudah tersimpan aman; jalankan pratinjau ulang lalu konfirmasi lagi.'; s.step = 'pratinjau'; s.stale = true; impV2Render(); return false; }
      if(res && ['VALIDATION_ERROR', 'CONFIRM_REQUIRED', 'ROLE_NOT_ALLOWED', 'SCHEMA_ADDITIVE_REQUIRED', 'SCHEMA_MISMATCH', 'AUDIT_FAILED'].indexOf(res.code) !== -1){ s.pesan = 'Impor dihentikan: ' + res.code + ' - ' + res.message; s.step = 'selesai'; impV2Render(); return false; }
      s.terputus = {mulai}; s.progres = 'Terputus pada baris ' + (mulai + 1) + ' (' + ((res && res.code) || 'tanpa respons') + ')'; impV2Render(); return false;
    }
    const sudah = new Set(s.hasil.map(h=>h.kunci)); res.data.hasil.forEach(h=>{ if(sudah.has(h.kunci)) s.hasil = s.hasil.filter(x=>x.kunci !== h.kunci); s.hasil.push(h); });
    s.job = res.data.job; s.logStatus = res.data.logStatus;
    if(res.data.berikut !== null && res.data.berikut !== undefined) return impV2RunChunks(res.data.berikut);
    s.step = 'selesai'; impV2AfterImport_(); impV2Render(); return true;
  }, ()=>{ s.terputus = {mulai}; s.progres = 'Terputus pada baris ' + (mulai + 1); impV2Render(); return false; });
}
function impV2AfterImport_(){
  const m = State.impV2.modul;
  try{
    invalidateAktFeedCache();
    const keys = {pemasukan:['transaksi', 'alokasi'], pengeluaran:['transaksi'], rab:['anggaran'], lpj:['lpj']}[m];
    if(keys && typeof loadOperationalData === 'function') loadOperationalData(keys);
    if(m === 'siswa' && typeof loadCentralMasterData === 'function') loadCentralMasterData({skipOperational:true});
  }catch(e){ console.error('muat ulang setelah impor gagal (non-fatal):', e); }
}
function impV2LaporanHtml(){
  const s = State.impV2, p = s.plan || {rows:[], total:{}}, H = s.hasil || [];
  const c = k=>H.filter(h=>h.status === k).length, nom = k=>H.filter(h=>h.status === k).reduce((t, h)=>t + (Number(h.nominal)||0), 0);
  const tidakDipilih = p.rows.filter(r=>!r.dipilih).length;
  return '<div class="section-title">Laporan Impor ' + esc(IMPV2_LABEL_[s.modul]) + '</div><div class="tiles">' + tile('Tersimpan', c('TERSIMPAN'), 'good') + tile('Tidak berubah (sudah ada)', c('TIDAK_BERUBAH'), '') + tile('Gagal', c('GAGAL'), c('GAGAL') ? 'bad' : 'good') + tile('Tidak diimpor (pratinjau)', tidakDipilih, tidakDipilih ? 'warn' : 'good') + '</div>'+
    '<div class="kv"><div>Nominal sumber (semua baris)</div><div>' + fmtRp(p.total.nominalSumber) + '</div><div>Nominal dipilih</div><div>' + fmtRp(p.total.nominalDipilih) + '</div><div>Nominal tersimpan (baru)</div><div>' + fmtRp(nom('TERSIMPAN')) + '</div><div>Nominal sudah ada sebelumnya</div><div>' + fmtRp(nom('TIDAK_BERUBAH')) + '</div>'+
    '<div>Status batch (server)</div><div>' + esc(s.job ? s.job.status : '-') + '</div><div>Log impor</div><div>' + esc(s.logStatus || '-') + '</div></div>'+
    '<div class="tablewrap" style="max-height:30vh"><table><thead><tr><th>Baris</th><th>Status</th><th>Kode</th><th>Pesan</th><th>Ref</th></tr></thead><tbody>' + H.map(h=>'<tr><td>' + h.baris + '</td><td><span class="badge ' + ({TERSIMPAN:'green', TIDAK_BERUBAH:'blue', GAGAL:'red'}[h.status]||'gray') + '">' + esc(h.status) + '</span></td><td>' + esc(h.kode) + '</td><td>' + esc(h.pesan) + '</td><td>' + esc(h.refId) + '</td></tr>').join('') + '</tbody></table></div>'+
    '<div class="modal-actions"><button class="btn" onclick="impV2DownloadMasalah()">Unduh Baris Gagal / Tidak Diimpor</button><button class="btn" onclick="openImportReviewV2(\'' + s.modul + '\')">Antrean Tinjauan</button><button class="btn primary" onclick="closeModal();renderContent()">Tutup</button></div>';
}
/* Baris bermasalah: kolom berkas asli + kelas/status + kode + alasan; dapat diperbaiki lalu diimpor ulang. */
function impV2MasalahRows_(){
  const s = State.impV2, p = s.plan; if(!p) return {headers:[], rows:[]};
  const byI = {}; (s.hasil || []).forEach(h=>{ byI[h.i] = h; });
  const headers = s.headers.concat(['kelas', 'kode', 'alasan']), rows = [];
  p.rows.forEach(r=>{
    const h = byI[r.i];
    if(!(h ? h.status === 'GAGAL' : (!r.dipilih && r.kelas !== 'SUDAH_ADA'))) return;
    const src = s.rows[r.i] || {};
    rows.push(s.headers.map(x=>src[x] == null ? '' : String(src[x])).concat([h ? 'GAGAL' : r.kelas, h ? h.kode : r.kode.join(','), h ? h.pesan : r.pesan.concat(r.peringatan, r.keputusanPerlu.map(k=>k.label)).join('; ')]));
  });
  return {headers, rows};
}
function impV2DownloadMasalah(){
  const t = impV2MasalahRows_(), s = State.impV2;
  if(!t.rows.length){ toast('Tidak ada baris bermasalah'); return t; }
  triggerBinaryDownload('impor_' + s.modul + '_bermasalah.xlsx', buildXlsxWorkbook('Baris bermasalah impor ' + IMPV2_LABEL_[s.modul], [], t.headers, t.rows, []), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return t;
}
function impV2Template(fmt){
  const s = State.impV2, F = IMP_FIELDS_[s.modul].concat(['catatanTemplat']);
  const contoh = {pemasukan:{tanggal:'2026-10-01', unit:'MI', nominal:'200000', akun:'(nama akun Kas/Bank)', metode:'Transfer Bank', sumber:'Pembayaran Siswa', nisn:'(NISN)', namaSiswa:'(nama)', kelas:'(kelas)', komponen:'SPP'},
    pengeluaran:{tanggal:'2026-10-01', unit:'MI', nominal:'75000', akun:'(nama akun)', metode:'Tunai', kategori:'(kategori master)', penerima:'(penerima)', uraian:'(uraian)'},
    rab:{periode:'Oktober 2026', unit:'MI', kategori:'(kategori master)', program:'(uraian)', nominal:'500000', volume:'10', satuan:'rim', hargaSatuan:'50000'},
    lpj:{tanggal:'2026-10-05', unit:'MI', kategori:'(kategori)', item:'(item nota)', volume:'1', satuan:'buah', hargaSatuan:'1000', nominal:'1000', transaksiId:'(opsional)'},
    siswa:{nama:'(nama)', unit:'MI', kelas:'(kelas)', nisn:'(NISN)', tahunAjaran:'2026/2027', tanggalMasuk:'2026-07-15', jenisKelamin:'(sesuai data)'}}[s.modul];
  const row = F.map(f=>f === 'catatanTemplat' ? IMPV2_CONTOH_ : (contoh[f] || ''));
  if(fmt === 'csv'){ downloadCSV('templat_impor_' + s.modul + '.csv', F, [row]); return F; }
  triggerBinaryDownload('templat_impor_' + s.modul + '.xlsx', buildXlsxWorkbook('Templat impor ' + IMPV2_LABEL_[s.modul], [], F, [row], []), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return F;
}
/* ---- antrean tinjauan server ---- */
function openImportReviewV2(modul){
  if(!impV2ServerReady_()){ toast('Server tidak terhubung'); return Promise.resolve(false); }
  return ServerBridge.opImportReviewList({modul}).then(res=>{
    if(!res || !res.ok){ toast('Antrean tinjauan tidak dapat dibaca: ' + ((res && res.message) || 'galat')); return false; }
    const it = res.data.items;
    openModal('<h3>Antrean Tinjauan Impor ' + esc(IMPV2_LABEL_[modul]||modul) + ' (server)</h3>' + (it.length ? '<div class="tablewrap" style="max-height:50vh"><table><thead><tr><th>Jenis</th><th>Batch / Baris</th><th>Alasan</th><th>Aksi</th></tr></thead><tbody>'+
      it.map(x=>'<tr><td><span class="badge amber">' + esc(x.jenis) + '</span></td><td>' + esc(x.batchId) + ' / ' + esc(x.barisSumber) + '</td><td>' + esc(x.alasan) + '</td><td><button class="btn sm" onclick="impV2ResolveReview(\'' + esc(x.id) + '\',\'DIABAIKAN\',\'' + modul + '\')">Abaikan</button> <button class="btn sm" onclick="impV2ResolveReview(\'' + esc(x.id) + '\',\'DISELESAIKAN_MANUAL\',\'' + modul + '\')">Selesai (manual)</button></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">Tidak ada item terbuka</div>')+
      '<p class="small-muted">Menandai selesai TIDAK mengimpor data. Untuk mengimpor baris yang diperbaiki, impor ulang berkas dengan keputusan eksplisit. LPJ tanpa tautan tetap menunggu keputusan tautan/uang muka (D-LPJ, D-T1).</p><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Tutup</button></div>', true);
    return true;
  });
}
function impV2ResolveReview(id, keputusan, modul){
  return ServerBridge.opImportReviewResolve({id, keputusan}).then(res=>{ toast(res && res.ok ? 'Item tinjauan diselesaikan' : 'Gagal: ' + ((res && res.message) || 'galat')); return openImportReviewV2(modul); });
}
