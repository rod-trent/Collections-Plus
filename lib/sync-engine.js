// sync-engine.js — one sync round against any RemoteAdapter (remote-adapter.js):
// pull → merge (lib/merge.js) → write local → push, retrying when the remote
// moves underneath us. Transport-agnostic: the PWA runs it over Dropbox today,
// and the same loop works over a hosted backend later.
//
// The blob on the wire is the same JSON the desktop extension's sync file holds
// (see lib/sync.js), so the extension and the PWA can share one file.

import { mergeData } from './merge.js';

/** The synced part of a data blob, as a string — for "did anything change?". */
export function syncContent(d) {
  return JSON.stringify([
    d?.collections || [],
    d?.folders || [],
    d?.archive || [],
    d?.trash || [],
    d?.rules || [],
    d?.tombstones || [],
  ]);
}

/** Serialize local data in the shared sync-file format. */
export function toSyncText(data) {
  return JSON.stringify(
    {
      version: data.version,
      activeCollectionId: data.activeCollectionId,
      collections: data.collections || [],
      folders: data.folders || [],
      archive: data.archive || [],
      trash: data.trash || [],
      rules: data.rules || [],
      tombstones: data.tombstones || [],
      exportedAt: Date.now(),
      app: 'Collections Plus',
    },
    null,
    2
  );
}

/** Parse a sync file into a data blob, or null if it isn't one. */
export function parseSyncText(text) {
  let p;
  try {
    p = JSON.parse(text);
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object' || !Array.isArray(p.collections)) return null;
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    version: Number(p.version) || 0,
    activeCollectionId: p.activeCollectionId || null,
    collections: p.collections,
    folders: arr(p.folders),
    archive: arr(p.archive),
    trash: arr(p.trash),
    rules: arr(p.rules),
    tombstones: arr(p.tombstones),
  };
}

/**
 * Run one sync round.
 *
 *   adapter  a RemoteAdapter (pull/push with optimistic-concurrency revs)
 *   store    { getData, setData } — store.js, or anything shaped like it
 *
 * Files written by pre-v4 extensions have no delete markers; they're merged
 * anyway (a phone save is never dropped), at the cost that a delete made on
 * such an old desktop may come back once.
 *
 * Returns { pulled, pushed }: whether local data changed, whether we wrote the
 * remote. Throws on transport errors (caller decides how to surface them).
 */
export async function syncOnce(adapter, store, { maxAttempts = 4 } = {}) {
  if (!adapter.isConnected()) return { pulled: false, pushed: false, skipped: true };
  let pulled = false;
  for (let attempt = 1; ; attempt++) {
    const local = await store.getData();
    const remoteRaw = await adapter.pull();
    const remote = remoteRaw ? parseSyncText(remoteRaw.text) : null;
    const merged = remote ? mergeData(local, remote) : local;

    if (syncContent(merged) !== syncContent(local)) {
      // A local edit may have landed while we were on the network; if so,
      // start over from fresh local data rather than overwrite it.
      if (syncContent(await store.getData()) !== syncContent(local)) {
        if (attempt < maxAttempts) continue;
        throw new Error('local data kept changing during sync');
      }
      await store.setData(merged);
      pulled = true;
    }

    if (remote && syncContent(merged) === syncContent(remote)) {
      return { pulled, pushed: false };
    }
    try {
      await adapter.push(toSyncText(merged), remoteRaw?.remoteRev);
      return { pulled, pushed: true };
    } catch (err) {
      // Someone wrote between our pull and push: pull again and re-merge.
      if (err?.name === 'ConflictError' && attempt < maxAttempts) continue;
      throw err;
    }
  }
}
