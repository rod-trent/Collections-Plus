// Tests for lib/sortview.js — `node tools/test_sortview.mjs`.
import { sortItems, sortCollections } from '../lib/sortview.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const items = [
  { type: 'page', title: 'Banana', addedAt: 100 },
  { type: 'page', title: 'apple', addedAt: 300 },
  { type: 'note', text: 'Cherry note', addedAt: 200 },
];

console.log('sortItems:');
{
  assert(sortItems(items, 'manual') === items, 'manual returns the same array (no copy)');
  assert(sortItems(items, 'newest').map((i) => i.addedAt).join() === '300,200,100', 'newest by addedAt desc');
  assert(sortItems(items, 'oldest').map((i) => i.addedAt).join() === '100,200,300', 'oldest by addedAt asc');
  const titles = sortItems(items, 'title').map((i) => i.title || i.text);
  assert(titles.join() === 'apple,Banana,Cherry note', 'title sort is case-insensitive');
  assert(items[0].title === 'Banana', 'original array is not mutated');
}

const cols = [
  { title: 'Zebra', updatedAt: 10 },
  { title: 'alpha', updatedAt: 30 },
  { title: 'Mango', updatedAt: 20 },
];

console.log('\nsortCollections:');
{
  assert(sortCollections(cols, 'manual') === cols, 'manual returns the same array');
  assert(sortCollections(cols, 'newest').map((c) => c.updatedAt).join() === '30,20,10', 'newest by updatedAt desc');
  assert(sortCollections(cols, 'title').map((c) => c.title).join() === 'alpha,Mango,Zebra', 'title sort is case-insensitive');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All sortview.js tests passed.');
