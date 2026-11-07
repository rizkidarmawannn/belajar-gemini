-- Migrasi 0003: Mode Tanpa Batas Kuota (DAILY_QUOTA_PER_USER=0)
-- Jika p_limit <= 0, lewati pengecekan batas dan langsung sisipkan baris usage_log (tidak pernah mengembalikan null).
-- Advisory lock, security definer, dan izin service_role tetap dipertahankan penuh.

create or replace function public.reserve_usage(
  p_user uuid,
  p_feature text,
  p_limit int,
  p_tokens_in int default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_id bigint;
begin
  -- Kunci transaksi per pengguna (advisory lock)
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  -- Jika batas positif (> 0), hitung pemakaian 24 jam terakhir
  if p_limit > 0 then
    select count(*) into v_count
    from public.usage_log
    where user_id = p_user
      and created_at >= (now() - interval '24 hours');

    if v_count >= p_limit then
      return null;
    end if;
  end if;

  -- Sisipkan baris usage_log (pencatatan telemetri tetap berjalan bahkan pada mode unlimited)
  insert into public.usage_log (user_id, feature, tokens_in, tokens_out)
  values (p_user, p_feature, p_tokens_in, null)
  returning id into v_id;

  return v_id;
end;
$$;

-- Cabut seluruh izin eksekusi dari publik, anon, dan authenticated (hanya server service_role yang diizinkan)
revoke all on function public.reserve_usage(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, int, int) to service_role;
