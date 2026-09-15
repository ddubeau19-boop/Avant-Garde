// Condo Stratégis — Inspection terrain (mobile field app)
// Vanilla JS SPA, no build step. Wires the "Inspection Terrain" mockup screens
// to the real /api/* backend described in api-contract.md.

const TOKEN_KEY = 'cs_terrain_token';

const CATS = {
  toiture:   { label: 'Toiture',      icon: 'triangle' },
  enveloppe: { label: 'Enveloppe',    icon: 'layout-grid' },
  structure: { label: 'Structure',    icon: 'layers' },
  meca:      { label: 'Mécanique',    icon: 'settings-2' },
  elec:      { label: 'Électricité',  icon: 'zap' },
  amenage:   { label: 'Aménagement',  icon: 'trees' },
  securite:  { label: 'Sécurité',     icon: 'shield-alert' },
};

const ETATS = [
  { label: 'Excellent', short: 'Exc.',  color: '#1F8A4E', bg: '#E6F2EB' },
  { label: 'Bon',       short: 'Bon',   color: '#1F1F1F', bg: '#EFEFEF' },
  { label: 'Moyen',     short: 'Moy.',  color: '#6B6B6B', bg: '#F1F1F1' },
  { label: 'Mauvais',   short: 'Mauv.', color: '#FF8466', bg: '#FFE4DB' },
  { label: 'Critique',  short: 'Crit.', color: '#E8492A', bg: '#FFE4DB' },
];

const fmtCAD = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

const state = {
  screen: 'loading', // loading | login | dossiers | accueil | liste | fiche | synthese
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

  analyzing: false,
  aiResult: null,

  recording: false,
  speechSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  noteDraft: '',

  projection: null,
  projectionLoading: false,
  downloadingDocx: false,
  downloadingXlsx: false,
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

function residualColor(resid) {
  return resid < 20 ? '#E8492A' : resid < 40 ? '#FF8466' : resid < 65 ? '#1F1F1F' : '#1F8A4E';
}

function formatMoneyCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000000) {
    return (n / 1000000).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M$';
  }
  return fmtCAD.format(Math.round(n));
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
  return e.message || 'Une erreur est survenue.';
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
  try {
    res = await fetch(path, Object.assign({}, opts, { headers }));
  } catch (e) {
    throw new Error('Erreur réseau. Vérifiez votre connexion.');
  }
  if (auth && res.status === 401) {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    state.token = null; state.user = null; state.dossier = null; state.dossiers = []; state.components = [];
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
  if (!res.ok) throw new Error((data && data.error) || `Erreur (${res.status})`);
  return data;
}

async function loadCompanyLogo() {
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  const co = state.user && state.user.company;
  if (!co || !co.hasLogo) { render(); return; }
  try {
    const res = await apiFetch(`/api/companies/${co.id}/logo`);
    if (!res.ok) throw new Error('logo indisponible');
    const blob = await res.blob();
    state.companyLogoUrl = URL.createObjectURL(blob);
  } catch (e) {
    state.companyLogoUrl = null;
  }
  render();
}

/* ============================================================
   Boot / auth / dossiers
   ============================================================ */

async function boot() {
  if (state.token) {
    state.screen = 'loading';
    render();
    try {
      state.user = await apiJson('/api/auth/me');
      loadCompanyLogo();
      await loadDossiers();
    } catch (e) {
      if (e.message !== 'SESSION_EXPIRED') { state.screen = 'login'; render(); }
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
    loadCompanyLogo();
    await loadDossiers();
  } catch (e) {
    state.loginError = friendlyError(e);
    state.loginPassword = '';
  } finally {
    state.loginLoading = false; render();
  }
}

function logout() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  if (state.companyLogoUrl) { URL.revokeObjectURL(state.companyLogoUrl); state.companyLogoUrl = null; }
  Object.assign(state, {
    token: null, user: null, dossier: null, dossiers: [], components: [],
    activeComponent: null, activeId: null, projection: null, error: null,
    loginError: null, screen: 'login',
  });
  render();
}

async function loadDossiers() {
  state.screen = 'loading'; state.error = null; render();
  try {
    const dossiers = await apiJson('/api/dossiers');
    state.dossiers = dossiers;
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

async function selectDossier(id) {
  state.screen = 'loading'; render();
  try {
    const [dossier, components] = await Promise.all([
      apiJson(`/api/dossiers/${id}`),
      apiJson(`/api/dossiers/${id}/components`),
    ]);
    state.dossier = dossier;
    state.components = components;
    state.filter = 'all'; state.search = '';
    state.screen = 'accueil';
    render();
    loadProjection(id);
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
    state.projection = await apiJson(`/api/dossiers/${id}/projection`);
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
  state.analyzing = false; state.recording = false; state.noteDraft = '';
  state.ficheLoading = true; state.activeComponent = null; state.error = null;
  render();
  try {
    const comp = await apiJson(`/api/components/${id}`);
    state.activeComponent = comp;
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
    try {
      const res = await apiFetch(`/api/photos/${p.id}/file`);
      if (!res.ok) continue;
      const blob = await res.blob();
      state.photoBlobUrls[p.id] = URL.createObjectURL(blob);
      render();
    } catch (e) { /* ignore individual photo failures */ }
  }
}

function applyComponentPatch(id, patch) {
  if (state.activeComponent && state.activeComponent.id === id) {
    state.activeComponent = Object.assign({}, state.activeComponent, patch);
  }
  state.components = state.components.map(c => (c.id === id ? Object.assign({}, c, patch) : c));
}

async function patchComponent(id, patch) {
  try {
    const res = await apiFetch(`/api/components/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `Erreur (${res.status})`);
    const merged = Object.assign({}, patch, (data && typeof data === 'object') ? data : {});
    applyComponentPatch(id, merged);
    return merged;
  } catch (e) {
    if (e.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e); render(); }
    throw e;
  }
}

function onEtatClick(i) {
  if (!state.activeComponent) return;
  if (!state.online) { showToast('Hors connexion : modification non enregistrée.'); return; }
  applyComponentPatch(state.activeId, { etat: i });
  render();
  patchComponent(state.activeId, { etat: i }).catch(() => {});
}

function onResidualInput(e) {
  const val = +e.target.value;
  const valEl = document.getElementById('residualVal');
  if (valEl) { valEl.textContent = val + ' %'; valEl.style.color = residualColor(val); }
}

function onResidualChange(e) {
  const val = +e.target.value;
  if (!state.online) { showToast('Hors connexion : modification non enregistrée.'); render(); return; }
  applyComponentPatch(state.activeId, { residual: val });
  render();
  patchComponent(state.activeId, { residual: val }).catch(() => {});
}

function onYearBlur(e) {
  if (!state.activeComponent) return;
  const v = e.target.value.trim();
  const current = state.activeComponent.install_year != null ? String(state.activeComponent.install_year) : '';
  if (v === current) return;
  let payload;
  if (v === '') payload = null;
  else if (/^\d{4}$/.test(v)) payload = parseInt(v, 10);
  else payload = v;
  if (!state.online) { showToast('Hors connexion : modification non enregistrée.'); render(); return; }
  patchComponent(state.activeId, { install_year: payload }).then(() => render()).catch(() => {});
}

function onQtyBlur(e) {
  if (!state.activeComponent) return;
  const v = e.target.value;
  if (v === (state.activeComponent.qty || '')) return;
  if (!state.online) { showToast('Hors connexion : modification non enregistrée.'); render(); return; }
  patchComponent(state.activeId, { qty: v }).then(() => render()).catch(() => {});
}

/* ---------- photos ---------- */

function triggerPhotoInput() {
  if (!state.online) { showToast('Hors connexion : ajout de photo indisponible.'); return; }
  const input = document.getElementById('photoFileInput');
  if (input) input.click();
}

async function onPhotoFileChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file || !state.activeId) return;
  state.uploadingPhoto = true; state.error = null; render();
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch(`/api/components/${state.activeId}/photos`, { method: 'POST', body: fd });
    let data = null;
    try { data = await res.json(); } catch (e2) {}
    if (!res.ok) throw new Error((data && data.error) || 'Le téléversement de la photo a échoué.');
    if (state.activeComponent) {
      state.activeComponent = Object.assign({}, state.activeComponent, { photos: (state.activeComponent.photos || []).concat([data]) });
    }
    state.components = state.components.map(c => (c.id === state.activeId ? Object.assign({}, c, { photos: (c.photos || 0) + 1 }) : c));
    state.uploadingPhoto = false;
    render();
    loadPhotoBlobs([data]);
  } catch (e2) {
    state.uploadingPhoto = false;
    if (e2.message !== 'SESSION_EXPIRED') { state.error = friendlyError(e2); render(); }
  }
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
  if (typeof v === 'number') return Math.round(v);
  const cleaned = String(v).replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned.replace(/\s/g, '').replace(/,(\d{3})/g, '$1').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n);
}

async function applyAi() {
  if (!state.aiResult || !state.activeId) return;
  if (!state.online) { showToast('Hors connexion : impossible d’appliquer les valeurs.'); return; }
  const r = state.aiResult;
  const patch = {};
  if (typeof r.etat === 'number') patch.etat = r.etat;
  if (typeof r.residual === 'number') patch.residual = r.residual;
  const parsedCost = parseCostEstimate(r.costEstimate);
  if (parsedCost != null) patch.replacement_cost = parsedCost;
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
  if (!state.online) { showToast('Hors connexion : impossible d’envoyer la note.'); return; }
  state.noteDraft = '';
  render();
  submitTranscript(val);
}

async function saveFiche() {
  if (!state.activeId) return;
  if (!state.online) { showToast('Hors connexion : impossible d’enregistrer.'); return; }
  const id = state.activeId;
  applyComponentPatch(id, { done: 1 });
  state.screen = 'liste';
  render();
  try { await patchComponent(id, { done: 1 }); } catch (e) { /* error already surfaced */ }
}

/* ============================================================
   Derived view data
   ============================================================ */

function computeStats() {
  const comps = state.components;
  const total = comps.length;
  const done = comps.filter(c => c.done).length;
  const todo = total - done;
  const critical = comps.filter(c => c.done && c.etat >= 3).length;
  const photosTotal = comps.reduce((a, c) => a + (typeof c.photos === 'number' ? c.photos : (c.photos ? c.photos.length : 0)), 0);
  return { total, done, todo, critical, photosTotal, pct: total ? Math.round((done / total) * 100) : 0 };
}

function filteredComponents() {
  const f = state.filter, q = state.search.trim().toLowerCase();
  return state.components.filter(c => {
    if (f === 'todo' && c.done) return false;
    if (f === 'done' && !c.done) return false;
    if (f === 'crit' && !(c.done && c.etat >= 3)) return false;
    if (q && !String(c.name || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

function rowVals(c) {
  const catInfo = CATS[c.cat] || { label: c.cat, icon: 'box' };
  const thumbIcon = catInfo.icon;
  let statusLabel, statusColor, statusBg, thumbBg, thumbColor, sub;
  const photoCount = typeof c.photos === 'number' ? c.photos : (c.photos ? c.photos.length : 0);
  if (c.done) {
    const e = ETATS[c.etat != null ? c.etat : 1] || ETATS[1];
    statusLabel = e.label; statusColor = e.color; statusBg = e.bg;
    thumbBg = e.bg; thumbColor = e.color;
    sub = (photoCount ? photoCount + ' photo' + (photoCount > 1 ? 's' : '') + ' · ' : '') + 'vie ' + (c.residual != null ? c.residual + '%' : '—');
  } else {
    statusLabel = 'À documenter'; statusColor = 'var(--ink-500)'; statusBg = 'var(--ink-100)';
    thumbBg = 'var(--ink-050)'; thumbColor = 'var(--ink-400)';
    sub = c.qty && c.qty !== '—' ? c.qty : 'À visiter';
  }
  return {
    id: c.id, name: c.name, sub, statusLabel, statusColor, statusBg, thumbBg, thumbColor, thumbIcon,
    aiTag: !!(c.ai_suggested && !c.done),
  };
}

function computeGroups() {
  const fl = filteredComponents();
  return Object.keys(CATS).map(k => {
    const all = state.components.filter(c => c.cat === k);
    const items = fl.filter(c => c.cat === k);
    return {
      key: k, label: CATS[k].label, icon: CATS[k].icon,
      done: all.filter(c => c.done).length, total: all.length,
      items: items.map(rowVals),
    };
  }).filter(g => g.items.length > 0);
}

function computeDecades(projection) {
  if (!projection || !Array.isArray(projection.years) || !projection.years.length) return [];
  const years = projection.years;
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
  const key = kind === 'docx' ? 'downloadingDocx' : 'downloadingXlsx';
  state[key] = true; state.error = null; render();
  try {
    const res = await apiFetch(`/api/dossiers/${state.dossier.id}/report.${kind}`);
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
  let selStart = null, selEnd = null;
  if (activeId && active && typeof active.selectionStart === 'number') {
    selStart = active.selectionStart; selEnd = active.selectionEnd;
  }
  root.innerHTML = screenHtml();
  if (window.lucide) window.lucide.createIcons();
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

function screenHtml() {
  if (state.screen === 'login') return loginHtml() + toastHtml();
  return `<div class="app-shell">${offlineBarHtml()}${errorBannerHtml()}${bodyForScreen()}</div>${toastHtml()}`;
}

function bodyForScreen() {
  switch (state.screen) {
    case 'dossiers': return dossiersHtml();
    case 'accueil': return accueilHtml();
    case 'liste': return listeHtml();
    case 'fiche': return ficheHtml();
    case 'synthese': return syntheseHtml();
    case 'loading':
    default: return loadingHtml();
  }
}

function offlineBarHtml() {
  if (state.online) return '';
  return `<div class="offline-bar"><i data-lucide="wifi-off"></i>Hors connexion — certaines actions sont indisponibles</div>`;
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

function accueilHtml() {
  const d = state.dossier;
  if (!d) return loadingHtml();
  const st = computeStats();
  const facts = [];
  if (d.units) facts.push(`${d.units} unités`);
  if (d.floors) facts.push(`${d.floors} étages`);
  if (d.built_year) facts.push(`construit ${d.built_year}`);
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
      <div class="stat-tile"><div class="num accent">${st.critical}</div><div class="lbl">Critiques</div></div>
      <div class="stat-tile"><div class="num">${st.todo}</div><div class="lbl">À faire</div></div>
    </div>
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

function listeHtml() {
  const st = computeStats();
  const chips = [
    { key: 'all', label: 'Tout', count: st.total },
    { key: 'todo', label: 'À faire', count: st.todo },
    { key: 'done', label: 'Fait', count: st.done },
    { key: 'crit', label: 'Critique', count: st.critical },
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
      <div class="name">${esc(r.name)}</div>
      <div class="sub">${esc(r.sub)}</div>
      ${r.aiTag ? `<div class="ai-tag">Suggéré IA</div>` : ''}
    </div>
    <div class="comp-end"><span class="status-pill" style="background:${r.statusBg};color:${r.statusColor}">${esc(r.statusLabel)}</span></div>
  </button>`;
}

function ficheHtml() {
  if (state.ficheLoading || !state.activeComponent) return `<div class="scr-fiche">${loadingHtml()}</div>`;
  const c = state.activeComponent;
  const catInfo = CATS[c.cat] || { label: c.cat, icon: 'box' };
  const photos = c.photos || [];
  const resid = c.residual != null ? c.residual : 50;
  const residColor = residualColor(resid);
  const etatBtnsHtml = ETATS.map((e, i) => {
    const on = c.etat === i;
    return `<button class="etat-btn" data-action="set-etat" data-etat="${i}" style="border-color:${on ? e.color : 'var(--ink-200)'};background:${on ? e.bg : '#fff'};color:${on ? e.color : 'var(--ink-500)'}">
      <span class="etat-dot" style="background:${e.color}"></span><span>${e.short}</span>
    </button>`;
  }).join('');

  const photoThumbsHtml = photos.map(p => {
    const url = state.photoBlobUrls[p.id];
    return `<div class="photo-thumb ${url ? '' : 'loading'}">${url ? `<img src="${url}" alt="">` : `<i data-lucide="loader-2"></i>`}${url ? `<div class="tag">${esc(p.tag || '')}</div>` : ''}</div>`;
  }).join('');

  const aiCardHtml = state.aiResult ? aiResultHtml(state.aiResult, c) : '';

  const micSection = state.speechSupported ? `
    <button class="mic-btn ${state.recording ? 'rec' : ''}" data-action="toggle-voice" ${!state.online ? 'disabled' : ''}>
      <i data-lucide="mic" class="${state.recording ? 'pulse' : ''}"></i>${state.recording ? 'Écoute… touchez pour arrêter' : 'Dicter une note'}
    </button>` : `
    <div class="note-fallback">
      <textarea id="noteFallbackText" data-role="note-fallback-text" placeholder="Reconnaissance vocale indisponible sur cet appareil. Écrivez votre note ici…">${esc(state.noteDraft)}</textarea>
      <button class="send" data-action="note-fallback-send" ${!state.online ? 'disabled' : ''}>Envoyer la note</button>
    </div>`;

  const noteCard = c.note ? `<div class="note-card"><div class="note-card-hdr"><i data-lucide="sparkles"></i><span>Note structurée</span></div><div class="note-card-body">${esc(c.note)}</div></div>` : '';

  return `
  <div class="scr-fiche">
    <div class="hdr">
      <button class="hdr-back" data-action="go-liste"><i data-lucide="chevron-left"></i>Composantes</button>
      <span class="cat-tag">${esc(catInfo.label)}</span>
      <h2 class="fiche-title">${esc(c.name)}</h2>
    </div>
    <div class="fiche-body">
      <div class="section-lbl">Photos (${photos.length})</div>
      <div class="photo-strip scr">
        <button class="photo-add ${state.uploadingPhoto ? 'uploading' : ''}" data-action="add-photo" ${!state.online ? 'disabled' : ''}>
          <i data-lucide="${state.uploadingPhoto ? 'loader-2' : 'camera'}"></i><span>${state.uploadingPhoto ? 'Envoi…' : 'Photo'}</span>
        </button>
        ${photoThumbsHtml}
      </div>
      <input type="file" accept="image/*" capture="environment" id="photoFileInput" data-role="photo-file-input" style="display:none">

      <button class="btn-analyze" data-action="analyze" ${state.analyzing || !state.online ? 'disabled' : ''}>
        <i data-lucide="${state.analyzing ? 'loader-2' : 'sparkles'}" class="${state.analyzing ? 'spin' : ''}"></i>${state.analyzing ? 'Analyse en cours…' : "Analyser les photos avec l'IA"}
      </button>

      ${aiCardHtml}

      <div class="section-lbl" style="margin-top:22px">État de la composante</div>
      <div class="etat-row">${etatBtnsHtml}</div>

      <div class="residual-row"><span class="section-lbl" style="margin:0">Vie résiduelle</span><span class="residual-val" id="residualVal" style="color:${residColor}">${resid} %</span></div>
      <input type="range" min="0" max="100" value="${resid}" data-role="residual-slider">
      <div class="residual-labels"><span>Fin de vie</span><span>Neuf</span></div>

      <div class="yr-qty-grid">
        <div><label for="yearInput">Année install.</label><input id="yearInput" data-role="year-input" value="${esc(c.install_year != null ? c.install_year : '')}" inputmode="numeric" placeholder="—"></div>
        <div><label for="qtyInput">Quantité</label><input id="qtyInput" data-role="qty-input" value="${esc(c.qty != null ? c.qty : '')}" placeholder="—"></div>
      </div>

      <div class="section-lbl" style="margin-top:22px">Note vocale</div>
      ${micSection}
      ${noteCard}
    </div>
    <div class="fiche-bottom">
      <button class="btn-cta" data-action="save-fiche" ${!state.online ? 'disabled' : ''}><i data-lucide="check"></i>Enregistrer &amp; suivante</button>
    </div>
  </div>`;
}

function aiResultHtml(r, c) {
  const etatObj = typeof r.etat === 'number' ? ETATS[r.etat] : null;
  const conf = r.confidence != null ? (typeof r.confidence === 'number' ? Math.round(r.confidence <= 1 ? r.confidence * 100 : r.confidence) + ' %' : r.confidence) : '';
  return `<div class="ai-card">
    <div class="ai-card-hdr"><i data-lucide="sparkles"></i><span class="lbl">Analyse IA</span>${conf ? `<span class="conf">confiance ${esc(conf)}</span>` : ''}</div>
    <div class="ai-card-body">
      <div class="ai-grid">
        <div><div class="k">Composante</div><div class="v">${esc(c.name)}</div></div>
        <div><div class="k">État estimé</div><div class="v" style="color:${etatObj ? etatObj.color : 'var(--ink)'}">${etatObj ? esc(etatObj.label) : '—'}</div></div>
        <div><div class="k">Vie résiduelle</div><div class="v">${r.life != null ? esc(String(r.life)) : (r.residual != null ? r.residual + ' %' : '—')}</div></div>
        <div><div class="k">Coût remplac.</div><div class="v">${r.costEstimate != null ? esc(String(r.costEstimate)) : (r.cost != null ? esc(String(r.cost)) : '—')}</div></div>
      </div>
      <button class="btn-apply" data-action="apply-ai">Appliquer ces valeurs</button>
    </div>
  </div>`;
}

function syntheseHtml() {
  const st = computeStats();
  const missing = state.components.filter(c => !c.done);
  const missingHtml = missing.map(c => {
    const catInfo = CATS[c.cat] || { label: c.cat, icon: 'box' };
    return `<button class="coverage-item" data-action="open-fiche" data-id="${esc(c.id)}">
      <i data-lucide="${catInfo.icon}"></i>
      <div class="mid"><div class="n">${esc(c.name)}</div><div class="c">${esc(catInfo.label)}</div></div>
      <span class="go">Documenter →</span>
    </button>`;
  }).join('');

  const proj = state.projection;
  const fundAmount = proj ? formatMoneyCompact(proj.totalDeboursProjete) : (state.projectionLoading ? '…' : '—');
  const monthly = proj && proj.monthlyCotisationPerUnit != null ? fmtCAD.format(Math.round(proj.monthlyCotisationPerUnit)) : null;
  const decades = computeDecades(proj);
  const decadesHtml = decades.map(d => `<div class="fund-bar-wrap"><div class="fund-bar" style="height:${d.h};background:${d.color}"></div><span>${d.label}</span></div>`).join('');

  return `
  <div class="scr-synthese">
    <div class="hdr">
      <button class="hdr-back" data-action="go-liste"><i data-lucide="chevron-left"></i>Composantes</button>
      <h2>Synthèse</h2>
    </div>
    <div class="synthese-body">
      <div class="verify-banner"><div class="icon"><i data-lucide="check"></i></div><div class="txt"><b>${st.done} composante${st.done !== 1 ? 's' : ''} documentée${st.done !== 1 ? 's' : ''}</b> sur ${st.total}</div></div>

      ${missing.length ? `
      <div class="coverage-card">
        <div class="coverage-hdr">
          <div class="row"><i data-lucide="alert-triangle"></i><span>Avant de quitter le site</span></div>
          <div class="body">${missing.length} composante${missing.length > 1 ? 's' : ''} non documentée${missing.length > 1 ? 's' : ''}. Vérifiez-les maintenant.</div>
        </div>
        ${missingHtml}
      </div>` : ''}

      <div class="fund-card">
        <div class="lbl">Fonds de prévoyance requis · ${proj ? proj.params.projectionYears : 25} ans</div>
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
    case 'go-liste': state.screen = 'liste'; render(); break;
    case 'go-synth': state.screen = 'synthese'; render(); break;
    case 'open-fiche': openFiche(t.dataset.id); break;
    case 'filter': state.filter = t.dataset.filter; render(); break;
    case 'add-photo': triggerPhotoInput(); break;
    case 'analyze': analyze(); break;
    case 'apply-ai': applyAi(); break;
    case 'set-etat': onEtatClick(+t.dataset.etat); break;
    case 'toggle-voice': toggleVoice(); break;
    case 'note-fallback-send': onNoteFallbackSend(); break;
    case 'save-fiche': saveFiche(); break;
    case 'download-docx': downloadReport('docx'); break;
    case 'download-xlsx': downloadReport('xlsx'); break;
    case 'generate-reports': generateReports(); break;
    case 'dismiss-error': state.error = null; render(); break;
    case 'logout': logout(); break;
  }
}

function onRootInput(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-role="search-input"]')) {
    state.search = t.value;
    render();
  } else if (t.matches && t.matches('[data-role="residual-slider"]')) {
    onResidualInput(e);
  } else if (t.matches && t.matches('[data-role="note-fallback-text"]')) {
    state.noteDraft = t.value;
  } else if (t.matches && t.matches('[data-role="login-email"]')) {
    state.loginEmail = t.value;
  } else if (t.matches && t.matches('[data-role="login-password"]')) {
    state.loginPassword = t.value;
  }
}

function onRootChange(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-role="residual-slider"]')) onResidualChange(e);
  if (t.matches && t.matches('[data-role="photo-file-input"]')) onPhotoFileChange(e);
}

function onRootFocusout(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-role="year-input"]')) onYearBlur(e);
  if (t.matches && t.matches('[data-role="qty-input"]')) onQtyBlur(e);
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
root.addEventListener('submit', onRootSubmit);

window.addEventListener('online', () => { state.online = true; render(); });
window.addEventListener('offline', () => { state.online = false; showToast('Vous êtes hors connexion.'); render(); });

boot();
