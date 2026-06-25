// store.js — the single source of truth for collections data.
// Wraps chrome.storage.local, owns the schema, and exposes CRUD helpers.
// Both the side panel and the background service worker import this module.

import { mapEdgeCsv } from './csv.js';
import { srcToCover } from './image.js';

const STORAGE_KEY = 'collectionsData';
const SETTINGS_KEY = 'collectionsSettings'; // local-only; not part of the synced blob
const SCHEMA_VERSION = 3;

// Trashed entries are auto-purged once they're older than this.
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function emptyData() {
  return {
    version: SCHEMA_VERSION,
    activeCollectionId: null,
    collections: [],
    folders: [],
    archive: [], // collections set aside to reduce clutter (restorable)
    trash: [], // soft-deleted collections/folders (auto-purged after 30 days)
  };
}

function uid() {
  // crypto.randomUUID is available in extension pages and service workers.
  return crypto.randomUUID();
}

function now() {
  return Date.now();
}

/** Build a collection with every schema default filled in. */
function newCollection(partial = {}) {
  const title = (partial.title || 'New collection').trim() || 'New collection';
  return {
    id: partial.id || uid(),
    title,
    createdAt: partial.createdAt || now(),
    updatedAt: now(),
    cover: partial.cover ?? null,
    pinned: !!partial.pinned,
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    parentId: partial.parentId ?? null,
    items: Array.isArray(partial.items) ? partial.items : [],
  };
}

/**
 * Migrate older payloads forward, backfilling fields added in later schema
 * versions (v2: collection pinned/tags/parentId, item done/fields). Runs on
 * every read, so it's tolerant and idempotent.
 */
function migrate(data) {
  if (!data || typeof data !== 'object') return emptyData();
  if (!Array.isArray(data.collections)) data.collections = [];
  if (!('activeCollectionId' in data)) data.activeCollectionId = null;
  data.folders = (Array.isArray(data.folders) ? data.folders : []).map((f) => ({
    id: f.id || uid(),
    name: f.name || 'Folder',
    collapsed: !!f.collapsed,
  }));
  data.collections = data.collections.map(migrateCollection);
  // Drop any collection parentId that doesn't point at an existing folder.
  const folderIds = new Set(data.folders.map((f) => f.id));
  for (const c of data.collections) {
    if (c.parentId && !folderIds.has(c.parentId)) c.parentId = null;
  }
  // Archive: same shape as a collection, but never inside a folder.
  data.archive = (Array.isArray(data.archive) ? data.archive : []).map((c) => {
    const mc = migrateCollection(c);
    mc.parentId = null;
    mc.archivedAt = c.archivedAt || now();
    return mc;
  });
  // Trash: tolerant of partial entries; expired ones are dropped on read.
  const cutoff = now() - TRASH_TTL_MS;
  data.trash = (Array.isArray(data.trash) ? data.trash : [])
    .map(migrateTrashEntry)
    .filter(Boolean)
    .filter((e) => e.deletedAt >= cutoff);
  data.version = SCHEMA_VERSION;
  return data;
}

/** Normalize a trash entry (a soft-deleted collection or folder). */
function migrateTrashEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const base = { id: e.id || uid(), deletedAt: e.deletedAt || now() };
  if (e.kind === 'folder' && e.folder) {
    return {
      ...base,
      kind: 'folder',
      folder: {
        id: e.folder.id || uid(),
        name: e.folder.name || 'Folder',
        collapsed: !!e.folder.collapsed,
      },
      childIds: Array.isArray(e.childIds) ? e.childIds : [],
    };
  }
  if (e.collection) {
    return {
      ...base,
      kind: 'collection',
      origIndex: Number.isInteger(e.origIndex) ? e.origIndex : 0,
      collection: migrateCollection(e.collection),
    };
  }
  return null;
}

function migrateCollection(c) {
  return {
    ...c,
    id: c.id || uid(),
    title: c.title || 'Untitled',
    createdAt: c.createdAt || now(),
    updatedAt: c.updatedAt || now(),
    cover: c.cover ?? null,
    pinned: !!c.pinned,
    tags: Array.isArray(c.tags) ? c.tags : [],
    parentId: c.parentId ?? null,
    items: Array.isArray(c.items) ? c.items.map(migrateItem) : [],
  };
}

function migrateItem(it) {
  // Spread first so forward-compatible extras (e.g. cached image data) survive.
  const out = { ...it, id: it.id || uid(), addedAt: it.addedAt || now(), done: !!it.done };
  if (it.type === 'note') {
    out.type = 'note';
    out.text = it.text || '';
    delete out.fields;
  } else if (it.type === 'image') {
    out.type = 'image';
    out.src = it.src;
    out.srcPageUrl = it.srcPageUrl || '';
    out.alt = it.alt || '';
    out.fields = it.fields && typeof it.fields === 'object' ? it.fields : {};
  } else {
    out.type = 'page';
    out.url = it.url;
    out.title = it.title || it.url;
    out.favIconUrl = it.favIconUrl || '';
    out.thumbnail = it.thumbnail || '';
    out.note = it.note || '';
    out.fields = it.fields && typeof it.fields === 'object' ? it.fields : {};
  }
  return out;
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
    created = newCollection({ title });
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

/** Re-insert a previously removed collection at a position (for undo). */
export async function insertCollection(collection, index) {
  await mutate((data) => {
    const i = Math.max(0, Math.min(index ?? data.collections.length, data.collections.length));
    data.collections.splice(i, 0, collection);
    data.activeCollectionId = collection.id;
  });
}

export async function setActive(id) {
  await mutate((data) => {
    data.activeCollectionId = id;
  });
}

/**
 * Set (or clear) a collection's cover image. Pass a URL / data URL, or null to
 * fall back to the auto-cover (first item) on the next add.
 */
export async function setCover(id, cover) {
  await mutate((data) => {
    const c = findCollection(data, id);
    if (c) {
      c.cover = cover || null;
      c.updatedAt = now();
    }
  });
}

/** Reorder the whole collection list given the full ordered list of ids. */
export async function reorderCollections(orderedIds) {
  await mutate((data) => {
    const byId = new Map(data.collections.map((c) => [c.id, c]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    // Append any collections not present in orderedIds (safety).
    for (const c of data.collections) {
      if (!orderedIds.includes(c.id)) reordered.push(c);
    }
    data.collections = reordered;
  });
}

/** Pin/unpin a collection (pinned ones sort to the top of the list). */
export async function setPinned(id, pinned) {
  await mutate((data) => {
    const c = findCollection(data, id);
    if (c) {
      c.pinned = !!pinned;
      c.updatedAt = now();
    }
  });
}

/** Replace a collection's tags (trimmed, de-duplicated, non-empty). */
export async function setTags(id, tags) {
  await mutate((data) => {
    const c = findCollection(data, id);
    if (c) {
      const clean = (Array.isArray(tags) ? tags : [])
        .map((t) => String(t).trim())
        .filter(Boolean);
      c.tags = [...new Set(clean)];
      c.updatedAt = now();
    }
  });
}

/** Set a collection's parent folder (or null for top level). */
export async function setParent(id, parentId) {
  await mutate((data) => {
    const c = findCollection(data, id);
    if (c && id !== parentId) {
      c.parentId = parentId || null;
      c.updatedAt = now();
    }
  });
}

// ---- Folders ---------------------------------------------------------------

export async function createFolder(name = 'New folder') {
  let folder;
  await mutate((data) => {
    if (!Array.isArray(data.folders)) data.folders = [];
    folder = { id: uid(), name: name.trim() || 'New folder', collapsed: false };
    data.folders.push(folder);
  });
  return folder;
}

export async function renameFolder(id, name) {
  await mutate((data) => {
    const f = data.folders?.find((x) => x.id === id);
    if (f) f.name = name.trim() || f.name;
  });
}

/** Delete a folder; its collections fall back to the top level. */
export async function removeFolder(id) {
  await mutate((data) => {
    data.folders = (data.folders || []).filter((f) => f.id !== id);
    for (const c of data.collections) if (c.parentId === id) c.parentId = null;
  });
}

export async function toggleFolder(id) {
  await mutate((data) => {
    const f = data.folders?.find((x) => x.id === id);
    if (f) f.collapsed = !f.collapsed;
  });
}

// ---- Trash & Archive -------------------------------------------------------
// Two holding areas, both kept in the synced blob so they travel between
// devices. Archive is for collections you want out of the way but intact;
// Trash is for soft-deleted collections/folders and is auto-purged after 30
// days. Active collections always live in data.collections, so every other
// consumer of that array keeps working untouched.

/** Re-point the active collection after one leaves the active list. */
function reselectActive(data, removedId) {
  if (data.activeCollectionId === removedId) {
    data.activeCollectionId = data.collections[0]?.id || null;
  }
}

/** Move a collection into the Archive (out of the main list, fully intact). */
export async function archiveCollection(id) {
  let archived = null;
  await mutate((data) => {
    const i = data.collections.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [col] = data.collections.splice(i, 1);
    col.archivedAt = now();
    data.archive.unshift(col);
    archived = col;
    reselectActive(data, id);
  });
  return archived;
}

/** Restore an archived collection to the active list (at the top, no folder). */
export async function unarchiveCollection(id) {
  await mutate((data) => {
    const i = (data.archive || []).findIndex((c) => c.id === id);
    if (i < 0) return;
    const [col] = data.archive.splice(i, 1);
    delete col.archivedAt;
    col.parentId = null;
    col.updatedAt = now();
    data.collections.unshift(col);
    data.activeCollectionId = col.id;
  });
}

/** Move a collection to the Trash. Returns the trash-entry id (for undo). */
export async function trashCollection(id) {
  let entryId = null;
  await mutate((data) => {
    const i = data.collections.findIndex((c) => c.id === id);
    if (i < 0) return;
    const [col] = data.collections.splice(i, 1);
    entryId = uid();
    data.trash.unshift({
      id: entryId,
      kind: 'collection',
      deletedAt: now(),
      origIndex: i,
      collection: col,
    });
    reselectActive(data, id);
  });
  return entryId;
}

/** Move a folder to the Trash; its child collections fall back to top level.
 *  Returns the trash-entry id (for undo). */
export async function trashFolder(id) {
  let entryId = null;
  await mutate((data) => {
    const f = (data.folders || []).find((x) => x.id === id);
    if (!f) return;
    const childIds = data.collections.filter((c) => c.parentId === id).map((c) => c.id);
    for (const c of data.collections) if (c.parentId === id) c.parentId = null;
    data.folders = data.folders.filter((x) => x.id !== id);
    entryId = uid();
    data.trash.unshift({ id: entryId, kind: 'folder', deletedAt: now(), folder: f, childIds });
  });
  return entryId;
}

/** Restore a trashed entry (collection or folder) by its trash-entry id. */
export async function restoreFromTrash(entryId) {
  await mutate((data) => {
    const i = (data.trash || []).findIndex((e) => e.id === entryId);
    if (i < 0) return;
    const [e] = data.trash.splice(i, 1);
    if (e.kind === 'folder') {
      data.folders.push(e.folder);
      // Re-adopt any of the original children that are still top-level.
      for (const cid of e.childIds || []) {
        const c = data.collections.find((x) => x.id === cid);
        if (c && !c.parentId) c.parentId = e.folder.id;
      }
    } else {
      const col = e.collection;
      col.updatedAt = now();
      const idx = Math.max(0, Math.min(e.origIndex ?? data.collections.length, data.collections.length));
      data.collections.splice(idx, 0, col);
      data.activeCollectionId = col.id;
    }
  });
}

/** Permanently delete a single trash entry. */
export async function deleteTrashEntry(entryId) {
  await mutate((data) => {
    data.trash = (data.trash || []).filter((e) => e.id !== entryId);
  });
}

/** Permanently delete everything in the Trash. */
export async function emptyTrash() {
  await mutate((data) => {
    data.trash = [];
  });
}

/** Drop trash entries older than the retention window. Returns count purged. */
export async function purgeExpiredTrash() {
  let purged = 0;
  await mutate((data) => {
    const cutoff = now() - TRASH_TTL_MS;
    const before = (data.trash || []).length;
    data.trash = (data.trash || []).filter((e) => (e.deletedAt || 0) >= cutoff);
    purged = before - data.trash.length;
  });
  return purged;
}

/** Return the active collection, creating a default one if none exist. */
export async function ensureActiveCollection() {
  let target;
  await mutate((data) => {
    target = findCollection(data, data.activeCollectionId) || data.collections[0];
    if (!target) {
      target = newCollection({ title: 'My Collection' });
      data.collections.unshift(target);
    }
    data.activeCollectionId = target.id;
  });
  return target;
}

// ---- Items -----------------------------------------------------------------

/** Normalize loose input into a stored item with id + timestamp + type. */
function makeItem(partial) {
  const base = { id: uid(), addedAt: now(), done: !!partial.done };
  const fields = partial.fields && typeof partial.fields === 'object' ? partial.fields : {};
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
      fields,
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
    fields,
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
      c = newCollection({ title: 'My Collection' });
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

/** Re-insert a previously removed item at a position (for undo). */
export async function insertItem(collectionId, item, index) {
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    if (!c) return;
    const i = Math.max(0, Math.min(index ?? c.items.length, c.items.length));
    c.items.splice(i, 0, item);
    c.updatedAt = now();
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

/** Toggle (or set) an item's done/checked state. */
export async function toggleDone(collectionId, itemId, value) {
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    const it = c?.items.find((x) => x.id === itemId);
    if (it) {
      it.done = value == null ? !it.done : !!value;
      c.updatedAt = now();
    }
  });
}

/** Remove several items from a collection at once. */
export async function removeItems(collectionId, itemIds) {
  const set = new Set(itemIds);
  await mutate((data) => {
    const c = findCollection(data, collectionId);
    if (c) {
      c.items = c.items.filter((it) => !set.has(it.id));
      c.updatedAt = now();
    }
  });
}

/** Move items (preserving order) from one collection to another. */
export async function moveItems(fromId, itemIds, toId) {
  if (fromId === toId) return;
  const set = new Set(itemIds);
  await mutate((data) => {
    const from = findCollection(data, fromId);
    const to = findCollection(data, toId);
    if (!from || !to) return;
    const moving = from.items.filter((it) => set.has(it.id));
    if (!moving.length) return;
    from.items = from.items.filter((it) => !set.has(it.id));
    to.items.push(...moving);
    from.updatedAt = to.updatedAt = now();
  });
}

/** Copy items into another collection (fresh ids; originals untouched). */
export async function copyItems(fromId, itemIds, toId) {
  const set = new Set(itemIds);
  await mutate((data) => {
    const from = findCollection(data, fromId);
    const to = findCollection(data, toId);
    if (!from || !to) return;
    for (const it of from.items) {
      if (!set.has(it.id)) continue;
      const copy = { ...it, id: uid(), addedAt: now() };
      if (it.fields) copy.fields = { ...it.fields };
      to.items.push(copy);
    }
    to.updatedAt = now();
  });
}

/** Find an existing page item with this URL in a collection (for dedupe). */
export async function findPageByUrl(collectionId, url) {
  const data = await getData();
  const c = findCollection(data, collectionId);
  if (!c) return null;
  return c.items.find((it) => it.type === 'page' && it.url === url) || null;
}

// ---- Import / Export -------------------------------------------------------

/** Export the full data blob as a pretty JSON string. */
export async function exportJSON() {
  const data = await getData();
  return JSON.stringify({ ...data, exportedAt: now(), app: 'Collections Plus' }, null, 2);
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
    // merge: append incoming collections (fresh ids to avoid collisions).
    // Flatten folder structure on merge so parentId can't dangle to old ids.
    for (const c of incoming.collections) {
      data.collections.push({
        ...c,
        id: uid(),
        parentId: null,
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
      data.collections.push(
        newCollection({
          title: col.title,
          items: col.pages.map((p) =>
            makeItem({ type: 'page', url: p.url, title: p.title })
          ),
        })
      );
    }
  });
  return stats;
}

// ---- Local version history (rollback safety) -------------------------------

const HISTORY_KEY = 'collectionsHistory'; // local-only ring buffer of snapshots
const HISTORY_MAX = 8;

export async function getHistory() {
  const r = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(r[HISTORY_KEY]) ? r[HISTORY_KEY] : [];
}

/**
 * Snapshot the current data into the ring buffer, throttled so rapid edits
 * don't fill it. Returns the (possibly unchanged) history.
 */
export async function snapshotHistory(minIntervalMs = 120000) {
  const hist = await getHistory();
  if (hist[0] && Date.now() - hist[0].at < minIntervalMs) return hist;
  const data = await getData();
  const entry = {
    at: Date.now(),
    collections: data.collections.length,
    items: data.collections.reduce((n, c) => n + c.items.length, 0),
    data: JSON.parse(
      JSON.stringify({
        activeCollectionId: data.activeCollectionId,
        collections: data.collections,
        archive: data.archive || [],
        trash: data.trash || [],
      })
    ),
  };
  const next = [entry, ...hist].slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

/** Restore a snapshot (by its `at` timestamp) as the current data. */
export async function restoreHistory(at) {
  const entry = (await getHistory()).find((h) => h.at === at);
  if (!entry) return false;
  await setData({
    activeCollectionId: entry.data.activeCollectionId,
    collections: entry.data.collections,
    archive: entry.data.archive || [],
    trash: entry.data.trash || [],
  });
  return true;
}

// ---- Settings (local-only) -------------------------------------------------

// theme: 'dark' | 'light' | 'system' ('system' follows the OS/Chrome
// light-dark preference via prefers-color-scheme).
// autoCheckLinks: when on, the service worker periodically re-probes saved page
// URLs for link rot (see background.js). Off by default — it makes network
// requests, so it's opt-in.
const DEFAULT_SETTINGS = { cacheImages: false, theme: 'dark', autoCheckLinks: false };

export async function getSettings() {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

// ---- Image caching (link-rot resilience) -----------------------------------

/**
 * If an item points at a *remote* image/thumbnail, fetch a downscaled copy and
 * inline it as a data URL so it survives the source going offline (and syncs as
 * real pixels). No-op for notes, already-inlined data URLs, or on any failure.
 * Returns true if something was cached.
 */
export async function cacheItemImage(collectionId, itemId) {
  const data = await getData();
  const c = findCollection(data, collectionId);
  const it = c?.items.find((x) => x.id === itemId);
  if (!it) return false;
  try {
    if (it.type === 'image' && it.src && !it.src.startsWith('data:')) {
      const inlined = await srcToCover(it.src, 512);
      await updateItem(collectionId, itemId, { src: inlined, srcOriginal: it.src });
      return true;
    }
    if (it.type === 'page' && it.thumbnail && !it.thumbnail.startsWith('data:')) {
      const inlined = await srcToCover(it.thumbnail, 512);
      await updateItem(collectionId, itemId, { thumbnail: inlined });
      return true;
    }
  } catch {
    /* leave the original reference in place on failure */
  }
  return false;
}

// ---- Link-rot status -------------------------------------------------------

/**
 * Apply a batch of link-check results in a single write. Each result is
 * `{ collectionId, itemId, linkStatus?, linkCheckedAt? }`. `linkStatus` is
 * omitted for ambiguous probes (we only stamp the check time then). Batching
 * avoids the read-modify-write races you'd get from many concurrent
 * updateItem() calls, and produces one storage change (one re-render / sync
 * push) for the whole run.
 */
export async function applyLinkResults(results) {
  if (!Array.isArray(results) || !results.length) return;
  await mutate((data) => {
    for (const r of results) {
      const c = findCollection(data, r.collectionId);
      const it = c?.items.find((x) => x.id === r.itemId);
      if (!it) continue;
      if (r.linkStatus) it.linkStatus = r.linkStatus;
      if (r.linkCheckedAt) it.linkCheckedAt = r.linkCheckedAt;
    }
  });
}

/** Cache every cacheable image in a collection. Returns how many were cached. */
export async function cacheCollectionImages(collectionId) {
  const data = await getData();
  const c = findCollection(data, collectionId);
  if (!c) return { cached: 0 };
  let cached = 0;
  for (const it of [...c.items]) {
    if (await cacheItemImage(collectionId, it.id)) cached++;
  }
  return { cached };
}

export { STORAGE_KEY };
