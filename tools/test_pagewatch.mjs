// Tests for lib/pagewatch.js — runnable with `node tools/test_pagewatch.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import {
  watchText,
  liveText,
  liveFingerprint,
  fingerprint,
  watchResult,
  hasUnseenChange,
  countUnseenChanges,
} from '../lib/pagewatch.js';
import { mergeData } from '../lib/merge.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const page = (body, extra = '') =>
  `<html><head><title>T</title><script>var nonce=${Math.random()}</script></head><body>${extra}<article><p>${body}</p></article></body></html>`;

console.log('watchText / fingerprint:');
{
  const body = 'Widget Pro is on sale for $49. '.repeat(12);
  assert(watchText(page(body)).includes('$49'), 'keeps readable body text (prices included)');
  assert(!watchText(page(body)).includes('nonce'), 'ignores scripts');
  const a = await fingerprint(page(body, '<p>Updated 5 minutes ago</p>'));
  const b = await fingerprint(page(body, '<p>Updated 2 hours ago</p>'));
  assert(a && a === b, 'relative timestamps and per-load scripts do not change the fingerprint');
  const c = await fingerprint(page(body.replace('$49', '$39')));
  assert(c && c !== a, 'a real content change moves the fingerprint');
  assert((await fingerprint('<html><body></body></html>')) === '', 'empty page → no fingerprint');
}

console.log('\nwatchResult:');
{
  const first = watchResult({ watch: true }, 'h1', 100);
  assert(first.watchHash === 'h1' && !first.changedAt, 'first check only records a baseline');
  const same = watchResult({ watch: true, watchHash: 'h1' }, 'h1', 200);
  assert(!same.changedAt && same.watchCheckedAt === 200, 'same hash → no change, check time stamped');
  const moved = watchResult({ watch: true, watchHash: 'h1' }, 'h2', 300);
  assert(moved.changedAt === 300 && moved.watchHash === 'h2', 'new hash → changedAt');
  const blocked = watchResult({ watch: true, watchHash: 'h1' }, '', 400);
  assert(!blocked.changedAt && !('watchHash' in blocked), 'failed fetch never flags a change');
}

console.log('\nhasUnseenChange / countUnseenChanges:');
{
  assert(hasUnseenChange({ watch: true, changedAt: 5, changeSeenAt: 1 }), 'changed after last seen');
  assert(!hasUnseenChange({ watch: true, changedAt: 5, changeSeenAt: 6 }), 'seen after change');
  assert(!hasUnseenChange({ watch: false, changedAt: 5 }), 'unwatched pages never show the dot');
  const cols = [
    { items: [{ watch: true, changedAt: 2 }, { watch: true }] },
    { items: [{ watch: true, changedAt: 3, changeSeenAt: 1 }] },
  ];
  assert(countUnseenChanges(cols) === 2, 'counts across collections');
}

console.log('\nmerge carries watch state:');
{
  const base = { id: 'i', type: 'page', url: 'https://x', watch: true, lastModified: 10, addedAt: 1 };
  const col = (it) => ({ collections: [{ id: 'c', title: 'C', items: [it], updatedAt: 10, metaAt: 10 }] });
  const local = col({ ...base, watchHash: 'a', watchCheckedAt: 100, changeSeenAt: 500 });
  const remote = col({ ...base, watchHash: 'b', watchCheckedAt: 200, changedAt: 600 });
  const it = mergeData(local, remote).collections[0].items[0];
  assert(it.watchHash === 'b' && it.watchCheckedAt === 200, 'newest check wins');
  assert(it.changedAt === 600 && it.changeSeenAt === 500, 'change/seen stamps take the max');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll pagewatch tests passed.');
