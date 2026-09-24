import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { isDemoMode } from '@/server/repository';
import { getStaff } from '@/server/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Turn a story into a series. `publish_story` creates the series and one
 * episode per scene, and only marks the series `published` when every scene has
 * a rendered video — otherwise it stays a draft and viewers never see it.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');
  if (isDemoMode()) return fail('FEATURE_DISABLED');

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data, error } = await supabase.rpc('publish_story', { p_story: id });
  if (error) return fail(codeFromPostgres(error.message));

  return ok(data as { series_id: string; scenes: number; rendered: number; published: boolean });
}
