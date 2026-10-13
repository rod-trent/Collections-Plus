'use client';
// Sidebar for the help pages; highlights the page you're on.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HelpNav({ pages }) {
  const path = usePathname();
  return (
    <nav className="help-nav" aria-label="Help topics">
      <Link href="/help" className="help-home" aria-current={path === '/help' ? 'page' : undefined}>
        Help
      </Link>
      <ul>
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/help/${p.slug}`} aria-current={path === `/help/${p.slug}` ? 'page' : undefined}>
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
