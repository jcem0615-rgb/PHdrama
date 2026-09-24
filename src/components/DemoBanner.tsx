'use client';

import { Info, RotateCcw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';

/** Only rendered in demo mode. Says plainly that nothing here is real money. */
export default function DemoBanner() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (hidden) return null;

  async function reset() {
    setResetting(true);
    await fetch('/api/demo/reset', { method: 'POST' }).catch(() => null);
    setResetting(false);
    router.refresh();
  }

  return (
    <div className="mx-auto mb-4 max-w-md px-4">
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-4 pr-10">
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setHidden(true)}
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <p className="flex gap-2 text-xs leading-relaxed text-ink-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-flame-400" />
          <span>{copy.demo.banner}</span>
        </p>

        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-medium text-ink-200 disabled:opacity-50"
        >
          <RotateCcw className={`h-3 w-3 ${resetting ? 'animate-spin' : ''}`} />
          {copy.demo.reset}
        </button>
      </div>
    </div>
  );
}
