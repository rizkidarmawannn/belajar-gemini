---
description: Menambah fitur belajar baru (misalnya ringkasan, flashcard, kuis) dengan urutan baku
---

1. Baca `.agent/rules/` dan skill yang relevan (`gemini-api-integration`, `prompt-templates`, dan skill fitur terkait).
2. Tulis rencana singkat: tujuan, file yang berubah, skema data. Tunggu persetujuan pengguna.
3. Buat atau ubah template di `prompts/` bila perlu, naikkan `PROMPT_VERSION`.
4. Tambah endpoint backend + validator + cache.
5. Tulis tes (Gemini di-mock) dan jalankan sampai lulus.
6. Tambah komponen UI dan hubungkan ke endpoint.
7. Jalankan workflow `review-security`.
8. Tulis ringkasan perubahan dan cara mencoba fitur.
