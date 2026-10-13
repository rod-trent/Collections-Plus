// The privacy policy is the repo's PRIVACY.md, rendered at build time, so the
// site and the extension listing can never say different things.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

export const metadata = { title: 'Privacy policy' };

export default async function Privacy() {
  const md = await readFile(path.join(process.cwd(), '..', 'PRIVACY.md'), 'utf8');
  const html = marked.parse(md);
  return <article className="wrap prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
