import type { NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api';
import { copy } from '@/lib/copy';
import { createServerSupabase } from '@/lib/supabase/server';
import { isEmail, isPasswordLongEnough } from '@/lib/validate';
import {
  demoSignIn,
  nameFromEmail,
  readDemoState,
  writeDemoState,
  writePersistence,
} from '@/server/demo-store';
import { isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Customer sign-up.
 *
 * The 50 welcome coins are not granted here — `handle_new_user` in
 * 0001_init.sql does it, in the same transaction that creates the profile, and
 * writes the matching `coin_ledger` row. Demo mode mirrors that.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    displayName?: string;
    remember?: boolean;
  } | null;

  const email = body?.email?.trim() ?? '';
  const password = body?.password ?? '';
  const remember = body?.remember === true;
  const displayName = body?.displayName?.trim().slice(0, 40) || nameFromEmail(email || 'viewer');

  if (!isEmail(email)) return fail('INVALID_INPUT', copy.auth.invalidEmail);
  if (!isPasswordLongEnough(password)) return fail('INVALID_INPUT', copy.auth.weakPassword);

  await writePersistence(remember);

  if (isDemoMode()) {
    const state = await readDemoState();
    await writeDemoState(demoSignIn(state, email, displayName));
    return ok({ signedIn: true, confirmationRequired: false });
  }

  const supabase = await createServerSupabase();
  if (!supabase) return fail('INTERNAL');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) {
      return fail('INVALID_INPUT', copy.auth.emailTaken);
    }
    if (message.includes('password')) return fail('INVALID_INPUT', copy.auth.weakPassword);
    return fail('INVALID_INPUT', error.message);
  }

  // With email confirmations on, signUp returns a user but no session.
  const confirmationRequired = !data.session;

  return ok({ signedIn: !confirmationRequired, confirmationRequired });
}
