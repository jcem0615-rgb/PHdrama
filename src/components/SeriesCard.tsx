import { Play } from 'lucide-react';
import Link from 'next/link';

import { copy } from '@/lib/copy';
import { formatCount } from '@/lib/format';
import { posterGradient, posterUrl } from '@/lib/poster';
import type { Series } from '@/lib/types';

/** Poster tile. Artwork is generated until real thumbnails are uploaded. */
export default function SeriesCard({ series, wide = false }: { series: Series; wide?: boolean }) {
  return (
    <Link
      href={`/series/${series.slug}`}
      className={`group relative block overflow-hidden rounded-2xl ${wide ? 'aspect-[16/10]' : 'aspect-[2/3]'}`}
    >
      <div className="absolute inset-0" style={{ background: posterGradient(series.posterHue) }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterUrl(`${series.slug}-01`, true)}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{series.title}</h3>
        <p className="mt-1 flex items-center gap-2 text-[10px] text-white/60">
          <span>{copy.series.episodeCount(series.episodeCount)}</span>
          <span aria-hidden>·</span>
          <span>{formatCount(series.viewCount)} views</span>
        </p>
      </div>

      <span
        className={`absolute left-2.5 top-2.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold backdrop-blur ${
          series.isPreview ? 'bg-white/20 text-white' : 'bg-jade-500/25 text-jade-500'
        }`}
      >
        {series.isPreview ? copy.series.preview : copy.home.freeBadgeShort(series.freeEpisodeCount)}
      </span>

      <span className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-black/40 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
        <Play className="h-4 w-4 translate-x-0.5 fill-white" />
      </span>
    </Link>
  );
}
