# GitCortex Studio — Agent Instructions

This file is the persistent memory for AI coding agents working on the GitCortex Studio
codebase (a fork of Code-OSS / VS Code, MIT licensed). For the upstream project overview,
architecture, and coding guidelines, see the [Copilot Instructions](.github/copilot-instructions.md).

## Project identity
- Product name: **GitCortex Studio** (`nameLong`), binary `gitcortex` (`applicationName`).
- Identity fields live in `product.json`: `nameShort=GitCortex`, `nameLong=GitCortex Studio`,
  `applicationName=gitcortex`, `linuxIconName=gitcortex`, `urlProtocol=gitcortex`,
  `dataFolderName=GitCortexStudio`, `darwinBundleIdentifier=studio.gitcortex`.
- The MIT license and attribution to Microsoft Corporation (original VS Code) are preserved
  in `LICENSE.txt`; `licenseName=MIT`. Do not remove upstream attribution.

## Build (Linux x64 production, minified)
- Node: `/home/openhands/node24/bin` (Node 24). Use it for `gulp`/`npm`.
- Minified production artifact: `gulp vscode-linux-x64-min` (~5.5 min) → `../VSCode-linux-x64/`.
- `version`/`commit`/`date` are **build-injected** into `product.json` (source has them absent);
  `quality` is intentionally absent (fork ships no Microsoft auto-update channel).
- Icon: `resources/linux/code.png` (1024x1024) is the desktop icon, copied to
  `usr/share/pixmaps/gitcortex.png` at packaging time.

## Runtime / NLS gotcha
- `src/vs/base/node/nls.ts` `resolveNLSConfiguration()` early-returns when `VSCODE_DEV` is
  truthy, skipping bundled NLS message loading. If the OpenVSCode-server host environment
  leaks `VSCODE_DEV=1` into the child Electron process, the app shows `NLS MISSING: <index>`.
  This is an **environment artifact, not a code bug** — a real user's environment has no
  `VSCODE_DEV`, and the app boots cleanly. When testing under Xvfb, run with a clean env:
  `env -u VSCODE_DEV -u VSCODE_NLS_CONFIG ./gitcortex --no-sandbox ...`.

## Linux packaging branding (Phase 4)
- `resources/linux/*.desktop` and `code.appdata.xml` use `@@PLACEHOLDER@@` tokens
  (`@@NAME_LONG@@`, `@@EXEC@@`, `@@ICON@@`, `@@NAME_SHORT@@`, `@@NAME@@`, `@@URLPROTOCOL@@`,
  `@@LICENSE@@`, `@@VERSION@@`, ...) replaced at packaging time from `product.json`.
- Branded text (tagline `Code editing, reimagined.`, homepage, descriptions, maintainers)
  was updated in: `code.desktop`, `code-url-handler.desktop`, `code.appdata.xml`,
  `debian/control.template`, `debian/templates.template`, `rpm/code.spec.template`,
  `snap/snapcraft.yaml`. Keep `@@` tokens and the MIT attribution intact.
- `debian/postinst.template`: the Microsoft `packages.microsoft.com` apt-source + signing-key
  registration is guarded by `if [ "@@NAME@@" != "code-oss" ] && [ "@@NAME@@" != "gitcortex" ]`
  so the GitCortex `.deb` never modifies the user's apt sources. Keep this guard.

## Branch / PR workflow
- Phases 1-3 merged to `main` via PRs #1 and #2. Phase 4 branch: `gitcortex/phase4-production`.
- Do not push to `main`; open PRs targeting `main`.
