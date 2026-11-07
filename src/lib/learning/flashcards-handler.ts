import { z } from 'zod';
import { createClient } from '../supabase/server.ts';

export const LeitnerIntervals: Record<number, number> = {
  1: 1,  // 1 hari
  2: 3,  // 3 hari
  3: 7,  // 7 hari
  4: 14, // 14 hari
};

// Batas ukuran request payload untuk batch simpan flashcard (64 KB)
export const MAX_FLASHCARDS_PAYLOAD_BYTES = 64 * 1024;

export function normalizeFrontText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
    .replace(/\s+/g, ' ');
}

// Skema Validasi Butir Kartu yang Mendukung Format Bahasa Inggris (front/back) maupun Indonesia (depan/belakang)
export const CardItemSchema = z
  .object({
    front: z.string().trim().max(300, 'Teks depan maksimal 300 karakter').optional(),
    depan: z.string().trim().max(300, 'Teks depan maksimal 300 karakter').optional(),
    back: z.string().trim().max(600, 'Teks belakang maksimal 600 karakter').optional(),
    belakang: z.string().trim().max(600, 'Teks belakang maksimal 600 karakter').optional(),
    chapter: z.string().max(100, 'Nama bab maksimal 100 karakter').optional(),
    bab: z.string().max(100, 'Nama bab maksimal 100 karakter').optional(),
    level: z.enum(['mudah', 'sedang', 'sulit']).optional().default('sedang'),
    tingkat: z.enum(['mudah', 'sedang', 'sulit']).optional(),
  })
  .transform((data) => ({
    front: (data.front || data.depan || '').trim(),
    back: (data.back || data.belakang || '').trim(),
    chapter: data.chapter || data.bab,
    level: (data.level || data.tingkat || 'sedang') as 'mudah' | 'sedang' | 'sulit',
  }))
  .refine((data) => data.front.length >= 1, {
    message: 'Teks depan tidak boleh kosong',
    path: ['front'],
  })
  .refine((data) => data.back.length >= 1, {
    message: 'Teks belakang tidak boleh kosong',
    path: ['back'],
  });

// Skema Validasi Batch Simpan Flashcard yang Ketat
export const BatchSaveSchema = z
  .object({
    cards: z
      .array(CardItemSchema)
      .min(1, 'Minimal 1 kartu')
      .max(30, 'Maksimal 30 kartu per permintaan'),
  });

export const ReviewUpdateSchema = z
  .object({
    cardId: z.string().uuid({ message: 'cardId harus berupa UUID valid' }),
    result: z.enum(['hafal', 'belum']),
  })
  .strict();

export interface FlashcardDependencies {
  getAuthUser: () => Promise<{ user: any; error: any }>;
  getModule: (moduleId: string, userId: string) => Promise<{ data: any; error: any }>;
  getExistingCards: (moduleId: string, userId: string) => Promise<{ data: any[]; error: any }>;
  insertCards: (rows: any[]) => Promise<{ data: any[]; error: any }>;
  getCurrentCard: (cardId: string, moduleId: string, userId: string) => Promise<{ data: any; error: any }>;
  updateCardReview: (cardId: string, box: number, nextReview: string, lastResult: string) => Promise<{ data: any; error: any }>;
}

export async function handleGetFlashcards(deps: FlashcardDependencies, moduleId: string) {
  const { user, error: authError } = await deps.getAuthUser();
  if (authError || !user) {
    return Response.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
  }

  const { data: moduleData, error: modErr } = await deps.getModule(moduleId, user.id);
  if (modErr || !moduleData) {
    return Response.json({ error: 'Modul tidak ditemukan atau bukan milik Anda.' }, { status: 404 });
  }

  const { data: cards, error } = await deps.getExistingCards(moduleId, user.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ cards: cards || [] });
}

export async function handleSaveFlashcards(deps: FlashcardDependencies, moduleId: string, rawBody: any) {
  // 0. Batas Ukuran Payload (Tolak 413 SEBELUM JSON.parse & SEBELUM Zod)
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf-8') > MAX_FLASHCARDS_PAYLOAD_BYTES) {
      return Response.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_FLASHCARDS_PAYLOAD_BYTES / 1024} KB).` },
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

  const parsed = BatchSaveSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: 'Format data kartu tidak valid', details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Deduplikasi kartu per modul
  const { data: existingCards } = await deps.getExistingCards(moduleId, user.id);
  const existingSet = new Set((existingCards || []).map((c) => normalizeFrontText(c.front)));

  const uniqueRows: any[] = [];
  for (const c of parsed.data.cards) {
    const norm = normalizeFrontText(c.front);
    if (!existingSet.has(norm)) {
      existingSet.add(norm);
      uniqueRows.push({
        user_id: user.id,
        module_id: moduleId,
        front: c.front.trim(),
        back: c.back.trim(),
        chapter: c.chapter || null,
        level: c.level,
        box: 0,
        next_review_at: new Date().toISOString(),
        last_result: null,
      });
    }
  }

  if (uniqueRows.length === 0) {
    return Response.json({
      saved: 0,
      cards: [],
      message: 'Semua kartu sudah ada di dalam modul (duplikat diabaikan).',
    });
  }

  const { data: inserted, error: insErr } = await deps.insertCards(uniqueRows);
  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ saved: inserted?.length || 0, cards: inserted || [] });
}

export async function handleReviewFlashcard(deps: FlashcardDependencies, moduleId: string, rawBody: any) {
  // 0. Batas Ukuran Payload (Tolak 413 SEBELUM JSON.parse & SEBELUM Zod)
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf-8') > MAX_FLASHCARDS_PAYLOAD_BYTES) {
      return Response.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_FLASHCARDS_PAYLOAD_BYTES / 1024} KB).` },
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

  const parsed = ReviewUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: 'Parameter update review tidak valid' }, { status: 400 });
  }

  const { data: currentCard, error: cardErr } = await deps.getCurrentCard(parsed.data.cardId, moduleId, user.id);
  if (cardErr || !currentCard) {
    return Response.json({ error: 'Kartu tidak ditemukan' }, { status: 404 });
  }

  let newBox = 1;
  let days = 1;

  if (parsed.data.result === 'hafal') {
    newBox = Math.min((currentCard.box || 0) + 1, 4);
    days = LeitnerIntervals[newBox] || 1;
  } else {
    newBox = 1;
    days = 1;
  }

  const nextReview = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data: updated, error: updErr } = await deps.updateCardReview(
    currentCard.id,
    newBox,
    nextReview,
    parsed.data.result
  );

  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  return Response.json({ card: updated });
}

export function createFlashcardProductionDeps(): FlashcardDependencies {
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
    async getExistingCards(moduleId: string, userId: string) {
      const supabase = await createClient();
      const res = await supabase
        .from('flashcards')
        .select('*')
        .eq('module_id', moduleId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      return { data: res.data || [], error: res.error };
    },
    async insertCards(rows: any[]) {
      const supabase = await createClient();
      const res = await supabase.from('flashcards').insert(rows).select();
      return { data: res.data || [], error: res.error };
    },
    async getCurrentCard(cardId: string, moduleId: string, userId: string) {
      const supabase = await createClient();
      return await supabase
        .from('flashcards')
        .select('id, box')
        .eq('id', cardId)
        .eq('user_id', userId)
        .eq('module_id', moduleId)
        .maybeSingle();
    },
    async updateCardReview(cardId: string, box: number, nextReview: string, lastResult: string) {
      const supabase = await createClient();
      return await supabase
        .from('flashcards')
        .update({
          box,
          next_review_at: nextReview,
          last_result: lastResult,
        })
        .eq('id', cardId)
        .select()
        .single();
    },
  };
}
