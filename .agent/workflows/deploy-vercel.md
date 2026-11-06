---
description: Menyiapkan dan men-deploy proyek ke Vercel dengan Supabase
---

1. Baca skill `vercel-deploy` dan `supabase-database`.
2. Jalankan `npm run build` dan perbaiki semua error.
3. Jalankan workflow `review-security`.
4. Periksa `.env.example` sudah lengkap dan tidak ada rahasia asli di repo.
5. Tuliskan untuk pengguna daftar langkah manual (agent tidak boleh mengisi rahasia sendiri):
   - membuat proyek Supabase produksi dan menjalankan migrasi,
   - mengisi environment variable di Vercel (Production dan Preview),
   - menambahkan domain Vercel ke URL redirect Auth Supabase,
   - menghubungkan repo ke Vercel dan melakukan deploy.
6. Setelah deploy, tulis daftar uji asap: daftar akun, unggah modul kecil, ringkasan, kuis, tanya jawab di luar modul ("Tidak ditemukan di modul."), dan uji akses antar dua akun.
