import { Coins, Lock, Play } from 'lucide-react';
import Link from 'next/link';

import { canWatch } from '@/lib/access';
import { formatDuration } from '@/lib/format';
import type { Episode, Viewer } from '@/lib/types';

/**
 * The episode list on a series page. Lock badges come from the same rule the
 * database enforces — see src/lib/access.ts.
 */
export default function EpisodeGrid({ episodes, viewer }: { episodes: Episode[]; viewer: Viewer | null }) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {episodes.map((episode) => {
        const unlocked = canWatch(episode, viewer);
        return (
          <li key={episode.id}>
            <Link
              href={`/watch/${episode.id}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-center transition-colors ${
                unlocked
                  ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                  : 'border-white/5 bg-white/[0.02] text-ink-400'
              }`}
            >
              <span className="text-base font-bold">{episode.episodeNumber}</span>
              <span className="mt-0.5 text-[9px] text-ink-400">
                {formatDuration(episode.durationSeconds)}
              </span>

              {unlocked ? (
                <Play className="absolute right-1.5 top-1.5 h-3 w-3 fill-jade-500 text-jade-500" />
              ) : (
                <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-ink-400" />
              )}

              {!unlocked && (
                <span className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-0.5 text-[9px] font-semibold text-coin-500">
                  <Coins className="h-2.5 w-2.5" />
                  {episode.coinPrice}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
