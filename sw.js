/* ═══════════════════════════════════════════
   OTO — OneTripOnly Service Worker v2
   Conservative: only caches local app files.
   Never intercepts external API or tile calls.
   ═══════════════════════════════════════════ */

const CACHE_NAME = 'oto-v2';
const LOCAL_FILES = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// Install — cache only local app files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — ONLY serve cached local files when offline.
// All external requests (APIs, tiles, CDN) go straight to network untouched.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept same-origin requests (our own files)
  if (url.origin !== self.location.origin) return;

  // Network first, fall back to cache for local files
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
