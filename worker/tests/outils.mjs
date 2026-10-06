// Outils partagés par les tests : appels à l'API du worker local,
// jetons de session, courriels simulés, lecture d'un .docx ou .xlsx.
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const BASE = process.env.TESTS_BASE;
export const IDS = JSON.parse(process.env.TESTS_IDS || '{}');
const SECRET = process.env.TESTS_SECRET;

// Même format que le worker : « id.échéance.signature ».
export function jeton(userId, dureeMs = 3600e3) {
  const charge = `${userId}.${Date.now() + dureeMs}`;
  return `${charge}.${createHmac('sha256', SECRET).update(charge).digest('base64url')}`;
}

export async function api(chemin, { methode = 'GET', corps, session, formulaire, brut } = {}) {
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session}`;
  let body;
  if (formulaire) body = formulaire;
  else if (corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
  const res = await fetch(BASE + chemin, { method: methode, headers, body });
  if (brut) return res;
  const texte = await res.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
  return { statut: res.status, json, texte };
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Courriels envoyés par le worker local : wrangler écrit chacun dans un
// fichier et en donne le chemin dans son journal.
// Le simulateur d'envoi de wrangler écrit chaque courriel dans un fichier,
// sous worker/.wrangler/tmp/email/<instance>/email-text/.
const DOSSIER_COURRIELS = join(dirname(fileURLToPath(import.meta.url)), '..', '.wrangler', 'tmp', 'email');
function fichiersCourriels() {
  let instances = [];
  try { instances = readdirSync(DOSSIER_COURRIELS); } catch (e) { return []; }
  const fichiers = [];
  for (const i of instances) {
    const d = join(DOSSIER_COURRIELS, i, 'email-text');
    let noms = [];
    try { noms = readdirSync(d); } catch (e) { continue; }
    for (const n of noms) fichiers.push({ chemin: join(d, n), moment: statSync(join(d, n)).mtimeMs });
  }
  return fichiers.sort((a, b) => a.moment - b.moment);
}
// Marque à relever avant l'action qui envoie un courriel.
export const nombreCourriels = () => Date.now() - 5;
// Les courriels envoyés depuis la marque, en attendant qu'ils arrivent.
export async function courrielsApres(marque, { attendus = 1, delai = 10000 } = {}) {
  const fin = Date.now() + delai;
  let liste = fichiersCourriels().filter((f) => f.moment >= marque);
  while (liste.length < attendus && Date.now() < fin) {
    await pause(150);
    liste = fichiersCourriels().filter((f) => f.moment >= marque);
  }
  return liste.map((f) => readFileSync(f.chemin, 'utf8'));
}
export async function lienApres(marque) {
  const liste = await courrielsApres(marque);
  const m = (liste[liste.length - 1] || '').match(/jeton=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Lecture minimale d'une archive zip (docx, xlsx) : le contenu d'un fichier.
export function fichierZip(octets, nom) {
  const buf = Buffer.from(octets);
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('archive zip illisible');
  const nombre = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < nombre; i++) {
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const lgNom = buf.readUInt16LE(p + 28), lgExtra = buf.readUInt16LE(p + 30), lgComm = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const n = buf.toString('utf8', p + 46, p + 46 + lgNom);
    if (n === nom) {
      const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const donnees = buf.subarray(debut, debut + taille);
      return (methode === 8 ? inflateRawSync(donnees) : donnees).toString('utf8');
    }
    p += 46 + lgNom + lgExtra + lgComm;
  }
  return null;
}
export function texteDocx(octets) {
  const xml = fichierZip(octets, 'word/document.xml') || '';
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''))
    .filter(Boolean)
    .map((t) => t.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
export const proche = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
