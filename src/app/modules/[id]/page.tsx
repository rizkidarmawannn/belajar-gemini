import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ModuleViewer from './ModuleViewer';

export const dynamic = 'force-dynamic';

export default async function ModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ambil data modul milik user (RLS aktif)
  const { data: moduleData, error: moduleError } = await supabase
    .from('modules')
    .select('*')
    .eq('id', id)
    .single();

  if (moduleError || !moduleData) {
    notFound();
  }

  // Ambil bab / potongan materi
  const { data: chunks, error: chunksError } = await supabase
    .from('module_chunks')
    .select('*')
    .eq('module_id', id)
    .order('position', { ascending: true });

  if (chunksError || !chunks) {
    notFound();
  }

  // Ambil flashcards milik user untuk modul ini
  const { data: initialFlashcards } = await supabase
    .from('flashcards')
    .select('*')
    .eq('module_id', id)
    .order('created_at', { ascending: false });

  // Ambil riwayat percobaan kuis
  const { data: initialQuizAttempts } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('module_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <ModuleViewer
      module={moduleData}
      chunks={chunks}
      initialFlashcards={initialFlashcards || []}
      initialQuizAttempts={initialQuizAttempts || []}
    />
  );
}
