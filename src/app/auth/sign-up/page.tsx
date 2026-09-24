import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuthForm from '@/components/AuthForm';
import { copy } from '@/lib/copy';
import { getViewer, isDemoMode } from '@/server/repository';

export const metadata: Metadata = { title: copy.auth.signUp };
export const dynamic = 'force-dynamic';

export default async function SignUpPage({ searchParams }: PageProps<'/auth/sign-up'>) {
  if (await getViewer()) redirect('/me');

  const { next } = await searchParams;
  const target = typeof next === 'string' && next.startsWith('/') ? next : '/me';

  return (
    <>
      <h1 className="text-2xl font-black">{copy.auth.signUpTitle}</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-400">{copy.auth.signUpSubtitle}</p>
      <AuthForm mode="sign-up" demo={isDemoMode()} next={target} />
    </>
  );
}
