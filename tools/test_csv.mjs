// Minimal test harness for lib/csv.js — runnable with `node tools/test_csv.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv, mapEdgeCsv } from '../lib/csv.js';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('parseCsv:');
{
  const rows = parseCsv('a,b,c\r\n1,"two, with comma","line\nbreak"\n');
  assert(rows.length === 2, 'parses 2 rows (ignores trailing newline)');
  assert(rows[1][1] === 'two, with comma', 'keeps commas inside quotes');
  assert(rows[1][2] === 'line\nbreak', 'keeps newlines inside quotes');
}
{
  const rows = parseCsv('x,"he said ""hi"""');
  assert(rows[0][1] === 'he said "hi"', 'unescapes doubled quotes');
}

console.log('\nmapEdgeCsv (headered fixture):');
{
  const csv = readFileSync(join(here, '..', 'fixtures', 'collections_export.sample.csv'), 'utf8');
  const { collections, stats } = mapEdgeCsv(csv);
  assert(stats.collections === 3, `groups into 3 collections (got ${stats.collections})`);
  assert(stats.pages === 6, `imports 6 pages (got ${stats.pages})`);
  const japan = collections.find((c) => c.title === 'Trip to Japan');
  assert(!!japan && japan.pages.length === 3, 'Trip to Japan has 3 pages');
  assert(
    japan?.pages[0].url === 'https://www.example.com/tokyo-guide',
    'first URL mapped correctly'
  );
}

console.log('\nmapEdgeCsv (no header, [collection,title,url]):');
{
  const csv = 'Recipes,Pad thai,https://ex.com/padthai\nRecipes,Tacos,https://ex.com/tacos';
  const { collections, stats } = mapEdgeCsv(csv);
  assert(stats.collections === 1 && stats.pages === 2, 'infers layout without a header');
  assert(collections[0].pages[1].title === 'Tacos', 'title column inferred');
}

console.log('\nmapEdgeCsv (reordered columns):');
{
  const csv = 'URL,Name,Collection\nhttps://ex.com/a,Alpha,Group A\nhttps://ex.com/b,Beta,Group A';
  const { collections, stats } = mapEdgeCsv(csv);
  assert(stats.collections === 1, 'detects collection column regardless of position');
  assert(collections[0].pages[0].title === 'Alpha', 'detects title column by header');
  assert(collections[0].title === 'Group A', 'detects collection name by header');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
