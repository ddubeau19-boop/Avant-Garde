// Historique des modifications.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), adminA = jeton(IDS.adminA), ingB = jeton(IDS.ingB);

test('chaque modification est consignée : auteur, champ, avant, après', async () => {
  const d = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-JN-${Date.now()}`, name: 'Journal', units: 6 } })).json;
  const comp = (await api(`/api/dossiers/${d.id}/components`, { session: ingA })).json[0];
  // Plusieurs saisies rapprochées sur la même fiche : une seule entrée.
  await api(`/api/components/${comp.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 2 } });
  await api(`/api/components/${comp.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 3, install_year: 2001 } });
  await api(`/api/components/${comp.id}`, { methode: 'PATCH', session: ingA, corps: { install_year: 2001 } });
  // Même valeur réenvoyée : rien de nouveau.
  await api(`/api/dossiers/${d.id}/suivi`, { methode: 'PATCH', session: adminA, corps: { assigne_a: IDS.ingA } });
  await api(`/api/dossiers/${d.id}`, { methode: 'PATCH', session: adminA, corps: { current_fund_balance: 55000 } });

  const j = (await api(`/api/dossiers/${d.id}/journal`, { session: ingA })).json;
  const actions = j.map((e) => e.action);
  assert.deepEqual(actions.slice().sort(), ['creation', 'modification', 'modification', 'suivi'].sort());
  const fiche = j.find((e) => e.composante?.id === comp.id);
  assert.equal(fiche.auteur, 'Ingénieure A');
  assert.deepEqual(fiche.champs.map((c) => c.champ).sort(), ['install_year', 'rating']);
  const cote = fiche.champs.find((c) => c.champ === 'rating');
  assert.equal(cote.avant, null);
  assert.equal(cote.apres, 'Entretien requis');
  assert.equal(cote.libelle, 'Cote');
  const solde = j.find((e) => e.action === 'modification' && !e.composante);
  assert.equal(solde.auteur, 'Admin A');
  assert.equal(solde.champs[0].apres, '55000');
  assert.equal(j.find((e) => e.action === 'suivi').champs[0].apres, 'Ingénieure A');
  // Filtré sur une fiche, et fermé aux autres firmes.
  assert.equal((await api(`/api/dossiers/${d.id}/journal?composante=${comp.id}`, { session: ingA })).json.length, 1);
  assert.equal((await api(`/api/dossiers/${d.id}/journal`, { session: ingB })).statut, 404);
});

test('une valeur revenue à son point de départ disparaît de l\'entrée', async () => {
  const d = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-JN2-${Date.now()}`, name: 'Journal 2', units: 6 } })).json;
  const comp = (await api(`/api/dossiers/${d.id}/components`, { session: ingA })).json[0];
  await api(`/api/components/${comp.id}`, { methode: 'PATCH', session: ingA, corps: { qty: '12 m²' } });
  await api(`/api/components/${comp.id}`, { methode: 'PATCH', session: ingA, corps: { qty: comp.qty } });
  const j = (await api(`/api/dossiers/${d.id}/journal?composante=${comp.id}`, { session: ingA })).json;
  assert.equal(j.length, 0, 'rien n\'a changé au bout du compte');
});
