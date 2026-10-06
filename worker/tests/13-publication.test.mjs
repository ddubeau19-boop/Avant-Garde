// Publication au syndicat : date de visite, vérification avant envoi,
// rapport figé à la publication, avis par courriel aux membres du portail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, texteDocx, nombreCourriels, lienApres, courrielsApres } from './outils.mjs';

const adminA = jeton(IDS.adminA), ingB = jeton(IDS.ingB);
const ilYa = (jours) => new Date(Date.now() - jours * 864e5).toISOString().slice(0, 10);
const dateLongue = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function nouveauDossier(nom = 'Publication') {
  const r = await api('/api/dossiers', { methode: 'POST', session: adminA, corps: { dossier_no: `T-PUB-${Date.now()}`, name: nom, units: 8 } });
  assert.equal(r.statut, 201);
  return r.json.id;
}

test('date de visite : validée, jamais dans le futur, effaçable', async () => {
  const id = await nouveauDossier();
  const patch = (v) => api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { date_visite: v } });
  const ok = await patch(ilYa(3));
  assert.equal(ok.statut, 200);
  assert.equal(ok.json.date_visite, ilYa(3));
  assert.equal((await patch('2026-02-30')).statut, 400);
  assert.equal((await patch('12/09/2026')).statut, 400);
  assert.equal((await patch(new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10))).statut, 400);
  assert.equal((await patch(null)).json.date_visite, null);
});

test('bloc de signature : modifiable par son titulaire, ordre reconnu par son sigle', async () => {
  assert.equal((await api('/api/auth/signature', { methode: 'PATCH', session: adminA, corps: { ordre_professionnel: 'XYZ', no_membre: '1' } })).statut, 400);
  const r = await api('/api/auth/signature', { methode: 'PATCH', session: adminA, corps: { title: '', ordre_professionnel: 'oiq', no_membre: '5012345' } });
  assert.equal(r.statut, 200);
  assert.equal((await api('/api/auth/signature', { methode: 'PATCH', corps: { no_membre: '1' } })).statut, 401);
});

test('publier : vérifié, figé, et le syndicat est avisé', async () => {
  const nom = `Le Riverain ${Date.now()}`;
  const id = await nouveauDossier(nom);
  // Sans signature complète, ni date de visite, ni texte confirmé : refusé.
  await api('/api/auth/signature', { methode: 'PATCH', session: adminA, corps: { ordre_professionnel: '', no_membre: '' } });
  const avant = (await api(`/api/dossiers/${id}/publication`, { session: adminA })).json;
  assert.deepEqual(avant.bloquants.map((b) => b.cle).sort(), ['confirmation', 'date_visite', 'signataire']);
  assert.ok(avant.avertissements.some((a) => a.cle === 'membres'));
  const refus = await api(`/api/dossiers/${id}/publier`, { methode: 'POST', session: adminA });
  assert.equal(refus.statut, 409);
  assert.equal(refus.json.verification.bloquants.length, 3);
  // Publier « maintenant » ne contourne pas la vérification par PATCH ; une
  // date passée (étude livrée hors plateforme) reste permise.
  assert.equal((await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { published_at: new Date().toISOString() } })).statut, 400);
  assert.equal((await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { published_at: '2021-05-01T12:00:00Z' } })).statut, 200);
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { published_at: null } });
  // Une autre firme ne voit ni ne publie rien.
  assert.equal((await api(`/api/dossiers/${id}/publication`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${id}/publier`, { methode: 'POST', session: ingB })).statut, 404);

  // On complète : signature, date de visite, textes confirmés.
  await api('/api/auth/signature', { methode: 'PATCH', session: adminA, corps: { title: 'ing.', ordre_professionnel: 'OIQ', no_membre: '5012345' } });
  const visite = ilYa(10);
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { date_visite: visite } });
  const comps = (await api(`/api/dossiers/${id}/components`, { session: adminA })).json.filter((c) => c.actif !== 0);
  for (const c of comps) await api(`/api/components/${c.id}`, { methode: 'PATCH', session: adminA, corps: { confirmed: 1 } });

  // Un membre actif du portail, qui sera avisé.
  const email = `ca${Date.now()}@syndicat.test`;
  let marque = nombreCourriels();
  assert.equal((await api(`/api/dossiers/${id}/portail/membres`, { methode: 'POST', session: adminA, corps: { name: 'Président du CA', email } })).statut, 201);
  const membre = (await api(`/api/auth/jeton/${await lienApres(marque, 'Bonjour Président du CA')}`, { methode: 'POST', corps: { password: 'mot de passe du syndicat' } })).json.token;
  assert.ok(membre);

  const pret = (await api(`/api/dossiers/${id}/publication`, { session: adminA })).json;
  assert.deepEqual(pret.bloquants, []);
  assert.deepEqual(pret.destinataires.map((d) => d.email), [email]);

  marque = nombreCourriels();
  const pub = await api(`/api/dossiers/${id}/publier`, { methode: 'POST', session: adminA });
  assert.equal(pub.statut, 200, pub.texte.slice(0, 300));
  assert.ok(pub.json.dossier.published_at);
  assert.equal(pub.json.avises, 1);
  const avis = await courrielsApres(marque, { contient: nom });
  assert.equal(avis.length, 1);
  assert.match(avis[0], /a publié l'étude du fonds de prévoyance/);

  // La version publiée porte la date de visite et une déclaration complète.
  const fige = await api(`/api/dossiers/${id}/rapport-publie.docx`, { session: adminA, brut: true });
  assert.equal(fige.status, 200);
  const texte = texteDocx(await fige.arrayBuffer());
  assert.ok(texte.some((t) => t === `Date de la visite : ${dateLongue(visite)}`), 'date de visite en 1.6');
  assert.ok(texte.some((t) => t.includes(`La visite des lieux a été effectuée le ${dateLongue(visite)}`)), 'date de visite dans la déclaration');
  assert.ok(!texte.some((t) => /À COMPLÉTER|NOTE À LA RÉVISION/.test(t)), 'aucune mention interne au rapport livré');

  // Figé : ce que le syndicat télécharge ne suit pas les modifications.
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: adminA, corps: { name: 'Nom changé après publication' } });
  const portail = await api(`/api/portail/immeubles/${id}/rapport.docx`, { session: membre, brut: true });
  assert.equal(portail.status, 200);
  const textePortail = texteDocx(await portail.arrayBuffer());
  assert.ok(textePortail.some((t) => t.includes(nom)));
  assert.ok(!textePortail.some((t) => t.includes('Nom changé après publication')));

  const apres = (await api(`/api/dossiers/${id}/publication`, { session: adminA })).json;
  assert.equal(apres.publication.figee, true);
  assert.equal(apres.publication.par, 'Admin A');
});
