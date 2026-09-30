# Rust Copilot CLI shim requirements

## Status

This document defines the requirements for a standalone Rust replacement for
the existing Copilot CLI bootstrapper scripts.

The implementation must live in a new independent Cargo package:

```text
copilot_shim/
```

This directory is a sibling of [`cli/`](../cli/).

The executable name is:

- `copilot` on macOS and Linux.
- `copilot.exe` on Windows.

VS Code ships the shim in a `copilot-shim` folder inside the `bin` folder that
contains the `code` command, in both client and server builds (see
[Product integration](#product-integration)).

## Purpose

The shim is invoked from a terminal. It finds and launches a real
GitHub Copilot CLI already available through `PATH`, while preventing recursion
through itself or the legacy VS Code shims.

When no usable CLI is available, the shim offers interactive installation on
supported installer targets. It then repeats discovery before launching. Other
targets receive manual-install or upstream-support guidance. The shim never
runs a candidate except to launch it: there is no minimum version, because the
Copilot CLI keeps itself up to date.

## Scope

The implementation includes:

- Cross-platform Copilot CLI discovery through `PATH`.
- Self, copy, symlink, hard-link, and legacy-shim exclusion.
- Windows native and script-wrapper support.
- Interactive installation, using GitHub's per-user MSI on Windows.
- Post-install discovery.
- Argument, terminal I/O, and exit-status forwarding.
- The `--vscode-shim` option namespace, including the setup commands that the
  Windows installer runs.
- Builds for the complete VS Code CLI target matrix, inside the VS Code CLI
  build jobs.
- Placement in VS Code client and server builds, which sign it.

## Product integration

The shim lives at `bin/copilot-shim/copilot` (`copilot.exe` on Windows),
relative to the folder that contains the application executable:

| Build | Location |
|---|---|
| Windows client | `<install folder>\bin\copilot-shim\copilot.exe` |
| macOS client | `<app>.app/Contents/Resources/app/bin/copilot-shim/copilot` |
| Linux client | `<install folder>/bin/copilot-shim/copilot` |
| Servers | `<server folder>/bin/copilot-shim/copilot[.exe]` |

On Windows the folder is inside `bin` because `inno_updater --gc` removes other
top-level folders of a user installation. The folder is separate from `bin`
itself so that adding `copilot` to `PATH` never depends on adding `code`, and
the reverse.

- The Windows installer ([`copilot.iss`](../build/win32/copilot.iss)) adds the
  folder to `PATH`, and can install Copilot CLI with the setup commands.
- The Copilot extension computes the same path, adds the folder to the `PATH`
  of integrated terminals unless `chat.copilotCliCommand.enabled` is off, and
  falls back to `copilot` from `PATH` when the shim is missing or turned off.
  It removes the script shims that earlier versions wrote to its global
  storage.

### Ownership

VS Code owns only the shim, the launcher that gets Copilot CLI onto the device.
Everything else belongs to Copilot CLI and the method that installed it: the
CLI's files, its `PATH` entry, its updates, its uninstallation, and its data.
The shim installs Copilot CLI only when there is none, never updates it, and
uninstalling VS Code never removes it or its data (`~/.copilot`).

### Publishing the shim on Windows

Setup publishes the shim itself, because `inno_updater` handles only the files
directly in `bin` and never enters its subfolders. It follows `inno_updater`'s
`perform_three_way_rename`, `find_available_old_path`, `util::retry`, and
cleanup (microsoft/inno-updater `src/main.rs`), so a Copilot session running
the shim never makes an install or update fail:

1. Delete `old_*` copies from earlier updates and any leftover
   `new_copilot.exe`. A copy that a session still runs is locked and is skipped
   until a later install or update.
2. Keep the published shim when its file version equals the new shim's. Signing
   changes a build's bytes, so the embedded version (see
   [Cargo package requirements](#cargo-package-requirements)), not a hash,
   decides whether the shim changed.
3. Copy the new shim to `new_copilot.exe`.
4. Rename `copilot.exe` to `old_copilot.exe`, or to `old_1_copilot.exe`,
   `old_2_copilot.exe`, and so on when an older session still holds that name.
   A running shim can be renamed, and its session keeps running.
5. Rename `new_copilot.exe` to `copilot.exe`. If that fails, rename the old copy
   back, so a failed update keeps the previous shim.
6. Delete the old copy unless a session still runs it.

Each copy and rename is retried up to 11 times, waiting `attempt² × 50` ms after
each failure, to ride out transient locks such as antivirus scans.

Uninstalling VS Code deletes `bin`, including the shim folder. A shim that a
Copilot session is still running, and any `old_*` copies it holds, stay behind
until they're deleted manually.

## Out of scope

The implementation does not:

- register a VS Code terminal profile.
- replace `CopilotCLITerminalLinkProvider`.
- modify the existing `cli/` Cargo package.
- add the shim to `PATH` outside integrated terminals on macOS and Linux.
- ship the shim in the web server builds (`vscode-server-*-web`).

## Normative language

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative.

## Required runtime flow

One invocation follows this sequence:

1. Parse the leading `--vscode-shim` options. A setup command runs and exits
   without the rest of this flow; a `clear` modifier is consumed.
2. Resolve and identify the running shim executable.
3. Discover eligible Copilot CLI candidates from the current `PATH`.
4. Reject the running shim, other Rust-shim copies, and legacy VS Code shims.
5. Select the first eligible candidate whose interpreter is available, using
   the deterministic platform rules in this document. Selection MUST NOT run
   any candidate.
6. If no usable candidate exists, offer installation on a supported installer
   target; otherwise report the manual-install or upstream-support limitation.
7. After a successful install, discard all prior discovery results and restart
   discovery from the current process environment.
8. Launch the selected candidate, forwarding the original arguments and
   terminal I/O.
9. Propagate the real CLI's exit result.

Installation causes a logical recursive re-entry into discovery. Implementation
with a loop or state machine is preferred over unbounded call stack recursion.

The shim adds as little startup time as possible. It doesn't check the CLI's
version, and it runs PowerShell only to find a host for a `.ps1` candidate.

## Argument handling

### `--vscode-shim` options

VS Code passes options to the shim through a reserved prefix, so the shim never
consumes an argument meant for the Copilot CLI:

```text
copilot [--vscode-shim <modifier>]... [--] [copilot arguments...]
copilot --vscode-shim <info|probe|install> [command options...]
```

- Only leading `--vscode-shim <name>` pairs are options. Parsing stops at the
  first other argument, and a later `--vscode-shim` is forwarded.
- Modifiers are removed and the remaining arguments are forwarded. A `--`
  directly after one or more modifiers ends the prefix and is removed; a `--`
  that is the first argument belongs to the Copilot CLI.
- Commands must be the only option. They never launch the Copilot CLI (see
  [Setup commands](#setup-commands)).
- A missing or unknown option name, a command after a modifier, or malformed
  command options print a diagnostic and exit with code `2` without launching
  the Copilot CLI.

The only modifier is `clear`. It clears the current terminal before producing
discovery, installation, update, or CLI output. When stdout is not attached to a
terminal, clearing MUST be a no-op; the shim MUST NOT emit raw terminal-clear
escape sequences into redirected output.

`--clear` has no meaning to the shim and is forwarded like any other argument.

### Forwarding

All remaining arguments MUST be preserved as operating-system-native argument
strings, subject to the explicitly accepted Windows PowerShell 5.1 compatibility
exception below. The implementation MUST NOT use lossy UTF-8 conversion for
forwarded arguments or paths.

Tests must cover:

- no arguments;
- empty arguments;
- spaces;
- single and double quotes;
- Unicode;
- trailing backslashes;
- shell metacharacters; and
- multiple arguments with the same value.

## Terminal I/O

The final Copilot CLI process MUST inherit the shim's stdin, stdout, and stderr.
Interactive Copilot prompts must behave as if the real CLI had been invoked
directly.

Installer processes that may prompt the user MUST also inherit stdin, stdout,
and stderr. Output MUST remain visible in the current terminal.

PowerShell host version probes are the exception: they capture stdout for
parsing and stderr for diagnostics, within the limits specified below. Their
stdin MUST be disconnected from interactive input.

## PATH handling

### Native strings

PATH entries and candidate paths MUST be handled as native OS strings:

- `OsString`/`Path` semantics on Unix, including non-UTF-8 paths.
- Case-insensitive filename matching on Windows.

### PATH entry rules

The implementation MUST:

- preserve PATH directory order;
- treat an empty PATH component as the current working directory where that is
  the platform's command-resolution behavior;
- resolve relative PATH components against the current working directory;
- tolerate duplicate directories;
- skip entries that are not directories;
- skip a directory named `copilot` rather than treating it as an executable;
- skip broken symlinks and unreadable candidates; and
- treat a missing or empty `PATH` as no discovered candidate.

Candidate deduplication MUST NOT reorder the search. The first occurrence keeps
its position.

## Candidate discovery

### macOS, Linux, and Alpine

For each PATH directory in order, inspect:

```text
copilot
```

An eligible candidate MUST resolve to a regular file and have an executable
permission bit. A symlink is eligible only when its final target meets those
requirements.

### Windows

Windows discovery uses a shim-owned deterministic policy rather than inheriting
the differing rules of cmd.exe, PowerShell, Git Bash, or `CreateProcess`.

For each PATH directory in order, inspect these names in this order:

1. `copilot.exe`
2. `copilot.cmd`
3. `copilot.bat`
4. `copilot.ps1`

Filename matching is case-insensitive.

`PATHEXT` MUST NOT reorder this list. `.com` files are outside the first
implementation. A bare extensionless `copilot` is not launched on Windows, but
it MAY be inspected as a legacy-wrapper fixture.

After the `PATH` entries, discovery searches `%LOCALAPPDATA%\GitHubCopilotCLI`,
where GitHub's per-user MSI installs `copilot.exe`. A terminal whose `PATH`
predates the installation still finds that CLI, including right after the shim
installed it.

### Windows execution adapters

| Candidate | Execution |
|---|---|
| `.exe` | Execute the discovered path directly. |
| `.cmd` or `.bat` | Execute through `%ComSpec% /E:ON /V:OFF /D /S /C` with unquoted switches and explicit Windows command-line quoting of the script path and arguments. `/E:ON` enables the `%` escaping, and `/V:OFF` keeps `!` literal. |
| `.ps1` | Prefer an available PowerShell 7.3+ `pwsh.exe` host with modern native argument passing; otherwise use Windows PowerShell 5.1 (`powershell.exe`) with legacy forwarding. Use `-NoLogo`, `-NoProfile`, and an execution-policy bypass where supported. Do not use `-NonInteractive` for final CLI execution. |

If the required interpreter is unavailable, the candidate is unusable and
discovery continues with the next candidate. The shim locates PowerShell,
which means running each host to check its version, only when it reaches a
`.ps1` candidate; `.exe`, `.cmd`, and `.bat` candidates never start PowerShell.

Except for the Windows PowerShell 5.1 compatibility exception, the interpreter
invocation MUST preserve empty arguments, quotes, Unicode, trailing
backslashes, and shell metacharacters. It MUST NOT build an unescaped command
by joining arguments with spaces.

### PowerShell host compatibility

Both host paths are supported:

- PowerShell 7.3 or later uses modern native argument passing.
- When that host is unavailable, Windows PowerShell 5.1 uses the old shim's
  legacy argument-forwarding approach.

Windows PowerShell 5.1 can change empty arguments and embedded quotes when a
script forwards them to a native executable. This is an accepted compatibility
exception, not a claim of lossless forwarding on that host. Tests MUST document
the actual legacy behavior separately from modern-host argument preservation.
The shim does not guarantee that arbitrary third-party wrapper code preserves
arguments internally.

Lack of PowerShell 7.3+ alone MUST NOT exclude a `.ps1` candidate when the 5.1
fallback is available. If neither host is available, continue candidate
discovery. The shim does not install PowerShell automatically.

Discovery, prompting, inherited terminal I/O, and child exit handling remain
required under both host modes.

## Self and recursion exclusion

### Current executable

Resolving the current executable is mandatory. If the current executable cannot
be identified, the shim MUST stop with a diagnostic and a nonzero exit status.

The implementation MUST obtain:

- the original current-executable path;
- its canonical path; and
- its platform filesystem identity when supported.

### Candidate identity checks

Each candidate MUST be rejected when any of these are true:

- its canonical path equals the current shim's canonical path;
- its available filesystem identity equals the current shim's identity;
- it contains the stable Rust-shim binary marker described below; or
- it matches a legacy-shim signature.

Filesystem identity means:

- device and inode on Unix; and
- volume and file ID on Windows.

File identity is an additional check, not symlink resolution: it can identify
hard links whose canonical paths remain different.

If the platform or filesystem explicitly does not support file IDs, the shim
MUST use canonical-path and Rust-shim marker checks instead. Canonicalization
and readable marker inspection remain required.

An actual permission, I/O, or metadata error is not an unsupported-feature
fallback. Report the error and skip that candidate. Such an error identifying
the running executable is fatal.

The originally discovered absolute path, not the canonical target path, is used
to launch a candidate that passes exclusion. This preserves legitimate symlink
invocation behavior.

### Distinct copies of the Rust shim

Path and file identity do not detect a byte-for-byte or version-different copy
of the shim. Every Rust shim build MUST therefore contain a stable binary
marker reserved for this component, for example:

```text
VSCODE_COPILOT_RUST_SHIM_V1
```

Native candidates MUST be inspected for this marker using a bounded-memory
streaming search. A candidate containing it is another shim copy and MUST be
skipped. The search covers only the first 16 MiB: a shim is about 1 MB, and a
full Copilot CLI executable (about 150 MB) would otherwise be read on every
launch.

Recursion exclusion uses canonical paths, supported file identities, the binary
marker, and legacy-wrapper signatures. The shim MUST NOT set or require a
recursion-guard environment variable: legitimate child terminals and tools of
the real CLI must remain able to invoke the shim later.

Tests MUST cover:

- the same path;
- a symlink to the running shim;
- a hard link to the running shim;
- a copied shim;
- a different Rust-shim build containing the stable marker;
- a symlink loop;
- a broken symlink; and
- a rejected shim followed by a valid later candidate.

## Legacy VS Code shim exclusion

Legacy detection is content-based. File extension or parent-directory name
alone MUST NOT classify a candidate as legacy.

Text inspection MUST:

- inspect at most the first 128 KiB;
- accept UTF-8 with or without BOM;
- normalize LF and CRLF line endings;
- use exact case-sensitive markers for POSIX shell scripts;
- use ASCII-case-insensitive markers for Windows PowerShell/batch wrappers; and
- skip an unreadable or undecodable script candidate.

### Required signatures

A candidate is legacy only when every marker in one applicable row is present.

| Legacy form | Required marker conjunction |
|---|---|
| macOS/Linux injected launcher | Starts with `#!/bin/sh`; contains `unset NODE_OPTIONS`; contains `ELECTRON_RUN_AS_NODE=1`; contains `copilotCLIShim.js`; contains `"$@"`. |
| Windows PowerShell bootstrapper | Contains `Windows GitHub Copilot CLI bootstrapper`; contains `function Find-RealCopilot`; contains `function Test-AndLaunchCopilot`; contains `$PackageName = "@github/copilot"`. |
| Windows batch/cmd wrapper | Starts with `@echo off`; contains `powershell`; contains `-ExecutionPolicy Bypass`; contains `-File`; references `copilot.ps1` or `copilotCLIShim.ps1`. |
| Windows Git Bash wrapper | Starts with `#!/bin/sh`; contains `exec`; references `copilot.bat`; contains `"$@"`. |

The current VS Code integration generates `.ps1` and `.bat`, not `.cmd`.
A `.cmd` candidate is checked only to cover historical or renamed copies.

Legitimate npm-generated `copilot.cmd` and `copilot.ps1` wrappers MUST remain
eligible when they do not satisfy a complete legacy signature.

Positive fixtures for every legacy row and negative npm-wrapper fixtures are
required.

## No Copilot CLI version check

The shim MUST NOT run a candidate before launching it, and there is no minimum
Copilot CLI version. The Copilot CLI keeps itself up to date (`copilot update`
and automatic updates), and running `copilot --version` before every launch
cost 0.15 to 1 second, and several seconds the first time antivirus scanned a
new release of the roughly 150 MB executable. An old CLI is launched like any
other.

## PowerShell host probes

To choose a host for a `.ps1` candidate, the shim runs each `pwsh.exe`, and
then each `powershell.exe`, found on `PATH` with
`-NoLogo -NoProfile -NonInteractive -Command $PSVersionTable.PSVersion.ToString()`
and takes the first `major.minor.patch` in its output. It does this at most once
per invocation, and only when discovery reaches a `.ps1` candidate.

Every PowerShell probe MUST have:

- a 30-second timeout;
- a maximum of 256 KiB (262,144 bytes) of combined stdout and stderr; and
- null stdin, with no consumption of the user's terminal input.

Capture must be bounded while the process runs, not truncated only after
unbounded buffering. If a probe times out or exceeds its output limit,
terminate its job, reap the child process owned by the shim, verify that no
descendant in the job remains, report the rejected host and reason, and try the
next host.

Process creation and Job Object assignment MUST be race-free: create the probe
suspended and assign it to a kill-on-close Job Object before resuming it, or use
an equivalent mechanism that prevents descendants from escaping before
assignment.

User cancellation stops the workflow rather than trying the next host. These
limits apply only to PowerShell probes. Interactive installers and the final CLI
have no corresponding duration or output limit.

## Missing CLI prompt

When discovery finds no usable CLI candidate on a supported automatic-install
target, display the installation documentation URL and prompt:

```text
Install GitHub Copilot CLI? [y/N]
```

Only a response whose first non-whitespace character is `y` or `Y` is
affirmative. No response or EOF means No.

Declining installation exits successfully.
On ARMhf and Alpine/musl, report manual-install or upstream-support guidance and
exit nonzero instead of offering an unsupported automatic installation.

Documentation URL:

```text
https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
```

### Prompts without a terminal

Prompts are written to stderr, so they stay visible, and out of the output, when
stdout is redirected. The shim prompts only when stdin and stderr are both
terminals. Otherwise, as in scripts and CI, a missing CLI prints a one-line
message with the documentation URL to stderr and exits with `127`, the code a
shell uses for a command it can't find, on every target.

A disabled `CopilotCliCommand` policy takes precedence (exit `10`).

## Installation commands

### Automatic-install support

Shim build coverage is distinct from upstream installer coverage. Keep all nine
build targets, but use the following automatic-install policy:

| Target | Installation |
|---|---|
| Windows x64/arm64 | GitHub's per-user MSI, downloaded and verified by the shim. |
| macOS x64/arm64 | Homebrew cask, then curl/wget official script. |
| Linux GNU x64/arm64 | curl/wget official script; do not attempt the macOS-only Homebrew cask. |
| Linux GNU armhf | Manual-install/upstream-support guidance; no automatic installer attempt. |
| Alpine/musl x64/arm64 | Manual-install guidance for an upstream musl release; no automatic installer attempt. |

Existing CLI discovery and launching remain supported on every target.

The current official script accepts x64/arm64 architectures and selects the
`copilot-linux-*` archives for Linux; it does not select the separately
published `copilot-linuxmusl-*` archives. ARMhf is not an accepted script
architecture. This phase does not add a custom archive installer to work around
those limitations. Musl users may obtain the appropriate executable from
<https://github.com/github/copilot-cli/releases>.

### Windows

The shim installs GitHub's per-user MSI (`assets/Package.wxs` in
github/copilot-agent-runtime, published with `SHA256SUMS.txt` to the
github/copilot-cli releases). It installs without elevation to
`%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` and appends that folder to the
user `PATH`.

The MSI has a fixed UpgradeCode, `{E2C3A7F6-1D3A-4E8F-9E5F-8E9D4F9C1234}`, and
no `MajorUpgrade`, so running it over an existing installation could register a
second copy. The shim therefore only installs where there is no Copilot CLI and
never runs the MSI to update one; Copilot CLI updates itself (`copilot update`
and automatic updates), so the version in Installed apps can lag behind the
running version.

The shim runs `<shim> --vscode-shim install --interactive` as a child attached
to the current terminal. That command, which also backs the installer's
install option, MUST:

1. Report that Copilot CLI is already installed, without downloading anything,
   when `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` exists. When Windows
   Installer has a product with the UpgradeCode registered but that file is
   missing, report an error that points to Installed apps instead of
   installing. `msi.dll` is loaded only for this check.
2. Resolve the latest release: request
   `https://github.com/github/copilot-cli/releases/latest` without following
   redirects and take the tag from the `/releases/tag/<tag>` redirect location.
3. Download `SHA256SUMS.txt` (at most 64 KiB) and `copilot-x64.msi` or
   `copilot-arm64.msi` for that tag, through WinHTTP with the system proxy
   configuration.
4. Compare the MSI's SHA-256 with its entry in `SHA256SUMS.txt`.
5. Verify the MSI's Authenticode signature with `WinVerifyTrust` and require
   the signer name `GitHub, Inc.`.
6. Run `%SystemRoot%\System32\msiexec.exe /i <msi> /qn /norestart /l*v
   %TEMP%\vscode-copilot-cli-install.log` without elevation. Exit codes `0` and
   `3010` mean success, and `1602` means the install was canceled.
7. Confirm that `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` exists.

Progress goes to stderr. The MSI's `PATH` change isn't visible to processes
that are already running, so after a successful install the shim launches
`%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` by its full path, and Windows
discovery searches that folder after the `PATH` entries.
`VSCODE_COPILOT_SHIM_RELEASES_URL` replaces the releases URL for tests; the
signer requirement still applies. Installation does not use PowerShell or
winget.

Copilot CLI supports Windows PowerShell 5.1 as well as PowerShell 7, so a
missing PowerShell 7 never blocks installation. Setup's page shows at most a
soft recommendation to install it.

### macOS

On macOS, installer attempts use this order:

1. If `brew` exists, run:

   ```sh
   brew install --cask copilot-cli
   ```

2. If Homebrew is unavailable or fails without cancellation and `curl` exists,
   download and run the official installer.
3. If the curl route is unavailable or fails without cancellation and `wget`
   exists, download and run the official installer.
4. If none of Homebrew, curl, or wget exists, instruct the user to install one
   of them and exit nonzero.
5. If one or more available installers fail, preserve their diagnostics, point
   to the manual installation documentation, and exit nonzero. Do not tell the
   user to install a tool that was already found.

### Linux GNU x64/arm64

Try the curl installer route, followed by wget if curl is unavailable or the
attempt fails without cancellation. Homebrew casks are not supported on Linux,
so do not attempt `brew install --cask copilot-cli` there.

If neither downloader exists, instruct the user to install curl or wget. If
available attempts fail, preserve their diagnostics and point to manual
installation documentation. Both outcomes exit nonzero.

### Official installer URL

The installer URL is:

```text
https://gh.io/copilot-install
```

### Interactive curl/wget execution

The shim MUST NOT execute `curl ... | bash` or `wget ... | bash` directly,
because that gives `bash` the script pipe as stdin instead of the user's
terminal.

For curl or wget:

1. Create a securely named temporary file.
2. Download the installer into that file.
3. Preserve downloader diagnostics in the current terminal.
4. Verify that `bash` is available.
5. Run `bash <temporary-file>` with inherited stdin, stdout, and stderr.
6. After the installer process exits and is reaped, remove the temporary file
   on success, failure, and handled cancellation.

Suggested downloader forms are semantically equivalent to:

```sh
curl -fsSL https://gh.io/copilot-install -o <temporary-file>
wget -O <temporary-file> https://gh.io/copilot-install
```

If `bash` is unavailable on an automatic script-install target, report that
prerequisite and do not start another downloader route; it would require the
same missing interpreter.

### Cancellation and temporary-file lifetime

Handled cancellation during the bootstrap workflow MUST stop the operation.
It MUST NOT start a fallback installer, prompt again, or launch the real CLI.
In particular, Ctrl+C canceling an installer is not an ordinary failure that
permits the next installation attempt.

Keep interactive installer children attached to the current terminal.
Coordinate cancellation, wait for/reap the active child, then clean up its
temporary script file. Cleanup is guaranteed for normal exits, reported
failures, and handled cancellation, not SIGKILL, abrupt OS termination,
crashes, or power loss.

## Post-install discovery

An installer returning zero is not sufficient evidence that Copilot CLI is
ready.

After a successful install, the shim MUST restart `PATH` discovery from the
beginning, reapply all self and legacy exclusions, and launch only a candidate
found by that second discovery. It MUST NOT launch a path remembered from
before the install.

The flow MUST be bounded to one accepted install per shim invocation. If
installation returns success but no candidate is visible in the current `PATH`,
explain that the install completed but the current terminal cannot resolve
`copilot`, instruct the user to restart the terminal or update `PATH`, and exit
nonzero, without prompting again.

## Final launch

The final process MUST:

- use the exact discovered candidate and its required execution adapter;
- receive forwarded arguments according to the argument-preservation contract,
  including the accepted Windows PowerShell 5.1 compatibility exception;
- inherit stdin, stdout, and stderr;
- inherit the current working directory; and
- receive the current environment without adding a recursion-guard variable.

The shim MUST wait for the real CLI and report its result according to the
outcome table.

## Outcome and exit behavior

| Outcome | Required shim result |
|---|---|
| Real CLI exits with a numeric code | Exit with the same code. |
| Real CLI terminates from a Unix signal | Exit with `128 + signal`. |
| Real CLI or required interpreter cannot start | Print the failing path and OS error; exit `1`. |
| Current executable cannot be identified | Print a diagnostic; exit `1`. |
| All candidates are unusable and installation is unavailable or fails | Print an actionable diagnostic; exit `1`. |
| Installer returns zero but re-discovery fails | Print the PATH/restart guidance; exit `1`. |
| Automatic installation is unsupported for the target | Print manual-install or upstream-support guidance; exit `1` without an installer attempt. |
| Bootstrap or installer operation is canceled | Stop without fallback, reap the child and clean up owned temporary files; return a nonzero cancellation result (`128 + signal` on Unix). |
| User declines installation | Exit `0` without launching. |
| Prompt receives EOF | Treat as No and exit `0`. |
| No terminal (stdin or stderr isn't a terminal) and no usable CLI | Print a message to stderr; exit `127` without prompting. |
| A `--vscode-shim` option is unknown or malformed | Print a diagnostic; exit `2` without launching. |
| Installation is needed, but the `CopilotCliCommand` policy is disabled | Print the policy diagnostic; exit `10` without launching. |

Shim-owned diagnostics go to stderr. Prompts and normal installer/CLI output
remain visible in the terminal.

## Enterprise policy

The VS Code policy `CopilotCliCommand` controls the core setting
`chat.copilotCliCommand.enabled`. When it is disabled:

- the shim still launches a Copilot CLI that is already installed, but never
  installs one. It prints a diagnostic that names the policy and exits with
  `10`;
- `probe` reports `policy=disabled` and skips its network check, and `install`
  reports the `policy` status;
- VS Code setup on Windows doesn't show its Copilot CLI page, doesn't publish
  the shim, and removes the `PATH` entry it added; and
- the Copilot extension doesn't add the shim to integrated terminals, which run
  `copilot` from `PATH` instead.

On Windows the shim reads the policy from the registry: a `REG_DWORD`
`CopilotCliCommand` value of `0` under
`SOFTWARE\Policies\Microsoft\<quality key>` disables it. Quality keys are
`VSCode`, `VSCodeInsiders`, `VSCodeExploration`, and `CodeOSS`. For each
quality, the `HKLM` value takes precedence over the `HKCU` value, as in VS Code.
A disabled policy in any quality wins, because the shim of any installed quality
can be the one on `PATH`; VS Code setup applies the same rule.

On macOS and Linux the shim doesn't read the policy. It is reachable only from
integrated terminals there, and the Copilot extension applies the policy
through the setting.

`CopilotCliCommand` is the only local control over the shim and installation.
Copilot's device-managed settings (`HKLM\SOFTWARE\Policies\GitHubCopilot` and
`%ProgramFiles%\GitHubCopilot\managed-settings.json`) have no key that turns
Copilot CLI off or blocks installing it; turning Copilot CLI on or off is a
server-side organization or enterprise policy, which the CLI applies after
sign-in. The CLI's automatic updates can be turned off only per user
(`COPILOT_AUTO_UPDATE=false`, `--no-auto-update`, or the user configuration).

## Setup commands

The Windows installer runs these commands; they never launch the Copilot CLI.
Result files are INI files encoded as UTF-16LE with a byte order mark, so
`GetPrivateProfileString` reads them on every Windows version. Values are
single-line, and each file is replaced atomically.

### `info`

`copilot --vscode-shim info` prints `protocol=1` and `version=<shim version>`
on separate lines and exits `0`.

### `probe`

```text
copilot --vscode-shim probe --result-file <ini> [--scope user|machine]
    [--no-network] [--timeout-ms <milliseconds>]
```

`probe` finds the first Copilot CLI candidate without running any candidate.
The `user` scope (default) searches the process `PATH`, the machine and user
`PATH` stored in the registry (setup may have inherited a stale `PATH`), and the
MSI folder. The `machine` scope searches only the registry's machine `PATH`. It
also reports whether PowerShell 7 is available.

Unless `--no-network` is given, it resolves the latest release and requests the
MSI for the current architecture, within the timeout (default 5 seconds, at most
60 seconds). The timeout covers the whole check, including proxy discovery, so
setup gets the local result even when the network hangs. It writes a `[probe]`
section with `protocol`, `shimVersion`, `scope`, `policy` (`allowed` or
`disabled`), `cliFound`, `cliPath`, `pwshFound`, `downloadAvailable`,
`downloadSize`, `releaseTag`, and `reason`, and exits `0` when the file was
written.

### `install`

```text
copilot --vscode-shim install --interactive
copilot --vscode-shim install --non-interactive --consent=installer
    --result-file <ini> [--progress-file <ini>] [--cancel-file <path>]
    [--running-mutex <name>]
```

`install` runs the Windows installation described under
[Installation commands](#installation-commands). Other
platforms report that it is unsupported.

`--non-interactive` requires `--consent=installer`, the consent that setup
collected on its page or command line. In that mode the command:

- reports `alreadyInstalled` without downloading when discovery finds a CLI;
- rewrites a `[progress]` section with `phase`, `current`, `total`, and
  `heartbeat` while it works;
- stops between download chunks when the cancel file exists;
- holds the named mutex while it runs; and
- writes a `[result]` section with `status`, `exitCode` (the msiexec exit
  code), `cliPath`, `cliVersion`, `log`, and `reason`.

| Status | Exit code |
|---|---|
| `installed`, `alreadyInstalled` | `0` |
| `policy` | `10` |
| `network` | `20` |
| `verification` | `30` |
| `msiexec` | `40` |
| `cancelled` | `50` |
| `unsupported`, `error` | `1` |

## Cargo package requirements

`copilot_shim/` is an independent Cargo package with:

- its own `Cargo.toml`;
- its own committed `Cargo.lock`;
- a single binary target named `copilot`;
- release LTO and symbol-stripping settings appropriate for a small
  bootstrapper;
- the same Rust 1.88 toolchain currently installed by the CLI build jobs; and
- Microsoft copyright headers in Rust source files.

CI builds MUST use `--locked`.

On Windows, `build.rs` embeds a version resource whose file and product
versions are the package version. VS Code setup replaces a published shim only
when this version differs, so the package version MUST be bumped whenever the
shim changes. `build.rs` writes the resource in the `.res` format, which the
MSVC linker accepts directly, so the build needs no resource compiler or extra
dependencies.

Dependencies must be minimal and justified. The Windows MSI installation uses
WinHTTP, CNG, and WinTrust through `windows-sys` rather than an HTTP or
cryptography crate. macOS and Linux installation rely on curl or wget.

Third-party notice and SBOM inputs must be updated for dependencies actually
added by the package.

## Build target matrix

The shim must match the complete current VS Code CLI target matrix.

| Product | Rust target | Archive |
|---|---|---|
| macOS x64 | `x86_64-apple-darwin` | zip |
| macOS arm64 | `aarch64-apple-darwin` | zip |
| Windows x64 | `x86_64-pc-windows-msvc` | zip |
| Windows arm64 | `aarch64-pc-windows-msvc` | zip |
| Linux GNU x64 | `x86_64-unknown-linux-gnu` | tar.gz |
| Linux GNU arm64 | `aarch64-unknown-linux-gnu` | tar.gz |
| Linux GNU armhf | `armv7-unknown-linux-gnueabihf` | tar.gz |
| Alpine x64 | `x86_64-unknown-linux-musl` | tar.gz |
| Alpine arm64 | `aarch64-unknown-linux-musl` | tar.gz |

### ABI and linker requirements

- Linux GNU artifacts MUST retain the existing CLI requirement of no GLIBC
  dependency newer than 2.28.
- Alpine artifacts MUST be musl builds.
- Windows artifacts MUST use static CRT linkage and the same applicable
  control-flow protection flags as the existing CLI:
  - x64: `/guard:cf` and `/CETCOMPAT`;
  - arm64: `/guard:cf` with the repository's current arm64 CET setting.
- Cross-target sysroots, linkers, and build hosts SHOULD follow the existing CLI
  templates unless the smaller package proves they are unnecessary.

## Build pipeline architecture

The shim MUST NOT be added as another binary inside the existing `cli/` crate
or CLI artifact. It is built by the existing VS Code CLI jobs
(`product-build-<os>-cli.yml`), after the CLI:

- `copilot-shim-compile.yml` builds and stages one target. It reuses the CLI
  job's Rust toolchain, sccache server and cache, and Linux sysroots.
- `copilot-shim-quality.yml` runs in the Windows, macOS, and Linux x64 CLI jobs.
- Each CLI job publishes the unsigned shim as
  `unsigned_copilot_shim_<platform>_<arch>`. There are no separate shim jobs,
  shim signing jobs, or standalone signed shim artifacts.

The ADO CI/check-only runs of the CLI jobs build, lint, and test the shim
without publishing it.

Before packaging, CI MUST run:

- `cargo test --locked` on a supported host;
- `cargo clippy --all-targets --locked -- -D warnings`; and
- formatting verification.

The product build places the unsigned shim in `bin/copilot-shim/` of the client
and server builds before it signs and packages them:

| Platform | Where the shim is added |
|---|---|
| Windows | The sign job adds it to the client and server before `codesign.ts` signs every `.exe`. The setup packages include it when it is present (the `CopilotShim` Inno Setup definition). |
| macOS | The compile job adds it to the client app and the server after the CLI. |
| Linux GNU | The compile job adds it to the client after the CLI, so the deb, rpm, and snap packages include it, and to the server before archiving it. |
| Alpine | The Alpine job adds it to the server before archiving it. |

## Artifact names and contents

Shim artifacts are intermediate pipeline artifacts. Their names MUST NOT start
with `vscode_`, which the product release publisher consumes:

```text
unsigned_copilot_shim_<platform>_<arch>
```

Platforms are `darwin`, `win32`, `linux`, and `alpine`. Each archive (zip on
Windows and macOS, tar.gz on Linux and Alpine) contains exactly one executable
at its root:

- `copilot.exe` on Windows.
- `copilot` on macOS, Linux GNU, and Alpine.

Unix archive validation MUST verify the executable bit. Windows PDBs may be
published to the symbol service but MUST NOT be included in the archive.

## Signing and notarization

The shim is signed with the build that contains it, like the VS Code CLI:

- Windows: the ESRP `sign-windows` pass of `codesign.ts` over the client and
  server builds; the setup packages are built from the signed client.
- macOS: hardened-runtime signing, ESRP signing, and notarization of the client
  app; `sign-server.ts` for the server. The universal app merges the x64 and
  arm64 shims.
- Linux GNU and Alpine: unsigned, like the CLI. The deb and rpm packages are
  signed.

## Required automated tests

Tests must be network-free and must not invoke real package managers or modify
the developer machine. Candidate execution, prompts, installers, filesystem
identity, and process launching must have injectable seams or controlled test
fixtures.

### Discovery and exclusion

- PATH order across multiple directories.
- Empty, relative, duplicate, missing, and non-UTF-8 PATH entries.
- Non-directory entries and non-executable Unix files.
- Same executable path.
- Symlink, hard link, copied shim, and stable-marker shim.
- Explicitly unsupported file-ID operations use canonical paths and marker
  checks; permission/I/O errors do not silently enable that fallback.
- Broken symlink and symlink loop.
- Valid later candidate after rejected candidates.
- Every positive legacy-wrapper signature.
- Legitimate npm `.cmd` and `.ps1` negative fixtures.
- Windows extension ordering and case-insensitive names.

### Candidate selection and PowerShell hosts

- The first usable candidate is launched without being run first.
- A candidate whose interpreter is unavailable is skipped.
- PowerShell is located only for a `.ps1` candidate, at most once per
  invocation.
- PowerShell host versions: the first `major.minor.patch`, with prefixes,
  suffixes, fourth components, and numeric overflow.
- PowerShell probe timeout and combined-output limits, tested with injected
  budgets and assertions for the production values of 30 seconds and 262,144
  bytes.
- Probe Job Object termination, owned-child reaping, and
  no-surviving-descendant verification before trying the next host.
- Race-free Job Object assignment before a probe can create descendants.
- Probe cancellation stops the workflow.

### Prompts and install flow

- Default No for blank input.
- `y` and `Y`.
- EOF.
- Without a terminal: no prompt, and exit `127` for a missing CLI.
- User declines install.
- Each automatic-install platform policy: Windows MSI, macOS
  Homebrew/script, and GNU Linux x64/arm64 script.
- ARMhf and musl missing-CLI cases show guidance without running an installer;
  existing CLI candidates remain launchable.
- Linux GNU x64/arm64 does not attempt a Homebrew cask.
- Fallback after an available installer fails without cancellation.
- Missing bash, brew, curl, and wget.
- Installers receive inherited terminal streams through the Windows MSI install
  command, brew, curl/bash, and wget/bash.
- Successful install followed by re-discovery from the first `PATH` entry and
  launch of the newly found candidate.
- A successful Windows MSI install launches
  `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` by its full path, even though
  the terminal's `PATH` predates it.
- Successful install not visible in current PATH.
- No repeated install prompt in one invocation.
- Ctrl+C/handled termination during installation cancels without fallback,
  another prompt, or final CLI launch.
- Temporary-script cleanup occurs after child reaping on success, failure, and
  handled cancellation.

### Options and setup commands

- Leading `--vscode-shim clear` modifiers are removed, an optional `--` after
  them ends the prefix, and everything else, including a later `--vscode-shim`
  or a bare `--clear`, is forwarded.
- Commands parse their options, never launch the CLI, and reject unknown
  options, missing values, and commands after modifiers with exit code `2`.
- Release tags are taken only from `/releases/tag/<tag>` redirects.
- Checksums match the exact asset name, and MSI assets follow the architecture.
- Result files are UTF-16LE single-line INI files replaced atomically.
- Install statuses map to the documented exit codes.
- Unsigned files have no Authenticode signer.
- The MSI registration can be queried.
- With the `CopilotCliCommand` policy disabled, a missing CLI produces the
  policy diagnostic and exit code `10` without a prompt, and an installed CLI
  still launches.
- Policy registry values are read only from `REG_DWORD` values.

### Launch behavior

- Exact argument preservation for the Unix, native Windows, cmd/batch, and
  modern PowerShell execution adapters.
- PowerShell 7.3+ selection when available and Windows PowerShell 5.1 legacy
  fallback otherwise.
- Explicit legacy-host fixtures document the accepted empty-argument and
  embedded-quote differences instead of claiming lossless forwarding.
- One leading `--vscode-shim clear` consumed and a later one forwarded.
- No terminal-clear bytes in redirected output.
- Inherited stdin, stdout, stderr, environment, and working directory,
  parameterized across the Unix launch path and Windows `.exe`, `.cmd`, `.bat`,
  and `.ps1` adapters.
- Numeric nonzero child exit propagation, parameterized across the Unix launch
  path and every Windows adapter.
- Unix signal mapping.
- Spawn and interpreter failure diagnostics.
- Final CLI/installers receive no shim-owned recursion-guard variable, so
  legitimate descendant invocations of the shim are not blocked.

### Build and artifact behavior

- Every target builds from the committed lockfile.
- Host tests, clippy, and formatting pass.
- No Linux GNU referenced GLIBC symbol version exceeds 2.28.
- Windows control-flow/static-CRT settings are present.
- The Windows binary's file version is the package version.
- Each archive has the expected name and one root executable.
- Unix executable mode is set.
- Shim artifact names do not reuse CLI artifact names and do not begin with
  `vscode_`, so they remain outside the product release publisher.
- Client and server builds contain the shim at `bin/copilot-shim/`, signed
  where the build is signed.

## Acceptance criteria

The work is complete only when:

1. All target artifacts are produced under separate shim names.
2. Client and server builds contain the shim at `bin/copilot-shim/`, and the
   macOS and Windows builds sign it.
3. Every archive contains the correctly named executable.
4. A manually invoked shim launches the first valid non-shim Copilot CLI in the
   defined search order.
5. Self aliases, copied Rust shims, and all specified legacy shims are skipped.
6. A missing CLI follows the default-No installation flow on supported
   automatic-install targets; other targets receive actionable guidance.
7. Installer prompts are usable in the current terminal.
8. A successful install is followed by fresh PATH discovery.
9. Selecting a candidate never runs it, and PowerShell runs only when a `.ps1`
   candidate needs a host.
10. The real CLI's arguments follow the preservation contract and its accepted
    Windows PowerShell 5.1 exception; terminal I/O and exit results are preserved.
11. The setup commands follow the documented result-file contract.
12. All required automated tests and artifact validations pass.
13. PowerShell probes enforce the approved time/output bounds and clean up
    their processes on failure.
14. Handled cancellation stops bootstrap installation without fallback and
    cleans temporary files after child reaping.
15. Initial and post-install discovery both respect first-usable-candidate PATH
    precedence.

## Source references

- Terminal integration:
  [`copilotCLITerminalIntegration.ts`](../extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts)
- Windows installer integration: [`copilot.iss`](../build/win32/copilot.iss)
- Existing Rust CLI package: [`cli/`](../cli/)
- Shim compilation and quality checks:
  [`copilot-shim-compile.yml`](../build/azure-pipelines/copilot-shim/copilot-shim-compile.yml),
  [`copilot-shim-quality.yml`](../build/azure-pipelines/copilot-shim/copilot-shim-quality.yml)
- Shared CLI compilation:
  [`cli-compile.yml`](../build/azure-pipelines/cli/cli-compile.yml)
- Windows CLI build:
  [`product-build-win32-cli.yml`](../build/azure-pipelines/win32/product-build-win32-cli.yml)
- Windows signing and packaging:
  [`product-build-win32-sign.yml`](../build/azure-pipelines/win32/steps/product-build-win32-sign.yml)
- macOS CLI build and signing:
  [`product-build-darwin-cli.yml`](../build/azure-pipelines/darwin/product-build-darwin-cli.yml)
- Linux GNU CLI build:
  [`product-build-linux-cli.yml`](../build/azure-pipelines/linux/product-build-linux-cli.yml)
- Alpine CLI build:
  [`product-build-alpine-cli.yml`](../build/azure-pipelines/alpine/product-build-alpine-cli.yml)
- Product pipeline wiring:
  [`product-build.yml`](../build/azure-pipelines/product-build.yml)
- Product release artifact selection:
  [`publish.ts`](../build/azure-pipelines/common/publish.ts)
- GitHub Copilot CLI releases, including the MSI and `SHA256SUMS.txt`:
  <https://github.com/github/copilot-cli/releases>
- GitHub installation guidance:
  <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli>
- Official installer implementation:
  <https://github.com/github/copilot-cli/blob/main/install.sh>
- Homebrew cask platform metadata:
  <https://formulae.brew.sh/cask/copilot-cli>
- PowerShell native argument behavior:
  <https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing>
