// Condo Stratégis — Inspection terrain (mobile field app)
// Vanilla JS SPA, no build step. Wires les écrans de visite au backend /api/*.
//
// Modèle d'inspection maison (feuille « Relevé ») :
//   cote 1-4 + na, marqueur R,
//   observation → cause possible → délai suggéré → conséquences,
//   facettes optionnelles (position de façade, emplacement, variante de matériau),
//   attributs typés libres, et l'année anticipée de remplacement dérivée de
//   « année de construction ou réparation + durée de vie utile ».
//
// Hors ligne : toute saisie est d'abord écrite sur l'appareil (offline.js), puis
// envoyée au serveur dans l'ordre dès qu'il répond. Les lectures retombent sur la
// dernière copie connue. Une visite peut donc se faire entièrement sans réseau,
// une fois le dossier ouvert au moins une fois avec du signal.

import {
  kvGet, kvSet, blobGet, blobSet, blobDelete,
  outboxAdd, outboxAll, outboxDelete, outboxClear,
  requestPersistence, compressPhoto,
} from './offline.js';

const TOKEN_KEY = 'cs_terrain_token';

/* ---------- Taxonomie maison : 10 catégories ---------- */

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

const DELAIS = ['à court terme', 'dans les 5 ans', 'à planifier', 'aucun suivi particulier'];

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
  components: [],
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

  pendingOps: [],        // copie mémoire de la file d'envoi (outbox)
  syncing: false,
  fromCache: false,      // données affichées issues de la copie locale
  aiAvailable: null,     // null = inconnu ; false = clé IA absente côté serveur
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

// Le toast vit hors de #app : l'afficher ne redessine pas l'écran, donc ne
// coupe jamais une saisie en cours.
let toastTimer = null;
let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.display = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 2600);
}

function friendlyError(e) {
  if (!e) return 'Une erreur est survenue.';
  if (e.message === 'OFFLINE') return 'Vous êtes hors connexion.';
  if (e.name === 'AbortError') return 'Le serveur met trop de temps à répondre.';
  if (e.message === 'SESSION_EXPIRED') return 'Votre session a expiré.';
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

// Une erreur « retry » est passagère (réseau, serveur indisponible) : la lecture
// retombe sur la copie locale, l'écriture reste dans la file et sera renvoyée.
function retryableError(msg) {
  const e = new Error(msg);
  e.retry = true;
  return e;
}

async function apiFetch(path, opts, config) {
  opts = opts || {};
  config = config || {};
  const auth = config.auth !== false;
  if (!state.online) throw retryableError('OFFLINE');
  const headers = Object.assign({}, opts.headers || {});
  if (auth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
  // Sans délai maximal, un signal faible (sous-sol, cage d'escalier) laisse une
  // requête pendante plusieurs minutes et bloque la file derrière elle.
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), config.timeout || 20000) : null;
  let res;
  try {
    res = await fetch(path, Object.assign({}, opts, { headers }, ctrl ? { signal: ctrl.signal } : {}));
  } catch (e) {
    throw retryableError('Erreur réseau. Vérifiez votre connexion.');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (auth && res.status === 401) {
    sessionExpired();
    throw new Error('SESSION_EXPIRED');
  }
  return res;
}

function sessionExpired() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  const n = state.pendingOps.length;
  state.token = null; state.user = null; state.dossier = null; state.dossiers = []; state.components = [];
  state.screen = 'login';
  state.loginError = n
    ? `Votre session a expiré. Reconnectez-vous : vos ${n} saisie${n > 1 ? 's' : ''} en attente seront envoyée${n > 1 ? 's' : ''} ensuite.`
    : 'Votre session a expiré. Reconnectez-vous.';
  render();
}

async function readError(res) {
  let data = null;
  try { data = await res.json(); } catch (e) {}
  const e = new Error((data && data.error) || `Erreur (${res.status})`);
  e.status = res.status;
  if (res.status >= 500 || res.status === 429) e.retry = true;
  return e;
}

async function apiJson(path, opts, config) {
  const res = await apiFetch(path, opts, config);
  if (!res.ok) throw await readError(res);
  try { return await res.json(); } catch (e) { return null; }
}

// Lecture avec repli : la réponse fraîche est mémorisée sur l'appareil ; sans
// réseau, on sert la dernière copie connue.
async function cachedJson(path, key) {
  try {
    const data = await apiJson(path);
    kvSet(key, data);
    return { data, fresh: true };
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED' || !e.retry) throw e;
    const cached = await kvGet(key);
    if (cached === undefined) throw e;
    return { data: cached, fresh: false };
  }
}

async function loadCompanyLogo() {
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  const co = state.user && state.user.company;
  if (!co || !co.hasLogo) { softRender(); return; }
  const key = `logo:${co.id}`;
  try {
    let blob = null;
    try {
      const res = await apiFetch(`/api/companies/${co.id}/logo`);
      if (res.ok) { blob = await res.blob(); blobSet(key, blob).catch(() => {}); }
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED') return;
    }
    if (!blob) blob = await blobGet(key);
    state.companyLogoUrl = blob ? URL.createObjectURL(blob) : null;
  } catch (e) {
    state.companyLogoUrl = null;
  }
  softRender();
}

async function checkHealth() {
  if (!state.online) return;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = await res.json();
    if (data && typeof data.ai === 'boolean') {
      state.aiAvailable = data.ai;
      kvSet('aiAvailable', data.ai);
      softRender();
    }
  } catch (e) { /* sans réseau : on garde la dernière valeur connue */ }
}

/* ============================================================
   File d'envoi (outbox)
   ============================================================ */

// Types d'opérations :
//   patchComponent { compId, dossierId, patch }
//   patchDossier   { dossierId, patch }
//   photo          { compId, dossierId, localId }   — blob dans le magasin « blobs »
//   note           { compId, dossierId, transcript } — mise en forme IA à l'envoi

let flushing = false;
let flushTimer = null;

function enqueue(op) {
  op.createdAt = Date.now();
  const rec = Object.assign({}, op);
  state.pendingOps.push(op);
  op._stored = outboxAdd(rec)
    .then(seq => { op.seq = seq; })
    .catch(() => {
      state.error = "Impossible d'écrire sur l'appareil (stockage plein ou bloqué). La saisie sera tentée directement.";
      softRender();
    });
  op._stored.then(() => scheduleFlush(250));
  updateSyncUi();
}

function scheduleFlush(ms) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, ms);
}

async function flush() {
  if (flushing || !state.token || !state.pendingOps.length || !state.online) { updateSyncUi(); return; }
  flushing = true; state.syncing = true; updateSyncUi();
  let retryLater = false;
  try {
    while (state.pendingOps.length && state.token) {
      const op = state.pendingOps[0];
      if (op._stored) await op._stored;
      try {
        await sendOp(op);
      } catch (e) {
        if (e.message === 'SESSION_EXPIRED') break;
        if (e.retry) { retryLater = true; break; }
        // Refus définitif (4xx) : on retire la saisie pour ne pas bloquer la file.
        state.error = `Une saisie a été refusée par le serveur et retirée de la file : ${friendlyError(e)}`;
        softRender();
      }
      state.pendingOps.shift();
      if (op.seq != null) await outboxDelete(op.seq).catch(() => {});
      updateSyncUi();
    }
  } finally {
    flushing = false; state.syncing = false; updateSyncUi();
    if (retryLater) scheduleFlush(20000);
  }
}

function laterKeys(op, kind, id) {
  const keys = new Set();
  for (const o of state.pendingOps) {
    if (o === op || o.type !== kind) continue;
    if ((kind === 'patchComponent' ? o.compId : o.dossierId) !== id) continue;
    Object.keys(o.patch || {}).forEach(k => keys.add(k));
  }
  return keys;
}

// Reprend du serveur la valeur normalisée des champs envoyés, sauf ceux qu'une
// saisie plus récente, encore en file, va de toute façon remplacer.
function pickSent(row, op, kind, id) {
  const later = laterKeys(op, kind, id);
  const out = {};
  for (const k of Object.keys(op.patch || {})) {
    if (later.has(k)) continue;
    out[k] = row && k in row ? row[k] : op.patch[k];
  }
  return out;
}

async function updateCachedComponent(dossierId, compId, fn) {
  if (dossierId) {
    const list = await kvGet(`components:${dossierId}`);
    if (Array.isArray(list)) {
      const i = list.findIndex(c => c.id === compId);
      if (i >= 0) {
        const e = Object.assign({}, list[i]);
        fn(e, 'list');
        list[i] = e;
        await kvSet(`components:${dossierId}`, list);
      }
    }
  }
  const det = await kvGet(`component:${compId}`);
  if (det) {
    const e = Object.assign({}, det);
    fn(e, 'detail');
    await kvSet(`component:${compId}`, e);
  }
}

function hasPendingFor(compId) {
  return state.pendingOps.some(o => o.compId === compId);
}

async function sendOp(op) {
  if (op.type === 'patchComponent') {
    const row = await apiJson(`/api/components/${op.compId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.patch),
    });
    applyComponentPatch(op.compId, pickSent(row, op, 'patchComponent', op.compId));
    if (row) {
      await updateCachedComponent(op.dossierId, op.compId, (e) => {
        const photos = e.photos;
        Object.assign(e, row);
        e.photos = photos;
      });
    }
    if (state.activeId === op.compId && state.pendingOps.filter(o => o.compId === op.compId).length <= 1) {
      setSaveStatus('ficheStatus', 'Enregistré');
    }
    return;
  }

  if (op.type === 'patchDossier') {
    const row = await apiJson(`/api/dossiers/${op.dossierId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op.patch),
    });
    if (state.dossier && state.dossier.id === op.dossierId) {
      state.dossier = Object.assign({}, state.dossier, pickSent(row, op, 'patchDossier', op.dossierId), row && row.stats ? { stats: row.stats } : {});
      if (state.pendingOps.filter(o => o.type === 'patchDossier').length <= 1) setSaveStatus('immStatus', 'Enregistré');
    }
    if (row) await kvSet(`dossier:${op.dossierId}`, row);
    return;
  }

  if (op.type === 'photo') {
    const blob = await blobGet(op.localId);
    if (!blob) return; // photo perdue sur l'appareil : rien à envoyer
    const fd = new FormData();
    fd.append('file', blob, 'photo.jpg');
    const res = await apiFetch(`/api/components/${op.compId}/photos`, { method: 'POST', body: fd }, { timeout: 120000 });
    if (!res.ok) throw await readError(res);
    const photo = await res.json();
    await blobSet(`photo:${photo.id}`, blob).catch(() => {});
    await blobDelete(op.localId).catch(() => {});
    if (state.photoBlobUrls[op.localId]) state.photoBlobUrls[photo.id] = state.photoBlobUrls[op.localId];
    if (state.activeComponent && state.activeComponent.id === op.compId) {
      state.activeComponent = Object.assign({}, state.activeComponent, {
        photos: (state.activeComponent.photos || []).map(p => (p.id === op.localId ? photo : p)),
      });
    }
    await updateCachedComponent(op.dossierId, op.compId, (e, kind) => {
      if (kind === 'list') e.photos = (typeof e.photos === 'number' ? e.photos : 0) + 1;
      else e.photos = (Array.isArray(e.photos) ? e.photos : []).concat([photo]);
    });
    softRender();
    return;
  }

  if (op.type === 'note') {
    const data = await apiJson(`/api/components/${op.compId}/structure-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: op.transcript }),
    }, { timeout: 60000 });
    const note = data && data.note != null ? data.note : op.transcript;
    const newer = state.pendingOps.some(o => o !== op && o.type === 'note' && o.compId === op.compId);
    if (!newer) applyComponentPatch(op.compId, { note });
    await updateCachedComponent(op.dossierId, op.compId, (e) => { e.note = note; });
    softRender();
  }
}

// Applique à une donnée serveur les saisies encore en file, pour qu'une
// réouverture hors ligne montre l'état réel de la visite.
function overlayComponent(c) {
  if (!c) return c;
  const ops = state.pendingOps.filter(o => o.compId === c.id);
  if (!ops.length) return c;
  const out = Object.assign({}, c);
  let extra = 0;
  for (const op of ops) {
    if (op.type === 'patchComponent') Object.assign(out, op.patch);
    else if (op.type === 'note') out.note = op.transcript;
    else if (op.type === 'photo') {
      extra++;
      if (Array.isArray(out.photos) && !out.photos.some(p => p.id === op.localId)) {
        out.photos = out.photos.concat([{ id: op.localId, local: true, tag: 'En attente' }]);
      }
    }
  }
  if (typeof out.photos === 'number') out.photos += extra;
  return out;
}

function overlayDossier(d) {
  if (!d) return d;
  let out = d;
  for (const op of state.pendingOps) {
    if (op.type === 'patchDossier' && op.dossierId === d.id) out = Object.assign({}, out, op.patch);
  }
  return out;
}

/* ============================================================
   Boot / auth / dossiers
   ============================================================ */

async function boot() {
  requestPersistence();
  state.pendingOps = await outboxAll();
  const ai = await kvGet('aiAvailable');
  if (typeof ai === 'boolean') state.aiAvailable = ai;
  checkHealth();
  if (state.token) {
    state.screen = 'loading';
    render();
    try {
      const { data } = await cachedJson('/api/auth/me', 'me');
      state.user = data;
      loadCompanyLogo();
      await loadDossiers();
      flush();
    } catch (e) {
      if (e.message !== 'SESSION_EXPIRED') {
        state.screen = 'login';
        state.loginError = e.retry ? 'Hors connexion : connectez-vous une première fois avec du réseau.' : friendlyError(e);
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
    kvSet('me', data.user);
    loadCompanyLogo();
    flush();
    await loadDossiers();
  } catch (e) {
    state.loginError = friendlyError(e);
    state.loginPassword = '';
  } finally {
    state.loginLoading = false; render();
  }
}

function logout() {
  const n = state.pendingOps.length;
  if (n && !window.confirm(`${n} saisie${n > 1 ? 's' : ''} n'${n > 1 ? 'ont' : 'a'} pas encore été envoyée${n > 1 ? 's' : ''} au serveur et ${n > 1 ? 'seront perdues' : 'sera perdue'} si vous vous déconnectez. Se déconnecter quand même ?`)) return;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  outboxClear();
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  Object.assign(state, {
    token: null, user: null, dossier: null, dossiers: [], components: [],
    activeComponent: null, activeId: null, projection: null, error: null,
    batiment: {}, naChosen: {}, loginError: null, screen: 'login', pendingOps: [],
  });
  render();
}

async function loadDossiers() {
  state.screen = 'loading'; state.error = null; render();
  try {
    const { data: dossiers, fresh } = await cachedJson('/api/dossiers', 'dossiers');
    state.dossiers = dossiers;
    state.fromCache = !fresh;
    if (dossiers.length === 1) {
      await selectDossier(dossiers[0].id);
      return;
    }
    state.screen = 'dossiers';
    render();
  } catch (e) {
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
    const [d, comps] = await Promise.all([
      cachedJson(`/api/dossiers/${id}`, `dossier:${id}`),
      cachedJson(`/api/dossiers/${id}/components`, `components:${id}`),
    ]);
    state.dossier = overlayDossier(d.data);
    state.components = (comps.data || []).map(overlayComponent);
    state.fromCache = !(d.fresh && comps.fresh);
    state.batiment = parseJsonObject(state.dossier.batiment_info);
    state.naChosen = {};
    state.filter = 'all'; state.search = '';
    state.screen = 'accueil';
    render();
    loadProjection(id);
    if (comps.fresh) prefetchComponents(comps.data || []);
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') {
      state.error = e.retry ? "Ce dossier n'a jamais été ouvert sur cet appareil : ouvrez-le une première fois avec du réseau." : friendlyError(e);
      state.screen = 'dossiers';
      render();
    }
  }
}

// Avec du réseau, on télécharge d'avance chaque fiche du dossier : une fiche
// ouverte plus tard au sous-sol, sans signal, s'affichera quand même.
async function prefetchComponents(list) {
  const queue = list.map(c => c.id);
  const worker = async () => {
    while (queue.length && state.online) {
      const id = queue.shift();
      try { kvSet(`component:${id}`, await apiJson(`/api/components/${id}`)); } catch (e) { if (e.message === 'SESSION_EXPIRED') return; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function loadProjection(id) {
  state.projectionLoading = true; softRender();
  try {
    state.projection = (await cachedJson(`/api/dossiers/${id}/projection`, `projection:${id}`)).data;
  } catch (e) {
    state.projection = null;
  } finally {
    state.projectionLoading = false; softRender();
  }
}

/* ============================================================
   Fiche (component detail)
   ============================================================ */

async function openFiche(id) {
  state.activeId = id; state.screen = 'fiche'; state.aiResult = null;
  state.analyzing = false; state.recording = false; state.noteDraft = '';
  state.ficheLoading = true; state.activeComponent = null; state.error = null;
  state.attrKeyDraft = ''; state.attrValDraft = ''; state.facetsOpen = false;
  render();
  let comp;
  try {
    comp = (await cachedJson(`/api/components/${id}`, `component:${id}`)).data;
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') return;
    const base = state.components.find(c => c.id === id);
    if (!e.retry || !base) {
      state.ficheLoading = false; state.error = friendlyError(e); render();
      return;
    }
    // Fiche jamais téléchargée : on part de la ligne de la liste.
    comp = Object.assign({}, base, { photos: [] });
  }
  if (state.activeId !== id) return;
  comp = overlayComponent(comp);
  state.activeComponent = comp;
  state.facetsOpen = !!(comp.position || comp.emplacement || comp.variante);
  state.ficheLoading = false;
  render();
  loadPhotoBlobs(comp.photos || []);
}

async function loadPhotoBlobs(photos) {
  for (const p of photos) {
    if (state.photoBlobUrls[p.id]) continue;
    try {
      let blob = await blobGet(p.local ? p.id : `photo:${p.id}`);
      if (!blob && !p.local && state.online) {
        const res = await apiFetch(`/api/photos/${p.id}/file`);
        if (!res.ok) continue;
        blob = await res.blob();
        blobSet(`photo:${p.id}`, blob).catch(() => {});
      }
      if (!blob) continue;
      state.photoBlobUrls[p.id] = URL.createObjectURL(blob);
      softRender();
    } catch (e) { /* ignore individual photo failures */ }
  }
}

function applyComponentPatch(id, patch) {
  if (state.activeComponent && state.activeComponent.id === id) {
    state.activeComponent = Object.assign({}, state.activeComponent, patch);
  }
  state.components = state.components.map(c => (c.id === id ? Object.assign({}, c, patch) : c));
}

// Enregistrement d'un champ de composante. Applique la valeur localement de façon
// synchrone (pour qu'un re-rendu déclenché entre-temps ne perde pas la saisie),
// l'inscrit dans la file d'envoi de l'appareil, puis la file part au serveur.
function saveCompField(field, value, opts) {
  const id = state.activeId;
  if (!id || !state.activeComponent) return false;
  const force = !!(opts && opts.force);
  const cur = state.activeComponent[field];
  const same = (cur == null ? '' : String(cur)) === (value == null ? '' : String(value));
  if (same && !force) return false;
  const patch = {}; patch[field] = value;
  applyComponentPatch(id, patch);
  enqueue({ type: 'patchComponent', compId: id, dossierId: state.dossier && state.dossier.id, patch });
  setSaveStatus('ficheStatus', state.online ? 'Enregistrement…' : 'Sur l’appareil');
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

function localId() {
  const rnd = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : (Date.now().toString(16) + Math.random().toString(16).slice(2));
  return 'loc_' + rnd;
}

// La photo est réduite, écrite sur l'appareil, puis mise en file : elle
// s'affiche tout de suite et part au serveur dès qu'il y a du réseau.
async function onPhotoFileChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file || !state.activeId) return;
  const compId = state.activeId;
  state.uploadingPhoto = true; state.error = null; render();
  try {
    const blob = await compressPhoto(file);
    const id = localId();
    await blobSet(id, blob);
    state.photoBlobUrls[id] = URL.createObjectURL(blob);
    const entry = { id, local: true, tag: 'En attente' };
    if (state.activeComponent && state.activeComponent.id === compId) {
      state.activeComponent = Object.assign({}, state.activeComponent, { photos: (state.activeComponent.photos || []).concat([entry]) });
    }
    state.components = state.components.map(c => (c.id === compId ? Object.assign({}, c, { photos: (typeof c.photos === 'number' ? c.photos : 0) + 1 }) : c));
    enqueue({ type: 'photo', compId, dossierId: state.dossier && state.dossier.id, localId: id });
  } catch (e2) {
    state.error = "La photo n'a pas pu être enregistrée sur l'appareil (stockage plein ?).";
  }
  state.uploadingPhoto = false;
  render();
}

/* ---------- AI analyze ---------- */

async function analyze() {
  if (state.analyzing || !state.activeId) return;
  if (!state.online) { showToast("Analyse IA indisponible hors connexion : elle sera possible au retour du réseau."); return; }
  const waiting = state.pendingOps.filter(o => o.type === 'photo' && o.compId === state.activeId).length;
  if (waiting) {
    showToast(`${waiting} photo${waiting > 1 ? 's' : ''} encore en envoi — réessayez dans un instant.`);
    flush();
    return;
  }
  state.analyzing = true; state.error = null; render();
  try {
    const result = await apiJson(`/api/components/${state.activeId}/analyze`, { method: 'POST' }, { timeout: 90000 });
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

function applyAi() {
  if (!state.aiResult || !state.activeId) return;
  const r = state.aiResult;
  const patch = {};
  if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 4) patch.rating = r.rating;
  if (typeof r.observation === 'string' && r.observation.trim()) patch.observation = r.observation.trim();
  if (typeof r.causePossible === 'string' && r.causePossible.trim()) patch.cause_possible = r.causePossible.trim();
  if (typeof r.delaiSuggere === 'string' && r.delaiSuggere.trim()) patch.delai_suggere = r.delaiSuggere.trim();
  if (typeof r.consequences === 'string' && r.consequences.trim()) patch.consequences = r.consequences.trim();
  if (typeof r.costEstimate === 'number' && !isNaN(r.costEstimate)) patch.replacement_cost = Math.round(r.costEstimate);
  if (!Object.keys(patch).length) { state.aiResult = null; showToast('Rien à appliquer.'); return; }
  applyComponentPatch(state.activeId, patch);
  enqueue({ type: 'patchComponent', compId: state.activeId, dossierId: state.dossier && state.dossier.id, patch });
  state.aiResult = null;
  render();
}

/* ---------- voice note ---------- */

let recognition = null;

function toggleVoice() {
  if (!state.speechSupported || !state.activeId) return;
  if (state.recording) {
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    return;
  }
  if (!state.online) { showToast('Dictée indisponible hors connexion : utilisez le micro du clavier dans le champ ci-dessous.'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'fr-CA';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let transcript = '';
  recognition.onresult = (e) => {
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript + ' ';
  };
  recognition.onerror = (e) => {
    state.recording = false;
    state.error = (e && e.error === 'not-allowed')
      ? "Accès au micro refusé. Autorisez-le dans les réglages, ou dictez avec le micro du clavier dans le champ texte."
      : 'La reconnaissance vocale a échoué. Réessayez, ou dictez avec le micro du clavier dans le champ texte.';
    render();
  };
  recognition.onend = () => {
    state.recording = false; render();
    const t = transcript.trim();
    if (t) { submitTranscript(t); render(); }
  };
  state.recording = true; state.error = null; render();
  try { recognition.start(); } catch (e) { state.recording = false; render(); }
}

// La note brute est gardée telle quelle sur l'appareil ; le serveur la met en
// forme (IA) au moment de l'envoi.
function submitTranscript(transcript) {
  const compId = state.activeId;
  if (!compId) return;
  applyComponentPatch(compId, { note: transcript });
  enqueue({ type: 'note', compId, dossierId: state.dossier && state.dossier.id, transcript });
}

function onNoteFallbackSend() {
  const val = (state.noteDraft || '').trim();
  if (!val) return;
  state.noteDraft = '';
  submitTranscript(val);
  render();
}

function saveFiche() {
  if (!state.activeId) return;
  const id = state.activeId;
  applyComponentPatch(id, { done: 1 });
  enqueue({ type: 'patchComponent', compId: id, dossierId: state.dossier && state.dossier.id, patch: { done: 1 } });
  state.screen = 'liste';
  render();
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

function saveDossierPatch(patch) {
  if (!state.dossier) return;
  state.dossier = Object.assign({}, state.dossier, patch);
  enqueue({ type: 'patchDossier', dossierId: state.dossier.id, patch });
  setSaveStatus('immStatus', state.online ? 'Enregistrement…' : 'Sur l’appareil');
}

function saveBatiment() {
  saveDossierPatch({ batiment_info: JSON.stringify(state.batiment || {}) });
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

function saveDossierField(field, value) {
  const patch = {}; patch[field] = value;
  saveDossierPatch(patch);
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
  // Le rapport est produit par le serveur : des saisies encore en file n'y
  // figureraient pas. On vide la file d'abord.
  if (state.pendingOps.length) {
    await flush();
    if (state.pendingOps.length) { showToast('Des saisies sont encore en attente d’envoi : réessayez dans un instant.'); return; }
  }
  const key = kind === 'docx' ? 'downloadingDocx' : 'downloadingXlsx';
  state[key] = true; state.error = null; render();
  try {
    const res = await apiFetch(`/api/dossiers/${state.dossier.id}/report.${kind}`, {}, { timeout: 180000 });
    if (!res.ok) throw new Error("Le rapport n'est pas disponible pour le moment.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(state.dossier.name)}-rapport.${kind}`;
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

// Re-rendu déclenché en arrière-plan (envoi terminé, photo chargée, réseau
// revenu…) : si l'utilisateur est en train d'écrire, on attend qu'il quitte le
// champ, sinon le texte pas encore enregistré serait effacé par le re-rendu.
let deferredRender = false;
function isTyping() {
  const a = document.activeElement;
  return !!(a && root.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'file')));
}
function softRender() {
  if (isTyping()) { deferredRender = true; updateSyncUi(); return; }
  deferredRender = false;
  render();
}

function screenHtml() {
  if (state.screen === 'login') return loginHtml();
  return `<div class="app-shell">${offlineBarHtml()}<div id="syncBar">${syncBarInner()}</div>${errorBannerHtml()}${bodyForScreen()}</div>`;
}

function syncBarInner() {
  const n = state.pendingOps.length;
  if (!n) return '';
  const photos = state.pendingOps.filter(o => o.type === 'photo').length;
  const label = `${n} saisie${n > 1 ? 's' : ''} en attente d’envoi${photos ? ` · dont ${photos} photo${photos > 1 ? 's' : ''}` : ''}`;
  let action;
  if (!state.online) action = `<span class="sync-now muted">Au retour du réseau</span>`;
  else if (state.syncing) action = `<span class="sync-now muted">Envoi…</span>`;
  else action = `<button class="sync-now" data-action="sync-now">Envoyer</button>`;
  return `<div class="sync-bar"><i data-lucide="${state.syncing ? 'loader-2' : 'cloud-upload'}" class="${state.syncing ? 'spin' : ''}"></i><span class="txt">${label}</span>${action}</div>`;
}

function updateSyncUi() {
  const el = document.getElementById('syncBar');
  if (!el) return;
  el.innerHTML = syncBarInner();
  if (window.lucide && el.querySelector('[data-lucide]')) window.lucide.createIcons();
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
  if (state.online) return '';
  return `<div class="offline-bar"><i data-lucide="wifi-off"></i>Hors connexion — vos saisies restent sur l’appareil</div>`;
}

function errorBannerHtml() {
  if (!state.error) return '';
  return `<div class="error-banner"><i data-lucide="alert-triangle"></i><div class="msg">${esc(state.error)}</div><button data-action="dismiss-error" aria-label="Fermer"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>`;
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
      <button data-action="logout" style="border:none;background:none;color:var(--ink-500);font-size:12px;cursor:pointer">Déconnexion</button>
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
    <div class="stats-grid">
      <div class="stat-tile"><div class="num">${st.photosTotal}</div><div class="lbl">Photos</div></div>
      <div class="stat-tile"><div class="num accent">${st.critical}</div><div class="lbl">À traiter</div></div>
      <div class="stat-tile"><div class="num">${st.todo}</div><div class="lbl">À faire</div></div>
    </div>
    ${state.aiAvailable === false ? `<div class="warn-banner"><i data-lucide="alert-triangle"></i><div><b>IA non configurée sur le serveur.</b> L'analyse photo donnera seulement une estimation selon l'âge, et les notes ne seront pas reformulées.</div></div>` : ''}
    <button class="nav-card" data-action="go-immeuble">
      <div class="icon"><i data-lucide="clipboard-list"></i></div>
      <div class="mid">
        <div class="t">Fiche d'immeuble</div>
        <div class="s">${immCount ? immCount + ' réponse' + (immCount > 1 ? 's' : '') + ' consignée' + (immCount > 1 ? 's' : '') : 'Documents, caractéristiques, derniers remplacements'}</div>
      </div>
      <i data-lucide="chevron-right" class="go"></i>
    </button>
    <div class="ai-banner">
      <div class="icon"><i data-lucide="sparkles"></i></div>
      <div>
        <div class="title">Checklist générée par l'IA</div>
        <div class="body">${st.total} composante${st.total > 1 ? 's' : ''} identifiée${st.total > 1 ? 's' : ''} pour ce dossier. Ajustez sur le terrain au fil de la visite.</div>
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

function listeHtml() {
  const st = computeStats();
  const chips = [
    { key: 'all', label: 'Tout', count: st.total },
    { key: 'todo', label: 'À faire', count: st.todo },
    { key: 'done', label: 'Fait', count: st.done },
    { key: 'action', label: 'Action requise', count: st.critical },
  ];
  const chipsHtml = chips.map(c => `<button class="chip ${state.filter === c.key ? 'on' : ''}" data-action="filter" data-filter="${c.key}">${c.label} · ${c.count}</button>`).join('');
  const groups = computeGroups();
  const missingAI = state.components.filter(c => c.ai_suggested && !c.done).length;
  const groupsHtml = groups.map(g => `
    <div class="grp">
      <div class="grp-hdr"><i data-lucide="${g.icon}"></i><span class="lbl">${esc(g.label)}</span><span class="cnt">${g.done}/${g.total}</span><div class="rule"></div></div>
      ${g.items.map(rowHtml).join('')}
    </div>`).join('');
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
    const icon = state.online ? 'loader-2' : 'image-off';
    return `<div class="photo-thumb ${url ? '' : 'loading'} ${p.local ? 'pending' : ''}">${url ? `<img src="${url}" alt="">` : `<i data-lucide="${icon}"></i>`}${url ? `<div class="tag">${esc(p.tag || '')}</div>` : ''}</div>`;
  }).join('');

  const aiCardHtml = state.aiResult ? aiResultHtml(state.aiResult, c) : '';

  // Le champ texte est toujours là : la dictée du navigateur exige du réseau et
  // n'existe pas partout (iPhone), alors que le micro du clavier fonctionne sur
  // tous les téléphones, souvent même hors ligne.
  const micBtn = state.speechSupported && state.online ? `
    <button class="mic-btn ${state.recording ? 'rec' : ''}" data-action="toggle-voice">
      <i data-lucide="mic" class="${state.recording ? 'pulse' : ''}"></i>${state.recording ? 'Écoute… touchez pour arrêter' : 'Dicter une note'}
    </button>` : '';
  const micSection = `${micBtn}
    <div class="note-fallback">
      <textarea id="noteFallbackText" data-role="note-fallback-text" placeholder="Écrivez votre note, ou touchez le micro du clavier pour la dicter…">${esc(state.noteDraft)}</textarea>
      <button class="send" data-action="note-fallback-send">Enregistrer la note</button>
    </div>`;

  const notePending = state.pendingOps.some(o => o.type === 'note' && o.compId === c.id);
  const noteCard = c.note ? `<div class="note-card"><div class="note-card-hdr"><i data-lucide="${notePending ? 'clock' : 'sparkles'}"></i><span>${notePending ? 'Note — mise en forme au retour du réseau' : 'Note structurée'}</span></div><div class="note-card-body">${esc(c.note)}</div></div>` : '';

  const delaiChips = DELAIS.map(d => `<button class="quick-chip ${c.delai_suggere === d ? 'on' : ''}" data-action="pick-delai" data-val="${esc(d)}">${esc(d)}</button>`).join('');

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
        <button class="photo-add ${state.uploadingPhoto ? 'uploading' : ''}" data-action="add-photo" ${state.uploadingPhoto ? 'disabled' : ''}>
          <i data-lucide="${state.uploadingPhoto ? 'loader-2' : 'camera'}"></i><span>${state.uploadingPhoto ? 'Préparation…' : 'Photo'}</span>
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

      <div class="section-lbl" style="margin-top:26px">Observations</div>
      ${obsFieldHtml('observationInput', 'comp-textarea', 'observation', 'Observation', c.observation, 'Ce qui est constaté sur place…')}
      ${obsFieldHtml('causeInput', 'comp-textarea', 'cause_possible', 'Cause possible', c.cause_possible, 'Origine probable du constat…')}

      <div class="obs-field">
        <label for="delaiInput">Délai suggéré</label>
        <input id="delaiInput" class="fld-input" data-role="comp-text" data-field="delai_suggere" value="${esc(c.delai_suggere || '')}" placeholder="ex. à court terme">
        <div class="quick-chips">${delaiChips}</div>
      </div>

      ${obsFieldHtml('consequencesInput', 'comp-textarea', 'consequences', 'Conséquences additionnelles', c.consequences, 'Si rien n’est fait…')}

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

      <div class="derived-card ${rep && rep.delta < 0 ? 'late' : ''}">
        <div class="k">Année anticipée de remplacement</div>
        <div class="v">${rep ? rep.year : '—'}</div>
        <div class="s">${esc(repSub)}</div>
      </div>

      <div class="section-lbl" style="margin-top:26px">Attributs</div>
      ${attributsHtml(c)}

      <div class="section-lbl" style="margin-top:26px">Note vocale</div>
      ${micSection}
      ${noteCard}
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
      ${line('Observation', r.observation)}
      ${line('Cause possible', r.causePossible)}
      ${line('Délai suggéré', r.delaiSuggere)}
      ${line('Conséquences', r.consequences)}
      ${line('Coût de remplacement', cost)}
      ${r.source === 'heuristique' ? `<div class="ai-warn">IA indisponible : cote estimée d'après l'âge et la durée de vie seulement. Vérifiez sur place.</div>` : ''}
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
    case 'add-photo': triggerPhotoInput(); break;
    case 'analyze': analyze(); break;
    case 'apply-ai': applyAi(); break;
    case 'set-rating': onRatingClick(t.dataset.rating); break;
    case 'toggle-rflag': onRflagClick(); break;
    case 'set-facet': onFacetClick(t.dataset.field, t.dataset.val); break;
    case 'toggle-facets': state.facetsOpen = !state.facetsOpen; render(); break;
    case 'pick-delai': if (saveCompField('delai_suggere', t.dataset.val, { force: true })) render(); break;
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
    case 'generate-reports': generateReports(); break;
    case 'dismiss-error': state.error = null; render(); break;
    case 'logout': logout(); break;
    case 'sync-now': flush(); break;
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

// Après chaque sortie de champ : effectue un re-rendu mis en attente pendant la
// saisie (une fois le champ enregistré, plus rien à perdre).
function onRootFocusoutAfter() {
  if (!deferredRender) return;
  setTimeout(() => { if (deferredRender && !isTyping()) { deferredRender = false; render(); } }, 0);
}

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
root.addEventListener('focusout', onRootFocusoutAfter);
root.addEventListener('submit', onRootSubmit);

window.addEventListener('online', () => {
  state.online = true;
  softRender();
  checkHealth();
  flush();
});
window.addEventListener('offline', () => {
  state.online = false;
  showToast('Hors connexion — vos saisies sont conservées sur l’appareil.');
  softRender();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
// Filet : navigator.onLine peut rester « vrai » sans que le serveur réponde
// (signal faible). La file est retentée régulièrement tant qu'elle n'est pas vide.
setInterval(() => { if (state.pendingOps.length) flush(); }, 30000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
