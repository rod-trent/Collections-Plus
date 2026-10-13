import Link from 'next/link';
import { HELP_PAGES } from '../../lib/help.js';

export const metadata = {
  title: 'Help',
  description: 'How to use Collections Plus on your computer and your phone, and how to keep them in sync.',
};

export default function HelpIndex() {
  return (
    <>
      <h1 className="help-title">How can we help?</h1>
      <p className="sub">
        Guides for the Collections Plus extension, the mobile app, and keeping them in sync.
      </p>
      <div className="grid grid-2">
        {HELP_PAGES.map((p) => (
          <Link key={p.slug} href={`/help/${p.slug}`} className="card help-card">
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
