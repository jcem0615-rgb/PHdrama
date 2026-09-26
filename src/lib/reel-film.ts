/**
 * Draws one frame of an episode's reel onto a canvas.
 *
 * This is the renderer behind the "local" video provider: no model, no GPU, no
 * per-second bill — just motion graphics composed from the episode's own script.
 * Pure drawing, no DOM beyond the context, so the same code runs for the live
 * preview and for the recorded file.
 */

export interface FilmScene {
  episodeNumber: number;
  seriesTitle: string;
  title: string;
  beat: string;
  hook: string;
  /** 0–360, the series' colour identity. */
  hue: number;
}

/**
 * Relative weight of each beat. Silent reels run at FILM_SECONDS; a narrated
 * one stretches to the length of its audio, keeping the same proportions so the
 * words land with the picture.
 */
export const BEAT_WEIGHTS = [1, 1, 1];
export const FILM_SECONDS = 15;
const WEIGHT_TOTAL = BEAT_WEIGHTS.reduce((a, b) => a + b, 0);

export function beatSeconds(totalSeconds: number): number[] {
  return BEAT_WEIGHTS.map((weight) => (weight / WEIGHT_TOTAL) * totalSeconds);
}
export const FILM_WIDTH = 720;
/**
 * 9:19.5, not 9:16. The player uses object-cover, so a 9:16 frame gets cropped
 * left and right on a modern phone and the lettering falls off the sides.
 */
export const FILM_HEIGHT = 1560;

/** Kept clear of the crop edges and of the app's own bottom chrome. */
const MARGIN_X = 88;
const TEXT_BOTTOM = FILM_HEIGHT * 0.7;

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Wrap by measured width — canvas gives us real metrics, unlike the SVG poster. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D, scene: FilmScene, t: number): void {
  const { hue } = scene;

  const base = ctx.createLinearGradient(0, 0, FILM_WIDTH * 0.6, FILM_HEIGHT);
  base.addColorStop(0, `hsl(${hue} 70% 40%)`);
  base.addColorStop(0.45, `hsl(${(hue + 28) % 360} 62% 24%)`);
  base.addColorStop(1, `hsl(${(hue + 300) % 360} 46% 8%)`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);

  // Two lights drifting on closed loops, so the clip cuts seamlessly.
  const lights = [
    { h: hue, rx: 0.3, ry: 0.22, cx: 0.34, cy: 0.32, r: 0.78, phase: 0 },
    { h: (hue + 40) % 360, rx: 0.26, ry: 0.26, cx: 0.68, cy: 0.62, r: 0.66, phase: 0.45 },
  ];

  ctx.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    const a = (t + light.phase) * Math.PI * 2;
    const x = (light.cx + Math.cos(a) * light.rx) * FILM_WIDTH;
    const y = (light.cy + Math.sin(a) * light.ry) * FILM_HEIGHT;
    const radius = light.r * FILM_WIDTH;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `hsla(${light.h}, 85%, 58%, 0.45)`);
    glow.addColorStop(1, `hsla(${light.h}, 85%, 58%, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Vignette + bottom scrim, so text always has something to sit on.
  const vignette = ctx.createRadialGradient(
    FILM_WIDTH / 2,
    FILM_HEIGHT / 2,
    FILM_WIDTH * 0.3,
    FILM_WIDTH / 2,
    FILM_HEIGHT / 2,
    FILM_WIDTH,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);

  const scrim = ctx.createLinearGradient(0, FILM_HEIGHT * 0.45, 0, FILM_HEIGHT);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; size: number; weight: number; italic?: boolean; alpha: number; gap: number }[],
  bottom: number,
  lift: number,
): void {
  let height = 0;
  for (const line of lines) height += line.size * 1.16 + line.gap;

  let y = bottom - height + lift;
  for (const line of lines) {
    y += line.size * 1.16;
    ctx.globalAlpha = line.alpha;
    ctx.font = `${line.italic ? 'italic ' : ''}${line.weight} ${line.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(line.text, MARGIN_X, y);
    y += line.gap;
  }
  ctx.globalAlpha = 1;
}

/** `t` is 0–1 across the whole reel, whatever its runtime. */
export function drawFilmFrame(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  t: number,
  totalSeconds = FILM_SECONDS,
): void {
  drawBackground(ctx, scene, t);

  const beats = beatSeconds(totalSeconds);
  const elapsed = t * totalSeconds;
  let index = 0;
  let consumed = 0;
  for (let i = 0; i < beats.length; i += 1) {
    if (elapsed < consumed + beats[i]) {
      index = i;
      break;
    }
    consumed += beats[i];
    index = i;
  }

  const local = Math.min(1, Math.max(0, (elapsed - consumed) / beats[index]));
  const alpha = Math.max(0, Math.min(1, Math.min(local / 0.18, (1 - local) / 0.12, 1)));
  const lift = (1 - ease(Math.min(1, local / 0.4))) * 26;

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = FILM_WIDTH - MARGIN_X * 2;
  const bottom = TEXT_BOTTOM;

  if (index === 0) {
    // Measure at the size it will be drawn at, or the wrap is wrong.
    ctx.font = '800 68px system-ui, sans-serif';
    const titleLines = wrap(ctx, scene.title, maxWidth);

    drawBlock(
      ctx,
      [
        { text: `EPISODE ${scene.episodeNumber}`, size: 30, weight: 700, alpha: alpha * 0.6, gap: 22 },
        ...titleLines.map((text) => ({ text, size: 68, weight: 800, alpha, gap: 0 })),
        { text: scene.seriesTitle, size: 28, weight: 600, alpha: alpha * 0.6, gap: 0 },
      ],
      bottom,
      lift,
    );
    return;
  }

  if (index === 1) {
    ctx.font = '600 42px system-ui, sans-serif';
    const lines = wrap(ctx, scene.beat || scene.title, maxWidth);
    drawBlock(
      ctx,
      lines.map((text) => ({ text, size: 42, weight: 600, alpha, gap: 0 })),
      bottom,
      lift,
    );
    return;
  }

  ctx.font = 'italic 700 42px system-ui, sans-serif';
  const hookLines = wrap(ctx, scene.hook || 'To be continued.', maxWidth);
  drawBlock(
    ctx,
    [
      { text: 'NEXT', size: 28, weight: 700, alpha: alpha * 0.75, gap: 20 },
      ...hookLines.map((text) => ({ text, size: 42, weight: 700, italic: true, alpha, gap: 0 })),
    ],
    bottom,
    lift,
  );
}
