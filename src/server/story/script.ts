import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Turns a premise into a per-episode scene breakdown.
 *
 * With ANTHROPIC_API_KEY set this asks Claude. Without it, a deterministic
 * local outliner runs instead, so the Studio is demonstrable with no key and no
 * spend — the same demo/live split the rest of the app uses.
 */

export const SceneSchema = z.object({
  scene_number: z.number(),
  title: z.string(),
  beat: z.string(),
  script: z.string(),
  hook: z.string(),
  duration_seconds: z.number(),
});

const BreakdownSchema = z.object({
  title: z.string(),
  logline: z.string(),
  tags: z.array(z.string()),
  scenes: z.array(SceneSchema),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Breakdown = z.infer<typeof BreakdownSchema>;

export interface ScriptRequest {
  premise: string;
  episodes: number;
  title?: string;
}

export function hasScriptModel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const SCRIPT_MODEL = 'claude-opus-5';

const SYSTEM = `You write vertical short-drama serials for a Filipino mobile audience.

House rules:
- Each episode is 60–120 seconds. One location, two or three speaking parts.
- Every episode ends on a hook — a reveal, a threat, or a question — that makes
  paying to unlock the next one feel worth it. Episode 5 ends on the hardest
  hook of the series, because episodes 1–5 are free and episode 6 is the first
  one a viewer has to pay for.
- Dialogue is English with natural Filipino phrasing and the odd Tagalog word
  where a real person would use one. Do not write a glossary.
- Keep it PG-13: betrayal, class conflict, family debt, revenge. No explicit
  content, no graphic violence, no real people, no real brands.
- "beat" is what happens, in one or two sentences. "script" is the actual
  dialogue and action for the episode. "hook" is the closing line.`;

/** Deterministic fallback so the pipeline is testable with no key and no spend. */
function localBreakdown({ premise, episodes, title }: ScriptRequest): Breakdown {
  // Cut the first sentence at a word boundary rather than mid-word.
  const firstSentence = premise.trim().split(/[.!?\n]/)[0] ?? '';
  const derived =
    title?.trim() ||
    (firstSentence.length > 52
      ? `${firstSentence.slice(0, 52).replace(/\s+\S*$/, '')}…`
      : firstSentence) ||
    'Untitled';

  const ARCS = [
    ['The arrival', 'Someone walks into a life that is not theirs yet.'],
    ['The first lie', 'A small untruth buys another day and costs more than it saves.'],
    ['The witness', 'Somebody saw. They have not decided what to do about it.'],
    ['The debt', 'An old obligation comes due at the worst possible hour.'],
    ['The proof', 'A document, a photo, a voice note — something that cannot be argued with.'],
    ['The offer', 'Money is put on the table in exchange for silence.'],
    ['The turn', 'An ally is revealed to have been playing a longer game.'],
    ['The reckoning', 'Two people say out loud what everyone already knew.'],
  ];

  return {
    title: derived,
    logline: premise.trim().slice(0, 200),
    tags: ['drama', 'revenge', 'family'],
    scenes: Array.from({ length: episodes }, (_, i) => {
      const n = i + 1;
      const [arc, beat] = ARCS[i % ARCS.length];
      return {
        scene_number: n,
        title: `${arc}${n > ARCS.length ? ` (${Math.ceil(n / ARCS.length)})` : ''}`,
        beat,
        script: `[Outline only — no ANTHROPIC_API_KEY is set, so this episode was not written by a model.]\n\nPremise: ${premise.trim()}\n\nEpisode ${n}: ${beat}`,
        hook:
          n === 5
            ? 'And that is when she realises the person who hired her already knew her name.'
            : 'Someone is standing in the doorway. They have been there the whole time.',
        duration_seconds: 75 + ((n * 7) % 40),
      };
    }),
  };
}

export async function generateBreakdown(request: ScriptRequest): Promise<{
  breakdown: Breakdown;
  model: string | null;
}> {
  if (!hasScriptModel()) {
    return { breakdown: localBreakdown(request), model: null };
  }

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: SCRIPT_MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: zodOutputFormat(BreakdownSchema),
    },
    messages: [
      {
        role: 'user',
        content: `Break this premise into exactly ${request.episodes} episodes.

Premise:
${request.premise.trim()}

${request.title ? `Use this series title: ${request.title.trim()}` : 'Give the series a title a Filipino viewer would tap on.'}

Number the scenes 1 to ${request.episodes}, in order.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('REFUSED');
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new Error('UNPARSEABLE');

  return { breakdown: parsed, model: SCRIPT_MODEL };
}
