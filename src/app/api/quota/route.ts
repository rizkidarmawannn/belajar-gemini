import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserDailyQuotaLimit, isDevUnlimitedUser } from '@/lib/quota';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Harap masuk terlebih dahulu.' }, { status: 401 });
    }

    const limit = getUserDailyQuotaLimit(user);
    const isDev = isDevUnlimitedUser(user);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const used = count || 0;
    const remaining = limit === 0 ? null : Math.max(0, limit - used);

    return NextResponse.json({
      used,
      limit,
      remaining,
      isDev,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal memeriksa kuota' }, { status: 500 });
  }
}
