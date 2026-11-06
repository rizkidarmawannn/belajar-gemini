import { NextRequest, NextResponse } from 'next/server';
import { handleGenerate, createProductionDeps } from '../../../lib/gemini/handler.ts';

// Ditegaskan untuk runtime Node.js Vercel & batas durasi fungsi
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 detik batas Vercel; totalDeadlineMs disetel 48 detik agar aman dari timeout 504

// Handler POST Next.js App Router
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    return await handleGenerate(createProductionDeps(), rawBody);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal server saat memproses permintaan AI.' },
      { status: 500 }
    );
  }
}
