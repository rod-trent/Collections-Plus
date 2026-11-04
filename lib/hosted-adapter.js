// hosted-adapter.js — a RemoteAdapter (remote-adapter.js) over Plus Sync, the
// hosted tier on getcollectionsplus.com (site/app/api/sync/). Browser-only.
//
// Sign-in: the app sends the user to /api/sync/connect, which signs them in
// with Clerk and comes back to the app with a device token in the URL
// fragment (#plus-token=…). Every API call carries that token as a Bearer
// header. (Clerk's own session cookie only lives a minute without Clerk's
// script on the page to refresh it, and the app never loads Clerk.)
//
// Size: Vercel functions take at most 4.5 MB per request, and libraries hold
// their pictures inline. So push swaps every image for a `cpimg:<sha256>`
// reference (lib/image-split.js), uploads only the images the server lacks,
// then sends the small doc, gzipped. Pull downloads the images it doesn't
// have cached yet and swaps them back before syncOnce() sees the text. Merge
// and the sync-file format never see a reference.
//
// The server stores the doc without reading it, so end-to-end encryption can
// be added here later without server changes.
//
// Concurrency: the doc has an integer rev; push sends the rev it started from
// and the server answers 409 if another device wrote first → ConflictError.

import { ConflictError } from './remote-adapter.js';
import {
  splitImages,
  collectRefs,
  rehydrateImages,
  parseDataUrl,
  toDataUrl,
} from './image-split.js';

const STATE_KEY = 'plusSync'; // { token, connectedAt }
const PENDING_KEY = 'cp.plus.pending'; // sessionStorage: we started a connect
export const MAX_DOC_BYTES = 4 * 1024 * 1024;
const BATCH = 1000; // hashes per "which are missing?" call
const PARALLEL = 4;

/** Run `fn` over `items`, at most `n` at a time. */
async function eachLimit(items, n, fn) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function gzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function apiError(status, body) {
  const code = body?.error || '';
  let err;
  if (status === 401) {
    err = new Error('Plus Sync sign-in ended');
    err.code = 'reauth';
  } else if (status === 403) {
    err = new Error('Plus Sync isn’t enabled for this account');
    err.code = 'forbidden';
  } else if (status === 503 || status === 404) {
    err = new Error('Plus Sync isn’t available right now');
    err.code = 'unavailable';
  } else {
    err = new Error(body?.message || `Plus Sync error ${status}`);
    err.code = code || 'server';
  }
  err.status = status;
  return err;
}

/**
 * Create the adapter.
 *   base        API root (default '/api/sync', same origin as the app)
 *   kv          async { get, set, remove } for the device token
 *   imageCache  async { get, set } keyed by image hash → data URL (the PWA
 *               passes a separate IndexedDB store)
 *   session     sessionStorage-like, to tie a connect return to our request
 *   fetch, navigate  injectable for tests
 */
export function createHostedAdapter({
  base = '/api/sync',
  kv,
  imageCache,
  session = globalThis.sessionStorage,
  fetch: doFetch = (...a) => globalThis.fetch(...a),
  navigate = (url) => globalThis.location.assign(url),
  compress = typeof CompressionStream === 'function',
  // Slow on purpose: every check wakes the Neon database, and one that's
  // polled every few seconds never gets to sleep. The app also syncs when it
  // comes to the front and after every edit, so this only catches changes
  // from other devices while the app sits open.
  pollMs = 120000,
}) {
  let state = null;
  let loaded = false;
  let lastRev = null;
  let lastRefs = null; // hashes the last pulled/pushed doc referenced
  const hashOf = new Map(); // dataUrl → hash, so images hash once per session
  const mem = new Map(); // hash → dataUrl, in front of imageCache

  async function load() {
    if (!loaded) {
      state = (await kv.get(STATE_KEY)) || null;
      loaded = true;
    }
    return state;
  }

  async function save(next) {
    state = next;
    loaded = true;
    if (next) await kv.set(STATE_KEY, next);
    else await kv.remove(STATE_KEY);
  }

  async function remember(hash, dataUrl) {
    if (mem.has(hash)) return;
    mem.set(hash, dataUrl);
    try {
      await imageCache?.set(hash, dataUrl);
    } catch {
      /* the cache is an optimization; a full disk mustn't stop a sync */
    }
  }

  async function recall(hash) {
    if (mem.has(hash)) return mem.get(hash);
    const v = (await imageCache?.get(hash).catch(() => null)) || null;
    if (v) mem.set(hash, v);
    return v;
  }

  /** An authenticated API call. Throws coded errors for 401/403/5xx. */
  async function call(path, init = {}, { ok = [] } = {}) {
    const s = await load();
    if (!s?.token) throw apiError(401);
    const res = await doFetch(base + path, {
      ...init,
      cache: 'no-store',
      headers: { ...(init.headers || {}), Authorization: `Bearer ${s.token}` },
    });
    if (res.ok || ok.includes(res.status)) return res;
    const body = await res.json().catch(() => null);
    if (res.status === 401) await save(null); // token revoked: start over
    throw apiError(res.status, body);
  }

  const json = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function fetchImage(hash) {
    const res = await call(`/images/${hash}`, {}, { ok: [404] });
    if (res.status === 404) return null;
    const mime = (res.headers.get('Content-Type') || 'image/jpeg').split(';')[0];
    const url = toDataUrl(mime, new Uint8Array(await res.arrayBuffer()));
    await remember(hash, url);
    return url;
  }

  const adapter = {
    // ---- Connection --------------------------------------------------------

    /** Must be awaited once at startup so isConnected() reflects storage. */
    async init() {
      await load();
      return !!state;
    },

    isConnected() {
      return !!state?.token;
    },

    /**
     * Is Plus Sync reachable for this browser? Resolves to 'ok' (signed in
     * and enabled), 'signed-out' (open; sign in to continue), 'forbidden'
     * (signed in, not invited) or 'unavailable' (not set up / offline).
     */
    async probe() {
      try {
        const s = await load();
        const res = await doFetch(base + '/status', {
          cache: 'no-store',
          headers: s?.token ? { Authorization: `Bearer ${s.token}` } : {},
        });
        if (res.ok) return 'ok';
        if (res.status === 401) return 'signed-out';
        if (res.status === 403) return 'forbidden';
        return 'unavailable';
      } catch {
        return 'unavailable';
      }
    },

    /** Go sign in; the server comes back to the app with a device token. */
    beginConnect() {
      session?.setItem(PENDING_KEY, '1');
      navigate(base + '/connect');
    },

    /**
     * Read (and strip from the address bar) a connect return in `url`.
     * Synchronous so the token leaves the address bar before anything renders.
     * Returns { token } | { error } | null.
     */
    takeConnectReturn(url, replaceUrl = (u) => globalThis.history?.replaceState(null, '', u)) {
      const u = new URL(url);
      const h = new URLSearchParams(u.hash.slice(1));
      const token = h.get('plus-token');
      const error = h.get('plus-error');
      if (!token && !error) return null;
      replaceUrl(u.pathname + u.search);
      const pending = session?.getItem(PENDING_KEY);
      session?.removeItem(PENDING_KEY);
      if (error) return { error };
      // Only accept a token from a connect this app started.
      if (!pending) return { error: 'unexpected' };
      return { token };
    },

    /** Store the token from takeConnectReturn(). */
    async completeConnect({ token }) {
      lastRev = null;
      lastRefs = null;
      await save({ token, connectedAt: Date.now() });
    },

    /** Usage for display: { rev, updatedAt, docBytes, imageCount, imageBytes, quotaBytes }. */
    async status() {
      return (await call('/status')).json();
    },

    /**
     * Stop syncing on this device. The server forgets this device's token;
     * `deleteData` also erases the library stored on the server.
     */
    async disconnect({ deleteData = false } = {}) {
      try {
        if (state?.token) await call(deleteData ? '' : '/device', { method: 'DELETE' });
      } catch {
        /* best effort — the local token is dropped either way */
      }
      lastRev = null;
      lastRefs = null;
      await save(null);
    },

    // ---- RemoteAdapter -----------------------------------------------------

    async pull() {
      const res = await call('/doc', {}, { ok: [204] });
      if (res.status === 204) {
        lastRev = null;
        lastRefs = new Set();
        return null; // first device: nothing there yet
      }
      const rev = res.headers.get('X-Sync-Rev');
      let bytes = new Uint8Array(await res.arrayBuffer());
      if (res.headers.get('X-Doc-Encoding') === 'gzip') bytes = await gunzip(bytes);
      const tree = JSON.parse(new TextDecoder().decode(bytes));

      const refs = collectRefs(tree);
      const found = new Map();
      const need = [];
      for (const h of refs) {
        const url = await recall(h);
        if (url) found.set(h, url);
        else need.push(h);
      }
      await eachLimit(need, PARALLEL, async (h) => {
        const url = await fetchImage(h);
        if (url) found.set(h, url);
      });
      rehydrateImages(tree, (h) => found.get(h));
      lastRev = rev;
      lastRefs = refs;
      return { text: JSON.stringify(tree), remoteRev: rev };
    },

    async push(text, prevRev) {
      const tree = JSON.parse(text);
      const { refs, images } = await splitImages(tree, { hashOf });
      for (const [h, url] of images) await remember(h, url);

      // Upload only what the server doesn't have yet.
      const all = [...refs];
      const missing = [];
      for (let i = 0; i < all.length; i += BATCH) {
        const res = await call('/images/missing', json({ hashes: all.slice(i, i + BATCH) }));
        missing.push(...(await res.json()).missing);
      }
      await eachLimit(missing, PARALLEL, async (h) => {
        const url = images.get(h) || (await recall(h));
        const img = url && parseDataUrl(url);
        if (!img) return; // nothing to send; a pull will show it as no picture
        await call(`/images/${h}`, { method: 'PUT', headers: { 'Content-Type': img.mime }, body: img.bytes });
      });

      let body = new TextEncoder().encode(JSON.stringify(tree));
      let encoding = 'identity';
      if (compress) {
        body = await gzip(body);
        encoding = 'gzip';
      }
      if (body.byteLength > MAX_DOC_BYTES) {
        const err = new Error('Your library is too large for Plus Sync');
        err.code = 'too-large';
        throw err;
      }
      const res = await call(
        '/doc',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Doc-Encoding': encoding,
            'X-Sync-Prev-Rev': prevRev == null ? '' : String(prevRev),
          },
          body,
        },
        { ok: [409] }
      );
      if (res.status === 409) throw new ConflictError();
      lastRev = String((await res.json()).rev);

      // Some pictures were dropped since the last doc: free their storage.
      const dropped = lastRefs && [...lastRefs].some((h) => !refs.has(h));
      lastRefs = refs;
      if (dropped) await adapter.pruneImages({ rev: lastRev, keep: refs }).catch(() => {});
      return { remoteRev: lastRev };
    },

    /**
     * Delete stored images the current doc doesn't reference. With no
     * arguments it pulls the doc first to learn what it references. The
     * server only deletes when `rev` is still current, and spares images any
     * device touched in the last hour (one may be mid-push).
     */
    async pruneImages({ rev, keep } = {}) {
      if (rev == null || !keep) {
        const res = await call('/doc', {}, { ok: [204] });
        if (res.status === 204) return { deleted: 0 };
        rev = res.headers.get('X-Sync-Rev');
        let bytes = new Uint8Array(await res.arrayBuffer());
        if (res.headers.get('X-Doc-Encoding') === 'gzip') bytes = await gunzip(bytes);
        keep = collectRefs(JSON.parse(new TextDecoder().decode(bytes)));
      }
      const res = await call('/images/prune', json({ rev: String(rev), keep: [...keep] }), { ok: [409] });
      if (res.status === 409) return { deleted: 0 };
      return res.json();
    },

    /**
     * Poll the doc's rev while the page is visible (and whenever it becomes
     * visible again); fire `cb` when another device changed it.
     */
    onRemoteChange(cb) {
      let stopped = false;
      const check = async () => {
        if (stopped || !adapter.isConnected()) return;
        if (globalThis.document?.visibilityState === 'hidden') return;
        try {
          const res = await call('/doc', { method: 'HEAD' }, { ok: [204] });
          const rev = res.headers.get('X-Sync-Rev');
          if (rev && rev !== lastRev) {
            lastRev = rev;
            cb();
          }
        } catch {
          /* offline or transient — try again next tick */
        }
      };
      const timer = setInterval(check, pollMs);
      const onVis = () => check();
      globalThis.document?.addEventListener('visibilitychange', onVis);
      return () => {
        stopped = true;
        clearInterval(timer);
        globalThis.document?.removeEventListener('visibilitychange', onVis);
      };
    },
  };
  return adapter;
}
