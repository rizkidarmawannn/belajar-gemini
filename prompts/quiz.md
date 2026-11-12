TUGAS: Buat TEPAT {{jumlah}} soal pilihan ganda unik dari modul sesuai tingkat kesulitan yang diminta (array "soal" WAJIB berisi tepat {{jumlah}} butir, jangan kurang).

PARAMETER
- Tingkat kesulitan: {{tingkat}}       (mudah | sedang | sulit | campuran)
- Bab yang dicakup: {{bab}}            (semua | nama bab tertentu)
- Mode penjelasan: {{mode_penjelasan}} (modul | luar_modul | keduanya)

ATURAN KERAS TINGKAT KESULITAN ({{tingkat}})
- Jika `{{tingkat}}` adalah `mudah`, `sedang`, atau `sulit` (BUKAN `campuran`):
  * SELURUH (100%) dari {{jumlah}} soal WAJIB memiliki `"tingkat": "{{tingkat}}"`.
  * DILARANG KERAS mencampurkan soal dari tingkat lain (misalnya bila `{{tingkat}} = sulit`, DILARANG membuat soal `mudah` atau `sedang`).
- Hanya jika `{{tingkat}}` = `campuran`: bagilah proporsional antara `mudah`, `sedang`, dan `sulit`.

KRITERIA BOBOT KOGNITIF TIAP TINGKAT
- `"sulit"` (Analisis Kasus & HOTS):
  * WAJIB berbentuk skenario nyata/studi kasus, analisis sebab-akibat multi-konsep, pemecahan masalah terapan, atau evaluasi syarat/pengecualian dalam modul.
  * DILARANG membuat soal hafalan dangkal seperti "Apa definisi...", "Apa kepanjangan...", atau sekadar mencocokkan istilah sederhana bila diminta tingkat `sulit`.
  * Keempat opsi (A–D) harus konseptual dan menuntut analisis teliti, bukan tebakan permukaan.
- `"sedang"` (Pemahaman & Perbandingan):
  * Menguji pemahaman hubungan antarkonsep, perbedaan fungsi/langkah, atau interpretasi ketentuan dalam modul.
- `"mudah"` (Ingatan & Konsep Dasar):
  * Menguji definisi dasar, istilah pokok, atau identifikasi fakta yang tertulis langsung di modul.

ATURAN KUALITAS SOAL
- 4 opsi per soal (A, B, C, D), tepat SATU jawaban benar.
- Pengecoh (distraktor) harus masuk akal, sejenis, dan panjangnya mirip jawaban benar.
- Dilarang memakai opsi "semua jawaban benar" atau "tidak ada yang benar".
- Posisi jawaban benar harus tersebar acak.
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

FORMAT OUTPUT: JSON valid saja, tanpa teks lain.
Pastikan nilai field `"tingkat"` pada SETIAP objek soal persis `"{{tingkat}}"` jika parameter bukan `"campuran"` (jika `"campuran"`, gunakan `"mudah"`, `"sedang"`, atau `"sulit"` sesuai soalnya):
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
      "tingkat": "sulit"
    }
  ]
}

<modul>
{{modul}}
</modul>

PENGINGAT AKHIR: Parameter tingkat kesulitan yang diminta adalah "{{tingkat}}". Bila bukan "campuran", pastikan SEMUA {{jumlah}} soal bertingkat "{{tingkat}}" dan berjenis kognitif sesuai kriteria "{{tingkat}}".
