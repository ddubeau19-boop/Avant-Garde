# Sauvegardes et restauration

La base de la plateforme (`stratege-fp`, Cloudflare D1) est protégée de deux façons.

## 1. Retour dans le temps de D1 (30 jours)

D1 garde l'historique de la base : on peut la ramener à n'importe quel moment des
30 derniers jours. C'est le premier recours après une erreur (suppression, import
raté), parce qu'il ramène **toute** la base à l'instant choisi.

```sh
# Le repère correspondant à un moment (heure UTC) :
npx wrangler d1 time-travel info stratege-fp --timestamp=2026-09-25T14:00:00Z
# Restaurer à ce moment (tout ce qui a suivi est perdu) :
npx wrangler d1 time-travel restore stratege-fp --timestamp=2026-09-25T14:00:00Z
```

## 2. Sauvegarde hebdomadaire dans R2 (six mois)

Chaque dimanche à 7 h UTC, le worker copie toutes les tables dans le bucket R2 des
photos, sous `sauvegardes/stratege-fp-AAAA-MM-JJ-HH-MM-SS.json.gz`. Les 26 dernières
sont gardées. La console d'administration (super admin) les liste, les télécharge
et peut en faire une sur-le-champ (« Sauvegarder maintenant »).

Restaurer une sauvegarde :

```sh
node worker/outils/restaurer-sauvegarde.mjs stratege-fp-2026-09-20-07-00-00.json.gz > restauration.sql
# D'abord sur une copie locale, pour vérifier :
npx wrangler d1 execute stratege-fp --local --file worker/schema.sql
npx wrangler d1 execute stratege-fp --local --file restauration.sql
# Puis, si tout est juste, sur la production :
npx wrangler d1 execute stratege-fp --remote --file restauration.sql
```

Le SQL vide chaque table puis y remet les lignes de la sauvegarde : ce qui a été
saisi depuis est perdu. Les photos, logos et gabarits Word sont dans R2 et ne sont
pas touchés.

## 3. Export d'une firme

L'administrateur d'une firme télécharge toutes ses données (écran Équipe du bureau,
« Télécharger l'export ») : JSON complet, dossiers et composantes en CSV. Les photos
se téléchargent par dossier (« Archive du dossier »).
