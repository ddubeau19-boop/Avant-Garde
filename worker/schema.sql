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
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  theme        TEXT,   -- JSON : couleurs, polices et coordonnées du rapport de la firme
  mise_en_page TEXT,   -- JSON : gabarit Word de mise en page importé (clé R2, analyse)
  bibliotheque TEXT    -- JSON : liste de composantes et tâches du carnet importées par la firme
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,   -- PBKDF2-SHA256, 100 000 itérations, 256 bits, base64url
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  company_id    TEXT REFERENCES companies(id),
  role          TEXT NOT NULL DEFAULT 'engineer',  -- 'engineer' | 'admin' (administrateur de la firme) | 'super_admin' | 'portail' (membre d'un syndicat)
  -- Bloc de signature, repris tel quel à la section 8.0 Déclaration du rapport.
  title               TEXT,  -- ex. « ing., M.Sc.A. », « T.P. »
  ordre_professionnel TEXT,  -- ex. « OIQ », « OTPQ », « OAQ »
  no_membre           TEXT,
  actif                 INTEGER NOT NULL DEFAULT 1,  -- 0 : désactivé par l'administrateur de la firme
  invitation_en_attente INTEGER NOT NULL DEFAULT 0,  -- 1 : invité, mot de passe pas encore choisi
  sessions_apres        INTEGER                      -- ms : sessions émises avant refusées
);

-- Liens envoyés par courriel (invitation, réinitialisation) : seule
-- l'empreinte SHA-256 du jeton est gardée ; un lien sert une fois.
CREATE TABLE jetons_compte (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,     -- 'invitation' | 'reinitialisation'
  expire_le  INTEGER NOT NULL,  -- ms
  utilise_le TEXT,
  cree_le    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Tentatives de connexion et demandes de réinitialisation, pour les limiter.
CREATE TABLE tentatives_connexion (cle TEXT NOT NULL, moment INTEGER NOT NULL);
CREATE INDEX idx_tentatives_cle ON tentatives_connexion(cle, moment);

-- Portail du syndicat (gratuit) : les membres d'un immeuble (comptes users de
-- rôle « portail », sans firme), la répartition des tâches du carnet et
-- l'historique de ce qui a été fait.
CREATE TABLE portail_acces (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  fonction   TEXT,              -- ex. « Gestionnaire », « Président du CA »
  cree_le    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, dossier_id)
);
-- cle « q:<responsable> » : défaut pour un type de responsable ;
-- cle « t:<élément>::<tâche> » : exception pour une tâche (user_id NULL = personne).
CREATE TABLE carnet_regles (
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  cle        TEXT NOT NULL,
  user_id    TEXT,
  PRIMARY KEY (dossier_id, cle)
);
CREATE TABLE carnet_suivi (
  id         TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  cle_tache  TEXT NOT NULL,
  annee      INTEGER NOT NULL,
  mois       INTEGER NOT NULL,
  fait_le    TEXT NOT NULL,
  fait_par   TEXT,
  note       TEXT,
  UNIQUE (dossier_id, cle_tache, annee, mois)
);

-- Historique des modifications d'un dossier et de ses composantes : auteur,
-- moment et, champ par champ, l'ancienne et la nouvelle valeur (JSON).
CREATE TABLE journal (
  id           TEXT PRIMARY KEY,
  dossier_id   TEXT NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  component_id TEXT,
  user_id      TEXT,
  action       TEXT NOT NULL,   -- creation | modification | ajout | photo | import | suivi | publication | depublication | revision
  champs       TEXT,
  moment       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_journal_dossier ON journal(dossier_id, moment);

-- Clients de la firme : les syndicats, leurs coordonnées et leurs contacts.
CREATE TABLE clients (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nom                TEXT NOT NULL,
  adresse            TEXT,
  ville              TEXT,
  code_postal        TEXT,
  unites             INTEGER,
  annee_construction INTEGER,
  neq                TEXT,
  contacts           TEXT,   -- JSON : [{ nom, fonction, courriel, telephone }]
  notes              TEXT,
  crm_id             TEXT,   -- syndicat du CRM Stratégis, s'il en vient
  cree_le            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_clients_firme ON clients(company_id, nom);

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
  batiment_info        TEXT,  -- JSON : fiche d'immeuble saisie en terrain
  revision_de          TEXT,  -- étude précédente du même immeuble (révision aux cinq ans)
  rappel_revision_le   TEXT,  -- dernier rappel de révision envoyé à la firme
  assigne_a            TEXT,  -- membre de la firme responsable du dossier
  echeance             TEXT,  -- date de livraison visée (AAAA-MM-JJ)
  client_id            TEXT   -- syndicat client (clients.id)
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
  actif          INTEGER NOT NULL DEFAULT 1,  -- 0 : retirée de la visite, réactivable
  -- Gabarit de réponse du relevé (vocabulaire fermé, clés ci-dessous)
  etendue            TEXT,   -- ponctuel | localise | generalise
  etendue_qte        TEXT,   -- quantité touchée, ex. « ≈ 4 m² »
  limite_observation TEXT,   -- de_pres | distance | partiel | inaccessible
  limite_detail      TEXT,
  nature_risque      TEXT,   -- securite | infiltration | degradation | conformite | esthetique
  source_annee       TEXT,   -- plaque | carnet | administration | estimee
  projet_ca          TEXT,   -- travaux planifiés par le conseil d'administration
  taches_entretien   TEXT,   -- JSON : tâches du carnet retirées ou ajoutées par l'ingénieur
  -- Révision aux cinq ans
  origine_id         TEXT,    -- composante de l'étude précédente
  travaux_periode    TEXT,    -- fait | reporte | abandonne : travaux prévus à l'étude précédente
  travaux_annee      INTEGER  -- année des travaux réalisés
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

-- Banque de prix : une ligne par travail réellement facturé (ou soumissionné),
-- ramené à un prix unitaire. Cloisonnée par entreprise comme la banque de
-- rédactions — les prix qu'une firme a payés ne nourrissent jamais les études
-- d'une autre.
--
-- On conserve le montant et la quantité plutôt que le seul prix unitaire : le
-- chiffre reste remontable à la facture, et une quantité corrigée corrige le
-- prix sans qu'on ait à ressaisir la ligne. « montant » est le coût des travaux
-- seuls — taxes, honoraires, permis et contingence retirés à la saisie, sans
-- quoi on comparerait des portées différentes.
--
-- Seules les lignes valide = 1 servent de référence : une extraction non relue
-- ferait entrer dans la banque des quantités devinées.
CREATE TABLE price_observations (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id),
  dossier_id     TEXT REFERENCES dossiers(id) ON DELETE SET NULL,
  cat            TEXT,      -- clé de CATEGORIES, comme components.cat
  uniformat_code TEXT,
  description    TEXT NOT NULL,
  fournisseur    TEXT,
  annee          INTEGER NOT NULL,   -- année des travaux : sert à indexer le prix
  montant        REAL NOT NULL,      -- $ des travaux seuls, avant taxes et honoraires
  quantite       REAL,               -- nulle pour un forfait
  unite          TEXT NOT NULL,      -- pi2 | pi_lin | unite | forfait
  portee         TEXT,               -- complet | partiel | reparation
  source         TEXT NOT NULL DEFAULT 'facture',  -- facture | soumission
  negocie        INTEGER NOT NULL DEFAULT 0,  -- prix de portefeuille, pas un prix de marché
  ville          TEXT,
  unites         INTEGER,   -- portes de l'immeuble : le dénominateur qu'on a toujours, quand la superficie manque
  contexte       TEXT,      -- JSON : unités, étages, année de construction du bâtiment
  source_ref     TEXT,      -- no de facture ou renvoi à la pièce
  note           TEXT,      -- ce qui a été retiré du montant, particularités d'accès
  valide         INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_prix_banque  ON price_observations(company_id, valide, uniformat_code);
CREATE INDEX idx_prix_dossier ON price_observations(dossier_id);

-- Les pièces du CRM derrière une observation. Une facture y est souvent
-- fractionnée en versements — quatre lignes pour un seul toit — alors qu'une
-- observation de prix doit représenter le travail entier : la relation est donc
-- « une observation, plusieurs pièces ».
--
-- La clé primaire porte la traçabilité et la protection contre le double
-- import : une pièce du CRM entre au plus une fois par entreprise, et rouvrir
-- la file ne reproposera pas ce qui a déjà été versé à la banque.
CREATE TABLE price_observation_sources (
  observation_id TEXT NOT NULL REFERENCES price_observations(id) ON DELETE CASCADE,
  company_id     TEXT NOT NULL REFERENCES companies(id),
  source_type    TEXT NOT NULL,   -- 'syndicat_facture' | 'mailbox_attachment'
  source_id      TEXT NOT NULL,
  montant        REAL,
  reference      TEXT,   -- no de facture, ou lien vers la pièce
  date_piece     TEXT,
  description    TEXT,
  imported_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (company_id, source_type, source_id)
);

CREATE INDEX idx_prix_sources_obs ON price_observation_sources(observation_id);
