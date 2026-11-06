import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || supabaseUrl.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi di environment variable server.');
  }

  if (!serviceRoleKey || serviceRoleKey.trim() === '') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment variable server.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
