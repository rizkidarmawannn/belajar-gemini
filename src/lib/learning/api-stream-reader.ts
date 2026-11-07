/**
 * Helper terpadu untuk membaca respons dari endpoint /api/generate
 * Mendukung konsumsi text/plain (streaming chunk) dan application/json (non-stream/cache hit).
 */

export interface UsedChapterInfo {
  position: number;
  chapter_title: string;
}

export interface UsedChaptersMode {
  mode: 'all';
  count: number;
}

export interface ReadApiResponseOptions {
  response: Response;
  onChunk?: (accumulatedText: string, chunk: string) => void;
  signal?: AbortSignal;
}

export interface ReadApiResponseResult {
  text: string;
  isStream: boolean;
  isCached: boolean;
  usedChapters?: UsedChapterInfo[];
  usedChaptersMode?: UsedChaptersMode;
  rawJson?: any;
}

/**
 * Fallback defensif terakhir.
 * HANYA aktif jika teks mentah diawali persis dengan '{"success"'
 * untuk mencegah tampilan JSON mentah bila ada respon JSON yang keliru terkirim sebagai stream.
 * Teks umum yang membahas JSON di materi belajar TIDAK AKAN disentuh.
 */
export function cleanDisplayText(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{"success"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.result?.markdown) return parsed.result.markdown;
      if (parsed.result?.answer) return parsed.result.answer;
      if (typeof parsed.result === 'string') return parsed.result;
      if (parsed.markdown) return parsed.markdown;
      if (parsed.answer) return parsed.answer;
    } catch {
      // Jika JSON terpotong di tengah jalan, biarkan teks apa adanya
    }
  }
  return raw;
}

/**
 * Format pesan error ramah pengguna dalam bahasa Indonesia
 * Menghindari teks mentah seperti "AbortError", "Failed to fetch", dsb.
 */
export function formatFriendlyErrorMessage(err: any): { message: string; isTimeout: boolean; isUserAbort: boolean } {
  const errName = err?.name || '';
  const errMsg = String(err?.message || err || '');

  // 1. Dibatalkan manual oleh pengguna
  if (errName === 'AbortError' && (errMsg.includes('user') || errMsg.includes('batal') || errMsg.includes('cancel'))) {
    return {
      message: 'Permintaan berhasil dibatalkan.',
      isTimeout: false,
      isUserAbort: true,
    };
  }

  // 2. Batas waktu habis (timeout / deadline exceeded)
  if (
    errName === 'TimeoutError' ||
    errMsg.includes('DEADLINE_EXCEEDED') ||
    errMsg.includes('timeout') ||
    errMsg.includes('waktu habis') ||
    (errName === 'AbortError' && !errMsg.includes('user'))
  ) {
    return {
      message: 'Waktu permintaan habis (melebihi batas waktu server). Silakan coba lagi atau persempit materi ke bab tertentu.',
      isTimeout: true,
      isUserAbort: false,
    };
  }

  // 3. Masalah jaringan / koneksi ke server terputus
  if (
    errMsg.includes('Failed to fetch') ||
    errMsg.includes('NetworkError') ||
    errMsg.includes('ECONNREFUSED') ||
    errMsg.includes('Load failed')
  ) {
    return {
      message: 'Koneksi ke server terputus. Pastikan server dev aktif dan koneksi internet Anda stabil.',
      isTimeout: false,
      isUserAbort: false,
    };
  }

  // 4. Pesan error terstruktur dari backend
  return {
    message: errMsg || 'Terjadi kesalahan sistem saat memproses permintaan AI.',
    isTimeout: false,
    isUserAbort: false,
  };
}

/**
 * Mengonsumsi Response dari /api/generate sesuai header Content-Type
 */
export async function readApiResponse(options: ReadApiResponseOptions): Promise<ReadApiResponseResult> {
  const { response, onChunk, signal } = options;

  if (signal?.aborted) {
    throw new DOMException('Permintaan dibatalkan oleh pengguna.', 'AbortError');
  }

  if (!response.ok) {
    let errorMsg = 'Permintaan gagal diproses oleh server.';
    try {
      const errJson = await response.json();
      errorMsg = errJson.error || errorMsg;
    } catch {
      // bukan JSON error
    }
    throw new Error(errorMsg);
  }

  const contentType = response.headers.get('content-type') || '';
  const xCache = response.headers.get('x-cache') || '';
  const isCached = xCache.toUpperCase() === 'HIT' || response.headers.get('x-cached') === 'true';

  // Parse header used chapters jika ada
  let usedChapters: UsedChapterInfo[] | undefined;
  let usedChaptersMode: UsedChaptersMode | undefined;

  const usedChaptersHeader = response.headers.get('x-used-chapters');
  if (usedChaptersHeader) {
    try {
      const decoded = decodeURIComponent(usedChaptersHeader);
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object' && parsed.mode === 'all') {
        usedChaptersMode = { mode: 'all', count: Number(parsed.count) || 0 };
      } else if (Array.isArray(parsed)) {
        usedChapters = parsed;
      }
    } catch {
      try {
        const parsed = JSON.parse(usedChaptersHeader);
        if (parsed && typeof parsed === 'object' && parsed.mode === 'all') {
          usedChaptersMode = { mode: 'all', count: Number(parsed.count) || 0 };
        } else if (Array.isArray(parsed)) {
          usedChapters = parsed;
        }
      } catch {
        // abaikan bila format header tidak valid
      }
    }
  }

  // KASUS 1: Non-stream JSON (application/json)
  if (contentType.includes('application/json')) {
    const json = await response.json();
    if (json.error) {
      throw new Error(json.error);
    }

    const text =
      json.result?.markdown ||
      json.result?.answer ||
      (typeof json.result === 'string' ? json.result : '');

    const jsonUsed = json.usedChapters || usedChapters || (usedChaptersMode ? usedChaptersMode : undefined);
    return {
      text,
      isStream: false,
      isCached: Boolean(json.cached || isCached),
      usedChapters: Array.isArray(jsonUsed) ? jsonUsed : usedChapters,
      usedChaptersMode: (jsonUsed && jsonUsed.mode === 'all') ? jsonUsed : usedChaptersMode,
      rawJson: json,
    };
  }

  // KASUS 2: Streaming teks (text/plain)
  if (!response.body) {
    throw new Error('Streaming tidak didukung oleh browser Anda.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('Permintaan dibatalkan oleh pengguna.', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;

      if (onChunk) {
        onChunk(accumulated, chunk);
      }
    }
  } catch (streamErr: any) {
    if (streamErr.name === 'AbortError') {
      throw streamErr;
    }
    throw new Error(streamErr.message || 'Koneksi streaming terputus saat membaca respons.');
  }

  // Fallback defensif terakhir: bila stream keliru membungkus json
  const finalText = cleanDisplayText(accumulated);

  return {
    text: finalText,
    isStream: true,
    isCached,
    usedChapters,
    usedChaptersMode,
  };
}
