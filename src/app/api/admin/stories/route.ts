import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { isDemoMode } from '@/server/repository';
import { getStaff } from '@/server/staff';
import { generateBreakdown } from '@/server/story/script';
import { PENDING_PROVIDER } from '@/server/story/video';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Writing a 40-episode breakdown is not a fast request.
export const maxDuration = 300;

/**
 * Write a breakdown for a premise, and in live mode persist it: one story, one
 * scene per episode, and one queued render job per scene.
 *
 * Demo mode has nowhere to persist, so it returns the breakdown and says so.
 */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');

  const body = (await req.json().catch(() => null)) as {
    premise?: string;
    title?: string;
    episodes?: number;
  } | null;

  const premise = body?.premise?.trim() ?? '';
  const episodes = Number(body?.episodes ?? 12);

  if (premise.length < 20) {
    return fail('INVALID_INPUT', 'Give the premise at least a couple of sentences to work with.');
  }
  if (!Number.isInteger(episodes) || episodes < 1 || episodes > 80) {
    return fail('INVALID_INPUT', 'Pick between 1 and 80 episodes.');
  }

  let breakdown;
  let model: string | null;
  try {
    ({ breakdown, model } = await generateBreakdown({ premise, episodes, title: body?.title }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'REFUSED') {
      return fail('INVALID_INPUT', 'The model declined this premise. Try a different one.');
    }
    return fail('INTERNAL', 'The breakdown could not be written. Try again.');
  }

  if (isDemoMode()) {
    return ok({ breakdown, model, persisted: false, storyId: null });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .insert({
      title: breakdown.title,
      logline: breakdown.logline,
      premise,
      tags: breakdown.tags,
      target_episodes: episodes,
      status: 'scripted',
      model,
      created_by: staff.id,
    })
    .select('id')
    .single();

  if (storyError || !story) return fail(codeFromPostgres(storyError?.message));

  const { data: scenes, error: sceneError } = await supabase
    .from('story_scenes')
    .insert(
      breakdown.scenes.map((scene) => ({
        story_id: story.id,
        scene_number: scene.scene_number,
        title: scene.title,
        beat: scene.beat,
        script: scene.script,
        hook: scene.hook,
        duration_seconds: Math.max(1, Math.round(scene.duration_seconds)),
      })),
    )
    .select('id');

  if (sceneError) return fail(codeFromPostgres(sceneError.message));

  // One queued job per scene. Nothing picks these up until a provider is wired
  // — see src/server/story/video.ts.
  await supabase.from('render_jobs').insert(
    (scenes ?? []).map((scene) => ({
      story_id: story.id,
      scene_id: scene.id,
      provider: PENDING_PROVIDER,
      status: 'queued',
    })),
  );

  return ok({ breakdown, model, persisted: true, storyId: story.id });
}
