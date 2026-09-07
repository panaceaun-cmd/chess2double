// CHESS 2 DOUBLE — offline cache for PWA / TWA (Android app) installability.
//
// Bump this string on every deploy. activate() throws away every cache that is
// not this one, so a stale icon or manifest never outlives a release.
// Note: the PAGE itself no longer depends on this being bumped — index.html is
// revalidated against the server on every launch (see the fetch handler), so
// forgetting to bump delays only the static assets, never the game.
const CACHE_NAME = 'chess2double-2026-09-07';

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
    // No unconditional skipWaiting() here on purpose. index.html decides when
    // it is safe to hand over — it only asks when the tab has no controller
    // yet, i.e. nothing is at risk. Taking over on our own defeats that check.
  })());
});

// index.html has always posted this message; without a listener it did nothing.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    // No clients.claim() on purpose. Claiming an already-loaded page fires
    // 'controllerchange', and index.html reloads on that — which meant every
    // launch after a deploy downloaded the whole 2.2 MB page twice. The page
    // already open has the fresh HTML anyway; the worker takes over from the
    // next launch, with no reload at all.
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
    // NETWORK FIRST for the page, and genuinely so: cache 'no-cache' forces a
    // conditional request to the server instead of quietly reusing the HTTP
    // cache. GitHub Pages sends Cache-Control: max-age=600, so a plain fetch()
    // kept serving the previous build for up to ten minutes after a deploy
    // even though this handler looked like it went to the network. The
    // revalidation is cheap: the server answers 304 with no body unless the
    // file actually changed.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-cache' });
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
