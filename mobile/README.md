# App Android « Inspection terrain »

Une app **Capacitor** qui embarque l'app terrain du site (`worker/public/terrain`)
et lui donne accès au téléphone. Elle parle à l'API de `https://pga.stratege.io`.

## Ce que l'app ajoute au site

| | Site / ancienne APK (navigateur) | App native |
|---|---|---|
| Bouton 📱 de la caméra | sélecteur de fichier | **appareil photo natif** : qualité de l'app photo du téléphone, et **copie dans la galerie** |
| Caméra continue | vraie photo (`ImageCapture`) quand le navigateur le permet | idem |
| Bouton retour d'Android | quitte la page | ferme la caméra, sinon revient à l'écran précédent ; sur le premier écran, l'app passe en arrière-plan |
| Rapports Word / Excel | téléchargement | menu de partage d'Android (Drive, Gmail, Fichiers…) |
| Ouverture sans réseau | grâce au service worker, après une première visite | toujours : les fichiers sont dans l'APK |

Le code commun vit dans `worker/public/terrain/natif.js` : dans un navigateur,
il ne fait rien et le site garde son comportement.

## Mises à jour

L'app contient une **copie** de l'app terrain. Un changement dans
`worker/public/terrain/` arrive sur le site au déploiement, mais dans l'app
seulement avec un nouvel APK. Le workflow « APK Android » le reconstruit à
chaque fusion qui touche ces fichiers. L'API, elle, est toujours celle du site.

## Construire l'APK

### Par GitHub Actions

Actions → **APK Android** → *Run workflow* (ou automatiquement à la fusion).
L'APK est dans l'artefact `inspection-terrain-apk`.

Secrets du dépôt (Settings → Secrets and variables → Actions) :

| Secret | Contenu |
|---|---|
| `TERRAIN_KEYSTORE_BASE64` | la clé encodée : `base64 -w0 terrain-inspection.jks` |
| `TERRAIN_KEYSTORE_PASSWORD` | son mot de passe |

Sans ces secrets, l'APK est signé avec une clé de débogage et **ne s'installe
pas par-dessus** l'app déjà installée.

### Sur un poste

Node 22, JDK 21, SDK Android (plateforme 36).

```bash
cd mobile
npm ci
export ANDROID_HOME=/chemin/vers/android-sdk
export TERRAIN_KEYSTORE=/chemin/vers/terrain-inspection.jks
export TERRAIN_KEYSTORE_PASSWORD=...
export TERRAIN_VERSION_CODE=2        # plus grand que l'APK précédent
npm run apk
# → android/app/build/outputs/apk/release/app-release.apk
```

`CS_SITE=https://…` devant `npm run apk` fait pointer l'app vers un autre
serveur (essais). Le serveur doit alors autoriser l'origine de l'app :
variable `ORIGINES_APP` du worker (par défaut `https://localhost`).

## La clé de signature

**Gardez `terrain-inspection.jks` et son mot de passe en lieu sûr, hors du
dépôt.** Toute mise à jour doit être signée avec la même clé. Avec une autre
clé, il faut désinstaller l'app, ce qui efface les photos et modifications
pas encore envoyées.

## Fichiers

- `preparer-www.mjs` : copie l'app terrain dans `www/` (régénéré, ignoré par git),
  y ajoute le runtime Capacitor et les icônes Lucide, et fixe l'adresse du site.
- `capacitor.config.json` : identifiant `io.stratege.pga.inspection`.
- `android/` : projet Android généré par Capacitor, avec les autorisations
  (caméra), l'icône et la signature.
