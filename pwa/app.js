// app.js — PWA bootstrap and minimal renderer.
//
// The whole point of this file: pick the IndexedDB backend, then use the SAME
// store.js the extension uses. Everything below getData()/createCollection()/
// addItem()/importJSON() is shared, unchanged code.

import { setBackend } from '../lib/backend.js';
import { createIdbBackend } from '../lib/idb-backend.js';

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
});

document.getElementById('import-json').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    await store.importJSON(text, 'merge');
    setStatus('Imported.');
    await render();
  } catch (err) {
    setStatus('Import failed: ' + err.message, true);
  } finally {
    e.target.value = '';
  }
});

// ---- Boot ------------------------------------------------------------------

render().catch((err) => setStatus('Failed to load: ' + err.message, true));

if ('serviceWorker' in navigator) {
  // Registered after first paint so it never blocks boot. Scope is this folder.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell is a progressive enhancement; the app works without it */
    });
  });
}
