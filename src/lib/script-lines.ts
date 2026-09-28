/**
 * The script, parsed into performable lines.
 *
 * The reel used to play three cards — title, what happens, the cliffhanger —
 * while the script sat unread in the database. This turns that script into the
 * thing on screen: who speaks, what they say, and in what order, so the figures
 * can act it out and the captions can attribute it.
 *
 * Pure and client-safe: the canvas renderer parses the same text the Studio
 * shows.
 */

export type LineKind = 'slug' | 'dialogue' | 'action' | 'hook';

export interface ScriptLine {
  kind: LineKind;
  /** Upper-case character name, for dialogue only. */
  speaker?: string;
  text: string;
}

const SLUG = /^(INT\.|EXT\.)/i;
const HOOK = /^HOOK\s*[—-]\s*/i;
/** "RINA: ..." — a name in caps, then the line. Allows spaces in names. */
const DIALOGUE = /^([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .'-]{1,22})\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/;

export function parseScript(script: string): ScriptLine[] {
  const out: ScriptLine[] = [];

  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (SLUG.test(line)) {
      out.push({ kind: 'slug', text: line });
      continue;
    }
    if (HOOK.test(line)) {
      out.push({ kind: 'hook', text: line.replace(HOOK, '').trim() });
      continue;
    }

    const match = DIALOGUE.exec(line);
    if (match) {
      const speaker = match[1].trim();
      // ACTION and BEAT are stage directions wearing a speaker's clothes.
      if (/^(ACTION|BEAT|NOTE)$/i.test(speaker)) {
        out.push({ kind: 'action', text: match[3].trim() });
      } else {
        out.push({ kind: 'dialogue', speaker, text: match[3].trim() });
      }
      continue;
    }

    out.push({ kind: 'action', text: line });
  }

  return out;
}

/** The distinct speakers, in order of first appearance. */
export function castOf(lines: ScriptLine[]): string[] {
  const seen: string[] = [];
  for (const line of lines) {
    if (line.kind === 'dialogue' && line.speaker && !seen.includes(line.speaker)) {
      seen.push(line.speaker);
    }
  }
  return seen;
}

export interface TimedLine extends ScriptLine {
  /** Seconds from the top of the reel. */
  start: number;
  end: number;
  /** Index into the cast, so the renderer knows which figure is talking. */
  castIndex: number;
}

/**
 * Lays the lines out across the runtime.
 *
 * Time is given by length rather than evenly: a four-word retort should not
 * hold the screen as long as a threat that runs to two sentences. The floor
 * stops one-word lines flashing past, and sluglines get a beat of their own
 * because a location change is worth registering.
 */
export function layOutScript(lines: ScriptLine[], totalSeconds: number): TimedLine[] {
  if (lines.length === 0) return [];

  const cast = castOf(lines);

  const weightOf = (line: ScriptLine): number => {
    if (line.kind === 'slug') return 0.6;
    // Roughly reading speed, with a floor so short lines still land.
    const words = line.text.split(/\s+/).filter(Boolean).length;
    const base = Math.max(1.1, words / 2.6);
    return line.kind === 'hook' ? base * 1.5 : base;
  };

  const weights = lines.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  let at = 0;
  return lines.map((line, i) => {
    const span = (weights[i] / total) * totalSeconds;
    const timed: TimedLine = {
      ...line,
      start: at,
      end: at + span,
      castIndex: line.speaker ? Math.max(0, cast.indexOf(line.speaker)) : -1,
    };
    at += span;
    return timed;
  });
}

/** The line playing at `seconds`, and how far through it we are. */
export function lineAt(
  timed: TimedLine[],
  seconds: number,
): { line: TimedLine; progress: number; index: number } | null {
  if (timed.length === 0) return null;

  let index = timed.findIndex((l) => seconds < l.end);
  if (index < 0) index = timed.length - 1;

  const line = timed[index];
  const span = Math.max(1e-6, line.end - line.start);
  return { line, index, progress: Math.min(1, Math.max(0, (seconds - line.start) / span)) };
}

/** What the narrator reads: the spoken lines, in order. */
export function spokenText(lines: ScriptLine[]): string {
  return lines
    .filter((l) => l.kind === 'dialogue' || l.kind === 'hook')
    .map((l) => l.text)
    .join(' ');
}
