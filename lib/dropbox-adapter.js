// dropbox-adapter.js — a RemoteAdapter (remote-adapter.js) over the user's own
// Dropbox, for the PWA. Browser-only: OAuth 2 with PKCE (no client secret, so
// it's safe in a static web app), then the Dropbox HTTP API via fetch.
//
// The app is registered with "App folder" access, so it only ever sees
// Dropbox/Apps/<app name>/ — the sync file lives there as SYNC_PATH. Desktop
// users point the extension's file sync at the same file.
//
// Concurrency: every pull returns the file's Dropbox `rev`; push uploads in
// "update" mode against that rev with strict_conflict, so a write that lost a
// race fails with ConflictError instead of clobbering the other device.

import { ConflictError } from './remote-adapter.js';

export const SYNC_PATH = '/collections-sync.json';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const AUTH_KEY = 'dropboxAuth'; // { accessToken, expiresAt, refreshToken, accountId }
const VERIFIER_KEY = 'cp.dropbox.pkce'; // sessionStorage, survives the redirect only

/**
 * Dropbox-API-Arg is an HTTP header, so it must be ASCII: escape anything
 * outside it as \uXXXX (Dropbox's documented requirement).
 */
export function headerSafeJson(obj) {
  return JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkcePair() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/**
 * Create the adapter.
 *   appKey       Dropbox app key (public; from the Dropbox App Console)
 *   redirectUri  where Dropbox sends the user back — must be registered there
 *   kv           async { get, set, remove } for tokens (the PWA passes its
 *                IndexedDB-backed store backend)
 *   session      sessionStorage-like, for the PKCE verifier across the redirect
 *   fetch, navigate  injectable for tests
 */
export function createDropboxAdapter({
  appKey,
  redirectUri,
  kv,
  path = SYNC_PATH,
  session = globalThis.sessionStorage,
  fetch: doFetch = (...a) => globalThis.fetch(...a),
  navigate = (url) => globalThis.location.assign(url),
  pollMs = 30000,
}) {
  let auth = null; // cached copy of the stored tokens
  let loaded = false;
  let lastRev = null; // last rev we saw or wrote, for change detection

  async function load() {
    if (!loaded) {
      auth = (await kv.get(AUTH_KEY)) || null;
      loaded = true;
    }
    return auth;
  }

  async function save(next) {
    auth = next;
    loaded = true;
    if (next) await kv.set(AUTH_KEY, next);
    else await kv.remove(AUTH_KEY);
  }

  async function tokenRequest(params) {
    const res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: appKey, ...params }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error_description || body.error || `token request failed (${res.status})`);
      err.code = body.error === 'invalid_grant' ? 'reauth' : 'auth';
      throw err;
    }
    return body;
  }

  /** A valid access token, refreshing it a minute before it expires. */
  async function accessToken() {
    const a = await load();
    if (!a) {
      const err = new Error('Dropbox is not connected');
      err.code = 'reauth';
      throw err;
    }
    if (a.accessToken && Date.now() < a.expiresAt - 60000) return a.accessToken;
    try {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refreshToken });
      await save({ ...a, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 });
      return auth.accessToken;
    } catch (err) {
      if (err.code === 'reauth') await save(null); // token revoked: start over
      throw err;
    }
  }

  /** Authenticated Dropbox call; retries once on an expired token. */
  async function call(url, init, retried = false) {
    const token = await accessToken();
    const res = await doFetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && !retried) {
      await save({ ...auth, expiresAt: 0 });
      return call(url, init, true);
    }
    return res;
  }

  async function errorSummary(res) {
    const body = await res.json().catch(() => null);
    return body?.error_summary || `Dropbox error ${res.status}`;
  }

  async function currentRev() {
    const res = await call(`${API}/files/get_metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (res.status === 409) {
      const summary = await errorSummary(res);
      if (summary.includes('not_found')) return null;
      throw new Error(summary);
    }
    if (!res.ok) throw new Error(await errorSummary(res));
    return (await res.json()).rev;
  }

  const adapter = {
    // ---- Connection --------------------------------------------------------

    /** Must be awaited once at startup so isConnected() reflects storage. */
    async init() {
      await load();
      return !!auth;
    },

    isConnected() {
      return !!auth?.refreshToken;
    },

    /** Send the user to Dropbox to approve access. Resolves just before leaving. */
    async beginAuth() {
      const { verifier, challenge } = await pkcePair();
      const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
      session.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state }));
      const q = new URLSearchParams({
        client_id: appKey,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        token_access_type: 'offline', // we want a refresh token
        redirect_uri: redirectUri,
        state,
      });
      navigate(`${AUTH_URL}?${q}`);
    },

    /**
     * Finish the OAuth redirect if `url` carries one. Returns true when it
     * connected, false when the URL isn't an OAuth return. Throws on a denied
     * or tampered response.
     */
    async completeAuth(url) {
      const u = new URL(url);
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      if (!code && !error) return false;
      const pending = JSON.parse(session.getItem(VERIFIER_KEY) || 'null');
      session.removeItem(VERIFIER_KEY);
      if (error) throw new Error(u.searchParams.get('error_description') || error);
      if (!pending || pending.state !== u.searchParams.get('state')) {
        throw new Error('the response could not be verified. Please try again.');
      }
      const t = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        code_verifier: pending.verifier,
        redirect_uri: redirectUri,
      });
      await save({
        accessToken: t.access_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        refreshToken: t.refresh_token,
        accountId: t.account_id,
      });
      return true;
    },

    /** Forget the tokens and tell Dropbox to revoke them. */
    async disconnect() {
      try {
        if (auth?.accessToken) await call(`${API}/auth/token/revoke`, { method: 'POST' });
      } catch {
        /* best effort — local tokens are dropped either way */
      }
      lastRev = null;
      await save(null);
    },

    // ---- RemoteAdapter -----------------------------------------------------

    async pull() {
      const res = await call(`${CONTENT}/files/download`, {
        method: 'POST',
        headers: { 'Dropbox-API-Arg': headerSafeJson({ path }) },
      });
      if (res.status === 409) {
        const summary = await errorSummary(res);
        if (summary.includes('not_found')) {
          lastRev = null;
          return null; // first device: nothing there yet
        }
        throw new Error(summary);
      }
      if (!res.ok) throw new Error(await errorSummary(res));
      const text = await res.text();
      let rev = null;
      try {
        rev = JSON.parse(res.headers.get('Dropbox-API-Result') || 'null')?.rev || null;
      } catch {
        /* fall through to a metadata lookup */
      }
      if (!rev) rev = await currentRev();
      lastRev = rev;
      return { text, remoteRev: rev };
    },

    async push(text, prevRev) {
      const mode = prevRev ? { '.tag': 'update', update: prevRev } : { '.tag': 'add' };
      const res = await call(`${CONTENT}/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': headerSafeJson({ path, mode, autorename: false, mute: true, strict_conflict: true }),
        },
        body: text,
      });
      if (res.status === 409) {
        const summary = await errorSummary(res);
        if (summary.includes('conflict')) throw new ConflictError(summary);
        throw new Error(summary);
      }
      if (!res.ok) throw new Error(await errorSummary(res));
      lastRev = (await res.json()).rev;
      return { remoteRev: lastRev };
    },

    /**
     * Poll the file's rev while the page is visible (and whenever it becomes
     * visible again); fire `cb` when another device changed it.
     */
    onRemoteChange(cb) {
      let stopped = false;
      const check = async () => {
        if (stopped || !adapter.isConnected()) return;
        if (globalThis.document?.visibilityState === 'hidden') return;
        try {
          const rev = await currentRev();
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
