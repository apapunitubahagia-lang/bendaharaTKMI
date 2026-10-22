# P1_25 (bagian 1) — Verifikasi Repository & Audit Pilihan Autentikasi GAP-005

**Tanggal:** 22 Oktober 2026

**Status:**
- Integrasi nyata: **BLOCKED**. Belum ada salinan spreadsheet nonproduksi, proyek Apps Script uji, akun uji per peran, maupun folder bukti uji.
- GAP-005: **terbuka**. Dokumen ini hanya audit dan desain. Tidak ada kode, deployment, atau setelan yang diubah.
- Audit: **READY_FOR_REVIEW**.

**Catatan lingkup:** instruksi P1_25 yang diterima terpotong di Tahap 2 ("risiko pemalsuan ident..."). Dokumen ini mencakup Tahap 1 dan Tahap 2. Tahap berikutnya menunggu instruksi lengkap.

Perilaku platform Apps Script di bawah diambil dari dokumentasi Google dan pengetahuan umum platform. Semuanya **belum diverifikasi live** di proyek ini, dan harus dibuktikan dengan `ltIdentitasProbe()` (P1_24) pada salinan uji. Tidak ada klaim hasil uji Apps Script.

---

## 1. Tahap 1 — Verifikasi repository

| Hal | Nilai |
|---|---|
| Branch aktif | `claude/hopeful-galileo-mnifgq` (= `origin/claude/hopeful-galileo-mnifgq`) |
| HEAD | `acf3f96` (dokumen P1_24) |
| Working tree | Bersih. `node build_all.js` tidak mengubah berkas apa pun (build deterministik) |
| Hubungan commit | `3675321` (P1_23) → `4d85507` → `bb5dd5d` → `903b091` → `acf3f96` (P1_24); semua leluhur HEAD, linear, tanpa commit lain |
| `claude/compassionate-dirac-drm760` | Tetap di `3675321`, tidak diubah |
| Baseline | `node run_all_tests.js p1_25_baseline`: **42 suite, 734 / 0 / 65** = hasil akhir P1_24 (log `_test_logs/p1_25_baseline_*.log`) |
| Berkas yang disentuh bagian ini | **Hanya dokumen baru** ini + log baseline. Tidak ada `.gs`, HTML, skrip build, atau uji yang diubah |
| Fungsi yang diaudit (baca saja) | `AuthCentral.gs`: `getCurrentUserIdentity`, `lookupUserAccess_`, `authorizeCurrentUser_`, `normalizeEmail_`. `OperationalAPI.gs`: `opGate_`, `opEngineWrite_`, `OP_WRITE_ROLES_`/`OP_READ_ROLES_`. `AdminAPI.gs`: `opUserUpsert`, `OP_ROLE_ASSIGNABLE_BY_`, `OP_PRIVILEGED_ROLES_`. `Code.gs`: `doGet`, `doPost`, `include`, `LEGACY_DOPOST_ENABLED_`. `BuktiDrive.gs`: `opBuktiFolder_`. `ServerBridge.js`: `callServer`. `_live_tests/LiveReadiness.gs`: `ltIdentitasProbe` |
| Risiko konflik bila dibatalkan | Tidak ada. Commit bagian ini hanya menambah berkas baru; revert bersih dan tidak memengaruhi build maupun uji |

---

## 2. Fakta kode yang menentukan pilihan autentikasi

| # | Fakta | Lokasi |
|---|---|---|
| K1 | Identitas server = `Session.getActiveUser().getEmail()` → lowercase/trim → baris `26_USER_ACCESS` berstatus ACTIVE. Email kosong, tidak terdaftar, nonaktif, atau header rusak → ditolak (**gagal tertutup**) | `AuthCentral.gs` |
| K2 | Setiap fungsi `op*` publik memanggil `opGate_` → identitas & peran dihitung ulang pada **setiap** panggilan; tidak ada sesi/token aplikasi | `OperationalAPI.gs:86`; RD-05 |
| K3 | Parameter `deps` (injeksi uji) tidak dapat berisi fungsi dari klien, sehingga identitas tidak dapat dipalsukan lewat payload. Aktor audit selalu dari sesi | HD-T7-06 |
| K4 | Data diakses lewat `SpreadsheetApp.getActiveSpreadsheet()` (skrip terikat); tidak ada `openById` | `TransactionEngine.gs:99` |
| K5 | Bukti diunggah ke Drive akun yang **menjalankan** skrip (folder `BUKTI_FOLDER_ID`, atau dicari berdasarkan nama) | `BuktiDrive.gs` |
| K6 | Klien hanya memakai `google.script.run` (`ServerBridge.callServer`). `doPost` lama dimatikan (`LEGACY_DOPOST_ENABLED_ = false`) | `ServerBridge.js`, `Code.gs:168` |
| K7 | `doGet` menyajikan HTML tanpa autentikasi; data hanya lewat `op*` bergerbang. `?ping=1` mengembalikan waktu server tanpa autentikasi. `include`, `testBendaharaEvaluate`, `TEST_BRIDGE_TEMPLATE` dapat dipanggil dari klien tanpa gerbang, tetapi tidak membuka data sheet (RD-06/07) | `Code.gs` |
| K8 | BENDAHARA dapat memberi peran **BENDAHARA** dan AUDITOR; KEPALA_SEKOLAH/YAYASAN hanya dapat diberikan pemilik spreadsheet secara manual | `AdminAPI.gs:19-20` |
| K9 | Kode belum memiliki verifikasi token apa pun (tidak ada `ScriptApp.getIdentityToken`, `UrlFetchApp`, `tokeninfo`) | grep |

**Prinsip yang berlaku untuk semua pilihan:** kontrol server (peran, validasi, audit, kunci periode) hanya bermakna bila pengguna aplikasi **tidak** punya hak edit langsung ke spreadsheet dan folder bukti. Siapa pun yang dapat mengedit sheet dapat mengubah `26_USER_ACCESS`, `05_TRANSAKSI`, maupun `13_AUDIT_LOG` tanpa melalui server.

---

## 3. Tahap 2 — Audit pilihan autentikasi

### A. Google Workspace sekolah — *Execute as: Me*, akses: domain sekolah

| Aspek | Penilaian |
|---|---|
| Verifikasi identitas | Google mengautentikasi pengguna. Untuk pengguna **satu domain Workspace** dengan pemilik deployment, `getActiveUser().getEmail()` terisi (menurut dokumentasi). Kode saat ini (K1) dipakai apa adanya |
| Sumber peran | `26_USER_ACCESS` di spreadsheet milik akun pemilik. Pengguna tidak dapat menyentuhnya karena tidak punya akses spreadsheet |
| Mencegah edit langsung | Skrip berjalan dengan hak **pemilik**; spreadsheet & folder bukti **tidak dibagikan** ke pengguna. Pengguna hanya dapat bertindak lewat `op*` |
| Izin spreadsheet/Drive | Hanya pemilik (sebaiknya akun institusi, mis. `bendahara-sistem@<domain>`, bukan akun pribadi) + admin cadangan. Pengguna: **tidak ada** akses langsung |
| Risiko pemalsuan identitas | Rendah. Email berasal dari sesi Google, bukan dari klien. Sisa risiko: (1) akun pengguna diretas (mitigasi: 2SV wajib di konsol admin); (2) **super admin Workspace** dapat mereset sandi pengguna mana pun; (3) akun pemilik deployment diretas → kendali penuh |
| Risiko lain | Spreadsheet tidak sengaja dibagikan "siapa pun di domain" → kontrol runtuh (perlu pemeriksaan berkala setelan berbagi); Yayasan berada di luar domain sekolah → email kosong → `AUTH_REQUIRED` (Yayasan butuh akun di domain yang sama); akun lulus/keluar wajib dinonaktifkan di Workspace **dan** di `26_USER_ACCESS` |
| Perubahan kode | **Tidak ada** untuk identitas. Wajib: simpan `appsscript.json` (`executeAs: USER_DEPLOYING`, `access: DOMAIN`) di repo agar dapat diaudit |
| Kelayakan | **Paling sesuai dengan kode saat ini.** Syarat: sekolah memiliki domain Google Workspace (mis. Google Workspace for Education bila memenuhi syarat program Google). Kepemilikan domain dan biaya/kelayakan program **belum diverifikasi** |
| Cara membuktikan | `ltIdentitasProbe()` lewat web app uji untuk tiap akun → diharapkan `emailAktifTerbaca=true`, `aktifSamaDenganEfektif=false`, code SUCCESS/peran benar; akun uji **tidak** dapat membuka spreadsheet salinan langsung |

### B. Google Workspace sekolah — *Execute as: user accessing*

| Aspek | Penilaian |
|---|---|
| Verifikasi identitas | Kuat. Pengguna memberi otorisasi OAuth; `getActiveUser()` = pengguna sendiri |
| Sumber peran | `26_USER_ACCESS`, tetapi pengguna **dapat mengeditnya sendiri** (lihat baris berikut). Jadi bukan sumber tepercaya |
| Mencegah edit langsung | **Tidak dapat.** Skrip berjalan dengan hak pengguna, sehingga pengguna wajib punya hak **edit** spreadsheet agar `op*` bisa menulis. Proteksi rentang (*protected range*) juga membatasi skrip yang berjalan sebagai pengguna itu, jadi tidak menyelesaikan masalah |
| Izin spreadsheet/Drive | Setiap pengguna: editor spreadsheet + editor folder bukti; berkas bukti dimiliki masing-masing pengguna |
| Risiko pemalsuan identitas | Identitas tidak dipalsukan, tetapi **peran dapat dinaikkan sendiri** (edit `26_USER_ACCESS`); audit log dapat diubah; transaksi dapat diubah tanpa validasi/kunci periode |
| Kelayakan | **Tidak disarankan** untuk aplikasi keuangan ini. Seluruh kontrol P0–P1_24 dapat dilewati. Hanya berguna sebagai pembanding uji identitas |

### C. Gmail biasa — autentikasi berbasis token (rancangan)

Dengan *Execute as: Me*, email pengguna Gmail di luar domain pemilik **umumnya kosong**, sehingga kode saat ini menolak semua (aman, tetapi tidak dapat dipakai). Identitas harus dibuktikan dengan **token OpenID Connect Google yang diverifikasi server**. Ada dua varian:

**C1 — Frontend terpisah + Google Identity Services (GIS):**
- HTML di-host pada origin tetap (bukan HtmlService).
- GIS memberi ID token, dan token dikirim ke web app Apps Script (*Execute as: Me*, akses *Anyone*) lewat `doPost`.
- Alasan tidak memakai HtmlService: halaman HtmlService berjalan di iframe `*.googleusercontent.com` dengan subdomain per deployment, yang tidak cocok untuk daftar *Authorized JavaScript origins* klien OAuth. GIS di dalam HtmlService **tidak dianggap andal/didukung**.

**C2 — Dua proyek Apps Script:**
- Proyek *front*: HtmlService, *Execute as: user accessing*, **tanpa** akses spreadsheet. Proyek ini meminta `ScriptApp.getIdentityToken()` (scope `openid`, `email`), lalu meneruskan permintaan ke proyek *back* lewat `UrlFetchApp` beserta ID token.
- Proyek *back*: *Execute as: Me*, akses *Anyone*, memegang spreadsheet; memverifikasi token sebelum setiap operasi.
- Status: varian ini **secara teori** memakai fitur platform yang ada, tetapi **belum pernah dibuktikan** di proyek ini.

| Aspek | Penilaian (C1 & C2) |
|---|---|
| Verifikasi identitas | Server *back* memverifikasi ID token pada **setiap** permintaan: tanda tangan (Apps Script tidak punya fungsi verifikasi RS256 bawaan, sehingga praktisnya lewat endpoint `https://oauth2.googleapis.com/tokeninfo` via `UrlFetchApp`), `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `aud` = client ID yang diizinkan, `exp` belum lewat, `email_verified = true`. Gagal apa pun → tolak |
| Sumber peran | `26_USER_ACCESS` di spreadsheet milik pemilik (tidak dibagikan). Disarankan menambah kolom `sub` (ID akun Google yang tetap); email saja dapat berubah. Ini **perubahan skema**, butuh persetujuan |
| Mencegah edit langsung | Sama dengan A: hanya pemilik yang punya akses spreadsheet/folder; pengguna Gmail tidak pernah diberi akses |
| Izin spreadsheet/Drive | Pemilik saja. C2: proyek *front* tidak butuh izin spreadsheet; pengguna memberi izin OAuth `openid`/`email` (+ `script.external_request` di *front*) |
| Risiko pemalsuan identitas | Bergantung penuh pada kebenaran verifikasi: token dari aplikasi lain (`aud` tidak diperiksa); token kedaluwarsa/diputar ulang (jendela ~1 jam; perlu `exp` + idealnya nonce/anti-replay); email belum terverifikasi; **identitas dari payload** dan bukan dari token (harus dilarang); kebocoran token di log/klien. *Back* dengan akses *Anyone* dapat dipanggil siapa pun di internet, sehingga setiap jalur tanpa verifikasi menjadi celah |
| Risiko lain | Kuota `UrlFetchApp` & latensi (tokeninfo per permintaan, perlu cache singkat yang aman); akun Gmail pribadi tidak dikelola sekolah (tidak ada 2SV wajib, tidak dapat dicabut terpusat, cukup dicabut di `26_USER_ACCESS`); CORS `doPost` untuk C1 (hanya permintaan sederhana) |
| Perubahan kode | **Besar.** Router `doPost` baru (menggantikan `google.script.run` / `ServerBridge`), `getCurrentUserIdentity` membaca identitas dari token terverifikasi, uji negatif lengkap, klien OAuth di proyek Google Cloud, layar persetujuan OAuth. Jalur `doPost` lama (device token, P0-C) **tidak boleh** dihidupkan kembali sebagai gantinya |
| Kelayakan | Layak secara teknis tetapi berisiko implementasi tertinggi; perlu desain keamanan terpisah, uji penetrasi dasar, dan persetujuan pemilik |

### D. Alternatif lain yang benar-benar didukung platform & kode saat ini

| Pilihan | Identitas / peran | Edit langsung | Penilaian |
|---|---|---|---|
| **D1. *Execute as: Me*, akses *Only myself*** (satu operator, akun institusi) | Hanya pemilik; peran = BENDAHARA dari `26_USER_ACCESS` | Tidak ada pengguna lain | Didukung kode **tanpa perubahan**. Tetapi tidak ada KEPALA_SEKOLAH/YAYASAN/AUDITOR yang dapat masuk, sehingga verifikasi/persetujuan (GAP-005/D-T7) tetap tidak mungkin. Risiko: akun dipakai bersama → audit tidak dapat membedakan orang. Hanya cocok sebagai mode sementara satu operator |
| **D2. Cloud Identity (Free) pada domain milik sekolah** | Akun Google terkelola satu domain; secara prinsip sama dengan A | Sama dengan A | Mungkin memenuhi syarat "satu domain" tanpa lisensi Workspace penuh. **Belum diverifikasi** bahwa `getActiveUser()` terisi untuk web app *Execute as: Me*; wajib dibuktikan dengan `ltIdentitasProbe()` sebelum dipilih |
| **D3. *Execute as: Me*, akses *Anyone with Google account*, pengguna Gmail** (tanpa perubahan kode) | Email umumnya kosong → `AUTH_REQUIRED` | Aman | **Gagal tertutup, tidak dapat dipakai.** Bukan solusi; dicatat agar tidak dipilih tanpa sadar |
| **D4. Akses *Anyone* (anonim)** | Tidak ada identitas | — | **Ditolak.** Semua `op*` menolak, tetapi fungsi publik tanpa gerbang (K7) terbuka ke internet |
| **D5. Menghidupkan kembali `doPost` + device token (25_DEVICE_WHITELIST)** | Token perangkat, tanpa peran | — | **Ditolak** (P0-C): tanpa peran, `requestPairing` menulis tanpa autentikasi |

### 4. Ringkasan perbandingan

| | A Workspace + Me | B Workspace + user | C Gmail + token | D1 Satu operator | D2 Cloud Identity |
|---|---|---|---|---|---|
| Identitas terverifikasi | Ya (sesi Google) | Ya | Ya, **bila** verifikasi benar | Ya (pemilik) | Kemungkinan (belum terbukti) |
| Peran dari sumber tepercaya | Ya | **Tidak** | Ya | Ya (hanya 1) | Ya |
| Pengguna tidak dapat edit langsung | Ya | **Tidak** | Ya | Ya | Ya |
| Perubahan kode identitas | Tidak ada | Tidak ada | Besar | Tidak ada | Tidak ada |
| Mendukung verifikator (KS/Yayasan) | Ya | Ya (tetapi tidak aman) | Ya | **Tidak** | Ya |
| Rekomendasi audit | **Utama** | Tidak | Cadangan bila A/D2 tidak mungkin | Sementara saja | Diuji bila A tidak tersedia |

**Rekomendasi (bukan keputusan):** A, atau D2 bila terbukti, adalah satu-satunya jalur yang aman **tanpa** perubahan kode identitas. C hanya bila sekolah tidak dapat memakai domain terkelola, dan memerlukan proyek desain-keamanan tersendiri. Pilihan akhir ada pada pemilik sistem.

---

## 5. Temuan tambahan (tidak diperbaiki; perlu keputusan)

| ID | Temuan | Dampak |
|---|---|---|
| G-1 | BENDAHARA dapat memberi peran **BENDAHARA** ke email lain (K8) | Satu orang dapat membuat akun kedua sendiri. Ini relevan untuk pemisahan tugas setelah ada verifikator. Usul: hanya pemilik/Yayasan yang menambah BENDAHARA. **Butuh keputusan kewenangan** |
| G-2 | `26_USER_ACCESS` hanya menyimpan email (tanpa `sub`) | Pergantian/penggunaan ulang email; wajib dipertimbangkan bila memilih C |
| G-3 | Fungsi publik tanpa gerbang (`include`, `testBendaharaEvaluate`, `TEST_BRIDGE_TEMPLATE`, `?ping=1`) | Tidak membuka data sheet; sebaiknya dikeluarkan dari build deploy (P1_15 §2.3). Menjadi lebih penting bila akses *Anyone* dipakai (C, D4) |
| G-4 | Manifest `appsscript.json` tidak ada di repo | `executeAs`/`access` deployment nyata tidak dapat diaudit dari kode |

---

## 6. Prasyarat & langkah pembuktian (tetap BLOCKED)

1. Pemilik memilih kandidat (A / D2 / C).
2. Penyediaan lingkungan uji sesuai checklist P1_24 §3 (salinan, proyek uji terikat, akun uji per peran **dari jenis akun yang dipilih**, folder bukti uji).
3. Deploy uji dengan konfigurasi kandidat. Jalankan `ltIdentitasProbe()` untuk setiap akun, dan catat bahwa akun uji **tidak** dapat membuka spreadsheet/folder langsung.
4. Hanya setelah langkah 3 lulus: GAP-005 dapat dinyatakan tertutup untuk konfigurasi tersebut; verifikasi LPJ (`UM_VERIFIKASI_AKTIF_`) tetap menunggu D-T7.

## 7. Keputusan yang dibutuhkan

1. Jenis akun pengguna: Workspace/Cloud Identity domain sekolah, atau Gmail biasa (berarti C dengan proyek desain terpisah).
2. Apakah Yayasan dapat memakai akun di domain yang sama.
3. G-1: siapa yang boleh menambah peran BENDAHARA.
4. Akun pemilik deployment (akun institusi, bukan pribadi) dan admin cadangan.
