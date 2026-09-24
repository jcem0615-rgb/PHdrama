import Link from 'next/link';

import { copy } from '@/lib/copy';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-md place-items-center px-4 text-center">
      <div>
        <p className="text-5xl font-black text-gradient">404</p>
        <p className="mt-3 text-sm text-ink-400">{copy.errors.NOT_FOUND}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-white/10 px-6 py-3 text-sm font-semibold"
        >
          {copy.nav.home}
        </Link>
      </div>
    </main>
  );
}
