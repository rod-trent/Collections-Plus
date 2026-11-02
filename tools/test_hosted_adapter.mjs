// Tests for lib/hosted-adapter.js + lib/sync-engine.js against a fake Plus
// Sync API (an in-memory server behind an injected fetch, with the same rules
// as site/app/api/sync/). Covers the connect return, first push, pull with
// images put back, uploading only missing images, the 409 → ConflictError →
// retry path, image clean-up, and 401/403 errors.
// `node tools/test_hosted_adapter.mjs`. Exits non-zero on failure.
import { webcrypto, createHash, randomBytes } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

const { createHostedAdapter, MAX_DOC_BYTES } = await import('../lib/hosted-adapter.js');
const { syncOnce } = await import('../lib/sync-engine.js');
const { isImageRef } = await import('../lib/image-split.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// ---- Fake Plus Sync server ---------------------------------------------------

const BASE = 'https://getcollectionsplus.com/api/sync';
const srv = {
  tokens: new Map(), // token -> userId
  allowed: new Set(['user_ok']),
  docs: new Map(), // userId -> { rev, bytes, encoding }
  images: new Map(), // `${userId}:${hash}` -> { mime, bytes, touched }
  calls: [],
  beforePut: null, // hook: simulate another device writing mid-sync
  reset() {
    this.docs.clear();
    this.images.clear();
    this.calls = [];
    this.beforePut = null;
  },
};

function reply(status, body, headers = {}) {
  const buf = body == null ? new Uint8Array() : body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(new TextDecoder().decode(buf)),
    text: async () => new TextDecoder().decode(buf),
  };
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

async function fakeFetch(url, init = {}) {
  const method = init.method || 'GET';
  const path = url.slice(BASE.length);
  const headers = init.headers || {};
  srv.calls.push(`${method} ${path}`);
  const token = (headers.Authorization || '').replace(/^Bearer /, '');
  const userId = srv.tokens.get(token);
  if (!userId) return reply(401, { error: 'signed-out' });
  if (!srv.allowed.has(userId)) return reply(403, { error: 'not-enabled' });

  if (path === '/status') return reply(200, { rev: srv.docs.get(userId)?.rev ?? null });

  if (path === '/doc') {
    const d = srv.docs.get(userId);
    if (method === 'GET' || method === 'HEAD') {
      if (!d) return reply(204, null);
      return reply(200, method === 'HEAD' ? null : d.bytes, { 'X-Sync-Rev': String(d.rev), 'X-Doc-Encoding': d.encoding });
    }
    if (method === 'PUT') {
      if (srv.beforePut) {
        const hook = srv.beforePut;
        srv.beforePut = null;
        await hook(userId);
      }
      const cur = srv.docs.get(userId);
      const prev = headers['X-Sync-Prev-Rev'] || '';
      const body = new Uint8Array(init.body);
      if (body.byteLength > MAX_DOC_BYTES) return reply(413, { error: 'too-large' });
      if (prev ? !cur || String(cur.rev) !== prev : cur) return reply(409, { error: 'conflict' });
      const rev = (cur?.rev || 0) + 1;
      srv.docs.set(userId, { rev, bytes: body, encoding: headers['X-Doc-Encoding'] });
      return reply(200, { rev: String(rev) });
    }
  }

  if (path === '/images/missing') {
    const { hashes } = JSON.parse(init.body);
    return reply(200, { missing: hashes.filter((h) => !srv.images.has(`${userId}:${h}`)) });
  }

  if (path === '/images/prune') {
    const { rev, keep } = JSON.parse(init.body);
    if (String(srv.docs.get(userId)?.rev) !== rev) return reply(409, { error: 'conflict' });
    const k = new Set(keep);
    let deleted = 0;
    for (const key of [...srv.images.keys()]) {
      const [u, h] = key.split(':');
      if (u === userId && !k.has(h)) {
        srv.images.delete(key);
        deleted++;
      }
    }
    return reply(200, { deleted });
  }

  const m = /^\/images\/([0-9a-f]{64})$/.exec(path);
  if (m) {
    const key = `${userId}:${m[1]}`;
    if (method === 'PUT') {
      const bytes = new Uint8Array(init.body);
      if (sha(bytes) !== m[1]) return reply(400, { error: 'hash-mismatch' });
      srv.images.set(key, { mime: headers['Content-Type'], bytes });
      return reply(200, { ok: true });
    }
    const img = srv.images.get(key);
    if (!img) return reply(404, { error: 'not-found' });
    return reply(200, img.bytes, { 'Content-Type': img.mime });
  }
  return reply(404, { error: 'no-route' });
}

// ---- Devices ---------------------------------------------------------------

function memKv() {
  const m = new Map();
  return {
    m,
    async get(k) {
      return m.has(k) ? structuredClone(m.get(k)) : undefined;
    },
    async set(k, v) {
      m.set(k, structuredClone(v));
    },
    async remove(k) {
      m.delete(k);
    },
  };
}
function memSession() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

let tokenN = 0;
async function device(userId = 'user_ok') {
  const kv = memKv();
  const imageCache = memKv();
  const session = memSession();
  let navigated = null;
  const adapter = createHostedAdapter({
    base: BASE,
    kv,
    imageCache,
    session,
    fetch: fakeFetch,
    navigate: (u) => (navigated = u),
  });
  await adapter.init();
  // The connect round trip: the app starts it, the site comes back with a token.
  adapter.beginConnect();
  const token = `cps_test${++tokenN}`;
  srv.tokens.set(token, userId);
  let cleaned = null;
  const ret = adapter.takeConnectReturn(`https://getcollectionsplus.com/app/#plus-token=${token}`, (u) => (cleaned = u));
  await adapter.completeConnect(ret);
  return { adapter, kv, imageCache, session, navigated, cleaned, token };
}

const mkStore = (data) => ({
  data,
  async getData() {
    return structuredClone(this.data);
  },
  async setData(d) {
    this.data = structuredClone(d);
  },
});
const img = (n = 40000, mime = 'image/jpeg') => `data:${mime};base64,${randomBytes(n).toString('base64')}`;
const page = (id, t, thumbnail = '') => ({ id, type: 'page', title: id, url: `https://${id}.example/`, thumbnail, lastModified: t, addedAt: t });
const col = (items, cover = null) => ({ id: 'c1', title: 'Shared', metaAt: 1, updatedAt: 1, cover, items });
const data = (collections) => ({ version: 4, collections, folders: [], archive: [], trash: [], rules: [], tombstones: [] });
const docTree = async (userId = 'user_ok') => {
  const d = srv.docs.get(userId);
  let bytes = d.bytes;
  if (d.encoding === 'gzip') {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(s).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
};
const count = (prefix) => srv.calls.filter((c) => c.startsWith(prefix)).length;

// ---- Tests -----------------------------------------------------------------

console.log('connect return:');
{
  const d = await device();
  assert(d.navigated === `${BASE}/connect`, 'beginConnect goes to /api/sync/connect');
  assert(d.cleaned === '/app/', 'the token is stripped from the address bar');
  assert(d.adapter.isConnected() && d.kv.m.get('plusSync').token === d.token, 'token stored; adapter connected');

  const stray = createHostedAdapter({ base: BASE, kv: memKv(), session: memSession(), fetch: fakeFetch });
  const r = stray.takeConnectReturn('https://getcollectionsplus.com/app/#plus-token=cps_evil', () => {});
  assert(r?.error === 'unexpected', 'a token this app didn’t ask for is refused');
  const e = stray.takeConnectReturn('https://getcollectionsplus.com/app/#plus-error=not-enabled', () => {});
  assert(e?.error === 'not-enabled', 'an error return is reported');
  assert(stray.takeConnectReturn('https://getcollectionsplus.com/app/#/c/abc', () => {}) === null, 'ordinary routes are left alone');
}

console.log('\nfirst push:');
srv.reset();
const cover = img();
const thumbA = img();
const thumbB = img(30000, 'image/png');
const phone = await device();
const phoneStore = mkStore(data([col([page('a', 1, thumbA), page('b', 2, thumbB), page('a2', 3, thumbA)], cover)]));
{
  const r = await syncOnce(phone.adapter, phoneStore);
  assert(r.pushed && !r.pulled, 'first sync pushes');
  assert(count('PUT /images/') === 3, 'uploads each distinct image once (3 images, 4 uses)');
  const d = srv.docs.get('user_ok');
  assert(d.rev === 1 && d.encoding === 'gzip', 'doc stored at rev 1, gzipped');
  assert(d.bytes.byteLength < 2000, `doc is small without its images (${d.bytes.byteLength} bytes)`);
  const tree = await docTree();
  const c = tree.collections[0];
  assert(isImageRef(c.cover) && isImageRef(c.items[0].thumbnail), 'doc holds cpimg: refs, not data URLs');
  assert(c.items[0].thumbnail === c.items[2].thumbnail, 'the same picture shares one ref');
  assert(!JSON.stringify(tree).includes('data:image'), 'no inline image reaches the server');
}

console.log('\npull on a second device puts images back:');
const tablet = await device();
const tabletStore = mkStore(data([]));
{
  srv.calls = [];
  const r = await syncOnce(tablet.adapter, tabletStore);
  assert(r.pulled, 'tablet pulled the library');
  const c = tabletStore.data.collections[0];
  assert(c?.cover === cover, 'cover rehydrated byte for byte');
  assert(c.items.find((i) => i.id === 'b').thumbnail === thumbB, 'PNG thumbnail rehydrated with its type');
  assert(c.items.find((i) => i.id === 'a2').thumbnail === thumbA, 'shared picture rehydrated everywhere');
  assert(count('GET /images/') === 3, 'downloaded each image once');
  assert(tablet.imageCache.m.size === 3, 'images cached by hash');

  srv.calls = [];
  await syncOnce(tablet.adapter, tabletStore);
  assert(count('GET /images/') === 0, 'a later pull uses the cache, no downloads');
}

console.log('\nonly missing images are uploaded:');
{
  const thumbC = img();
  phoneStore.data.collections[0].items.push(page('c', 10, thumbC));
  srv.calls = [];
  const r = await syncOnce(phone.adapter, phoneStore);
  assert(r.pushed, 'phone pushed its new page');
  assert(count('PUT /images/') === 1, 'only the new picture was uploaded');
  assert(count('POST /images/missing') === 1, 'asked once which images were missing');
  assert(srv.docs.get('user_ok').rev === 2, 'rev moved to 2');
}

console.log('\n409 → ConflictError → retry through syncOnce:');
{
  // The tablet edits; just before its push lands, the phone syncs a change.
  const thumbD = img();
  tabletStore.data.collections[0].items.push(page('t', 20, thumbD));
  phoneStore.data.collections[0].items.push(page('p', 21));
  srv.beforePut = async () => {
    await syncOnce(phone.adapter, phoneStore);
  };
  srv.calls = [];
  const r = await syncOnce(tablet.adapter, tabletStore);
  assert(r.pushed, 'tablet push succeeded after the retry');
  assert(srv.calls.filter((c) => c === 'GET /doc').length >= 3, 'tablet re-pulled after the conflict');
  const ids = tabletStore.data.collections[0].items.map((i) => i.id);
  assert(ids.includes('t') && ids.includes('p') && ids.includes('c'), 'tablet has both devices’ edits');
  await syncOnce(phone.adapter, phoneStore);
  const pids = phoneStore.data.collections[0].items.map((i) => i.id);
  assert(pids.includes('t') && pids.includes('p'), 'phone got the tablet’s edit');
  assert(phoneStore.data.collections[0].items.find((i) => i.id === 't').thumbnail === thumbD, 'and its picture');
  const tree = await docTree();
  assert(tree.collections[0].items.length === 6, 'server doc has every page once');
}

console.log('\nimage clean-up:');
{
  const before = srv.images.size;
  // Drop the only page that used thumbB.
  phoneStore.data.collections[0].items = phoneStore.data.collections[0].items.filter((i) => i.id !== 'b');
  phoneStore.data.collections[0].items.forEach((i) => (i.lastModified = 100));
  phoneStore.data.collections[0].updatedAt = 100;
  phoneStore.data.tombstones = [{ scope: 'item', id: 'b', deletedAt: 100 }];
  srv.calls = [];
  await syncOnce(phone.adapter, phoneStore);
  assert(count('POST /images/prune') === 1, 'a push that dropped a picture runs a clean-up');
  assert(srv.images.size === before - 1, 'the unreferenced image was deleted');

  srv.calls = [];
  phoneStore.data.collections[0].title = 'Renamed';
  phoneStore.data.collections[0].metaAt = 200;
  await syncOnce(phone.adapter, phoneStore);
  assert(count('POST /images/prune') === 0, 'no clean-up when nothing was dropped');

  const orphan = img(1000);
  const ob = Buffer.from(orphan.split(',')[1], 'base64');
  srv.images.set(`user_ok:${sha(ob)}`, { mime: 'image/jpeg', bytes: new Uint8Array(ob) });
  const out = await tablet.adapter.pruneImages();
  assert(out.deleted === 1, 'on-demand clean-up pulls the doc and removes strays');
}

console.log('\nerrors:');
{
  const banned = await device('user_not_invited');
  let err = null;
  try {
    await syncOnce(banned.adapter, mkStore(data([])));
  } catch (e) {
    err = e;
  }
  assert(err?.code === 'forbidden', '403 → code "forbidden"');
  assert(banned.adapter.isConnected(), '403 keeps the token (an invite may come later)');

  srv.tokens.delete(tablet.token); // signed out on the account page
  err = null;
  try {
    await syncOnce(tablet.adapter, tabletStore);
  } catch (e) {
    err = e;
  }
  assert(err?.code === 'reauth', '401 → code "reauth"');
  assert(!tablet.adapter.isConnected() && !tablet.kv.m.has('plusSync'), '401 drops the revoked token');

  assert((await phone.adapter.probe()) === 'ok', 'probe: ok when signed in and invited');
  assert((await banned.adapter.probe()) === 'forbidden', 'probe: forbidden when not invited');
  assert((await tablet.adapter.probe()) === 'signed-out', 'probe: signed-out without a token');
  const offline = createHostedAdapter({ base: BASE, kv: memKv(), fetch: async () => { throw new TypeError('offline'); } });
  assert((await offline.probe()) === 'unavailable', 'probe: unavailable when the API can’t be reached');
  const missing = createHostedAdapter({ base: BASE, kv: memKv(), fetch: async () => reply(404, null) });
  assert((await missing.probe()) === 'unavailable', 'probe: unavailable where there is no API (static preview)');
}

console.log('\nremote change polling:');
{
  let fired = 0;
  const watcher = await device();
  await syncOnce(watcher.adapter, mkStore(data([])));
  const stop = watcher.adapter.onRemoteChange(() => fired++);
  stop();
  assert(typeof stop === 'function', 'onRemoteChange returns an unsubscribe');
  // HEAD /doc reports the rev; a rev other than the last one seen fires.
  const res = await fakeFetch(`${BASE}/doc`, { method: 'HEAD', headers: { Authorization: `Bearer ${watcher.token}` } });
  assert(res.headers.get('X-Sync-Rev') === String(srv.docs.get('user_ok').rev), 'HEAD /doc carries the rev');
  assert(fired === 0, 'no change, no callback');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall hosted-adapter tests passed');
