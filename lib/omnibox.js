// omnibox.js — find saved items for the address-bar keyword search ("col …").
// Pure and dependency-free (unit-tested in tools/test_omnibox.mjs); the service
// worker turns these into omnibox suggestions and opens the chosen URL.

function entryUrl(it) {
  if (it.type === 'image') return it.srcPageUrl || it.src || '';
  if (it.type === 'note') return '';
  return it.url || ''; // page, highlight
}

function entryTitle(it, url) {
  if (it.type === 'image') return it.alt || 'Image';
  if (it.type === 'highlight') return (it.text || '').replace(/\s+/g, ' ').trim().slice(0, 80) || url;
  return it.title || url;
}

/**
 * Find saved items whose title/url/collection contain every search term.
 * Only items with an http(s) URL are returned (notes are skipped).
 * @returns {Array<{url:string, title:string, collection:string}>}
 */
export function searchEntries(collections, query, { max = 6 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const c of collections || []) {
    for (const it of c.items || []) {
      const url = entryUrl(it);
      if (!/^https?:\/\//i.test(url)) continue;
      const title = entryTitle(it, url);
      const hay = `${title} ${url} ${c.title || ''}`.toLowerCase();
      if (terms.every((t) => hay.includes(t))) {
        out.push({ url, title: title || url, collection: c.title || 'Untitled' });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}
