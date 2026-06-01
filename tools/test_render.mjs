// Tests for lib/render.js — `node tools/test_render.mjs`.
import { toMarkdown, toHtml, toLinkList } from '../lib/render.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const sample = [
  {
    title: 'Parts',
    tags: ['diy'],
    items: [
      { type: 'page', title: 'Bolt', url: 'https://ex.com/bolt', note: 'M4', done: true, fields: { Price: '0.50' } },
      { type: 'image', alt: 'Diagram', src: 'https://ex.com/d.png', srcPageUrl: 'https://ex.com/d' },
      { type: 'note', text: 'remember\nwashers' },
    ],
  },
];

console.log('toMarkdown:');
{
  const md = toMarkdown(sample);
  assert(md.startsWith('# Collections Plus export'), 'has top-level title');
  assert(md.includes('## Parts'), 'collection heading');
  assert(md.includes('*Tags: diy*'), 'tags line');
  assert(md.includes('- [x] [Bolt](https://ex.com/bolt) — M4 _(Price: 0.50)_'), 'checked page w/ note + fields');
  assert(md.includes('- [ ] [Diagram](https://ex.com/d)'), 'image uses source page url');
  assert(md.includes('- [ ] remember washers'), 'note newline flattened');
}

console.log('\ntoHtml:');
{
  const html = toHtml(sample);
  assert(html.startsWith('<!doctype html>'), 'standalone document');
  assert(html.includes('<a href="https://ex.com/bolt">Bolt</a>'), 'clickable link');
  assert(html.includes('checked'), 'done item checkbox checked');
  assert(!html.includes('<script'), 'no script injection from content');
}

console.log('\ntoLinkList:');
{
  const txt = toLinkList(sample[0]);
  const lines = txt.split('\n');
  assert(lines.length === 2, 'excludes notes (2 of 3 items)');
  assert(lines[0] === 'Bolt — https://ex.com/bolt', 'title — url format');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
