---
name: supabase-database
description: Aturan memakai Supabase (Postgres, Auth, Storage, Row Level Security) di proyek ini: skema, migrasi, kebijakan RLS, upload file langsung ke Storage, kapan boleh memakai service role. Gunakan setiap kali tugas menyentuh database, tabel, query, migrasi, login/auth, penyimpanan file, kebijakan akses, atau kuota pemakaian, walaupun pengguna hanya menyebut "simpan data".
---

# Supabase Database

Skema acuan ada di `supabase/migrations/0001_init.sql`. Baca dulu sebelum mengubah apa pun.

## Aturan emas
1. Semua tabel di schema `public` WAJIB `enable row level security` dan punya kebijakan eksplisit.
2. Klien browser dan server atas nama pengguna memakai **anon key + sesi pengguna**, sehingga RLS berlaku.
3. **Service role key** melewati RLS. Pakai HANYA di server untuk dua hal: menulis `generations` dan `usage_log`. Jangan dipakai untuk membaca data pengguna "demi mudah". Jangan pernah diberi awalan `NEXT_PUBLIC_`.
4. Setiap query data pengguna tetap menyaring `user_id` secara eksplisit, selain mengandalkan RLS (lapis ganda).
5. Perubahan skema selalu lewat file migrasi baru di `supabase/migrations/` (urut nomor), bukan mengubah dashboard secara manual dan bukan mengedit migrasi lama yang sudah dijalankan.

## Klien Supabase
- Pakai paket resmi `@supabase/supabase-js` dan `@supabase/ssr` untuk Next.js (sesi lewat cookie). Cek dokumentasi resmi untuk pola terbaru.
- Buat tiga helper terpisah: `createBrowserClient()`, `createServerClient()` (dengan cookie pengguna), dan `createAdminClient()` (service role, ada di file yang ditandai `server-only`).
- Di route server, ambil pengguna dengan pengecekan ke server Auth (bukan hanya membaca cookie tanpa verifikasi) dan tolak dengan 401 bila tidak ada.

## Upload file (penting karena batas Vercel)
Fungsi Vercel menolak isi request di atas 4,5 MB, jadi **file tidak boleh dikirim lewat route Next.js**. Alurnya:
1. Browser mengunggah langsung ke bucket `modules` lewat Supabase Storage dengan sesi pengguna. Path wajib `<user_id>/<uuid>.<ext>`.
2. Browser membuat baris `modules` (status `uploaded`).
3. Browser memanggil `POST /api/modules/:id/process` (isi request kecil, hanya ID).
4. Server mengunduh file dari Storage, mengekstrak teks, memecah per bab ke `module_chunks`, menghitung `content_hash`, lalu mengubah status menjadi `ready` (atau `failed` + `error_message`).
Bucket bersifat privat. Batas ukuran dan tipe file diberlakukan di bucket DAN di server.

## Cache dan kuota
- Cache: tabel `generations`, kunci unik `(user_id, module_id, feature, params_hash, prompt_version)`. Cek sebelum memanggil Gemini; simpan setelahnya.
- Kuota: hitung baris `usage_log` pengguna dalam 24 jam terakhir sebelum memanggil Gemini; tolak dengan pesan ramah bila melewati `DAILY_QUOTA_PER_USER`.

## Koneksi dan performa
- Di serverless, pakai klien HTTP bawaan supabase-js (otomatis lewat API). Bila suatu saat memakai koneksi Postgres langsung, gunakan alamat pooler Supabase, bukan koneksi langsung.
- Buat indeks untuk kolom yang sering difilter (sudah ada di migrasi awal).

## Pemeriksaan sebelum selesai
- [ ] Tabel baru: RLS aktif + kebijakan ada
- [ ] Tidak ada service role key di kode klien atau variabel `NEXT_PUBLIC_*`
- [ ] Migrasi baru berupa file baru, bisa dijalankan dari nol
- [ ] Uji manual: pengguna B tidak bisa membaca data pengguna A
