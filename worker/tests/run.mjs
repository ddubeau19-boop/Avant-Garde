// ============================================================
// Tests automatisés — lanceur
// ------------------------------------------------------------
//   node worker/tests/run.mjs
// Crée une base D1 locale à partir de schema.sql, y dépose un jeu de
// données connu (deux firmes, leurs comptes, des dossiers), démarre le
// worker avec wrangler dev, puis lance les tests (node:test) contre lui.
// Rien ne touche la production : base, courriels et photos sont locaux.
// ============================================================
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, createWriteStream, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { donneesDeDepart } from './donnees.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const WORKER = join(ICI, '..');
const TRAVAIL = mkdtempSync(join(tmpdir(), 'cs-tests-'));
const ETAT = join(TRAVAIL, 'etat');
const JOURNAL = join(TRAVAIL, 'serveur.log');
const SECRET = 'secret-des-tests';
const PORT = 8800 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORT}`;
const WRANGLER = ['--yes', 'wrangler@4'];

function d1(fichier) {
  execFileSync('npx', [...WRANGLER, 'd1', 'execute', 'stratege-fp', '--local', '--persist-to', ETAT, '--file', fichier], { cwd: WORKER, stdio: 'pipe' });
}

console.log(`Base locale : ${ETAT}`);
d1('schema.sql');
const { sql, ids } = donneesDeDepart();
const fichierDonnees = join(TRAVAIL, 'donnees.sql');
writeFileSync(fichierDonnees, sql);
d1(fichierDonnees);

const journal = createWriteStream(JOURNAL);
const serveur = spawn('npx', [...WRANGLER, 'dev', '--local', '--test-scheduled', '--persist-to', ETAT, '--port', String(PORT),
  '--var', `SESSION_SECRET:${SECRET}`, '--var', `URL_PLATEFORME:${BASE}`], { cwd: WORKER, detached: true });
serveur.stdout.pipe(journal);
serveur.stderr.pipe(journal);

function arreter() {
  try { process.kill(-serveur.pid, 'SIGTERM'); } catch (e) { /* déjà arrêté */ }
}
process.on('exit', arreter);
process.on('SIGINT', () => { arreter(); process.exit(130); });

let pret = false;
for (let i = 0; i < 90 && !pret; i++) {
  try { pret = (await fetch(`${BASE}/api/health`)).ok; } catch (e) { /* pas encore */ }
  if (!pret) await new Promise((r) => setTimeout(r, 1000));
}
if (!pret) {
  console.error(`Le worker local n'a pas démarré. Journal : ${JOURNAL}`);
  arreter();
  process.exit(1);
}

const fichiers = readdirSync(ICI).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(ICI, f));
const resultat = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...fichiers], {
  stdio: 'inherit',
  env: { ...process.env, TESTS_BASE: BASE, TESTS_SECRET: SECRET, TESTS_JOURNAL: JOURNAL, TESTS_IDS: JSON.stringify(ids) },
});
arreter();
if (resultat.status === 0) rmSync(TRAVAIL, { recursive: true, force: true });
else console.error(`Journal du worker : ${JOURNAL}`);
process.exit(resultat.status ?? 1);
