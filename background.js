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
  cacheItemImage,
  applyLinkResults,
  STORAGE_KEY,
} from './lib/store.js';
import { srcToCover } from './lib/image.js';
import { classifyStatus } from './lib/linkcheck.js';
import { matchRule } from './lib/rules.js';

// If offline image caching is on, inline the freshly-saved item's image.
async function maybeCache(out) {
  if (!out?.item || !out?.collection) return;
  try {
    if ((await getSettings()).cacheImages) await cacheItemImage(out.collection.id, out.item.id);
  } catch {
    /* best effort */
  }
}

// Open the side panel on action click (Edge + Chrome).
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('setPanelBehavior failed', err));

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
function scrapeMeta() {
  const pick = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
  let thumbnail =
    pick('meta[property="og:image"]', 'content') ||
    pick('meta[name="twitter:image"]', 'content') ||
    pick('meta[itemprop="image"]', 'content');
  // Resolve relative URLs against the page.
  if (thumbnail) {
    try {
      thumbnail = new URL(thumbnail, location.href).href;
    } catch {
      /* leave as-is */
    }
  }
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
    unread: true,
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
      unread: true,
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
    unread: true,
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
  return false;
});
