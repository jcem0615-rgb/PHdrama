import type { NextRequest } from 'next/server';


import { stageFrom } from '@/lib/staging';
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

/**
 * The picture on the card.
 *
 * Without this the poster was three gradient rectangles, so every hero and
 * every tile in the catalogue was an empty colour panel — `?plain=1` strips the
 * lettering, which left nothing at all. Now the card shows the episode's own
 * location and two figures in it, drawn from the same reading the reel uses, so
 * the catalogue and the video agree about where the story happens.
 *
 * Deliberately simple shapes: this is a thumbnail seen at 150px wide as often
 * as full size.
 */
function sceneLayer(text: string, hue: number): string {
  const { location, night, rain } = stageFrom(text);
  const horizon = 820;
  const ink = `hsl(${(hue + 236) % 360} 32% ${night ? 7 : 12}%)`;

  const parts: string[] = [];

  if (location === 'street') {
    let x = -40;
    let i = 0;
    while (x < 760) {
      const w = 70 + ((i * 53) % 110);
      const h = 120 + ((i * 97) % 240);
      parts.push(`<rect x="${x}" y="${horizon - h}" width="${w}" height="${h + 60}" fill="${ink}"/>`);
      if (i % 2 === 0) {
        parts.push(
          `<rect x="${x + 18}" y="${horizon - h + 40}" width="18" height="26" fill="hsl(${(hue + 40) % 360} 85% 62%)" fill-opacity="0.55"/>`,
        );
      }
      x += w + 14;
      i += 1;
    }
  } else if (location === 'field') {
    parts.push(
      `<path d="M-40 ${horizon} Q 180 ${horizon - 58} 360 ${horizon - 22} T 760 ${horizon - 40} L760 1320 L-40 1320 Z" fill="${ink}"/>`,
    );
  } else if (location === 'church') {
    parts.push(
      `<path d="M270 ${horizon - 90} L270 ${horizon - 420} Q 360 ${horizon - 540} 450 ${horizon - 420} L450 ${horizon - 90} Z" fill="hsl(${(hue + 30) % 360} 72% 60%)" fill-opacity="0.6"/>`,
      `<path d="M270 ${horizon - 90} L270 ${horizon - 420} Q 360 ${horizon - 540} 450 ${horizon - 420} L450 ${horizon - 90} Z" fill="none" stroke="${ink}" stroke-width="18"/>`,
      `<rect x="352" y="${horizon - 470}" width="16" height="380" fill="${ink}"/>`,
    );
  } else if (location === 'corridor' || location === 'office') {
    parts.push(
      `<path d="M-40 -40 L300 ${horizon - 300} L300 ${horizon - 40} L-40 ${horizon + 160} Z" fill="${ink}"/>`,
      `<path d="M760 -40 L420 ${horizon - 300} L420 ${horizon - 40} L760 ${horizon + 160} Z" fill="${ink}"/>`,
      `<rect x="300" y="${horizon - 300}" width="120" height="260" fill="hsl(${(hue + 40) % 360} 70% 56%)" fill-opacity="0.5"/>`,
      `<rect x="250" y="120" width="220" height="26" fill="hsl(${(hue + 190) % 360} 26% 78%)" fill-opacity="0.24"/>`,
      `<rect x="285" y="300" width="150" height="20" fill="hsl(${(hue + 190) % 360} 26% 78%)" fill-opacity="0.2"/>`,
    );
  } else {
    // A room: back wall with a lit doorway and a bare bulb.
    parts.push(
      `<rect x="430" y="${horizon - 430}" width="190" height="430" fill="hsl(${(hue + 40) % 360} 70% 58%)" fill-opacity="0.5"/>`,
      `<rect x="416" y="${horizon - 444}" width="14" height="444" fill="${ink}"/>`,
      `<rect x="620" y="${horizon - 444}" width="14" height="444" fill="${ink}"/>`,
      `<rect x="416" y="${horizon - 444}" width="218" height="14" fill="${ink}"/>`,
      `<circle cx="196" cy="300" r="120" fill="hsl(${(hue + 45) % 360} 90% 70%)" fill-opacity="0.16"/>`,
      `<line x1="196" y1="0" x2="196" y2="292" stroke="#000" stroke-opacity="0.6" stroke-width="4"/>`,
    );
  }

  // Ground.
  parts.push(`<rect x="-40" y="${horizon}" width="800" height="520" fill="hsl(${(hue + 250) % 360} 30% ${night ? 5 : 9}%)"/>`);

  // Two figures on the ground line, rim-lit on the side facing the light.
  const figure = (cx: number, scale: number, rim: number) => {
    const r = 26 * scale;
    const cy = horizon - r * 11.5;
    const sh = r * 1.75;
    const body = `M${cx - sh} ${cy + r * 1.9} Q${cx} ${cy + r} ${cx + sh} ${cy + r * 1.9} L${cx + r * 1.2} ${horizon} L${cx - r * 1.2} ${horizon} Z`;
    return `<g>
    <g transform="translate(${r * 0.16} ${-r * 0.1})" fill="hsl(${(hue + 40) % 360} 82% 66%)" fill-opacity="${rim}">
      <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.82}" ry="${r}"/><path d="${body}"/>
    </g>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.82}" ry="${r}" fill="#04050a"/>
    <path d="${body}" fill="#04050a"/>
  </g>`;
  };
  parts.push(figure(300, 1.05, 0.55), figure(410, 0.92, 0.3));

  if (rain) {
    for (let i = 0; i < 46; i += 1) {
      const x = (i * 137) % 760;
      const y = (i * 229) % 1240;
      parts.push(
        `<line x1="${x}" y1="${y}" x2="${x - 9}" y2="${y + 38}" stroke="#cfe0ff" stroke-opacity="0.22" stroke-width="2"/>`,
      );
    }
  }

  return parts.join('\n  ');
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

  ${sceneLayer(`${episode.title} ${episode.synopsis ?? ''} ${episode.seriesTitle}`, hue)}

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
