// Tests for lib/ai-organize.js — `node tools/test_ai_organize.mjs`.
// Pure prompt builders + parsers; no network.
import { summaryRequest, tagsRequest, parseTagList, organizeQuestion, digestRequest } from '../lib/ai-organize.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('summaryRequest:');
{
  const r = summaryRequest({ title: 'My Page', text: 'Body text here.' });
  assert(/TL;DR/i.test(r.system), 'system asks for a TL;DR');
  assert(r.messages.length === 1 && r.messages[0].role === 'user', 'single user message');
  assert(r.messages[0].content.includes('My Page'), 'includes the title');
  assert(r.messages[0].content.includes('Body text here.'), 'includes the body');
}
{
  const long = 'x'.repeat(50000);
  const r = summaryRequest({ title: 'T', text: long });
  assert(r.messages[0].content.length < 20000, 'caps very long source text');
}

console.log('\ntagsRequest:');
{
  const c = { title: 'Recipes', items: [{ type: 'page', title: 'Tacos', url: 'https://ex.com/t' }] };
  const r = tagsRequest(c, { max: 5 });
  assert(/comma-separated/i.test(r.system), 'system asks for comma-separated tags');
  assert(/5 or fewer/.test(r.system), 'system honors the max');
  assert(r.messages[0].content.includes('Recipes'), 'context includes the collection');
}

console.log('\nparseTagList:');
{
  assert(JSON.stringify(parseTagList('travel, food, Japan')) === JSON.stringify(['travel', 'food', 'japan']), 'splits + lowercases');
  assert(JSON.stringify(parseTagList('- travel\n- food\n* japan')) === JSON.stringify(['travel', 'food', 'japan']), 'strips bullets / newlines');
  assert(JSON.stringify(parseTagList('"travel", "food".')) === JSON.stringify(['travel', 'food']), 'strips quotes and trailing dot');
  assert(JSON.stringify(parseTagList('travel, travel, food')) === JSON.stringify(['travel', 'food']), 'dedupes');
  assert(parseTagList('a, b, c, d, e, f, g, h', { max: 3 }).length === 3, 'respects max');
  assert(parseTagList('thisisaverylongtagthatexceedsthirtychars').length === 0, 'drops overly long tags');
  assert(parseTagList('').length === 0, 'empty reply → no tags');
}

console.log('\ndigestRequest:');
{
  const r = digestRequest(
    [
      { title: 'Tokyo guide', collection: 'Travel', host: 'example.com' },
      { title: 'Tax form', collection: 'Finance' },
    ],
    { days: 7 }
  );
  assert(/digest/i.test(r.system) && /Markdown/i.test(r.system), 'system asks for a Markdown digest');
  assert(r.messages[0].content.includes('last 7 days'), 'message states the window');
  assert(r.messages[0].content.includes('[Travel] Tokyo guide (example.com)'), 'item line includes collection + host');
  assert(r.messages[0].content.includes('[Finance] Tax form'), 'item without host renders cleanly');
}

console.log('\norganizeQuestion:');
{
  const q = organizeQuestion();
  assert(/folders/i.test(q) && /duplicates/i.test(q) && /tags/i.test(q), 'covers folders, duplicates, tags');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All ai-organize.js tests passed.');
