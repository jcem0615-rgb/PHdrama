/**
 * Series artwork is generated until real posters are uploaded to the public
 * `thumbnails` bucket. Deterministic hue per key so a series always looks the
 * same between renders and between server and client.
 */
export function hueFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function posterGradient(hue: number): string {
  return `linear-gradient(155deg, hsl(${hue} 72% 42%) 0%, hsl(${(hue + 28) % 360} 64% 26%) 45%, hsl(${(hue + 300) % 360} 48% 10%) 100%)`;
}

/**
 * Route that renders an episode's generated title-card poster.
 * `plain` drops the lettering, for surfaces that draw their own title over it.
 */
export function posterUrl(episodeId: string, plain = false): string {
  return `/api/posters/${encodeURIComponent(episodeId)}${plain ? '?plain=1' : ''}`;
}
