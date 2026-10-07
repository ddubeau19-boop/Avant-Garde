// Révision au bureau : sections corrigées gardées au rapport, phrase du
// carnet jamais doublée, photo mal classée déplacée ou retirée, cotes de
// l'IA acceptées en lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS, texteDocx } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const image = () => { const f = new FormData(); f.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'p.jpg'); return f; };
async function dossierAvec(n = 2) {
  const id = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-RP-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name: 'Révision', units: 6 } })).json.id;
  const comps = (await api(`/api/dossiers/${id}/components`, { session: ingA })).json.filter((c) => c.actif !== 0);
  await api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session: ingA, corps: { ids: comps.slice(n).map((c) => c.id), actif: 0 } });
  return { id, comps: comps.slice(0, n) };
}

test('sections corrigées : gardées au rapport, réversibles ; carnet jamais doublé', async () => {
  const { id, comps: [c] } = await dossierAvec(1);
  const avant = (await api(`/api/components/${c.id}/redaction`, { methode: 'POST', session: ingA, corps: {} })).json;
  const duree = avant.sections.find((s) => s.cle === 'duree_vie');
  assert.equal(duree.corrige, false);
  const r = await api(`/api/components/${c.id}`, { methode: 'PATCH', session: ingA, corps: { textes_sections: { duree_vie: 'Durée corrigée par l’ingénieur : 30 ans selon le fabricant.', autre: 'ignoré' } } });
  assert.equal(r.statut, 200);
  assert.deepEqual(JSON.parse(r.json.textes_sections), { duree_vie: 'Durée corrigée par l’ingénieur : 30 ans selon le fabricant.' });
  const apres = (await api(`/api/components/${c.id}/redaction`, { methode: 'POST', session: ingA, corps: {} })).json;
  const d2 = apres.sections.find((s) => s.cle === 'duree_vie');
  assert.equal(d2.texte, 'Durée corrigée par l’ingénieur : 30 ans selon le fabricant.');
  assert.equal(d2.corrige, true);
  assert.ok(d2.tableau, 'le tableau reste calculé');

  // Texte d'état validé tel qu'affiché (avec la phrase du carnet) : une seule fois au rapport.
  const etat = apres.sections.find((s) => s.cle === 'etat').texte;
  const carnet = etat.split('\n\n').pop();
  await api(`/api/components/${c.id}/redaction`, { methode: 'PATCH', session: ingA, corps: { texte_retenu: etat, valide: true } });
  const texte = texteDocx(await (await api(`/api/dossiers/${id}/report.docx`, { session: ingA, brut: true })).arrayBuffer());
  assert.ok(texte.some((t) => t.includes('Durée corrigée par l’ingénieur')));
  assert.equal(texte.filter((t) => t === carnet).length, 1, 'phrase du carnet une seule fois');

  await api(`/api/components/${c.id}`, { methode: 'PATCH', session: ingA, corps: { textes_sections: null } });
  const remis = (await api(`/api/components/${c.id}/redaction`, { methode: 'POST', session: ingA, corps: {} })).json;
  assert.equal(remis.sections.find((s) => s.cle === 'duree_vie').texte, duree.texte, 'retour au texte calculé');
});

test('photo mal classée : déplacée (attention nettoyée) ou retirée ; cotes IA acceptées en lot', async () => {
  const { id, comps: [a, b] } = await dossierAvec(2);
  const autre = await dossierAvec(1);
  const p1 = (await api(`/api/components/${a.id}/photos`, { methode: 'POST', session: ingA, formulaire: image() })).json.id;
  const p2 = (await api(`/api/components/${a.id}/photos`, { methode: 'POST', session: ingA, formulaire: image() })).json.id;
  await api(`/api/components/${a.id}/attentions`, { methode: 'PUT', session: ingA, corps: { attentions: [{ titre: 'Fissure', photos: [p1, p2] }] } });

  const deplacer = (pid, comp, session = ingA) => api(`/api/photos/${pid}`, { methode: 'PATCH', session, corps: { component_id: comp } });
  assert.equal((await deplacer(p1, b.id, ingB)).statut, 404);
  assert.equal((await deplacer(p1, autre.comps[0].id)).statut, 404, "pas vers un autre dossier");
  assert.equal((await deplacer(p1, b.id)).statut, 200);
  const da = (await api(`/api/components/${a.id}`, { session: ingA })).json;
  const db = (await api(`/api/components/${b.id}`, { session: ingA })).json;
  assert.deepEqual(da.photos.map((p) => p.id), [p2]);
  assert.deepEqual(db.photos.map((p) => p.id), [p1]);
  assert.deepEqual(JSON.parse(da.attentions)[0].photos, [p2], "la photo déplacée quitte l'attention");

  assert.equal((await api(`/api/photos/${p2}`, { methode: 'DELETE', session: ingB })).statut, 404);
  assert.equal((await api(`/api/photos/${p2}`, { methode: 'DELETE', session: ingA })).statut, 200);
  assert.equal((await api(`/api/components/${a.id}`, { session: ingA })).json.photos.length, 0);
  assert.equal((await api(`/api/photos/${p2}/file`, { session: ingA, brut: true })).status, 404);

  // Cote proposée (non documentée), puis acceptée en lot.
  await api(`/api/components/${a.id}`, { methode: 'PATCH', session: ingA, corps: { rating: 2, done: 0 } });
  const lot = await api(`/api/dossiers/${id}/components/lot`, { methode: 'POST', session: ingA, corps: { ids: [a.id], done: 1 } });
  assert.equal(lot.json.modifiees, 1);
  assert.equal((await api(`/api/components/${a.id}`, { session: ingA })).json.done, 1);
});
