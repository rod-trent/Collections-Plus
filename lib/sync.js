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

async function getBase() {
  const r = await chrome.storage.local.get(STATE_KEY);
  return r[STATE_KEY]?.base || 0;
}

async function setBase(base) {
  await chrome.storage.local.set({ [STATE_KEY]: { base } });
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
  let activeCollectionId = parsed?.activeCollectionId || null;
  if (!collections.some((c) => c.id === activeCollectionId)) {
    activeCollectionId = collections[0]?.id || null;
  }
  return { activeCollectionId, collections };
}

async function readFile(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  return safeParse(text);
}

async function writeFile(handle, stamp) {
  const data = await getData();
  const payload = JSON.stringify(
    { version: data.version, activeCollectionId: data.activeCollectionId, collections: data.collections, exportedAt: stamp, app: 'Collections Plus' },
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
  return { connected: !!handle, name: handle?.name || '' };
}

/**
 * Pick (or create) the sync file and remember it. Does NOT push or pull yet —
 * returns a peek at any existing content so the caller can decide whether to
 * adopt the file's data or overwrite it. Must be called from a user gesture.
 */
export async function connect() {
  const handle = await self.showSaveFilePicker({
    suggestedName: SUGGESTED_NAME,
    types: [
      { description: 'Collections Plus sync file', accept: { 'application/json': ['.json'] } },
    ],
  });
  await idbPut(HANDLE_KEY, handle);
  await setBase(0); // force the next pull to consider the file authoritative

  // Peek without writing (the picker doesn't truncate until we write).
  let existing = null;
  const parsed = await readFile(handle).catch(() => null);
  if (parsed && Array.isArray(parsed.collections) && parsed.collections.length) {
    existing = { collections: parsed.collections.length, exportedAt: parsed.exportedAt || 0 };
  }
  return { name: handle.name, existing };
}

export async function disconnect() {
  await idbDel(HANDLE_KEY);
  await chrome.storage.local.remove(STATE_KEY);
}

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
  await setBase(stamp);
  return stamp;
}

/**
 * Read the sync file and adopt it locally if it's newer than what we last
 * reconciled with (or if `force`). Returns { applied, reason }.
 */
export async function pull({ interactive = false, force = false } = {}) {
  const handle = await getHandle();
  if (!handle) throw new Error('No sync file connected');
  if (!(await ensurePermission(handle, 'read', interactive))) {
    return { applied: false, reason: 'permission' };
  }
  const parsed = await readFile(handle);
  if (!parsed) return { applied: false, reason: 'empty' };

  const fileStamp = parsed.exportedAt || 0;
  const base = await getBase();
  if (!force && fileStamp <= base) {
    return { applied: false, reason: 'up-to-date' };
  }

  await setData(normalize(parsed));
  await setBase(fileStamp || Date.now());
  return { applied: true, reason: 'pulled' };
}
