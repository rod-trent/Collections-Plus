// Tests for lib/sync.js — file sync with item-level merge. File System Access
// and IndexedDB don't exist in Node, so this fakes them: one shared "cloud" file
// and two devices, each with its own chrome.storage.local and IndexedDB.
// `node tools/test_sync.mjs`. Exits non-zero if any assertion fails.
import { webcrypto } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}
let clock = 1_800_000_000_000;
Date.now = () => ++clock;

// ---- Fakes -----------------------------------------------------------------

// The one file both devices see (the cloud client keeps it in step).
const cloud = { text: '', mtime: 0 };
const handle = {
  name: 'collections-sync.json',
  queryPermission: async () => 'granted',
  requestPermission: async () => 'granted',
  getFile: async () => ({ lastModified: cloud.mtime, text: async () => cloud.text }),
  createWritable: async () => {
    let buf = '';
    return {
      write: async (t) => {
        buf += t;
      },
      close: async () => {
        cloud.text = buf;
        cloud.mtime = ++clock;
      },
    };
  },
};

function newDevice() {
  return { local: {}, idb: new Map() };
}
const devices = { A: newDevice(), B: newDevice() };
let cur = devices.A;

globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in cur.local ? { [key]: structuredClone(cur.local[key]) } : {}),
      set: async (obj) => {
        for (const [k, v] of Object.entries(obj)) cur.local[k] = structuredClone(v);
      },
      remove: async (key) => {
        delete cur.local[key];
      },
    },
  },
};

// Just enough IndexedDB for sync.js's handle store (keeps live objects).
const later = (fn) => queueMicrotask(fn);
globalThis.indexedDB = {
  open() {
    const req = {};
    const map = cur.idb;
    const store = {
      get(k) {
        const r = {};
        later(() => {
          r.result = map.get(k);
          r.onsuccess?.();
        });
        return r;
      },
      put(v, k) {
        map.set(k, v);
        later(() => tx.oncomplete?.());
      },
      delete(k) {
        map.delete(k);
        later(() => tx.oncomplete?.());
      },
    };
    const tx = { objectStore: () => store };
    const db = { transaction: () => tx, close() {}, createObjectStore() {} };
    later(() => {
      req.result = db;
      req.onsuccess?.();
    });
    return req;
  },
};
globalThis.self = globalThis;
globalThis.showSaveFilePicker = async () => handle;
globalThis.showOpenFilePicker = async () => [handle];

const store = await import('../lib/store.js');
const sync = await import('../lib/sync.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
const on = async (name, fn) => {
  cur = devices[name];
  return fn();
};
const pageTitles = async (name) =>
  on(name, async () => (await store.getData()).collections.flatMap((c) => c.items.map((it) => it.title)).sort());
const json = (v) => JSON.stringify(v);

// ---- Tests -----------------------------------------------------------------

console.log('connect two devices:');
let colId;
{
  await on('A', async () => {
    colId = (await store.createCollection('Shared')).id;
    await store.addItem(colId, { type: 'page', url: 'https://seed.example', title: 'Seed' });
    await store.addRule({ type: 'domain', value: 'seed.example', collectionId: colId });
    await sync.createFile();
    await sync.push({ interactive: true, overwrite: true });
  });
  await on('B', async () => {
    const { existing } = await sync.openFile();
    assert(existing?.collections === 1, 'B sees the existing file');
    await sync.pull({ interactive: true, force: true, mode: 'replace' });
  });
  assert(json(await pageTitles('B')) === json(['Seed']), 'B adopts the file');
  const rulesB = await on('B', async () => (await store.getData()).rules);
  assert(rulesB.length === 1 && rulesB[0].value === 'seed.example', 'auto-file rules travel through the file');
  const parsed = JSON.parse(cloud.text);
  assert(parsed.version === 4 && Array.isArray(parsed.tombstones), 'file is schema v4 with a tombstone log');
}

console.log('\nconcurrent edits never clobber:');
{
  await on('A', () => store.addItem(colId, { type: 'page', url: 'https://a.example', title: 'From A' }));
  await on('B', () => store.addItem(colId, { type: 'page', url: 'https://b.example', title: 'From B' }));
  await on('A', () => sync.push());
  // B pushes without having pulled: it must merge A's write in, not overwrite it.
  await on('B', () => sync.push());
  assert(json(await pageTitles('B')) === json(['From A', 'From B', 'Seed']), "B's push merged A's edit in locally");
  const fileTitles = JSON.parse(cloud.text).collections.flatMap((c) => c.items.map((it) => it.title)).sort();
  assert(json(fileTitles) === json(['From A', 'From B', 'Seed']), 'the file holds both edits');

  assert(await on('A', sync.hasRemoteChange), 'A notices the file changed');
  const res = await on('A', () => sync.pull());
  assert(res.applied && res.reason === 'merged', 'A merges the change in');
  assert(json(await pageTitles('A')) === json(['From A', 'From B', 'Seed']), 'both devices converge');
  assert(!(await on('A', sync.hasRemoteChange)), 'A is up to date afterwards');
}

console.log('\nun-pushed local edits survive a pull:');
{
  await on('B', () => store.addItem(colId, { type: 'note', text: 'B note' }));
  await on('B', () => sync.push());
  await on('A', () => store.addItem(colId, { type: 'page', url: 'https://a2.example', title: 'A unpushed' }));
  const res = await on('A', () => sync.pull({ mode: 'merge-only' }));
  assert(res.applied, 'pull applied with local edits pending');
  assert(res.needsPush, 'pull reports the file is missing local edits');
  const a = await on('A', store.getData);
  const items = a.collections[0].items;
  assert(items.some((it) => it.title === 'A unpushed'), 'the local edit is still there');
  assert(items.some((it) => it.text === 'B note'), "and B's edit arrived");
  await on('A', () => sync.push());
  await on('B', () => sync.pull());
  assert((await on('B', store.getData)).collections[0].items.some((it) => it.title === 'A unpushed'), "A's edit reaches B");
}

console.log('\ndeletes propagate:');
{
  const target = (await on('A', store.getData)).collections[0].items.find((it) => it.title === 'From B');
  await on('A', () => store.removeItem(colId, target.id));
  await on('A', () => sync.push());
  await on('B', () => sync.pull());
  assert(!(await pageTitles('B')).includes('From B'), 'an item deleted on A disappears on B');
  await on('B', () => sync.push());
  await on('A', () => sync.pull());
  assert(!(await pageTitles('A')).includes('From B'), "B's push doesn't bring it back");
}

console.log('\nredundant writes are skipped:');
{
  await on('A', () => sync.pull());
  await on('A', () => sync.push());
  const mtime = cloud.mtime;
  const again = await on('A', () => sync.push());
  assert(again === 0 && cloud.mtime === mtime, 'pushing unchanged data does not rewrite the file');
  await on('A', () => store.addItem(colId, { type: 'note', text: 'new' }));
  assert((await on('A', () => sync.push())) > 0, 'a real change is written');
}

console.log('\nfiles from older (pre-merge) versions:');
{
  await on('B', () => sync.pull());
  // An old extension rewrites the file: schema v3, no tombstones, one item.
  const legacy = JSON.parse(cloud.text);
  legacy.version = 3;
  delete legacy.tombstones;
  legacy.collections[0].items = legacy.collections[0].items.slice(0, 1);
  cloud.text = JSON.stringify(legacy);
  cloud.mtime = ++clock;

  await on('B', () => store.addItem(colId, { type: 'note', text: 'B pending' }));
  const res = await on('B', () => sync.pull({ mode: 'merge-only' }));
  assert(!res.applied && res.reason === 'legacy', 'with edits pending, a legacy file is left alone and reported');
  assert((await on('B', store.getData)).collections[0].items.some((it) => it.text === 'B pending'), 'local edit kept');

  const res2 = await on('A', () => sync.pull());
  assert(res2.applied && res2.reason === 'pulled', 'otherwise a legacy file replaces local data, as before');
  assert((await on('A', store.getData)).collections[0].items.length === 1, 'replace matches the legacy file');

  await on('B', () => sync.push());
  assert(JSON.parse(cloud.text).version === 4, "pushing over a legacy file writes v4 (legacy files aren't merged)");
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll sync tests passed.');
