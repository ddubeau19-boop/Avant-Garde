// Clients : fiches des syndicats, rattachement des dossiers, nouvelle étude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), adminA = jeton(IDS.adminA), ingB = jeton(IDS.ingB);

test('fiche client : création, contacts validés, nouvelle étude reprenant ses coordonnées', async () => {
  const r = await api('/api/clients', { methode: 'POST', session: ingA, corps: {
    nom: '  Syndicat   des Érables ', adresse: '12 rue des Érables', ville: 'Laval', code_postal: 'h7n 1a1', unites: '24', annee_construction: 1998,
    contacts: [{ nom: 'Marie Tremblay', fonction: 'Présidente du CA', courriel: 'marie@erables.test' }, { nom: '', courriel: '' }]
  } });
  assert.equal(r.statut, 201);
  assert.equal(r.json.nom, 'Syndicat des Érables');
  assert.equal(r.json.code_postal, 'H7N 1A1');
  assert.equal(r.json.unites, 24);
  assert.equal(r.json.contacts.length, 1, 'un contact vide est ignoré');
  const no = `T-CLI-${Date.now()}`;
  const d = await api(`/api/clients/${r.json.id}/dossiers`, { methode: 'POST', session: ingA, corps: { dossier_no: no, floors: '4' } });
  assert.equal(d.statut, 201);
  assert.equal(d.json.name, 'Syndicat des Érables');
  assert.equal(d.json.city, 'Laval');
  assert.equal(d.json.units, 24);
  assert.equal(d.json.floors, 4);
  assert.equal(d.json.client_id, r.json.id);
  assert.ok(d.json.stats.total > 0, 'liste de départ créée');
  assert.equal((await api(`/api/clients/${r.json.id}/dossiers`, { methode: 'POST', session: ingA, corps: { dossier_no: no } })).statut, 409);
  // La révision reste chez le même client.
  await api(`/api/dossiers/${d.json.id}`, { methode: 'PATCH', session: ingA, corps: { published_at: '2020-05-01T12:00:00Z' } });
  const rev = await api(`/api/dossiers/${d.json.id}/revision`, { methode: 'POST', session: ingA, corps: { dossier_no: `${no}-R` } });
  assert.equal(rev.json.client_id, r.json.id);
  const fiche = (await api(`/api/clients/${r.json.id}`, { session: ingA })).json;
  assert.equal(fiche.dossiers.length, 2);
  assert.equal(fiche.etude_actuelle.dossier_no, `${no}-R`);
  // Un client qui a des dossiers ne se supprime pas ; un ingénieur n'en supprime aucun.
  assert.equal((await api(`/api/clients/${r.json.id}`, { methode: 'DELETE', session: ingA })).statut, 403);
  assert.equal((await api(`/api/clients/${r.json.id}`, { methode: 'DELETE', session: adminA })).statut, 409);
});

test('dossiers sans fiche : regroupés par immeuble, puis rattachés à la création', async () => {
  const no = `T-ORPH-${Date.now()}`;
  const d = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: no, name: 'Immeuble orphelin', city: 'Lévis', units: 9 } })).json;
  await api(`/api/dossiers/${d.id}`, { methode: 'PATCH', session: ingA, corps: { published_at: '2019-05-01T12:00:00Z' } });
  await api(`/api/dossiers/${d.id}/revision`, { methode: 'POST', session: ingA, corps: { dossier_no: `${no}-R` } });
  const liste = (await api('/api/clients', { session: ingA })).json;
  const groupe = liste.sans_client.find((g) => g.dossiers.some((x) => x.dossier_no === no));
  assert.ok(groupe, 'immeuble sans fiche listé');
  assert.equal(groupe.dossiers.length, 2, 'l\'étude et sa révision forment un seul immeuble');
  const c = await api('/api/clients', { methode: 'POST', session: ingA, corps: { nom: groupe.nom, ville: groupe.ville, dossiers: groupe.dossiers.map((x) => x.id) } });
  assert.equal(c.json.dossiers.length, 2);
  const apres = (await api('/api/clients', { session: ingA })).json;
  assert.ok(!apres.sans_client.some((g) => g.dossiers.some((x) => x.dossier_no === no)));
  // Détacher puis supprimer (administrateur).
  for (const x of groupe.dossiers) assert.equal((await api(`/api/clients/${c.json.id}/dossiers/${x.id}`, { methode: 'DELETE', session: ingA })).statut, 200);
  assert.equal((await api(`/api/clients/${c.json.id}`, { methode: 'DELETE', session: adminA })).statut, 200);
});

test('clients étanches entre firmes ; CRM fermé aux firmes qui ne sont pas Condo Stratégis', async () => {
  const c = (await api('/api/clients', { methode: 'POST', session: ingA, corps: { nom: 'Syndicat privé' } })).json;
  assert.equal((await api(`/api/clients/${c.id}`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/clients/${c.id}`, { methode: 'PATCH', session: ingB, corps: { nom: 'Volé' } })).statut, 404);
  assert.equal((await api(`/api/clients/${c.id}/dossiers`, { methode: 'POST', session: ingB, corps: { dossier_no: 'X' } })).statut, 404);
  assert.ok(!(await api('/api/clients', { session: ingB })).json.clients.some((x) => x.id === c.id));
  assert.equal((await api(`/api/clients/${c.id}/dossiers/${IDS.dossierB}`, { methode: 'PUT', session: ingA })).statut, 404);
  assert.equal((await api('/api/dossiers', { methode: 'POST', session: ingB, corps: { dossier_no: `X-${Date.now()}`, name: 'x', client_id: c.id } })).statut, 404);
  assert.equal((await api('/api/clients/crm', { session: ingA })).statut, 403);
  assert.equal((await api('/api/clients', { methode: 'POST', session: ingA, corps: { nom: '   ' } })).statut, 400);
});
