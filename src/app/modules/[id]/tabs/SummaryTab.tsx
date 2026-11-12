'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import FormattedContent, { ContentLegend } from '@/components/FormattedContent';

import { readApiResponse, formatFriendlyErrorMessage, cleanDisplayText } from '@/lib/learning/api-stream-reader';

interface Chunk {
  id: string;
  position: number;
  chapter_title: string;
}

interface SummaryTabProps {
  moduleId: string;
  chunks: Chunk[];
  selectedChapter: number | 'all';
  onSelectChapter: (chapter: number | 'all') => void;
  onError: (msg: string, retry?: () => void) => void;
}

export default function SummaryTab({
  moduleId,
  chunks,
  selectedChapter,
  onSelectChapter,
  onError,
}: SummaryTabProps) {
  const [summaryStyle, setSummaryStyle] = useState<'singkat' | 'lengkap'>('singkat');
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    setSummaryText('');
    onError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'summary',
          chapterPosition: selectedChapter === 'all' ? undefined : selectedChapter,
          stream: true,
          params: {
            style: summaryStyle,
            maxPoints: 8,
          },
        }),
      });

      const result = await readApiResponse({
        response,
        onChunk: (accumulated) => setSummaryText(accumulated),
      });

      setSummaryText(result.text);
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message, handleGenerateSummary);
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = async () => {
    const textToCopy = cleanDisplayText(summaryText);
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      // Abaikan bila clipboard diblokir
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span>Generator Ringkasan Cerdas</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          AI akan menyusun penjelasan materi, poin-poin penting, contoh penerapan dalam kotak sorotan, dan bagian <strong>Wajib Diingat</strong> secara otomatis.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Pilih Materi / Bab
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => onSelectChapter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="all">Seluruh Modul ({chunks.length} Bab)</option>
              {chunks.map((c) => (
                <option key={c.position} value={c.position}>
                  Bab {c.position}: {c.chapter_title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Gaya Ringkasan
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSummaryStyle('singkat')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition ${
                  summaryStyle === 'singkat'
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                Singkat (Inti Saja)
              </button>
              <button
                type="button"
                onClick={() => setSummaryStyle('lengkap')}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition ${
                  summaryStyle === 'lengkap'
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                Lengkap (+ Contoh)
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerateSummary}
          disabled={isSummarizing}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSummarizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sedang Meringkas dengan Gemini AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Mulai Ringkas Sekarang</span>
            </>
          )}
        </button>
      </div>

      {(summaryText || isSummarizing) && (
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Hasil Ringkasan Gemini AI
            </span>
            {summaryText && (
              <button
                onClick={handleCopySummary}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                {summaryCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Ringkasan</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-3 text-slate-800 dark:text-slate-200">
            {summaryText && <ContentLegend />}
            {isSummarizing && !summaryText && (
              <div className="flex items-center gap-3 py-6 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Gemini AI sedang membaca bab dan merumuskan poin-poin inti...</span>
              </div>
            )}
            {summaryText && <FormattedContent content={cleanDisplayText(summaryText)} />}
            {isSummarizing && summaryText && (
              <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
