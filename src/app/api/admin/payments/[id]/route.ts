import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { demoApprove, demoReject, readDemoState, writeDemoState } from '@/server/demo-store';
import { getViewer, isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Approve or reject a pending payment. The database does the crediting. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const viewer = await getViewer();
  if (!viewer) return fail('UNAUTHENTICATED');
  if (viewer.role !== 'admin' && viewer.role !== 'superadmin') return fail('FORBIDDEN');

  const body = (await req.json().catch(() => null)) as { action?: string; note?: string } | null;
  const action = body?.action;
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  if (action !== 'approve' && action !== 'reject') return fail('INVALID_INPUT');

  if (isDemoMode()) {
    const state = await readDemoState();
    const done = action === 'approve' ? demoApprove(state, id, note) : demoReject(state, id, note);
    if (!done) return fail('ALREADY_REVIEWED');
    await writeDemoState(state);
    return ok({ status: action === 'approve' ? 'approved' : 'rejected' });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { error } = await supabase.rpc(action === 'approve' ? 'approve_payment' : 'reject_payment', {
    p_payment: id,
    p_note: note,
  });

  if (error) return fail(codeFromPostgres(error.message));

  return ok({ status: action === 'approve' ? 'approved' : 'rejected' });
}
