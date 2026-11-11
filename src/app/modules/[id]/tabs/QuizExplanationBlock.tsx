'use client';

import { useState } from 'react';
import {
  BookOpen,
  Globe,
  Layers,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  ChevronUp,
} from 'lucide-react';
import FormattedContent from '@/components/FormattedContent';

export type ExplanationMode = 'modul' | 'luar_modul' | 'keduanya';

export interface QuizExplanationData {
  pertanyaan: string;
  opsi?: Record<string, string>;
  kunci: string;
  userAnswer: string;
  isCorrect: boolean;
  penjelasan?: string;
  penjelasan_modul?: string;
  penjelasan_luar?: string;
  sumber_penjelasan?: ExplanationMode;
  bab?: string;
}

export interface DeepExplainEntry {
  markdown: string;
  mode: ExplanationMode;
  usedChapters?: Array<{ position: number; chapter_title: string }>;
}

interface QuizExplanationBlockProps {
  item: QuizExplanationData;
  deepCache: Record<string, DeepExplainEntry>;
  onRequestDeepExplain: (item: QuizExplanationData, mode: ExplanationMode) => Promise<void>;
  loadingKey: string | null;
  errorByQuestion: Record<string, string>;
  compact?: boolean;
}

export function buildDeepExplainKey(
  pertanyaan: string,
  userAnswer: string,
  mode: ExplanationMode
): string {
  return `${pertanyaan.trim()}::${(userAnswer || '').toUpperCase()}::${mode}`;
}

export function buildQuestionErrorKey(pertanyaan: string, userAnswer: string): string {
  return `${pertanyaan.trim()}::${(userAnswer || '').toUpperCase()}`;
}

const MODE_META: Record<
  ExplanationMode,
  {
    label: string;
    shortDesc: string;
    badgeClass: string;
  }
> = {
  modul: {
    label: 'Dari Modul',
    shortDesc: 'Hanya aturan & isi modul',
    badgeClass:
      'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
  },
  luar_modul: {
    label: 'Dari Luar Modul',
    shortDesc: 'Pengetahuan umum & analogi',
    badgeClass:
      'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
  },
  keduanya: {
    label: 'Dua-duanya',
    shortDesc: 'Modul + pengayaan luar modul',
    badgeClass:
      'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
  },
};

function ModeIcon({ mode, className = 'w-3.5 h-3.5' }: { mode: ExplanationMode; className?: string }) {
  if (mode === 'modul') return <BookOpen className={className} />;
  if (mode === 'luar_modul') return <Globe className={className} />;
  return <Layers className={className} />;
}

export default function QuizExplanationBlock({
  item,
  deepCache,
  onRequestDeepExplain,
  loadingKey,
  errorByQuestion,
  compact = false,
}: QuizExplanationBlockProps) {
  const [activeDeepMode, setActiveDeepMode] = useState<ExplanationMode | null>(() => {
    const modes: ExplanationMode[] = ['keduanya', 'luar_modul', 'modul'];
    return (
      modes.find((m) =>
        Boolean(deepCache[buildDeepExplainKey(item.pertanyaan, item.userAnswer, m)])
      ) || null
    );
  });

  const initialSource: ExplanationMode = item.sumber_penjelasan || 'modul';
  const hasSplitInitial = Boolean(item.penjelasan_modul?.trim() || item.penjelasan_luar?.trim());
  const canRequestDeep = Boolean(
    item.opsi && item.opsi.A && item.opsi.B && item.opsi.C && item.opsi.D
  );

  const qErrorKey = buildQuestionErrorKey(item.pertanyaan, item.userAnswer);
  const inlineError = errorByQuestion[qErrorKey];

  const activeEntry = activeDeepMode
    ? deepCache[buildDeepExplainKey(item.pertanyaan, item.userAnswer, activeDeepMode)]
    : undefined;

  const isAnyModeLoadingForThisQuestion = (['modul', 'luar_modul', 'keduanya'] as ExplanationMode[]).some(
    (m) => loadingKey === buildDeepExplainKey(item.pertanyaan, item.userAnswer, m)
  );

  const handleSelectMode = async (mode: ExplanationMode) => {
    setActiveDeepMode(mode);
    const cacheKey = buildDeepExplainKey(item.pertanyaan, item.userAnswer, mode);
    if (!deepCache[cacheKey]) {
      await onRequestDeepExplain(item, mode);
    }
  };

  return (
    <div className="space-y-3">
      {/* Pembahasan Awal Soal */}
      {hasSplitInitial ? (
        <div className={`grid grid-cols-1 ${compact ? 'gap-2.5' : 'md:grid-cols-2 gap-3'}`}>
          {item.penjelasan_modul?.trim() && (
            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-white/90 dark:bg-slate-900/70 p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  <BookOpen className="w-3.5 h-3.5" />
                  Berdasarkan Modul
                </span>
                {item.bab && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50 truncate max-w-[160px]">
                    {item.bab}
                  </span>
                )}
              </div>
              <FormattedContent
                content={item.penjelasan_modul}
                autoStructure
                className="text-xs"
              />
            </div>
          )}

          {item.penjelasan_luar?.trim() && (
            <div className="rounded-xl border border-teal-200/80 dark:border-teal-900/50 bg-teal-50/70 dark:bg-teal-950/25 p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  <Globe className="w-3.5 h-3.5" />
                  Pengayaan Luar Modul
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100/80 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
                  Analogi &amp; Contoh
                </span>
              </div>
              <FormattedContent
                content={item.penjelasan_luar}
                autoStructure
                className="text-xs"
              />
            </div>
          )}
        </div>
      ) : (
        item.penjelasan?.trim() && (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/60 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Pembahasan Jawaban:
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MODE_META[initialSource].badgeClass}`}
              >
                <ModeIcon mode={initialSource} className="w-3 h-3" />
                <span>{MODE_META[initialSource].label}</span>
              </span>
            </div>
            <FormattedContent
              content={item.penjelasan}
              autoStructure
              className="text-xs"
            />
          </div>
        )
      )}

      {/* Panel Pendalaman Interaktif (Tersedia Saat Jawaban Benar maupun Salah) */}
      {canRequestDeep && (
        <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 bg-white/75 dark:bg-slate-900/50 p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>Minta Penjelasan Lagi (Lebih Mendalam)</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {item.isCorrect
                  ? 'Jawaban sudah benar! Pilih sumber penjelasan bila ingin memperdalam konsep & melihat contoh lain:'
                  : 'Pahami letak kekeliruan pilihan Anda & bandingkan dengan kunci lewat sudut pandang yang Anda pilih:'}
              </p>
            </div>
            {activeEntry && (
              <button
                type="button"
                onClick={() => setActiveDeepMode(null)}
                className="self-start sm:self-center inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Tutup</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['modul', 'luar_modul', 'keduanya'] as ExplanationMode[]).map((mode) => {
              const key = buildDeepExplainKey(item.pertanyaan, item.userAnswer, mode);
              const isCached = Boolean(deepCache[key]);
              const isLoadingThis = loadingKey === key;
              const isSelected = activeDeepMode === mode;

              return (
                <button
                  key={mode}
                  type="button"
                  disabled={isAnyModeLoadingForThisQuestion && !isCached}
                  onClick={() => handleSelectMode(mode)}
                  className={`px-3 py-2 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  } disabled:opacity-60`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <ModeIcon
                      mode={mode}
                      className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                        isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold truncate">
                        {MODE_META[mode].label}
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {MODE_META[mode].shortDesc}
                      </span>
                    </div>
                  </div>
                  <span className="flex-shrink-0">
                    {isLoadingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : isCached ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {activeDeepMode &&
            loadingKey === buildDeepExplainKey(item.pertanyaan, item.userAnswer, activeDeepMode) && (
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/50 text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>
                  Sedang menyusun penjelasan lanjutan ({MODE_META[activeDeepMode].label})...
                </span>
              </div>
            )}

          {inlineError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{inlineError}</span>
            </div>
          )}

          {activeEntry && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Penjelasan Lanjutan: {MODE_META[activeEntry.mode].label}</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MODE_META[activeEntry.mode].badgeClass}`}
                >
                  <ModeIcon mode={activeEntry.mode} className="w-3 h-3" />
                  <span>{MODE_META[activeEntry.mode].label}</span>
                </span>
              </div>

              <FormattedContent content={activeEntry.markdown} className="text-xs" />

              {activeEntry.usedChapters &&
                activeEntry.usedChapters.length > 0 &&
                activeEntry.mode !== 'luar_modul' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <strong>Rujukan Modul:</strong>{' '}
                    {activeEntry.usedChapters.map((c) => c.chapter_title).join(', ')}
                  </p>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
