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
  assert(data.folders[0].color === null, 'new folder has no color');

  await store.setFolderColor(folder.id, '#8b5cf6');
  data = await store.getData();
  assert(data.folders[0].color === '#8b5cf6', 'setFolderColor stores a valid hex');
  await store.setFolderColor(folder.id, 'red'); // invalid → cleared
  data = await store.getData();
  assert(data.folders[0].color === null, 'setFolderColor rejects a non-hex value');

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

console.log('\nauto-file rules:');
{
  reset();
  const c = await store.createCollection('Videos');
  const rule = await store.addRule({ type: 'domain', value: 'youtube.com', collectionId: c.id });
  assert(rule && rule.id, 'addRule returns a rule with an id');
  let data = await store.getData();
  assert(data.rules.length === 1 && data.rules[0].value === 'youtube.com', 'rule persisted');
  assert((await store.addRule({ type: 'bogus', value: 'x', collectionId: c.id })) === null, 'rejects an unknown rule type');

  // A rule whose target collection is removed is pruned on read.
  await store.removeCollection(c.id);
  data = await store.getData();
  assert(data.rules.length === 0, 'rules pointing at a deleted collection are pruned');
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

console.log('\nmanual order (folders + collections interleave):');
{
  reset();
  // Seed two top-level collections and one folder with a child, no order fields.
  mem.collectionsData = {
    version: 3,
    collections: [
      { id: 'a', title: 'A', items: [] },
      { id: 'b', title: 'B', items: [] },
      { id: 'child', title: 'Child', parentId: 'f1', items: [] },
    ],
    folders: [{ id: 'f1', name: 'Folder' }],
  };
  let data = await store.getData();
  const ord = (id) =>
    (data.collections.find((c) => c.id === id) || data.folders.find((f) => f.id === id)).order;
  // First upgrade lays out top collections, then folders: A=0, B=1, folder=2.
  assert(ord('a') === 0 && ord('b') === 1, 'top-level collections get initial order 0,1');
  assert(ord('f1') === 2, 'folder ordered after top-level collections');
  assert(ord('child') === 0, 'child collection gets per-folder order 0');

  // Interleave: put folder between A and B, and move `child` to top level after B.
  await store.saveArrangement([
    { kind: 'collection', id: 'a', parentId: '', order: 0 },
    { kind: 'folder', id: 'f1', order: 1 },
    { kind: 'collection', id: 'b', parentId: '', order: 2 },
    { kind: 'collection', id: 'child', parentId: '', order: 3 },
  ]);
  data = await store.getData();
  assert(ord('f1') === 1 && ord('b') === 2, 'saveArrangement interleaves folder between A and B');
  const child = data.collections.find((c) => c.id === 'child');
  assert(child.parentId === null && child.order === 3, 'saveArrangement re-parents child to top level');
}

console.log('\ncreateFolder / setParent ordering:');
{
  reset();
  await store.createCollection('First'); // order -1 (front)
  const folder = await store.createFolder('Box');
  let data = await store.getData();
  const f = data.folders.find((x) => x.id === folder.id);
  const first = data.collections.find((c) => c.title === 'First');
  assert(f.order > first.order, 'new folder appends after existing top-level items');

  await store.setParent(first.id, folder.id);
  data = await store.getData();
  const moved = data.collections.find((c) => c.id === first.id);
  assert(moved.parentId === folder.id && moved.order === 0, 'setParent lands child at end of empty folder (order 0)');

  await store.removeFolder(folder.id);
  data = await store.getData();
  const orphan = data.collections.find((c) => c.id === first.id);
  assert(orphan.parentId === null && typeof orphan.order === 'number', 'removeFolder orphans child back to top level with an order');
}

console.log('\nsubcollections: create / setParent / cycles:');
{
  reset();
  const top = await store.createCollection('Top');
  const a = await store.createSubCollection(top.id, 'A');
  const b = await store.createSubCollection(top.id, 'B');
  const deep = await store.createSubCollection(a.id, 'Deep');
  let data = await store.getData();
  assert(a.parentId === top.id && a.order === 0 && b.order === 1, 'subcollections nest under parent in order');
  assert(data.activeCollectionId === deep.id, 'new subcollection becomes active');
  assert(store.childCollections(data, top.id).length === 2, 'childCollections lists direct children');
  const desc = store.descendantIds(data, top.id);
  assert(desc.length === 3 && desc.includes(deep.id), 'descendantIds reaches every depth');
  assert(
    store.collectionPath(data, deep.id).map((c) => c.title).join('/') === 'Top/A',
    'collectionPath lists ancestors outermost first'
  );
  assert((await store.createSubCollection('nope', 'X')) === null, 'createSubCollection rejects a missing parent');

  assert((await store.setParent(top.id, deep.id)) === false, 'cannot nest a collection inside its own descendant');
  assert((await store.setParent(a.id, a.id)) === false, 'cannot nest a collection inside itself');
  data = await store.getData();
  assert(data.collections.find((c) => c.id === top.id).parentId === null, 'refused move leaves parent unchanged');

  assert((await store.setParent(deep.id, b.id)) === true, 'can move a subcollection to another parent');
  const folder = await store.createFolder('F');
  await store.setParent(a.id, folder.id);
  data = await store.getData();
  assert(data.collections.find((c) => c.id === deep.id).parentId === b.id, 'moved subcollection re-parented');
  assert(data.collections.find((c) => c.id === a.id).parentId === folder.id, 'subcollection can move out to a folder');

  // A list drag (e.g. from search results) must not un-nest a subcollection.
  await store.saveArrangement([{ kind: 'collection', id: deep.id, parentId: '', order: 0 }]);
  data = await store.getData();
  assert(data.collections.find((c) => c.id === deep.id).parentId === b.id, 'saveArrangement keeps subcollections nested');
}

console.log('\nmigrate (subcollection parents):');
{
  reset();
  mem.collectionsData = {
    version: 3,
    collections: [
      { id: 'p', title: 'P', items: [] },
      { id: 'k', title: 'K', parentId: 'p', items: [] },
      { id: 'gone', title: 'Dangling', parentId: 'missing', items: [] },
      { id: 'x', title: 'X', parentId: 'y', items: [] },
      { id: 'y', title: 'Y', parentId: 'x', items: [] },
    ],
  };
  const data = await store.getData();
  const by = (id) => data.collections.find((c) => c.id === id);
  assert(by('k').parentId === 'p', 'keeps a parentId that points at a live collection');
  assert(by('gone').parentId === null, 'drops a parentId that points nowhere');
  assert(!(by('x').parentId === 'y' && by('y').parentId === 'x'), 'breaks a parent cycle');
  assert(typeof by('k').order === 'number', 'backfills order for subcollections');
}

console.log('\nsubcollections: archive / unarchive:');
{
  reset();
  const top = await store.createCollection('Top');
  const a = await store.createSubCollection(top.id, 'A');
  const deep = await store.createSubCollection(a.id, 'Deep');
  await store.archiveCollection(top.id);
  let data = await store.getData();
  assert(data.collections.length === 0 && data.archive.length === 3, 'archiving a parent takes the whole subtree');
  assert(data.archive.filter((c) => store.isTopBinEntry(data, c)).length === 1, 'archive lists only the parent');
  assert(store.binSubtreeCount(data, data.archive.find((c) => c.id === top.id), false) === 2, 'archive row counts subcollections');
  await store.unarchiveCollection(top.id);
  data = await store.getData();
  const by = (id) => data.collections.find((c) => c.id === id);
  assert(data.archive.length === 0 && data.collections.length === 3, 'unarchive restores the whole subtree');
  assert(by(a.id).parentId === top.id && by(deep.id).parentId === a.id, 'nesting survives archive round-trip');
  assert(!('archivedWith' in by(a.id)) && !('archivedAt' in by(a.id)), 'archive markers cleared on restore');

  // A subcollection archived on its own comes back under its live parent.
  await store.archiveCollection(a.id);
  data = await store.getData();
  assert(data.collections.length === 1 && data.archive.length === 2, 'archiving a subcollection takes its children');
  await store.unarchiveCollection(a.id);
  data = await store.getData();
  assert(data.collections.find((c) => c.id === a.id)?.parentId === top.id, 'restored subcollection returns to its parent');
}

console.log('\nsubcollections: trash / restore / delete:');
{
  reset();
  const top = await store.createCollection('Top');
  const a = await store.createSubCollection(top.id, 'A');
  await store.createSubCollection(a.id, 'Deep');
  const entryId = await store.trashCollection(top.id);
  let data = await store.getData();
  assert(data.collections.length === 0 && data.trash.length === 3, 'trashing a parent takes the whole subtree');
  const shown = data.trash.filter((e) => store.isTopBinEntry(data, e));
  assert(shown.length === 1 && shown[0].id === entryId, 'trash lists only the parent entry');
  assert(store.binSubtreeCount(data, shown[0], true) === 2, 'trash row counts subcollections');

  await store.restoreFromTrash(entryId);
  data = await store.getData();
  assert(data.trash.length === 0 && data.collections.length === 3, 'restore brings back the subtree');
  assert(data.collections.find((c) => c.id === a.id).parentId === top.id, 'nesting survives trash round-trip');

  const again = await store.trashCollection(top.id);
  await store.deleteTrashEntry(again);
  data = await store.getData();
  assert(data.trash.length === 0, 'permanently deleting a parent deletes its subcollections');

  // Removing a parent trashed-with entry leaves orphans visible and restorable.
  reset();
  const p = await store.createCollection('P');
  const kid = await store.createSubCollection(p.id, 'Kid');
  await store.trashCollection(p.id);
  data = await store.getData();
  data.trash = data.trash.filter((e) => e.collection.id !== p.id);
  await store.setData(data);
  data = await store.getData();
  const orphan = data.trash.find((e) => e.collection.id === kid.id);
  assert(store.isTopBinEntry(data, orphan), 'orphaned subcollection entry becomes visible');
  await store.restoreFromTrash(orphan.id);
  data = await store.getData();
  assert(data.collections.find((c) => c.id === kid.id)?.parentId === null, 'orphan restores to top level');
}

console.log('\nsubcollections: folders + import:');
{
  reset();
  const folder = await store.createFolder('F');
  const top = await store.createCollection('Top');
  await store.setParent(top.id, folder.id);
  const kid = await store.createSubCollection(top.id, 'Kid');
  await store.trashFolder(folder.id);
  let data = await store.getData();
  assert(data.collections.find((c) => c.id === kid.id).parentId === top.id, 'trashing a folder leaves subcollections nested');

  const json = await store.exportJSON();
  await store.importJSON(json, 'merge');
  data = await store.getData();
  const tops = data.collections.filter((c) => c.title === 'Top');
  const kids = data.collections.filter((c) => c.title === 'Kid');
  assert(tops.length === 2 && kids.length === 2, 'merge import appends copies');
  const imported = kids.find((c) => c.id !== kid.id);
  const importedTop = tops.find((c) => c.id !== top.id);
  assert(imported.parentId === importedTop.id, 'merge import keeps subcollections under the re-id’d parent');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
