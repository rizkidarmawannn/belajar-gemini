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

  // 4. Cek Cache (generations)
  // feature dan chapterPosition ditaruh SETELAH spread params agar params tidak dapat menimpanya!
  const normalizedObject: Record<string, any> = {
    ...body.params,
    feature: body.feature,
    chapterPosition: body.chapterPosition ?? 'all',
  };
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

    if (cachedGen) {
      const cachedUsedChapters = (cachedGen.result as any)?.usedChapters;

      // Jika mode stream diminta dan cache hit, kembalikan juga sebagai stream teks dengan header X-Cache: HIT
      if (body.stream && (body.feature === 'qa' || body.feature === 'summary' || body.feature === 'summary_short')) {
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
      // Untuk pendalaman 1 butir soal kuis: pilih maksimal 2 bab paling relevan agar cepat & hemat token
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
        maxChapters: 2,
        maxChars: 14000,
      });

      if (selection.hasMatch && selection.selectedChunks.length > 0) {
        usedChaptersPayload = selection.usedChapters;
        moduleContent = selection.selectedChunks
          .map((c: any) => `### ${c.chapter_title}\n\n${c.content}`)
          .join('\n\n---\n\n');
      } else {
        const fallbackChunks = chunksWithPos.slice(0, 2);
        usedChaptersPayload = fallbackChunks.map((c: any) => ({
          position: c.position,
          chapter_title: c.chapter_title,
        }));
        moduleContent = fallbackChunks
          .map((c: any) => `### ${c.chapter_title}\n\n${c.content}`)
          .join('\n\n---\n\n');
      }

      if (moduleContent.length > 18000) {
        moduleContent = moduleContent.slice(0, 18000);
      }
    } else {
      moduleContent = chunksData.map((c: any) => `${c.chapter_title}\n\n${c.content}`).join('\n\n---\n\n');
    }
  } else {
    moduleContent = `${chunksData.chapter_title}\n\n${chunksData.content}`;
    if (body.feature === 'quiz_explain' && moduleContent.length > 18000) {
      moduleContent = moduleContent.slice(0, 18000);
    }
    if (body.feature === 'qa' || body.feature === 'quiz_explain') {
      usedChaptersPayload = [{ position: chunksData.position ?? body.chapterPosition ?? 1, chapter_title: chunksData.chapter_title }];
    }
  }

  // 6. RESERVASI ATOMIK KUOTA HARIAN (SEBELUM Gemini untuk SEMUA mode)
  // Menutup celah race condition dari puluhan request paralel
  const effectiveQuotaLimit = typeof deps.getUserQuotaLimit === 'function'
    ? deps.getUserQuotaLimit(user)
    : deps.dailyQuotaLimit;

  const initialTokensIn = Math.ceil(moduleContent.length / 4);
  const { id: reservedLogId, error: reserveError } = await deps.reserveUsage(
    user.id,
    body.feature,
    effectiveQuotaLimit,
    initialTokensIn
  );

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

  // 7. Mode Streaming untuk QA dan Ringkasan
  if (body.stream && (body.feature === 'qa' || body.feature === 'summary' || body.feature === 'summary_short')) {
    const streamVariables =
      body.feature === 'qa'
        ? { pertanyaan: body.params.question || '', modul: moduleContent }
        : body.feature === 'summary_short'
        ? { maks_poin: body.params.maxPoints, modul: moduleContent }
        : {
            gaya: body.params.style,
            maks_poin: body.params.maxPoints,
            modul: moduleContent,
          };

    try {
      const stream = await deps.callGeminiStream(
        {
          promptName: body.feature,
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

            // 2. Simpan ke cache (Bentuk result sama persis antara stream dan non-stream: { answer } atau { markdown })
            const resultToSave =
              body.feature === 'qa'
                ? { answer: fullText, ...(usedChaptersPayload ? { usedChapters: usedChaptersPayload } : {}) }
                : { markdown: fullText };
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

        if (reqCount <= 15) {
          // Permintaan kuis skala kecil (5-15 butir): 1 panggilan cepat
          const gen = await deps.callGeminiJson(
            {
              promptName: 'quiz',
              variables: {
                jumlah: reqCount,
                tingkat: body.params.difficulty,
                bab: body.params.chapterName || 'semua',
                mode_penjelasan: expMode,
                modul: moduleContent,
              },
              attemptTimeoutMs: 20000,
              totalDeadlineMs: 40000,
            },
            validateAndSanitizeQuiz,
            reqCount,
            mergeQuizResults
          );
          resultData = {
            ...gen.data,
            soal: (gen.data?.soal || []).map((s: any) => ({
              ...s,
              sumber_penjelasan: s.sumber_penjelasan || expMode,
            })),
          };
          tokensIn = gen.tokensIn;
          tokensOut = gen.tokensOut;
        } else {
          // Permintaan kuis skala besar (20, 25, 50, 100 butir):
          // Eksekusi sub-batch paralel menggunakan Promise.all agar waktu proses total tetap singkat
          // dan bebas dari risiko timeout serverless Netlify/Vercel (504 Gateway Timeout).
          const BATCH_SIZE =
            expMode === 'keduanya'
              ? reqCount >= 30
                ? 15
                : 10
              : reqCount >= 60
              ? 20
              : reqCount >= 30
              ? 15
              : 10;
          const numBatches = Math.ceil(reqCount / BATCH_SIZE);

          const chunksList = Array.isArray(chunksData) ? chunksData : [];
          const canPartitionChunks = chunksList.length >= numBatches && !body.chapterPosition;

          const batchPromises = Array.from({ length: numBatches }, async (_, idx) => {
            const isLast = idx === numBatches - 1;
            const subCount = isLast ? reqCount - idx * BATCH_SIZE : BATCH_SIZE;

            let subModuleContent = moduleContent;
            let subBabName = body.params.chapterName || 'semua';

            if (canPartitionChunks) {
              const startIdx = Math.floor((idx * chunksList.length) / numBatches);
              const endIdx = Math.floor(((idx + 1) * chunksList.length) / numBatches);
              const slice = chunksList.slice(startIdx, endIdx);
              if (slice.length > 0) {
                subModuleContent = slice
                  .map((c: any) => `### ${c.chapter_title}\n\n${c.content}`)
                  .join('\n\n---\n\n');
                subBabName = slice.map((c: any) => c.chapter_title).join(', ');
              }
            } else {
              subBabName = `${body.params.chapterName || 'Umum'} (Paket Bagian ${idx + 1})`;
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
                attemptTimeoutMs: 25000,
                totalDeadlineMs: 45000,
              },
              validateAndSanitizeQuiz,
              subCount,
              mergeQuizResults
            );
          });

          const batchResults = await Promise.allSettled(batchPromises);

          let combinedSoal: any[] = [];
          tokensIn = 0;
          tokensOut = 0;

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

          if (combinedSoal.length === 0) {
            throw new Error('AI tidak berhasil menyusun soal kuis yang valid. Silakan coba kembali sesaat lagi.');
          }

          // Deduplikasi berdasarkan teks pertanyaan
          const seenQ = new Set<string>();
          const uniqueSoal: any[] = [];
          for (const s of combinedSoal) {
            const qKey = (s.pertanyaan || '').trim().toLowerCase();
            if (!seenQ.has(qKey)) {
              seenQ.add(qKey);
              uniqueSoal.push(s);
            }
          }

          // Nomor ulang terurut 1..N dan pastikan label sumber terisi
          const renumbered = uniqueSoal.slice(0, reqCount).map((s, i) => ({
            ...s,
            sumber_penjelasan: s.sumber_penjelasan || expMode,
            nomor: i + 1,
          }));

          resultData = { soal: renumbered };
        }
        break;
      }

      case 'quiz_explain': {
        const { question, quizOptions, correctOption, selectedOption, chapterName, explanationMode } =
          body.params;
        if (!question || !question.trim() || !quizOptions || !correctOption || !selectedOption) {
          await deps.deleteUsageLog(reservedLogId);
          return Response.json(
            {
              error:
                'Parameter soal, opsi A–D, kunci jawaban, dan pilihan pengguna wajib diisi untuk penjelasan lanjutan kuis.',
            },
            { status: 400 }
          );
        }

        const expMode = explanationMode || 'keduanya';
        const opsiText = (['A', 'B', 'C', 'D'] as const)
          .map((key) => `- **${key}.** ${quizOptions[key]}`)
          .join('\n');
        const kunciFull = `${correctOption} (${quizOptions[correctOption]})`;
        const jawabanFull = `${selectedOption} (${quizOptions[selectedOption]})`;
        const statusJawaban = selectedOption === correctOption ? 'BENAR' : 'SALAH';

        const gen = await deps.callGeminiText({
          promptName: 'quiz-explain',
          variables: {
            pertanyaan: question.trim(),
            opsi: opsiText,
            kunci: kunciFull,
            jawaban_pengguna: jawabanFull,
            status_jawaban: statusJawaban,
            bab: chapterName || 'Umum',
            mode_penjelasan: expMode,
            modul: moduleContent,
          },
          attemptTimeoutMs: 20000,
          totalDeadlineMs: 40000,
        });

        resultData = {
          markdown: gen.data,
          mode: expMode,
          isCorrect: selectedOption === correctOption,
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
    // Bila Gemini gagal total sebelum mengembalikan hasil, REFUND kuota reservasi!
    await deps.deleteUsageLog(reservedLogId);
    return Response.json(
      { error: geminiCallErr.message || 'Terjadi kesalahan sistem saat memanggil layanan AI.' },
      { status: 500 }
    );
  }

  // 9. Update Baris Reservasi usage_log dan Simpan ke generations Cache
  // Pisahkan try/catch agar kegagalan cache tidak menggagalkan usage_log atau membatalkan hasil ke pengguna
  try {
    await deps.updateUsageLog(reservedLogId, tokensIn, tokensOut);
  } catch (logErr: any) {
    console.error('[Generate Route] Gagal update usage_log:', logErr?.message || logErr);
  }

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

  return Response.json({
    success: true,
    cached: false,
    feature: body.feature,
    result: resultData,
    usedChapters: usedChaptersPayload,
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
      const primary = await supabase
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

      // Fallback cache aman bila migrasi 0004 belum dijalankan pada database live
      if (!primary.data && feature === 'quiz_explain') {
        return await supabase
          .from('generations')
          .select('result, tokens_in, tokens_out')
          .match({
            user_id: userId,
            module_id: moduleId,
            feature: 'qa',
            params_hash: paramsHash,
            prompt_version: promptVersion,
          })
          .maybeSingle();
      }

      return primary;
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
    promptVersion: process.env.PROMPT_VERSION || '6',
  };
}
