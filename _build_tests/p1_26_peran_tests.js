/* Suite PENGELOLAAN PERAN & ATRIBUSI PELAKU (P1_26 keputusan 4; sandbox Node, TIDAK menyentuh Google Sheets / Apps Script).
 * Hak BENDAHARA tidak dapat ditambah oleh BENDAHARA lewat aplikasi tanpa otorisasi independen; pengguna tidak dapat menaikkan perannya sendiri;
 * aktor audit selalu dari sesi server. Model sementara satu akun institusi: atribusi ke INDIVIDU tidak mungkin (dicatat, tidak dikarang).
 */
const { makeServer } = require('./srv_env.js');
const R = []; const rec = (id, tc, ok, d) => R.push({ id, tc, st: ok === null ? 'INFO' : (ok ? 'PASS' : 'FAIL'), d });
const J = o => JSON.stringify(o);
const G = 'ROLE_GRANT_REQUIRES_INDEPENDENT_AUTH';
const code = r => r && (r.ok ? (r.data && r.data.unchanged ? 'UNCHANGED' : 'OK') : r.code);
const users = s => s.sheets['26_USER_ACCESS'].slice(1);
const audit = (s, a) => s.sheets['13_AUDIT_LOG'].slice(1).filter(r => r[2] === a);
const seed = (s, o) => { const h = s.sheets['26_USER_ACCESS'][0]; s.sheets['26_USER_ACCESS'].push(h.map(k => o[k] === undefined ? '' : o[k])); };
const up = (s, o) => code(s.sb.opUserUpsert(o));

{ const s = makeServer(); const n0 = users(s).length, a0 = audit(s, 'ACCESS_CREATE').length;
  const r = up(s, { email: 'ben2@x.id', nama: 'B2', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' });
  rec('PR-01', 'BENDAHARA membuat akun BENDAHARA baru yang aktif -> ' + G + '; tidak ada baris & audit baru', r === G && users(s).length === n0 && audit(s, 'ACCESS_CREATE').length === a0, r); }
{ const s = makeServer(); const r = up(s, { id: 'U2', email: 'auditor@x.id', nama: 'Auditor', role: 'BENDAHARA', unit: '', status: 'ACTIVE' });
  rec('PR-02', 'mengubah peran AUDITOR menjadi BENDAHARA -> ' + G + '; peran tetap AUDITOR', r === G && users(s).find(x => x[0] === 'U2')[3] === 'AUDITOR', r); }
{ const s = makeServer(); seed(s, { id: 'U3', email: 'ben.lama@x.id', nama: 'Lama', role: 'BENDAHARA', unit: 'MI', status: 'INACTIVE' });
  const r = up(s, { id: 'U3', email: 'ben.lama@x.id', nama: 'Lama', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' });
  rec('PR-03', 'aktivasi ulang baris BENDAHARA nonaktif -> ' + G + '; tetap INACTIVE', r === G && users(s).find(x => x[0] === 'U3')[5] === 'INACTIVE', r); }
{ const s = makeServer(); seed(s, { id: 'U4', email: 'ben.b@x.id', nama: 'B', role: 'BENDAHARA', unit: 'TK', status: 'ACTIVE' });
  const r = up(s, { id: 'U4', email: 'ben.alias@x.id', nama: 'B', role: 'BENDAHARA', unit: 'TK', status: 'ACTIVE' });
  rec('PR-04', 'memindahkan baris BENDAHARA aktif lain ke email baru -> ' + G + '; email tetap', r === G && users(s).find(x => x[0] === 'U4')[1] === 'ben.b@x.id', r); }
{ const s = makeServer(); seed(s, { id: 'U4', email: 'ben.b@x.id', nama: 'B', role: 'BENDAHARA', unit: 'TK', status: 'ACTIVE' });
  const res = { ubahNamaSendiri: up(s, { id: 'U1', email: 'bendahara@x.id', nama: 'Bendahara Institusi', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' }),
    ubahUnitLain: up(s, { id: 'U4', email: 'ben.b@x.id', nama: 'B', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE' }),
    nonaktifkanLain: up(s, { id: 'U4', email: 'ben.b@x.id', nama: 'B', role: 'BENDAHARA', unit: 'MI', status: 'INACTIVE' }),
    auditorBaru: up(s, { email: 'aud3@x.id', nama: 'A3', role: 'AUDITOR', unit: '', status: 'ACTIVE' }) };
  rec('PR-05', 'tetap boleh (tidak menambah hak BENDAHARA): ubah nama/unit baris BENDAHARA aktif (email sama), menonaktifkan BENDAHARA lain, mengelola AUDITOR', Object.values(res).every(x => x === 'OK'), J(res)); }
{ const s = makeServer(); s.sheets['26_USER_ACCESS'].push(['U5', 'kepala@x.id', 'K', 'KEPALA_SEKOLAH', '', 'ACTIVE', '', ''], ['U6', 'yayasan@x.id', 'Y', 'YAYASAN', '', 'ACTIVE', '', '']);
  const res = {}; [['auditor@x.id', 'U2', 'AUDITOR'], ['kepala@x.id', 'U5', 'KEPALA_SEKOLAH'], ['yayasan@x.id', 'U6', 'YAYASAN']].forEach(([e, id, r0]) => { s.state.email = e; res[e] = up(s, { id, email: e, nama: 'X', role: 'BENDAHARA', unit: '', status: 'ACTIVE' }); });
  s.state.email = 'bendahara@x.id';
  rec('PR-06', 'menaikkan peran SENDIRI: AUDITOR / KEPALA_SEKOLAH / YAYASAN memanggil opUserUpsert untuk dirinya -> ROLE_NOT_ALLOWED; peran tidak berubah',
    Object.values(res).every(x => x === 'ROLE_NOT_ALLOWED') && users(s).find(x => x[0] === 'U2')[3] === 'AUDITOR' && users(s).find(x => x[0] === 'U5')[3] === 'KEPALA_SEKOLAH', J(res)); }
{ const s = makeServer(); const r = up(s, { email: 'ben9@x.id', nama: 'B9', role: 'BENDAHARA', unit: 'MI', status: 'ACTIVE', actorRole: 'YAYASAN', identity: { role: 'YAYASAN', email: 'yayasan@x.id' }, otorisasiIndependen: true });
  rec('PR-07', 'klaim otorisasi/peran dari payload klien (actorRole, identity, otorisasiIndependen) DIABAIKAN -> tetap ' + G, r === G, r); }
{ const s = makeServer(); s.sb.opAuditAppend([{ id: 'x1', aksi: 'ACCESS_CREATE', sumber: 'google:yayasan@x.id', actor: 'yayasan@x.id', after: { by: 'yayasan' } }]);
  const row = s.sheets['13_AUDIT_LOG'].slice(1).pop(), h = s.sheets['13_AUDIT_LOG'][0];
  rec('PR-08', 'aktor audit dari sesi server: entri audit klien yang mengklaim aksi server/aktor lain -> aksi diberi awalan UI_, sumber = sesi (google:bendahara@x.id)', row[h.indexOf('aksi')] === 'UI_ACCESS_CREATE' && row[h.indexOf('sumber')] === 'google:bendahara@x.id', J([row[h.indexOf('aksi')], row[h.indexOf('sumber')]])); }
{ const s = makeServer(); s.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 1000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Orang A', clientRequestId: 'pa1' });
  s.sb.opCreateExpense({ tanggal: '2026-09-11', unit: 'MI', nominal: 2000, akunId: 'akun_kas1', metode: 'Tunai', kategori: 'ATK', penerima: 'Orang B', clientRequestId: 'pa2' });
  const h = s.sheets['13_AUDIT_LOG'][0], src = new Set(s.sheets['13_AUDIT_LOG'].slice(1).filter(r => /CREATE_EXPENSE/.test(r[h.indexOf('aksi')])).map(r => r[h.indexOf('sumber')]));
  rec('PR-09', 'KETERBATASAN (INFO) model satu akun institusi: dua tindakan oleh dua orang berbeda yang memakai akun yang sama tercatat dengan sumber IDENTIK; audit hanya membuktikan AKUN, bukan individu. Tidak ada identitas individu yang dikarang', null, J([...src])); }
{ const s = makeServer(); const a = code(s.sb.opReadSheet('05_TRANSAKSI', {})); s.sheets['26_USER_ACCESS'][1][5] = 'INACTIVE'; const b = s.sb.opReadSheet('05_TRANSAKSI', {});
  rec('PR-10', 'pencabutan di luar aplikasi (status INACTIVE oleh pemilik) berlaku pada panggilan berikutnya (identitas dihitung ulang per panggilan)', a === 'OK' && b.code === 'USER_INACTIVE', J([a, b.code])); }

const pass = R.filter(r => r.st === 'PASS').length, fail = R.filter(r => r.st === 'FAIL').length, info = R.filter(r => r.st === 'INFO').length;
R.forEach(r => console.log(r.st + ' ' + r.id + ' [' + r.tc + '] ' + r.d));
console.log('\nPASS=' + pass + ' FAIL=' + fail + ' INFO=' + info);
process.exitCode = fail ? 1 : 0;
