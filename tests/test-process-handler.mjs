import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProcessModule } from '../src/lib/parsers/process-handler.ts';

const USER_ALICE = { id: '11111111-aaaa-bbbb-cccc-111111111111' };
const USER_BOB = { id: '22222222-aaaa-bbbb-cccc-222222222222' };
const MODULE_ID = '33333333-aaaa-bbbb-cccc-333333333333';

function createProcessMockDeps(overrides = {}) {
  let downloadCalled = false;
  let deleteCalled = false;
  let insertCalled = false;
  let statusUpdates = [];

  const baseDeps = {
    async getAuthUser() {
      return { user: USER_ALICE, error: null };
    },
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_ALICE.id,
          title: 'Modul Biologi K3',
          storage_path: `${USER_ALICE.id}/valid-file.txt`,
          mime_type: 'text/plain',
          status: 'uploaded',
        },
        error: null,
      };
    },
    async updateModuleStatus(id, status, errorMessage) {
      statusUpdates.push({ id, status, errorMessage });
      return { data: { id, status }, error: null };
    },
    async downloadFile(storagePath) {
      downloadCalled = true;
      const fakeBlob = new Blob(['BAB I PENDAHULUAN\n\nIsi materi keselamatan kerja K3.'], { type: 'text/plain' });
      return { data: fakeBlob, error: null };
    },
    async extractText(buffer, mimeType) {
      const text = buffer.toString('utf-8');
      return { text, charCount: text.length };
    },
    splitChapters(text) {
      return [{ position: 1, chapter_title: 'BAB I PENDAHULUAN', content: 'Isi materi keselamatan kerja K3.' }];
    },
    async deleteModuleChunks(id) {
      deleteCalled = true;
      return { error: null };
    },
    async insertModuleChunks(rows) {
      insertCalled = true;
      return { error: null };
    },
    async updateModuleReady(id, updates) {
      statusUpdates.push({ id, status: 'ready', ...updates });
      return { error: null };
    },
    _isDownloadCalled: () => downloadCalled,
    _isDeleteCalled: () => deleteCalled,
    _isInsertCalled: () => insertCalled,
    _getStatusUpdates: () => statusUpdates,
  };

  return { ...baseDeps, ...overrides };
}

// ==================== PENGUJIAN ROUTE /api/modules/[id]/process ====================

test('Process Route: Baris modules dengan storage_path milik pengguna lain ditolak 403 dan TIDAK ADA unduhan', async () => {
  const deps = createProcessMockDeps({
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_ALICE.id,
          title: 'Modul Malicious Path',
          // storage_path menunjuk ke folder milik User Bob!
          storage_path: `${USER_BOB.id}/dokumen-rahasia-bob.pdf`,
          mime_type: 'application/pdf',
          status: 'uploaded',
        },
        error: null,
      };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 403, 'Wajib ditolak dengan status 403 Forbidden');
  const json = await res.json();
  assert.match(json.error, /Akses ditolak.*milik pengguna lain/i);

  // Pastikan Storage downloadFile SAMA SEKALI TIDAK DIPANGGIL
  assert.equal(deps._isDownloadCalled(), false, 'downloadFile TIDAK boleh dipanggil ketika storage_path milik pengguna lain');
});

test('Process Route: Modul milik pengguna lain (user_id beda) ditolak 404 dan TIDAK ADA unduhan', async () => {
  const deps = createProcessMockDeps({
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_BOB.id, // Modul bukan milik Alice
          title: 'Modul Orang Lain',
          storage_path: `${USER_ALICE.id}/file.txt`,
          status: 'uploaded',
        },
        error: null,
      };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 404, 'Wajib ditolak dengan status 404 Not Found');
  assert.equal(deps._isDownloadCalled(), false, 'downloadFile TIDAK boleh dipanggil ketika modul bukan milik pengguna aktif');
});

test('Process Route: storage_path dengan path traversal (..) ditolak 403 dan TIDAK ADA unduhan', async () => {
  const deps = createProcessMockDeps({
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_ALICE.id,
          title: 'Modul Traversal',
          storage_path: `${USER_ALICE.id}/../${USER_BOB.id}/file.pdf`,
          status: 'uploaded',
        },
        error: null,
      };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 403);
  assert.equal(deps._isDownloadCalled(), false, 'downloadFile TIDAK boleh dipanggil jika ada path traversal');
});

test('Process Route: Pengguna belum login ditolak 401 dan TIDAK ADA unduhan', async () => {
  const deps = createProcessMockDeps({
    async getAuthUser() {
      return { user: null, error: new Error('Unauthorized') };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 401);
  assert.equal(deps._isDownloadCalled(), false);
});

test('Process Route: (a) Bila status modul sudah "processing", kembalikan 409 Conflict dan JANGAN memproses ulang', async () => {
  const deps = createProcessMockDeps({
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_ALICE.id,
          title: 'Modul Sedang Diproses',
          storage_path: `${USER_ALICE.id}/file.pdf`,
          mime_type: 'application/pdf',
          status: 'processing', // Sedang dieksekusi proses lain
        },
        error: null,
      };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 409, 'Wajib mengembalikan status 409 Conflict');
  const json = await res.json();
  assert.match(json.error, /sedang dalam proses ekstraksi/i);
  assert.equal(deps._isDownloadCalled(), false, 'Jangan unduh ulang berkas jika sudah processing');
});

test('Process Route: (b) Pemrosesan ulang modul berhasil menghapus bab lama terlebih dahulu (mencegah tabrakan UNIQUE)', async () => {
  let callOrder = [];
  const deps = createProcessMockDeps({
    async getModule(id) {
      return {
        data: {
          id,
          user_id: USER_ALICE.id,
          title: 'Modul Siap Proses Ulang',
          storage_path: `${USER_ALICE.id}/file.pdf`,
          mime_type: 'application/pdf',
          status: 'ready', // Sebelumnya sudah pernah ready, diproses ulang
        },
        error: null,
      };
    },
    async deleteModuleChunks(id) {
      callOrder.push('deleteChunks');
      return { error: null };
    },
    async insertModuleChunks(rows) {
      callOrder.push('insertChunks');
      return { error: null };
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 200);
  assert.deepEqual(callOrder, ['deleteChunks', 'insertChunks'], 'Bab lama WAJIB dihapus sebelum bab baru disisipkan');
});

test('Process Route: (c) Bila ekstraksi melempar error, status modul diperbarui menjadi "failed" dan tidak tertinggal "processing"', async () => {
  const deps = createProcessMockDeps({
    async extractText() {
      throw new Error('Ekstraksi teks gagal: berkas PDF korup/rusak');
    },
  });

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 422);

  // Periksa riwayat status modul
  const updates = deps._getStatusUpdates();
  const processingStep = updates.find((u) => u.status === 'processing');
  const lastStep = updates[updates.length - 1];

  assert.ok(processingStep, 'Modul sempat masuk status processing');
  assert.equal(lastStep.status, 'failed', 'Status akhir modul wajib failed, tidak boleh tertinggal processing');
  assert.match(lastStep.errorMessage, /korup\/rusak/i);
});

test('Process Route: Modul sah dengan storage_path diawali "<user.id>/" berhasil diproses', async () => {
  const deps = createProcessMockDeps();

  const res = await handleProcessModule(deps, MODULE_ID);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.totalChapters, 1);
  assert.equal(deps._isDownloadCalled(), true, 'downloadFile harus dipanggil untuk modul dan path yang sah');
});
