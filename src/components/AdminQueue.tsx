'use client';

import { Check, FileImage, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';
import { formatDateTime, formatPhp } from '@/lib/format';
import type { ApiResponse, Payment, PaymentStatus } from '@/lib/types';

const TABS: { key: PaymentStatus; label: string }[] = [
  { key: 'pending', label: copy.admin.pending },
  { key: 'approved', label: copy.admin.approved },
  { key: 'rejected', label: copy.admin.rejected },
];

const STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-rose-500/15 text-rose-300',
};

/**
 * The review queue. Approving calls `approve_payment`, which credits coins or
 * extends VIP inside one transaction and writes the ledger row. This component
 * never touches a balance itself.
 */
export default function AdminQueue({ payments }: { payments: Payment[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<PaymentStatus>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const visible = payments.filter((p) => p.status === tab);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: notes[id] ?? '' }),
      });
      const body = (await res.json()) as ApiResponse<unknown>;
      if (!body.ok) {
        setError(body.error.message);
        return;
      }
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">{copy.admin.queue}</h2>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-slate-800 text-slate-100' : 'bg-slate-900 text-slate-400'
            }`}
          >
            {t.label} ({payments.filter((p) => p.status === t.key).length})
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-xl bg-rose-500/10 px-4 py-3 text-xs text-rose-300">{error}</p>}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
          {copy.admin.emptyQueue}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((payment) => (
            <li key={payment.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{payment.itemName}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{payment.userName}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {payment.methodLabel} · {copy.admin.reference}{' '}
                    <span className="font-mono text-slate-200">{payment.referenceNumber}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">{formatDateTime(payment.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black">{formatPhp(payment.amountPhp)}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[payment.status]}`}
                  >
                    {copy.status[payment.status]}
                  </span>
                </div>
              </div>

              {payment.receiptName && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-3 py-2 text-[10px] text-slate-400">
                  <FileImage className="h-3.5 w-3.5" />
                  <span className="truncate">{payment.receiptName}</span>
                </p>
              )}

              {payment.status === 'pending' && (
                <>
                  <input
                    value={notes[payment.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [payment.id]: e.target.value }))}
                    placeholder={copy.admin.note}
                    className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500"
                  />

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === payment.id}
                      onClick={() => review(payment.id, 'approve')}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {busyId === payment.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {copy.admin.approve}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === payment.id}
                      onClick={() => review(payment.id, 'reject')}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {copy.admin.reject}
                    </button>
                  </div>
                </>
              )}

              {payment.adminNote && payment.status !== 'pending' && (
                <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                  {payment.adminNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
