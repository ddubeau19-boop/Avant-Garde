// ============================================================
// Terrain — fonctions du téléphone dans l'app Android
// ------------------------------------------------------------
// L'app Android (dossier mobile/, Capacitor) embarque ces mêmes fichiers.
// Dans l'app, window.Capacitor donne accès à l'appareil photo natif, au
// bouton retour et au partage de fichiers. Dans un navigateur, ce module ne
// fait rien : chaque fonction répond « indisponible » et l'app garde son
// comportement web.
// L'app charge le runtime Capacitor (vendor/capacitor.js) avant ce module ;
// les modules natifs sont enregistrés ici par leur nom, sans paquet npm ni
// étape de compilation côté site.
// ============================================================

const cap = typeof window !== 'undefined' ? window.Capacitor : null;

export const estNatif = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

const enregistres = {};
function plugin(nom) {
  if (!estNatif) return null;
  if (enregistres[nom]) return enregistres[nom];
  // Seuls les modules réellement compilés dans l'APK sont offerts.
  const entetes = Array.isArray(cap.PluginHeaders) ? cap.PluginHeaders : null;
  if (entetes && !entetes.some((h) => h.name === nom)) return null;
  const p = (cap.Plugins && cap.Plugins[nom]) || (typeof cap.registerPlugin === 'function' ? cap.registerPlugin(nom) : null);
  enregistres[nom] = p || null;
  return enregistres[nom];
}

// Les pages de l'app viennent de https://localhost : l'API, elle, est sur le
// site. index.html de l'app fixe window.CS_SITE au moment de la compilation.
export const SITE = estNatif ? String(window.CS_SITE || 'https://pga.stratege.io').replace(/\/+$/, '') : '';

/* ---------- Appareil photo natif ---------- */

export const photoNativeDisponible = () => !!plugin('Camera');

// Ouvre l'appareil photo du téléphone : même qualité que son app photo
// (mise au point, HDR, réduction du bruit), et une copie part dans la
// galerie, comme sauvegarde, avant même l'envoi.
// Répond un File, ou null si la personne a annulé.
export async function prendrePhotoNative() {
  const Camera = plugin('Camera');
  if (!Camera) return null;
  let photo;
  try {
    photo = await Camera.getPhoto({
      source: 'CAMERA',
      resultType: 'uri',
      quality: 92,
      correctOrientation: true,
      saveToGallery: true,
      allowEditing: false,
    });
  } catch (e) {
    // Annulation : le plugin rejette avec « User cancelled photos app ».
    if (/cancel/i.test(String(e && (e.message || e)))) return null;
    throw new Error("L'appareil photo n'a pas pu s'ouvrir. Vérifiez l'autorisation Caméra de l'app dans les réglages du téléphone.");
  }
  const chemin = photo && (photo.webPath || (photo.path && cap.convertFileSrc(photo.path)));
  if (!chemin) return null;
  const blob = await (await fetch(chemin)).blob();
  const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  return new File([blob], `photo-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`, { type });
}

/* ---------- Fichiers (rapports) ---------- */

function enBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1] || '');
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(blob);
  });
}

// Un lien <a download> ne fait rien dans l'app : le fichier est écrit dans
// le cache de l'app, puis offert au menu de partage d'Android (Drive, Gmail,
// Word, Fichiers…). Répond false hors de l'app.
export async function partagerFichier(blob, nom) {
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');
  if (!Filesystem || !Share) return false;
  const ecrit = await Filesystem.writeFile({ path: nom, data: await enBase64(blob), directory: 'CACHE' });
  try {
    await Share.share({ title: nom, url: ecrit.uri, dialogTitle: 'Enregistrer ou envoyer le fichier' });
  } catch (e) {
    if (!/cancel/i.test(String(e && (e.message || e)))) throw e;
  }
  return true;
}

/* ---------- Bouton retour d'Android ---------- */

// gestion() rend true si l'app a traité le retour (caméra fermée, écran
// précédent). Sinon l'app passe en arrière-plan sans se fermer : les envois
// en attente continuent au prochain retour au premier plan.
export function surRetour(gestion) {
  const App = plugin('App');
  if (!App) return;
  App.addListener('backButton', () => {
    let traite = false;
    try { traite = !!gestion(); } catch (e) { traite = false; }
    if (!traite) App.minimizeApp();
  });
}

/* ---------- Liens vers le site ---------- */

// Ouvrir un lien du site (mot de passe oublié, etc.) dans le navigateur du
// téléphone plutôt que dans l'app.
export function lienSite(chemin) {
  return SITE + chemin;
}
