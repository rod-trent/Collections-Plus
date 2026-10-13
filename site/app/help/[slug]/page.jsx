import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HELP_PAGES, helpPage, renderHelp } from '../../../lib/help.js';

export const dynamicParams = false; // only the pages listed in HELP_PAGES

export function generateStaticParams() {
  return HELP_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const page = helpPage((await params).slug);
  return page ? { title: page.title, description: page.blurb } : {};
}

export default async function HelpArticle({ params }) {
  const { slug } = await params;
  const page = helpPage(slug);
  if (!page) notFound();
  const html = await renderHelp(slug);
  const i = HELP_PAGES.indexOf(page);
  const prev = HELP_PAGES[i - 1];
  const next = HELP_PAGES[i + 1];
  return (
    <>
      <article className="prose help-article" dangerouslySetInnerHTML={{ __html: html }} />
      <nav className="help-pager" aria-label="More help">
        {prev ? <Link href={`/help/${prev.slug}`}>← {prev.title}</Link> : <span />}
        {next ? <Link href={`/help/${next.slug}`}>{next.title} →</Link> : <span />}
      </nav>
    </>
  );
}
