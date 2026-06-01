// xlsx.js — a tiny, dependency-free .xlsx writer.
// Produces a valid OOXML spreadsheet packaged as a STORED (uncompressed) ZIP,
// so there's no deflate dependency. Supports one sheet per collection, a bold
// header row, numbers, and clickable links via the HYPERLINK() formula.
//
// buildXlsx(sheets) -> Uint8Array, where
//   sheets: [{ name, header: string[], rows: Cell[][] }]
//   Cell:   string | number | { href, text }   (href => clickable hyperlink)

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';

const enc = new TextEncoder();
function strBytes(s) {
  return enc.encode(s);
}

function xml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

/** 0-based column index → spreadsheet letter (0→A, 26→AA). */
export function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sanitizeSheetName(name, used) {
  let n = String(name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = n;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = n.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(ref, cell, bold) {
  const s = bold ? ' s="1"' : '';
  if (cell == null || cell === '') return `<c r="${ref}"${s}/>`;
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"${s} t="n"><v>${cell}</v></c>`;
  }
  if (cell && typeof cell === 'object' && cell.href) {
    const url = String(cell.href).replace(/"/g, '""');
    const text = String(cell.text ?? cell.href);
    const formula = `HYPERLINK("${url}","${text.replace(/"/g, '""')}")`;
    return `<c r="${ref}"${s} t="str"><f>${xml(formula)}</f><v>${xml(text)}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(String(cell))}</t></is></c>`;
}

function rowXml(rowIndex, cells, bold) {
  const r = rowIndex + 1;
  const cellsXml = cells.map((cell, i) => cellXml(`${colLetter(i)}${r}`, cell, bold)).join('');
  return `<row r="${r}">${cellsXml}</row>`;
}

function sheetXml(sheet) {
  const rows = [rowXml(0, sheet.header || [], true)];
  (sheet.rows || []).forEach((cells, i) => rows.push(rowXml(i + 1, cells, false)));
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="${NS_MAIN}"><sheetData>${rows.join('')}</sheetData></worksheet>`
  );
}

// ---- ZIP (stored / no compression) ----------------------------------------

function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function zip(files) {
  const chunks = [];
  let offset = 0;
  const push = (arr) => {
    chunks.push(arr);
    offset += arr.length;
  };
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

  const central = [];
  for (const f of files) {
    const nameB = strBytes(f.name);
    const data = f.data;
    const crc = crc32(data);
    const localOffset = offset;
    const header = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), // mod time, date
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameB.length), ...u16(0),
    ];
    push(Uint8Array.from(header));
    push(nameB);
    push(data);
    central.push({ nameB, crc, size: data.length, localOffset });
  }

  const cdStart = offset;
  for (const c of central) {
    const cd = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), // mod time, date
      ...u32(c.crc), ...u32(c.size), ...u32(c.size),
      ...u16(c.nameB.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(c.localOffset),
    ];
    push(Uint8Array.from(cd));
    push(c.nameB);
  }
  const cdSize = offset - cdStart;
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0),
  ];
  push(Uint8Array.from(eocd));

  const total = chunks.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of chunks) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

// ---- Package assembly ------------------------------------------------------

export function buildXlsx(sheets = []) {
  const used = new Set();
  const named = (sheets.length ? sheets : [{ name: 'Sheet', header: [], rows: [] }]).map((s) => ({
    ...s,
    name: sanitizeSheetName(s.name, used),
  }));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="${NS_CT}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    named
      .map(
        (_s, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
    named
      .map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    `</sheets></workbook>`;

  const stylesRelId = `rId${named.length + 1}`;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    named
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('') +
    `<Relationship Id="${stylesRelId}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<styleSheet xmlns="${NS_MAIN}">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
    `<cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs>` +
    `</styleSheet>`;

  const files = [
    { name: '[Content_Types].xml', data: strBytes(contentTypes) },
    { name: '_rels/.rels', data: strBytes(rootRels) },
    { name: 'xl/workbook.xml', data: strBytes(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: strBytes(workbookRels) },
    { name: 'xl/styles.xml', data: strBytes(styles) },
    ...named.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: strBytes(sheetXml(s)),
    })),
  ];

  return zip(files);
}

export { crc32 };
