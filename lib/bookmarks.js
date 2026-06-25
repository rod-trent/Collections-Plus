// bookmarks.js — map a Chrome/Edge bookmark tree into Collections Plus
// collections. Pure and dependency-free (unit-tested in tools/test_bookmarks.mjs);
// the panel passes chrome.bookmarks.getTree() output straight in.
//
// Mapping: every folder that directly contains bookmarks becomes a collection
// named after the folder; nested folders recurse into their own collections.
// Only http(s) bookmarks are imported (javascript:, chrome://, place: etc. are
// skipped). Empty and unnamed folders are skipped.

function isHttp(url) {
  return /^https?:\/\//i.test(url || '');
}

/**
 * @param {Array} tree  chrome.bookmarks tree (array of root nodes, or a single root)
 * @returns {{ collections: Array<{title:string, pages:Array<{url:string,title:string}>}>,
 *             stats: {collections:number, pages:number, skipped:number} }}
 */
export function mapBookmarks(tree) {
  const roots = Array.isArray(tree) ? tree : [tree];
  const collections = [];
  const stats = { collections: 0, pages: 0, skipped: 0 };

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const children = Array.isArray(node.children) ? node.children : [];

    const pages = [];
    for (const child of children) {
      if (child && typeof child.url === 'string') {
        if (isHttp(child.url)) pages.push({ url: child.url, title: child.title || child.url });
        else stats.skipped++;
      }
    }
    // A named folder with direct bookmarks becomes a collection. The unnamed
    // top-level root node is skipped (its children are the named roots).
    if (pages.length && (node.title || '').trim()) {
      collections.push({ title: node.title.trim(), pages });
      stats.pages += pages.length;
    }
    for (const child of children) {
      if (child && Array.isArray(child.children)) walk(child);
    }
  };

  for (const root of roots) walk(root);
  stats.collections = collections.length;
  return { collections, stats };
}
