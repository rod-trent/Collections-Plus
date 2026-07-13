// Tests for lib/backup.js — runs under Node by mocking chrome.storage.
// `node tools/test_backup.mjs`. Exits non-zero on the first failed assertion.
import { webcrypto } from 'node:crypto';

// --- Mocks: chrome.storage.local (store) + chrome.storage.sync (backup) ------
let local = {};
let sync = {};

function makeArea(mem) {
  return {
    get: async (keys) => {
      if (keys == null) return { ...mem };
      if (typeof keys === 'string') return keys in mem ? { [keys]: mem[keys] } : {};
      const out = {};
      for (const k of keys) if (k in mem) out[k] = mem[k];
      return out;
    },
    set: async (obj) => {
      Object.assign(mem, obj);
    },
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete mem[k];
    },
  };
}

globalThis.chrome = { storage: { local: makeArea(local), sync: makeArea(sync) } };
try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

const store = await import('../lib/store.js');
const backup = await import('../lib/backup.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
function reset() {
  for (const k of Object.keys(local)) delete local[k];
  for (const k of Object.keys(sync)) delete sync[k];
}

console.log('saveBackup / loadBackup round-trip:');
{
  reset();
  const col = await store.createCollection('Research');
  await store.addItem(col.id, {
    type: 'page',
    url: 'https://ex.com/a',
    title: 'A',
    note: 'keep',
    thumbnail: 'data:image/png;base64,AAAAHEAVYBYTES', // heavy — must be dropped
    favIconUrl: 'data:image/png;base64,FAV',
    snapshot: { text: 'x'.repeat(5000) },
  });
  const f = await store.createFolder('Group');
  await store.setFolderColor(f.id, '#3b82f6');

  const res = await backup.saveBackup();
  assert(res.ok === true, 'saveBackup succeeds');
  assert(res.count === 1 && res.total === 1, 'reports collection count');

  const st = await backup.backupStatus();
  assert(st.available && st.at > 0, 'status has a timestamp');

  const b = await backup.loadBackup();
  assert(b && b.collections.length === 1, 'loadBackup returns the collection');
  const it = b.collections[0].items[0];
  assert(it.url === 'https://ex.com/a' && it.title === 'A' && it.note === 'keep', 'keeps link + metadata');
  assert(!('thumbnail' in it) && !('favIconUrl' in it) && !('snapshot' in it), 'strips heavy fields');
  assert(b.folders.length === 1 && b.folders[0].color === '#3b82f6', 'keeps folder + color');
}

console.log('\nrestoreBackup into empty local storage:');
{
  // Keep the sync backup from the previous block, wipe local (simulate a reset).
  for (const k of Object.keys(local)) delete local[k];
  const before = await store.getData();
  assert(before.collections.length === 0, 'local starts empty (wiped)');

  const res = await backup.restoreBackup();
  assert(res.restored === 1, 'restoreBackup reports 1 restored');
  const after = await store.getData();
  assert(after.collections.length === 1 && after.collections[0].title === 'Research', 'collection is back');
  assert(after.folders.length === 1 && after.folders[0].color === '#3b82f6', 'folder + color restored');
  // Migrated back to a full item shape on read.
  assert(after.collections[0].items[0].type === 'page' && typeof after.collections[0].items[0].fields === 'object', 'item re-hydrated by migrate');
}

console.log('\nrestoreBackup with no backup is a no-op:');
{
  reset();
  const res = await backup.restoreBackup();
  assert(res.restored === 0, 'restores nothing when no backup exists');
  assert((await backup.loadBackup()) === null, 'loadBackup returns null');
}

console.log('\ntruncation when the library exceeds the sync quota:');
{
  reset();
  // Build far more data than ~91KB of light JSON can hold.
  for (let n = 0; n < 60; n++) {
    const c = await store.createCollection(`C${n}`);
    for (let i = 0; i < 40; i++) {
      await store.addItem(c.id, {
        type: 'page',
        url: `https://example.com/${n}/${i}/${'p'.repeat(40)}`,
        title: `Item ${n}-${i} ${'t'.repeat(40)}`,
        note: 'n'.repeat(60),
      });
    }
  }
  const res = await backup.saveBackup();
  assert(res.ok === true, 'saveBackup still succeeds');
  assert(res.truncated === true, 'flags truncation');
  assert(res.count < res.total, `keeps a subset (${res.count} of ${res.total})`);

  const b = await backup.loadBackup();
  assert(b && Array.isArray(b.collections) && b.collections.length === res.count, 'truncated backup is valid JSON and round-trips');

  // Total stored bytes stay under Chrome's ~102,400 sync cap.
  const bytes = Object.entries(sync).reduce((sum, [k, v]) => sum + k.length + JSON.stringify(v).length, 0);
  assert(bytes < 102400, `stays under the sync quota (${bytes} bytes)`);
}

console.log(failures ? `\n${failures} assertion(s) failed.` : '\nAll assertions passed.');
process.exit(failures ? 1 : 0);
