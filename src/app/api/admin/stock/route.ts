import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { getStaff } from '@/server/staff';
import { findClip, hasStock } from '@/server/story/stock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether stock footage is available at all. */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  return ok({ available: hasStock() });
}

/** Find a clip for one scene. Returns a same-origin URL for the renderer. */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const body = (await req.json().catch(() => null)) as {
    scene?: { title?: string; beat?: string; hook?: string };
  } | null;

  const scene = body?.scene;
  if (!scene || typeof scene.title !== 'string') return fail('INVALID_INPUT');

  const result = await findClip({
    title: scene.title,
    beat: scene.beat ?? '',
    hook: scene.hook ?? '',
  });

  if ('error' in result) {
    if (result.error === 'NO_KEY') return fail('FEATURE_DISABLED', copy.admin.stockNoKey);
    if (result.error === 'REJECTED') return fail('FORBIDDEN', copy.admin.stockRejected);
    if (result.error === 'RATE_LIMITED') return fail('RATE_LIMITED', copy.admin.stockRateLimited);
    if (result.error === 'NOTHING_FOUND') return fail('NOT_FOUND', copy.admin.stockNothing);
    return fail('INTERNAL', copy.admin.stockFailed);
  }

  const { clip, query } = result;

  return ok({
    query,
    clip: {
      id: clip.id,
      width: clip.width,
      height: clip.height,
      durationSeconds: clip.durationSeconds,
      photographer: clip.photographer,
      photographerUrl: clip.photographerUrl,
      sourceUrl: clip.sourceUrl,
      // Same-origin: a cross-origin video taints the canvas and MediaRecorder
      // then refuses to capture it.
      src: `/api/admin/stock/clip?url=${encodeURIComponent(clip.link)}`,
    },
  });
}
