// The terms of service are the repo's TERMS.md, rendered at build time, like the
// privacy policy.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

export const metadata = { title: 'Terms of Service' };

export default async function Terms() {
  const md = await readFile(path.join(process.cwd(), '..', 'TERMS.md'), 'utf8');
  const html = marked.parse(md);
  return <article className="wrap prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
