// store.js — the single source of truth for collections data.
// Wraps chrome.storage.local, owns the schema, and exposes CRUD helpers.
// Both the side panel and the background service worker import this module.

import { mapEdgeCsv } from './csv.js';

const STORAGE_KEY = 'collectionsData';
const SCHEMA_VERSION = 1;

function emptyData() {
  return { version: SCHEMA_VERSION, activeCollectionId: null, collections: [] };
}

function uid() {
  // crypto.randomUUID is available in extension pages and service workers.
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

/** Migrate older payloads forward. Currently only v1 exists. */
function migrate(data) {
  if (!data || typeof data !== 'object') return emptyData();
  if (!Array.isArray(data.collections)) data.collections = [];
  if (typeof data.version !== 'number') data.version = SCHEMA_VERSION;
  if (!('activeCollectionId' in data)) data.activeCollectionId = null;
  return data;
}

/** Read the whole data blob (always returns a valid, migrated object). */
export async function getData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return migrate(result[STORAGE_KEY]);
}

/** Persist the whole data blob. */
export async function setData(data) {
  data.version = SCHEMA_VERSION;
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  return data;
}

/**
 * Read–modify–write helper. The mutator receives the current data and may
 * mutate it in place or return a new object. Returns the persisted data.
 */
async function mutate(fn) {
  const data = await getData();
  const next = (await fn(data)) || data;
  return setData(next);
}

function findCollection(data, id) {
  return data.collections.find((c) => c.id === id) || null;
}

// ---- Collections -----------------------------------------------------------

export async function createCollection(title = 'New collection') {
  let created;
  await mutate((data) => {
    created = {
      id: uid(),
      title: title.trim() || 'New collection',
      createdAt: now(),
      updatedAt: now(),
      cover: null,
      items: [],
    };
    data.collections.unshift(created);
    data.activeCollectionId = created.id;
  });
  return created;
}

export async function renameCollection(id, title) {
  await mutate((data) => {
    const c = findCollection(data, id);
    if (c) {
      c.title = title.trim() || c.title;
      c.updatedAt = now();
    }
  });
}

export async function removeCollection(id) {
  await mutate((data) => {
    data.collections = data.collections.filter((c) => c.id !== id);
    if (data.activeCollectionId === id) {
      data.activeCollectionId = data.collections[0]?.id || null;
    }
  });
}

export async function setActive(id) {
  await mutate((data) => {
    data.activeCollectionId = id;
  });
}

/** Return the active collection, creating a default one if none exist. */
export async function ensureActiveCollection() {
  let target;
  await mutate((data) => {
    target = findCollection(data, data.activeCollectionId) || data.collections[0];
    if (!target) {
      target = {
        id: uid(),
        title: 'My Collection',
        createdAt: now(),
        updatedAt: now(),
        cover: null,
        items: [],
      };
      data.collections.unshift(target);
    }
    data.activeCollectionId = target.id;
  });
  return target;
}

// ---- Items -----------------------------------------------------------------

/** Normalize loose input into a stored item with id + timestamp + type. */
function makeItem(partial) {
  const base = { id: uid(), addedAt: now() };
  if (partial.type === 'note') {
    return { ...base, type: 'note', text: partial.text || '' };
  }
  if (partial.type === 'image') {
    return {
      ...base,
      type: 'image',
      src: partial.src,
      srcPageUrl: partial.srcPageUrl || '',
      alt: partial.alt || '',
    };
  }
  // default: page
  return {
    ...base,
    type: 'page',
    url: partial.url,
    title: partial.title || partial.url,
    favIconUrl: partial.favIconUrl || '',
    thumbnail: partial.thumbnail || '',
    note: partial.note || '',
  };
}

/**
 * Add an item to a collection. If collectionId is omitted, uses/creates the
 * active collection. Returns { collection, item }.
 */
export async function addItem(collectionId, partial) {
  let out = {};
  await mutate((data) => {
    let c = collectionId ? findCollection(data, collectionId) : null;
    if (!c) {
      c = findCollection(data, data.activeCollectionId) || data.collections[0];
    }
    if (!c) {
      c = {
        id: uid(),
        title: 'My Collection',
        createdAt: now(),
        updatedAt: now(),
        cover: null,
        items: [],
      };
      data.collections.unshift(c);
    }
    const item = makeItem(partial);
    c.items.push(item);
    c.updatedAt = now();
    // First page/image thumbnail becomes the collection cover.
    if (!c.cover) {
      if (item.type === 'image') c.cover = item.src;
      else if (item.type === 'page' && item.thumbnail) c.cover = item.thumbnail;
    }
    data.activeCollectionId = c.id;
    out = { collection: c, item };
  });
  return out;
}

export async function updateItem(collectionId, itemId, patch) {
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    const item = c?.items.find((it) => it.id === itemId);
    if (item) {
      Object.assign(item, patch);
      c.updatedAt = now();
    }
  });
}

export async function removeItem(collectionId, itemId) {
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    if (c) {
      c.items = c.items.filter((it) => it.id !== itemId);
      c.updatedAt = now();
    }
  });
}

/** Reorder items within a collection given the full ordered list of item ids. */
export async function reorderItems(collectionId, orderedIds) {
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    if (!c) return;
    const byId = new Map(c.items.map((it) => [it.id, it]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    // Append any items not present in orderedIds (safety).
    for (const it of c.items) if (!orderedIds.includes(it.id)) reordered.push(it);
    c.items = reordered;
    c.updatedAt = now();
  });
}

// ---- Import / Export -------------------------------------------------------

/** Export the full data blob as a pretty JSON string. */
export async function exportJSON() {
  const data = await getData();
  return JSON.stringify({ ...data, exportedAt: now(), app: 'Collections' }, null, 2);
}

/**
 * Import a JSON backup produced by exportJSON.
 * @param {string} json
 * @param {'merge'|'replace'} mode
 */
export async function importJSON(json, mode = 'merge') {
  const incoming = migrate(JSON.parse(json));
  await mutate((data) => {
    if (mode === 'replace') {
      incoming.activeCollectionId =
        incoming.collections[0]?.id || null;
      return incoming;
    }
    // merge: append incoming collections (fresh ids to avoid collisions)
    for (const c of incoming.collections) {
      data.collections.push({
        ...c,
        id: uid(),
        items: (c.items || []).map((it) => ({ ...it, id: uid() })),
      });
    }
  });
  return getData();
}

/**
 * Import an Edge Collections CSV export. Pages-only (CSV has no notes/images).
 * Returns the import stats from the mapper.
 */
export async function importEdgeCsv(csvText) {
  const { collections, stats } = mapEdgeCsv(csvText);
  await mutate((data) => {
    for (const col of collections) {
      data.collections.push({
        id: uid(),
        title: col.title,
        createdAt: now(),
        updatedAt: now(),
        cover: null,
        items: col.pages.map((p) =>
          makeItem({ type: 'page', url: p.url, title: p.title })
        ),
      });
    }
  });
  return stats;
}

export { STORAGE_KEY };
