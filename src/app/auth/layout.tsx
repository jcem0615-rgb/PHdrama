import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { copy } from '@/lib/copy';

export default function AuthLayout({ children }: LayoutProps<'/auth'>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 self-start text-xs text-ink-400 transition-colors hover:text-ink-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {copy.auth.browseAsGuest}
      </Link>

      <div className="mb-7 flex items-baseline gap-1.5">
        <span className="text-2xl font-black tracking-tight text-gradient">PH</span>
        <span className="text-2xl font-black tracking-tight">Drama</span>
      </div>

      {children}

      <p className="mt-8 text-center text-[11px] text-ink-400">{copy.auth.guestNote}</p>
    </main>
  );
}
