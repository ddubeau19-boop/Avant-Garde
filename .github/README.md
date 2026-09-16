# Garde-fous du dépôt

## Ce qu'un CI peut et ne peut pas faire

Un workflow GitHub Actions s'exécute **après** la poussée : il ne peut pas
l'empêcher. Il peut refuser une **fusion**, et seulement si ses vérifications
sont exigées par une règle de branche. Fermer la porte aux poussées directes
demande donc deux pièces :

| Pièce | Fichier | Ce qu'elle fait |
|---|---|---|
| Les vérifications | `workflows/ci.yml` | Juge chaque poussée et chaque PR : marqueurs de conflit, syntaxe, build du worker, `schema.sql` exécutable. |
| La règle de branche | `branch-protection.json` | Bloque la poussée directe et la fusion tant que les vérifications ne passent pas. **À importer une fois dans GitHub.** |

Le `ci.yml` seul signale ; il ne bloque pas. La règle seule bloque sans savoir
si le code tient. Les deux ensemble ferment le chemin.

## Importer la règle

Settings → Rules → Rulesets → New ruleset → **Import a ruleset** →
`.github/branch-protection.json`.

Ce que la règle pose :

- **Poussée directe interdite** sur le tronc : tout passe par une pull request.
- **Vérifications exigées** : « Vérification du worker » doit être au vert.
- **Branche à jour avant fusion** (`strict_required_status_checks_policy`).
  C'est la règle qui règle le problème des deux sessions en parallèle : la
  seconde PR ne peut pas fusionner sur une base devenue périmée, elle doit
  d'abord intégrer la première et se faire revérifier.
- **Ni suppression ni réécriture d'historique** du tronc.

Deux points à connaître :

- La règle vise `~DEFAULT_BRANCH`, pas un nom en dur. Elle suit donc la branche
  par défaut du dépôt, quelle qu'elle soit — inutile de la retoucher si le
  tronc change de nom.
- `required_approving_review_count` est à **0** volontairement. GitHub interdit
  d'approuver sa propre pull request : sur un dépôt à un seul mainteneur,
  exiger une approbation revient à ne plus jamais pouvoir fusionner.

## Après l'import

Les poussées directes échouent, y compris les miennes. Le cycle devient :
branche de travail → pull request → CI au vert → fusion.
