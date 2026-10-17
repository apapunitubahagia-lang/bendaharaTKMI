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
    getSettings: function () { return callServer('getSettings', []); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
