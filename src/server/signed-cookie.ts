import 'server-only';

import crypto from 'node:crypto';

/**
 * HMAC helpers shared by the cookies this app signs itself (the demo viewer
 * state and the demo staff session). Live-mode auth is Supabase's own session
 * cookie and never comes through here.
 */

function secret(): string {
  return process.env.DEMO_SESSION_SECRET ?? 'ph-drama-demo-unsigned';
}

const MAC_LENGTH = 22;

export function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, MAC_LENGTH);
}

/** Returns the payload when the signature holds, otherwise null. */
export function unsign(raw: string | undefined): string | null {
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;

  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(payload);

  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

  return payload;
}

export function seal(payload: string): string {
  return `${payload}.${sign(payload)}`;
}
