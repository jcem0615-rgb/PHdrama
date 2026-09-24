import { Coins, Crown, Receipt, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { copy } from '@/lib/copy';
import { formatCoins, formatDateTime, formatPhp, formatRemaining } from '@/lib/format';
import {
  getViewer,
  isDemoMode,
  listCoinLedger,
  listMyPayments,
  listUnlockedEpisodes,
} from '@/server/repository';

export const metadata: Metadata = { title: copy.me.title };
export const dynamic = 'force-dynamic';

const STATUS_STYLE = {
  pending: 'bg-coin-500/15 text-coin-500',
  approved: 'bg-jade-500/15 text-jade-500',
  rejected: 'bg-flame-500/15 text-flame-400',
} as const;

export default async function MePage() {
  const [viewer, payments, unlocked, ledger] = await Promise.all([
    getViewer(),
    listMyPayments(),
    listUnlockedEpisodes(),
    listCoinLedger(),
  ]);

  if (!viewer) {
    return (
      <main className="mx-auto max-w-md px-4 pb-28 pt-24 text-center">
        <p className="text-sm text-ink-400">{copy.unlock.signInFirst}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-20">
      <h1 className="text-2xl font-black">{copy.me.title}</h1>
      <p className="mt-1 text-sm text-ink-400">
        {viewer.displayName}
        {isDemoMode() && ' · demo session'}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">{copy.me.balance}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xl font-black text-coin-500">
            <Coins className="h-5 w-5" />
            {formatCoins(viewer.coinBalance)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">{copy.me.vipStatus}</p>
          <p
            className={`mt-1.5 flex items-center gap-1.5 text-sm font-bold ${
              viewer.isVip ? 'text-vip-500' : 'text-ink-400'
            }`}
          >
            <Crown className="h-4 w-4" />
            {viewer.isVip ? formatRemaining(viewer.vipExpiresAt) : copy.me.notVip}
          </p>
        </div>
      </div>

      <Section icon={<Ticket className="h-4 w-4" />} title={copy.me.unlocked}>
        {unlocked.length === 0 ? (
          <Empty>{copy.me.noUnlocks}</Empty>
        ) : (
          <ul className="space-y-2">
            {unlocked.map((episode) => (
              <li key={episode.id}>
                <Link
                  href={`/watch/${episode.id}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{episode.seriesTitle}</span>
                    <span className="block text-[10px] text-ink-400">
                      {copy.player.episodeLabel(episode.episodeNumber)}
                    </span>
                  </span>
                  <span className="text-[10px] text-ink-400">Watch</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Receipt className="h-4 w-4" />} title={copy.me.payments}>
        {payments.length === 0 ? (
          <Empty>{copy.me.noPayments}</Empty>
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{payment.itemName}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {payment.methodLabel} · {copy.admin.reference} {payment.referenceNumber}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{formatDateTime(payment.createdAt)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold">{formatPhp(payment.amountPhp)}</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[payment.status]}`}
                    >
                      {copy.status[payment.status]}
                    </span>
                  </div>
                </div>
                {payment.adminNote && (
                  <p className="mt-2 border-t border-white/5 pt-2 text-[10px] text-ink-400">
                    {payment.adminNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<Coins className="h-4 w-4" />} title={copy.me.ledger}>
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.03]">
          {ledger.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-xs">{entry.reason.replace(/_/g, ' ')}</span>
                <span className="block text-[10px] text-ink-400">{formatDateTime(entry.createdAt)}</span>
              </span>
              <span
                className={`text-xs font-bold ${entry.delta >= 0 ? 'text-jade-500' : 'text-ink-200'}`}
              >
                {entry.delta >= 0 ? '+' : ''}
                {formatCoins(entry.delta)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <span className="text-ink-400">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-ink-400">
      {children}
    </p>
  );
}
