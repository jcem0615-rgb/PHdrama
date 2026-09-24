'use client';

import { Check, Copy, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';
import { formatPhp } from '@/lib/format';
import type { ApiResponse, PaymentKind, PaymentMethod } from '@/lib/types';

interface Props {
  kind: PaymentKind;
  itemId: string;
  itemLabel: string;
  amountPhp: number;
  methods: PaymentMethod[];
}

/**
 * The manual payment flow: pay outside the app, then prove it.
 * Nothing is credited here — the row lands as `pending` for SuperAdmin review.
 */
export default function PaymentForm({ kind, itemId, itemLabel, amountPhp, methods }: Props) {
  const router = useRouter();
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const method = methods.find((m) => m.id === methodId);

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard permission denied — the value is on screen anyway.
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!reference.trim() || !receipt) {
      setError(copy.pay.missingFields);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.set('kind', kind);
      form.set('itemId', itemId);
      form.set('methodId', methodId);
      form.set('reference', reference.trim());
      form.set('receipt', receipt);

      const res = await fetch('/api/payments', { method: 'POST', body: form });
      const body = (await res.json()) as ApiResponse<unknown>;

      if (!body.ok) {
        setError(body.error.message);
        return;
      }

      setDone(true);
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-jade-500/30 bg-jade-500/10 p-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-jade-500/20 text-jade-500">
          <Check className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-jade-500">{copy.pay.submitted}</p>
        <button
          type="button"
          onClick={() => router.push('/me')}
          className="mt-5 w-full rounded-xl bg-white/10 py-3 text-sm font-semibold"
        >
          {copy.me.payments}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs text-ink-400">{itemLabel}</p>
        <p className="mt-1 text-2xl font-black text-gradient">{formatPhp(amountPhp)}</p>
        <p className="mt-1 text-[10px] text-ink-400">{copy.pay.amountDue}</p>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">
          1. {copy.pay.chooseMethod}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethodId(m.id)}
              className={`rounded-xl border px-2 py-3 text-xs font-semibold transition-colors ${
                m.id === methodId
                  ? 'border-flame-500/60 bg-flame-500/10 text-flame-400'
                  : 'border-white/10 bg-white/[0.03] text-ink-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {method && (
          <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <Row label={copy.pay.accountName} value={method.accountName} onCopy={copyValue} copied={copied} />
            <Row label={copy.pay.accountNumber} value={method.accountNumber} onCopy={copyValue} copied={copied} />
            <p className="pt-1 text-[11px] leading-relaxed text-ink-400">{method.instructions}</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">
          2. {copy.pay.step2}
        </h2>

        <label className="block text-xs font-medium text-ink-200">
          {copy.pay.referenceLabel}
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={copy.pay.referencePlaceholder}
            inputMode="numeric"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-sm outline-none placeholder:text-ink-600 focus:border-flame-500/60"
          />
        </label>
        <p className="mt-1.5 text-[10px] text-ink-400">{copy.pay.referenceHelp}</p>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-4">
          <Upload className="h-5 w-5 shrink-0 text-ink-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium">
              {receipt ? receipt.name : copy.pay.receiptLabel}
            </span>
            <span className="block text-[10px] text-ink-400">{copy.pay.receiptHelp}</span>
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
        </label>
      </section>

      {error && <p className="rounded-xl bg-flame-500/10 px-4 py-3 text-xs text-flame-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flame-500 to-ember-500 py-4 text-sm font-bold disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? copy.pay.submitting : copy.pay.submit}
      </button>

      <p className="text-center text-[10px] text-ink-400">3. {copy.pay.step3}</p>
    </form>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
  copied: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-ink-400">{label}</span>
      <button
        type="button"
        onClick={() => onCopy(value)}
        className="flex items-center gap-1.5 text-xs font-semibold"
      >
        {value}
        {copied === value ? (
          <Check className="h-3 w-3 text-jade-500" />
        ) : (
          <Copy className="h-3 w-3 text-ink-400" />
        )}
      </button>
    </div>
  );
}
