// Night Rider 3000 — service worker
// Only caches the app shell itself (so the planner still opens with no signal at the pier).
// Every cross-origin request (Anthropic, Astrospheric, Tempest, NINA, Telescopius, sky images) passes
// straight through untouched — those need live data, never stale cached responses.
//
// Network-first with a short timeout, falling back to cache: the old version served whatever was
// cached first and only refreshed the cache in the background for NEXT time, so a fresh deploy
// wouldn't actually reach the device until the load *after* the one that fetched it. This version
// always tries the network first — a normal connection gets today's build immediately; only a
// slow/dead connection (timeout or fetch failure) falls back to the last cached shell, so the app
// still opens with no signal at the pier.
const CACHE_NAME = 'nightrider-shell-v2';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch((e) => console.warn('Shell cache failed (non-fatal):', e))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only ever intercept same-origin GETs (the app shell). Everything else — every API call,
  // every font, every sky-survey image — passes straight to the network untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const network = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('sw network timeout')), NETWORK_TIMEOUT_MS)),
        ]);
        if (network && network.status === 200 && network.type === 'basic') {
          cache.put(req, network.clone());
        }
        return network;
      } catch (e) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw e; // offline and nothing cached yet — let it fail naturally
      }
    })()
  );
});
