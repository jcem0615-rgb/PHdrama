import { ArrowLeft, Play } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import EpisodeGrid from '@/components/EpisodeGrid';
import { copy } from '@/lib/copy';
import { formatCount } from '@/lib/format';
import { posterGradient } from '@/lib/poster';
import { getSeries, getViewer, listEpisodes } from '@/server/repository';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/series/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const series = await getSeries(slug);
  return { title: series?.title ?? copy.appName };
}

export default async function SeriesPage({ params }: PageProps<'/series/[slug]'>) {
  const { slug } = await params;
  const series = await getSeries(slug);
  if (!series) notFound();

  const [episodes, viewer] = await Promise.all([listEpisodes(slug), getViewer()]);
  const firstEpisode = episodes[0];

  return (
    <main className="pb-28">
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ background: posterGradient(series.posterHue) }} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-black/40" />

        <Link
          href="/"
          aria-label="Back"
          className="absolute left-4 top-[calc(0.75rem+env(safe-area-inset-top,0px))] grid h-9 w-9 place-items-center rounded-full bg-black/40 backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md p-4">
          <h1 className="text-xl font-black leading-tight">{series.title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
            <span>{copy.series.episodeCount(series.episodeCount)}</span>
            <span aria-hidden>·</span>
            <span>{formatCount(series.viewCount)} views</span>
            <span className="rounded-full bg-jade-500/20 px-2 py-0.5 font-semibold text-jade-500">
              {copy.home.freeBadge(series.freeEpisodeCount)}
            </span>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4">
        <p className="mt-4 text-sm leading-relaxed text-ink-200">{series.synopsis}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {series.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-ink-400">
              #{tag}
            </span>
          ))}
        </div>

        {firstEpisode && (
          <Link
            href={`/watch/${firstEpisode.id}`}
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flame-500 to-ember-500 py-3.5 text-sm font-bold"
          >
            <Play className="h-4 w-4 fill-white" />
            {copy.series.startFromOne}
          </Link>
        )}

        <h2 className="mb-3 mt-8 text-sm font-bold">{copy.series.episodes}</h2>
        <EpisodeGrid episodes={episodes} viewer={viewer} />
      </div>
    </main>
  );
}
