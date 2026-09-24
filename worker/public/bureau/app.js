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

  publishing: false,
  publishError: null,
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

// Seul l'ÉTAT DE L'ACTIF alimente la banque : c'est la seule sous-section
// rédigée par le modèle. Les trois autres sont déduites des données.
function collectEtatText() {
  const el = document.querySelector('.rvia-card [data-sec-cle="etat"]');
  const txt = el ? el.textContent.trim() : '';
  return txt.length >= 40 ? txt : null;
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
        <a class="login-forgot" href="/reinitialiser/">Mot de passe oublié ?</a>
      </form>
    </div>
  </div>`;
}

function railHtml() {
  const items = [
    { key: 'dossiers', label: 'Dossiers', icon: 'folder', disabled: false },
    { key: 'clients', label: 'Clients', icon: 'users', disabled: true },
    { key: 'carnet', label: "Carnet d'entretien", icon: 'calendar-clock', disabled: true },
    { key: 'modeles', label: 'Modèles', icon: 'file-stack', disabled: true },
  ];
  const dossiersActive = ['dossiers', 'revision', 'publier', 'reviewIA'].includes(state.screen);
  const initials = initialsOf(state.user && state.user.name);
  return `
  <div class="rail">
    <div class="rail-brand"><img src="${state.companyLogoUrl || '../assets/logo-mark.png'}" alt=""><span>${escapeHtml((state.user && state.user.company && state.user.company.name) || 'Condo Stratégis')}</span></div>
    <div class="rail-section-label">Console bureau</div>
    ${items.map(n => {
      const active = n.key === 'dossiers' && dossiersActive;
      return `<button class="rail-nav-item ${active ? 'active' : ''}" ${n.disabled ? 'disabled title="Bientôt disponible"' : 'data-action="go-dossiers"'}><i data-lucide="${n.icon}"></i><span class="label">${n.label}</span></button>`;
    }).join('')}
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
    <h1 class="page-title">Dossiers</h1>
    <p class="page-lead">Révisez les données du terrain, ajustez le fonds de prévoyance et générez les rapports.</p>
    ${state.dossiersError ? errorBanner(state.dossiersError, 'retry-dossiers') : ''}
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

function reportsCardHtml(allConf, remaining) {
  if (allConf) {
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

      <div class="comp-section-head">
        <span class="lbl">Composantes · ${docCount}/${total} documentées</span>
        <div class="rule"></div>
        <span class="hint">Édition directe des cellules</span>
      </div>

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
  const remaining = state.components.length - confirmedCount();
  const published = !!d.published_at;
  let body;
  if (published) {
    body = `
    <div class="pub-published">
      <div class="pub-icon-circle green"><i data-lucide="party-popper" style="width:30px;height:30px"></i></div>
      <h2>Étude publiée</h2>
      <p>Le syndicat ${escapeHtml(d.name || '')} a reçu l'avis par courriel. Sa plateforme est active : consultation de l'étude et suivi du carnet d'entretien.</p>
      <div style="display:flex;gap:11px;justify-content:center"><button class="btn-secondary" data-action="go-dossiers">Retour aux dossiers</button></div>
    </div>`;
  } else if (!allConf) {
    body = `
    <div class="pub-locked">
      <div class="pub-icon-circle"><i data-lucide="lock" style="width:28px;height:28px"></i></div>
      <h2>Révision à compléter</h2>
      <p>Les rapports Word et Excel ne sont pas générés tant que le texte de toutes les composantes n'est pas confirmé. Il reste <b>${remaining}</b> composante(s) à réviser.</p>
      <button class="btn-primary" data-action="go-reviewia"><i data-lucide="sparkles"></i>Poursuivre la révision</button>
    </div>`;
  } else {
    const deliverables = [
      { name: 'Étude de fonds de prévoyance', sub: 'Word · vérifié', icon: 'file-text', bg: 'var(--ink)', color: '#fff' },
      { name: 'Tableur durées de vie', sub: 'Excel · ' + state.components.length + ' composantes', icon: 'table-2', bg: 'var(--green)', color: '#fff' },
      { name: 'Accès plateforme client', sub: 'Espace syndicat en ligne', icon: 'monitor', bg: 'var(--ink-100)', color: 'var(--ink-700)' },
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
