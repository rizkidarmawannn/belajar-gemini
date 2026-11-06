---
name: generate-flashcards
description: Standar membuat dan menampilkan flashcard (kartu belajar, kartu hafalan, spaced repetition) dari modul belajar. Gunakan setiap kali tugas menyangkut flashcard, kartu belajar, mode balik kartu, hafalan istilah, atau pengulangan berjarak.
---

# Generate Flashcards

## Standar kartu
- Satu konsep per kartu.
- Depan: pertanyaan atau istilah, singkat, tidak ambigu.
- Belakang: maksimal 30 kata.
- Wajib ada `bab` dan `tingkat` (mudah | sedang | sulit).
- Tidak boleh ada dua kartu yang menanyakan hal sama.

## Format JSON baku
```json
{"kartu": [{"depan": "...", "belakang": "...", "bab": "...", "tingkat": "mudah"}]}
```

## Validasi di kode
1. Parse JSON dan buang kartu yang `depan` atau `belakang` kosong.
2. Deduplikasi berdasarkan teks `depan` yang dinormalisasi (huruf kecil, tanpa tanda baca).
3. Batasi `belakang` 30 kata; bila lebih, tandai untuk diringkas ulang.

## Perilaku UI
- Ketuk untuk membalik kartu.
- Tombol "Hafal" dan "Belum": kartu "Belum" muncul lebih sering.
- Pengulangan berjarak sederhana: kartu yang benar dijadwalkan 1, 3, 7, lalu 14 hari; kartu yang salah kembali ke 1 hari.
- Filter per bab dan per tingkat; opsi acak urutan.
- Simpan status tiap kartu per pengguna.

## Pemeriksaan sebelum selesai
- [ ] Kartu lolos validasi
- [ ] Status hafal tersimpan
- [ ] Filter bab berfungsi
