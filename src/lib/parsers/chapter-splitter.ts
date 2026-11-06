export interface ChapterChunk {
  position: number;
  chapter_title: string;
  content: string;
}

export function splitIntoChapters(text: string): ChapterChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Pola regex untuk mendeteksi penanda bab umum
  // 1. BAB 1 / BAB I / Chapter 1 / Bagian 1
  // 2. 1.0 Judul atau 1. Judul (minimal huruf kapital)
  const chapterPattern = /(?:^|\n\n)(?:(BAB\s+(?:[0-9IVXLCDM]+|[A-Z])[\s:–-][^\n]+)|(Chapter\s+(?:[0-9IVXLCDM]+|[A-Z])[\s:–-][^\n]+)|(Bagian\s+(?:[0-9IVXLCDM]+|[A-Z])[\s:–-][^\n]+)|(\d+\.\s+[A-Z][^\n]{3,60}))/gi;

  const matches = [...text.matchAll(chapterPattern)];

  // Jika terdeteksi minimal 2 penanda bab, gunakan pemisahan berbasis heading
  if (matches.length >= 2) {
    const chunks: ChapterChunk[] = [];
    
    // Potongan awal sebelum bab pertama (jika ada teks pengantar/abstrak yang cukup panjang)
    const firstMatchIndex = matches[0].index ?? 0;
    if (firstMatchIndex > 100) {
      const introText = text.slice(0, firstMatchIndex).trim();
      if (introText.length > 50) {
        chunks.push({
          position: 1,
          chapter_title: 'Pengantar / Pendahuluan',
          content: introText,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const title = currentMatch[0].trim();
      const startIndex = (currentMatch.index ?? 0) + currentMatch[0].length;
      const endIndex = (i + 1 < matches.length) ? (matches[i + 1].index ?? text.length) : text.length;

      const content = text.slice(startIndex, endIndex).trim();
      if (content.length > 0) {
        chunks.push({
          position: chunks.length + 1,
          chapter_title: title.length > 80 ? title.slice(0, 77) + '...' : title,
          content: `${title}\n\n${content}`,
        });
      }
    }

    if (chunks.length > 0) {
      return chunks;
    }
  }

  // Pemisahan fallback berbasis ukuran (misal 3.500 karakter per bagian) di batas paragraf
  const TARGET_CHUNK_SIZE = 3500;
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: ChapterChunk[] = [];

  let currentChunkText = '';
  let chunkIndex = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunkText.length + trimmed.length > TARGET_CHUNK_SIZE && currentChunkText.length > 0) {
      chunks.push({
        position: chunkIndex,
        chapter_title: `Bagian ${chunkIndex}`,
        content: currentChunkText.trim(),
      });
      chunkIndex++;
      currentChunkText = '';
    }

    currentChunkText += (currentChunkText ? '\n\n' : '') + trimmed;
  }

  if (currentChunkText.trim().length > 0) {
    chunks.push({
      position: chunkIndex,
      chapter_title: `Bagian ${chunkIndex}`,
      content: currentChunkText.trim(),
    });
  }

  return chunks;
}
