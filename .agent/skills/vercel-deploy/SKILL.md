---
name: vercel-deploy
description: Aturan membangun dan men-deploy aplikasi Next.js ke Vercel dengan Supabase dan Gemini: batas ukuran request, batas durasi fungsi, variabel lingkungan, streaming, membaca folder prompts di serverless, dan daftar periksa deploy. Gunakan setiap kali tugas menyangkut deploy, Vercel, environment variable, timeout 504, error 413, atau konfigurasi produksi.
---

# Vercel Deploy

Batas Vercel berubah dan berbeda per paket (Hobby/Pro). Sebelum mengandalkan angka, cek halaman "Vercel Functions Limits" di dokumentasi resmi dan pengaturan proyek di dashboard.

## Batas yang wajib dirancang
1. **Isi request/response maksimal 4,5 MB** (error 413). Konsekuensi: unggah file langsung ke Supabase Storage (lihat skill `supabase-database`), dan jangan mengirim seluruh isi modul dari browser ke API; kirim hanya ID modul lalu ambil teksnya dari database di server.
2. **Durasi fungsi terbatas** (error 504 bila lewat). Atur eksplisit per route yang memanggil Gemini, misalnya `export const maxDuration = 60;` (sesuaikan dengan paket Anda). Rancang agar tiap panggilan jauh di bawah batas:
   - pecah pekerjaan besar per bab; browser memanggil route satu bab per satu,
   - untuk tanya jawab dan ringkasan, gunakan **streaming** supaya pengguna melihat hasil bertahap,
   - kuis dan flashcard dibuat per kelompok (misal 10 per panggilan) lalu digabung.
3. Hindari proses berat dan panjang di route (ekstraksi PDF sangat besar). Batasi halaman/ukuran, dan beri status `processing` agar UI bisa menunggu.

## Variabel lingkungan
Isi di Vercel > Project Settings > Environment Variables, terpisah untuk Production, Preview, dan Development. Daftar ada di `.env.example`.
- Jangan pernah memakai awalan `NEXT_PUBLIC_` untuk `SUPABASE_SERVICE_ROLE_KEY` dan `GEMINI_API_KEY`.
- Gunakan proyek Supabase terpisah (atau minimal data terpisah) untuk Preview dan Production.
- Setelah mengubah variabel, deploy ulang agar berlaku.

## Membaca folder `prompts/` di serverless
Fungsi hanya membawa file yang terdeteksi dipakai. Bila memuat template dengan `fs.readFileSync(path.join(process.cwd(), 'prompts', nama))`, tambahkan folder itu ke pengaturan penyertaan file tracing Next.js (`outputFileTracingIncludes`; cek nama dan letak kunci di dokumentasi versi Next.js yang dipakai). Alternatif yang paling sederhana: simpan template sebagai modul TypeScript yang diimpor.

## Runtime
Pakai runtime Node.js untuk route yang memanggil Gemini dan mengekstrak dokumen. Jangan memakai Edge runtime untuk ekstraksi PDF.

## Kebijakan penyimpanan lokal
Sistem file fungsi bersifat sementara. Jangan menyimpan apa pun di disk lokal; semuanya ke Supabase.

## Daftar periksa sebelum deploy produksi
- [ ] Semua variabel lingkungan terisi di Production
- [ ] Migrasi Supabase sudah dijalankan di proyek produksi
- [ ] Redirect URL Auth Supabase menyertakan domain Vercel
- [ ] `maxDuration` diatur di semua route Gemini
- [ ] Upload besar tidak lewat fungsi Vercel
- [ ] Rate limit dan kuota aktif
- [ ] `npm run build` lulus lokal tanpa peringatan penting
- [ ] Workflow `review-security` sudah dijalankan

## Pemecahan masalah cepat
| Gejala | Kemungkinan sebab |
|---|---|
| 413 FUNCTION_PAYLOAD_TOO_LARGE | File/teks dikirim lewat route; pindahkan ke Storage |
| 504 FUNCTION_INVOCATION_TIMEOUT | Panggilan Gemini terlalu panjang; pecah per bab, naikkan maxDuration sesuai paket, atau pakai streaming |
| Prompt tidak ditemukan di produksi | Folder `prompts/` tidak ikut ter-bundle |
| Login berhasil lokal tapi gagal di produksi | Redirect URL / site URL Supabase belum berisi domain Vercel |
| Data kosong padahal ada | Kebijakan RLS menolak; cek sesi pengguna terkirim |
