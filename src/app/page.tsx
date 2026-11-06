import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BookOpen, FileText, Clock, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import FileUploader from '@/components/FileUploader';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
          Selamat Datang di Belajar Cerdas
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mb-8 text-sm leading-relaxed">
          Platform belajar cerdas berbasis Gemini AI. Unggah dokumen materi Anda dan biarkan AI merangkum, membuat flashcard, serta menyusun kuis interaktif secara otomatis.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition"
        >
          <span>Mulai Belajar Sekarang</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  // Ambil daftar modul milik user
  const { data: modules } = await supabase
    .from('modules')
    .select('*, module_chunks(count)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ruang Belajar Saya
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kelola modul belajar, rangkuman, kartu hafalan, dan latihan soal Anda.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <FileUploader />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Modul yang Sudah Diunggah</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {modules?.length || 0}
            </span>
          </h2>

          {(!modules || modules.length === 0) ? (
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
              {modules.map((mod: any) => {
                const chunksCount = mod.module_chunks?.[0]?.count ?? 0;
                return (
                  <Link
                    key={mod.id}
                    href={`/modules/${mod.id}`}
                    className="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md transition-all flex flex-col justify-between"
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
                        <span className="text-xs text-slate-400">
                          {new Date(mod.created_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 text-base mb-2">
                        {mod.title}
                      </h3>

                      {mod.status === 'failed' && mod.error_message && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="line-clamp-1">{mod.error_message}</span>
                        </p>
                      )}
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{chunksCount} Bab</span>
                      </span>

                      {mod.char_count && (
                        <span>{(mod.char_count / 1000).toFixed(1)}k Karakter</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
