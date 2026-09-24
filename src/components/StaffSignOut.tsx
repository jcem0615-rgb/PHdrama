'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { copy } from '@/lib/copy';

export default function StaffSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => null);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-label={copy.auth.signOut}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
    >
      <LogOut className="h-3.5 w-3.5" />
      {copy.admin.signOut}
    </button>
  );
}
