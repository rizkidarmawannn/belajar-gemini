'use client';

import { useState } from 'react';
import {
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  Check,
  AlignLeft,
  LayoutList,
} from 'lucide-react';
import FormattedContent, { ContentLegend } from '@/components/FormattedContent';
import { formatStructuredModuleText } from '@/lib/parsers/text-formatter';

interface Chunk {
  id: string;
  position: number;
  chapter_title: string;
  content: string;
}

interface ChaptersTabProps {
  chunks: Chunk[];
  onSelectForSummary: (chapterPosition: number) => void;
}

export default function ChaptersTab({ chunks, onSelectForSummary }: ChaptersTabProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(
    () => new Set(chunks.length > 0 ? [chunks[0].position] : [])
  );
  const [rawModeChapters, setRawModeChapters] = useState<Set<number>>(() => new Set());
  const [copiedChapter, setCopiedChapter] = useState<number | null>(null);

  const toggleChapter = (pos: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const toggleRawMode = (pos: number) => {
    setRawModeChapters((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const allExpanded = chunks.length > 0 && chunks.every((c) => expandedChapters.has(c.position));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedChapters(new Set());
    } else {
      setExpandedChapters(new Set(chunks.map((c) => c.position)));
    }
  };

  const handleCopyChapter = async (chunk: Chunk) => {
    const isRaw = rawModeChapters.has(chunk.position);
    const textToCopy = isRaw ? chunk.content : formatStructuredModuleText(chunk.content);
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedChapter(chunk.position);
      setTimeout(() => setCopiedChapter((curr) => (curr === chunk.position ? null : curr)), 2000);
    } catch {
      // Abaikan bila clipboard diblokir browser
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-indigo-600" />
            <span>Daftar Bab &amp; Materi Terstruktur</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tata letak otomatis membedakan penjelasan, daftar aturan/poin, contoh penerapan, dan catatan penting.
          </p>
        </div>

        {chunks.length > 1 && (
          <button
            type="button"
            onClick={toggleExpandAll}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 transition"
          >
            {allExpanded ? 'Tutup Semua Bab' : 'Buka Semua Bab'}
          </button>
        )}
      </div>

      <ContentLegend />

      <div className="space-y-3">
        {chunks.map((chunk) => {
          const isExpanded = expandedChapters.has(chunk.position);
          const isRawMode = rawModeChapters.has(chunk.position);
          const isCopied = copiedChapter === chunk.position;

          return (
            <div
              key={chunk.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition"
            >
              <button
                type="button"
                onClick={() => toggleChapter(chunk.position)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {chunk.position}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    {chunk.chapter_title}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="px-5 sm:px-6 py-5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/35 space-y-4">
                  {/* Toolbar Bab: Mode Tampilan & Salin */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800/80">
                    <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          if (isRawMode) toggleRawMode(chunk.position);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition ${
                          !isRawMode
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <LayoutList className="w-3.5 h-3.5" />
                        <span>Tata Letak Rapi</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isRawMode) toggleRawMode(chunk.position);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition ${
                          isRawMode
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                        <span>Teks Asli</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyChapter(chunk)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Bab</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Konten Bab */}
                  {isRawMode ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      {chunk.content}
                    </div>
                  ) : (
                    <FormattedContent content={chunk.content} autoStructure />
                  )}

                  <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onSelectForSummary(chunk.position)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ringkas Bab Ini dengan AI</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
