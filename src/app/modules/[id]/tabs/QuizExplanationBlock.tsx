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
  RefreshCw,
  HelpCircle,
  Send,
  MessageSquare,
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
  userQuestion?: string;
  isTruncated?: boolean;
  usedChapters?: Array<{ position: number; chapter_title: string }>;
}

export interface QuizExplanationBlockProps {
  item: QuizExplanationData;
  deepCache: Record<string, DeepExplainEntry>;
  streamingCache?: Record<string, string>;
  onRequestDeepExplain: (
    item: QuizExplanationData,
    mode: ExplanationMode,
    userQuestion?: string
  ) => Promise<void>;
  loadingKey: string | null;
  errorByQuestion: Record<string, string>;
  compact?: boolean;
}

export function buildDeepExplainKey(
  pertanyaan: string,
  userAnswer: string,
  mode: ExplanationMode,
  userQuestion: string = ''
): string {
  const normQ = (userQuestion || '').trim().toLowerCase();
  return normQ
    ? `${pertanyaan.trim()}::${(userAnswer || '').toUpperCase()}::${mode}::${normQ}`
    : `${pertanyaan.trim()}::${(userAnswer || '').toUpperCase()}::${mode}`;
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
    shortDesc: 'Hanya materi & aturan di modul',
    badgeClass:
      'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
  },
  luar_modul: {
    label: 'Dari Luar Modul',
    shortDesc: 'Pengetahuan umum, analogi & contoh',
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

const PRESET_QUESTIONS = [
  'Kenapa jawaban saya kurang tepat?',
  'Jelaskan konsep inti soal ini lebih sederhana',
  'Berikan contoh nyata penerapannya',
  'Apa perbedaan utama kunci jawaban dengan opsi lainnya?',
];

function ModeIcon({ mode, className = 'w-3.5 h-3.5' }: { mode: ExplanationMode; className?: string }) {
  if (mode === 'modul') return <BookOpen className={className} />;
  if (mode === 'luar_modul') return <Globe className={className} />;
  return <Layers className={className} />;
}

export default function QuizExplanationBlock({
  item,
  deepCache,
  streamingCache = {},
  onRequestDeepExplain,
  loadingKey,
  errorByQuestion,
  compact = false,
}: QuizExplanationBlockProps) {
  const [userQuestionText, setUserQuestionText] = useState('');
  const [selectedMode, setSelectedMode] = useState<ExplanationMode>(
    item.sumber_penjelasan || 'keduanya'
  );
  const [activeKey, setActiveKey] = useState<string | null>(() => {
    // 1. Cek mode default
    const modes: ExplanationMode[] = ['keduanya', 'luar_modul', 'modul'];
    for (const m of modes) {
      const k = buildDeepExplainKey(item.pertanyaan, item.userAnswer, m);
      if (deepCache[k]) return k;
    }
    // 2. Cek apakah ada key yang cocok untuk pertanyaan & jawaban ini
    const prefix = `${item.pertanyaan.trim()}::${(item.userAnswer || '').toUpperCase()}::`;
    const found = Object.keys(deepCache).find((k) => k.startsWith(prefix));
    return found || null;
  });

  const initialSource: ExplanationMode = item.sumber_penjelasan || 'modul';
  const hasSplitInitial = Boolean(item.penjelasan_modul?.trim() || item.penjelasan_luar?.trim());
  const canRequestDeep = Boolean(
    item.opsi && item.opsi.A && item.opsi.B && item.opsi.C && item.opsi.D
  );

  const qErrorKey = buildQuestionErrorKey(item.pertanyaan, item.userAnswer);
  const inlineError = errorByQuestion[qErrorKey];

  const activeEntry = activeKey ? deepCache[activeKey] : undefined;
  const activeStreamingText = activeKey ? streamingCache[activeKey] || '' : '';
  const isActiveStreamingLoading = Boolean(activeKey && loadingKey === activeKey);

  const prefixThisItem = `${item.pertanyaan.trim()}::${(item.userAnswer || '').toUpperCase()}::`;
  const isAnyLoadingForThis = Boolean(loadingKey && loadingKey.startsWith(prefixThisItem));

  const handleSelectMode = (mode: ExplanationMode) => {
    setSelectedMode(mode);
    const q = userQuestionText.trim();
    const targetKey = buildDeepExplainKey(item.pertanyaan, item.userAnswer, mode, q);
    if (deepCache[targetKey] && !deepCache[targetKey].isTruncated) {
      setActiveKey(targetKey);
    }
  };

  const handleSubmitQuestion = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = userQuestionText.trim();
    const targetKey = buildDeepExplainKey(item.pertanyaan, item.userAnswer, selectedMode, q);
    setActiveKey(targetKey);
    const existing = deepCache[targetKey];
    if (!existing || existing.isTruncated) {
      await onRequestDeepExplain(item, selectedMode, q);
    }
  };

  const handleApplyPreset = (preset: string) => {
    setUserQuestionText(preset);
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

      {/* Panel Tanya Bagian yang Membingungkan (Interaktif AI Tutor) */}
      {canRequestDeep && (
        <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 p-4 sm:p-5 space-y-4 shadow-xs">
          {/* Header Panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Tanya Bagian yang Membingungkan</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 font-normal">
                    AI Tutor
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Tuliskan pertanyaanmu sendiri seputar soal ini, lalu pilih mau jawaban yang bersumber dari dalam modul atau luar modul.
                </p>
              </div>
            </div>

            {activeEntry && (
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                className="self-start sm:self-center inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Tutup Pembahasan</span>
              </button>
            )}
          </div>

          {/* Form Input Pertanyaan Sendiri */}
          <form onSubmit={handleSubmitQuestion} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                <span>Bagian mana yang membingungkanmu?</span>
              </label>
              <textarea
                rows={2}
                value={userQuestionText}
                onChange={(e) => setUserQuestionText(e.target.value)}
                placeholder="Contoh: Kenapa jawaban saya keliru? / Apa bedanya konsep pilihan A dan B? / Jelaskan bagian mana yang paling krusial..."
                className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 p-2.5 sm:p-3 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition shadow-2xs resize-none"
              />
            </div>

            {/* Rekomendasi Pertanyaan Cepat */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mr-1">
                Pertanyaan Cepat:
              </span>
              {PRESET_QUESTIONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-600 dark:text-slate-300 transition"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Pilihan Sumber Jawaban: Mau yang ada didalam modul atau dari luar? */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                Mau yang ada di dalam modul atau dari luar jawabannya?
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pilih sumber referensi jawaban yang kamu inginkan:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                {(['modul', 'luar_modul', 'keduanya'] as ExplanationMode[]).map((mode) => {
                  const isSelected = selectedMode === mode;
                  const keyForThis = buildDeepExplainKey(
                    item.pertanyaan,
                    item.userAnswer,
                    mode,
                    userQuestionText.trim()
                  );
                  const isCached = Boolean(deepCache[keyForThis] && !deepCache[keyForThis].isTruncated);
                  const isLoadingThis = loadingKey === keyForThis;

                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSelectMode(mode)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
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
                        ) : isSelected ? (
                          <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tombol Kirim Pertanyaan */}
            <div className="pt-1 flex items-center justify-end">
              <button
                type="submit"
                disabled={isAnyLoadingForThis}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 transition disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                {isAnyLoadingForThis ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyiapkan Jawaban AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {userQuestionText.trim()
                        ? `Tanyakan ke AI (${MODE_META[selectedMode].label})`
                        : `Minta Penjelasan AI (${MODE_META[selectedMode].label})`}
                    </span>
                    <Send className="w-3 h-3 ml-0.5 opacity-80" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Status Loading Awal Sebelum Stream Datang */}
          {isActiveStreamingLoading && !activeStreamingText.trim() && (
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/50 text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                Sedang menyusun jawaban ({MODE_META[selectedMode].label})...
              </span>
            </div>
          )}

          {/* Pesan Kesalahan Jika Terjadi Kendala */}
          {inlineError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{inlineError}</span>
            </div>
          )}

          {/* Area Teks Streaming yang Sedang Diterima */}
          {isActiveStreamingLoading && activeStreamingText.trim().length > 0 && (
            <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/60 bg-white/95 dark:bg-slate-900/90 p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <span>Menjawab Kebingungan: {MODE_META[selectedMode].label}</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MODE_META[selectedMode].badgeClass}`}
                >
                  <ModeIcon mode={selectedMode} className="w-3 h-3" />
                  <span>{MODE_META[selectedMode].label}</span>
                </span>
              </div>

              {userQuestionText.trim() && (
                <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                    Pertanyaan yang Diajukan:
                  </span>
                  <p className="italic font-medium">"{userQuestionText.trim()}"</p>
                </div>
              )}

              <FormattedContent content={activeStreamingText} className="text-xs" />
            </div>
          )}

          {/* Tampilan Jawaban Lengkap yang Sudah Selesai */}
          {activeEntry && !isActiveStreamingLoading && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Jawaban AI: {MODE_META[activeEntry.mode].label}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MODE_META[activeEntry.mode].badgeClass}`}
                  >
                    <ModeIcon mode={activeEntry.mode} className="w-3 h-3" />
                    <span>{MODE_META[activeEntry.mode].label}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveKey(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Tutup jawaban"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {activeEntry.userQuestion && (
                <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                    Pertanyaan yang Ditanyakan:
                  </span>
                  <p className="italic font-medium">"{activeEntry.userQuestion}"</p>
                </div>
              )}

              <FormattedContent content={activeEntry.markdown} className="text-xs" />

              {activeEntry.isTruncated && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <span>Koneksi terputus sebelum jawaban selesai penuh.</span>
                  <button
                    type="button"
                    disabled={isAnyLoadingForThis}
                    onClick={() =>
                      onRequestDeepExplain(item, activeEntry.mode, activeEntry.userQuestion)
                    }
                    className="inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-md bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-100 transition disabled:opacity-60"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Muat Ulang</span>
                  </button>
                </div>
              )}

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
