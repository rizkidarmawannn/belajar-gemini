import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { renderPrompt, sanitizeModuleContent } from '../src/lib/gemini/render-prompt.ts';
import {
  getModelName,
  getModelCandidates,
  markModelDegraded,
  resetModelHealthForTesting,
} from '../src/lib/gemini/client.ts';
import { calculateEffectiveTimeout, formatFriendlyErrorMessage } from '../src/lib/gemini/generate.ts';
import {
  cleanAndParseJson,
  normalizeQuizPayload,
  normalizeFlashcardPayload,
  normalizeEssayEvalPayload,
  validateAndSanitizeQuiz,
  validateAndSanitizeFlashcards,
  validateEssayEvaluation,
  mergeQuizResults,
  mergeFlashcardResults,
} from '../src/lib/validators/index.ts';
import {
  handleGenerate,
  splitIntoBalancedBatchCounts,
  isCacheCompleteForRequest,
  buildBalancedModuleExcerpt,
  signBatchToken,
  verifyBatchToken,
} from '../src/lib/gemini/handler.ts';

// ==================== 1. TEST MODEL NAME & CONFIG ====================

test('getModelName: melempar error jelas bila GEMINI_MODEL kosong atau tidak diset', () => {
  const originalModel = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.throws(
      () => getModelName(),
      /GEMINI_MODEL belum dikonfigurasi di environment variable/
    );

    process.env.GEMINI_MODEL = '   ';
    assert.throws(
      () => getModelName(),
      /GEMINI_MODEL belum dikonfigurasi di environment variable/
    );

    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    assert.equal(getModelName(), 'gemini-3.8-flash');
  } finally {
    process.env.GEMINI_MODEL = originalModel;
  }
});

// ==================== 2. TEST SANITASI TAG MODUL (PROMPT INJECTION VARIATIF) ====================

test('sanitizeModuleContent: menetralkan variasi tag </modul >, < /modul>, </MODUL>, dan <modul>', () => {
  const variations = [
    'Teks </modul > injeksi',
    'Teks < /modul> injeksi',
    'Teks </MODUL> injeksi',
    'Teks < modul > injeksi',
    'Teks <modul> injeksi',
    'Teks </modul> injeksi',
  ];

  for (const text of variations) {
    const sanitized = sanitizeModuleContent(text);
    assert.ok(!/<\s*\/?\s*modul\s*>/i.test(sanitized), `Tag harus dinetralkan: ${text}`);
    assert.ok(sanitized.includes('&lt;') && sanitized.includes('&gt;'));
  }
});

test('renderPrompt: otomatis menetralkan tag modul saat menggabungkan variabel modul', () => {
  const rendered = renderPrompt('summary-short', {
    maks_poin: 3,
    modul: 'Konten modul </modul > prompt injection < /modul>',
  });

  assert.ok(!rendered.promptText.includes('</modul >'));
  assert.ok(!rendered.promptText.includes('< /modul>'));
  assert.ok(rendered.promptText.includes('&lt;/modul&gt;'));
});

// ==================== 3. TEST RENDER PROMPT ====================

test('renderPrompt: melempar error jelas bila ada variabel kosong atau undefined', () => {
  assert.throws(
    () => {
      renderPrompt('summary', {
        gaya: 'singkat',
        modul: 'Materi tes',
      });
    },
    /Variabel "{{maks_poin}}" wajib diisi/
  );

  assert.throws(
    () => {
      renderPrompt('summary', {
        gaya: '',
        maks_poin: 5,
        modul: 'Materi tes',
      });
    },
    /bernilai kosong/
  );
});

// ==================== 4. TEST VALIDATOR & JSON PARSER ====================

test('cleanAndParseJson: membersihkan pagar kode markdown ```json dan ```', () => {
  const rawWithFences = '```json\n{"pesan": "halo dunia"}\n```';
  const parsed = cleanAndParseJson(rawWithFences);
  assert.deepEqual(parsed, { pesan: 'halo dunia' });

  const rawWithPlainText = 'Berikut hasilnya:\n```\n{"status": "ok"}\n```\nSemoga membantu.';
  const parsed2 = cleanAndParseJson(rawWithPlainText);
  assert.deepEqual(parsed2, { status: 'ok' });
});

test('cleanAndParseJson: melempar error bila JSON rusak/tidak valid', () => {
  assert.throws(
    () => {
      cleanAndParseJson('ini bukan json dan tidak ada kurung');
    },
    /Format JSON model tidak valid/
  );
});

test('validateAndSanitizeQuiz: membuang soal duplikat dan menomori ulang', () => {
  const rawQuiz = {
    soal: [
      {
        nomor: 1,
        pertanyaan: 'Apa fungsi dari mitokondria?',
        opsi: { A: 'Pembangkit energi', B: 'Sintesis protein', C: 'Pencernaan sel', D: 'Fotosintesis' },
        kunci: 'A',
        penjelasan: 'Mitokondria menghasilkan ATP.',
        bab: 'Bab 1',
        tingkat: 'mudah',
      },
      {
        nomor: 2,
        pertanyaan: 'Apa fungsi dari mitokondria?', // Duplikat
        opsi: { A: 'Pembangkit energi', B: 'Sintesis protein', C: 'Pencernaan sel', D: 'Fotosintesis' },
        kunci: 'A',
        penjelasan: 'Mitokondria menghasilkan ATP.',
        bab: 'Bab 1',
        tingkat: 'mudah',
      },
      {
        nomor: 3,
        pertanyaan: 'Organel apa yang memiliki ribosom?',
        opsi: { A: 'Retikulum endoplasma kasar', B: 'Badan golgi', C: 'Lisosom', D: 'Vakuola' },
        kunci: 'A',
        penjelasan: 'RE kasar ditempeli ribosom.',
        bab: 'Bab 1',
        tingkat: 'sedang',
      },
    ],
  };

  const sanitized = validateAndSanitizeQuiz(rawQuiz);
  assert.equal(sanitized.soal.length, 2);
  assert.equal(sanitized.soal[0].nomor, 1);
  assert.equal(sanitized.soal[1].nomor, 2);
});

test('validateAndSanitizeQuiz: menolak kunci di luar A-D atau opsi kembar', () => {
  const invalidKeyQuiz = {
    soal: [
      {
        nomor: 1,
        pertanyaan: 'Pertanyaan tes',
        opsi: { A: 'A', B: 'B', C: 'C', D: 'D' },
        kunci: 'E',
        penjelasan: 'Tes',
        bab: 'Bab 1',
        tingkat: 'mudah',
      },
    ],
  };

  assert.throws(
    () => validateAndSanitizeQuiz(invalidKeyQuiz),
    /Kunci jawaban harus salah satu dari A, B, C, atau D/
  );
});

test('validateAndSanitizeFlashcards: membuang kartu dengan bagian depan duplikat', () => {
  const rawCards = {
    kartu: [
      { depan: 'Mitokondria', belakang: 'Pembangkit energi sel', bab: 'Bab 1', tingkat: 'mudah' },
      { depan: 'mitokondria', belakang: 'Penghasil ATP', bab: 'Bab 1', tingkat: 'mudah' },
      { depan: 'Kloroplas', belakang: 'Tempat fotosintesis', bab: 'Bab 1', tingkat: 'mudah' },
    ],
  };

  const sanitized = validateAndSanitizeFlashcards(rawCards);
  assert.equal(sanitized.kartu.length, 2);
  assert.equal(sanitized.kartu[0].depan, 'Mitokondria');
  assert.equal(sanitized.kartu[1].depan, 'Kloroplas');
});

// ==================== 5. TEST GAP FILLING (QUIZ & FLASHCARD) ====================

test('mergeQuizResults: menggabungkan soal tambahan tanpa duplikasi dan menomori ulang', () => {
  const existing = {
    soal: [
      { nomor: 1, pertanyaan: 'Soal 1', opsi: { A: '1', B: '2', C: '3', D: '4' }, kunci: 'A', penjelasan: '', bab: '1', tingkat: 'mudah' },
    ],
  };
  const additional = {
    soal: [
      { nomor: 1, pertanyaan: 'Soal 1', opsi: { A: '1', B: '2', C: '3', D: '4' }, kunci: 'A', penjelasan: '', bab: '1', tingkat: 'mudah' },
      { nomor: 2, pertanyaan: 'Soal 2', opsi: { A: '1', B: '2', C: '3', D: '4' }, kunci: 'B', penjelasan: '', bab: '1', tingkat: 'sedang' },
    ],
  };

  const merged = mergeQuizResults(existing, additional);
  assert.equal(merged.soal.length, 2);
  assert.equal(merged.soal[1].nomor, 2);
});

test('mergeFlashcardResults: menggabungkan kartu tambahan tanpa duplikasi case-insensitive', () => {
  const existing = {
    kartu: [
      { depan: 'Sel Tumbuhan', belakang: 'Punya dinding sel', bab: '1', tingkat: 'mudah' },
    ],
  };
  const additional = {
    kartu: [
      { depan: 'sel tumbuhan', belakang: 'Duplikat huruf kecil', bab: '1', tingkat: 'mudah' }, // Duplikat
      { depan: 'Sel Hewan', belakang: 'Tidak punya dinding sel', bab: '1', tingkat: 'mudah' }, // Baru
    ],
  };

  const merged = mergeFlashcardResults(existing, additional);
  assert.equal(merged.kartu.length, 2);
  assert.equal(merged.kartu[0].depan, 'Sel Tumbuhan');
  assert.equal(merged.kartu[1].depan, 'Sel Hewan');
});

// ==================== 6. TEST TIMEOUT EFEKTIF PER PERCOBAAN ====================

test('calculateEffectiveTimeout: min(attemptTimeout, sisa waktu total - 2 detik)', () => {
  // Sisa waktu masih banyak (30 detik): pakai attemptTimeout (20 detik)
  const t1 = calculateEffectiveTimeout(20000, 30000);
  assert.equal(t1, 20000);

  // Sisa waktu mepet (8 detik): pakai sisa waktu - 2 detik = 6 detik
  const t2 = calculateEffectiveTimeout(20000, 8000);
  assert.equal(t2, 6000);

  // Sisa waktu sangat tipis (2.5 detik): minimal 1 detik
  const t3 = calculateEffectiveTimeout(20000, 2500);
  assert.equal(t3, 1000);
});

// ==================== 7. TEST DETERMINISTIC PARAMS HASH ====================

test('params_hash: feature dan chapterPosition diletakkan setelah spread params sehingga tidak dapat ditimpa', () => {
  const computeHash = (feature, chapterPosition, params) => {
    const normalizedObject = {
      ...params,
      feature,
      chapterPosition: chapterPosition ?? 'all',
    };
    const sortedKeys = Object.keys(normalizedObject).sort();
    const sortedParams = {};
    for (const k of sortedKeys) {
      sortedParams[k] = normalizedObject[k];
    }
    return crypto.createHash('sha256').update(JSON.stringify(sortedParams)).digest('hex');
  };

  const maliciousParams = { feature: 'malicious_feature', chapterPosition: 999, style: 'singkat' };
  const safeHash = computeHash('summary', 1, maliciousParams);
  const regularHash = computeHash('summary', 1, { style: 'singkat' });

  assert.equal(safeHash, regularHash);
});

// ==================== 8. TEST ROUTE HANDLER ASLI DENGAN RESERVASI ATOMIK ====================

const VALID_MODULE_ID = '11111111-1111-1111-1111-111111111111';

function createMockDeps(overrides = {}) {
  const cacheMap = new Map();
  let geminiCalls = 0;
  let usageLogRecords = [];
  let usageLogUpdates = [];
  let usageLogDeletions = [];
  let currentUsageCount = 0;

  const baseDeps = {
    async getAuthUser() {
      return { user: { id: 'user-123' }, error: null };
    },
    async getModule(moduleId) {
      return {
        data: { id: moduleId, title: 'Modul Biologi Sel', status: 'ready' },
        error: null,
      };
    },
    // Mock fungsi RPC atomik Postgres `reserve_usage` (sesuai migrasi 0003_reserve_usage_unlimited)
    async reserveUsage(userId, feature, limit, tokensIn) {
      if (limit > 0 && currentUsageCount >= limit) {
        return { id: null, error: null }; // Kuota habis
      }
      currentUsageCount++;
      const logId = usageLogRecords.length + 1;
      usageLogRecords.push({ id: logId, userId, feature, tokensIn, tokensOut: null });
      return { id: logId, error: null };
    },
    async updateUsageLog(logId, tokensIn, tokensOut) {
      usageLogUpdates.push({ logId, tokensIn, tokensOut });
    },
    async deleteUsageLog(logId) {
      usageLogDeletions.push(logId);
    },
    async getCachedGeneration(userId, moduleId, feature, paramsHash, promptVersion) {
      const key = `${userId}:${moduleId}:${feature}:${paramsHash}:${promptVersion}`;
      if (cacheMap.has(key)) {
        return { data: cacheMap.get(key), error: null };
      }
      return { data: null, error: null };
    },
    async getModuleChunks(moduleId, chapterPosition) {
      return {
        data: [{ chapter_title: 'Bab 1', content: 'Materi sel biologi.' }],
        error: null,
      };
    },
    async callGeminiText(opts) {
      geminiCalls++;
      return { data: 'Ringkasan bab 1 dari Gemini', tokensIn: 100, tokensOut: 50 };
    },
    async callGeminiJson(opts, validator, targetCount, gapFiller) {
      geminiCalls++;
      return {
        data: {
          soal: [
            {
              nomor: 1,
              pertanyaan: 'Fungsi sel?',
              opsi: { A: 'Unit terkecil', B: 'Organ', C: 'Molekul', D: 'Atom' },
              kunci: 'A',
              penjelasan: 'Definisi dasar',
              bab: 'Bab 1',
              tingkat: 'mudah',
            },
          ],
        },
        tokensIn: 120,
        tokensOut: 60,
      };
    },
    async callGeminiStream(opts, handlers) {
      geminiCalls++;
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Jawaban streaming'));
          if (handlers?.onBeforeClose) {
            await handlers.onBeforeClose('Jawaban streaming', 50, 25);
          }
          ctrl.close();
        },
        async cancel() {
          if (handlers?.onCancel) {
            await handlers.onCancel('Jawaban terpotong', 50, 10);
          }
        },
      });
    },
    async saveGeneration(entry) {
      const key = `${entry.user_id}:${entry.module_id}:${entry.feature}:${entry.params_hash}:${entry.prompt_version}`;
      cacheMap.set(key, entry);
    },
    dailyQuotaLimit: 30,
    promptVersion: '1',
    _getGeminiCalls: () => geminiCalls,
    _getCacheMap: () => cacheMap,
    _getUsageRecords: () => usageLogRecords,
    _getUsageUpdates: () => usageLogUpdates,
    _getUsageDeletions: () => usageLogDeletions,
  };

  return { ...baseDeps, ...overrides };
}

test('Route Handler ASLI: pengguna tanpa login ditolak dengan 401', async () => {
  const deps = createMockDeps({
    async getAuthUser() {
      return { user: null, error: 'Unauthorized' };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 401);
});

test('Route Handler ASLI: modul milik pengguna lain / tidak ditemukan ditolak dengan 404', async () => {
  const deps = createMockDeps({
    async getModule(id) {
      return { data: null, error: 'Not found' };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 404);
});

test('Route Handler ASLI: modul belum ready (status processing/failed) ditolak dengan 400', async () => {
  const deps = createMockDeps({
    async getModule(id) {
      return { data: { id, title: 'Modul Test', status: 'processing' }, error: null };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 400);
});

test('Route Handler ASLI: kuota habis ditolak dengan 429 dan Gemini TIDAK dipanggil', async () => {
  const deps = createMockDeps({
    async reserveUsage() {
      return { id: null, error: null }; // Simulasi kuota habis dari DB function
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 429);
  assert.equal(deps._getGeminiCalls(), 0);
});

test('Route Handler ASLI: cache hit TIDAK melakukan reservasi kuota dan Gemini TIDAK dipanggil', async () => {
  const deps = createMockDeps();

  // Permintaan 1 (Cache Miss)
  const res1 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    params: { style: 'singkat' },
  });
  assert.equal(res1.status, 200);
  assert.equal(deps._getGeminiCalls(), 1);
  assert.equal(deps._getUsageRecords().length, 1);

  // Permintaan 2 dengan parameter sama (Cache Hit)
  const res2 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    params: { style: 'singkat' },
  });
  assert.equal(res2.status, 200);
  const json2 = await res2.json();
  assert.equal(json2.cached, true);
  assert.equal(deps._getGeminiCalls(), 1, 'Panggilan Gemini TIDAK bertambah saat cache hit');
  assert.equal(deps._getUsageRecords().length, 1, 'Reservasi kuota TIDAK bertambah saat cache hit');
});

test('Route Handler ASLI: parameter regenerate=true melewati cache dan mereservasi kuota baru', async () => {
  const deps = createMockDeps();

  // Permintaan 1
  await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    params: { style: 'singkat' },
  });
  assert.equal(deps._getGeminiCalls(), 1);

  // Permintaan 2 dengan regenerate: true
  const res2 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
    params: { style: 'singkat' },
  });
  assert.equal(res2.status, 200);
  const json2 = await res2.json();
  assert.equal(json2.cached, false);
  assert.equal(deps._getGeminiCalls(), 2);
  assert.equal(deps._getUsageRecords().length, 2);
});

test('Route Handler ASLI: kegagalan reserve_usage menolak permintaan (FAIL CLOSED)', async () => {
  const deps = createMockDeps({
    async reserveUsage() {
      return { id: null, error: new Error('Postgres connection failed') };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 500);
  const json = await res.json();
  assert.ok(json.error.includes('Gagal memverifikasi alokasi kuota harian'));
  assert.equal(deps._getGeminiCalls(), 0, 'Gemini tidak boleh dipanggil jika reservasi gagal');
});

test('Route Handler ASLI: jika Gemini gagal total, baris reservasi di-refund', async () => {
  const deps = createMockDeps({
    async callGeminiText() {
      throw new Error('Gemini API 500 internal server error');
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
  });

  assert.equal(res.status, 500);
  assert.equal(deps._getUsageRecords().length, 1, 'Reservasi sempat dibuat di awal');
  assert.equal(deps._getUsageDeletions().length, 1, 'Reservasi harus di-refund/dihapus karena gagal');
});

test('Route Handler ASLI: stream dibatalkan di tengah: reservasi tetap ada dan kuota berkurang', async () => {
  let cancelHandler = null;
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      cancelHandler = handlers.onCancel;
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Chunk 1'));
          // Simulasi klien memutus koneksi sebelum close()
        },
      });
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'Apa itu DNA?' },
  });

  assert.equal(res.status, 200);

  // Batalkan stream
  if (cancelHandler) {
    await cancelHandler('Chunk 1', 20, 10);
  }

  // Baris reservasi tetap ada dan TIDAK di-refund
  assert.equal(deps._getUsageRecords().length, 1);
  assert.equal(deps._getUsageDeletions().length, 0);
  assert.equal(deps._getUsageUpdates().length, 1);
});

test('Route Handler ASLI: kegagalan simpan cache tetap mengembalikan hasil dan usage_log tetap tercatat', async () => {
  const deps = createMockDeps({
    async saveGeneration() {
      throw new Error('Supabase temporary database write glitch');
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    params: { style: 'singkat' },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.result.markdown, 'Ringkasan bab 1 dari Gemini');
  assert.equal(deps._getUsageRecords().length, 1);
  assert.equal(deps._getUsageUpdates().length, 1);
});

test('Route Handler ASLI: 30 permintaan paralel dengan batas kuota 5: tepat 5 yang lolos dan 25 ditolak 429', async () => {
  let atomicCount = 0;
  const LIMIT = 5;

  const deps = createMockDeps({
    dailyQuotaLimit: LIMIT,
    async reserveUsage(userId, feature, limit, tokensIn) {
      // Meniru pg_advisory_xact_lock (eksekusi serial atomik)
      if (atomicCount >= limit) {
        return { id: null, error: null };
      }
      atomicCount++;
      return { id: atomicCount, error: null };
    },
  });

  // Luncurkan 30 request serentak
  const requests = Array.from({ length: 30 }, (_, i) =>
    handleGenerate(deps, {
      moduleId: VALID_MODULE_ID,
      feature: 'summary',
      regenerate: true,
      params: { style: 'singkat', maxPoints: (i % 10) + 1 },
    })
  );

  const responses = await Promise.all(requests);
  const status200 = responses.filter((r) => r.status === 200).length;
  const status429 = responses.filter((r) => r.status === 429).length;

  assert.equal(status200, 5, 'Tepat 5 request yang harus lolos');
  assert.equal(status429, 25, '25 request lainnya harus ditolak dengan 429');
});

// ==================== 9. TEST PEMULIHAN & HARDENING STREAM & STRICT PARAMS ====================

test('Route Handler ASLI: stream selesai normal memperbarui usage_log dan menyimpan hasil {answer}/{markdown} ke cache', async () => {
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Ringkasan lengkap materi sel.'));
          if (handlers?.onBeforeClose) {
            await handlers.onBeforeClose('Ringkasan lengkap materi sel.', 100, 40);
          }
          ctrl.close();
        },
      });
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    stream: true,
    params: { style: 'singkat' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(res.headers.get('X-Cache'), 'MISS');

  // Baca seluruh isi stream
  const reader = res.body.getReader();
  let receivedText = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedText += decoder.decode(value);
  }

  assert.equal(receivedText, 'Ringkasan lengkap materi sel.');
  assert.equal(deps._getUsageUpdates().length, 1);
  assert.equal(deps._getUsageUpdates()[0].tokensIn, 100);
  assert.equal(deps._getUsageUpdates()[0].tokensOut, 40);

  // Verifikasi cache generations tersimpan dengan bentuk { markdown }
  const cacheMap = deps._getCacheMap();
  assert.equal(cacheMap.size, 1);
  const cachedItem = Array.from(cacheMap.values())[0];
  assert.deepEqual(cachedItem.result, { markdown: 'Ringkasan lengkap materi sel.' });
});

test('Route Handler ASLI: cache hit pada mode stream mengembalikan stream dengan header X-Cache: HIT dan teks identik', async () => {
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Jawaban awal'));
          if (handlers?.onBeforeClose) {
            await handlers.onBeforeClose('Jawaban awal', 50, 20);
          }
          ctrl.close();
        },
      });
    },
  });

  // Permintaan 1: Simpan ke cache
  await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'Apa fungsi nukleus?' },
  });

  // Permintaan 2: Cache HIT dalam mode stream
  const resHit = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'Apa fungsi nukleus?' },
  });

  assert.equal(resHit.status, 200);
  assert.equal(resHit.headers.get('X-Cache'), 'HIT');
  assert.equal(resHit.headers.get('Content-Type'), 'text/plain; charset=utf-8');

  // Baca stream cache hit
  const reader = resHit.body.getReader();
  let hitText = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hitText += decoder.decode(value);
  }

  assert.equal(hitText, 'Jawaban awal');
});

test('Route Handler ASLI: skema .strict() menolak params dengan kunci asing tidak diizinkan dengan 400', async () => {
  const deps = createMockDeps();

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    params: {
      style: 'singkat',
      kunci_asing_ilegal: 'hacker_payload',
      system_override: true,
    },
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error.includes('Objek params memuat kunci yang tidak diizinkan'));
  assert.equal(deps._getGeminiCalls(), 0);
  assert.equal(deps._getUsageRecords().length, 0);
});

test('Route Handler ASLI: stream yang terpotong karena batas waktu (deadline) TIDAK menyimpan cache ke generations', async () => {
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Paragraf 1 awal ringkasan...'));
          // Simulasi handler memanggil onPartial karena batas waktu tercapai
          if (handlers?.onPartial) {
            await handlers.onPartial('Paragraf 1 awal ringkasan...', 80, 20, 'deadline');
          }
          ctrl.enqueue(new TextEncoder().encode('\n\n[TRUNCATED: Batas waktu pemrosesan AI tercapai. Hasil terpotong.]'));
          ctrl.close();
        },
      });
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    stream: true,
    params: { style: 'singkat' },
  });

  assert.equal(res.status, 200);

  // Baca stream
  const reader = res.body.getReader();
  let text = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }

  assert.ok(text.includes('Paragraf 1'));
  assert.ok(text.includes('[TRUNCATED: Batas waktu'));

  // usage_log tetap diperbarui untuk token yang sempat terpakai
  assert.equal(deps._getUsageUpdates().length, 1);
  assert.equal(deps._getUsageUpdates()[0].tokensIn, 80);
  assert.equal(deps._getUsageUpdates()[0].tokensOut, 20);

  // Cache generations TIDAK BOLEH disimpan untuk teks parsial!
  const cacheMap = deps._getCacheMap();
  assert.equal(cacheMap.size, 0, 'generations cache harus kosong bila stream terpotong deadline');
});

test('Route Handler ASLI: stream yang mengalami error koneksi di tengah jalan TIDAK menyimpan cache ke generations', async () => {
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Jawaban separuh sebelum putus...'));
          // Simulasi handler memanggil onPartial karena error jaringan mid-stream
          if (handlers?.onPartial) {
            await handlers.onPartial('Jawaban separuh sebelum putus...', 60, 15, 'error');
          }
          ctrl.enqueue(new TextEncoder().encode('\n\n[TRUNCATED: Terjadi gangguan koneksi pemrosesan AI. Hasil terpotong.]'));
          ctrl.close();
        },
      });
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'Apa itu mitokondria?' },
  });

  assert.equal(res.status, 200);

  // Baca stream
  const reader = res.body.getReader();
  let text = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }

  assert.ok(text.includes('Jawaban separuh'));
  assert.ok(text.includes('[TRUNCATED: Terjadi gangguan koneksi'));

  // usage_log tetap diperbarui
  assert.equal(deps._getUsageUpdates().length, 1);
  assert.equal(deps._getUsageUpdates()[0].tokensIn, 60);
  assert.equal(deps._getUsageUpdates()[0].tokensOut, 15);

  // Cache generations TIDAK BOLEH disimpan untuk teks error mid-stream!
  const cacheMap = deps._getCacheMap();
  assert.equal(cacheMap.size, 0, 'generations cache harus kosong bila stream error di tengah jalan');
});

test('Route Handler ASLI: Permintaan POST /api/generate melebihi 64 KB ditolak dengan status 413', async () => {
  const deps = createMockDeps();

  // Buat string payload JSON berukuran > 64 KB (70 KB)
  const oversizedText = JSON.stringify({
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    params: {
      question: 'a'.repeat(70 * 1024),
    },
  });

  const res = await handleGenerate(deps, oversizedText);
  assert.equal(res.status, 413);
  const json = await res.json();
  assert.match(json.error, /melebihi batas maksimum/i);
  assert.equal(deps._getGeminiCalls(), 0);
  assert.equal(deps._getUsageRecords().length, 0);
});

// ==================== 12. TEST MODEL FALLBACK, NORMALISASI & STREAM MNEMONIC ====================

test('getModelCandidates: menyusun daftar kandidat model utama + fallback sehat Flash tanpa duplikasi', () => {
  const origModel = process.env.GEMINI_MODEL;
  const origFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  const origDisable = process.env.GEMINI_DISABLE_MODEL_FALLBACK;
  try {
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    delete process.env.GEMINI_FALLBACK_MODELS;
    delete process.env.GEMINI_DISABLE_MODEL_FALLBACK;

    const list = getModelCandidates();
    assert.equal(list[0], 'gemini-3.5-flash-lite');
    assert.ok(list.includes('gemini-3.1-flash-lite'));
    assert.ok(list.includes('gemini-3-flash-preview'));
    assert.ok(list.includes('gemini-3.6-flash'));
    assert.ok(list.includes('gemini-3.5-flash'));
    assert.equal(new Set(list).size, list.length);

    process.env.GEMINI_FALLBACK_MODELS = 'gemini-3.5-flash, gemini-3.1-flash-lite';
    const customList = getModelCandidates();
    assert.deepEqual(customList, [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.6-flash',
    ]);

    process.env.GEMINI_DISABLE_MODEL_FALLBACK = 'true';
    delete process.env.GEMINI_FALLBACK_MODELS;
    assert.deepEqual(getModelCandidates(), ['gemini-3.5-flash-lite']);
  } finally {
    if (origModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = origModel;
    if (origFallbacks === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = origFallbacks;
    if (origDisable === undefined) delete process.env.GEMINI_DISABLE_MODEL_FALLBACK;
    else process.env.GEMINI_DISABLE_MODEL_FALLBACK = origDisable;
  }
});

test('generate.ts -> formatFriendlyErrorMessage memetakan 503/high demand, 502/504, dan ZodError ke pesan ramah', () => {
  assert.match(
    formatFriendlyErrorMessage(new Error('got status: 503 Service Unavailable - high demand')),
    /lonjakan trafik sementara/i
  );
  assert.match(
    formatFriendlyErrorMessage(new Error('HTTP 504 Gateway Timeout')),
    /melewati batas waktu/i
  );
  const zodErr = new Error('Invalid input');
  zodErr.name = 'ZodError';
  assert.match(formatFriendlyErrorMessage(zodErr), /belum sesuai struktur/i);
  assert.match(
    formatFriendlyErrorMessage(new Error('Respons model kosong dari Gemini')),
    /belum sesuai struktur/i
  );
});

test('validators: normalisasi variasi format kuis, flashcard, dan esai tetap lolos sambil menjaga tingkat kesulitan ketat', () => {
  const rawQuiz = normalizeQuizPayload({
    questions: [
      {
        nomor: '1',
        pertanyaan: 'Mengapa pendekatan analisis studi kasus multi-variabel penting dalam evaluasi risiko kerja?',
        opsi: ['Opsi pertama yang singkat', 'Opsi kedua yang tepat', 'Opsi ketiga cukup jelas', 'Opsi keempat pembanding'],
        kunci: 'Opsi B.',
        penjelasan: 'Karena evaluasi risiko menuntut sintesis dampak silang antar unit sebelum menetapkan kontrol mitigasi.',
        bab: 'Bab 2',
        tingkat: 'Sulit',
      },
      {
        nomor: '2',
        pertanyaan: 'Apa kepanjangan K3 dalam konteks manajemen risiko kerja dasar?',
        opsi: ['Opsi A dasar', 'Opsi B dasar', 'Opsi C dasar', 'Opsi D dasar'],
        kunci: 'A',
        penjelasan: 'Keselamatan dan Kesehatan Kerja.',
        bab: 'Bab 1',
        tingkat: 'Mudah',
      },
    ],
  });
  assert.ok(rawQuiz && typeof rawQuiz === 'object');

  const validatedQuiz = validateAndSanitizeQuiz(rawQuiz, 'sulit');
  assert.equal(validatedQuiz.soal.length, 1);
  assert.equal(validatedQuiz.soal[0].kunci, 'B');
  assert.equal(validatedQuiz.soal[0].tingkat, 'sulit');

  const rawCards = normalizeFlashcardPayload({
    cards: [
      {
        front: 'Apa tujuan utama sistem pengendalian K3 terpadu?',
        back: 'Mencegah kecelakaan kerja dan penyakit akibat kerja secara sistematis dan terukur.',
        chapter: 'Bab 1',
        level: 'Mudah',
      },
    ],
  });
  assert.ok(rawCards && typeof rawCards === 'object');
  const validatedCards = validateAndSanitizeFlashcards(rawCards);
  assert.equal(validatedCards.kartu.length, 1);
  assert.equal(validatedCards.kartu[0].tingkat, 'mudah');

  const rawEssay = normalizeEssayEvalPayload({
    skor: '86',
    rincian: { ketepatan: '43', kelengkapan: '25', kejelasan: '18' },
    sudah_benar: 'Konsep inti sudah tepat',
    keliru: [],
    terlewat: ['Contoh penerapan lapangan'],
    jawaban_ideal: 'Jawaban ideal menjelaskan prinsip dan contoh nyata.',
    saran: 'Tambahkan studi kasus singkat.',
  });
  const validatedEssay = validateEssayEvaluation(rawEssay);
  assert.equal(validatedEssay.skor, 86);
  assert.equal(validatedEssay.sudah_benar.length, 1);
});

test('Route Handler ASLI: mnemonic mendukung mode streaming MISS dan HIT cache tanpa duplikasi kuota', async () => {
  const deps = createMockDeps({
    async callGeminiStream(opts, handlers) {
      assert.equal(opts.promptName, 'mnemonic');
      const fullText = '### Jembatan Keledai\n**K3** = Keselamatan, Kesehatan, Kerja.';
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode(fullText));
          if (handlers?.onBeforeClose) {
            await handlers.onBeforeClose(fullText, 50, 25);
          }
          ctrl.close();
        },
      });
    },
  });

  // 1. Streaming MISS
  const resMiss = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'mnemonic',
    stream: true,
    params: { topic: 'Prinsip K3' },
  });
  assert.equal(resMiss.status, 200);
  assert.equal(resMiss.headers.get('X-Cache'), 'MISS');
  assert.equal(await resMiss.text(), '### Jembatan Keledai\n**K3** = Keselamatan, Kesehatan, Kerja.');
  assert.equal(deps._getCacheMap().size, 1);

  // 2. Streaming HIT
  const resHit = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'mnemonic',
    stream: true,
    params: { topic: 'Prinsip K3' },
  });
  assert.equal(resHit.status, 200);
  assert.equal(resHit.headers.get('X-Cache'), 'HIT');
  assert.equal(await resHit.text(), '### Jembatan Keledai\n**K3** = Keselamatan, Kesehatan, Kerja.');
});

// ==================== 13. TEST KONSISTENSI JUMLAH SOAL KUIS (25 SOAL, TOP-UP & CACHE GUARD) ====================

test('splitIntoBalancedBatchCounts & isCacheCompleteForRequest mencegah batch timpang dan cache parsial', () => {
  assert.deepEqual(splitIntoBalancedBatchCounts(25, 5), [5, 5, 5, 5, 5]);
  assert.deepEqual(splitIntoBalancedBatchCounts(25, 7), [7, 6, 6, 6]);
  assert.deepEqual(splitIntoBalancedBatchCounts(15, 5), [5, 5, 5]);

  assert.equal(isCacheCompleteForRequest('quiz', { soal: new Array(5).fill({}) }, 25), false);
  assert.equal(isCacheCompleteForRequest('quiz', { soal: new Array(25).fill({}) }, 25), true);
  assert.equal(isCacheCompleteForRequest('flashcards', { kartu: new Array(3).fill({}) }, 10), false);
});

test('Route Handler ASLI: kuis 25 soal memulihkan batch gagal lewat top-up dan menolak/tidak menyimpan bila tetap hanya 5 soal', async () => {
  // Kasus A: 2 batch awal gagal sementara, putaran top-up menutup kekurangan hingga tepat 25 soal
  let callCounter = 0;
  const depsTopUp = createMockDeps({
    async callGeminiJson(opts) {
      callCounter++;
      const batchIdx = callCounter;
      if (batchIdx <= 2) {
        throw new Error('Simulasi timeout sementara pada batch awal');
      }
      const n = Number(opts.variables.jumlah) || 5;
      return {
        data: {
          soal: Array.from({ length: n }, (_, i) => ({
            nomor: i + 1,
            pertanyaan: `Pertanyaan unik batch ${batchIdx}-${i + 1} tentang struktur sel`,
            opsi: { A: 'Inti sel', B: 'Mitokondria', C: 'Ribosom', D: 'Lisosom' },
            kunci: 'A',
            penjelasan: 'Penjelasan ringkas.',
            penjelasan_modul: 'Dari modul.',
            penjelasan_luar: 'Dari luar.',
            sumber_penjelasan: 'keduanya',
            bab: 'Bab 1',
            tingkat: 'sedang',
          })),
        },
        tokensIn: 50,
        tokensOut: 40,
      };
    },
  });

  const resFull = await handleGenerate(depsTopUp, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: { count: 25, difficulty: 'sedang', explanationMode: 'keduanya' },
  });
  assert.equal(resFull.status, 200);
  const jsonFull = await resFull.json();
  assert.equal(jsonFull.result.soal.length, 25);
  assert.equal(jsonFull.result.soal[24].nomor, 25);
  assert.equal(depsTopUp._getCacheMap().size, 1, 'Hasil 25 soal penuh harus disimpan ke cache');

  // Kasus B: hanya 5 soal terkumpul dari permintaan 25 soal -> harus gagal (refund kuota) dan TIDAK meracuni cache
  let onlyFirst = true;
  const depsPartialFail = createMockDeps({
    async callGeminiJson(opts) {
      if (onlyFirst) {
        onlyFirst = false;
        const n = Number(opts.variables.jumlah) || 5;
        return {
          data: {
            soal: Array.from({ length: n }, (_, i) => ({
              nomor: i + 1,
              pertanyaan: `Soal tunggal ${i + 1}`,
              opsi: { A: 'Opsi A', B: 'Opsi B', C: 'Opsi C', D: 'Opsi D' },
              kunci: 'B',
              penjelasan: 'Penjelasan.',
              bab: 'Bab 1',
              tingkat: 'sedang',
            })),
          },
          tokensIn: 40,
          tokensOut: 30,
        };
      }
      throw new Error('503 Service Unavailable');
    },
  });

  const resPartial = await handleGenerate(depsPartialFail, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: { count: 25, difficulty: 'sedang', explanationMode: 'keduanya' },
  });
  assert.equal(resPartial.status, 500);
  const jsonPartial = await resPartial.json();
  assert.match(jsonPartial.error, /5 dari 25 soal/);
  assert.equal(depsPartialFail._getUsageDeletions().length, 1, 'Kuota harus di-refund');
  assert.equal(depsPartialFail._getCacheMap().size, 0, 'Hasil 5 soal tidak boleh masuk cache count=25');
});

test('Route Handler ASLI: cache lama yang terlanjur berisi 5 soal untuk permintaan 25 soal dilewati & diperbarui otomatis', async () => {
  let seq = 0;
  const deps = createMockDeps({
    async callGeminiJson(opts) {
      seq++;
      const n = Number(opts.variables.jumlah) || 5;
      return {
        data: {
          soal: Array.from({ length: n }, (_, i) => ({
            nomor: i + 1,
            pertanyaan: `Soal lengkap pembaruan ${seq}-${i + 1}`,
            opsi: { A: 'A1', B: 'B1', C: 'C1', D: 'D1' },
            kunci: 'C',
            penjelasan: 'Pembahasan lengkap.',
            bab: 'Bab 1',
            tingkat: 'sedang',
          })),
        },
        tokensIn: 30,
        tokensOut: 30,
      };
    },
  });

  // Suntik cache lama rusak: hanya 5 soal tersimpan walau permintaan count=25
  const normalizedObj = {
    chapterName: 'semua',
    chapterPosition: 'all',
    count: 25,
    difficulty: 'sedang',
    explanationMode: 'modul',
    feature: 'quiz',
    maxPoints: 8,
    style: 'singkat',
  };
  const crypto = await import('crypto');
  const paramsHash = crypto.createHash('sha256').update(JSON.stringify(normalizedObj)).digest('hex');
  await deps.saveGeneration({
    user_id: 'user-123',
    module_id: VALID_MODULE_ID,
    feature: 'quiz',
    params_hash: paramsHash,
    prompt_version: deps.promptVersion,
    result: {
      soal: Array.from({ length: 5 }, (_, i) => ({
        nomor: i + 1,
        pertanyaan: `Cache rusak ${i + 1}`,
        opsi: { A: '1', B: '2', C: '3', D: '4' },
        kunci: 'A',
        penjelasan: 'Pendek.',
      })),
    },
    tokens_in: 10,
    tokens_out: 10,
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: { count: 25, difficulty: 'sedang', explanationMode: 'modul' },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.cached, false, 'Cache 5 soal harus dilewati untuk request 25 soal');
  assert.equal(json.result.soal.length, 25);
});

// ==================== 14. TEST CLIENT MICRO-BATCH TOKEN, EXCERPT & MODEL HEALTH COOLDOWN ====================

test('markModelDegraded: memindahkan model yang baru gagal ke urutan terakhir selama cooldown', () => {
  const origModel = process.env.GEMINI_MODEL;
  try {
    resetModelHealthForTesting();
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    const before = getModelCandidates();
    assert.equal(before[0], 'gemini-3.5-flash-lite');

    markModelDegraded('gemini-3.5-flash-lite', 60_000);
    const after = getModelCandidates();
    assert.equal(after[0], 'gemini-3.1-flash-lite');
    assert.equal(after[after.length - 1], 'gemini-3.5-flash-lite');
  } finally {
    resetModelHealthForTesting();
    if (origModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = origModel;
  }
});

test('buildBalancedModuleExcerpt: membatasi modul raksasa ke maxChars sambil menjaga tiap bab terwakili', () => {
  const hugeChunks = [
    { chapter_title: 'Bab 1 Pendahuluan', content: 'A'.repeat(30000) },
    { chapter_title: 'Bab 2 Inti Materi', content: 'B'.repeat(30000) },
    { chapter_title: 'Bab 3 Penutup', content: 'C'.repeat(30000) },
  ];
  const excerpt = buildBalancedModuleExcerpt(hugeChunks, 12000);
  assert.ok(excerpt.length <= 12000);
  assert.ok(excerpt.includes('Bab 1 Pendahuluan'));
  assert.ok(excerpt.includes('Bab 2 Inti Materi'));
  assert.ok(excerpt.includes('Bab 3 Penutup'));
});

test('Route Handler ASLI: micro-batch kuis dengan batchToken memakai 1 kuota, menolak token palsu 403', async () => {
  let seq = 0;
  const deps = createMockDeps({
    async callGeminiJson(opts) {
      seq++;
      const n = Number(opts.variables.jumlah) || 5;
      return {
        data: {
          soal: Array.from({ length: n }, (_, i) => ({
            nomor: i + 1,
            pertanyaan: `Soal micro batch ${seq}-${i + 1}`,
            opsi: { A: '1', B: '2', C: '3', D: '4' },
            kunci: 'A',
            penjelasan: 'Penjelasan singkat.',
            bab: 'Bab 1',
            tingkat: 'sedang',
          })),
        },
        tokensIn: 20,
        tokensOut: 20,
      };
    },
  });

  // Batch 0 memesan kuota 1 kali & menerbitkan batchToken
  const res0 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: { count: 5, difficulty: 'sedang', explanationMode: 'modul', batchIndex: 0, batchTotal: 5 },
  });
  assert.equal(res0.status, 200);
  const json0 = await res0.json();
  assert.ok(json0.batchToken);
  assert.equal(deps._getUsageRecords().length, 1);

  const checkValid = verifyBatchToken(json0.batchToken, 'user-123', VALID_MODULE_ID, 8);
  assert.equal(checkValid.valid, true);
  assert.equal(verifyBatchToken(json0.batchToken, 'other-user', VALID_MODULE_ID, 8).valid, false);
  const forged = signBatchToken('other-user', VALID_MODULE_ID, 'log-1', 8);
  assert.equal(verifyBatchToken(forged, 'user-123', VALID_MODULE_ID, 8).valid, false);

  // Batch 1 memakai batchToken -> TIDAK mengurangi kuota lagi
  const res1 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: {
      count: 5,
      difficulty: 'sedang',
      explanationMode: 'modul',
      batchIndex: 1,
      batchTotal: 5,
      batchToken: json0.batchToken,
      excludeQuestions: ['Soal micro batch 1-1'],
    },
  });
  assert.equal(res1.status, 200);
  assert.equal(deps._getUsageRecords().length, 1, 'Batch lanjutan tidak boleh memotong kuota kedua kali');

  // Batch lanjutan dengan token palsu -> ditolak 403
  const resForged = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'quiz',
    params: {
      count: 5,
      difficulty: 'sedang',
      explanationMode: 'modul',
      batchIndex: 2,
      batchTotal: 5,
      batchToken: 'palsu.8.deadbeef',
    },
  });
  assert.equal(resForged.status, 403);
});
