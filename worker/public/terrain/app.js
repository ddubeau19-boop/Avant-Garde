// Condo Stratégis — Inspection terrain (mobile field app)
// Vanilla JS SPA, no build step. Wires les écrans de visite au backend /api/*.
//
// Modèle d'inspection maison (feuille « Relevé ») :
//   cote 1-4 + na, marqueur R,
//   observation → cause possible → délai suggéré → conséquences,
//   facettes optionnelles (position de façade, emplacement, variante de matériau),
//   attributs typés libres, et l'année anticipée de remplacement dérivée de
//   « année de construction ou réparation + durée de vie utile ».

import * as HL from './hors-ligne.js';

const TOKEN_KEY = 'cs_terrain_token';

/* ---------- Taxonomie maison : 11 catégories ---------- */

const CATS = {
  terrain:     { label: 'Terrain et aménagement',                                  pill: 'Terrain',        icon: 'trees' },
  structure:   { label: 'Fondation, structure et stationnements intérieurs',       pill: 'Structure',      icon: 'layers' },
  enveloppe:   { label: 'Enveloppe du bâtiment',                                   pill: 'Enveloppe',      icon: 'layout-grid' },
  ouvertures:  { label: 'Portes extérieures et fenêtres',                          pill: 'Portes et fenêtres', icon: 'door-open' },
  balcons:     { label: 'Balcons, escaliers et terrasses',                         pill: 'Balcons',        icon: 'fence' },
  interieur:   { label: 'Intérieur du bâtiment',                                   pill: 'Intérieur',      icon: 'sofa' },
  equipements: { label: 'Appareils, installations et équipements spéciaux',        pill: 'Équipements',    icon: 'boxes' },
  cvac:        { label: 'Systèmes de chauffage et ventilation',                    pill: 'CVAC',           icon: 'fan' },
  electrique:  { label: 'Installations électriques',                               pill: 'Électricité',    icon: 'zap' },
  plomberie:   { label: "Installations de plomberie, d'eau et d'égout",            pill: 'Plomberie',      icon: 'droplets' },
  piscines:    { label: 'Piscines et centre aquatique',                            pill: 'Piscines',       icon: 'waves' },
};

const CAT_AUTRES = { label: 'Autres', pill: 'Autres', icon: 'box' };

function catInfo(key) {
  return CATS[key] || CAT_AUTRES;
}

/* ---------- Échelle de cote : 1-4 + na, plus le marqueur R ---------- */

const RATINGS = [
  { v: 1, label: 'Bon état',            pill: 'Bon état',        color: '#1F8A4E', bg: '#E6F2EB' },
  { v: 2, label: 'Entretien normal',    pill: 'Entretien norm.', color: '#1F1F1F', bg: '#EFEFEF' },
  { v: 3, label: 'Entretien requis',    pill: 'Entretien requis',color: '#FF8466', bg: '#FFE4DB' },
  { v: 4, label: 'Remplacement requis', pill: 'Remplac. requis', color: '#E8492A', bg: '#FFE4DB' },
];

const RATING_NA = { v: null, key: 'na', label: 'Non applicable', pill: 'na', color: '#6B6B6B', bg: '#EFEFEF' };

function ratingInfo(v) {
  return RATINGS.find(r => r.v === v) || null;
}

/* ---------- Facettes ---------- */

const POSITIONS = [
  { v: 'AV',  label: 'Avant' },
  { v: 'GA',  label: 'Gauche' },
  { v: 'ARR', label: 'Arrière' },
  { v: 'DR',  label: 'Droite' },
];

const EMPLACEMENTS = [
  { v: 'corridors',    label: 'Corridors' },
  { v: 'escaliers',    label: 'Escaliers' },
  { v: 'stationnement',label: 'Stationnement' },
];

/* ---------- Gabarit de réponse : vocabulaire fermé, identique pour toutes les composantes ---------- */

const DELAIS = ['Immédiat (moins de 1 an)', 'Court terme (1 à 2 ans)', 'Moyen terme (3 à 5 ans)', 'Long terme (plus de 5 ans)', 'Aucun suivi particulier'];
const ETENDUES = [['ponctuel', 'Ponctuel'], ['localise', 'Localisé'], ['generalise', 'Généralisé']];
const LIMITES_OBS = [['de_pres', 'De près'], ['distance', 'À distance'], ['partiel', 'Partiellement accessible'], ['inaccessible', 'Non accessible']];
const RISQUES = [['securite', 'Sécurité des personnes'], ['infiltration', "Infiltration d'eau"], ['degradation', 'Dégradation accélérée'], ['conformite', 'Conformité réglementaire'], ['esthetique', 'Esthétique']];
const SOURCES_ANNEE = [['plaque', 'Plaque signalétique'], ['carnet', "Carnet d'entretien"], ['administration', 'Administration'], ['estimee', 'Estimée']];
const libelleDe = (liste, cle) => { const x = liste.find(([k]) => k === cle); return x ? x[1] : ''; };

const ATTR_SUGGESTIONS = ['Année', 'Marque', 'Modèle', 'Capacité', 'Nombre', "D'origine"];

/* ---------- Fiche d'immeuble ---------- */

const IMM_DOCS = [
  ['declaration_copropriete',   'Déclaration de copropriété'],
  ['certificat_localisation',   'Certificat de localisation'],
  ['plans_construction',        'Plans de construction'],
  ['plans_structure',           'Plans de structure'],
  ['plans_mecaniques',          'Plans mécaniques'],
  ['plan_amenagement_ext',      "Plan d'aménagement extérieur"],
  ['rapports_inspection',       "Rapports d'inspection / déficiences"],
  ['rapports_travaux',          'Rapports de travaux « grands projets »'],
  ['carnet_entretien',          "Carnet d'entretien"],
];

const IMM_CARACS = [
  { k: 'annee_construction',      q: 'Année de construction',                                       type: 'year' },
  { k: 'date_conversion',         q: 'Date de conversion (immeuble converti en copropriété)',       type: 'year' },
  { k: 'nb_stationnements_int',   q: "Combien y a-t-il d'espaces de stationnement intérieurs ?",     type: 'number' },
  { k: 'gicleurs',                q: "Y a-t-il présence d'un système de gicleurs ?",                 type: 'ouinon' },
  { k: 'gicleurs_ou',             q: 'Où ? (stationnement, RDC, étages)',                            type: 'text', sub: true },
  { k: 'unites_gicleurs',         q: 'Les unités sont-elles protégées par un système de gicleurs ?', type: 'ouinon' },
  { k: 'nb_ascenseurs',           q: "Combien y a-t-il de systèmes d'ascenseur ?",                   type: 'number' },
  { k: 'generatrice',             q: 'Y a-t-il une génératrice ?',                                   type: 'ouinon' },
  { k: 'generatrice_carburant',   q: 'Carburant de la génératrice',                                  type: 'choice', sub: true, choices: [['mazout', 'Mazout'], ['gaz_naturel', 'Gaz naturel']] },
  { k: 'piscine_interieure',      q: 'Y a-t-il une piscine intérieure ?',                             type: 'ouinon' },
  { k: 'piscine_exterieure',      q: 'Y a-t-il une piscine extérieure ?',                             type: 'ouinon' },
  { k: 'nb_terrasses_toiture',    q: 'Combien y a-t-il de terrasses au niveau toiture ?',            type: 'number' },
  { k: 'fenetres_privatives',     q: 'Les fenêtres sont-elles considérées privatives ?',             type: 'ouinon' },
  { k: 'portes_privatives',       q: 'Les portes sont-elles considérées privatives ?',               type: 'ouinon' },
  { k: 'portes_patio_privatives', q: 'Les portes-patio sont-elles considérées privatives ?',         type: 'ouinon' },
  { k: 'balcons_privatifs',       q: 'Les balcons sont-ils considérés privatifs ?',                  type: 'ouinon' },
  { k: 'elements_pcur',           q: 'Y a-t-il des éléments considérés PCUR ?',                      type: 'ouinon' },
  { k: 'cles_repartition_pcur',   q: 'Les clés de répartition PCUR sont-elles disponibles ?',        type: 'ouinon' },
  { k: 'acces_toiture',           q: 'Y a-t-il un accès sécuritaire à la toiture ?',                 type: 'ouinon' },
];

const IMM_REMPLACEMENTS = [
  ['pavage',            'Pavage'],
  ['revetement_toiture','Revêtement de toiture'],
  ['portes',            'Portes'],
  ['portes_patio',      'Portes-patio'],
  ['fenetres',          'Fenêtres'],
  ['calfeutrant',       'Calfeutrant'],
  ['balcons',           'Balcons'],
  ['revetement_ext_1',  'Revêtement extérieur 1'],
  ['revetement_ext_2',  'Revêtement extérieur 2'],
  ['autre_revetement',  'Autre revêtement'],
  ['autre_1',           'Autre 1'],
  ['autre_2',           'Autre 2'],
];

const IMM_ENTRETIENS = [
  ['cvac_communs',            'Chauffage / ventilation des espaces communs'],
  ['chauffage_stationnement', 'Chauffage des stationnements intérieurs'],
  ['ventilation_stationnement','Ventilation des stationnements intérieurs'],
  ['ventilation_secheuses',   'Ventilation « sorties sécheuses »'],
  ['evacuation_plomberie',    'Évacuation — plomberie sanitaire'],
  ['autre_systeme_1',         'Autre système 1'],
  ['autre_systeme_2',         'Autre système 2'],
];

const fmtCAD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const state = {
  screen: 'loading', // loading | login | dossiers | accueil | immeuble | liste | fiche | synthese
  token: null,
  user: null,
  online: navigator.onLine,
  error: null,
  toast: null,

  loginEmail: '',
  loginPassword: '',
  loginLoading: false,
  loginError: null,
  companyLogoUrl: null,

  dossiers: [],
  dossier: null,
  tacheForm: null,       // { x, f, q, mois: [] } — ajout d'une tâche au carnet
  components: [],        // composantes actives de la visite
  inactifs: [],          // composantes retirées de la visite, réactivables
  filter: 'all',
  search: '',

  activeId: null,
  activeComponent: null,
  ficheLoading: false,
  photoBlobUrls: {},
  uploadingPhoto: false,
  facetsOpen: false,
  naChosen: {},          // id -> true : « na » choisi dans la session courante
  attrKeyDraft: '',
  attrValDraft: '',

  analyzing: false,
  aiResult: null,

  recording: false,
  speechSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  noteDraft: '',

  batiment: {},          // contenu de dossiers.batiment_info

  projection: null,
  projectionLoading: false,
  downloadingDocx: false,
  downloadingXlsx: false,

  // Hors connexion
  envois: [],            // modifications en attente d'envoi (copie de la file IndexedDB)
  synchro: false,        // envoi de la file en cours
  reseauInstable: false, // le navigateur se dit en ligne, mais les requêtes échouent
  rejets: [],            // modifications refusées par le serveur à la synchronisation
  prepa: null,           // { dossierId, etat, faites, total, … } — visite préparée hors connexion
  photoIndispo: {},      // id -> true : photo absente de l'appareil et pas de réseau
};

try { state.token = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { state.token = null; }

const root = document.getElementById('app');

/* ============================================================
   Small helpers
   ============================================================ */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dossier';
}

function formatMoneyCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000000) {
    return (n / 1000000).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M$';
  }
  return fmtCAD.format(Math.round(n));
}

function toInt(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

let toastTimer = null;
function showToast(msg) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; render(); }, 2600);
}

function friendlyError(e) {
  if (!e) return 'Une erreur est survenue.';
  if (e.message === 'OFFLINE') return 'Vous êtes hors connexion.';
  if (e.message === 'SESSION_EXPIRED') return 'Votre session a expiré.';
  if (e.message === 'PAS_EN_CACHE') return "Ces données n'ont pas encore été téléchargées sur l'appareil. Ouvrez-les une fois avec du réseau pour les avoir hors connexion.";
  return e.message || 'Une erreur est survenue.';
}

// Écrit un statut d'enregistrement sans déclencher de re-rendu (préserve la saisie en cours).
let statusTimer = null;
function setSaveStatus(id, txt) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = txt;
  clearTimeout(statusTimer);
  if (txt) statusTimer = setTimeout(() => { const e2 = document.getElementById(id); if (e2) e2.textContent = ''; }, 2200);
}

/* ============================================================
   API layer
   ============================================================ */

async function apiFetch(path, opts, config) {
  opts = opts || {};
  config = config || {};
  const auth = config.auth !== false;
  if (!state.online) throw new Error('OFFLINE');
  const headers = Object.assign({}, opts.headers || {});
  if (auth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
  let res;
  // Un sous-sol ou un garage laisse souvent une connexion qui ne répond plus :
  // passé le délai, la requête compte comme hors connexion.
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const minuterie = ctrl ? setTimeout(() => ctrl.abort(), config.timeout || 20000) : null;
  try {
    res = await fetch(path, Object.assign({}, opts, { headers }, ctrl ? { signal: ctrl.signal } : {}));
  } catch (e) {
    const err = new Error('Erreur réseau. Vérifiez votre connexion.');
    err.reseau = true;
    throw err;
  } finally {
    if (minuterie) clearTimeout(minuterie);
  }
  if (auth && res.status === 401) {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    state.token = null; state.user = null; state.dossier = null; state.dossiers = []; state.components = []; state.inactifs = [];
    state.screen = 'login';
    state.loginError = 'Votre session a expiré. Reconnectez-vous.';
    render();
    throw new Error('SESSION_EXPIRED');
  }
  return res;
}

async function apiJson(path, opts, config) {
  const res = await apiFetch(path, opts, config);
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || `Erreur (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================================================
   Hors connexion : copies locales, file d'envois, synchronisation
   ------------------------------------------------------------
   Chaque lecture passe par le serveur quand c'est possible et garde une
   copie sur l'appareil ; sans réseau, la copie répond. Chaque
   modification faite sans réseau entre dans une file, rejouée dans
   l'ordre au retour de la connexion. Tant que la file n'est pas vide,
   les nouvelles modifications s'y ajoutent aussi, pour qu'une ancienne
   valeur ne passe jamais après une plus récente.
   ============================================================ */

function sansReseau(e) {
  return !!e && (e.message === 'OFFLINE' || e.reseau === true);
}

async function lireApi(cle, path, config) {
  try {
    const data = await apiJson(path, null, config);
    HL.ecrire(cle, data);
    state.reseauInstable = false;
    return data;
  } catch (e) {
    if (!sansReseau(e)) throw e;
    if (state.online) state.reseauInstable = true;
    const copie = await HL.lire(cle);
    if (copie == null) throw new Error('PAS_EN_CACHE');
    return copie;
  }
}

let envoiEnCours = null;

async function chargerEnvois() {
  state.envois = await HL.envoisTous();
}

async function enfiler(op) {
  op.userId = state.user && state.user.id;
  if (!op.dossierId && state.dossier) op.dossierId = state.dossier.id;
  op.cree_le = new Date().toISOString();
  // Une modification du même objet encore en attente absorbe la nouvelle :
  // une seule requête partira au retour du réseau.
  if (op.kind === 'patch-component' || op.kind === 'patch-dossier') {
    for (let i = state.envois.length - 1; i >= 0; i--) {
      const a = state.envois[i];
      if (a.kind === op.kind && a.id === op.id && a.n !== envoiEnCours) {
        a.body = Object.assign({}, a.body, op.body);
        await HL.envoiRemplacer(a);
        paintNetBar();
        return a;
      }
    }
  }
  const enregistre = await HL.envoiAjouter(op);
  // Sans IndexedDB, la file vit en mémoire : elle tient jusqu'au rechargement.
  state.envois.push(enregistre || Object.assign(op, { n: Date.now() + Math.random() }));
  paintNetBar();
  return enregistre || op;
}

async function retirerEnvoi(n) {
  state.envois = state.envois.filter(o => o.n !== n);
  await HL.envoiRetirer(n);
}

// Les modifications en attente, appliquées par-dessus la copie du serveur.
function avecEnAttente(comp) {
  let c = Object.assign({}, comp);
  for (const op of state.envois) {
    if (op.kind === 'patch-component' && op.id === c.id) {
      const entretien = op.body.taches_entretien != null && Array.isArray(c.entretien)
        ? { entretien: entretienLocal(c.entretien, op.body.taches_entretien) } : {};
      c = Object.assign(c, op.body, entretien);
    } else if (op.kind === 'photo' && op.componentId === c.id) {
      if (Array.isArray(c.photos)) {
        if (!c.photos.some(p => p.id === op.photoId)) c.photos = c.photos.concat([{ id: op.photoId, component_id: c.id, tag: "En attente d'envoi", local: true }]);
      } else {
        c.photos = (c.photos || 0) + 1;
      }
    }
  }
  return c;
}

function dossierAvecEnAttente(d) {
  const r = Object.assign({}, d);
  for (const op of state.envois) if (op.kind === 'patch-dossier' && op.id === d.id) Object.assign(r, op.body);
  return r;
}

// Tâches du carnet recalculées sur l'appareil après un retrait, un
// rétablissement ou un ajout fait hors connexion. Le serveur refait le
// calcul exact à la synchronisation.
function entretienLocal(entretien, persoBrut) {
  const p = parseJsonObject(persoBrut);
  const retirees = new Set(Array.isArray(p.retirees) ? p.retirees : []);
  const ajoutees = Array.isArray(p.ajoutees) ? p.ajoutees : [];
  const idsAjoutees = new Set(ajoutees.map(t => t.id));
  const liste = entretien
    .filter(t => !t.perso || idsAjoutees.has(t.id))
    .map(t => (t.perso ? t : Object.assign({}, t, { retiree: retirees.has(t.id) })));
  for (const t of ajoutees) if (!liste.some(x => x.id === t.id)) liste.push(tacheLocale(t));
  return liste;
}
function tacheLocale(t) {
  const mois = (t.mois || []).map(Number).sort((a, b) => a - b);
  const freq = FREQ_TACHE.find(f => f[0] === t.f);
  const qui = QUI_TACHE.find(q => q[0] === (t.q || ''));
  return {
    id: t.id, texte: t.x, element: '', code: t.f, mois,
    frequence: freq ? freq[1] : 'Aux mois indiqués',
    quand: mois.map(m => MOIS_COURTS[m - 1]).join(', '),
    responsable: qui ? qui[1] : 'Syndicat / gestionnaire',
    perso: true, retiree: false, aPreciser: false,
  };
}

function idAleatoire(prefixe, n, alphabet) {
  const octets = new Uint8Array(n);
  crypto.getRandomValues(octets);
  return prefixe + Array.from(octets, b => alphabet[b % alphabet.length]).join('');
}
const nouvelIdPhoto = () => idAleatoire('pho_', 20, '0123456789abcdef');
const nouvelIdTache = () => idAleatoire('p_', 10, 'abcdefghijklmnopqrstuvwxyz0123456789');

// Copie locale d'une composante et de sa ligne dans la liste du dossier,
// mises à jour avec ce que le serveur vient de confirmer.
async function fusionnerCacheComposante(id, champs, dossierId) {
  if (!champs || typeof champs !== 'object') return;
  const cle = `component:${id}`;
  const actuelle = await HL.lire(cle);
  if (actuelle) await HL.ecrire(cle, Object.assign({}, actuelle, champs, { photos: actuelle.photos, guide: actuelle.guide }));
  const cleListe = `components:${dossierId || champs.dossier_id || (state.dossier && state.dossier.id)}`;
  const liste = await HL.lire(cleListe);
  if (Array.isArray(liste)) {
    const i = liste.findIndex(x => x.id === id);
    if (i >= 0) {
      const { photos, guide, entretien, ...ligne } = champs;
      liste[i] = Object.assign({}, liste[i], ligne, typeof photos === 'number' ? { photos } : {});
      await HL.ecrire(cleListe, liste);
    }
  }
}

async function ajouterPhotoAuCache(compId, photo, dossierId) {
  const cle = `component:${compId}`;
  const comp = await HL.lire(cle);
  if (comp && Array.isArray(comp.photos) && !comp.photos.some(p => p.id === photo.id)) {
    comp.photos.push(photo);
    await HL.ecrire(cle, comp);
  }
  const cleListe = `components:${dossierId}`;
  const liste = await HL.lire(cleListe);
  if (Array.isArray(liste)) {
    const ligne = liste.find(x => x.id === compId);
    if (ligne) { ligne.photos = (ligne.photos || 0) + 1; await HL.ecrire(cleListe, liste); }
  }
}

async function envoyerPhoto(compId, photoId, blob, dossierId) {
  const fd = new FormData();
  fd.append('id', photoId);
  fd.append('file', blob, (blob && blob.name) || 'photo.jpg');
  const res = await apiFetch(`/api/components/${compId}/photos`, { method: 'POST', body: fd }, { timeout: 90000 });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Le téléversement de la photo a échoué.');
    err.status = res.status;
    throw err;
  }
  await ajouterPhotoAuCache(compId, data, dossierId);
  return data;
}

function descriptionEnvoi(op) {
  if (op.kind === 'photo') return 'Photo';
  if (op.kind === 'patch-dossier') return "Fiche d'immeuble";
  const c = state.components.concat(state.inactifs).find(x => x.id === op.id);
  return c ? c.name : 'Composante';
}

async function executerEnvoi(op) {
  if (op.kind === 'patch-component') {
    const data = await apiJson(`/api/components/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.body),
    }, { timeout: 20000 });
    await fusionnerCacheComposante(op.id, data, op.dossierId);
    // Les tâches du carnet recalculées par le serveur remplacent le calcul
    // local, sauf si une autre modification du carnet attend encore.
    const autre = state.envois.some(o => o.n !== op.n && o.kind === 'patch-component' && o.id === op.id && o.body.taches_entretien != null);
    if (data && data.entretien && !autre && state.activeComponent && state.activeComponent.id === op.id) {
      state.activeComponent = Object.assign({}, state.activeComponent, { entretien: data.entretien });
    }
    return;
  }
  if (op.kind === 'patch-dossier') {
    const data = await apiJson(`/api/dossiers/${op.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.body),
    }, { timeout: 20000 });
    if (data) await HL.ecrire(`dossier:${op.id}`, data);
    return;
  }
  if (op.kind === 'photo') {
    const blob = await HL.photoLire(op.photoId);
    if (!blob) return; // fichier disparu de l'appareil : rien à envoyer
    const photo = await envoyerPhoto(op.componentId, op.photoId, blob, op.dossierId);
    const c = state.activeComponent;
    if (c && c.id === op.componentId && Array.isArray(c.photos)) {
      state.activeComponent = Object.assign({}, c, { photos: c.photos.map(p => (p.id === photo.id ? photo : p)) });
    }
  }
}

let synchroEnCours = false;
async function synchroniser() {
  if (synchroEnCours || !state.online || !state.token || !state.envois.length) return;
  synchroEnCours = true;
  state.synchro = true;
  paintNetBar();
  const touches = new Set();
  let envoyes = 0;
  try {
    while (state.envois.length && state.online) {
      const op = state.envois[0];
      if (op.userId && state.user && op.userId !== state.user.id) { await retirerEnvoi(op.n); continue; }
      envoiEnCours = op.n;
      try {
        await executerEnvoi(op);
      } catch (e) {
        envoiEnCours = null;
        if (sansReseau(e)) { state.reseauInstable = true; break; }
        if (e.message === 'SESSION_EXPIRED') break;
        // Refus définitif (composante supprimée, valeur invalide…) : on le
        // signale et on passe à la suite plutôt que de bloquer toute la file.
        if (e.status >= 400 && e.status < 500 && ![408, 425, 429].includes(e.status)) {
          state.rejets.push(`${descriptionEnvoi(op)} : ${e.message}`);
          await retirerEnvoi(op.n);
          continue;
        }
        break; // erreur du serveur : on réessaiera plus tard
      }
      envoiEnCours = null;
      await retirerEnvoi(op.n);
      envoyes += 1;
      if (op.dossierId) touches.add(op.dossierId);
      state.reseauInstable = false;
      paintNetBar();
    }
  } finally {
    envoiEnCours = null;
    synchroEnCours = false;
    state.synchro = false;
  }
  if (envoyes && state.dossier && touches.has(state.dossier.id)) await rafraichirDossier();
  if (envoyes && !state.envois.length) state.toast = 'Modifications hors connexion envoyées';
  renderSiPossible();
  if (state.toast === 'Modifications hors connexion envoyées') {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; renderSiPossible(); }, 2600);
  }
}

// Après une synchronisation : la liste et le dossier tels que le serveur les
// voit maintenant (règles de la fiche d'immeuble, tâches recalculées…).
async function rafraichirDossier() {
  const id = state.dossier && state.dossier.id;
  if (!id) return;
  try {
    const [dossier, components] = await Promise.all([
      apiJson(`/api/dossiers/${id}`),
      apiJson(`/api/dossiers/${id}/components`),
    ]);
    HL.ecrire(`dossier:${id}`, dossier);
    HL.ecrire(`components:${id}`, components);
    if (!state.dossier || state.dossier.id !== id) return;
    state.dossier = dossierAvecEnAttente(dossier);
    state.batiment = parseJsonObject(state.dossier.batiment_info);
    const tous = components.map(avecEnAttente);
    state.components = tous.filter(c => c.actif !== 0);
    state.inactifs = tous.filter(c => c.actif === 0);
  } catch (e) { /* on garde l'affichage actuel */ }
}

// Toute la visite sur l'appareil : fiches complètes et photos, en arrière-plan.
let prepaEnCours = null;
async function preparerHorsLigne(id) {
  if (prepaEnCours === id || !state.online) return;
  prepaEnCours = id;
  const maj = (p) => {
    if (state.dossier && state.dossier.id === id) { state.prepa = p; paintPrepa(); }
  };
  try {
    maj({ dossierId: id, etat: 'fiches' });
    const lot = await apiJson(`/api/dossiers/${id}/hors-ligne`, null, { timeout: 60000 });
    await HL.ecrireLot(lot.composantes.map(c => [`component:${c.id}`, c]));
    const photos = lot.composantes.flatMap(c => c.photos || []);
    const presentes = await HL.photosPresentes();
    const manquantes = photos.filter(p => !presentes.has(p.id));
    let faites = photos.length - manquantes.length;
    maj({ dossierId: id, etat: 'photos', faites, total: photos.length });
    let i = 0;
    const travailleur = async () => {
      while (i < manquantes.length && state.online) {
        const p = manquantes[i++];
        try {
          const res = await apiFetch(`/api/photos/${p.id}/file`, null, { timeout: 45000 });
          if (res.ok) { await HL.photoEcrire(p.id, await res.blob()); faites += 1; }
        } catch (e) { /* photo réessayée à la prochaine préparation */ }
        maj({ dossierId: id, etat: 'photos', faites, total: photos.length });
      }
    };
    await Promise.all([travailleur(), travailleur(), travailleur()]);
    const fin = {
      dossierId: id, etat: faites >= photos.length ? 'pret' : 'partiel',
      faites, total: photos.length, fiches: lot.composantes.length, le: new Date().toISOString(),
    };
    await HL.ecrire(`prepa:${id}`, fin);
    maj(fin);
  } catch (e) {
    maj(Object.assign({}, state.prepa && state.prepa.le ? state.prepa : {}, { dossierId: id, etat: 'erreur' }));
  } finally {
    prepaEnCours = null;
  }
}

function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* l'application reste utilisable en ligne */ });
}

async function loadCompanyLogo() {
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  const co = state.user && state.user.company;
  if (!co || !co.hasLogo) { render(); return; }
  let blob = null;
  try {
    const res = await apiFetch(`/api/companies/${co.id}/logo`);
    if (!res.ok) throw new Error('logo indisponible');
    blob = await res.blob();
    HL.photoEcrire(`logo:${co.id}`, blob);
  } catch (e) {
    blob = await HL.photoLire(`logo:${co.id}`);
  }
  state.companyLogoUrl = blob ? URL.createObjectURL(blob) : null;
  render();
}

/* ============================================================
   Boot / auth / dossiers
   ============================================================ */

async function boot() {
  enregistrerServiceWorker();
  await chargerEnvois();
  if (state.token) {
    state.screen = 'loading';
    render();
    try {
      state.user = await lireApi('me', '/api/auth/me');
      loadCompanyLogo();
      await loadDossiers();
      synchroniser();
    } catch (e) {
      if (e.message !== 'SESSION_EXPIRED') {
        state.screen = 'login';
        if (e.message === 'PAS_EN_CACHE') state.loginError = "Connectez-vous une première fois avec du réseau pour utiliser l'application hors connexion.";
        render();
      }
    }
  } else {
    state.screen = 'login';
    render();
  }
}

async function doLogin(email, password) {
  if (!state.online) { state.loginError = 'Vous êtes hors connexion.'; render(); return; }
  state.loginLoading = true; state.loginError = null; render();
  try {
    const data = await apiJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, { auth: false });
    state.token = data.token; state.user = data.user;
    try { localStorage.setItem(TOKEN_KEY, data.token); } catch (e) {}
    const precedent = await HL.lire('me');
    if (precedent && data.user && precedent.id !== data.user.id) {
      await HL.toutEffacer();
      state.envois = [];
    }
    if (data.user) HL.ecrire('me', data.user);
    loadCompanyLogo();
    await loadDossiers();
    synchroniser();
  } catch (e) {
    state.loginError = friendlyError(e);
    state.loginPassword = '';
  } finally {
    state.loginLoading = false; render();
  }
}

async function logout() {
  const n = state.envois.length;
  if (n && !confirm(`${n} modification${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} hors connexion ${n > 1 ? "n'ont" : "n'a"} pas encore été envoyée${n > 1 ? 's' : ''}. Vous déconnecter l${n > 1 ? 'es' : 'a'} effacera de cet appareil. Continuer ?`)) return;
  // Les données de visite ne restent pas sur l'appareil après la déconnexion.
  await HL.toutEffacer();
  state.envois = [];
  state.prepa = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  Object.assign(state, {
    token: null, user: null, dossier: null, dossiers: [], components: [],
    activeComponent: null, activeId: null, projection: null, error: null,
    batiment: {}, naChosen: {}, loginError: null, screen: 'login',
  });
  render();
}

async function loadDossiers() {
  state.screen = 'loading'; state.error = null; render();
  try {
    const dossiers = await lireApi('dossiers', '/api/dossiers');
    state.dossiers = dossiers;
    if (dossiers.length === 1) {
      await selectDossier(dossiers[0].id);
      return;
    }
    state.screen = 'dossiers';
    render();
  } catch (e) {
    if (e.message === 'PAS_EN_CACHE') {
      state.dossiers = []; state.error = friendlyError(e); state.screen = 'dossiers'; render();
      return;
    }
    if (e.message !== 'SESSION_EXPIRED') {
      state.screen = 'login';
      state.loginError = friendlyError(e);
      render();
    }
  }
}

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(raw);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}

async function selectDossier(id) {
  state.screen = 'loading'; render();
  try {
    const [dossierBrut, componentsBruts] = await Promise.all([
      lireApi(`dossier:${id}`, `/api/dossiers/${id}`),
      lireApi(`components:${id}`, `/api/dossiers/${id}/components`),
    ]);
    const dossier = dossierAvecEnAttente(dossierBrut);
    const components = componentsBruts.map(avecEnAttente);
    state.dossier = dossier;
    state.components = components.filter(c => c.actif !== 0);
    state.inactifs = components.filter(c => c.actif === 0);
    state.batiment = parseJsonObject(dossier.batiment_info);
    state.naChosen = {};
    state.filter = 'all'; state.search = '';
    state.prepa = (await HL.lire(`prepa:${id}`)) || null;
    state.screen = 'accueil';
    render();
    loadProjection(id);
    if (state.online) preparerHorsLigne(id);
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') {
      state.error = friendlyError(e);
      state.screen = 'dossiers';
      render();
    }
  }
}

async function loadProjection(id) {
  state.projectionLoading = true; render();
  try {
    state.projection = await lireApi(`projection:${id}`, `/api/dossiers/${id}/projection`);
  } catch (e) {
    state.projection = null;
  } finally {
    state.projectionLoading = false; render();
  }
}

/* ============================================================
   Fiche (component detail)
   ============================================================ */

async function openFiche(id) {
  state.activeId = id; state.screen = 'fiche'; state.aiResult = null;
  state.analyzing = false; state.recording = false; state.noteDraft = ''; state.tacheForm = null;
  state.ficheLoading = true; state.activeComponent = null; state.error = null;
  state.attrKeyDraft = ''; state.attrValDraft = ''; state.facetsOpen = false;
  render();
  try {
    const comp = avecEnAttente(await lireApi(`component:${id}`, `/api/components/${id}`));
    state.activeComponent = comp;
    state.facetsOpen = !!(comp.position || comp.emplacement || comp.variante);
    state.ficheLoading = false;
    render();
    loadPhotoBlobs(comp.photos || []);
  } catch (e) {
    state.ficheLoading = false;
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
  }
}

async function loadPhotoBlobs(photos) {
  for (const p of photos) {
    if (state.photoBlobUrls[p.id]) continue;
    // La copie de l'appareil d'abord : elle s'affiche sans réseau.
    let blob = await HL.photoLire(p.id);
    if (!blob && !p.local && state.online) {
      try {
        const res = await apiFetch(`/api/photos/${p.id}/file`);
        if (res.ok) { blob = await res.blob(); HL.photoEcrire(p.id, blob); }
      } catch (e) { /* ignore individual photo failures */ }
    }
    if (blob) {
      state.photoBlobUrls[p.id] = URL.createObjectURL(blob);
      delete state.photoIndispo[p.id];
    } else if (!state.online || state.reseauInstable) {
      state.photoIndispo[p.id] = true;
    }
    renderSiPossible();
  }
}

function applyComponentPatch(id, patch) {
  const appliquer = (c) => {
    const suivant = Object.assign({}, c, patch);
    if (patch.taches_entretien != null && !patch.entretien && Array.isArray(c.entretien)) {
      suivant.entretien = entretienLocal(c.entretien, patch.taches_entretien);
    }
    return suivant;
  };
  if (state.activeComponent && state.activeComponent.id === id) {
    state.activeComponent = appliquer(state.activeComponent);
  }
  state.components = state.components.map(c => (c.id === id ? appliquer(c) : c));
}

// Rend la réponse du serveur, ou { enAttente: true } quand la modification
// est gardée sur l'appareil pour être envoyée plus tard.
async function patchComponent(id, patch) {
  const garder = async () => {
    await enfiler({ kind: 'patch-component', id, body: patch });
    applyComponentPatch(id, patch);
    synchroniser();
    return { enAttente: true };
  };
  if (!state.online || state.envois.length) return garder();
  try {
    const data = await apiJson(`/api/components/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }, { timeout: 15000 });
    const merged = Object.assign({}, patch, (data && typeof data === 'object') ? data : {});
    applyComponentPatch(id, merged);
    state.reseauInstable = false;
    fusionnerCacheComposante(id, data);
    return merged;
  } catch (e) {
    if (sansReseau(e)) { state.reseauInstable = true; return garder(); }
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
    throw e;
  }
}

// Retire une composante de la visite (elle n'existe pas dans l'immeuble) ou l'y
// remet. Elle n'est jamais supprimée : ses données restent si on la réactive.
async function setActif(id, actif) {
  try {
    await patchComponent(id, { actif: actif ? 1 : 0 });
  } catch (e) { return; }
  const tous = state.components.concat(state.inactifs).map(c => (c.id === id ? Object.assign({}, c, { actif: actif ? 1 : 0 }) : c));
  const ordre = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  state.components = tous.filter(c => c.actif !== 0).sort(ordre);
  state.inactifs = tous.filter(c => c.actif === 0).sort(ordre);
  if (actif) {
    showToast('Composante réactivée');
    if (!state.inactifs.length && state.filter === 'inactifs') state.filter = 'all';
  } else {
    showToast('Composante retirée de la visite');
    state.screen = 'liste';
  }
  render();
}

// Enregistrement d'un champ de composante. Applique la valeur localement de façon
// synchrone (pour qu'un re-rendu déclenché entre-temps ne perde pas la saisie),
// puis pousse le PATCH.
function saveCompField(field, value, opts) {
  const id = state.activeId;
  if (!id || !state.activeComponent) return false;
  const force = !!(opts && opts.force);
  const cur = state.activeComponent[field];
  const same = (cur == null ? '' : String(cur)) === (value == null ? '' : String(value));
  if (same && !force) return false;
  const patch = {}; patch[field] = value;
  applyComponentPatch(id, patch);
  setSaveStatus('ficheStatus', 'Enregistrement…');
  patchComponent(id, patch)
    .then((r) => setSaveStatus('ficheStatus', r && r.enAttente ? "Gardé sur l'appareil" : 'Enregistré'))
    .catch(() => setSaveStatus('ficheStatus', ''));
  return true;
}

function onRatingClick(raw) {
  if (!state.activeComponent) return;
  const isNa = raw === 'na';
  const value = isNa ? null : toInt(raw);
  if (isNa) state.naChosen[state.activeId] = true;
  else delete state.naChosen[state.activeId];
  saveCompField('rating', value, { force: true });
  render();
}

function onRflagClick() {
  const c = state.activeComponent;
  if (!c) return;
  if (saveCompField('r_flag', c.r_flag ? 0 : 1, { force: true })) render();
}

function onFacetClick(field, value) {
  const c = state.activeComponent;
  if (!c) return;
  const next = (c[field] === value) ? null : value;
  if (saveCompField(field, next, { force: true })) render();
}

function onYearBlur(e) {
  if (!state.activeComponent) return;
  const v = e.target.value.trim();
  let payload;
  if (v === '') payload = null;
  else if (/^\d{4}$/.test(v)) payload = parseInt(v, 10);
  else payload = v;
  if (saveCompField('install_year', payload)) render();
}

function onNumberBlur(field, e) {
  if (!state.activeComponent) return;
  const v = toInt(e.target.value);
  if (saveCompField(field, v)) render();
}

/* ---------- attributs ---------- */

function componentAttrs(c) {
  return parseJsonObject(c && c.attributs);
}

function saveAttrs(obj) {
  const keys = Object.keys(obj);
  const payload = keys.length ? JSON.stringify(obj) : null;
  return saveCompField('attributs', payload, { force: true });
}

function onAttrAdd() {
  const c = state.activeComponent;
  if (!c) return;
  const k = (state.attrKeyDraft || '').trim();
  const v = (state.attrValDraft || '').trim();
  if (!k) { showToast('Nommez le champ à ajouter.'); return; }
  const attrs = componentAttrs(c);
  attrs[k] = v;
  if (saveAttrs(attrs)) { state.attrKeyDraft = ''; state.attrValDraft = ''; render(); }
}

function onAttrDelete(key) {
  const c = state.activeComponent;
  if (!c) return;
  const attrs = componentAttrs(c);
  delete attrs[key];
  if (saveAttrs(attrs)) render();
}

function onAttrValueBlur(key, e) {
  const c = state.activeComponent;
  if (!c) return;
  const attrs = componentAttrs(c);
  const v = e.target.value;
  if ((attrs[key] == null ? '' : String(attrs[key])) === v) return;
  attrs[key] = v;
  saveAttrs(attrs);
}

/* ---------- photos ---------- */

function triggerPhotoInput() {
  const input = document.getElementById('photoFileInput');
  if (input) input.click();
}

// Réduit une photo de téléphone (souvent 3 à 5 Mo) à 1600 px de côté en JPEG
// avant l'envoi : le rapport Word les intègre toutes, et un Worker n'a que
// 128 Mo de mémoire. En cas d'échec (format non décodable), l'original part.
async function reduirePhoto(file) {
  const COTE_MAX = 1600;
  try {
    if (!window.createImageBitmap || !file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
    if (echelle === 1 && file.size < 700 * 1024 && file.type === 'image/jpeg') { bitmap.close && bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close && bitmap.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) return file;
    return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (err) {
    return file;
  }
}

async function onPhotoFileChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file || !state.activeId) return;
  const compId = state.activeId;
  const dossierId = state.dossier && state.dossier.id;
  state.uploadingPhoto = true; state.error = null; render();
  const photo = await reduirePhoto(file);
  // Choisi par l'appareil : l'envoi peut être rejoué sans créer de doublon.
  const photoId = nouvelIdPhoto();
  await HL.photoEcrire(photoId, photo);
  state.photoBlobUrls[photoId] = URL.createObjectURL(photo);
  let envoyee = null;
  if (state.online && !state.envois.length) {
    try {
      envoyee = await envoyerPhoto(compId, photoId, photo, dossierId);
      state.reseauInstable = false;
    } catch (e2) {
      if (!sansReseau(e2)) {
        state.uploadingPhoto = false;
        HL.photoEffacer(photoId);
        if (e2.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e2); render(); }
        return;
      }
      state.reseauInstable = true;
    }
  }
  if (!envoyee) await enfiler({ kind: 'photo', componentId: compId, photoId, dossierId });
  const affichee = envoyee || { id: photoId, component_id: compId, tag: "En attente d'envoi", local: true };
  if (state.activeComponent && state.activeComponent.id === compId) {
    state.activeComponent = Object.assign({}, state.activeComponent, { photos: (state.activeComponent.photos || []).concat([affichee]) });
  }
  state.components = state.components.map(c => (c.id === compId ? Object.assign({}, c, { photos: (c.photos || 0) + 1 }) : c));
  state.uploadingPhoto = false;
  render();
  if (!envoyee) synchroniser();
}

/* ---------- AI analyze ---------- */

async function analyze() {
  if (state.analyzing || !state.activeId) return;
  if (!state.online) { showToast('Analyse indisponible hors connexion.'); return; }
  state.analyzing = true; state.error = null; render();
  try {
    const result = await apiJson(`/api/components/${state.activeId}/analyze`, { method: 'POST' });
    state.aiResult = result;
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') state.error = friendlyError(e);
  } finally {
    state.analyzing = false; render();
  }
}

function parseCostEstimate(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : Math.round(v);
  const cleaned = String(v).replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned.replace(/\s/g, '').replace(/,(\d{3})/g, '$1').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n);
}

async function applyAi() {
  if (!state.aiResult || !state.activeId) return;
  const r = state.aiResult;
  const patch = {};
  if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 4) patch.rating = r.rating;
  if (typeof r.observation === 'string' && r.observation.trim()) patch.observation = r.observation.trim();
  if (typeof r.causePossible === 'string' && r.causePossible.trim()) patch.cause_possible = r.causePossible.trim();
  if (typeof r.delaiSuggere === 'string' && DELAIS.includes(r.delaiSuggere)) patch.delai_suggere = r.delaiSuggere;
  if (r.etendue && libelleDe(ETENDUES, r.etendue)) patch.etendue = r.etendue;
  if (typeof r.etendueQte === 'string' && r.etendueQte.trim()) patch.etendue_qte = r.etendueQte.trim();
  if (r.limiteObservation && libelleDe(LIMITES_OBS, r.limiteObservation)) patch.limite_observation = r.limiteObservation;
  if (r.natureRisque && libelleDe(RISQUES, r.natureRisque)) patch.nature_risque = r.natureRisque;
  if (typeof r.consequences === 'string' && r.consequences.trim()) patch.consequences = r.consequences.trim();
  if (typeof r.costEstimate === 'number' && !isNaN(r.costEstimate)) patch.replacement_cost = Math.round(r.costEstimate);
  if (!Object.keys(patch).length) { state.aiResult = null; showToast('Rien à appliquer.'); return; }
  applyComponentPatch(state.activeId, patch);
  state.aiResult = null;
  render();
  try { await patchComponent(state.activeId, patch); } catch (e) { /* error already surfaced */ }
}

/* ---------- voice note ---------- */

let recognition = null;

function toggleVoice() {
  if (!state.speechSupported || !state.activeId) return;
  if (state.recording) {
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    return;
  }
  if (!state.online) { showToast('Micro indisponible hors connexion.'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'fr-CA';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let transcript = '';
  recognition.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript + ' ';
  };
  recognition.onerror = () => {
    state.recording = false;
    state.error = 'La reconnaissance vocale a échoué. Réessayez.';
    render();
  };
  recognition.onend = () => {
    state.recording = false; render();
    const t = transcript.trim();
    if (t) submitTranscript(t);
  };
  state.recording = true; state.error = null; render();
  try { recognition.start(); } catch (e) { state.recording = false; render(); }
}

async function submitTranscript(transcript) {
  try {
    const data = await apiJson(`/api/components/${state.activeId}/structure-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    applyComponentPatch(state.activeId, { note: data.note });
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') state.error = friendlyError(e);
  }
  render();
}

function onNoteFallbackSend() {
  const val = (state.noteDraft || '').trim();
  if (!val) return;
  // Sans réseau, l'IA ne peut pas mettre la note en forme : elle est
  // ajoutée telle quelle, et gardée sur l'appareil.
  if (!state.online) {
    const c = state.activeComponent;
    state.noteDraft = '';
    saveCompField('note', c && c.note ? `${c.note}\n${val}` : val, { force: true });
    showToast("Note ajoutée telle quelle (la mise en forme par l'IA demande du réseau)");
    return;
  }
  state.noteDraft = '';
  render();
  submitTranscript(val);
}

async function saveFiche() {
  if (!state.activeId) return;
  const id = state.activeId;
  applyComponentPatch(id, { done: 1 });
  state.screen = 'liste';
  render();
  try { await patchComponent(id, { done: 1 }); } catch (e) { /* error already surfaced */ }
}

/* ============================================================
   Fiche d'immeuble
   ============================================================ */

function immGet(sec, key) {
  const s = state.batiment && state.batiment[sec];
  const v = s ? s[key] : null;
  return v == null ? '' : v;
}

function immSetLocal(sec, key, val) {
  if (!state.batiment || typeof state.batiment !== 'object') state.batiment = {};
  if (!state.batiment[sec]) state.batiment[sec] = {};
  if (val === '' || val == null) delete state.batiment[sec][key];
  else state.batiment[sec][key] = val;
  if (!Object.keys(state.batiment[sec]).length) delete state.batiment[sec];
}

// Une réponse de la fiche d'immeuble (« piscine extérieure : non », nombre
// d'ascenseurs…) peut activer ou désactiver des composantes côté serveur :
// on recharge alors la liste pour que l'écran suive.
async function suivreRegles(data) {
  const n = data && data.composantes_mises_a_jour;
  if (!n || !state.dossier) return;
  try {
    const components = await apiJson(`/api/dossiers/${state.dossier.id}/components`);
    state.components = components.filter(c => c.actif !== 0);
    state.inactifs = components.filter(c => c.actif === 0);
    showToast(`${n} composante${n > 1 ? 's' : ''} ajustée${n > 1 ? 's' : ''} selon la fiche d'immeuble`);
    render();
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
  }
}

// Rend la réponse du serveur, ou { enAttente: true } si la modification est
// gardée sur l'appareil.
async function patchDossier(body) {
  const id = state.dossier.id;
  const garder = async () => {
    await enfiler({ kind: 'patch-dossier', id, body, dossierId: id });
    state.dossier = Object.assign({}, state.dossier, body);
    synchroniser();
    return { enAttente: true };
  };
  if (!state.online || state.envois.length) return garder();
  try {
    const data = await apiJson(`/api/dossiers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { timeout: 15000 });
    state.dossier = Object.assign({}, state.dossier, body, (data && typeof data === 'object') ? data : {});
    if (data) HL.ecrire(`dossier:${id}`, data);
    state.reseauInstable = false;
    return data || {};
  } catch (e) {
    if (sansReseau(e)) { state.reseauInstable = true; return garder(); }
    throw e;
  }
}

async function saveBatiment() {
  if (!state.dossier) return;
  setSaveStatus('immStatus', 'Enregistrement…');
  try {
    const data = await patchDossier({ batiment_info: JSON.stringify(state.batiment || {}) });
    setSaveStatus('immStatus', data.enAttente ? "Gardé sur l'appareil" : 'Enregistré');
    if (!data.enAttente) await suivreRegles(data);
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
    setSaveStatus('immStatus', '');
  }
}

function onImmChoice(sec, key, val) {
  const cur = immGet(sec, key);
  immSetLocal(sec, key, cur === val ? '' : val);
  render();
  saveBatiment();
}

function onImmTextBlur(sec, key, e) {
  const v = e.target.value.trim();
  if (String(immGet(sec, key)) === v) return;
  immSetLocal(sec, key, v);
  saveBatiment();
}

async function saveDossierField(field, value) {
  if (!state.dossier) return;
  setSaveStatus('immStatus', 'Enregistrement…');
  try {
    const patch = {}; patch[field] = value;
    const data = await patchDossier(patch);
    setSaveStatus('immStatus', data.enAttente ? "Gardé sur l'appareil" : 'Enregistré');
    if (!data.enAttente) await suivreRegles(data);
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
    setSaveStatus('immStatus', '');
  }
}

function onDossierNumberBlur(field, e) {
  if (!state.dossier) return;
  const v = toInt(e.target.value);
  const cur = state.dossier[field] == null ? null : toInt(state.dossier[field]);
  if (v === cur) return;
  saveDossierField(field, v);
}

/* ============================================================
   Derived view data
   ============================================================ */

function replacementYear(c) {
  const yr = toInt(c && c.install_year);
  const vu = toInt(c && c.useful_life_years);
  if (!yr || !vu) return null;
  const year = yr + vu;
  return { year, delta: year - new Date().getFullYear() };
}

function computeStats() {
  const comps = state.components;
  const total = comps.length;
  const done = comps.filter(c => c.done).length;
  const todo = total - done;
  const critical = comps.filter(c => c.done && c.rating >= 3).length;
  const photosTotal = comps.reduce((a, c) => a + (typeof c.photos === 'number' ? c.photos : (c.photos ? c.photos.length : 0)), 0);
  return { total, done, todo, critical, photosTotal, pct: total ? Math.round((done / total) * 100) : 0 };
}

function filteredComponents() {
  const f = state.filter, q = state.search.trim().toLowerCase();
  return state.components.filter(c => {
    if (f === 'todo' && c.done) return false;
    if (f === 'done' && !c.done) return false;
    if (f === 'action' && !(c.done && c.rating >= 3)) return false;
    if (q) {
      const hay = `${c.name || ''} ${c.uniformat_code || ''} ${c.variante || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function facetSuffix(c) {
  const bits = [];
  if (c.variante) bits.push(c.variante);
  if (c.position) bits.push(c.position);
  if (c.emplacement) {
    const e = EMPLACEMENTS.find(x => x.v === c.emplacement);
    bits.push(e ? e.label : c.emplacement);
  }
  return bits.join(' · ');
}

function rowVals(c) {
  const info = catInfo(c.cat);
  const photoCount = typeof c.photos === 'number' ? c.photos : (c.photos ? c.photos.length : 0);
  let statusLabel, statusColor, statusBg, thumbBg, thumbColor, sub;
  if (c.done) {
    const r = ratingInfo(c.rating) || RATING_NA;
    statusLabel = r.pill; statusColor = r.color; statusBg = r.bg;
    thumbBg = r.bg; thumbColor = r.color;
    const bits = [];
    if (photoCount) bits.push(photoCount + ' photo' + (photoCount > 1 ? 's' : ''));
    if (c.delai_suggere) bits.push(c.delai_suggere);
    else if (c.observation) bits.push(String(c.observation).slice(0, 48));
    sub = bits.join(' · ') || 'Documentée';
  } else {
    statusLabel = 'À documenter'; statusColor = 'var(--ink-500)'; statusBg = 'var(--ink-100)';
    thumbBg = 'var(--ink-050)'; thumbColor = 'var(--ink-400)';
    const f = facetSuffix(c);
    sub = f || (c.qty && c.qty !== '—' ? c.qty : 'À visiter');
  }
  const facets = c.done ? facetSuffix(c) : '';
  return {
    id: c.id, name: c.name, code: c.uniformat_code || '', facets,
    sub, statusLabel, statusColor, statusBg, thumbBg, thumbColor, thumbIcon: info.icon,
    rflag: !!c.r_flag,
    aiTag: !!(c.ai_suggested && !c.done),
  };
}

function computeGroups() {
  const fl = filteredComponents();
  const known = Object.keys(CATS);
  const groups = known.map(k => {
    const all = state.components.filter(c => c.cat === k);
    const items = fl.filter(c => c.cat === k);
    return {
      key: k, label: CATS[k].label, icon: CATS[k].icon,
      done: all.filter(c => c.done).length, total: all.length,
      items: items.map(rowVals),
    };
  });
  const isOther = c => !CATS[c.cat];
  const othersAll = state.components.filter(isOther);
  if (othersAll.length) {
    groups.push({
      key: 'autres', label: CAT_AUTRES.label, icon: CAT_AUTRES.icon,
      done: othersAll.filter(c => c.done).length, total: othersAll.length,
      items: fl.filter(isOther).map(rowVals),
    });
  }
  return groups.filter(g => g.items.length > 0);
}

function recommendedScenario(projection) {
  if (!projection || !Array.isArray(projection.scenarios) || !projection.scenarios.length) return null;
  return projection.scenarios.find(s => s.code === projection.recommendedCode) || projection.scenarios[0];
}

function computeDecades(projection) {
  const scenario = recommendedScenario(projection);
  if (!scenario || !Array.isArray(scenario.years) || !scenario.years.length) return [];
  const years = scenario.years;
  const buckets = [];
  for (let i = 0; i < 5; i++) {
    const slice = years.slice(i * 5, i * 5 + 5);
    if (!slice.length) continue;
    const sum = slice.reduce((a, y) => a + (y.debours || 0), 0);
    buckets.push({ label: `${i * 5 + 1}-${Math.min((i + 1) * 5, years.length)}`, sum });
  }
  const max = Math.max(1, ...buckets.map(b => b.sum));
  const colors = ['var(--orange)', '#fff', 'rgba(255,255,255,.5)', '#fff', 'rgba(255,255,255,.5)'];
  return buckets.map((b, i) => ({ label: b.label, h: Math.max(4, Math.round((b.sum / max) * 100)) + '%', color: colors[i % colors.length] }));
}

/* ============================================================
   Reports
   ============================================================ */

async function downloadReport(kind) {
  if (!state.dossier) return;
  if (!state.online) { showToast('Téléchargement indisponible hors connexion.'); return; }
  // Le rapport se génère sur le serveur : ce qui attend encore sur l'appareil n'y serait pas.
  if (state.envois.length) await synchroniser();
  if (state.envois.length) showToast("Des modifications attendent encore l'envoi : le rapport ne les contient pas.");
  const key = kind === 'docx' ? 'downloadingDocx' : kind === 'suivi' ? 'downloadingSuivi' : 'downloadingXlsx';
  state[key] = true; state.error = null; render();
  try {
    const chemin = kind === 'suivi' ? 'suivi-entretien.xlsx' : `report.${kind}`;
    const res = await apiFetch(`/api/dossiers/${state.dossier.id}/${chemin}`, null, { timeout: 180000 });
    if (!res.ok) throw new Error("Le rapport n'est pas disponible pour le moment.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'suivi' ? `${slug(state.dossier.name)}-suivi-entretien.xlsx` : `${slug(state.dossier.name)}-rapport.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') state.error = friendlyError(e);
  } finally {
    state[key] = false; render();
  }
}

async function generateReports() {
  await downloadReport('docx');
  await downloadReport('xlsx');
}

/* ============================================================
   Render
   ============================================================ */

function render() {
  const active = document.activeElement;
  const activeId = active && active.id;
  const scrollY = window.scrollY;
  let selStart = null, selEnd = null;
  if (activeId && active && typeof active.selectionStart === 'number') {
    selStart = active.selectionStart; selEnd = active.selectionEnd;
  }
  root.innerHTML = screenHtml();
  if (window.lucide) window.lucide.createIcons();
  if (scrollY) window.scrollTo(0, scrollY);
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart != null && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
      }
    }
  }
}

// Un rendu complet pendant la saisie effacerait le texte pas encore
// enregistré (il l'est à la sortie du champ) : il attend la sortie du champ.
let renduDiffere = false;
function renderSiPossible() {
  const a = document.activeElement;
  const saisie = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'file', 'submit'].includes(a.type)));
  if (saisie) { renduDiffere = true; paintNetBar(); paintPrepa(); return; }
  render();
}

function screenHtml() {
  if (state.screen === 'login') return loginHtml() + toastHtml();
  return `<div class="app-shell">${offlineBarHtml()}${errorBannerHtml()}${rejetsHtml()}${bodyForScreen()}</div>${toastHtml()}`;
}

function bodyForScreen() {
  switch (state.screen) {
    case 'dossiers': return dossiersHtml();
    case 'accueil': return accueilHtml();
    case 'immeuble': return immeubleHtml();
    case 'liste': return listeHtml();
    case 'fiche': return ficheHtml();
    case 'synthese': return syntheseHtml();
    case 'loading':
    default: return loadingHtml();
  }
}

function offlineBarHtml() {
  const n = state.envois.length;
  const attente = n ? ` · ${n} en attente d'envoi` : '';
  if (!state.online || state.reseauInstable) {
    return `<div class="offline-bar" id="barreReseau"><i data-lucide="wifi-off"></i>${state.online ? 'Connexion instable' : 'Hors connexion'} — vos modifications sont gardées sur l'appareil${attente}</div>`;
  }
  if (n) {
    return `<div class="offline-bar sync-bar" id="barreReseau"><i data-lucide="refresh-cw" class="${state.synchro ? 'spin' : ''}"></i>${state.synchro ? 'Envoi de' : 'En attente :'} ${n} modification${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} hors connexion</div>`;
  }
  return '<div id="barreReseau" hidden></div>';
}
// Met la barre à jour sans redessiner l'écran (saisie en cours préservée).
function paintNetBar() {
  const el = document.getElementById('barreReseau');
  if (!el) return;
  el.outerHTML = offlineBarHtml();
  if (window.lucide) window.lucide.createIcons();
}

function rejetsHtml() {
  if (!state.rejets.length) return '';
  const n = state.rejets.length;
  return `<div class="error-banner"><i data-lucide="alert-triangle"></i><div class="msg">${n} modification${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} hors connexion ${n > 1 ? 'ont été refusées' : 'a été refusée'} par le serveur :<br>${state.rejets.slice(0, 5).map(esc).join('<br>')}</div><button data-action="dismiss-rejets" aria-label="Fermer"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>`;
}

function prepaTexte() {
  const p = state.prepa;
  if (!p) {
    return state.online
      ? { icone: 'loader-2', classe: 'spin', texte: 'Préparation de la visite hors connexion…' }
      : { icone: 'cloud-off', classe: '', texte: 'Visite non préparée : seules les fiches déjà ouvertes sont disponibles hors connexion.' };
  }
  if (p.etat === 'fiches') return { icone: 'loader-2', classe: 'spin', texte: 'Préparation hors connexion : téléchargement des fiches…' };
  if (p.etat === 'photos') return { icone: 'loader-2', classe: 'spin', texte: `Préparation hors connexion : photos ${p.faites}/${p.total}` };
  if (p.etat === 'pret') return { icone: 'check-circle-2', classe: 'ok', texte: `Visite disponible hors connexion · ${p.fiches} fiches, ${p.total} photo${p.total > 1 ? 's' : ''}` };
  if (p.etat === 'partiel') return { icone: 'check-circle-2', classe: 'ok', texte: `Visite disponible hors connexion, sauf ${p.total - p.faites} photo${p.total - p.faites > 1 ? 's' : ''} (reprise avec le réseau)` };
  return { icone: 'alert-triangle', classe: '', texte: p.le ? 'Mise à jour hors connexion interrompue : la dernière préparation reste disponible.' : 'Préparation hors connexion interrompue : elle reprendra avec le réseau.' };
}
function prepaHtml() {
  const t = prepaTexte();
  return `<div class="prepa-ligne" id="prepaLigne"><i data-lucide="${t.icone}" class="${t.classe}"></i><span>${esc(t.texte)}</span></div>`;
}
function paintPrepa() {
  const el = document.getElementById('prepaLigne');
  if (!el) return;
  el.outerHTML = prepaHtml();
  if (window.lucide) window.lucide.createIcons();
}

function errorBannerHtml() {
  if (!state.error) return '';
  return `<div class="error-banner"><i data-lucide="alert-triangle"></i><div class="msg">${esc(state.error)}</div><button data-action="dismiss-error" aria-label="Fermer"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>`;
}

function toastHtml() {
  if (!state.toast) return '';
  return `<div class="toast">${esc(state.toast)}</div>`;
}

function loadingHtml() {
  return `<div class="loading-wrap"><i data-lucide="loader-2" class="spin"></i><span>Chargement…</span></div>`;
}

function loginHtml() {
  return `
  <div class="login-screen">
    <div class="login-brand"><img src="../assets/logo-mark.png" alt=""><span>Condo Strat<b>é</b>gis</span></div>
    <div class="login-card">
      <div class="login-eyebrow">Inspection terrain</div>
      <h1 class="login-title">Connexion</h1>
      ${state.loginError ? `<div class="login-error">${esc(state.loginError)}</div>` : ''}
      ${!state.online ? `<div class="login-error"><i data-lucide="wifi-off" style="width:13px;height:13px;vertical-align:-2px;margin-right:5px"></i>Vous êtes hors connexion.</div>` : ''}
      <form id="loginForm">
        <div class="field"><label for="loginEmail">Courriel</label><input id="loginEmail" data-role="login-email" type="email" autocomplete="username" value="${esc(state.loginEmail || '')}" required></div>
        <div class="field"><label for="loginPassword">Mot de passe</label><input id="loginPassword" data-role="login-password" type="password" autocomplete="current-password" value="${esc(state.loginPassword || '')}" required></div>
        <button class="btn-primary" type="submit" ${state.loginLoading || !state.online ? 'disabled' : ''}>
          ${state.loginLoading ? `<i data-lucide="loader-2" class="spin" style="width:17px;height:17px"></i>Connexion…` : `<i data-lucide="log-in" style="width:17px;height:17px"></i>Se connecter`}
        </button>
        <a href="/compte/?retour=/terrain/" style="display:block;text-align:center;margin-top:14px;font-size:12.5px;color:var(--ink-500)">Mot de passe oublié ?</a>
      </form>
    </div>
  </div>`;
}

function dossiersHtml() {
  const items = state.dossiers.map(d => {
    const pct = d.stats ? d.stats.pct : 0;
    return `<div class="picker-card" data-action="select-dossier" data-id="${esc(d.id)}">
      <h3>${esc(d.name)}</h3>
      <div class="addr">${esc(d.address || '')}${d.city ? ' · ' + esc(d.city) : ''}</div>
      <div class="picker-bar"><div style="width:${pct}%"></div></div>
      <div class="picker-pct">${pct}% complété · ${d.stats ? d.stats.done : 0}/${d.stats ? d.stats.total : 0}</div>
    </div>`;
  }).join('');
  return `<div class="picker-screen">
    <div class="top-row" style="margin-bottom:20px">
      <div class="brand"><img src="${state.companyLogoUrl || '../assets/logo-mark.png'}" alt=""><span>${esc((state.user && state.user.company && state.user.company.name) || 'Condo Stratégis')}</span></div>
      <div style="display:flex;gap:14px;align-items:center">
        <a href="/compte/?changer=1&retour=/terrain/" style="color:var(--ink-500);font-size:12px;text-decoration:none">Mot de passe</a>
        <button data-action="logout" style="border:none;background:none;color:var(--ink-500);font-size:12px;cursor:pointer">Déconnexion</button>
      </div>
    </div>
    <div class="eyebrow">Étude de fonds de prévoyance</div>
    <h1 class="page-title">Choisir un<br>dossier</h1>
    ${items || '<div class="empty-state">Aucun dossier disponible pour votre compte.</div>'}
  </div>`;
}

function batimentFilled() {
  const b = state.batiment || {};
  return Object.keys(b).reduce((a, sec) => a + Object.keys(b[sec] || {}).length, 0);
}

function accueilHtml() {
  const d = state.dossier;
  if (!d) return loadingHtml();
  const st = computeStats();
  const facts = [];
  if (d.units) facts.push(`${d.units} unités`);
  if (d.floors) facts.push(`${d.floors} étages`);
  if (d.built_year) facts.push(`construit ${d.built_year}`);
  const immCount = batimentFilled();
  return `
  <div class="scr-accueil">
    <div class="top-row">
      <div class="brand"><img src="${state.companyLogoUrl || '../assets/logo-mark.png'}" alt=""><span>${esc((state.user && state.user.company && state.user.company.name) || 'Condo Stratégis')}</span></div>
      <div class="net-badge ${state.online ? 'online' : 'offline'}"><i data-lucide="${state.online ? 'wifi' : 'wifi-off'}"></i>${state.online ? 'En ligne' : 'Hors connexion'}</div>
    </div>
    <div class="eyebrow">Étude de fonds de prévoyance</div>
    <h1 class="page-title">Visite<br>terrain</h1>
    <div class="dossier-card">
      <div class="dossier-content">
        <div class="dossier-top">
          <div>
            <div class="dossier-name">${esc(d.name)}</div>
            <div class="dossier-addr">${esc(d.address || '')}${d.city ? ' · ' + esc(d.city) : ''}</div>
          </div>
          <div class="dossier-no">DOSSIER<br>${esc(d.dossier_no || '')}</div>
        </div>
        ${facts.length ? `<div class="dossier-facts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="dossier-progress">
        <div class="dossier-progress-row">
          <span class="dossier-progress-label">Progression</span>
          <span class="dossier-progress-val"><b>${st.done}</b> / ${st.total} documentées</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${st.pct}%"></div></div>
      </div>
    </div>
    ${prepaHtml()}
    <div class="stats-grid">
      <div class="stat-tile"><div class="num">${st.photosTotal}</div><div class="lbl">Photos</div></div>
      <div class="stat-tile"><div class="num accent">${st.critical}</div><div class="lbl">À traiter</div></div>
      <div class="stat-tile"><div class="num">${st.todo}</div><div class="lbl">À faire</div></div>
    </div>
    <button class="nav-card" data-action="go-immeuble">
      <div class="icon"><i data-lucide="clipboard-list"></i></div>
      <div class="mid">
        <div class="t">Fiche d'immeuble</div>
        <div class="s">${immCount ? immCount + ' réponse' + (immCount > 1 ? 's' : '') + ' consignée' + (immCount > 1 ? 's' : '') : 'Documents, caractéristiques, derniers remplacements'}</div>
      </div>
      <i data-lucide="chevron-right" class="go"></i>
    </button>
    <div class="ai-banner">
      <div class="icon"><i data-lucide="clipboard-list"></i></div>
      <div>
        <div class="title">Liste des composantes</div>
        <div class="body">${st.total} composante${st.total > 1 ? 's' : ''} pour ce dossier${state.inactifs.length ? `, ${state.inactifs.length} autre${state.inactifs.length > 1 ? 's' : ''} désactivée${state.inactifs.length > 1 ? 's' : ''} selon la taille de l'immeuble et réactivable${state.inactifs.length > 1 ? 's' : ''} depuis la liste` : ''}. Retirez sur le terrain celles qui ne s'appliquent pas.</div>
      </div>
    </div>
    <button class="btn-cta" data-action="go-liste"><i data-lucide="play"></i>Reprendre la visite</button>
    <button class="btn-outline" data-action="go-synth">Synthèse &amp; rapports</button>
  </div>`;
}

/* ---------- Fiche d'immeuble ---------- */

function triHtml(sec, key, choices) {
  const cur = String(immGet(sec, key));
  return `<div class="seg">${choices.map(ch => {
    const on = cur === ch[0];
    return `<button class="seg-btn ${on ? 'on' : ''}" data-action="imm-choice" data-sec="${esc(sec)}" data-key="${esc(key)}" data-val="${esc(ch[0])}">${esc(ch[1])}</button>`;
  }).join('')}</div>`;
}

function immTextHtml(sec, key, placeholder, mode) {
  const id = `imm_${sec}_${key}`;
  return `<input class="imm-input" id="${id}" data-role="imm-text" data-sec="${esc(sec)}" data-key="${esc(key)}"
    value="${esc(immGet(sec, key))}" placeholder="${esc(placeholder || '')}" ${mode ? `inputmode="${mode}"` : ''}>`;
}

function immeubleHtml() {
  const d = state.dossier;
  if (!d) return loadingHtml();
  const OUI_NON_ND = [['oui', 'Oui'], ['non', 'Non'], ['nd', 'nd']];
  const OUI_NON = [['oui', 'Oui'], ['non', 'Non']];

  const docsHtml = IMM_DOCS.map(([k, label]) => `
    <div class="imm-row">
      <div class="imm-q">${esc(label)}</div>
      ${triHtml('documents', k, OUI_NON_ND)}
    </div>`).join('');

  const caracsHtml = IMM_CARACS.map(cfg => {
    let control;
    if (cfg.type === 'ouinon') control = triHtml('caracteristiques', cfg.k, OUI_NON);
    else if (cfg.type === 'choice') control = triHtml('caracteristiques', cfg.k, cfg.choices);
    else if (cfg.type === 'year') control = immTextHtml('caracteristiques', cfg.k, 'AAAA', 'numeric');
    else if (cfg.type === 'number') control = immTextHtml('caracteristiques', cfg.k, '—', 'numeric');
    else control = immTextHtml('caracteristiques', cfg.k, '—');
    const narrow = cfg.type === 'year' || cfg.type === 'number';
    return `<div class="imm-row ${cfg.sub ? 'sub' : ''} ${narrow ? 'narrow' : ''}">
      <div class="imm-q">${esc(cfg.q)}</div>
      ${control}
    </div>`;
  }).join('');

  const remplHtml = IMM_REMPLACEMENTS.map(([k, label]) => `
    <div class="imm-row narrow">
      <div class="imm-q">${esc(label)}</div>
      ${immTextHtml('remplacements', k, 'AAAA', 'numeric')}
    </div>`).join('');

  const entrHtml = IMM_ENTRETIENS.map(([k, label]) => `
    <div class="imm-row narrow">
      <div class="imm-q">${esc(label)}</div>
      ${immTextHtml('entretiens', k, 'mm/aaaa')}
    </div>`).join('');

  return `
  <div class="scr-immeuble">
    <div class="hdr">
      <div class="hdr-row">
        <button class="hdr-back" data-action="go-accueil"><i data-lucide="chevron-left"></i>Dossier</button>
        <span class="save-status" id="immStatus"></span>
      </div>
      <h2>Fiche d'immeuble</h2>
      <div class="hdr-sub">${esc(d.name)}${d.address ? ' · ' + esc(d.address) : ''}</div>
    </div>
    <div class="imm-body">
      <div class="imm-section">
        <h3><span class="n">1</span>Documents à fournir avant la visite</h3>
        <p class="imm-hint">Chaque document : reçu, non reçu, ou non disponible.</p>
        ${docsHtml}
      </div>

      <div class="imm-section">
        <h3><span class="n">2</span>Caractéristiques du bâtiment</h3>
        ${caracsHtml}
      </div>

      <div class="imm-section">
        <h3><span class="n">3</span>Années des derniers remplacements</h3>
        <p class="imm-hint">À compléter lors de la visite — année du dernier remplacement ou de la dernière réparation majeure.</p>
        ${remplHtml}
      </div>

      <div class="imm-section">
        <h3><span class="n">4</span>Dates des derniers entretiens</h3>
        <p class="imm-hint">Si l'information est disponible (mois / année).</p>
        ${entrHtml}
      </div>

      <div class="imm-section">
        <h3><span class="n">5</span>Solde et cotisation annuelle — FP</h3>
        <div class="imm-row narrow">
          <div class="imm-q">Solde au fonds de prévoyance en début d'année</div>
          <input class="imm-input" id="fundBalanceInput" data-role="dossier-number" data-field="current_fund_balance" inputmode="numeric" placeholder="$" value="${esc(d.current_fund_balance != null ? d.current_fund_balance : '')}">
        </div>
        <div class="imm-row narrow">
          <div class="imm-q">Cotisation annuelle à ce fonds</div>
          <input class="imm-input" id="cotisationInput" data-role="dossier-number" data-field="cotisation_annuelle" inputmode="numeric" placeholder="$" value="${esc(d.cotisation_annuelle != null ? d.cotisation_annuelle : '')}">
        </div>
      </div>

      <div class="imm-foot">Les réponses sont enregistrées automatiquement au fil de la saisie.</div>
    </div>
  </div>`;
}

/* ---------- Liste des composantes ---------- */

function inactifsGroups() {
  const q = state.search.trim().toLowerCase();
  const fl = state.inactifs.filter(c => !q || `${c.name || ''} ${c.uniformat_code || ''}`.toLowerCase().includes(q));
  const cles = Object.keys(CATS);
  const groups = cles.map(k => ({ key: k, label: CATS[k].label, icon: CATS[k].icon, items: fl.filter(c => c.cat === k) }));
  groups.push({ key: 'autres', label: CAT_AUTRES.label, icon: CAT_AUTRES.icon, items: fl.filter(c => !CATS[c.cat]) });
  return groups
    .filter(g => g.items.length > 0)
    .map(g => Object.assign(g, { inactifs: true, done: 0, total: g.items.length }));
}

function inactifRowHtml(c) {
  return `<div class="comp-row inactif">
    <div class="comp-thumb" style="background:var(--ink-050);color:var(--ink-300)"><i data-lucide="${catInfo(c.cat).icon}"></i></div>
    <div class="comp-mid">
      <div class="name">${esc(c.name)}</div>
      <div class="sub">Désactivée</div>
    </div>
    <div class="comp-end">
      <button class="reactiver" data-action="reactiver" data-id="${esc(c.id)}"><i data-lucide="rotate-ccw"></i>Réactiver</button>
    </div>
  </div>`;
}

function listeHtml() {
  const st = computeStats();
  const chips = [
    { key: 'all', label: 'Tout', count: st.total },
    { key: 'todo', label: 'À faire', count: st.todo },
    { key: 'done', label: 'Fait', count: st.done },
    { key: 'action', label: 'Action requise', count: st.critical },
  ];
  if (state.inactifs.length) chips.push({ key: 'inactifs', label: 'Désactivées', count: state.inactifs.length });
  const chipsHtml = chips.map(c => `<button class="chip ${state.filter === c.key ? 'on' : ''}" data-action="filter" data-filter="${c.key}">${c.label} · ${c.count}</button>`).join('');
  const groups = state.filter === 'inactifs' ? inactifsGroups() : computeGroups();
  const missingAI = state.components.filter(c => c.ai_suggested && !c.done).length;
  const groupsHtml = groups.map(g => `
    <div class="grp">
      <div class="grp-hdr"><i data-lucide="${g.icon}"></i><span class="lbl">${esc(g.label)}</span><span class="cnt">${g.done}/${g.total}</span><div class="rule"></div></div>
      ${g.items.map(g.inactifs ? inactifRowHtml : rowHtml).join('')}
    </div>`).join('');
  const inactifsNote = state.filter === 'inactifs'
    ? `<div class="missing-banner"><i data-lucide="eye-off"></i><div class="txt">Composantes jugées peu probables pour cet immeuble. <b>Réactivez</b> celles que vous trouvez sur place.</div></div>`
    : '';
  return `
  <div class="scr-liste">
    <div class="hdr">
      <div class="hdr-row">
        <button class="hdr-back" data-action="go-accueil"><i data-lucide="chevron-left"></i>Dossier</button>
        <span class="hdr-count">${st.done}/${st.total}</span>
      </div>
      <h2>Composantes</h2>
      <div class="search-box"><i data-lucide="search"></i><input id="searchInput" data-role="search-input" placeholder="Rechercher une composante…" value="${esc(state.search)}"></div>
      <div class="chip-row scr">${chipsHtml}</div>
    </div>
    ${inactifsNote}
    ${missingAI > 0 ? `<div class="missing-banner"><i data-lucide="scan-search"></i><div class="txt"><b>${missingAI} composante${missingAI > 1 ? 's' : ''} suggérée${missingAI > 1 ? 's' : ''}</b> par l'IA, non visitée${missingAI > 1 ? 's' : ''}</div></div>` : ''}
    <div class="list-body">
      ${groupsHtml || `<div class="empty-state">Aucune composante ne correspond à ce filtre.</div>`}
    </div>
    <div class="bottom-bar"><button class="btn-dark" data-action="go-synth"><i data-lucide="flag"></i>Terminer la visite</button></div>
  </div>`;
}

function rowHtml(r) {
  return `<button class="comp-row" data-action="open-fiche" data-id="${esc(r.id)}">
    <div class="comp-thumb" style="background:${r.thumbBg};color:${r.thumbColor}"><i data-lucide="${r.thumbIcon}"></i></div>
    <div class="comp-mid">
      <div class="name">${esc(r.name)}${r.code ? `<span class="code">${esc(r.code)}</span>` : ''}</div>
      ${r.facets ? `<div class="facets">${esc(r.facets)}</div>` : ''}
      <div class="sub">${esc(r.sub)}</div>
      ${r.aiTag ? `<div class="ai-tag">Suggéré IA</div>` : ''}
    </div>
    <div class="comp-end">
      <span class="status-pill" style="background:${r.statusBg};color:${r.statusColor}">${esc(r.statusLabel)}</span>
      ${r.rflag ? `<span class="r-pill">R</span>` : ''}
    </div>
  </button>`;
}

/* ---------- Fiche composante ---------- */

function ratingListHtml(c) {
  const naOn = c.rating == null && (!!state.naChosen[c.id] || !!c.done);
  const opts = RATINGS.map(r => {
    const on = c.rating === r.v;
    return `<button class="rating-opt ${on ? 'on' : ''}" data-action="set-rating" data-rating="${r.v}"
      style="${on ? `border-color:${r.color};background:${r.bg}` : ''}">
      <span class="num" style="background:${on ? r.color : 'var(--ink-100)'};color:${on ? '#fff' : 'var(--ink-500)'}">${r.v}</span>
      <span class="lbl" style="${on ? `color:${r.color}` : ''}">${esc(r.label)}</span>
      ${on ? `<i data-lucide="check" style="color:${r.color}"></i>` : ''}
    </button>`;
  }).join('');
  const na = `<button class="rating-opt ${naOn ? 'on' : ''}" data-action="set-rating" data-rating="na"
      style="${naOn ? `border-color:${RATING_NA.color};background:${RATING_NA.bg}` : ''}">
      <span class="num" style="background:${naOn ? RATING_NA.color : 'var(--ink-100)'};color:${naOn ? '#fff' : 'var(--ink-500)'}">na</span>
      <span class="lbl">${esc(RATING_NA.label)}</span>
      ${naOn ? `<i data-lucide="check"></i>` : ''}
    </button>`;
  return `<div class="rating-list">${opts}${na}</div>`;
}

function choixHtml(field, liste, valeur) {
  return `<div class="quick-chips">${liste.map(([k, lib]) => `<button class="quick-chip ${valeur === k ? 'on' : ''}" data-action="set-facet" data-field="${esc(field)}" data-val="${esc(k)}">${esc(lib)}</button>`).join('')}</div>`;
}

// Ajoute un défaut de la grille de la firme comme nouvelle ligne de constat ;
// l'inspecteur y précise la localisation.
function ajouterConstat(terme) {
  const c = state.activeComponent;
  if (!c || !terme) return;
  const actuel = String(c.observation || '').replace(/\s+$/, '');
  const ligne = `${terme.charAt(0).toUpperCase()}${terme.slice(1)} – `;
  saveCompField('observation', actuel ? `${actuel}\n${ligne}` : ligne, { force: true });
  render();
  const el = document.getElementById('observationInput');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

/* ---------- Carnet d'entretien de la composante ---------- */

const FREQ_TACHE = [['H', 'Chaque semaine'], ['M', 'Chaque mois'], ['S', 'Une fois dans la saison'], ['A', 'Annuelle'], ['AS', 'Annuelle, par un entrepreneur'], ['A5', 'Aux 5 ans']];
const QUI_TACHE = [['', 'Syndicat / gestionnaire'], ['Ménagers', 'Entretien ménager'], ['Contrat', 'Entrepreneur (contrat)']];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function persoEntretien(c) {
  const p = parseJsonObject(c && c.taches_entretien);
  return { retirees: Array.isArray(p.retirees) ? p.retirees.slice() : [], ajoutees: Array.isArray(p.ajoutees) ? p.ajoutees.slice() : [] };
}
// Retirer, rétablir ou ajouter : on renvoie tout le réglage de la composante ;
// le serveur le valide et répond avec la liste de tâches recalculée.
async function enregistrerEntretien(perso) {
  const c = state.activeComponent;
  if (!c) return;
  try {
    await patchComponent(c.id, { taches_entretien: JSON.stringify(perso) });
    render();
  } catch (e) { /* erreur déjà affichée */ }
}
function retirerTache(id) {
  const c = state.activeComponent; if (!c) return;
  const p = persoEntretien(c);
  if (id.startsWith('p_')) p.ajoutees = p.ajoutees.filter(t => t.id !== id);
  else if (!p.retirees.includes(id)) p.retirees.push(id);
  enregistrerEntretien(p);
}
function retablirTache(id) {
  const c = state.activeComponent; if (!c) return;
  const p = persoEntretien(c);
  p.retirees = p.retirees.filter(x => x !== id);
  enregistrerEntretien(p);
}
function ajouterTache() {
  const c = state.activeComponent; const f = state.tacheForm;
  if (!c || !f) return;
  if (!f.x.trim()) { showToast('Décrivez la tâche.'); return; }
  if (!f.mois.length) { showToast('Choisissez au moins un mois.'); return; }
  const p = persoEntretien(c);
  p.ajoutees.push({ id: nouvelIdTache(), x: f.x.trim(), f: f.f, q: f.q, mois: f.mois.slice().sort((a, b) => a - b) });
  state.tacheForm = null;
  enregistrerEntretien(p);
}

function carnetHtml(c) {
  const toutes = Array.isArray(c.entretien) ? c.entretien : [];
  const actives = toutes.filter(t => !t.retiree);
  const retirees = toutes.filter(t => t.retiree);
  const ligne = (t) => `
    <div class="tache-row">
      <div class="tache-mid">
        <div class="tache-texte">${esc(t.texte)}${t.perso ? '<span class="tache-perso">ajoutée</span>' : ''}</div>
        <div class="tache-sub">${esc(t.frequence)} · ${esc(t.quand)} · ${esc(t.responsable)}${t.aPreciser ? ' · <b>mois à préciser</b>' : ''}</div>
      </div>
      <button class="tache-x" data-action="tache-retirer" data-id="${esc(t.id)}" aria-label="Retirer cette tâche"><i data-lucide="x"></i></button>
    </div>`;
  const f = state.tacheForm;
  const formulaire = f ? `
    <div class="tache-form">
      <input class="fld-input" data-role="tache-texte" value="${esc(f.x)}" placeholder="Tâche — ex. Vérifier l'étanchéité des joints de la margelle">
      <div class="guide-lbl">Fréquence</div>
      <div class="quick-chips">${FREQ_TACHE.map(([k, l]) => `<button class="quick-chip ${f.f === k ? 'on' : ''}" data-action="tache-freq" data-val="${k}">${esc(l)}</button>`).join('')}</div>
      <div class="guide-lbl">Mois</div>
      <div class="quick-chips">${MOIS_COURTS.map((m, i) => `<button class="quick-chip ${f.mois.includes(i + 1) ? 'on' : ''}" data-action="tache-mois" data-val="${i + 1}">${m}</button>`).join('')}</div>
      <div class="guide-lbl">Responsable</div>
      <div class="quick-chips">${QUI_TACHE.map(([k, l]) => `<button class="quick-chip ${f.q === k ? 'on' : ''}" data-action="tache-qui" data-val="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      <div class="tache-actions">
        <button class="btn-outline" style="margin-top:0" data-action="tache-annuler">Annuler</button>
        <button class="btn-cta" data-action="tache-ajouter"><i data-lucide="plus"></i>Ajouter</button>
      </div>
    </div>` : `<button class="btn-outline" data-action="tache-form"><i data-lucide="plus"></i>Ajouter une tâche</button>`;
  return `
    ${actives.length ? actives.map(ligne).join('') : '<div class="attr-empty">Aucune tâche du carnet pour cette composante.</div>'}
    ${retirees.length ? `<details class="tache-retirees"><summary>Tâches retirées (${retirees.length})</summary>${retirees.map(t => `
      <div class="tache-row retiree"><div class="tache-mid"><div class="tache-texte">${esc(t.texte)}</div><div class="tache-sub">${esc(t.frequence)} · ${esc(t.quand)}</div></div>
      <button class="reactiver" data-action="tache-retablir" data-id="${esc(t.id)}"><i data-lucide="rotate-ccw"></i>Rétablir</button></div>`).join('')}</details>` : ''}
    ${formulaire}`;
}

function obsFieldHtml(id, role, field, label, value, placeholder) {
  return `<div class="obs-field">
    <label for="${id}">${esc(label)}</label>
    <textarea id="${id}" data-role="${role}" data-field="${esc(field)}" placeholder="${esc(placeholder)}" rows="3">${esc(value || '')}</textarea>
  </div>`;
}

function facetsHtml(c) {
  const posHtml = POSITIONS.map(p => `<button class="seg-btn ${c.position === p.v ? 'on' : ''}" data-action="set-facet" data-field="position" data-val="${p.v}"><b>${p.v}</b><span>${esc(p.label)}</span></button>`).join('');
  const empHtml = EMPLACEMENTS.map(p => `<button class="seg-btn ${c.emplacement === p.v ? 'on' : ''}" data-action="set-facet" data-field="emplacement" data-val="${p.v}">${esc(p.label)}</button>`).join('');
  return `
  <div class="facet-block">
    <div class="facet-lbl">Position de façade</div>
    <div class="seg seg-4">${posHtml}</div>
  </div>
  <div class="facet-block">
    <div class="facet-lbl">Emplacement</div>
    <div class="seg">${empHtml}</div>
  </div>
  <div class="facet-block">
    <div class="facet-lbl">Variante de matériau ou de type</div>
    <input id="varianteInput" class="fld-input" data-role="comp-text" data-field="variante" value="${esc(c.variante || '')}" placeholder="ex. Modules de béton, Bois traité">
  </div>`;
}

function attributsHtml(c) {
  const attrs = componentAttrs(c);
  const keys = Object.keys(attrs);
  const rows = keys.map((k, i) => `
    <div class="attr-row">
      <span class="k">${esc(k)}</span>
      <input id="attrVal_${i}" class="v" data-role="attr-value" data-key="${esc(k)}" value="${esc(attrs[k])}" placeholder="—">
      <button class="del" data-action="attr-del" data-key="${esc(k)}" aria-label="Retirer ${esc(k)}"><i data-lucide="x"></i></button>
    </div>`).join('');
  const sugg = ATTR_SUGGESTIONS.map(s => `<button class="quick-chip" data-action="attr-suggest" data-key="${esc(s)}">${esc(s)}</button>`).join('');
  return `
    ${keys.length ? `<div class="attr-list">${rows}</div>` : '<div class="attr-empty">Aucun attribut consigné.</div>'}
    <div class="quick-chips">${sugg}</div>
    <div class="attr-add">
      <input id="attrKeyInput" data-role="attr-key-draft" value="${esc(state.attrKeyDraft)}" placeholder="Champ (ex. Marque)">
      <input id="attrValInput" data-role="attr-val-draft" value="${esc(state.attrValDraft)}" placeholder="Valeur">
      <button data-action="attr-add" aria-label="Ajouter l'attribut"><i data-lucide="plus"></i></button>
    </div>`;
}

function ficheHtml() {
  if (state.ficheLoading || !state.activeComponent) return `<div class="scr-fiche">${loadingHtml()}</div>`;
  const c = state.activeComponent;
  const info = catInfo(c.cat);
  const photos = c.photos || [];

  const photoThumbsHtml = photos.map(p => {
    const url = state.photoBlobUrls[p.id];
    if (!url && state.photoIndispo[p.id]) return `<div class="photo-thumb indispo" title="Photo pas encore téléchargée sur l'appareil"><i data-lucide="image-off"></i></div>`;
    return `<div class="photo-thumb ${url ? '' : 'loading'} ${p.local ? 'en-attente' : ''}">${url ? `<img src="${url}" alt="">` : `<i data-lucide="loader-2"></i>`}${url ? `<div class="tag">${esc(p.local ? "En attente d'envoi" : (p.tag || ''))}</div>` : ''}</div>`;
  }).join('');

  const aiCardHtml = state.aiResult ? aiResultHtml(state.aiResult, c) : '';

  const micSection = state.speechSupported ? `
    <button class="mic-btn ${state.recording ? 'rec' : ''}" data-action="toggle-voice" ${!state.online ? 'disabled' : ''}>
      <i data-lucide="mic" class="${state.recording ? 'pulse' : ''}"></i>${state.recording ? 'Écoute… touchez pour arrêter' : 'Dicter une note'}
    </button>` : `
    <div class="note-fallback">
      <textarea id="noteFallbackText" data-role="note-fallback-text" placeholder="Reconnaissance vocale indisponible sur cet appareil. Écrivez votre note ici…">${esc(state.noteDraft)}</textarea>
      <button class="send" data-action="note-fallback-send">Envoyer la note</button>
    </div>`;

  const noteCard = c.note ? `<div class="note-card"><div class="note-card-hdr"><i data-lucide="sparkles"></i><span>Note structurée</span></div><div class="note-card-body">${esc(c.note)}</div></div>` : '';

  const delaiChips = DELAIS.map(d => `<button class="quick-chip ${c.delai_suggere === d ? 'on' : ''}" data-action="set-facet" data-field="delai_suggere" data-val="${esc(d)}">${esc(d)}</button>`).join('');
  const guide = c.guide || {};
  const defautsChips = (guide.defauts || []).map(d => `<button class="quick-chip" data-action="add-constat" data-val="${esc(d)}">${esc(d)}</button>`).join('');

  const rep = replacementYear(c);
  const repSub = rep
    ? (rep.delta > 1 ? `dans ${rep.delta} ans` : rep.delta === 1 ? "l'an prochain" : rep.delta === 0 ? 'cette année' : `échu depuis ${Math.abs(rep.delta)} an${Math.abs(rep.delta) > 1 ? 's' : ''}`)
    : 'Renseignez l’année et la durée de vie utile';

  return `
  <div class="scr-fiche">
    <div class="hdr">
      <div class="hdr-row">
        <button class="hdr-back" data-action="go-liste"><i data-lucide="chevron-left"></i>Composantes</button>
        <span class="save-status" id="ficheStatus"></span>
      </div>
      <div class="tag-row">
        <span class="cat-tag">${esc(info.label)}</span>
        ${c.uniformat_code ? `<span class="code-tag">${esc(c.uniformat_code)}</span>` : ''}
      </div>
      <h2 class="fiche-title">${esc(c.name)}</h2>
    </div>
    <div class="fiche-body">
      <div class="section-lbl">Photos (${photos.length})</div>
      <div class="photo-strip scr">
        <button class="photo-add ${state.uploadingPhoto ? 'uploading' : ''}" data-action="add-photo">
          <i data-lucide="${state.uploadingPhoto ? 'loader-2' : 'camera'}"></i><span>${state.uploadingPhoto ? 'Envoi…' : 'Photo'}</span>
        </button>
        ${photoThumbsHtml}
      </div>
      <input type="file" accept="image/*" capture="environment" id="photoFileInput" data-role="photo-file-input" style="display:none">

      <button class="btn-analyze" data-action="analyze" ${state.analyzing || !state.online ? 'disabled' : ''}>
        <i data-lucide="${state.analyzing ? 'loader-2' : 'sparkles'}" class="${state.analyzing ? 'spin' : ''}"></i>${state.analyzing ? 'Analyse en cours…' : "Analyser les photos avec l'IA"}
      </button>

      ${aiCardHtml}

      <div class="sec-head" style="margin-top:24px">
        <span class="section-lbl" style="margin:0">Cote de l'élément</span>
        <button class="r-toggle ${c.r_flag ? 'on' : ''}" data-action="toggle-rflag" title="Marqueur R">R</button>
      </div>
      ${ratingListHtml(c)}

      <div class="section-lbl" style="margin-top:26px">Relevé</div>
      ${guide.points ? `<div class="guide-hint"><b>À décrire</b> ${esc(guide.points)}</div>` : ''}

      <div class="obs-field">
        <label for="observationInput">Constats — un par ligne</label>
        <textarea id="observationInput" data-role="comp-textarea" data-field="observation" placeholder="Localisation – ce qui est observé&#10;ex. Façade arrière – joints de mortier effrités" rows="4">${esc(c.observation || '')}</textarea>
        ${defautsChips ? `<div class="guide-lbl">À surveiller — touchez pour ajouter</div><div class="quick-chips">${defautsChips}</div>` : ''}
      </div>

      <div class="obs-field">
        <label>Étendue</label>
        ${choixHtml('etendue', ETENDUES, c.etendue)}
        <input class="fld-input" style="margin-top:8px" data-role="comp-text" data-field="etendue_qte" value="${esc(c.etendue_qte || '')}" placeholder="Quantité touchée — ex. ≈ 4 m², 3 fenêtres, 20 %">
      </div>

      <div class="obs-field">
        <label>Limite d'observation</label>
        ${choixHtml('limite_observation', LIMITES_OBS, c.limite_observation)}
        ${c.limite_observation && c.limite_observation !== 'de_pres' ? `<input class="fld-input" style="margin-top:8px" data-role="comp-text" data-field="limite_detail" value="${esc(c.limite_detail || '')}" placeholder="Raison ou méthode — ex. du sol à l'aide de jumelles, local verrouillé">` : ''}
      </div>

      ${obsFieldHtml('causeInput', 'comp-textarea', 'cause_possible', 'Cause possible', c.cause_possible, 'Origine probable, modalisée — ex. semble provenir de…')}

      <div class="obs-field">
        <label>Nature du risque</label>
        ${choixHtml('nature_risque', RISQUES, c.nature_risque)}
      </div>

      <div class="obs-field">
        <label>Délai suggéré</label>
        <div class="quick-chips">${delaiChips}</div>
        ${c.delai_suggere && !DELAIS.includes(c.delai_suggere) ? `<div class="guide-lbl">Valeur antérieure : ${esc(c.delai_suggere)}</div>` : ''}
      </div>

      ${obsFieldHtml('consequencesInput', 'comp-textarea', 'consequences', 'Conséquences additionnelles', c.consequences, 'Si rien n’est fait…')}
      ${obsFieldHtml('projetCaInput', 'comp-textarea', 'projet_ca', 'Travaux planifiés par le conseil', c.projet_ca, 'ex. le remplacement des fenêtres pour 2027')}

      <div class="sec-head" style="margin-top:26px">
        <span class="section-lbl" style="margin:0">Précisions</span>
        <button class="link-btn" data-action="toggle-facets">${state.facetsOpen ? 'Masquer' : 'Préciser'}</button>
      </div>
      ${state.facetsOpen ? `<div class="facets-wrap">${facetsHtml(c)}</div>` : `<div class="facets-summary">${esc(facetSuffix(c) || 'Position de façade, emplacement, variante — au besoin.')}</div>`}

      <div class="section-lbl" style="margin-top:26px">Données techniques</div>
      <div class="field-grid">
        <div>
          <label for="yearInput">Année de construction ou réparation</label>
          <input id="yearInput" data-role="year-input" value="${esc(c.install_year != null ? c.install_year : '')}" inputmode="numeric" placeholder="AAAA">
        </div>
        <div>
          <label for="lifeInput">Durée de vie utile (ans)</label>
          <input id="lifeInput" data-role="comp-number" data-field="useful_life_years" value="${esc(c.useful_life_years != null ? c.useful_life_years : '')}" inputmode="numeric" placeholder="—">
        </div>
        <div>
          <label for="qtyInput">Quantité</label>
          <input id="qtyInput" data-role="comp-text" data-field="qty" value="${esc(c.qty != null ? c.qty : '')}" placeholder="—">
        </div>
        <div>
          <label for="costInput">Coût de remplacement ($)</label>
          <input id="costInput" data-role="comp-number" data-field="replacement_cost" value="${esc(c.replacement_cost != null ? c.replacement_cost : '')}" inputmode="numeric" placeholder="—">
        </div>
      </div>

      <div class="obs-field" style="margin-top:14px">
        <label>Source de l'année</label>
        ${choixHtml('source_annee', SOURCES_ANNEE, c.source_annee)}
      </div>

      <div class="derived-card ${rep && rep.delta < 0 ? 'late' : ''}">
        <div class="k">Année anticipée de remplacement</div>
        <div class="v">${rep ? rep.year : '—'}</div>
        <div class="s">${esc(repSub)}</div>
      </div>

      <div class="section-lbl" style="margin-top:26px">Carnet d'entretien (${(c.entretien || []).filter(t => !t.retiree).length})</div>
      ${carnetHtml(c)}

      <div class="section-lbl" style="margin-top:26px">Attributs</div>
      ${attributsHtml(c)}

      <div class="section-lbl" style="margin-top:26px">Note vocale</div>
      ${micSection}
      ${noteCard}

      <button class="btn-outline btn-retirer" data-action="desactiver" data-id="${esc(c.id)}"><i data-lucide="eye-off"></i>Retirer de la visite (absente de l'immeuble)</button>
    </div>
    <div class="fiche-bottom">
      <button class="btn-cta" data-action="save-fiche"><i data-lucide="check"></i>Enregistrer &amp; suivante</button>
    </div>
  </div>`;
}

function aiResultHtml(r, c) {
  const rInfo = ratingInfo(r.rating);
  const label = rInfo ? rInfo.label : (r.ratingLabel || 'Non déterminée');
  const conf = r.confidence != null ? (typeof r.confidence === 'number' ? Math.round(r.confidence <= 1 ? r.confidence * 100 : r.confidence) + ' %' : r.confidence) : '';
  const cost = r.cost != null && r.cost !== '' ? String(r.cost) : (typeof r.costEstimate === 'number' ? fmtCAD.format(Math.round(r.costEstimate)) : '—');
  const line = (k, v) => v ? `<div class="ai-line"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>` : '';
  return `<div class="ai-card">
    <div class="ai-card-hdr"><i data-lucide="sparkles"></i><span class="lbl">Analyse IA</span>${conf ? `<span class="conf">confiance ${esc(conf)}</span>` : ''}</div>
    <div class="ai-card-body">
      <div class="ai-grid">
        <div><div class="k">Composante</div><div class="v">${esc(c.name)}</div></div>
        <div><div class="k">Cote proposée</div><div class="v" style="color:${rInfo ? rInfo.color : 'var(--ink-500)'}">${esc(label)}</div></div>
      </div>
      ${line('Constats', r.observation)}
      ${line('Étendue', [libelleDe(ETENDUES, r.etendue), r.etendueQte].filter(Boolean).join(' · '))}
      ${line("Limite d'observation", libelleDe(LIMITES_OBS, r.limiteObservation))}
      ${line('Cause possible', r.causePossible)}
      ${line('Nature du risque', libelleDe(RISQUES, r.natureRisque))}
      ${line('Délai suggéré', r.delaiSuggere)}
      ${line('Conséquences', r.consequences)}
      ${line('Coût de remplacement', cost)}
      ${r.source ? `<div class="ai-source">Source : ${esc(r.source)}</div>` : ''}
      <button class="btn-apply" data-action="apply-ai">Appliquer ces valeurs</button>
    </div>
  </div>`;
}

function syntheseHtml() {
  const st = computeStats();
  const missing = state.components.filter(c => !c.done);
  const missingHtml = missing.map(c => {
    const info = catInfo(c.cat);
    return `<button class="coverage-item" data-action="open-fiche" data-id="${esc(c.id)}">
      <i data-lucide="${info.icon}"></i>
      <div class="mid"><div class="n">${esc(c.name)}</div><div class="c">${esc(info.label)}</div></div>
      <span class="go">Documenter →</span>
    </button>`;
  }).join('');

  const proj = state.projection;
  const scenario = recommendedScenario(proj);
  const units = state.dossier ? state.dossier.units : null;
  const fundAmount = proj ? formatMoneyCompact(proj.totalAvecPortionFuture) : (state.projectionLoading ? '…' : '—');
  const monthly = scenario && units > 0 ? fmtCAD.format(Math.round(scenario.years[0].cotisation / 12 / units)) : null;
  const decades = computeDecades(proj);
  const decadesHtml = decades.map(d => `<div class="fund-bar-wrap"><div class="fund-bar" style="height:${d.h};background:${d.color}"></div><span>${d.label}</span></div>`).join('');

  return `
  <div class="scr-synthese">
    <div class="hdr">
      <button class="hdr-back" data-action="go-liste"><i data-lucide="chevron-left"></i>Composantes</button>
      <h2>Synthèse</h2>
    </div>
    <div class="synthese-body">
      <div class="verify-banner"><div class="icon"><i data-lucide="check"></i></div><div class="txt"><b>${st.done} composante${st.done !== 1 ? 's' : ''} documentée${st.done !== 1 ? 's' : ''}</b> sur ${st.total}${st.critical ? ` · <b>${st.critical}</b> en entretien ou remplacement requis` : ''}</div></div>

      ${missing.length ? `
      <div class="coverage-card">
        <div class="coverage-hdr">
          <div class="row"><i data-lucide="alert-triangle"></i><span>Avant de quitter le site</span></div>
          <div class="body">${missing.length} composante${missing.length > 1 ? 's' : ''} non documentée${missing.length > 1 ? 's' : ''}. Vérifiez-les maintenant.</div>
        </div>
        ${missingHtml}
      </div>` : ''}

      <div class="fund-card">
        <div class="lbl">Fonds de prévoyance requis · ${proj ? proj.params.projectionYears : 30} ans</div>
        <div class="amount">${fundAmount}</div>
        <div class="sub">Cotisation suggérée · ${monthly ? `<b>${monthly}/mois</b> par unité` : '—'}</div>
        ${decadesHtml ? `<div class="fund-chart">${decadesHtml}</div>` : (state.projectionLoading ? '<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.5)">Calcul en cours…</div>' : '')}
      </div>

      <div class="section-lbl" style="margin:24px 0 12px">Rapports</div>
      <div class="reports-list">
        <div class="report-row">
          <div class="icon" style="background:var(--ink)"><i data-lucide="file-text"></i></div>
          <div class="mid"><div class="t">Étude de fonds de prévoyance</div><div class="s">Word (.docx)</div></div>
          <button class="dl" data-action="download-docx" ${state.downloadingDocx || !state.online ? 'disabled' : ''}><i data-lucide="${state.downloadingDocx ? 'loader-2' : 'download'}"></i>${state.downloadingDocx ? '…' : 'Télécharger'}</button>
        </div>
        <div class="report-row">
          <div class="icon" style="background:var(--green)"><i data-lucide="table-2"></i></div>
          <div class="mid"><div class="t">Durées de vie + carnet</div><div class="s">Excel (.xlsx)</div></div>
          <button class="dl" data-action="download-xlsx" ${state.downloadingXlsx || !state.online ? 'disabled' : ''}><i data-lucide="${state.downloadingXlsx ? 'loader-2' : 'download'}"></i>${state.downloadingXlsx ? '…' : 'Télécharger'}</button>
        </div>
        <div class="report-row">
          <div class="icon" style="background:var(--orange)"><i data-lucide="calendar-check"></i></div>
          <div class="mid"><div class="t">Tableur suivi d'entretien</div><div class="s">Excel (.xlsx) · tâches par saison</div></div>
          <button class="dl" data-action="download-suivi" ${state.downloadingSuivi || !state.online ? 'disabled' : ''}><i data-lucide="${state.downloadingSuivi ? 'loader-2' : 'download'}"></i>${state.downloadingSuivi ? '…' : 'Télécharger'}</button>
        </div>
      </div>

      <div class="differentiator">
        <div class="icon"><i data-lucide="calendar-clock"></i></div>
        <div><div class="t">Carnet d'entretien connecté</div><div class="b">Livrez au syndicat une app de suivi : rappels d'entretien, historique et alertes basées sur les durées de vie mesurées aujourd'hui.</div></div>
      </div>
    </div>
    <div class="fiche-bottom">
      <button class="btn-cta" data-action="generate-reports" ${!state.online ? 'disabled' : ''}><i data-lucide="download"></i>Télécharger les rapports</button>
    </div>
  </div>`;
}

/* ============================================================
   Event delegation
   ============================================================ */

function onRootClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  switch (action) {
    case 'select-dossier': selectDossier(t.dataset.id); break;
    case 'go-accueil': state.screen = 'accueil'; render(); break;
    case 'go-immeuble': state.screen = 'immeuble'; render(); break;
    case 'go-liste': state.screen = 'liste'; render(); break;
    case 'go-synth': state.screen = 'synthese'; render(); break;
    case 'open-fiche': openFiche(t.dataset.id); break;
    case 'filter': state.filter = t.dataset.filter; render(); break;
    case 'desactiver': setActif(t.dataset.id, false); break;
    case 'reactiver': setActif(t.dataset.id, true); break;
    case 'add-photo': triggerPhotoInput(); break;
    case 'analyze': analyze(); break;
    case 'apply-ai': applyAi(); break;
    case 'set-rating': onRatingClick(t.dataset.rating); break;
    case 'toggle-rflag': onRflagClick(); break;
    case 'set-facet': onFacetClick(t.dataset.field, t.dataset.val); break;
    case 'toggle-facets': state.facetsOpen = !state.facetsOpen; render(); break;
    case 'add-constat': ajouterConstat(t.dataset.val); break;
    case 'tache-retirer': retirerTache(t.dataset.id); break;
    case 'tache-retablir': retablirTache(t.dataset.id); break;
    case 'tache-form': state.tacheForm = { x: '', f: 'S', q: '', mois: [] }; render(); break;
    case 'tache-annuler': state.tacheForm = null; render(); break;
    case 'tache-ajouter': ajouterTache(); break;
    case 'tache-freq': if (state.tacheForm) { state.tacheForm.f = t.dataset.val; render(); } break;
    case 'tache-qui': if (state.tacheForm) { state.tacheForm.q = t.dataset.val; render(); } break;
    case 'tache-mois': if (state.tacheForm) {
      const m = Number(t.dataset.val); const l = state.tacheForm.mois;
      state.tacheForm.mois = l.includes(m) ? l.filter(x => x !== m) : l.concat([m]);
      render();
    } break;
    case 'attr-add': onAttrAdd(); break;
    case 'attr-del': onAttrDelete(t.dataset.key); break;
    case 'attr-suggest': {
      state.attrKeyDraft = t.dataset.key;
      const keyEl = document.getElementById('attrKeyInput');
      if (keyEl) keyEl.value = state.attrKeyDraft;
      const valEl = document.getElementById('attrValInput');
      if (valEl) valEl.focus();
      break;
    }
    case 'imm-choice': onImmChoice(t.dataset.sec, t.dataset.key, t.dataset.val); break;
    case 'toggle-voice': toggleVoice(); break;
    case 'note-fallback-send': onNoteFallbackSend(); break;
    case 'save-fiche': saveFiche(); break;
    case 'download-docx': downloadReport('docx'); break;
    case 'download-xlsx': downloadReport('xlsx'); break;
    case 'download-suivi': downloadReport('suivi'); break;
    case 'generate-reports': generateReports(); break;
    case 'dismiss-error': state.error = null; render(); break;
    case 'dismiss-rejets': state.rejets = []; render(); break;
    case 'logout': logout(); break;
  }
}

function onRootInput(e) {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('[data-role="search-input"]')) {
    state.search = t.value;
    render();
  } else if (t.matches('[data-role="note-fallback-text"]')) {
    state.noteDraft = t.value;
  } else if (t.matches('[data-role="attr-key-draft"]')) {
    state.attrKeyDraft = t.value;
  } else if (t.matches('[data-role="attr-val-draft"]')) {
    state.attrValDraft = t.value;
  } else if (t.matches('[data-role="tache-texte"]')) {
    if (state.tacheForm) state.tacheForm.x = t.value;
  } else if (t.matches('[data-role="login-email"]')) {
    state.loginEmail = t.value;
  } else if (t.matches('[data-role="login-password"]')) {
    state.loginPassword = t.value;
  }
}

function onRootChange(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-role="photo-file-input"]')) onPhotoFileChange(e);
}

function onRootFocusout(e) {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('[data-role="year-input"]')) { onYearBlur(e); return; }
  if (t.matches('[data-role="comp-number"]')) { onNumberBlur(t.dataset.field, e); return; }
  if (t.matches('[data-role="comp-text"]') || t.matches('[data-role="comp-textarea"]')) {
    const v = t.value.trim();
    saveCompField(t.dataset.field, v === '' ? null : v);
    return;
  }
  if (t.matches('[data-role="attr-value"]')) { onAttrValueBlur(t.dataset.key, e); return; }
  if (t.matches('[data-role="imm-text"]')) { onImmTextBlur(t.dataset.sec, t.dataset.key, e); return; }
  if (t.matches('[data-role="dossier-number"]')) { onDossierNumberBlur(t.dataset.field, e); return; }
}
// Un rendu reporté pendant la saisie a lieu à la sortie du champ.
root.addEventListener('focusout', () => {
  if (!renduDiffere) return;
  setTimeout(() => { if (renduDiffere) { renduDiffere = false; renderSiPossible(); } }, 60);
});

function onRootSubmit(e) {
  if (e.target && e.target.id === 'loginForm') {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    doLogin(email, password);
  }
}

root.addEventListener('click', onRootClick);
root.addEventListener('input', onRootInput);
root.addEventListener('change', onRootChange);
root.addEventListener('focusout', onRootFocusout);
root.addEventListener('submit', onRootSubmit);

window.addEventListener('online', () => {
  state.online = true;
  state.reseauInstable = false;
  renderSiPossible();
  synchroniser();
  if (state.dossier && !(state.prepa && state.prepa.etat === 'pret')) preparerHorsLigne(state.dossier.id);
});
window.addEventListener('offline', () => {
  state.online = false;
  state.toast = "Hors connexion : vos modifications sont gardées sur l'appareil.";
  renderSiPossible();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; renderSiPossible(); }, 3200);
});
// Filet de sécurité : l'événement « online » ne vient pas toujours (réseau
// revenu sans changement d'interface, connexion instable qui se rétablit).
setInterval(() => { if (state.online && state.envois.length) synchroniser(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) synchroniser(); });

boot();
