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

/** Collect the union of custom-field keys across all items (first-seen order). */
function collectFieldKeys(collections) {
  const keys = [];
  for (const c of collections) {
    for (const it of Array.isArray(c.items) ? c.items : []) {
      if (it.fields && typeof it.fields === 'object') {
        for (const k of Object.keys(it.fields)) if (!keys.includes(k)) keys.push(k);
      }
    }
  }
  return keys;
}

/**
 * Build a CSV string (with header + UTF-8 BOM) from an array of collections.
 * One row per item; collections with no items still get a single row so they
 * appear in the export. A "Done" column and one column per custom field
 * (price, qty, …) are appended after the base columns.
 */
export function toCsv(collections = []) {
  const fieldKeys = collectFieldKeys(collections);
  const header = [...COLUMNS, 'Done', ...fieldKeys];
  const lines = [csvRow(header)];

  for (const c of collections) {
    const title = c.title || 'Untitled';
    const items = Array.isArray(c.items) ? c.items : [];
    if (items.length === 0) {
      lines.push(csvRow([title, ...Array(header.length - 1).fill('')]));
      continue;
    }
    for (const item of items) {
      const [type, itemTitle, url, note] = itemColumns(item);
      const done = item.done ? 'yes' : '';
      const fieldVals = fieldKeys.map((k) =>
        item.fields && item.fields[k] != null ? item.fields[k] : ''
      );
      lines.push(
        csvRow([title, type, itemTitle, url, note, isoDate(item.addedAt), done, ...fieldVals])
      );
    }
  }

  // \r\n line endings are the safest for Excel on Windows.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * Map collections into sheet structures for lib/xlsx.js — one sheet per
 * collection, the title column rendered as a clickable hyperlink, and one
 * column per custom field used within that collection.
 */
export function toXlsxSheets(collections = []) {
  return collections.map((c) => {
    const items = Array.isArray(c.items) ? c.items : [];
    const fieldKeys = [];
    for (const it of items) {
      if (it.fields && typeof it.fields === 'object') {
        for (const k of Object.keys(it.fields)) if (!fieldKeys.includes(k)) fieldKeys.push(k);
      }
    }
    const header = ['Type', 'Title', 'URL', 'Note', 'Done', 'Added', ...fieldKeys];
    const rows = items.map((item) => {
      const [type, title, url, note] = itemColumns(item);
      const titleCell = url ? { href: url, text: title || url } : title;
      return [
        type,
        titleCell,
        url,
        note,
        item.done ? 'yes' : '',
        isoDate(item.addedAt),
        ...fieldKeys.map((k) => (item.fields && item.fields[k] != null ? item.fields[k] : '')),
      ];
    });
    return { name: c.title || 'Untitled', header, rows };
  });
}

export { COLUMNS };
