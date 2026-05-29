// csv.js — tolerant CSV parsing + Edge Collections export mapping.
// Pure module: no `chrome` dependency, so it can be unit-tested in Node.

/**
 * Parse CSV text into an array of string-arrays (rows of fields).
 * Handles quoted fields, escaped quotes (""), commas inside quotes,
 * and CRLF / LF / CR line endings. A trailing newline is ignored.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\r') {
      // Handle CRLF and lone CR.
      pushRow();
      if (text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Flush the final field/row unless the input ended on a clean newline.
  if (field !== '' || row.length > 0) pushRow();

  // Drop fully-empty trailing rows produced by trailing separators.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const COLLECTION_RE = /collection|group|folder|category/i;
const URL_RE = /url|link|address|href|web\s*page/i;
const TITLE_RE = /title|name|text|page|description/i;

/**
 * Detect which column holds the collection name, the URL, and the title,
 * given a header row. Returns -1 for any column that can't be found.
 *
 * @param {string[]} header
 */
function detectColumns(header) {
  const lower = header.map((h) => (h || '').trim().toLowerCase());
  const find = (re, exclude = []) =>
    lower.findIndex((h, idx) => re.test(h) && !exclude.includes(idx));

  const collection = find(COLLECTION_RE);
  const url = find(URL_RE);
  // Avoid reusing the collection or url column as the title.
  let title = find(TITLE_RE, [collection, url].filter((x) => x >= 0));
  if (title === -1) {
    // Fall back to the first column that isn't collection or url.
    title = lower.findIndex((_, idx) => idx !== collection && idx !== url);
  }
  return { collection, url, title };
}

/**
 * Heuristic: does this row look like a header (no obvious URL value)?
 */
function looksLikeHeader(row) {
  const hasUrl = row.some((v) => /^https?:\/\//i.test((v || '').trim()));
  const matchesNames = row.some(
    (v) => COLLECTION_RE.test(v) || URL_RE.test(v) || TITLE_RE.test(v)
  );
  return !hasUrl && matchesNames;
}

/**
 * Map a parsed Edge Collections CSV export into our collection structure.
 *
 * Edge's exact column layout has varied across versions, so this is tolerant:
 * it detects columns from a header row when present, otherwise assumes the
 * layout [collection, title, url]. Rows are grouped by collection name.
 *
 * Notes and images are not present in the CSV export, so the result is
 * pages-only by design.
 *
 * @param {string} csvText
 * @param {string} [fallbackName] name for rows with no collection value
 * @returns {{ collections: Array<{title:string, pages:Array<{url:string,title:string}>}>,
 *             stats: {collections:number, pages:number, skipped:number} }}
 */
export function mapEdgeCsv(csvText, fallbackName = 'Imported') {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { collections: [], stats: { collections: 0, pages: 0, skipped: 0 } };
  }

  let cols;
  let startIdx = 0;
  if (looksLikeHeader(rows[0])) {
    cols = detectColumns(rows[0]);
    startIdx = 1;
  } else {
    // No header: assume [collection, title, url]; if only 2 columns, [collection, url].
    const width = rows[0].length;
    cols = width >= 3 ? { collection: 0, title: 1, url: 2 } : { collection: 0, title: -1, url: 1 };
  }

  // If column detection failed to find a URL, guess the column whose values
  // most often look like URLs.
  if (cols.url === -1) {
    const width = Math.max(...rows.map((r) => r.length));
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < width; c++) {
      const score = rows.reduce(
        (n, r) => n + (/^https?:\/\//i.test((r[c] || '').trim()) ? 1 : 0),
        0
      );
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    cols.url = best;
  }

  const groups = new Map();
  const stats = { collections: 0, pages: 0, skipped: 0 };

  for (let r = startIdx; r < rows.length; r++) {
    const row = rows[r];
    const url = cols.url >= 0 ? (row[cols.url] || '').trim() : '';
    if (!url) {
      stats.skipped++;
      continue;
    }
    const name =
      (cols.collection >= 0 ? (row[cols.collection] || '').trim() : '') || fallbackName;
    let title = cols.title >= 0 ? (row[cols.title] || '').trim() : '';
    if (!title) {
      try {
        title = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        title = url;
      }
    }
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ url, title });
    stats.pages++;
  }

  const collections = [...groups.entries()].map(([title, pages]) => ({ title, pages }));
  stats.collections = collections.length;
  return { collections, stats };
}
