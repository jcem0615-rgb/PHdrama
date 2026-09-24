import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { DEMO_FALLBACK_CLIP, demoStreamFor } from '@/lib/demo/catalog';
import { canWatch } from '@/lib/access';
import { createServerSupabase } from '@/lib/supabase/server';
import type { PlaybackTicket } from '@/lib/types';
import { createAdminSupabase } from '@/server/supabase-admin';
import { getEpisode, getViewer, isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICKET_SECONDS = 90;

/** Random, meaningless on its own, resolvable only through viewer_sessions. */
function watermarkCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

/**
 * The only door to a playable URL.
 *
 * Postgres decides access (`can_watch_episode`), then — and only then — the
 * service role mints a short-lived signed URL. A locked episode never has a
 * URL to leak.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const episode = await getEpisode(id);
  if (!episode) return fail('NOT_FOUND');

  const expiresAt = new Date(Date.now() + TICKET_SECONDS * 1000).toISOString();

  if (isDemoMode()) {
    const viewer = await getViewer();
    if (!canWatch(episode, viewer)) return fail('LOCKED');

    return ok<PlaybackTicket>({
      src: demoStreamFor(id),
      fallbackSrc: DEMO_FALLBACK_CLIP,
      watermarkCode: watermarkCode(),
      expiresAt,
    });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  // Ask the database, never the client.
  const { data: allowed, error } = await supabase.rpc('can_watch_episode', {
    p_user: userId,
    p_episode: id,
  });
  if (error) return fail('INTERNAL');
  if (!allowed) return fail('LOCKED');

  const admin = createAdminSupabase();
  if (!admin) return fail('INTERNAL');

  const { data: row } = await admin.from('episodes').select('hls_path').eq('id', id).maybeSingle();
  if (!row?.hls_path) return fail('NOT_FOUND');

  const { data: signed, error: signError } = await admin.storage
    .from('videos')
    .createSignedUrl(row.hls_path, TICKET_SECONDS);
  if (signError || !signed) return fail('INTERNAL');

  const code = watermarkCode();

  if (userId) {
    await admin.from('viewer_sessions').insert({
      user_id: userId,
      episode_id: id,
      watermark_code: code,
      // Deliberately no IP. See docs/CONTENT_PROTECTION.md (RA 10173).
      user_agent: _req.headers.get('user-agent')?.slice(0, 200) ?? null,
    });
  }

  return ok<PlaybackTicket>({
    src: signed.signedUrl,
    fallbackSrc: null,
    watermarkCode: code,
    expiresAt,
  });
}
