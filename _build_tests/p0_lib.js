// Utilitas patch P0: penggantian teks/fungsi yang DIPASTIKAN unik (gagal keras bila jangkar tidak ditemukan tepat 1x).
const fs = require('fs');
function load(p) { const raw = fs.readFileSync(p, 'utf8'); return { p, crlf: raw.includes('\r\n'), t: raw.replace(/\r\n/g, '\n') }; }
function save(doc) { fs.writeFileSync(doc.p, doc.crlf ? doc.t.replace(/\n/g, '\r\n') : doc.t); }
function rep(doc, from, to, label, log) {
  const n = doc.t.split(from).length - 1;
  if (n !== 1) throw new Error('ASSERT [' + label + ']: jangkar ditemukan ' + n + 'x: ' + from.slice(0, 100));
  doc.t = doc.t.replace(from, () => to); if (log) log.push(label);
}
/* rentang fungsi top-level "function NAME(" sampai kurung tutup pasangannya (sadar string/komentar/regex sederhana) */
function fnRange(doc, name) {
  const re = new RegExp('^(?:async )?function ' + name.replace(/\$/g, '\\$') + '\\(', 'm'); const m = re.exec(doc.t);
  if (!m) throw new Error('fungsi tidak ditemukan: ' + name);
  const src = doc.t; let i = src.indexOf('{', src.indexOf(')', m.index)), depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j], nx = src[j + 1];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { j = src.indexOf('\n', j); continue; }
    if (ch === '/' && nx === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return { start: m.index, end: j + 1 }; }
  }
  throw new Error('kurung tidak seimbang: ' + name);
}
function replFn(doc, name, code, log) {
  const r = fnRange(doc, name);
  if (new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(doc.t.slice(r.end))) throw new Error('fungsi ganda: ' + name);
  doc.t = doc.t.slice(0, r.start) + code.trim() + doc.t.slice(r.end); if (log) log.push('replace fn ' + name);
}
function fnSrc(doc, name) { const r = fnRange(doc, name); return doc.t.slice(r.start, r.end); }
/* ganti nama identifier sebagai kata utuh (tidak menyentuh nama yang lebih panjang, mis. getTransactionRaw_) */
function renameIdent(doc, from, to, log) {
  const re = new RegExp('\\b' + from + '\\b(?![\\w$])', 'g'); const n = (doc.t.match(re) || []).length;
  if (!n) throw new Error('identifier tidak ditemukan: ' + from);
  doc.t = doc.t.replace(re, to); if (log) log.push('rename ' + from + ' -> ' + to + ' (' + n + 'x)');
}
module.exports = { load, save, rep, fnRange, replFn, fnSrc, renameIdent };
