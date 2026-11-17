// Suivi des dossiers : responsable et échéance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), adminA = jeton(IDS.adminA), ingB = jeton(IDS.ingB);
const suivi = (id, corps, session) => api(`/api/dossiers/${id}/suivi`, { methode: 'PATCH', session, corps });

async function dossier() {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-SV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: 'Suivi', units: 4 } });
  return r.json.id;
}

test('l\'équipe active est lisible par toute la firme, sans les comptes désactivés', async () => {
  const r = await api(`/api/companies/${IDS.firmeA}/membres`, { session: ingA });
  assert.equal(r.statut, 200);
  const ids = r.json.membres.map((m) => m.id);
  assert.ok(ids.includes(IDS.ingA) && ids.includes(IDS.adminA));
  assert.ok(!ids.includes(IDS.ingDesactive));
  assert.equal(r.json.admin, false);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/membres`, { session: ingB })).statut, 404);
});

test('l\'administrateur répartit ; l\'ingénieur prend un dossier libre ou s\'en retire', async () => {
  const id = await dossier();
  // L'ingénieur prend le dossier libre et règle son échéance.
  assert.equal((await suivi(id, { assigne_a: IDS.ingA, echeance: '2030-06-30' }, ingA)).statut, 200);
  const liste = (await api('/api/dossiers', { session: ingA })).json;
  const d = liste.find((x) => x.id === id);
  assert.equal(d.assigne.name, 'Ingénieure A');
  assert.equal(d.echeance, '2030-06-30');
  // Il ne peut le donner à un autre, ni prendre celui d'un autre.
  assert.equal((await suivi(id, { assigne_a: IDS.adminA }, ingA)).statut, 403);
  assert.equal((await suivi(id, { assigne_a: IDS.adminA }, adminA)).statut, 200);
  assert.equal((await suivi(id, { assigne_a: IDS.ingA }, ingA)).statut, 403);
  assert.equal((await suivi(id, { echeance: '2031-01-01' }, ingA)).statut, 403);
  // L'administrateur rend le dossier à l'ingénieure, qui s'en retire.
  assert.equal((await suivi(id, { assigne_a: IDS.ingA }, adminA)).statut, 200);
  const retrait = await suivi(id, { assigne_a: null }, ingA);
  assert.equal(retrait.statut, 200);
  assert.equal(retrait.json.assigne, null);
});

test('responsable hors de l\'équipe active, date invalide ou autre firme : refusé', async () => {
  const id = await dossier();
  assert.equal((await suivi(id, { assigne_a: IDS.ingDesactive }, adminA)).statut, 400);
  assert.equal((await suivi(id, { assigne_a: IDS.ingB }, adminA)).statut, 400);
  assert.equal((await suivi(id, { echeance: '30/06/2030' }, adminA)).statut, 400);
  assert.equal((await suivi(id, { echeance: '2030-02-31x' }, adminA)).statut, 400);
  assert.equal((await suivi(id, {}, adminA)).statut, 400);
  assert.equal((await suivi(id, { assigne_a: IDS.ingB }, ingB)).statut, 404);
});
