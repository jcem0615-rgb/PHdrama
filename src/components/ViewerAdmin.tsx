'use client';

import { Coins, Crown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Field from '@/components/form/Field';
import { copy } from '@/lib/copy';
import { formatCoins, formatRemaining } from '@/lib/format';
import type { ApiResponse, Customer } from '@/lib/types';

/**
 * Manual coin and VIP adjustment.
 *
 * Every submit goes to admin_adjust_coins / admin_set_vip, which write the
 * ledger row inside the same transaction. The reason box is required because
 * that string is the audit trail.
 */
export default function ViewerAdmin({ customers, canAdjust }: { customers: Customer[]; canAdjust: boolean }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">{copy.admin.viewers}</h2>

      {!canAdjust && (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
          {copy.admin.superAdminOnly}
        </p>
      )}

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
          {copy.admin.viewersEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {customers.map((customer) => (
            <CustomerRow key={customer.id} customer={customer} canAdjust={canAdjust} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CustomerRow({ customer, canAdjust }: { customer: Customer; canAdjust: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<'coins' | 'vip' | null>(null);
  const [delta, setDelta] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function apply(action: 'coins' | 'vip', overrideDays?: number) {
    setBusy(true);
    setError(null);
    setDone(false);

    try {
      const res = await fetch(`/api/admin/viewers/${customer.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          action === 'coins'
            ? { action, delta: Number(delta), reason }
            : { action, days: overrideDays ?? Number(days), reason },
        ),
      });
      const body = (await res.json()) as ApiResponse<unknown>;

      if (!body.ok) {
        setError(body.error.message);
        return;
      }

      setDone(true);
      setDelta('');
      setDays('');
      setReason('');
      setOpen(null);
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{customer.displayName}</p>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">{customer.id}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1.5 text-sm font-bold text-amber-400">
            <Coins className="h-3.5 w-3.5" />
            {formatCoins(customer.coinBalance)}
          </p>
          <p
            className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
              customer.isVip ? 'text-violet-400' : 'text-slate-500'
            }`}
          >
            <Crown className="h-3 w-3" />
            {customer.isVip ? formatRemaining(customer.vipExpiresAt) : '—'}
          </p>
        </div>
      </div>

      {done && <p className="mt-3 text-[11px] text-emerald-400">{copy.admin.applied}</p>}
      {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}

      {canAdjust && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Tab active={open === 'coins'} onClick={() => setOpen(open === 'coins' ? null : 'coins')}>
            {copy.admin.adjustCoins}
          </Tab>
          <Tab active={open === 'vip'} onClick={() => setOpen(open === 'vip' ? null : 'vip')}>
            {copy.admin.setVip}
          </Tab>
        </div>
      )}

      {canAdjust && open && (
        <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
          {open === 'coins' ? (
            <Field
              label={copy.admin.coinDelta}
              hint={copy.admin.coinDeltaHint}
              value={delta}
              onChange={setDelta}
              tone="staff"
            />
          ) : (
            <Field
              label={copy.admin.vipDays}
              hint={copy.admin.vipDaysHint}
              value={days}
              onChange={setDays}
              tone="staff"
            />
          )}

          <Field label={copy.admin.reason} value={reason} onChange={setReason} tone="staff" />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => apply(open)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy ? copy.admin.applying : copy.admin.apply}
            </button>

            {open === 'vip' && customer.isVip && (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => apply('vip', 0)}
                className="rounded-lg bg-rose-500/15 px-4 py-2.5 text-xs font-semibold text-rose-300 disabled:opacity-50"
              >
                {copy.admin.revokeVip}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
        active ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/70 text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}
