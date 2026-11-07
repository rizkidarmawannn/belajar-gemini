import { createClient } from '../supabase/server.ts';

export interface DeleteModuleDeps {
  getAuthUser: () => Promise<{ user: any; error: any }>;
  getModule: (moduleId: string, userId: string) => Promise<{ data: any; error: any }>;
  deleteStorageFile: (storagePath: string) => Promise<{ error: any }>;
  deleteModuleRow: (moduleId: string, userId: string) => Promise<{ error: any }>;
}

export function createDeleteModuleProductionDeps(): DeleteModuleDeps {
  return {
    async getAuthUser() {
      const supabase = await createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      return { user: user ? { id: user.id } : null, error };
    },
    async getModule(moduleId: string, userId: string) {
      const supabase = await createClient();
      return await supabase
        .from('modules')
        .select('*')
        .eq('id', moduleId)
        .eq('user_id', userId)
        .single();
    },
    async deleteStorageFile(storagePath: string) {
      const supabase = await createClient();
      return await supabase.storage.from('modules').remove([storagePath]);
    },
    async deleteModuleRow(moduleId: string, userId: string) {
      const supabase = await createClient();
      return await supabase.from('modules').delete().eq('id', moduleId).eq('user_id', userId);
    },
  };
}

export async function handleDeleteModule(
  deps: DeleteModuleDeps,
  moduleId: string
): Promise<Response> {
  // 1. Verifikasi sesi login
  const { user, error: authError } = await deps.getAuthUser();
  if (authError || !user) {
    return Response.json(
      { error: 'Harap masuk terlebih dahulu untuk menghapus modul.' },
      { status: 401 }
    );
  }

  // 2. Ambil data modul & verifikasi kepemilikan
  const { data: moduleData, error: modError } = await deps.getModule(moduleId, user.id);
  if (modError || !moduleData) {
    return Response.json(
      { error: 'Modul tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.' },
      { status: 404 }
    );
  }

  // 3. Hapus berkas fisik di Supabase Storage jika ada
  if (moduleData.storage_path) {
    try {
      await deps.deleteStorageFile(moduleData.storage_path);
    } catch {
      // Abaikan bila berkas di storage sudah terhapus sebelumnya agar penghapusan data database tetap lanjut
    }
  }

  // 4. Hapus baris modul dari database
  // Catatan: Karena ON DELETE CASCADE aktif di PostgreSQL, seluruh module_chunks, generations,
  // flashcards, dan quiz_attempts yang terhubung akan otomatis terhapus bersih.
  const { error: delError } = await deps.deleteModuleRow(moduleId, user.id);
  if (delError) {
    return Response.json(
      { error: `Gagal menghapus modul dari database: ${delError.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    message: 'Modul beserta seluruh rangkuman, kartu hafalan, dan riwayat kuis berhasil dihapus.',
  });
}
