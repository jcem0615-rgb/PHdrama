import type { Metadata, Viewport } from 'next';

import AppChrome from '@/components/AppChrome';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import { copy } from '@/lib/copy';
import { getViewer, isDemoMode } from '@/server/repository';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${copy.appName} — ${copy.tagline}`,
    template: `%s · ${copy.appName}`,
  },
  description:
    'Vertical short dramas for the Philippines. First five episodes free, then unlock with coins or go VIP for ₱69 a week.',
  manifest: '/manifest.webmanifest',
  applicationName: copy.appName,
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: copy.appName },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#08080b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const [viewer, demo] = [await getViewer(), isDemoMode()];

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <AppChrome viewer={viewer} demo={demo} />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
