const CACHE = 'sleepsphere-v13-navigation-20261015';
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
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './sleepsphere-icon-192.png', './sleepsphere-icon-512.png', './fonts/amiri-naskh-v2.woff2', './motherhood.js', './motherhood-ui.js', './motherhood.css', './insights.js', './insights.css', './explore.js', './explore.css', './living-sky.js', './living-sky.css'];

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
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => {
    // Never send cached index.html as JavaScript, CSS, JSON, or MP4.
    // A network error lets the caller show an honest offline fallback.
    return Response.error();
  })));
});

/* Push delivery requires a separately configured subscription and push sender.
   This handler never schedules messages or reads private Motherhood records. */
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const allowed = new Set(['bedtime', 'morning', 'gentle']);
  const type = allowed.has(payload && payload.type) ? payload.type : 'gentle';
  const copy = {
    bedtime: ['SleepSphere', 'Your wind-down time is approaching.'],
    morning: ['SleepSphere', 'Ready for your morning check-in?'],
    gentle: ['SleepSphere', 'A gentle reminder from SleepSphere.']
  }[type];
  event.waitUntil(self.registration.showNotification(copy[0], {
    body: copy[1],
    icon: './sleepsphere-icon-192.png',
    badge: './sleepsphere-icon-192.png',
    tag: 'sleepsphere-' + type,
    data: { destination: type === 'morning' ? 'morningFlow' : 'flow' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = event.notification.data && event.notification.data.destination === 'morningFlow'
    ? 'morningFlow' : 'flow';
  const target = new URL('./?go=' + destination, self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target).then(client => client && client.focus());
    return self.clients.openWindow(target);
  }));
});
