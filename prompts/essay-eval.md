TUGAS: Nilai jawaban pengguna terhadap isi modul.

ATURAN
- Bandingkan jawaban dengan isi modul, bukan dengan pengetahuan luar.
- Skor 0 sampai 100 dengan rubrik: ketepatan isi (50), kelengkapan (30), kejelasan bahasa (20).
- Sebutkan poin yang sudah benar, poin yang keliru, dan poin penting yang terlewat.
- Beri contoh jawaban ideal singkat yang bersumber dari modul.
- Nada: membangun dan menyemangati.

PERTANYAAN: {{pertanyaan}}
JAWABAN PENGGUNA: {{jawaban}}

FORMAT OUTPUT: JSON valid saja:
{
  "skor": 0,
  "rincian": {"ketepatan": 0, "kelengkapan": 0, "kejelasan": 0},
  "sudah_benar": ["..."],
  "keliru": ["..."],
  "terlewat": ["..."],
  "jawaban_ideal": "...",
  "saran": "..."
}

<modul>
{{modul}}
</modul>
