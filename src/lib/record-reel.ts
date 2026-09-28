'use client';

import {
  FILM_HEIGHT,
  FILM_SECONDS,
  FILM_WIDTH,
  drawFilmFrame,
  type FilmScene,
  type Footage,
} from '@/lib/reel-film';

/**
 * Records an episode's reel to a real video file, in the browser.
 *
 * Canvas → `captureStream` → `MediaRecorder`. No model, no GPU, no per-second
 * charge for the picture. When narration is supplied it is mixed into the same
 * recording, so the audio is inside the file rather than replayed alongside it,
 * and the reel runs as long as the voice needs.
 */

const FPS = 30;
/** A breath after the narrator stops, so the hook is not cut off mid-word. */
const TAIL_SECONDS = 1.2;

function pickMimeType(withAudio: boolean): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const candidates = withAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function canRecordReels(): boolean {
  return typeof MediaRecorder !== 'undefined' && pickMimeType(false) !== undefined;
}

/** One spoken line, and when in the reel it should be heard. */
export interface NarratedLine {
  /** Seconds from the top of the reel. */
  start: number;
  audio: ArrayBuffer;
}

export interface RecordOptions {
  /** MP3 bytes from the narration endpoint. Omit for a silent reel. */
  narration?: ArrayBuffer;
  /**
   * Narration line by line, each scheduled at its caption's moment.
   *
   * One blob for a whole episode desynchronises immediately: the narrator
   * reads a five-minute script in under two minutes, so the voice runs ahead
   * of the captions and then leaves minutes of silence. Scheduling each line
   * against its own start time keeps the voice on the words on screen, and the
   * gaps between lines become the pauses a scene needs.
   */
  narrationLines?: NarratedLine[];
  /** Reel length in seconds. Defaults to FILM_SECONDS. */
  seconds?: number;
  /**
   * Same-origin URL of a clip to use as the backdrop instead of the drawn
   * scene. Must be same-origin: a cross-origin video taints the canvas and
   * `captureStream` then throws.
   */
  footageSrc?: string;
  onProgress?: (fraction: number) => void;
}

/**
 * Loads the backdrop clip and gets it playing.
 *
 * Resolves to null rather than throwing on anything — a clip that will not
 * load is a reason to render the drawn scene, not a reason to lose the reel.
 */
async function openFootage(src: string): Promise<HTMLVideoElement | null> {
  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  // Same-origin already, but this makes the intent explicit and keeps the
  // canvas clean if the URL ever changes.
  video.crossOrigin = 'anonymous';

  const ready = await new Promise<boolean>((resolve) => {
    const done = (value: boolean) => () => resolve(value);
    video.onloadeddata = done(true);
    video.onerror = done(false);
    setTimeout(() => resolve(video.readyState >= 2), 15000);
  });

  if (!ready || video.videoWidth === 0) return null;

  try {
    await video.play();
  } catch {
    return null;
  }
  return video;
}

export async function recordReel(scene: FilmScene, options: RecordOptions = {}): Promise<Blob> {
  const { narration, narrationLines, footageSrc, onProgress } = options;

  const video = footageSrc ? await openFootage(footageSrc) : null;
  const footage: Footage | undefined = video
    ? { source: video, width: video.videoWidth, height: video.videoHeight }
    : undefined;

  const canvas = document.createElement('canvas');
  canvas.width = FILM_WIDTH;
  canvas.height = FILM_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('UNSUPPORTED');

  const videoStream = canvas.captureStream(FPS);
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

  let audioContext: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  // Each node carries its own cue, because a line that fails to decode is
  // dropped and indices into the original list stop lining up.
  const scheduled: { at: number; node: AudioBufferSourceNode }[] = [];
  let seconds = options.seconds ?? FILM_SECONDS;
  // The runtime the picture is laid out against, which is not always the length
  // we record for. Lines were cued against this runtime by the caller, so it
  // must not move underneath them — see the tail extension below.
  let filmSeconds = seconds;

  if (narrationLines && narrationLines.length > 0) {
    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') await audioContext.resume();

    const destination = audioContext.createMediaStreamDestination();
    const decoded = await Promise.all(
      narrationLines.map(async (line) => {
        try {
          return { start: line.start, buffer: await audioContext!.decodeAudioData(line.audio.slice(0)) };
        } catch {
          return null;
        }
      }),
    );

    const usable = decoded.filter((d): d is { start: number; buffer: AudioBuffer } => d !== null);
    for (const line of usable) {
      const node = audioContext.createBufferSource();
      node.buffer = line.buffer;
      node.connect(destination);
      scheduled.push({ at: line.start, node });
    }

    tracks.push(...destination.stream.getAudioTracks());

    // Never cut a line off: if the last one would run past the reel, keep
    // recording. Only the recording extends — the layout stays where the caller
    // put it, because these lines were cued against that layout and stretching
    // it now would walk every caption away from its own voice.
    const lastEnd = usable.reduce((max, l) => Math.max(max, l.start + l.buffer.duration), 0);
    seconds = Math.max(seconds, lastEnd + TAIL_SECONDS);
  } else if (narration) {
    audioContext = new AudioContext();
    // Some browsers start suspended; the render is behind a click, so this is fine.
    if (audioContext.state === 'suspended') await audioContext.resume();

    const buffer = await audioContext.decodeAudioData(narration.slice(0));
    const destination = audioContext.createMediaStreamDestination();

    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    tracks.push(...destination.stream.getAudioTracks());
    // One blob over the title cards: here the reel really does follow the voice,
    // so the picture stretches with it.
    seconds = Math.max(FILM_SECONDS * 0.6, buffer.duration + TAIL_SECONDS);
    filmSeconds = seconds;
  }

  // Keyed off whether an audio track actually joined the stream. Asking for a
  // video-only codec while an audio track is present mislabels the file.
  const mimeType = pickMimeType(tracks.some((track) => track.kind === 'audio'));
  if (!mimeType) throw new Error('UNSUPPORTED');

  const recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType,
    videoBitsPerSecond: 900_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('RECORDER_FAILED'));
  });

  recorder.start();
  source?.start();
  // Each line goes off at its caption's moment, on the audio clock.
  if (audioContext && scheduled.length > 0) {
    const base = audioContext.currentTime + 0.08;
    for (const line of scheduled) line.node.start(base + line.at);
  }
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const t = Math.min(1, elapsed / seconds);

      // `t` is progress through the recording; the frame is drawn against the
      // layout's own runtime, so a tail extension plays the last beat out
      // rather than re-timing the whole episode.
      drawFilmFrame(ctx, scene, Math.min(1, elapsed / filmSeconds), filmSeconds, footage);
      onProgress?.(t);

      if (t >= 1) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  source?.stop();
  for (const line of scheduled) {
    try {
      line.node.stop();
    } catch {
      // Already finished, or never started because the reel ended first.
    }
  }
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  tracks.forEach((track) => track.stop());
  await audioContext?.close();

  return finished;
}
