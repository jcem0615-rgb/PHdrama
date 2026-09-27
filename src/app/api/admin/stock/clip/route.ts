import type { NextRequest } from 'next/server';

import { fail } from '@/lib/api';
import { getStaff } from '@/server/staff';
import { isPexelsFile } from '@/server/story/stock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Streams one Pexels file through this origin.
 *
 * The renderer draws each frame of the clip into a canvas and records the
 * canvas. A cross-origin video taints that canvas, and `captureStream` on a
 * tainted canvas throws a SecurityError — so the bytes have to arrive from
 * here, not from the CDN.
 *
 * Two things keep this from being an open proxy: it is behind `getStaff()`,
 * and the URL must be a pexels.com file. Anything else is somebody else's
 * server and this route will not fetch it.
 */
export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const target = req.nextUrl.searchParams.get('url');
  if (!target || !isPexelsFile(target)) return fail('INVALID_INPUT');

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      // Pass the range header through so the browser can seek and so it does
      // not have to hold the whole file to start playing.
      headers: req.headers.get('range') ? { range: req.headers.get('range') as string } : {},
      cache: 'no-store',
    });
  } catch {
    return fail('INTERNAL');
  }

  if (!upstream.ok && upstream.status !== 206) return fail('NOT_FOUND');

  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') ?? 'video/mp4');
  headers.set('cache-control', 'private, max-age=3600');
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
