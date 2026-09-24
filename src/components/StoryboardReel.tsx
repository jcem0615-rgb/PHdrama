'use client';

import { useEffect, useRef, useState } from 'react';

import type { PlaybackTicket } from '@/lib/types';

type Storyboard = NonNullable<PlaybackTicket['storyboard']>;

/**
 * A storyboard reel.
 *
 * An episode published from the Story Studio has a script but no footage yet.
 * Rather than show every one of them the same silent placeholder, this animates
 * the episode's own beats — title, what happens, the cliffhanger — across the
 * clip's runtime, so each reel plays its own story.
 *
 * It is an animatic, not generated footage, and the PREVIEW badge says so. It
 * disappears the moment a real render lands, because the play endpoint then
 * returns `storyboard: null`.
 */

interface Props {
  storyboard: Storyboard;
  /** Beats hold while the viewer has the reel paused. */
  playing: boolean;
}

/**
 * The storyboard runs on its own clock rather than the clip's.
 *
 * The placeholder clip is a few seconds long and loops; pacing three beats to
 * it would flash them past faster than anyone can read. These durations are set
 * for reading, in seconds.
 */
const BEAT_SECONDS = [6, 8, 7];
const CYCLE = BEAT_SECONDS.reduce((total, seconds) => total + seconds, 0);
const TICK_MS = 100;

interface Beat {
  render: (storyboard: Storyboard) => React.ReactNode;
}

const BEATS: Beat[] = [
  {
    render: (s) => (
      <>
        <p className="text-[11px] font-semibold tracking-[0.3em] text-white/60">
          EPISODE {s.episodeNumber}
        </p>
        <h2 className="mt-2 text-4xl font-black leading-[1.05] drop-shadow-lg">{s.title}</h2>
        <p className="mt-3 text-sm text-white/60">{s.seriesTitle}</p>
      </>
    ),
  },
  {
    render: (s) => (
      <p className="text-2xl font-semibold leading-snug drop-shadow-lg">{s.beat || s.title}</p>
    ),
  },
  {
    render: (s) => (
      <>
        <p className="text-[11px] font-semibold tracking-[0.3em] text-flame-400">NEXT</p>
        <p className="mt-2 text-2xl font-bold italic leading-snug drop-shadow-lg">
          {s.hook || 'To be continued.'}
        </p>
      </>
    ),
  },
];

export default function StoryboardReel({ storyboard, playing }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number | null>(null);

  // The parent keys this component per episode, so the sequence restarts on its
  // own when the reel changes — no reset effect needed.
  useEffect(() => {
    if (!playing) return;

    startedRef.current ??= Date.now();

    const timer = window.setInterval(() => {
      const started = startedRef.current ?? Date.now();
      setElapsed(((Date.now() - started) / 1000) % CYCLE);
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [playing]);

  let index = 0;
  let consumed = 0;
  for (let i = 0; i < BEAT_SECONDS.length; i += 1) {
    if (elapsed < consumed + BEAT_SECONDS[i]) {
      index = i;
      break;
    }
    consumed += BEAT_SECONDS[i];
    index = i;
  }

  const beat = BEATS[index];

  // Ease in over the first fifth of each beat, out over the last tenth.
  const local = Math.min(1, Math.max(0, (elapsed - consumed) / BEAT_SECONDS[index]));
  const opacity = Math.min(1, Math.min(local / 0.2, (1 - local) / 0.1, 1));
  const lift = (1 - Math.min(1, local / 0.35)) * 14;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end px-6 pb-[13.5rem]">
      <span className="mb-4 w-fit rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold tracking-widest backdrop-blur">
        PREVIEW
      </span>

      <div
        key={index}
        className="max-w-[22ch]"
        style={{
          opacity: Number.isFinite(opacity) ? Math.max(0, opacity) : 1,
          transform: `translateY(${lift}px)`,
          transition: 'opacity 120ms linear, transform 120ms linear',
        }}
      >
        {beat.render(storyboard)}
      </div>

      {/* Beat ticks, so it reads as a sequence rather than a caption. */}
      <div className="mt-5 flex gap-1.5">
        {BEATS.map((_, i) => (
          <span
            key={i}
            className={`h-0.5 w-6 rounded-full transition-colors ${
              i <= index ? 'bg-white/80' : 'bg-white/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
