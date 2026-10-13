// searchrank.js — order search results. Pure and dependency-free (unit-tested
// in tools/test_searchrank.mjs); used by the extension's list search and the
// mobile app's search so both rank the same way.
//
// Search itself is a plain "contains" match on the lower-cased query (see the
// callers). Ranking only decides the order of what matched: a match in a title
// beats one in a tag, which beats one in a link, which beats one in a note;
// and a title that starts with the query beats one that merely contains it.

/** How well `text` matches `q` (both lower-cased): 0 = no match, up to 100. */
export function textScore(text, q) {
  const t = String(text || '').toLowerCase();
  if (!q || !t.includes(q)) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  // Starts a word somewhere ("trip to japan" for "jap").
  const i = t.indexOf(q);
  for (let at = i; at !== -1; at = t.indexOf(q, at + 1)) {
    if (at === 0 || /[^a-z0-9]/.test(t[at - 1])) return 75;
  }
  return 60;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Best-match score for a saved item (page, note, highlight, image). */
export function scoreItem(it, q) {
  const name = it.type === 'note' || it.type === 'highlight' ? it.text : it.type === 'image' ? it.alt : it.title;
  const fields = it.fields && typeof it.fields === 'object' ? Object.values(it.fields).join(' ') : '';
  return Math.max(
    textScore(name, q),
    textScore(it.title, q) * 0.9, // a highlight's source title
    textScore(hostOf(it.url || it.srcPageUrl), q) * 0.6,
    textScore(it.url || it.srcPageUrl, q) * 0.4,
    textScore(it.note, q) * 0.5,
    textScore(fields, q) * 0.5
  );
}

/**
 * Best-match score for a collection: its title, then its tags; a small bonus
 * for how many of its items matched breaks ties between similar titles.
 */
export function scoreCollection(c, q, matchedItems = 0) {
  const tag = Math.max(0, ...(c.tags || []).map((t) => textScore(t, q) * 0.85));
  const base = Math.max(textScore(c.title, q), tag);
  // A collection matched only through its items still ranks, below title hits.
  const viaItems = matchedItems ? 40 : 0;
  return Math.max(base, viaItems) + Math.min(10, matchedItems);
}

const byTitle = (get) => (a, b) =>
  get(a).localeCompare(get(b), undefined, { sensitivity: 'base', numeric: true });

function itemTitle(it) {
  if (it.type === 'note' || it.type === 'highlight') return (it.text || '').trim();
  if (it.type === 'image') return it.alt || '';
  return it.title || it.url || '';
}

/**
 * Order matching items. `results` is [{ it, c }] in collection order.
 * mode: 'best' | 'newest' | 'oldest' | 'title' | 'collection' (as given).
 * Always returns a new array.
 */
export function sortItemResults(results, q, mode = 'best') {
  const list = [...(results || [])];
  if (mode === 'collection') return list;
  if (mode === 'newest') return list.sort((a, b) => (b.it.addedAt || 0) - (a.it.addedAt || 0));
  if (mode === 'oldest') return list.sort((a, b) => (a.it.addedAt || 0) - (b.it.addedAt || 0));
  if (mode === 'title') return list.sort(byTitle((r) => itemTitle(r.it)));
  // best: highest score first; newest breaks ties.
  const scored = list.map((r) => ({ r, s: scoreItem(r.it, q) }));
  scored.sort((a, b) => b.s - a.s || (b.r.it.addedAt || 0) - (a.r.it.addedAt || 0));
  return scored.map((x) => x.r);
}

/**
 * Order matching collections. `matchCount(c)` says how many of a collection's
 * items matched. mode: 'best' | 'newest' | 'oldest' | 'title' | anything else
 * (as given). Always returns a new array.
 */
export function sortCollectionResults(cols, q, mode = 'best', matchCount = () => 0) {
  const list = [...(cols || [])];
  if (mode === 'newest') return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (mode === 'oldest') return list.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  if (mode === 'title') return list.sort(byTitle((c) => c.title || ''));
  if (mode !== 'best') return list;
  const scored = list.map((c) => ({ c, s: scoreCollection(c, q, matchCount(c)) }));
  scored.sort((a, b) => b.s - a.s || (b.c.updatedAt || 0) - (a.c.updatedAt || 0));
  return scored.map((x) => x.c);
}
