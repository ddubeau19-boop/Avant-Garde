// ============================================================
// Mon compte — page publique de la plateforme
// ------------------------------------------------------------
//   ?jeton=…   activer un compte (invitation) ou choisir un nouveau mot de
//              passe (lien « mot de passe oublié »)
//   ?changer=1 changer son mot de passe, connecté (&retour=/bureau/)
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
else if (params.get('changer')) changer();
else oubli();
