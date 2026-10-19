/**
 * ServerBridge.js
 * FASE 3B-4 STEP 5 - adapter google.script.run untuk Google Account
 * Authorization + Central Master Data Read.
 *
 * Diadaptasi dari AUTH_CENTRAL_BUILD/ServerBridge_LOCAL.js (Step 4, sudah
 * lulus local test) - logika TIDAK diduplikasi/diubah, hanya direlokasi ke
 * sini supaya bisa di-<script src> langsung oleh Bendahara_V2.html, sama
 * seperti BridgeClient.js.
 *
 * TIDAK ADA createIncome/createExpense/createAllocation/createTransaction
 * di sini - MURNI identity + read API. Transaksi TETAP lewat
 * BridgeClient.js (tidak dihapus, tidak diubah).
 *
 * Pola guard typeof google==='undefined' SAMA seperti BridgeClient_LAB.js
 * (Compatibility Lab, sudah PASS live) - di luar Apps Script HTML Service,
 * setiap method resolve ke {ok:false, code:'NOT_IN_APPS_SCRIPT', ...},
 * TIDAK PERNAH melempar exception ke pemanggil.
 */
(function (global) {
  'use strict';

  function callServer(fnName, args) {
    return new Promise(function (resolve) {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        resolve({ ok: false, code: 'NOT_IN_APPS_SCRIPT', message: fnName + ' tidak bisa dipanggil - google.script.run tidak tersedia (bukan Apps Script HTML Service)' });
        return;
      }
      var runner = google.script.run
        .withSuccessHandler(function (result) { resolve(result); })
        .withFailureHandler(function (error) {
          resolve({ ok: false, code: 'SERVER_ERROR', message: String(error && error.message || error) });
        });
      runner[fnName].apply(runner, args || []);
    });
  }

  global.ServerBridge = {
    getCurrentUserIdentity: function () { return callServer('getCurrentUserIdentity', []); },
    getStudents: function () { return callServer('getStudents', []); },
    getGuardians: function () { return callServer('getGuardians', []); },
    getComponents: function () { return callServer('getComponents', []); },
    getTariffs: function () { return callServer('getTariffs', []); },
    getAccounts: function () { return callServer('getAccounts', []); },
    getIncomeCategories: function () { return callServer('getIncomeCategories', []); },
    getExpenseCategories: function () { return callServer('getExpenseCategories', []); },
    getSubcategories: function () { return callServer('getSubcategories', []); },
    getAcademicYears: function () { return callServer('getAcademicYears', []); },
    getSettings: function () { return callServer('getSettings', []); },
    // --- OperationalAPI / RecordEngine / AdminAPI / BuktiDrive / ObligationEngine / FinanceEngine (semua authorized di server) ---
    opSchemaReport: function () { return callServer('opSchemaReport', []); },
    opReadSheet: function (sheetName, opts) { return callServer('opReadSheet', [sheetName, opts || {}]); },
    opGetTransactions: function (filters) { return callServer('opGetTransactions', [filters || {}]); },
    opGetTransaction: function (id) { return callServer('opGetTransaction', [id]); },
    opGetStudentPosition: function (siswaId) { return callServer('opGetStudentPosition', [siswaId]); },
    opCreateIncome: function (payload) { return callServer('opCreateIncome', [payload]); },
    opCreateExpense: function (payload) { return callServer('opCreateExpense', [payload]); },
    opCreateAllocation: function (payload) { return callServer('opCreateAllocation', [payload]); },
    opUpdateTransaction: function (payload) { return callServer('opUpdateTransaction', [payload]); },
    opMasterUpsert: function (sheetKey, record, createId, expect) { return callServer('opMasterUpsert', [sheetKey, record, createId, expect]); },
    opRecordBatch: function (key, ops) { return callServer('opRecordBatch', [key, ops]); },
    opRecordUpsert: function (key, record) { return callServer('opRecordUpsert', [key, record]); },
    opArchiveTransaction: function (id, reason) { return callServer('opArchiveTransaction', [id, reason]); },
    opArchiveAllocation: function (id, reason) { return callServer('opArchiveAllocation', [id, reason]); },
    opCreateTxBatch: function (items) { return callServer('opCreateTxBatch', [items]); },
    opMasterBatch: function (sheetKey, records) { return callServer('opMasterBatch', [sheetKey, records]); },
    opSettingsUpsert: function (items) { return callServer('opSettingsUpsert', [items]); },
    opAuditAppend: function (entries) { return callServer('opAuditAppend', [entries]); },
    opUserList: function () { return callServer('opUserList', []); },
    opUserUpsert: function (record) { return callServer('opUserUpsert', [record]); },
    opSchemaPlan: function () { return callServer('opSchemaPlan', []); },
    opSchemaApply: function (confirm) { return callServer('opSchemaApply', [confirm]); },
    opUploadBukti: function (payload) { return callServer('opUploadBukti', [payload]); },
    opObligations: function (opts) { return callServer('opObligations', [opts || {}]); },
    opObligationSnapshot: function (periode, opts) { return callServer('opObligationSnapshot', [periode, opts || {}]); },
    opFinancialControl: function (periode) { return callServer('opFinancialControl', [periode]); },
    opTarifPlan: function () { return callServer('opTarifPlan', []); },
    opTarifApply: function (confirm) { return callServer('opTarifApply', [confirm]); },
    opPeriodLockStatus: function () { return callServer('opPeriodLockStatus', []); },
    opClosePeriod: function (periode) { return callServer('opClosePeriod', [periode]); },
    opReopenPeriod: function (periode, reason) { return callServer('opReopenPeriod', [periode, reason]); },
    opReconcileAccount: function (payload) { return callServer('opReconcileAccount', [payload]); },
    opMatchMutasi: function (payload) { return callServer('opMatchMutasi', [payload]); },
    opRabRealization: function (periode) { return callServer('opRabRealization', [periode]); },
    opAlokasiPengeluaranSetup: function (confirm) { return callServer('opAlokasiPengeluaranSetup', [confirm]); },
    opAlokasiPengeluaranPlan: function () { return callServer('opAlokasiPengeluaranPlan', []); },
    opAlokasiPengeluaranImport: function (payload) { return callServer('opAlokasiPengeluaranImport', [payload]); },
    opPeriodeAktifPlan: function () { return callServer('opPeriodeAktifPlan', []); },
    opPeriodeAktifApply: function (payload) { return callServer('opPeriodeAktifApply', [payload]); },
    opSiswaMasterAudit: function () { return callServer('opSiswaMasterAudit', []); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
