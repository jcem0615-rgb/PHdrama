import type { Metadata } from 'next';

import ReelsFeed from '@/components/ReelsFeed';
import { copy } from '@/lib/copy';
import { REWARDED_ADS_ENABLED } from '@/lib/supabase/env';
import { getViewer, listFeedEpisodes } from '@/server/repository';

export const metadata: Metadata = { title: copy.nav.reels };
export const dynamic = 'force-dynamic';

export default async function ReelsPage() {
  const [episodes, viewer] = await Promise.all([listFeedEpisodes(), getViewer()]);

  return (
    <main>
      <ReelsFeed episodes={episodes} viewer={viewer} rewardedAdsEnabled={REWARDED_ADS_ENABLED} />
    </main>
  );
}
