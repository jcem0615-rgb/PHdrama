import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { getStaff } from '@/server/staff';
import {
  BUILTIN_VOICES,
  DEFAULT_BUILTIN_VOICE,
  synthesiseBuiltin,
} from '@/server/story/builtin-voice';
import {
  DEFAULT_VOICE_ID,
  hasVoice,
  listVoices,
  narrationText,
  synthesise,
} from '@/server/story/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Which narrators are available.
 *
 * `builtin` is always available — espeak-ng runs inside this app. `elevenlabs`
 * appears only when a key is configured, and is the quality upgrade.
 */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const elevenlabsReady = hasVoice();

  return ok({
    engines: [
      {
        id: 'builtin',
        label: copy.admin.engineBuiltin,
        note: copy.admin.engineBuiltinNote,
        available: true,
        defaultVoiceId: DEFAULT_BUILTIN_VOICE,
        voices: BUILTIN_VOICES.map((voice) => ({
          id: voice.id,
          name: voice.name,
          description: voice.description,
        })),
      },
      {
        id: 'elevenlabs',
        label: copy.admin.engineElevenLabs,
        note: elevenlabsReady ? copy.admin.engineElevenLabsNote : copy.admin.voiceNoKey,
        available: elevenlabsReady,
        defaultVoiceId: DEFAULT_VOICE_ID,
        voices: elevenlabsReady ? await listVoices() : [],
      },
    ],
  });
}

/** Narrate one scene. Returns audio bytes the renderer mixes into the reel. */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const body = (await req.json().catch(() => null)) as {
    scene?: { episodeNumber: number; title: string; beat: string; hook: string };
    engine?: string;
    voiceId?: string;
  } | null;

  const scene = body?.scene;
  if (!scene || typeof scene.title !== 'string') return fail('INVALID_INPUT');

  const text = narrationText(scene);
  if (!text) return fail('INVALID_INPUT');

  // Built-in is the default: it works with nothing configured.
  if (body?.engine !== 'elevenlabs') {
    const result = await synthesiseBuiltin(text, body?.voiceId || DEFAULT_BUILTIN_VOICE);
    if ('error' in result) return fail('INTERNAL', copy.admin.voiceFailed);

    return new Response(new Uint8Array(result.audio), {
      headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' },
    });
  }

  const result = await synthesise(text, body?.voiceId || DEFAULT_VOICE_ID);

  if ('error' in result) {
    if (result.error === 'NO_KEY') return fail('FEATURE_DISABLED', copy.admin.voiceNoKey);
    if (result.error === 'REJECTED') return fail('FORBIDDEN', copy.admin.voiceRejected);
    if (result.error === 'QUOTA') return fail('RATE_LIMITED', copy.admin.voiceQuota);
    return fail('INTERNAL', copy.admin.voiceFailed);
  }

  return new Response(result.audio, {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
  });
}
