'use client';

import { Loader2, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { copy } from '@/lib/copy';
import { posterGradient, posterUrl } from '@/lib/poster';
import type { ApiResponse, Episode, PlaybackTicket } from '@/lib/types';

type Phase = 'idle' | 'loading' | 'error' | 'buffering' | 'playing' | 'paused';

interface Props {
  episode: Episode;
  /** Only the visible reel loads a stream. Everything else tears down. */
  active: boolean;
  /** UI-side mirror of can_watch_episode. The API checks again regardless. */
  unlocked: boolean;
  muted: boolean;
  onToggleMute: () => void;
}

interface Destroyable {
  destroy: () => void;
}

/**
 * Attaches a source. HLS goes through Safari's native pipeline where it exists
 * and hls.js everywhere else; anything else (the bundled demo clip) is a plain
 * `src`.
 */
async function attach(
  video: HTMLVideoElement,
  src: string,
  onFatal: () => void,
): Promise<Destroyable | null> {
  const isHls = new URL(src, window.location.href).pathname.endsWith('.m3u8');

  if (!isHls || video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    return null;
  }

  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) {
    video.src = src;
    return null;
  }

  const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 20 });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal) onFatal();
  });
  hls.loadSource(src);
  hls.attachMedia(video);
  return hls;
}

/**
 * Plays one episode.
 *
 * It never receives a URL as a prop — it asks `/api/episodes/[id]/play`, which
 * only answers after Postgres says the viewer may watch. The ticket is
 * short-lived and is never persisted anywhere, including the service worker.
 *
 * All state is keyed on the stream it belongs to, so scrolling to another reel
 * resets the UI by derivation instead of by a cascade of effects.
 */
export default function SecureVideoPlayer({ episode, active, unlocked, muted, onToggleMute }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mutedRef = useRef(muted);
  // Set by the load effect so the <video> error handler shares its retry logic.
  const failRef = useRef<() => void>(() => undefined);

  const [attempt, setAttempt] = useState(0);
  const [ticketState, setTicketState] = useState<{
    key: string;
    ticket: PlaybackTicket | null;
    failed: boolean;
  }>({ key: '', ticket: null, failed: false });
  const [playback, setPlayback] = useState<{
    key: string;
    phase: 'buffering' | 'playing' | 'paused';
    progress: number;
  }>({ key: '', phase: 'buffering', progress: 0 });

  // '' means "no stream should be open right now".
  const streamKey = active && unlocked ? `${episode.id}#${attempt}` : '';

  const session = ticketState.key === streamKey ? ticketState : { key: streamKey, ticket: null, failed: false };
  const live =
    playback.key === streamKey ? playback : { key: streamKey, phase: 'buffering' as const, progress: 0 };

  const phase: Phase = !streamKey
    ? 'idle'
    : session.failed
      ? 'error'
      : !session.ticket
        ? 'loading'
        : live.phase;

  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!streamKey) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let player: Destroyable | null = null;
    let fallback: string | null = null;
    let usedFallback = false;

    const fail = () => {
      if (cancelled) return;

      // Demo mode ships a bundled clip; try it once before giving up.
      if (fallback && !usedFallback) {
        usedFallback = true;
        player?.destroy();
        player = null;
        video.src = fallback;
        void video.play().catch(() => undefined);
        return;
      }

      setTicketState({ key: streamKey, ticket: null, failed: true });
    };
    failRef.current = fail;

    void (async () => {
      try {
        const res = await fetch(`/api/episodes/${episode.id}/play`, { cache: 'no-store' });
        const body = (await res.json()) as ApiResponse<PlaybackTicket>;
        if (cancelled) return;

        if (!body.ok) {
          fail();
          return;
        }

        fallback = body.data.fallbackSrc;
        setTicketState({ key: streamKey, ticket: body.data, failed: false });

        player = await attach(video, body.data.src, fail);
        if (cancelled) {
          player?.destroy();
          return;
        }

        video.muted = mutedRef.current;
        // Autoplay with sound is blocked on mobile; the viewer taps play.
        await video.play().catch(() => undefined);
      } catch {
        fail();
      }
    })();

    return () => {
      cancelled = true;
      failRef.current = () => undefined;
      player?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [streamKey, episode.id]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const showControls = phase === 'playing' || phase === 'paused';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <div className="absolute inset-0" style={{ background: posterGradient(episode.posterHue) }} aria-hidden />

      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        poster={posterUrl(episode.id)}
        preload="none"
        onPlaying={() => setPlayback((p) => ({ key: streamKey, phase: 'playing', progress: p.progress }))}
        onPause={() => setPlayback((p) => ({ key: streamKey, phase: 'paused', progress: p.progress }))}
        onWaiting={() => setPlayback((p) => ({ key: streamKey, phase: 'buffering', progress: p.progress }))}
        onError={() => failRef.current()}
        onTimeUpdate={(event) => {
          const el = event.currentTarget;
          if (!el.duration) return;
          setPlayback((p) => ({
            key: streamKey,
            phase: p.key === streamKey ? p.phase : 'playing',
            progress: (el.currentTime / el.duration) * 100,
          }));
        }}
      />

      {/* Preview episodes have no video of their own yet, so the reel carries
          the episode's own words over the placeholder clip. */}
      {session.ticket?.previewCard && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-6 pb-[13.5rem]">
          <span className="mb-3 w-fit rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold tracking-widest backdrop-blur">
            PREVIEW
          </span>
          <p className="text-[11px] font-semibold tracking-[0.25em] text-white/60">
            EPISODE {session.ticket.previewCard.episodeNumber}
          </p>
          <h2 className="mt-1.5 line-clamp-2 max-w-[16ch] text-3xl font-black leading-[1.1] drop-shadow-lg">
            {session.ticket.previewCard.title}
          </h2>
          {session.ticket.previewCard.hook && (
            <p className="mt-2.5 line-clamp-2 max-w-[30ch] text-sm italic leading-relaxed text-white/80 drop-shadow">
              {session.ticket.previewCard.hook}
            </p>
          )}
        </div>
      )}

      {/* Session watermark — a random code, never an identifier. RA 10173. */}
      {session.ticket && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <span className="watermark absolute font-mono text-[11px] tracking-widest text-white/20">
            {session.ticket.watermarkCode}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 to-transparent" />

      {(phase === 'loading' || phase === 'buffering') && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-10 text-center">
          <div>
            <p className="text-sm text-white/80">{copy.player.error}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2 text-sm font-medium backdrop-blur"
            >
              <RotateCcw className="h-4 w-4" />
              {copy.player.retry}
            </button>
          </div>
        </div>
      )}

      {showControls && (
        <>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={phase === 'playing' ? 'Pause' : 'Play'}
            className="absolute inset-0 grid place-items-center"
          >
            {phase === 'paused' && (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/40 backdrop-blur">
                <Play className="h-7 w-7 translate-x-0.5 fill-white text-white" />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-flame-500 to-ember-500 transition-[width] duration-200"
          style={{ width: `${live.progress}%` }}
        />
      </div>
    </div>
  );
}
