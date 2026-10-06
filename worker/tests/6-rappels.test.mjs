// Rappel des études à réviser : envoyé par la tâche planifiée du 1er du mois.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, nombreCourriels, courrielsApres, pause } from './outils.mjs';

const ingA = jeton(IDS.ingA);
const Y = new Date().getFullYear();

async function etude(no, publieeEn) {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: no, name: `Syndicat ${no}`, units: 8 } });
  assert.equal(r.statut, 201);
  if (publieeEn) await api(`/api/dossiers/${r.json.id}`, { methode: 'PATCH', session: ingA, corps: { published_at: `${publieeEn}-03-15T12:00:00Z` } });
  return r.json.id;
}
const planifiee = () => api('/__scheduled?cron=0+11+1+*+*', { brut: true });

test('les études arrivées à révision partent aux administrateurs, une fois par trimestre', async () => {
  const suffixe = Date.now().toString(36).toUpperCase();
  await etude(`RV-DUE-${suffixe}`, Y - 5);
  await etude(`RV-RETARD-${suffixe}`, Y - 7);
  await etude(`RV-RECENTE-${suffixe}`, Y - 1);
  await etude(`RV-BROUILLON-${suffixe}`, null);

  const avant = nombreCourriels();
  assert.equal((await planifiee()).status, 200);
  const recus = (await courrielsApres(avant, { attendus: 2 })).filter((c) => c.includes(suffixe));
  assert.ok(recus.length >= 2, 'l\'administrateur et le super administrateur de la firme A');
  const texte = recus[0];
  assert.ok(texte.includes(`RV-DUE-${suffixe}`));
  assert.ok(texte.includes(`RV-RETARD-${suffixe}`) && texte.includes(`en retard depuis ${Y - 2}`));
  assert.ok(!texte.includes(`RV-RECENTE-${suffixe}`), 'une étude récente n\'est pas à réviser');
  assert.ok(!texte.includes(`RV-BROUILLON-${suffixe}`), 'une étude non publiée n\'est pas à réviser');

  // Le mois suivant : déjà rappelées, elles ne repartent pas.
  const ensuite = nombreCourriels();
  assert.equal((await planifiee()).status, 200);
  await pause(1500);
  assert.equal((await courrielsApres(ensuite, { attendus: 0, delai: 0 })).filter((c) => c.includes(suffixe)).length, 0);
});

test('une révision commencée arrête le rappel', async () => {
  const suffixe = Date.now().toString(36).toUpperCase();
  const id = await etude(`RV-FAITE-${suffixe}`, Y - 6);
  assert.equal((await api(`/api/dossiers/${id}/revision`, { methode: 'POST', session: ingA, corps: { dossier_no: `RV-FAITE-2-${suffixe}` } })).statut, 201);
  const avant = nombreCourriels();
  assert.equal((await planifiee()).status, 200);
  await pause(1500);
  assert.equal((await courrielsApres(avant, { attendus: 0, delai: 0 })).filter((c) => c.includes(`RV-FAITE-${suffixe}`)).length, 0);
});
