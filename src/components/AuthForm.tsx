'use client';

import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Checkbox from '@/components/form/Checkbox';
import Field from '@/components/form/Field';
import { copy } from '@/lib/copy';
import type { ApiResponse } from '@/lib/types';
import { MIN_PASSWORD_LENGTH } from '@/lib/validate';

type Mode = 'sign-in' | 'sign-up';

interface Props {
  mode: Mode;
  demo: boolean;
  /** Where to land after success. Comes from ?next= on the page. */
  next: string;
}

export default function AuthForm({ mode, demo, next }: Props) {
  const router = useRouter();
  const isSignUp = mode === 'sign-up';

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(isSignUp ? '/api/auth/register' : '/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isSignUp ? { displayName, email, password, remember } : { email, password, remember },
        ),
      });
      const body = (await res.json()) as ApiResponse<{ confirmationRequired?: boolean }>;

      if (!body.ok) {
        setError(body.error.message);
        return;
      }

      if (body.data.confirmationRequired) {
        setConfirmEmail(true);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError(copy.errors.INTERNAL);
    } finally {
      setBusy(false);
    }
  }

  if (confirmEmail) {
    return (
      <div className="rounded-2xl border border-jade-500/30 bg-jade-500/10 p-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-jade-500/20 text-jade-500">
          <MailCheck className="h-6 w-6" />
        </span>
        <p className="text-sm text-jade-500">{copy.auth.checkEmail}</p>
        <p className="mt-2 text-xs text-ink-400">{email}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {isSignUp && (
        <Field
          label={copy.auth.name}
          placeholder={copy.auth.namePlaceholder}
          value={displayName}
          onChange={setDisplayName}
          autoComplete="name"
          autoFocus
        />
      )}

      <Field
        label={copy.auth.email}
        type="email"
        placeholder={copy.auth.emailPlaceholder}
        value={email}
        onChange={setEmail}
        autoComplete="email"
        autoFocus={!isSignUp}
      />

      <Field
        label={copy.auth.password}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        hint={isSignUp ? copy.auth.passwordHint : undefined}
      />

      <Checkbox
        label={copy.auth.rememberMe}
        hint={copy.auth.rememberHint}
        checked={remember}
        onChange={setRemember}
      />

      {error && (
        <p className="rounded-xl bg-flame-500/10 px-4 py-3 text-xs text-flame-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy || !email || password.length < (isSignUp ? MIN_PASSWORD_LENGTH : 1)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-flame-500 to-ember-500 py-4 text-sm font-bold disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy
          ? isSignUp
            ? copy.auth.signingUp
            : copy.auth.signingIn
          : isSignUp
            ? copy.auth.signUp
            : copy.auth.signIn}
      </button>

      <p className="text-center text-xs text-ink-400">
        {isSignUp ? copy.auth.haveAccount : copy.auth.noAccount}{' '}
        <Link
          href={`${isSignUp ? '/auth/sign-in' : '/auth/sign-up'}?next=${encodeURIComponent(next)}`}
          className="font-semibold text-flame-400"
        >
          {isSignUp ? copy.auth.switchToSignIn : copy.auth.switchToSignUp}
        </Link>
      </p>

      {demo && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] leading-relaxed text-ink-400">
          {copy.auth.demoNote}
        </p>
      )}
    </form>
  );
}
