import 'server-only';

import { createServerSupabase } from '@/lib/supabase/server';
import type { Staff } from '@/lib/types';

import { readDemoStaff } from './demo-store';
import { isDemoMode } from './repository';

/**
 * Who, if anyone, is signed into the admin portal.
 *
 * This is the ONLY gate on `/admin` and on `/api/admin/*`. It is separate from
 * `getViewer()` on purpose: the customer app asks who the shopper is, the
 * portal asks who the staff member is, and neither answer leaks into the other.
 *
 * Demo mode: a passcode sets a signed staff cookie.
 * Live mode: the Supabase session, plus a role check against `profiles`.
 */
export async function getStaff(): Promise<Staff | null> {
  if (isDemoMode()) return readDemoStaff();

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) return null;

  return {
    id: profile.id,
    displayName: profile.display_name ?? 'Staff',
    role: profile.role,
  };
}

export function isSuperAdmin(staff: Staff | null): boolean {
  return staff?.role === 'superadmin';
}
