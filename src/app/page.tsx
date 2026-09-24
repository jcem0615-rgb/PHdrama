import { Coins, Crown, Play } from 'lucide-react';
import Link from 'next/link';

import DemoBanner from '@/components/DemoBanner';
import SeriesCard from '@/components/SeriesCard';
import { copy } from '@/lib/copy';
import { formatCount } from '@/lib/format';
import { posterGradient } from '@/lib/poster';
import { getViewer, isDemoMode, listSeries } from '@/server/repository';

export default async function HomePage() {
  const [series, viewer] = await Promise.all([listSeries(), getViewer()]);
  const demo = isDemoMode();

  const featured = series.find((s) => s.isFeatured) ?? series[0];
  const trending = series.slice(0, 6);
  const newReleases = [...series].reverse().slice(0, 6);

  return (
    <main className="pb-28 pt-14">
      {featured && (
        <section className="relative">
          <Link href={`/series/${featured.slug}`} className="block">
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <div className="absolute inset-0" style={{ background: posterGradient(featured.posterHue) }} />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />

              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-flame-400">
                  {copy.home.featured}
                </p>
                <h1 className="text-2xl font-black leading-tight">{featured.title}</h1>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/70">
                  {featured.synopsis}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                  {featured.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5">
                      #{tag}
                    </span>
                  ))}
                  <span>{formatCount(featured.viewCount)} views</span>
                </div>

                <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-flame-500 to-ember-500 px-6 py-3 text-sm font-bold">
                  <Play className="h-4 w-4 fill-white" />
                  {copy.series.watchFree}
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      <div className="mt-6">{demo && <DemoBanner />}</div>

      {!viewer?.isVip && (
        <section className="mx-auto mb-7 max-w-md px-4">
          <Link
            href="/coins#vip"
            className="flex items-center gap-3 rounded-2xl border border-vip-500/25 bg-gradient-to-r from-vip-500/15 to-transparent p-4"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vip-500/20 text-vip-500">
              <Crown className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{copy.coins.vipTitle} — ₱69 / week</span>
              <span className="block truncate text-xs text-ink-400">
                {copy.coins.vipPerk1} · {copy.coins.vipPerk2}
              </span>
            </span>
          </Link>
        </section>
      )}

      <Rail title={copy.home.trending} items={trending} />
      <Rail title={copy.home.newReleases} items={newReleases} />

      <section className="mx-auto max-w-md px-4">
        <h2 className="mb-3 text-sm font-bold">{copy.home.browseAll}</h2>
        <div className="grid grid-cols-2 gap-3">
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-md px-4">
        <Link
          href="/coins"
          className="flex items-center justify-center gap-2 rounded-2xl bg-coin-500/10 px-4 py-3.5 text-sm font-semibold text-coin-500"
        >
          <Coins className="h-4 w-4" />
          {copy.unlock.topUp}
        </Link>
      </section>
    </main>
  );
}

function Rail({ title, items }: { title: string; items: Awaited<ReturnType<typeof listSeries>> }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-7">
      <h2 className="mx-auto mb-3 max-w-md px-4 text-sm font-bold">{title}</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((s) => (
          <div key={s.id} className="w-32 shrink-0">
            <SeriesCard series={s} />
          </div>
        ))}
      </div>
    </section>
  );
}
