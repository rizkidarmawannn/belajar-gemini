import { z } from 'zod';

// ==================== 1. SKEMA ZOD ====================

// Skema Opsi Pilihan Ganda (tepat A, B, C, D)
export const QuizOptionSchema = z.object({
  A: z.string().min(1, 'Opsi A tidak boleh kosong'),
  B: z.string().min(1, 'Opsi B tidak boleh kosong'),
  C: z.string().min(1, 'Opsi C tidak boleh kosong'),
  D: z.string().min(1, 'Opsi D tidak boleh kosong'),
});

export const QuizExplanationSourceSchema = z.enum(['modul', 'luar_modul', 'keduanya']);
export type QuizExplanationSource = z.infer<typeof QuizExplanationSourceSchema>;

// Skema 1 Butir Soal
export const QuizItemSchema = z
  .object({
    nomor: z.number().int().positive().optional(),
    pertanyaan: z.string().min(5, 'Pertanyaan minimal 5 karakter'),
    opsi: QuizOptionSchema,
    kunci: z.enum(['A', 'B', 'C', 'D'], {
      errorMap: () => ({ message: 'Kunci jawaban harus salah satu dari A, B, C, atau D' }),
    }),
    penjelasan: z.string().optional().default(''),
    penjelasan_modul: z.string().optional(),
    penjelasan_luar: z.string().optional(),
    sumber_penjelasan: QuizExplanationSourceSchema.optional(),
    bab: z.string().default('Umum'),
    tingkat: z.enum(['mudah', 'sedang', 'sulit']).default('sedang'),
  })
  .refine(
    (item) =>
      item.penjelasan.trim().length > 0 ||
      (item.penjelasan_modul?.trim().length ?? 0) > 0 ||
      (item.penjelasan_luar?.trim().length ?? 0) > 0,
    {
      message: 'Penjelasan jawaban wajib disertakan',
      path: ['penjelasan'],
    }
  );

// Skema Kumpulan Soal Kuis
export const QuizSchema = z.object({
  soal: z.array(QuizItemSchema).min(1, 'Minimal harus terdapat 1 butir soal'),
});

export type QuizData = z.infer<typeof QuizSchema>;
export type QuizItem = z.infer<typeof QuizItemSchema>;

// Skema 1 Butir Flashcard
export const FlashcardItemSchema = z.object({
  depan: z.string().min(2, 'Bagian depan kartu tidak boleh kosong'),
  belakang: z.string().min(2, 'Bagian belakang kartu tidak boleh kosong'),
  bab: z.string().optional().default('Umum'),
  tingkat: z.enum(['mudah', 'sedang', 'sulit']).optional().default('sedang'),
});

// Skema Kumpulan Flashcard
export const FlashcardSchema = z.object({
  kartu: z.array(FlashcardItemSchema).min(1, 'Minimal harus terdapat 1 kartu flashcard'),
});

export type FlashcardData = z.infer<typeof FlashcardSchema>;
export type FlashcardItem = z.infer<typeof FlashcardItemSchema>;

// Skema Evaluasi Esai
export const EssayEvalSchema = z.object({
  skor: z.number().min(0).max(100),
  rincian: z.object({
    ketepatan: z.number().min(0).max(50),
    kelengkapan: z.number().min(0).max(30),
    kejelasan: z.number().min(0).max(20),
  }),
  sudah_benar: z.array(z.string()),
  keliru: z.array(z.string()),
  terlewat: z.array(z.string()),
  jawaban_ideal: z.string().min(1, 'Jawaban ideal wajib diisi'),
  saran: z.string().min(1, 'Saran perbaikan wajib diisi'),
});

export type EssayEvalData = z.infer<typeof EssayEvalSchema>;

// ==================== 2. HELPER PARSER & PEMBERSIH KODE ====================

/**
 * Membersihkan teks keluaran model dari pagar kode (```json ... ``` atau ``` ... ```)
 * lalu mem-parsing string menjadi objek JSON.
 */
export function cleanAndParseJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Respons model kosong atau bukan string.');
  }

  let cleaned = rawText.trim();

  // 1. Bersihkan pagar kode markdown ```json ... ``` atau ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
  }

  // 2. Temukan indeks awal { atau [ dan indeks akhir } atau ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIndex = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIndex = Math.max(lastBrace, lastBracket);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    cleaned = cleaned.substring(startIndex, endIndex + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstErr: any) {
    // 3. Pemulihan glitch format JSON umum dari LLM:
    // a. Buang trailing comma sebelum penutup } atau ] (misal `{"a": 1, }`)
    let repaired = cleaned.replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(repaired);
    } catch {
      // b. Pemulihan bila ada kurung siku / kurung kurawal yang belum tertutup
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;

      let suffix = '';
      // Tambahkan kurung tutup yang hilang
      if (openBrackets > closeBrackets) {
        suffix += ']'.repeat(openBrackets - closeBrackets);
      }
      if (openBraces > closeBraces) {
        suffix += '}'.repeat(openBraces - closeBraces);
      }

      if (suffix) {
        try {
          return JSON.parse(repaired + suffix);
        } catch {}
      }

      throw new Error(`Format JSON model tidak valid: ${firstErr.message}. Teks: ${cleaned.slice(0, 100)}...`);
    }
  }
}

/**
 * Validasi dan kurasi butir soal kuis:
 * - Memastikan opsi A, B, C, D tidak ada yang kembar/duplikat teks
 * - Membuang pertanyaan duplikat
 * - Memastikan kunci valid
 * - Menomori ulang soal secara terurut
 */
export function validateAndSanitizeQuiz(raw: unknown): QuizData {
  const parsed = QuizSchema.parse(raw);

  const seenQuestions = new Set<string>();
  const validSoal: QuizItem[] = [];

  for (const item of parsed.soal) {
    // Normalisasi teks pertanyaan untuk deteksi duplikasi
    const qNorm = item.pertanyaan.trim().toLowerCase();
    if (seenQuestions.has(qNorm)) {
      continue; // Buang soal dengan pertanyaan duplikat
    }

    // Periksa apakah ada opsi jawaban yang teksnya kembar
    const options = [
      item.opsi.A.trim().toLowerCase(),
      item.opsi.B.trim().toLowerCase(),
      item.opsi.C.trim().toLowerCase(),
      item.opsi.D.trim().toLowerCase(),
    ];
    const uniqueOptions = new Set(options);
    if (uniqueOptions.size < 4) {
      continue; // Buang soal yang memiliki opsi kembar/identik
    }

    seenQuestions.add(qNorm);
    const pModul = item.penjelasan_modul?.trim() || undefined;
    const pLuar = item.penjelasan_luar?.trim() || undefined;
    let combinedPenjelasan = item.penjelasan.trim();
    if (!combinedPenjelasan) {
      const parts: string[] = [];
      if (pModul) parts.push(`Berdasarkan Modul:\n${pModul}`);
      if (pLuar) parts.push(`Dari Luar Modul:\n${pLuar}`);
      combinedPenjelasan = parts.join('\n\n');
    }

    validSoal.push({
      ...item,
      penjelasan: combinedPenjelasan,
      ...(pModul ? { penjelasan_modul: pModul } : {}),
      ...(pLuar ? { penjelasan_luar: pLuar } : {}),
      nomor: validSoal.length + 1,
    });
  }

  if (validSoal.length === 0) {
    throw new Error('Tidak ada soal kuis yang memenuhi kriteria kualitas setelah proses kurasi.');
  }

  return { soal: validSoal };
}

/**
 * Validasi dan kurasi kartu flashcard:
 * - Membuang kartu dengan bagian depan duplikat
 */
export function validateAndSanitizeFlashcards(raw: unknown): FlashcardData {
  const parsed = FlashcardSchema.parse(raw);

  const seenFronts = new Set<string>();
  const validCards: FlashcardItem[] = [];

  for (const card of parsed.kartu) {
    const frontNorm = card.depan.trim().toLowerCase();
    if (seenFronts.has(frontNorm)) {
      continue; // Buang kartu dengan konsep/pertanyaan depan yang sama
    }
    seenFronts.add(frontNorm);
    validCards.push(card);
  }

  if (validCards.length === 0) {
    throw new Error('Tidak ada kartu flashcard yang memenuhi kriteria setelah proses kurasi.');
  }

  return { kartu: validCards };
}

/**
 * Validasi hasil evaluasi esai
 */
export function validateEssayEvaluation(raw: unknown): EssayEvalData {
  return EssayEvalSchema.parse(raw);
}

/**
 * Menggabungkan hasil kuis utama dengan hasil tambahan (gap filling),
 * membuang pertanyaan yang duplikat, dan menomori ulang dari 1 sampai N.
 */
export function mergeQuizResults(existing: QuizData, additional: QuizData): QuizData {
  const seenQuestions = new Set<string>(
    existing.soal.map((s) => s.pertanyaan.trim().toLowerCase())
  );
  const combinedSoal = [...existing.soal];

  for (const item of additional.soal) {
    const qNorm = item.pertanyaan.trim().toLowerCase();
    if (!seenQuestions.has(qNorm)) {
      seenQuestions.add(qNorm);
      combinedSoal.push(item);
    }
  }

  // Nomor ulang berurutan
  const renumbered = combinedSoal.map((item, index) => ({
    ...item,
    nomor: index + 1,
  }));

  return { soal: renumbered };
}

/**
 * Menggabungkan hasil flashcard utama dengan hasil tambahan,
 * membuang bagian depan (front) yang duplikat.
 */
export function mergeFlashcardResults(
  existing: FlashcardData,
  additional: FlashcardData
): FlashcardData {
  const seenFronts = new Set<string>(
    existing.kartu.map((c) => c.depan.trim().toLowerCase())
  );
  const combinedKartu = [...existing.kartu];

  for (const card of additional.kartu) {
    const fNorm = card.depan.trim().toLowerCase();
    if (!seenFronts.has(fNorm)) {
      seenFronts.add(fNorm);
      combinedKartu.push(card);
    }
  }

  return { kartu: combinedKartu };
}

