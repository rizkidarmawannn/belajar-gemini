import { NextRequest, NextResponse } from 'next/server';
import {
  handleDeleteModule,
  createDeleteModuleProductionDeps,
} from '@/lib/learning/module-delete-handler';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return await handleDeleteModule(createDeleteModuleProductionDeps(), id);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server saat menghapus modul.' },
      { status: 500 }
    );
  }
}
