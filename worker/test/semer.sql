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
