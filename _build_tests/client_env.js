// Salinan makeClient dari e2e_central2.js (baris 36-59) agar dapat dipakai suite P0 tanpa mengubah e2e_central2.js.
const fs = require('fs'), vm = require('vm');
const { OUT } = require('./srv_env.js');
const rd = f => fs.readFileSync(f, 'utf8');
const html = rd(OUT + 'Bendahara_V2.html').replace(/\r/g, '');
const js = html.match(/\n<script>\n([\s\S]*?)\n<\/script>/)[1];
const bridgeNames = [...rd(OUT + 'ServerBridge.js').matchAll(/^    ([A-Za-z]+): function/gm)].map(m => m[1]);
function makeClient(srv, opts) {
  opts = opts || {}; const store = opts.store || {}; const writes = []; const els = {}; const fields = {};
  const gen = id => ({ id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '', textContent: '', value: '', href: '', download: '', appendChild() {}, removeChild() {}, click() {} });
  const el = id => (els[id] = els[id] || gen(id));
  const dyn = new Set(['toast', 'modalOverlay', 'modalBody', 'content', 'pageSub', 'pageTitle', 'navlist', 'periodeBadge', 'authStatusBadge', 'pdSchemaOut', 'pdLegacyOut', 'pdOblOut', 'pdUsersOut', 'pdCutoverOut', 'fccVerifyOut', 'pdStatusOut']);
  const document = { getElementById(id) { if (id in fields) return { value: fields[id], files: [] }; if (dyn.has(id)) return el(id); return null; }, querySelector() { return null; }, addEventListener() {}, createElement: () => gen('x'), body: gen('body') };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { writes.push(k); store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const fault = { mode: null, only: null }; const calls = [];
  const rpc = (name, args) => Promise.resolve().then(() => {
    calls.push(name);
    const a = JSON.parse(JSON.stringify(args || []));
    if (fault.mode === 'down' && (!fault.only || fault.only.test(name))) return { ok: false, code: 'SERVER_ERROR', message: 'down' };
    if (fault.mode === 'lostOnce' && fault.only && fault.only.test(name)) { fault.mode = null; srv.sb[name](...a); return { ok: false, code: 'SERVER_ERROR', message: 'response lost' }; }
    if (fault.mode === 'readFail' && name === 'opReadSheet') return { ok: false, code: 'READ_FAILED' };
    const out = srv.sb[name](...a); return out === undefined ? out : JSON.parse(JSON.stringify(out));
  });
  const bridge = {}; bridgeNames.forEach(n => { bridge[n] = (...args) => rpc(n, args); });
  const sbx = { console: { log() {}, error() {}, warn() {} }, localStorage, document, Date, Math, JSON, Object, Array, Number, String, Boolean, Error, RegExp, Promise, Set, Map, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, addEventListener() {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} }, Blob: function () {}, TextEncoder };
  if (!opts.noBridge) sbx.ServerBridge = bridge;
  sbx.window = sbx; sbx.globalThis = sbx; vm.createContext(sbx);
  const probe = ['Store', 'MasterAPI', 'OperationalAPI', 'OperationalCache', 'CentralAuth', 'CentralMasterData', 'CentralSync', 'CENTRAL_CONFIG', 'State', 'CC_MEM'].map(n => `try{__a.${n}=${n};}catch(e){}`).join('\n');
  vm.runInContext((opts.js || js) + '\n;globalThis.__a={};\n' + probe, sbx);
  return { sb: sbx, a: sbx.__a, store, writes, fields, el, toast: () => el('toast').textContent, fault, calls };
}
module.exports = { makeClient, js, html, bridgeNames };
