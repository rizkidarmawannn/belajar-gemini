export interface ParsedSseChunk {
  text: string;
  usageMetadata?: any;
  finishReason?: string;
}

const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
]);

export const TRUNCATED_MARKER_REGEX = /\n*\[TRUNCATED:[^\]]*\]\s*/g;

/**
 * Mengekstrak teks non-thought, metadata token, dan finishReason dari satu payload JSON event SSE Gemini.
 * Melempar error berstruktur apabila Gemini mengirimkan objek error atau memblokir konten.
 */
export function extractGeminiChunk(payload: any): ParsedSseChunk {
  if (payload?.error) {
    const err: any = new Error(payload.error.message || 'Gangguan stream dari layanan Gemini.');
    if (payload.error.code) {
      err.status = payload.error.code;
    }
    throw err;
  }

  const candidate = payload?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

  let text = '';
  for (const part of parts) {
    if (typeof part?.text === 'string' && part?.thought !== true) {
      text += part.text;
    }
  }

  if (!text && finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new Error(`Konten diblokir oleh filter keamanan AI (${finishReason}).`);
  }

  return {
    text,
    usageMetadata: payload?.usageMetadata,
    finishReason,
  };
}

/**
 * Parser SSE (Server-Sent Events) yang aman terhadap pemotongan byte UTF-8 multi-byte
 * dan pemecahan baris \r\n di batas chunk jaringan/serverless.
 */
export async function* parseGeminiSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<ParsedSseChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventDataLines: string[] = [];

  const flushEvent = (): ParsedSseChunk | null => {
    if (eventDataLines.length === 0) return null;
    const rawPayload = eventDataLines.join('\n').trim();
    eventDataLines = [];

    if (!rawPayload || rawPayload === '[DONE]') {
      return null;
    }

    const parsed = JSON.parse(rawPayload);
    return extractGeminiChunk(parsed);
  };

  const processCompleteLine = (rawLine: string): ParsedSseChunk | null => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      return flushEvent();
    }

    // Abaikan komentar SSE (misal heartbeat ": keep-alive")
    if (line.startsWith(':')) {
      return null;
    }

    if (line.startsWith('data:')) {
      const value = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
      eventDataLines.push(value);
      return null;
    }

    // Field SSE lain (event:, id:, retry:) tidak membawa payload JSON Gemini
    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        if (buffer.length > 0) {
          const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const tailLines = normalized.split('\n');
          for (const tailLine of tailLines) {
            const chunk = processCompleteLine(tailLine);
            if (chunk) yield chunk;
          }
        }
        const finalChunk = flushEvent();
        if (finalChunk) yield finalChunk;
        break;
      }

      // Gunakan { stream: true } agar urutan byte UTF-8 (seperti "—", "–", "“", "•") yang
      // terbelah antar paket HTTP tetap dirangkai utuh tanpa korupsi.
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const chunk = processCompleteLine(line);
        if (chunk) yield chunk;
        newlineIdx = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Menghapus duplikasi ujung teks apabila respons lanjutan mengulang sebagian akhiran
 * dari teks sebelumnya (misalnya terpotong di tengah kata atau tanda kurung).
 */
export function trimContinuationOverlap(prefix: string, continuation: string): string {
  if (!prefix || !continuation) return continuation;

  const trimmedStart = continuation.replace(/^\s+/, '');
  const maxCheck = Math.min(160, prefix.length, continuation.length);

  for (let len = maxCheck; len >= 3; len--) {
    const tail = prefix.slice(-len);
    if (continuation.startsWith(tail)) {
      return continuation.slice(len);
    }
    if (trimmedStart.startsWith(tail)) {
      return trimmedStart.slice(len);
    }
  }

  return continuation;
}
