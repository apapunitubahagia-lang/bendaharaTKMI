// Langkah build P0 (server). Dijalankan SETELAH build_server_engines.js (yang meregenerasi TransactionEngine.gs
// dan MasterDataRead.gs dari basis deps/). Mengubah berkas hasil generate dengan penggantian yang dipastikan unik.
// Urutan build lengkap: apply_central -> apply_tarif -> apply_p0_client -> build_server_engines -> apply_p0_server -> build_bridge
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];

// ======================= TransactionEngine.gs =======================
const te = L.load(OUT + 'TransactionEngine.gs');
L.rep(te, " * dipanggil dari testConcurrentWriteDoor(), tidak pernah dari luar.\n */",
  " * dipanggil dari testConcurrentWriteDoor(), tidak pernah dari luar.\n *\n * [P0 - 2026-10-17] Patch build apply_p0_server.js: baca/tulis berbasis NAMA header (SchemaGuard.gs),\n * SCHEMA_MISMATCH gagal tertutup, normalisasi tanggal, validasi patch per-field, invarian nominal >= alokasi,\n * status alokasi dihitung server, aktor di audit, fungsi engine/tes dijadikan privat (akhiran _).\n */", 'header P0', log);

// ---------- P0-A: baca/tulis berbasis nama header ----------
L.replFn(te, 'readAllRows_', `
function readAllRows_(sheetName, headers) {
  // [P0-A] berbasis NAMA header; kolom wajib hilang -> Error SCHEMA_MISMATCH (bukan data bergeser)
  var m = sgModel_(sheetName, headers);
  if (!m) return [];
  return m.values.map(function (r) { return sgObj_(m, r, headers); });
}`, log);
L.replFn(te, 'findRowIndexById_', `
function findRowIndexById_(sheetName, id) {
  // [P0-A] kolom kunci dicari berdasarkan nama ('id', atau PK khusus di SG_PK_)
  var pk = SG_PK_[sheetName] || 'id';
  var hm = sgHeaderModel_(sheetName, [pk]);
  if (!hm) return -1;
  var lastRow = hm.sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = hm.sh.getRange(2, hm.idx[pk] + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // 1-based sheet row number
  }
  return -1;
}`, log);
L.replFn(te, 'findIdempotentResult_', `
function findIdempotentResult_(clientRequestId) {
  if (!clientRequestId) return null;
  ensureIdempotencyLogSheet_();
  var m = sgModel_(SHT_IDEMPOTENCY, IDEMP_HEADERS); // [P0-A] berbasis nama
  for (var i = 0; i < m.values.length; i++) {
    var o = sgObj_(m, m.values[i], IDEMP_HEADERS);
    if (o.clientRequestId === clientRequestId) {
      return { rowIndex: i + 2, clientRequestId: o.clientRequestId, resultRefId: o.resultRefId, resultType: o.resultType, createdAt: o.createdAt };
    }
  }
  return null;
}`, log);
L.replFn(te, 'recordIdempotentResult_', `
function recordIdempotentResult_(clientRequestId, resultRefId, resultType) {
  if (!clientRequestId) return;
  ensureIdempotencyLogSheet_();
  sgAppend_(SHT_IDEMPOTENCY, IDEMP_HEADERS, { clientRequestId: clientRequestId, resultRefId: resultRefId, resultType: resultType, createdAt: new Date().toISOString() }); // [P0-A]
}`, log);
L.replFn(te, 'deleteIdempotencyByClientRequestId_', `
function deleteIdempotencyByClientRequestId_(clientRequestId) {
  if (!clientRequestId) return false;
  ensureIdempotencyLogSheet_();
  var rowIdx = findRowIndexById_(SHT_IDEMPOTENCY, clientRequestId); // [P0-A] kolom clientRequestId dicari berdasarkan nama
  if (rowIdx > 0) { ss_().getSheetByName(SHT_IDEMPOTENCY).deleteRow(rowIdx); return true; }
  return false;
}`, log);
L.replFn(te, 'writeTransactionRow_', `
function writeTransactionRow_(trx) {
  var o = {}; TRX_HEADERS.forEach(function (h) { o[h] = trx[h] !== undefined ? trx[h] : ''; });
  sgAppend_(SHT_TRANSAKSI, TRX_HEADERS, o); // [P0-A] kolom dipetakan berdasarkan nama header live
}`, log);
L.replFn(te, 'writeAllocationRow_', `
function writeAllocationRow_(alok) {
  var o = {}; ALOK_HEADERS.forEach(function (h) { o[h] = alok[h] !== undefined ? alok[h] : ''; });
  sgAppend_(SHT_ALOKASI, ALOK_HEADERS, o); // [P0-A]
}`, log);
L.replFn(te, 'writeMutasiRow_', `
function writeMutasiRow_(mut) {
  var o = {}; MUT_HEADERS.forEach(function (h) { o[h] = mut[h] !== undefined ? mut[h] : ''; });
  sgAppend_(SHT_MUTASI, MUT_HEADERS, o); // [P0-A]
}`, log);
L.replFn(te, 'activeAllocationRows_', `
function activeAllocationRows_() {
  // [P0-A] berbasis nama; alokasi berkolom archivedAt terisi tidak dihitung
  var m = sgModel_(SHT_ALOKASI, ALOK_HEADERS);
  if (!m) return [];
  var out = [];
  m.values.forEach(function (r) {
    var a = sgGet_(m, r, 'archivedAt');
    if (a !== undefined && a !== '' && a !== null) return;
    out.push(sgObj_(m, r, ALOK_HEADERS));
  });
  return out;
}`, log);
L.replFn(te, 'readTrxRows_', `
function readTrxRows_() {
  // [P0-A] berbasis nama header; [P0-B] tanggal sel Date dinormalisasi ke yyyy-MM-dd, createdAt ke ISO
  var m = sgModel_(SHT_TRANSAKSI, TRX_HEADERS);
  if (!m) return [];
  return m.values.map(function (r) {
    var o = sgObj_(m, r, TRX_HEADERS);
    o.tanggal = sgDateStr_(o.tanggal);
    o.createdAt = sgIsoStr_(o.createdAt);
    var a = sgGet_(m, r, 'archivedAt');
    if (a !== undefined && a !== '' && a !== null) {
      o.archivedAt = a;
      o.archivedBy = sgGet_(m, r, 'archivedBy') || '';
      o.archiveReason = sgGet_(m, r, 'archiveReason') || '';
    }
    return o;
  });
}`, log);
L.replFn(te, 'auditPush_', `
function auditPush_(aksi, before, after, sumber, refId) {
  // [P0-A] kolom audit dipetakan berdasarkan nama header; [P0-B] aktor terverifikasi (ENGINE_ACTOR_) dicatat di kolom sumber
  sgAppend_(SHT_AUDIT, AUDIT_HEADERS, {
    id: ID_PREFIX_AUDIT + Utilities.getUuid(),
    timestamp: new Date().toISOString(), // timestamp SELALU server-side, tidak pernah dari browser
    aksi: aksi,
    before: before ? JSON.stringify(before) : '',
    after: after ? JSON.stringify(after) : '',
    sumber: (typeof ENGINE_ACTOR_ !== 'undefined' && ENGINE_ACTOR_) ? 'google:' + ENGINE_ACTOR_ : (sumber || 'write-door'),
    refId: refId || ''
  });
}`, log);

// ---------- P0-A: kode galat SCHEMA_MISMATCH tidak disamarkan menjadi WRITE_FAILED ----------
{
  let n = 0;
  te.t = te.t.split('\n').map(function (line) {
    const m = /errResult_\('WRITE_FAILED', (.*) \+ (e2?)\.message/.exec(line);
    if (!m) return line;
    n++; return line.replace("errResult_('WRITE_FAILED', ", 'errResult_(engineErrCode_(' + m[2] + '), ');
  }).join('\n');
  if (n < 15) throw new Error('ASSERT engineErrCode_: hanya ' + n + ' baris');
  log.push('engineErrCode_ pada ' + n + ' jalur galat');
  L.rep(te, "function errResult_(code, message, field, refId) {", "/* [P0-A] SCHEMA_MISMATCH dibawa apa adanya; galat lain tetap WRITE_FAILED */\nfunction engineErrCode_(e) { return e && e.code === 'SCHEMA_MISMATCH' ? 'SCHEMA_MISMATCH' : 'WRITE_FAILED'; }\nfunction errResult_(code, message, field, refId) {", 'engineErrCode_ def', log);
}

// ======================= ObligationEngine.gs / FinanceEngine.gs / TarifPlan.gs =======================
const ob = L.load(OUT + 'ObligationEngine.gs');
L.rep(ob, "  var mk = function (sheet) { var m = opSheetModel_(sheet); return m ? m.rows.map(function (r) { return opJsonSafe_(opRowObj_(m.live, r)); }).filter(function (o) { return !o.archivedAt; }) : []; };",
  "  var mk = function (sheet) { return sgRowsChecked_(sheet).filter(function (o) { return !o.archivedAt; }); }; // [P0-A] kolom wajib divalidasi", 'oblLoadContext_ mk', log);
L.rep(ob, "    return errResult_('COMPUTE_FAILED', 'Gagal menghitung kewajiban', null);", "    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung kewajiban');", 'opObligations err', log);
L.rep(ob, "    return errResult_('COMPUTE_FAILED', 'Gagal membuat snapshot kewajiban', null);", "    return sgErr_(e, 'COMPUTE_FAILED', 'Gagal membuat snapshot kewajiban');", 'snapshot err', log);
L.save(ob);
const fe = L.load(OUT + 'FinanceEngine.gs');
L.rep(fe, "    var mk = function (sheet) { var m = opSheetModel_(sheet); return m ? m.rows.map(function (r) { return opJsonSafe_(opRowObj_(m.live, r)); }) : []; };",
  "    var mk = function (sheet) { return sgRowsChecked_(sheet); }; // [P0-A] kolom wajib divalidasi", 'FCC mk', log);
L.rep(fe, "  } catch (e) { return errResult_('COMPUTE_FAILED', 'Gagal menghitung kontrol keuangan', null); }", "  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menghitung kontrol keuangan'); }", 'FCC err', log);
L.save(fe);
const tp = L.load(OUT + 'TarifPlan.gs');
L.replFn(tp, 'tpReadSheet_', `
function tpReadSheet_(name) {
  return sgRowsChecked_(name).filter(function (o) { return !o.archivedAt; }); // [P0-A] kolom wajib divalidasi
}`, log);
L.rep(tp, "  } catch (e) { return errResult_('COMPUTE_FAILED', 'Gagal menyusun rencana tarif', null); }", "  } catch (e) { return sgErr_(e, 'COMPUTE_FAILED', 'Gagal menyusun rencana tarif'); }", 'tarif plan err', log);
L.save(tp);

// ======================= MasterDataRead.gs =======================
const md = L.load(OUT + 'MasterDataRead.gs');
L.replFn(md, 'readMasterRows_', `
function readMasterRows_(sheetName, headers) {
  // [P0-A] Kolom wajib dicari berdasarkan NAMA header live. Bila ada yang hilang -> Error SCHEMA_MISMATCH.
  // Fallback posisional lama DIHAPUS: data dengan kolom bergeser tidak pernah dikembalikan.
  var m = sgModel_(sheetName, headers);
  if (!m) return [];
  return m.values.map(function (r) {
    var o = sgObj_(m, r);
    return typeof opJsonSafe_ === 'function' ? opJsonSafe_(o) : o;
  });
}`, log);
// setiap get*: SCHEMA_MISMATCH dipetakan ke hasil terstruktur, bukan exception
['getStudents', 'getGuardians', 'getComponents', 'getTariffs', 'getAccounts', 'getIncomeCategories', 'getExpenseCategories', 'getSubcategories', 'getAcademicYears', 'getSettings'].forEach(function (fn) {
  const src = L.fnSrc(md, fn);
  const open = src.indexOf('{') + 1;
  const body = src.slice(open, src.lastIndexOf('}'));
  const authEnd = body.indexOf('if (!auth.authorized) return auth;');
  if (authEnd < 0) throw new Error('pola auth tidak ditemukan di ' + fn);
  const head = body.slice(0, authEnd + 'if (!auth.authorized) return auth;'.length), rest = body.slice(authEnd + 'if (!auth.authorized) return auth;'.length);
  L.replFn(md, fn, src.slice(0, open) + head + '\n  try { // [P0-A] SCHEMA_MISMATCH -> hasil terstruktur' + rest.replace(/\n/g, '\n  ') + '} catch (e) {\n    return sgErr_(e, \'READ_FAILED\', \'Gagal membaca data master\');\n  }\n}', log);
});
L.save(md);

L.save(te);
console.log('apply_p0_server OK: ' + log.length + ' perubahan');
require('fs').writeFileSync(OUT + '_p0_server_patch_log.txt', log.map((l, i) => (i + 1) + '. ' + l).join('\n'));
