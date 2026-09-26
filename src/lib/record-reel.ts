'use client';

import { FILM_HEIGHT, FILM_SECONDS, FILM_WIDTH, drawFilmFrame, type FilmScene } from '@/lib/reel-film';

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

export interface RecordOptions {
  /** MP3 bytes from the narration endpoint. Omit for a silent reel. */
  narration?: ArrayBuffer;
  onProgress?: (fraction: number) => void;
}

export async function recordReel(scene: FilmScene, options: RecordOptions = {}): Promise<Blob> {
  const { narration, onProgress } = options;

  const canvas = document.createElement('canvas');
  canvas.width = FILM_WIDTH;
  canvas.height = FILM_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('UNSUPPORTED');

  const videoStream = canvas.captureStream(FPS);
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

  let audioContext: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let seconds = FILM_SECONDS;

  if (narration) {
    audioContext = new AudioContext();
    // Some browsers start suspended; the render is behind a click, so this is fine.
    if (audioContext.state === 'suspended') await audioContext.resume();

    const buffer = await audioContext.decodeAudioData(narration.slice(0));
    const destination = audioContext.createMediaStreamDestination();

    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    tracks.push(...destination.stream.getAudioTracks());
    seconds = Math.max(FILM_SECONDS * 0.6, buffer.duration + TAIL_SECONDS);
  }

  const mimeType = pickMimeType(Boolean(narration));
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
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const t = Math.min(1, elapsed / seconds);

      drawFilmFrame(ctx, scene, t, seconds);
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
  tracks.forEach((track) => track.stop());
  await audioContext?.close();

  return finished;
}
