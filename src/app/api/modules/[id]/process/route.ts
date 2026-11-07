import { NextRequest, NextResponse } from 'next/server';
import { handleProcessModule, createProcessProductionDeps } from '@/lib/parsers/process-handler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return await handleProcessModule(createProcessProductionDeps(), id);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server saat memproses modul.' },
      { status: 500 }
    );
  }
}
