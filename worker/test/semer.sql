-- Entreprise et compte utilisés par worker/test/moteur.mjs.
--
-- Ce fichier ne sert QUE contre une base locale jetable :
--
--   npx wrangler d1 execute stratege-fp --local --file worker/schema.sql
--   npx wrangler d1 execute stratege-fp --local --file worker/test/semer.sql
--
-- Le mot de passe est « moteur-de-test-1 », haché avec la même recette que
-- l'application (PBKDF2-SHA256, 100 000 itérations, 256 bits, base64url). Il
-- n'ouvre rien d'autre que cette base locale : ne jamais exécuter ce fichier
-- contre la production.

INSERT INTO companies (id, name, slug) VALUES
  ('co_moteur', 'Firme de test', 'firme-de-test');

INSERT INTO users (id, email, name, password_hash, password_salt, company_id, role) VALUES
  ('usr_moteur', 'test@moteur.local', 'Compte de test',
   'pwenEEAgjG8jcwG6N3e66DMh3hUtXFXJW3Vxjy9haag',
   '91eKv9EiVmMSDKBbcSVT5w',
   'co_moteur', 'engineer');

-- Une seconde entreprise, dont l'identifiant est celui de CRM_COMPANY_ID dans
-- wrangler.toml. Le lien avec le CRM n'est ouvert qu'à cette entreprise-là :
-- deux comptes permettent donc de vérifier les deux côtés de la cloison — que
-- le portefeuille s'affiche pour elle, et qu'il reste fermé pour l'autre.
--
-- Même mot de passe, donc même sel et même empreinte : PBKDF2 est déterministe.
INSERT INTO companies (id, name, slug) VALUES
  ('com_980c47a26e91493593a8', 'Firme du portefeuille', 'firme-du-portefeuille');

INSERT INTO users (id, email, name, password_hash, password_salt, company_id, role) VALUES
  ('usr_crm', 'crm@moteur.local', 'Compte portefeuille',
   'pwenEEAgjG8jcwG6N3e66DMh3hUtXFXJW3Vxjy9haag',
   '91eKv9EiVmMSDKBbcSVT5w',
   'com_980c47a26e91493593a8', 'engineer');
