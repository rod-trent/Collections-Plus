// sw.js — minimal offline app-shell cache for the PWA skeleton.
//
// Scope note: served from /pwa/, this worker controls only /pwa/ requests. The
// shared modules it imports live in /lib/ (out of scope), so they aren't cached
// here yet. Production will bundle everything under one scope (Vite build), at
// which point the whole app — including the shared store.js graph — is
// precached. For now this makes the shell itself installable and offline-ready.
//
// Phase 3 will extend this worker with the share-target handler and a
// Background-Sync queue for offline saves.

const CACHE = 'cp-shell-v14';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Only our own files; Dropbox API calls etc. go straight to the network.
  if (new URL(request.url).origin !== self.location.origin) return;
  // Network-first: a deploy reaches installed apps on their next launch, and
  // the cached copy keeps the app working offline. (Cache-first would pin
  // every installed app to the version it first downloaded.)
  e.respondWith(
    // no-cache: always re-check with the server (a cheap 304 when unchanged),
    // so a browser's own HTTP cache can't hand back a stale app.
    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error()))
  );
});
