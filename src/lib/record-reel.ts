'use client';

import { FILM_HEIGHT, FILM_SECONDS, FILM_WIDTH, drawFilmFrame, type FilmScene } from '@/lib/reel-film';

/**
 * Records an episode's reel to a real video file, in the browser.
 *
 * Canvas → `captureStream` → `MediaRecorder`. No model, no GPU, no API key, no
 * per-second charge, no rate limit. It is motion graphics composed from the
 * script rather than generated footage, which is the honest trade for "free".
 */

const FPS = 30;

/** Browsers disagree on container; take the first one this browser will record. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;

  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function canRecordReels(): boolean {
  return typeof MediaRecorder !== 'undefined' && pickMimeType() !== undefined;
}

export async function recordReel(
  scene: FilmScene,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('UNSUPPORTED');

  const canvas = document.createElement('canvas');
  canvas.width = FILM_WIDTH;
  canvas.height = FILM_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('UNSUPPORTED');

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('RECORDER_FAILED'));
  });

  recorder.start();
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const t = Math.min(1, elapsed / FILM_SECONDS);

      drawFilmFrame(ctx, scene, t);
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
  stream.getTracks().forEach((track) => track.stop());

  return finished;
}
