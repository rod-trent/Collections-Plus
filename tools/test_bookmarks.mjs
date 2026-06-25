// Tests for lib/bookmarks.js — `node tools/test_bookmarks.mjs`.
// Pure mapping over a Chrome/Edge bookmark tree; no chrome API.
import { mapBookmarks } from '../lib/bookmarks.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// Shape mirrors chrome.bookmarks.getTree(): one unnamed root → named roots.
const tree = [
  {
    id: '0', title: '',
    children: [
      {
        id: '1', title: 'Bookmarks bar',
        children: [
          { id: '4', title: 'Anthropic', url: 'https://anthropic.com' },
          { id: '5', title: 'JS bookmarklet', url: 'javascript:void(0)' },
          {
            id: '6', title: 'Dev',
            children: [
              { id: '7', title: 'MDN', url: 'https://developer.mozilla.org' },
              { id: '8', title: 'Empty subfolder', children: [] },
            ],
          },
        ],
      },
      { id: '2', title: 'Other bookmarks', children: [{ id: '9', title: 'Local', url: 'chrome://flags' }] },
    ],
  },
];

console.log('mapBookmarks:');
{
  const { collections, stats } = mapBookmarks(tree);
  const byTitle = Object.fromEntries(collections.map((c) => [c.title, c]));

  assert(!!byTitle['Bookmarks bar'], 'folder with bookmarks becomes a collection');
  assert(byTitle['Bookmarks bar'].pages.length === 1, 'only http(s) bookmarks kept (javascript: dropped)');
  assert(byTitle['Bookmarks bar'].pages[0].url === 'https://anthropic.com', 'keeps the bookmark url');
  assert(!!byTitle['Dev'] && byTitle['Dev'].pages[0].title === 'MDN', 'nested folder → its own collection');
  assert(!('Empty subfolder' in byTitle), 'empty folders are skipped');
  assert(!('Other bookmarks' in byTitle), 'folder with only non-http bookmarks is skipped');
  assert(!('' in byTitle), 'the unnamed root node is not a collection');

  assert(stats.collections === 2, 'two collections (Bookmarks bar, Dev)');
  assert(stats.pages === 2, 'two pages imported');
  assert(stats.skipped === 2, 'javascript: and chrome:// counted as skipped');
}

console.log('\nmapBookmarks (single root node, not array):');
{
  const { stats } = mapBookmarks({ title: 'Stuff', children: [{ title: 'A', url: 'http://a.com' }] });
  assert(stats.collections === 1 && stats.pages === 1, 'accepts a single root node');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All bookmarks.js tests passed.');
