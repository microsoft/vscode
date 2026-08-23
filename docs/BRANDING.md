# GitCortex Studio — branding vérifié

Ce document décrit l’identité produit effectivement configurée dans `product.json` et consommée par les pipelines de build. Les identifiants techniques upstream nécessaires à la compatibilité restent inchangés sauf lorsqu’un identifiant d’installation doit être propre à GitCortex.

## Identité produit

| Champ `product.json` | Valeur effective |
| --- | --- |
| `nameShort` | `GitCortex` |
| `nameLong` | `GitCortex Studio` |
| `applicationName` | `gitcortex` |
| `dataFolderName` | `GitCortexStudio` |
| `sharedDataFolderName` | `GitCortexStudio-shared` |
| `win32MutexName` | `gitcortexstudio` |
| `win32DirName` | `GitCortex Studio` |
| `win32NameVersion` | `GitCortex Studio` |
| `win32RegValueName` | `GitCortexStudio` |
| `win32AppUserModelId` | `GitCortex.Studio` |
| `darwinBundleIdentifier` | `studio.gitcortex` |
| `linuxIconName` | `gitcortex` |
| `urlProtocol` | `gitcortex` |
| `serverApplicationName` | `gitcortex-server` |
| `serverDataFolderName` | `.gitcortex-server` |
| `tunnelApplicationName` | `gitcortex-tunnel` |
| `win32ShellNameShort` | `G&itCortex` |
| `win32TunnelServiceMutex` | `gitcortex-tunnelservice` |
| `win32TunnelMutex` | `gitcortex-tunnel` |

## Identifiants d’installation Windows

Les AppId utilisés par le build sont propres à GitCortex, stables et distincts des valeurs `microsoft/vscode`. `build/gulpfile.vscode.win32.ts` sélectionne les valeurs système ou utilisateur selon la cible, puis les injecte dans Inno Setup comme `AppId`. La valeur système correspondante est également fournie comme `IncompatibleTargetAppId` afin d’empêcher une confusion entre les cibles système et utilisateur.

| Architecture | Installateur système | Installateur utilisateur |
| --- | --- | --- |
| x64 | `{{C6C81077-3514-4B45-A310-3F77E2A4A7A4}` | `{{8476B1DB-0E8E-4690-874E-B5E37E4DBE09}` |
| arm64 | `{{E9397900-D454-49A8-86F6-C04FACB6D9F5}` | `{{E6B0B875-5427-45BC-B7B0-D9856142B195}` |

Ces quatre valeurs sont utilisées pour x64, arm64, les installateurs système et utilisateur, les mises à niveau et la désinstallation. Elles permettent à GitCortex de coexister avec VS Code et Code-OSS sans réutiliser leur identité Inno Setup.

## URLs et licences

| Champ | Valeur effective |
| --- | --- |
| `licenseName` | `MIT` |
| `licenseUrl` | `https://github.com/Frankenstein-dev197/vscode/blob/main/LICENSE.txt` |
| `serverLicenseUrl` | `https://github.com/Frankenstein-dev197/vscode/blob/main/LICENSE.txt` |
| `licenseFileName` | `LICENSE.txt` |
| `reportIssueUrl` | `https://github.com/Frankenstein-dev197/vscode/issues/new` |
| `repository` / `homepage` / `bugs` | Non définis dans `product.json` |
| `download URLs` | Non définies dans `product.json` |
| `update URLs` | Aucun canal Microsoft d’auto-mise à jour n’est configuré dans `product.json` |

Les extensions intégrées et les URLs de services conservées dans `product.json` sont des éléments fonctionnels ou de provenance, et ne doivent pas être réécrites en URLs GitCortex sans remplacement opérationnel correspondant. Les licences MIT, les notices Microsoft et les notices des composants tiers restent distribuées avec le produit.

## Pipeline de consommation

Le pipeline Windows lit les quatre champs `win32*x*AppId` depuis `product.json`; ils ne sont donc pas de simples valeurs documentaires. Les pipelines Linux et macOS lisent respectivement `applicationName`, `nameShort`, `nameLong`, `linuxIconName`, `urlProtocol` et `darwinBundleIdentifier` pour matérialiser les artefacts de la plateforme.

Toute modification de branding doit modifier d’abord `product.json`, puis mettre ce document à jour et vérifier le pipeline qui consomme le champ concerné.
