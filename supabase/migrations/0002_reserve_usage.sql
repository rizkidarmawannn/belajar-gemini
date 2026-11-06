-- Migrasi 0002: Reservasi Atomik Kuota Harian (Mencegah Race Condition Permintaan Paralel)
-- Fungsi dijalankan secara SECURITY DEFINER dengan hak akses eksklusif ke service_role

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
  -- Kunci transaksi per pengguna (advisory lock) agar pengecekan kuota bersifat atomik & serial
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  -- Hitung pemakaian 24 jam terakhir pengguna
  select count(*) into v_count
  from public.usage_log
  where user_id = p_user
    and created_at >= (now() - interval '24 hours');

  -- Jika kuota sudah mencapai batas limit harian, tolak (kembalikan null)
  if v_count >= p_limit then
    return null;
  end if;

  -- Reservasi baris pemakaian di awal (tokens_out bernilai null sampai proses selesai)
  insert into public.usage_log (user_id, feature, tokens_in, tokens_out)
  values (p_user, p_feature, p_tokens_in, null)
  returning id into v_id;

  return v_id;
end;
$$;

-- Cabut seluruh izin eksekusi dari publik, anon, dan authenticated (hanya server service_role yang diizinkan)
revoke all on function public.reserve_usage(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, int, int) to service_role;
