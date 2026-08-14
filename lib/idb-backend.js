// idb-backend.js — an IndexedDB implementation of the storage seam (backend.js).
//
// For hosts without chrome.storage — chiefly the planned PWA. It fulfils the
// same get/set/remove contract as chromeLocalBackend, so store.js runs on it
// unchanged:
//
//   import { setBackend } from './backend.js';
//   import { createIdbBackend } from './idb-backend.js';
//   setBackend(createIdbBackend());   // once, at startup, before any store call
//
// IndexedDB stores structured-cloneable values directly, so the heavy payloads
// in this data model (inline `data:` URL thumbnails and image bytes) are kept
// as-is with no JSON round-trip — unlike chrome.storage.sync, there's no small
// per-item quota to chunk around. The whole `collectionsData` blob lives under
// one key, mirroring how the extension keeps it in chrome.storage.local.
//
// Verified in-browser against real IndexedDB (see tools/idb-backend.probe.html),
// following the same in-browser-verification precedent as lib/sync.js's raw IDB.

const DEFAULT_DB = 'collections-plus';
const DEFAULT_STORE = 'kv';

/**
 * Build an IndexedDB-backed storage seam.
 * @param {{ dbName?: string, storeName?: string }} [opts]
 * @returns {{ get(key:string):Promise<any>, set(key:string,value:any):Promise<void>, remove(key:string):Promise<void> }}
 */
export function createIdbBackend({ dbName = DEFAULT_DB, storeName = DEFAULT_STORE } = {}) {
  // Lazily open one connection and reuse it for every op (cheaper than the
  // open/close-per-call style, and fine for a single-writer page).
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => {
        // If another tab triggers a version change, drop our handle so the next
        // op re-opens cleanly instead of throwing on a closing connection.
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
    return dbPromise;
  }

  // Run one request inside a transaction and resolve with its result once the
  // transaction commits (so writes are durable before we return).
  async function run(mode, make) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = make(tx.objectStore(storeName));
      let result;
      req.onsuccess = () => {
        result = req.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    /** @returns the stored value, or undefined if the key is absent. */
    get(key) {
      return run('readonly', (s) => s.get(key));
    },
    async set(key, value) {
      await run('readwrite', (s) => s.put(value, key));
    },
    async remove(key) {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/** A ready-to-use backend on the default database. */
export const idbBackend = createIdbBackend();
