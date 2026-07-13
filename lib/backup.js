// backup.js — best-effort recovery snapshot in chrome.storage.sync.
//
// chrome.storage.sync is tied to the browser account, not the extension's local
// storage, so it survives an extension reset / repair / reinstall (the exact
// event that wiped a user's collections). We mirror a *lightweight* copy of the
// data here — titles, links, notes, tags, folder structure and colors — but NOT
// heavy bytes (cached thumbnails, image data URLs, readable snapshots). Those
// would blow past Chrome's sync quota and aren't needed to get a user's
// research back.
//
// Chrome's sync quota is ~102,400 bytes total and 8,192 bytes per item, so the
// payload is split into string chunks across several keys. If a library is too
// big even when stripped down, the stalest collections are dropped first and a
// `truncated` flag is recorded.

import { getData, setData } from './store.js';

const META_KEY = 'bkMeta';
const CHUNK_PREFIX = 'bk';
const CHUNK_SIZE = 7000; // chars per chunk value — under the 8,192-byte item cap
const MAX_CHUNKS = 13; // 13 * 7000 = 91,000 bytes — under the ~102,400 total cap
const MAX_BYTES = CHUNK_SIZE * MAX_CHUNKS;

function available() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
}

// ---- Lightweight projection ------------------------------------------------

function lightItem(it) {
  const base = { id: it.id, type: it.type, addedAt: it.addedAt, done: !!it.done };
  if (it.type === 'note') return { ...base, text: it.text || '' };
  if (it.type === 'highlight') {
    return { ...base, text: it.text || '', url: it.url || '', title: it.title || '', note: it.note || '' };
  }
  if (it.type === 'image') {
    // Drop the (potentially huge) image bytes; keep where it came from.
    return { ...base, srcPageUrl: it.srcPageUrl || '', alt: it.alt || '', fields: it.fields || {} };
  }
  // page — drop thumbnail/favicon/snapshot bytes, keep the link and metadata.
  return {
    ...base,
    url: it.url,
    title: it.title || '',
    note: it.note || '',
    unread: !!it.unread,
    fields: it.fields || {},
  };
}

function lightCollection(c) {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    pinned: !!c.pinned,
    tags: c.tags || [],
    parentId: c.parentId || null,
    items: (c.items || []).map(lightItem),
  };
}

function lightFolders(folders) {
  return (folders || []).map((f) => ({
    id: f.id,
    name: f.name,
    collapsed: !!f.collapsed,
    color: f.color || null,
  }));
}

function serialize(collections, folders, activeCollectionId) {
  return JSON.stringify({ v: 1, activeCollectionId, collections, folders });
}

/** Build a size-bounded payload string, dropping the stalest collections first. */
function buildPayload(data) {
  const folders = lightFolders(data.folders);
  // Most-recently-updated first, so any truncation sheds the least-used data.
  const all = [...data.collections]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(lightCollection);
  let kept = all;
  let truncated = false;
  let json = serialize(kept, folders, data.activeCollectionId);
  while (json.length > MAX_BYTES && kept.length > 1) {
    kept = kept.slice(0, kept.length - 1);
    truncated = true;
    json = serialize(kept, folders, data.activeCollectionId);
  }
  return { json, truncated, kept: kept.length, total: all.length };
}

// ---- Public API ------------------------------------------------------------

/** Mirror the current data into chrome.storage.sync. Returns a status object. */
export async function saveBackup() {
  if (!available()) return { ok: false, reason: 'unavailable' };
  const data = await getData();
  const { json, truncated, kept, total } = buildPayload(data);

  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push(json.slice(i, i + CHUNK_SIZE));

  const set = {
    [META_KEY]: { v: 1, at: Date.now(), n: chunks.length, count: kept, total, truncated },
  };
  chunks.forEach((ch, i) => (set[CHUNK_PREFIX + i] = ch));
  // Clear any chunk keys left over from a previously larger backup.
  const stale = [];
  for (let i = chunks.length; i < MAX_CHUNKS + 4; i++) stale.push(CHUNK_PREFIX + i);

  try {
    await chrome.storage.sync.set(set);
    if (stale.length) await chrome.storage.sync.remove(stale);
    return { ok: true, truncated, count: kept, total };
  } catch (e) {
    return { ok: false, reason: 'quota', error: String(e && e.message ? e.message : e) };
  }
}

/** Read and reassemble the light backup (or null if none / unreadable). */
export async function loadBackup() {
  if (!available()) return null;
  const meta = (await chrome.storage.sync.get(META_KEY))[META_KEY];
  if (!meta || !meta.n) return null;
  const keys = Array.from({ length: meta.n }, (_, i) => CHUNK_PREFIX + i);
  const parts = await chrome.storage.sync.get(keys);
  const json = keys.map((k) => parts[k] || '').join('');
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.collections)) return null;
  return {
    ...parsed,
    at: meta.at || 0,
    truncated: !!meta.truncated,
    count: meta.count || parsed.collections.length,
    total: meta.total || parsed.collections.length,
  };
}

/** Metadata only (no full read) — for menus/status text. */
export async function backupStatus() {
  if (!available()) return { available: false };
  const meta = (await chrome.storage.sync.get(META_KEY))[META_KEY];
  return {
    available: true,
    at: meta?.at || 0,
    count: meta?.count || 0,
    total: meta?.total || 0,
    truncated: !!meta?.truncated,
  };
}

/**
 * Overwrite local data with the backup. Intended for recovery when local
 * storage was wiped; getData()/migrate() backfills the light items on read.
 * Returns the number of collections restored.
 */
export async function restoreBackup() {
  const b = await loadBackup();
  if (!b || !b.collections.length) return { restored: 0 };
  await setData({
    activeCollectionId: b.activeCollectionId || b.collections[0]?.id || null,
    collections: b.collections,
    folders: b.folders || [],
    archive: [],
    trash: [],
  });
  return { restored: b.collections.length, truncated: b.truncated };
}

/** Wipe the backup from sync storage (e.g. on user request). */
export async function clearBackup() {
  if (!available()) return;
  const keys = [META_KEY];
  for (let i = 0; i < MAX_CHUNKS + 4; i++) keys.push(CHUNK_PREFIX + i);
  await chrome.storage.sync.remove(keys);
}
