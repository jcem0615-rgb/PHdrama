import type { CoinPackage, Episode, PaymentMethod, Series, VipPlan } from '@/lib/types';

/**
 * The demo catalogue. This exists so the deployed preview is fully clickable
 * with no Supabase project attached. It mirrors what `supabase/seed.sql` puts
 * in the real database — same shapes, same prices, same free-episode window.
 */

interface SeriesSeed {
  slug: string;
  title: string;
  synopsis: string;
  tags: string[];
  episodes: number;
  hue: number;
  featured?: boolean;
  views: number;
}

const SEED: SeriesSeed[] = [
  {
    slug: 'ang-sekreto-ng-mayordoma',
    title: 'Ang Sekreto ng Mayordoma',
    synopsis:
      'She took the job to pay for her mother’s surgery. She stayed because the family she serves buried the truth about her father in the same garden she waters every morning.',
    tags: ['revenge', 'family', 'melodrama'],
    episodes: 32,
    hue: 348,
    featured: true,
    views: 1_284_000,
  },
  {
    slug: 'bilyonaryong-tsuper',
    title: 'Ang Bilyonaryong Tsuper',
    synopsis:
      'To win a bet with his board, a shipping heir drives a jeepney for thirty days. On day three he picks up the woman his company evicted.',
    tags: ['romance', 'comedy', 'rags-to-riches'],
    episodes: 28,
    hue: 28,
    views: 962_000,
  },
  {
    slug: 'kambal-sa-dilim',
    title: 'Kambal sa Dilim',
    synopsis:
      'Twins separated at birth by a midwife who owed the wrong people. One grew up in Forbes Park. One grew up learning which streets to avoid at night.',
    tags: ['thriller', 'twins', 'suspense'],
    episodes: 40,
    hue: 268,
    featured: true,
    views: 1_740_000,
  },
  {
    slug: 'pinalitan-ng-ex',
    title: 'Pinalitan ng Ex Ko',
    synopsis:
      'Her fiancé postponed the wedding for a promotion. Six months later she is the client his firm cannot afford to lose.',
    tags: ['romance', 'workplace', 'glow-up'],
    episodes: 24,
    hue: 320,
    views: 731_000,
  },
  {
    slug: 'utang-na-loob',
    title: 'Utang na Loob',
    synopsis:
      'A debt paid forward across three generations, and the grandson who decides the ledger closes with him.',
    tags: ['drama', 'family', 'honor'],
    episodes: 36,
    hue: 200,
    views: 548_000,
  },
  {
    slug: 'huling-alay',
    title: 'Huling Alay sa Barangay',
    synopsis:
      'The barangay captain everyone trusted is dead. The nurse who found him has forty-eight hours before the flood takes the evidence.',
    tags: ['mystery', 'crime', 'small-town'],
    episodes: 30,
    hue: 160,
    views: 412_000,
  },
  {
    slug: 'balikbayan-box',
    title: 'Ang Balikbayan Box',
    synopsis:
      'Ten years abroad, one box home every Christmas. This year the box comes back with something that was never packed.',
    tags: ['ofw', 'family', 'tearjerker'],
    episodes: 26,
    hue: 42,
    views: 889_000,
  },
  {
    slug: 'kontrata-sa-hatinggabi',
    title: 'Kontrata sa Hatinggabi',
    synopsis:
      'A contract marriage with an expiry date, signed at midnight, witnessed by nobody — and a clause neither of them read.',
    tags: ['romance', 'contract-marriage', 'billionaire'],
    episodes: 34,
    hue: 292,
    views: 1_105_000,
  },
];

/**
 * Publicly hosted HLS test streams. In live mode these are replaced by
 * short-lived signed URLs from the private `videos` bucket — see
 * `/api/episodes/[id]/play`.
 */
const STREAM_POOL = [
  'https://stream.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsd9wfU.m3u8',
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://test-streams.mux.dev/pts_shift/master.m3u8',
  'https://test-streams.mux.dev/tos_ismc/main.m3u8',
];

/**
 * Bundled with the app. Demo playback prefers the public HLS test streams above
 * so the real hls.js path is exercised, and drops to this clip if they cannot be
 * reached — a preview with a dead player teaches nobody anything.
 */
export const DEMO_FALLBACK_CLIP = '/demo/reel.webm';

const FREE_EPISODES = 5;
const COIN_PRICE = 30;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const DEMO_SERIES: Series[] = SEED.map((s) => ({
  id: s.slug,
  slug: s.slug,
  title: s.title,
  synopsis: s.synopsis,
  tags: s.tags,
  freeEpisodeCount: FREE_EPISODES,
  isFeatured: Boolean(s.featured),
  episodeCount: s.episodes,
  viewCount: s.views,
  posterHue: s.hue,
}));

export const DEMO_EPISODES: Episode[] = SEED.flatMap((s) =>
  Array.from({ length: s.episodes }, (_, i) => {
    const n = i + 1;
    return {
      id: `${s.slug}-${String(n).padStart(2, '0')}`,
      seriesId: s.slug,
      seriesSlug: s.slug,
      seriesTitle: s.title,
      episodeNumber: n,
      title: `Episode ${n}`,
      synopsis: '',
      durationSeconds: 68 + (hash(`${s.slug}${n}`) % 55),
      coinPrice: COIN_PRICE,
      isFree: n <= FREE_EPISODES,
      posterHue: (s.hue + n * 7) % 360,
    } satisfies Episode;
  }),
);

const EPISODES_BY_ID = new Map(DEMO_EPISODES.map((e) => [e.id, e]));
const SERIES_BY_SLUG = new Map(DEMO_SERIES.map((s) => [s.slug, s]));

export function demoEpisode(id: string): Episode | undefined {
  return EPISODES_BY_ID.get(id);
}

export function demoSeries(slug: string): Series | undefined {
  return SERIES_BY_SLUG.get(slug);
}

export function demoEpisodesOf(seriesSlug: string): Episode[] {
  return DEMO_EPISODES.filter((e) => e.seriesSlug === seriesSlug);
}

export function demoStreamFor(episodeId: string): string {
  return STREAM_POOL[hash(episodeId) % STREAM_POOL.length];
}

export const DEMO_COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', code: 'starter', name: 'Starter', coins: 100, bonusCoins: 0, pricePhp: 49, isPopular: false },
  { id: 'popular', code: 'popular', name: 'Barkada', coins: 300, bonusCoins: 50, pricePhp: 99, isPopular: true },
  { id: 'value', code: 'value', name: 'Marathon', coins: 700, bonusCoins: 150, pricePhp: 249, isPopular: false },
  { id: 'mega', code: 'mega', name: 'Sakalam', coins: 1600, bonusCoins: 400, pricePhp: 499, isPopular: false },
];

export const DEMO_VIP_PLANS: VipPlan[] = [
  { id: 'vip_weekly', code: 'vip_weekly', name: 'VIP Weekly', days: 7, pricePhp: 69 },
  { id: 'vip_monthly', code: 'vip_monthly', name: 'VIP Monthly', days: 30, pricePhp: 249 },
];

export const DEMO_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'gcash',
    code: 'gcash',
    label: 'GCash',
    channel: 'gcash',
    accountName: 'PH-DRAMA MEDIA',
    accountNumber: '0917 000 0000',
    instructions: 'Open GCash, tap Send Money, enter the number above, and pay the exact amount. Screenshot the receipt.',
  },
  {
    id: 'maya',
    code: 'maya',
    label: 'Maya',
    channel: 'maya',
    accountName: 'PH-DRAMA MEDIA',
    accountNumber: '0917 000 0000',
    instructions: 'Open Maya, tap Send Money, enter the number above, and pay the exact amount. Screenshot the receipt.',
  },
  {
    id: 'qrph',
    code: 'qrph',
    label: 'QR Ph',
    channel: 'qrph',
    accountName: 'PH-DRAMA MEDIA',
    accountNumber: 'Scan the QR Ph code',
    instructions: 'Scan the QR Ph code with any participating bank or e-wallet app. Screenshot the receipt.',
  },
  {
    id: 'bdo',
    code: 'bdo',
    label: 'BDO',
    channel: 'bank',
    accountName: 'PH-DRAMA MEDIA INC.',
    accountNumber: '0000 0000 0000',
    instructions: 'Transfer via BDO online banking or over the counter. Keep the reference number.',
  },
  {
    id: 'bpi',
    code: 'bpi',
    label: 'BPI',
    channel: 'bank',
    accountName: 'PH-DRAMA MEDIA INC.',
    accountNumber: '0000 0000 0000',
    instructions: 'Transfer via the BPI app or over the counter. Keep the reference number.',
  },
  {
    id: 'unionbank',
    code: 'unionbank',
    label: 'UnionBank',
    channel: 'bank',
    accountName: 'PH-DRAMA MEDIA INC.',
    accountNumber: '0000 0000 0000',
    instructions: 'Transfer via the UnionBank app or over the counter. Keep the reference number.',
  },
];
