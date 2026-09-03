// CHESS 2 DOUBLE — offline cache for PWA / TWA (Android app) installability.
//
// Bump this string on every deploy. It is what makes activate() throw away the
// previous cache; while the name stayed 'chess2double-v1' forever, the old
// cache was never cleared and returning players kept getting an old build.
const CACHE_NAME = 'chess2double-2026-09-03';

// './index.html' — NOT './chess-double.html', which no longer exists in the
// repository. cache.addAll() is atomic, so that one dead path made the whole
// install reject and nothing was ever precached.
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Added one at a time on purpose: a single missing file must not abort the
    // whole install the way addAll() does. Anything that fails is simply left
    // out of the offline bundle and fetched from the network when needed.
    await Promise.all(CORE_ASSETS.map((url) =>
      cache.add(url).catch((err) => console.warn('[sw] not precached:', url, err && err.message))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Is this the page itself, rather than one of its assets?
function isPageRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Only ever touch our own files. Firebase, Google fonts and any other
  // third-party request goes straight to the network — caching those would
  // freeze the SDK on an old version and can interfere with realtime sync.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isPageRequest(request)) {
    // NETWORK FIRST for the page. The old worker was cache-first for
    // everything, so once index.html was cached it was served from there for
    // ever and a new deploy could never reach anyone — the in-page
    // BUILD_VERSION cache purge could not help either, because the new
    // index.html carrying the new version was exactly what never arrived.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) {
          const clone = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return fresh;
      } catch (err) {
        // offline: fall back to the last copy we stored
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // CACHE FIRST for static assets (icons, sounds, lang.json, pieces.json):
  // they are refetched in the background so an update lands on the next load,
  // while the current load stays instant and works offline.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});
