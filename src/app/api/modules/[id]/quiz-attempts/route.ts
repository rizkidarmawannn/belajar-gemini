import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// GET: Ambil riwayat percobaan kuis modul ini
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

    const { data: attempts, error } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('module_id', moduleId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ attempts: attempts || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memuat riwayat kuis' }, { status: 500 });
  }
}

const SaveAttemptSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  answers: z.array(
    z.object({
      nomor: z.number(),
      pertanyaan: z.string(),
      userAnswer: z.string(),
      kunci: z.string(),
      isCorrect: z.boolean(),
      penjelasan: z.string().optional(),
    })
  ),
});

// POST: Simpan hasil percobaan kuis baru
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
    const parsed = SaveAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Format data kuis tidak valid', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { data: inserted, error } = await supabase
      .from('quiz_attempts')
      .insert({
        user_id: user.id,
        module_id: moduleId,
        score: parsed.data.score,
        total: parsed.data.total,
        answers: parsed.data.answers,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ attempt: inserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan hasil kuis' }, { status: 500 });
  }
}
