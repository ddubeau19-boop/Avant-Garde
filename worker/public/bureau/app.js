// ============================================================
// Console Bureau — Condo Stratégis
// Vanilla-JS SPA, no build step. Talks to the real `vigies` API.
// ============================================================

const TOKEN_KEY = 'cs_bureau_token';

/* ---------- Taxonomie maison : les 10 catégories de la feuille « Relevé » ---------- */

const CAT_ORDER = ['terrain', 'structure', 'enveloppe', 'ouvertures', 'balcons', 'interieur', 'equipements', 'cvac', 'electrique', 'plomberie'];
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
const IMM_CARACS = [
  { k: 'annee_construction',      q: 'Année de construction' },
  { k: 'date_conversion',         q: 'Date de conversion (immeuble converti en copropriété)' },
  { k: 'nb_stationnements_int',   q: "Espaces de stationnement intérieurs" },
  { k: 'gicleurs',                q: "Présence d'un système de gicleurs" },
  { k: 'gicleurs_ou',             q: 'Où ? (stationnement, RDC, étages)' },
  { k: 'unites_gicleurs',         q: 'Unités protégées par un système de gicleurs' },
  { k: 'nb_ascenseurs',           q: "Systèmes d'ascenseur" },
  { k: 'generatrice',             q: 'Génératrice' },
  { k: 'generatrice_carburant',   q: 'Carburant de la génératrice', vals: { mazout: 'Mazout', gaz_naturel: 'Gaz naturel' } },
  { k: 'piscine_interieure',      q: 'Piscine intérieure' },
  { k: 'piscine_exterieure',      q: 'Piscine extérieure' },
  { k: 'nb_terrasses_toiture',    q: 'Terrasses au niveau toiture' },
  { k: 'fenetres_privatives',     q: 'Fenêtres considérées privatives' },
  { k: 'portes_privatives',       q: 'Portes considérées privatives' },
  { k: 'portes_patio_privatives', q: 'Portes-patio considérées privatives' },
  { k: 'balcons_privatifs',       q: 'Balcons considérés privatifs' },
  { k: 'elements_pcur',           q: 'Éléments considérés PCUR' },
  { k: 'cles_repartition_pcur',   q: 'Clés de répartition PCUR disponibles' },
  { k: 'acces_toiture',           q: 'Accès sécuritaire à la toiture' },
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
  banqueDirty: false,      // un texte vient d'être versé à la banque
  textesRetenus: {},       // id de composante -> texte enregistré pendant cette session

  publishing: false,
  publishError: null,

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
  justesse: null,            // écart entre le prévu d'une étude et le facturé
  justesseDetail: false,

  compAddOpen: false,        // formulaire d'ajout d'une composante
  compAdd: { name: '', cat: 'enveloppe', qty: '', useful_life_years: '', install_year: '' },
  compAddSaving: false,
  compAddError: null,
  compBusyId: null,          // composante en cours de suppression

  newDossierOpen: false,
  newDossier: { dossier_no: '', name: '', address: '', city: '', units: '', floors: '', built_year: '', crm_syndicat_id: '' },
  newDossierSaving: false,
  newDossierError: null,

  // Portefeuille — le calendrier des révisions
  syndicats: [],             // liste du CRM, pour rattacher un dossier
  syndicatsCharges: false,
  syndicatsIndisponibles: null,  // raison, quand le CRM n'est pas ouvert à la firme
  portefeuille: null,
  portefeuilleLoading: false,
  portefeuilleError: null,
  portefeuilleFiltre: 'action',
  etudeFormPour: null,       // syndicat_id dont le formulaire d'étude est ouvert
  etudeForm: { date_etude: '', auteur: '', note: '' },
  etudeSaving: false,
  etudeError: null,

  // Réconciliation avec l'étude précédente du même immeuble
  reconciliation: null,
  reconciliationOuverte: false,
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
  const headers = authHeaders(Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}));
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
// Une composante confirmée dont le texte n'a pas été retenu sera réécrite par
// le modèle à chaque génération : le rapport ne serait pas reproductible, et la
// personne qui signe la §8.0 n'aurait relu aucune des versions. Tant qu'il en
// reste, le rapport ne se télécharge pas.
function sansTexteRetenu() {
  return state.components.filter(c => c.confirmed === 1 && !(c.texte_retenu === 1 || state.textesRetenus[c.id]));
}
function pretPourRapport() { return allConfirmed() && sansTexteRetenu().length === 0; }

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
  revokeReviewPhotos();
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  state.token = null;
  state.user = null;
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
    const data = await apiJson('/api/dossiers');
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
// Dossiers et composantes
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// Portefeuille — le calendrier des révisions
// ---------------------------------------------------------------
// La liste des syndicats vient du CRM, qui n'est lisible que par la firme
// nommée dans la configuration du worker. Une autre firme locataire reçoit un
// 403 : on le retient une fois pour toutes plutôt que de le redemander, et on
// cache le sélecteur au lieu d'afficher une erreur devant un formulaire qui
// marche très bien sans lui.
async function loadSyndicats() {
  if (state.syndicatsCharges || state.syndicatsIndisponibles) return;
  try {
    state.syndicats = await apiJson('/api/portefeuille/syndicats');
    state.syndicatsCharges = true;
  } catch (e) {
    state.syndicatsIndisponibles = e.message || 'Liste des syndicats indisponible.';
  }
  render();
}

async function loadPortefeuille() {
  state.portefeuilleLoading = true;
  state.portefeuilleError = null;
  render();
  try {
    state.portefeuille = await apiJson('/api/portefeuille');
  } catch (e) {
    state.portefeuilleError = e.message || 'Impossible de charger le portefeuille.';
  }
  state.portefeuilleLoading = false;
  render();
}

async function enregistrerEtudeConnue(syndicatId) {
  if (state.etudeSaving) return;
  const f = state.etudeForm;
  const ligne = (state.portefeuille && state.portefeuille.lignes || []).find(l => l.syndicat_id === syndicatId);
  state.etudeSaving = true;
  state.etudeError = null;
  render();
  try {
    await apiJson('/api/portefeuille/etudes', {
      method: 'POST',
      body: JSON.stringify({
        crm_syndicat_id: syndicatId,
        syndicat_nom: ligne ? ligne.nom : null,
        date_etude: f.date_etude.trim(),
        auteur: f.auteur.trim() || null,
        note: f.note.trim() || null,
      }),
    });
    state.etudeSaving = false;
    state.etudeFormPour = null;
    state.etudeForm = { date_etude: '', auteur: '', note: '' };
    await loadPortefeuille();
  } catch (e) {
    state.etudeSaving = false;
    state.etudeError = e.message || "Impossible d'enregistrer l'étude.";
    render();
  }
}

async function oublierEtudeConnue(etudeId) {
  try {
    await apiJson(`/api/portefeuille/etudes/${etudeId}`, { method: 'DELETE' });
    await loadPortefeuille();
  } catch (e) {
    state.portefeuilleError = e.message || "Impossible de retirer l'étude.";
    render();
  }
}

// Depuis le calendrier, ouvrir la création de dossier déjà remplie : c'est le
// seul geste qui fait du portefeuille autre chose qu'une liste à regarder.
async function dossierPourSyndicat(syndicatId) {
  const ligne = (state.portefeuille && state.portefeuille.lignes || []).find(l => l.syndicat_id === syndicatId);
  if (!ligne) return;
  // La liste des syndicats doit être là avant d'ouvrir le formulaire, sinon le
  // champ s'affiche une fraction de seconde sans sa liste et paraît cassé.
  await loadSyndicats();
  state.newDossier = {
    dossier_no: '',
    name: ligne.nom || '',
    address: ligne.adresse || '',
    city: ligne.ville || '',
    units: ligne.unites == null ? '' : String(ligne.unites),
    floors: '',
    built_year: '',
    crm_syndicat_id: ligne.syndicat_id,
  };
  state.newDossierOpen = true;
  state.newDossierError = null;
  state.screen = 'dossiers';
  render();
  loadDossiers();
}

async function creerDossier() {
  if (state.newDossierSaving) return;
  const f = state.newDossier;
  if (!f.dossier_no.trim() || !f.name.trim()) {
    state.newDossierError = 'Le numéro de dossier et le nom du syndicat sont requis.';
    render();
    return;
  }
  state.newDossierSaving = true;
  state.newDossierError = null;
  render();
  try {
    const cree = await apiJson('/api/dossiers', {
      method: 'POST',
      body: JSON.stringify({
        dossier_no: f.dossier_no.trim(),
        name: f.name.trim(),
        address: f.address.trim() || null,
        city: f.city.trim() || null,
        units: parseNum(f.units) ?? 0,
        floors: parseNum(f.floors),
        built_year: parseYear(f.built_year),
        crm_syndicat_id: f.crm_syndicat_id || null,
        crm_syndicat_nom: f.crm_syndicat_id ? f.name.trim() : null,
      }),
    });
    state.newDossierSaving = false;
    state.newDossierOpen = false;
    state.newDossier = { dossier_no: '', name: '', address: '', city: '', units: '', floors: '', built_year: '', crm_syndicat_id: '' };
    await loadDossiers();
    if (cree && cree.id) openDossier(cree.id);
  } catch (e) {
    state.newDossierSaving = false;
    state.newDossierError = e.message || 'Impossible de créer le dossier.';
    render();
  }
}

async function ajouterComposante() {
  if (state.compAddSaving) return;
  const f = state.compAdd;
  if (!f.name.trim()) {
    state.compAddError = 'Le nom de la composante est requis.';
    render();
    return;
  }
  state.compAddSaving = true;
  state.compAddError = null;
  render();
  try {
    await apiJson(`/api/dossiers/${state.dossierId}/components`, {
      method: 'POST',
      body: JSON.stringify({
        name: f.name.trim(),
        cat: f.cat,
        qty: f.qty.trim() || null,
        useful_life_years: parseNum(f.useful_life_years),
        install_year: parseYear(f.install_year),
      }),
    });
    state.compAddSaving = false;
    state.compAddOpen = false;
    state.compAdd = { name: '', cat: 'enveloppe', qty: '', useful_life_years: '', install_year: '' };
    await loadDossierDetail(state.dossierId);
  } catch (e) {
    state.compAddSaving = false;
    state.compAddError = e.message || "Impossible d'ajouter la composante.";
    render();
  }
}

async function supprimerComposante(id) {
  const comp = componentById(id);
  const quoi = comp ? `« ${comp.name} »` : 'cette composante';
  if (!window.confirm(`Retirer ${quoi} de l'étude ? Ses photos et son texte seront supprimés avec elle. Cette action est définitive.`)) return;
  if (state.compBusyId) return;
  state.compBusyId = id;
  render();
  try {
    await apiJson(`/api/components/${id}`, { method: 'DELETE' });
    state.compBusyId = null;
    delete state.expanded[id];
    await loadDossierDetail(state.dossierId);
  } catch (e) {
    state.compBusyId = null;
    state.revisionFlashError = e.message || 'Impossible de retirer la composante.';
    render();
  }
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
  loadJustesse();
}

// La mesure de justesse dépend du CRM et des études publiées : elle peut être
// vide longtemps, et ce n'est pas une panne. Elle se charge à côté du reste.
async function loadJustesse() {
  try {
    state.justesse = await apiJson('/api/prix/justesse');
  } catch (e) {
    state.justesse = { disponible: false, motif: e.message || 'mesure indisponible' };
  }
  render();
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

async function openDossier(id) {
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
  state.reconciliation = null;
  state.reconciliationOuverte = false;
  await loadDossierDetail(id);
  loadReconciliation(id);
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
    state.components = Array.isArray(components) ? components : [];
    state.projection = projection;
    state.batiment = parseJsonObject(dossier && dossier.batiment_info);
    state.revisionLoading = false;
    render();
  } catch (e) {
    state.revisionLoading = false;
    state.revisionError = e.message || 'Impossible de charger ce dossier.';
    render();
  }
}

// La réconciliation est secondaire : elle ne doit jamais retarder l'écran ni
// le faire échouer. Elle se charge à côté et s'affiche quand elle arrive.
async function loadReconciliation(id) {
  state.reconciliation = null;
  try {
    state.reconciliation = await apiJson(`/api/dossiers/${id}/reconciliation`);
  } catch (e) {
    state.reconciliation = { disponible: false, motif: e.message || 'comparaison indisponible' };
  }
  if (state.dossierId === id) render();
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
  if (cur === value) return;
  patchComponent(id, { rating: value });
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

function revokeReviewPhotos() {
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
    const photos = Array.isArray(full.photos) ? full.photos : [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const res = await apiRaw(`/api/photos/${photos[i].id}/file`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          state.reviewObjectUrls.push(url);
          loaded.push({ id: photos[i].id, tag: photos[i].tag || tags[i] || ('Photo ' + (i + 1)), url });
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

// Seul l'ÉTAT DE L'ACTIF est enregistré : c'est la seule sous-section rédigée
// par le modèle. Les trois autres sont déduites des données.
//
// Aucun seuil de longueur ici. Il y en avait un — 40 caractères — et un texte
// plus court était silencieusement jeté : la composante passait quand même à
// « confirmée », sans texte retenu, et le rapport la faisait réécrire par le
// modèle à chaque téléchargement. Deux téléchargements donnaient deux §4.0
// différents, dont aucun n'avait été relu par la personne qui signe la §8.0.
// Le seuil garde un sens pour choisir quels textes servent d'exemple aux
// études suivantes ; il est appliqué là, côté serveur, pas ici.
function collectEtatText() {
  const el = document.querySelector('.rvia-card [data-sec-cle="etat"]');
  const txt = el ? el.textContent.trim() : '';
  return txt || null;
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
      // L'échec n'est plus avalé. Ce texte n'est pas un confort : c'est lui
      // qui paraîtra au §4.0 du rapport signé. S'il n'a pas été enregistré,
      // l'ingénieur doit le savoir maintenant, pas le découvrir dans un
      // document que le modèle aura réécrit entre-temps.
      await apiJson(`/api/components/${comp.id}/redaction`, {
        method: 'PATCH', body: JSON.stringify({ texte_retenu: etat, valide: true }),
      });
      state.banqueDirty = true;
      state.textesRetenus[comp.id] = true;
    }
    state.components = state.components.map(c => String(c.id) === String(comp.id) ? Object.assign({}, c, body) : c);
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
    state.revisionFlashError = e.message || "Échec de l'enregistrement.";
  }
  rvGoTo(state.reviewIdx + 1);
}

async function doPublish() {
  if (state.publishing) return;
  state.publishing = true;
  state.publishError = null;
  render();
  try {
    const iso = new Date().toISOString();
    await apiJson(`/api/dossiers/${state.dossierId}`, { method: 'PATCH', body: JSON.stringify({ published_at: iso }) });
    state.dossier = Object.assign({}, state.dossier, { published_at: iso });
    state.publishing = false;
    render();
  } catch (e) {
    state.publishing = false;
    state.publishError = e.message || 'Erreur lors de la publication.';
    render();
  }
}

async function downloadReport(kind) {
  const ext = kind === 'docx' ? 'docx' : 'xlsx';
  try {
    const res = await apiRaw(`/api/dossiers/${state.dossierId}/report.${ext}`);
    if (!res.ok) throw new Error('Téléchargement impossible.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const dossierNo = (state.dossier && state.dossier.dossier_no) || 'dossier';
    const suffix = kind === 'docx' ? 'etude-fonds' : 'durees-vie';
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

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
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
  app.innerHTML = html;
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
        <div class="field-box"><i data-lucide="mail"></i><input id="login-email" data-role="login-email" name="email" type="email" autocomplete="username" placeholder="prenom.nom@condostrategis.ca" value="${escapeHtml(state.loginEmail || '')}" required></div>
        <label class="field-label" for="login-password">Mot de passe</label>
        <div class="field-box"><i data-lucide="lock"></i><input id="login-password" data-role="login-password" name="password" type="password" autocomplete="current-password" placeholder="Mot de passe" value="${escapeHtml(state.loginPassword || '')}" required></div>
        <button type="submit" class="btn-primary" style="width:100%" ${state.loginLoading ? 'disabled' : ''}>${state.loginLoading ? 'Connexion…' : 'Se connecter'}<i data-lucide="${state.loginLoading ? 'loader-2' : 'arrow-right'}" class="${state.loginLoading ? 'spin' : ''}"></i></button>
        <div class="login-forgot">Mot de passe oublié ? Demandez à votre administrateur de le réinitialiser — l'application n'envoie aucun courriel.</div>
      </form>
    </div>
  </div>`;
}

function railHtml() {
  const dossiersActive = ['dossiers', 'revision', 'publier', 'reviewIA'].includes(state.screen);
  const items = [
    { key: 'dossiers', label: 'Dossiers', icon: 'folder', action: 'go-dossiers', active: dossiersActive },
    { key: 'prix', label: 'Banque de prix', icon: 'receipt', action: 'go-prix', active: state.screen === 'prix' },
    { key: 'portefeuille', label: 'Portefeuille', icon: 'users', action: 'go-portefeuille', active: state.screen === 'portefeuille' },
    { key: 'carnet', label: "Carnet d'entretien", icon: 'calendar-clock', disabled: true },
    { key: 'modeles', label: 'Modèles', icon: 'file-stack', disabled: true },
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
        <button class="btn-logout" data-action="logout" title="Déconnexion"><i data-lucide="log-out"></i></button>
      </div>
    </div>
  </div>`;
}

function renderShell() {
  let main = '';
  if (state.screen === 'dossiers') main = renderDossiers();
  else if (state.screen === 'portefeuille') main = renderPortefeuille();
  else if (state.screen === 'prix') main = renderPrix();
  else if (state.screen === 'revision') main = renderRevision();
  else if (state.screen === 'publier') main = renderPublier();
  else if (state.screen === 'reviewIA') main = renderReviewIA();
  return `<div class="shell">${railHtml()}<div class="main">${main}</div></div>`;
}

function renderDossiers() {
  if (state.dossiersLoading && state.dossiers.length === 0) {
    return `<div class="page-pad">${spinnerBlock('Chargement des dossiers…')}</div>`;
  }
  const rows = state.dossiers.map(enrichDossier);
  const reviewCount = rows.filter(d => d._reviewReady).length;
  const fieldCount = rows.filter(d => d._pct < 100).length;
  const allCount = rows.length;
  const filtered = rows.filter(d => {
    if (state.filter === 'review') return d._reviewReady;
    if (state.filter === 'field') return d._pct < 100;
    return true;
  });
  return `
  <div class="page-pad">
    <div class="eyebrow-orange">Tableau de bord</div>
    <div class="page-title-row">
      <h1 class="page-title">Dossiers</h1>
      <button class="btn-primary" data-action="nouveau-dossier"><i data-lucide="${state.newDossierOpen ? 'x' : 'plus'}"></i>${state.newDossierOpen ? 'Annuler' : 'Nouveau dossier'}</button>
    </div>
    <p class="page-lead">Révisez les données du terrain, ajustez le fonds de prévoyance et générez les rapports.</p>
    ${state.dossiersError ? errorBanner(state.dossiersError, 'retry-dossiers') : ''}
    ${state.newDossierOpen ? nouveauDossierFormHtml() : ''}
    <div class="filters-row">
      <button class="chip ${state.filter === 'review' ? 'active' : ''}" data-action="filter" data-filter="review">Prêts pour révision · ${reviewCount}</button>
      <button class="chip ${state.filter === 'field' ? 'active' : ''}" data-action="filter" data-filter="field">En cours sur le terrain · ${fieldCount}</button>
      <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">Tous · ${allCount}</button>
    </div>
    <div class="dossiers-table">
      <div class="dt-row dt-head"><div>Syndicat</div><div>Dossier</div><div>Documentées</div><div>Statut</div><div></div></div>
      ${filtered.length === 0 ? `<div class="empty-state">Aucun dossier dans cette catégorie.</div>` : filtered.map(d => `
      <div class="dt-row">
        <div><div class="dt-name">${escapeHtml(d.name || '—')}</div><div class="dt-sub">${escapeHtml(d.address || '')}${d.address && d.units ? ' · ' : ''}${d.units ? d.units + ' unités' : ''}</div></div>
        <div class="dt-no">${escapeHtml(d.dossier_no || '—')}</div>
        <div class="dt-doc">
          <div class="prog-track"><div class="prog-fill" style="background:${d._barColor};width:${d._pct}%"></div></div>
          <span class="dt-doc-label">${d.stats ? d.stats.done + '/' + d.stats.total : '—'}</span>
        </div>
        <div><span class="status-badge" style="background:${d._statusBg};color:${d._statusColor}">${d._statusLabel}</span></div>
        <div><button class="btn-row-action ${d._reviewReady ? 'primary' : ''}" data-action="open-dossier" data-id="${d.id}">${d._reviewReady ? 'Réviser' : 'Ouvrir'}</button></div>
      </div>`).join('')}
    </div>
  </div>`;
}

// ---------------------------------------------------------------
// Portefeuille — rendu
// ---------------------------------------------------------------
// Une couleur par statut, la même partout : le rouge veut dire que l'échéance
// est passée, le gris que personne ne sait quand la dernière étude a été faite.
const PF_COULEURS = {
  en_retard: { bg: 'var(--red-wash)', fg: 'var(--red)' },
  inconnue: { bg: 'var(--ink-100)', fg: 'var(--ink-600)' },
  a_prevoir: { bg: 'var(--orange-wash)', fg: 'var(--accent-press)' },
  en_cours: { bg: 'var(--orange-wash)', fg: 'var(--accent-press)' },
  a_jour: { bg: 'var(--green-wash)', fg: 'var(--green)' },
};

function delaiTexte(jours) {
  if (jours == null) return '—';
  if (jours < 0) {
    const n = Math.abs(jours);
    return n >= 365 ? `en retard de ${Math.floor(n / 365)} an${Math.floor(n / 365) > 1 ? 's' : ''}` : `en retard de ${n} jour${n > 1 ? 's' : ''}`;
  }
  if (jours < 60) return `dans ${jours} jour${jours > 1 ? 's' : ''}`;
  if (jours < 730) return `dans ${Math.round(jours / 30)} mois`;
  return `dans ${Math.floor(jours / 365)} ans`;
}

function etudeFormHtml(ligne) {
  return `
  <form class="prix-form" id="etude-form" novalidate style="grid-column:1/-1;margin:12px 0 4px">
    ${state.etudeError ? `<div class="login-error" style="grid-column:1/-1">${escapeHtml(state.etudeError)}</div>` : ''}
    ${champSimple('etudeForm', 'date_etude', "Date de l'étude", { placeholder: 'AAAA-MM-JJ' })}
    ${champSimple('etudeForm', 'auteur', 'Signée par', { placeholder: 'ex. Groupe Leblanc ingénieurs' })}
    ${champSimple('etudeForm', 'note', 'Note', { placeholder: 'ex. mentionnée au PV du 12 mai', large: true })}
    <div class="prix-form-foot">
      <span class="prix-hint">Une étude que la firme connaît sans l'avoir produite ici. Sans elle, l'échéance de ${escapeHtml(ligne.nom || '')} reste inconnue.</span>
      <button type="submit" class="btn-primary" data-syndicat="${escapeHtml(ligne.syndicat_id)}" ${state.etudeSaving ? 'disabled' : ''}>${state.etudeSaving ? 'Enregistrement…' : 'Consigner'}<i data-lucide="${state.etudeSaving ? 'loader-2' : 'check'}" class="${state.etudeSaving ? 'spin' : ''}"></i></button>
    </div>
  </form>`;
}

function renderPortefeuille() {
  if (state.portefeuilleLoading && !state.portefeuille) {
    return `<div class="page-pad">${spinnerBlock('Chargement du portefeuille…')}</div>`;
  }
  const p = state.portefeuille;
  const entete = `
    <div class="eyebrow-orange">Portefeuille</div>
    <h1 class="page-title">Calendrier des études</h1>
    <p class="page-lead">Chaque copropriété gérée doit tenir une étude du fonds de prévoyance à jour, révisée tous les ${p ? p.revision_ans : 5} ans. Cet écran croise les études publiées ici, celles que le CRM connaît et celles consignées à la main.</p>`;

  if (state.portefeuilleError) {
    return `<div class="page-pad">${entete}${errorBanner(state.portefeuilleError, 'retry-portefeuille')}</div>`;
  }
  if (!p) return `<div class="page-pad">${entete}<div class="empty-state">Aucune donnée.</div></div>`;

  const r = p.resume;
  const filtres = [
    { k: 'action', label: `À traiter · ${r.en_retard + r.inconnue + r.a_prevoir}` },
    { k: 'en_retard', label: `En retard · ${r.en_retard}` },
    { k: 'inconnue', label: `Aucune étude · ${r.inconnue}` },
    { k: 'en_cours', label: `En cours · ${r.en_cours}` },
    { k: 'tous', label: `Tous · ${p.total}` },
  ];
  const lignes = p.lignes.filter(l => {
    if (state.portefeuilleFiltre === 'tous') return true;
    if (state.portefeuilleFiltre === 'action') return ['en_retard', 'inconnue', 'a_prevoir'].includes(l.statut);
    return l.statut === state.portefeuilleFiltre;
  });

  return `
  <div class="page-pad">
    ${entete}
    <div class="pf-stats">
      <div class="prix-stat"><div class="prix-stat-k">En retard</div><div class="prix-stat-v">${r.en_retard}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">Aucune étude</div><div class="prix-stat-v">${r.inconnue}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">À prévoir</div><div class="prix-stat-v">${r.a_prevoir}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">En cours</div><div class="prix-stat-v">${r.en_cours}</div></div>
      <div class="prix-stat"><div class="prix-stat-k">À jour</div><div class="prix-stat-v">${r.a_jour}</div></div>
    </div>
    <div class="metho-source" style="margin:-8px 0 20px">${p.total} copropriété${p.total > 1 ? 's' : ''} active${p.total > 1 ? 's' : ''} au ${escapeHtml(p.aujourdhui)}. « Aucune étude » ne veut pas dire qu'il n'en existe pas : seulement que l'application n'en connaît aucune. Consignez celles que vous connaissez pour que l'échéance cesse d'être fausse.</div>
    <div class="filters-row">
      ${filtres.map(f => `<button class="chip ${state.portefeuilleFiltre === f.k ? 'active' : ''}" data-action="pf-filtre" data-filtre="${f.k}">${f.label}</button>`).join('')}
    </div>
    <div class="dossiers-table">
      <div class="pf-row pf-head"><div>Copropriété</div><div>Portes</div><div>Dernière étude</div><div>Échéance</div><div>Statut</div><div></div></div>
      ${lignes.length === 0 ? `<div class="empty-state">Aucune copropriété dans cette catégorie.</div>` : lignes.map(l => {
        const col = PF_COULEURS[l.statut] || PF_COULEURS.inconnue;
        const source = l.derniere_source === 'interne' ? `dossier ${escapeHtml(l.dossier_no || '')}` : (l.derniere_source === 'crm' ? 'du CRM' : (l.derniere_auteur ? escapeHtml(l.derniere_auteur) : 'consignée'));
        return `
      <div class="pf-row">
        <div><div class="dt-name">${escapeHtml(l.nom || '—')}</div><div class="dt-sub">${escapeHtml(l.adresse || '')}${l.adresse && l.ville ? ' · ' : ''}${escapeHtml(l.ville || '')}</div></div>
        <div class="dt-no">${l.unites == null ? '—' : l.unites}</div>
        <div>${l.derniere_etude ? `<div class="dt-no">${escapeHtml(l.derniere_etude)}</div><div class="dt-sub">${source}</div>` : '<span class="dt-sub">inconnue</span>'}</div>
        <div>${l.echeance ? `<div class="dt-no">${escapeHtml(l.echeance)}</div><div class="dt-sub">${escapeHtml(delaiTexte(l.jours_restants))}</div>` : '<span class="dt-sub">—</span>'}</div>
        <div><span class="status-badge" style="background:${col.bg};color:${col.fg}">${escapeHtml(l.statut_label)}</span>${l.en_cours.length ? `<div class="dt-sub">${escapeHtml(l.en_cours[0].dossier_no || '')}</div>` : ''}</div>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          ${l.en_cours.length
            ? `<button class="btn-row-action primary" data-action="open-dossier" data-id="${escapeHtml(l.en_cours[0].dossier_id)}">Ouvrir</button>`
            : `<button class="btn-row-action ${['en_retard', 'inconnue'].includes(l.statut) ? 'primary' : ''}" data-action="pf-nouveau" data-id="${escapeHtml(l.syndicat_id)}">Créer l'étude</button>`}
          <button class="btn-row-action" data-action="pf-consigner" data-id="${escapeHtml(l.syndicat_id)}" title="Consigner une étude antérieure">${state.etudeFormPour === l.syndicat_id ? 'Annuler' : 'Consigner'}</button>
        </div>
      </div>
      ${state.etudeFormPour === l.syndicat_id ? `<div style="padding:0 22px 14px">${etudeFormHtml(l)}</div>` : ''}`;
      }).join('')}
    </div>
  </div>`;
}

// ---------------------------------------------------------------
// Banque de prix — rendu
// ---------------------------------------------------------------
// Ce que l'étude annonçait contre ce que la facture a dit. C'est la seule
// note que reçoit jamais une étude de fonds de prévoyance, et elle n'est
// possible que parce que la même maison tient les deux bouts.
function justesseHtml() {
  const j = state.justesse;
  if (!j) return '';
  if (!j.disponible) {
    return `<div class="recon-card muted" style="margin-top:28px"><i data-lucide="target"></i><span>Mesure de justesse indisponible — ${escapeHtml(j.motif || '')}.</span></div>`;
  }
  if (j.total_mesures === 0) {
    return `<div class="recon-card muted" style="margin-top:28px"><i data-lucide="target"></i><span>Aucun remplacement prévu par une étude publiée ici n'a encore été facturé. ${escapeHtml(j.motif || `${j.etudes} étude(s) rattachée(s) au portefeuille, aucune facture correspondante pour l'instant.`)}</span></div>`;
  }
  const lignes = state.justesseDetail ? j.mesures : j.mesures.slice(0, 5);
  const signe = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)} %`;
  return `
  <div class="recon-card" style="margin-top:28px">
    <div class="recon-head">
      <div>
        <div class="recon-title"><i data-lucide="target"></i>Justesse de nos estimations</div>
        <div class="recon-sub">Pour chaque travail facturé au CRM, ce que la dernière étude publiée avant ce travail prévoyait — indexé jusqu'à l'année de la facture. Un écart positif veut dire que nous avions sous-estimé.</div>
      </div>
      ${j.mesures.length > 5 ? `<button class="btn-secondary" data-action="justesse-detail" style="padding:7px 14px;font-size:12px">${state.justesseDetail ? 'Réduire' : `Tout voir · ${j.mesures.length}`}</button>` : ''}
    </div>
    <div class="recon-stats">
      <div class="recon-stat"><b>${j.total_mesures}</b><span>remplacement${j.total_mesures > 1 ? 's' : ''} mesuré${j.total_mesures > 1 ? 's' : ''}</span></div>
      <div class="recon-stat"><b>${signe(j.ecart_median_pct)}</b><span>écart médian</span></div>
      <div class="recon-stat"><b>${j.ecart_absolu_median_pct == null ? '—' : (j.ecart_absolu_median_pct * 100).toFixed(1) + ' %'}</b><span>écart médian en valeur absolue</span></div>
      <div class="recon-stat"><b>${j.sous_estimes}</b><span>sous-estimé${j.sous_estimes > 1 ? 's' : ''}</span></div>
    </div>
    ${j.par_code.some(p => !p.indicatif) ? `
    <div class="comp-section-head" style="margin:8px 0 10px"><span class="lbl">Par composante</span><span class="rule"></span></div>
    <div class="recon-table" style="margin-bottom:16px">
      <div class="recon-row recon-thead" style="grid-template-columns:1.6fr .6fr 1fr 1.4fr"><div>Code</div><div>n</div><div>Écart médian</div><div>Sens</div></div>
      ${j.par_code.map(p => `
      <div class="recon-row" style="grid-template-columns:1.6fr .6fr 1fr 1.4fr">
        <div><div class="dt-name">${escapeHtml(p.uniformat_code)}</div><div class="dt-sub">${escapeHtml(p.nom || '')}</div></div>
        <div class="dt-no">${p.n}</div>
        <div><div class="dt-no">${signe(p.ecart_median_pct)}</div>${p.indicatif ? `<div class="dt-sub">indicatif</div>` : ''}</div>
        <div class="dt-sub">${p.sous_estimes} sous-estimé${p.sous_estimes > 1 ? 's' : ''} · ${p.sur_estimes} sur-estimé${p.sur_estimes > 1 ? 's' : ''}</div>
      </div>`).join('')}
    </div>` : ''}
    <div class="recon-table">
      <div class="recon-row recon-thead" style="grid-template-columns:1.8fr 1.4fr 1fr 1fr .9fr"><div>Immeuble</div><div>Composante</div><div>Prévu</div><div>Facturé</div><div>Écart</div></div>
      ${lignes.map(m => `
      <div class="recon-row" style="grid-template-columns:1.8fr 1.4fr 1fr 1fr .9fr">
        <div><div class="dt-name">${escapeHtml(m.immeuble || '—')}</div><div class="dt-sub">étude de ${m.annee_etude} · ${escapeHtml(m.dossier_no || '')}</div></div>
        <div><div class="dt-no">${escapeHtml(m.uniformat_code)}</div><div class="dt-sub">${escapeHtml(m.nom || '')}</div></div>
        <div><div class="dt-no">${fmt(m.prevu_indexe)} $</div><div class="dt-sub">en ${m.annee_facture}</div></div>
        <div><div class="dt-no">${fmt(m.facture)} $</div><div class="dt-sub">${m.pieces} pièce${m.pieces > 1 ? 's' : ''}</div></div>
        <div class="dt-no" style="color:${Math.abs(m.ecart_pct) > 0.15 ? 'var(--red)' : 'var(--ink-600)'}">${signe(m.ecart_pct)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

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

    ${justesseHtml()}

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
    ${crm ? `<span class="hint">${crm.candidats} candidat(s)${crm.pieces_deja_importees ? ` · ${crm.pieces_deja_importees} déjà importée(s)` : ''}${crm.copies_ecartees ? ` · ${crm.copies_ecartees} copie(s) de courriel écartée(s)` : ''}${crm.pieces_sans_date ? ` · ${crm.pieces_sans_date} sans date, non importable(s)` : ''}</span>` : ''}
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

function champSimple(groupe, cle, label, opts) {
  opts = opts || {};
  const val = state[groupe][cle] == null ? '' : String(state[groupe][cle]);
  const id = `${groupe}-${cle}`;
  const champ = opts.options
    ? `<select class="detail-input" id="${id}" data-role="champ-simple" data-groupe="${groupe}" data-cle="${cle}">
         ${opts.options.map(o => `<option value="${escapeHtml(o.v)}" ${o.v === val ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
       </select>`
    : `<input class="detail-input" type="text" id="${id}" data-role="champ-simple" data-groupe="${groupe}" data-cle="${cle}"
         value="${escapeHtml(val)}" placeholder="${escapeHtml(opts.placeholder || '')}">`;
  return `<div class="prix-field ${opts.large ? 'large' : ''}">
    <label class="field-label" for="${id}">${escapeHtml(label)}</label>${champ}
  </div>`;
}

// La liste de départ vient du modèle ; ce formulaire est ce qui permet de la
// corriger quand elle passe à côté d'une composante réelle.
function compAddFormHtml() {
  return `
  <form class="prix-form" id="comp-add-form" novalidate style="margin-bottom:16px">
    ${state.compAddError ? `<div class="login-error" style="grid-column:1/-1">${escapeHtml(state.compAddError)}</div>` : ''}
    ${champSimple('compAdd', 'name', 'Composante', { large: true, placeholder: 'ex. Ascenseur hydraulique — cabine et machinerie' })}
    ${champSimple('compAdd', 'cat', 'Catégorie', { options: CAT_ORDER.map(k => ({ v: k, label: CATS[k].label })) })}
    ${champSimple('compAdd', 'qty', 'Quantité', { placeholder: 'ex. 1, 4 200 pi²' })}
    ${champSimple('compAdd', 'useful_life_years', 'Vie utile (ans)', { placeholder: 'ex. 25' })}
    ${champSimple('compAdd', 'install_year', 'Année constr./rép.', { placeholder: 'ex. 1998' })}
    <div class="prix-form-foot">
      <span class="prix-hint">Sans année de construction ni vie résiduelle, la composante sera exclue de la projection plutôt que planifiée au hasard.</span>
      <button type="submit" class="btn-primary" ${state.compAddSaving ? 'disabled' : ''}>${state.compAddSaving ? 'Ajout…' : 'Ajouter'}<i data-lucide="${state.compAddSaving ? 'loader-2' : 'check'}" class="${state.compAddSaving ? 'spin' : ''}"></i></button>
    </div>
  </form>`;
}

// Rattacher l'étude à l'immeuble, et pas seulement à un nom tapé à la main.
// C'est ce rattachement qui permet, cinq ans plus tard, de retrouver l'étude
// précédente du même syndicat et de savoir ce qui a été réalisé entretemps.
//
// C'est le champ « Syndicat » lui-même, pas un champ de plus : une liste
// déroulante à côté d'une zone de texte libre finirait par porter deux noms
// différents pour le même immeuble. Quand le CRM n'est pas lisible par la
// firme, le champ redevient une simple saisie et le formulaire fonctionne.
function champSyndicatHtml() {
  if (state.syndicatsIndisponibles || state.syndicats.length === 0) {
    return champSimple('newDossier', 'name', 'Syndicat', { placeholder: 'ex. Syndicat Les Érables' });
  }
  const rattache = !!state.newDossier.crm_syndicat_id;
  return `<div class="prix-field large">
    <label class="field-label" for="newDossier-name">Syndicat</label>
    <input class="detail-input" type="text" id="newDossier-name" data-role="syndicat-pick" list="syndicats-liste"
      value="${escapeHtml(state.newDossier.name || '')}" placeholder="Tapez le nom de la copropriété" autocomplete="off">
    <datalist id="syndicats-liste">
      ${state.syndicats.map(sy => `<option value="${escapeHtml(sy.nom || '')}" label="${escapeHtml([sy.city, sy.units ? sy.units + ' portes' : ''].filter(Boolean).join(' · '))}"></option>`).join('')}
    </datalist>
    <span class="prix-hint" style="margin-top:6px;display:block">${rattache ? 'Rattaché au portefeuille — adresse, ville et portes viennent du CRM.' : 'Immeuble hors portefeuille : les études de cet immeuble ne se compareront pas entre elles.'}</span>
  </div>`;
}

function nouveauDossierFormHtml() {
  return `
  <form class="prix-form" id="new-dossier-form" novalidate style="margin-bottom:20px">
    ${state.newDossierError ? `<div class="login-error" style="grid-column:1/-1">${escapeHtml(state.newDossierError)}</div>` : ''}
    ${champSimple('newDossier', 'dossier_no', 'Numéro de dossier', { placeholder: 'ex. FP-2026-001' })}
    ${champSyndicatHtml()}
    ${champSimple('newDossier', 'address', 'Adresse', { placeholder: '12 rue de la Tannerie' })}
    ${champSimple('newDossier', 'city', 'Ville', { placeholder: 'Longueuil' })}
    ${champSimple('newDossier', 'units', 'Portes', { placeholder: 'ex. 48' })}
    ${champSimple('newDossier', 'floors', 'Étages', { placeholder: 'ex. 4' })}
    ${champSimple('newDossier', 'built_year', 'Année de construction', { placeholder: 'ex. 1998' })}
    <div class="prix-form-foot">
      <span class="prix-hint">L'inventaire de départ est proposé par le modèle à partir de ces caractéristiques ; il reste modifiable ensuite.</span>
      <button type="submit" class="btn-primary" ${state.newDossierSaving ? 'disabled' : ''}>${state.newDossierSaving ? 'Création…' : 'Créer le dossier'}<i data-lucide="${state.newDossierSaving ? 'loader-2' : 'arrow-right'}" class="${state.newDossierSaving ? 'spin' : ''}"></i></button>
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

function reportsCardHtml(pret, remaining, manquants) {
  if (pret) {
    return `
    <div class="reports-card">
      <div class="reports-eyebrow">Rapports finaux</div>
      <button class="report-item" data-action="download-docx"><div class="report-icon"><i data-lucide="file-text"></i></div><div style="flex:1"><div class="report-name">Étude de fonds</div><div class="report-sub">Word · .docx</div></div><i data-lucide="download"></i></button>
      <button class="report-item" data-action="download-xlsx"><div class="report-icon green"><i data-lucide="table-2"></i></div><div style="flex:1"><div class="report-name">Durées de vie + carnet</div><div class="report-sub">Excel · .xlsx</div></div><i data-lucide="download"></i></button>
      <div class="reports-note ready"><i data-lucide="check-circle-2"></i>Texte confirmé — rapports générés et à jour à chaque édition.</div>
    </div>`;
  }
  return `
  <div class="reports-card">
    <div class="reports-eyebrow">Rapports finaux</div>
    <div class="report-item locked"><div class="report-icon locked"><i data-lucide="file-text"></i></div><div style="flex:1"><div class="report-name muted">Étude de fonds</div><div class="report-sub muted">Word · verrouillé</div></div><i data-lucide="lock"></i></div>
    <div class="report-item locked"><div class="report-icon locked"><i data-lucide="table-2"></i></div><div style="flex:1"><div class="report-name muted">Durées de vie + carnet</div><div class="report-sub muted">Excel · verrouillé</div></div><i data-lucide="lock"></i></div>
    <div class="reports-note locked"><i data-lucide="alert-circle"></i>${manquants > 0
      ? `${manquants} composante(s) confirmée(s) sans texte enregistré : le modèle les réécrirait à chaque génération. Repassez-les en révision.`
      : `Confirmez le texte des ${remaining} composante(s) restante(s) pour générer les rapports.`}</div>
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
  const naOn = c.rating == null;
  const na = `<button class="rt-opt na ${naOn ? 'on' : ''}" data-action="set-rating" data-id="${c.id}" data-rating="na"
      title="${escapeHtml(RATING_NA.label)}" aria-label="${escapeHtml(RATING_NA.label)}"
      style="${naOn ? `background:${RATING_NA.color};border-color:${RATING_NA.color};color:#fff` : ''}">na</button>`;
  return `<div class="rt-ctrl">${opts}${na}</div>`;
}

function ratingPillHtml(c) {
  const r = ratingInfo(c.rating) || RATING_NA;
  return `<span class="rating-pill" style="background:${r.bg};color:${r.color}">${escapeHtml(r.pill)}</span>`;
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
    <div class="comp-detail-col">
      <div class="detail-eyebrow">Observations</div>
      ${obsFieldHtml(c, 'observation', 'Observation', 'Ce qui a été constaté sur place…')}
      ${obsFieldHtml(c, 'cause_possible', 'Cause possible', 'Origine probable du constat…')}
      <div class="obs-field">
        <label for="obs_${c.id}_delai_suggere">Délai suggéré</label>
        <input id="obs_${c.id}_delai_suggere" class="detail-input" data-role="comp-text" data-id="${c.id}" data-field="delai_suggere"
          value="${escapeHtml(c.delai_suggere || '')}" placeholder="ex. à court terme">
      </div>
      ${obsFieldHtml(c, 'consequences', 'Conséquences', "Si rien n'est fait…")}
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
      <div class="comp-danger">
        <button class="btn-danger" data-action="comp-supprimer" data-id="${c.id}" ${state.compBusyId === c.id ? 'disabled' : ''}>
          <i data-lucide="trash-2"></i>${state.compBusyId === c.id ? 'Suppression…' : 'Retirer cette composante'}
        </button>
        <span>Elle n'existe pas dans cet immeuble, ou le modèle l'a inventée.</span>
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
  const obsCount = ['observation', 'cause_possible', 'delai_suggere', 'consequences'].filter(f => c[f]).length;
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

function immRowHtml(label, value, muted) {
  return `<div class="imm-row"><div class="imm-q">${escapeHtml(label)}</div><div class="imm-a ${value == null ? 'none' : ''}">${value == null ? '—' : escapeHtml(value)}</div></div>`;
}

function batimentPanelHtml(d) {
  const count = batimentFilled();
  const head = `
    <button class="imm-head" data-action="toggle-batiment" aria-expanded="${state.batimentOpen ? 'true' : 'false'}">
      <div class="imm-head-icon"><i data-lucide="clipboard-list"></i></div>
      <div style="flex:1">
        <div class="imm-head-title">Fiche d'immeuble</div>
        <div class="imm-head-sub">${count ? count + ' réponse' + (count > 1 ? 's' : '') + ' consignée' + (count > 1 ? 's' : '') + ' au terrain' : 'Aucune réponse consignée au terrain pour l’instant'} · lecture seule</div>
      </div>
      <i data-lucide="${state.batimentOpen ? 'chevron-up' : 'chevron-down'}" style="color:var(--ink-500)"></i>
    </button>`;
  if (!state.batimentOpen) return `<div class="imm-panel">${head}</div>`;

  const docs = IMM_DOCS.map(([k, label]) => {
    const v = immVal('documents', k);
    return immRowHtml(label, v == null ? null : (IMM_DOC_VALS[v] || v));
  }).join('');

  const caracs = IMM_CARACS.map(cfg => {
    const v = immVal('caracteristiques', cfg.k);
    let disp = v;
    if (v != null && cfg.vals && cfg.vals[v]) disp = cfg.vals[v];
    else if (v != null && IMM_OUI_NON[v]) disp = IMM_OUI_NON[v];
    return immRowHtml(cfg.q, disp);
  }).join('');

  const rempl = IMM_REMPLACEMENTS.map(([k, label]) => immRowHtml(label, immVal('remplacements', k))).join('');
  const entr = IMM_ENTRETIENS.map(([k, label]) => immRowHtml(label, immVal('entretiens', k))).join('');

  const solde = d.current_fund_balance != null ? fmt(d.current_fund_balance) + ' $' : null;
  const cotis = d.cotisation_annuelle != null ? fmt(d.cotisation_annuelle) + ' $' : null;

  return `
  <div class="imm-panel open">
    ${head}
    <div class="imm-body">
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
      <div class="imm-section">
        <div class="imm-section-head"><span class="n">5</span>Solde et cotisation annuelle — FP</div>
        ${immRowHtml("Solde au fonds de prévoyance en début d'année", solde)}
        ${immRowHtml('Cotisation annuelle à ce fonds', cotis)}
      </div>
      <div class="imm-foot">Relevé saisi par l'inspecteur sur le terrain. Pour le corriger, passez par l'app d'inspection.</div>
    </div>
  </div>`;
}

// « Pourquoi le chiffre n'est plus celui d'il y a cinq ans ? » — la question
// que pose tout conseil d'administration, et à laquelle il fallait jusqu'ici
// répondre en rouvrant l'ancien rapport.
const RECON_COULEURS = {
  realisee: { bg: 'var(--green-wash)', fg: 'var(--green)' },
  disparue: { bg: 'var(--red-wash)', fg: 'var(--red)' },
  reportee: { bg: 'var(--orange-wash)', fg: 'var(--accent-press)' },
  avancee: { bg: 'var(--orange-wash)', fg: 'var(--accent-press)' },
  nouvelle: { bg: 'var(--ink-100)', fg: 'var(--ink-600)' },
  stable: { bg: 'var(--ink-100)', fg: 'var(--ink-500)' },
};

function pct(v) {
  if (v == null) return '—';
  const signe = v > 0 ? '+' : '';
  return `${signe}${(v * 100).toFixed(1)} %`;
}

function reconciliationCardHtml() {
  const r = state.reconciliation;
  if (!r) return '';
  if (!r.disponible) {
    // On ne cache pas l'absence de comparaison : savoir qu'il n'y a rien à
    // quoi se comparer fait partie de ce que l'ingénieur doit savoir.
    return `<div class="recon-card muted"><i data-lucide="git-compare"></i><span>Aucune comparaison avec une étude précédente — ${escapeHtml(r.motif || '')}.</span></div>`;
  }
  const s = r.resume;
  const aVoir = r.lignes.filter(l => l.etat !== 'stable');
  const lignes = state.reconciliationOuverte ? r.lignes : aVoir;
  return `
  <div class="recon-card">
    <div class="recon-head">
      <div>
        <div class="recon-title"><i data-lucide="git-compare"></i>Écart avec l'étude de ${r.precedente.annee}</div>
        <div class="recon-sub">Dossier ${escapeHtml(r.precedente.dossier_no || '')}, publié le ${escapeHtml(String(r.precedente.publiee_le).slice(0, 10))}. Les montants de ${r.precedente.annee} sont ramenés en dollars de ${r.annee_actuelle} avant comparaison.</div>
      </div>
      <button class="btn-secondary" data-action="recon-toggle" style="padding:7px 14px;font-size:12px">${state.reconciliationOuverte ? 'Masquer les inchangées' : `Tout voir · ${r.lignes.length}`}</button>
    </div>
    <div class="recon-stats">
      <div class="recon-stat"><b>${s.realisees}</b><span>réalisée${s.realisees > 1 ? 's' : ''}</span></div>
      <div class="recon-stat"><b>${s.reportees}</b><span>reportée${s.reportees > 1 ? 's' : ''}</span></div>
      <div class="recon-stat"><b>${s.disparues}</b><span>disparue${s.disparues > 1 ? 's' : ''}</span></div>
      <div class="recon-stat"><b>${s.nouvelles}</b><span>nouvelle${s.nouvelles > 1 ? 's' : ''}</span></div>
      <div class="recon-stat"><b>${s.rencheries}</b><span>renchérie${s.rencheries > 1 ? 's' : ''}</span></div>
    </div>
    ${!r.preuve_crm ? `<div class="recon-note">Les factures du CRM ne sont pas lisibles depuis ce compte : aucune composante ne peut être déclarée réalisée, seulement absente du nouvel inventaire.</div>` : ''}
    ${s.disparues ? `<div class="recon-note">${s.disparues} composante${s.disparues > 1 ? 's' : ''} de l'étude précédente ${s.disparues > 1 ? 'ont' : 'a'} disparu de l'inventaire sans qu'aucune facture ne montre ${s.disparues > 1 ? 'leur' : 'son'} remplacement. Vérifiez qu'il ne s'agit pas d'un oubli du relevé.</div>` : ''}
    <div class="recon-table">
      <div class="recon-row recon-thead"><div>Composante</div><div>Étude ${r.precedente.annee}</div><div>Étude ${r.annee_actuelle}</div><div>Écart</div><div>État</div></div>
      ${lignes.length === 0 ? `<div class="empty-state">Rien n'a bougé depuis l'étude précédente.</div>` : lignes.map(l => {
        const col = RECON_COULEURS[l.etat] || RECON_COULEURS.stable;
        return `
      <div class="recon-row">
        <div><div class="dt-name">${escapeHtml(l.nom)}</div><div class="dt-sub">${escapeHtml(l.uniformat_code || 'sans code')}</div></div>
        <div>${l.precedent ? `<div class="dt-no">${l.precedent.annee_prevue ?? '—'}</div><div class="dt-sub">${l.precedent.cout_indexe != null ? fmt(l.precedent.cout_indexe) + ' $' : '—'}</div>` : '<span class="dt-sub">absente</span>'}</div>
        <div>${l.actuel ? `<div class="dt-no">${l.actuel.annee_prevue ?? '—'}</div><div class="dt-sub">${l.actuel.cout != null ? fmt(l.actuel.cout) + ' $' : 'à compléter'}</div>` : '<span class="dt-sub">absente</span>'}</div>
        <div>${l.justesse
            ? `<div class="dt-no">${pct(l.justesse.ecart_pct)}</div><div class="dt-sub">facturé ${fmt(l.justesse.facture)} $ en ${l.justesse.annee_facture}, prévu ${fmt(l.justesse.prevu_indexe)} $</div>`
            : (l.ecart_pct != null ? `<div class="dt-no">${pct(l.ecart_pct)}</div><div class="dt-sub">${l.ecart_ans ? (l.ecart_ans > 0 ? '+' : '') + l.ecart_ans + ' an' + (Math.abs(l.ecart_ans) > 1 ? 's' : '') : 'même année'}</div>` : '<span class="dt-sub">—</span>')}</div>
        <div><span class="status-badge" style="background:${col.bg};color:${col.fg}">${escapeHtml(l.etat_label)}</span></div>
      </div>`;
      }).join('')}
    </div>
  </div>`;
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
        ${reportsCardHtml(pretPourRapport(), remaining, sansTexteRetenu().length)}
      </div>

      ${scenarioCardsHtml(proj, state.selectedScenarioCode || (proj && proj.recommendedCode) || (proj && proj.scenarios && proj.scenarios[0] && proj.scenarios[0].code))}
      ${executiveSummaryHtml(proj, state.selectedScenarioCode || (proj && proj.recommendedCode) || (proj && proj.scenarios && proj.scenarios[0] && proj.scenarios[0].code))}

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

      ${reconciliationCardHtml()}

      ${batimentPanelHtml(d)}

      <div class="comp-section-head">
        <span class="lbl">Composantes · ${docCount}/${total} documentées</span>
        <div class="rule"></div>
        <span class="hint">Édition directe des cellules</span>
        <button class="btn-secondary" data-action="comp-ajouter-ouvrir" style="padding:7px 14px;font-size:12px"><i data-lucide="plus"></i>Ajouter</button>
      </div>
      ${state.compAddOpen ? compAddFormHtml() : ''}

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

function renderPublier() {
  const d = state.dossier;
  if (!d) return `<div class="rev-shell"><div class="page-pad"><div class="empty-state">Dossier introuvable.</div></div></div>`;
  const allConf = allConfirmed();
  const sansTexte = sansTexteRetenu();
  const pret = pretPourRapport();
  const remaining = state.components.length - confirmedCount();
  const published = !!d.published_at;
  let body;
  if (published) {
    body = `
    <div class="pub-published">
      <div class="pub-icon-circle green"><i data-lucide="party-popper" style="width:30px;height:30px"></i></div>
      <h2>Étude publiée</h2>
      <p>Le dossier ${escapeHtml(d.name || '')} est marqué publié et n'accepte plus de modification. Les rapports Word et Excel restent téléchargeables depuis la révision — c'est vous qui les transmettez au syndicat.</p>
      <div style="display:flex;gap:11px;justify-content:center"><button class="btn-secondary" data-action="go-dossiers">Retour aux dossiers</button></div>
    </div>`;
  } else if (!pret) {
    body = `
    <div class="pub-locked">
      <div class="pub-icon-circle"><i data-lucide="lock" style="width:28px;height:28px"></i></div>
      <h2>Révision à compléter</h2>
      ${!allConf
        ? `<p>Les rapports Word et Excel ne sont pas générés tant que le texte de toutes les composantes n'est pas confirmé. Il reste <b>${remaining}</b> composante(s) à réviser.</p>`
        : `<p><b>${sansTexte.length}</b> composante(s) confirmée(s) n'ont aucun texte enregistré : le modèle les réécrirait à chaque génération, et le rapport signé ne serait pas reproductible. Repassez-les en révision pour que leur texte soit retenu.</p>
           <p style="font-size:12.5px;color:var(--ink-500)">${sansTexte.slice(0, 6).map(c => escapeHtml(c.name)).join(' · ')}${sansTexte.length > 6 ? ` · et ${sansTexte.length - 6} autre(s)` : ''}</p>`}
      <button class="btn-primary" data-action="go-reviewia"><i data-lucide="sparkles"></i>Poursuivre la révision</button>
    </div>`;
  } else {
    // Ne sont listés que les livrables que le produit fabrique réellement. Un
    // « accès plateforme client » figurait ici : aucun espace syndicat n'existe,
    // ni au schéma ni au code.
    const deliverables = [
      { name: 'Étude de fonds de prévoyance', sub: 'Word · à télécharger depuis la révision', icon: 'file-text', bg: 'var(--ink)', color: '#fff' },
      { name: 'Tableur durées de vie et suivi d\'entretien', sub: 'Excel · ' + state.components.length + ' composantes', icon: 'table-2', bg: 'var(--green)', color: '#fff' },
    ];
    body = `
    <div class="pub-ready">
      <div class="pub-ready-top">
        <div class="pub-section-eyebrow">Ce qui sera livré</div>
        ${deliverables.map(dl => `
        <div class="deliverable-row">
          <div class="deliverable-icon" style="background:${dl.bg};color:${dl.color}"><i data-lucide="${dl.icon}"></i></div>
          <div style="flex:1"><div class="deliverable-name">${dl.name}</div><div class="deliverable-sub">${dl.sub}</div></div>
          <i data-lucide="check-circle-2" style="color:var(--green)"></i>
        </div>`).join('')}
        <div class="pub-section-eyebrow" style="margin-top:22px">Destinataire</div>
        <div class="recipient-card">
          <div class="recipient-avatar">${initialsOf(d.name)}</div>
          <div style="flex:1"><div class="recipient-name">Syndicat ${escapeHtml(d.name || '')}</div><div class="recipient-sub">${d.units ? d.units + ' unités · ' : ''}${escapeHtml(d.address || '')}</div></div>
        </div>
      </div>
      ${state.publishError ? `<div style="padding:0 30px 16px">${errorBanner(state.publishError)}</div>` : ''}
      <div class="pub-footer">
        <div class="pub-footer-note">En publiant, les rapports passent en lecture seule et le client reçoit ses accès.</div>
        <button class="btn-primary" data-action="publish" ${state.publishing ? 'disabled' : ''}><i data-lucide="${state.publishing ? 'loader-2' : 'send'}" class="${state.publishing ? 'spin' : ''}"></i>${state.publishing ? 'Publication…' : 'Publier & activer le client'}</button>
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
  const icon = SECTION_ICONS[cle] || 'file-text';
  const inactive = sec && sec.actif === false;
  const collapsed = inactive && !state.attentionOpen;
  const titre = (sec && sec.titre) || '';
  const color = inactive ? 'var(--ink-400)' : (cle === 'attention' ? 'var(--accent-press)' : 'var(--orange)');
  return `
  <div class="rvia-section ${inactive ? 'inactive' : ''} ${collapsed ? 'collapsed' : ''}">
    <div class="rvia-section-head" style="color:${color}">
      <i data-lucide="${icon}"></i><span>${escapeHtml(titre)}</span>
      ${inactive ? `<span class="rvia-inactive-tag">inactive</span>
      <button class="rvia-section-toggle" data-action="toggle-attention">${state.attentionOpen ? 'Masquer' : 'Afficher'}</button>` : ''}
    </div>
    <p class="rvia-section-text" id="secText_${i}" contenteditable="true" data-sec-text data-sec-cle="${escapeHtml(cle)}" data-sec-title="${escapeHtml(titre)}">${escapeHtml((sec && sec.texte) || '')}</p>
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
            <div class="rvia-photos-grid">
              ${photos.map(p => `<div class="rvia-photo"><img src="${p.url}" alt=""><div class="rvia-photo-tag">${escapeHtml(p.tag)}</div></div>`).join('')}
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

  app.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'login-form') {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      doLogin(email, password);
    } else if (e.target && e.target.id === 'prix-form') {
      e.preventDefault();
      submitPrix();
    } else if (e.target && e.target.id === 'comp-add-form') {
      e.preventDefault();
      ajouterComposante();
    } else if (e.target && e.target.id === 'new-dossier-form') {
      e.preventDefault();
      creerDossier();
    } else if (e.target && e.target.id === 'etude-form') {
      e.preventDefault();
      if (state.etudeFormPour) enregistrerEtudeConnue(state.etudeFormPour);
    }
  });

  // Keep login field values in state (without re-rendering on every keystroke)
  // so a render triggered elsewhere (e.g. loginLoading toggling) doesn't wipe
  // what the user already typed.
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="login-email"]')) state.loginEmail = t.value;
    else if (t.matches('[data-role="login-password"]')) state.loginPassword = t.value;
    else if (t.matches('[data-role="champ-simple"]')) {
      state[t.getAttribute('data-groupe')][t.getAttribute('data-cle')] = t.value;
    }
    // Reconnaître un nom du portefeuille remplit ce que le CRM sait déjà de
    // l'immeuble : adresse, ville, nombre de portes. On ne retape pas à côté
    // de la source. Tant que le nom ne correspond à rien, on n'interrompt pas
    // la frappe par un re-rendu — seule la bascule rattaché / non rattaché
    // redessine.
    else if (t.matches('[data-role="syndicat-pick"]')) {
      state.newDossier.name = t.value;
      const sy = state.syndicats.find(x => String(x.nom || '').trim() === t.value.trim());
      if (sy) {
        state.newDossier.crm_syndicat_id = sy.id;
        state.newDossier.address = sy.address || '';
        state.newDossier.city = sy.city || '';
        state.newDossier.units = sy.units == null ? '' : String(sy.units);
        render();
      } else if (state.newDossier.crm_syndicat_id) {
        state.newDossier.crm_syndicat_id = '';
        render();
      }
    }
    else if (t.matches('[data-role="prix-field"]')) {
      const champ = t.getAttribute('data-field');
      state.prixForm[champ] = t.type === 'checkbox' ? t.checked : t.value;
      // L'unité commande la présence du champ quantité : elle seule redessine.
      if (champ === 'unite') render();
    }
  });

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    switch (action) {
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
      case 'go-portefeuille':
        leaveReviewIA();
        state.screen = 'portefeuille';
        render();
        loadPortefeuille();
        break;
      case 'justesse-detail':
        state.justesseDetail = !state.justesseDetail;
        render();
        break;
      case 'recon-toggle':
        state.reconciliationOuverte = !state.reconciliationOuverte;
        render();
        break;
      case 'retry-portefeuille':
        loadPortefeuille();
        break;
      case 'pf-filtre':
        state.portefeuilleFiltre = btn.getAttribute('data-filtre');
        render();
        break;
      case 'pf-nouveau':
        dossierPourSyndicat(btn.getAttribute('data-id'));
        break;
      case 'pf-consigner': {
        const cible = btn.getAttribute('data-id');
        state.etudeFormPour = state.etudeFormPour === cible ? null : cible;
        state.etudeForm = { date_etude: '', auteur: '', note: '' };
        state.etudeError = null;
        render();
        break;
      }
      case 'retry-prix':
        loadPrix();
        break;
      case 'nouveau-dossier':
        state.newDossierOpen = !state.newDossierOpen;
        state.newDossierError = null;
        render();
        if (state.newDossierOpen) loadSyndicats();
        break;
      case 'comp-ajouter-ouvrir':
        state.compAddOpen = !state.compAddOpen;
        state.compAddError = null;
        render();
        break;
      case 'comp-supprimer':
        supprimerComposante(btn.getAttribute('data-id'));
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
        state.screen = 'publier';
        render();
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
      case 'toggle-detail': {
        const cid = btn.getAttribute('data-id');
        if (state.expanded[cid]) delete state.expanded[cid];
        else state.expanded[cid] = true;
        render();
        break;
      }
      case 'toggle-batiment':
        state.batimentOpen = !state.batimentOpen;
        render();
        break;
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


  // focusout bubbles (unlike blur), so a single delegated listener works for
  // the solde input and the contenteditable table cells.
  app.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="solde-input"]')) { onSoldeBlur(t.value); return; }
    if (t.matches('[data-role="cotisation-input"]')) { onCotisationBlur(t.value); return; }
    if (t.matches('[data-role="cost-cell"]')) { patchComponent(t.getAttribute('data-id'), { replacement_cost: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="life-cell"]')) { patchComponent(t.getAttribute('data-id'), { useful_life_years: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="year-cell"]')) { patchComponent(t.getAttribute('data-id'), { install_year: parseYear(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="comp-text"]') || t.matches('[data-role="comp-textarea"]')) { onCompTextBlur(t.getAttribute('data-id'), t.getAttribute('data-field'), t.value); return; }
    if (t.matches('[data-role="attr-value"]')) { onAttrValueBlur(t.getAttribute('data-id'), t.getAttribute('data-key'), t.value); return; }
  }, true);
}

initEvents();
boot();
