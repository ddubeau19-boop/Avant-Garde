// Parcours de bout en bout : une visite créée, documentée, livrée (rapport,
// tableur), révisée cinq ans plus tard, préparée hors connexion, et son
// carnet ouvert au syndicat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, texteDocx, fichierZip, nombreCourriels, lienApres, courrielsApres } from './outils.mjs';

const ingA = jeton(IDS.ingA), adminA = jeton(IDS.adminA);
const Y = new Date().getFullYear();
const etat = {};

test('nouvelle visite : la liste de départ vient de la bibliothèque', async () => {
  const r = await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-PARC-${Date.now()}`, name: 'Syndicat du parcours', units: 24, floors: 4 } });
  assert.equal(r.statut, 201);
  etat.dossier = r.json.id;
  assert.ok(r.json.inventaire.total > 100, `${r.json.inventaire.total} composantes`);
  const comps = (await api(`/api/dossiers/${etat.dossier}/components`, { session: ingA })).json;
  assert.equal(comps.length, r.json.inventaire.total);
  etat.comps = comps;
});

test('une fiche porte ses tâches du carnet et son guide', async () => {
  const toiture = etat.comps.find((c) => /aménagement paysager/i.test(c.name));
  const fiche = (await api(`/api/components/${toiture.id}`, { session: ingA })).json;
  assert.ok(fiche.entretien.length > 0);
  assert.ok(fiche.entretien.every((t) => t.texte && t.frequence && t.quand));
  assert.ok(fiche.guide);
});

test('relevé terrain : champs validés, photo rejouée sans doublon', async () => {
  const c = etat.comps[0];
  etat.composante = c.id;
  const p = await api(`/api/components/${c.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 3, observation: 'Fissures localisées.', done: 1, install_year: Y - 20, useful_life_years: 25, replacement_cost: 10000 } });
  assert.equal(p.statut, 200);
  assert.equal(p.json.rating, 3);
  const envoi = () => {
    const f = new FormData();
    f.append('id', 'pho_0123456789abcdef0123');
    f.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])], { type: 'image/jpeg' }), 'p.jpg');
    return api(`/api/components/${c.id}/photos`, { methode: 'POST', session: ingA, formulaire: f });
  };
  const a = await envoi(), b = await envoi();
  assert.equal(a.statut, 201);
  assert.equal(b.statut, 200);
  assert.equal(a.json.id, b.json.id);
  assert.equal((await api(`/api/components/${c.id}`, { session: ingA })).json.photos.length, 1);
  const fichier = await api(`/api/photos/${a.json.id}/file`, { session: ingA, brut: true });
  assert.equal(fichier.status, 200);
});

test('lot hors connexion : toutes les fiches en un appel', async () => {
  const lot = (await api(`/api/dossiers/${etat.dossier}/hors-ligne`, { session: ingA })).json;
  assert.equal(lot.composantes.length, etat.comps.length);
  assert.ok(lot.composantes.every((c) => Array.isArray(c.entretien) && Array.isArray(c.photos)));
});

test('rapport Word : les sections du plan et la fiche documentée', async () => {
  const res = await api(`/api/dossiers/${etat.dossier}/report.docx`, { session: ingA, brut: true });
  assert.equal(res.status, 200);
  const texte = texteDocx(await res.arrayBuffer());
  for (const titre of ['1.0 Sommaire du mandat', '2.0 Méthodologie', '4.0 Observation des éléments', '5.0 Résultats et scénarios de financement', '8.0 Déclaration']) {
    assert.ok(texte.some((t) => t.startsWith(titre)), `section absente : ${titre}`);
  }
  assert.ok(texte.some((t) => t.includes(etat.comps[0].name.split(' – ')[0])));
});

test('tableur de suivi : un onglet par saison et un calendrier', async () => {
  const res = await api(`/api/dossiers/${etat.dossier}/suivi-entretien.xlsx`, { session: ingA, brut: true });
  assert.equal(res.status, 200);
  const classeur = fichierZip(await res.arrayBuffer(), 'xl/workbook.xml');
  for (const onglet of ['Calendrier', 'Hiver', 'Printemps', 'Été', 'Automne']) assert.match(classeur, new RegExp(onglet));
});

test('bibliothèque : l\'export se réimporte à l\'identique', async () => {
  const avant = (await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { session: adminA })).json;
  const xlsx = await (await api(`/api/companies/${IDS.firmeA}/bibliotheque.xlsx`, { session: adminA, brut: true })).arrayBuffer();
  const f = new FormData();
  f.append('file', new Blob([xlsx]), 'bibliotheque.xlsx');
  const imp = await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { methode: 'POST', session: adminA, formulaire: f });
  assert.equal(imp.statut, 200, imp.texte.slice(0, 200));
  assert.equal(imp.json.source, 'firme');
  assert.deepEqual(imp.json.stats, avant.stats);
  // Un fichier qui n'est pas un classeur est refusé.
  const g = new FormData();
  g.append('file', new Blob(['pas un classeur']), 'x.xlsx');
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { methode: 'POST', session: adminA, formulaire: g })).statut, 400);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { methode: 'DELETE', session: adminA })).json.source, 'defaut');
});

test('révision aux cinq ans : coûts indexés, une seule révision, section Évolution', async () => {
  await api(`/api/dossiers/${etat.dossier}`, { methode: 'PATCH', session: ingA, corps: { published_at: `${Y - 5}-06-01T12:00:00Z`, current_fund_balance: 150000, cotisation_annuelle: 20000 } });
  const liste = (await api('/api/dossiers', { session: ingA })).json;
  assert.equal(liste.find((d) => d.id === etat.dossier).revision_due, true);
  const r = await api(`/api/dossiers/${etat.dossier}/revision`, { methode: 'POST', session: ingA, corps: { dossier_no: `T-REV-${Date.now()}` } });
  assert.equal(r.statut, 201);
  etat.revision = r.json.id;
  assert.ok(Math.abs(r.json.revision.indexation - (Math.pow(1.0176, 5) - 1)) < 1e-9);
  const comps = (await api(`/api/dossiers/${etat.revision}/components`, { session: ingA })).json;
  assert.equal(comps.length, etat.comps.length);
  const reprise = comps.find((c) => c.origine_id === etat.composante);
  assert.equal(reprise.replacement_cost, Math.round(10000 * Math.pow(1.0176, 5)));
  assert.equal(reprise.rating, null);
  assert.equal(reprise.precedent.rating, 3);
  assert.equal((await api(`/api/dossiers/${etat.dossier}/revision`, { methode: 'POST', session: ingA, corps: { dossier_no: 'T-REV-2' } })).statut, 409);
  await api(`/api/components/${reprise.id}`, { methode: 'PATCH', session: ingA, corps: { travaux_periode: 'fait', travaux_annee: Y - 1, install_year: Y - 1, rating: 1, done: 1, replacement_cost: 11000 } });
  const texte = texteDocx(await (await api(`/api/dossiers/${etat.revision}/report.docx`, { session: ingA, brut: true })).arrayBuffer());
  const i = texte.findIndex((t) => t.startsWith('1.7 Évolution depuis l'));
  assert.ok(i >= 0, 'section 1.7 absente');
  const section = texte.slice(i, texte.findIndex((t) => t.startsWith('2.0 '))).join('\n');
  assert.match(section, /réalisé en/);
  assert.match(section, /150\s000/);
});

test('portail du syndicat : invitation, répartition, tâche cochée, rappels planifiés', async () => {
  const email = `gestion${Date.now()}@syndicat.test`;
  const marque = nombreCourriels();
  const inv = await api(`/api/dossiers/${etat.revision}/portail/membres`, { methode: 'POST', session: adminA, corps: { name: 'Gestionnaire du parcours', email, fonction: 'Gestionnaire' } });
  assert.equal(inv.statut, 201);
  const lien = await lienApres(marque);
  assert.equal((await api(`/api/auth/jeton/${lien}`)).json.portail, true);
  const membre = (await api(`/api/auth/jeton/${lien}`, { methode: 'POST', corps: { password: 'mot de passe du syndicat' } })).json;
  const session = membre.token;
  // Un compte du portail ne sort pas du portail.
  assert.equal((await api('/api/dossiers', { session })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/theme`, { session })).statut, 403);
  assert.equal((await api(`/api/portail/immeubles/${IDS.dossierB}`, { session })).statut, 404);
  // L'adresse d'un compte de firme ne sert pas au portail.
  assert.equal((await api(`/api/dossiers/${etat.revision}/portail/membres`, { methode: 'POST', session: adminA, corps: { name: 'X', email: IDS.courriels.ingA } })).statut, 409);
  const reglage = await api(`/api/dossiers/${etat.revision}/portail/regles`, { methode: 'PUT', session: adminA, corps: { defauts: { '': membre.user.id, 'Ménagers': membre.user.id, 'Contrat': membre.user.id } } });
  assert.equal(reglage.statut, 200);
  const vue = (await api(`/api/portail/immeubles/${etat.revision}?annee=${Y}&mois=4`, { session })).json;
  assert.ok(vue.taches.length > 0);
  assert.ok(vue.taches.every((t) => t.responsable_id === membre.user.id));
  const t = vue.taches[0];
  assert.equal((await api(`/api/portail/immeubles/${etat.revision}/suivi`, { methode: 'POST', session, corps: { cle: t.cle, annee: Y, mois: 4, note: 'Fait.' } })).statut, 200);
  const apres = (await api(`/api/portail/immeubles/${etat.revision}?annee=${Y}&mois=4`, { session: adminA })).json;
  assert.equal(apres.taches.find((x) => x.cle === t.cle).fait.note, 'Fait.');
  assert.equal((await api(`/api/portail/immeubles/${etat.revision}/historique`, { session })).json.length, 1);
  assert.equal((await api(`/api/portail/immeubles/${etat.revision}/rapport.docx`, { session })).statut, 404);
  // Rappels du 1er du mois (tâche planifiée).
  const avant = nombreCourriels();
  assert.equal((await api('/__scheduled?cron=0+11+1+*+*', { brut: true })).status, 200);
  const envoyes = await courrielsApres(avant);
  assert.ok(envoyes.some((c) => c.includes('Gestionnaire du parcours')), 'aucun rappel reçu par le membre');
});
