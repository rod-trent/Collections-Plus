// semantic.js — build a compact catalog of saved items and parse the model's
// ranked results for AI ("semantic") search. Pure and dependency-free
// (unit-tested in tools/test_semantic.mjs); the panel feeds the request to
// ai.chat() and maps the returned entry numbers back to items.

const MAX_ITEMS = 250;
const MAX_CHARS_PER_ITEM = 240;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function snippet(it) {
  if (it.type === 'note') return (it.text || '').replace(/\s+/g, ' ').trim();
  if (it.type === 'image') return it.alt || '';
  const fields =
    it.fields && typeof it.fields === 'object'
      ? Object.entries(it.fields).map(([k, v]) => `${k}: ${v}`).join(', ')
      : '';
  return [it.note, fields].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
}

function titleOf(it) {
  if (it.type === 'note') return (it.text || 'Note').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (it.type === 'image') return it.alt || 'Image';
  return it.title || it.url || 'Untitled';
}

/**
 * Flatten collections into a numbered catalog for the model.
 * @returns {{ entries: Array<{n:number, collectionId:string, itemId:string}>, text: string, truncated: boolean }}
 *   `entries[k].n` is the 1-based number the model refers to (k+1).
 */
export function buildCatalog(collections = [], { maxItems = MAX_ITEMS, maxCharsPerItem = MAX_CHARS_PER_ITEM } = {}) {
  const entries = [];
  const lines = [];
  let truncated = false;
  for (const c of collections) {
    for (const it of c.items || []) {
      if (entries.length >= maxItems) {
        truncated = true;
        break;
      }
      const n = entries.length + 1;
      entries.push({ n, collectionId: c.id, itemId: it.id });
      const host = it.type === 'note' ? '' : hostOf(it.url || it.srcPageUrl || it.src || '');
      const desc = [titleOf(it), host, snippet(it)]
        .filter(Boolean)
        .join(' — ')
        .slice(0, maxCharsPerItem);
      lines.push(`[${n}] (in "${c.title || 'Untitled'}") ${desc}`);
    }
    if (truncated) break;
  }
  return { entries, text: lines.join('\n'), truncated };
}

/** Build the chat request for a semantic search over a catalog. */
export function searchRequest(query, catalogText, { max = 15 } = {}) {
  return {
    system:
      'You are a semantic search engine over a user\'s saved items (web pages, ' +
      'images, notes). Each item is numbered like "[N] (in "Collection") ...". ' +
      'Find items relevant to the query by MEANING, not just keyword overlap. ' +
      `Reply with ONLY a JSON array, most relevant first, of at most ${max} ` +
      'objects like {"n": <item number>, "why": "<≤8 word reason>"}. Include ' +
      'only genuinely relevant items. If none are relevant, reply with [].',
    messages: [{ role: 'user', content: `Query: ${query}\n\nItems:\n${catalogText}` }],
  };
}

/**
 * Parse the model's reply into ordered, validated results. Tolerant of code
 * fences, surrounding prose, and bare-integer arrays.
 * @param {string} reply
 * @param {Set<number>|number[]} validNs  entry numbers that actually exist
 * @returns {Array<{n:number, why:string}>}
 */
export function parseSearchResults(reply, validNs) {
  const valid = validNs instanceof Set ? validNs : new Set(validNs || []);
  const text = String(reply || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let arr;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const el of arr) {
    const n = typeof el === 'number' ? el : Number(el?.n);
    if (!Number.isInteger(n) || !valid.has(n) || seen.has(n)) continue;
    seen.add(n);
    const why = el && typeof el === 'object' && el.why ? String(el.why).slice(0, 80) : '';
    out.push({ n, why });
  }
  return out;
}
