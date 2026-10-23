// pagewatch.js — "watch this page for changes". Pure logic (no network, no
// storage) so it's unit-testable; the service worker (background.js) fetches
// watched pages on an alarm and feeds the HTML through here.
//
// Item fields (page items only):
//   watch          — the user opted this page in (a normal, synced edit).
//   watchHash      — fingerprint of the page's readable text at the last fetch.
//   watchCheckedAt — when we last fetched it.
//   watchLiveHash  — fingerprint of the page's text as rendered in an open tab.
//   watchLiveAt    — when we last read it from a tab.
//   changedAt      — when a check last found the fingerprint had moved.
//   changeSeenAt   — when the user last looked at (opened / dismissed) it.
// A page shows the "changed" dot while changedAt > changeSeenAt. Keeping both
// as timestamps (rather than one boolean) lets a sync merge just take the max
// of each, so a dismissal on one device and a new change on another resolve
// the way you'd expect.
//
// Two sources, never compared with each other: a plain fetch (no cookies) works
// for articles and product pages, but signed-in, script-built pages (X,
// LinkedIn…) return the same empty shell every time. For those, the worker
// reads the rendered text of a tab that has the page open. Each source keeps
// its own baseline, since fetched HTML and rendered text never match.

import { extractReadable } from './snapshot.js';

// Text that changes on every load without the page meaningfully changing:
// relative timestamps ("5 minutes ago", "Updated 2h ago") and copyright years
// rolling over. Stripped before fingerprinting so they don't cry wolf.
const VOLATILE = [
  /\b\d+\s*(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\s+ago\b/gi,
  /\b(?:just now|moments? ago|a (?:few )?(?:seconds?|minutes?) ago|an hour ago)\b/gi,
  /©\s*\d{4}(?:\s*[-–]\s*\d{4})?/g,
];

/** The page text we compare between checks: readable body, normalised. */
export function watchText(html) {
  let text = extractReadable(html, { maxChars: 200_000 }).text;
  for (const re of VOLATILE) text = text.replace(re, ' ');
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Extra noise in rendered feeds: compact relative times ("5m", "2h", "3d")
// that X, LinkedIn and friends put on every post.
const LIVE_VOLATILE = [/(^|\s)\d{1,2}(?:s|m|h|d|w|mo|yr)(?=\s|$)/g];

/** Normalise text read from a live tab (document.body.innerText). */
export function liveText(text) {
  let t = String(text || '').slice(0, 200_000);
  for (const re of [...VOLATILE, ...LIVE_VOLATILE]) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Fingerprint a live tab's text. '' when there's nothing to compare. */
export async function liveFingerprint(text) {
  const t = liveText(text);
  return t ? sha256(t) : '';
}

/** SHA-256 hex of a string (Web Crypto: service worker, panel and Node 18+). */
export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fingerprint a fetched page. Returns '' when there's no text to compare. */
export async function fingerprint(html) {
  const text = watchText(html);
  return text ? sha256(text) : '';
}

const SOURCE_KEYS = {
  fetch: ['watchHash', 'watchCheckedAt'],
  live: ['watchLiveHash', 'watchLiveAt'],
};

/**
 * Fold a fresh fingerprint into an item's watch state. Returns the patch to
 * apply: the first check from a source just records that source's baseline; a
 * later, different fingerprint stamps changedAt. An empty fingerprint (blocked
 * / no text) only stamps the check time — never a false "changed".
 *
 * `seen` means the user is looking at the page right now (it just loaded, or
 * it's the active tab): the baseline moves on but nothing is flagged, and any
 * earlier marker is cleared.
 */
export function watchResult(item, hash, at = Date.now(), { source = 'fetch', seen = false } = {}) {
  const [hashKey, atKey] = SOURCE_KEYS[source] || SOURCE_KEYS.fetch;
  const patch = { [atKey]: at };
  if (!hash) return patch;
  patch[hashKey] = hash;
  if (seen) {
    if (hasUnseenChange(item)) patch.changeSeenAt = at;
  } else if (item[hashKey] && item[hashKey] !== hash) {
    patch.changedAt = at;
  }
  return patch;
}

/** True when a watched page changed since the user last looked at it. */
export function hasUnseenChange(item) {
  return !!(item && item.watch && (item.changedAt || 0) > (item.changeSeenAt || 0));
}

/** How many items in a collection (list) have an unseen change. */
export function countUnseenChanges(collections) {
  let n = 0;
  for (const c of collections) for (const it of c.items || []) if (hasUnseenChange(it)) n++;
  return n;
}
