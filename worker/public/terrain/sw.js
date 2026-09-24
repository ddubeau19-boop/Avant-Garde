// Condo Stratégis — service worker de l'app terrain.
//
// Rôle unique : que l'app s'ouvre sans réseau. Les fichiers de l'app sont servis
// « réseau d'abord » (une mise à jour déployée arrive dès qu'il y a du signal),
// avec repli sur la copie en cache après quelques secondes ou en cas d'échec.
// Les appels /api/* ne passent jamais par ici : les données et la file d'envoi
// sont gérées par l'app elle-même (offline.js), qui sait quoi faire d'un échec.

const CACHE = 'cs-terrain-v1';

const SHELL = [
  './',
  './app.js',
  './offline.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  '../shared/tokens.css',
  '../assets/logo-mark.png',
  '../vendor/lucide.min.js',
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url =>
        fetch(url, { cache: 'reload' })
          .then(res => { if (res.ok) return cache.put(url, clean(res)); })
          .catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('cs-terrain-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Une réponse issue d'une redirection ne peut pas servir une navigation :
// on la recopie en réponse « propre ».
function clean(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isFont(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, new URL('./', self.location).href));
    return;
  }
  event.respondWith(networkFirst(req));
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(fallbackUrl || req, clean(res.clone())).catch(() => {});
    return res;
  });
  network.catch(() => {});
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch (e) { /* réseau indisponible : repli sur le cache */ }
  const cached = await cache.match(fallbackUrl || req, { ignoreSearch: true });
  if (cached) return cached;
  return network;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}
