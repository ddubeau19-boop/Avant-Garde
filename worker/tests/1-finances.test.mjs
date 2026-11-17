// Moteur financier : chaque valeur attendue se calcule à la main à partir
// des règles maison (année anticipée = année + durée de vie, remplacement
// échu reporté en année 1, indexation composée, portion future en année 31,
// intérêts sur le solde d'ouverture positif).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, proche } from './outils.mjs';

const INFLATION = 0.0176;
const INTERET = 0.0183;
const indexe = (cout, annee) => cout * Math.pow(1 + INFLATION, annee);
const session = jeton(IDS.ingA);

test('hypothèses économiques sourcées et horizon de 30 ans', async () => {
  const { statut, json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  assert.equal(statut, 200);
  assert.equal(json.params.inflationRate, INFLATION);
  assert.equal(json.params.interestRate, INTERET);
  assert.equal(json.params.projectionYears, 30);
  assert.match(json.params.inflationSource, /Statistique Canada/);
});

test('composantes exclues du calcul, avec la raison', async () => {
  const { json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  const raisons = Object.fromEntries(json.excludedComponents.map((e) => [e.id, e.reason]));
  assert.deepEqual(raisons, {
    cmp_non_doc: 'composante non documentée',
    cmp_sans_cout: 'coût de remplacement non saisi',
    cmp_sans_vie: 'durée de vie utile inconnue',
  });
  assert.deepEqual(json.includedComponentIds.sort(), ['cmp_an31', 'cmp_cinq', 'cmp_echu', 'cmp_residuel']);
  assert.equal(json.totalDeboursNominal, 10000 + 20000 + 5000 + 30000);
});

test('déboursés par année : année anticipée, échu reporté en année 1, vie résiduelle, cycles', async () => {
  const { json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  const annees = json.scenarios.find((s) => s.code === 'C1.1.2').years;
  assert.equal(annees.length, 30);
  const attendu = new Array(31).fill(0);
  // Installée il y a 5 ans, cycle de 10 ans : années 5, 15, 25.
  for (const a of [5, 15, 25]) attendu[a] += indexe(10000, a);
  // Échue depuis 10 ans : année 1, puis 11 et 21 (31 tombe hors horizon).
  for (const a of [1, 11, 21]) attendu[a] += indexe(20000, a);
  // Sans année, 50 % de vie résiduelle sur 20 ans : année 10, puis 30.
  for (const a of [10, 30]) attendu[a] += indexe(5000, a);
  // Cycle de 30 ans installé il y a 29 ans : année 1 (31 hors horizon).
  attendu[1] += indexe(30000, 1);
  for (const y of annees) assert.ok(proche(y.debours, attendu[y.year]), `année ${y.year} : ${y.debours} au lieu de ${attendu[y.year]}`);
  const total = attendu.reduce((a, b) => a + b, 0);
  assert.ok(proche(json.totalDebours30Ans, total, 0.05));
});

test("portion future provisionnée à l'entrée de l'année 31", async () => {
  const { json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  const detail = Object.fromEntries(json.portionFutureAn31.detail.map((d) => [d.id, d]));
  assert.deepEqual(Object.keys(detail).sort(), ['cmp_an31', 'cmp_echu']);
  assert.ok(proche(detail.cmp_an31.portion, indexe(30000, 31) * (29 / 30)));
  assert.ok(proche(detail.cmp_echu.portion, indexe(20000, 31) * (9 / 10)));
  assert.ok(proche(json.portionFutureAn31.total, detail.cmp_an31.portion + detail.cmp_echu.portion));
});

test('fonds vide et cotisation nulle : aucun scénario acceptable, aucune recommandation', async () => {
  const { json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  for (const s of json.scenarios) {
    assert.equal(s.meetsCriteria, false, s.code);
    assert.equal(s.firstNegativeYear, 1, s.code);
  }
  assert.equal(json.recommendedCode, null);
});

test('intérêts, indexation de la cotisation et rampe de rétablissement', async () => {
  const { statut, json } = await api(`/api/dossiers/${IDS.dossierVide}/projection`, { session });
  assert.equal(statut, 200);
  const statuQuo = json.scenarios.find((s) => s.code === 'C1.1.2');
  const an1 = statuQuo.years[0];
  // Statu quo : la cotisation suit l'inflation dès l'année 1.
  assert.ok(proche(an1.cotisation, 12000 * (1 + INFLATION)));
  assert.ok(proche(an1.interet, 100000 * INTERET));
  assert.ok(proche(an1.soldeFin, 100000 + 100000 * INTERET + 12000 * (1 + INFLATION)));
  // Rétablissement sur 5 ans : 0 % en année 1, puis +15 %.
  const retab = json.scenarios.find((s) => s.code === 'C1.1.1');
  assert.ok(proche(retab.years[0].cotisation, 12000));
  assert.ok(proche(retab.years[1].cotisation, 12000 * 1.15));
  // Sans dépense, le rétablissement sur 5 ans est recommandé.
  assert.equal(json.recommendedCode, 'C1.1.1');
  assert.ok(retab.neverNegative && retab.positiveEntering31);
});

test('solde négatif : pas d\'intérêt, et le premier déficit est daté', async () => {
  const { json } = await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session });
  const an1 = json.scenarios.find((s) => s.code === 'C1.1.2').years[0];
  assert.equal(an1.interet, 0);
  assert.ok(an1.soldeFin < 0);
});
