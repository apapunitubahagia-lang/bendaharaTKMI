// Langkah build P1-IMP Prioritas C (klien). Dijalankan SETELAH apply_import_client.js. Paket terpisah agar mudah di-revert.
// Tampilan kewajiban/tunggakan TIDAK menampilkan daftar kosong atau angka nol palsu bila periodeAktif tidak valid atau sumber
// tidak tersedia/tidak lengkap (konsisten dengan T8): kewajibanDataStatus_ + centralSourcesStatus_ untuk kunci 'kewajiban'.
// Mode lokal lama (tanpa server) hanya diperiksa periodenya. Formula kewajiban tidak diubah.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
L.rep(doc, `  }catch(e){ alasan.push('status sumber data tidak dapat diperiksa'); }
  return {ok: !alasan.length, alasan: alasan};
}
/* [P1-IMP F8] Normalisasi periodeAktif`, `  }catch(e){ alasan.push('status sumber data tidak dapat diperiksa'); }
  if((keys || []).indexOf('kewajiban') !== -1){ const dp = kpiPeriodeStatus_(Store.loadSettings().periodeAktif); if(!dp.ok) alasan.unshift(dp.alasan[0]); } // [P1-IMP C]
  return {ok: !alasan.length, alasan: alasan};
}
/* [P1-IMP C] Status data kewajiban: LENGKAP | PERIODE_AKTIF_TIDAK_VALID | SUMBER_TIDAK_TERSEDIA | SUMBER_TIDAK_LENGKAP (| LOKAL: mode lama). */
function kewajibanDataStatus_(){
  const dp = kpiPeriodeStatus_(Store.loadSettings().periodeAktif);
  if(!dp.ok) return {ok:false, kode:'PERIODE_AKTIF_TIDAK_VALID', alasan:dp.alasan};
  if(typeof ServerBridge === 'undefined' || !ServerBridge || !centralReady_()) return {ok:true, kode:'LOKAL', alasan:[]};
  const keys = ['kewajiban', 'alokasi', 'transaksi'], ds = centralSourcesStatus_(keys);
  if(ds.ok) return {ok:true, kode:'LENGKAP', alasan:[]};
  const st = OperationalCache.states, tidakLengkap = keys.some(k=>st[k] && ['SCHEMA_MISMATCH', 'PARTIAL_READ'].indexOf(st[k].error) !== -1);
  return {ok:false, kode:tidakLengkap ? 'SUMBER_TIDAK_LENGKAP' : 'SUMBER_TIDAK_TERSEDIA', alasan:ds.alasan};
}
/* [P1-IMP F8] Normalisasi periodeAktif`, 'kewajibanDataStatus_ + centralSourcesStatus_ periode', log);
L.rep(doc, `      progressStat('Expected Penerimaan', expected, expected, 'var(--primary)')+
      progressStat('Sudah Diterima', sudahDiterima, expected, 'var(--green)')+
      progressStat('Belum Diterima (Tunggakan)', belumDiterima, expected, 'var(--amber)')+`,
`      (kewajibanDataStatus_().ok ? progressStat('Expected Penerimaan', expected, expected, 'var(--primary)')+
      progressStat('Sudah Diterima', sudahDiterima, expected, 'var(--green)')+
      progressStat('Belum Diterima (Tunggakan)', belumDiterima, expected, 'var(--amber)') : centralUnavailableInline_(kewajibanDataStatus_()))+ // [P1-IMP C]`, 'Beranda penerimaan siswa', log);
L.rep(doc, `  if(!filtered.length) html += '<tr><td colspan="7" class="empty">Tidak ada data sesuai filter.</td></tr>';
`, `  if(!filtered.length) html += '<tr><td colspan="7" class="empty">Tidak ada data sesuai filter.</td></tr>';
  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok && filtered.length){ html += '<tr><td colspan="7">'+centralUnavailableInline_(kd_)+'</td></tr></tbody></table></div>'; return html; } } // [P1-IMP C]
`, 'renderSiswaPosisi', log);
L.rep(doc, `  html += '<div class="card"><h3>3. Ringkasan Keuangan (computed - Patch01)</h3><div class="kv">'+`,
  `  const kdProf_ = kewajibanDataStatus_(); if(!kdProf_.ok) html += centralUnavailableCard_('3-4. Ringkasan Keuangan & Kewajiban', kdProf_); // [P1-IMP C]
  if(kdProf_.ok) html += '<div class="card"><h3>3. Ringkasan Keuangan (computed - Patch01)</h3><div class="kv">'+`, 'profil 3', log);
L.rep(doc, `  html += '<div class="card"><h3>4. Kewajiban (Computed, bukan record wajib)</h3>`, `  if(kdProf_.ok) html += '<div class="card"><h3>4. Kewajiban (Computed, bukan record wajib)</h3>`, 'profil 4', log);
L.rep(doc, `  const groups = alokTagihanGroups(ed.activeSiswaId, ed.filter);
`, `  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok) return html + centralUnavailableInline_(kd_); } // [P1-IMP C] bukan "belum ada tagihan"
  const groups = alokTagihanGroups(ed.activeSiswaId, ed.filter);
`, 'alokTagihanCardsHtml', log);
L.rep(doc, `  const groups = alokTagihanGroups(ed.activeSiswaId, {});
  const g = groups.find(x=>x.periode===ed.selectedPeriode);`, `  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok) return centralUnavailableInline_(kd_); } // [P1-IMP C]
  const groups = alokTagihanGroups(ed.activeSiswaId, {});
  const g = groups.find(x=>x.periode===ed.selectedPeriode);`, 'alokTagihanDetailHtml', log);
L.save(doc);
fs.writeFileSync(OUT + '_kewajiban_guard_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_kewajiban_guard_client OK: ' + log.length + ' perubahan');
