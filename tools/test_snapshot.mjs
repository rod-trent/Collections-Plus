// Tests for lib/snapshot.js — runnable with `node tools/test_snapshot.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { extractReadable } from '../lib/snapshot.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('extractReadable — title:');
{
  const r = extractReadable('<html><head><title>Hello &amp; Goodbye</title></head><body><p>Hi</p></body></html>');
  assert(r.title === 'Hello & Goodbye', 'reads <title> and decodes entities');
}
{
  const r = extractReadable('<body><h1>Fallback  Heading</h1><p>x</p></body>');
  assert(r.title === 'Fallback Heading', 'falls back to <h1>, collapses whitespace');
}

console.log('\nextractReadable — strips non-content:');
{
  const html = `<html><body>
    <nav>Home About Contact</nav>
    <script>var tracker = 1;</script>
    <style>.x{color:red}</style>
    <article><p>The real story begins here.</p><p>And continues.</p></article>
    <footer>© 2026 ACME</footer>
  </body></html>`;
  const r = extractReadable(html);
  assert(r.text.includes('The real story begins here.'), 'keeps article body text');
  assert(r.text.includes('And continues.'), 'keeps subsequent paragraphs');
  assert(!r.text.includes('tracker'), 'drops <script> contents');
  assert(!r.text.includes('color:red'), 'drops <style> contents');
  assert(!r.text.includes('Home About'), 'drops <nav> when an <article> is present');
  assert(!r.text.includes('ACME'), 'drops <footer> when an <article> is present');
}

console.log('\nextractReadable — paragraphs and entities:');
{
  const r = extractReadable('<body><p>First&nbsp;line.</p><p>Second &mdash; line.</p></body>');
  assert(r.text.includes('First line.'), 'decodes &nbsp;');
  assert(r.text.includes('Second — line.'), 'decodes &mdash;');
  assert(/First line\.\nSecond/.test(r.text), 'paragraph break becomes a newline');
  assert(!/\n\n\n/.test(r.text), 'collapses runs of blank lines');
}

console.log('\nextractReadable — numeric entities + excerpt + cap:');
{
  const r = extractReadable('<body><p>caf&#233; &#x1F600;</p></body>');
  assert(r.text.includes('café'), 'decodes decimal numeric entity');
  assert(r.text.includes('😀'), 'decodes hex numeric entity (astral)');
}
{
  const long = '<body><p>' + 'word '.repeat(500) + '</p></body>';
  const r = extractReadable(long, { maxChars: 100 });
  assert(r.chars === 100, 'respects maxChars cap');
  assert(r.excerpt.length <= 280, 'excerpt is bounded');
}
{
  const r = extractReadable('');
  assert(r.chars === 0 && r.text === '' && r.title === '', 'empty input yields empty result');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All snapshot.js tests passed.');
