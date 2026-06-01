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
  STORAGE_KEY,
} from './lib/store.js';
import { srcToCover } from './lib/image.js';

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

  const col = await ensureActiveCollection();
  if (await findPageByUrl(col.id, tab.url)) return; // already saved — skip

  const meta = tab.id != null ? await captureMeta(tab.id) : {};
  let thumbnail = meta.thumbnail || '';
  if (!thumbnail) thumbnail = await captureScreenshotThumb(tab.windowId);

  await addItem(col.id, {
    type: 'page',
    url: tab.url,
    title: meta.title || tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    thumbnail,
  });
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
    await addItem(collectionId, {
      type: 'image',
      src: info.srcUrl,
      srcPageUrl: info.pageUrl || tab?.url || '',
      alt: '',
    });
    return;
  }

  if (parsed.action === 'save-link') {
    await addItem(collectionId, {
      type: 'page',
      url: info.linkUrl,
      title: info.linkText || info.selectionText || info.linkUrl,
      favIconUrl: tab?.favIconUrl || '',
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

  // save-page (default)
  const meta = tab?.id != null ? await captureMeta(tab.id) : {};
  await addItem(collectionId, {
    type: 'page',
    url: tab?.url || info.pageUrl,
    title: meta.title || tab?.title || tab?.url || info.pageUrl,
    favIconUrl: tab?.favIconUrl || '',
    thumbnail: meta.thumbnail || '',
  });
});

// ---- Messages from the side panel -----------------------------------------
// The panel asks the worker to capture metadata for the active tab when the
// user clicks "Add current page" (scripting must run from the worker).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'captureMeta' && typeof msg.tabId === 'number') {
    captureMeta(msg.tabId).then(sendResponse);
    return true; // async response
  }
  return false;
});
