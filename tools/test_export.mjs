// Minimal test harness for lib/export.js — runnable with `node tools/test_export.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { toCsv, COLUMNS } from '../lib/export.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const sample = [
  {
    title: 'Trip to Japan',
    items: [
      { type: 'page', title: 'Tokyo guide', url: 'https://ex.com/tokyo', note: 'day 1', addedAt: 1700000000000 },
      { type: 'note', text: 'Bring, comma' },
      { type: 'image', alt: 'Fuji', src: 'https://ex.com/fuji.jpg', srcPageUrl: 'https://ex.com/fuji' },
    ],
  },
  { title: 'Empty one', items: [] },
];

console.log('toCsv:');
{
  const csv = toCsv(sample);
  const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n');

  assert(csv.charCodeAt(0) === 0xfeff, 'starts with a UTF-8 BOM');
  assert(lines[0] === COLUMNS.join(','), 'header row matches COLUMNS');
  assert(lines.length === 5, `header + 3 items + 1 empty-collection row (got ${lines.length})`);

  assert(
    lines[1] === 'Trip to Japan,page,Tokyo guide,https://ex.com/tokyo,day 1,2023-11-14',
    'page row flattened with ISO date'
  );
  assert(lines[2].includes('"Bring, comma"'), 'note text with a comma is quoted');
  assert(lines[2].startsWith('Trip to Japan,note,,,'), 'note row leaves title/url empty');
  assert(
    lines[3] === 'Trip to Japan,image,Fuji,https://ex.com/fuji,,',
    'image row uses alt + source page url'
  );
  assert(lines[4] === 'Empty one,,,,,', 'empty collection still gets a row');
}

console.log('\ntoCsv (escaping):');
{
  const csv = toCsv([
    { title: 'Q"uote', items: [{ type: 'note', text: 'has "quotes" and\nnewline' }] },
  ]);
  assert(csv.includes('"Q""uote"'), 'doubles embedded quotes in titles');
  assert(csv.includes('"has ""quotes"" and\nnewline"'), 'quotes fields with newlines');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
