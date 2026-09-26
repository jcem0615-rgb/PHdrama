import 'server-only';

/**
 * ElevenLabs narration.
 *
 * The key never leaves the server: the browser asks this app for audio, this
 * app asks ElevenLabs. Narration is a teaser — the episode's title, its beat
 * and its cliffhanger, not the whole script — which keeps it inside the free
 * tier's monthly character budget and matches what the reel actually shows.
 */

const API = 'https://api.elevenlabs.io/v1';

/** Rachel — a stock voice every account has, so there is a working default. */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export function voiceModel(): string {
  // Multilingual handles Filipino-inflected English better than the English-only
  // models, which matters for names and the odd Tagalog word.
  return process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
}

export function hasVoice(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export interface Voice {
  id: string;
  name: string;
  description: string;
}

/** What a reel says out loud. Short on purpose — it is a teaser, not the episode. */
export function narrationText(scene: {
  episodeNumber: number;
  title: string;
  beat: string;
  hook: string;
}): string {
  return [
    `Episode ${scene.episodeNumber}.`,
    `${scene.title.replace(/\.*$/, '')}.`,
    scene.beat,
    scene.hook,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 600);
}

export async function listVoices(): Promise<Voice[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];

  const res = await fetch(`${API}/voices`, {
    headers: { 'xi-api-key': key },
    cache: 'no-store',
  });
  if (!res.ok) return [];

  const body = (await res.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };

  return (body.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name,
    description: Object.values(voice.labels ?? {})
      .filter(Boolean)
      .slice(0, 3)
      .join(' · '),
  }));
}

export type NarrationError = 'NO_KEY' | 'REJECTED' | 'QUOTA' | 'FAILED';

export async function synthesise(
  text: string,
  voiceId: string,
): Promise<{ audio: ArrayBuffer } | { error: NarrationError; detail?: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { error: 'NO_KEY' };

  let res: Response;
  try {
    res = await fetch(
      `${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: voiceModel(),
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 },
        }),
      },
    );
  } catch {
    return { error: 'FAILED' };
  }

  if (res.ok) return { audio: await res.arrayBuffer() };

  // 401 is a bad key; 422 is usually a voice the account cannot use.
  if (res.status === 401 || res.status === 403) return { error: 'REJECTED' };
  if (res.status === 429) return { error: 'QUOTA' };

  const detail = await res.text().catch(() => '');
  return { error: 'FAILED', detail: detail.slice(0, 200) };
}
