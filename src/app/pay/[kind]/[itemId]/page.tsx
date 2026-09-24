import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import PaymentForm from '@/components/PaymentForm';
import { copy } from '@/lib/copy';
import { getViewer, listCoinPackages, listPaymentMethods, listVipPlans } from '@/server/repository';

export const metadata: Metadata = { title: copy.pay.title };
export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: PageProps<'/pay/[kind]/[itemId]'>) {
  const { kind, itemId } = await params;
  if (kind !== 'coins' && kind !== 'vip') notFound();

  // Nothing to credit without an account, so ask before taking a receipt.
  if (!(await getViewer())) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/pay/${kind}/${itemId}`)}`);
  }

  const [packages, plans, methods] = await Promise.all([
    listCoinPackages(),
    listVipPlans(),
    listPaymentMethods(),
  ]);

  const pkg = kind === 'coins' ? packages.find((p) => p.id === itemId) : undefined;
  const plan = kind === 'vip' ? plans.find((p) => p.id === itemId) : undefined;
  if (!pkg && !plan) notFound();

  const amount = pkg?.pricePhp ?? plan?.pricePhp ?? 0;
  const label = pkg
    ? `${pkg.name} — ${pkg.coins + pkg.bonusCoins} coins`
    : `${plan?.name} — ${plan?.days} days`;

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-20">
      <Link href="/coins" className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-400">
        <ArrowLeft className="h-3.5 w-3.5" />
        {copy.coins.title}
      </Link>

      <h1 className="text-2xl font-black">{copy.pay.title}</h1>

      <PaymentForm kind={kind} itemId={itemId} itemLabel={label} amountPhp={amount} methods={methods} />
    </main>
  );
}
