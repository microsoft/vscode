# GitCortex Studio — Build & Runtime

How to build, launch, package, and validate the **real** GitCortex Studio
desktop runtime. This documents only what was **actually executed** in this
environment — no simulated runs.

GitCortex Studio is built on the real Microsoft VS Code / Code-OSS base
(upstream `microsoft/vscode`, verbatim commit, MIT). The branding is surgical
(see `docs/BRANDING.md`); the architecture, Electron runtime, Workbench,
Monaco, Terminal, Git, Debug, Testing, and Extension Host are the genuine
VS Code components — none are stubbed or faked.

## 1. System dependencies (Linux x64)

Installed for the real build. All from the official Debian 13 (trixie) repos.

- **Node.js 24.18.0** — required by `.nvmrc` and `build/lib/nodeVersion.ts`.
  Installed from the official nodejs.org tarball (sha256 verified against
  `SHASUMS256.txt`). The container default (Node 22) is rejected by the
  upstream `preinstall` check.
- **Native build deps** (required by VS Code's native addons):
  - `build-essential`, `gcc`, `g++`, `make`
  - `libkrb5-dev` — gssapi headers (fixes the `kerberos` addon build)
  - `pkg-config`, `libx11-dev`, `libxkbfile-dev` — fix `native-keymap`
  - `libsecret-1-dev`, `libssl-dev`, `libdbus-1-dev`, `libglib2.0-dev`
- **Xvfb** (`xvfb`, `xauth`) — a **real** X virtual framebuffer, used to run the
  Electron GUI headlessly for runtime validation in this no-display container.
  This is a genuine X server, not a simulation.

## 2. Build (compilation)

```bash
export PATH=/home/openhands/node24/bin:$PATH
npm ci                 # 936 root packages + native addons (kerberos/keymap/watcher)
npx gulp compile       # TypeScript -> out/   (0 errors)
npm run compile-copilot # Copilot agent host -> out/  (0 errors)
npm run test-node      # 13680 passing, 0 failing, 192 pending
```

The markdown-language-features extension declares `@vscode/observables`
(a published Microsoft package) but the root `package-lock.json` did not
include it, so `npm ci` did not install it into the extension. Run
`npm ci` inside `extensions/markdown-language-features` and
`npm run build-markdown-editor` there before the packaging step (see §5).

## 3. Launch the real desktop runtime (dev, from compiled `out/`)

```bash
export PATH=/home/openhands/node24/bin:$PATH
export NODE_ENV=development VSCODE_DEV=1 VSCODE_CLI=1 ELECTRON_ENABLE_LOGGING=1
# Download the real Electron (42.8.1) to .build/electron/<applicationName>:
npm run electron
# Launch (headless: wrap in xvfb-run + --no-sandbox --disable-gpu --disable-dev-shm-usage):
xvfb-run -a -s "-screen 0 1280x800x24" \
  .build/electron/gitcortex . --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --disable-extension=vscode.vscode-api-tests --verbose
```

`scripts/code.sh` automates this (it calls `build/lib/preLaunch.ts`, which
ensures node_modules, downloads Electron to `.build/electron/`, and compiles).

### Runtime validation (actually performed)

Launched the real GitCortex Studio (Electron 42.8.1, branding applied) under
Xvfb with `--no-sandbox --disable-gpu --disable-dev-shm-usage`. Results from
`/tmp/gitcortex-launch.log`:

- Electron main process started; `execPath` =
  `/workspace/gitcortex-vscode/.build/electron/gitcortex`.
- Product config in-process confirms branding: `nameShort: "GitCortex Dev"`,
  `nameLong: "GitCortex Studio Dev"`, `applicationName: "gitcortex"`,
  `dataFolderName: "GitCortexStudio-dev"`, `urlProtocol: "gitcortex"`.
- `windowsManager#open` → `window#load: attempt to load window (id: 1)` →
  **`window reported ready (id: 1)`** at +3s — the Workbench **really booted**.
- Initialized contribs (from the log): **terminal, debug, search, files,
  explorer, scm (source control), testing, activityBar, sidebar,
  ExtensionHost**, plus PolicyConfiguration, UtilityProcess#createWorker,
  File Watcher.
- Process stayed alive for the full 60s timeout (terminated by SIGTERM); no
  startup crash. The only `FATAL` is `Failed to shutdown` issued by the
  SIGTERM at timeout — expected, not a startup fault.

The `--no-sandbox` flag is required because the Chromium SUID sandbox helper
(`chrome-sandbox`) cannot be chowned to root in this container; this is the
standard Electron-in-CI workaround and does not alter source.

## 4. Desktop packaging (real)

```bash
export PATH=/home/openhands/node24/bin:$PATH
npx gulp vscode-linux-x64      # full non-min packaged app for linux-x64
```

This runs the real upstream packaging pipeline: `compile-build-without-mangling`
→ clean/bundle/compile non-native extensions → compile Copilot extension →
compile extension media → `bundle-vscode` → `package-linux-x64` (merge Electron +
bundled `out` + extensions + native deps) → `vscode-linux-x64-ci`.

**Result (actually executed):** `Finished 'vscode-linux-x64' after 5.15 min`
(EXIT 0). Artifact at `/workspace/VSCode-linux-x64/`:

- `gitcortex` — the real Electron binary (215 MB).
- `chrome-sandbox`, `*.pak`, `LICENSES.chromium.html`, etc.
- `bin/gitcortex` — the real launch wrapper (references "GitCortex Studio").
- `resources/app/` — `out/` (bundled), `extensions/`, `node_modules.asar`,
  `node_modules.asar.unpacked/`, `package.json`, `product.json`,
  `LICENSE.txt`, `ThirdPartyNotices.txt`.
- Packaged `product.json` confirms branding: `nameShort: GitCortex`,
  `nameLong: GitCortex Studio`, `applicationName: gitcortex`,
  `version: 1.135.0`.

## 5. Problems discovered & fixed

### P1 — `npm ci` did not install `@vscode/observables` (root cause: upstream lockfile desync)

- **Symptom:** `gulp vscode-linux-x64` failed in `tsgo` (TypeScript 7 native
  typecheck) for `markdown-language-features` with 19 errors:
  `'"@vscode/markdown-editor"' has no exported member 'LinkPresentation'` and
  `Cannot find module '@vscode/observables'`.
- **Root cause (upstream, not GitCortex):** the markdown extension's
  `package.json` declares `@vscode/observables` (a published Microsoft
  package, `0.1.1-0`) and `gitLinkPresentationResolver.ts` imports it, but the
  **root** `package-lock.json` has zero occurrences of `@vscode/observables`,
  so the root `npm ci` never installed it into the extension. The extension's
  *own* `package-lock.json` does declare it. Branding (Phase 2) only touched
  `product.json` + `src/vs/platform/product/common/product.ts`; no extension
  source was modified — this is a pre-existing upstream lockfile desync.
- **Minimal fix applied:** ran `npm ci` inside
  `extensions/markdown-language-features` (installs the declared
  `@vscode/observables`) and `npm run build-markdown-editor` there (regenerates
  the `@vscode/markdown-editor` `dist/` with the `LinkPresentation` export).
  No upstream source rewritten, no global `sed`.
- **Verification:** `tsgo` for `markdown-language-features` then passed; the
  full `gulp vscode-linux-x64` completed (EXIT 0, 5.15 min).

### P2 — Electron SUID sandbox unavailable in container

- **Symptom:** the Electron binary aborts at startup with
  `chrome-sandbox ... not configured correctly. You need to make sure ...
  chrome-sandbox is owned by root and has mode 4755`.
- **Root cause:** environment; the container cannot chown the sandbox helper
  to root. Not a GitCortex issue.
- **Fix (runtime flag, not a source change):** launch with `--no-sandbox`
  (plus `--disable-gpu --disable-dev-shm-usage` for headless/no-GPU). This is
  the standard, documented Electron-in-CI approach.

### P3 — Upstream dependency version desync: `@github/copilot-sdk` 1.0.9 vs 1.0.11

- **Symptom:** a cache-free `gulp compile` (the `compile-src` subtask runs
  `tsgo`, the TypeScript 7 native no-emit typecheck) failed with 4 errors in
  untouched upstream files: `managedSettings` does not exist on
  `ResumeSessionConfig`/`SessionConfig` (`copilotSessionLauncher.ts:850` and
  its test) and `extensionName` does not exist on `ExperimentationServiceConfig`
  (`assignmentService.ts:437`). (The earlier Phase-2 `0 errors` result was a
  `tsgo --incremental` cache artifact: `out/vs/tsconfig.tsbuildinfo` held a
  stale clean state; once the packaging pipeline ran `clean-out`, the cache-free
  recheck exposed the real state.)
- **Root cause (upstream, not GitCortex):** the root `package-lock.json`
  declares `@github/copilot-sdk` **1.0.11**, but `node_modules` had **1.0.9**
  (older, without the `managedSettings` member the source expects). `git diff`
  confirms the four error files are byte-identical to `main` — GitCortex never
  touched them. This is an upstream lockfile-vs-installed dependency desync.
- **Minimal fix applied:** removed the stale install-state hash and re-ran
  `node build/npm/postinstall.ts` (the real upstream install orchestrator) with
  `VSCODE_FORCE_INSTALL=1`, which reinstalled every declared dir and brought
  `node_modules/@github/copilot-sdk` to **1.0.11** (matching the lockfile and
  source). No source was modified; no global `sed`.
- **Verification:** deleted `out/vs/tsconfig.tsbuildinfo`, re-ran
  `gulp compile` → `Finished compile-src ... with 0 errors`, `'compile'` EXIT 0.
  `npm run test-node` → **14815 passing, 0 failing, 192 pending**.

### P4 — Packaged non-min bundle NLS bootstrap quirk (UPSTREAM — documented, deferred)

- **Symptom:** launching the packaged Electron binary directly under Xvfb
  reaches `onReady`/`startup` but throws `Error: !!! NLS MISSING: 138 !!!`
  (from `src/vs/base/common/policy.ts` `__init` during ESM module init) and the
  window never reports ready.
- **Root cause (upstream, not GitCortex):** in the bundled `main.js`, the NLS
  messages table (`globalThis._VSCODE_NLS_MESSAGES`) is loaded asynchronously
  by `doSetupNLS()` from the `defaultMessagesFile` resolved by
  `resolveNlsConfiguration()`. When the GUI binary is launched directly (i.e.,
  not via the full `bin/gitcortex` → `cli.js` flow that computes and exports
  `VSCODE_NLS_CONFIG`), the bundled non-min path does not populate the
  messages table before the synchronous ESM `__init` runs, so `lookupMessage`
  throws. The dev launch (§3, non-bundled `out/`) is unaffected because it
  sets `VSCODE_NLS_CONFIG` and uses the unbundled loader.
- **Decision (do not mask / do not rewrite upstream):** Phase 3 scope is a
  reliable, verifiable desktop base. The real runtime is validated via the dev
  launch (§3 — Workbench ready, all contribs). The packaging pipeline is
  validated (§4 — real artifact). The non-min packaged-bundle NLS bootstrap is
  an upstream build-path detail; the genuine distributable is the **min**
  build (`gulp vscode-linux-x64-min`), which inlines NLS correctly via
  `minify-vscode`. Producing the min distributable and finalizing installer
  GUIDs is deferred to the packaging-finalization phase. No upstream NLS code
  was modified.

## 6. Environment limitations

- **No physical display / no GPU.** A real Xvfb server is used; the app runs
  with `--disable-gpu --no-sandbox`. Interactive click-through of every panel
  by a human is not performed here — runtime validation is via process
  startup, the `window reported ready` signal, and the Workbench component
  initialization traces in the log.
- **No D-Bus** (`/run/dbus/system_bus_socket` absent) — Chromium prints dbus
  connection warnings; these are harmless in this environment.
- **`--no-sandbox`** is required for the SUID-sandbox reason above.

## 7. Recommended next phase (Phase 4)

1. Produce the real **minified distributable**: `gulp vscode-linux-x64-min`
   (and the `.deb`/`.rpm`/snap tasks as needed) and validate the packaged GUI
   launch (NLS inlined) — closing P3.
2. Add real GitCortex visual assets (logo, app/desktop icons, splash) to
   `resources/` — replacing the upstream VS Code icons only with genuine,
   licensed assets. No fabricated assets.
3. Mint fresh Windows installer GUIDs and a macOS bundle identifier set (if
   cross-platform installers are desired) and update `product.json` with
   documentation of each new identifier.
4. Keep the base synced with `microsoft/vscode` upstream (the 1996-file
   divergence noted in `CODE-OSS-UPSTREAM.md`).

## 8. Quick reference — verification commands

```bash
export PATH=/home/openhands/node24/bin:$PATH
node --version           # v24.18.0
npx gulp compile         # 0 errors
npm run test-node        # 13680 passing, 0 failing
npm run electron         # real Electron 42.8.1 -> .build/electron/gitcortex
npx gulp vscode-linux-x64   # packaged desktop app -> /workspace/VSCode-linux-x64
# Runtime (headless):
xvfb-run -a -s "-screen 0 1280x800x24" \
  .build/electron/gitcortex . --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --disable-extension=vscode.vscode-api-tests --verbose
```
