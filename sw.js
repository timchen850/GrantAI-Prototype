/* Grange AI — Service Worker
   Enables installability (PWA) and offline-friendly loading.
   Strategy:
     - App shell (HTML/icons): network-first, fall back to cache when offline.
     - Static assets (fonts, logo): cache-first for speed.
     - API / Supabase / auth: never cached (always live network).
*/

const VERSION = 'grange-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// Core files cached on install so the app opens offline.
const SHELL_FILES = [
  '/',
  '/index.html',
  '/logo.png',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase, auth, or any API traffic — must be live.
  const isLiveData =
    url.hostname.includes('supabase') ||
    url.pathname.includes('/functions/') ||
    url.pathname.includes('/auth/') ||
    url.pathname.includes('/rest/') ||
    url.search.includes('access_token');
  if (isLiveData) return;

  // HTML navigations: network-first so updates ship instantly,
  // fall back to cached shell when offline.
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Fonts, images, icons: cache-first for speed.
  const isCacheable =
    url.origin === self.location.origin ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isCacheable) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
          return res;
        }).catch(() => cached)
      )
    );
  }
});

// Allow the page to tell a waiting SW to activate immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
