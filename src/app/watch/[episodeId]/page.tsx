import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import WatchScreen from '@/components/WatchScreen';
import { copy } from '@/lib/copy';
import { REWARDED_ADS_ENABLED } from '@/lib/supabase/env';
import { getEpisode, getViewer, listEpisodes } from '@/server/repository';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/watch/[episodeId]'>): Promise<Metadata> {
  const { episodeId } = await params;
  const episode = await getEpisode(episodeId);
  if (!episode) return { title: copy.appName };
  return { title: `${episode.seriesTitle} — ${copy.player.episodeLabel(episode.episodeNumber)}` };
}

export default async function WatchPage({ params }: PageProps<'/watch/[episodeId]'>) {
  const { episodeId } = await params;
  const episode = await getEpisode(episodeId);
  if (!episode) notFound();

  const [siblings, viewer] = await Promise.all([listEpisodes(episode.seriesSlug), getViewer()]);

  const index = siblings.findIndex((e) => e.id === episode.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  return (
    <WatchScreen
      episode={episode}
      viewer={viewer}
      previousId={previous?.id ?? null}
      nextId={next?.id ?? null}
      rewardedAdsEnabled={REWARDED_ADS_ENABLED}
    />
  );
}
