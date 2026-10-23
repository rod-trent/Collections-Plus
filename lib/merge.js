// merge.js — reconcile two copies of the collections data blob, item by item.
//
// Sync used to be whole-file last-write-wins: whichever device wrote last
// replaced everything, so a phone saving pages all day would clobber edits made
// on the desktop in the meantime. mergeData() instead combines both sides:
//
//   • Every entity (collection, item, folder, rule) is matched by id across the
//     two blobs. Entities only one side has are kept.
//   • When both sides have it, the one with the newer version stamp wins:
//       collection → metaAt   (title/cover/pinned/tags/parent/order/location)
//       item       → lastModified  (content edits and moves between collections)
//       folder     → lastModified
//     Ties go to `local`, so merging is stable on the device doing it.
//   • A collection's items are merged independently of its metadata, so a
//     rename on one device and new items on the other both survive.
//   • Deletes are recorded as tombstones ({ scope, id, deletedAt }). An entity
//     is dropped when a tombstone for it is at least as new as its version — an
//     edit made after the delete brings it back.
//   • "Location" (active list / Archive / Trash) is part of a collection's or
//     folder's metadata, so archiving or trashing travels like any other edit.
//
// Pure and synchronous: no storage, no store.js import. Inputs should already
// be migrated to the current schema (store.js does that on every read); missing
// arrays/stamps are tolerated. Neither input is mutated.

const TOMBSTONE_SCOPES = new Set(['collection', 'item', 'folder', 'rule']);

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Union two tombstone lists, keeping the latest deletedAt per (scope, id). */
export function mergeTombstones(a, b) {
  const map = new Map();
  for (const t of [...arr(a), ...arr(b)]) {
    if (!t || !TOMBSTONE_SCOPES.has(t.scope) || !t.id) continue;
    const key = `${t.scope}:${t.id}`;
    const prev = map.get(key);
    if (!prev || num(t.deletedAt) > prev.deletedAt) {
      map.set(key, { scope: t.scope, id: t.id, deletedAt: num(t.deletedAt) });
    }
  }
  return map;
}

/** Collection version for metadata/location conflicts. */
function colVersion(c) {
  return num(c.metaAt) || num(c.updatedAt);
}

/** Every collection on one side, wherever it lives, keyed by id. */
function indexCollections(d) {
  const map = new Map();
  arr(d.collections).forEach((col) => map.set(col.id, { col, loc: 'active' }));
  arr(d.archive).forEach((col) => map.set(col.id, { col, loc: 'archive' }));
  for (const e of arr(d.trash)) {
    if (e?.kind === 'collection' && e.collection) {
      map.set(e.collection.id, { col: e.collection, loc: 'trash', entry: e });
    }
  }
  return map;
}

/** Every folder on one side (active or trashed), keyed by id. */
function indexFolders(d) {
  const map = new Map();
  arr(d.folders).forEach((folder) => map.set(folder.id, { folder, loc: 'active' }));
  for (const e of arr(d.trash)) {
    if (e?.kind === 'folder' && e.folder) {
      map.set(e.folder.id, { folder: e.folder, loc: 'trash', entry: e });
    }
  }
  return map;
}

/** Every item on one side, keyed by id, remembering which collection holds it. */
function indexItems(colIndex) {
  const map = new Map();
  for (const [colId, { col }] of colIndex) {
    for (const item of arr(col.items)) map.set(item.id, { item, colId });
  }
  return map;
}

/** Ids from `primary` order first, then any from `secondary` not yet seen. */
function unionOrder(primary, secondary) {
  const out = [];
  const seen = new Set();
  for (const id of [...primary, ...secondary]) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Pick the winning copy of an item, then let the loser fill in what background
 * work produced without bumping the version: link-check results (newest check
 * wins) and fetched/cached images (fill blanks, prefer inlined data: copies).
 */
function mergeItem(win, other) {
  const out = { ...win };
  if (win.fields && typeof win.fields === 'object') out.fields = { ...win.fields };
  if (!other) return out;

  if (num(other.linkCheckedAt) > num(win.linkCheckedAt)) {
    out.linkCheckedAt = other.linkCheckedAt;
    if ('linkStatus' in other) out.linkStatus = other.linkStatus;
    else delete out.linkStatus;
  }
  // Page watching: the newest check's fingerprint wins; change/seen stamps
  // take the max, so a dismissal and a newer change on another device both
  // survive. Only while the winner still watches — unwatching clears them.
  if (out.watch) {
    if (num(other.watchCheckedAt) > num(out.watchCheckedAt)) {
      out.watchCheckedAt = other.watchCheckedAt;
      out.watchHash = other.watchHash || out.watchHash;
    }
    if (num(other.watchLiveAt) > num(out.watchLiveAt)) {
      out.watchLiveAt = other.watchLiveAt;
      out.watchLiveHash = other.watchLiveHash || out.watchLiveHash;
    }
    for (const k of ['changedAt', 'changeSeenAt']) {
      if (num(other[k]) > num(out[k])) out[k] = other[k];
    }
  }
  for (const k of ['thumbnail', 'favIconUrl']) {
    if (!out[k] && other[k]) out[k] = other[k];
  }
  const isData = (v) => typeof v === 'string' && v.startsWith('data:');
  if (out.type === 'page' && isData(other.thumbnail) && out.thumbnail && !isData(out.thumbnail)) {
    out.thumbnail = other.thumbnail;
  }
  if (out.type === 'image' && isData(other.src) && !isData(out.src) && other.srcOriginal === out.src) {
    out.src = other.src;
    out.srcOriginal = other.srcOriginal;
  }
  return out;
}

/**
 * Merge two data blobs. Returns a new blob; `local` and `remote` are untouched.
 * activeCollectionId is per-device UI state, so local's is kept when it still
 * points at an active collection.
 */
export function mergeData(local, remote) {
  const L = local || {};
  const R = remote || {};
  const tombs = mergeTombstones(L.tombstones, R.tombstones);
  const deadAt = (scope, id) => tombs.get(`${scope}:${id}`)?.deletedAt;
  const isDead = (scope, id, version) => {
    const t = deadAt(scope, id);
    return t !== undefined && t >= num(version);
  };

  // ---- Collections: metadata + location ------------------------------------
  const lc = indexCollections(L);
  const rc = indexCollections(R);
  const cols = new Map(); // id -> { col (no items yet), loc, entry, a, b }
  for (const id of unionOrder([...lc.keys()], [...rc.keys()])) {
    const a = lc.get(id);
    const b = rc.get(id);
    const win = !b ? a : !a ? b : colVersion(b.col) > colVersion(a.col) ? b : a;
    const other = win === a ? b : a;
    // Anything touched after the delete (metadata or items) keeps it alive.
    const touched = Math.max(colVersion(win.col), num(win.col.updatedAt), other ? num(other.col.updatedAt) : 0);
    if (isDead('collection', id, touched)) continue;
    const col = { ...win.col, items: [] };
    if (!col.cover && other?.col.cover) col.cover = other.col.cover;
    col.updatedAt = Math.max(num(a?.col.updatedAt), num(b?.col.updatedAt)) || col.updatedAt;
    cols.set(id, { col, loc: win.loc, entry: win.entry, a, b });
  }

  // ---- Items: content + which collection holds them ------------------------
  const li = indexItems(lc);
  const ri = indexItems(rc);
  const placed = new Map(); // colId -> Map(itemId -> item)
  for (const id of unionOrder([...li.keys()], [...ri.keys()])) {
    const a = li.get(id);
    const b = ri.get(id);
    const win = !b ? a : !a ? b : num(b.item.lastModified) > num(a.item.lastModified) ? b : a;
    const other = win === a ? b : a;
    if (isDead('item', id, win.item.lastModified)) continue;
    if (!cols.has(win.colId)) continue; // its collection was deleted
    if (!placed.has(win.colId)) placed.set(win.colId, new Map());
    placed.get(win.colId).set(id, mergeItem(win.item, other?.item));
  }

  // Item order: the side whose copy of the collection changed last is the base
  // (updatedAt bumps on reorders); items only the other side has are appended.
  for (const [colId, rec] of cols) {
    const here = placed.get(colId) || new Map();
    const aIds = arr(rec.a?.col.items).map((it) => it.id);
    const bIds = arr(rec.b?.col.items).map((it) => it.id);
    const bNewer = num(rec.b?.col.updatedAt) > num(rec.a?.col.updatedAt);
    const order = unionOrder(bNewer ? bIds : aIds, bNewer ? aIds : bIds);
    const ids = unionOrder(order.filter((id) => here.has(id)), [...here.keys()]);
    rec.col.items = ids.map((id) => here.get(id));
  }

  // ---- Folders --------------------------------------------------------------
  const lf = indexFolders(L);
  const rf = indexFolders(R);
  const folders = new Map();
  for (const id of unionOrder([...lf.keys()], [...rf.keys()])) {
    const a = lf.get(id);
    const b = rf.get(id);
    const win = !b ? a : !a ? b : num(b.folder.lastModified) > num(a.folder.lastModified) ? b : a;
    if (isDead('folder', id, win.folder.lastModified)) continue;
    folders.set(id, win);
  }

  // ---- Rules (immutable; add or delete only) -------------------------------
  const rules = new Map();
  for (const r of [...arr(L.rules), ...arr(R.rules)]) {
    if (r?.id && !rules.has(r.id) && deadAt('rule', r.id) === undefined) rules.set(r.id, { ...r });
  }

  // ---- Rebuild --------------------------------------------------------------
  const inLoc = (loc, list) =>
    list.filter((id) => cols.get(id)?.loc === loc).map((id) => cols.get(id).col);
  const ids = (list) => arr(list).map((c) => c.id);
  const collections = inLoc('active', unionOrder(ids(L.collections), ids(R.collections)));
  const archive = inLoc('archive', unionOrder(ids(L.archive), ids(R.archive)));

  const trash = [];
  for (const { col, loc, entry } of cols.values()) {
    if (loc === 'trash') trash.push({ ...entry, collection: col });
  }
  for (const { folder, loc, entry } of folders.values()) {
    if (loc === 'trash') trash.push({ ...entry, folder: { ...folder } });
  }
  trash.sort((x, y) => num(y.deletedAt) - num(x.deletedAt));

  const folderOrder = unionOrder(ids(L.folders), ids(R.folders));
  const activeFolders = folderOrder
    .filter((id) => folders.get(id)?.loc === 'active')
    .map((id) => ({ ...folders.get(id).folder }));

  const activeIds = new Set(collections.map((c) => c.id));
  const activeCollectionId = activeIds.has(L.activeCollectionId)
    ? L.activeCollectionId
    : activeIds.has(R.activeCollectionId)
      ? R.activeCollectionId
      : collections[0]?.id || null;

  return {
    version: Math.max(num(L.version), num(R.version)),
    activeCollectionId,
    collections,
    folders: activeFolders,
    archive,
    trash,
    rules: [...rules.values()],
    tombstones: [...tombs.values()],
  };
}
