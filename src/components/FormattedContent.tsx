'use client';

import React, { createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  BookOpen,
  ListChecks,
  Lightbulb,
  Scale,
  StickyNote,
  Calculator,
  KeyRound,
  Sparkles,
  FileText,
} from 'lucide-react';
import { formatStructuredModuleText, prepareMarkdownForDisplay } from '@/lib/parsers/text-formatter';

const ListDepthContext = createContext(0);
const InsideListItemContext = createContext(false);

/**
 * Mengekstrak seluruh teks polos dari children React secara rekursif
 * agar tag <strong>, <em>, dll. tidak berubah menjadi "[object Object]".
 */
export function extractNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractNodeText(node.props?.children);
  }
  return '';
}

interface SectionBadgeConfig {
  label: string;
  icon: React.ReactNode;
  className: string;
}

function matchStandaloneSectionBadge(text: string): SectionBadgeConfig | null {
  const clean = text.trim().replace(/[:：]\s*$/, '').trim();
  if (!clean || clean.length > 60) return null;

  if (/^(?:penjelasan(?:\s+materi|\s+umum|\s+teori)?|uraian(?:\s+materi)?|konsep\s+dasar|pengertian)$/i.test(clean)) {
    return {
      label: clean,
      icon: <BookOpen className="w-3.5 h-3.5" />,
      className:
        'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/70',
    };
  }

  if (
    /^(?:poin[- ]poin\s+penting|poin\s+utama|ringkasan\s+poin|langkah[- ]langkah|tahapan|kriteria|tujuan(?:\s+penulisan)?|perbedaan\s+utama|ciri[- ]ciri|manfaat|fungsi)$/i.test(
      clean
    )
  ) {
    return {
      label: clean,
      icon: <ListChecks className="w-3.5 h-3.5" />,
      className:
        'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-slate-700',
    };
  }

  if (
    /^(?:aturan(?:\s*(?:&|dan|\/)\s*ketentuan)?|ketentuan(?:\s+umum|\s+khusus)?|peraturan|syarat(?:\s*(?:&|dan|\/)\s*ketentuan)?|prinsip(?:\s+utama)?)$/i.test(
      clean
    )
  ) {
    return {
      label: clean,
      icon: <Scale className="w-3.5 h-3.5" />,
      className:
        'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/70',
    };
  }

  if (/^(?:contoh(?:\s*(?:\/|&|dan)\s*kasus\s+penerapan|\s+penerapan|\s+kasus)?|ilustrasi|studi\s+kasus)$/i.test(clean)) {
    return {
      label: clean,
      icon: <Lightbulb className="w-3.5 h-3.5" />,
      className:
        'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70',
    };
  }

  if (/^(?:istilah\s+kunci|istilah\s+penting|glosarium|kata\s+kunci|definisi\s+istilah)$/i.test(clean)) {
    return {
      label: clean,
      icon: <KeyRound className="w-3.5 h-3.5" />,
      className:
        'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70',
    };
  }

  return null;
}

const EXAMPLE_CALLOUT_REGEX =
  /^(?:contoh(?:\s+(?:kasus|penerapan|soal|nyata))?|contohnya|misal(?:nya)?|sebagai\s+contoh|ilustrasi|studi\s+kasus)(?:\s*[:–—,-]|\s+(?:adalah|yaitu|yakni|pada|dalam|di|untuk|ketika|seperti)\b)/i;
const RULE_CALLOUT_REGEX =
  /^(?:aturan(?:\s+(?:penting|umum|dasar))?|ketentuan(?:\s+(?:umum|khusus))?|peraturan|prinsip(?:\s+dasar)?|syarat(?:\s+utama)?|kewajiban|larangan|wajib\s+diperhatikan|pasal\s+\d+(?:\s+ayat\s*\(\d+\))?)\s*[:–—-]/i;
const NOTE_CALLOUT_REGEX = /^(?:catatan(?:\s+penting)?|penting|perhatian|peringatan|tips|ingat)\s*[:–—-]/i;
const FORMULA_CALLOUT_REGEX = /^(?:rumus|formula|persamaan)\s*[:–—-]/i;
const CORE_IDEA_REGEX = /^inti\s+bab\s*[:–—-]/i;
const SOURCE_REGEX = /^sumber\s*[:–—-]/i;
const NO_EXAMPLE_REGEX = /^tidak\s+ada\s+contoh\s+spesifik/i;

/**
 * Menyorot label awal "Istilah:" di dalam item daftar (mis. "Latar Belakang Masalah: ...")
 * meskipun teks sumber belum membungkusnya dengan markdown bold.
 */
function highlightLeadInLabel(children: React.ReactNode): React.ReactNode {
  const arr = React.Children.toArray(children);
  if (arr.length === 0) return children;

  const first = arr[0];
  if (typeof first !== 'string') return children;

  const match = first.match(/^([A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9\s/().,&-]{1,48}:)(\s+[\s\S]*)$/);
  if (!match) return children;

  const prefix = match[1];
  const rest = match[2];
  if (/^https?:$/i.test(prefix)) return children;

  return (
    <>
      <span className="font-semibold text-indigo-950 dark:text-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/50">
        {prefix}
      </span>
      {rest}
      {arr.slice(1)}
    </>
  );
}

function MarkdownParagraph({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const insideLi = useContext(InsideListItemContext);
  const text = extractNodeText(children).trim();
  if (!text) return null;

  if (insideLi) {
    return (
      <p className="my-1 text-sm leading-relaxed" {...props}>
        {highlightLeadInLabel(children)}
      </p>
    );
  }

  // 1. Label bagian mandiri (mis. **Penjelasan Materi:**, **Poin-Poin Penting:**)
  const badge = matchStandaloneSectionBadge(text);
  if (badge) {
    return (
      <div className="pt-3 pb-1">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold tracking-wide ${badge.className}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </span>
      </div>
    );
  }

  // 2. Keterangan tidak ada contoh spesifik
  if (NO_EXAMPLE_REGEX.test(text)) {
    return (
      <p className="my-2 px-3 py-2 rounded-lg bg-slate-100/70 dark:bg-slate-800/40 text-xs italic text-slate-500 dark:text-slate-400">
        {children}
      </p>
    );
  }

  // 3. Kotak sorotan Inti Bab
  if (CORE_IDEA_REGEX.test(text)) {
    return (
      <div className="my-3 rounded-xl bg-indigo-50/75 dark:bg-indigo-950/35 border border-indigo-200/80 dark:border-indigo-800/60 border-l-4 border-l-indigo-600 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Inti Bab</span>
        </div>
        <p className="text-sm leading-relaxed text-indigo-950 dark:text-indigo-100" {...props}>
          {children}
        </p>
      </div>
    );
  }

  // 4. Kotak sorotan Contoh / Penerapan
  if (EXAMPLE_CALLOUT_REGEX.test(text)) {
    return (
      <div className="my-3 rounded-xl bg-amber-50/85 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-800/60 border-l-4 border-l-amber-500 p-3.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Contoh / Penerapan</span>
        </div>
        <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100" {...props}>
          {children}
        </p>
      </div>
    );
  }

  // 5. Kotak sorotan Aturan / Ketentuan / Pasal
  if (RULE_CALLOUT_REGEX.test(text)) {
    return (
      <div className="my-3 rounded-xl bg-sky-50/85 dark:bg-sky-950/30 border border-sky-200/90 dark:border-sky-800/60 border-l-4 border-l-sky-500 p-3.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 mb-1">
          <Scale className="w-3.5 h-3.5" />
          <span>Aturan / Ketentuan</span>
        </div>
        <p className="text-sm leading-relaxed text-sky-950 dark:text-sky-100" {...props}>
          {children}
        </p>
      </div>
    );
  }

  // 6. Kotak sorotan Catatan Penting / Peringatan
  if (NOTE_CALLOUT_REGEX.test(text)) {
    const isWarning = /^peringatan\b/i.test(text);
    return (
      <div
        className={`my-3 rounded-xl border border-l-4 p-3.5 shadow-xs ${
          isWarning
            ? 'bg-rose-50/85 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 border-l-rose-500'
            : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 border-l-emerald-500'
        }`}
      >
        <div
          className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-1 ${
            isWarning ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5" />
          <span>{isWarning ? 'Peringatan' : 'Catatan Penting'}</span>
        </div>
        <p
          className={`text-sm leading-relaxed ${
            isWarning ? 'text-rose-950 dark:text-rose-100' : 'text-emerald-950 dark:text-emerald-100'
          }`}
          {...props}
        >
          {children}
        </p>
      </div>
    );
  }

  // 7. Kotak sorotan Rumus / Formula
  if (FORMULA_CALLOUT_REGEX.test(text)) {
    return (
      <div className="my-3 rounded-xl bg-violet-50/85 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 border-l-4 border-l-violet-500 p-3.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-1">
          <Calculator className="w-3.5 h-3.5" />
          <span>Rumus</span>
        </div>
        <p className="text-sm font-mono leading-relaxed text-violet-950 dark:text-violet-100" {...props}>
          {children}
        </p>
      </div>
    );
  }

  // 8. Atribusi Sumber
  if (SOURCE_REGEX.test(text)) {
    return (
      <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
        <FileText className="w-3.5 h-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
        <p className="leading-relaxed" {...props}>
          {children}
        </p>
      </div>
    );
  }

  // 9. Paragraf penjelasan standar
  return (
    <p className="my-2.5 text-[14.5px] leading-7 text-slate-700 dark:text-slate-200" {...props}>
      {children}
    </p>
  );
}

function MarkdownUnorderedList({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  const currentDepth = useContext(ListDepthContext);
  const isTopLevel = currentDepth === 0;
  return (
    <ListDepthContext.Provider value={currentDepth + 1}>
      <ul
        className={
          isTopLevel
            ? 'my-3 rounded-xl bg-white dark:bg-slate-900/75 border border-slate-200/90 dark:border-slate-800 px-4 py-3.5 pl-8 list-disc space-y-2.5 text-sm shadow-xs marker:text-indigo-500 dark:marker:text-indigo-400'
            : 'mt-2 mb-1 pl-5 list-disc space-y-1.5 border-l-2 border-indigo-200/80 dark:border-indigo-800/60 text-sm marker:text-indigo-400'
        }
        {...props}
      >
        {children}
      </ul>
    </ListDepthContext.Provider>
  );
}

function MarkdownOrderedList({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) {
  const currentDepth = useContext(ListDepthContext);
  const isTopLevel = currentDepth === 0;
  return (
    <ListDepthContext.Provider value={currentDepth + 1}>
      <ol
        className={
          isTopLevel
            ? 'my-3 rounded-xl bg-white dark:bg-slate-900/75 border border-slate-200/90 dark:border-slate-800 px-4 py-3.5 pl-9 list-decimal space-y-2.5 text-sm shadow-xs marker:font-bold marker:text-indigo-600 dark:marker:text-indigo-400'
            : 'mt-2 mb-1 pl-6 list-decimal space-y-1.5 border-l-2 border-indigo-200/80 dark:border-indigo-800/60 text-sm marker:font-semibold marker:text-indigo-500'
        }
        {...props}
      >
        {children}
      </ol>
    </ListDepthContext.Provider>
  );
}

function MarkdownListItem({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  const text = extractNodeText(children).trim();

  if (EXAMPLE_CALLOUT_REGEX.test(text)) {
    return (
      <li
        className="leading-relaxed rounded-lg bg-amber-50/75 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50 px-3 py-2 text-amber-950 dark:text-amber-100"
        {...props}
      >
        <InsideListItemContext.Provider value={true}>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded mr-1.5 align-middle">
            <Lightbulb className="w-3 h-3" />
            Contoh
          </span>
          {children}
        </InsideListItemContext.Provider>
      </li>
    );
  }

  if (RULE_CALLOUT_REGEX.test(text)) {
    return (
      <li
        className="leading-relaxed rounded-lg bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/70 dark:border-sky-800/50 px-3 py-2 text-sky-950 dark:text-sky-100"
        {...props}
      >
        <InsideListItemContext.Provider value={true}>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 px-1.5 py-0.5 rounded mr-1.5 align-middle">
            <Scale className="w-3 h-3" />
            Aturan
          </span>
          {children}
        </InsideListItemContext.Provider>
      </li>
    );
  }

  if (NOTE_CALLOUT_REGEX.test(text)) {
    return (
      <li
        className="leading-relaxed rounded-lg bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-800/50 px-3 py-2 text-emerald-950 dark:text-emerald-100"
        {...props}
      >
        <InsideListItemContext.Provider value={true}>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded mr-1.5 align-middle">
            <StickyNote className="w-3 h-3" />
            Catatan
          </span>
          {children}
        </InsideListItemContext.Provider>
      </li>
    );
  }

  return (
    <li className="leading-relaxed text-slate-700 dark:text-slate-200 pl-1" {...props}>
      <InsideListItemContext.Provider value={true}>
        {highlightLeadInLabel(children)}
      </InsideListItemContext.Provider>
    </li>
  );
}

/**
 * Keterangan ringkas tanda visual agar pembaca langsung mengenali perbedaan
 * antara penjelasan, daftar poin/aturan, contoh, dan catatan penting.
 */
export function ContentLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-[11px] ${
        compact
          ? ''
          : 'px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800'
      }`}
    >
      <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">Penanda Tata Letak:</span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
        <BookOpen className="w-3 h-3 text-indigo-500" />
        Penjelasan
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-medium">
        <ListChecks className="w-3 h-3" />
        Poin &amp; Aturan
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium">
        <Lightbulb className="w-3 h-3" />
        Contoh
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300 font-medium">
        <Scale className="w-3 h-3" />
        Ketentuan / Catatan
      </span>
    </div>
  );
}

interface FormattedContentProps {
  content: string;
  autoStructure?: boolean;
  className?: string;
}

const MARKDOWN_COMPONENTS = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="text-lg font-bold text-slate-900 dark:text-white pb-2.5 mb-3 border-b-2 border-indigo-500/30 tracking-tight"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="text-base font-bold text-slate-900 dark:text-white mt-5 mb-2.5 pl-3 border-l-4 border-indigo-600 dark:border-indigo-400 py-0.5"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text = extractNodeText(children).trim();
    if (/wajib\s+diingat/i.test(text)) {
      return (
        <div className="mt-6 mb-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-50 to-amber-50/70 dark:from-indigo-950/60 dark:to-amber-950/30 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-200" {...props}>
            {children}
          </h3>
        </div>
      );
    }
    return (
      <div className="mt-5 mb-2.5 pb-1.5 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-[15px] font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2" {...props}>
          {children}
        </h3>
      </div>
    );
  },
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-3.5 mb-1.5" {...props}>
      {children}
    </h4>
  ),
  p: MarkdownParagraph,
  ul: MarkdownUnorderedList,
  ol: MarkdownOrderedList,
  li: MarkdownListItem,
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => {
    const text = extractNodeText(children).trim();
    const isExample = EXAMPLE_CALLOUT_REGEX.test(text);
    return (
      <blockquote
        className={`my-3 pl-4 pr-3.5 py-2.5 border-l-4 rounded-r-xl text-sm leading-relaxed ${
          isExample
            ? 'border-amber-500 bg-amber-50/75 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100'
            : 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/25 text-slate-700 dark:text-slate-300 italic'
        }`}
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-slate-900 dark:text-white" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic text-slate-700 dark:text-slate-300" {...props}>
      {children}
    </em>
  ),
  code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-mono text-xs"
      {...props}
    >
      {children}
    </code>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-5 border-slate-200 dark:border-slate-800" {...props} />
  ),
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
      <table className="w-full text-left border-collapse text-xs sm:text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-semibold" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800/80 align-top" {...props}>
      {children}
    </td>
  ),
};

export default function FormattedContent({
  content,
  autoStructure = false,
  className = '',
}: FormattedContentProps) {
  const normalizedContent = React.useMemo(() => {
    const base = autoStructure ? formatStructuredModuleText(content) : content;
    return prepareMarkdownForDisplay(base);
  }, [content, autoStructure]);

  return (
    <div className={`space-y-1.5 text-slate-800 dark:text-slate-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={MARKDOWN_COMPONENTS as any}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
