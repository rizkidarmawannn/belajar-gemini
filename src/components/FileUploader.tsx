'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface FileUploaderProps {
  onSuccess?: (moduleId: string) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB sesuai bucket limits di 0001_init.sql
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

export default function FileUploader({ onSuccess }: FileUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage('');
    
    // Validasi ekstensi dan tipe
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isAllowedExt = ['pdf', 'docx', 'txt'].includes(ext);
    const isAllowedMime = !!ALLOWED_MIME_TYPES[file.type] || isAllowedExt;

    if (!isAllowedMime) {
      setErrorMessage('Format berkas tidak didukung. Mohon unggah dokumen berekstensi PDF, DOCX, atau TXT.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(`Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal 10 MB.`);
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Ambil nama tanpa ekstensi sebagai judul default
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setStatus('uploading');
      setErrorMessage('');
      setStatusMessage('Mengunggah dokumen ke penyimpanan aman...');

      const supabase = createClient();

      // 1. Ambil data user aktif
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Sesi Anda telah kedaluwarsa. Silakan masuk kembali.');
      }

      // 2. Buat nama file unik: <user_id>/<uuid>.<ext>
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'txt';
      const fileId = crypto.randomUUID();
      const storagePath = `${user.id}/${fileId}.${ext}`;

      // 3. Unggah LANGSUNG ke Supabase Storage (Bypass limit 4,5 MB Vercel)
      const { error: storageError } = await supabase.storage
        .from('modules')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: selectedFile.type || 'application/octet-stream',
        });

      if (storageError) {
        throw new Error(`Gagal mengunggah berkas ke penyimpanan: ${storageError.message}`);
      }

      // 4. Buat baris baru di tabel modules (status: 'uploaded')
      const { data: moduleRow, error: dbError } = await supabase
        .from('modules')
        .insert({
          user_id: user.id,
          title: title.trim() || selectedFile.name,
          storage_path: storagePath,
          mime_type: selectedFile.type || `application/${ext}`,
          status: 'uploaded',
        })
        .select()
        .single();

      if (dbError || !moduleRow) {
        throw new Error(`Gagal menyimpan data modul: ${dbError?.message || 'Database error'}`);
      }

      // 5. Panggil API proses ekstraksi (kirim HANYA ID modul ke Vercel)
      setStatus('processing');
      setStatusMessage('Mengekstrak teks & memecah modul per bab...');

      const processRes = await fetch(`/api/modules/${moduleRow.id}/process`, {
        method: 'POST',
      });

      const processJson = await processRes.json();

      if (!processRes.ok) {
        throw new Error(processJson.error || 'Gagal memproses dan mengekstrak modul.');
      }

      setStatus('success');
      setStatusMessage(`Modul berhasil diproses! (${processJson.totalChapters} bab terdeteksi)`);

      if (onSuccess) {
        onSuccess(moduleRow.id);
      } else {
        router.push(`/modules/${moduleRow.id}`);
        router.refresh();
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Terjadi kesalahan saat mengunggah modul.');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        Unggah Modul Belajar Baru
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Dukungan format PDF, DOCX, dan TXT (Maks. 10 MB). Berkas diunggah langsung ke penyimpanan privat terenkripsi.
      </p>

      {errorMessage && (
        <div className="mb-5 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {status === 'success' && (
        <div className="mb-5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-sm flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center">
            {selectedFile ? (
              <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <FileText className="w-5 h-5" />
                <span className="font-medium text-sm truncate max-w-xs">{selectedFile.name}</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400">
                  ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tarik berkas ke sini atau <span className="text-indigo-600 dark:text-indigo-400 underline">pilih dari perangkat</span>
                </p>
                <p className="text-xs text-slate-400">PDF, DOCX, atau TXT hingga 10 MB</p>
              </>
            )}
          </div>
        </div>

        {selectedFile && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Judul Modul
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Modul Biologi Sel - Bab 1"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedFile || status === 'uploading' || status === 'processing'}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          {status === 'uploading' || status === 'processing' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{statusMessage}</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Mulai Unggah & Ekstrak Modul</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
