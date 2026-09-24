import 'server-only';

import { cookies } from 'next/headers';

import {
  DEMO_COIN_PACKAGES,
  DEMO_PAYMENT_METHODS,
  DEMO_SERIES,
  DEMO_VIP_PLANS,
  demoEpisode,
} from '@/lib/demo/catalog';
import { PERSIST_COOKIE, PERSIST_MAX_AGE, persistenceOptions } from '@/lib/session-persistence';
import type {
  CoinLedgerEntry,
  Payment,
  PaymentKind,
  PaymentStatus,
  Staff,
  Viewer,
} from '@/lib/types';

import { seal, unsign } from './signed-cookie';

/**
 * Demo-mode viewer state.
 *
 * Lives in one signed, httpOnly cookie so the deployed preview is clickable
 * with no database attached — and so that, as in live mode, only server code
 * ever changes a balance. It is deliberately small: cookies cap at ~4 KB, so
 * unlocks are stored as `seriesIndex.episodeNumber` and the history is capped.
 *
 * This module is never reached when Supabase is configured.
 */

const COOKIE = 'phd_demo';
const STAFF_COOKIE = 'phd_staff';
const VERSION = 3;
const MAX_UNLOCKS = 120;
const MAX_PAYMENTS = 10;
const MAX_LEDGER = 12;

const STARTING_COINS = 50;

export interface DemoPayment {
  id: string;
  kind: PaymentKind;
  itemId: string;
  methodId: string;
  reference: string;
  status: PaymentStatus;
  createdAt: number;
  reviewedAt: number | null;
  receiptName: string | null;
  note: string | null;
}

export interface DemoAccount {
  email: string;
  displayName: string;
}

export interface DemoState {
  /**
   * Who these balances belong to. Survives sign-out, so signing back in with
   * the same address picks up where you left off and a different address
   * starts clean.
   */
  account: DemoAccount | null;
  /** False means signed out. Free episodes still play; nothing else does. */
  signedIn: boolean;
  coins: number;
  vipExpiresAt: number | null;
  unlocks: string[];
  payments: DemoPayment[];
  ledger: Array<{ delta: number; balanceAfter: number; reason: string; at: number }>;
}

type Wire = {
  v: number;
  a: [string, string] | null;
  i: 0 | 1;
  c: number;
  x: number | null;
  u: string[];
  p: Array<[string, PaymentKind, string, string, string, PaymentStatus, number, number | null, string | null, string | null]>;
  l: Array<[number, number, string, number]>;
};

// ---------------------------------------------------------------------------
// encoding
// ---------------------------------------------------------------------------

const SERIES_INDEX = new Map(DEMO_SERIES.map((s, i) => [s.slug, i]));
const SERIES_BY_INDEX = DEMO_SERIES.map((s) => s.slug);

function packEpisodeId(episodeId: string): string | null {
  const episode = demoEpisode(episodeId);
  if (!episode) return null;
  const idx = SERIES_INDEX.get(episode.seriesSlug);
  if (idx === undefined) return null;
  return `${idx}.${episode.episodeNumber}`;
}

function unpackEpisodeId(packed: string): string | null {
  const [idxRaw, numRaw] = packed.split('.');
  const slug = SERIES_BY_INDEX[Number(idxRaw)];
  const n = Number(numRaw);
  if (!slug || !Number.isFinite(n)) return null;
  return `${slug}-${String(n).padStart(2, '0')}`;
}

function encode(state: DemoState): string {
  const wire: Wire = {
    v: VERSION,
    a: state.account ? [state.account.email, state.account.displayName] : null,
    i: state.signedIn ? 1 : 0,
    c: state.coins,
    x: state.vipExpiresAt,
    u: state.unlocks.slice(-MAX_UNLOCKS).map(packEpisodeId).filter((v): v is string => v !== null),
    p: state.payments
      .slice(0, MAX_PAYMENTS)
      .map((p) => [p.id, p.kind, p.itemId, p.methodId, p.reference, p.status, p.createdAt, p.reviewedAt, p.receiptName, p.note]),
    l: state.ledger.slice(0, MAX_LEDGER).map((e) => [e.delta, e.balanceAfter, e.reason, e.at]),
  };
  return seal(Buffer.from(JSON.stringify(wire)).toString('base64url'));
}

function decode(raw: string | undefined): DemoState | null {
  const payload = unsign(raw);
  if (!payload) return null;

  try {
    const wire = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Wire;
    if (wire.v !== VERSION) return null;
    return {
      account: wire.a ? { email: wire.a[0], displayName: wire.a[1] } : null,
      signedIn: wire.i === 1,
      coins: wire.c,
      vipExpiresAt: wire.x,
      unlocks: wire.u.map(unpackEpisodeId).filter((v): v is string => v !== null),
      payments: wire.p.map(([id, kind, itemId, methodId, reference, status, createdAt, reviewedAt, receiptName, note]) => ({
        id,
        kind,
        itemId,
        methodId,
        reference,
        status,
        createdAt,
        reviewedAt,
        receiptName,
        note,
      })),
      ledger: wire.l.map(([delta, balanceAfter, reason, at]) => ({ delta, balanceAfter, reason, at })),
    };
  } catch {
    return null;
  }
}

export function freshDemoState(account: DemoAccount | null = null): DemoState {
  return {
    account,
    signedIn: account !== null,
    coins: STARTING_COINS,
    vipExpiresAt: null,
    unlocks: [],
    payments: [],
    ledger: [{ delta: STARTING_COINS, balanceAfter: STARTING_COINS, reason: 'welcome_bonus', at: Date.now() }],
  };
}

export async function readDemoState(): Promise<DemoState> {
  const jar = await cookies();
  return decode(jar.get(COOKIE)?.value) ?? freshDemoState();
}

/** Only callable from a route handler or server action. */
export async function writeDemoState(state: DemoState): Promise<void> {
  const jar = await cookies();
  const remember = jar.get(PERSIST_COOKIE)?.value === '1';

  jar.set(
    COOKIE,
    encode(state),
    persistenceOptions(
      {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
      remember,
    ),
  );
}

/** Records the "remember me" choice for whichever backend is in play. */
export async function writePersistence(remember: boolean): Promise<void> {
  const jar = await cookies();
  if (!remember) {
    jar.delete(PERSIST_COOKIE);
    return;
  }
  jar.set(PERSIST_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PERSIST_MAX_AGE,
  });
}

export async function clearDemoState(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// ---------------------------------------------------------------------------
// projections
// ---------------------------------------------------------------------------

/** Null when signed out — the same answer live mode gives for an anonymous visitor. */
export function demoViewer(state: DemoState): Viewer | null {
  if (!state.signedIn || !state.account) return null;

  const isVip = Boolean(state.vipExpiresAt && state.vipExpiresAt > Date.now());
  return {
    id: 'demo-viewer',
    displayName: state.account.displayName,
    // A demo viewer is always an ordinary customer. Staff access is a separate
    // session on a separate cookie — see the staff helpers at the bottom.
    role: 'user',
    coinBalance: state.coins,
    vipExpiresAt: state.vipExpiresAt ? new Date(state.vipExpiresAt).toISOString() : null,
    isVip,
    unlockedEpisodeIds: state.unlocks,
  };
}

function itemNameFor(kind: PaymentKind, itemId: string): string {
  if (kind === 'coins') {
    const pkg = DEMO_COIN_PACKAGES.find((p) => p.id === itemId);
    return pkg ? `${pkg.name} — ${pkg.coins + pkg.bonusCoins} coins` : 'Coin package';
  }
  const plan = DEMO_VIP_PLANS.find((p) => p.id === itemId);
  return plan ? plan.name : 'VIP';
}

export function demoAmountFor(kind: PaymentKind, itemId: string): number | null {
  if (kind === 'coins') return DEMO_COIN_PACKAGES.find((p) => p.id === itemId)?.pricePhp ?? null;
  return DEMO_VIP_PLANS.find((p) => p.id === itemId)?.pricePhp ?? null;
}

export function demoPayments(state: DemoState): Payment[] {
  return state.payments.map((p) => ({
    id: p.id,
    userId: 'demo-viewer',
    userName: state.account?.displayName ?? 'Demo Viewer',
    kind: p.kind,
    itemName: itemNameFor(p.kind, p.itemId),
    amountPhp: demoAmountFor(p.kind, p.itemId) ?? 0,
    methodLabel: DEMO_PAYMENT_METHODS.find((m) => m.id === p.methodId)?.label ?? p.methodId,
    referenceNumber: p.reference,
    receiptName: p.receiptName,
    status: p.status,
    adminNote: p.note,
    createdAt: new Date(p.createdAt).toISOString(),
    reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toISOString() : null,
  }));
}

export function demoLedger(state: DemoState): CoinLedgerEntry[] {
  return state.ledger.map((e, i) => ({
    id: `l${i}`,
    delta: e.delta,
    balanceAfter: e.balanceAfter,
    reason: e.reason,
    createdAt: new Date(e.at).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// mutations — the demo mirror of the SECURITY DEFINER functions
// ---------------------------------------------------------------------------

export function applyLedger(state: DemoState, delta: number, reason: string): void {
  state.coins += delta;
  state.ledger.unshift({ delta, balanceAfter: state.coins, reason, at: Date.now() });
  state.ledger = state.ledger.slice(0, MAX_LEDGER);
}

export function demoApprove(state: DemoState, paymentId: string, note: string | null): boolean {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'pending') return false;

  if (payment.kind === 'coins') {
    const pkg = DEMO_COIN_PACKAGES.find((p) => p.id === payment.itemId);
    if (pkg) applyLedger(state, pkg.coins + pkg.bonusCoins, 'payment_approved');
  } else {
    const plan = DEMO_VIP_PLANS.find((p) => p.id === payment.itemId);
    if (plan) {
      // VIP stacking: extend from the current expiry when still active.
      const base = Math.max(state.vipExpiresAt ?? 0, Date.now());
      state.vipExpiresAt = base + plan.days * 86_400_000;
    }
  }

  payment.status = 'approved';
  payment.note = note;
  payment.reviewedAt = Date.now();
  return true;
}

export function demoReject(state: DemoState, paymentId: string, note: string | null): boolean {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment || payment.status !== 'pending') return false;
  payment.status = 'rejected';
  payment.note = note;
  payment.reviewedAt = Date.now();
  return true;
}

export function demoAddPayment(state: DemoState, payment: DemoPayment): void {
  state.payments.unshift(payment);
  state.payments = state.payments.slice(0, MAX_PAYMENTS);
}

export function demoHasReference(state: DemoState, methodId: string, reference: string): boolean {
  const norm = reference.trim().toLowerCase();
  return state.payments.some(
    (p) => p.methodId === methodId && p.reference.trim().toLowerCase() === norm,
  );
}

export function demoAddUnlock(state: DemoState, episodeId: string): void {
  if (state.unlocks.includes(episodeId)) return;
  state.unlocks.push(episodeId);
  state.unlocks = state.unlocks.slice(-MAX_UNLOCKS);
}

// ---------------------------------------------------------------------------
// staff session (demo mode only)
//
// Deliberately a different cookie from the viewer state: signing into the staff
// portal must not change who the customer app thinks you are, and the customer
// app must never be able to see that a staff portal exists.
// ---------------------------------------------------------------------------

const DEMO_STAFF: Staff = {
  id: 'demo-staff',
  displayName: 'Demo SuperAdmin',
  role: 'superadmin',
};

export function demoAdminPasscode(): string {
  return process.env.DEMO_ADMIN_PASSCODE ?? 'phdrama';
}

export async function readDemoStaff(): Promise<Staff | null> {
  const jar = await cookies();
  return unsign(jar.get(STAFF_COOKIE)?.value) === 'superadmin' ? DEMO_STAFF : null;
}

export async function writeDemoStaff(): Promise<void> {
  const jar = await cookies();
  const remember = jar.get(PERSIST_COOKIE)?.value === '1';

  jar.set(
    STAFF_COOKIE,
    seal('superadmin'),
    persistenceOptions(
      {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        // A staff session is short even when remembered.
        maxAge: 60 * 60 * 8,
      },
      remember,
    ),
  );
}

export async function clearDemoStaff(): Promise<void> {
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
}

// ---------------------------------------------------------------------------
// demo accounts
//
// One browser, one account. Signing out keeps the coins and unlocks in the
// cookie so signing back in with the same address picks up where you left off;
// a different address starts fresh.
// ---------------------------------------------------------------------------

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Viewer';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 40) || 'Viewer';
}

export function demoSignIn(state: DemoState, email: string, displayName?: string): DemoState {
  const normalised = email.trim().toLowerCase();
  const returning = state.account?.email === normalised;

  const account: DemoAccount = {
    email: normalised,
    displayName:
      displayName?.trim() ||
      (returning ? state.account?.displayName : undefined) ||
      nameFromEmail(normalised),
  };

  return returning ? { ...state, account, signedIn: true } : freshDemoState(account);
}

export function demoSignOut(state: DemoState): DemoState {
  return { ...state, signedIn: false };
}
