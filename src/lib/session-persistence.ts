/**
 * "Remember me".
 *
 * Checked  → the session cookie carries a 30-day lifetime.
 * Unchecked → the lifetime is stripped, so the cookie dies with the browser.
 *
 * The choice is stored in its own small cookie because Supabase re-writes its
 * session cookies on every refresh; we have to re-apply the decision each time
 * rather than set it once at sign-in.
 */
export const PERSIST_COOKIE = 'phd_persist';
export const PERSIST_MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionCookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
  secure?: boolean;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  priority?: 'low' | 'medium' | 'high';
}

export function persistenceOptions<T extends SessionCookieOptions>(options: T, remember: boolean): T {
  if (remember) return { ...options, maxAge: options.maxAge ?? PERSIST_MAX_AGE };

  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}
