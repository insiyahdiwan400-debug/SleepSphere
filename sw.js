const CACHE = 'sleepsphere-v9-motherhood-20261010';
/* The Arabic face is shell, not an extra. The dua is read at bedtime, which
   is exactly when a phone is likeliest to be in a basement, on aeroplane
   mode, or out of data — so it is fetched on install with everything else
   rather than on first use. 43 KB. */
/* Motherhood is shell for the same reason the Arabic face is. A parent
   recording a broken night at 3am is the likeliest person in this cohort to
   be offline, and a module that needs the network to open is a module that
   is not there when it is wanted. Both files are loaded on every device
   regardless of whether anyone enabled it, so caching them discloses
   nothing. */
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './sleepsphere-icon-192.png', './sleepsphere-icon-512.png', './fonts/amiri-naskh-v2.woff2', './motherhood.js', './motherhood-ui.js', './motherhood.css'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('./', response.clone()));
      return response;
    }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match('./'))));
});
