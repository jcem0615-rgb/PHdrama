/**
 * Live mode is "all three keys present". Anything less and the app runs the
 * demo backend — which is what the Vercel preview does.
 *
 * NEXT_PUBLIC_* are read as direct property accesses so Next can inline them
 * into the client bundle.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when the browser has enough to talk to Supabase. */
export function hasPublicSupabaseEnv(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** True when the server can also act with the service role. */
export function isLiveMode(): boolean {
  return hasPublicSupabaseEnv() && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0;
}

export const REWARDED_ADS_ENABLED = process.env.NEXT_PUBLIC_FLAG_REWARDED_ADS === 'true';
