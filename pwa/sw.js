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

const CACHE = 'cp-shell-v1';
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
  // Cache-first for the shell; fall back to network and cache what we fetch.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((res) => {
            if (res.ok && new URL(request.url).origin === self.location.origin) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => hit)
    )
  );
});
