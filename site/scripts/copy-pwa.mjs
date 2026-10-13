// copy-pwa.mjs — bring the mobile web app and site images into public/ before
// every dev/build, so the site always serves the repo's current PWA (no second
// copy to drift). Runs from `predev` / `prebuild`.
//
// The PWA lives in ../pwa and imports shared code from ../lib and icons from
// ../icons. Here everything lands under public/app/ (lib → app/lib, icons →
// app/icons) and the ../ paths are rewritten to ./, so the whole app sits inside
// its service worker's /app/ scope and works offline.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const repo = new URL('../../', import.meta.url);
const pub = new URL('../public/', import.meta.url);
const app = new URL('app/', pub);
const img = new URL('img/', pub);

await rm(app, { recursive: true, force: true });
await cp(new URL('pwa/', repo), app, { recursive: true });
await cp(new URL('lib/', repo), new URL('lib/', app), { recursive: true });
await cp(new URL('icons/', repo), new URL('icons/', app), { recursive: true });

for (const name of ['index.html', 'app.js', 'manifest.webmanifest']) {
  const file = new URL(name, app);
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replaceAll('../lib/', './lib/').replaceAll('../icons/', './icons/'));
}

// Marketing images come straight from the extension's store assets.
await rm(img, { recursive: true, force: true });
await mkdir(img, { recursive: true });
const images = {
  'icon.png': 'icons/icon128.png',
  'promo.png': 'store-assets/promo-marquee-1400x560.png',
  'shot-collections.png': 'store-assets/screenshot-1-collections.png',
  'shot-ai.png': 'store-assets/screenshot-2-ai-search.png',
  'shot-linkrot.png': 'store-assets/screenshot-3-link-rot.png',
  'shot-reading.png': 'store-assets/screenshot-4-reading.png',
  'shot-nested.png': 'store-assets/screenshot-8-nested.png',
};
for (const [to, from] of Object.entries(images)) await cp(new URL(from, repo), new URL(to, img));

console.log('copy-pwa: public/app and public/img are up to date');
