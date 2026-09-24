import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import {
  type DemoPostedStory,
  readPostedStories,
  slugForStory,
  writePostedStories,
} from '@/server/demo-studio';
import { isDemoMode } from '@/server/repository';
import { getStaff } from '@/server/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STORIES = 2;

/**
 * Demo-mode "post to reels".
 *
 * Live mode uses `publish_story` instead; this exists because demo mode has no
 * database and posting is the whole point of the Studio. The posted story lands
 * in its own cookie and shows up in the customer's reels feed immediately.
 */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');
  if (!isDemoMode()) return fail('FEATURE_DISABLED');

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    logline?: string;
    tags?: string[];
    scenes?: { scene_number: number; title: string; hook: string; duration_seconds: number }[];
  } | null;

  const title = body?.title?.trim();
  const scenes = body?.scenes;

  if (!title || !Array.isArray(scenes) || scenes.length === 0) {
    return fail('INVALID_INPUT');
  }

  const story: DemoPostedStory = {
    slug: slugForStory(title, randomBytes(3).toString('hex')),
    title,
    logline: body?.logline?.trim() ?? '',
    tags: Array.isArray(body?.tags) ? body.tags.slice(0, 3) : [],
    postedAt: Date.now(),
    scenes: scenes.map((scene) => ({
      n: scene.scene_number,
      title: scene.title,
      hook: scene.hook,
      seconds: Math.max(1, Math.round(scene.duration_seconds)),
    })),
  };

  const existing = await readPostedStories();
  const next = [story, ...existing].slice(0, MAX_STORIES);
  await writePostedStories(next);

  return ok({ slug: story.slug, episodes: story.scenes.length, dropped: existing.length + 1 > MAX_STORIES });
}
