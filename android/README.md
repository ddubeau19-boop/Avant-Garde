# Application Android « Terrain »

Une **Trusted Web Activity** (TWA) : l'APK ouvre `https://pga.stratege.io/terrain/`
dans Chrome, en plein écran, sans barre d'adresse. Elle n'embarque aucun code
de l'app : le site reste la seule source.

- **Mises à jour** : un déploiement du worker arrive dans l'app au prochain
  lancement avec du réseau. Pas d'APK à republier.
- **Hors ligne** : assuré par le site lui-même. Le service worker
  (`worker/public/terrain/sw.js`) garde l'app ouvrable, et le stockage local
  (`offline.js`) conserve les saisies et les photos jusqu'au retour du réseau.
  La même chose marche sans APK : dans Chrome, menu ⋮ → *Installer l'application*.
- **Caméra, micro, dictée** : ce sont ceux de Chrome, donc tout marche comme
  dans le navigateur.

## Plein écran : la vérification Digital Asset Links

Android n'affiche l'app sans barre d'adresse que si le site déclare l'empreinte
de la clé qui a signé l'APK. Le worker sert cette déclaration à
`/.well-known/assetlinks.json` (voir `ANDROID_CERT_SHA256` dans
`worker/src/index.js`).

Si l'empreinte ne correspond pas, l'app fonctionne quand même, mais avec une
barre d'adresse en haut. Pour ajouter une nouvelle clé sans modifier le code,
définissez la variable `ANDROID_CERT_SHA256` du worker (empreintes SHA-256
séparées par des virgules).

Pour lire l'empreinte d'une clé :

    keytool -list -v -keystore terrain-release.jks -alias terrain | grep SHA256

## Construire l'APK

Il faut le JDK 17 ou plus récent, Gradle 8.x et le SDK Android (plateforme 35).

    cd android
    export ANDROID_HOME=/chemin/vers/android-sdk
    export TERRAIN_KEYSTORE=/chemin/vers/terrain-release.jks
    export TERRAIN_KEYSTORE_PASSWORD=...
    gradle assembleRelease
    # → app/build/outputs/apk/release/app-release.apk

Chaque nouvelle version doit porter un `TERRAIN_VERSION_CODE` plus grand que la
précédente. Sinon, Android refuse de l'installer par-dessus.

**Gardez la clé `.jks` et son mot de passe en lieu sûr, hors du dépôt.** Une mise
à jour de l'APK doit être signée avec la même clé : avec une autre clé, il
faudra désinstaller puis réinstaller l'app.

### Par GitHub Actions

Le workflow « APK Android » (`.github/workflows/android.yml`) construit l'APK
et le publie comme artefact. Il se lance à la main (Actions → APK Android →
Run workflow) ou à chaque modification de `android/`. Il utilise deux secrets
du dépôt :

| Secret | Contenu |
|---|---|
| `TERRAIN_KEYSTORE_BASE64` | le fichier `.jks` encodé : `base64 -w0 terrain-release.jks` |
| `TERRAIN_KEYSTORE_PASSWORD` | son mot de passe |

Sans ces secrets, le workflow construit un APK *debug*. Il s'installe, mais
s'affiche avec la barre d'adresse.

## Installer sur un téléphone

1. Copiez l'APK sur le téléphone (courriel, Drive, câble USB).
2. Ouvrez-le. Android demande d'autoriser l'installation d'applications de
   cette source : acceptez.
3. Lancez « Terrain » et connectez-vous **avec du réseau**. Ouvrez ensuite le
   dossier à visiter. L'app télécharge alors toutes les fiches du dossier ; la
   visite peut ensuite se faire sans signal.
