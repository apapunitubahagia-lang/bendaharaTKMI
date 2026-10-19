// Langkah build P1-IMP (server): ImportRules.gs DIHASILKAN dari ../_import_rules.js (sumber tunggal yang juga disuntikkan ke klien
// oleh apply_import_client.js). Jangan edit ImportRules.gs dengan tangan.
const fs = require('fs');
const { OUT } = require('./paths');
const src = fs.readFileSync(OUT + '_import_rules.js', 'utf8').replace(/\r\n/g, '\n').trimEnd();
const head = '/**\n * ImportRules.gs - DIHASILKAN oleh _build_tests/build_import_rules.js dari _import_rules.js. JANGAN DIEDIT TANGAN.\n * Aturan validasi impor massal bersama (server = otoritas; klien memakai salinan identik untuk UX).\n */\n';
fs.writeFileSync(OUT + 'ImportRules.gs', head + src + '\n');
console.log('build_import_rules: ImportRules.gs (' + src.split('\n').length + ' baris)');
