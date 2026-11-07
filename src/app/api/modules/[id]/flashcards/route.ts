import { NextRequest, NextResponse } from 'next/server';
import {
  handleGetFlashcards,
  handleSaveFlashcards,
  handleReviewFlashcard,
  createFlashcardProductionDeps,
  MAX_FLASHCARDS_PAYLOAD_BYTES,
} from '@/lib/learning/flashcards-handler';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    return await handleGetFlashcards(createFlashcardProductionDeps(), moduleId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, 'utf-8') > MAX_FLASHCARDS_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_FLASHCARDS_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }
    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Format JSON permintaan tidak valid.' }, { status: 400 });
    }
    return await handleSaveFlashcards(createFlashcardProductionDeps(), moduleId, body);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan kartu flashcard' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, 'utf-8') > MAX_FLASHCARDS_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_FLASHCARDS_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }
    let body: any;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Format JSON permintaan tidak valid.' }, { status: 400 });
    }
    return await handleReviewFlashcard(createFlashcardProductionDeps(), moduleId, body);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memperbarui status kartu' }, { status: 500 });
  }
}
