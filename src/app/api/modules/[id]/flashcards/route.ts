import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const LeitnerIntervals: Record<number, number> = {
  1: 1,  // 1 hari
  2: 3,  // 3 hari
  3: 7,  // 7 hari
  4: 14, // 14 hari
};

// GET: Ambil semua flashcard milik pengguna untuk modul ini
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
    }

    const { data: cards, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('module_id', moduleId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cards: cards || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}

const BatchSaveSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
      chapter: z.string().optional(),
      level: z.enum(['mudah', 'sedang', 'sulit']).optional().default('sedang'),
    })
  ),
});

// POST: Simpan daftar kartu flashcard baru ke database
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BatchSaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Format data kartu tidak valid', details: parsed.error.format() },
        { status: 400 }
      );
    }

    if (parsed.data.cards.length === 0) {
      return NextResponse.json({ saved: 0, cards: [] });
    }

    const rows = parsed.data.cards.map((c) => ({
      user_id: user.id,
      module_id: moduleId,
      front: c.front.trim(),
      back: c.back.trim(),
      chapter: c.chapter || null,
      level: c.level,
      box: 0,
      next_review_at: new Date().toISOString(),
      last_result: null,
    }));

    const { data: inserted, error } = await supabase
      .from('flashcards')
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: inserted?.length || 0, cards: inserted || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan kartu flashcard' }, { status: 500 });
  }
}

const ReviewUpdateSchema = z.object({
  cardId: z.string().uuid(),
  result: z.enum(['hafal', 'belum']),
});

// PATCH: Perbarui status review kartu dengan algoritma Leitner Box
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ReviewUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parameter update review tidak valid' }, { status: 400 });
    }

    // Ambil kartu saat ini
    const { data: currentCard, error: fetchErr } = await supabase
      .from('flashcards')
      .select('id, box')
      .eq('id', parsed.data.cardId)
      .eq('user_id', user.id)
      .eq('module_id', moduleId)
      .single();

    if (fetchErr || !currentCard) {
      return NextResponse.json({ error: 'Kartu tidak ditemukan' }, { status: 404 });
    }

    let newBox = 1;
    let daysToAdd = 1;

    if (parsed.data.result === 'hafal') {
      newBox = Math.min((currentCard.box || 0) + 1, 4);
      daysToAdd = LeitnerIntervals[newBox] || 1;
    } else {
      newBox = 1;
      daysToAdd = 1;
    }

    const nextReview = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from('flashcards')
      .update({
        box: newBox,
        next_review_at: nextReview,
        last_result: parsed.data.result,
      })
      .eq('id', currentCard.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ card: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memperbarui status kartu' }, { status: 500 });
  }
}
