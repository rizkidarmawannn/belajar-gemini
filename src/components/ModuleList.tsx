'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, FileText, AlertTriangle, Trash2, Loader2, X } from 'lucide-react';

export interface ModuleItem {
  id: string;
  title: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  created_at: string;
  char_count?: number | null;
  error_message?: string | null;
  module_chunks?: Array<{ count: number }> | null;
}

interface ModuleListProps {
  initialModules: ModuleItem[];
}

export default function ModuleList({ initialModules }: ModuleListProps) {
  const router = useRouter();
  const [modules, setModules] = useState<ModuleItem[]>(initialModules);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ id: string; title: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/modules/${id}`, {
        method: 'DELETE',
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // non-json response
      }

      if (!res.ok) {
        throw new Error(json?.error || `Gagal menghapus modul (Status HTTP ${res.status}).`);
      }

      // Hapus modul dari state lokal
      setModules((prev) => prev.filter((m) => m.id !== id));
      setConfirmModal(null);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat menghapus modul.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span>Modul yang Sudah Diunggah</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {modules.length}
          </span>
        </h2>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg text-rose-600 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {modules.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
          <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Belum ada modul yang diunggah
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Gunakan form di samping untuk mulai mengunggah file materi pelajaran Anda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modules.map((mod) => {
            const chunksCount = mod.module_chunks?.[0]?.count ?? 0;
            const isDeleting = deletingId === mod.id;

            return (
              <div
                key={mod.id}
                className="group relative bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        mod.status === 'ready'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : mod.status === 'processing'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 animate-pulse'
                          : mod.status === 'failed'
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {mod.status === 'ready'
                        ? 'Siap Dipelajari'
                        : mod.status === 'processing'
                        ? 'Sedang Diekstrak...'
                        : mod.status === 'failed'
                        ? 'Gagal'
                        : 'Baru Diunggah'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">
                        {new Date(mod.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>

                      {/* Tombol Hapus Modul */}
                      <button
                        title="Hapus Modul"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmModal({ id: mod.id, title: mod.title });
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors ml-1"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Link href={`/modules/${mod.id}`} className="block">
                    <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 text-base mb-2">
                      {mod.title}
                    </h3>
                  </Link>

                  {mod.status === 'failed' && mod.error_message && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="line-clamp-1">{mod.error_message}</span>
                    </p>
                  )}
                </div>

                <Link
                  href={`/modules/${mod.id}`}
                  className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{chunksCount} Bab</span>
                  </span>

                  {mod.char_count && (
                    <span>{(mod.char_count / 1000).toFixed(1)}k Karakter</span>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Hapus Modul Belajar?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Modul <strong className="text-slate-800 dark:text-slate-200">&quot;{confirmModal.title}&quot;</strong> beserta seluruh rangkuman, flashcard, dan riwayat latihan soalnya akan dihapus permanen.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={!!deletingId}
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!!deletingId}
                onClick={() => handleDelete(confirmModal.id)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deletingId === confirmModal.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <span>Ya, Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
