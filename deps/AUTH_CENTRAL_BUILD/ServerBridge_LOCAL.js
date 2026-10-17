/**
 * ServerBridge_LOCAL.js
 * FASE 3B-4 PROMPT 1 - LOCAL BUILD (Fase D: google.script.run adapter).
 *
 * Adapter client-side untuk memanggil AuthCentral.gs/MasterDataRead.gs
 * lewat google.script.run SETELAH nanti benar-benar di-deploy sebagai Apps
 * Script HTML Service - deployment itu BELUM terjadi.
 *
 * TIDAK di-<script src> ke Bendahara_V2.html (belum wired ke frontend).
 * TIDAK terhubung ke production Code.gs/BridgeClient.js apa pun.
 * TIDAK ADA createIncome/createExpense/createAllocation/createTransaction
 * di sini - MURNI identity + read API, sesuai instruksi Fase D & E.
 *
 * Pola guard typeof google==='undefined' SAMA seperti BridgeClient_LAB.js
 * (Compatibility Lab, Step 2, sudah PASS live) - kalau dipanggil di luar
 * Apps Script HTML Service (mis. dites di browser biasa), setiap method
 * resolve ke {ok:false, code:'NOT_IN_APPS_SCRIPT', ...}, TIDAK PERNAH
 * melempar exception ke pemanggil.
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
