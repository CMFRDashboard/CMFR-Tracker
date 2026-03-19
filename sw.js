// ══════════════════════════════════════════════════════════
// CMFR Operations Hub — Service Worker
// Strategy: Network-first for all requests
//   - Always tries network first (ensures fresh data)
//   - Falls back to cache if network unavailable
//   - App shell (index.html) cached on install
//   - Firebase handles its own offline persistence separately
//   - Bump CACHE_VERSION when deploying new index.html
//     to force all clients to get fresh copy
// ══════════════════════════════════════════════════════════

const CACHE_VERSION = 'cmfr-v3';
const APP_SHELL = [
  '/CMFR-Dashboard/',
  '/CMFR-Dashboard/index.html',
  '/CMFR-Dashboard/manifest.json',
  '/CMFR-Dashboard/icons/icon-192.png',
  '/CMFR-Dashboard/icons/icon-512.png',
];

// ── Install: cache the app shell ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: clean up old cache versions ───────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // take control immediately
  );
});

// ── Fetch: network-first strategy ───────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests — let Firebase POST/PUT/WebSocket
  // requests pass through untouched
  if(event.request.method !== 'GET') return;

  // Don't intercept Firebase API calls — Firebase SDK
  // manages its own connection and offline queue
  const url = event.request.url;
  if(
    url.includes('firebaseio.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('googleapis.com/calendar') ||
    url.includes('api.weather.gov') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('cdnjs.cloudflare.com')
  ) {
    return; // Let these go straight to network unintercepted
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Network succeeded — update cache with fresh copy
        if(response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request)
          .then(cached => {
            if(cached) return cached;
            // If requesting a page and not in cache, serve index.html
            if(event.request.destination === 'document') {
              return caches.match('/CMFR-Dashboard/index.html');
            }
          });
      })
  );
});
