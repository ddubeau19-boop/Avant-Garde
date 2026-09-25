-- Schéma de la base D1 « stratege-fp ».
--
-- Capturé depuis la base de production. Les colonnes ajoutées après coup par
-- ALTER TABLE sont ici regroupées à leur table, dans l'ordre où SQLite les
-- expose : ce fichier crée une base équivalente à la production à partir de rien.
--
--   npx wrangler d1 execute stratege-fp --file worker/schema.sql

CREATE TABLE companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_r2_key TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,   -- PBKDF2-SHA256, 100 000 itérations, 256 bits, base64url
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  company_id    TEXT REFERENCES companies(id),
  role          TEXT NOT NULL DEFAULT 'engineer',  -- 'engineer' | 'super_admin'
  -- Bloc de signature, repris tel quel à la section 8.0 Déclaration du rapport.
  title               TEXT,  -- ex. « ing., M.Sc.A. », « T.P. »
  ordre_professionnel TEXT,  -- ex. « OIQ », « OTPQ », « OAQ »
  no_membre           TEXT
);

CREATE TABLE dossiers (
  id                   TEXT PRIMARY KEY,
  dossier_no           TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  address              TEXT,
  city                 TEXT,
  units                INTEGER NOT NULL DEFAULT 0,
  floors               INTEGER,
  built_year           INTEGER,
  status               TEXT NOT NULL DEFAULT 'en_cours',
  created_by           TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  current_fund_balance REAL,
  cotisation_annuelle  REAL,
  published_at         TEXT,
  company_id           TEXT REFERENCES companies(id),
  batiment_info        TEXT   -- JSON : fiche d'immeuble saisie en terrain
);

CREATE TABLE components (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  cat          TEXT NOT NULL,   -- clé de CATEGORIES (terrain, structure, enveloppe, …)
  name         TEXT NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  etat         INTEGER,
  residual     INTEGER,         -- % de vie utile résiduelle, quand install_year est inconnue
  install_year INTEGER,
  qty          TEXT,
  note         TEXT,
  ai_suggested INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Financier
  replacement_cost  REAL,
  useful_life_years INTEGER,
  -- Relevé maison
  confirmed      INTEGER NOT NULL DEFAULT 0,
  rating         INTEGER,   -- 1 Bon · 2 Entretien normal · 3 Entretien requis · 4 Remplacement requis
  r_flag         INTEGER NOT NULL DEFAULT 0,
  observation    TEXT,
  cause_possible TEXT,
  delai_suggere  TEXT,
  consequences   TEXT,
  uniformat_code TEXT,
  position       TEXT,   -- AV | GA | ARR | DR
  emplacement    TEXT,   -- corridors | escaliers | stationnement
  variante       TEXT,
  attributs      TEXT,   -- JSON : attributs typés propres à la composante
  parent_id      TEXT,
  actif          INTEGER NOT NULL DEFAULT 1   -- 0 : retirée de la visite, réactivable
);

CREATE TABLE photos (
  id           TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL,
  tag          TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_components_dossier ON components(dossier_id);
CREATE INDEX idx_photos_component   ON photos(component_id);

-- Gabarit de rapport propre à une entreprise. Les firmes qui arrivent avec leur
-- propre gabarit d'étude surchargent ici les sections de TEXTE_MAISON ; celles
-- qui n'en ont pas héritent du gabarit intégré. Le .docx d'origine est conservé
-- en R2 pour qu'on puisse toujours remonter à la source d'un texte.
CREATE TABLE company_templates (
  company_id      TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  sections        TEXT,   -- JSON : surcharges, clé par clé, de TEXTE_MAISON
  source_r2_key   TEXT,
  source_filename TEXT,
  source_extrait  TEXT,   -- texte brut extrait du .docx, conservé tel quel
  imported_at     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Banque de rédactions : le texte produit pour chaque composante, étude après
-- étude. Cloisonnée par entreprise — la formulation d'une firme ne nourrit
-- jamais les rapports d'une autre. Seules les lignes valide = 1 servent
-- d'exemple : apprendre du texte non relu ferait réapprendre au modèle ses
-- propres approximations.
CREATE TABLE redactions (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id),
  dossier_id     TEXT REFERENCES dossiers(id) ON DELETE CASCADE,
  component_id   TEXT REFERENCES components(id) ON DELETE CASCADE,
  cat            TEXT,
  uniformat_code TEXT,
  name           TEXT,
  rating         INTEGER,
  observation    TEXT,      -- la note de terrain qui a produit le texte
  texte_genere   TEXT,      -- ce que le modèle a produit
  texte_retenu   TEXT,      -- ce que l'ingénieur a gardé après correction
  valide         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_redactions_banque    ON redactions(company_id, valide, uniformat_code);
CREATE INDEX idx_redactions_component ON redactions(component_id);
