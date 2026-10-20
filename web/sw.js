// Offline and fast crests: crests (ours and ESPN's) cache-first, so they never re-download or blink;
// the page and data network-first with the last copy as the offline fallback.
const CACHE = 'football-v29';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
const cacheFirst = async req => {
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
};
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'a.espncdn.com' || (url.origin === location.origin && url.pathname.includes('/logos/'))) { e.respondWith(cacheFirst(e.request)); return; }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
