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
  pending: 'bg-coin-500/15 text-coin-500',
  approved: 'bg-jade-500/15 text-jade-500',
  rejected: 'bg-flame-500/15 text-flame-400',
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
      <h2 className="mb-3 text-sm font-bold">{copy.admin.queue}</h2>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-white/15 text-white' : 'bg-white/5 text-ink-400'
            }`}
          >
            {t.label} ({payments.filter((p) => p.status === t.key).length})
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-xl bg-flame-500/10 px-4 py-3 text-xs text-flame-400">{error}</p>}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-ink-400">
          {copy.admin.emptyQueue}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((payment) => (
            <li key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{payment.itemName}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">{payment.userName}</p>
                  <p className="mt-1 text-[10px] text-ink-400">
                    {payment.methodLabel} · {copy.admin.reference}{' '}
                    <span className="font-mono text-ink-200">{payment.referenceNumber}</span>
                  </p>
                  <p className="text-[10px] text-ink-400">{formatDateTime(payment.createdAt)}</p>
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
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-2 text-[10px] text-ink-400">
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
                    className="mt-3 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 text-xs outline-none placeholder:text-ink-600 focus:border-flame-500/60"
                  />

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === payment.id}
                      onClick={() => review(payment.id, 'approve')}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-jade-500/20 py-2.5 text-xs font-bold text-jade-500 disabled:opacity-50"
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
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-flame-500/15 py-2.5 text-xs font-bold text-flame-400 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {copy.admin.reject}
                    </button>
                  </div>
                </>
              )}

              {payment.adminNote && payment.status !== 'pending' && (
                <p className="mt-2 border-t border-white/5 pt-2 text-[10px] text-ink-400">
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
