'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Coins, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import UnlockSheet from '@/components/UnlockSheet';
import { canWatch } from '@/lib/access';
import { copy } from '@/lib/copy';
import type { Episode, Viewer } from '@/lib/types';

interface Props {
  episode: Episode;
  viewer: Viewer | null;
  previousId: string | null;
  nextId: string | null;
  rewardedAdsEnabled: boolean;
}

/** Single-episode screen: full-bleed player, prev/next, and the paywall. */
export default function WatchScreen({ episode, viewer, previousId, nextId, rewardedAdsEnabled }: Props) {
  const [muted, setMuted] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const unlocked = canWatch(episode, viewer);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <SecureVideoPlayer
        episode={episode}
        active
        unlocked={unlocked}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      />

      {!unlocked && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-[2px]"
        >
          <span className="flex flex-col items-center gap-3 px-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 backdrop-blur">
              <Lock className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold">{copy.unlock.title}</span>
            <span className="text-xs text-white/60">{copy.unlock.subtitle}</span>
            <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-flame-500 to-ember-500 px-5 py-2.5 text-sm font-semibold">
              <Coins className="h-4 w-4" />
              {copy.unlock.withCoins(episode.coinPrice)}
            </span>
          </span>
        </button>
      )}

      <Link
        href={`/series/${episode.seriesSlug}`}
        aria-label="Back to series"
        className="absolute left-4 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-30 grid h-9 w-9 place-items-center rounded-full bg-black/40 backdrop-blur"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="absolute inset-x-0 bottom-0 z-20 p-4 pb-[calc(1.25rem+var(--safe-bottom))]">
        <Link href={`/series/${episode.seriesSlug}`}>
          <h1 className="text-lg font-bold leading-tight">{episode.seriesTitle}</h1>
        </Link>
        <p className="mt-0.5 text-xs text-white/60">{copy.player.episodeLabel(episode.episodeNumber)}</p>

        <div className="mt-4 flex items-center gap-2">
          {previousId ? (
            <Link
              href={`/watch/${previousId}`}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/10 py-3 text-xs font-semibold backdrop-blur"
            >
              <ChevronLeft className="h-4 w-4" />
              {copy.player.previousEpisode}
            </Link>
          ) : (
            <span className="flex-1" />
          )}

          {nextId && (
            <Link
              href={`/watch/${nextId}`}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/15 py-3 text-xs font-semibold backdrop-blur"
            >
              {copy.player.nextEpisode}
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <UnlockSheet
        episode={episode}
        viewer={viewer}
        rewardedAdsEnabled={rewardedAdsEnabled}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </main>
  );
}
