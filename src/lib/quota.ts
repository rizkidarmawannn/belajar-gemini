let hasWarnedInvalidQuota = false;

/**
 * Utilitas untuk membaca konfigurasi batas kuota harian pengguna (DAILY_QUOTA_PER_USER).
 *
 * Aturan:
 * - Tidak diisi / undefined / null / string kosong: default 30 panggilan per hari (tanpa warning)
 * - '0': 0 (mode tanpa batas kuota, pencatatan di usage_log tetap berjalan)
 * - Bilangan bulat positif > 0: batas kuota sesuai angka tersebut (misal 500)
 * - Nilai non-integer ("0.5", "1.7", "1e3"), nilai negatif ("-1"), atau bukan angka ("abc"):
 *   dianggap salah konfigurasi dan jatuh ke 30, mencetak console.warn singkat satu kali per proses
 *   tanpa mencetak nilai aslinya demi privasi/keamanan.
 */
export function getDailyQuotaLimit(
  rawEnv: string | undefined = process.env.DAILY_QUOTA_PER_USER
): number {
  if (rawEnv === undefined || rawEnv === null) {
    return 30;
  }

  const trimmed = typeof rawEnv === 'string' ? rawEnv.trim() : String(rawEnv).trim();
  if (trimmed === '') {
    return 30;
  }

  // Hanya izinkan format bilangan bulat non-negatif murni (misal "0", "15", "500").
  // Menolak desimal ("0.5", "1.7"), notasi eksponensial ("1e3"), negatif ("-1"), dan string acak ("abc").
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    if (!hasWarnedInvalidQuota) {
      console.warn(
        '[Config] Nilai DAILY_QUOTA_PER_USER tidak valid (wajib bilangan bulat non-negatif). Menggunakan batas default 30.'
      );
      hasWarnedInvalidQuota = true;
    }
    return 30;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    if (!hasWarnedInvalidQuota) {
      console.warn(
        '[Config] Nilai DAILY_QUOTA_PER_USER melebihi batas bilangan bulat aman. Menggunakan batas default 30.'
      );
      hasWarnedInvalidQuota = true;
    }
    return 30;
  }

  return parsed;
}

export interface QuotaUserIdentifier {
  email?: string | null;
  id?: string | null;
  user_metadata?: Record<string, any> | null;
}

/**
 * Memeriksa apakah pengguna termasuk dalam daftar whitelist akun pengembang (DEV_EMAILS).
 * Mendukung pencocokan:
 * - Email persis (misal: developer@example.com)
 * - Username atau prefix email (misal: devuser)
 * - User ID UUID
 */
export function isDevUnlimitedUser(
  user?: QuotaUserIdentifier | null,
  rawDevEnv: string | undefined = process.env.DEV_EMAILS
): boolean {
  if (!user) return false;
  if (!rawDevEnv || typeof rawDevEnv !== 'string') return false;

  const list = rawDevEnv
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (list.length === 0) return false;

  const email = (user.email || '').trim().toLowerCase();
  const id = (user.id || '').trim().toLowerCase();
  const metadataUsername = (
    user.user_metadata?.username ||
    user.user_metadata?.user_name ||
    user.user_metadata?.name ||
    ''
  ).trim().toLowerCase();

  // 1. Pencocokan langsung email, ID, atau metadata username
  if (email && list.includes(email)) return true;
  if (id && list.includes(id)) return true;
  if (metadataUsername && list.includes(metadataUsername)) return true;

  // 2. Pencocokan fleksibel username/prefix email (misal DEV_EMAILS="devuser", email="devuser@example.com")
  for (const item of list) {
    if (email && (email === item || email.startsWith(`${item}@`) || email.startsWith(item))) {
      return true;
    }
  }

  return false;
}

/**
 * Mengembalikan batas kuota harian khusus untuk pengguna tertentu.
 * Jika pengguna adalah akun dev (whitelist di DEV_EMAILS), kembalikan 0 (Unlimited).
 * Jika pengguna biasa, kembalikan batas DAILY_QUOTA_PER_USER (default 30).
 */
export function getUserDailyQuotaLimit(
  user?: QuotaUserIdentifier | null,
  rawDevEnv: string | undefined = process.env.DEV_EMAILS,
  rawQuotaEnv: string | undefined = process.env.DAILY_QUOTA_PER_USER
): number {
  if (isDevUnlimitedUser(user, rawDevEnv)) {
    return 0; // Mode tanpa batas kuota khusus developer
  }
  return getDailyQuotaLimit(rawQuotaEnv);
}

/**
 * Khusus untuk keperluan unit test: mereset status warning satu kali per proses.
 */
export function _resetWarnFlagForTesting(): void {
  hasWarnedInvalidQuota = false;
}
