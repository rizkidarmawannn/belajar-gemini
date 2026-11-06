-- Skema awal aplikasi belajar. Jalankan lewat Supabase CLI (supabase db push)
-- atau tempel di SQL Editor Supabase. Semua tabel memakai Row Level Security.

-- ===== TABEL =====
create table public.modules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  storage_path text,
  mime_type    text,
  status       text not null default 'uploaded'
               check (status in ('uploaded','processing','ready','failed')),
  content_hash text,
  char_count   integer,
  error_message text,
  created_at   timestamptz not null default now()
);

create table public.module_chunks (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position      integer not null,
  chapter_title text not null,
  content       text not null,
  unique (module_id, position)
);

-- Cache hasil Gemini (ringkasan, soal, mnemonic, dll.). Ditulis HANYA oleh server.
create table public.generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  module_id      uuid not null references public.modules(id) on delete cascade,
  feature        text not null
                 check (feature in ('summary','summary_short','flashcards','mnemonic','quiz','qa','essay_eval')),
  params_hash    text not null,
  prompt_version text not null,
  result         jsonb not null,
  tokens_in      integer,
  tokens_out     integer,
  created_at     timestamptz not null default now(),
  unique (user_id, module_id, feature, params_hash, prompt_version)
);

create table public.flashcards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  module_id      uuid not null references public.modules(id) on delete cascade,
  front          text not null,
  back           text not null,
  chapter        text,
  level          text check (level in ('mudah','sedang','sulit')),
  box            smallint not null default 0,   -- 0 baru, 1..4 = jarak 1,3,7,14 hari
  next_review_at timestamptz not null default now(),
  last_result    text check (last_result in ('hafal','belum')),
  created_at     timestamptz not null default now()
);

create table public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  module_id  uuid not null references public.modules(id) on delete cascade,
  score      integer not null,
  total      integer not null,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);

-- Catatan pemakaian untuk kuota harian. Ditulis HANYA oleh server.
create table public.usage_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null,
  tokens_in  integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);

-- ===== INDEKS =====
create index on public.modules (user_id, created_at desc);
create index on public.module_chunks (module_id, position);
create index on public.generations (module_id, feature);
create index on public.flashcards (user_id, module_id, next_review_at);
create index on public.quiz_attempts (user_id, module_id, created_at desc);
create index on public.usage_log (user_id, created_at desc);

-- ===== RLS =====
alter table public.modules       enable row level security;
alter table public.module_chunks enable row level security;
alter table public.generations   enable row level security;
alter table public.flashcards    enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.usage_log     enable row level security;

-- Tabel yang boleh dikelola penuh oleh pemiliknya
create policy "modules_own" on public.modules
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "chunks_own" on public.module_chunks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "flashcards_own" on public.flashcards
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "quiz_attempts_own" on public.quiz_attempts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- generations dan usage_log: pemilik hanya boleh MEMBACA.
-- Penulisan dilakukan server dengan service role (melewati RLS).
create policy "generations_read_own" on public.generations
  for select to authenticated using (user_id = (select auth.uid()));

create policy "usage_read_own" on public.usage_log
  for select to authenticated using (user_id = (select auth.uid()));

-- ===== STORAGE =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'modules', 'modules', false, 10485760,
  array['application/pdf','text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- Struktur path wajib: <user_id>/<nama-file>
create policy "modules_files_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'modules' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "modules_files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'modules' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "modules_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'modules' and (storage.foldername(name))[1] = (select auth.uid())::text);
