import { NextRequest, NextResponse } from 'next/server';
import {
  handleGetQuizAttempts,
  handleSaveQuizAttempt,
  createQuizProductionDeps,
  MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES,
} from '@/lib/learning/quiz-handler';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    return await handleGetQuizAttempts(createQuizProductionDeps(), moduleId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memuat riwayat kuis' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    // Baca body sebagai teks dan tolak 413 SEBELUM JSON.parse & SEBELUM Zod
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, 'utf-8') > MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Format JSON permintaan tidak valid.' }, { status: 400 });
    }

    return await handleSaveQuizAttempt(createQuizProductionDeps(), moduleId, body);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan hasil kuis' }, { status: 500 });
  }
}
