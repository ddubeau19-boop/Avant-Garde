// Scénario de financement de l'ingénieur : ses hausses annuelles (an 1 = l'an
// prochain), puis un taux pour la suite. Retenu au rapport comme B1, refusé à
// la publication s'il épuise le fonds, retirable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, texteDocx, proche } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);
const INFLATION = 0.0176;
const AN1 = new Date().getFullYear() + 1;

async function dossierFinance() {
  const id = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-SP-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name: 'Scénario', units: 6 } })).json.id;
  const comps = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  await api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session: ingA, corps: { ids: comps.slice(1).map((c) => c.id), actif: 0 } });
  // Une seule composante : 20 000 $ tous les 10 ans, échue en année 1.
  await api(`/api/components/${comps[0].id}`, { methode: 'PATCH', session: ingA, corps: { done: 1, rating: 2, replacement_cost: 20000, useful_life_years: 10, install_year: AN1 - 11 } });
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: ingA, corps: { current_fund_balance: 60000, cotisation_annuelle: 25000 } });
  return id;
}
const projection = async (id) => (await api(`/api/dossiers/${id}/projection`, { session: ingA })).json;

test("scénario de l'ingénieur : validé, calculé, retenu au rapport, retiré", async () => {
  const id = await dossierFinance();

  // Validation.
  const mettre = (v, s = ingA) => api(`/api/dossiers/${id}`, { methode: 'PATCH', session: s, corps: { scenario_perso: v } });
  assert.equal((await mettre({ taux: [] })).statut, 400, 'au moins une hausse');
  assert.equal((await mettre({ taux: ['abc'] })).statut, 400, 'un pourcentage');
  assert.equal((await mettre({ taux: [500] })).statut, 400, 'borné');
  assert.equal((await mettre('6 ; 6')).statut, 400, 'un objet');
  assert.equal((await mettre({ taux: [6] }, ingB)).statut, 404, "une autre firme n'y touche pas");

  // Saisie à la française (virgule décimale, « % ») acceptée et normalisée.
  const ok = await mettre({ taux: ['6', '6,0 %'], ensuite: '' });
  assert.equal(ok.statut, 200);
  assert.deepEqual(JSON.parse(ok.json.scenario_perso), { taux: [6, 6], ensuite: null });

  // Moteur : 6 % les deux premières années, puis l'inflation.
  const p = await projection(id);
  assert.equal(p.preferredCode, 'C1.1.P');
  const sc = p.scenarios.find((s) => s.code === 'C1.1.P');
  assert.ok(sc, 'le scénario figure parmi les scénarios');
  assert.ok(proche(sc.years[0].cotisation, 25000 * 1.06));
  assert.ok(proche(sc.years[1].cotisation, 25000 * 1.06 * 1.06));
  assert.ok(proche(sc.years[2].cotisation, 25000 * 1.06 * 1.06 * (1 + INFLATION)));
  assert.equal(sc.meetsCriteria, true);

  // Rapport : B1 et la phrase du rapport approuvé.
  // Le rapport sépare nombre et % par une espace insécable.
  const texte = texteDocx(await (await api(`/api/dossiers/${id}/report.docx`, { session: ingA, brut: true })).arrayBuffer()).map((t) => t.replace(/\u00a0/g, ' '));
  assert.ok(texte.some((t) => t.includes(`de 6 % en ${AN1} et ${AN1 + 1} et de 1,76 % par la suite`)), '5.0 en taux annuels');
  assert.ok(texte.some((t) => t === `${AN1} – augmentation de 6 % des cotisations`), 'sommaire exécutif');
  assert.ok(texte.some((t) => t.startsWith("Annexe B1 – Scénario de l'ingénieur (scénario de préférence)")), 'annexe B1');

  // Un scénario qui épuise le fonds bloque la publication.
  await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: ingA, corps: { current_fund_balance: 0 } });
  assert.equal((await mettre({ taux: [-50], ensuite: -50 })).statut, 200);
  const verif = (await api(`/api/dossiers/${id}/publication`, { session: ingA })).json;
  assert.ok(verif.bloquants.some((b) => b.cle === 'scenario'), 'bloquant à la publication');

  // Retiré : le rapport revient au moteur.
  assert.equal((await mettre(null)).statut, 200);
  const p2 = await projection(id);
  assert.notEqual(p2.preferredCode, 'C1.1.P');
  assert.ok(!p2.scenarios.some((s) => s.code === 'C1.1.P'));
});
