// backend.js — the storage seam under store.js.
//
// store.js talks to persistent storage through this tiny async key/value
// interface instead of touching chrome.storage.local directly. The extension
// uses the default chrome.storage.local backend; a different host (e.g. the
// planned PWA, which stores data in IndexedDB) injects its own backend with
// setBackend() before calling into store.js. The data model, schema, and every
// CRUD helper in store.js then run unchanged on top of it.
//
// Interface — all async:
//   get(key)        -> the stored value, or undefined if absent
//   set(key, value) -> void
//   remove(key)     -> void   (unused by store.js today; here for parity)

/** The chrome.storage.local backend used by the extension. */
export const chromeLocalBackend = {
  async get(key) {
    const r = await chrome.storage.local.get(key);
    return r[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await chrome.storage.local.remove(key);
  },
};

// Default to chrome.storage.local when it's available (the extension and its
// Node test harness, which mocks chrome before importing store.js). Hosts
// without chrome must inject a backend via setBackend() before using store.js.
let active =
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
    ? chromeLocalBackend
    : null;

/**
 * Swap the active storage backend. Call once at startup, before any store.js
 * read/write — e.g. the PWA passes an IndexedDB-backed implementation.
 */
export function setBackend(next) {
  active = next;
}

/** The active backend. Throws a clear error if none has been configured. */
export function backend() {
  if (!active) {
    throw new Error('No storage backend configured — call setBackend() before using store.js.');
  }
  return active;
}
