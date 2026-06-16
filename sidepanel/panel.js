// panel.js — side panel UI controller.
import {
  getData,
  createCollection,
  renameCollection,
  insertItem,
  ensureActiveCollection,
  setActive,
  setCover,
  setPinned,
  setTags,
  setParent,
  createFolder,
  renameFolder,
  toggleFolder,
  archiveCollection,
  unarchiveCollection,
  trashCollection,
  trashFolder,
  restoreFromTrash,
  deleteTrashEntry,
  emptyTrash,
  purgeExpiredTrash,
  reorderCollections,
  addItem,
  updateItem,
  removeItem,
  removeItems,
  moveItems,
  copyItems,
  toggleDone,
  reorderItems,
  findPageByUrl,
  getSettings,
  setSettings,
  cacheItemImage,
  cacheCollectionImages,
  getHistory,
  snapshotHistory,
  restoreHistory,
  exportJSON,
  importJSON,
  importEdgeCsv,
  STORAGE_KEY,
} from '../lib/store.js';
import { toCsv, toXlsxSheets } from '../lib/export.js';
import { buildXlsx } from '../lib/xlsx.js';
import { toMarkdown, toHtml, toLinkList } from '../lib/render.js';
import { fileToCover, srcToCover } from '../lib/image.js';
import * as sync from '../lib/sync.js';
import {
  AI_PROVIDERS,
  getAiConfig,
  setAiConfig,
  isConfigured,
  buildSystemPrompt,
  chat as aiChat,
} from '../lib/ai.js';

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
  itemFilterbar: $('#item-filterbar'),
  itemFilterInput: $('#item-filter-input'),
  detailNoResults: $('#detail-no-results'),
  detailEmpty: $('#detail-empty'),
  detailTitle: $('#detail-title'),
  detailCover: $('#detail-cover'),
  coverRemoveBtn: $('#cover-remove-btn'),
  syncStatus: $('#sync-status'),
  fileInput: $('#file-input'),
  toast: $('#toast'),
  binView: $('#bin-view'),
  binTitle: $('#bin-title'),
  binNote: $('#bin-note'),
  binList: $('#bin-list'),
  binEmpty: $('#bin-empty'),
  binEmptySub: $('#bin-empty-sub'),
  emptyTrashBtn: $('#empty-trash-btn'),
  // AI settings
  settingsView: $('#settings-view'),
  aiProvider: $('#ai-provider'),
  aiBaseUrl: $('#ai-base-url'),
  aiModel: $('#ai-model'),
  aiKey: $('#ai-key'),
  aiKeyField: $('#ai-key-field'),
  aiAuth: $('#ai-auth'),
  aiAuthField: $('#ai-auth-field'),
  aiStatus: $('#ai-status'),
  // AI chat
  chatView: $('#chat-view'),
  chatTitle: $('#chat-title'),
  chatScope: $('#chat-scope'),
  chatMessages: $('#chat-messages'),
  chatUnconfigured: $('#chat-unconfigured'),
  chatForm: $('#chat-form'),
  chatText: $('#chat-text'),
  chatSend: $('#chat-send'),
};

// View state: which collection (if any) is open, and how the file input is used.
let openId = null;
let binMode = null; // 'trash' | 'archive' | null — which holding area is open
let fileMode = null; // 'csv' | 'json' | 'cover'
let query = ''; // current list-view search text (lower-cased)
let itemFilter = ''; // current in-collection item filter (lower-cased)
let aiMode = null; // 'settings' | 'chat' | null
let chatScope = { type: 'all' }; // { type:'all' } | { type:'collection', id }
let chatHistory = []; // [{ role:'user'|'assistant'|'error', content }]
let chatBusy = false;

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
function toast(msg, action) {
  els.toast.textContent = '';
  els.toast.append(document.createTextNode(msg));
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      els.toast.hidden = true;
      clearTimeout(toastTimer);
      action.fn();
    });
    els.toast.append(btn);
  }
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), action ? 6000 : 2600);
}

function openMenu(menu, open) {
  menu.hidden = !open;
}

// ---- In-panel dialogs (replace native prompt/confirm) ----------------------
// Native prompt()/confirm() in an extension page render as "The extension
// Collections Plus says…" and, after a couple of uses, let the user tick
// "Prevent this page from creating additional dialogs" — which would silently
// break every prompt/confirm in the app. These custom dialogs avoid both.
const dlg = {
  overlay: $('#modal'),
  title: $('#modal-title'),
  input: $('#modal-input'),
  ok: $('#modal-ok'),
  cancel: $('#modal-cancel'),
};
let dlgResolve = null;
let dlgMode = 'confirm'; // 'confirm' | 'prompt'

function closeDialog(value) {
  dlg.overlay.hidden = true;
  dlg.ok.classList.remove('danger');
  const resolve = dlgResolve;
  dlgResolve = null;
  if (resolve) resolve(value);
}

/** Async replacement for prompt(). Resolves to the string, or null on cancel. */
function showPrompt(title, { value = '', placeholder = '', okLabel = 'OK' } = {}) {
  return new Promise((resolve) => {
    if (dlgResolve) closeDialog(dlgMode === 'prompt' ? null : false);
    dlgResolve = resolve;
    dlgMode = 'prompt';
    dlg.title.textContent = title;
    dlg.input.hidden = false;
    dlg.input.value = value;
    dlg.input.placeholder = placeholder;
    dlg.ok.textContent = okLabel;
    dlg.cancel.textContent = 'Cancel';
    dlg.overlay.hidden = false;
    dlg.input.focus();
    dlg.input.select();
  });
}

/** Async replacement for confirm(). Resolves to true (OK) or false (Cancel). */
function showConfirm(title, { okLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    if (dlgResolve) closeDialog(dlgMode === 'prompt' ? null : false);
    dlgResolve = resolve;
    dlgMode = 'confirm';
    dlg.title.textContent = title;
    dlg.input.hidden = true;
    dlg.ok.textContent = okLabel;
    dlg.cancel.textContent = cancelLabel;
    dlg.ok.classList.toggle('danger', danger);
    dlg.overlay.hidden = false;
    dlg.ok.focus();
  });
}

dlg.ok.addEventListener('click', () =>
  closeDialog(dlgMode === 'prompt' ? dlg.input.value : true)
);
dlg.cancel.addEventListener('click', () =>
  closeDialog(dlgMode === 'prompt' ? null : false)
);
dlg.overlay.addEventListener('click', (e) => {
  if (e.target === dlg.overlay) closeDialog(dlgMode === 'prompt' ? null : false);
});
dlg.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    closeDialog(dlg.input.value);
  }
});
document.addEventListener('keydown', (e) => {
  if (!dlg.overlay.hidden && e.key === 'Escape') {
    closeDialog(dlgMode === 'prompt' ? null : false);
  }
});

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

// ---- Assign a collection to a folder ---------------------------------------
const folderMenu = $('#folder-menu');

async function openFolderMenu(anchor, collectionId) {
  const data = await getData();
  const folders = data.folders || [];
  const current = data.collections.find((c) => c.id === collectionId)?.parentId || '';
  folderMenu.dataset.collection = collectionId;
  folderMenu.innerHTML =
    `<div class="menu-note">Move to folder</div>` +
    `<button class="folder-pick" data-to="">${current ? '' : '✓ '}No folder</button>` +
    folders
      .map(
        (f) =>
          `<button class="folder-pick" data-to="${f.id}">${current === f.id ? '✓ ' : ''}${escapeHtml(
            f.name
          )}</button>`
      )
      .join('') +
    `<div class="menu-sep"></div><button class="folder-pick" data-to="__new">＋ New folder…</button>`;

  folderMenu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = folderMenu.offsetWidth || 200;
  folderMenu.style.left = `${Math.max(8, r.right - mw)}px`;
  folderMenu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 10)}px`;
}

folderMenu.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-to]');
  if (!btn) return;
  const collectionId = folderMenu.dataset.collection;
  folderMenu.hidden = true;
  let to = btn.dataset.to;
  if (to === '__new') {
    const name = ((await showPrompt('New folder name:')) || '').trim();
    if (!name) return;
    to = (await createFolder(name)).id;
  }
  await setParent(collectionId, to || null);
});

document.addEventListener('click', (e) => {
  if (!folderMenu.hidden && !folderMenu.contains(e.target) && !e.target.closest('.card-folder')) {
    folderMenu.hidden = true;
  }
});

// ---- Version history -------------------------------------------------------
const historyMenu = $('#history-menu');

async function openHistoryMenu() {
  const hist = await getHistory();
  if (!hist.length) return toast('No history yet — it builds up as you edit');
  historyMenu.innerHTML =
    `<div class="menu-note">Restore a snapshot</div>` +
    hist
      .map(
        (h) =>
          `<button class="hist-row" data-at="${h.at}">${relativeTime(h.at)} — ${h.collections} collection${
            h.collections === 1 ? '' : 's'
          }, ${h.items} item${h.items === 1 ? '' : 's'}</button>`
      )
      .join('');
  const r = $('#overflow-btn').getBoundingClientRect();
  historyMenu.hidden = false;
  const mw = historyMenu.offsetWidth || 240;
  historyMenu.style.left = `${Math.max(8, r.right - mw)}px`;
  historyMenu.style.top = `${r.bottom + 4}px`;
}

historyMenu.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-at]');
  if (!btn) return;
  historyMenu.hidden = true;
  if (!(await showConfirm('Restore this snapshot? Your current data is snapshotted first, so you can roll back.', { okLabel: 'Restore' })))
    return;
  await snapshotHistory(0); // force-capture current state before overwriting
  await restoreHistory(Number(btn.dataset.at));
  toast('Snapshot restored');
});

document.addEventListener('click', (e) => {
  if (
    !historyMenu.hidden &&
    !historyMenu.contains(e.target) &&
    e.target.dataset.action !== 'history'
  ) {
    historyMenu.hidden = true;
  }
});

// ---- Rendering -------------------------------------------------------------

async function render() {
  const data = await getData();
  updateBinBadges(data);
  if (aiMode === 'settings') {
    showOnly(els.settingsView);
    renderSettings();
    return;
  }
  if (aiMode === 'chat') {
    showOnly(els.chatView);
    await refreshAiConfigCache();
    renderChat(data);
    return;
  }
  els.settingsView.hidden = true;
  els.chatView.hidden = true;
  if (binMode) {
    renderBin(data);
    return;
  }
  els.binView.hidden = true;
  if (openId && data.collections.some((c) => c.id === openId)) {
    renderDetail(data.collections.find((c) => c.id === openId));
  } else {
    openId = null;
    renderList(data);
  }
}

/** Human-readable name for an item, used in match previews. */
function itemDisplayName(it) {
  if (it.type === 'note') return (it.text || '').trim().slice(0, 80) || 'Note';
  if (it.type === 'image') return it.alt || 'Image';
  return it.title || it.url || 'Untitled';
}

/** Lower-cased searchable text for one item (title, url, note, custom fields…). */
function itemHaystack(it) {
  const fieldText =
    it.fields && typeof it.fields === 'object'
      ? Object.entries(it.fields)
          .map(([k, v]) => `${k} ${v}`)
          .join(' ')
      : '';
  return [it.title, it.url, it.text, it.alt, it.note, it.srcPageUrl, fieldText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Items in a collection that match a (lower-cased) query string. */
function matchingItems(c, q) {
  return (c.items || []).filter((it) => itemHaystack(it).includes(q));
}

/** Does a collection match the current search query? (title, tags, item text) */
function matchesQuery(c) {
  if (!query) return true;
  if ((c.title || '').toLowerCase().includes(query)) return true;
  if ((c.tags || []).some((t) => t.toLowerCase().includes(query))) return true;
  return matchingItems(c, query).length > 0;
}

const pinnedFirst = (arr) =>
  [...arr].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

// Open every page in a collection in new background tabs, grouped under a
// tab group named after the collection (like the old Edge Collections).
async function openAllPages(c) {
  const pages = c.items.filter((i) => i.type === 'page');
  if (!pages.length) {
    toast('No pages to open');
    return;
  }
  if (
    pages.length > 8 &&
    !(await showConfirm(`Open all ${pages.length} pages in new tabs?`, { okLabel: 'Open all' }))
  )
    return;

  const tabIds = [];
  for (const p of pages) {
    try {
      const tab = await chrome.tabs.create({ url: p.url, active: false });
      if (tab?.id != null) tabIds.push(tab.id);
    } catch (e) {
      /* skip a page that fails to open; keep going with the rest */
    }
  }

  // Group the freshly opened tabs and label the group with the collection name.
  // Falls back gracefully if the Tab Groups API is unavailable.
  try {
    if (tabIds.length && chrome.tabs.group) {
      const groupId = await chrome.tabs.group({ tabIds });
      if (chrome.tabGroups?.update) {
        await chrome.tabGroups.update(groupId, { title: c.title });
      }
    }
  } catch (e) {
    /* grouping unsupported or failed — the tabs are still open */
  }
}

function buildCard(c) {
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

  // Pinned state is shown as a small badge at rest (the pin button itself lives
  // in the hover-only actions overlay, which is hidden until you hover).
  const pinBadge = c.pinned
    ? `<span class="card-pin-badge" title="Pinned" aria-hidden="true">📌</span>`
    : '';

  // While searching, preview which items inside this collection matched, so the
  // result is obviously useful (and confirms the search reached item contents).
  let matchHtml = '';
  if (query) {
    const m = matchingItems(c, query);
    if (m.length) {
      const shown = m.slice(0, 3).map((it) => escapeHtml(itemDisplayName(it)));
      const extra = m.length > 3 ? ` +${m.length - 3} more` : '';
      matchHtml = `<div class="card-matches" title="Items matching your search">↳ ${shown.join(
        ' · '
      )}${extra}</div>`;
    }
  }

  card.innerHTML = `
    <span class="card-handle" title="Drag to reorder">⠿</span>
    ${coverInner}
    <div class="card-body">
      <div class="card-title">${escapeHtml(c.title)}</div>
      <div class="card-meta">${c.items.length} item${c.items.length === 1 ? '' : 's'}</div>
      ${matchHtml}
      ${tagsHtml}
    </div>
    ${pinBadge}
    <div class="card-actions">
      <button class="card-open" title="Open all pages">▶</button>
      <button class="card-folder" title="Move to folder">📁</button>
      <button class="card-archive" title="Archive collection">📦</button>
      <button class="card-pin" title="${c.pinned ? 'Unpin' : 'Pin to top'}">${c.pinned ? '📌' : '📍'}</button>
      <button class="card-del" title="Move to Trash">🗑</button>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (
      e.target.closest('.card-del') ||
      e.target.closest('.card-pin') ||
      e.target.closest('.card-folder') ||
      e.target.closest('.card-archive') ||
      e.target.closest('.card-open') ||
      e.target.closest('.card-handle')
    )
      return;
    if (card.dataset.dragged) return; // a drag just finished; don't open
    open(c.id);
  });
  card.querySelector('.card-open').addEventListener('click', async (e) => {
    e.stopPropagation();
    await openAllPages(c);
  });
  card.querySelector('.card-archive').addEventListener('click', async (e) => {
    e.stopPropagation();
    await archiveCollectionWithUndo(c.id);
  });
  card.querySelector('.card-pin').addEventListener('click', async (e) => {
    e.stopPropagation();
    await setPinned(c.id, !c.pinned);
  });
  card.querySelector('.card-folder').addEventListener('click', (e) => {
    e.stopPropagation();
    openFolderMenu(e.currentTarget, c.id);
  });
  card.querySelector('.card-del').addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteCollectionWithUndo(c.id);
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
  return card;
}

function buildFolderHeader(f, count) {
  const el = document.createElement('div');
  el.className = 'folder-header';
  el.dataset.folder = f.id;
  el.innerHTML = `
    <button class="folder-toggle" title="Collapse / expand">${f.collapsed ? '▸' : '▾'}</button>
    <span class="folder-name">📁 ${escapeHtml(f.name)}</span>
    <span class="folder-count">${count}</span>
    <button class="folder-rename" title="Rename folder">✎</button>
    <button class="folder-del" title="Move folder to Trash">🗑</button>
  `;
  const toggle = () => toggleFolder(f.id);
  el.querySelector('.folder-toggle').addEventListener('click', toggle);
  el.querySelector('.folder-name').addEventListener('click', toggle);
  el.querySelector('.folder-rename').addEventListener('click', async (e) => {
    e.stopPropagation();
    const name = await showPrompt('Folder name:', { value: f.name });
    if (name !== null) await renameFolder(f.id, name);
  });
  el.querySelector('.folder-del').addEventListener('click', async (e) => {
    e.stopPropagation();
    const entryId = await trashFolder(f.id);
    if (entryId) {
      toast(`Folder "${f.name}" moved to Trash`, {
        label: 'Undo',
        fn: () => restoreFromTrash(entryId),
      });
    }
  });
  return el;
}

function renderList(data) {
  els.detailView.hidden = true;
  els.listView.hidden = false;

  const all = data.collections;
  const folders = data.folders || [];
  els.searchbar.hidden = all.length === 0;
  els.listEmpty.hidden = all.length > 0;

  const filtered = all.filter(matchesQuery);
  els.listNoResults.hidden = !(all.length > 0 && filtered.length === 0);
  els.collections.hidden = filtered.length === 0;
  els.collections.innerHTML = '';

  // While searching, show a flat list (no folder grouping).
  if (query) {
    for (const c of pinnedFirst(filtered)) els.collections.appendChild(buildCard(c));
    return;
  }

  // Top-level collections first, then each folder with its collections.
  for (const c of pinnedFirst(filtered.filter((c) => !c.parentId))) {
    els.collections.appendChild(buildCard(c));
  }
  for (const f of folders) {
    const kids = pinnedFirst(filtered.filter((c) => c.parentId === f.id));
    els.collections.appendChild(buildFolderHeader(f, kids.length));
    if (!f.collapsed) for (const c of kids) els.collections.appendChild(buildCard(c));
  }
}

// ---- Trash / Archive view --------------------------------------------------

function renderBin(data) {
  els.listView.hidden = true;
  els.detailView.hidden = true;
  els.binView.hidden = false;

  const isTrash = binMode === 'trash';
  // Normalize archive collections into the same {kind, …} shape trash uses.
  const entries = isTrash
    ? data.trash || []
    : (data.archive || []).map((c) => ({
        id: c.id,
        kind: 'collection',
        archivedAt: c.archivedAt,
        collection: c,
      }));

  els.binTitle.textContent = isTrash ? 'Trash' : 'Archive';
  els.emptyTrashBtn.hidden = !(isTrash && entries.length);

  els.binNote.textContent = isTrash
    ? 'Items are permanently deleted 30 days after they’re trashed.'
    : 'Archived collections stay out of your main list until you restore them.';
  els.binNote.hidden = entries.length === 0;

  els.binEmpty.hidden = entries.length > 0;
  els.binEmptySub.textContent = isTrash
    ? 'Deleted collections and folders will appear here.'
    : 'Collections you archive will appear here.';
  els.binList.hidden = entries.length === 0;
  els.binList.innerHTML = '';
  for (const e of entries) els.binList.appendChild(buildBinRow(e, isTrash));
}

function buildBinRow(entry, isTrash) {
  const row = document.createElement('div');
  row.className = 'card bin-row';
  const isFolder = entry.kind === 'folder';
  const obj = isFolder ? entry.folder : entry.collection;
  const title = isFolder ? obj.name : obj.title;
  const when = isTrash ? entry.deletedAt : entry.archivedAt;

  let cover;
  if (isFolder) cover = `<div class="card-cover">📁</div>`;
  else if (obj.cover)
    cover = `<div class="card-cover" style="background-image:url('${encodeURI(obj.cover)}')"></div>`;
  else cover = `<div class="card-cover">🗂️</div>`;

  const count = isFolder
    ? `${(entry.childIds || []).length} collection${(entry.childIds || []).length === 1 ? '' : 's'}`
    : `${obj.items.length} item${obj.items.length === 1 ? '' : 's'}`;
  const meta = `${count} · ${isTrash ? 'deleted' : 'archived'} ${relativeTime(when)}`;

  row.innerHTML = `
    ${cover}
    <div class="card-body">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-meta">${escapeHtml(meta)}</div>
    </div>
    <button class="btn bin-restore">Restore</button>
    <button class="card-del bin-delete" title="${
      isTrash ? 'Delete permanently' : 'Move to Trash'
    }">${isTrash ? '✕' : '🗑'}</button>
  `;

  row.querySelector('.bin-restore').addEventListener('click', async () => {
    if (isTrash) {
      await restoreFromTrash(entry.id);
      toast(`${isFolder ? 'Folder' : 'Collection'} restored`);
    } else {
      await unarchiveCollection(obj.id);
      toast(`"${title}" restored`);
    }
  });

  row.querySelector('.bin-delete').addEventListener('click', async () => {
    if (isTrash) {
      if (
        await showConfirm(`Permanently delete "${title}"? This can’t be undone.`, {
          okLabel: 'Delete',
          danger: true,
        })
      ) {
        await deleteTrashEntry(entry.id);
        toast('Permanently deleted');
      }
    } else {
      // Archive → Trash: surface it briefly, then soft-delete it.
      await unarchiveCollection(obj.id);
      const entryId = await trashCollection(obj.id);
      if (entryId) {
        toast(`"${title}" moved to Trash`, {
          label: 'Undo',
          fn: () => restoreFromTrash(entryId),
        });
      }
    }
  });

  return row;
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
  // Show the item filter only once a collection has enough items to warrant it.
  els.itemFilterbar.hidden = c.items.length < 2;
  if (els.itemFilterbar.hidden) itemFilter = '';

  const visible = itemFilter ? matchingItems(c, itemFilter) : c.items;

  els.detailEmpty.hidden = c.items.length > 0;
  els.detailNoResults.hidden = !(c.items.length > 0 && itemFilter && visible.length === 0);
  els.items.hidden = visible.length === 0;
  els.items.innerHTML = '';

  for (const item of visible) {
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
          fav ? `<img class="item-favicon" src="${encodeURI(fav)}" alt="" />` : '🔗'
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
    <div class="item-media">
      ${thumbHtml}
      <input type="checkbox" class="item-check" ${item.done ? 'checked' : ''} title="Mark done" />
    </div>
    <div class="item-body">${bodyHtml}${fieldsHtml}</div>
    <div class="item-actions">
      ${coverBtnHtml}
      ${addFieldBtn}
      <button class="item-move-btn" title="Move or copy to another collection">⇄</button>
      <button class="item-del" title="Remove">✕</button>
    </div>
  `;

  row.querySelector('.item-del').addEventListener('click', () =>
    deleteItemWithUndo(collectionId, item.id)
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
    addBtn.addEventListener('click', async () => {
      const name = ((await showPrompt('Field name (e.g. Price, Qty, SKU)')) || '').trim();
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
  binMode = null;
  openId = id;
  itemFilter = '';
  if (els.itemFilterInput) els.itemFilterInput.value = '';
  await setActive(id);
  render();
}

function back() {
  // From an AI view, go back to wherever the user was (a collection or the list).
  if (aiMode) {
    aiMode = null;
    render();
    return;
  }
  openId = null;
  binMode = null;
  render();
}

function openBin(mode) {
  binMode = mode;
  openId = null;
  aiMode = null;
  render();
}

// ---- AI: settings + chat ---------------------------------------------------

/** Hide every top-level view, then reveal just `view`. */
function showOnly(view) {
  for (const v of [els.listView, els.detailView, els.binView, els.settingsView, els.chatView]) {
    if (v) v.hidden = v !== view;
  }
}

function openSettings() {
  aiMode = 'settings';
  render();
}

function openChat(scope) {
  aiMode = 'chat';
  // Reset the conversation whenever the scope changes; keep it otherwise.
  if (!scope || scope.type !== chatScope.type || scope.id !== chatScope.id) {
    chatHistory = [];
  }
  chatScope = scope || { type: 'all' };
  render();
}

let aiStatusTimer;
function aiStatus(msg, kind = 'info') {
  els.aiStatus.textContent = msg;
  els.aiStatus.className = `settings-status ${kind}`;
  els.aiStatus.hidden = !msg;
}

// Populate the provider <select> once.
function ensureProviderOptions() {
  if (els.aiProvider.options.length) return;
  for (const [key, p] of Object.entries(AI_PROVIDERS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = p.label;
    els.aiProvider.appendChild(opt);
  }
}

// Show the auth-scheme picker only for OpenAI-compatible providers (where it
// varies — Azure uses an api-key header, others use a bearer token).
function refreshAuthVisibility() {
  const preset = AI_PROVIDERS[els.aiProvider.value] || {};
  els.aiAuthField.hidden = preset.kind !== 'openai';
  els.aiKeyField.hidden = !!preset.noKey;
}

async function renderSettings() {
  ensureProviderOptions();
  const cfg = await getAiConfig();
  const preset = AI_PROVIDERS[cfg.provider] || AI_PROVIDERS.anthropic;
  els.aiProvider.value = cfg.provider;
  els.aiBaseUrl.value = cfg.baseUrl || '';
  els.aiBaseUrl.placeholder = preset.baseHint || preset.baseUrl || '';
  els.aiModel.value = cfg.model || '';
  els.aiModel.placeholder = preset.model || '';
  els.aiKey.value = cfg.apiKey || '';
  els.aiKey.placeholder = preset.keyHint || '';
  els.aiAuth.value = cfg.auth || preset.auth || 'bearer';
  refreshAuthVisibility();
  aiStatus('');
}

// When the provider changes, swap in that preset's defaults so the user starts
// from a working base URL / model instead of stale values from another provider.
function onProviderChange() {
  const preset = AI_PROVIDERS[els.aiProvider.value] || {};
  els.aiBaseUrl.value = preset.baseUrl || '';
  els.aiBaseUrl.placeholder = preset.baseHint || preset.baseUrl || '';
  els.aiModel.value = preset.model || '';
  els.aiModel.placeholder = preset.model || '';
  els.aiKey.placeholder = preset.keyHint || '';
  els.aiAuth.value = preset.auth || 'bearer';
  refreshAuthVisibility();
}

function collectAiConfigFromForm() {
  return {
    provider: els.aiProvider.value,
    baseUrl: els.aiBaseUrl.value.trim(),
    model: els.aiModel.value.trim(),
    apiKey: els.aiKey.value.trim(),
    auth: els.aiAuth.value,
  };
}

async function saveAiSettings() {
  await setAiConfig(collectAiConfigFromForm());
  aiStatus('Saved.', 'ok');
  toast('AI settings saved');
}

async function testAiConnection() {
  const cfg = collectAiConfigFromForm();
  if (!isConfigured(cfg)) {
    aiStatus('Fill in the base URL, model and API key first.', 'error');
    return;
  }
  await setAiConfig(cfg); // persist what we're testing
  aiStatus('Testing…', 'info');
  try {
    const reply = await aiChat({
      config: cfg,
      system: 'You are a connection test. Reply with the single word: OK.',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    });
    aiStatus(`Connection OK — model replied: ${reply.trim().slice(0, 60)}`, 'ok');
  } catch (err) {
    aiStatus(err.message || 'Connection failed.', 'error');
  }
}

async function clearAiKey() {
  els.aiKey.value = '';
  await setAiConfig({ apiKey: '' });
  aiStatus('API key cleared.', 'ok');
}

function chatScopeLabel(data) {
  if (chatScope.type === 'collection') {
    const c = data.collections.find((x) => x.id === chatScope.id);
    return c ? c.title : 'collection';
  }
  return 'all collections';
}

function renderChat(data) {
  const configured = isConfigured(lastAiConfig); // lastAiConfig refreshed by render()
  const scopeName = chatScopeLabel(data);
  els.chatTitle.textContent =
    chatScope.type === 'collection' ? 'Chat · ' + scopeName : 'AI Chat';
  els.chatScope.textContent = `Context: ${scopeName}`;

  els.chatUnconfigured.hidden = configured;
  els.chatForm.hidden = !configured;
  els.chatMessages.hidden = !configured;

  els.chatMessages.innerHTML = '';
  if (!chatHistory.length && configured) {
    const hint = document.createElement('div');
    hint.className = 'chat-hint';
    hint.textContent =
      'Ask anything about your saved items — summaries, reports, comparisons, “what did I save about X?”';
    els.chatMessages.appendChild(hint);
  }
  for (const m of chatHistory) {
    const row = document.createElement('div');
    row.className = `chat-msg chat-${m.role}`;
    row.textContent = m.content;
    els.chatMessages.appendChild(row);
  }
  if (chatBusy) {
    const row = document.createElement('div');
    row.className = 'chat-msg chat-assistant chat-pending';
    row.textContent = 'Thinking…';
    els.chatMessages.appendChild(row);
  }
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  els.chatSend.disabled = chatBusy;
}

// Cached config so renderChat (sync) can reflect configured-state; refreshed
// before every chat render and after settings changes.
let lastAiConfig = {};
async function refreshAiConfigCache() {
  lastAiConfig = await getAiConfig();
}

async function sendChatMessage() {
  const text = els.chatText.value.trim();
  if (!text || chatBusy) return;
  const cfg = await getAiConfig();
  if (!isConfigured(cfg)) {
    openSettings();
    return;
  }

  const data = await getData();
  const collections =
    chatScope.type === 'collection'
      ? data.collections.filter((c) => c.id === chatScope.id)
      : data.collections;
  if (!collections.length) {
    toast('No collection data to chat about');
    return;
  }
  const system = buildSystemPrompt(collections, { scopeLabel: chatScopeLabel(data) });

  chatHistory.push({ role: 'user', content: text });
  els.chatText.value = '';
  chatBusy = true;
  renderChat(data);

  try {
    const reply = await aiChat({
      config: cfg,
      system,
      // Only forward real turns (skip any prior error rows) as conversation.
      messages: chatHistory
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })),
    });
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    chatHistory.push({ role: 'error', content: err.message || 'The AI request failed.' });
  } finally {
    chatBusy = false;
    renderChat(await getData());
  }
}

// ---- Delete / archive with undo --------------------------------------------

async function deleteCollectionWithUndo(id) {
  const data = await getData();
  const col = data.collections.find((c) => c.id === id);
  if (!col) return;
  const entryId = await trashCollection(id);
  if (!entryId) return;
  toast(`"${col.title}" moved to Trash`, {
    label: 'Undo',
    fn: () => restoreFromTrash(entryId),
  });
}

async function archiveCollectionWithUndo(id) {
  const data = await getData();
  const col = data.collections.find((c) => c.id === id);
  if (!col) return;
  await archiveCollection(id);
  toast(`"${col.title}" archived`, {
    label: 'Undo',
    fn: () => unarchiveCollection(id),
  });
}

async function deleteItemWithUndo(collectionId, itemId) {
  const data = await getData();
  const c = data.collections.find((x) => x.id === collectionId);
  const index = c ? c.items.findIndex((it) => it.id === itemId) : -1;
  const item = index >= 0 ? c.items[index] : null;
  if (!item) return;
  await removeItem(collectionId, itemId);
  toast('Item removed', { label: 'Undo', fn: () => insertItem(collectionId, item, index) });
}

// ---- Add current page ------------------------------------------------------

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url || /^(edge|chrome|about|extension):/i.test(tab.url)) {
    toast("Can't add this page (browser-internal).");
    return;
  }
  // Skip if this page is already in the open collection.
  if (openId && (await findPageByUrl(openId, tab.url))) {
    toast('Already in this collection');
    return;
  }
  let meta = {};
  try {
    meta = await chrome.runtime.sendMessage({ type: 'captureMeta', tabId: tab.id });
  } catch {
    /* worker may not respond on restricted pages */
  }
  let thumbnail = (meta && meta.thumbnail) || '';
  if (!thumbnail) {
    // No og:image — capture a local screenshot thumbnail of the visible tab.
    try {
      const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
      if (shot) thumbnail = await srcToCover(shot, 512);
    } catch {
      /* capture not permitted on some pages */
    }
  }
  const out = await addItem(openId, {
    type: 'page',
    url: tab.url,
    title: (meta && meta.title) || tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    thumbnail,
  });
  if (out?.item && (await getSettings()).cacheImages) {
    await cacheItemImage(out.collection.id, out.item.id);
  }
  toast('Page added');
}

/** Add every http(s) tab in the current window to the open collection. */
async function addAllTabs() {
  if (!openId) return;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const pages = tabs.filter((t) => /^https?:/i.test(t.url || ''));
  if (!pages.length) return toast('No saveable tabs open');

  const data = await getData();
  const col = data.collections.find((c) => c.id === openId);
  const existing = new Set((col?.items || []).filter((i) => i.type === 'page').map((i) => i.url));

  let added = 0;
  for (const t of pages) {
    if (existing.has(t.url)) continue;
    await addItem(openId, {
      type: 'page',
      url: t.url,
      title: t.title || t.url,
      favIconUrl: t.favIconUrl || '',
    });
    existing.add(t.url);
    added++;
  }
  toast(added ? `Added ${added} tab${added === 1 ? '' : 's'}` : 'All tabs already saved');
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

/** Export all collections, or one, as a real .xlsx workbook. */
async function doExportXlsx(collectionId) {
  const data = await getData();
  const collections = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  if (!collections.length) return toast('Nothing to export');

  const stamp = new Date().toISOString().slice(0, 10);
  const base = collectionId ? slugify(collections[0].title) : 'collections';
  download(
    buildXlsx(toXlsxSheets(collections)),
    `${base}-${stamp}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  toast('Exported Excel workbook');
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
      const replace = await showConfirm('Replace all current data with this backup?', {
        okLabel: 'Replace',
        cancelLabel: 'Merge',
      });
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
// FSA write permission is lost on every reload/restart; until the user
// re-grants it (a gesture), background pushes can't write. We pause rather than
// spam errors, and surface a one-click Resume.
let syncPaused = false;
let syncPausedNotified = false;

function syncBtn(action) {
  return document.querySelector(`#overflow-menu [data-action="${action}"]`);
}

async function refreshSyncMenu() {
  const create = syncBtn('sync-create');
  const openExisting = syncBtn('sync-open');
  const resume = syncBtn('sync-resume');
  const now = syncBtn('sync-now');
  const pull = syncBtn('sync-pull');
  const disc = syncBtn('sync-disconnect');
  const status = els.syncStatus;

  if (!sync.supported()) {
    create.hidden = openExisting.hidden = resume.hidden = now.hidden = pull.hidden = disc.hidden = true;
    status.hidden = false;
    status.textContent = 'Sync needs a Chromium browser with the File System Access API.';
    return;
  }

  const { connected, name, lastSyncAt } = await sync.status();
  create.hidden = openExisting.hidden = connected;
  now.hidden = pull.hidden = disc.hidden = !connected;
  resume.hidden = !(connected && syncPaused);
  status.hidden = !connected;
  if (connected) {
    if (syncPaused) {
      status.textContent = `Sync paused — write access needed (Resume above).`;
    } else {
      const when = lastSyncAt ? ` · ${relativeTime(lastSyncAt)}` : '';
      status.textContent = `Synced to ${name}${when}`;
    }
  }
}

/** "just now" / "5m ago" / "3h ago" / "2d ago". */
function relativeTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

let pendingPush = false; // local edits not yet written to the sync file

// Debounced background write after local edits.
function schedulePush() {
  pendingPush = true;
  if (syncPaused) {
    // Write access is gone; don't hammer the API. The edit is remembered in
    // pendingPush and flushes when the user clicks Resume.
    notifySyncPaused();
    return;
  }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    pushTimer = null;
    try {
      if ((await sync.status()).connected) {
        await sync.push();
        pendingPush = false;
        conflictNotified = false;
      }
    } catch (err) {
      if (err?.code === 'permission') {
        // Expected after a reload/restart — pause quietly, don't log an error.
        syncPaused = true;
        notifySyncPaused();
      } else {
        console.warn('Background sync push failed', err);
      }
    }
  }, 1500);
}

// Show the "sync paused" affordance once, and reflect it in the menu.
function notifySyncPaused() {
  refreshSyncMenu();
  if (syncPausedNotified) return;
  syncPausedNotified = true;
  toast('Sync paused — write access needed.', { label: 'Resume', fn: resumeSync });
}

// Re-grant write access (needs the user gesture from the Resume click) and flush.
async function resumeSync() {
  try {
    await sync.push({ interactive: true });
    syncPaused = false;
    syncPausedNotified = false;
    pendingPush = false;
    conflictNotified = false;
    toast('Sync resumed');
  } catch (err) {
    toast('Could not resume sync — write access denied');
  }
  refreshSyncMenu();
}

// FIRST device — create the sync file and seed it with local data.
async function createSync() {
  try {
    const { name, existing } = await sync.createFile();
    if (existing) {
      // The chosen file already has data — don't clobber it without asking.
      const useFile = await showConfirm(
        `"${name}" already contains ${existing.collections} collection(s). Load that file and replace your local data, or overwrite the file with your current data?`,
        { okLabel: 'Load file', cancelLabel: 'Overwrite' }
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
    syncPaused = false;
    syncPausedNotified = false;
    pendingPush = false;
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
      const proceed = await showConfirm(
        `"${name}" has no collections to load yet. Use it anyway and upload your current data?`,
        { okLabel: 'Use it', cancelLabel: 'Cancel' }
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
    syncPaused = false;
    syncPausedNotified = false;
    pendingPush = false;
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
    syncPaused = false;
    syncPausedNotified = false;
    pendingPush = false;
    toast('Synced');
  } catch (err) {
    console.error(err);
    toast('Sync failed');
  }
  refreshSyncMenu();
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

let conflictNotified = false;

// Best-effort pull on startup and when the panel regains focus (no prompt).
async function autoPull() {
  try {
    if (!(await sync.status()).connected) return;
    // Only engage the remote-apply guard when there's actually a new version,
    // so frequent polling can't suppress a concurrent local edit's push.
    if (!(await sync.hasRemoteChange())) return;

    // Conflict: this device has un-pushed edits AND the file changed elsewhere.
    // Don't silently overwrite local edits — keep ours and offer to use the file.
    if (pendingPush) {
      if (!conflictNotified) {
        conflictNotified = true;
        toast('Sync conflict — keeping your changes.', {
          label: 'Use file instead',
          fn: async () => {
            if (pushTimer) {
              clearTimeout(pushTimer);
              pushTimer = null;
            }
            try {
              applyingRemote = true;
              const r = await sync.pull({ interactive: true, force: true });
              if (!r.applied) applyingRemote = false;
              pendingPush = false;
              conflictNotified = false;
            } catch {
              applyingRemote = false;
            }
          },
        });
      }
      return;
    }

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

els.itemFilterInput.addEventListener('input', () => {
  itemFilter = els.itemFilterInput.value.trim().toLowerCase();
  render();
});

$('#new-folder-btn').addEventListener('click', async () => {
  const name = ((await showPrompt('New folder name:')) || '').trim();
  if (name) await createFolder(name);
});

async function updateSettingLabels() {
  const s = await getSettings();
  const cacheBtn = $('#toggle-cache-btn');
  if (cacheBtn) cacheBtn.textContent = `Cache images offline: ${s.cacheImages ? 'On' : 'Off'}`;
  const themeBtn = $('#toggle-theme-btn');
  if (themeBtn) themeBtn.textContent = `Theme: ${s.theme === 'light' ? 'Light' : 'Dark'}`;
}

/** Refresh the little count badges on the topbar Archive/Trash buttons. */
function updateBinBadges(data) {
  const set = (sel, count) => {
    const el = $(sel);
    if (!el) return;
    el.hidden = !count;
    el.textContent = count > 99 ? '99+' : String(count);
  };
  set('#archive-badge', (data.archive || []).length);
  set('#trash-badge', (data.trash || []).length);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

$('#overflow-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = $('#overflow-menu').hidden;
  if (willOpen) {
    refreshSyncMenu();
    updateSettingLabels();
  }
  openMenu($('#overflow-menu'), willOpen);
});

$('#overflow-menu').addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  $('#overflow-menu').hidden = true;
  if (action === 'export-json') doExport();
  if (action === 'export-xlsx') doExportXlsx();
  if (action === 'export-csv') doExportCsv();
  if (action === 'export-md') doExportDoc('md');
  if (action === 'export-html') doExportDoc('html');
  if (action === 'import-json') pickFile('json');
  if (action === 'import-csv') pickFile('csv');
  if (action === 'toggle-cache') {
    const s = await getSettings();
    await setSettings({ cacheImages: !s.cacheImages });
    toast(`Offline image caching ${!s.cacheImages ? 'on' : 'off'}`);
  }
  if (action === 'toggle-theme') {
    const s = await getSettings();
    const theme = s.theme === 'light' ? 'dark' : 'light';
    await setSettings({ theme });
    applyTheme(theme);
  }
  if (action === 'history') openHistoryMenu();
  if (action === 'ai-chat') openChat({ type: 'all' });
  if (action === 'ai-settings') openSettings();
  if (action === 'sync-create') createSync();
  if (action === 'sync-open') openSync();
  if (action === 'sync-resume') resumeSync();
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

// Trash / Archive view
$('#open-archive-btn').addEventListener('click', () => openBin('archive'));
$('#open-trash-btn').addEventListener('click', () => openBin('trash'));
$('#bin-back-btn').addEventListener('click', back);

// AI settings view
$('#settings-back-btn').addEventListener('click', back);
els.aiProvider.addEventListener('change', onProviderChange);
$('#ai-save-btn').addEventListener('click', saveAiSettings);
$('#ai-test-btn').addEventListener('click', testAiConnection);
$('#ai-clear-btn').addEventListener('click', clearAiKey);

// AI chat view
$('#chat-back-btn').addEventListener('click', back);
$('#chat-settings-btn').addEventListener('click', openSettings);
$('#chat-go-settings').addEventListener('click', openSettings);
$('#chat-clear-btn').addEventListener('click', () => {
  chatHistory = [];
  render();
});
els.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendChatMessage();
});
// Enter sends; Shift+Enter inserts a newline.
els.chatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
els.emptyTrashBtn.addEventListener('click', async () => {
  const data = await getData();
  const n = (data.trash || []).length;
  if (!n) return;
  if (
    await showConfirm(
      `Permanently delete all ${n} item${n === 1 ? '' : 's'} in the Trash? This can’t be undone.`,
      { okLabel: 'Empty Trash', danger: true }
    )
  ) {
    await emptyTrash();
    toast('Trash emptied');
  }
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
    await openAllPages(c);
  }
  if (action === 'add-note') {
    await addItem(openId, { type: 'note', text: '' });
  }
  if (action === 'add-all-tabs') {
    await addAllTabs();
  }
  if (action === 'export-collection-xlsx') {
    await doExportXlsx(openId);
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
  if (action === 'chat-collection') {
    openChat({ type: 'collection', id: openId });
  }
  if (action === 'edit-tags') {
    const current = (c.tags || []).join(', ');
    const input = await showPrompt('Tags (comma-separated):', { value: current });
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
  if (action === 'cache-now') {
    toast('Caching images…');
    const { cached } = await cacheCollectionImages(openId);
    toast(cached ? `Cached ${cached} image${cached === 1 ? '' : 's'}` : 'Nothing to cache');
  }
  if (action === 'archive-collection') {
    const id = openId;
    back();
    await archiveCollectionWithUndo(id);
  }
  if (action === 'delete-collection') {
    const id = openId;
    back();
    await deleteCollectionWithUndo(id);
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
  snapshotHistory(); // throttled rollback snapshot of local edits
  schedulePush();
});

// ---- Drag a link/image onto the panel to save it ---------------------------

function externalDrag(e) {
  // Ignore our own internal item/collection reorder drags.
  if (dragId || cardDragId || !e.dataTransfer) return false;
  return [...e.dataTransfer.types].some(
    (t) => t === 'text/uri-list' || t === 'text/plain' || t === 'text/html'
  );
}

document.addEventListener('dragover', (e) => {
  if (!externalDrag(e)) return;
  e.preventDefault();
  document.body.classList.add('drag-over');
});
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) document.body.classList.remove('drag-over');
});
document.addEventListener('drop', async (e) => {
  if (!externalDrag(e)) return;
  e.preventDefault();
  document.body.classList.remove('drag-over');
  const dt = e.dataTransfer;
  const target = openId || (await ensureActiveCollection()).id;

  // An image drag exposes the <img> in text/html.
  const html = dt.getData('text/html');
  const imgMatch = html && html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && /^https?:/i.test(imgMatch[1])) {
    await addItem(target, { type: 'image', src: imgMatch[1], srcPageUrl: '', alt: '' });
    toast('Image saved');
    return;
  }

  const raw = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
  const url = raw.split(/\s+/)[0];
  if (!/^https?:\/\//i.test(url)) return;
  if (await findPageByUrl(target, url)) {
    toast('Already in this collection');
    return;
  }
  await addItem(target, { type: 'page', url, title: url });
  toast('Saved');
});

// Initial paint, then reflect sync state, theme, and pull any newer remote data.
getSettings().then((s) => applyTheme(s.theme));
render();
// Drop any trashed items past the 30-day retention window (best-effort).
purgeExpiredTrash().catch(() => {});
// If connected but write access lapsed (e.g. after a reload), mark sync paused
// up front so the menu shows Resume instead of failing the first push.
sync.status().then(async ({ connected }) => {
  if (connected && !(await sync.canWrite())) {
    syncPaused = true;
  }
  refreshSyncMenu();
});
autoPull();
