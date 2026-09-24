import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AdminQueue from '@/components/AdminQueue';
import StaffShell from '@/components/StaffShell';
import { copy } from '@/lib/copy';
import { formatCoins, formatDateTime, formatPhp } from '@/lib/format';
import { listAllPayments, listCoinLedger } from '@/server/repository';
import { getStaff } from '@/server/staff';

export const metadata: Metadata = { title: copy.admin.title };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');

  const [payments, ledger] = await Promise.all([listAllPayments(), listCoinLedger()]);

  const pending = payments.filter((p) => p.status === 'pending');
  const approved = payments.filter((p) => p.status === 'approved');
  const revenue = approved.reduce((sum, p) => sum + p.amountPhp, 0);

  return (
    <StaffShell staff={staff}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={copy.admin.pending} value={String(pending.length)} tone="text-amber-400" />
        <Stat label={copy.admin.approved} value={String(approved.length)} tone="text-emerald-400" />
        <Stat label={copy.admin.revenue} value={formatPhp(revenue)} tone="text-slate-100" />
      </div>

      <AdminQueue payments={payments} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">{copy.admin.activity}</h2>
        {ledger.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
            {copy.admin.emptyActivity}
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-xs">{entry.reason.replace(/_/g, ' ')}</span>
                  <span className="block text-[10px] text-slate-500">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </span>
                <span
                  className={`text-xs font-semibold ${
                    entry.delta >= 0 ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                >
                  {entry.delta >= 0 ? '+' : ''}
                  {formatCoins(entry.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/"
        className="mt-10 inline-block text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
      >
        {copy.admin.backToApp}
      </Link>
    </StaffShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}
