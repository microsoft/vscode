<!--
  REMOTE_PLATFORM.md
  Living spec — keep in sync with code after each significant change.
  See: node/remotePlatform/remotePlatform.ts,
       node/remotePlatform/posixRemotePlatform.ts,
       node/remotePlatform/windowsRemotePlatform.ts,
       node/remotePlatform/remotePlatformDetection.ts,
       node/sshRemoteAgentHostService.ts, node/sshRemoteAgentHostHelpers.ts,
       cli/src/commands/agent_host.rs, cli/src/tunnels/agent_host_metadata.rs.
-->

# Remote Platform Abstraction

> **Status: PLANNED**

Connecting an agent host to a remote machine requires operating on that machine:
detect what it is, install the VS Code CLI, launch `code agent host`, and track
the resulting process across reconnects. Every one of those steps is operating
system specific.

This document specifies `IRemotePlatform` — the strategy that owns all
OS-specific remote behaviour — so that the SSH transport contains no shell
syntax of its own.

---

## 1. Mental Model

### Concepts

| Term | What it is |
|------|-----------|
| **Remote platform info** | The identity of a remote machine: `{ os, arch }`. Pure data. |
| **Remote platform** | A strategy that performs semantic operations ("read this file", "is this process alive") against a remote of one OS family, using an injected executor. |
| **Executor** (`ISshExec`) | Sends a command string, returns `{ stdout, stderr, code }`. Knows nothing about shells or operating systems. |
| **Supervisor** | The detached, long-lived process the CLI daemonizes to host the agent. Owns the canonical metadata file. |

### Guiding principles

- **Operations, not command strings.** The platform exposes
  `isProcessAlive(exec, identity)`, not `isProcessAliveCommand(): string`.
  Exit-code interpretation is OS-specific (Windows `Test-Path` prints `False`
  and exits `0`), and some operations need more than one round trip, so the
  platform must own execution rather than hand strings to a caller.
- **One place per OS.** Adding an OS means adding one implementation, not
  editing twenty call sites. Adding a *variant* of an OS means subclassing.
- **Escaping belongs to the platform.** Each implementation owns its quoting
  rules. Cross-platform escaping helpers are a trap and must not exist.
- **The CLI owns process identity.** The desktop never invents a PID. See §4.
- **Validate remote-supplied data before reuse.** Any string that came back over
  SSH and re-enters a command is re-validated by the platform that produced it.

### Layering

```
sshRemoteAgentHostService ──uses──▶ IRemotePlatform ──▶ PosixRemotePlatform
        │                                 │            (Linux and macOS)
        │                                 └──────────▶ WindowsRemotePlatform
        └──uses──▶ detectRemotePlatform(exec)
```

`IRemotePlatform` receives an `ISshExec` per call and never imports the SSH
transport, so it stays unit-testable against the existing fake executor.

---

## 2. Interface

```ts
export type RemoteOS = 'linux' | 'darwin' | 'win32';
export type RemoteArch = 'x64' | 'arm64' | 'armhf';

export interface IRemotePlatformInfo {
	readonly os: RemoteOS;
	readonly arch: RemoteArch;
}

/**
 * Identifies a remote process strongly enough that we may terminate it.
 * A bare PID is insufficient: PIDs are recycled, and a stale lockfile plus a
 * recycled PID would otherwise let us kill an unrelated process.
 *
 * `startToken` is an opaque, platform-defined value derived from native
 * process-creation data (POSIX: the `starttime` field in jiffies; Windows:
 * the raw `CreationTime` FILETIME) — never a formatted date, whose precision
 * and timezone rendering vary per host.
 *
 * It is **optional**: not every CLI writes it. When the commit-pinned download
 * fails, the installer falls back to any usable CLI already present on the
 * remote (`sshRemoteAgentHostService.ts:1470-1485`) — a binary of unknown
 * vintage, possibly installed by an older desktop build or by Remote-SSH, which
 * shares the same install root. Absence permits reuse but forbids destructive
 * cleanup (§4.3).
 */
export interface IRemoteProcessIdentity {
	readonly pid: number;
	readonly startToken: string | undefined;
}

/**
 * A remote path. Kept opaque because a plain string cannot distinguish a
 * literal path from a trusted shell expression: POSIX paths deliberately
 * carry an unquoted `~` so the remote shell expands it, while a Windows
 * `$env:USERPROFILE` fragment passed to `-LiteralPath` as a quoted value
 * would not expand at all. Each platform renders its own paths from
 * validated components.
 */
export interface IRemotePath {
	readonly _brand: 'remotePath';
}

/**
 * A launch target. Structured rather than a command string because
 * PowerShell's `&` operator does not split an executable-plus-arguments
 * string, and `Invoke-Expression` would reintroduce injection.
 *
 * `executable` is an absolute remote path for the managed CLI. It is never
 * resolved against `PATH`: the desktop always knows exactly which binary it
 * installed, and accepting a bare name would let `PATH` decide what runs.
 *
 * `args` are *logical* arguments — unquoted and unescaped, exactly as the
 * process should receive them in `argv`. Quoting is applied by the platform
 * when it renders the command, so callers never escape anything themselves.
 */
export interface IRemoteLaunchSpec {
	readonly executable: IRemotePath;
	readonly args: readonly string[];
}

export interface IRemotePlatform {
	readonly info: IRemotePlatformInfo;

	/**
	 * Paths and naming — pure, no I/O.
	 *
	 * `quality` is the product quality (`stable` | `insider` | `exploration`),
	 * which selects the CLI binary name (`code`, `code-insiders`, …) and keys
	 * the per-quality metadata file.
	 *
	 * `serverDataFolderName` is a folder *name*, not a path — the
	 * `serverDataFolderName` from product configuration, e.g. `.vscode-server`.
	 * `installRoot` is what turns it into a path beneath the remote home
	 * directory.
	 */
	cliArchiveName(quality: string): string;
	installRoot(serverDataFolderName: string): IRemotePath;
	cliDataDir(serverDataFolderName: string): IRemotePath;
	cliBin(serverDataFolderName: string, quality: string, commit?: string): IRemotePath;
	metadataPath(serverDataFolderName: string, quality: string): IRemotePath;

	/**
	 * Parse a candidate path that came back from the remote over SSH.
	 *
	 * This is the trust boundary: remote output arrives as an untrusted
	 * `string`, and only paths matching a shape we recognise
	 * (`<installRoot>/<archive>-<40 hex>` or a legacy single-binary path)
	 * become an `IRemotePath` that may re-enter a command. Anything else
	 * yields `undefined`. Returning a parsed value rather than a boolean means
	 * an unvalidated string is not usable as a path by construction.
	 */
	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): IRemotePath | undefined;

	/** Operations — each owns its own exit-code interpretation */
	readFile(exec: ISshExec, path: IRemotePath): Promise<string | undefined>;
	removeFile(exec: ISshExec, path: IRemotePath): Promise<void>;
	isExecutableFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	touchFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	isProcessAlive(exec: ISshExec, identity: IRemoteProcessIdentity): Promise<boolean>;
	killProcessTree(exec: ISshExec, identity: IRemoteProcessIdentity): Promise<void>;
	versionCheck(exec: ISshExec, cliBin: IRemotePath): Promise<boolean>;
	installCli(exec: ISshExec, options: { url: string; installRoot: IRemotePath; cliBin: IRemotePath }): Promise<void>;
	pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void>;
	findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly IRemotePath[]>;

	/** Launch */
	buildLaunchCommand(spec: IRemoteLaunchSpec): string;
}
```

A user-supplied `remoteAgentHostCommand` is *not* a launch spec: it is an
arbitrary command string with an explicit POSIX shell contract, modelled
separately (§6).

---

## 3. POSIX implementation

`PosixRemotePlatform` is a single class covering Linux and macOS, and preserves
the existing behaviour exactly.

There is deliberately **no `LinuxRemotePlatform` / `DarwinRemotePlatform` split**,
because no divergence exists to model: the current commands are already written
to be portable across both, and say so — `ls -1t` "sorts by mtime newest-first on
both Linux (coreutils) and macOS (BSD)", and `xargs -I{}` "skips the command
entirely on empty input on both GNU and BSD `xargs`"
(`sshRemoteAgentHostHelpers.ts:192-202`). Introducing subclasses that override
nothing would add indirection without expressing a real difference.

The abstraction is nonetheless what makes such a split cheap when a genuine
divergence appears: it becomes one subclass overriding the operations that
differ, with no change at any call site.

Commands are unchanged, including the `--`-terminated `rm`/`ls`/`touch`
invocations, the 40-hex commit glob, the `umask 077` subshell, and the
`xargs -I{}` retention pass.

---

## 4. Process lifecycle

### 4.1 What the CLI actually does

`code agent host` is not a single process. The foreground invocation re-execs
itself detached with `VSCODE_AGENT_HOST_SUPERVISOR` set
(`cli/src/commands/agent_host.rs`), and that **detached supervisor** binds the
listener, prints `__VSCODE_AGENT_HOST_READY__`, and outlives the invoking shell.
Without `--detach` the foreground process then streams the supervisor's output.

The supervisor writes the canonical metadata file itself — PID, port and token —
via `write_agent_host_metadata` (`cli/src/tunnels/agent_host_metadata.rs`), at
the same path the desktop reads.

### 4.2 Consequence: the desktop must not invent a PID

Recording a shell's `$$` (or a PowerShell wrapper's `$PID`) and writing it over
the CLI's metadata file records the *wrong process* and clobbers authoritative
state. The supervisor is the process whose liveness determines whether an agent
host can be reused.

**The desktop therefore reads the CLI's metadata rather than writing its own.**
After launch, it waits for readiness, then reads `metadataPath` to obtain the
supervisor's identity. `writeAgentHostState` is retired for the managed path.

This also removes the `echo VSCODE_PID=$$` marker and the whole class of
"how do I capture a PID in this shell" problems — which is precisely the problem
that has no clean PowerShell answer.

> **Spike (blocking P4).** Confirm the supervisor's metadata is written and
> readable before the desktop needs it on both families, and confirm the
> foreground process streams the banner identically on Windows. If metadata
> lands too late, the fallback is to keep scraping the banner for the port and
> read identity from metadata on the next round trip.

### 4.3 The supervisor is shared — termination rules

The supervisor is explicitly *shared* infrastructure: it "is shared and outlives
any individual invocation" (`cli/src/commands/agent_host.rs`), and other callers
— `code tunnel`, WSL, a second desktop, or a second SSH connection — reuse the
same process by design.

The **relay** is the WebSocket bridge the desktop opens over the SSH connection
to reach the agent host's loopback port; the **fallback** is the recovery branch
taken when that bridge cannot be established against a supervisor the desktop
decided to reuse. That branch currently kills whatever the metadata names and
starts fresh (`sshRemoteAgentHostService.ts:782-800`).

That is currently near-harmless because the recorded PID is usually already dead
(§12, D1), so the kill is typically a no-op. Making metadata authoritative would
make it **reliably destructive**, tearing down an agent host another consumer is
actively using.

Therefore:

- **A relay failure alone never justifies killing anything.** The remote loopback
  endpoint must be independently proven dead — probed on the remote, separately
  from the SSH relay — before any termination. Otherwise the supervisor is
  preserved and a retryable connection error is surfaced.
- **Identity is required to kill.** `isProcessAlive` and `killProcessTree` take an
  `IRemoteProcessIdentity` and verify `startToken`. If identity cannot be proven
  (older CLI, missing field), reuse is still permitted but destructive cleanup is
  **prohibited**: stale metadata is removed without killing.
- Termination reaps the tree (`kill_tree` on POSIX, `taskkill /T /F` on Windows)
  or the detached supervisor is orphaned.

### 4.4 Identity compatibility contract

`startToken` is an **optional additive field within schema version 1**. The
schema version is deliberately *not* bumped: `parseRemoteAgentHostState` rejects
any differing `schemaVersion` outright (`common/remoteAgentHostMetadata.ts:60`),
so a bump would make the desktop treat valid remote metadata as invalid and
delete it.

The resulting duplicate supervisor would *function* — `--port 0` auto-assigns, so
it binds a free port and mints its own token, and the desktop connects to it
successfully. The cost is a leak rather than a malfunction: the previous
supervisor is left running with nothing referencing it, since a single metadata
file per quality now names the newer one. That is still worth avoiding, but it
is why the field is additive rather than versioned — the cheaper option is
simply not to create the situation.

Skew is therefore two-way and must both degrade to "reuse, never kill":

| Desktop | Remote CLI | Behaviour |
|---|---|---|
| new | new | Full identity checking; cleanup permitted |
| new | old (no `startToken`) | Reuse permitted; destructive cleanup refused |
| old | new | Extra field ignored; unchanged behaviour |

The Rust destructive consumers are PID-only today (`commands/agent_kill.rs`,
`commands/agent.rs`, `tunnels/agent_host.rs`, `commands/agent_host.rs`) and are
updated alongside, or invariant I5 holds only in the desktop and not in the
system.

After launch the desktop reads **one canonical metadata snapshot** — PID,
identity, host, port, token — and validates any banner-scraped value against it,
rather than merging two sources of truth.

### 4.5 Why CLI vintage is not controlled

The desktop pins the CLI to its own commit and installs it at a commit-keyed
path. That pin is **best-effort, not guaranteed** — which is why `startToken`
must be optional.

When the pinned download fails (offline, proxy, a 404 for a purged or
unpublished artifact, or a post-install `--version` check failure), the
installer does not refuse to connect. It searches the remote for any usable CLI
already present and runs the newest one that answers `--version`
(`sshRemoteAgentHostService.ts:1470-1485`), logging that it "does not match
desktop commit". Candidates, newest by mtime first:

1. other commit-keyed binaries in the shared install root, and
2. the legacy single-binary paths from the previous installer layout
   (`~/.vscode-cli{,-<quality>}/<archive>`).

Such a binary is of **unknown vintage rather than merely old**: it could predate
this desktop build, or postdate it if the user rotates between builds, and the
install root is deliberately shared with Remote-SSH, so it may have been placed
there by a different feature entirely.

The desktop therefore cannot assume any particular CLI version at runtime, and
every field it reads from CLI-written metadata must degrade gracefully when
absent.

---

## 5. Windows implementation

### 5.1 Transport encoding

Windows OpenSSH may be configured with `cmd.exe`, `powershell.exe`, or `pwsh` as
the default shell. Quoting rules differ across all three and the shell in use is
not knowable up front.

**Every Windows command is sent as:**

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64-UTF16LE>
```

The base64 alphabet (`A-Z a-z 0-9 + / =`) contains no shell metacharacter, so the
outer command line is inert under `cmd.exe`, PowerShell, and `sh` alike. This
removes default-shell ambiguity and eliminates outer-shell quoting as a class of
bug. `powershell.exe` is used rather than `pwsh` because it is present on every
supported Windows install.

Base64 protects only the *outer* shell. Values interpolated **inside** the
payload still require PowerShell escaping, which the platform owns.

### 5.2 Payload envelope

Every payload uses a common envelope so the executor's `{ stdout, code }`
contract is identical across platforms:

- `$ErrorActionPreference = 'Stop'` and an explicit `exit <n>`; predicates emit
  an explicit exit code rather than relying on cmdlet output (`Test-Path` prints
  `False` and exits `0`).
- `[Console]::OutputEncoding` pinned to UTF-8 so `stdout` is decodable by the
  transport, which assumes UTF-8 text.
- Machine-readable single-line markers (`VSCODE_REMOTE_*=`) for any value the
  desktop parses.
- stderr is used only for diagnostics. Windows PowerShell can emit **CLIXML** on
  redirected stderr; the platform must tolerate and strip it rather than treat
  it as an error message.

**Length limit.** A default `cmd.exe` shell caps the command line at 8191
characters; UTF-16LE base64 therefore allows roughly a 3 KB payload. The
platform enforces a guard and, above it, writes the script to a temp file and
executes that instead. Payload size is bounded in practice, but the guard must
exist rather than be assumed.

**Constrained Language mode is not supported.** It would restrict the .NET API
use the envelope relies on. Supporting it is a nice-to-have, not a requirement,
and no effort is spent accommodating it; a remote configured that way is
expected to fail with a clear error rather than be worked around.

### 5.3 Operation mapping

| Operation | PowerShell |
|---|---|
| `readFile` | `Get-Content -Raw -LiteralPath` |
| `removeFile` | `Remove-Item -Force -LiteralPath` |
| `isExecutableFile` | `Test-Path -PathType Leaf` + explicit `exit` |
| `touchFile` | `(Get-Item -LiteralPath …).LastWriteTime = Get-Date` |
| `isProcessAlive` | `Get-Process -Id` + `StartTime` identity check |
| `killProcessTree` | `taskkill /PID <pid> /T /F` |
| `pruneOldClis` | `Get-ChildItem \| Sort-Object LastWriteTime -Descending \| Select-Object -Skip <keep> \| Remove-Item -Force` |

### 5.4 CLI install

The Windows CLI artifact is a **`.zip`**, so the POSIX `curl … | tar xz`
pipeline has no analogue:

| | Linux/macOS | Windows |
|---|---|---|
| Artifact | `vscode_cli_<os>_<arch>_cli.tar.gz` | `vscode_cli_win32_<arch>_cli.zip` |
| Binary | `code-insiders` | `code-insiders.exe` |
| Executable bit | `chmod +x` | not applicable |

Sequence: create the install root, download into a temp directory beneath it
(`Invoke-WebRequest -UseBasicParsing -OutFile`), `Expand-Archive -Force`,
`Move-Item -Force` to the commit-keyed name, remove the temp directory.
Extracting into a sibling temp directory preserves the same-volume atomic-rename
property. `cliArchiveName` gains `.exe`; `parseFallbackCliPath` matches the
Windows shapes.

### 5.5 Paths

Paths are built from `$env:USERPROFILE` with backslash separators.
`validateShellToken` / `validateCommit` guards apply unchanged and remain
security-critical.

---

## 6. Detection and ordering

Detection runs **immediately after the SSH connection is established and before
any other remote operation**, because reuse-path operations (reading metadata,
probing liveness, removing stale state) are themselves platform specific.
Previously detection was lazy and ran *after* the reuse probe, which meant POSIX
commands were issued to a Windows machine before it was known to be Windows.

1. **POSIX probe** — a single `uname -s -m` (one round trip, down from two).
2. **Windows probe** — only if the POSIX probe fails or is unparseable. Emits
   `VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=<x64|arm64>`. Architecture comes
   from `PROCESSOR_ARCHITEW6432 ?? PROCESSOR_ARCHITECTURE` so a 32-bit host
   process cannot mis-report an x64 machine.
3. **Neither** — throw the existing "Unsupported remote platform" error, quoting
   both probes' output so the failure is diagnosable.

POSIX is probed first so the pre-existing path costs no extra round trip.

**`remoteAgentHostCommand`.** A custom command **assumes POSIX** and does not run
detection. The override is a development-only escape hatch
(`chat.sshRemoteAgentHostCommand`, tagged experimental) for pointing at a
locally-built agent host, and multi-platform override support is deliberately
out of scope; a later change may add it if a scenario demands it.

This keeps the invariants intact rather than weakening them: the path still
resolves a concrete `PosixRemotePlatform`, so every command it issues — including
the launch wrapper — is built by a platform, and no shell syntax leaks into the
service. It preserves the existing behaviour exactly, including the test
asserting that `uname` never runs on this path.

Because the override is POSIX-only, pointing it at a Windows remote fails with a
raw `bash: The term 'bash' is not recognized` — the same confusing shape as the
bug this work exists to fix. Two cheap mitigations, neither requiring detection:
the setting description states the POSIX-only limitation, and a launch failure
matching that shape is surfaced as a targeted hint instead of a raw shell error.

---

## 7. Security

### 7.1 Security model

This work introduces no new security model; it extends the existing one to
Windows, where it is currently not enforced. The model is derived from the
current implementation:

- **The connection token** is the bearer credential that authenticates
  WebSocket clients to the agent host over loopback
  (`LoopbackAuth::Token`, `cli/src/commands/agent_host.rs`). The agent host
  executes agent operations, so possessing the token confers the ability to act
  as that user on that machine. It is minted and persisted by the CLI
  (`mint_connection_token`).
- **The trust boundary is the user account.** The local endpoint is documented as
  serving "processes running as the same user" (`LOCAL_ENDPOINT.md:4`), and the
  CLI enforces that on POSIX by creating the token file with mode `0600` and its
  directory with `0700` (`agent_host_metadata.rs`, `mint_connection_token`).
- **Therefore the adversary in scope is another unprivileged user account on the
  same remote machine.** Explicitly *out* of scope: a compromised remote host,
  and anyone with root or Administrator rights — both already defeat the POSIX
  protections and are not something file permissions can address.

The obligation is parity: a token-bearing file must be no more readable on
Windows than the `0600`/`0700` the POSIX path deliberately enforces.

### 7.2 Obligations

- **Windows currently has no such protection.** Every permission call in the
  writers is gated `#[cfg(not(windows))]`
  (`cli/src/tunnels/agent_host_metadata.rs:70-88`, `mint_connection_token`), so
  on Windows the token file simply inherits whatever the parent directory grants.
  That is a problem only because the parent is not guaranteed to be
  owner-restricted: `~/<serverDataFolderName>` is created by whichever tool got
  there first, and a profile or directory ACL granting `Users` or `Everyone`
  read access silently exposes the token to any local account — exactly what
  mode `0600` exists to prevent. **This is fixed in the Rust writers**, since the
  CLI is the writer, by applying a protected DACL to the temp file *before*
  atomic replacement.
- **The directory is protected too**, mirroring the POSIX `0700`. A protected
  DACL on the file alone leaves a permissive parent able to delete and replace
  it, which would let another local account redirect the desktop to an endpoint
  of its choosing. Protecting the directory is parity with POSIX, not a new
  requirement.
- **Legacy files are repaired on reuse.** `mint_connection_token` returns an
  existing token before rewriting it (`cli/src/commands/agent_host.rs:720-725`),
  so a file created before this change would otherwise keep its inherited ACL
  forever.
- **Testing this requires new CI.** `cargo test` runs only on Linux
  (`.github/workflows/pr-linux-cli-test.yml`); the Windows CLI pipeline builds
  but never tests. Native Windows `cargo test` execution is added, asserting
  inheritance is disabled and no broad ACEs are present, with both writers
  exercised against a parent directory granting access to Everyone.

### 7.3 Diagnostics must not leak the token

`redactToken` only rewrites `?tkn=` inside URLs
(`sshRemoteAgentHostHelpers.ts:264-266`), so it misses a token embedded in
metadata JSON — and base64 encoding is not redaction. The failure path is
concrete: `sshExec` rejects with

```
SSH command failed (exit ${code}): ${command}\nstderr: ${stderr}
```

which embeds the command verbatim. That message is user-visible — it is the text
quoted in issue #327469.

The naive fix, suppressing commands for sensitive operations, trades one problem
for another: the state-write failure becomes undiagnosable, and on Windows every
message degrades to an opaque base64 blob.

Instead, redaction is **structural**. Operations declare their own secret
substitutions when they build a payload, so redaction knows exactly which spans
are secret rather than guessing by pattern, and the decoded PowerShell is logged
in place of the base64:

| | Before | After |
|---|---|---|
| POSIX state write | `printf %s '{"pid":42,…,"connectionToken":"a1b2c3…"}' > ~/…` | `printf %s '{"pid":42,…,"connectionToken":"***"}' > ~/…` |
| Windows any command | `powershell … -EncodedCommand UwB0AGEAcgB0AC0A…` | `[ps] Set-Content -LiteralPath '…' -Value '{"connectionToken":"***"}'` |

This keeps full diagnostic value — including the readable Windows payload, which
the wire form does not offer — while the token never reaches a log, error, or
telemetry event. `ISshExec` carries the redaction context so `sshExec` honours it
at the point the error is constructed.
- **Injection surface.** Base64 secures only the outer shell; in-payload
  interpolation is escaped by the platform. Remote-supplied paths re-entering a
  command remain gated by `parseFallbackCliPath`, which yields a usable path only
for shapes we recognise.
- **Termination.** PID-only checks are insufficient; see §4.3.

---

## 8. Invariants

- **I1.** No shell syntax outside `node/remotePlatform/` **on the SSH path**.
  WSL composes its own single bootstrap script and drives a `wsl.exe` child
  rather than an SSH channel; it is out of scope here and migrates separately
  (§10).
- **I2.** Every command sent to a Windows remote is an `-EncodedCommand`
  invocation. No bare PowerShell reaches a remote command line.
- **I3.** A platform is *resolved* before any other remote operation — by
  detection on the managed path, or by the fixed POSIX assumption on the
  `remoteAgentHostCommand` path. No command is ever issued without one.
- **I4.** On the managed path the desktop never writes a PID it inferred itself;
  process identity originates from the CLI's supervisor metadata. The
  `remoteAgentHostCommand` path retains the echoed-`$$` mechanism, which is
  correct there: a custom command is typically a foreground dev build that never
  daemonizes and so publishes no metadata to read.
- **I5.** No process is terminated without a verified identity match, and never
  on relay failure alone (§4.3). Unproven identity permits reuse but forbids
  destructive cleanup.
- **I6.** Sensitive payloads never reach logs, errors, or telemetry.
- **I7.** Remote-supplied paths are validated before re-entering a command.
- **I8.** Process identity is an optional additive field within metadata schema
  v1; the schema version is never bumped for it.

---

## 9. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0** | Characterization tests for the launch path (SSH **and** WSL bootstrap: pinned, loose, override). Drive one launch through the real launcher against the mock client so production wiring is covered, not just a builder. Migrate the fake executor to command-matched responses. | Launch commands asserted for the first time; unexpected commands fail loudly. |
| **P1** | Introduce `IRemotePlatform`; extract SSH behaviour into `PosixRemotePlatform`; re-export the naming/validation primitives WSL and `agentHostLockfile.ts` import. **No behaviour change.** | Existing assertions all still hold (see §11 on the harness migration); WSL and local-lockfile tests and typecheck green. |
| **P2** | Detection before all operations on the managed path. **Includes the Windows encoder/envelope foundation**, since the Windows probe is itself an `-EncodedCommand`. Extend `ISshExec` with a sensitive/description contract and stop embedding full commands in errors. | Detection tests pass; no state operation precedes platform resolution; error redaction tested. |
| **P3** | Metadata-timing spike (blocking, see §4.2), then CLI-metadata identity as an additive v1 field, endpoint-liveness probe before any kill, identity-checked tree-kill, and the matching Rust destructive-consumer updates. | Reuse and cleanup correct on POSIX; a second consumer's supervisor survives a relay failure. |
| **P4** | `WindowsRemotePlatform`: paths, zip install, tree-kill, chunked oversized-script path. Rust ACL fix plus native Windows `cargo test` in CI. Payloads executed under real `powershell.exe`, invoked through `cmd.exe /c` as well as directly. | Windows tests pass; ACL asserted against a permissive parent. |
| **P5** | Validate against a real Windows 11 remote. | Manual checklist green. |

P0 precedes P1 because P1's safety claim depends on it: the existing harness
stubs `_startRemoteAgentHost` wholesale, so the launch command has **no**
coverage today and a "pure refactor" could silently change it. P0 also covers
WSL, whose bootstrap script composition is likewise uncovered
(`wslRemoteAgentHostHelpers.ts`) yet imports nine symbols from the module being
refactored — without those tests, "existing tests pass" says nothing about WSL.

**What P0 tests, concretely.** No SSH server, container, or remote machine is
involved. The suite already substitutes a mock SSH client for the transport, so
a "launch" means: call the production launcher, let it build its command string,
hand that string to the mock client, and assert on what the mock received. The
gap being closed is narrow but real — the harness currently overrides
`_startRemoteAgentHost` itself, so the command string is never constructed at
all. P0 removes that override for a small number of tests and lets the real
launcher run against the mock, which is what makes the assertion meaningful
rather than a restatement of a builder's return value. Whether the command is
*valid on a real machine* is not knowable here; that is P4's CI execution and
P5's manual checklist.

P2 absorbs the Windows encoder because invariant I2 cannot otherwise hold: the
Windows detection probe must already be an encoded command. Note the oversized
-script fallback cannot use one oversized command to write itself; it is a
chunked sequence of short encoded commands that creates a secured temp file,
appends to it, executes it, and deletes it.

P3 precedes P4 deliberately — the PID problem is the hardest part of Windows
support, and solving it by deferring to the CLI's own metadata removes it from
the Windows work entirely rather than inventing a Windows-specific answer.

The desktop-side PID retired in P3 is not merely redundant: the foreground
process exits once the readiness sentinel arrives, after which the desktop
overwrites the supervisor's metadata with a PID that is already dead. P3
therefore fixes orphan accumulation on POSIX independently of Windows support.

---

## 10. Out of scope

- **WSL migration.** WSL drives a `wsl.exe` child and composes one bootstrap
  script rather than issuing discrete SSH commands, so its lifecycle differs
  materially. P1 keeps it working by re-exporting the primitives it imports;
  folding it into `IRemotePlatform` is a separate change.
- **Multi-platform `remoteAgentHostCommand`** (§6).
- **CLI-reports-own-PID in the banner.** The supervisor already prints a
  readiness sentinel, and printing its PID and port there too would let the
  desktop skip the metadata round trip on both families. It is deferred rather
  than rejected: it requires a Rust change that only newer CLIs would carry,
  installer can fall back to a pre-existing CLI of unknown vintage whenever the
  commit-pinned download fails (`sshRemoteAgentHostService.ts:1470-1485`).
  The metadata read is therefore needed regardless, and adding the banner field
  now would mean building and maintaining both paths. It becomes attractive once
  a CLI floor can be assumed.

---

## 11. Test strategy

Existing SSH tests drive a fake executor with a scripted response queue and
assert on the literal command strings issued. That design carries over: a
Windows connect flow is testable end-to-end with no Windows machine.

| Layer | What it covers |
|---|---|
| **Operation tests** | Per platform, assert emitted strings and returned values against a fake executor. One snapshot-style `deepStrictEqual` per operation group rather than many fine-grained assertions. |
| **Envelope tests** | Payloads round-trip to the intended PowerShell for inputs containing `'`, `"`, `` ` ``, `$`, `;`, and newlines; the length guard trips to the temp-file path; CLIXML on stderr is tolerated. |
| **Detection tests** | POSIX outputs map correctly; unknown output errors; the Windows probe runs **only** when the POSIX probe fails; no operation precedes detection. |
| **Identity tests** | Liveness and termination respect `startToken`; a recycled PID is never killed; missing identity permits reuse but refuses cleanup; a relay failure alone never kills. |
| **Coexistence test** | Two consumers share one supervisor; a relay failure in one must leave the other's agent host running. |
| **Skew tests** | New desktop / old CLI (no `startToken`) and old desktop / new CLI both behave per §4.4, including when the commit-pinned install fails and a pre-existing CLI of unknown vintage is used instead. |
| **Remote-SSH contract tests** | The shared install root is used by Remote-SSH too: pin the exact Windows filename shape (`code-insiders-<40hex>.exe`), the cleanup and fallback globs, and legacy paths. Cleanup must never match beyond exact quality + 40-hex + extension, and must tolerate an in-use or racing destination. |
| **Connect-flow tests** | A Windows-remote variant of the existing scripted-exec tests asserting no POSIX command is ever emitted, mirroring the existing `assert.ok(!execCalls.some(c => c.includes('uname')))` style. |
| **Regression** | The full existing suite, unmodified, throughout P1 — plus WSL and local-lockfile suites, which share the refactored module. |

**Harness migration.** The fake executor shifts responses from a positional
queue and silently returns success when exhausted
(`sshRemoteAgentHostService.test.ts:38-51`), so a test can pass while issuing a
command nobody scripted. P2 reverses the reuse ordering that `:543-560` asserts
explicitly, and P3 adds round trips, so every queue in roughly forty tests would
shift by hand.

P0 therefore migrates the harness wholesale to command-matched responses that
fail on an unexpected command, rather than preserving the positional arrays for
the sake of an "unmodified files" claim. Keeping both would mean maintaining two
response mechanisms through P2 and P3 and hand-shifting queues anyway — more
churn, and it retains the mechanism that hides missing responses.

The regression guarantee is consequently stated in terms of **assertions, not
file contents**: every existing assertion survives P1 unchanged in meaning,
call-ordering assertions become explicit rather than positional, and no test is
deleted or weakened. That is a stronger guarantee than byte-identical files,
which the queue mechanics would have made impossible to keep past P2 anyway.

**Executing the payloads.** Unit tests prove we emit what we intended, not that
the PowerShell is valid. P4 therefore executes decoded payloads against real
`powershell.exe` on a Windows CI agent, invoked through `cmd.exe /c` as well as
directly — exit codes, encoding, CLIXML and length limits are exactly the
failures that string assertions cannot catch.

**End-to-end verification** against a real remote is P5's manual checklist. It is
deliberately *not* backed by an automated integration test: an SSH-reachable
Windows host is not available to CI, so such a test could never run there, and a
suite that only ever executes on one engineer's machine decays silently. The
checklist is the deliverable. If a Windows SSH remote later becomes available to
CI, an `.integrationTest.ts` gated on `VSCODE_TEST_SSH_WINDOWS_HOST` is the
natural follow-up.

---

## 12. Pre-existing defects addressed

Two defects in the current implementation are corrected by P3. Both are
independent of Windows support and affect Linux and macOS today; they are
recorded here because they widen this work's blast radius and its review
surface.

### D1 — The desktop overwrites supervisor metadata with a dead PID

`code agent host` daemonizes a supervisor, which writes its own metadata. The
foreground process exits once the readiness sentinel arrives, after which the
desktop overwrites that metadata with the foreground PID
(`sshRemoteAgentHostService.ts:762-768`), captured via `echo VSCODE_PID=$$`
(`:330`).

The recorded process is therefore already gone. The reuse probe reads the
metadata, finds a dead PID, and starts a fresh agent host even though a live
supervisor is present — so supervisors accumulate across reconnects.

The consequence is a resource leak rather than a malfunction: the new supervisor
binds a free port (`--port 0`) and mints its own token, so sessions work
normally, while the previous supervisor is left running with nothing referencing
it.

This is derived from reading the code, not from an observed failure. It is not
separately validated because doing so would mean deliberately reproducing the
broken behaviour, and P3 removes the mechanism entirely: identity comes from the
supervisor's own metadata, so there is no desktop-written PID left to be stale.
P3's own tests assert the corrected behaviour directly — that a live supervisor
is reused rather than duplicated — which is the property we actually care about.

Corrected by taking identity from the supervisor's own metadata (§4.2).

### D2 — Relay failure can terminate a supervisor shared with other features

The supervisor is shared and outlives any individual invocation
(`cli/src/commands/agent_host.rs`); `code tunnel`, WSL, and other desktops reuse
it. When the WebSocket relay fails to connect, the current fallback kills
whatever the lockfile names (`sshRemoteAgentHostService.ts:782-800`).

D1 masks this: the PID on record is usually dead, so the kill is usually a
no-op. Fixing D1 alone would make this reliably destructive — a transient relay
failure would tear down an agent host another consumer is actively using. The
two defects must therefore be fixed together, which is why §4.3 requires an
independently proven-dead endpoint and a verified identity before any
termination.

Both defects are fixed as part of this work rather than split out. They are not
separable in practice — D1 masks D2, and correcting either alone is unsafe — and
the platform work has to touch this exact code anyway, so a standalone fix would
mean rewriting the same call sites twice.
