// Copie d'un dossier pour faire des essais : tout est repris, l'original
// n'est jamais touché, et le syndicat ne voit rien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB), adminA = jeton(IDS.adminA);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const image = (nom) => { const f = new FormData(); f.append('file', new Blob([JPEG], { type: 'image/jpeg' }), nom); return f; };

test('copie de dossier : composantes, photos et attentions reprises ; original intact', async () => {
  const no = `T-CP-${Date.now()}`;
  const id = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: no, name: 'Rushbrooke essai', units: 6 } })).json.id;
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: ingA, corps: { current_fund_balance: 12345, date_visite: '2026-01-15' } });
  const [c1, c2] = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  await api(`/api/components/${c1.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 3, replacement_cost: 9000, done: 1 } });
  const p1 = (await api(`/api/components/${c1.id}/photos`, { methode: 'POST', session: ingA, formulaire: image('a.jpg') })).json.id;
  await api(`/api/components/${c1.id}/attentions`, { methode: 'PUT', session: ingA, corps: { attentions: [{ titre: 'Solin', notes: 'décollé', photos: [p1] }] } });
  const pac = (await api(`/api/dossiers/${id}/photos-a-classer`, { methode: 'POST', session: ingA, formulaire: image('b.jpg') })).json.id;
  // Un membre du portail sur l'original : il ne doit pas suivre la copie.
  const m = await api(`/api/dossiers/${id}/portail/membres`, { methode: 'POST', session: adminA, corps: { name: 'CA', email: `ca${Date.now()}@copie.test` } });
  assert.equal(m.statut, 201);
  assert.equal((await api(`/api/dossiers/${id}/portail`, { session: adminA })).json.membres.length, 1);

  assert.equal((await api(`/api/dossiers/${id}/copie`, { methode: 'POST', session: ingB })).statut, 404, 'une autre firme ne copie rien');
  const r = await api(`/api/dossiers/${id}/copie`, { methode: 'POST', session: ingA });
  assert.equal(r.statut, 201, r.texte.slice(0, 300));
  const copie = r.json;
  assert.equal(copie.dossier_no, `${no}-COPIE`);
  assert.match(copie.name, /^COPIE TEST – Rushbrooke essai/);
  assert.equal(copie.current_fund_balance, 12345);
  assert.equal(copie.date_visite, '2026-01-15');
  assert.equal(copie.published_at, null);
  assert.deepEqual(copie.copie, { composantes: (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.length, photos: 1, a_classer: 1 });

  const comps = (await api(`/api/dossiers/${copie.id}/components`, { session: ingA })).json;
  const k1 = comps.find((c) => c.name === c1.name && c.rating === 3);
  assert.ok(k1 && k1.id !== c1.id, 'nouvelle composante, mêmes données');
  assert.equal(k1.replacement_cost, 9000);
  assert.equal(k1.photos, 1);
  const detail = (await api(`/api/components/${k1.id}`, { session: ingA })).json;
  assert.notEqual(detail.photos[0].id, p1);
  assert.deepEqual(JSON.parse(detail.attentions)[0].photos, [detail.photos[0].id], "l'attention pointe la photo de la copie");
  assert.equal((await api(`/api/photos/${detail.photos[0].id}/file`, { session: ingA, brut: true })).status, 200);
  const aClasser = (await api(`/api/dossiers/${copie.id}/photos-a-classer`, { session: ingA })).json.photos;
  assert.equal(aClasser.length, 1);
  assert.notEqual(aClasser[0].id, pac);
  assert.equal((await api(`/api/dossiers/${copie.id}/portail`, { session: adminA })).json.membres.length, 0, 'personne du syndicat sur la copie');

  // Supprimer dans la copie ne touche ni la fiche ni le fichier de l'original.
  assert.equal((await api(`/api/dossiers/${copie.id}/photos-a-classer/${aClasser[0].id}`, { methode: 'DELETE', session: ingA })).statut, 200);
  assert.equal((await api(`/api/dossiers/${id}/photos-a-classer/${pac}/fichier`, { session: ingA, brut: true })).status, 200);
  await api(`/api/components/${k1.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 1 } });
  assert.equal((await api(`/api/components/${c1.id}`, { session: ingA })).json.rating, 3);
  assert.ok(!(await api(`/api/dossiers/${id}/components`, { session: ingA })).json.some((c) => c.id === k1.id));

  // Une deuxième copie prend le numéro suivant.
  assert.equal((await api(`/api/dossiers/${id}/copie`, { methode: 'POST', session: ingA })).json.dossier_no, `${no}-COPIE-2`);
});
