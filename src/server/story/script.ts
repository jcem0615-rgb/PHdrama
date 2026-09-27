import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { writeBreakdown } from '@/server/story/builtin-writer';

/**
 * Turns a premise into a per-episode scene breakdown.
 *
 * Two writers. The built-in one (`builtin-writer.ts`) is the default and needs
 * no key, no account and no spend. Claude writes instead when ANTHROPIC_API_KEY
 * is set — it invents where the built-in engine can only recombine — and is
 * metered per token, so it stays opt-in.
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

export async function generateBreakdown(request: ScriptRequest): Promise<{
  breakdown: Breakdown;
  model: string | null;
}> {
  if (!hasScriptModel()) {
    return { breakdown: writeBreakdown(request), model: null };
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
