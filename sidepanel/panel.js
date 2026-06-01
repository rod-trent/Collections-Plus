// panel.js — side panel UI controller.
import {
  getData,
  createCollection,
  renameCollection,
  removeCollection,
  setActive,
  setCover,
  setPinned,
  setTags,
  reorderCollections,
  addItem,
  updateItem,
  removeItem,
  removeItems,
  moveItems,
  copyItems,
  toggleDone,
  reorderItems,
  exportJSON,
  importJSON,
  importEdgeCsv,
  STORAGE_KEY,
} from '../lib/store.js';
import { toCsv } from '../lib/export.js';
import { toMarkdown, toHtml, toLinkList } from '../lib/render.js';
import { fileToCover } from '../lib/image.js';
import * as sync from '../lib/sync.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  listView: $('#list-view'),
  detailView: $('#detail-view'),
  collections: $('#collections'),
  listEmpty: $('#list-empty'),
  listNoResults: $('#list-no-results'),
  searchbar: $('#searchbar'),
  searchInput: $('#search-input'),
  items: $('#items'),
  detailEmpty: $('#detail-empty'),
  detailTitle: $('#detail-title'),
  detailCover: $('#detail-cover'),
  coverRemoveBtn: $('#cover-remove-btn'),
  syncStatus: $('#sync-status'),
  fileInput: $('#file-input'),
  toast: $('#toast'),
};

// View state: which collection (if any) is open, and how the file input is used.
let openId = null;
let fileMode = null; // 'csv' | 'json' | 'cover'
let query = ''; // current list-view search text (lower-cased)

// ---- Helpers ---------------------------------------------------------------

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

function faviconFor(item) {
  if (item.favIconUrl) return item.favIconUrl;
  // Fall back to a generic favicon service-free approach: the page's origin.
  try {
    return `${new URL(item.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2600);
}

function openMenu(menu, open) {
  menu.hidden = !open;
}

// Close any open overflow menus when clicking elsewhere.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu').forEach((m) => {
    if (m.id === 'move-menu') return; // handled separately (floating)
    if (!m.hidden && !m.parentElement.contains(e.target)) m.hidden = true;
  });
});

// ---- Move / copy an item to another collection -----------------------------
const moveMenu = $('#move-menu');

async function openMoveMenu(anchor, fromId, itemId) {
  const data = await getData();
  const others = data.collections.filter((c) => c.id !== fromId);
  if (!others.length) {
    toast('No other collection to move to');
    return;
  }
  moveMenu.dataset.from = fromId;
  moveMenu.dataset.item = itemId;
  moveMenu.innerHTML =
    `<div class="menu-note">Move or copy to…</div>` +
    others
      .map(
        (c) => `
      <div class="move-row">
        <button class="move-go" data-act="move" data-to="${c.id}" title="Move here">${escapeHtml(
          c.title
        )}</button>
        <button class="move-copy" data-act="copy" data-to="${c.id}" title="Copy here">⎘</button>
      </div>`
      )
      .join('');
  // Unhide to measure, then position near the anchor and keep it on-screen.
  moveMenu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = moveMenu.offsetWidth || 220;
  const mh = moveMenu.offsetHeight || 0;
  let left = Math.max(8, r.right - mw);
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  moveMenu.style.left = `${left}px`;
  moveMenu.style.top = `${top}px`;
}

moveMenu.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const to = btn.dataset.to;
  const from = moveMenu.dataset.from;
  const itemId = moveMenu.dataset.item;
  moveMenu.hidden = true;
  if (btn.dataset.act === 'copy') {
    await copyItems(from, [itemId], to);
    toast('Copied to collection');
  } else {
    await moveItems(from, [itemId], to);
    toast('Moved to collection');
  }
});

document.addEventListener('click', (e) => {
  if (!moveMenu.hidden && !moveMenu.contains(e.target) && !e.target.closest('.item-move-btn')) {
    moveMenu.hidden = true;
  }
});

// ---- Rendering -------------------------------------------------------------

async function render() {
  const data = await getData();
  if (openId && data.collections.some((c) => c.id === openId)) {
    renderDetail(data.collections.find((c) => c.id === openId));
  } else {
    openId = null;
    renderList(data);
  }
}

/** Does a collection match the current search query? (title, tags, item text) */
function matchesQuery(c) {
  if (!query) return true;
  if (c.title.toLowerCase().includes(query)) return true;
  if ((c.tags || []).some((t) => t.toLowerCase().includes(query))) return true;
  return c.items.some((it) => {
    const hay = [it.title, it.url, it.text, it.alt, it.note, it.srcPageUrl]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  });
}

function renderList(data) {
  els.detailView.hidden = true;
  els.listView.hidden = false;

  const all = data.collections;
  els.searchbar.hidden = all.length === 0;
  els.listEmpty.hidden = all.length > 0;

  // Filter by search, then float pinned collections to the top (stable sort
  // keeps the manual drag order within each group).
  const filtered = all.filter(matchesQuery);
  const visible = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  els.listNoResults.hidden = !(all.length > 0 && visible.length === 0);
  els.collections.hidden = visible.length === 0;
  els.collections.innerHTML = '';

  for (const c of visible) {
    const card = document.createElement('div');
    card.className = 'card' + (c.pinned ? ' pinned' : '');
    card.setAttribute('role', 'listitem');
    card.dataset.id = c.id;

    const coverInner = c.cover
      ? `<div class="card-cover" style="background-image:url('${encodeURI(c.cover)}')"></div>`
      : `<div class="card-cover">🗂️</div>`;
    const tagsHtml = (c.tags || []).length
      ? `<div class="card-tags">${c.tags
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join('')}</div>`
      : '';

    card.innerHTML = `
      <span class="card-handle" title="Drag to reorder">⠿</span>
      ${coverInner}
      <div class="card-body">
        <div class="card-title">${escapeHtml(c.title)}</div>
        <div class="card-meta">${c.items.length} item${c.items.length === 1 ? '' : 's'}</div>
        ${tagsHtml}
      </div>
      <button class="card-pin" title="${c.pinned ? 'Unpin' : 'Pin to top'}">${c.pinned ? '📌' : '📍'}</button>
      <button class="card-del" title="Delete collection">🗑</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-del') || e.target.closest('.card-pin') || e.target.closest('.card-handle'))
        return;
      if (card.dataset.dragged) return; // a drag just finished; don't open
      open(c.id);
    });
    card.querySelector('.card-pin').addEventListener('click', async (e) => {
      e.stopPropagation();
      await setPinned(c.id, !c.pinned);
    });
    card.querySelector('.card-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${c.title}" and its ${c.items.length} item(s)?`)) {
        await removeCollection(c.id);
      }
    });
    // Click a tag chip to filter the list by it.
    card.querySelectorAll('.tag').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        query = el.textContent.toLowerCase();
        els.searchInput.value = el.textContent;
        render();
      });
    });

    wireCardDrag(card);
    els.collections.appendChild(card);
  }
}

// ---- Drag & drop reorder (collection list) ---------------------------------

let cardDragId = null;

function wireCardDrag(card) {
  // Only allow dragging from the handle, so clicking the card still opens it.
  const handle = card.querySelector('.card-handle');
  handle.addEventListener('mousedown', () => {
    card.draggable = true;
  });
  card.addEventListener('mouseup', () => {
    card.draggable = false;
  });

  card.addEventListener('dragstart', (e) => {
    cardDragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    cardDragId = null;
    card.draggable = false;
    card.classList.remove('dragging');
    document.querySelectorAll('.card.drop-target').forEach((el) =>
      el.classList.remove('drop-target')
    );
    // Suppress the click that browsers may synthesize right after a drag.
    card.dataset.dragged = '1';
    setTimeout(() => delete card.dataset.dragged, 0);
  });
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (card.dataset.id !== cardDragId) card.classList.add('drop-target');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('drop-target');
    if (!cardDragId || cardDragId === card.dataset.id) return;
    const dragged = els.collections.querySelector(`[data-id="${cardDragId}"]`);
    els.collections.insertBefore(dragged, card);
    const order = [...els.collections.children].map((el) => el.dataset.id);
    await reorderCollections(order);
  });
}

function renderDetail(c) {
  els.listView.hidden = true;
  els.detailView.hidden = false;

  els.detailTitle.value = c.title;
  if (c.cover) {
    els.detailCover.style.backgroundImage = `url('${encodeURI(c.cover)}')`;
    els.detailCover.textContent = '';
    els.coverRemoveBtn.hidden = false;
  } else {
    els.detailCover.style.backgroundImage = '';
    els.detailCover.textContent = '🗂️';
    els.coverRemoveBtn.hidden = true;
  }
  els.detailEmpty.hidden = c.items.length > 0;
  els.items.hidden = c.items.length === 0;
  els.items.innerHTML = '';

  for (const item of c.items) {
    els.items.appendChild(renderItem(c.id, item));
  }
}

function renderItem(collectionId, item) {
  const row = document.createElement('div');
  row.className = 'item' + (item.done ? ' done' : '');
  row.dataset.id = item.id;
  row.draggable = false; // drag starts from the handle only

  let bodyHtml = '';
  let thumbHtml = '';

  if (item.type === 'note') {
    thumbHtml = `<div class="item-thumb">📝</div>`;
    bodyHtml = `<div class="item-note"><textarea placeholder="Write a note…">${escapeHtml(
      item.text
    )}</textarea></div>`;
  } else if (item.type === 'image') {
    thumbHtml = `<div class="item-thumb" style="background-image:url('${encodeURI(
      item.src
    )}')"></div>`;
    bodyHtml = `
      <div class="item-title"><a href="${encodeURI(
        item.srcPageUrl || item.src
      )}" target="_blank" rel="noreferrer">${escapeHtml(item.alt || 'Image')}</a></div>
      <div class="item-url">${escapeHtml(hostOf(item.srcPageUrl || item.src))}</div>`;
  } else {
    // page
    const fav = faviconFor(item);
    thumbHtml = item.thumbnail
      ? `<div class="item-thumb" style="background-image:url('${encodeURI(item.thumbnail)}')"></div>`
      : `<div class="item-thumb">${
          fav ? `<img src="${encodeURI(fav)}" width="18" height="18" alt="" />` : '🔗'
        }</div>`;
    bodyHtml = `
      <div class="item-title"><a href="${encodeURI(
        item.url
      )}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></div>
      <div class="item-url">${escapeHtml(hostOf(item.url))}</div>`;
  }

  // Page thumbnails and images can be promoted to the collection cover.
  const coverSrc =
    item.type === 'image' ? item.src : item.type === 'page' ? item.thumbnail : '';
  const coverBtnHtml = coverSrc
    ? `<button class="item-cover-btn" title="Use as collection cover">★</button>`
    : '';

  // Custom fields (price, qty, …) — page/image items only.
  const supportsFields = item.type !== 'note';
  const fields = item.fields || {};
  const fieldsHtml = supportsFields
    ? `<div class="item-fields">${Object.keys(fields)
        .map(
          (k) => `
        <div class="item-field" data-key="${escapeHtml(k)}">
          <span class="field-key">${escapeHtml(k)}</span>
          <input class="field-val" value="${escapeHtml(fields[k])}" />
          <button class="field-del" title="Remove field">✕</button>
        </div>`
        )
        .join('')}</div>`
    : '';
  const addFieldBtn = supportsFields
    ? `<button class="item-field-add" title="Add a field (price, qty…)">⊞</button>`
    : '';

  row.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <input type="checkbox" class="item-check" ${item.done ? 'checked' : ''} title="Mark done" />
    ${thumbHtml}
    <div class="item-body">${bodyHtml}${fieldsHtml}</div>
    <div class="item-actions">
      ${coverBtnHtml}
      ${addFieldBtn}
      <button class="item-move-btn" title="Move or copy to another collection">⇄</button>
      <button class="item-del" title="Remove">✕</button>
    </div>
  `;

  row.querySelector('.item-del').addEventListener('click', () =>
    removeItem(collectionId, item.id)
  );

  row.querySelector('.item-check').addEventListener('change', (e) =>
    toggleDone(collectionId, item.id, e.target.checked)
  );

  row.querySelector('.item-move-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openMoveMenu(e.currentTarget, collectionId, item.id);
  });

  // Custom-field wiring.
  row.querySelectorAll('.field-val').forEach((inp) => {
    inp.addEventListener('change', () => {
      const key = inp.closest('.item-field').dataset.key;
      updateItem(collectionId, item.id, { fields: { ...item.fields, [key]: inp.value } });
    });
  });
  row.querySelectorAll('.field-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.closest('.item-field').dataset.key;
      const next = { ...item.fields };
      delete next[key];
      updateItem(collectionId, item.id, { fields: next });
    });
  });
  const addBtn = row.querySelector('.item-field-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = (prompt('Field name (e.g. Price, Qty, SKU)') || '').trim();
      if (!name) return;
      if (item.fields && name in item.fields) return toast('That field already exists');
      updateItem(collectionId, item.id, { fields: { ...item.fields, [name]: '' } });
    });
  }

  if (coverSrc) {
    row.querySelector('.item-cover-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await setCover(collectionId, coverSrc);
      toast('Cover updated');
    });
  }

  // Drag starts only from the handle, so checkboxes, links and the note
  // textarea stay interactive without kicking off a row drag.
  row.querySelector('.drag-handle').addEventListener('mousedown', () => {
    row.draggable = true;
  });
  row.addEventListener('mouseup', () => {
    row.draggable = false;
  });

  if (item.type === 'note') {
    const ta = row.querySelector('textarea');
    ta.addEventListener('change', () =>
      updateItem(collectionId, item.id, { text: ta.value })
    );
  }

  wireDrag(row, collectionId);
  return row;
}

// ---- Drag & drop reorder ---------------------------------------------------

let dragId = null;

function wireDrag(row, collectionId) {
  row.addEventListener('dragstart', (e) => {
    dragId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => {
    dragId = null;
    row.classList.remove('dragging');
    document.querySelectorAll('.item.drop-target').forEach((r) =>
      r.classList.remove('drop-target')
    );
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (row.dataset.id !== dragId) row.classList.add('drop-target');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('drop-target');
    if (!dragId || dragId === row.dataset.id) return;
    // Reorder DOM, then persist the new id order.
    const dragged = els.items.querySelector(`[data-id="${dragId}"]`);
    els.items.insertBefore(dragged, row);
    const order = [...els.items.children].map((el) => el.dataset.id);
    await reorderItems(collectionId, order);
  });
}

// ---- Navigation ------------------------------------------------------------

async function open(id) {
  openId = id;
  await setActive(id);
  render();
}

function back() {
  openId = null;
  render();
}

// ---- Add current page ------------------------------------------------------

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url || /^(edge|chrome|about|extension):/i.test(tab.url)) {
    toast("Can't add this page (browser-internal).");
    return;
  }
  let meta = {};
  try {
    meta = await chrome.runtime.sendMessage({ type: 'captureMeta', tabId: tab.id });
  } catch {
    /* worker may not respond on restricted pages */
  }
  await addItem(openId, {
    type: 'page',
    url: tab.url,
    title: (meta && meta.title) || tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    thumbnail: (meta && meta.thumbnail) || '',
  });
  toast('Page added');
}

// ---- Import / Export -------------------------------------------------------

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(s) {
  return (
    (s || 'collections')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'collections'
  );
}

async function doExport() {
  const json = await exportJSON();
  const stamp = new Date().toISOString().slice(0, 10);
  download(json, `collections-backup-${stamp}.json`, 'application/json');
  toast('Backup exported');
}

/** Export all collections, or a single one if collectionId is given, to CSV. */
async function doExportCsv(collectionId) {
  const data = await getData();
  const collections = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  if (!collections.length) return toast('Nothing to export');

  const stamp = new Date().toISOString().slice(0, 10);
  const base = collectionId ? slugify(collections[0].title) : 'collections';
  // ﻿ BOM is already included by toCsv; declare charset for good measure.
  download(toCsv(collections), `${base}-${stamp}.csv`, 'text/csv;charset=utf-8');
  toast('Exported to CSV');
}

/** Export all collections, or one, as Markdown or HTML. */
async function doExportDoc(format, collectionId) {
  const data = await getData();
  const collections = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  if (!collections.length) return toast('Nothing to export');

  const stamp = new Date().toISOString().slice(0, 10);
  const base = collectionId ? slugify(collections[0].title) : 'collections';
  if (format === 'md') {
    download(toMarkdown(collections), `${base}-${stamp}.md`, 'text/markdown;charset=utf-8');
    toast('Exported Markdown');
  } else {
    download(toHtml(collections), `${base}-${stamp}.html`, 'text/html;charset=utf-8');
    toast('Exported HTML');
  }
}

/** Copy a collection's links to the clipboard as "Title — URL" lines. */
async function doCopyLinks(collectionId) {
  const data = await getData();
  const c = data.collections.find((x) => x.id === collectionId);
  if (!c) return;
  const text = toLinkList(c);
  if (!text) return toast('No links to copy');
  try {
    await navigator.clipboard.writeText(text);
    toast('Links copied to clipboard');
  } catch {
    toast('Could not access the clipboard');
  }
}

function pickFile(mode) {
  fileMode = mode;
  els.fileInput.value = '';
  if (mode === 'csv') els.fileInput.accept = '.csv,text/csv';
  else if (mode === 'cover') els.fileInput.accept = 'image/*';
  else els.fileInput.accept = '.json,application/json';
  els.fileInput.click();
}

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  try {
    if (fileMode === 'cover') {
      if (!openId) return;
      const dataUrl = await fileToCover(file);
      await setCover(openId, dataUrl);
      toast('Cover updated');
      return;
    }
    const text = await file.text();
    if (fileMode === 'csv') {
      const stats = await importEdgeCsv(text);
      toast(`Imported ${stats.pages} page(s) into ${stats.collections} collection(s)`);
    } else {
      const replace =
        confirm('Replace all current data with this backup?\n\nOK = replace, Cancel = merge');
      await importJSON(text, replace ? 'replace' : 'merge');
      toast('Backup imported');
    }
  } catch (err) {
    console.error(err);
    toast(fileMode === 'cover' ? "Couldn't read that image" : 'Import failed — is the file valid?');
  }
});

// ---- Sync -------------------------------------------------------------------

let applyingRemote = false; // true while a pull writes data — skip the echo push
let pushTimer = null;

function syncBtn(action) {
  return document.querySelector(`#overflow-menu [data-action="${action}"]`);
}

async function refreshSyncMenu() {
  const create = syncBtn('sync-create');
  const openExisting = syncBtn('sync-open');
  const now = syncBtn('sync-now');
  const pull = syncBtn('sync-pull');
  const disc = syncBtn('sync-disconnect');
  const status = els.syncStatus;

  if (!sync.supported()) {
    create.hidden = openExisting.hidden = now.hidden = pull.hidden = disc.hidden = true;
    status.hidden = false;
    status.textContent = 'Sync needs a Chromium browser with the File System Access API.';
    return;
  }

  const { connected, name } = await sync.status();
  create.hidden = openExisting.hidden = connected;
  now.hidden = pull.hidden = disc.hidden = !connected;
  status.hidden = !connected;
  if (connected) status.textContent = `Synced to ${name}`;
}

// Debounced background write after local edits.
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    try {
      if ((await sync.status()).connected) await sync.push();
    } catch (err) {
      console.warn('Background sync push failed', err);
    }
  }, 1500);
}

// FIRST device — create the sync file and seed it with local data.
async function createSync() {
  try {
    const { name, existing } = await sync.createFile();
    if (existing) {
      // The chosen file already has data — don't clobber it without asking.
      const useFile = confirm(
        `"${name}" already contains ${existing.collections} collection(s).\n\n` +
          'OK = load that file and replace your local data\n' +
          'Cancel = overwrite the file with your current data'
      );
      if (useFile) {
        applyingRemote = true;
        const res = await sync.pull({ interactive: true, force: true });
        if (!res.applied) applyingRemote = false;
        toast('Synced from file');
      } else {
        await sync.push({ interactive: true });
        toast('Sync set up');
      }
    } else {
      await sync.push({ interactive: true });
      toast('Sync set up');
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // user dismissed the file picker
    console.error(err);
    toast('Could not set up sync');
  }
  refreshSyncMenu();
}

// OTHER devices — open the existing sync file and adopt its data.
async function openSync() {
  try {
    const { name, existing } = await sync.openFile();
    if (!existing) {
      const proceed = confirm(
        `"${name}" has no collections to load yet.\n\n` +
          'OK = use it anyway and upload your current data\n' +
          'Cancel = pick a different file'
      );
      if (!proceed) {
        await sync.disconnect();
        refreshSyncMenu();
        return;
      }
      await sync.push({ interactive: true });
      toast('Sync set up');
    } else {
      applyingRemote = true;
      const res = await sync.pull({ interactive: true, force: true });
      if (!res.applied) applyingRemote = false;
      // Upgrade the read-only handle so future edits push automatically.
      await sync.requestWriteAccess();
      toast('Synced from file');
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // user dismissed the file picker
    console.error(err);
    toast('Could not connect to that file');
  }
  refreshSyncMenu();
}

async function syncNow() {
  try {
    await sync.push({ interactive: true });
    toast('Synced');
  } catch (err) {
    console.error(err);
    toast('Sync failed');
  }
}

async function syncPull() {
  try {
    applyingRemote = true;
    const res = await sync.pull({ interactive: true, force: true });
    if (!res.applied) applyingRemote = false;
    toast(res.applied ? 'Pulled latest from sync file' : 'Already up to date');
  } catch (err) {
    applyingRemote = false;
    console.error(err);
    toast('Pull failed');
  }
}

async function disconnectSync() {
  await sync.disconnect();
  toast('Sync disconnected');
  refreshSyncMenu();
}

// Best-effort pull on startup and when the panel regains focus (no prompt).
async function autoPull() {
  try {
    if (!(await sync.status()).connected) return;
    // Only engage the remote-apply guard when there's actually a new version,
    // so frequent polling can't suppress a concurrent local edit's push.
    if (!(await sync.hasRemoteChange())) return;
    applyingRemote = true;
    const res = await sync.pull({ interactive: false });
    if (!res.applied) applyingRemote = false;
  } catch (err) {
    applyingRemote = false;
    console.warn('Auto pull failed', err);
  }
}

// Pull on focus, when the panel becomes visible again, and on a light timer so
// an open panel notices changes another device made (the focus event alone is
// unreliable for a side panel). pull() reads only the file's mtime unless it
// actually changed, so polling is cheap.
window.addEventListener('focus', autoPull);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) autoPull();
});
setInterval(autoPull, 20000);

// ---- Event wiring ----------------------------------------------------------

// List view
$('#new-collection-btn').addEventListener('click', async () => {
  const c = await createCollection('New collection');
  open(c.id);
});

els.searchInput.addEventListener('input', () => {
  query = els.searchInput.value.trim().toLowerCase();
  render();
});

$('#overflow-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = $('#overflow-menu').hidden;
  if (willOpen) refreshSyncMenu();
  openMenu($('#overflow-menu'), willOpen);
});

$('#overflow-menu').addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  $('#overflow-menu').hidden = true;
  if (action === 'export-json') doExport();
  if (action === 'export-csv') doExportCsv();
  if (action === 'export-md') doExportDoc('md');
  if (action === 'export-html') doExportDoc('html');
  if (action === 'import-json') pickFile('json');
  if (action === 'import-csv') pickFile('csv');
  if (action === 'sync-create') createSync();
  if (action === 'sync-open') openSync();
  if (action === 'sync-now') syncNow();
  if (action === 'sync-pull') syncPull();
  if (action === 'sync-disconnect') disconnectSync();
});

els.listEmpty.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (action === 'new') {
    const c = await createCollection('New collection');
    open(c.id);
  }
  if (action === 'import-csv') pickFile('csv');
});

// Detail view
$('#back-btn').addEventListener('click', back);
$('#add-current-btn').addEventListener('click', addCurrentPage);

$('#cover-change-btn').addEventListener('click', () => {
  if (openId) pickFile('cover');
});
els.coverRemoveBtn.addEventListener('click', async () => {
  if (openId) {
    await setCover(openId, null);
    toast('Cover removed');
  }
});

els.detailTitle.addEventListener('change', () => {
  if (openId) renameCollection(openId, els.detailTitle.value);
});

$('#detail-overflow-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu($('#detail-overflow-menu'), $('#detail-overflow-menu').hidden);
});

$('#detail-overflow-menu').addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  $('#detail-overflow-menu').hidden = true;
  const data = await getData();
  const c = data.collections.find((x) => x.id === openId);
  if (!c) return;

  if (action === 'open-all') {
    const pages = c.items.filter((i) => i.type === 'page');
    if (!pages.length) return toast('No pages to open');
    if (pages.length > 8 && !confirm(`Open all ${pages.length} pages in new tabs?`)) return;
    pages.forEach((p) => chrome.tabs.create({ url: p.url, active: false }));
  }
  if (action === 'add-note') {
    await addItem(openId, { type: 'note', text: '' });
  }
  if (action === 'export-collection-csv') {
    await doExportCsv(openId);
  }
  if (action === 'export-collection-md') {
    await doExportDoc('md', openId);
  }
  if (action === 'export-collection-html') {
    await doExportDoc('html', openId);
  }
  if (action === 'copy-links') {
    await doCopyLinks(openId);
  }
  if (action === 'edit-tags') {
    const current = (c.tags || []).join(', ');
    const input = prompt('Tags (comma-separated):', current);
    if (input !== null) {
      await setTags(openId, input.split(',').map((t) => t.trim()).filter(Boolean));
      toast('Tags updated');
    }
  }
  if (action === 'cover-upload') {
    pickFile('cover');
  }
  if (action === 'cover-remove') {
    await setCover(openId, null);
    toast('Cover removed');
  }
  if (action === 'delete-collection') {
    if (confirm(`Delete "${c.title}" and its ${c.items.length} item(s)?`)) {
      await removeCollection(openId);
      back();
    }
  }
});

// Re-render whenever the data changes (from this panel or the service worker),
// and mirror the change to the sync file unless the change *came from* a pull.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  render();
  if (applyingRemote) {
    applyingRemote = false; // this write came from a pull — don't echo it back
    return;
  }
  schedulePush();
});

// Initial paint, then reflect sync state and pull any newer remote data.
render();
refreshSyncMenu();
autoPull();
