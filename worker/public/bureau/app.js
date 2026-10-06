// ============================================================
// Console Bureau — Condo Stratégis
// Vanilla-JS SPA, no build step. Talks to the real `vigies` API.
// ============================================================

import { creerBibliotheque } from '../shared/bibliotheque.js';
import { creerModeles } from '../shared/modeles.js';
import { creerTriPhotos } from './tri-photos.js';

const TOKEN_KEY = 'cs_bureau_token';

/* ---------- Taxonomie maison : les catégories de la feuille « Relevé », plus les piscines ---------- */

const CAT_ORDER = ['terrain', 'structure', 'enveloppe', 'ouvertures', 'balcons', 'interieur', 'equipements', 'cvac', 'electrique', 'plomberie', 'piscines'];
const CATS = {
  terrain:     { label: 'Terrain et aménagement',                            short: 'Terrain',            icon: 'trees' },
  structure:   { label: 'Fondation, structure et stationnements intérieurs', short: 'Structure',          icon: 'layers' },
  enveloppe:   { label: 'Enveloppe du bâtiment',                             short: 'Enveloppe',          icon: 'layout-grid' },
  ouvertures:  { label: 'Portes extérieures et fenêtres',                    short: 'Portes et fenêtres', icon: 'door-open' },
  balcons:     { label: 'Balcons, escaliers et terrasses',                   short: 'Balcons',            icon: 'fence' },
  interieur:   { label: 'Intérieur du bâtiment',                             short: 'Intérieur',          icon: 'sofa' },
  equipements: { label: 'Appareils, installations et équipements spéciaux',  short: 'Équipements',        icon: 'boxes' },
  cvac:        { label: 'Systèmes de chauffage et ventilation',              short: 'CVAC',               icon: 'fan' },
  electrique:  { label: 'Installations électriques',                         short: 'Électricité',        icon: 'zap' },
  plomberie:   { label: "Installations de plomberie, d'eau et d'égout",      short: 'Plomberie',          icon: 'droplets' },
  piscines:    { label: 'Piscines et centre aquatique',                      short: 'Piscines',           icon: 'waves' },
};
const CAT_AUTRES = { label: 'Autres', short: 'Autres', icon: 'box' };
function catInfo(key) { return CATS[key] || CAT_AUTRES; }

/* ---------- Cote de terrain : 1-4 + na (échelle condition + action) ---------- */

const RATINGS = [
  { v: 1, label: 'Bon état',            pill: 'Bon état',         color: '#1F8A4E', bg: '#E6F2EB' },
  { v: 2, label: 'Entretien normal',    pill: 'Entretien norm.',  color: '#1F1F1F', bg: '#EFEFEF' },
  { v: 3, label: 'Entretien requis',    pill: 'Entretien requis', color: '#FF8466', bg: '#FFE4DB' },
  { v: 4, label: 'Remplacement requis', pill: 'Remplac. requis',  color: '#E8492A', bg: '#FFE4DB' },
];
const RATING_NA = { v: null, key: 'na', label: 'Non applicable', pill: 'na', color: '#6B6B6B', bg: '#EFEFEF' };
function ratingInfo(v) { return RATINGS.find(r => r.v === v) || null; }

/* ---------- Cote du rapport : échelle à 3 niveaux, distincte de la cote de terrain ---------- */

const COTES_RAPPORT = {
  bon:      { key: 'Bon',      label: 'Bon',      long: 'Bon',                                              color: '#1F8A4E', bg: '#E6F2EB' },
  passable: { key: 'Passable', label: 'Passable', long: 'Passable — nécessite un entretien',                color: '#FF8466', bg: '#FFE4DB' },
  mauvais:  { key: 'Mauvais',  label: 'Mauvais',  long: "Mauvais — requiert la planification d'un remplacement", color: '#E8492A', bg: '#FFE4DB' },
};
function coteRapportInfo(v) {
  if (v == null) return null;
  return COTES_RAPPORT[String(v).trim().toLowerCase()] || null;
}

/* ---------- Facettes ---------- */

const POSITIONS = [
  { v: 'AV',  label: 'Avant' },
  { v: 'GA',  label: 'Gauche' },
  { v: 'ARR', label: 'Arrière' },
  { v: 'DR',  label: 'Droite' },
];
const EMPLACEMENTS = [
  { v: 'corridors',     label: 'Corridors' },
  { v: 'escaliers',     label: 'Escaliers' },
  { v: 'stationnement', label: 'Stationnement' },
];
function emplacementLabel(v) {
  const e = EMPLACEMENTS.find(x => x.v === v);
  return e ? e.label : (v || '');
}

/* ---------- Sections de rédaction servies par /api/components/:id/redaction ---------- */

const SECTION_ORDER = ['etat', 'duree_vie', 'entretien', 'attention'];
const SECTION_ICONS = { etat: 'clipboard-check', duree_vie: 'timer', entretien: 'wrench', attention: 'alert-triangle' };

/* ---------- Fiche d'immeuble (lecture seule, remplie sur le terrain) ---------- */

const IMM_DOCS = [
  ['declaration_copropriete', 'Déclaration de copropriété'],
  ['certificat_localisation', 'Certificat de localisation'],
  ['plans_construction',      'Plans de construction'],
  ['plans_structure',         'Plans de structure'],
  ['plans_mecaniques',        'Plans mécaniques'],
  ['plan_amenagement_ext',    "Plan d'aménagement extérieur"],
  ['rapports_inspection',     "Rapports d'inspection / déficiences"],
  ['rapports_travaux',        'Rapports de travaux « grands projets »'],
  ['carnet_entretien',        "Carnet d'entretien"],
];
// Mêmes clés et mêmes types qu'au terrain : la fiche se remplit d'un côté
// ou de l'autre, et le serveur en tire les mêmes règles.
const IMM_CARACS = [
  { k: 'annee_construction',      q: 'Année de construction',                                type: 'year' },
  { k: 'date_conversion',         q: 'Date de conversion (immeuble converti en copropriété)', type: 'year' },
  { k: 'nb_stationnements_int',   q: "Espaces de stationnement intérieurs",                  type: 'number' },
  { k: 'gicleurs',                q: "Présence d'un système de gicleurs",                    type: 'ouinon' },
  { k: 'gicleurs_ou',             q: 'Où ? (stationnement, RDC, étages)',                    type: 'text', si: 'gicleurs' },
  { k: 'unites_gicleurs',         q: 'Unités protégées par un système de gicleurs',          type: 'ouinon' },
  { k: 'nb_ascenseurs',           q: "Systèmes d'ascenseur",                                 type: 'number' },
  { k: 'generatrice',             q: 'Génératrice',                                          type: 'ouinon' },
  { k: 'generatrice_carburant',   q: 'Carburant de la génératrice', type: 'choice', si: 'generatrice', vals: { mazout: 'Mazout', gaz_naturel: 'Gaz naturel' } },
  { k: 'piscine_interieure',      q: 'Piscine intérieure',                                   type: 'ouinon' },
  { k: 'piscine_exterieure',      q: 'Piscine extérieure',                                   type: 'ouinon' },
  { k: 'nb_terrasses_toiture',    q: 'Terrasses au niveau toiture',                          type: 'number' },
  { k: 'fenetres_privatives',     q: 'Fenêtres considérées privatives',                      type: 'ouinon' },
  { k: 'portes_privatives',       q: 'Portes considérées privatives',                        type: 'ouinon' },
  { k: 'portes_patio_privatives', q: 'Portes-patio considérées privatives',                  type: 'ouinon' },
  { k: 'balcons_privatifs',       q: 'Balcons considérés privatifs',                         type: 'ouinon' },
  { k: 'elements_pcur',           q: 'Éléments considérés PCUR',                             type: 'ouinon' },
  { k: 'cles_repartition_pcur',   q: 'Clés de répartition PCUR disponibles',                 type: 'ouinon' },
  { k: 'acces_toiture',           q: 'Accès sécuritaire à la toiture',                       type: 'ouinon' },
];
const IMM_REMPLACEMENTS = [
  ['pavage',             'Pavage'],
  ['revetement_toiture', 'Revêtement de toiture'],
  ['portes',             'Portes'],
  ['portes_patio',       'Portes-patio'],
  ['fenetres',           'Fenêtres'],
  ['calfeutrant',        'Calfeutrant'],
  ['balcons',            'Balcons'],
  ['revetement_ext_1',   'Revêtement extérieur 1'],
  ['revetement_ext_2',   'Revêtement extérieur 2'],
  ['autre_revetement',   'Autre revêtement'],
  ['autre_1',            'Autre 1'],
  ['autre_2',            'Autre 2'],
];
const IMM_ENTRETIENS = [
  ['cvac_communs',             'Chauffage / ventilation des espaces communs'],
  ['chauffage_stationnement',  'Chauffage des stationnements intérieurs'],
  ['ventilation_stationnement','Ventilation des stationnements intérieurs'],
  ['ventilation_secheuses',    'Ventilation « sorties sécheuses »'],
  ['evacuation_plomberie',     'Évacuation — plomberie sanitaire'],
  ['autre_systeme_1',          'Autre système 1'],
  ['autre_systeme_2',          'Autre système 2'],
];
const IMM_DOC_VALS = { oui: 'Reçu', non: 'Non reçu', nd: 'Non disponible' };
const IMM_OUI_NON = { oui: 'Oui', non: 'Non', nd: 'nd' };

// --- Banque de prix ---
// Une unité non quantifiée (le forfait) n'a pas de prix au pi² : le montant
// est son propre prix unitaire, et la quantité n'est pas demandée.
const PRIX_UNITES = [
  { v: 'pi2', label: 'pi²', quantifie: true },
  { v: 'pi_lin', label: 'pi lin.', quantifie: true },
  { v: 'unite', label: 'unité', quantifie: true },
  { v: 'forfait', label: 'forfait', quantifie: false },
];
const PRIX_PORTEES = [
  { v: 'complet', label: 'Remplacement complet' },
  { v: 'partiel', label: 'Remplacement partiel' },
  { v: 'reparation', label: 'Réparation' },
];
const PRIX_SOURCES = [
  { v: 'facture', label: 'Facture' },
  { v: 'soumission', label: 'Soumission' },
];
function prixUniteInfo(v) { return PRIX_UNITES.find(u => u.v === v) || PRIX_UNITES[0]; }
const PRIX_FORM_VIDE = {
  description: '', cat: '', uniformat_code: '', dossier_id: '', annee: '',
  montant: '', quantite: '', unite: 'pi2', portee: 'complet', source: 'facture',
  negocie: false, fournisseur: '', ville: '', unites: '', source_ref: '', note: '',
};

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
const state = {
  booting: true,
  screen: 'login', // login | dossiers | revision | publier | reviewIA
  token: null,
  user: null,

  loginEmail: '',
  loginPassword: '',
  loginLoading: false,
  loginError: null,
  companyLogoUrl: null,

  filter: 'review',
  dossiers: [],
  dossiersLoading: false,
  dossiersError: null,

  dossierId: null,
  dossier: null,
  components: [],
  projection: null,
  revisionLoading: false,
  revisionError: null,
  revisionFlashError: null,
  selectedScenarioCode: null,
  saveStatus: 'idle', // idle | saving | saved | error
  expanded: {},            // id de composante -> panneau de détail ouvert
  batiment: {},            // contenu de dossiers.batiment_info (lecture seule ici)
  batimentOpen: false,
  composantesImportUploading: false,
  composantesImportError: null,
  composantesImportNote: null,

  reviewIdx: 0,
  reviewPhotos: [],
  reviewPhotosLoading: false,
  reviewObjectUrls: [],
  redaction: null,         // réponse de POST /api/components/:id/redaction
  redactionLoading: false,
  redactionError: null,
  redactionMissing: false, // l'endpoint n'existe pas encore (404)
  redactionCache: {},      // id de composante -> rédaction déjà servie
  attentionOpen: false,    // section « attention spéciale » inactive dépliée
  attn: { compId: null, liste: [], redige: {}, erreur: null, sauve: '[]' }, // attentions spéciales de la composante révisée
  banqueDirty: false,      // un texte vient d'être versé à la banque

  publishing: false,
  publishError: null,
  inactifs: [],               // composantes retirées de l'étude (actif = 0)
  inactifsOuverts: false,
  lot: { ouvert: false, choix: { bon: true, na: true, normal: false }, enCours: false, note: null },
  saisie: { ouvert: false, tous: false, ids: [], brouillon: {} },
  sansPhoto: { ouvert: false, chargement: false, choix: {}, enCours: false },
  couts: { ouvert: false, donnees: null, erreur: null, choix: {}, enCours: false },
  publication: null,          // GET /api/dossiers/:id/publication
  publicationErreur: null,
  publicationResultat: null,  // { avises, echecs } après une publication
  pdfEnvoi: false,

  // Analyse des photos par l'IA, depuis le bureau : { enCours, faits, total, note }.
  analyse: { enCours: false, faits: 0, total: 0, note: null },

  // Ajout d'une composante depuis le bureau.
  addCompOpen: false,
  addComp: { name: '', cat: 'enveloppe', uniformat_code: '' },
  addCompSaving: false,
  addCompError: null,

  prixRows: [],
  prixResume: null,
  prixLoading: false,
  prixError: null,
  prixFilter: 'a_valider',   // a_valider | valides | tous
  prixForm: Object.assign({}, PRIX_FORM_VIDE),
  prixFormOpen: false,
  prixFormError: null,
  prixSaving: false,
  prixBusyId: null,          // ligne en cours de validation ou de suppression
  prixEditId: null,          // ligne en cours de modification (sinon : saisie neuve)

  prixCrm: null,             // candidats servis par /api/prix/crm
  prixCrmDispo: true,        // false quand l'entreprise n'a pas accès au CRM
  prixCrmLoading: false,
  prixCrmError: null,
  prixCrmSel: {},            // clé de candidat -> sélectionné
  prixCrmDetail: {},         // clé de candidat -> pièces dépliées
  prixCrmImporting: false,
};

// ---------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('fr-CA').replace(/[  ,]/g, ' ');
}
function parseNum(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/[^0-9]/g, '');
  if (cleaned === '') return null;
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}
// Les montants d'une facture ont des décimales et arrivent à la québécoise
// (« 12 450,75 $ ») : parseNum, qui ne garde que les chiffres, les fausserait.
function parseDecimal(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/\s/g, '').replace(/[^0-9,.-]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}
// Un prix unitaire sous 100 $ se lit aux cents ; au-delà, l'arrondi au dollar suffit.
function fmtPrix(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) < 100) {
    return (Math.round(n * 100) / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return fmt(n);
}
// L'année de construction ou de réparation accepte une valeur libre
// (« vers 1998 », « inconnue ») comme sur le terrain.
function parseYear(text) {
  const v = String(text == null ? '' : text).trim();
  if (v === '') return null;
  if (/^\d{4}$/.test(v)) return parseInt(v, 10);
  return v;
}
function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(raw);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}
// Année anticipée de remplacement = année de construction ou réparation + durée de vie utile.
function replacementYear(c) {
  const yr = parseNum(c && c.install_year);
  const vu = parseNum(c && c.useful_life_years);
  if (!yr || !vu) return null;
  const year = yr + vu;
  return { year, delta: year - new Date().getFullYear() };
}
function facetSuffix(c) {
  const bits = [];
  if (c.variante) bits.push(c.variante);
  if (c.position) bits.push(c.position);
  if (c.emplacement) bits.push(emplacementLabel(c.emplacement));
  return bits.join(' · ');
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
function spinnerBlock(label) {
  return `<div class="spinner-block"><i data-lucide="loader-2" class="spin" style="width:16px;height:16px"></i>${escapeHtml(label)}</div>`;
}
function errorBanner(msg, retryAction) {
  return `<div class="error-banner"><i data-lucide="alert-triangle" style="width:16px;height:16px;color:var(--accent-press);flex-shrink:0"></i><span>${escapeHtml(msg)}</span>${retryAction ? `<button data-action="${retryAction}">Réessayer</button>` : ''}</div>`;
}

// ---------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------
function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (state.token) h['Authorization'] = 'Bearer ' + state.token;
  return h;
}
function handleUnauthorized() {
  state.token = null;
  state.user = null;
  bib.reset();
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  state.screen = 'login';
  state.loginError = 'Votre session a expiré. Veuillez vous reconnecter.';
  render();
}
async function apiRaw(path, opts) {
  opts = opts || {};
  const res = await fetch(path, Object.assign({}, opts, { headers: authHeaders(opts.headers) }));
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }
  return res;
}
async function apiJson(path, opts) {
  opts = opts || {};
  const isForm = opts.body instanceof FormData;
  const headers = isForm
    ? authHeaders(opts.headers || {})
    : authHeaders(Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}));
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    throw new Error((data && data.error) || `Erreur ${res.status}`);
  }
  return data;
}

async function loadCompanyLogo() {
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  const co = state.user && state.user.company;
  if (!co || !co.hasLogo) { render(); return; }
  try {
    const res = await apiRaw(`/api/companies/${co.id}/logo`);
    if (!res.ok) throw new Error('logo indisponible');
    const blob = await res.blob();
    state.companyLogoUrl = URL.createObjectURL(blob);
  } catch (e) {
    state.companyLogoUrl = null;
  }
  render();
}

// ---------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------
function enrichDossier(d) {
  const stats = d.stats || { total: 0, done: 0, todo: 0, critical: 0, photosTotal: 0, pct: 0 };
  const pct = stats.pct || 0;
  const reviewReady = pct === 100 && !d.published_at;
  let statusLabel, statusBg, statusColor;
  if (d.published_at) { statusLabel = 'Publié'; statusBg = 'var(--green-wash)'; statusColor = 'var(--green)'; }
  else if (reviewReady) { statusLabel = 'À réviser'; statusBg = 'var(--orange-wash)'; statusColor = 'var(--accent-press)'; }
  else { statusLabel = 'Terrain'; statusBg = 'var(--ink-100)'; statusColor = 'var(--ink-600)'; }
  return Object.assign({}, d, {
    stats, _pct: pct, _reviewReady: reviewReady,
    _barColor: reviewReady ? 'var(--green)' : 'var(--orange)',
    _statusLabel: statusLabel, _statusBg: statusBg, _statusColor: statusColor,
  });
}
function orderedComponents() {
  const byCat = {};
  CAT_ORDER.forEach(k => byCat[k] = []);
  const rest = [];
  state.components.forEach(c => { (byCat[c.cat] || rest).push(c); });
  const ordered = [];
  CAT_ORDER.forEach(k => ordered.push.apply(ordered, byCat[k]));
  ordered.push.apply(ordered, rest);
  return ordered;
}
// Les composantes portant une clé de catégorie inconnue ou héritée sont
// regroupées sous « Autres » plutôt que de faire échouer l'affichage.
function groupedComponents() {
  const byCat = {};
  CAT_ORDER.forEach(k => byCat[k] = []);
  const autres = [];
  state.components.forEach(c => {
    if (byCat[c.cat]) byCat[c.cat].push(c);
    else autres.push(c);
  });
  const groups = CAT_ORDER
    .map(k => ({ key: k, label: CATS[k].label, icon: CATS[k].icon, rows: byCat[k] }))
    .filter(g => g.rows.length > 0);
  if (autres.length) groups.push({ key: 'autres', label: CAT_AUTRES.label, icon: CAT_AUTRES.icon, rows: autres });
  return groups;
}
function confirmedCount() { return state.components.filter(c => c.confirmed === 1).length; }
function allConfirmed() { return state.components.length > 0 && state.components.every(c => c.confirmed === 1); }

// Ordonne les sections servies par le générateur selon l'ordre de la feuille,
// en conservant à la fin toute section inattendue.
function orderedSections(sections) {
  const list = Array.isArray(sections) ? sections.slice() : [];
  const known = [];
  SECTION_ORDER.forEach(cle => {
    const found = list.filter(s2 => s2 && s2.cle === cle);
    found.forEach(f => known.push(f));
  });
  const extras = list.filter(s2 => !s2 || SECTION_ORDER.indexOf(s2.cle) === -1);
  return known.concat(extras);
}

/* ---------- Fiche d'immeuble (lecture seule) ---------- */

function immVal(sec, key) {
  const s2 = state.batiment && state.batiment[sec];
  const v = s2 ? s2[key] : null;
  return (v == null || v === '') ? null : String(v);
}
function batimentFilled() {
  const b = state.batiment || {};
  return Object.keys(b).reduce((a, sec) => a + Object.keys(b[sec] || {}).length, 0);
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------
async function boot() {
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  if (token) {
    state.token = token;
    try {
      state.user = await apiJson('/api/auth/me');
      state.booting = false;
      state.screen = 'dossiers';
      render();
      loadDossiers();
      loadCompanyLogo();
      return;
    } catch (e) {
      state.token = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e2) {}
    }
  }
  state.booting = false;
  state.screen = 'login';
  render();
}

async function doLogin(email, password) {
  if (state.loginLoading) return;
  state.loginLoading = true;
  state.loginError = null;
  render();
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || 'Identifiants invalides.');
    state.token = data.token;
    try { localStorage.setItem(TOKEN_KEY, data.token); } catch (e) {}
    state.user = data.user || null;
    if (!state.user) {
      try { state.user = await apiJson('/api/auth/me'); } catch (e) {}
    }
    state.loginLoading = false;
    state.loginError = null;
    state.screen = 'dossiers';
    render();
    loadDossiers();
    loadCompanyLogo();
  } catch (e) {
    state.loginLoading = false;
    state.loginError = e.message || 'Erreur de connexion.';
    state.loginPassword = '';
    render();
  }
}

function doLogout() {
  if (!quitterEnvoiPhotos()) return;
  revokeReviewPhotos();
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  state.token = null;
  state.user = null;
  bib.reset();
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  state.screen = 'login';
  state.dossiers = [];
  state.dossier = null;
  state.components = [];
  state.projection = null;
  state.dossierId = null;
  state.batiment = {};
  state.expanded = {};
  state.redaction = null;
  state.redactionCache = {};
  state.loginError = null;
  render();
}

async function loadDossiers() {
  state.dossiersLoading = true;
  state.dossiersError = null;
  render();
  try {
    const [data] = await Promise.all([apiJson('/api/dossiers'), chargerMembres()]);
    state.dossiers = Array.isArray(data) ? data : [];
    state.dossiersLoading = false;
    render();
  } catch (e) {
    state.dossiersLoading = false;
    state.dossiersError = e.message || 'Impossible de charger les dossiers.';
    render();
  }
}

// ---------------------------------------------------------------
// Suivi des dossiers : responsable et échéance
// ---------------------------------------------------------------
const suivi = { membres: null, admin: false, moi: null, responsable: '', erreur: null };

async function chargerMembres() {
  if (suivi.membres || !idFirme()) return;
  try {
    const r = await apiJson(`/api/companies/${idFirme()}/membres`);
    suivi.membres = r.membres || []; suivi.admin = !!r.admin; suivi.moi = r.moi;
  } catch (e) { suivi.membres = null; }
}

async function majSuivi(id, corps) {
  suivi.erreur = null;
  try {
    const r = await apiJson(`/api/dossiers/${id}/suivi`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    state.dossiers = state.dossiers.map(d => (d.id === id ? Object.assign({}, d, { assigne_a: r.assigne_a, echeance: r.echeance, assigne: r.assigne }) : d));
  } catch (e) {
    suivi.erreur = e.message || 'Modification refusée.';
  }
  render();
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);
function dateCourte(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
}
const enRetard = (d) => !!d.echeance && !d.published_at && d.echeance < aujourdhui();

function suiviCelluleHtml(d) {
  const moi = suivi.moi;
  const mien = d.assigne_a && d.assigne_a === moi;
  const modifiable = suivi.admin || mien;
  let qui;
  if (suivi.admin && suivi.membres) {
    qui = `<select class="suivi-select" data-role="suivi-assigne" data-id="${d.id}">
      <option value="">Non assigné</option>
      ${suivi.membres.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === d.assigne_a ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      ${d.assigne_a && !suivi.membres.some(m => m.id === d.assigne_a) ? `<option value="${escapeHtml(d.assigne_a)}" selected>${escapeHtml((d.assigne && d.assigne.name) || 'Ancien membre')}</option>` : ''}
    </select>`;
  } else if (!d.assigne_a) {
    qui = `<button class="lien-revision" data-action="suivi-prendre" data-id="${d.id}">Prendre ce dossier</button>`;
  } else {
    qui = `<div class="dt-resp">${escapeHtml((d.assigne && d.assigne.name) || '—')}${mien ? ` <button class="lien-mini" data-action="suivi-retirer" data-id="${d.id}">me retirer</button>` : ''}</div>`;
  }
  const retard = enRetard(d);
  const date = modifiable
    ? `<input type="date" class="suivi-date ${retard ? 'retard' : ''}" data-role="suivi-echeance" data-id="${d.id}" value="${escapeHtml(d.echeance || '')}" title="Échéance">`
    : (d.echeance ? `<div class="dt-sub ${retard ? 'txt-retard' : ''}">Échéance ${escapeHtml(dateCourte(d.echeance))}</div>` : '');
  return `${qui}${date}${retard ? '<div class="dt-sub txt-retard">En retard</div>' : ''}`;
}

function tuilesHtml(rows) {
  const unAn = new Date(Date.now() - 365 * 864e5).toISOString();
  const tuiles = [
    { cle: 'field', lib: 'Sur le terrain', n: rows.filter(d => !d.published_at && d._pct < 100).length },
    { cle: 'review', lib: 'À réviser au bureau', n: rows.filter(d => d._reviewReady).length },
    { cle: 'late', lib: 'Échéance dépassée', n: rows.filter(enRetard).length, alerte: true },
    { cle: 'due', lib: 'Révisions aux 5 ans dues', n: rows.filter(d => d.revision_due).length, alerte: true },
    { cle: 'published', lib: 'Publiés depuis un an', n: rows.filter(d => d.published_at && d.published_at >= unAn).length },
  ];
  return `<div class="tuiles">${tuiles.map(t => `
    <button class="tuile ${state.filter === t.cle ? 'active' : ''} ${t.alerte && t.n ? 'alerte' : ''}" data-action="filter" data-filter="${t.cle}">
      <span class="tuile-n">${t.n}</span><span class="tuile-lib">${t.lib}</span>
    </button>`).join('')}</div>`;
}

// ---------------------------------------------------------------
// Banque de prix
// ---------------------------------------------------------------
async function loadPrix() {
  state.prixLoading = true;
  state.prixError = null;
  render();
  try {
    const [rows, resume] = await Promise.all([apiJson('/api/prix'), apiJson('/api/prix/resume')]);
    state.prixRows = Array.isArray(rows) ? rows : [];
    state.prixResume = resume || null;
  } catch (e) {
    state.prixError = e.message || 'Impossible de charger la banque de prix.';
  }
  state.prixLoading = false;
  render();
  // Le formulaire rattache une ligne à un dossier : sans la liste, le champ
  // serait vide alors que la firme a bel et bien des dossiers.
  if (state.dossiers.length === 0 && !state.dossiersLoading) loadDossiers();
  loadPrixCrm();
}

// Les factures que le CRM a déjà rattachées à une composante. Une entreprise
// sans accès au CRM reçoit un 403 : ce n'est pas une panne, la section
// n'existe simplement pas pour elle.
async function loadPrixCrm() {
  state.prixCrmLoading = true;
  state.prixCrmError = null;
  render();
  try {
    const res = await apiRaw('/api/prix/crm');
    if (res.status === 403) {
      state.prixCrmDispo = false;
      state.prixCrm = null;
    } else {
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.error ? data.error : `Erreur ${res.status}`);
      state.prixCrmDispo = true;
      state.prixCrm = data;
    }
  } catch (e) {
    state.prixCrmError = e.message || 'Impossible de joindre le CRM.';
  }
  state.prixCrmLoading = false;
  render();
}

function prixCrmSelection() {
  return Object.keys(state.prixCrmSel).filter(k => state.prixCrmSel[k]);
}

async function importerPrixCrm() {
  const cles = prixCrmSelection();
  if (cles.length === 0 || state.prixCrmImporting) return;
  state.prixCrmImporting = true;
  state.prixCrmError = null;
  render();
  try {
    await apiJson('/api/prix/crm/import', { method: 'POST', body: JSON.stringify({ cles }) });
    state.prixCrmSel = {};
    state.prixCrmImporting = false;
    state.prixFilter = 'a_valider';
    await loadPrix();
  } catch (e) {
    state.prixCrmImporting = false;
    state.prixCrmError = e.message || "L'import a échoué.";
    render();
  }
}

// Une ligne importée arrive sans quantité : la modification est ce qui lui
// permet d'en recevoir une, et donc de devenir un prix unitaire.
function ouvrirPrixEdition(id) {
  const row = state.prixRows.find(r => r.id === id);
  if (!row) return;
  state.prixForm = {
    description: row.description || '',
    cat: row.cat || '',
    uniformat_code: row.uniformat_code || '',
    dossier_id: row.dossier_id || '',
    annee: row.annee == null ? '' : String(row.annee),
    montant: row.montant == null ? '' : String(row.montant),
    quantite: row.quantite == null ? '' : String(row.quantite),
    unite: row.unite || 'pi2',
    portee: row.portee || '',
    source: row.source || 'facture',
    negocie: row.negocie === 1,
    fournisseur: row.fournisseur || '',
    ville: row.ville || '',
    unites: row.unites == null ? '' : String(row.unites),
    source_ref: row.source_ref || '',
    note: row.note || '',
  };
  state.prixEditId = id;
  state.prixFormOpen = true;
  state.prixFormError = null;
  render();
}

function fermerPrixForm() {
  state.prixFormOpen = false;
  state.prixEditId = null;
  state.prixFormError = null;
  state.prixForm = Object.assign({}, PRIX_FORM_VIDE);
  render();
}

function prixFormPayload() {
  const f = state.prixForm;
  const quantifie = prixUniteInfo(f.unite).quantifie;
  return {
    description: f.description,
    cat: f.cat || null,
    uniformat_code: f.uniformat_code || null,
    dossier_id: f.dossier_id || null,
    annee: parseDecimal(f.annee),
    montant: parseDecimal(f.montant),
    quantite: quantifie ? parseDecimal(f.quantite) : null,
    unite: f.unite,
    portee: f.portee || null,
    source: f.source,
    negocie: f.negocie ? 1 : 0,
    fournisseur: f.fournisseur || null,
    ville: f.ville || null,
    unites: parseDecimal(f.unites),
    source_ref: f.source_ref || null,
    note: f.note || null,
  };
}

async function submitPrix() {
  if (state.prixSaving) return;
  state.prixSaving = true;
  state.prixFormError = null;
  render();
  const edition = state.prixEditId;
  try {
    await apiJson(edition ? `/api/prix/${edition}` : '/api/prix', {
      method: edition ? 'PATCH' : 'POST',
      body: JSON.stringify(prixFormPayload()),
    });
    state.prixForm = Object.assign({}, PRIX_FORM_VIDE);
    state.prixFormOpen = false;
    state.prixEditId = null;
    state.prixSaving = false;
    await loadPrix();
  } catch (e) {
    state.prixSaving = false;
    state.prixFormError = e.message || "Impossible d'enregistrer la ligne.";
    render();
  }
}

// La validation est le geste qui fait entrer la ligne dans la banque — et la
// dévalidation, celui qui l'en sort sans la perdre.
async function setPrixValide(id, valide) {
  if (state.prixBusyId) return;
  state.prixBusyId = id;
  render();
  try {
    await apiJson(`/api/prix/${id}`, { method: 'PATCH', body: JSON.stringify({ valide: valide ? 1 : 0 }) });
    state.prixBusyId = null;
    await loadPrix();
  } catch (e) {
    state.prixBusyId = null;
    state.prixError = e.message || 'Impossible de mettre la ligne à jour.';
    render();
  }
}

async function deletePrix(id) {
  const row = state.prixRows.find(r => r.id === id);
  const quoi = row ? `« ${row.description} »` : 'cette ligne';
  if (!window.confirm(`Supprimer ${quoi} de la banque de prix ? Cette action est définitive.`)) return;
  if (state.prixBusyId) return;
  state.prixBusyId = id;
  render();
  try {
    await apiJson(`/api/prix/${id}`, { method: 'DELETE' });
    state.prixBusyId = null;
    await loadPrix();
  } catch (e) {
    state.prixBusyId = null;
    state.prixError = e.message || 'Impossible de supprimer la ligne.';
    render();
  }
}

// Changer de dossier arrête l'envoi de photos en cours : on le dit avant.
function quitterEnvoiPhotos() {
  if (!tri.envoiEnCours()) return true;
  return confirm("Des photos sont encore en cours d'envoi. Si vous quittez ce dossier, l'envoi s'arrête (vous pourrez redéposer les mêmes photos : celles déjà envoyées seront écartées). Quitter quand même ?");
}

async function openDossier(id) {
  if (String(id) !== String(state.dossierId) && !quitterEnvoiPhotos()) return;
  journal.ouvert = false; journal.entrees = null;
  revokeReviewPhotos();
  state.dossierId = id;
  state.screen = 'revision';
  state.dossier = null;
  state.components = [];
  state.projection = null;
  state.saveStatus = 'idle';
  state.revisionFlashError = null;
  state.expanded = {};
  state.batiment = {};
  state.batimentOpen = false;
  state.redactionCache = {};
  state.addCompOpen = false;
  state.addCompError = null;
  tri.reinitialiser(id);
  state.batimentNote = null;
  state.inactifs = [];
  state.inactifsOuverts = false;
  state.lot = { ouvert: false, choix: { bon: true, na: true, normal: false }, enCours: false, note: null };
  state.couts = { ouvert: false, donnees: null, erreur: null, choix: {}, enCours: false };
  state.saisie = { ouvert: false, tous: false, ids: [], brouillon: {} };
  state.sansPhoto = { ouvert: false, chargement: false, choix: {}, enCours: false };
  state.analyse = { enCours: false, faits: 0, total: 0, note: null };
  await loadDossierDetail(id);
}

async function loadDossierDetail(id) {
  state.revisionLoading = true;
  state.revisionError = null;
  render();
  try {
    const [dossier, components, projection] = await Promise.all([
      apiJson(`/api/dossiers/${id}`),
      apiJson(`/api/dossiers/${id}/components`),
      apiJson(`/api/dossiers/${id}/projection`),
    ]);
    state.dossier = dossier;
    // Les composantes retirées de la visite ne vont ni au rapport ni à la révision.
    state.components = Array.isArray(components) ? components.filter(c => c.actif !== 0) : [];
    state.inactifs = Array.isArray(components) ? components.filter(c => c.actif === 0) : [];
    state.projection = projection;
    state.batiment = parseJsonObject(dossier && dossier.batiment_info);
    state.revisionLoading = false;
    render();
    tri.charger(id);
  } catch (e) {
    state.revisionLoading = false;
    state.revisionError = e.message || 'Impossible de charger ce dossier.';
    render();
  }
}

async function uploadComposantesImport(file) {
  if (!file || state.composantesImportUploading || !state.dossierId) return;
  state.composantesImportUploading = true;
  state.composantesImportError = null;
  state.composantesImportNote = null;
  render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiJson(`/api/dossiers/${state.dossierId}/components/import`, { method: 'POST', body: fd });
    state.composantesImportNote = res.note
      || `${res.composantes_importees} composante${res.composantes_importees > 1 ? 's' : ''} ajoutée${res.composantes_importees > 1 ? 's' : ''} à l'inventaire. Relisez-les avant de confirmer.`;
    // On recharge juste le dossier et ses composantes, sans repasser par
    // revisionLoading : un plein écran de chargement effacerait la note
    // qu'on vient d'afficher.
    const [dossier, components] = await Promise.all([
      apiJson(`/api/dossiers/${state.dossierId}`),
      apiJson(`/api/dossiers/${state.dossierId}/components`)
    ]);
    state.dossier = dossier;
    state.components = Array.isArray(components) ? components : [];
  } catch (e) {
    state.composantesImportError = e.message || "L'import du document a échoué.";
  }
  state.composantesImportUploading = false;
  render();
}

// Composantes dont les photos n'ont pas encore été analysées. Même marqueur
// qu'au terrain : toute analyse réussie remplit le délai suggéré. Un texte déjà
// confirmé par l'ingénieur n'est pas rouvert.
function composantesAAnalyser() {
  return state.components.filter(c => c.photos > 0 && !c.delai_suggere && c.confirmed !== 1);
}

// Ne remplit que ce qui est vide : ce que l'ingénieur a saisi fait foi. La
// cote proposée n'est pas validée (done reste à 0) : il la confirme d'un clic.
function patchDepuisAnalyse(c, r) {
  const vide = (v) => v == null || String(v).trim() === '';
  const texte = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null;
  const patch = {};
  const champs = [
    ['observation', texte(r.observation)], ['cause_possible', texte(r.causePossible)],
    ['delai_suggere', texte(r.delaiSuggere)], ['consequences', texte(r.consequences)],
    ['etendue', r.etendue || null], ['etendue_qte', texte(r.etendueQte)],
    ['limite_observation', r.limiteObservation || null], ['nature_risque', r.natureRisque || null],
  ];
  champs.forEach(([k, v]) => { if (v != null && vide(c[k])) patch[k] = v; });
  if (c.replacement_cost == null && typeof r.costEstimate === 'number' && !isNaN(r.costEstimate)) patch.replacement_cost = Math.round(r.costEstimate);
  if (c.rating == null && !c.done && [1, 2, 3, 4].includes(r.rating)) patch.rating = r.rating;
  return patch;
}

async function analyserPhotos() {
  if (state.analyse.enCours) return;
  const todo = composantesAAnalyser();
  if (!todo.length) return;
  const dossierId = state.dossierId;
  state.analyse = { enCours: true, faits: 0, total: todo.length, note: null };
  render();
  let remplies = 0, cotes = 0, echecs = 0;
  const attente = todo.slice();
  // Deux à la fois : chaque analyse lit jusqu'à quatre photos de la composante.
  async function suivant() {
    while (attente.length) {
      const comp = attente.shift();
      try {
        const r = await apiJson(`/api/components/${comp.id}/analyze`, { method: 'POST' });
        if (state.dossierId !== dossierId) return;
        // Sans clé API ou en cas d'erreur, le serveur renvoie une estimation
        // par l'âge : ce n'est pas une lecture des photos, on ne l'écrit pas.
        if (!r || r.source !== 'ia') { echecs++; }
        else {
          const courant = state.components.find(x => x.id === comp.id) || comp;
          const patch = patchDepuisAnalyse(courant, r);
          if (Object.keys(patch).length) {
            await apiJson(`/api/components/${comp.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
            state.components = state.components.map(x => x.id === comp.id ? Object.assign({}, x, patch) : x);
            remplies++;
            if (patch.rating != null) cotes++;
          }
        }
      } catch (e) {
        echecs++;
      }
      if (state.dossierId !== dossierId) return;
      state.analyse.faits += 1;
      render();
    }
  }
  await Promise.all([suivant(), suivant()]);
  if (state.dossierId !== dossierId) return;
  await refreshProjection();
  const morceaux = [`Analyse terminée : ${remplies} composante(s) complétée(s) à partir des photos.`];
  if (cotes) morceaux.push(`${cotes} cote(s) proposée(s) par l'IA, marquées « IA » : cliquez la cote pour la valider ou choisissez-en une autre. Une composante n'entre au calcul du fonds qu'une fois sa cote validée.`);
  if (echecs) morceaux.push(`${echecs} analyse(s) n'ont pas abouti ; relancez le bouton pour réessayer.`);
  morceaux.push('Vérifiez ensuite le texte avec « Réviser le texte du rapport ».');
  state.analyse = { enCours: false, faits: 0, total: 0, note: morceaux.join(' ') };
  render();
}

function analyseCtaHtml() {
  const a = state.analyse;
  const reste = composantesAAnalyser().length;
  const pct = a.total ? Math.round(a.faits / a.total * 100) : 0;
  const sub = a.enCours
    ? `Analyse ${a.faits}/${a.total}… Gardez cet onglet ouvert.`
    : reste
      ? `${reste} composante(s) avec photos à analyser : observations, cause, délai, conséquences, coût et une cote proposée. Seuls les champs vides sont remplis.`
      : `Aucune composante en attente : classez d'abord des photos, ou elles sont déjà analysées.`;
  return `
      <button class="reviewia-cta an-cta" data-action="analyser-photos" ${a.enCours || !reste ? 'disabled' : ''}>
        <div class="reviewia-cta-icon"><i data-lucide="${a.enCours ? 'loader-2' : 'scan-search'}" class="${a.enCours ? 'spin' : ''}"></i></div>
        <div style="flex:1">
          <div class="reviewia-cta-title">Analyser les photos par l'IA</div>
          <div class="reviewia-cta-sub">${sub}</div>
        </div>
        <div class="reviewia-cta-right">
          ${a.enCours ? `<div class="reviewia-cta-track"><div class="reviewia-cta-fill" style="width:${pct}%"></div></div>` : '<i data-lucide="arrow-right"></i>'}
        </div>
      </button>`;
}

async function refreshProjection() {
  if (!state.dossierId) return;
  try {
    state.projection = await apiJson(`/api/dossiers/${state.dossierId}/projection`);
  } catch (e) { /* keep stale projection, non-fatal */ }
}

// Met à jour l'indicateur d'enregistrement sans re-rendre toute la page :
// le DOM reste en place pendant que l'ingénieur continue de cliquer.
function paintSaveIndicator() {
  const el = document.querySelector('.save-indicator');
  if (!el) return false;
  el.outerHTML = saveIndicatorHtml();
  if (window.lucide) window.lucide.createIcons();
  return true;
}

async function patchComponent(id, body, opts) {
  opts = opts || {};
  state.saveStatus = 'saving';
  if (!paintSaveIndicator()) render();
  try {
    await apiJson(`/api/components/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.components = state.components.map(c => String(c.id) === String(id) ? Object.assign({}, c, body) : c);
    if (opts.refetchProjection) await refreshProjection();
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  render();
}

function componentById(id) {
  return state.components.find(c => String(c.id) === String(id)) || null;
}

// Cote 1-4 + na : « na » enregistre rating = null.
function onRatingClick(id, raw) {
  const c = componentById(id);
  if (!c) return;
  const value = raw === 'na' ? null : parseNum(raw);
  const cur = c.rating == null ? null : c.rating;
  // Coter au bureau documente la composante (done = 1), comme « Enregistrer »
  // au terrain : sans visite, c'est ici que l'évaluation se fait.
  if (cur === value && c.done) return;
  patchComponent(id, { rating: value, done: 1 });
}

function onRflagClick(id) {
  const c = componentById(id);
  if (!c) return;
  patchComponent(id, { r_flag: c.r_flag ? 0 : 1 });
}

function onFacetClick(id, field, value) {
  const c = componentById(id);
  if (!c) return;
  const next = (c[field] === value) ? null : value;
  patchComponent(id, Object.assign({}, { [field]: next }));
}

// Champs texte du panneau de détail : PATCH au blur, seulement si la valeur a changé.
function onCompTextBlur(id, field, raw) {
  const c = componentById(id);
  if (!c) return;
  const v = String(raw == null ? '' : raw).trim();
  const next = v === '' ? null : v;
  const cur = c[field] == null ? '' : String(c[field]);
  if (cur === (next == null ? '' : next)) return;
  patchComponent(id, Object.assign({}, { [field]: next }));
}

function componentAttrs(c) { return parseJsonObject(c && c.attributs); }

function saveAttrs(id, obj) {
  const keys = Object.keys(obj);
  patchComponent(id, { attributs: keys.length ? JSON.stringify(obj) : null });
}

function onAttrValueBlur(id, key, raw) {
  const c = componentById(id);
  if (!c) return;
  const attrs = componentAttrs(c);
  const v = String(raw == null ? '' : raw);
  if ((attrs[key] == null ? '' : String(attrs[key])) === v) return;
  attrs[key] = v;
  saveAttrs(id, attrs);
}

function onAttrDelete(id, key) {
  const c = componentById(id);
  if (!c) return;
  const attrs = componentAttrs(c);
  delete attrs[key];
  saveAttrs(id, attrs);
}

async function onSoldeBlur(value) {
  const n = parseNum(value);
  if (n === null) { render(); return; }
  if (state.dossier && n === state.dossier.current_fund_balance) { render(); return; }
  state.saveStatus = 'saving';
  if (!paintSaveIndicator()) render();
  try {
    await apiJson(`/api/dossiers/${state.dossierId}`, { method: 'PATCH', body: JSON.stringify({ current_fund_balance: n }) });
    state.dossier = Object.assign({}, state.dossier, { current_fund_balance: n });
    await refreshProjection();
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  render();
}

// ---- Coûts suggérés par la banque de prix ----
// Médiane du coût par porte des immeubles de même taille × portes du dossier.
// Un échantillon mince (moins de 5 prix) n'est pas coché d'office.
async function ouvrirCouts() {
  state.couts = { ouvert: true, donnees: null, erreur: null, choix: {}, enCours: false };
  render();
  try {
    const d = await apiJson(`/api/dossiers/${state.dossierId}/couts-suggeres`);
    state.couts.donnees = d;
    (d.suggestions || []).forEach(x => { state.couts.choix[x.component_id] = !x.mince; });
  } catch (e) {
    state.couts.erreur = e.message || 'Impossible de lire la banque de prix.';
  }
  render();
}
function coutsPanelHtml() {
  const k = state.couts;
  if (k.erreur) return `<div class="nf-card lot-panel">${errorBanner(k.erreur)}</div>`;
  if (!k.donnees) return `<div class="nf-card lot-panel">${spinnerBlock('Lecture de la banque de prix…')}</div>`;
  const d = k.donnees;
  const sug = d.suggestions || [];
  const n = sug.filter(x => k.choix[x.component_id]).length;
  let corps;
  if (!d.tranche) corps = `<div class="lot-sub">Saisissez le nombre d'unités du dossier : les prix de la banque se comparent par porte.</div>`;
  else if (!sug.length) corps = `<div class="lot-sub">Aucune composante sans coût n'a de prix comparable dans la banque (même code Uniformat, immeubles de ${escapeHtml(d.tranche.label.toLowerCase())}).</div>`;
  else corps = `
    <div class="couts-table">
      ${sug.map(x => `
      <label class="couts-ligne">
        <input type="checkbox" data-role="cout-choix" data-id="${x.component_id}" ${k.choix[x.component_id] ? 'checked' : ''}>
        <span class="nom">${escapeHtml(x.name)}<small>${escapeHtml(x.uniformat_code)} · ${x.n} prix${x.mince ? ' · <b>échantillon mince</b>' : ''}</small></span>
        <span class="val">${fmt(x.cout)} $<small>${fmt(x.bas)} – ${fmt(x.haut)} $</small></span>
      </label>`).join('')}
    </div>`;
  return `
  <div class="nf-card lot-panel">
    <div class="lot-titre">Coûts de remplacement tirés de la banque de prix</div>
    <div class="lot-sub">${d.tranche ? `Médiane du coût par porte des immeubles de ${escapeHtml(d.tranche.label.toLowerCase())}, indexée, × ${d.unites} unités. Seuls les coûts vides sont remplis ; à valider au regard de l'immeuble.` : ''}</div>
    ${corps}
    <div class="nf-actions">
      <button type="button" class="btn-secondary" data-action="couts-fermer">Fermer</button>
      ${sug.length ? `<button type="button" class="btn-primary" data-action="couts-appliquer" ${n && !k.enCours ? '' : 'disabled'}>${k.enCours ? 'Application…' : `Appliquer ${n} coût(s)`}</button>` : ''}
    </div>
  </div>`;
}
async function appliquerCouts() {
  const k = state.couts;
  const ids = Object.keys(k.choix).filter(id => k.choix[id]);
  if (!ids.length || k.enCours) return;
  k.enCours = true;
  render();
  try {
    const r = await apiJson(`/api/dossiers/${state.dossierId}/couts-suggeres/appliquer`, { method: 'POST', body: JSON.stringify({ ids }) });
    const parId = new Map((r.appliques || []).map(a => [a.component_id, a.replacement_cost]));
    state.components = state.components.map(c => parId.has(c.id) ? Object.assign({}, c, { replacement_cost: parId.get(c.id) }) : c);
    await refreshProjection();
    state.couts = { ouvert: false, donnees: null, erreur: null, choix: {}, enCours: false };
    state.lot.note = `${parId.size} coût(s) de remplacement repris de la banque de prix.`;
  } catch (e) {
    k.enCours = false;
    state.revisionFlashError = e.message || "L'application des coûts a échoué.";
  }
  render();
}

// ---- Confirmation en lot et retrait de composantes ----
// Les composantes sans enjeu (bon état, entretien normal, non applicable)
// n'ont pas à être relues une à une ; celles qui demandent un entretien ou un
// remplacement (cotes 3-4), si.
const LOT_GROUPES = [
  { k: 'bon',    label: 'Cotées « Bon état »',          test: (c) => c.done && c.rating === 1 },
  { k: 'normal', label: 'Cotées « Entretien normal »',  test: (c) => c.done && c.rating === 2 },
  { k: 'na',     label: 'Non applicables (na)',          test: (c) => c.done && c.rating == null },
];
function lotCandidats(k) {
  const g = LOT_GROUPES.find(x => x.k === k);
  return state.components.filter(c => c.confirmed !== 1 && g.test(c));
}
function lotPanelHtml() {
  const l = state.lot;
  const choisis = LOT_GROUPES.filter(g => l.choix[g.k]).reduce((n, g) => n + lotCandidats(g.k).length, 0);
  const reste = state.components.filter(c => c.confirmed !== 1 && !LOT_GROUPES.some(g => g.test(c))).length;
  return `
  <div class="nf-card lot-panel">
    <div class="lot-titre">Confirmer en lot</div>
    <div class="lot-sub">Le texte de ces composantes sera rédigé à la génération du rapport, sans relecture une à une. Les composantes à entretien ou remplacement requis (cotes 3-4) et celles sans cote validée se révisent individuellement${reste ? ` (${reste} restante(s))` : ''}.</div>
    ${LOT_GROUPES.map(g => {
      const n = lotCandidats(g.k).length;
      return `<label class="lot-ligne ${n ? '' : 'vide'}"><input type="checkbox" data-role="lot-choix" data-k="${g.k}" ${l.choix[g.k] && n ? 'checked' : ''} ${n ? '' : 'disabled'}><span>${g.label}</span><b>${n}</b></label>`;
    }).join('')}
    <div class="nf-actions">
      <button type="button" class="btn-secondary" data-action="lot-fermer">Fermer</button>
      <button type="button" class="btn-primary" data-action="lot-confirmer" ${choisis && !l.enCours ? '' : 'disabled'}>${l.enCours ? 'Confirmation…' : `Confirmer ${choisis} composante(s)`}</button>
    </div>
  </div>`;
}
async function lotConfirmer() {
  const l = state.lot;
  const ids = LOT_GROUPES.filter(g => l.choix[g.k]).flatMap(g => lotCandidats(g.k).map(c => c.id));
  if (!ids.length || l.enCours) return;
  l.enCours = true;
  render();
  try {
    const r = await apiJson(`/api/dossiers/${state.dossierId}/components/lot`, { method: 'POST', body: JSON.stringify({ ids, confirmed: 1 }) });
    const set = new Set(ids);
    state.components = state.components.map(c => set.has(c.id) ? Object.assign({}, c, { confirmed: 1 }) : c);
    state.lot = Object.assign({}, l, { ouvert: false, enCours: false, note: `${r.modifiees} composante(s) confirmée(s) en lot.` });
  } catch (e) {
    l.enCours = false;
    state.revisionFlashError = e.message || 'La confirmation en lot a échoué.';
  }
  render();
}
async function changerActif(id, actif) {
  const c = actif ? state.inactifs.find(x => x.id === id) : state.components.find(x => x.id === id);
  if (!c) return;
  if (!actif && !confirm(`Retirer « ${c.name} » de l'étude ? Elle ne figurera ni au rapport ni au calcul du fonds. Vous pourrez la réactiver.`)) return;
  try {
    await apiJson(`/api/dossiers/${state.dossierId}/components/lot`, { method: 'POST', body: JSON.stringify({ ids: [id], actif }) });
    const maj = Object.assign({}, c, { actif });
    if (actif) { state.inactifs = state.inactifs.filter(x => x.id !== id); state.components = state.components.concat([maj]); }
    else { state.components = state.components.filter(x => x.id !== id); state.inactifs = state.inactifs.concat([maj]); delete state.expanded[id]; }
    await refreshProjection();
  } catch (e) {
    state.revisionFlashError = e.message || "La modification n'a pas été enregistrée.";
  }
  render();
}
function inactifsHtml() {
  const n = state.inactifs.length;
  if (!n) return '';
  return `
  <div class="inactifs">
    <button class="inactifs-head" data-action="inactifs-toggle"><i data-lucide="${state.inactifsOuverts ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px"></i>Retirées de l'étude · ${n}</button>
    ${state.inactifsOuverts ? `<div class="inactifs-liste">${state.inactifs.map(c => `
      <div class="inactif"><span>${escapeHtml(c.name)}</span><button class="btn-pill-sm" data-action="reactiver-composante" data-id="${c.id}">Réactiver</button></div>`).join('')}</div>` : ''}
  </div>`;
}

// ---- Saisie rapide : année, vie utile et coût, une ligne par composante ----
// Des champs ordinaires plutôt que les cellules du tableau : Entrée passe à la
// ligne suivante, et ce qui est tapé survit aux re-rendus (brouillon). La
// liste est figée à l'ouverture pour qu'une ligne complétée ne saute pas.
const SAISIE_CHAMPS = [
  { f: 'install_year',      label: 'Année constr./rép.', ph: 'ex. 2008', lire: parseYear },
  { f: 'useful_life_years', label: 'Vie utile (ans)',    ph: 'ans',      lire: parseNum },
  { f: 'replacement_cost',  label: 'Coût de remplacement ($)', ph: '$',  lire: parseNum },
];
function saisieAFaire(c) { return c.replacement_cost == null || c.useful_life_years == null; }
function saisieListe() {
  return groupedComponents().flatMap(g => g.rows).filter(c => state.saisie.tous || saisieAFaire(c)).map(c => c.id);
}
function ouvrirSaisie() {
  state.saisie = { ouvert: !state.saisie.ouvert, tous: false, ids: [], brouillon: {} };
  if (state.saisie.ouvert) state.saisie.ids = saisieListe();
  render();
  if (state.saisie.ouvert) {
    const premier = document.querySelector('[data-role="saisie"]');
    if (premier) premier.focus();
  }
}
function saisieValeur(c, f) {
  const cle = c.id + '|' + f;
  if (cle in state.saisie.brouillon) return state.saisie.brouillon[cle];
  return c[f] == null ? '' : String(c[f]);
}
function saisiePanelHtml() {
  const k = state.saisie;
  const lignes = k.ids.map(id => componentById(id)).filter(Boolean);
  const restantes = state.components.filter(saisieAFaire).length;
  return `
  <div class="nf-card lot-panel">
    <div class="lot-titre">Saisie rapide</div>
    <div class="lot-sub">Chaque valeur s'enregistre en quittant le champ. <b>Entrée</b> passe à la ligne suivante, <b>Tab</b> au champ suivant. Une composante sans coût ni vie utile ne compte pas dans le fonds. ${restantes ? `<b>${restantes} composante(s) à compléter.</b>` : 'Toutes les composantes ont un coût et une vie utile.'}</div>
    <label class="saisie-tous"><input type="checkbox" data-role="saisie-tous" ${k.tous ? 'checked' : ''}> Afficher aussi les composantes déjà complètes</label>
    ${lignes.length ? `
    <div class="saisie-table">
      <div class="saisie-ligne saisie-tete"><span>Composante</span>${SAISIE_CHAMPS.map(x => `<span>${escapeHtml(x.label)}</span>`).join('')}</div>
      ${lignes.map(c => `
      <div class="saisie-ligne ${saisieAFaire(c) ? '' : 'complete'}">
        <span class="nom">${escapeHtml(c.name || '—')}<small>${escapeHtml(c.uniformat_code || '')}${c.photos ? ` · ${c.photos} photo(s)` : ''}${c.rating != null ? ` · cote ${c.rating}` : ''}</small></span>
        ${SAISIE_CHAMPS.map(x => `<input class="detail-input" id="sr_${x.f}_${c.id}" data-role="saisie" data-id="${c.id}" data-field="${x.f}" inputmode="numeric" autocomplete="off" placeholder="${x.ph}" value="${escapeHtml(saisieValeur(c, x.f))}">`).join('')}
      </div>`).join('')}
    </div>` : `<div class="lot-sub">Rien à compléter.</div>`}
    <div class="nf-actions"><button type="button" class="btn-secondary" data-action="saisie-fermer">Fermer</button></div>
  </div>`;
}
let saisieProjection = null;
async function enregistrerSaisie(id, f, brut) {
  const c = componentById(id);
  const champ = SAISIE_CHAMPS.find(x => x.f === f);
  if (!c || !champ) return;
  const cle = id + '|' + f;
  const v = champ.lire(brut);
  if ((v == null ? null : v) === (c[f] == null ? null : c[f])) { delete state.saisie.brouillon[cle]; return; }
  state.saveStatus = 'saving';
  paintSaveIndicator();
  try {
    await apiJson(`/api/components/${id}`, { method: 'PATCH', body: JSON.stringify({ [f]: v }) });
    state.components = state.components.map(x => x.id === id ? Object.assign({}, x, { [f]: v }) : x);
    if (state.saisie.brouillon[cle] === brut) delete state.saisie.brouillon[cle];
    state.saveStatus = 'saved';
    // Le fonds se recalcule une fois la saisie calmée, pas à chaque champ.
    clearTimeout(saisieProjection);
    saisieProjection = setTimeout(async () => { await refreshProjection(); render(); }, 1500);
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  render();
}
function saisieSuivante(t) {
  const ids = state.saisie.ids;
  const i = ids.indexOf(t.getAttribute('data-id'));
  const suivant = i >= 0 && i + 1 < ids.length ? document.getElementById(`sr_${t.getAttribute('data-field')}_${ids[i + 1]}`) : null;
  if (suivant) { suivant.focus(); suivant.select(); } else t.blur();
}

// ---- Retirer les composantes sans photo ----
// L'inventaire de départ est générique : après le classement des photos,
// ce qui n'a ni photo ni cote n'a sans doute pas été vu sur place. Les
// composantes retirées restent réactivables.
function sansPhotoCandidats() {
  const parentsPhotographies = new Set(state.components.filter(c => c.photos > 0 && c.parent_id).map(c => String(c.parent_id)));
  return state.components.filter(c => !(c.photos > 0) && c.rating == null && !c.done && c.confirmed !== 1 && !parentsPhotographies.has(String(c.id)));
}
async function ouvrirSansPhoto() {
  if (state.sansPhoto.ouvert) { state.sansPhoto.ouvert = false; render(); return; }
  state.sansPhoto = { ouvert: true, chargement: true, choix: {}, enCours: false };
  render();
  // Compteurs de photos à jour avant de proposer quoi que ce soit.
  try {
    const comps = await apiJson(`/api/dossiers/${state.dossierId}/components`);
    if (Array.isArray(comps)) {
      state.components = comps.filter(c => c.actif !== 0);
      state.inactifs = comps.filter(c => c.actif === 0);
    }
  } catch (e) { /* on garde la liste en mémoire */ }
  sansPhotoCandidats().forEach(c => { state.sansPhoto.choix[c.id] = true; });
  state.sansPhoto.chargement = false;
  render();
}
function sansPhotoPanelHtml() {
  const k = state.sansPhoto;
  if (k.chargement) return `<div class="nf-card lot-panel">${spinnerBlock('Lecture des composantes…')}</div>`;
  const cands = sansPhotoCandidats();
  const n = cands.filter(c => k.choix[c.id]).length;
  const aClasser = tri.nombreAClasser();
  return `
  <div class="nf-card lot-panel">
    <div class="lot-titre">Retirer les composantes sans photo</div>
    <div class="lot-sub">Composantes sans aucune photo et sans cote : probablement absentes de l'immeuble. Décochez celles à garder. Elles ne figureront ni au rapport ni au fonds, et restent réactivables sous « Retirées de l'étude ».</div>
    ${aClasser ? `<div class="temp-pass-warn" style="margin-bottom:10px"><i data-lucide="alert-triangle"></i><span><b>${aClasser} photo(s) encore à classer.</b> Classez-les d'abord : une composante photographiée mais pas encore classée serait proposée ici.</span></div>` : ''}
    ${cands.length ? `
    <div class="couts-table">
      ${cands.map(c => `
      <label class="couts-ligne">
        <input type="checkbox" data-role="sansphoto-choix" data-id="${c.id}" ${k.choix[c.id] ? 'checked' : ''}>
        <span class="nom">${escapeHtml(c.name || '—')}<small>${escapeHtml(catInfo(c.cat).label)}${c.uniformat_code ? ' · ' + escapeHtml(c.uniformat_code) : ''}</small></span>
      </label>`).join('')}
    </div>` : `<div class="lot-sub">Aucune composante sans photo ni cote.</div>`}
    <div class="nf-actions">
      <button type="button" class="btn-secondary" data-action="sansphoto-fermer">Fermer</button>
      ${cands.length ? `<button type="button" class="btn-primary" data-action="sansphoto-retirer" ${n && !k.enCours ? '' : 'disabled'}>${k.enCours ? 'Retrait…' : `Retirer ${n} composante(s)`}</button>` : ''}
    </div>
  </div>`;
}
async function retirerSansPhoto() {
  const k = state.sansPhoto;
  const ids = sansPhotoCandidats().filter(c => k.choix[c.id]).map(c => c.id);
  if (!ids.length || k.enCours) return;
  if (!confirm(`Retirer ${ids.length} composante(s) de l'étude ? Vous pourrez les réactiver une à une.`)) return;
  k.enCours = true;
  render();
  try {
    const r = await apiJson(`/api/dossiers/${state.dossierId}/components/lot`, { method: 'POST', body: JSON.stringify({ ids, actif: 0 }) });
    const set = new Set(ids);
    const retirees = state.components.filter(c => set.has(c.id)).map(c => Object.assign({}, c, { actif: 0 }));
    state.components = state.components.filter(c => !set.has(c.id));
    state.inactifs = state.inactifs.concat(retirees);
    ids.forEach(id => { delete state.expanded[id]; });
    state.sansPhoto = { ouvert: false, chargement: false, choix: {}, enCours: false };
    state.lot.note = `${r.modifiees} composante(s) retirée(s) de l'étude. Elles restent réactivables sous « Retirées de l'étude ».`;
    await refreshProjection();
  } catch (e) {
    k.enCours = false;
    state.revisionFlashError = e.message || 'Le retrait a échoué.';
  }
  render();
}

// Fiche d'immeuble : une réponse modifiée part tout de suite au serveur. Ses
// règles peuvent activer ou retirer des composantes : on recharge alors la liste.
async function immEnregistrer(sec, key, val) {
  const b = state.batiment && typeof state.batiment === 'object' ? state.batiment : {};
  const avant = b[sec] && b[sec][key] != null ? String(b[sec][key]) : '';
  const v = String(val == null ? '' : val).trim();
  if (avant === v) return;
  if (!b[sec]) b[sec] = {};
  if (v === '') delete b[sec][key]; else b[sec][key] = v;
  if (!Object.keys(b[sec]).length) delete b[sec];
  state.batiment = b;
  state.saveStatus = 'saving';
  if (!paintSaveIndicator()) render();
  try {
    const r = await apiJson(`/api/dossiers/${state.dossierId}`, { method: 'PATCH', body: JSON.stringify({ batiment_info: JSON.stringify(b) }) });
    state.dossier = Object.assign({}, state.dossier, { batiment_info: r.batiment_info });
    const n = r.composantes_mises_a_jour;
    if (n) {
      const comps = await apiJson(`/api/dossiers/${state.dossierId}/components`);
      if (Array.isArray(comps)) {
        state.components = comps.filter(c => c.actif !== 0);
        state.inactifs = comps.filter(c => c.actif === 0);
      }
      await refreshProjection();
      state.batimentNote = `${n} composante(s) ajustée(s) selon la fiche d'immeuble.`;
    }
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement de la fiche.";
  }
  render();
}

// Date de la visite des lieux : au rapport (1.6 et déclaration).
async function onVisiteChange(value) {
  const v = String(value || '').trim() || null;
  if (state.dossier && (state.dossier.date_visite || null) === v) return;
  state.saveStatus = 'saving';
  paintSaveIndicator();
  try {
    await apiJson(`/api/dossiers/${state.dossierId}`, { method: 'PATCH', body: JSON.stringify({ date_visite: v }) });
    state.dossier = Object.assign({}, state.dossier, { date_visite: v });
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  render();
}

async function onCotisationBlur(value) {
  const n = parseNum(value);
  if (n === null) { render(); return; }
  if (state.dossier && n === state.dossier.cotisation_annuelle) { render(); return; }
  state.saveStatus = 'saving';
  render();
  try {
    await apiJson(`/api/dossiers/${state.dossierId}`, { method: 'PATCH', body: JSON.stringify({ cotisation_annuelle: n }) });
    state.dossier = Object.assign({}, state.dossier, { cotisation_annuelle: n });
    await refreshProjection();
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  render();
}

// Photos de la fiche du rapport : au plus 4, choisies d'une étoile. Sans
// choix, le rapport prend les 4 premières classées.
const PHOTOS_PAR_FICHE = 4;
function photosRapportNoteHtml(photos) {
  const enAttention = new Set(state.attn.liste.flatMap(a => a.photos || []));
  if (enAttention.size) photos = photos.filter(p => p.au_rapport || !enAttention.has(p.id));
  const n = photos.filter(p => p.au_rapport).length;
  const texte = n
    ? `${n}/${PHOTOS_PAR_FICHE} photo(s) choisie(s) pour le rapport.`
    : photos.length > PHOTOS_PAR_FICHE
      ? `Le rapport montre ${PHOTOS_PAR_FICHE} photos : sans choix, les ${PHOTOS_PAR_FICHE} premières. Cliquez l'étoile pour choisir.`
      : 'Toutes ces photos iront au rapport. Cliquez l\'étoile pour n\'en garder que certaines.';
  const attn = enAttention.size ? ` ${enAttention.size} photo(s) jointe(s) aux attentions spéciales y figurent, pas à l'état de l'actif.` : '';
  return `<div class="rvia-photos-note">${escapeHtml(texte + attn)}</div>${state.photoRapportErreur ? `<div class="rvia-photos-note err">${escapeHtml(state.photoRapportErreur)}</div>` : ''}`;
}
async function basculerPhotoRapport(id) {
  const p = state.reviewPhotos.find(x => x.id === id);
  if (!p) return;
  const voulu = p.au_rapport ? 0 : 1;
  if (voulu && state.reviewPhotos.filter(x => x.au_rapport).length >= PHOTOS_PAR_FICHE) {
    state.photoRapportErreur = `Au plus ${PHOTOS_PAR_FICHE} photos par fiche : retirez-en une d'abord.`;
    render();
    return;
  }
  p.au_rapport = voulu;
  state.photoRapportErreur = null;
  render();
  try {
    await apiJson(`/api/photos/${id}`, { method: 'PATCH', body: JSON.stringify({ au_rapport: voulu }) });
  } catch (e) {
    p.au_rapport = voulu ? 0 : 1;
    state.photoRapportErreur = e.message || "Le choix de la photo n'a pas été enregistré.";
    render();
  }
}

function revokeReviewPhotos() {
  state.photoRapportErreur = null;
  state.reviewObjectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  state.reviewObjectUrls = [];
  state.reviewPhotos = [];
}
function leaveReviewIA() {
  if (state.screen === 'reviewIA') revokeReviewPhotos();
}

function goReviewIA() {
  state.screen = 'reviewIA';
  state.reviewIdx = 0;
  loadCurrentReviewComponent();
}

function loadCurrentReviewComponent() {
  state.attentionOpen = false;
  loadReviewPhotosForCurrent();
  loadRedactionForCurrent();
}

async function loadReviewPhotosForCurrent() {
  revokeReviewPhotos();
  const list = orderedComponents();
  const idx = state.reviewIdx;
  if (idx >= list.length) { render(); return; }
  const comp = list[idx];
  state.reviewPhotosLoading = true;
  render();
  const tags = ['Vue générale', 'Détail', 'Défaut', 'Contexte'];
  const loaded = [];
  try {
    const full = await apiJson(`/api/components/${comp.id}`);
    state.attn = { compId: comp.id, liste: lireAttentions(full.attentions), redige: {}, erreur: null };
    state.attn.sauve = JSON.stringify(state.attn.liste);
    const photos = Array.isArray(full.photos) ? full.photos : [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const res = await apiRaw(`/api/photos/${photos[i].id}/file`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          state.reviewObjectUrls.push(url);
          loaded.push({ id: photos[i].id, tag: photos[i].tag || tags[i] || ('Photo ' + (i + 1)), url, au_rapport: photos[i].au_rapport === 1 ? 1 : 0 });
        }
      } catch (e) { /* skip this photo */ }
    }
  } catch (e) { /* no photos available */ }
  state.reviewPhotos = loaded;
  state.reviewPhotosLoading = false;
  render();
}

// La rédaction des quatre sous-sections est produite par le serveur
// (POST /api/components/:id/redaction) : l'écran et le .docx ne peuvent pas diverger.
async function loadRedactionForCurrent(opts) {
  opts = opts || {};
  const list = orderedComponents();
  const comp = list[state.reviewIdx];
  state.redaction = null;
  state.redactionError = null;
  state.redactionMissing = false;
  if (!comp) { render(); return; }
  if (!opts.force && state.redactionCache[comp.id]) {
    state.redaction = state.redactionCache[comp.id];
    state.redactionLoading = false;
    render();
    return;
  }
  state.redactionLoading = true;
  render();
  const requestedId = comp.id;
  try {
    const res = await apiRaw(`/api/components/${comp.id}/redaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    // La composante affichée a pu changer pendant l'appel.
    const current = orderedComponents()[state.reviewIdx];
    if (!current || String(current.id) !== String(requestedId)) return;
    if (res.status === 404) {
      state.redactionMissing = true;
      state.redactionLoading = false;
      render();
      return;
    }
    if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
    if (!data || !Array.isArray(data.sections)) throw new Error('Réponse inattendue du générateur de rédaction.');
    state.redaction = data;
    state.redactionCache[comp.id] = data;
  } catch (e) {
    state.redactionError = e.message || 'La rédaction n\'a pas pu être générée.';
  }
  state.redactionLoading = false;
  render();
}

function rvGoTo(idx) {
  const list = orderedComponents();
  state.reviewIdx = Math.max(0, Math.min(idx, list.length));
  loadCurrentReviewComponent();
}
function rvPrev() { if (state.reviewIdx > 0) rvGoTo(state.reviewIdx - 1); }
function rvSkip() { rvGoTo(state.reviewIdx + 1); }

// Le texte corrigé par l'ingénieur dans la carte est renvoyé tel quel dans `note`.
function collectRedactionNote() {
  const cardEl = document.querySelector('.rvia-card');
  if (!cardEl) return null;
  const parts = [];
  cardEl.querySelectorAll('[data-sec-text]').forEach(el => {
    const title = el.getAttribute('data-sec-title') || '';
    const txt = el.textContent.trim();
    if (!txt && !title) return;
    parts.push((title ? title + '\n' : '') + txt);
  });
  if (!parts.length) return null;
  return parts.join('\n\n');
}

// Seul l'ÉTAT DE L'ACTIF alimente la banque : c'est la seule sous-section
// rédigée par le modèle. Les trois autres sont déduites des données.
function collectEtatText() {
  const el = document.querySelector('.rvia-card [data-sec-cle="etat"]');
  const txt = el ? el.textContent.trim() : '';
  return txt.length >= 40 ? txt : null;
}

// ---- Attentions spéciales ----
// Une situation par attention : titre, notes de l'ingénieur, au plus deux
// photos de la composante, et le texte du rapport (rédigé par l'IA à partir
// des notes et des photos, puis relu). Présentes, elles remplacent l'attention
// générée. La liste entière est enregistrée à chaque modification.
const PHOTOS_PAR_ATTENTION = 2;
function lireAttentions(brut) {
  try {
    const l = typeof brut === 'string' ? JSON.parse(brut) : brut;
    return Array.isArray(l) ? l.map(a => Object.assign({ titre: '', notes: '', texte: '', photos: [] }, a)) : [];
  } catch (e) { return []; }
}
function attentionById(id) { return state.attn.liste.find(a => a.id === id) || null; }
function attentionsSectionHtml(sec, i) {
  const k = state.attn;
  const liste = k.liste;
  const comp = orderedComponents()[state.reviewIdx];
  const nom = comp ? comp.name : '';
  const photos = state.reviewPhotos;
  const entete = `
    <div class="rvia-section-head" style="color:var(--accent-press)">
      <i data-lucide="alert-triangle"></i><span>${escapeHtml(`ATTENTION SPÉCIALE - ${nom}`)}</span>
      <button class="btn-pill-sm attn-ajouter" data-action="attn-ajouter"><i data-lucide="plus" style="width:13px;height:13px"></i>Ajouter une attention spéciale</button>
    </div>`;
  if (!liste.length) {
    return `<div class="rvia-section attn-section">${entete}
      <div class="attn-vide">Ajoutez une attention spéciale pour chaque situation à signaler (ex. « Solin décollé – façade nord »), avec vos notes et jusqu'à ${PHOTOS_PAR_ATTENTION} photos. L'IA rédige le texte, vous le relisez.${sec && sec.actif ? ' Sans attention ajoutée, le rapport garde le texte ci-dessous, produit à partir de la cote et des constats.' : ''}</div>
      ${sec && sec.actif ? redactionSectionHtml(Object.assign({}, sec, { _brut: true }), i) : ''}
    </div>`;
  }
  return `<div class="rvia-section attn-section">${entete}
    ${k.erreur ? `<div class="rvia-photos-note err">${escapeHtml(k.erreur)}</div>` : ''}
    ${liste.map((a, n) => {
      const enCours = !!k.redige[a.id];
      return `
      <div class="attn-carte">
        <div class="attn-carte-tete"><span class="attn-num">${n + 1}</span>
          <input class="detail-input attn-titre" id="attn_titre_${a.id}" data-role="attn" data-id="${a.id}" data-f="titre" placeholder="Situation – ex. Solin décollé, façade nord" value="${escapeHtml(a.titre)}">
          <button class="icon-btn" data-action="attn-supprimer" data-id="${a.id}" title="Supprimer cette attention"><i data-lucide="trash-2"></i></button>
        </div>
        <label class="attn-lbl">Vos notes <small>ce qui est vu, où, la cause probable, quoi faire et quand</small></label>
        <textarea class="detail-input attn-notes" id="attn_notes_${a.id}" data-role="attn" data-id="${a.id}" data-f="notes" rows="3" placeholder="ex. Solin de toit décollé sur ~2 m au-dessus de l'unité 4, traces d'eau au plafond. Refixer au printemps.">${escapeHtml(a.notes)}</textarea>
        <label class="attn-lbl">Photos <small>${a.photos.length}/${PHOTOS_PAR_ATTENTION} — elles iront dans cette attention, pas à l'état de l'actif</small></label>
        ${photos.length ? `<div class="attn-photos">${photos.map(p => {
          const on = a.photos.includes(p.id);
          return `<button class="attn-photo ${on ? 'on' : ''}" data-action="attn-photo" data-id="${a.id}" data-photo="${p.id}" title="${on ? 'Retirer de cette attention' : 'Joindre à cette attention'}"><img src="${p.url}" alt="">${on ? '<i data-lucide="check"></i>' : ''}</button>`;
        }).join('')}</div>` : `<div class="attn-sans-photo">${state.reviewPhotosLoading ? 'Chargement des photos…' : 'Aucune photo classée sur cette composante.'}</div>`}
        <div class="attn-texte-tete">
          <label class="attn-lbl">Texte au rapport</label>
          <button class="btn-secondary attn-rediger" data-action="attn-rediger" data-id="${a.id}" ${enCours ? 'disabled' : ''}><i data-lucide="${enCours ? 'loader-2' : 'sparkles'}" style="width:14px;height:14px"></i>${enCours ? 'Rédaction…' : (a.texte ? 'Réécrire avec l\'IA' : 'Rédiger avec l\'IA')}</button>
        </div>
        <textarea class="detail-input attn-texte" id="attn_texte_${a.id}" data-role="attn" data-id="${a.id}" data-f="texte" rows="5" placeholder="Rédigé par l'IA à partir de vos notes et des photos, ou écrit ici. Sans texte, vos notes vont au rapport telles quelles.">${escapeHtml(a.texte)}</textarea>
      </div>`;
    }).join('')}
    <div class="attn-cloture">À la fin de la section, le rapport ajoute une seule fois la recommandation commune (visite de service, suivi au tableur, section 9.0).</div>
  </div>`;
}
async function enregistrerAttentions() {
  const k = state.attn;
  const compId = k.compId;
  if (!compId) return;
  // Un re-rendu fait perdre le focus (focusout) : on n'enregistre que ce qui a changé.
  const instantane = JSON.stringify(k.liste);
  if (instantane === k.sauve) return;
  k.sauve = instantane;
  state.saveStatus = 'saving';
  paintSaveIndicator();
  try {
    const r = await apiJson(`/api/components/${compId}/attentions`, { method: 'PUT', body: JSON.stringify({ attentions: k.liste }) });
    // Les identifiants créés par le serveur remplacent les provisoires.
    if (state.attn.compId === compId && Array.isArray(r.attentions) && r.attentions.length === k.liste.length) {
      r.attentions.forEach((a, n) => { k.liste[n].id = a.id; k.liste[n].photos = a.photos; });
      k.sauve = JSON.stringify(k.liste);
    }
    state.components = state.components.map(c => c.id === compId ? Object.assign({}, c, { attentions: JSON.stringify(k.liste) }) : c);
    state.saveStatus = 'saved';
    k.erreur = null;
  } catch (e) {
    state.saveStatus = 'error';
    k.sauve = null;
    k.erreur = e.message || "Les attentions n'ont pas été enregistrées.";
  }
  render();
}
function nouvelIdAttention() { return 'att_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function ajouterAttention() {
  if (state.attn.liste.length >= 8) { state.attn.erreur = 'Au plus 8 attentions spéciales par composante.'; render(); return; }
  const a = { id: nouvelIdAttention(), titre: '', notes: '', texte: '', photos: [] };
  state.attn.liste.push(a);
  render();
  const champ = document.getElementById(`attn_titre_${a.id}`);
  if (champ) champ.focus();
}
function supprimerAttention(id) {
  const a = attentionById(id);
  if (!a) return;
  if ((a.titre || a.notes || a.texte) && !confirm(`Supprimer l'attention « ${a.titre || 'sans titre'} » ?`)) return;
  state.attn.liste = state.attn.liste.filter(x => x.id !== id);
  enregistrerAttentions();
}
function basculerPhotoAttention(id, photoId) {
  const a = attentionById(id);
  if (!a) return;
  if (a.photos.includes(photoId)) a.photos = a.photos.filter(x => x !== photoId);
  else if (a.photos.length >= PHOTOS_PAR_ATTENTION) { state.attn.erreur = `Au plus ${PHOTOS_PAR_ATTENTION} photos par attention : retirez-en une d'abord.`; render(); return; }
  else a.photos = a.photos.concat([photoId]);
  state.attn.erreur = null;
  enregistrerAttentions();
}
async function redigerAttention(id) {
  const a = attentionById(id);
  const compId = state.attn.compId;
  if (!a || !compId || state.attn.redige[id]) return;
  if (!a.titre && !a.notes && !a.photos.length) { state.attn.erreur = "Écrivez quelques notes ou joignez une photo : l'IA rédige à partir de ce que vous avez vu."; render(); return; }
  if (a.texte && !confirm("Remplacer le texte actuel par une nouvelle rédaction de l'IA ?")) return;
  state.attn.redige[id] = true;
  state.attn.erreur = null;
  render();
  try {
    const r = await apiJson(`/api/components/${compId}/attentions/rediger`, { method: 'POST', body: JSON.stringify({ titre: a.titre, notes: a.notes, photos: a.photos }) });
    if (state.attn.compId === compId && r.texte) { a.texte = r.texte; await enregistrerAttentions(); }
  } catch (e) {
    state.attn.erreur = e.message || "La rédaction par l'IA a échoué.";
  }
  delete state.attn.redige[id];
  render();
}

async function rvConfirm() {
  const list = orderedComponents();
  const comp = list[state.reviewIdx];
  if (!comp) return;
  const body = { confirmed: 1 };
  const note = collectRedactionNote();
  if (note) body.note = note;
  state.saveStatus = 'saving';
  render();
  try {
    await apiJson(`/api/components/${comp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    // Confirmer, c'est l'ingénieur qui dit « ce texte est juste ». C'est cette
    // version-là qui servira d'exemple aux études suivantes de son entreprise.
    const etat = collectEtatText();
    if (etat) {
      try {
        await apiJson(`/api/components/${comp.id}/redaction`, {
          method: 'PATCH', body: JSON.stringify({ texte_retenu: etat, valide: true }),
        });
        state.banqueDirty = true;
      } catch (e) {
        // La banque est un confort : son échec ne doit pas faire échouer la
        // confirmation, qui elle vient d'être enregistrée.
        console.warn('banque de rédactions :', e && e.message);
      }
    }
    state.components = state.components.map(c => String(c.id) === String(comp.id) ? Object.assign({}, c, body) : c);
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  rvGoTo(state.reviewIdx + 1);
}

// État de la publication : vérification serveur, destinataires, version publiée.
async function chargerPublication() {
  state.publication = null;
  state.publicationErreur = null;
  render();
  try {
    state.publication = await apiJson(`/api/dossiers/${state.dossierId}/publication`);
  } catch (e) {
    state.publicationErreur = e.message || 'Impossible de vérifier le dossier.';
  }
  render();
}

// Publier : le serveur vérifie, produit le rapport une fois et le fige, puis
// avise les membres du syndicat. Un refus (409) renvoie ce qui bloque.
async function doPublish() {
  if (state.publishing) return;
  state.publishing = true;
  state.publishError = null;
  state.publicationResultat = null;
  render();
  try {
    const r = await apiJson(`/api/dossiers/${state.dossierId}/publier`, { method: 'POST' });
    state.dossier = Object.assign({}, state.dossier, r.dossier);
    state.publicationResultat = { avises: r.avises, echecs: r.echecs || [] };
  } catch (e) {
    state.publishError = e.message || 'Erreur lors de la publication.';
  }
  state.publishing = false;
  await chargerPublication();
}

async function downloadReport(kind) {
  const ext = kind === 'docx' ? 'docx' : 'xlsx';
  try {
    const res = await apiRaw(`/api/dossiers/${state.dossierId}/${kind === 'suivi' ? 'suivi-entretien.xlsx' : `report.${ext}`}`);
    if (!res.ok) throw new Error('Téléchargement impossible.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const dossierNo = (state.dossier && state.dossier.dossier_no) || 'dossier';
    const suffix = kind === 'docx' ? 'etude-fonds' : kind === 'suivi' ? 'suivi-entretien' : 'durees-vie';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dossierNo}-${suffix}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    state.revisionFlashError = e.message || 'Erreur de téléchargement.';
    render();
  }
}

// Téléchargement d'un fichier de l'API sous le nom donné.
async function telecharger(chemin, nom) {
  const res = await apiRaw(chemin);
  if (!res.ok) {
    let msg = 'Téléchargement impossible.';
    try { msg = (await res.json()).error || msg; } catch (e) { /* pas du JSON */ }
    throw new Error(msg);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const exportFirme = { enCours: false, erreur: null };
async function exporterFirme() {
  exportFirme.enCours = true; exportFirme.erreur = null; render();
  try { await telecharger(`/api/companies/${idFirme()}/export.zip`, `export-${new Date().toISOString().slice(0, 10)}.zip`); }
  catch (e) { exportFirme.erreur = e.message; }
  exportFirme.enCours = false; render();
}
async function archiverDossier() {
  state.archiveEnCours = true; render();
  try { await telecharger(`/api/dossiers/${state.dossierId}/archive.zip`, `archive-${(state.dossier && state.dossier.dossier_no) || 'dossier'}.zip`); }
  catch (e) { state.revisionFlashError = e.message; }
  state.archiveEnCours = false; render();
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
const DEFILANTS = '.page-pad, .rev-body, .pub-body, .rvia-scroll, .rvia-body, .rvia-photos-col, .rvia-sections-col, .cscr, .exec-table, .saisie-table, .couts-table, .tp-doublons';
let derniereVue = null;
function positionsDefilement(racine) {
  const vus = {};
  return Array.from(racine.querySelectorAll(DEFILANTS)).map(el => {
    const classe = el.className;
    vus[classe] = (vus[classe] || 0) + 1;
    return [[classe, vus[classe] - 1], el.scrollTop, el.scrollLeft];
  }).filter(([, haut, gauche]) => haut || gauche);
}
function elementDefilant(racine, [classe, rang]) {
  return Array.from(racine.querySelectorAll(DEFILANTS)).filter(el => el.className === classe)[rang] || null;
}

function render() {
  let html;
  try {
    if (state.booting) html = renderBooting();
    else if (state.screen === 'login') html = renderLogin();
    else html = renderShell();
  } catch (err) {
    console.error(err);
    html = '<div class="empty-state">Une erreur inattendue est survenue. Rechargez la page.</div>';
  }
  const app = document.getElementById('app');
  // Le re-rendu complet remplace le DOM : on mémorise le champ actif (et le
  // curseur) pour que l'édition en cours survive à un rendu déclenché ailleurs.
  const active = document.activeElement;
  const activeId = active && active.id ? active.id : null;
  let selStart = null, selEnd = null;
  if (active && typeof active.selectionStart === 'number') {
    selStart = active.selectionStart; selEnd = active.selectionEnd;
  }
  // Les écrans défilent dans des conteneurs internes, que le rendu remplace :
  // sans ceci, chaque rendu (vignettes qui arrivent, envoi en cours,
  // enregistrement) ramenait la liste en haut. Même vue : on rend la position.
  const vue = `${state.screen}|${state.dossierId || ''}|${state.screen === 'reviewIA' ? state.reviewIdx : ''}`;
  const positions = vue === derniereVue ? positionsDefilement(app) : [];
  app.innerHTML = html;
  positions.forEach(([cle, haut, gauche]) => {
    const el = elementDefilant(app, cle);
    if (el) { el.scrollTop = haut; el.scrollLeft = gauche; }
  });
  derniereVue = vue;
  if (window.lucide) window.lucide.createIcons();
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
        if (selStart != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(selStart, selEnd);
      } catch (e) { /* champ non focusable après re-rendu */ }
    }
  }
}

function renderBooting() {
  return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--ink-050)">${spinnerBlock('Chargement…')}</div>`;
}

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-dark">
      <div class="login-brand"><img src="../assets/logo-mark.png" alt=""><span>Condo Strat<span style="color:var(--orange)">é</span>gis</span></div>
      <div>
        <div class="login-eyebrow">Console de révision</div>
        <h1 class="login-title">Des chiffres,<br>pas des <span style="color:var(--orange)">promesses</span></h1>
        <p class="login-lead">Relisez les données du terrain, ajustez le calcul du fonds de prévoyance et générez les rapports finaux.</p>
      </div>
      <div class="login-foot">Étude de fonds de prévoyance · Québec</div>
    </div>
    <div class="login-right">
      <form class="login-form" id="login-form" novalidate>
        <h2>Connexion</h2>
        <p>Accès réservé aux ingénieurs.</p>
        ${state.loginError ? `<div class="login-error">${escapeHtml(state.loginError)}</div>` : ''}
        <label class="field-label" for="login-email">Courriel</label>
        <div class="field-box"><i data-lucide="mail"></i><input id="login-email" data-role="login-email" name="email" type="email" autocomplete="username" placeholder="prenom.nom@votrefirme.ca" value="${escapeHtml(state.loginEmail || '')}" required></div>
        <label class="field-label" for="login-password">Mot de passe</label>
        <div class="field-box"><i data-lucide="lock"></i><input id="login-password" data-role="login-password" name="password" type="password" autocomplete="current-password" placeholder="Mot de passe" value="${escapeHtml(state.loginPassword || '')}" required></div>
        <button type="submit" class="btn-primary" style="width:100%" ${state.loginLoading ? 'disabled' : ''}>${state.loginLoading ? 'Connexion…' : 'Se connecter'}<i data-lucide="${state.loginLoading ? 'loader-2' : 'arrow-right'}" class="${state.loginLoading ? 'spin' : ''}"></i></button>
        <a href="/compte/?retour=/bureau/" style="display:block;text-align:center;margin-top:14px;font-size:12.5px;color:var(--ink-500)">Mot de passe oublié ?</a>
        <div class="login-forgot">Votre firme n'a pas encore de compte ? <a href="/compte/?nouvelle-firme=1" style="color:var(--accent-press);font-weight:600">Ouvrir un compte</a></div>
      </form>
    </div>
  </div>`;
}

function railHtml() {
  const dossiersActive = ['dossiers', 'revision', 'publier', 'reviewIA', 'photos'].includes(state.screen);
  const items = [
    { key: 'dossiers', label: 'Dossiers', icon: 'folder', action: 'go-dossiers', active: dossiersActive },
    { key: 'prix', label: 'Banque de prix', icon: 'receipt', action: 'go-prix', active: state.screen === 'prix' },
    { key: 'bibliotheque', label: 'Bibliothèque', icon: 'library', action: 'go-bibliotheque', active: state.screen === 'bibliotheque' },
    ...(estAdminFirme() ? [{ key: 'equipe', label: 'Équipe', icon: 'users-round', action: 'go-equipe', active: state.screen === 'equipe' }] : []),
    { key: 'clients', label: 'Clients', icon: 'users', action: 'go-clients', active: state.screen === 'clients' },
    { key: 'carnet', label: "Carnet d'entretien", icon: 'calendar-clock', action: 'go-carnet', active: state.screen === 'carnet' },
    { key: 'modeles', label: 'Modèles', icon: 'file-stack', action: 'go-modeles', active: state.screen === 'modeles' },
  ];
  const initials = initialsOf(state.user && state.user.name);
  return `
  <div class="rail">
    <div class="rail-brand"><img src="${state.companyLogoUrl || '../assets/logo-mark.png'}" alt=""><span>${escapeHtml((state.user && state.user.company && state.user.company.name) || 'Condo Stratégis')}</span></div>
    <div class="rail-section-label">Console bureau</div>
    ${items.map(n =>
      `<button class="rail-nav-item ${n.active ? 'active' : ''}" ${n.disabled ? 'disabled title="Bientôt disponible"' : `data-action="${n.action}"`}><i data-lucide="${n.icon}"></i><span class="label">${n.label}</span></button>`
    ).join('')}
    <div class="rail-footer">
      <div class="rail-user-row">
        <div class="avatar-badge">${initials}</div>
        <div class="rail-user-info">
          <div class="rail-user-name">${escapeHtml((state.user && state.user.name) || 'Utilisateur')}</div>
          <div class="rail-user-sub">${escapeHtml((state.user && state.user.email) || '')}</div>
        </div>
        <a class="btn-logout" href="/compte/?changer=1&retour=/bureau/" title="Changer mon mot de passe"><i data-lucide="key-round"></i></a>
        <button class="btn-logout" data-action="logout" title="Déconnexion"><i data-lucide="log-out"></i></button>
      </div>
    </div>
  </div>`;
}

function addCompFormHtml() {
  if (!state.addCompOpen) {
    return `<button class="btn-pill-sm add-comp-btn" data-action="open-add-comp"><i data-lucide="plus" style="width:14px;height:14px"></i>Ajouter une composante</button>`;
  }
  const f = state.addComp;
  const saving = state.addCompSaving;
  const opts = CAT_ORDER.map(k => `<option value="${k}" ${f.cat === k ? 'selected' : ''}>${escapeHtml(CATS[k].label)}</option>`).join('');
  return `
  <form class="nf-card add-comp" id="add-comp-form">
    ${state.addCompError ? errorBanner(state.addCompError) : ''}
    <div class="nf-grid">
      <div class="nf-field wide">
        <label class="field-label" for="nf_addComp_name">Composante *</label>
        <input id="nf_addComp_name" class="detail-input" data-draft="name" value="${escapeHtml(f.name)}" placeholder="ex. Revêtement de brique — façade avant" required>
      </div>
      <div class="nf-field wide">
        <label class="field-label" for="nf_addComp_cat">Catégorie</label>
        <select id="nf_addComp_cat" class="detail-input" data-draft="cat">${opts}</select>
      </div>
      <div class="nf-field">
        <label class="field-label" for="nf_addComp_code">Code Uniformat II</label>
        <input id="nf_addComp_code" class="detail-input" data-draft="uniformat_code" value="${escapeHtml(f.uniformat_code)}" placeholder="ex. B2010">
      </div>
    </div>
    <div class="nf-actions">
      <button type="button" class="btn-secondary" data-action="cancel-add-comp" ${saving ? 'disabled' : ''}>Annuler</button>
      <button type="submit" class="btn-primary" ${saving ? 'disabled' : ''}>${saving ? 'Ajout…' : 'Ajouter'}</button>
    </div>
  </form>`;
}

async function addComponent() {
  if (state.addCompSaving || !state.dossierId) return;
  const f = state.addComp;
  const name = String(f.name || '').trim();
  if (!name) { state.addCompError = 'Le nom de la composante est requis.'; render(); return; }
  state.addCompSaving = true;
  state.addCompError = null;
  render();
  try {
    const comp = await apiJson(`/api/dossiers/${state.dossierId}/components`, {
      method: 'POST',
      body: JSON.stringify({ name, cat: f.cat, uniformat_code: String(f.uniformat_code || '').trim() || null }),
    });
    state.components = state.components.concat([Object.assign({ photos: 0 }, comp)]);
    state.addComp = { name: '', cat: f.cat, uniformat_code: '' };
    state.addCompSaving = false;
    await refreshProjection();
    render();
  } catch (e) {
    state.addCompSaving = false;
    state.addCompError = e.message || "Impossible d'ajouter la composante.";
    render();
  }
}

function renderShell() {
  let main = '';
  if (state.screen === 'dossiers') main = renderDossiers();
  else if (state.screen === 'prix') main = renderPrix();
  else if (state.screen === 'revision') main = renderRevision();
  else if (state.screen === 'photos') main = tri.html();
  else if (state.screen === 'publier') main = renderPublier();
  else if (state.screen === 'reviewIA') main = renderReviewIA();
  else if (state.screen === 'equipe') main = renderEquipe();
  else if (state.screen === 'carnet') main = renderCarnet();
  else if (state.screen === 'clients') main = renderClients();
  else if (state.screen === 'modeles') main = renderModeles();
  else if (state.screen === 'bibliotheque') main = `<div class="page-pad cscr" style="padding:0">${bib.html({ eyebrow: (state.user && state.user.company && state.user.company.name) || '' })}</div>`;
  return `<div class="shell">${railHtml()}<div class="main">${main}</div></div>`;
}

// Bibliothèque de composantes de la firme : tous la consultent, un
// administrateur de la firme y importe sa liste (page partagée avec l'admin).
const bib = creerBibliotheque({
  apiJson: (path, opts) => apiJson(path, opts),
  apiRaw: (path, opts) => apiRaw(path, opts),
  render: () => render(),
  escapeHtml: (x) => escapeHtml(x),
  fmtDate: (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  spinnerBlock: (x) => spinnerBlock(x),
  companyId: () => state.user && state.user.company && state.user.company.id,
});

// ---------------------------------------------------------------
// Modèles de rapport : identité, mise en page Word et texte de fond.
// Tous les consultent ; un administrateur de la firme les modifie.
// ---------------------------------------------------------------
const modeles = creerModeles({
  apiJson: (path, opts) => apiJson(path, opts),
  render: () => render(),
  escapeHtml: (x) => escapeHtml(x),
  fmtDate: (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  spinnerBlock: (x) => spinnerBlock(x),
  companyId: () => idFirme(),
});
// Photos déposées en lot : l'IA propose une composante, l'ingénieur approuve.
const tri = creerTriPhotos({
  apiJson: (path, opts) => apiJson(path, opts),
  apiRaw: (path, opts) => apiRaw(path, opts),
  render: () => render(),
  escapeHtml: (x) => escapeHtml(x),
  spinnerBlock: (x) => spinnerBlock(x),
  errorBanner: (msg) => errorBanner(msg),
  composantes: () => state.components,
  categories: CATS,
  ordreCategories: CAT_ORDER,
  apresClassement: (classees) => {
    const parComposante = {};
    classees.forEach((x) => { parComposante[x.component_id] = (parComposante[x.component_id] || 0) + 1; });
    state.components = state.components.map((c) => parComposante[c.id] ? Object.assign({}, c, { photos: (c.photos || 0) + parComposante[c.id] }) : c);
  },
});

const logoFirme = { envoi: false, erreur: null };

async function envoyerLogo(file) {
  logoFirme.envoi = true; logoFirme.erreur = null; render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    await apiJson(`/api/companies/${idFirme()}/logo`, { method: 'POST', body: fd });
    if (state.user && state.user.company) state.user.company.hasLogo = true;
    await loadCompanyLogo();
  } catch (e) { logoFirme.erreur = e.message || "Échec de l'envoi du logo."; }
  logoFirme.envoi = false; render();
}

function renderModeles() {
  const admin = estAdminFirme();
  return `
  <div class="page-pad cscr modeles-page ${admin ? '' : 'lecture-seule'}">
    <div class="eyebrow-orange">${escapeHtml((state.user && state.user.company && state.user.company.name) || '')}</div>
    <h1 class="page-title">Modèles</h1>
    <p class="eq-lead">Ce que chaque rapport Word de la firme reprend : son logo et ses couleurs, ses pages liminaires et le texte de fond des sections.${admin ? '' : " Seul un administrateur de la firme les modifie."}</p>
    <div class="eng-section-head"><span class="lbl">Logo</span><div class="rule"></div>
      ${admin ? `<label class="btn-pill-sm">${logoFirme.envoi ? 'Envoi…' : 'Changer le logo'}<input type="file" accept="image/png,image/jpeg" data-role="logo-firme" style="display:none" ${logoFirme.envoi ? 'disabled' : ''}></label>` : ''}
    </div>
    ${logoFirme.erreur ? errorBanner(logoFirme.erreur) : ''}
    <div class="logo-apercu">${state.companyLogoUrl ? `<img src="${state.companyLogoUrl}" alt="Logo de la firme">` : '<span class="dt-sub">Aucun logo : les rapports paraissent sans logo.</span>'}</div>
    ${modeles.themeCardHtml()}
    ${modeles.miseEnPageCardHtml()}
    ${modeles.templateCardHtml()}
  </div>`;
}

// ---------------------------------------------------------------
// Équipe de la firme : l'administrateur invite ses ingénieurs par
// courriel, renvoie une invitation, nomme un autre administrateur ou
// désactive un compte.
// ---------------------------------------------------------------
const equipe = { data: null, error: null, note: null, lien: null, form: { name: '', email: '', role: 'engineer' }, saving: false, actionId: null };

function estAdminFirme() {
  const r = state.user && state.user.role;
  return r === 'admin' || r === 'super_admin';
}
function idFirme() { return state.user && state.user.company && state.user.company.id; }

async function chargerEquipe() {
  try {
    equipe.data = await apiJson(`/api/companies/${idFirme()}/equipe`);
    equipe.error = null;
  } catch (e) {
    equipe.error = e.message || "Impossible de charger l'équipe.";
  }
  render();
}

function resultatInvitation(r, nom) {
  if (r.envoye) {
    equipe.note = `Invitation envoyée à ${nom}. Le lien est valable 7 jours.`;
    equipe.lien = null;
  } else {
    equipe.note = `L'invitation n'a pas pu partir par courriel (${r.erreur}). Transmettez ce lien à ${nom}, valable 7 jours :`;
    equipe.lien = r.lien;
  }
}

async function inviterMembre() {
  const f = equipe.form;
  if (!f.name.trim() || !f.email.trim()) { equipe.error = 'Le nom et le courriel sont requis.'; render(); return; }
  if (equipe.saving) return;
  equipe.saving = true; equipe.error = null; equipe.note = null; equipe.lien = null;
  render();
  try {
    const r = await apiJson(`/api/companies/${idFirme()}/equipe`, { method: 'POST', body: JSON.stringify({ name: f.name.trim(), email: f.email.trim(), role: f.role }) });
    resultatInvitation(r, f.name.trim());
    equipe.form = { name: '', email: '', role: 'engineer' };
    await chargerEquipe();
  } catch (e) {
    equipe.error = e.message || "L'invitation a échoué.";
  }
  equipe.saving = false;
  render();
}

async function actionMembre(id, action) {
  if (equipe.actionId) return;
  const m = equipe.data && equipe.data.membres.find(x => x.id === id);
  if (!m) return;
  if (action === 'desactiver' && !confirm(`Désactiver le compte de ${m.name} ? Ses sessions ouvertes se ferment tout de suite. Ses dossiers restent à la firme, et vous pourrez le réactiver.`)) return;
  equipe.actionId = id; equipe.error = null; equipe.note = null; equipe.lien = null;
  render();
  try {
    const base = `/api/companies/${idFirme()}/equipe/${id}`;
    if (action === 'renvoyer') resultatInvitation(await apiJson(`${base}/invitation`, { method: 'POST' }), m.name);
    else if (action === 'desactiver') await apiJson(base, { method: 'PATCH', body: JSON.stringify({ actif: false }) });
    else if (action === 'reactiver') await apiJson(base, { method: 'PATCH', body: JSON.stringify({ actif: true }) });
    else if (action === 'admin') await apiJson(base, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) });
    else if (action === 'ingenieur') await apiJson(base, { method: 'PATCH', body: JSON.stringify({ role: 'engineer' }) });
    await chargerEquipe();
  } catch (e) {
    equipe.error = e.message || "L'opération a échoué.";
  }
  equipe.actionId = null;
  render();
}

function renderEquipe() {
  const d = equipe.data;
  const f = equipe.form;
  const badge = (fond, texte, libelle) => `<span class="status-badge" style="background:${fond};color:${texte}">${libelle}</span>`;
  const statut = (m) => !m.actif ? badge('var(--ink-100)', 'var(--ink-500)', 'Désactivé')
    : m.invitation_en_attente ? badge('var(--orange-wash)', 'var(--ink-800)', 'Invitation envoyée')
    : badge('var(--green-wash)', 'var(--green)', 'Actif');
  const role = (m) => m.role === 'super_admin' ? 'Super admin' : m.role === 'admin' ? 'Admin de la firme' : 'Ingénieur';
  const actions = (m) => {
    if (!d || m.id === d.moi || m.role === 'super_admin') return m.id === d.moi ? '<span class="dt-sub">Vous</span>' : '';
    const occ = equipe.actionId ? 'disabled' : '';
    const b = (a, t) => `<button class="btn-row-action" data-action="equipe-action" data-id="${m.id}" data-op="${a}" ${occ}>${equipe.actionId === m.id ? '…' : t}</button>`;
    const l = [];
    if (m.invitation_en_attente && m.actif) l.push(b('renvoyer', "Renvoyer l'invitation"));
    if (m.actif) l.push(m.role === 'admin' ? b('ingenieur', 'Retirer admin') : b('admin', 'Nommer admin'));
    l.push(m.actif ? b('desactiver', 'Désactiver') : b('reactiver', 'Réactiver'));
    return l.join('');
  };
  return `
  <div class="page-pad cscr">
    <div class="eyebrow-orange">${escapeHtml((state.user && state.user.company && state.user.company.name) || '')}</div>
    <h1 class="page-title">Équipe</h1>
    <p class="eq-lead">Invitez vos ingénieurs par courriel : chacun choisit son mot de passe et complète son bloc de signature. Un administrateur de la firme gère l'équipe et la bibliothèque de composantes.</p>

    <form class="eq-form" id="equipe-form">
      <input type="text" data-role="equipe-name" placeholder="Nom complet" value="${escapeHtml(f.name)}">
      <input type="email" data-role="equipe-email" placeholder="Courriel" value="${escapeHtml(f.email)}">
      <select data-role="equipe-role">
        <option value="engineer" ${f.role === 'engineer' ? 'selected' : ''}>Ingénieur</option>
        <option value="admin" ${f.role === 'admin' ? 'selected' : ''}>Admin de la firme</option>
      </select>
      <button type="submit" class="btn-primary" ${equipe.saving ? 'disabled' : ''}>${equipe.saving ? 'Envoi…' : "Envoyer l'invitation"}</button>
    </form>

    ${equipe.error ? errorBanner(equipe.error) : ''}
    ${equipe.note ? `<div class="temp-pass-warn" style="margin:12px 0"><i data-lucide="${equipe.lien ? 'alert-triangle' : 'check'}"></i><span>${escapeHtml(equipe.note)}${equipe.lien ? `<br><input class="eq-lien" readonly value="${escapeHtml(equipe.lien)}" onclick="this.select()">` : ''}</span></div>` : ''}
    ${d && !d.courriel ? `<div class="temp-pass-warn"><i data-lucide="info"></i><span>L'envoi de courriels n'est pas configuré : chaque invitation affichera un lien à transmettre vous-même.</span></div>` : ''}

    <div class="eng-section-head" style="margin-top:22px"><span class="lbl">Données de la firme</span><div class="rule"></div>
      <button class="btn-pill-sm" data-action="export-firme" ${exportFirme.enCours ? 'disabled' : ''}>${exportFirme.enCours ? 'Préparation…' : "Télécharger l'export (.zip)"}</button></div>
    <p class="eq-lead" style="margin-bottom:6px">Tout ce que la firme a confié à la plateforme — clients, dossiers, composantes, historique, carnets, banque de prix — en JSON, avec les dossiers et les composantes en CSV pour Excel. Les photos se téléchargent dossier par dossier (« Archive du dossier »). Une sauvegarde complète de la plateforme est aussi faite chaque semaine.</p>
    ${exportFirme.erreur ? errorBanner(exportFirme.erreur) : ''}
    ${!d ? spinnerBlock("Chargement de l'équipe…") : `
    <div class="dossiers-table" style="margin-top:18px">
      <div class="dt-row eq-row dt-head"><div>Nom</div><div>Rôle</div><div>Statut</div><div></div></div>
      ${d.membres.map(m => `
      <div class="dt-row eq-row">
        <div><div class="dt-name">${escapeHtml(m.name)}</div><div class="dt-sub">${escapeHtml(m.email)}${m.ordre_professionnel && m.no_membre ? ` · ${escapeHtml(m.ordre_professionnel)} ${escapeHtml(m.no_membre)}` : ''}</div></div>
        <div>${role(m)}</div>
        <div>${statut(m)}</div>
        <div class="eq-actions">${actions(m)}</div>
      </div>`).join('')}
    </div>`}
  </div>`;
}

// ---------------------------------------------------------------
// Clients : les syndicats de la firme, leurs contacts et leurs études.
// ---------------------------------------------------------------
const clients = { data: null, courant: null, recherche: '', erreur: null, note: null, saving: false, crm: null };
const CHAMPS_CLIENT = [
  ['nom', 'Nom du syndicat', 'Syndicat de copropriété…'], ['adresse', 'Adresse', ''], ['ville', 'Ville', ''],
  ['code_postal', 'Code postal', ''], ['unites', 'Unités', ''], ['annee_construction', 'Année de construction', ''], ['neq', 'NEQ', ''],
];

async function chargerClients() {
  try { clients.data = await apiJson('/api/clients'); clients.erreur = null; }
  catch (e) { clients.erreur = e.message || 'Impossible de charger les clients.'; }
  render();
}
async function ouvrirClient(id) {
  clients.erreur = null; clients.note = null;
  try { clients.courant = await apiJson(`/api/clients/${id}`); if (!clients.courant.contacts.length) clients.courant.contacts.push({}); }
  catch (e) { clients.erreur = e.message; }
  render();
}
function clientDepuisGroupe(i) {
  const g = clients.data && clients.data.sans_client[i];
  if (!g) return;
  clients.courant = { id: null, nom: g.nom || '', adresse: g.adresse, ville: g.ville, unites: g.unites, annee_construction: g.annee_construction, contacts: [{}], dossiers: [], aLier: g.dossiers };
  clients.erreur = null; render();
}
// Les champs du formulaire tels que saisis, avant tout nouveau rendu.
function lireFormClient() {
  const c = clients.courant; if (!c) return;
  for (const [k] of CHAMPS_CLIENT) { const el = document.getElementById(`cli-${k}`); if (el) c[k] = el.value; }
  const notes = document.getElementById('cli-notes'); if (notes) c.notes = notes.value;
  c.contacts = c.contacts.map((x, i) => {
    const v = (k) => { const el = document.getElementById(`cli-ct-${i}-${k}`); return el ? el.value : x[k]; };
    return { nom: v('nom'), fonction: v('fonction'), courriel: v('courriel'), telephone: v('telephone') };
  });
}
async function enregistrerClient() {
  lireFormClient();
  const c = clients.courant;
  if (!String(c.nom || '').trim()) { clients.erreur = 'Le nom du syndicat est requis.'; render(); return; }
  const corps = { nom: c.nom, adresse: c.adresse, ville: c.ville, code_postal: c.code_postal, unites: c.unites, annee_construction: c.annee_construction, neq: c.neq, notes: c.notes, contacts: c.contacts };
  if (!c.id && c.aLier) corps.dossiers = c.aLier.map(d => d.id);
  clients.saving = true; clients.erreur = null; render();
  try {
    const r = await apiJson(c.id ? `/api/clients/${c.id}` : '/api/clients', { method: c.id ? 'PATCH' : 'POST', body: JSON.stringify(corps) });
    clients.courant = r; if (!r.contacts.length) r.contacts.push({});
    clients.note = 'Fiche enregistrée.';
  } catch (e) { clients.erreur = e.message; }
  clients.saving = false; render();
}
async function supprimerClient() {
  const c = clients.courant;
  if (!c || !c.id || !confirm(`Supprimer la fiche de ${c.nom} ?`)) return;
  try { await apiJson(`/api/clients/${c.id}`, { method: 'DELETE' }); clients.courant = null; chargerClients(); }
  catch (e) { clients.erreur = e.message; render(); }
}
async function detacherDossier(id) {
  const c = clients.courant;
  if (!c || !confirm('Détacher ce dossier de la fiche client ?')) return;
  try { await apiJson(`/api/clients/${c.id}/dossiers/${id}`, { method: 'DELETE' }); ouvrirClient(c.id); }
  catch (e) { clients.erreur = e.message; render(); }
}
async function nouveauDossierClient() {
  const c = clients.courant; if (!c || !c.id) return;
  const no = (document.getElementById('cli-no') || {}).value || '';
  const etages = (document.getElementById('cli-etages') || {}).value || '';
  if (!no.trim()) { clients.erreur = 'Donnez un numéro au nouveau dossier.'; render(); return; }
  clients.saving = true; clients.erreur = null; render();
  try {
    const d = await apiJson(`/api/clients/${c.id}/dossiers`, { method: 'POST', body: JSON.stringify({ dossier_no: no.trim(), floors: etages }) });
    clients.saving = false;
    state.dossiers = []; loadDossiers();
    openDossier(d.id);
    return;
  } catch (e) { clients.erreur = e.message; }
  clients.saving = false; render();
}
async function ouvrirCrm() {
  clients.crm = { liste: null, recherche: '', choix: new Set(), erreur: null, enCours: false }; render();
  try { clients.crm.liste = await apiJson('/api/clients/crm'); }
  catch (e) { clients.crm.erreur = e.message; }
  render();
}
function crmFiltres() {
  const q = (clients.crm.recherche || '').toLowerCase().trim();
  return (clients.crm.liste || []).filter(x => !q || `${x.nom} ${x.adresse || ''} ${x.ville || ''}`.toLowerCase().includes(q));
}
async function importerCrm() {
  const ids = [...clients.crm.choix];
  if (!ids.length) return;
  clients.crm.enCours = true; render();
  try {
    const r = await apiJson('/api/clients/crm', { method: 'POST', body: JSON.stringify({ ids }) });
    clients.crm = null;
    clients.note = `${r.importes} syndicat${r.importes > 1 ? 's' : ''} importé${r.importes > 1 ? 's' : ''} du CRM.`;
    chargerClients();
  } catch (e) { clients.crm.erreur = e.message; clients.crm.enCours = false; render(); }
}

function etudeBadge(e) {
  if (!e) return '<span class="dt-sub">Aucune étude</span>';
  return `<div class="dt-no">${escapeHtml(e.dossier_no)} · ${e.annee}</div>
    ${e.revision_due ? `<span class="status-badge" style="background:var(--orange-wash);color:var(--accent-press)">Révision due · ${e.revision_echeance}</span>` : e.publiee ? `<div class="dt-sub">Prochaine révision : ${e.revision_echeance}</div>` : '<div class="dt-sub">En cours</div>'}`;
}

function renderClients() {
  const entete = `<div class="eyebrow-orange">${escapeHtml((state.user && state.user.company && state.user.company.name) || '')}</div>`;
  if (clients.courant) return renderFicheClient(entete);
  const d = clients.data;
  const q = clients.recherche.toLowerCase().trim();
  const liste = d ? d.clients.filter(c => !q || `${c.nom} ${c.adresse || ''} ${c.ville || ''} ${c.contacts.map(x => x.nom || '').join(' ')}`.toLowerCase().includes(q)) : [];
  const crm = clients.crm;
  return `
  <div class="page-pad cscr">
    ${entete}
    <h1 class="page-title">Clients</h1>
    <p class="eq-lead">Les syndicats de la firme : coordonnées, contacts et études. Une nouvelle étude se crée depuis la fiche du client.</p>
    <div class="filters-row">
      <button class="btn-primary" data-action="client-nouveau"><i data-lucide="plus"></i>Nouveau client</button>
      ${d && d.crm ? `<button class="btn-row-action" data-action="client-crm">Importer du CRM</button>` : ''}
      <input class="cli-recherche" data-role="clients-recherche" id="clients-recherche" placeholder="Rechercher un syndicat, une ville, un contact…" value="${escapeHtml(clients.recherche)}">
    </div>
    ${clients.erreur ? errorBanner(clients.erreur) : ''}
    ${clients.note ? `<div class="temp-pass-warn" style="margin:0 0 14px"><i data-lucide="check"></i><span>${escapeHtml(clients.note)}</span></div>` : ''}
    ${d && d.sans_client.length ? `
    <div class="cli-orphelins">
      <div class="cli-orph-titre">${d.sans_client.length} immeuble${d.sans_client.length > 1 ? 's ont' : ' a'} des dossiers sans fiche client</div>
      ${d.sans_client.map((g, i) => `<div class="cli-orph"><span><b>${escapeHtml(g.nom || '—')}</b>${g.ville ? ` · ${escapeHtml(g.ville)}` : ''} · ${g.dossiers.map(x => escapeHtml(x.dossier_no)).join(', ')}</span><button class="btn-row-action" data-action="client-depuis-groupe" data-i="${i}">Créer la fiche</button></div>`).join('')}
    </div>` : ''}
    ${!d ? spinnerBlock('Chargement des clients…') : `
    <div class="dossiers-table">
      <div class="dt-row cli-row dt-head"><div>Syndicat</div><div>Unités</div><div>Étude actuelle</div><div>Contact</div><div></div></div>
      ${liste.length ? liste.map(c => {
        const ct = c.contacts.find(x => x.nom || x.courriel);
        return `<div class="dt-row cli-row">
          <div><div class="dt-name">${escapeHtml(c.nom)}</div><div class="dt-sub">${escapeHtml([c.adresse, c.ville].filter(Boolean).join(', '))}</div></div>
          <div class="dt-no">${c.unites || '—'}</div>
          <div>${etudeBadge(c.etude_actuelle)}</div>
          <div>${ct ? `<div class="dt-resp">${escapeHtml(ct.nom || ct.courriel)}</div><div class="dt-sub">${escapeHtml(ct.fonction || ct.courriel || '')}</div>` : '<span class="dt-sub">—</span>'}</div>
          <div><button class="btn-row-action" data-action="client-ouvrir" data-id="${c.id}">Ouvrir</button></div>
        </div>`;
      }).join('') : `<div class="empty-state">${d.clients.length ? 'Aucun client ne correspond.' : 'Aucun client pour l\'instant.'}</div>`}
    </div>`}
  </div>
  ${crm ? `
  <div class="cli-modal-fond"><div class="cli-modal">
    <div class="cli-modal-tete"><b>Importer des syndicats du CRM</b><button class="lien-mini" data-action="client-crm-fermer">Fermer</button></div>
    ${crm.erreur ? errorBanner(crm.erreur) : ''}
    ${!crm.liste ? spinnerBlock('Lecture du CRM…') : `
    <input class="cli-recherche" style="width:100%;margin:0 0 10px" data-role="crm-recherche" id="crm-recherche" placeholder="Filtrer…" value="${escapeHtml(crm.recherche)}">
    <div class="cli-crm-liste">${crmFiltres().map(x => `<label class="cli-crm-ligne"><input type="checkbox" data-role="crm-choix" data-id="${escapeHtml(x.id)}" ${crm.choix.has(x.id) ? 'checked' : ''}><span><b>${escapeHtml(x.nom)}</b><br><span class="dt-sub">${escapeHtml([x.adresse, x.ville].filter(Boolean).join(', '))}${x.unites ? ` · ${x.unites} unités` : ''}</span></span></label>`).join('') || '<div class="empty-state">Tous les syndicats du CRM sont déjà importés.</div>'}</div>
    <div class="cli-modal-pied">
      <button class="btn-row-action" data-action="client-crm-tout">Tout cocher (${crmFiltres().length})</button>
      <button class="btn-primary" data-action="client-crm-importer" ${crm.choix.size && !crm.enCours ? '' : 'disabled'}>${crm.enCours ? 'Import…' : `Importer ${crm.choix.size}`}</button>
    </div>`}
  </div></div>` : ''}`;
}

function renderFicheClient(entete) {
  const c = clients.courant;
  const admin = estAdminFirme();
  const champ = ([k, lib, ph]) => `<label class="cli-champ ${k === 'nom' || k === 'adresse' ? 'large' : ''}"><span>${lib}</span><input id="cli-${k}" value="${escapeHtml(c[k] == null ? '' : c[k])}" placeholder="${escapeHtml(ph)}" ${['unites', 'annee_construction'].includes(k) ? 'inputmode="numeric"' : ''}></label>`;
  const contact = (x, i) => `<div class="cli-contact">
    ${['nom', 'fonction', 'courriel', 'telephone'].map(k => `<input id="cli-ct-${i}-${k}" value="${escapeHtml(x[k] || '')}" placeholder="${{ nom: 'Nom', fonction: 'Fonction (président du CA, gestionnaire…)', courriel: 'Courriel', telephone: 'Téléphone' }[k]}">`).join('')}
    <button class="lien-mini" data-action="client-contact-retirer" data-i="${i}" title="Retirer">retirer</button>
  </div>`;
  return `
  <div class="page-pad cscr">
    <button class="lien-mini" data-action="client-liste">← Tous les clients</button>
    ${entete}
    <h1 class="page-title">${escapeHtml(c.id ? c.nom : 'Nouveau client')}</h1>
    ${clients.erreur ? errorBanner(clients.erreur) : ''}
    ${clients.note ? `<div class="temp-pass-warn" style="margin:0 0 14px"><i data-lucide="check"></i><span>${escapeHtml(clients.note)}</span></div>` : ''}
    ${c.aLier ? `<div class="temp-pass-warn" style="margin:0 0 14px"><i data-lucide="link"></i><span>Les dossiers ${c.aLier.map(x => escapeHtml(x.dossier_no)).join(', ')} seront rattachés à cette fiche.</span></div>` : ''}
    <div class="cli-grille">${CHAMPS_CLIENT.map(champ).join('')}</div>
    <div class="cli-sous-titre">Contacts</div>
    ${c.contacts.map(contact).join('')}
    <button class="lien-mini" data-action="client-contact-ajouter">+ Ajouter un contact</button>
    <label class="cli-champ large" style="margin-top:14px"><span>Notes</span><textarea id="cli-notes" rows="3">${escapeHtml(c.notes || '')}</textarea></label>
    <div class="filters-row" style="margin-top:14px">
      <button class="btn-primary" data-action="client-enregistrer" ${clients.saving ? 'disabled' : ''}>${clients.saving ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
      ${c.id && admin && !c.dossiers.length ? `<button class="btn-row-action" data-action="client-supprimer">Supprimer</button>` : ''}
    </div>
    ${c.id ? `
    <div class="cli-sous-titre">Études</div>
    <div class="dossiers-table">
      ${c.dossiers.length ? c.dossiers.map(d => `<div class="dt-row cli-dos-row">
        <div><div class="dt-name">${escapeHtml(d.dossier_no)} · ${d.annee}</div><div class="dt-sub">${d.published_at ? 'Publiée' : 'En cours'}${d.revision_de ? ' · révision' : ''}${d.revision_due ? ` · révision due en ${d.revision_echeance}` : ''}</div></div>
        <div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn-row-action" data-action="open-dossier" data-id="${d.id}">Ouvrir</button><button class="lien-mini" data-action="client-detacher" data-id="${d.id}">détacher</button></div>
      </div>`).join('') : '<div class="empty-state">Aucune étude pour ce client.</div>'}
    </div>
    <div class="eq-form" style="margin-top:14px">
      <input id="cli-no" placeholder="Numéro du nouveau dossier">
      <input id="cli-etages" placeholder="Étages (facultatif)" inputmode="numeric" style="flex:0 0 160px;min-width:0">
      <button class="btn-primary" data-action="client-nouveau-dossier" ${clients.saving ? 'disabled' : ''}>Nouvelle étude</button>
    </div>
    <div class="dt-sub" style="margin-top:6px">Le dossier reprend le nom, l'adresse, les unités et l'année de construction du client, avec la liste de départ de votre bibliothèque. La visite se fait ensuite dans l'application terrain.</div>` : ''}
  </div>`;
}

// Révision aux cinq ans : un nouveau dossier qui part de cette étude
// (composantes, années, coûts indexés, fiche d'immeuble, carnet).
async function nouvelleRevision(id) {
  const d = state.dossiers.find(x => x.id === id);
  if (!d) return;
  const suggestion = `${String(new Date().getFullYear()).slice(2)}-`;
  const no = prompt(`Révision de l'étude ${d.dossier_no} — ${d.name}\n\nLe nouveau dossier reprend les composantes, les années, les durées de vie, les coûts (indexés à ${new Date().getFullYear()}), la fiche d'immeuble et le carnet d'entretien. L'inspecteur verra sur le terrain ce qui avait été observé.\n\nNuméro du nouveau dossier :`, suggestion);
  if (!no || !no.trim() || no.trim() === suggestion) return;
  try {
    const r = await apiJson(`/api/dossiers/${id}/revision`, { method: 'POST', body: JSON.stringify({ dossier_no: no.trim() }) });
    await loadDossiers();
    alert(`Dossier ${r.dossier_no} créé : ${r.revision.composantes} composantes reprises, coûts indexés de ${(r.revision.indexation * 100).toFixed(1).replace('.', ',')} %. La visite peut commencer dans l'application terrain.`);
  } catch (e) {
    alert(e.message || 'La création de la révision a échoué.');
  }
}

// ---------------------------------------------------------------
// Carnet d'entretien : portail du syndicat (gratuit). La firme choisit
// qui y a accès pour chaque immeuble et qui fait quelle tâche.
// ---------------------------------------------------------------
const carnet = { dossierId: null, data: null, error: null, note: null, lien: null, form: { name: '', email: '', fonction: '' }, edits: null, dirty: false, saving: false, busy: null };
const FONCTIONS_SUGGEREES = ['Gestionnaire', 'Président du CA', 'Administrateur', 'Trésorier', 'Secrétaire', 'Concierge'];

async function ouvrirCarnet(id) {
  if (!state.dossiers.length) await loadDossiers();
  carnet.dossierId = id || carnet.dossierId || (state.dossiers[0] && state.dossiers[0].id) || null;
  carnet.data = null; carnet.error = null; carnet.note = null; carnet.lien = null; carnet.dirty = false;
  render();
  if (!carnet.dossierId) return;
  try {
    carnet.data = await apiJson(`/api/dossiers/${carnet.dossierId}/portail`);
    carnet.edits = { defauts: Object.assign({}, carnet.data.regles.defauts), taches: Object.assign({}, carnet.data.regles.taches) };
  } catch (e) {
    carnet.error = e.message || 'Impossible de charger le carnet.';
  }
  render();
}

function resultatInvitationCarnet(r, nom) {
  if (r.envoye) { carnet.note = `Invitation envoyée à ${nom}.`; carnet.lien = null; }
  else { carnet.note = `Le courriel n'a pas pu partir (${r.erreur}). Transmettez ce lien à ${nom} :`; carnet.lien = r.lien; }
}

async function inviterAuPortail() {
  const f = carnet.form;
  if (!f.name.trim() || !f.email.trim()) { carnet.error = 'Le nom et le courriel sont requis.'; render(); return; }
  carnet.busy = 'inviter'; carnet.error = null; carnet.note = null; carnet.lien = null; render();
  try {
    const r = await apiJson(`/api/dossiers/${carnet.dossierId}/portail/membres`, { method: 'POST', body: JSON.stringify({ name: f.name.trim(), email: f.email.trim(), fonction: f.fonction.trim() }) });
    resultatInvitationCarnet(r, f.name.trim());
    carnet.data.membres = r.membres;
    carnet.form = { name: '', email: '', fonction: '' };
  } catch (e) { carnet.error = e.message; }
  carnet.busy = null; render();
}

async function actionMembrePortail(uid, action) {
  const m = carnet.data.membres.find(x => x.id === uid);
  if (!m) return;
  const base = `/api/dossiers/${carnet.dossierId}/portail/membres/${uid}`;
  carnet.error = null; carnet.note = null; carnet.lien = null;
  try {
    if (action === 'retirer') {
      if (!confirm(`Retirer l'accès de ${m.name} au carnet de cet immeuble ? Ses tâches deviendront sans responsable.`)) return;
      carnet.data.membres = (await apiJson(base, { method: 'DELETE' })).membres;
      await ouvrirCarnet(carnet.dossierId);
      return;
    }
    if (action === 'renvoyer') resultatInvitationCarnet(await apiJson(`${base}/invitation`, { method: 'POST' }), m.name);
  } catch (e) { carnet.error = e.message; }
  render();
}

async function enregistrerRepartition() {
  carnet.saving = true; carnet.error = null; render();
  try {
    await apiJson(`/api/dossiers/${carnet.dossierId}/portail/regles`, { method: 'PUT', body: JSON.stringify(carnet.edits) });
    carnet.saving = false;
    await ouvrirCarnet(carnet.dossierId);
    carnet.note = 'Répartition enregistrée.';
  } catch (e) { carnet.error = e.message; carnet.saving = false; }
  render();
}

async function envoyerRappels() {
  if (!confirm("Envoyer maintenant à chaque membre ses tâches de ce mois ? Les rappels partent aussi automatiquement le 1er de chaque mois.")) return;
  carnet.busy = 'rappels'; carnet.error = null; carnet.note = null; render();
  try {
    const r = await apiJson(`/api/dossiers/${carnet.dossierId}/portail/rappels`, { method: 'POST' });
    carnet.note = `${r.envoyes} rappel${r.envoyes > 1 ? 's' : ''} envoyé${r.envoyes > 1 ? 's' : ''}.${r.sans_responsable ? ` ${r.sans_responsable} tâche${r.sans_responsable > 1 ? 's' : ''} de ce mois n'${r.sans_responsable > 1 ? 'ont' : 'a'} pas de responsable.` : ''}`;
  } catch (e) { carnet.error = e.message; }
  carnet.busy = null; render();
}

// Aperçu : le portail s'ouvre avec la session du bureau (même origine).
function apercuPortail() {
  try { localStorage.setItem('cs_portail_token', state.token); } catch (e) {}
  window.open(`/portail/?immeuble=${carnet.dossierId}`, '_blank');
}

function renderCarnet() {
  const d = carnet.data;
  const opts = state.dossiers.map(x => `<option value="${x.id}" ${x.id === carnet.dossierId ? 'selected' : ''}>${escapeHtml(x.dossier_no || '')} — ${escapeHtml(x.name || '')}</option>`).join('');
  const modif = !!(d && d.peutModifier);
  const nomMembre = (id) => { const m = d && d.membres.find(x => x.id === id); return m ? m.name : null; };
  const selectMembre = (attrs, valeur, premiere) => `<select ${attrs} ${modif ? '' : 'disabled'}>${premiere}${(d ? d.membres : []).map(m => `<option value="${m.id}" ${valeur === m.id ? 'selected' : ''}>${escapeHtml(m.name)}${m.fonction ? ` (${escapeHtml(m.fonction)})` : ''}</option>`).join('')}</select>`;
  let repartition = '';
  if (d && carnet.edits) {
    const groupes = new Map();
    d.taches.filter(t => !t.consigne).forEach(t => { if (!groupes.has(t.element)) groupes.set(t.element, []); groupes.get(t.element).push(t); });
    repartition = `
      <div class="ca-bloc">
        <div class="ca-titre">Par défaut, selon le responsable prévu au carnet</div>
        ${d.types.map(ty => `<div class="ca-ligne"><div>${escapeHtml(ty.libelle)}<div class="dt-sub">${ty.n} tâche${ty.n > 1 ? 's' : ''}</div></div>
          ${selectMembre(`data-role="carnet-defaut" data-q="${escapeHtml(ty.q)}"`, carnet.edits.defauts[ty.q] || '', '<option value="">Personne</option>')}</div>`).join('')}
      </div>
      <details class="ca-bloc" ${carnet.dirty ? 'open' : ''}>
        <summary class="ca-titre">Tâche par tâche (${d.taches.filter(t => !t.consigne).length})</summary>
        ${[...groupes.entries()].map(([el, ts]) => `<div class="ca-groupe">${escapeHtml(el)}</div>${ts.map(t => {
          const propre = Object.prototype.hasOwnProperty.call(carnet.edits.taches, t.cle);
          const val = propre ? (carnet.edits.taches[t.cle] || '__personne') : '';
          const defaut = nomMembre(carnet.edits.defauts[t.q]);
          return `<div class="ca-ligne"><div>${escapeHtml(t.texte)}<div class="dt-sub">${escapeHtml(t.quand)} · ${escapeHtml(t.responsable)}</div></div>
            <select data-role="carnet-tache" data-cle="${escapeHtml(t.cle)}" ${modif ? '' : 'disabled'}>
              <option value="" ${val === '' ? 'selected' : ''}>Par défaut${defaut ? ` (${escapeHtml(defaut)})` : ' (personne)'}</option>
              ${d.membres.map(m => `<option value="${m.id}" ${val === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
              <option value="__personne" ${val === '__personne' ? 'selected' : ''}>Personne</option>
            </select></div>`;
        }).join('')}`).join('')}
      </details>
      ${modif ? `<div class="ca-actions"><button class="btn-primary" data-action="carnet-enregistrer" ${carnet.saving || !carnet.dirty ? 'disabled' : ''}>${carnet.saving ? 'Enregistrement…' : carnet.dirty ? 'Enregistrer la répartition' : 'Répartition enregistrée'}</button></div>` : ''}`;
  }
  return `
  <div class="page-pad cscr">
    <div class="eyebrow-orange">Portail du syndicat · gratuit</div>
    <h1 class="page-title">Carnet d'entretien</h1>
    <p class="eq-lead">Donnez au syndicat un accès en ligne à son carnet : les tâches de chaque mois, qui s'en occupe, ce qui a été fait. Chaque membre reçoit ses tâches par courriel le 1er du mois.</p>
    <div class="ca-choix"><select data-role="carnet-dossier">${opts || '<option>Aucun dossier</option>'}</select>
      ${d ? `<button class="btn-secondary" data-action="carnet-apercu"><i data-lucide="eye"></i>Voir le portail</button>` : ''}
      ${d && modif ? `<button class="btn-secondary" data-action="carnet-rappels" ${carnet.busy === 'rappels' || !d.membres.length ? 'disabled' : ''}><i data-lucide="send"></i>${carnet.busy === 'rappels' ? 'Envoi…' : 'Envoyer les rappels du mois'}</button>` : ''}
    </div>
    ${carnet.error ? errorBanner(carnet.error) : ''}
    ${carnet.note ? `<div class="temp-pass-warn" style="margin:12px 0"><i data-lucide="${carnet.lien ? 'alert-triangle' : 'check'}"></i><span>${escapeHtml(carnet.note)}${carnet.lien ? `<br><input class="eq-lien" readonly value="${escapeHtml(carnet.lien)}" onclick="this.select()">` : ''}</span></div>` : ''}
    ${!carnet.dossierId ? '' : !d ? (carnet.error ? '' : spinnerBlock('Chargement du carnet…')) : `
    <div class="ca-section">Membres du syndicat</div>
    ${modif ? `<form class="eq-form" id="carnet-form">
      <input type="text" data-role="carnet-name" placeholder="Nom complet" value="${escapeHtml(carnet.form.name)}">
      <input type="email" data-role="carnet-email" placeholder="Courriel" value="${escapeHtml(carnet.form.email)}">
      <input type="text" data-role="carnet-fonction" list="fonctions-portail" placeholder="Fonction (gestionnaire, président du CA…)" value="${escapeHtml(carnet.form.fonction)}">
      <datalist id="fonctions-portail">${FONCTIONS_SUGGEREES.map(f => `<option value="${f}">`).join('')}</datalist>
      <button type="submit" class="btn-primary" ${carnet.busy === 'inviter' ? 'disabled' : ''}>${carnet.busy === 'inviter' ? 'Envoi…' : 'Inviter'}</button>
    </form>` : `<div class="temp-pass-warn"><i data-lucide="info"></i><span>Seul un administrateur de la firme invite les membres et répartit les tâches.</span></div>`}
    <div class="dossiers-table" style="margin-top:14px">
      ${d.membres.length ? d.membres.map(m => `<div class="dt-row eq-row">
        <div><div class="dt-name">${escapeHtml(m.name)}</div><div class="dt-sub">${escapeHtml(m.email)}</div></div>
        <div>${escapeHtml(m.fonction || '—')}</div>
        <div>${m.invitation_en_attente ? `<span class="status-badge" style="background:var(--orange-wash);color:var(--ink-800)">Invitation envoyée</span>` : `<span class="status-badge" style="background:var(--green-wash);color:var(--green)">Actif</span>`}</div>
        <div class="eq-actions">${modif ? `${m.invitation_en_attente ? `<button class="btn-row-action" data-action="carnet-membre" data-op="renvoyer" data-id="${m.id}">Renvoyer</button>` : ''}<button class="btn-row-action" data-action="carnet-membre" data-op="retirer" data-id="${m.id}">Retirer</button>` : ''}</div>
      </div>`).join('') : `<div class="empty-state">Aucun membre : invitez le gestionnaire ou un administrateur du syndicat.</div>`}
    </div>
    <div class="ca-section">Qui fait quoi</div>
    ${d.membres.length ? repartition : `<div class="temp-pass-warn"><i data-lucide="info"></i><span>Invitez d'abord des membres pour leur confier des tâches.</span></div>`}
    ${d.historique.length ? `<div class="ca-section">Derniers entretiens cochés</div>
    <div class="dossiers-table">${d.historique.map(h => { const t = d.taches.find(x => x.cle === h.cle_tache); return `<div class="dt-row ca-hist"><div>${escapeHtml(t ? t.texte : 'Tâche')}<div class="dt-sub">${escapeHtml(t ? t.element : '')}</div></div><div class="dt-sub">${escapeHtml(h.par || '')} · ${new Date(h.fait_le).toLocaleDateString('fr-CA')}${h.note ? ` · ${escapeHtml(h.note)}` : ''}</div></div>`; }).join('')}</div>` : ''}`}
  </div>`;
}

function renderDossiers() {
  if (state.dossiersLoading && state.dossiers.length === 0) {
    return `<div class="page-pad">${spinnerBlock('Chargement des dossiers…')}</div>`;
  }
  const rows = state.dossiers.map(enrichDossier);
  const reviewCount = rows.filter(d => d._reviewReady).length;
  const fieldCount = rows.filter(d => !d.published_at && d._pct < 100).length;
  const mineCount = rows.filter(d => d.assigne_a && d.assigne_a === suivi.moi).length;
  const allCount = rows.length;
  const unAn = new Date(Date.now() - 365 * 864e5).toISOString();
  const filtered = rows.filter(d => {
    if (suivi.responsable === '__aucun' && d.assigne_a) return false;
    if (suivi.responsable && suivi.responsable !== '__aucun' && d.assigne_a !== suivi.responsable) return false;
    if (state.filter === 'review') return d._reviewReady;
    if (state.filter === 'field') return !d.published_at && d._pct < 100;
    if (state.filter === 'mine') return d.assigne_a && d.assigne_a === suivi.moi;
    if (state.filter === 'late') return enRetard(d);
    if (state.filter === 'due') return d.revision_due;
    if (state.filter === 'published') return d.published_at && d.published_at >= unAn;
    return true;
  });
  // Les échéances les plus proches d'abord ; sans échéance, les plus récents.
  if (['mine', 'late', 'field', 'review'].includes(state.filter)) {
    filtered.sort((a, b) => (a.echeance || '9999') < (b.echeance || '9999') ? -1 : (a.echeance || '9999') > (b.echeance || '9999') ? 1 : 0);
  }
  return `
  <div class="page-pad">
    <div class="eyebrow-orange">Tableau de bord</div>
    <h1 class="page-title">Dossiers</h1>
    <div class="titre-actions"><p class="page-lead">Révisez les données du terrain, ajustez le fonds de prévoyance et générez les rapports.</p>
      <button class="btn-primary" data-action="go-clients" title="Une étude se crée depuis la fiche de son client"><i data-lucide="plus"></i>Nouvelle étude</button></div>
    ${state.dossiersError ? errorBanner(state.dossiersError, 'retry-dossiers') : ''}
    ${tuilesHtml(rows)}
    ${suivi.erreur ? errorBanner(suivi.erreur) : ''}
    <div class="filters-row">
      <button class="chip ${state.filter === 'mine' ? 'active' : ''}" data-action="filter" data-filter="mine">Mes dossiers · ${mineCount}</button>
      <button class="chip ${state.filter === 'review' ? 'active' : ''}" data-action="filter" data-filter="review">Prêts pour révision · ${reviewCount}</button>
      <button class="chip ${state.filter === 'field' ? 'active' : ''}" data-action="filter" data-filter="field">En cours sur le terrain · ${fieldCount}</button>
      <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">Tous · ${allCount}</button>
      ${suivi.membres && suivi.membres.length > 1 ? `<select class="suivi-select filtre-resp" data-role="suivi-filtre">
        <option value="">Tous les responsables</option>
        <option value="__aucun" ${suivi.responsable === '__aucun' ? 'selected' : ''}>Non assignés</option>
        ${suivi.membres.map(m => `<option value="${escapeHtml(m.id)}" ${suivi.responsable === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select>` : ''}
    </div>
    <div class="dossiers-table">
      <div class="dt-row dt-head"><div>Syndicat</div><div>Dossier</div><div>Documentées</div><div>Responsable · échéance</div><div>Statut</div><div></div></div>
      ${filtered.length === 0 ? `<div class="empty-state">Aucun dossier dans cette catégorie.</div>` : filtered.map(d => `
      <div class="dt-row">
        <div><div class="dt-name">${escapeHtml(d.name || '—')}</div><div class="dt-sub">${escapeHtml(d.address || '')}${d.address && d.units ? ' · ' : ''}${d.units ? d.units + ' unités' : ''}</div>${d.revision_source ? `<div class="dt-sub" style="color:var(--accent-press)">Révision de l'étude ${escapeHtml(d.revision_source.dossier_no)} (${d.revision_source.annee})</div>` : ''}</div>
        <div class="dt-no">${escapeHtml(d.dossier_no || '—')}</div>
        <div class="dt-doc">
          <div class="prog-track"><div class="prog-fill" style="background:${d._barColor};width:${d._pct}%"></div></div>
          <span class="dt-doc-label">${d.stats ? d.stats.done + '/' + d.stats.total : '—'}</span>
        </div>
        <div class="dt-suivi">${suiviCelluleHtml(d)}</div>
        <div>
          <span class="status-badge" style="background:${d._statusBg};color:${d._statusColor}">${d._statusLabel}</span>
          ${d.revision_due ? `<span class="status-badge" style="background:var(--orange-wash);color:var(--accent-press);margin-top:4px" title="Loi 16 : mise à jour au moins tous les cinq ans">Révision due · ${d.revision_echeance}</span>` : ''}
          ${d.revise_par ? `<div class="dt-sub">Révisée : ${escapeHtml(d.revise_par.dossier_no)}</div>` : (d.published_at || d._pct === 100) ? `<button class="lien-revision" data-action="nouvelle-revision" data-id="${d.id}">Nouvelle révision →</button>` : ''}
        </div>
        <div><button class="btn-row-action ${d._reviewReady ? 'primary' : ''}" data-action="open-dossier" data-id="${d.id}">${d._reviewReady ? 'Réviser' : 'Ouvrir'}</button></div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ---------------------------------------------------------------
// Banque de prix — rendu
// ---------------------------------------------------------------
function renderPrix() {
  if (state.prixLoading && !state.prixResume) {
    return `<div class="page-pad">${spinnerBlock('Chargement de la banque de prix…')}</div>`;
  }
  const r = state.prixResume;
  const taux = r && r.taux_indexation != null ? Math.round(r.taux_indexation * 10000) / 100 : null;
  const rows = state.prixRows.filter(row => {
    if (state.prixFilter === 'a_valider') return row.valide !== 1;
    if (state.prixFilter === 'valides') return row.valide === 1;
    return true;
  });
  return `
  <div class="page-pad">
    <div class="eyebrow-orange">Banque de prix</div>
    <h1 class="page-title">Prix payés</h1>
    <p class="page-lead">Chaque ligne est un travail facturé, ramené à un prix unitaire et indexé en dollars d'aujourd'hui. Seules les lignes validées comptent dans les médianes.</p>
    ${state.prixError ? errorBanner(state.prixError, 'retry-prix') : ''}

    <div class="prix-stats">
      <div class="prix-stat"><div class="prix-stat-k">Lignes</div><div class="prix-stat-v">${r ? r.total : 0}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">Validées</div><div class="prix-stat-v">${r ? r.valides : 0}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">À valider</div><div class="prix-stat-v">${r ? r.a_valider : 0}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">Références</div><div class="prix-stat-v">${r && r.lignes ? r.lignes.length : 0}</div></div>
    </div>
    ${r ? `<div class="metho-source" style="margin:-8px 0 24px">Indexation à ${r.annee_reference} au taux d'inflation construction de ${taux} % — ${escapeHtml(r.source_indexation || '')}. ${r.negocies_ecartes ? `${r.negocies_ecartes} ligne${r.negocies_ecartes > 1 ? 's' : ''} à prix négocié écartée${r.negocies_ecartes > 1 ? 's' : ''} des médianes.` : ''}${r.sans_prix_unitaire ? ` ${r.sans_prix_unitaire} ligne(s) validée(s) sans prix unitaire calculable.` : ''}</div>` : ''}

    ${prixResumeHtml(r)}

    ${prixPortesHtml(r)}

    ${prixCrmHtml()}

    <div class="comp-section-head" style="margin-top:32px">
      <span class="lbl">Lignes saisies</span><span class="rule"></span>
      <button class="btn-primary" data-action="prix-toggle-form" style="padding:8px 16px;font-size:12px">
        <i data-lucide="${state.prixFormOpen ? 'x' : 'plus'}"></i>${state.prixFormOpen ? 'Annuler' : 'Ajouter une ligne'}
      </button>
    </div>
    ${state.prixFormOpen ? prixFormHtml() : ''}

    <div class="filters-row" style="margin-top:20px">
      <button class="chip ${state.prixFilter === 'a_valider' ? 'active' : ''}" data-action="prix-filter" data-filter="a_valider">À valider · ${r ? r.a_valider : 0}</button>
      <button class="chip ${state.prixFilter === 'valides' ? 'active' : ''}" data-action="prix-filter" data-filter="valides">Validées · ${r ? r.valides : 0}</button>
      <button class="chip ${state.prixFilter === 'tous' ? 'active' : ''}" data-action="prix-filter" data-filter="tous">Toutes · ${r ? r.total : 0}</button>
    </div>
    ${prixRowsHtml(rows)}
  </div>`;
}

function prixCrmHtml() {
  if (!state.prixCrmDispo) return '';
  const crm = state.prixCrm;
  const selection = prixCrmSelection();
  const lignes = (crm && crm.lignes) || [];
  const corps = state.prixCrmLoading && !crm
    ? spinnerBlock('Lecture des rattachements du CRM…')
    : lignes.length === 0
      ? `<div class="empty-state">Rien de neuf : toutes les factures rattachées par le CRM ont déjà été importées.</div>`
      : `
      <div class="prix-table">
        <div class="prix-crm-row prix-head">
          <div class="prix-cell"></div>
          <div class="prix-cell">Travaux</div>
          <div class="prix-cell">Syndicat</div>
          <div class="prix-cell right">Période</div>
          <div class="prix-cell right">Total</div>
          <div class="prix-cell">Nature</div>
        </div>
        ${lignes.map(l => {
          const ouvert = !!state.prixCrmDetail[l.cle];
          const multi = l.pieces.length > 1;
          return `
          <div class="prix-crm-row ${state.prixCrmSel[l.cle] ? 'choisi' : ''}">
            <div class="prix-cell"><input type="checkbox" class="prix-crm-check" data-action="prix-crm-choisir" data-cle="${escapeHtml(l.cle)}" ${state.prixCrmSel[l.cle] ? 'checked' : ''}></div>
            <div class="prix-cell">
              <div class="prix-name">${escapeHtml(l.description)}</div>
              <div class="prix-sub-line">
                <b>${escapeHtml(l.component_code || '—')}</b>
                ${multi ? ` · <button class="prix-lien" data-action="prix-crm-detail" data-cle="${escapeHtml(l.cle)}">${l.pieces.length} versements ${ouvert ? '▲' : '▼'}</button>` : ' · 1 pièce'}
              </div>
              ${ouvert ? `<div class="prix-pieces">${l.pieces.map(p => `
                <div><span>${escapeHtml(p.reference || p.source_id)}</span><span>${escapeHtml(p.date)}</span><span class="mono">${fmt(p.montant)} $</span></div>`).join('')}</div>` : ''}
            </div>
            <div class="prix-cell">${escapeHtml(l.syndicat || '—')}${l.units ? `<div class="prix-sub-line">${l.units} unités${l.ville ? ' · ' + escapeHtml(l.ville) : ''}</div>` : ''}</div>
            <div class="prix-cell right mono">${escapeHtml(l.mois || '—')}</div>
            <div class="prix-cell right mono"><b>${fmt(l.total)} $</b></div>
            <div class="prix-cell"><span class="prix-pill">${l.source === 'facture' ? 'Facture' : 'Soumission'}</span></div>
          </div>`;
        }).join('')}
      </div>`;
  return `
  <div class="comp-section-head" style="margin-top:32px">
    <span class="lbl">À importer du CRM</span><span class="rule"></span>
    ${crm ? `<span class="hint">${crm.candidats} candidat(s)${crm.pieces_deja_importees ? ` · ${crm.pieces_deja_importees} pièce(s) déjà importée(s)` : ''}${crm.pieces_sans_date ? ` · ${crm.pieces_sans_date} sans date, non importable(s)` : ''}</span>` : ''}
    <button class="icon-btn" data-action="prix-crm-refresh" title="Relire le CRM" ${state.prixCrmLoading ? 'disabled' : ''}><i data-lucide="refresh-cw"></i></button>
    <button class="btn-primary" data-action="prix-crm-importer" style="padding:8px 16px;font-size:12px" ${selection.length === 0 || state.prixCrmImporting ? 'disabled' : ''}>
      ${state.prixCrmImporting ? 'Import…' : `Importer la sélection${selection.length ? ' · ' + selection.length : ''}`}
    </button>
  </div>
  <p class="prix-hint" style="margin:-6px 0 14px">Le CRM ne fournit aucune quantité : une ligne importée arrive en forfait, à valider, et c'est la superficie que vous ajouterez qui en fera un prix unitaire.</p>
  ${state.prixCrmError ? errorBanner(state.prixCrmError, 'prix-crm-refresh') : ''}
  ${corps}`;
}

// Le coût par porte : la référence qu'on peut produire sans superficie, à
// condition de ne comparer qu'entre immeubles de taille voisine.
function prixPortesHtml(r) {
  const lignes = (r && r.portes) || [];
  if (lignes.length === 0) return '';
  const mince = r.echantillon_mince || 5;
  return `
  <div class="comp-section-head" style="margin-top:28px">
    <span class="lbl">Au coût par porte</span><span class="rule"></span>
    <span class="hint">Utile quand la superficie manque — solide pour ce qui va par immeuble ou par porte, trompeur pour une toiture.</span>
  </div>
  <div class="prix-table">
    <div class="prix-portes-row prix-head">
      <div class="prix-cell">Code · catégorie</div>
      <div class="prix-cell">Taille d'immeuble</div>
      <div class="prix-cell right">n</div>
      <div class="prix-cell right">Médiane par porte</div>
      <div class="prix-cell right">Plage P25 – P75</div>
      <div class="prix-cell right">Années</div>
    </div>
    ${lignes.map(l => `
    <div class="prix-portes-row">
      <div class="prix-cell"><b>${escapeHtml(l.uniformat_code || '—')}</b>${l.cat ? `<span class="prix-sub">${escapeHtml(catInfo(l.cat).label)}</span>` : ''}</div>
      <div class="prix-cell">${escapeHtml(l.tranche_label || '—')}</div>
      <div class="prix-cell right mono">${l.n}${l.mince ? `<span class="prix-warn" title="Moins de ${mince} observations : médiane indicative, pas une référence">indicatif</span>` : ''}</div>
      <div class="prix-cell right mono"><b>${fmtPrix(l.mediane)} $</b><span class="prix-sub">/ porte</span></div>
      <div class="prix-cell right mono">${fmtPrix(l.p25)} – ${fmtPrix(l.p75)} $</div>
      <div class="prix-cell right mono">${l.annee_min === l.annee_max ? l.annee_min : `${l.annee_min}–${l.annee_max}`}</div>
    </div>`).join('')}
  </div>`;
}

function prixResumeHtml(r) {
  const lignes = (r && r.lignes) || [];
  if (lignes.length === 0) {
    return `<div class="empty-state">Aucune référence encore. Validez des lignes pour que la banque commence à donner des médianes.</div>`;
  }
  const mince = r.echantillon_mince || 5;
  return `
  <div class="prix-table">
    <div class="prix-resume-row prix-head">
      <div class="prix-cell">Code · catégorie</div>
      <div class="prix-cell">Exemple</div>
      <div class="prix-cell right">n</div>
      <div class="prix-cell right">Médiane indexée</div>
      <div class="prix-cell right">Plage P25 – P75</div>
      <div class="prix-cell right">Années</div>
    </div>
    ${lignes.map(l => `
    <div class="prix-resume-row">
      <div class="prix-cell"><b>${escapeHtml(l.uniformat_code || '—')}</b>${l.cat ? `<span class="prix-sub">${escapeHtml(catInfo(l.cat).label)}</span>` : ''}</div>
      <div class="prix-cell">${escapeHtml(l.exemple || '')}</div>
      <div class="prix-cell right mono">${l.n}${l.mince ? `<span class="prix-warn" title="Moins de ${mince} observations : médiane indicative, pas une référence">indicatif</span>` : ''}</div>
      <div class="prix-cell right mono"><b>${fmtPrix(l.mediane)} $</b><span class="prix-sub">/ ${escapeHtml(l.unite_label)}</span></div>
      <div class="prix-cell right mono">${fmtPrix(l.p25)} – ${fmtPrix(l.p75)} $</div>
      <div class="prix-cell right mono">${l.annee_min === l.annee_max ? l.annee_min : `${l.annee_min}–${l.annee_max}`}</div>
    </div>`).join('')}
  </div>`;
}

function prixRowsHtml(rows) {
  if (rows.length === 0) {
    return `<div class="empty-state">Aucune ligne dans cette catégorie.</div>`;
  }
  return `
  <div class="prix-table">
    <div class="prix-obs-row prix-head">
      <div class="prix-cell">Élément</div>
      <div class="prix-cell right">Année</div>
      <div class="prix-cell right">Montant</div>
      <div class="prix-cell right">Quantité</div>
      <div class="prix-cell right">Prix unitaire indexé</div>
      <div class="prix-cell right">Par porte</div>
      <div class="prix-cell">Nature</div>
      <div class="prix-cell right"></div>
    </div>
    ${rows.map(row => {
      const busy = state.prixBusyId === row.id;
      const portee = PRIX_PORTEES.find(p => p.v === row.portee);
      const source = PRIX_SOURCES.find(s => s.v === row.source);
      return `
      <div class="prix-obs-row ${row.valide === 1 ? 'valide' : ''}">
        <div class="prix-cell">
          <div class="prix-name">${escapeHtml(row.description || '—')}</div>
          <div class="prix-sub-line">${[row.uniformat_code, row.cat ? catInfo(row.cat).label : null, row.fournisseur, row.ville].filter(Boolean).map(escapeHtml).join(' · ') || '—'}${row.pieces && row.pieces.length ? ` · <span class="prix-pill">CRM · ${row.pieces.length} pièce(s)</span>` : ''}</div>
        </div>
        <div class="prix-cell right mono">${row.annee || '—'}</div>
        <div class="prix-cell right mono">${fmt(row.montant)} $</div>
        <div class="prix-cell right mono">${row.quantite != null ? `${fmtPrix(row.quantite)} ${escapeHtml(row.unite_label || '')}` : '—'}</div>
        <div class="prix-cell right mono">${row.prix_unitaire_indexe != null ? `<b>${fmtPrix(row.prix_unitaire_indexe)} $</b><span class="prix-sub">/ ${escapeHtml(row.unite_label || '')}</span>` : '—'}</div>
        <div class="prix-cell right mono">${row.prix_par_porte_indexe != null ? `${fmtPrix(row.prix_par_porte_indexe)} $<span class="prix-sub">/ ${row.unites} portes</span>` : '—'}</div>
        <div class="prix-cell">
          <span class="prix-pill">${escapeHtml(source ? source.label : (row.source || '—'))}</span>
          ${portee ? `<span class="prix-pill">${escapeHtml(portee.label)}</span>` : ''}
          ${row.negocie === 1 ? `<span class="prix-pill neg" title="Prix de portefeuille — écarté des médianes">Négocié</span>` : ''}
        </div>
        <div class="prix-cell right prix-actions">
          <button class="btn-row-action ${row.valide === 1 ? '' : 'primary'}" data-action="prix-valide" data-id="${row.id}" data-valide="${row.valide === 1 ? '0' : '1'}" ${busy ? 'disabled' : ''}>${row.valide === 1 ? 'Retirer' : 'Valider'}</button>
          <button class="icon-btn" data-action="prix-modifier" data-id="${row.id}" title="Modifier" ${busy ? 'disabled' : ''}><i data-lucide="pencil"></i></button>
          <button class="icon-btn" data-action="prix-supprimer" data-id="${row.id}" title="Supprimer" ${busy ? 'disabled' : ''}><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function prixChamp(cle, label, opts) {
  opts = opts || {};
  const val = state.prixForm[cle] == null ? '' : String(state.prixForm[cle]);
  const attrs = `id="prix-f-${cle}" data-role="prix-field" data-field="${cle}"`;
  let champ;
  if (opts.options) {
    champ = `<select class="detail-input" ${attrs}>
      ${(opts.vide ? [{ v: '', label: opts.vide }] : []).concat(opts.options).map(o =>
        `<option value="${escapeHtml(o.v)}" ${o.v === val ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
    </select>`;
  } else if (opts.textarea) {
    champ = `<textarea class="detail-input" rows="2" ${attrs} placeholder="${escapeHtml(opts.placeholder || '')}">${escapeHtml(val)}</textarea>`;
  } else {
    champ = `<input class="detail-input" type="text" ${attrs} value="${escapeHtml(val)}" placeholder="${escapeHtml(opts.placeholder || '')}" ${opts.disabled ? 'disabled' : ''}>`;
  }
  return `<div class="prix-field ${opts.large ? 'large' : ''}">
    <label class="field-label" for="prix-f-${cle}">${escapeHtml(label)}</label>
    ${champ}
    ${opts.hint ? `<div class="prix-hint">${escapeHtml(opts.hint)}</div>` : ''}
  </div>`;
}

function prixFormHtml() {
  const quantifie = prixUniteInfo(state.prixForm.unite).quantifie;
  const dossierOptions = state.dossiers.map(d => ({ v: d.id, label: `${d.dossier_no || ''} — ${d.name || ''}`.trim() }));
  const catOptions = CAT_ORDER.map(k => ({ v: k, label: CATS[k].label }));
  return `
  <form class="prix-form" id="prix-form" novalidate>
    ${state.prixEditId ? `<div class="prix-field large"><span class="field-label">Modification d'une ligne existante</span></div>` : ''}
    ${state.prixFormError ? `<div class="login-error" style="grid-column:1/-1">${escapeHtml(state.prixFormError)}</div>` : ''}
    ${prixChamp('description', 'Travaux facturés', { large: true, placeholder: 'ex. Réfection complète de la toiture — membrane élastomère' })}
    ${prixChamp('cat', 'Catégorie', { options: catOptions, vide: '—' })}
    ${prixChamp('uniformat_code', 'Code Uniformat', { placeholder: 'ex. B3010' })}
    ${prixChamp('dossier_id', 'Dossier', { options: dossierOptions, vide: 'Aucun', hint: 'Fige le contexte du bâtiment avec la ligne.' })}
    ${prixChamp('annee', 'Année des travaux', { placeholder: 'ex. 2024' })}
    ${prixChamp('montant', 'Montant des travaux ($)', { placeholder: 'ex. 148 500', hint: 'Travaux seuls — taxes, honoraires et contingence retirés.' })}
    ${prixChamp('unite', 'Unité', { options: PRIX_UNITES.map(u => ({ v: u.v, label: u.label })) })}
    ${prixChamp('quantite', 'Quantité', quantifie
      ? { placeholder: 'ex. 4 200' }
      : { disabled: true, placeholder: 'sans objet', hint: 'Un forfait est son propre prix unitaire.' })}
    ${prixChamp('portee', 'Portée', { options: PRIX_PORTEES, vide: '—', hint: 'Une réparation ne se compare pas à un remplacement.' })}
    ${prixChamp('source', 'Source', { options: PRIX_SOURCES })}
    ${prixChamp('fournisseur', 'Entrepreneur', { placeholder: 'ex. Toitures X inc.' })}
    ${prixChamp('ville', 'Ville', { placeholder: 'ex. Longueuil' })}
    ${prixChamp('unites', 'Portes de l\'immeuble', { placeholder: 'ex. 48', hint: 'Donne un coût par porte même sans superficie.' })}
    ${prixChamp('source_ref', 'Pièce', { placeholder: 'no de facture' })}
    ${prixChamp('note', 'Note', { large: true, textarea: true, placeholder: "Ce qui a été retiré du montant, accès difficile, portée particulière…" })}
    <div class="prix-form-foot">
      <label class="prix-check">
        <input type="checkbox" data-role="prix-field" data-field="negocie" ${state.prixForm.negocie ? 'checked' : ''}>
        <span>Prix négocié (portefeuille) — écarté des médianes de marché</span>
      </label>
      <button type="submit" class="btn-primary" ${state.prixSaving ? 'disabled' : ''}>${state.prixSaving ? 'Enregistrement…' : 'Enregistrer'}<i data-lucide="${state.prixSaving ? 'loader-2' : 'check'}" class="${state.prixSaving ? 'spin' : ''}"></i></button>
    </div>
  </form>`;
}

function saveIndicatorHtml() {
  if (state.saveStatus === 'saving') return `<span class="save-indicator saving"><i data-lucide="loader-2" class="spin" style="width:14px;height:14px"></i>Enregistrement…</span>`;
  if (state.saveStatus === 'error') return `<span class="save-indicator error"><i data-lucide="alert-circle" style="width:14px;height:14px"></i>Échec de l'enregistrement</span>`;
  return `<span class="save-indicator saved"><i data-lucide="check-circle-2" style="width:14px;height:14px"></i>${state.saveStatus === 'saved' ? 'Sauvegardé' : 'À jour'}</span>`;
}

function fundCardHtml(d, proj, params, excluded) {
  const horizon = params.projectionYears != null ? params.projectionYears : '—';
  // Le moteur expose désormais des scénarios de rattrapage (méthode maison) plutôt qu'une
  // cotisation constante unique : on met en avant le scénario recommandé et sa 1re année.
  const recommended = proj && Array.isArray(proj.scenarios) ? proj.scenarios.find(s => s.code === proj.recommendedCode) : null;
  const headline = recommended ? `${recommended.code} — ${recommended.label}` : (proj ? 'Aucun scénario ne suffit' : '—');
  const an1 = recommended && recommended.years && recommended.years[0] ? fmt(recommended.years[0].cotisation) + ' $' : '—';
  const soldeVal = d.current_fund_balance != null ? fmt(d.current_fund_balance) : '0';
  // Cotisation annuelle déjà perçue par le syndicat, à comparer avec celle du scénario.
  const cotisationVal = d.cotisation_annuelle != null ? fmt(d.cotisation_annuelle) : '';
  const methoTags = [
    { label: 'Inflation construction', val: params.inflationRate != null ? Math.round(params.inflationRate * 10000) / 100 : '—', unit: '%' },
    { label: 'Intérêt', val: params.interestRate != null ? Math.round(params.interestRate * 10000) / 100 : '—', unit: '%' },
    { label: 'Horizon', val: horizon, unit: ' ans + portion an 31' },
  ];
  return `
  <div class="fund-card">
    <div class="fund-top">
      <div style="flex:1">
        <div class="fund-top-eyebrow">Scénario recommandé</div>
        <div class="fund-total" style="font-size:22px">${escapeHtml(headline)}</div>
      </div>
      <div class="fund-side">
        <div class="fund-side-label">Cotisation an 1</div>
        <div class="fund-side-val">${an1}</div>
      </div>
    </div>
    <div class="fund-body">
      <div class="fund-stats-row">
        <div><div class="fund-stat-label">Solde actuel du fonds</div>
          <div class="solde-box"><input id="soldeInput" type="text" inputmode="numeric" data-role="solde-input" value="${soldeVal}"><span>$</span></div>
        </div>
        <div><div class="fund-stat-label">Cotisation annuelle actuelle</div>
          <div class="solde-box"><input type="text" inputmode="numeric" data-role="cotisation-input" value="${cotisationVal}"><span>$</span></div>
        </div>
        <div><div class="fund-stat-label"><label for="visiteInput">Date de la visite</label></div>
          <div class="solde-box date ${d.date_visite ? '' : 'manque'}"><input id="visiteInput" type="date" data-role="visite-input" max="${new Date().toISOString().slice(0, 10)}" value="${escapeHtml(d.date_visite || '')}"></div>
        </div>
      </div>
      ${excluded.length > 0 ? `
      <div class="excluded-banner">
        <div class="excluded-banner-head"><i data-lucide="alert-triangle"></i><span>${excluded.length} composante(s) exclue(s) du calcul — le fonds requis est sous-estimé.</span></div>
        <ul class="excluded-list">${excluded.map(e => `<li>${escapeHtml(e.name || 'Composante')} — ${escapeHtml(e.reason || 'raison inconnue')}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="metho-section">
        <div class="metho-label">Hypothèses sourcées</div>
        <div class="metho-row">
          ${methoTags.map(m => `<div class="metho-tag"><div class="metho-tag-label">${m.label}</div><div class="metho-tag-val">${m.val}<span>${m.unit}</span></div></div>`).join('')}
        </div>
        ${params.inflationSource ? `<div class="metho-source">Inflation : ${escapeHtml(params.inflationSource)}</div>` : ''}
        ${params.interestSource ? `<div class="metho-source">Intérêt : ${escapeHtml(params.interestSource)}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function scenarioCardsHtml(proj, selectedCode) {
  if (!proj || !Array.isArray(proj.scenarios) || !proj.scenarios.length) return '';
  return `
  <div class="scenario-section">
    <div class="comp-section-head">
      <span class="lbl">Comparaison des scénarios</span>
      <div class="rule"></div>
      <span class="hint">Total débours 30 ans : ${fmt(proj.totalDebours30Ans)} $ · portion future an 31 : ${fmt(proj.portionFutureAn31.total)} $ · total : ${fmt(proj.totalAvecPortionFuture)} $</span>
    </div>
    <div class="scenario-cards">
      ${proj.scenarios.map(s => {
        const active = s.code === selectedCode;
        return `
        <button class="scenario-card ${active ? 'active' : ''} ${s.meetsCriteria ? 'ok' : 'fail'}" data-action="select-scenario" data-code="${s.code}">
          <div class="scenario-card-head">
            <span class="scenario-code">${s.code}</span>
            <span class="scenario-badge ${s.meetsCriteria ? 'ok' : 'fail'}">${s.meetsCriteria ? 'Critères respectés' : 'Insuffisant'}</span>
          </div>
          <div class="scenario-label">${escapeHtml(s.label)}${s.approxime ? ' <span class="scenario-approx" title="Approximation — voir méthodologie">*</span>' : ''}</div>
          <div class="scenario-stats">
            <div><span class="k">An 1</span><span class="v">${fmt(s.years[0].cotisation)} $</span></div>
            <div><span class="k">Solde an 30</span><span class="v">${fmt(s.soldeFinAn30)} $</span></div>
            <div><span class="k">1re année négative</span><span class="v">${s.firstNegativeYear != null ? 'An ' + s.firstNegativeYear : '—'}</span></div>
          </div>
        </button>`;
      }).join('')}
    </div>
    ${proj.scenarios.some(s => s.approximationNote) ? `<div class="scenario-approx-note">* ${escapeHtml(proj.scenarios.find(s => s.approximationNote).approximationNote)}</div>` : ''}
  </div>`;
}

function executiveSummaryHtml(proj, selectedCode) {
  if (!proj || !Array.isArray(proj.scenarios) || !proj.scenarios.length) return '';
  const scenario = proj.scenarios.find(s => s.code === selectedCode) || proj.scenarios[0];
  const rows = scenario.years.map(y => `
    <div class="exec-row ${y.soldeFin < 0 ? 'negative' : ''}">
      <div class="exec-cell">${y.year}</div>
      <div class="exec-cell mono">${y.pctAugmentation.toFixed(1)} %</div>
      <div class="exec-cell mono right">${fmt(y.debours)} $</div>
      <div class="exec-cell mono right">${fmt(y.cotisation)} $</div>
      <div class="exec-cell mono right">${fmt(y.soldeFin)} $</div>
    </div>`).join('');
  return `
  <div class="exec-section">
    <div class="comp-section-head">
      <span class="lbl">Sommaire exécutif — ${scenario.code} — année par année</span>
      <div class="rule"></div>
      <span class="hint">Solde du fonds plancher à l'intérêt sur solde négatif</span>
    </div>
    <div class="exec-table">
      <div class="exec-row exec-head">
        <div class="exec-cell">Année</div>
        <div class="exec-cell">Augmentation</div>
        <div class="exec-cell right">Débours prévus</div>
        <div class="exec-cell right">Cotisation</div>
        <div class="exec-cell right">Solde fin d'année</div>
      </div>
      ${rows}
    </div>
  </div>`;
}

function archiveHtml() {
  return `<button class="report-item" data-action="archive-dossier" ${state.archiveEnCours ? 'disabled' : ''}><div class="report-icon"><i data-lucide="archive"></i></div><div style="flex:1"><div class="report-name">${state.archiveEnCours ? 'Préparation de l\'archive…' : 'Archive du dossier'}</div><div class="report-sub">Données et photos · .zip</div></div><i data-lucide="download"></i></button>`;
}

function reportsCardHtml(allConf, remaining) {
  if (allConf) {
    return `
    <div class="reports-card">
      <div class="reports-eyebrow">Rapports finaux</div>
      <button class="report-item" data-action="download-docx"><div class="report-icon"><i data-lucide="file-text"></i></div><div style="flex:1"><div class="report-name">Étude de fonds</div><div class="report-sub">Word · .docx</div></div><i data-lucide="download"></i></button>
      <button class="report-item" data-action="download-xlsx"><div class="report-icon green"><i data-lucide="table-2"></i></div><div style="flex:1"><div class="report-name">Durées de vie + carnet</div><div class="report-sub">Excel · .xlsx</div></div><i data-lucide="download"></i></button>
      <button class="report-item" data-action="download-suivi"><div class="report-icon"><i data-lucide="calendar-check"></i></div><div style="flex:1"><div class="report-name">Tableur suivi d'entretien</div><div class="report-sub">Excel · tâches par saison</div></div><i data-lucide="download"></i></button>
      ${archiveHtml()}
      <div class="reports-note ready"><i data-lucide="check-circle-2"></i>Texte confirmé — rapports générés et à jour à chaque édition.</div>
    </div>`;
  }
  return `
  <div class="reports-card">
    <div class="reports-eyebrow">Rapports finaux</div>
    <div class="report-item locked"><div class="report-icon locked"><i data-lucide="file-text"></i></div><div style="flex:1"><div class="report-name muted">Étude de fonds</div><div class="report-sub muted">Word · verrouillé</div></div><i data-lucide="lock"></i></div>
    <div class="report-item locked"><div class="report-icon locked"><i data-lucide="table-2"></i></div><div style="flex:1"><div class="report-name muted">Durées de vie + carnet</div><div class="report-sub muted">Excel · verrouillé</div></div><i data-lucide="lock"></i></div>
    ${archiveHtml()}
    <div class="reports-note locked"><i data-lucide="alert-circle"></i>Confirmez le texte des ${remaining} composante(s) restante(s) pour générer les rapports.</div>
  </div>`;
}

/* ---------- Tableau des composantes ---------- */

// Contrôle de cote : 1-4 + na, couleurs identiques à l'app terrain.
function ratingControlHtml(c) {
  const opts = RATINGS.map(r => {
    const on = c.rating === r.v;
    return `<button class="rt-opt ${on ? 'on' : ''}" data-action="set-rating" data-id="${c.id}" data-rating="${r.v}"
      title="${escapeHtml(r.v + ' · ' + r.label)}" aria-label="${escapeHtml(r.label)}"
      style="${on ? `background:${r.color};border-color:${r.color};color:#fff` : ''}">${r.v}</button>`;
  }).join('');
  const naOn = c.rating == null && !!c.done;
  const na = `<button class="rt-opt na ${naOn ? 'on' : ''}" data-action="set-rating" data-id="${c.id}" data-rating="na"
      title="${escapeHtml(RATING_NA.label)}" aria-label="${escapeHtml(RATING_NA.label)}"
      style="${naOn ? `background:${RATING_NA.color};border-color:${RATING_NA.color};color:#fff` : ''}">na</button>`;
  const proposee = c.rating != null && !c.done
    ? `<span class="rt-ia" title="Cote proposée par l'IA à partir des photos : cliquez-la pour la valider">IA</span>` : '';
  return `<div class="rt-ctrl">${opts}${na}${proposee}</div>`;
}

function ratingPillHtml(c) {
  const r = ratingInfo(c.rating) || RATING_NA;
  return `<span class="rating-pill" style="background:${r.bg};color:${r.color}">${escapeHtml(r.pill)}</span>`;
}

/* ---------- Gabarit de réponse : même vocabulaire fermé qu'au terrain ---------- */
const DELAIS = ['Immédiat (moins de 1 an)', 'Court terme (1 à 2 ans)', 'Moyen terme (3 à 5 ans)', 'Long terme (plus de 5 ans)', 'Aucun suivi particulier'];
const ETENDUES = [['ponctuel', 'Ponctuel'], ['localise', 'Localisé'], ['generalise', 'Généralisé']];
const LIMITES_OBS = [['de_pres', 'De près'], ['distance', 'À distance'], ['partiel', 'Partiel'], ['inaccessible', 'Non accessible']];
const RISQUES = [['securite', 'Sécurité'], ['infiltration', "Infiltration d'eau"], ['degradation', 'Dégradation'], ['conformite', 'Conformité'], ['esthetique', 'Esthétique']];
const SOURCES_ANNEE = [['plaque', 'Plaque'], ['carnet', 'Carnet'], ['administration', 'Administration'], ['estimee', 'Estimée']];

function choixHtml(c, field, liste) {
  return `<div class="seg seg-wrap">${liste.map(([k, lib]) => `<button class="seg-btn ${c[field] === k ? 'on' : ''}" data-action="set-facet" data-id="${c.id}" data-field="${field}" data-val="${escapeHtml(k)}">${escapeHtml(lib)}</button>`).join('')}</div>`;
}

function obsFieldHtml(c, field, label, placeholder) {
  const id = `obs_${c.id}_${field}`;
  return `<div class="obs-field">
    <label for="${id}">${escapeHtml(label)}</label>
    <textarea id="${id}" rows="2" data-role="comp-textarea" data-id="${c.id}" data-field="${field}"
      placeholder="${escapeHtml(placeholder)}">${escapeHtml(c[field] || '')}</textarea>
  </div>`;
}

function compDetailHtml(c) {
  const attrs = componentAttrs(c);
  const attrKeys = Object.keys(attrs);
  const posHtml = POSITIONS.map(pp => `<button class="seg-btn ${c.position === pp.v ? 'on' : ''}" data-action="set-facet" data-id="${c.id}" data-field="position" data-val="${pp.v}" title="${escapeHtml(pp.label)}">${pp.v}</button>`).join('');
  const empHtml = EMPLACEMENTS.map(pp => `<button class="seg-btn ${c.emplacement === pp.v ? 'on' : ''}" data-action="set-facet" data-id="${c.id}" data-field="emplacement" data-val="${pp.v}">${escapeHtml(pp.label)}</button>`).join('');
  return `
  <div class="comp-detail">
    <div class="comp-retirer"><button class="btn-pill-sm" data-action="retirer-composante" data-id="${c.id}"><i data-lucide="eye-off" style="width:13px;height:13px"></i>Retirer de l'étude (ne s'applique pas à cet immeuble)</button></div>
    <div class="comp-detail-col">
      <div class="detail-eyebrow">Relevé</div>
      ${obsFieldHtml(c, 'observation', 'Constats — un par ligne', 'Localisation – ce qui est observé')}
      <div class="facet-block">
        <div class="facet-lbl">Étendue</div>
        ${choixHtml(c, 'etendue', ETENDUES)}
        <input class="detail-input" style="margin-top:6px" data-role="comp-text" data-id="${c.id}" data-field="etendue_qte" value="${escapeHtml(c.etendue_qte || '')}" placeholder="Quantité touchée — ex. ≈ 4 m²">
      </div>
      <div class="facet-block">
        <div class="facet-lbl">Limite d'observation</div>
        ${choixHtml(c, 'limite_observation', LIMITES_OBS)}
        <input class="detail-input" style="margin-top:6px" data-role="comp-text" data-id="${c.id}" data-field="limite_detail" value="${escapeHtml(c.limite_detail || '')}" placeholder="Raison ou méthode">
      </div>
      ${obsFieldHtml(c, 'cause_possible', 'Cause possible', 'Origine probable, modalisée…')}
      <div class="facet-block">
        <div class="facet-lbl">Nature du risque</div>
        ${choixHtml(c, 'nature_risque', RISQUES)}
      </div>
      <div class="facet-block">
        <div class="facet-lbl">Délai suggéré${c.delai_suggere && !DELAIS.includes(c.delai_suggere) ? ` <span style="font-weight:400">(antérieur : ${escapeHtml(c.delai_suggere)})</span>` : ''}</div>
        ${choixHtml(c, 'delai_suggere', DELAIS.map(d => [d, d]))}
      </div>
      ${obsFieldHtml(c, 'consequences', 'Conséquences', "Si rien n'est fait…")}
      ${obsFieldHtml(c, 'projet_ca', 'Travaux planifiés par le conseil', 'ex. le remplacement des fenêtres pour 2027')}
      <div class="facet-block">
        <div class="facet-lbl">Source de l'année</div>
        ${choixHtml(c, 'source_annee', SOURCES_ANNEE)}
      </div>
    </div>
    <div class="comp-detail-col">
      <div class="detail-eyebrow">Facettes</div>
      <div class="facet-block">
        <div class="facet-lbl">Position de façade</div>
        <div class="seg">${posHtml}</div>
      </div>
      <div class="facet-block">
        <div class="facet-lbl">Emplacement</div>
        <div class="seg">${empHtml}</div>
      </div>
      <div class="facet-block">
        <div class="facet-lbl"><label for="var_${c.id}">Variante de matériau ou de type</label></div>
        <input id="var_${c.id}" class="detail-input" data-role="comp-text" data-id="${c.id}" data-field="variante"
          value="${escapeHtml(c.variante || '')}" placeholder="ex. Modules de béton, Bois traité">
      </div>
      <div class="facet-block">
        <div class="facet-lbl">Code Uniformat II</div>
        <div class="uniformat-readonly">${c.uniformat_code ? escapeHtml(c.uniformat_code) : '—'}<span>non modifiable</span></div>
      </div>
      <div class="facet-block">
        <div class="facet-lbl">Attributs</div>
        ${attrKeys.length ? `<div class="attr-list">${attrKeys.map((k, i) => `
          <div class="attr-row">
            <span class="k">${escapeHtml(k)}</span>
            <input id="attr_${c.id}_${i}" class="v" data-role="attr-value" data-id="${c.id}" data-key="${escapeHtml(k)}" value="${escapeHtml(attrs[k])}" placeholder="—">
            <button class="del" data-action="attr-del" data-id="${c.id}" data-key="${escapeHtml(k)}" title="Retirer ${escapeHtml(k)}" aria-label="Retirer ${escapeHtml(k)}"><i data-lucide="x" style="width:13px;height:13px"></i></button>
          </div>`).join('')}</div>` : `<div class="attr-empty">Aucun attribut consigné au terrain.</div>`}
      </div>
    </div>
  </div>`;
}

function compRowHtml(c, excluded) {
  const noCost = c.replacement_cost == null;
  const noLife = c.useful_life_years == null;
  const excInfo = excluded.find(e => String(e.id) === String(c.id));
  const isExcluded = !!excInfo;
  const rep = replacementYear(c);
  const repColor = !rep ? 'var(--ink-400)' : rep.delta < 0 ? 'var(--accent-press)' : rep.delta <= 5 ? 'var(--orange)' : 'var(--ink-700)';
  const open = !!state.expanded[c.id];
  const facets = facetSuffix(c);
  const obsCount = ['observation', 'etendue', 'limite_observation', 'cause_possible', 'nature_risque', 'delai_suggere', 'consequences'].filter(f => c[f]).length;
  return `
  <div class="comp-row-wrap ${open ? 'open' : ''}">
    <div class="comp-grid comp-row">
      <div class="comp-inc" title="${isExcluded ? escapeHtml('Exclue du calcul : ' + (excInfo.reason || '')) : 'Incluse au calcul'}">
        <i data-lucide="${isExcluded ? 'square' : 'check-square'}" style="width:16px;height:16px;color:${isExcluded ? 'var(--ink-300)' : 'var(--green)'}"></i>
      </div>
      <div class="comp-cell comp-name">
        <div class="cn-line">${escapeHtml(c.name || '—')}${c.uniformat_code ? `<span class="uni-chip" title="Code Uniformat II">${escapeHtml(c.uniformat_code)}</span>` : ''}</div>
        ${facets ? `<div class="cn-facets">${escapeHtml(facets)}</div>` : ''}
      </div>
      <div class="comp-rating-cell">${ratingControlHtml(c)}</div>
      <div class="comp-r-cell">
        <button class="r-toggle ${c.r_flag ? 'on' : ''}" data-action="toggle-rflag" data-id="${c.id}" title="Marqueur R" aria-label="Marqueur R">R</button>
      </div>
      <div class="comp-cell mono right bordered editable" contenteditable="true" id="cell_year_${c.id}" data-role="year-cell" data-id="${c.id}">${c.install_year != null ? escapeHtml(c.install_year) : ''}</div>
      <div class="comp-cell mono right bordered editable" contenteditable="true" id="cell_life_${c.id}" data-role="life-cell" data-id="${c.id}" style="color:${noLife ? 'var(--orange)' : 'var(--ink-700)'}">${noLife ? 'à compléter' : c.useful_life_years + ' ans'}</div>
      <div class="comp-cell mono right bordered" style="color:${repColor};font-weight:600" title="Année de construction ou réparation + durée de vie utile">${rep ? rep.year : '—'}</div>
      <div class="comp-cell mono right bordered editable" contenteditable="true" id="cell_cost_${c.id}" data-role="cost-cell" data-id="${c.id}" style="color:${noCost ? 'var(--orange)' : 'var(--ink-800)'};font-weight:600">${noCost ? 'à compléter' : fmt(c.replacement_cost) + ' $'}</div>
      <div class="comp-photo-cell"><i data-lucide="${c.photos > 0 ? 'image' : 'camera-off'}" style="width:14px;height:14px;color:${c.photos > 0 ? 'var(--ink-600)' : 'var(--ink-300)'}"></i><span>${c.photos || 0}</span></div>
      <div class="comp-exp-cell">
        <button class="exp-btn ${obsCount ? 'has' : ''}" data-action="toggle-detail" data-id="${c.id}"
          title="${open ? 'Masquer' : 'Observations et facettes'}" aria-label="Observations et facettes">
          <i data-lucide="${open ? 'chevron-up' : 'chevron-down'}"></i>
        </button>
      </div>
    </div>
    ${open ? compDetailHtml(c) : ''}
  </div>`;
}

/* ---------- Fiche d'immeuble (lecture seule) ---------- */

// Une rangée de la fiche : choix en boutons, ou champ libre enregistré au blur.
function immSegHtml(sec, key, choix) {
  const cur = immVal(sec, key);
  return `<div class="seg imm-seg">${Object.entries(choix).map(([v, l]) =>
    `<button class="seg-btn ${cur === v ? 'on' : ''}" data-action="imm-choix" data-sec="${sec}" data-key="${key}" data-val="${v}">${escapeHtml(l)}</button>`).join('')}</div>`;
}
function immInputHtml(sec, key, placeholder, mode) {
  return `<input class="detail-input imm-input" id="imm_${sec}_${key}" data-role="imm-input" data-sec="${sec}" data-key="${key}"
    value="${escapeHtml(immVal(sec, key) || '')}" placeholder="${escapeHtml(placeholder || '')}" ${mode ? `inputmode="${mode}"` : ''}>`;
}
function immLigneHtml(label, controle, sub) {
  return `<div class="imm-row ${sub ? 'sub' : ''}"><div class="imm-q">${escapeHtml(label)}</div><div class="imm-a">${controle}</div></div>`;
}

function batimentPanelHtml(d) {
  const count = batimentFilled();
  const head = `
    <button class="imm-head" data-action="toggle-batiment" aria-expanded="${state.batimentOpen ? 'true' : 'false'}">
      <div class="imm-head-icon"><i data-lucide="clipboard-list"></i></div>
      <div style="flex:1">
        <div class="imm-head-title">Fiche d'immeuble</div>
        <div class="imm-head-sub">${count ? count + ' réponse' + (count > 1 ? 's' : '') + ' consignée' + (count > 1 ? 's' : '') : 'Aucune réponse consignée pour l’instant'} · description, historique et documents du rapport</div>
      </div>
      <i data-lucide="${state.batimentOpen ? 'chevron-up' : 'chevron-down'}" style="color:var(--ink-500)"></i>
    </button>`;
  if (!state.batimentOpen) return `<div class="imm-panel">${head}</div>`;

  const docs = IMM_DOCS.map(([k, label]) => immLigneHtml(label, immSegHtml('documents', k, IMM_DOC_VALS))).join('');
  const caracs = IMM_CARACS.map(cfg => {
    if (cfg.si && immVal('caracteristiques', cfg.si) !== 'oui') return '';
    const ctl = cfg.type === 'ouinon' ? immSegHtml('caracteristiques', cfg.k, IMM_OUI_NON)
      : cfg.type === 'choice' ? immSegHtml('caracteristiques', cfg.k, cfg.vals)
      : cfg.type === 'year' ? immInputHtml('caracteristiques', cfg.k, 'AAAA', 'numeric')
      : cfg.type === 'number' ? immInputHtml('caracteristiques', cfg.k, '0', 'numeric')
      : immInputHtml('caracteristiques', cfg.k, '');
    return immLigneHtml(cfg.q, ctl, !!cfg.si);
  }).join('');
  const rempl = IMM_REMPLACEMENTS.map(([k, label]) => immLigneHtml(label, immInputHtml('remplacements', k, 'AAAA', 'numeric'))).join('');
  const entr = IMM_ENTRETIENS.map(([k, label]) => immLigneHtml(label, immInputHtml('entretiens', k, 'mm/aaaa'))).join('');

  return `
  <div class="imm-panel open">
    ${head}
    <div class="imm-body">
      ${state.batimentNote ? `<div class="temp-pass-warn" style="margin:0 0 12px"><i data-lucide="info"></i><span>${escapeHtml(state.batimentNote)}</span></div>` : ''}
      <div class="imm-section">
        <div class="imm-section-head"><span class="n">1</span>Documents à fournir avant la visite</div>
        ${docs}
      </div>
      <div class="imm-section">
        <div class="imm-section-head"><span class="n">2</span>Caractéristiques du bâtiment</div>
        ${caracs}
      </div>
      <div class="imm-section">
        <div class="imm-section-head"><span class="n">3</span>Années des derniers remplacements</div>
        ${rempl}
      </div>
      <div class="imm-section">
        <div class="imm-section-head"><span class="n">4</span>Dates des derniers entretiens</div>
        ${entr}
      </div>
      <div class="imm-foot">Enregistré à chaque réponse, au bureau comme au terrain. Certaines réponses (piscine, ascenseurs, génératrice…) activent ou retirent les composantes correspondantes. Le solde et la cotisation se saisissent dans la carte du fonds.</div>
    </div>
  </div>`;
}

/* ---------- Historique des modifications ---------- */

const journal = { ouvert: false, dossierId: null, entrees: null, chargement: false, erreur: null };
const ACTIONS_JOURNAL = {
  creation: 'a créé le dossier', modification: 'a modifié', ajout: 'a ajouté une composante', photo: 'a ajouté des photos',
  import: 'a importé des composantes', suivi: 'a changé le suivi', publication: 'a publié le rapport',
  depublication: 'a retiré la publication', revision: 'a commencé la révision',
};

async function chargerJournal(id) {
  journal.dossierId = id; journal.chargement = true; journal.erreur = null; render();
  try {
    journal.entrees = await apiJson(`/api/dossiers/${id}/journal?limite=200`);
  } catch (e) {
    journal.erreur = e.message || "Impossible de charger l'historique.";
  }
  journal.chargement = false; render();
}

function momentJournal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function journalPanelHtml(d) {
  const head = `
    <button class="imm-head" data-action="toggle-journal" aria-expanded="${journal.ouvert ? 'true' : 'false'}">
      <div class="imm-head-icon"><i data-lucide="history"></i></div>
      <div style="flex:1">
        <div class="imm-head-title">Historique des modifications</div>
        <div class="imm-head-sub">Qui a changé quoi, et quand — au terrain comme au bureau</div>
      </div>
      <i data-lucide="${journal.ouvert ? 'chevron-up' : 'chevron-down'}" style="color:var(--ink-500)"></i>
    </button>`;
  if (!journal.ouvert) return `<div class="imm-panel">${head}</div>`;
  let corps;
  if (journal.chargement || journal.dossierId !== d.id) corps = spinnerBlock("Chargement de l'historique…");
  else if (journal.erreur) corps = errorBanner(journal.erreur);
  else if (!journal.entrees || !journal.entrees.length) corps = `<div class="empty-state">Aucune modification consignée pour l'instant.</div>`;
  else corps = journal.entrees.map(e => {
    const MONTANTS = ['current_fund_balance', 'cotisation_annuelle', 'replacement_cost'];
    const valeur = (v, champ) => {
      if (v == null || v === '') return '<span class="jn-vide">vide</span>';
      if (MONTANTS.includes(champ) && !isNaN(Number(v))) return escapeHtml(fmt(Number(v)) + ' $');
      if (champ === 'published_at' || champ === 'echeance') return escapeHtml(momentJournal(v.length === 10 ? v + 'T12:00:00' : v).replace(/,? \d+ h \d+$/, ''));
      if (champ === 'useful_life_years') return escapeHtml(v + ' ans');
      if (['done', 'confirmed', 'r_flag', 'actif'].includes(champ)) return v === '1' ? 'oui' : 'non';
      return escapeHtml(v);
    };
    const champs = e.action === 'photo'
      ? `<div class="jn-champ">${escapeHtml((e.champs[0] && e.champs[0].apres) || '1')} photo(s)</div>`
      : e.champs.filter(ch => ch.champ !== 'photos').map(ch => ch.avant == null && ch.apres == null
        ? `<div class="jn-champ"><b>${escapeHtml(ch.libelle)}</b> modifié</div>`
        : `<div class="jn-champ"><b>${escapeHtml(ch.libelle)}</b> : ${valeur(ch.avant, ch.champ)} → ${valeur(ch.apres, ch.champ)}</div>`).join('');
    return `<div class="jn-entree">
      <div class="jn-tete"><span class="jn-qui">${escapeHtml(e.auteur || 'Système')}</span> ${ACTIONS_JOURNAL[e.action] || escapeHtml(e.action)}${e.composante ? ` <span class="jn-comp">${escapeHtml(e.composante.name)}</span>` : ''}<span class="jn-quand">${escapeHtml(momentJournal(e.moment))}</span></div>
      ${champs}
    </div>`;
  }).join('');
  return `<div class="imm-panel open">${head}<div class="imm-body jn-corps">${corps}</div></div>`;
}

function renderRevision() {
  if (state.revisionLoading) return `<div class="rev-shell">${spinnerBlock('Chargement du dossier…')}</div>`;
  if (state.revisionError) return `<div class="rev-shell"><div class="page-pad">${errorBanner(state.revisionError, 'retry-revision')}</div></div>`;
  const d = state.dossier;
  if (!d) return `<div class="rev-shell"><div class="page-pad"><div class="empty-state">Dossier introuvable.</div></div></div>`;
  const enriched = enrichDossier(d);
  const groups = groupedComponents();
  const cCount = confirmedCount();
  const total = state.components.length;
  const allConf = allConfirmed();
  const remaining = total - cCount;
  const proj = state.projection;
  const excluded = (proj && proj.excludedComponents) || [];
  const params = (proj && proj.params) || {};
  const docCount = state.components.filter(c => c.photos > 0).length;

  return `
  <div class="rev-shell">
    <div class="rev-header">
      <button class="back-link" data-action="go-dossiers"><i data-lucide="chevron-left"></i>Tous les dossiers</button>
      <div class="rev-top">
        <div>
          <div class="rev-badges">
            <span class="rev-status-pill" style="background:${enriched._statusBg};color:${enriched._statusColor}">${enriched._statusLabel}</span>
            <span class="rev-no">${escapeHtml(d.dossier_no || '')}</span>
          </div>
          <h1 class="rev-title">${escapeHtml(d.name || '—')}</h1>
          <div class="rev-sub">${escapeHtml(d.address || '')}${d.city ? ', ' + escapeHtml(d.city) : ''}${d.units ? ' · ' + d.units + ' unités' : ''}${d.built_year ? ' · construit ' + d.built_year : ''}</div>
        </div>
        <div class="rev-actions">
          ${saveIndicatorHtml()}
          <button class="btn-cta-pub" data-action="go-publier"><i data-lucide="send"></i>Publier au client</button>
        </div>
      </div>
    </div>
    <div class="rev-body cscr">
      ${state.revisionFlashError ? errorBanner(state.revisionFlashError) : ''}
      <div class="cards-grid">
        ${fundCardHtml(d, proj, params, excluded)}
        ${reportsCardHtml(allConf, remaining)}
      </div>

      ${scenarioCardsHtml(proj, state.selectedScenarioCode || (proj && proj.recommendedCode) || (proj && proj.scenarios && proj.scenarios[0] && proj.scenarios[0].code))}
      ${executiveSummaryHtml(proj, state.selectedScenarioCode || (proj && proj.recommendedCode) || (proj && proj.scenarios && proj.scenarios[0] && proj.scenarios[0].code))}


      <button class="reviewia-cta tp-cta" data-action="go-photos">
        <div class="reviewia-cta-icon"><i data-lucide="images"></i></div>
        <div style="flex:1">
          <div class="reviewia-cta-title">Déposer les photos du dossier</div>
          <div class="reviewia-cta-sub">Toutes d'un coup : l'IA propose une composante pour chaque photo, vous approuvez.${tri.nombreAClasser() ? ` <b>${tri.nombreAClasser()} photo(s) à classer.</b>` : ''}</div>
        </div>
        <div class="reviewia-cta-right"><i data-lucide="arrow-right"></i></div>
      </button>

      ${analyseCtaHtml()}
      ${state.analyse.note ? `<div class="temp-pass-warn" style="margin-bottom:14px"><i data-lucide="info"></i><span>${escapeHtml(state.analyse.note)}</span></div>` : ''}

      <button class="reviewia-cta" data-action="go-reviewia">
        <div class="reviewia-cta-icon"><i data-lucide="sparkles"></i></div>
        <div style="flex:1">
          <div class="reviewia-cta-title">Réviser le texte du rapport rédigé par l'IA</div>
          <div class="reviewia-cta-sub">Une composante à la fois : lisez, corrigez, confirmez. ${cCount}/${total} confirmées.</div>
        </div>
        <div class="reviewia-cta-right">
          <div class="reviewia-cta-track"><div class="reviewia-cta-fill" style="width:${total ? Math.round(cCount / total * 100) : 0}%"></div></div>
          <i data-lucide="arrow-right"></i>
        </div>
      </button>

      ${batimentPanelHtml(d)}
      ${journalPanelHtml(d)}

      <div class="comp-section-head">
        <span class="lbl">Composantes · ${docCount}/${total} documentées</span>
        <div class="rule"></div>
        <span class="hint">Édition directe des cellules</span>
        <button class="btn-pill-sm" data-action="saisie-ouvrir"><i data-lucide="table" style="width:14px;height:14px"></i>Saisie rapide</button>
        <button class="btn-pill-sm" data-action="sansphoto-ouvrir"><i data-lucide="camera-off" style="width:14px;height:14px"></i>Retirer sans photo</button>
        <button class="btn-pill-sm" data-action="couts-ouvrir"><i data-lucide="receipt" style="width:14px;height:14px"></i>Coûts de la banque</button>
        <button class="btn-pill-sm" data-action="lot-ouvrir"><i data-lucide="list-checks" style="width:14px;height:14px"></i>Confirmer en lot</button>
        <label class="btn-pill-sm">${state.composantesImportUploading ? 'Lecture du document…' : 'Importer un .docx'}<input type="file" accept=".docx" data-role="composantes-import-file" style="display:none" ${state.composantesImportUploading ? 'disabled' : ''}></label>
      </div>
      ${state.saisie.ouvert ? saisiePanelHtml() : ''}
      ${state.sansPhoto.ouvert ? sansPhotoPanelHtml() : ''}
      ${state.couts.ouvert ? coutsPanelHtml() : ''}
      ${state.lot.ouvert ? lotPanelHtml() : ''}
      ${state.lot.note ? `<div class="temp-pass-warn" style="margin-bottom:14px"><i data-lucide="info"></i><span>${escapeHtml(state.lot.note)}</span></div>` : ''}
      ${state.composantesImportError ? errorBanner(state.composantesImportError) : ''}
      ${state.composantesImportNote ? `<div class="temp-pass-warn" style="margin-bottom:14px"><i data-lucide="info"></i><span>${escapeHtml(state.composantesImportNote)}</span></div>` : ''}

      <div class="comp-table">
        <div class="comp-grid comp-thead">
          <div class="comp-th" style="text-align:center"><i data-lucide="check" style="width:12px;height:12px"></i></div>
          <div class="comp-th">Composante · code Uniformat</div>
          <div class="comp-th">Cote</div>
          <div class="comp-th" style="text-align:center">R</div>
          <div class="comp-th" style="text-align:right">Année constr./rép.</div>
          <div class="comp-th" style="text-align:right">Vie utile</div>
          <div class="comp-th" style="text-align:right">Année anticipée</div>
          <div class="comp-th" style="text-align:right">Coût remplac.</div>
          <div class="comp-th" style="text-align:center">Photos</div>
          <div class="comp-th"></div>
        </div>
        ${groups.length === 0 ? `<div class="empty-state">Aucune composante pour ce dossier.</div>` : groups.map(g => `
          <div>
            <div class="comp-group-head"><i data-lucide="${g.icon}"></i><span>${escapeHtml(g.label)}</span><span class="cnt">${g.rows.length}</span></div>
            ${g.rows.map(c => compRowHtml(c, excluded)).join('')}
          </div>`).join('')}
      </div>
      ${addCompFormHtml()}
      ${inactifsHtml()}
      <div class="comp-legend">
        <span class="legend-scale">Cote : ${RATINGS.map(r => `<span class="legend-rt"><b style="background:${r.color}">${r.v}</b>${escapeHtml(r.label)}</span>`).join('')}<span class="legend-rt"><b style="background:${RATING_NA.color}">na</b>${escapeHtml(RATING_NA.label)}</span></span>
        <span><span class="legend-r">R</span>Marqueur R</span>
        <span><span class="legend-dot"></span>Coût ou durée à compléter (souvent manquant du terrain)</span>
        <span><i data-lucide="camera-off" style="width:13px;height:13px"></i>Aucune photo</span>
        <span><i data-lucide="chevron-down" style="width:13px;height:13px"></i>Observations, facettes et attributs</span>
      </div>
    </div>
  </div>`;
}

// L'ingénieur signe hors de l'app (Word → PDF, signature ou sceau), puis
// dépose le PDF : c'est ce fichier que le syndicat télécharge.
function pdfSigneHtml(pub) {
  const p = pub.pdf_signe;
  const dateFr = (iso) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `
  <div class="pdf-etapes">
    <div class="pdf-etape"><span class="n">1</span><div style="flex:1">Téléchargez le rapport Word, relisez-le, exportez-le en PDF et signez-le (signature ou sceau).</div>
      <button class="btn-pill-sm" data-action="download-docx"><i data-lucide="file-text" style="width:14px;height:14px"></i>Word à signer</button></div>
    <div class="pdf-etape"><span class="n">2</span><div style="flex:1">${p
      ? `<b>${escapeHtml(p.nom)}</b> · déposé le ${escapeHtml(dateFr(p.le))}`
      : 'Déposez le PDF signé.'}</div>
      ${p ? `<button class="btn-pill-sm" data-action="voir-pdf-signe">Voir</button><button class="btn-pill-sm" data-action="retirer-pdf-signe">Retirer</button>` : ''}
      <button class="btn-pill-sm ${p ? '' : 'primary'}" data-action="deposer-pdf-signe" ${state.pdfEnvoi ? 'disabled' : ''}><i data-lucide="${state.pdfEnvoi ? 'loader-2' : 'upload'}" class="${state.pdfEnvoi ? 'spin' : ''}" style="width:14px;height:14px"></i>${state.pdfEnvoi ? 'Envoi…' : p ? 'Remplacer' : 'Déposer le PDF signé'}</button></div>
  </div>`;
}

function choisirPdfSigne() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) deposerPdfSigne(f); });
  input.click();
}

async function deposerPdfSigne(file) {
  state.pdfEnvoi = true;
  state.publishError = null;
  render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    await apiJson(`/api/dossiers/${state.dossierId}/pdf-signe`, { method: 'POST', body: fd });
  } catch (e) {
    state.publishError = e.message || "Échec de l'envoi du PDF.";
  }
  state.pdfEnvoi = false;
  await chargerPublication();
}

async function retirerPdfSigne() {
  if (!confirm('Retirer le PDF signé déposé ?')) return;
  try { await apiJson(`/api/dossiers/${state.dossierId}/pdf-signe`, { method: 'DELETE' }); }
  catch (e) { state.publishError = e.message; }
  await chargerPublication();
}

// Compléter son bloc de signature sans quitter la publication.
function signatureFormHtml(sig) {
  const ordres = ['OIQ', 'OTPQ', 'OAQ'];
  return `
  <form class="nf-card sig-form" id="signature-form">
    <div class="nf-grid">
      <div class="nf-field"><label class="field-label" for="sig_title">Titre</label>
        <input id="sig_title" class="detail-input" value="${escapeHtml(sig.title || '')}" placeholder="ex. ing., M.Sc.A."></div>
      <div class="nf-field"><label class="field-label" for="sig_ordre">Ordre professionnel *</label>
        <select id="sig_ordre" class="detail-input" required><option value="">—</option>${ordres.map(o => `<option ${sig.ordre_professionnel === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="nf-field"><label class="field-label" for="sig_no">N° de membre *</label>
        <input id="sig_no" class="detail-input" value="${escapeHtml(sig.no_membre || '')}" required></div>
    </div>
    <div class="nf-actions"><button type="submit" class="btn-primary">Enregistrer ma signature</button></div>
  </form>`;
}

async function enregistrerSignature() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  try {
    await apiJson('/api/auth/signature', { method: 'PATCH', body: JSON.stringify({ title: v('sig_title'), ordre_professionnel: v('sig_ordre'), no_membre: v('sig_no') }) });
  } catch (e) {
    state.publishError = e.message;
  }
  await chargerPublication();
}

function renderPublier() {
  const d = state.dossier;
  if (!d) return `<div class="rev-shell"><div class="page-pad"><div class="empty-state">Dossier introuvable.</div></div></div>`;
  const pub = state.publication;
  const res = state.publicationResultat;
  let body;
  if (state.publicationErreur) body = errorBanner(state.publicationErreur, 'go-publier');
  else if (!pub) body = spinnerBlock('Vérification du dossier…');
  else {
    const bloquants = pub.bloquants || [];
    const avert = pub.avertissements || [];
    const dest = pub.destinataires || [];
    const sig = pub.signataire || {};
    const publie = pub.publication;
    const actionPour = (cle) => cle === 'date_visite' ? `<button class="btn-pill-sm" data-action="go-revision">Saisir la date</button>`
      : cle === 'signataire' ? ''
      : cle === 'confirmation' ? `<button class="btn-pill-sm" data-action="go-reviewia">Réviser le texte</button>` : '';
    const ligne = (x, niveau) => `<div class="pv-row ${niveau}"><i data-lucide="${niveau === 'bloquant' ? 'x-circle' : 'alert-triangle'}"></i><span>${escapeHtml(x.message)}</span>${niveau === 'bloquant' ? actionPour(x.cle) : ''}</div>`;
    body = `
    <div class="pub-ready">
      <div class="pub-ready-top">
        ${publie ? `
        <div class="pv-publie">
          <i data-lucide="check-circle-2"></i>
          <div style="flex:1"><b>Publiée le ${escapeHtml(new Date(publie.published_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }))}</b>${publie.par ? ` par ${escapeHtml(publie.par)}` : ''}.
            ${publie.figee ? 'Le syndicat télécharge la version figée à ce moment.' : 'Publiée avant les versions figées : le portail regénère le rapport ; republiez pour figer la version.'}</div>
          ${publie.pdf ? `<button class="btn-pill-sm" data-action="telecharger-publie-pdf"><i data-lucide="download" style="width:14px;height:14px"></i>PDF publié</button>` : ''}
          ${publie.figee ? `<button class="btn-pill-sm" data-action="telecharger-publie"><i data-lucide="download" style="width:14px;height:14px"></i>Word publié</button>` : ''}
        </div>` : ''}
        ${res ? `<div class="pv-row ok"><i data-lucide="mail-check"></i><span>${res.avises ? `${res.avises} membre(s) du syndicat avisé(s) par courriel.` : 'Aucun membre actif à aviser.'}${res.echecs.length ? ` Échec d'envoi : ${escapeHtml(res.echecs.join(', '))}.` : ''}</span></div>` : ''}

        <div class="pub-section-eyebrow">Vérification avant publication</div>
        ${bloquants.length || avert.length ? '' : `<div class="pv-row ok"><i data-lucide="check-circle-2"></i><span>Rien à signaler : le rapport est complet.</span></div>`}
        ${bloquants.map((x) => ligne(x, 'bloquant')).join('')}
        ${avert.map((x) => ligne(x, 'avert')).join('')}

        <div class="pub-section-eyebrow" style="margin-top:22px">Signataire</div>
        <div class="recipient-card">
          <div class="recipient-avatar">${initialsOf(sig.name)}</div>
          <div style="flex:1"><div class="recipient-name">${escapeHtml(sig.name || '')}${sig.title ? ', ' + escapeHtml(sig.title) : ''}</div>
            <div class="recipient-sub">${sig.ordre_professionnel && sig.no_membre ? `${escapeHtml(sig.ordre_professionnel)} · n° ${escapeHtml(sig.no_membre)}` : 'Ordre professionnel ou n° de membre manquant'} · visite du ${d.date_visite ? escapeHtml(d.date_visite) : '—'}</div></div>
        </div>

        ${bloquants.some((x) => x.cle === 'signataire') ? signatureFormHtml(sig) : ''}

        <div class="pub-section-eyebrow" style="margin-top:22px">Étude signée (PDF) — ce que reçoit le syndicat</div>
        ${pdfSigneHtml(pub)}

        <div class="pub-section-eyebrow" style="margin-top:22px">Destinataires (membres du portail)</div>
        ${dest.length ? dest.map((m) => `
        <div class="recipient-card">
          <div class="recipient-avatar">${initialsOf(m.name)}</div>
          <div style="flex:1"><div class="recipient-name">${escapeHtml(m.name)}</div><div class="recipient-sub">${escapeHtml(m.email)}${m.en_attente ? ' · invitation en attente : verra le rapport en activant son accès' : ''}</div></div>
        </div>`).join('') : `<div class="recipient-sub">Aucun membre : invitez le syndicat depuis « Carnet d'entretien » pour qu'il soit avisé et puisse télécharger l'étude.</div>`}
      </div>
      ${state.publishError ? `<div style="padding:0 30px 16px">${errorBanner(state.publishError)}</div>` : ''}
      <div class="pub-footer">
        <div class="pub-footer-note">En publiant, le PDF signé et le rapport Word sont figés : le syndicat télécharge ce PDF, même si le dossier change ensuite. Les membres actifs reçoivent un courriel.</div>
        <button class="btn-primary" data-action="publish" ${state.publishing || bloquants.length ? 'disabled' : ''}><i data-lucide="${state.publishing ? 'loader-2' : 'send'}" class="${state.publishing ? 'spin' : ''}"></i>${state.publishing ? 'Production du rapport…' : publie ? 'Publier une nouvelle version' : 'Publier au syndicat'}</button>
      </div>
    </div>`;
  }
  return `
  <div class="rev-shell">
    <div class="rev-header">
      <button class="back-link" data-action="go-revision"><i data-lucide="chevron-left"></i>Retour à la révision</button>
      <h1 class="rev-title">Publier au client</h1>
      <div class="rev-sub">${escapeHtml(d.name || '')} · ${escapeHtml(d.dossier_no || '')}</div>
    </div>
    <div class="pub-body cscr">
      <div class="pub-container">${body}</div>
    </div>
  </div>`;
}

function coteRapportBlockHtml(redaction) {
  const raw = redaction ? redaction.coteRapport : null;
  const info = coteRapportInfo(raw);
  const label = info ? info.label : (raw ? String(raw) : 'Non déterminée');
  const style = info ? `background:${info.bg};color:${info.color}` : 'background:var(--ink-100);color:var(--ink-500)';
  return `<div class="cote-block">
    <div class="cote-k">Cote du rapport <span>échelle à 3 niveaux</span></div>
    <span class="cote-pill" style="${style}">${escapeHtml(label)}</span>
    ${info ? `<div class="cote-long">${escapeHtml(info.long)}</div>` : `<div class="cote-long muted">Aucune cote de rapport retournée par le générateur.</div>`}
  </div>`;
}

/* ---------- diff mot-à-mot : texte généré par l'IA vs texte courant ----------
   LCS classique sur des tokens mot/espace (une section fait au plus
   quelques centaines de tokens, donc le O(n·m) reste instantané), pour
   que l'ingénieur voie précisément ce qu'il a changé par rapport à ce
   que le serveur a proposé. */
function tokenizeForDiff(s) {
  return String(s || '').split(/(\s+)/).filter(t => t !== '');
}
function diffTokens(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'same', v: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', v: a[i] }); i++; }
    else { ops.push({ type: 'add', v: b[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', v: a[i] }); i++; }
  while (j < m) { ops.push({ type: 'add', v: b[j] }); j++; }
  // fusionne les tokens consécutifs de même type pour limiter le nombre de balises
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.v += op.v;
    else merged.push({ type: op.type, v: op.v });
  }
  return merged;
}
function diffHtml(oldText, newText) {
  const a = tokenizeForDiff(oldText), b = tokenizeForDiff(newText);
  if (a.join('') === b.join('')) return `<div class="rvia-diff-empty">Identique au texte généré.</div>`;
  const ops = diffTokens(a, b);
  const wordCount = v => (v.match(/\S+/g) || []).length;
  const added = ops.filter(o => o.type === 'add').reduce((n, o) => n + wordCount(o.v), 0);
  const removed = ops.filter(o => o.type === 'del').reduce((n, o) => n + wordCount(o.v), 0);
  const body = ops.map(op => {
    const text = escapeHtml(op.v);
    if (op.type === 'del') return `<del>${text}</del>`;
    if (op.type === 'add') return `<ins>${text}</ins>`;
    return text;
  }).join('');
  return `<div class="rvia-diff-stats">${added ? `+${added}` : ''}${added && removed ? ' · ' : ''}${removed ? `-${removed}` : ''} vs le texte généré</div><div class="rvia-diff-text">${body}</div>`;
}

// Pendant que le panneau de diff d'une section est ouvert, on le recalcule à
// chaque frappe — mais avec un léger anti-rebond pour ne pas relancer le LCS
// à chaque caractère, et toujours par manipulation DOM directe (jamais via
// state/render(), qui effacerait la saisie en cours).
const secDiffTimers = {};
function onSecTextInput(el) {
  const panel = document.getElementById('secDiff_' + (el.id || '').replace('secText_', ''));
  if (!panel || panel.style.display === 'none') return;
  const id = el.id;
  clearTimeout(secDiffTimers[id]);
  secDiffTimers[id] = setTimeout(() => {
    panel.innerHTML = diffHtml(el.getAttribute('data-sec-original') || '', el.textContent);
  }, 200);
}

function redactionTableHtml(tbl) {
  if (!tbl || !Array.isArray(tbl.entetes) || !Array.isArray(tbl.lignes)) return '';
  return `<div class="rvia-table-wrap">
    <table class="rvia-table">
      <thead><tr>${tbl.entetes.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${tbl.lignes.map(ln => `<tr>${(Array.isArray(ln) ? ln : [ln]).map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function redactionSectionHtml(sec, i) {
  const cle = sec && sec.cle ? sec.cle : '';
  if (cle === 'attention' && !(sec && sec._brut)) return attentionsSectionHtml(sec, i);
  const icon = SECTION_ICONS[cle] || 'file-text';
  const inactive = sec && sec.actif === false;
  const collapsed = inactive && !state.attentionOpen;
  const titre = (sec && sec.titre) || '';
  const color = inactive ? 'var(--ink-400)' : (cle === 'attention' ? 'var(--accent-press)' : 'var(--orange)');
  const texte = (sec && sec.texte) || '';
  return `
  <div class="rvia-section ${inactive ? 'inactive' : ''} ${collapsed ? 'collapsed' : ''}">
    <div class="rvia-section-head" style="color:${color}">
      <i data-lucide="${icon}"></i><span>${escapeHtml(titre)}</span>
      ${inactive ? `<span class="rvia-inactive-tag">inactive</span>
      <button class="rvia-section-toggle" data-action="toggle-attention">${state.attentionOpen ? 'Masquer' : 'Afficher'}</button>` : ''}
      <button class="rvia-diff-toggle" data-action="toggle-diff" data-idx="${i}" title="Comparer avec le texte généré par l'IA"><i data-lucide="eye" style="width:12px;height:12px"></i><span class="lbl">Modifications</span></button>
    </div>
    <p class="rvia-section-text" id="secText_${i}" contenteditable="true" data-sec-text data-sec-cle="${escapeHtml(cle)}" data-sec-title="${escapeHtml(titre)}" data-sec-original="${escapeHtml(texte)}">${escapeHtml(texte)}</p>
    <div class="rvia-diff" id="secDiff_${i}" style="display:none"></div>
    ${redactionTableHtml(sec && sec.tableau)}
  </div>`;
}

function redactionBodyHtml() {
  if (state.redactionLoading) return spinnerBlock('Rédaction en cours…');
  if (state.redactionMissing) {
    return `<div class="rvia-unavailable">
      <i data-lucide="server-off"></i>
      <div class="t">Générateur de rédaction indisponible</div>
      <div class="b">Le service <code>POST /api/components/:id/redaction</code> n'est pas encore déployé sur ce serveur. Le texte du rapport sera affiché ici dès qu'il le sera — la révision des données de la composante reste possible sur l'écran précédent.</div>
      <button class="btn-secondary" data-action="retry-redaction"><i data-lucide="refresh-cw" style="width:15px;height:15px"></i>Réessayer</button>
    </div>`;
  }
  if (state.redactionError) {
    return `<div class="rvia-unavailable error">
      <i data-lucide="alert-triangle"></i>
      <div class="t">La rédaction n'a pas pu être générée</div>
      <div class="b">${escapeHtml(state.redactionError)}</div>
      <button class="btn-secondary" data-action="retry-redaction"><i data-lucide="refresh-cw" style="width:15px;height:15px"></i>Réessayer</button>
    </div>`;
  }
  const r = state.redaction;
  if (!r) return `<div class="rvia-unavailable"><i data-lucide="file-question"></i><div class="t">Aucune rédaction</div><div class="b">Aucun texte n'a été retourné pour cette composante.</div><button class="btn-secondary" data-action="retry-redaction"><i data-lucide="refresh-cw" style="width:15px;height:15px"></i>Générer</button></div>`;
  const sections = orderedSections(r.sections);
  return `
    <div class="rvia-hint">
      <i data-lucide="pencil"></i>
      <span>Texte produit par le serveur — le même que celui du rapport Word. Cliquez dans un paragraphe pour le corriger.</span>
      <button class="rvia-regen" data-action="regen-redaction" title="Régénérer"><i data-lucide="refresh-cw" style="width:13px;height:13px"></i>Régénérer</button>
    </div>
    ${sections.map(redactionSectionHtml).join('')}`;
}

function renderReviewIA() {
  const list = orderedComponents();
  const total = list.length;
  const idx = state.reviewIdx;
  const done = idx >= total;
  const pos = Math.min(idx + 1, total);
  const progressW = total ? Math.round(idx / total * 100) : 0;

  let inner;
  if (done) {
    inner = `
    <div class="rvia-done">
      <div class="rvia-done-inner">
        <div class="rvia-done-icon"><i data-lucide="check-circle-2" style="width:32px;height:32px"></i></div>
        <h2>Texte révisé</h2>
        <p>Les ${confirmedCount()} sections confirmées sont intégrées au rapport Word. Vous pouvez maintenant le générer et publier.</p>
        <button class="btn-primary" data-action="go-revision">Retour à la révision</button>
      </div>
    </div>`;
  } else {
    const c = list[idx];
    const info = catInfo(c.cat);
    const conf = c.confirmed === 1;
    const last = idx >= total - 1;
    const r = state.redaction;
    const titre = (r && r.titre) || (c.name + (c.uniformat_code ? ` (${c.uniformat_code})` : ''));
    const costLife = (c.replacement_cost ? fmt(c.replacement_cost) + ' $' : 'à compléter') + ' · ' + (c.useful_life_years ? c.useful_life_years + ' ans' : '—');
    const rep = replacementYear(c);
    const photosLoading = state.reviewPhotosLoading;
    const photos = state.reviewPhotos;
    const source = r && r.source ? r.source : null;

    inner = `
    <div class="rvia-card-outer">
      <div class="rvia-card">
        <div class="rvia-card-head">
          <div>
            <div class="rvia-card-eyebrow"><i data-lucide="${info.icon}"></i><span>${escapeHtml(info.label)}</span><span>#${escapeHtml(String(c.id))}</span></div>
            <h2 class="rvia-card-title">${escapeHtml(titre)}</h2>
          </div>
          <div class="rvia-head-right">
            ${source ? (() => {
              const libelles = { 'ia': ['sparkles', 'Rédigé par l’IA'], 'ia+banque': ['library', 'IA + banque de la firme'], 'valide': ['check-circle-2', 'Validé par l’ingénieur'], 'gabarit': ['file-text', 'Gabarit'] };
              const [ic, lib] = libelles[source] || libelles.gabarit;
              return `<span class="src-badge ${source === 'gabarit' ? '' : 'ia'}"><i data-lucide="${ic}" style="width:12px;height:12px"></i>${lib}</span>`;
            })() : ''}
            ${r && r.exemples_utilises ? `<span class="src-badge" title="Textes déjà validés par votre firme, utilisés comme exemples de style — jamais comme source de faits."><i data-lucide="library" style="width:12px;height:12px"></i>${r.exemples_utilises} exemple${r.exemples_utilises > 1 ? 's' : ''}</span>` : ''}
            <span class="rvia-status-badge" style="background:${conf ? 'var(--green-wash)' : 'var(--orange-wash)'};color:${conf ? 'var(--green)' : 'var(--accent-press)'}"><i data-lucide="${conf ? 'check' : 'pencil'}" style="width:13px;height:13px"></i>${conf ? 'Confirmée' : 'À réviser'}</span>
          </div>
        </div>
        <div class="rvia-body">
          <div class="rvia-photos-col cscr">
            <div class="rvia-photos-eyebrow">Photos (${photosLoading ? '…' : photos.length})</div>
            ${photosLoading ? spinnerBlock('Chargement des photos…') : (photos.length > 0 ? `
            ${photosRapportNoteHtml(photos)}
            <div class="rvia-photos-grid">
              ${photos.map(p => `<div class="rvia-photo ${p.au_rapport ? 'au-rapport' : ''}"><img src="${p.url}" alt=""><div class="rvia-photo-tag">${escapeHtml(p.tag)}</div>
                <button class="rvia-photo-star" data-action="photo-rapport" data-id="${p.id}" title="${p.au_rapport ? 'Retirer du rapport' : 'Mettre au rapport'}" aria-pressed="${p.au_rapport ? 'true' : 'false'}"><i data-lucide="star" style="width:14px;height:14px"></i></button></div>`).join('')}
            </div>` : `
            <div class="rvia-no-photos"><i data-lucide="camera-off" style="width:22px;height:22px"></i><div>Aucune photo au dossier</div></div>`)}
            ${r ? coteRapportBlockHtml(r) : ''}
            <div class="rvia-meta">
              <div class="rvia-meta-row"><span class="k">Cote de terrain <i>1-4</i></span><span class="v">${ratingPillHtml(c)}</span></div>
              <div class="rvia-meta-row"><span class="k">Marqueur R</span><span class="v">${c.r_flag ? '<span class="r-pill">R</span>' : '—'}</span></div>
              <div class="rvia-meta-row"><span class="k">Délai suggéré</span><span class="v">${escapeHtml(c.delai_suggere || '—')}</span></div>
              <div class="rvia-meta-row"><span class="k">Coût / vie utile</span><span class="v">${escapeHtml(costLife)}</span></div>
              <div class="rvia-meta-row"><span class="k">Année anticipée</span><span class="v">${rep ? rep.year : '—'}</span></div>
            </div>
            ${c.observation ? `<div class="rvia-terrain-note"><div class="k">Observation du terrain</div><div class="v">${escapeHtml(c.observation)}</div></div>` : ''}
          </div>
          <div class="rvia-sections-col cscr">
            ${redactionBodyHtml()}
          </div>
        </div>
        <div class="rvia-card-footer">
          <button class="btn-skip" data-action="rv-skip">Passer<i data-lucide="corner-down-right"></i></button>
          <button class="btn-confirm" data-action="rv-confirm"><i data-lucide="check"></i>${last ? 'Confirmer & terminer' : 'Confirmer & suivante'}</button>
        </div>
      </div>
    </div>`;
  }

  return `
  <div class="rvia-shell">
    <div class="rvia-topbar">
      <button class="rvia-close" data-action="go-revision"><i data-lucide="x"></i>Fermer</button>
      <div class="rvia-tag"><i data-lucide="sparkles" style="width:14px;height:14px;color:var(--orange)"></i><span>Révision du texte IA</span></div>
      <div class="rvia-progress"><div class="rvia-progress-track"><div class="rvia-progress-fill" style="width:${progressW}%"></div></div><span>${pos} / ${total}</span></div>
      <div class="rvia-nav">
        <button class="icon-btn" data-action="rv-prev" ${idx <= 0 ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button>
        <button class="icon-btn" data-action="rv-skip" ${done ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button>
      </div>
    </div>
    ${inner}
  </div>`;
}

// ---------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------
function initEvents() {
  const app = document.getElementById('app');
  tri.brancher(app, () => state.screen === 'photos');

  app.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'login-form') {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      doLogin(email, password);
    } else if (e.target && e.target.id === 'signature-form') {
      e.preventDefault();
      enregistrerSignature();
    } else if (e.target && e.target.id === 'add-comp-form') {
      e.preventDefault();
      addComponent();
    } else if (e.target && e.target.id === 'prix-form') {
      e.preventDefault();
      submitPrix();
    } else if (e.target && e.target.id === 'carnet-form') {
      e.preventDefault();
      inviterAuPortail();
    } else if (e.target && e.target.id === 'equipe-form') {
      e.preventDefault();
      inviterMembre();
    }
  });

  // Keep login field values in state (without re-rendering on every keystroke)
  // so a render triggered elsewhere (e.g. loginLoading toggling) doesn't wipe
  // what the user already typed.
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="attn"]')) { const a = attentionById(t.getAttribute('data-id')); if (a) a[t.getAttribute('data-f')] = t.value; }
    else if (t.matches('[data-role="saisie"]')) state.saisie.brouillon[t.getAttribute('data-id') + '|' + t.getAttribute('data-field')] = t.value;
    else if (t.matches('#add-comp-form [data-draft]')) state.addComp[t.getAttribute('data-draft')] = t.value;
    else if (t.matches('[data-role="login-email"]')) state.loginEmail = t.value;
    else if (t.matches('[data-role="login-password"]')) state.loginPassword = t.value;
    else if (t.matches('[data-sec-text]')) onSecTextInput(t);
    else if (bib.input(t)) return;
    else if (state.screen === 'modeles' && modeles.input(t)) return;
    else if (t.matches('[data-role="equipe-name"]')) equipe.form.name = t.value;
    else if (t.matches('[data-role="clients-recherche"]')) { clients.recherche = t.value; render(); }
    else if (t.id && t.id.startsWith('cli-') && clients.courant) lireFormClient();
    else if (t.matches('[data-role="crm-recherche"]')) { clients.crm.recherche = t.value; render(); }
    else if (t.matches('[data-role="carnet-name"]')) carnet.form.name = t.value;
    else if (t.matches('[data-role="carnet-email"]')) carnet.form.email = t.value;
    else if (t.matches('[data-role="carnet-fonction"]')) carnet.form.fonction = t.value;
    else if (t.matches('[data-role="equipe-email"]')) equipe.form.email = t.value;
    else if (t.matches('[data-role="prix-field"]')) {
      const champ = t.getAttribute('data-field');
      state.prixForm[champ] = t.type === 'checkbox' ? t.checked : t.value;
      // L'unité commande la présence du champ quantité : elle seule redessine.
      if (champ === 'unite') render();
    }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-role="visite-input"]')) { onVisiteChange(t.value); return; }
    if (t && t.matches && t.matches('[data-role="cout-choix"]')) { state.couts.choix[t.getAttribute('data-id')] = t.checked; render(); return; }
    if (t && t.matches && t.matches('[data-role="sansphoto-choix"]')) { state.sansPhoto.choix[t.getAttribute('data-id')] = t.checked; render(); return; }
    if (t && t.matches && t.matches('[data-role="saisie-tous"]')) { state.saisie.tous = t.checked; state.saisie.ids = saisieListe(); render(); return; }
    if (t && t.matches && t.matches('[data-role="lot-choix"]')) { state.lot.choix[t.getAttribute('data-k')] = t.checked; render(); return; }
    if (t && t.matches && state.screen === 'photos' && tri.change(t)) return;
    if (t && t.matches && bib.change(t)) return;
    if (t && t.matches && state.screen === 'modeles' && modeles.change(t)) return;
    if (t && t.matches && t.matches('[data-role="logo-firme"]')) { const f = t.files && t.files[0]; t.value = ''; if (f) envoyerLogo(f); return; }
    if (t && t.matches && t.matches('[data-role="equipe-role"]')) { equipe.form.role = t.value; return; }
    if (t && t.matches && t.matches('[data-role="carnet-dossier"]')) { ouvrirCarnet(t.value); return; }
    if (t && t.matches && t.matches('[data-role="suivi-assigne"]')) { majSuivi(t.getAttribute('data-id'), { assigne_a: t.value || null }); return; }
    if (t && t.matches && t.matches('[data-role="suivi-echeance"]')) { majSuivi(t.getAttribute('data-id'), { echeance: t.value || null }); return; }
    if (t && t.matches && t.matches('[data-role="suivi-filtre"]')) { suivi.responsable = t.value; render(); return; }
    if (t && t.matches && t.matches('[data-role="crm-choix"]')) {
      const id = t.getAttribute('data-id');
      if (t.checked) clients.crm.choix.add(id); else clients.crm.choix.delete(id);
      render(); return;
    }
    if (t && t.matches && t.matches('[data-role="carnet-defaut"]')) {
      if (t.value) carnet.edits.defauts[t.getAttribute('data-q')] = t.value; else delete carnet.edits.defauts[t.getAttribute('data-q')];
      carnet.dirty = true; render(); return;
    }
    if (t && t.matches && t.matches('[data-role="carnet-tache"]')) {
      const cle = t.getAttribute('data-cle');
      if (t.value === '') delete carnet.edits.taches[cle];
      else carnet.edits.taches[cle] = t.value === '__personne' ? '' : t.value;
      carnet.dirty = true; render(); return;
    }
    if (t && t.matches && t.matches('[data-role="composantes-import-file"]')) {
      const f = t.files && t.files[0];
      t.value = '';
      if (f) uploadComposantesImport(f);
    }
  });

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (bib.click(action, btn)) return;
    if (state.screen === 'modeles' && modeles.click(action, btn)) return;
    if (state.screen === 'photos' && tri.click(action, btn)) return;
    switch (action) {
      case 'analyser-photos':
        analyserPhotos();
        break;
      case 'go-photos':
        state.screen = 'photos';
        render();
        tri.ouvrir(state.dossierId);
        break;
      case 'open-add-comp':
        state.addCompOpen = true;
        state.addCompError = null;
        render();
        { const el = document.getElementById('nf_addComp_name'); if (el) el.focus(); }
        break;
      case 'cancel-add-comp':
        state.addCompOpen = false;
        state.addCompError = null;
        render();
        break;
      case 'go-carnet':
        leaveReviewIA();
        state.screen = 'carnet';
        ouvrirCarnet(state.dossierId);
        break;
      case 'carnet-apercu': apercuPortail(); break;
      case 'carnet-rappels': envoyerRappels(); break;
      case 'carnet-enregistrer': enregistrerRepartition(); break;
      case 'carnet-membre': actionMembrePortail(btn.getAttribute('data-id'), btn.getAttribute('data-op')); break;
      case 'nouvelle-revision':
        nouvelleRevision(btn.getAttribute('data-id'));
        break;
      case 'export-firme': exporterFirme(); break;
      case 'archive-dossier': archiverDossier(); break;
      case 'go-modeles':
        leaveReviewIA();
        state.screen = 'modeles';
        modeles.reset();
        render();
        modeles.charger();
        break;
      case 'go-clients':
        leaveReviewIA();
        state.screen = 'clients';
        clients.courant = null; clients.erreur = null; clients.note = null;
        render();
        chargerClients();
        break;
      case 'client-ouvrir': ouvrirClient(btn.getAttribute('data-id')); break;
      case 'client-liste': clients.courant = null; clients.erreur = null; clients.note = null; render(); chargerClients(); break;
      case 'client-nouveau': clients.courant = { id: null, nom: '', contacts: [{}], dossiers: [] }; clients.erreur = null; render(); break;
      case 'client-depuis-groupe': clientDepuisGroupe(Number(btn.getAttribute('data-i'))); break;
      case 'client-enregistrer': enregistrerClient(); break;
      case 'client-contact-ajouter': lireFormClient(); clients.courant.contacts.push({}); render(); break;
      case 'client-contact-retirer': lireFormClient(); clients.courant.contacts.splice(Number(btn.getAttribute('data-i')), 1); render(); break;
      case 'client-supprimer': supprimerClient(); break;
      case 'client-detacher': detacherDossier(btn.getAttribute('data-id')); break;
      case 'client-nouveau-dossier': nouveauDossierClient(); break;
      case 'client-crm': ouvrirCrm(); break;
      case 'client-crm-fermer': clients.crm = null; render(); break;
      case 'client-crm-importer': importerCrm(); break;
      case 'client-crm-tout': clients.crm.choix = new Set(crmFiltres().map(x => x.id)); render(); break;
      case 'go-equipe':
        leaveReviewIA();
        state.screen = 'equipe';
        equipe.note = null; equipe.lien = null; equipe.error = null;
        render();
        chargerEquipe();
        break;
      case 'equipe-action':
        actionMembre(btn.getAttribute('data-id'), btn.getAttribute('data-op'));
        break;
      case 'go-bibliotheque':
        leaveReviewIA();
        state.screen = 'bibliotheque';
        bib.s.note = null;
        bib.s.erreurs = [];
        bib.s.error = null;
        render();
        bib.charger();
        break;
      case 'go-dossiers':
        leaveReviewIA();
        state.screen = 'dossiers';
        render();
        loadDossiers();
        break;
      case 'go-prix':
        leaveReviewIA();
        state.screen = 'prix';
        render();
        loadPrix();
        break;
      case 'retry-prix':
        loadPrix();
        break;
      case 'prix-toggle-form':
        if (state.prixFormOpen) { fermerPrixForm(); break; }
        state.prixFormOpen = true;
        state.prixFormError = null;
        render();
        break;
      case 'prix-modifier':
        ouvrirPrixEdition(btn.getAttribute('data-id'));
        break;
      case 'prix-crm-refresh':
        loadPrixCrm();
        break;
      case 'prix-crm-detail': {
        const cle = btn.getAttribute('data-cle');
        if (state.prixCrmDetail[cle]) delete state.prixCrmDetail[cle];
        else state.prixCrmDetail[cle] = true;
        render();
        break;
      }
      case 'prix-crm-choisir': {
        const cle = btn.getAttribute('data-cle');
        if (state.prixCrmSel[cle]) delete state.prixCrmSel[cle];
        else state.prixCrmSel[cle] = true;
        render();
        break;
      }
      case 'prix-crm-importer':
        importerPrixCrm();
        break;
      case 'prix-filter':
        state.prixFilter = btn.getAttribute('data-filter');
        render();
        break;
      case 'prix-valide':
        setPrixValide(btn.getAttribute('data-id'), btn.getAttribute('data-valide') === '1');
        break;
      case 'prix-supprimer':
        deletePrix(btn.getAttribute('data-id'));
        break;
      case 'go-revision':
        leaveReviewIA();
        state.revisionFlashError = null;
        state.screen = 'revision';
        render();
        break;
      case 'go-publier':
        state.publishError = null;
        state.publicationResultat = null;
        state.screen = 'publier';
        chargerPublication();
        break;
      case 'deposer-pdf-signe':
        choisirPdfSigne();
        break;
      case 'retirer-pdf-signe':
        retirerPdfSigne();
        break;
      case 'voir-pdf-signe':
        telecharger(`/api/dossiers/${state.dossierId}/pdf-signe.pdf`, `${(state.dossier && state.dossier.dossier_no) || 'dossier'}-etude-signee.pdf`)
          .catch((e) => { state.publishError = e.message; render(); });
        break;
      case 'telecharger-publie-pdf':
        telecharger(`/api/dossiers/${state.dossierId}/rapport-publie.pdf`, `${(state.dossier && state.dossier.dossier_no) || 'dossier'}-etude-fonds-prevoyance.pdf`)
          .catch((e) => { state.publishError = e.message; render(); });
        break;
      case 'telecharger-publie':
        telecharger(`/api/dossiers/${state.dossierId}/rapport-publie.docx`, `${(state.dossier && state.dossier.dossier_no) || 'dossier'}-etude-fonds-prevoyance.docx`)
          .catch((e) => { state.publishError = e.message; render(); });
        break;
      case 'select-scenario':
        state.selectedScenarioCode = btn.getAttribute('data-code');
        render();
        break;
      case 'go-reviewia':
        goReviewIA();
        break;
      case 'open-dossier':
        openDossier(btn.getAttribute('data-id'));
        break;
      case 'suivi-prendre': majSuivi(btn.getAttribute('data-id'), { assigne_a: suivi.moi }); break;
      case 'suivi-retirer': majSuivi(btn.getAttribute('data-id'), { assigne_a: null }); break;
      case 'filter':
        state.filter = btn.getAttribute('data-filter');
        render();
        break;
      case 'select-scenario':
        state.selectedScenarioCode = btn.getAttribute('data-code');
        render();
        break;
      case 'logout':
        doLogout();
        break;
      case 'retry-dossiers':
        loadDossiers();
        break;
      case 'retry-revision':
        loadDossierDetail(state.dossierId);
        break;
      case 'download-docx':
        downloadReport('docx');
        break;
      case 'download-xlsx':
        downloadReport('xlsx');
        break;
      case 'download-suivi':
        downloadReport('suivi');
        break;
      case 'toggle-detail': {
        const cid = btn.getAttribute('data-id');
        if (state.expanded[cid]) delete state.expanded[cid];
        else state.expanded[cid] = true;
        render();
        break;
      }
      case 'toggle-journal':
        journal.ouvert = !journal.ouvert;
        if (journal.ouvert && state.dossier) chargerJournal(state.dossier.id); else render();
        break;
      case 'toggle-batiment':
        state.batimentOpen = !state.batimentOpen;
        state.batimentNote = null;
        render();
        break;
      case 'couts-ouvrir':
        if (state.couts.ouvert) { state.couts.ouvert = false; render(); } else ouvrirCouts();
        break;
      case 'couts-fermer':
        state.couts.ouvert = false;
        render();
        break;
      case 'couts-appliquer':
        appliquerCouts();
        break;
      case 'saisie-ouvrir':
        ouvrirSaisie();
        break;
      case 'saisie-fermer':
        state.saisie.ouvert = false;
        render();
        break;
      case 'sansphoto-ouvrir':
        ouvrirSansPhoto();
        break;
      case 'sansphoto-fermer':
        state.sansPhoto.ouvert = false;
        render();
        break;
      case 'sansphoto-retirer':
        retirerSansPhoto();
        break;
      case 'lot-ouvrir':
        state.lot.ouvert = !state.lot.ouvert;
        state.lot.note = null;
        render();
        break;
      case 'lot-fermer':
        state.lot.ouvert = false;
        render();
        break;
      case 'lot-confirmer':
        lotConfirmer();
        break;
      case 'retirer-composante':
        changerActif(btn.getAttribute('data-id'), 0);
        break;
      case 'reactiver-composante':
        changerActif(btn.getAttribute('data-id'), 1);
        break;
      case 'inactifs-toggle':
        state.inactifsOuverts = !state.inactifsOuverts;
        render();
        break;
      case 'imm-choix': {
        const sec = btn.getAttribute('data-sec'), key = btn.getAttribute('data-key'), val = btn.getAttribute('data-val');
        immEnregistrer(sec, key, immVal(sec, key) === val ? '' : val);
        break;
      }
      case 'set-rating':
        onRatingClick(btn.getAttribute('data-id'), btn.getAttribute('data-rating'));
        break;
      case 'toggle-rflag':
        onRflagClick(btn.getAttribute('data-id'));
        break;
      case 'set-facet':
        onFacetClick(btn.getAttribute('data-id'), btn.getAttribute('data-field'), btn.getAttribute('data-val'));
        break;
      case 'attr-del':
        onAttrDelete(btn.getAttribute('data-id'), btn.getAttribute('data-key'));
        break;
      case 'toggle-attention':
        state.attentionOpen = !state.attentionOpen;
        render();
        break;
      case 'toggle-diff': {
        // Jamais via state/render() : un re-rendu régénère chaque paragraphe
        // depuis sec.texte et effacerait une correction en cours de saisie.
        const idx = btn.getAttribute('data-idx');
        const panel = document.getElementById(`secDiff_${idx}`);
        const textEl = document.getElementById(`secText_${idx}`);
        if (!panel || !textEl) break;
        const opening = panel.style.display === 'none';
        if (opening) {
          panel.innerHTML = diffHtml(textEl.getAttribute('data-sec-original') || '', textEl.textContent);
          panel.style.display = 'block';
        } else {
          panel.style.display = 'none';
        }
        btn.classList.toggle('on', opening);
        const lbl = btn.querySelector('.lbl');
        if (lbl) lbl.textContent = opening ? 'Masquer' : 'Modifications';
        break;
      }
      case 'retry-redaction':
        loadRedactionForCurrent({ force: true });
        break;
      case 'regen-redaction':
        loadRedactionForCurrent({ force: true });
        break;
      case 'rv-prev':
        rvPrev();
        break;
      case 'rv-skip':
        rvSkip();
        break;
      case 'attn-ajouter':
        ajouterAttention();
        break;
      case 'attn-supprimer':
        supprimerAttention(btn.getAttribute('data-id'));
        break;
      case 'attn-photo':
        basculerPhotoAttention(btn.getAttribute('data-id'), btn.getAttribute('data-photo'));
        break;
      case 'attn-rediger':
        redigerAttention(btn.getAttribute('data-id'));
        break;
      case 'photo-rapport':
        basculerPhotoRapport(btn.getAttribute('data-id'));
        break;
      case 'rv-confirm':
        rvConfirm();
        break;
      case 'publish':
        doPublish();
        break;
      default:
        break;
    }
  });


  app.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t && t.matches && t.matches('[data-role="saisie"]')) { e.preventDefault(); saisieSuivante(t); }
  });

  // focusout bubbles (unlike blur), so a single delegated listener works for
  // the solde input and the contenteditable table cells.
  app.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="solde-input"]')) { onSoldeBlur(t.value); return; }
    if (t.matches('[data-role="cotisation-input"]')) { onCotisationBlur(t.value); return; }
    if (t.matches('[data-role="visite-input"]')) { onVisiteChange(t.value); return; }
    if (t.matches('[data-role="imm-input"]')) { immEnregistrer(t.getAttribute('data-sec'), t.getAttribute('data-key'), t.value); return; }
    if (t.matches('[data-role="attn"]')) { enregistrerAttentions(); return; }
    if (t.matches('[data-role="saisie"]')) { enregistrerSaisie(t.getAttribute('data-id'), t.getAttribute('data-field'), t.value); return; }
    if (t.matches('[data-role="cost-cell"]')) { patchComponent(t.getAttribute('data-id'), { replacement_cost: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="life-cell"]')) { patchComponent(t.getAttribute('data-id'), { useful_life_years: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="year-cell"]')) { patchComponent(t.getAttribute('data-id'), { install_year: parseYear(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="comp-text"]') || t.matches('[data-role="comp-textarea"]')) { onCompTextBlur(t.getAttribute('data-id'), t.getAttribute('data-field'), t.value); return; }
    if (t.matches('[data-role="attr-value"]')) { onAttrValueBlur(t.getAttribute('data-id'), t.getAttribute('data-key'), t.value); return; }
  }, true);
}

initEvents();
boot();
