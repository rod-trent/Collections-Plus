// Tests for lib/merge.js — item-level sync merge — plus the version stamps and
// tombstones store.js records for it. Simulates two devices by swapping the
// in-memory backend between them and "syncing" with mergeData().
// `node tools/test_merge.mjs`. Exits non-zero if any assertion fails.
import { webcrypto } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

// A strictly increasing clock, so "later" edits always carry a later stamp
// (real edits are milliseconds apart; tests run faster than that).
let clock = 1_800_000_000_000;
Date.now = () => ++clock;

// Two devices, each with its own storage, behind one injected backend.
const devices = { A: {}, B: {} };
let mem = devices.A;
const { setBackend } = await import('../lib/backend.js');
setBackend({
  async get(key) {
    return structuredClone(mem[key]);
  },
  async set(key, value) {
    mem[key] = structuredClone(value);
  },
  async remove(key) {
    delete mem[key];
  },
});
const store = await import('../lib/store.js');
const { mergeData } = await import('../lib/merge.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

/** Run `fn` against device `name`'s storage. */
async function on(name, fn) {
  mem = devices[name];
  return fn();
}
/** Sync both ways: merge A with B and give both devices the result. */
async function sync() {
  const a = await on('A', store.getData);
  const b = await on('B', store.getData);
  const merged = mergeData(a, b);
  await on('A', () => store.setData(structuredClone(merged)));
  await on('B', () => store.setData(structuredClone(mergeData(b, a))));
  return merged;
}
/** Fresh devices that share one starting library. */
async function seed() {
  devices.A = {};
  devices.B = {};
  mem = devices.A;
  const col = await store.createCollection('Reading');
  const { item: i1 } = await store.addItem(col.id, { type: 'page', url: 'https://one.example', title: 'One' });
  const { item: i2 } = await store.addItem(col.id, { type: 'page', url: 'https://two.example', title: 'Two' });
  devices.B = structuredClone(devices.A);
  return { col, i1, i2 };
}
const items = (d, colId) => (d.collections.find((c) => c.id === colId)?.items || []);
const titles = (d, colId) => items(d, colId).map((it) => it.title);
const json = (v) => JSON.stringify(v);

console.log('migrate v3 → v4 (sync stamps):');
{
  devices.A = {
    collectionsData: {
      version: 3,
      collections: [
        { id: 'c1', title: 'Old', updatedAt: 500, items: [{ id: 'i1', type: 'page', url: 'https://x', addedAt: 400 }] },
      ],
      folders: [{ id: 'f1', name: 'F' }],
    },
  };
  const d = await on('A', store.getData);
  assert(d.version === 4, 'bumps version to 4');
  assert(d.collections[0].metaAt === 500, 'collection metaAt backfills from updatedAt');
  assert(d.collections[0].items[0].lastModified === 400, 'item lastModified backfills from addedAt');
  assert(d.folders[0].lastModified === 0, 'folder lastModified backfills to 0');
  assert(Array.isArray(d.tombstones) && d.tombstones.length === 0, 'adds an empty tombstone log');
}

console.log('\nstore records stamps and tombstones:');
{
  const { col, i1, i2 } = await seed();
  await on('A', async () => {
    const before = (await store.getData()).collections[0];
    await store.updateItem(col.id, i1.id, { note: 'hi' });
    const after = (await store.getData()).collections[0];
    assert(after.items[0].lastModified > before.items[0].lastModified, 'updateItem bumps item lastModified');
    assert(after.metaAt === before.metaAt, 'item edits do not bump collection metaAt');
    await store.renameCollection(col.id, 'Renamed');
    assert((await store.getData()).collections[0].metaAt > after.metaAt, 'rename bumps collection metaAt');

    await store.removeItem(col.id, i2.id);
    let d = await store.getData();
    assert(d.tombstones.some((t) => t.scope === 'item' && t.id === i2.id), 'removeItem leaves an item tombstone');
    const stampBefore = i2.lastModified;
    await store.insertItem(col.id, i2, 1); // undo
    d = await store.getData();
    assert(!d.tombstones.some((t) => t.id === i2.id), 'undo (insertItem) clears the tombstone');
    assert(items(d, col.id).find((it) => it.id === i2.id).lastModified > stampBefore, 'undo re-stamps the item');

    const rule = await store.addRule({ type: 'domain', value: 'x.com', collectionId: col.id });
    await store.removeRule(rule.id);
    d = await store.getData();
    assert(d.tombstones.some((t) => t.scope === 'rule' && t.id === rule.id), 'removeRule leaves a rule tombstone');
  });
}

console.log('\nconcurrent edits on two devices:');
{
  const { col, i1, i2 } = await seed();
  await on('A', () => store.addItem(col.id, { type: 'page', url: 'https://a.example', title: 'From A' }));
  await on('B', () => store.addItem(col.id, { type: 'page', url: 'https://b.example', title: 'From B' }));
  const m = await sync();
  assert(json(titles(m, col.id).sort()) === json(['From A', 'From B', 'One', 'Two']), 'adds on both sides are kept (no clobber)');

  await on('A', () => store.renameCollection(col.id, 'Renamed on A'));
  await on('B', () => store.addItem(col.id, { type: 'note', text: 'note from B' }));
  const m2 = await sync();
  const c2 = m2.collections.find((c) => c.id === col.id);
  assert(c2.title === 'Renamed on A', 'a rename on one device survives…');
  assert(c2.items.some((it) => it.text === 'note from B'), '…an item added on the other');
  const onB = (await on('B', store.getData)).collections.find((c) => c.id === col.id);
  assert(onB.title === 'Renamed on A', 'the rename reaches the other device too');

  await on('A', () => store.updateItem(col.id, i1.id, { title: 'A edit' }));
  await on('B', () => store.updateItem(col.id, i1.id, { title: 'B edit (later)' }));
  const m3 = await sync();
  assert(items(m3, col.id).find((it) => it.id === i1.id).title === 'B edit (later)', 'same item edited twice: newer edit wins');

  await on('A', () => store.toggleDone(col.id, i2.id, true));
  await on('B', () => store.updateItem(col.id, i1.id, { note: 'B note' }));
  const m4 = await sync();
  assert(items(m4, col.id).find((it) => it.id === i2.id).done === true, 'edits to different items both land (done flag)');
  assert(items(m4, col.id).find((it) => it.id === i1.id).note === 'B note', 'edits to different items both land (note)');

  const a = await on('A', store.getData);
  const b = await on('B', store.getData);
  assert(json(a.collections) === json(b.collections), 'both devices converge to the same library');
}

console.log('\ndeletes:');
{
  const { col, i1, i2 } = await seed();
  await on('A', () => store.removeItem(col.id, i1.id));
  await on('B', () => store.addItem(col.id, { type: 'page', url: 'https://new.example', title: 'New' }));
  const m = await sync();
  assert(json(titles(m, col.id)) === json(['Two', 'New']), 'item deleted on A stays deleted (B never resurrects it)');

  await on('A', () => store.removeItem(col.id, i2.id));
  await on('B', () => store.updateItem(col.id, i2.id, { note: 'edited after the delete' }));
  const m2 = await sync();
  assert(items(m2, col.id).some((it) => it.id === i2.id), 'an edit made after the delete brings the item back');

  const { col: c3 } = await seed();
  await on('A', async () => {
    const entry = await store.trashCollection(c3.id);
    await store.deleteTrashEntry(entry); // permanent delete
  });
  const m3 = await sync();
  const anywhere = [...m3.collections, ...m3.archive, ...m3.trash.map((e) => e.collection)];
  assert(!anywhere.some((c) => c?.id === c3.id), 'permanently deleted collection is gone on both devices');
}

console.log('\nmoves, archive and trash travel:');
{
  const { col, i1 } = await seed();
  const other = await on('A', () => store.createCollection('Other'));
  devices.B = structuredClone(devices.A);
  await on('A', () => store.moveItems(col.id, [i1.id], other.id));
  const m = await sync();
  assert(!items(m, col.id).some((it) => it.id === i1.id), 'moved item leaves its old collection…');
  assert(items(m, other.id).some((it) => it.id === i1.id), '…and appears once in the new one');

  await on('A', () => store.archiveCollection(other.id));
  await on('B', () => store.addItem(col.id, { type: 'note', text: 'unrelated' }));
  const m2 = await sync();
  assert(m2.archive.some((c) => c.id === other.id) && !m2.collections.some((c) => c.id === other.id), 'archiving syncs');

  await on('A', () => store.trashCollection(col.id));
  const m3 = await sync();
  const entry = m3.trash.find((e) => e.collection?.id === col.id);
  assert(!!entry && !m3.collections.some((c) => c.id === col.id), 'trashing syncs');
  assert(entry.collection.items.some((it) => it.text === 'unrelated'), 'trashed collection keeps its items');
}

console.log('\nfolders and rules:');
{
  const { col } = await seed();
  const f = await on('A', () => store.createFolder('Work'));
  const rule = await on('A', () => store.addRule({ type: 'domain', value: 'a.com', collectionId: col.id }));
  await sync();
  await on('B', () => store.renameFolder(f.id, 'Work (B)'));
  await on('A', () => store.addRule({ type: 'domain', value: 'b.com', collectionId: col.id }));
  await on('A', () => store.removeRule(rule.id));
  const m = await sync();
  assert(m.folders.find((x) => x.id === f.id)?.name === 'Work (B)', 'folder rename syncs');
  assert(json(m.rules.map((r) => r.value)) === json(['b.com']), 'rule add + remove sync');

  await on('B', () => store.removeFolder(f.id));
  const m2 = await sync();
  assert(!m2.folders.some((x) => x.id === f.id), 'folder delete syncs');
}

console.log('\nbackground work does not overrule real edits:');
{
  const { col, i1 } = await seed();
  await on('A', () => store.updateItem(col.id, i1.id, { note: 'real edit on A' }));
  await on('B', () =>
    store.applyLinkResults([{ collectionId: col.id, itemId: i1.id, linkStatus: 'dead', linkCheckedAt: Date.now() }])
  );
  await on('B', () => store.applyImageResults([{ collectionId: col.id, itemId: i1.id, thumbnail: 'data:image/png;base64,AA' }]));
  const m = await sync();
  const it = items(m, col.id).find((x) => x.id === i1.id);
  assert(it.note === 'real edit on A', "the user's edit wins…");
  assert(it.linkStatus === 'dead', '…and the link check from B still lands');
  assert(it.thumbnail === 'data:image/png;base64,AA', '…and so does the fetched thumbnail');
}

console.log('\nreplace / restore survive a sync:');
{
  const { col } = await seed();
  const backupJson = await on('A', store.exportJSON);
  await on('A', () => store.addItem(col.id, { type: 'page', url: 'https://later.example', title: 'Later' }));
  await sync(); // B now has "Later" too
  await on('A', () => store.importJSON(backupJson, 'replace'));
  const m = await sync();
  assert(!m.collections.some((c) => c.items.some((it) => it.title === 'Later')), 'Import → Replace is not undone by the other device');
}

console.log('\nmerge properties:');
{
  const { col } = await seed();
  await on('A', () => store.addItem(col.id, { type: 'note', text: 'a' }));
  await on('B', () => store.addItem(col.id, { type: 'note', text: 'b' }));
  const a = await on('A', store.getData);
  const b = await on('B', store.getData);
  const m = mergeData(a, b);
  assert(json(mergeData(m, m)) === json(m), 'idempotent: merge(x, x) == x');
  assert(json(mergeData(m, b)) === json(m), 'absorbing: re-merging an older side changes nothing');
  const ids = (d) => d.collections.flatMap((c) => c.items.map((it) => it.id)).sort();
  assert(json(ids(mergeData(a, b))) === json(ids(mergeData(b, a))), 'commutative in content');
  const aCopy = json(a);
  mergeData(a, b);
  assert(json(a) === aCopy, 'inputs are not mutated');
  assert(json(mergeData(a, null).collections) === json(a.collections), 'merging with nothing (first sync) keeps local');
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll merge tests passed.');
