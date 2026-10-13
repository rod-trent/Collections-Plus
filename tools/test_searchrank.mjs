// Tests for lib/searchrank.js. `node tools/test_searchrank.mjs`.
import { textScore, scoreItem, scoreCollection, sortItemResults, sortCollectionResults } from '../lib/searchrank.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
const json = (v) => JSON.stringify(v);

console.log('textScore:');
assert(textScore('Japan', 'japan') === 100, 'exact match scores highest');
assert(textScore('Japan trip', 'jap') > textScore('Trip to Japan', 'jap'), 'starts-with beats starts-a-word');
assert(textScore('Trip to Japan', 'jap') > textScore('Nonjapanese', 'jap'), 'starts-a-word beats mid-word');
assert(textScore('Kyoto', 'jap') === 0, 'no match scores 0');
assert(textScore('', 'x') === 0 && textScore('x', '') === 0, 'empty text or query scores 0');

console.log('\nscoreItem:');
const page = (title, extra = {}) => ({ type: 'page', title, url: 'https://example.com/x', ...extra });
assert(scoreItem(page('Ramen guide'), 'ramen') > scoreItem(page('Guide', { note: 'ramen spots' }), 'ramen'), 'title match beats note match');
assert(scoreItem(page('Guide', { url: 'https://ramen.example/a' }), 'ramen') > scoreItem(page('Guide', { note: 'ramen' }), 'ramen'), 'site match beats note match');
assert(scoreItem({ type: 'note', text: 'ramen list' }, 'ramen') === 90, "a note's own text counts as its title");
assert(scoreItem(page('Guide', { fields: { shop: 'Ramen Ya' } }), 'ramen') > 0, 'custom fields are searched');

console.log('\nscoreCollection:');
assert(scoreCollection({ title: 'Ramen', tags: [] }, 'ramen') > scoreCollection({ title: 'Food', tags: ['ramen'] }, 'ramen'), 'title beats tag');
assert(scoreCollection({ title: 'Food', tags: ['ramen'] }, 'ramen') > scoreCollection({ title: 'Food', tags: [] }, 'ramen', 1), 'tag beats a match only through items');
assert(scoreCollection({ title: 'Food', tags: [] }, 'ramen', 5) > scoreCollection({ title: 'Food', tags: [] }, 'ramen', 1), 'more matching items breaks ties');

console.log('\nsortItemResults:');
const r = (it, c = 'c') => ({ it, c });
const results = [
  r({ type: 'page', title: 'Guide', note: 'ramen', addedAt: 3 }),
  r({ type: 'page', title: 'Ramen shops', addedAt: 1 }),
  r({ type: 'page', title: 'Best ramen', addedAt: 2 }),
];
const titles = (list) => list.map((x) => x.it.title);
assert(json(titles(sortItemResults(results, 'ramen', 'best'))) === '["Ramen shops","Best ramen","Guide"]', 'best match');
assert(json(titles(sortItemResults(results, 'ramen', 'newest'))) === '["Guide","Best ramen","Ramen shops"]', 'newest');
assert(json(titles(sortItemResults(results, 'ramen', 'oldest'))) === '["Ramen shops","Best ramen","Guide"]', 'oldest');
assert(json(titles(sortItemResults(results, 'ramen', 'title'))) === '["Best ramen","Guide","Ramen shops"]', 'A–Z');
assert(json(titles(sortItemResults(results, 'ramen', 'collection'))) === json(titles(results)), 'by collection keeps the given order');
const before = json(results);
sortItemResults(results, 'ramen', 'best');
assert(json(results) === before, 'the input is not mutated');

console.log('\nsortCollectionResults:');
const cols = [
  { id: 'a', title: 'Food', tags: ['ramen'], updatedAt: 1 },
  { id: 'b', title: 'Ramen', tags: [], updatedAt: 2 },
  { id: 'c', title: 'Trips', tags: [], updatedAt: 3 },
];
const ids = (list) => list.map((c) => c.id).join('');
assert(ids(sortCollectionResults(cols, 'ramen', 'best', (c) => (c.id === 'c' ? 2 : 0))) === 'bac', 'best: title, then tag, then via items');
assert(ids(sortCollectionResults(cols, 'ramen', 'newest')) === 'cba', 'recently updated');
assert(ids(sortCollectionResults(cols, 'ramen', 'title')) === 'abc', 'A–Z');
assert(ids(sortCollectionResults(cols, 'ramen', 'manual')) === 'abc', 'unknown mode keeps the given order');

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll searchrank.js tests passed.');
