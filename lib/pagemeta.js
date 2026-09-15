// pagemeta.js — extract a representative preview image URL from a page's raw
// HTML. Pure logic (no `chrome`, no DOM), so it's unit-testable and can run in
// the service worker, which has no DOMParser. Mirrors the priority order used by
// the in-page scraper in background.js (og:image → twitter:image → itemprop
// image → <link rel="image_src">), but works from fetched HTML text rather than
// a live tab — which is what lets us backfill images for imported pages that
// were never opened.

// Match a <meta> tag and pull its content= value, regardless of attribute order
// (content= may come before or after the identifying property/name attribute).
// `[^>]*` stays within the single tag; quotes may be single or double.
function metaContent(html, attr, value) {
  const val = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape for regex
  const idRe = `${attr}\\s*=\\s*["']${val}["']`;
  const contentRe = `content\\s*=\\s*["']([^"']*)["']`;
  // content= either after the identifying attr…
  const after = new RegExp(`<meta\\b[^>]*${idRe}[^>]*${contentRe}`, 'i');
  // …or before it.
  const before = new RegExp(`<meta\\b[^>]*${contentRe}[^>]*${idRe}`, 'i');
  const m = html.match(after) || html.match(before);
  return m ? decodeEntities(m[1].trim()) : '';
}

// <link rel="image_src" href="…"> — an older but still-seen convention.
function linkImageSrc(html) {
  const href = `href\\s*=\\s*["']([^"']*)["']`;
  const rel = `rel\\s*=\\s*["']image_src["']`;
  const after = new RegExp(`<link\\b[^>]*${rel}[^>]*${href}`, 'i');
  const before = new RegExp(`<link\\b[^>]*${href}[^>]*${rel}`, 'i');
  const m = html.match(after) || html.match(before);
  return m ? decodeEntities(m[1].trim()) : '';
}

// Meta values are HTML-escaped (e.g. &amp; in query strings). Decode the small
// set that actually appears in URLs; leave everything else untouched.
function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * Extract a preview image URL from page HTML, resolved to an absolute URL
 * against the page's own URL. Returns '' when no candidate is found or the
 * candidate can't be resolved to an http(s) URL.
 *
 * Only the document <head> matters for these tags, so we scan a bounded prefix
 * of the HTML — this keeps giant pages cheap and avoids matching image meta
 * that some sites emit inside article bodies.
 *
 * @param {string} html   raw HTML text
 * @param {string} pageUrl the URL the HTML was fetched from (for resolving relatives)
 * @returns {string} absolute http(s) image URL, or ''
 */
export function extractImageUrl(html, pageUrl) {
  if (!html || typeof html !== 'string') return '';
  // The head is all we need; cap the scan so a multi-MB body stays cheap.
  const headEnd = html.search(/<\/head>/i);
  const scan = html.slice(0, headEnd >= 0 ? headEnd : Math.min(html.length, 200_000));

  const candidates = [
    metaContent(scan, 'property', 'og:image'),
    metaContent(scan, 'property', 'og:image:url'),
    metaContent(scan, 'name', 'og:image'), // some sites use name= for OG
    metaContent(scan, 'name', 'twitter:image'),
    metaContent(scan, 'name', 'twitter:image:src'),
    metaContent(scan, 'property', 'twitter:image'),
    metaContent(scan, 'itemprop', 'image'),
    linkImageSrc(scan),
  ]
    .map((raw) => (raw ? resolveUrl(raw, pageUrl) : ''))
    .filter(Boolean);

  return pickBestImage(candidates);
}

/**
 * Choose from ordered image candidates, skipping ones that look like a
 * site-wide default rather than a picture of this page.
 *
 * This is the fix for "the cover shows an unrelated image": plenty of sites
 * emit the same `og:image` — their logo or a stock social card — on every page,
 * so the first candidate is often the *site's* image, not the article's. We
 * keep the original priority order but prefer the first candidate that doesn't
 * look generic, falling back to the first one if they all do (better a weak
 * image than none).
 *
 * @param {string[]} candidates absolute image URLs, best-guess order
 * @returns {string} the chosen URL, or ''
 */
export function pickBestImage(candidates) {
  const list = (candidates || []).filter(Boolean);
  if (!list.length) return '';
  return list.find((url) => !isGenericImageUrl(url)) || list[0];
}

// Filename/path markers that almost always mean "site furniture", not content.
// Matched against the path only, so a query string can't trip them.
// Note "banner" and "header" are deliberately absent: plenty of legitimate
// article hero images live at paths like /uploads/header-image.jpg.
// "logos?" also catches a logos/ folder (e.g. /fileuploads/image/logos/rt-logo.png).
const GENERIC_IMAGE_RE =
  /(^|[/\-_.])(logos?|logotype|wordmark|favicon|apple-touch-icon|placeholder|default|fallback|no-?image|sprite|avatar|share|social|og-?image|opengraph|twitter-?card)([/\-_.]|$)/i;

/**
 * True when an image URL looks like a site-wide default (logo, social card,
 * placeholder) rather than an image of the specific page.
 *
 * Deliberately conservative: it only fires on well-known filename markers, and
 * callers still fall back to the candidate when nothing better exists — so a
 * legitimate image that happens to live at /social/ is demoted, never dropped.
 *
 * @param {string} url absolute or relative image URL
 * @returns {boolean}
 */
export function isGenericImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let path = url;
  try {
    path = new URL(url, 'https://x.invalid').pathname;
  } catch {
    /* not parseable — test the raw string */
  }
  if (GENERIC_IMAGE_RE.test(path)) return true;
  // Tiny declared dimensions (e.g. hero-64x64.png) are icons, not previews.
  const dims = path.match(/[-_](\d{2,4})x(\d{2,4})\.[a-z]{3,4}$/i);
  if (dims && Number(dims[1]) < 200 && Number(dims[2]) < 200) return true;
  return false;
}

/** Resolve a possibly-relative image URL against the page; keep only http(s). */
function resolveUrl(src, pageUrl) {
  let out = src;
  try {
    out = new URL(src, pageUrl).href;
  } catch {
    // No base (or malformed) — accept only if it's already absolute http(s).
    if (!/^https?:\/\//i.test(src)) return '';
  }
  // Protocol-relative (//host/img.jpg) resolves via the base above; guard the
  // no-base path too.
  if (/^\/\//.test(out)) out = `https:${out}`;
  return /^https?:\/\//i.test(out) ? out : '';
}
