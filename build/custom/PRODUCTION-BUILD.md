# Production installer build (Code OSS + DIAL BYOK)

Practical guide for building an **unsigned** Windows x64 production installer from this fork, with:

- bundled **DIAL Chat Model Provider** (`extensions/dial-chat-model-provider/`)
- BYOK / Agents Window / `#codebase` fork changes
- **optimized installer size** (no hundreds of MB of `.js.map` files)

For dev builds, use `npm run compile` and `.\scripts\code.bat` instead — see [README.md](../../README.md).

---

## 1. Prerequisites

- Windows x64
- Node.js **≥ 22.14** (see `extensions/copilot/package.json`)
- `npm install` completed at repo root
- Enough RAM (gulp uses `--max-old-space-size=8192`)
- **Optional:** Windows SDK / `signtool.exe` — not required for unsigned local builds; metadata patching uses `rcedit` only

---

## 2. Fork-specific repo layout (vs upstream VSIX flow)

This fork ships DIAL as a **first-party extension** under `extensions/`, not as a VSIX in `build/custom/`.

| Item | Location |
| --- | --- |
| DIAL source | [`extensions/dial-chat-model-provider/`](../../extensions/dial-chat-model-provider/) |
| DIAL webpack output (required before packaging) | `extensions/dial-chat-model-provider/dist/` |
| Build hook | `npm run compile-dial` in root [`package.json`](../../package.json) |
| Copilot SDK runtime | `extensions/copilot/node_modules/@github/copilot/sdk/index.js` (~6 MB) |

**Do not** add DIAL to `product.json#builtInExtensions` as a VSIX. Packaging picks up `extensions/dial-chat-model-provider/` via `compile-non-native-extensions-build` (same as other built-in extensions).

### 2.1. `build/.moduleignore` — keep Copilot CLI SDK

**Do not add** an ignore rule for `@github/copilot/sdk/index.js`.

Runtime imports `@github/copilot/sdk`. If that file is stripped during packaging, installed builds fail with:

```
Cannot find module .../sdk/index.js
```

Other `@github/copilot/**` exclusions in `.moduleignore` (prebuilds, platform binaries, clipboard, etc.) should stay — they reduce size without breaking runtime.

### 2.2. `build/gulpfile.vscode.ts` — Win32 native patch filter

Fork patch: `patchWin32DependenciesTask` skips non-Windows `.node` files (e.g. `x64-linux`, `darwin` under Copilot SDK vendor trees). Without this, `rcedit` fails on Linux/macOS binaries still present in the packaged tree.

### 2.3. Optional `product.json` tweaks

| Setting | When needed |
| --- | --- |
| `extensionEnabledApiProposals` | Only if you override proposals centrally. As a **built-in** extension, DIAL keeps `enabledApiProposals` from its own `package.json` when not listed in `product.json`. |
| `sessionsWindowAllowedExtensions` | Only for **non-built-in** extensions. DIAL is built-in and enabled in Agents Window by default (no `views` / `debuggers` contributions). |

---

## 3. Installer size: use `CI=true` for packaging

### Without `CI` (bad for installers)

- All `*.js.map` / `*.css.map` are included
- Typical result: **~7000** map files, **~400 MB** of maps (mostly `copilot/node_modules`)
- Installer inflates to **~240 MB**

### With `CI=true` (Microsoft-style packaging)

In `build/gulpfile.vscode.ts`:

```ts
const stripSourceMapsInPackagingTasks = isCI;
```

When `CI=true`, packaging excludes `!**/*.{js,css}.map`. Core bundle source maps point to CDN when built with `--source-map-base-url`:

```
https://main.vscode-cdn.net/sourcemaps/<commit>/core/...
```

**Result:** **0** `.js.map` in the install tree, installer **~200–205 MB**.

> Dev (`scripts\code.bat`) is fast but not an installer build.

---

## 4. Recommended build sequence

Working pattern: **compile DIAL first**, **extensions without CI**, **packaging with CI**.

### Step 0 — repo root

```powershell
cd E:\vscode   # or your clone path
$commit = git rev-parse HEAD
```

### Step 1 — DIAL extension (webpack → `dist/`)

Packaging uses `vsce.listFiles` on the extension folder; **`dist/` must exist**:

```powershell
npm run compile-dial
```

### Step 2 — other extensions (without `CI`)

```powershell
Remove-Item -Recurse -Force .build\extensions -ErrorAction SilentlyContinue

npm run gulp compile-non-native-extensions-build
npm run gulp compile-copilot-extension-build
npm run gulp compile-extension-media-build
```

**Copilot `shims.txt` workaround** — if `compile-copilot-extension-build` fails with:

```
ENOENT ... extensions\copilot\node_modules\@github\copilot\shims.txt
```

```powershell
Set-Content -Path "extensions\copilot\node_modules\@github\copilot\shims.txt" `
  -Value "Shims created successfully" -NoNewline
npm run gulp compile-copilot-extension-build
```

Packaging recreates the ripgrep shim via `prepareBuiltInCopilotRipgrepShim`.

### Step 3 — core bundle (minify + NLS + CDN maps)

```powershell
node --experimental-strip-types -e "import { writeISODate } from './build/lib/date.ts'; writeISODate('out-build');"

node build/next/index.ts bundle `
  --minify --mangle-privates --nls `
  --out out-vscode-min `
  --target desktop `
  --source-map-base-url "https://main.vscode-cdn.net/sourcemaps/$commit/core"
```

### Step 4 — packaging (`CI=true`)

```powershell
$env:CI = 'true'
npm run gulp vscode-win32-x64-min-ci
```

If `patchWin32Dependencies` logs errors but `..\VSCode-win32-x64\Code - OSS.exe` exists, you can continue to installers (unsigned local build).

### Step 5 — installers

```powershell
npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup
# optional system-wide (requires admin):
npm run gulp vscode-win32-x64-system-setup
```

---

## 5. One-shot alternative

`npm run gulp vscode-win32-x64-min` runs steps 2–4 in one task **but still requires `compile-dial` first** and may hit the `shims.txt` issue on Copilot. Prefer the step-by-step flow above for reproducibility.

```powershell
npm run compile-dial
$env:CI = 'true'
npm run gulp vscode-win32-x64-min
npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup
```

---

## 6. All-in-one PowerShell script

```powershell
Set-Location E:\vscode
$commit = git rev-parse HEAD

npm run compile-dial

Remove-Item -Recurse -Force .build\extensions -ErrorAction SilentlyContinue
npm run gulp compile-non-native-extensions-build
npm run gulp compile-copilot-extension-build
if ($LASTEXITCODE -ne 0) {
  Set-Content "extensions\copilot\node_modules\@github\copilot\shims.txt" "Shims created successfully" -NoNewline
  npm run gulp compile-copilot-extension-build
}
npm run gulp compile-extension-media-build

node --experimental-strip-types -e "import { writeISODate } from './build/lib/date.ts'; writeISODate('out-build');"
node build/next/index.ts bundle --minify --mangle-privates --nls --out out-vscode-min --target desktop --source-map-base-url "https://main.vscode-cdn.net/sourcemaps/$commit/core"

$env:CI = 'true'
npm run gulp vscode-win32-x64-min-ci
if ($LASTEXITCODE -ne 0 -and -not (Test-Path "..\VSCode-win32-x64\Code - OSS.exe")) { exit $LASTEXITCODE }

npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup
```

---

## 7. Artifacts

| Output | Path |
| --- | --- |
| User installer | `.build\win32-x64\user-setup\VSCodeSetup.exe` |
| System installer | `.build\win32-x64\system-setup\VSCodeSetup.exe` |
| Portable tree | `..\VSCode-win32-x64\` (sibling of repo) |
| DIAL in package | `...\resources\app\extensions\dial-chat-model-provider\` |
| Copilot SDK | `...\resources\app\extensions\copilot\node_modules\@github\copilot\sdk\index.js` |

Build log (optional): `.build\prod-installer-build.log`

---

## 8. Post-install verification

### File checks

```powershell
$app = "$env:LOCALAPPDATA\Programs\Microsoft Code OSS\resources\app"
# or portable: E:\VSCode-win32-x64\resources\app

Test-Path "$app\extensions\copilot\node_modules\@github\copilot\sdk\index.js"
(Get-Item "$app\extensions\copilot\node_modules\@github\copilot\sdk\index.js").Length / 1MB
Test-Path "$app\extensions\dial-chat-model-provider\dist\extension.js"

# source maps should not ship in product install
(Get-ChildItem $app -Recurse -Filter "*.js.map").Count   # expect 0
```

### Smoke BYOK

1. Launch the **installed** Code OSS, not `scripts\code.bat`
2. Configure DIAL → BYOK models in Chat
3. `#codebase` — local workspace search (no GitHub CodeSearch)
4. Agents Window — DIAL in Local picker
5. Logs must **not** contain `Cannot find module .../sdk/index.js`

### Expected noise (not build bugs)

| Message | Notes |
| --- | --- |
| `Background summarization: no <summary> tags found` | BYOK model may not emit `<summary>` for compaction |
| `vscode-automation-mcp` / `Cannot find tsc` | Dev MCP from `.vscode/mcp.json`, not product install |

---

## 9. Avoid

| Action | Why |
| --- | --- |
| `scripts\code.bat` to validate installer | dev build, not product |
| Packaging without `CI=true` | +~400 MB of maps in installer |
| Installing over stale build without rebuild | old `sdk/index.js`, old copilot bits |
| `vscode-win32-x64-min` without `compile-dial` | missing `dist/extension.js` in package |
| Adding DIAL as VSIX in `product.json` | superseded by `extensions/dial-chat-model-provider/` |

---

## 10. “Build OK” checklist

- [ ] Installer ~200 MB (not ~240 MB)
- [ ] `*.js.map` count in install: **0**
- [ ] `sdk/index.js` ~6 MB present
- [ ] `extensions/dial-chat-model-provider/dist/extension.js` present
- [ ] BYOK + Agents Window + `#codebase` work on installed build
- [ ] No `Cannot find module .../sdk/index.js` in logs

---

## Related docs

- [FORK.md](../../FORK.md) — fork customizations
- [extensions/dial-chat-model-provider/README.md](../../extensions/dial-chat-model-provider/README.md) — DIAL setup
- [.github/instructions/production-build.instructions.md](../../.github/instructions/production-build.instructions.md) — agent quick reference
