import crypto from 'crypto';
import { z } from 'zod';
import { createClient } from '../supabase/server.ts';
import { createAdminClient } from '../supabase/admin.ts';
import { generateText, generateJson, generateStream, formatFriendlyErrorMessage } from './generate.ts';
import {
  validateAndSanitizeQuiz,
  validateAndSanitizeFlashcards,
  validateEssayEvaluation,
  mergeQuizResults,
  mergeFlashcardResults,
} from '../validators/index.ts';

// Skema Validasi Params yang Ketat (.strict() menolak properti asing tak diizinkan)
export const StrictParamsSchema = z
  .object({
    style: z.enum(['singkat', 'lengkap']).optional().default('singkat'),
    maxPoints: z.number().int().min(1).max(20).optional().default(8),
    count: z.number().int().min(1).max(20).optional().default(5),
    difficulty: z.enum(['mudah', 'sedang', 'sulit', 'campuran']).optional().default('sedang'),
    chapterName: z.string().max(100, 'Nama bab maksimal 100 karakter').optional().default('semua'),
    topic: z.string().max(200, 'Topik maksimal 200 karakter').optional(),
    question: z.string().max(500, 'Pertanyaan maksimal 500 karakter').optional(),
    userAnswer: z.string().max(3000, 'Jawaban esai maksimal 3000 karakter').optional(),
  })
  .strict({ message: 'Objek params memuat kunci yang tidak diizinkan.' });

// Skema Permintaan Body
export const GenerateRequestSchema = z.object({
  moduleId: z.string().uuid({ message: 'ID modul harus berupa format UUID yang valid' }),
  feature: z.enum(
    ['summary', 'summary_short', 'flashcards', 'mnemonic', 'quiz', 'qa', 'essay_eval'],
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
  updateUsageLog: (logId: number | string, tokensIn: number, tokensOut: number) => Promise<void>;
  deleteUsageLog: (logId: number | string) => Promise<void>;
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
  promptVersion: string;
}

// Fungsi inti penanganan generate (dipakai di route POST dan diuji langsung di tes unit)
export async function handleGenerate(deps: GenerateDependencies, rawBody: any) {
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
      // Jika mode stream diminta dan cache hit, kembalikan juga sebagai stream teks dengan header X-Cache: HIT
      if (body.stream && (body.feature === 'qa' || body.feature === 'summary')) {
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

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Cache': 'HIT',
            'Cache-Control': 'no-cache, no-transform',
          },
        });
      }

      return Response.json({
        success: true,
        cached: true,
        feature: body.feature,
        result: cachedGen.result,
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
  if (Array.isArray(chunksData)) {
    if (chunksData.length === 0) {
      return Response.json(
        { error: 'Materi bab modul kosong atau belum selesai diekstrak.' },
        { status: 422 }
      );
    }
    moduleContent = chunksData.map((c: any) => `${c.chapter_title}\n\n${c.content}`).join('\n\n---\n\n');
  } else {
    moduleContent = `${chunksData.chapter_title}\n\n${chunksData.content}`;
  }

  // 6. RESERVASI ATOMIK KUOTA HARIAN (SEBELUM Gemini untuk SEMUA mode)
  // Menutup celah race condition dari puluhan request paralel
  const initialTokensIn = Math.ceil(moduleContent.length / 4);
  const { id: reservedLogId, error: reserveError } = await deps.reserveUsage(
    user.id,
    body.feature,
    deps.dailyQuotaLimit,
    initialTokensIn
  );

  // Gagal mengecek reservasi -> tolak request (FAIL CLOSED!)
  if (reserveError) {
    return Response.json(
      { error: 'Gagal memverifikasi alokasi kuota harian sistem. Silakan coba sesaat lagi.' },
      { status: 500 }
    );
  }

  // Kuota habis -> tolak dengan 429
  if (!reservedLogId) {
    return Response.json(
      {
        error: `Batas kuota harian Anda telah tercapai (maksimal ${deps.dailyQuotaLimit} panggilan per hari). Silakan coba lagi besok.`,
        quotaLimit: deps.dailyQuotaLimit,
      },
      { status: 429 }
    );
  }

  // 7. Mode Streaming untuk QA dan Ringkasan
  if (body.stream && (body.feature === 'qa' || body.feature === 'summary')) {
    const streamVariables =
      body.feature === 'qa'
        ? { pertanyaan: body.params.question || '', modul: moduleContent }
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
            const resultToSave = body.feature === 'qa' ? { answer: fullText } : { markdown: fullText };
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

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Cache': 'MISS',
          'Cache-Control': 'no-cache, no-transform',
        },
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
        const gen = await deps.callGeminiJson(
          {
            promptName: 'quiz',
            variables: {
              jumlah: body.params.count,
              tingkat: body.params.difficulty,
              bab: body.params.chapterName || 'semua',
              modul: moduleContent,
            },
            totalDeadlineMs: 48000,
          },
          validateAndSanitizeQuiz,
          body.params.count,
          mergeQuizResults
        );
        resultData = gen.data;
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
        resultData = { answer: gen.data };
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
      const { data, error } = await admin.rpc('reserve_usage', {
        p_user: userId,
        p_feature: feature,
        p_limit: limit,
        p_tokens_in: tokensIn,
      });
      return { id: data, error };
    },
    async updateUsageLog(logId, tokensIn, tokensOut) {
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
          .select('chapter_title, content')
          .eq('module_id', moduleId)
          .eq('position', chapterPosition)
          .single();
      }
      return await supabase
        .from('module_chunks')
        .select('chapter_title, content')
        .eq('module_id', moduleId)
        .order('position', { ascending: true });
    },
    callGeminiText: generateText,
    callGeminiJson: generateJson,
    callGeminiStream: generateStream,
    async saveGeneration(entry) {
      const admin = createAdminClient();
      await admin.from('generations').upsert(entry, {
        onConflict: 'user_id,module_id,feature,params_hash,prompt_version',
      });
    },
    dailyQuotaLimit: parseInt(process.env.DAILY_QUOTA_PER_USER || '30', 10),
    promptVersion: process.env.PROMPT_VERSION || '1',
  };
}
