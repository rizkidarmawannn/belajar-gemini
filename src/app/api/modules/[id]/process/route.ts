import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { extractDocumentText } from '@/lib/parsers/document-parser';
import { splitIntoChapters } from '@/lib/parsers/chapter-splitter';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 1. Verifikasi autentikasi pengguna
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    // 2. Ambil data modul milik pengguna (RLS aktif)
    const { data: moduleData, error: moduleError } = await supabase
      .from('modules')
      .select('*')
      .eq('id', id)
      .single();

    if (moduleError || !moduleData) {
      return NextResponse.json(
        { error: 'Modul tidak ditemukan atau Anda tidak memiliki akses.' },
        { status: 404 }
      );
    }

    // 3. Update status menjadi 'processing'
    await supabase
      .from('modules')
      .update({ status: 'processing', error_message: null })
      .eq('id', id);

    // 4. Unduh berkas langsung dari Supabase Storage (bucket privat 'modules')
    if (!moduleData.storage_path) {
      await supabase
        .from('modules')
        .update({ status: 'failed', error_message: 'Path berkas di penyimpanan tidak valid.' })
        .eq('id', id);

      return NextResponse.json(
        { error: 'Path berkas tidak ditemukan.' },
        { status: 400 }
      );
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('modules')
      .download(moduleData.storage_path);

    if (downloadError || !fileBlob) {
      const errorMessage = `Gagal mengunduh berkas dari penyimpanan: ${downloadError?.message || 'Berkas tidak ada'}`;
      await supabase
        .from('modules')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', id);

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // 5. Konversi Blob ke Buffer untuk ekstraksi
    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 6. Ekstraksi teks dari PDF/DOCX/TXT
    let extracted;
    try {
      extracted = await extractDocumentText(fileBuffer, moduleData.mime_type || fileBlob.type);
    } catch (parseError: any) {
      const errorMsg = parseError.message || 'Gagal mengekstrak isi teks dokumen.';
      await supabase
        .from('modules')
        .update({ status: 'failed', error_message: errorMsg })
        .eq('id', id);

      return NextResponse.json({ error: errorMsg }, { status: 422 });
    }

    // 7. Hitung content_hash (SHA-256)
    const contentHash = crypto.createHash('sha256').update(extracted.text).digest('hex');

    // 8. Pecah teks menjadi bab/bagian
    const chunks = splitIntoChapters(extracted.text);

    if (chunks.length === 0) {
      await supabase
        .from('modules')
        .update({ status: 'failed', error_message: 'Dokumen tidak menghasilkan potongan materi yang valid.' })
        .eq('id', id);

      return NextResponse.json(
        { error: 'Gagal membagi dokumen menjadi bab.' },
        { status: 422 }
      );
    }

    // 9. Hapus chunks lama bila sebelumnya pernah diproses ulang
    await supabase.from('module_chunks').delete().eq('module_id', id);

    // 10. Simpan potongan bab ke tabel module_chunks
    const rowsToInsert = chunks.map((chunk) => ({
      module_id: id,
      user_id: user.id,
      position: chunk.position,
      chapter_title: chunk.chapter_title,
      content: chunk.content,
    }));

    const { error: insertChunksError } = await supabase
      .from('module_chunks')
      .insert(rowsToInsert);

    if (insertChunksError) {
      await supabase
        .from('modules')
        .update({ status: 'failed', error_message: `Gagal menyimpan bab materi: ${insertChunksError.message}` })
        .eq('id', id);

      return NextResponse.json(
        { error: 'Gagal menyimpan bab materi ke database.' },
        { status: 500 }
      );
    }

    // 11. Perbarui status modul menjadi 'ready'
    const { error: updateModuleError } = await supabase
      .from('modules')
      .update({
        status: 'ready',
        content_hash: contentHash,
        char_count: extracted.charCount,
        error_message: null,
      })
      .eq('id', id);

    if (updateModuleError) {
      return NextResponse.json(
        { error: 'Gagal memperbarui status kesiapan modul.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Modul berhasil diekstrak dan siap dipelajari.',
      totalChapters: chunks.length,
      charCount: extracted.charCount,
      contentHash,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan internal pada server saat memproses modul.' },
      { status: 500 }
    );
  }
}
