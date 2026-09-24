// Condo Stratégis — stockage local de l'app terrain.
//
// Trois magasins IndexedDB :
//   kv     — dernières réponses de l'API (profil, dossiers, composantes…) pour
//            rouvrir l'app et une fiche sans réseau ;
//   outbox — file ordonnée des écritures à pousser au serveur. Toute saisie y
//            passe d'abord : une coupure de réseau ne perd donc rien, l'envoi
//            reprend dès que le serveur répond ;
//   blobs  — photos : celles prises hors ligne (en attente d'envoi) et celles
//            déjà consultées, pour les revoir sans réseau.

const DB_NAME = 'cs_terrain';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ---------- kv ---------- */

export function kvGet(key) {
  return tx('kv', 'readonly', s => s.get(key)).catch(() => undefined);
}

export function kvSet(key, value) {
  return tx('kv', 'readwrite', s => s.put(value, key)).catch(() => {});
}

/* ---------- blobs ---------- */

export function blobGet(key) {
  return tx('blobs', 'readonly', s => s.get(key)).catch(() => undefined);
}

export function blobSet(key, blob) {
  return tx('blobs', 'readwrite', s => s.put(blob, key));
}

export function blobDelete(key) {
  return tx('blobs', 'readwrite', s => s.delete(key)).catch(() => {});
}

/* ---------- outbox ---------- */

export function outboxAdd(op) {
  const rec = Object.assign({ createdAt: Date.now() }, op);
  return tx('outbox', 'readwrite', s => s.add(rec));
}

export function outboxAll() {
  return tx('outbox', 'readonly', s => s.getAll()).then(r => r || []).catch(() => []);
}

export function outboxDelete(seq) {
  return tx('outbox', 'readwrite', s => s.delete(seq));
}

export function outboxClear() {
  return tx('outbox', 'readwrite', s => s.clear()).catch(() => {});
}

// Demande au navigateur de ne pas évincer ces données quand l'espace manque.
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {}
}

/* ---------- compression photo ---------- */

const PHOTO_MAX_SIDE = 2048;
const PHOTO_QUALITY = 0.82;

// Réduit une photo de cellulaire (3-8 Mo) à ~2048 px de côté en JPEG, soit
// ~400-900 Ko : assez pour l'analyse IA et le rapport, cinq à dix fois plus
// rapide à envoyer en 4G faible. En cas d'échec, on garde l'original.
export async function compressPhoto(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) return file;
  try {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await createImageBitmap(file); }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', PHOTO_QUALITY));
    if (!blob) return file;
    return blob.size < file.size ? blob : file;
  } catch (e) {
    return file;
  }
}
