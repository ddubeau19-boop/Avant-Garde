// Ajout d'une composante trouvée sur place, depuis le terrain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);

async function nouveauDossier() {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-AJ-${Date.now()}`, name: 'Ajouts terrain', units: 10 } });
  assert.equal(r.statut, 201);
  return r.json.id;
}

test('le catalogue de la firme est offert au terrain', async () => {
  const id = await nouveauDossier();
  const r = await api(`/api/dossiers/${id}/catalogue`, { session: ingA });
  assert.equal(r.statut, 200);
  assert.ok(r.json.length > 50);
  assert.ok(r.json.every((x) => x.cat && x.name));
  assert.equal((await api(`/api/dossiers/${id}/catalogue`, { session: ingB })).statut, 404);
});

test('une composante de la bibliothèque garde sa vie utile et son code', async () => {
  const id = await nouveauDossier();
  const modele = (await api(`/api/dossiers/${id}/catalogue`, { session: ingA })).json.find((x) => x.vu && x.code);
  const r = await api(`/api/dossiers/${id}/components`, { methode: 'POST', session: ingA, corps: { name: modele.name.toUpperCase(), cat: modele.cat } });
  assert.equal(r.statut, 201);
  assert.equal(r.json.useful_life_years, modele.vu);
  assert.equal(r.json.uniformat_code, modele.code);
  assert.equal(r.json.actif, 1);
  assert.ok(Array.isArray(r.json.photos) && Array.isArray(r.json.entretien) && r.json.guide);
  const liste = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json;
  const ordres = liste.map((c) => c.sort_order);
  assert.equal(liste[liste.length - 1].id, r.json.id, 'ajoutée en fin de liste');
  assert.equal(r.json.sort_order, Math.max(...ordres));
});

test('création hors bibliothèque, rejouée sans doublon', async () => {
  const id = await nouveauDossier();
  const avant = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.length;
  const corps = { id: 'cmp_0123456789abcdef0123', name: '  Génératrice   au diesel ', cat: 'electrique', useful_life_years: 30 };
  const r1 = await api(`/api/dossiers/${id}/components`, { methode: 'POST', session: ingA, corps });
  assert.equal(r1.statut, 201);
  assert.equal(r1.json.id, corps.id);
  assert.equal(r1.json.name, 'Génératrice au diesel');
  assert.equal(r1.json.useful_life_years, 30);
  const r2 = await api(`/api/dossiers/${id}/components`, { methode: 'POST', session: ingA, corps });
  assert.equal(r2.statut, 200, 'un rejeu rend la même composante');
  assert.equal(r2.json.id, corps.id);
  assert.equal((await api(`/api/dossiers/${id}/components`, { session: ingA })).json.length, avant + 1);
  // La composante se documente ensuite comme les autres.
  const p = await api(`/api/components/${corps.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 2 } });
  assert.equal(p.statut, 200);
});

test('ajout refusé : nom manquant, identifiant invalide ou d\'un autre dossier, autre firme', async () => {
  const id = await nouveauDossier();
  const autre = await nouveauDossier();
  const poster = (dossier, corps, session = ingA) => api(`/api/dossiers/${dossier}/components`, { methode: 'POST', session, corps });
  assert.equal((await poster(id, { name: '  ', cat: 'terrain' })).statut, 400);
  assert.equal((await poster(id, { id: 'cmp_x', name: 'Bac', cat: 'terrain' })).statut, 400);
  assert.equal((await poster(id, { id: 'cmp_aaaaaaaaaaaaaaaaaaaa', name: 'Bac', cat: 'terrain' })).statut, 201);
  assert.equal((await poster(autre, { id: 'cmp_aaaaaaaaaaaaaaaaaaaa', name: 'Bac', cat: 'terrain' })).statut, 409);
  assert.equal((await poster(id, { name: 'Intrus', cat: 'terrain' }, ingB)).statut, 404);
  // Catégorie inconnue : rangée dans les équipements plutôt que perdue.
  assert.equal((await poster(id, { name: 'Objet inconnu', cat: 'nimporte' })).json.cat, 'equipements');
});
