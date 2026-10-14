import './globals.css';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import { GITHUB_URL, SITE_URL, STORE_URL } from '../lib/site.js';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Collections Plus: save, organize and sync the web',
    template: '%s · Collections Plus',
  },
  description:
    'The open, local-first replacement for Microsoft Edge Collections. Save pages, images and notes into collections in your browser, and take them with you on your phone.',
  icons: { icon: '/img/icon.png', apple: '/img/icon.png' },
  openGraph: {
    title: 'Collections Plus',
    description: 'Save, organize and sync the web. Your data stays yours.',
    images: ['/img/promo.png'],
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a111c' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              <img src="/img/icon.png" alt="" width="28" height="28" />
              Collections Plus
            </Link>
            <nav className="nav" aria-label="Main">
              <a href="/#features" className="nav-hide">Features</a>
              <a href="/#sync" className="nav-hide">Sync &amp; mobile</a>
              <a href="/app/">Mobile app</a>
              <Link href="/help">Help</Link>
              <Link href="/account" className="nav-hide">Account</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>© {new Date().getFullYear()} Collections Plus</span>
            <nav aria-label="Footer">
              <a href={STORE_URL}>Chrome Web Store</a>
              <a href="/app/">Mobile app</a>
              <Link href="/help">Help</Link>
              <Link href="/privacy">Privacy</Link>
              <a href={GITHUB_URL}>GitHub</a>
            </nav>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
