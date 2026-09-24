import { Check, Coins, Crown, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { copy } from '@/lib/copy';
import { formatCoins, formatPhp, formatRemaining } from '@/lib/format';
import { getViewer, listCoinPackages, listVipPlans } from '@/server/repository';

export const metadata: Metadata = { title: copy.coins.title };
export const dynamic = 'force-dynamic';

export default async function CoinsPage() {
  const [packages, plans, viewer] = await Promise.all([
    listCoinPackages(),
    listVipPlans(),
    getViewer(),
  ]);

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-20">
      <h1 className="text-2xl font-black">{copy.coins.title}</h1>
      <p className="mt-1.5 text-sm text-ink-400">{copy.coins.subtitle}</p>

      <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <span className="text-xs text-ink-400">{copy.me.balance}</span>
        <span className="flex items-center gap-1.5 text-lg font-bold text-coin-500">
          <Coins className="h-5 w-5" />
          {formatCoins(viewer?.coinBalance ?? 0)}
        </span>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold">{copy.coins.packages}</h2>
      <ul className="grid grid-cols-2 gap-3">
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <Link
              href={`/pay/coins/${pkg.id}`}
              className={`relative flex h-full flex-col justify-between rounded-2xl border p-4 transition-colors ${
                pkg.isPopular
                  ? 'border-coin-500/40 bg-coin-500/[0.07]'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              {pkg.isPopular && (
                <span className="absolute -top-2 left-4 rounded-full bg-coin-500 px-2 py-0.5 text-[9px] font-black text-ink-950">
                  {copy.coins.popular}
                </span>
              )}
              <div>
                <p className="text-[11px] font-medium text-ink-400">{pkg.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xl font-black text-coin-500">
                  <Coins className="h-4 w-4" />
                  {formatCoins(pkg.coins)}
                </p>
                {pkg.bonusCoins > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-jade-500">
                    <Sparkles className="h-3 w-3" />
                    {copy.coins.bonus(pkg.bonusCoins)}
                  </p>
                )}
              </div>
              <p className="mt-4 text-sm font-bold">{formatPhp(pkg.pricePhp)}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section id="vip" className="mt-10 scroll-mt-20">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Crown className="h-4 w-4 text-vip-500" />
          {copy.coins.vipTitle}
        </h2>

        {viewer?.isVip && (
          <p className="mb-3 rounded-xl bg-vip-500/10 px-4 py-3 text-xs font-semibold text-vip-500">
            {copy.coins.vipActive} — {formatRemaining(viewer.vipExpiresAt)}
          </p>
        )}

        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/pay/vip/${plan.id}`}
                className="flex items-center justify-between rounded-2xl border border-vip-500/25 bg-gradient-to-r from-vip-500/12 to-transparent p-4"
              >
                <div>
                  <p className="text-sm font-bold">{plan.name}</p>
                  <ul className="mt-2 space-y-1">
                    {[copy.coins.vipPerk1, copy.coins.vipPerk2, copy.coins.vipPerk3].map((perk) => (
                      <li key={perk} className="flex items-center gap-1.5 text-[11px] text-ink-200">
                        <Check className="h-3 w-3 text-vip-500" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-vip-500">{formatPhp(plan.pricePhp)}</p>
                  <p className="text-[10px] text-ink-400">/ {plan.days} days</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
