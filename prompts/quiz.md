TUGAS: Buat {{jumlah}} soal pilihan ganda dari modul.

PARAMETER
- Tingkat kesulitan: {{tingkat}}   (mudah | sedang | sulit | campuran)
- Bab yang dicakup: {{bab}}        (semua | nama bab tertentu)

ATURAN KUALITAS
- 4 opsi per soal (A, B, C, D), tepat SATU jawaban benar.
- Pengecoh (distraktor) harus masuk akal, sejenis, dan panjangnya mirip jawaban benar.
- Dilarang memakai opsi "semua jawaban benar" atau "tidak ada yang benar".
- Posisi jawaban benar harus tersebar acak.
- Soal "mudah": ingatan/definisi. "sedang": pemahaman/perbandingan. "sulit": penerapan atau analisis kasus.
- Tiap soal wajib punya penjelasan singkat mengapa jawaban benar dan mengapa pengecoh salah.
- Cantumkan bab sumber. Hanya dari isi modul.

FORMAT OUTPUT: JSON valid saja, tanpa teks lain:
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

<modul>
{{modul}}
</modul>
