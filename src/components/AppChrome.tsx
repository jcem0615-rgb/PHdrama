'use client';

import { usePathname } from 'next/navigation';

import BottomNav from '@/components/BottomNav';
import TopBar from '@/components/TopBar';
import type { Viewer } from '@/lib/types';

/**
 * Decides which chrome a route gets. `/reels` and `/watch` are immersive: the
 * video owns the viewport, so the header steps out of the way.
 */
export default function AppChrome({ viewer, demo }: { viewer: Viewer | null; demo: boolean }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith('/reels') || pathname.startsWith('/watch');
  const isAdmin = viewer?.role === 'admin' || viewer?.role === 'superadmin';

  return (
    <>
      {!immersive && <TopBar viewer={viewer} demo={demo} />}
      {!pathname.startsWith('/watch') && <BottomNav pathname={pathname} showAdmin={isAdmin} />}
    </>
  );
}
