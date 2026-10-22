// [P1_27] Pengaman tujuan clasp push (dipakai workflow GitHub "Kirim ke Apps Script UJI"). Gagal (exit 1) bila:
//  - TEST_SCRIPT_ID / TEST_SPREADSHEET_ID kosong atau formatnya tidak wajar;
//  - TEST_SPREADSHEET_ID = spreadsheet PRODUKSI;
//  - proyek TEST_SCRIPT_ID (dibaca dari Apps Script API, projects.get) TIDAK terikat pada TEST_SPREADSHEET_ID
//    (mis. salah menempel scriptId proyek produksi, atau proyek mandiri).
// Kredensial dibaca dari ~/.clasprc.json (ditulis workflow dari secret CLASPRC_JSON). Token TIDAK pernah dicetak.
const fs = require('fs'), os = require('os'), path = require('path');
const PROD_SPREADSHEET_ID = '1QRibka0YHU0BhRsGV4DoIpnWhdb2Lp3ZL2tAkLxVWaY';
const fail = m => { console.error('PENGAMAN TUJUAN GAGAL: ' + m); process.exit(1); };
(async () => {
  const scriptId = String(process.env.TEST_SCRIPT_ID || '').trim(), ssId = String(process.env.TEST_SPREADSHEET_ID || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(scriptId)) fail('variabel TEST_SCRIPT_ID kosong/tidak wajar');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(ssId)) fail('variabel TEST_SPREADSHEET_ID kosong/tidak wajar');
  if (ssId === PROD_SPREADSHEET_ID) fail('TEST_SPREADSHEET_ID adalah spreadsheet PRODUKSI - workflow ini hanya untuk salinan uji');
  let rc; try { rc = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8')); } catch (e) { fail('~/.clasprc.json tidak terbaca (secret CLASPRC_JSON kosong/rusak)'); }
  const t = rc.token || {}, c = rc.oauth2ClientSettings || {};
  if (!t.refresh_token || !c.clientId || !c.clientSecret) fail('isi CLASPRC_JSON tidak lengkap (perlu token.refresh_token & oauth2ClientSettings dari clasp 2.4.2)');
  const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  if (!tok.ok) fail('gagal memperbarui token (HTTP ' + tok.status + ') - ulangi clasp login & perbarui secret');
  const access = (await tok.json()).access_token;
  const pr = await fetch('https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId), { headers: { Authorization: 'Bearer ' + access } });
  if (!pr.ok) fail('proyek ' + scriptId + ' tidak dapat dibaca (HTTP ' + pr.status + ') - periksa Script ID & Apps Script API (On)');
  const p = await pr.json();
  if (p.parentId === PROD_SPREADSHEET_ID) fail('proyek ' + scriptId + ' TERIKAT pada spreadsheet PRODUKSI');
  if (p.parentId !== ssId) fail('proyek ' + scriptId + ' tidak terikat pada TEST_SPREADSHEET_ID (parentId: ' + (p.parentId || 'tidak ada / proyek mandiri') + ')');
  console.log('Pengaman tujuan OK: proyek "' + (p.title || scriptId) + '" terikat pada spreadsheet uji ' + ssId + ' (bukan produksi).');
})().catch(e => fail(String(e && e.message || e)));
