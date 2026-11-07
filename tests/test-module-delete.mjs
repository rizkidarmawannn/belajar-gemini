import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDeleteModule } from '../src/lib/learning/module-delete-handler.ts';
import { StrictParamsSchema } from '../src/lib/gemini/handler.ts';
import { handleSaveQuizAttempt } from '../src/lib/learning/quiz-handler.ts';

const MOCK_USER_A = { id: 'user-aaa-111', email: 'user.a@test.com' };
const MOCK_USER_B = { id: 'user-bbb-222', email: 'user.b@test.com' };
const MOCK_MODULE_ID = 'mod-123-456';

// ==========================================
// 1. PENGUJIAN HAPUS MODUL
// ==========================================

test('Delete Module: Pengguna belum login ditolak dengan status 401', async () => {
  const deps = {
    getAuthUser: async () => ({ user: null, error: new Error('Sesi kedaluwarsa') }),
    getModule: async () => ({ data: null, error: null }),
    deleteStorageFile: async () => ({ error: null }),
    deleteModuleRow: async () => ({ error: null }),
  };

  const res = await handleDeleteModule(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.match(json.error, /masuk terlebih dahulu/i);
});

test('Delete Module: Modul milik pengguna lain ditolak dengan status 404', async () => {
  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_B, error: null }),
    getModule: async () => ({ data: null, error: new Error('Row not found') }),
    deleteStorageFile: async () => ({ error: null }),
    deleteModuleRow: async () => ({ error: null }),
  };

  const res = await handleDeleteModule(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.match(json.error, /tidak ditemukan/i);
});

test('Delete Module: Modul valid berhasil menghapus berkas storage dan baris database', async () => {
  let storageDeletedPath = '';
  let dbDeletedModuleId = '';

  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async (id, uid) => ({
      data: {
        id,
        user_id: uid,
        title: 'Modul Biologi',
        storage_path: `${uid}/file-biologi.pdf`,
      },
      error: null,
    }),
    deleteStorageFile: async (path) => {
      storageDeletedPath = path;
      return { error: null };
    },
    deleteModuleRow: async (id) => {
      dbDeletedModuleId = id;
      return { error: null };
    },
  };

  const res = await handleDeleteModule(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(storageDeletedPath, `${MOCK_USER_A.id}/file-biologi.pdf`);
  assert.equal(dbDeletedModuleId, MOCK_MODULE_ID);
});

test('Delete Module: Modul tanpa storage_path tetap berhasil menghapus baris database', async () => {
  let dbDeleted = false;

  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async (id, uid) => ({
      data: {
        id,
        user_id: uid,
        title: 'Modul Catatan Manual',
        storage_path: null,
      },
      error: null,
    }),
    deleteStorageFile: async () => ({ error: null }),
    deleteModuleRow: async () => {
      dbDeleted = true;
      return { error: null };
    },
  };

  const res = await handleDeleteModule(deps, MOCK_MODULE_ID);
  assert.equal(res.status, 200);
  assert.equal(dbDeleted, true);
});

// ==========================================
// 2. PENGUJIAN SOAL SAMPAI 100 BUTIR
// ==========================================

test('StrictParamsSchema: Menerima count = 20, 25, 50, dan 100', () => {
  const counts = [20, 25, 50, 100];
  for (const c of counts) {
    const parsed = StrictParamsSchema.parse({ count: c });
    assert.equal(parsed.count, c);
  }
});

test('StrictParamsSchema: Menolak count > 100', () => {
  assert.throws(() => {
    StrictParamsSchema.parse({ count: 101 });
  });
});

test('Quiz Attempts POST: Berhasil menyimpan percobaan kuis dengan 100 butir soal', async () => {
  let savedAttempt = null;

  const deps = {
    getAuthUser: async () => ({ user: MOCK_USER_A, error: null }),
    getModule: async () => ({ data: { id: MOCK_MODULE_ID }, error: null }),
    getAttempts: async () => ({ data: [], error: null }),
    insertAttempt: async (row) => {
      savedAttempt = row;
      return { data: { id: 'attempt-100', ...row }, error: null };
    },
  };

  const attempt100 = {
    score: 95,
    total: 100,
    answers: Array.from({ length: 100 }, (_, i) => ({
      nomor: i + 1,
      pertanyaan: `Pertanyaan evaluasi butir ke-${i + 1}`,
      userAnswer: 'A',
      kunci: 'A',
      isCorrect: true,
      penjelasan: `Pembahasan rinci untuk nomor ${i + 1}`,
    })),
  };

  const res = await handleSaveQuizAttempt(deps, MOCK_MODULE_ID, attempt100);
  assert.equal(res.status, 200);
  assert.ok(savedAttempt);
  assert.equal(savedAttempt.total, 100);
  assert.equal(savedAttempt.score, 95);
  assert.equal(savedAttempt.answers.length, 100);
});
