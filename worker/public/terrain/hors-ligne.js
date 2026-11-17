// ============================================================
// Terrain — stockage sur l'appareil (IndexedDB)
// ------------------------------------------------------------
// donnees : dernières réponses du serveur (dossiers, composantes, fiches),
//           pour rouvrir une visite sans réseau.
// photos  : fichiers des photos, déjà téléchargées ou prises hors connexion.
// envois  : file des modifications faites sans réseau, envoyées dans
//           l'ordre au retour de la connexion.
// Sans IndexedDB (navigation privée stricte), tout répond vide et
// l'application fonctionne comme avant, en ligne seulement.
// ============================================================

const NOM = 'cs-terrain';
const VERSION = 1;
let ouverture = null;

function ouvrir() {
  if (ouverture) return ouverture;
  ouverture = new Promise((resolve) => {
    if (!('indexedDB' in window)) { resolve(null); return; }
    let req;
    try { req = indexedDB.open(NOM, VERSION); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('donnees')) db.createObjectStore('donnees');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      if (!db.objectStoreNames.contains('envois')) db.createObjectStore('envois', { keyPath: 'n', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return ouverture;
}

async function operation(magasin, mode, action) {
  const db = await ouvrir();
  if (!db) return null;
  return new Promise((resolve) => {
    let resultat = null;
    try {
      const tx = db.transaction(magasin, mode);
      const req = action(tx.objectStore(magasin));
      if (req) req.onsuccess = () => { resultat = req.result; };
      tx.oncomplete = () => resolve(resultat == null ? null : resultat);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export const disponible = async () => !!(await ouvrir());

export const lire = (cle) => operation('donnees', 'readonly', (m) => m.get(cle));
export const ecrire = (cle, valeur) => operation('donnees', 'readwrite', (m) => m.put(valeur, cle));
export const effacer = (cle) => operation('donnees', 'readwrite', (m) => m.delete(cle));
// Plusieurs écritures dans une seule transaction : [[cle, valeur], …].
export const ecrireLot = (paires) => operation('donnees', 'readwrite', (m) => { for (const [cle, valeur] of paires) m.put(valeur, cle); return null; });

export const photoLire = (id) => operation('photos', 'readonly', (m) => m.get(id));
export const photoEcrire = (id, blob) => operation('photos', 'readwrite', (m) => m.put(blob, id));
export const photoEffacer = (id) => operation('photos', 'readwrite', (m) => m.delete(id));
export async function photosPresentes() {
  const cles = await operation('photos', 'readonly', (m) => m.getAllKeys());
  return new Set(cles || []);
}

export async function envoisTous() {
  const tous = await operation('envois', 'readonly', (m) => m.getAll());
  return (tous || []).sort((a, b) => a.n - b.n);
}
// Rend l'envoi enregistré, avec son numéro d'ordre.
export async function envoiAjouter(op) {
  const n = await operation('envois', 'readwrite', (m) => m.add(op));
  return n == null ? null : Object.assign({}, op, { n });
}
export const envoiRemplacer = (op) => operation('envois', 'readwrite', (m) => m.put(op));
export const envoiRetirer = (n) => operation('envois', 'readwrite', (m) => m.delete(n));

export async function toutEffacer() {
  await operation('donnees', 'readwrite', (m) => m.clear());
  await operation('photos', 'readwrite', (m) => m.clear());
  await operation('envois', 'readwrite', (m) => m.clear());
}
