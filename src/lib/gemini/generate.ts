import 'server-only';
import { getGeminiClient, getModelName } from './client.ts';
import { renderPrompt, type RenderedPrompt } from './render-prompt.ts';
import { cleanAndParseJson } from '../validators/index.ts';

export interface GenerationOptions {
  promptName: string;
  variables: Record<string, any>;
  customSystemInstruction?: string;
  temperature?: number;
  attemptTimeoutMs?: number; // Batas durasi per percobaan individual (default 20 detik)
  totalDeadlineMs?: number;  // Batas total durasi (deadline) seluruh percobaan (default 48 detik)
}

export interface GenerationResult<T = string> {
  data: T;
  tokensIn: number;
  tokensOut: number;
}

export interface StreamHandlers {
  onBeforeClose?: (fullText: string, tokensIn: number, tokensOut: number) => Promise<void>;
  onPartial?: (accumulatedText: string, tokensIn: number, tokensOut: number, reason: 'deadline' | 'error') => Promise<void>;
  onCancel?: (accumulatedText: string, tokensIn: number, tokensOut: number) => Promise<void>;
}

// Helper penundaan dengan jitter
async function waitWithJitter(attempt: number, baseMs = 1000): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Menghitung timeout efektif per percobaan: min(attemptTimeout, sisa waktu total - 2 detik)
export function calculateEffectiveTimeout(attemptTimeoutMs: number, remainingTimeMs: number): number {
  return Math.min(attemptTimeoutMs, Math.max(1000, remainingTimeMs - 2000));
}

// Cek apakah error merupakan error sementara yang layak di-retry
function isTransientError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status || error?.statusCode;

  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('overloaded') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('timeout') ||
    msg.includes('format json') ||
    msg.includes('json') ||
    msg.includes('parse') ||
    msg.includes('tingkat kesulitan') ||
    msg.includes('kriteria kualitas')
  );
}

// Format pesan error menjadi bahasa Indonesia yang ramah & aman (tanpa membocorkan kunci/stack trace)
export function formatFriendlyErrorMessage(error: any): string {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('gemini_model belum dikonfigurasi')) {
    return error.message;
  }
  if (msg.includes('tingkat kesulitan')) {
    return 'AI belum berhasil menyusun soal dengan tingkat kesulitan yang diminta. Silakan coba buat kuis kembali.';
  }
  if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
    return 'Layanan Gemini sedang mengalami lonjakan beban atau batas pemakaian tercapai. Mohon tunggu beberapa detik dan coba kembali.';
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harm')) {
    return 'Permintaan tidak dapat diproses oleh AI karena terdeteksi melanggar filter keamanan konten.';
  }
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('deadline')) {
    return 'Waktu proses pemanggilan AI melebihi batas waktu (timeout). Silakan coba dengan bab yang lebih pendek.';
  }
  if (msg.includes('api key') || msg.includes('unauthenticated')) {
    return 'Konfigurasi otentikasi AI server bermasalah. Harap periksa GEMINI_API_KEY.';
  }

  return 'Terjadi kendala saat berkomunikasi dengan asisten AI. Silakan coba kembali sesaat lagi.';
}

/**
 * Panggilan Gemini untuk menghasilkan teks (Ringkasan, Mnemonic, QA)
 * dengan kontrol batas waktu total (deadline) dan timeout tiap percobaan yang efektif.
 */
export async function generateText(options: GenerationOptions): Promise<GenerationResult<string>> {
  const {
    promptName,
    variables,
    customSystemInstruction,
    attemptTimeoutMs = 20000,
    totalDeadlineMs = 48000,
  } = options;

  const rendered: RenderedPrompt = renderPrompt(promptName, variables);
  const systemInstruction = customSystemInstruction || rendered.systemInstruction;

  const ai = getGeminiClient();
  const model = getModelName();

  const startTime = Date.now();
  let lastError: any = null;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const elapsed = Date.now() - startTime;
    const remainingTime = totalDeadlineMs - elapsed;

    if (remainingTime < 3000) {
      throw new Error(
        'Waktu proses melebihi batas aman yang diizinkan (timeout). Silakan coba lagi atau gunakan materi per bab.'
      );
    }

    const effectiveTimeout = calculateEffectiveTimeout(attemptTimeoutMs, remainingTime);

    try {
      const callPromise = ai.models.generateContent({
        model,
        contents: rendered.promptText,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.2,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), effectiveTimeout)
      );

      const response: any = await Promise.race([callPromise, timeoutPromise]);

      const text = response.text || '';
      const tokensIn = response.usageMetadata?.promptTokenCount || Math.ceil(rendered.promptText.length / 4);
      const tokensOut = response.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

      return {
        data: text.trim(),
        tokensIn,
        tokensOut,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1 && isTransientError(err)) {
        await waitWithJitter(attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(formatFriendlyErrorMessage(lastError));
}

/**
 * Panggilan Gemini untuk menghasilkan output JSON terstruktur (Kuis, Flashcard, Evaluasi Esai)
 * dengan self-healing gap filling: jika jumlah valid kurang dari target, meminta selisihnya.
 * Menjumlahkan tokens_in dan tokens_out dari seluruh putaran secara akurat.
 */
export async function generateJson<T = any>(
  options: GenerationOptions,
  validatorFn?: (raw: unknown) => T,
  targetCount?: number,
  gapFillerFn?: (existing: T, additional: T) => T
): Promise<GenerationResult<T>> {
  const {
    promptName,
    variables,
    customSystemInstruction,
    attemptTimeoutMs = 20000,
    totalDeadlineMs = 48000,
  } = options;

  const ai = getGeminiClient();
  const model = getModelName();
  const startTime = Date.now();

  let totalTokensIn = 0;
  let totalTokensOut = 0;

  // Helper untuk 1 kali eksekusi generateContent JSON
  async function callOnce(currentVars: Record<string, any>): Promise<any> {
    const rendered: RenderedPrompt = renderPrompt(promptName, currentVars);
    const systemInstruction = customSystemInstruction || rendered.systemInstruction;

    let lastError: any = null;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const elapsed = Date.now() - startTime;
      const remainingTime = totalDeadlineMs - elapsed;

      if (remainingTime < 3000) {
        throw new Error('Waktu proses melebihi batas aman yang diizinkan (timeout).');
      }

      const effectiveTimeout = calculateEffectiveTimeout(attemptTimeoutMs, remainingTime);

      try {
        const callPromise = ai.models.generateContent({
          model,
          contents: rendered.promptText,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: options.temperature ?? 0.2,
          },
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), effectiveTimeout)
        );

        const response: any = await Promise.race([callPromise, timeoutPromise]);
        const rawText = response.text || '';

        const tIn = response.usageMetadata?.promptTokenCount || Math.ceil(rendered.promptText.length / 4);
        const tOut = response.usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4);
        totalTokensIn += tIn;
        totalTokensOut += tOut;

        const parsedJson = cleanAndParseJson(rawText);
        return validatorFn ? validatorFn(parsedJson) : parsedJson;
      } catch (err: any) {
        lastError = err;
        if (attempt < MAX_RETRIES - 1 && isTransientError(err)) {
          await waitWithJitter(attempt);
          continue;
        }
        break;
      }
    }

    throw new Error(formatFriendlyErrorMessage(lastError));
  }

  // Putaran pertama
  let currentResult = await callOnce(variables);

  // Jika targetCount dan gapFillerFn didefinisikan:
  if (targetCount && gapFillerFn) {
    let currentCount = 0;
    if ((currentResult as any)?.soal) {
      currentCount = (currentResult as any).soal.length;
    } else if ((currentResult as any)?.kartu) {
      currentCount = (currentResult as any).kartu.length;
    }

    const MAX_GAP_ROUNDS = 2;
    let round = 0;

    while (currentCount < targetCount && round < MAX_GAP_ROUNDS) {
      const elapsed = Date.now() - startTime;
      if (totalDeadlineMs - elapsed < 5000) {
        break;
      }

      const diff = targetCount - currentCount;
      const gapVars = { ...variables, jumlah: diff };

      try {
        const additionalResult = await callOnce(gapVars);
        currentResult = gapFillerFn(currentResult, additionalResult);

        if ((currentResult as any)?.soal) {
          currentCount = (currentResult as any).soal.length;
        } else if ((currentResult as any)?.kartu) {
          currentCount = (currentResult as any).kartu.length;
        }
      } catch {
        break;
      }

      round++;
    }
  }

  return {
    data: currentResult,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
  };
}

/**
 * Panggilan streaming untuk Tanya Jawab (QA) dan Ringkasan.
 * Memastikan onBeforeClose di-await SEBELUM controller.close() agar serverless function tidak mati di tengah jalan.
 * Menggunakan AbortController terhubung ke deadline total untuk menghentikan pemanggilan yang macet.
 * Bila terpotong karena batas waktu atau gangguan koneksi, teks parsial TIDAK disimpan ke generations cache,
 * namun usage_log tetap diperbarui dan stream ditutup secara rapi dengan penanda [TRUNCATED:...].
 */
export async function generateStream(
  options: GenerationOptions,
  handlers?: StreamHandlers
): Promise<ReadableStream<Uint8Array>> {
  const { promptName, variables, customSystemInstruction, totalDeadlineMs = 48000 } = options;

  const rendered: RenderedPrompt = renderPrompt(promptName, variables);
  const systemInstruction = customSystemInstruction || rendered.systemInstruction;

  const ai = getGeminiClient();
  const model = getModelName();
  const startTime = Date.now();

  const abortController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    abortController.abort(new Error('DEADLINE_EXCEEDED'));
  }, totalDeadlineMs);

  let responseStream: any;
  try {
    responseStream = await ai.models.generateContentStream({
      model,
      contents: rendered.promptText,
      config: {
        systemInstruction,
        temperature: options.temperature ?? 0.2,
        httpOptions: {
          timeout: totalDeadlineMs,
        },
      },
    });
  } catch (err: any) {
    clearTimeout(deadlineTimer);
    throw err;
  }

  const encoder = new TextEncoder();
  let accumulatedText = '';
  let isFullyCompleted = false;
  let latestUsageMetadata: any = null;

  return new ReadableStream({
    async start(controller) {
      // Promise yang reject seketika jika deadline timer atau abortController terpicu
      const abortPromise = new Promise<never>((_, reject) => {
        if (abortController.signal.aborted) {
          reject(abortController.signal.reason || new Error('DEADLINE_EXCEEDED'));
          return;
        }
        abortController.signal.addEventListener(
          'abort',
          () => reject(abortController.signal.reason || new Error('DEADLINE_EXCEEDED')),
          { once: true }
        );
      });

      const iterator = responseStream[Symbol.asyncIterator]();
      let streamStoppedEarly = false;
      let stopReason: 'deadline' | 'error' | null = null;

      try {
        while (true) {
          // Periksa apakah batas total waktu telah tercapai
          if (Date.now() - startTime >= totalDeadlineMs) {
            streamStoppedEarly = true;
            stopReason = 'deadline';
            break;
          }

          // Race antara pembacaan chunk berikutnya dan abortController
          // Menjamin stream yang macet/hung langsung berhenti tanpa menunggu tanpa batas
          let nextResult: IteratorResult<any>;
          try {
            nextResult = await Promise.race([iterator.next(), abortPromise]);
          } catch (raceErr: any) {
            streamStoppedEarly = true;
            if (abortController.signal.aborted || raceErr?.message?.includes('DEADLINE_EXCEEDED')) {
              stopReason = 'deadline';
            } else {
              stopReason = 'error';
            }
            break;
          }

          if (nextResult.done) {
            isFullyCompleted = true;
            break;
          }

          const chunk = nextResult.value;
          // Simpan metadata penggunaan token dari SDK jika tersedia
          if (chunk?.usageMetadata) {
            latestUsageMetadata = chunk.usageMetadata;
          }

          const chunkText = chunk?.text || '';
          if (chunkText) {
            accumulatedText += chunkText;
            controller.enqueue(encoder.encode(chunkText));
          }
        }
      } catch (loopErr: any) {
        streamStoppedEarly = true;
        stopReason = 'error';
      } finally {
        clearTimeout(deadlineTimer);
        if (typeof iterator.return === 'function') {
          try {
            await iterator.return();
          } catch {
            // Abaikan kesalahan penutupan generator internal
          }
        }
      }

      // Hitung token: gunakan metadata token resmi dari respons SDK bila tersedia.
      // Bila stream terhenti sebelum metadata akhir tiba, gunakan estimasi rasio standar Gemini (~4 karakter per token).
      const tokensIn =
        latestUsageMetadata?.promptTokenCount ?? Math.ceil(rendered.promptText.length / 4);
      const tokensOut =
        latestUsageMetadata?.candidatesTokenCount ?? Math.max(1, Math.ceil(accumulatedText.length / 4));

      if (streamStoppedEarly || !isFullyCompleted) {
        // KASUS PARSIAL: Terpotong karena deadline atau error di tengah stream
        // 1. Kirim penanda teks di akhir stream agar pembaca/klien mengetahui bahwa hasil tidak lengkap
        const marker =
          stopReason === 'deadline'
            ? '\n\n[TRUNCATED: Batas waktu pemrosesan AI tercapai. Hasil terpotong.]'
            : '\n\n[TRUNCATED: Terjadi gangguan koneksi pemrosesan AI. Hasil terpotong.]';
        controller.enqueue(encoder.encode(marker));

        // 2. JANGAN simpan teks parsial ke generations cache!
        // Tetap perbarui token di baris reservasi usage_log untuk token yang sempat terpakai
        if (handlers?.onPartial) {
          try {
            await handlers.onPartial(accumulatedText, tokensIn, tokensOut, stopReason || 'deadline');
          } catch (pErr) {
            console.error('[generateStream onPartial error]:', pErr);
          }
        } else if (handlers?.onCancel) {
          try {
            await handlers.onCancel(accumulatedText, tokensIn, tokensOut);
          } catch (cErr) {
            console.error('[generateStream onCancel fallback error]:', cErr);
          }
        }

        // 3. Tutup stream dengan rapi
        controller.close();
      } else {
        // KASUS NORMAL: Stream selesai sepenuhnya
        if (handlers?.onBeforeClose) {
          try {
            await handlers.onBeforeClose(accumulatedText, tokensIn, tokensOut);
          } catch (callbackErr) {
            console.error('[generateStream onBeforeClose error]:', callbackErr);
          }
        }
        controller.close();
      }
    },
    async cancel(reason) {
      clearTimeout(deadlineTimer);
      abortController.abort();
      if (!isFullyCompleted) {
        // Estimasi token saat pembatalan dini oleh klien
        const tokensIn =
          latestUsageMetadata?.promptTokenCount ?? Math.ceil(rendered.promptText.length / 4);
        const tokensOut =
          latestUsageMetadata?.candidatesTokenCount ?? Math.max(1, Math.ceil(accumulatedText.length / 4));

        if (handlers?.onCancel) {
          try {
            await handlers.onCancel(accumulatedText, tokensIn, tokensOut);
          } catch (cancelErr) {
            console.error('[generateStream onCancel error]:', cancelErr);
          }
        }
      }
    },
  });
}
