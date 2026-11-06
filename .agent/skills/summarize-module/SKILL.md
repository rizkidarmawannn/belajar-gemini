---
name: summarize-module
description: Aturan baku membuat dan mengubah fitur ringkasan modul belajar (per bab, ringkasan super singkat, bagian "Wajib Diingat"). Gunakan skill ini setiap kali tugas menyentuh ringkasan, rangkuman, summary, template prompt ringkasan, atau tampilan ringkasan di UI, walaupun pengguna tidak menyebut kata "skill".
---

# Summarize Module

## Tujuan
Ringkasan harus enak dibaca dan mudah dihafal, setia pada modul, dan tidak menambah fakta dari luar.

## Struktur ringkasan per bab (wajib)
1. Judul bab (sesuai modul, urutan tidak boleh diubah)
2. **Inti bab**: tepat 1 kalimat
3. Poin penting: bullet, satu ide per poin, kalimat pendek
4. Istilah penting dicetak **tebal** + definisi singkat
5. Di akhir seluruh ringkasan: bagian **Wajib Diingat** berisi 5 sampai 8 poin

## Dua gaya
- `singkat`: inti bab + poin terpenting saja
- `lengkap`: ditambah contoh dan rumus yang ada di modul

## Langkah kerja saat mengubah fitur ini
1. Baca `prompts/summary.md` dan `prompts/summary-short.md`. Jangan ubah isinya tanpa mengikuti skill `prompt-templates`.
2. Untuk modul panjang, pecah per bab lalu ringkas satu per satu, kemudian gabungkan. Jangan memasukkan modul yang melebihi batas ukuran sekaligus.
3. Simpan hasil di cache dengan kunci: `hash(isi_modul) + gaya + maks_poin + versi_prompt`.
4. Tampilan UI: bab bisa dilipat, istilah tebal ditonjolkan, ada tombol salin dan tombol "jadikan flashcard".

## Larangan
- Jangan menambah fakta, angka, atau contoh yang tidak ada di modul.
- Jangan mengubah urutan bab.
- Jangan membuat ringkasan lebih panjang dari 30% isi modul pada gaya `singkat`.

## Pemeriksaan sebelum selesai
- [ ] Setiap bab modul punya bagian di ringkasan
- [ ] Ada bagian "Wajib Diingat"
- [ ] Tidak ada istilah yang tidak muncul di modul
- [ ] Hasil sudah disimpan di cache
