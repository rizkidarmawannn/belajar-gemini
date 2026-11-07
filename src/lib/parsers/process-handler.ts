import crypto from 'crypto';
import { createClient } from '../supabase/server.ts';
import { extractDocumentText } from './document-parser.ts';
import { splitIntoChapters } from './chapter-splitter.ts';

export interface ProcessDeps {
  getAuthUser: () => Promise<{ user: { id: string } | null; error: any }>;
  getModule: (id: string) => Promise<{ data: any; error: any }>;
  updateModuleStatus: (id: string, status: string, errorMessage?: string | null) => Promise<any>;
  downloadFile: (storagePath: string) => Promise<{ data: Blob | null; error: any }>;
  extractText: (fileBuffer: Buffer, mimeType: string) => Promise<{ text: string; charCount: number }>;
  splitChapters: (text: string) => Array<{ position: number; chapter_title: string; content: string }>;
  deleteModuleChunks: (moduleId: string) => Promise<any>;
  insertModuleChunks: (rows: any[]) => Promise<any>;
  updateModuleReady: (id: string, updates: { contentHash: string; charCount: number }) => Promise<any>;
}

export function createProcessProductionDeps(): ProcessDeps {
  return {
    async getAuthUser() {
      // Menggunakan klien Supabase RLS (bukan admin) berbasis cookie sesi pengguna
      const supabase = await createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      return { user: user ? { id: user.id } : null, error };
    },
    async getModule(id: string) {
      const supabase = await createClient();
      return await supabase.from('modules').select('*').eq('id', id).single();
    },
    async updateModuleStatus(id: string, status: string, errorMessage: string | null = null) {
      const supabase = await createClient();
      return await supabase.from('modules').update({ status, error_message: errorMessage }).eq('id', id);
    },
    async downloadFile(storagePath: string) {
      // Pengunduhan menggunakan klien Supabase RLS yang mematuhi policy bucket privat modules
      const supabase = await createClient();
      return await supabase.storage.from('modules').download(storagePath);
    },
    async extractText(fileBuffer: Buffer, mimeType: string) {
      return await extractDocumentText(fileBuffer, mimeType);
    },
    splitChapters(text: string) {
      return splitIntoChapters(text);
    },
    async deleteModuleChunks(moduleId: string) {
      const supabase = await createClient();
      return await supabase.from('module_chunks').delete().eq('module_id', moduleId);
    },
    async insertModuleChunks(rows: any[]) {
      const supabase = await createClient();
      return await supabase.from('module_chunks').insert(rows);
    },
    async updateModuleReady(id: string, { contentHash, charCount }) {
      const supabase = await createClient();
      return await supabase.from('modules').update({
        status: 'ready',
        content_hash: contentHash,
        char_count: charCount,
        error_message: null,
      }).eq('id', id);
    },
  };
}

export async function handleProcessModule(deps: ProcessDeps, moduleId: string): Promise<Response> {
  let isProcessingMarked = false;
  try {
    // 1. Verifikasi autentikasi pengguna
    const { user, error: authError } = await deps.getAuthUser();
    if (authError || !user) {
      return Response.json(
        { error: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    // 2. Ambil data modul dan verifikasi kepemilikan eksplisit di server
    const { data: moduleData, error: moduleError } = await deps.getModule(moduleId);
    if (moduleError || !moduleData || moduleData.user_id !== user.id) {
      return Response.json(
        { error: 'Modul tidak ditemukan atau Anda tidak memiliki akses.' },
        { status: 404 }
      );
    }

    // 2b. Cegah pemrosesan ganda (Idempotensi): Bila status modul sudah 'processing', tolak dengan 409 Conflict
    if (moduleData.status === 'processing') {
      return Response.json(
        { error: 'Modul ini sedang dalam proses ekstraksi materi. Mohon tunggu beberapa saat hingga proses selesai.' },
        { status: 409 }
      );
    }

    // 3. Verifikasi storage_path: WAJIB diawali "<user.id>/" dan bebas traversal ".."
    const expectedPrefix = `${user.id}/`;
    if (
      !moduleData.storage_path ||
      !moduleData.storage_path.startsWith(expectedPrefix) ||
      moduleData.storage_path.includes('..')
    ) {
      const errorMessage = 'Akses ditolak: path berkas penyimpanan tidak valid atau milik pengguna lain.';
      await deps.updateModuleStatus(moduleId, 'failed', errorMessage);
      return Response.json({ error: errorMessage }, { status: 403 });
    }

    // 4. Update status menjadi 'processing' (Tandai flag agar tidak tertinggal bila ada uncaught error)
    await deps.updateModuleStatus(moduleId, 'processing', null);
    isProcessingMarked = true;

    // 5. Unduh berkas via Storage klien RLS
    const { data: fileBlob, error: downloadError } = await deps.downloadFile(moduleData.storage_path);
    if (downloadError || !fileBlob) {
      const errorMessage = `Gagal mengunduh berkas dari penyimpanan: ${downloadError?.message || 'Berkas tidak ada'}`;
      await deps.updateModuleStatus(moduleId, 'failed', errorMessage);
      return Response.json({ error: errorMessage }, { status: 400 });
    }

    // 6. Konversi Blob ke Buffer untuk ekstraksi teks
    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // 7. Ekstraksi teks dari PDF/DOCX/TXT
    let extracted: { text: string; charCount: number };
    try {
      extracted = await deps.extractText(fileBuffer, moduleData.mime_type || fileBlob.type);
    } catch (parseError: any) {
      const errorMsg = parseError.message || 'Gagal mengekstrak isi teks dokumen.';
      await deps.updateModuleStatus(moduleId, 'failed', errorMsg);
      return Response.json({ error: errorMsg }, { status: 422 });
    }

    // 8. Validasi isi teks dokumen (deteksi scan kosong)
    const trimmedText = (extracted.text || '').trim();
    if (trimmedText.length === 0) {
      const emptyError =
        'Dokumen tidak memuat teks yang dapat dibaca (misalnya dokumen hasil scan tanpa OCR). Harap unggah dokumen yang memuat teks asli.';
      await deps.updateModuleStatus(moduleId, 'failed', emptyError);
      return Response.json({ error: emptyError }, { status: 422 });
    }

    // 9. Batas maksimum ukuran teks (500.000 karakter)
    const MAX_MODULE_CHARS = 500000;
    if (extracted.charCount > MAX_MODULE_CHARS) {
      const sizeError = `Ukuran teks dokumen (${extracted.charCount.toLocaleString('id-ID')} karakter) melebihi batas maksimum (${MAX_MODULE_CHARS.toLocaleString('id-ID')} karakter).`;
      await deps.updateModuleStatus(moduleId, 'failed', sizeError);
      return Response.json({ error: sizeError }, { status: 422 });
    }

    // 10. Hitung content_hash (SHA-256)
    const contentHash = crypto.createHash('sha256').update(extracted.text).digest('hex');

    // 11. Pecah teks menjadi bab/bagian
    const chunks = deps.splitChapters(extracted.text);
    if (!chunks || chunks.length === 0) {
      await deps.updateModuleStatus(moduleId, 'failed', 'Dokumen tidak menghasilkan potongan materi yang valid.');
      return Response.json({ error: 'Gagal membagi dokumen menjadi bab.' }, { status: 422 });
    }

    // 12. Hapus chunks lama jika sebelumnya pernah diproses ulang (Klien RLS mencegah tabrakan UNIQUE(module_id, position))
    const deleteRes = await deps.deleteModuleChunks(moduleId);
    if (deleteRes?.error) {
      const errMsg = `Gagal membersihkan bab materi lama: ${deleteRes.error.message}`;
      await deps.updateModuleStatus(moduleId, 'failed', errMsg);
      return Response.json({ error: errMsg }, { status: 500 });
    }

    // 13. Simpan potongan bab
    const rowsToInsert = chunks.map((chunk) => ({
      module_id: moduleId,
      user_id: user.id,
      position: chunk.position,
      chapter_title: chunk.chapter_title,
      content: chunk.content,
    }));

    const insertRes = await deps.insertModuleChunks(rowsToInsert);
    if (insertRes?.error) {
      const errMsg = `Gagal menyimpan bab materi: ${insertRes.error.message}`;
      await deps.updateModuleStatus(moduleId, 'failed', errMsg);
      return Response.json({ error: errMsg }, { status: 500 });
    }

    // 14. Perbarui status modul menjadi 'ready'
    await deps.updateModuleReady(moduleId, { contentHash, charCount: extracted.charCount });

    return Response.json({
      success: true,
      message: 'Modul berhasil diekstrak dan siap dipelajari.',
      totalChapters: chunks.length,
      charCount: extracted.charCount,
      contentHash,
    });
  } catch (err: any) {
    const errorMsg = err.message || 'Terjadi kesalahan internal pada server saat memproses modul.';
    // Pastikan status modul TIDAK pernah tertinggal 'processing' bila terjadi unhandled error
    if (isProcessingMarked) {
      try {
        await deps.updateModuleStatus(moduleId, 'failed', errorMsg);
      } catch {
        // Abaikan kegagalan logging status sekunder agar error asli tetap terlempar
      }
    }
    return Response.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
