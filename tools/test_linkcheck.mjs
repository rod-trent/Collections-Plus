// Tests for lib/linkcheck.js — runnable with `node tools/test_linkcheck.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { classifyStatus } from '../lib/linkcheck.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('classifyStatus — alive:');
{
  assert(classifyStatus({ status: 200 }) === 'ok', '200 is ok');
  assert(classifyStatus({ status: 204 }) === 'ok', '204 is ok');
  assert(classifyStatus({ status: 301 }) === 'ok', '301 (redirect) is ok');
  assert(classifyStatus({ status: 399 }) === 'ok', 'upper 3xx is ok');
  assert(classifyStatus({ status: 401 }) === 'ok', '401 (auth wall) counts as alive');
  assert(classifyStatus({ status: 403 }) === 'ok', '403 (forbidden) counts as alive');
  assert(classifyStatus({ status: 405 }) === 'ok', '405 (HEAD not allowed) is alive');
}

console.log('\nclassifyStatus — dead:');
{
  assert(classifyStatus({ status: 404 }) === 'dead', '404 is dead');
  assert(classifyStatus({ status: 410 }) === 'dead', '410 (gone) is dead');
  assert(classifyStatus({ networkError: true }) === 'dead', 'network/DNS error is dead');
  assert(classifyStatus({ status: 0, networkError: true }) === 'dead', 'no response + error is dead');
}

console.log('\nclassifyStatus — unknown (don’t cry wolf):');
{
  assert(classifyStatus({ status: 500 }) === 'unknown', '500 is ambiguous');
  assert(classifyStatus({ status: 503 }) === 'unknown', '503 is ambiguous');
  assert(classifyStatus({ status: 429 }) === 'unknown', '429 (rate limited) is ambiguous');
  assert(classifyStatus({ timedOut: true }) === 'unknown', 'timeout is ambiguous (slow != dead)');
  assert(classifyStatus({}) === 'unknown', 'empty outcome is unknown');
  assert(classifyStatus() === 'unknown', 'missing outcome is unknown');
}

console.log('\nclassifyStatus — precedence:');
{
  assert(classifyStatus({ status: 404, timedOut: true }) === 'unknown', 'timeout wins over status');
  assert(classifyStatus({ status: 200, networkError: true }) === 'dead', 'network error wins over status');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All linkcheck.js tests passed.');
