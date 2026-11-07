'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

interface QuotaData {
  used: number;
  limit: number;
  remaining: number | null;
  isDev?: boolean;
}

export default function QuotaBadge() {
  const [quota, setQuota] = useState<QuotaData | null>(null);

  useEffect(() => {
    fetch('/api/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.used === 'number') {
          setQuota(data);
        }
      })
      .catch(() => {});
  }, []);

  if (!quota) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
      {quota.limit === 0 ? (
        <span>
          {quota.isDev ? 'Mode Dev: Tanpa Batas Kuota' : 'Tanpa Batas Kuota'} (<strong>{quota.used}</strong> panggilan hari ini)
        </span>
      ) : (
        <span>
          Sisa Kuota AI: <strong>{quota.remaining}</strong> / {quota.limit} panggilan hari ini
        </span>
      )}
    </div>
  );
}
