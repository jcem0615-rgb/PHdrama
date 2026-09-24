import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { SUPABASE_URL } from '@/lib/supabase/env';

/**
 * Service-role client. The ONLY module allowed to read
 * SUPABASE_SERVICE_ROLE_KEY, and it is `server-only` so importing it from a
 * client component is a build error rather than a leaked key.
 *
 * Use it for signed URLs and for `grant_ad_unlock`. Never for a read that RLS
 * could have answered.
 */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;

  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
