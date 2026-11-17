// Jeu de données de départ, connu d'avance : deux firmes étanches, leurs
// comptes, et un dossier aux composantes choisies pour vérifier le moteur
// financier à la main.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

export const MOT_DE_PASSE = 'mot de passe des tests';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function hash(motDePasse) {
  const sel = randomBytes(16);
  return { hash: b64url(pbkdf2Sync(motDePasse, sel, 100000, 32, 'sha256')), salt: b64url(sel) };
}
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export function donneesDeDepart() {
  const Y = new Date().getFullYear();
  const ids = {
    firmeA: 'com_a', firmeB: 'com_b',
    superAdmin: 'usr_sa', adminA: 'usr_adm_a', ingA: 'usr_ing_a', ingB: 'usr_ing_b', ingDesactive: 'usr_ing_off',
    dossierFinances: 'dos_fin', dossierB: 'dos_b', dossierVide: 'dos_vide',
    courriels: { superAdmin: 'sa@firme-a.test', adminA: 'admin@firme-a.test', ingA: 'ing@firme-a.test', ingB: 'ing@firme-b.test', ingDesactive: 'parti@firme-a.test' },
    annee: Y,
  };
  const lignes = [];
  lignes.push(`INSERT INTO companies (id, name, slug) VALUES ('com_a', 'Firme A', 'firme-a'), ('com_b', 'Firme B', 'firme-b');`);
  const compte = (id, courriel, nom, firme, role, actif = 1) => {
    const h = hash(MOT_DE_PASSE);
    lignes.push(`INSERT INTO users (id, email, name, password_hash, password_salt, company_id, role, actif) VALUES (${q(id)}, ${q(courriel)}, ${q(nom)}, ${q(h.hash)}, ${q(h.salt)}, ${q(firme)}, ${q(role)}, ${actif});`);
  };
  compte('usr_sa', ids.courriels.superAdmin, 'Super Admin', 'com_a', 'super_admin');
  compte('usr_adm_a', ids.courriels.adminA, 'Admin A', 'com_a', 'admin');
  compte('usr_ing_a', ids.courriels.ingA, 'Ingénieure A', 'com_a', 'engineer');
  compte('usr_ing_b', ids.courriels.ingB, 'Ingénieur B', 'com_b', 'engineer');
  compte('usr_ing_off', ids.courriels.ingDesactive, 'Ancien employé', 'com_a', 'engineer', 0);

  const dossier = (id, no, nom, firme, fonds, cotisation) =>
    lignes.push(`INSERT INTO dossiers (id, dossier_no, name, units, company_id, created_by, current_fund_balance, cotisation_annuelle) VALUES (${q(id)}, ${q(no)}, ${q(nom)}, 12, ${q(firme)}, 'usr_ing_a', ${q(fonds)}, ${q(cotisation)});`);
  dossier('dos_fin', 'T-FIN', 'Syndicat du moteur financier', 'com_a', 0, 0);
  dossier('dos_b', 'T-B', 'Syndicat de la firme B', 'com_b', 0, 0);
  dossier('dos_vide', 'T-VIDE', 'Syndicat sans dépense', 'com_a', 100000, 12000);

  // Composantes du dossier financier : chaque cas se calcule à la main.
  const comp = (id, o) => lignes.push(`INSERT INTO components (id, dossier_id, cat, name, done, install_year, residual, replacement_cost, useful_life_years, sort_order, actif) VALUES (${q(id)}, 'dos_fin', ${q(o.cat ?? 'enveloppe')}, ${q(o.name)}, ${o.done ?? 1}, ${q(o.install)}, ${q(o.residual)}, ${q(o.cost)}, ${q(o.vie)}, ${o.ordre ?? 0}, 1);`);
  comp('cmp_cinq', { name: 'Cycle de 10 ans, installé il y a 5 ans', cost: 10000, vie: 10, install: Y - 5, ordre: 1 });
  comp('cmp_echu', { name: 'Remplacement échu', cost: 20000, vie: 10, install: Y - 20, ordre: 2 });
  comp('cmp_residuel', { name: 'Sans année, 50 % de vie résiduelle', cost: 5000, vie: 20, residual: 50, ordre: 3 });
  comp('cmp_an31', { name: 'Cycle de 30 ans, retombe en année 31', cost: 30000, vie: 30, install: Y - 29, ordre: 4 });
  comp('cmp_non_doc', { name: 'Non documentée', cost: 999, vie: 10, install: Y, done: 0, ordre: 5 });
  comp('cmp_sans_cout', { name: 'Sans coût', vie: 10, install: Y, ordre: 6 });
  comp('cmp_sans_vie', { name: 'Catégorie sans durée par défaut', cat: 'zzz', cost: 1000, install: Y, ordre: 7 });
  return { sql: lignes.join('\n'), ids };
}
