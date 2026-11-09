import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGenerate, QA_FULL_MODULE_CHAR_LIMIT } from '../src/lib/gemini/handler.ts';

const VALID_MODULE_ID = '11111111-2222-3333-4444-555555555555';

function createQaMockDeps(overrides = {}) {
  const cacheMap = new Map();
  let capturedStreamVariables = null;

  const baseDeps = {
    async getAuthUser() {
      return { user: { id: 'user-qa-123' }, error: null };
    },
    async getModule(moduleId) {
      return {
        data: { id: moduleId, title: 'Modul Besar SMK3', status: 'ready' },
        error: null,
      };
    },
    async getCachedGeneration(userId, moduleId, feature, paramsHash, promptVersion) {
      const key = `${userId}:${moduleId}:${feature}:${paramsHash}:${promptVersion}`;
      const cached = cacheMap.get(key);
      return { data: cached || null, error: null };
    },
    async saveGeneration(record) {
      const key = `${record.user_id}:${record.module_id}:${record.feature}:${record.params_hash}:${record.prompt_version}`;
      cacheMap.set(key, record);
      return { data: record, error: null };
    },
    async getModuleChunks(moduleId, chapterPosition) {
      return { data: [], error: null };
    },
    async reserveUsage(userId, feature, limit, tokensIn) {
      return { id: 'reserve-qa-log-1', error: null };
    },
    async updateUsageLog(id, tokensIn, tokensOut) {
      return { data: { id, tokensIn, tokensOut }, error: null };
    },
    async deleteUsageLog(id) {
      return { data: { id }, error: null };
    },
    async callGeminiStream(options, handlers) {
      capturedStreamVariables = options.variables;
      return new ReadableStream({
        async start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Jawaban tutor dari materi modul.'));
          if (handlers?.onBeforeClose) {
            await handlers.onBeforeClose('Jawaban tutor dari materi modul.', 100, 30);
          }
          ctrl.close();
        },
      });
    },
    async callGeminiJson() {
      throw new Error('Not implemented for QA');
    },
    dailyQuotaLimit: 30,
    promptVersion: 2,
    _getCapturedVariables: () => capturedStreamVariables,
    _getCacheMap: () => cacheMap,
  };

  return { ...baseDeps, ...overrides };
}

// ---------------------- TEST A: Modul Besar + Pertanyaan Relevan ----------------------
test('QA Handler: (a) Modul besar (> 60k chars) + QA question -> bab relevan terpilih dan header X-Used-Chapters terisi', async () => {
  // Buat chunks yang total karakternya melebihi 60.000 karakter
  const bigChunks = [
    { position: 1, chapter_title: 'Kata Pengantar', content: 'Pengantar materi '.repeat(2000) }, // ~34.000 chars
    { position: 2, chapter_title: 'Bab I Pendahuluan', content: 'Latar belakang '.repeat(2000) }, // ~30.000 chars -> Total > 64k
    { position: 3, chapter_title: 'Bab II Teori Pengendalian Risiko', content: 'Hierarki pengendalian risiko K3 meliputi eliminasi dan substitusi. '.repeat(500) },
    { position: 4, chapter_title: 'Bab III Evaluasi K3', content: 'Evaluasi audit SMK3. '.repeat(500) },
  ];

  const deps = createQaMockDeps({
    async getModuleChunks() {
      return { data: bigChunks, error: null };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: {
      question: 'bagaimana hierarki pengendalian risiko k3',
    },
  });

  assert.equal(res.status, 200);

  // Header X-Used-Chapters harus terisi dengan encodeURIComponent
  const rawHeader = res.headers.get('X-Used-Chapters');
  assert.ok(rawHeader, 'Header X-Used-Chapters wajib ada');

  const decodedChapters = JSON.parse(decodeURIComponent(rawHeader));
  assert.ok(Array.isArray(decodedChapters));
  assert.ok(decodedChapters.length >= 1 && decodedChapters.length <= 4);

  // Bab 3 (judul "Teori Pengendalian Risiko") harus terpilih
  const positions = decodedChapters.map((c) => c.position);
  assert.ok(positions.includes(3), 'Bab 3 harus terpilih karena cocok dengan kata kunci');

  // Variabel modul yang dikirim ke Gemini Stream harus memuat isi Bab 3
  const captured = deps._getCapturedVariables();
  assert.ok(captured.modul.includes('Teori Pengendalian Risiko'));
});

// ---------------------- TEST B: Modul Kecil (<= 60k chars) ----------------------
test('QA Handler: (b) Modul kecil (<= 60.000 chars) -> SELURUH modul dikirim tanpa pemfilteran bab', async () => {
  // Total karakter ~15.000 (jauh di bawah QA_FULL_MODULE_CHAR_LIMIT 60.000)
  const smallChunks = [
    { position: 1, chapter_title: 'Bab 1 Pendahuluan', content: 'Dasar SMK3 '.repeat(500) },
    { position: 2, chapter_title: 'Bab 2 Prinsip Utama', content: '5 Prinsip K3 '.repeat(500) },
    { position: 3, chapter_title: 'Bab 3 Kesimpulan', content: 'Penutup materi '.repeat(500) },
  ];

  const deps = createQaMockDeps({
    async getModuleChunks() {
      return { data: smallChunks, error: null };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: {
      question: 'apa saja 5 prinsip k3',
    },
  });

  assert.equal(res.status, 200);

  const rawHeader = res.headers.get('X-Used-Chapters');
  assert.ok(rawHeader);
  const usedChapters = JSON.parse(decodeURIComponent(rawHeader));

  // Seluruh modul dikirim dalam format ringkas { mode: 'all', count: 3 } untuk mencegah header bloat
  assert.deepEqual(usedChapters, { mode: 'all', count: 3 });

  const captured = deps._getCapturedVariables();
  assert.ok(captured.modul.includes('Bab 1 Pendahuluan'));
  assert.ok(captured.modul.includes('Bab 2 Prinsip Utama'));
  assert.ok(captured.modul.includes('Bab 3 Kesimpulan'));
});

// ---------------------- TEST C: Cache Hit Mode Stream Membawa Header Bab ----------------------
test('QA Handler: (c) Cache hit pada mode stream tetap membawa header X-Used-Chapters', async () => {
  const smallChunks = [
    { position: 1, chapter_title: 'Bab 1', content: 'Konten 1' },
    { position: 2, chapter_title: 'Bab 2', content: 'Konten 2' },
  ];

  const deps = createQaMockDeps({
    async getModuleChunks() {
      return { data: smallChunks, error: null };
    },
  });

  // Panggilan 1 (Live call: simpan ke cache)
  const res1 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'pertanyaan pertama' },
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('X-Cache'), 'MISS');

  // Panggilan 2 (Cache hit: pastikan header X-Used-Chapters tetap ada dan X-Cache: HIT)
  const res2 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: { question: 'pertanyaan pertama' },
  });

  assert.equal(res2.status, 200);
  assert.equal(res2.headers.get('X-Cache'), 'HIT');
  const cacheHitHeader = res2.headers.get('X-Used-Chapters');
  assert.ok(cacheHitHeader, 'Header X-Used-Chapters harus tetap ada saat Cache Hit');

  const decoded = JSON.parse(decodeURIComponent(cacheHitHeader));
  assert.deepEqual(decoded, { mode: 'all', count: 2 });
});

// ---------------------- TEST D: Modul Besar Tanpa Kata Kunci Cocok -> Fallback ke Pengetahuan Umum / Referensi Luar ----------------------
test('QA Handler: (d) Modul besar + pertanyaan di luar modul -> AI tetap menjawab via pengetahuan umum dengan header X-Used-Chapters mode: external', async () => {
  const bigChunks = [
    { position: 1, chapter_title: 'Bab I Komitmen', content: 'Kebijakan K3 '.repeat(2000) }, // ~26.000 chars
    { position: 2, chapter_title: 'Bab II Perencanaan', content: 'Identifikasi bahaya '.repeat(2000) }, // ~38.000 chars -> Total > 64k
    { position: 3, chapter_title: 'Bab III Penerapan', content: 'Pengoperasian sistem '.repeat(1000) },
  ];

  let reserveCalled = false;
  const deps = createQaMockDeps({
    async getModuleChunks() {
      return { data: bigChunks, error: null };
    },
    async reserveUsage(...args) {
      reserveCalled = true;
      return { id: 'reserve-qa-log-1', error: null };
    },
  });

  const res = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'qa',
    stream: true,
    params: {
      question: 'apa hukum newton tentang gravitasi',
    },
  });

  // Wajib berhasil dengan status 200 (tidak ditolak)
  assert.equal(res.status, 200);
  assert.equal(reserveCalled, true, 'reserveUsage wajib dipanggil karena AI memproses jawaban');

  // Header X-Used-Chapters harus mengindikasikan mode: 'external'
  const rawHeader = res.headers.get('X-Used-Chapters');
  assert.ok(rawHeader, 'Header X-Used-Chapters wajib ada');
  const decodedMode = JSON.parse(decodeURIComponent(rawHeader));
  assert.deepEqual(decodedMode, { mode: 'external' });

  // Teks modul yang dikirim ke Gemini memuat daftar bab modul dan instruksi fallback
  const captured = deps._getCapturedVariables();
  assert.ok(captured.modul.includes('Bab 1: Bab I Komitmen'));
  assert.ok(captured.modul.includes('pengetahuan umum'));
});
