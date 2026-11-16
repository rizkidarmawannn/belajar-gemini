'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  AlertTriangle,
  Trash2,
  Loader2,
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

type TabType = 'chapters' | 'summary' | 'flashcards' | 'quiz' | 'qa' | 'mnemonic' | 'essay';

export default function ModuleViewer({
  module,
  chunks,
  initialFlashcards = [],
  initialQuizAttempts = [],
}: ModuleViewerProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('chapters');
  const [selectedChapter, setSelectedChapter] = useState<number | 'all'>('all');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Status integritas pengerjaan kuis & konfirmasi membuka modul di tengah kuis
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [openedModuleDuringQuiz, setOpenedModuleDuringQuiz] = useState(false);
  const [showQuizWarningModal, setShowQuizWarningModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabType | null>(null);

  const handleTabChange = (targetTab: TabType) => {
    if (activeTab === targetTab) return;
    // Jika sedang dalam sesi kuis aktif dan ingin berpindah membuka modul/tab lain
    if (activeTab === 'quiz' && isQuizActive && targetTab !== 'quiz') {
      setPendingTab(targetTab);
      setShowQuizWarningModal(true);
      return;
    }
    setActiveTab(targetTab);
  };

  const handleConfirmLeaveQuiz = () => {
    setOpenedModuleDuringQuiz(true);
    if (pendingTab) {
      setActiveTab(pendingTab);
    }
    setShowQuizWarningModal(false);
    setPendingTab(null);
  };

  const handleCancelLeaveQuiz = () => {
    setShowQuizWarningModal(false);
    setPendingTab(null);
  };

  const handleError = (msg: string, retryFn?: () => void) => {
    setErrorMessage(msg);
    setRetryAction(msg && retryFn ? () => retryFn : null);
  };

  const clearError = () => {
    setErrorMessage('');
    setRetryAction(null);
  };

  const handleRetryError = () => {
    const fn = retryAction;
    clearError();
    if (fn) {
      fn();
    }
  };

  const handleDeleteModule = async () => {
    setIsDeleting(true);
    clearError();
    try {
      const res = await fetch(`/api/modules/${module.id}`, {
        method: 'DELETE',
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(json?.error || `Gagal menghapus modul (Status HTTP ${res.status}).`);
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      handleError(err.message || 'Terjadi kesalahan saat menghapus modul.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

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

          <div className="flex items-center gap-3">
            <QuotaBadge />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              title="Hapus Modul Ini"
              className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-medium transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>Hapus Modul</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigasi Fitur Belajar */}
      <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          <button
            onClick={() => handleTabChange('chapters')}
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
            onClick={() => handleTabChange('summary')}
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
            onClick={() => handleTabChange('flashcards')}
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
            onClick={() => handleTabChange('quiz')}
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
            onClick={() => handleTabChange('qa')}
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
            onClick={() => handleTabChange('mnemonic')}
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
            onClick={() => handleTabChange('essay')}
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
            {retryAction && (
              <button
                onClick={handleRetryError}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
              >
                Coba Lagi
              </button>
            )}
            <button
              onClick={clearError}
              className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* TAB COMPONENTS (Dikelola tetap mounted agar progres kuis, form ringkasan, dan flashcard tidak tereset) */}
      <div className={activeTab === 'chapters' ? 'block' : 'hidden'}>
        <ChaptersTab
          chunks={chunks}
          onSelectForSummary={(pos) => {
            setSelectedChapter(pos);
            handleTabChange('summary');
          }}
        />
      </div>

      <div className={activeTab === 'summary' ? 'block' : 'hidden'}>
        <SummaryTab
          moduleId={module.id}
          chunks={chunks}
          selectedChapter={selectedChapter}
          onSelectChapter={setSelectedChapter}
          onError={handleError}
        />
      </div>

      <div className={activeTab === 'flashcards' ? 'block' : 'hidden'}>
        <FlashcardsTab
          moduleId={module.id}
          initialCards={initialFlashcards}
          onError={handleError}
        />
      </div>

      <div className={activeTab === 'quiz' ? 'block' : 'hidden'}>
        <QuizTab
          moduleId={module.id}
          initialAttempts={initialQuizAttempts}
          onError={handleError}
          isOpenedModuleDuringQuiz={openedModuleDuringQuiz}
          onResetOpenedModuleDuringQuiz={() => setOpenedModuleDuringQuiz(false)}
          onQuizActiveChange={setIsQuizActive}
        />
      </div>

      <div className={activeTab === 'qa' ? 'block' : 'hidden'}>
        <QATab
          moduleId={module.id}
          chunks={chunks}
          onError={handleError}
        />
      </div>

      <div className={activeTab === 'mnemonic' ? 'block' : 'hidden'}>
        <MnemonicTab
          moduleId={module.id}
          chunks={chunks}
          onError={handleError}
        />
      </div>

      <div className={activeTab === 'essay' ? 'block' : 'hidden'}>
        <EssayTab
          moduleId={module.id}
          onError={handleError}
        />
      </div>

      {/* Modal Konfirmasi Hapus Modul */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Hapus Modul Belajar Ini?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Modul <strong className="text-slate-800 dark:text-slate-200">&quot;{module.title}&quot;</strong> beserta seluruh rangkuman, flashcard, dan riwayat kuis akan dihapus permanen.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteModule}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <span>Ya, Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Peringatan Membuka Modul Saat Kuis Berlangsung */}
      {showQuizWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-amber-200 dark:border-amber-900/60 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Peringatan: Kuis Sedang Berlangsung!
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Anda saat ini sedang mengerjakan sesi latihan kuis.
              </p>
              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-left text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <span className="font-semibold block">⚠️ Konsekuensi:</span>
                <p className="text-[11px] leading-relaxed">
                  Jika Anda membuka materi modul sekarang, hasil kuis Anda di akhir akan ditandai: <strong>&quot;Melihat Modul Saat Mengerjakan&quot;</strong> (Open Book / bukan murni pikir sendiri).
                </p>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tenang, progres dan jawaban kuis Anda <strong>tidak akan tereset</strong> saat Anda kembali ke kuis nanti.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelLeaveQuiz}
                className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Tetap di Kuis
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveQuiz}
                className="w-full sm:w-1/2 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-md transition"
              >
                Lanjutkan Buka Modul
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
