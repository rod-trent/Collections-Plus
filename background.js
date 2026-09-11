// background.js — service worker.
// - Opens the side panel when the toolbar icon is clicked.
// - Maintains right-click context menus (with a per-collection submenu) for
//   saving pages, links, images and selected text into a collection.

import {
  getData,
  addItem,
  createCollection,
  ensureActiveCollection,
  findPageByUrl,
  getSettings,
  setSettings,
  cacheItemImage,
  applyLinkResults,
  applyImageResults,
  STORAGE_KEY,
} from './lib/store.js';
import { srcToCover } from './lib/image.js';
import { classifyStatus } from './lib/linkcheck.js';
import { extractImageUrl } from './lib/pagemeta.js';
import { matchRule } from './lib/rules.js';
import { searchEntries } from './lib/omnibox.js';

// If offline image caching is on, inline the freshly-saved item's image.
async function maybeCache(out) {
  if (!out?.item || !out?.collection) return;
  try {
    if ((await getSettings()).cacheImages) await cacheItemImage(out.collection.id, out.item.id);
  } catch {
    /* best effort */
  }
}

// ---- How the toolbar icon opens the UI -------------------------------------
// Two modes (Settings ▸ Tools ▸ "Open in"):
//   'sidepanel' — dock panel.html to the browser window. The default.
//   'popup'     — float panel.html in its own small window. No dock/undock
//                 animation, and Esc closes it, which matters most in
//                 fullscreen where the side panel's slide-in is disruptive.

// Fallback size for a pop-up that has never been opened/moved before.
const POPUP_SIZE = { width: 460, height: 780 };

/** Point the action at the side panel or leave the click to us for the pop-up. */
async function applyOpenMode(mode) {
  try {
    // With openPanelOnActionClick on, Chrome opens the panel itself and
    // action.onClicked never fires — which is exactly what we want in side
    // panel mode, and exactly what we have to turn off for the pop-up.
    await chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: mode !== 'popup' });
  } catch (err) {
    console.warn('setPanelBehavior failed', err);
  }
}

getSettings()
  .then((s) => applyOpenMode(s.openMode))
  .catch(() => applyOpenMode('sidepanel'));

/**
 * The last ordinary browser window you focused.
 *
 * The pop-up is a window in its own right and it's the focused one while you're
 * using it, so "the current window" would be the pop-up itself. Everything that
 * asks "what page am I looking at?" goes through here instead.
 */
async function hostWindowId() {
  const { hostWindowId: remembered } = await chrome.storage.session.get('hostWindowId');
  if (typeof remembered === 'number') {
    try {
      await chrome.windows.get(remembered);
      return remembered;
    } catch {
      /* that window has since been closed — fall through to a fresh guess */
    }
  }
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const win = wins.find((w) => w.focused) || wins[wins.length - 1];
  return win ? win.id : null;
}

chrome.windows?.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type === 'normal') await chrome.storage.session.set({ hostWindowId: windowId });
  } catch {
    /* the window went away between the event and the lookup */
  }
});

/** Focus the pop-up if it's still open, otherwise create it where you left it. */
async function openPopupWindow() {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  if (typeof popupWindowId === 'number') {
    try {
      await chrome.windows.update(popupWindowId, { focused: true, drawAttention: true });
      return popupWindowId;
    } catch {
      /* it was closed since we last looked — open a new one below */
    }
  }
  const { popupBounds } = await getSettings();
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('sidepanel/panel.html?window=popup'),
    type: 'popup',
    focused: true,
    ...POPUP_SIZE,
    ...(popupBounds || {}),
  });
  await chrome.storage.session.set({ popupWindowId: win.id });
  return win.id;
}

chrome.action?.onClicked.addListener(async () => {
  // Only reached in pop-up mode; see applyOpenMode.
  try {
    if ((await getSettings()).openMode === 'popup') await openPopupWindow();
  } catch (err) {
    console.warn('opening the pop-up window failed', err);
  }
});

// Remember where you dragged/resized the pop-up so it comes back the same size.
// Some platforms fire this repeatedly through a drag, so settle before writing —
// setSettings is a read-modify-write of the whole settings blob.
let boundsTimer = null;
chrome.windows?.onBoundsChanged?.addListener(async (win) => {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  if (win.id !== popupWindowId) return;
  const bounds = { left: win.left, top: win.top, width: win.width, height: win.height };
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => setSettings({ popupBounds: bounds }), 400);
});

chrome.windows?.onRemoved.addListener(async (windowId) => {
  const { popupWindowId } = await chrome.storage.session.get('popupWindowId');
  if (windowId === popupWindowId) await chrome.storage.session.remove('popupWindowId');
});

/**
 * Switch modes and move the UI over there now, rather than on the next toolbar
 * click. Returns which surface we managed to open so the caller knows whether
 * it's safe to close itself.
 */
async function switchOpenMode(mode) {
  await applyOpenMode(mode);
  if (mode === 'popup') {
    await openPopupWindow();
    return { opened: 'popup' };
  }
  const windowId = await hostWindowId();
  try {
    if (windowId != null) {
      await chrome.sidePanel.open({ windowId });
      return { opened: 'sidepanel' };
    }
  } catch {
    // sidePanel.open() wants a user gesture, and a click inside the pop-up
    // doesn't always count as one for another window. The toolbar icon works.
  }
  return { opened: null };
}

// ---- Context menus ---------------------------------------------------------

// Parent menu items keyed by the context they apply to.
const PARENTS = [
  { id: 'save-page', title: 'Save page to Collections Plus', contexts: ['page'] },
  { id: 'save-link', title: 'Save link to Collections Plus', contexts: ['link'] },
  { id: 'save-image', title: 'Save image to Collections Plus', contexts: ['image'] },
  { id: 'save-note', title: 'Save selection as note', contexts: ['selection'] },
  { id: 'save-highlight', title: 'Save selection as highlight', contexts: ['selection'] },
];

const NEW_SUFFIX = '::new'; // child id suffix for "New collection…"

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();
  const { collections } = await getData();

  for (const parent of PARENTS) {
    chrome.contextMenus.create({
      id: parent.id,
      title: parent.title,
      contexts: parent.contexts,
    });

    // One child per existing collection.
    for (const c of collections) {
      chrome.contextMenus.create({
        id: `${parent.id}::${c.id}`,
        parentId: parent.id,
        title: c.title || 'Untitled',
        contexts: parent.contexts,
      });
    }

    if (collections.length > 0) {
      chrome.contextMenus.create({
        id: `${parent.id}::sep`,
        parentId: parent.id,
        type: 'separator',
        contexts: parent.contexts,
      });
    }

    // Always offer a "new collection" target.
    chrome.contextMenus.create({
      id: `${parent.id}${NEW_SUFFIX}`,
      parentId: parent.id,
      title: '＋ New collection…',
      contexts: parent.contexts,
    });
  }
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);

// Keep menus in sync whenever the data changes (e.g. from the panel).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) rebuildMenus();
});

// ---- Metadata capture ------------------------------------------------------

// Runs in the page to extract a representative thumbnail + title.
//
// NOTE: this function is injected into the page, so it can't import anything —
// the "is this a site-wide default image?" rules below are a hand-kept copy of
// isGenericImageUrl() in lib/pagemeta.js. Change both together.
function scrapeMeta() {
  const pick = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
  const abs = (u) => {
    // Guard the empty case: new URL('', location.href) resolves to the page's
    // own address, which would otherwise sail through as a valid candidate.
    if (!u) return '';
    try {
      return new URL(u, location.href).href;
    } catch {
      return '';
    }
  };

  const GENERIC =
    /(^|[/\-_.])(logo|logotype|wordmark|favicon|apple-touch-icon|placeholder|default|fallback|no-?image|sprite|avatar|share|social|og-?image|opengraph|twitter-?card)([/\-_.]|$)/i;
  const isGeneric = (u) => {
    let path = u;
    try {
      path = new URL(u, location.href).pathname;
    } catch {
      /* not parseable — test the raw string */
    }
    if (GENERIC.test(path)) return true;
    const d = path.match(/[-_](\d{2,4})x(\d{2,4})[.][a-z]{3,4}$/i);
    return !!(d && Number(d[1]) < 200 && Number(d[2]) < 200);
  };

  const metaCandidates = [
    pick('meta[property="og:image"]', 'content'),
    pick('meta[name="twitter:image"]', 'content'),
    pick('meta[itemprop="image"]', 'content'),
    pick('link[rel="image_src"]', 'href'),
  ]
    .map(abs)
    .filter(Boolean);

  // The largest image actually rendered in the article — the fallback for when
  // every meta tag points at site furniture (a logo or a stock social card),
  // which is the usual cause of "my collection cover shows an unrelated image".
  let contentImage = '';
  let bestArea = 0;
  const scope = document.querySelector('article, main') || document.body;
  for (const img of scope ? scope.querySelectorAll('img') : []) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 200 || h < 200) continue; // icons, spacers, sprites
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:') || isGeneric(src)) continue;
    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      contentImage = abs(src);
    }
  }

  const thumbnail =
    metaCandidates.find((u) => !isGeneric(u)) || // a picture of this page
    contentImage || // …or the biggest real image on it
    metaCandidates[0] || // …or whatever we had (better weak than nothing)
    '';

  return { thumbnail, title: document.title || location.href };
}

async function captureMeta(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeMeta,
    });
    return res?.result || {};
  } catch {
    // Restricted pages (edge://, store pages, etc.) can't be scripted.
    return {};
  }
}

// Fallback thumbnail: a downscaled screenshot of the active (visible) tab.
async function captureScreenshotThumb(windowId) {
  try {
    const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 });
    return shot ? await srcToCover(shot, 512) : '';
  } catch {
    return '';
  }
}

// ---- Keyboard command: save the current page -------------------------------

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'save-current-page') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) return;

  const meta = tab.id != null ? await captureMeta(tab.id) : {};
  const title = meta.title || tab.title || tab.url;

  // Auto-file rules can route the quick-save into a specific collection by
  // domain/URL/title; otherwise fall back to the active collection.
  const data = await getData();
  const ruled = matchRule(data.rules, { url: tab.url, title });
  const col =
    (ruled && data.collections.find((c) => c.id === ruled)) || (await ensureActiveCollection());
  if (await findPageByUrl(col.id, tab.url)) return; // already saved — skip

  let thumbnail = meta.thumbnail || '';
  if (!thumbnail) thumbnail = await captureScreenshotThumb(tab.windowId);

  const out = await addItem(col.id, {
    type: 'page',
    url: tab.url,
    title,
    favIconUrl: tab.favIconUrl || '',
    thumbnail,
    unread: (await getSettings()).readingListEnabled,
  });
  await maybeCache(out);
});

// ---- Click handling --------------------------------------------------------

function parseMenuId(menuItemId) {
  const id = String(menuItemId);
  for (const parent of PARENTS) {
    if (id === `${parent.id}${NEW_SUFFIX}`) {
      return { action: parent.id, target: 'new' };
    }
    if (id.startsWith(`${parent.id}::`)) {
      const target = id.slice(`${parent.id}::`.length);
      if (target === 'sep') return null;
      return { action: parent.id, target };
    }
  }
  return null;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const parsed = parseMenuId(info.menuItemId);
  if (!parsed) return;

  // Resolve the destination collection id (creating one if "new").
  let collectionId = parsed.target;
  if (parsed.target === 'new') {
    const created = await createCollection('New collection');
    collectionId = created.id;
  }

  if (parsed.action === 'save-image') {
    const out = await addItem(collectionId, {
      type: 'image',
      src: info.srcUrl,
      srcPageUrl: info.pageUrl || tab?.url || '',
      alt: '',
    });
    await maybeCache(out);
    return;
  }

  if (parsed.action === 'save-link') {
    await addItem(collectionId, {
      type: 'page',
      url: info.linkUrl,
      title: info.linkText || info.selectionText || info.linkUrl,
      favIconUrl: tab?.favIconUrl || '',
      unread: (await getSettings()).readingListEnabled,
    });
    return;
  }

  if (parsed.action === 'save-note') {
    await addItem(collectionId, {
      type: 'note',
      text: info.selectionText || '',
    });
    return;
  }

  if (parsed.action === 'save-highlight') {
    // A highlight keeps the quote anchored to its source page + title.
    const meta = tab?.id != null ? await captureMeta(tab.id) : {};
    await addItem(collectionId, {
      type: 'highlight',
      text: info.selectionText || '',
      url: info.pageUrl || tab?.url || '',
      title: meta.title || tab?.title || tab?.url || info.pageUrl || '',
    });
    return;
  }

  // save-page (default)
  const meta = tab?.id != null ? await captureMeta(tab.id) : {};
  const out = await addItem(collectionId, {
    type: 'page',
    url: tab?.url || info.pageUrl,
    title: meta.title || tab?.title || tab?.url || info.pageUrl,
    favIconUrl: tab?.favIconUrl || '',
    thumbnail: meta.thumbnail || '',
    unread: (await getSettings()).readingListEnabled,
  });
  await maybeCache(out);
});

// ---- Link-rot checking -----------------------------------------------------
// Probe saved page URLs to catch link rot. The verdict logic lives in
// lib/linkcheck.js (pure, tested); here we just do the network I/O. Our
// <all_urls> host permission lets the worker fetch cross-origin without CORS.

const LINK_TIMEOUT_MS = 8000;
const LINK_CONCURRENCY = 5;

// Probe one URL → 'ok' | 'dead' | 'unknown'.
async function probeUrl(url) {
  if (!/^https?:/i.test(url || '')) return 'unknown';
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LINK_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        cache: 'no-store',
      });
      return { status: res.status };
    } catch (e) {
      return e?.name === 'AbortError' ? { timedOut: true } : { networkError: true };
    } finally {
      clearTimeout(timer);
    }
  };
  let outcome = await attempt('HEAD');
  // Some servers reject or mishandle HEAD (405) — confirm with a GET before
  // trusting a network error or a method-not-allowed.
  if (outcome.status === 405 || outcome.networkError) {
    const get = await attempt('GET');
    if (!get.networkError) outcome = get;
  }
  return classifyStatus(outcome);
}

// Collect probe targets (http(s) page items), optionally scoped to one
// collection or to entries not checked since `staleBefore`.
function collectTargets(data, { collectionId, staleBefore } = {}) {
  const cols = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  const targets = [];
  for (const c of cols) {
    for (const it of c.items) {
      if (it.type !== 'page' || !/^https?:/i.test(it.url || '')) continue;
      if (staleBefore != null && it.linkCheckedAt && it.linkCheckedAt >= staleBefore) continue;
      targets.push({ collectionId: c.id, itemId: it.id, url: it.url, at: it.linkCheckedAt || 0 });
    }
  }
  return targets;
}

// Probe a list of targets with bounded concurrency; persist in one batch.
async function probeTargets(targets) {
  const results = new Array(targets.length);
  let idx = 0;
  let dead = 0;
  const worker = async () => {
    for (let i = idx++; i < targets.length; i = idx++) {
      const t = targets[i];
      const status = await probeUrl(t.url);
      if (status === 'dead') dead++;
      results[i] = {
        collectionId: t.collectionId,
        itemId: t.itemId,
        // Only record a definite verdict; 'unknown' just stamps the time.
        linkStatus: status === 'ok' || status === 'dead' ? status : undefined,
        linkCheckedAt: Date.now(),
      };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LINK_CONCURRENCY, targets.length) }, worker)
  );
  await applyLinkResults(results.filter(Boolean));
  return { checked: targets.length, dead };
}

// On-demand check (from the panel): all collections or just one.
async function checkLinks(collectionId) {
  const data = await getData();
  return probeTargets(collectTargets(data, { collectionId }));
}

// ---- Image backfill (fetch missing preview images) -------------------------
// Imported pages (e.g. from a CSV) have no thumbnail, and we can't scrape a
// live tab for a URL that isn't open. Instead we fetch the page HTML directly
// (host access covers this), pull an og:image/twitter:image URL out of it, then
// downscale that image into a stored data URL — the same size/format the normal
// save path produces. Pages with no such image are left untouched (they keep
// their favicon fallback).

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const IMAGE_FETCH_CONCURRENCY = 4;
const MAX_HTML_BYTES = 1_500_000; // the <head> comes early; don't buffer more

// Read a response body as text but stop early — once we've seen the whole
// <head> (all our meta tags live there) or hit the byte cap. Keeps a multi-MB
// page from being fully buffered just to read a few meta tags.
async function readHtmlHead(res, maxBytes) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const decoder = new TextDecoder();
  let out = '';
  let seen = 0;
  try {
    while (seen < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(out)) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* stream already closed */
    }
  }
  return out;
}

// Fetch a page's HTML (bounded) and return an absolute preview-image URL, or ''.
async function fetchPageImageUrl(pageUrl) {
  if (!/^https?:/i.test(pageUrl || '')) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      redirect: 'follow',
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) return '';
    const html = await readHtmlHead(res, MAX_HTML_BYTES);
    return extractImageUrl(html, res.url || pageUrl);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// One page: fetch its image URL, then downscale to a stored data URL. '' on miss.
async function fetchPageThumbnail(pageUrl) {
  const imgUrl = await fetchPageImageUrl(pageUrl);
  if (!imgUrl) return '';
  try {
    return await srcToCover(imgUrl, 512);
  } catch {
    return ''; // image URL was found but couldn't be fetched/decoded
  }
}

// Collect page items that need an image, optionally scoped to one collection or
// a single item. `replace` includes items that already have a thumbnail.
function collectImageTargets(data, { collectionId, itemId, replace } = {}) {
  const cols = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  const targets = [];
  for (const c of cols) {
    for (const it of c.items) {
      if (itemId && it.id !== itemId) continue;
      if (it.type !== 'page' || !/^https?:/i.test(it.url || '')) continue;
      if (!replace && it.thumbnail) continue; // only fill blanks unless replacing
      targets.push({ collectionId: c.id, itemId: it.id, url: it.url });
    }
  }
  return targets;
}

// Fetch thumbnails for a list of targets with bounded concurrency; persist in a
// single batch write. Returns how many targets were scanned and how many got an
// image.
async function fetchImageTargets(targets) {
  const results = new Array(targets.length);
  let idx = 0;
  let found = 0;
  const worker = async () => {
    for (let i = idx++; i < targets.length; i = idx++) {
      const thumbnail = await fetchPageThumbnail(targets[i].url);
      if (thumbnail) {
        found++;
        results[i] = {
          collectionId: targets[i].collectionId,
          itemId: targets[i].itemId,
          thumbnail,
        };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, targets.length) }, worker)
  );
  await applyImageResults(results.filter(Boolean));
  return { total: targets.length, found };
}

// On-demand from the panel: all collections, one collection, or a single item.
// A single-item request is an explicit "refresh this one", so it always
// replaces; bulk requests honour the replaceExistingImages setting.
async function fetchImages({ collectionId, itemId } = {}) {
  const replace = itemId ? true : (await getSettings()).replaceExistingImages;
  const data = await getData();
  const targets = collectImageTargets(data, { collectionId, itemId, replace });
  return fetchImageTargets(targets);
}

// ---- Periodic auto-check (opt-in) ------------------------------------------

const LINK_ALARM = 'linkcheck';
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // re-probe at most weekly
const MAX_PER_RUN = 40; // keep each wake-up cheap

function ensureLinkAlarm() {
  chrome.alarms?.get(LINK_ALARM, (a) => {
    if (!a) chrome.alarms.create(LINK_ALARM, { periodInMinutes: 6 * 60 });
  });
}
chrome.runtime.onInstalled.addListener(ensureLinkAlarm);
chrome.runtime.onStartup.addListener(ensureLinkAlarm);

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== LINK_ALARM) return;
  if (!(await getSettings()).autoCheckLinks) return;
  const data = await getData();
  const stale = collectTargets(data, { staleBefore: Date.now() - RECHECK_AFTER_MS });
  stale.sort((a, b) => a.at - b.at); // oldest (or never-checked) first
  if (stale.length) await probeTargets(stale.slice(0, MAX_PER_RUN));
});

// ---- Omnibox: address-bar search ("col <query>") ---------------------------

function escapeXml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

chrome.omnibox?.setDefaultSuggestion({
  description: 'Search your collections — type to find a saved page',
});

chrome.omnibox?.onInputChanged.addListener(async (text, suggest) => {
  const data = await getData();
  suggest(
    searchEntries(data.collections, text).map((e) => ({
      content: e.url,
      description: `${escapeXml(e.title)} <dim>— ${escapeXml(e.collection)}</dim>`,
    }))
  );
});

chrome.omnibox?.onInputEntered.addListener(async (text, disposition) => {
  let url = text;
  if (!/^https?:\/\//i.test(url)) {
    // The user hit Enter on free text rather than picking a suggestion — open
    // the best match.
    const data = await getData();
    const [first] = searchEntries(data.collections, text, { max: 1 });
    if (!first) return;
    url = first.url;
  }
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});

// ---- Messages from the side panel -----------------------------------------
// The panel asks the worker to capture metadata for the active tab when the
// user clicks "Add current page" (scripting must run from the worker), and to
// run link checks (network I/O belongs in the worker).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'captureMeta' && typeof msg.tabId === 'number') {
    captureMeta(msg.tabId).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'checkLinks') {
    checkLinks(msg.collectionId).then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
  if (msg?.type === 'hostWindowId') {
    hostWindowId()
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true; // async response
  }
  if (msg?.type === 'setOpenMode') {
    switchOpenMode(msg.mode)
      .then(sendResponse)
      .catch(() => sendResponse({ opened: null }));
    return true; // async response
  }
  if (msg?.type === 'fetchImages') {
    fetchImages({ collectionId: msg.collectionId, itemId: msg.itemId })
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true; // async response
  }
  return false;
});
