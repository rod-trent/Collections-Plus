// snapshot.js — extract a readable plain-text snapshot from a page's raw HTML
// so saved content survives the original going offline (link rot).
//
// Deliberately dependency- and DOM-free: a regex/string strip rather than a
// full Readability port. That keeps it runnable in the service worker, the
// side panel, and Node tests alike, with no build step. It's best-effort — good
// enough to preserve an article's words, not to reproduce its layout.

const MAX_SNAPSHOT_CHARS = 100_000;

// Just the named entities common in body copy; numeric refs handled separately.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === '#') {
      const cp =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      try {
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      } catch {
        return m; // out-of-range code point
      }
    }
    const k = code.toLowerCase();
    return k in NAMED_ENTITIES ? NAMED_ENTITIES[k] : m;
  });
}

/** Remove an element and its contents wherever it appears. */
function stripBlocks(html, tag) {
  return html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
}

/** Pull the document title, falling back to the first <h1>. */
function extractTitle(html) {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) return decodeEntities(t[1]).replace(/\s+/g, ' ').trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return '';
}

/**
 * Extract readable text from raw HTML.
 * @param {string} html
 * @param {{maxChars?: number}} [opts]
 * @returns {{title: string, text: string, excerpt: string, chars: number}}
 */
export function extractReadable(html, { maxChars = MAX_SNAPSHOT_CHARS } = {}) {
  const raw = String(html || '');
  const title = extractTitle(raw);

  // Prefer the main article region when the page marks one up — it usually
  // excludes the chrome (nav/sidebars/comments) we'd otherwise have to fight.
  let body = raw;
  const main = raw.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (main && main[1].length > 200) body = main[1];

  // Drop non-content regions wholesale, then any remaining markup.
  for (const tag of [
    'script', 'style', 'noscript', 'svg', 'template',
    'head', 'nav', 'header', 'footer', 'aside', 'form',
  ]) {
    body = stripBlocks(body, tag);
  }
  // Turn block-level boundaries into newlines so paragraphs survive.
  body = body.replace(/<\/(p|div|section|li|h[1-6]|tr|blockquote)>/gi, '\n');
  body = body.replace(/<br\b[^>]*>/gi, '\n');
  body = body.replace(/<[^>]+>/g, ' ');
  body = decodeEntities(body);

  const text = body
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);

  const excerpt = text.replace(/\s+/g, ' ').slice(0, 280);
  return { title, text, excerpt, chars: text.length };
}
