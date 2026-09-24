import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { SUPABASE_ANON_KEY, SUPABASE_URL, hasPublicSupabaseEnv } from './env';

/**
 * Server client bound to the request's cookies. Anon key: every read still goes
 * through RLS as the signed-in user. Returns null in demo mode.
 */
export async function createServerSupabase() {
  if (!hasPublicSupabaseEnv()) return null;

  const jar = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            jar.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Session refresh happens in
          // route handlers and middleware, so this is safe to swallow.
        }
      },
    },
  });
}
