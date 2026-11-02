// Tests for lib/image-split.js: swapping inline images for cpimg: references
// and back. `node tools/test_image_split.mjs`. Exits non-zero on failure.
import { webcrypto, createHash, randomBytes } from 'node:crypto';

try {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
} catch {
  /* already defined */
}

const {
  splitImages,
  rehydrateImages,
  collectRefs,
  parseDataUrl,
  isImageRef,
  toRef,
  bytesToBase64,
  base64ToBytes,
} = await import('../lib/image-split.js');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const img = (n, mime = 'image/jpeg') => {
  const bytes = randomBytes(n);
  return { url: `data:${mime};base64,${bytes.toString('base64')}`, hash: createHash('sha256').update(bytes).digest('hex') };
};

console.log('base64 helpers');
{
  const b = new Uint8Array(randomBytes(100000));
  assert(Buffer.from(bytesToBase64(b), 'base64').equals(Buffer.from(b)), 'bytesToBase64 matches Node (large input)');
  assert(Buffer.from(base64ToBytes(Buffer.from(b).toString('base64'))).equals(Buffer.from(b)), 'base64ToBytes round-trips');
}

console.log('parseDataUrl');
{
  const a = img(1000);
  const p = parseDataUrl(a.url);
  assert(p && p.mime === 'image/jpeg' && p.bytes.length === 1000, 'parses a base64 data URL');
  assert(parseDataUrl('data:image/svg+xml,%3Csvg%3E') === null, 'skips non-base64 data URLs');
  assert(parseDataUrl('https://example.com/a.png') === null, 'skips web URLs');
  assert(parseDataUrl('data:image/png;base64,QQ=') === null, 'skips malformed base64');
  assert(parseDataUrl('data:image/png;base64,QR==') === null, 'skips non-canonical base64 (would not round-trip)');
}

console.log('splitImages / rehydrateImages');
{
  const big = img(2000);
  const png = img(3000, 'image/png');
  const tiny = img(10);
  const data = {
    collections: [
      {
        id: 'c1',
        cover: big.url,
        items: [
          { id: 'i1', type: 'page', thumbnail: big.url, url: 'https://a.example/' },
          { id: 'i2', type: 'image', src: png.url },
          { id: 'i3', type: 'page', thumbnail: tiny.url },
          { id: 'i4', type: 'note', text: 'data: is just text here' },
        ],
      },
    ],
    trash: [{ id: 'c2', items: [{ id: 'i5', thumbnail: png.url }] }],
  };
  const original = JSON.stringify(data);
  const tree = JSON.parse(original);
  const hashOf = new Map();
  const { refs, images } = await splitImages(tree, { hashOf });

  assert(tree.collections[0].cover === toRef(big.hash), 'cover becomes a cpimg: ref of the bytes’ SHA-256');
  assert(tree.collections[0].items[0].thumbnail === toRef(big.hash), 'same picture gets the same ref');
  assert(isImageRef(tree.collections[0].items[1].src), 'image item src is split');
  assert(isImageRef(tree.trash[0].items[0].thumbnail), 'images anywhere in the tree are split (trash too)');
  assert(tree.collections[0].items[2].thumbnail === tiny.url, 'tiny images stay inline');
  assert(tree.collections[0].items[3].text === 'data: is just text here', 'other strings untouched');
  assert(refs.size === 2 && refs.has(big.hash) && refs.has(png.hash), 'refs lists each distinct image once');
  assert(images.size === 2 && images.get(png.hash) === png.url, 'images maps hash → original data URL');
  assert(JSON.stringify(tree).length < original.length / 3, 'split doc is much smaller');
  assert(hashOf.get(big.url) === big.hash, 'hash cache filled');

  // A second split with the cache gives the same answer.
  const again = await splitImages(JSON.parse(original), { hashOf });
  assert([...again.refs].sort().join() === [...refs].sort().join(), 'cached split matches');

  assert([...collectRefs(tree)].sort().join() === [...refs].sort().join(), 'collectRefs finds the same refs');

  rehydrateImages(tree, (h) => images.get(h));
  assert(JSON.stringify(tree) === original, 'rehydrate restores the original exactly');

  const lost = JSON.parse(original);
  await splitImages(lost);
  rehydrateImages(lost, (h) => (h === big.hash ? big.url : null));
  assert(lost.collections[0].items[1].src === '', 'an image that can’t be found becomes empty, not a broken ref');
  assert(lost.collections[0].cover === big.url, 'found images are restored');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall image-split tests passed');
