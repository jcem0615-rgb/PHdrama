/**
 * Draws one frame of an episode's reel onto a canvas.
 *
 * This is the renderer behind the built-in video provider: no model, no GPU, no
 * per-second bill. It composes a *scene* — a location built from layers, two
 * figures staged in it, a camera that moves, weather and grain — from the
 * episode's own script, and cuts between three shots across the runtime.
 *
 * What it is not: generated footage. Nothing here is photoreal and nothing here
 * invents imagery. It is procedural cinematography — the same trick a title
 * sequence uses — and it is the honest ceiling for something that has to run
 * free, in a browser, with no GPU. See docs/BUILD_ORDER.md, Phase 10.
 *
 * Pure drawing, no DOM beyond the context, so the same code runs for a live
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

/** Where the ground meets the back wall. Everything is staged around it. */
const HORIZON = FILM_HEIGHT * 0.62;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic pseudo-random — the same episode must draw the same scene. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function seedOf(scene: FilmScene): number {
  let h = scene.episodeNumber * 97;
  const text = `${scene.title}${scene.seriesTitle}`;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 100000;
  return h;
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

// ---------------------------------------------------------------------------
// Reading the episode for a location
// ---------------------------------------------------------------------------

type Location = 'street' | 'room' | 'office' | 'corridor' | 'field' | 'church';

interface Staging {
  location: Location;
  /** Rain reads as grief or threat, and it is the cheapest weather to draw. */
  rain: boolean;
  night: boolean;
}

const LOCATION_SIGNALS: readonly [Location, RegExp][] = [
  ['corridor', /hospital|clinic|ward|morgue|funeral|coffin|buried|doctor|nurse/i],
  ['church', /church|simbahan|wedding|marry|marriage|bride|vow|altar|priest/i],
  ['office', /office|boss|contract|signed|document|papers|ledger|deed|call[- ]cent|desk|meeting/i],
  ['field', /province|probinsya|farm|bukid|field|island|sea|barrio|harvest|mountain/i],
  ['room', /house|room|home|kitchen|bed|door|upstairs|mansion|sala|maid|kasambahay/i],
  ['street', /street|barangay|alley|jeep|tricycle|palengke|market|city|manila|night out|outside/i],
];

function stage(scene: FilmScene): Staging {
  const text = `${scene.title} ${scene.beat} ${scene.hook} ${scene.seriesTitle}`;
  const location = LOCATION_SIGNALS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'street';

  return {
    location,
    rain: /rain|storm|ulan|bagyo|flood|wet|grief|funeral|buried|cry/i.test(text),
    // Short drama lives at night; daylight is the exception the text has to earn.
    night: !/morning|daylight|noon|sunrise|afternoon|beach|harvest/i.test(text),
  };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

interface Camera {
  /** Scale about the frame centre — above 1 is a push in. */
  zoom: number;
  panX: number;
  panY: number;
}

type ShotKind = 'wide' | 'two' | 'close';

const SHOTS: readonly ShotKind[] = ['wide', 'two', 'close'];

/** Each shot has its own move, so a cut changes framing *and* motion. */
function cameraFor(shot: ShotKind, local: number, shake: number): Camera {
  const e = ease(local);

  if (shot === 'wide') {
    return { zoom: lerp(1.04, 1.16, e), panX: lerp(-14, 10, e) + shake, panY: lerp(6, -8, e) };
  }
  if (shot === 'two') {
    return { zoom: lerp(1.22, 1.3, e), panX: lerp(34, -26, e) + shake, panY: lerp(-10, -2, e) };
  }
  return { zoom: lerp(1.46, 1.78, e), panX: lerp(-8, 14, e) + shake * 1.6, panY: lerp(18, -12, e) };
}

/**
 * Applies the camera, with `depth` scaling the translation.
 *
 * Depth 0 is painted on the back wall and barely moves; depth 1 is at the
 * camera and moves fully. That difference is the whole reason the frame reads
 * as space rather than a flat picture.
 */
function withCamera(ctx: CanvasRenderingContext2D, camera: Camera, depth: number): void {
  const zoom = 1 + (camera.zoom - 1) * (0.55 + depth * 0.65);
  ctx.translate(FILM_WIDTH / 2, FILM_HEIGHT / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-FILM_WIDTH / 2, -FILM_HEIGHT / 2);
  ctx.translate(camera.panX * depth, camera.panY * depth);
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function drawSky(ctx: CanvasRenderingContext2D, scene: FilmScene, staging: Staging): void {
  const { hue } = scene;
  const lift = staging.night ? 0 : 16;

  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 200);
  sky.addColorStop(0, `hsl(${(hue + 210) % 360} ${34 + lift}% ${staging.night ? 15 : 36}%)`);
  sky.addColorStop(0.6, `hsl(${(hue + 250) % 360} ${40 + lift}% ${staging.night ? 24 : 48}%)`);
  sky.addColorStop(1, `hsl(${hue} ${52 + lift}% ${staging.night ? 38 : 62}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(-200, -200, FILM_WIDTH + 400, HORIZON + 400);
}

/** Low houses and poles — the barangay silhouette, drawn once per seed. */
function drawSkyline(ctx: CanvasRenderingContext2D, scene: FilmScene, seed: number): void {
  ctx.fillStyle = `hsl(${(scene.hue + 240) % 360} 30% 7%)`;

  let x = -140;
  let i = 0;
  while (x < FILM_WIDTH + 140) {
    const w = 70 + hash01(seed + i) * 120;
    const h = 90 + hash01(seed + i * 3.7) * 190;
    ctx.fillRect(x, HORIZON - h, w, h + 40);

    // A lit window or two, so the silhouette has somebody in it.
    if (hash01(seed + i * 5.1) > 0.45) {
      ctx.fillStyle = `hsla(${(scene.hue + 40) % 360}, 80%, 62%, 0.5)`;
      const wx = x + 16 + hash01(seed + i * 7.3) * (w - 44);
      const wy = HORIZON - h + 26 + hash01(seed + i * 9.9) * (h - 70);
      ctx.fillRect(wx, wy, 16, 22);
      ctx.fillStyle = `hsl(${(scene.hue + 240) % 360} 30% 7%)`;
    }

    x += w + 10 + hash01(seed + i * 2.3) * 26;
    i += 1;
  }
}

/**
 * One-point perspective: walls and ceiling converging on a vanishing point,
 * with lights receding down it. Stacked centred rectangles read as bars; this
 * reads as somewhere you could walk.
 */
function drawPerspectiveRow(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  t: number,
  bright: boolean,
): void {
  const cx = FILM_WIDTH / 2;
  const vy = HORIZON - 240;
  const top = -120;
  const bottom = HORIZON + 260;

  // Side walls as trapezoids running back to the vanishing point.
  for (const side of [-1, 1]) {
    const nearX = cx + side * FILM_WIDTH * 0.62;
    const farX = cx + side * 96;

    ctx.fillStyle = `hsl(${(scene.hue + 232) % 360} 20% ${side < 0 ? 13 : 9}%)`;
    ctx.beginPath();
    ctx.moveTo(nearX, top);
    ctx.lineTo(farX, vy - 150);
    ctx.lineTo(farX, vy + 150);
    ctx.lineTo(nearX, bottom);
    ctx.closePath();
    ctx.fill();
  }

  // Ceiling.
  ctx.fillStyle = `hsl(${(scene.hue + 232) % 360} 18% 7%)`;
  ctx.beginPath();
  ctx.moveTo(-40, top);
  ctx.lineTo(FILM_WIDTH + 40, top);
  ctx.lineTo(cx + 96, vy - 150);
  ctx.lineTo(cx - 96, vy - 150);
  ctx.closePath();
  ctx.fill();

  // The lit end of the corridor — the thing the eye actually goes to.
  const end = ctx.createLinearGradient(cx - 96, vy - 150, cx + 96, vy + 150);
  end.addColorStop(0, `hsla(${(scene.hue + 40) % 360}, 70%, 58%, 0.5)`);
  end.addColorStop(1, `hsla(${(scene.hue + 40) % 360}, 70%, 44%, 0.18)`);
  ctx.fillStyle = end;
  ctx.fillRect(cx - 96, vy - 150, 192, 300);

  if (!bright) return;

  // Ceiling lights, spaced by depth. One of them is on its way out.
  for (let i = 5; i >= 1; i -= 1) {
    const k = i / 5;
    const w = lerp(150, FILM_WIDTH * 0.5, k);
    const h = lerp(8, 34, k);
    const y = lerp(vy - 150, top + 180, k);
    const flicker = i === 3 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 39)) : 1;

    ctx.fillStyle = `hsla(${(scene.hue + 190) % 360}, 26%, 78%, ${(0.1 + k * 0.22) * flicker})`;
    ctx.fillRect(cx - w / 2, y, w, h);
  }
}

function drawBackWall(ctx: CanvasRenderingContext2D, scene: FilmScene, staging: Staging): void {
  const wall = ctx.createLinearGradient(0, HORIZON - 700, 0, HORIZON + 80);
  wall.addColorStop(0, `hsl(${(scene.hue + 230) % 360} 22% ${staging.night ? 19 : 26}%)`);
  wall.addColorStop(1, `hsl(${(scene.hue + 230) % 360} 18% ${staging.night ? 10 : 16}%)`);
  ctx.fillStyle = wall;
  ctx.fillRect(-200, -200, FILM_WIDTH + 400, HORIZON + 280);

  // A doorway with light behind it — the single most useful shape in drama.
  const dw = 190;
  const dh = 430;
  const dx = FILM_WIDTH * 0.66;
  const dy = HORIZON - dh;

  const spill = ctx.createLinearGradient(dx, dy, dx, dy + dh);
  spill.addColorStop(0, `hsla(${(scene.hue + 40) % 360}, 70%, 60%, 0.55)`);
  spill.addColorStop(1, `hsla(${(scene.hue + 40) % 360}, 70%, 46%, 0.12)`);
  ctx.fillStyle = spill;
  ctx.fillRect(dx, dy, dw, dh);

  ctx.fillStyle = `hsla(${(scene.hue + 230) % 360}, 24%, 4%, 0.9)`;
  ctx.fillRect(dx - 14, dy - 14, 14, dh + 14);
  ctx.fillRect(dx + dw, dy - 14, 14, dh + 14);
  ctx.fillRect(dx - 14, dy - 14, dw + 28, 14);

  // A bare bulb on a flex: fills the empty upper wall, and gives the room a
  // light source the rest of the frame can be lit by.
  const bx = FILM_WIDTH * 0.27;
  const by = FILM_HEIGHT * 0.26;

  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx, -40);
  ctx.lineTo(bx, by - 16);
  ctx.stroke();

  const bulb = ctx.createRadialGradient(bx, by, 0, bx, by, 240);
  bulb.addColorStop(0, `hsla(${(scene.hue + 45) % 360}, 90%, 82%, 0.9)`);
  bulb.addColorStop(0.08, `hsla(${(scene.hue + 45) % 360}, 85%, 66%, 0.4)`);
  bulb.addColorStop(1, 'hsla(0,0%,0%,0)');
  ctx.fillStyle = bulb;
  ctx.fillRect(bx - 240, by - 240, 480, 480);
}

function drawHorizonLand(ctx: CanvasRenderingContext2D, scene: FilmScene): void {
  ctx.fillStyle = `hsl(${(scene.hue + 120) % 360} 26% 9%)`;
  ctx.beginPath();
  ctx.moveTo(-200, HORIZON);
  for (let x = -200; x <= FILM_WIDTH + 200; x += 60) {
    ctx.lineTo(x, HORIZON - 18 + Math.sin(x * 0.011) * 14);
  }
  ctx.lineTo(FILM_WIDTH + 200, HORIZON + 400);
  ctx.lineTo(-200, HORIZON + 400);
  ctx.closePath();
  ctx.fill();
}

function drawArch(ctx: CanvasRenderingContext2D, scene: FilmScene): void {
  const cx = FILM_WIDTH / 2;
  const top = HORIZON - 620;

  const glass = ctx.createLinearGradient(0, top, 0, HORIZON - 120);
  glass.addColorStop(0, `hsla(${(scene.hue + 30) % 360}, 72%, 62%, 0.62)`);
  glass.addColorStop(1, `hsla(${(scene.hue + 320) % 360}, 60%, 40%, 0.18)`);

  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(cx - 150, HORIZON - 120);
  ctx.lineTo(cx - 150, top + 150);
  ctx.quadraticCurveTo(cx, top - 90, cx + 150, top + 150);
  ctx.lineTo(cx + 150, HORIZON - 120);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `hsla(${(scene.hue + 230) % 360}, 24%, 5%, 0.95)`;
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, top + 30);
  ctx.lineTo(cx, HORIZON - 120);
  ctx.lineWidth = 10;
  ctx.stroke();
}

function drawFloor(ctx: CanvasRenderingContext2D, scene: FilmScene, staging: Staging): void {
  const floor = ctx.createLinearGradient(0, HORIZON, 0, FILM_HEIGHT);
  floor.addColorStop(0, `hsl(${(scene.hue + 230) % 360} 24% ${staging.night ? 14 : 20}%)`);
  floor.addColorStop(1, `hsl(${(scene.hue + 260) % 360} 30% 3%)`);
  ctx.fillStyle = floor;
  ctx.fillRect(-200, HORIZON, FILM_WIDTH + 400, FILM_HEIGHT);

  // Wet ground: a soft vertical smear under the light, which sells rain far
  // better than the rain itself does.
  if (staging.rain || staging.night) {
    const sheen = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 420);
    sheen.addColorStop(0, `hsla(${(scene.hue + 40) % 360}, 70%, 60%, 0.22)`);
    sheen.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(FILM_WIDTH * 0.52, HORIZON, FILM_WIDTH * 0.36, 420);
  }
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

interface FigureOptions {
  /** Centre line of the figure. */
  x: number;
  /** Centre of the head. Every other landmark is derived from it. */
  headCy: number;
  headR: number;
  /** -1 faces left, 1 faces right. */
  facing: number;
  rimHue: number;
  rim: number;
  /** 0–1 across the shot, for breathing and weight shift. */
  t: number;
  phase: number;
  /** Long hair is the fastest way to tell two silhouettes apart. */
  longHair?: boolean;
  /** 0 arms down · 1 arms folded · 2 one arm raised. */
  pose?: number;
}

/**
 * One figure, built on a skeleton.
 *
 * A head on a trapezoid reads as a bowling pin, so this lays down actual
 * landmarks — neck, shoulders, elbows, wrists, hips, knees, ankles — and draws
 * limbs as tapered strokes between them. Proportions are the standard seven
 * heads crown to ankle, shoulders a little over two head-widths, waist above
 * the midpoint. Arms separated from the body and a weight shift onto one leg
 * are what stop it reading as a mannequin.
 *
 * Painted twice by the caller (offset in the rim colour, then in black), so
 * everything here has to be one flat colour.
 */
function paintFigure(ctx: CanvasRenderingContext2D, o: FigureOptions, color: string): void {
  const r = o.headR;
  const f = o.facing;
  const pose = o.pose ?? 0;

  const cycle = (o.t + o.phase) * Math.PI * 2;
  const breathe = Math.sin(cycle * 1.5) * r * 0.022;
  const sway = Math.sin(cycle * 0.65) * r * 0.05;
  // Weight rocks slowly from one leg to the other.
  const weight = Math.sin(cycle * 0.45) * 0.35;

  const cy = o.headCy + breathe;
  const shoulderY = cy + r * 1.9;
  const waistY = cy + r * 4.6;
  const hipY = cy + r * 5.8;
  const kneeY = cy + r * 9.2;
  const ankleY = cy + r * 13;

  const sh = r * 1.75;
  const wh = r * 1.02;
  const hh = r * 1.3;

  ctx.save();
  ctx.translate(o.x + sway, 0);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // --- legs, behind the torso -----------------------------------------------
  for (const side of [-1, 1]) {
    const bearing = side === Math.sign(weight || 1) ? 1 : 0.55;
    const hipX = side * hh * 0.5;
    // The free leg bends and sits closer in; the weighted one stays straight.
    const bend = (1 - bearing) * r * 0.5;
    const kneeX = side * (hh * 0.42 - bend * 0.3) + weight * r * 0.12;
    const ankleX = side * (r * 0.5 * bearing + 0.12 * r) + weight * r * 0.2;

    const kneeYs = kneeY - bend * 0.35;

    ctx.lineWidth = r * 0.8;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.quadraticCurveTo(hipX + (kneeX - hipX) * 0.5, hipY + (kneeYs - hipY) * 0.55, kneeX, kneeYs);
    ctx.stroke();

    ctx.lineWidth = r * 0.56;
    ctx.beginPath();
    ctx.quadraticCurveTo(kneeX, kneeYs, kneeX, kneeYs);
    ctx.moveTo(kneeX, kneeYs);
    ctx.quadraticCurveTo(kneeX + (ankleX - kneeX) * 0.3, kneeYs + (ankleY - kneeYs) * 0.55, ankleX, ankleY);
    ctx.stroke();

    // Foot, pointing the way the figure faces.
    ctx.beginPath();
    ctx.ellipse(ankleX + f * r * 0.2, ankleY + r * 0.08, r * 0.38, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- arms ------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const shoulderX = side * sh * 0.9;
    let elbowX: number;
    let elbowY: number;
    let wristX: number;
    let wristY: number;

    if (pose === 1) {
      // Folded: elbows out, forearms crossing the waist.
      elbowX = side * sh * 1.06;
      elbowY = waistY - r * 0.2;
      wristX = -side * wh * 0.5;
      wristY = waistY + r * 0.3;
    } else if (pose === 2 && side === f) {
      // One arm raised — holding something out, or warding someone off.
      elbowX = side * sh * 1.1;
      elbowY = waistY - r * 0.8;
      wristX = side * sh * 1.5;
      wristY = shoulderY + r * 0.4;
    } else {
      elbowX = side * (sh * 0.98 + Math.abs(weight) * r * 0.1);
      elbowY = waistY + r * 0.1;
      wristX = side * sh * 0.86;
      wristY = hipY + r * 0.9;
    }

    ctx.lineWidth = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + r * 0.1);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    ctx.lineWidth = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(wristX, wristY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(wristX, wristY, r * 0.21, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- torso -----------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(-sh, shoulderY);
  // Trapezius: shoulders slope up into the neck rather than meeting it square.
  ctx.quadraticCurveTo(-r * 0.8, shoulderY - r * 0.62, 0, shoulderY - r * 0.72);
  ctx.quadraticCurveTo(r * 0.8, shoulderY - r * 0.62, sh, shoulderY);
  ctx.quadraticCurveTo(sh * 0.86, waistY - r * 0.9, wh, waistY);
  ctx.quadraticCurveTo(hh * 0.98, hipY - r * 0.4, hh, hipY + r * 0.25);
  ctx.lineTo(-hh, hipY + r * 0.25);
  ctx.quadraticCurveTo(-hh * 0.98, hipY - r * 0.4, -wh, waistY);
  ctx.quadraticCurveTo(-sh * 0.86, waistY - r * 0.9, -sh, shoulderY);
  ctx.closePath();
  ctx.fill();

  // Folded forearms cross in front of the body, so they come back over it.
  if (pose === 1) {
    for (const side of [-1, 1]) {
      ctx.lineWidth = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(side * sh * 1.06, waistY - r * 0.2);
      ctx.lineTo(-side * wh * 0.5, waistY + r * 0.3);
      ctx.stroke();
    }
  }

  // --- neck ------------------------------------------------------------------
  ctx.lineWidth = r * 0.54;
  ctx.beginPath();
  ctx.moveTo(f * r * 0.06, cy + r * 0.72);
  ctx.lineTo(0, shoulderY - r * 0.5);
  ctx.stroke();

  // --- head ------------------------------------------------------------------
  const tilt = f * 0.06 + Math.sin(cycle * 0.5) * 0.02;
  ctx.save();
  ctx.translate(f * r * 0.08, cy);
  ctx.rotate(tilt);

  if (o.longHair) {
    // Hair falls past the shoulders and is the whole silhouette difference.
    // The crown sits just proud of the skull and the mass falls from the jaw
    // down. Any taller and it reads as a hood rather than hair.
    ctx.beginPath();
    ctx.moveTo(-r * 0.94, -r * 0.05);
    ctx.quadraticCurveTo(-r * 1.2, r * 1.9, -r * 0.66, r * 2.6);
    ctx.lineTo(r * 0.66, r * 2.6);
    ctx.quadraticCurveTo(r * 1.2, r * 1.9, r * 0.94, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.86, -r * 1.14, 0, -r * 1.14);
    ctx.quadraticCurveTo(-r * 0.86, -r * 1.14, -r * 0.94, -r * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!o.longHair) {
    // A cropped cap sitting slightly proud of the skull.
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.16, r * 0.87, r * 0.88, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // The nose is two pixels of profile, and it is what fixes which way they look.
  ctx.beginPath();
  ctx.moveTo(f * r * 0.74, -r * 0.06);
  ctx.lineTo(f * r * 0.96, r * 0.12);
  ctx.lineTo(f * r * 0.72, r * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function drawFigure(ctx: CanvasRenderingContext2D, o: FigureOptions): void {
  // A rim is a crescent, not an outline: lay the lit figure down first, offset
  // toward the light, then cover it with the black one.
  if (o.rim > 0) {
    const RIM_PX = 5;
    const scale = 1 + RIM_PX / (o.headR * 14);
    const cx = o.x;
    const cy = o.headCy + o.headR * 6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.translate(o.facing * RIM_PX * 0.8, -RIM_PX * 0.4);
    paintFigure(ctx, o, `hsla(${o.rimHue}, 82%, 66%, ${o.rim})`);
    ctx.restore();
  }
  paintFigure(ctx, o, 'rgba(3,4,10,0.98)');
}

/** Stages the shot. The lower third stays clear so the caption has a home. */
function drawCast(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  shot: ShotKind,
  local: number,
): void {
  const rimHue = (scene.hue + 40) % 360;

  if (shot === 'wide') {
    // Two people standing on the ground plane, right of centre so the title has
    // the left of the frame. Ankles land on the horizon line.
    const r = 23;
    drawFigure(ctx, {
      x: FILM_WIDTH * 0.53, headCy: HORIZON + 40 - r * 13, headR: r,
      facing: 1, rimHue, rim: 0.52, t: local, phase: 0, longHair: true, pose: 0,
    });
    const r2 = 21;
    drawFigure(ctx, {
      x: FILM_WIDTH * 0.73, headCy: HORIZON + 26 - r2 * 13, headR: r2,
      facing: -1, rimHue, rim: 0.32, t: local, phase: 0.4, pose: 1,
    });
    return;
  }

  if (shot === 'two') {
    // Over the shoulder: the near figure is a cropped mass in the corner, and
    // the one we are watching stands clear of them, mid-frame.
    drawFigure(ctx, {
      x: FILM_WIDTH * 0.6, headCy: FILM_HEIGHT * 0.26, headR: 52,
      facing: -1, rimHue, rim: 0.6, t: local, phase: 0, longHair: true, pose: 2,
    });
    drawFigure(ctx, {
      x: -FILM_WIDTH * 0.06, headCy: FILM_HEIGHT * 0.56, headR: 120,
      facing: 1, rimHue, rim: 0.2, t: local, phase: 0.55, pose: 0,
    });
    return;
  }

  // Close: head and shoulders, off-centre, lit down one edge. The body runs off
  // the bottom of the frame, which is what a close-up does.
  drawFigure(ctx, {
    // Sized against the close-up's own zoom (~1.5–1.9x): the head should read
    // as about a third of the frame, not fill it.
    x: FILM_WIDTH * 0.54, headCy: FILM_HEIGHT * 0.4, headR: 124,
    facing: -1, rimHue, rim: 0.7, t: local, phase: 0, longHair: true, pose: 0,
  });
}

// ---------------------------------------------------------------------------
// Atmosphere and grade
// ---------------------------------------------------------------------------

function drawRain(ctx: CanvasRenderingContext2D, t: number, seconds: number): void {
  ctx.strokeStyle = 'rgba(190,215,255,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 130; i += 1) {
    const speed = 900 + hash01(i * 3.1) * 700;
    const x = hash01(i) * (FILM_WIDTH + 300) - 150;
    const y = ((hash01(i * 7.7) * FILM_HEIGHT + t * seconds * speed) % (FILM_HEIGHT + 200)) - 100;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 11, y + 46);
  }
  ctx.stroke();
}

/** Dust in the light. Cheap, and it is what stops a still frame looking still. */
function drawMotes(ctx: CanvasRenderingContext2D, scene: FilmScene, t: number): void {
  ctx.fillStyle = `hsla(${(scene.hue + 45) % 360}, 80%, 76%, 0.3)`;
  for (let i = 0; i < 46; i += 1) {
    const a = t * Math.PI * 2 * (0.25 + hash01(i * 5.3) * 0.5) + hash01(i) * 6.28;
    const x = (hash01(i * 2.1) * FILM_WIDTH + Math.cos(a) * 34) % FILM_WIDTH;
    const y =
      ((hash01(i * 9.4) * FILM_HEIGHT + Math.sin(a) * 26 - t * 90) % FILM_HEIGHT + FILM_HEIGHT) %
      FILM_HEIGHT;
    const r = 1.2 + hash01(i * 4.7) * 2.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A grain tile, built once and stretched over the frame.
 *
 * Per-pixel grain at 720×1560×30fps is far too slow in JS; one small tile
 * scaled up costs a single drawImage and reads the same at phone size.
 */
let grainTile: HTMLCanvasElement | null = null;

function grain(ctx: CanvasRenderingContext2D, t: number): void {
  if (typeof document === 'undefined') return;

  if (!grainTile) {
    const size = 128;
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const tctx = tile.getContext('2d');
    if (!tctx) return;

    const data = tctx.createImageData(size, size);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    tctx.putImageData(data, 0, 0);
    grainTile = tile;
  }

  // Shifting the tile each frame is what makes it grain rather than texture.
  const ox = Math.floor(t * 3000) % 64;
  const oy = Math.floor(t * 4100) % 64;

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.055;
  ctx.drawImage(grainTile, -ox, -oy, FILM_WIDTH + 64, FILM_HEIGHT + 64);
  ctx.restore();
}

function drawGrade(ctx: CanvasRenderingContext2D, scene: FilmScene): void {
  const vignette = ctx.createRadialGradient(
    FILM_WIDTH / 2,
    FILM_HEIGHT * 0.46,
    FILM_WIDTH * 0.26,
    FILM_WIDTH / 2,
    FILM_HEIGHT * 0.5,
    FILM_WIDTH * 1.02,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);

  // A warm key from the light source, kept light — the earlier soft-light pass
  // over a hue-rotated sky turned every location the same olive sludge.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const key = ctx.createRadialGradient(
    FILM_WIDTH * 0.72, HORIZON - 260, 0,
    FILM_WIDTH * 0.72, HORIZON - 260, FILM_WIDTH * 0.85,
  );
  key.addColorStop(0, `hsla(${(scene.hue + 40) % 360}, 80%, 56%, 0.16)`);
  key.addColorStop(1, 'hsla(0,0%,0%,0)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
  ctx.restore();

  const scrim = ctx.createLinearGradient(0, FILM_HEIGHT * 0.5, 0, FILM_HEIGHT);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(0.62, 'rgba(0,0,0,0.5)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  staging: Staging,
  shot: ShotKind,
  local: number,
  t: number,
  seconds: number,
  seed: number,
): void {
  const shake = Math.sin(t * 37) * 1.6 + Math.sin(t * 11.3) * 2.2;
  const camera = cameraFor(shot, local, shake);

  // --- far: sky or back wall -------------------------------------------------
  ctx.save();
  withCamera(ctx, camera, 0.12);
  if (staging.location === 'room' || staging.location === 'office') {
    drawBackWall(ctx, scene, staging);
  } else {
    drawSky(ctx, scene, staging);
  }
  ctx.restore();

  // --- mid: the thing that says where we are --------------------------------
  ctx.save();
  withCamera(ctx, camera, 0.4);
  if (staging.location === 'street') drawSkyline(ctx, scene, seed);
  else if (staging.location === 'field') drawHorizonLand(ctx, scene);
  else if (staging.location === 'church') drawArch(ctx, scene);
  else if (staging.location === 'corridor') drawPerspectiveRow(ctx, scene, t * seconds, true);
  else if (staging.location === 'office') drawPerspectiveRow(ctx, scene, t * seconds, true);
  ctx.restore();

  // --- ground ----------------------------------------------------------------
  ctx.save();
  withCamera(ctx, camera, 0.62);
  drawFloor(ctx, scene, staging);
  ctx.restore();

  // --- the cast --------------------------------------------------------------
  ctx.save();
  withCamera(ctx, camera, 0.88);
  drawCast(ctx, scene, shot, local);
  ctx.restore();

  // --- air -------------------------------------------------------------------
  ctx.save();
  withCamera(ctx, camera, 1);
  drawMotes(ctx, scene, t);
  if (staging.rain) drawRain(ctx, t, seconds);
  ctx.restore();

  drawGrade(ctx, scene);
  grain(ctx, t);
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

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

    // A drop shadow, because the plate behind the text is now a moving image.
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 3;
    ctx.fillText(line.text, MARGIN_X, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

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
  const staging = stage(scene);
  const seed = seedOf(scene);

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

  drawScene(ctx, scene, staging, SHOTS[index], local, t, totalSeconds, seed);

  // A cut should feel like a cut: one dark frame at the head of each shot.
  if (index > 0 && local < 0.035) {
    ctx.fillStyle = `rgba(0,0,0,${1 - local / 0.035})`;
    ctx.fillRect(0, 0, FILM_WIDTH, FILM_HEIGHT);
  }

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
