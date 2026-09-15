// ============================================================
// Console Bureau — Condo Stratégis
// Vanilla-JS SPA, no build step. Talks to the real `vigies` API.
// ============================================================

const TOKEN_KEY = 'cs_bureau_token';

const CAT_ORDER = ['toiture', 'enveloppe', 'structure', 'meca', 'elec', 'amenage', 'securite'];
const CATS = { toiture: 'Toiture', enveloppe: 'Enveloppe', structure: 'Structure', meca: 'Mécanique', elec: 'Électricité', amenage: 'Aménagement', securite: 'Sécurité' };
const CAT_ICON = { toiture: 'triangle', enveloppe: 'layout-grid', structure: 'layers', meca: 'settings-2', elec: 'zap', amenage: 'trees', securite: 'shield-alert' };

const ETAT_LABELS = ['Excellent', 'Bon', 'Moyen', 'Mauvais', 'Critique'];
const ETAT_COLORS = [
  { bg: '#E6F2EB', c: '#1F8A4E' }, // 0 Excellent
  { bg: '#EFEFEF', c: '#1F1F1F' }, // 1 Bon
  { bg: '#F1F1F1', c: '#6B6B6B' }, // 2 Moyen
  { bg: '#FFE4DB', c: '#FF8466' }, // 3 Mauvais
  { bg: '#FFE4DB', c: '#E8492A' }, // 4 Critique
];
const ETAT_TEXT = { Excellent: 'en excellent état', Bon: 'en bon état', Moyen: 'dans un état moyen', Mauvais: 'dans un état dégradé', Critique: 'en condition critique' };

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
  saveStatus: 'idle', // idle | saving | saved | error

  reviewIdx: 0,
  reviewPhotos: [],
  reviewPhotosLoading: false,
  reviewObjectUrls: [],

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
function groupedComponents() {
  const byCat = {};
  CAT_ORDER.forEach(k => byCat[k] = []);
  const extra = {};
  state.components.forEach(c => {
    if (byCat[c.cat]) byCat[c.cat].push(c);
    else (extra[c.cat] = extra[c.cat] || []).push(c);
  });
  const groups = CAT_ORDER.map(k => ({ key: k, label: CATS[k], icon: CAT_ICON[k], rows: byCat[k] })).filter(g => g.rows.length > 0);
  Object.keys(extra).forEach(k => groups.push({ key: k, label: k, icon: 'box', rows: extra[k] }));
  return groups;
}
function confirmedCount() { return state.components.filter(c => c.confirmed === 1).length; }
function allConfirmed() { return state.components.length > 0 && state.components.every(c => c.confirmed === 1); }

function genReport(c) {
  const etatLabel = c.etat != null ? ETAT_LABELS[c.etat] : null;
  const etatTxt = ETAT_TEXT[etatLabel] || 'à évaluer';
  const life = c.useful_life_years ? c.useful_life_years + ' ans' : 'à confirmer';
  const resLabel = c.residual != null ? c.residual + ' %' : 'à évaluer';
  const yearLabel = c.install_year != null ? c.install_year : 'à confirmer';
  const secs = [
    { key: 'etat', icon: 'clipboard-check', title: "État de l'actif",
      text: `Selon les observations de la visite terrain, la composante « ${c.name} » se présente ${etatTxt}. Installée en ${yearLabel}, sa vie résiduelle est estimée à ${resLabel}. Aucun carnet d'entretien antérieur n'a été fourni; l'évaluation repose sur l'inspection visuelle et les informations disponibles.` },
    { key: 'duree', icon: 'timer', title: 'Durée de vie et remplacement',
      text: `Le calcul planifie le remplacement de cette composante sur un cycle de ${life}. ` + (c.replacement_cost ? `Le coût de remplacement estimé est de ${fmt(c.replacement_cost)} $ et est inclus au calcul du fonds de prévoyance.` : `Le coût de remplacement reste à préciser afin d'être intégré au calcul.`) },
    { key: 'entretien', icon: 'wrench', title: "Commentaires d'entretien",
      text: `Un entretien préventif régulier est recommandé afin d'atteindre la durée de vie utile prévue. Il est suggéré de planifier une inspection périodique et de consigner les interventions au carnet d'entretien; se référer au tableur de suivi pour la planification annuelle.` },
  ];
  if (etatLabel === 'Mauvais' || etatLabel === 'Critique') {
    secs.push({
      key: 'attention', warn: true, icon: 'alert-triangle', title: 'Attention spéciale',
      text: `Cependant, nous avons aussi remarqué des situations qui nécessitent un entretien devancé :`,
      bullets: [
        `Des signes d'usure ou de dégradation localisés sont présents sur « ${c.name} » à plusieurs endroits.`,
        `L'élément est en perte d'adhérence / de performance par rapport à son état d'origine.`,
        `Des correctifs ponctuels sont à prévoir à court terme pour éviter une détérioration accélérée.`,
      ],
      close: `En suivi des observations ci-dessus, nous suggérons des visites de services dans les meilleurs délais. Sur place, le professionnel ou le spécialiste pourra suggérer les correctifs appropriés.`,
    });
  } else {
    secs.push({
      key: 'attention', warn: false, icon: 'shield-check', title: 'Attention spéciale',
      text: `Aucune situation particulière nécessitant une intervention devancée n'a été relevée sur cette composante lors de la visite. Un suivi selon le calendrier d'entretien régulier est suffisant.`,
    });
  }
  return secs;
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
  } catch (e) {
    state.loginLoading = false;
    state.loginError = e.message || 'Erreur de connexion.';
    state.loginPassword = '';
    render();
  }
}

function doLogout() {
  revokeReviewPhotos();
  state.token = null;
  state.user = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  state.screen = 'login';
  state.dossiers = [];
  state.dossier = null;
  state.components = [];
  state.projection = null;
  state.dossierId = null;
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

async function patchComponent(id, body, opts) {
  opts = opts || {};
  state.saveStatus = 'saving';
  render();
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

async function onSoldeBlur(value) {
  const n = parseNum(value);
  if (n === null) { render(); return; }
  if (state.dossier && n === state.dossier.current_fund_balance) { render(); return; }
  state.saveStatus = 'saving';
  render();
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
  loadReviewPhotosForCurrent();
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

function rvGoTo(idx) {
  const list = orderedComponents();
  state.reviewIdx = Math.max(0, Math.min(idx, list.length));
  loadReviewPhotosForCurrent();
}
function rvPrev() { if (state.reviewIdx > 0) rvGoTo(state.reviewIdx - 1); }
function rvSkip() { rvGoTo(state.reviewIdx + 1); }

async function rvConfirm() {
  const list = orderedComponents();
  const comp = list[state.reviewIdx];
  if (!comp) return;
  const body = { confirmed: 1 };
  const cardEl = document.querySelector('.rvia-card');
  if (cardEl) {
    const parts = [];
    cardEl.querySelectorAll('[data-sec-text]').forEach(el => {
      const title = el.getAttribute('data-sec-title') || '';
      parts.push((title ? title + '\n' : '') + el.textContent.trim());
    });
    const bulletEls = cardEl.querySelectorAll('[data-bullet-text]');
    if (bulletEls.length) {
      parts.push(Array.prototype.map.call(bulletEls, el => '- ' + el.textContent.trim()).join('\n'));
    }
    const closeEl = cardEl.querySelector('[data-sec-close]');
    if (closeEl && closeEl.textContent.trim()) parts.push(closeEl.textContent.trim());
    body.note = parts.join('\n\n');
  }
  state.saveStatus = 'saving';
  render();
  try {
    await apiJson(`/api/components/${comp.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    state.components = state.components.map(c => String(c.id) === String(comp.id) ? Object.assign({}, c, body) : c);
    state.saveStatus = 'saved';
  } catch (e) {
    state.saveStatus = 'error';
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
        <div class="login-forgot">Mot de passe oublié ?</div>
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
    <div class="rail-brand"><img src="../assets/logo-mark.png" alt=""><span>Condo<br>Strat<span style="color:var(--orange)">é</span>gis</span></div>
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
  const annual = proj ? fmt(proj.annualCotisation) + ' $' : '—';
  const monthlyTotal = proj ? fmt(proj.monthlyCotisation) + ' $' : '—';
  const perUnit = proj && proj.monthlyCotisationPerUnit != null ? fmt(proj.monthlyCotisationPerUnit) + ' $' : '—';
  const soldeVal = d.current_fund_balance != null ? fmt(d.current_fund_balance) : '0';
  const methoTags = [
    { label: 'Inflation', val: params.inflationRate != null ? Math.round(params.inflationRate * 1000) / 10 : '—', unit: '%' },
    { label: 'Rendement', val: params.fundReturnRate != null ? Math.round(params.fundReturnRate * 1000) / 10 : '—', unit: '%' },
    { label: 'Contingence', val: params.contingencyRate != null ? Math.round(params.contingencyRate * 1000) / 10 : '—', unit: '%' },
    { label: 'Horizon', val: horizon, unit: ' ans' },
  ];
  return `
  <div class="fund-card">
    <div class="fund-top">
      <div style="flex:1">
        <div class="fund-top-eyebrow">Cotisation annuelle requise · ${horizon} ans</div>
        <div class="fund-total">${annual}</div>
      </div>
      <div class="fund-side">
        <div class="fund-side-label">Cotisation</div>
        <div class="fund-side-val">${perUnit}</div>
        <div class="fund-side-unit">/mois/unité</div>
      </div>
    </div>
    <div class="fund-body">
      <div class="fund-stats-row">
        <div><div class="fund-stat-label">Cotisation mensuelle totale</div><div class="fund-stat-val">${monthlyTotal}</div></div>
        <div><div class="fund-stat-label">Solde actuel du fonds</div>
          <div class="solde-box"><input type="text" inputmode="numeric" data-role="solde-input" value="${soldeVal}"><span>$</span></div>
        </div>
      </div>
      ${excluded.length > 0 ? `
      <div class="excluded-banner">
        <div class="excluded-banner-head"><i data-lucide="alert-triangle"></i><span>${excluded.length} composante(s) exclue(s) du calcul — le fonds requis est sous-estimé.</span></div>
        <ul class="excluded-list">${excluded.map(e => `<li>${escapeHtml(e.name || 'Composante')} — ${escapeHtml(e.reason || 'raison inconnue')}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="metho-section">
        <div class="metho-label">Méthodologie · valeurs fixes du calcul</div>
        <div class="metho-row">
          ${methoTags.map(m => `<div class="metho-tag"><div class="metho-tag-label">${m.label}</div><div class="metho-tag-val">${m.val}<span>${m.unit}</span></div></div>`).join('')}
        </div>
      </div>
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

function compRowHtml(c, excluded) {
  const etatIdx = c.etat != null ? c.etat : null;
  const ec = etatIdx != null ? ETAT_COLORS[etatIdx] : { bg: '#F1F1F1', c: '#9A9A9A' };
  const noCost = c.replacement_cost == null;
  const noLife = c.useful_life_years == null;
  const excInfo = excluded.find(e => String(e.id) === String(c.id));
  const isExcluded = !!excInfo;
  const resNum = c.residual != null ? c.residual : null;
  const resColor = resNum == null ? 'var(--ink-400)' : resNum < 20 ? 'var(--accent-press)' : resNum < 40 ? 'var(--orange)' : 'var(--ink-700)';
  return `
  <div class="comp-grid comp-row">
    <div class="comp-inc" title="${isExcluded ? escapeHtml('Exclue du calcul : ' + (excInfo.reason || '')) : 'Incluse au calcul'}">
      <i data-lucide="${isExcluded ? 'square' : 'check-square'}" style="width:16px;height:16px;color:${isExcluded ? 'var(--ink-300)' : 'var(--green)'}"></i>
    </div>
    <div class="comp-cell comp-name">${escapeHtml(c.name || '—')}</div>
    <div class="comp-select-wrap">
      <select class="select-etat" data-role="etat-select" data-id="${c.id}" style="background-color:${ec.bg};color:${ec.c}">
        ${ETAT_LABELS.map((lbl, i) => `<option value="${i}" ${i === etatIdx ? 'selected' : ''}>${lbl}</option>`).join('')}
        ${etatIdx == null ? `<option value="" selected>—</option>` : ''}
      </select>
    </div>
    <div class="comp-cell mono right bordered" style="color:${resColor};font-weight:600">${resNum != null ? resNum + ' %' : '—'}</div>
    <div class="comp-cell mono right bordered editable" contenteditable="true" data-role="year-cell" data-id="${c.id}">${c.install_year != null ? c.install_year : ''}</div>
    <div class="comp-cell mono right bordered editable" contenteditable="true" data-role="cost-cell" data-id="${c.id}" style="color:${noCost ? 'var(--orange)' : 'var(--ink-800)'};font-weight:600">${noCost ? 'à compléter' : fmt(c.replacement_cost) + ' $'}</div>
    <div class="comp-cell mono right bordered editable" contenteditable="true" data-role="life-cell" data-id="${c.id}" style="color:${noLife ? 'var(--orange)' : 'var(--ink-700)'}">${noLife ? 'à compléter' : c.useful_life_years + ' ans'}</div>
    <div class="comp-photo-cell"><i data-lucide="${c.photos > 0 ? 'image' : 'camera-off'}" style="width:14px;height:14px;color:${c.photos > 0 ? 'var(--ink-600)' : 'var(--ink-300)'}"></i><span>${c.photos || 0}</span></div>
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

      <div class="comp-section-head">
        <span class="lbl">Composantes · ${docCount}/${total} documentées</span>
        <div class="rule"></div>
        <span class="hint">Édition directe des cellules</span>
      </div>

      <div class="comp-table">
        <div class="comp-grid comp-thead">
          <div class="comp-th" style="text-align:center"><i data-lucide="check" style="width:12px;height:12px"></i></div>
          <div class="comp-th">Composante</div>
          <div class="comp-th">État</div>
          <div class="comp-th" style="text-align:right">Vie rés.</div>
          <div class="comp-th" style="text-align:right">Année</div>
          <div class="comp-th" style="text-align:right">Coût remplac.</div>
          <div class="comp-th" style="text-align:right">Vie utile</div>
          <div class="comp-th" style="text-align:center">Photos</div>
        </div>
        ${groups.length === 0 ? `<div class="empty-state">Aucune composante pour ce dossier.</div>` : groups.map(g => `
          <div>
            <div class="comp-group-head"><i data-lucide="${g.icon}"></i><span>${escapeHtml(g.label)}</span></div>
            ${g.rows.map(c => compRowHtml(c, excluded)).join('')}
          </div>`).join('')}
      </div>
      <div class="comp-legend">
        <span><span class="legend-dot"></span>Coût ou durée à compléter (souvent manquant du terrain)</span>
        <span><i data-lucide="camera-off" style="width:13px;height:13px"></i>Aucune photo</span>
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
    const etatIdx = c.etat != null ? c.etat : null;
    const etatLabel = etatIdx != null ? ETAT_LABELS[etatIdx] : '—';
    const ec = etatIdx != null ? ETAT_COLORS[etatIdx] : { bg: '#F1F1F1', c: '#9A9A9A' };
    const conf = c.confirmed === 1;
    const last = idx >= total - 1;
    const costLife = (c.replacement_cost ? fmt(c.replacement_cost) + ' $' : 'à compléter') + ' · ' + (c.useful_life_years ? c.useful_life_years + ' ans' : '—');
    const sections = genReport(c);
    const photosLoading = state.reviewPhotosLoading;
    const photos = state.reviewPhotos;

    inner = `
    <div class="rvia-card-outer">
      <div class="rvia-card">
        <div class="rvia-card-head">
          <div>
            <div class="rvia-card-eyebrow"><i data-lucide="${CAT_ICON[c.cat] || 'box'}"></i><span>${escapeHtml(CATS[c.cat] || c.cat || '')}</span><span>#${escapeHtml(String(c.id))}</span></div>
            <h2 class="rvia-card-title">${escapeHtml(c.name || '—')}</h2>
          </div>
          <span class="rvia-status-badge" style="background:${conf ? 'var(--green-wash)' : 'var(--orange-wash)'};color:${conf ? 'var(--green)' : 'var(--accent-press)'}"><i data-lucide="${conf ? 'check' : 'pencil'}" style="width:13px;height:13px"></i>${conf ? 'Confirmée' : 'À réviser'}</span>
        </div>
        <div class="rvia-body">
          <div class="rvia-photos-col cscr">
            <div class="rvia-photos-eyebrow">Photos (${photosLoading ? '…' : photos.length})</div>
            ${photosLoading ? spinnerBlock('Chargement des photos…') : (photos.length > 0 ? `
            <div class="rvia-photos-grid">
              ${photos.map(p => `<div class="rvia-photo"><img src="${p.url}" alt=""><div class="rvia-photo-tag">${escapeHtml(p.tag)}</div></div>`).join('')}
            </div>` : `
            <div class="rvia-no-photos"><i data-lucide="camera-off" style="width:22px;height:22px"></i><div>Aucune photo au dossier</div></div>`)}
            <div class="rvia-meta">
              <div class="rvia-meta-row"><span class="k">État terrain</span><span class="v pill" style="background:${ec.bg};color:${ec.c}">${etatLabel}</span></div>
              <div class="rvia-meta-row"><span class="k">Vie résiduelle</span><span class="v">${c.residual != null ? c.residual + ' %' : '—'}</span></div>
              <div class="rvia-meta-row"><span class="k">Coût / vie utile</span><span class="v">${costLife}</span></div>
            </div>
          </div>
          <div class="rvia-sections-col cscr">
            <div class="rvia-hint"><i data-lucide="pencil"></i><span>Cliquez dans un paragraphe pour corriger le texte</span></div>
            ${sections.map(sec => `
            <div class="rvia-section">
              <div class="rvia-section-head" style="color:${sec.warn ? 'var(--accent-press)' : 'var(--orange)'}"><i data-lucide="${sec.icon}"></i><span>${escapeHtml(sec.title)}</span></div>
              <p class="rvia-section-text" contenteditable="true" data-sec-text data-sec-title="${escapeHtml(sec.title)}">${escapeHtml(sec.text)}</p>
              ${sec.bullets && sec.bullets.length ? `
              <div class="rvia-bullets-box">
                ${sec.bullets.map(b => `<div class="rvia-bullet"><i data-lucide="alert-triangle"></i><span contenteditable="true" data-bullet-text>${escapeHtml(b)}</span></div>`).join('')}
                <p class="rvia-close-text" contenteditable="true" data-sec-close>${escapeHtml(sec.close || '')}</p>
              </div>` : ''}
            </div>`).join('')}
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

  app.addEventListener('change', (e) => {
    const sel = e.target.closest && e.target.closest('[data-role="etat-select"]');
    if (sel) {
      const val = sel.value;
      if (val === '') return;
      patchComponent(sel.getAttribute('data-id'), { etat: parseInt(val, 10) });
    }
  });

  // focusout bubbles (unlike blur), so a single delegated listener works for
  // the solde input and the contenteditable table cells.
  app.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-role="solde-input"]')) { onSoldeBlur(t.value); return; }
    if (t.matches('[data-role="cost-cell"]')) { patchComponent(t.getAttribute('data-id'), { replacement_cost: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="life-cell"]')) { patchComponent(t.getAttribute('data-id'), { useful_life_years: parseNum(t.textContent) }, { refetchProjection: true }); return; }
    if (t.matches('[data-role="year-cell"]')) { patchComponent(t.getAttribute('data-id'), { install_year: parseNum(t.textContent) }); return; }
  }, true);
}

initEvents();
boot();
