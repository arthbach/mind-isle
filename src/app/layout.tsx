import type { Metadata, Viewport } from 'next';
import { Nunito, Pixelify_Sans } from 'next/font/google';
import { config } from '@/lib/config';
import { themeScript } from '@/lib/theme';
import './globals.css';

const pixel = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixel', weight: ['400', '600', '700'] });
const body = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: config.title,
  description: 'A pixel-art island built from your notes.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: config.title, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e0703a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pixel.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
