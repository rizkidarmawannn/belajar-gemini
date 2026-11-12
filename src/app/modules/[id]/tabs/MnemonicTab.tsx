'use client';

import { useState } from 'react';
import { Brain, Loader2, Copy, Check } from 'lucide-react';
import FormattedContent from '@/components/FormattedContent';
import {
  readApiResponse,
  formatFriendlyErrorMessage,
  cleanDisplayText,
} from '@/lib/learning/api-stream-reader';

interface Chunk {
  id: string;
  position: number;
  chapter_title: string;
}

interface MnemonicTabProps {
  moduleId: string;
  chunks: Chunk[];
  onError: (msg: string, retry?: () => void) => void;
}

export default function MnemonicTab({ moduleId, chunks, onError }: MnemonicTabProps) {
  const [mnemonicTopic, setMnemonicTopic] = useState('');
  const [mnemonicResult, setMnemonicResult] = useState('');
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // Topik saran diturunkan SECARA DINAMIS dari daftar bab modul yang sedang dibuka (BUKAN hardcoded)
  const dynamicSuggestions = chunks.slice(0, 5).map((c) => c.chapter_title);

  const handleGenerateMnemonic = async (topicToUse?: string) => {
    const topic = (topicToUse || mnemonicTopic).trim();
    if (!topic) return;

    setIsGeneratingMnemonic(true);
    setMnemonicResult('');
    onError('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          feature: 'mnemonic',
          stream: true,
          params: {
            topic,
          },
        }),
      });

      const result = await readApiResponse({
        response,
        onChunk: (accumulated) => setMnemonicResult(accumulated),
      });

      setMnemonicResult(result.text);
    } catch (err: any) {
      const friendly = formatFriendlyErrorMessage(err);
      if (!friendly.isUserAbort) {
        onError(friendly.message, () => handleGenerateMnemonic(topic));
      }
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-600" />
          <span>Pembuat Jembatan Keledai, Akronim & Analogi</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ubah daftar konsep, urutan tahapan, atau istilah rumit menjadi singkatan lucu dan analogi sehari-hari agar mudah melekat di ingatan jangka panjang.
        </p>

        {/* Saran Topik Dinamis dari Bab Modul */}
        {dynamicSuggestions.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Pilih Cepat dari Bab Modul:
            </span>
            <div className="flex flex-wrap gap-2">
              {dynamicSuggestions.map((title, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setMnemonicTopic(title);
                    handleGenerateMnemonic(title);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-xs font-medium transition text-left"
                >
                  💡 {title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Atau Ketik Topik / Daftar Tertentu yang Ingin Dihafal:
            </label>
            <input
              type="text"
              value={mnemonicTopic}
              onChange={(e) => setMnemonicTopic(e.target.value)}
              placeholder="Contoh: Tahapan penerapan atau faktor risiko kerja"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <button
            onClick={() => handleGenerateMnemonic()}
            disabled={isGeneratingMnemonic || !mnemonicTopic.trim()}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGeneratingMnemonic ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mencari Daftar & Merancang Jembatan Keledai...</span>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                <span>Buat Bantuan Hafalan AI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {(mnemonicResult || isGeneratingMnemonic) && (
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-4 h-4" />
              Alat Bantu Hafalan AI
            </span>
            {mnemonicResult && (
              <button
                onClick={async () => {
                  const clean = cleanDisplayText(mnemonicResult);
                  if (!clean) return;
                  try {
                    await navigator.clipboard.writeText(clean);
                    setMnemonicCopied(true);
                    setTimeout(() => setMnemonicCopied(false), 2000);
                  } catch {
                    // Abaikan bila clipboard diblokir browser
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition"
              >
                {mnemonicCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Mnemonic</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed space-y-3">
            {isGeneratingMnemonic && !mnemonicResult && (
              <div className="flex items-center gap-3 py-6 text-slate-500 dark:text-slate-400 text-sm animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Gemini AI sedang menyusun akronim dan analogi kreatif...</span>
              </div>
            )}
            {mnemonicResult && <FormattedContent content={mnemonicResult} />}
          </div>
        </div>
      )}
    </div>
  );
}
