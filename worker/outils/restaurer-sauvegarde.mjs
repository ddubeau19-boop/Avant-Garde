// ============================================================
// Sauvegarde R2 → SQL rejouable dans D1
// ------------------------------------------------------------
//   node worker/outils/restaurer-sauvegarde.mjs stratege-fp-AAAA-MM-JJ-….json.gz > restauration.sql
//   npx wrangler d1 execute stratege-fp --remote --file restauration.sql
// Le SQL vide chaque table sauvegardée puis y remet ses lignes. Il suppose
// le schéma en place (schema.sql, ou la base elle-même) : il ne crée rien.
// Voir SAUVEGARDES.md avant de l'exécuter sur la production.
// ============================================================
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const valeurSql = (v) => {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const nomSql = (n) => `"${String(n).replace(/"/g, '""')}"`;

export function sqlDeSauvegarde(sauvegarde) {
  if (sauvegarde?.format !== 'condo-strategis-sauvegarde') throw new Error("ce fichier n'est pas une sauvegarde de la plateforme");
  const lignes = ['PRAGMA defer_foreign_keys = ON;'];
  const tables = Object.keys(sauvegarde.tables);
  for (const t of tables) lignes.push(`DELETE FROM ${nomSql(t)};`);
  for (const t of tables) {
    for (const r of sauvegarde.tables[t]) {
      const cols = Object.keys(r);
      lignes.push(`INSERT INTO ${nomSql(t)} (${cols.map(nomSql).join(', ')}) VALUES (${cols.map((c) => valeurSql(r[c])).join(', ')});`);
    }
  }
  return lignes.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fichier = process.argv[2];
  if (!fichier) { console.error('usage : node restaurer-sauvegarde.mjs <sauvegarde.json.gz>'); process.exit(1); }
  const brut = readFileSync(fichier);
  const json = JSON.parse((fichier.endsWith('.gz') ? gunzipSync(brut) : brut).toString('utf8'));
  process.stdout.write(sqlDeSauvegarde(json));
  console.error(`${Object.keys(json.tables).length} tables, sauvegarde du ${json.cree_le}`);
}
