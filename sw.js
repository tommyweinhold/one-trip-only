/* ═══════════════════════════════════════════
   OTO — OneTripOnly Service Worker
   Handles offline caching and background sync
   ═══════════════════════════════════════════ */

const CACHE_NAME = 'oto-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// Install — cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS).catch(() => {
        // Non-fatal — some external resources may block caching
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for static assets, network-first for API calls
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network-first for API calls
  const isAPI = [
    'api.open-meteo.com',
    'api.opentopodata.org',
    'api.openaq.org',
    'nominatim.openstreetmap.org',
    'overpass-api.de',
    'supabase.co',
    'cloudinary.com',
  ].some(domain => url.hostname.includes(domain));

  if (isAPI) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-first for map tiles — makes offline map browsing possible
  const isMapTile = [
    'tile.openstreetmap.org',
    'arcgisonline.com',
    'stadiamaps.com',
  ].some(domain => url.hostname.includes(domain));

  if (isMapTile) {
    event.respondWith(
      caches.open('oto-tiles').then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Background sync for offline posts (queued when connection lost)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncQueuedPosts());
  }
});

async function syncQueuedPosts() {
  // Posts queued while offline will sync here when connection restores
  const cache = await caches.open('oto-queue');
  const keys = await cache.keys();
  for (const key of keys) {
    const response = await cache.match(key);
    const post = await response.json();
    try {
      await fetch(post.url, { method: post.method, body: post.body, headers: post.headers });
      await cache.delete(key);
    } catch (e) {
      // Still offline — try again next sync
    }
  }
}
