'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';
import type { ApiResponse } from '@/lib/types';

/**
 * Demo mode signs in with a passcode; live mode with the staff member's
 * Supabase credentials. Either way the server checks the role before it hands
 * back a session, so a customer account gets nowhere here.
 */
export default function StaffLoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(demo ? { passcode } : { email, password }),
      });
      const body = (await res.json()) as ApiResponse<unknown>;

      if (!body.ok) {
        setError(body.error.message);
        return;
      }

      router.replace('/admin');
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {demo ? (
        <Field
          label={copy.admin.passcode}
          type="password"
          value={passcode}
          onChange={setPasscode}
          autoComplete="off"
        />
      ) : (
        <>
          <Field
            label={copy.admin.email}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
          />
          <Field
            label={copy.admin.password}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? copy.admin.signingIn : copy.admin.signInAction}
      </button>

      {demo && <p className="text-[11px] leading-relaxed text-slate-500">{copy.admin.passcodeHint}</p>}
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-300">
      {label}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500"
      />
    </label>
  );
}
