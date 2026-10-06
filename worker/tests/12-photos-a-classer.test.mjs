// Photos déposées en lot au bureau, puis rattachées à leur composante.
// Sans clé API, l'IA ne propose rien : chaque photo arrive « à classer ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

async function nouveauDossier() {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-PAC-${Date.now()}`, name: 'Photos en lot', units: 8 } });
  assert.equal(r.statut, 201);
  return r.json.id;
}

function deposer(dossierId, session, nom = 'IMG_0001.jpg', type = 'image/jpeg') {
  const f = new FormData();
  f.append('file', new Blob([JPEG], { type }), nom);
  return api(`/api/dossiers/${dossierId}/photos-a-classer`, { methode: 'POST', session, formulaire: f });
}

test('une photo déposée attend son classement, sans proposition hors IA', async () => {
  const id = await nouveauDossier();
  const r = await deposer(id, ingA);
  assert.equal(r.statut, 201);
  assert.match(r.json.id, /^pac_/);
  assert.equal(r.json.nom_fichier, 'IMG_0001.jpg');
  assert.equal(r.json.suggestion_id, null);
  assert.equal(r.json.sure, false);
  assert.ok(r.json.erreur, "la raison de l'absence de proposition est donnée");
  const liste = await api(`/api/dossiers/${id}/photos-a-classer`, { session: ingA });
  assert.equal(liste.statut, 200);
  assert.equal(liste.json.photos.length, 1);
  assert.ok(liste.json.seuil > 0);
  const fichier = await api(`/api/dossiers/${id}/photos-a-classer/${r.json.id}/fichier`, { session: ingA, brut: true });
  assert.equal(fichier.status, 200);
  assert.deepEqual(Buffer.from(await fichier.arrayBuffer()), JPEG);
});

test("une autre firme ne voit ni ne dépose rien", async () => {
  const id = await nouveauDossier();
  const r = await deposer(id, ingA);
  assert.equal((await deposer(id, ingB)).statut, 404);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${r.json.id}/fichier`, { session: ingB, brut: true })).status, 404);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/classer`, { methode: 'POST', session: ingB, corps: { affectations: [{ id: r.json.id, component_id: 'x' }] } })).statut, 404);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${r.json.id}`, { methode: 'DELETE', session: ingB })).statut, 404);
});

test('seules les images sont acceptées', async () => {
  const id = await nouveauDossier();
  const f = new FormData();
  f.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'devis.pdf');
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer`, { methode: 'POST', session: ingA, formulaire: f })).statut, 400);
});

test('classer rattache la photo à la composante et la retire de la file', async () => {
  const id = await nouveauDossier();
  const [c1, c2] = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json;
  const p1 = (await deposer(id, ingA, 'a.jpg')).json;
  const p2 = (await deposer(id, ingA, 'b.jpg')).json;
  const p3 = (await deposer(id, ingA, 'c.jpg')).json;
  const r = await api(`/api/dossiers/${id}/photos-a-classer/classer`, {
    methode: 'POST', session: ingA,
    corps: { affectations: [{ id: p1.id, component_id: c1.id }, { id: p2.id, component_id: c1.id }, { id: p3.id, component_id: 'cmp_inexistante' }] },
  });
  assert.equal(r.statut, 200);
  assert.equal(r.json.classees.length, 2);
  assert.deepEqual(r.json.refusees.map((x) => x.id), [p3.id]);

  const comp = (await api(`/api/components/${c1.id}`, { session: ingA })).json;
  assert.equal(comp.photos.length, 2);
  assert.deepEqual(comp.photos.map((p) => p.tag).sort(), ['Détail', 'Vue générale']);
  const fichier = await api(`/api/photos/${comp.photos[0].id}/file`, { session: ingA, brut: true });
  assert.equal(fichier.status, 200, 'le fichier suit la photo classée');

  const reste = (await api(`/api/dossiers/${id}/photos-a-classer`, { session: ingA })).json.photos;
  assert.deepEqual(reste.map((p) => p.id), [p3.id]);

  // Une photo déjà classée ne se classe pas deux fois.
  const rejeu = await api(`/api/dossiers/${id}/photos-a-classer/classer`, { methode: 'POST', session: ingA, corps: { affectations: [{ id: p1.id, component_id: c2.id }] } });
  assert.equal(rejeu.json.classees.length, 0);

  const journal = (await api(`/api/dossiers/${id}/journal`, { session: ingA })).json;
  assert.ok(journal.some((e) => e.action === 'photo' && e.composante && e.composante.id === c1.id));
});

test('retirer une photo la supprime de la file', async () => {
  const id = await nouveauDossier();
  const p = (await deposer(id, ingA)).json;
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${p.id}`, { methode: 'DELETE', session: ingA })).statut, 200);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer`, { session: ingA })).json.photos.length, 0);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${p.id}/fichier`, { session: ingA, brut: true })).status, 404);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${p.id}`, { methode: 'DELETE', session: ingA })).statut, 404);
});
