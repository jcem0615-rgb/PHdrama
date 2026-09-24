import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { createServerSupabase } from '@/lib/supabase/server';
import { isEmail } from '@/lib/validate';
import {
  demoSignIn,
  demoSignOut,
  readDemoState,
  writeDemoState,
  writePersistence,
} from '@/server/demo-store';
import { isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Customer sign-in. Staff sign in at /api/admin/session instead. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    remember?: boolean;
  } | null;

  const email = body?.email?.trim() ?? '';
  const password = body?.password ?? '';
  const remember = body?.remember === true;

  if (!isEmail(email)) return fail('INVALID_INPUT', copy.auth.invalidEmail);
  if (!password) return fail('INVALID_INPUT', copy.auth.badCredentials);

  // Recorded first so the session cookies written below pick up the lifetime.
  await writePersistence(remember);

  if (isDemoMode()) {
    const state = await readDemoState();
    await writeDemoState(demoSignIn(state, email));
    return ok({ signedIn: true });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail('UNAUTHENTICATED', copy.auth.badCredentials);

  return ok({ signedIn: true });
}

export async function DELETE() {
  await writePersistence(false);

  if (isDemoMode()) {
    const state = await readDemoState();
    await writeDemoState(demoSignOut(state));
    return ok({ signedOut: true });
  }

  const supabase = await createServerSupabase();
  await supabase?.auth.signOut();

  return ok({ signedOut: true });
}
