'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Crown, Lock, PlayCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';
import { formatCoins } from '@/lib/format';
import type { ApiResponse, Episode, Viewer } from '@/lib/types';

interface Props {
  episode: Episode;
  viewer: Viewer | null;
  rewardedAdsEnabled: boolean;
  open: boolean;
  onClose: () => void;
}

/** The paywall. Three ways forward: coins, an ad, or VIP. */
export default function UnlockSheet({ episode, viewer, rewardedAdsEnabled, open, onClose }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = viewer?.coinBalance ?? 0;
  const affordable = balance >= episode.coinPrice;

  async function unlockWithCoins() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes/${episode.id}/unlock`, { method: 'POST' });
      const body = (await res.json()) as ApiResponse<{ balance: number }>;
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithAd() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ads/reward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ episodeId: episode.id }),
      });
      const body = (await res.json()) as ApiResponse<unknown>;
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="relative w-full max-w-md rounded-t-3xl border-t border-white/10 bg-ink-900 p-6 pb-[calc(1.5rem+var(--safe-bottom))] shadow-2xl"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-ink-200"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-flame-500/15 text-flame-400">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">{copy.unlock.title}</h2>
                <p className="text-xs text-ink-400">
                  {episode.seriesTitle} · {copy.player.episodeLabel(episode.episodeNumber)}
                </p>
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-flame-500/10 px-4 py-3 text-sm text-flame-400">{error}</p>
            )}

            <div className="space-y-3">
              <button
                type="button"
                disabled={busy || !affordable}
                onClick={unlockWithCoins}
                className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-flame-500 to-ember-500 px-5 py-4 text-left font-semibold text-white disabled:from-ink-800 disabled:to-ink-800 disabled:text-ink-400"
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Coins className="h-5 w-5" />
                  {busy ? copy.unlock.unlocking : copy.unlock.withCoins(episode.coinPrice)}
                </span>
                <span className="whitespace-nowrap text-xs font-normal opacity-80">
                  {copy.unlock.balanceLeft(formatCoins(balance))}
                </span>
              </button>

              {!affordable && (
                <Link
                  href="/coins"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coin-500/15 px-5 py-3.5 text-sm font-semibold text-coin-500"
                >
                  {copy.unlock.topUp}
                </Link>
              )}

              <button
                type="button"
                disabled={busy || !rewardedAdsEnabled}
                onClick={unlockWithAd}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left font-medium disabled:opacity-40"
              >
                <PlayCircle className="h-5 w-5 text-ink-200" />
                <span>
                  {copy.unlock.withAd}
                  {!rewardedAdsEnabled && (
                    <span className="block text-xs font-normal text-ink-400">
                      {copy.unlock.adDisabled}
                    </span>
                  )}
                </span>
              </button>

              <Link
                href="/coins#vip"
                className="flex w-full items-center gap-3 rounded-2xl border border-vip-500/30 bg-vip-500/10 px-5 py-4 font-medium text-vip-500"
              >
                <Crown className="h-5 w-5" />
                {copy.unlock.goVip}
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
