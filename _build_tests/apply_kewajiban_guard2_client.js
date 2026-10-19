// Langkah build P1_19 D (klien). Dijalankan SETELAH apply_akun_strict_client.js. Paket terpisah agar mudah di-revert.
// Melengkapi pengaman kewajiban (P1_18 C) memakai kontrak yang sama (kewajibanDataStatus_ / centralSourcesStatus_):
//   - angka kewajiban/sisa per siswa & badge tunggakan -> "DATA TIDAK TERSEDIA" (detail penerimaan, resi, daftar siswa, laporan);
//   - ekspor Kewajiban/Tunggakan/Siswa diblokir dari halaman mana pun; Kontrol Keuangan (FCC) ikut memeriksa periode aktif;
//   - alokasi baru diblokir: wizard Pembayaran & form Penerimaan bersiswa, Alokasi Cepat; laporan bulanan tidak dibuat.
// Tidak ada status baru; formula kewajiban & KPI tidak diubah.
const fs = require('fs');
const { OUT } = require('./paths');
const L = require('./p0_lib');
const log = [];
const doc = L.load(OUT + 'Bendahara_V2.html');
// 1. helper tampilan + badge
L.rep(doc, "function arrearsBadge(status){\n", "/* [P1_19 D] Rupiah kewajiban/sisa hanya bila data kewajiban LENGKAP; selain itu teks DATA TIDAK TERSEDIA (bukan nol). */\n" +
  "function kwRp_(fn){ const kd = kewajibanDataStatus_(); return kd.ok ? fmtRp(fn()) : '<span class=\"badge red\" title=\"' + esc(kd.alasan.join('; ')) + '\">DATA TIDAK TERSEDIA</span>'; }\n" +
  "function arrearsBadge(status){\n  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok) return '<span class=\"badge red\" title=\"' + esc(kd_.alasan.join('; ')) + '\">DATA TIDAK TERSEDIA</span>'; } // [P1_19 D]\n", 'kwRp_ + arrearsBadge', log);
{ const re = /fmtRp\((totalKewajibanSiswa|totalSisaSiswa)\(([^()]*)\)\)/g; const n = (doc.t.match(re) || []).length; if (n < 4) throw new Error('fmtRp(totalKewajiban/Sisa) hanya ' + n + 'x');
  doc.t = doc.t.replace(re, 'kwRp_(()=>$1($2))'); log.push('fmtRp(totalKewajibanSiswa|totalSisaSiswa) -> kwRp_ (' + n + 'x)'); }
L.rep(doc, "(semua komponen)</div><div>'+fmtRp(sisaSiswa)+'</div></div>';", "(semua komponen)</div><div>'+kwRp_(()=>sisaSiswa)+'</div></div>';", 'resi sisa siswa', log);
L.rep(doc, "'<div>Sisa Kewajiban (semua siswa)</div><div>'+fmtRp(totalSisaAgg)+'</div>'", "'<div>Sisa Kewajiban (semua siswa)</div><div>'+kwRp_(()=>totalSisaAgg)+'</div>'", 'resi sisa agregat', log);
// 2. ekspor & FCC
L.rep(doc, "  const ds_ = centralSourcesStatus_((State.page === 'laporan' && REPORT_SOURCE_KEYS_[State.laporanTab]) || (baseFilename === 'Anggaran' ? RAB_SOURCE_KEYS_ : []));",
  "  const kwKeys_ = ['Kewajiban', 'Tunggakan', 'Siswa'].indexOf(baseFilename) !== -1 ? ['kewajiban', 'alokasi', 'transaksi'] : null; // [P1_19 D] dari halaman mana pun\n" +
  "  const ds_ = centralSourcesStatus_(kwKeys_ || (State.page === 'laporan' && REPORT_SOURCE_KEYS_[State.laporanTab]) || (baseFilename === 'Anggaran' ? RAB_SOURCE_KEYS_ : []));", 'exportReport kewajiban', log);
L.rep(doc, "  if((keys || []).indexOf('kewajiban') !== -1){ const dp = kpiPeriodeStatus_(Store.loadSettings().periodeAktif); if(!dp.ok) alasan.unshift(dp.alasan[0]); } // [P1-IMP C]",
  "  if((keys || []).indexOf('kewajiban') !== -1 || keys === FCC_SOURCE_KEYS_){ const dp = kpiPeriodeStatus_(Store.loadSettings().periodeAktif); if(!dp.ok) alasan.unshift(dp.alasan[0]); } // [P1-IMP C] [P1_19 D] FCC memakai tagihan periode aktif", 'FCC periode', log);
// 3. alokasi baru diblokir
const blok = "DIBLOKIR - ' + kd_.alasan[0] + '. Pembayaran siswa tidak disimpan agar tidak tercatat tanpa alokasi kewajiban yang benar.";
L.rep(doc, "  const can = pwCanSubmit();\n  if(!can.ok){ toast(can.reason); return; }\n",
  "  const can = pwCanSubmit();\n  if(!can.ok){ toast(can.reason); return; }\n  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok && w.rows.some(r=>r.siswaId)){ toast('" + blok + "'); return; } } // [P1_19 D]\n", 'pwSubmit', log);
L.rep(doc, "  if(!akunList().some(a=>a.id===val('pf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n",
  "  if(!akunList().some(a=>a.id===val('pf_akun'))){ toast('Akun Kas/Bank wajib dipilih (tidak ada akun bawaan)'); return; } // [P1-IMP B]\n  if(siswaId){ const kd_ = kewajibanDataStatus_(); if(!kd_.ok){ toast('" + blok + "'); return; } } // [P1_19 D]\n", 'submitPenerimaan', log);
L.rep(doc, "function openQuickAlokasi(trxId){\n  const t = transaksiById(trxId);\n  if(!t){ toast('Transaksi tidak ditemukan'); return; }\n",
  "function openQuickAlokasi(trxId){\n  const t = transaksiById(trxId);\n  if(!t){ toast('Transaksi tidak ditemukan'); return; }\n  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok){ toast('Alokasi tidak dapat dibuat - DATA TIDAK TERSEDIA: ' + kd_.alasan[0]); return; } } // [P1_19 D]\n", 'openQuickAlokasi', log);
L.rep(doc, "  let html = '<div class=\"card\"><h3>Catat Penerimaan'+(isEdit?' <span class=\"badge amber\">MODE EDIT</span>':'')+'</h3>';\n",
  "  let html = '<div class=\"card\"><h3>Catat Penerimaan'+(isEdit?' <span class=\"badge amber\">MODE EDIT</span>':'')+'</h3>';\n  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok) html += centralUnavailableInline_(kd_) + '<p class=\"small-muted\">Rencana alokasi tidak dihitung; pembayaran siswa tidak dapat disimpan sampai data kewajiban tersedia.</p>'; } // [P1_19 D]\n", 'pw banner', log);
L.rep(doc, "function submitLaporanBulanan(){\n  const periode = Store.loadSettings().periodeAktif;\n",
  "function submitLaporanBulanan(){\n  const periode = Store.loadSettings().periodeAktif;\n  { const kd_ = kewajibanDataStatus_(); if(!kd_.ok){ toast('Laporan bulanan tidak dibuat - DATA TIDAK TERSEDIA: ' + kd_.alasan[0]); return; } } // [P1_19 D] snapshot memuat tagihan/tunggakan\n", 'submitLaporanBulanan', log);
L.save(doc);
fs.writeFileSync(OUT + '_kewajiban_guard2_client_patch_log.txt', log.join('\n') + '\n');
console.log('apply_kewajiban_guard2_client OK: ' + log.length + ' perubahan');
