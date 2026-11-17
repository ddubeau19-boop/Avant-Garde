// Inscription autonome d'une firme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, IDS, nombreCourriels, courrielsApres, pause } from './outils.mjs';

const lienInscription = (courriels) => {
  const m = (courriels[courriels.length - 1] || '').match(/inscription=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
};

test('inscription : rien n\'est créé avant la confirmation ; la firme naît avec son administrateur', async () => {
  const email = `fondatrice${Date.now()}@nouvelle-firme.test`;
  const marque = nombreCourriels();
  const r = await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'Génie Horizon inc.', nom: 'Léa Fondatrice', email } });
  assert.equal(r.statut, 200);
  const courriels = await courrielsApres(marque);
  const jeton = lienInscription(courriels);
  assert.ok(jeton, 'lien de confirmation reçu');
  // Pas encore de compte.
  assert.equal((await api('/api/auth/login', { methode: 'POST', corps: { email, password: 'x'.repeat(12) } })).statut, 401);
  const info = await api(`/api/auth/inscription/${jeton}`);
  assert.equal(info.json.firme, 'Génie Horizon inc.');
  assert.equal((await api(`/api/auth/inscription/${jeton}`, { methode: 'POST', corps: { password: 'court' } })).statut, 400);
  const avis = nombreCourriels();
  const ok = await api(`/api/auth/inscription/${jeton}`, { methode: 'POST', corps: { password: 'une phrase de passe solide', title: 'ing.', ordre_professionnel: 'oiq' } });
  assert.equal(ok.statut, 201);
  assert.equal(ok.json.user.role, 'admin');
  assert.equal(ok.json.user.company.name, 'Génie Horizon inc.');
  assert.ok((await courrielsApres(avis)).some((c) => c.includes('Nouvelle firme inscrite')), 'le super admin est averti');
  // Le lien ne sert qu'une fois ; la nouvelle firme est vide et étanche.
  assert.equal((await api(`/api/auth/inscription/${jeton}`, { methode: 'POST', corps: { password: 'une autre phrase solide' } })).statut, 404);
  const session = ok.json.token;
  assert.deepEqual((await api('/api/dossiers', { session })).json, []);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}`, { session })).statut, 404);
  const firme = ok.json.user.company.id;
  assert.equal((await api(`/api/companies/${firme}/equipe`, { session })).statut, 200, 'administrateur de sa firme');
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe`, { session })).statut, 404);
  assert.equal((await api('/api/companies', { session })).statut, 403, 'pas super admin');
});

test('inscription : adresse déjà inscrite, robot, champs manquants, abus', async () => {
  const marque = nombreCourriels();
  const r = await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'Doublon', nom: 'X', email: 'ing@firme-a.test' } });
  assert.equal(r.statut, 200, 'même réponse qu\'une adresse libre');
  const c = await courrielsApres(marque);
  assert.ok(c.some((x) => x.includes('déjà un compte')));
  assert.ok(!lienInscription(c), 'aucun lien d\'inscription pour une adresse prise');
  // Champ piège rempli : réponse normale, aucun courriel.
  const robot = `bot${Date.now()}@x.test`;
  const piege = nombreCourriels();
  assert.equal((await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'Robot', nom: 'Bot', email: robot, site: 'http://spam' } })).statut, 200);
  await pause(800);
  assert.ok(!(await courrielsApres(piege, { attendus: 0, delai: 0 })).some((x) => x.includes('Robot') || x.includes(robot)));
  assert.equal((await api('/api/auth/inscription', { methode: 'POST', corps: { firme: '', nom: 'X', email: 'a@b.test' } })).statut, 400);
  assert.equal((await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'F', nom: 'X', email: 'pas-une-adresse' } })).statut, 400);
  const email = `abus${Date.now()}@x.test`;
  for (let i = 0; i < 3; i++) await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'F', nom: 'X', email } });
  assert.equal((await api('/api/auth/inscription', { methode: 'POST', corps: { firme: 'F', nom: 'X', email } })).statut, 429);
  assert.equal((await api('/api/auth/inscription/jeton-bidon-jeton-bidon-jeton-bidon')).statut, 404);
});
