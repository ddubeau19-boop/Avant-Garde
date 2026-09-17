-- Un CRM miniature, pour la base locale `stratege-crm`.
--
-- Le vrai CRM Stratégis compte plus de trois cents tables ; le worker n'en lit
-- qu'une poignée, en SELECT seulement. On reproduit ici juste ce qu'il
-- interroge, avec assez de lignes pour que chaque statut du calendrier soit
-- exercé par un cas réel plutôt que par un commentaire.
--
--   npx wrangler d1 execute stratege-crm --local --file worker/test/semer-crm.sql
--
-- Comme semer.sql, ce fichier ne vise qu'une base locale jetable : il ne doit
-- jamais être exécuté contre la production, où il écraserait le vrai CRM.

DROP TABLE IF EXISTS syndicats;
CREATE TABLE syndicats (
  id                          TEXT PRIMARY KEY,
  nom                         TEXT NOT NULL,
  address                     TEXT,
  city                        TEXT,
  units                       INTEGER,
  gestionnaire_name           TEXT,
  date_fin_contrat            TEXT,
  actif                       INTEGER NOT NULL DEFAULT 1,
  superseded_by_syndicat_id   TEXT
);

DROP TABLE IF EXISTS syndicat_reserve_fund_studies;
CREATE TABLE syndicat_reserve_fund_studies (
  id            TEXT PRIMARY KEY,
  syndicat_id   TEXT NOT NULL,
  study_date    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  is_current    INTEGER NOT NULL DEFAULT 1
);

DROP TABLE IF EXISTS syndicat_factures;
CREATE TABLE syndicat_factures (
  id             TEXT PRIMARY KEY,
  syndicat_id    TEXT NOT NULL,
  numero_facture TEXT,
  vendor_name    TEXT,
  date_facture   TEXT,
  deleted_at     TEXT
);

DROP TABLE IF EXISTS component_cost_matches;
CREATE TABLE component_cost_matches (
  source_type    TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  component_code TEXT NOT NULL,
  amount         REAL,
  syndicat_name  TEXT,
  document_date  TEXT,
  description    TEXT,
  confidence     TEXT,
  reference_url  TEXT,
  matched_at     TEXT NOT NULL,
  PRIMARY KEY (source_type, source_id)
);

-- Quatre copropriétés actives, une par statut du calendrier.
INSERT INTO syndicats (id, nom, address, city, units, gestionnaire_name) VALUES
  ('syn_retard',   'Syndicat Les Ormes',     '10 rue des Ormes',    'Longueuil', 24, 'A. Gestion'),
  ('syn_a_jour',   'Syndicat Le Belvédère',  '200 av. du Parc',     'Montréal',  60, 'A. Gestion'),
  ('syn_a_prevoir','Syndicat Les Cèdres',    '5 place des Cèdres',  'Brossard',  18, 'B. Gestion'),
  ('syn_inconnu',  'Syndicat Rive-Sud',      '77 boul. Taschereau', 'Brossard',   8, 'B. Gestion'),
  ('syn_nouveau',  'Syndicat Du Moulin',     '3 chemin du Moulin',  'Chambly',   12, 'B. Gestion');

-- Deux copropriétés qui ne doivent PAS figurer au calendrier : un contrat
-- terminé et une entité remplacée par une autre. Si elles apparaissent, le
-- portefeuille compte des immeubles que la firme ne gère plus.
INSERT INTO syndicats (id, nom, city, units, actif, superseded_by_syndicat_id) VALUES
  ('syn_inactif',  'Syndicat Ancien Client', 'Laval',    30, 0, NULL),
  ('syn_remplace', 'Syndicat Fusionné',      'Montréal', 40, 1, 'syn_a_jour');

-- Les études que le CRM connaît. Les dates sont relatives à aujourd'hui pour
-- que le test ne pourrisse pas avec le temps.
INSERT INTO syndicat_reserve_fund_studies (id, syndicat_id, study_date, expires_at, is_current) VALUES
  ('rfs_1', 'syn_retard',    date('now','-7 years'),            date('now','-2 years'), 1),
  ('rfs_2', 'syn_a_jour',    date('now','-1 years'),            date('now','+4 years'), 1),
  ('rfs_3', 'syn_a_prevoir', date('now','-4 years','-6 months'), date('now','+6 months'), 1);

-- De quoi exercer l'import du CRM vers la banque de prix : deux versements
-- d'une même toiture le même mois, qui doivent se regrouper en une observation.
INSERT INTO syndicat_factures (id, syndicat_id, numero_facture, vendor_name, date_facture) VALUES
  ('fac_1', 'syn_a_jour', 'F-1001', 'Toitures Nord', date('now','-1 years')),
  ('fac_2', 'syn_a_jour', 'F-1002', 'Toitures Nord', date('now','-1 years'));

INSERT INTO component_cost_matches (source_type, source_id, component_code, amount, syndicat_name, document_date, description, confidence, matched_at) VALUES
  ('syndicat_facture', 'fac_1', 'B30.10', 42000, 'Syndicat Le Belvédère', date('now','-1 years'), 'Réfection de la toiture — acompte', 'haute', date('now')),
  ('syndicat_facture', 'fac_2', 'B30.10', 18000, 'Syndicat Le Belvédère', date('now','-1 years'), 'Réfection de la toiture — solde',   'haute', date('now'));
