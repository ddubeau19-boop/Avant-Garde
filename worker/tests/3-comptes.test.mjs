// Comptes : connexion, tentatives limitées, invitation par la firme,
// mot de passe oublié, changement de mot de passe et sessions fermées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, nombreCourriels, lienApres, courrielsApres } from './outils.mjs';
import { MOT_DE_PASSE } from './donnees.mjs';

const connexion = (email, password) => api('/api/auth/login', { methode: 'POST', corps: { email, password } });
const adminA = jeton(IDS.adminA);

test('connexion : bon et mauvais mot de passe, compte désactivé', async () => {
  const ok = await connexion(IDS.courriels.ingA, MOT_DE_PASSE);
  assert.equal(ok.statut, 200);
  assert.equal(ok.json.user.company.id, IDS.firmeA);
  assert.equal((await api('/api/auth/me', { session: ok.json.token })).statut, 200);
  assert.equal((await connexion(IDS.courriels.ingA, 'mauvais')).statut, 401);
  assert.equal((await connexion('personne@nulle.part', 'x')).statut, 401);
  assert.equal((await connexion(IDS.courriels.ingDesactive, MOT_DE_PASSE)).statut, 403);
});

test('huit échecs bloquent l\'adresse, même avec le bon mot de passe', async () => {
  const email = `bloque${Date.now()}@test.ca`;
  const marque = nombreCourriels();
  const invite = await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'À bloquer', email } });
  assert.equal(invite.statut, 201);
  const lien = await lienApres(marque);
  await api(`/api/auth/jeton/${lien}`, { methode: 'POST', corps: { password: 'un mot de passe solide' } });
  for (let i = 0; i < 8; i++) assert.equal((await connexion(email, `faux-${i}`)).statut, 401);
  assert.equal((await connexion(email, 'un mot de passe solide')).statut, 429);
});

test('invitation par l\'administrateur : lien unique, activation, signature', async () => {
  const email = `invite${Date.now()}@test.ca`;
  const marque = nombreCourriels();
  const r = await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'Nouvelle Ingénieure', email, role: 'engineer' } });
  assert.equal(r.statut, 201);
  assert.equal(r.json.envoye, true);
  assert.equal(r.json.membre.invitation_en_attente, true);
  const [courriel] = await courrielsApres(marque);
  assert.match(courriel, /Activer mon compte/);
  const lien = await lienApres(marque);
  // Avant activation, pas de connexion possible.
  assert.equal((await connexion(email, 'nimporte quoi')).statut, 401);
  const info = await api(`/api/auth/jeton/${lien}`);
  assert.equal(info.json.type, 'invitation');
  assert.equal((await api(`/api/auth/jeton/${lien}`, { methode: 'POST', corps: { password: 'court' } })).statut, 400);
  const act = await api(`/api/auth/jeton/${lien}`, { methode: 'POST', corps: { password: 'mot de passe choisi', ordre_professionnel: 'oiq', no_membre: '123' } });
  assert.equal(act.statut, 200);
  assert.equal((await api('/api/auth/me', { session: act.json.token })).statut, 200);
  // Le lien ne sert qu'une fois.
  assert.equal((await api(`/api/auth/jeton/${lien}`)).statut, 404);
  const equipe = (await api(`/api/companies/${IDS.firmeA}/equipe`, { session: adminA })).json.membres;
  const m = equipe.find((x) => x.email === email);
  assert.equal(m.invitation_en_attente, false);
  assert.equal(m.ordre_professionnel, 'OIQ');
  // Adresse déjà prise : refusée.
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'Doublon', email } })).statut, 409);
});

test('mot de passe oublié : même réponse pour tous, lien d\'une heure, anciennes sessions fermées', async () => {
  const email = `oubli${Date.now()}@test.ca`;
  let marque = nombreCourriels();
  await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'Distrait', email } });
  const premier = await api(`/api/auth/jeton/${await lienApres(marque)}`, { methode: 'POST', corps: { password: 'premier mot de passe' } });
  const ancienne = premier.json.token;
  marque = nombreCourriels();
  const existe = await api('/api/auth/oubli', { methode: 'POST', corps: { email } });
  const inconnu = await api('/api/auth/oubli', { methode: 'POST', corps: { email: 'inconnu@nulle.part' } });
  assert.deepEqual(existe.json, inconnu.json);
  const lien = await lienApres(marque);
  // L'adresse inconnue n'a rien reçu : un seul courriel est parti.
  assert.equal((await courrielsApres(marque, { attendus: 2, delai: 1500 })).length, 1);
  assert.equal((await api(`/api/auth/jeton/${lien}`)).json.type, 'reinitialisation');
  assert.equal((await api(`/api/auth/jeton/${lien}`, { methode: 'POST', corps: { password: 'deuxième mot de passe' } })).statut, 200);
  assert.equal((await api('/api/auth/me', { session: ancienne })).statut, 401);
  assert.equal((await connexion(email, 'premier mot de passe')).statut, 401);
  assert.equal((await connexion(email, 'deuxième mot de passe')).statut, 200);
});

test('changer son mot de passe : l\'actuel est exigé, les autres sessions se ferment', async () => {
  const email = `change${Date.now()}@test.ca`;
  const marque = nombreCourriels();
  await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'Prudent', email } });
  const s1 = (await api(`/api/auth/jeton/${await lienApres(marque)}`, { methode: 'POST', corps: { password: 'mot de passe initial' } })).json.token;
  assert.equal((await api('/api/auth/mot-de-passe', { methode: 'POST', session: s1, corps: { actuel: 'faux', nouveau: 'nouveau mot de passe' } })).statut, 400);
  const r = await api('/api/auth/mot-de-passe', { methode: 'POST', session: s1, corps: { actuel: 'mot de passe initial', nouveau: 'nouveau mot de passe' } });
  assert.equal(r.statut, 200);
  assert.equal((await api('/api/auth/me', { session: s1 })).statut, 401);
  assert.equal((await api('/api/auth/me', { session: r.json.token })).statut, 200);
});

test('désactiver un compte ferme ses sessions ; le réactiver rend l\'accès', async () => {
  const email = `depart${Date.now()}@test.ca`;
  const marque = nombreCourriels();
  const inv = await api(`/api/companies/${IDS.firmeA}/equipe`, { methode: 'POST', session: adminA, corps: { name: 'Sur le départ', email } });
  const s = (await api(`/api/auth/jeton/${await lienApres(marque)}`, { methode: 'POST', corps: { password: 'mot de passe du départ' } })).json.token;
  const id = inv.json.membre.id;
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe/${id}`, { methode: 'PATCH', session: adminA, corps: { actif: false } })).statut, 200);
  assert.equal((await api('/api/auth/me', { session: s })).statut, 401);
  assert.equal((await connexion(email, 'mot de passe du départ')).statut, 403);
  await api(`/api/companies/${IDS.firmeA}/equipe/${id}`, { methode: 'PATCH', session: adminA, corps: { actif: true } });
  assert.equal((await connexion(email, 'mot de passe du départ')).statut, 200);
});
