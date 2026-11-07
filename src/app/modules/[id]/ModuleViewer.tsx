'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Sparkles,
  ArrowLeft,
  HelpCircle,
  Brain,
  Layers,
  CheckCircle2,
  PenTool,
  AlertCircle,
} from 'lucide-react';
import QuotaBadge from '@/components/QuotaBadge';
import ChaptersTab from './tabs/ChaptersTab';
import SummaryTab from './tabs/SummaryTab';
import FlashcardsTab from './tabs/FlashcardsTab';
import QuizTab from './tabs/QuizTab';
import QATab from './tabs/QATab';
import MnemonicTab from './tabs/MnemonicTab';
import EssayTab from './tabs/EssayTab';

interface ModuleViewerProps {
  module: {
    id: string;
    title: string;
    char_count?: number;
    created_at: string;
    status: string;
  };
  chunks: Array<{
    id: string;
    position: number;
    chapter_title: string;
    content: string;
  }>;
  initialFlashcards?: Array<any>;
  initialQuizAttempts?: Array<any>;
}

export default function ModuleViewer({
  module,
  chunks,
  initialFlashcards = [],
  initialQuizAttempts = [],
}: ModuleViewerProps) {
  const [activeTab, setActiveTab] = useState<
    'chapters' | 'summary' | 'flashcards' | 'quiz' | 'qa' | 'mnemonic' | 'essay'
  >('chapters');
  const [selectedChapter, setSelectedChapter] = useState<number | 'all'>('all');
  const [errorMessage, setErrorMessage] = useState('');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header Modul & Breadcrumb */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 mb-3 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Daftar Modul</span>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {module.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                Siap Dipelajari
              </span>
              <span>•</span>
              <span>{chunks.length} Bab / Bagian</span>
              <span>•</span>
              <span>{((module.char_count || 0) / 1000).toFixed(1)}k Karakter</span>
              <span>•</span>
              <span>
                Diunggah {new Date(module.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
              </span>
            </div>
          </div>

          <div className="flex items-center">
            <QuotaBadge />
          </div>
        </div>
      </div>

      {/* Tabs Navigasi Fitur Belajar */}
      <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'chapters'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Materi Bab ({chunks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'summary'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Ringkasan AI</span>
          </button>

          <button
            onClick={() => setActiveTab('flashcards')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'flashcards'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Flashcard</span>
          </button>

          <button
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'quiz'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Latihan Soal</span>
          </button>

          <button
            onClick={() => setActiveTab('qa')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'qa'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Tanya Jawab</span>
          </button>

          <button
            onClick={() => setActiveTab('mnemonic')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'mnemonic'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>Jembatan Keledai</span>
          </button>

          <button
            onClick={() => setActiveTab('essay')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'essay'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Evaluasi Esai</span>
          </button>
        </div>
      </div>

      {/* Pesan Error Global */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <span className="font-semibold block text-slate-900 dark:text-white">Terjadi Kendala:</span>
              <span className="text-slate-700 dark:text-slate-300 mt-0.5 block">{errorMessage}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setErrorMessage('')}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
            >
              Coba Lagi
            </button>
            <button
              onClick={() => setErrorMessage('')}
              className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* TAB COMPONENTS */}
      {activeTab === 'chapters' && (
        <ChaptersTab
          chunks={chunks}
          onSelectForSummary={(pos) => {
            setSelectedChapter(pos);
            setActiveTab('summary');
          }}
        />
      )}

      {activeTab === 'summary' && (
        <SummaryTab
          moduleId={module.id}
          chunks={chunks}
          selectedChapter={selectedChapter}
          onSelectChapter={setSelectedChapter}
          onError={setErrorMessage}
        />
      )}

      {activeTab === 'flashcards' && (
        <FlashcardsTab
          moduleId={module.id}
          initialCards={initialFlashcards}
          onError={setErrorMessage}
        />
      )}

      {activeTab === 'quiz' && (
        <QuizTab
          moduleId={module.id}
          initialAttempts={initialQuizAttempts}
          onError={setErrorMessage}
        />
      )}

      {activeTab === 'qa' && (
        <QATab
          moduleId={module.id}
          chunks={chunks}
          onError={setErrorMessage}
        />
      )}

      {activeTab === 'mnemonic' && (
        <MnemonicTab
          moduleId={module.id}
          chunks={chunks}
          onError={setErrorMessage}
        />
      )}

      {activeTab === 'essay' && (
        <EssayTab
          moduleId={module.id}
          onError={setErrorMessage}
        />
      )}
    </div>
  );
}
