'use client';

import { usePathname } from 'next/navigation';

import BottomNav from '@/components/BottomNav';
import TopBar from '@/components/TopBar';
import type { Viewer } from '@/lib/types';

/**
 * Chrome for the customer app.
 *
 * `/admin` gets none of it — the staff portal brings its own shell, so a
 * customer's coin balance and nav never appear over it, and nothing in the
 * customer chrome ever links into it. `/auth` is standalone too.
 *
 * `/reels` and `/watch` are immersive: the video owns the viewport, so the
 * header steps out of the way.
 */
export default function AppChrome({ viewer, demo }: { viewer: Viewer | null; demo: boolean }) {
  const pathname = usePathname();

  // The staff portal brings its own shell; the auth pages are standalone.
  if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) return null;

  const immersive = pathname.startsWith('/reels') || pathname.startsWith('/watch');

  return (
    <>
      {!immersive && <TopBar viewer={viewer} demo={demo} />}
      {!pathname.startsWith('/watch') && <BottomNav pathname={pathname} />}
    </>
  );
}
