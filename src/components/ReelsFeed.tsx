'use client';

import { ChevronUp, Coins, Crown, Heart, Lock, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import SecureVideoPlayer from '@/components/SecureVideoPlayer';
import UnlockSheet from '@/components/UnlockSheet';
import { canWatch } from '@/lib/access';
import { copy } from '@/lib/copy';
import { formatCount } from '@/lib/format';
import type { Episode, Viewer } from '@/lib/types';

interface Props {
  episodes: Episode[];
  viewer: Viewer | null;
  rewardedAdsEnabled: boolean;
}

/**
 * The vertical snap feed. Only the visible reel holds a stream; neighbours are
 * torn down so a scroll through twenty episodes does not open twenty sockets.
 */
export default function ReelsFeed({ episodes, viewer, rewardedAdsEnabled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [sheetFor, setSheetFor] = useState<Episode | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (Number.isFinite(index)) setActiveIndex(index);
          }
        }
      },
      { root, threshold: [0.6] },
    );

    const items = root.querySelectorAll('[data-index]');
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [episodes.length]);

  const unlockedMap = useMemo(
    () => Object.fromEntries(episodes.map((e) => [e.id, canWatch(e, viewer)])),
    [episodes, viewer],
  );

  if (episodes.length === 0) {
    return (
      <div className="grid h-[100dvh] place-items-center text-ink-400">Walang laman pa. Check back soon.</div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="snap-feed h-[100dvh] overflow-y-scroll">
        {episodes.map((episode, index) => {
          const unlocked = unlockedMap[episode.id];
          const isActive = index === activeIndex;

          return (
            <section key={episode.id} data-index={index} className="snap-item relative h-[100dvh] w-full">
              <SecureVideoPlayer
                episode={episode}
                active={isActive}
                unlocked={unlocked}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
              />

              {!unlocked && (
                <button
                  type="button"
                  onClick={() => setSheetFor(episode)}
                  className="absolute inset-0 z-10 grid place-items-center bg-black/55 backdrop-blur-[2px]"
                >
                  <span className="flex flex-col items-center gap-3 px-8 text-center">
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 backdrop-blur">
                      <Lock className="h-6 w-6" />
                    </span>
                    <span className="text-base font-semibold">{copy.unlock.title}</span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-flame-500 to-ember-500 px-5 py-2.5 text-sm font-semibold">
                      <Coins className="h-4 w-4" />
                      {copy.unlock.withCoins(episode.coinPrice)}
                    </span>
                  </span>
                </button>
              )}

              {/* right rail */}
              <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5">
                <button
                  type="button"
                  aria-label="Like"
                  onClick={() => setLiked((l) => ({ ...l, [episode.id]: !l[episode.id] }))}
                  className="flex flex-col items-center gap-1"
                >
                  <Heart
                    className={`h-7 w-7 ${liked[episode.id] ? 'fill-flame-500 text-flame-500' : 'text-white'}`}
                  />
                  <span className="text-[10px] text-white/80">
                    {formatCount(12_400 + episode.episodeNumber * 137 + (liked[episode.id] ? 1 : 0))}
                  </span>
                </button>

                <Link
                  href={`/series/${episode.seriesSlug}`}
                  aria-label="Series"
                  className="flex flex-col items-center gap-1"
                >
                  <Share2 className="h-6 w-6" />
                  <span className="text-[10px] text-white/80">Series</span>
                </Link>
              </div>

              {/* bottom meta */}
              <div className="absolute inset-x-0 bottom-0 z-20 p-4 pb-[calc(5.5rem+var(--safe-bottom))]">
                <Link href={`/series/${episode.seriesSlug}`} className="block">
                  <h2 className="text-lg font-bold leading-tight">{episode.seriesTitle}</h2>
                </Link>
                <p className="mt-1 flex items-center gap-2 text-xs text-white/70">
                  <span>{copy.player.episodeLabel(episode.episodeNumber)}</span>
                  {episode.isFree ? (
                    <span className="rounded-full bg-jade-500/20 px-2 py-0.5 text-[10px] font-semibold text-jade-500">
                      {copy.series.free}
                    </span>
                  ) : viewer?.isVip ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-vip-500/20 px-2 py-0.5 text-[10px] font-semibold text-vip-500">
                      <Crown className="h-3 w-3" /> VIP
                    </span>
                  ) : null}
                </p>
                {index === 0 && (
                  <p className="mt-3 flex items-center gap-1 text-[11px] text-white/40">
                    <ChevronUp className="h-3 w-3" /> Swipe up for more
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {sheetFor && (
        <UnlockSheet
          episode={sheetFor}
          viewer={viewer}
          rewardedAdsEnabled={rewardedAdsEnabled}
          open
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  );
}
