// [P1_26] KpiEngine.gs DIHASILKAN dari Bendahara_V2.html (penutupan dependensi kpiIndukSummary, disalin VERBATIM) + _kpi_server.gs.tpl.
// Fungsi/konstanta yang sudah ada di server (ObligationEngine/FinanceEngine/...) TIDAK disalin ulang (sumbernya sama).
// Gagal keras bila ada ketergantungan klien yang tidak disalin, tidak ada di server, dan tidak di-shim.
const fs = require('fs');
const { OUT } = require('./paths');
const { SERVER_FILES } = require('./srv_env.js');
const html = fs.readFileSync(OUT + 'Bendahara_V2.html', 'utf8').replace(/\r/g, '');
const js = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m => m[1]).join('\n');
const tpl = fs.readFileSync(OUT + '_kpi_server.gs.tpl', 'utf8');
const ROOTS = ['kpiIndukSummary', 'ccFromRow_', 'ccSettingsLoad_', 'ccSettingsMap_', 'ccBlobGet_', 'ccParseSetting_', 'ccStr_', 'CC_', 'CC_BLOBS', 'SETTINGS_SYNC_KEYS', 'deepClone', 'DEFAULT_SETTINGS', 'KPI_SOURCE_KEYS_', 'OP_SHEETS', 'komponenById'];
const EXCLUDE = new Set(['komponen', 'rowLine', 'val']); // identifier lokal/properti yang kebetulan sama dengan nama top-level klien (bukan dependensi)
const skip = (src, j) => { const ch = src[j], nx = src[j + 1]; if (ch === '/' && nx === '/') return src.indexOf('\n', j); if (ch === '/' && nx === '*') return src.indexOf('*/', j) + 1; return -1; };
function scanEnd(start, isFn) {
  let i = isFn ? js.indexOf('{', js.indexOf(')', start)) : start, d = 0, q = null;
  for (let j = i; j < js.length; j++) {
    const ch = js[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    const k = skip(js, j); if (k !== -1) { j = k; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (isFn) { if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return j + 1; } }
    else { if ('{(['.includes(ch)) d++; else if ('})]'.includes(ch)) d--; else if (ch === ';' && d === 0) return j + 1; }
  }
  throw new Error('tidak seimbang @' + start);
}
const decl = Object.create(null); let m;
const reF = /^(?:async )?function ([A-Za-z0-9_$]+)\s*\(/gm;
const tryEnd = (st, f) => { try { return scanEnd(st, f); } catch (e) { return -1; } }; // deklarasi yang tidak dapat dipindai (mis. regex literal) hanya gagal bila DIBUTUHKAN
while ((m = reF.exec(js))) if (!decl[m[1]]) decl[m[1]] = { kind: 'fn', start: m.index, end: tryEnd(m.index, true) };
const reV = /^(const|let|var) ([A-Za-z0-9_$]+)\s*=/gm;
while ((m = reV.exec(js))) if (!decl[m[2]]) decl[m[2]] = { kind: m[1], start: m.index, end: tryEnd(m.index, false) };
Object.keys(decl).forEach(n => { decl[n].src = decl[n].end === -1 ? null : js.slice(decl[n].start, decl[n].end); });
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
const ids = s => new Set(strip(s).match(/\b[A-Za-z_$][\w$]*\b/g) || []);
const serverNames = new Set(); SERVER_FILES.filter(f => f !== 'KpiEngine.gs').forEach(f => { (fs.readFileSync(OUT + f, 'utf8').match(/^(?:function|var|const|let)\s+([A-Za-z0-9_$]+)/gm) || []).forEach(l => serverNames.add(l.split(/\s+/)[1])); });
const stubNames = new Set((tpl.match(/^(?:function|var)\s+([A-Za-z0-9_$]+)/gm) || []).map(l => l.split(/\s+/)[1]));
const seen = new Set(), q = ROOTS.slice(), take = [];
while (q.length) {
  const n = q.shift(); if (seen.has(n)) continue; seen.add(n);
  if (!decl[n]) throw new Error('akar/dep tidak ada di HTML: ' + n);
  if (serverNames.has(n) || stubNames.has(n) || EXCLUDE.has(n)) continue;
  if (decl[n].src === null) throw new Error('deklarasi dibutuhkan tetapi tidak dapat dipindai: ' + n);
  take.push(n);
  ids(decl[n].src).forEach(id => { if (decl[id] && !seen.has(id)) q.push(id); });
}
// ketergantungan tersembunyi: identifier top-level klien yang dirujuk tetapi tidak disalin / tidak di server / tidak di-shim
const hidden = [];
take.forEach(n => ids(decl[n].src).forEach(id => { if (decl[id] && take.indexOf(id) === -1 && !serverNames.has(id) && !stubNames.has(id) && !EXCLUDE.has(id)) hidden.push(n + ' -> ' + id); }));
if (hidden.length) throw new Error('ketergantungan tersembunyi: ' + hidden.join(', '));
const overlapTpl = take.filter(n => stubNames.has(n)); if (overlapTpl.length) throw new Error('nama ganda dengan shim: ' + overlapTpl);
take.sort((a, b) => decl[a].start - decl[b].start);
const BULAN = JSON.stringify(['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']);
const body = take.map(n => {
  let s = decl[n].src;
  if (n === 'BULAN_ID') return 'var BULAN_ID = ' + BULAN + '; // [build] = BULAN_ID_LIST() klien (literal: tanpa panggilan fungsi saat berkas dimuat)';
  if (decl[n].kind !== 'fn') s = s.replace(/^(const|let) /, 'var ');
  return s;
}).join('\n');
// [P1_26] privatisasi: fungsi publik (tanpa akhiran _) hasil salinan & stub shim diganti nama menjadi <nama>_ supaya TIDAK dapat dipanggil
// google.script.run (satu-satunya fungsi publik KpiEngine.gs = opKpiServer, bergerbang). Penggantian MEKANIS hanya pada deklarasi
// "function X(" dan panggilan "X(" (bukan akses properti ".X"); sisa rujukan polos ke nama lama -> build GAGAL.
let gen = body + '\n\n' + tpl;
const pubFns = take.filter(n => decl[n].kind === 'fn' && !n.endsWith('_')).concat([...stubNames].filter(n => !n.endsWith('_') && n !== 'opKpiServer' && /^function /m.test(tpl) && new RegExp('^function ' + n + '\\(', 'm').test(tpl)));
const allNames = new Set([...Object.keys(decl), ...serverNames, ...stubNames]);
const clash = pubFns.filter(n => allNames.has(n + '_')); if (clash.length) throw new Error('nama privat bentrok: ' + clash);
pubFns.forEach(n => { const e = n.replace(/\$/g, '\\$'); gen = gen.replace(new RegExp('(^|[^.\\w$])' + e + '(?=\\s*\\()', 'gm'), '$1' + n + '_').replace(new RegExp('([(,]\\s*)' + e + '(?=\\s*[),])', 'g'), '$1' + n + '_'); }); // panggilan + fungsi sebagai argumen (.map(f))
const sisa = []; pubFns.forEach(n => { const re = new RegExp('(^|[^.\\w$\'"])' + n.replace(/\$/g, '\\$') + '(?![\\w$:_])', 'gm'); const code = strip(gen); if (re.test(code)) sisa.push(n); });
if (sisa.length) throw new Error('rujukan polos ke fungsi yang diprivatkan (bukan panggilan): ' + sisa.join(', '));
const out = `/**
 * KpiEngine.gs  -  *** DIHASILKAN OTOMATIS (build_kpi_engine.js) dari Bendahara_V2.html + _kpi_server.gs.tpl - JANGAN DIEDIT TANGAN ***
 * [P1_26] PROTOTIPE SANDBOX: 31 KPI dihitung di server memakai fungsi klien yang DISALIN APA ADANYA (${take.length} deklarasi), sehingga
 * definisi, formula, bobot, target, dan ambang identik dengan klien. Fungsi bersama yang sudah ada di server (ObligationEngine,
 * FinanceEngine) dipakai bersama, tidak disalin ulang. Publik: opKpiServer(periode) (baca-saja, peran baca).
 * BELUM menggantikan hasil resmi aplikasi. BELUM dijalankan di Apps Script sungguhan.
 * Deklarasi yang disalin: ${take.join(', ')}
 * Diprivatkan (+ '_', tidak dapat dipanggil google.script.run): ${pubFns.length} fungsi
 */
${gen}`;
fs.writeFileSync(OUT + 'KpiEngine.gs', out);
console.log('build_kpi_engine: KpiEngine.gs (' + take.length + ' deklarasi disalin verbatim)');
