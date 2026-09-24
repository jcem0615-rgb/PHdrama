import type { NextRequest } from 'next/server';

import { canWatch } from '@/lib/access';
import { codeFromPostgres, fail, ok } from '@/lib/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { getEpisode, getViewer, isDemoMode } from '@/server/repository';
import {
  applyLedger,
  demoAddUnlock,
  demoViewer,
  readDemoState,
  writeDemoState,
} from '@/server/demo-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Spend coins on one episode.
 *
 * Live mode is a single `rpc()` into `unlock_episode_with_coins`, which locks
 * the profile row, checks the balance, writes the ledger and the unlock inside
 * one transaction. Nothing here decides money.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const episode = await getEpisode(id);
  if (!episode) return fail('NOT_FOUND');

  if (isDemoMode()) {
    const state = await readDemoState();
    const viewer = demoViewer(state);

    if (canWatch(episode, viewer)) {
      return ok({ charged: 0, balance: state.coins });
    }
    if (state.coins < episode.coinPrice) {
      return fail('INSUFFICIENT_COINS');
    }

    applyLedger(state, -episode.coinPrice, 'episode_unlock');
    demoAddUnlock(state, episode.id);
    await writeDemoState(state);

    return ok({ charged: episode.coinPrice, balance: state.coins });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const viewer = await getViewer();
  if (!viewer) return fail('UNAUTHENTICATED');

  const { data, error } = await supabase.rpc('unlock_episode_with_coins', { p_episode: id });
  if (error) return fail(codeFromPostgres(error.message));

  const result = data as { charged: number; balance: number };
  return ok({ charged: result.charged, balance: result.balance });
}
