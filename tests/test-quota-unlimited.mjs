import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyQuotaLimit,
  isDevUnlimitedUser,
  getUserDailyQuotaLimit,
  _resetWarnFlagForTesting,
} from '../src/lib/quota.ts';
import { handleGenerate } from '../src/lib/gemini/handler.ts';

const VALID_MODULE_ID = '11111111-2222-3333-4444-555555555555';

function createQuotaMockDeps(overrides = {}) {
  let currentUsageCount = 0;
  const usageLogRecords = [];
  const cacheMap = new Map();

  const baseDeps = {
    async getAuthUser() {
      return { user: { id: 'user-quota-test-123' }, error: null };
    },
    async getModule(moduleId) {
      return {
        data: { id: moduleId, title: 'Modul Uji Kuota', status: 'ready' },
        error: null,
      };
    },
    async getCachedGeneration(userId, moduleId, feature, paramsHash, promptVersion) {
      const key = `${userId}:${moduleId}:${feature}:${paramsHash}:${promptVersion}`;
      return { data: cacheMap.get(key) || null, error: null };
    },
    async saveGeneration(record) {
      const key = `${record.user_id}:${record.module_id}:${record.feature}:${record.params_hash}:${record.prompt_version}`;
      cacheMap.set(key, record);
      return { data: record, error: null };
    },
    async getModuleChunks(moduleId) {
      return {
        data: [{ position: 1, chapter_title: 'Bab 1', content: 'Konten modul pengujian kuota.' }],
        error: null,
      };
    },
    // Mock RPC postgres reserve_usage sesuai migrasi 0003_reserve_usage_unlimited.sql
    async reserveUsage(userId, feature, limit, tokensIn) {
      if (limit > 0 && currentUsageCount >= limit) {
        return { id: null, error: null }; // Kuota habis hanya jika limit > 0
      }
      currentUsageCount++;
      const logId = currentUsageCount;
      usageLogRecords.push({ id: logId, userId, feature, tokensIn });
      return { id: logId, error: null };
    },
    async updateUsageLog(logId, tokensIn, tokensOut) {
      return { data: { logId, tokensIn, tokensOut }, error: null };
    },
    async deleteUsageLog(logId) {
      return { data: { logId }, error: null };
    },
    async callGeminiJson() {
      return {
        data: {
          ringkasan: 'Hasil ringkasan uji kuota',
          poin_penting: ['Poin 1'],
          istilah_penting: [{ istilah: 'K3', definisi: 'Keselamatan Kerja' }],
          wajib_diingat: 'Wajib diingat',
        },
        tokensIn: 100,
        tokensOut: 50,
      };
    },
    async callGeminiText() {
      return {
        text: 'Teks hasil uji kuota',
        tokensIn: 100,
        tokensOut: 50,
      };
    },
    async callGeminiStream() {
      return new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('Stream uji kuota'));
          ctrl.close();
        },
      });
    },
    dailyQuotaLimit: 30,
    promptVersion: '1',
    _getUsageCount: () => currentUsageCount,
    _getUsageRecords: () => usageLogRecords,
  };

  return { ...baseDeps, ...overrides };
}

// ==================== 1. TEST UNIT getDailyQuotaLimit ====================

test('getDailyQuotaLimit: mengembalikan 30 untuk undefined, null, dan string kosong', () => {
  assert.equal(getDailyQuotaLimit(undefined), 30);
  assert.equal(getDailyQuotaLimit(null), 30);
  assert.equal(getDailyQuotaLimit(''), 30);
  assert.equal(getDailyQuotaLimit('   '), 30);
});

test('getDailyQuotaLimit: mengembalikan 0 untuk string "0" (mode tanpa batas kuota)', () => {
  assert.equal(getDailyQuotaLimit('0'), 0);
  assert.equal(getDailyQuotaLimit(' 0 '), 0);
});

test('getDailyQuotaLimit: mengembalikan nilai angka positif yang valid (misal "500")', () => {
  assert.equal(getDailyQuotaLimit('500'), 500);
  assert.equal(getDailyQuotaLimit('15'), 15);
});

test('getDailyQuotaLimit: jatuh ke 30 untuk nilai negatif atau bukan angka ("abc", "-1")', () => {
  assert.equal(getDailyQuotaLimit('abc'), 30);
  assert.equal(getDailyQuotaLimit('-1'), 30);
  assert.equal(getDailyQuotaLimit('-50'), 30);
  assert.equal(getDailyQuotaLimit('invalid_text'), 30);
});

test('getDailyQuotaLimit: nilai non-integer ("0.5", "1.7", "1e3") jatuh ke 30 (bukan Math.floor) dan mencetak console.warn tepat 1 kali', () => {
  _resetWarnFlagForTesting();
  const warnMessages = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnMessages.push(args.join(' '));
  };

  try {
    // 1. Uji nilai desimal dan eksponensial jatuh ke 30
    assert.equal(getDailyQuotaLimit('0.5'), 30);
    assert.equal(getDailyQuotaLimit('1.7'), 30);
    assert.equal(getDailyQuotaLimit('1e3'), 30);
    assert.equal(getDailyQuotaLimit('2.0'), 30); // Desimal bertitik tetap ditolak demi ketatnya konfigurasi

    // 2. Pastikan console.warn dipanggil tepat 1 kali per proses (tidak membanjiri log)
    assert.equal(warnMessages.length, 1, 'console.warn harus dipanggil tepat satu kali per proses');

    // 3. Pastikan pesan singkat dan TIDAK mencetak nilai mentah dari env
    assert.match(warnMessages[0], /DAILY_QUOTA_PER_USER tidak valid/);
    assert.ok(!warnMessages[0].includes('0.5'), 'Pesan peringatan tidak boleh mencetak nilai konfigurasi mentah');
    assert.ok(!warnMessages[0].includes('1.7'), 'Pesan peringatan tidak boleh mencetak nilai konfigurasi mentah');
    assert.ok(!warnMessages[0].includes('1e3'), 'Pesan peringatan tidak boleh mencetak nilai konfigurasi mentah');
  } finally {
    console.warn = originalWarn;
  }
});

// ==================== 2. TEST HANDLER ASLI: LIMIT 0 (UNLIMITED) ====================

test('Route Handler ASLI: limit 0 tidak pernah menghasilkan 429 setelah 50 panggilan dan usage_log tetap tercatat', async () => {
  const deps = createQuotaMockDeps({
    dailyQuotaLimit: 0, // Mode unlimited
  });

  const callCount = 50;
  for (let i = 0; i < callCount; i++) {
    const res = await handleGenerate(deps, {
      moduleId: VALID_MODULE_ID,
      feature: 'summary',
      regenerate: true, // Paksa live call agar reserveUsage selalu dipanggil
      params: { style: 'singkat', maxPoints: (i % 5) + 1 },
    });

    assert.equal(res.status, 200, `Panggilan ke-${i + 1} harus sukses 200`);
  }

  // Seluruh 50 panggilan harus tercatat di usage_log
  assert.equal(deps._getUsageCount(), 50, 'usage_log harus mencatat tepat 50 baris pemanggilan');
  assert.equal(deps._getUsageRecords().length, 50);
});

// ==================== 3. TEST HANDLER ASLI: LIMIT 3 (ENFORCE 429 PADA PANGGILAN KE-4) ====================

test('Route Handler ASLI: limit 3 tetap meloloskan 3 panggilan dan menolak panggilan ke-4 dengan 429', async () => {
  const deps = createQuotaMockDeps({
    dailyQuotaLimit: 3, // Batas kuota harian = 3
  });

  // Panggilan 1 -> sukses 200
  const res1 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
    params: { style: 'singkat', maxPoints: 1 },
  });
  assert.equal(res1.status, 200);

  // Panggilan 2 -> sukses 200
  const res2 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
    params: { style: 'singkat', maxPoints: 2 },
  });
  assert.equal(res2.status, 200);

  // Panggilan 3 -> sukses 200 (mencapai batas 3)
  const res3 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
    params: { style: 'singkat', maxPoints: 3 },
  });
  assert.equal(res3.status, 200);

  // Panggilan 4 -> wajib ditolak 429
  const res4 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
    params: { style: 'singkat', maxPoints: 4 },
  });
  assert.equal(res4.status, 429, 'Panggilan ke-4 wajib ditolak dengan status 429');
  const json4 = await res4.json();
  assert.match(json4.error, /Batas kuota harian Anda telah tercapai/i);
  assert.equal(json4.quotaLimit, 3);
});

// ==================== 4. TEST 10 PERMINTAAN PARALEL (LIMIT 0 DENGAN REGENERATE: TRUE) ====================

test('Route Handler ASLI: 10 permintaan paralel dengan limit 0 dan regenerate: true semuanya sukses 200', async () => {
  const deps = createQuotaMockDeps({
    dailyQuotaLimit: 0, // Mode unlimited
  });

  const parallelCount = 10;
  const requests = Array.from({ length: parallelCount }, (_, i) =>
    handleGenerate(deps, {
      moduleId: VALID_MODULE_ID,
      feature: 'summary',
      regenerate: true,
      params: { style: 'singkat', maxPoints: (i % 10) + 1 },
    })
  );

  const responses = await Promise.all(requests);
  const status200Count = responses.filter((r) => r.status === 200).length;
  const status429Count = responses.filter((r) => r.status === 429).length;

  assert.equal(status200Count, 10, 'Semua 10 permintaan paralel harus sukses dengan status 200');
  assert.equal(status429Count, 0, 'Tidak boleh ada yang berstatus 429 pada limit 0');
  assert.equal(deps._getUsageCount(), 10, 'usage_log harus mencatat tepat 10 transaksi');
});

// ==================== 5. TEST WHITELIST DEV UNLIMITED (DEV_EMAILS) ====================

test('isDevUnlimitedUser: mencocokkan email mock dev dan prefix secara case-insensitive', () => {
  const devEnv = 'mock-dev@example.com,mockdev,admin@test.com';

  // 1. Email persis
  assert.equal(isDevUnlimitedUser({ email: 'mock-dev@example.com' }, devEnv), true);
  assert.equal(isDevUnlimitedUser({ email: 'MOCK-DEV@EXAMPLE.COM' }, devEnv), true);

  // 2. Prefix username mockdev
  assert.equal(isDevUnlimitedUser({ email: 'mockdev@anotherexample.com' }, devEnv), true);

  // 3. User metadata username
  assert.equal(isDevUnlimitedUser({ user_metadata: { username: 'mockdev' } }, devEnv), true);

  // 4. Pengguna umum bukan dev -> false
  assert.equal(isDevUnlimitedUser({ email: 'siswa.biasa@sekolah.id' }, devEnv), false);
  assert.equal(isDevUnlimitedUser(null, devEnv), false);
  assert.equal(isDevUnlimitedUser(undefined, devEnv), false);
  assert.equal(isDevUnlimitedUser({ email: 'mock-dev@example.com' }, ''), false);
});

test('getUserDailyQuotaLimit: mengembalikan 0 untuk akun dev, dan 30 untuk pengguna umum', () => {
  const devEnv = 'mock-dev@example.com';
  const defaultEnv = '30';

  const devUser = { email: 'mock-dev@example.com' };
  const normalUser = { email: 'user.biasa@domain.com' };

  assert.equal(getUserDailyQuotaLimit(devUser, devEnv, defaultEnv), 0, 'Akun dev harus mendapat limit 0 (unlimited)');
  assert.equal(getUserDailyQuotaLimit(normalUser, devEnv, defaultEnv), 30, 'Akun biasa harus mendapat limit 30');
  assert.equal(getUserDailyQuotaLimit(null, devEnv, defaultEnv), 30);
});

test('handleGenerate: akun dev dengan getUserQuotaLimit lolos tanpa batas meski dailyQuotaLimit sistem = 1', async () => {
  const devUser = { id: 'user-mock-dev-1', email: 'mock-dev@example.com' };
  const deps = createQuotaMockDeps({
    dailyQuotaLimit: 1, // Batas umum sangat ketat: 1 panggilan
    getUserQuotaLimit: (u) => getUserDailyQuotaLimit(u, 'mock-dev@example.com', '1'),
    async getAuthUser() {
      return { user: devUser, error: null };
    },
  });

  // Panggilan 1 -> sukses 200
  const res1 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
  });
  assert.equal(res1.status, 200);

  // Panggilan 2 -> untuk akun dev tetap sukses 200 (karena limit = 0), bukan ditolak 429!
  const res2 = await handleGenerate(deps, {
    moduleId: VALID_MODULE_ID,
    feature: 'summary',
    regenerate: true,
  });
  assert.equal(res2.status, 200, 'Akun dev harus tetap sukses di panggilan ke-2');
  assert.equal(deps._getUsageCount(), 2);
});
