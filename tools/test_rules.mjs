// Tests for lib/rules.js — `node tools/test_rules.mjs`.
import { ruleMatches, matchRule, ruleLabel } from '../lib/rules.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('ruleMatches — domain:');
{
  const r = { type: 'domain', value: 'youtube.com' };
  assert(ruleMatches(r, { url: 'https://youtube.com/watch?v=1' }), 'matches exact host');
  assert(ruleMatches(r, { url: 'https://www.youtube.com/x' }), 'ignores www.');
  assert(ruleMatches(r, { url: 'https://m.youtube.com/x' }), 'matches subdomain');
  assert(!ruleMatches(r, { url: 'https://notyoutube.com/x' }), 'does not match a different domain');
  assert(!ruleMatches(r, { url: 'not a url' }), 'no match on an unparseable url');
}

console.log('\nruleMatches — url/title contains:');
{
  assert(ruleMatches({ type: 'urlContains', value: '/docs/' }, { url: 'https://x.com/docs/a' }), 'urlContains matches');
  assert(ruleMatches({ type: 'titleContains', value: 'recipe' }, { title: 'Best Recipe Ever' }), 'titleContains is case-insensitive');
  assert(!ruleMatches({ type: 'titleContains', value: 'recipe' }, { title: 'Tax forms' }), 'titleContains negative');
  assert(!ruleMatches({ type: 'urlContains', value: '' }, { url: 'https://x.com' }), 'empty value never matches');
}

console.log('\nmatchRule — first match wins:');
{
  const rules = [
    { id: 'a', type: 'domain', value: 'github.com', collectionId: 'c-dev' },
    { id: 'b', type: 'titleContains', value: 'tutorial', collectionId: 'c-learn' },
  ];
  assert(matchRule(rules, { url: 'https://github.com/x', title: 'A tutorial' }) === 'c-dev', 'earlier rule wins');
  assert(matchRule(rules, { url: 'https://x.com', title: 'Node tutorial' }) === 'c-learn', 'later rule still matches');
  assert(matchRule(rules, { url: 'https://x.com', title: 'nothing' }) === null, 'no match → null');
  assert(matchRule(null, { url: 'https://x.com' }) === null, 'tolerates non-array rules');
}

console.log('\nruleLabel:');
{
  assert(ruleLabel({ type: 'domain', value: 'x.com' }) === 'Domain is x.com', 'domain label');
  assert(ruleLabel({ type: 'urlContains', value: '/a' }) === 'URL contains "/a"', 'urlContains label');
  assert(ruleLabel({ type: 'titleContains', value: 'hi' }) === 'Title contains "hi"', 'titleContains label');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All rules.js tests passed.');
