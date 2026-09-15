// Tests for lib/pagemeta.js — runnable with `node tools/test_pagemeta.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { extractImageUrl, isGenericImageUrl, pickBestImage } from '../lib/pagemeta.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
const eq = (a, b, msg) => assert(a === b, `${msg} (got: ${JSON.stringify(a)})`);

const PAGE = 'https://example.com/articles/hello';

console.log('extractImageUrl — Open Graph:');
{
  const html = `<html><head>
    <meta property="og:image" content="https://cdn.example.com/a.jpg">
  </head><body>...</body></html>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/a.jpg', 'reads og:image');
}
{
  // content= before the property attribute.
  const html = `<meta content="https://cdn.example.com/b.png" property="og:image" />`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/b.png', 'content= before property=');
}
{
  const html = `<meta property='og:image' content='https://cdn.example.com/c.jpg'>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/c.jpg', 'single-quoted attributes');
}

console.log('\nextractImageUrl — relative + protocol-relative:');
{
  const html = `<meta property="og:image" content="/img/hero.jpg">`;
  eq(extractImageUrl(html, PAGE), 'https://example.com/img/hero.jpg', 'resolves root-relative');
}
{
  const html = `<meta property="og:image" content="hero.jpg">`;
  eq(
    extractImageUrl(html, PAGE),
    'https://example.com/articles/hero.jpg',
    'resolves path-relative against the page'
  );
}
{
  const html = `<meta property="og:image" content="//cdn.example.com/p.jpg">`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/p.jpg', 'protocol-relative → https');
}

console.log('\nextractImageUrl — entities in the URL:');
{
  const html = `<meta property="og:image" content="https://cdn.example.com/i.jpg?a=1&amp;b=2">`;
  eq(
    extractImageUrl(html, PAGE),
    'https://cdn.example.com/i.jpg?a=1&b=2',
    'decodes &amp; in query string'
  );
}

console.log('\nextractImageUrl — fallback priority:');
{
  const html = `<head>
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
    <meta itemprop="image" content="https://cdn.example.com/ip.jpg">
  </head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/tw.jpg', 'twitter:image before itemprop');
}
{
  const html = `<head><link rel="image_src" href="https://cdn.example.com/ls.jpg"></head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/ls.jpg', 'link rel=image_src fallback');
}
{
  const html = `<head>
    <meta property="og:image" content="https://cdn.example.com/og.jpg">
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
  </head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/og.jpg', 'og:image wins over twitter');
}

console.log('\nextractImageUrl — no image / bad input:');
{
  eq(extractImageUrl('<html><head><title>No image</title></head></html>', PAGE), '', 'no meta → ""');
  eq(extractImageUrl('', PAGE), '', 'empty string → ""');
  eq(extractImageUrl(null, PAGE), '', 'null → ""');
  const js = `<meta property="og:image" content="javascript:alert(1)">`;
  eq(extractImageUrl(js, PAGE), '', 'non-http(s) scheme rejected');
  const data = `<meta property="og:image" content="data:image/png;base64,AAAA">`;
  eq(extractImageUrl(data, PAGE), '', 'data: URL rejected (not http(s))');
}

console.log('\nextractImageUrl — only scans the head:');
{
  const html = `<head><title>x</title></head><body>
    <meta property="og:image" content="https://cdn.example.com/body.jpg"></body>`;
  eq(extractImageUrl(html, PAGE), '', 'ignores og:image that appears after </head>');
}

console.log('\nisGenericImageUrl — site furniture vs. page content:');
{
  const generic = [
    'https://cdn.example.com/assets/logo.png',
    'https://example.com/static/site-logo.svg',
    'https://example.com/img/default.jpg',
    'https://example.com/img/placeholder.png',
    'https://example.com/social/og-image.jpg',
    'https://example.com/images/twitter-card.png',
    'https://example.com/favicon.ico',
    'https://example.com/i/avatar.jpg',
    'https://example.com/img/icon-64x64.png',
    // Reported: recyclingtoday.com keeps its site logo in a logos/ folder.
    'https://www.recyclingtoday.com/fileuploads/image/logos/rt-logo.png',
    'https://example.com/logos/brand.png',
  ];
  for (const u of generic) assert(isGenericImageUrl(u), `generic: ${u}`);

  const specific = [
    'https://cdn.example.com/articles/2024/sourdough-crumb.jpg',
    'https://example.com/uploads/header-image.jpg', // "header" must NOT be generic
    'https://example.com/uploads/banner-2024.jpg', // nor "banner"
    'https://example.com/photos/hero-1200x630.jpg', // large dims are fine
    'https://example.com/img/logotypes-of-the-1970s.jpg', // word boundary, not a logo
  ];
  for (const u of specific) assert(!isGenericImageUrl(u), `specific: ${u}`);

  assert(!isGenericImageUrl(''), 'empty string is not generic');
  assert(!isGenericImageUrl(null), 'null is not generic');
}

console.log('\npickBestImage — prefers a page image over a site default:');
{
  eq(
    pickBestImage(['https://example.com/img/logo.png', 'https://cdn.example.com/story.jpg']),
    'https://cdn.example.com/story.jpg',
    'skips the logo for the real image'
  );
  eq(
    pickBestImage(['https://cdn.example.com/story.jpg', 'https://example.com/img/logo.png']),
    'https://cdn.example.com/story.jpg',
    'keeps a good first candidate'
  );
  eq(
    pickBestImage(['https://example.com/img/logo.png', 'https://example.com/img/default.jpg']),
    'https://example.com/img/logo.png',
    'all generic → falls back to the first (better a weak image than none)'
  );
  eq(pickBestImage([]), '', 'no candidates → ""');
  eq(pickBestImage(null), '', 'null → ""');
}

console.log('\nextractImageUrl — demotes a site-wide og:image:');
{
  // The reported bug: og:image is the site's stock social card, while
  // twitter:image is the actual article picture.
  const html = `<html><head>
    <meta property="og:image" content="https://example.com/static/og-image.png">
    <meta name="twitter:image" content="https://cdn.example.com/articles/pie.jpg">
  </head></html>`;
  eq(
    extractImageUrl(html, PAGE),
    'https://cdn.example.com/articles/pie.jpg',
    'prefers the article image over the stock og:image'
  );
}
{
  // Only a generic candidate exists — keep it rather than returning nothing.
  const html = `<meta property="og:image" content="https://example.com/static/logo.png">`;
  eq(
    extractImageUrl(html, PAGE),
    'https://example.com/static/logo.png',
    'lone generic candidate is still used'
  );
}
{
  // A good og:image must be unaffected by any of this.
  const html = `<html><head>
    <meta property="og:image" content="https://cdn.example.com/articles/hero.jpg">
    <meta name="twitter:image" content="https://cdn.example.com/articles/alt.jpg">
  </head></html>`;
  eq(
    extractImageUrl(html, PAGE),
    'https://cdn.example.com/articles/hero.jpg',
    'a specific og:image still wins'
  );
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All pagemeta.js tests passed.');
