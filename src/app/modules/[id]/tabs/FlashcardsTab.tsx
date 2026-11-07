'use client';

import { useState } from 'react';
import {
  Layers,
  Sparkles,
  Loader2,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatFriendlyErrorMessage } from '@/lib/learning/api-stream-reader';

interface Flashcard {
  id?: string;
  front: string;
  back: string;
  chapter?: string | null;
  level?: string;
  box?: number;
  last_result?: 'hafal' | 'belum' | null;
}

interface FlashcardsTabProps {
  moduleId: string;
  initialCards: Flashcard[];
  onError: (msg: string) => void;
}

export default function FlashcardsTab({ moduleId, initialCards, onError }: FlashcardsTabProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialCards);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGeneratingCards, setIsGeneratingCards] = useState(false);
  const [cardCount, setCardCount] = useState<number>(5);
  const [cardLevel, setCardLevel] = useState<'mudah' | 'sedang' | 'sulit'>('sedang');
  const [cardFilter, setCardFilter] = useState<'all' | 'belum' | 'hafal'>('all');

  const handleGenerateFlashcards = async () => {
    setIsGeneratingCards(true);
    onError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
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

      // Format kartu AI agar selaras dengan skema (mendukung depan/belakang dan front/back)
      const cardsToSave = generatedCards.map((c: any) => ({
        front: c.front || c.depan,
        back: c.back || c.belakang,
        chapter: c.chapter || c.bab || null,
        level: c.level || c.tingkat || 'sedang',
      }));

      // Simpan ke database Supabase via API route dengan deduplikasi otomatis
      const saveRes = await fetch(`/api/modules/${moduleId}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: cardsToSave }),
      });

      if (saveRes.ok) {
        const saveJson = await saveRes.json();
        if (saveJson.cards && saveJson.cards.length > 0) {
          setFlashcards((prev) => [...saveJson.cards, ...prev]);
        } else if (saveJson.message) {
          onError(saveJson.message);
        }
      } else {
        const errJson = await saveRes.json();
        throw new Error(errJson.error || 'Gagal menyimpan kartu ke database.');
      }

      setCurrentCardIndex(0);
      setIsFlipped(false);
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message);
      }
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
        await fetch(`/api/modules/${moduleId}/flashcards`, {
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

  return (
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
  );
}
