import { Coins, Crown, LogIn } from 'lucide-react';
import Link from 'next/link';

import { copy } from '@/lib/copy';
import { formatCoins } from '@/lib/format';
import type { Viewer } from '@/lib/types';

export default function TopBar({ viewer, demo }: { viewer: Viewer | null; demo: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="text-lg font-black tracking-tight text-gradient">PH</span>
          <span className="text-lg font-black tracking-tight">Drama</span>
          {demo && (
            <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-ink-200">
              {copy.demo.badge}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          {viewer?.isVip && (
            <span className="inline-flex items-center gap-1 rounded-full bg-vip-500/15 px-2.5 py-1 text-[11px] font-semibold text-vip-500">
              <Crown className="h-3.5 w-3.5" />
              VIP
            </span>
          )}
          {viewer ? (
            <Link
              href="/coins"
              className="inline-flex items-center gap-1.5 rounded-full bg-coin-500/15 px-3 py-1.5 text-xs font-bold text-coin-500"
            >
              <Coins className="h-4 w-4" />
              {formatCoins(viewer.coinBalance)}
            </Link>
          ) : (
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"
            >
              <LogIn className="h-3.5 w-3.5" />
              {copy.auth.signIn}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
