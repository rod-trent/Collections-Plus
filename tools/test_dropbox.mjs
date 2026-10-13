// Tests for lib/dropbox-adapter.js + lib/sync-engine.js against a fake Dropbox
// (an in-memory server behind an injected fetch). Covers the PKCE sign-in,
// token refresh, rev-based conflict detection, and two devices syncing through
// one Dropbox file. `node tools/test_dropbox.mjs`. Exits non-zero on failure.
import { webcrypto, createHash } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}
let clock = 1_800_000_000_000;
Date.now = () => ++clock;

const { createDropboxAdapter, headerSafeJson, SYNC_PATH } = await import('../lib/dropbox-adapter.js');
const { syncOnce, toSyncText } = await import('../lib/sync-engine.js');
const { ConflictError } = await import('../lib/remote-adapter.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// ---- Fake Dropbox -----------------------------------------------------------

const APP_KEY = 'test-app-key';
const REDIRECT = 'https://getcollectionsplus.com/app/';
const dbx = {
  files: new Map(), // path -> { text, rev }
  revN: 0,
  codes: new Map(), // auth code -> code_challenge
  access: new Map(), // access token -> expiresAt
  refresh: new Set(),
  beforeUpload: null, // hook to simulate another device writing mid-sync
  calls: [],
};
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function reply(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}
function issueTokens() {
  const access = 'at-' + ++dbx.revN;
  const refresh = 'rt-' + dbx.revN;
  dbx.access.set(access, Date.now() + 4 * 3600 * 1000);
  dbx.refresh.add(refresh);
  return { access_token: access, refresh_token: refresh, expires_in: 14400, account_id: 'dbid:me' };
}

async function fakeFetch(url, init = {}) {
  dbx.calls.push(url);
  const h = init.headers || {};
  if (url === 'https://api.dropboxapi.com/oauth2/token') {
    const p = new URLSearchParams(init.body);
    if (p.get('client_id') !== APP_KEY) return reply(400, { error: 'invalid_client' });
    if (p.get('grant_type') === 'authorization_code') {
      const challenge = dbx.codes.get(p.get('code'));
      const fromVerifier = b64url(createHash('sha256').update(p.get('code_verifier') || '').digest());
      if (!challenge || challenge !== fromVerifier || p.get('redirect_uri') !== REDIRECT) {
        return reply(400, { error: 'invalid_grant' });
      }
      dbx.codes.delete(p.get('code'));
      return reply(200, issueTokens());
    }
    if (p.get('grant_type') === 'refresh_token') {
      if (!dbx.refresh.has(p.get('refresh_token'))) return reply(400, { error: 'invalid_grant' });
      const access = 'at-' + ++dbx.revN;
      dbx.access.set(access, Date.now() + 4 * 3600 * 1000);
      return reply(200, { access_token: access, expires_in: 14400 });
    }
  }
  const token = (h.Authorization || '').replace('Bearer ', '');
  if (!(dbx.access.get(token) > Date.now())) return reply(401, { error_summary: 'expired_access_token/' });

  if (url.endsWith('/2/auth/token/revoke')) {
    dbx.access.delete(token);
    return reply(200, 'null');
  }
  if (url.endsWith('/2/files/get_metadata')) {
    const f = dbx.files.get(JSON.parse(init.body).path);
    return f ? reply(200, { rev: f.rev }) : reply(409, { error_summary: 'path/not_found/..' });
  }
  if (url.endsWith('/2/files/download')) {
    const f = dbx.files.get(JSON.parse(h['Dropbox-API-Arg']).path);
    if (!f) return reply(409, { error_summary: 'path/not_found/...' });
    return reply(200, f.text, { 'Dropbox-API-Result': JSON.stringify({ rev: f.rev }) });
  }
  if (url.endsWith('/2/files/upload')) {
    if (dbx.beforeUpload) {
      const hook = dbx.beforeUpload;
      dbx.beforeUpload = null;
      hook();
    }
    const arg = JSON.parse(h['Dropbox-API-Arg']);
    const f = dbx.files.get(arg.path);
    const ok =
      arg.mode['.tag'] === 'add' ? !f : arg.mode['.tag'] === 'update' && f && f.rev === arg.mode.update;
    if (!ok) return reply(409, { error_summary: 'path/conflict/file/..' });
    const rev = 'rev' + ++dbx.revN;
    dbx.files.set(arg.path, { text: init.body, rev });
    return reply(200, { rev });
  }
  return reply(404, { error_summary: 'unknown endpoint' });
}

/** A device: its own token storage, session storage and captured redirects. */
function device() {
  const kv = new Map();
  const ss = new Map();
  const dev = { navigatedTo: null };
  dev.adapter = createDropboxAdapter({
    appKey: APP_KEY,
    redirectUri: REDIRECT,
    kv: { get: async (k) => kv.get(k), set: async (k, v) => kv.set(k, v), remove: async (k) => kv.delete(k) },
    session: { getItem: (k) => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: (k) => ss.delete(k) },
    fetch: fakeFetch,
    navigate: (url) => (dev.navigatedTo = url),
  });
  dev.kv = kv;
  return dev;
}

/** Walk a device through sign-in, playing Dropbox's consent screen. */
async function signIn(dev) {
  await dev.adapter.beginAuth();
  const u = new URL(dev.navigatedTo);
  const code = 'code-' + ++dbx.revN;
  dbx.codes.set(code, u.searchParams.get('code_challenge'));
  return dev.adapter.completeAuth(`${REDIRECT}?code=${code}&state=${u.searchParams.get('state')}`);
}

// ---- Tests -----------------------------------------------------------------

console.log('sign-in (OAuth PKCE):');
{
  const dev = device();
  await dev.adapter.init();
  assert(!dev.adapter.isConnected(), 'starts disconnected');
  await dev.adapter.beginAuth();
  const u = new URL(dev.navigatedTo);
  assert(u.origin + u.pathname === 'https://www.dropbox.com/oauth2/authorize', 'sends the user to Dropbox');
  assert(
    u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('token_access_type') === 'offline',
    'asks for PKCE (S256) and a refresh token'
  );
  assert(!(await dev.adapter.completeAuth(REDIRECT)), 'a normal page load is not an OAuth return');
  let threw = false;
  try {
    await dev.adapter.completeAuth(`${REDIRECT}?code=x&state=forged`);
  } catch {
    threw = true;
  }
  assert(threw && !dev.adapter.isConnected(), 'a mismatched state is rejected');

  const dev2 = device();
  assert(await signIn(dev2), 'the real round trip connects');
  assert(dev2.adapter.isConnected() && dev2.kv.get('dropboxAuth').refreshToken, 'tokens are stored');
}

console.log('\nfile transport:');
{
  dbx.files.clear();
  const dev = device();
  await signIn(dev);
  assert((await dev.adapter.pull()) === null, 'no file yet → pull returns null');
  const { remoteRev } = await dev.adapter.push('{"v":1}');
  assert(!!remoteRev && dbx.files.get(SYNC_PATH).text === '{"v":1}', 'first push creates the file');
  const got = await dev.adapter.pull();
  assert(got.text === '{"v":1}' && got.remoteRev === remoteRev, 'pull returns text + rev');
  await dev.adapter.push('{"v":2}', got.remoteRev);
  let conflict = null;
  try {
    await dev.adapter.push('{"v":3}', got.remoteRev); // stale rev
  } catch (err) {
    conflict = err;
  }
  assert(conflict instanceof ConflictError, 'pushing over a stale rev throws ConflictError');
  assert(dbx.files.get(SYNC_PATH).text === '{"v":2}', '…and does not overwrite');
  let addConflict = null;
  try {
    await dev.adapter.push('{"v":4}'); // "add" when the file exists
  } catch (err) {
    addConflict = err;
  }
  assert(addConflict instanceof ConflictError, 'creating over an existing file throws ConflictError');
  assert(headerSafeJson({ path: '/Café' }) === '{"path":"/Caf\\u00e9"}', 'API-arg header is ASCII-escaped');
}

console.log('\ntokens:');
{
  const dev = device();
  await signIn(dev);
  const stored = dev.kv.get('dropboxAuth');
  dev.kv.set('dropboxAuth', { ...stored, expiresAt: Date.now() - 1 }); // expired
  const fresh = device();
  fresh.kv.set('dropboxAuth', dev.kv.get('dropboxAuth'));
  await fresh.adapter.init();
  await fresh.adapter.pull();
  assert(fresh.kv.get('dropboxAuth').accessToken !== stored.accessToken, 'an expired token is refreshed');

  const revoked = fresh.kv.get('dropboxAuth').accessToken;
  dbx.access.delete(revoked); // server-side expiry the client can't see
  const pulled = await fresh.adapter.pull().then(() => true, () => false);
  assert(pulled && fresh.kv.get('dropboxAuth').accessToken !== revoked, 'a 401 triggers one refresh + retry');

  dbx.refresh.clear(); // user revoked the app in Dropbox
  dbx.access.clear();
  let err = null;
  try {
    await fresh.adapter.pull();
  } catch (e) {
    err = e;
  }
  assert(err?.code === 'reauth' && !fresh.adapter.isConnected(), 'a revoked refresh token disconnects cleanly');
}

console.log('\ntwo devices syncing through Dropbox:');
{
  dbx.files.clear();
  // Minimal in-memory store per device, shaped like store.js's getData/setData.
  const mkStore = (data) => ({
    data,
    async getData() {
      return structuredClone(this.data);
    },
    async setData(d) {
      this.data = structuredClone(d);
    },
  });
  const col = (items) => ({ id: 'c1', title: 'Shared', metaAt: 1, updatedAt: 1, items });
  const page = (id, t) => ({ id, type: 'page', title: id, url: `https://${id}`, lastModified: t, addedAt: t });
  const base = { version: 4, collections: [col([page('seed', 1)])], folders: [], archive: [], trash: [], rules: [], tombstones: [] };

  const phone = device();
  const laptop = device();
  await signIn(phone);
  await signIn(laptop);
  const phoneStore = mkStore(structuredClone(base));
  const laptopStore = mkStore(structuredClone(base));

  let r = await syncOnce(phone.adapter, phoneStore);
  assert(r.pushed && !r.pulled, 'first device seeds the Dropbox file');

  phoneStore.data.collections[0].items.push(page('phone-save', 10));
  phoneStore.data.collections[0].updatedAt = 10;
  laptopStore.data.collections[0].items.push(page('laptop-save', 11));
  laptopStore.data.collections[0].updatedAt = 11;

  await syncOnce(phone.adapter, phoneStore);
  r = await syncOnce(laptop.adapter, laptopStore);
  assert(r.pulled && r.pushed, 'laptop pulls the phone save and pushes its own');
  await syncOnce(phone.adapter, phoneStore);
  const ids = (s) => s.data.collections[0].items.map((it) => it.id).sort();
  assert(
    JSON.stringify(ids(phoneStore)) === JSON.stringify(['laptop-save', 'phone-save', 'seed']) &&
      JSON.stringify(ids(phoneStore)) === JSON.stringify(ids(laptopStore)),
    'both devices end with both saves'
  );

  // Another device writes between our pull and push: we must retry, not clobber.
  phoneStore.data.collections[0].items.push(page('phone-2', 20));
  phoneStore.data.collections[0].updatedAt = 20;
  dbx.beforeUpload = () => {
    const f = dbx.files.get(SYNC_PATH);
    const d = JSON.parse(f.text);
    d.collections[0].items.push(page('sneaky', 21));
    dbx.files.set(SYNC_PATH, { text: toSyncText(d), rev: 'rev' + ++dbx.revN });
  };
  r = await syncOnce(phone.adapter, phoneStore);
  const final = JSON.parse(dbx.files.get(SYNC_PATH).text).collections[0].items.map((it) => it.id);
  assert(final.includes('sneaky') && final.includes('phone-2'), 'a write that lands mid-sync is merged, not overwritten');
  assert(ids(phoneStore).includes('sneaky'), '…and pulled into the phone');

  r = await syncOnce(phone.adapter, phoneStore);
  assert(!r.pulled && !r.pushed, 'an idle sync reads but writes nothing');
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Dropbox tests passed.');
