'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BookOpen, Sparkles, AlertCircle, CheckCircle, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const enableMagicLink = process.env.NEXT_PUBLIC_ENABLE_MAGIC_LINK === 'true';
  const [usePassword, setUsePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      if (!usePassword && enableMagicLink) {
        // Mode Magic Link (OTP Email) - HANYA aktif bila variabel NEXT_PUBLIC_ENABLE_MAGIC_LINK=true
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;
        setMessage({
          type: 'success',
          text: 'Tautan masuk telah dikirim ke email Anda! Silakan periksa kotak masuk atau spam.',
        });
      } else {
        // Mode Password Utama
        if (isSignUp) {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (error) throw error;
          setMessage({
            type: 'success',
            text: 'Akun berhasil didaftarkan! Silakan masuk menggunakan kata sandi Anda.',
          });
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          window.location.href = '/';
        }
      }
    } catch (err: any) {
      let errorText = err.message || 'Gagal melakukan otentikasi.';
      const raw = String(err.message || '').toLowerCase();

      if (raw.includes('invalid login credentials')) {
        errorText = 'Email atau kata sandi tidak cocok. Silakan periksa kembali.';
      } else if (raw.includes('user already registered')) {
        errorText = 'Email ini sudah terdaftar. Silakan beralih ke tombol Masuk.';
      } else if (raw.includes('email not confirmed')) {
        errorText = 'Email belum dikonfirmasi. Silakan hubungi admin atau konfirmasi email Anda.';
      } else if (raw.includes('rate limit') || raw.includes('over_email_send_rate_limit')) {
        errorText = 'Batas pengiriman email sistem tercapai. Silakan coba sesaat lagi atau masuk dengan kata sandi.';
      } else if (raw.includes('signups not allowed') || raw.includes('signup disabled')) {
        errorText = 'Pendaftaran pengguna baru sedang dinonaktifkan oleh administrator.';
      } else if (raw.includes('password should be at least')) {
        errorText = 'Kata sandi harus terdiri dari minimal 6 karakter.';
      }

      setMessage({ type: 'error', text: errorText });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white shadow-lg mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Asisten Belajar Cerdas
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Ubah modul belajar (PDF, DOCX, TXT) jadi ringkasan, flashcard, dan kuis otomatis
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-xl rounded-2xl border border-slate-200/80 dark:border-slate-800">
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl flex items-start gap-3 text-sm ${
                message.type === 'error'
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border border-rose-200 dark:border-rose-900'
                  : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              ) : (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {usePassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {!usePassword
                      ? 'Kirim Tautan Masuk (Magic Link)'
                      : isSignUp
                      ? 'Daftar Akun Baru'
                      : 'Masuk dengan Kata Sandi'}
                  </span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3 text-xs text-center text-slate-500 dark:text-slate-400">
            {enableMagicLink && (
              <button
                type="button"
                onClick={() => {
                  setUsePassword(!usePassword);
                  setMessage(null);
                }}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
              >
                {usePassword ? 'Gunakan Masuk Tanpa Kata Sandi (Magic Link)' : 'Gunakan Kata Sandi'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setMessage(null);
              }}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
            >
              {isSignUp
                ? 'Sudah punya akun? Masuk di sini'
                : 'Belum punya akun? Buat akun baru'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
