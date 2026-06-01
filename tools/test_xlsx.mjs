// Tests for lib/xlsx.js — `node tools/test_xlsx.mjs`.
// Independently re-parses the ZIP and re-computes CRC32s to prove the package
// is structurally valid (Excel rejects bad CRCs/offsets silently).
import { buildXlsx, colLetter } from '../lib/xlsx.js';
import { toXlsxSheets } from '../lib/export.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

// Independent CRC32 (not imported from xlsx.js) so the check is honest.
function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function parseZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder();
  const entries = [];
  let p = 0;
  while (p + 4 <= buf.length && dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const compSize = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const nameStart = p + 30;
    const name = dec.decode(buf.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    entries.push({ name, crc, data });
    p = dataStart + compSize;
  }
  return entries;
}

console.log('colLetter:');
{
  assert(colLetter(0) === 'A' && colLetter(25) === 'Z' && colLetter(26) === 'AA', 'A..Z..AA');
}

console.log('\nbuildXlsx (structure + CRCs):');
{
  const out = buildXlsx([
    {
      name: 'Parts',
      header: ['Type', 'Title', 'URL'],
      rows: [
        ['page', { href: 'https://ex.com/a', text: 'A' }, 'https://ex.com/a'],
        ['page', 'Plain', ''],
        ['page', 'Num', 42],
      ],
    },
    { name: 'Notes', header: ['Type', 'Text'], rows: [['note', 'hi']] },
  ]);

  assert(out instanceof Uint8Array, 'returns bytes');
  assert(out[0] === 0x50 && out[1] === 0x4b && out[2] === 0x03 && out[3] === 0x04, 'starts with PK\\x03\\x04');

  const entries = parseZip(out);
  const names = entries.map((e) => e.name);
  assert(names.includes('[Content_Types].xml'), 'has [Content_Types].xml');
  assert(names.includes('xl/workbook.xml') && names.includes('xl/styles.xml'), 'has workbook + styles');
  assert(names.includes('xl/worksheets/sheet1.xml') && names.includes('xl/worksheets/sheet2.xml'), 'has both sheets');

  const allCrcOk = entries.every((e) => crc32(e.data) === e.crc);
  assert(allCrcOk, 'every entry CRC32 matches the stored data');

  const dec = new TextDecoder();
  const sheet1 = dec.decode(entries.find((e) => e.name === 'xl/worksheets/sheet1.xml').data);
  // Quotes are XML-escaped in the stored part; Excel unescapes them on open.
  assert(sheet1.includes('HYPERLINK(&quot;https://ex.com/a&quot;'), 'hyperlink formula present (xml-escaped)');
  assert(sheet1.includes('t="n"><v>42</v>'), 'numeric cell typed as number');
  assert(sheet1.includes('s="1"'), 'header cells use the bold style');
}

console.log('\ntoXlsxSheets (from collections):');
{
  const sheets = toXlsxSheets([
    {
      title: 'Shop',
      items: [
        { type: 'page', title: 'Bolt', url: 'https://ex.com/bolt', done: true, fields: { Price: '0.5' } },
      ],
    },
  ]);
  assert(sheets.length === 1 && sheets[0].name === 'Shop', 'one sheet named after the collection');
  assert(sheets[0].header.join(',') === 'Type,Title,URL,Note,Done,Added,Price', 'header includes Done + field');
  assert(sheets[0].rows[0][1].href === 'https://ex.com/bolt', 'title cell is a hyperlink');
  // Build it too, to ensure the mapped shape packages cleanly.
  assert(buildXlsx(sheets) instanceof Uint8Array, 'mapped sheets build to xlsx bytes');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
