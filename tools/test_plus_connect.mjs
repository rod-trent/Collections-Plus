// Tests for the extension's Plus Sync sign-in: lib/plus-connect.js, and
// site/lib/sync-return.js on the server side of the same handshake.
// `node tools/test_plus_connect.mjs`. Exits non-zero on failure.
import { webcrypto } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

const { PLUS_ORIGIN, RETURN_PATH, newConnectState, connectUrl, parseConnectReturn } = await import(
  '../lib/plus-connect.js'
);
const { syncReturnFor } = await import('../site/lib/sync-return.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('connect state');
const state = newConnectState();
assert(/^[\w-]{32}$/.test(state), 'state is URL-safe and long enough to be unguessable');
assert(state !== newConnectState(), 'each attempt gets its own state');

console.log('parseConnectReturn');
const page = `${PLUS_ORIGIN}${RETURN_PATH}`;
assert(eq(parseConnectReturn(`${page}#plus-token=cps_a&state=${state}`, state), { token: 'cps_a' }), 'takes a token');
assert(
  eq(parseConnectReturn(`${page}#plus-error=not-enabled&state=${state}`, state), { error: 'not-enabled' }),
  'takes an error'
);
assert(parseConnectReturn(`${page}#plus-token=cps_a&state=other`, state) === null, 'ignores another state');
assert(parseConnectReturn(`${page}#plus-token=cps_a`, state) === null, 'ignores a missing state');
assert(parseConnectReturn(`${page}#plus-token=cps_a&state=${state}`, undefined) === null, 'ignores when not connecting');
assert(
  parseConnectReturn(`https://evil.example${RETURN_PATH}#plus-token=cps_a&state=${state}`, state) === null,
  'ignores another site'
);
assert(
  parseConnectReturn(`${PLUS_ORIGIN}/app/#plus-token=cps_a&state=${state}`, state) === null,
  'ignores another page on the site'
);
assert(parseConnectReturn(`${page}#state=${state}`, state) === null, 'ignores a return with no result');
assert(parseConnectReturn('not a url', state) === null, 'survives a bad URL');

console.log('syncReturnFor (server)');
const q = (url) => syncReturnFor(new URL(url).searchParams);
const ext = q(connectUrl(state));
assert(ext.path === RETURN_PATH, 'the extension returns to the path it watches for');
assert(ext.suffix === `&state=${state}`, 'the state comes back beside the token');
assert(ext.connectPath === `/api/sync/connect?client=extension&state=${state}`, 'sign-in comes back to the same attempt');
const mobile = q(`${PLUS_ORIGIN}/api/sync/connect`);
assert(mobile.path === '/app/' && mobile.suffix === '', 'the mobile app is unchanged');
assert(mobile.connectPath === '/api/sync/connect', 'the mobile sign-in return is unchanged');
for (const bad of ['short', 'x'.repeat(200), 'abcdefghijklmnop%26plus-token%3Devil', 'abcdefghijklmnop%23x']) {
  assert(q(`${PLUS_ORIGIN}/api/sync/connect?client=extension&state=${bad}`).path === '/app/', `rejects state "${bad.slice(0, 24)}"`);
}

console.log('round trip');
const url = new URL(ext.path + '#plus-token=cps_rt' + ext.suffix, PLUS_ORIGIN).href;
assert(eq(parseConnectReturn(url, state), { token: 'cps_rt' }), 'what the server builds, the extension accepts');

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll passed');
