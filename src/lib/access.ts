import type { Episode, Viewer } from '@/lib/types';

/**
 * Mirror of `can_watch_episode()` in 0001_init.sql, used ONLY to decide what the
 * UI renders. Postgres stays the authority: the play endpoint asks the database
 * again before it issues a signed URL, so a tampered client gets nothing.
 */
export function canWatch(episode: Episode, viewer: Viewer | null): boolean {
  if (episode.isFree) return true;
  if (!viewer) return false;
  if (viewer.isVip) return true;
  return viewer.unlockedEpisodeIds.includes(episode.id);
}

export type LockReason = 'none' | 'sign-in' | 'coins';

export function lockReason(episode: Episode, viewer: Viewer | null): LockReason {
  if (canWatch(episode, viewer)) return 'none';
  if (!viewer) return 'sign-in';
  return 'coins';
}

export function isVipActive(vipExpiresAt: string | null): boolean {
  return Boolean(vipExpiresAt && new Date(vipExpiresAt).getTime() > Date.now());
}

/** Coins the viewer still needs before this episode is affordable. */
export function coinsShort(episode: Episode, viewer: Viewer | null): number {
  if (!viewer) return episode.coinPrice;
  return Math.max(0, episode.coinPrice - viewer.coinBalance);
}
