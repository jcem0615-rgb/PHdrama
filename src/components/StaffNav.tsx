'use client';

import { Clapperboard, Receipt, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { copy } from '@/lib/copy';

const ITEMS = [
  { href: '/admin', label: copy.admin.title, icon: Receipt, exact: true },
  { href: '/admin/viewers', label: copy.admin.viewers, icon: Users, exact: false },
  { href: '/admin/studio', label: copy.admin.studio, icon: Clapperboard, exact: false },
];

export default function StaffNav() {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
              active ? 'bg-slate-800 text-slate-100' : 'bg-slate-900/70 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
