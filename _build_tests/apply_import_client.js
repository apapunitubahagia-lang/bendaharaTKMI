// Langkah build P1-IMP (klien). Dijalankan SETELAH apply_t4b_f7_client.js. Paket terpisah agar mudah di-revert.
// - menyuntikkan ../_import_rules.js (sumber tunggal, juga ImportRules.gs server) dan ../_import_client.js (wizard Impor V2);
// - openImportWizard: pemasukan/pengeluaran/RAB/LPJ/siswa -> Impor V2 (validasi & simpan server). Mutasi bank & RKAT tetap wizard lama;
// - penyelesai antrean impor LAMA (localStorage) diblokir untuk kelima modul itu agar tidak ada jalur kedua dengan akun/kategori
//   bawaan diam-diam; fungsi wizard lama dipertahankan (tidak terjangkau dari UI untuk modul V2) agar mudah di-revert.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
const rules = fs.readFileSync(OUT + '_import_rules.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
const ui = fs.readFileSync(OUT + '_import_client.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
if (doc.t.indexOf('function impPlan_(') !== -1) throw new Error('_import_rules.js sudah disuntikkan');
L.rep(doc, `/* ---- 16h. Import Queue resolver (Ambiguous/Duplicate/Hold - Phase 17) ---- */`,
  rules + '\n' + ui + '\n\n/* ---- 16h. Import Queue resolver (Ambiguous/Duplicate/Hold - Phase 17) ---- */', 'inject _import_rules.js + _import_client.js', log);
L.rep(doc, `function openImportWizard(type){
`, `function openImportWizard(type){
  if(IMPORT_V2_MODUL_[type]) return openImportV2(IMPORT_V2_MODUL_[type]); // [P1-IMP] validasi & simpan oleh server
`, 'openImportWizard -> V2', log);
const guard = `  if(q && IMPORT_V2_MODUL_[q.importType]){ toast('Item antrean lama ' + q.importType + ' tidak dapat diimpor dari sini (jalur lama memakai akun/kategori bawaan). Impor ulang lewat Impor V2 dengan keputusan eksplisit.'); return; } // [P1-IMP]\n`;
L.rep(doc, `function resolveImportQueueAmbiguous(id){
  const q = Store.loadImportQueue().find(x=>x.id===id);
`, `function resolveImportQueueAmbiguous(id){
  const q = Store.loadImportQueue().find(x=>x.id===id);
` + guard, 'guard resolveImportQueueAmbiguous', log);
L.rep(doc, `function resolveImportQueueAsNew(id){
  const q = Store.loadImportQueue().find(x=>x.id===id);
`, `function resolveImportQueueAsNew(id){
  const q = Store.loadImportQueue().find(x=>x.id===id);
` + guard, 'guard resolveImportQueueAsNew', log);
L.save(doc);
fs.writeFileSync(OUT + '_import_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_import_client OK: ' + log.length + ' perubahan');
