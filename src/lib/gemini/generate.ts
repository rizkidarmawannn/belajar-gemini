import 'server-only';
import { getGeminiClient, getModelCandidates, openGeminiSseStream } from './client.ts';
import { renderPrompt, type RenderedPrompt } from './render-prompt.ts';
import { cleanAndParseJson } from '../validators/index.ts';
import { trimContinuationOverlap } from './sse-stream.ts';

export interface GenerationOptions {
  promptName: string;
  variables: Record<string, any>;
  customSystemInstruction?: string;
  extraSystemInstruction?: string;
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

// Cek apakah error layak dicoba dengan model alternatif (overload, 503, timeout, 404, jaringan)
function shouldRotateModel(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status || error?.statusCode;

  return (
    status === 429 ||
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('500') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('not found') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('headers timeout') ||
    msg.includes('und_err') ||
    msg.includes('terminated') ||
    msg.includes('econnreset') ||
    msg.includes('socket') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('other side closed')
  );
}

// Cek apakah error merupakan error sementara yang layak di-retry
function isTransientError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  const name = (error?.name || '').toLowerCase();

  return (
    shouldRotateModel(error) ||
    name === 'zoderror' ||
    msg.includes('format json') ||
    msg.includes('json') ||
    msg.includes('parse') ||
    msg.includes('respons model kosong') ||
    msg.includes('tidak valid') ||
    msg.includes('wajib') ||
    msg.includes('harus') ||
    msg.includes('minimal') ||
    msg.includes('tingkat kesulitan') ||
    msg.includes('kriteria kualitas')
  );
}

// Format pesan error menjadi bahasa Indonesia yang ramah & aman (tanpa membocorkan kunci/stack trace)
export function formatFriendlyErrorMessage(error: any): string {
  const rawMsg = typeof error?.message === 'string' ? error.message : '';
  const msg = rawMsg.toLowerCase();
  const name = (error?.name || '').toLowerCase();

  if (msg.includes('gemini_model belum dikonfigurasi')) {
    return rawMsg;
  }
  if (msg.includes('tingkat kesulitan')) {
    return 'AI belum berhasil menyusun soal dengan tingkat kesulitan yang diminta. Silakan coba buat kuis kembali.';
  }
  if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
    return 'Layanan Gemini sedang mengalami lonjakan beban atau batas pemakaian tercapai. Mohon tunggu beberapa detik dan coba kembali.';
  }
  if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('unavailable')) {
    return 'Server model Gemini sedang mengalami lonjakan trafik sementara. Silakan coba lagi beberapa detik lagi.';
  }
  if (msg.includes('502') || msg.includes('504') || msg.includes('gateway')) {
    return 'Gateway server AI sempat padat atau melewati batas waktu. Silakan coba lagi sesaat lagi.';
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harm')) {
    return 'Permintaan tidak dapat diproses oleh AI karena terdeteksi melanggar filter keamanan konten.';
  }
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('deadline')) {
    return 'Waktu proses pemanggilan AI melebihi batas waktu (timeout). Silakan coba dengan bab yang lebih pendek.';
  }
  if (msg.includes('econnreset') || msg.includes('socket') || msg.includes('terminated') || msg.includes('fetch failed') || msg.includes('network')) {
    return 'Koneksi jaringan ke server AI sempat terputus. Silakan coba kembali sesaat lagi.';
  }
  if (msg.includes('api key') || msg.includes('unauthenticated')) {
    return 'Konfigurasi otentikasi AI server bermasalah. Harap periksa GEMINI_API_KEY.';
  }
  if (
    name === 'zoderror' ||
    msg.includes('format json') ||
    msg.includes('respons model kosong') ||
    msg.includes('kriteria kualitas') ||
    msg.includes('tidak valid')
  ) {
    return 'Format jawaban AI belum lengkap atau belum sesuai struktur. Silakan coba buat ulang sekali lagi.';
  }

  return 'Terjadi kendala saat berkomunikasi dengan asisten AI. Silakan coba kembali sesaat lagi.';
}

/**
 * Panggilan Gemini untuk menghasilkan teks (Ringkasan, Mnemonic, QA)
 * dengan rotasi fallback model saat overload/503 dan batas waktu terkontrol.
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
  const candidates = getModelCandidates();
  let modelIdx = 0;

  const startTime = Date.now();
  let lastError: any = null;
  const MAX_RETRIES = Math.max(3, candidates.length + 1);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const elapsed = Date.now() - startTime;
    const remainingTime = totalDeadlineMs - elapsed;

    if (remainingTime < 3000) {
      throw new Error(
        'Waktu proses melebihi batas aman yang diizinkan (timeout). Silakan coba lagi atau gunakan materi per bab.'
      );
    }

    const activeModel = candidates[Math.min(modelIdx, candidates.length - 1)];
    const hasFallbackAhead = modelIdx + 1 < candidates.length;
    const effectiveTimeout = hasFallbackAhead
      ? Math.min(calculateEffectiveTimeout(attemptTimeoutMs, remainingTime), 13000)
      : calculateEffectiveTimeout(attemptTimeoutMs, remainingTime);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const callPromise = ai.models.generateContent({
        model: activeModel,
        contents: rendered.promptText,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.2,
          httpOptions: {
            timeout: effectiveTimeout,
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), effectiveTimeout);
      });

      const response: any = await Promise.race([callPromise, timeoutPromise]);

      const text = (response?.text || '').toString().trim();
      if (!text) {
        throw new Error('Respons model kosong atau bukan string.');
      }

      const tokensIn = response.usageMetadata?.promptTokenCount || Math.ceil(rendered.promptText.length / 4);
      const tokensOut = response.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);

      return {
        data: text,
        tokensIn,
        tokensOut,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[generateText] Percobaan ${attempt + 1} (${activeModel}) gagal:`,
        err?.message || err
      );

      if (attempt < MAX_RETRIES - 1 && isTransientError(err)) {
        if (shouldRotateModel(err) && modelIdx + 1 < candidates.length) {
          modelIdx++;
          await waitWithJitter(0, 150);
        } else {
          await waitWithJitter(attempt, 600);
        }
        continue;
      }
      break;
    } finally {
      if (timer) clearTimeout(timer);
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
  const candidates = getModelCandidates();
  const startTime = Date.now();

  let totalTokensIn = 0;
  let totalTokensOut = 0;

  // Helper untuk 1 kali eksekusi generateContent JSON dengan rotasi model cadangan bila overload
  async function callOnce(
    currentVars: Record<string, any>,
    instructionSuffix?: string
  ): Promise<any> {
    const rendered: RenderedPrompt = renderPrompt(promptName, currentVars);
    const baseInstruction = customSystemInstruction || rendered.systemInstruction;
    const systemInstruction = [baseInstruction, options.extraSystemInstruction, instructionSuffix]
      .filter(Boolean)
      .join('\n\n');

    let lastError: any = null;
    let modelIdx = 0;
    const MAX_RETRIES = Math.max(3, candidates.length + 1);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const elapsed = Date.now() - startTime;
      const remainingTime = totalDeadlineMs - elapsed;

      if (remainingTime < 3000) {
        throw new Error('Waktu proses melebihi batas aman yang diizinkan (timeout).');
      }

      const activeModel = candidates[Math.min(modelIdx, candidates.length - 1)];
      const hasFallbackAhead = modelIdx + 1 < candidates.length;
      const effectiveTimeout = hasFallbackAhead
        ? Math.min(calculateEffectiveTimeout(attemptTimeoutMs, remainingTime), 18000)
        : calculateEffectiveTimeout(attemptTimeoutMs, remainingTime);

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const callPromise = ai.models.generateContent({
          model: activeModel,
          contents: rendered.promptText,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: options.temperature ?? 0.2,
            httpOptions: {
              timeout: effectiveTimeout,
            },
          },
        });

        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), effectiveTimeout);
        });

        const response: any = await Promise.race([callPromise, timeoutPromise]);
        const rawText = (response?.text || '').toString();

        const tIn = response.usageMetadata?.promptTokenCount || Math.ceil(rendered.promptText.length / 4);
        const tOut = response.usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4);
        totalTokensIn += tIn;
        totalTokensOut += tOut;

        const parsedJson = cleanAndParseJson(rawText);
        return validatorFn ? validatorFn(parsedJson) : parsedJson;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[generateJson] Percobaan ${attempt + 1} (${activeModel}) gagal:`,
          err?.message || err
        );

        if (attempt < MAX_RETRIES - 1 && isTransientError(err)) {
          if (shouldRotateModel(err) && modelIdx + 1 < candidates.length) {
            modelIdx++;
            await waitWithJitter(0, 150);
          } else {
            await waitWithJitter(attempt, 600);
          }
          continue;
        }
        break;
      } finally {
        if (timer) clearTimeout(timer);
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

    const MAX_GAP_ROUNDS = 3;
    let round = 0;

    while (currentCount < targetCount && round < MAX_GAP_ROUNDS) {
      const elapsed = Date.now() - startTime;
      if (totalDeadlineMs - elapsed < 5000) {
        break;
      }

      const diff = targetCount - currentCount;
      const bufferedDiff = diff >= 2 && diff <= 8 ? diff + 1 : diff;
      const gapVars = { ...variables, jumlah: bufferedDiff };

      const existingStems = Array.isArray((currentResult as any)?.soal)
        ? (currentResult as any).soal
            .slice(-20)
            .map((s: any) => String(s?.pertanyaan || '').trim().slice(0, 90))
            .filter(Boolean)
        : Array.isArray((currentResult as any)?.kartu)
        ? (currentResult as any).kartu
            .slice(-20)
            .map((c: any) => String(c?.depan || '').trim().slice(0, 90))
            .filter(Boolean)
        : [];

      const avoidHint =
        existingStems.length > 0
          ? `ATURAN TAMBAHAN KEKURANGAN BUTIR: Anda wajib menghasilkan ${bufferedDiff} butir BARU yang tidak mengulang daftar berikut:\n- ${existingStems.join('\n- ')}`
          : undefined;

      try {
        const additionalResult = await callOnce(gapVars, avoidHint);
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

async function recoverInterruptedStream(params: {
  models: string[];
  systemInstruction: string;
  renderedPromptText: string;
  temperature: number;
  accumulatedText: string;
  remainingTimeMs: number;
  abortSignal: AbortSignal;
  abortPromise: Promise<never>;
}): Promise<{ appendText: string; tokensIn: number; tokensOut: number } | null> {
  const {
    models,
    systemInstruction,
    renderedPromptText,
    temperature,
    accumulatedText,
    remainingTimeMs,
    abortSignal,
    abortPromise,
  } = params;

  const hasPrefix = accumulatedText.trim().length > 0;
  const recoveryPrompt = hasPrefix
    ? `${renderedPromptText}\n\n---\nPERHATIAN PENTING: Sebagian awal jawaban sudah dikirimkan ke pengguna hingga tepat pada akhiran berikut:\n<TEKS_SUDAH_TERKIRIM>\n${accumulatedText}\n</TEKS_SUDAH_TERKIRIM>\n\nLanjutkan penulisan TEPAT dari titik akhir di atas sampai seluruh bagian selesai tuntas.\nATURAN LANJUTAN:\n1. DILARANG mengulang kata, kalimat, atau subjudul yang sudah ada di dalam <TEKS_SUDAH_TERKIRIM>.\n2. Jika kalimat, tanda baca, atau format markdown terakhir terpotong di tengah jalan, langsung selesaikan kalimat tersebut lalu teruskan ke bagian berikutnya.`
    : renderedPromptText;

  const ai = getGeminiClient();
  const recoveryDeadline = Date.now() + remainingTimeMs;
  const MAX_RECOVERY_ATTEMPTS = Math.max(2, models.length);

  for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt++) {
    if (abortSignal.aborted) return null;
    const timeLeft = recoveryDeadline - Date.now();
    if (timeLeft < 3000) return null;

    const activeModel = models[Math.min(attempt, models.length - 1)];
    const effectiveTimeout = calculateEffectiveTimeout(15000, timeLeft);
    let recTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        recTimer = setTimeout(() => reject(new Error('timeout')), effectiveTimeout);
      });

      const response: any = await Promise.race([
        ai.models.generateContent({
          model: activeModel,
          contents: recoveryPrompt,
          config: {
            systemInstruction,
            temperature,
            httpOptions: {
              timeout: effectiveTimeout,
            },
          },
        }),
        timeoutPromise,
        abortPromise,
      ]);

      const rawText = (response?.text || '').toString();
      const appendText = hasPrefix
        ? trimContinuationOverlap(accumulatedText, rawText)
        : rawText.trim();

      if (!appendText || appendText.trim().length === 0) {
        continue;
      }

      return {
        appendText,
        tokensIn:
          response?.usageMetadata?.promptTokenCount ?? Math.ceil(recoveryPrompt.length / 4),
        tokensOut:
          response?.usageMetadata?.candidatesTokenCount ?? Math.max(1, Math.ceil(appendText.length / 4)),
      };
    } catch (recErr: any) {
      if (abortSignal.aborted) return null;
      console.warn(
        `[generateStream recovery attempt ${attempt + 1}] (${activeModel}) Gagal memulihkan stream:`,
        recErr?.message || recErr
      );
      if (attempt < MAX_RECOVERY_ATTEMPTS - 1 && isTransientError(recErr)) {
        await waitWithJitter(0, 200);
        continue;
      }
      return null;
    } finally {
      if (recTimer) clearTimeout(recTimer);
    }
  }

  return null;
}

/**
 * Panggilan streaming untuk Tanya Jawab (QA), Ringkasan, Mnemonic, dan Penjelasan Kuis.
 * Menggunakan parser SSE UTF-8 streaming yang tahan pemotongan chunk, rotasi fallback model,
 * retry pembukaan stream, serta pemulihan otomatis apabila koneksi SSE terputus di tengah jalan.
 */
export async function generateStream(
  options: GenerationOptions,
  handlers?: StreamHandlers
): Promise<ReadableStream<Uint8Array>> {
  const { promptName, variables, customSystemInstruction, totalDeadlineMs = 48000 } = options;

  const rendered: RenderedPrompt = renderPrompt(promptName, variables);
  const systemInstruction = customSystemInstruction || rendered.systemInstruction;
  const temperature = options.temperature ?? 0.2;

  const candidates = getModelCandidates();
  let modelIdx = 0;
  let activeStreamModel = candidates[0];
  const startTime = Date.now();

  const abortController = new AbortController();
  let isClientCancelled = false;
  const deadlineTimer = setTimeout(() => {
    abortController.abort(new Error('DEADLINE_EXCEEDED'));
  }, totalDeadlineMs);

  let responseStream: AsyncGenerator<{ text: string; usageMetadata?: any; finishReason?: string }>;
  const MAX_OPEN_RETRIES = Math.max(3, candidates.length + 1);
  let openError: any = null;

  for (let attempt = 0; attempt < MAX_OPEN_RETRIES; attempt++) {
    const remaining = totalDeadlineMs - (Date.now() - startTime);
    if (remaining < 4000) {
      openError = new Error('DEADLINE_EXCEEDED');
      break;
    }

    activeStreamModel = candidates[Math.min(modelIdx, candidates.length - 1)];
    const hasFallbackAhead = modelIdx + 1 < candidates.length;
    const connectSignal = hasFallbackAhead
      ? AbortSignal.any([abortController.signal, AbortSignal.timeout(Math.min(10000, remaining - 2000))])
      : abortController.signal;

    try {
      responseStream = await openGeminiSseStream({
        model: activeStreamModel,
        promptText: rendered.promptText,
        systemInstruction,
        temperature,
        signal: connectSignal,
      });
      openError = null;
      break;
    } catch (err: any) {
      openError = err;
      if (abortController.signal.aborted) break;

      if (attempt < MAX_OPEN_RETRIES - 1 && isTransientError(err)) {
        console.warn(
          `[generateStream open attempt ${attempt + 1}] (${activeStreamModel}) Gagal membuka stream:`,
          err?.message || err
        );
        if (shouldRotateModel(err) && modelIdx + 1 < candidates.length) {
          modelIdx++;
          await waitWithJitter(0, 150);
        } else {
          await waitWithJitter(attempt, 600);
        }
        continue;
      }
      break;
    }
  }

  if (openError || !responseStream!) {
    clearTimeout(deadlineTimer);
    throw openError || new Error('Gagal membuka koneksi streaming Gemini.');
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
      // Cegah unhandledRejection bila abort terpicu setelah loop selesai
      abortPromise.catch(() => {});

      const iterator = responseStream[Symbol.asyncIterator]();
      let streamStoppedEarly = false;
      let stopReason: 'deadline' | 'error' | null = null;

      try {
        while (true) {
          if (Date.now() - startTime >= totalDeadlineMs) {
            streamStoppedEarly = true;
            stopReason = 'deadline';
            break;
          }

          let nextResult: IteratorResult<{ text: string; usageMetadata?: any; finishReason?: string }>;
          try {
            nextResult = await Promise.race([iterator.next(), abortPromise]);
          } catch (raceErr: any) {
            streamStoppedEarly = true;
            if (
              isClientCancelled ||
              abortController.signal.aborted ||
              raceErr?.message?.includes('DEADLINE_EXCEEDED')
            ) {
              stopReason = 'deadline';
            } else {
              stopReason = 'error';
              console.warn(
                `[generateStream] Koneksi stream terputus pada ${accumulatedText.length} karakter:`,
                raceErr?.message || raceErr
              );
            }
            break;
          }

          if (nextResult.done) {
            if (accumulatedText.trim().length > 0) {
              isFullyCompleted = true;
            } else {
              streamStoppedEarly = true;
              stopReason = 'error';
              console.warn('[generateStream] Stream ditutup tanpa konten teks.');
            }
            break;
          }

          const chunk = nextResult.value;
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
        stopReason = isClientCancelled || abortController.signal.aborted ? 'deadline' : 'error';
        console.warn(
          `[generateStream] Loop stream terhenti pada ${accumulatedText.length} karakter:`,
          loopErr?.message || loopErr
        );
      } finally {
        if (typeof iterator.return === 'function') {
          try {
            await iterator.return(undefined);
          } catch {
            // Abaikan kesalahan penutupan generator internal
          }
        }
      }

      let recoveredTokensIn = 0;
      let recoveredTokensOut = 0;

      // Bila terhenti karena gangguan koneksi/SSE mid-stream (bukan pembatalan/deadline),
      // pulihkan sisa jawaban secara otomatis lewat panggilan non-stream sebelum menutup stream.
      if (
        streamStoppedEarly &&
        stopReason === 'error' &&
        !isClientCancelled &&
        !abortController.signal.aborted
      ) {
        const remainingForRecovery = totalDeadlineMs - (Date.now() - startTime);
        if (remainingForRecovery > 5000) {
          const orderedRecoveryModels = [
            ...candidates.filter((m) => m !== activeStreamModel),
            activeStreamModel,
          ];
          const recovered = await recoverInterruptedStream({
            models: orderedRecoveryModels,
            systemInstruction,
            renderedPromptText: rendered.promptText,
            temperature,
            accumulatedText,
            remainingTimeMs: remainingForRecovery,
            abortSignal: abortController.signal,
            abortPromise,
          });

          if (recovered && !isClientCancelled && !abortController.signal.aborted) {
            accumulatedText += recovered.appendText;
            controller.enqueue(encoder.encode(recovered.appendText));
            recoveredTokensIn = recovered.tokensIn;
            recoveredTokensOut = recovered.tokensOut;
            streamStoppedEarly = false;
            stopReason = null;
            isFullyCompleted = true;
          }
        }
      }

      clearTimeout(deadlineTimer);

      if (isClientCancelled) {
        return;
      }

      const tokensIn =
        (latestUsageMetadata?.promptTokenCount ?? Math.ceil(rendered.promptText.length / 4)) +
        recoveredTokensIn;
      const tokensOut =
        (latestUsageMetadata?.candidatesTokenCount ??
          Math.max(1, Math.ceil(accumulatedText.length / 4))) + recoveredTokensOut;

      if (streamStoppedEarly || !isFullyCompleted) {
        const marker =
          stopReason === 'deadline'
            ? '\n\n[TRUNCATED: Batas waktu pemrosesan AI tercapai. Hasil terpotong.]'
            : '\n\n[TRUNCATED: Terjadi gangguan koneksi pemrosesan AI. Hasil terpotong.]';
        controller.enqueue(encoder.encode(marker));

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

        controller.close();
      } else {
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
      isClientCancelled = true;
      clearTimeout(deadlineTimer);
      abortController.abort(reason);
      if (!isFullyCompleted) {
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
