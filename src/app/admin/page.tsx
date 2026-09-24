import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import AdminQueue from '@/components/AdminQueue';
import { copy } from '@/lib/copy';
import { formatPhp } from '@/lib/format';
import { getViewer, isDemoMode, listAllPayments } from '@/server/repository';

export const metadata: Metadata = { title: copy.admin.title };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const viewer = await getViewer();
  const isAdmin = viewer?.role === 'admin' || viewer?.role === 'superadmin';

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md px-4 pb-28 pt-24 text-center">
        <p className="text-sm text-ink-400">{copy.errors.FORBIDDEN}</p>
      </main>
    );
  }

  const payments = await listAllPayments();
  const pending = payments.filter((p) => p.status === 'pending');
  const approved = payments.filter((p) => p.status === 'approved');
  const revenue = approved.reduce((sum, p) => sum + p.amountPhp, 0);

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-20">
      <h1 className="flex items-center gap-2 text-2xl font-black">
        <ShieldCheck className="h-6 w-6 text-flame-400" />
        {copy.admin.title}
      </h1>
      {isDemoMode() && <p className="mt-1.5 text-xs text-ink-400">{copy.demo.adminHint}</p>}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label={copy.admin.pending} value={String(pending.length)} tone="text-coin-500" />
        <Stat label={copy.admin.approved} value={String(approved.length)} tone="text-jade-500" />
        <Stat label="Revenue" value={formatPhp(revenue)} tone="text-white" />
      </div>

      <AdminQueue payments={payments} />
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[9px] uppercase tracking-wider text-ink-400">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${tone}`}>{value}</p>
    </div>
  );
}
