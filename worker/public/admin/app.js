// ============================================================
// Administration — Condo Stratégis
// Vanilla-JS SPA, no build step. Super-admin only: manages
// companies ("entreprises") and their engineer accounts.
// ============================================================

import { creerBibliotheque } from '../shared/bibliotheque.js';

const TOKEN_KEY = 'cs_admin_token';

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
const state = {
  booting: true,
  screen: 'login', // login | forbidden | companies | company | bibliotheque

  token: null,
  user: null,

  loginEmail: '',
  loginPassword: '',
  loginLoading: false,
  loginError: null,

  // companies list
  companies: [],
  companiesLoading: false,
  companiesError: null,
  companyLogos: {}, // id -> object URL

  newCompanyOpen: false,
  newCompanyName: '',
  newCompanyLoading: false,
  newCompanyError: null,

  // company detail
  companyId: null,
  company: null, // { id, name, slug, hasLogo, engineers:[...], dossierCount, ... }
  companyLoading: false,
  companyError: null,
  companyLogoUrl: null,

  editingName: false,
  editNameValue: '',
  editNameLoading: false,
  editNameError: null,

  logoUploading: false,
  logoError: null,

  newEngineerOpen: false,
  newEngName: '',
  newEngEmail: '',
  template: null,          // { catalogue, sections, defauts, source_filename, ... }
  templateLoading: false,
  templateError: null,
  templateNote: null,
  templateUploading: false,
  templateOpenCle: null,   // section dépliée dans l'éditeur
  templateEdits: {},       // clé -> texte brut en cours d'édition
  templateSaving: false,
  theme: null,             // { theme, effectif, defauts } — identité du rapport
  themeDraft: {},
  themeSaving: false,
  themeError: null,
  themeNote: null,
  miseEnPage: null,        // { importe, filename, analyse, champs, blocs }
  miseEnPageUploading: false,
  miseEnPageError: null,
  roleSaving: null,        // id du compte dont le rôle change
  newEngTitle: '',
  newEngOrdre: '',
  newEngNoMembre: '',
  newEngLoading: false,
  newEngError: null,

  tempPasswordInfo: null, // { name, email, tempPassword }
};

// ---------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------
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
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return '—'; }
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
  revokeAllLogoUrls();
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
    const err = new Error((data && data.error) || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------
// Logo blob helpers
// ---------------------------------------------------------------
function revokeAllLogoUrls() {
  Object.keys(state.companyLogos).forEach(k => { try { URL.revokeObjectURL(state.companyLogos[k]); } catch (e) {} });
  state.companyLogos = {};
  if (state.companyLogoUrl) { try { URL.revokeObjectURL(state.companyLogoUrl); } catch (e) {} }
  state.companyLogoUrl = null;
}
async function loadListLogos(companies) {
  const targets = companies.filter(c => c.hasLogo);
  for (const c of targets) {
    try {
      const res = await apiRaw(`/api/companies/${c.id}/logo`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (state.companyLogos[c.id]) { try { URL.revokeObjectURL(state.companyLogos[c.id]); } catch (e) {} }
        state.companyLogos[c.id] = url;
        render();
      }
    } catch (e) { /* ignore, placeholder stays */ }
  }
}
async function loadCompanyLogo(id, hasLogo) {
  if (state.companyLogoUrl) { try { URL.revokeObjectURL(state.companyLogoUrl); } catch (e) {} state.companyLogoUrl = null; }
  if (!hasLogo) { render(); return; }
  try {
    const res = await apiRaw(`/api/companies/${id}/logo`);
    if (res.ok) {
      const blob = await res.blob();
      state.companyLogoUrl = URL.createObjectURL(blob);
    }
  } catch (e) { /* keep placeholder */ }
  render();
}

// ---------------------------------------------------------------
// Actions — boot / auth
// ---------------------------------------------------------------
async function boot() {
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  if (token) {
    state.token = token;
    try {
      state.user = await apiJson('/api/auth/me');
      state.booting = false;
      enterAfterAuth();
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

function enterAfterAuth() {
  if (state.user && state.user.role === 'super_admin') {
    state.screen = 'companies';
    render();
    loadCompanies();
  } else {
    state.screen = 'forbidden';
    render();
  }
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
    enterAfterAuth();
  } catch (e) {
    state.loginLoading = false;
    state.loginError = e.message || 'Erreur de connexion.';
    state.loginPassword = '';
    render();
  }
}

function doLogout() {
  revokeAllLogoUrls();
  state.token = null;
  state.user = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  state.screen = 'login';
  state.companies = [];
  state.company = null;
  state.companyId = null;
  state.loginError = null;
  state.tempPasswordInfo = null;
  render();
}

// ---------------------------------------------------------------
// Actions — companies list
// ---------------------------------------------------------------
async function loadCompanies() {
  state.companiesLoading = true;
  state.companiesError = null;
  render();
  try {
    const data = await apiJson('/api/companies');
    state.companies = Array.isArray(data) ? data : [];
    state.companiesLoading = false;
    render();
    loadListLogos(state.companies);
  } catch (e) {
    state.companiesLoading = false;
    state.companiesError = e.message || 'Impossible de charger les entreprises.';
    render();
  }
}

function openNewCompany() {
  state.newCompanyOpen = true;
  state.newCompanyName = '';
  state.newCompanyError = null;
  render();
}
function cancelNewCompany() {
  state.newCompanyOpen = false;
  state.newCompanyError = null;
  render();
}
async function submitNewCompany(name) {
  const n = (name || '').trim();
  if (!n) { state.newCompanyError = 'Le nom est requis.'; render(); return; }
  if (state.newCompanyLoading) return;
  state.newCompanyLoading = true;
  state.newCompanyError = null;
  render();
  try {
    const created = await apiJson('/api/companies', { method: 'POST', body: JSON.stringify({ name: n }) });
    state.newCompanyLoading = false;
    state.newCompanyOpen = false;
    state.newCompanyName = '';
    await loadCompanies();
    const id = created && (created.id || (created.company && created.company.id));
    if (id) openCompany(id);
  } catch (e) {
    state.newCompanyLoading = false;
    state.newCompanyError = e.message || 'Erreur lors de la création.';
    render();
  }
}

// ---------------------------------------------------------------
// Actions — company detail
// ---------------------------------------------------------------
async function openCompany(id) {
  state.companyId = id;
  state.screen = 'company';
  state.company = null;
  state.companyError = null;
  state.editingName = false;
  state.newEngineerOpen = false;
  state.newEngName = '';
  state.newEngEmail = '';
  state.newEngError = null;
  state.tempPasswordInfo = null;
  state.logoError = null;
  bib.reset();
  await loadCompanyDetail(id);
}

async function loadCompanyDetail(id) {
  state.companyLoading = true;
  state.companyError = null;
  render();
  try {
    const data = await apiJson(`/api/companies/${id}`);
    state.company = data;
    state.companyLoading = false;
    render();
    loadCompanyLogo(id, !!data.hasLogo);
    loadTemplate(id);
    loadTheme(id);
    loadMiseEnPage(id);
    bib.charger();
  } catch (e) {
    state.companyLoading = false;
    state.companyError = e.message || 'Impossible de charger cette entreprise.';
    render();
  }
}

// ---------------------------------------------------------------
// Identité du rapport et gabarit Word de mise en page
// ---------------------------------------------------------------
async function loadTheme(id) {
  try {
    state.theme = await apiJson(`/api/companies/${id}/theme`);
    state.themeDraft = Object.assign({}, state.theme.theme || {});
    state.themeError = null;
  } catch (e) {
    state.themeError = e.message || "Impossible de charger l'identité du rapport.";
  }
  render();
}

async function saveTheme() {
  if (state.themeSaving) return;
  state.themeSaving = true;
  state.themeError = null;
  state.themeNote = null;
  render();
  try {
    state.theme = await apiJson(`/api/companies/${state.companyId}/theme`, { method: 'PATCH', body: JSON.stringify(state.themeDraft) });
    state.themeDraft = Object.assign({}, state.theme.theme || {});
    state.themeNote = 'Identité enregistrée. Les prochains rapports Word la reprendront.';
  } catch (e) {
    state.themeError = e.message || "L'enregistrement a échoué.";
  }
  state.themeSaving = false;
  render();
}

async function loadMiseEnPage(id) {
  try {
    state.miseEnPage = await apiJson(`/api/companies/${id}/mise-en-page`);
    state.miseEnPageError = null;
  } catch (e) {
    state.miseEnPageError = e.message || 'Impossible de charger le gabarit de mise en page.';
  }
  render();
}

async function uploadMiseEnPage(file) {
  if (!file || state.miseEnPageUploading) return;
  state.miseEnPageUploading = true;
  state.miseEnPageError = null;
  render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    state.miseEnPage = await apiJson(`/api/companies/${state.companyId}/mise-en-page`, { method: 'POST', body: fd });
  } catch (e) {
    state.miseEnPageError = e.message || "L'import du gabarit a échoué.";
  }
  state.miseEnPageUploading = false;
  render();
}

async function deleteMiseEnPage() {
  if (!confirm("Retirer le gabarit de mise en page ? Les rapports reprendront la mise en page intégrée, aux couleurs de l'entreprise.")) return;
  try {
    state.miseEnPage = await apiJson(`/api/companies/${state.companyId}/mise-en-page`, { method: 'DELETE' });
  } catch (e) {
    state.miseEnPageError = e.message || "L'opération a échoué.";
  }
  render();
}

// ---------------------------------------------------------------
// Bibliothèque de composantes (page partagée avec la console bureau)
// ---------------------------------------------------------------
const bib = creerBibliotheque({
  apiJson: (path, opts) => apiJson(path, opts),
  apiRaw: (path, opts) => apiRaw(path, opts),
  render: () => render(),
  escapeHtml: (x) => escapeHtml(x),
  fmtDate: (x) => fmtDate(x),
  spinnerBlock: (x) => spinnerBlock(x),
  companyId: () => state.companyId,
});

function openBibliotheque() {
  state.screen = 'bibliotheque';
  bib.s.note = null;
  bib.s.erreurs = [];
  bib.s.error = null;
  render();
  window.scrollTo(0, 0);
  if (!bib.s.biblio) bib.charger();
}

function backToCompany() {
  state.screen = 'company';
  render();
  window.scrollTo(0, 0);
}

// Rôle d'un compte : ingénieur ou administrateur de la firme.
async function setEngineerRole(userId, role) {
  if (state.roleSaving) return;
  state.roleSaving = userId;
  render();
  try {
    const u = await apiJson(`/api/companies/${state.companyId}/engineers/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    const liste = (state.company && state.company.engineers) || [];
    const idx = liste.findIndex(e => e.id === userId);
    if (idx >= 0) liste[idx] = Object.assign({}, liste[idx], u);
  } catch (e) {
    alert(e.message || 'Le changement de rôle a échoué.');
  }
  state.roleSaving = null;
  render();
}

async function loadTemplate(id) {
  state.templateLoading = true;
  state.templateError = null;
  render();
  try {
    state.template = await apiJson(`/api/companies/${id}/template`);
    state.templateEdits = {};
  } catch (e) {
    state.templateError = e.message || 'Impossible de charger le gabarit.';
  }
  state.templateLoading = false;
  render();
}

async function uploadTemplate(file) {
  if (!file || state.templateUploading) return;
  state.templateUploading = true;
  state.templateError = null;
  state.templateNote = null;
  render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiJson(`/api/companies/${state.companyId}/template`, { method: 'POST', body: fd });
    const n = (res.sections_remplies || []).length;
    const reste = (res.sections_par_defaut || []).length;
    state.templateNote = res.note
      || `${res.paragraphes} paragraphes lus. ${n} section${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''} du document${reste ? `, ${reste} conservée${reste > 1 ? 's' : ''} au gabarit intégré faute de correspondance claire` : ''}. Relisez-les avant de produire un rapport.`;
    await loadTemplate(state.companyId);
  } catch (e) {
    state.templateError = e.message || "L'import du gabarit a échoué.";
  }
  state.templateUploading = false;
  render();
}

// Enregistre une section. Le texte saisi est renvoyé dans la forme attendue par
// la section : une chaîne, une liste de lignes, ou des paires « terme : définition ».
async function saveTemplateSection(cle) {
  const sec = (state.template && state.template.catalogue || []).find(x => x.cle === cle);
  if (!sec || state.templateSaving) return;
  const brut = state.templateEdits[cle];
  if (brut == null) { state.templateOpenCle = null; render(); return; }
  let valeur;
  const lignes = brut.split('\n').map(l => l.trim()).filter(Boolean);
  if (sec.forme === 'texte') valeur = brut.trim();
  else if (sec.forme === 'paires') valeur = lignes.map(l => { const i = l.indexOf(' : '); return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 3).trim()]; }).filter(Boolean);
  else valeur = lignes;

  const sections = Object.assign({}, state.template.sections || {});
  if ((Array.isArray(valeur) && valeur.length === 0) || (typeof valeur === 'string' && !valeur)) delete sections[cle];
  else sections[cle] = valeur;

  state.templateSaving = true;
  render();
  try {
    await apiJson(`/api/companies/${state.companyId}/template`, { method: 'PATCH', body: JSON.stringify({ sections }) });
    state.templateOpenCle = null;
    state.templateNote = null;
    await loadTemplate(state.companyId);
  } catch (e) {
    state.templateError = e.message || "L'enregistrement a échoué.";
  }
  state.templateSaving = false;
  render();
}

async function clearTemplateSection(cle) {
  const sections = Object.assign({}, state.template && state.template.sections || {});
  delete sections[cle];
  state.templateSaving = true;
  render();
  try {
    await apiJson(`/api/companies/${state.companyId}/template`, { method: 'PATCH', body: JSON.stringify({ sections }) });
    delete state.templateEdits[cle];
    state.templateOpenCle = null;
    await loadTemplate(state.companyId);
  } catch (e) {
    state.templateError = e.message || "L'opération a échoué.";
  }
  state.templateSaving = false;
  render();
}

async function resetTemplate() {
  if (!confirm("Remettre toutes les sections au gabarit intégré ? Le document importé reste conservé, mais son texte ne sera plus utilisé dans les rapports.")) return;
  try {
    await apiJson(`/api/companies/${state.companyId}/template`, { method: 'DELETE' });
    state.templateNote = null;
    state.templateEdits = {};
    await loadTemplate(state.companyId);
  } catch (e) {
    state.templateError = e.message || "L'opération a échoué.";
    render();
  }
}

function backToCompanies() {
  if (state.companyLogoUrl) { try { URL.revokeObjectURL(state.companyLogoUrl); } catch (e) {} state.companyLogoUrl = null; }
  state.screen = 'companies';
  state.company = null;
  state.companyId = null;
  state.tempPasswordInfo = null;
  render();
  loadCompanies();
}

function openEditName() {
  state.editingName = true;
  state.editNameValue = (state.company && state.company.name) || '';
  state.editNameError = null;
  render();
}
function cancelEditName() {
  state.editingName = false;
  state.editNameError = null;
  render();
}
async function saveCompanyName(name) {
  const n = (name || '').trim();
  if (!n) { state.editNameError = 'Le nom est requis.'; render(); return; }
  if (state.editNameLoading) return;
  state.editNameLoading = true;
  state.editNameError = null;
  render();
  try {
    await apiJson(`/api/companies/${state.companyId}`, { method: 'PATCH', body: JSON.stringify({ name: n }) });
    state.company = Object.assign({}, state.company, { name: n });
    state.editNameLoading = false;
    state.editingName = false;
    render();
  } catch (e) {
    state.editNameLoading = false;
    state.editNameError = e.message || "Échec de l'enregistrement.";
    render();
  }
}

async function uploadLogo(file) {
  if (!file || !state.companyId) return;
  state.logoUploading = true;
  state.logoError = null;
  render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    await apiJson(`/api/companies/${state.companyId}/logo`, { method: 'POST', body: fd });
    state.company = Object.assign({}, state.company, { hasLogo: true });
    state.companies = state.companies.map(c => String(c.id) === String(state.companyId) ? Object.assign({}, c, { hasLogo: true }) : c);
    state.logoUploading = false;
    render();
    loadCompanyLogo(state.companyId, true);
    if (state.companyLogos[state.companyId]) { try { URL.revokeObjectURL(state.companyLogos[state.companyId]); } catch (e) {} delete state.companyLogos[state.companyId]; }
    loadListLogos(state.companies.filter(c => String(c.id) === String(state.companyId)));
  } catch (e) {
    state.logoUploading = false;
    state.logoError = e.message || "Échec de l'envoi du logo.";
    render();
  }
}

function openNewEngineer() {
  state.newEngineerOpen = true;
  state.newEngName = '';
  state.newEngEmail = '';
  state.newEngError = null;
  render();
}
function cancelNewEngineer() {
  state.newEngineerOpen = false;
  state.newEngError = null;
  render();
}
async function submitNewEngineer(name, email) {
  const n = (name || '').trim();
  const e2 = (email || '').trim();
  if (!n || !e2) { state.newEngError = 'Le nom et le courriel sont requis.'; render(); return; }
  if (state.newEngLoading) return;
  state.newEngLoading = true;
  state.newEngError = null;
  render();
  try {
    const res = await apiJson(`/api/companies/${state.companyId}/engineers`, {
      method: 'POST',
      body: JSON.stringify({
        name: n, email: e2,
        title: (state.newEngTitle || '').trim(),
        ordre_professionnel: (state.newEngOrdre || '').trim(),
        no_membre: (state.newEngNoMembre || '').trim(),
      }),
    });
    state.newEngLoading = false;
    state.newEngineerOpen = false;
    state.newEngName = '';
    state.newEngEmail = '';
    state.newEngTitle = '';
    state.newEngOrdre = '';
    state.newEngNoMembre = '';
    state.tempPasswordInfo = {
      name: (res.user && res.user.name) || n,
      email: (res.user && res.user.email) || e2,
      tempPassword: res.tempPassword,
    };
    await loadCompanyDetail(state.companyId);
  } catch (e) {
    state.newEngLoading = false;
    if (e.status === 409) state.newEngError = 'Ce courriel est déjà utilisé par un autre compte.';
    else state.newEngError = e.message || "Échec de la création du compte.";
    render();
  }
}

function dismissTempPassword() {
  state.tempPasswordInfo = null;
  render();
}

async function copyTempPassword() {
  if (!state.tempPasswordInfo) return;
  try {
    await navigator.clipboard.writeText(state.tempPasswordInfo.tempPassword);
    state.tempPasswordInfo = Object.assign({}, state.tempPasswordInfo, { copied: true });
    render();
    setTimeout(() => {
      if (state.tempPasswordInfo) { state.tempPasswordInfo.copied = false; render(); }
    }, 1800);
  } catch (e) { /* clipboard unavailable — user can still select the text manually */ }
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function render() {
  let html;
  try {
    if (state.booting) html = renderBooting();
    else if (state.screen === 'login') html = renderLogin();
    else if (state.screen === 'forbidden') html = renderForbidden();
    else html = renderShell();
  } catch (err) {
    console.error(err);
    html = '<div class="empty-state">Une erreur inattendue est survenue. Rechargez la page.</div>';
  }
  const app = document.getElementById('app');
  app.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
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
        <div class="login-eyebrow">Administration</div>
        <h1 class="login-title">Gérez les<br>entreprises <span style="color:var(--orange)">clientes</span></h1>
        <p class="login-lead">Créez les entreprises, gérez leur logo et donnez accès à leurs ingénieurs.</p>
      </div>
      <div class="login-foot">Console d'administration · Québec</div>
    </div>
    <div class="login-right">
      <form class="login-form" id="login-form" novalidate>
        <h2>Connexion</h2>
        <p>Accès réservé à l'administrateur de la plateforme.</p>
        ${state.loginError ? `<div class="login-error">${escapeHtml(state.loginError)}</div>` : ''}
        <label class="field-label" for="login-email">Courriel</label>
        <div class="field-box"><i data-lucide="mail"></i><input id="login-email" data-role="login-email" name="email" type="email" autocomplete="username" placeholder="admin@condostrategis.ca" value="${escapeHtml(state.loginEmail || '')}" required></div>
        <label class="field-label" for="login-password">Mot de passe</label>
        <div class="field-box"><i data-lucide="lock"></i><input id="login-password" data-role="login-password" name="password" type="password" autocomplete="current-password" placeholder="Mot de passe" value="${escapeHtml(state.loginPassword || '')}" required></div>
        <button type="submit" class="btn-primary" style="width:100%" ${state.loginLoading ? 'disabled' : ''}>${state.loginLoading ? 'Connexion…' : 'Se connecter'}<i data-lucide="${state.loginLoading ? 'loader-2' : 'arrow-right'}" class="${state.loginLoading ? 'spin' : ''}"></i></button>
      </form>
    </div>
  </div>`;
}

function topbarHtml() {
  const initials = initialsOf(state.user && state.user.name);
  return `
  <div class="topbar">
    <div class="topbar-brand"><img src="../assets/logo-mark.png" alt=""><span>Condo Strat<span style="color:var(--orange)">é</span>gis <span class="topbar-sep">—</span> Administration</span></div>
    <div class="topbar-user">
      <div class="avatar-badge">${initials}</div>
      <div class="topbar-user-info">
        <div class="topbar-user-name">${escapeHtml((state.user && state.user.name) || 'Administrateur')}</div>
        <div class="topbar-user-sub">${escapeHtml((state.user && state.user.email) || '')}</div>
      </div>
      <button class="btn-secondary" data-action="logout"><i data-lucide="log-out"></i>Déconnexion</button>
    </div>
  </div>`;
}

function renderForbidden() {
  return `
  <div class="app-shell">
    ${topbarHtml()}
    <div class="page-pad">
      <div class="forbidden-box">
        <div class="pub-icon-circle"><i data-lucide="shield-alert" style="width:26px;height:26px"></i></div>
        <h2>Accès réservé aux administrateurs</h2>
        <p>Ce compte (${escapeHtml((state.user && state.user.email) || '')}) n'a pas le rôle d'administrateur de la plateforme. Cette console est réservée au compte super-administrateur de Condo Stratégis.</p>
      </div>
    </div>
  </div>`;
}

function renderShell() {
  let main = '';
  if (state.screen === 'companies') main = renderCompanies();
  else if (state.screen === 'company') main = renderCompanyDetail();
  else if (state.screen === 'bibliotheque') main = renderBibliotheque();
  return `<div class="app-shell">${topbarHtml()}${main}</div>`;
}

function companyThumbHtml(c) {
  const url = state.companyLogos[c.id];
  if (c.hasLogo && url) return `<div class="co-thumb"><img src="${url}" alt=""></div>`;
  return `<div class="co-thumb co-thumb-placeholder">${escapeHtml(initialsOf(c.name))}</div>`;
}

function renderCompanies() {
  return `
  <div class="page-pad">
    <div class="page-head-row">
      <div>
        <div class="eyebrow-orange">Plateforme</div>
        <h1 class="page-title">Entreprises</h1>
        <p class="page-lead">Chaque entreprise a ses propres ingénieurs et ses propres dossiers, isolés des autres.</p>
      </div>
      <button class="btn-primary" data-action="new-company-open"><i data-lucide="plus"></i>Nouvelle entreprise</button>
    </div>
    ${state.companiesError ? errorBanner(state.companiesError, 'retry-companies') : ''}
    ${state.newCompanyOpen ? `
    <form class="inline-form" id="new-company-form">
      <div class="inline-form-row">
        <div class="field-box" style="flex:1;margin:0"><i data-lucide="building-2"></i><input type="text" data-role="new-company-name" placeholder="Nom de l'entreprise" value="${escapeHtml(state.newCompanyName || '')}" autofocus></div>
        <button type="submit" class="btn-primary" ${state.newCompanyLoading ? 'disabled' : ''}>${state.newCompanyLoading ? 'Création…' : 'Créer'}</button>
        <button type="button" class="btn-secondary" data-action="new-company-cancel">Annuler</button>
      </div>
      ${state.newCompanyError ? `<div class="login-error" style="margin-top:10px">${escapeHtml(state.newCompanyError)}</div>` : ''}
    </form>` : ''}
    ${state.companiesLoading && state.companies.length === 0 ? spinnerBlock('Chargement des entreprises…') : `
    <div class="dossiers-table">
      <div class="dt-row co-row dt-head"><div>Entreprise</div><div>Ingénieurs</div><div>Dossiers</div><div>Créée le</div><div></div></div>
      ${state.companies.length === 0 ? `<div class="empty-state">Aucune entreprise pour l'instant.</div>` : state.companies.map(c => `
      <div class="dt-row co-row">
        <div class="co-name-cell">${companyThumbHtml(c)}<div><div class="dt-name">${escapeHtml(c.name || '—')}</div><div class="dt-sub">${escapeHtml(c.slug || '')}</div></div></div>
        <div class="mono-cell">${c.engineerCount != null ? c.engineerCount : '—'}</div>
        <div class="mono-cell">${c.dossierCount != null ? c.dossierCount : '—'}</div>
        <div class="mono-cell">${fmtDate(c.created_at)}</div>
        <div><button class="btn-row-action" data-action="open-company" data-id="${c.id}">Ouvrir</button></div>
      </div>`).join('')}
    </div>`}
  </div>`;
}

function renderCompanyDetail() {
  if (state.companyLoading) return `<div class="page-pad">${spinnerBlock('Chargement de l’entreprise…')}</div>`;
  if (state.companyError) return `<div class="page-pad">${errorBanner(state.companyError, 'retry-company')}</div>`;
  const c = state.company;
  if (!c) return `<div class="page-pad"><div class="empty-state">Entreprise introuvable.</div></div>`;
  const engineers = Array.isArray(c.engineers) ? c.engineers : [];

  return `
  <div class="page-pad">
    <button class="back-link" data-action="back-companies"><i data-lucide="chevron-left"></i>Toutes les entreprises</button>

    <div class="co-detail-head">
      <div class="co-logo-block">
        ${c.hasLogo && state.companyLogoUrl ? `<img src="${state.companyLogoUrl}" alt="" class="co-logo-big">` : `<div class="co-logo-big co-thumb-placeholder">${escapeHtml(initialsOf(c.name))}</div>`}
        <label class="btn-pill-sm co-logo-upload">${state.logoUploading ? 'Envoi…' : 'Changer le logo'}<input type="file" accept="image/*" data-role="logo-file" style="display:none" ${state.logoUploading ? 'disabled' : ''}></label>
      </div>
      <div class="co-detail-title-block">
        ${state.editingName ? `
        <form class="inline-form" id="edit-name-form" style="margin:0">
          <div class="inline-form-row">
            <div class="field-box" style="flex:1;margin:0;max-width:340px"><i data-lucide="building-2"></i><input type="text" data-role="edit-name-input" value="${escapeHtml(state.editNameValue || '')}" autofocus></div>
            <button type="submit" class="btn-primary" ${state.editNameLoading ? 'disabled' : ''}>${state.editNameLoading ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button type="button" class="btn-secondary" data-action="edit-name-cancel">Annuler</button>
          </div>
          ${state.editNameError ? `<div class="login-error" style="margin-top:10px">${escapeHtml(state.editNameError)}</div>` : ''}
        </form>` : `
        <h1 class="page-title" style="margin-bottom:2px">${escapeHtml(c.name || '—')}<button class="icon-btn" style="margin-left:12px;vertical-align:middle" data-action="edit-name-open" title="Renommer"><i data-lucide="pencil" style="width:14px;height:14px"></i></button></h1>
        <div class="co-detail-sub">${escapeHtml(c.slug || '')} · ${engineers.length} ingénieur${engineers.length > 1 ? 's' : ''} · ${c.dossierCount != null ? c.dossierCount : 0} dossier${(c.dossierCount || 0) > 1 ? 's' : ''}</div>`}
        ${state.logoError ? `<div class="login-error" style="margin-top:10px;max-width:400px">${escapeHtml(state.logoError)}</div>` : ''}
      </div>
    </div>

    ${state.tempPasswordInfo ? `
    <div class="temp-pass-box">
      <div class="temp-pass-head">
        <i data-lucide="key-round"></i>
        <div>
          <div class="temp-pass-title">Compte créé pour ${escapeHtml(state.tempPasswordInfo.name)}</div>
          <div class="temp-pass-sub">${escapeHtml(state.tempPasswordInfo.email)}</div>
        </div>
        <button class="icon-btn" data-action="dismiss-temp-password" title="Fermer"><i data-lucide="x" style="width:14px;height:14px"></i></button>
      </div>
      <div class="temp-pass-warn"><i data-lucide="alert-triangle"></i><span>Notez ce mot de passe maintenant — vous ne pourrez plus le revoir. Aucun courriel automatique n'est envoyé : communiquez-le vous-même à l'ingénieur.</span></div>
      <div class="temp-pass-value-row">
        <code class="temp-pass-value">${escapeHtml(state.tempPasswordInfo.tempPassword || '')}</code>
        <button class="btn-secondary" data-action="copy-temp-password">${state.tempPasswordInfo.copied ? 'Copié !' : 'Copier'}<i data-lucide="${state.tempPasswordInfo.copied ? 'check' : 'copy'}"></i></button>
      </div>
    </div>` : ''}

    <div class="eng-section-head">
      <span class="lbl">Ingénieurs</span>
      <div class="rule"></div>
      <button class="btn-pill-sm" data-action="new-engineer-open"><i data-lucide="user-plus" style="width:13px;height:13px"></i>Ajouter un ingénieur</button>
    </div>

    ${state.newEngineerOpen ? `
    <form class="inline-form" id="new-engineer-form">
      <div class="inline-form-row">
        <div class="field-box" style="flex:1;margin:0"><i data-lucide="user"></i><input type="text" data-role="new-eng-name" placeholder="Nom complet" value="${escapeHtml(state.newEngName || '')}" autofocus></div>
        <div class="field-box" style="flex:1;margin:0"><i data-lucide="mail"></i><input type="email" data-role="new-eng-email" placeholder="Courriel" value="${escapeHtml(state.newEngEmail || '')}"></div>
      </div>
      <div class="inline-form-row" style="margin-top:10px">
        <div class="field-box" style="flex:1;margin:0"><i data-lucide="award"></i><input type="text" data-role="new-eng-title" placeholder="Titre (ex. ing., M.Sc.A.)" value="${escapeHtml(state.newEngTitle || '')}"></div>
        <div class="field-box" style="width:120px;margin:0"><input type="text" data-role="new-eng-ordre" placeholder="Ordre" value="${escapeHtml(state.newEngOrdre || '')}"></div>
        <div class="field-box" style="flex:1;margin:0"><i data-lucide="hash"></i><input type="text" data-role="new-eng-no-membre" placeholder="N° de membre" value="${escapeHtml(state.newEngNoMembre || '')}"></div>
        <button type="submit" class="btn-primary" ${state.newEngLoading ? 'disabled' : ''}>${state.newEngLoading ? 'Création…' : 'Créer le compte'}</button>
        <button type="button" class="btn-secondary" data-action="new-engineer-cancel">Annuler</button>
      </div>
      <div class="form-hint" style="margin-top:8px;font-size:12px;color:var(--ink-500)">Ordre professionnel (OIQ, OTPQ, OAQ) et n° de membre : repris tels quels à la section 8.0 Déclaration du rapport. Sans eux, le rapport sort avec une mention « à compléter avant signature ».</div>
      ${state.newEngError ? `<div class="login-error" style="margin-top:10px">${escapeHtml(state.newEngError)}</div>` : ''}
    </form>` : ''}

    <div class="dossiers-table">
      <div class="dt-row eng-row dt-head"><div>Nom</div><div>Courriel</div><div>Rôle</div><div>Signature</div><div>Créé le</div></div>
      ${engineers.length === 0 ? `<div class="empty-state">Aucun ingénieur pour cette entreprise.</div>` : engineers.map(e => `
      <div class="dt-row eng-row">
        <div class="dt-name">${escapeHtml(e.name || '—')}</div>
        <div class="mono-cell">${escapeHtml(e.email || '—')}</div>
        <div class="role-cell">${e.role === 'super_admin'
          ? `<span class="status-badge" style="background:var(--ink-100);color:var(--ink-600)">Super admin</span>`
          : e.role === 'admin'
            ? `<span class="status-badge" style="background:var(--orange-wash);color:var(--ink-800)">Admin de la firme</span><button class="role-toggle" data-action="engineer-role" data-id="${e.id}" data-role-cible="engineer" ${state.roleSaving ? 'disabled' : ''}>${state.roleSaving === e.id ? '…' : 'Retirer'}</button>`
            : `<span class="status-badge" style="background:var(--ink-100);color:var(--ink-600)">Ingénieur</span><button class="role-toggle" data-action="engineer-role" data-id="${e.id}" data-role-cible="admin" ${state.roleSaving ? 'disabled' : ''} title="Un administrateur de la firme peut importer sa bibliothèque de composantes depuis la console bureau.">${state.roleSaving === e.id ? '…' : 'Nommer admin'}</button>`}</div>
        <div>${e.ordre_professionnel && e.no_membre
          ? `<span class="status-badge" style="background:var(--ink-100);color:var(--ink-600)">${escapeHtml(e.ordre_professionnel)} ${escapeHtml(e.no_membre)}</span>`
          : `<span class="status-badge" title="La section 8.0 du rapport sortira avec « à compléter avant signature »." style="background:#FFF1EC;color:#B03A1A">Bloc incomplet</span>`}</div>
        <div class="mono-cell">${fmtDate(e.created_at)}</div>
      </div>`).join('')}
    </div>

    ${bibliothequeCardHtml()}
    ${themeCardHtml()}
    ${miseEnPageCardHtml()}
    ${templateCardHtml()}
  </div>`;
}

function bibliothequeCardHtml() {
  return `
  <div>
    <div class="eng-section-head">
      <span class="lbl">Bibliothèque de composantes</span>
      <div class="rule"></div>
      <button class="btn-pill-sm" data-action="biblio-open"><i data-lucide="library" style="width:14px;height:14px"></i>Ouvrir la bibliothèque</button>
    </div>
    <div class="tpl-lead">La liste de composantes qui sert de départ à chaque nouvelle visite, avec les tâches du carnet d'entretien rattachées à chacune. Un administrateur de la firme peut aussi importer sa liste depuis la console bureau.</div>
    ${bib.resumeHtml()}
  </div>`;
}

function renderBibliotheque() {
  const c = state.company;
  return bib.html({
    retour: `<button class="back-link" data-action="biblio-back"><i data-lucide="chevron-left"></i>${escapeHtml((c && c.name) || 'Entreprise')}</button>`,
    eyebrow: (c && c.name) || '',
  });
}

// Identité du rapport : couleurs, polices et coordonnées reprises par le
// rapport Word. Un champ vide garde la valeur par défaut.
const THEME_CHAMPS = [
  { k: 'accent', label: "Couleur d'accent", type: 'couleur', aide: 'Titres de section, filets, cote « Mauvais ».' },
  { k: 'encre', label: 'Couleur du texte', type: 'couleur' },
  { k: 'gris', label: 'Couleur secondaire', type: 'couleur', aide: 'Étiquettes, légendes, pied de page.' },
  { k: 'police', label: 'Police du texte', type: 'texte' },
  { k: 'policeTitres', label: 'Police des titres', type: 'texte' },
  { k: 'policeMono', label: 'Police des étiquettes', type: 'texte' },
  { k: 'adresse', label: 'Adresse', type: 'texte' },
  { k: 'telephone', label: 'Téléphone', type: 'texte' },
  { k: 'courriel', label: 'Courriel', type: 'texte' },
  { k: 'site', label: 'Site Web', type: 'texte' },
];

function themeCardHtml() {
  const t = state.theme;
  const d = state.themeDraft || {};
  const eff = (t && t.effectif) || {};
  const val = (k) => d[k] != null && d[k] !== '' ? d[k] : '';
  const couleur = (k) => '#' + String(val(k) || eff[k] || '000000').replace(/^#/, '');
  return `
  <div>
    <div class="eng-section-head">
      <span class="lbl">Identité du rapport</span>
      <div class="rule"></div>
    </div>
    <div class="tpl-lead">Couleurs, polices et coordonnées du rapport Word de cette entreprise. Un champ laissé vide garde la valeur par défaut. Les polices doivent être installées sur les postes qui ouvrent le document; sinon Word les remplace.</div>
    ${state.themeError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(state.themeError)}</div>` : ''}
    ${state.themeNote ? `<div class="temp-pass-warn" style="margin:10px 0"><i data-lucide="check"></i><span>${escapeHtml(state.themeNote)}</span></div>` : ''}
    ${!t ? spinnerBlock('Chargement…') : `
    <div class="theme-grid">
      ${THEME_CHAMPS.map(c => `
      <label class="theme-field">
        <span class="field-label">${escapeHtml(c.label)}</span>
        ${c.type === 'couleur' ? `
        <span class="theme-color-row">
          <input type="color" data-role="theme-color" data-key="${c.k}" value="${escapeHtml(couleur(c.k))}">
          <input type="text" data-role="theme-field" data-key="${c.k}" value="${escapeHtml(val(c.k))}" placeholder="${escapeHtml((t.defauts || {})[c.k] || '')}" maxlength="7">
        </span>` : `
        <input type="text" data-role="theme-field" data-key="${c.k}" value="${escapeHtml(val(c.k))}" placeholder="${escapeHtml(eff[c.k] || (t.defauts || {})[c.k] || '')}">`}
        ${c.aide ? `<span class="theme-help">${escapeHtml(c.aide)}</span>` : ''}
      </label>`).join('')}
    </div>
    <div class="theme-apercu" style="--acc:${couleur('accent')};--enc:${couleur('encre')};--gri:${couleur('gris')}">
      <div class="ta-eyebrow">Enveloppe du bâtiment · B20.10</div>
      <div class="ta-title">4.3.12 Parement – Maçonnerie</div>
      <div class="ta-rule"></div>
      <div class="ta-label">État de l'actif</div>
      <div class="ta-text">Aperçu des couleurs d'une fiche composante.</div>
    </div>
    <div class="tpl-actions">
      <button class="btn-primary" data-action="theme-save" ${state.themeSaving ? 'disabled' : ''}>${state.themeSaving ? 'Enregistrement…' : "Enregistrer l'identité"}</button>
    </div>`}
  </div>`;
}

function miseEnPageCardHtml() {
  const m = state.miseEnPage;
  const a = (m && m.analyse) || null;
  const champs = (m && m.champs) || [];
  const blocs = (m && m.blocs) || [];
  const puces = (liste) => liste.map(k => `<code class="champ-chip">{{${escapeHtml(k)}}}</code>`).join(' ');
  return `
  <div>
    <div class="eng-section-head">
      <span class="lbl">Gabarit Word de mise en page</span>
      <div class="rule"></div>
      <label class="btn-pill-sm">${state.miseEnPageUploading ? 'Analyse du document…' : 'Importer un .docx'}<input type="file" accept=".docx" data-role="mise-en-page-file" style="display:none" ${state.miseEnPageUploading ? 'disabled' : ''}></label>
    </div>
    <div class="tpl-lead">Les pages que l'entreprise place avant le rapport (page de garde, présentation de la firme, explications de la Loi 16…), avec son en-tête, son pied de page et ses styles. Écrivez les champs entre accolades là où les données du dossier doivent apparaître, et placez <code>{{RAPPORT}}</code> à l'endroit où le rapport de la plateforme commence.</div>
    ${state.miseEnPageError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(state.miseEnPageError)}</div>` : ''}
    ${!m ? spinnerBlock('Chargement…') : `
    ${m.importe ? `
    <div class="tpl-lead" style="margin:10px 0">Importé depuis <code>${escapeHtml(m.filename || '')}</code> le ${fmtDate(m.imported_at)} · <button class="btn-row-action" data-action="mise-en-page-delete">Retirer ce gabarit</button></div>
    ${a && !a.repere ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="info"></i><span>Aucun repère <code>{{RAPPORT}}</code> : le rapport sera ajouté à la fin du document, sur une nouvelle page.</span></div>` : ''}
    ${a && a.inconnus && a.inconnus.length ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="alert-triangle"></i><span>Champs inconnus, laissés tels quels dans le rapport : ${puces(a.inconnus)}</span></div>` : ''}
    ${a && a.notes && a.notes.length ? `<div class="temp-pass-warn" style="margin:8px 0"><i data-lucide="alert-triangle"></i><span>Notes de rédaction internes trouvées dans les pages liminaires — elles seraient reprises telles quelles dans chaque rapport livré :<br>${a.notes.map(n => `« ${escapeHtml(n)} »`).join('<br>')}</span></div>` : ''}
    ${a ? `<div class="tpl-lead" style="margin:8px 0">Champs reconnus : ${a.champs && a.champs.length ? puces(a.champs) : 'aucun'}${a.blocs && a.blocs.length ? ` · Blocs : ${puces(a.blocs.map(b => b.toUpperCase()))}` : ''}</div>` : ''}` : `
    <div class="tpl-lead" style="margin:10px 0">Aucun gabarit importé : les rapports utilisent la mise en page intégrée, aux couleurs de l'entreprise.</div>`}
    <details class="champs-details">
    <summary>Voir les champs disponibles (${champs.length + blocs.length})</summary>
    <div class="dossiers-table" style="margin-top:12px">
      <div class="dt-row champ-row dt-head"><div>Champ</div><div>Remplacé par</div></div>
      ${blocs.map(([k, d]) => `<div class="dt-row champ-row"><div><code class="champ-chip">{{${escapeHtml(k.toUpperCase())}}}</code></div><div class="dt-sub">${escapeHtml(d)}</div></div>`).join('')}
      ${champs.map(([k, d]) => `<div class="dt-row champ-row"><div><code class="champ-chip">{{${escapeHtml(k)}}}</code></div><div class="dt-sub">${escapeHtml(d)}</div></div>`).join('')}
    </div>
    </details>`}
  </div>`;
}

// Aperçu d'une section : ce que la firme a fourni, ou le texte intégré.
function apercuSection(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    if (val.length && Array.isArray(val[0])) return val.map(pr => pr.join(' : ')).join('\n');
    return val.join('\n');
  }
  if (typeof val === 'object') return Object.entries(val).map(([k, v]) => k + '\n' + apercuSection(v)).join('\n\n');
  return String(val);
}

function templateCardHtml() {
  const t = state.template;
  const importe = t && t.sections ? Object.keys(t.sections) : [];
  return `
  <div>
    <div class="eng-section-head">
      <span class="lbl">Gabarit de rapport</span>
      <div class="rule"></div>
      <label class="btn-pill-sm">${state.templateUploading ? 'Lecture du document…' : 'Importer un .docx'}<input type="file" accept=".docx" data-role="template-file" style="display:none" ${state.templateUploading ? 'disabled' : ''}></label>
    </div>
    <div class="tpl-lead">Le texte de fond des rapports de cette entreprise — méthodologie, limitations légales, déclaration, lexique. Les sections non fournies gardent le gabarit intégré.</div>

    ${state.templateError ? `<div class="login-error" style="margin:10px 0">${escapeHtml(state.templateError)}</div>` : ''}
    ${state.templateNote ? `<div class="temp-pass-warn" style="margin:10px 0"><i data-lucide="info"></i><span>${escapeHtml(state.templateNote)}</span></div>` : ''}

    ${state.templateLoading ? spinnerBlock('Chargement du gabarit…') : !t ? '' : `
      <div class="tpl-lead" style="margin:10px 0 14px">
        ${t.source_filename ? `Importé depuis <code>${escapeHtml(t.source_filename)}</code> le ${fmtDate(t.imported_at)} · ` : ''}
        <strong>${importe.length}</strong> section${importe.length > 1 ? 's' : ''} sur ${t.catalogue.length} proviennent de cette entreprise.
        ${importe.length ? `<button class="btn-row-action" style="margin-left:10px" data-action="template-reset">Tout remettre au gabarit intégré</button>` : ''}
      </div>

      <div class="dossiers-table">
        ${t.catalogue.map(sec => {
          const propre = t.sections && t.sections[sec.cle] != null;
          const ouvert = state.templateOpenCle === sec.cle;
          const valeur = state.templateEdits[sec.cle] != null
            ? state.templateEdits[sec.cle]
            : apercuSection(propre ? t.sections[sec.cle] : (t.defauts || {})[sec.cle]);
          return `
          <div class="dt-row tpl-row">
            <div class="dt-name">${escapeHtml(sec.label)}</div>
            <div>${propre
              ? `<span class="status-badge" style="background:#E8F5E9;color:#1B5E20">Gabarit de l'entreprise</span>`
              : `<span class="status-badge" style="background:var(--ink-100);color:var(--ink-600)">Gabarit intégré</span>`}</div>
            <div><button class="btn-row-action" data-action="template-toggle" data-cle="${escapeHtml(sec.cle)}">${ouvert ? 'Fermer' : 'Voir / corriger'}</button></div>
          </div>
          ${ouvert ? `
          <div class="tpl-edit">
            <div class="tpl-lead" style="margin-bottom:8px">${sec.forme === 'paires' ? 'Une ligne par entrée, au format « terme : définition ».' : sec.forme === 'texte' ? 'Un seul bloc de texte.' : 'Une ligne par paragraphe ou par puce.'}${sec.sous ? ' Cette section contient plusieurs sous-parties : la modifier à la main est déconseillé, préférez réimporter le .docx.' : ''}</div>
            <textarea data-role="template-text" data-cle="${escapeHtml(sec.cle)}" rows="10" ${sec.sous ? 'readonly' : ''}>${escapeHtml(valeur)}</textarea>
            ${sec.sous ? '' : `<div class="tpl-actions">
              <button class="btn-primary" data-action="template-save" data-cle="${escapeHtml(sec.cle)}" ${state.templateSaving ? 'disabled' : ''}>${state.templateSaving ? 'Enregistrement…' : 'Enregistrer cette section'}</button>
              ${propre ? `<button class="btn-secondary" data-action="template-clear" data-cle="${escapeHtml(sec.cle)}">Revenir au gabarit intégré</button>` : ''}
            </div>`}
          </div>` : ''}`;
        }).join('')}
      </div>`}
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
      return;
    }
    if (e.target && e.target.id === 'new-company-form') {
      e.preventDefault();
      submitNewCompany(state.newCompanyName);
      return;
    }
    if (e.target && e.target.id === 'edit-name-form') {
      e.preventDefault();
      saveCompanyName(state.editNameValue);
      return;
    }
    if (e.target && e.target.id === 'new-engineer-form') {
      e.preventDefault();
      submitNewEngineer(state.newEngName, state.newEngEmail);
      return;
    }
  });

  // Keep text-input values in state without re-rendering on every keystroke,
  // so a render triggered elsewhere (e.g. a loading-state toggle) doesn't
  // wipe out what the user already typed.
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="login-email"]')) state.loginEmail = t.value;
    else if (t.matches('[data-role="login-password"]')) state.loginPassword = t.value;
    else if (t.matches('[data-role="new-company-name"]')) state.newCompanyName = t.value;
    else if (t.matches('[data-role="edit-name-input"]')) state.editNameValue = t.value;
    else if (t.matches('[data-role="new-eng-name"]')) state.newEngName = t.value;
    else if (t.matches('[data-role="new-eng-email"]')) state.newEngEmail = t.value;
    else if (t.matches('[data-role="new-eng-title"]')) state.newEngTitle = t.value;
    else if (t.matches('[data-role="new-eng-ordre"]')) state.newEngOrdre = t.value;
    else if (t.matches('[data-role="new-eng-no-membre"]')) state.newEngNoMembre = t.value;
    else if (bib.input(t)) return;
    // Pas de render() ici : re-dessiner le textarea à chaque frappe renverrait
    // le curseur à la fin.
    else if (t.matches('[data-role="template-text"]')) state.templateEdits[t.getAttribute('data-cle')] = t.value;
    else if (t.matches('[data-role="theme-field"]')) state.themeDraft[t.getAttribute('data-key')] = t.value;
    else if (t.matches('[data-role="theme-color"]')) {
      // Le sélecteur de couleur met à jour le champ hexadécimal voisin.
      const k = t.getAttribute('data-key');
      state.themeDraft[k] = t.value.replace('#', '').toUpperCase();
      const champ = t.parentElement && t.parentElement.querySelector('[data-role="theme-field"]');
      if (champ) champ.value = state.themeDraft[k];
    }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-role="template-file"]')) {
      const f = t.files && t.files[0];
      t.value = '';
      if (f) uploadTemplate(f);
      return;
    }
    if (t && t.matches && bib.change(t)) return;
    if (t && t.matches && t.matches('[data-role="mise-en-page-file"]')) {
      const f = t.files && t.files[0];
      t.value = '';
      if (f) uploadMiseEnPage(f);
      return;
    }
    if (t && t.matches && t.matches('[data-role="logo-file"]')) {
      const file = t.files && t.files[0];
      if (file) uploadLogo(file);
    }
  });

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (bib.click(action, btn)) return;
    switch (action) {
      case 'logout':
        doLogout();
        break;
      case 'theme-save':
        saveTheme();
        break;
      case 'mise-en-page-delete':
        deleteMiseEnPage();
        break;
      case 'biblio-open':
        openBibliotheque();
        break;
      case 'biblio-back':
        backToCompany();
        break;
      case 'engineer-role':
        setEngineerRole(btn.getAttribute('data-id'), btn.getAttribute('data-role-cible'));
        break;
      case 'template-toggle': {
        const cle = btn.getAttribute('data-cle');
        state.templateOpenCle = state.templateOpenCle === cle ? null : cle;
        render();
        break;
      }
      case 'template-save':
        saveTemplateSection(btn.getAttribute('data-cle'));
        break;
      case 'template-clear':
        clearTemplateSection(btn.getAttribute('data-cle'));
        break;
      case 'template-reset':
        resetTemplate();
        break;
      case 'new-company-open':
        openNewCompany();
        break;
      case 'new-company-cancel':
        cancelNewCompany();
        break;
      case 'retry-companies':
        loadCompanies();
        break;
      case 'open-company':
        openCompany(btn.getAttribute('data-id'));
        break;
      case 'back-companies':
        backToCompanies();
        break;
      case 'retry-company':
        loadCompanyDetail(state.companyId);
        break;
      case 'edit-name-open':
        openEditName();
        break;
      case 'edit-name-cancel':
        cancelEditName();
        break;
      case 'new-engineer-open':
        openNewEngineer();
        break;
      case 'new-engineer-cancel':
        cancelNewEngineer();
        break;
      case 'dismiss-temp-password':
        dismissTempPassword();
        break;
      case 'copy-temp-password':
        copyTempPassword();
        break;
      default:
        break;
    }
  });
}

initEvents();
boot();
