# FusionIDE

FusionIDE is FusionClaw's IDE, built on the open-source
[Code - OSS](https://github.com/microsoft/vscode) core.

FusionIDE is **not** Visual Studio Code, and is not endorsed by or affiliated
with Microsoft. Code - OSS is Copyright (c) Microsoft Corporation and
contributors, used under the MIT License (see `LICENSE.txt`).

## What this repository is

A lightly-patched fork of Code - OSS that builds the **reh-web server target**:
a Node server plus a web workbench. FusionClaw installs the result as a signed
runtime pack and launches it in its own window — the desktop app never bundles
it.

The FusionClaw features inside the workbench (agent bridge, chat, ADE consoles,
status-bar chrome) are **not** in this repository. They live in the FusionClaw
repository under `fusionide/extensions/` and are injected into the pack at
assembly time, so UI work never requires rebuilding this tree.

## Branching

- `fc/main` — integration branch.
- `fc/release/<upstream-minor>` — one branch per adopted upstream stable
  release (currently `fc/release/1.131`).
- Tags: `fusionide-v<upstream>-fc.<n>`, e.g. `fusionide-v1.131.0-fc.1`.

Upstream tracking:

```
git remote add upstream https://github.com/microsoft/vscode.git
git fetch upstream --tags
git merge <upstream tag>
```

Rebase on a **monthly** window; hard ceiling twelve weeks behind upstream;
immediately for a security-tagged upstream release.

**Every source edit is wrapped in markers** so each rebase shows exactly what is
ours:

```ts
// --- Start FusionIDE ---
...
// --- End FusionIDE ---
```

## What we change, and why so little

| Change | Why it cannot be an extension |
| --- | --- |
| `product.json` | Identity, gallery, and the absence of telemetry/update keys are build configuration, not runtime behavior. |
| `patches/terminal-env-allowlist` | No extension API can *remove* unknown variables from a terminal environment — `environmentVariableCollection` only adds or replaces named ones. |
| `patches/fusionide-menus` | Extensions cannot contribute top-level menubar entries; `contributes.menus` has no menubar slots. |
| `patches/webview-media-permissions` | Webview iframes ship a fixed permissions policy with no microphone; there is no API to widen it. |

Everything else — every view, command, and surface — is an extension. Target
steady state is three patches, against VSCodium's ~46.

## Policy (binding)

- **Open VSX only.** `extensionsGallery` points at `open-vsx.org`. Never the
  Microsoft marketplace: its Terms of Use restrict it to Microsoft products, and
  Microsoft-proprietary extensions are license-locked to official Visual Studio
  Code regardless.
- **No telemetry.** `product.json` carries no `enableTelemetry`, `aiConfig`,
  `updateUrl`, `experimentsUrl`, or `nlsBaseUrl`. A from-source Code - OSS build
  has no telemetry backend, and none may be added. The FusionClaw shell
  extension additionally defaults `telemetry.telemetryLevel` to `off`.
- **Trademark.** The product name is "FusionIDE". Never use "Visual Studio Code"
  / "VS Code" or the VS Code icon in product UI, packaging, or marketing. The
  only permitted phrasing is factual: "built on the open-source Code - OSS core".
- **Attribution ships with the build.** `LICENSE.txt`, `ThirdPartyNotices.txt`,
  and a generated `notices.json` travel inside every pack; FusionClaw surfaces
  them in Configurations → Notices once a pack is installed.

## Build

```
npm ci
npm run gulp vscode-reh-web-win32-x64-min      # or linux-x64 / darwin-arm64
```

The output must contain the server entry (`out/server-main.js`), a bundled
`node` binary, `extensions/`, and `product.json` — that is exactly what
FusionClaw's `src/main/services/ide-runtime-paths.ts` probes for.

Toolchain: Node from `.nvmrc` (24.18.0, the same pin FusionClaw uses), Python
for `node-gyp`, and a C++ toolchain per platform (Windows: VS 2022 Build Tools
with the Windows SDK and MFC/Spectre; Linux: `build-essential g++ libx11-dev
libxkbfile-dev libsecret-dev libkrb5-dev`; macOS: Xcode CLI tools).

## Pack assembly

Assembly, signing, and publishing live in the FusionClaw repository, which owns
the manifest schema and the trusted keys:

```
npm run fusionide:pack:build -- --server-archive <archive> --upstream-version 1.131.0
npm run fusionide:pack:sign
npm run fusionide:pack:publish
```

The manifest pins both `FUSIONIDE_PACK_VERSION` and `IDE_BRIDGE_VERSION`, so a
pack that speaks the wrong bridge protocol cannot activate. See
`fusionide/FORK-SETUP.md` there for the full contract.
