'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => null);
    router.replace('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-3.5 text-sm font-semibold text-ink-200 transition-colors hover:bg-white/[0.07] disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" />
      {busy ? copy.auth.signingOut : copy.auth.signOut}
    </button>
  );
}
