import { formatStructuredModuleText } from './text-formatter.ts';

export interface ChapterChunk {
  position: number;
  chapter_title: string;
  content: string;
}

interface HeadingMatch {
  lineIndex: number;
  startOffset: number;
  endOffset: number;
  title: string;
}

function collectLineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1; // +1 untuk '\n'
  }
  return offsets;
}

function detectHeadingMatches(lines: string[], offsets: number[]): HeadingMatch[] {
  const explicitChapterRegex =
    /^(?:#{1,6}\s+)?((?:BAB|Chapter|Bagian|Pertemuan|Unit|Topik)\s+(?:[0-9IVXLCDM]+|[A-Z])(?:[\s:–—.-]+[^\n]+)?)$/i;

  // Tier 1: Penanda BAB / Chapter / Bagian / Unit / Pertemuan / Topik eksplisit (dengan atau tanpa prefix #)
  const tier1: HeadingMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.length > 120) continue;

    const match = trimmed.match(explicitChapterRegex);
    if (match) {
      const cleanTitle = match[1].trim();
      // Pastikan bukan bagian dari kalimat panjang yang berakhir tanda koma
      if (!/[,;]$/.test(cleanTitle)) {
        tier1.push({
          lineIndex: i,
          startOffset: offsets[i],
          endOffset: offsets[i] + lines[i].length,
          title: cleanTitle,
        });
      }
    }
  }
  if (tier1.length >= 2) {
    return tier1;
  }

  // Tier 2: Heading Markdown tingkat 2 (## ) atau tingkat 1 (# )
  const h2Matches: HeadingMatch[] = [];
  const h1Matches: HeadingMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+([^\n]{3,100})$/.test(trimmed)) {
      h2Matches.push({
        lineIndex: i,
        startOffset: offsets[i],
        endOffset: offsets[i] + lines[i].length,
        title: trimmed.replace(/^##\s+/, '').trim(),
      });
    } else if (/^#\s+([^\n]{3,100})$/.test(trimmed)) {
      h1Matches.push({
        lineIndex: i,
        startOffset: offsets[i],
        endOffset: offsets[i] + lines[i].length,
        title: trimmed.replace(/^#\s+/, '').trim(),
      });
    }
  }
  if (h2Matches.length >= 2) {
    return h2Matches;
  }
  if (h1Matches.length >= 2) {
    return h1Matches;
  }

  // Tier 3: Subjudul bernomor berdiri sendiri (mis. "1. Pengenalan Sel"), bukan item daftar
  const tier3: HeadingMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    if (!prevBlank) continue;

    const numMatch = trimmed.match(/^(\d{1,2}\.\s+[A-ZÀ-ÖØ-Ý][^\n]{3,60})$/);
    if (!numMatch) continue;

    const title = numMatch[1].trim();
    // Jangan anggap daftar berakhiran ':', ',', ';', atau '.' sebagai pemecah bab
    if (/[:.,;]$/.test(title)) continue;

    // Pastikan baris non-kosong berikutnya bukan langsung item nomor berikutnya (daftar rapat)
    const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim().length > 0)?.trim() || '';
    if (/^\d{1,2}\.\s+/.test(nextNonEmpty)) continue;

    tier3.push({
      lineIndex: i,
      startOffset: offsets[i],
      endOffset: offsets[i] + lines[i].length,
      title,
    });
  }
  if (tier3.length >= 2) {
    return tier3;
  }

  return [];
}

function stripBoundaryRules(text: string): string {
  return text
    .trim()
    .replace(/^(?:---+\s*\n*)+/, '')
    .replace(/(?:\n*---+)+$/, '')
    .trim();
}

export function splitIntoChapters(text: string): ChapterChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const normalized = formatStructuredModuleText(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const offsets = collectLineOffsets(lines);
  const matches = detectHeadingMatches(lines, offsets);

  if (matches.length >= 2) {
    const chunks: ChapterChunk[] = [];

    // Potongan awal sebelum bab pertama (hanya jika benar-benar berisi pengantar panjang, bukan sekadar judul/penulis)
    const firstMatchIndex = matches[0].startOffset;
    if (firstMatchIndex > 120) {
      const introText = stripBoundaryRules(normalized.slice(0, firstMatchIndex));
      if (introText.length > 100) {
        chunks.push({
          position: 1,
          chapter_title: 'Pengantar / Pendahuluan',
          content: introText,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const endOffset = i + 1 < matches.length ? matches[i + 1].startOffset : normalized.length;
      const body = stripBoundaryRules(normalized.slice(current.endOffset, endOffset));

      if (body.length > 0) {
        const cleanTitle = current.title.length > 80 ? current.title.slice(0, 77) + '...' : current.title;
        chunks.push({
          position: chunks.length + 1,
          chapter_title: cleanTitle,
          content: `## ${current.title}\n\n${body}`,
        });
      }
    }

    if (chunks.length > 0) {
      return chunks;
    }
  }

  // Pemisahan fallback berbasis ukuran (~3.500 karakter per bagian) di batas paragraf
  const TARGET_CHUNK_SIZE = 3500;
  const paragraphs = normalized.split(/\n\s*\n/);
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
