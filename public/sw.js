// Grimório service worker: lets the installed app open offline.
// Pages: network first (always the latest version when online). Static files: cache first.
// Cloud requests (Supabase) are never cached.
const CACHE = 'grimorio-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      // no-cache: always revalidate with the server, so a reload never shows an old version
      fetch(req, { cache: 'no-cache' })
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
        .catch(() => caches.match('./')),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      });
      // a cached hit answers at once; the fetch still refreshes it for the next visit (new SRD/translations)
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }),
  );
});
