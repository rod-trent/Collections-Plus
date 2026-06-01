// Tests for lib/store.js — runs under Node by mocking chrome.storage.local.
// `node tools/test_store.mjs`. Exits non-zero on the first failed assertion.
import { webcrypto } from 'node:crypto';

// --- Mocks: must exist before importing store.js (dynamic import below) ------
let mem = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in mem ? { [key]: mem[key] } : {}),
      set: async (obj) => {
        Object.assign(mem, obj);
      },
    },
  },
};
try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

const store = await import('../lib/store.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
function reset() {
  mem = {};
}

console.log('migrate (v1 → v2 backfill):');
{
  reset();
  // Seed a v1-shaped payload directly, then read it back through getData().
  mem.collectionsData = {
    version: 1,
    activeCollectionId: 'c1',
    collections: [
      { id: 'c1', title: 'Old', items: [{ id: 'i1', type: 'page', url: 'https://ex.com' }] },
    ],
  };
  const data = await store.getData();
  const c = data.collections[0];
  assert(data.version === 2, 'bumps version to 2');
  assert(c.pinned === false && Array.isArray(c.tags) && c.parentId === null, 'collection gets pinned/tags/parentId');
  assert(c.items[0].done === false && typeof c.items[0].fields === 'object', 'page item gets done/fields');
}

console.log('\ncreateCollection / addItem defaults:');
{
  reset();
  const col = await store.createCollection('Parts');
  assert(col.pinned === false && col.tags.length === 0 && col.parentId === null, 'new collection has v2 defaults');
  const { item } = await store.addItem(col.id, { type: 'page', url: 'https://ex.com/a', title: 'A' });
  assert(item.done === false && typeof item.fields === 'object', 'new page item has done + fields');
}

console.log('\ntoggleDone / custom fields:');
{
  reset();
  const col = await store.createCollection('Shopping');
  const { item } = await store.addItem(col.id, { type: 'page', url: 'https://ex.com/x', title: 'X' });
  await store.toggleDone(col.id, item.id);
  let data = await store.getData();
  assert(data.collections[0].items[0].done === true, 'toggleDone flips to true');
  await store.updateItem(col.id, item.id, { fields: { price: '9.99', qty: '2' } });
  data = await store.getData();
  assert(data.collections[0].items[0].fields.price === '9.99', 'custom fields persist via updateItem');
}

console.log('\nmove / copy / remove items:');
{
  reset();
  const a = await store.createCollection('A');
  const b = await store.createCollection('B');
  const { item: i1 } = await store.addItem(a.id, { type: 'page', url: 'https://ex.com/1', title: '1' });
  const { item: i2 } = await store.addItem(a.id, { type: 'page', url: 'https://ex.com/2', title: '2' });

  await store.copyItems(a.id, [i1.id], b.id);
  let data = await store.getData();
  let A = data.collections.find((c) => c.id === a.id);
  let B = data.collections.find((c) => c.id === b.id);
  assert(A.items.length === 2 && B.items.length === 1, 'copy leaves source intact, adds to target');
  assert(B.items[0].id !== i1.id, 'copied item gets a fresh id');

  await store.moveItems(a.id, [i2.id], b.id);
  data = await store.getData();
  A = data.collections.find((c) => c.id === a.id);
  B = data.collections.find((c) => c.id === b.id);
  assert(A.items.length === 1 && B.items.length === 2, 'move removes from source, adds to target');

  await store.removeItems(a.id, [i1.id]);
  data = await store.getData();
  A = data.collections.find((c) => c.id === a.id);
  assert(A.items.length === 0, 'removeItems clears the listed ids');
}

console.log('\npin / tags / dedupe:');
{
  reset();
  const c = await store.createCollection('Tagged');
  await store.setPinned(c.id, true);
  await store.setTags(c.id, [' work ', 'work', 'read', '']);
  const data = await store.getData();
  const col = data.collections[0];
  assert(col.pinned === true, 'setPinned sticks');
  assert(col.tags.length === 2 && col.tags.includes('work') && col.tags.includes('read'), 'tags trimmed + de-duped + non-empty');

  await store.addItem(c.id, { type: 'page', url: 'https://dup.com', title: 'Dup' });
  const hit = await store.findPageByUrl(c.id, 'https://dup.com');
  const miss = await store.findPageByUrl(c.id, 'https://nope.com');
  assert(hit && !miss, 'findPageByUrl matches existing URL only');
}

console.log('\nfolders:');
{
  reset();
  const a = await store.createCollection('A');
  const folder = await store.createFolder('Work');
  await store.setParent(a.id, folder.id);
  let data = await store.getData();
  assert(data.folders.length === 1 && data.folders[0].name === 'Work', 'folder created');
  assert(data.collections[0].parentId === folder.id, 'collection assigned to folder');

  await store.toggleFolder(folder.id);
  data = await store.getData();
  assert(data.folders[0].collapsed === true, 'toggleFolder flips collapsed');

  await store.removeFolder(folder.id);
  data = await store.getData();
  assert(data.folders.length === 0, 'removeFolder deletes the folder');
  assert(data.collections[0].parentId === null, 'orphaned collection falls back to top level');
}

console.log('\nmigrate (dangling parentId):');
{
  reset();
  mem.collectionsData = {
    version: 2,
    activeCollectionId: 'c1',
    folders: [],
    collections: [{ id: 'c1', title: 'X', parentId: 'ghost', items: [] }],
  };
  const data = await store.getData();
  assert(data.collections[0].parentId === null, 'parentId pointing at a missing folder is cleared');
}

console.log('\nhistory:');
{
  reset();
  await store.createCollection('Snap me');
  await store.snapshotHistory(0); // force
  const hist = await store.getHistory();
  assert(hist.length === 1 && hist[0].collections === 1, 'snapshot recorded');
  await store.createCollection('Another');
  await store.restoreHistory(hist[0].at);
  const data = await store.getData();
  assert(data.collections.length === 1, 'restore brings back the snapshot state');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
