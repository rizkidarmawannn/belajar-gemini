import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BookOpen, ArrowRight } from 'lucide-react';
import FileUploader from '@/components/FileUploader';
import ModuleList from '@/components/ModuleList';

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

        <div className="lg:col-span-2">
          <ModuleList initialModules={modules || []} />
        </div>
      </div>
    </div>
  );
}
