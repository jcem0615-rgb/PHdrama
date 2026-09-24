import { ShieldCheck } from 'lucide-react';

import StaffSignOut from '@/components/StaffSignOut';
import { copy } from '@/lib/copy';
import type { Staff } from '@/lib/types';

/**
 * Chrome for the staff portal. Cooler palette and a denser layout than the
 * customer app on purpose — a glance should tell you which surface you are on.
 */
export default function StaffShell({ staff, children }: { staff: Staff; children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-sky-400" />
            <span className="text-sm">{copy.admin.portalName}</span>
          </span>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              <span className="hidden sm:inline">{copy.admin.signedInAs} </span>
              <span className="text-slate-200">{staff.displayName}</span>
              <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                {staff.role}
              </span>
            </span>
            <StaffSignOut />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6">{children}</main>
    </>
  );
}
