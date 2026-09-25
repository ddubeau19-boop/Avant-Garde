// Permissions : chaque firme est étanche, les rôles bornent ce qu'on peut
// modifier, et un compte du portail n'atteint que le portail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, jeton, IDS } from './outils.mjs';

const ingA = jeton(IDS.ingA), ingB = jeton(IDS.ingB), adminA = jeton(IDS.adminA), superAdmin = jeton(IDS.superAdmin);

test('sans session, l\'API refuse', async () => {
  assert.equal((await api('/api/dossiers')).statut, 401);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}`)).statut, 401);
  assert.equal((await api('/api/health')).statut, 200);
});

test('jeton falsifié ou expiré : refusé', async () => {
  const [id, echeance] = ingA.split('.');
  assert.equal((await api('/api/auth/me', { session: `${id}.${echeance}.signature-fausse` })).statut, 401);
  assert.equal((await api('/api/auth/me', { session: jeton(IDS.ingA, -1000) })).statut, 401);
});

test('une firme ne voit rien d\'une autre', async () => {
  const liste = (await api('/api/dossiers', { session: ingB })).json;
  assert.ok(liste.every((d) => d.company_id === IDS.firmeB));
  assert.ok(!liste.some((d) => d.id === IDS.dossierFinances));
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}/components`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}/projection`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}/report.docx`, { session: ingB })).statut, 404);
  assert.equal((await api('/api/components/cmp_cinq', { session: ingB })).statut, 404);
  assert.equal((await api('/api/components/cmp_cinq', { methode: 'PATCH', session: ingB, corps: { rating: 1 } })).statut, 404);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/theme`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { session: ingB })).statut, 404);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}/portail`, { session: ingB })).statut, 404);
});

test('un ingénieur consulte les réglages de sa firme sans pouvoir les changer', async () => {
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { session: ingA })).statut, 200);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { session: ingA })).json.peutModifier, false);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/theme`, { methode: 'PATCH', session: ingA, corps: { accent: 'FF0000' } })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/bibliotheque`, { methode: 'DELETE', session: ingA })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/mise-en-page`, { methode: 'DELETE', session: ingA })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe`, { session: ingA })).statut, 403);
  assert.equal((await api(`/api/dossiers/${IDS.dossierFinances}/portail/regles`, { methode: 'PUT', session: ingA, corps: { defauts: {} } })).statut, 403);
});

test('l\'administrateur de la firme gère sa firme, et seulement elle', async () => {
  assert.equal((await api(`/api/companies/${IDS.firmeA}/theme`, { methode: 'PATCH', session: adminA, corps: { accent: 'FF5E39' } })).statut, 200);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe`, { session: adminA })).statut, 200);
  assert.equal((await api(`/api/companies/${IDS.firmeB}/equipe`, { session: adminA })).statut, 404);
  // Il ne se retire pas lui-même, et ne touche pas au super admin.
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe/${IDS.adminA}`, { methode: 'PATCH', session: adminA, corps: { actif: false } })).statut, 400);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/equipe/${IDS.superAdmin}`, { methode: 'PATCH', session: adminA, corps: { role: 'engineer' } })).statut, 400);
});

test('la console d\'administration est réservée au super admin', async () => {
  assert.equal((await api('/api/companies', { session: superAdmin })).statut, 200);
  assert.equal((await api('/api/companies', { session: adminA })).statut, 403);
  assert.equal((await api('/api/companies', { session: ingA })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/engineers/${IDS.ingA}`, { methode: 'PATCH', session: adminA, corps: { role: 'admin' } })).statut, 403);
});

test('un compte désactivé est refusé, même avec une session encore valide', async () => {
  assert.equal((await api('/api/auth/me', { session: jeton(IDS.ingDesactive) })).statut, 401);
});

test('logo : l\'administrateur de la firme envoie un PNG ou un JPEG vérifié ; ni SVG, ni ingénieur, ni autre firme', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');
  const envoi = (octets, type, nom, session) => {
    const f = new FormData();
    f.append('file', new Blob([octets], { type }), nom);
    return api(`/api/companies/${IDS.firmeA}/logo`, { methode: 'POST', session, formulaire: f });
  };
  assert.equal((await envoi(png, 'image/png', 'logo.png', ingA)).statut, 403);
  assert.equal((await envoi(png, 'image/png', 'logo.png', ingB)).statut, 404);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  assert.equal((await envoi(svg, 'image/svg+xml', 'logo.svg', adminA)).statut, 400);
  // Un fichier déguisé : type annoncé PNG, contenu quelconque.
  assert.equal((await envoi('pas une image', 'image/png', 'logo.png', adminA)).statut, 400);
  assert.equal((await envoi(png, 'image/png', 'logo.png', adminA)).statut, 200);
  const lu = await api(`/api/companies/${IDS.firmeA}/logo`, { session: ingA, brut: true });
  assert.equal(lu.status, 200);
  assert.equal(lu.headers.get('content-type'), 'image/png');
  assert.match(lu.headers.get('content-security-policy') || '', /sandbox/);
});
