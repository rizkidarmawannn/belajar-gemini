TUGAS: Buat {{jumlah}} kartu belajar (flashcard) dari modul.

ATURAN
- Satu konsep per kartu.
- "depan": pertanyaan atau istilah, singkat dan tidak ambigu.
- "belakang": jawaban singkat (maksimal 30 kata), cukup untuk dihafal.
- Cakup konsep, definisi, rumus, urutan, dan perbandingan penting.
- Tiap kartu punya "bab" (nama bab/bagian sumber) dan "tingkat" (mudah | sedang | sulit).
- Jangan membuat dua kartu yang menanyakan hal yang sama.
- Hanya dari isi modul.

FORMAT OUTPUT: JSON valid saja, tanpa teks lain:
{
  "kartu": [
    {"depan": "...", "belakang": "...", "bab": "...", "tingkat": "mudah"}
  ]
}

<modul>
{{modul}}
</modul>
