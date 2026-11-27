// ============================================================
// Prépare www/ pour l'app Android : une copie de l'app terrain du site
// (worker/public/terrain), avec ce qu'elle charge d'ailleurs ramené dans
// l'app, pour qu'elle s'ouvre sans réseau dès le premier lancement.
//   node preparer-www.mjs            (site : https://pga.stratege.io)
//   CS_SITE=https://… node preparer-www.mjs
// www/ est régénéré à chaque fois : ne rien y modifier à la main.
// ============================================================
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ICI, '..', 'worker', 'public');
const WWW = join(ICI, 'www');
const SITE = (process.env.CS_SITE || 'https://pga.stratege.io').replace(/\/+$/, '');
const LUCIDE_EXTERNE = 'https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js';

rmSync(WWW, { recursive: true, force: true });
mkdirSync(join(WWW, 'vendor'), { recursive: true });
for (const dossier of ['terrain', 'shared', 'assets']) {
  cpSync(join(PUBLIC, dossier), join(WWW, dossier), { recursive: true });
}
// Le service worker ne sert qu'au site : dans l'app, les fichiers sont déjà là.
rmSync(join(WWW, 'terrain', 'sw.js'), { force: true });

cpSync(join(ICI, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'), join(WWW, 'vendor', 'capacitor.js'));
cpSync(join(ICI, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.js'), join(WWW, 'vendor', 'lucide.js'));

const chemin = join(WWW, 'terrain', 'index.html');
let html = readFileSync(chemin, 'utf8');
if (!html.includes(LUCIDE_EXTERNE)) throw new Error(`terrain/index.html ne charge plus ${LUCIDE_EXTERNE} : mettre à jour preparer-www.mjs.`);
html = html.replace(
  `<script src="${LUCIDE_EXTERNE}"></script>`,
  `<script>window.CS_SITE = ${JSON.stringify(SITE)};</script>\n` +
  `<script src="../vendor/capacitor.js"></script>\n` +
  `<script src="../vendor/lucide.js"></script>`
);
writeFileSync(chemin, html);

// L'app s'ouvre sur https://localhost/ : on y renvoie vers l'app terrain.
writeFileSync(join(WWW, 'index.html'),
  '<!DOCTYPE html><html lang="fr-CA"><head><meta charset="utf-8">' +
  '<meta http-equiv="refresh" content="0; url=terrain/"></head><body></body></html>\n');

if (!existsSync(join(WWW, 'terrain', 'natif.js'))) throw new Error('terrain/natif.js manquant.');
console.log(`www/ prêt (API : ${SITE}).`);
