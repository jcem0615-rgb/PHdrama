import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { hueFromKey } from '@/lib/poster';
import { createServerSupabase } from '@/lib/supabase/server';
import { isDemoMode } from '@/server/repository';
import { getStaff } from '@/server/staff';
import { createAdminSupabase } from '@/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

/** The scenes the browser should render, in order. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');
  if (isDemoMode()) return fail('FEATURE_DISABLED');

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data, error } = await supabase
    .from('story_scenes')
    .select('id, scene_number, title, beat, hook, stories(title)')
    .eq('story_id', id)
    .order('scene_number');

  if (error) return fail(codeFromPostgres(error.message));

  const hue = hueFromKey(id);

  return ok({
    scenes: (data ?? []).map((row) => {
      const scene = row as unknown as {
        id: string;
        scene_number: number;
        title: string;
        beat: string;
        hook: string;
        stories: { title: string } | null;
      };

      return {
        sceneId: scene.id,
        episodeNumber: scene.scene_number,
        seriesTitle: scene.stories?.title ?? '',
        title: scene.title,
        beat: scene.beat ?? '',
        hook: scene.hook ?? '',
        hue: (hue + scene.scene_number * 7) % 360,
      };
    }),
  });
}

/**
 * Store one rendered reel.
 *
 * The browser does the rendering, so this only has to put the file in the
 * private `videos` bucket and close out the render job. Once every scene of a
 * story is here, `publish_story` publishes the series for real rather than as a
 * preview.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');
  if (isDemoMode()) return fail('FEATURE_DISABLED');

  const form = await req.formData().catch(() => null);
  const sceneId = form?.get('sceneId');
  const file = form?.get('video');

  if (typeof sceneId !== 'string' || !(file instanceof File)) return fail('INVALID_INPUT');
  if (file.size === 0 || file.size > MAX_BYTES) {
    return fail('INVALID_INPUT', 'That render is too large to store.');
  }

  const admin = createAdminSupabase();
  if (!admin) return fail('INTERNAL');

  const extension = file.type.includes('mp4') ? 'mp4' : 'webm';
  const path = `${id}/${sceneId}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from('videos')
    .upload(path, file, { contentType: file.type || 'video/webm', upsert: true });

  if (uploadError) return fail('INTERNAL', 'The render could not be stored.');

  const { error } = await admin
    .from('render_jobs')
    .update({
      status: 'succeeded',
      provider: 'local-canvas',
      output_path: path,
      finished_at: new Date().toISOString(),
      error: null,
    })
    .eq('scene_id', sceneId);

  if (error) return fail(codeFromPostgres(error.message));

  return ok({ path });
}
