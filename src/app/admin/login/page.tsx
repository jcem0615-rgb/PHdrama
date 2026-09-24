import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import StaffLoginForm from '@/components/StaffLoginForm';
import { copy } from '@/lib/copy';
import { isDemoMode } from '@/server/repository';
import { getStaff } from '@/server/staff';

export const metadata: Metadata = { title: copy.admin.signIn };
export const dynamic = 'force-dynamic';

export default async function StaffLoginPage() {
  if (await getStaff()) redirect('/admin');

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold">{copy.admin.portalName}</h1>
            <p className="text-xs text-slate-400">{copy.admin.signIn}</p>
          </div>
        </div>

        <StaffLoginForm demo={isDemoMode()} />

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">{copy.admin.signInHint}</p>
      </div>
    </main>
  );
}
