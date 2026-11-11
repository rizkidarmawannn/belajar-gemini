-- Menambahkan fitur 'quiz_explain' ke check constraint tabel public.generations
-- agar hasil pendalaman penjelasan soal kuis dapat disimpan di cache database.
do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.generations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%feature%';

  if constraint_name is not null then
    execute format('alter table public.generations drop constraint %I', constraint_name);
  end if;

  alter table public.generations
    add constraint generations_feature_check
    check (feature in (
      'summary',
      'summary_short',
      'flashcards',
      'mnemonic',
      'quiz',
      'quiz_explain',
      'qa',
      'essay_eval'
    ));
end $$;
