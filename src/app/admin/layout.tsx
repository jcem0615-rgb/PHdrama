import type { Metadata } from 'next';

import { copy } from '@/lib/copy';

/**
 * The staff portal is a separate surface from the customer app: its own shell,
 * its own sign-in, its own visual language. Nothing in the customer app links
 * here, and nothing here renders customer chrome.
 */
export const metadata: Metadata = {
  title: { default: copy.admin.portalName, template: `%s · ${copy.admin.portalName}` },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <div className="min-h-dvh bg-slate-950 text-slate-100">{children}</div>;
}
