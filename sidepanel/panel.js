// panel.js — side panel UI controller.
import {
  getData,
  createCollection,
  renameCollection,
  removeCollection,
  setActive,
  addItem,
  updateItem,
  removeItem,
  reorderItems,
  exportJSON,
  importJSON,
  importEdgeCsv,
  STORAGE_KEY,
} from '../lib/store.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  listView: $('#list-view'),
  detailView: $('#detail-view'),
  collections: $('#collections'),
  listEmpty: $('#list-empty'),
  items: $('#items'),
  detailEmpty: $('#detail-empty'),
  detailTitle: $('#detail-title'),
  fileInput: $('#file-input'),
  toast: $('#toast'),
};

// View state: which collection (if any) is open, and how the file input is used.
let openId = null;
let fileMode = null; // 'csv' | 'json'

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
    if (!m.hidden && !m.parentElement.contains(e.target)) m.hidden = true;
  });
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

function renderList(data) {
  els.detailView.hidden = true;
  els.listView.hidden = false;

  const { collections } = data;
  els.listEmpty.hidden = collections.length > 0;
  els.collections.hidden = collections.length === 0;
  els.collections.innerHTML = '';

  for (const c of collections) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = c.id;

    const coverInner = c.cover
      ? `<div class="card-cover" style="background-image:url('${encodeURI(c.cover)}')"></div>`
      : `<div class="card-cover">🗂️</div>`;

    card.innerHTML = `
      ${coverInner}
      <div class="card-body">
        <div class="card-title">${escapeHtml(c.title)}</div>
        <div class="card-meta">${c.items.length} item${c.items.length === 1 ? '' : 's'}</div>
      </div>
      <button class="card-del" title="Delete collection">🗑</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-del')) return;
      open(c.id);
    });
    card.querySelector('.card-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${c.title}" and its ${c.items.length} item(s)?`)) {
        await removeCollection(c.id);
      }
    });

    els.collections.appendChild(card);
  }
}

function renderDetail(c) {
  els.listView.hidden = true;
  els.detailView.hidden = false;

  els.detailTitle.value = c.title;
  els.detailEmpty.hidden = c.items.length > 0;
  els.items.hidden = c.items.length === 0;
  els.items.innerHTML = '';

  for (const item of c.items) {
    els.items.appendChild(renderItem(c.id, item));
  }
}

function renderItem(collectionId, item) {
  const row = document.createElement('div');
  row.className = 'item';
  row.dataset.id = item.id;
  row.draggable = true;

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

  row.innerHTML = `
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    ${thumbHtml}
    <div class="item-body">${bodyHtml}</div>
    <button class="item-del" title="Remove">✕</button>
  `;

  row.querySelector('.item-del').addEventListener('click', () =>
    removeItem(collectionId, item.id)
  );

  if (item.type === 'note') {
    const ta = row.querySelector('textarea');
    ta.addEventListener('change', () =>
      updateItem(collectionId, item.id, { text: ta.value })
    );
    // Don't start a drag when interacting with the textarea.
    ta.addEventListener('mousedown', (e) => e.stopPropagation());
    row.draggable = false;
    row.querySelector('.drag-handle').addEventListener('mousedown', () => {
      row.draggable = true;
    });
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

async function doExport() {
  const json = await exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `collections-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exported');
}

function pickFile(mode) {
  fileMode = mode;
  els.fileInput.value = '';
  els.fileInput.accept = mode === 'csv' ? '.csv,text/csv' : '.json,application/json';
  els.fileInput.click();
}

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    if (fileMode === 'csv') {
      const stats = await importEdgeCsv(text);
      toast(`Imported ${stats.pages} page(s) into ${stats.collections} collection(s)`);
    } else {
      const replace =
        confirm('Replace all current data with this backup?\n\nOK = replace, Cancel = merge') ;
      await importJSON(text, replace ? 'replace' : 'merge');
      toast('Backup imported');
    }
  } catch (err) {
    console.error(err);
    toast('Import failed — is the file valid?');
  }
});

// ---- Event wiring ----------------------------------------------------------

// List view
$('#new-collection-btn').addEventListener('click', async () => {
  const c = await createCollection('New collection');
  open(c.id);
});

$('#overflow-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu($('#overflow-menu'), $('#overflow-menu').hidden);
});

$('#overflow-menu').addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  $('#overflow-menu').hidden = true;
  if (action === 'export-json') doExport();
  if (action === 'import-json') pickFile('json');
  if (action === 'import-csv') pickFile('csv');
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
  if (action === 'delete-collection') {
    if (confirm(`Delete "${c.title}" and its ${c.items.length} item(s)?`)) {
      await removeCollection(openId);
      back();
    }
  }
});

// Re-render whenever the data changes (from this panel or the service worker).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) render();
});

// Initial paint.
render();
