# Code-OSS Architecture (upstream microsoft/vscode)

This document describes the **real** architecture of the Code-OSS / VS Code
codebase as it exists in this repository (upstream commit
`c780ea96132b1cabf170a454aced493d8317eee7`, version `1.133.0`). It is the
foundation on which GitCortex Studio is built.

> **Rule**: GitCortex Studio preserves this architecture. New GitCortex
> functionality is added through native VS Code extension points (contributions,
> commands, views, panels, services, configuration, menus, keybindings), never by
> replacing the Workbench with an independent web app.

---

## 1. Top-level layout

```
src/vs/
├── base/             # Low-level primitives (no platform dependencies)
├── code/             # Entry points / process hosts
├── editor/           # Monaco Editor core
├── platform/         # Platform services (reusable, no UI shell)
├── server/           # Remote server (reh) implementation
├── sessions/         # Session support
├── workbench/        # The Workbench (desktop & web shell)
└── monaco.d.ts       # Public Monaco API surface
```

Companion trees:
```
extensions/   # 106 built-in extensions (languages, git, debug, themes, ...)
build/        # gulp-based build system, gulpfiles, lib helpers
scripts/      # launch / runtime scripts (code.sh, code-server.sh, ...)
```

## 2. src/vs/base — primitives

Framework-agnostic utilities and lightweight UI parts. No dependency on the
platform layer or the workbench.

- `base/common/` — arrays, async, buffer, cancellation, codicons, color,
  comparers, decorators, event, lifecycle, linked lists, maps, network, paths,
  process, resources, strings, types, URI, etc.
- `base/browser/` — DOM helpers, widgets, keyboard/mouse, touch, contextmenu
  foundation.
- `base/node/` — Node.js helpers (streams, ports, flow, profiling).
- `base/parts/` — `contextmenu`, `ipc`, `request`, `sandbox`, `storage`
  (shared low-level parts split across process boundaries).

## 3. src/vs/editor — Monaco Editor

The real Monaco editor, the editing core of the product.

- `editor/browser/`, `editor/common/` — editor model, view, controller, modes,
  tokens, line/word operations.
- `editor/contrib/` — **59** editor contributions: find, folding, format,
  hover, inlay hints, inline completions, goto symbol/error, multi-cursor,
  document symbols, comment, clipboard, color picker, bracket matching, GPU
  rendering, etc.
- `editor/standalone/` — the standalone Monaco API (`monaco` global) used to
  embed the editor independently and by the `monaco-editor` npm package.
- `editor/editor.api.ts`, `editor.main.ts`, `editor.all.ts`,
  `editor.worker.start.ts` — API wiring and worker bootstrap.

## 4. src/vs/platform — platform services

**106** service areas. Each is a reusable, injectable service with a clearly
defined interface (often with browser/node/electron variants). Key examples:

`accessibility`, `agentHost`, `agentPlugins`, `assignment`, `backup`,
`browserView`, `chat`, `checksum`, `clipboard`, `commands`, `configuration`,
`contextkey`, `debug`, `diagnostics`, `dialogs`, `editor`, `encryption`,
`endpoint`, `extensionManagement`, `files`, `host`, `instantiation`,
`keybinding`, `languagePacks`, `log`, `marker`, `native`, `notification`,
`opener`, `progress`, `quickinput`, `request`, `secrets`, `storage`,
`telemetry`, `terminal`, `update`, `uriIdentity`, `userdataSync`, `workspace`,
`workspaceTrust`, etc.

Services use **dependency injection** (`createDecorator` /
`InstantiationService`) and **service collections** so the same interface can be
implemented differently per environment (browser vs node vs electron-utility).

## 5. src/vs/workbench — the Workbench (shell)

The desktop & web IDE shell. Split by environment:

- `workbench/browser/` — browser/web shell: `web.main.ts`, `web.api.ts`,
  `layout.ts`, `part.ts`, `panecomposite.ts`, `quickaccess.ts`, `style.ts`.
- `workbench/electron-browser/` — desktop shell: `desktop.main.ts`,
  `desktop.contribution.ts`, `window.ts`, `actions/`, `parts/`, `media/`.
- `workbench/common/` — environment-agnostic workbench code.
- `workbench/api/` — public extension API surface (`vscode` namespace) and
  extensibility bridges.
- `workbench/services/` — workbench-level services (built on platform
  services): `authentication`, `commands`, `configuration`, `editor`,
  `environment`, `extensionManagement`, `extensionRecommendations`,
  `host`, `keybinding`, `language`, `model`, `notebook`, `output`,
  `search`, `terminal`, `textfile`, `themes`, `walkUtils`, etc.
- `workbench/contrib/` — **99** feature contributions (see below).

### 5.1 Workbench parts (the real UI)

`workbench/browser/parts/`:

- `activitybar/` — Activity Bar (left strip with view container icons).
- `sidebar/` — Side Bar (Explorer, Search, Source Control, Run & Debug, etc.).
- `editor/` — editor area (tabs, groups, the Monaco editors).
- `panel/` — bottom Panel (Terminal, Problems, Output, Debug Console).
- `auxiliarybar/` — Secondary Side Bar.
- `statusbar/` — Status Bar.
- `titlebar/` — Title Bar (custom title / command center).
- `banner/` — notification banner.
- `notifications/` — notification toasts.
- `dialogs/` — modal dialogs.
- `views/` — views infrastructure (tree views, welcome views).

### 5.2 Contrib (99 features)

`workbench/contrib/` includes the real implementations of:

- `files` — Explorer file navigator.
- `search` — global Search.
- `git` — Source Control (Git) view + commands.
- `debug` — Run & Debug.
- `testing` — Test Explorer.
- `terminal/` — integrated Terminal (`externalTerminal` too).
- `output` — Output panel; `markers` / Problems panel.
- `chat`, `inlineChat`, `interactive` — Copilot / chat UI.
- `extensions` — Extensions view (marketplace integration).
- `keybindings`, `format`, `comments`, `callHierarchy`, `folding`,
  `codeActions`, `codeEditor`, `customEditor`, `dropOrPasteInto`,
  `editSessions`, `emmet`, `inlayHints`, `inlineCompletions`, `languageDetection`,
  `notebook`, `preferences`, `remote`, `snippets`, `tasks`, `timeline`,
  `workspaceTrust`, and more.

## 6. src/vs/code — process hosts / entry points

`code/{electron-main,electron-browser,electron-utility,node,browser,test}` —
the per-process entry points:

- `code/electron-main/` (`app.ts`, `main.ts`) — the Electron main process.
- `code/electron-browser/` — renderer/desktop bootstrap.
- `code/electron-utility/` — utility process (offloaded work).
- `code/node/` — CLI / server / shared process entry.
- `code/browser/` — web/browser entry (vscode.dev-style).

## 7. src/vs/server — remote server

`server/node/` — remote extension host agent, extension management, remote file
system provider, remote agent environment. Supports the `code-server` /
tunnels / remote development scenarios.

## 8. extensions/ — 106 built-in extensions

Real built-in extensions shipped with the product: language features
(`typescript`, `css`, `html`, `json`, `markdown`, `php`, ...), debuggers,
`git`, `github`, `copilot`, themes, `merge-editor`, `notebook`, `simple-browser`,
`references-view`, `search-result`, etc. Each has its own `package.json` with
`contributes` and is built via the extension build pipeline.

## 9. build/ — build system

gulp-based. Key files:
- `gulpfile.ts`, `gulpfile.compile.ts`, `gulpfile.editor.ts`,
  `gulpfile.extensions.ts`, `gulpfile.vscode.ts`, `gulpfile.vscode.linux.ts`,
  `gulpfile.vscode.win32.ts`, `gulpfile.vscode.web.ts`, `gulpfile.reh.ts`,
  `gulpfile.cli.ts`, `gulpfile.hygiene.ts`, `gulpfile.scan.ts`.
- `build/lib/` — `compilation.ts`, `bundle.ts`, `esbuild.ts`, `mangle/`,
  `extensions.ts`, `electron.ts`, `nls.ts`, `monaco-api.ts`, `i18n.ts`,
  `dependencies.ts`, etc.
- `build/npm/` — `preinstall.ts`, `postinstall.ts`, `installStateHash.ts`
  (enforces Node version & install-state hashing).
- `build/builtin/`, `build/checker/`, `build/darwin/`, `build/linux/` —
  platform packaging helpers.

## 10. npm scripts (build entry points)

From `package.json`:

| script | purpose |
|---|---|
| `compile` | `gulp compile` (+ copilot) — dev compile |
| `compile-build` | `gulp compile-build-with-mangling` — release compile |
| `compile-web` | `gulp compile-web` — web build |
| `compile-cli` | `gulp compile-cli` — CLI/server build |
| `watch` / `watch-client` / `watch-extensions` / `watch-web` | incremental watch modes |
| `build-fast` | transpile-client + build-fast-extensions + compile-copilot |
| `monaco-compile-check` | tsc typecheck of Monaco API |
| `tsec-compile-check` | tsec security typecheck |
| `vscode-dts-compile-check` | dts typecheck |

Build dependency: `.nvmrc` = `24.18.0` (enforced by `preinstall.ts`).

## 11. Extension / contribution model

New GitCortex features are added using the **native contribution model**:

- `package.json` `contributes` (commands, views, viewsWelcome, menus,
  keybindings, configuration, themes, languages, debuggers, snippets,
  jsonValidation, ...) for built-in & external extensions.
- Workbench **contributions** (`registerWorkbenchContribution`) for
  workbench-level features.
- Platform/workbench **services** via DI for cross-cutting capabilities.
- **Commands** & **keybindings** registered through the command/keybinding
  services.
- **Views** & **panels** through the view-container / panel infrastructure.

This is the only sanctioned mechanism for adding GitCortex functionality.
