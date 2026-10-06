// ============================================================
// Portail du syndicat — carnet d'entretien en ligne (gratuit)
// ------------------------------------------------------------
// Les membres d'un syndicat (gestionnaire, administrateurs, concierge…)
// voient les tâches d'entretien du mois, celles qui leur sont confiées par
// la firme, les cochent une fois faites et consultent l'état des
// composantes, l'historique et les documents de l'étude.
// ============================================================
const CLE = 'cs_portail_token';
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);

const state = {
  token: null, user: null,
  ecran: 'chargement',     // chargement | connexion | immeubles | immeuble
  erreur: null, occupe: false,
  immeubles: [], immeubleId: params.get('immeuble'),
  donnees: null,           // réponse de /api/portail/immeubles/:id
  onglet: 'mois', filtre: 'moi',
  annee: null, mois: null,
  noteOuverte: null,       // clé de la tâche dont la note est ouverte
  composantes: null, historique: null,
  logoUrl: null,
};
try { state.token = localStorage.getItem(CLE); } catch (e) {}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateCourte = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' }); };
const icones = () => { if (window.lucide) window.lucide.createIcons(); };

async function api(chemin, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(chemin, Object.assign({}, options, { headers }));
  if (res.status === 401) { deconnecter(false); throw new Error('Votre session a expiré. Reconnectez-vous.'); }
  if (options.brut) return res;
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
}

function deconnecter(effacer = true) {
  if (effacer) try { localStorage.removeItem(CLE); } catch (e) {}
  state.token = null; state.user = null; state.donnees = null; state.immeubles = [];
  state.ecran = 'connexion';
  rendre();
}

/* ---------- chargement ---------- */
async function demarrer() {
  if (!state.token) { state.ecran = 'connexion'; rendre(); return; }
  try {
    state.user = await api('/api/auth/me');
    state.immeubles = await api('/api/portail/immeubles');
    if (!state.immeubleId && state.immeubles.length === 1) state.immeubleId = state.immeubles[0].id;
    if (state.immeubleId) await ouvrirImmeuble(state.immeubleId);
    else { state.ecran = 'immeubles'; rendre(); }
  } catch (e) {
    state.erreur = e.message;
    state.ecran = state.token ? 'immeubles' : 'connexion';
    rendre();
  }
}

async function ouvrirImmeuble(id, annee, mois) {
  state.immeubleId = id;
  state.ecran = 'immeuble';
  if (!state.donnees || state.donnees.immeuble.id !== id) { state.donnees = null; state.composantes = null; state.historique = null; rendre(); }
  try {
    const q = annee ? `?annee=${annee}&mois=${mois}` : '';
    state.donnees = await api(`/api/portail/immeubles/${id}${q}`);
    state.annee = state.donnees.periode.annee;
    state.mois = state.donnees.periode.mois;
    // Premier affichage : ses tâches s'il en a, sinon toutes.
    if (!annee && !state.donnees.taches.some((t) => t.responsable_id === state.donnees.moi.id)) state.filtre = 'toutes';
    state.erreur = null;
    history.replaceState(null, '', `?immeuble=${id}`);
    if (state.donnees.firme.hasLogo && !state.logoUrl) chargerLogo(id);
  } catch (e) {
    state.erreur = e.message;
  }
  rendre();
}

async function chargerLogo(id) {
  try {
    const res = await api(`/api/portail/immeubles/${id}/logo`, { brut: true });
    if (res.ok) { state.logoUrl = URL.createObjectURL(await res.blob()); rendre(); }
  } catch (e) {}
}

async function changerMois(delta) {
  let m = state.mois + delta, a = state.annee;
  if (m < 1) { m = 12; a -= 1; }
  if (m > 12) { m = 1; a += 1; }
  state.noteOuverte = null;
  await ouvrirImmeuble(state.immeubleId, a, m);
}

async function basculerTache(cle) {
  const t = state.donnees.taches.find((x) => x.cle === cle);
  if (!t || state.occupe) return;
  state.occupe = true;
  try {
    if (t.fait) {
      if (!confirm('Marquer cette tâche comme non faite ?')) { state.occupe = false; return; }
      await api(`/api/portail/immeubles/${state.immeubleId}/suivi?cle=${encodeURIComponent(cle)}&annee=${state.annee}&mois=${state.mois}`, { method: 'DELETE' });
      t.fait = null;
    } else {
      await api(`/api/portail/immeubles/${state.immeubleId}/suivi`, { method: 'POST', body: JSON.stringify({ cle, annee: state.annee, mois: state.mois }) });
      t.fait = { fait_le: new Date().toISOString(), par: state.user.name, note: '' };
      state.historique = null;
    }
  } catch (e) { alert(e.message); }
  state.occupe = false;
  rendre();
}

async function enregistrerNote(cle) {
  const t = state.donnees.taches.find((x) => x.cle === cle);
  const el = document.getElementById(`note-${cssId(cle)}`);
  if (!t || !el) return;
  const note = el.value.trim();
  try {
    await api(`/api/portail/immeubles/${state.immeubleId}/suivi`, { method: 'POST', body: JSON.stringify({ cle, annee: state.annee, mois: state.mois, note }) });
    t.fait = Object.assign({ fait_le: new Date().toISOString(), par: state.user.name }, t.fait || {}, { note });
    state.noteOuverte = null;
    state.historique = null;
  } catch (e) { alert(e.message); }
  rendre();
}
const cssId = (cle) => cle.replace(/[^a-zA-Z0-9]/g, '_');

async function ouvrirOnglet(onglet) {
  state.onglet = onglet;
  rendre();
  try {
    if (onglet === 'composantes' && !state.composantes) { state.composantes = await api(`/api/portail/immeubles/${state.immeubleId}/composantes`); rendre(); }
    if (onglet === 'historique' && !state.historique) { state.historique = await api(`/api/portail/immeubles/${state.immeubleId}/historique`); rendre(); }
  } catch (e) { state.erreur = e.message; rendre(); }
}

async function telecharger(quoi) {
  const chemin = quoi === 'rapport' ? 'rapport.docx' : 'suivi-entretien.xlsx';
  state.occupe = quoi;
  rendre();
  try {
    const res = await api(`/api/portail/immeubles/${state.immeubleId}/${chemin}`, { brut: true });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Téléchargement impossible.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = ((res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1] || chemin;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) { alert(e.message); }
  state.occupe = false;
  rendre();
}

/* ---------- rendu ---------- */
function rendre() {
  const actif = document.activeElement && document.activeElement.id;
  app.innerHTML = state.ecran === 'connexion' ? connexionHtml()
    : state.ecran === 'chargement' ? `<div class="chargement"><i data-lucide="loader-2" class="spin"></i>Chargement…</div>`
    : state.ecran === 'immeubles' ? immeublesHtml()
    : immeubleHtml();
  icones();
  if (actif) { const el = document.getElementById(actif); if (el) el.focus(); }
}

function connexionHtml() {
  return `<div class="connexion"><form class="carte" id="connexion" novalidate>
    <div class="marque"><img src="../assets/logo-mark.png" alt=""><span>Carnet d'entretien</span></div>
    <h1>Votre immeuble</h1>
    <p class="lead">Les tâches d'entretien du mois, ce qui a été fait et l'état des composantes de votre immeuble.</p>
    <label for="courriel">Courriel</label>
    <input id="courriel" type="email" autocomplete="username" required>
    <label for="mdp">Mot de passe</label>
    <input id="mdp" type="password" autocomplete="current-password" required>
    ${state.erreur ? `<div class="erreur">${esc(state.erreur)}</div>` : ''}
    <button class="bouton" type="submit" ${state.occupe ? 'disabled' : ''}>${state.occupe ? 'Connexion…' : 'Se connecter'}</button>
    <a class="lien" href="/compte/?retour=/portail/">Mot de passe oublié ou première connexion ?</a>
  </form></div>`;
}

function immeublesHtml() {
  return `<div class="page">
    <div class="entete"><div class="firme">Carnet d'entretien</div><div class="moi">${esc(state.user ? state.user.name : '')} · <button data-action="deconnexion">Déconnexion</button></div></div>
    <h1 class="titre-immeuble">Vos immeubles</h1>
    ${state.erreur ? `<div class="erreur">${esc(state.erreur)}</div>` : ''}
    ${state.immeubles.length ? state.immeubles.map((i) => `<button class="choix-immeuble" data-action="immeuble" data-id="${esc(i.id)}"><b>${esc(i.name)}</b><span>${esc([i.address, i.city].filter(Boolean).join(', '))}${i.fonction ? ` · ${esc(i.fonction)}` : ''}${i.firme ? ` · ${esc(i.firme.name)}` : ''}</span></button>`).join('')
      : `<div class="vide">Aucun immeuble n'est encore associé à votre compte. Votre firme d'ingénierie vous enverra une invitation.</div>`}
  </div>`;
}

function immeubleHtml() {
  const d = state.donnees;
  if (!d) return `<div class="page">${state.erreur ? `<div class="erreur">${esc(state.erreur)}</div>` : `<div class="chargement"><i data-lucide="loader-2" class="spin"></i>Chargement…</div>`}</div>`;
  const onglets = [['mois', 'Tâches du mois'], ['composantes', 'Composantes'], ['historique', 'Historique'], ['documents', 'Documents']];
  const corps = state.onglet === 'composantes' ? composantesHtml() : state.onglet === 'historique' ? historiqueHtml() : state.onglet === 'documents' ? documentsHtml() : moisHtml();
  return `<div class="page">
    <div class="entete">
      <div class="firme">${state.logoUrl ? `<img src="${state.logoUrl}" alt="">` : ''}<span>${esc(d.firme.name || '')}</span></div>
      <div class="moi">${esc(d.moi.name)}${d.moi.fonction ? `<br>${esc(d.moi.fonction)}` : ''}<br>${state.immeubles.length > 1 ? '<button data-action="immeubles">Autres immeubles</button> · ' : ''}<button data-action="deconnexion">Déconnexion</button></div>
    </div>
    ${d.moi.apercu ? `<div class="apercu">Aperçu de la firme : c'est ce que voient les membres du syndicat.</div>` : ''}
    <h1 class="titre-immeuble">${esc(d.immeuble.name)}</h1>
    <p class="adresse">${esc([d.immeuble.address, d.immeuble.city].filter(Boolean).join(', '))}</p>
    ${state.erreur ? `<div class="erreur">${esc(state.erreur)}</div>` : ''}
    <div class="onglets">${onglets.map(([k, l]) => `<button class="onglet ${state.onglet === k ? 'actif' : ''}" data-action="onglet" data-val="${k}">${l}</button>`).join('')}</div>
    ${corps}
    <div class="contact">Carnet d'entretien préparé par ${esc(d.firme.name || 'votre firme')}${d.firme.telephone ? ` · ${esc(d.firme.telephone)}` : ''}${d.firme.courriel ? ` · ${esc(d.firme.courriel)}` : ''}</div>
  </div>`;
}

function moisHtml() {
  const d = state.donnees;
  const miennes = d.taches.filter((t) => t.responsable_id === d.moi.id);
  const visibles = state.filtre === 'moi' ? miennes : d.taches;
  const faites = visibles.filter((t) => t.fait).length;
  const groupes = new Map();
  for (const t of visibles) {
    if (!groupes.has(t.element)) groupes.set(t.element, []);
    groupes.get(t.element).push(t);
  }
  const tache = (t) => {
    const ouverte = state.noteOuverte === t.cle;
    return `<div class="tache ${t.fait ? 'faite' : ''} ${t.responsable_id === d.moi.id ? 'mienne' : ''}">
      <button class="case" data-action="basculer" data-cle="${esc(t.cle)}" aria-label="${t.fait ? 'Marquer non faite' : 'Marquer faite'}">${t.fait ? '<i data-lucide="check"></i>' : ''}</button>
      <div class="t-corps">
        <div class="t-texte">${esc(t.texte)}</div>
        <div class="t-meta">${esc(t.frequence)}${t.responsable_nom ? ` · <b>${esc(t.responsable_nom)}</b>` : ' · <span class="sans">Sans responsable</span>'}${t.responsable && !t.responsable_nom ? ` · prévu : ${esc(t.responsable)}` : ''}</div>
        ${t.fait ? `<div class="t-fait">Fait${t.fait.par ? ` par ${esc(t.fait.par)}` : ''}${t.fait.fait_le ? `, le ${dateCourte(t.fait.fait_le)}` : ''}</div>` : ''}
        ${t.fait && t.fait.note && !ouverte ? `<div class="t-note">${esc(t.fait.note)}</div>` : ''}
        ${ouverte ? `<div class="note-form"><textarea id="note-${cssId(t.cle)}" placeholder="Ex. : fait par l'entrepreneur X, facture no 1234, prochain passage en octobre…">${esc(t.fait ? t.fait.note : '')}</textarea>
          <div class="rangee"><button class="bouton petit" data-action="note-ok" data-cle="${esc(t.cle)}">${t.fait ? 'Enregistrer' : 'Marquer faite avec cette note'}</button><button class="bouton petit clair" data-action="note-annuler">Annuler</button></div></div>`
          : `<button class="t-action" data-action="note" data-cle="${esc(t.cle)}">${t.fait && t.fait.note ? 'Modifier la note' : 'Ajouter une note'}</button>`}
      </div>
    </div>`;
  };
  return `
    <div class="mois-nav">
      <button data-action="mois" data-val="-1" aria-label="Mois précédent"><i data-lucide="chevron-left"></i></button>
      <div class="mois-libelle">${esc(d.periode.libelle)}<small>${faites} sur ${visibles.length} tâche${visibles.length > 1 ? 's' : ''} faite${faites > 1 ? 's' : ''}</small></div>
      <button data-action="mois" data-val="1" aria-label="Mois suivant"><i data-lucide="chevron-right"></i></button>
    </div>
    <div class="progression"><div style="width:${visibles.length ? Math.round((faites / visibles.length) * 100) : 0}%"></div></div>
    <div class="filtres">
      <button class="onglet ${state.filtre === 'moi' ? 'actif' : ''}" data-action="filtre" data-val="moi">Mes tâches · ${miennes.length}</button>
      <button class="onglet ${state.filtre === 'toutes' ? 'actif' : ''}" data-action="filtre" data-val="toutes">Toutes · ${d.taches.length}</button>
    </div>
    ${visibles.length ? [...groupes.entries()].map(([el, ts]) => `<div class="groupe-titre">${esc(el)}</div>${ts.map(tache).join('')}`).join('')
      : `<div class="vide">${state.filtre === 'moi' ? 'Aucune tâche ne vous est confiée ce mois-ci.' : 'Aucune tâche prévue ce mois-ci.'}</div>`}
    ${d.consignes.length ? `<div class="consignes"><b>En tout temps</b>${d.consignes.map((t) => `<div>${esc(t.texte)}</div>`).join('')}</div>` : ''}`;
}

function composantesHtml() {
  if (!state.composantes) return `<div class="chargement"><i data-lucide="loader-2" class="spin"></i>Chargement…</div>`;
  const couleur = { 1: ['#E6F2EB', '#1F8A4E'], 2: ['#EFEFEF', '#1F1F1F'], 3: ['#FFE4DB', '#C2410C'], 4: ['#FFE4DB', '#E8492A'] };
  const annee = new Date().getFullYear();
  return state.composantes.map((c) => {
    const [bg, fg] = couleur[c.rating] || ['#EFEFEF', '#6B6B6B'];
    const rempl = c.remplacement ? (c.remplacement <= annee ? `Remplacement prévu : ${c.remplacement} (échu)` : `Remplacement prévu : ${c.remplacement}`) : '';
    return `<div class="ligne"><div><div>${esc(c.name)}</div><div class="sous">${esc(c.categorie)}${rempl ? ` · ${rempl}` : ''}</div></div>${c.cote ? `<span class="pastille" style="background:${bg};color:${fg}">${esc(c.cote)}</span>` : ''}</div>`;
  }).join('') || `<div class="vide">Aucune composante.</div>`;
}

function historiqueHtml() {
  if (!state.historique) return `<div class="chargement"><i data-lucide="loader-2" class="spin"></i>Chargement…</div>`;
  if (!state.historique.length) return `<div class="vide">Rien n'a encore été coché. Chaque tâche cochée s'ajoute ici : c'est l'historique d'entretien de l'immeuble.</div>`;
  return state.historique.map((h) => `<div class="ligne"><div><div>${esc(h.texte)}</div><div class="sous">${esc(h.element)} · ${esc(h.periode)} · fait${h.par ? ` par ${esc(h.par)}` : ''} le ${dateCourte(h.fait_le)}</div>${h.note ? `<div class="t-note">${esc(h.note)}</div>` : ''}</div></div>`).join('');
}

function documentsHtml() {
  const d = state.donnees;
  return `<div class="docs">
    <button class="doc" data-action="telecharger" data-val="suivi"><i data-lucide="${state.occupe === 'suivi' ? 'loader-2' : 'calendar-check'}" class="${state.occupe === 'suivi' ? 'spin' : ''}"></i><span>Tableur de suivi d'entretien<small>Excel · toutes les tâches, saison par saison</small></span><i data-lucide="download"></i></button>
    ${d.immeuble.rapport ? `<button class="doc" data-action="telecharger" data-val="rapport"><i data-lucide="${state.occupe === 'rapport' ? 'loader-2' : 'file-text'}" class="${state.occupe === 'rapport' ? 'spin' : ''}"></i><span>Étude du fonds de prévoyance<small>Word · dossier ${esc(d.immeuble.dossier_no || '')}</small></span><i data-lucide="download"></i></button>`
      : `<div class="vide">L'étude du fonds de prévoyance sera disponible ici une fois publiée par ${esc(d.firme.name || 'votre firme')}.</div>`}
  </div>`;
}

/* ---------- événements ---------- */
app.addEventListener('submit', async (e) => {
  if (e.target.id !== 'connexion') return;
  e.preventDefault();
  const email = document.getElementById('courriel').value.trim();
  const password = document.getElementById('mdp').value;
  state.occupe = true; state.erreur = null; rendre();
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = r.token;
    try { localStorage.setItem(CLE, r.token); } catch (err) {}
    state.occupe = false;
    await demarrer();
  } catch (err) {
    state.occupe = false; state.erreur = err.message; rendre();
  }
});
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const v = b.dataset.val;
  switch (b.dataset.action) {
    case 'deconnexion': deconnecter(); break;
    case 'immeubles': state.ecran = 'immeubles'; state.donnees = null; state.logoUrl = null; history.replaceState(null, '', location.pathname); rendre(); break;
    case 'immeuble': ouvrirImmeuble(b.dataset.id); break;
    case 'onglet': ouvrirOnglet(v); break;
    case 'filtre': state.filtre = v; rendre(); break;
    case 'mois': changerMois(Number(v)); break;
    case 'basculer': basculerTache(b.dataset.cle); break;
    case 'note': state.noteOuverte = b.dataset.cle; rendre(); { const el = document.getElementById(`note-${cssId(b.dataset.cle)}`); if (el) el.focus(); } break;
    case 'note-annuler': state.noteOuverte = null; rendre(); break;
    case 'note-ok': enregistrerNote(b.dataset.cle); break;
    case 'telecharger': telecharger(v); break;
  }
});

demarrer();
