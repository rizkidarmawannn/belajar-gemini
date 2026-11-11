TUGAS: Buat {{jumlah}} soal pilihan ganda dari modul.

PARAMETER
- Tingkat kesulitan: {{tingkat}}       (mudah | sedang | sulit | campuran)
- Bab yang dicakup: {{bab}}            (semua | nama bab tertentu)
- Mode penjelasan: {{mode_penjelasan}} (modul | luar_modul | keduanya)

ATURAN KUALITAS SOAL
- 4 opsi per soal (A, B, C, D), tepat SATU jawaban benar.
- Pengecoh (distraktor) harus masuk akal, sejenis, dan panjangnya mirip jawaban benar.
- Dilarang memakai opsi "semua jawaban benar" atau "tidak ada yang benar".
- Posisi jawaban benar harus tersebar acak.
- Soal "mudah": ingatan/definisi. "sedang": pemahaman/perbandingan. "sulit": penerapan atau analisis kasus.
- Pertanyaan, seluruh opsi jawaban, kunci jawaban, dan nama bab sumber wajib berasal HANYA dari isi modul.

ATURAN PENJELASAN SESUAI MODE ({{mode_penjelasan}})
- Tulis penjelasan dengan rapi: tebalkan **istilah penting** dan gunakan baris baru (`\n`) untuk memisahkan alasan kunci jawaban dengan `Contoh:` agar mudah dibaca (jangan menumpuk semua ke satu kalimat rapat).
- Jika `mode_penjelasan` = `modul`:
  * Isi `penjelasan` hanya dari isi modul (mengapa jawaban benar sesuai modul, alasan singkat opsi pengecoh salah, dan contoh/aturan modul jika ada).
  * Set `sumber_penjelasan` = `"modul"`. Tidak perlu mengisi `penjelasan_modul` atau `penjelasan_luar`.
- Jika `mode_penjelasan` = `luar_modul`:
  * Pertanyaan dan kunci tetap dari modul, tetapi isi `penjelasan` dengan pengetahuan umum ilmiah tepercaya, analogi sederhana, dan `Contoh:` penerapan nyata di luar modul agar siswa benar-benar memahami konsepnya.
  * Set `sumber_penjelasan` = `"luar_modul"`. Tidak perlu mengisi `penjelasan_modul` atau `penjelasan_luar`.
- Jika `mode_penjelasan` = `keduanya`:
  * Isi `penjelasan_modul` secara ringkas-jelas hanya dari isi modul (rujukan konsep/aturan modul).
  * Isi `penjelasan_luar` secara ringkas-jelas dari luar modul (analogi sederhana dan `Contoh:` nyata di kehidupan sehari-hari).
  * Isi `penjelasan` dengan ringkasan padat 1–2 kalimat yang merangkum inti kunci jawaban.
  * Set `sumber_penjelasan` = `"keduanya"`.

FORMAT OUTPUT: JSON valid saja, tanpa teks lain:
{
  "soal": [
    {
      "nomor": 1,
      "pertanyaan": "...",
      "opsi": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "kunci": "B",
      "penjelasan": "...",
      "penjelasan_modul": "...",
      "penjelasan_luar": "...",
      "sumber_penjelasan": "modul",
      "bab": "...",
      "tingkat": "sedang"
    }
  ]
}

<modul>
{{modul}}
</modul>
