// Night Rider 3000 — service worker
// Only caches the app shell itself (so the planner still opens with no signal at the pier).
// Every cross-origin request (Anthropic, Astrospheric, NINA, Telescopius, sky images) passes
// straight through untouched — those need live data, never stale cached responses.
const CACHE_NAME = 'nightrider-shell-v1';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

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
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached); // offline and nothing cached yet — let it fail naturally
      return cached || network;
    })
  );
});
