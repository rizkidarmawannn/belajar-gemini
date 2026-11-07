# Belajar Cerdas — Asisten Belajar Interaktif Berbasis AI

Aplikasi asisten belajar cerdas berbasis web yang memanfaatkan **Google Gemini API**, **Next.js 15 (App Router)**, **TypeScript**, dan **Supabase (PostgreSQL, Auth, Storage dengan Row Level Security)**. Pengguna dapat mengunggah dokumen modul materi (PDF, DOCX, TXT), dan sistem akan mengekstrak, membagi bab, serta menyediakan fitur belajar interaktif: Ringkasan AI, Flashcard Sistem Leitner (Spaced Repetition), Kuis Pilihan Ganda Interaktif, Tanya Jawab Kontekstual Berbasis Modul, Bantuan Jembatan Keledai (Mnemonic), dan Evaluasi Esai Otomatis.

---

## 1. Persyaratan Sistem
- **Node.js**: Versi `>= 20.0.0` (disarankan Node.js v20 LTS atau v22 LTS yang selaras dengan environment Vercel)
- **NPM**: Versi `>= 10.0.0`
- **Akun Supabase**: Proyek aktif dengan database Postgres, Auth, dan Storage
- **Google AI Studio API Key**: Akses Gemini API (`gemini-2.5-flash` atau `gemini-1.5-flash`)

---

## 2. Instalasi dan Menjalankan Lokal

1. **Clone atau Buka Folder Proyek**:
   ```bash
   cd "ai bantu belajar"
   ```

2. **Pasang Dependensi**:
   ```bash
   npm install
   ```

3. **Salin dan Konfigurasi Environment Variable**:
   ```bash
   cp .env.example .env.local
   ```
   Buka file `.env.local` dan isi nilainya (lihat rincian di Bagian 3).

4. **Jalankan Development Server**:
   ```bash
   npm run dev
   ```
   Aplikasi akan berjalan di **`http://localhost:3000`**.
   > **Perhatian**: Pastikan selalu membuka `http://localhost:3000` di peramban Anda. Hindari membuka port lama seperti `3001` agar mendapatkan versi aplikasi terbaru.

5. **Menjalankan Pengujian Otomatis**:
   ```bash
   npm test
   ```

6. **Membangun Versi Produksi (Production Build)**:
   ```bash
   npm run build
   ```

---

## 3. Konfigurasi Variabel Lingkungan (`.env.local`)

Salin dari `.env.example` dan sesuaikan nilainya:

```env
# -----------------------------------------------------------------------------
# SUPABASE CONFIGURATION
# -----------------------------------------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=https://proyek-anda.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=masukkan_anon_key_supabase_anda

# KUNCI RAHASIA SERVER (JANGAN PERNAH DIKOMIT ATAU DITAMPILKAN DI CLIENT!)
SUPABASE_SERVICE_ROLE_KEY=masukkan_service_role_key_supabase_anda

# -----------------------------------------------------------------------------
# GOOGLE GEMINI API CONFIGURATION
# -----------------------------------------------------------------------------
# Dapatkan dari Google AI Studio (https://aistudio.google.com/)
GEMINI_API_KEY=masukkan_api_key_gemini_anda

# Nama model yang digunakan untuk inferensi
GEMINI_MODEL=gemini-2.5-flash

# Versi cache template prompt (increment jika mengubah isi file di folder prompts/)
PROMPT_VERSION=1

# Batas kuota inferensi harian per pengguna (0 = tanpa batas)
DAILY_QUOTA_PER_USER=30

# -----------------------------------------------------------------------------
# FITUR PENGATURAN AKSES (OPSI A: PERSONAL / GRUP TERBATAS)
# -----------------------------------------------------------------------------
# Set ke false untuk menyembunyikan formulir pendaftaran publik di UI login
NEXT_PUBLIC_ENABLE_SIGNUP=false

# Set ke false jika ingin menggunakan Login Kata Sandi (bebas batas email SMTP)
NEXT_PUBLIC_ENABLE_MAGIC_LINK=false
```

---

## 4. Urutan Eksekusi Migrasi Database Supabase

Sebelum menjalankan aplikasi, Anda **WAJIB** mengeksekusi file migrasi SQL di **Supabase Dashboard > SQL Editor** sesuai urutan berikut:

### Langkah 1: Jalankan `supabase/migrations/0001_init.sql`
- Membuat tabel inti: `modules`, `module_chunks`, `generations`, `flashcards`, `quiz_attempts`, dan `usage_log`.
- Mengaktifkan Row Level Security (RLS) pada seluruh tabel.
- Mengonfigurasi bucket penyimpanan privat `modules` dengan batas ukuran 10 MB dan kebijakan akses per folder `<user_id>/...`.

### Langkah 2: Jalankan `supabase/migrations/0002_reserve_usage.sql`
- Membuat fungsi atomik `reserve_usage(p_user_id, p_feature, p_limit, p_tokens_in)` untuk mencegah race condition kuota pada panggilan paralel.

### Langkah 3: Jalankan `supabase/migrations/0003_reserve_usage_unlimited.sql`
- Memperbarui fungsi `reserve_usage` agar mendukung mode tanpa batas kuota (`DAILY_QUOTA_PER_USER=0`) saat `p_limit <= 0`.
- Mempertahankan advisory lock atomik, `security definer`, dan hak akses khusus `service_role`.

---

## 5. Manajemen Pengguna & Keamanan (Opsi A: Personal / Kelompok Kecil)

Untuk penggunaan personal atau kelompok belajar kecil tanpa gangguan kuota SMTP:

1. **Registrasi Akun Pertama**:
   - Nyalakan sementara `NEXT_PUBLIC_ENABLE_SIGNUP=true` di `.env.local` atau buat akun langsung melalui **Supabase Dashboard > Authentication > Users > Add user > Create user (masukkan email & kata sandi)**.
2. **Kunci Pendaftaran Publik**:
   - Buka **Supabase Dashboard > Authentication > Providers > Email**:
     - Matikan (uncheck) **"Enable Signups"** agar tidak ada orang asing yang bisa membuat akun baru.
     - Pastikan **"Confirm email"** dimatikan jika ingin pengguna langsung login dengan kata sandi tanpa menunggu email konfirmasi.
   - Di file `.env.local` / Vercel Environment Variables, set `NEXT_PUBLIC_ENABLE_SIGNUP=false` agar formulir pendaftaran tidak muncul di UI.
3. **Login Menggunakan Email & Kata Sandi**:
   - Metode ini melewati batasan built-in email Supabase Free Tier (yang dibatasi hanya 2 email/jam).

---

## 6. Panduan Deploy ke Vercel

1. **Persiapan Git Repository**:
   - Pastikan repository GitHub Anda berstatus **Private**.
   - Jangan pernah menyertakan file `.env` atau `.env.local` ke dalam git.

2. **Impor Proyek ke Vercel**:
   - Buka Dashboard [Vercel](https://vercel.com) > **Add New Project** > Impor repo Anda.
   - Framework Preset: **Next.js**.
   - Build Command: `npm run build` (default).
   - Install Command: `npm install` (default).

3. **Konfigurasi Environment Variables di Vercel**:
   Masukkan variabel-variabel berikut di **Project Settings > Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Hanya untuk Production/Preview, server-only)
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (misal: `gemini-2.5-flash`)
   - `PROMPT_VERSION` (misal: `1`)
   - `DAILY_QUOTA_PER_USER` (`30` atau `0` untuk mode tanpa batas)
   - `NEXT_PUBLIC_ENABLE_SIGNUP` (`false`)
   - `NEXT_PUBLIC_ENABLE_MAGIC_LINK` (`false`)

4. **Konfigurasi Supabase Auth Redirect URLs**:
   - Buka **Supabase Dashboard > Authentication > URL Configuration**.
   - **Site URL**: `https://nama-aplikasi-anda.vercel.app`
   - **Redirect URLs**: Tambahkan `https://nama-aplikasi-anda.vercel.app/**` dan `https://nama-aplikasi-anda.vercel.app/auth/callback`.

---

## 7. Arsitektur Keamanan & Fitur Teknis

1. **Direct Storage Upload (Bypass Vercel 4.5 MB Limit)**:
   - File dokumen diunggah langsung dari peramban ke Supabase Storage (bucket privat) dengan UUID acak di bawah namespace pengguna (`<user_id>/<file_id>.<ext>`). Route Vercel hanya menerima ID modul untuk memproses teks.
2. **Bundling Template Prompt Otomatis**:
   - `next.config.ts` dikonfigurasi dengan `outputFileTracingIncludes: { '/api/**/*': ['./prompts/**/*'] }` sehingga seluruh file Markdown di folder `prompts/` terangkut secara otomatis ke serverless lambda Vercel.
3. **Pencegahan Header Bloat (`X-Used-Chapters`)**:
   - Untuk modul berukuran $\le 60.000$ karakter, header hanya mengirim objek ringkas `{ mode: 'all', count: N }` yang di-encode URI sehingga ukuran header sangat kecil (~35 bytes), aman dari batas HTTP header server.
4. **Proteksi Kuota & Race Condition**:
   - Fungsi `reserve_usage` mengeksekusi pengecekan kuota harian secara atomik di level Postgres sebelum Gemini dipanggil. Jika kuota habis, permintaan langsung ditolak `429` tanpa membebani Gemini API.
5. **Sanitasi Prompt & Keamanan Render**:
   - Input modul disanitasi dari variasi tag `</modul>` untuk mencegah prompt injection.
   - Output AI dirender menggunakan `react-markdown` yang diperkuat dengan `rehype-sanitize` untuk mencegah eksekusi skrip jahat (XSS).
