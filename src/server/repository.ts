import 'server-only';

import {
  DEMO_COIN_PACKAGES,
  DEMO_PAYMENT_METHODS,
  DEMO_SERIES,
  DEMO_VIP_PLANS,
  demoEpisode,
  demoEpisodesOf,
  demoSeries,
} from '@/lib/demo/catalog';
import { hueFromKey } from '@/lib/poster';
import { isLiveMode } from '@/lib/supabase/env';
import { createServerSupabase } from '@/lib/supabase/server';
import type {
  CoinLedgerEntry,
  CoinPackage,
  Customer,
  Episode,
  Payment,
  PaymentMethod,
  Series,
  Story,
  StoryScene,
  VipPlan,
  Viewer,
} from '@/lib/types';

import { demoLedger, demoPayments, demoViewer, readDemoState } from './demo-store';

/**
 * The app's reads, in one place, with two backends behind them.
 *
 * Pages import only from here. Swapping demo mode for a live Supabase project
 * is an environment change, not a code change.
 */

export function isDemoMode(): boolean {
  return !isLiveMode();
}

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------

type SeriesRow = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  tags: string[] | null;
  free_episode_count: number;
  is_featured: boolean;
  view_count: number;
  episodes: { count: number }[] | null;
};

function mapSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis ?? '',
    tags: row.tags ?? [],
    freeEpisodeCount: row.free_episode_count,
    isFeatured: row.is_featured,
    episodeCount: row.episodes?.[0]?.count ?? 0,
    viewCount: row.view_count ?? 0,
    posterHue: hueFromKey(row.slug),
  };
}

export async function listSeries(): Promise<Series[]> {
  if (isDemoMode()) return DEMO_SERIES;

  const supabase = await createServerSupabase();
  if (!supabase) return DEMO_SERIES;

  const { data } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, tags, free_episode_count, is_featured, view_count, episodes(count)')
    .eq('status', 'published')
    .order('view_count', { ascending: false });

  return (data ?? []).map((row) => mapSeries(row as unknown as SeriesRow));
}

export async function getSeries(slug: string): Promise<Series | null> {
  if (isDemoMode()) return demoSeries(slug) ?? null;

  const supabase = await createServerSupabase();
  if (!supabase) return demoSeries(slug) ?? null;

  const { data } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, tags, free_episode_count, is_featured, view_count, episodes(count)')
    .eq('slug', slug)
    .maybeSingle();

  return data ? mapSeries(data as unknown as SeriesRow) : null;
}

type EpisodeRow = {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  synopsis: string;
  duration_seconds: number;
  coin_price: number;
  series: { slug: string; title: string; free_episode_count: number } | null;
};

function mapEpisode(row: EpisodeRow): Episode {
  const slug = row.series?.slug ?? '';
  return {
    id: row.id,
    seriesId: row.series_id,
    seriesSlug: slug,
    seriesTitle: row.series?.title ?? '',
    episodeNumber: row.episode_number,
    title: row.title,
    synopsis: row.synopsis ?? '',
    durationSeconds: row.duration_seconds ?? 0,
    coinPrice: row.coin_price,
    isFree: row.episode_number <= (row.series?.free_episode_count ?? 0),
    posterHue: (hueFromKey(slug) + row.episode_number * 7) % 360,
  };
}

const EPISODE_SELECT =
  'id, series_id, episode_number, title, synopsis, duration_seconds, coin_price, series!inner(slug, title, free_episode_count)';

export async function listEpisodes(seriesSlug: string): Promise<Episode[]> {
  if (isDemoMode()) return demoEpisodesOf(seriesSlug);

  const supabase = await createServerSupabase();
  if (!supabase) return demoEpisodesOf(seriesSlug);

  const { data } = await supabase
    .from('episodes')
    .select(EPISODE_SELECT)
    .eq('series.slug', seriesSlug)
    .order('episode_number');

  return (data ?? []).map((row) => mapEpisode(row as unknown as EpisodeRow));
}

export async function getEpisode(id: string): Promise<Episode | null> {
  if (isDemoMode()) return demoEpisode(id) ?? null;

  const supabase = await createServerSupabase();
  if (!supabase) return demoEpisode(id) ?? null;

  const { data } = await supabase.from('episodes').select(EPISODE_SELECT).eq('id', id).maybeSingle();
  return data ? mapEpisode(data as unknown as EpisodeRow) : null;
}

/** The reels feed: the first free episode of every series, most watched first. */
export async function listFeedEpisodes(limit = 24): Promise<Episode[]> {
  const series = await listSeries();
  const out: Episode[] = [];

  for (const s of series) {
    const episodes = await listEpisodes(s.slug);
    const first = episodes[0];
    if (first) out.push(first);
    if (out.length >= limit) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// viewer
// ---------------------------------------------------------------------------

export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) return demoViewer(await readDemoState());

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, coin_balance, vip_expires_at')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile) return null;

  const { data: unlocks } = await supabase.from('episode_unlocks').select('episode_id');

  return {
    id: profile.id,
    displayName: profile.display_name ?? 'Viewer',
    role: profile.role,
    coinBalance: profile.coin_balance,
    vipExpiresAt: profile.vip_expires_at,
    isVip: Boolean(profile.vip_expires_at && new Date(profile.vip_expires_at).getTime() > Date.now()),
    unlockedEpisodeIds: (unlocks ?? []).map((u) => u.episode_id as string),
  };
}

// ---------------------------------------------------------------------------
// commerce catalogue
// ---------------------------------------------------------------------------

export async function listCoinPackages(): Promise<CoinPackage[]> {
  if (isDemoMode()) return DEMO_COIN_PACKAGES;

  const supabase = await createServerSupabase();
  if (!supabase) return DEMO_COIN_PACKAGES;

  const { data } = await supabase
    .from('coin_packages')
    .select('id, code, name, coins, bonus_coins, price_php, is_popular')
    .eq('is_active', true)
    .order('sort_order');

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    coins: row.coins,
    bonusCoins: row.bonus_coins,
    pricePhp: Number(row.price_php),
    isPopular: row.is_popular,
  }));
}

export async function listVipPlans(): Promise<VipPlan[]> {
  if (isDemoMode()) return DEMO_VIP_PLANS;

  const supabase = await createServerSupabase();
  if (!supabase) return DEMO_VIP_PLANS;

  const { data } = await supabase
    .from('vip_plans')
    .select('id, code, name, days, price_php')
    .eq('is_active', true)
    .order('sort_order');

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    days: row.days,
    pricePhp: Number(row.price_php),
  }));
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  if (isDemoMode()) return DEMO_PAYMENT_METHODS;

  const supabase = await createServerSupabase();
  if (!supabase) return DEMO_PAYMENT_METHODS;

  const { data } = await supabase
    .from('payment_methods')
    .select('id, code, label, channel, account_name, account_number, instructions')
    .eq('is_active', true)
    .order('sort_order');

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    channel: row.channel,
    accountName: row.account_name,
    accountNumber: row.account_number,
    instructions: row.instructions ?? '',
  }));
}

// ---------------------------------------------------------------------------
// payments & ledger
// ---------------------------------------------------------------------------

type PaymentRow = {
  id: string;
  user_id: string;
  kind: 'coins' | 'vip';
  amount_php: string | number;
  reference_number: string;
  receipt_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  profiles: { display_name: string | null } | null;
  coin_packages: { name: string; coins: number; bonus_coins: number } | null;
  vip_plans: { name: string } | null;
  payment_methods: { label: string } | null;
};

const PAYMENT_SELECT =
  'id, user_id, kind, amount_php, reference_number, receipt_path, status, admin_note, created_at, reviewed_at, ' +
  'profiles(display_name), coin_packages(name, coins, bonus_coins), vip_plans(name), payment_methods(label)';

function mapPayment(row: PaymentRow): Payment {
  const itemName = row.coin_packages
    ? `${row.coin_packages.name} — ${row.coin_packages.coins + row.coin_packages.bonus_coins} coins`
    : (row.vip_plans?.name ?? 'VIP');

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.profiles?.display_name ?? 'Viewer',
    kind: row.kind,
    itemName,
    amountPhp: Number(row.amount_php),
    methodLabel: row.payment_methods?.label ?? '—',
    referenceNumber: row.reference_number,
    receiptName: row.receipt_path ? row.receipt_path.split('/').pop() ?? null : null,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function listMyPayments(): Promise<Payment[]> {
  if (isDemoMode()) return demoPayments(await readDemoState());

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => mapPayment(row as unknown as PaymentRow));
}

/** Admin view. RLS already restricts this to admins; the page checks too. */
export async function listAllPayments(): Promise<Payment[]> {
  if (isDemoMode()) return demoPayments(await readDemoState());

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []).map((row) => mapPayment(row as unknown as PaymentRow));
}

export async function listCoinLedger(): Promise<CoinLedgerEntry[]> {
  if (isDemoMode()) return demoLedger(await readDemoState());

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('coin_ledger')
    .select('id, delta, balance_after, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    delta: row.delta,
    balanceAfter: row.balance_after,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/** Staff view of customers. RLS already limits this to admins; the page checks too. */
export async function listCustomers(): Promise<Customer[]> {
  if (isDemoMode()) {
    const state = await readDemoState();
    if (!state.account) return [];
    return [
      {
        id: 'demo-viewer',
        displayName: state.account.displayName,
        role: 'user',
        coinBalance: state.coins,
        vipExpiresAt: state.vipExpiresAt ? new Date(state.vipExpiresAt).toISOString() : null,
        isVip: Boolean(state.vipExpiresAt && state.vipExpiresAt > Date.now()),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, role, coin_balance, vip_expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name ?? 'Viewer',
    role: row.role,
    coinBalance: row.coin_balance,
    vipExpiresAt: row.vip_expires_at,
    isVip: Boolean(row.vip_expires_at && new Date(row.vip_expires_at).getTime() > Date.now()),
    createdAt: row.created_at,
  }));
}

export async function listUnlockedEpisodes(): Promise<Episode[]> {
  const viewer = await getViewer();
  if (!viewer) return [];

  const episodes = await Promise.all(viewer.unlockedEpisodeIds.map((id) => getEpisode(id)));
  return episodes.filter((e): e is Episode => e !== null);
}


// ---------------------------------------------------------------------------
// story studio (live mode only — demo mode has nowhere to persist)
// ---------------------------------------------------------------------------

export async function listStories(): Promise<Story[]> {
  if (isDemoMode()) return [];

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('stories')
    .select(
      'id, title, logline, tags, target_episodes, status, model, series_id, created_at, ' +
        'story_scenes(count), render_jobs(status)',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      title: string;
      logline: string;
      tags: string[] | null;
      target_episodes: number;
      status: Story['status'];
      model: string | null;
      series_id: string | null;
      created_at: string;
      story_scenes: { count: number }[] | null;
      render_jobs: { status: string }[] | null;
    };

    return {
      id: r.id,
      title: r.title,
      logline: r.logline ?? '',
      tags: r.tags ?? [],
      targetEpisodes: r.target_episodes,
      status: r.status,
      model: r.model,
      seriesId: r.series_id,
      sceneCount: r.story_scenes?.[0]?.count ?? 0,
      renderedCount: (r.render_jobs ?? []).filter((j) => j.status === 'succeeded').length,
      createdAt: r.created_at,
    };
  });
}

export async function listStoryScenes(storyId: string): Promise<StoryScene[]> {
  if (isDemoMode()) return [];

  const supabase = await createServerSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from('story_scenes')
    .select('id, scene_number, title, beat, script, hook, duration_seconds, render_jobs(status)')
    .eq('story_id', storyId)
    .order('scene_number');

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      scene_number: number;
      title: string;
      beat: string;
      script: string;
      hook: string;
      duration_seconds: number;
      render_jobs: { status: StoryScene['renderStatus'] }[] | null;
    };

    return {
      id: r.id,
      sceneNumber: r.scene_number,
      title: r.title,
      beat: r.beat ?? '',
      script: r.script ?? '',
      hook: r.hook ?? '',
      durationSeconds: r.duration_seconds,
      renderStatus: r.render_jobs?.[0]?.status ?? null,
    };
  });
}
