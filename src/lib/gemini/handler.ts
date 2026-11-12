import crypto from 'crypto';
import { z } from 'zod';
import { createClient } from '../supabase/server.ts';
import { createAdminClient } from '../supabase/admin.ts';
import { generateText, generateJson, generateStream, formatFriendlyErrorMessage } from './generate.ts';
import { selectRelevantChapters } from './chapter-selector.ts';
import type { UsedChapterInfo } from './chapter-selector.ts';
import {
  validateAndSanitizeQuiz,
  validateAndSanitizeFlashcards,
  validateEssayEvaluation,
  mergeQuizResults,
  mergeFlashcardResults,
} from '../validators/index.ts';
import { getDailyQuotaLimit, getUserDailyQuotaLimit } from '../quota.ts';

// Konstanta batas ukuran materi untuk fitur QA seluruh modul (60.000 karakter / ~15.000 token)
export const QA_FULL_MODULE_CHAR_LIMIT = 60000;

// Fitur yang mendukung streaming respons teks/markdown langsung ke klien
const STREAMABLE_FEATURES = new Set(['qa', 'summary', 'summary_short', 'quiz_explain', 'mnemonic']);

/**
 * Membagi jumlah item target menjadi sub-batch seimbang agar ukuran per panggilan
 * kecil, cepat, dan bebas timeout (mis. 25 soal / max 5 => [5, 5, 5, 5, 5]).
 */
export function splitIntoBalancedBatchCounts(total: number, maxPerBatch: number): number[] {
  if (total <= 0) return [];
  const safeMax = Math.max(1, maxPerBatch);
  const numBatches = Math.ceil(total / safeMax);
  const base = Math.floor(total / numBatches);
  const remainder = total % numBatches;
  return Array.from({ length: numBatches }, (_, idx) => base + (idx < remainder ? 1 : 0));
}

/**
 * Mengeksekusi daftar task async dengan batas konkurensi agar tidak memicu burst rate-limit.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, tasks.length));
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Memastikan hasil cache kuis/flashcard benar-benar lengkap sesuai jumlah yang diminta,
 * sehingga hasil parsial lama (mis. 5 soal pada permintaan 25 soal) otomatis dilewati & diperbarui.
 */
export function isCacheCompleteForRequest(
  feature: string,
  result: any,
  requestedCount: number
): boolean {
  if (feature === 'quiz') {
    const len = Array.isArray(result?.soal) ? result.soal.length : 0;
    return len >= requestedCount;
  }
  if (feature === 'flashcards') {
    const len = Array.isArray(result?.kartu) ? result.kartu.length : 0;
    return len >= requestedCount;
  }
  return Boolean(result);
}

function buildQuizAvoidDuplicatesInstruction(
  existingQuestions: string[],
  batchNote?: string
): string | undefined {
  const parts: string[] = [];
  if (batchNote) {
    parts.push(batchNote);
  }
  if (existingQuestions.length > 0) {
    const sample = existingQuestions
      .slice(-25)
      .map((q) => `- ${q.trim().slice(0, 90)}`)
      .join('\n');
    parts.push(
      `HINDARI DUPLIKASI: Pertanyaan berikut SUDAH dibuat pada batch sebelumnya. Buat soal dengan topik, skenario, dan rumusan yang BERBEDA:\n${sample}`
    );
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

const MAX_FULL_MODULE_CHARS = 45000;

/**
 * Merangkai teks modul dengan batas karakter aman agar panggilan JSON ke Gemini
 * tidak mengirim ratusan ribu karakter sekaligus (penyebab latency tinggi & 504).
 */
export function buildBalancedModuleExcerpt(
  chunks: Array<{ chapter_title?: string; content?: string }>,
  maxChars = MAX_FULL_MODULE_CHARS
): string {
  const renderedChunks = chunks.map((c) => `${c.chapter_title || 'Bab'}\n\n${c.content || ''}`);
  const joined = renderedChunks.join('\n\n---\n\n');
  if (joined.length <= maxChars || chunks.length === 0) {
    return joined;
  }

  const perChunkBudget = Math.max(450, Math.floor((maxChars - chunks.length * 40) / chunks.length));
  return chunks
    .map((c) => {
      const title = c.chapter_title || 'Bab';
      const body = String(c.content || '').trim();
      const excerpt = body.length > perChunkBudget ? `${body.slice(0, perChunkBudget).trim()}...` : body;
      return `${title}\n\n${excerpt}`;
    })
    .join('\n\n---\n\n')
    .slice(0, maxChars);
}

function getBatchSigningSecret(): string {
  return (
    process.env.BATCH_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GEMINI_API_KEY ||
    'dev-local-batch-secret'
  );
}

export function signBatchToken(
  userId: string,
  moduleId: string,
  logId: string,
  maxBatches: number
): string {
  const safeLogId = String(logId).replace(/\./g, '_');
  const payload = `${userId}:${moduleId}:${safeLogId}:${maxBatches}`;
  const mac = crypto.createHmac('sha256', getBatchSigningSecret()).update(payload).digest('hex');
  return `${safeLogId}.${maxBatches}.${mac}`;
}

export function verifyBatchToken(
  token: string,
  userId: string,
  moduleId: string,
  expectedMaxBatches: number
): { valid: boolean; logId?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const [logId, maxStr, mac] = parts;
  if (!logId || !mac || Number(maxStr) !== expectedMaxBatches) return { valid: false };

  const expectedPayload = `${userId}:${moduleId}:${logId}:${expectedMaxBatches}`;
  const expectedMac = crypto
    .createHmac('sha256', getBatchSigningSecret())
    .update(expectedPayload)
    .digest('hex');

  try {
    const a = Buffer.from(mac, 'hex');
    const b = Buffer.from(expectedMac, 'hex');
    if (a.length === 0 || a.length !== b.length) return { valid: false };
    if (!crypto.timingSafeEqual(a, b)) return { valid: false };
    return { valid: true, logId };
  } catch {
    return { valid: false };
  }
}

// Helper merangkai jendela cuplikan modul terfokus agar pendalaman 1 soal tetap cepat (< 8.000 karakter)
function extractFocusedExcerpt(text: string, query: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text || '';
  const keywords = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  const lower = text.toLowerCase();
  let hitIdx = -1;
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      hitIdx = idx;
      break;
    }
  }

  if (hitIdx === -1) {
    return text.slice(0, maxChars);
  }

  const start = Math.max(0, hitIdx - Math.floor(maxChars * 0.35));
  const end = Math.min(text.length, start + maxChars);
  return text.slice(start, end);
}

// Helper validasi dan penyusunan variabel prompt untuk pendalaman 1 butir soal kuis
function buildQuizExplainPayload(
  params: z.infer<typeof StrictParamsSchema>,
  moduleContent: string
): {
  isValid: boolean;
  expMode: 'modul' | 'luar_modul' | 'keduanya';
  isCorrect: boolean;
  variables: Record<string, any>;
} {
  const { question, quizOptions, correctOption, selectedOption, chapterName, explanationMode } = params;
  const expMode = explanationMode || 'keduanya';
  if (!question || !question.trim() || !quizOptions || !correctOption || !selectedOption) {
    return { isValid: false, expMode, isCorrect: false, variables: {} };
  }

  const opsiText = (['A', 'B', 'C', 'D'] as const)
    .map((key) => `- **${key}.** ${quizOptions[key]}`)
    .join('\n');

  return {
    isValid: true,
    expMode,
    isCorrect: selectedOption === correctOption,
    variables: {
      pertanyaan: question.trim(),
      opsi: opsiText,
      kunci: `${correctOption} (${quizOptions[correctOption]})`,
      jawaban_pengguna: `${selectedOption} (${quizOptions[selectedOption]})`,
      status_jawaban: selectedOption === correctOption ? 'BENAR' : 'SALAH',
      bab: chapterName || 'Umum',
      mode_penjelasan: expMode,
      modul: moduleContent,
    },
  };
}

// Konstanta batas payload request POST /api/generate (64 KB)
export const MAX_GENERATE_PAYLOAD_BYTES = 64 * 1024;

// Skema Validasi Params yang Ketat (.strict() menolak properti asing tak diizinkan)
export const StrictParamsSchema = z
  .object({
    style: z.enum(['singkat', 'lengkap']).optional().default('singkat'),
    maxPoints: z.number().int().min(1).max(20).optional().default(8),
    count: z.number().int().min(1).max(100).optional().default(5),
    difficulty: z.enum(['mudah', 'sedang', 'sulit', 'campuran']).optional().default('sedang'),
    explanationMode: z.enum(['modul', 'luar_modul', 'keduanya']).optional().default('modul'),
    chapterName: z.string().max(100, 'Nama bab maksimal 100 karakter').optional().default('semua'),
    topic: z.string().max(200, 'Topik maksimal 200 karakter').optional(),
    question: z.string().max(1000, 'Pertanyaan maksimal 1000 karakter').optional(),
    userAnswer: z.string().max(3000, 'Jawaban esai maksimal 3000 karakter').optional(),
    quizOptions: z
      .object({
        A: z.string().min(1).max(600),
        B: z.string().min(1).max(600),
        C: z.string().min(1).max(600),
        D: z.string().min(1).max(600),
      })
      .strict()
      .optional(),
    correctOption: z.enum(['A', 'B', 'C', 'D']).optional(),
    selectedOption: z.enum(['A', 'B', 'C', 'D']).optional(),
    batchIndex: z.number().int().min(0).max(30).optional(),
    batchTotal: z.number().int().min(1).max(25).optional(),
    batchToken: z.string().max(240).optional(),
    excludeQuestions: z.array(z.string().max(180)).max(40).optional(),
  })
  .strict({ message: 'Objek params memuat kunci yang tidak diizinkan.' });

// Skema Permintaan Body
export const GenerateRequestSchema = z.object({
  moduleId: z.string().uuid({ message: 'ID modul harus berupa format UUID yang valid' }),
  feature: z.enum(
    ['summary', 'summary_short', 'flashcards', 'mnemonic', 'quiz', 'quiz_explain', 'qa', 'essay_eval'],
    { message: 'Fitur yang diminta tidak valid atau tidak didukung oleh database' }
  ),
  chapterPosition: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  regenerate: z.boolean().optional().default(false),
  params: StrictParamsSchema.optional().default({}),
});

// Interface dependensi agar route dapat diuji secara murni (dependency injection)
export interface GenerateDependencies {
  getAuthUser: () => Promise<{ user: any; error: any }>;
  getModule: (moduleId: string) => Promise<{ data: any; error: any }>;
  reserveUsage: (
    userId: string,
    feature: string,
    limit: number,
    tokensIn?: number | null
  ) => Promise<{ id: number | string | null; error: any }>;
  updateUsageLog: (logId: number | string | null, tokensIn: number, tokensOut: number) => Promise<void>;
  deleteUsageLog: (logId: number | string | null) => Promise<void>;
  getCachedGeneration: (
    userId: string,
    moduleId: string,
    feature: string,
    paramsHash: string,
    promptVersion: string
  ) => Promise<{ data: any; error: any }>;
  getModuleChunks: (moduleId: string, chapterPosition?: number) => Promise<{ data: any; error: any }>;
  callGeminiText: (opts: any) => Promise<{ data: string; tokensIn: number; tokensOut: number }>;
  callGeminiJson: (
    opts: any,
    validator?: any,
    targetCount?: number,
    gapFiller?: any
  ) => Promise<{ data: any; tokensIn: number; tokensOut: number }>;
  callGeminiStream: (opts: any, handlers?: any) => Promise<ReadableStream<Uint8Array>>;
  saveGeneration: (entry: any) => Promise<void>;
  dailyQuotaLimit: number;
  getUserQuotaLimit?: (user: any) => number;
  promptVersion: string;
}

// Fungsi inti penanganan generate (dipakai di route POST dan diuji langsung di tes unit)
export async function handleGenerate(deps: GenerateDependencies, rawBody: any) {
  // 0. Batas Ukuran Payload (Tolak 413 SEBELUM JSON.parse dan SEBELUM Zod)
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf-8') > MAX_GENERATE_PAYLOAD_BYTES) {
      return Response.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_GENERATE_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }
    try {
      rawBody = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Format JSON permintaan tidak valid.' }, { status: 400 });
    }
  }

  // 1. Verifikasi Pengguna
  const { user, error: authError } = await deps.getAuthUser();
  if (authError || !user) {
    return Response.json(
      { error: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
      { status: 401 }
    );
  }

  // 2. Validasi Input (Zod Strict)
  let body: z.infer<typeof GenerateRequestSchema>;
  try {
    body = GenerateRequestSchema.parse(rawBody);
  } catch (valErr: any) {
    const issues = valErr.issues ? valErr.issues.map((i: any) => i.message).join(', ') : valErr.message;
    return Response.json(
      { error: `Data permintaan tidak valid: ${issues}` },
      { status: 400 }
    );
  }

  // 3. Cek Kepemilikan Modul & Status Kesiapan
  const { data: moduleData, error: moduleError } = await deps.getModule(body.moduleId);
  if (moduleError || !moduleData) {
    return Response.json(
      { error: 'Modul tidak ditemukan atau Anda tidak memiliki hak akses terhadap modul ini.' },
      { status: 404 }
    );
  }

  if (moduleData.status !== 'ready') {
    return Response.json(
      { error: `Modul belum siap dipelajari (status saat ini: ${moduleData.status}). Harap tunggu hingga proses ekstraksi selesai.` },
      { status: 400 }
    );
  }

  // 4. Cek Kontinuasi Batch Kuis & Cache (generations)
  const isChunkedQuiz =
    body.feature === 'quiz' && typeof body.params.batchTotal === 'number' && body.params.batchTotal > 1;
  const batchIndex = body.params.batchIndex ?? 0;
  const maxBatches = isChunkedQuiz ? Math.min(30, (body.params.batchTotal || 1) + 3) : 1;
  const isContinuationBatch = isChunkedQuiz && batchIndex > 0;

  let verifiedBatchLogId: string | undefined;
  if (isContinuationBatch) {
    if (batchIndex >= maxBatches) {
      return Response.json(
        { error: 'Indeks batch kuis melebihi batas sesi yang diizinkan.' },
        { status: 403 }
      );
    }
    const verified = verifyBatchToken(
      body.params.batchToken || '',
      user.id,
      body.moduleId,
      maxBatches
    );
    if (!verified.valid) {
      return Response.json(
        { error: 'Token sesi batch kuis tidak valid atau sudah berakhir. Silakan ulangi pembuatan kuis.' },
        { status: 403 }
      );
    }
    verifiedBatchLogId = verified.logId;
  }

  // feature dan chapterPosition ditaruh SETELAH spread params agar params tidak dapat menimpanya!
  const normalizedObject: Record<string, any> = {
    ...body.params,
    feature: body.feature,
    chapterPosition: body.chapterPosition ?? 'all',
  };
  delete normalizedObject.batchToken;
  delete normalizedObject.excludeQuestions;
  const sortedKeys = Object.keys(normalizedObject).sort();
  const sortedParams: Record<string, any> = {};
  for (const k of sortedKeys) {
    sortedParams[k] = normalizedObject[k];
  }
  const paramsHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedParams))
    .digest('hex');

  if (!body.regenerate) {
    const { data: cachedGen } = await deps.getCachedGeneration(
      user.id,
      body.moduleId,
      body.feature,
      paramsHash,
      deps.promptVersion
    );

    const requestedItemCount = body.params.count || 5;
    if (cachedGen && isCacheCompleteForRequest(body.feature, cachedGen.result, requestedItemCount)) {
      const cachedUsedChapters = (cachedGen.result as any)?.usedChapters;

      // Jika mode stream diminta dan cache hit, kembalikan juga sebagai stream teks dengan header X-Cache: HIT
      if (body.stream && STREAMABLE_FEATURES.has(body.feature)) {
        const textContent =
          body.feature === 'qa'
            ? (cachedGen.result as any)?.answer || ''
            : (cachedGen.result as any)?.markdown || '';

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(textContent));
            controller.close();
          },
        });

        const hitHeaders: Record<string, string> = {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Cache': 'HIT',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        };
        if (cachedUsedChapters) {
          hitHeaders['X-Used-Chapters'] = encodeURIComponent(JSON.stringify(cachedUsedChapters));
        }

        return new Response(stream, { headers: hitHeaders });
      }

      return Response.json({
        success: true,
        cached: true,
        feature: body.feature,
        result: cachedGen.result,
        usedChapters: cachedUsedChapters,
        ...(isChunkedQuiz && batchIndex === 0
          ? {
              batchToken: signBatchToken(
                user.id,
                body.moduleId,
                `cached-${crypto.randomUUID()}`,
                maxBatches
              ),
            }
          : {}),
        tokens: {
          in: cachedGen.tokens_in || 0,
          out: cachedGen.tokens_out || 0,
        },
      });
    }
  }

  // 5. Ambil Teks dari module_chunks di Server (Dilarang menerima dari client body)
  const { data: chunksData, error: chunkErr } = await deps.getModuleChunks(body.moduleId, body.chapterPosition);
  if (chunkErr || !chunksData) {
    return Response.json(
      { error: 'Materi bab modul kosong atau belum selesai diekstrak.' },
      { status: 422 }
    );
  }

  let moduleContent = '';
  let usedChaptersPayload: any = undefined;

  if (Array.isArray(chunksData)) {
    if (chunksData.length === 0) {
      return Response.json(
        { error: 'Materi bab modul kosong atau belum selesai diekstrak.' },
        { status: 422 }
      );
    }

    // Jika QA tanpa pilihan bab eksplisit (lingkup seluruh modul)
    if (body.feature === 'qa') {
      if (!body.chapterPosition) {
        const totalChars = chunksData.reduce((acc: number, c: any) => acc + (c.content?.length || 0), 0);

        if (totalChars <= QA_FULL_MODULE_CHAR_LIMIT) {
          // Modul <= 60.000 karakter: Kirim SELURUH modul tanpa seleksi bab
          moduleContent = chunksData.map((c: any) => `### ${c.chapter_title}\n\n${c.content}`).join('\n\n---\n\n');
          // Untuk seluruh modul: kirim penanda 'all' dan jumlah bab agar header tetap ramping & aman
          usedChaptersPayload = { mode: 'all', count: chunksData.length };
        } else {
          // Modul besar (> 60.000 karakter): Pilih bab paling relevan berdasarkan kecocokan kata kunci pertanyaan
          const selection = selectRelevantChapters(chunksData, body.params?.question || '', {
            maxChapters: 4,
            maxChars: 45000,
          });

          // Jika tidak ada bab cocok di modul besar: izinkan AI fallback ke pengetahuan umum
          if (!selection.hasMatch || selection.selectedChunks.length === 0) {
            const chapterList = chunksData.map((c: any) => `- Bab ${c.position}: ${c.chapter_title}`).join('\n');
            moduleContent = `Daftar Bab dalam Dokumen Modul:\n${chapterList}\n\n(Catatan: Pertanyaan pengguna tidak memiliki kecocokan materi di bab-bab di atas. Jawablah menggunakan literatur/pengetahuan umum yang kredibel dan cantumkan sumber referensinya sesuai aturan prompt.)`;
            usedChaptersPayload = { mode: 'external' };
          } else {
            // Untuk bab terpilih: kirim maksimal 5 bab
            usedChaptersPayload = selection.usedChapters.slice(0, 5);
            moduleContent = selection.selectedChunks
              .map((c: any) => `### ${c.chapter_title}\n\n${c.content}`)
              .join('\n\n---\n\n');
          }
        }
      }
    } else if (body.feature === 'quiz_explain') {
      // Untuk pendalaman 1 butir soal kuis: kirim maksimal 1 bab terfokus agar TTFT & streaming cepat bebas 504
      const expMode = body.params.explanationMode || 'keduanya';
      const chapterCharBudget = expMode === 'luar_modul' ? 2200 : 7500;
      const searchQuery = [
        body.params.chapterName && body.params.chapterName !== 'semua' ? body.params.chapterName : '',
        body.params.question || '',
        ...(body.params.quizOptions ? Object.values(body.params.quizOptions) : []),
      ]
        .filter(Boolean)
        .join(' ');

      const chunksWithPos = chunksData.map((c: any, idx: number) => ({
        ...c,
        position: typeof c.position === 'number' ? c.position : idx + 1,
      }));

      const selection = selectRelevantChapters(chunksWithPos, searchQuery, {
        maxChapters: 1,
        maxChars: chapterCharBudget,
      });

      const chosenChunks =
        selection.hasMatch && selection.selectedChunks.length > 0
          ? selection.selectedChunks.slice(0, 1)
          : chunksWithPos.slice(0, 1);

      usedChaptersPayload = chosenChunks.map((c: any) => ({
        position: c.position,
        chapter_title: c.chapter_title,
      }));
      moduleContent = chosenChunks
        .map((c: any) => `### ${c.chapter_title}\n\n${extractFocusedExcerpt(c.content || '', searchQuery, chapterCharBudget)}`)
        .join('\n\n---\n\n');
    } else if (isChunkedQuiz && chunksData.length >= 2) {
      const numSlices = Math.min(chunksData.length, body.params.batchTotal || 1);
      const sliceIdx = batchIndex % numSlices;
      const startIdx = Math.floor((sliceIdx * chunksData.length) / numSlices);
      const endIdx = Math.floor(((sliceIdx + 1) * chunksData.length) / numSlices);
      const slice = chunksData.slice(startIdx, Math.max(startIdx + 1, endIdx));
      const candidateText = buildBalancedModuleExcerpt(slice, MAX_FULL_MODULE_CHARS);
      moduleContent =
        candidateText.trim().length >= 800
          ? candidateText
          : buildBalancedModuleExcerpt(chunksData, MAX_FULL_MODULE_CHARS);
    } else {
      moduleContent = buildBalancedModuleExcerpt(chunksData, MAX_FULL_MODULE_CHARS);
    }
  } else {
    moduleContent = `${chunksData.chapter_title}\n\n${chunksData.content}`.slice(0, MAX_FULL_MODULE_CHARS);
    if (body.feature === 'quiz_explain') {
      const chapterCharBudget = body.params.explanationMode === 'luar_modul' ? 2200 : 7500;
      const searchQuery = body.params.question || '';
      moduleContent = extractFocusedExcerpt(moduleContent, searchQuery, chapterCharBudget);
    }
    if (body.feature === 'qa' || body.feature === 'quiz_explain') {
      usedChaptersPayload = [{ position: chunksData.position ?? body.chapterPosition ?? 1, chapter_title: chunksData.chapter_title }];
    }
  }

  // 6. RESERVASI ATOMIK KUOTA HARIAN (Hanya untuk panggilan baru / batchIndex === 0)
  const effectiveQuotaLimit = typeof deps.getUserQuotaLimit === 'function'
    ? deps.getUserQuotaLimit(user)
    : deps.dailyQuotaLimit;

  const initialTokensIn = Math.ceil(moduleContent.length / 4);
  let reservedLogId: number | string | null = verifiedBatchLogId ?? null;

  if (!isContinuationBatch) {
    const { id: newLogId, error: reserveError } = await deps.reserveUsage(
      user.id,
      body.feature,
      effectiveQuotaLimit,
      initialTokensIn
    );
    reservedLogId = newLogId;

    // Gagal mengecek reservasi -> tolak request (FAIL CLOSED!)
    if (reserveError) {
      return Response.json(
        { error: 'Gagal memverifikasi alokasi kuota harian sistem. Silakan coba sesaat lagi.' },
        { status: 500 }
      );
    }

    // Kuota habis -> tolak dengan 429 (hanya berlaku jika batas kuota > 0)
    if (effectiveQuotaLimit > 0 && !reservedLogId) {
      return Response.json(
        {
          error: `Batas kuota harian Anda telah tercapai (maksimal ${effectiveQuotaLimit} panggilan per hari). Silakan coba lagi besok.`,
          quotaLimit: effectiveQuotaLimit,
        },
        { status: 429 }
      );
    }
  }

  // 7. Mode Streaming untuk QA, Ringkasan, Mnemonic, dan Penjelasan Lanjutan Kuis
  if (body.stream && STREAMABLE_FEATURES.has(body.feature)) {
    let streamQuizExplainMeta: { expMode: 'modul' | 'luar_modul' | 'keduanya'; isCorrect: boolean } | null = null;
    let streamVariables: Record<string, any>;

    if (body.feature === 'qa') {
      streamVariables = { pertanyaan: body.params.question || '', modul: moduleContent };
    } else if (body.feature === 'summary_short') {
      streamVariables = { maks_poin: body.params.maxPoints, modul: moduleContent };
    } else if (body.feature === 'mnemonic') {
      streamVariables = {
        topik: body.params.topic || 'Daftar konsep dan istilah penting',
        modul: moduleContent,
      };
    } else if (body.feature === 'quiz_explain') {
      const built = buildQuizExplainPayload(body.params, moduleContent);
      if (!built.isValid) {
        await deps.deleteUsageLog(reservedLogId);
        return Response.json(
          {
            error:
              'Parameter soal, opsi A–D, kunci jawaban, dan pilihan pengguna wajib diisi untuk penjelasan lanjutan kuis.',
          },
          { status: 400 }
        );
      }
      streamVariables = built.variables;
      streamQuizExplainMeta = { expMode: built.expMode, isCorrect: built.isCorrect };
    } else {
      streamVariables = {
        gaya: body.params.style,
        maks_poin: body.params.maxPoints,
        modul: moduleContent,
      };
    }

    const streamPromptName =
      body.feature === 'summary_short'
        ? 'summary-short'
        : body.feature === 'quiz_explain'
        ? 'quiz-explain'
        : body.feature;

    try {
      const stream = await deps.callGeminiStream(
        {
          promptName: streamPromptName,
          variables: streamVariables,
          totalDeadlineMs: 48000,
        },
        {
          onBeforeClose: async (fullText: string, tIn: number, tOut: number) => {
            // HANYA dipanggil jika stream selesai normal secara penuh:
            // 1. Update pemakaian token baris reservasi setelah selesai
            try {
              await deps.updateUsageLog(reservedLogId, tIn, tOut);
            } catch (uErr) {
              console.error('[Generate Route] Gagal update usage_log:', uErr);
            }

            // 2. Simpan ke cache (Bentuk result sama persis antara stream dan non-stream)
            const resultToSave =
              body.feature === 'qa'
                ? { answer: fullText, ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}) }
                : body.feature === 'quiz_explain' && streamQuizExplainMeta
                ? {
                    markdown: fullText,
                    mode: streamQuizExplainMeta.expMode,
                    isCorrect: streamQuizExplainMeta.isCorrect,
                    ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}),
                  }
                : { markdown: fullText, ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}) };
            try {
              await deps.saveGeneration({
                user_id: user.id,
                module_id: body.moduleId,
                feature: body.feature,
                params_hash: paramsHash,
                prompt_version: deps.promptVersion,
                result: resultToSave,
                tokens_in: tIn,
                tokens_out: tOut,
              });
            } catch (genErr) {
              console.error('[Generate Route] Gagal menyimpan stream ke generations cache:', genErr);
            }
          },
          onPartial: async (accumulatedText: string, tIn: number, tOut: number, reason: string) => {
            // Stream terpotong karena deadline atau error koneksi: JANGAN simpan ke generations cache!
            // Tetap perbarui token yang sempat terpakai di baris reservasi usage_log
            try {
              await deps.updateUsageLog(reservedLogId, tIn, Math.max(1, tOut));
            } catch (pErr) {
              console.error('[Generate Route] Gagal update usage_log saat partial:', pErr);
            }
          },
          onCancel: async (accumulatedText: string, tIn: number, tOut: number) => {
            // Jika klien memutus stream, tetap perbarui token yang sempat terpakai (tidak di-refund)
            // dan JANGAN simpan teks terputus ke generations cache!
            try {
              await deps.updateUsageLog(reservedLogId, tIn, Math.max(1, tOut));
            } catch (cErr) {
              console.error('[Generate Route] Gagal update usage_log saat cancel:', cErr);
            }
          },
        }
      );

      const streamHeaders: Record<string, string> = {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Cache': 'MISS',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      };
      if (usedChaptersPayload) {
        streamHeaders['X-Used-Chapters'] = encodeURIComponent(JSON.stringify(usedChaptersPayload));
      }

      return new Response(stream, {
        headers: streamHeaders,
      });
    } catch (streamInitErr: any) {
      // Jika pemanggilan stream gagal sebelum dimulai, refund kuota reservasi
      await deps.deleteUsageLog(reservedLogId);
      return Response.json(
        { error: formatFriendlyErrorMessage(streamInitErr) },
        { status: 500 }
      );
    }
  }

  // 8. Pemanggilan Gemini Non-Stream Berdasarkan Fitur
  let resultData: any;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    switch (body.feature) {
      case 'summary': {
        const gen = await deps.callGeminiText({
          promptName: 'summary',
          variables: {
            gaya: body.params.style,
            maks_poin: body.params.maxPoints,
            modul: moduleContent,
          },
          totalDeadlineMs: 48000,
        });
        resultData = { markdown: gen.data };
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'summary_short': {
        const gen = await deps.callGeminiText({
          promptName: 'summary-short',
          variables: {
            maks_poin: body.params.maxPoints,
            modul: moduleContent,
          },
          totalDeadlineMs: 48000,
        });
        resultData = { markdown: gen.data };
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'flashcards': {
        const gen = await deps.callGeminiJson(
          {
            promptName: 'flashcards',
            variables: {
              jumlah: body.params.count,
              modul: moduleContent,
            },
            totalDeadlineMs: 48000,
          },
          validateAndSanitizeFlashcards,
          body.params.count,
          mergeFlashcardResults
        );
        resultData = gen.data;
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'quiz': {
        const reqCount = body.params.count || 5;
        const expMode = body.params.explanationMode || 'modul';
        const quizStartTime = Date.now();
        const TOTAL_QUIZ_DEADLINE_MS = 46000;

        const dedupeSoal = (list: any[]): any[] => {
          const seenQ = new Set<string>();
          const unique: any[] = [];
          for (const s of list) {
            const qKey = String(s?.pertanyaan || '').trim().toLowerCase();
            if (qKey && !seenQ.has(qKey)) {
              seenQ.add(qKey);
              unique.push(s);
            }
          }
          return unique;
        };

        let uniqueSoal: any[] = [];
        tokensIn = 0;
        tokensOut = 0;

        if (reqCount <= 8) {
          // Permintaan kuis ringan atau micro-batch klien (5-8 butir): 1 panggilan cepat + gap filling
          const excludeList = body.params.excludeQuestions || [];
          const batchHint = isChunkedQuiz
            ? `Fokus paket ${batchIndex + 1} dari ${body.params.batchTotal}: buat tepat ${reqCount} soal unik yang tidak mengulang soal paket lain.`
            : undefined;
          const extraQuizInst = buildQuizAvoidDuplicatesInstruction(excludeList, batchHint);

          const gen = await deps.callGeminiJson(
            {
              promptName: 'quiz',
              variables: {
                jumlah: reqCount,
                tingkat: body.params.difficulty,
                bab: isChunkedQuiz
                  ? `${body.params.chapterName || 'semua'} (Paket ${batchIndex + 1})`
                  : body.params.chapterName || 'semua',
                mode_penjelasan: expMode,
                modul: moduleContent,
              },
              ...(extraQuizInst ? { extraSystemInstruction: extraQuizInst } : {}),
              attemptTimeoutMs: 12000,
              totalDeadlineMs: 22000,
            },
            (raw: unknown) => validateAndSanitizeQuiz(raw, body.params.difficulty),
            reqCount,
            mergeQuizResults
          );
          uniqueSoal = dedupeSoal(gen.data?.soal || []);
          tokensIn = gen.tokensIn || 0;
          tokensOut = gen.tokensOut || 0;
        } else {
          // Permintaan kuis skala menengah & besar (10, 15, 20, 25, 30, 50, 100 butir):
          // Bagi menjadi batch kecil seimbang (5 untuk mode 'keduanya', 7 untuk lainnya)
          // agar tiap panggilan cepat selesai, lalu top-up kekurangan jika ada batch gagal/duplikat.
          const maxPerBatch = expMode === 'keduanya' ? 5 : 7;
          const batchCounts = splitIntoBalancedBatchCounts(reqCount, maxPerBatch);
          const numBatches = batchCounts.length;

          const chunksList = Array.isArray(chunksData) ? chunksData : [];
          const canPartitionChunks = chunksList.length >= numBatches && !body.chapterPosition;

          const batchTasks = batchCounts.map((subCount, idx) => async () => {
            let subModuleContent = moduleContent;
            let subBabName = body.params.chapterName || 'semua';
            let batchNote: string | undefined = `Fokus paket ${idx + 1} dari ${numBatches}: buat tepat ${subCount} soal unik yang menyebar ke aspek materi berbeda agar tidak tumpang tindih dengan paket lain.`;

            if (canPartitionChunks) {
              const startIdx = Math.floor((idx * chunksList.length) / numBatches);
              const endIdx = Math.floor(((idx + 1) * chunksList.length) / numBatches);
              const slice = chunksList.slice(startIdx, endIdx);
              const candidateText = slice
                .map((c: any) => `### ${c.chapter_title}\n\n${c.content}`)
                .join('\n\n---\n\n');
              // Pastikan slice cukup substantif (>= 800 karakter); jika terlalu pendek (mis. Cover/Daftar Pustaka),
              // pakai moduleContent penuh agar AI tetap mampu menyusun soal sebanyak subCount.
              if (candidateText.trim().length >= 800) {
                subModuleContent = candidateText;
                subBabName = slice.map((c: any) => c.chapter_title).join(', ');
                batchNote = undefined;
              } else {
                subBabName = `${body.params.chapterName || 'Umum'} (Paket ${idx + 1})`;
              }
            } else {
              subBabName = `${body.params.chapterName || 'Umum'} (Paket ${idx + 1})`;
            }

            return await deps.callGeminiJson(
              {
                promptName: 'quiz',
                variables: {
                  jumlah: subCount,
                  tingkat: body.params.difficulty,
                  bab: subBabName,
                  mode_penjelasan: expMode,
                  modul: subModuleContent,
                },
                extraSystemInstruction: buildQuizAvoidDuplicatesInstruction([], batchNote),
                attemptTimeoutMs: 22000,
                totalDeadlineMs: 40000,
              },
              (raw: unknown) => validateAndSanitizeQuiz(raw, body.params.difficulty),
              subCount,
              mergeQuizResults
            );
          });

          const batchResults = await runWithConcurrency(batchTasks, 5);
          let combinedSoal: any[] = [];

          for (const res of batchResults) {
            if (res.status === 'fulfilled') {
              tokensIn += res.value.tokensIn || 0;
              tokensOut += res.value.tokensOut || 0;
              const soalArr = res.value.data?.soal || [];
              combinedSoal = [...combinedSoal, ...soalArr];
            } else {
              console.warn('[Quiz Batch Warning] Satu sub-batch gagal:', res.reason?.message);
            }
          }

          uniqueSoal = dedupeSoal(combinedSoal);

          // Putaran top-up otomatis bila total soal masih kurang dari reqCount
          const MAX_TOPUP_ROUNDS = 2;
          let topUpRound = 0;

          while (uniqueSoal.length < reqCount && topUpRound < MAX_TOPUP_ROUNDS) {
            const elapsedMs = Date.now() - quizStartTime;
            const remainingMs = TOTAL_QUIZ_DEADLINE_MS - elapsedMs;
            if (remainingMs < 6000) {
              break;
            }

            const missing = reqCount - uniqueSoal.length;
            const targetWithBuffer = missing + Math.min(2, Math.max(1, Math.ceil(missing * 0.2)));
            const topUpBatchCounts = splitIntoBalancedBatchCounts(
              Math.min(targetWithBuffer, reqCount),
              maxPerBatch
            );
            const existingStems = uniqueSoal.map((s) => String(s.pertanyaan || ''));

            const topUpTasks = topUpBatchCounts.map((subCount, idx) => async () =>
              deps.callGeminiJson(
                {
                  promptName: 'quiz',
                  variables: {
                    jumlah: subCount,
                    tingkat: body.params.difficulty,
                    bab: `${body.params.chapterName || 'semua'} (Tambahan ${topUpRound + 1}.${idx + 1})`,
                    mode_penjelasan: expMode,
                    modul: moduleContent,
                  },
                  extraSystemInstruction: buildQuizAvoidDuplicatesInstruction(
                    existingStems,
                    `Buat tepat ${subCount} soal BARU untuk melengkapi kekurangan kuis (${uniqueSoal.length}/${reqCount} terkumpul).`
                  ),
                  attemptTimeoutMs: Math.min(20000, remainingMs - 2000),
                  totalDeadlineMs: Math.max(6000, remainingMs - 1000),
                },
                (raw: unknown) => validateAndSanitizeQuiz(raw, body.params.difficulty)
              )
            );

            const topUpResults = await runWithConcurrency(topUpTasks, 5);
            let addedInRound = false;
            for (const res of topUpResults) {
              if (res.status === 'fulfilled') {
                tokensIn += res.value.tokensIn || 0;
                tokensOut += res.value.tokensOut || 0;
                const extraArr = res.value.data?.soal || [];
                if (extraArr.length > 0) {
                  combinedSoal = [...combinedSoal, ...extraArr];
                  addedInRound = true;
                }
              }
            }

            uniqueSoal = dedupeSoal(combinedSoal);
            topUpRound++;
            if (!addedInRound) break;
          }

          // Untuk kuis multi-batch (>= 10 soal), tolak hasil parsial parah (mis. hanya 5 dari 25 soal)
          // alih-alih mengembalikan kuis terpotong diam-diam
          const minAcceptable = reqCount <= 10 ? reqCount : Math.ceil(reqCount * 0.85);
          if (uniqueSoal.length > 0 && uniqueSoal.length < minAcceptable) {
            throw new Error(
              `AI baru berhasil menyusun ${uniqueSoal.length} dari ${reqCount} soal yang diminta karena kepadatan model sementara. Silakan klik "Coba Lagi".`
            );
          }
        }

        if (uniqueSoal.length === 0) {
          throw new Error('AI tidak berhasil menyusun soal kuis yang valid. Silakan coba kembali sesaat lagi.');
        }

        // Nomor ulang terurut 1..N dan pastikan label sumber terisi
        const renumbered = uniqueSoal.slice(0, reqCount).map((s, i) => ({
          ...s,
          sumber_penjelasan: s.sumber_penjelasan || expMode,
          nomor: i + 1,
        }));

        resultData = { soal: renumbered };
        break;
      }

      case 'quiz_explain': {
        const built = buildQuizExplainPayload(body.params, moduleContent);
        if (!built.isValid) {
          await deps.deleteUsageLog(reservedLogId);
          return Response.json(
            {
              error:
                'Parameter soal, opsi A–D, kunci jawaban, dan pilihan pengguna wajib diisi untuk penjelasan lanjutan kuis.',
            },
            { status: 400 }
          );
        }

        const gen = await deps.callGeminiText({
          promptName: 'quiz-explain',
          variables: built.variables,
          attemptTimeoutMs: 20000,
          totalDeadlineMs: 40000,
        });

        resultData = {
          markdown: gen.data,
          mode: built.expMode,
          isCorrect: built.isCorrect,
          ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}),
        };
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'qa': {
        if (!body.params.question || body.params.question.trim().length === 0) {
          await deps.deleteUsageLog(reservedLogId);
          return Response.json(
            { error: 'Parameter pertanyaan wajib diisi untuk fitur tanya jawab.' },
            { status: 400 }
          );
        }
        const gen = await deps.callGeminiText({
          promptName: 'qa',
          variables: {
            pertanyaan: body.params.question,
            modul: moduleContent,
          },
          totalDeadlineMs: 48000,
        });
        resultData = { answer: gen.data, ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}) };
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'mnemonic': {
        const gen = await deps.callGeminiText({
          promptName: 'mnemonic',
          variables: {
            topik: body.params.topic || 'Daftar konsep dan istilah penting',
            modul: moduleContent,
          },
          totalDeadlineMs: 48000,
        });
        resultData = { markdown: gen.data };
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      case 'essay_eval': {
        if (!body.params.question || !body.params.userAnswer) {
          await deps.deleteUsageLog(reservedLogId);
          return Response.json(
            { error: 'Parameter pertanyaan dan jawaban pengguna wajib diisi untuk evaluasi esai.' },
            { status: 400 }
          );
        }
        const gen = await deps.callGeminiJson(
          {
            promptName: 'essay-eval',
            variables: {
              pertanyaan: body.params.question,
              jawaban: body.params.userAnswer,
              modul: moduleContent,
            },
            totalDeadlineMs: 48000,
          },
          validateEssayEvaluation
        );
        resultData = gen.data;
        tokensIn = gen.tokensIn;
        tokensOut = gen.tokensOut;
        break;
      }

      default:
        await deps.deleteUsageLog(reservedLogId);
        return Response.json({ error: 'Fitur tidak didukung.' }, { status: 400 });
    }
  } catch (geminiCallErr: any) {
    // Bila Gemini gagal total sebelum mengembalikan hasil, REFUND kuota reservasi (hanya pada pemilik kuota utama)
    if (!isContinuationBatch) {
      await deps.deleteUsageLog(reservedLogId);
    }
    return Response.json(
      { error: geminiCallErr.message || 'Terjadi kesalahan sistem saat memanggil layanan AI.' },
      { status: 500 }
    );
  }

  // 9. Update Baris Reservasi usage_log dan Simpan ke generations Cache
  // Pisahkan try/catch agar kegagalan cache tidak menggagalkan usage_log atau membatalkan hasil ke pengguna
  if (!isContinuationBatch) {
    try {
      await deps.updateUsageLog(reservedLogId, tokensIn, tokensOut);
    } catch (logErr: any) {
      console.error('[Generate Route] Gagal update usage_log:', logErr?.message || logErr);
    }
  }

  if (isCacheCompleteForRequest(body.feature, resultData, body.params.count || 5)) {
    try {
      await deps.saveGeneration({
        user_id: user.id,
        module_id: body.moduleId,
        feature: body.feature,
        params_hash: paramsHash,
        prompt_version: deps.promptVersion,
        result: resultData,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
      });
    } catch (genErr: any) {
      console.error('[Generate Route] Gagal menyimpan data ke generations cache:', genErr?.message || genErr);
    }
  }

  return Response.json({
    success: true,
    cached: false,
    feature: body.feature,
    result: resultData,
    usedChapters: usedChaptersPayload,
    ...(isChunkedQuiz && batchIndex === 0
      ? {
          batchToken: signBatchToken(
            user.id,
            body.moduleId,
            String(reservedLogId || `ok-${crypto.randomUUID()}`),
            maxBatches
          ),
        }
      : {}),
    tokens: {
      in: tokensIn,
      out: tokensOut,
    },
  });
}

// Inisialisasi dependensi produksi nyata
export function createProductionDeps(): GenerateDependencies {
  return {
    async getAuthUser() {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      return { user: data?.user, error };
    },
    async getModule(moduleId: string) {
      const supabase = await createClient();
      return await supabase.from('modules').select('id, title, status').eq('id', moduleId).single();
    },
    async reserveUsage(userId, feature, limit, tokensIn) {
      const admin = createAdminClient();
      if (limit === 0) {
        // Mode Unlimited / Dev: Langsung catat ke usage_log tanpa batas kuota
        // Menjamin tidak terbentrok walau database user masih menggunakan fungsi SQL 0002 lama
        const { data, error } = await admin
          .from('usage_log')
          .insert({
            user_id: userId,
            feature,
            tokens_in: tokensIn,
            tokens_out: null,
          })
          .select('id')
          .single();
        return { id: data?.id, error };
      }
      const { data, error } = await admin.rpc('reserve_usage', {
        p_user: userId,
        p_feature: feature,
        p_limit: limit,
        p_tokens_in: tokensIn,
      });
      return { id: data, error };
    },
    async updateUsageLog(logId, tokensIn, tokensOut) {
      if (!logId) return;
      const admin = createAdminClient();
      await admin.from('usage_log').update({ tokens_in: tokensIn, tokens_out: tokensOut }).eq('id', logId);
    },
    async deleteUsageLog(logId) {
      if (!logId) return;
      const admin = createAdminClient();
      await admin.from('usage_log').delete().eq('id', logId);
    },
    async getCachedGeneration(userId, moduleId, feature, paramsHash, promptVersion) {
      const supabase = await createClient();

      // Single-query lookup untuk quiz_explain (mendukung cache fitur 'quiz_explain' maupun fallback 'qa' bila migrasi 0004 belum jalan)
      if (feature === 'quiz_explain') {
        return await supabase
          .from('generations')
          .select('result, tokens_in, tokens_out')
          .eq('user_id', userId)
          .eq('module_id', moduleId)
          .eq('params_hash', paramsHash)
          .eq('prompt_version', promptVersion)
          .in('feature', ['quiz_explain', 'qa'])
          .limit(1)
          .maybeSingle();
      }

      return await supabase
        .from('generations')
        .select('result, tokens_in, tokens_out')
        .match({
          user_id: userId,
          module_id: moduleId,
          feature,
          params_hash: paramsHash,
          prompt_version: promptVersion,
        })
        .maybeSingle();
    },
    async getModuleChunks(moduleId: string, chapterPosition?: number) {
      const supabase = await createClient();
      if (chapterPosition) {
        return await supabase
          .from('module_chunks')
          .select('position, chapter_title, content')
          .eq('module_id', moduleId)
          .eq('position', chapterPosition)
          .single();
      }
      return await supabase
        .from('module_chunks')
        .select('position, chapter_title, content')
        .eq('module_id', moduleId)
        .order('position', { ascending: true });
    },
    callGeminiText: generateText,
    callGeminiJson: generateJson,
    callGeminiStream: generateStream,
    async saveGeneration(entry) {
      const admin = createAdminClient();
      const { error } = await admin.from('generations').upsert(entry, {
        onConflict: 'user_id,module_id,feature,params_hash,prompt_version',
      });
      if (error && entry.feature === 'quiz_explain') {
        await admin.from('generations').upsert(
          { ...entry, feature: 'qa' },
          { onConflict: 'user_id,module_id,feature,params_hash,prompt_version' }
        );
      }
    },
    dailyQuotaLimit: getDailyQuotaLimit(),
    getUserQuotaLimit: (user: any) => getUserDailyQuotaLimit(user),
    promptVersion: process.env.PROMPT_VERSION || '7',
  };
}
