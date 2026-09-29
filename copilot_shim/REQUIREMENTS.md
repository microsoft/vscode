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

When no usable CLI is available, or the first usable CLI has an old parsed
version, the shim offers interactive installation or update on supported
installer targets. It then repeats discovery before launching. Other targets
receive manual-install or upstream-support guidance.

## Scope

The implementation includes:

- Cross-platform Copilot CLI discovery through `PATH`.
- Self, copy, symlink, hard-link, and legacy-shim exclusion.
- Windows native and script-wrapper support.
- Minimum-version validation.
- Interactive installation and update, using GitHub's per-user MSI on Windows.
- Recursive post-install/post-update discovery and validation.
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
5. Select the first eligible candidate using the deterministic platform rules
   in this document.
6. Run that exact candidate with `--version`.
7. If no usable candidate exists, offer installation on a supported installer
   target; otherwise report the manual-install or upstream-support limitation.
8. If a parsed version is below `1.0.82`, offer an update on a supported
   installer target; otherwise report the manual-update limitation.
9. After a successful install or update, discard all prior discovery results
   and restart discovery and version validation from the current process
   environment.
10. Launch the same candidate that passed validation, forwarding the original
    arguments and terminal I/O.
11. Propagate the real CLI's exit result.

Installation and update cause a logical recursive re-entry into discovery.
Implementation with a loop or state machine is preferred over unbounded call
stack recursion.

The first usable candidate keeps PATH precedence even when its parsed version
is too old. Failed version probes may be skipped, but a usable old candidate
MUST NOT be skipped merely to select a newer version later in PATH.

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

Installer and updater processes that may prompt the user MUST also inherit
stdin, stdout, and stderr. Output MUST remain visible in the current terminal.

Version probes are the exception: they capture stdout for parsing and stderr
for diagnostics, within the limits specified below. Their stdin MUST be
disconnected from interactive input.

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

The same adapter MUST be used for the version probe and the final launch.

| Candidate | Execution |
|---|---|
| `.exe` | Execute the discovered path directly. |
| `.cmd` or `.bat` | Execute through `%ComSpec% /E:ON /V:OFF /D /S /C` with unquoted switches and explicit Windows command-line quoting of the script path and arguments. `/E:ON` enables the `%` escaping, and `/V:OFF` keeps `!` literal. |
| `.ps1` | Prefer an available PowerShell 7.3+ `pwsh.exe` host with modern native argument passing; otherwise use Windows PowerShell 5.1 (`powershell.exe`) with legacy forwarding. Use `-NoLogo`, `-NoProfile`, and an execution-policy bypass where supported. Do not use `-NonInteractive` for final CLI execution. |

If the required interpreter is unavailable or cannot start, the candidate is
unusable. Discovery continues with the next candidate.

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

Discovery, version checking, prompting, inherited terminal I/O, and child exit
handling remain required under both host modes.

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
for version probing and launch after the candidate passes exclusion. This
preserves legitimate symlink invocation behavior.

### Distinct copies of the Rust shim

Path and file identity do not detect a byte-for-byte or version-different copy
of the shim. Every Rust shim build MUST therefore contain a stable binary
marker reserved for this component, for example:

```text
VSCODE_COPILOT_RUST_SHIM_V1
```

Native candidates MUST be inspected for this marker using a bounded-memory
streaming search. A candidate containing it is another shim copy and MUST be
skipped.

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

## Candidate version validation

### Required version

The minimum compatible Copilot CLI version is:

```text
1.0.82
```

This value MUST have one authoritative definition in the Rust package.

### Probe

The shim runs the exact selected candidate through its platform execution
adapter with:

```text
--version
```

Within one discovery cycle, the candidate used for the version probe MUST be
the candidate path used for final launch. The shim MUST retain and launch the
originally discovered absolute path; it MUST NOT resolve `copilot` by name
again after validation.

Concurrent replacement, in-place rewriting, or symlink retargeting after the
version probe is outside scope. The shim does not revalidate candidate identity
or content immediately before launch and does not claim an atomic same-file
guarantee across probe and process creation.

If a candidate or required interpreter cannot start, or the version command
returns nonzero, that candidate is unusable and discovery continues with the
next candidate. Report the rejected path and reason.

### Probe limits

Every version probe MUST have:

- a 30-second timeout;
- a maximum of 256 KiB (262,144 bytes) of combined stdout and stderr; and
- null stdin, with no consumption of the user's terminal input.

Capture must be bounded while the process runs, not truncated only after
unbounded buffering. If a probe times out or exceeds its output limit,
terminate its process group or job, reap every child process owned by the shim,
verify that no descendant in that group/job remains, report the rejected
candidate and reason, and continue PATH discovery.

On Windows, process creation and Job Object assignment MUST be race-free:
create the probe suspended and assign it to a kill-on-close Job Object before
resuming it, or use an equivalent mechanism that prevents descendants from
escaping before assignment.

On Unix, process-group termination does not make grandchildren waitable
children. The shim MUST reap the direct child it owns and verify that the
process group no longer exists; it MUST NOT claim to reap processes the
operating system has not made its children.

A limit violation is an unusable candidate, not a successful-but-unparseable
version. User cancellation stops the workflow rather than continuing discovery.

These limits apply only to version probes. Interactive installers, updates,
and the final CLI have no corresponding duration or output limit.

### Parsing

For a successful version command:

- Search stdout for the first ASCII decimal `major.minor.patch` triple.
- A leading `v`, surrounding text, prerelease suffix, or fourth component does
  not prevent the first triple from being parsed.
- Components are unsigned integers.
- Overflow makes the version unparseable.
- Stderr is not part of version parsing.

If the command succeeds but no version is parseable, preserve the old shim
behavior: treat the candidate as installed and launch it without an update
prompt.

### Comparison and update prompt

Parsed versions are compared numerically by major, minor, and patch.

When the version is below `1.0.82`, display the installed and required versions
and, on a supported automatic-install target, prompt:

```text
Update GitHub Copilot CLI? [y/N]
```

Only a response whose first non-whitespace character is `y` or `Y` is
affirmative. No response or EOF means No.

Declining an update exits successfully without launching the incompatible CLI.
On ARMhf and Alpine/musl, report manual-update or upstream-support guidance
instead of offering an unsupported automatic update.

Without a terminal (see [Prompts without a terminal](#prompts-without-a-terminal)),
the shim doesn't prompt. It prints a warning to stderr and launches the old CLI,
because a script can't answer the prompt.

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
terminals. Otherwise, as in scripts and CI:

- a missing CLI prints a one-line message with the documentation URL to stderr
  and exits with `127`, the code a shell uses for a command it can't find, on
  every target; and
- an old CLI is launched with a warning on stderr.

A disabled `CopilotCliCommand` policy takes precedence for a missing CLI (exit
`10`).

## Installation and update commands

Updates deliberately reuse the installation commands, matching the old shim's
behavior.

### Automatic-install support

Shim build coverage is distinct from upstream installer coverage. Keep all nine
build targets, but use the following automatic-install policy:

| Target | Installation and update |
|---|---|
| Windows x64/arm64 | GitHub's per-user MSI, downloaded and verified by the shim. |
| macOS x64/arm64 | Homebrew cask, then curl/wget official script. |
| Linux GNU x64/arm64 | curl/wget official script; do not attempt the macOS-only Homebrew cask. |
| Linux GNU armhf | Manual-install/upstream-support guidance; no automatic installer attempt. |
| Alpine/musl x64/arm64 | Manual-install guidance for an upstream musl release; no automatic installer attempt. |

Existing CLI discovery, version probing, and launching remain supported on
every target.

The current official script accepts x64/arm64 architectures and selects the
`copilot-linux-*` archives for Linux; it does not select the separately
published `copilot-linuxmusl-*` archives. ARMhf is not an accepted script
architecture. This phase does not add a custom archive installer to work around
those limitations. Musl users may obtain the appropriate executable from
<https://github.com/github/copilot-cli/releases>.

### Windows

The shim runs `<shim> --vscode-shim install --interactive` as a child attached
to the current terminal. That command, which also backs the installer's
install option, MUST:

1. Resolve the latest release: request
   `https://github.com/github/copilot-cli/releases/latest` without following
   redirects and take the tag from the `/releases/tag/<tag>` redirect location.
2. Download `SHA256SUMS.txt` (at most 64 KiB) and `copilot-x64.msi` or
   `copilot-arm64.msi` for that tag, through WinHTTP with the system proxy
   configuration.
3. Compare the MSI's SHA-256 with its entry in `SHA256SUMS.txt`.
4. Verify the MSI's Authenticode signature with `WinVerifyTrust` and require
   the signer name `GitHub, Inc.`.
5. Run `%SystemRoot%\System32\msiexec.exe /i <msi> /qn /norestart /l*v
   %TEMP%\vscode-copilot-cli-install.log` without elevation. Exit codes `0` and
   `3010` mean success, and `1602` means the install was canceled.
6. Confirm that `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe` exists.

Progress goes to stderr. The MSI adds its folder to the user `PATH`, and
Windows discovery searches that folder even when the terminal's `PATH` predates
the installation. `VSCODE_COPILOT_SHIM_RELEASES_URL` replaces the releases URL
for tests; the signer requirement still applies. Updates run the same install.
Installation does not use PowerShell or winget.

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

## Recursive post-install and post-update validation

An installer returning zero is not sufficient evidence that Copilot CLI is
ready.

After a successful install or update, the shim MUST:

1. Discard the previous candidate and version.
2. Restart PATH discovery from the beginning.
3. Reapply all self and legacy exclusions.
4. Probe the newly selected candidate with `--version`.
5. Reapply the `1.0.82` compatibility check.
6. Launch only a candidate that passes this second discovery cycle, or a
   successful candidate with unparseable version output.

This is the required recursive install check.

The flow MUST be bounded to one accepted install or update action per shim
invocation:

- If installation returns success but no candidate is visible in the current
  `PATH`, explain that the install completed but the current terminal cannot
  resolve `copilot`; instruct the user to restart the terminal or update
  `PATH`; exit nonzero.
- If update returns success but the first usable PATH candidate remains
  below `1.0.82`, explain that the update did not produce a compatible
  first-in-PATH CLI and may be shadowed by an older installation; exit
  nonzero.
- Do not prompt for the same install or update repeatedly in one invocation.
- Do not launch a cached pre-install or pre-update path.

For example, if `/old/bin` precedes `/new/bin` in PATH and the update creates a
compatible `/new/bin/copilot` while `/old/bin/copilot` remains usable but old,
the shim MUST report the older installation shadowing the new one. It MUST NOT
silently bypass that PATH ordering. Explain that the user can reorder PATH,
remove the old installation, or invoke the new installation explicitly.

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
| Installer or updater returns zero but re-discovery fails | Print the PATH/restart guidance; exit `1`. |
| Update leaves the visible CLI below `1.0.82` | Print shadowing/update guidance; exit `1`. |
| Automatic installation/update is unsupported for the target | Print manual-install or upstream-support guidance; exit `1` without an installer attempt. |
| Bootstrap or installer operation is canceled | Stop without fallback, reap the child and clean up owned temporary files; return a nonzero cancellation result (`128 + signal` on Unix). |
| User declines installation | Exit `0` without launching. |
| User declines update | Exit `0` without launching. |
| Prompt receives EOF | Treat as No and exit `0`. |
| No terminal (stdin or stderr isn't a terminal) and no usable CLI | Print a message to stderr; exit `127` without prompting. |
| No terminal and the first usable CLI is below `1.0.82` | Print a warning to stderr and launch that CLI. |
| A `--vscode-shim` option is unknown or malformed | Print a diagnostic; exit `2` without launching. |
| Installation or update is needed, but the `CopilotCliCommand` policy is disabled | Print the policy diagnostic; exit `10` without launching. |

Shim-owned diagnostics go to stderr. Prompts and normal installer/CLI output
remain visible in the terminal.

## Enterprise policy

The VS Code policy `CopilotCliCommand` controls the core setting
`chat.copilotCliCommand.enabled`. When it is disabled:

- the shim still launches a Copilot CLI that is already installed, but never
  installs or updates one. It prints a diagnostic that names the policy and
  exits with `10`;
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
[Installation and update commands](#installation-and-update-commands). Other
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

### Version behavior

- Versions below, equal to, and above `1.0.82`.
- Leading `v`, surrounding text, prerelease suffix, and fourth component.
- Unparseable successful output.
- Numeric overflow.
- Nonzero version command.
- Candidate/interpreter spawn failure followed by a later candidate.
- Probe timeout and combined-output limits, tested with injected budgets and
  assertions for the production values of 30 seconds and 262,144 bytes.
- Probe process-group/Job Object termination, owned-child reaping, and
  no-surviving-descendant verification before moving to the next candidate.
- Race-free Windows Job Object assignment before a probe can create
  descendants.
- Probe cancellation stops the workflow; timeout/output-limit failures do not
  qualify for the successful-but-unparseable exception.

### Prompts and mutation flow

- Default No for blank input.
- `y` and `Y`.
- EOF.
- Without a terminal: no prompt, exit `127` for a missing CLI, and a warning and
  launch for an old CLI.
- User declines install.
- User declines update.
- Each automatic-install platform policy: Windows MSI, macOS
  Homebrew/script, and GNU Linux x64/arm64 script.
- ARMhf and musl missing/old CLI cases show guidance without running an
  installer; existing compatible CLI candidates remain launchable.
- Linux GNU x64/arm64 does not attempt a Homebrew cask.
- Fallback after an available installer fails without cancellation.
- Missing bash, brew, curl, and wget.
- Installer and updater receive inherited terminal streams through the Windows
  MSI install command, brew, curl/bash, and wget/bash.
- Successful install followed by compatible re-discovery and launch.
- Successful update where the original candidate disappears/becomes unusable,
  or a compatible candidate appears earlier in PATH. The test must prove that
  enumeration restarts at the first entry, the newly selected absolute
  candidate is probed, and that exact candidate is launched.
- An old but usable candidate still first in PATH shadows a newer later
  installation: report guidance instead of launching the later candidate.
- Successful install not visible in current PATH.
- Successful update that remains below `1.0.82`.
- No repeated mutation prompt in one invocation.
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
- With the `CopilotCliCommand` policy disabled, a missing or old CLI produces
  the policy diagnostic and exit code `10` without a prompt, and an installed
  compatible CLI still launches.
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
7. Installer and updater prompts are usable in the current terminal.
8. A successful install or update is followed by fresh PATH discovery and
   version validation.
9. A candidate with a parsed version below `1.0.82` is not launched, including
   after an update that leaves it unchanged. Successful probes without a
   parseable version retain the explicitly approved exception.
10. The real CLI's arguments follow the preservation contract and its accepted
    Windows PowerShell 5.1 exception; terminal I/O and exit results are preserved.
11. The setup commands follow the documented result-file contract.
12. All required automated tests and artifact validations pass.
13. Version probes enforce the approved time/output bounds and clean up their
    processes on failure.
14. Handled cancellation stops bootstrap installation without fallback and
    cleans temporary files after child reaping.
15. Initial and post-update discovery both respect first-usable-candidate PATH
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
