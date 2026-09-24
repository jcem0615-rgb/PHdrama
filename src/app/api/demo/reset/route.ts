import { fail, ok } from '@/lib/api';
import { clearDemoState } from '@/server/demo-store';
import { isDemoMode } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wipes the demo cookie. Refuses outright once Supabase is configured. */
export async function POST() {
  if (!isDemoMode()) return fail('FEATURE_DISABLED');
  await clearDemoState();
  return ok({ reset: true });
}
