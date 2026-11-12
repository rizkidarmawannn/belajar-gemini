'use client';

import { useState } from 'react';
import { PenTool, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { formatFriendlyErrorMessage, parseErrorResponse } from '@/lib/learning/api-stream-reader';

interface EssayTabProps {
  moduleId: string;
  onError: (msg: string, retry?: () => void) => void;
}

export default function EssayTab({ moduleId, onError }: EssayTabProps) {
  const [essayQuestion, setEssayQuestion] = useState('');
  const [essayAnswer, setEssayAnswer] = useState('');
  const [essayResult, setEssayResult] = useState<any>(null);
  const [isEvaluatingEssay, setIsEvaluatingEssay] = useState(false);

  const handleEvaluateEssay = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!essayQuestion.trim() || !essayAnswer.trim()) return;

    setIsEvaluatingEssay(true);
    setEssayResult(null);
    onError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'essay_eval',
          params: {
            question: essayQuestion.trim(),
            userAnswer: essayAnswer.trim(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gagal mengevaluasi jawaban esai.'));
      }

      const json = await response.json();
      setEssayResult(json.result);
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message, () => handleEvaluateEssay());
      }
    } finally {
      setIsEvaluatingEssay(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <PenTool className="w-5 h-5 text-indigo-600" />
          <span>Penilai & Korektor Esai Otomatis</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tulis jawaban esai atau penjelasan Anda sendiri. AI akan mengoreksi ketepatan isi, kelengkapan poin, kejelasan bahasa, serta memberikan contoh jawaban ideal berdasarkan modul.
        </p>

        <form onSubmit={handleEvaluateEssay} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pertanyaan Esai:
            </label>
            <input
              type="text"
              required
              value={essayQuestion}
              onChange={(e) => setEssayQuestion(e.target.value)}
              placeholder="Contoh: Mengapa perusahaan wajib menerapkan SMK3 dan apa tahapan utamanya?"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Jawaban Anda:
            </label>
            <textarea
              required
              rows={5}
              value={essayAnswer}
              onChange={(e) => setEssayAnswer(e.target.value)}
              placeholder="Ketik uraian jawaban Anda di sini selengkap mungkin..."
              className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={isEvaluatingEssay || !essayQuestion.trim() || !essayAnswer.trim()}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isEvaluatingEssay ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menganalisis Jawaban Anda Berdasarkan Rubrik...</span>
              </>
            ) : (
              <>
                <PenTool className="w-4 h-4" />
                <span>Koreksi & Nilai Jawaban Saya</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Hasil Evaluasi Esai */}
      {essayResult && (
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                Hasil Koreksi Esai
              </span>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Skor: {essayResult.skor} / 100
              </h3>
            </div>

            {/* Rubrik Bar */}
            <div className="flex items-center gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 block text-[10px]">Ketepatan</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {essayResult.rincian?.ketepatan ?? 0} / 50
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 block text-[10px]">Kelengkapan</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {essayResult.rincian?.kelengkapan ?? 0} / 30
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-slate-400 block text-[10px]">Kejelasan</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {essayResult.rincian?.kejelasan ?? 0} / 20
                </span>
              </div>
            </div>
          </div>

          {/* Poin Sudah Benar vs Keliru vs Terlewat */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-2">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Poin Sudah Benar:
              </span>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                {(essayResult.sudah_benar || []).map((p: string, i: number) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-2">
              <span className="font-bold text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                Poin yang Kurang Tepat:
              </span>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                {(essayResult.keliru || []).length > 0 ? (
                  (essayResult.keliru || []).map((p: string, i: number) => <li key={i}>{p}</li>)
                ) : (
                  <li className="text-slate-400 list-none">Tidak ada kekeliruan fatal.</li>
                )}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-2">
              <span className="font-bold text-amber-700 dark:text-amber-400 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Poin Penting Terlewat:
              </span>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                {(essayResult.terlewat || []).length > 0 ? (
                  (essayResult.terlewat || []).map((p: string, i: number) => <li key={i}>{p}</li>)
                ) : (
                  <li className="text-slate-400 list-none">Semua poin penting tercakup!</li>
                )}
              </ul>
            </div>
          </div>

          {/* Contoh Jawaban Ideal dari Modul */}
          {essayResult.jawaban_ideal && (
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                📖 Contoh Jawaban Ideal dari Modul:
              </span>
              <p className="leading-relaxed">{essayResult.jawaban_ideal}</p>
            </div>
          )}

          {/* Saran Tutor */}
          {essayResult.saran && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-xs text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                💬 Saran Peningkatan dari Tutor:
              </span>
              <p className="leading-relaxed">{essayResult.saran}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
