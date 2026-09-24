import 'server-only';

import { cookies } from 'next/headers';

import { hueFromKey } from '@/lib/poster';
import { PERSIST_COOKIE, persistenceOptions } from '@/lib/session-persistence';
import type { Episode, Series } from '@/lib/types';

import { seal, unsign } from './signed-cookie';

/**
 * Stories posted to the reels feed in demo mode.
 *
 * Demo mode has no database, so a posted story lives in its own cookie — which
 * is why it is capped hard: cookies stop at ~4 KB. Only what the feed needs is
 * kept (title, hook, duration); the full scripts are never stored.
 *
 * Every posted episode is FREE. The video behind them is the bundled preview
 * clip, not the story, and charging coins for that would be a lie.
 */

const COOKIE = 'phd_studio';
const VERSION = 2;
// One story at a time: the cookie has to carry a beat per episode now, and
// 4 KB does not stretch to two.
const MAX_STORIES = 1;
const MAX_SCENES = 12;
const MAX_TITLE = 40;
const MAX_BEAT = 76;
const MAX_HOOK = 64;

/** Cookie budget is tight, so long fields get cut — at a word boundary. */
function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export interface DemoPostedScene {
  n: number;
  title: string;
  beat: string;
  hook: string;
  seconds: number;
}

export interface DemoPostedStory {
  slug: string;
  title: string;
  logline: string;
  tags: string[];
  postedAt: number;
  scenes: DemoPostedScene[];
}

type Wire = {
  v: number;
  s: Array<
    [string, string, string, string[], number, Array<[number, string, string, string, number]>]
  >;
};

function encode(stories: DemoPostedStory[]): string {
  const wire: Wire = {
    v: VERSION,
    s: stories.slice(0, MAX_STORIES).map((story) => [
      story.slug,
      clip(story.title, 60),
      clip(story.logline, 140),
      story.tags.slice(0, 3),
      story.postedAt,
      story.scenes
        .slice(0, MAX_SCENES)
        .map((scene) => [
          scene.n,
          clip(scene.title, MAX_TITLE),
          clip(scene.beat, MAX_BEAT),
          clip(scene.hook, MAX_HOOK),
          scene.seconds,
        ]),
    ]),
  };
  return seal(Buffer.from(JSON.stringify(wire)).toString('base64url'));
}

function decode(raw: string | undefined): DemoPostedStory[] {
  const payload = unsign(raw);
  if (!payload) return [];

  try {
    const wire = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Wire;
    if (wire.v !== VERSION) return [];

    return wire.s.map(([slug, title, logline, tags, postedAt, scenes]) => ({
      slug,
      title,
      logline,
      tags,
      postedAt,
      scenes: scenes.map(([n, sceneTitle, beat, hook, seconds]) => ({
        n,
        title: sceneTitle,
        beat,
        hook,
        seconds,
      })),
    }));
  } catch {
    return [];
  }
}

export async function readPostedStories(): Promise<DemoPostedStory[]> {
  const jar = await cookies();
  return decode(jar.get(COOKIE)?.value);
}

export async function writePostedStories(stories: DemoPostedStory[]): Promise<void> {
  const jar = await cookies();
  const remember = jar.get(PERSIST_COOKIE)?.value === '1';

  jar.set(
    COOKIE,
    encode(stories),
    persistenceOptions(
      {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
      remember,
    ),
  );
}

export async function clearPostedStories(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function slugForStory(title: string, seed: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'story';
  return `studio-${base}-${seed.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// projections into the shapes the customer app already renders
// ---------------------------------------------------------------------------

export function postedStoryToSeries(story: DemoPostedStory): Series {
  return {
    id: story.slug,
    slug: story.slug,
    title: story.title,
    synopsis: story.logline,
    tags: story.tags,
    // Every preview episode is free, so the whole run is inside the free window.
    freeEpisodeCount: story.scenes.length,
    isFeatured: false,
    episodeCount: story.scenes.length,
    viewCount: 0,
    posterHue: hueFromKey(story.slug),
    isPreview: true,
  };
}

export function postedStoryToEpisodes(story: DemoPostedStory): Episode[] {
  return story.scenes.map((scene) => ({
    id: `${story.slug}-${String(scene.n).padStart(2, '0')}`,
    seriesId: story.slug,
    seriesSlug: story.slug,
    seriesTitle: story.title,
    episodeNumber: scene.n,
    title: scene.title,
    synopsis: scene.hook,
    durationSeconds: scene.seconds,
    coinPrice: 0,
    isFree: true,
    beat: scene.beat,
    posterHue: (hueFromKey(story.slug) + scene.n * 7) % 360,
    isPreview: true,
  }));
}
