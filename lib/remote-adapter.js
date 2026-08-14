// remote-adapter.js — the contract every sync backend implements.
//
// A RemoteAdapter is how a device reaches the ONE shared data blob, wherever it
// lives. The desktop extension's file-in-a-cloud-folder (lib/sync.js), a PWA
// Dropbox/Drive/OneDrive OAuth client, or a future hosted backend (Clerk + our
// storage) are all just different adapters behind this same interface — so the
// sync engine (pull → merge → push) and the merge logic (lib/merge.js) are
// written once and reused across all of them.
//
// Contract — all methods async unless noted:
//
//   isConnected(): boolean            (sync)
//       Whether the adapter is configured and ready (file chosen / OAuth token
//       present). The engine no-ops when false.
//
//   pull(): Promise<{ text, remoteRev } | null>
//       Fetch the current remote blob as a raw JSON string plus an opaque
//       revision tag (Drive etag, Dropbox rev, file lastModified, DB version…).
//       Returns null when the remote has nothing yet (first-ever sync).
//
//   push(text, prevRev?): Promise<{ remoteRev }>
//       Write the blob back. `prevRev` is the revision the engine started from;
//       the adapter uses it for optimistic concurrency and MUST throw a
//       ConflictError if the remote moved on since (someone else wrote between
//       our pull and push) so the engine can re-pull, re-merge, and retry.
//
//   onRemoteChange(cb): () => void
//       Register a listener fired when the remote changes out-of-band (file
//       lastModified poll, provider webhook/delta, storage event). Returns an
//       unsubscribe function. Optional: adapters that can't observe changes may
//       return a no-op.
//
// The blob text is the same shape store.exportJSON() produces and importJSON()
// accepts — including `tombstones`, which MUST survive the round-trip for merge
// to resolve deletes. mergeData() reconciles two such blobs.

/** Thrown by push() when the remote revision no longer matches prevRev. */
export class ConflictError extends Error {
  constructor(message = 'remote changed since pull') {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Throw if an object doesn't look like a RemoteAdapter. Cheap guard for the
 * engine / tests; not a full type check.
 */
export function assertAdapter(a) {
  for (const m of ['isConnected', 'pull', 'push', 'onRemoteChange']) {
    if (typeof a?.[m] !== 'function') {
      throw new TypeError(`RemoteAdapter is missing ${m}()`);
    }
  }
  return a;
}

/**
 * A no-op adapter: never connected, nothing to pull, rejects pushes. Handy as a
 * default before a real backend is configured, and as a test stand-in.
 */
export const nullAdapter = {
  isConnected: () => false,
  async pull() {
    return null;
  },
  async push() {
    throw new Error('no remote configured');
  },
  onRemoteChange() {
    return () => {};
  },
};
