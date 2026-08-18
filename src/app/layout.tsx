import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Lora, Raleway } from 'next/font/google';

import './globals.css';
import ServiceWorker from '@/components/ServiceWorker';

// Self-hosted at build time by next/font -- no runtime request to Google, and
// no new dependency. Note this does mean `npm run build` needs network access.
const lora = Lora({ subsets: ['latin'], display: 'swap', variable: '--font-lora' });
const raleway = Raleway({ subsets: ['latin'], display: 'swap', variable: '--font-raleway' });

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Daily Tracker';

/** True when this request came in on the admin hostname. */
async function onAdminHost(): Promise<boolean> {
  const adminHost = (process.env.NEXT_PUBLIC_ADMIN_HOST ?? '').trim().toLowerCase();
  if (!adminHost) return false;
  const host = ((await headers()).get('host') ?? '').toLowerCase();
  return host === adminHost;
}

export async function generateMetadata(): Promise<Metadata> {
  // The admin console gets no manifest. The manifest declares scope "/", so a
  // browser on the admin host would otherwise offer to install the console --
  // producing a second home-screen icon, with the tracker's name and icon, that
  // opens the admin panel.
  if (await onAdminHost()) {
    return {
      title: `${brand} — Admin`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${brand} — Daily Tracker`,
    description: 'Tap once a day. Build the streak. Finish the challenge.',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: brand,
    },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#12314f' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1926' },
  ],
  width: 'device-width',
  initialScale: 1,
  // maximumScale is deliberately NOT set. Blocking pinch-zoom fails WCAG 1.4.4,
  // and the iOS focus-zoom it used to prevent is already handled by the 16px
  // minimum font-size on inputs in globals.css.
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await onAdminHost();

  return (
    <html lang="en" className={`${lora.variable} ${raleway.variable}`}>
      <body>
        {children}
        {/* The service worker caches the tracker's shell. Registering it on the
            admin host would put the console inside the tracker's scope. */}
        {!isAdmin && <ServiceWorker />}
      </body>
    </html>
  );
}
