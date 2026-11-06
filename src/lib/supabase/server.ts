import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers.js';

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi di environment variable server.');
  }

  if (!supabaseAnonKey || supabaseAnonKey.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY belum dikonfigurasi di environment variable server.');
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll dipanggil dari Server Component, abaikan bila tidak bisa mengubah cookie di sana
        }
      },
    },
  });
}
