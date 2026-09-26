import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { getStaff } from '@/server/staff';
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

/** The voices this account can use, for the Studio's picker. */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  return ok({ enabled: hasVoice(), voices: await listVoices(), defaultVoiceId: DEFAULT_VOICE_ID });
}

/**
 * Narrate one scene. Returns MP3 bytes, which the renderer mixes into the
 * episode's video so the audio is baked into the file rather than replayed
 * alongside it.
 */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const body = (await req.json().catch(() => null)) as {
    scene?: { episodeNumber: number; title: string; beat: string; hook: string };
    voiceId?: string;
  } | null;

  const scene = body?.scene;
  if (!scene || typeof scene.title !== 'string') return fail('INVALID_INPUT');

  const text = narrationText(scene);
  if (!text) return fail('INVALID_INPUT');

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
