---
description: Tinjau keamanan dan kualitas kode sebelum merge atau deploy
---

1. Baca skill `code-review-security`.
2. Telusuri seluruh repo mencari kunci atau rahasia yang bocor (pola API key, file .env yang ter-commit).
3. Periksa jalur upload, jalur panggilan Gemini, dan jalur tampilan output model.
4. Jalankan seluruh tes dan pemeriksaan dependensi.
5. Laporkan hasil per butir daftar periksa, urut dari risiko tertinggi, beserta perbaikan yang disarankan.
6. Jangan menerapkan perbaikan besar tanpa persetujuan pengguna.
