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
  assert(data.version === 3, 'bumps version to 3');
  assert(Array.isArray(data.archive) && Array.isArray(data.trash), 'backfills archive + trash arrays');
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

console.log('\narchive / unarchive:');
{
  reset();
  const a = await store.createCollection('Keep');
  const b = await store.createCollection('Stash');
  await store.archiveCollection(b.id);
  let data = await store.getData();
  assert(data.collections.length === 1 && data.collections[0].id === a.id, 'archived collection leaves the active list');
  assert(data.archive.length === 1 && data.archive[0].id === b.id && data.archive[0].archivedAt, 'archive holds it with a timestamp');

  await store.unarchiveCollection(b.id);
  data = await store.getData();
  assert(data.archive.length === 0, 'unarchive empties the archive entry');
  assert(data.collections.some((c) => c.id === b.id), 'unarchived collection returns to the active list');
  assert(data.collections.find((c) => c.id === b.id).parentId === null, 'restored collection lands at top level');
}

console.log('\ntrash collection + restore:');
{
  reset();
  const a = await store.createCollection('First');
  const b = await store.createCollection('Second'); // unshift → index 0
  const entryId = await store.trashCollection(a.id);
  let data = await store.getData();
  assert(data.collections.length === 1 && !data.collections.some((c) => c.id === a.id), 'trashed collection leaves the active list');
  assert(data.trash.length === 1 && data.trash[0].kind === 'collection', 'trash holds a collection entry');

  await store.restoreFromTrash(entryId);
  data = await store.getData();
  assert(data.trash.length === 0, 'restore removes the trash entry');
  assert(data.collections.some((c) => c.id === a.id), 'restored collection is back in the active list');
}

console.log('\ntrash folder + restore re-adopts children:');
{
  reset();
  const c = await store.createCollection('Child');
  const folder = await store.createFolder('Work');
  await store.setParent(c.id, folder.id);
  const entryId = await store.trashFolder(folder.id);
  let data = await store.getData();
  assert(data.folders.length === 0, 'folder removed from the active list');
  assert(data.collections[0].parentId === null, 'child collection falls back to top level');
  assert(data.trash.length === 1 && data.trash[0].kind === 'folder' && data.trash[0].childIds.includes(c.id), 'trash entry remembers its children');

  await store.restoreFromTrash(entryId);
  data = await store.getData();
  assert(data.folders.length === 1 && data.folders[0].id === folder.id, 'folder restored');
  assert(data.collections[0].parentId === folder.id, 'child re-adopted into the restored folder');
}

console.log('\nempty trash / delete entry / auto-purge:');
{
  reset();
  const a = await store.createCollection('A');
  const b = await store.createCollection('B');
  const idA = await store.trashCollection(a.id);
  await store.trashCollection(b.id);
  await store.deleteTrashEntry(idA);
  let data = await store.getData();
  assert(data.trash.length === 1, 'deleteTrashEntry removes just the one entry');
  await store.emptyTrash();
  data = await store.getData();
  assert(data.trash.length === 0, 'emptyTrash clears everything');

  // Seed a 40-day-old trash entry directly; migrate should drop it on read.
  const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
  mem.collectionsData = {
    version: 3,
    activeCollectionId: null,
    collections: [],
    folders: [],
    archive: [],
    trash: [
      { id: 't-old', kind: 'collection', deletedAt: old, origIndex: 0, collection: { id: 'x', title: 'Old', items: [] } },
      { id: 't-new', kind: 'collection', deletedAt: Date.now(), origIndex: 0, collection: { id: 'y', title: 'New', items: [] } },
    ],
  };
  data = await store.getData();
  assert(data.trash.length === 1 && data.trash[0].id === 't-new', 'entries older than 30 days are purged on read');
}

console.log('\nhighlight item type:');
{
  reset();
  const c = await store.createCollection('Research');
  const h = await store.addItem(c.id, {
    type: 'highlight', text: 'a quoted passage', url: 'https://ex.com/src', title: 'Source', note: 'why it matters',
  });
  assert(h.item.type === 'highlight', 'creates a highlight item');
  assert(h.item.text === 'a quoted passage' && h.item.url === 'https://ex.com/src', 'keeps quote + source url');
  assert(h.item.title === 'Source' && h.item.note === 'why it matters', 'keeps source title + annotation');
  assert(!('fields' in h.item), 'highlights carry no custom fields');

  // Round-trips through migration intact.
  const data = await store.getData();
  const back = data.collections[0].items[0];
  assert(back.type === 'highlight' && back.text === 'a quoted passage', 'survives migrate on read');
}

console.log('\nread-later (unread) state:');
{
  reset();
  const c = await store.createCollection('Reading');
  const saved = await store.addItem(c.id, { type: 'page', url: 'https://ex.com/a', title: 'A', unread: true });
  const imported = await store.addItem(c.id, { type: 'page', url: 'https://ex.com/b', title: 'B' });
  await store.addItem(c.id, { type: 'note', text: 'hi' });
  assert(saved.item.unread === true, 'page saved with unread:true is unread');
  assert(imported.item.unread === false, 'page added without unread defaults to read (imports do not flood)');

  let data = await store.getData();
  const legacy = data.collections[0].items.find((it) => it.title === 'A');
  assert(typeof legacy.unread === 'boolean', 'unread normalized to a boolean on read');

  const cleared = await store.markAllRead();
  assert(cleared === 1, 'markAllRead clears exactly the unread pages');
  data = await store.getData();
  assert(data.collections[0].items.every((it) => !it.unread), 'nothing is unread after markAllRead');
  assert((await store.markAllRead()) === 0, 'markAllRead is a no-op when all read');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
