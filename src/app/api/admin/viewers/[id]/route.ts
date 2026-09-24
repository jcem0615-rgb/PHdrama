import type { NextRequest } from 'next/server';

import { codeFromPostgres, fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { createServerSupabase } from '@/lib/supabase/server';
import { applyLedger, readDemoState, writeDemoState } from '@/server/demo-store';
import { isDemoMode } from '@/server/repository';
import { getStaff, isSuperAdmin } from '@/server/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manual coin and VIP adjustments.
 *
 * Both go straight into `admin_adjust_coins` / `admin_set_vip`, which are
 * SuperAdmin-only in Postgres and write the ledger row themselves. Nothing here
 * touches a balance directly — the reason string is required precisely because
 * it is what the audit trail will be read back as.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const staff = await getStaff();
  if (!staff) return fail('FORBIDDEN');
  if (!isSuperAdmin(staff)) return fail('FORBIDDEN', copy.admin.superAdminOnly);

  const body = (await req.json().catch(() => null)) as {
    action?: 'coins' | 'vip';
    delta?: number;
    days?: number;
    reason?: string;
  } | null;

  const reason = body?.reason?.trim().slice(0, 200) ?? '';
  if (!reason) return fail('INVALID_INPUT', copy.admin.reasonRequired);

  if (body?.action === 'coins') {
    const delta = Number(body.delta);
    if (!Number.isInteger(delta) || delta === 0) return fail('INVALID_INPUT');

    if (isDemoMode()) {
      const state = await readDemoState();
      applyLedger(state, delta, reason);
      if (state.coins < 0) state.coins = 0;
      await writeDemoState(state);
      return ok({ balance: state.coins });
    }

    const supabase = await createServerSupabase();
    if (!supabase) return fail('INTERNAL');

    const { data, error } = await supabase.rpc('admin_adjust_coins', {
      p_user: id,
      p_delta: delta,
      p_reason: reason,
    });
    if (error) return fail(codeFromPostgres(error.message));

    return ok({ balance: (data as { balance: number }).balance });
  }

  if (body?.action === 'vip') {
    const days = Number(body.days);
    if (!Number.isInteger(days)) return fail('INVALID_INPUT');

    if (isDemoMode()) {
      const state = await readDemoState();
      if (days === 0) {
        state.vipExpiresAt = null;
      } else {
        // Same stacking rule as approve_payment: extend from the current expiry.
        const base = Math.max(state.vipExpiresAt ?? 0, Date.now());
        const next = base + days * 86_400_000;
        state.vipExpiresAt = next <= Date.now() ? null : next;
      }
      await writeDemoState(state);
      return ok({ vipExpiresAt: state.vipExpiresAt });
    }

    const supabase = await createServerSupabase();
    if (!supabase) return fail('INTERNAL');

    const { data, error } = await supabase.rpc('admin_set_vip', {
      p_user: id,
      p_days: days,
      p_reason: reason,
    });
    if (error) return fail(codeFromPostgres(error.message));

    return ok({ vipExpiresAt: (data as { vip_expires_at: string | null }).vip_expires_at });
  }

  return fail('INVALID_INPUT');
}
