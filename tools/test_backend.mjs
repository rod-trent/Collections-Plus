// Tests for lib/backend.js — the storage seam under store.js.
// Proves store.js runs on an INJECTED backend (no chrome.storage), which is the
// path a non-extension host like the planned PWA takes. `node tools/test_backend.mjs`.
import { webcrypto } from 'node:crypto';

// Deliberately do NOT define globalThis.chrome: this test asserts the seam works
// with no chrome present, exactly as it would in a PWA / plain web page.
try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

// A minimal in-memory backend, the same shape a PWA's IndexedDB adapter fills.
let mem = {};
const memoryBackend = {
  async get(key) {
    return mem[key];
  },
  async set(key, value) {
    // Store a structured clone so callers can't mutate persisted state in place
    // (mirrors real backends, which serialize on write).
    mem[key] = structuredClone(value);
  },
  async remove(key) {
    delete mem[key];
  },
};

const { setBackend, backend } = await import('../lib/backend.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('backend() with nothing configured:');
{
  let threw = false;
  try {
    backend();
  } catch {
    threw = true;
  }
  assert(threw, 'throws a clear error when no backend is set (no chrome, no inject)');
}

// Inject the in-memory backend, then load store.js on top of it.
setBackend(memoryBackend);
const store = await import('../lib/store.js');

console.log('\nstore.js runs on the injected backend:');
{
  mem = {};
  const col = await store.createCollection('Injected');
  assert(!!col && col.title === 'Injected', 'createCollection returns a collection');
  assert('collectionsData' in mem, 'the write landed in the injected backend, not chrome');

  const data = await store.getData();
  assert(data.collections.length === 1, 'getData reads it back through the seam');
  assert(data.version === 3, 'schema/migrate still applies on the injected backend');

  await store.addItem(col.id, { type: 'page', url: 'https://ex.com', title: 'Ex' });
  const after = await store.getData();
  assert(after.collections[0].items.length === 1, 'addItem persists through the seam');
}

console.log('\nsettings + history route through the seam too:');
{
  mem = {};
  await store.setSettings({ theme: 'light' });
  assert(mem.collectionsSettings?.theme === 'light', 'setSettings writes to the injected backend');
  const s = await store.getSettings();
  assert(s.theme === 'light' && s.readingListEnabled === true, 'getSettings merges defaults over stored patch');

  await store.setData({ collections: [], activeCollectionId: null });
  await store.snapshotHistory(0);
  assert(Array.isArray(mem.collectionsHistory) && mem.collectionsHistory.length === 1, 'snapshotHistory writes through the seam');
}

console.log('\nswapping the backend redirects subsequent reads/writes:');
{
  let mem2 = {};
  setBackend({
    async get(k) {
      return mem2[k];
    },
    async set(k, v) {
      mem2[k] = v;
    },
    async remove(k) {
      delete mem2[k];
    },
  });
  await store.createCollection('SecondBackend');
  assert('collectionsData' in mem2, 'writes now land in the swapped-in backend');
  const d = await store.getData();
  assert(d.collections[0].title === 'SecondBackend', 'reads come from the swapped-in backend');
}

console.log(failures ? `\n${failures} FAILED` : '\nAll backend.js tests passed.');
process.exit(failures ? 1 : 0);
