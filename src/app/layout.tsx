import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { BookOpen, History, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Asisten Belajar Cerdas - Gemini AI',
  description: 'Aplikasi belajar interaktif: ringkasan, flashcard, dan kuis otomatis dari modul belajar.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Abaikan bila variabel lingkungan belum diset saat build
  }

  return (
    <html lang="id">
      <body className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {user && (
          <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900 dark:text-white hover:opacity-90 transition">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span>Belajar Cerdas</span>
              </Link>

              <nav className="flex items-center gap-4">
                <Link
                  href="/"
                  className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Modul Saya
                </Link>
                <Link
                  href="/history"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <History className="w-4 h-4" />
                  <span>Riwayat Belajar</span>
                </Link>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 py-1.5 px-2.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                    title="Keluar dari akun"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar</span>
                  </button>
                </form>
              </nav>
            </div>
          </header>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          <p>© 2026 Asisten Belajar Berbasis Gemini API & Supabase. Dibuat dengan cinta untuk pendidikan.</p>
        </footer>
      </body>
    </html>
  );
}
