// app.js — the Collections Plus mobile web app.
//
// Runs the SAME store.js the extension uses, on an IndexedDB backend, so the
// data model, migrations and every edit behave exactly as on the desktop.
// Views (hash routes): #/ home, #/c/<id> a collection, #/reading the reading
// list. Edits sync through the user's own Dropbox (lib/sync-engine.js).

import { setBackend, backend } from '../lib/backend.js';
import { createIdbBackend } from '../lib/idb-backend.js';
import { createDropboxAdapter } from '../lib/dropbox-adapter.js';
import { syncOnce } from '../lib/sync-engine.js';
import { matchRule } from '../lib/rules.js';
import { DROPBOX_APP_KEY } from './config.js';

// MUST run before any store.js call: store.js resolves its backend on each
// operation, so setting it first keeps every read and write on IndexedDB.
setBackend(createIdbBackend());

import * as store from '../lib/store.js';

const $ = (id) => document.getElementById(id);
const els = {
  title: $('title'),
  back: $('back'),
  searchBtn: $('search-btn'),
  menuBtn: $('menu-btn'),
  searchbar: $('searchbar'),
  search: $('search'),
  chip: $('sync-chip'),
  view: $('view'),
  fab: $('fab'),
  sheet: $('sheet'),
  sheetForm: $('sheet-form'),
  sheetTitle: $('sheet-title'),
  sheetBody: $('sheet-body'),
  toast: $('toast'),
  toastMsg: $('toast-msg'),
  toastBtn: $('toast-btn'),
  importFile: $('import-file'),
};

// ---- Icons (inline SVG, stroke = currentColor) -----------------------------

const ICON = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  moreV: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  pin: '<path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z"/>',
  book: '<path d="M2 5h6a4 4 0 014 4v11a3 3 0 00-3-3H2zM22 5h-6a4 4 0 00-4 4v11a3 3 0 013-3h7z"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  move: '<path d="M4 7h11l-3-3M20 17H9l3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sync: '<path d="M20 11a8 8 0 00-14-4.9L4 8M4 4v4h4M4 13a8 8 0 0014 4.9L20 16M20 20v-4h-4"/>',
  cloud: '<path d="M7 18a5 5 0 01-.6-9.96A6 6 0 0118 9a4.5 4.5 0 01-.5 9z"/>',
  unlink: '<path d="M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1M3 3l18 18"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  note: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>',
  link: '<path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/>',
  folder: '<path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

els.back.innerHTML = icon('back');
els.searchBtn.innerHTML = icon('search');
els.menuBtn.innerHTML = icon('more');
els.fab.innerHTML = icon('plus');

// ---- Helpers ---------------------------------------------------------------

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** Only real web links become hrefs; synced data could hold anything. */
function safeHref(u) {
  return /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
}

/** Images: web URLs or inline data: images only. */
function safeImg(u) {
  const s = String(u || '');
  return /^https?:\/\//i.test(s) || /^data:image\//i.test(s) ? s : '';
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Accept "example.com/page" as well as full URLs. */
function normalizeUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : '';
  } catch {
    return '';
  }
}

/** A stable tile color for collections without a cover. */
function tileColor(id) {
  const palette = ['#0f6cbd', '#8a3ffc', '#007d79', '#c2410c', '#b8325e', '#4d7c0f', '#5b5bd6', '#0e7490'];
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

function itemText(it) {
  if (it.type === 'note' || it.type === 'highlight') return it.text || '';
  if (it.type === 'image') return it.alt || '';
  return it.title || it.url || '';
}

const imgAttrs = 'loading="lazy" decoding="async" referrerpolicy="no-referrer" alt=""';

// ---- State -----------------------------------------------------------------

let data = null; // last read of store.getData()
let settings = null;
let query = '';
const COLLAPSED_KEY = 'cp.collapsedFolders'; // per-device, not synced

function collapsedFolders() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function toggleFolderLocal(id) {
  const set = collapsedFolders();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    /* private mode: collapse just won't be remembered */
  }
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('c/')) return { name: 'collection', id: decodeURIComponent(h.slice(2)) };
  if (h === 'reading') return { name: 'reading' };
  return { name: 'home' };
}

function go(hash) {
  if (els.sheet.open) {
    // Navigating from inside a sheet: the destination takes over the sheet's
    // history entry, so Back then returns to where the sheet was opened.
    const reuse = sheetHasHistory;
    sheetHasHistory = false;
    els.sheet.close();
    if (reuse) {
      history.replaceState(null, '', hash);
      window.scrollTo(0, 0);
      render();
      return;
    }
  }
  if (location.hash !== hash) location.hash = hash;
  else render();
}

const findCol = (id) => data.collections.find((c) => c.id === id) || null;
const allPages = () =>
  data.collections.flatMap((c) => c.items.filter((it) => it.type === 'page').map((it) => ({ it, c })));

/** Run a store edit, re-render, and queue a sync. */
async function edit(fn) {
  const out = await fn();
  await render();
  scheduleSync();
  return out;
}

// ---- Rendering -------------------------------------------------------------

async function render() {
  [data, settings] = await Promise.all([store.getData(), store.getSettings()]);
  const r = route();
  if (r.name === 'collection' && !findCol(r.id)) return go('#/');
  els.back.hidden = r.name === 'home';
  els.searchBtn.hidden = r.name !== 'home';
  els.searchbar.hidden = r.name !== 'home' || !(query || document.activeElement === els.search || els.searchbar.dataset.open);
  els.fab.hidden = r.name === 'reading';
  if (r.name === 'home') renderHome();
  else if (r.name === 'collection') renderCollection(findCol(r.id));
  else renderReading();
}

function coverOf(c) {
  const first = c.items.find((it) => (it.type === 'page' && it.thumbnail) || (it.type === 'image' && it.src));
  return safeImg(c.cover) || safeImg(first?.thumbnail || first?.src);
}

function collectionCard(c) {
  const cover = coverOf(c);
  const kids = data.collections.filter((x) => x.parentId === c.id).length;
  const meta = [plural(c.items.length, 'item'), kids ? plural(kids, 'collection') : ''].filter(Boolean).join(' · ');
  const art = cover
    ? `<img class="cover" src="${esc(cover)}" ${imgAttrs}>`
    : `<span class="cover letter" style="background:${tileColor(c.id)}">${esc((c.title || '?').trim().charAt(0).toUpperCase())}</span>`;
  const tags = (c.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  return `<a class="card" href="#/c/${encodeURIComponent(c.id)}">
    ${art}
    <span class="card-main">
      <span class="card-title">${c.pinned ? icon('pin') : ''}<span>${esc(c.title)}</span></span>
      <span class="meta">${meta}</span>
      ${tags ? `<span class="tags">${tags}</span>` : ''}
    </span>
    <span class="chev">${icon('chev')}</span>
  </a>`;
}

function setTitle(text) {
  els.title.textContent = text;
  document.title = text === 'Collections' ? 'Collections Plus' : `${text} · Collections Plus`;
}

function renderHome() {
  setTitle('Collections');
  const cols = data.collections;

  if (query) return renderSearch();

  if (!cols.length) {
    const canSync = dropbox && !dropbox.isConnected();
    els.view.innerHTML = `<div class="empty">
      <img class="art" src="./icon-192.png" alt="">
      <h2>Your collections, on your phone</h2>
      <p>${canSync ? 'Connect Dropbox to bring in your library from the Collections Plus extension, or start a new collection here.' : 'Create a collection, then save pages and notes into it.'}</p>
      <div class="stack">
        ${canSync ? `<button class="btn primary" data-act="connect">${icon('cloud')} Connect Dropbox</button>` : ''}
        <button class="btn${canSync ? '' : ' primary'}" data-act="new-collection">${icon('plus')} New collection</button>
      </div>
    </div>`;
    return;
  }

  const unread = settings.readingListEnabled ? allPages().filter(({ it }) => it.unread).length : 0;
  const reading = unread
    ? `<a class="card reading-link" href="#/reading"><span class="cover">${icon('book')}</span>
        <span class="card-main"><span class="card-title"><span>Reading list</span></span><span class="meta">${plural(unread, 'unread page')}</span></span>
        <span class="chev">${icon('chev')}</span></a>`
    : '';

  // Same arrangement as the extension's manual order: folders and top-level
  // collections share one order; pinned collections rise to the top.
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  const folders = data.folders || [];
  const nodes = [
    ...folders.map((f) => ({ kind: 'folder', order: f.order ?? 0, f })),
    ...cols.filter((c) => !c.parentId).map((c) => ({ kind: 'col', order: c.order ?? 0, c })),
  ].sort(byOrder);
  const pinned = nodes.filter((n) => n.kind === 'col' && n.c.pinned);
  const rest = nodes.filter((n) => !(n.kind === 'col' && n.c.pinned));
  const collapsed = collapsedFolders();

  const html = [...pinned, ...rest]
    .map((n) => {
      if (n.kind === 'col') return collectionCard(n.c);
      const kids = cols.filter((c) => c.parentId === n.f.id).sort(byOrder);
      const shut = collapsed.has(n.f.id);
      return `<button class="folder${shut ? ' collapsed' : ''}" data-act="folder" data-id="${esc(n.f.id)}" aria-expanded="${!shut}">
          ${icon('down')}<span class="swatch" style="${n.f.color ? `background:${esc(n.f.color)}` : ''}"></span>${esc(n.f.name)}<span class="count">${kids.length}</span>
        </button>
        ${shut || !kids.length ? '' : `<div class="folder-kids">${kids.map(collectionCard).join('')}</div>`}`;
    })
    .join('');

  els.view.innerHTML = `<div class="stack">${reading}${html}</div>`;
}

function renderSearch() {
  const q = query.toLowerCase();
  const hit = (s) => String(s || '').toLowerCase().includes(q);
  const cols = data.collections.filter((c) => hit(c.title) || (c.tags || []).some(hit));
  const items = [];
  for (const c of data.collections) {
    for (const it of c.items) {
      if (hit(itemText(it)) || hit(it.url) || hit(it.note) || Object.values(it.fields || {}).some(hit)) {
        items.push({ it, c });
      }
    }
  }
  if (!cols.length && !items.length) {
    els.view.innerHTML = `<div class="empty"><h2>No matches</h2><p>Nothing matches “${esc(query)}”.</p></div>`;
    return;
  }
  els.view.innerHTML =
    (cols.length ? `<div class="section-label">Collections</div><div class="stack">${cols.map(collectionCard).join('')}</div>` : '') +
    (items.length
      ? `<div class="section-label">Pages &amp; notes</div><div class="stack">${items
          .slice(0, 200)
          .map(({ it, c }) => itemRow(it, c, { showCollection: true }))
          .join('')}</div>`
      : '');
}

function itemRow(it, c, { showCollection = false } = {}) {
  const more = `<button class="icon-btn more-btn" data-act="item-menu" data-col="${esc(c.id)}" data-id="${esc(it.id)}" aria-label="Item options">${icon('moreV')}</button>`;
  const from = showCollection ? `<div class="from">in ${esc(c.title)}</div>` : '';
  const done = it.done ? ' done' : '';

  if (it.type === 'note') {
    return `<div class="item${done}"><div class="item-body"><div class="note-text">${esc(it.text)}</div>${from}</div>${more}</div>`;
  }
  if (it.type === 'highlight') {
    const href = safeHref(it.url);
    return `<div class="item${done}"><div class="item-body">
        <div class="quote">${esc(it.text)}</div>
        ${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ''}
        ${href ? `<a class="host" href="${esc(href)}" target="_blank" rel="noopener"><span>${esc(it.title || hostOf(href))}</span></a>` : ''}
        ${from}</div>${more}</div>`;
  }
  if (it.type === 'image') {
    const src = safeImg(it.src);
    const page = safeHref(it.srcPageUrl);
    return `<div class="item${done}"><div class="item-body">
        ${src ? `<img class="item-img" src="${esc(src)}" ${imgAttrs.replace('alt=""', `alt="${esc(it.alt)}"`)}>` : ''}
        ${page ? `<a class="host" href="${esc(page)}" target="_blank" rel="noopener"><span>${esc(it.alt || hostOf(page))}</span></a>` : ''}
        ${from}</div>${more}</div>`;
  }

  const href = safeHref(it.url);
  const thumb = safeImg(it.thumbnail);
  const fav = safeImg(it.favIconUrl);
  const art = thumb
    ? `<img class="thumb" src="${esc(thumb)}" ${imgAttrs}>`
    : fav
      ? `<img class="thumb fav" src="${esc(fav)}" ${imgAttrs}>`
      : `<span class="thumb blank">${icon('link')}</span>`;
  const unread = settings.readingListEnabled && it.unread ? '<span class="unread-dot" title="Unread"></span>' : '';
  const body = `${art}<span class="item-body">
      <span class="item-title">${esc(it.title || it.url)}</span>
      <span class="host">${unread}<span>${esc(hostOf(it.url))}</span></span>
      ${it.note ? `<span class="item-note">${esc(it.note)}</span>` : ''}
      ${from}
    </span>`;
  return `<div class="item${done}">
      ${href ? `<a class="item-link" href="${esc(href)}" target="_blank" rel="noopener" data-act="open" data-col="${esc(c.id)}" data-id="${esc(it.id)}">${body}</a>` : `<div class="item-link">${body}</div>`}
      ${more}
    </div>`;
}

function renderCollection(c) {
  setTitle(c.title);
  const kids = data.collections
    .filter((x) => x.parentId === c.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const subs = kids.length
    ? `<div class="section-label">Collections</div><div class="stack">${kids.map(collectionCard).join('')}</div>`
    : '';
  const items = c.items.length
    ? `${kids.length ? '<div class="section-label">Items</div>' : ''}<div class="stack">${c.items.map((it) => itemRow(it, c)).join('')}</div>`
    : kids.length
      ? ''
      : `<div class="empty"><h2>Nothing here yet</h2><p>Tap + to save a link or write a note.</p></div>`;
  els.view.innerHTML = subs + items;
}

function renderReading() {
  setTitle('Reading list');
  const unread = allPages()
    .filter(({ it }) => it.unread)
    .sort((a, b) => (b.it.addedAt || 0) - (a.it.addedAt || 0));
  if (!unread.length) {
    els.view.innerHTML = `<div class="empty"><h2>All caught up</h2><p>Pages you save start here until you open them.</p></div>`;
    return;
  }
  els.view.innerHTML = `<div class="row-actions"><button class="btn small" data-act="mark-all-read">${icon('check')} Mark all read</button></div>
    <div class="stack">${unread.map(({ it, c }) => itemRow(it, c, { showCollection: true })).join('')}</div>`;
}

// ---- Bottom sheet ----------------------------------------------------------
// One <dialog> reused for every sheet. Opening pushes a history entry so the
// phone's back button closes the sheet instead of leaving the view.

let sheetHandlers = {};
let sheetHasHistory = false;
let ownBack = false; // a history.back() we issued ourselves is in flight

/** Open a sheet, or swap the open sheet's contents (no extra history entry). */
function openSheet(title, bodyHtml, handlers = {}) {
  els.sheetTitle.textContent = title || '';
  els.sheetBody.innerHTML = bodyHtml;
  sheetHandlers = handlers;
  if (!els.sheet.open) {
    els.sheet.showModal();
    history.pushState({ sheet: true }, '');
    sheetHasHistory = true;
  }
  const first = els.sheetBody.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
}

function closeSheet() {
  if (!els.sheet.open) return;
  els.sheet.close();
}

els.sheet.addEventListener('close', () => {
  els.sheetBody.innerHTML = '';
  sheetHandlers = {};
  if (sheetHasHistory) {
    sheetHasHistory = false;
    if (history.state?.sheet) {
      ownBack = true;
      history.back(); // drop the sheet's history entry
    }
  }
});
window.addEventListener('popstate', () => {
  if (ownBack) {
    // Our own cleanup after closing a sheet. If another sheet opened in the
    // meantime, leave it open.
    ownBack = false;
    return;
  }
  if (els.sheet.open) {
    sheetHasHistory = false; // the back press already consumed our entry
    els.sheet.close();
  }
});
// Tap on the dimmed backdrop closes the sheet.
els.sheet.addEventListener('click', (e) => {
  if (e.target === els.sheet) closeSheet();
});
els.sheetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fn = sheetHandlers.submit;
  if (fn) runSheetAction(fn);
});
els.sheetBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sheet]');
  if (!btn) return;
  if (btn.tagName !== 'A') e.preventDefault(); // links still open
  const fn = sheetHandlers[btn.dataset.sheet];
  if (fn) runSheetAction(fn, btn);
});

async function runSheetAction(fn, btn) {
  const keepOpen = await fn(new FormData(els.sheetForm), btn);
  if (keepOpen !== true) closeSheet();
}

function menuItem(act, iconName, label, cls = '') {
  return `<button type="button" data-sheet="${act}" class="${cls}">${icon(iconName)}<span>${label}</span></button>`;
}

function collectionOptions(selectedId, { allowNew = false } = {}) {
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
  const top = data.collections.filter((c) => !c.parentId || !findCol(c.parentId)).sort(byOrder);
  const out = [];
  const walk = (c, depth) => {
    out.push(`<option value="${esc(c.id)}"${c.id === selectedId ? ' selected' : ''}>${'  '.repeat(depth)}${depth ? '↳ ' : ''}${esc(c.title)}</option>`);
    data.collections.filter((k) => k.parentId === c.id).sort(byOrder).forEach((k) => walk(k, depth + 1));
  };
  top.forEach((c) => walk(c, 0));
  if (allowNew) out.push(`<option value="__new__"${!data.collections.length ? ' selected' : ''}>＋ New collection…</option>`);
  return out.join('');
}

// ---- Toast -----------------------------------------------------------------

let toastTimer = null;
function toast(msg, action) {
  els.toastMsg.textContent = msg;
  els.toastBtn.hidden = !action;
  els.toastBtn.textContent = action?.label || '';
  els.toastBtn.onclick = action
    ? async () => {
        els.toast.hidden = true;
        await action.fn();
      }
    : null;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), action ? 6000 : 3000);
}

// ---- Actions ---------------------------------------------------------------

function newCollectionSheet() {
  openSheet(
    'New collection',
    `<label class="field"><span>Name</span><input name="title" required maxlength="200" autofocus placeholder="e.g. Trip to Japan"></label>
     <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Create</button></div>`,
    {
      cancel: () => {},
      submit: async (f) => {
        const title = String(f.get('title') || '').trim();
        if (!title) return true;
        const parent = route().name === 'collection' ? route().id : null;
        const created = parent
          ? await edit(() => store.createSubCollection(parent, title))
          : await edit(() => store.createCollection(title));
        if (created) go(`#/c/${encodeURIComponent(created.id)}`);
      },
    }
  );
}

/** Save a link. `prefill` comes from the share sheet. */
function saveLinkSheet({ url = '', title = '', collectionId = null, heading = 'Save a link' } = {}) {
  const target = collectionId || (findCol(data.activeCollectionId) ? data.activeCollectionId : data.collections[0]?.id);
  const shared = !!url;
  openSheet(
    heading,
    `${shared ? `<div class="share-preview"><b>${esc(title || hostOf(url))}</b>${esc(url)}</div><input type="hidden" name="url" value="${esc(url)}">` : `<label class="field"><span>Link</span><input name="url" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus placeholder="https://…"></label>`}
     <label class="field"><span>Title</span><input name="title" maxlength="500" value="${esc(title)}" placeholder="Optional"></label>
     <label class="field"><span>Collection</span><select name="col">${collectionOptions(target, { allowNew: true })}</select></label>
     <label class="field" data-new hidden><span>New collection name</span><input name="newTitle" maxlength="200"></label>
     <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Optional"></textarea></label>
     <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div>`,
    {
      cancel: () => {},
      submit: async (f) => {
        const href = normalizeUrl(f.get('url'));
        if (!href) {
          toast('That doesn’t look like a web address');
          return true;
        }
        let colId = String(f.get('col') || '');
        if (colId === '__new__' || !colId) {
          const name = String(f.get('newTitle') || '').trim() || 'My Collection';
          colId = (await store.createCollection(name)).id;
        }
        const existing = await store.findPageByUrl(colId, href);
        if (existing) {
          await render();
          toast(`Already in ${findCol(colId)?.title || 'that collection'}`);
          return;
        }
        await edit(() =>
          store.addItem(colId, {
            type: 'page',
            url: href,
            title: String(f.get('title') || '').trim() || hostOf(href),
            note: String(f.get('note') || '').trim(),
            unread: !!settings.readingListEnabled,
          })
        );
        toast(`Saved to ${findCol(colId)?.title || 'collection'}`, {
          label: 'View',
          fn: () => go(`#/c/${encodeURIComponent(colId)}`),
        });
      },
    }
  );
  const select = els.sheetBody.querySelector('select[name="col"]');
  const newField = els.sheetBody.querySelector('[data-new]');
  const syncNew = () => (newField.hidden = select.value !== '__new__');
  select.addEventListener('change', syncNew);
  syncNew();
}

function addSheet() {
  const r = route();
  if (r.name !== 'collection') {
    openSheet(
      '',
      `<div class="menu-list">
        ${menuItem('link', 'link', 'Save a link')}
        ${menuItem('collection', 'plus', 'New collection')}
      </div>`,
      { link: () => (saveLinkSheet(), true), collection: () => (newCollectionSheet(), true) }
    );
    return;
  }
  const c = findCol(r.id);
  openSheet(
    `Add to ${c.title}`,
    `<div class="segmented" role="tablist">
       <button type="button" class="on" data-tab="link">Link</button>
       <button type="button" data-tab="note">Note</button>
       <button type="button" data-tab="sub">Collection</button>
     </div>
     <div data-pane="link">
       <label class="field"><span>Link</span><input name="url" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus placeholder="https://…"></label>
       <label class="field"><span>Title</span><input name="title" maxlength="500" placeholder="Optional"></label>
       <label class="field"><span>Note</span><textarea name="note" rows="2" placeholder="Optional"></textarea></label>
     </div>
     <div data-pane="note" hidden><label class="field"><span>Note</span><textarea name="text" rows="5"></textarea></label></div>
     <div data-pane="sub" hidden><label class="field"><span>Name</span><input name="subTitle" maxlength="200" placeholder="A collection inside ${esc(c.title)}"></label></div>
     <input type="hidden" name="tab" value="link">
     <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Add</button></div>`,
    {
      cancel: () => {},
      submit: async (f) => {
        const tab = f.get('tab');
        if (tab === 'note') {
          const text = String(f.get('text') || '').trim();
          if (!text) return true;
          await edit(() => store.addItem(c.id, { type: 'note', text }));
          return;
        }
        if (tab === 'sub') {
          const title = String(f.get('subTitle') || '').trim();
          if (!title) return true;
          const created = await edit(() => store.createSubCollection(c.id, title));
          if (created) go(`#/c/${encodeURIComponent(created.id)}`);
          return;
        }
        const href = normalizeUrl(f.get('url'));
        if (!href) {
          toast('That doesn’t look like a web address');
          return true;
        }
        if (await store.findPageByUrl(c.id, href)) {
          toast('Already in this collection');
          return true;
        }
        await edit(() =>
          store.addItem(c.id, {
            type: 'page',
            url: href,
            title: String(f.get('title') || '').trim() || hostOf(href),
            note: String(f.get('note') || '').trim(),
            unread: !!settings.readingListEnabled,
          })
        );
      },
    }
  );
  const tabs = els.sheetBody.querySelectorAll('[data-tab]');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      els.sheetBody.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
      els.sheetBody.querySelector('input[name="tab"]').value = t.dataset.tab;
      els.sheetBody.querySelector(`[data-pane="${t.dataset.tab}"] input, [data-pane="${t.dataset.tab}"] textarea`)?.focus();
    })
  );
}

function itemMenu(colId, itemId) {
  const c = findCol(colId);
  const it = c?.items.find((x) => x.id === itemId);
  if (!it) return;
  const isPage = it.type === 'page';
  const href = safeHref(it.url || it.srcPageUrl);
  openSheet(
    itemText(it).slice(0, 120) || 'Item',
    `<div class="menu-list">
      ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener" data-sheet="open">${icon('open')}<span>Open</span></a>` : ''}
      ${menuItem('edit', 'edit', 'Edit')}
      ${isPage && settings.readingListEnabled ? menuItem('unread', it.unread ? 'check' : 'dot', it.unread ? 'Mark as read' : 'Mark as unread') : ''}
      ${menuItem('done', 'check', it.done ? 'Mark as not done' : 'Mark as done')}
      ${data.collections.length > 1 ? menuItem('move', 'move', 'Move to…') : ''}
      <div class="menu-sep"></div>
      ${menuItem('delete', 'trash', 'Delete', 'danger')}
    </div>`,
    {
      open: () => markOpened(colId, itemId),
      edit: () => (editItemSheet(c, it), true),
      unread: () => edit(() => store.updateItem(colId, itemId, { unread: !it.unread })),
      done: () => edit(() => store.toggleDone(colId, itemId)),
      move: () => (moveSheet(c, it), true),
      delete: async () => {
        const index = c.items.findIndex((x) => x.id === itemId);
        await edit(() => store.removeItem(colId, itemId));
        toast('Deleted', { label: 'Undo', fn: () => edit(() => store.insertItem(colId, it, index)) });
      },
    }
  );
}

function editItemSheet(c, it) {
  let fields;
  if (it.type === 'note') {
    fields = `<label class="field"><span>Note</span><textarea name="text" rows="6" autofocus>${esc(it.text)}</textarea></label>`;
  } else if (it.type === 'highlight') {
    fields = `<label class="field"><span>Your note</span><textarea name="note" rows="4" autofocus>${esc(it.note)}</textarea></label>`;
  } else if (it.type === 'image') {
    fields = `<label class="field"><span>Description</span><input name="alt" value="${esc(it.alt)}" autofocus></label>`;
  } else {
    fields = `<label class="field"><span>Title</span><input name="title" value="${esc(it.title)}" autofocus></label>
      <label class="field"><span>Note</span><textarea name="note" rows="4">${esc(it.note)}</textarea></label>`;
  }
  openSheet(
    'Edit',
    `${fields}<div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div>`,
    {
      cancel: () => {},
      submit: async (f) => {
        const patch = {};
        for (const k of ['text', 'note', 'alt', 'title']) {
          if (f.has(k)) patch[k] = String(f.get(k)).trim();
        }
        if (it.type === 'page' && !patch.title) patch.title = hostOf(it.url) || it.url;
        await edit(() => store.updateItem(c.id, it.id, patch));
      },
    }
  );
}

function moveSheet(c, it) {
  const others = collectionOptions(c.id);
  openSheet(
    'Move to',
    `<label class="field"><span>Collection</span><select name="to">${others}</select></label>
     <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Move</button></div>`,
    {
      cancel: () => {},
      submit: async (f) => {
        const to = String(f.get('to'));
        if (to === c.id) return;
        await edit(() => store.moveItems(c.id, [it.id], to));
        toast(`Moved to ${findCol(to)?.title || 'collection'}`);
      },
    }
  );
}

function collectionMenu(c) {
  openSheet(
    c.title,
    `<div class="menu-list">
      ${menuItem('rename', 'edit', 'Rename')}
      ${menuItem('pin', 'pin', c.pinned ? 'Unpin' : 'Pin to top')}
      <div class="menu-sep"></div>
      ${menuItem('delete', 'trash', 'Move to Trash', 'danger')}
    </div>`,
    {
      rename: () => {
        openSheet(
          'Rename collection',
          `<label class="field"><span>Name</span><input name="title" value="${esc(c.title)}" required autofocus></label>
           <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn primary" type="submit">Save</button></div>`,
          {
            cancel: () => {},
            submit: (f) => edit(() => store.renameCollection(c.id, String(f.get('title') || ''))),
          }
        );
        return true;
      },
      pin: () => edit(() => store.setPinned(c.id, !c.pinned)),
      delete: async () => {
        const parent = c.parentId && findCol(c.parentId) ? c.parentId : null;
        const entryId = await store.trashCollection(c.id);
        go(parent ? `#/c/${encodeURIComponent(parent)}` : '#/');
        scheduleSync();
        toast('Moved to Trash', {
          label: 'Undo',
          fn: async () => {
            await edit(() => store.restoreFromTrash(entryId));
            go(`#/c/${encodeURIComponent(c.id)}`);
          },
        });
      },
    }
  );
}

function appMenu() {
  const connected = dropbox?.isConnected();
  const syncPart = dropbox
    ? connected
      ? `<p class="sheet-note">${esc(syncLabel())}</p>
         ${menuItem('sync', 'sync', 'Sync now')}
         ${menuItem('disconnect', 'unlink', 'Disconnect Dropbox')}`
      : `<p class="sheet-note">Sync with the Collections Plus extension on your computer through your own Dropbox.</p>
         ${menuItem('connect', 'cloud', 'Connect Dropbox')}`
    : '';
  openSheet(
    'Collections Plus',
    `<div class="menu-list">
      ${syncPart}
      ${syncPart ? '<div class="menu-sep"></div>' : ''}
      ${settings.readingListEnabled ? menuItem('reading', 'book', 'Reading list') : ''}
      ${menuItem('new', 'plus', 'New collection')}
      ${menuItem('import', 'import', 'Import a backup (JSON)')}
      <a href="https://getcollectionsplus.com/" target="_blank" rel="noopener">${icon('desktop')}<span>Get the desktop extension</span></a>
    </div>`,
    {
      sync: () => syncNow(),
      connect: () => dropbox.beginAuth(),
      disconnect: () => {
        openSheet(
          'Disconnect Dropbox?',
          `<p class="sheet-note">Syncing stops. Your collections stay on this phone, and the copy in Dropbox stays too.</p>
           <div class="sheet-actions"><button class="btn" type="button" data-sheet="cancel">Cancel</button><button class="btn danger" type="submit">Disconnect</button></div>`,
          {
            cancel: () => {},
            submit: async () => {
              await dropbox.disconnect();
              watchRemote();
              updateChip();
              render();
            },
          }
        );
        return true;
      },
      reading: () => go('#/reading'),
      new: () => (newCollectionSheet(), true),
      import: () => els.importFile.click(),
    }
  );
}

async function markOpened(colId, itemId) {
  const it = findCol(colId)?.items.find((x) => x.id === itemId);
  if (it?.unread && settings.markReadOnOpen && settings.readingListEnabled) {
    await edit(() => store.updateItem(colId, itemId, { unread: false }));
  }
}

// ---- Event wiring ----------------------------------------------------------

els.view.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'open') {
    markOpened(el.dataset.col, el.dataset.id); // let the link open normally
    return;
  }
  e.preventDefault();
  if (act === 'item-menu') itemMenu(el.dataset.col, el.dataset.id);
  else if (act === 'folder') {
    toggleFolderLocal(el.dataset.id);
    render();
  } else if (act === 'new-collection') newCollectionSheet();
  else if (act === 'connect') dropbox?.beginAuth();
  else if (act === 'mark-all-read') {
    const n = await edit(() => store.markAllRead());
    toast(`Marked ${plural(n, 'page')} as read`);
  }
});

els.back.addEventListener('click', () => {
  const r = route();
  const c = r.name === 'collection' ? findCol(r.id) : null;
  const parent = c?.parentId && findCol(c.parentId);
  go(parent ? `#/c/${encodeURIComponent(parent.id)}` : '#/');
});
els.menuBtn.addEventListener('click', () => {
  const r = route();
  if (r.name === 'collection') collectionMenu(findCol(r.id));
  else appMenu();
});
els.searchBtn.addEventListener('click', () => {
  const open = els.searchbar.hidden;
  els.searchbar.dataset.open = open ? '1' : '';
  els.searchbar.hidden = !open;
  if (open) els.search.focus();
  else if (query) {
    query = els.search.value = '';
    render();
  }
});
els.search.addEventListener('input', () => {
  query = els.search.value.trim();
  render();
});
els.fab.addEventListener('click', addSheet);
els.chip.addEventListener('click', () => (dropbox?.isConnected() ? syncNow() : appMenu()));
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});
window.addEventListener('scroll', () => document.querySelector('.appbar').classList.toggle('scrolled', scrollY > 4), {
  passive: true,
});

els.importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    await edit(async () => store.importJSON(await file.text(), 'merge'));
    toast('Backup imported');
  } catch (err) {
    toast('Import failed: ' + err.message);
  }
});

// ---- Share target ----------------------------------------------------------
// The manifest registers this page as a share target (GET), so "Share →
// Collections Plus" on Android opens it with ?title=&text=&url=. Many apps put
// the link inside `text`, so we look there too.

function takeShare() {
  const p = new URLSearchParams(location.search);
  if (!p.has('url') && !p.has('text') && !p.has('title')) return null;
  history.replaceState(null, '', location.pathname + location.hash); // don't re-share on reload
  const text = p.get('text') || '';
  const url = normalizeUrl(p.get('url')) || normalizeUrl((text.match(/https?:\/\/\S+/) || [])[0]);
  if (!url) return { error: true };
  let title = (p.get('title') || '').trim();
  if (!title) title = text.replace(url, '').trim();
  return { url, title };
}

function openShare(shared) {
  if (!shared) return;
  if (shared.error) return toast('Nothing to save: the shared item had no web link');
  const ruled = matchRule(data.rules, shared);
  saveLinkSheet({ ...shared, collectionId: findCol(ruled) ? ruled : null, heading: 'Save to Collections Plus' });
}

// ---- Dropbox sync ----------------------------------------------------------
// The user's own Dropbox holds the same sync file the desktop extension uses.
// Every round is pull → merge → push (lib/sync-engine.js), so edits made here
// and on the desktop are combined, never overwritten.

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
let syncState = { kind: 'idle', text: '' };
let stopWatching = null;

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function syncLabel() {
  if (syncState.kind === 'busy') return 'Syncing…';
  if (syncState.kind === 'error') return syncState.text;
  if (syncState.kind === 'offline') return 'Offline. Changes sync when you’re back online.';
  return lastSyncAt ? `Synced ${ago(lastSyncAt)} with Dropbox` : 'Connected to Dropbox';
}

function updateChip() {
  if (!dropbox) return (els.chip.hidden = true);
  els.chip.hidden = false;
  els.chip.className = 'sync-chip';
  if (!dropbox.isConnected()) {
    if (syncState.kind === 'error') {
      els.chip.classList.add('error');
      els.chip.innerHTML = `<span class="dot"></span>${esc(syncState.text)}`;
    } else {
      els.chip.classList.add('cta');
      els.chip.innerHTML = `${icon('cloud')}<span>Sync with your computer</span>`;
    }
    return;
  }
  els.chip.classList.add(
    syncState.kind === 'busy' ? 'busy' : syncState.kind === 'error' ? 'error' : syncState.kind === 'offline' ? '' : 'ok'
  );
  els.chip.innerHTML = `<span class="dot"></span>${esc(syncLabel())}`;
}

/** Run a sync round now (or once more after the current one finishes). */
async function syncNow() {
  if (!dropbox?.isConnected()) return;
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncState = { kind: 'busy' };
  updateChip();
  syncing = (async () => {
    try {
      const { pulled } = await syncOnce(dropbox, store);
      lastSyncAt = Date.now();
      syncState = { kind: 'ok' };
      if (pulled) await render();
    } catch (err) {
      if (err?.code === 'reauth') {
        syncState = { kind: 'error', text: 'Dropbox access ended. Connect again to keep syncing.' };
        render();
      } else if (!navigator.onLine) {
        syncState = { kind: 'offline' };
      } else {
        console.warn('Sync failed', err);
        syncState = { kind: 'error', text: 'Sync failed. Tap to try again.' };
      }
    } finally {
      syncing = null;
      updateChip();
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
  stopWatching = dropbox?.isConnected() ? dropbox.onRemoteChange(syncNow) : null;
}

async function initSync() {
  if (!dropbox) return;
  try {
    // Returning from Dropbox's consent screen: finish sign-in, tidy the URL.
    if (await dropbox.completeAuth(location.href)) {
      history.replaceState(null, '', new URL('./', location.href).pathname);
      toast('Dropbox connected');
    }
  } catch (err) {
    history.replaceState(null, '', new URL('./', location.href).pathname);
    syncState = { kind: 'error', text: 'Dropbox sign-in failed: ' + err.message };
  }
  await dropbox.init();
  updateChip();
  watchRemote();
  if (dropbox.isConnected()) {
    await syncNow();
    render();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow();
});
window.addEventListener('online', () => syncNow());
setInterval(() => syncState.kind === 'ok' && updateChip(), 60000); // keep "x min ago" fresh

// ---- Boot ------------------------------------------------------------------

(async () => {
  // A Dropbox return carries ?code=; a share carries ?url=/text=. Take the
  // share before sync tidies the URL.
  const shared = new URLSearchParams(location.search).has('code') ? null : takeShare();
  try {
    await render();
  } catch (err) {
    els.view.innerHTML = `<div class="empty"><h2>Couldn’t open your library</h2><p>${esc(err.message)}</p></div>`;
    return;
  }
  openShare(shared);
  await initSync();
})();

if ('serviceWorker' in navigator) {
  // Registered after first paint so it never blocks boot. Scope is this folder.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline shell is a progressive enhancement; the app works without it */
    });
  });
}
