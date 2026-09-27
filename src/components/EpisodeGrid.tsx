import { Coins, Lock, Play } from 'lucide-react';
import Link from 'next/link';

import { canWatch } from '@/lib/access';
import { formatDuration } from '@/lib/format';
import { posterUrl } from '@/lib/poster';
import type { Episode, Viewer } from '@/lib/types';

/**
 * The episode list on a series page.
 *
 * It used to be a grid of bare numbers — a tile said "3" and "1:33" and nothing
 * else, so there was no way to tell one episode from another or to know what
 * you were about to unlock. Each row now carries the episode's own artwork,
 * title and opening line.
 *
 * Lock badges come from the same rule the database enforces — see
 * src/lib/access.ts.
 */
export default function EpisodeGrid({
  episodes,
  viewer,
}: {
  episodes: Episode[];
  viewer: Viewer | null;
}) {
  return (
    <ul className="space-y-2">
      {episodes.map((episode) => {
        const unlocked = canWatch(episode, viewer);
        return (
          <li key={episode.id}>
            <Link
              href={`/watch/${episode.id}`}
              className={`flex gap-3 rounded-xl border p-2 transition-colors ${
                unlocked
                  ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterUrl(episode.id, true)}
                  alt=""
                  className={`h-full w-full object-cover ${unlocked ? '' : 'opacity-50'}`}
                  loading="lazy"
                />
                <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[10px] font-bold text-white">
                  {episode.episodeNumber}
                </span>
              </div>

              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`truncate text-sm font-semibold ${unlocked ? 'text-white' : 'text-ink-400'}`}
                  >
                    {episode.title}
                  </p>
                  {unlocked ? (
                    <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-jade-500 text-jade-500" />
                  ) : (
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                  )}
                </div>

                {episode.synopsis && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-400">
                    {episode.synopsis}
                  </p>
                )}

                <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
                  <span>{formatDuration(episode.durationSeconds)}</span>
                  {!unlocked && (
                    <span className="flex items-center gap-0.5 font-semibold text-coin-500">
                      <Coins className="h-2.5 w-2.5" />
                      {episode.coinPrice}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
