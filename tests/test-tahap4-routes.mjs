import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetFlashcards,
  handleSaveFlashcards,
  handleReviewFlashcard,
  normalizeFrontText,
  MAX_FLASHCARDS_PAYLOAD_BYTES,
} from '../src/lib/learning/flashcards-handler.ts';
import {
  handleGetQuizAttempts,
  handleSaveQuizAttempt,
  MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES,
} from '../src/lib/learning/quiz-handler.ts';

const MOCK_USER_A = { id: 'user-aaa-111', email: 'user.a@test.com' };
const MOCK_USER_B = { id: 'user-bbb-222', email: 'user.b@test.com' };
const MOCK_MODULE_ID = 'mod-123-456';

// ==========================================
// 1. PENGUJIAN ROUTE FLASHCARDS
// ==========================================

test('Flashcards GET: Pengguna belum login ditolak dengan 401', async () => {
  const deps = {
    getAuthUser: async () => ({ user: null, error: new Error('No session') }),
    getModule: async () => ({ data: null, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const res = await handleGetFlashcards(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.match(json.error, /masuk terlebih dahulu/i);
});

test('Flashcards GET: Modul milik pengguna lain ditolak dengan 404', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_B, error: null }),
    getModule: async () => ({ data: null, error: null }), // modul tidak ditemukan untuk user B
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const res = await handleGetFlashcards(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.match(json.error, /bukan milik Anda/i);
});

test('Flashcards POST: Permintaan dengan jumlah kartu melebihi 30 kartu ditolak 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const excessiveCards = Array.from({ length: 31 }, (_, i) => ({
    front: `Istilah ${i + 1}`,
    back: `Penjelasan ${i + 1}`,
  }));

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, { cards: excessiveCards });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /tidak valid/i);
});

test('Flashcards POST: Teks depan melebihi 300 karakter ditolak 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const longFrontCards = [
    {
      front: 'A'.repeat(301),
      back: 'Penjelasan valid',
    },
  ];

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, { cards: longFrontCards });
  assert.equal(res.status, 400);
});

test('Flashcards POST: Teks belakang melebihi 600 karakter ditolak 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const longBackCards = [
    {
      front: 'Istilah Valid',
      back: 'B'.repeat(601),
    },
  ];

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, { cards: longBackCards });
  assert.equal(res.status, 400);
});

test('Flashcards POST: Deduplikasi kartu per modul (kartu dengan teks depan sama diabaikan)', async () => {
  let insertedRows = [];
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({
      data: [
        { front: 'Apa itu SMK3?' }, // sudah ada di DB
        { front: 'Hierarki Pengendalian Risiko' },
      ],
      error: null,
    }),
    insertCards: async (rows) => {
      insertedRows = rows;
      return { data: rows, error: null };
    },
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const inputCards = [
    { front: 'apa itu smk3??', back: 'Definisi duplikat' }, // duplikat DB case-insensitive & punctuation
    { front: 'Hierarki Pengendalian Risiko!', back: 'Definisi duplikat 2' },
    { front: 'Elemen 12 SMK3', back: 'Elemen baru yang unik' }, // baru
    { front: 'elemen 12 smk3', back: 'Duplikat internal batch' }, // duplikat di batch yg sama
  ];

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, { cards: inputCards });
  assert.equal(res.status, 200);
  const json = await res.json();

  // Hanya 1 kartu unik yang lolos
  assert.equal(json.saved, 1);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].front, 'Elemen 12 SMK3');
});

test('Flashcards POST: Format kartu AI dalam bahasa Indonesia (depan, belakang, bab, tingkat) berhasil diterima dan disimpan', async () => {
  let insertedRows = [];
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async (rows) => {
      insertedRows = rows;
      return { data: rows, error: null };
    },
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const indonesianCards = [
    {
      depan: 'SMK3',
      belakang: 'Sistem Manajemen Keselamatan dan Kesehatan Kerja',
      bab: 'Bab 1',
      tingkat: 'sedang',
    },
  ];

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, { cards: indonesianCards });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.saved, 1);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].front, 'SMK3');
  assert.equal(insertedRows[0].back, 'Sistem Manajemen Keselamatan dan Kesehatan Kerja');
  assert.equal(insertedRows[0].chapter, 'Bab 1');
  assert.equal(insertedRows[0].level, 'sedang');
});

test('Flashcards PATCH: Update review kartu "hafal" menaikkan level kotak Leitner dan memperpanjang next_review_at', async () => {
  let updatedRecord = null;
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async (cardId) => ({
      data: { id: cardId, box: 1 }, // saat ini di box 1
      error: null,
    }),
    updateCardReview: async (cardId, box, nextReview, lastResult) => {
      updatedRecord = { cardId, box, nextReview, lastResult };
      return { data: updatedRecord, error: null };
    },
  };

  const res = await handleReviewFlashcard(deps, MOCK_MODULE_ID, {
    cardId: 'b0e008df-22d7-4638-a28c-d4ea31189d2a',
    result: 'hafal',
  });

  assert.equal(res.status, 200);
  assert.equal(updatedRecord.box, 2); // Naik dari box 1 ke box 2
  assert.equal(updatedRecord.lastResult, 'hafal');
});

test('Flashcards PATCH: Update review kartu "belum" mengembalikan kartu ke kotak 1', async () => {
  let updatedRecord = null;
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async (cardId) => ({
      data: { id: cardId, box: 3 }, // saat ini di box 3
      error: null,
    }),
    updateCardReview: async (cardId, box, nextReview, lastResult) => {
      updatedRecord = { cardId, box, nextReview, lastResult };
      return { data: updatedRecord, error: null };
    },
  };

  const res = await handleReviewFlashcard(deps, MOCK_MODULE_ID, {
    cardId: 'b0e008df-22d7-4638-a28c-d4ea31189d2a',
    result: 'belum',
  });

  assert.equal(res.status, 200);
  assert.equal(updatedRecord.box, 1); // Turun kembali ke box 1
  assert.equal(updatedRecord.lastResult, 'belum');
});

test('Flashcards PATCH: Percobaan manipulasi box atau next_review_at oleh klien ditolak dengan status 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const res = await handleReviewFlashcard(deps, MOCK_MODULE_ID, {
    cardId: 'b0e008df-22d7-4638-a28c-d4ea31189d2a',
    result: 'hafal',
    box: 4, // Upaya injeksi manipulasi box dari sisi klien
    next_review_at: '2099-01-01T00:00:00.000Z',
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /tidak valid/i);
});

// ==========================================
// 2. PENGUJIAN ROUTE QUIZ ATTEMPTS
// ==========================================

test('Quiz Attempts GET: Pengguna belum login ditolak dengan 401', async () => {
  const deps = {
    getAuthUser: async () => ({ user: null, error: new Error('No session') }),
    getModule: async () => ({ data: null, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const res = await handleGetQuizAttempts(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 401);
});

test('Quiz Attempts GET: Modul milik pengguna lain ditolak dengan 404', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_B, error: null }),
    getModule: async () => ({ data: null, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const res = await handleGetQuizAttempts(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 404);
});

test('Quiz Attempts POST: Skor lebih tinggi dari total soal ditolak dengan 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const invalidAttempt = {
    score: 10,
    total: 5, // score 10 > total 5 tidak mungkin valid
    answers: [
      {
        nomor: 1,
        pertanyaan: 'Soal 1',
        userAnswer: 'A',
        kunci: 'A',
        isCorrect: true,
      },
    ],
  };

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, invalidAttempt);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.match(json.error, /tidak valid/i);
});

test('Quiz Attempts POST: Total soal lebih dari 50 butir ditolak dengan 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const invalidAttempt = {
    score: 40,
    total: 51,
    answers: [
      {
        nomor: 1,
        pertanyaan: 'Soal 1',
        userAnswer: 'A',
        kunci: 'A',
        isCorrect: true,
      },
    ],
  };

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, invalidAttempt);
  assert.equal(res.status, 400);
});

test('Quiz Attempts POST: Pertanyaan melebihi 500 karakter ditolak dengan 400', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const invalidAttempt = {
    score: 1,
    total: 1,
    answers: [
      {
        nomor: 1,
        pertanyaan: 'X'.repeat(501),
        userAnswer: 'A',
        kunci: 'A',
        isCorrect: true,
      },
    ],
  };

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, invalidAttempt);
  assert.equal(res.status, 400);
});

test('Quiz Attempts POST: Percobaan kuis yang valid berhasil disimpan', async () => {
  let savedData = null;
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async (row) => {
      savedData = { id: 'attempt-uuid-777', ...row };
      return { data: savedData, error: null };
    },
  };

  const validAttempt = {
    score: 4,
    total: 5,
    answers: [
      {
        nomor: 1,
        pertanyaan: 'Apa dasar hukum penerapan SMK3 di Indonesia?',
        userAnswer: 'A',
        kunci: 'A',
        isCorrect: true,
        penjelasan: 'PP No. 50 Tahun 2012 mengatur secara khusus tentang penerapan SMK3.',
      },
    ],
  };

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, validAttempt);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.attempt.score, 4);
  assert.equal(json.attempt.total, 5);
  assert.equal(savedData.user_id, MOCK_USER_A.id);
});

// ==========================================
// 3. PENGUJIAN BATAS UKURAN PAYLOAD (413)
// ==========================================

test('Flashcards POST: Payload string melebihi 64 KB ditolak dengan status 413 sebelum JSON.parse & Zod', async () => {
  let authCalled = false;
  const deps = {
    getAuthUser: async () => {
      authCalled = true;
      return { user: MOCK_USER_A, error: null };
    },
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const oversizedBody = JSON.stringify({
    cards: [
      {
        front: 'A'.repeat(70 * 1024),
        back: 'B',
      },
    ],
  });

  const res = await handleSaveFlashcards(deps, MOCK_MODULE_ID, oversizedBody);
  assert.equal(res.status, 413);
  const json = await res.json();
  assert.match(json.error, /melebihi batas maksimum/i);
  assert.equal(authCalled, false, 'Auth dan DB tidak boleh dipanggil saat payload ditolak 413');
});

test('Flashcards PATCH (Review): Payload string melebihi 64 KB ditolak dengan status 413', async () => {
  let authCalled = false;
  const deps = {
    getAuthUser: async () => {
      authCalled = true;
      return { user: MOCK_USER_A, error: null };
    },
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getExistingCards: async () => ({ data: [], error: null }),
    insertCards: async () => ({ data: [], error: null }),
    getCurrentCard: async () => ({ data: null, error: null }),
    updateCardReview: async () => ({ data: null, error: null }),
  };

  const oversizedBody = JSON.stringify({
    cardId: 'a'.repeat(70 * 1024),
    result: 'hafal',
  });

  const res = await handleReviewFlashcard(deps, MOCK_MODULE_ID, oversizedBody);
  assert.equal(res.status, 413);
  const json = await res.json();
  assert.match(json.error, /melebihi batas maksimum/i);
  assert.equal(authCalled, false);
});

test('Quiz Attempts POST: Payload string melebihi 128 KB ditolak dengan status 413 sebelum JSON.parse & Zod', async () => {
  let authCalled = false;
  const deps = {
    getAuthUser: async () => {
      authCalled = true;
      return { user: MOCK_USER_A, error: null };
    },
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async () => ({ data: null, error: null }),
  };

  const oversizedBody = JSON.stringify({
    score: 10,
    total: 10,
    answers: Array.from({ length: 50 }, (_, i) => ({
      nomor: i + 1,
      pertanyaan: 'X'.repeat(3000), // Total > 150 KB
      userAnswer: 'A',
      kunci: 'A',
      isCorrect: true,
      penjelasan: 'P'.repeat(500),
    })),
  });

  assert.ok(Buffer.byteLength(oversizedBody, 'utf-8') > MAX_QUIZ_ATTEMPT_PAYLOAD_BYTES);

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, oversizedBody);
  assert.equal(res.status, 413);
  const json = await res.json();
  assert.match(json.error, /melebihi batas maksimum/i);
  assert.equal(authCalled, false, 'Auth dan DB tidak boleh dipanggil saat payload ditolak 413');
});
