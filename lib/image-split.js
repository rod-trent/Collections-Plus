// image-split.js — pull inline images out of a sync blob and put them back.
//
// Libraries hold thumbnails, image items and covers as inline `data:` URLs, so
// a whole sync blob can be tens of MB. Hosted sync (lib/hosted-adapter.js) can
// only send a few MB per request, so it swaps each image for a short reference
// `cpimg:<sha256 of the image bytes>`, uploads the images separately (once
// each), and swaps them back after a pull. Merge, the store and the sync-file
// format never see a reference.
//
// Pure helpers: no network, no storage. Works in browsers and Node 18+.

export const REF_PREFIX = 'cpimg:';
const REF_RE = /^cpimg:[0-9a-f]{64}$/;
const DATA_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i;

// Tiny images aren't worth a request of their own.
export const MIN_SPLIT_LENGTH = 512;

export const isImageRef = (s) => typeof s === 'string' && REF_RE.test(s);
export const refHash = (ref) => ref.slice(REF_PREFIX.length);
export const toRef = (hash) => REF_PREFIX + hash;

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const b of d) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Split a base64 `data:` URL into { mime, bytes }, or null if it isn't one we
 * can rebuild byte-for-byte (so a round trip never changes the data).
 */
export function parseDataUrl(s) {
  if (typeof s !== 'string' || !s.startsWith('data:')) return null;
  const m = DATA_RE.exec(s);
  if (!m || m[2].length % 4) return null;
  let bytes;
  try {
    bytes = base64ToBytes(m[2]);
  } catch {
    return null;
  }
  if (bytesToBase64(bytes) !== m[2]) return null; // non-canonical padding
  return { mime: m[1].toLowerCase(), bytes };
}

export const toDataUrl = (mime, bytes) => `data:${mime};base64,${bytesToBase64(bytes)}`;

/** Visit every string in a JSON tree; `fn` may return a replacement. */
function mapStrings(node, fn) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') node[i] = fn(node[i]);
      else if (node[i] && typeof node[i] === 'object') mapStrings(node[i], fn);
    }
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') node[k] = fn(v);
      else if (v && typeof v === 'object') mapStrings(v, fn);
    }
  }
}

/** Every image reference in a (split) tree, as a Set of hashes. */
export function collectRefs(tree) {
  const refs = new Set();
  mapStrings(tree, (s) => {
    if (isImageRef(s)) refs.add(refHash(s));
    return s;
  });
  return refs;
}

/**
 * Replace each large base64 `data:` URL in `tree` (mutated in place) with a
 * reference. Returns { refs, images }: every hash the tree now references, and
 * the images found here as Map<hash, dataUrl> (parseDataUrl() gives the bytes).
 *
 *   hashOf  optional Map<dataUrl, hash> cache, so unchanged images aren't
 *           hashed again on every sync
 */
export async function splitImages(tree, { hashOf = new Map(), minLength = MIN_SPLIT_LENGTH } = {}) {
  const found = new Set();
  mapStrings(tree, (s) => {
    if (s.length >= minLength && s.startsWith('data:')) found.add(s);
    return s;
  });
  const images = new Map();
  const byUrl = new Map();
  for (const url of found) {
    const known = hashOf.get(url);
    let parsed = null;
    if (!known) {
      parsed = parseDataUrl(url);
      if (!parsed) continue; // leave odd ones inline
    }
    const hash = known || (await sha256Hex(parsed.bytes));
    hashOf.set(url, hash);
    byUrl.set(url, hash);
    images.set(hash, url);
  }
  mapStrings(tree, (s) => (byUrl.has(s) ? toRef(byUrl.get(s)) : s));
  return { refs: collectRefs(tree), images };
}

/**
 * Put images back: each reference becomes `lookup(hash)` (a data URL). An
 * image that can't be found becomes '' so the app shows no picture rather
 * than a broken one. Mutates and returns `tree`.
 */
export function rehydrateImages(tree, lookup) {
  mapStrings(tree, (s) => (isImageRef(s) ? lookup(refHash(s)) || '' : s));
  return tree;
}
