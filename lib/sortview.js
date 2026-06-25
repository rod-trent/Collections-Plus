// sortview.js — display-only sorting for the collection list and item lists.
// Pure and dependency-free (unit-tested in tools/test_sortview.mjs). These
// never mutate the stored order: they return a new array (or the original for
// 'manual'), so the user's drag order is preserved underneath.

/** Best display title for an item, used by title sort. */
function itemTitle(it) {
  if (it.type === 'note') return (it.text || '').trim();
  if (it.type === 'highlight') return (it.text || '').trim();
  if (it.type === 'image') return it.alt || '';
  return it.title || it.url || '';
}

const byTitle = (get) => (a, b) =>
  get(a).localeCompare(get(b), undefined, { sensitivity: 'base', numeric: true });

/** Sort items for display. 'manual' returns the input unchanged. */
export function sortItems(items, mode) {
  const list = Array.isArray(items) ? items : [];
  if (mode === 'newest') return [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  if (mode === 'oldest') return [...list].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  if (mode === 'title') return [...list].sort(byTitle(itemTitle));
  return list;
}

/** Sort collections for display. 'manual' returns the input unchanged. */
export function sortCollections(collections, mode) {
  const list = Array.isArray(collections) ? collections : [];
  if (mode === 'newest') return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (mode === 'oldest') return [...list].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  if (mode === 'title') return [...list].sort(byTitle((c) => c.title || ''));
  return list;
}
