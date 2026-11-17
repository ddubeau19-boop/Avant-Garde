// ============================================================
// Mon compte — page publique de la plateforme
// ------------------------------------------------------------
//   ?jeton=…   activer un compte (invitation) ou choisir un nouveau mot de
//              passe (lien « mot de passe oublié »)
//   ?changer=1 changer son mot de passe, connecté (&retour=/bureau/)
//   ?nouvelle-firme       inscrire sa firme
//   ?inscription=…        confirmer l'inscription reçue par courriel
//   (rien)     demander un lien « mot de passe oublié »
// ============================================================
const CLES_SESSION = ['cs_bureau_token', 'cs_terrain_token', 'cs_admin_token', 'cs_portail_token'];
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
let retour = /^\/(bureau|terrain|admin|portail)\/$/.test(params.get('retour') || '') ? params.get('retour') : null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lire = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function page(titre, lead, corps) {
  app.innerHTML = `
    <div class="marque"><img src="../assets/logo-mark.png" alt=""><span>Condo Strat<span class="e">é</span>gis</span></div>
    <h1>${titre}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${corps}`;
}

async function api(chemin, options) {
  const res = await fetch(chemin, options);
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
}

function champsMotDePasse(min) {
  return `
    <label for="mdp">Mot de passe</label>
    <input id="mdp" type="password" autocomplete="new-password" minlength="${min}" required>
    <div class="aide">Au moins ${min} caractères. Une courte phrase se retient mieux qu'un mot compliqué.</div>
    <label for="mdp2">Confirmer le mot de passe</label>
    <input id="mdp2" type="password" autocomplete="new-password" minlength="${min}" required>`;
}
function verifierMotsDePasse(min) {
  const a = document.getElementById('mdp').value;
  const b = document.getElementById('mdp2').value;
  if (a.length < min) return `Le mot de passe doit compter au moins ${min} caractères.`;
  if (a !== b) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}
function afficherErreur(message) {
  let el = document.getElementById('erreur');
  if (!el) { el = document.createElement('div'); el.id = 'erreur'; el.className = 'erreur'; document.querySelector('form').appendChild(el); }
  el.textContent = message;
}

function termine(titre, texte) {
  const libelle = retour === '/terrain/' ? "Ouvrir l'application terrain" : retour === '/portail/' ? "Ouvrir le carnet d'entretien" : 'Ouvrir la console bureau';
  page(titre, texte, `
    <a class="bouton" href="${retour || '/bureau/'}">${libelle}</a>
    ${retour ? '' : `<a class="bouton secondaire" href="/terrain/">Ouvrir l'application terrain</a>`}`);
}

// ---- Lien reçu par courriel -------------------------------------------------
async function viaJeton(jeton) {
  let info;
  try {
    info = await api(`/api/auth/jeton/${encodeURIComponent(jeton)}`);
  } catch (e) {
    page('Lien expiré', esc(e.message), `<a class="bouton" href="./">Recevoir un nouveau lien</a>`);
    return;
  }
  const invitation = info.type === 'invitation';
  const sig = info.signature || {};
  page(
    invitation ? `Bienvenue, ${esc(info.name)}` : 'Nouveau mot de passe',
    invitation
      ? (info.portail
        ? `Activez votre accès au carnet d'entretien de votre immeuble (${esc(info.email)}) en choisissant votre mot de passe.`
        : `Activez votre compte ${esc(info.email)}${info.firme ? ` pour <strong>${esc(info.firme)}</strong>` : ''} en choisissant votre mot de passe.`)
      : `Choisissez un nouveau mot de passe pour ${esc(info.email)}. Vos autres sessions ouvertes seront fermées.`,
    `<form id="f" novalidate>
      ${champsMotDePasse(info.longueur_min)}
      ${invitation && !info.portail ? `
      <div class="section">Bloc de signature, repris à la déclaration du rapport. Vous pourrez le compléter plus tard.</div>
      <label for="titre">Titre</label>
      <input id="titre" type="text" placeholder="ex. ing., M.Sc.A." value="${esc(sig.title || '')}">
      <div class="rangee">
        <div><label for="ordre">Ordre</label><input id="ordre" type="text" placeholder="OIQ, OTPQ…" value="${esc(sig.ordre_professionnel || '')}"></div>
        <div><label for="membre">N° de membre</label><input id="membre" type="text" value="${esc(sig.no_membre || '')}"></div>
      </div>` : ''}
      <button type="submit">${invitation ? 'Activer mon compte' : 'Enregistrer le mot de passe'}</button>
    </form>`);
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const refus = verifierMotsDePasse(info.longueur_min);
    if (refus) { afficherErreur(refus); return; }
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    try {
      const corps = { password: document.getElementById('mdp').value };
      if (invitation && !info.portail) {
        corps.title = document.getElementById('titre').value;
        corps.ordre_professionnel = document.getElementById('ordre').value;
        corps.no_membre = document.getElementById('membre').value;
      }
      const data = await api(`/api/auth/jeton/${encodeURIComponent(jeton)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      // Connecté d'emblée : au portail pour un membre d'un syndicat, sinon
      // dans la console bureau et l'application terrain.
      if (info.portail) {
        ecrire('cs_portail_token', data.token);
        retour = '/portail/';
      } else {
        ecrire('cs_bureau_token', data.token);
        ecrire('cs_terrain_token', data.token);
      }
      history.replaceState(null, '', location.pathname);
      termine(invitation ? 'Compte activé' : 'Mot de passe changé', invitation ? 'Votre compte est prêt. Vous êtes connecté.' : 'Votre nouveau mot de passe est enregistré. Vous êtes connecté.');
    } catch (err) {
      bouton.disabled = false;
      afficherErreur(err.message);
    }
  });
}

// ---- Inscription d'une firme ---------------------------------------------------
async function nouvelleFirme() {
  let etat = { ouverte: true };
  try { etat = await api('/api/auth/inscription'); } catch (e) { /* formulaire quand même */ }
  if (!etat.ouverte) {
    page('Inscriptions fermées', "L'ouverture de nouveaux comptes est suspendue pour l'instant. Écrivez-nous pour ouvrir le compte de votre firme.", `<a class="lien" href="/bureau/">Retour à la connexion</a>`);
    return;
  }
  page('Ouvrir le compte de votre firme', 'Études de fonds de prévoyance, visites sur le terrain, carnets d\'entretien et portail des syndicats. Vous serez l\'administrateur du compte et inviterez ensuite votre équipe.', `
    <form id="f" novalidate>
      <label for="firme">Nom de la firme</label>
      <input id="firme" type="text" autocomplete="organization" required>
      <label for="nom">Votre nom</label>
      <input id="nom" type="text" autocomplete="name" required>
      <label for="courriel">Votre courriel professionnel</label>
      <input id="courriel" type="email" autocomplete="email" required>
      <div class="piege" aria-hidden="true"><label for="site">Site</label><input id="site" type="text" tabindex="-1" autocomplete="off"></div>
      <button type="submit">Recevoir le lien de confirmation</button>
    </form>
    <a class="lien" href="/bureau/">J'ai déjà un compte</a>`);
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    if (!v('firme') || !v('nom')) { afficherErreur('Le nom de la firme et votre nom sont requis.'); return; }
    if (!v('courriel').includes('@')) { afficherErreur('Entrez une adresse courriel valide.'); return; }
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    try {
      const data = await api('/api/auth/inscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firme: v('firme'), nom: v('nom'), email: v('courriel'), site: v('site') }) });
      page('Vérifiez vos courriels', esc(data.message), `<p class="discret">Pensez à regarder dans les courriels indésirables. Aucun compte n'est créé tant que l'adresse n'est pas confirmée.</p>`);
    } catch (err) {
      bouton.disabled = false;
      afficherErreur(err.message);
    }
  });
}

async function confirmerInscription(jeton) {
  let info;
  try {
    info = await api(`/api/auth/inscription/${encodeURIComponent(jeton)}`);
  } catch (e) {
    page('Lien expiré', esc(e.message), `<a class="bouton" href="./?nouvelle-firme=1">Recommencer l'inscription</a>`);
    return;
  }
  page(`Bienvenue, ${esc(info.nom)}`, `Dernière étape pour ouvrir le compte de <strong>${esc(info.firme)}</strong> (${esc(info.email)}) : choisissez votre mot de passe.`, `
    <form id="f" novalidate>
      ${champsMotDePasse(info.longueur_min)}
      <div class="section">Bloc de signature, repris à la déclaration du rapport. Vous pourrez le compléter plus tard.</div>
      <label for="titre">Titre</label>
      <input id="titre" type="text" placeholder="ex. ing., M.Sc.A.">
      <div class="rangee">
        <div><label for="ordre">Ordre</label><input id="ordre" type="text" placeholder="OIQ, OTPQ…"></div>
        <div><label for="membre">N° de membre</label><input id="membre" type="text"></div>
      </div>
      <button type="submit">Ouvrir le compte</button>
    </form>`);
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const refus = verifierMotsDePasse(info.longueur_min);
    if (refus) { afficherErreur(refus); return; }
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    try {
      const data = await api(`/api/auth/inscription/${encodeURIComponent(jeton)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('mdp').value, title: document.getElementById('titre').value, ordre_professionnel: document.getElementById('ordre').value, no_membre: document.getElementById('membre').value }),
      });
      ecrire('cs_bureau_token', data.token);
      ecrire('cs_terrain_token', data.token);
      history.replaceState(null, '', location.pathname);
      termine('Compte ouvert', `Le compte de ${esc(info.firme)} est prêt et vous êtes connecté. Dans la console bureau : invitez votre équipe (Équipe), importez votre liste de composantes (Bibliothèque) et réglez vos rapports (Modèles).`);
    } catch (err) {
      bouton.disabled = false;
      afficherErreur(err.message);
    }
  });
}

// ---- Changer son mot de passe (connecté) ---------------------------------------
function changer() {
  const cle = CLES_SESSION.find((k) => lire(k));
  if (!cle) {
    page('Connexion requise', 'Connectez-vous pour changer votre mot de passe.', `<a class="bouton" href="${retour || '/bureau/'}">Se connecter</a>`);
    return;
  }
  page('Changer mon mot de passe', 'Vos autres sessions ouvertes, sur d\'autres appareils, seront fermées.', `
    <form id="f" novalidate>
      <label for="actuel">Mot de passe actuel</label>
      <input id="actuel" type="password" autocomplete="current-password" required>
      ${champsMotDePasse(10)}
      <button type="submit">Changer le mot de passe</button>
    </form>
    ${retour ? `<a class="lien" href="${retour}">Retour</a>` : ''}`);
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const refus = verifierMotsDePasse(10);
    if (refus) { afficherErreur(refus); return; }
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    try {
      const data = await api('/api/auth/mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lire(cle)}` },
        body: JSON.stringify({ actuel: document.getElementById('actuel').value, nouveau: document.getElementById('mdp').value }),
      });
      // Les anciennes sessions de ce navigateur ne valent plus : on les remplace.
      for (const k of CLES_SESSION) if (lire(k)) ecrire(k, data.token);
      termine('Mot de passe changé', 'Votre nouveau mot de passe est enregistré.');
    } catch (err) {
      bouton.disabled = false;
      afficherErreur(err.message);
    }
  });
}

// ---- Mot de passe oublié -------------------------------------------------------
function oubli() {
  page('Mot de passe oublié', 'Indiquez votre adresse courriel : vous recevrez un lien pour choisir un nouveau mot de passe.', `
    <form id="f" novalidate>
      <label for="courriel">Courriel</label>
      <input id="courriel" type="email" autocomplete="username" required value="${esc(params.get('courriel') || '')}">
      <button type="submit">Recevoir le lien</button>
    </form>
    <a class="lien" href="${retour || '/bureau/'}">Retour à la connexion</a>`);
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const courriel = document.getElementById('courriel').value.trim();
    if (!courriel.includes('@')) { afficherErreur('Entrez une adresse courriel valide.'); return; }
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    try {
      const data = await api('/api/auth/oubli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: courriel }) });
      page('Vérifiez vos courriels', esc(data.message), `<p class="discret">Le lien est valable une heure. Pensez à regarder dans les courriels indésirables.</p><a class="lien" href="${retour || '/bureau/'}">Retour à la connexion</a>`);
    } catch (err) {
      bouton.disabled = false;
      afficherErreur(err.message);
    }
  });
}

if (params.get('jeton')) viaJeton(params.get('jeton'));
else if (params.get('inscription')) confirmerInscription(params.get('inscription'));
else if (params.has('nouvelle-firme')) nouvelleFirme();
else if (params.get('changer')) changer();
else oubli();
