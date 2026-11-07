'use client';

import { useState } from 'react';
import { ListOrdered, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

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
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-indigo-600" />
          <span>Daftar Bab & Potongan Materi</span>
        </h2>
        <span className="text-xs text-slate-400">Klik bab untuk membaca isinya</span>
      </div>

      <div className="space-y-3">
        {chunks.map((chunk) => {
          const isExpanded = expandedChapter === chunk.position;
          return (
            <div
              key={chunk.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition"
            >
              <button
                onClick={() => setExpandedChapter(isExpanded ? null : chunk.position)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {chunk.position}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-white text-sm">
                    {chunk.chapter_title}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {isExpanded && (
                <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30">
                  <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                    {chunk.content}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex justify-end">
                    <button
                      onClick={() => onSelectForSummary(chunk.position)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 transition"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ringkas Bab Ini</span>
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
