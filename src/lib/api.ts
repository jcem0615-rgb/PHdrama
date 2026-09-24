import { NextResponse } from 'next/server';

import { copy } from '@/lib/copy';
import type { ApiErrorCode, ApiResponse } from '@/lib/types';

/** Every route handler answers with this shape. See docs/ARCHITECTURE.md. */
export function ok<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data });
}

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  LOCKED: 403,
  NOT_FOUND: 404,
  INSUFFICIENT_COINS: 402,
  DUPLICATE_REFERENCE: 409,
  RATE_LIMITED: 429,
  FEATURE_DISABLED: 503,
  INVALID_INPUT: 422,
  ALREADY_REVIEWED: 409,
  INTERNAL: 500,
};

export function fail(code: ApiErrorCode, message?: string): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { ok: false, error: { code, message: message ?? copy.errors[code] } },
    { status: STATUS[code] },
  );
}

/** Maps a Postgres error raised by our SECURITY DEFINER functions onto a code. */
export function codeFromPostgres(message: string | undefined): ApiErrorCode {
  if (!message) return 'INTERNAL';
  const known: ApiErrorCode[] = [
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'LOCKED',
    'NOT_FOUND',
    'INSUFFICIENT_COINS',
    'RATE_LIMITED',
    'ALREADY_REVIEWED',
  ];
  const hit = known.find((c) => message.includes(c));
  if (hit) return hit;
  if (message.includes('payments_reference_unique')) return 'DUPLICATE_REFERENCE';
  return 'INTERNAL';
}
