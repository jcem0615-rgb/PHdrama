'use client';

import { Clapperboard, Loader2, Mic } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import Checkbox from '@/components/form/Checkbox';
import { copy } from '@/lib/copy';
import { putRenderedVideo } from '@/lib/demo/rendered-videos';
import { canRecordReels, recordReel } from '@/lib/record-reel';
import type { ApiResponse, Episode } from '@/lib/types';
import type { FilmScene } from '@/lib/reel-film';

/**
 * Renders every episode of a posted story to a real video file, locally.
 *
 * In demo mode the files land in this browser's IndexedDB and the player picks
 * them up. The live-mode path uploads to the private `videos` bucket instead —
 * see the render route.
 */
interface LiveScene extends FilmScene {
  sceneId: string;
}

/**
 * `episodes` renders locally into this browser (demo mode).
 * `storyId` fetches the story's scenes and uploads each render (live mode).
 */
export default function ReelRenderer({
  episodes,
  storyId,
}: {
  episodes?: Episode[];
  storyId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // MediaRecorder does not exist during SSR. Assume capable for the server
  // snapshot so the markup matches, then correct on the client.
  const supported = useSyncExternalStore(
    () => () => undefined,
    canRecordReels,
    () => true,
  );

  const [total, setTotal] = useState(episodes?.length ?? 0);
  const [narrate, setNarrate] = useState(false);
  const [voices, setVoices] = useState<{ id: string; name: string; description: string }[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch('/api/admin/narrate');
        const body = (await res.json()) as ApiResponse<{
          enabled: boolean;
          voices: { id: string; name: string; description: string }[];
          defaultVoiceId: string;
        }>;
        if (cancelled || !body.ok) return;

        setVoiceEnabled(body.data.enabled);
        setVoices(body.data.voices);
        setVoiceId(body.data.voices[0]?.id ?? body.data.defaultVoiceId);
      } catch {
        if (!cancelled) setVoiceEnabled(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** MP3 bytes for one scene, or null when narration is off or unavailable. */
  async function narration(scene: FilmScene): Promise<ArrayBuffer | undefined> {
    if (!narrate) return undefined;

    const res = await fetch('/api/admin/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scene, voiceId }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      throw new Error(body && !body.ok ? body.error.message : copy.admin.voiceFailed);
    }

    return res.arrayBuffer();
  }

  async function renderAll() {
    setBusy(true);
    setError(null);
    setDone(0);

    try {
      if (episodes) {
        setTotal(episodes.length);
        for (const [index, episode] of episodes.entries()) {
          setDone(index);
          const scene: FilmScene = {
            episodeNumber: episode.episodeNumber,
            seriesTitle: episode.seriesTitle,
            title: episode.title,
            beat: episode.beat ?? '',
            hook: episode.synopsis,
            hue: episode.posterHue,
          };

          const blob = await recordReel(scene, {
            narration: await narration(scene),
            onProgress: setProgress,
          });
          await putRenderedVideo(episode.id, blob);
        }
        setDone(episodes.length);
      } else if (storyId) {
        const res = await fetch(`/api/admin/stories/${storyId}/render`);
        const body = (await res.json()) as ApiResponse<{ scenes: LiveScene[] }>;
        if (!body.ok) {
          setError(body.error.message);
          return;
        }

        const scenes = body.data.scenes;
        setTotal(scenes.length);

        for (const [index, scene] of scenes.entries()) {
          setDone(index);
          const blob = await recordReel(scene, {
            narration: await narration(scene),
            onProgress: setProgress,
          });

          const form = new FormData();
          form.set('sceneId', scene.sceneId);
          form.set('video', blob, `${scene.sceneId}.webm`);

          const upload = await fetch(`/api/admin/stories/${storyId}/render`, {
            method: 'POST',
            body: form,
          });
          const uploaded = (await upload.json()) as ApiResponse<unknown>;
          if (!uploaded.ok) {
            setError(uploaded.error.message);
            return;
          }
        }
        setDone(scenes.length);
      }

      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : copy.errors.INTERNAL);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-3 space-y-2.5">
        <Checkbox
          tone="staff"
          label={copy.admin.narrationOn}
          hint={copy.admin.narrationHint}
          checked={narrate}
          onChange={setNarrate}
        />

        {narrate && voiceEnabled === false && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-300">
            {copy.admin.voiceNoKey}
          </p>
        )}

        {narrate && voiceEnabled && voices.length > 0 && (
          <label className="block text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              {copy.admin.voice}
            </span>
            <select
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                  {voice.description ? ` — ${voice.description}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={renderAll}
        disabled={busy || !supported || (narrate && voiceEnabled === false)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 py-2.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
        {busy ? copy.admin.rendering(done + 1, Math.max(1, total)) : copy.admin.renderVideos}
      </button>

      {busy && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-sky-400 transition-[width] duration-150"
            style={{ width: `${Math.round(((done + progress) / Math.max(1, total)) * 100)}%` }}
          />
        </div>
      )}

      {!busy && done > 0 && (
        <p className="mt-2 text-[11px] text-emerald-400">{copy.admin.rendered(done)}</p>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {supported ? copy.admin.renderHint : copy.admin.renderUnsupported}
      </p>
    </div>
  );
}
