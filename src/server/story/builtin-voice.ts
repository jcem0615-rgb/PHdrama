import 'server-only';

/**
 * Built-in narration.
 *
 * espeak-ng compiled to WebAssembly, running inside this app's own serverless
 * function. No API key, no account, no third-party call, no per-character
 * charge, and nothing to run out of. It is a formant synthesiser, so it sounds
 * synthetic rather than human — that is the trade for owning the whole thing.
 *
 * ElevenLabs stays available as the quality upgrade for anyone who wants it.
 */

export interface BuiltinVoice {
  id: string;
  name: string;
  description: string;
}

/**
 * An allowlist, not a passthrough. An unknown voice code makes espeak-ng abort
 * the WASM runtime rather than throw, which would poison the whole function
 * instance for later requests.
 */
export const BUILTIN_VOICES: BuiltinVoice[] = [
  { id: 'en-us+f3', name: 'US English', description: 'female' },
  { id: 'en-us+f1', name: 'US English', description: 'female, softer' },
  { id: 'en-us+m3', name: 'US English', description: 'male' },
  { id: 'en-us+m7', name: 'US English', description: 'male, deeper' },
  { id: 'en-us', name: 'US English', description: 'neutral' },
  { id: 'en-gb', name: 'British English', description: 'neutral' },
  { id: 'en-gb-x-rp', name: 'British English', description: 'received pronunciation' },
  { id: 'en-gb-scotland', name: 'Scottish English', description: 'neutral' },
];

// Every entry above was checked to produce audibly different output. The
// `+f`/`+m` variant suffixes are silently ignored on some base voices — en-gb+f2
// and en-gb+m1 return audio byte-identical to plain en-gb — so those are left
// out rather than offered as choices that do nothing.

export const DEFAULT_BUILTIN_VOICE = 'en-us+f3';

export function isBuiltinVoice(id: string): boolean {
  return BUILTIN_VOICES.some((voice) => voice.id === id);
}

/** Returns WAV bytes — 22.05 kHz mono, which `decodeAudioData` handles fine. */
export async function synthesiseBuiltin(
  text: string,
  voiceId: string,
): Promise<{ audio: Uint8Array } | { error: 'FAILED' }> {
  const voice = isBuiltinVoice(voiceId) ? voiceId : DEFAULT_BUILTIN_VOICE;

  try {
    // Loaded lazily: it drags in a ~10 MB WASM blob that only this path needs.
    const { default: text2wav } = await import('text2wav');

    const audio = await text2wav(text, {
      voice,
      // A touch slower than espeak's default — this is narration, not a screen
      // reader, and the hook needs to land.
      speed: 145,
      pitch: 45,
      // No `amplitude`: passing it at all — even espeak's own default of 100 —
      // makes text2wav return a correctly sized but entirely silent WAV.
    });

    return { audio };
  } catch {
    return { error: 'FAILED' };
  }
}
