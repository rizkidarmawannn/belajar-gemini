/**
 * Pemilih bab relevan cerdas untuk fitur QA seluruh modul
 * Memilih 3 hingga 5 bab terbaik berdasarkan kecocokan kata kunci pertanyaan
 * terhadap chapter_title dan isi teks chunk, dengan batas akumulasi karakter yang aman.
 */

export interface ChunkItem {
  id?: string;
  position: number;
  chapter_title: string;
  content: string;
}

export interface UsedChapterInfo {
  position: number;
  chapter_title: string;
}

export interface SelectChaptersResult {
  selectedChunks: ChunkItem[];
  usedChapters: UsedChapterInfo[];
  totalChars: number;
  hasMatch: boolean;
}

const INDONESIAN_STOP_WORDS = new Set([
  'apa',
  'apakah',
  'bagaimana',
  'mengapa',
  'kenapa',
  'siapa',
  'kapan',
  'dimana',
  'mana',
  'yang',
  'dan',
  'di',
  'ke',
  'dari',
  'pada',
  'untuk',
  'buat',
  'adalah',
  'yaitu',
  'yakni',
  'ini',
  'itu',
  'dalam',
  'atas',
  'bawah',
  'bisa',
  'dapat',
  'ada',
  'sebutkan',
  'jelaskan',
  'tuliskan',
  'berikan',
  'uraikan',
  'tentang',
  'mengenai',
  'secara',
  'dengan',
  'atau',
  'juga',
]);

export function extractKeywords(text: string): string[] {
  if (!text) return [];
  // Bersihkan tanda baca, ambil kata-kata alfanumerik panjang >= 2
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const keywords: string[] = [];
  for (const w of words) {
    if (!INDONESIAN_STOP_WORDS.has(w)) {
      keywords.push(w);
    }
  }

  // Jika semua kata tersaring oleh stop words, gunakan kata asli yang panjangnya >= 3
  if (keywords.length === 0) {
    return words.filter((w) => w.length >= 3);
  }

  return Array.from(new Set(keywords));
}

export function selectRelevantChapters(
  chunks: ChunkItem[],
  question: string,
  options?: {
    maxChapters?: number;
    maxChars?: number;
  }
): SelectChaptersResult {
  const maxChapters = options?.maxChapters ?? 4;
  const maxChars = options?.maxChars ?? 45000;

  if (!chunks || chunks.length === 0) {
    return { selectedChunks: [], usedChapters: [], totalChars: 0, hasMatch: false };
  }

  // Jika jumlah bab sedikit (<= maxChapters) dan total karakter di bawah batas, kirim semua
  const allChars = chunks.reduce((acc, c) => acc + (c.content?.length || 0), 0);
  if (chunks.length <= maxChapters && allChars <= maxChars) {
    return {
      selectedChunks: [...chunks],
      usedChapters: chunks.map((c) => ({ position: c.position, chapter_title: c.chapter_title })),
      totalChars: allChars,
      hasMatch: true,
    };
  }

  const keywords = extractKeywords(question);
  const normalizedQuestion = question.toLowerCase().trim();

  // Hitung skor kecocokan tiap chunk
  const scored = chunks.map((chunk) => {
    let score = 0;
    const titleLower = (chunk.chapter_title || '').toLowerCase();
    const contentLower = (chunk.content || '').toLowerCase();

    // 1. Kecocokan frasa pertanyaan utuh pada isi atau judul
    if (normalizedQuestion.length > 5) {
      if (titleLower.includes(normalizedQuestion)) score += 50;
      if (contentLower.includes(normalizedQuestion)) score += 30;
    }

    // 2. Pembobotan kata kunci
    for (const kw of keywords) {
      // Kecocokan pada judul bab bernilai tinggi (20 poin per kata)
      if (titleLower.includes(kw)) {
        score += 25;
      }

      // Frekuensi kemunculan pada isi bab (maksimal 15 poin per kata)
      let count = 0;
      let pos = 0;
      while ((pos = contentLower.indexOf(kw, pos)) !== -1) {
        count++;
        pos += kw.length;
        if (count >= 10) break;
      }
      score += Math.min(count * 2, 16);
    }

    return { chunk, score };
  });

  // Urutkan berdasarkan skor tertinggi
  scored.sort((a, b) => b.score - a.score);

  // Bila sama sekali tidak ada kata kunci yang cocok, jangan menebak bab secara acak
  const hasMatch = scored.some((s) => s.score > 0);
  if (!hasMatch) {
    return {
      selectedChunks: [],
      usedChapters: [],
      totalChars: 0,
      hasMatch: false,
    };
  }

  const candidates = scored.filter((s) => s.score > 0);

  const chosen: ChunkItem[] = [];
  let currentTotalChars = 0;

  for (const item of candidates) {
    if (chosen.length >= maxChapters) break;
    const chunkLen = item.chunk.content?.length || 0;

    // Pastikan tidak melebihi batas karakter aman
    if (chosen.length > 0 && currentTotalChars + chunkLen > maxChars) {
      continue;
    }

    chosen.push(item.chunk);
    currentTotalChars += chunkLen;
  }

  // Jika masih kosong karena bab pertama yang cocok terlalu panjang, masukkan setidaknya 1 bab terbaik
  if (chosen.length === 0 && candidates.length > 0) {
    chosen.push(candidates[0].chunk);
    currentTotalChars = candidates[0].chunk.content?.length || 0;
  }

  // Urutkan kembali sesuai urutan posisi asli bab (agar alur baca sistematis)
  chosen.sort((a, b) => a.position - b.position);

  return {
    selectedChunks: chosen,
    usedChapters: chosen.map((c) => ({
      position: c.position,
      chapter_title: c.chapter_title,
    })),
    totalChars: currentTotalChars,
    hasMatch: true,
  };
}
