# Paket Proyek: Aplikasi Belajar Berbasis Gemini

## Isi paket
```
belajar-gemini-pack/
├── README.md                 <- file ini (cara pakai + prompt bertahap)
├── .env.example              <- daftar variabel lingkungan (tanpa nilai)
├── supabase/migrations/0001_init.sql   <- skema database + RLS + bucket Storage
├── prompts/                  <- template prompt runtime (dikirim ke Gemini)
│   ├── system.md  summary.md  summary-short.md  flashcards.md
│   └── mnemonic.md  quiz.md  qa.md  essay-eval.md
└── .agent/                   <- konfigurasi untuk Antigravity
    ├── rules/      project-rules.md, security.md
    ├── workflows/  add-feature.md, review-security.md, deploy-vercel.md
    └── skills/     9 skill (7 awal + supabase-database + vercel-deploy)
```

## Stack yang dipakai
- **Frontend + backend**: Next.js (App Router, TypeScript) di **Vercel**
- **Database, login, penyimpanan file**: **Supabase** (Postgres + Auth + Storage, dengan Row Level Security)
- **AI**: Gemini API, dipanggil hanya dari route server

## Alur utama (dirancang menghindari batas Vercel)
```
Browser --unggah file langsung--> Supabase Storage (bucket privat modules/<user_id>/...)
Browser --POST /api/modules/:id/process (hanya ID)--> Vercel: ekstrak teks -> module_chunks
Browser --POST /api/generate (ID modul + fitur)--> Vercel: cek login, kuota, cache -> Gemini -> simpan hasil
```
Alasannya: Vercel membatasi isi request 4,5 MB, jadi PDF tidak boleh lewat fungsi Vercel. Batas durasi fungsi juga terbatas, jadi pekerjaan besar dipecah per bab.

## Langkah penyiapan sebelum menjalankan prompt
1. Buat proyek di Supabase (gratis cukup untuk mulai). Jalankan `supabase/migrations/0001_init.sql` di SQL Editor atau lewat Supabase CLI.
2. Salin `.env.example` menjadi `.env.local`, isi URL dan key Supabase serta `GEMINI_API_KEY` dari Google AI Studio.
3. Di Supabase > Authentication, aktifkan metode login yang Anda mau (email atau Google).
4. Simpan proyek di GitHub, lalu hubungkan ke Vercel saat tahap deploy (Tahap 8).

## Cara memasang di Antigravity
1. Buat folder proyek baru, lalu salin SELURUH isi paket ini ke akar proyek (termasuk folder `.agent` yang tersembunyi).
2. Buka folder itu di Antigravity.
3. Skill, rules, dan workflows di `.agent/` dibaca otomatis sebagai konfigurasi tingkat workspace.
4. Jalankan prompt tahap 1 sampai 8 di bawah, satu per satu. Tinjau hasil tiap tahap sebelum lanjut.

Catatan: nama folder konfigurasi Antigravity bisa berubah antarversi. Jika `.agent/` tidak terbaca, cek dokumentasi Antigravity terbaru dan sesuaikan nama foldernya. Isi file tidak perlu diubah.

Variabel lingkungan lengkap ada di `.env.example`. Jangan commit nilai aslinya.
GEMINI_API_KEY=isi_key_anda
GEMINI_MODEL=nama_model_dari_dokumentasi_terbaru
PROMPT_VERSION=1
```

---

## Prompt bertahap untuk Antigravity

### Tahap 1: Perencanaan (jangan menulis kode)
```
Baca semua file di .agent/rules dan .agent/skills serta folder prompts.
Proyek: aplikasi web belajar berbasis Gemini. Pengguna mengunggah modul
(PDF/DOCX/TXT), lalu bisa meminta ringkasan, flashcard, latihan soal, bantuan
hafalan, dan bertanya tentang isi modul.

Stack sudah ditetapkan: Next.js (App Router, TypeScript) di Vercel, Supabase
(Postgres, Auth, Storage), dan Gemini API dari route server. Skema database
acuan ada di supabase/migrations/0001_init.sql. Baca juga skill supabase-database
dan vercel-deploy.

Buat dokumen rencana: struktur folder, daftar endpoint API, alur upload yang
menghindari batas 4,5 MB Vercel, strategi memecah pekerjaan Gemini agar aman dari
batas durasi, halaman UI, dan daftar tugas berurutan. Beri tahu jika ada bagian
skema yang menurut Anda perlu diubah, tapi jangan mengubahnya tanpa persetujuan.
Jangan menulis kode dulu.
```

### Tahap 2: Kerangka proyek dan backend dasar
```
Buat kerangka proyek Next.js sesuai rencana, termasuk .gitignore (pastikan .env*
tidak ter-commit, kecuali .env.example), helper klien Supabase (browser, server,
admin yang server-only), middleware sesi Auth, halaman login/daftar, dan
konfigurasi. Cek dokumentasi resmi untuk pola @supabase/ssr terbaru.
Lalu buat alur unggah: browser mengunggah langsung ke Supabase Storage dengan path
<user_id>/<uuid>.<ext>, membuat baris modules, lalu memanggil
POST /api/modules/:id/process yang mengunduh file dari Storage, mengekstrak teks
dari PDF/DOCX/TXT, memecah per bab ke module_chunks, dan mengubah status modul.
Pilih library ekstraksi PDF yang cocok untuk serverless Node.js.
Ikuti skill supabase-database dan vercel-deploy.
```

### Tahap 3: Integrasi Gemini
```
Ikuti skill gemini-api-integration dan prompt-templates.
Buat modul layanan Gemini (server-only) dengan generate_text dan generate_json,
fungsi render_prompt yang membaca folder prompts/, retry dengan backoff,
timeout, caching, dan penanganan error berbahasa Indonesia.
Cek dokumentasi resmi Google untuk SDK dan nama model terbaru sebelum menulis kode.
Buat route /api/generate dengan urutan: verifikasi pengguna, cek kepemilikan
modul, validasi input (zod), cek kuota harian di usage_log, cek cache di
generations, panggil Gemini, validasi hasil, simpan (service role). Atur maxDuration
eksplisit dan dukung streaming untuk tanya jawab dan ringkasan.
Buat tes dengan Gemini di-mock. Jangan memanggil API sungguhan di tes.
```

### Tahap 4: Fitur satu per satu
Jalankan workflow `add-feature` untuk tiap fitur, urutannya:
```
Jalankan workflow add-feature untuk fitur RINGKASAN (ikuti skill summarize-module).
```
```
Jalankan workflow add-feature untuk fitur FLASHCARD (ikuti skill generate-flashcards).
```
```
Jalankan workflow add-feature untuk fitur LATIHAN SOAL (ikuti skill generate-quiz),
termasuk validator JSON dan riwayat skor.
```
```
Jalankan workflow add-feature untuk fitur TANYA JAWAB dengan sumber bab,
memakai prompts/qa.md. Pastikan pertanyaan di luar modul dijawab
"Tidak ditemukan di modul."
```
```
Jalankan workflow add-feature untuk fitur BANTUAN HAFALAN (ikuti skill mnemonic-helper).
```

### Tahap 5: Antarmuka
```
Buat antarmuka yang nyaman di HP dan laptop, seluruh teks berbahasa Indonesia:
1. Halaman unggah modul dengan progres dan pesan error ramah.
2. Halaman modul berisi tab: Ringkasan, Flashcard, Latihan Soal, Tanya Jawab, Hafalan.
3. Ringkasan: bab bisa dilipat, istilah tebal menonjol, tombol salin.
4. Flashcard: ketuk untuk membalik, tombol Hafal/Belum, filter bab.
5. Kuis: satu soal per layar, penjelasan setelah menjawab, skor akhir,
   ulangi soal yang salah.
6. Mode gelap dan terang.
Output model harus ditampilkan lewat renderer Markdown yang aman.
```

### Tahap 6: Cache, kuota, dan riwayat
```
Pastikan semua fitur memakai cache tabel generations
(unik per user, modul, fitur, params_hash, prompt_version).
Aktifkan kuota harian dari DAILY_QUOTA_PER_USER dan pencatatan token ke usage_log.
Simpan flashcard ke tabel flashcards dengan pengulangan berjarak (box 1,3,7,14 hari)
dan hasil kuis ke quiz_attempts. Tambahkan halaman riwayat belajar.
Tampilkan sisa kuota harian di UI.
```

### Tahap 7: Pengujian dan keamanan
```
Jalankan workflow review-security pada seluruh proyek.
Lalu jalankan semua tes, perbaiki yang gagal, dan tulis laporan per butir
daftar periksa dengan perbaikan berurutan dari risiko tertinggi.
Tambahkan uji akses: akun B tidak boleh membaca modul, kartu, atau file milik akun A.
Terakhir buat README proyek: cara instal, cara menjalankan, dan variabel lingkungan.
```

### Tahap 8: Deploy ke Vercel
```
Jalankan workflow deploy-vercel. Berikan saya daftar langkah manual yang harus saya
lakukan sendiri (membuat proyek Supabase produksi, menjalankan migrasi, mengisi
environment variable di Vercel, mengatur redirect URL Auth, menghubungkan repo).
Jangan mengisi atau menulis rahasia apa pun. Setelah itu tuliskan daftar uji asap
untuk saya jalankan di URL produksi.
```

---

## Tips menggunakan prompt runtime
- Jadikan pengaturan pengguna sebagai variabel: `gaya`, `maks_poin`, `jumlah`, `tingkat`, `bab`.
- Uji dulu semua template di Google AI Studio dengan 2 sampai 3 modul contoh sebelum dimasukkan ke aplikasi.
- Hasil AI tetap perlu dicek manual, terutama untuk materi ujian penting.
