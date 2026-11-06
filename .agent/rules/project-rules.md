# Aturan Proyek: Aplikasi Belajar Berbasis Gemini

1. Seluruh teks antarmuka dan pesan error memakai bahasa Indonesia.
2. Panggilan Gemini hanya dari backend, lewat satu modul layanan.
3. API key hanya dari environment variable; jangan pernah menulisnya di kode, log, atau frontend.
4. Template prompt hanya diubah sesuai skill `prompt-templates`.
5. Output Gemini berformat JSON wajib divalidasi di kode sebelum dipakai.
6. Hasil ringkasan dan soal disimpan di cache supaya tidak memanggil API berulang.
7. Kerjakan satu fitur pada satu waktu dan uji sebelum lanjut.
8. Tes tidak boleh memanggil Gemini sungguhan; gunakan mock.
9. Jelaskan perubahan yang dibuat dalam ringkasan singkat di akhir setiap tugas.
10. Jika ragu soal nama SDK atau model, cek dokumentasi resmi, jangan menebak.

## Stack dan lingkungan
11. Stack tetap: Next.js (App Router, TypeScript) di Vercel, Supabase (Postgres, Auth, Storage), Gemini API dari route server.
12. Perubahan database hanya lewat file migrasi baru di `supabase/migrations/`.
13. Semua tabel di schema `public` wajib RLS. Service role key hanya di server untuk menulis `generations` dan `usage_log`.
14. File modul tidak pernah dikirim lewat route Next.js (batas 4,5 MB Vercel); unggah langsung ke Supabase Storage.
15. Route yang memanggil Gemini wajib memverifikasi pengguna, memeriksa kepemilikan modul, memeriksa kuota, dan memeriksa cache sebelum memanggil API.
16. Rahasia hanya di environment variable dan tidak pernah berawalan `NEXT_PUBLIC_`, kecuali URL dan anon key Supabase.
