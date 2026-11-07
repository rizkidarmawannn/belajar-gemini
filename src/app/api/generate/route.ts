import { NextRequest, NextResponse } from 'next/server';
import { handleGenerate, createProductionDeps, MAX_GENERATE_PAYLOAD_BYTES } from '../../../lib/gemini/handler.ts';

// Ditegaskan untuk runtime Node.js Vercel & batas durasi fungsi
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 detik batas Vercel; totalDeadlineMs disetel 48 detik agar aman dari timeout 504

// Handler POST Next.js App Router
export async function POST(request: NextRequest) {
  try {
    // Baca body sebagai teks dan periksa batas 64 KB SEBELUM JSON.parse & SEBELUM Zod
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, 'utf-8') > MAX_GENERATE_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Ukuran isi permintaan melebihi batas maksimum (${MAX_GENERATE_PAYLOAD_BYTES / 1024} KB).` },
        { status: 413 }
      );
    }

    let rawBody: any;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: 'Format JSON permintaan tidak valid.' },
        { status: 400 }
      );
    }

    return await handleGenerate(createProductionDeps(), rawBody);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal server saat memproses permintaan AI.' },
      { status: 500 }
    );
  }
}
