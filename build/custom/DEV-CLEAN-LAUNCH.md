# Clean dev launch (Code OSS from sources)

Quick guide for running a **debug build** with a **fresh profile** and **empty workspace** — no old settings, no marketplace extensions, no keychain secrets.

For production installers see [PRODUCTION-BUILD.md](./PRODUCTION-BUILD.md).

---

## Fastest way (Windows)

From repo root, after sources are compiled once:

```powershell
.\scripts\launch-clean.ps1
```

Agents Window (BYOK / DIAL in agent UI):

```powershell
.\scripts\launch-clean.ps1 -Agents
```

The script prints paths to the throwaway profile, workspace, and running PIDs.

---

## One-time setup

```powershell
cd c:\Users\sergei\source\repos\vscode
npm install
npm install --prefix extensions/dial-chat-model-provider   # only if DIAL webpack fails
npm run compile
```

After the first full compile, incremental rebuilds are enough:

```powershell
npm run watch          # background, all targets
# or
npm run compile-client # workbench only (~5 min)
npm run compile-dial   # DIAL only
```

---

## Manual launch (what the script does)

**Always use `scripts\code.bat`.** It passes `.` (repo root) as the Electron app path. Without that, Electron treats your workspace folder as the app directory and fails with:

> Unable to find Electron app at `...\workspace`

```powershell
$Repo = "c:\Users\sergei\source\repos\vscode"
$Run  = Join-Path $env:TEMP "code-oss-clean-$(Get-Date -Format yyyyMMdd-HHmmss)"
$UserData  = Join-Path $Run "user-data"
$ExtDir    = Join-Path $Run "extensions"
$Shared    = Join-Path $Run "shared-data"
$Workspace = Join-Path $Run "workspace"
New-Item -ItemType Directory -Force -Path $UserData, $ExtDir, $Shared, $Workspace | Out-Null

Set-Location $Repo
$env:VSCODE_SKIP_PRELAUNCH = "1"

.\scripts\code.bat `
  --user-data-dir="$UserData" `
  --extensions-dir="$ExtDir" `
  --shared-data-dir="$Shared" `
  --use-inmemory-secretstorage `
  --no-cached-data `
  --skip-welcome `
  --skip-release-notes `
  --disable-telemetry `
  $Workspace
```

| Flag | Why |
| --- | --- |
| `--user-data-dir` | Fresh settings / global state (not `%USERPROFILE%\.vscode-oss-dev`) |
| `--extensions-dir` | Empty dir — no old marketplace extensions |
| `--shared-data-dir` | Isolated shared DB (avoids clashes with other instances) |
| `--use-inmemory-secretstorage` | No OS keychain tokens from previous profiles |
| `--skip-welcome` / `--skip-release-notes` | Skip first-run UI noise |
| `$Workspace` last | Folder to open; **not** the Electron app path |

---

## Agents Window

Add `--agents` before the workspace path:

```powershell
.\scripts\code.bat --agents `
  --user-data-dir="$UserData" `
  --extensions-dir="$ExtDir" `
  --shared-data-dir="$Shared" `
  --use-inmemory-secretstorage `
  $Workspace
```

Or use `.\scripts\launch-clean.ps1 -Agents`.

Ensure `product.json` lists DIAL in `sessionsWindowAllowedExtensions` if you test BYOK providers there.

---

## F5 from this repo (uses old profile)

Launch configs in [`.vscode/launch.json`](../../.vscode/launch.json) (`Launch VS Code Internal`, `Launch VS Code Agents Internal`) use `%USERPROFILE%\.vscode-oss-dev` — **not** a clean profile.

Use them when you need breakpoints in workbench / extension host. Use `launch-clean.ps1` when you need a **clean** smoke test.

---

## What to verify

1. **Settings** — empty / defaults (no DIAL URL, no old BYOK config)
2. **Extensions** — built-ins from repo only (`dial-chat-model-provider`, `copilot`, …)
3. **DIAL** — Chat → Models, or command `DIAL: Open Settings`
4. **BYOK** — models work without Copilot subscription
5. **`#codebase`** — local workspace search (no GitHub CodeSearch)

---

## Cleanup

Close the window, then:

```powershell
Stop-Process -Name "Code - OSS" -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:TEMP\code-oss-clean-*"   # optional
```

Each launch creates a new folder under `%TEMP%\code-oss-clean-<timestamp>\`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Unable to find Electron app at ...\workspace` | Do **not** call `Code - OSS.exe` with workspace as the first argument. Use `scripts\code.bat` (passes `.` first). |
| `'webpack' is not recognized` (DIAL) | `npm install --prefix extensions/dial-chat-model-provider` then `npm run compile-dial` |
| `compile` fails on test TS errors | Fix tests or run `npm run compile-client` if workbench sources are already good |
| Window opens repo instead of empty folder | Put workspace path **last** in `code.bat` arguments |
| No window / instant exit | Run from repo root; check `%TEMP%\code-oss-clean-*\` for logs; ensure `npm run compile` completed |
| Second instance crashes | Always set `--shared-data-dir` to a unique path per instance |

---

## Do not use for production

This flow is **dev only** (`VSCODE_DEV=1`, sources from `out/`). For installers see [PRODUCTION-BUILD.md](./PRODUCTION-BUILD.md).
