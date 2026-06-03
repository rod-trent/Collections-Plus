// sync.js — optional cross-device sync via ONE JSON file the user keeps in a
// cloud-synced folder (OneDrive, Google Drive, Dropbox, iCloud Drive…). The
// cloud client does the actual file syncing; we just read/write the file with
// the File System Access API. No account, no API keys, provider-agnostic.
//
// Reconciliation is last-write-wins on an `exportedAt` timestamp embedded in
// the file. We remember the timestamp we last reconciled with (`base`) so we
// only pull changes that came from *another* device.

import { getData, setData } from './store.js';

const DB_NAME = 'collections-sync';
const DB_STORE = 'handles';
const HANDLE_KEY = 'syncFile';
const STATE_KEY = 'collectionsSyncState'; // chrome.storage.local, NOT synced
const SUGGESTED_NAME = 'collections-sync.json';

// ---- Feature detection -----------------------------------------------------

export function supported() {
  return typeof self.showSaveFilePicker === 'function';
}

// ---- IndexedDB handle persistence ------------------------------------------
// File handles survive a reload but can't go in chrome.storage, so we stash the
// live handle object in IndexedDB (which can structured-clone it).

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(key, val) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDel(key) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getHandle() {
  return idbGet(HANDLE_KEY);
}

// ---- Reconciliation bookkeeping --------------------------------------------

async function getState() {
  const r = await chrome.storage.local.get(STATE_KEY);
  return r[STATE_KEY] || {};
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

async function getBase() {
  return (await getState()).base || 0;
}

/** Record the reconciled mtime and stamp the last successful sync time. */
async function markSynced(base) {
  await setState({ base, lastSyncAt: Date.now() });
}

// ---- Permissions -----------------------------------------------------------

async function ensurePermission(handle, mode, interactive) {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!interactive) return false; // can only prompt during a user gesture
  return (await handle.requestPermission(opts)) === 'granted';
}

// ---- File <-> data ---------------------------------------------------------

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Coerce a parsed file into a clean data blob to store locally. */
function normalize(parsed) {
  const collections = Array.isArray(parsed?.collections) ? parsed.collections : [];
  const folders = Array.isArray(parsed?.folders) ? parsed.folders : [];
  const archive = Array.isArray(parsed?.archive) ? parsed.archive : [];
  const trash = Array.isArray(parsed?.trash) ? parsed.trash : [];
  let activeCollectionId = parsed?.activeCollectionId || null;
  if (!collections.some((c) => c.id === activeCollectionId)) {
    activeCollectionId = collections[0]?.id || null;
  }
  return { activeCollectionId, collections, folders, archive, trash };
}

async function readFile(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  return safeParse(text);
}

async function writeFile(handle, stamp) {
  const data = await getData();
  const payload = JSON.stringify(
    { version: data.version, activeCollectionId: data.activeCollectionId, collections: data.collections, folders: data.folders || [], archive: data.archive || [], trash: data.trash || [], exportedAt: stamp, app: 'Collections Plus' },
    null,
    2
  );
  const writable = await handle.createWritable();
  await writable.write(payload);
  await writable.close();
}

// ---- Public API ------------------------------------------------------------

export async function status() {
  const handle = await getHandle();
  const st = await getState();
  return { connected: !!handle, name: handle?.name || '', lastSyncAt: st.lastSyncAt || 0 };
}

const FILE_TYPES = [
  { description: 'Collections Plus sync file', accept: { 'application/json': ['.json'] } },
];

/** Persist a freshly picked handle and peek at any data it already holds. */
async function adopt(handle) {
  await idbPut(HANDLE_KEY, handle);
  await setState({ base: 0 }); // next pull treats the file as authoritative
  const parsed = await readFile(handle).catch(() => null);
  const existing =
    parsed && Array.isArray(parsed.collections) && parsed.collections.length
      ? { collections: parsed.collections.length, exportedAt: parsed.exportedAt || 0 }
      : null;
  return { name: handle.name, existing };
}

/**
 * FIRST device: create (or choose) the sync file via a Save dialog, and
 * remember it. Does NOT push/pull yet — returns a peek so the caller can decide
 * whether to adopt existing data or overwrite. Must run from a user gesture.
 */
export async function createFile() {
  const handle = await self.showSaveFilePicker({
    suggestedName: SUGGESTED_NAME,
    types: FILE_TYPES,
  });
  return adopt(handle);
}

/**
 * OTHER devices: connect to an EXISTING sync file via an Open dialog (no
 * save/overwrite prompt — the file is read, not replaced). The returned handle
 * is read-only; call requestWriteAccess() to enable pushing later. Must run
 * from a user gesture.
 */
export async function openFile() {
  const [handle] = await self.showOpenFilePicker({
    types: FILE_TYPES,
    multiple: false,
  });
  return adopt(handle);
}

/**
 * Upgrade an opened (read-only) handle to read/write so future edits can be
 * written back. Must run from a user gesture. Returns whether access was given.
 */
export async function requestWriteAccess() {
  const handle = await getHandle();
  if (!handle) return false;
  return ensurePermission(handle, 'readwrite', true);
}

export async function disconnect() {
  await idbDel(HANDLE_KEY);
  await chrome.storage.local.remove(STATE_KEY);
}

// Reconciliation tracks the file's *local* modification time (File.lastModified)
// rather than an embedded wall-clock stamp. lastModified is read from this
// device's own filesystem whenever the cloud client writes the file, so it
// doesn't depend on the other device's clock — immune to cross-device skew.

/** Write local data to the sync file. Returns the timestamp written. */
export async function push({ interactive = false } = {}) {
  const handle = await getHandle();
  if (!handle) throw new Error('No sync file connected');
  if (!(await ensurePermission(handle, 'readwrite', interactive))) {
    const err = new Error('Permission to write the sync file was not granted');
    err.code = 'permission';
    throw err;
  }
  const stamp = Date.now();
  await writeFile(handle, stamp);
  // Record the file's resulting mtime so we don't re-pull our own write.
  try {
    await markSynced((await handle.getFile()).lastModified);
  } catch {
    await markSynced(stamp);
  }
  return stamp;
}

/**
 * Whether we currently hold write permission to the sync file, without
 * prompting. FSA write permission does not survive a reload/restart, so this
 * goes false until the user re-grants it via a gesture.
 */
export async function canWrite() {
  const handle = await getHandle();
  if (!handle) return false;
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Cheap check (mtime only, no full read) of whether the file changed since we
 * last reconciled. Used to gate background pulls without disturbing state.
 */
export async function hasRemoteChange() {
  const handle = await getHandle();
  if (!handle) return false;
  if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return false;
  try {
    const file = await handle.getFile();
    return file.lastModified !== (await getBase());
  } catch {
    return false;
  }
}

/**
 * Read the sync file and adopt it if its contents changed since we last
 * reconciled (or if `force`). "Changed" = a different File.lastModified than
 * the one we recorded. Returns { applied, reason }.
 */
export async function pull({ interactive = false, force = false } = {}) {
  const handle = await getHandle();
  if (!handle) throw new Error('No sync file connected');
  if (!(await ensurePermission(handle, 'read', interactive))) {
    return { applied: false, reason: 'permission' };
  }

  let file;
  try {
    file = await handle.getFile();
  } catch {
    return { applied: false, reason: 'unreadable' };
  }

  const base = await getBase();
  if (!force && file.lastModified === base) {
    return { applied: false, reason: 'up-to-date' };
  }

  const parsed = safeParse(await file.text());
  if (!parsed) return { applied: false, reason: 'empty' };

  await setData(normalize(parsed));
  await markSynced(file.lastModified);
  return { applied: true, reason: 'pulled' };
}
