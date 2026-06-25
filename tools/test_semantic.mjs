// Tests for lib/semantic.js — `node tools/test_semantic.mjs`.
// Pure catalog builder + result parser; no network.
import { buildCatalog, searchRequest, parseSearchResults } from '../lib/semantic.js';

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
    id: 'c1', title: 'Travel',
    items: [
      { id: 'i1', type: 'page', title: 'Tokyo guide', url: 'https://www.example.com/tokyo', note: 'neighborhoods' },
      { id: 'i2', type: 'note', text: 'Book the JR pass early' },
    ],
  },
  {
    id: 'c2', title: 'Cars',
    items: [{ id: 'i3', type: 'image', alt: 'Vintage automobile', src: 'https://ex.com/car.png', srcPageUrl: 'https://ex.com/car' }],
  },
];

console.log('buildCatalog:');
{
  const { entries, text, truncated } = buildCatalog(collections);
  assert(entries.length === 3, 'flattens all items across collections');
  assert(entries[0].n === 1 && entries[2].n === 3, '1-based numbering');
  assert(entries[0].collectionId === 'c1' && entries[0].itemId === 'i1', 'keeps refs back to items');
  assert(text.includes('[1] (in "Travel") Tokyo guide — example.com'), 'compact line w/ host, www stripped');
  assert(text.includes('[2] (in "Travel") Book the JR pass early'), 'note rendered by text');
  assert(text.includes('[3] (in "Cars") Vintage automobile'), 'image rendered by alt');
  assert(truncated === false, 'not truncated under the cap');
}
{
  const many = [{ id: 'c', title: 'C', items: Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, type: 'note', text: 'n' + i })) }];
  const { entries, truncated } = buildCatalog(many, { maxItems: 4 });
  assert(entries.length === 4 && truncated === true, 'honors maxItems + flags truncation');
}

console.log('\nsearchRequest:');
{
  const r = searchRequest('places to eat', 'catalog', { max: 10 });
  assert(/JSON array/i.test(r.system) && /at most 10/.test(r.system), 'system asks for bounded JSON');
  assert(r.messages[0].content.includes('places to eat') && r.messages[0].content.includes('catalog'), 'query + catalog in message');
}

console.log('\nparseSearchResults:');
{
  const valid = new Set([1, 2, 3]);
  assert(JSON.stringify(parseSearchResults('[{"n":3,"why":"car"},{"n":1,"why":"trip"}]', valid)) ===
    JSON.stringify([{ n: 3, why: 'car' }, { n: 1, why: 'trip' }]), 'parses objects, preserves order');
  assert(parseSearchResults('```json\n[2]\n```', valid).length === 1, 'tolerates code fences + bare ints');
  assert(parseSearchResults('Here you go: [1, 99, 2]', valid).length === 2, 'drops out-of-range numbers, ignores prose');
  assert(parseSearchResults('[1, 1, 2]', valid).length === 2, 'dedupes');
  assert(parseSearchResults('[]', valid).length === 0, 'empty array → no results');
  assert(parseSearchResults('no json here', valid).length === 0, 'no array → no results');
  assert(parseSearchResults('not valid [json', valid).length === 0, 'unparseable → no results');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All semantic.js tests passed.');
