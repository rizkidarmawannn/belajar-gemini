import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi di environment variable.');
  }

  if (!supabaseAnonKey || supabaseAnonKey.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY belum dikonfigurasi di environment variable.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
