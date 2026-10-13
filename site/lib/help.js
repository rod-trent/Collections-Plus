// Help pages: Markdown files in content/help/, rendered at build time. The
// order here is the order of the sidebar and of "Next" links.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

export const HELP_PAGES = [
  { slug: 'getting-started', title: 'Getting started', blurb: 'What Collections Plus is and how the pieces fit together.' },
  { slug: 'extension', title: 'Using the extension', blurb: 'Saving, organizing, the Reading list, and coming from Edge.' },
  { slug: 'mobile', title: 'The mobile app', blurb: 'Install it on your phone and save from any app.' },
  { slug: 'sync', title: 'Sync with Dropbox', blurb: 'Keep your phone and computers in step, step by step.' },
  { slug: 'ai', title: 'AI search', blurb: 'Find things by meaning with your own AI provider.' },
  { slug: 'troubleshooting', title: 'Troubleshooting & FAQ', blurb: 'Fixes for the things that trip people up.' },
];

export function helpPage(slug) {
  return HELP_PAGES.find((p) => p.slug === slug) || null;
}

/** Read and render one help page. Headings get ids so they can be linked to. */
export async function renderHelp(slug) {
  const md = await readFile(path.join(process.cwd(), 'content', 'help', `${slug}.md`), 'utf8');
  const renderer = new marked.Renderer();
  const ids = new Map();
  renderer.heading = function ({ tokens, depth, text }) {
    const base = text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const n = ids.get(base) || 0;
    ids.set(base, n + 1);
    const id = n ? `${base}-${n}` : base;
    return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  return marked.parse(md, { renderer });
}
