// app.js — PWA bootstrap and minimal renderer.
//
// The whole point of this file: pick the IndexedDB backend, then use the SAME
// store.js the extension uses. Everything below getData()/createCollection()/
// addItem()/importJSON() is shared, unchanged code.

import { setBackend, backend } from '../lib/backend.js';
import { createIdbBackend } from '../lib/idb-backend.js';
import { createDropboxAdapter } from '../lib/dropbox-adapter.js';
import { syncOnce } from '../lib/sync-engine.js';
import { DROPBOX_APP_KEY } from './config.js';

// MUST run before any store.js call — store.js reads the active backend lazily
// on each operation, so as long as we set it before the first getData() we're
// safe, but doing it first-thing keeps that guarantee obvious.
setBackend(createIdbBackend());

import * as store from '../lib/store.js';

const els = {
  list: document.getElementById('collections'),
  empty: document.getElementById('empty'),
  status: document.getElementById('status'),
};

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle('error', isError);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function itemLine(it) {
  if (it.type === 'note') return `<span class="kind">note</span><span class="note-text">${esc(it.text)}</span>`;
  if (it.type === 'highlight')
    return `<span class="kind">quote</span><span class="note-text">“${esc(it.text)}”${it.url ? ` — <a href="${esc(it.url)}" target="_blank" rel="noopener">source</a>` : ''}</span>`;
  if (it.type === 'image')
    return `<span class="kind">image</span><a href="${esc(it.srcPageUrl || it.src)}" target="_blank" rel="noopener">${esc(it.alt || it.srcPageUrl || 'image')}</a>`;
  return `<span class="kind">page</span><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a>`;
}

async function render() {
  const data = await store.getData();
  els.list.innerHTML = '';
  els.empty.hidden = data.collections.length > 0;

  for (const c of data.collections) {
    const d = document.createElement('details');
    d.className = 'collection';
    const items = (c.items || []).map((it) => `<li class="item">${itemLine(it)}</li>`).join('');
    d.innerHTML =
      `<summary><span>${esc(c.title)}</span>` +
      `<span class="count">${(c.items || []).length} · <button data-add="${esc(c.id)}">+ page</button></span></summary>` +
      `<ul class="items">${items || '<li class="item"><span class="note-text">empty</span></li>'}</ul>`;
    els.list.appendChild(d);
  }

  const total = data.collections.reduce((n, c) => n + (c.items || []).length, 0);
  setStatus(`${data.collections.length} collections · ${total} items · IndexedDB`);
}

// ---- Actions ---------------------------------------------------------------

document.getElementById('new-collection').addEventListener('click', async () => {
  const title = prompt('New collection name:', 'New collection');
  if (title == null) return;
  await store.createCollection(title.trim() || 'New collection');
  await render();
  scheduleSync();
});

// Delegated "+ page" buttons inside each collection.
els.list.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-add]');
  if (!btn) return;
  e.preventDefault();
  const url = prompt('Page URL:');
  if (!url) return;
  const title = prompt('Title (optional):', url) || url;
  await store.addItem(btn.dataset.add, { type: 'page', url: url.trim(), title });
  await render();
  scheduleSync();
});

document.getElementById('import-json').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await store.importJSON(text, 'merge');
    setStatus('Imported.');
    await render();
    scheduleSync();
  } catch (err) {
    setStatus('Import failed: ' + err.message, true);
  } finally {
    e.target.value = '';
  }
});

// ---- Dropbox sync ----------------------------------------------------------
// The user's own Dropbox holds the same sync file the desktop extension uses.
// Every round is pull → merge → push (lib/sync-engine.js), so edits made here
// and on the desktop are combined, never overwritten.

const syncEls = {
  bar: document.getElementById('sync-bar'),
  state: document.getElementById('sync-state'),
  connect: document.getElementById('sync-connect'),
  now: document.getElementById('sync-now'),
  disconnect: document.getElementById('sync-disconnect'),
};

// The OAuth redirect comes back to this page's folder (register it in Dropbox).
const dropbox = DROPBOX_APP_KEY
  ? createDropboxAdapter({
      appKey: DROPBOX_APP_KEY,
      redirectUri: new URL('./', location.href).href,
      kv: backend(),
    })
  : null;

let syncing = null; // the in-flight round, so rounds never overlap
let syncAgain = false;
let syncTimer = null;
let lastSyncAt = 0;
let stopWatching = null;

function showSync(msg, isError = false) {
  syncEls.state.textContent = msg;
  syncEls.state.classList.toggle('error', isError);
}

function refreshSyncBar() {
  if (!dropbox) return;
  syncEls.bar.hidden = false;
  const on = dropbox.isConnected();
  syncEls.connect.hidden = on;
  syncEls.now.hidden = !on;
  syncEls.disconnect.hidden = !on;
  if (!on) showSync('Sync with your desktop through Dropbox');
}

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/** Run a sync round now (or once more after the current one finishes). */
async function syncNow() {
  if (!dropbox?.isConnected()) return;
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  showSync('Syncing…');
  syncing = (async () => {
    try {
      const { pulled } = await syncOnce(dropbox, store);
      lastSyncAt = Date.now();
      showSync(`Synced ${ago(lastSyncAt)} · Dropbox`);
      if (pulled) await render();
    } catch (err) {
      if (err?.code === 'reauth') {
        refreshSyncBar();
        showSync('Dropbox access ended — connect again to keep syncing', true);
      } else if (!navigator.onLine) {
        showSync('Offline — changes will sync when you reconnect');
      } else {
        console.warn('Sync failed', err);
        showSync('Sync failed — ' + err.message, true);
      }
    } finally {
      syncing = null;
      if (syncAgain) {
        syncAgain = false;
        syncNow();
      }
    }
  })();
  return syncing;
}

/** Debounced sync after a local edit, so a burst of edits is one upload. */
function scheduleSync() {
  if (!dropbox?.isConnected()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

function watchRemote() {
  stopWatching?.();
  stopWatching = dropbox.isConnected() ? dropbox.onRemoteChange(syncNow) : null;
}

async function initSync() {
  if (!dropbox) return;
  let authError = null;
  try {
    // Returning from Dropbox's consent screen: finish sign-in, tidy the URL.
    if (await dropbox.completeAuth(location.href)) {
      history.replaceState(null, '', new URL('./', location.href).pathname);
    }
  } catch (err) {
    history.replaceState(null, '', new URL('./', location.href).pathname);
    authError = 'Dropbox sign-in failed — ' + err.message;
  }
  await dropbox.init();
  refreshSyncBar();
  if (authError) showSync(authError, true);
  watchRemote();
  await syncNow();
}

syncEls.connect.addEventListener('click', () => dropbox.beginAuth());
syncEls.now.addEventListener('click', () => syncNow());
syncEls.disconnect.addEventListener('click', async () => {
  if (!confirm('Stop syncing with Dropbox? Your collections stay on this device.')) return;
  await dropbox.disconnect();
  watchRemote();
  refreshSyncBar();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow();
});
window.addEventListener('online', () => syncNow());

// ---- Boot ------------------------------------------------------------------

render()
  .then(initSync)
  .catch((err) => setStatus('Failed to load: ' + err.message, true));

if ('serviceWorker' in navigator) {
  // Registered after first paint so it never blocks boot. Scope is this folder.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell is a progressive enhancement; the app works without it */
    });
  });
}
