// plus-connect.js — how the extension signs in to Plus Sync (hosted-adapter.js
// does the syncing). Pure, so it runs in the panel, the service worker and tests.
//
// The panel opens /api/sync/connect in a normal tab, because Google can refuse
// to sign in from an embedded auth window. The site signs the user in and
// redirects to a plain page with the device token in the URL fragment, where
// the service worker picks it up (a fragment never reaches a server).
//
// A random `state` ties the return to a connect this browser started. Without
// it, any site could open that page with a token for its own account, and this
// browser would start syncing the user's library to that account.

export const PLUS_ORIGIN = 'https://getcollectionsplus.com';
export const PLUS_API = `${PLUS_ORIGIN}/api/sync`;
export const PLUS_ACCOUNT_URL = `${PLUS_ORIGIN}/account`;
export const RETURN_PATH = '/sync-connected.html';
export const PLUS_STATE_KEY = 'plusSync'; // the adapter's { token, connectedAt }
export const PENDING_KEY = 'plusSyncPending'; // chrome.storage.session: the state
export const RETURN_KEY = 'plusSyncReturn'; // chrome.storage.local: for the panel

/** A fresh random state for one connect attempt. */
export function newConnectState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/** The page that starts sign-in for this attempt. */
export function connectUrl(state) {
  return `${PLUS_API}/connect?client=extension&state=${encodeURIComponent(state)}`;
}

/**
 * Read a connect return from a tab's URL. Returns { token } | { error }, or
 * null when it isn't the return of the attempt identified by `pendingState`.
 */
export function parseConnectReturn(url, pendingState) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== PLUS_ORIGIN || u.pathname !== RETURN_PATH || !pendingState) return null;
  const h = new URLSearchParams(u.hash.slice(1));
  if (h.get('state') !== pendingState) return null;
  const token = h.get('plus-token');
  if (token) return { token };
  const error = h.get('plus-error');
  return error ? { error } : null;
}
