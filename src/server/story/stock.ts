import 'server-only';

/**
 * Stock footage from Pexels.
 *
 * The one route to real people on screen that is not billed per second of
 * output: Pexels' library is free, and the API key is free too. It is a key
 * though — the first one in this app that is not optional for the feature it
 * powers — and it stays server-side like the others.
 *
 * What this cannot do is match your script. A generated clip is about your
 * scene; a stock clip is about a mood. The search below leans on that: it asks
 * for the location and the feeling, not the plot.
 *
 * Licensing is the caller's problem to check before monetising — Pexels allows
 * commercial use but forbids, among other things, selling unaltered copies and
 * implying the people in a clip endorse anything. We return the photographer
 * and the source URL on every clip so the Studio can credit them, which is
 * good practice whatever the licence requires. See the gaps list in CLAUDE.md.
 */

export interface StockClip {
  id: number;
  /** Direct file URL on the Pexels CDN — proxy it, do not hand it to a canvas. */
  link: string;
  width: number;
  height: number;
  durationSeconds: number;
  photographer: string;
  photographerUrl: string;
  /** The clip's page, for credit. */
  sourceUrl: string;
}

export type StockError = 'NO_KEY' | 'REJECTED' | 'RATE_LIMITED' | 'NOTHING_FOUND' | 'FAILED';

export function hasStock(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

/** Only these hosts may be proxied. Anything else is somebody else's server. */
export function isPexelsFile(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'pexels.com' || url.hostname.endsWith('.pexels.com');
  } catch {
    return false;
  }
}

interface SceneLike {
  title: string;
  beat: string;
  hook: string;
}

/**
 * What to search for.
 *
 * Stock libraries are indexed by subject and mood, not by plot, so a query
 * built from the episode's nouns returns nothing usable. These map the same
 * signals the canvas renderer reads for its location into words a stock
 * library actually has footage under.
 */
const QUERIES: readonly [RegExp, string][] = [
  [/hospital|clinic|ward|morgue|doctor|nurse/i, 'hospital corridor night'],
  [/funeral|coffin|buried|mourn|grave/i, 'rain window sad woman'],
  [/church|wedding|bride|altar|vow|marry/i, 'church candles interior'],
  [/office|boss|contract|signed|document|desk|meeting/i, 'office night window city'],
  [/province|farm|field|bukid|harvest|island|sea/i, 'rice field sunset'],
  [/house|room|kitchen|bed|door|mansion|maid/i, 'woman alone room window'],
  [/street|barangay|alley|jeep|market|city|manila/i, 'city street night rain'],
  [/cry|tears|grief|lost|gone/i, 'woman crying close up'],
  [/run|chase|escape|flee/i, 'running night street'],
  [/money|debt|envelope|payment/i, 'hands money table'],
];

export function stockQuery(scene: SceneLike): string {
  const text = `${scene.title} ${scene.beat} ${scene.hook}`;
  return QUERIES.find(([pattern]) => pattern.test(text))?.[1] ?? 'woman portrait dramatic night';
}

interface PexelsFile {
  id: number;
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  user: { name: string; url: string };
  video_files: PexelsFile[];
}

/** Stable per episode: the same scene must not draw a different clip on reload. */
function pickIndex(seedText: string, count: number): number {
  let h = 0;
  for (let i = 0; i < seedText.length; i += 1) h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
  return count > 0 ? h % count : 0;
}

/**
 * The largest portrait mp4 that is not absurd to download.
 *
 * Pexels returns everything from 640×360 up to 4K. A reel is 720×1560, so
 * anything past ~1440 wide is bytes the admin's browser pays for and nobody
 * sees.
 */
function bestFile(video: PexelsVideo): PexelsFile | null {
  const usable = video.video_files.filter(
    (file) => file.file_type === 'video/mp4' && file.width && file.height,
  );
  if (usable.length === 0) return null;

  const portrait = usable.filter((file) => (file.height ?? 0) >= (file.width ?? 0));
  const pool = portrait.length > 0 ? portrait : usable;

  const sized = pool.filter((file) => (file.width ?? 0) <= 1440);
  const finalPool = sized.length > 0 ? sized : pool;

  return finalPool.reduce((best, file) =>
    (file.width ?? 0) > (best.width ?? 0) ? file : best,
  );
}

export async function findClip(
  scene: SceneLike,
): Promise<{ clip: StockClip; query: string } | { error: StockError }> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return { error: 'NO_KEY' };

  const query = stockQuery(scene);
  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('per_page', '15');

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: key },
      cache: 'no-store',
    });
  } catch {
    return { error: 'FAILED' };
  }

  if (res.status === 401 || res.status === 403) return { error: 'REJECTED' };
  if (res.status === 429) return { error: 'RATE_LIMITED' };
  if (!res.ok) return { error: 'FAILED' };

  const body = (await res.json().catch(() => null)) as { videos?: PexelsVideo[] } | null;
  const videos = (body?.videos ?? []).filter((video) => bestFile(video) !== null);
  if (videos.length === 0) return { error: 'NOTHING_FOUND' };

  const video = videos[pickIndex(`${scene.title}|${scene.hook}`, videos.length)];
  const file = bestFile(video);
  if (!file) return { error: 'NOTHING_FOUND' };

  return {
    query,
    clip: {
      id: video.id,
      link: file.link,
      width: file.width ?? video.width,
      height: file.height ?? video.height,
      durationSeconds: video.duration,
      photographer: video.user?.name ?? 'Unknown',
      photographerUrl: video.user?.url ?? 'https://www.pexels.com',
      sourceUrl: video.url,
    },
  };
}
