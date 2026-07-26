<!--
  REMOTE_PLATFORM.md
  Living spec — keep in sync with code after each significant change.
  See: node/remotePlatform/, node/sshRemoteAgentHostService.ts,
       node/sshRemoteAgentHostHelpers.ts, cli/src/commands/agent_host.rs.
-->

# Remote Platform Abstraction

> **Status: PLANNED**

Connecting an agent host to a remote machine requires operating on that machine:
detect what it is, install the VS Code CLI, and launch `code agent host`. Each of
those steps is operating system specific, and the current implementation assumes
POSIX throughout — which is why a Windows remote fails on `uname -s`.

This document specifies `IRemotePlatform`, the strategy that owns all OS-specific
remote behaviour, so the SSH transport contains no shell syntax of its own.

---

## 1. Mental model

| Term | What it is |
|------|-----------|
| **Remote platform** | A strategy performing semantic operations ("is this file executable", "install the CLI") against a remote of one OS family, using an injected executor. |
| **Executor** (`ISshExec`) | Sends a command string, returns `{ stdout, stderr, code }`. Knows nothing about shells or operating systems. |
| **Supervisor** | The detached, long-lived process `code agent host` daemonizes. It owns the agent host's lifecycle. |

### Principles

- **Operations, not command strings.** The platform exposes
  `isExecutableFile(exec, path)`, not `isExecutableFileCommand(): string`.
  Exit-code interpretation is OS-specific — Windows `Test-Path` prints `False`
  and exits `0` — so the platform must own execution, not hand strings to a
  caller.
- **The CLI owns the agent host lifecycle.** See §4. This is the decision that
  keeps this design small.
- **One place per OS.** Adding an OS means adding one implementation, not editing
  twenty call sites.
- **Escaping belongs to the platform.** Cross-platform escaping helpers are a
  trap and must not exist.

### Layering

```
sshRemoteAgentHostService ──uses──▶ IRemotePlatform ──▶ PosixRemotePlatform (Linux, macOS)
        │                                 └──────────▶ WindowsRemotePlatform
        └──uses──▶ detectRemotePlatform(exec)
```

`IRemotePlatform` receives an `ISshExec` per call and never imports the SSH
transport, so it is unit-testable against the existing fake executor.

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
 * A remote path. Opaque because a plain string cannot distinguish a literal
 * path from a trusted shell expression: POSIX paths deliberately carry an
 * unquoted `~` for the remote shell to expand, while a Windows
 * `$env:USERPROFILE` fragment passed to `-LiteralPath` as a quoted value would
 * not expand at all. Each platform renders its own paths from validated
 * components; the type keeps callers from constructing one by concatenation.
 */
export interface IRemotePath { readonly _brand: 'remotePath'; }

/**
 * A launch target. Structured rather than a command string because
 * PowerShell's `&` does not split an executable-plus-arguments string and
 * `Invoke-Expression` would reintroduce injection.
 *
 * `executable` is an absolute remote path — never resolved against `PATH`,
 * since the desktop knows exactly which binary it installed. `args` are
 * *logical* arguments, unquoted and unescaped exactly as the process should
 * receive them; the platform quotes them when rendering.
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
	 * selecting the CLI binary name (`code`, `code-insiders`, …).
	 * `serverDataFolderName` is a folder *name*, not a path — e.g.
	 * `.vscode-server`; `installRoot` turns it into a path under the remote home.
	 */
	cliArchiveName(quality: string): string;
	installRoot(serverDataFolderName: string): IRemotePath;
	cliDataDir(serverDataFolderName: string): IRemotePath;
	cliBin(serverDataFolderName: string, quality: string, commit?: string): IRemotePath;

	/**
	 * Parse a candidate path returned by the remote. This is the trust
	 * boundary: remote output arrives as an untrusted `string`, and only
	 * recognised shapes become an `IRemotePath` that may re-enter a command.
	 * Returning a parsed value rather than a boolean means an unvalidated
	 * string is unusable as a path by construction.
	 */
	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): IRemotePath | undefined;

	/** CLI installation and discovery */
	isExecutableFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	touchFile(exec: ISshExec, path: IRemotePath): Promise<boolean>;
	versionCheck(exec: ISshExec, cliBin: IRemotePath): Promise<boolean>;
	installCli(exec: ISshExec, options: { url: string; installRoot: IRemotePath; cliBin: IRemotePath }): Promise<void>;
	pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void>;
	findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly IRemotePath[]>;

	/** Launch */
	buildLaunchCommand(spec: IRemoteLaunchSpec): string;

	/**
	 * Wrap a raw, user-supplied command (`remoteAgentHostCommand`) for remote
	 * execution. Separate from `buildLaunchCommand` because the input is an
	 * opaque command string rather than an executable plus arguments, and
	 * because it carries a POSIX-only contract (§6). Lives on the interface so
	 * that its shell wrapper does not leak into the service (I1);
	 * `WindowsRemotePlatform` rejects it.
	 */
	buildRawLaunchCommand(command: string): string;
}
```

Every operation supplies a **safe description** — a short, secret-free string
naming what it was doing — which `ISshExec` carries and errors are constructed
from. This is what replaces quoting the raw command (§7.3), and it must exist on
the execution contract rather than being bolted on later, since `sshExec` builds
its rejection message at the transport.

There is deliberately no metadata, liveness or termination operation. See §4.

---

## 3. POSIX implementation

`PosixRemotePlatform` is a single class covering Linux and macOS, preserving the
existing behaviour exactly.

There is no Linux/Darwin subclass split, because no divergence exists to model:
the current commands are already written to be portable and say so — `ls -1t`
"sorts by mtime newest-first on both Linux (coreutils) and macOS (BSD)", and
`xargs -I{}` "skips the command entirely on empty input on both GNU and BSD
`xargs`" (`sshRemoteAgentHostHelpers.ts:192-202`). The abstraction is what makes
such a split cheap later: one subclass overriding what differs, with no call site
changed.

---

## 4. Lifecycle: the CLI owns it

`code agent host` is not a single process. The foreground invocation re-execs
itself detached with `VSCODE_AGENT_HOST_SUPERVISOR` set
(`cli/src/commands/agent_host.rs`); the detached **supervisor** binds the
listener, prints `__VSCODE_AGENT_HOST_READY__`, then redirects its own stdio to
null. The foreground **always exits at the readiness sentinel** — there is no
streaming mode and no `--detach` flag, though stale comments in those sources
still mention one.

Critically, the foreground already decides *whether a supervisor is needed*: it
classifies the lockfile and either reuses the live supervisor or spawns a fresh
one (`cli/src/commands/agent_host.rs`). **Both paths print the same banner** —
`print_reuse_banner` and the fresh-spawn path both call
`output::print_network_lines`, emitting the `ws://127.0.0.1:PORT[?tkn=TOKEN]`
line the desktop already parses (`extractAgentHostWebSocketURL`).

**The desktop therefore invokes `code agent host` and consumes its machine-readable
output.** That is the whole protocol.

The human banner alone is *not* a sufficient contract. It always prints
`ws://localhost:<port>` regardless of what the supervisor actually bound to
(`cli/src/commands/output.rs`), and the desktop's parser normalises that to
`127.0.0.1` — so reusing a supervisor started with `--host ::1` or a specific
address would leave the desktop dialling the wrong endpoint forever. The metadata
file carried a `host` field for exactly this reason, and the desktop read it
through `dialAgentHostHost`.

The CLI therefore emits a **single machine-readable line** alongside the banner,
carrying the dial host, port and token, on both the fresh-spawn and reuse paths.
That keeps "consume the output" as the protocol while restoring the information
the metadata read used to supply, and it handles IPv6 literals rather than
assuming loopback.

Consequences, which are the point of this design:

- **The desktop never writes agent host metadata.** The supervisor owns that
  file. Writing a shell's `$$` over it records a process that has already exited
  and clobbers authoritative state.
- **The desktop never terminates a remote process.** The supervisor is shared —
  it "is shared and outlives any individual invocation" — and `code tunnel`, WSL
  and other desktops reuse it. Killing on a relay failure can tear down an agent
  host another consumer is using. A relay failure now surfaces a retryable error
  and destroys nothing.

This removes the desktop-side lockfile read, write and cleanup paths, and with
them the need for process identity, liveness probing, tree-kill and metadata
schema changes. It also fixes two pre-existing defects by deletion rather than by
adding machinery to make them safe.

**Cost.** Reconnects that previously reused a live agent host skipped platform
detection and the CLI install check entirely. They no longer do, so the saving is
several SSH round trips rather than one command. That is the price of not
maintaining a second, divergent copy of the CLI's lifecycle logic, and it is paid
on an already-established connection.

**Timeouts must agree.** The desktop currently gives the launch 60 seconds
(`sshRemoteAgentHostService.ts:343-348`) while the CLI allows five minutes for the
supervisor to report ready and does network work before printing anything. On a
first connect over a slow link the desktop would give up while the CLI is still
working. The desktop's budget is raised to match the CLI's.

---

## 5. Windows implementation

### 5.1 Transport encoding

Windows OpenSSH may be configured with `cmd.exe`, `powershell.exe`, or `pwsh` as
the default shell. Quoting rules differ across all three and the configured shell
is not knowable up front.

**Every Windows command is sent as:**

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64-UTF16LE>
```

The base64 alphabet (`A-Z a-z 0-9 + / =`) contains no shell metacharacter, so the
outer command line is inert under `cmd.exe`, PowerShell and `sh` alike. This
removes default-shell ambiguity and eliminates outer-shell quoting as a class of
bug. `powershell.exe` is used rather than `pwsh` because it is present on every
supported Windows install.

Base64 protects only the *outer* shell; values interpolated **inside** the
payload are escaped by the platform.

Constrained Language mode is **not supported** — it would restrict the .NET use
the envelope relies on. A remote configured that way fails with a clear error
rather than being worked around.

### 5.2 Payload envelope

Every payload uses one envelope so the executor's contract is identical across
platforms:

- `$ErrorActionPreference = 'Stop'` and an explicit `exit <n>`; predicates emit
  an explicit exit code rather than relying on output (`Test-Path` prints `False`
  and exits `0`).
- **`$ProgressPreference = 'SilentlyContinue'`.** With stderr redirected — which
  it always is over an SSH exec channel — Windows PowerShell serialises every
  progress record as CLIXML onto stderr, and `-UseBasicParsing` does not suppress
  it. Measured on the real CLI artifact (9.5 MB): default progress took 13,125 ms
  and pushed **342 KB of CLIXML** back over the channel; with progress silenced,
  844 ms and zero stderr. A 15x cost, paid on exactly the slow first connect §13
  worries about. This belongs in the envelope rather than the install payload,
  because progress records fire for unrelated cmdlets too.
- **Native executables propagate their own exit code.** `$ErrorActionPreference`
  governs cmdlets and does *not* turn a failing `.exe` into a PowerShell error,
  so any payload invoking a native binary ends with `exit $LASTEXITCODE`.
  Without this a failed `--version` check reports success.
- `[Console]::OutputEncoding` pinned to UTF-8, since the transport decodes UTF-8.
- Windows PowerShell can emit **CLIXML** on redirected stderr; it is decoded into
  readable text, not discarded.

Payloads are small — the largest is the install sequence — and are expected to
stay well inside `cmd.exe`'s 8191-character command line. If a payload ever
approaches that limit the correct response is to split the operation into several
executions, not to build a chunked script-upload mechanism for a limit nothing
currently reaches.

### 5.3 Operation mapping

| Operation | PowerShell |
|---|---|
| `isExecutableFile` | `Test-Path -PathType Leaf` + explicit `exit` |
| `touchFile` | `(Get-Item -LiteralPath …).LastWriteTime = Get-Date` |
| `versionCheck` | invoke the binary, `exit $LASTEXITCODE` |
| `pruneOldClis` | enumerate, sort by `LastWriteTime`, skip the newest `<keep>`, delete the rest **per-item best-effort** |

`pruneOldClis` is the one operation that must not honour the envelope's
`ErrorActionPreference = 'Stop'`. A naive
`… | Select-Object -Skip <keep> | Remove-Item -Force` pipeline raises a
terminating error on the first locked binary and abandons every candidate after
it — measured with six commit-keyed binaries and `keep = 2`, with the fourth
running: exit code 1, and two binaries that should have been deleted survived
permanently, leaking ~10 MB per desktop build thereafter.

This is reachable in the design's own steady state, not a corner case: §4 makes
the supervisor long-lived, so it holds its own (older, commit-keyed) binary
mapped while the desktop rotates builds. The `touchFile` mtime guard does not
help — setting `LastWriteTime` on a running executable succeeds, so prune runs
anyway. POSIX has no equivalent problem: `rm` of a running binary succeeds, and
the command is deliberately written as `xargs -I{} rm -f -- {} 2>/dev/null; true`
and invoked with `ignoreExitCode`.

The payload therefore deletes each candidate individually with the error
suppressed and ends with `exit 0`, matching the POSIX best-effort contract.

### 5.4 CLI install

The Windows CLI artifact is a **`.zip`**, so the POSIX `curl … \| tar xz` pipeline
has no analogue:

| | Linux/macOS | Windows |
|---|---|---|
| Artifact | `vscode_cli_<os>_<arch>_cli.tar.gz` | `vscode_cli_win32_<arch>_cli.zip` |
| Binary | `code-insiders` | `code-insiders.exe` |
| Executable bit | `chmod +x` | not applicable |

Sequence: create the install root, download into a temp directory beneath it
(`Invoke-WebRequest -UseBasicParsing -OutFile`), `Expand-Archive -Force`, then
replace the commit-keyed destination and remove the temp directory. The archive
contains exactly one flat entry, `code-insiders.exe`, so nothing has to be
flattened.

**The replace must actually be atomic.** `Move-Item -Force` is *not* an atomic
replace on Windows: it deletes the destination and then moves, so there is a
window in which the destination does not exist, and it fails outright when the
destination cannot be deleted. Measured: with the destination held open,
`Move-Item -Force` raises `Cannot create a file when that file already exists`
and leaves both source and destination in place — which also proves the
delete-then-move implementation. `Remove-Item` on a running `.exe` likewise
fails with access denied.

The POSIX path depends on rename atomicity for concurrency safety and says so:
"Concurrent SSH sessions racing here both end up with a valid binary for the same
commit" (`sshRemoteAgentHostService.ts:1443-1446`). Windows therefore uses a
genuine atomic replace (`File.Replace`, or `MoveFileEx` with
`MOVEFILE_REPLACE_EXISTING`), and treats "destination already exists and passes
its version check" as success rather than an error. Reachable concurrently:
two windows or profiles on one desktop installing the same commit, a supervisor
already launched from the destination binary, an antivirus scanner holding it, or
Remote-SSH working in the shared install root.

**Naming.** The extension belongs to the *file*, not the archive stem, so the
commit-keyed name is `code-insiders-<40hex>.exe` — never
`code-insiders.exe-<40hex>`. `cliArchiveName` returns the stem and the platform
appends its own extension, keeping construction and parsing symmetrical.

### 5.5 Paths

Paths are built from `$env:USERPROFILE` with backslash separators. The
`validateShellToken` / `validateCommit` guards apply unchanged and remain
security-critical.

### 5.6 The supervisor must survive the exec channel

This is the one change without which nothing else on Windows matters.

The supervisor is spawned with `CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW`
(`cli/src/util/command.rs:181`). Neither flag escapes a **Windows Job Object**.
Win32-OpenSSH runs each exec channel's process tree in a job, and the foreground
`code agent host` exits at readiness — so the job can be torn down and take the
detached supervisor with it, moments after it printed its endpoint.

The supervisor spawn therefore becomes job-aware, adding
`CREATE_BREAKAWAY_FROM_JOB`. The repository already has exactly this pattern for
the server child, including a probe for whether breakaway is allowed
(`cli/src/tunnels/code_server.rs:641-649,942-950`) — the probe is a test spawn of
`cmd /C echo ok` carrying the flag, since `CreateProcess` fails with access
denied when the job lacks `JOB_OBJECT_LIMIT_BREAKAWAY_OK`.

**This is measured, not inferred.** Against a Win32-OpenSSH *exec* channel:

```
in_job=True   limit_flags=0x00002800
flag_breakaway_ok=True   flag_silent_breakaway_ok=False   flag_kill_on_job_close=True
```

and, after the channel closed, of two children spawned `DETACHED_PROCESS` with
their std handles on `NUL`:

```
child_plain      DEAD    <- reaped with the job
child_breakaway  ALIVE
```

Two consequences follow. **Detachment alone does not save a process** — the plain
child was fully detached and still died, so redirecting stdio and daemonizing, as
the supervisor already does, is not sufficient. And because
`SILENT_BREAKAWAY_OK` is clear while `BREAKAWAY_OK` is set, the flag has to be
passed explicitly; nothing happens automatically.

The job permits breakaway, so this is the two-line change and no fallback is
required. Should a remote ever be configured with breakaway denied, the probe
above returns false and the correct response is to fail the connection with an
actionable error rather than let the agent host die seconds later for no visible
reason.

This failure mode is invisible to unit tests and to a local PowerShell run: it
requires a real Win32-OpenSSH exec channel, which is how it went unnoticed
through five design reviews. §13 verifies it first, because every other Windows
behaviour depends on the supervisor still being alive.

---

## 6. Detection and ordering

Platform detection runs immediately after the SSH connection is established and
before any managed operation, because those operations are platform specific.

1. **POSIX probe** — a single `uname -s -m` (one round trip, down from two).
2. **Windows probe** — only if the POSIX probe fails or is unparseable. An
   encoded payload emits `VSCODE_REMOTE_OS=win32 VSCODE_REMOTE_ARCH=<x64|arm64>`.
   Architecture comes from `PROCESSOR_ARCHITEW6432 ?? PROCESSOR_ARCHITECTURE` so
   a 32-bit host process cannot mis-report an x64 machine.
3. **Neither** — fail with the unsupported-platform error, quoting both probes'
   output so the failure is diagnosable.

POSIX is probed first so the pre-existing path costs no extra round trip. The
probes themselves are the one exception to platform-owned commands: they run
before a platform exists, which is what they are for.

**`remoteAgentHostCommand`** assumes POSIX and skips detection. This dev-only
escape hatch (`chat.sshRemoteAgentHostCommand`) points at a locally-built agent
host; multi-platform override support is deliberately out of scope. The path
still resolves a concrete `PosixRemotePlatform` and renders its launch through
`buildRawLaunchCommand`, so no shell syntax leaks into the service. Pointing it
at a Windows remote fails with a raw `bash` error, so the setting description
states the limitation and that failure shape is surfaced as a targeted hint.

---

## 7. Security

### 7.1 Model

This work introduces no new security model; it extends the existing one to
Windows, where it is not currently enforced.

- **The connection token** is the bearer credential authenticating clients to the
  agent host over loopback (`LoopbackAuth::Token`). The agent host executes agent
  operations, so possessing the token confers the ability to act as that user.
- **The trust boundary is the user account.** The local endpoint serves
  "processes running as the same user" (`LOCAL_ENDPOINT.md:4`), and the CLI
  enforces that on POSIX with mode `0600` files in a `0700` directory.
- **The adversary in scope is another unprivileged user account on the same
  remote machine.** Out of scope: a compromised remote host, and anyone with root
  or Administrator rights — both already defeat the POSIX protections.

The obligation is parity: token-bearing files must be no more readable on Windows
than the `0600`/`0700` the POSIX path enforces.

### 7.2 Obligations

- **Windows has no such protection today.** Every permission call in the writers
  is gated `#[cfg(not(windows))]` (`cli/src/tunnels/agent_host_metadata.rs:70-88`,
  `mint_connection_token`), so the token file inherits whatever the parent grants
  — and `~/<serverDataFolderName>` is created by whichever tool got there first.
  Fixed in the **Rust writers**, since the CLI is the writer, by applying a
  protected DACL before atomic replacement, and by protecting the containing
  directory as the POSIX `0700` does.
- **Both files are token-bearing.** The metadata file carries `connection_token`
  in the same struct as the separate token file, so both are covered.
- **Legacy files are repaired before they are trusted, not merely on write.**
  `mint_connection_token` returns an existing token before rewriting it
  (`cli/src/commands/agent_host.rs:720-725`), but more importantly the **reuse
  path returns before either writer runs**: a supervisor started before this
  change keeps its inherited ACL for as long as it lives, and repairing only in
  the writers would never reach it. Reuse therefore validates the ACLs of the
  metadata and token files first, and refuses to reuse — reporting an actionable
  error — when they are readable beyond the owner. Otherwise a world-writable
  legacy lockfile could also redirect the desktop to an endpoint chosen by
  another local account.
- **The validator must resolve the *supervisor's* token file, not its own.**
  This is the subtle part. The metadata lives under a canonical agent-host root
  that ignores `--cli-data-dir` (`cli/src/state.rs`), but the token is written
  under `--cli-data-dir` itself. The invoking process only knows *its own*
  data dir, and `AgentHostMetadata` records neither the launcher root nor the
  token path — so when a supervisor was started with a different data dir, the
  validator would happily check a stale file belonging to a dead supervisor,
  pass, and never look at the live one's token at all.
  That divergence is not hypothetical: the desktop passes
  `--cli-data-dir ~/<serverDataFolderName>/cli`, while `code tunnel` and a bare
  `code agent host` use the default root — and cross-tool reuse is precisely the
  scenario §4 is built around.
  The lockfile therefore records the supervisor's launcher root, and validation
  resolves the token path from that record. If the recorded root is absent — an
  older supervisor — reuse is refused with an actionable error rather than
  silently trusting an unvalidated token.
- **The install boundary is protected.** We execute the binary we install, so
  another local account with modify rights on a permissive install root could
  replace it between install and launch; `--version` proves it runs, not that it
  is ours. One protected installation boundary covers the root, the extraction
  temp directory and the final executable.
- **Testing requires native Windows Rust tests.** `cargo test` runs only on Linux
  (`.github/workflows/pr-linux-cli-test.yml`). Focused ACL tests are added to a
  Windows CLI job, asserting inheritance is disabled and no broad ACEs are
  present, exercised against a parent granting `Everyone`.

### 7.3 Diagnostics must not leak secrets

`sshExec` embeds the full command in its rejection message, which is
user-visible — it is the text quoted in issue #327469. On Windows that command is
an opaque base64 blob, which is useless to a reader and may carry secrets.

Raw wire commands are therefore never surfaced. Each operation supplies a **safe
description** used in errors and logs instead, and the existing `redactToken`
continues to scrub tokens from streamed CLI banner output. Because the desktop no
longer writes metadata (§4), no desktop-issued command carries the connection
token at all.

---

## 8. Invariants

- **I1.** No shell syntax outside `node/remotePlatform/` on the SSH path. WSL
  composes its own bootstrap script and drives a `wsl.exe` child; it is out of
  scope (§10).
- **I2.** Every post-detection operation on a Windows remote is an
  `-EncodedCommand` invocation.
- **I3.** No operation other than detection itself runs before the platform is
  resolved.
- **I4.** On the managed path the desktop never writes agent host metadata and
  never terminates a remote process. The `remoteAgentHostCommand` override is
  exempt: it launches an arbitrary process that implements none of this protocol,
  and is dev-only (§6).
- **I5.** Raw wire commands never reach logs, errors or telemetry; secrets never
  appear in either.
- **I6.** Remote-supplied paths are validated by `parseFallbackCliPath` before
  re-entering a command.

---

## 9. Delivery phases

The work lands as a **single pull request**; phases sequence the commits.

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0** | Characterize the launch path (SSH managed launch, raw override, WSL bootstrap) by driving the real launcher against the mock client. Make the fake executor fail loudly on unexpected or exhausted responses. | Launch commands asserted for the first time. |
| **P1** | Introduce `IRemotePlatform`; extract POSIX behaviour; re-export the primitives WSL and `agentHostLockfile.ts` import. **No behaviour change.** | Existing assertions hold; WSL and local-lockfile suites and typecheck green. |
| **P2** | Detection before managed operations, including the Windows encoder foundation the probe needs. Delegate the lifecycle to the CLI: add its machine-readable endpoint line, remove desktop-side metadata write, reuse probe and cleanup-kill, and align the launch timeout. | POSIX connect and reconnect work with no desktop-written metadata, dialling the endpoint the CLI reports. |
| **P3** | `WindowsRemotePlatform`: paths, zip install, envelope. Job-object breakaway for the supervisor (§5.6). Rust ACL fix with native Windows tests. Diagnostics (§12). Payloads executed under real `powershell.exe`, via `cmd.exe /c` as well as directly. | Windows tests pass; ACL asserted against a permissive parent. |
| **P4** | Validate against a real Windows 11 remote using the §12 checklist. | Checklist green. |

P0 precedes P1 because P1's safety claim depends on it: the harness stubs
`_startRemoteAgentHost` wholesale, so the launch command has no coverage today
and a "pure refactor" could silently change it. WSL is included because it
imports nine symbols from the module being refactored.

P2 delegates the lifecycle *before* Windows work begins, so the Windows platform
never has to implement metadata, liveness or termination at all.

---

## 10. Out of scope

- **WSL migration.** WSL drives a `wsl.exe` child and composes one bootstrap
  script rather than issuing discrete SSH commands. P1 keeps it working by
  re-exporting the primitives it imports; folding it into `IRemotePlatform` is a
  separate change.
- **Multi-platform `remoteAgentHostCommand`** (§6).
- **Desktop-side agent host reuse without invoking the CLI.** A read-only
  metadata fast path would avoid several round trips per reconnect; it is not
  worth a second copy of the CLI's lifecycle rules.
- **Restarting a remote agent host from the desktop.** `--replace` exists in the
  CLI, but no service API exposes restart, and running it over the *current* SSH
  client would kill the supervisor, close the relay, and dispose the client that
  issued the command. Doing this properly needs a separate connection and a
  defined sequence. "Reconnect" replaces the relay only, and server update goes
  through the existing upgrade RPC, so nothing regresses by leaving this out.
- **PID-reuse hardening inside the CLI.** `classify_agent_host_lockfile` treats
  any live PID as the supervisor (`cli/src/tunnels/agent_host.rs`), so a recycled
  PID can be reused or, under `--replace`, killed. The desktop's own liveness
  check was equally weak, so this design depends on an existing limitation rather
  than introducing one — but it is now the only such check, and worth fixing in
  the CLI separately.
- **Serialising concurrent first connects.** Classification and spawn are not
  interlocked, so two simultaneous first connects can each spawn a supervisor and
  race on the metadata write, which is only warned about on failure. Pre-existing
  and CLI-internal; a startup lock belongs with the PID-reuse fix.
- **Capability gating of unsupported launchers.** A fallback CLI is accepted on a
  bare `--version` success, so a sufficiently old binary need not implement the
  machine-readable output §4 relies on. The desktop must degrade to the human
  banner and report clearly rather than assume; a version or capability gate is
  the durable fix.

---

## 11. Test strategy

Existing SSH tests drive a fake executor with scripted responses and assert on
the literal command strings issued, so a Windows connect flow is testable
end-to-end with no Windows machine.

| Layer | What it covers |
|---|---|
| **Operation tests** | Per platform, assert emitted strings and returned values against the fake executor, snapshot-style per operation group. |
| **Envelope tests** | Payloads round-trip to the intended PowerShell for inputs containing `'`, `"`, `` ` ``, `$`, `;` and newlines; native exit codes propagate; CLIXML on stderr is decoded. |
| **Detection tests** | POSIX outputs map correctly; unknown output errors; the Windows probe runs only when the POSIX probe fails; no managed operation precedes resolution. |
| **Lifecycle tests** | The desktop issues no metadata write and no kill; a relay failure surfaces a retryable error and destroys nothing. |
| **Remote-SSH contract tests** | The install root is shared with Remote-SSH: pin the Windows filename shape (`code-insiders-<40hex>.exe`), the cleanup and fallback globs, and legacy paths. Cleanup must never match beyond exact quality + 40-hex + extension. |
| **Regression** | The existing suite throughout P1, plus WSL and local-lockfile suites, which share the refactored module. |

The fake executor currently shifts responses from a positional queue and silently
returns success when exhausted (`sshRemoteAgentHostService.test.ts:38-51,91`), so
a test can pass while issuing a command nobody scripted. P0 makes exhaustion and
unexpected commands fail; queues are migrated where the phases actually reorder
them, not wholesale.

**Executing the payloads.** Unit tests prove we emit what we intended, not that
the PowerShell is valid. P3 executes decoded payloads against real
`powershell.exe` on a Windows CI agent, through `cmd.exe /c` as well as directly.
End-to-end verification against a real remote is P4's manual checklist; there is
no automated substitute, because CI has no SSH-reachable Windows host and a suite
that only runs on one machine decays silently.

---

## 12. Diagnostics and strings

A Windows remote is a first-time path, so failures must say what went wrong and
where. Each stage produces a distinct, localized message rather than a raw shell
error:

| Stage | Surfaced as |
|---|---|
| Detection | Remote OS could not be determined; both probes' output quoted |
| PowerShell missing | `powershell.exe` not found on the remote |
| Download / extract | CLI download or unpack failed, with the URL but no secrets |
| Launch | Agent host exited before becoming ready |

All new user-facing strings go through `nls.localize`, including the POSIX-only
hint for `remoteAgentHostCommand` (§6). The
`chat.sshRemoteAgentHostCommand` setting description gains that limitation.

---

## 13. Validation checklist

Run against a real Windows 11 remote (§11).

1. **Supervisor survives the exec channel.** Connect, confirm the agent host is
   still running after the launching command has exited, and that the relay stays
   usable. This is §5.6 and is the first thing to check — every other item
   assumes it.
2. **First connect**, no CLI present: detection, download, extract, launch,
   session usable.
3. **Reconnect**: the CLI reuses its supervisor; no second one appears.
4. **Reuse reports the real endpoint**: a supervisor bound to a non-loopback or
   IPv6 address is dialled correctly, not assumed to be `127.0.0.1`.
5. **Default shell `cmd.exe`** and **default shell PowerShell** both work.
6. **Profile path containing a space and an apostrophe** installs and launches.
7. **Relay failure** with a healthy agent host leaves the supervisor running and
   surfaces a retryable error.
8. **ACL**: metadata and token files are owner-only, verified against a parent
   granting `Everyone`; a pre-existing insecure supervisor is refused with an
   actionable error rather than silently trusted. Verify with a **divergent
   `--cli-data-dir`** — reuse a supervisor started by `code tunnel` — so the
   validator is proven to resolve *that* supervisor's token file, not its own.
9. **Retention survives a locked binary**: with the running supervisor's own
   commit-keyed binary among the prune candidates, older ones are still removed
   and the operation reports success.
10. **Concurrent install**: two connects installing the same commit at once both
    end with a working binary and no error.
11. **Failure output** carries no secrets and no raw wire commands.
12. **Slow first connect** does not hit the desktop timeout while the CLI is
    still downloading, and the install does not flood stderr with progress
    CLIXML.
13. **POSIX regression**: a Linux remote still connects and reconnects.
