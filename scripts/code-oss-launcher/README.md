# Managed Code OSS launcher

A standalone, dependency-free Node.js launcher for a local VS Code source checkout. It does not require an agent skill, dev-workspace, Hub, or an extension. Use the Node.js version selected by the checkout's `.nvmrc` (at least Node.js 22.18 for native TypeScript support).

From the VS Code repository root, in PowerShell:

```powershell
node scripts\code-oss-launcher\launch.ts --repo . --wait --skip-prelaunch --session-title "My development window" --disable-workspace-trust '--' --extensionDevelopmentPath=D:\my-extension D:\my-workspace
```

On macOS/Linux, use `scripts/code-oss-launcher/launch.ts` and appropriate paths. When spawning from another program, pass an argument array, including the literal `--`, with no shell. Everything after `--` is forwarded verbatim. The launcher reserves the profile, extensions, shared-data and debugger arguments so callers cannot accidentally override run isolation.

## Launch options

| Option | Behavior |
| --- | --- |
| `--repo ROOT` | Source checkout to launch; defaults to the working directory. |
| `--wait` | Keep the launcher alive until Code OSS exits and return its exit code. POSIX SIGINT/SIGTERM stop the exact application process group. |
| `--skip-prelaunch` | Skip `build/lib/preLaunch.ts`; Electron, compiled output and built-ins must already exist. Without this flag, normal source prelaunch runs first. |
| `--session-title TITLE` | Set the isolated window title; with `--agents`, set the Agents command-center title instead. |
| `--disable-workspace-trust` | Forward this opt-in development setting to Code OSS. |
| `--source-user-data-dir DIR` | Seed from this Code OSS profile; defaults to `CODE_OSS_DEV_AUTHED_USER_DATA_DIR` or `~/.vscode-oss-dev`. A missing profile starts empty. |
| `--copy-extensions` | Copy all source-profile extensions. Default: empty isolated extensions directory. `--clone-extensions` is an alias. |
| `--copy-extensions=publisher.one,publisher.two` | Copy selected extensions and filter the extension manifest. Unknown IDs are usage errors. |
| `--full` | Copy the complete source profile, including extensions, instead of omitting caches, locks, logs and workspace history. |
| `--reuse` / `--fresh` | Reuse and synchronize a profile/extension-selection-specific run directory, or create a fresh one (default). Busy reused directories fall back to a fresh run. `CODE_OSS_DEV_REUSE=1` also enables reuse. |
| `--agents` | Launch the optional Agents window. |
| `--help` | Print usage and exit without launching. |

The normal Windows source launcher is reproduced by launching Electron directly, avoiding `cmd.exe` argument mangling. macOS/Linux use `scripts/code.sh`. Host-only environment variables such as `ELECTRON_RUN_AS_NODE` are removed for the application.

For an option value beginning with `--`, use the equals form, for example `--session-title=--example`. The space-separated form rejects such values to catch missing option arguments.

## Readiness and lifetime contract

Diagnostics go to stderr and application output to `<runDir>/code.log`. After `/json/version` returns valid CDP metadata containing a WebSocket debugger URL, stdout receives **one JSON line**:

```json
{"pid":1234,"cdpPort":9222,"extHostPort":9223,"mainPort":9224,"agentHostPort":9225,"userDataDir":"...","extensionsDir":"...","sharedDataDir":"...","runDir":"...","logFile":"...","repo":"...","agents":false,"reused":false,"timings":{"profileMs":100,"preLaunchMs":0,"cdpReadyMs":200,"totalMs":300}}
```

The ports are dynamically allocated. Readiness means the application process is alive and its browser CDP endpoint responds, not that a particular extension or workspace has finished activating. Readiness times out after 90 seconds; an early application exit or timeout fails without a readiness record and stops any remaining exact-run application processes. Usage errors exit with 2; launch failures exit with 1.

With `--wait`, keep draining stderr after reading readiness and wait for process exit. Without it, Code OSS is detached and the launcher exits successfully after readiness. Abruptly killing a Windows launcher does not invoke JavaScript signal handlers: supervisors must explicitly run cleanup or terminate their owned process tree. The same applies to POSIX SIGKILL. Save `runDir` from readiness for cleanup.

## Profile and authentication isolation

Each run has separate user-data, extensions and shared-data directories. The source profile is read, never modified. Slim copies preserve authentication-related files and set `files.simpleDialog.enable` in the copy. On Windows the launcher also seeds application-shared storage from `CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR`, `VSCODE_PORTABLE\shared-data`, or the product's default shared-data directory. Existing credentials remain subject to OS encryption and must be usable by the same local user/machine. Sign in to the source Code OSS profile first to seed future launches; no tokens are printed.

Run directories **contain sensitive copies of local credentials**. Do not upload them or their logs. `CODE_OSS_DEV_RUN_ROOT` can select a private local directory; otherwise the launcher's per-user temporary run root is used. On POSIX, the root is owner-checked and made private. Keep the same environment override when invoking cleanup. Reused profiles are synchronized from the source on subsequent launches, so use the source profile for persistent authentication changes.

## Exact-run cleanup

```powershell
node scripts\code-oss-launcher\cleanup\cleanup.ts <runDir>
```

Cleanup validates the run root and launcher state, then identifies processes by their exact `--user-data-dir` argument, not a potentially reused PID. It stops only that run's process tree, waits for its files to be released, and prints one JSON line: `{"runDir":"...","stopped":true,"removed":true}`. Fresh directories are removed. Reused directories are retained unless `--remove` is passed. `--run-dir <runDir>` is also supported.

`cleanup.ts --gc <runRoot>` removes abandoned runs in a recognized root, but never stops processes. A launch also performs garbage collection after readiness: unused fresh directories have a two-minute grace period and unused reused profiles expire after seven days. Logs and failed launch directories are retained until cleanup or collection, so failures can be diagnosed.

On Windows, the lock probe briefly renames a run directory and restores it. Transient restoration failures are retried; if restoration still fails, the error names the retained recovery directory. Restore it before retrying rather than deleting the profile.

## Tests

```powershell
npm --prefix scripts\code-oss-launcher test
```

No dependency installation or VS Code build is needed. Tests cover slim profile copying, extension selection and synchronization, JSONC settings, CDP validation and deadlines, plus the real CLI against a synthetic Node-based application for readiness ordering, exit-code propagation, argument forwarding, profile isolation, early exit and cleanup isolation between two live runs. They do **not** validate a live Electron workbench or real encrypted credentials.
