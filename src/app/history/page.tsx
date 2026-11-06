import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { History, Award, BookOpen, Clock, ArrowLeft, Zap } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-600 dark:text-slate-400">Silakan login untuk melihat riwayat belajar.</p>
        <Link href="/login" className="mt-4 inline-block text-indigo-600 underline">
          Masuk Sekarang
        </Link>
      </div>
    );
  }

  // Ambil riwayat kuis
  const { data: quizAttempts } = await supabase
    .from('quiz_attempts')
    .select('*, modules(title)')
    .order('created_at', { ascending: false })
    .limit(20);

  // Ambil catatan pemakaian kuota
  const { data: usageLogs } = await supabase
    .from('usage_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Kembali ke Modul Saya"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-600" />
            <span>Riwayat Belajar Saya</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pantau progres kuis, latihan soal, dan aktivitas belajar AI Anda.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kolom 1: Hasil Kuis Terakhir */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <span>Riwayat Kuis Terakhir</span>
          </h2>

          {(!quizAttempts || quizAttempts.length === 0) ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Award className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Belum ada riwayat kuis</p>
              <p className="text-xs text-slate-400 mt-1">Buka modul Anda dan klik "Latihan Soal" untuk mulai menguji pemahaman.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {quizAttempts.map((attempt: any) => {
                const percentage = Math.round((attempt.score / attempt.total) * 100);
                return (
                  <div key={attempt.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">
                        {attempt.modules?.title || 'Modul Belajar'}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(attempt.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${percentage >= 70 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                        {attempt.score}/{attempt.total} ({percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Kolom 2: Aktivitas Panggilan AI */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            <span>Aktivitas AI Terkini</span>
          </h2>

          {(!usageLogs || usageLogs.length === 0) ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Zap className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Belum ada panggilan AI</p>
              <p className="text-xs text-slate-400 mt-1">Gunakan fitur ringkasan, flashcard, atau kuis di modul Anda.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {usageLogs.map((log: any) => (
                <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {log.feature}
                    </span>
                    <p className="text-slate-400 mt-0.5">
                      {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right text-slate-500 dark:text-slate-400">
                    <span>{log.tokens_in || 0} in / {log.tokens_out || 0} out</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
