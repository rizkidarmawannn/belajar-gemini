'use client';

import { useState } from 'react';
import { HelpCircle, Sparkles, Loader2, Copy, Check } from 'lucide-react';
import FormattedContent from '@/components/FormattedContent';

import { readApiResponse, formatFriendlyErrorMessage, cleanDisplayText, type UsedChapterInfo, type UsedChaptersMode } from '@/lib/learning/api-stream-reader';

interface Chunk {
  id: string;
  position: number;
  chapter_title: string;
}

interface QATabProps {
  moduleId: string;
  chunks: Chunk[];
  onError: (msg: string, retry?: () => void) => void;
}

export default function QATab({ moduleId, chunks, onError }: QATabProps) {
  const [qaScope, setQaScope] = useState<number | 'all'>('all');
  const [question, setQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [usedChapters, setUsedChapters] = useState<UsedChapterInfo[]>([]);
  const [usedChaptersMode, setUsedChaptersMode] = useState<UsedChaptersMode | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [qaCopied, setQaCopied] = useState(false);

  const handleAskQuestion = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!question.trim()) return;

    setIsAsking(true);
    setQaAnswer('');
    setUsedChapters([]);
    setUsedChaptersMode(null);
    onError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'qa',
          chapterPosition: qaScope === 'all' ? undefined : qaScope,
          stream: true,
          params: {
            question: question.trim(),
          },
        }),
      });

      const res = await readApiResponse({
        response,
        onChunk: (accumulated) => setQaAnswer(accumulated),
      });

      setQaAnswer(res.text);
      if (res.usedChaptersMode) {
        setUsedChaptersMode(res.usedChaptersMode);
        setUsedChapters([]);
      } else if (res.usedChapters && res.usedChapters.length > 0) {
        setUsedChapters(res.usedChapters);
        setUsedChaptersMode(null);
      }
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message, () => handleAskQuestion());
      }
    } finally {
      setIsAsking(false);
    }
  };

  const handleCopyQa = async () => {
    const textToCopy = cleanDisplayText(qaAnswer);
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setQaCopied(true);
      setTimeout(() => setQaCopied(false), 2000);
    } catch {
      // Abaikan bila browser memblokir clipboard
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-600" />
          <span>Tanya Jawab tentang Isi Modul</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tanyakan apa saja seputar topik, contoh penerapan, atau rincian materi. AI akan mengutamakan isi modul dan melengkapi dengan literatur terpercaya beserta sumber referensinya bila topik berada di luar modul.
        </p>

        <form onSubmit={handleAskQuestion} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Lingkup Pencarian Dokumen:
            </label>
            <select
              value={qaScope}
              onChange={(e) => setQaScope(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
            >
              <option value="all">🌐 Seluruh Modul (Sangat Direkomendasikan - Menganalisis semua bab)</option>
              {chunks.map((c) => (
                <option key={c.id} value={c.position}>
                  Bab {c.position}: {c.chapter_title}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Pilih <strong>Seluruh Modul</strong> agar AI dapat mengaitkan contoh, teori, hierarki, dan bab kesimpulan secara utuh.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pertanyaan Anda:
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Contoh: apa contoh smk3, apa rumus gaya gravitasi, atau topik lain yang ingin ditanyakan..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isAsking || !question.trim()}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAsking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menganalisis Dokumen Modul & Menjawab...</span>
              </>
            ) : (
              <>
                <HelpCircle className="w-4 h-4" />
                <span>Tanyakan ke AI</span>
              </>
            )}
          </button>
        </form>
      </div>

      {(qaAnswer || isAsking) && (
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Jawaban Tutor AI
            </span>
            {qaAnswer && (
              <button
                onClick={handleCopyQa}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                {qaCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Jawaban</span>
                  </>
                )}
              </button>
            )}
          </div>

          {!isAsking && qaAnswer && (() => {
            const isExternal =
              usedChaptersMode?.mode === 'external' ||
              qaAnswer.includes('Referensi Umum') ||
              qaAnswer.includes('Referensi Eksternal') ||
              qaAnswer.includes('di luar materi modul') ||
              qaAnswer.includes('tidak tercantum secara spesifik di modul');

            return (
              <div
                className={`flex flex-wrap items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
                  isExternal
                    ? 'text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-900/40'
                    : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/40'
                }`}
              >
                <span className="font-semibold">Dijawab dari:</span>
                {isExternal ? (
                  <span className="font-medium flex items-center gap-1">
                    <span>🌐</span>
                    <span>Referensi Eksternal / Pengetahuan Umum (Topik di luar modul)</span>
                  </span>
                ) : usedChaptersMode?.mode === 'all' ? (
                  <span className="font-medium">Seluruh Modul ({usedChaptersMode.count} Bab)</span>
                ) : usedChapters.length > 0 ? (
                  usedChapters.map((ch, idx) => (
                    <span key={ch.position} className="font-medium">
                      Bab {ch.position} ({ch.chapter_title}){idx < usedChapters.length - 1 ? ', ' : ''}
                    </span>
                  ))
                ) : (
                  <span className="font-medium">Modul Belajar</span>
                )}
              </div>
            );
          })()}

          <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed space-y-3">
            {isAsking && !qaAnswer && (
              <div className="flex items-center gap-3 py-4 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Gemini AI sedang membaca isi modul dan merumuskan jawaban mendalam...</span>
              </div>
            )}
            {qaAnswer && <FormattedContent content={cleanDisplayText(qaAnswer)} />}
            {isAsking && qaAnswer && (
              <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
