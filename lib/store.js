// store.js — the single source of truth for collections data.
// Owns the schema and exposes CRUD helpers. Persistence goes through the
// pluggable storage seam in backend.js (chrome.storage.local in the extension;
// an injected backend such as IndexedDB in other hosts), so the same data
// model runs unchanged wherever store.js is imported.
// Both the side panel and the background service worker import this module.

import { mapEdgeCsv } from './csv.js';
import { mapEdgeSqlite } from './edgesqlite.js';
import { mapBookmarks } from './bookmarks.js';
import { srcToCover } from './image.js';
import { backend } from './backend.js';

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
    rules: [], // auto-file rules: route quick-saves into a collection by match
  };
}

function uid() {
  // crypto.randomUUID is available in extension pages and service workers.
  return crypto.randomUUID();
}

/** A strict 6-digit hex color, e.g. "#3b82f6" (used for cover/folder colors). */
function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
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
    color: isHexColor(f.color) ? f.color : null,
    ...(Number.isFinite(f.order) ? { order: f.order } : {}),
  }));
  data.collections = data.collections.map(migrateCollection);
  repairParents(data);
  assignOrder(data);
  // Archive: same shape as a collection. parentId is kept only as a hint for
  // where to restore it (validated on unarchive); archivedWith links the
  // subcollections that were archived together with their parent.
  data.archive = (Array.isArray(data.archive) ? data.archive : []).map((c) => {
    const mc = migrateCollection(c);
    mc.archivedAt = c.archivedAt || now();
    if (c.archivedWith) mc.archivedWith = c.archivedWith;
    return mc;
  });
  // Trash: tolerant of partial entries; expired ones are dropped on read.
  const cutoff = now() - TRASH_TTL_MS;
  data.trash = (Array.isArray(data.trash) ? data.trash : [])
    .map(migrateTrashEntry)
    .filter(Boolean)
    .filter((e) => e.deletedAt >= cutoff);
  // Auto-file rules: keep only well-formed rules that still point at a live
  // collection (a rule whose target was deleted is dead).
  const liveIds = new Set(data.collections.map((c) => c.id));
  const RULE_TYPES = new Set(['domain', 'urlContains', 'titleContains']);
  data.rules = (Array.isArray(data.rules) ? data.rules : [])
    .filter(
      (r) =>
        r &&
        RULE_TYPES.has(r.type) &&
        typeof r.value === 'string' &&
        r.value.trim() &&
        liveIds.has(r.collectionId)
    )
    .map((r) => ({
      id: r.id || uid(),
      type: r.type,
      value: r.value.trim(),
      collectionId: r.collectionId,
    }));

  data.version = SCHEMA_VERSION;
  return data;
}

/**
 * A collection's parentId points at either a folder or another active
 * collection (a subcollection). Drop any that dangle, point at the collection
 * itself, or form a cycle — the collection falls back to the top level.
 */
function repairParents(data) {
  const folderIds = new Set(data.folders.map((f) => f.id));
  const byId = new Map(data.collections.map((c) => [c.id, c]));
  for (const c of data.collections) {
    if (c.parentId && !folderIds.has(c.parentId) && !byId.has(c.parentId)) c.parentId = null;
  }
  // Walk each chain upward; the first collection that leads back into its own
  // chain is cut loose, which breaks the cycle for everyone else in it.
  for (const c of data.collections) {
    const seen = new Set([c.id]);
    let p = byId.get(c.parentId);
    while (p) {
      if (seen.has(p.id)) {
        c.parentId = null;
        break;
      }
      seen.add(p.id);
      p = byId.get(p.parentId);
    }
  }
}

/** Is `id` an active collection (so a parentId of `id` means "subcollection")? */
function isCollectionId(data, id) {
  return !!id && data.collections.some((c) => c.id === id);
}

/** Direct subcollections of a collection, in no particular order. */
export function childCollections(data, id) {
  return (data.collections || []).filter((c) => c.parentId === id);
}

/** Ids of every collection nested (at any depth) under `id`. */
export function descendantIds(data, id) {
  const out = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const c of data.collections || []) {
      if (c.parentId === cur && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

/**
 * Ancestor collections of `id`, outermost first (not including `id` itself).
 * Stops at a folder or the top level.
 */
export function collectionPath(data, id) {
  const byId = new Map((data.collections || []).map((c) => [c.id, c]));
  const path = [];
  const seen = new Set([id]);
  let p = byId.get(byId.get(id)?.parentId);
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    path.unshift(p);
    p = byId.get(p.parentId);
  }
  return path;
}

/** Next `order` at the end of a parent's (folder or collection) children. */
function childOrderEnd(data, parentId, exceptId = null) {
  const kids = data.collections.filter((x) => x.parentId === parentId && x.id !== exceptId);
  return Math.max(-1, ...kids.map((x) => x.order).filter((n) => Number.isFinite(n))) + 1;
}

/**
 * Ensure folders and collections carry a numeric `order` used for manual
 * arrangement. `order` is a position within a node's scope: for folders and
 * top-level collections it's a single shared top-level sequence (so folders and
 * collections interleave); for a collection inside a folder it's the position
 * among that folder's children. Only missing values are filled in, so this is
 * idempotent across the migrate-on-every-read cycle.
 */
function assignOrder(data) {
  const tops = data.collections.filter((c) => !c.parentId);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const anyOrder =
    data.folders.some((f) => num(f.order) !== null) ||
    data.collections.some((c) => num(c.order) !== null);

  if (!anyOrder) {
    // First upgrade: reproduce the previous layout as the starting manual order —
    // top-level collections, then folders (each followed by its children).
    let o = 0;
    for (const c of tops) c.order = o++;
    for (const f of data.folders) f.order = o++;
    const parents = new Set(data.collections.map((c) => c.parentId).filter(Boolean));
    for (const pid of parents) {
      let k = 0;
      for (const c of data.collections) if (c.parentId === pid) c.order = k++;
    }
    return;
  }

  // Otherwise backfill only what's missing, appending to the end of its scope.
  let topNext =
    Math.max(
      -1,
      ...data.folders.map((f) => num(f.order) ?? -1),
      ...tops.map((c) => num(c.order) ?? -1)
    ) + 1;
  for (const f of data.folders) if (num(f.order) === null) f.order = topNext++;
  for (const c of tops) if (num(c.order) === null) c.order = topNext++;
  // Children of folders and of parent collections each keep their own sequence.
  const parents = new Set(data.collections.map((c) => c.parentId).filter(Boolean));
  for (const pid of parents) {
    const kids = data.collections.filter((c) => c.parentId === pid);
    let k = Math.max(-1, ...kids.map((c) => num(c.order) ?? -1)) + 1;
    for (const c of kids) if (num(c.order) === null) c.order = k++;
  }
}

/** Highest `order` among top-level nodes (folders + parentless collections). */
function topOrderMax(data, exceptId = null) {
  const vals = [
    ...data.folders.map((f) => f.order),
    ...data.collections.filter((c) => !c.parentId && c.id !== exceptId).map((c) => c.order),
  ].filter((n) => typeof n === 'number' && Number.isFinite(n));
  return vals.length ? Math.max(...vals) : -1;
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
        color: isHexColor(e.folder.color) ? e.folder.color : null,
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
      // Subcollections trashed along with a parent point at the parent's entry.
      ...(e.batchId ? { batchId: e.batchId } : {}),
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
  } else if (it.type === 'highlight') {
    out.type = 'highlight';
    out.text = it.text || '';
    out.url = it.url || '';
    out.title = it.title || '';
    out.note = it.note || '';
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
    out.unread = !!it.unread; // read-later state (Reading list)
    out.fields = it.fields && typeof it.fields === 'object' ? it.fields : {};
  }
  return out;
}

/** Read the whole data blob (always returns a valid, migrated object). */
export async function getData() {
  const raw = await backend().get(STORAGE_KEY);
  return migrate(raw);
}

/** Persist the whole data blob. */
export async function setData(data) {
  data.version = SCHEMA_VERSION;
  await backend().set(STORAGE_KEY, data);
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
    // New collections appear first in the top-level manual order.
    const topMin = Math.min(
      0,
      ...data.folders.map((f) => f.order).filter((n) => Number.isFinite(n)),
      ...data.collections
        .filter((c) => !c.parentId)
        .map((c) => c.order)
        .filter((n) => Number.isFinite(n))
    );
    created.order = topMin - 1;
    data.collections.unshift(created);
    data.activeCollectionId = created.id;
  });
  return created;
}

/**
 * Create a collection nested inside another (at the end of its subcollections).
 * Returns the new collection, or null if the parent doesn't exist.
 */
export async function createSubCollection(parentId, title = 'New collection') {
  let created = null;
  await mutate((data) => {
    if (!isCollectionId(data, parentId)) return;
    created = newCollection({ title, parentId });
    created.order = childOrderEnd(data, parentId);
    data.collections.push(created);
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

/**
 * Set a collection's parent: a folder id, another collection's id (to nest it
 * as a subcollection), or null for the top level. Refuses to nest a collection
 * inside itself or one of its own subcollections. Returns true if applied.
 */
export async function setParent(id, parentId) {
  let ok = false;
  await mutate((data) => {
    const c = findCollection(data, id);
    if (!c || id === parentId) return;
    const next = parentId || null;
    if (next) {
      const isFolder = data.folders.some((f) => f.id === next);
      if (!isFolder && !isCollectionId(data, next)) return;
      if (!isFolder && descendantIds(data, id).includes(next)) return;
    }
    if (c.parentId !== next) {
      c.parentId = next;
      // Land at the end of the destination scope's manual order.
      c.order = next ? childOrderEnd(data, next, id) : topOrderMax(data, id) + 1;
    }
    c.updatedAt = now();
    ok = true;
  });
  return ok;
}

/**
 * Persist a manual arrangement of the top-level list. `entries` is the full
 * ordered sequence read from the UI: [{ kind:'folder'|'collection', id,
 * parentId, order }]. Renumbers folder/collection `order` and re-parents
 * collections in one write.
 */
export async function saveArrangement(entries) {
  await mutate((data) => {
    const folderById = new Map(data.folders.map((f) => [f.id, f]));
    const colById = new Map(data.collections.map((c) => [c.id, c]));
    for (const e of entries || []) {
      if (e.kind === 'folder') {
        const f = folderById.get(e.id);
        if (f) f.order = e.order;
      } else {
        const c = colById.get(e.id);
        // The top-level list only arranges folders and their collections; a
        // subcollection (e.g. shown in search results) keeps its parent.
        if (c && !colById.has(c.parentId) && (!e.parentId || folderById.has(e.parentId))) {
          c.order = e.order;
          c.parentId = e.parentId || null;
        }
      }
    }
  });
}

// ---- Folders ---------------------------------------------------------------

export async function createFolder(name = 'New folder') {
  let folder;
  await mutate((data) => {
    if (!Array.isArray(data.folders)) data.folders = [];
    folder = {
      id: uid(),
      name: name.trim() || 'New folder',
      collapsed: false,
      color: null,
      order: topOrderMax(data) + 1, // append to the end of the top-level order
    };
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

/** Set (or clear, with null) a folder's accent color. */
export async function setFolderColor(id, color) {
  await mutate((data) => {
    const f = data.folders?.find((x) => x.id === id);
    if (f) f.color = isHexColor(color) ? color : null;
  });
}

/** Delete a folder; its collections fall back to the top level. */
export async function removeFolder(id) {
  await mutate((data) => {
    data.folders = (data.folders || []).filter((f) => f.id !== id);
    let next = topOrderMax(data) + 1;
    for (const c of data.collections) {
      if (c.parentId === id) {
        c.parentId = null;
        c.order = next++; // append orphans to the end of the top-level order
      }
    }
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

/**
 * Detach a collection and all of its subcollections from the active list in
 * one step. Returns [{ col, index }] with the root first, or [] if not found.
 */
function takeSubtree(data, id) {
  if (!isCollectionId(data, id)) return [];
  const ids = [id, ...descendantIds(data, id)];
  const taken = ids.map((cid) => ({
    col: findCollection(data, cid),
    index: data.collections.findIndex((c) => c.id === cid),
  }));
  const gone = new Set(ids);
  data.collections = data.collections.filter((c) => !gone.has(c.id));
  for (const cid of ids) reselectActive(data, cid);
  return taken;
}

/**
 * From `pool` (collections in a holding area), pick `rootId` plus everything
 * nested beneath it by parentId. Root first.
 */
function subtreeIn(pool, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of pool) {
      if (!ids.has(c.id) && ids.has(c.parentId)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Put a restored root collection back under its old parent if that folder or
 * collection still exists; otherwise it returns to the top level.
 */
function rehome(data, col) {
  const parentOk =
    col.parentId &&
    (data.folders.some((f) => f.id === col.parentId) || isCollectionId(data, col.parentId));
  if (!parentOk) col.parentId = null;
}

/** Move a collection (and its subcollections) into the Archive, fully intact. */
export async function archiveCollection(id) {
  let archived = null;
  await mutate((data) => {
    const taken = takeSubtree(data, id);
    if (!taken.length) return;
    const at = now();
    for (const { col } of taken) {
      col.archivedAt = at;
      if (col.id !== id) col.archivedWith = id;
    }
    data.archive.unshift(...taken.map((t) => t.col));
    archived = taken[0].col;
  });
  return archived;
}

/**
 * Restore an archived collection (and the subcollections archived with it) to
 * the active list — back under its old folder/parent if that still exists,
 * otherwise at the top.
 */
export async function unarchiveCollection(id) {
  await mutate((data) => {
    const root = (data.archive || []).find((c) => c.id === id);
    if (!root) return;
    const batch = root.archivedWith || root.id;
    const pool = data.archive.filter((c) => c.id === batch || c.archivedWith === batch);
    const ids = subtreeIn(pool, id);
    const restoring = data.archive.filter((c) => ids.has(c.id));
    data.archive = data.archive.filter((c) => !ids.has(c.id));
    for (const col of restoring) {
      delete col.archivedAt;
      delete col.archivedWith;
      col.updatedAt = now();
    }
    // Re-home before anything is re-inserted, so the root can never land
    // under one of its own subcollections.
    rehome(data, root);
    data.collections.unshift(root);
    data.collections.push(...restoring.filter((c) => c !== root && !isCollectionId(data, c.id)));
    data.activeCollectionId = root.id;
  });
}

/**
 * Move a collection to the Trash, taking its subcollections with it (they get
 * their own entries linked by batchId, hidden behind the parent's). Returns
 * the parent's trash-entry id (for undo).
 */
export async function trashCollection(id) {
  let entryId = null;
  await mutate((data) => {
    const taken = takeSubtree(data, id);
    if (!taken.length) return;
    entryId = uid();
    const at = now();
    const entries = taken.map(({ col, index }) => ({
      id: col.id === id ? entryId : uid(),
      kind: 'collection',
      deletedAt: at,
      origIndex: index,
      collection: col,
      ...(col.id === id ? {} : { batchId: entryId }),
    }));
    data.trash.unshift(...entries);
  });
  return entryId;
}

/** Trash entries that belong with `entry`: it plus its nested subcollections. */
function trashSubtree(data, entry) {
  if (entry.kind !== 'collection') return new Set([entry.id]);
  const batch = entry.batchId || entry.id;
  const pool = data.trash.filter(
    (e) => e.kind === 'collection' && (e.id === batch || e.batchId === batch)
  );
  const colIds = subtreeIn(
    pool.map((e) => e.collection),
    entry.collection.id
  );
  return new Set(pool.filter((e) => colIds.has(e.collection.id)).map((e) => e.id));
}

/**
 * Is this trash/archive row shown on its own? Subcollections that went to the
 * Trash or Archive with their parent are listed under it, unless the parent's
 * entry is gone (then they stand alone so nothing becomes unreachable).
 */
export function isTopBinEntry(data, entry) {
  if (entry.batchId) return !(data.trash || []).some((e) => e.id === entry.batchId);
  if (entry.archivedWith) return !(data.archive || []).some((c) => c.id === entry.archivedWith);
  return true;
}

/**
 * How many subcollections are held with a trash entry, or (isTrash false) with
 * an archived collection — pass the collection itself for the archive.
 */
export function binSubtreeCount(data, entry, isTrash) {
  if (isTrash) return trashSubtree(data, entry).size - 1;
  const batch = entry.archivedWith || entry.id;
  const pool = (data.archive || []).filter((c) => c.id === batch || c.archivedWith === batch);
  return subtreeIn(pool, entry.id).size - 1;
}

/** Move a folder to the Trash; its child collections fall back to top level.
 *  Returns the trash-entry id (for undo). */
export async function trashFolder(id) {
  let entryId = null;
  await mutate((data) => {
    const f = (data.folders || []).find((x) => x.id === id);
    if (!f) return;
    const childIds = data.collections.filter((c) => c.parentId === id).map((c) => c.id);
    data.folders = data.folders.filter((x) => x.id !== id);
    let next = topOrderMax(data) + 1;
    for (const c of data.collections) {
      if (c.parentId === id) {
        c.parentId = null;
        c.order = next++; // append orphans to the end of the top-level order
      }
    }
    entryId = uid();
    data.trash.unshift({ id: entryId, kind: 'folder', deletedAt: now(), folder: f, childIds });
  });
  return entryId;
}

/** Restore a trashed entry (collection or folder) by its trash-entry id. */
export async function restoreFromTrash(entryId) {
  await mutate((data) => {
    const e = (data.trash || []).find((x) => x.id === entryId);
    if (!e) return;
    if (e.kind === 'folder') {
      data.trash = data.trash.filter((x) => x !== e);
      data.folders.push(e.folder);
      // Re-adopt any of the original children that are still top-level.
      for (const cid of e.childIds || []) {
        const c = data.collections.find((x) => x.id === cid);
        if (c && !c.parentId) c.parentId = e.folder.id;
      }
    } else {
      // Bring back the subcollections that were trashed along with it.
      const ids = trashSubtree(data, e);
      const restoring = data.trash.filter((x) => ids.has(x.id));
      data.trash = data.trash.filter((x) => !ids.has(x.id));
      const col = e.collection;
      rehome(data, col);
      for (const x of restoring) {
        if (isCollectionId(data, x.collection.id)) continue; // already back (e.g. via sync)
        x.collection.updatedAt = now();
        const idx = Math.max(0, Math.min(x.origIndex ?? data.collections.length, data.collections.length));
        data.collections.splice(idx, 0, x.collection);
      }
      data.activeCollectionId = col.id;
    }
  });
}

/** Permanently delete a single trash entry (and subcollections trashed with it). */
export async function deleteTrashEntry(entryId) {
  await mutate((data) => {
    const e = (data.trash || []).find((x) => x.id === entryId);
    if (!e) return;
    const ids = trashSubtree(data, e);
    data.trash = data.trash.filter((x) => !ids.has(x.id));
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
  if (partial.type === 'highlight') {
    return {
      ...base,
      type: 'highlight',
      text: partial.text || '', // the quoted passage
      url: partial.url || '', // source page
      title: partial.title || '', // source page title
      note: partial.note || '', // user annotation
    };
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
    // Read-later state: pages saved with `unread` populate the Reading list.
    // Defaults to false so bulk imports don't flood it.
    unread: !!partial.unread,
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
    // Folders are flattened so parentId can't dangle to old ids, but
    // subcollections stay nested under their (re-id'd) parent collection.
    const newIds = new Map(incoming.collections.map((c) => [c.id, uid()]));
    for (const c of incoming.collections) {
      data.collections.push({
        ...c,
        id: newIds.get(c.id),
        parentId: newIds.get(c.parentId) || null,
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

/**
 * Import Edge's leftover `collectionsSQLite` database (for users who never
 * exported the CSV before Collections was retired). Unlike the CSV, this
 * recovers per-page thumbnails and favicons too.
 */
export async function importEdgeSqlite(bytes) {
  const { collections, stats } = mapEdgeSqlite(bytes);
  await mutate((data) => {
    for (const col of collections) {
      data.collections.push(
        newCollection({
          title: col.title,
          items: col.pages.map((p) =>
            makeItem({
              type: 'page',
              url: p.url,
              title: p.title,
              thumbnail: p.thumbnail || '',
              favIconUrl: p.favIconUrl || '',
            })
          ),
        })
      );
    }
  });
  return stats;
}

/** Import a Chrome/Edge bookmark tree as collections (one per folder). */
export async function importBookmarks(tree) {
  const { collections, stats } = mapBookmarks(tree);
  await mutate((data) => {
    for (const col of collections) {
      data.collections.push(
        newCollection({
          title: col.title,
          items: col.pages.map((p) => makeItem({ type: 'page', url: p.url, title: p.title })),
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
  const r = await backend().get(HISTORY_KEY);
  return Array.isArray(r) ? r : [];
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
  await backend().set(HISTORY_KEY, next);
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
// View preferences (local-only): itemSort/collectionSort are 'manual' | 'newest'
// | 'oldest'(items) | 'title'; itemDensity is 'comfortable' | 'compact'. These
// are display-only — they never rewrite the stored order.
const DEFAULT_SETTINGS = {
  cacheImages: false,
  theme: 'dark',
  autoCheckLinks: false,
  // When on, "Fetch missing images" overwrites images that are already set
  // instead of only filling in the blanks. Off by default so a bulk fetch never
  // clobbers covers you've already got. (opt-in)
  replaceExistingImages: false,
  itemSort: 'manual',
  itemDensity: 'comfortable',
  collectionSort: 'manual',
  // Compact density for the collection list, mirroring itemDensity: smaller
  // covers and tighter rows, so more collections fit on screen at once.
  collectionDensity: 'comfortable',
  // When off, saved pages are never marked unread and the Reading list (📖) UI
  // is hidden — for users who don't use read-it-later. On by default.
  readingListEnabled: true,
  // When on, "Open all pages" closes the side panel once the tabs are open, so
  // opening a collection is a single click. Off by default. (opt-in)
  closeAfterOpenAll: false,
  // One-time flag: whether we've shown the "set up Sync for a full backup" hint.
  syncHintShown: false,
  // How the toolbar icon opens the UI: 'sidepanel' docks it to the browser
  // window (the default), 'popup' floats panel.html in its own small window —
  // no dock/undock animation, and Esc closes it.
  openMode: 'sidepanel',
  // Where the pop-up window was last left, so it reopens in the same spot.
  // { left, top, width, height } or null for "wherever Chrome puts it".
  popupBounds: null,
  // Where clicking a saved page goes: 'newTab' (the default, and what the
  // panel has always done) or 'currentTab' to replace the page you're on.
  // Ctrl/middle-click still forces a new tab either way.
  openItemsIn: 'newTab',
  // Whether opening a saved page clears its unread flag. On by default, so the
  // Reading list stays accurate wherever you open a page from — previously only
  // the Reading list view itself did this.
  markReadOnOpen: true,
  // UI scale as a percentage (100 = default). Scales the whole panel — type,
  // spacing and thumbnails together — which is what "bigger on a large monitor"
  // actually needs. See UI_SCALES in panel.js for the allowed steps.
  uiScale: 100,
};

export async function getSettings() {
  const r = await backend().get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(r || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await backend().set(SETTINGS_KEY, next);
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

/**
 * Apply a batch of fetched page images in a single write. Each result is
 * `{ collectionId, itemId, thumbnail }`. Only page items are touched, and an
 * empty/missing thumbnail is ignored (a fetch that found nothing shouldn't wipe
 * an existing image). Batching keeps a whole "fetch missing images" run to one
 * storage change — one re-render / one sync push — and avoids the
 * read-modify-write races of many concurrent updateItem() calls.
 *
 * If a result's thumbnail promotes to the collection cover (the collection has
 * none yet), we set it here too, mirroring addItem()'s auto-cover behaviour.
 */
export async function applyImageResults(results) {
  if (!Array.isArray(results) || !results.length) return;
  await mutate((data) => {
    for (const r of results) {
      if (!r || !r.thumbnail) continue;
      const c = findCollection(data, r.collectionId);
      const it = c?.items.find((x) => x.id === r.itemId);
      if (!it || it.type !== 'page') continue;
      it.thumbnail = r.thumbnail;
      if (!c.cover) c.cover = r.thumbnail;
    }
  });
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

// ---- Auto-file rules -------------------------------------------------------

/** Add an auto-file rule. Returns the created rule (or null if invalid). */
export async function addRule({ type, value, collectionId }) {
  const RULE_TYPES = new Set(['domain', 'urlContains', 'titleContains']);
  if (!RULE_TYPES.has(type) || !value || !value.trim() || !collectionId) return null;
  const rule = { id: uid(), type, value: value.trim(), collectionId };
  await mutate((data) => {
    if (!Array.isArray(data.rules)) data.rules = [];
    data.rules.push(rule);
  });
  return rule;
}

export async function removeRule(id) {
  await mutate((data) => {
    data.rules = (data.rules || []).filter((r) => r.id !== id);
  });
}

// ---- Read-later state ------------------------------------------------------

/** Clear the unread flag on every page item (one write). Returns count cleared. */
export async function markAllRead() {
  let cleared = 0;
  await mutate((data) => {
    for (const c of data.collections) {
      for (const it of c.items) {
        if (it.type === 'page' && it.unread) {
          it.unread = false;
          cleared++;
        }
      }
    }
  });
  return cleared;
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
