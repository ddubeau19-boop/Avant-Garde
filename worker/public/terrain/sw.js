// ============================================================
// Terrain — service worker : l'application s'ouvre sans réseau.
// ------------------------------------------------------------
// Fichiers de l'application : réseau d'abord (un déploiement arrive dès
// qu'il y a du réseau), copie locale sinon. Icônes et polices externes :
// copie locale d'abord. Les appels /api ne passent pas par ici : les
// données de visite sont gérées par l'application (hors-ligne.js).
// ============================================================
const CACHE = 'cs-terrain-v1';
const COQUILLE = ['./', './app.js', './hors-ligne.js', './style.css', '../shared/tokens.css', '../assets/logo-mark.png'];
const EXTERNES = ['https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js'];
const HOTES_EXTERNES = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(COQUILLE.map((url) => cache.add(url).catch(() => {})));
    await Promise.all(EXTERNES.map(async (url) => {
      try { await cache.put(url, await fetch(url, { mode: 'no-cors' })); } catch (e) { /* réessayé à la prochaine visite */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const cle of await caches.keys()) if (cle !== CACHE) await caches.delete(cle);
    await self.clients.claim();
  })());
});

async function reseauDabord(requete) {
  const cache = await caches.open(CACHE);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch (e) {
    const copie = await cache.match(requete, { ignoreSearch: true });
    if (copie) return copie;
    if (requete.mode === 'navigate') {
      const page = await cache.match('./');
      if (page) return page;
    }
    throw e;
  }
}

async function copieDabord(requete) {
  const cache = await caches.open(CACHE);
  const copie = await cache.match(requete);
  if (copie) return copie;
  const reponse = await fetch(requete);
  if (reponse.ok || reponse.type === 'opaque') cache.put(requete, reponse.clone());
  return reponse;
}

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    event.respondWith(reseauDabord(requete));
    return;
  }
  if (HOTES_EXTERNES.includes(url.hostname)) event.respondWith(copieDabord(requete));
});
