import { Clapperboard, Coins, Home, User } from 'lucide-react';
import Link from 'next/link';

import { copy } from '@/lib/copy';

/**
 * Customer navigation. There is no staff entry here and there never should be:
 * the admin portal is a separate surface with its own sign-in, and the customer
 * app should give no hint that it exists.
 */
const ITEMS = [
  { href: '/', label: copy.nav.home, icon: Home },
  { href: '/reels', label: copy.nav.reels, icon: Clapperboard },
  { href: '/coins', label: copy.nav.coins, icon: Coins },
  { href: '/me', label: copy.nav.me, icon: User },
];

export default function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-ink-950/85 backdrop-blur-lg">
      <ul className="mx-auto grid max-w-md grid-cols-4 pb-[var(--safe-bottom)]">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-flame-400' : 'text-ink-400'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
