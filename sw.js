// CMFR Operations Hub — Service Worker
// Caches the app shell for instant loads and offline access

const CACHE_NAME = 'cmfr-hub-v3';
const CACHE_VERSION = '3.0.1';

// Core files to cache on install
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
];

// ── Install: cache app shell ───────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing CMFR Hub v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can, don't fail install if external resources are unavailable
      return Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err => console.log('[SW] Could not cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating CMFR Hub v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache with network fallback ──────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Firebase API calls — always go to network
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com') ||
    event.request.method !== 'GET'
  ) {
    return; // Let browser handle normally
  }

  // For everything else: Cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately
        // Also refresh cache in background (stale-while-revalidate)
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {}); // Ignore network errors in background
        return cached;
      }

      // Not in cache — try network
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Message handler: force update ─────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
