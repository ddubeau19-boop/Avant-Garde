// Bureau : composantes confirmées ou retirées en lot, coûts repris de la
// banque de prix de la firme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);
const Y = new Date().getUTCFullYear();

async function nouveauDossier(units = 8) {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-LOT-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name: 'Lot', units } });
  assert.equal(r.statut, 201);
  return r.json.id;
}

test('composantes en lot : confirmer, retirer, réactiver', async () => {
  const id = await nouveauDossier();
  const autre = await nouveauDossier();
  const [c1, c2, c3] = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  const etranger = (await api(`/api/dossiers/${autre}/components`, { session: ingA })).json[0];
  const lot = (corps, session = ingA) => api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session, corps });

  assert.equal((await lot({ ids: [c1.id] })).statut, 400, 'un champ à changer est requis');
  assert.equal((await lot({ ids: [c1.id], confirmed: 'oui' })).statut, 400);
  assert.equal((await lot({ ids: [c1.id], confirmed: 1 }, ingB)).statut, 404);

  const r = await lot({ ids: [c1.id, c2.id, etranger.id], confirmed: 1 });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { modifiees: 2, ignorees: 1 }, "une composante d'un autre dossier est ignorée");
  const apres = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json;
  assert.equal(apres.find((c) => c.id === c1.id).confirmed, 1);
  assert.equal(apres.find((c) => c.id === c3.id).confirmed, 0);
  assert.equal((await api(`/api/dossiers/${autre}/components`, { session: ingA })).json.find((c) => c.id === etranger.id).confirmed, 0);

  // Retirée : hors du rapport et du fonds ; réactivée : de retour.
  assert.equal((await lot({ ids: [c3.id], actif: 0 })).json.modifiees, 1);
  assert.equal((await api(`/api/dossiers/${id}/components`, { session: ingA })).json.find((c) => c.id === c3.id).actif, 0);
  const proj = (await api(`/api/dossiers/${id}/projection`, { session: ingA })).json;
  assert.ok(!JSON.stringify(proj.excludedComponents || []).includes(c3.id), 'une composante retirée ne compte plus du tout');
  await lot({ ids: [c3.id], actif: 1 });
  assert.equal((await api(`/api/dossiers/${id}/components`, { session: ingA })).json.find((c) => c.id === c3.id).actif, 1);

  const journal = (await api(`/api/dossiers/${id}/journal`, { session: ingA })).json;
  assert.ok(journal.some((e) => e.composante?.id === c1.id && e.champs.some((ch) => ch.champ === 'confirmed')));
});

test('coûts de la banque : médiane par porte, même taille, coûts vides seulement', async () => {
  const id = await nouveauDossier(8);
  const code = `Z9${Date.now() % 1e6}`;
  const ajout = async (nom) => (await api(`/api/dossiers/${id}/components`, { methode: 'POST', session: ingA, corps: { name: nom, cat: 'enveloppe', uniformat_code: code } })).json;
  const sansCout = await ajout('Revêtement test A');
  const dejaChiffree = await ajout('Revêtement test B');
  await api(`/api/components/${dejaChiffree.id}`, { methode: 'PATCH', session: ingA, corps: { replacement_cost: 1234 } });

  // Cinq prix validés pour des immeubles de moins de 12 portes (8 portes) :
  // 900 à 1300 $ la porte, médiane 1100 $. Un prix négocié et un d'un grand
  // immeuble sont écartés.
  const prix = async (montant, unites, extra = {}) => {
    const r = await api('/api/prix', { methode: 'POST', session: ingA, corps: { description: 'Revêtement', uniformat_code: code, annee: Y, montant, unite: 'forfait', unites, valide: true, ...extra } });
    assert.equal(r.statut, 201, r.texte.slice(0, 200));
    if (!r.json.valide) await api(`/api/prix/${r.json.id}`, { methode: 'PATCH', session: ingA, corps: { valide: true } });
  };
  for (const parPorte of [900, 1000, 1100, 1200, 1300]) await prix(parPorte * 8, 8);
  await prix(99999 * 8, 8, { negocie: true });
  await prix(5000 * 60, 60);

  const s = (await api(`/api/dossiers/${id}/couts-suggeres`, { session: ingA })).json;
  assert.equal(s.tranche.cle, 'petit');
  const mine = s.suggestions.filter((x) => x.uniformat_code === code);
  assert.deepEqual(mine.map((x) => x.component_id), [sansCout.id], 'un coût déjà saisi ne reçoit pas de suggestion');
  assert.equal(mine[0].n, 5);
  assert.equal(mine[0].mince, false);
  assert.equal(mine[0].par_porte, 1100);
  assert.equal(mine[0].cout, 8800);
  assert.equal((await api(`/api/dossiers/${id}/couts-suggeres`, { session: ingB })).statut, 404);

  const r = await api(`/api/dossiers/${id}/couts-suggeres/appliquer`, { methode: 'POST', session: ingA, corps: { ids: [sansCout.id, dejaChiffree.id] } });
  assert.deepEqual(r.json.appliques, [{ component_id: sansCout.id, replacement_cost: 8800 }]);
  const comps = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json;
  assert.equal(comps.find((c) => c.id === sansCout.id).replacement_cost, 8800);
  assert.equal(comps.find((c) => c.id === dejaChiffree.id).replacement_cost, 1234);
});

test('fiche d\'immeuble saisie au bureau : enregistrée et relue', async () => {
  const id = await nouveauDossier();
  const fiche = { documents: { declaration_copropriete: 'oui' }, caracteristiques: { annee_construction: '1998', nb_ascenseurs: '1' }, remplacements: { revetement_toiture: '2015' } };
  const r = await api(`/api/dossiers/${id}`, { methode: 'PATCH', session: ingA, corps: { batiment_info: JSON.stringify(fiche) } });
  assert.equal(r.statut, 200);
  assert.deepEqual(JSON.parse((await api(`/api/dossiers/${id}`, { session: ingA })).json.batiment_info), fiche);
});
