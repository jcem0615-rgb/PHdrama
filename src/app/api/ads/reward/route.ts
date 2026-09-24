import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { REWARDED_ADS_ENABLED } from '@/lib/supabase/env';
import { getEpisode, isDemoMode } from '@/server/repository';
import { demoAddUnlock, readDemoState, writeDemoState } from '@/server/demo-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rewarded-ad unlock.
 *
 * Off by default. A browser POST saying "I watched the ad" is not proof, so the
 * live path is intentionally NOT implemented here: it belongs in a handler that
 * receives the ad network's server-side-verification callback, validates its
 * signature, and only then calls `grant_ad_unlock` with the service role.
 *
 * Until a network is chosen (see docs/BUILD_ORDER.md, Phase 8) this endpoint
 * only works in demo mode and only when the flag is on.
 */
export async function POST(req: NextRequest) {
  if (!REWARDED_ADS_ENABLED) return fail('FEATURE_DISABLED');

  const body = (await req.json().catch(() => null)) as { episodeId?: string } | null;
  const episodeId = body?.episodeId;
  if (!episodeId) return fail('INVALID_INPUT');

  const episode = await getEpisode(episodeId);
  if (!episode) return fail('NOT_FOUND');

  if (!isDemoMode()) {
    // No SSV provider wired up yet — refuse rather than trust the client.
    return fail('FEATURE_DISABLED');
  }

  const state = await readDemoState();
  demoAddUnlock(state, episode.id);
  await writeDemoState(state);

  return ok({ unlocked: true });
}
