'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  Sparkles,
  Layers,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  HelpCircle,
  Brain,
  Lightbulb,
  ListOrdered,
  ChevronDown,
  ChevronUp,
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
}

export default function ModuleViewer({ module, chunks }: ModuleViewerProps) {
  const [activeTab, setActiveTab] = useState<'chapters' | 'summary' | 'flashcards' | 'quiz' | 'qa' | 'mnemonic'>('chapters');
  const [selectedChapter, setSelectedChapter] = useState<number | 'all'>(1);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(1);

  // State Ringkasan
  const [summaryStyle, setSummaryStyle] = useState<'singkat' | 'lengkap'>('singkat');
  const [summaryText, setSummaryText] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  // State Tanya Jawab (QA)
  const [question, setQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  // State Error
  const [errorMessage, setErrorMessage] = useState('');

  // Handler Ringkasan Streaming via /api/generate
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
          feature: summaryStyle === 'singkat' ? 'summary_short' : 'summary',
          chapterPosition: selectedChapter === 'all' ? undefined : selectedChapter,
          stream: true,
          params: {
            style: summaryStyle,
            maxPoints: summaryStyle === 'singkat' ? 5 : 8,
          },
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json();
        throw new Error(errorJson.error || 'Gagal membuat ringkasan AI.');
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

  // Handler Tanya Jawab Streaming via /api/generate
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
          chapterPosition: selectedChapter === 'all' ? undefined : selectedChapter,
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSummaryCopied(true);
    setTimeout(() => setSummaryCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header Modul */}
      <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Modul</span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {module.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium">
                Siap Dipelajari
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>{chunks.length} Bab / Bagian</span>
              </span>
              {module.char_count && (
                <span>• {(module.char_count / 1000).toFixed(1)}k Karakter</span>
              )}
              <span>• Diunggah {new Date(module.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigasi Fitur */}
        <div className="flex overflow-x-auto gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 no-scrollbar">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'summary'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Ringkasan AI</span>
          </button>

          <button
            onClick={() => setActiveTab('qa')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition whitespace-nowrap ${
              activeTab === 'qa'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Tanya Jawab</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: DAFTAR BAB */}
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
                      <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                        {chunk.position}
                      </span>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                        {chunk.chapter_title}
                      </h3>
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

      {/* TAB 2: RINGKASAN AI */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <span>Generator Ringkasan Cerdas</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI akan menyusun inti materi, poin-poin penting, istilah tebal, dan bagian <strong>Wajib Diingat</strong> secara otomatis.
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
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Singkat (Inti Saja)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSummaryStyle('lengkap')}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border transition ${
                      summaryStyle === 'lengkap'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
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
                  <span>Sedang Menganalisis & Merangkum Materi...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Mulai Ringkas Sekarang</span>
                </>
              )}
            </button>
          </div>

          {/* Hasil Ringkasan */}
          {(summaryText || isSummarizing) && (
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Hasil Ringkasan Gemini AI
                </span>
                <button
                  onClick={() => copyToClipboard(summaryText)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {summaryCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Ringkasan</span>
                    </>
                  )}
                </button>
              </div>

              <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {summaryText}
                </ReactMarkdown>
                {isSummarizing && (
                  <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TANYA JAWAB */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              <span>Tanya Jawab tentang Isi Modul</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tanyakan apa saja seputar modul ini. Jika topik tidak ada di dokumen, AI akan menjawab <em>"Tidak ditemukan di modul."</em>
            </p>

            <form onSubmit={handleAskQuestion} className="space-y-4 pt-2">
              <div>
                <input
                  type="text"
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Contoh: Apa kesimpulan utama dari karya tulis ini?"
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
                    <span>Mencari Jawaban di Dalam Dokumen...</span>
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
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block border-b border-slate-100 dark:border-slate-800 pb-3">
                Jawaban AI
              </span>
              <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                {qaAnswer}
                {isAsking && (
                  <span className="inline-block w-2 h-4 bg-indigo-600 animate-pulse ml-1 align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
