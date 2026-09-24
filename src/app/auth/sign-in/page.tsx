import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuthForm from '@/components/AuthForm';
import { copy } from '@/lib/copy';
import { getViewer, isDemoMode } from '@/server/repository';

export const metadata: Metadata = { title: copy.auth.signIn };
export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: PageProps<'/auth/sign-in'>) {
  if (await getViewer()) redirect('/me');

  const { next } = await searchParams;
  const target = typeof next === 'string' && next.startsWith('/') ? next : '/me';

  return (
    <>
      <h1 className="text-2xl font-black">{copy.auth.signInTitle}</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-400">{copy.auth.signInSubtitle}</p>
      <AuthForm mode="sign-in" demo={isDemoMode()} next={target} />
    </>
  );
}
