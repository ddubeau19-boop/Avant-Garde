// Export d'une firme, archive d'un dossier, sauvegarde complète et restauration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { api, jeton, IDS, fichierZip } from './outils.mjs';
import { sqlDeSauvegarde } from '../outils/restaurer-sauvegarde.mjs';

const ingA = jeton(IDS.ingA), adminA = jeton(IDS.adminA), ingB = jeton(IDS.ingB), superAdmin = jeton(IDS.superAdmin);
const ICI = dirname(fileURLToPath(import.meta.url));

function nomsZip(octets) {
  const buf = Buffer.from(octets);
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  const noms = [];
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const lgNom = buf.readUInt16LE(p + 28);
    noms.push(buf.toString('utf8', p + 46, p + 46 + lgNom));
    p += 46 + lgNom + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return noms;
}

test('export de la firme : toutes ses données, sans secret ni donnée d\'une autre firme', async () => {
  assert.equal((await api(`/api/companies/${IDS.firmeA}/export.zip`, { session: ingA })).statut, 403);
  assert.equal((await api(`/api/companies/${IDS.firmeA}/export.zip`, { session: ingB })).statut, 404);
  const res = await api(`/api/companies/${IDS.firmeA}/export.zip`, { session: adminA, brut: true });
  assert.equal(res.status, 200);
  const zip = await res.arrayBuffer();
  assert.deepEqual(nomsZip(zip).sort(), ['LISEZ-MOI.txt', 'composantes.csv', 'donnees.json', 'dossiers.csv']);
  const texte = fichierZip(zip, 'donnees.json');
  const d = JSON.parse(texte);
  assert.equal(d.firme.id, IDS.firmeA);
  assert.ok(d.dossiers.some((x) => x.id === IDS.dossierFinances));
  assert.ok(!d.dossiers.some((x) => x.company_id !== IDS.firmeA));
  assert.ok(d.composantes.length > 0 && d.equipe.length > 0);
  assert.ok(!/password_hash|password_salt/.test(texte), 'aucun secret exporté');
  assert.ok(!texte.includes('dos_b') && !texte.includes('Syndicat de la firme B'));
  const csv = fichierZip(zip, 'dossiers.csv');
  assert.ok(csv.startsWith('﻿Dossier;Syndicat;'));
});

test('archive d\'un dossier : ses données et ses photos', async () => {
  const d = (await api('/api/dossiers', { methode: 'POST', session: ingA, corps: { dossier_no: `T-ARC-${Date.now()}`, name: 'Archive', units: 3 } })).json;
  const comp = (await api(`/api/dossiers/${d.id}/components`, { session: ingA })).json[0];
  const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
  const f = new FormData();
  f.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
  assert.equal((await api(`/api/components/${comp.id}/photos`, { methode: 'POST', session: ingA, formulaire: f })).statut, 201);
  assert.equal((await api(`/api/dossiers/${d.id}/archive.zip`, { session: ingB })).statut, 404);
  const zip = await (await api(`/api/dossiers/${d.id}/archive.zip`, { session: ingA, brut: true })).arrayBuffer();
  const noms = nomsZip(zip);
  assert.ok(noms.includes('donnees.json') && noms.includes('composantes.csv'));
  const photos = noms.filter((n) => n.startsWith('photos/') && !n.endsWith('/'));
  assert.equal(photos.length, 1);
  assert.ok(photos[0].includes(comp.name.slice(0, 20).replace(/[\\/:*?"<>|]/g, '-')));
  const donnees = JSON.parse(fichierZip(zip, 'donnees.json'));
  assert.equal(donnees.photos[0].fichier, photos[0]);
  assert.equal(donnees.photos_non_incluses.length, 0);
});

test('sauvegarde complète : réservée au super admin, et restaurable dans une base vide', async () => {
  assert.equal((await api('/api/sauvegardes', { methode: 'POST', session: adminA })).statut, 403);
  const r = await api('/api/sauvegardes', { methode: 'POST', session: superAdmin });
  assert.equal(r.statut, 201);
  const liste = (await api('/api/sauvegardes', { session: superAdmin })).json;
  const nom = r.json.cle.split('/').pop();
  assert.ok(liste.some((x) => x.nom === nom));
  assert.equal((await api('/api/sauvegardes/..%2Fphotos%2Fx', { session: superAdmin })).statut, 400);
  const brut = await (await api(`/api/sauvegardes/${nom}`, { session: superAdmin, brut: true })).arrayBuffer();
  const sauvegarde = JSON.parse(gunzipSync(Buffer.from(brut)).toString('utf8'));
  assert.ok(sauvegarde.tables.dossiers.some((x) => x.id === IDS.dossierB));
  // Restaurée dans une base neuve créée depuis schema.sql : mêmes lignes.
  const base = new DatabaseSync(':memory:');
  base.exec(readFileSync(join(ICI, '..', 'schema.sql'), 'utf8'));
  // Les colonnes ajoutées à chaud existent déjà dans schema.sql ; les tables créées à chaud aussi.
  // D1 exécute un fichier en une transaction : les clés étrangères sont vérifiées à la fin.
  base.exec(`BEGIN;\n${sqlDeSauvegarde(sauvegarde)}COMMIT;`);
  for (const t of ['dossiers', 'components', 'users', 'clients', 'journal']) {
    assert.equal(base.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, sauvegarde.tables[t].length, t);
  }
  // La tâche du dimanche fait la même sauvegarde.
  const avant = (await api('/api/sauvegardes', { session: superAdmin })).json.length;
  await new Promise((ok) => setTimeout(ok, 1100)); // noms à la seconde près
  assert.equal((await api('/__scheduled?cron=0+7+*+*+0', { brut: true })).status, 200);
  let apres = avant;
  for (let i = 0; i < 20 && apres === avant; i++) {
    await new Promise((ok) => setTimeout(ok, 250));
    apres = (await api('/api/sauvegardes', { session: superAdmin })).json.length;
  }
  assert.equal(apres, avant + 1);
  const u = base.prepare('SELECT password_hash FROM users WHERE id = ?').get(IDS.ingA);
  assert.ok(u.password_hash, 'la sauvegarde garde tout, secrets compris, pour restaurer les comptes');
});
