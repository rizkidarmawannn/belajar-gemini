'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Sparkles,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  HelpCircle,
  Brain,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Layers,
  CheckCircle2,
  XCircle,
  RotateCw,
  Award,
  PenTool,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

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
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);

  // State Error & Info
  const [errorMessage, setErrorMessage] = useState('');

  // ==========================================
  // STATE: RINGKASAN
  // ==========================================
  const [summaryStyle, setSummaryStyle] = useState<'singkat' | 'lengkap'>('singkat');
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  // ==========================================
  // STATE: TANYA JAWAB (QA)
  // ==========================================
  const [qaScope, setQaScope] = useState<number | 'all'>('all');
  const [question, setQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [qaCopied, setQaCopied] = useState(false);

  // ==========================================
  // STATE: FLASHCARDS
  // ==========================================
  const [flashcards, setFlashcards] = useState<Array<any>>(initialFlashcards);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [cardCount, setCardCount] = useState<number>(5);
  const [cardLevel, setCardLevel] = useState<'mudah' | 'sedang' | 'sulit'>('sedang');
  const [cardFilter, setCardFilter] = useState<'all' | 'belum' | 'hafal'>('all');

  // ==========================================
  // STATE: KUIS & LATIHAN SOAL
  // ==========================================
  const [quizQuestions, setQuizQuestions] = useState<Array<any>>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isOptionChecked, setIsOptionChecked] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Array<any>>([]);
  const [isQuizFinished, setIsQuizFinished] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizCount, setQuizCount] = useState<number>(5);
  const [quizDifficulty, setQuizDifficulty] = useState<'mudah' | 'sedang' | 'sulit' | 'campuran'>('sedang');
  const [quizAttempts, setQuizAttempts] = useState<Array<any>>(initialQuizAttempts);

  // ==========================================
  // STATE: MNEMONIC (JEMBATAN KELEDAI)
  // ==========================================
  const [mnemonicTopic, setMnemonicTopic] = useState('');
  const [mnemonicResult, setMnemonicResult] = useState('');
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // ==========================================
  // STATE: EVALUASI ESAI
  // ==========================================
  const [essayQuestion, setEssayQuestion] = useState('');
  const [essayAnswer, setEssayAnswer] = useState('');
  const [essayResult, setEssayResult] = useState<any>(null);
  const [isEvaluatingEssay, setIsEvaluatingEssay] = useState(false);

  // ==========================================
  // HANDLERS: RINGKASAN
  // ==========================================
  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    setSummaryText('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'summary',
          chapterPosition: selectedChapter === 'all' ? undefined : selectedChapter,
          stream: true,
          params: {
            style: summaryStyle,
            maxPoints: 8,
          },
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || 'Gagal membuat ringkasan AI.');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json.error) throw new Error(json.error);
        const text =
          json.result?.markdown ||
          json.result?.answer ||
          (typeof json.result === 'string' ? json.result : '');
        setSummaryText(text);
        return;
      }

      if (!response.body) {
        throw new Error('Streaming tidak didukung oleh browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setSummaryText(accumulated);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat memanggil Gemini AI.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = async () => {
    if (!summaryText) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      // Abaikan bila clipboard diblokir
    }
  };

  // ==========================================
  // HANDLERS: TANYA JAWAB
  // ==========================================
  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsAsking(true);
    setQaAnswer('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'qa',
          chapterPosition: qaScope === 'all' ? undefined : qaScope,
          stream: true,
          params: {
            question: question.trim(),
          },
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || 'Gagal memproses pertanyaan.');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json.error) throw new Error(json.error);
        const text = json.result?.answer || (typeof json.result === 'string' ? json.result : '');
        setQaAnswer(text);
        return;
      }

      if (!response.body) {
        throw new Error('Streaming tidak didukung.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setQaAnswer(accumulated);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memproses tanya jawab.');
    } finally {
      setIsAsking(false);
    }
  };

  const handleCopyQa = async () => {
    if (!qaAnswer) return;
    try {
      await navigator.clipboard.writeText(qaAnswer);
      setQaCopied(true);
      setTimeout(() => setQaCopied(false), 2000);
    } catch {
      // Abaikan bila clipboard diblokir
    }
  };

  // ==========================================
  // HANDLERS: FLASHCARDS
  // ==========================================
  const handleGenerateFlashcards = async () => {
    setIsGeneratingCards(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'flashcards',
          params: {
            count: cardCount,
            difficulty: cardLevel,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Gagal membuat kartu flashcard AI.');
      }

      const json = await response.json();
      const generatedCards = json.result?.kartu || [];

      if (generatedCards.length === 0) {
        throw new Error('AI tidak menghasilkan kartu yang valid dari modul.');
      }

      // Simpan ke database Supabase via API route
      const saveRes = await fetch(`/api/modules/${module.id}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: generatedCards }),
      });

      if (saveRes.ok) {
        const saveJson = await saveRes.json();
        setFlashcards((prev) => [...(saveJson.cards || []), ...prev]);
      } else {
        // Fallback jika database save gagal, simpan di state lokal
        const formatted = generatedCards.map((c: any, idx: number) => ({
          id: `local-${Date.now()}-${idx}`,
          ...c,
          box: 0,
        }));
        setFlashcards((prev) => [...formatted, ...prev]);
      }

      setCurrentCardIndex(0);
      setIsFlipped(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghasilkan flashcard.');
    } finally {
      setIsGeneratingCards(false);
    }
  };

  const handleReviewCard = async (result: 'hafal' | 'belum') => {
    const card = filteredFlashcards[currentCardIndex];
    if (!card) return;

    // Optimistic update status lokal
    const updatedCards = flashcards.map((c) => {
      if (c.id === card.id) {
        const nextBox = result === 'hafal' ? Math.min((c.box || 0) + 1, 4) : 1;
        return { ...c, box: nextBox, last_result: result };
      }
      return c;
    });
    setFlashcards(updatedCards);

    // Kirim update ke server jika kartu tersimpan di database
    if (card.id && !String(card.id).startsWith('local-')) {
      try {
        await fetch(`/api/modules/${module.id}/flashcards`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card.id, result }),
        });
      } catch (err) {
        console.error('Gagal memperbarui status review kartu:', err);
      }
    }

    // Geser ke kartu berikutnya
    setIsFlipped(false);
    if (currentCardIndex < filteredFlashcards.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      setCurrentCardIndex(0);
    }
  };

  const filteredFlashcards = flashcards.filter((c) => {
    if (cardFilter === 'hafal') return c.last_result === 'hafal' || (c.box && c.box > 0);
    if (cardFilter === 'belum') return c.last_result === 'belum' || !c.box || c.box === 0;
    return true;
  });

  const masteredCount = flashcards.filter(
    (c) => c.last_result === 'hafal' || (c.box && c.box > 1)
  ).length;
  const progressPercent =
    flashcards.length > 0 ? Math.round((masteredCount / flashcards.length) * 100) : 0;

  // ==========================================
  // HANDLERS: KUIS
  // ==========================================
  const handleGenerateQuiz = async () => {
    setIsGeneratingQuiz(true);
    setErrorMessage('');
    setIsQuizFinished(false);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setIsOptionChecked(false);
    setQuizScore(0);
    setQuizAnswers([]);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'quiz',
          params: {
            count: quizCount,
            difficulty: quizDifficulty,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Gagal membuat kuis AI.');
      }

      const json = await response.json();
      const questions = json.result?.soal || [];
      if (questions.length === 0) {
        throw new Error('AI tidak berhasil menyusun soal kuis yang valid.');
      }

      setQuizQuestions(questions);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal membuat soal latihan.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSelectOption = (optKey: string) => {
    if (isOptionChecked) return;
    setSelectedOption(optKey);
    setIsOptionChecked(true);

    const currentQ = quizQuestions[currentQIndex];
    const isCorrect = optKey.toUpperCase() === currentQ.kunci.toUpperCase();

    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
    }

    setQuizAnswers((prev) => [
      ...prev,
      {
        nomor: currentQ.nomor || currentQIndex + 1,
        pertanyaan: currentQ.pertanyaan,
        userAnswer: optKey,
        kunci: currentQ.kunci,
        isCorrect,
        penjelasan: currentQ.penjelasan,
      },
    ]);
  };

  const handleNextQuestion = async () => {
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsOptionChecked(false);
    } else {
      // Kuis selesai
      setIsQuizFinished(true);
      const finalScore = Math.round((quizScore / quizQuestions.length) * 100);

      // Simpan hasil kuis ke database Supabase
      try {
        const attemptRes = await fetch(`/api/modules/${module.id}/quiz-attempts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: finalScore,
            total: quizQuestions.length,
            answers: quizAnswers,
          }),
        });

        if (attemptRes.ok) {
          const attemptData = await attemptRes.json();
          if (attemptData.attempt) {
            setQuizAttempts((prev) => [attemptData.attempt, ...prev]);
          }
        }
      } catch (err) {
        console.error('Gagal mencatat hasil kuis:', err);
      }
    }
  };

  const handleRetryWrongQuestions = () => {
    const wrongQs = quizQuestions.filter((q) => {
      const recorded = quizAnswers.find((a) => a.nomor === (q.nomor || 1));
      return recorded && !recorded.isCorrect;
    });

    if (wrongQs.length > 0) {
      setQuizQuestions(wrongQs);
      setCurrentQIndex(0);
      setSelectedOption(null);
      setIsOptionChecked(false);
      setQuizScore(0);
      setQuizAnswers([]);
      setIsQuizFinished(false);
    }
  };

  // ==========================================
  // HANDLERS: MNEMONIC
  // ==========================================
  const handleGenerateMnemonic = async (topicToUse?: string) => {
    const topic = (topicToUse || mnemonicTopic).trim();
    if (!topic) return;

    setIsGeneratingMnemonic(true);
    setMnemonicResult('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'mnemonic',
          params: {
            topic,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Gagal menghasilkan bantuan hafalan.');
      }

      const json = await response.json();
      setMnemonicResult(json.result?.markdown || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal membuat jembatan keledai.');
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  // ==========================================
  // HANDLERS: EVALUASI ESAI
  // ==========================================
  const handleEvaluateEssay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayQuestion.trim() || !essayAnswer.trim()) return;

    setIsEvaluatingEssay(true);
    setEssayResult(null);
    setErrorMessage('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: module.id,
          feature: 'essay_eval',
          params: {
            question: essayQuestion.trim(),
            userAnswer: essayAnswer.trim(),
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Gagal mengevaluasi jawaban esai.');
      }

      const json = await response.json();
      setEssayResult(json.result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat menilai esai.');
    } finally {
      setIsEvaluatingEssay(false);
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
            <span>Flashcard ({flashcards.length})</span>
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
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Terjadi Kendala:</span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage('')} className="text-xs font-bold text-rose-600 hover:underline">
            Tutup
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: MATERI BAB (DAFTAR ELEMEN DOKUMEN)                */}
      {/* ========================================================= */}
      {activeTab === 'chapters' && (
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
                          onClick={() => {
                            setSelectedChapter(chunk.position);
                            setActiveTab('summary');
                          }}
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
      )}

      {/* ========================================================= */}
      {/* TAB 2: RINGKASAN AI                                       */}
      {/* ========================================================= */}
      {activeTab === 'summary' && (
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
                  onChange={(e) => setSelectedChapter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
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
                {isSummarizing && !summaryText && (
                  <div className="flex items-center gap-3 py-6 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span>Gemini AI sedang membaca bab dan merumuskan poin-poin inti...</span>
                  </div>
                )}
                {summaryText && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      h3: ({ node, ...props }) => (
                        <div className="pt-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                          <h3 className="text-base font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2" {...props} />
                        </div>
                      ),
                      p: ({ node, children, ...props }) => {
                        const textContent = String(children);
                        if (textContent.includes('*Contoh:*') || textContent.includes('Contoh:')) {
                          return (
                            <div className="p-3 my-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-sm leading-relaxed">
                              <p {...props}>{children}</p>
                            </div>
                          );
                        }
                        return <p className="my-2 text-sm leading-relaxed" {...props}>{children}</p>;
                      },
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-5 my-2 space-y-1.5 text-sm" {...props} />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong className="font-semibold text-slate-900 dark:text-white" {...props} />
                      ),
                      hr: ({ node, ...props }) => (
                        <hr className="my-6 border-slate-200 dark:border-slate-800" {...props} />
                      ),
                    }}
                  >
                    {summaryText}
                  </ReactMarkdown>
                )}
                {isSummarizing && summaryText && (
                  <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: FLASHCARDS (KARTU BELAJAR & HAFALAN LEITNER)      */}
      {/* ========================================================= */}
      {activeTab === 'flashcards' && (
        <div className="space-y-6">
          {/* Header Panel Flashcards */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  <span>Kartu Belajar & Pengulangan Berjarak (Leitner)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hafalkan konsep dan istilah penting. Kartu yang Anda tandai <em>"Hafal"</em> dijadwalkan lebih lama (1, 3, 7, 14 hari), sedangkan yang <em>"Belum"</em> akan diulang lebih sering.
                </p>
              </div>

              {/* Progres Penguasaan */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 min-w-[180px]">
                <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                  <span className="text-slate-600 dark:text-slate-300">Penguasaan</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {masteredCount} dari {flashcards.length} kartu dikuasai
                </span>
              </div>
            </div>

            {/* Kontrol Generator Kartu Baru */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Buat Baru:</span>
                <select
                  value={cardCount}
                  onChange={(e) => setCardCount(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value={5}>5 Kartu</option>
                  <option value={10}>10 Kartu</option>
                  <option value={15}>15 Kartu</option>
                </select>

                <select
                  value={cardLevel}
                  onChange={(e) => setCardLevel(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>

                <button
                  onClick={handleGenerateFlashcards}
                  disabled={isGeneratingCards}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isGeneratingCards ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyusun Kartu...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Buat dengan AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Filter Kartu */}
              {flashcards.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                  <button
                    onClick={() => {
                      setCardFilter('all');
                      setCurrentCardIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      cardFilter === 'all'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Semua ({flashcards.length})
                  </button>
                  <button
                    onClick={() => {
                      setCardFilter('belum');
                      setCurrentCardIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      cardFilter === 'belum'
                        ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Belum Hafal
                  </button>
                  <button
                    onClick={() => {
                      setCardFilter('hafal');
                      setCurrentCardIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      cardFilter === 'hafal'
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Hafal
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Area Tampilan Kartu 3D Flip */}
          {filteredFlashcards.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2">
                <span>
                  Kartu <strong>{currentCardIndex + 1}</strong> dari {filteredFlashcards.length}
                </span>
                <span className="flex items-center gap-2">
                  <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">
                    Tingkat: {filteredFlashcards[currentCardIndex]?.level || 'sedang'}
                  </span>
                  {filteredFlashcards[currentCardIndex]?.box ? (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
                      Kotak Leitner: {filteredFlashcards[currentCardIndex].box}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Kartu Flip Interaktif */}
              <div
                onClick={() => setIsFlipped((prev) => !prev)}
                className="relative min-h-[260px] md:min-h-[300px] cursor-pointer rounded-3xl p-8 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-850 border-2 border-slate-200 dark:border-slate-750 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col justify-between items-center text-center select-none"
              >
                <div className="w-full flex justify-between items-center text-xs text-slate-400">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    {filteredFlashcards[currentCardIndex]?.chapter || 'Materi Modul'}
                  </span>
                  <span className="flex items-center gap-1">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Klik kartu untuk membalik</span>
                  </span>
                </div>

                <div className="my-auto py-6 max-w-lg">
                  {!isFlipped ? (
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                        Pertanyaan / Istilah
                      </span>
                      <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                        {filteredFlashcards[currentCardIndex]?.front}
                      </h3>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest block mb-2">
                        Jawaban / Penjelasan Inti
                      </span>
                      <p className="text-base md:text-lg text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
                        {filteredFlashcards[currentCardIndex]?.back}
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isFlipped ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                  <span>Sisi {isFlipped ? 'Belakang (Jawaban)' : 'Depan (Pertanyaan)'}</span>
                </div>
              </div>

              {/* Tombol Aksi Penilaian & Navigasi */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((prev) => (prev > 0 ? prev - 1 : filteredFlashcards.length - 1));
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewCard('belum')}
                    className="px-5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 font-semibold text-xs shadow-xs transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Belum Hafal</span>
                  </button>

                  <button
                    onClick={() => handleReviewCard('hafal')}
                    className="px-5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 font-semibold text-xs shadow-xs transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Sudah Hafal</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((prev) => (prev < filteredFlashcards.length - 1 ? prev + 1 : 0));
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition flex items-center gap-1.5"
                >
                  <span>Selanjutnya</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 px-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto">
                <Layers className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Belum Ada Kartu Flashcard
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  AI dapat mengekstrak konsep kunci, istilah penting, dan definisi menjadi kartu belajar siap hafal.
                </p>
              </div>
              <button
                onClick={handleGenerateFlashcards}
                disabled={isGeneratingCards}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-md transition disabled:opacity-50"
              >
                {isGeneratingCards ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyusun Kartu...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Buat 5 Kartu Flashcard Sekarang</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: LATIHAN SOAL & KUIS PILIHAN GANDA                  */}
      {/* ========================================================= */}
      {activeTab === 'quiz' && (
        <div className="space-y-6">
          {/* Header Panel Kuis */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                  <span>Kuis & Latihan Soal Interaktif</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Uji pemahaman Anda dengan soal pilihan ganda 4 opsi. Dapatkan umpan balik instan beserta pembahasan materi dari modul.
                </p>
              </div>

              {quizAttempts.length > 0 && !quizQuestions.length && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Latihan Terakhir</span>
                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                    Skor: {quizAttempts[0]?.score || 0} / 100
                  </span>
                </div>
              )}
            </div>

            {/* Form Buat Kuis Baru (Bila sedang tidak menjalankan kuis) */}
            {quizQuestions.length === 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jumlah Soal
                  </label>
                  <select
                    value={quizCount}
                    onChange={(e) => setQuizCount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none"
                  >
                    <option value={5}>5 Soal Latihan</option>
                    <option value={10}>10 Soal Latihan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tingkat Kesulitan
                  </label>
                  <select
                    value={quizDifficulty}
                    onChange={(e) => setQuizDifficulty(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none"
                  >
                    <option value="sedang">Sedang (Pemahaman)</option>
                    <option value="mudah">Mudah (Definisi)</option>
                    <option value="sulit">Sulit (Analisis & Kasus)</option>
                    <option value="campuran">Campuran</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleGenerateQuiz}
                    disabled={isGeneratingQuiz}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isGeneratingQuiz ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyusun Kuis...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Mulai Kuis Baru</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sesi Kuis Berjalan (1 Soal Per Layar) */}
          {quizQuestions.length > 0 && !isQuizFinished && (
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Header Status Soal */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    Soal {currentQIndex + 1} dari {quizQuestions.length}
                  </span>
                  <span className="text-xs text-slate-400 capitalize">
                    Bab: {quizQuestions[currentQIndex]?.bab || 'Umum'}
                  </span>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                  {quizQuestions[currentQIndex]?.tingkat || 'sedang'}
                </span>
              </div>

              {/* Teks Pertanyaan */}
              <div>
                <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                  {quizQuestions[currentQIndex]?.pertanyaan}
                </h3>
              </div>

              {/* 4 Opsi Jawaban */}
              <div className="space-y-3">
                {Object.entries(quizQuestions[currentQIndex]?.opsi || {}).map(([key, value]) => {
                  const isSelected = selectedOption === key;
                  const isCorrect = key.toUpperCase() === quizQuestions[currentQIndex]?.kunci.toUpperCase();

                  let btnStyle =
                    'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200';

                  if (isOptionChecked) {
                    if (isCorrect) {
                      btnStyle =
                        'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30';
                    } else if (isSelected && !isCorrect) {
                      btnStyle =
                        'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 ring-2 ring-rose-500/30';
                    } else {
                      btnStyle = 'opacity-60 border-slate-200 dark:border-slate-800 text-slate-500';
                    }
                  }

                  return (
                    <button
                      key={key}
                      disabled={isOptionChecked}
                      onClick={() => handleSelectOption(key)}
                      className={`w-full p-4 rounded-2xl border text-left font-medium text-sm transition-all duration-200 flex items-start gap-3.5 ${btnStyle}`}
                    >
                      <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs flex-shrink-0 text-slate-700 dark:text-slate-300">
                        {key}
                      </span>
                      <span className="leading-relaxed flex-1">{String(value)}</span>
                      {isOptionChecked && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      )}
                      {isOptionChecked && isSelected && !isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Umpan Balik & Pembahasan (Setelah Menjawab) */}
              {isOptionChecked && (
                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/40 space-y-2">
                  <div className="flex items-center gap-2">
                    {selectedOption?.toUpperCase() === quizQuestions[currentQIndex]?.kunci.toUpperCase() ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Jawaban Anda Tepat!
                      </span>
                    ) : (
                      <span className="text-rose-700 dark:text-rose-400 font-bold text-xs flex items-center gap-1">
                        <XCircle className="w-4 h-4" /> Jawaban Anda Kurang Tepat (Kunci: {quizQuestions[currentQIndex]?.kunci})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong>Pembahasan:</strong> {quizQuestions[currentQIndex]?.penjelasan}
                  </p>
                </div>
              )}

              {/* Tombol Lanjut ke Soal Berikutnya */}
              {isOptionChecked && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleNextQuestion}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition flex items-center gap-2"
                  >
                    <span>
                      {currentQIndex < quizQuestions.length - 1 ? 'Lanjut ke Soal Berikutnya' : 'Selesai & Lihat Skor'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Layar Hasil Kuis */}
          {isQuizFinished && (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-center">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <Award className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Kuis Selesai!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hasil latihan Anda telah dicatat ke riwayat belajar.
                </p>
              </div>

              {/* Skor Banner */}
              <div className="inline-block px-8 py-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-900/40">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Skor Anda
                </span>
                <span className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {Math.round((quizScore / quizQuestions.length) * 100)}
                </span>
                <span className="text-xs text-slate-500 block mt-1">
                  {quizScore} dari {quizQuestions.length} Soal Benar
                </span>
              </div>

              {/* Tombol Aksi Kuis */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {quizScore < quizQuestions.length && (
                  <button
                    onClick={handleRetryWrongQuestions}
                    className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Ulangi Soal yang Salah</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setQuizQuestions([]);
                    setIsQuizFinished(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Buat Kuis Baru</span>
                </button>
              </div>

              {/* Daftar Rincian Jawaban */}
              <div className="text-left pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Rincian Jawaban Kuis:
                </h4>
                {quizAnswers.map((a, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border text-xs leading-relaxed ${
                      a.isCorrect
                        ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold mb-1">
                      <span className="text-slate-800 dark:text-slate-200">Soal {a.nomor}: {a.pertanyaan}</span>
                      <span className={a.isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
                        {a.isCorrect ? 'Benar (+1)' : `Salah (Kunci: ${a.kunci})`}
                      </span>
                    </div>
                    {a.penjelasan && (
                      <p className="text-slate-600 dark:text-slate-400 mt-1">
                        <em>Pembahasan:</em> {a.penjelasan}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Riwayat Skor Latihan Modul */}
          {quizAttempts.length > 0 && quizQuestions.length === 0 && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>Riwayat Latihan Kuis Modul Ini</span>
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {quizAttempts.map((att) => (
                  <div key={att.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Skor: {att.score} / 100
                      </span>
                      <span className="text-slate-400 ml-2">({att.total} Soal)</span>
                    </div>
                    <span className="text-slate-400">
                      {new Date(att.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: TANYA JAWAB (QA INTERAKTIF)                        */}
      {/* ========================================================= */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              <span>Tanya Jawab tentang Isi Modul</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tanyakan apa saja seputar topik, pengertian, contoh penerapan, atau rincian modul ini. AI akan merespons sebagai tutor cerdas berdasar isi dokumen.
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
                  placeholder="Contoh: apa contoh smk3, apa 5 prinsip dasarnya, atau siapa penulis karya tulis ini?"
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

              <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed space-y-3">
                {isAsking && !qaAnswer && (
                  <div className="flex items-center gap-3 py-4 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span>Gemini AI sedang membaca isi modul dan merumuskan jawaban mendalam...</span>
                  </div>
                )}
                {qaAnswer && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      h3: ({ node, ...props }) => (
                        <h3 className="text-base font-bold text-indigo-700 dark:text-indigo-400 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800" {...props} />
                      ),
                      h4: ({ node, ...props }) => (
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white pt-2" {...props} />
                      ),
                      p: ({ node, children, ...props }) => {
                        const textContent = String(children);
                        if (textContent.includes('*Contoh:*') || textContent.includes('Contoh:')) {
                          return (
                            <div className="p-3 my-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-sm leading-relaxed">
                              <p {...props}>{children}</p>
                            </div>
                          );
                        }
                        return <p className="my-2 leading-relaxed" {...props}>{children}</p>;
                      },
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-5 my-2 space-y-1 text-sm" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-5 my-2 space-y-1 text-sm" {...props} />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong className="font-semibold text-slate-900 dark:text-white" {...props} />
                      ),
                      hr: ({ node, ...props }) => (
                        <hr className="my-4 border-slate-200 dark:border-slate-800" {...props} />
                      ),
                    }}
                  >
                    {qaAnswer}
                  </ReactMarkdown>
                )}
                {isAsking && qaAnswer && (
                  <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 6: JEMBATAN KELEDAI & MNEMONIC                        */}
      {/* ========================================================= */}
      {activeTab === 'mnemonic' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-600" />
              <span>Pembuat Jembatan Keledai, Akronim & Analogi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ubah daftar konsep, urutan tahapan, atau istilah rumit menjadi singkatan lucu dan analogi sehari-hari agar mudah melekat di ingatan jangka panjang.
            </p>

            {/* Rekomendasi Topik Cepat */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Pilih Cepat Topik dari Dokumen:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  'Hierarki Pengendalian Risiko (Eliminasi, Substitusi, Teknik, Admin, APD)',
                  '5 Prinsip Dasar Penerapan SMK3',
                  '12 Elemen Pedoman Penerapan SMK3',
                  'Tingkatan Kriteria Audit SMK3 (64, 122, 166 kriteria)',
                  'Teori Domino Kecelakaan Kerja Heinrich',
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMnemonicTopic(sug);
                      handleGenerateMnemonic(sug);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-xs font-medium transition text-left"
                  >
                    💡 {sug}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Atau Ketik Topik / Daftar yang Ingin Dihafal:
                </label>
                <input
                  type="text"
                  value={mnemonicTopic}
                  onChange={(e) => setMnemonicTopic(e.target.value)}
                  placeholder="Contoh: 5 tahap penerapan SMK3 atau faktor penyebab kecelakaan kerja"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <button
                onClick={() => handleGenerateMnemonic()}
                disabled={isGeneratingMnemonic || !mnemonicTopic.trim()}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGeneratingMnemonic ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mencari Daftar & Merancang Jembatan Keledai...</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    <span>Buat Bantuan Hafalan AI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {(mnemonicResult || isGeneratingMnemonic) && (
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Brain className="w-4 h-4" />
                  Alat Bantu Hafalan AI
                </span>
                {mnemonicResult && (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(mnemonicResult);
                      setMnemonicCopied(true);
                      setTimeout(() => setMnemonicCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
                  >
                    {mnemonicCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Mnemonic</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed space-y-3">
                {isGeneratingMnemonic && (
                  <div className="flex items-center gap-3 py-6 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span>Gemini AI sedang menyusun akronim dan analogi kreatif...</span>
                  </div>
                )}
                {mnemonicResult && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {mnemonicResult}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 7: EVALUASI ESAI                                      */}
      {/* ========================================================= */}
      {activeTab === 'essay' && (
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
                      {essayResult.rincian?.ketepatan || 0} / 50
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px]">Kelengkapan</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {essayResult.rincian?.kelengkapan || 0} / 30
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400 block text-[10px]">Kejelasan</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {essayResult.rincian?.kejelasan || 0} / 20
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
      )}
    </div>
  );
}
