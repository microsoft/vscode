# GitCortex Studio Branding

This document records the **surgical** branding changes applied to transform
the visible product identity from **Code - OSS** (upstream microsoft/vscode) to
**GitCortex Studio**, while preserving all technical identifiers, API
compatibility, and upstream legal attributions.

> **Absolute rule**: No global `sed` rewrites. Only user-visible identity fields
> are changed. Technical VS Code identifiers needed for the extension API,
> internal services, protocols, tests, dependencies, and upstream references are
> preserved.

## 1. Product identity (GitCortex Studio)

| Field | Value |
|---|---|
| Long name | GitCortex Studio |
| Short name | GitCortex |
| Application ID | `studio.gitcortex` |
| URL protocol | `gitcortex://` (`urlProtocol: gitcortex`) |
| Data directory | `GitCortexStudio` |
| CLI command (`applicationName`) | `gitcortex` |

## 2. Visible branding changes applied (product.json)

Only user-visible / product-identity fields were modified:

| `product.json` field | Before | After |
|---|---|---|
| `nameShort` | `Code - OSS` | `GitCortex` |
| `nameLong` | `Code - OSS` | `GitCortex Studio` |
| `applicationName` | `code-oss` | `gitcortex` |
| `dataFolderName` | `.vscode-oss` | `GitCortexStudio` |
| `sharedDataFolderName` | `.vscode-oss-shared` | `GitCortexStudio-shared` |
| `win32MutexName` | `vscodeoss` | `gitcortexstudio` |
| `serverApplicationName` | `code-server-oss` | `gitcortex-server` |
| `serverDataFolderName` | `.vscode-server-oss` | `.gitcortex-server` |
| `tunnelApplicationName` | `code-tunnel-oss` | `gitcortex-tunnel` |
| `win32DirName` | `Microsoft Code OSS` | `GitCortex Studio` |
| `win32NameVersion` | `Microsoft Code OSS` | `GitCortex Studio` |
| `win32RegValueName` | `CodeOSS` | `GitCortexStudio` |
| `win32AppUserModelId` | `Microsoft.CodeOSS` | `GitCortex.Studio` |
| `win32ShellNameShort` | `C&ode - OSS` | `G&itCortex` |
| `win32TunnelServiceMutex` | `vscodeoss-tunnelservice` | `gitcortex-tunnelservice` |
| `win32TunnelMutex` | `vscodeoss-tunnel` | `gitcortex-tunnel` |
| `darwinBundleIdentifier` | `com.visualstudio.code.oss` | `studio.gitcortex` |
| `linuxIconName` | `code-oss` | `gitcortex` |
| `urlProtocol` | `code-oss` | `gitcortex` |

The web/dev fallback defaults in `src/vs/platform/product/common/product.ts`
were updated consistently (`GitCortex` / `GitCortex Studio Dev` /
`applicationName: gitcortex` / `dataFolderName: GitCortexStudio` /
`urlProtocol: gitcortex`).

## 3. Intentionally preserved (technical / compatibility / legal)

These identifiers are **kept as upstream** to avoid breaking the extension API,
internal services, installers, tests, and legal obligations:

- `win32x64AppId` / `win32arm64AppId` / `win32x64UserAppId` /
  `win32arm64UserAppId` — installer GUIDs. **Not fabricated.** A genuine
  rebrand would mint new GUIDs; this is deferred to the packaging phase to avoid
  inventing fake identifiers. Leaving them keeps the installer identity stable.
- `darwinProfileUUID` / `darwinProfilePayloadUUID` — macOS configuration profile
  payload identity (referenced by policy test fixtures).
- `licenseName` / `licenseUrl` / `serverLicenseUrl` / `licenseFileName` — MIT
  license attribution **must remain** pointing to upstream (see Licenses below).
- `reportIssueUrl` — points to upstream microsoft/vscode (will be repointed to the
  GitCortex issue tracker once that exists; deferred).
- `builtInExtensions`, `defaultChatAgent`, `trustedExtensionAuthAccess`,
  `onboardingKeymaps`, `onboardingThemes`, `sessionsWindowAllowedExtensions`,
  `voiceWsUrl`, `agentsTelemetryAppName`, `webviewContentExternalBaseUrlTemplate`
  — functional/technical, not user-facing branding.

## 4. Licenses (unchanged, intentionally)

The MIT license and ThirdPartyNotices are **not** modified. Upstream copyright
("Copyright (c) Microsoft Corporation") and third-party attributions remain.
GitCortex Studio is a derivative of Code-OSS under the MIT license; this
obligation is preserved in `LICENSE.txt` and `ThirdPartyNotices.txt`.

## 5. Visual identity (assets) — planned

```
resources/
├── logos/
├── icons/
└── themes/
```

Logo / app icon / platform icons / splash assets will be added in a later
sub-phase. **No fake assets are created.** Any asset referenced by the build
will be a real, valid file. Until then, the upstream visual assets remain in
use to keep the build intact.

## 6. Validation performed after branding

- `product.json`: valid JSON (verified).
- `gulp compile`: **0 errors** (verified after branding changes).
- Build reads `nameShort`/`nameLong`/`applicationName`/`dataFolderName`/
  `urlProtocol`/`darwinBundleIdentifier`/`linuxIconName` dynamically from
  `product.json`, so the rebrand propagates through the real build pipeline.
