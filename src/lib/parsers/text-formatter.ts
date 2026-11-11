/**
 * Utilitas pemformatan dan normalisasi struktur teks modul belajar.
 * Dipakai saat ekstraksi dokumen di server DAN saat menampilkan isi bab di UI,
 * sehingga modul lama maupun baru memiliki pemisahan yang jelas antara
 * judul, penjelasan, poin/aturan, dan contoh.
 *
 * Bersifat murni (tanpa dependensi Node.js) dan idempoten.
 */

const UNICODE_BULLET_CLASS = '•●○◦▪▫‣⁃∙➢➤';
const LINE_BULLET_REGEX = new RegExp(`^([ \\t]*)[${UNICODE_BULLET_CLASS}]\\s*(.+)$`);
const INLINE_BULLET_TEST_REGEX = new RegExp(`[${UNICODE_BULLET_CLASS}]`);
const INLINE_BULLET_SPLIT_REGEX = new RegExp(`\\s*[${UNICODE_BULLET_CLASS}]\\s*`);

const SEMANTIC_MARKER_PATTERN =
  '(?:Contoh(?:\\s+(?:kasus|penerapan|soal|nyata))?|Contohnya(?:\\s+adalah)?|Misalnya|Misal|Sebagai\\s+contoh|Ilustrasi|Studi\\s+kasus|Aturan(?:\\s+(?:penting|umum|dasar))?|Ketentuan(?:\\s+(?:umum|khusus))?|Peraturan|Catatan(?:\\s+penting)?|Penting|Perhatian|Peringatan|Rumus|Formula)';

const ABBREVIATION_END_REGEX =
  /(?:\b(?:mis|cth|no|hal|hlm|dr|prof|dkk|dll|dsb|dst|yg|tgl|s\.d|a\.n|u\.p|ny|tn|sdr|jl|kec|kab|prov|ktp|uu|pp|permen|kepmen|sk|pt|cv|tbk|inc|ltd|st|mt|sh|mh|se|mm|spd|mpd|phd))\.$/i;

const REFERENCE_PREFIX_BEFORE_NUMBER_REGEX =
  /(?:\b(?:ayat|butir|poin|angka|huruf|nomor|no|pasal|bab|chapter|bagian|tabel|gambar|lampiran|halaman|hal|hlm|vol|versi|tahap|langkah|modul|unit|uu|pp|perda|permen|ke))\s*\.?\s*$/i;

const EXAMPLE_OR_NOTE_LINE_START_REGEX =
  /^(?:contoh|contohnya|misal|misalnya|sebagai\s+contoh|ilustrasi|studi\s+kasus|aturan|ketentuan|peraturan|syarat|catatan|penting|perhatian|peringatan|rumus|formula|penulis|sumber)\b/i;

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+$/gm, '');
}

function isStructuralLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^(?:---+|===+|\*\*\*+)$/.test(t)) return true;
  if (/^\|/.test(t)) return true;
  if (/^>\s*/.test(t)) return true;
  if (/^[-*+]\s+/.test(t)) return true;
  if (/^[–—]\s+/.test(t)) return true;
  if (LINE_BULLET_REGEX.test(line)) return true;
  if (/^\d{1,3}[.)]\s+/.test(t)) return true;
  if (/^\(\d{1,3}\)\s+/.test(t)) return true;
  if (/^[a-zA-Z][.)]\s+/.test(t)) return true;
  if (/^(?:BAB|Chapter|Bagian|Modul|Unit|Pertemuan)\s+(?:[0-9IVXLCDM]+|[A-Z])\b/i.test(t)) return true;
  if (EXAMPLE_OR_NOTE_LINE_START_REGEX.test(t)) return true;
  return false;
}

/**
 * Menggabungkan pemutusan baris (line-wrap) khas ekstraksi PDF di tengah kalimat,
 * tanpa merusak judul, metadata singkat, daftar poin, atau paragraf terstruktur.
 */
function unwrapPdfLineWraps(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const trimmed = current.trim();

    if (out.length === 0 || !trimmed) {
      out.push(current);
      continue;
    }

    const prev = out[out.length - 1];
    const prevTrimmed = prev.trim();

    if (!prevTrimmed || isStructuralLine(prev) || isStructuralLine(current)) {
      out.push(current);
      continue;
    }

    const prevEndsTerminal = /[.!?:;…»”"]$/.test(prevTrimmed);
    const nextStartsContinuation =
      /^[a-zà-öø-ÿ(,;]/.test(trimmed) ||
      /(?:,|dan|atau|yang|di|ke|dari|untuk|dengan|pada|dalam|serta|karena|sehingga|yaitu|yakni|adalah|merupakan|bahwa|sebagai|terhadap|melalui)$/i.test(
        prevTrimmed
      );

    if (prevTrimmed.length >= 45 && !prevEndsTerminal && nextStartsContinuation) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${trimmed}`;
    } else if (
      prevTrimmed.length >= 45 &&
      /[.!?»”"]$/.test(prevTrimmed) &&
      !ABBREVIATION_END_REGEX.test(prevTrimmed) &&
      /^[A-ZÀ-ÖØ-Ý"“]/.test(trimmed)
    ) {
      // Baris baru setelah akhir kalimat penuh dipisah menjadi paragraf tersendiri agar Markdown tidak menggabungkannya
      out.push('');
      out.push(current);
    } else {
      out.push(current);
    }
  }

  return out.join('\n');
}

/**
 * Menormalkan simbol bullet Unicode dan en-dash di awal baris maupun di tengah paragraf.
 */
function normalizeBullets(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    // 1. Bullet Unicode di awal baris
    const lineMatch = line.match(LINE_BULLET_REGEX);
    if (lineMatch) {
      const indent = lineMatch[1].length >= 2 ? '  ' : '';
      const rest = lineMatch[2].trim();
      // Jika masih memuat bullet inline tambahan di baris yang sama
      if (INLINE_BULLET_TEST_REGEX.test(rest)) {
        const parts = rest.split(INLINE_BULLET_SPLIT_REGEX).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          out.push(`${indent}- ${p}`);
        }
      } else {
        out.push(`${indent}- ${rest}`);
      }
      continue;
    }

    // 2. En-dash / em-dash di awal baris sebagai bullet
    const dashMatch = line.match(/^([ \t]*)[–—]\s+(.+)$/);
    if (dashMatch) {
      const indent = dashMatch[1].length >= 2 ? '  ' : '';
      out.push(`${indent}- ${dashMatch[2].trim()}`);
      continue;
    }

    // 3. Bullet Unicode inline di dalam satu baris (mis. "Aturan: • A • B • C")
    if (INLINE_BULLET_TEST_REGEX.test(line) && !line.trim().startsWith('|')) {
      const parts = line.split(INLINE_BULLET_SPLIT_REGEX);
      if (parts.length >= 2) {
        const intro = parts[0].trim();
        const items = parts.slice(1).map((p) => p.trim()).filter(Boolean);
        if (items.length >= 1) {
          if (intro) {
            out.push(intro);
            out.push('');
          }
          for (const item of items) {
            out.push(`- ${item}`);
          }
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

/**
 * Memisahkan penanda Contoh, Aturan, Catatan, atau Rumus yang menempel di tengah
 * paragraf setelah tanda akhir kalimat (`. `, `! `, `? `) ke paragraf tersendiri.
 */
function separateSemanticMarkersInParagraph(para: string): string {
  const leadingIndent = para.match(/^([ \t]*)/)?.[1] || '';
  const trimmed = para.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('>') ||
    trimmed.startsWith('|') ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  ) {
    return para;
  }

  const markerRegex = new RegExp(`^(${SEMANTIC_MARKER_PATTERN})(?=\\s*[:,-]|\\s+(?:adalah|yaitu|yakni|pada|dalam|di|untuk|ketika|seperti)\\b)`, 'i');

  let result = '';
  let parenDepth = 0;
  let inDoubleQuote = false;
  let didSplit = false;
  let i = 0;

  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if (ch === '"' || ch === '“' || ch === '”') inDoubleQuote = !inDoubleQuote;

    result += ch;

    if (
      parenDepth === 0 &&
      !inDoubleQuote &&
      (ch === '.' || ch === '!' || ch === '?') &&
      i + 1 < trimmed.length &&
      trimmed[i + 1] === ' '
    ) {
      // Pastikan bukan singkatan umum (mis., cth., dkk., dll.)
      const recentChunk = result.slice(Math.max(0, result.length - 16));
      if (!ABBREVIATION_END_REGEX.test(recentChunk)) {
        const restAfterSpace = trimmed.slice(i + 2);
        const match = restAfterSpace.match(markerRegex);
        if (match && result.trim().length >= 20) {
          // Pisahkan ke paragraf baru
          result += '\n\n';
          didSplit = true;
          i += 2; // Lewati spasi tunggal
          continue;
        }
      }
    }

    i++;
  }

  return didSplit ? `${leadingIndent}${result}` : para;
}

function cleanListItemTail(text: string): string {
  return text
    .replace(/[,;]\s*(?:dan|atau|serta)?\s*$/i, '')
    .trim();
}

/**
 * Mencari indeks titik akhir kalimat setelah item terakhir dari daftar inline,
 * di luar tanda kurung dan tanda kutip, bila masih ada kalimat lanjutan di paragraf yang sama.
 */
function splitTrailingSentenceAfterInlineList(tailText: string): { lastItem: string; trailingPara: string | null } {
  const trimmed = tailText.trim();
  let parenDepth = 0;
  let inQuote = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if (ch === '"' || ch === '“' || ch === '”') inQuote = !inQuote;

    if (parenDepth === 0 && !inQuote && (ch === '.' || ch === '!' || ch === '?')) {
      const recent = trimmed.slice(Math.max(0, i - 14), i + 1);
      if (ABBREVIATION_END_REGEX.test(recent)) continue;

      const after = trimmed.slice(i + 1).trim();
      // Jika setelah titik masih ada kalimat baru cukup panjang diawali huruf kapital
      if (after.length >= 25 && /^[A-ZÀ-ÖØ-Ý]/.test(after)) {
        return {
          lastItem: trimmed.slice(0, i + 1).trim(),
          trailingPara: after,
        };
      }
    }
  }

  return { lastItem: trimmed, trailingPara: null };
}

/**
 * Memecah daftar berurutan yang tertulis inline dalam satu paragraf:
 * - `(1) ... (2) ... (3) ...`
 * - `1. ... 2. ... 3. ...`
 * - `a. ... b. ... c. ...` atau `a) ... b) ... c) ...`
 */
function splitInlineListsInParagraph(para: string): string {
  const trimmed = para.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('|')) {
    return para;
  }

  // 1. Cek pola (1) ... (2) ... (3) ...
  const parenMatches = [...trimmed.matchAll(/\((\d{1,2})\)\s+/g)];
  if (parenMatches.length >= 2) {
    // Cari rangkaian berurutan 1, 2, ...
    const seq: RegExpMatchArray[] = [];
    let expected = 1;
    for (const m of parenMatches) {
      const num = Number(m[1]);
      if (num === expected) {
        if (expected === 1) {
          const before = trimmed.slice(0, m.index ?? 0);
          if (REFERENCE_PREFIX_BEFORE_NUMBER_REGEX.test(before)) {
            continue; // Lewati "ayat (1)" / "pasal 1"
          }
        }
        seq.push(m);
        expected++;
      }
    }

    if (seq.length >= 2) {
      const firstIdx = seq[0].index ?? 0;
      const introRaw = trimmed.slice(0, firstIdx).trim();
      let introClean = introRaw.replace(/[,;]\s*$/, ':').replace(/\s+:\s*$/, ':');
      if (/\b(?:yaitu|yakni|meliputi|antara lain|sebagai berikut|berikut ini|adalah)$/i.test(introClean)) {
        introClean = `${introClean}:`;
      }

      const items: string[] = [];
      let trailingPara: string | null = null;

      for (let i = 0; i < seq.length; i++) {
        const start = (seq[i].index ?? 0) + seq[i][0].length;
        const end = i + 1 < seq.length ? (seq[i + 1].index ?? trimmed.length) : trimmed.length;
        const segment = trimmed.slice(start, end);

        if (i < seq.length - 1) {
          items.push(cleanListItemTail(segment));
        } else {
          const splitTail = splitTrailingSentenceAfterInlineList(segment);
          items.push(splitTail.lastItem);
          trailingPara = splitTail.trailingPara;
        }
      }

      if (items.every((item) => item.length >= 3)) {
        const lines: string[] = [];
        if (introClean) {
          lines.push(introClean);
          lines.push('');
        }
        items.forEach((item, idx) => {
          lines.push(`${idx + 1}. ${item}`);
        });
        if (trailingPara) {
          lines.push('');
          lines.push(trailingPara);
        }
        return lines.join('\n');
      }
    }
  }

  // 2. Cek pola inline `1. ... 2. ... 3. ...`
  const numMatches = [...trimmed.matchAll(/(?:^|[\s:;])(\d{1,2})\.\s+(?=[A-ZÀ-ÖØ-Ýa-z("«“])/g)];
  if (numMatches.length >= 2) {
    const seq: Array<{ num: number; markerStart: number; contentStart: number }> = [];
    let expected = 1;

    for (const m of numMatches) {
      const num = Number(m[1]);
      const matchStart = m.index ?? 0;
      const fullMatch = m[0];
      const leadingGap = /^\s|^[:;]/.test(fullMatch) ? 1 : 0;
      const markerStart = matchStart + leadingGap;
      const contentStart = matchStart + fullMatch.length;

      if (num === expected) {
        const before = trimmed.slice(0, markerStart);
        if (expected === 1) {
          const introValid =
            markerStart === 0 ||
            /[:;.?!]\s*$/.test(before) ||
            /\b(?:yaitu|yakni|meliputi|antara lain|sebagai berikut|berikut|adalah|terdiri atas)\s*$/i.test(before);
          if (!introValid || REFERENCE_PREFIX_BEFORE_NUMBER_REGEX.test(before)) {
            continue;
          }
        } else if (REFERENCE_PREFIX_BEFORE_NUMBER_REGEX.test(before)) {
          continue;
        }

        seq.push({ num, markerStart, contentStart });
        expected++;
      }
    }

    if (seq.length >= 2) {
      const introRaw = trimmed.slice(0, seq[0].markerStart).trim();
      const items: string[] = [];
      for (let i = 0; i < seq.length; i++) {
        const start = seq[i].contentStart;
        const end = i + 1 < seq.length ? seq[i + 1].markerStart : trimmed.length;
        const segment = trimmed.slice(start, end);
        items.push(i < seq.length - 1 ? cleanListItemTail(segment) : segment.trim());
      }

      if (items.every((item) => item.length >= 3)) {
        const lines: string[] = [];
        if (introRaw) {
          lines.push(introRaw);
          lines.push('');
        }
        items.forEach((item, idx) => {
          lines.push(`${idx + 1}. ${item}`);
        });
        return lines.join('\n');
      }
    }
  }

  // 3. Cek pola inline `a. ... b. ...` atau `a) ... b) ...` (hanya jika diawali penanda daftar jelas)
  const letterMatches = [...trimmed.matchAll(/(?:^|[\s:;])([a-z])([.)])\s+(?=[A-ZÀ-ÖØ-Ýa-z("«“])/g)];
  if (letterMatches.length >= 2) {
    const seq: Array<{ letter: string; markerStart: number; contentStart: number }> = [];
    let expectedCode = 'a'.charCodeAt(0);
    let expectedDelim: string | null = null;

    for (const m of letterMatches) {
      const letter = m[1];
      const delim = m[2];
      const matchStart = m.index ?? 0;
      const fullMatch = m[0];
      const leadingGap = /^\s|^[:;]/.test(fullMatch) ? 1 : 0;
      const markerStart = matchStart + leadingGap;
      const contentStart = matchStart + fullMatch.length;

      if (letter.charCodeAt(0) === expectedCode && (!expectedDelim || expectedDelim === delim)) {
        const before = trimmed.slice(0, markerStart);
        if (expectedCode === 'a'.charCodeAt(0)) {
          const hasIntroCue =
            /:\s*$/.test(before) ||
            /\b(?:yaitu|yakni|meliputi|antara lain|sebagai berikut|berikut ini)\s*$/i.test(before);
          if (!hasIntroCue) continue;
          expectedDelim = delim;
        }
        seq.push({ letter, markerStart, contentStart });
        expectedCode++;
      }
    }

    if (seq.length >= 2) {
      const introRaw = trimmed.slice(0, seq[0].markerStart).trim();
      const items: string[] = [];
      for (let i = 0; i < seq.length; i++) {
        const start = seq[i].contentStart;
        const end = i + 1 < seq.length ? seq[i + 1].markerStart : trimmed.length;
        const segment = trimmed.slice(start, end);
        items.push(i < seq.length - 1 ? cleanListItemTail(segment) : segment.trim());
      }

      if (items.every((item) => item.length >= 3)) {
        const lines: string[] = [];
        if (introRaw) {
          lines.push(introRaw);
          lines.push('');
        }
        items.forEach((item, idx) => {
          lines.push(`- **${seq[idx].letter}.** ${item}`);
        });
        return lines.join('\n');
      }
    }
  }

  return para;
}

/**
 * Menormalkan daftar berhuruf di awal baris (`a. ...`, `a) ...`, `1) ...`, `(1) ...`)
 * serta menyusun sub-judul bernomor (`1. Judul:\nPenjelasan` / `- Subpoin`) agar tidak putus
 * dan sub-poinnya terindentasi rapi dalam Markdown.
 */
function structureNumberedSubsectionsAndSpacing(text: string): string {
  const lines = text.split('\n');
  const normalizedLines: string[] = [];

  // 1. Konversi `(1) ` / `1) ` di awal baris menjadi `1. `, dan `a. ` / `a) ` di awal baris menjadi `- **a.** `
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const parenLine = trimmed.match(/^\((\d{1,3})\)\s+(.+)$/);
    if (parenLine) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      normalizedLines.push(`${indent}${parenLine[1]}. ${parenLine[2]}`);
      continue;
    }

    const closeParenNum = trimmed.match(/^(\d{1,3})\)\s+(.+)$/);
    if (closeParenNum) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      normalizedLines.push(`${indent}${closeParenNum[1]}. ${closeParenNum[2]}`);
      continue;
    }

    const letterLine = trimmed.match(/^([a-z])\s*[.)]\s+(.+)$/);
    if (letterLine && letterLine[2].length >= 2) {
      // Pastikan hanya mengubah jika sebelumnya/sesudahnya ada konteks daftar huruf agar tidak salah ubah singkatan
      const prevNonEmpty = [...normalizedLines].reverse().find((l) => l.trim().length > 0) || '';
      const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim().length > 0) || '';
      const hasListContext =
        /:\s*$/.test(prevNonEmpty.trim()) ||
        /^[-*]\s+\*\*[a-z]\.\*\*/.test(prevNonEmpty.trim()) ||
        /^[a-z]\s*[.)]\s+/.test(nextNonEmpty.trim()) ||
        letterLine[1] === 'a';
      if (hasListContext) {
        const indent = line.match(/^(\s*)/)?.[1] || '';
        normalizedLines.push(`${indent}- **${letterLine[1]}.** ${letterLine[2]}`);
        continue;
      }
    }

    normalizedLines.push(line);
  }

  // 2. Pastikan sub-bagian bernomor seperti `1. Pengembangan Bagian Awal:` + isi / sub-bullet
  // terindentasi rapi 3 spasi agar tetap dalam satu urutan <ol>
  const out: string[] = [];
  let activeNumberedParent: number | null = null;

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    // Jika ketemu heading atau garis pemisah, reset parent bernomor
    if (/^#{1,6}\s+/.test(trimmed) || /^(?:---+|===+|\*\*\*+)$/.test(trimmed)) {
      activeNumberedParent = null;
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(trimmed);
      out.push('');
      continue;
    }

    const numItemMatch = trimmed.match(/^(\d{1,3})\.\s+(.+)$/);
    if (numItemMatch) {
      const num = Number(numItemMatch[1]);
      let body = numItemMatch[2];

      // Cek apakah ini item header berakhiran ':' yang diikuti oleh baris isi atau sub-bullet '- '
      const nextNonEmpty = normalizedLines.slice(i + 1).find((l) => l.trim().length > 0)?.trim() || '';
      const hasColonHeader = body.endsWith(':') || (body.startsWith('**') && body.endsWith(':**'));
      const isParentSectionItem =
        hasColonHeader &&
        body.length <= 95 &&
        nextNonEmpty.length > 0 &&
        !/^\d{1,3}\.\s+/.test(nextNonEmpty) &&
        !/^#{1,6}\s+/.test(nextNonEmpty);

      if (isParentSectionItem) {
        if (!body.startsWith('**')) {
          body = `**${body}**`;
        }
        activeNumberedParent = num;
      } else {
        activeNumberedParent = null;
      }

      // Pastikan ada baris kosong sebelum item 1 jika baris sebelumnya adalah paragraf biasa
      if (
        num === 1 &&
        out.length > 0 &&
        out[out.length - 1] !== '' &&
        !/^[-*+]\s+/.test(out[out.length - 1].trim()) &&
        !/^\d{1,3}\.\s+/.test(out[out.length - 1].trim())
      ) {
        out.push('');
      }

      out.push(`${num}. ${body}`);
      continue;
    }

    // Jika sedang di dalam numbered parent (`1. **Judul:**`) dan ini adalah sub-bullet atau paragraf anak
    if (activeNumberedParent !== null) {
      const isBullet = /^[-*+]\s+/.test(trimmed);
      const isSemanticBreak = EXAMPLE_OR_NOTE_LINE_START_REGEX.test(trimmed);

      if (isBullet) {
        // Beri baris kosong sebelum sub-bullet pertama agar CommonMark merender <ul> di dalam <li>
        if (out.length > 0 && out[out.length - 1] !== '' && /^\d{1,3}\.\s+/.test(out[out.length - 1].trim())) {
          out.push('');
        }
        out.push(`   ${trimmed}`);
        continue;
      } else if (!isSemanticBreak && !/^\s{3,}/.test(line)) {
        // Paragraf penjelasan milik numbered item di atasnya
        if (out.length > 0 && out[out.length - 1] !== '' && /^\d{1,3}\.\s+/.test(out[out.length - 1].trim())) {
          out.push('');
        }
        out.push(`   ${trimmed}`);
        // Setelah 1 paragraf isi anak, cek apakah baris berikutnya bukan kelanjutan anak
        const nextLine = normalizedLines[i + 1]?.trim() || '';
        if (!nextLine || /^\d{1,3}\.\s+/.test(nextLine)) {
          activeNumberedParent = null;
        }
        continue;
      } else if (/^\s{3,}/.test(line)) {
        out.push(line);
        continue;
      } else {
        activeNumberedParent = null;
      }
    }

    // Jika ketemu bullet biasa tepat setelah paragraf biasa (bukan bullet dan bukan list bernomor), sisipkan baris kosong
    if (/^[-*+]\s+/.test(trimmed) && !/^\s{2,}/.test(line)) {
      const prev = out.length > 0 ? out[out.length - 1].trim() : '';
      if (prev && !/^[-*+]\s+/.test(prev) && !/^\d{1,3}\.\s+/.test(prev)) {
        // Jika baris sebelumnya adalah label singkat berakhiran ':', tebalkan agar jelas sebagai penanda poin
        if (
          prev.endsWith(':') &&
          prev.length <= 70 &&
          !prev.startsWith('**') &&
          !prev.startsWith('#') &&
          !/[.!?]/.test(prev.slice(0, -1))
        ) {
          out[out.length - 1] = `**${prev}**`;
        }
        out.push('');
      }
      out.push(trimmed);
      continue;
    }

    out.push(line);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Memformat teks modul mentah (hasil ekstraksi PDF/DOCX/TXT) menjadi Markdown terstruktur
 * dengan pemisahan jelas antara judul, penjelasan, daftar aturan/poin, dan contoh.
 */
export function formatStructuredModuleText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = normalizeWhitespace(rawText);
  text = unwrapPdfLineWraps(text);
  text = normalizeBullets(text);

  // Pisahkan paragraf untuk memproses marker semantik dan daftar inline per paragraf
  const paragraphs = text.split(/\n{2,}/);
  const processedParagraphs = paragraphs.map((para) => {
    // Jika paragraf memiliki beberapa baris, cek apakah tiap barisnya sudah terstruktur
    if (para.includes('\n')) {
      return para
        .split('\n')
        .map((line) => {
          const withMarkers = separateSemanticMarkersInParagraph(line);
          return withMarkers
            .split('\n\n')
            .map((sub) => splitInlineListsInParagraph(sub))
            .join('\n\n');
        })
        .join('\n');
    }

    const withMarkers = separateSemanticMarkersInParagraph(para);
    return withMarkers
      .split('\n\n')
      .map((sub) => splitInlineListsInParagraph(sub))
      .join('\n\n');
  });

  text = processedParagraphs.join('\n\n');
  text = structureNumberedSubsectionsAndSpacing(text);

  return text;
}

/**
 * Menormalisasi Markdown sebelum dirender di ReactMarkdown agar label bagian
 * (seperti `**Penjelasan Materi:**` diikuti single newline) terpisah bersih.
 */
export function prepareMarkdownForDisplay(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';

  return markdown
    .replace(/\r\n/g, '\n')
    // Pisahkan label tebal mandiri yang diikuti single newline menjadi paragraf terpisah
    .replace(
      /^(\*\*(?:Penjelasan Materi|Inti Bab|Poin-Poin Penting|Aturan(?:\s*&\s*|\s*\/\s*|\s+)Ketentuan|Contoh(?:\s*\/\s*|\s+)Kasus Penerapan|Contoh Penerapan|Istilah Kunci|Perbedaan Utama|Kesimpulan|Wajib Diingat)\s*:?\*\*)\n(?!\n)/gim,
      '$1\n\n'
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
