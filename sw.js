const CACHE = 'sleepsphere-v15-consent-offline-20261021';
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
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './sleepsphere-icon-192.png', './sleepsphere-icon-512.png', './fonts/amiri-naskh-v2.woff2', './motherhood.js', './motherhood-ui.js', './motherhood.css', './insights.js', './insights.css', './explore.js', './explore.css', './living-sky.js', './living-sky.css', './prototype-reporting-consent.js', './prototype-reporting-consent-ui.js', './prototype-reporting-embed.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    // Only the app entry point may refresh the cached offline home screen.
    // Visiting a diagnostic page must not replace the offline app.
    const rootPath = new URL('./', self.registration.scope).pathname;
    const requestPath = new URL(event.request.url).pathname;
    const isAppEntry = requestPath === rootPath || requestPath === rootPath + 'index.html';
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      if (response.ok && isAppEntry) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('./', copy)));
      }
      return response;
    }).catch(() => isAppEntry
      ? caches.match('./').then(cached => cached || Response.error())
      : Response.error()));
    return;
  }
  // The font is content-addressed: if the Arabic changes the file is recut
  // and renamed, so a cached copy can never be the wrong one. Everything
  // else has a stable name and changes under it, which is the whole
  // problem below.
  if (/\/fonts\/.*\.woff2$/.test(new URL(event.request.url).pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => Response.error())));
    return;
  }

  // Network first for code, cache only as the offline fallback.
  //
  // This was cache-first, and index.html above is network-first, which
  // meant a deploy reached a returning phone as NEW HTML RUNNING OLD
  // SCRIPTS. That is not staleness, it is a version mismatch the app has
  // no way to detect: the markup had a Private destination and the
  // cached motherhood-ui.js was still mounting its entry card into the
  // Me tab, so the new screen rendered empty and the feature looked
  // missing. Reported exactly that way, twice.
  //
  // Bumping CACHE does not fix it on its own. skipWaiting/clients.claim
  // only help once the new worker activates, and the page that is
  // already open was served by the old one — so the first load after
  // every deploy is the broken one.
  //
  // Offline is unaffected: the cache is still written on every success
  // and is still what answers when the network is gone.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached =>
    // Never send cached index.html as JavaScript, CSS, JSON, or MP4.
    // A network error lets the caller show an honest offline fallback.
    cached || Response.error()
  )));
});
