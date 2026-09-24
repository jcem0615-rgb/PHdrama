import type { NextRequest } from 'next/server';


import { getEpisode } from '@/server/repository';

export const runtime = 'nodejs';

/**
 * A real poster image per episode — an SVG title card drawn from the episode's
 * own words. Generated here rather than fetched from an image provider so the
 * catalogue has artwork with no external dependency and no per-image cost.
 *
 * Replace this route with the uploaded artwork in `thumbnails` once real key
 * art exists.
 */

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

/** Greedy wrap by character budget — close enough for a title card. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line && line.length + word.length + 1 > perLine) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await ctx.params;

  // `?plain=1` drops the lettering. Heroes and cards draw their own title, and
  // two sets of text on one image is just noise.
  const plain = req.nextUrl.searchParams.get('plain') === '1';

  const episode = await getEpisode(episodeId);
  if (!episode) return new Response('Not found', { status: 404 });

  const hue = episode.posterHue;

  // Catalogue episodes are titled "Episode 7", which makes for a dead poster.
  // When the episode has no title of its own, the series carries the card.
  const hasOwnTitle = !/^episode\s*\d+$/i.test(episode.title.trim());
  const headline = hasOwnTitle ? episode.title : episode.seriesTitle;
  const footer = hasOwnTitle ? episode.seriesTitle : '';

  const titleLines = plain ? [] : wrap(headline, 16, 3);
  const hookLines = plain || !episode.synopsis ? [] : wrap(episode.synopsis, 34, 3);

  // Bottom-align the text block so cards with and without a hook look alike.
  const blockHeight = titleLines.length * 82 + (hookLines.length ? 18 + hookLines.length * 42 : 0);
  const titleTop = 1140 - blockHeight - (footer ? 56 : 0);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" role="img" aria-label="${escapeXml(episode.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 72% 44%)"/>
      <stop offset="45%" stop-color="hsl(${(hue + 28) % 360} 64% 26%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 300) % 360} 48% 9%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.25" r="0.8">
      <stop offset="0%" stop-color="hsl(${hue} 90% 60%)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="hsl(${hue} 90% 60%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="0.45" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  <rect width="720" height="1280" fill="url(#bg)"/>
  <rect width="720" height="1280" fill="url(#glow)"/>
  <rect width="720" height="1280" fill="url(#scrim)"/>

  ${
    plain
      ? ''
      : `<text x="64" y="150" font-family="system-ui, sans-serif" font-size="30" font-weight="700"
        fill="#fff" fill-opacity="0.55" letter-spacing="6">EPISODE ${episode.episodeNumber}</text>
  <rect x="64" y="176" width="88" height="5" rx="2.5" fill="#fff" fill-opacity="0.75"/>`
  }

  ${titleLines
    .map(
      (line, i) =>
        `<text x="64" y="${titleTop + i * 82}" font-family="system-ui, sans-serif" font-size="72" font-weight="800" fill="#fff">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}

  ${hookLines
    .map(
      (line, i) =>
        `<text x="64" y="${titleTop + titleLines.length * 82 + 18 + i * 42}" font-family="system-ui, sans-serif" font-size="32" font-style="italic" fill="#fff" fill-opacity="0.75">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}

  ${
    footer && !plain
      ? `<text x="64" y="1200" font-family="system-ui, sans-serif" font-size="28" font-weight="600" fill="#fff" fill-opacity="0.5">${escapeXml(footer)}</text>`
      : ''
  }
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Posters are derived from the episode row, so they can be cached hard.
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
