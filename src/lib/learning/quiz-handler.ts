import { z } from 'zod';
import { createClient } from '../supabase/server.ts';

// Batas ukuran payload request simpan hasil kuis (128 KB)
// Quiz attempts membutuhkan batas lebih besar (128 KB vs 64 KB) karena menyimpan struktur lengkap
// hingga 50 butir soal: pertanyaan, opsi jawaban, penjelasan pembahasan, dan status kebenaran tiap butir.
export const MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES = 128 * 1024;

export const AnswerItemSchema = z
  .object({
    nomor: z.number().int().min(1).max(50),
    pertanyaan: z.string().trim().min(1).max(500, 'Pertanyaan maksimal 500 karakter'),
    userAnswer: z.string().trim().min(1).max(100, 'Jawaban pengguna maksimal 100 karakter'),
    kunci: z.string().trim().min(1).max(10, 'Kunci jawaban maksimal 10 karakter'),
    isCorrect: z.boolean(),
    penjelasan: z.string().trim().max(1000, 'Penjelasan maksimal 1000 karakter').optional(),
  })
  .strict();

export const SaveAttemptSchema = z
  .object({
    score: z.number().int().min(0),
    total: z.number().int().min(1).max(50, 'Total soal maksimal 50'),
    answers: z.array(AnswerItemSchema).min(1).max(50, 'Maksimal 50 butir jawaban'),
  })
  .strict()
  .refine((data) => data.score <= data.total, {
    message: 'Skor tidak boleh melebihi jumlah total soal.',
    path: ['score'],
  });

export interface QuizDependencies {
  getAuthUser: () => Promise<{ user: any; error: any }>;
  getModule: (moduleId: string, userId: string) => Promise<{ data: any; error: any }>;
  getAttempts: (moduleId: string, userId: string) => Promise<{ data: any[]; error: any }>;
  insertAttempt: (row: any) => Promise<{ data: any; error: any }>;
}

export async function handleGetQuizAttempts(deps: QuizDependencies, moduleId: string) {
  const { user, error: authError } = await deps.getAuthUser();
  if (authError || !user) {
    return Response.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
  }

  const { data: moduleData, error: modErr } = await deps.getModule(moduleId, user.id);
  if (modErr || !moduleData) {
    return Response.json({ error: 'Modul tidak ditemukan atau bukan milik Anda.' }, { status: 404 });
  }

  const { data: attempts, error } = await deps.getAttempts(moduleId, user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ attempts: attempts || [] });
}

export async function handleSaveQuizAttempt(deps: QuizDependencies, moduleId: string, rawBody: any) {
  // 0. Batas Ukuran Payload (Tolak 413 SEBELUM JSON.parse & SEBELUM Zod)
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf-8') > MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES) {
      return Response.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }
    try {
      rawBody = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Format JSON permintaan tidak valid.' }, { status: 400 });
    }
  }

  const { user, error: authError } = await deps.getAuthUser();
  if (authError || !user) {
    return Response.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
  }

  const { data: moduleData, error: modErr } = await deps.getModule(moduleId, user.id);
  if (modErr || !moduleData) {
    return Response.json({ error: 'Modul tidak ditemukan atau bukan milik Anda.' }, { status: 404 });
  }

  const parsed = SaveAttemptSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: 'Format data kuis tidak valid', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await deps.insertAttempt({
    user_id: user.id,
    module_id: moduleId,
    score: parsed.data.score,
    total: parsed.data.total,
    answers: parsed.data.answers,
  });

  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ attempt: inserted });
}

export function createQuizProductionDeps(): QuizDependencies {
  return {
    async getAuthUser() {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      return { user: data.user, error };
    },
    async getModule(moduleId: string, userId: string) {
      const supabase = await createClient();
      return await supabase
        .from('modules')
        .select('id')
        .eq('id', moduleId)
        .eq('user_id', userId)
        .maybeSingle();
    },
    async getAttempts(moduleId: string, userId: string) {
      const supabase = await createClient();
      const res = await supabase
        .from('quiz_attempts')
        .select('*')
        .eq('module_id', moduleId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      return { data: res.data || [], error: res.error };
    },
    async insertAttempt(row: any) {
      const supabase = await createClient();
      return await supabase.from('quiz_attempts').insert(row).select().single();
    },
  };
}
