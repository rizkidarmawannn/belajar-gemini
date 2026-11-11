'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  Award,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  BookOpen,
  Globe,
  Layers,
} from 'lucide-react';
import { formatFriendlyErrorMessage } from '@/lib/learning/api-stream-reader';
import QuizExplanationBlock, {
  type ExplanationMode,
  type QuizExplanationData,
  type DeepExplainEntry,
  buildDeepExplainKey,
  buildQuestionErrorKey,
} from './QuizExplanationBlock';

interface QuizQuestion {
  nomor: number;
  pertanyaan: string;
  opsi: Record<string, string>;
  kunci: string;
  penjelasan: string;
  penjelasan_modul?: string;
  penjelasan_luar?: string;
  sumber_penjelasan?: ExplanationMode;
  bab?: string;
  tingkat?: string;
}

interface RecordedQuizAnswer extends QuizExplanationData {
  nomor: number;
}

interface QuizAttempt {
  id: string;
  score: number;
  total: number;
  answers: any;
  created_at: string;
}

interface QuizTabProps {
  moduleId: string;
  initialAttempts: QuizAttempt[];
  onError: (msg: string) => void;
}

const SETUP_EXPLANATION_OPTIONS: Array<{
  value: ExplanationMode;
  label: string;
  desc: string;
}> = [
  {
    value: 'modul',
    label: 'Dari Modul',
    desc: 'Fokus materi & aturan di modul',
  },
  {
    value: 'luar_modul',
    label: 'Dari Luar Modul',
    desc: 'Pengetahuan umum & analogi',
  },
  {
    value: 'keduanya',
    label: 'Dua-duanya',
    desc: 'Modul + pengayaan luar modul',
  },
];

export default function QuizTab({ moduleId, initialAttempts, onError }: QuizTabProps) {
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isOptionChecked, setIsOptionChecked] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<RecordedQuizAnswer[]>([]);
  const [isQuizFinished, setIsQuizFinished] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizCount, setQuizCount] = useState<number>(5);
  const [quizDifficulty, setQuizDifficulty] = useState<'mudah' | 'sedang' | 'sulit' | 'campuran'>('sedang');
  const [quizExplanationMode, setQuizExplanationMode] = useState<ExplanationMode>('keduanya');
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>(initialAttempts);

  // Cache lokal & status loading untuk pendalaman penjelasan soal ("Minta Penjelasan Lagi")
  const [deepExplanations, setDeepExplanations] = useState<Record<string, DeepExplainEntry>>({});
  const [loadingDeepKey, setLoadingDeepKey] = useState<string | null>(null);
  const [deepErrors, setDeepErrors] = useState<Record<string, string>>({});

  const handleGenerateQuiz = async () => {
    setIsGeneratingQuiz(true);
    onError('');
    setIsQuizFinished(false);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setIsOptionChecked(false);
    setQuizScore(0);
    setQuizAnswers([]);
    setDeepExplanations({});
    setDeepErrors({});

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'quiz',
          params: {
            count: quizCount,
            difficulty: quizDifficulty,
            explanationMode: quizExplanationMode,
          },
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Gagal membuat kuis AI.';
        try {
          const errJson = await response.json();
          errorMsg = errJson.error || errorMsg;
        } catch {
          if (response.status === 504 || response.status === 502) {
            errorMsg = 'Waktu serverless habis (Gateway Timeout). Mohon coba lagi.';
          } else {
            errorMsg = `Server merespons status ${response.status}.`;
          }
        }
        throw new Error(errorMsg);
      }

      let json: any = null;
      try {
        json = await response.json();
      } catch {
        throw new Error('Respons dari server tidak valid (bukan JSON).');
      }

      const questions = json?.result?.soal || [];
      if (questions.length === 0) {
        throw new Error('AI tidak berhasil menyusun soal kuis yang valid.');
      }

      setQuizQuestions(questions);
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message);
      }
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
        opsi: currentQ.opsi,
        userAnswer: optKey,
        kunci: currentQ.kunci,
        isCorrect,
        penjelasan: currentQ.penjelasan,
        penjelasan_modul: currentQ.penjelasan_modul,
        penjelasan_luar: currentQ.penjelasan_luar,
        sumber_penjelasan: currentQ.sumber_penjelasan || quizExplanationMode,
        bab: currentQ.bab,
      },
    ]);
  };

  const handleRequestDeepExplain = async (item: QuizExplanationData, mode: ExplanationMode) => {
    const cacheKey = buildDeepExplainKey(item.pertanyaan, item.userAnswer, mode);
    if (deepExplanations[cacheKey]) return;

    const qErrorKey = buildQuestionErrorKey(item.pertanyaan, item.userAnswer);
    setDeepErrors((prev) => {
      const next = { ...prev };
      delete next[qErrorKey];
      return next;
    });
    setLoadingDeepKey(cacheKey);

    try {
      const ops = item.opsi || {};
      const correctOpt = (item.kunci || 'A').toUpperCase();
      const chosenOpt = (item.userAnswer || correctOpt).toUpperCase();

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'quiz_explain',
          params: {
            question: item.pertanyaan.trim().slice(0, 990),
            quizOptions: {
              A: String(ops.A || '-').slice(0, 590),
              B: String(ops.B || '-').slice(0, 590),
              C: String(ops.C || '-').slice(0, 590),
              D: String(ops.D || '-').slice(0, 590),
            },
            correctOption: (['A', 'B', 'C', 'D'].includes(correctOpt) ? correctOpt : 'A') as
              | 'A'
              | 'B'
              | 'C'
              | 'D',
            selectedOption: (['A', 'B', 'C', 'D'].includes(chosenOpt) ? chosenOpt : 'A') as
              | 'A'
              | 'B'
              | 'C'
              | 'D',
            chapterName: (item.bab || 'Umum').slice(0, 95),
            explanationMode: mode,
          },
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Gagal mengambil penjelasan lanjutan.';
        try {
          const errJson = await response.json();
          errorMsg = errJson.error || errorMsg;
        } catch {
          errorMsg = `Server merespons status ${response.status}.`;
        }
        throw new Error(errorMsg);
      }

      const json = await response.json();
      const markdown = json?.result?.markdown;
      if (!markdown || typeof markdown !== 'string') {
        throw new Error('Respons penjelasan lanjutan kosong.');
      }

      setDeepExplanations((prev) => ({
        ...prev,
        [cacheKey]: {
          markdown,
          mode,
          usedChapters: json?.usedChapters || json?.result?.usedChapters,
        },
      }));
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        setDeepErrors((prev) => ({
          ...prev,
          [qErrorKey]: friendly.message || err?.message || 'Gagal memuat penjelasan lanjutan.',
        }));
      }
    } finally {
      setLoadingDeepKey((prev) => (prev === cacheKey ? null : prev));
    }
  };

  const handleNextQuestion = async () => {
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsOptionChecked(false);
    } else {
      setIsQuizFinished(true);
      // Simpan hasil kuis ke database Supabase dengan field ketat sesuai AnswerItemSchema
      try {
        const sanitizedAnswers = quizAnswers.map((a) => ({
          nomor: a.nomor,
          pertanyaan: (a.pertanyaan || '').slice(0, 495),
          userAnswer: String(a.userAnswer || '').slice(0, 95),
          kunci: String(a.kunci || '').slice(0, 10),
          isCorrect: Boolean(a.isCorrect),
          ...(a.penjelasan ? { penjelasan: String(a.penjelasan).slice(0, 990) } : {}),
        }));

        const attemptRes = await fetch(`/api/modules/${moduleId}/quiz-attempts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: quizScore,
            total: quizQuestions.length,
            answers: sanitizedAnswers,
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
    const wrongQs = quizQuestions.filter((q, idx) => {
      const qNum = q.nomor || idx + 1;
      const recorded = quizAnswers.find((a) => a.nomor === qNum);
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

  const currentQ = quizQuestions[currentQIndex];
  const isCurrentAnswerCorrect =
    Boolean(selectedOption) &&
    selectedOption?.toUpperCase() === currentQ?.kunci?.toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header Panel Kuis */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              <span>Kuis &amp; Latihan Soal Interaktif</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Uji pemahaman Anda dengan soal pilihan ganda 4 opsi. Pilih sumber penjelasan dari modul, luar modul, atau dua-duanya baik saat menjawab benar maupun salah.
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
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jumlah Soal
                </label>
                <select
                  value={quizCount}
                  onChange={(e) => setQuizCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value={5}>5 Soal (Cepat)</option>
                  <option value={10}>10 Soal (Standar)</option>
                  <option value={15}>15 Soal</option>
                  <option value={20}>20 Soal (Latihan Lengkap)</option>
                  <option value={25}>25 Soal (Ujian Harian)</option>
                  <option value={30}>30 Soal</option>
                  <option value={40}>40 Soal</option>
                  <option value={50}>50 Soal (Ujian Tengah Semester)</option>
                  <option value={75}>75 Soal (Latihan Intensif)</option>
                  <option value={100}>100 Soal (Tryout Komprehensif)</option>
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
                  <option value="sulit">Sulit (Analisis &amp; Kasus)</option>
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

            {/* Pilihan Sumber Penjelasan */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Sumber Penjelasan Saat Menjawab Soal:
                </span>
                <span className="text-[11px] text-slate-400">
                  Bisa tetap minta sudut pandang lain per soal saat kuis berlangsung
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SETUP_EXPLANATION_OPTIONS.map((opt) => {
                  const isActive = quizExplanationMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setQuizExplanationMode(opt.value)}
                      className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex-shrink-0 ${
                          isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                        }`}
                      >
                        {opt.value === 'modul' ? (
                          <BookOpen className="w-4 h-4" />
                        ) : opt.value === 'luar_modul' ? (
                          <Globe className="w-4 h-4" />
                        ) : (
                          <Layers className="w-4 h-4" />
                        )}
                      </span>
                      <div>
                        <span className="block text-xs font-semibold">{opt.label}</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {opt.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {quizCount >= 30 && quizExplanationMode === 'keduanya' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 rounded-xl px-3 py-2">
                  <strong>Tips Kecepatan:</strong> Untuk {quizCount} soal dengan mode <em>Dua-duanya</em>, sistem memakai batch paralel. Jika ingin kuis lebih cepat jadi, Anda bisa pilih <strong>Dari Modul</strong> dahulu lalu gunakan tombol pendalaman <strong>Dari Luar Modul / Dua-duanya</strong> pada soal yang ingin dipahami lebih dalam.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Saat Menyusun Soal Banyak */}
      {isGeneratingQuiz && quizCount >= 20 && (
        <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-200 text-xs flex items-center gap-3 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 flex-shrink-0" />
          <span>
            AI sedang menyusun <strong>{quizCount} butir soal</strong> latihan secara mendalam beserta opsi dan pembahasannya. Mohon tunggu sekitar 15–30 detik...
          </span>
        </div>
      )}

      {/* Sesi Kuis Berjalan (1 Soal Per Layar) */}
      {quizQuestions.length > 0 && !isQuizFinished && currentQ && (
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-300"
              style={{ width: `${((currentQIndex + 1) / quizQuestions.length) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                Soal {currentQIndex + 1} dari {quizQuestions.length}
              </span>
              <span className="text-xs text-slate-400 capitalize">
                Bab: {currentQ.bab || 'Umum'}
              </span>
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
              {currentQ.tingkat || 'sedang'}
            </span>
          </div>

          <div>
            <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
              {currentQ.pertanyaan}
            </h3>
          </div>

          <div className="space-y-3">
            {Object.entries(currentQ.opsi || {}).map(([key, value]) => {
              const isSelected = selectedOption === key;
              const isCorrect = key.toUpperCase() === currentQ.kunci.toUpperCase();

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

          {isOptionChecked && selectedOption && (
            <div
              className={`p-4 md:p-5 rounded-2xl border space-y-3 ${
                isCurrentAnswerCorrect
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50'
                  : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/50'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isCurrentAnswerCorrect ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Jawaban Anda Tepat! (Pilihan {selectedOption})</span>
                  </span>
                ) : (
                  <span className="text-rose-700 dark:text-rose-400 font-bold text-xs flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    <span>
                      Jawaban Anda Kurang Tepat (Pilihan: {selectedOption} • Kunci Benar: {currentQ.kunci})
                    </span>
                  </span>
                )}
              </div>

              <QuizExplanationBlock
                key={`live-${currentQIndex}-${selectedOption}-${currentQ.pertanyaan}`}
                item={{
                  pertanyaan: currentQ.pertanyaan,
                  opsi: currentQ.opsi,
                  kunci: currentQ.kunci,
                  userAnswer: selectedOption,
                  isCorrect: isCurrentAnswerCorrect,
                  penjelasan: currentQ.penjelasan,
                  penjelasan_modul: currentQ.penjelasan_modul,
                  penjelasan_luar: currentQ.penjelasan_luar,
                  sumber_penjelasan: currentQ.sumber_penjelasan || quizExplanationMode,
                  bab: currentQ.bab,
                }}
                deepCache={deepExplanations}
                onRequestDeepExplain={handleRequestDeepExplain}
                loadingKey={loadingDeepKey}
                errorByQuestion={deepErrors}
              />
            </div>
          )}

          {isOptionChecked && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleNextQuestion}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition flex items-center gap-2"
              >
                <span>
                  {currentQIndex < quizQuestions.length - 1
                    ? 'Lanjut ke Soal Berikutnya'
                    : 'Selesai & Lihat Skor'}
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
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Kuis Selesai!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Hasil latihan Anda telah dicatat ke riwayat belajar.
            </p>
          </div>

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

          <div className="text-left pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Rincian &amp; Pembahasan Jawaban Kuis:
            </h4>
            {quizAnswers.map((a, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-3 ${
                  a.isCorrect
                    ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 font-semibold">
                  <span className="text-slate-900 dark:text-slate-100 flex-1">
                    Soal {a.nomor}: {a.pertanyaan}
                  </span>
                  <span
                    className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[11px] ${
                      a.isCorrect
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {a.isCorrect
                      ? `Benar (${a.userAnswer}) +1`
                      : `Salah • Anda: ${a.userAnswer} • Kunci: ${a.kunci}`}
                  </span>
                </div>

                <QuizExplanationBlock
                  key={`review-${idx}-${a.nomor}-${a.pertanyaan}`}
                  item={a}
                  deepCache={deepExplanations}
                  onRequestDeepExplain={handleRequestDeepExplain}
                  loadingKey={loadingDeepKey}
                  errorByQuestion={deepErrors}
                  compact
                />
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
  );
}
