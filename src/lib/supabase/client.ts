'use client';

import { createBrowserClient } from '@supabase/ssr';

import { SUPABASE_ANON_KEY, SUPABASE_URL, hasPublicSupabaseEnv } from './env';

/**
 * Browser client. Anon key only — RLS decides what comes back.
 * Returns null in demo mode so callers degrade instead of throwing.
 */
export function createClient() {
  if (!hasPublicSupabaseEnv()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
