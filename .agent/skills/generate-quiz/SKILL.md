---
name: generate-quiz
description: Standar membuat, memvalidasi, dan menampilkan soal latihan (pilihan ganda, kuis, ujian latihan, penilaian jawaban esai) dari modul belajar dalam format JSON baku. Gunakan setiap kali tugas menyangkut soal, kuis, quiz, latihan, skor, kunci jawaban, atau evaluasi jawaban pengguna.
---

# Generate Quiz

## Aturan kualitas soal
- 4 opsi (A sampai D), tepat satu jawaban benar.
- Pengecoh harus masuk akal, sejenis, dan panjangnya mirip jawaban benar.
- Dilarang opsi "semua benar" atau "tidak ada yang benar".
- Posisi kunci tersebar acak.
- Tingkat: mudah (ingatan), sedang (pemahaman), sulit (penerapan/analisis).
- Setiap soal wajib: penjelasan, bab sumber, tingkat.

## Format JSON baku
```json
{
  "soal": [
    {
      "nomor": 1,
      "pertanyaan": "...",
      "opsi": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "kunci": "B",
      "penjelasan": "...",
      "bab": "...",
      "tingkat": "sedang"
    }
  ]
}
```

## Validasi di kode (wajib, jangan percaya output model mentah)
1. Parse JSON; bila gagal, hapus pagar kode lalu coba lagi; bila masih gagal, ulangi panggilan maksimal 2 kali.
2. Cek: ada 4 opsi, `kunci` salah satu dari A-D, semua field terisi.
3. Buang soal yang opsinya duplikat atau yang pertanyaannya sama dengan soal lain.
4. Jika jumlah soal valid kurang dari yang diminta, minta tambahan hanya selisihnya.

## Perilaku UI kuis
- Satu soal per layar, indikator progres.
- Setelah menjawab: tampilkan benar/salah + penjelasan, lalu tombol lanjut.
- Akhir kuis: skor, daftar soal yang salah, tombol "ulangi soal yang salah" dan "buat soal baru".
- Simpan riwayat skor per modul untuk melihat perkembangan.

## Evaluasi jawaban esai
Gunakan `prompts/essay-eval.md`. Rubrik: ketepatan 50, kelengkapan 30, kejelasan 20. Tampilkan skor dengan rincian, bukan angka saja.

## Pemeriksaan sebelum selesai
- [ ] Output sudah lolos validasi kode
- [ ] Ada tes unit untuk validator
- [ ] Soal yang sama tidak muncul dua kali
