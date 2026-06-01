// export.js — turn collections into a spreadsheet-friendly CSV.
// Pure and dependency-free so it's testable under Node (tools/test_export.mjs).
// The CSV opens directly in Excel / Google Sheets / Numbers; we prepend a UTF-8
// BOM so Excel reads non-ASCII characters correctly.

const COLUMNS = ['Collection', 'Type', 'Title', 'URL', 'Note', 'Added'];

/** Quote a single CSV field per RFC 4180 (only when it needs it). */
function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

/** ISO date (YYYY-MM-DD) from an epoch ms timestamp, or '' if missing. */
function isoDate(ms) {
  if (!ms && ms !== 0) return '';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Flatten one stored item into [type, title, url, note] for the sheet. */
function itemColumns(item) {
  if (item.type === 'note') {
    return ['note', '', '', item.text || ''];
  }
  if (item.type === 'image') {
    return ['image', item.alt || 'Image', item.srcPageUrl || item.src || '', ''];
  }
  // page (default)
  return ['page', item.title || '', item.url || '', item.note || ''];
}

/**
 * Build a CSV string (with header + UTF-8 BOM) from an array of collections.
 * One row per item; collections with no items still get a single row so they
 * appear in the export.
 */
export function toCsv(collections = []) {
  const lines = [csvRow(COLUMNS)];

  for (const c of collections) {
    const title = c.title || 'Untitled';
    const items = Array.isArray(c.items) ? c.items : [];
    if (items.length === 0) {
      lines.push(csvRow([title, '', '', '', '', '']));
      continue;
    }
    for (const item of items) {
      const [type, itemTitle, url, note] = itemColumns(item);
      lines.push(csvRow([title, type, itemTitle, url, note, isoDate(item.addedAt)]));
    }
  }

  // \r\n line endings are the safest for Excel on Windows.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export { COLUMNS };
