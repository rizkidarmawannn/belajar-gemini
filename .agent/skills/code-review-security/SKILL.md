---
name: code-review-security
description: Daftar periksa keamanan dan kualitas untuk meninjau kode aplikasi belajar (kebocoran API key, validasi upload file, rate limit, privasi data pengguna, prompt injection). Gunakan sebelum merge, sebelum deploy, atau saat diminta meninjau, mengaudit, atau mengamankan kode, juga setelah menambah fitur upload atau panggilan API.
---

# Code Review Security

Jalankan daftar ini dan laporkan hasilnya per butir (lulus / gagal / tidak berlaku), lengkap dengan nama file dan baris untuk yang gagal.

## 1. Rahasia
- [ ] Tidak ada API key atau password di kode, riwayat commit, log, atau frontend
- [ ] `.env` ada di `.gitignore`; ada `.env.example` tanpa nilai asli
- [ ] Error tidak membocorkan key atau stack trace ke pengguna

## 2. Upload file
- [ ] Tipe file dibatasi (PDF, DOCX, TXT) dan dicek dari isi, bukan hanya ekstensi
- [ ] Ukuran maksimum diberlakukan di server
- [ ] Nama file disanitasi; file disimpan di luar folder publik dengan nama acak
- [ ] Batas jumlah halaman/teks setelah ekstraksi
- [ ] File dihapus sesuai kebijakan retensi

## 3. Akses dan data
- [ ] Setiap modul, ringkasan, dan skor terikat ke pemilik; pengguna lain tidak bisa mengaksesnya (cek ID di sisi server)
- [ ] Query database memakai parameter, bukan penggabungan string
- [ ] Kata sandi (bila ada) di-hash dengan algoritma modern
- [ ] Pengguna bisa menghapus modul dan datanya

## 4. Batas pemakaian
- [ ] Rate limit per pengguna dan per IP
- [ ] Kuota harian panggilan Gemini
- [ ] Timeout dan batas ukuran request

## 5. Prompt injection
- [ ] Isi modul dibungkus tag dan diperlakukan sebagai data
- [ ] Output model tidak pernah dijalankan sebagai kode
- [ ] Output model di-escape saat ditampilkan (cegah XSS dari Markdown/HTML)

## 6. Kualitas
- [ ] Ada tes untuk validator JSON dan render prompt
- [ ] Gemini di-mock di tes
- [ ] Pesan error ramah dan berbahasa Indonesia
- [ ] Dependensi diperiksa kerentanannya

## Format laporan
Ringkasan 3 baris, tabel butir, lalu daftar perbaikan berurutan dari risiko tertinggi.

## 7. Supabase
- [ ] Semua tabel `public` punya RLS aktif dan kebijakan (cek migrasi)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di file `server-only`, tidak pernah di komponen klien
- [ ] Bucket `modules` privat; path file diawali `<user_id>/`
- [ ] Route API memverifikasi pengguna dan kepemilikan `module_id` sebelum bekerja
- [ ] `generations` dan `usage_log` tidak bisa ditulis oleh klien biasa
- [ ] Auth: redirect URL hanya domain yang dikenal

## 8. Vercel
- [ ] Tidak ada rahasia berawalan `NEXT_PUBLIC_`
- [ ] Tidak ada file/teks besar dikirim lewat route (batas 4,5 MB)
- [ ] `maxDuration` diatur dan panggilan Gemini dipecah
- [ ] Variabel Preview dan Production terpisah
