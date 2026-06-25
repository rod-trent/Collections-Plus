// Tests for lib/omnibox.js — `node tools/test_omnibox.mjs`.
import { searchEntries } from '../lib/omnibox.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const collections = [
  {
    title: 'Travel',
    items: [
      { type: 'page', title: 'Tokyo neighborhood guide', url: 'https://example.com/tokyo' },
      { type: 'note', text: 'JR pass tip' }, // no url → skipped
      { type: 'image', alt: 'Mt Fuji', src: 'https://example.com/fuji.png', srcPageUrl: 'https://example.com/fuji' },
    ],
  },
  {
    title: 'Dev',
    items: [
      { type: 'page', title: 'Array.flatMap docs', url: 'https://developer.mozilla.org/flatmap' },
      { type: 'highlight', text: 'closures capture variables by reference', url: 'https://example.com/js' },
    ],
  },
];

console.log('searchEntries:');
{
  assert(searchEntries(collections, '').length === 0, 'empty query → no results');
  const tok = searchEntries(collections, 'tokyo');
  assert(tok.length === 1 && tok[0].url === 'https://example.com/tokyo', 'matches by title');
  assert(tok[0].collection === 'Travel', 'reports the collection');

  assert(searchEntries(collections, 'mozilla').length === 1, 'matches by url');
  assert(searchEntries(collections, 'closures').length === 1, 'matches a highlight by quote text');
  assert(searchEntries(collections, 'dev flatmap').length === 1, 'all terms must match (collection + title)');
  assert(searchEntries(collections, 'tokyo banana').length === 0, 'a non-matching term excludes the item');

  const notes = searchEntries(collections, 'jr pass');
  assert(notes.length === 0, 'notes (no url) are not searchable here');

  const img = searchEntries(collections, 'fuji');
  assert(img.length === 1 && img[0].url === 'https://example.com/fuji', 'image uses its source page url');

  assert(searchEntries(collections, 'e', { max: 1 }).length <= 1, 'respects max');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All omnibox.js tests passed.');
