import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  clearDemoStaff,
  demoAdminPasscode,
  writeDemoStaff,
} from '@/server/demo-store';
import { isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Staff sign-in for the admin portal.
 *
 * The role check happens here, on the server, before a session is handed back.
 * In live mode a customer who knows their own password still gets nothing: they
 * are signed straight back out if `profiles.role` is not staff.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    passcode?: string;
    email?: string;
    password?: string;
  } | null;

  if (isDemoMode()) {
    const expected = demoAdminPasscode();
    const given = body?.passcode ?? '';

    if (given.length !== expected.length || given !== expected) {
      return fail('FORBIDDEN', copy.admin.badCredentials);
    }

    await writeDemoStaff();
    return ok({ signedIn: true });
  }

  const { email, password } = body ?? {};
  if (!email || !password) return fail('INVALID_INPUT');

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !auth.user) return fail('FORBIDDEN', copy.admin.badCredentials);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
    // Authenticated, but not staff. Drop the session rather than leave a
    // customer signed in on a surface they cannot use.
    await supabase.auth.signOut();
    return fail('FORBIDDEN', copy.admin.notStaff);
  }

  return ok({ signedIn: true });
}

export async function DELETE() {
  if (isDemoMode()) {
    await clearDemoStaff();
    return ok({ signedOut: true });
  }

  const supabase = await createServerSupabase();
  await supabase?.auth.signOut();

  return ok({ signedOut: true });
}
